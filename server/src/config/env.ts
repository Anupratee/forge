import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Environment is parsed and validated exactly once, here, at boot.
 *
 * Everything downstream imports the typed `env` object, so `process.env.X!` never appears
 * anywhere else in the codebase. Every problem is collected and reported together — a misconfigured
 * setup should tell you all of what is wrong in one run, not one key per restart.
 */

// A single .env lives at the repo root so docker-compose and the server read the same file.
// Resolved from this file rather than the working directory, so it works under both
// `tsx src/server.ts` and `node dist/server.js`.
dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const PLACEHOLDER_SECRET = 'replace_me_with_a_long_random_string_at_least_32_chars';
const MIN_SECRET_LENGTH = 32;

const problems: string[] = [];

function read(key: string): string | undefined {
  const raw = process.env[key];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

function requiredString(key: string): string {
  const value = read(key);
  if (value === undefined) {
    problems.push(`${key} is required but missing or empty`);
    return '';
  }
  return value;
}

function optionalString(key: string, fallback: string): string {
  return read(key) ?? fallback;
}

/** Optional with no default — absent means the dependent feature switches itself off. */
function feature(key: string): string | null {
  return read(key) ?? null;
}

function requiredPort(key: string, fallback: number): number {
  const value = read(key);
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    problems.push(`${key} must be an integer between 1 and 65535 (got "${value}")`);
    return fallback;
  }
  return parsed;
}

function requiredBytes(key: string, fallback: number): number {
  const value = read(key);
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    problems.push(`${key} must be a positive integer (got "${value}")`);
    return fallback;
  }
  return parsed;
}

function nodeEnv(): 'development' | 'test' | 'production' {
  const value = optionalString('NODE_ENV', 'development');
  if (value === 'development' || value === 'test' || value === 'production') return value;

  problems.push(`NODE_ENV must be development, test, or production (got "${value}")`);
  return 'development';
}

function jwtSecret(): string {
  const value = requiredString('JWT_SECRET');
  if (value === PLACEHOLDER_SECRET) {
    problems.push('JWT_SECRET is still the placeholder from .env.example — generate a real secret');
  } else if (value !== '' && value.length < MIN_SECRET_LENGTH) {
    problems.push(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return value;
}

/**
 * A `jsonwebtoken` lifetime: bare seconds, or a number with a unit such as `7d` or `12h`.
 *
 * Validated here so a typo fails at boot rather than on the first login attempt. The library types
 * this option as a template-literal union of duration strings, which a value read from the
 * environment cannot satisfy at compile time — so `utils/jwt.ts` casts to it, and this check is what
 * makes that cast honest.
 */
function jwtExpiresIn(): string {
  const value = optionalString('JWT_EXPIRES_IN', '7d');
  if (!/^\d+(ms|s|m|h|d|w|y)?$/.test(value)) {
    problems.push(
      `JWT_EXPIRES_IN must be seconds or a duration like "7d" or "12h" (got "${value}")`,
    );
  }
  return value;
}

const parsed = {
  nodeEnv: nodeEnv(),
  port: requiredPort('PORT', 3000),
  corsOrigin: optionalString('CORS_ORIGIN', 'http://localhost:5173'),

  database: {
    host: optionalString('DB_HOST', 'localhost'),
    port: requiredPort('DB_PORT', 5432),
    name: requiredString('DB_NAME'),
    user: requiredString('DB_USER'),
    password: requiredString('DB_PASSWORD'),
  },

  jwt: {
    secret: jwtSecret(),
    expiresIn: jwtExpiresIn(),
  },

  uploads: {
    directory: optionalString('UPLOAD_DIR', 'uploads'),
    maxBytes: requiredBytes('MAX_UPLOAD_BYTES', 5 * 1024 * 1024),
  },

  // Optional integrations. Null means the feature is disabled, which is a supported state:
  // the app runs without Redis, and expense import falls back to manual and CSV entry.
  redisUrl: feature('REDIS_URL'),
  anthropicApiKey: feature('ANTHROPIC_API_KEY'),
} as const;

if (problems.length > 0) {
  const lines = problems.map((problem) => `  - ${problem}`).join('\n');
  console.error(
    `\nCannot start: the environment is not configured correctly.\n\n${lines}\n\n` +
      `Copy .env.example to .env at the repository root and fill in the values.\n`,
  );
  process.exit(1);
}

export const env = parsed;

export const isProduction = env.nodeEnv === 'production';
export const isTest = env.nodeEnv === 'test';

/** True when the AI statement-import feature has the credentials it needs. */
export const isAiImportEnabled = env.anthropicApiKey !== null;

/** True when the optional cache layer is configured. */
export const isCacheEnabled = env.redisUrl !== null;
