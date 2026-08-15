# Forge

Habit tracking and budgeting in one platform, with a points economy layered on top — completing a
habit, holding a streak, or staying inside a monthly budget earns points that buy cosmetic themes and
simulated vouchers. Users also join time-boxed community challenges authored by Creators and approved
by Admins.

IITM App Dev Lab project — T22026_cs4010.

## Contents

- [Roles](#roles) · [Core entity](#core-entity-challenge) · [Points economy](#the-points-economy)
- [Running it](#running-it) · [Seeded accounts](#seeded-accounts) · [Scripts](#scripts)
- [API](#api) · [Project layout](#project-layout) · [Tests](#tests)
- [Design decisions](#design-decisions-worth-knowing) · [Optional features](#optional-features)

## Roles

Three strictly separate roles; an account holds exactly one. Every rule below is enforced by the API,
not only by the interface — the frontend's `RequireRole` is convenience, and says so in its own
docblock. `src/tests/rbac.test.ts` asserts each of these directly against the endpoints.

| Role | Can do | Cannot |
| --- | --- | --- |
| **Admin** | Manage accounts (suspend, reactivate, change role), approve or reject challenges with a reason, curate the reward store, view system statistics | Suspend or demote themselves; delete an account; read anyone's habits, budgets, or expenses |
| **Creator** | Author challenges, submit them for approval, view participant progress for their own challenges | Approve their own work; manage accounts or the store; see another Creator's participants; see any user's habit or budget data |
| **User** | Track habits and streaks, set monthly budgets and log expenses, join approved challenges and check in daily, redeem points, wear cosmetics, opt into the leaderboard | Reach any Admin or Creator route |

## Core entity: Challenge

Creator-owned, Admin-approved, joined by Users and progressed through daily check-ins.

```
DRAFT → PENDING_APPROVAL → APPROVED → ENDED
                        ↘ REJECTED → (edit) → PENDING_APPROVAL
```

Nothing is visible to Users before approval, and a material edit to an approved challenge sends it
back for re-approval. Every transition goes through one file, `services/ChallengeStateMachine.ts`, so
"a Creator cannot self-approve" is stated once rather than re-implemented per endpoint.

Supporting entities: `ChallengeParticipation`, `ChallengeCheckIn`, `Habit`, `HabitCompletion`,
`BudgetGoal`, `Expense`, `RewardItem`, `Redemption`, and `PointsLedger`.

## The points economy

`PointsLedger` is append-only and is the **only** source of truth for a balance. No entity caches one,
so there is no second copy to drift; a balance is `SUM(amount)` and the sign carries the direction.

Two guarantees hold it together, and both are enforced by PostgreSQL rather than by an application
check — because an application check is a read followed by a write, and two concurrent requests both
pass the read:

- **An action pays out once.** Unique keys on `(habit_id, completed_on)`,
  `(participation_id, check_in_date)`, and `(reference_type, reference_id, reason)`. The triggering row
  and the ledger row are written in one transaction.
- **Spending cannot exceed the balance.** `PointsService.spend` locks the user's row, sums the ledger,
  then inserts. Without the lock, two simultaneous redemptions both see enough and both succeed.

`src/tests/points.test.ts` fires each of these twice at once, not merely twice, since a sequential test
would pass against an implementation that has neither guarantee.

## Running it

Requires Docker and Node 24.

```bash
cp .env.example .env       # then set JWT_SECRET — the placeholder is refused at boot
docker compose up -d       # postgres:16 on 5432

cd server && npm install && npm run migration:run && npm run seed && npm run dev
cd client && npm install && npm run dev
```

The API is on `http://localhost:3000`, the SPA on `http://localhost:5173`, and the client's dev server
proxies `/api` to the former. `GET /health` reports which optional features are switched on.

`server/` and `client/` are fully independent packages — separate `package.json`, separate install,
talking only over HTTP. There is no root package and no workspace.

**A missing or malformed `.env` fails at boot with every problem listed at once**, rather than one
`undefined` per restart. `config/env.ts` is the only place that reads `process.env`.

### Seeded accounts

`npm run seed` is destructive by design — it truncates the domain tables and reinserts, so running it
twice gives the same database rather than a doubled one. It refuses to run under `NODE_ENV=production`.

Every account uses the password **`Forge!2026`**.

| Email | Role | Why it exists |
| --- | --- | --- |
| `admin@forge.test` | Admin | The approval queue, the store, the accounts screen |
| `maya@forge.test` | Creator | Owns challenges in several statuses |
| `dev@forge.test` | Creator | A second Creator, so cross-Creator scoping is demonstrable |
| `asha@forge.test` | User | Habits with a five-day run, budgets over and under, a redemption, a worn cosmetic |
| `rohan@forge.test` | User | A second participant, opted into the leaderboard |
| `kim@forge.test` | User (suspended) | The account a sign-in is refused for, and the one an Admin reactivates |

The seed also plants a challenge at full capacity and a reward item at zero stock, so the availability
filters have something to hide.

## Scripts

Run inside `server/` or `client/`.

| Script | Both | Server only |
| --- | --- | --- |
| `npm run dev` | ✓ | API with reload |
| `npm run build` | ✓ | |
| `npm run lint` / `npm run typecheck` | ✓ | |
| `npm test` | | Vitest — unit and integration |
| `npm run seed` | | Reset and repopulate the development database |
| `npm run migration:generate -- src/migrations/Name` | | Generate from the entities |
| `npm run migration:run` / `:revert` / `:show` | | |
| `npm run schema:log` | | Print the DDL the entities imply, without executing it |

## API

Everything is under `/api`. Failures share one envelope — `{ code, message, details? }` — produced by a
single error middleware; no controller sets a status. Every list endpoint takes the same query
parameters (`keyword`, `category`, `dateFrom`, `dateTo`, `sortBy`, `sortDir`, `page`, `pageSize`,
`availableOnly`) and returns the same page envelope.

### Authentication

| Method | Path | Who |
| --- | --- | --- |
| `POST` | `/auth/register` | anyone (rate-limited) |
| `POST` | `/auth/login` | anyone (rate-limited) |
| `GET` | `/auth/me` | any signed-in account |
| `PATCH` | `/auth/me` | any signed-in account — display name, bio, leaderboard opt-in only |

### Challenges

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/challenges` | any — approved challenges, with the full filter set |
| `GET` | `/challenges/:id` | any — unapproved challenges are visible only to their author and Admins |
| `GET` | `/challenges/authored` · `POST /challenges` · `PATCH`/`DELETE /challenges/:id` · `POST /challenges/:id/submit` | Creator |
| `GET` | `/challenges/:id/participants` | Creator — their own challenges only |
| `GET` | `/challenges/pending-approval` · `POST /challenges/:id/approve` · `POST /challenges/:id/reject` | Admin |
| `GET` | `/challenges/joined` · `POST /challenges/:id/join` · `POST /challenges/:id/check-ins` | User |

### Private to the account that owns them

No Admin or Creator route reads any of these.

| Method | Path | Who |
| --- | --- | --- |
| `GET`/`POST` | `/habits`, `/habits/:id`, `/habits/:id/completions` | User |
| `GET`/`POST` | `/budgets`, `/budgets/summary`, `/budgets/:id`, `/budgets/:id/adherence-claim` | User |
| `GET`/`POST` | `/expenses`, `/expenses/:id` | User |
| `GET`/`POST` | `/expenses/import/options`, `/import/csv`, `/import/statement`, `/import/confirm` | User |

### Store, points, and standing

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/rewards` | any — the shop, in-stock filterable |
| `GET`/`POST`/`PATCH`/`DELETE` | `/rewards/manage`, `/rewards/manage/:id` | Admin |
| `POST` | `/rewards/:id/redeem` · `GET /rewards/redemptions` · `PUT /rewards/equipped` | User |
| `GET` | `/points/balance`, `/points/ledger` | any — always the caller's own |
| `GET` | `/leaderboard` | any — opted-in accounts only |
| `GET` | `/admin/summary`, `/admin/users` · `PATCH /admin/users/:id/status`, `/admin/users/:id/role` | Admin |

## Project layout

```
server/src/
  entities/      TypeORM entity classes — the only source of the schema
  controllers/   HTTP ↔ service translation, nothing else
  services/      every business rule and every transaction
  routes/        each line states its own full pipeline
  middlewares/   auth, validation, rate limiting, errors
  migrations/    generated from the entities, never hand-written
  dtos/          class-validator request shapes
  config/        env parsing, data source
  utils/         AppError, pagination, dates, money
  tests/         integration harness and suites
  app.ts         Express setup (no listen)   ·   server.ts   entry point

client/src/
  components/    reusable UI, including Loading / ErrorState / Empty and RequireRole
  services/      the only files that mention a URL — api.ts plus one module per resource
  hooks/         one per read, one per write
  pages/         route-level screens, including the three dashboards
  context/       AuthContext        types/   response and enum types        utils/   formatting
```

Dependencies point one way: `route → middleware → controller → service → repository`. A service never
imports a controller, and nothing skips a layer.

## Tests

```bash
cd server && npm test
```

280 tests. The integration suite runs against a **separate `forge_test` database**, created on first
run and built by applying the same generated migrations the development database uses — never by
`synchronize`. It refuses to run against any database whose name does not end in `_test`, because it
truncates every domain table between files. Your development data is not touched.

| File | What it proves |
| --- | --- |
| `tests/rbac.test.ts` | Every protected route refuses every role it does not name, **and admits the ones it does** — 224 checks. Plus: suspension and demotion take effect on the next request, not at token expiry; ownership scoping across Creators and Users; role and status cannot be smuggled through a profile update |
| `tests/points.test.ts` | The economy invariants, including concurrent duplicate check-ins and concurrent redemptions |
| `tests/auth.test.ts` | Registration, bcrypt storage, an identical answer for a wrong password and an unknown email, suspended sign-in |
| `tests/malformed-requests.test.ts` | Client mistakes come back as 4xx that say what was wrong |
| `services/StreakCalculator.test.ts`, `utils/date.test.ts` | Pure logic, including the calendar boundaries naive day arithmetic gets wrong |
| `middlewares/rate-limit.middleware.test.ts` | The auth limiter refuses past its limit |

CI runs lint, typecheck, tests, and build for the server, and lint, typecheck, and build for the
client, on every push and pull request. The client has no test suite of its own — its type-check and
build are what gate it.

## Design decisions worth knowing

- **The schema comes only from entity classes.** Migrations are *generated* (`migration:generate`) and
  never hand-edited; `synchronize` is off in every environment, including tests. If the SQL is wrong,
  the entity is wrong.
- **Calendar dates are `YYYY-MM-DD` strings, never `Date`.** A SQL `date` has no zone, and mapping one
  to `Date` shifts the day off UTC — which would be a correctness bug in check-ins, streaks, and budget
  months, not a formatting one.
- **Money is `numeric(12,2)` and is never summed in JavaScript.** PostgreSQL does the arithmetic.
- **A 404, not a 403, for another user's private data.** A 403 confirms the row exists, which is itself
  the leak when the resource is somebody's habit or budget. Where existence is already public — an
  approved challenge's participant list — it is a 403, because there is nothing left to hide.
- **Authorization is re-read every request.** The JWT carries a role for the client's benefit; the API
  never authorizes from it. Suspending or demoting an account takes effect on its next call.
- **Accounts are suspended, never deleted.** Deletion would orphan ledger history and challenge
  ownership, both of which must stay readable.
- **Import is two steps that never blur.** Preview writes nothing; confirm writes and *re-validates*,
  because the preview is a suggestion and the rows come back edited by design. Both CSV and AI feed one
  pipeline, and rows are validated by the same DTO class a typed expense uses.

## Optional features

Both are optional in the specification and both self-disable cleanly.

- **AI statement import** — set `ANTHROPIC_API_KEY` in `.env`. The PDF is sent to the model as a
  document, so scanned pages and multi-column layouts work; the result is schema-validated, then routed
  through the same preview/confirm pipeline as a CSV. Without a key the endpoint answers 503 and the UI
  offers CSV instead.
- **Redis** — `docker compose --profile cache up -d` and set `REDIS_URL`. Nothing depends on it; the
  balance and leaderboard reads are written so it can be added behind them.

## AI assistance

Development used AI assistance throughout. `ai_usage.md` records what was asked for at each phase, what
was accepted, and — more usefully — what was rejected or corrected on review.
