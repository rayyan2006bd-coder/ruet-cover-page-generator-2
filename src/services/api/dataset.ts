import {
  type DatasetExport,
  datasetExportSchema,
  datasetManifestSchema,
} from '@shared/domain-contracts';
import {
  activateDirectoryDataset,
  getActiveDirectoryDataset,
} from '@/services/local/database';
import { API_BASE_URL, ApiError } from './client';

async function checksumDataset(dataset: Omit<DatasetExport, 'manifest'>) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      JSON.stringify([
        dataset.departments,
        dataset.teachers,
        dataset.courses,
        dataset.courseTeachers,
        dataset.templates,
      ]),
    ),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function syncPublishedDataset(
  signal?: AbortSignal,
): Promise<DatasetExport | null> {
  const cached = await getActiveDirectoryDataset();
  try {
    const manifestResponse = await fetch(
      `${API_BASE_URL}/api/v1/dataset/manifest`,
      {
        signal,
        headers: {
          Accept: 'application/json',
          ...(cached
            ? { 'If-None-Match': `"${cached.manifest.checksum}"` }
            : {}),
        },
      },
    );
    if (manifestResponse.status === 304) return cached;
    if (!manifestResponse.ok) {
      throw new ApiError(
        'Could not check the published directory release',
        manifestResponse.status,
      );
    }
    const manifest = datasetManifestSchema.parse(await manifestResponse.json());
    if (cached?.manifest.checksum === manifest.checksum) return cached;

    const exportResponse = await fetch(
      `${API_BASE_URL}/api/v1/dataset/export`,
      {
        signal,
        headers: { Accept: 'application/json' },
      },
    );
    if (!exportResponse.ok) {
      throw new ApiError(
        'Could not download the published directory release',
        exportResponse.status,
      );
    }
    const downloaded = datasetExportSchema.parse(await exportResponse.json());
    if (
      downloaded.manifest.checksum !== manifest.checksum ||
      (await checksumDataset(downloaded)) !== manifest.checksum
    ) {
      throw new Error('Published directory checksum does not match');
    }
    return activateDirectoryDataset(downloaded);
  } catch {
    return cached;
  }
}
