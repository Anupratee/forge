import { Router } from 'express';
import { expenseController } from '../controllers/ExpenseController';
import { CreateExpenseDto, ExpenseQueryDto, UpdateExpenseDto } from '../dtos/ExpenseDto';
import { ConfirmImportDto } from '../dtos/ImportExpensesDto';
import { Role } from '../entities/User';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { uploadDocument, uploadImage } from '../middlewares/upload.middleware';
import { validateBody, validateQuery, validateUuidParam } from '../middlewares/validate.middleware';

/**
 * Expense routes. User-only, and every read is scoped to the caller inside the service.
 *
 * The receipt upload runs before `validateBody`, because Multer is what parses a multipart body.
 */
export const expenseRoutes = Router();

expenseRoutes.get(
  '/',
  authenticate,
  authorize(Role.USER),
  validateQuery(ExpenseQueryDto),
  expenseController.list,
);

expenseRoutes.post(
  '/',
  authenticate,
  authorize(Role.USER),
  uploadImage('receiptImage', 'receipts'),
  validateBody(CreateExpenseDto),
  expenseController.create,
);

/**
 * Import, in two steps that stay separate.
 *
 * The preview writes nothing — it parses and reports. The confirm writes, and re-validates every row it
 * is given rather than trusting the preview it handed out: the preview is a suggestion, not a token,
 * and the rows come back edited by design.
 *
 * Declared before `/:id` so the fixed segments are reachable.
 */
/** Cheap probe so the client knows whether to offer the AI route at all. */
expenseRoutes.get(
  '/import/options',
  authenticate,
  authorize(Role.USER),
  expenseController.importOptions,
);

expenseRoutes.post(
  '/import/csv',
  authenticate,
  authorize(Role.USER),
  uploadDocument('file', 'csv'),
  expenseController.previewCsv,
);

/**
 * Reads a statement PDF. 503 when no API key is configured — the feature switches itself off and the
 * client falls back to CSV, which is the specification's stated behaviour.
 */
expenseRoutes.post(
  '/import/statement',
  authenticate,
  authorize(Role.USER),
  uploadDocument('file', 'pdf'),
  expenseController.previewStatement,
);

expenseRoutes.post(
  '/import/confirm',
  authenticate,
  authorize(Role.USER),
  validateBody(ConfirmImportDto),
  expenseController.confirmImport,
);

expenseRoutes.get(
  '/:id',
  authenticate,
  authorize(Role.USER),
  validateUuidParam('id'),
  expenseController.getOne,
);

expenseRoutes.patch(
  '/:id',
  authenticate,
  authorize(Role.USER),
  validateUuidParam('id'),
  uploadImage('receiptImage', 'receipts'),
  validateBody(UpdateExpenseDto),
  expenseController.update,
);

expenseRoutes.delete(
  '/:id',
  authenticate,
  authorize(Role.USER),
  validateUuidParam('id'),
  expenseController.remove,
);
