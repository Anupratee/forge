import type { Request, Response } from 'express';
import type { CreateExpenseDto, ExpenseQueryDto, UpdateExpenseDto } from '../dtos/ExpenseDto';
import { getAuth } from '../middlewares/auth.middleware';
import { uploadedPath } from '../middlewares/upload.middleware';
import { getQuery, pathId } from '../middlewares/validate.middleware';
import type { BodyOf } from '../middlewares/validate.middleware';
import type { ExpenseService } from '../services/ExpenseService';
import { expenseService } from '../services/ExpenseService';

export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  create = async (req: BodyOf<CreateExpenseDto>, res: Response): Promise<void> => {
    const expense = await this.expenseService.create(
      getAuth(req),
      req.body,
      uploadedPath(req.file, 'receipts'),
    );

    res.status(201).json(expense);
  };

  update = async (req: BodyOf<UpdateExpenseDto>, res: Response): Promise<void> => {
    const expense = await this.expenseService.update(
      getAuth(req),
      pathId(req),
      req.body,
      uploadedPath(req.file, 'receipts'),
    );

    res.json(expense);
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.expenseService.remove(getAuth(req), pathId(req));
    res.status(204).send();
  };

  list = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.expenseService.list(getAuth(req), getQuery<ExpenseQueryDto>(req)));
  };

  getOne = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.expenseService.getOne(getAuth(req), pathId(req)));
  };
}

export const expenseController = new ExpenseController(expenseService);
