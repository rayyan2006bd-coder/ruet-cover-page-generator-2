import { beforeEach, describe, expect, test } from 'bun:test';
import 'fake-indexeddb/auto';
import {
  coverFormDataSchema,
  type Draft,
  type StudentProfile,
} from '@shared/domain-contracts';
import {
  clearAllLocalWorkspaceData,
  exportLocalBackup,
  getLatestDraft,
  importLocalBackup,
  listDrafts,
  listProfiles,
  migrateLocalDatabase,
  saveDraft,
  saveProfile,
} from './database';

const timestamp = '2026-08-11T00:00:00.000Z';

function profile(label: string, isDefault: boolean): StudentProfile {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    label,
    identity: {
      name: `${label} Student`,
      roll: '',
      session: '',
      series: '',
      section: '',
      group: '',
      department: '',
    },
    lockedFields: [],
    isDefault,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function draft(name: string, updatedAt: string): Draft {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name,
    cover: coverFormDataSchema.parse({
      schemaVersion: 1,
      student: {},
      course: {},
      title: name,
    }),
    snapshots: [],
    snapshotIndex: 0,
    createdAt: timestamp,
    updatedAt,
  };
}

beforeEach(async () => {
  await clearAllLocalWorkspaceData();
});

describe('versioned local workspace database', () => {
  test('migrates idempotently and maintains one default profile', async () => {
    expect(await migrateLocalDatabase()).toBe(1);
    expect(await migrateLocalDatabase()).toBe(1);
    await saveProfile(profile('First', true));
    const second = profile('Second', true);
    await saveProfile(second);

    const profiles = await listProfiles();
    expect(profiles).toHaveLength(2);
    expect(profiles.filter((item) => item.isDefault)).toEqual([second]);
  });

  test('tracks the active draft while keeping drafts sorted', async () => {
    const older = draft('Older', '2026-08-11T00:01:00.000Z');
    const newer = draft('Newer', '2026-08-11T00:02:00.000Z');
    await saveDraft(newer);
    await saveDraft(older);

    expect((await listDrafts()).map((item) => item.name)).toEqual([
      'Newer',
      'Older',
    ]);
    expect((await getLatestDraft())?.id).toBe(older.id);
  });

  test('exports, validates, and replaces a backup', async () => {
    const existing = profile('Existing', false);
    await saveProfile(existing);
    const backup = await exportLocalBackup();
    expect(backup.filename.pattern).toContain('{courseCode}');

    const replacement = profile('Replacement', true);
    await importLocalBackup({ ...backup, profiles: [replacement] }, 'replace');
    expect(await listProfiles()).toEqual([replacement]);

    expect(
      importLocalBackup({ ...backup, schemaVersion: 999 }, 'replace'),
    ).rejects.toThrow();
  });
});
