import { plainToInstance } from 'class-transformer';
import { validate as runValidation } from 'class-validator';
import type { ValidationError as ClassValidatorError } from 'class-validator';
import type { RequestHandler } from 'express';
import { ValidationError } from '../utils/AppError';

/** A DTO class: constructible with no arguments, so `plainToInstance` can build one. */
type DtoClass<T> = new () => T;

/** One failed field, flattened into something a form can display next to an input. */
interface FieldFailure {
  field: string;
  messages: string[];
}

/**
 * Shape validation for a request body, applied at the route.
 *
 * This is the only shape check in the stack. Services downstream may assume the body matches its DTO
 * and validate only *business* invariants — that a challenge ends after it starts, that a balance
 * covers a purchase. Checking the same rule in both layers means two places to change and one to
 * forget.
 *
 * `whitelist` strips properties the DTO does not declare, so a client cannot smuggle an extra field
 * into anything the service later spreads — `role: "ADMIN"` on a registration, for instance.
 * `forbidNonWhitelisted` then reports the extra field instead of silently dropping it, which turns a
 * confusing "my change had no effect" into a clear 400.
 */
export function validate<T extends object>(Dto: DtoClass<T>): RequestHandler {
  return async (req, _res, next) => {
    const instance = plainToInstance(Dto, req.body);

    const failures = await runValidation(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
      // Rejects a body that is not an object at all, rather than validating an empty instance and
      // reporting every field as missing.
      forbidUnknownValues: true,
    });

    if (failures.length > 0) {
      throw new ValidationError('Request body failed validation', flatten(failures));
    }

    // Hand the controller the validated instance rather than the raw body: it has been stripped of
    // unknown properties and had its values transformed, and the raw body has not.
    req.body = instance;
    next();
  };
}

/**
 * class-validator reports failures as a tree, one node per property, nested for object properties.
 * Flattening to dotted paths keeps the response shape flat and predictable for a client.
 */
function flatten(failures: ClassValidatorError[], parentPath = ''): FieldFailure[] {
  return failures.flatMap((failure) => {
    const path = parentPath === '' ? failure.property : `${parentPath}.${failure.property}`;
    const messages = Object.values(failure.constraints ?? {});

    return [
      ...(messages.length > 0 ? [{ field: path, messages }] : []),
      ...flatten(failure.children ?? [], path),
    ];
  });
}
