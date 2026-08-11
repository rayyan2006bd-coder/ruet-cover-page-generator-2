# RUET Cover Page Generator Implementation Plan

## Existing architecture

- React 18 + strict TypeScript frontend built with Rsbuild and styled with the existing Radix/shadcn-style components and Tailwind utilities.
- Jotai atoms persist the current cover fields and the seven Settings-tab switches in `localStorage`; small lookup histories and the verified teacher dataset use IndexedDB through `idb-keyval`.
- `@react-pdf/renderer` produces selectable-text vector PDFs; `react-pdf`/PDF.js renders the live A4 preview. The current template is already constrained to one A4 page.
- Workbox generates the service worker after the production render pass. Fonts, PDF worker, images, and the application shell are emitted locally.
- `server/` is a Bun/Hono/Drizzle/PostgreSQL API with teacher and department tables, seed validation, version metadata, ETags, restrictive CORS, request IDs, rate limits, compatibility routes, and initial administrator mutations.
- `shared/api-contracts.ts` contains the first shared Zod contracts. There is no account system for normal users and no private cover endpoint.

## Existing workflow and compatibility boundary

The existing workflow remains Student → Subject → Teacher → Settings, with a live preview and Download action. Manual entry remains authoritative. The exact seven Settings-tab options and current defaults are preserved:

1. Add borders to submitted by and submitted to table — off
2. Add watermark — off
3. Use “Course Code” instead of “Course No.” — off
4. Show student series — off
5. Show student session — off
6. Show course information below title — off
7. Show dates below title instead of at the bottom — off

Assessment-table and manual-submission switches remain separate existing cover controls.

## Required changes

- Add versioned shared schemas for public directory releases, courses, relationships, templates, local profiles, presets, drafts, snapshots, history, batch rows, embedded PDF data, imports, and release validation.
- Add a migration-aware IndexedDB repository and cover-state adapter around the existing Jotai atoms.
- Add accessible local workspace dialogs for profiles, presets, draft recovery, undo/redo, recent covers, batch generation, smart import, filename configuration, and local-data clearing.
- Expand the public directory to courses, relationships, templates, immutable releases, atomic offline activation, and rollback to the previous verified dataset.
- Add a protected, lazy-loaded `/admin` application and cookie/session/CSRF administrator API.
- Post-process generated PDFs with `pdf-lib` to embed structured cover data and metadata without rasterizing visible text.
- Add deterministic filename/preflight utilities, merged batch PDF and ZIP export, PDF-text import, and a private OCR boundary that remains disabled until trained data is vendored.

## Database and API design

- Add `admin_users`, `admin_sessions`, `dataset_releases`, `courses`, `course_teachers`, and `cover_templates`; evolve departments, teachers, and audit logs with stable keys and release references through a forward-only migration.
- Published release records are immutable. Draft editing and publishing run transactionally after referential validation. Rollback republishes a validated retired release without modifying its directory records.
- Public routes expose health, manifest, complete export, departments, teachers, courses, course suggestions, and templates with Zod validation, bounded pagination, release versions, ETags, and immutable cache headers.
- Administrator routes use Argon2id passwords, opaque hashed server-side sessions, HttpOnly/SameSite cookies, CSRF tokens, login/mutation rate limits, role checks, validation previews, and redacted audit logs.
- No endpoint accepts students, profiles, drafts, uploaded covers, OCR input, batches, or generated PDFs.

## Frontend state design

- `CoverFormData` is a versioned serializable projection of the existing atoms; applying a projection writes through those atoms so the PDF template remains compatible.
- Local entities use stable UUIDs and timestamps. Directory selections store stable keys plus fallback display values.
- One IndexedDB database stores schema metadata, settings exports, profiles, presets, drafts, bounded snapshots, cover history, verified directory slots, and template selections. Uploaded files and generated PDF binaries are never retained automatically.
- Meaningful cover changes are debounced into the active draft. A bounded snapshot reducer provides undo/redo and retains at least 25 states.

## Offline strategy

- Precache the application shell, fonts, logos, PDF worker, and bundled assets. OCR workers/language data must be added to this list when the English trained-data asset is vendored.
- Store active and previous verified directory releases atomically. Online checks use the manifest ETag; incomplete or invalid downloads never replace the active release.
- All cover editing, profile/preset/history operations, PDF generation/import, OCR, and batch output execute in the browser.

## Security boundaries

- Cover contents, identity data, uploaded files, extracted text, OCR results, profiles, presets, drafts, history, and PDFs remain client-side.
- Public institutional strings are schema-validated and rendered as text. Filenames reject traversal and unsafe characters.
- Server logs contain request metadata only. Database errors, password material, tokens, filenames, and form content are not logged.
- Administrator mutations require authenticated sessions, CSRF verification, validation, body limits, restrictive CORS, rate limits, and audit entries.

## Implementation phases

1. Repair baseline test/tooling failures and freeze compatibility fixtures.
2. Expand shared contracts and local schema migrations.
3. Implement local profiles, presets, autosave/recovery, snapshots, history, and export/import.
4. Add release-scoped database schema, seeds/importers, public APIs, and administrator security/workflow.
5. Integrate course search, richer teacher selection, templates, and atomic offline releases.
6. Add filename/preflight, embedded PDF data, text parsing, review UI, and the guarded OCR import boundary.
7. Add duplicate/recent-cover and sequential batch PDF/ZIP generation.
8. Complete the lazy `/admin` UI, accessibility, PWA caching, tests, documentation, and delivery review.

## Test plan

- Unit: schemas/migrations, course normalization, filenames, profile locking, preset fallbacks, history reducer, duplication, batch collisions, release validation, PDF attachment round trip, RUET text parsing, and confidence thresholds.
- PostgreSQL integration: public filters/pagination/ETags; session auth/CSRF/authorization; draft CRUD; immutable publish; rollback; audits; referential validation.
- PDF: A4 dimensions, one page, selectable text, embedded fonts/data, import round trip, long valid fixtures, merged pages, and ZIP names.
- Browser: existing single-cover flow plus directories, profiles, presets, recovery, history, batch, import levels, profile replacement, offline operation, release publication, and API outage.
- Visual/accessibility: desktop/tablet/mobile, light/dark, dialogs, long fields, two teachers, keyboard operation, focus handling, live-region progress, and no horizontal overflow.

## Baseline evidence (2026-08-11)

- Frontend TypeScript: pass.
- Production build/PWA generation: pass.
- Root tests: 17 pass, 16 skipped, 1 fail (`indexedDB` absent in the PDF unit environment).
- Server unit tests: 11 pass, 15 skipped pending `TEST_DATABASE_URL`.
- Server TypeScript: 2 errors (`requestId` context typing and a non-module CLI file).
- Biome: one `package.json` formatting failure and an outdated configuration schema URL.
- Root data scripts: incorrect Bun `--cwd` argument order; command bodies did not run.

## Completion evidence (2026-08-11)

- Frontend and server strict TypeScript: pass.
- Biome review: 132 files pass with no fixes required.
- Unit/PDF/local workflow suite: 41 pass, 14 environment-dependent skips, 0 failures.
- Production frontend bundle, static render, and Workbox service worker: pass; 31 URLs / 5.76 MB precached.
- Production server bundle: pass.
- PostgreSQL integration and the live-browser E2E remain skipped because Docker/PostgreSQL is not running in this workspace.
- Offline OCR is intentionally not advertised as complete: the English Tesseract trained-data package could not be installed in this environment. Image/scanned-PDF imports fail locally with a precise message and never leave the browser.
