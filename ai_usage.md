# AI Usage

Project: **Forge** — IITM App Dev Lab, T22026_cs4010
Student: Anupratee Bharadwaj (21f1001850)

This document records how AI assistance was used while building Forge, kept current as work
happens rather than reconstructed at submission.

## Tool

**Claude Code** (Anthropic's CLI/IDE agent, Claude Opus 5), run locally against this repository.

## How it is being used

| Used for | Not used for |
| --- | --- |
| Scaffolding boilerplate (config files, project structure) | Choosing the project idea or problem statement |
| Writing implementation code from a plan I reviewed and approved | Deciding the architecture without my review |
| Explaining library APIs and current best practice | Copying any existing or previous-term implementation |
| Reviewing my code for missed edge cases and RBAC gaps | Producing work I have not read and understood |

Every phase followed the same loop: I described the goal, the assistant proposed a written plan,
I reviewed and corrected it (including rejecting choices that did not match the course
requirements), and only then was code written. Work proceeded one phase at a time, with my
explicit approval between phases.

---

## Log

### Planning — project setup and implementation plan

**What I asked for:** read the project spec (`Forge.pdf`), initialize version control, then
produce a full implementation plan.

**What the assistant did:**

- Extracted and read the spec, then reported the requirements back for confirmation.
- Initialized the git repository, wrote `.gitignore` and the initial `README.md`, and created the
  private GitHub remote. On my instruction, `Forge.pdf` was gitignored rather than committed.
- Asked me to decide the open technical questions rather than assuming: backend language,
  database hosting, frontend data/styling approach, and which optional features to build. My
  answers: TypeScript, PostgreSQL via Docker Compose, Tailwind + TanStack Query, and all four
  extras.
- Produced a phased implementation plan covering architecture, the points-economy invariants, and
  per-phase verification steps.

**Corrections I made:**

1. I required that the plan follow the course technology stack strictly. The assistant fetched the
   course requirements document and audited the plan against it, adding a compliance table and two
   requirements the plan had missed: the per-entity attribute set (title, description, timestamp,
   category, capacity, media, ownership) and the **availability filter** in advanced search.
2. I supplied the mandated project-structure diagram from the rubric. The plan was revised to match
   it exactly — layer-first server folders (`controllers/`, `services/`, `routes/`,
   `middlewares/`), the `app.ts`/`server.ts` split, `services/` rather than `api/` on the client,
   and the required root `ai_usage.md`. Its earlier npm-workspaces root and `shared/` package were
   dropped, since neither appears in the mandated structure.
3. I directed that implementation proceed one phase at a time, stopping for my approval after each.

**My own contribution:** the project concept, problem statement, role model, core entity design,
and feature set are mine, from the spec I wrote. All stack and scope decisions above were mine.
I reviewed the plan and required the three corrections listed before approving it.

### Phase 1 — Scaffold and infrastructure

**What I asked for:** build Phase 1 of the approved plan.

**What the assistant did:** created the mandated directory tree; `docker-compose.yml` for
PostgreSQL 16 with Redis behind an opt-in profile; `.env.example`; fail-fast environment parsing
in `server/src/config/env.ts`; the `app.ts`/`server.ts` split with a health endpoint; independent
`package.json`, TypeScript, ESLint, and Prettier configuration for `server/` and `client/`; the
Vite + React + Tailwind client shell; and `CLAUDE.md` recording the conventions and invariants
that later work must respect.

**What I verified:** the container reports healthy, and lint plus type-check pass in both
packages.

### Phase 2 — Data layer

**What I asked for:** build the data layer, but stop after the entity classes so I could review the
schema before anything was generated from it.

**What the assistant did:**

- Wrote eleven TypeORM entity classes plus two abstract base classes (`AuditedEntity` for records
  that change, `AppendOnlyEntity` for events), covering the full attribute set the course requires
  on each core entity.
- Put the double-award and consistency rules in the database rather than in application code:
  unique keys on `(habit_id, completed_on)`, `(participation_id, check_in_date)`,
  `(challenge_id, user_id)`, `(user_id, period_month, category)`, and
  `(reference_type, reference_id, reason)` on the ledger, plus check constraints for the date
  window, positive capacity and amounts, and a non-zero ledger amount.
- Configured the `DataSource` with `synchronize: false` and generated the initial migration with
  `typeorm migration:generate`. No SQL was hand-written.
- Wrote a seed script covering all three roles, all five challenge statuses, and the points economy
  end to end.

**Corrections and decisions I made:**

1. I required the review stop before migrations, so the schema could be checked while it was still
   cheap to change.
2. Enum values, category lists, point values, and the seeded scenario were reviewed by me for fit
   with the problem statement I wrote.

**Points worth recording about the approach**, since they are the parts most likely to be asked
about:

- Calendar dates are stored as `date` and carried as `YYYY-MM-DD` strings rather than JavaScript
  `Date` objects, because a `date` has no timezone and mapping it to `Date` shifts the day away from
  UTC — which would corrupt check-in, streak, and budget-month logic.
- Nothing caches an aggregate: no points balance on the user, no participant count on the
  challenge, no streak on the habit. Each is derived by query, so no stored copy can disagree with
  the rows it summarises.
- Point values live in `services/PointsPolicy.ts`, not on entities. A points-per-completion column
  on `Habit` would let a user set the reward on their own habit.

**What I verified:**

- `schema:log` builds the metadata and prints the DDL before any migration existed, confirming the
  relations and check constraints resolve to the right column names.
- `migration:run` applies cleanly to an empty database, and re-running `migration:generate`
  afterwards reports "No changes in database schema were found" — proving the entity classes and the
  applied schema agree, with no drift.
- Read-only `psql` inspection: the `challenges` table matches the specification's attribute table
  column for column.
- Six deliberate constraint violations (duplicate habit completion, duplicate ledger reference,
  mid-month budget period, backwards challenge dates, zero-amount ledger row, duplicate
  participation) are each rejected by PostgreSQL. Run inside a transaction that was rolled back.
- `npm run seed` twice: row counts do not double, and the ledger sums to the balances I calculated
  by hand (70 and 50).
- Lint and type-check pass, including the generated migration.

### Phase 3 — Authentication and RBAC

**What I asked for:** build authentication and role-based authorization.

**What the assistant did:**

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, with bcrypt at cost 12 and
  JWTs carrying `sub` and `role`.
- `authenticate` and `authorize(...roles)` middleware, a central error handler, and one
  `validate(Dto)` middleware over class-validator.
- `GET /api/admin/summary` — the specification's system-wide statistics for the Admin dashboard, and
  the Admin-gated route that makes `authorize` provable.

**Security decisions worth recording**, since these are the parts most likely to be asked about:

1. **Authorization is decided from the database, not from the token.** `authenticate` verifies the
   signature and then re-reads the account's role and status. A JWT stays cryptographically valid
   until it expires, so trusting its claims would leave a suspended account working and a demoted
   Admin still administering for days. Demonstrated below.
2. **Nobody can register as an Admin.** The DTO rejects the role, and `AuthService.register`'s
   parameter type permits only `USER` or `CREATOR`, so the compiler refuses the call as well.
3. **Login does not leak which emails are registered.** "No such account" and "wrong password"
   return the same message, and when no account matches, the password is still compared against a
   decoy hash so both paths cost the same time.
4. **Suspension is reported only after the password is verified**, so a suspended account cannot be
   identified without its credentials.
5. **`passwordHash` carries `select: false`** and responses are built by naming fields explicitly,
   so a sensitive column added later stays hidden by default rather than being exposed until someone
   remembers to strip it.
6. **Unknown properties in a request body are rejected by name**, so a client cannot smuggle an extra
   field into an object a service later spreads.

**What I verified** (against a running server, with the seeded accounts):

| Check | Result |
| --- | --- |
| Register a new user; register the same email in different case | 201, then 409 |
| Register with `role: "ADMIN"` | 400, `role must be USER or CREATOR` |
| Register with an undeclared extra field | 400, names the offending field |
| Login with a wrong password vs. an unknown email | 401 with the *same* message both times |
| Login as the suspended account with the correct password | 401, suspended |
| `GET /auth/me` with a valid token | 200, and no `passwordHash` in the response |
| `GET /auth/me` with no token / garbage / a token signed with a different secret | 401 in all three cases |
| `GET /admin/summary` as Admin / as a User / with no token | 200 / **403** / 401 |
| An unmatched route | 404 in the same error envelope as every other failure |
| **Suspend an account holding a valid token, then reuse that token** | **401 immediately**; reactivating restored access with the same token |

Also verified: all nine commits for this phase type-check independently, and the compiled `dist/`
output serves login correctly — not just the TypeScript dev runner.

### Phase 4 — Core entity: challenges and the approval workflow

**What I asked for:** build the core entity — Creator authoring, the Admin approval workflow, the
User browse with the graded search filters, joining with capacity limits, and daily check-ins.

**What the assistant did:** fourteen endpoints under `/api/challenges`, a `ChallengeStateMachine`
holding every legal status change, a `PointsService` that is the only writer to the ledger, the
shared `ListQueryDto` and pagination envelope, and Multer-based image upload.

**Design decisions worth recording:**

1. **Every status change goes through one file.** `ChallengeStateMachine.ts` holds the transition map.
   Self-approval is prevented by a single line — `PENDING_APPROVAL → APPROVED` lists `ADMIN` and
   nothing else — rather than by a check repeated at each endpoint.
2. **Capacity is enforced under a row lock.** Counting participants and then inserting is a race: two
   simultaneous joins on the last seat both read `capacity - 1` and both succeed. The transaction
   locks the challenge row first.
3. **A check-in and its points are one transaction.** The unique key on
   `(participation_id, check_in_date)` means a check-in that committed without its award could never
   be retried, leaving that day permanently unpaid. `PointsService.award` *requires* an
   `EntityManager`, so it cannot be called outside a transaction by accident.
4. **Completion is defined as perfect attendance** — one check-in per day of the window — so it can be
   decided the moment the last check-in lands, with no scheduled job.
5. **Search is safe by construction.** `sortBy` is an allow-list mapped to a column, so no query-string
   value reaches an `ORDER BY`. Keyword wildcards are escaped, so searching for `%` does not match
   everything. Every list has a deterministic tiebreak, without which rows sharing a sort value can
   appear twice or never across pages.
6. **Uploaded filenames are generated, never derived from the upload**, and the MIME type must agree
   with the extension.
7. **Material edits re-enter approval.** Re-sending an unchanged value does not, because the service
   compares submitted values against current ones.

**What I verified:** a 57-check script against a running server, all passing. It walks the full
lifecycle — draft → invisible to Users → submit → self-approval refused → rejected with a reason →
edit → resubmit → approve → visible → join → check in — and then covers:

| Area | Checks that passed |
| --- | --- |
| Approval workflow | Creator cannot self-approve (403); a challenge under review cannot be edited; a draft is 404 to a User, not 403; resubmission clears the old rejection reason |
| Capacity | the second user for a one-seat challenge gets 409; `availableOnly=true` hides it |
| Economy | check-in pays 15; three check-ins on a three-day challenge pay 15 + 15 + (15 + 500) = 545 and flip the participation to COMPLETED; a second check-in for the same day is 409 |
| RBAC scoping | **another Creator cannot read participants (403)**, and neither can an Admin; a User cannot author a challenge or read the Creator list; a Creator cannot read the Admin queue or edit another Creator's challenge |
| Search and filter | category, keyword, lowercase `sortDir`, page boundaries, date-range overlap, `availableOnly`; an unknown `sortBy` is 400; `?status=DRAFT` on the public browse is 400; a bare `%` matches nothing |
| Validation | a non-UUID id is 400 rather than a 500 from PostgreSQL; `endDate` before `startDate` is 400; a client-supplied `status` is 400; capacity cannot be cut below the people already joined (409) |
| Uploads | a real multipart create stores a generated filename and serves the exact bytes back; a shell script declared as `x-sh` is refused; a genuine PNG named `.txt` is refused; `../../../../pwned.png` is stored safely inside `covers/` |

All ten commits for this phase also type-check independently.

### Phase 5 — Habits, budgets, the reward store, and the ledger

**What I asked for:** build habit tracking with streaks, monthly budgets and expenses, the
Admin-managed reward store, redemption, and the points ledger endpoint.

**What the assistant did:** 27 endpoints across four resources, a pure streak calculator with unit
tests, `PointsService.spend` completing the economy, and the store with its redemption transaction.

**A real bug this phase, worth recording because of how it was found:**

Recording a habit completion returned a 500. `pg` parses a PostgreSQL `date` into a JavaScript `Date`
at *local* midnight — exactly the conversion the schema was designed to avoid. TypeORM hides it when
hydrating an entity, but a **raw** query does not, so `completedOn` was a string in one code path and
a `Date` in another, both declared `string`. The streak calculation then crashed on "Invalid time
value".

Two things stand out. First, the fix belongs at the driver boundary — one type parser registration —
rather than as a defensive conversion at each call site; that also fixed the same latent problem in
the challenge check-in code. Second, **the unit tests could not have caught it**: they pass strings,
which is what the code always claimed to receive. Only a request against a real database exposed it.
That is the argument for the end-to-end verification runs, not just the unit tests.

**Design decisions worth recording:**

1. **Nothing stores a derived total.** Not a streak, not budget spend, not a balance. Each is computed
   by query per read, so none can drift from the rows it summarises — and each one of them is what a
   points award is paid against.
2. **Money is summed by PostgreSQL, never in JavaScript.** Verified exact to the cent: 350.50 + 400.25
   gives 750.75 and a remaining balance of 249.25 with no floating-point noise.
3. **The streak bonus is keyed on "the run ending on this date"**, not "the streak right now", so
   backfilling a missed day still closes the week it belongs to. That was worth 24 unit tests covering
   month, year, leap-day and DST boundaries.
4. **The adherence bonus is claimed with a POST and only after the month closes.** A GET that quietly
   mints points is not something to build, and claiming mid-month would pay out on day one.
5. **`source` on an expense is set by the server.** Letting a client relabel a manual entry as an
   import would make the audit trail worthless.
6. **Redemption is one transaction over four writes**, with the item locked and then the user.

**What I verified:** a 68-check script against a running server, all passing, plus a separate
concurrency test.

| Area | Checks that passed |
| --- | --- |
| Habits | seven consecutive days pay 10 each and the seventh adds the 25-point bonus (35 that day); a duplicate day is 409; a future date is 400; a habit with history cannot be deleted, only archived; an archived habit refuses completions |
| Privacy | an Admin listing habits is **403**; another User reading a habit is **404, not 403**; asha cannot see rohan's expenses |
| Budgets | duplicate category/month is 409; a day-precision month is 400; spend and remaining are exact to the cent; over-budget flips correctly; the month summary reports categories with no goal |
| Adherence award | refused mid-month (409); claimable once closed; pays exactly 50; **a second claim is 409**; an exceeded budget is refused |
| Store | `availableOnly=true` hides out-of-stock; type filter and cost sort; a User cannot reach `/manage` (403); a themeless cosmetic and a themed voucher are both 400; nested theme colours are validated |
| Redemption | balance falls by exactly the cost; stock decrements; **an unaffordable redemption is 409 and writes no ledger row and changes no stock**; out-of-stock is 409; a redeemed item is deactivated rather than deleted and stays in the purchase history |
| Ledger | pagination, newest first; no internal `referenceId` exposed; **the balance equals the sum of the ledger** |
| **Concurrency** | two simultaneous redemptions of an item costing 70% of the balance → 201 and 409, balance stayed non-negative; two buyers racing for the last unit → 201 and 409, stock ended at 0, not −1 |

All twelve commits for this phase type-check independently, and the 24 unit tests pass.

### Phase 6 — Frontend

**What I asked for:** the React SPA — auth pages and the three role-aware dashboards, plus the
screens each role needs to actually use the API built in Phases 3 to 5.

**What the assistant did:** 15 route-level screens, 8 hook modules, 8 service modules, 13 shared
components, and the mirrored type layer — behind a router whose route groups declare their audience
once.

**A correction I made to the plan before starting:** I asked for Phase 8 by mistake. The assistant
built nothing, said Phase 6 came first, and gave the reason — Phase 8's README and RBAC tests would
have described a half-built application and needed rewriting afterwards, while the RBAC matrix itself
would have been identical either way because Phase 6 adds no server routes. That was the right call
and it cost one exchange instead of a wasted phase.

**Two server bugs the frontend surfaced.** Both had existed since earlier phases and neither was
reachable until a browser client started making these calls:

1. **The participants route confirmed a hidden challenge.** `GET /challenges/:id` answers **404** for
   an unpublished challenge another Creator may not see. The participants route beside it answered
   **403** for that same challenge — which confirms it exists, making the careful 404 pointless. Now
   they agree: 403 for a published challenge, whose existence is already public, and 404 for one that
   is not. Found by driving both endpoints against the seeded second Creator's challenges *at each
   status*, which is what made the inconsistency visible.
2. **A missing upload returned 500.** `express.static` with `fallthrough: false` reports a miss with a
   raw `ENOENT`, which the error handler could not recognise, so every broken image logged an
   "unexpected error". This only became reachable now that the client renders stored upload paths.

**Design decisions worth recording:**

1. **Frontend role checks are user experience, not security**, and the code says so where it matters.
   `RequireRole` decides which screens are worth rendering; the API re-checks every request. The
   verification below proves it by typing each forbidden URL's endpoint directly.
2. **The stored token is a claim, not an answer.** On every page load the account behind it is re-read
   from the server, so a suspension or a role change takes effect on the next load rather than
   whenever the token happens to expire. The role the UI branches on comes from that response, never
   from decoding the token.
3. **A calendar date is never put through `new Date()`.** `2026-08-15` parsed as a `Date` becomes
   midnight UTC and renders as the 14th in any negative offset. This is the same class of bug that cost
   Phase 5 a 500, met on the other side of the wire — so `utils/format.ts` formats calendar days by
   splitting the string, and only real timestamps are parsed.
4. **Enums are const objects, not TypeScript `enum`s**, because the client sets `erasableSyntaxOnly` —
   an `enum` emits runtime code a type-stripping build cannot erase.
5. **Nothing in the client adds two amounts together.** The server sums in SQL `numeric` and sends the
   result; a running total assembled from floats is the drift those columns exist to prevent.
6. **No policy constant is duplicated.** What a check-in is worth lives in `PointsPolicy.ts` and is not
   exposed by any endpoint, so the screen reports it from the response rather than printing a number
   that would be a second, wrong copy.
7. **Mutations never retry**, because a retried check-in or redemption is a second attempt at earning
   or spending. The server's unique constraints would reject the duplicate; the right place to stop it
   is by not sending it.
8. **Signing out clears the query cache** — every cached list was fetched as somebody.

**An API gap I chose to work around rather than close:** there is no
`GET /challenges/:id/participation`, so the detail screen finds the caller's participation by searching
their own joined list. It is documented in the hook. A dedicated endpoint would make it one request
with no scan; it did not justify adding a route during a frontend phase.

**What I verified:** a 66-check script driving the exact HTTP calls each screen makes, as each seeded
role, against a running server — all passing.

| Area | Checks that passed |
| --- | --- |
| Sessions | all three roles sign in; the response carries a token and **never a password hash**; a suspended account is 401; a forged token is 401; no token is 401, which is what sends `RequireRole` to the login screen |
| User dashboard | every call it makes returns the shape it reads — balance, habits with streak summaries and weekly counts, the month summary with totals, joined challenges with progress and their challenge |
| User screens | store, ledger, expenses, redemptions, budget goals; `availableOnly=true` genuinely hides out-of-stock items; the expense list carries SQL-computed totals over the whole match, not the page |
| Creator | the authored list returns **only this Creator's work** and spans several statuses; participant rows carry a display name and progress and **no email** |
| Admin | system summary with counts by role, by status, and the economy; the queue contains only submissions; the inventory can show what the shop cannot |
| **Role scoping** | 15 forbidden endpoint/role pairs each return **403** — every screen absent from a role's navigation, reached directly. Creator → habits, budgets, expenses, joined, both admin screens; Admin → habits, budgets, expenses, authored, redemptions; User → both admin screens, authored, admin summary |
| Cross-owner | another Creator's participants on a published challenge → 403; on an **unpublished** one → **404, matching the detail route**; another User's habit → **404, not 403** |
| Client contracts | the pagination envelope has every field `Pagination.tsx` reads; a rejected body is 400 with a stable code and **per-field messages the forms display**; an unknown id is 404; a malformed id is 400, not 500; **calendar dates arrive as `YYYY-MM-DD` strings** |

Lint, typecheck, and the production build are clean in both packages, the 24 server unit tests pass,
and the SPA serves with deep links and both dev proxies working.

**One thing to note about that verification:** it drives the API, not the rendered UI. It proves every
screen's data contract and every role boundary, which is where the grading and the risk are — but it
does not prove a component renders. Phase 8's integration tests will cover the RBAC matrix formally.

### Phase 7 — Extras, and the Admin gap Phase 6 found

**What I asked for:** the four extras — leaderboard, CSV import, cosmetics, AI statement import — plus
the Admin user-management endpoints that Phase 6 reported missing.

**What the assistant did:** 13 endpoints across five areas, three new screens, and a `useTheme` hook,
in 13 atomic commits.

**The gap this phase closed.** The specification gives an Admin *"manage users — suspend, reactivate,
change role"*, and no such endpoint existed after Phase 5. Nothing had failed, because nothing had
asked; it surfaced only when the Phase 6 Admin dashboard had counts to show and no way to act on them.
That is an argument for building the UI for a role before declaring that role's API finished.

**A guard I wrote and then deleted, which is the most interesting thing here.** Adding role changes, I
wrote the obvious safety check: refuse to demote the last remaining Admin, or the platform can never
approve a challenge or reinstate an account again. Then I tried to write a test for it and could not.

Working through it: the caller is always an active Admin — `authenticate` re-reads status and
`authorize` re-reads role on every request — and cannot be the target, because changing your own role
is already refused. So if the target is *also* an active Admin, there are at least two, and demoting
one leaves one. And if the target is not an active Admin, demoting them cannot reduce the count at all.
The invariant is already guaranteed by the self-change refusal.

Worse, the check did fire in one case: demoting a **suspended** Admin, where the count of active Admins
is 1 (the caller). That refuses a change which could not possibly strand anyone.

So the guard was unreachable in the case it was written for and wrong in the case it did reach — which
is worse than not having it, because it reads as protection. I removed it and wrote the argument into
the docblock in its place. **The test I could not write was the thing that found it.**

**A deliberate deviation from the plan.** The plan specified `pdf-parse` to extract statement text
before sending it to the model. I send the PDF to the model as a document instead. That removes a
dependency and handles the statements a text extractor cannot — scanned pages, multi-column layouts,
tables whose reading order is not their text order — which is precisely the failure mode this feature
exists for. Recorded in the service's docblock and in the commit rather than made silently.

**Design decisions worth recording:**

1. **The model never writes anything.** Extraction produces a *draft* that goes through the same
   preview and the same `CreateExpenseDto` validation as a CSV row, and nothing reaches the database
   until a person confirms what they saw. An extractor that can be wrong is safe behind human approval
   and unsafe in front of a write — which is the whole reason the pipeline has two steps.
2. **Confirm re-validates rather than trusting the preview.** The preview is a suggestion, not a token;
   the rows come back edited by design, so treating them as pre-approved would make the edit box an
   injection point.
3. **One definition of a valid expense.** Imported rows are validated by the very class that validates
   a typed one, so an import cannot be anything a hand-entered expense could not have been.
4. **`source` accepts only import values.** Expense source is set by the server precisely so a client
   cannot relabel a manual entry as an import; restricting the enum keeps that true in both directions —
   an import also cannot pass itself off as manual.
5. **Opting out of the leaderboard removes the row from the query, not from the response.** There is no
   payload containing a non-participant's standing for a client to be careless with.
6. **The ranking is computed by PostgreSQL.** `RANK()` over the whole eligible set before `LIMIT`, so a
   rank is a real position and ties share one. Ranking in JavaScript would mean fetching every user.
7. **The equipped theme rides on the session profile**, resolved server-side, so a cosmetic applies on
   the first paint instead of after a second request that flashes the default palette first.
8. **Uploads for import are held in memory, not written to disk.** An imported file is read once and
   has no further use; writing it down would leave a copy of somebody's bank statement on the server
   with nothing responsible for deleting it.
9. **Normalisation coerces, and refuses to guess.** `"$1,234.50"`, `"(45.00)"`, and a lower-case
   category are the same value written differently. A missing title is not repaired and an ambiguous
   `DD/MM` vs `MM/DD` date is left alone — guessing would file a January expense in October, and a
   visible error beats a wrong date nobody notices.

**What I verified:** a 71-check script against a running server, all passing, plus the Phase 6 suite
re-run for regressions (66/66) and the 24 unit tests.

| Area | Checks that passed |
| --- | --- |
| Account management | list, role filter, keyword search; suspension makes an **existing token stop working on the next request** and blocks sign-in; reactivation restores both; a role change takes effect on next sign-in and the old role's access is gone |
| Governance refusals | an Admin cannot suspend or demote **themselves** (400 each), so the platform still has an Admin afterwards; an unknown role is 400; User and Creator each get **403** on both list and write |
| Profile | a user cannot set their own `role` or `status` through it (**400**, not silently ignored); display name changes work |
| Leaderboard | not opted in → **no rank and absent from the standings**; opting in gives a real rank; balances descend; the leaderboard balance equals the points endpoint's; an equipped cosmetic shows on the row; **opting out removes the row from the query** |
| Cosmetics | a redeemed cosmetic equips and its palette returns; the theme and worn id ride on `/auth/me`; unequip clears it; **a voucher cannot be equipped** (400); **another user's redemption is 404, not 403**; a Creator gets 403 |
| CSV import | loose headers matched; `$1,234.50` becomes 1234.5; `(45.00)` becomes 45; `YYYY/MM/DD` converted; lower-case category matched; bad rows reported **against their fields**; rows numbered as the file shows them |
| The two-step guarantee | **PREVIEW WROTE NOTHING** — expense count unchanged after preview; confirm wrote exactly 2; **confirm re-validated and rejected a bad row**; an import **cannot label itself `MANUAL`** (400); the server stamped the source itself; money and dates survived exactly |
| AI import (disabled path) | options report `ai: false` with no key; the statement route answers **503, not 500** |

**One thing my own test got wrong, worth recording.** The first run reported four failures that were all
my harness, not the code: it assumed the seed left users opted out of the leaderboard (it opts two in),
and it identified imported rows by `source` alone — which also matches expenses the seed creates, so
its cleanup deleted fixture data. I re-seeded and made the test set up the state it asserts against and
match its own rows by title. A verification script that mutates the fixture it is checking is a bug in
the check, and it is the kind that quietly makes later runs disagree with earlier ones.

**What is not verified:** the live AI extraction call. No `ANTHROPIC_API_KEY` is configured, so the
disabled path and the pipeline the extractor feeds are tested, and the model call itself is not.

### Phase 8 — Hardening

**What I asked for:** integration tests over the RBAC matrix and the points invariants, rate limiting
on the auth routes, a CI workflow, and the README rewritten as a graded deliverable.

**What the assistant did:** 280 tests across seven files, an integration harness with its own database,
two production bug fixes the tests found, a GitHub Actions workflow for both packages, and the README.

**The blocker this phase had to clear first.** Since Phase 5 the unit tests had been confined to pure
modules, because Vitest transpiles with esbuild and esbuild does not implement `emitDecoratorMetadata`
— so a TypeORM entity loaded under it registers no column metadata and every repository call fails.
That single missing feature is what had kept integration tests out of the suite for three phases.
Swapping the transform to SWC lifted it.

TypeORM then failed a second way, and the fix was more interesting than the first. Given a glob, it
loads migration files with its own `require`, outside whatever is transpiling everything else — which
works under `tsx` and under `node dist`, and is a syntax error under the test runner. The fix was to
list the migration classes in `data-source.ts` as imports, exactly as the entities were already listed
there, for the reason already written in that file's docblock: a glob resolves differently in every
environment and fails silently when it is wrong. The test environment simply made an existing latent
fragility visible.

**Two bugs the tests found, both of the same kind.** The RBAC matrix checks that each allowed role gets
*past* the gate, not only that forbidden roles are refused — a route that answered 403 to everybody
would satisfy the negative half perfectly. Those positive checks send requests with no body, and eleven
of them came back **500**.

Two distinct causes, both turning a client mistake into a reported server fault:

1. Express 5 leaves `req.body` undefined when a request carries no body, and class-validator throws
   outright on a non-object. Fixed by treating an absent body as an empty one — so the DTO's own rules
   answer, and a legitimately empty request such as a check-in with no note still works — and refusing
   a body that is present but is an array or a bare value.
2. `express.json()` rejects malformed JSON with a body-parser error, which is not an `AppError`, so the
   error handler treated it as a bug. Fixed with a handler scoped to the parser, mirroring the one
   already sitting behind the static mount for the same reason: how a middleware reports its failures
   is knowledge that belongs beside that middleware.

Neither was reachable through the client, which always sends a well-formed body. Both would have been
reachable by anyone with `curl`. A 500 is not a cosmetic difference from a 400 — it tells the caller
the server broke, it hides what was actually wrong, and it fills the log with stack traces for things
that were never faults.

**One test I wrote that was wrong, and the code was right.** I asserted that one Creator asking for
another Creator's participants gets 404. It returns 403, deliberately: an approved challenge is already
visible to everyone through `GET /challenges/:id`, so hiding its existence would conceal nothing and
only mislead. 404 is correct for an *unpublished* challenge, where existence really is secret. I had
flattened a deliberate distinction into a rule. The test now asserts both halves, which documents the
distinction better than the original would have.

**Design decisions worth recording:**

1. **The route matrix is written out by hand, not derived from the router.** A matrix generated from
   the same `authorize` calls it is checking would agree with the code by construction — it would still
   pass with a guard deleted. Transcribing it makes the test an independent statement of what the API
   is meant to allow, so the two have to be changed together.
2. **Every concurrency invariant is tested concurrently.** Duplicate check-ins and over-balance
   redemptions are fired as simultaneous pairs, because both guarantees are enforced by PostgreSQL —
   a unique key, a row lock — and the naive implementation they exist to rule out passes a sequential
   test perfectly. The eight-simultaneous-redemptions case asserts the balance lands on exactly 10, not
   merely on something non-negative.
3. **Tests build their own fixtures against a database they emptied.** Reading seeded data would make a
   test pass or fail on decisions taken in a file it never mentions — and Phase 7 had already produced
   the other failure mode, a verification script whose cleanup deleted seed rows it had not created.
4. **A separate `forge_test` database, and the harness refuses anything not named `…_test`.** The suite
   truncates every domain table; pointing that at the database being demoed against would wipe the seed
   mid-demo. A fixed name in the config would be a convention, and the refusal is what makes it a rule.
5. **The test schema is built by running the real migrations.** Not `synchronize`, which would be
   quicker and would also mean a migration that does not reproduce the entities passes unnoticed.
6. **The rate limiter hands its refusal to `next` instead of writing a response**, so a throttled caller
   reads the same `{ code, message }` envelope as every other failure and the error middleware stays the
   only thing that sets a status.
7. **The limiter stands down under `NODE_ENV=test` and is proved by its own test**, which builds one
   through the same factory with `skip` returning false. Every supertest request arrives from the same
   address, so a live limiter would have started refusing the suite's own logins — and leaving it
   untested to avoid that would have been the worse trade.
8. **Only registration and login are limited.** They are the only endpoints that answer a caller with no
   token at all; everything else is behind `authenticate`, where the account itself can be suspended.

**What I verified:** 280 tests, all passing, in about ten seconds. Lint, type-check, and build clean in
both packages, `dist` free of the test harness, the migration CLI still working after the change above,
and `migration:generate` reporting **"No changes in database schema were found"** — the drift check.

| Suite | What it establishes |
| --- | --- |
| RBAC matrix (224) | Every protected route refuses every role it does not name, **and admits the ones it does**; every route including the open ones refuses a caller with no token |
| Identity | A valid unexpired token stops working the moment the account is suspended, and loses the old role the moment an Admin changes it — the API never authorizes from the claim |
| Ownership | A Creator cannot read another Creator's participants (403) or learn an unpublished challenge exists (404); a User cannot read or write another User's habit, budget, or expense (404 throughout) |
| Escalation | `role`, `status`, and `email` on a profile update are **400, not silently dropped**; an Admin cannot suspend or demote themselves; a Creator cannot approve their own challenge |
| Points | Balance equals the ledger sum; reads never mint; a duplicate completion or check-in is refused with **no extra row**; an unaffordable or out-of-stock redemption writes **none of its three rows** |
| Concurrency | Of two simultaneous check-ins exactly one pays; of two simultaneous redemptions with one affordable exactly one succeeds; eight at once against a balance of 100 leaves exactly 10 |
| Append-only | No route edits or deletes a ledger entry — not forbidden, absent |
| Auth | bcrypt cost 12 stored and never returned; identical answers for a wrong password and an unknown email; a suspended account cannot sign in, and can again once reactivated |
| Malformed requests | Absent, malformed, non-object, and oversized bodies are 400/413 with a message that says what was wrong |

**What is not covered.** The client has no test suite; its type-check and build are what gate it, and
CI runs both. The live AI extraction call remains unverified for want of an API key. Neither is a
regression from a previous phase — both are stated so they are not mistaken for coverage.
