import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, sql } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import {
  courseQuerySchema,
  teacherImportItemSchema,
  teacherImportSchema,
  teacherQuerySchema,
  templateQuerySchema,
} from '../../shared/api-contracts';
import {
  adminCourseMutationSchema,
  adminCourseTeacherMutationSchema,
  adminDepartmentMutationSchema,
  adminTeacherMutationSchema,
  adminTemplateMutationSchema,
  stableKeySchema,
} from '../../shared/domain-contracts';
import type { AppEnv } from './config/env';
import type { Database } from './db/client';
import {
  adminUsers,
  auditLogs,
  datasetVersions,
  teacherAliases,
} from './db/schema';
import { type AdminAuthVariables, adminAuth } from './middleware/admin-auth';
import { rateLimit } from './middleware/rate-limit';
import { importTeachers, updateTeacher } from './modules/admin/service';
import {
  ADMIN_CSRF_COOKIE,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSession,
  revokeAdminSession,
} from './modules/admin/sessions';
import {
  getDepartment,
  getDirectorySnapshot,
  getTeacher,
  listDepartments,
  listTeachers,
} from './modules/directory/service';
import {
  createDraftRelease,
  getDatasetReleaseContents,
  listDatasetReleases,
  publishDatasetRelease,
  rollbackDatasetRelease,
  validateDatasetRelease,
} from './modules/releases/admin-service';
import {
  getDraftRelease,
  type ReleaseMutationDatabase,
  upsertCourse,
  upsertCourseTeacher,
  upsertDepartment,
  upsertTeacher,
  upsertTemplate,
} from './modules/releases/mutations';
import {
  getPublishedDataset,
  listCourses,
  listTemplates,
  suggestedTeachers,
} from './modules/releases/service';
import { openApiDocument } from './openapi';

type Variables = AdminAuthVariables;

const publishSchema = z.object({
  version: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}(?:[-.][a-zA-Z0-9]+)?$/),
});
const teacherPatchSchema = teacherImportItemSchema
  .omit({ id: true })
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one field is required',
  );
const adminLoginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(200),
});
const releaseDraftSchema = z.object({
  version: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
  notes: z.string().trim().max(4_000).default(''),
  copyFromId: z.string().uuid().optional(),
});

