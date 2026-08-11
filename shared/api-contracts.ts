import { z } from 'zod';

export const departmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  slug: z.string().min(1),
  faculty: z.string().nullable().optional(),
});

export const teacherSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().min(1),
  designation: z.string().min(1),
  department: departmentSchema,
  profileUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
  lastVerifiedAt: z.string().optional(),
});

export const paginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export const teacherListResponseSchema = z.object({
  items: z.array(teacherSchema),
  pagination: paginationSchema,
  dataVersion: z.string(),
});

export const teacherDatasetSchema = z.object({
  version: z.string().min(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  updatedAt: z.string().datetime(),
  items: z.array(teacherSchema),
});

export const metaResponseSchema = z.object({
  apiVersion: z.string(),
  teacherDataVersion: z.string(),
  teacherDataChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  teacherCount: z.number().int().nonnegative(),
  departmentCount: z.number().int().nonnegative(),
  lastUpdatedAt: z.string().datetime(),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export const legacyTeacherSchema = z.object({
  name: z.string().min(1),
  post: z.string().min(1),
  dept: z.string().min(1),
});

export const legacyTeacherListSchema = z.object({
  list: z.array(legacyTeacherSchema),
});

export const teacherQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  query: z.string().trim().max(200).optional(),
  department: z.string().trim().max(100).optional(),
  designation: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  sort: z.enum(['name', '-name', 'designation', '-updated']).default('name'),
});

export const courseQuerySchema = z.object({
  query: z.string().trim().max(200).optional(),
  department: z.string().trim().max(100).optional(),
  cursor: z.string().trim().max(160).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const templateQuerySchema = z.object({
  department: z.string().trim().max(100).optional(),
  coverType: z
    .enum(['Lab Report', 'Assignment', 'Report', 'Thesis'])
    .optional(),
});

export const teacherImportItemSchema = z.object({
  id: z.string().uuid().optional(),
  fullName: z.string().trim().min(2).max(200),
  designation: z.string().trim().min(2).max(100),
  department: z.string().trim().min(1).max(100),
  aliases: z.array(z.string().trim().min(1).max(200)).default([]),
  profileUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
  lastVerifiedAt: z.string().date().optional(),
  active: z.boolean().default(true),
});

export const teacherImportSchema = z.object({
  dryRun: z.boolean().default(true),
  items: z.array(teacherImportItemSchema).min(1).max(1000),
});

export type DepartmentDto = z.infer<typeof departmentSchema>;
export type TeacherDto = z.infer<typeof teacherSchema>;
export type TeacherDataset = z.infer<typeof teacherDatasetSchema>;
export type MetaResponse = z.infer<typeof metaResponseSchema>;
export type TeacherQuery = z.infer<typeof teacherQuerySchema>;
export type CourseQuery = z.infer<typeof courseQuerySchema>;
export type TemplateQuery = z.infer<typeof templateQuerySchema>;
export type TeacherImportItem = z.infer<typeof teacherImportItemSchema>;
