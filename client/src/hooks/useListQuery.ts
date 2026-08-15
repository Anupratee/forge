import { useCallback, useState } from 'react';

/**
 * Filter and pagination state for a list screen.
 *
 * The rule it exists to enforce is **changing a filter resets to page 1**. Without that, narrowing a
 * search while on page 3 asks the server for the third page of a two-page result and gets an empty list
 * back — which reads as "no matches" when there are plenty. Every list screen shares this behaviour
 * because they share this hook, rather than each remembering to reset.
 *
 * `page` is the one field that does not reset itself, since paging *is* the act of changing it.
 */
export function useListQuery<T extends { page?: number }>(initial: T) {
  const [query, setQuery] = useState<T>({ ...initial, page: initial.page ?? 1 });

  const setFilter = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setQuery((current) => ({ ...current, [key]: value, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setQuery((current) => ({ ...current, page }));
  }, []);

  const reset = useCallback(() => {
    setQuery({ ...initial, page: 1 });
    // `initial` is a literal at every call site, so it is a new object each render and cannot be a
    // dependency without resetting the callback constantly. It is only read when reset is invoked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { query, setFilter, setPage, reset };
}

/** Blank select and text inputs mean "no filter", which the API expresses as an absent parameter. */
export function orUndefined(value: string): string | undefined {
  return value === '' ? undefined : value;
}
