import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const BASELINE_RELEASE_ID = '00000000-0000-4000-8000-000000000001';

export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role')
      .$type<'owner' | 'editor' | 'viewer'>()
      .notNull()
      .default('editor'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('admin_users_email_uidx').on(table.email),
    index('admin_users_active_idx').on(table.active),
  ],
);

export const datasetReleases = pgTable(
  'dataset_releases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    version: text('version').notNull(),
    status: text('status')
      .$type<'draft' | 'published' | 'retired'>()
      .notNull()
      .default('draft'),
    notes: text('notes').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    uniqueIndex('dataset_releases_version_uidx').on(table.version),
    index('dataset_releases_status_created_idx').on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const departments = pgTable(
  'departments',
  {
    id: text('id').primaryKey(),
    releaseId: uuid('release_id')
      .notNull()
      .default(BASELINE_RELEASE_ID)
      .references(() => datasetReleases.id, { onDelete: 'restrict' }),
    stableKey: text('stable_key').notNull(),
    name: text('name').notNull(),
    fullName: text('full_name').notNull(),
    shortName: text('short_name').notNull(),
    slug: text('slug').notNull(),
    faculty: text('faculty'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('departments_release_stable_uidx').on(
      table.releaseId,
      table.stableKey,
    ),
    uniqueIndex('departments_release_slug_uidx').on(
      table.releaseId,
      table.slug,
    ),
    uniqueIndex('departments_release_short_name_uidx').on(
      table.releaseId,
      table.shortName,
    ),
    index('departments_active_idx').on(table.active),
    index('departments_stable_key_idx').on(table.stableKey),
  ],
);

export const teachers = pgTable(
  'teachers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id')
      .notNull()
      .default(BASELINE_RELEASE_ID)
      .references(() => datasetReleases.id, { onDelete: 'restrict' }),
    stableKey: text('stable_key').notNull(),
    fullName: text('full_name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    designation: text('designation').notNull(),
    departmentId: text('department_id')
      .notNull()
      .references(() => departments.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    departmentKey: text('department_key').notNull(),
    searchText: text('search_text').notNull(),
    profileUrl: text('profile_url'),
    sourceUrl: text('source_url'),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('teachers_release_stable_uidx').on(
      table.releaseId,
      table.stableKey,
    ),
    uniqueIndex('teachers_release_name_department_uidx').on(
      table.releaseId,
      table.normalizedName,
      table.departmentKey,
    ),
    index('teachers_department_idx').on(table.departmentId),
    index('teachers_active_idx').on(table.active),
    index('teachers_normalized_name_idx').on(table.normalizedName),
    index('teachers_release_active_idx').on(table.releaseId, table.active),
    index('teachers_stable_key_idx').on(table.stableKey),
  ],
);

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => datasetReleases.id, { onDelete: 'restrict' }),
    stableKey: text('stable_key').notNull(),
    code: text('code').notNull(),
    normalizedCode: text('normalized_code').notNull(),
    title: text('title').notNull(),
    departmentKey: text('department_key').notNull(),
    searchText: text('search_text').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('courses_release_stable_uidx').on(
      table.releaseId,
      table.stableKey,
    ),
    uniqueIndex('courses_release_code_uidx').on(
      table.releaseId,
      table.normalizedCode,
    ),
    index('courses_release_active_idx').on(table.releaseId, table.active),
  ],
);

export const courseTeachers = pgTable(
  'course_teachers',
  {
    releaseId: uuid('release_id')
      .notNull()
      .references(() => datasetReleases.id, { onDelete: 'restrict' }),
    courseKey: text('course_key').notNull(),
    teacherKey: text('teacher_key').notNull(),
    priority: integer('priority').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.releaseId, table.courseKey, table.teacherKey],
    }),
    index('course_teachers_course_priority_idx').on(
      table.releaseId,
      table.courseKey,
      table.priority,
    ),
  ],
);

export const coverTemplates = pgTable(
  'cover_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => datasetReleases.id, { onDelete: 'restrict' }),
    stableKey: text('stable_key').notNull(),
    departmentKey: text('department_key').notNull(),
    coverType: text('cover_type')
      .$type<'Lab Report' | 'Assignment' | 'Report' | 'Thesis'>()
      .notNull(),
    name: text('name').notNull(),
    templateVersion: text('template_version').notNull(),
    status: text('status')
      .$type<'draft' | 'published' | 'retired'>()
      .notNull()
      .default('draft'),
    configuration: jsonb('configuration')
      .$type<Record<string, unknown>>()
      .notNull(),
    effectiveDate: date('effective_date'),
    releaseNotes: text('release_notes').notNull().default(''),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('cover_templates_release_stable_uidx').on(
      table.releaseId,
      table.stableKey,
    ),
    uniqueIndex('cover_templates_release_version_uidx').on(
      table.releaseId,
      table.departmentKey,
      table.coverType,
      table.templateVersion,
    ),
    index('cover_templates_lookup_idx').on(
      table.releaseId,
      table.departmentKey,
      table.coverType,
      table.active,
    ),
  ],
);

export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    csrfHash: text('csrf_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('admin_sessions_token_hash_uidx').on(table.tokenHash),
    index('admin_sessions_user_active_idx').on(
      table.adminUserId,
      table.expiresAt,
    ),
  ],
);

export const teacherAliases = pgTable(
  'teacher_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    normalizedAlias: text('normalized_alias').notNull(),
  },
  (table) => [
    uniqueIndex('teacher_aliases_teacher_alias_uidx').on(
      table.teacherId,
      table.normalizedAlias,
    ),
    index('teacher_aliases_normalized_idx').on(table.normalizedAlias),
  ],
);

export const datasetVersions = pgTable(
  'dataset_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    datasetName: text('dataset_name').notNull(),
    version: text('version').notNull(),
    checksum: text('checksum').notNull(),
    recordCount: integer('record_count').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('dataset_versions_name_version_uidx').on(
      table.datasetName,
      table.version,
    ),
    index('dataset_versions_published_idx').on(
      table.datasetName,
      table.publishedAt,
    ),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    summary: text('summary').notNull(),
    adminUserId: uuid('admin_user_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    entityKey: text('entity_key'),
    releaseId: uuid('release_id').references(() => datasetReleases.id, {
      onDelete: 'set null',
    }),
    beforeSummary: jsonb('before_summary').$type<Record<string, unknown>>(),
    afterSummary: jsonb('after_summary').$type<Record<string, unknown>>(),
    requestId: text('request_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('audit_logs_created_idx').on(table.createdAt),
    index('audit_logs_release_created_idx').on(
      table.releaseId,
      table.createdAt,
    ),
    index('audit_logs_admin_created_idx').on(
      table.adminUserId,
      table.createdAt,
    ),
  ],
);
