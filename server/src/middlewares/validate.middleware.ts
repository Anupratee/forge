import { plainToInstance } from 'class-transformer';
import { validate as runValidation } from 'class-validator';
import type { ValidationError as ClassValidatorError } from 'class-validator';
import type { Request, RequestHandler } from 'express';
import { ValidationError } from '../utils/AppError';

/** A DTO class: constructible with no arguments, so `plainToInstance` can build one. */
type DtoClass<T> = new () => T;

/** A request whose body has already been validated into `T` by {@link validateBody}. */
export type BodyOf<T> = Request<Record<string, string>, unknown, T>;

/** One failed field, flattened into something a form can display next to an input. */
export interface FieldFailure {
  field: string;
  messages: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- the shape Express's types expect
  namespace Express {
    interface Request {
      /**
       * Set by {@link validateQuery}. Read it with {@link getQuery}.
       *
       * The validated query lives here rather than replacing `req.query`, because in Express 5 that is
       * a lazily-evaluated getter on the prototype and overwriting it is not something to rely on.
       */
      validatedQuery?: unknown;
    }
  }
}

/**
 * Shape validation for a request body, applied at the route.
 *
 * This and {@link validateQuery} are the only shape checks in the stack. Services downstream may assume
 * input matches its DTO and validate only *business* invariants — that a challenge ends after it starts,
 * that a balance covers a purchase. Checking one rule in both layers means two places to change and one
 * to forget.
 *
 * `whitelist` strips properties the DTO does not declare, so a client cannot smuggle an extra field into
 * anything a service later spreads — `role: "ADMIN"` on a registration, or `status: "APPROVED"` on a
 * challenge. `forbidNonWhitelisted` then reports the extra field instead of silently dropping it, which
 * turns a confusing "my change had no effect" into a clear 400.
 */
export function validateBody<T extends object>(Dto: DtoClass<T>): RequestHandler {
  return async (req, _res, next) => {
    // Hand the controller the validated instance rather than the raw body: it has been stripped of
    // unknown properties and had its values coerced, and the raw body has not.
    req.body = await toValidatedInstance(Dto, req.body);
    next();
  };
}

/**
 * Shape validation for the query string.
 *
 * Query values are always strings, so the DTOs coerce numbers and booleans with `@Type` and `@Transform`
 * before the validators run.
 */
export function validateQuery<T extends object>(Dto: DtoClass<T>): RequestHandler {
  return async (req, _res, next) => {
    req.validatedQuery = await toValidatedInstance(Dto, req.query);
    next();
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Rejects a route parameter that is not a UUID.
 *
 * Every primary key in the schema is a `uuid`, and PostgreSQL raises a syntax error when compared against
 * something that is not one. Without this, `GET /api/challenges/not-a-uuid` reaches the database and comes
 * back as an unhandled query failure and a generic 500, instead of a 400 that says what was wrong.
 */
export function validateUuidParam(name: string): RequestHandler {
  return (req, _res, next) => {
    // Typed as `unknown` deliberately: Express allows a parameter to be an array, and a regex test against
    // one would coerce it to a comma-joined string rather than rejecting it.
    const value: unknown = req.params[name];

    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      throw new ValidationError(`${name} must be a UUID`);
    }

    next();
  };
}

/**
 * Reads a validated `:id` route parameter.
 *
 * Express types parameters as possibly absent and possibly an array, and narrowing that at the top of every
 * controller would be noise. This is the same accessor pattern as {@link getAuth} and {@link getQuery}: the
 * route pairs `validateUuidParam('id')` with this, and forgetting the middleware produces a thrown `Error`
 * and a logged 500 rather than a value that is silently the wrong type.
 *
 * Typing the parameter through Express's own generics instead would require the params object to carry an
 * index signature, which drags the whole middleware chain into declaring one.
 */
export function pathId(req: Request): string {
  const value: unknown = req.params.id;

  if (typeof value !== 'string') {
    throw new Error(
      `Route ${req.method} ${req.originalUrl} reads :id but is not behind the validateUuidParam middleware`,
    );
  }

  return value;
}

/**
 * Reads the validated query.
 *
 * The cast is sound as long as a route pairs `validateQuery(Dto)` with `getQuery<Dto>` — the same
 * contract `req.body` relies on, and the reason both live beside each other in this module. A route that
 * forgets the middleware gets a thrown `Error` and a logged 500 rather than an object of undefineds.
 */
export function getQuery<T>(req: Request): T {
  if (req.validatedQuery === undefined) {
    throw new Error(
      `Route ${req.method} ${req.originalUrl} reads a validated query but is not behind the validateQuery middleware`,
    );
  }

  return req.validatedQuery as T;
}

async function toValidatedInstance<T extends object>(Dto: DtoClass<T>, raw: unknown): Promise<T> {
  const instance = plainToInstance(Dto, raw);

  const failures = await runValidation(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
    // Rejects input that is not an object at all, rather than validating an empty instance and
    // reporting every field as missing.
    forbidUnknownValues: true,
  });

  if (failures.length > 0) {
    throw new ValidationError('Request failed validation', flatten(failures));
  }

  return instance;
}

/**
 * class-validator reports failures as a tree, one node per property, nested for object properties.
 * Flattening to dotted paths keeps the response shape flat and predictable for a client.
 *
 * Exported because the import pipeline validates rows against the same DTOs and has to report their
 * failures in the same shape — a second flattener would let the two drift.
 */
export function flatten(failures: ClassValidatorError[], parentPath = ''): FieldFailure[] {
  return failures.flatMap((failure) => {
    const path = parentPath === '' ? failure.property : `${parentPath}.${failure.property}`;
    const messages = Object.values(failure.constraints ?? {});

    return [
      ...(messages.length > 0 ? [{ field: path, messages }] : []),
      ...flatten(failure.children ?? [], path),
    ];
  });
}
