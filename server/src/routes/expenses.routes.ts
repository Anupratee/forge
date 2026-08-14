import { Router } from 'express';
import { expenseController } from '../controllers/ExpenseController';
import { CreateExpenseDto, ExpenseQueryDto, UpdateExpenseDto } from '../dtos/ExpenseDto';
import { Role } from '../entities/User';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { uploadImage } from '../middlewares/upload.middleware';
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
