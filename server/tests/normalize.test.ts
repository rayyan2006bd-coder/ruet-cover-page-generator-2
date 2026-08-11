import { describe, expect, test } from 'bun:test';
import { buildSearchText, normalizeSearch } from '../src/utils/normalize';

describe('teacher search normalization', () => {
  test.each([
    ['A H M Sarowar', 'a h m sarowar'],
    ['a.h.m sarowar', 'a h m sarowar'],
    ['  Professor   CSE ', 'professor cse'],
    ['Dr. Md. Rabiul Islam', 'dr md rabiul islam'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeSearch(input)).toBe(expected);
  });

  test('builds a de-duplicated combined search document', () => {
    expect(
      buildSearchText([
        'Professor',
        'CSE',
        'professor',
        'Computer Science & Engineering',
      ]),
    ).toBe('professor cse computer science engineering');
  });
});
