import { and, asc, count, desc, eq, ilike, or } from 'drizzle-orm';
import type {
  TeacherDto,
  TeacherQuery,
} from '../../../../shared/api-contracts';
import type { Database } from '../../db/client';
import { datasetVersions, departments, teachers } from '../../db/schema';
import { checksumRecords } from '../../utils/checksum';
import { normalizeSearch } from '../../utils/normalize';
import { requirePublishedRelease } from '../releases/current';

const teacherSelection = {
  id: teachers.id,
  fullName: teachers.fullName,
  designation: teachers.designation,
  profileUrl: teachers.profileUrl,
  sourceUrl: teachers.sourceUrl,
  lastVerifiedAt: teachers.lastVerifiedAt,
  departmentId: departments.id,
  departmentName: departments.name,
  departmentShortName: departments.shortName,
  departmentSlug: departments.slug,
  departmentFaculty: departments.faculty,
};

type TeacherRow = {
  id: string;
  fullName: string;
  designation: string;
  profileUrl: string | null;
  sourceUrl: string | null;
  lastVerifiedAt: Date | null;
  departmentId: string;
  departmentName: string;
  departmentShortName: string;
  departmentSlug: string;
  departmentFaculty: string | null;
};

function mapTeacher(row: TeacherRow): TeacherDto {
  return {
    id: row.id,
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

export async function listDepartments(db: Database) {
  const release = await requirePublishedRelease(db);
  return db
    .select({
      id: departments.id,
      name: departments.name,
      shortName: departments.shortName,
      slug: departments.slug,
      faculty: departments.faculty,
    })
    .from(departments)
    .where(
      and(eq(departments.active, true), eq(departments.releaseId, release.id)),
    )
    .orderBy(asc(departments.name));
}

export async function getDepartment(db: Database, slug: string) {
  const release = await requirePublishedRelease(db);
  const [item] = await db
    .select({
      id: departments.id,
      name: departments.name,
      shortName: departments.shortName,
      slug: departments.slug,
      faculty: departments.faculty,
    })
    .from(departments)
    .where(
      and(
        eq(departments.active, true),
        eq(departments.releaseId, release.id),
        eq(departments.slug, slug),
      ),
    )
    .limit(1);
  return item;
}

export async function listTeachers(db: Database, query: TeacherQuery) {
  const release = await requirePublishedRelease(db);
  const filters = [
    eq(teachers.active, true),
    eq(departments.active, true),
    eq(teachers.releaseId, release.id),
    eq(departments.releaseId, release.id),
  ];
  if (query.department) {
    const department = `%${normalizeSearch(query.department)}%`;
    const departmentFilter = or(
      ilike(departments.shortName, department),
      ilike(departments.name, department),
      ilike(departments.slug, department.replaceAll(' ', '-')),
    );
    if (departmentFilter) filters.push(departmentFilter);
  }
  if (query.designation) {
    filters.push(ilike(teachers.designation, `%${query.designation}%`));
  }
  const searchQuery = query.query ?? query.q;
  if (searchQuery) {
    for (const token of normalizeSearch(searchQuery)
      .split(' ')
      .filter(Boolean)) {
      filters.push(ilike(teachers.searchText, `%${token}%`));
    }
  }

  const where = and(...filters);
  const ordering =
    query.sort === '-name'
      ? desc(teachers.fullName)
      : query.sort === 'designation'
        ? asc(teachers.designation)
        : query.sort === '-updated'
          ? desc(teachers.updatedAt)
          : asc(teachers.fullName);

  const [rows, totals] = await Promise.all([
    db
      .select(teacherSelection)
      .from(teachers)
      .innerJoin(departments, eq(teachers.departmentId, departments.id))
      .where(where)
      .orderBy(ordering)
      .limit(query.limit)
      .offset((query.page - 1) * query.limit),
    db
      .select({ total: count() })
      .from(teachers)
      .innerJoin(departments, eq(teachers.departmentId, departments.id))
      .where(where),
  ]);
  const total = Number(totals[0]?.total ?? 0);
  return {
    items: rows.map(mapTeacher),
    pagination: buildPagination(query.page, query.limit, total),
  };
}

export function buildPagination(page: number, limit: number, total: number) {
  return { page, limit, total, hasMore: page * limit < total };
}

export async function getTeacher(db: Database, id: string) {
  const release = await requirePublishedRelease(db);
  const [row] = await db
    .select(teacherSelection)
    .from(teachers)
    .innerJoin(departments, eq(teachers.departmentId, departments.id))
    .where(
      and(
        eq(teachers.active, true),
        eq(departments.active, true),
        eq(teachers.releaseId, release.id),
        eq(departments.releaseId, release.id),
        eq(teachers.id, id),
      ),
    )
    .limit(1);
  return row ? mapTeacher(row) : undefined;
}

export async function getDirectorySnapshot(db: Database) {
  const release = await requirePublishedRelease(db);
  const [items, versions] = await Promise.all([
    db
      .select(teacherSelection)
      .from(teachers)
      .innerJoin(departments, eq(teachers.departmentId, departments.id))
      .where(
        and(
          eq(teachers.active, true),
          eq(departments.active, true),
          eq(teachers.releaseId, release.id),
          eq(departments.releaseId, release.id),
        ),
      )
      .orderBy(asc(teachers.fullName)),
    db
      .select()
      .from(datasetVersions)
      .where(eq(datasetVersions.datasetName, 'teachers'))
      .orderBy(desc(datasetVersions.publishedAt))
      .limit(1),
  ]);
  const mappedItems = items.map(mapTeacher);
  const checksum = await checksumRecords(mappedItems);
  const published = versions[0];
  return {
    version: published?.version ?? 'unpublished',
    checksum,
    updatedAt: (published?.publishedAt ?? new Date(0)).toISOString(),
    items: mappedItems,
  };
}
