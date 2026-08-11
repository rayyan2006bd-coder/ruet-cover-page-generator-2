import { and, asc, eq, gt, ilike, or } from 'drizzle-orm';
import type {
  CourseQuery,
  TemplateQuery,
} from '../../../../shared/api-contracts';
import {
  coverTemplateSchema,
  type DirectoryCourse,
  type DirectoryTeacher,
  datasetExportSchema,
} from '../../../../shared/domain-contracts';
import type { Database } from '../../db/client';
import {
  courses,
  courseTeachers,
  coverTemplates,
  departments,
  teachers,
} from '../../db/schema';
import { checksumRecords } from '../../utils/checksum';
import { normalizeSearch } from '../../utils/normalize';
import { requirePublishedRelease } from './current';

const teacherSelection = {
  id: teachers.id,
  stableKey: teachers.stableKey,
  fullName: teachers.fullName,
  designation: teachers.designation,
  profileUrl: teachers.profileUrl,
  sourceUrl: teachers.sourceUrl,
  lastVerifiedAt: teachers.lastVerifiedAt,
  departmentId: departments.id,
  departmentStableKey: departments.stableKey,
  departmentName: departments.fullName,
  departmentShortName: departments.shortName,
  departmentSlug: departments.slug,
  departmentFaculty: departments.faculty,
};

function mapTeacher(
  row: {
    id: string;
    stableKey: string;
    fullName: string;
    designation: string;
    profileUrl: string | null;
    sourceUrl: string | null;
    lastVerifiedAt: Date | null;
    departmentId: string;
    departmentStableKey: string;
    departmentName: string;
    departmentShortName: string;
    departmentSlug: string;
    departmentFaculty: string | null;
  },
  releaseVersion: string,
): DirectoryTeacher {
  return {
    id: row.id,
    stableKey: row.stableKey,
    releaseVersion,
    fullName: row.fullName,
    designation: row.designation,
    department: {
      id: row.departmentId,
      name: row.departmentName,
      shortName: row.departmentShortName,
      slug: row.departmentSlug,
      faculty: row.departmentFaculty,
    },
    ...(row.profileUrl ? { profileUrl: row.profileUrl } : {}),
    ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
    ...(row.lastVerifiedAt
      ? { lastVerifiedAt: row.lastVerifiedAt.toISOString().slice(0, 10) }
      : {}),
  };
}

export async function listCourses(db: Database, query: CourseQuery) {
  const release = await requirePublishedRelease(db);
  const filters = [eq(courses.releaseId, release.id), eq(courses.active, true)];
  filters.push(eq(departments.active, true));
  if (query.cursor) filters.push(gt(courses.stableKey, query.cursor));
  if (query.department) {
    const department = `%${normalizeSearch(query.department)}%`;
    const filter = or(
      ilike(courses.departmentKey, department),
      ilike(departments.shortName, department),
      ilike(departments.fullName, department),
    );
    if (filter) filters.push(filter);
  }
  if (query.query) {
    for (const token of normalizeSearch(query.query)
      .split(' ')
      .filter(Boolean)) {
      filters.push(ilike(courses.searchText, `%${token}%`));
    }
  }
  const rows = await db
    .select({
      stableKey: courses.stableKey,
      code: courses.code,
      normalizedCode: courses.normalizedCode,
      title: courses.title,
      departmentKey: courses.departmentKey,
      departmentName: departments.fullName,
      active: courses.active,
    })
    .from(courses)
    .innerJoin(
      departments,
      and(
        eq(departments.releaseId, courses.releaseId),
        eq(departments.stableKey, courses.departmentKey),
      ),
    )
    .where(and(...filters))
    .orderBy(asc(courses.stableKey))
    .limit(query.limit + 1);
  const hasMore = rows.length > query.limit;
  const visible = rows.slice(0, query.limit).map(
    (course): DirectoryCourse => ({
      ...course,
      releaseVersion: release.version,
    }),
  );
  return {
    items: visible,
    cursor: hasMore ? (visible[visible.length - 1]?.stableKey ?? null) : null,
    hasMore,
    releaseVersion: release.version,
  };
}

export async function suggestedTeachers(db: Database, courseKey: string) {
  const release = await requirePublishedRelease(db);
  const rows = await db
    .select(teacherSelection)
    .from(courseTeachers)
    .innerJoin(
      courses,
      and(
        eq(courses.releaseId, courseTeachers.releaseId),
        eq(courses.stableKey, courseTeachers.courseKey),
      ),
    )
    .innerJoin(
      teachers,
      and(
        eq(teachers.releaseId, courseTeachers.releaseId),
        eq(teachers.stableKey, courseTeachers.teacherKey),
      ),
    )
    .innerJoin(
      departments,
      and(
        eq(departments.releaseId, teachers.releaseId),
        eq(departments.stableKey, teachers.departmentKey),
      ),
    )
    .where(
      and(
        eq(courseTeachers.releaseId, release.id),
        eq(courseTeachers.courseKey, courseKey),
        eq(courseTeachers.active, true),
        eq(courses.active, true),
        eq(teachers.active, true),
        eq(departments.active, true),
      ),
    )
    .orderBy(asc(courseTeachers.priority), asc(teachers.fullName));
  return {
    items: rows.map((row) => mapTeacher(row, release.version)),
    releaseVersion: release.version,
  };
}

