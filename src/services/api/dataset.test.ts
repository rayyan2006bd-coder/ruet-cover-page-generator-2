import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import 'fake-indexeddb/auto';
import type { DatasetExport } from '@shared/domain-contracts';
import {
  clearAllLocalWorkspaceData,
  getActiveDirectoryDataset,
} from '@/services/local/database';
import { syncPublishedDataset } from './dataset';

const originalFetch = globalThis.fetch;

async function emptyDataset(): Promise<DatasetExport> {
  const checksum = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify([[], [], [], [], []])),
      ),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  return {
    manifest: {
      apiVersion: '1.0',
      releaseVersion: '2026-08-11',
      checksum,
      publishedAt: '2026-08-11T00:00:00.000Z',
      counts: {
        departments: 0,
        teachers: 0,
        courses: 0,
        relationships: 0,
        templates: 0,
      },
    },
    departments: [],
    teachers: [],
    courses: [],
    courseTeachers: [],
    templates: [],
  };
}

beforeEach(async () => {
  await clearAllLocalWorkspaceData();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('published directory sync', () => {
  test('validates the checksum before atomically activating a release', async () => {
    const dataset = await emptyDataset();
    const fetchMock = mock((url: string | URL | Request) => {
      const path = String(url);
      return Promise.resolve(
        new Response(
          JSON.stringify(
            path.endsWith('/manifest') ? dataset.manifest : dataset,
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    expect(await syncPublishedDataset()).toEqual(dataset);
    expect(await getActiveDirectoryDataset()).toEqual(dataset);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('keeps the cached release when a download checksum is invalid', async () => {
    const dataset = await emptyDataset();
    let calls = 0;
    globalThis.fetch = mock(() => {
      calls += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify(
            calls === 1
              ? dataset.manifest
              : {
                  ...dataset,
                  manifest: { ...dataset.manifest, checksum: '0'.repeat(64) },
                },
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }) as unknown as typeof fetch;

    expect(await syncPublishedDataset()).toBeNull();
    expect(await getActiveDirectoryDataset()).toBeNull();
  });
});
