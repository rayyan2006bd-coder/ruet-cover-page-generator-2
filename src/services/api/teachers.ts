import {
  legacyTeacherListSchema,
  type TeacherDataset,
  type TeacherDto,
  teacherDatasetSchema,
} from '@shared/api-contracts';
import bundledTeacherDirectory from '@shared/data/legacy-teacher-directory.json';
import * as idbKeyVal from 'idb-keyval';
import {
  departmentLongMap,
  departmentShortMap,
  teachersIDBStore,
} from '@/store/editor';
import { API_BASE_URL, ApiError } from './client';
import { getApiMetadata } from './meta';

const VERIFIED_DATASET_KEY = 'verified-dataset-v1';
const REFERENCE_DIRECTORY_URL =
  process.env.PUBLIC_LEGACY_TEACHER_API ||
  'https://api.nabilsnigdho.dev/teachers';
const BUNDLED_TEACHER_DIRECTORY = legacyTeacherListSchema.parse(
  bundledTeacherDirectory,
);

type LegacyTeacher = {
  name: string;
  post: string;
  dept: string;
};

export function teacherAutofillValues(teacher: TeacherDto) {
  return {
    name: teacher.fullName,
    designation: teacher.designation,
    department: teacher.department.name,
  };
}

async function checksumItems(items: TeacherDto[]) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(items)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeLegacyTeachers(values: LegacyTeacher[]): TeacherDto[] {
  const teachers = new Map<string, TeacherDto>();
  for (const teacher of values) {
    if (teacher.post.trim().toLowerCase() === 'head') continue;
    const departmentKey = teacher.dept.trim().toLowerCase();
    const departmentName = departmentLongMap[departmentKey];
    const shortName = departmentShortMap[departmentKey];
    if (!departmentName || !shortName) continue;
    const fullName = teacher.name.trim();
    const designation = teacher.post.trim();
    const key = `${fullName.toLowerCase()}|${designation.toLowerCase()}|${departmentKey}`;
    teachers.set(key, {
      id: `reference-${departmentKey}-${slugify(fullName)}-${slugify(designation)}`,
      fullName,
      designation,
      department: {
        id: departmentKey,
        name: departmentName,
        shortName,
        slug: slugify(departmentName),
      },
    });
  }
  return [...teachers.values()];
}

async function fetchReferenceTeacherDataset(
  signal?: AbortSignal,
): Promise<TeacherDataset> {
  const response = await fetch(REFERENCE_DIRECTORY_URL, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new ApiError(
      'Could not load the reference teacher directory',
      response.status,
    );
  }
  const legacy = legacyTeacherListSchema.parse(await response.json());
  const items = normalizeLegacyTeachers(legacy.list);
  if (!items.length) throw new Error('Reference teacher directory is empty');
  const checksum = await checksumItems(items);
  const dataset = teacherDatasetSchema.parse({
    version: `reference-${checksum.slice(0, 12)}`,
    checksum,
    updatedAt: new Date().toISOString(),
    items,
  });
  await idbKeyVal.set(VERIFIED_DATASET_KEY, dataset, teachersIDBStore);
  return dataset;
}

async function createBundledTeacherDataset(): Promise<TeacherDataset> {
  const items = normalizeLegacyTeachers(BUNDLED_TEACHER_DIRECTORY.list);
  const checksum = await checksumItems(items);
  const dataset = teacherDatasetSchema.parse({
    version: `bundled-${checksum.slice(0, 12)}`,
    checksum,
    updatedAt: bundledTeacherDirectory.updatedAt,
    items,
  });
  await idbKeyVal.set(VERIFIED_DATASET_KEY, dataset, teachersIDBStore);
  return dataset;
}

export async function readCachedTeacherDataset(): Promise<TeacherDataset | null> {
  const current = teacherDatasetSchema.safeParse(
    await idbKeyVal.get(VERIFIED_DATASET_KEY, teachersIDBStore),
  );
  if (current.success) return current.data;

  // One-time compatibility with the original cache shape.
  const legacy = await idbKeyVal.get('teachers', teachersIDBStore);
  if (!Array.isArray(legacy)) return null;
  const parsedLegacy = legacyTeacherListSchema.safeParse({ list: legacy });
  if (!parsedLegacy.success) return null;
  const items = normalizeLegacyTeachers(parsedLegacy.data.list);
  if (!items.length) return null;
  return {
    version: 'legacy-cache',
    checksum: await checksumItems(items),
    updatedAt: new Date(0).toISOString(),
    items,
  };
}

export async function syncTeacherDataset(
  signal?: AbortSignal,
): Promise<TeacherDataset> {
  const cached = await readCachedTeacherDataset();
  try {
    const metadata = await getApiMetadata(signal);
    if (
      cached &&
      cached.version === metadata.teacherDataVersion &&
      cached.checksum === metadata.teacherDataChecksum
    )
      return cached;
    if (cached && cached.checksum === metadata.teacherDataChecksum) {
      const refreshed = {
        ...cached,
        version: metadata.teacherDataVersion,
        updatedAt: metadata.lastUpdatedAt,
      };
      await idbKeyVal.set(VERIFIED_DATASET_KEY, refreshed, teachersIDBStore);
      return refreshed;
    }

    const response = await fetch(`${API_BASE_URL}/api/v1/teachers/dataset`, {
      signal,
      headers: {
        Accept: 'application/json',
        ...(cached ? { 'If-None-Match': `"${cached.checksum}"` } : {}),
      },
    });
    if (response.status === 304 && cached) return cached;
    if (!response.ok)
      throw new ApiError(
        'Could not update the teacher directory',
        response.status,
      );
    const downloaded = teacherDatasetSchema.parse(await response.json());
    const calculatedChecksum = await checksumItems(downloaded.items);
    if (calculatedChecksum !== downloaded.checksum) {
      throw new Error('Downloaded teacher directory checksum does not match');
    }
    // A single IndexedDB value makes replacement atomic.
    await idbKeyVal.set(VERIFIED_DATASET_KEY, downloaded, teachersIDBStore);
    return downloaded;
  } catch {
    if (cached) return cached;
    try {
      return await fetchReferenceTeacherDataset(signal);
    } catch {
      return createBundledTeacherDataset();
    }
  }
}
