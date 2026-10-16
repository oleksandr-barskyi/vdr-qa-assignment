# Findings

Tested against production (web `virtual-data-room-ten.vercel.app`, API `virtual-data-room-production.up.railway.app`) on 16 Oct 2026, Chromium 141.
Every finding below was reproduced at least twice. Most have an executable test (`test.fail()` with the same ID) in `tests/`.

## Summary

| ID | Finding | Area | Severity | Priority |
|---|---|---|---|---|
| VDR-01 | Parallel uploads with the same name create duplicate file names | Files | High | P1 |
| VDR-02 | Server trusts client-declared size and type: 50 MB and PDF-only limits can be bypassed | Files, security | High | P1 |
| VDR-03 | No rate limiting on login; 7-day token cannot be revoked | Auth, security | Medium | P1 |
| VDR-09 | PDF preview depends on the browser's built-in viewer: no in-app viewing where it is missing | Files, UX | Medium | P2 |
| VDR-11 | Folders and files cannot be opened with the keyboard | Accessibility | Medium | P2 |
| VDR-08 | Completing an upload whose bytes never arrived returns 500 | Files, API | Medium | P2 |
| VDR-04 | Passwords longer than 72 bytes are silently truncated | Auth, security | Low | P3 |
| VDR-05 | Whitespace-only user name and data room name are stored as empty strings | Validation | Low | P3 |
| VDR-06 | API allows renaming a PDF to any extension (`invoice.exe`) | Files, API | Low | P3 |
| VDR-10 | Typing `.pdf` in the rename field produces `name.pdf.pdf` | Files, UX | Low | P3 |
| VDR-12 | "Modified" column shows the creation date | UX | Low | P3 |
| VDR-07 | Owner can share a resource with their own email | Sharing | Low | P3 |

**What held up well** (no defects found): access control between owner, viewer, stranger and anonymous on every read and write endpoint (404 instead of 403, no existence leak), id substitution through public tokens, breadcrumb trimming above the share boundary, revocation (immediate, 410 page for public links), deleting a folder while a viewer has it open, folder name conflicts (also under concurrency), keyset pagination, input validation of ids and paging, XSS in names (escaped), CORS (only the web origin).

---

## High

### VDR-01 Parallel uploads with the same name create duplicate file names

- **Requirement broken:** "Update a file's name (resolve name conflicts within a folder)" and the upload conflict handling the README describes.
- **Steps (UI):** open a folder, click Upload, select two PDFs that are both named `same.pdf` (for example from two different local folders), confirm.
- **Expected:** `same.pdf` and `same (1).pdf`.
- **Actual:** two rows named `same.pdf` in the same folder. Same result with 4-5 parallel API calls to `POST /files/upload-intent`, or with two browser tabs uploading at once.
- **Why it matters:** in due diligence, reviewers and the owner can no longer tell which document is which; "the contract" becomes two files with one name.
- **Root cause:** `resolveName` is check-then-insert, the upload queue runs 4 uploads in parallel, and there is no unique index on `(dataRoomId, folderId, nameLower)`. Folders do not have this problem in practice: 5 parallel creates gave one 201 and four 409.
- **Suggested fix:** partial unique index on `(dataRoomId, folderId, nameLower)` and retry with the next suffix on `P2002`; or serialize intents per folder.
- **Tests:** `tests/api/known-issues.spec.ts` VDR-01, `tests/e2e/owner-flow.spec.ts` KNOWN VDR-01.

### VDR-02 Server trusts client-declared size and type

- **Steps (API):** `POST /files/upload-intent` with `size: 1, mimeType: application/pdf`; `PUT` 2.7 KB of HTML to the returned signed URL with `Content-Type: text/html`; `POST /files/:id/complete`.
- **Expected:** `complete` rejects the file: size is over what was declared, and the bytes are not a PDF.
- **Actual:** 201, the file is listed as a PDF with the real size. Storage serves it as `text/plain`, so it cannot be previewed as a PDF. The 50 MB limit is enforced only in the intent DTO and the browser, so any client can store arbitrarily large or arbitrary files.
- **Why it matters:** storage cost and abuse, broken viewing, and a data room that promises "PDF only" can hold anything. Supabase sanitising HTML to `text/plain` is the only thing standing between this and hosted phishing pages.
- **Suggested fix:** in `completeUpload`, compare `info.size` with the declared size and the 50 MB cap, and check the content type or the `%PDF-` magic bytes; delete the object and the row on mismatch. Also set a file size limit and allowed MIME types on the Supabase bucket.
- **Test:** `known-issues.spec.ts` VDR-02.

## Medium

### VDR-03 No rate limiting on login; tokens cannot be revoked

