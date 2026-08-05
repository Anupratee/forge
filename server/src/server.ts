import 'reflect-metadata';
import { createApp } from './app';
import { env } from './config/env';

/**
 * Process entry point: owns startup, the listening socket, and shutdown.
 *
 * The database connection is initialised here from Phase 2 onward, before the server starts
 * accepting traffic — a process that cannot reach its database should fail loudly at boot rather
 * than serve failing requests.
 */
function start(): void {
  const app = createApp();

  const server = app.listen(env.port, () => {
    console.info(`Forge API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = (signal: string): void => {
    console.info(`\n${signal} received — shutting down`);
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
