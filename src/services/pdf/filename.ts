import type { CoverFormData } from '@shared/domain-contracts';

export const DEFAULT_FILENAME_PATTERN =
  '{department}-{courseCode}_{roll}_{type}-{itemNumber}.pdf';
export const MAX_FILENAME_LENGTH = 120;

const departmentNames: Record<string, string> = {
  Architecture: 'Arch',
  'Building Engineering & Construction Management': 'BECM',
  'Chemical Engineering': 'ChE',
  'Civil Engineering': 'CE',
  'Computer Science & Engineering': 'CSE',
  'Electrical & Computer Engineering': 'ECE',
  'Electrical & Electronic Engineering': 'EEE',
  'Electronics & Telecommunication Engineering': 'ETE',
  'Ceramic & Metallurgical Engineering': 'CME',
  'Industrial & Production Engineering': 'IPE',
  'Materials Science & Engineering': 'MSE',
  'Mechanical Engineering': 'ME',
  'Mechatronics Engineering': 'MTE',
  'Urban & Regional Planning': 'URP',
  Chemistry: 'Chem',
  Mathematics: 'Math',
  Physics: 'Phy',
  Humanities: 'Hum',
};

function shortDepartment(cover: CoverFormData) {
  const department = cover.student.department || cover.course.department;
  const departmentKeyParts = cover.course.departmentKey?.split(/[._-]/);
  return (
    departmentNames[department] ||
    departmentKeyParts?.[departmentKeyParts.length - 1]?.toUpperCase() ||
    department
  );
}

function shortType(type: CoverFormData['coverType']) {
  return type === 'Lab Report' ? 'Lab' : type.replace(/\s+/g, '-');
}

function itemNumber(value: string) {
  return /^\d+$/.test(value) ? value.padStart(2, '0') : value;
}

export function filenameTokens(
  cover: CoverFormData,
  date = new Date(),
): Record<string, string> {
  return {
    department: shortDepartment(cover),
    courseCode: cover.course.code.replace(/\s+/g, ''),
    roll: cover.student.roll,
    type: shortType(cover.coverType),
    itemNumber: itemNumber(cover.itemNumber),
    courseTitle: cover.course.title,
    studentName: cover.student.name,
    date: date.toISOString().slice(0, 10),
  };
}

export function sanitizePdfFilename(
  input: string,
  maxLength = MAX_FILENAME_LENGTH,
) {
  const withoutExtension = input.replace(/\.pdf$/i, '');
  const withoutControls = Array.from(withoutExtension)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && !(code >= 127 && code <= 159);
    })
    .join('');
  let base = withoutControls
    .normalize('NFKC')
    .replace(/\.\.+/g, '-')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/_{2,}/g, '_')
    .replace(/^[-_.]+|[-_.]+$/g, '');

  if (!base || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) {
    base = 'RUET-Cover';
  }
  const available = Math.max(1, maxLength - 4);
  base = base.slice(0, available).replace(/[-_.]+$/g, '');
  return `${base || 'RUET-Cover'}.pdf`;
}

export function buildSmartFilename(
  cover: CoverFormData,
  pattern = cover.filename.pattern || DEFAULT_FILENAME_PATTERN,
  date = new Date(),
) {
  const tokens = filenameTokens(cover, date);
  const rendered = pattern.replace(/\{([a-zA-Z]+)\}/g, (token, key) =>
    key in tokens ? tokens[key] : token,
  );
  return sanitizePdfFilename(rendered);
}

export function resolveDuplicateFilenames(filenames: string[]) {
  const used = new Set<string>();
  return filenames.map((filename) => {
    const clean = sanitizePdfFilename(filename);
    const base = clean.replace(/\.pdf$/i, '');
    let candidate = clean;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = sanitizePdfFilename(`${base}-${suffix}.pdf`);
      suffix += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}
