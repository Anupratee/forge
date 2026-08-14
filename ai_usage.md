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
