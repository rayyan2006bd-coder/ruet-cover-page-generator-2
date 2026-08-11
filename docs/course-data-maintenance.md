# IPE course data maintenance

The bundled IPE course directory lives at
`shared/data/ipe-course-directory.json`. It is used by the frontend as an
offline fallback and by `bun run db:seed` to populate the baseline backend
release.

The current file contains 73 courses across all eight year-and-semester terms,
plus the option lists for Optional-I and Optional-II. Its embedded source label
is “RUET Course Curriculum (IPE Department, effective from 2020-2021 entry
session)”. Preserve the `meta`, `courses`, and `electives` sections when
updating it.

Each course must have a unique punctuation-insensitive `code`, a non-empty
`title`, year 1–4, semester `Odd` or `Even`, type `Theory`, `Sessional`, or
`Project`, and a positive credit value. Elective group labels must begin with a
course code present in the course list.

After changing the file, run:

```bash
bun run data:validate
bun run test
bun run typecheck
bun run typecheck:api
```

The validator checks the shared schema, duplicate normalized course codes,
elective references, and the required active IPE department. Database seeding
also records a checksum and version entry for the course dataset.
