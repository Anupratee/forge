import { ChallengeStatus } from '../entities/Challenge';
import { Role } from '../entities/User';
import { ForbiddenError, ValidationError } from '../utils/AppError';

/**
 * Every legal challenge status change, and who may make it.
 *
 * This file is the only place that knows. `ChallengeService` is its only caller, so "a Creator cannot
 * self-approve" and "a material edit to an approved challenge re-enters PENDING_APPROVAL" are stated
 * once instead of being reimplemented at each endpoint that touches status — which is how those rules
 * drift apart.
 *
 * Ownership is *not* checked here. Whether the actor owns the challenge depends on the row, so it belongs
 * to the service that loaded it; this map is about the transition itself.
 */
const TRANSITIONS: Readonly<Record<ChallengeStatus, Partial<Record<ChallengeStatus, Role[]>>>> = {
  [ChallengeStatus.DRAFT]: {
    // The Creator submits their own draft for review.
    [ChallengeStatus.PENDING_APPROVAL]: [Role.CREATOR],
  },

  [ChallengeStatus.PENDING_APPROVAL]: {
    // Admin only, in both directions. This single line is what makes self-approval impossible.
    [ChallengeStatus.APPROVED]: [Role.ADMIN],
    [ChallengeStatus.REJECTED]: [Role.ADMIN],
  },

  [ChallengeStatus.REJECTED]: {
    // Edit and resubmit. Editing does not move the status on its own — the Creator resubmits explicitly,
    // so a half-finished revision is not sent for review by accident.
    [ChallengeStatus.PENDING_APPROVAL]: [Role.CREATOR],
  },

  [ChallengeStatus.APPROVED]: {
    // A material edit sends an approved challenge back for re-approval, by its own Creator.
    [ChallengeStatus.PENDING_APPROVAL]: [Role.CREATOR],
    // Reached when the challenge's window closes. Applied by the system, not requested by anyone, which
    // is why it lists no role — see `assertSystemTransition`.
    [ChallengeStatus.ENDED]: [],
  },

  // Terminal. A finished challenge is history: its participations and the points they earned must stay
  // readable, and reopening it would let a closed window accept new check-ins.
  [ChallengeStatus.ENDED]: {},
};

/**
 * The fields whose change requires an approved challenge to be reviewed again.
 *
 * Named explicitly rather than "everything except a few", so adding a column does not silently make it
 * material. `coverImage` is deliberately absent: swapping the artwork does not change what participants
 * signed up to do.
 */
export const MATERIAL_FIELDS = [
  'title',
  'description',
  'category',
  'startDate',
  'endDate',
  'capacity',
  'pointsReward',
] as const;

export type MaterialField = (typeof MATERIAL_FIELDS)[number];

/**
 * Asserts that `actorRole` may move a challenge from `from` to `to`.
 *
 * Throws `ValidationError` when the transition is not legal at all — the status simply cannot go there —
 * and `ForbiddenError` when it is legal but not for this role. The distinction matters to a client: the
 * first is "you are asking for the impossible", the second is "you are asking for someone else's job".
 */
export function assertTransition(
  from: ChallengeStatus,
  to: ChallengeStatus,
  actorRole: Role,
): void {
  const allowedRoles = TRANSITIONS[from][to];

  if (allowedRoles === undefined) {
    throw new ValidationError(`A challenge cannot go from ${from} to ${to}`);
  }

  if (!allowedRoles.includes(actorRole)) {
    throw new ForbiddenError(`Only ${describe(allowedRoles)} can move a challenge to ${to}`);
  }
}

/**
 * Asserts a transition the system makes on its own behalf, with no actor.
 *
 * Only the close-out of an expired challenge uses this. It is separate from {@link assertTransition} so
 * that a transition with an empty role list can never be satisfied by a request — no caller can supply a
 * role that matches, which is exactly the intent.
 */
export function assertSystemTransition(from: ChallengeStatus, to: ChallengeStatus): void {
  if (TRANSITIONS[from][to] === undefined) {
    throw new ValidationError(`A challenge cannot go from ${from} to ${to}`);
  }
}

function describe(roles: Role[]): string {
  return roles.length === 0 ? 'the system' : `${roles.join(' or ')} accounts`;
}
