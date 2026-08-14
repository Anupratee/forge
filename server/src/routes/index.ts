import { Router } from 'express';
import { adminRoutes } from './admin.routes';
import { authRoutes } from './auth.routes';

/**
 * Everything under `/api`, assembled in one place.
 *
 * `app.ts` mounts this and nothing else, so the set of endpoints the API exposes can be read off this
 * file rather than gathered from across the application.
 */
export const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/admin', adminRoutes);
