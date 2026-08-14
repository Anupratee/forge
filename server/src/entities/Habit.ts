import { Check, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import type { Relation } from 'typeorm';
import { AuditedEntity } from './AuditedEntity';
import { HabitCompletion } from './HabitCompletion';
import { User } from './User';

export enum HabitCategory {
  HEALTH = 'HEALTH',
  FITNESS = 'FITNESS',
  FINANCE = 'FINANCE',
  LEARNING = 'LEARNING',
  MINDFULNESS = 'MINDFULNESS',
  PRODUCTIVITY = 'PRODUCTIVITY',
}

/**
 * A personal, self-directed habit owned by a single User.
 *
 * Strictly private: no Creator or Admin endpoint exposes habits, which is a rule the specification
 * states outright and the service layer enforces on every read.
 *
 * Note what is *absent*: there is no points-per-completion column. Point values are policy owned by
 * `PointsService`, not data owned by the user — a user-settable reward on a self-created habit would
 * be an unlimited supply of points.
 */
@Entity('habits')
@Index('ix_habits_user_archived', ['userId', 'isArchived'])
@Check('ck_habits_target_per_week_range', '"target_per_week" BETWEEN 1 AND 7')
export class Habit extends AuditedEntity {
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'enum', enum: HabitCategory })
  category!: HabitCategory;

  /** How many days a week the user is aiming for — the habit's own limit, 1 through 7. */
  @Column({ type: 'int', default: 7 })
  targetPerWeek!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  iconImage!: string | null;

  /**
   * Archived instead of deleted once it has completions, so the ledger entries that reference those
   * completions keep pointing at something real.
   */
  @Column({ type: 'boolean', default: false })
  isArchived!: boolean;

  @ManyToOne(() => User, (user) => user.habits, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @OneToMany(() => HabitCompletion, (completion) => completion.habit)
  completions!: Relation<HabitCompletion>[];
}
