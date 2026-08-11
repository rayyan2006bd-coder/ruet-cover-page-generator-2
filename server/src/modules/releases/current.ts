import { desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { datasetReleases } from '../../db/schema';

export async function getPublishedRelease(db: Database) {
  const [release] = await db
    .select()
    .from(datasetReleases)
    .where(eq(datasetReleases.status, 'published'))
    .orderBy(desc(datasetReleases.publishedAt))
    .limit(1);
  return release;
}

export async function requirePublishedRelease(db: Database) {
  const release = await getPublishedRelease(db);
  if (!release) throw new Error('No published directory release is available');
  return release;
}
