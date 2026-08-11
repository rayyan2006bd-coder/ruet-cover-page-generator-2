import {
  type CoursePreset,
  type CoverFormData,
  coverFormDataSchema,
  type StudentProfile,
} from '@shared/domain-contracts';
import { type Atom, atom } from 'jotai';
import type { Store } from 'jotai/vanilla/store';
import type { CoverTemplateValues } from '@/components/cover-template';
import { defaultStore } from '@/store';
import editor, { departments } from '@/store/editor';

function derivedSession(roll: string) {
  if (!/^\d{2}/.test(roll)) return '';
  const year = Number(roll.slice(0, 2));
  return `20${roll.slice(0, 2)}-${String(year + 1).padStart(2, '0')}`;
}

function derivedSeries(roll: string) {
  return /^\d{2}/.test(roll) ? `${roll.slice(0, 2)} Series` : '';
}

function dateToIso(value: Date | null) {
  return value && !Number.isNaN(value.getTime()) ? value.toISOString() : null;
}

function isoToDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

type CoverValueReader = <Value>(atom: Atom<Value>) => Value;

function readCoverFormData(get: CoverValueReader): CoverFormData {
  const roll = get(editor.studentID);
  const teachers = [
    {
      stableKey: get(editor.teacherStableKey) || null,
      name: get(editor.teacherName),
      designation: get(editor.teacherDesignation),
      department: get(editor.teacherDepartment),
      source:
        get(editor.teacherSource) === 'directory'
          ? ('directory' as const)
          : ('manual' as const),
    },
    {
      stableKey: get(editor.secondTeacherStableKey) || null,
      name: get(editor.secondTeacherName),
      designation: get(editor.secondTeacherDesignation),
      department: get(editor.secondTeacherDepartment),
      source:
        get(editor.secondTeacherSource) === 'directory'
          ? ('directory' as const)
          : ('manual' as const),
    },
  ].filter((teacher) =>
    Boolean(teacher.name || teacher.designation || teacher.department),
  );

  return coverFormDataSchema.parse({
    schemaVersion: 1,
    student: {
      name: get(editor.studentName),
      roll,
      session: get(editor.studentSessionValue) || derivedSession(roll),
      series: get(editor.studentSeriesValue) || derivedSeries(roll),
      section: get(editor.studentSection),
      group: get(editor.studentGroup),
      department: get(editor.studentDepartment),
    },
    course: {
      stableKey: get(editor.courseStableKey) || null,
      code: get(editor.courseNo),
      title: get(editor.courseTitle),
      departmentKey: get(editor.courseDepartmentKey) || null,
      department: get(editor.courseDepartment) || get(editor.studentDepartment),
      source: get(editor.courseSource) === 'directory' ? 'directory' : 'manual',
    },
    teachers,
    coverType: get(editor.type),
    itemNumber: get(editor.coverNo),
    title: get(editor.coverTitle),
    experimentDate: dateToIso(get(editor.dateOfExperiment)),
    submissionDate: dateToIso(get(editor.dateOfSubmission)),
    template: {
      stableKey: get(editor.templateStableKey) || null,
      version: get(editor.templateVersion) || null,
      name: get(editor.templateName),
      approved: get(editor.templateApproved),
    },
    settings: {
      formToBorder: get(editor.formToBorder),
      watermark: get(editor.watermark),
      courseCode: get(editor.courseCode),
      studentSeries: get(editor.studentSeries),
      studentSession: get(editor.studentSession),
      courseInfoBellowTitle: get(editor.courseInfoBellowTitle),
      datesBellowTitle: get(editor.datesBellowTitle),
      assessmentTable: get(editor.assessmentTable),
      assessmentCO: get(editor.CO),
      assessmentPO: get(editor.PO),
      manualSubmittedBy: get(editor.manualSubmittedBy),
      manualSubmittedByText: get(editor.manualSubmittedByText),
    },
    filename: { pattern: get(editor.filenamePattern) },
  });
}

export const coverFormDataAtom = atom((get) => readCoverFormData(get));

export function captureCoverFormData(
  store: Store = defaultStore,
): CoverFormData {
  return readCoverFormData(store.get);
}

