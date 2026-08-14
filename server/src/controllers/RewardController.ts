import type { Request, Response } from 'express';
import type { ListQueryDto } from '../dtos/ListQueryDto';
import type {
  CreateRewardItemDto,
  RewardItemQueryDto,
  UpdateRewardItemDto,
} from '../dtos/RewardItemDto';
import { getAuth } from '../middlewares/auth.middleware';
import { getQuery, pathId } from '../middlewares/validate.middleware';
import type { BodyOf } from '../middlewares/validate.middleware';
import type { RewardService } from '../services/RewardService';
import { rewardService } from '../services/RewardService';

export class RewardController {
  constructor(private readonly rewardService: RewardService) {}

  // ------------------------------------------------------------------- Admin

  create = async (req: BodyOf<CreateRewardItemDto>, res: Response): Promise<void> => {
    res.status(201).json(await this.rewardService.create(getAuth(req), req.body));
  };

  update = async (req: BodyOf<UpdateRewardItemDto>, res: Response): Promise<void> => {
    res.json(await this.rewardService.update(pathId(req), req.body));
  };

  /**
   * Responds 204 when the item was deleted and 200 with the item when it was deactivated instead —
   * the two are genuinely different outcomes, and an Admin should be told which happened.
   */
  remove = async (req: Request, res: Response): Promise<void> => {
    const { deleted } = await this.rewardService.remove(pathId(req));

    if (deleted) {
      res.status(204).send();
      return;
    }

    res.json({
      deleted: false,
      message: 'This item has been redeemed before, so it was deactivated instead of deleted.',
    });
  };

  listForAdmin = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.rewardService.listForAdmin(getQuery<RewardItemQueryDto>(req)));
  };

  // -------------------------------------------------------------------- User

  listStore = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.rewardService.listStore(getQuery<RewardItemQueryDto>(req)));
  };

  redeem = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await this.rewardService.redeem(getAuth(req), pathId(req)));
  };

  listRedemptions = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.rewardService.listRedemptions(getAuth(req), getQuery<ListQueryDto>(req)));
  };
}

export const rewardController = new RewardController(rewardService);
