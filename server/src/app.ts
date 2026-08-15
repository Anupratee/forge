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
import { NotFoundError } from './utils/AppError';

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
  app.use(express.json({ limit: '1mb' }));

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
