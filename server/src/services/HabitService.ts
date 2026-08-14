import type { DataSource, EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import type {
  CompleteHabitDto,
  CreateHabitDto,
  HabitQueryDto,
  HabitSortField,
  UpdateHabitDto,
} from '../dtos/HabitDto';
import { Habit } from '../entities/Habit';
import type { HabitCategory } from '../entities/Habit';
import { HabitCompletion } from '../entities/HabitCompletion';
import { PointsReason, PointsReferenceType } from '../entities/PointsLedger';
import type { AuthContext } from '../middlewares/auth.middleware';
import { ConflictError, NotFoundError, ValidationError } from '../utils/AppError';
import { isUniqueViolation } from '../utils/database';
import { addDays, today } from '../utils/date';
import { toPage, toPageRequest } from '../utils/pagination';
import type { Page } from '../utils/pagination';
import { escapeLikePattern } from '../utils/sql';
import { PointsPolicy } from './PointsPolicy';
import type { PointsService } from './PointsService';
import { pointsService } from './PointsService';
import type { StreakSummary } from './StreakCalculator';
import { runLengthEndingOn, summarizeStreak } from './StreakCalculator';

export interface HabitSummary {
  id: string;
  name: string;
  description: string | null;
  category: HabitCategory;
  targetPerWeek: number;
  iconImage: string | null;
  isArchived: boolean;
  streak: StreakSummary;
  /** Completions in the seven days ending today, against `targetPerWeek`. */
  completionsThisWeek: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompletionResult {
  date: string;
  note: string | null;
  pointsAwarded: number;
  /** True when this completion closed another full week of consecutive days. */
  earnedStreakBonus: boolean;
  streak: StreakSummary;
  balance: number;
}

const SORT_COLUMNS: Record<HabitSortField, string> = {
  name: 'habit.name',
  category: 'habit.category',
  createdAt: 'habit.createdAt',
  targetPerWeek: 'habit.targetPerWeek',
};

/**
 * Personal habits, their daily completions, and streaks.
 *
 * Habits are strictly private. The specification says a Creator or Admin must never see a user's habits,
 * so there is no listing here that is not scoped to one owner — the scoping is not a filter that a future
 * endpoint could forget to apply, it is the only way in.
 */
export class HabitService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly pointsService: PointsService,
  ) {}

  private get habits(): Repository<Habit> {
    return this.dataSource.getRepository(Habit);
  }

  private get completions(): Repository<HabitCompletion> {
    return this.dataSource.getRepository(HabitCompletion);
  }

  async create(actor: AuthContext, input: CreateHabitDto): Promise<HabitSummary> {
    const habit = await this.habits.save(
      this.habits.create({
        name: input.name.trim(),
        description: input.description ?? null,
        category: input.category,
        targetPerWeek: input.targetPerWeek ?? 7,
        userId: actor.userId,
      }),
    );

    return this.summarize(habit);
  }

  async update(actor: AuthContext, id: string, input: UpdateHabitDto): Promise<HabitSummary> {
    const habit = await this.requireOwned(actor, id);

    if (input.name !== undefined) habit.name = input.name.trim();
    if (input.description !== undefined) habit.description = input.description;
    if (input.category !== undefined) habit.category = input.category;
    if (input.targetPerWeek !== undefined) habit.targetPerWeek = input.targetPerWeek;
    if (input.isArchived !== undefined) habit.isArchived = input.isArchived;

    await this.habits.save(habit);
    return this.summarize(habit);
  }

  /**
   * Deletes a habit that has no history.
   *
   * Once it has completions, those completions are referenced by ledger entries, and deleting the habit
   * cascades them away — which would leave paid-out entries pointing at nothing. Archiving is the
   * supported way to retire a habit that has been used, and the error says so.
   */
  async remove(actor: AuthContext, id: string): Promise<void> {
    const habit = await this.requireOwned(actor, id);

    const completions = await this.completions.countBy({ habitId: habit.id });
    if (completions > 0) {
      throw new ConflictError(
        `This habit has ${completions} recorded completions. Archive it instead of deleting it, so the points it earned keep their history.`,
      );
    }

    await this.habits.delete(habit.id);
  }

  async list(actor: AuthContext, query: HabitQueryDto): Promise<Page<HabitSummary>> {
    const request = toPageRequest(query);
    const builder = this.scopedQuery(actor, query);

    builder
      .orderBy(SORT_COLUMNS[query.sortBy ?? 'createdAt'], query.sortDir ?? 'DESC')
      .addOrderBy('habit.id', 'ASC')
      .skip(request.skip)
      .take(request.take);

    const [habits, total] = await builder.getManyAndCount();
    const completionsByHabit = await this.completionDates(habits.map((habit) => habit.id));

    return toPage(
      habits.map((habit) => this.toSummary(habit, completionsByHabit.get(habit.id) ?? [])),
      total,
      request,
    );
  }

  async getOne(actor: AuthContext, id: string): Promise<HabitSummary> {
    return this.summarize(await this.requireOwned(actor, id));
  }

  /**
   * Records a completion and pays for it.
   *
   * The completion row and its ledger entries are one transaction, for the same reason as a challenge
   * check-in: the unique key on `(habit_id, completed_on)` means a completion that committed without its
   * award could never be retried, so that day would be permanently unpaid.
   */
  async complete(
    actor: AuthContext,
    id: string,
    input: CompleteHabitDto,
  ): Promise<CompletionResult> {
    const habit = await this.requireOwned(actor, id);

    if (habit.isArchived) {
      throw new ConflictError('This habit is archived. Restore it before recording completions.');
    }

    const date = input.date ?? today();
    if (date > today()) {
      throw new ValidationError('A completion cannot be dated in the future');
    }

    return this.dataSource.transaction(async (manager) => {
      const completion = await this.insertCompletion(manager, habit.id, date, input.note ?? null);

      await this.pointsService.award(manager, {
        userId: actor.userId,
        amount: PointsPolicy.HABIT_COMPLETION,
        reason: PointsReason.HABIT_COMPLETION,
        referenceType: PointsReferenceType.HABIT_COMPLETION,
        referenceId: completion.id,
        description: `${habit.name} completed`,
      });

      let pointsAwarded: number = PointsPolicy.HABIT_COMPLETION;

      // Every date for this habit, including the row just inserted — read inside the transaction so the
      // streak reflects it.
      const dates = await this.completionDatesFor(manager, habit.id);

      /**
       * The bonus falls due when the run *ending on this date* reaches another multiple of a week.
       *
       * Measured this way rather than against the current streak so that backfilling a missing middle day
       * still closes the week it belongs to. The ledger's unique key means each completion can trigger at
       * most one bonus, so no amount of re-ordering can pay twice.
       */
      const runLength = runLengthEndingOn(dates, date);
      const earnedStreakBonus =
        runLength > 0 && runLength % PointsPolicy.STREAK_BONUS_INTERVAL_DAYS === 0;

      if (earnedStreakBonus) {
        await this.pointsService.award(manager, {
          userId: actor.userId,
          amount: PointsPolicy.HABIT_STREAK_BONUS,
          reason: PointsReason.HABIT_STREAK_BONUS,
          // The same reference as the completion award above; the differing `reason` is what makes the
          // two rows distinct under the ledger's unique key.
          referenceType: PointsReferenceType.HABIT_COMPLETION,
          referenceId: completion.id,
          description: `${runLength}-day streak on ${habit.name}`,
        });
        pointsAwarded += PointsPolicy.HABIT_STREAK_BONUS;
      }

      return {
        date,
        note: completion.note,
        pointsAwarded,
        earnedStreakBonus,
        streak: summarizeStreak(dates, today()),
        balance: await this.pointsService.getBalance(actor.userId, manager),
      };
    });
  }

  // ---------------------------------------------------------------- Internal

  /**
   * The only way this service reads habits: always filtered to one owner.
   *
   * Written as the single entry point rather than as a filter each caller applies, so an endpoint added
   * later cannot accidentally expose another user's habits.
   */
  private scopedQuery(actor: AuthContext, query: HabitQueryDto): SelectQueryBuilder<Habit> {
    const builder = this.habits
      .createQueryBuilder('habit')
      .where('habit.userId = :userId', { userId: actor.userId });

    if (query.includeArchived !== true) {
      builder.andWhere('habit.isArchived = false');
    }

    if (query.keyword !== undefined) {
      builder.andWhere('(habit.name ILIKE :keyword OR habit.description ILIKE :keyword)', {
        keyword: `%${escapeLikePattern(query.keyword)}%`,
      });
    }

    if (query.category !== undefined) {
      builder.andWhere('habit.category = :category', { category: query.category });
    }

    // The date range filters when the habit was created, which is the only date a habit itself has.
    if (query.dateFrom !== undefined) {
      builder.andWhere('habit.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query.dateTo !== undefined) {
      builder.andWhere('habit.createdAt < (:dateTo::date + 1)', { dateTo: query.dateTo });
    }

    return builder;
  }

  private async requireOwned(actor: AuthContext, id: string): Promise<Habit> {
    const habit = await this.habits.findOneBy({ id, userId: actor.userId });

    // Not found rather than forbidden, and the query is scoped rather than checked afterwards: a habit is
    // private, so a 403 would confirm that someone else owns one under this id.
    if (!habit) {
      throw new NotFoundError('No habit with that id');
    }

    return habit;
  }

  private async insertCompletion(
    manager: EntityManager,
    habitId: string,
    date: string,
    note: string | null,
  ): Promise<HabitCompletion> {
    try {
      return await manager.save(
        manager.create(HabitCompletion, { habitId, completedOn: date, note }),
      );
    } catch (error) {
      if (isUniqueViolation(error, 'uq_habit_completion_habit_date')) {
        throw new ConflictError(`This habit is already recorded as completed on ${date}`);
      }
      throw error;
    }
  }

  private async summarize(habit: Habit): Promise<HabitSummary> {
    const dates = await this.completionDatesFor(this.dataSource.manager, habit.id);
    return this.toSummary(habit, dates);
  }

  private toSummary(habit: Habit, completedDates: string[]): HabitSummary {
    const now = today();
    // The trailing seven days, inclusive of today — a rolling window rather than a calendar week, so
    // "3 of 5 this week" does not reset to zero every Monday morning.
    const weekStart = addDays(now, -6);

    return {
      id: habit.id,
      name: habit.name,
      description: habit.description,
      category: habit.category,
      targetPerWeek: habit.targetPerWeek,
      iconImage: habit.iconImage,
      isArchived: habit.isArchived,
      streak: summarizeStreak(completedDates, now),
      completionsThisWeek: completedDates.filter((date) => date >= weekStart && date <= now).length,
      createdAt: habit.createdAt,
      updatedAt: habit.updatedAt,
    };
  }

  /** Completion dates for a page of habits, one query rather than one per habit. */
  private async completionDates(habitIds: string[]): Promise<Map<string, string[]>> {
    if (habitIds.length === 0) return new Map();

    const rows = await this.completions
      .createQueryBuilder('completion')
      .select('completion.habitId', 'habitId')
      .addSelect('completion.completedOn', 'completedOn')
      .where('completion.habitId IN (:...habitIds)', { habitIds })
      .orderBy('completion.completedOn', 'ASC')
      .getRawMany<{ habitId: string; completedOn: string }>();

    const byHabit = new Map<string, string[]>();
    for (const row of rows) {
      const dates = byHabit.get(row.habitId) ?? [];
      dates.push(row.completedOn);
      byHabit.set(row.habitId, dates);
    }

    return byHabit;
  }

  private async completionDatesFor(manager: EntityManager, habitId: string): Promise<string[]> {
    const rows = await manager
      .createQueryBuilder(HabitCompletion, 'completion')
      .select('completion.completedOn', 'completedOn')
      .where('completion.habitId = :habitId', { habitId })
      .orderBy('completion.completedOn', 'ASC')
      .getRawMany<{ completedOn: string }>();

    return rows.map((row) => row.completedOn);
  }
}

export const habitService = new HabitService(AppDataSource, pointsService);
