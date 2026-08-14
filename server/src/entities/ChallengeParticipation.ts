import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, Unique } from 'typeorm';
import type { Relation } from 'typeorm';
import { AuditedEntity } from './AuditedEntity';
import { Challenge } from './Challenge';
import { ChallengeCheckIn } from './ChallengeCheckIn';
import { User } from './User';

export enum ParticipationStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  WITHDRAWN = 'WITHDRAWN',
}

/**
 * The join entity between a User and a Challenge, and the thing daily check-ins hang off.
 *
 * It is a record in its own right rather than a plain many-to-many table: it carries status,
 * completion, and the check-in history, and it is the unit a Creator is allowed to see progress for
 * on their own challenges.
 */
@Entity('challenge_participations')
// One participation per user per challenge. Enforced by the database, so a double-tap on "join"
// cannot create two rows and inflate the participant count against capacity.
@Unique('uq_participation_challenge_user', ['challengeId', 'userId'])
@Index('ix_participation_user_status', ['userId', 'status'])
export class ChallengeParticipation extends AuditedEntity {
  @ManyToOne(() => Challenge, (challenge) => challenge.participations, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'challenge_id' })
  challenge!: Relation<Challenge>;

  @Column({ type: 'uuid', name: 'challenge_id' })
  challengeId!: string;

  @ManyToOne(() => User, (user) => user.participations, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'enum', enum: ParticipationStatus, default: ParticipationStatus.ACTIVE })
  status!: ParticipationStatus;

  /** Set once the completion criteria are met; the completion award references this row. */
  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  /** `createdAt` from the base class is the moment the user joined. */
  @OneToMany(() => ChallengeCheckIn, (checkIn) => checkIn.participation)
  checkIns!: Relation<ChallengeCheckIn>[];
}
