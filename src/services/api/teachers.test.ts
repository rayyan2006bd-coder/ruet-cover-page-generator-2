import { beforeEach, describe, expect, mock, test } from 'bun:test';
import 'fake-indexeddb/auto';
import type { TeacherDataset, TeacherDto } from '@shared/api-contracts';
import * as idbKeyVal from 'idb-keyval';
import { teachersIDBStore } from '@/store/editor';
import {
  readCachedTeacherDataset,
  syncTeacherDataset,
  teacherAutofillValues,
} from './teachers';

const sarowar: TeacherDto = {
  id: '10000000-0000-4000-8000-000000000001',
  fullName: 'A H M Sarowar Sattar',
  designation: 'Professor',
  department: {
    id: 'cse',
    name: 'Computer Science & Engineering',
    shortName: 'CSE',
    slug: 'computer-science-engineering',
  },
  lastVerifiedAt: '2026-08-11',
};

async function checksum(items: TeacherDto[]) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(items)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

beforeEach(async () => {
  await idbKeyVal.clear(teachersIDBStore);
  mock.restore();
});

describe('offline teacher directory', () => {
  test('maps a selection to all autofill fields', () => {
    expect(teacherAutofillValues(sarowar)).toEqual({
      name: 'A H M Sarowar Sattar',
      designation: 'Professor',
      department: 'Computer Science & Engineering',
    });
  });

  test('falls back to the reference directory and caches normalized teachers', async () => {
    const fetchMock = mock(async (request: RequestInfo | URL) => {
      if (String(request).includes('/api/v1/meta')) {
        throw new TypeError('primary API offline');
      }
      return Response.json({
        list: [
          { name: 'Department Head', post: 'Head', dept: 'cse' },
          {
            name: 'A H M Sarowar Sattar',
            post: 'Professor',
            dept: 'cse',
          },
        ],
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const dataset = await syncTeacherDataset();

    expect(dataset.items).toHaveLength(1);
    expect(dataset.items[0]).toMatchObject({
      fullName: 'A H M Sarowar Sattar',
      designation: 'Professor',
      department: {
        name: 'Computer Science & Engineering',
        shortName: 'CSE',
      },
    });
    expect((await readCachedTeacherDataset())?.checksum).toBe(dataset.checksum);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('uses the bundled directory when every teacher API is unavailable', async () => {
    globalThis.fetch = mock(async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;

    const dataset = await syncTeacherDataset();

    expect(dataset.items.length).toBeGreaterThan(400);
    expect(dataset.items).toContainEqual(
      expect.objectContaining({
        fullName: 'Dr. Shahed Mahmud',
        designation: 'Professor',
        department: expect.objectContaining({
          name: 'Industrial & Production Engineering',
          shortName: 'IPE',
        }),
      }),
    );
    expect((await readCachedTeacherDataset())?.checksum).toBe(dataset.checksum);
  });

  test('validates and stores a changed dataset', async () => {
    const dataset: TeacherDataset = {
      version: '2026-08-11',
      checksum: await checksum([sarowar]),
      updatedAt: '2026-08-11T00:00:00.000Z',
      items: [sarowar],
    };
    globalThis.fetch = mock(async (request: RequestInfo | URL) => {
      const url = String(request);
      return url.endsWith('/meta')
        ? Response.json({
            apiVersion: '1.0',
            teacherDataVersion: dataset.version,
            teacherDataChecksum: dataset.checksum,
            teacherCount: 1,
            departmentCount: 18,
            lastUpdatedAt: dataset.updatedAt,
          })
        : Response.json(dataset, {
            headers: { ETag: `"${dataset.checksum}"` },
          });
    }) as unknown as typeof fetch;
    expect((await syncTeacherDataset()).items[0]?.fullName).toBe(
      sarowar.fullName,
    );
    expect((await readCachedTeacherDataset())?.checksum).toBe(dataset.checksum);
  });

  test('keeps the previous verified dataset when an update is invalid or offline', async () => {
    const valid: TeacherDataset = {
      version: '2026-08-10',
      checksum: await checksum([sarowar]),
      updatedAt: '2026-08-10T00:00:00.000Z',
      items: [sarowar],
    };
    await idbKeyVal.set('verified-dataset-v1', valid, teachersIDBStore);
    globalThis.fetch = mock(async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect((await syncTeacherDataset()).version).toBe('2026-08-10');
  });

  test('keeps the previous verified dataset when a download fails validation', async () => {
    const valid: TeacherDataset = {
      version: '2026-08-10',
      checksum: await checksum([sarowar]),
      updatedAt: '2026-08-10T00:00:00.000Z',
      items: [sarowar],
    };
    await idbKeyVal.set('verified-dataset-v1', valid, teachersIDBStore);
    globalThis.fetch = mock(async (request: RequestInfo | URL) =>
      String(request).endsWith('/meta')
        ? Response.json({
            apiVersion: '1.0',
            teacherDataVersion: '2026-08-11',
            teacherDataChecksum: 'a'.repeat(64),
            teacherCount: 1,
            departmentCount: 18,
            lastUpdatedAt: '2026-08-11T00:00:00.000Z',
          })
        : Response.json({ version: '2026-08-11', checksum: 'invalid' }),
    ) as unknown as typeof fetch;
    expect((await syncTeacherDataset()).version).toBe('2026-08-10');
  });

  test('refreshes version metadata without downloading unchanged items', async () => {
    const cached: TeacherDataset = {
      version: '2026-08-10',
      checksum: await checksum([sarowar]),
      updatedAt: '2026-08-10T00:00:00.000Z',
      items: [sarowar],
    };
    await idbKeyVal.set('verified-dataset-v1', cached, teachersIDBStore);
    const fetchMock = mock(async () =>
      Response.json({
        apiVersion: '1.0',
        teacherDataVersion: '2026-08-11',
        teacherDataChecksum: cached.checksum,
        teacherCount: 1,
        departmentCount: 18,
        lastUpdatedAt: '2026-08-11T00:00:00.000Z',
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    expect((await syncTeacherDataset()).version).toBe('2026-08-11');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
