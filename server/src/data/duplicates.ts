import { readSeedData } from './schemas';
import { findCourseDuplicates, findTeacherDuplicates } from './validation';

const { courseDirectory, teachers } = await readSeedData();
const teacherDuplicates = findTeacherDuplicates(teachers);
const courseDuplicates = findCourseDuplicates(courseDirectory.courses);
console.log(
  JSON.stringify(
    {
      duplicateCount: teacherDuplicates.length + courseDuplicates.length,
      teacherDuplicates,
      courseDuplicates,
    },
    null,
    2,
  ),
);
