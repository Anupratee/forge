import { Router } from 'express';
import { budgetController } from '../controllers/BudgetController';
import {
  BudgetQueryDto,
  CreateBudgetGoalDto,
  MonthQueryDto,
  UpdateBudgetGoalDto,
} from '../dtos/BudgetDto';
import { Role } from '../entities/User';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validateBody, validateQuery, validateUuidParam } from '../middlewares/validate.middleware';

/**
 * Budget goal routes. User-only throughout, for the same reason as habits — budget data is private.
 *
 * `/summary` is declared before `/:id` so it is not captured as an id.
 */
export const budgetRoutes = Router();

budgetRoutes.get(
  '/',
  authenticate,
  authorize(Role.USER),
  validateQuery(BudgetQueryDto),
  budgetController.list,
);

/** Everything the dashboard needs for one month in a single call. */
budgetRoutes.get(
  '/summary',
  authenticate,
  authorize(Role.USER),
  validateQuery(MonthQueryDto),
  budgetController.monthSummary,
);

budgetRoutes.post(
  '/',
  authenticate,
  authorize(Role.USER),
  validateBody(CreateBudgetGoalDto),
  budgetController.create,
);

budgetRoutes.get(
  '/:id',
  authenticate,
  authorize(Role.USER),
  validateUuidParam('id'),
  budgetController.getOne,
);

budgetRoutes.patch(
  '/:id',
  authenticate,
  authorize(Role.USER),
  validateUuidParam('id'),
  validateBody(UpdateBudgetGoalDto),
  budgetController.update,
);

budgetRoutes.delete(
  '/:id',
  authenticate,
  authorize(Role.USER),
  validateUuidParam('id'),
  budgetController.remove,
);

/**
 * Claims the staying-within-budget reward. A POST rather than something evaluated on a read, because it
 * mints points — a GET that quietly changes a balance is not something to build.
 */
budgetRoutes.post(
  '/:id/adherence-claim',
  authenticate,
  authorize(Role.USER),
  validateUuidParam('id'),
  budgetController.claimAdherence,
);
