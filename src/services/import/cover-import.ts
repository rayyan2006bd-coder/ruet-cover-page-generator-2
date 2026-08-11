import {
  type CoverFormData,
  coverFormDataSchema,
  embeddedPdfCoverDataSchema,
  type SmartImportResult,
  smartImportResultSchema,
} from '@shared/domain-contracts';
import {
  GlobalWorkerOptions,
  getDocument,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Department } from '@/store/editor';

GlobalWorkerOptions.workerSrc = new URL(
  '../../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function extractedFields(
  cover: CoverFormData,
  source: SmartImportResult['source'],
) {
  const fields = [
    ['student.name', cover.student.name],
    ['student.roll', cover.student.roll],
    ['student.department', cover.student.department],
    ['student.group', cover.student.group],
    ['course.code', cover.course.code],
    ['course.title', cover.course.title],
    ['itemNumber', cover.itemNumber],
    ['title', cover.title],
  ];
  cover.teachers.forEach((teacher, index) => {
    const prefix = index === 0 ? 'teacher' : `teacher.${index + 1}`;
    fields.push(
      [`${prefix}.name`, teacher.name],
      [`${prefix}.designation`, teacher.designation],
      [`${prefix}.department`, teacher.department],
    );
  });
  return fields
    .filter(([, value]) => Boolean(value))
    .map(([field, value]) => ({
      field,
      value,
      confidence: source === 'embedded-data' ? 1 : 0.78,
      source,
      warnings: [],
    }));
}

function match(text: string, expression: RegExp) {
  return text.match(expression)?.[1]?.trim() ?? '';
}

function dateIso(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? null
    : new Date(
        Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
      ).toISOString();
}

export type PositionedTextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type TextLine = {
  y: number;
  items: PositionedTextItem[];
};

