import { describe, expect, test } from 'bun:test';
import 'fake-indexeddb/auto';
import { createStore } from 'jotai/vanilla';
import { getCoverValues } from '@/components/cover-template';
import {
  importCoverFile,
  parsePositionedRuetCoverText,
  parseRuetCoverText,
} from '@/services/import/cover-import';
import { captureCoverFormData } from '@/services/local/cover-state';
import editor, { Department } from '@/store/editor';
import { generateCoverPdf } from './generate';

describe('structured PDF round trip', () => {
  test('restores an app-generated cover from its embedded attachment', async () => {
    const store = createStore();
    store.set(editor.studentName, 'Test Student');
    store.set(editor.studentID, '2003123');
    store.set(editor.studentDepartment, Department.CSE);
    store.set(editor.courseNo, 'CSE 3200');
    store.set(editor.courseTitle, 'Software Engineering');
    store.set(editor.type, 'Lab Report');
    store.set(editor.coverNo, '4');
    store.set(editor.coverTitle, 'Release Engineering');
    store.set(editor.teacherName, 'A H M Sarowar Sattar');
    store.set(editor.teacherDesignation, 'Professor');
    store.set(editor.teacherDepartment, Department.CSE);
    const cover = captureCoverFormData(store);

    const blob = await generateCoverPdf({
      cover,
      values: getCoverValues(store),
    });
    const result = await importCoverFile(
      new File([blob], 'round-trip.pdf', { type: 'application/pdf' }),
    );

    expect(result.source).toBe('embedded-data');
    expect(result.pageCount).toBe(1);
    expect(result.cover).toEqual(cover);
    expect(result.fields.every((field) => field.confidence === 1)).toBe(true);
  });

  test('parses a selectable-text RUET cover without OCR', () => {
    const result = parseRuetCoverText(
      `Rajshahi University of Engineering & Technology
       Department of Computer Science & Engineering
       Course No.: CSE 3200 Course Title: Software Engineering
       Lab Report Experiment No. 04 Experiment Title Release Engineering
       Submitted by: Test Student Roll: 2003123
       Submitted to: A H M Sarowar Sattar Professor Dept. of CSE, RUET
       Date of Experiment 1 August 2026 Date of Submission 8 August 2026`,
      1,
    );

    expect(result.source).toBe('pdf-text');
    expect(result.cover.student?.roll).toBe('2003123');
    expect(result.cover.course?.code).toBe('CSE 3200');
    expect(result.cover.teachers?.[0]?.name).toBe('A H M Sarowar Sattar');
  });

  test('reconstructs fragmented fields and two-column teacher details', () => {
    const item = (
      text: string,
      x: number,
      y: number,
      width = text.length * 5,
    ) => ({ text, x, y, width, height: 12 });
    const result = parsePositionedRuetCoverText(
      [
        item('Department of Industrial & Production Engineering', 145, 504),
        item('Course No.: IPES 1202', 235, 467),
        item('Course Title: Engineering Shop', 204, 445, 202),
        item('-', 406.5, 445, 5),
        item('I', 412, 445, 5),
        item('Experiment No.', 71, 409, 95),
        item(':', 177, 409, 5),
        item('02', 185, 409, 14),
        item('Experiment Title :', 71, 386, 110),
        item('Study of a Shaper Machi', 185, 386, 145),
        item('ne and Practice', 330.5, 386, 85),
        item('Submitted by:', 72, 332, 85),
        item('Submitted to:', 313, 332, 82),
        item('Sample Student', 71, 313, 95),
        item('Dr. Sample Teacher', 316, 313, 115),
        item('Group:', 71, 295, 40),
        item('3', 114, 295, 7),
        item('Professor', 316, 295, 53),
        item('Roll: 24051', 71, 277, 66),
        item('23', 137.2, 277, 14),
        item('Dept. of IPE, RUET', 315, 277, 114),
        item('Second Sample Teacher', 315, 243, 125),
        item('Lecturer', 315, 225, 47),
        item('Dept. of ME, RUET', 315, 206, 114),
        item('Date of Experiment:', 72, 99, 105),
        item('28 December 2025', 180, 99, 90),
        item('Date of Submission:', 319, 99, 103),
        item('23 April, 2026', 425, 99, 70),
      ],
      8,
    );

    expect(result.cover.student).toMatchObject({
      name: 'Sample Student',
      roll: '2405123',
      group: '3',
      department: 'Industrial & Production Engineering',
    });
    expect(result.cover.course).toMatchObject({
      code: 'IPES 1202',
      title: 'Engineering Shop - I',
      department: 'Industrial & Production Engineering',
    });
    expect(result.cover.itemNumber).toBe('02');
    expect(result.cover.title).toBe('Study of a Shaper Machine and Practice');
    expect(result.cover.teachers).toEqual([
      {
        stableKey: null,
        name: 'Dr. Sample Teacher',
        designation: 'Professor',
        department: 'Industrial & Production Engineering',
        source: 'manual',
      },
      {
        stableKey: null,
        name: 'Second Sample Teacher',
        designation: 'Lecturer',
        department: 'Mechanical Engineering',
        source: 'manual',
      },
    ]);
    expect(result.cover.experimentDate).toBe('2025-12-28T00:00:00.000Z');
    expect(result.cover.submissionDate).toBe('2026-04-23T00:00:00.000Z');
    expect(result.warnings).toEqual([]);
  });
});
