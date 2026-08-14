import type { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import type { ListQueryDto } from '../dtos/ListQueryDto';
import type {
  CreateRewardItemDto,
  RewardItemQueryDto,
  RewardSortField,
  UpdateRewardItemDto,
} from '../dtos/RewardItemDto';
import { PointsReason, PointsReferenceType } from '../entities/PointsLedger';
import { Redemption } from '../entities/Redemption';
import { RewardItem, RewardItemType } from '../entities/RewardItem';
import type { CosmeticTheme } from '../entities/RewardItem';
import type { AuthContext } from '../middlewares/auth.middleware';
import { ConflictError, NotFoundError, ValidationError } from '../utils/AppError';
import { toPage, toPageRequest } from '../utils/pagination';
import type { Page } from '../utils/pagination';
import { escapeLikePattern } from '../utils/sql';
import type { PointsService } from './PointsService';
import { pointsService } from './PointsService';

export interface RewardItemSummary {
  id: string;
  name: string;
  description: string;
  type: RewardItemType;
  pointsCost: number;
  stock: number;
  inStock: boolean;
  image: string | null;
  isActive: boolean;
  cosmeticTheme: CosmeticTheme | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RedemptionSummary {
  id: string;
  pointsSpent: number;
  voucherCode: string | null;
  redeemedAt: Date;
  item: { id: string; name: string; type: RewardItemType; cosmeticTheme: CosmeticTheme | null };
}

export interface RedeemResult {
  redemption: RedemptionSummary;
  balance: number;
}

const SORT_COLUMNS: Record<RewardSortField, string> = {
  pointsCost: 'item.pointsCost',
  name: 'item.name',
  stock: 'item.stock',
  createdAt: 'item.createdAt',
};

/**
 * The Admin-curated reward store, and redemption.
 *
 * Items are never deleted, only deactivated — redemptions reference them, and a user's purchase history has
 * to stay readable after an item leaves the shelf.
 */
export class RewardService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly pointsService: PointsService,
  ) {}

  private get items(): Repository<RewardItem> {
    return this.dataSource.getRepository(RewardItem);
  }

  private get redemptions(): Repository<Redemption> {
    return this.dataSource.getRepository(Redemption);
  }

  // ------------------------------------------------------------------- Admin

  async create(actor: AuthContext, input: CreateRewardItemDto): Promise<RewardItemSummary> {
    assertThemeMatchesType(input.type, input.cosmeticTheme);

    const item = await this.items.save(
      this.items.create({
        name: input.name.trim(),
        description: input.description,
        type: input.type,
        pointsCost: input.pointsCost,
        stock: input.stock,
        cosmeticTheme: input.cosmeticTheme ?? null,
        createdById: actor.userId,
      }),
    );

    return toItemSummary(item);
  }

  async update(id: string, input: UpdateRewardItemDto): Promise<RewardItemSummary> {
    const item = await this.findItemOrFail(id);

    // Validated against the item's existing type, which the update DTO cannot change.
    if (input.cosmeticTheme !== undefined) {
      assertThemeMatchesType(item.type, input.cosmeticTheme);
    }

    if (input.name !== undefined) item.name = input.name.trim();
    if (input.description !== undefined) item.description = input.description;
    if (input.pointsCost !== undefined) item.pointsCost = input.pointsCost;
    if (input.stock !== undefined) item.stock = input.stock;
    if (input.isActive !== undefined) item.isActive = input.isActive;
    if (input.cosmeticTheme !== undefined) item.cosmeticTheme = input.cosmeticTheme;

    await this.items.save(item);
    return toItemSummary(item);
  }

  /**
   * Deactivates an item, or deletes it outright if nobody has ever redeemed it.
   *
   * A redeemed item cannot be deleted: the foreign key is RESTRICT, and a user's history should not vanish
   * because an Admin tidied the store. Deactivating removes it from the shelf and leaves the history intact.
   */
  async remove(id: string): Promise<{ deleted: boolean }> {
    const item = await this.findItemOrFail(id);
    const redemptions = await this.redemptions.countBy({ rewardItemId: id });

    if (redemptions > 0) {
      item.isActive = false;
      item.stock = 0;
      await this.items.save(item);
      return { deleted: false };
    }

    await this.items.delete(id);
    return { deleted: true };
  }

  /** The Admin view: includes deactivated items when asked for. */
  async listForAdmin(query: RewardItemQueryDto): Promise<Page<RewardItemSummary>> {
    const builder = this.baseQuery(query);

    if (query.includeInactive !== true) {
      builder.andWhere('item.isActive = true');
    }

    return this.paginate(builder, query);
  }

  // -------------------------------------------------------------------- User

  /**
   * The store, as a User sees it: active items only.
   *
   * `availableOnly` means in stock here — the per-resource definition of availability from the shared
   * search contract.
   */
  async listStore(query: RewardItemQueryDto): Promise<Page<RewardItemSummary>> {
    const builder = this.baseQuery(query).andWhere('item.isActive = true');

    if (query.availableOnly === true) {
      builder.andWhere('item.stock > 0');
    }

    return this.paginate(builder, query);
  }

  /**
   * Buys an item.
   *
   * One transaction covering four writes that must agree: the balance check, the ledger entry, the stock
   * decrement, and the redemption row. Any of them landing without the others would either give away an item
   * or charge for one the user did not get.
   *
   * Both rows are locked, and the order matters — the item first, then the user inside `spend`. Every
   * redemption takes them in that order, so two concurrent redemptions cannot each hold what the other wants.
   */
  async redeem(actor: AuthContext, itemId: string): Promise<RedeemResult> {
    const redemptionId = await this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(RewardItem, {
        where: { id: itemId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!item || !item.isActive) {
        // An inactive item is reported as absent: it is not on the shelf, and saying "this exists but is
        // withdrawn" tells a User about store administration that is not theirs.
        throw new NotFoundError('No reward item with that id');
      }

      if (item.stock <= 0) {
        throw new ConflictError(`${item.name} is out of stock`);
      }

      const redemption = await manager.save(
        manager.create(Redemption, {
          userId: actor.userId,
          rewardItemId: item.id,
          // Copied onto the row, so re-pricing the store later cannot rewrite what this user paid.
          pointsSpent: item.pointsCost,
          voucherCode: item.type === RewardItemType.VOUCHER ? generateVoucherCode() : null,
        }),
      );

      // Throws ConflictError if the balance does not cover it, which rolls back everything above — so a
      // failed purchase leaves no redemption row and no stock change.
      await this.pointsService.spend(manager, {
        userId: actor.userId,
        amount: item.pointsCost,
        reason: PointsReason.REDEMPTION,
        referenceType: PointsReferenceType.REDEMPTION,
        referenceId: redemption.id,
        description: `Redeemed ${item.name}`,
      });

      await manager.decrement(RewardItem, { id: item.id }, 'stock', 1);

      return redemption.id;
    });

    return {
      redemption: await this.getRedemption(actor, redemptionId),
      balance: await this.pointsService.getBalance(actor.userId),
    };
  }

  /** The caller's own purchase history. */
  async listRedemptions(actor: AuthContext, query: ListQueryDto): Promise<Page<RedemptionSummary>> {
    const request = toPageRequest(query);

    const [redemptions, total] = await this.redemptions
      .createQueryBuilder('redemption')
      .innerJoinAndSelect('redemption.rewardItem', 'item')
      .where('redemption.userId = :userId', { userId: actor.userId })
      .orderBy('redemption.createdAt', query.sortDir ?? 'DESC')
      .addOrderBy('redemption.id', 'ASC')
      .skip(request.skip)
      .take(request.take)
      .getManyAndCount();

    return toPage(redemptions.map(toRedemptionSummary), total, request);
  }

  async getRedemption(actor: AuthContext, id: string): Promise<RedemptionSummary> {
    const redemption = await this.redemptions.findOne({
      where: { id, userId: actor.userId },
      relations: { rewardItem: true },
    });

    if (!redemption) {
      throw new NotFoundError('No redemption with that id');
    }

    return toRedemptionSummary(redemption);
  }

  // ---------------------------------------------------------------- Internal

  private baseQuery(query: RewardItemQueryDto): SelectQueryBuilder<RewardItem> {
    const builder = this.items.createQueryBuilder('item');

    if (query.keyword !== undefined) {
      builder.andWhere('(item.name ILIKE :keyword OR item.description ILIKE :keyword)', {
        keyword: `%${escapeLikePattern(query.keyword)}%`,
      });
    }

    if (query.type !== undefined) {
      builder.andWhere('item.type = :type', { type: query.type });
    }

    if (query.maxPointsCost !== undefined) {
      builder.andWhere('item.pointsCost <= :maxPointsCost', { maxPointsCost: query.maxPointsCost });
    }

    if (query.dateFrom !== undefined) {
      builder.andWhere('item.createdAt >= :dateFrom::date', { dateFrom: query.dateFrom });
    }
    if (query.dateTo !== undefined) {
      builder.andWhere('item.createdAt < (:dateTo::date + 1)', { dateTo: query.dateTo });
    }

    return builder;
  }

  private async paginate(
    builder: SelectQueryBuilder<RewardItem>,
    query: RewardItemQueryDto,
  ): Promise<Page<RewardItemSummary>> {
    const request = toPageRequest(query);

    const [items, total] = await builder
      .orderBy(SORT_COLUMNS[query.sortBy ?? 'pointsCost'], query.sortDir ?? 'ASC')
      .addOrderBy('item.id', 'ASC')
      .skip(request.skip)
      .take(request.take)
      .getManyAndCount();

    return toPage(items.map(toItemSummary), total, request);
  }

  private async findItemOrFail(id: string): Promise<RewardItem> {
    const item = await this.items.findOneBy({ id });

    if (!item) {
      throw new NotFoundError('No reward item with that id');
    }

    return item;
  }
}

