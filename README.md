# Virtual Data Room: QA assignment

Quality assessment of the [Virtual Data Room](https://github.com/evo9/virtual-data-room) MVP, plus the start of a reusable automation framework.

| Document | What is inside |
|---|---|
| [docs/QA_REPORT.md](docs/QA_REPORT.md) | **Start here.** Verdict on release readiness, what was tested, risks, coverage, next steps, AI usage |
| [docs/FINDINGS.md](docs/FINDINGS.md) | 12 prioritised findings with steps, expected vs actual, root cause and suggested fix |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | Scope, risk model, approach, test data strategy |

## Testing approach in short

- **Risk first.** A data room exists to keep confidential documents away from the wrong people, so access control got the deepest coverage, then data integrity (names, uploads), then auth hardening, then UX.
- **Read the code, test the product.** Controllers and DTOs show where a check could be missing; every claim is then proven black-box against production.
- **Testing pyramid without access to internals:** a wide API layer (fast, every role and edge case), a thin UI layer for real user flows and UI-only bugs.
- **Bugs as executable tests.** Each confirmed defect has a test asserting the correct behaviour, marked `test.fail()` with its ID. The suite is green today and tells you when a fix lands.
- **Isolation.** Every test registers its own fresh users, so tests run in parallel against production and never touch the shared demo accounts.

## Running the tests

Requirements: Node 20+.

```bash
npm install
npx playwright install chromium
npm test              # everything: API + e2e, about 2 minutes
npm run test:api      # API layer only
npm run test:e2e      # UI layer only
npm run report        # open the HTML report of the last run
```

Targets production by default. Point it elsewhere with environment variables:

| Variable | Default |
|---|---|
| `VDR_API_URL` | `https://virtual-data-room-production.up.railway.app` |
| `VDR_WEB_URL` | `https://virtual-data-room-ten.vercel.app` |
| `VDR_TEST_PASSWORD` | password used for generated users |

Expected result today: all tests pass. Known-issue tests show as expected failures in the report.

## Framework structure

```
src/
  config.ts            environment and URLs
  api/client.ts        typed API client: auth, rooms, folders, files (full upload flow), shares, public links
  data/factory.ts      unique users and names, PDFs generated on the fly (pdf-lib)
  fixtures.ts          Playwright fixtures: owner, viewer, stranger, anonymous client, UI login by token
  pages/room-page.ts   page object for the room and folder screen
tests/
  api/                 base of the pyramid: access control, folders and files, auth, known issues
  e2e/                 top of the pyramid: owner flow, sharing, viewer, accessibility, known UI issues
docs/                  test plan, findings, QA report
```

### Adding a test

```ts
import { test, expect } from "../../src/fixtures";

test("viewer cannot rename a shared file", async ({ owner, viewer, pdf }) => {
  const file = await owner.api.uploadPdf(owner.roomId, "doc.pdf", pdf);
  await owner.api.createShare({ resourceType: "FILE", resourceId: file.id, mode: "USER", granteeEmail: viewer.email });
  expect((await viewer.api.renameFile(file.id, "x.pdf")).status).toBe(404);
});
```

Fixtures create the users and their rooms; the API client hides the three-step upload (intent, storage PUT, complete).

## Notes

- Test users follow the pattern `qa-auto-<run>-<role>-<random>@example.com`. The product has no account deletion, so they stay in the database; they are easy to filter out by prefix.
- The suite is CI-ready (`CI=1` lowers parallelism); the natural next step is running it on every pull request against a preview deployment.
