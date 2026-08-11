# Backend contract audit

Audit date: 2026-08-11

The repository contained one network data request. All student, subject, settings, history, and PDF behavior was already local. The new client uses versioned endpoints, while the API preserves the one observed legacy response at `/teachers`.

| Frontend module | Existing request | Expected response | Backend implementation |
| --- | --- | --- | --- |
| Teacher selector (`src/components/editor/teacher-name.tsx`) | `GET ${PUBLIC_API}/teachers` on first directory load; cached for one hour in IndexedDB | `{ "list": [{ "name": string, "post": string, "dept": string }] }`; `Head` records removed client-side | Exact compatibility routes `GET /teachers` and `GET /api/teachers`. The integrated client now uses `GET /api/v1/meta` and `GET /api/v1/teachers/dataset`, validated by shared Zod schemas. |
| Department selector (`src/components/editor/editor.tsx`) | No request. Options came from the local `Department` enum. | Full department name as a local string | Kept local for reliable offline editing. `GET /api/v1/departments` and `/:slug` expose the maintained server directory to other clients. |
| Student form (`src/store/editor.ts`) | No request. Jotai storage plus local IndexedDB student-name history. | Local strings only | Local-only. No student endpoint, upload, or log was added. |
| Subject/course form (`src/store/editor.ts`) | No request. Jotai storage plus local IndexedDB course-title history. | Local strings only | Local-only. No course endpoint or cloud history was added. |
| Teacher autocomplete | No search request per keystroke. `matchSorter` searched the downloaded legacy list by `name`, `post`, and `dept`. | Up to five local matches | Still local and now debounced by 200 ms. It searches shared `TeacherDto` name, designation, full department, and abbreviation. The API list endpoint independently supports server-side search. |
| PDF preview/download | No request. `@react-pdf/renderer` renders locally. | One A4 PDF page | Unchanged. Cover content never reaches the API. |
| Import/export | No request. Browser file APIs and IndexedDB only. | Local settings/history archive | Unchanged and offline-capable. |
| Analytics | Umami download event included student ID, course details, and teacher name | Event data only | Personal and cover-content fields were removed. The optional script loads only when `PUBLIC_UMAMI_WEBSITE_ID` is configured. |

## Controlled contract change

The frontend now shares `DepartmentDto`, `TeacherDto`, metadata, dataset, pagination, import, and error schemas with the backend from `shared/api-contracts.ts`. The offline flow stores one validated dataset envelope atomically under `verified-dataset-v1`. A one-time reader accepts the old `{name, post, dept}` IndexedDB cache so existing users do not lose offline autocomplete.

The compatibility routes contain no duplicate business logic: they map the versioned directory service to the original public shape and send deprecation headers.
