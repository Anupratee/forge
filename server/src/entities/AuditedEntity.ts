import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Identity and audit columns shared by every entity that changes after it is created.
 *
 * The class is abstract and carries no `@Entity`, so TypeORM copies its columns onto each concrete
 * table instead of creating a table of its own.
 *
 * Records that are never updated extend {@link AppendOnlyEntity} instead. An `updated_at` that can
 * only ever equal `created_at` is a lie about the data, and the ledger and the daily-log tables
 * depend on being read as immutable history.
 */
export abstract class AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
