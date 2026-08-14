import type { Request, Response } from 'express';
import type {
  BudgetQueryDto,
  CreateBudgetGoalDto,
  MonthQueryDto,
  UpdateBudgetGoalDto,
} from '../dtos/BudgetDto';
import { getAuth } from '../middlewares/auth.middleware';
import { getQuery, pathId } from '../middlewares/validate.middleware';
import type { BodyOf } from '../middlewares/validate.middleware';
import type { BudgetService } from '../services/BudgetService';
import { budgetService } from '../services/BudgetService';

export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  create = async (req: BodyOf<CreateBudgetGoalDto>, res: Response): Promise<void> => {
    res.status(201).json(await this.budgetService.create(getAuth(req), req.body));
  };

  update = async (req: BodyOf<UpdateBudgetGoalDto>, res: Response): Promise<void> => {
    res.json(await this.budgetService.update(getAuth(req), pathId(req), req.body));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.budgetService.remove(getAuth(req), pathId(req));
    res.status(204).send();
  };

  list = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.budgetService.list(getAuth(req), getQuery<BudgetQueryDto>(req)));
  };

  getOne = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.budgetService.getOne(getAuth(req), pathId(req)));
  };

  /** The dashboard's month view: goals with spend, plus categories no goal covers. */
  monthSummary = async (req: Request, res: Response): Promise<void> => {
    const { month } = getQuery<MonthQueryDto>(req);
    res.json(await this.budgetService.getMonthSummary(getAuth(req), month));
  };

  claimAdherence = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await this.budgetService.claimAdherence(getAuth(req), pathId(req)));
  };
}

export const budgetController = new BudgetController(budgetService);
