/**
 * The one loading state.
 *
 * Every screen uses this rather than writing its own spinner, so a slow list and a slow dashboard look
 * like the same application. `label` says what is loading — "Loading…" on its own tells a reader only
 * that something is happening.
 */
export function Loading({ label = 'Loading', rows }: { label?: string; rows?: number }) {
  // A list that knows how many rows it is about to show can hold their space instead of collapsing and
  // then pushing the page down when the data lands.
  if (rows !== undefined) {
    return (
      <div className="space-y-3" role="status" aria-busy="true" aria-label={`${label}…`}>
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="h-20 animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800/70"
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-12 text-slate-500 dark:text-slate-400"
      role="status"
      aria-busy="true"
    >
      <span className="border-forge-500 size-6 animate-spin rounded-full border-2 border-t-transparent" />
      <p className="text-sm">{label}…</p>
    </div>
  );
}
