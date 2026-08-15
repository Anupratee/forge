import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
// Side-effect import: registers the `date` type parser before any connection is opened, so a calendar date
// is a YYYY-MM-DD string in raw queries as well as in hydrated entities. See the module for why.
import './pg-types';
import { BudgetGoal } from '../entities/BudgetGoal';
import { Challenge } from '../entities/Challenge';
import { ChallengeCheckIn } from '../entities/ChallengeCheckIn';
import { ChallengeParticipation } from '../entities/ChallengeParticipation';
import { Expense } from '../entities/Expense';
import { Habit } from '../entities/Habit';
import { HabitCompletion } from '../entities/HabitCompletion';
import { PointsLedger } from '../entities/PointsLedger';
import { Redemption } from '../entities/Redemption';
import { RewardItem } from '../entities/RewardItem';
import { User } from '../entities/User';
import { InitialSchema1786730174250 } from '../migrations/1786730174250-InitialSchema';
import { env, isProduction, isTest } from './env';

/**
 * The single TypeORM DataSource, used by the running server and by the TypeORM CLI alike — so the
 * schema migrations are generated from is the same schema the application talks to.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.database.host,
  port: env.database.port,
  database: env.database.name,
  username: env.database.user,
  password: env.database.password,

  /**
   * Never enabled, in any environment.
   *
   * The course requires the schema be created programmatically from entity classes through
   * migrations. `synchronize: true` would alter tables implicitly on boot, which both bypasses that
   * and can drop columns to make the database match the code.
   */
  synchronize: false,

  /** Migrations are applied explicitly by `npm run migration:run`, never as a side effect of boot. */
  migrationsRun: false,

  /**
   * Entities are listed rather than glob-matched. A glob has to resolve differently under `tsx`
   * (`.ts` in `src`) and `node dist` (`.js` in `dist`), and silently registers nothing when it is
   * wrong — which shows up as a confusing "no metadata for X" much later. This list is also the
   * clearest statement of what the schema contains.
   */
  entities: [
    User,
    Challenge,
    ChallengeParticipation,
    ChallengeCheckIn,
    Habit,
    HabitCompletion,
    BudgetGoal,
    Expense,
    RewardItem,
    Redemption,
    PointsLedger,
  ],

  /**
   * Migrations are listed too, and for a second reason beyond the one above.
   *
   * A glob makes TypeORM load the files itself, with its own `require`, outside whatever is
   * transpiling the rest of the application — which works under `tsx` and under `node dist`, and
   * fails under the test runner, where a `.ts` file reached by a raw `require` is a syntax error.
   * Importing the classes means they arrive through the same pipeline as every other module, so the
   * integration tests can build their schema from these migrations rather than from `synchronize`.
   *
   * TypeORM orders them by the timestamp in the class name, not by their position here.
   *
   * `migration:generate` writes a new file; add it to this list, or it will not run.
   */
  migrations: [InitialSchema1786730174250],

  /**
   * Entity property names are camelCase and column names are snake_case, which keeps the generated
   * schema readable in `psql` without quoting every identifier and matches the column names in the
   * specification's attribute table. Applied by a naming strategy rather than a `name:` on several
   * hundred decorators, so it cannot be forgotten on one column.
   *
   * Foreign-key columns are the exception: each relation names its own column explicitly, because
   * the specification calls them `created_by` and `approved_by` rather than the `_id`-suffixed
   * default.
   */
  namingStrategy: new SnakeNamingStrategy(),

  /**
   * Silent under test, deliberately.
   *
   * The integration suite provokes constraint violations on purpose — a second check-in on the same
   * day, a redemption that loses its race — and every one of them would be logged as a query error. A
   * run that prints a dozen expected failures is a run in which a real one is easy to miss.
   */
  logging: isTest ? false : isProduction ? ['error'] : ['error', 'warn', 'migration', 'schema'],
});
