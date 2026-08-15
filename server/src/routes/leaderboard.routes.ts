import { Router } from 'express';
import { leaderboardController } from '../controllers/LeaderboardController';
import { ListQueryDto } from '../dtos/ListQueryDto';
import { authenticate } from '../middlewares/auth.middleware';
import { validateQuery } from '../middlewares/validate.middleware';

/**
 * Public standings, for any signed-in role.
 *
 * No role gate: the ranking contains only accounts that opted into it, so there is nothing here that is
 * private to a User. Opting out removes an account from the query itself, not merely from the response.
 */
export const leaderboardRoutes = Router();

leaderboardRoutes.get('/', authenticate, validateQuery(ListQueryDto), leaderboardController.list);
