# Local workspace and PDF workflows

## Profiles, presets, and drafts

Open the workspace button in the top bar. Profiles store student identity fields and may be marked as the device default. Locked name, roll, and department fields are disabled while that profile is active; all locked identity values are preserved during cover import. Presets store course, teachers, cover type, template, settings, and filename pattern without replacing student identity.

Populated covers autosave to IndexedDB after a short debounce and flush on page hide and before a service-worker update. Each draft retains at most 50 snapshots. Undoing and then editing discards the abandoned redo branch. Generated-cover history retains at most 100 records and supports open, duplicate, rename, and delete.

The Data tab exports a versioned JSON backup of profiles, presets, drafts, and history. Imports are schema-validated and support merge or replace. Replace and clear actions require confirmation.

## Filenames and preflight

The default filename pattern is `{department}-{courseCode}_{roll}_{type}-{itemNumber}.pdf`. Supported tokens are `department`, `courseCode`, `roll`, `type`, `itemNumber`, `courseTitle`, `studentName`, and `date`. Invalid filesystem characters, traversal segments, reserved names, trailing dots/spaces, duplicate names, and excessive length are normalized before saving.

Export blocks missing required identity/course/teacher fields, invalid seven-digit rolls, and incomplete approved-template metadata. Reversed dates and unusually long content are warnings that require confirmation. Every generated cover is checked to contain exactly one PDF page.

## PDF import

App-generated PDFs include `ruet-cover.json`, schema/application versions, a SHA-256 checksum, and template identifiers. Import verifies the attachment and restores the exact cover. Other PDFs are parsed from selectable text and presented for field-by-field review with confidence values and warnings.

Images and scanned PDFs are recognized but not transmitted. The repository currently does not include the large English Tesseract trained-data asset, so offline OCR reports a clear unsupported-state error. Vendoring that licensed asset and including it in the service-worker precache is required before enabling OCR.

## Batch generation

Batch rows override item number, title, experiment date, and submission date while using the current student, course, teachers, template, settings, and filename pattern. Generation is sequential, reports progress, runs preflight per row, resolves duplicate filenames case-insensitively, and produces either a merged PDF with one page per row or a ZIP of individual PDFs. Successful files are added to local history.
