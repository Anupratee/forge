import type { Request, Response } from 'express';
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
}

export const adminController = new AdminController(adminService);
