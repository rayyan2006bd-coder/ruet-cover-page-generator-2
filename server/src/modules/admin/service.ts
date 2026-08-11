import { eq } from 'drizzle-orm';
import type { TeacherImportItem } from '../../../../shared/api-contracts';
import { findTeacherDuplicates } from '../../data/validation';
import type { Database } from '../../db/client';
import {
  auditLogs,
  departments,
  teacherAliases,
  teachers,
} from '../../db/schema';
import { buildSearchText, normalizeSearch } from '../../utils/normalize';

export async function importTeachers(
  db: Database,
  input: { dryRun: boolean; items: TeacherImportItem[] },
) {
  const departmentRows = await db.select().from(departments);
  const departmentByReference = new Map(
    departmentRows.flatMap((department) => [
      [department.id.toLowerCase(), department],
      [department.shortName.toLowerCase(), department],
      [department.name.toLowerCase(), department],
      [department.slug.toLowerCase(), department],
    ]),
  );
  const duplicates = findTeacherDuplicates(input.items);
  const unknownDepartments = input.items
    .filter((item) => !departmentByReference.has(item.department.toLowerCase()))
    .map((item) => ({ fullName: item.fullName, department: item.department }));
  const existingRows = await db
    .select({
      id: teachers.id,
      fullName: teachers.fullName,
      normalizedName: teachers.normalizedName,
      departmentId: teachers.departmentId,
    })
    .from(teachers);
  const existingMatches = input.items.flatMap((item, index) => {
    const department = departmentByReference.get(item.department.toLowerCase());
    if (!department) return [];
    const match = existingRows.find(
      (row) =>
        row.departmentId === department.id &&
        row.normalizedName === normalizeSearch(item.fullName),
    );
    return match
      ? [
          {
            index,
            incomingName: item.fullName,
            existingId: match.id,
            existingName: match.fullName,
          },
        ]
      : [];
  });
  if (duplicates.length || unknownDepartments.length || input.dryRun) {
    return {
      dryRun: input.dryRun,
      valid: duplicates.length === 0 && unknownDepartments.length === 0,
      imported: 0,
      duplicates,
      existingMatches,
      unknownDepartments,
    };
  }

  const imported = await db.transaction(async (tx) => {
    let count = 0;
    for (const item of input.items) {
      const department = departmentByReference.get(
        item.department.toLowerCase(),
      );
      if (!department)
        throw new Error(`Unknown department: ${item.department}`);
      const normalizedName = normalizeSearch(item.fullName);
      const searchText = buildSearchText([
        item.fullName,
        item.designation,
        department.name,
        department.shortName,
        ...item.aliases,
      ]);
      const [saved] = await tx
        .insert(teachers)
        .values({
          ...(item.id ? { id: item.id } : {}),
          stableKey: item.id ?? crypto.randomUUID(),
          fullName: item.fullName,
          normalizedName,
          designation: item.designation,
          departmentId: department.id,
          departmentKey: department.stableKey,
          searchText,
          profileUrl: item.profileUrl,
          sourceUrl: item.sourceUrl,
          lastVerifiedAt: item.lastVerifiedAt
            ? new Date(`${item.lastVerifiedAt}T00:00:00.000Z`)
            : undefined,
          active: item.active,
        })
        .onConflictDoUpdate({
          target: [
            teachers.releaseId,
            teachers.normalizedName,
            teachers.departmentKey,
          ],
          set: {
            fullName: item.fullName,
            designation: item.designation,
            searchText,
            profileUrl: item.profileUrl,
            sourceUrl: item.sourceUrl,
            lastVerifiedAt: item.lastVerifiedAt
              ? new Date(`${item.lastVerifiedAt}T00:00:00.000Z`)
              : null,
            active: item.active,
            updatedAt: new Date(),
          },
        })
        .returning({ id: teachers.id });
      if (!saved) throw new Error(`Import failed for ${item.fullName}`);
      await tx
        .delete(teacherAliases)
        .where(eq(teacherAliases.teacherId, saved.id));
      if (item.aliases.length) {
        await tx.insert(teacherAliases).values(
          item.aliases.map((alias) => ({
            teacherId: saved.id,
            alias,
            normalizedAlias: normalizeSearch(alias),
          })),
        );
      }
      count += 1;
    }
    await tx.insert(auditLogs).values({
      action: 'import',
      entityType: 'teacher',
      summary: `Imported or updated ${count} teacher records`,
    });
    return count;
  });

  return {
    dryRun: false,
    valid: true,
    imported,
    duplicates: [],
    existingMatches,
    unknownDepartments: [],
  };
}

export async function updateTeacher(
  db: Database,
  id: string,
  item: TeacherImportItem,
) {
  const departmentRows = await db.select().from(departments);
  const department = departmentRows.find((row) =>
    [row.id, row.shortName, row.name, row.slug]
      .map((value) => value.toLowerCase())
      .includes(item.department.toLowerCase()),
  );
  if (!department) {
    return { valid: false, updated: false, unknownDepartment: item.department };
  }
  const normalizedName = normalizeSearch(item.fullName);
  const searchText = buildSearchText([
    item.fullName,
    item.designation,
    department.name,
    department.shortName,
    ...item.aliases,
  ]);

  const updated = await db.transaction(async (tx) => {
    const [saved] = await tx
      .update(teachers)
      .set({
        fullName: item.fullName,
        normalizedName,
        designation: item.designation,
        departmentId: department.id,
        departmentKey: department.stableKey,
        searchText,
        profileUrl: item.profileUrl ?? null,
        sourceUrl: item.sourceUrl ?? null,
        lastVerifiedAt: item.lastVerifiedAt
          ? new Date(`${item.lastVerifiedAt}T00:00:00.000Z`)
          : null,
        active: item.active,
        updatedAt: new Date(),
      })
      .where(eq(teachers.id, id))
      .returning({ id: teachers.id });
    if (!saved) return false;
    await tx.delete(teacherAliases).where(eq(teacherAliases.teacherId, id));
    if (item.aliases.length) {
      await tx.insert(teacherAliases).values(
        item.aliases.map((alias) => ({
          teacherId: id,
          alias,
          normalizedAlias: normalizeSearch(alias),
        })),
      );
    }
    await tx.insert(auditLogs).values({
      action: 'update',
      entityType: 'teacher',
      entityId: id,
      summary: 'Updated teacher directory record',
    });
    return true;
  });
  return { valid: true, updated };
}
