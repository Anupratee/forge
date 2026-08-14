import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import type { Relation } from 'typeorm';
import { AppendOnlyEntity } from './AppendOnlyEntity';
import { Habit } from './Habit';

/**
 * A record that a habit was completed on a given day.
 *
 * Streaks are computed from these dates by a pure function rather than stored on the habit: a cached
 * streak has to be invalidated correctly on every insert, delete, and backfill, and a wrong streak
 * is a wrong points award. Derived from the log, it cannot drift.
 */
@Entity('habit_completions')
/** Same reasoning as `ChallengeCheckIn`: one completion per habit per day, enforced by the schema. */
@Unique('uq_habit_completion_habit_date', ['habitId', 'completedOn'])
export class HabitCompletion extends AppendOnlyEntity {
  @ManyToOne(() => Habit, (habit) => habit.completions, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'habit_id' })
  habit!: Relation<Habit>;

  @Column({ type: 'uuid', name: 'habit_id' })
  habitId!: string;

  /** `YYYY-MM-DD`. Streak arithmetic is calendar arithmetic, so it must not carry a timezone. */
  @Column({ type: 'date' })
  completedOn!: string;

  @Column({ type: 'text', nullable: true })
  note!: string | null;
}
