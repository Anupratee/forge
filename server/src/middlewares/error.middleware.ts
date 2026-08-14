import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, NotFoundError } from '../utils/AppError';

/**
 * The one place an error becomes a response.
 *
 * Express 5 forwards a rejected promise from any handler here automatically, which is what allows
 * controllers and services to `throw` and contain no try/catch of their own.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.status).json({
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return;
  }

  // Anything else is a bug, not a client mistake. It is logged in full for us and reduced to a
  // generic message for the caller — an internal message or a stack trace can describe the schema,
  // the file layout, or a query, none of which a client should ever receive.
  console.error('Unhandled error while serving a request:', error);
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred.',
  });
};

/**
 * Terminal handler for unmatched routes.
 *
 * It throws rather than responding, so a 404 is shaped by `errorHandler` like every other failure and
 * the response format is defined once.
 */
export const notFoundHandler: RequestHandler = (req) => {
  throw new NotFoundError(`No route matches ${req.method} ${req.originalUrl}`);
};
