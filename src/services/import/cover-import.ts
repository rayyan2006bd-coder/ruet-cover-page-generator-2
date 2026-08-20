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
import { Department, designations } from '@/store/editor';

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
  const fields: Array<[string, string | undefined]> = [
    ['student.name', cover.student.name],
    ['student.roll', cover.student.roll],
    ['student.department', cover.student.department],
    ['student.group', cover.student.group],
    ['student.section', cover.student.section],
    ['student.session', cover.student.session],
    ['student.series', cover.student.series],
    ['course.code', cover.course.code],
    ['course.title', cover.course.title],
    ['itemNumber', cover.itemNumber],
    ['title', cover.title],
    ['coverType', cover.coverType],
    ['submissionDate', cover.submissionDate ?? undefined],
    ['experimentDate', cover.experimentDate ?? undefined],
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
    .filter(([, value]) => Boolean(value && String(value).trim()))
    .map(([field, value]) => ({
      field,
      value: String(value).trim(),
      confidence: source === 'embedded-data' ? 1 : 0.88,
      source,
      warnings: [],
    }));
}

const departmentAliases: Record<string, Department> = {
  ipe: Department.IPE,
  'industrial & production engineering': Department.IPE,
  'industrial and production engineering': Department.IPE,
  'industrial & production': Department.IPE,
  'industrial and production': Department.IPE,
  me: Department.ME,
  'mechanical engineering': Department.ME,
  cse: Department.CSE,
  'computer science & engineering': Department.CSE,
  'computer science and engineering': Department.CSE,
  eee: Department.EEE,
  'electrical & electronic engineering': Department.EEE,
  'electrical and electronic engineering': Department.EEE,
  ce: Department.CE,
  'civil engineering': Department.CE,
  ete: Department.ETE,
  'electronics & telecommunication engineering': Department.ETE,
  'electronics and telecommunication engineering': Department.ETE,
  ece: Department.ECE,
  'electrical & computer engineering': Department.ECE,
  'electrical and computer engineering': Department.ECE,
  mte: Department.MTE,
  'mechatronics engineering': Department.MTE,
  cme: Department.CME,
  'ceramic & metallurgical engineering': Department.CME,
  'ceramic and metallurgical engineering': Department.CME,
  mse: Department.MSE,
  'materials science & engineering': Department.MSE,
  'materials science and engineering': Department.MSE,
  che: Department.ChE,
  'chemical engineering': Department.ChE,
  becm: Department.BECM,
  'building engineering & construction management': Department.BECM,
  'building engineering and construction management': Department.BECM,
  urp: Department.URP,
  'urban & regional planning': Department.URP,
  'urban and regional planning': Department.URP,
  arch: Department.Arch,
  architecture: Department.Arch,
  math: Department.Math,
  mathematics: Department.Math,
  phy: Department.Phy,
  physics: Department.Phy,
  chem: Department.Chem,
  chemistry: Department.Chem,
  hum: Department.Hum,
  humanities: Department.Hum,
};

