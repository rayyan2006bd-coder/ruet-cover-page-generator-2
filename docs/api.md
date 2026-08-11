# API reference

Base URL for local development: `http://localhost:8787`

Dependency-free documentation is at `/docs`; the OpenAPI 3.1 document is at `/api/v1/openapi.json`.

## Public routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/v1/health` | Process liveness; does not require the database. |
| GET | `/api/v1/ready` | Verifies database connectivity and the migrated `departments` table. |
| GET | `/api/v1/meta` | Dataset version/checksum, active counts, and publication time. Counts are database queries. |
| GET | `/api/v1/departments` | Active departments. |
| GET | `/api/v1/departments/:slug` | One active department. |
| GET | `/api/v1/teachers` | Paginated teacher search. |
| GET | `/api/v1/teachers/:id` | One active teacher. |
| GET | `/api/v1/teachers/dataset` | Complete offline dataset with ETag and cache headers. |
| GET | `/api/v1/dataset/manifest` | Current published release version, checksum, timestamp, and counts. |
| GET | `/api/v1/dataset/export` | Complete checksummed department/teacher/course/relationship/template release. |
| GET | `/api/v1/courses` | Search published courses by query and department using a stable-key cursor. |
| GET | `/api/v1/courses/:courseKey/suggested-teachers` | Ordered active teacher suggestions for a course. |
| GET | `/api/v1/templates` | Published approved templates filtered by department and cover type. |

Teacher query parameters are `q`, `department`, `designation`, `page` (default 1), `limit` (default 50, maximum 100), and `sort` (`name`, `-name`, `designation`, or `-updated`). Search is case-, punctuation-, and extra-space-insensitive. Every normalized query token must occur in the precomputed search document, which contains official name, aliases, designation, department name, and abbreviation.

Example:

```http
GET /api/v1/teachers?q=Professor%20CSE&department=CSE&page=1&limit=50
```

Dataset clients should retain the returned `checksum`, send `If-None-Match: "<checksum>"`, and keep their previous validated data when an update fails. A matching dataset returns `304 Not Modified`.

## Legacy compatibility

`GET /teachers` and `GET /api/teachers` return:

```json
{
  "list": [
    { "name": "A H M Sarowar Sattar", "post": "Professor", "dept": "CSE" }
  ]
}
```

They use the versioned directory service and include deprecation headers. `/departments` and `/api/departments` are also available for older clients.

## Protected maintenance

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/v1/admin/teachers` | Create or update one validated record. |
| PATCH | `/api/v1/admin/teachers/:id` | Update an existing record without hard deletion. |
| POST | `/api/v1/admin/teachers/import` | Dry-run or transactionally import up to 1,000 records. |
| POST | `/api/v1/admin/datasets/publish` | Record a published dataset version/checksum/count. |
| POST | `/api/v1/admin/session/login` | Create an expiring administrator session. |
| POST | `/api/v1/admin/session/logout` | Revoke the current session. |
| GET | `/api/v1/admin/session` | Return the authenticated administrator. |
| GET/POST | `/api/v1/admin/releases` | List releases or create a draft, optionally by copying a release. |
| GET | `/api/v1/admin/releases/:releaseId/data` | Read all draft records for the editor. |
| POST | `/api/v1/admin/releases/:releaseId/departments` | Create/update/deactivate a draft department. |
| POST | `/api/v1/admin/releases/:releaseId/teachers` | Create/update/deactivate a draft teacher. |
| POST | `/api/v1/admin/releases/:releaseId/courses` | Create/update/deactivate a draft course. |
| POST | `/api/v1/admin/releases/:releaseId/course-teachers` | Create/update/deactivate a draft relationship. |
| POST | `/api/v1/admin/releases/:releaseId/templates` | Create/update/deactivate a draft template. |
| GET | `/api/v1/admin/releases/:releaseId/validate` | Validate references and template configuration. |
| POST | `/api/v1/admin/releases/:releaseId/publish` | Transactionally publish a valid draft. |
| POST | `/api/v1/admin/releases/:releaseId/rollback` | Republish a valid retired release. |
| GET | `/api/v1/admin/audit` | Read the latest 200 audit events. |

The preferred browser flow uses an administrator created by the local CLI:

```bash
bun --cwd server run admin:create-user
```

The CLI reads `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_ROLE` (`owner`, `editor`, or `viewer`) and stores only an Argon2id password hash. Login issues an opaque session token; only its SHA-256 hash is stored. The session cookie is HttpOnly, SameSite=Strict, Secure in production, expiring, and revocable. Browser mutations require the non-HttpOnly CSRF cookie value in `X-CSRF-Token`. Viewers cannot mutate; rollback requires owner access.

`ADMIN_TOKEN_HASH` remains as an optional compatibility path for legacy scripts. Generate a hash without storing the plaintext token:

```bash
bun --cwd server run admin:hash -- "a-random-token-at-least-24-characters"
```

Send the plaintext token as `Authorization: Bearer ...`. General and stricter admin rate limits apply. Release publish validation and the final status transition run in one transaction. Published/retired data tables are protected by database triggers, and changes write request-correlated audit events.

Errors use `{ "error": { "code", "message", "requestId", "details"? } }`. Production errors never return stack traces.
