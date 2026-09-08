# Forge — working conventions

IITM App Dev Lab project (T22026_cs4010). Read this before changing code; it records decisions
that are graded or easy to break.

## Non-negotiable constraints

These come from the course requirements, not from preference:

- **Stack is fixed**: Node.js + Express, PostgreSQL, TypeORM, React, JWT auth. Redis is optional.
  Do not introduce an alternative to any of these.
- **Schema is code-first.** Tables come only from TypeORM entity classes; migrations are
  *generated* (`npm run migration:generate`). Never hand-write DDL, never `CREATE TABLE` by hand,
  never set `synchronize: true`. `psql` is for read-only inspection.
- **Authorization is enforced on the API.** Frontend guards are UX only. Every protected route
  has server-side role and ownership checks, and tests assert the API rejects forbidden roles.
- **Passwords are bcrypt-hashed** (cost 12). Never log, return, or store a plaintext password.
- **Directory structure is mandated** (see below). Do not reorganize it.
- `README.md` and `ai_usage.md` at the repo root are graded deliverables. Append to `ai_usage.md`
  as work happens, not at the end.

## Structure

`server/` and `client/` are fully independent packages — separate `package.json`, separate
install, communicating only over HTTP. There is no root `package.json` and no shared workspace.

```
server/src/
  entities/      TypeORM entity classes        User.ts, Challenge.ts        (PascalCase)
  controllers/   HTTP ↔ service translation    AuthController.ts           (PascalCase)
  services/      all business logic            AuthService.ts              (PascalCase)
  routes/        route definitions             auth.routes.ts              (dot-case)
  middlewares/   auth, validation, errors      auth.middleware.ts          (dot-case)
  migrations/    generated only
  dtos/          class-validator request DTOs  CreateChallengeDto.ts
  config/        env parsing, data-source
  utils/         AppError, pagination, dates
  app.ts         Express app setup (no listen)
  server.ts      entry point (listen)

client/src/
  components/    reusable UI, incl. Loading/Error/Empty, RequireRole
  services/      API calls — api.ts axios instance + one module per resource
  hooks/         one hook per read, one per write
  pages/         route-level screens
  context/       AuthContext
  types/         shared response and enum types
  App.tsx, main.tsx
```

## The layering rule

`route → middleware → controller → service → repository`

Dependencies point rightward only. A service never imports a controller; nothing skips a layer.

- **Controllers** translate HTTP to a service call and back. No business rules, no query
  building, no `if (user.role === ...)`. A controller body over ~15 lines means logic belongs in
  the service.
- **Services** own every business rule and every transaction. They never touch `req`/`res`, so
  they stay unit-testable.
- **Validation**: shape validation is `validate(Dto)` middleware at the route. Services validate
  only *business* invariants (`endDate > startDate`, sufficient points).
- **Errors**: services `throw` typed `AppError` subclasses (`NotFoundError`, `ForbiddenError`,
  `ConflictError`). One error middleware maps them to status codes. No `res.status(400)` in
  controllers, no try/catch in every handler.
