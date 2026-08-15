import type {
  ChallengeCategory,
  ChallengeStatus,
  ExpenseCategory,
  ExpenseSource,
  HabitCategory,
  ParticipationStatus,
  PointsReason,
  RewardItemType,
  Role,
  UserStatus,
} from './enums';

/**
 * The response shapes the API returns, mirrored from the service layer's view interfaces.
 *
 * Two conventions carried over from the server and relied on throughout the client:
 *
 * - **Calendar dates are `string`** in `YYYY-MM-DD` form (`startDate`, `spentOn`, `lastCompletedOn`), and
 *   months are `YYYY-MM`. They are never parsed into a `Date` for display — a zoneless day put through a
 *   local-time `Date` shifts by one either side of UTC, and every streak and budget rule here is keyed by
 *   day. `utils/format.ts` formats them as strings.
 * - **Timestamps are `string`** here rather than `Date`, because JSON has no date type: what arrives is
 *   the ISO string `JSON.stringify` produced. Typing them as `Date` would be a lie that only shows up
 *   when something calls a method on one.
 */

// ------------------------------------------------------------------ Envelopes

/** The single pagination envelope every list endpoint returns. */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  /** Rows matching the filters, ignoring pagination. */
  total: number;
  totalPages: number;
}

/** One failed field, as the validation middleware flattens it. */
export interface FieldFailure {
  field: string;
  messages: string[];
}

/** The body every failure returns, shaped by the server's one error middleware. */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: FieldFailure[];
}

// ----------------------------------------------------------------------- Auth

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  bio: string | null;
  avatarImage: string | null;
  role: Role;
  status: UserStatus;
  leaderboardOptIn: boolean;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

// ----------------------------------------------------------------- Challenges

export interface ChallengeSummary {
  id: string;
  title: string;
  description: string;
  category: ChallengeCategory;
  startDate: string;
  endDate: string;
  capacity: number;
  participantCount: number;
  isFull: boolean;
  hasEnded: boolean;
  pointsReward: number;
  coverImage: string | null;
  status: ChallengeStatus;
  rejectionReason: string | null;
  creator: { id: string; displayName: string };
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParticipationProgress {
  id: string;
  status: ParticipationStatus;
  joinedAt: string;
  completedAt: string | null;
  checkInCount: number;
  lastCheckInDate: string | null;
  /** Days in the challenge window — the number of check-ins that completes it. */
  requiredDays: number;
}

/** What a Creator sees for their own challenge's participants. */
export interface ParticipantProgress extends ParticipationProgress {
  participant: { id: string; displayName: string };
}

/** What a User sees in their own joined list. */
export interface JoinedChallenge extends ParticipationProgress {
  challenge: ChallengeSummary;
}

export interface CheckInResult {
  date: string;
  note: string | null;
  proofImage: string | null;
  pointsAwarded: number;
  completedChallenge: boolean;
  balance: number;
  progress: ParticipationProgress;
}

// --------------------------------------------------------------------- Habits

export interface StreakSummary {
  /** The run still in progress, or 0 if it has lapsed. */
  current: number;
  longest: number;
  lastCompletedOn: string | null;
}

export interface HabitSummary {
  id: string;
  name: string;
  description: string | null;
  category: HabitCategory;
  targetPerWeek: number;
  iconImage: string | null;
  isArchived: boolean;
  streak: StreakSummary;
  completionsThisWeek: number;
  createdAt: string;
  updatedAt: string;
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

// -------------------------------------------------------------------- Budgets

export interface BudgetGoalSummary {
  id: string;
  title: string;
  description: string | null;
  category: ExpenseCategory;
  /** The month this goal governs, as `2026-08`. */
  month: string;
  limitAmount: number;
  /** Derived by SQL on every read, never stored. */
  spentAmount: number;
  remainingAmount: number;
  isOverBudget: boolean;
  /** Percentage of the limit used, capped for display at 999. */
  usedPercent: number;
  /** The month has closed and the goal was met, so the bonus can be claimed. */
  adherenceClaimable: boolean;
  adherenceClaimed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MonthSummary {
  month: string;
  totalSpent: number;
  totalBudgeted: number;
  goals: BudgetGoalSummary[];
  /** Spending in categories with no goal for the month. */
  unbudgetedSpend: { category: ExpenseCategory; amount: number }[];
}

export interface AdherenceResult {
  goal: BudgetGoalSummary;
  pointsAwarded: number;
  balance: number;
}

// ------------------------------------------------------------------- Expenses

export interface ExpenseSummary {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  category: ExpenseCategory;
  spentOn: string;
  receiptImage: string | null;
  source: ExpenseSource;
  createdAt: string;
  updatedAt: string;
}

/** Totals across everything matching the filters, not just the page shown. */
export interface ExpenseTotals {
  matchingTotal: number;
  matchingCount: number;
}

export type ExpensePage = Page<ExpenseSummary> & ExpenseTotals;

// --------------------------------------------------------------------- Store

export interface CosmeticTheme {
  primary: string;
  accent: string;
  surface: string;
}

export interface RewardItemSummary {
  id: string;
  name: string;
  description: string;
  type: RewardItemType;
  pointsCost: number;
  stock: number;
  inStock: boolean;
  image: string | null;
  isActive: boolean;
  cosmeticTheme: CosmeticTheme | null;
  createdAt: string;
  updatedAt: string;
}

export interface RedemptionSummary {
  id: string;
  pointsSpent: number;
  voucherCode: string | null;
  redeemedAt: string;
  item: { id: string; name: string; type: RewardItemType; cosmeticTheme: CosmeticTheme | null };
}

export interface RedeemResult {
  redemption: RedemptionSummary;
  balance: number;
}

/** An Admin delete that hit a redeemed item deactivates it instead, and says so. */
export interface DeactivatedInstead {
  deleted: false;
  message: string;
}

// -------------------------------------------------------------------- Points

export interface LedgerEntry {
  id: string;
  amount: number;
  reason: PointsReason;
  description: string | null;
  createdAt: string;
}

export interface PointsBalance {
  balance: number;
}

// --------------------------------------------------------------------- Admin

export interface SystemSummary {
  users: {
    total: number;
    suspended: number;
    byRole: Record<Role, number>;
  };
  challenges: {
    total: number;
    byStatus: Record<ChallengeStatus, number>;
  };
  economy: {
    pointsAwarded: number;
    pointsSpent: number;
    redemptions: number;
  };
}