export function fullDepartmentName(value: string): string {
  if (!value?.trim()) return '';
  const cleaned = value
    .replace(/^Dept\.?\s+of\s+/i, '')
    .replace(/,\s*RUET/i, '')
    .replace(/^Department\s+of\s+/i, '')
    .replace(/LAB REPORT/gi, '')
    .replace(/[.&,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  for (const [alias, canonical] of Object.entries(departmentAliases)) {
    if (cleaned === alias || cleaned === alias.toLowerCase()) {
      return canonical;
    }
  }

  for (const [alias, canonical] of Object.entries(departmentAliases)) {
    if (cleaned.startsWith(alias) || alias.startsWith(cleaned)) {
      return canonical;
    }
  }

  const matched = Object.entries(Department).find(
    ([shortName, fullName]) =>
      shortName.toLowerCase() === cleaned ||
      fullName.toLowerCase() === cleaned ||
      fullName.replace(/[.&]/g, '').toLowerCase() === cleaned,
  );
  return matched?.[1] ?? value.trim();
}

export function parseDateIso(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const raw = value.trim();

  // Try direct standard parse
  const direct = new Date(raw);
  if (
    !Number.isNaN(direct.getTime()) &&
    direct.getFullYear() > 1990 &&
    direct.getFullYear() < 2100
  ) {
    return new Date(
      Date.UTC(direct.getFullYear(), direct.getMonth(), direct.getDate()),
    ).toISOString();
  }

  // Match e.g. "19 August 2026", "28 December 2025", "23 April, 2026", "19-08-2026", "19/08/2026"
  const regexMatch = raw.match(
    /(\d{1,2})[\s\-/.]*([A-Za-z]+|\d{1,2})[\s\-/.,]*(\d{4})/,
  );
  if (regexMatch) {
    const day = regexMatch[1];
    const month = regexMatch[2];
    const year = regexMatch[3];
    const candidate = new Date(`${month} ${day}, ${year}`);
    if (!Number.isNaN(candidate.getTime())) {
      return new Date(
        Date.UTC(
          candidate.getFullYear(),
          candidate.getMonth(),
          candidate.getDate(),
        ),
      ).toISOString();
    }
  }
  return null;
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
      joinFragments(line.items.filter((item) => item.x < submittedTo.x - 2)),
    )
    .filter(Boolean);
  const right = columns
    .map((line) =>
      joinFragments(line.items.filter((item) => item.x >= submittedTo.x - 2)),
    )
    .filter(Boolean);

  return [
    ...above.map((line) => joinFragments(line.items)),
    '---SUBMITTED_BY_SECTION---',
    ...left,
    '---SUBMITTED_TO_SECTION---',
    ...right,
    '---BOTTOM_SECTION---',
    ...below.map((line) => joinFragments(line.items)),
  ]
    .filter(Boolean)
    .join('\n');
}

function unweaveInterleavedLines(lines: string[]) {
  const studentLines: string[] = [];
  const teacherLines: string[] = [];

  let inSubmittedSection = false;
  let inLeft = false;
  let inRight = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line === '---SUBMITTED_BY_SECTION---') {
      inSubmittedSection = true;
      inLeft = true;
      inRight = false;
      continue;
    }
    if (line === '---SUBMITTED_TO_SECTION---') {
      inSubmittedSection = true;
      inLeft = false;
      inRight = true;
      continue;
    }
    if (line === '---BOTTOM_SECTION---') {
      break;
    }

    if (/Submitted by\s*:/i.test(line) && /Submitted to\s*:/i.test(line)) {
      inSubmittedSection = true;
      continue;
    }

    if (/Submitted by\s*:/i.test(line) || /Prepared by\s*:/i.test(line)) {
      inSubmittedSection = true;
      inLeft = true;
      inRight = false;
      const after = line.replace(/(?:Submitted|Prepared)\s*by\s*:/i, '').trim();
      if (after) studentLines.push(after);
      continue;
    }

    if (/Submitted to\s*:|Supervised by\s*:|Submitted For\s*:/i.test(line)) {
      inSubmittedSection = true;
      inRight = true;
      inLeft = false;
      const after = line
        .replace(/(?:Submitted to|Supervised by|Submitted For)\s*:/i, '')
        .trim();
      if (after) teacherLines.push(after);
      continue;
    }

    if (/Date of (?:Submission|Experiment)/i.test(line)) {
      break;
    }

    if (inSubmittedSection) {
      if (inLeft) {
        studentLines.push(line);
      } else if (inRight) {
        teacherLines.push(line);
      } else {
        // Interleaved lines (from OCR or non-separated stream)
        const designationMatch = line.match(
          /(Professor|Associate Professor|Assistant Professor|Lecturer)/i,
        );
        const deptRuetMatch = line.match(
          /Dept\.?\s+of\s+.*?RUET|Dept\.?\s+of\s+\w+/i,
        );
        const rollMatch = line.match(/Roll\s*:?\s*\d{7}/i);
        const groupMatch = line.match(/Group\s*:?\s*\w+/i);

        if (rollMatch || groupMatch) {
          if (deptRuetMatch && rollMatch) {
            const rollPart = line
              .substring(0, line.indexOf(deptRuetMatch[0]))
              .trim();
            const teacherPart = line
              .substring(line.indexOf(deptRuetMatch[0]))
              .trim();
            if (rollPart) studentLines.push(rollPart);
            if (teacherPart) teacherLines.push(teacherPart);
          } else if (designationMatch && groupMatch) {
            const groupPart = line
              .substring(0, line.indexOf(designationMatch[0]))
              .trim();
            const teacherPart = line
              .substring(line.indexOf(designationMatch[0]))
              .trim();
            if (groupPart) studentLines.push(groupPart);
            if (teacherPart) teacherLines.push(teacherPart);
          } else {
            studentLines.push(line);
          }
        } else if (designationMatch || deptRuetMatch) {
          teacherLines.push(line);
        } else {
          // Check for side by side names: e.g. "Souvik Kundu Md. Ariful Islam"
          const words = line.split(/\s+/);
          const mdIdx = words.findIndex(
            (w, idx) => idx > 0 && /^(Md\.?|Dr\.?|Prof\.?|Mr\.?)/i.test(w),
          );
          if (
            mdIdx > 0 &&
            studentLines.length === 0 &&
            teacherLines.length === 0
          ) {
            studentLines.push(words.slice(0, mdIdx).join(' '));
            teacherLines.push(words.slice(mdIdx).join(' '));
          } else if (studentLines.length === 0) {
            studentLines.push(line);
          } else {
            teacherLines.push(line);
          }
        }
      }
    }
  }

  return { studentLines, teacherLines };
}