function joinFragments(items: PositionedTextItem[]) {
  return [...items]
    .sort((left, right) => left.x - right.x)
    .reduce((line, item, index, sorted) => {
      const text = item.text.trim();
      if (!text) return line;
      const previous = sorted[index - 1];
      if (!previous || !line) return text;
      const gap = item.x - (previous.x + previous.width);
      const separate =
        gap > Math.max(1.5, Math.min(previous.height, item.height) * 0.12) ||
        text === '-' ||
        previous.text.trim() === '-';
      return `${line}${separate ? ' ' : ''}${text}`;
    }, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function groupTextLines(items: PositionedTextItem[]) {
  const lines: TextLine[] = [];
  for (const item of [...items].sort((left, right) => right.y - left.y)) {
    if (!item.text.trim()) continue;
    const tolerance = Math.max(2, item.height * 0.2);
    const line = lines.find(
      (candidate) => Math.abs(candidate.y - item.y) <= tolerance,
    );
    if (line) {
      line.items.push(item);
      line.y = (line.y * (line.items.length - 1) + item.y) / line.items.length;
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }
  return lines.sort((left, right) => right.y - left.y);
}

export function buildCoverReadingOrder(items: PositionedTextItem[]) {
  const lines = groupTextLines(items);
  const submittedLine = lines.find(
    (line) =>
      line.items.some((item) => /Submitted by\s*:/i.test(item.text)) &&
      line.items.some((item) => /Submitted to\s*:/i.test(item.text)),
  );
  if (!submittedLine) {
    return lines.map((line) => joinFragments(line.items)).join('\n');
  }

  const submittedTo = submittedLine.items.find((item) =>
    /Submitted to\s*:/i.test(item.text),
  );
  if (!submittedTo) {
    return lines.map((line) => joinFragments(line.items)).join('\n');
  }
  const dateLine = lines.find(
    (line) =>
      line.y < submittedLine.y &&
      line.items.some((item) =>
        /Date of (?:Experiment|Submission)/i.test(item.text),
      ),
  );
  const columnBottom = dateLine?.y ?? Number.NEGATIVE_INFINITY;
  const above = lines.filter((line) => line.y > submittedLine.y + 2);
  const columns = lines.filter(
    (line) => line.y <= submittedLine.y + 2 && line.y > columnBottom + 2,
  );
  const below = lines.filter((line) => line.y <= columnBottom + 2);
  const left = columns
    .map((line) =>
      joinFragments(line.items.filter((item) => item.x < submittedTo.x)),
    )
    .filter(Boolean);
  const right = columns
    .map((line) =>
      joinFragments(line.items.filter((item) => item.x >= submittedTo.x)),
    )
    .filter(Boolean);

  return [
    ...above.map((line) => joinFragments(line.items)),
    ...left,
    ...right,
    ...below.map((line) => joinFragments(line.items)),
  ]
    .filter(Boolean)
    .join('\n');
}

function fullDepartmentName(value: string) {
  const normalized = value.replace(/[.&]/g, '').trim().toLowerCase();
  return (
    Object.entries(Department).find(
      ([shortName, fullName]) =>
        shortName.toLowerCase() === normalized ||
        fullName.replace(/[.&]/g, '').toLowerCase() === normalized,
    )?.[1] ?? value.trim()
  );
}

function parseTeachers(block: string) {
  const teachers: CoverFormData['teachers'] = [];
  const expression =
    /(.*?)(?:\s+)(Lecturer|Assistant Professor|Associate Professor|Professor)\s+Dept\.?\s+of\s+(.*?),\s*RUET(?=\s|$)/gi;
  for (const result of block.matchAll(expression)) {
    const name = result[1]?.trim();
    const designation = result[2]?.trim();
    const department = result[3]?.trim();
    if (!name || !designation || !department) continue;
    teachers.push({
      stableKey: null,
      name,
      designation,
      department: fullDepartmentName(department),
      source: 'manual',
    });
    if (teachers.length === 2) break;
  }
  return teachers;
}

export function parseRuetCoverText(
  text: string,
  pageCount: number,
): SmartImportResult {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const roll = match(normalized, /Roll\s*:\s*([0-9](?:\s*[0-9]){6})/i).replace(
    /\s/g,
    '',
  );
  const studentName = match(
    normalized,
    /Submitted by\s*:\s*(.*?)(?=\s+(?:Group|Roll|Section)\s*:)/i,
  );
  const studentGroup = match(normalized, /Group\s*:\s*([^\s]+)/i);
  const department = match(
    normalized,
    /Department of\s+(.*?)(?:\s+Rajshahi University|\s+Course (?:No\.|Code))/i,
  );
  const courseCode = match(
    normalized,
    /Course (?:No\.|Code):\s*(.*?)\s+Course Title:/i,
  );
  const courseTitle = match(
    normalized,
    /Course Title\s*:\s*(.*?)(?:\s+(?:Lab Report|Assignment|Report|Thesis)|\s+(?:Experiment|Assignment|Report) No\.?)/i,
  );
  const teacherBlock = match(
    normalized,
    /(?:Submitted to|Supervised by):\s*(.*?)(?:\s+Date of Experiment|\s+Date of Submission|$)/i,
  );
  const teachers = parseTeachers(teacherBlock);
  const coverType: CoverFormData['coverType'] = /\bThesis\b/i.test(normalized)
    ? 'Thesis'
    : /Assignment No\./i.test(normalized)
      ? 'Assignment'
      : /Report No\./i.test(normalized)
        ? 'Report'
        : 'Lab Report';
  const itemLabel = coverType === 'Lab Report' ? 'Experiment' : coverType;
  const itemNumber = match(
    normalized,
    new RegExp(`${itemLabel} No\\.?\\s*:?\\s*([^ ]+)`, 'i'),
  );
  const title = match(
    normalized,
    new RegExp(
      `${itemLabel} Title\\s*:?\\s*(.*?)(?:\\s+Submitted by\\s*:|$)`,
      'i',
    ),
  );
  const experimentDate = dateIso(
    match(
      normalized,
      /Date of Experiment\s*:?\s*(.*?)(?:\s+Date of Submission|\s+Submitted by\s*:)/i,
    ),
  );
  const submissionDate = dateIso(
    match(
      normalized,
      /Date of Submission\s*:?\s*(.*?)(?:\s+Submitted by\s*:|$)/i,
    ),
  );
  const cover = coverFormDataSchema.parse({
    schemaVersion: 1,
    student: {
      name: studentName,
      roll,
      group: studentGroup,
      department,
    },
    course: { code: courseCode, title: courseTitle, department },
    teachers,
    coverType,
    itemNumber,
    title,
    experimentDate,
    submissionDate,
  });
  const warnings = [
    !studentName ? 'Student name was not detected.' : '',
    !roll ? 'Roll number was not detected.' : '',
    !courseCode ? 'Course code was not detected.' : '',
    !courseTitle ? 'Course title was not detected.' : '',
    teachers.length === 0 ? 'Teacher name was not detected.' : '',
  ].filter(Boolean);
  return smartImportResultSchema.parse({
    schemaVersion: 1,
    source: 'pdf-text',
    pageCount,
    fields: extractedFields(cover, 'pdf-text'),
    cover,
    warnings,
  });
}

export function parsePositionedRuetCoverText(
  items: PositionedTextItem[],
  pageCount: number,
) {
  return parseRuetCoverText(buildCoverReadingOrder(items), pageCount);
}

export async function importCoverFile(file: File): Promise<SmartImportResult> {
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('Choose a PDF or image no larger than 25 MB.');
  }
  if (!/pdf/i.test(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error(
      'Scanned-image OCR requires the bundled English language asset, which is not installed in this build.',
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const document = await getDocument({ data: bytes }).promise;
  try {
    if (document.numPages > 20) {
      throw new Error('Choose a cover PDF with no more than 20 pages.');
    }
    const attachments = await document.getAttachments();
    const attachment = attachments
      ? (
          Object.values(attachments) as Array<{
            filename: string;
            content: Uint8Array;
          }>
        ).find((item) => item.filename.toLowerCase() === 'ruet-cover.json')
      : undefined;
    if (attachment) {
      const parsed = embeddedPdfCoverDataSchema.parse(
        JSON.parse(new TextDecoder().decode(attachment.content)),
      );
      if ((await sha256(JSON.stringify(parsed.cover))) !== parsed.checksum) {
        throw new Error('Embedded cover data checksum verification failed.');
      }
      return smartImportResultSchema.parse({
        schemaVersion: 1,
        source: 'embedded-data',
        pageCount: document.numPages,
        fields: extractedFields(parsed.cover, 'embedded-data'),
        cover: parsed.cover,
        warnings: [],
      });
    }

    const page = await document.getPage(1);
    const content = await page.getTextContent();
    const positionedText = content.items.flatMap((item) =>
      'str' in item && item.str.trim()
        ? [
            {
              text: item.str,
              x: item.transform[4] ?? 0,
              y: item.transform[5] ?? 0,
              width: item.width,
              height: item.height,
            },
          ]
        : [],
    );
    page.cleanup();
    const text = buildCoverReadingOrder(positionedText);
    if (text.replace(/\s/g, '').length < 40) {
      throw new Error(
        'This PDF has no usable selectable text. Offline OCR needs the bundled English language asset, which is not installed in this build.',
      );
    }
    return parsePositionedRuetCoverText(positionedText, document.numPages);
  } finally {
    await document.destroy();
  }
}
