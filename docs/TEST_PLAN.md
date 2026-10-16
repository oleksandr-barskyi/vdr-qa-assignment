# Test plan: Virtual Data Room

## Goal

Decide whether the Data Room MVP is ready for real due-diligence use, and leave behind a regression suite that keeps answering that question after every change.

A data room is trusted with confidential deal documents, so the plan weighs risks by **"what happens to the deal if this breaks"**, not by feature count.

## Scope

| In scope | Out of scope |
|---|---|
| Auth: register, login, session, logout | Load and stress testing of the shared production deployment |
| Folders: create, nest, rename, delete with preview | Penetration testing beyond black-box access checks |
| Files: upload (multi, validation, conflicts), view, rename, move, delete | Supabase and Railway infrastructure itself |
| Sharing: public link, per-email share, inheritance, revocation | Optional features not built (search, versioning) |
| Access control between owner, viewer, stranger, anonymous | Visual regression |
| UX of error and edge states, mobile layout, keyboard access | Browsers other than Chromium (noted as next step) |

## Risk model (drives priorities)

| # | Risk | Impact if it happens | Test depth |
|---|---|---|---|
| R1 | A user reads or changes a room they were not given | Confidential deal data leaks: deal-breaking | Highest: every endpoint, every role |
| R2 | Revocation does not cut access | Leak after the relationship ends | High |
| R3 | Two documents end up with the same name, or the wrong one is shared | Reviewers act on the wrong file | High |
| R4 | Upload rules (PDF only, 50 MB) can be bypassed | Storage abuse, broken viewer, hostile content | High |
| R5 | Account takeover (weak auth controls) | All rooms of that user exposed | Medium-high |
| R6 | Core flows broken or confusing in the UI | Users cannot do the job | Medium |
| R7 | Edge states (deleted while viewed, empty, errors) | Confusion, support load | Medium |

## Approach

1. **Read the spec and the code.** `task.md` gives the requirements, the README gives design decisions and admitted cuts. Reading the controllers and DTOs gives the real API surface, so black-box tests can be aimed at the places where a check could be missing.
2. **Exploratory sessions** against production, timeboxed by risk: access control, upload pipeline, naming conflicts, sharing lifecycle, auth, UI states. Every surprise becomes either a finding or a test.
3. **Automate by the testing pyramid.** We have no access to the app internals, so the base layer is the **API** (fast, deterministic, covers every role and edge case). On top sits a **thin UI layer** for the flows a user actually clicks through, and for bugs that only show in the UI.
4. **Known defects as executable tests.** Every confirmed bug gets a test that asserts the *correct* behaviour and is marked `test.fail()` with its ID. The suite stays green today and flags automatically when a fix lands.

## Test data and isolation

- Every test registers fresh users (`qa-auto-<run>-<role>-<rand>@example.com`), so tests never share state and can run in parallel against production.
- PDFs are generated on the fly with `pdf-lib`; no binary fixtures in the repo.
- Roles per test: **owner**, **viewer** (gets per-email shares), **stranger** (has their own room, no shares), **anonymous** (public links).
- The given demo accounts (`john@`, `viewer@`) are not modified, so other reviewers see an untouched demo.

## Entry and exit criteria

- Entry: web and API respond (`/health` 200), demo accounts can log in.
- Exit for this round: all R1-R4 checks executed, findings triaged with severity and priority, regression suite green with known issues marked.

## Severity and priority

- **Severity** = impact on users or data (Critical, High, Medium, Low).
- **Priority** = order to fix for this product, considering likelihood and how cheap the fix is (P1 now, P2 before real customers, P3 backlog).
