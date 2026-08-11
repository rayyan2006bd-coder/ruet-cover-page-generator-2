import { z } from 'zod';
import { teacherImportItemSchema } from '../../../shared/api-contracts';
import { curriculumDirectorySchema } from '../../../shared/domain-contracts';

export const departmentSeedSchema = z.array(
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    shortName: z.string().min(1),
    slug: z.string().min(1),
    faculty: z.string().min(1),
    active: z.boolean(),
  }),
);

export const teacherSeedSchema = z.array(
  teacherImportItemSchema.extend({
    id: z.string().uuid(),
    sourceUrl: z.string().url(),
    lastVerifiedAt: z.string().date(),
  }),
);

export async function readSeedData() {
  const departments = departmentSeedSchema.parse(
    await Bun.file(
      new URL('../../seeds/departments.json', import.meta.url),
    ).json(),
  );
  const teachers = teacherSeedSchema.parse(
    await Bun.file(
      new URL('../../seeds/teachers.json', import.meta.url),
    ).json(),
  );
  const courseDirectory = curriculumDirectorySchema.parse(
    await Bun.file(
      new URL(
        '../../../shared/data/ipe-course-directory.json',
        import.meta.url,
      ),
    ).json(),
  );
  return { departments, teachers, courseDirectory };
}
