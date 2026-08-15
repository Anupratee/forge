import { Router } from 'express';
import { adminRoutes } from './admin.routes';
import { authRoutes } from './auth.routes';
import { budgetRoutes } from './budgets.routes';
import { challengeRoutes } from './challenges.routes';
import { expenseRoutes } from './expenses.routes';
import { habitRoutes } from './habits.routes';
import { leaderboardRoutes } from './leaderboard.routes';
import { pointsRoutes } from './points.routes';
import { rewardRoutes } from './rewards.routes';

/**
 * Everything under `/api`, assembled in one place.
 *
 * `app.ts` mounts this and nothing else, so the set of endpoints the API exposes can be read off this
 * file rather than gathered from across the application.
 */
export const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/challenges', challengeRoutes);
apiRouter.use('/habits', habitRoutes);
apiRouter.use('/budgets', budgetRoutes);
apiRouter.use('/expenses', expenseRoutes);
apiRouter.use('/rewards', rewardRoutes);
apiRouter.use('/points', pointsRoutes);
apiRouter.use('/leaderboard', leaderboardRoutes);
