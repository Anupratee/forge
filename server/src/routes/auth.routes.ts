import { Router } from 'express';
import { authController } from '../controllers/AuthController';
import { LoginDto } from '../dtos/LoginDto';
import { RegisterDto } from '../dtos/RegisterDto';
import { UpdateProfileDto } from '../dtos/UpdateProfileDto';
import { authenticate } from '../middlewares/auth.middleware';
import { authRateLimiter } from '../middlewares/rate-limit.middleware';
import { validateBody } from '../middlewares/validate.middleware';

/**
 * Authentication routes.
 *
 * Each line reads as the full pipeline for that endpoint: throttle, validate the shape, establish the
 * caller, then hand off to a controller. Anything a route does not list, it does not do — there is no
 * hidden guard applied elsewhere.
 *
 * These two are the only endpoints in the API that answer a caller with no token, which makes them the
 * only ones a stranger can hammer. The limiter goes first, ahead of validation, so a flood costs the
 * server a counter increment rather than a full DTO check and a bcrypt comparison.
 */
export const authRoutes = Router();

authRoutes.post('/register', authRateLimiter, validateBody(RegisterDto), authController.register);
authRoutes.post('/login', authRateLimiter, validateBody(LoginDto), authController.login);
authRoutes.get('/me', authenticate, authController.me);

/**
 * The caller's own profile — display name, bio, and the leaderboard opt-in.
 *
 * Role, status, and email are not on the DTO, and `forbidNonWhitelisted` makes sending one a 400 rather
 * than a quietly dropped field. So this cannot become a way to promote or reinstate yourself.
 */
authRoutes.patch('/me', authenticate, validateBody(UpdateProfileDto), authController.updateMe);