function parseTeachersFromLines(
  teacherLines: string[],
  fallbackDepartment: string,
): CoverFormData['teachers'] {
  const teachers: CoverFormData['teachers'] = [];
  const desigRegex =
    /(Professor|Associate Professor|Assistant Professor|Lecturer)/i;
  const tLines = teacherLines
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^(Submitted to|Supervised by|Submitted For):?$/i.test(l));

  let currentTeacher: {
    name: string;
    designation: string;
    department: string;
  } | null = null;

  for (let i = 0; i < tLines.length; i++) {
    const line = tLines[i];
    const desigMatch = line.match(desigRegex);

    if (desigMatch) {
      if (teachers.length >= 2) break;
      const designation = desigMatch[1];
      let name = '';
      if (desigMatch.index && desigMatch.index > 0) {
        name = line.substring(0, desigMatch.index).trim();
      } else if (i > 0) {
        name = tLines[i - 1]
          .replace(/(?:Submitted to|Supervised by|Submitted For)\s*:/i, '')
          .trim();
      }

      const canonicalDesig =
        designations.find(
          (d) => d.toLowerCase() === designation.toLowerCase(),
        ) ?? designation;

      currentTeacher = {
        name: name.replace(/^Dr\.?\s*/i, 'Dr. ').trim(),
        designation: canonicalDesig,
        department: fallbackDepartment || Department.IPE,
      };
      teachers.push({
        stableKey: null,
        name: currentTeacher.name,
        designation: currentTeacher.designation,
        department: currentTeacher.department,
        source: 'manual',
      });
    } else if (/Dept\.?\s+of\s+/i.test(line) || /RUET/i.test(line)) {
      if (teachers.length > 0) {
        const last = teachers[teachers.length - 1];
        last.department = fullDepartmentName(line);
      }
    }
  }

  return teachers;
}

