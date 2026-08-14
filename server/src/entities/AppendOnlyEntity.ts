import { CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Identity and creation timestamp for records that are written once and never modified.
 *
 * Points ledger entries, habit completions, challenge check-ins, and redemptions are all events:
 * they record that something happened at a point in time. Correcting one means appending a
 * compensating record, not editing the original — which is what makes a balance derived from the
 * ledger trustworthy.
 */
export abstract class AppendOnlyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
