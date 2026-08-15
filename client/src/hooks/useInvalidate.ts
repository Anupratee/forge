import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Marks cached data stale after a write.
 *
 * Every mutation in the application ends by naming what its write affected, and this is the one place
 * that knows how to act on those names. Keys nest, so passing a root like `queryKeys.habits.all`
 * invalidates every list and detail beneath it — which is almost always what is wanted, and is far
 * harder to get wrong than trying to name the exact page a changed row appears on.
 *
 * The returned promise resolves once the affected active queries have refetched, so a caller that
 * awaits it knows the screen is showing the new state.
 */
export function useInvalidate(): (...keys: readonly (readonly unknown[])[]) => Promise<void> {
  const queryClient = useQueryClient();

  return useCallback(
    async (...keys) => {
      await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
    [queryClient],
  );
}
