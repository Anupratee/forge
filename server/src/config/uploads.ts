import fs from 'node:fs';
import path from 'node:path';
import { env } from './env';

/**
 * Where uploaded files live, as an absolute path.
 *
 * Resolved against the package root rather than `process.cwd()`, so `npm run dev` from `server/` and a
 * compiled `node dist/server.js` from anywhere both read and write the same directory. A relative path
 * that silently depends on the working directory produces images that exist for one launch method and
 * 404 for the other.
 */
export const UPLOADS_ROOT = path.isAbsolute(env.uploads.directory)
  ? env.uploads.directory
  : path.resolve(__dirname, '..', '..', env.uploads.directory);

/**
 * The URL prefix the API serves them under. Stored paths are relative to {@link UPLOADS_ROOT}, so the
 * database records `covers/abc.jpg` and never a host or a scheme — moving the API to another origin does
 * not invalidate every row.
 */
export const UPLOADS_URL_PREFIX = '/uploads';

/** Created at import time: Multer will not create a missing destination, it will fail the request. */
export function ensureUploadDirectories(): void {
  for (const subdirectory of ['covers', 'proofs', 'receipts']) {
    fs.mkdirSync(path.join(UPLOADS_ROOT, subdirectory), { recursive: true });
  }
}
