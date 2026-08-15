import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../services/auth';
import type { UpdateProfileRequest } from '../services/auth';
import { queryKeys } from '../services/queryKeys';
import type { PublicUser } from '../types/api';
import { useInvalidate } from './useInvalidate';

/**
 * Updates the caller's own profile — display name, bio, and the leaderboard opt-in.
 *
 * The response *is* the new session profile, so it is written straight into the auth cache rather than
 * invalidated: `useAuth` reads that key, so the navigation and every role check update in the same
 * tick instead of flickering through a refetch.
 *
 * The leaderboard is invalidated as well, because opting in or out changes who the ranking contains —
 * on the server it changes which rows the query selects at all, not merely what is rendered.
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (request: UpdateProfileRequest) => authApi.updateMe(request),
    onSuccess: async (user: PublicUser) => {
      queryClient.setQueryData(queryKeys.auth.me, user);
      await invalidate(queryKeys.leaderboard.all);
    },
  });
}
