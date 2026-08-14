import { Router } from 'express';
import { authController } from '../controllers/AuthController';
import { LoginDto } from '../dtos/LoginDto';
import { RegisterDto } from '../dtos/RegisterDto';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';

/**
 * Authentication routes.
 *
 * Each line reads as the full pipeline for that endpoint: validate the shape, establish the caller,
 * then hand off to a controller. Anything a route does not list, it does not do — there is no hidden
 * guard applied elsewhere.
 */
export const authRoutes = Router();

authRoutes.post('/register', validate(RegisterDto), authController.register);
authRoutes.post('/login', validate(LoginDto), authController.login);
authRoutes.get('/me', authenticate, authController.me);
