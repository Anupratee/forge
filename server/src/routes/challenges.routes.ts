import { Router } from 'express';
import { challengeController } from '../controllers/ChallengeController';
import { participationController } from '../controllers/ParticipationController';
import { ChallengeQueryDto, OwnedChallengeQueryDto } from '../dtos/ChallengeQueryDto';
import { CheckInDto } from '../dtos/CheckInDto';
import { CreateChallengeDto } from '../dtos/CreateChallengeDto';
import { ListQueryDto } from '../dtos/ListQueryDto';
import { RejectChallengeDto } from '../dtos/RejectChallengeDto';
import { UpdateChallengeDto } from '../dtos/UpdateChallengeDto';
import { Role } from '../entities/User';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { uploadImage } from '../middlewares/upload.middleware';
import { validateBody, validateQuery, validateUuidParam } from '../middlewares/validate.middleware';

/**
 * Challenge routes — the core entity.
 *
 * Two ordering rules are load-bearing:
 *
 * 1. **The fixed segments come before `/:id`.** Express matches in registration order, so a `/:id` route
 *    declared first would capture `joined` as an id and the collection routes would be unreachable.
 * 2. **The upload middleware comes before `validateBody`.** Multer is what parses a multipart body, so
 *    nothing is there to validate until it has run.
 */
export const challengeRoutes = Router();

// ------------------------------------------------------------- Collections

/**
 * The public browse. Approved challenges only, with the shared filter set: keyword, category, overlapping
 * date range, sort, pagination, and `availableOnly` to hide what is full or finished.
 */
challengeRoutes.get(
  '/',
  authenticate,
  validateQuery(ChallengeQueryDto),
  challengeController.browse,
);

/** The caller's own participations. */
challengeRoutes.get(
  '/joined',
  authenticate,
  authorize(Role.USER),
  validateQuery(ListQueryDto),
  participationController.listMine,
);

/** A Creator's own challenges, at every status — the Creator dashboard's list. */
challengeRoutes.get(
  '/authored',
  authenticate,
  authorize(Role.CREATOR),
  validateQuery(OwnedChallengeQueryDto),
  challengeController.listOwn,
);

/** The Admin approval queue. */
challengeRoutes.get(
  '/pending-approval',
  authenticate,
  authorize(Role.ADMIN),
  validateQuery(ChallengeQueryDto),
  challengeController.listPendingApproval,
);

challengeRoutes.post(
  '/',
  authenticate,
  authorize(Role.CREATOR),
  uploadImage('coverImage', 'covers'),
  validateBody(CreateChallengeDto),
  challengeController.create,
);

// ----------------------------------------------------------- Single records

challengeRoutes.get('/:id', authenticate, validateUuidParam('id'), challengeController.getOne);

challengeRoutes.patch(
  '/:id',
  authenticate,
  authorize(Role.CREATOR),
  validateUuidParam('id'),
  uploadImage('coverImage', 'covers'),
  validateBody(UpdateChallengeDto),
  challengeController.update,
);

challengeRoutes.delete(
  '/:id',
  authenticate,
  authorize(Role.CREATOR),
  validateUuidParam('id'),
  challengeController.remove,
);

// ---------------------------------------------------------------- Workflow

challengeRoutes.post(
  '/:id/submit',
  authenticate,
  authorize(Role.CREATOR),
  validateUuidParam('id'),
  challengeController.submit,
);

/**
 * Approval and rejection are Admin-only at the route, and the state machine independently refuses the
 * transition to any other role — so a Creator cannot self-approve even if this gate were ever loosened.
 */
challengeRoutes.post(
  '/:id/approve',
  authenticate,
  authorize(Role.ADMIN),
  validateUuidParam('id'),
  challengeController.approve,
);

challengeRoutes.post(
  '/:id/reject',
  authenticate,
  authorize(Role.ADMIN),
  validateUuidParam('id'),
  validateBody(RejectChallengeDto),
  challengeController.reject,
);

// ----------------------------------------------------------- Participation

challengeRoutes.post(
  '/:id/join',
  authenticate,
  authorize(Role.USER),
  validateUuidParam('id'),
  participationController.join,
);

challengeRoutes.post(
  '/:id/check-ins',
  authenticate,
  authorize(Role.USER),
  validateUuidParam('id'),
  uploadImage('proofImage', 'proofs'),
  validateBody(CheckInDto),
  participationController.checkIn,
);

/**
 * Creator-only, and scoped inside the service to challenges this Creator owns. The role gate is not enough
 * on its own here — it would let any Creator read any other Creator's participants.
 */
challengeRoutes.get(
  '/:id/participants',
  authenticate,
  authorize(Role.CREATOR),
  validateUuidParam('id'),
  validateQuery(ListQueryDto),
  participationController.listParticipants,
);
