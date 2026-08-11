-- Published and retired releases must reject inserts as well as updates and
-- deletes. Locking the release row in API mutations handles normal races; this
-- trigger remains the database-level invariant for every writer.
BEGIN;

CREATE OR REPLACE FUNCTION prevent_published_release_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  release_status text;
  record_release_id uuid;
BEGIN
  record_release_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.release_id
    ELSE NEW.release_id
  END;

  -- The fixed compatibility release remains writable only for deprecated
  -- teacher maintenance endpoints. Real releases are always immutable.
  IF record_release_id = '00000000-0000-4000-8000-000000000001' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT status INTO release_status
  FROM dataset_releases
  WHERE id = record_release_id;

  IF release_status IN ('published', 'retired') THEN
    RAISE EXCEPTION 'Published and retired dataset releases are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS departments_published_immutable ON departments;
CREATE TRIGGER departments_published_immutable
BEFORE INSERT OR UPDATE OR DELETE ON departments
FOR EACH ROW EXECUTE FUNCTION prevent_published_release_mutation();

DROP TRIGGER IF EXISTS teachers_published_immutable ON teachers;
CREATE TRIGGER teachers_published_immutable
BEFORE INSERT OR UPDATE OR DELETE ON teachers
FOR EACH ROW EXECUTE FUNCTION prevent_published_release_mutation();

DROP TRIGGER IF EXISTS courses_published_immutable ON courses;
CREATE TRIGGER courses_published_immutable
BEFORE INSERT OR UPDATE OR DELETE ON courses
FOR EACH ROW EXECUTE FUNCTION prevent_published_release_mutation();

DROP TRIGGER IF EXISTS course_teachers_published_immutable ON course_teachers;
CREATE TRIGGER course_teachers_published_immutable
BEFORE INSERT OR UPDATE OR DELETE ON course_teachers
FOR EACH ROW EXECUTE FUNCTION prevent_published_release_mutation();

DROP TRIGGER IF EXISTS cover_templates_published_immutable ON cover_templates;
CREATE TRIGGER cover_templates_published_immutable
BEFORE INSERT OR UPDATE OR DELETE ON cover_templates
FOR EACH ROW EXECUTE FUNCTION prevent_published_release_mutation();

COMMIT;
