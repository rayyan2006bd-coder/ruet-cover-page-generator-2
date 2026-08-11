import { describe, expect, test } from 'bun:test';
import { coverFormDataSchema } from '@shared/domain-contracts';
import { hasBlockingPreflightIssues, preflightCover } from './preflight';

function validCover() {
  return coverFormDataSchema.parse({
    schemaVersion: 1,
    student: {
      name: 'Test Student',
      roll: '2405016',
      session: '2024-25',
      department: 'Industrial & Production Engineering',
    },
    course: { code: 'IPE 2102', title: 'Manufacturing Process' },
    teachers: [
      {
        name: 'Test Teacher',
        designation: 'Professor',
        department: 'Industrial & Production Engineering',
      },
    ],
    coverType: 'Lab Report',
    itemNumber: '01',
  });
}

describe('PDF preflight', () => {
  test('accepts a complete cover without blocking issues', () => {
    const issues = preflightCover(validCover());
    expect(hasBlockingPreflightIssues(issues)).toBe(false);
  });

  test('blocks missing required fields and an invalid roll', () => {
    const cover = validCover();
    cover.student.name = '';
    cover.student.roll = '24/016';
    const issues = preflightCover(cover);

    expect(hasBlockingPreflightIssues(issues)).toBe(true);
    expect(issues.map((issue) => issue.field)).toContain('student.name');
    expect(issues.map((issue) => issue.field)).toContain('student.roll');
  });

  test('warns when dates are reversed', () => {
    const cover = validCover();
    cover.experimentDate = '2026-08-10T00:00:00.000Z';
    cover.submissionDate = '2026-08-01T00:00:00.000Z';

    expect(preflightCover(cover)).toContainEqual({
      severity: 'warning',
      field: 'submissionDate',
      message: 'Submission date is earlier than the experiment date.',
    });
  });
});
