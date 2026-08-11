import courseDirectoryJson from '@shared/data/ipe-course-directory.json';
import {
  type CurriculumCourse,
  curriculumDirectorySchema,
  type DirectoryCourse,
} from '@shared/domain-contracts';

export const bundledIpeCourseDirectory =
  curriculumDirectorySchema.parse(courseDirectoryJson);

export function normalizeCourseCode(code: string) {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export const bundledIpeCourses: DirectoryCourse[] =
  bundledIpeCourseDirectory.courses.map((course) => {
    const normalizedCode = normalizeCourseCode(course.code);
    return {
      stableKey: `ipe-${normalizedCode}`,
      code: course.code,
      normalizedCode,
      title: course.title,
      departmentKey: 'ipe',
      departmentName: 'Industrial & Production Engineering',
      active: true,
      releaseVersion: `ipe-curriculum-${bundledIpeCourseDirectory.meta.generated}`,
    };
  });

export const bundledIpeCourseDetails = new Map<string, CurriculumCourse>(
  bundledIpeCourseDirectory.courses.map((course) => [
    normalizeCourseCode(course.code),
    course,
  ]),
);
