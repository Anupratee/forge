import express, {
  type ErrorRequestHandler,
  type Express,
  type Request,
  type Response,
} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env, isAiImportEnabled, isCacheEnabled } from './config/env';
import { ensureUploadDirectories, UPLOADS_ROOT, UPLOADS_URL_PREFIX } from './config/uploads';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { apiRouter } from './routes';
import { NotFoundError, PayloadTooLargeError, ValidationError } from './utils/AppError';

/**
 * The largest JSON body the API accepts.
 *
 * Generous enough for the biggest legitimate request — a confirmed expense import of several hundred
 * rows — and small enough that a body has to be deliberate to exceed it. Uploads do not pass through
 * here; Multer parses those, with its own limit from `MAX_UPLOAD_BYTES`.
 */
const JSON_BODY_LIMIT = '1mb';

/**
 * What `express.json()` refuses, and what to say about it.
 *
 * body-parser rejects a malformed or oversized body by emitting an error with a `type` — never an
 * `AppError`, so without this the error handler treats each one as a bug and answers 500. Malformed
 * JSON is a client mistake and deserves to be told as much, and a 500 in the log for it is noise that
 * hides real faults.
 */
const BODY_PARSER_FAILURES: Record<string, () => Error> = {
  'entity.parse.failed': () => new ValidationError('Request body is not valid JSON'),
  'entity.too.large': () =>
    new PayloadTooLargeError(`Request body must be no larger than ${JSON_BODY_LIMIT}`),
  'encoding.unsupported': () =>
    new ValidationError('Request body uses an unsupported content encoding'),
};

/**
 * Builds the Express application.
 *
 * This module deliberately does not listen on a port — `server.ts` owns the process lifecycle.
 * Keeping them apart means integration tests can import the app and drive it with supertest
 * without binding a socket.
 */
export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // Scoped to the parser, directly after it, for the same reason as the uploads handler below: how
  // body-parser reports a failure is knowledge that belongs beside body-parser, not in the shared
  // error handler.
  app.use(((error, _req, _res, next) => {
    const build = BODY_PARSER_FAILURES[(error as { type?: string }).type ?? ''];

    next(build === undefined ? error : build());
  }) satisfies ErrorRequestHandler);

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      environment: env.nodeEnv,
      features: {
        cache: isCacheEnabled,
        aiImport: isAiImportEnabled,
      },
    });
  });

  /**
   * Uploaded images, served read-only from disk.
   *
   * `express.static` resolves within the root it is given and rejects anything that escapes it, so a stored
   * path cannot be used to read outside the uploads directory. `index: false` because there is nothing to
   * list, and `dotfiles: 'ignore'` so no configuration file that ends up here is served.
   */
  ensureUploadDirectories();
  app.use(
    UPLOADS_URL_PREFIX,
    express.static(UPLOADS_ROOT, { index: false, dotfiles: 'ignore', fallthrough: false }),
  );

  /**
   * Translates a missing upload into a normal 404.
   *
   * `fallthrough: false` is what stops a request for a non-existent file continuing on to the rest of
   * the application, but it reports the miss by passing on a raw `ENOENT` — which the error handler
   * cannot recognise, so it becomes a logged 500. A referenced image that is simply gone is a
   * not-found, not a server fault, and it should neither alarm the logs nor tell the caller otherwise.
   *
   * Scoped to this mount and placed directly after it, so the knowledge of how `serve-static` reports a
   * miss stays next to the middleware that produces it rather than leaking into the shared handler.
   */
  app.use(UPLOADS_URL_PREFIX, ((error, req, _res, next) => {
    const status = (error as { statusCode?: number }).statusCode;

    next(status === 404 ? new NotFoundError(`No uploaded file at ${req.originalUrl}`) : error);
  }) satisfies ErrorRequestHandler);

  // Every feature route lives under /api, which is the prefix the client's dev proxy forwards.
  app.use('/api', apiRouter);

  // These two must stay last, in this order: Express matches in registration order, so anything
  // registered after the not-found handler would be unreachable, and the error handler only sees
  // what the handlers before it throw.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
