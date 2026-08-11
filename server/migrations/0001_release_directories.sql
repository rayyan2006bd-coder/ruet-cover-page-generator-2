-- Forward-only release-directory migration. The fixed baseline release wraps
-- records created by 0000 so existing installations are upgraded in place.
BEGIN;

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_uidx ON admin_users (lower(email));
CREATE INDEX IF NOT EXISTS admin_users_active_idx ON admin_users (active);

CREATE TABLE IF NOT EXISTS dataset_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  published_at timestamptz,
  published_by uuid REFERENCES admin_users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS dataset_releases_version_uidx ON dataset_releases (version);
CREATE UNIQUE INDEX IF NOT EXISTS dataset_releases_one_published_uidx
  ON dataset_releases (status) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS dataset_releases_status_created_idx ON dataset_releases (status, created_at DESC);

INSERT INTO dataset_releases (
  id, version, status, notes, created_at, published_at
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  'legacy-baseline',
  'published',
  'Compatibility release created while upgrading the original directory schema',
  '2026-08-11T00:00:00.000Z',
  '2026-08-11T00:00:00.000Z'
) ON CONFLICT (id) DO NOTHING;

ALTER TABLE departments ADD COLUMN IF NOT EXISTS release_id uuid;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS stable_key text;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS full_name text;
UPDATE departments
SET release_id = COALESCE(release_id, '00000000-0000-4000-8000-000000000001'),
    stable_key = COALESCE(stable_key, id),
    full_name = COALESCE(full_name, name);
ALTER TABLE departments ALTER COLUMN release_id SET NOT NULL;
ALTER TABLE departments ALTER COLUMN stable_key SET NOT NULL;
ALTER TABLE departments ALTER COLUMN full_name SET NOT NULL;
ALTER TABLE departments
  ADD CONSTRAINT departments_release_fk FOREIGN KEY (release_id)
  REFERENCES dataset_releases(id) ON DELETE RESTRICT;
