import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import type { Relation } from 'typeorm';
import { AuditedEntity } from './AuditedEntity';
import { BudgetGoal } from './BudgetGoal';
import { Challenge } from './Challenge';
import { ChallengeParticipation } from './ChallengeParticipation';
import { Expense } from './Expense';
import { Habit } from './Habit';
import { PointsLedger } from './PointsLedger';
import { Redemption } from './Redemption';

/**
 * The three roles the platform recognises. An account holds exactly one of them for its lifetime,
 * except when an Admin deliberately changes it.
 *
 * String values rather than numbers: they appear in JWT payloads and in the database, and a role
 * that reads `CREATOR` in a token dump is worth more than one that reads `1`.
 */
export enum Role {
  ADMIN = 'ADMIN',
  CREATOR = 'CREATOR',
  USER = 'USER',
}

/**
 * Accounts are suspended, never deleted — a deletion would orphan ledger history and challenge
 * ownership, both of which must stay readable.
 */
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

@Entity('users')
export class User extends AuditedEntity {
  /** Stored lower-cased by the service layer, so the unique index is effectively case-insensitive. */
  @Index('uq_users_email', { unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  /**
   * bcrypt hash at cost 12 — always exactly 60 characters.
   *
   * `select: false` leaves it out of every `find` by default, so a hash cannot leak through a
   * controller that forgets to strip it. `AuthService` opts back in with `addSelect` for the one
   * comparison that needs it.
   */
  @Column({ type: 'varchar', length: 60, select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 80 })
  displayName!: string;

  @Column({ type: 'text', nullable: true })
  bio!: string | null;

  /** Relative path under the upload directory, not a URL — the API decides how to serve it. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  avatarImage!: string | null;

  @Index('ix_users_role')
  @Column({ type: 'enum', enum: Role })
  role!: Role;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status!: UserStatus;

  /** Leaderboards are opt-in for privacy; a user who never opts in is invisible to the ranking. */
  @Column({ type: 'boolean', default: false })
  leaderboardOptIn!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  /**
   * The one cosmetic reward currently applied to this profile, pointing at the redemption rather
   * than the store item: you can only wear what you actually bought, and a single column makes
   * "at most one cosmetic equipped" structural instead of a rule someone has to remember.
   *
   * The service still checks the redemption belongs to this user and is a cosmetic — the database
   * cannot express that across tables.
   */
  @ManyToOne(() => Redemption, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'equipped_redemption_id' })
  equippedRedemption!: Relation<Redemption> | null;

  @Column({ type: 'uuid', name: 'equipped_redemption_id', nullable: true })
  equippedRedemptionId!: string | null;

  // Inverse sides. Present because they document the relationship graph the specification
  // describes; services still query each repository directly rather than eager-loading through a
  // user, so nothing here implies a join.

  @OneToMany(() => Challenge, (challenge) => challenge.createdBy)
  createdChallenges!: Relation<Challenge>[];

  @OneToMany(() => ChallengeParticipation, (participation) => participation.user)
  participations!: Relation<ChallengeParticipation>[];

  @OneToMany(() => Habit, (habit) => habit.user)
  habits!: Relation<Habit>[];

  @OneToMany(() => BudgetGoal, (goal) => goal.user)
  budgetGoals!: Relation<BudgetGoal>[];

  @OneToMany(() => Expense, (expense) => expense.user)
  expenses!: Relation<Expense>[];

  @OneToMany(() => PointsLedger, (entry) => entry.user)
  ledgerEntries!: Relation<PointsLedger>[];

  @OneToMany(() => Redemption, (redemption) => redemption.user)
  redemptions!: Relation<Redemption>[];
}