- **Authorization**: `authorize(Role.ADMIN)` middleware for coarse role gates; ownership checks
  inside services for scoped access (a Creator reading *their own* challenge's participants).
  Never check the same rule in two layers.

## Schema conventions (settled in Phase 2 — follow, don't relitigate)

- **Column names are snake_case** via `SnakeNamingStrategy` in `config/data-source.ts`. Don't add
  `name:` to a column just to spell it out. FK columns *are* named explicitly, because the spec
  calls them `created_by` / `approved_by`, not `created_by_id`.
- **Calendar dates are `string`, never `Date`.** `type: 'date'` columns carry `YYYY-MM-DD`. A SQL
  `date` has no zone; mapping it to `Date` shifts the day off UTC and breaks check-in, streak, and
  budget-month logic. `utils/date.ts` is the only place that converts, and it works in UTC.
- **Money is `numeric(12,2)` + `numericTransformer`.** Never sum money in JavaScript — use a SQL
  aggregate, where Postgres does the arithmetic in `numeric`.
- **Two entity bases**: `AuditedEntity` (has `updatedAt`) for mutable records; `AppendOnlyEntity`
  for events (`PointsLedger`, `HabitCompletion`, `ChallengeCheckIn`, `Redemption`). Don't give an
  immutable row an `updatedAt`.
- **Every relation also declares its FK id** mapped to the same column, so ownership checks are
  `entity.userId !== actorId` with no join. Assign the id on write; the relation is for reads.
- **Point values live in `services/PointsPolicy.ts`**, not on entities. The one exception is
  `Challenge.pointsReward`, which is Creator-set and Admin-approved.
- **Equipping a cosmetic is `User.equippedRedemptionId`** → `Redemption`, not → `RewardItem`. You
  can only wear what you bought, and one column makes "one at a time" structural.
- **No FK from `Expense` to `BudgetGoal`.** They join on the natural `(user, month, category)` key.
- **Migrations are generated output.** `npm run migration:generate -- src/migrations/Name`, then
  `npm run format`. Never hand-edit the SQL — if it's wrong, fix the entity and regenerate. Before
  generating, run `npm run schema:log` (builds metadata and prints DDL without executing).
  After running, regenerate once more: "No changes in database schema were found" is the drift check.
- **`npm run seed` is destructive** (truncates domain tables, never `migrations`) and refuses to run
  under `NODE_ENV=production`. Seeded password for every account: `Forge!2026`.

## API conventions (settled in Phase 3 — follow, don't relitigate)

- **Express 5 forwards rejected promises to the error handler.** Controllers and services `throw`;
  no try/catch in handlers, no `asyncHandler` wrapper. Verified working.
- **Services throw `AppError` subclasses** from `utils/AppError.ts`. `error.middleware.ts` is the
  only place that sets a status. Non-`AppError` throws become a logged, generic 500.
- Use **`NotFoundError`, not `ForbiddenError`**, for another user's private data — a 403 confirms
  the row exists.
- **`validate(Dto)` at the route is the only shape check.** Services validate business invariants
  only. It runs with `whitelist` + `forbidNonWhitelisted`.
- **`authenticate` re-reads role and status from the database every request.** Never authorize from
  `claims.role`. Read the caller with `getAuth(req)` — never `req.auth!`.
- **`authorize(Role.X)` per route, listed explicitly** — not via `router.use`. Ownership checks go
  in services, never in a controller or middleware.
- **New routes register in `routes/index.ts`** under `/api`. `notFoundHandler` then `errorHandler`
  stay last in `app.ts`.
- **Services take a `DataSource` by constructor** and export a shared singleton at the bottom of the
  file (`export const authService = new AuthService(AppDataSource)`). Resolve repositories per call,
  not at construction — metadata does not exist until `initialize()`.
- **Duplicate-prevention pattern**: attempt the insert, catch with `isUniqueViolation(error, 'uq_…')`,
  rethrow as `ConflictError`. Never pre-check with a read; that's a race.
- Seeded accounts: `admin@`, `maya@`/`dev@` (Creators), `asha@`/`rohan@`, `kim@` (suspended), all
  `@forge.test`, password `Forge!2026`.

## List, upload, and transaction conventions (settled in Phase 4)

- **Every list endpoint reuses `ListQueryDto` + `toPageRequest`/`toPage`.** Subclass it per resource to
  add `category` and `sortBy` only. Never add a second pagination shape.
- **`sortBy` is always an allow-list mapped to a column** (`SORT_COLUMNS`). A query value must never
  reach an `ORDER BY`. Always `addOrderBy('<alias>.id')` as a tiebreak or pagination is unstable.
- **Escape keyword wildcards** with `escapeLikePattern` before wrapping in `%…%`.
- **Read the request through accessors**: `getAuth(req)`, `getQuery<T>(req)`, `pathId(req)`. Never
  `req.auth!`, never `req.params.id` directly, never type params through Express generics.
- **`validateUuidParam('id')` on every `:id` route.** Without it a bad id reaches Postgres as a 500.
- **`validateBody` for bodies, `validateQuery` for query strings.** Query DTOs need `@Type`/`@Transform`
  because query values are strings. Uploads go *before* `validateBody` — Multer parses the body.
- **Route order**: fixed segments before `/:id`, or the fixed ones are unreachable.
- **`PointsService.award` requires an `EntityManager`** — call it inside the transaction that writes the
  triggering row. `getBalance` takes an optional manager to read inside that same transaction.
- **Capacity-style limits need a row lock** (`lock: { mode: 'pessimistic_write' }`), not a count-then-insert.
- **Ledger rows must be non-zero** (`ck_points_ledger_amount_non_zero`) — guard before awarding a
  configurable reward that may be 0.
- **Uploads**: `uploadImage(field, folder)` + `uploadedPath(req.file, folder)`. Stored paths are relative
  to `UPLOADS_ROOT`, never a URL. Filenames are generated, never taken from the upload.
- `closeExpiredChallenges()` is the one deliberate write on a read path — no scheduler exists. Join and
  check-in validate dates independently, so correctness never depends on it having run.

## Money, dates, and privacy (settled in Phase 5)

- **`config/pg-types.ts` makes `date` columns come back as `YYYY-MM-DD` strings even in raw queries.**
  Without it `pg` returns a `Date` at local midnight and raw selects disagree with entity reads. Don't
  remove it, and don't "fix" a date bug by converting at a call site.
- **Never sum money in JavaScript.** Use a SQL aggregate and `Number()` the single result. Bound money
  DTO fields with `MAX_MONEY_AMOUNT` so overflow is a 400, not a 500.
- **Private resources (habits, budgets, expenses) are scoped in the query, not checked after.** One
  `scopedQuery`/`requireOwned` per service, filtering on `userId` — and they throw `NotFoundError`, never
  `ForbiddenError`. There is no Admin or Creator route over any of them.
- **Anything that mints points is a POST.** Never award on a read path.
- **Streak/derived values are never stored.** `StreakCalculator` is pure and unit-tested; keep it free of
  entity and database imports so the tests stay fast and Vitest needs no decorator support.
- **Tests**: `src/**/*.test.ts`, run by `npm test`. `tsconfig.build.json` keeps them out of `dist`;
  `npm run typecheck` still checks them. Vitest does *not* typecheck, and it cannot load entities
  (esbuild drops `emitDecoratorMetadata`) — so unit tests must stay on pure modules. Integration tests
  in Phase 8 will need `unplugin-swc` or similar.
- **`.gitattributes` normalises line endings to LF.** If `git status` starts showing unmodified files as
  changed, that file is the place to look.

## Extras conventions (settled in Phase 7 — follow, don't relitigate)

- **Import is two steps and they never blur.** `preview` writes nothing; `confirm` writes and
  **re-validates** — the preview is a suggestion, not a token. Both CSV and AI feed one pipeline in
  `ExpenseImportService`, and rows are validated by `CreateExpenseDto`, the same class a typed expense
  uses. Never add a second definition of a valid expense.
- **`ConfirmImportDto.source` accepts only `CSV_IMPORT`/`AI_IMPORT`.** That is what keeps "the server
  sets `source`" true in both directions. Never add `MANUAL`.
- **Import uploads are `uploadDocument` (memory storage), never disk.** A statement is read once; a copy
  on disk has nothing responsible for deleting it.
- **Normalisation coerces, never guesses.** Currency symbols, parenthesised debits, and case are
  coerced; a missing title is not repaired and an ambiguous `DD/MM` vs `MM/DD` date is left for the
  validator. Only `YYYY/MM/DD` is converted.
- **The AI import sends the PDF as a `document` block** — no `pdf-parse` (a deliberate deviation from the
  plan; scanned and multi-column statements are the point). `messages.parse` + `zodOutputFormat`,
  `model: 'Codex-opus-5'`, `effort: 'low'`. **Check `stop_reason === 'refusal'` before reading
  `parsed_output`.** No key → `AiImportUnavailableError` (503) and the UI falls back to CSV.
- **Leaderboard opt-out excludes the row from the query**, not from the response. `RANK()` in SQL over
  the whole eligible set; never rank in JavaScript.
- **`PublicUser` carries `equippedTheme`**, resolved server-side, so `useTheme` paints on first render.
  Anything that changes what is worn invalidates `queryKeys.auth.me`.
- **Admin governance: no delete, ever.** Suspend instead. The *only* refusals are self-suspend and
  self-role-change — and the self-role-change refusal is what guarantees an active Admin always remains
  (see the `setRole` docblock). Do not re-add a "last Admin" count; it is unreachable when needed and
  wrong when reached.
- **`UpdateProfileDto` must never gain `role`, `status`, or `email`.** `forbidNonWhitelisted` turning
  those into a 400 is the escalation guard.
- Verification scripts must **set up the state they assert** and clean up only their own rows — the seed
  opts two users into the leaderboard and already contains `CSV_IMPORT` expenses.

## Testing conventions (settled in Phase 8 — follow, don't relitigate)

- **Vitest transpiles with SWC, not esbuild** (`vitest.config.ts`), because esbuild drops
  `emitDecoratorMetadata` and an entity loaded without it registers no columns. This is what lifted the
  Phase 5 constraint that unit tests stay on pure modules. Don't switch the transform back.
- **`data-source.ts` lists migration classes, not a glob.** A glob makes TypeORM load files with its own
  `require`, outside the transform — fine under `tsx`, a syntax error under Vitest. **After
  `migration:generate`, add the new class to that list or it will not run.**
- **Integration tests run against `forge_test`**, created on first use and built by running the real
  migrations — never `synchronize`. `src/tests/database.ts` refuses any database not ending in `_test`,
  because it truncates every domain table. Don't remove that guard.
- **`fileParallelism: false`.** One shared database; parallel files would delete each other's rows.
- **Tests build their own fixtures** (`src/tests/fixtures.ts`) against a database they emptied. Never
  read or write seeded data — Phase 7 already produced the failure mode where a check's cleanup deleted
  the fixture it was checking.
- **`src/tests/**` is excluded from `tsconfig.build.json`** as well as `*.test.ts`; the harness imports
  supertest and must not ship. `npm run typecheck` still covers both.
- **The RBAC matrix is transcribed by hand, not derived from the router.** A matrix generated from the
  same `authorize` calls it checks would still pass with a guard deleted.
- **The matrix asserts allowed roles get *past* the gate**, not only that others are refused — a route
  answering 403 to everyone would otherwise pass. Those positive cases are what found the two
  bad-body 500s; keep them.
- **Concurrency invariants are tested concurrently.** Duplicate check-ins and over-balance redemptions
  fire as simultaneous pairs; a sequential test passes against an implementation with neither guarantee.
- **Read a response body through `bodyOf<T>(response)`.** supertest types `body` as `any`, which
  switches off the checks that catch a test asserting against a field the API does not send.
- **The auth limiter skips under `NODE_ENV=test`** (every supertest request shares one address) and is
  proved by its own test, built through `createRateLimiter` with `skip: () => false`. Don't make the
  application's limiter live in tests, and don't delete its test to compensate.
- **A client mistake is never a 5xx.** An absent body becomes `{}` so the DTO answers; a present
  non-object is a 400; body-parser failures are mapped beside `express.json()` in `app.ts`, the same way
  the static mount's ENOENT is mapped beside it.

## Invariants worth protecting

- **`PointsLedger` is append-only and the only source of truth for balances.** No entity caches a
  balance. `PointsService` is the only code that writes to it. Spending runs in a transaction that
  row-locks the user, sums the ledger, then inserts.
- **Double awards are prevented by database constraints, not application checks** — unique keys on
  `(habitId, date)`, `(participationId, date)`, and once-only ledger references. Insert the
  trigger row and the ledger row in the same transaction.
- **Challenge transitions live in one file** (`services/ChallengeStateMachine.ts`). Every status
  change goes through `assertTransition`. Nothing is visible to Users before Admin approval, and a
  material edit to an approved challenge re-enters `PENDING_APPROVAL`.
- **Role scoping**: a Creator can never see another Creator's participants, and no Creator or
  Admin route exposes a User's habits or budget data.

## Frontend rules

- Only `services/` mentions URLs. Components and pages never call axios.
- One hook per read and per write, in `hooks/`. Query keys live in `services/queryKeys.ts`.
- Loading, error, and empty states come from the three shared components — these are graded, so
  don't re-author them per page.
- `pages/` compose components and call hooks; they hold no business logic.
- Role checks live only in `RequireRole` and `useAuth`.

## Frontend conventions (settled in Phase 6 — follow, don't relitigate)

- **`client/src/utils/` exists** (one addition to the mandated client tree, mirroring the server's).
  `format.ts` holds display formatting so pages stay logic-free.
- **Never put a calendar date through `new Date()`.** `2026-08-15` parses as midnight UTC and renders
  as the 14th west of Greenwich. `formatDate`/`formatMonth` split the string; only real timestamps
  (`createdAt`, `joinedAt`) are parsed. Timestamps are typed `string` in `types/api.ts` — JSON has no
  date type.
- **No TypeScript `enum` in the client.** `erasableSyntaxOnly` is on, so enums are const objects plus
  an indexed-access type under the same name, in `types/enums.ts`. That file is a deliberate mirror of
  the server's enums; there is no shared package.
- **Never duplicate a server policy constant** (point values, validation limits). Report it from the
  response, or don't show it.
- **Never sum money or points in the client.** The server aggregates in SQL and sends the result.
- **One `ApiError`.** `services/api.ts` normalises every failure; `ErrorState` reads it, and forms show
  field messages via `error.messageFor(field)`. The client never re-implements a DTO's rules.
- **401 clears the session; 403 does not.** A 403 is a correct answer to a known caller.
- **Mutations don't retry** (`retry: false`), and queries don't retry a 4xx.
- **Changing a filter resets to page 1** — that lives in `hooks/useListQuery.ts`, not in each page.
- **Mutations that mint or spend points invalidate `queryKeys.points.all`** as well as their own
  resource; expense writes also invalidate `queryKeys.budgets.all` (no FK — they meet on the natural
  key).
- **`RequireRole` is UX, not security**, and says so in its own docblock. Guard route *groups*, not
  pages.
- Known gap: no `GET /challenges/:id/participation`, so `useChallengeParticipation` searches the
  caller's joined list. Close it with a route if it ever matters.

## Commands

```bash
docker compose up -d                 # postgres (add --profile cache for redis)
cd server && npm run dev             # API on :3000
cd client && npm run dev             # SPA on :5173
npm run lint && npm run typecheck    # run in each package before committing
```
