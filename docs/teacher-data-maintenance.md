# Teacher data maintenance

## Current verification status

Departments are based on RUET's official department directory and current curriculum, which list 18 teaching departments. The bundled teacher seed is intentionally limited to eight CSE professors whose names, designations, and department were visible in the official CSE faculty directory on 2026-08-11:

- `https://www.ruet.ac.bd/faculty`
- `https://www.cse.ruet.ac.bd/teacher_list`
- `https://www.ruet.ac.bd/sarowar`

This is a verified bootstrap dataset, not a claim that RUET's roughly 430 faculty records are completely represented. Manual teacher entry therefore remains available. Before expanding the seed, a maintainer must review each official department faculty page and preserve its source URL and verification date.

## Files and commands

- `server/seeds/departments.json`: department reference data.
- `server/seeds/teachers.json`: reviewed teacher records and aliases.
- `bun run data:validate`: schema, department-reference, and duplicate validation.
- `bun run data:duplicates`: punctuation-insensitive duplicate report.
- `bun run db:seed`: transactional idempotent upsert, alias replacement, dataset version, and audit record.

Teacher IDs in the reviewed seed are stable UUIDs. Official display names are never normalized in place; `normalized_name` and `search_text` are derived fields. Aliases are for initials, punctuation, and verified alternate spellings—not unreviewed guesses.

## Review workflow

1. Use an official `*.ruet.ac.bd` faculty list or profile. Record `sourceUrl`, `lastVerifiedAt`, designation, department, and active status.
2. Add only evidence-backed aliases. Keep initials separated; normalization already makes `A.H.M.` and `A H M` equivalent.
3. Run `bun run data:validate` and `bun run data:duplicates`.
4. Start a clean PostgreSQL database, migrate, seed, and run the integration tests.
5. For runtime imports, first send `{"dryRun":true,"items":[...]}` to the protected import route and review its duplicate/department report.
6. Repeat with `dryRun:false`, then publish a new date-based dataset version.

Records should be deactivated, not deleted, when a faculty member leaves or a source becomes uncertain. The schema retains the record, aliases, timestamps, and audit history. Any suspected duplicate or outdated entry should be reported before import rather than silently merged.