export async function listTemplates(db: Database, query: TemplateQuery) {
  const release = await requirePublishedRelease(db);
  const filters = [
    eq(coverTemplates.releaseId, release.id),
    eq(coverTemplates.active, true),
    eq(coverTemplates.status, 'published'),
  ];
  if (query.department) {
    filters.push(eq(coverTemplates.departmentKey, query.department));
  }
  if (query.coverType) {
    filters.push(eq(coverTemplates.coverType, query.coverType));
  }
  const rows = await db
    .select()
    .from(coverTemplates)
    .where(and(...filters))
    .orderBy(asc(coverTemplates.departmentKey), asc(coverTemplates.name));
  return {
    items: rows.map((row) =>
      coverTemplateSchema.parse({
        stableKey: row.stableKey,
        departmentKey: row.departmentKey,
        coverType: row.coverType,
        name: row.name,
        templateVersion: row.templateVersion,
        status: row.status,
        configuration: row.configuration,
        effectiveDate: row.effectiveDate,
        releaseNotes: row.releaseNotes,
        releaseVersion: release.version,
        active: row.active,
      }),
    ),
    releaseVersion: release.version,
  };
}

export async function getPublishedDataset(db: Database) {
  const release = await requirePublishedRelease(db);
  const [
    departmentRows,
    teacherRows,
    courseRows,
    relationshipRows,
    templateRows,
  ] = await Promise.all([
    db
      .select()
      .from(departments)
      .where(
        and(
          eq(departments.releaseId, release.id),
          eq(departments.active, true),
        ),
      )
      .orderBy(asc(departments.stableKey)),
    db
      .select(teacherSelection)
      .from(teachers)
      .innerJoin(
        departments,
        and(
          eq(departments.releaseId, teachers.releaseId),
          eq(departments.stableKey, teachers.departmentKey),
        ),
      )
      .where(
        and(
          eq(teachers.releaseId, release.id),
          eq(teachers.active, true),
          eq(departments.active, true),
        ),
      )
      .orderBy(asc(teachers.stableKey)),
    db
      .select({
        stableKey: courses.stableKey,
        code: courses.code,
        normalizedCode: courses.normalizedCode,
        title: courses.title,
        departmentKey: courses.departmentKey,
        departmentName: departments.fullName,
        active: courses.active,
      })
      .from(courses)
      .innerJoin(
        departments,
        and(
          eq(departments.releaseId, courses.releaseId),
          eq(departments.stableKey, courses.departmentKey),
        ),
      )
      .where(
        and(
          eq(courses.releaseId, release.id),
          eq(courses.active, true),
          eq(departments.active, true),
        ),
      )
      .orderBy(asc(courses.stableKey)),
    db
      .select({
        courseKey: courseTeachers.courseKey,
        teacherKey: courseTeachers.teacherKey,
        priority: courseTeachers.priority,
        active: courseTeachers.active,
      })
      .from(courseTeachers)
      .innerJoin(
        courses,
        and(
          eq(courses.releaseId, courseTeachers.releaseId),
          eq(courses.stableKey, courseTeachers.courseKey),
        ),
      )
      .innerJoin(
        teachers,
        and(
          eq(teachers.releaseId, courseTeachers.releaseId),
          eq(teachers.stableKey, courseTeachers.teacherKey),
        ),
      )
      .where(
        and(
          eq(courseTeachers.releaseId, release.id),
          eq(courseTeachers.active, true),
          eq(courses.active, true),
          eq(teachers.active, true),
        ),
      )
      .orderBy(asc(courseTeachers.courseKey), asc(courseTeachers.priority)),
    db
      .select()
      .from(coverTemplates)
      .where(
        and(
          eq(coverTemplates.releaseId, release.id),
          eq(coverTemplates.active, true),
          eq(coverTemplates.status, 'published'),
        ),
      )
      .orderBy(asc(coverTemplates.departmentKey), asc(coverTemplates.name)),
  ]);

  const payload = {
    departments: departmentRows.map((department) => ({
      id: department.id,
      stableKey: department.stableKey,
      releaseVersion: release.version,
      name: department.fullName,
      shortName: department.shortName,
      slug: department.slug,
      faculty: department.faculty,
    })),
    teachers: teacherRows.map((teacher) =>
      mapTeacher(teacher, release.version),
    ),
    courses: courseRows.map((course) => ({
      ...course,
      releaseVersion: release.version,
    })),
    courseTeachers: relationshipRows.map((relationship) => ({
      ...relationship,
      releaseVersion: release.version,
    })),
    templates: templateRows.map((template) =>
      coverTemplateSchema.parse({
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
      }),
    ),
  };
  const checksum = await checksumRecords([
    payload.departments,
    payload.teachers,
    payload.courses,
    payload.courseTeachers,
    payload.templates,
  ]);
  return datasetExportSchema.parse({
    manifest: {
      apiVersion: '1.0',
      releaseVersion: release.version,
      checksum,
      publishedAt: (release.publishedAt ?? release.createdAt).toISOString(),
      counts: {
        departments: payload.departments.length,
        teachers: payload.teachers.length,
        courses: payload.courses.length,
        relationships: payload.courseTeachers.length,
        templates: payload.templates.length,
      },
    },
    ...payload,
  });
}
