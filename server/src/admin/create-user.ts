import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { loadEnv } from '../config/env';
import { createDatabase } from '../db/client';
import { adminUsers, auditLogs } from '../db/schema';

const inputSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(200),
  role: z.enum(['owner', 'editor', 'viewer']).default('owner'),
});

const input = inputSchema.parse({
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
  role: process.env.ADMIN_ROLE,
});
const env = loadEnv();
const { db, client } = createDatabase(env.DATABASE_URL, 1);

try {
  const passwordHash = await Bun.password.hash(input.password, {
    algorithm: 'argon2id',
  });
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(
        and(
          eq(adminUsers.active, true),
          sql`lower(${adminUsers.email}) = ${input.email.toLowerCase()}`,
        ),
      )
      .limit(1);
    const [saved] = existing
      ? await tx
          .update(adminUsers)
          .set({
            email: input.email.toLowerCase(),
            passwordHash,
            role: input.role,
            active: true,
            updatedAt: new Date(),
          })
          .where(eq(adminUsers.id, existing.id))
          .returning({ id: adminUsers.id })
      : await tx
          .insert(adminUsers)
          .values({
            email: input.email.toLowerCase(),
            passwordHash,
            role: input.role,
          })
          .returning({ id: adminUsers.id });
    if (!saved) throw new Error('Could not save administrator');
    await tx.insert(auditLogs).values({
      adminUserId: saved.id,
      action: existing ? 'rotate_credentials' : 'create',
      entityType: 'admin_user',
      entityId: saved.id,
      summary: existing
        ? 'Rotated administrator credentials using the local CLI'
        : 'Created administrator using the local CLI',
    });
  });
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Administrator saved',
      email: input.email.toLowerCase(),
      role: input.role,
    }),
  );
} finally {
  await client.end();
}
