import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export function createDatabase(databaseUrl: string, max = 10) {
  const client = postgres(databaseUrl, {
    max,
    connect_timeout: 10,
    idle_timeout: 20,
    prepare: true,
  });
  const db = drizzle(client, { schema });
  return { client, db };
}

export type Database = ReturnType<typeof createDatabase>['db'];
