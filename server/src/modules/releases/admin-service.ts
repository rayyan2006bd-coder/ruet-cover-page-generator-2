import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  adminReleaseValidationSchema,
  coverTemplateSchema,
} from '../../../../shared/domain-contracts';
import type { Database } from '../../db/client';
import {
  auditLogs,
  courses,
  courseTeachers,
  coverTemplates,
  datasetReleases,
  departments,
  teacherAliases,
  teachers,
} from '../../db/schema';

export async function listDatasetReleases(db: Database) {
  return db
    .select()
    .from(datasetReleases)
    .orderBy(desc(datasetReleases.createdAt));
}

export async function getDatasetReleaseContents(
  db: Database,
  releaseId: string,
) {
  const [release] = await db
    .select()
    .from(datasetReleases)
    .where(eq(datasetReleases.id, releaseId))
    .limit(1);
  if (!release) return null;

  const [departmentRows, teacherRows, courseRows, relationships, templates] =
    await Promise.all([
      db
        .select()
        .from(departments)
        .where(eq(departments.releaseId, releaseId))
        .orderBy(departments.stableKey),
      db
        .select()
        .from(teachers)
        .where(eq(teachers.releaseId, releaseId))
        .orderBy(teachers.stableKey),
      db
        .select()
        .from(courses)
        .where(eq(courses.releaseId, releaseId))
        .orderBy(courses.stableKey),
      db
        .select()
        .from(courseTeachers)
        .where(eq(courseTeachers.releaseId, releaseId))
        .orderBy(courseTeachers.courseKey, courseTeachers.priority),
      db
        .select()
        .from(coverTemplates)
        .where(eq(coverTemplates.releaseId, releaseId))
        .orderBy(coverTemplates.stableKey),
    ]);

  return {
    release,
    departments: departmentRows.map((department) => ({
      stableKey: department.stableKey,
      shortName: department.shortName,
      fullName: department.fullName,
      slug: department.slug,
      faculty: department.faculty,
      active: department.active,
    })),
    teachers: teacherRows.map((teacher) => ({
      stableKey: teacher.stableKey,
      name: teacher.fullName,
      designation: teacher.designation,
      departmentKey: teacher.departmentKey,
      profileUrl: teacher.profileUrl,
      sourceUrl: teacher.sourceUrl,
      lastVerifiedAt:
        teacher.lastVerifiedAt?.toISOString().slice(0, 10) ?? null,
      active: teacher.active,
    })),
    courses: courseRows.map((course) => ({
      stableKey: course.stableKey,
      code: course.code,
      title: course.title,
      departmentKey: course.departmentKey,
      active: course.active,
    })),
    courseTeachers: relationships.map((relationship) => ({
      courseKey: relationship.courseKey,
      teacherKey: relationship.teacherKey,
      priority: relationship.priority,
      active: relationship.active,
    })),
    templates: templates.map((template) => ({
      stableKey: template.stableKey,
      departmentKey: template.departmentKey,
      coverType: template.coverType,
      name: template.name,
      templateVersion: template.templateVersion,
      status: template.status,
      configuration: template.configuration,
      effectiveDate: template.effectiveDate,
      releaseNotes: template.releaseNotes,
      active: template.active,
    })),
  };
}

