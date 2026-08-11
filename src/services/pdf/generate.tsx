import { pdf } from '@react-pdf/renderer';
import type {
  CoverFormData,
  EmbeddedPdfCoverData,
} from '@shared/domain-contracts';
import { PDFDocument } from 'pdf-lib';
import type { CoverTemplateValues } from '@/components/cover-template';
import { CoverTemplate } from '@/components/cover-template';

export type PdfExportMode = 'standard' | 'high-quality' | 'compressed';

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function createEmbeddedCoverData(
  cover: CoverFormData,
  generatedAt = new Date().toISOString(),
): Promise<EmbeddedPdfCoverData> {
  return {
    schemaVersion: 1,
    sourceApplication: 'RUET Cover Page Generator',
    sourceApplicationVersion: '1.0.0',
    generatedAt,
    checksum: await sha256(JSON.stringify(cover)),
    cover,
  };
}

export async function generateCoverPdf(input: {
  cover: CoverFormData;
  values: CoverTemplateValues;
  mode?: PdfExportMode;
}) {
  const { cover, values, mode = 'standard' } = input;
  const visiblePdf = await pdf(
    <CoverTemplate key={cover.title} values={values} />,
  ).toBlob();
  const document = await PDFDocument.load(await visiblePdf.arrayBuffer());
  if (document.getPageCount() !== 1) {
    throw new Error(
      `PDF preflight failed: expected one page, generated ${document.getPageCount()}.`,
    );
  }

  const generatedAt = new Date();
  const embedded = await createEmbeddedCoverData(
    cover,
    generatedAt.toISOString(),
  );
  await document.attach(
    new TextEncoder().encode(JSON.stringify(embedded)),
    'ruet-cover.json',
    {
      mimeType: 'application/json',
      description:
        'Versioned RUET cover form data for accurate local re-import',
      creationDate: generatedAt,
      modificationDate: generatedAt,
    },
  );
  document.setTitle(
    `${cover.course.code || 'RUET'} ${cover.coverType}${cover.itemNumber ? ` ${cover.itemNumber}` : ''}`,
  );
  document.setAuthor(cover.student.name || 'RUET student');
  document.setCreator('RUET Cover Page Generator');
  document.setProducer('RUET Cover Page Generator 1.0.0');
  document.setSubject('ruet-cover-schema=1');
  document.setKeywords([
    'RUET',
    'cover page',
    'ruet-cover-schema:1',
    `template:${cover.template.stableKey ?? 'general'}`,
    `template-version:${cover.template.version ?? 'manual'}`,
  ]);
  document.setCreationDate(generatedAt);
  document.setModificationDate(generatedAt);

  const bytes = await document.save({
    useObjectStreams: mode !== 'high-quality',
    objectsPerTick: mode === 'compressed' ? 100 : 50,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });
  const output = new Uint8Array(bytes.byteLength);
  output.set(bytes);
  return new Blob([output.buffer], { type: 'application/pdf' });
}
