import { Router } from 'express';
import { adminController } from '../controllers/AdminController';
import { AdminUserQueryDto, UpdateUserRoleDto, UpdateUserStatusDto } from '../dtos/AdminUserDto';
import { Role } from '../entities/User';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validateBody, validateQuery, validateUuidParam } from '../middlewares/validate.middleware';

/**
 * Admin-only routes.
 *
 * `authenticate` then `authorize` in that order, on every route: there is nothing to authorize until
 * the caller is known. Applied per route rather than with `router.use` so each line states its own
 * requirements and adding an endpoint here cannot silently inherit — or silently miss — a guard.
 *
 * Account management is deliberately narrow: list, suspend or reactivate, change role. There is no
 * delete, because removing an account would orphan its ledger history and any challenges it created,
 * and no route that reads a user's habits, budgets, or expenses — those stay private to their owner
 * whatever an Admin is doing.
 */
export const adminRoutes = Router();

adminRoutes.get('/summary', authenticate, authorize(Role.ADMIN), adminController.summary);

adminRoutes.get(
  '/users',
  authenticate,
  authorize(Role.ADMIN),
  validateQuery(AdminUserQueryDto),
  adminController.listUsers,
);

adminRoutes.patch(
  '/users/:id/status',
  authenticate,
  authorize(Role.ADMIN),
  validateUuidParam('id'),
  validateBody(UpdateUserStatusDto),
  adminController.setStatus,
);

adminRoutes.patch(
  '/users/:id/role',
  authenticate,
  authorize(Role.ADMIN),
  validateUuidParam('id'),
  validateBody(UpdateUserRoleDto),
  adminController.setRole,
);
