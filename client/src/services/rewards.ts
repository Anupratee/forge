import type {
  CosmeticTheme,
  DeactivatedInstead,
  Page,
  RedeemResult,
  RedemptionSummary,
  RewardItemSummary,
} from '../types/api';
import type { RewardItemType } from '../types/enums';
import type { QueryParams } from './api';
import { api, toParams } from './api';

export interface RewardQuery extends QueryParams {
  keyword?: string;
  type?: RewardItemType;
  maxPointsCost?: number;
  sortBy?: 'pointsCost' | 'name' | 'stock' | 'createdAt';
  sortDir?: 'ASC' | 'DESC';
  page?: number;
  pageSize?: number;
  /** In stock only — the store's definition of availability. */
  availableOnly?: boolean;
  /** Admin inventory only; the public store never returns inactive items. */
  includeInactive?: boolean;
}

export interface CreateRewardItemInput {
  name: string;
  description: string;
  type: RewardItemType;
  pointsCost: number;
  stock: number;
  cosmeticTheme?: CosmeticTheme;
}

export interface UpdateRewardItemInput {
  name?: string;
  description?: string;
  pointsCost?: number;
  stock?: number;
  isActive?: boolean;
  cosmeticTheme?: CosmeticTheme;
}

/**
 * Two views of the same table, kept as separate calls because they are separate endpoints: `/rewards` is
 * the shop a User browses, `/rewards/manage` is the Admin inventory. Neither inspects a role to decide
 * what to return, so the Admin-only filters cannot leak onto the public listing.
 */
export const rewardsApi = {
  // -------------------------------------------------------------------- Store

  async listStore(query: RewardQuery): Promise<Page<RewardItemSummary>> {
    const { data } = await api.get<Page<RewardItemSummary>>('/rewards', {
      params: toParams(query),
    });
    return data;
  },

  /** Spends points in a transaction that row-locks the buyer and the item. */
  async redeem(itemId: string): Promise<RedeemResult> {
    const { data } = await api.post<RedeemResult>(`/rewards/${itemId}/redeem`);
    return data;
  },

  async listRedemptions(query: QueryParams): Promise<Page<RedemptionSummary>> {
    const { data } = await api.get<Page<RedemptionSummary>>('/rewards/redemptions', {
      params: toParams(query),
    });
    return data;
  },

  // ---------------------------------------------------------------- Inventory

  async listForAdmin(query: RewardQuery): Promise<Page<RewardItemSummary>> {
    const { data } = await api.get<Page<RewardItemSummary>>('/rewards/manage', {
      params: toParams(query),
    });
    return data;
  },

  async create(input: CreateRewardItemInput): Promise<RewardItemSummary> {
    const { data } = await api.post<RewardItemSummary>('/rewards/manage', input);
    return data;
  },

  async update(id: string, input: UpdateRewardItemInput): Promise<RewardItemSummary> {
    const { data } = await api.patch<RewardItemSummary>(`/rewards/manage/${id}`, input);
    return data;
  },

  /**
   * Deletes the item, or deactivates it when somebody has already redeemed it.
   *
   * The server answers 204 for a real delete and 200 with an explanation for a deactivation, because
   * they are genuinely different outcomes. `null` here means it was deleted.
   */
  async remove(id: string): Promise<DeactivatedInstead | null> {
    const response = await api.delete<DeactivatedInstead | ''>(`/rewards/manage/${id}`);
    return response.status === 204 ? null : (response.data as DeactivatedInstead);
  },
};
