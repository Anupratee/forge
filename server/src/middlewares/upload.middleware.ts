import crypto from 'node:crypto';
import path from 'node:path';
import type { RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { env } from '../config/env';
import { UPLOADS_ROOT } from '../config/uploads';
import { ValidationError } from '../utils/AppError';

/**
 * Image uploads: challenge covers, check-in proofs, expense receipts.
 *
 * Two rules matter here, and both are about not trusting the client:
 *
 * 1. **The stored filename is generated, never derived from the upload.** An original name can contain
 *    `../`, a null byte, or a second extension, all of which are ways to write outside the destination
 *    or to be served back as something executable.
 * 2. **The type is checked against both the declared MIME type and the extension.** Either alone is
 *    trivially spoofed; requiring them to agree raises the cost of getting a non-image accepted.
 */

const ALLOWED_TYPES = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

/** Where each kind of image is written, relative to {@link UPLOADS_ROOT}. */
export type UploadFolder = 'covers' | 'proofs' | 'receipts';

/**
 * Builds a single-file upload handler for one form field.
 *
 * The file is optional in every case it is used — a challenge without a cover image and a check-in
 * without proof are both valid — so a request carrying no file passes straight through.
 */
export function uploadImage(field: string, folder: UploadFolder): RequestHandler {
  const handler = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, done) => {
        done(null, path.join(UPLOADS_ROOT, folder));
      },
      filename: (_req, file, done) => {
        // The extension comes from the allow-list keyed by MIME type, not from the uploaded name.
        done(null, `${crypto.randomUUID()}${ALLOWED_TYPES.get(file.mimetype) ?? ''}`);
      },
    }),
    limits: {
      fileSize: env.uploads.maxBytes,
      // One file, one field, and no room for a request that is mostly padding.
      files: 1,
      fields: 20,
    },
    fileFilter: (_req, file, done) => {
      const expectedExtension = ALLOWED_TYPES.get(file.mimetype);
      const actualExtension = path.extname(file.originalname).toLowerCase();

      if (expectedExtension === undefined) {
        done(new ValidationError(`${file.mimetype} is not an accepted image type`));
        return;
      }

      // `.jpeg` and `.jpg` are the same image; anything else must agree with the declared type.
      const matches =
        actualExtension === expectedExtension ||
        (expectedExtension === '.jpg' && actualExtension === '.jpeg');

      if (!matches) {
        done(
          new ValidationError(`File extension ${actualExtension} does not match ${file.mimetype}`),
        );
        return;
      }

      done(null, true);
    },
  }).single(field);

  // Multer reports its own failures as MulterError, which would otherwise reach the error middleware as
  // an unknown throw and be reported as a 500 — a file over the size limit is the client's mistake, not
  // ours, and the response should say which limit was hit.
  return (req, res, next) => {
    handler(req, res, (error: unknown) => {
      next(error instanceof MulterError ? toValidationError(error) : error);
    });
  };
}

function toValidationError(error: MulterError): ValidationError {
  if (error.code === 'LIMIT_FILE_SIZE') {
    const megabytes = (env.uploads.maxBytes / (1024 * 1024)).toFixed(1);
    return new ValidationError(`The uploaded file exceeds the ${megabytes} MB limit`);
  }

  return new ValidationError(`Upload rejected: ${error.message}`);
}

/**
 * The path to record on the entity, or null when nothing was uploaded.
 *
 * Relative to the uploads root, so it stays valid if the API moves origin. `req.file` is typed as
 * possibly absent because the field is optional on every route that uses it.
 */
export function uploadedPath(
  file: Express.Multer.File | undefined,
  folder: UploadFolder,
): string | null {
  return file === undefined ? null : `${folder}/${file.filename}`;
}
