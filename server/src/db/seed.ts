import { eq } from 'drizzle-orm';
import { loadEnv } from '../config/env';
import { readSeedData } from '../data/schemas';
import {
  findCourseDuplicates,
  findTeacherDuplicates,
} from '../data/validation';
import { checksumRecords } from '../utils/checksum';
import { buildSearchText, normalizeSearch } from '../utils/normalize';
import { createDatabase } from './client';
import {
  auditLogs,
  BASELINE_RELEASE_ID,
  courses,
  datasetVersions,
  departments,
  teacherAliases,
  teachers,
} from './schema';

const env = loadEnv();
const data = await readSeedData();
const teacherDuplicates = findTeacherDuplicates(data.teachers);
const courseDuplicates = findCourseDuplicates(data.courseDirectory.courses);
if (teacherDuplicates.length || courseDuplicates.length)
  throw new Error(
    `Seed contains ${teacherDuplicates.length} duplicate teacher groups and ${courseDuplicates.length} duplicate course codes`,
  );

const departmentByReference = new Map(
  data.departments.flatMap((department) => [
    [department.id.toLowerCase(), department],
    [department.shortName.toLowerCase(), department],
    [department.name.toLowerCase(), department],
  ]),
);
const { db, client } = createDatabase(env.DATABASE_URL, 1);

try {
  await db.transaction(async (tx) => {
    for (const department of data.departments) {
      await tx
        .insert(departments)
        .values({
          ...department,
          stableKey: department.id,
          fullName: department.name,
        })
        .onConflictDoUpdate({
          target: departments.id,
          set: {
            name: department.name,
            fullName: department.name,
            shortName: department.shortName,
            slug: department.slug,
            faculty: department.faculty,
            active: department.active,
            updatedAt: new Date(),
          },
        });
    }

    const datasetItems = [];
    for (const teacher of data.teachers) {
      const department = departmentByReference.get(
        teacher.department.toLowerCase(),
      );
      if (!department)
        throw new Error(`Unknown department: ${teacher.department}`);
      const normalizedName = normalizeSearch(teacher.fullName);
      const searchText = buildSearchText([
        teacher.fullName,
        teacher.designation,
        department.name,
        department.shortName,
        ...teacher.aliases,
      ]);
      const [saved] = await tx
        .insert(teachers)
        .values({
          id: teacher.id,
          stableKey: teacher.id,
          fullName: teacher.fullName,
          normalizedName,
          designation: teacher.designation,
          departmentId: department.id,
          departmentKey: department.id,
          searchText,
          profileUrl: teacher.profileUrl,
          sourceUrl: teacher.sourceUrl,
          lastVerifiedAt: new Date(`${teacher.lastVerifiedAt}T00:00:00.000Z`),
          active: teacher.active,
        })
        .onConflictDoUpdate({
          target: [
            teachers.releaseId,
            teachers.normalizedName,
            teachers.departmentKey,
          ],
          set: {
            fullName: teacher.fullName,
            designation: teacher.designation,
            searchText,
            profileUrl: teacher.profileUrl,
            sourceUrl: teacher.sourceUrl,
            lastVerifiedAt: new Date(`${teacher.lastVerifiedAt}T00:00:00.000Z`),
            active: teacher.active,
            updatedAt: new Date(),
          },
        })
        .returning({ id: teachers.id });
      if (!saved) throw new Error(`Could not seed ${teacher.fullName}`);
      await tx
        .delete(teacherAliases)
        .where(eq(teacherAliases.teacherId, saved.id));
      if (teacher.aliases.length) {
        await tx.insert(teacherAliases).values(
          teacher.aliases.map((alias) => ({
            teacherId: saved.id,
            alias,
            normalizedAlias: normalizeSearch(alias),
          })),
        );
      }
      datasetItems.push({
        id: saved.id,
        fullName: teacher.fullName,
        designation: teacher.designation,
        department: {
          id: department.id,
          name: department.name,
          shortName: department.shortName,
          slug: department.slug,
          faculty: department.faculty,
        },
        ...(teacher.profileUrl ? { profileUrl: teacher.profileUrl } : {}),
        sourceUrl: teacher.sourceUrl,
        lastVerifiedAt: teacher.lastVerifiedAt,
      });
    }

    const curriculumDepartment = departmentByReference.get('ipe');
    if (!curriculumDepartment) {
      throw new Error('IPE department is required for the course directory');
    }
    const courseDatasetItems = [];
    for (const course of data.courseDirectory.courses) {
      const normalizedCode = normalizeSearch(course.code).replaceAll(' ', '');
      const stableKey = `ipe-${normalizedCode}`;
      const values = {
        releaseId: BASELINE_RELEASE_ID,
        stableKey,
        code: course.code,
        normalizedCode,
        title: course.title,
        departmentKey: curriculumDepartment.id,
        searchText: buildSearchText([
          course.code,
          course.title,
          curriculumDepartment.name,
          curriculumDepartment.shortName,
          `year ${course.year}`,
          course.semester,
          course.type,
        ]),
        active: true,
      };
      await tx
        .insert(courses)
        .values(values)
        .onConflictDoUpdate({
          target: [courses.releaseId, courses.stableKey],
          set: {
            code: values.code,
            normalizedCode: values.normalizedCode,
            title: values.title,
            departmentKey: values.departmentKey,
            searchText: values.searchText,
            active: values.active,
            updatedAt: new Date(),
          },
        });
      courseDatasetItems.push({
        stableKey,
        code: course.code,
        normalizedCode,
        title: course.title,
        departmentKey: curriculumDepartment.id,
        departmentName: curriculumDepartment.name,
        year: course.year,
        semester: course.semester,
        type: course.type,
        credit: course.credit,
        active: true,
      });
    }

    const checksum = await checksumRecords(
      datasetItems.sort((a, b) => a.fullName.localeCompare(b.fullName)),
    );
    await tx
      .insert(datasetVersions)
      .values({
        datasetName: 'teachers',
        version: '2026-08-11',
        checksum,
        recordCount: datasetItems.length,
        publishedAt: new Date('2026-08-11T00:00:00.000Z'),
      })
      .onConflictDoUpdate({
        target: [datasetVersions.datasetName, datasetVersions.version],
        set: { checksum, recordCount: datasetItems.length },
      });
    await tx.insert(auditLogs).values({
      action: 'seed',
      entityType: 'teacher_dataset',
      entityId: '2026-08-11',
      summary: `Seeded ${datasetItems.length} verified teacher records`,
    });

    const courseChecksum = await checksumRecords(
      courseDatasetItems.sort((left, right) =>
        left.stableKey.localeCompare(right.stableKey),
      ),
    );
    await tx
      .insert(datasetVersions)
      .values({
        datasetName: 'ipe-courses',
        version: data.courseDirectory.meta.generated,
        checksum: courseChecksum,
        recordCount: courseDatasetItems.length,
        publishedAt: new Date(
          `${data.courseDirectory.meta.generated}T00:00:00.000Z`,
        ),
      })
      .onConflictDoUpdate({
        target: [datasetVersions.datasetName, datasetVersions.version],
        set: {
          checksum: courseChecksum,
          recordCount: courseDatasetItems.length,
        },
      });
    await tx.insert(auditLogs).values({
      action: 'seed',
      entityType: 'course_dataset',
      entityId: data.courseDirectory.meta.generated,
      summary: `Seeded ${courseDatasetItems.length} IPE curriculum courses`,
    });
  });
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Database seed complete',
      teachers: data.teachers.length,
      courses: data.courseDirectory.courses.length,
    }),
  );
} finally {
  await client.end();
}
