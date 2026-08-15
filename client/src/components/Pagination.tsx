import { Button } from './Button';

/**
 * Page controls driven by the server's envelope.
 *
 * `total` and `totalPages` come from the API, so this never guesses whether there is another page from
 * the length of what it was handed — a full page is not evidence of a next one.
 */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
  noun = 'result',
  nounPlural,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  /** Used in the count line — "12 challenges". */
  noun?: string;
  /** For nouns an appended "s" gets wrong: "entry" → "entries". */
  nounPlural?: string;
}) {
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 pt-2" aria-label="Pagination">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Showing {first}–{last} of {total} {total === 1 ? noun : (nounPlural ?? `${noun}s`)}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </Button>

        <span className="text-sm text-slate-600 dark:text-slate-400" aria-current="page">
          Page {page} of {totalPages}
        </span>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
