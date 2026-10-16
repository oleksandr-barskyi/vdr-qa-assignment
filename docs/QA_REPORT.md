# QA report: Virtual Data Room MVP

**Build under test:** production deployment as of 16 Oct 2026 (web on Vercel, API on Railway, storage on Supabase).
**Effort:** one working session, exploratory + automated, Chromium only.

## Verdict on release readiness

**Ready as a demo. Not yet ready for a real due-diligence deal.**

The security core is the strongest part of the product: in more than 30 access checks across four roles I found no way to read or change a room I was not given. That is the risk that matters most for a data room, and it holds.

What blocks real use is data integrity and abuse resistance, not access:

1. **VDR-01**: the normal multi-file upload can create two documents with the same name in one folder.
2. **VDR-02**: the "PDF only, 50 MB" rule exists only in the browser; any client can store anything of any size.
3. **VDR-03**: login has no throttling, and a 7-day token cannot be revoked.

All three are small, well-understood fixes (unique index plus retry, checks in `completeUpload`, a throttler). After them, and ideally VDR-09 (in-app PDF viewing without the browser plugin), I would sign off for a pilot with real users.

## What was tested

| Area | How | Result |
|---|---|---|
| Access control: owner, viewer, stranger, anonymous | API: every read and write endpoint per role, id substitution via public tokens, breadcrumbs above the share boundary | Solid, no defects |
| Sharing lifecycle | API + UI: public link, per-email share, inheritance into subfolders, revocation, deleted resource, idempotent link creation | Solid; 2 low findings |
| Folders | API + UI: nesting, breadcrumbs, case-insensitive conflicts, concurrency, rename, delete preview and cascade | Solid |
| Files | API + UI: multi-upload, validation, conflict naming, rename, move, delete, view, download | 2 high, 2 medium, 3 low findings |
| Auth | API + UI: register, login, enumeration, malformed tokens, validation, brute force, password edge cases | 1 medium, 2 low findings |
| UX and states | UI: empty, error, deleted-while-viewed, revoked link, duplicate folder, rejected file, mobile 390 px | Good overall; viewer and keyboard issues |
| Accessibility | Keyboard-only pass on the room page | 1 medium finding |
| Input hardening | Paging bounds, garbage cursors, malformed ids, XSS in names, CORS | Solid |

Details and reproduction steps: [FINDINGS.md](FINDINGS.md). Scope and risk model: [TEST_PLAN.md](TEST_PLAN.md).

## Key risks

- **Integrity of the document set** (VDR-01): two files with one name is the kind of mistake that ends up in a signed deal.
- **Cost and abuse** (VDR-02): unbounded storage through the signed upload URL.
- **Account takeover window** (VDR-03, VDR-04): no throttling, long non-revocable tokens.
- **Readers on mobile and keyboard users** (VDR-09, VDR-11): the people the owner shares with get a worse experience than the owner.
- **Residual access after revocation** (documented): signed URLs live 5 minutes.

## Automated coverage

60 tests in Playwright + TypeScript, run in about 2 minutes against production, fully parallel and self-isolating (fresh users per test).

| Layer | Tests | What it protects |
|---|---|---|
| API: access control | 12 | R1, R2: no cross-user reads or writes, share subtree boundaries, revocation, token misuse |
| API: folders and files | 23 | Naming conflicts, move rules, cascade delete, upload validation, pagination, input hardening |
| API: auth | 7 | Login, case-insensitive email, no enumeration, token checks, validation |
| API: known issues | 8 | One test per open API defect, marked `test.fail()` |
| UI (e2e) | 10 | Owner core flow, public link incl. revoked page, viewer read-only and deleted-while-viewed, rejection messages, auth redirect, known UI issues |

The known-issue tests assert the **correct** behaviour. Today they fail as expected and the suite is green; when a fix ships, Playwright reports "expected to fail but passed", which is the signal to remove the marker and close the ticket.

## What to test or automate next

1. **Cross-browser and real devices**: Safari (desktop and iOS) and Chrome on Android for upload, viewing and sharing; this is also where VDR-09 needs confirmation.
2. **Contract tests** generated from the NestJS DTOs (or an OpenAPI spec), so API changes break a test before they break the web app.
3. **Run the suite on preview deployments** in CI (GitHub Actions on each PR, against a seeded staging database instead of production).
4. **Large-tree behaviour**: delete preview and delete of a folder with thousands of items; pagination with 100k files (the README's own scaling claim).
5. **Upload resilience**: network drop mid-upload, retry, closing the tab, 50 MB boundary on a slow connection.
6. **Accessibility pass** with axe-core in the e2e layer, plus screen reader checks of dialogs and the upload panel.
7. **Session edge cases**: expired token mid-action, two tabs with different users, logout while an upload runs.
8. **Security regression set**: rate limits once VDR-03 is fixed, upload validation once VDR-02 is fixed, signed URL TTL after revocation.

## Where AI was used, and how it helped

- **Code reading and test design:** Claude Code read the controllers, DTOs and the access resolver and listed the places where a check could be missing (non-atomic name resolution, trust in client-declared size, trim order in DTOs, bcrypt byte limit). I chose which of them to probe and in what order, by the risk model.
- **Exploratory probes:** the agent wrote throwaway probe scripts on request; I read every response and decided what counts as a defect. Two of its first "failures" were test mistakes (wrong public endpoint, a rename field that takes the base name only); checking those in the code is what turned the second one into a real UX finding (VDR-10).
- **Framework and tests:** the agent drafted the API client, fixtures, page object and tests from my structure (pyramid, roles, known issues as `test.fail`). I reviewed every assertion against the actual product behaviour and the spec.
- **Reports:** drafted with AI from my notes; every claim was checked against a reproduction, and claims I could not reproduce in this round are marked as such (VDR-09 on real devices).

AI made the session several times faster on reading and typing. The judgement calls stayed manual: what is risky for a data room, what is a bug versus a design decision, and how to prioritise.
