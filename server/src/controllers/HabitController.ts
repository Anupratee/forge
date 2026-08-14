import type { Request, Response } from 'express';
import type {
  CompleteHabitDto,
  CreateHabitDto,
  HabitQueryDto,
  UpdateHabitDto,
} from '../dtos/HabitDto';
import { getAuth } from '../middlewares/auth.middleware';
import { getQuery, pathId } from '../middlewares/validate.middleware';
import type { BodyOf } from '../middlewares/validate.middleware';
import type { HabitService } from '../services/HabitService';
import { habitService } from '../services/HabitService';

export class HabitController {
  constructor(private readonly habitService: HabitService) {}

  create = async (req: BodyOf<CreateHabitDto>, res: Response): Promise<void> => {
    res.status(201).json(await this.habitService.create(getAuth(req), req.body));
  };

  update = async (req: BodyOf<UpdateHabitDto>, res: Response): Promise<void> => {
    res.json(await this.habitService.update(getAuth(req), pathId(req), req.body));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.habitService.remove(getAuth(req), pathId(req));
    res.status(204).send();
  };

  list = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.habitService.list(getAuth(req), getQuery<HabitQueryDto>(req)));
  };

  getOne = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.habitService.getOne(getAuth(req), pathId(req)));
  };

  complete = async (req: BodyOf<CompleteHabitDto>, res: Response): Promise<void> => {
    res.status(201).json(await this.habitService.complete(getAuth(req), pathId(req), req.body));
  };
}

export const habitController = new HabitController(habitService);
