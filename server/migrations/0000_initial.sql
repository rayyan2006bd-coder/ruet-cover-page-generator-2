-- Forward-only initial schema migration. In production, rollback by adding a new
-- corrective migration; never edit this file after it has been applied.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS departments (
  id text PRIMARY KEY,
  name text NOT NULL,
  short_name text NOT NULL,
  slug text NOT NULL,
  faculty text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS departments_slug_uidx ON departments (slug);
CREATE UNIQUE INDEX IF NOT EXISTS departments_short_name_uidx ON departments (short_name);
CREATE INDEX IF NOT EXISTS departments_active_idx ON departments (active);

CREATE TABLE IF NOT EXISTS teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  normalized_name text NOT NULL,
  designation text NOT NULL,
  department_id text NOT NULL REFERENCES departments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  search_text text NOT NULL,
  profile_url text,
  source_url text,
  last_verified_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS teachers_name_department_uidx ON teachers (normalized_name, department_id);
CREATE INDEX IF NOT EXISTS teachers_department_idx ON teachers (department_id);
CREATE INDEX IF NOT EXISTS teachers_active_idx ON teachers (active);
CREATE INDEX IF NOT EXISTS teachers_normalized_name_idx ON teachers (normalized_name);
CREATE INDEX IF NOT EXISTS teachers_search_text_trgm_idx ON teachers USING gin (search_text gin_trgm_ops);

CREATE TABLE IF NOT EXISTS teacher_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  alias text NOT NULL,
  normalized_alias text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS teacher_aliases_teacher_alias_uidx ON teacher_aliases (teacher_id, normalized_alias);
CREATE INDEX IF NOT EXISTS teacher_aliases_normalized_idx ON teacher_aliases (normalized_alias);

CREATE TABLE IF NOT EXISTS dataset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_name text NOT NULL,
  version text NOT NULL,
  checksum text NOT NULL,
  record_count integer NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS dataset_versions_name_version_uidx ON dataset_versions (dataset_name, version);
CREATE INDEX IF NOT EXISTS dataset_versions_published_idx ON dataset_versions (dataset_name, published_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at);
