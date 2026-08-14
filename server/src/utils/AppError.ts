/**
 * The error vocabulary services throw in.
 *
 * Services never touch `res`, so they cannot choose a status code directly. They throw one of these
 * instead, and `error.middleware.ts` is the single place that turns it into a response. That is what
 * keeps `res.status(400)` out of controllers and try/catch out of every handler.
 *
 * Anything thrown that is *not* an `AppError` is treated as a bug: the middleware logs it and returns
 * a generic 500, so an internal message or stack never reaches a client.
 */
export abstract class AppError extends Error {
  /** The HTTP status the error middleware responds with. */
  abstract readonly status: number;

  /**
   * A stable machine-readable code, so the client can branch on the failure without matching against
   * prose that may be reworded later.
   */
  abstract readonly code: string;

  constructor(
    message: string,
    /** Optional structured detail. Currently only field-level validation failures use it. */
    readonly details?: unknown,
  ) {
    super(message);
    // Without this the stack's first line reads "Error", which makes logs harder to scan.
    this.name = new.target.name;
  }
}

/** The request was understood but its shape or values are wrong. */
export class ValidationError extends AppError {
  readonly status = 400;
  readonly code = 'VALIDATION_FAILED';
}

/**
 * The caller is not authenticated, or no longer is — a missing or invalid token, wrong credentials,
 * or a suspended account.
 */
export class UnauthorizedError extends AppError {
  readonly status = 401;
  readonly code = 'UNAUTHORIZED';
}

/** The caller is authenticated but this action is not theirs to take. */
export class ForbiddenError extends AppError {
  readonly status = 403;
  readonly code = 'FORBIDDEN';
}

/**
 * The resource does not exist — or does exist but the caller has no right to know that.
 *
 * Preferring this over `ForbiddenError` for another user's private data is deliberate: a 403 confirms
 * the row exists, which is itself a leak when the resource is someone's habit or budget.
 */
export class NotFoundError extends AppError {
  readonly status = 404;
  readonly code = 'NOT_FOUND';
}

/** The request conflicts with current state: a duplicate email, a full challenge, an empty shelf. */
export class ConflictError extends AppError {
  readonly status = 409;
  readonly code = 'CONFLICT';
}
