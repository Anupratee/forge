import { Router } from 'express';
import { habitController } from '../controllers/HabitController';
import { CompleteHabitDto, CreateHabitDto, HabitQueryDto, UpdateHabitDto } from '../dtos/HabitDto';
import { Role } from '../entities/User';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validateBody, validateQuery, validateUuidParam } from '../middlewares/validate.middleware';

/**
 * Habit routes.
 *
 * Every one is `authorize(Role.USER)`. Habits are personal, and the specification is explicit that no
 * Creator or Admin route may expose them — so there is no Admin variant of any of these, not even a
 * read-only one, and the service scopes each query to the caller besides.
 */
export const habitRoutes = Router();

habitRoutes.get(
  '/',
  authenticate,
  authorize(Role.USER),
  validateQuery(HabitQueryDto),
  habitController.list,
);

habitRoutes.post(
  '/',
  authenticate,
  authorize(Role.USER),
  validateBody(CreateHabitDto),
  habitController.create,
);

habitRoutes.get(
  '/:id',
  authenticate,
  authorize(Role.USER),
  validateUuidParam('id'),
  habitController.getOne,
);

habitRoutes.patch(
  '/:id',
  authenticate,
  authorize(Role.USER),
  validateUuidParam('id'),
  validateBody(UpdateHabitDto),
  habitController.update,
);

habitRoutes.delete(
  '/:id',
  authenticate,
  authorize(Role.USER),
  validateUuidParam('id'),
  habitController.remove,
);

/** Records a completion for a day and pays for it. */
habitRoutes.post(
  '/:id/completions',
  authenticate,
  authorize(Role.USER),
  validateUuidParam('id'),
  validateBody(CompleteHabitDto),
  habitController.complete,
);
