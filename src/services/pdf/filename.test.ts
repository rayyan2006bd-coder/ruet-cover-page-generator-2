import { describe, expect, test } from 'bun:test';
import { coverFormDataSchema } from '@shared/domain-contracts';
import {
  buildSmartFilename,
  resolveDuplicateFilenames,
  sanitizePdfFilename,
} from './filename';

const cover = coverFormDataSchema.parse({
  schemaVersion: 1,
  student: {
    name: 'A Student',
    roll: '2405016',
    department: 'Industrial & Production Engineering',
  },
  course: { code: '2102', title: 'Manufacturing Process' },
  coverType: 'Lab Report',
  itemNumber: '1',
});

describe('smart PDF filenames', () => {
  test('renders the documented default example', () => {
    expect(buildSmartFilename(cover, undefined, new Date('2026-08-11'))).toBe(
      'IPE-2102_2405016_Lab-01.pdf',
    );
  });

  test('removes path traversal and invalid filesystem characters', () => {
    expect(sanitizePdfFilename('../../CON:<bad>|name?.PDF')).toBe(
      'CON-bad-name.pdf',
    );
    expect(sanitizePdfFilename('')).toBe('RUET-Cover.pdf');
  });

  test('keeps filenames bounded and preserves the extension', () => {
    const filename = sanitizePdfFilename('a'.repeat(300));
    expect(filename.length).toBeLessThanOrEqual(120);
    expect(filename.endsWith('.pdf')).toBe(true);
  });

  test('resolves collisions case-insensitively', () => {
    expect(
      resolveDuplicateFilenames(['Cover.pdf', 'cover.pdf', 'Cover.pdf']),
    ).toEqual(['Cover.pdf', 'cover-2.pdf', 'Cover-3.pdf']);
  });
});
