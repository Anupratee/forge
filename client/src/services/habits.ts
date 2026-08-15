import type { CompletionResult, HabitSummary, Page } from '../types/api';
import type { HabitCategory } from '../types/enums';
import type { QueryParams } from './api';
import { api, toParams } from './api';

export interface HabitQuery extends QueryParams {
  keyword?: string;
  category?: HabitCategory;
  sortBy?: 'name' | 'category' | 'createdAt' | 'targetPerWeek';
  sortDir?: 'ASC' | 'DESC';
  page?: number;
  pageSize?: number;
  includeArchived?: boolean;
}

export interface CreateHabitInput {
  name: string;
  description?: string;
  category: HabitCategory;
  targetPerWeek?: number;
}

export interface UpdateHabitInput {
  name?: string;
  description?: string;
  category?: HabitCategory;
  targetPerWeek?: number;
  isArchived?: boolean;
}

export interface CompleteHabitInput {
  /** Defaults to today on the server. Supplying it is how a missed day gets backfilled. */
  date?: string;
  note?: string;
}

/**
 * Habits are private to their owner. There is no Admin or Creator variant of any of these calls,
 * because the API exposes none — every route is `authorize(Role.USER)` and scoped to the caller.
 */
export const habitsApi = {
  async list(query: HabitQuery): Promise<Page<HabitSummary>> {
    const { data } = await api.get<Page<HabitSummary>>('/habits', { params: toParams(query) });
    return data;
  },

  async getOne(id: string): Promise<HabitSummary> {
    const { data } = await api.get<HabitSummary>(`/habits/${id}`);
    return data;
  },

  async create(input: CreateHabitInput): Promise<HabitSummary> {
    const { data } = await api.post<HabitSummary>('/habits', input);
    return data;
  },

  async update(id: string, input: UpdateHabitInput): Promise<HabitSummary> {
    const { data } = await api.patch<HabitSummary>(`/habits/${id}`, input);
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/habits/${id}`);
  },

  /** Records a completion and pays for it. A POST, because it mints points. */
  async complete(id: string, input: CompleteHabitInput = {}): Promise<CompletionResult> {
    const { data } = await api.post<CompletionResult>(`/habits/${id}/completions`, input);
    return data;
  },
};
