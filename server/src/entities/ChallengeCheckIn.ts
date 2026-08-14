import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import type { Relation } from 'typeorm';
import { AppendOnlyEntity } from './AppendOnlyEntity';
import { ChallengeParticipation } from './ChallengeParticipation';

/**
 * One dated proof-of-attendance record against a participation.
 *
 * Append-only: a check-in is a claim that something happened on a given day, and an editable one
 * would let a user rewrite history that has already been paid for in points.
 */
@Entity('challenge_check_ins')
/**
 * The double-award guard, in the database rather than in the service.
 *
 * An application-level "have they checked in today?" read is a race: two concurrent requests both
 * see nothing and both insert. This constraint makes the second insert fail, and because the
 * check-in row and its ledger entry are written in one transaction, a failed insert cannot leave
 * points behind.
 */
@Unique('uq_check_in_participation_date', ['participationId', 'checkInDate'])
export class ChallengeCheckIn extends AppendOnlyEntity {
  @ManyToOne(() => ChallengeParticipation, (participation) => participation.checkIns, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'participation_id' })
  participation!: Relation<ChallengeParticipation>;

  @Column({ type: 'uuid', name: 'participation_id' })
  participationId!: string;

  /** The day being claimed, as `YYYY-MM-DD`. See the note on `Challenge.startDate` for why. */
  @Column({ type: 'date' })
  checkInDate!: string;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  /** Optional uploaded proof; a relative path under the upload directory. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  proofImage!: string | null;
}
