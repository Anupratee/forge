import { Router } from 'express';
import { pointsController } from '../controllers/PointsController';
import { ListQueryDto } from '../dtos/ListQueryDto';
import { authenticate } from '../middlewares/auth.middleware';
import { validateQuery } from '../middlewares/validate.middleware';

/**
 * Points balance and ledger, for whoever is asking — always their own.
 *
 * No `:userId` parameter anywhere: the subject is taken from the token, so there is no route shape that
 * could be pointed at somebody else's economy. No role gate either, because every role has a balance,
 * and an Admin reading their own ledger is harmless.
 */
export const pointsRoutes = Router();

pointsRoutes.get('/balance', authenticate, pointsController.balance);

pointsRoutes.get('/ledger', authenticate, validateQuery(ListQueryDto), pointsController.ledger);
