import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { adminSessions, adminUsers } from '../../db/schema';
import { sha256 } from '../../utils/checksum';

export const ADMIN_SESSION_COOKIE = 'ruet_admin_session';
export const ADMIN_CSRF_COOKIE = 'ruet_admin_csrf';
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString('base64url');
}

export async function createAdminSession(db: Database, adminUserId: string) {
  const token = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000);
  const [session] = await db
    .insert(adminSessions)
    .values({
      adminUserId,
      tokenHash: await sha256(token),
      csrfHash: await sha256(csrfToken),
      expiresAt,
    })
    .returning({ id: adminSessions.id });
  if (!session) throw new Error('Could not create admin session');
  return { id: session.id, token, csrfToken, expiresAt };
}

export async function authenticateAdminSession(db: Database, token: string) {
  if (!token) return null;
  const [session] = await db
    .select({
      id: adminSessions.id,
      adminUserId: adminSessions.adminUserId,
      csrfHash: adminSessions.csrfHash,
      expiresAt: adminSessions.expiresAt,
      email: adminUsers.email,
      role: adminUsers.role,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminUserId))
    .where(
      and(
        eq(adminSessions.tokenHash, await sha256(token)),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, new Date()),
        eq(adminUsers.active, true),
      ),
    )
    .limit(1);
  if (!session) return null;
  await db
    .update(adminSessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(adminSessions.id, session.id));
  return session;
}

export async function verifyCsrfToken(hash: string, token: string) {
  return token.length >= 32 && (await sha256(token)) === hash;
}

export async function revokeAdminSession(db: Database, id: string) {
  await db
    .update(adminSessions)
    .set({ revokedAt: new Date() })
    .where(eq(adminSessions.id, id));
}