export async function createDraftRelease(
  db: Database,
  input: {
    version: string;
    notes: string;
    copyFromId?: string;
    adminUserId: string | null;
    requestId: string;
  },
) {
  const [source] = input.copyFromId
    ? await db
        .select({ id: datasetReleases.id })
        .from(datasetReleases)
        .where(eq(datasetReleases.id, input.copyFromId))
        .limit(1)
    : [];
  if (input.copyFromId && !source) return null;
  return db.transaction(async (tx) => {
    const [release] = await tx
      .insert(datasetReleases)
      .values({
        version: input.version,
        notes: input.notes,
        createdBy: input.adminUserId,
      })
      .returning();
    if (!release) throw new Error('Could not create draft release');

    if (source) {
      const [
        sourceDepartments,
        sourceTeachers,
        sourceCourses,
        relationships,
        templates,
      ] = await Promise.all([
        tx
          .select()
          .from(departments)
          .where(eq(departments.releaseId, source.id)),
        tx.select().from(teachers).where(eq(teachers.releaseId, source.id)),
        tx.select().from(courses).where(eq(courses.releaseId, source.id)),
        tx
          .select()
          .from(courseTeachers)
          .where(eq(courseTeachers.releaseId, source.id)),
        tx
          .select()
          .from(coverTemplates)
          .where(eq(coverTemplates.releaseId, source.id)),
      ]);
      if (sourceDepartments.length) {
        await tx.insert(departments).values(
          sourceDepartments.map((department) => ({
            id: `${release.id}:${department.stableKey}`,
            releaseId: release.id,
            stableKey: department.stableKey,
            name: department.name,
            fullName: department.fullName,
            shortName: department.shortName,
            slug: department.slug,
            faculty: department.faculty,
            active: department.active,
          })),
        );
      }
      const copiedTeacherIds = new Map<string, string>();
      for (const teacher of sourceTeachers) {
        const departmentId = `${release.id}:${teacher.departmentKey}`;
        const [copied] = await tx
          .insert(teachers)
          .values({
            releaseId: release.id,
            stableKey: teacher.stableKey,
            fullName: teacher.fullName,
            normalizedName: teacher.normalizedName,
            designation: teacher.designation,
            departmentId,
            departmentKey: teacher.departmentKey,
            searchText: teacher.searchText,
            profileUrl: teacher.profileUrl,
            sourceUrl: teacher.sourceUrl,
            lastVerifiedAt: teacher.lastVerifiedAt,
            active: teacher.active,
          })
          .returning({ id: teachers.id });
        if (copied) copiedTeacherIds.set(teacher.id, copied.id);
      }
      if (sourceTeachers.length) {
        const aliases = await tx
          .select()
          .from(teacherAliases)
          .where(
            inArray(
              teacherAliases.teacherId,
              sourceTeachers.map((item) => item.id),
            ),
          );
        const copiedAliases = aliases.flatMap((alias) => {
          const teacherId = copiedTeacherIds.get(alias.teacherId);
          return teacherId
            ? [
                {
                  teacherId,
                  alias: alias.alias,
                  normalizedAlias: alias.normalizedAlias,
                },
              ]
            : [];
        });
        if (copiedAliases.length)
          await tx.insert(teacherAliases).values(copiedAliases);
      }
      if (sourceCourses.length) {
        await tx.insert(courses).values(
          sourceCourses.map((course) => ({
            releaseId: release.id,
            stableKey: course.stableKey,
            code: course.code,
            normalizedCode: course.normalizedCode,
            title: course.title,
            departmentKey: course.departmentKey,
            searchText: course.searchText,
            active: course.active,
          })),
        );
      }
      if (relationships.length) {
        await tx.insert(courseTeachers).values(
          relationships.map((relationship) => ({
            releaseId: release.id,
            courseKey: relationship.courseKey,
            teacherKey: relationship.teacherKey,
            priority: relationship.priority,
            active: relationship.active,
          })),
        );
      }
      if (templates.length) {
        await tx.insert(coverTemplates).values(
          templates.map((template) => ({
            releaseId: release.id,
            stableKey: template.stableKey,
            departmentKey: template.departmentKey,
            coverType: template.coverType,
            name: template.name,
            templateVersion: template.templateVersion,
            status: template.status,
            configuration: template.configuration,
            effectiveDate: template.effectiveDate,
            releaseNotes: template.releaseNotes,
            active: template.active,
          })),
        );
      }
    }
    await tx.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: source ? 'clone' : 'create',
      entityType: 'dataset_release',
      entityId: release.id,
      entityKey: release.version,
      releaseId: release.id,
      summary: source
        ? 'Created a draft by copying an existing release'
        : 'Created an empty draft release',
      requestId: input.requestId,
    });
    return release;
  });
}

