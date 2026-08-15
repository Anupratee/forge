type Tone = 'forge' | 'success' | 'danger';

const FILLS: Record<Tone, string> = {
  forge: 'bg-forge-500',
  success: 'bg-emerald-500',
  danger: 'bg-red-500',
};

/**
 * A bar for the several places something is "x of y": check-ins against required days, spending against
 * a budget limit, completions against a weekly target.
 *
 * The fill is clamped at 100% while `percent` is reported as given, so going over a budget limit shows a
 * full red bar and the real number beside it rather than a bar that overflows its own track.
 */
export function ProgressBar({
  percent,
  tone = 'forge',
  label,
}: {
  percent: number;
  tone?: Tone;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
    >
      <div
        className={`h-full rounded-full transition-[width] ${FILLS[tone]}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
