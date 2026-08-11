import type { CoverFormData } from '@shared/domain-contracts';

export type PreflightIssue = {
  severity: 'error' | 'warning';
  field: string;
  message: string;
};

export function preflightCover(cover: CoverFormData): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const required: Array<[string, string, string]> = [
    ['student.name', cover.student.name, 'Enter the student name.'],
    ['student.roll', cover.student.roll, 'Enter the student roll number.'],
    [
      'student.department',
      cover.student.department,
      'Select the student department.',
    ],
    ['course.code', cover.course.code, 'Enter or select a course code.'],
    ['course.title', cover.course.title, 'Enter or select a course title.'],
    [
      'teachers.0.name',
      cover.teachers[0]?.name ?? '',
      'Enter or select the primary teacher.',
    ],
  ];
  for (const [field, value, message] of required) {
    if (!value.trim()) issues.push({ severity: 'error', field, message });
  }
  if (cover.coverType !== 'Thesis' && !cover.itemNumber.trim()) {
    issues.push({
      severity: 'error',
      field: 'itemNumber',
      message: `Enter the ${cover.coverType.toLowerCase()} number.`,
    });
  }
  if (cover.student.roll && !/^\d{7}$/.test(cover.student.roll)) {
    issues.push({
      severity: 'error',
      field: 'student.roll',
      message: 'Roll number must contain exactly seven digits.',
    });
  }
  if (cover.student.session && !/^\d{4}-\d{2}$/.test(cover.student.session)) {
    issues.push({
      severity: 'warning',
      field: 'student.session',
      message: 'Session should use the YYYY-YY format.',
    });
  }
  if (
    cover.experimentDate &&
    cover.submissionDate &&
    new Date(cover.experimentDate) > new Date(cover.submissionDate)
  ) {
    issues.push({
      severity: 'warning',
      field: 'submissionDate',
      message: 'Submission date is earlier than the experiment date.',
    });
  }

  const lengthChecks: Array<[string, string, number]> = [
    ['student.name', cover.student.name, 80],
    ['course.title', cover.course.title, 120],
    ['title', cover.title, 320],
    ...cover.teachers.map(
      (teacher, index) =>
        [`teachers.${index}.name`, teacher.name, 80] as [
          string,
          string,
          number,
        ],
    ),
  ];
  for (const [field, value, limit] of lengthChecks) {
    if (value.length > limit) {
      issues.push({
        severity: 'warning',
        field,
        message: `${field} is unusually long and may overflow the one-page layout.`,
      });
    }
  }

  if (
    cover.template.approved &&
    (!cover.template.stableKey ||
      !cover.template.version ||
      !cover.template.name.trim())
  ) {
    issues.push({
      severity: 'error',
      field: 'template',
      message: 'The selected approved template is incomplete.',
    });
  }
  return issues;
}

export function hasBlockingPreflightIssues(issues: PreflightIssue[]) {
  return issues.some((issue) => issue.severity === 'error');
}
