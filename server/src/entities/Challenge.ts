import { Check, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import type { Relation } from 'typeorm';
import { AuditedEntity } from './AuditedEntity';
import { ChallengeParticipation } from './ChallengeParticipation';
import { User } from './User';

/** Browsable category, and the value the `category` search filter matches against. */
export enum ChallengeCategory {
  ART = 'ART',
  FITNESS = 'FITNESS',
  FINANCE = 'FINANCE',
  LEARNING = 'LEARNING',
  WELLNESS = 'WELLNESS',
  PRODUCTIVITY = 'PRODUCTIVITY',
}

/**
 * The challenge lifecycle. Legal transitions and who may perform them live in exactly one place —
 * `services/ChallengeStateMachine.ts` — so "a Creator cannot self-approve" and "a material edit to
 * an approved challenge re-enters PENDING_APPROVAL" are not reimplemented per endpoint.
 *
 * Only `APPROVED` is ever visible to a User.
 */
export enum ChallengeStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ENDED = 'ENDED',
}

/**
 * The core domain entity: a Creator-owned, Admin-approved, time-boxed activity that Users join and
 * complete through daily check-ins.
 *
 * Column names follow the specification's attribute table exactly, so the generated schema can be
 * read against it.
 */
@Entity('challenges')
// Users browse approved challenges filtered by category; Admins read the pending queue. Both are
// covered by leading with status.
@Index('ix_challenges_status_category', ['status', 'category'])
@Index('ix_challenges_created_by', ['createdById'])
@Check('ck_challenges_date_window', '"end_date" > "start_date"')
@Check('ck_challenges_capacity_positive', '"capacity" > 0')
@Check('ck_challenges_points_reward_non_negative', '"points_reward" >= 0')
export class Challenge extends AuditedEntity {
  @Column({ type: 'varchar', length: 140 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'enum', enum: ChallengeCategory })
  category!: ChallengeCategory;

  /**
   * Calendar dates, deliberately typed as `string` rather than `Date`.
   *
   * A `date` column has no time and no zone; mapping it to `Date` would attach both and shift the
   * day for anyone east or west of UTC. Check-ins are keyed by day, so that shift would be a
   * correctness bug. The value is always `YYYY-MM-DD`.
   */
  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date' })
  endDate!: string;

  /** Maximum participants. Enforced on join against a live count, never a cached one. */
  @Column({ type: 'int' })
  capacity!: number;

  @Column({ type: 'int' })
  pointsReward!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  coverImage!: string | null;

  @Column({ type: 'enum', enum: ChallengeStatus, default: ChallengeStatus.DRAFT })
  status!: ChallengeStatus;

  /** Required when an Admin rejects, and shown to the Creator so the resubmission can address it. */
  @Column({ type: 'text', nullable: true })
  rejectionReason!: string | null;

  /**
   * Ownership (Role Type A). `RESTRICT` because a Creator account is suspended rather than deleted;
   * losing the owner would leave a challenge nobody can administer.
   */
  @ManyToOne(() => User, (user) => user.createdChallenges, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: Relation<User>;

  /**
   * The owner's id, alongside the relation and mapped to the same column.
   *
   * Every ownership check in `ChallengeService` is `challenge.createdById !== actorId`, which needs
   * no join. Writes assign this id; the relation property is for reads.
   */
  @Column({ type: 'uuid', name: 'created_by' })
  createdById!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by' })
  approvedBy!: Relation<User> | null;

  @Column({ type: 'uuid', name: 'approved_by', nullable: true })
  approvedById!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @OneToMany(() => ChallengeParticipation, (participation) => participation.challenge)
  participations!: Relation<ChallengeParticipation>[];
}
