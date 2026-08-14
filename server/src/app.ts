import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env, isAiImportEnabled, isCacheEnabled } from './config/env';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { apiRouter } from './routes';

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

  // Every feature route lives under /api, which is the prefix the client's dev proxy forwards.
  app.use('/api', apiRouter);

  // These two must stay last, in this order: Express matches in registration order, so anything
  // registered after the not-found handler would be unreachable, and the error handler only sees
  // what the handlers before it throw.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