DROP INDEX IF EXISTS departments_slug_uidx;
DROP INDEX IF EXISTS departments_short_name_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS departments_release_stable_uidx ON departments (release_id, stable_key);
CREATE UNIQUE INDEX IF NOT EXISTS departments_release_slug_uidx ON departments (release_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS departments_release_short_name_uidx ON departments (release_id, short_name);
CREATE INDEX IF NOT EXISTS departments_stable_key_idx ON departments (stable_key);

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS release_id uuid;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS stable_key text;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS department_key text;
UPDATE teachers AS teacher
SET release_id = COALESCE(teacher.release_id, department.release_id),
    stable_key = COALESCE(teacher.stable_key, teacher.id::text),
    department_key = COALESCE(teacher.department_key, department.stable_key)
FROM departments AS department
WHERE department.id = teacher.department_id;
ALTER TABLE teachers ALTER COLUMN release_id SET NOT NULL;
ALTER TABLE teachers ALTER COLUMN stable_key SET NOT NULL;
ALTER TABLE teachers ALTER COLUMN department_key SET NOT NULL;
ALTER TABLE teachers
  ADD CONSTRAINT teachers_release_fk FOREIGN KEY (release_id)
  REFERENCES dataset_releases(id) ON DELETE RESTRICT;
ALTER TABLE teachers
  ADD CONSTRAINT teachers_release_department_fk FOREIGN KEY (release_id, department_key)
  REFERENCES departments(release_id, stable_key) ON DELETE RESTRICT;
DROP INDEX IF EXISTS teachers_name_department_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS teachers_release_stable_uidx ON teachers (release_id, stable_key);
CREATE UNIQUE INDEX IF NOT EXISTS teachers_release_name_department_uidx
  ON teachers (release_id, normalized_name, department_key);
CREATE INDEX IF NOT EXISTS teachers_release_active_idx ON teachers (release_id, active);
CREATE INDEX IF NOT EXISTS teachers_stable_key_idx ON teachers (stable_key);

CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES dataset_releases(id) ON DELETE RESTRICT,
  stable_key text NOT NULL,
  code text NOT NULL,
  normalized_code text NOT NULL,
  title text NOT NULL,
  department_key text NOT NULL,
  search_text text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT courses_release_department_fk FOREIGN KEY (release_id, department_key)
    REFERENCES departments(release_id, stable_key) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS courses_release_stable_uidx ON courses (release_id, stable_key);
CREATE UNIQUE INDEX IF NOT EXISTS courses_release_code_uidx ON courses (release_id, normalized_code);
CREATE INDEX IF NOT EXISTS courses_release_active_idx ON courses (release_id, active);
CREATE INDEX IF NOT EXISTS courses_search_text_trgm_idx ON courses USING gin (search_text gin_trgm_ops);

CREATE TABLE IF NOT EXISTS course_teachers (
  release_id uuid NOT NULL REFERENCES dataset_releases(id) ON DELETE RESTRICT,
  course_key text NOT NULL,
  teacher_key text NOT NULL,
  priority integer NOT NULL DEFAULT 0 CHECK (priority >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (release_id, course_key, teacher_key),
  CONSTRAINT course_teachers_course_fk FOREIGN KEY (release_id, course_key)
    REFERENCES courses(release_id, stable_key) ON DELETE CASCADE,
  CONSTRAINT course_teachers_teacher_fk FOREIGN KEY (release_id, teacher_key)
    REFERENCES teachers(release_id, stable_key) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS course_teachers_course_priority_idx
  ON course_teachers (release_id, course_key, priority);

CREATE TABLE IF NOT EXISTS cover_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES dataset_releases(id) ON DELETE RESTRICT,
  stable_key text NOT NULL,
  department_key text NOT NULL,
  cover_type text NOT NULL CHECK (cover_type IN ('Lab Report', 'Assignment', 'Report', 'Thesis')),
  name text NOT NULL,
  template_version text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  configuration jsonb NOT NULL,
  effective_date date,
  release_notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cover_templates_release_department_fk FOREIGN KEY (release_id, department_key)
    REFERENCES departments(release_id, stable_key) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS cover_templates_release_stable_uidx
  ON cover_templates (release_id, stable_key);
CREATE UNIQUE INDEX IF NOT EXISTS cover_templates_release_version_uidx
  ON cover_templates (release_id, department_key, cover_type, template_version);
CREATE INDEX IF NOT EXISTS cover_templates_lookup_idx
  ON cover_templates (release_id, department_key, cover_type, active);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  csrf_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_sessions_token_hash_uidx ON admin_sessions (token_hash);
CREATE INDEX IF NOT EXISTS admin_sessions_user_active_idx
  ON admin_sessions (admin_user_id, expires_at) WHERE revoked_at IS NULL;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS admin_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_key text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS release_id uuid REFERENCES dataset_releases(id) ON DELETE SET NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS before_summary jsonb;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS after_summary jsonb;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS request_id text;
CREATE INDEX IF NOT EXISTS audit_logs_release_created_idx ON audit_logs (release_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_admin_created_idx ON audit_logs (admin_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_published_release_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE release_status text;
BEGIN
  -- The compatibility release remains editable only for the deprecated v1
  -- teacher maintenance endpoints. All real published releases are immutable.
  IF OLD.release_id = '00000000-0000-4000-8000-000000000001' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  SELECT status INTO release_status FROM dataset_releases WHERE id = OLD.release_id;
  IF release_status IN ('published', 'retired') THEN
    RAISE EXCEPTION 'Published and retired dataset releases are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS departments_published_immutable ON departments;
CREATE TRIGGER departments_published_immutable BEFORE UPDATE OR DELETE ON departments
FOR EACH ROW EXECUTE FUNCTION prevent_published_release_mutation();
DROP TRIGGER IF EXISTS teachers_published_immutable ON teachers;
CREATE TRIGGER teachers_published_immutable BEFORE UPDATE OR DELETE ON teachers
FOR EACH ROW EXECUTE FUNCTION prevent_published_release_mutation();
DROP TRIGGER IF EXISTS courses_published_immutable ON courses;
CREATE TRIGGER courses_published_immutable BEFORE UPDATE OR DELETE ON courses
FOR EACH ROW EXECUTE FUNCTION prevent_published_release_mutation();
DROP TRIGGER IF EXISTS course_teachers_published_immutable ON course_teachers;
CREATE TRIGGER course_teachers_published_immutable BEFORE UPDATE OR DELETE ON course_teachers
FOR EACH ROW EXECUTE FUNCTION prevent_published_release_mutation();
DROP TRIGGER IF EXISTS cover_templates_published_immutable ON cover_templates;
CREATE TRIGGER cover_templates_published_immutable BEFORE UPDATE OR DELETE ON cover_templates
FOR EACH ROW EXECUTE FUNCTION prevent_published_release_mutation();

COMMIT;
