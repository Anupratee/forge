import { ApiError } from '../services/api';

/**
 * The one error state.
 *
 * It reads an `ApiError` rather than taking a pre-formatted string, because the server already
 * distinguishes "you may not do this" from "that does not exist" from "your input was wrong", and
 * flattening all three into "something went wrong" throws away the only useful part.
 *
 * A retry button appears only when retrying could plausibly help. Offering one on a 403 invites
 * someone to click it until they conclude the app is broken, when in fact it answered correctly.
 */
export function ErrorState({
  error,
  onRetry,
  title,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const apiError = error instanceof ApiError ? error : null;
  const heading = title ?? headingFor(apiError);
  const retryable = apiError === null || apiError.status === 0 || apiError.status >= 500;

  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
    >
      <h2 className="font-semibold">{heading}</h2>

      <p className="mt-1 text-sm">
        {apiError?.message ??
          (error instanceof Error ? error.message : 'An unexpected error occurred.')}
      </p>

      {apiError !== null && apiError.fieldErrors.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {apiError.fieldErrors.map((failure) => (
            <li key={failure.field}>
              <span className="font-medium">{failure.field}</span> — {failure.messages.join(' ')}
            </li>
          ))}
        </ul>
      )}

      {onRetry !== undefined && retryable && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40"
        >
          Try again
        </button>
      )}
    </div>
  );
}

function headingFor(error: ApiError | null): string {
  if (error === null) return 'Something went wrong';

  switch (error.status) {
    case 0:
      return 'Cannot reach the server';
    case 403:
      return 'Not allowed';
    case 404:
      return 'Not found';
    case 409:
      return 'That conflicts with something already recorded';
    case 429:
      return 'Too many attempts';
    default:
      return error.status >= 500 ? 'The server had a problem' : 'That request was rejected';
  }
}
