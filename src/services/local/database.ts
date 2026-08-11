import {
  type CoursePreset,
  type CoverHistoryRecord,
  coursePresetSchema,
  coverHistoryRecordSchema,
  type DatasetExport,
  type Draft,
  datasetExportSchema,
  draftSchema,
  LOCAL_SCHEMA_VERSION,
  type LocalBackup,
  localBackupSchema,
  type StudentProfile,
  studentProfileSchema,
} from '@shared/domain-contracts';
import * as idbKeyVal from 'idb-keyval';
import { z } from 'zod';

export const localDataStore = idbKeyVal.createStore(
  'ruet-cover-local-v1',
  'entities',
);

const keys = {
  schemaVersion: 'meta:schema-version',
  profiles: 'profiles',
  presets: 'presets',
  drafts: 'drafts',
  history: 'history',
  activeDirectory: 'directory:active',
  previousDirectory: 'directory:previous',
  activeDraftId: 'draft:active-id',
} as const;

const profilesSchema = z.array(studentProfileSchema);
const presetsSchema = z.array(coursePresetSchema);
const draftsSchema = z.array(draftSchema);
const historySchema = z.array(coverHistoryRecordSchema);

async function readValue<T>(key: string, schema: z.ZodType<T>, fallback: T) {
  const parsed = schema.safeParse(await idbKeyVal.get(key, localDataStore));
  return parsed.success ? parsed.data : fallback;
}

async function writeValue<T>(key: string, schema: z.ZodType<T>, value: T) {
  const parsed = schema.parse(value);
  await idbKeyVal.set(key, parsed, localDataStore);
  return parsed;
}

export async function migrateLocalDatabase() {
  const current = await idbKeyVal.get(keys.schemaVersion, localDataStore);
  if (current === LOCAL_SCHEMA_VERSION) return LOCAL_SCHEMA_VERSION;
  if (typeof current === 'number' && current > LOCAL_SCHEMA_VERSION) {
    throw new Error('Local data was created by a newer application version');
  }
  // Version 1 introduces versioned collections. Existing localStorage values and
  // the legacy teacher/title stores remain untouched and are migrated lazily by
  // their existing compatibility readers.
  await idbKeyVal.set(keys.schemaVersion, LOCAL_SCHEMA_VERSION, localDataStore);
  return LOCAL_SCHEMA_VERSION;
}

export async function listProfiles() {
  await migrateLocalDatabase();
  return readValue(keys.profiles, profilesSchema, []);
}

export async function saveProfile(profile: StudentProfile) {
  const nextProfile = studentProfileSchema.parse(profile);
  const profiles = await listProfiles();
  const next = profiles
    .filter((item) => item.id !== nextProfile.id)
    .map((item) =>
      nextProfile.isDefault ? { ...item, isDefault: false } : item,
    );
  next.push(nextProfile);
  return writeValue(keys.profiles, profilesSchema, next);
}

export async function deleteProfile(id: string) {
  const profiles = await listProfiles();
  return writeValue(
    keys.profiles,
    profilesSchema,
    profiles.filter((profile) => profile.id !== id),
  );
}

export async function listPresets() {
  await migrateLocalDatabase();
  return readValue(keys.presets, presetsSchema, []);
}

export async function savePreset(preset: CoursePreset) {
  const nextPreset = coursePresetSchema.parse(preset);
  const presets = await listPresets();
  return writeValue(keys.presets, presetsSchema, [
    ...presets.filter((item) => item.id !== nextPreset.id),
    nextPreset,
  ]);
}

export async function deletePreset(id: string) {
  return writeValue(
    keys.presets,
    presetsSchema,
    (await listPresets()).filter((preset) => preset.id !== id),
  );
}

export async function listDrafts() {
  await migrateLocalDatabase();
  return readValue(keys.drafts, draftsSchema, []);
}

