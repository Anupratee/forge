/**
 * What each positive action is worth.
 *
 * These values are policy, and this module is where they live — not on the entities. A
 * points-per-completion column on `Habit` would let a user set the reward on a habit they created
 * themselves, which is an unlimited supply of points.
 *
 * `PointsService` reads these when awarding, and the seed script reads them when it writes ledger
 * rows, so seeded balances always agree with what the running application would have produced.
 *
 * The one exception is challenge completion, which pays `Challenge.pointsReward` — that genuinely is
 * data, set per challenge by its Creator and approved by an Admin before anyone can earn it.
 */
export const PointsPolicy = {
  /** Awarded once per habit per day. */
  HABIT_COMPLETION: 10,

  /** Awarded each time a habit's unbroken run reaches another multiple of the interval below. */
  HABIT_STREAK_BONUS: 25,
  STREAK_BONUS_INTERVAL_DAYS: 7,

  /** Awarded once per participation per day. */
  CHALLENGE_CHECK_IN: 15,

  /** Awarded once per user per budget goal, when the month closes within its limit. */
  BUDGET_ADHERENCE: 50,
} as const;