export function createApp(input: { db: Database; env: AppEnv }) {
  const { db, env } = input;
  const app = new Hono<{ Variables: Variables }>();
  const handleDraftMutation = async <T>(
    context: Context<{ Variables: Variables }>,
    schema: z.ZodType<T>,
    persist: (
      database: ReleaseMutationDatabase,
      releaseId: string,
      value: T,
    ) => Promise<unknown>,
  ) => {
    const id = z.string().uuid().safeParse(context.req.param('releaseId'));
    const body = schema.safeParse(await context.req.json().catch(() => null));
    if (!id.success || !body.success) {
      return context.json(
        {
          error: {
            code: 'INVALID_BODY',
            message: 'Invalid draft release record',
            requestId: context.get('requestId'),
            ...(!body.success ? { details: body.error.issues } : {}),
          },
        },
        400,
      );
    }
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select id from dataset_releases where id = ${id.data} for update`,
        );
        const release = await getDraftRelease(tx, id.data);
        if (!release) return { status: 'not-found' as const };
        if (release.status !== 'draft') {
          return { status: 'immutable' as const };
        }
        return {
          status: 'saved' as const,
          item: await persist(tx, id.data, body.data),
        };
      });
      if (result.status === 'not-found') {
        return context.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Release not found',
              requestId: context.get('requestId'),
            },
          },
          404,
        );
      }
      if (result.status === 'immutable') {
        return context.json(
          {
            error: {
              code: 'IMMUTABLE_RELEASE',
              message: 'Published and retired releases cannot be edited',
              requestId: context.get('requestId'),
            },
          },
          409,
        );
      }
      return context.json({ item: result.item });
    } catch (error) {
      const databaseCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : '';
      const dependencyMessage =
        error instanceof Error && error.message.includes('does not exist')
          ? error.message
          : null;
      if (dependencyMessage || ['23503', '23505'].includes(databaseCode)) {
        return context.json(
          {
            error: {
              code: 'RECORD_CONFLICT',
              message:
                dependencyMessage ??
                'The record conflicts with another stable key or a missing release dependency',
              requestId: context.get('requestId'),
            },
          },
          409,
        );
      }
      throw error;
    }
  };

  app.use('*', async (context, next) => {
    const requestId =
      context.req.header('x-request-id')?.slice(0, 100) || crypto.randomUUID();
    context.set('requestId', requestId);
    context.header('X-Request-Id', requestId);
    const startedAt = performance.now();
    await next();
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'request',
        requestId,
        method: context.req.method,
        path: context.req.path,
        status: context.res.status,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      }),
    );
  });
  app.use('*', secureHeaders());
  app.use(
    '*',
    cors({
      origin: (origin) => {
        const normalized = origin.replace(/\/$/, '');
        return env.corsOrigins.includes(normalized) ? origin : '';
      },
      allowMethods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PATCH', 'DELETE'],
      allowHeaders: [
        'Authorization',
        'Content-Type',
        'If-None-Match',
        'X-CSRF-Token',
        'X-Request-Id',
      ],
      exposeHeaders: [
        'ETag',
        'X-Request-Id',
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset',
      ],
      maxAge: 86_400,
      credentials: true,
    }),
  );
  app.use(
    '*',
    bodyLimit({
      maxSize: 1_048_576,
      onError: (context) =>
        context.json(
          {
            error: {
              code: 'BODY_TOO_LARGE',
              message: 'Request body exceeds 1 MiB',
              requestId: (context as Context<{ Variables: Variables }>).get(
                'requestId',
              ),
            },
          },
          413,
        ),
    }),
  );
  app.use(
    '/api/*',
    rateLimit({ max: env.RATE_LIMIT_MAX, windowMs: env.RATE_LIMIT_WINDOW_MS }),
  );

  app.get('/api/v1/health', (context) =>
    context.json({ status: 'ok', apiVersion: '1.0' }),
  );
  app.get('/api/v1/ready', async (context) => {
    try {
      await db.execute(sql`select 1 from departments limit 1`);
      return context.json({ status: 'ready' });
    } catch {
      return context.json(
        {
          error: {
            code: 'NOT_READY',
            message: 'Database is unavailable or migrations are incomplete',
            requestId: context.get('requestId'),
          },
        },
        503,
      );
    }
  });

  app.get('/api/v1/meta', async (context) => {
    const [snapshot, departmentItems] = await Promise.all([
      getDirectorySnapshot(db),
      listDepartments(db),
    ]);
    return context.json({
      apiVersion: '1.0',
      teacherDataVersion: snapshot.version,
      teacherDataChecksum: snapshot.checksum,
      teacherCount: snapshot.items.length,
      departmentCount: departmentItems.length,
      lastUpdatedAt: snapshot.updatedAt,
    });
  });

  app.get('/api/v1/departments', async (context) =>
    context.json(await listDepartments(db)),
  );
  app.get('/api/v1/departments/:slug', async (context) => {
    const department = await getDepartment(db, context.req.param('slug'));
    return department
      ? context.json(department)
      : context.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Department not found',
              requestId: (context as Context<{ Variables: Variables }>).get(
                'requestId',
              ),
            },
          },
          404,
        );
  });

  app.get('/api/v1/dataset/manifest', async (context) => {
    const dataset = await getPublishedDataset(db);
    const etag = `"${dataset.manifest.checksum}"`;
    context.header('ETag', etag);
    context.header(
      'Cache-Control',
      'public, max-age=300, stale-while-revalidate=86400',
    );
    if (context.req.header('if-none-match') === etag) {
      return context.body(null, 304);
    }
    return context.json(dataset.manifest);
  });
  app.get('/api/v1/dataset/export', async (context) => {
    const dataset = await getPublishedDataset(db);
    const etag = `"${dataset.manifest.checksum}"`;
    context.header('ETag', etag);
    context.header('Cache-Control', 'public, max-age=86400, immutable');
    if (context.req.header('if-none-match') === etag) {
      return context.body(null, 304);
    }
    return context.json(dataset);
  });

  app.get(
    '/api/v1/courses',
    zValidator('query', courseQuerySchema, (result, context) => {
      if (!result.success) {
        return context.json(
          {
            error: {
              code: 'INVALID_QUERY',
              message: 'Invalid course query',
              requestId: (context as Context<{ Variables: Variables }>).get(
                'requestId',
              ),
              details: result.error.issues,
            },
          },
          400,
        );
      }
    }),
    async (context) =>
      context.json(await listCourses(db, context.req.valid('query'))),
  );
  app.get('/api/v1/courses/:courseKey/suggested-teachers', async (context) => {
    const courseKey = stableKeySchema.safeParse(context.req.param('courseKey'));
    if (!courseKey.success) {
      return context.json(
        {
          error: {
            code: 'INVALID_ID',
            message: 'Course key is invalid',
            requestId: context.get('requestId'),
          },
        },
        400,
      );
    }
    return context.json(await suggestedTeachers(db, courseKey.data));
  });
  app.get(
    '/api/v1/templates',
    zValidator('query', templateQuerySchema, (result, context) => {
      if (!result.success) {
        return context.json(
          {
            error: {
              code: 'INVALID_QUERY',
              message: 'Invalid template query',
              requestId: (context as Context<{ Variables: Variables }>).get(
                'requestId',
              ),
              details: result.error.issues,
            },
          },
          400,
        );
      }
    }),
    async (context) =>
      context.json(await listTemplates(db, context.req.valid('query'))),
  );

  app.get(
    '/api/v1/teachers',
    zValidator('query', teacherQuerySchema, (result, context) => {
      if (!result.success) {
        return context.json(
          {
            error: {
              code: 'INVALID_QUERY',
              message: 'Invalid teacher query',
              requestId: (context as Context<{ Variables: Variables }>).get(
                'requestId',
              ),
              details: result.error.issues,
            },
          },
          400,
        );
      }
    }),
    async (context) => {
      const query = context.req.valid('query');
      const [result, snapshot] = await Promise.all([
        listTeachers(db, query),
        getDirectorySnapshot(db),
      ]);
      return context.json({ ...result, dataVersion: snapshot.version });
    },
  );
  app.get('/api/v1/teachers/dataset', async (context) => {
    const snapshot = await getDirectorySnapshot(db);
    const etag = `"${snapshot.checksum}"`;
    context.header('ETag', etag);
    context.header(
      'Cache-Control',
      'public, max-age=300, stale-while-revalidate=86400',
    );
    if (context.req.header('if-none-match') === etag)
      return context.body(null, 304);
    return context.json(snapshot);
  });
  app.get('/api/v1/teachers/:id', async (context) => {
    const id = z.string().uuid().safeParse(context.req.param('id'));
    if (!id.success) {
      return context.json(
        {
          error: {
            code: 'INVALID_ID',
            message: 'Teacher id must be a UUID',
            requestId: context.get('requestId'),
          },
        },
        400,
      );
    }
    const teacher = await getTeacher(db, id.data);
    return teacher
      ? context.json(teacher)
      : context.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Teacher not found',
              requestId: context.get('requestId'),
            },
          },
          404,
        );
  });

  const legacyTeachers = async (context: Context<{ Variables: Variables }>) => {
    const snapshot = await getDirectorySnapshot(db);
    context.header('Deprecation', 'true');
    context.header('Sunset', 'Wed, 11 Aug 2027 00:00:00 GMT');
    return context.json({
      list: snapshot.items.map((teacher) => ({
        name: teacher.fullName,
        post: teacher.designation,
        dept: teacher.department.shortName,
      })),
    });
  };
  app.get('/teachers', legacyTeachers);
  app.get('/api/teachers', legacyTeachers);
  app.get('/departments', async (context) => {
    context.header('Deprecation', 'true');
    return context.json({ list: await listDepartments(db) });
  });
  app.get('/api/departments', async (context) => {
    context.header('Deprecation', 'true');
    return context.json({ list: await listDepartments(db) });
  });

  app.get('/api/v1/openapi.json', (context) => context.json(openApiDocument));
  app.get('/docs', (context) =>
    context.html(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>RUET Directory API</title><style>body{font:16px system-ui;max-width:52rem;margin:3rem auto;padding:0 1rem;line-height:1.55}code{background:#eee;padding:.15rem .3rem;border-radius:.25rem}</style></head><body><h1>RUET Directory API</h1><p>The machine-readable OpenAPI 3.1 document is available locally at <a href="/api/v1/openapi.json"><code>/api/v1/openapi.json</code></a>.</p><p>This documentation page has no CDN or third-party runtime dependency.</p></body></html>`,
    ),
  );

  app.use(
    '/api/v1/admin/*',
    rateLimit({ max: 10, windowMs: 60_000, prefix: 'admin' }),
  );
  app.use('/api/v1/admin/*', adminAuth(db, env));
  app.post('/api/v1/admin/session/login', async (context) => {
    const parsed = adminLoginSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return context.json(
        {
          error: {
            code: 'INVALID_BODY',
            message: 'Email and password are required',
            requestId: context.get('requestId'),
          },
        },
        400,
      );
    }
    const [user] = await db
      .select()
      .from(adminUsers)
      .where(
        and(
          eq(adminUsers.active, true),
          sql`lower(${adminUsers.email}) = ${parsed.data.email.toLowerCase()}`,
        ),
      )
      .limit(1);
    let valid = false;
    try {
      valid = Boolean(
        user &&
          (await Bun.password.verify(parsed.data.password, user.passwordHash)),
      );
    } catch {
      valid = false;
    }
    if (!user || !valid) {
      return context.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid email or password',
            requestId: context.get('requestId'),
          },
        },
        401,
      );
    }
    const session = await createAdminSession(db, user.id);
    const cookieOptions = {
      path: '/api/v1/admin',
      secure: env.NODE_ENV === 'production',
      sameSite: 'Strict' as const,
      maxAge: ADMIN_SESSION_TTL_SECONDS,
    };
    setCookie(context, ADMIN_SESSION_COOKIE, session.token, {
      ...cookieOptions,
      httpOnly: true,
    });
    setCookie(context, ADMIN_CSRF_COOKIE, session.csrfToken, {
      ...cookieOptions,
      path: '/',
      httpOnly: false,
    });
    await db.insert(auditLogs).values({
      adminUserId: user.id,
      action: 'login',
      entityType: 'admin_session',
      entityId: session.id,
      summary: 'Created an administrator session',
      requestId: context.get('requestId'),
    });
    return context.json({
      user: { id: user.id, email: user.email, role: user.role },
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt.toISOString(),
    });
  });
  app.get('/api/v1/admin/session', (context) =>
    context.json({
      user: {
        id: context.get('adminUserId'),
        email: context.get('adminEmail'),
        role: context.get('adminRole'),
      },
    }),
  );
  app.post('/api/v1/admin/session/logout', async (context) => {
    const sessionId = context.get('adminSessionId');
    if (sessionId) await revokeAdminSession(db, sessionId);
    deleteCookie(context, ADMIN_SESSION_COOKIE, { path: '/api/v1/admin' });
    deleteCookie(context, ADMIN_CSRF_COOKIE, { path: '/' });
    await db.insert(auditLogs).values({
      adminUserId: context.get('adminUserId'),
      action: 'logout',
      entityType: 'admin_session',
      entityId: sessionId,
      summary: 'Revoked an administrator session',
      requestId: context.get('requestId'),
    });
    return context.json({ ok: true });
  });
  app.get('/api/v1/admin/releases', async (context) =>
    context.json({ items: await listDatasetReleases(db) }),
  );
  app.get('/api/v1/admin/releases/:releaseId/data', async (context) => {
    const id = z.string().uuid().safeParse(context.req.param('releaseId'));
    if (!id.success) {
      return context.json(
        {
          error: {
            code: 'INVALID_ID',
            message: 'Release ID must be a UUID',
            requestId: context.get('requestId'),
          },
        },
        400,
      );
    }
    const data = await getDatasetReleaseContents(db, id.data);
    return data
      ? context.json(data)
      : context.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Dataset release not found',
              requestId: context.get('requestId'),
            },
          },
          404,
        );
  });
  app.get('/api/v1/admin/audit', async (context) =>
    context.json({
      items: await db
        .select({
          id: auditLogs.id,
          adminUserId: auditLogs.adminUserId,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityKey: auditLogs.entityKey,
          releaseId: auditLogs.releaseId,
          summary: auditLogs.summary,
          requestId: auditLogs.requestId,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(200),
    }),
  );
  app.post('/api/v1/admin/releases', async (context) => {
    const parsed = releaseDraftSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return context.json(
        {
          error: {
            code: 'INVALID_BODY',
            message: 'Invalid draft release',
            requestId: context.get('requestId'),
            details: parsed.error.issues,
          },
        },
        400,
      );
    }
    const release = await createDraftRelease(db, {
      ...parsed.data,
      adminUserId: context.get('adminUserId'),
      requestId: context.get('requestId'),
    });
    if (!release) {
      return context.json(
        {
          error: {
            code: 'COPY_SOURCE_NOT_FOUND',
            message: 'The release selected for copying does not exist',
            requestId: context.get('requestId'),
          },
        },
        404,
      );
    }
    return context.json(release, 201);
  });
  app.post('/api/v1/admin/releases/:releaseId/departments', (context) =>
    handleDraftMutation(
      context,
      adminDepartmentMutationSchema,
      (database, releaseId, value) =>
        upsertDepartment(database, releaseId, value, {
          adminUserId: context.get('adminUserId'),
          requestId: context.get('requestId'),
        }),
    ),
  );
  app.post('/api/v1/admin/releases/:releaseId/teachers', (context) =>
    handleDraftMutation(
      context,
      adminTeacherMutationSchema,
      (database, releaseId, value) =>
        upsertTeacher(database, releaseId, value, {
          adminUserId: context.get('adminUserId'),
          requestId: context.get('requestId'),
        }),
    ),
  );
  app.post('/api/v1/admin/releases/:releaseId/courses', (context) =>
    handleDraftMutation(
      context,
      adminCourseMutationSchema,
      (database, releaseId, value) =>
        upsertCourse(database, releaseId, value, {
          adminUserId: context.get('adminUserId'),
          requestId: context.get('requestId'),
        }),
    ),
  );
  app.post('/api/v1/admin/releases/:releaseId/course-teachers', (context) =>
    handleDraftMutation(
      context,
      adminCourseTeacherMutationSchema,
      (database, releaseId, value) =>
        upsertCourseTeacher(database, releaseId, value, {
          adminUserId: context.get('adminUserId'),
          requestId: context.get('requestId'),
        }),
    ),
  );
  app.post('/api/v1/admin/releases/:releaseId/templates', (context) =>
    handleDraftMutation(
      context,
      adminTemplateMutationSchema,
      (database, releaseId, value) =>
        upsertTemplate(database, releaseId, value, {
          adminUserId: context.get('adminUserId'),
          requestId: context.get('requestId'),
        }),
    ),
  );
  app.get('/api/v1/admin/releases/:releaseId/validate', async (context) => {
    const id = z.string().uuid().safeParse(context.req.param('releaseId'));
    if (!id.success) {
      return context.json(
        {
          error: {
            code: 'INVALID_ID',
            message: 'Release ID must be a UUID',
            requestId: context.get('requestId'),
          },
        },
        400,
      );
    }
    const validation = await validateDatasetRelease(db, id.data);
    return validation
      ? context.json(validation)
      : context.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Release not found',
              requestId: context.get('requestId'),
            },
          },
          404,
        );
  });
  app.post('/api/v1/admin/releases/:releaseId/publish', async (context) => {
    const id = z.string().uuid().safeParse(context.req.param('releaseId'));
    if (!id.success) {
      return context.json(
        {
          error: {
            code: 'INVALID_ID',
            message: 'Release ID must be a UUID',
            requestId: context.get('requestId'),
          },
        },
        400,
      );
    }
    const result = await publishDatasetRelease(db, {
      releaseId: id.data,
      adminUserId: context.get('adminUserId'),
      requestId: context.get('requestId'),
    });
    if (result.status === 'not-found') {
      return context.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Release not found',
            requestId: context.get('requestId'),
          },
        },
        404,
      );
    }
    if (result.status === 'invalid') return context.json(result, 409);
    if (result.status === 'conflict') {
      return context.json(
        {
          error: {
            code: 'RELEASE_CONFLICT',
            message: 'Only draft releases can be published',
            requestId: context.get('requestId'),
          },
        },
        409,
      );
    }
    return context.json(result);
  });
  app.post('/api/v1/admin/releases/:releaseId/rollback', async (context) => {
    if (context.get('adminRole') !== 'owner') {
      return context.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Only an owner can restore a retired release',
            requestId: context.get('requestId'),
          },
        },
        403,
      );
    }
    const id = z.string().uuid().safeParse(context.req.param('releaseId'));
    if (!id.success) {
      return context.json(
        {
          error: {
            code: 'INVALID_ID',
            message: 'Release ID must be a UUID',
            requestId: context.get('requestId'),
          },
        },
        400,
      );
    }
    const result = await rollbackDatasetRelease(db, {
      releaseId: id.data,
      adminUserId: context.get('adminUserId'),
      requestId: context.get('requestId'),
    });
    if (result.status === 'not-found') {
      return context.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Release not found',
            requestId: context.get('requestId'),
          },
        },
        404,
      );
    }
    if (result.status === 'invalid') return context.json(result, 409);
    if (result.status === 'conflict') {
      return context.json(
        {
          error: {
            code: 'RELEASE_CONFLICT',
            message: 'Only a previously published release can be restored',
            requestId: context.get('requestId'),
          },
        },
        409,
      );
    }
    return context.json(result);
  });
  app.post('/api/v1/admin/teachers', async (context) => {
    const parsed = teacherImportItemSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return context.json(
        {
          error: {
            code: 'INVALID_BODY',
            message: 'Invalid teacher record',
            requestId: context.get('requestId'),
            details: parsed.error.issues,
          },
        },
        400,
      );
    }
    const result = await importTeachers(db, {
      dryRun: false,
      items: [parsed.data],
    });
    return context.json(result, 201);
  });
  app.patch('/api/v1/admin/teachers/:id', async (context) => {
    const id = z.string().uuid().safeParse(context.req.param('id'));
    const patch = teacherPatchSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!id.success || !patch.success) {
      return context.json(
        {
          error: {
            code: 'INVALID_BODY',
            message: 'Invalid teacher update',
            requestId: context.get('requestId'),
          },
        },
        400,
      );
    }
    const current = await getTeacher(db, id.data);
    if (!current)
      return context.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Teacher not found',
            requestId: context.get('requestId'),
          },
        },
        404,
      );
    const currentAliases = await db
      .select({ alias: teacherAliases.alias })
      .from(teacherAliases)
      .where(eq(teacherAliases.teacherId, id.data));
    const merged = teacherImportItemSchema.parse({
      id: current.id,
      fullName: patch.data.fullName ?? current.fullName,
      designation: patch.data.designation ?? current.designation,
      department: patch.data.department ?? current.department.id,
      aliases: patch.data.aliases ?? currentAliases.map((item) => item.alias),
      profileUrl: patch.data.profileUrl ?? current.profileUrl,
      sourceUrl: patch.data.sourceUrl ?? current.sourceUrl,
      lastVerifiedAt: patch.data.lastVerifiedAt ?? current.lastVerifiedAt,
      active: patch.data.active ?? true,
    });
    return context.json(await updateTeacher(db, id.data, merged));
  });
  app.post('/api/v1/admin/teachers/import', async (context) => {
    const parsed = teacherImportSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return context.json(
        {
          error: {
            code: 'INVALID_BODY',
            message: 'Invalid teacher import',
            requestId: context.get('requestId'),
            details: parsed.error.issues,
          },
        },
        400,
      );
    }
    return context.json(await importTeachers(db, parsed.data));
  });
  app.post('/api/v1/admin/datasets/publish', async (context) => {
    const parsed = publishSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return context.json(
        {
          error: {
            code: 'INVALID_BODY',
            message: 'Invalid dataset version',
            requestId: context.get('requestId'),
          },
        },
        400,
      );
    }
    const snapshot = await getDirectorySnapshot(db);
    await db.transaction(async (tx) => {
      await tx.insert(datasetVersions).values({
        datasetName: 'teachers',
        version: parsed.data.version,
        checksum: snapshot.checksum,
        recordCount: snapshot.items.length,
      });
      await tx.insert(auditLogs).values({
        action: 'publish',
        entityType: 'teacher_dataset',
        entityId: parsed.data.version,
        summary: `Published ${snapshot.items.length} teacher records`,
      });
    });
    return context.json(
      {
        version: parsed.data.version,
        checksum: snapshot.checksum,
        recordCount: snapshot.items.length,
      },
      201,
    );
  });

  app.notFound((context) =>
    context.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found',
          requestId: context.get('requestId'),
        },
      },
      404,
    ),
  );
  app.onError((error, context) => {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'request_failed',
        requestId: context.get('requestId'),
        error: env.NODE_ENV === 'production' ? error.name : error.message,
      }),
    );
    return context.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'The request could not be completed',
          requestId: context.get('requestId'),
        },
      },
      500,
    );
  });

  return app;
}
