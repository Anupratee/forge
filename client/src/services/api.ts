import axios, { AxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import type { ApiErrorBody, FieldFailure } from '../types/api';

/**
 * The one axios instance, and the only place a base URL is configured.
 *
 * Requests go to a relative `/api`, which Vite's dev server proxies to the API. Nothing bakes an origin
 * into the bundle, so the same build works wherever it is served from.
 */
export const api: AxiosInstance = axios.create({
  baseURL: '/api',
  headers: { Accept: 'application/json' },
});

// ------------------------------------------------------------------- Token

const TOKEN_KEY = 'forge.token';

/**
 * Where the access token lives.
 *
 * `localStorage` rather than memory, so a refresh does not log the user out; the value is read back
 * through this module rather than being touched directly anywhere else, so there is one key and one
 * place that clears it.
 */
export const tokenStorage = {
  read(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  write(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear(): void {
    localStorage.removeItem(TOKEN_KEY);
  },
};

api.interceptors.request.use((config) => {
  const token = tokenStorage.read();
  if (token !== null) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * What to do when the API says the session is over.
 *
 * A callback rather than a direct call into React state or the router, because `services/` must not
 * depend on either — `AuthContext` registers itself here at mount. Without this the interceptor would
 * have to reach for `window.location`, which throws away the whole SPA to show a login form.
 */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

// ------------------------------------------------------------------- Errors

/**
 * A failed request, normalised.
 *
 * Every component that shows an error handles this one type, rather than picking apart an `AxiosError`
 * and guessing whether `response.data` has the shape it hopes for. `fieldErrors` is what a form needs to
 * put a message beside the input that caused it.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: FieldFailure[];

  constructor(status: number, code: string, message: string, fieldErrors: FieldFailure[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }

  /** The message for a field, if the server rejected that field. */
  messageFor(field: string): string | undefined {
    return this.fieldErrors.find((failure) => failure.field === field)?.messages.join(' ');
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiErrorBody).code === 'string' &&
    typeof (value as ApiErrorBody).message === 'string'
  );
}

/**
 * Turns every failure into an `ApiError`, including the ones that never reached the server.
 *
 * A network failure has no response and no body, so it gets status 0 and a message that says what
 * actually happened. Reporting "an unexpected error occurred" for an unreachable API sends someone
 * looking for a bug that is not there.
 */
function toApiError(error: AxiosError): ApiError {
  const { response } = error;

  if (response === undefined) {
    return new ApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach the server. Check that the API is running.',
    );
  }

  if (isApiErrorBody(response.data)) {
    return new ApiError(
      response.status,
      response.data.code,
      response.data.message,
      response.data.details ?? [],
    );
  }

  return new ApiError(
    response.status,
    'UNEXPECTED_RESPONSE',
    `Request failed (${response.status}).`,
  );
}

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (!(error instanceof AxiosError)) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }

    const apiError = toApiError(error);

    // 401 means the token is missing, expired, or names an account that is no longer allowed in — all
    // of which are resolved the same way. 403 is deliberately not included: the caller is known and
    // simply may not do this, so logging them out would be the wrong response to a correct answer.
    if (apiError.status === 401) {
      tokenStorage.clear();
      onUnauthorized?.();
    }

    return Promise.reject(apiError);
  },
);

// ------------------------------------------------------------------ Helpers

/** A query object with `undefined` entries dropped, so an unset filter is absent rather than `"undefined"`. */
export type QueryParams = Record<string, string | number | boolean | undefined>;

export function toParams(query: QueryParams): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(query).filter(
      (entry): entry is [string, string | number | boolean] => entry[1] !== undefined,
    ),
  );
}

/**
 * Builds a multipart body for the endpoints that accept an image.
 *
 * Only used when a file was actually chosen. Multer parses multipart and leaves every other field as a
 * string, which the DTOs already expect — they coerce with `@Type(() => Number)` because query strings
 * have the same property. Sending JSON when there is no file keeps the common case simple.
 */
export function toFormData(fields: object, file?: { name: string; value: File }) {
  const form = new FormData();

  // `object` rather than `Record<string, unknown>`: an interface without an index signature is not
  // assignable to that record type, which would exclude every DTO shape this is called with.
  for (const [key, value] of Object.entries(fields) as [string, unknown][]) {
    if (value !== undefined && value !== null) {
      form.append(key, String(value));
    }
  }

  if (file !== undefined) {
    form.append(file.name, file.value);
  }

  return form;
}

/** Uploaded images are stored as paths relative to the uploads root, never as URLs. */
export function uploadUrl(storedPath: string | null): string | undefined {
  return storedPath === null ? undefined : `/uploads/${storedPath}`;
}