/**
 * A cosmetic needs a theme to apply and a voucher has nothing to wear.
 *
 * A cross-field rule, so it belongs to the service: class-validator would need a custom decorator to see
 * both fields, and this way the same check covers creation and editing.
 */
function assertThemeMatchesType(type: RewardItemType, theme: unknown): void {
  if (type === RewardItemType.COSMETIC && theme === undefined) {
    throw new ValidationError('A cosmetic item needs a cosmeticTheme for the client to apply');
  }

  if (type === RewardItemType.VOUCHER && theme !== undefined) {
    throw new ValidationError('A voucher cannot carry a cosmeticTheme — there is nothing to equip');
  }
}

/**
 * A readable simulated voucher code.
 *
 * Not security-bearing: these vouchers are simulated, and the code is a label a user can read back. The
 * ambiguous characters are left out so it can be transcribed without confusion.
 */
function generateVoucherCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const body = Array.from(
    { length: 10 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)] ?? 'A',
  ).join('');

  return `FORGE-${body}`;
}

function toItemSummary(item: RewardItem): RewardItemSummary {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    type: item.type,
    pointsCost: item.pointsCost,
    stock: item.stock,
    inStock: item.stock > 0,
    image: item.image,
    isActive: item.isActive,
    cosmeticTheme: item.cosmeticTheme,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toRedemptionSummary(redemption: Redemption): RedemptionSummary {
  return {
    id: redemption.id,
    pointsSpent: redemption.pointsSpent,
    voucherCode: redemption.voucherCode,
    // `createdAt` on an append-only row is when it happened.
    redeemedAt: redemption.createdAt,
    item: {
      id: redemption.rewardItem.id,
      name: redemption.rewardItem.name,
      type: redemption.rewardItem.type,
      cosmeticTheme: redemption.rewardItem.cosmeticTheme,
    },
  };
}

export const rewardService = new RewardService(AppDataSource, pointsService);
