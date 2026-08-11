import { and, eq } from 'drizzle-orm';
import type {
  AdminCourseMutation,
  AdminCourseTeacherMutation,
  AdminDepartmentMutation,
  AdminTeacherMutation,
  AdminTemplateMutation,
} from '../../../../shared/domain-contracts';
import type { Database } from '../../db/client';
import {
  auditLogs,
  courses,
  courseTeachers,
  coverTemplates,
  datasetReleases,
  departments,
  teachers,
} from '../../db/schema';
import { buildSearchText, normalizeSearch } from '../../utils/normalize';

type AuditContext = {
  adminUserId: string | null;
  requestId: string;
};

export type ReleaseMutationDatabase = Pick<
  Database,
  'insert' | 'select' | 'update'
>;

export async function getDraftRelease(
  db: Pick<Database, 'select'>,
  releaseId: string,
) {
  const [release] = await db
    .select()
    .from(datasetReleases)
    .where(eq(datasetReleases.id, releaseId))
    .limit(1);
  return release;
}

async function audit(
  db: Pick<Database, 'insert'>,
  releaseId: string,
  entityType: string,
  entityKey: string,
  context: AuditContext,
) {
  await db.insert(auditLogs).values({
    adminUserId: context.adminUserId,
    action: 'upsert',
    entityType,
    entityKey,
    releaseId,
    summary: `Created or updated a ${entityType} draft record`,
    requestId: context.requestId,
  });
}

export async function upsertDepartment(
  db: ReleaseMutationDatabase,
  releaseId: string,
  input: AdminDepartmentMutation,
  context: AuditContext,
) {
  const [saved] = await db
    .insert(departments)
    .values({
      id: `${releaseId}:${input.stableKey}`,
      releaseId,
      stableKey: input.stableKey,
      name: input.fullName,
      fullName: input.fullName,
      shortName: input.shortName,
      slug: input.slug,
      faculty: input.faculty,
      active: input.active,
    })
    .onConflictDoUpdate({
      target: [departments.releaseId, departments.stableKey],
      set: {
        name: input.fullName,
        fullName: input.fullName,
        shortName: input.shortName,
        slug: input.slug,
        faculty: input.faculty,
        active: input.active,
        updatedAt: new Date(),
      },
    })
    .returning();
  await audit(db, releaseId, 'department', input.stableKey, context);
  return saved;
}

export async function upsertTeacher(
  db: ReleaseMutationDatabase,
  releaseId: string,
  input: AdminTeacherMutation,
  context: AuditContext,
) {
  const [department] = await db
    .select({
      id: departments.id,
      name: departments.fullName,
      shortName: departments.shortName,
    })
    .from(departments)
    .where(
      and(
        eq(departments.releaseId, releaseId),
        eq(departments.stableKey, input.departmentKey),
      ),
    )
    .limit(1);
  if (!department)
    throw new Error('Teacher department does not exist in the draft release');
  const [existing] = await db
    .select({ id: teachers.id })
    .from(teachers)
    .where(
      and(
        eq(teachers.releaseId, releaseId),
        eq(teachers.stableKey, input.stableKey),
      ),
    )
    .limit(1);
  const values = {
    releaseId,
    stableKey: input.stableKey,
    fullName: input.name,
    normalizedName: normalizeSearch(input.name),
    designation: input.designation,
    departmentId: department.id,
    departmentKey: input.departmentKey,
    searchText: buildSearchText([
      input.name,
      input.designation,
      department.name,
      department.shortName,
    ]),
    profileUrl: input.profileUrl,
    sourceUrl: input.sourceUrl,
    lastVerifiedAt: input.lastVerifiedAt
      ? new Date(`${input.lastVerifiedAt}T00:00:00.000Z`)
      : null,
    active: input.active,
  };
  const [saved] = existing
    ? await db
        .update(teachers)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(teachers.id, existing.id))
        .returning()
    : await db.insert(teachers).values(values).returning();
  await audit(db, releaseId, 'teacher', input.stableKey, context);
  return saved;
}

export async function upsertCourse(
  db: ReleaseMutationDatabase,
  releaseId: string,
  input: AdminCourseMutation,
  context: AuditContext,
) {
  const [saved] = await db
    .insert(courses)
    .values({
      releaseId,
      stableKey: input.stableKey,
      code: input.code,
      normalizedCode: normalizeSearch(input.code).replaceAll(' ', ''),
      title: input.title,
      departmentKey: input.departmentKey,
      searchText: buildSearchText([
        input.code,
        input.title,
        input.departmentKey,
      ]),
      active: input.active,
    })
    .onConflictDoUpdate({
      target: [courses.releaseId, courses.stableKey],
      set: {
        code: input.code,
        normalizedCode: normalizeSearch(input.code).replaceAll(' ', ''),
        title: input.title,
        departmentKey: input.departmentKey,
        searchText: buildSearchText([
          input.code,
          input.title,
          input.departmentKey,
        ]),
        active: input.active,
        updatedAt: new Date(),
      },
    })
    .returning();
  await audit(db, releaseId, 'course', input.stableKey, context);
  return saved;
}

export async function upsertCourseTeacher(
  db: ReleaseMutationDatabase,
  releaseId: string,
  input: AdminCourseTeacherMutation,
  context: AuditContext,
) {
  const [saved] = await db
    .insert(courseTeachers)
    .values({ releaseId, ...input })
    .onConflictDoUpdate({
      target: [
        courseTeachers.releaseId,
        courseTeachers.courseKey,
        courseTeachers.teacherKey,
      ],
      set: { priority: input.priority, active: input.active },
    })
    .returning();
  await audit(
    db,
    releaseId,
    'course_teacher',
    `${input.courseKey}:${input.teacherKey}`,
    context,
  );
  return saved;
}

export async function upsertTemplate(
  db: ReleaseMutationDatabase,
  releaseId: string,
  input: AdminTemplateMutation,
  context: AuditContext,
) {
  const [saved] = await db
    .insert(coverTemplates)
    .values({ releaseId, ...input })
    .onConflictDoUpdate({
      target: [coverTemplates.releaseId, coverTemplates.stableKey],
      set: {
        departmentKey: input.departmentKey,
        coverType: input.coverType,
        name: input.name,
        templateVersion: input.templateVersion,
        status: input.status,
        configuration: input.configuration,
        effectiveDate: input.effectiveDate,
        releaseNotes: input.releaseNotes,
        active: input.active,
        updatedAt: new Date(),
      },
    })
    .returning();
  await audit(db, releaseId, 'cover_template', input.stableKey, context);
  return saved;
}
