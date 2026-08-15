import type { Request, Response } from 'express';
import type { ListQueryDto } from '../dtos/ListQueryDto';
import { getAuth } from '../middlewares/auth.middleware';
import { getQuery } from '../middlewares/validate.middleware';
import type { LeaderboardService } from '../services/LeaderboardService';
import { leaderboardService } from '../services/LeaderboardService';

export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  /** The caller is passed through only so the service can mark their own row and report their rank. */
  list = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.leaderboardService.list(getAuth(req), getQuery<ListQueryDto>(req)));
  };
}

export const leaderboardController = new LeaderboardController(leaderboardService);
