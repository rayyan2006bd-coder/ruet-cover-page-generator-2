import { expect, test } from 'bun:test';
import 'fake-indexeddb/auto';
import { pdf } from '@react-pdf/renderer';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { CoverTemplate, getCoverValues } from '@/components/cover-template';
import { defaultStore } from '@/store';
import editor from '@/store/editor';

test('generates a one-page A4 PDF with the complete offline cover workflow', async () => {
  defaultStore.set(editor.studentName, 'Test Student');
  defaultStore.set(editor.studentID, '2003123');
  defaultStore.set(editor.courseNo, 'CSE 3200');
  defaultStore.set(editor.courseTitle, 'Software Engineering');
  defaultStore.set(editor.coverTitle, 'Backend Integration');
  defaultStore.set(editor.teacherName, 'A H M Sarowar Sattar');
  defaultStore.set(editor.teacherDesignation, 'Professor');
  defaultStore.set(editor.teacherDepartment, 'Computer Science & Engineering');
  defaultStore.set(editor.watermark, true);
  defaultStore.set(editor.formToBorder, true);

  const blob = await pdf(
    <CoverTemplate values={getCoverValues(defaultStore)} />,
  ).toBlob();
  const document = await getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
  }).promise;
  expect(document.numPages).toBe(1);
  const content = await (await document.getPage(1)).getTextContent();
  const text = content.items
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ');
  expect(text).toContain('Test Student');
  expect(text).toContain('Software Engineering');
  expect(text).toContain('Backend Integration');
  expect(text).toContain('A H M Sarowar Sattar');
  expect(text).toContain('Professor');
});
