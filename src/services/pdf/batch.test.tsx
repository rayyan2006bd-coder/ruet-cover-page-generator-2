import { describe, expect, test } from 'bun:test';
import { coverFormDataSchema } from '@shared/domain-contracts';
import { unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { generateBatchZip, generateMergedBatchPdf } from './batch';

const base = coverFormDataSchema.parse({
  schemaVersion: 1,
  student: {
    name: 'Test Student',
    roll: '2405016',
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
  filename: { pattern: 'IPE-2102_{roll}_{type}-{itemNumber}.pdf' },
});

const rows = [
  {
    id: '3e94e36e-af38-45ee-b1b3-6b91967666df',
    itemNumber: '01',
    title: 'First experiment',
    experimentDate: null,
    submissionDate: null,
  },
  {
    id: '02df5d19-b995-4ce6-9357-b96cb50d317c',
    itemNumber: '02',
    title: 'Second experiment',
    experimentDate: null,
    submissionDate: null,
  },
];

describe('batch PDF generation', () => {
  test('creates one-page files and a merged PDF with one page per row', async () => {
    const progress: number[] = [];
    const merged = await generateMergedBatchPdf({
      base,
      rows,
      onProgress: (item) => progress.push(item.completed),
    });
    const document = await PDFDocument.load(await merged.blob.arrayBuffer());

    expect(document.getPageCount()).toBe(2);
    expect(merged.files).toHaveLength(2);
    expect(progress).toEqual([1, 2]);
  }, 30_000);

  test('creates a ZIP containing each smart filename', async () => {
    const result = await generateBatchZip({ base, rows, mode: 'compressed' });
    const archive = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));

    expect(Object.keys(archive)).toEqual([
      'IPE-2102_2405016_Lab-01.pdf',
      'IPE-2102_2405016_Lab-02.pdf',
    ]);
  }, 30_000);
});
