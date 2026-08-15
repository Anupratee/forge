/**
 * The domain enumerations, mirrored from `server/src/entities/`.
 *
 * There is no shared package between the two halves — the mandated project structure has none, and the
 * client talks to the API only over HTTP. So these values are declared twice, deliberately. The cost is
 * this one file; the Phase 8 tests assert the values the API accepts, so a drift shows up as a failing
 * test rather than as a runtime surprise.
 *
 * They are const objects rather than TypeScript `enum`s because `erasableSyntaxOnly` is on: an `enum`
 * emits runtime code, which a type-stripping build cannot erase. The `as const` + indexed-access pair
 * below gives the same two things an enum does — a value to use at runtime and a type to annotate with,
 * under one name.
 */

export const Role = {
  ADMIN: 'ADMIN',
  CREATOR: 'CREATOR',
  USER: 'USER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const ChallengeCategory = {
  ART: 'ART',
  FITNESS: 'FITNESS',
  FINANCE: 'FINANCE',
  LEARNING: 'LEARNING',
  WELLNESS: 'WELLNESS',
  PRODUCTIVITY: 'PRODUCTIVITY',
} as const;
export type ChallengeCategory = (typeof ChallengeCategory)[keyof typeof ChallengeCategory];

export const ChallengeStatus = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ENDED: 'ENDED',
} as const;
export type ChallengeStatus = (typeof ChallengeStatus)[keyof typeof ChallengeStatus];

export const ParticipationStatus = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type ParticipationStatus = (typeof ParticipationStatus)[keyof typeof ParticipationStatus];

export const HabitCategory = {
  HEALTH: 'HEALTH',
  FITNESS: 'FITNESS',
  FINANCE: 'FINANCE',
  LEARNING: 'LEARNING',
  MINDFULNESS: 'MINDFULNESS',
  PRODUCTIVITY: 'PRODUCTIVITY',
} as const;
export type HabitCategory = (typeof HabitCategory)[keyof typeof HabitCategory];

export const ExpenseCategory = {
  FOOD: 'FOOD',
  HOUSING: 'HOUSING',
  TRANSPORT: 'TRANSPORT',
  UTILITIES: 'UTILITIES',
  HEALTH: 'HEALTH',
  ENTERTAINMENT: 'ENTERTAINMENT',
  EDUCATION: 'EDUCATION',
  SHOPPING: 'SHOPPING',
  SAVINGS: 'SAVINGS',
  OTHER: 'OTHER',
} as const;
export type ExpenseCategory = (typeof ExpenseCategory)[keyof typeof ExpenseCategory];

export const ExpenseSource = {
  MANUAL: 'MANUAL',
  CSV_IMPORT: 'CSV_IMPORT',
  AI_IMPORT: 'AI_IMPORT',
} as const;
export type ExpenseSource = (typeof ExpenseSource)[keyof typeof ExpenseSource];

export const RewardItemType = {
  COSMETIC: 'COSMETIC',
  VOUCHER: 'VOUCHER',
} as const;
export type RewardItemType = (typeof RewardItemType)[keyof typeof RewardItemType];

export const PointsReason = {
  HABIT_COMPLETION: 'HABIT_COMPLETION',
  HABIT_STREAK_BONUS: 'HABIT_STREAK_BONUS',
  CHALLENGE_CHECK_IN: 'CHALLENGE_CHECK_IN',
  CHALLENGE_COMPLETION: 'CHALLENGE_COMPLETION',
  BUDGET_ADHERENCE: 'BUDGET_ADHERENCE',
  REDEMPTION: 'REDEMPTION',
  ADMIN_ADJUSTMENT: 'ADMIN_ADJUSTMENT',
} as const;
export type PointsReason = (typeof PointsReason)[keyof typeof PointsReason];

/**
 * Every member of a const-object enum, typed as the union rather than as `string[]`.
 *
 * Select inputs and filter bars iterate these, so adding a category on the server and here is enough to
 * make it appear in every form that offers one.
 */
export function valuesOf<T extends Record<string, string>>(source: T): T[keyof T][] {
  return Object.values(source) as T[keyof T][];
}
