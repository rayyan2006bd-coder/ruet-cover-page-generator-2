import { describe, expect, test } from 'bun:test';
import 'fake-indexeddb/auto';
import {
  type CoursePreset,
  coverFormDataSchema,
  type StudentProfile,
} from '@shared/domain-contracts';
import { createStore } from 'jotai/vanilla';
import editor, { Department } from '@/store/editor';
import {
  applyCoverFormData,
  applyPresetToCover,
  applyProfileToCover,
  captureCoverFormData,
  isCoverPopulated,
} from './cover-state';

const timestamp = '2026-08-11T00:00:00.000Z';

describe('cover editor state', () => {
  test('captures directory selections and derives session and series', () => {
    const store = createStore();
    store.set(editor.studentName, 'Test Student');
    store.set(editor.studentID, '2003123');
    store.set(editor.courseNo, 'CSE 3200');
    store.set(editor.courseTitle, 'Software Engineering');
    store.set(editor.courseStableKey, 'course.cse-3200');
    store.set(editor.courseSource, 'directory');
    store.set(editor.teacherName, 'A H M Sarowar Sattar');
    store.set(editor.teacherStableKey, 'teacher.sarowar-sattar');
    store.set(editor.teacherSource, 'directory');
    store.set(editor.dateOfExperiment, null);
    store.set(editor.dateOfSubmission, null);

    const result = captureCoverFormData(store);

    expect(result.student).toMatchObject({
      name: 'Test Student',
      roll: '2003123',
      session: '2020-21',
      series: '20 Series',
      department: Department.CSE,
    });
    expect(result.course).toMatchObject({
      stableKey: 'course.cse-3200',
      source: 'directory',
    });
    expect(result.teachers[0]).toMatchObject({
      stableKey: 'teacher.sarowar-sattar',
      source: 'directory',
    });
    expect(isCoverPopulated(result)).toBe(true);
  });

  test('applies a validated cover and rejects unsupported student departments', () => {
    const store = createStore();
    const input = coverFormDataSchema.parse({
      schemaVersion: 1,
      student: {
        name: 'Imported Student',
        roll: '2101001',
        department: 'Unknown Department',
      },
      course: { code: 'EEE 1201', title: 'Circuits' },
      teachers: [{ name: 'Teacher One', designation: 'Professor' }],
      coverType: 'Assignment',
      title: 'Network theorem',
      experimentDate: null,
      submissionDate: null,
    });

    applyCoverFormData(input, store);

    expect(store.get(editor.studentName)).toBe('Imported Student');
    expect(store.get(editor.studentDepartment)).toBe('');
    expect(store.get(editor.courseTitle)).toBe('Circuits');
    expect(store.get(editor.teacherName)).toBe('Teacher One');
    expect(store.get(editor.type)).toBe('Assignment');
  });

  test('applies profiles and presets without mutating the source cover', () => {
    const original = coverFormDataSchema.parse({
      schemaVersion: 1,
      student: {},
      course: {
        code: 'CSE 3200',
        title: 'Software Engineering',
        department: Department.CSE,
      },
    });
    const profile: StudentProfile = {
      schemaVersion: 1,
      id: crypto.randomUUID(),
      label: 'Primary',
      identity: {
        name: 'Test Student',
        roll: '2003123',
        session: '2020-21',
        series: '20 Series',
        section: 'B',
        group: '',
        department: Department.EEE,
      },
      lockedFields: ['name', 'roll'],
      isDefault: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const preset: CoursePreset = {
      schemaVersion: 1,
      id: crypto.randomUUID(),
      name: 'CSE lab',
      course: original.course,
      teachers: [],
      coverType: 'Lab Report',
      template: original.template,
      settings: { ...original.settings, watermark: true },
      filename: original.filename,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    expect(
      applyProfileToCover(original, profile, { useCourseDepartment: true })
        .student.department,
    ).toBe(Department.CSE);
    expect(applyPresetToCover(original, preset).settings.watermark).toBe(true);
    expect(original.student.name).toBe('');
    expect(original.settings.watermark).toBe(false);
  });
});
