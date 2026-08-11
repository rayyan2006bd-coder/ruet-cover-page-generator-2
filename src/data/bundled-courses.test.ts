import { describe, expect, test } from 'bun:test';
import {
  bundledIpeCourseDetails,
  bundledIpeCourseDirectory,
  bundledIpeCourses,
} from './bundled-courses';

describe('bundled IPE course directory', () => {
  test('contains valid unique courses from every year and semester', () => {
    expect(bundledIpeCourses).toHaveLength(73);
    expect(
      new Set(bundledIpeCourses.map((course) => course.normalizedCode)).size,
    ).toBe(bundledIpeCourses.length);
    expect(
      new Set(
        bundledIpeCourseDirectory.courses.map(
          (course) => `${course.year}-${course.semester}`,
        ),
      ).size,
    ).toBe(8);
  });

  test('preserves course and elective metadata', () => {
    expect(bundledIpeCourseDetails.get('ipes1202')).toEqual({
      code: 'IPES 1202',
      title: 'Shop Practice-I',
      year: 1,
      semester: 'Even',
      type: 'Sessional',
      credit: 0.75,
    });
    expect(Object.keys(bundledIpeCourseDirectory.electives)).toEqual([
      'IPE 4131 (Optional-I)',
      'IPE 4231 (Optional-II)',
    ]);
  });
});
