import { Router } from 'express';
import { adminController } from '../controllers/AdminController';
import { Role } from '../entities/User';
import { authenticate, authorize } from '../middlewares/auth.middleware';

/**
 * Admin-only routes.
 *
 * `authenticate` then `authorize` in that order, on every route: there is nothing to authorize until
 * the caller is known. Applied per route rather than with `router.use` so each line states its own
 * requirements and adding an endpoint here cannot silently inherit — or silently miss — a guard.
 */
export const adminRoutes = Router();

adminRoutes.get('/summary', authenticate, authorize(Role.ADMIN), adminController.summary);
