import 'reflect-metadata';
import { createApp } from './app';
import { AppDataSource } from './config/data-source';
import { env } from './config/env';

/**
 * Process entry point: owns startup, the listening socket, and shutdown.
 *
 * The database connection is established before the server accepts traffic. A process that cannot
 * reach its database should fail loudly at boot rather than come up healthy and then fail every
 * request that touches a repository.
 */
async function start(): Promise<void> {
  await AppDataSource.initialize();
  console.info('Database connection established');

  const app = createApp();

  const server = app.listen(env.port, () => {
    console.info(`Forge API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = (signal: string): void => {
    console.info(`\n${signal} received — shutting down`);

    // Stop accepting connections first, then release the pool. Closing the pool while a request is
    // still in flight would fail that request instead of letting it finish.
    server.close(() => {
      void AppDataSource.destroy().then(() => process.exit(0));
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void start().catch((error: unknown) => {
  console.error('Failed to start the Forge API:', error);
  process.exit(1);
});
