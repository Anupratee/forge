import type { Request, Response } from 'express';
import type { RegisterDto } from '../dtos/RegisterDto';
import type { LoginDto } from '../dtos/LoginDto';
import type { UpdateProfileDto } from '../dtos/UpdateProfileDto';
import { Role } from '../entities/User';
import { getAuth } from '../middlewares/auth.middleware';
import type { BodyOf } from '../middlewares/validate.middleware';
import type { AuthService } from '../services/AuthService';
import { authService } from '../services/AuthService';

/**
 * Translates HTTP to `AuthService` calls and back.
 *
 * No business rules here, and no error handling: shape validation happened in middleware, the rules
 * live in the service, and anything thrown is shaped by the error middleware. Express 5 forwards a
 * rejected promise from a handler automatically, which is what lets these stay this short.
 *
 * The handlers are arrow properties so they can be passed directly to a route without losing `this`.
 */
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = async (req: BodyOf<RegisterDto>, res: Response): Promise<void> => {
    const result = await this.authService.register({
      email: req.body.email,
      password: req.body.password,
      displayName: req.body.displayName,
      // The DTO permits only USER or CREATOR, and the service's parameter type permits only those
      // two — so the default here cannot widen into an Admin.
      role: req.body.role ?? Role.USER,
    });

    res.status(201).json(result);
  };

  login = async (req: BodyOf<LoginDto>, res: Response): Promise<void> => {
    const result = await this.authService.login({
      email: req.body.email,
      password: req.body.password,
    });

    res.json(result);
  };

  me = async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuth(req);
    res.json(await this.authService.getProfile(userId));
  };

  /** The subject is always the token's own, so there is no id to pass and none to get wrong. */
  updateMe = async (req: BodyOf<UpdateProfileDto>, res: Response): Promise<void> => {
    const { userId } = getAuth(req);
    res.json(await this.authService.updateProfile(userId, req.body));
  };
}

export const authController = new AuthController(authService);