export async function validateDatasetRelease(
  db: Pick<Database, 'select'>,
  releaseId: string,
) {
  const [release] = await db
    .select()
    .from(datasetReleases)
    .where(eq(datasetReleases.id, releaseId))
    .limit(1);
  if (!release) return null;
  const [departmentRows, teacherRows, courseRows, relationships, templates] =
    await Promise.all([
      db.select().from(departments).where(eq(departments.releaseId, releaseId)),
      db.select().from(teachers).where(eq(teachers.releaseId, releaseId)),
      db.select().from(courses).where(eq(courses.releaseId, releaseId)),
      db
        .select()
        .from(courseTeachers)
        .where(eq(courseTeachers.releaseId, releaseId)),
      db
        .select()
        .from(coverTemplates)
        .where(eq(coverTemplates.releaseId, releaseId)),
    ]);
  const issues: Array<{
    code: string;
    message: string;
    entityType:
      | 'release'
      | 'department'
      | 'teacher'
      | 'course'
      | 'relationship'
      | 'template';
    entityKey: string | null;
  }> = [];
  if (!departmentRows.some((department) => department.active)) {
    issues.push({
      code: 'NO_ACTIVE_DEPARTMENTS',
      message: 'A release needs at least one active department.',
      entityType: 'release',
      entityKey: release.version,
    });
  }
  const departmentKeys = new Set(departmentRows.map((item) => item.stableKey));
  const activeDepartmentKeys = new Set(
    departmentRows.filter((item) => item.active).map((item) => item.stableKey),
  );
  const teacherKeys = new Set(teacherRows.map((item) => item.stableKey));
  const activeTeacherKeys = new Set(
    teacherRows.filter((item) => item.active).map((item) => item.stableKey),
  );
  const courseKeys = new Set(courseRows.map((item) => item.stableKey));
  const activeCourseKeys = new Set(
    courseRows.filter((item) => item.active).map((item) => item.stableKey),
  );
  for (const teacher of teacherRows) {
    if (!departmentKeys.has(teacher.departmentKey)) {
      issues.push({
        code: 'UNKNOWN_TEACHER_DEPARTMENT',
        message: 'Teacher references a department missing from this release.',
        entityType: 'teacher',
        entityKey: teacher.stableKey,
      });
    } else if (
      teacher.active &&
      !activeDepartmentKeys.has(teacher.departmentKey)
    ) {
      issues.push({
        code: 'ACTIVE_TEACHER_IN_INACTIVE_DEPARTMENT',
        message: 'An active teacher cannot belong to an inactive department.',
        entityType: 'teacher',
        entityKey: teacher.stableKey,
      });
    }
  }
  for (const course of courseRows) {
    if (!departmentKeys.has(course.departmentKey)) {
      issues.push({
        code: 'UNKNOWN_COURSE_DEPARTMENT',
        message: 'Course references a department missing from this release.',
        entityType: 'course',
        entityKey: course.stableKey,
      });
    } else if (
      course.active &&
      !activeDepartmentKeys.has(course.departmentKey)
    ) {
      issues.push({
        code: 'ACTIVE_COURSE_IN_INACTIVE_DEPARTMENT',
        message: 'An active course cannot belong to an inactive department.',
        entityType: 'course',
        entityKey: course.stableKey,
      });
    }
  }
  for (const relationship of relationships) {
    if (
      !courseKeys.has(relationship.courseKey) ||
      !teacherKeys.has(relationship.teacherKey)
    ) {
      issues.push({
        code: 'BROKEN_COURSE_TEACHER_RELATIONSHIP',
        message: 'Course-teacher relationship references a missing record.',
        entityType: 'relationship',
        entityKey: `${relationship.courseKey}:${relationship.teacherKey}`,
      });
    } else if (
      relationship.active &&
      (!activeCourseKeys.has(relationship.courseKey) ||
        !activeTeacherKeys.has(relationship.teacherKey))
    ) {
      issues.push({
        code: 'ACTIVE_RELATIONSHIP_HAS_INACTIVE_RECORD',
        message:
          'An active course-teacher relationship must reference active records.',
        entityType: 'relationship',
        entityKey: `${relationship.courseKey}:${relationship.teacherKey}`,
      });
    }
  }
  for (const template of templates) {
    const parsed = coverTemplateSchema.safeParse({
      stableKey: template.stableKey,
      departmentKey: template.departmentKey,
      coverType: template.coverType,
      name: template.name,
      templateVersion: template.templateVersion,
      status: template.status,
      configuration: template.configuration,
      effectiveDate: template.effectiveDate,
      releaseNotes: template.releaseNotes,
      releaseVersion: release.version,
      active: template.active,
    });
    if (
      !parsed.success ||
      !departmentKeys.has(template.departmentKey) ||
      (template.active && !activeDepartmentKeys.has(template.departmentKey))
    ) {
      issues.push({
        code: 'INVALID_TEMPLATE',
        message: 'Template configuration or department reference is invalid.',
        entityType: 'template',
        entityKey: template.stableKey,
      });
    }
  }
  return adminReleaseValidationSchema.parse({
    valid: issues.length === 0,
    releaseVersion: release.version,
    issues,
  });
}

