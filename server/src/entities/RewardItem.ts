import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { AuditedEntity } from './AuditedEntity';
import { User } from './User';

export enum RewardItemType {
  /** Applies a visible effect to the owner's profile once equipped. */
  COSMETIC = 'COSMETIC',
  /** A simulated voucher: consumed on redemption, nothing to equip. */
  VOUCHER = 'VOUCHER',
}

/**
 * Theme values a cosmetic applies when equipped.
 *
 * These are the CSS custom properties declared in `client/src/index.css`; the client overrides them
 * on `:root` for the equipped item. Kept as data so an Admin can add a new theme through the store
 * without a client release.
 */
export interface CosmeticTheme {
  primary: string;
  accent: string;
  surface: string;
}

/**
 * An item in the Admin-curated reward store.
 *
 * Items are deactivated rather than deleted: redemptions reference them, and a user's purchase
 * history must stay readable after the item leaves the store.
 */
@Entity('reward_items')
@Index('ix_reward_items_active_type', ['isActive', 'type'])
@Check('ck_reward_items_points_cost_positive', '"points_cost" > 0')
@Check('ck_reward_items_stock_non_negative', '"stock" >= 0')
export class RewardItem extends AuditedEntity {
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'enum', enum: RewardItemType })
  type!: RewardItemType;

  @Column({ type: 'int' })
  pointsCost!: number;

  /**
   * Remaining units. Decremented inside the same transaction that writes the redemption and the
   * ledger entry, so the store cannot oversell.
   */
  @Column({ type: 'int' })
  stock!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  image!: string | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  /** Set for `COSMETIC` items and null for vouchers. */
  @Column({ type: 'jsonb', nullable: true })
  cosmeticTheme!: CosmeticTheme | null;

  /** The Admin who added the item. Unidirectional: nothing reads the store from a user. */
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: Relation<User>;

  @Column({ type: 'uuid', name: 'created_by' })
  createdById!: string;
}
