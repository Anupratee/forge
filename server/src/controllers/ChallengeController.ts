import type { Request, Response } from 'express';
import type { ChallengeQueryDto, OwnedChallengeQueryDto } from '../dtos/ChallengeQueryDto';
import type { CreateChallengeDto } from '../dtos/CreateChallengeDto';
import type { RejectChallengeDto } from '../dtos/RejectChallengeDto';
import type { UpdateChallengeDto } from '../dtos/UpdateChallengeDto';
import { ChallengeStatus } from '../entities/Challenge';
import { getAuth } from '../middlewares/auth.middleware';
import { uploadedPath } from '../middlewares/upload.middleware';
import { getQuery, pathId } from '../middlewares/validate.middleware';
import type { BodyOf } from '../middlewares/validate.middleware';
import type { ChallengeService } from '../services/ChallengeService';
import { challengeService } from '../services/ChallengeService';

/**
 * Translates HTTP to `ChallengeService` calls.
 *
 * No business rules and no authorization decisions: the route declares the role gate, the service owns
 * ownership and the state machine. Each handler's job is to read the request and hand over.
 */
export class ChallengeController {
  constructor(private readonly challengeService: ChallengeService) {}

  // -------------------------------------------------------- Creator-authored

  create = async (req: BodyOf<CreateChallengeDto>, res: Response): Promise<void> => {
    const challenge = await this.challengeService.create(
      getAuth(req),
      req.body,
      uploadedPath(req.file, 'covers'),
    );

    res.status(201).json(challenge);
  };

  update = async (req: BodyOf<UpdateChallengeDto>, res: Response): Promise<void> => {
    const challenge = await this.challengeService.update(
      getAuth(req),
      pathId(req),
      req.body,
      uploadedPath(req.file, 'covers'),
    );

    res.json(challenge);
  };

  submit = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.challengeService.submitForApproval(getAuth(req), pathId(req)));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.challengeService.remove(getAuth(req), pathId(req));
    res.status(204).send();
  };

  listOwn = async (req: Request, res: Response): Promise<void> => {
    const query = getQuery<OwnedChallengeQueryDto>(req);
    res.json(await this.challengeService.listOwn(getAuth(req), query));
  };

  // ------------------------------------------------------------------- Admin

  listPendingApproval = async (req: Request, res: Response): Promise<void> => {
    const query = getQuery<ChallengeQueryDto>(req);
    res.json(await this.challengeService.listByStatus(ChallengeStatus.PENDING_APPROVAL, query));
  };

  approve = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.challengeService.approve(getAuth(req), pathId(req)));
  };

  reject = async (req: BodyOf<RejectChallengeDto>, res: Response): Promise<void> => {
    res.json(await this.challengeService.reject(getAuth(req), pathId(req), req.body.reason));
  };

  // -------------------------------------------------------------- Everyone

  browse = async (req: Request, res: Response): Promise<void> => {
    const query = getQuery<ChallengeQueryDto>(req);
    res.json(await this.challengeService.listApproved(query));
  };

  getOne = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.challengeService.getForActor(getAuth(req), pathId(req)));
  };
}

export const challengeController = new ChallengeController(challengeService);
