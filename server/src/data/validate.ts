import { readSeedData } from './schemas';
import { findCourseDuplicates, findTeacherDuplicates } from './validation';

const { courseDirectory, departments, teachers } = await readSeedData();
const knownDepartments = new Set(
  departments.flatMap((department) => [
    department.id,
    department.shortName,
    department.name,
  ]),
);
const unknown = teachers.filter(
  (teacher) => !knownDepartments.has(teacher.department),
);
const duplicates = findTeacherDuplicates(teachers);
const duplicateCourses = findCourseDuplicates(courseDirectory.courses);
const missingElectiveCourses = Object.keys(courseDirectory.electives).filter(
  (label) =>
    !courseDirectory.courses.some((course) => label.startsWith(course.code)),
);
const hasIpeDepartment = departments.some(
  (department) => department.id === 'ipe' && department.active,
);

if (
  unknown.length ||
  duplicates.length ||
  duplicateCourses.length ||
  missingElectiveCourses.length ||
  !hasIpeDepartment
) {
  console.error(
    JSON.stringify(
      {
        valid: false,
        unknownDepartments: unknown,
        teacherDuplicates: duplicates,
        courseDuplicates: duplicateCourses,
        missingElectiveCourses,
        hasIpeDepartment,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      valid: true,
      departments: departments.length,
      teachers: teachers.length,
      courses: courseDirectory.courses.length,
      electiveGroups: Object.keys(courseDirectory.electives).length,
      curriculumGenerated: courseDirectory.meta.generated,
    },
    null,
    2,
  ),
);
