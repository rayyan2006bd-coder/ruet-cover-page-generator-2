import { describe, expect, test } from 'bun:test';
import { readSeedData } from '../src/data/schemas';
import {
  findCourseDuplicates,
  findTeacherDuplicates,
} from '../src/data/validation';
import { buildPagination } from '../src/modules/directory/service';
import { checksumRecords } from '../src/utils/checksum';

describe('teacher import validation', () => {
  test('detects punctuation-insensitive duplicates within a department', () => {
    const duplicates = findTeacherDuplicates([
      {
        fullName: 'A.H.M. Sarowar',
        designation: 'Professor',
        department: 'CSE',
        aliases: [],
        active: true,
      },
      {
        fullName: 'A H M Sarowar',
        designation: 'Professor',
        department: 'CSE',
        aliases: [],
        active: true,
      },
      {
        fullName: 'A H M Sarowar',
        designation: 'Professor',
        department: 'EEE',
        aliases: [],
        active: true,
      },
    ]);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.indexes).toEqual([0, 1]);
  });

  test('generates stable SHA-256 dataset checksums', async () => {
    const first = await checksumRecords([{ id: '1', name: 'Teacher' }]);
    const second = await checksumRecords([{ id: '1', name: 'Teacher' }]);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(second);
  });

  test('loads the complete IPE curriculum without duplicate course codes', async () => {
    const { courseDirectory } = await readSeedData();
    expect(courseDirectory.courses).toHaveLength(73);
    expect(findCourseDuplicates(courseDirectory.courses)).toEqual([]);
    expect(Object.keys(courseDirectory.electives)).toHaveLength(2);
  });

  test('detects punctuation-insensitive duplicate course codes', () => {
    const duplicates = findCourseDuplicates([
      {
        code: 'IPE 1200',
        title: 'Engineering Graphics-II and CAD Lab',
        year: 1,
        semester: 'Even',
        type: 'Sessional',
        credit: 1.5,
      },
      {
        code: 'IPE-1200',
        title: 'Duplicate course',
        year: 1,
        semester: 'Even',
        type: 'Sessional',
        credit: 1.5,
      },
    ]);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.indexes).toEqual([0, 1]);
  });

  test('calculates pagination boundaries', () => {
    expect(buildPagination(1, 50, 51)).toEqual({
      page: 1,
      limit: 50,
      total: 51,
      hasMore: true,
    });
    expect(buildPagination(2, 50, 51)).toEqual({
      page: 2,
      limit: 50,
      total: 51,
      hasMore: false,
    });
  });
});