export function parseRuetCoverText(
  text: string,
  pageCount: number,
  source: SmartImportResult['source'] = 'pdf-text',
): SmartImportResult {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const normalized = text
    .replace(/---[A-Z_]+---/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Student Department from header
  const deptMatch = normalized.match(
    /Department of\s+([A-Za-z\s&]+?)(?=\s+(?:Rajshahi|LAB REPORT|Lab Report|Course|Assignment|Report)|$)/i,
  );
  const headerDepartment = deptMatch ? fullDepartmentName(deptMatch[1]) : '';

  // 2. Cover Type
  let coverType: CoverFormData['coverType'] = 'Lab Report';
  if (/\bThesis\b/i.test(normalized) || /\bDissertation\b/i.test(normalized)) {
    coverType = 'Thesis';
  } else if (
    /Assignment No\./i.test(normalized) ||
    /\bAssignment\b/i.test(normalized)
  ) {
    coverType = 'Assignment';
  } else if (
    /Report No\./i.test(normalized) ||
    /\bProject Report\b/i.test(normalized)
  ) {
    coverType = 'Report';
  } else if (
    /Lab Report/i.test(normalized) ||
    /Experiment No/i.test(normalized)
  ) {
    coverType = 'Lab Report';
  }

  // 3. Course Code & Course Title
  const courseCodeMatch = normalized.match(
    /Course\s*(?:No\.?|Code|Number)\s*:\s*([A-Za-z0-9\s-]+?)(?=\s+Course Title|\s+Experiment|\s+Assignment|\s+Name of|\s+Submitted by|$)/i,
  );
  const courseCode = courseCodeMatch ? courseCodeMatch[1].trim() : '';

  const courseTitleMatch = normalized.match(
    /Course Title\s*:\s*([^\n\r]+?)(?=\s+(?:Experiment|Assignment|Report) No\.?|\s+Name of the|\s+Submitted by|\s+LAB REPORT|\s+Assignment Title|$)/i,
  );
  const courseTitle = courseTitleMatch ? courseTitleMatch[1].trim() : '';

  // 4. Item Number and Title
  let itemNumber = '';
  const itemNoMatch = normalized.match(
    /(?:Experiment|Assignment|Report)\s*(?:No\.?|Number)\s*:\s*([0-9A-Za-z-]+)(?=\s+(?:Name of|Assignment Title|Experiment Title|Submitted by)|$)/i,
  );
  if (
    itemNoMatch &&
    !/^(name|title|submitted|group|roll)/i.test(itemNoMatch[1].trim())
  ) {
    itemNumber = itemNoMatch[1].trim();
  }

  let title = '';
  const titleMatch = normalized.match(
    /(?:Name of the Experiment|Experiment Title|Assignment Title|Report Title|Title of the Experiment)\s*:\s*([^\n\r]+?)(?=\s+Submitted by|\s+Submitted to|\s+Date of|$)/i,
  );
  if (titleMatch && !/^(submitted|group|roll)/i.test(titleMatch[1].trim())) {
    title = titleMatch[1].trim();
  }

  // 5. Dates
  const expDateMatch = normalized.match(
    /Date of Experiment\s*:?\s*([0-9A-Za-z\s,\-/.]+?)(?=\s+Date of Submission|\s+Submitted by|\s+Submitted to|$)/i,
  );
  const experimentDate = expDateMatch ? parseDateIso(expDateMatch[1]) : null;

  const subDateMatch = normalized.match(
    /Date of Submission\s*:?\s*([0-9A-Za-z\s,\-/.]+?)(?=\s+Submitted by|\s+Submitted to|$)/i,
  );
  const submissionDate = subDateMatch ? parseDateIso(subDateMatch[1]) : null;

  // 6. Two-column un-weaving for Student & Teacher details
  const { studentLines, teacherLines } = unweaveInterleavedLines(lines);

  // Student Roll
  const rollMatch =
    normalized.match(/Roll\s*:?\s*([0-9](?:\s*[0-9]){6})/i) ||
    studentLines.join(' ').match(/Roll\s*:?\s*([0-9](?:\s*[0-9]){6})/i);
  const roll = rollMatch ? rollMatch[1].replace(/\s+/g, '') : '';

  // Student Group & Section
  const groupMatch =
    studentLines.join(' ').match(/Group\s*:?\s*([0-9A-Za-z]+)/i) ||
    normalized.match(/Group\s*:?\s*([0-9A-Za-z]+)/i);
  const studentGroup = groupMatch ? groupMatch[1].trim() : '';

  const sectionMatch =
    studentLines.join(' ').match(/Section\s*:?\s*([0-9A-Za-z]+)/i) ||
    normalized.match(/Section\s*:?\s*([0-9A-Za-z]+)/i);
  const studentSection = sectionMatch ? sectionMatch[1].trim() : '';

  // Student Name
  let studentName = '';
  for (const sLine of studentLines) {
    const cleaned = sLine
      .replace(/(?:Submitted|Prepared)\s*by\s*:/i, '')
      .replace(/Group\s*:?\s*\w+/i, '')
      .replace(/Roll\s*:?\s*[\d\s]+/i, '')
      .replace(/Section\s*:?\s*\w+/i, '')
      .replace(/[^\w\s.-]/g, '')
      .trim();
    if (
      cleaned &&
      !cleaned.toLowerCase().includes('submitted') &&
      !cleaned.toLowerCase().includes('roll') &&
      !cleaned.toLowerCase().includes('group')
    ) {
      studentName = cleaned;
      break;
    }
  }

  // Fallback for student name if single regex matches
  if (!studentName) {
    const singleRegex = normalized.match(
      /(?:Submitted|Prepared)\s*by\s*:\s*(.*?)(?=\s+(?:Group|Roll|Section)\s*:)/i,
    );
    if (singleRegex) {
      studentName = singleRegex[1].replace(/Submitted to\s*:/i, '').trim();
    }
  }

  // Parse Teachers
  const teachers = parseTeachersFromLines(teacherLines, headerDepartment);
  if (teachers.length === 0) {
    // Try fallback regex from entire teacher block
    const teacherBlock =
      normalized.match(
        /(?:Submitted to|Supervised by|Submitted For):\s*(.*?)(?:\s+Date of Experiment|\s+Date of Submission|$)/i,
      )?.[1] ?? '';
    const fallbackExp =
      /(.*?)(?:\s+)(Lecturer|Assistant Professor|Associate Professor|Professor)\s+(?:Dept\.?\s+of\s+)?(.*?)(?:,\s*RUET(?=\s|$)|$)/gi;
    for (const result of teacherBlock.matchAll(fallbackExp)) {
      const name = result[1]
        ?.replace(/^(?:Submitted to|Supervised by):?\s*/i, '')
        .trim();
      const designation = result[2]?.trim();
      const department = result[3]?.trim();
      teachers.push({
        stableKey: null,
        name: name.replace(/^Dr\.?\s*/i, 'Dr. '),
        designation,
        department: fullDepartmentName(department || headerDepartment),
        source: 'manual',
      });
      if ((teachers as Array<unknown>).length >= 2) break;
    }
  }

  const finalDepartment = headerDepartment || Department.IPE;

  const cover = coverFormDataSchema.parse({
    schemaVersion: 1,
    student: {
      name: studentName,
      roll,
      group: studentGroup,
      section: studentSection,
      department: finalDepartment,
    },
    course: {
      code: courseCode,
      title: courseTitle,
      department: finalDepartment,
    },
    teachers,
    coverType,
    itemNumber,
    title,
    experimentDate,
    submissionDate,
  });

  const warnings: string[] = [
    !studentName ? 'Student name was not detected.' : '',
    !roll ? 'Roll number was not detected.' : '',
    !courseCode ? 'Course code was not detected.' : '',
    !courseTitle ? 'Course title was not detected.' : '',
    teachers.length === 0 ? 'Teacher name was not detected.' : '',
  ].filter(Boolean);

  return smartImportResultSchema.parse({
    schemaVersion: 1,
    source,
    pageCount,
    fields: extractedFields(cover, source),
    cover,
    warnings,
  });
}

export function parsePositionedRuetCoverText(
  items: PositionedTextItem[],
  pageCount: number,
) {
  return parseRuetCoverText(
    buildCoverReadingOrder(items),
    pageCount,
    'pdf-text',
  );
}

export type ImportProgressCallback = (progress: {
  stage: 'reading' | 'ocr' | 'parsing' | 'done';
  percent: number;
  message: string;
}) => void;

export async function recognizeImageWithOcr(
  imageSource: HTMLCanvasElement | Blob | File | string,
  onProgress?: ImportProgressCallback,
): Promise<string> {
  onProgress?.({
    stage: 'ocr',
    percent: 30,
    message: 'Loading OCR engine...',
  });

  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        const pct = Math.min(
          95,
          Math.max(30, Math.round(30 + m.progress * 65)),
        );
        onProgress?.({
          stage: 'ocr',
          percent: pct,
          message: `Recognizing text (${Math.round(m.progress * 100)}%)...`,
        });
      }
    },
  });

  try {
    const ret = await worker.recognize(imageSource);
    return ret.data.text;
  } finally {
    await worker.terminate();
  }
}

