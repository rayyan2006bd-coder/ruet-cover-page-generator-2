import { z } from 'zod';
import { departmentSchema, teacherSchema } from './api-contracts';

export const LOCAL_SCHEMA_VERSION = 1 as const;
export const EMBEDDED_COVER_SCHEMA_VERSION = 1 as const;

export const stableKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i);

export const coverTypeSchema = z.enum([
  'Lab Report',
  'Assignment',
  'Report',
  'Thesis',
]);

export const directoryDepartmentSchema = departmentSchema.extend({
  stableKey: stableKeySchema,
  releaseVersion: z.string().min(1),
});

export const directoryTeacherSchema = teacherSchema.extend({
  stableKey: stableKeySchema,
  releaseVersion: z.string().min(1),
});

export const courseSchema = z.object({
  stableKey: stableKeySchema,
  code: z.string().trim().min(2).max(40),
  normalizedCode: z.string().trim().min(1).max(40),
  title: z.string().trim().min(2).max(240),
  departmentKey: stableKeySchema,
  departmentName: z.string().trim().min(1).max(200),
  active: z.boolean().default(true),
  releaseVersion: z.string().min(1),
});

export const curriculumCourseSchema = z.object({
  code: z.string().trim().min(2).max(40),
  title: z.string().trim().min(2).max(240),
  year: z.number().int().min(1).max(4),
  semester: z.enum(['Odd', 'Even']),
  type: z.enum(['Theory', 'Sessional', 'Project']),
  credit: z.number().positive().max(10),
});

export const curriculumDirectorySchema = z.object({
  meta: z.object({
    source: z.string().trim().min(1).max(500),
    note: z.string().trim().min(1).max(1_000),
    generated: z.string().date(),
  }),
  courses: z.array(curriculumCourseSchema).min(1).max(500),
  electives: z.record(
    z.string().min(1).max(160),
    z.array(z.string().trim().min(1).max(240)).min(1),
  ),
});

export const courseTeacherSchema = z.object({
  courseKey: stableKeySchema,
  teacherKey: stableKeySchema,
  priority: z.number().int().nonnegative().default(0),
  active: z.boolean().default(true),
  releaseVersion: z.string().min(1),
});

export const coverSettingsSchema = z.object({
  formToBorder: z.boolean().default(false),
  watermark: z.boolean().default(false),
  courseCode: z.boolean().default(false),
  studentSeries: z.boolean().default(false),
  studentSession: z.boolean().default(false),
  courseInfoBellowTitle: z.boolean().default(false),
  datesBellowTitle: z.boolean().default(false),
  assessmentTable: z.boolean().default(false),
  assessmentCO: z.string().max(40).default(''),
  assessmentPO: z.string().max(40).default(''),
  manualSubmittedBy: z.boolean().default(false),
  manualSubmittedByText: z.string().max(2_000).default(''),
});

export const templateConfigurationSchema = z.object({
  layoutVariant: z.string().trim().min(1).max(80).default('general'),
  requiredFields: z.array(z.string().min(1).max(100)).default([]),
  lockedElements: z.array(z.string().min(1).max(100)).default([]),
  defaultSettings: coverSettingsSchema.partial().default({}),
  allowedSettings: z
    .array(
      z.enum([
        'formToBorder',
        'watermark',
        'courseCode',
        'studentSeries',
        'studentSession',
        'courseInfoBellowTitle',
        'datesBellowTitle',
        'assessmentTable',
      ]),
    )
    .default([]),
  logo: z.object({
    mode: z.enum(['ruet', 'custom', 'hidden']).default('ruet'),
  }),
  watermark: z.object({ enabled: z.boolean().default(false) }),
  assessmentTable: z.object({ enabled: z.boolean().default(false) }),
  printMarginsMm: z.object({
    top: z.number().min(5).max(50).default(25.4),
    right: z.number().min(5).max(50).default(25.4),
    bottom: z.number().min(5).max(50).default(25.4),
    left: z.number().min(5).max(50).default(30),
  }),
  headerRule: z.string().max(500).default(''),
  footerRule: z.string().max(500).default(''),
});

export const coverTemplateSchema = z.object({
  stableKey: stableKeySchema,
  departmentKey: stableKeySchema,
  coverType: coverTypeSchema,
  name: z.string().trim().min(2).max(160),
  templateVersion: z.string().trim().min(1).max(80),
  status: z.enum(['draft', 'published', 'retired']),
  configuration: templateConfigurationSchema,
  effectiveDate: z.string().date().nullable().default(null),
  releaseNotes: z.string().max(4_000).default(''),
  releaseVersion: z.string().min(1),
  active: z.boolean().default(true),
});

export const studentIdentitySchema = z.object({
  name: z.string().max(240).default(''),
  roll: z.string().max(40).default(''),
  session: z.string().max(40).default(''),
  series: z.string().max(40).default(''),
  section: z.string().max(40).default(''),
  group: z.string().max(80).default(''),
  department: z.string().max(240).default(''),
});