export async function saveDraft(draft: Draft) {
  const nextDraft = draftSchema.parse(draft);
  const drafts = await listDrafts();
  await idbKeyVal.set(keys.activeDraftId, nextDraft.id, localDataStore);
  return writeValue(
    keys.drafts,
    draftsSchema,
    [...drafts.filter((item) => item.id !== nextDraft.id), nextDraft].sort(
      (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    ),
  );
}

export async function deleteDraft(id: string) {
  const activeId = await idbKeyVal.get(keys.activeDraftId, localDataStore);
  if (activeId === id) await idbKeyVal.del(keys.activeDraftId, localDataStore);
  return writeValue(
    keys.drafts,
    draftsSchema,
    (await listDrafts()).filter((draft) => draft.id !== id),
  );
}

export async function getLatestDraft() {
  const drafts = await listDrafts();
  const activeId = await idbKeyVal.get(keys.activeDraftId, localDataStore);
  return drafts.find((draft) => draft.id === activeId) ?? drafts[0] ?? null;
}

export async function listCoverHistory() {
  await migrateLocalDatabase();
  return readValue(keys.history, historySchema, []);
}

export async function saveCoverHistoryRecord(record: CoverHistoryRecord) {
  return saveCoverHistoryRecords([record]);
}

export async function saveCoverHistoryRecords(records: CoverHistoryRecord[]) {
  const nextRecords = historySchema.parse(records);
  const history = await listCoverHistory();
  const incomingIds = new Set(nextRecords.map((record) => record.id));
  return writeValue(
    keys.history,
    historySchema,
    [
      ...nextRecords,
      ...history.filter((item) => !incomingIds.has(item.id)),
    ].slice(0, 100),
  );
}

export async function deleteCoverHistoryRecord(id: string) {
  return writeValue(
    keys.history,
    historySchema,
    (await listCoverHistory()).filter((record) => record.id !== id),
  );
}

export async function activateDirectoryDataset(dataset: DatasetExport) {
  const verified = datasetExportSchema.parse(dataset);
  const current = datasetExportSchema.safeParse(
    await idbKeyVal.get(keys.activeDirectory, localDataStore),
  );
  if (
    current.success &&
    current.data.manifest.checksum !== verified.manifest.checksum
  ) {
    await idbKeyVal.set(keys.previousDirectory, current.data, localDataStore);
  }
  await idbKeyVal.set(keys.activeDirectory, verified, localDataStore);
  return verified;
}

export async function getActiveDirectoryDataset() {
  return readValue<DatasetExport | null>(
    keys.activeDirectory,
    datasetExportSchema.nullable(),
    null,
  );
}

export async function rollbackDirectoryDataset() {
  const previous = datasetExportSchema.safeParse(
    await idbKeyVal.get(keys.previousDirectory, localDataStore),
  );
  if (!previous.success) return null;
  const active = await getActiveDirectoryDataset();
  if (active)
    await idbKeyVal.set(keys.previousDirectory, active, localDataStore);
  await idbKeyVal.set(keys.activeDirectory, previous.data, localDataStore);
  return previous.data;
}

export async function exportLocalBackup(): Promise<LocalBackup> {
  return localBackupSchema.parse({
    schemaVersion: LOCAL_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    profiles: await listProfiles(),
    presets: await listPresets(),
    drafts: await listDrafts(),
    history: await listCoverHistory(),
  });
}

export async function importLocalBackup(
  input: unknown,
  strategy: 'merge' | 'replace' = 'merge',
) {
  const backup = localBackupSchema.parse(input);
  const mergeById = <T extends { id: string }>(current: T[], incoming: T[]) =>
    strategy === 'replace'
      ? incoming
      : [
          ...new Map(
            [...current, ...incoming].map((item) => [item.id, item]),
          ).values(),
        ];
  await Promise.all([
    writeValue(
      keys.profiles,
      profilesSchema,
      mergeById(await listProfiles(), backup.profiles),
    ),
    writeValue(
      keys.presets,
      presetsSchema,
      mergeById(await listPresets(), backup.presets),
    ),
    writeValue(
      keys.drafts,
      draftsSchema,
      mergeById(await listDrafts(), backup.drafts),
    ),
    writeValue(
      keys.history,
      historySchema,
      mergeById(await listCoverHistory(), backup.history).slice(0, 100),
    ),
  ]);
  return exportLocalBackup();
}

export async function clearDraftsAndHistory() {
  await Promise.all([
    idbKeyVal.del(keys.drafts, localDataStore),
    idbKeyVal.del(keys.history, localDataStore),
    idbKeyVal.del(keys.activeDraftId, localDataStore),
  ]);
}

export async function clearAllLocalWorkspaceData() {
  await idbKeyVal.clear(localDataStore);
}
