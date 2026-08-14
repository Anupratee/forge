import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { AppendOnlyEntity } from './AppendOnlyEntity';
import { RewardItem } from './RewardItem';
import { User } from './User';

/**
 * A completed purchase from the reward store.
 *
 * Append-only, and `pointsCost` is copied onto the row rather than read back through the item: the
 * price a user actually paid must not change when an Admin re-prices the store.
 *
 * Whether a cosmetic redemption is currently *worn* is not stored here — see
 * `User.equippedRedemption`, which keeps this record immutable and makes "one cosmetic at a time" a
 * property of the schema.
 */
@Entity('redemptions')
@Index('ix_redemptions_user_created_at', ['userId', 'createdAt'])
@Check('ck_redemptions_points_spent_positive', '"points_spent" > 0')
export class Redemption extends AppendOnlyEntity {
  @ManyToOne(() => User, (user) => user.redemptions, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => RewardItem, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reward_item_id' })
  rewardItem!: Relation<RewardItem>;

  @Column({ type: 'uuid', name: 'reward_item_id' })
  rewardItemId!: string;

  /** The price at the moment of purchase, mirrored by a negative ledger entry of the same size. */
  @Column({ type: 'int' })
  pointsSpent!: number;

  /** Issued for `VOUCHER` items only; null for cosmetics. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  voucherCode!: string | null;
}
