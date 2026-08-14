import type { Request, Response } from 'express';
import type { RegisterDto } from '../dtos/RegisterDto';
import type { LoginDto } from '../dtos/LoginDto';
import { Role } from '../entities/User';
import { getAuth } from '../middlewares/auth.middleware';
import type { AuthService } from '../services/AuthService';
import { authService } from '../services/AuthService';

/** A request whose body has already been validated into `T` by the `validate` middleware. */
type Body<T> = Request<Record<string, string>, unknown, T>;

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

  register = async (req: Body<RegisterDto>, res: Response): Promise<void> => {
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

  login = async (req: Body<LoginDto>, res: Response): Promise<void> => {
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
}

export const authController = new AuthController(authService);
