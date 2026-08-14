import type { Request, Response } from 'express';
import type { CheckInDto } from '../dtos/CheckInDto';
import type { ListQueryDto } from '../dtos/ListQueryDto';
import { getAuth } from '../middlewares/auth.middleware';
import { uploadedPath } from '../middlewares/upload.middleware';
import { getQuery, pathId } from '../middlewares/validate.middleware';
import type { BodyOf } from '../middlewares/validate.middleware';
import type { ParticipationService } from '../services/ParticipationService';
import { participationService } from '../services/ParticipationService';

export class ParticipationController {
  constructor(private readonly participationService: ParticipationService) {}

  join = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await this.participationService.join(getAuth(req), pathId(req)));
  };

  checkIn = async (req: BodyOf<CheckInDto>, res: Response): Promise<void> => {
    const result = await this.participationService.checkIn(
      getAuth(req),
      pathId(req),
      req.body,
      uploadedPath(req.file, 'proofs'),
    );

    res.status(201).json(result);
  };

  /** Scoped inside the service to challenges the caller created. */
  listParticipants = async (req: Request, res: Response): Promise<void> => {
    const query = getQuery<ListQueryDto>(req);
    res.json(await this.participationService.listParticipants(getAuth(req), pathId(req), query));
  };

  listMine = async (req: Request, res: Response): Promise<void> => {
    const query = getQuery<ListQueryDto>(req);
    res.json(await this.participationService.listMine(getAuth(req), query));
  };
}

export const participationController = new ParticipationController(participationService);
