import type { Request, Response } from 'express';
import type {
  AdminUserQueryDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from '../dtos/AdminUserDto';
import { getAuth } from '../middlewares/auth.middleware';
import { getQuery, pathId } from '../middlewares/validate.middleware';
import type { BodyOf } from '../middlewares/validate.middleware';
import type { AdminService } from '../services/AdminService';
import { adminService } from '../services/AdminService';

export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * No role check in here. The route is behind `authorize(Role.ADMIN)`, and repeating the test would
   * mean two places to change if the rule ever does.
   */
  summary = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.adminService.getSystemSummary());
  };

  listUsers = async (req: Request, res: Response): Promise<void> => {
    const query = getQuery<AdminUserQueryDto>(req);
    res.json(await this.adminService.listUsers(getAuth(req), query));
  };

  /**
   * The actor is passed through because the service refuses some changes based on who is asking —
   * suspending yourself, changing your own role. That is a business rule, so it lives there.
   */
  setStatus = async (req: BodyOf<UpdateUserStatusDto>, res: Response): Promise<void> => {
    res.json(await this.adminService.setStatus(getAuth(req), pathId(req), req.body.status));
  };

  setRole = async (req: BodyOf<UpdateUserRoleDto>, res: Response): Promise<void> => {
    res.json(await this.adminService.setRole(getAuth(req), pathId(req), req.body.role));
  };
}

export const adminController = new AdminController(adminService);