- **Steps:** 10-12 wrong passwords in a row for one account.
- **Expected:** throttling (429) or a temporary lockout.
- **Actual:** every attempt answers 401 immediately. Combined with a 7-day JWT kept in `localStorage`, with no refresh, no server-side logout and no "sign out everywhere" (admitted in the README), a guessed or stolen password gives a week of access that the owner cannot cut.
- **Suggested fix:** `@nestjs/throttler` on `/auth/login` and `/auth/register` (per IP and per email); shorter access token plus refresh, or a token version on the user row for revocation.
- **Test:** `known-issues.spec.ts` VDR-03.

### VDR-09 PDF preview depends on the browser's built-in viewer

- **Steps:** open any file in headless Chromium (reproduced), or in a browser without a built-in PDF plugin such as Chrome for Android (by design of `<object>`; not verified on a device in this round).
- **Expected:** the PDF is shown in the app ("View file in UI").
- **Actual:** "This browser can't preview PDFs inline. Download to view". The viewer is an `<object type="application/pdf">`, which works only where the browser ships a PDF plugin.
- **Why it matters:** shared links are often opened on a phone; wherever the plugin is missing, the reader can only download.
- **Suggested fix:** render with pdf.js (`react-pdf`), keep `<object>` as a fallback.

### VDR-11 Folders and files cannot be opened with the keyboard

- **Steps:** press Tab through the room page.
- **Expected:** the folder or file name is focusable; Enter opens it.
- **Actual:** focus jumps between the header buttons and the "Actions for X" menus. The row opens only on mouse click (`<TableRow onClick>`). A viewer has no action menu on folders, so for a keyboard-only viewer, shared folders are a dead end. Fails WCAG 2.1.1 (Keyboard).
- **Suggested fix:** render the name as a `<Link>` (or a button) inside the cell; keep the row click as a convenience.
- **Test:** `tests/e2e/owner-flow.spec.ts` KNOWN VDR-11.

### VDR-08 Completing an upload whose bytes never arrived returns 500

- **Steps:** create an upload intent, do not `PUT` anything, call `POST /files/:id/complete`.
- **Expected:** 400 "Upload did not finish - please try again" (the code has exactly this branch).
- **Actual:** 500 "Could not verify the upload", every time. Supabase answers 400 for a missing object, and `getObjectInfo` only maps 404 to "not uploaded".
- **Why it matters:** a dropped connection during upload ends in a server error instead of a retry hint, and real storage outages become indistinguishable from user-side aborts in monitoring.
- **Suggested fix:** map Supabase's "object not found" response to "not uploaded" regardless of the HTTP status it arrives with, and log the raw error for anything else.
- **Test:** `known-issues.spec.ts` VDR-08.

## Low

### VDR-04 Passwords longer than 72 bytes are silently truncated

`MaxLength(72)` counts characters, bcrypt uses the first 72 **bytes**. A password of 40 Cyrillic letters plus anything is 80+ bytes: login succeeds with any other ending. Fix: limit by bytes, or pre-hash (SHA-256) before bcrypt. Test: VDR-04.

### VDR-05 Whitespace-only names are stored as empty strings

`POST /auth/register` with `name: "   "` and `POST /data-rooms` with `name: "   "` return 201 and store `""`: the header shows no user name, a room has no title. Folder and file DTOs trim before validating; these two trim after. Fix: the same `@Transform(trim)` on `RegisterDto.name` and `CreateDataRoomDto.name`. Test: VDR-05.

### VDR-06 API allows any extension on rename

The UI keeps `.pdf` fixed, the API does not: `PATCH /files/:id {name: "invoice.exe"}` succeeds, and the download is then offered as `invoice.exe`. Fix: keep the original extension server-side, or validate it. Test: VDR-06.

### VDR-10 Typing `.pdf` in the rename field doubles the extension

The rename field edits the base name and shows `.pdf` as a suffix. Users who type the full name `nda-signed.pdf` (the common habit from desktop file managers) get `nda-signed.pdf.pdf`. Fix: strip a trailing copy of the extension before submit. Test: `owner-flow.spec.ts` KNOWN VDR-10.

### VDR-12 "Modified" column shows the creation date

Both rows render `createdAt`; there is no `updatedAt` in the schema. After a rename or move, "Modified" still shows the creation day. Fix: add `updatedAt @updatedAt`, or rename the column to "Added".

### VDR-07 Owner can share a resource with their own email

`POST /shares` with the owner's own email returns 201 and the owner appears in "People with access". Harmless, but confusing. Fix: reject with a clear message.

---

## Product gaps and risks (not bugs, worth a decision)

- **Access after revocation lasts up to 5 minutes** for anyone who already holds a signed view or download URL (documented trade-off). For a data room, consider shorter TTLs for viewers or streaming through the API.
- **No audit trail** of who opened which document: a standard data room expectation in M&A.
- **Public links have no expiry or password** option.
- **No account deletion, password change or reset.** Test accounts and real users cannot clean up.
- **Abandoned uploads stay as hidden rows** (documented); with VDR-02 they can also be large objects.
- **Folder move is not implemented** (documented).
