import {
  type BatchCoverRow,
  batchCoverRowSchema,
  type CoverFormData,
  coverFormDataSchema,
} from '@shared/domain-contracts';
import { zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { coverFormDataToTemplateValues } from '@/services/local/cover-state';
import { buildSmartFilename, resolveDuplicateFilenames } from './filename';
import { generateCoverPdf, type PdfExportMode } from './generate';
import { preflightCover } from './preflight';

export type BatchProgress = {
  completed: number;
  total: number;
  filename: string;
};

function rowCover(base: CoverFormData, row: BatchCoverRow) {
  return coverFormDataSchema.parse({
    ...base,
    itemNumber: row.itemNumber,
    title: row.title,
    experimentDate: row.experimentDate,
    submissionDate: row.submissionDate,
  });
}

async function generateRows(input: {
  base: CoverFormData;
  rows: BatchCoverRow[];
  mode: PdfExportMode;
  onProgress?: (progress: BatchProgress) => void;
}) {
  const rows = input.rows.map((row) => batchCoverRowSchema.parse(row));
  if (rows.length === 0) throw new Error('Add at least one batch row.');
  const covers = rows.map((row) => rowCover(input.base, row));
  const filenames = resolveDuplicateFilenames(
    covers.map((cover) => buildSmartFilename(cover)),
  );
  const blocking = covers.flatMap((cover, index) =>
    preflightCover(cover)
      .filter((issue) => issue.severity === 'error')
      .map((issue) => `Row ${index + 1}: ${issue.message}`),
  );
  if (blocking.length > 0) {
    throw new Error(blocking.join(' '));
  }

  const generated: Array<{
    cover: CoverFormData;
    filename: string;
    bytes: Uint8Array;
  }> = [];
  for (let index = 0; index < covers.length; index += 1) {
    const cover = covers[index];
    const filename = filenames[index];
    if (!cover || !filename) continue;
    const blob = await generateCoverPdf({
      cover,
      values: coverFormDataToTemplateValues(cover),
      mode: input.mode,
    });
    generated.push({
      cover,
      filename,
      bytes: new Uint8Array(await blob.arrayBuffer()),
    });
    input.onProgress?.({
      completed: index + 1,
      total: covers.length,
      filename,
    });
  }
  return generated;
}

export async function generateBatchZip(input: {
  base: CoverFormData;
  rows: BatchCoverRow[];
  mode?: PdfExportMode;
  onProgress?: (progress: BatchProgress) => void;
}) {
  const files = await generateRows({
    ...input,
    mode: input.mode ?? 'standard',
  });
  const archive = zipSync(
    Object.fromEntries(files.map((file) => [file.filename, file.bytes])),
    { level: input.mode === 'compressed' ? 9 : 6 },
  );
  const output = new Uint8Array(archive.byteLength);
  output.set(archive);
  return {
    blob: new Blob([output.buffer], { type: 'application/zip' }),
    files,
  };
}

export async function generateMergedBatchPdf(input: {
  base: CoverFormData;
  rows: BatchCoverRow[];
  mode?: PdfExportMode;
  onProgress?: (progress: BatchProgress) => void;
}) {
  const files = await generateRows({
    ...input,
    mode: input.mode ?? 'standard',
  });
  const merged = await PDFDocument.create();
  for (const file of files) {
    const document = await PDFDocument.load(file.bytes);
    if (document.getPageCount() !== 1) {
      throw new Error(`${file.filename} did not generate exactly one page.`);
    }
    const [page] = await merged.copyPages(document, [0]);
    if (page) merged.addPage(page);
  }
  merged.setCreator('RUET Cover Page Generator');
  merged.setProducer('RUET Cover Page Generator 1.0.0');
  merged.setSubject('Merged batch of one-page RUET covers');
  const bytes = await merged.save({
    useObjectStreams: input.mode !== 'high-quality',
  });
  const output = new Uint8Array(bytes.byteLength);
  output.set(bytes);
  return {
    blob: new Blob([output.buffer], { type: 'application/pdf' }),
    files,
  };
}