export const teacherSelectionSchema = z.object({
  stableKey: stableKeySchema.nullable().default(null),
  name: z.string().max(240).default(''),
  designation: z.string().max(160).default(''),
  department: z.string().max(240).default(''),
  source: z.enum(['directory', 'manual']).default('manual'),
});

export const courseSelectionSchema = z.object({
  stableKey: stableKeySchema.nullable().default(null),
  code: z.string().max(40).default(''),
  title: z.string().max(240).default(''),
  departmentKey: stableKeySchema.nullable().default(null),
  department: z.string().max(240).default(''),
  source: z.enum(['directory', 'manual']).default('manual'),
});

export const templateSelectionSchema = z.object({
  stableKey: stableKeySchema.nullable().default(null),
  version: z.string().max(80).nullable().default(null),
  name: z.string().max(160).default('General RUET cover'),
  approved: z.boolean().default(false),
});

export const filenameConfigurationSchema = z.object({
  pattern: z
    .string()
    .min(1)
    .max(240)
    .default('{department}-{courseCode}_{roll}_{type}-{itemNumber}.pdf'),
});

export const coverFormDataSchema = z.object({
  schemaVersion: z.literal(LOCAL_SCHEMA_VERSION),
  student: studentIdentitySchema,
  course: courseSelectionSchema,
  teachers: z.array(teacherSelectionSchema).max(2).default([]),
  coverType: coverTypeSchema.default('Lab Report'),
  itemNumber: z.string().max(40).default('1'),
  title: z.string().max(1_000).default(''),
  experimentDate: z.string().datetime().nullable().default(null),
  submissionDate: z.string().datetime().nullable().default(null),
  template: templateSelectionSchema.default({
    stableKey: null,
    version: null,
    name: 'General RUET cover',
    approved: false,
  }),
  settings: coverSettingsSchema.default({
    formToBorder: false,
    watermark: false,
    courseCode: false,
    studentSeries: false,
    studentSession: false,
    courseInfoBellowTitle: false,
    datesBellowTitle: false,
    assessmentTable: false,
    assessmentCO: '',
    assessmentPO: '',
    manualSubmittedBy: false,
    manualSubmittedByText: '',
  }),
  filename: filenameConfigurationSchema.default({
    pattern: '{department}-{courseCode}_{roll}_{type}-{itemNumber}.pdf',
  }),
});

export const profileLockedFieldSchema = z.enum([
  'name',
  'roll',
  'session',
  'series',
  'department',
]);