export async function publishDatasetRelease(
  db: Database,
  input: { releaseId: string; adminUserId: string | null; requestId: string },
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from dataset_releases where id = ${input.releaseId} for update`,
    );
    const validation = await validateDatasetRelease(tx, input.releaseId);
    if (!validation) return { status: 'not-found' as const };
    if (!validation.valid) return { status: 'invalid' as const, validation };
    const [draft] = await tx
      .select()
      .from(datasetReleases)
      .where(
        and(
          eq(datasetReleases.id, input.releaseId),
          eq(datasetReleases.status, 'draft'),
        ),
      )
      .limit(1);
    if (!draft) return { status: 'conflict' as const };
    await tx
      .update(datasetReleases)
      .set({ status: 'retired' })
      .where(eq(datasetReleases.status, 'published'));
    const [published] = await tx
      .update(datasetReleases)
      .set({
        status: 'published',
        publishedAt: new Date(),
        publishedBy: input.adminUserId,
      })
      .where(eq(datasetReleases.id, input.releaseId))
      .returning();
    await tx.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: 'publish',
      entityType: 'dataset_release',
      entityId: input.releaseId,
      entityKey: draft.version,
      releaseId: input.releaseId,
      summary: 'Published a validated directory release',
      requestId: input.requestId,
    });
    return published
      ? { status: 'published' as const, release: published }
      : { status: 'conflict' as const };
  });
}

export async function rollbackDatasetRelease(
  db: Database,
  input: { releaseId: string; adminUserId: string | null; requestId: string },
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from dataset_releases where id = ${input.releaseId} for update`,
    );
    const validation = await validateDatasetRelease(tx, input.releaseId);
    if (!validation) return { status: 'not-found' as const };
    if (!validation.valid) return { status: 'invalid' as const, validation };
    const [target] = await tx
      .select()
      .from(datasetReleases)
      .where(eq(datasetReleases.id, input.releaseId))
      .limit(1);
    if (!target || target.status === 'draft') {
      return { status: 'conflict' as const };
    }
    await tx
      .update(datasetReleases)
      .set({ status: 'retired' })
      .where(eq(datasetReleases.status, 'published'));
    const [published] = await tx
      .update(datasetReleases)
      .set({
        status: 'published',
        publishedAt: new Date(),
        publishedBy: input.adminUserId,
      })
      .where(eq(datasetReleases.id, input.releaseId))
      .returning();
    await tx.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: 'rollback',
      entityType: 'dataset_release',
      entityId: input.releaseId,
      entityKey: target.version,
      releaseId: input.releaseId,
      summary: 'Rolled back by republishing a previous valid release',
      requestId: input.requestId,
    });
    return published
      ? { status: 'published' as const, release: published }
      : { status: 'conflict' as const };
  });
}
