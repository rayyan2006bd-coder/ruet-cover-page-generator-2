import { CaretSortIcon, CheckIcon } from '@radix-ui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { matchSorter } from 'match-sorter';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  bundledIpeCourseDetails,
  bundledIpeCourses,
} from '@/data/bundled-courses';
import { cn } from '@/lib/utils';
import { syncPublishedDataset } from '@/services/api/dataset';
import { getActiveDirectoryDataset } from '@/services/local/database';
import editor from '@/store/editor';

export function CourseDirectory() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [stableKey, setStableKey] = useAtom(editor.courseStableKey);
  const code = useAtomValue(editor.courseNo);
  const title = useAtomValue(editor.courseTitle);
  const teacherName = useAtomValue(editor.teacherName);
  const setCode = useSetAtom(editor.courseNo);
  const setTitle = useSetAtom(editor.courseTitle);
  const setDepartmentKey = useSetAtom(editor.courseDepartmentKey);
  const setDepartment = useSetAtom(editor.courseDepartment);
  const setSource = useSetAtom(editor.courseSource);
  const setTeacherName = useSetAtom(editor.teacherName);
  const setTeacherDesignation = useSetAtom(editor.teacherDesignation);
  const setTeacherDepartment = useSetAtom(editor.teacherDepartment);
  const setTeacherStableKey = useSetAtom(editor.teacherStableKey);
  const setTeacherSource = useSetAtom(editor.teacherSource);

  const cachedQuery = useQuery({
    queryKey: ['directory-release', 'cached'],
    queryFn: getActiveDirectoryDataset,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const syncedQuery = useQuery({
    queryKey: ['directory-release', 'synced'],
    queryFn: ({ signal }) => syncPublishedDataset(signal),
  });
  const dataset = syncedQuery.data ?? cachedQuery.data;
  const courses = useMemo(() => {
    const coursesByCode = new Map(
      bundledIpeCourses.map((course) => [course.normalizedCode, course]),
    );
    for (const course of dataset?.courses ?? []) {
      coursesByCode.set(course.normalizedCode, course);
    }
    return [...coursesByCode.values()].sort((left, right) =>
      left.code.localeCompare(right.code, undefined, { numeric: true }),
    );
  }, [dataset]);
  const matches = useMemo(
    () =>
      (query
        ? matchSorter(courses, query, {
            keys: ['code', 'title', 'departmentName', 'departmentKey'],
          })
        : courses
      ).slice(0, 30),
    [courses, query],
  );
  const selectedCourse = courses.find(
    (course) => course.stableKey === stableKey,
  );

  useEffect(() => {
    if (stableKey && dataset && !selectedCourse) {
      setStableKey('');
      setDepartmentKey('');
      setSource('manual');
      return;
    }
    if (
      selectedCourse &&
      (selectedCourse.code !== code || selectedCourse.title !== title)
    ) {
      setStableKey('');
      setDepartmentKey('');
      setSource('manual');
    }
  }, [
    code,
    dataset,
    selectedCourse,
    setDepartmentKey,
    setSource,
    setStableKey,
    stableKey,
    title,
  ]);

  const selectCourse = (courseKey: string) => {
    const course = courses.find((item) => item.stableKey === courseKey);
    if (!course) return;
    setCode(course.code);
    setTitle(course.title);
    setDepartmentKey(course.departmentKey);
    setDepartment(course.departmentName);
    setSource('directory');
    setStableKey(course.stableKey);

    if (!teacherName && dataset) {
      const suggestion = dataset.courseTeachers
        .filter(
          (relationship) =>
            relationship.courseKey === course.stableKey && relationship.active,
        )
        .sort((left, right) => left.priority - right.priority)[0];
      const teacher = dataset.teachers.find(
        (item) => item.stableKey === suggestion?.teacherKey,
      );
      if (teacher) {
        setTeacherName(teacher.fullName);
        setTeacherDesignation(teacher.designation);
        setTeacherDepartment(teacher.department.name);
        setTeacherStableKey(teacher.stableKey);
        setTeacherSource('directory');
      }
    }
    setQuery('');
    setOpen(false);
  };

  const unavailable =
    !cachedQuery.isLoading && !syncedQuery.isLoading && courses.length === 0;

  return (
    <div className="space-y-2 not-prose">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            data-testid="course-directory-trigger"
            className="w-full justify-between"
          >
            {selectedCourse
              ? `${selectedCourse.code} — ${selectedCourse.title}`
              : 'Find a course in the IPE directory…'}
            <CaretSortIcon className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popper-anchor-width)] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              aria-label="Search courses"
              placeholder="Search code, title, or department…"
            />
            <CommandList>
              <CommandEmpty>
                {unavailable
                  ? 'Directory unavailable. Use the manual fields below.'
                  : 'No matching course.'}
              </CommandEmpty>
              <CommandGroup>
                {matches.map((course) => {
                  const details = bundledIpeCourseDetails.get(
                    course.normalizedCode,
                  );
                  return (
                    <CommandItem
                      key={course.stableKey}
                      value={course.stableKey}
                      onSelect={selectCourse}
                      data-course-code={course.code}
                      className="items-start"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{course.code}</div>
                        <div className="text-sm">{course.title}</div>
                        <div className="text-muted-foreground text-xs">
                          {course.departmentName}
                        </div>
                        {details && (
                          <div className="text-muted-foreground text-xs">
                            Year {details.year} · {details.semester} semester ·{' '}
                            {details.type} · {details.credit} credits
                          </div>
                        )}
                      </div>
                      <CheckIcon
                        className={cn(
                          'mt-1 size-4',
                          stableKey === course.stableKey
                            ? 'opacity-100'
                            : 'opacity-0',
                        )}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <p className="text-muted-foreground text-xs">
        Selection fills the course code, title, and department. Your student
        department remains unchanged.
      </p>
    </div>
  );
}
