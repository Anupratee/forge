import { Router } from 'express';
import { authController } from '../controllers/AuthController';
import { LoginDto } from '../dtos/LoginDto';
import { RegisterDto } from '../dtos/RegisterDto';
import { UpdateProfileDto } from '../dtos/UpdateProfileDto';
import { authenticate } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';

/**
 * Authentication routes.
 *
 * Each line reads as the full pipeline for that endpoint: validate the shape, establish the caller,
 * then hand off to a controller. Anything a route does not list, it does not do — there is no hidden
 * guard applied elsewhere.
 */
export const authRoutes = Router();

authRoutes.post('/register', validateBody(RegisterDto), authController.register);
authRoutes.post('/login', validateBody(LoginDto), authController.login);
authRoutes.get('/me', authenticate, authController.me);

/**
 * The caller's own profile — display name, bio, and the leaderboard opt-in.
 *
 * Role, status, and email are not on the DTO, and `forbidNonWhitelisted` makes sending one a 400 rather
 * than a quietly dropped field. So this cannot become a way to promote or reinstate yourself.
 */
authRoutes.patch('/me', authenticate, validateBody(UpdateProfileDto), authController.updateMe);