export function applyCoverFormData(
  input: CoverFormData,
  store: Store = defaultStore,
) {
  const cover = coverFormDataSchema.parse(input);
  store.set(editor.studentName, cover.student.name);
  store.set(editor.studentID, cover.student.roll);
  store.set(editor.studentSessionValue, cover.student.session);
  store.set(editor.studentSeriesValue, cover.student.series);
  store.set(editor.studentSection, cover.student.section);
  store.set(editor.studentGroup, cover.student.group);
  store.set(
    editor.studentDepartment,
    departments.find((department) => department === cover.student.department) ??
      '',
  );
  store.set(editor.courseNo, cover.course.code);
  store.set(editor.courseTitle, cover.course.title);
  store.set(editor.courseStableKey, cover.course.stableKey ?? '');
  store.set(editor.courseDepartmentKey, cover.course.departmentKey ?? '');
  store.set(editor.courseDepartment, cover.course.department);
  store.set(editor.courseSource, cover.course.source);
  store.set(editor.type, cover.coverType);
  store.set(editor.coverNo, cover.itemNumber);
  store.set(editor.coverTitle, cover.title);
  store.set(editor.dateOfExperiment, isoToDate(cover.experimentDate));
  store.set(editor.dateOfSubmission, isoToDate(cover.submissionDate));

  const primary = cover.teachers[0];
  store.set(editor.teacherStableKey, primary?.stableKey ?? '');
  store.set(editor.teacherName, primary?.name ?? '');
  store.set(editor.teacherDesignation, primary?.designation ?? '');
  store.set(editor.teacherDepartment, primary?.department ?? '');
  store.set(editor.teacherSource, primary?.source ?? 'manual');
  const second = cover.teachers[1];
  store.set(editor.secondTeacherStableKey, second?.stableKey ?? '');
  store.set(editor.secondTeacherName, second?.name ?? '');
  store.set(editor.secondTeacherDesignation, second?.designation ?? '');
  store.set(editor.secondTeacherDepartment, second?.department ?? '');
  store.set(editor.secondTeacherSource, second?.source ?? 'manual');

  store.set(editor.templateStableKey, cover.template.stableKey ?? '');
  store.set(editor.templateVersion, cover.template.version ?? '');
  store.set(editor.templateName, cover.template.name);
  store.set(editor.templateApproved, cover.template.approved);
  store.set(editor.formToBorder, cover.settings.formToBorder);
  store.set(editor.watermark, cover.settings.watermark);
  store.set(editor.courseCode, cover.settings.courseCode);
  store.set(editor.studentSeries, cover.settings.studentSeries);
  store.set(editor.studentSession, cover.settings.studentSession);
  store.set(editor.courseInfoBellowTitle, cover.settings.courseInfoBellowTitle);
  store.set(editor.datesBellowTitle, cover.settings.datesBellowTitle);
  store.set(editor.assessmentTable, cover.settings.assessmentTable);
  store.set(editor.CO, cover.settings.assessmentCO);
  store.set(editor.PO, cover.settings.assessmentPO);
  store.set(editor.manualSubmittedBy, cover.settings.manualSubmittedBy);
  store.set(editor.manualSubmittedByText, cover.settings.manualSubmittedByText);
  store.set(editor.filenamePattern, cover.filename.pattern);
}

export function isCoverPopulated(cover: CoverFormData) {
  return Boolean(
    cover.student.name ||
      cover.student.roll ||
      cover.course.code ||
      cover.course.title ||
      cover.title ||
      cover.teachers.some((teacher) => teacher.name),
  );
}

export function applyProfileToCover(
  cover: CoverFormData,
  profile: StudentProfile,
  options: { useCourseDepartment?: boolean } = {},
) {
  const next = structuredClone(cover);
  next.student = {
    ...profile.identity,
    department:
      options.useCourseDepartment && cover.course.department
        ? cover.course.department
        : profile.identity.department,
  };
  return coverFormDataSchema.parse(next);
}

export function applyPresetToCover(cover: CoverFormData, preset: CoursePreset) {
  return coverFormDataSchema.parse({
    ...cover,
    course: preset.course,
    teachers: preset.teachers,
    coverType: preset.coverType,
    template: preset.template,
    settings: preset.settings,
    filename: preset.filename,
  });
}

export function coverFormDataToTemplateValues(
  cover: CoverFormData,
): CoverTemplateValues {
  return {
    department: cover.student.department as CoverTemplateValues['department'],
    type: cover.coverType,
    courseNo: cover.course.code,
    courseTitle: cover.course.title,
    coverNo: cover.itemNumber,
    coverTitle: cover.title,
    studentSection: cover.student.section,
    studentID: cover.student.roll,
    teacherName: cover.teachers[0]?.name ?? '',
    teacherDesignation: cover.teachers[0]?.designation ?? '',
    teacherDepartment: cover.teachers[0]?.department ?? '',
    dateOfSubmission: isoToDate(cover.submissionDate),
    dateOfExperiment: isoToDate(cover.experimentDate),
    secondTeacherName: cover.teachers[1]?.name ?? '',
    secondTeacherDesignation: cover.teachers[1]?.designation ?? '',
    secondTeacherDepartment: cover.teachers[1]?.department ?? '',
    studentName: cover.student.name,
    manualSubmittedByText: cover.settings.manualSubmittedByText,
    CO: cover.settings.assessmentCO,
    PO: cover.settings.assessmentPO,
    fromToBorder: cover.settings.formToBorder,
    watermark: cover.settings.watermark,
    courseCode: cover.settings.courseCode,
    studentSeries: cover.settings.studentSeries,
    studentSession: cover.settings.studentSession,
    studentGroup: cover.student.group,
    courseInfoBellowTitle: cover.settings.courseInfoBellowTitle,
    datesBellowTitle: cover.settings.datesBellowTitle,
    manualSubmittedBy: cover.settings.manualSubmittedBy,
    assessmentTable: cover.settings.assessmentTable,
  };
}
