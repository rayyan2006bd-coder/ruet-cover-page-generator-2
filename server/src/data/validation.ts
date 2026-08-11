import type { TeacherImportItem } from '../../../shared/api-contracts';
import type { CurriculumCourse } from '../../../shared/domain-contracts';
import { normalizeSearch } from '../utils/normalize';

export type Duplicate = {
  key: string;
  indexes: number[];
  names: string[];
};

export function findTeacherDuplicates(items: TeacherImportItem[]): Duplicate[] {
  const groups = new Map<string, number[]>();
  items.forEach((item, index) => {
    const key = `${normalizeSearch(item.department)}:${normalizeSearch(item.fullName)}`;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  return [...groups.entries()]
    .filter(([, indexes]) => indexes.length > 1)
    .map(([key, indexes]) => ({
      key,
      indexes,
      names: indexes.flatMap((index) => {
        const item = items[index];
        return item ? [item.fullName] : [];
      }),
    }));
}

export function findCourseDuplicates(items: CurriculumCourse[]): Duplicate[] {
  const groups = new Map<string, number[]>();
  items.forEach((item, index) => {
    const key = normalizeSearch(item.code).replaceAll(' ', '');
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  return [...groups.entries()]
    .filter(([, indexes]) => indexes.length > 1)
    .map(([key, indexes]) => ({
      key,
      indexes,
      names: indexes.flatMap((index) => {
        const item = items[index];
        return item ? [`${item.code} - ${item.title}`] : [];
      }),
    }));
}
