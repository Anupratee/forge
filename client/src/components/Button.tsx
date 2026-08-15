import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-forge-600 text-white hover:bg-forge-700 focus-visible:outline-forge-600',
  secondary:
    'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
  danger:
    'border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/50',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
};

const SIZES: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and disables the button — for a mutation that is in flight. */
  busy?: boolean;
  children: ReactNode;
}

/**
 * The one button.
 *
 * `busy` rather than a separate `disabled` for pending mutations: a form whose submit stays clickable
 * while the request is in flight is how a double check-in gets attempted. The server rejects the second
 * one on a unique constraint, but the user should not have to see that.
 *
 * `type` defaults to `button`. HTML's default is `submit`, which makes every unlabelled button inside a
 * form submit it — a footgun worth closing once here rather than remembering at each call site.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled === true || busy}
      aria-busy={busy}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {busy && (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
