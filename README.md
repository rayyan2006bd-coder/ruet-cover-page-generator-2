# RUET Cover Page Generator

A local-first React/Bun cover-page editor with one-page A4 PDF generation and an optional Hono/PostgreSQL directory service. Student details, drafts, profiles, presets, generated-cover history, imported files, and PDF contents stay in the browser. The server publishes only public departments, teachers, courses, course-teacher suggestions, and approved cover templates.

## What is included

- The original Student, Subject, Teacher, and Settings editor and all seven original settings, still defaulting to off.
- Searchable teacher selection with automatic name, designation, full department, and department abbreviation display. Manual entry always remains available.
- Searchable course selection from a bundled 73-course IPE curriculum, with year, semester, type, and credit details available offline. A versioned published release can update matching records and provide suggested-teacher autofill.
- Local profiles with identity locks, course presets, autosaved drafts, bounded undo/redo snapshots, generated-cover history, duplication, and JSON backup/restore.
- Approved template selection, smart filenames, preflight validation, standard/high-quality/compressed export modes, and guaranteed one-page PDF generation.
- Exact re-import of app-generated PDFs through embedded checksummed JSON, plus selectable-text PDF recovery with field confidence and review.
- Sequential batch generation as a merged PDF or ZIP of individual PDFs.
- An offline service worker and atomic IndexedDB directory-release cache with checksum verification and rollback data.
- PostgreSQL release drafts, validation, transactional publishing/rollback, session-based admin authentication, CSRF protection, roles, and audit history.

## Local development

Prerequisites: Bun, Docker Desktop with Compose for PostgreSQL, and ports 3000, 8787, and 5432.

```bash
bun install
cp .env.example .env
cp server/.env.example server/.env
bun run db:start
bun run db:migrate
bun run db:seed
bun run dev:all
```

On PowerShell, use `Copy-Item` instead of `cp`. The frontend is at `http://localhost:3000`; the API is at `http://localhost:8787`; the administrator UI is at `http://localhost:3000/admin`.

The frontend can also run by itself with `bun run dev`. A missing API never blocks manual cover editing or PDF creation. On a first visit, the teacher selector may bootstrap its validated offline cache from `PUBLIC_LEGACY_TEACHER_API`.

## Administrator setup

There is no public registration and no default password. After applying migrations, create or rotate an administrator from a private environment file:

```bash
bun --cwd server run admin:create-user
```

Set `ADMIN_EMAIL`, a password of at least 12 characters in `ADMIN_PASSWORD`, and `ADMIN_ROLE=owner|editor|viewer` in `server/.env` before running the command. Passwords use Argon2id. Browser sign-in creates a hashed, expiring, HttpOnly, SameSite=Strict session and requires a matching CSRF cookie/header for mutations. `ADMIN_TOKEN_HASH` remains optional only for legacy maintenance scripts.

In `/admin`, create a release draft, open **Edit data**, add or deactivate records, validate, and publish. Published and retired release records are immutable. Rollback republishes a previously validated retired release; it does not mutate its data.

## Verification

```bash
bun run typecheck
bun run typecheck:api
bun run test
bun run build
bun run build:api
```

Run the real-browser checks while the frontend is available at port 3000:

```bash
E2E_BASE_URL=http://localhost:3000 bun run test:e2e
E2E_BASE_URL=http://localhost:3000 bun run test:e2e:responsive
```

The responsive check covers 375px phone, 768px tablet, and 1440px laptop
viewports, including keyboard focus, accessible names, touch-target sizing,
horizontal overflow, teacher selection, PDF preview, and the local workspace.

PostgreSQL integration tests require a disposable database:

```bash
docker run --rm -d --name ruet-cover-test-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ruet_cover_test -p 5433:5432 postgres:17-alpine
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/ruet_cover_test bun --cwd server test
```

Never point `TEST_DATABASE_URL` at development or production data. The real-browser workflow additionally requires the API and frontend to be running:

```bash
E2E_BASE_URL=http://localhost:3000 bun run test:e2e
```

## Offline and privacy behavior

The app precaches its frontend assets. Directory releases are downloaded only after their manifest and SHA-256 checksum agree, then activated atomically in IndexedDB; an invalid update or outage leaves the previous verified release in place. PDF creation, PDF attachment import, selectable-text extraction, profiles, drafts, and history are browser-only. The server never receives student or cover contents. No cover-download analytics or third-party runtime script is included.

Scanned PDFs and image import are detected, but offline OCR remains unavailable until an English Tesseract trained-data asset is vendored into the application. The UI reports that limitation explicitly instead of sending private images to a remote OCR service.

## Repository layout

- `src/` — React editor, local workspace, PDF/import services, admin UI, and tests.
- `shared/` — Zod contracts and reviewed datasets shared by frontend and backend.
- `server/src/` — Hono API, release services, authentication, and data tools.
- `server/migrations/` — forward-only PostgreSQL migrations.
- `server/seeds/` — reviewed bootstrap directory records.
- `docs/` — API, workspace, maintenance, architecture, and deployment notes.

## Documentation

- [Local workspace and PDF workflows](docs/local-workspace.md)
- [API and admin authentication](docs/api.md)
- [Teacher data provenance and maintenance](docs/teacher-data-maintenance.md)
- [IPE course data provenance and maintenance](docs/course-data-maintenance.md)
- [Deployment](docs/deployment.md)
- [Frontend/backend contract audit](docs/backend-contract-audit.md)

The bundled seed is intentionally a small reviewed bootstrap, not a fabricated complete RUET directory. Add verified records through a draft release and publish them only after review.

## Publish to GitHub

The repository includes a GitHub Pages workflow that checks formatting, types,
tests, and both production builds before deployment. Set the repository's Pages
source to **GitHub Actions** and configure `PUBLIC_API` as a repository Actions
variable when the optional backend is deployed. The theme variables are optional
because the build safely defaults to `theme` and `auto`.

For a new GitHub repository:

```bash
git init -b main
git add .
git commit -m "feat: prepare RUET cover page generator"
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
git push -u origin main
```

Before committing, `bun run verify` runs the same non-browser quality gates used
by GitHub Actions. Generated builds, dependencies, local environment files,
logs, test artifacts, and coverage output are excluded by `.gitignore`.
