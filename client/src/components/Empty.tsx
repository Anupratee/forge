import type { ReactNode } from 'react';

/**
 * The one empty state.
 *
 * `filtered` is the distinction worth making: "you have no habits yet" and "no habits match this search"
 * are different situations with different remedies, and a list that shows the first when it means the
 * second reads as though the data has been lost.
 */
export function Empty({
  title,
  description,
  action,
  filtered = false,
}: {
  title: string;
  description?: string;
  /** A call to action — usually the button that creates the first one. */
  action?: ReactNode;
  filtered?: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700">
      <p className="text-3xl" aria-hidden="true">
        {filtered ? '🔍' : '✨'}
      </p>
      <h2 className="mt-3 font-semibold text-slate-800 dark:text-slate-200">{title}</h2>

      {description !== undefined && (
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}

      {action !== undefined && <div className="mt-5">{action}</div>}
    </div>
  );
}
