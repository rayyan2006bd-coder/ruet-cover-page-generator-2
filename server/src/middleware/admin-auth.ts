import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from '../config/env';
import type { Database } from '../db/client';
import {
  ADMIN_CSRF_COOKIE,
  ADMIN_SESSION_COOKIE,
  authenticateAdminSession,
  verifyCsrfToken,
} from '../modules/admin/sessions';

export type AdminAuthVariables = {
  requestId: string;
  adminUserId: string | null;
  adminSessionId: string | null;
  adminEmail: string | null;
  adminRole: 'owner' | 'editor' | 'viewer' | null;
};

export function adminAuth(
  db: Database,
  env: AppEnv,
): MiddlewareHandler<{ Variables: AdminAuthVariables }> {
  return async (context, next) => {
    if (
      context.req.path === '/api/v1/admin/session/login' &&
      context.req.method === 'POST'
    ) {
      await next();
      return;
    }

    const authorization = context.req.header('authorization');
    const bearerToken = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';
    if (bearerToken && env.ADMIN_TOKEN_HASH) {
      let valid = false;
      try {
        valid =
          bearerToken.length >= 24 &&
          (await Bun.password.verify(bearerToken, env.ADMIN_TOKEN_HASH));
      } catch {
        valid = false;
      }
      if (valid) {
        context.set('adminUserId', null);
        context.set('adminSessionId', null);
        context.set('adminEmail', null);
        context.set('adminRole', 'owner');
        await next();
        return;
      }
    }

    const session = await authenticateAdminSession(
      db,
      getCookie(context, ADMIN_SESSION_COOKIE) ?? '',
    );
    if (!session) {
      return context.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired admin credentials',
            requestId: context.get('requestId'),
          },
        },
        401,
      );
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) {
      if (session.role === 'viewer') {
        return context.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'This administrator has read-only access',
              requestId: context.get('requestId'),
            },
          },
          403,
        );
      }
      const headerToken = context.req.header('x-csrf-token') ?? '';
      const cookieToken = getCookie(context, ADMIN_CSRF_COOKIE) ?? '';
      if (
        !headerToken ||
        headerToken !== cookieToken ||
        !(await verifyCsrfToken(session.csrfHash, headerToken))
      ) {
        return context.json(
          {
            error: {
              code: 'CSRF_FAILED',
              message: 'CSRF validation failed',
              requestId: context.get('requestId'),
            },
          },
          403,
        );
      }
    }

    context.set('adminUserId', session.adminUserId);
    context.set('adminSessionId', session.id);
    context.set('adminEmail', session.email);
    context.set('adminRole', session.role);
    await next();
  };
}
