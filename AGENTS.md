# Project Instructions

## Stack

- Frontend: React 18, strict TypeScript, Rsbuild, Jotai, Radix UI, TanStack Query, `@react-pdf/renderer`, PDF.js, Workbox.
- Backend: Bun, Hono, Zod, PostgreSQL, Drizzle ORM.
- Package manager/runtime: Bun. Preserve the existing frontend structure; do not migrate frameworks.

## Privacy and security

- Student data, profiles, presets, drafts, history, uploaded covers, OCR, batches, and PDFs must remain in the browser.
- The server stores only public institutional directory/template data and administrator security/audit data.
- Never log cover contents, credentials, session tokens, uploaded filenames, or database error details.
- Validate shared boundaries with Zod and preserve restrictive CORS, request IDs, body limits, security headers, and rate limits.

## Code conventions

- Use kebab-case filenames, named React components, strict types, and existing `@/` / `@shared/` aliases.
- Reuse existing atoms and Radix-based components. Manual teacher/course entry must remain possible.
- Use semantic HTML, visible focus states, keyboard-operable dialogs/autocomplete, text error messages, and `aria-live` for progress.
- Keep expensive PDF/OCR/admin code lazy-loaded. Revoke object URLs and terminate workers.
- Database changes are forward-only immutable migrations; never edit a deployed migration.

## Compatibility

- Preserve the Student, Subject, Teacher, and Settings workflow and the existing cover appearance.
- Preserve the seven Settings-tab controls and their defaults documented in `IMPLEMENTATION_PLAN.md`.
- Keep old project imports and local storage keys readable through explicit migrations.
- Every individual export must be one A4 page with selectable text.

## Commands

- Frontend dev: `bun run dev`
- API dev: `bun run dev:api`
- Combined dev: `bun run dev:all`
- Frontend type-check: `bun run typecheck`
- API type-check: `bun run typecheck:api`
- Tests: `bun test`
- API integration: set `TEST_DATABASE_URL`, then `bun run test:api`
- Production build: `bun run build && bun run build:api`
- Database: `bun run db:start`, `bun run db:migrate`, `bun run db:seed`

## Testing

- Unit tests use `*.test.ts` / `*.test.tsx` and Bun test.
- Real browser flows live under `tests/e2e/` and must use deterministic local fixtures.
- Run type-check, Biome, unit/API tests, production build, PDF checks, and relevant browser flows before delivery.
