import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createApp } from '../src/app';
import type { AppEnv } from '../src/config/env';
import { createDatabase } from '../src/db/client';
import { departments, teachers } from '../src/db/schema';
import { buildSearchText, normalizeSearch } from '../src/utils/normalize';

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('PostgreSQL API integration', () => {
  const connection = createDatabase(
    databaseUrl ?? 'postgresql://postgres:postgres@127.0.0.1:1/disabled',
    1,
  );
  const env: AppEnv = {
    NODE_ENV: 'test',
    PORT: 8787,
    DATABASE_URL: databaseUrl ?? 'postgresql://unused',
    CORS_ORIGINS: 'https://allowed.example',
    ADMIN_TOKEN_HASH: '',
    LOG_LEVEL: 'error',
    RATE_LIMIT_MAX: 100,
    RATE_LIMIT_WINDOW_MS: 60_000,
    corsOrigins: ['https://allowed.example'],
  };

  beforeAll(async () => {
    await migrate(connection.db, {
      migrationsFolder: fileURLToPath(
        new URL('../migrations', import.meta.url),
      ),
    });
  });

  beforeEach(async () => {
    await connection.client`truncate table audit_logs, dataset_versions, teacher_aliases, teachers, departments restart identity cascade`;
    await connection.db.insert(departments).values({
      id: 'cse',
      stableKey: 'cse',
      name: 'Computer Science & Engineering',
      fullName: 'Computer Science & Engineering',
      shortName: 'CSE',
      slug: 'computer-science-engineering',
      faculty: 'Electrical & Computer Engineering',
    });
    await connection.db.insert(teachers).values({
      id: '10000000-0000-4000-8000-000000000001',
      stableKey: '10000000-0000-4000-8000-000000000001',
      fullName: 'A H M Sarowar Sattar',
      normalizedName: normalizeSearch('A H M Sarowar Sattar'),
      designation: 'Professor',
      departmentId: 'cse',
      departmentKey: 'cse',
      searchText: buildSearchText([
        'A H M Sarowar Sattar',
        'A.H.M. Sarowar',
        'Professor',
        'CSE',
        'Computer Science & Engineering',
      ]),
      lastVerifiedAt: new Date('2026-08-11T00:00:00.000Z'),
      sourceUrl: 'https://www.cse.ruet.ac.bd/teacher_list',
    });
  });

  afterAll(async () => {
    await connection.client.end();
  });

  test('serves health, readiness, metadata, departments, and exact legacy shape', async () => {
    const app = createApp({ db: connection.db, env });
    expect((await app.request('/api/v1/health')).status).toBe(200);
    expect((await app.request('/api/v1/ready')).status).toBe(200);
    const meta = await (await app.request('/api/v1/meta')).json();
    expect(meta.teacherCount).toBe(1);
    expect(meta.departmentCount).toBe(1);
    const legacy = await (await app.request('/teachers')).json();
    expect(legacy).toEqual({
      list: [{ name: 'A H M Sarowar Sattar', post: 'Professor', dept: 'CSE' }],
    });
  });

  test.each([
    ['/api/v1/teachers?q=sarowar', 1],
    ['/api/v1/teachers?q=a.h.m%20sarowar', 1],
    ['/api/v1/teachers?q=Professor%20CSE', 1],
    ['/api/v1/teachers?q=computer%20science%20professor', 1],
    ['/api/v1/teachers?department=CSE&designation=Professor', 1],
    ['/api/v1/teachers?department=EEE', 0],
  ])('searches %s', async (path, total) => {
    const body = await (
      await createApp({ db: connection.db, env }).request(path)
    ).json();
    expect(body.pagination.total).toBe(total);
  });

  test('validates pagination and teacher ids', async () => {
    const app = createApp({ db: connection.db, env });
    expect((await app.request('/api/v1/teachers?page=0')).status).toBe(400);
    expect((await app.request('/api/v1/teachers/not-a-uuid')).status).toBe(400);
  });

  test('supports ETag revalidation', async () => {
    const app = createApp({ db: connection.db, env });
    const first = await app.request('/api/v1/teachers/dataset');
    expect(first.status).toBe(200);
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    if (!etag) throw new Error('Dataset response did not contain an ETag');
    const second = await app.request('/api/v1/teachers/dataset', {
      headers: { 'If-None-Match': etag },
    });
    expect(second.status).toBe(304);
  });

  test('allows only configured browser origins', async () => {
    const app = createApp({ db: connection.db, env });
    const allowed = await app.request('/api/v1/health', {
      headers: { Origin: 'https://allowed.example' },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      'https://allowed.example',
    );
    const denied = await app.request('/api/v1/health', {
      headers: { Origin: 'https://denied.example' },
    });
    expect(denied.headers.has('access-control-allow-origin')).toBe(false);
  });

  test('rate limits requests and rejects unauthenticated admin operations', async () => {
    const limited = createApp({
      db: connection.db,
      env: { ...env, RATE_LIMIT_MAX: 2 },
    });
    await limited.request('/api/v1/health');
    await limited.request('/api/v1/health');
    expect((await limited.request('/api/v1/health')).status).toBe(429);
    const app = createApp({ db: connection.db, env });
    expect(
      (
        await app.request('/api/v1/admin/teachers/import', {
          method: 'POST',
          body: '{}',
        })
      ).status,
    ).toBe(401);
  });

  test('authenticates imports and rolls the transaction back on an alias conflict', async () => {
    const token = 'correct-horse-battery-staple-token';
    const app = createApp({
      db: connection.db,
      env: {
        ...env,
        ADMIN_TOKEN_HASH: await Bun.password.hash(token, {
          algorithm: 'argon2id',
        }),
      },
    });
    const response = await app.request('/api/v1/admin/teachers/import', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dryRun: false,
        items: [
          {
            fullName: 'Rollback Teacher',
            designation: 'Lecturer',
            department: 'CSE',
            aliases: ['R. Teacher', 'R Teacher'],
            sourceUrl: 'https://example.com/teacher',
            lastVerifiedAt: '2026-08-11',
            active: true,
          },
        ],
      }),
    });
    expect(response.status).toBe(500);
    const result = await app.request('/api/v1/teachers?q=Rollback');
    expect((await result.json()).pagination.total).toBe(0);
  });

  test('updates a teacher in place and publishes a new dataset version', async () => {
    const token = 'correct-horse-battery-staple-token';
    const app = createApp({
      db: connection.db,
      env: {
        ...env,
        ADMIN_TOKEN_HASH: await Bun.password.hash(token, {
          algorithm: 'argon2id',
        }),
      },
    });
    const authorization = { Authorization: `Bearer ${token}` };
    const updated = await app.request(
      '/api/v1/admin/teachers/10000000-0000-4000-8000-000000000001',
      {
        method: 'PATCH',
        headers: { ...authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: 'A H M Sarowar Sattar Updated' }),
      },
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).updated).toBe(true);
    const search = await app.request('/api/v1/teachers?q=Updated');
    expect((await search.json()).pagination.total).toBe(1);

    const published = await app.request('/api/v1/admin/datasets/publish', {
      method: 'POST',
      headers: { ...authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: '2026-08-12' }),
    });
    expect(published.status).toBe(201);
    const meta = await (await app.request('/api/v1/meta')).json();
    expect(meta.teacherDataVersion).toBe('2026-08-12');
  });
});