export const studentProfileSchema = z.object({
  schemaVersion: z.literal(LOCAL_SCHEMA_VERSION),
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(100),
  identity: studentIdentitySchema,
  lockedFields: z.array(profileLockedFieldSchema).default([]),
  isDefault: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const coursePresetSchema = z.object({
  schemaVersion: z.literal(LOCAL_SCHEMA_VERSION),
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  course: courseSelectionSchema,
  teachers: z.array(teacherSelectionSchema).max(2).default([]),
  coverType: coverTypeSchema,
  template: templateSelectionSchema,
  settings: coverSettingsSchema,
  filename: filenameConfigurationSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const coverSnapshotSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  cover: coverFormDataSchema,
});

export const draftSchema = z.object({
  schemaVersion: z.literal(LOCAL_SCHEMA_VERSION),
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  cover: coverFormDataSchema,
  snapshots: z.array(coverSnapshotSchema).max(50).default([]),
  snapshotIndex: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const coverHistoryRecordSchema = z.object({
  schemaVersion: z.literal(LOCAL_SCHEMA_VERSION),
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  cover: coverFormDataSchema,
  profileId: z.string().uuid().nullable().default(null),
  generatedAt: z.string().datetime(),
});

export const batchCoverRowSchema = z.object({
  id: z.string().uuid(),
  itemNumber: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(1_000),
  experimentDate: z.string().datetime().nullable().default(null),
  submissionDate: z.string().datetime().nullable().default(null),
});

export const extractionSourceSchema = z.enum([
  'embedded-data',
  'pdf-text',
  'ocr',
]);

export const extractedFieldSchema = z.object({
  field: z.string().min(1).max(100),
  value: z.string().max(2_000),
  confidence: z.number().min(0).max(1),
  source: extractionSourceSchema,
  warnings: z.array(z.string().max(500)).default([]),
});

export const smartImportResultSchema = z.object({
  schemaVersion: z.literal(LOCAL_SCHEMA_VERSION),
  source: extractionSourceSchema,
  pageCount: z.number().int().positive(),
  fields: z.array(extractedFieldSchema),
  cover: coverFormDataSchema.partial(),
  warnings: z.array(z.string().max(500)).default([]),
});

export const embeddedPdfCoverDataSchema = z.object({
  schemaVersion: z.literal(EMBEDDED_COVER_SCHEMA_VERSION),
  sourceApplication: z.literal('RUET Cover Page Generator'),
  sourceApplicationVersion: z.string().min(1).max(40),
  generatedAt: z.string().datetime(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  cover: coverFormDataSchema,
});

export const datasetManifestSchema = z.object({
  apiVersion: z.string().min(1),
  releaseVersion: z.string().min(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  publishedAt: z.string().datetime(),
  counts: z.object({
    departments: z.number().int().nonnegative(),
    teachers: z.number().int().nonnegative(),
    courses: z.number().int().nonnegative(),
    relationships: z.number().int().nonnegative(),
    templates: z.number().int().nonnegative(),
  }),
});

export const datasetExportSchema = z.object({
  manifest: datasetManifestSchema,
  departments: z.array(directoryDepartmentSchema),
  teachers: z.array(directoryTeacherSchema),
  courses: z.array(courseSchema),
  courseTeachers: z.array(courseTeacherSchema),
  templates: z.array(coverTemplateSchema),
});

export const localBackupSchema = z.object({
  schemaVersion: z.literal(LOCAL_SCHEMA_VERSION),
  exportedAt: z.string().datetime(),
  profiles: z.array(studentProfileSchema).default([]),
  presets: z.array(coursePresetSchema).default([]),
  drafts: z.array(draftSchema).default([]),
  history: z.array(coverHistoryRecordSchema).default([]),
  filename: filenameConfigurationSchema.default({
    pattern: '{department}-{courseCode}_{roll}_{type}-{itemNumber}.pdf',
  }),
});

export const releaseValidationIssueSchema = z.object({
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(500),
  entityType: z
    .enum([
      'release',
      'department',
      'teacher',
      'course',
      'relationship',
      'template',
    ])
    .default('release'),
  entityKey: z.string().max(160).nullable().default(null),
});

export const adminReleaseValidationSchema = z.object({
  valid: z.boolean(),
  releaseVersion: z.string().min(1),
  issues: z.array(releaseValidationIssueSchema),
});

export const adminDepartmentMutationSchema = z.object({
  stableKey: stableKeySchema,
  shortName: z.string().trim().min(1).max(40),
  fullName: z.string().trim().min(2).max(240),
  slug: stableKeySchema,
  faculty: z.string().trim().max(240).nullable().default(null),
  active: z.boolean().default(true),
});

export const adminTeacherMutationSchema = z.object({
  stableKey: stableKeySchema,
  name: z.string().trim().min(2).max(240),
  designation: z.string().trim().min(2).max(160),
  departmentKey: stableKeySchema,
  profileUrl: z.string().url().nullable().default(null),
  sourceUrl: z.string().url().nullable().default(null),
  lastVerifiedAt: z.string().date().nullable().default(null),
  active: z.boolean().default(true),
});

export const adminCourseMutationSchema = courseSchema.omit({
  departmentName: true,
  normalizedCode: true,
  releaseVersion: true,
});

export const adminCourseTeacherMutationSchema = courseTeacherSchema.omit({
  releaseVersion: true,
});

export const adminTemplateMutationSchema = coverTemplateSchema.omit({
  releaseVersion: true,
});

export type CoverFormData = z.infer<typeof coverFormDataSchema>;
export type CoverSettings = z.infer<typeof coverSettingsSchema>;
export type StudentProfile = z.infer<typeof studentProfileSchema>;
export type CoursePreset = z.infer<typeof coursePresetSchema>;
export type CoverSnapshot = z.infer<typeof coverSnapshotSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type CoverHistoryRecord = z.infer<typeof coverHistoryRecordSchema>;
export type BatchCoverRow = z.infer<typeof batchCoverRowSchema>;
export type SmartImportResult = z.infer<typeof smartImportResultSchema>;
export type EmbeddedPdfCoverData = z.infer<typeof embeddedPdfCoverDataSchema>;
export type DatasetManifest = z.infer<typeof datasetManifestSchema>;
export type DatasetExport = z.infer<typeof datasetExportSchema>;
export type DirectoryCourse = z.infer<typeof courseSchema>;
export type CurriculumCourse = z.infer<typeof curriculumCourseSchema>;
export type CurriculumDirectory = z.infer<typeof curriculumDirectorySchema>;
export type DirectoryTeacher = z.infer<typeof directoryTeacherSchema>;
export type CoverTemplateDto = z.infer<typeof coverTemplateSchema>;
export type LocalBackup = z.infer<typeof localBackupSchema>;
export type AdminDepartmentMutation = z.infer<
  typeof adminDepartmentMutationSchema
>;
export type AdminTeacherMutation = z.infer<typeof adminTeacherMutationSchema>;
export type AdminCourseMutation = z.infer<typeof adminCourseMutationSchema>;
export type AdminCourseTeacherMutation = z.infer<
  typeof adminCourseTeacherMutationSchema
>;
export type AdminTemplateMutation = z.infer<typeof adminTemplateMutationSchema>;
