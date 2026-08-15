import type { QueryParams } from './api';

/**
 * Every TanStack Query cache key, in one place.
 *
 * Invalidation is the reason this file exists. A mutation has to name what it invalidates, and if keys
 * are written inline at each call site then "which list does completing a habit refresh?" is answered by
 * grepping for string literals and hoping they match. Here it is answered by reading one file.
 *
 * The keys nest, so a prefix invalidates everything under it: `queryKeys.habits.all` clears both the
 * lists and the individual habits, which is what a mutation that changes a habit almost always wants.
 */
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },

  challenges: {
    all: ['challenges'] as const,
    browse: (query: QueryParams) => ['challenges', 'browse', query] as const,
    authored: (query: QueryParams) => ['challenges', 'authored', query] as const,
    pending: (query: QueryParams) => ['challenges', 'pending', query] as const,
    detail: (id: string) => ['challenges', 'detail', id] as const,
    participants: (id: string, query: QueryParams) =>
      ['challenges', 'participants', id, query] as const,
  },

  participations: {
    all: ['participations'] as const,
    joined: (query: QueryParams) => ['participations', 'joined', query] as const,
  },

  habits: {
    all: ['habits'] as const,
    list: (query: QueryParams) => ['habits', 'list', query] as const,
    detail: (id: string) => ['habits', 'detail', id] as const,
  },

  budgets: {
    all: ['budgets'] as const,
    list: (query: QueryParams) => ['budgets', 'list', query] as const,
    detail: (id: string) => ['budgets', 'detail', id] as const,
    month: (month: string | undefined) => ['budgets', 'month', month ?? 'current'] as const,
  },

  expenses: {
    all: ['expenses'] as const,
    list: (query: QueryParams) => ['expenses', 'list', query] as const,
    detail: (id: string) => ['expenses', 'detail', id] as const,
  },

  rewards: {
    all: ['rewards'] as const,
    store: (query: QueryParams) => ['rewards', 'store', query] as const,
    manage: (query: QueryParams) => ['rewards', 'manage', query] as const,
    redemptions: (query: QueryParams) => ['rewards', 'redemptions', query] as const,
  },

  points: {
    all: ['points'] as const,
    balance: ['points', 'balance'] as const,
    ledger: (query: QueryParams) => ['points', 'ledger', query] as const,
  },

  leaderboard: {
    all: ['leaderboard'] as const,
    list: (query: QueryParams) => ['leaderboard', 'list', query] as const,
  },

  admin: {
    all: ['admin'] as const,
    summary: ['admin', 'summary'] as const,
    users: (query: QueryParams) => ['admin', 'users', query] as const,
  },

  imports: {
    options: ['imports', 'options'] as const,
  },
} as const;
