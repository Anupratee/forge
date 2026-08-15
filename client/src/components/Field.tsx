import { useId } from 'react';
import { toTitle } from '../utils/format';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

/**
 * Labelled form controls that can show the server's own rejection beside the input.
 *
 * The client does not re-implement the server's validation rules. `class-validator` DTOs are the single
 * definition of a valid request; duplicating "between 20 and 5000 characters" here would create a second
 * copy to keep in step, and the copy that mattered would still be the server's. What these do instead is
 * mark a field `required`, use the right input `type`, and render `error` — which comes from
 * `ApiError.messageFor(field)` after a rejected submit.
 */

const CONTROL =
  'w-full rounded-lg border px-3 py-2 text-sm shadow-sm outline-none transition-colors ' +
  'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 ' +
  'focus:border-forge-500 focus:ring-2 focus:ring-forge-500/30 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-100 ' +
  'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800';

const INVALID = 'border-red-400 focus:border-red-500 focus:ring-red-500/30';

function Shell({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-slate-700 dark:text-slate-300"
      >
        {label}
      </label>

      {children}

      {error !== undefined ? (
        <p id={`${htmlFor}-error`} className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : (
        hint !== undefined && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({
  label,
  error,
  hint,
  className = '',
  ...rest
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();

  return (
    <Shell label={label} htmlFor={id} error={error} hint={hint}>
      <input
        id={id}
        aria-invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        className={`${CONTROL} ${error === undefined ? '' : INVALID} ${className}`}
        {...rest}
      />
    </Shell>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  className = '',
  rows = 4,
  ...rest
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();

  return (
    <Shell label={label} htmlFor={id} error={error} hint={hint}>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        className={`${CONTROL} ${error === undefined ? '' : INVALID} ${className}`}
        {...rest}
      />
    </Shell>
  );
}

export function SelectField({
  label,
  error,
  hint,
  options,
  placeholder,
  className = '',
  ...rest
}: FieldProps &
  SelectHTMLAttributes<HTMLSelectElement> & {
    options: readonly string[];
    /** Shown as an empty-valued first option — used for "any category" filters. */
    placeholder?: string;
  }) {
  const id = useId();

  return (
    <Shell label={label} htmlFor={id} error={error} hint={hint}>
      <select
        id={id}
        aria-invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        className={`${CONTROL} ${error === undefined ? '' : INVALID} ${className}`}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {toTitle(option)}
          </option>
        ))}
      </select>
    </Shell>
  );
}
