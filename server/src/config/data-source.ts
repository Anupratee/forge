import path from 'node:path';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
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
   * Migrations, by contrast, must be a glob: their filenames are generated and cannot be known
   * ahead of time. The extension is left open so the same config works from `src` and from `dist`.
   */
  migrations: [path.join(__dirname, '..', 'migrations', '*.{ts,js}')],

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

  logging: isProduction || isTest ? ['error'] : ['error', 'warn', 'migration', 'schema'],
});
