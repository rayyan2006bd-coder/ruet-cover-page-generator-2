/**
 * @link https://github.com/Balastrong/shadcn-autocomplete-demo/
 */

import { ArrowLeftIcon, Cross1Icon } from '@radix-ui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { Command as CommandPrimitive } from 'cmdk';
import { useAtom, useSetAtom, type WritableAtom } from 'jotai';
import { type RESET, useResetAtom } from 'jotai/utils';
import { matchSorter } from 'match-sorter';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useDebounce } from 'use-debounce';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { syncPublishedDataset } from '@/services/api/dataset';
import {
  readCachedTeacherDataset,
  syncTeacherDataset,
  teacherAutofillValues,
} from '@/services/api/teachers';
import { getActiveDirectoryDataset } from '@/services/local/database';
import { Button } from '../ui/button';
import { FormItemContext } from './form-item';
import classes from './teacher-name.module.css';

export function TeacherName({
  nameAtom,
  designationAtom,
  departmentAtom,
  stableKeyAtom,
  sourceAtom,
  inputTestId,
}: {
  nameAtom: WritableAtom<string, [string | typeof RESET], void>;
  designationAtom: WritableAtom<string, [string], void>;
  departmentAtom: WritableAtom<string, [string], void>;
  stableKeyAtom: WritableAtom<string, [string | typeof RESET], void>;
  sourceAtom: WritableAtom<string, [string | typeof RESET], void>;
  inputTestId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, onValueChange] = useAtom(nameAtom);
  const reset = useResetAtom(nameAtom);
  const [search] = useDebounce(value, 200);
  const setDesignation = useSetAtom(designationAtom);
  const setDepartment = useSetAtom(departmentAtom);
  const setStableKey = useSetAtom(stableKeyAtom);
  const setSource = useSetAtom(sourceAtom);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { id } = useContext(FormItemContext);

  const cachedQuery = useQuery({
    queryKey: ['teachers', 'cached'],
    queryFn: readCachedTeacherDataset,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const syncedQuery = useQuery({
    queryKey: ['teachers', 'synced'],
    queryFn: ({ signal }) => syncTeacherDataset(signal),
  });
  const cachedReleaseQuery = useQuery({
    queryKey: ['directory-release', 'cached'],
    queryFn: getActiveDirectoryDataset,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const syncedReleaseQuery = useQuery({
    queryKey: ['directory-release', 'synced'],
    queryFn: ({ signal }) => syncPublishedDataset(signal),
  });
  const teachers =
    syncedReleaseQuery.data?.teachers ??
    cachedReleaseQuery.data?.teachers ??
    syncedQuery.data?.items ??
    cachedQuery.data?.items ??
    [];
  const isLoading = cachedQuery.isLoading && syncedQuery.isLoading;
  const directoryUnavailable =
    !isLoading && !teachers.length && syncedQuery.isError;

  const filteredTeachers = useMemo(() => {
    return (
      teachers &&
      (search
        ? matchSorter(teachers, search, {
            keys: [
              'fullName',
              'designation',
              'department.name',
              'department.shortName',
            ],
          }).slice(0, 5)
        : teachers)
    );
  }, [search, teachers]);

  const onSelectItem = (id: string) => {
    const teacher = teachers.find((teacher) => teacher.id === id);
    if (teacher) {
      const autofill = teacherAutofillValues(teacher);
      onValueChange(autofill.name);
      setDesignation(autofill.designation);
      setDepartment(autofill.department);
      setStableKey(
        'stableKey' in teacher && typeof teacher.stableKey === 'string'
          ? teacher.stableKey
          : teacher.id,
      );
      setSource('directory');
    }
    setOpen(false);
  };

  const [selected, setSelected] = useState('');

  useEffect(() => {
    const selected = filteredTeachers?.[0]?.id;
    selected && setSelected(selected);
  }, [filteredTeachers]);

  useEffect(() => {
    inputRef.current?.setAttribute('id', id);
    inputRef.current
      ?.closest('[cmdk-root]')
      ?.querySelector('label')
      ?.setAttribute('for', id);
  });

  return (
    <div
      className={cn(
        'flex w-full min-w-0 items-center gap-2',
        open && classes.containerFullScreen,
      )}
    >
      <button
        type="button"
        className={cn('hidden', classes.backDrop)}
        onClick={() => setOpen(false)}
        tabIndex={-1}
      />
      <Button
        variant="outline"
        size="icon"
        className={cn('hidden', classes.back)}
        onClick={() => setOpen(false)}
      >
        <ArrowLeftIcon className="h-[1.2rem] w-[1.2rem]" />
        <span className="sr-only">Back</span>
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <Command
          shouldFilter={false}
          value={selected}
          onValueChange={setSelected}
          className={cn('bg-transparent', classes.command)}
        >
          <div className="relative">
            <PopoverAnchor asChild>
              <CommandPrimitive.Input
                asChild
                value={value}
                onValueChange={(nextValue) => {
                  onValueChange(nextValue);
                  setDesignation('');
                  setDepartment('');
                  setStableKey('');
                  setSource('manual');
                }}
                onKeyDown={(e) => {
                  setOpen(e.key !== 'Escape');
                }}
                onMouseDown={() => setOpen((open) => !!value || !open)}
                onFocus={() => setOpen(true)}
                className={classes.input}
              >
                <Input
                  placeholder="Teacher"
                  ref={inputRef}
                  data-testid={inputTestId}
                />
              </CommandPrimitive.Input>
            </PopoverAnchor>
            {!!value && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0 bottom-0 z-10"
                aria-label="reset"
                onClick={() => {
                  reset();
                  setDesignation('');
                  setDepartment('');
                  setStableKey('');
                  setSource('manual');
                  inputRef.current?.focus();
                }}
              >
                <Cross1Icon className="h-4 w-4 opacity-50" />
              </Button>
            )}
          </div>
          {!open && <CommandList aria-hidden="true" className="hidden" />}
          <PopoverContent
            asChild
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            onFocus={() => inputRef.current?.focus()}
            className="w-[calc(100dvw-2rem)] max-w-[calc(100dvw-2rem)] p-0 data-[state=closed]:hidden sm:w-[var(--radix-popper-anchor-width)] sm:max-w-none"
          >
            <CommandList>
              {isLoading && (
                <CommandPrimitive.Loading>
                  <div className="p-1">
                    <Skeleton className="h-6 w-full" />
                  </div>
                </CommandPrimitive.Loading>
              )}
              {directoryUnavailable && (
                <div className="p-2 text-xs text-muted-foreground">
                  Teacher directory unavailable. You can still enter details
                  manually.
                </div>
              )}
              {filteredTeachers?.length && !isLoading ? (
                <CommandGroup>
                  {filteredTeachers.map((teacher) => (
                    <CommandItem
                      key={teacher.id}
                      value={teacher.id}
                      data-teacher-name={teacher.fullName}
                      onMouseDown={(e) => e.preventDefault()}
                      onSelect={onSelectItem}
                      className="block"
                    >
                      <div>{teacher.fullName}</div>
                      <div className="text-muted-foreground text-xs">
                        {teacher.designation}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Dept. of {teacher.department.name} (
                        {teacher.department.shortName})
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </PopoverContent>
        </Command>
      </Popover>
    </div>
  );
}
