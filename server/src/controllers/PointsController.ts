import type { Request, Response } from 'express';
import type { ListQueryDto } from '../dtos/ListQueryDto';
import { getAuth } from '../middlewares/auth.middleware';
import { getQuery } from '../middlewares/validate.middleware';
import type { PointsService } from '../services/PointsService';
import { pointsService } from '../services/PointsService';

export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  /** The caller's balance, summed from the ledger — no endpoint reads a stored total. */
  balance = async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuth(req);
    res.json({ balance: await this.pointsService.getBalance(userId) });
  };

  ledger = async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuth(req);
    res.json(await this.pointsService.listLedger(userId, getQuery<ListQueryDto>(req)));
  };
}

export const pointsController = new PointsController(pointsService);
