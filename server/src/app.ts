import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env, isAiImportEnabled, isCacheEnabled } from './config/env';

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

  // Feature routes mount under /api from Phase 3 onward (the client's dev proxy forwards that
  // prefix), followed by the not-found and error middleware. Both must stay last: Express
  // matches in registration order.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ message: 'Route not found' });
  });

  return app;
}
