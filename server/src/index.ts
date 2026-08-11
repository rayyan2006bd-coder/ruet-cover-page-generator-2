import { createApp } from './app';
import { loadEnv } from './config/env';
import { createDatabase } from './db/client';

const env = loadEnv();
const { db, client } = createDatabase(env.DATABASE_URL);
const app = createApp({ db, env });
const server = Bun.serve({
  port: env.PORT,
  hostname: '0.0.0.0',
  fetch: app.fetch,
});

console.log(
  JSON.stringify({
    level: 'info',
    message: 'API listening',
    port: server.port,
  }),
);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(
    JSON.stringify({ level: 'info', message: 'Graceful shutdown', signal }),
  );
  await server.stop(false);
  await client.end({ timeout: 5 });
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