export async function importCoverFile(
  file: File,
  onProgress?: ImportProgressCallback,
): Promise<SmartImportResult> {
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('Choose a PDF or image no larger than 25 MB.');
  }

  const isPdf =
    /pdf/i.test(file.type) || file.name.toLowerCase().endsWith('.pdf');
  const isImage =
    /image/i.test(file.type) || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);

  if (!isPdf && !isImage) {
    throw new Error(
      'Please select a PDF document or an image file (.pdf, .png, .jpg, .webp).',
    );
  }

  onProgress?.({
    stage: 'reading',
    percent: 15,
    message: 'Reading document...',
  });

  if (isImage) {
    onProgress?.({
      stage: 'ocr',
      percent: 35,
      message: 'Running OCR on image...',
    });
    const ocrText = await recognizeImageWithOcr(file, onProgress);
    onProgress?.({
      stage: 'parsing',
      percent: 95,
      message: 'Analyzing cover fields...',
    });
    const parsed = parseRuetCoverText(ocrText, 1, 'ocr');
    onProgress?.({
      stage: 'done',
      percent: 100,
      message: 'Extraction complete!',
    });
    return parsed;
  }

  // Process PDF
  const bytes = new Uint8Array(await file.arrayBuffer());
  const document = await getDocument({ data: bytes }).promise;

  try {
    if (document.numPages > 20) {
      throw new Error('Choose a cover PDF with no more than 20 pages.');
    }

    onProgress?.({
      stage: 'reading',
      percent: 30,
      message: 'Checking for embedded cover data...',
    });

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
      onProgress?.({
        stage: 'done',
        percent: 100,
        message: 'Cover restored from embedded data!',
      });
      return smartImportResultSchema.parse({
        schemaVersion: 1,
        source: 'embedded-data',
        pageCount: document.numPages,
        fields: extractedFields(parsed.cover, 'embedded-data'),
        cover: parsed.cover,
        warnings: [],
      });
    }

    onProgress?.({
      stage: 'reading',
      percent: 50,
      message: 'Extracting selectable text...',
    });

    const page = await document.getPage(1);
    const content = await page.getTextContent();
    const positionedText: PositionedTextItem[] = content.items.flatMap(
      (item) =>
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

    const text = buildCoverReadingOrder(positionedText);

    // If selectable text is sufficient, parse it directly
    if (text.replace(/\s/g, '').length >= 35) {
      page.cleanup();
      onProgress?.({
        stage: 'parsing',
        percent: 90,
        message: 'Analyzing cover fields...',
      });
      const parsed = parsePositionedRuetCoverText(
        positionedText,
        document.numPages,
      );
      onProgress?.({
        stage: 'done',
        percent: 100,
        message: 'PDF fields extracted successfully!',
      });
      return parsed;
    }

    // Scanned / Image-only PDF -> Render to Canvas & run OCR
    onProgress?.({
      stage: 'ocr',
      percent: 60,
      message: 'Rendering page for OCR recognition...',
    });

    if (
      typeof window !== 'undefined' &&
      typeof window.document?.createElement === 'function'
    ) {
      const canvas = window.document.createElement('canvas');
      const viewport = page.getViewport({ scale: 2.0 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await (
          page as unknown as {
            render: (params: {
              canvasContext: CanvasRenderingContext2D;
              viewport: unknown;
            }) => { promise: Promise<void> };
          }
        ).render({ canvasContext: ctx, viewport }).promise;
        page.cleanup();
        const ocrText = await recognizeImageWithOcr(canvas, onProgress);
        onProgress?.({
          stage: 'parsing',
          percent: 95,
          message: 'Extracting fields from OCR text...',
        });
        const parsed = parseRuetCoverText(ocrText, document.numPages, 'ocr');
        onProgress?.({
          stage: 'done',
          percent: 100,
          message: 'OCR extraction complete!',
        });
        return parsed;
      }
    }

    page.cleanup();
    throw new Error(
      'This PDF has no selectable text and OCR could not be initialized.',
    );
  } finally {
    await document.destroy();
  }
}
