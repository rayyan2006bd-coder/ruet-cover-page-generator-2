import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { loadEnv } from '../config/env';
import { createDatabase } from './client';

const env = loadEnv();
const { db, client } = createDatabase(env.DATABASE_URL, 1);

try {
  await migrate(db, {
    migrationsFolder: fileURLToPath(
      new URL('../../migrations', import.meta.url),
    ),
  });
  console.log(
    JSON.stringify({ level: 'info', message: 'Database migrations complete' }),
  );
} finally {
  await client.end();
}
