import { Router } from 'express';
import { rewardController } from '../controllers/RewardController';
import { ListQueryDto } from '../dtos/ListQueryDto';
import {
  CreateRewardItemDto,
  RewardItemQueryDto,
  UpdateRewardItemDto,
} from '../dtos/RewardItemDto';
import { Role } from '../entities/User';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validateBody, validateQuery, validateUuidParam } from '../middlewares/validate.middleware';

/**
 * Reward store routes.
 *
 * Two views of the same table, deliberately separate paths rather than one endpoint that behaves differently
 * by role: `/` is the shop a User browses (active items only), `/manage` is the Admin's inventory. Splitting
 * them means neither has to inspect the caller's role to decide what to return, and the Admin-only filters
 * cannot leak onto the public listing.
 *
 * `/manage` and `/redemptions` precede `/:id` so they are not captured as ids.
 */
export const rewardRoutes = Router();

// --------------------------------------------------------------------- Store

/** `availableOnly=true` means in stock, the store's definition of availability. */
rewardRoutes.get('/', authenticate, validateQuery(RewardItemQueryDto), rewardController.listStore);

/** The caller's own purchase history. */
rewardRoutes.get(
  '/redemptions',
  authenticate,
  authorize(Role.USER),
  validateQuery(ListQueryDto),
  rewardController.listRedemptions,
);

// ------------------------------------------------------------- Admin inventory

rewardRoutes.get(
  '/manage',
  authenticate,
  authorize(Role.ADMIN),
  validateQuery(RewardItemQueryDto),
  rewardController.listForAdmin,
);

rewardRoutes.post(
  '/manage',
  authenticate,
  authorize(Role.ADMIN),
  validateBody(CreateRewardItemDto),
  rewardController.create,
);

rewardRoutes.patch(
  '/manage/:id',
  authenticate,
  authorize(Role.ADMIN),
  validateUuidParam('id'),
  validateBody(UpdateRewardItemDto),
  rewardController.update,
);

rewardRoutes.delete(
  '/manage/:id',
  authenticate,
  authorize(Role.ADMIN),
  validateUuidParam('id'),
  rewardController.remove,
);

// ----------------------------------------------------------------- Redemption

rewardRoutes.post(
  '/:id/redeem',
  authenticate,
  authorize(Role.USER),
  validateUuidParam('id'),
  rewardController.redeem,
);
