import type { ReactNode } from 'react';
import { ChallengeStatus, ParticipationStatus } from '../types/enums';
import { toTitle } from '../utils/format';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  danger: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * The lifecycle, coloured.
 *
 * The map is exhaustive over `ChallengeStatus`, so adding a status to the server and the mirrored enum
 * makes this file stop compiling until it is given a colour — which is the point. A default branch here
 * would let a new status ship silently as grey.
 */
const CHALLENGE_TONES: Record<ChallengeStatus, Tone> = {
  [ChallengeStatus.DRAFT]: 'neutral',
  [ChallengeStatus.PENDING_APPROVAL]: 'warning',
  [ChallengeStatus.APPROVED]: 'success',
  [ChallengeStatus.REJECTED]: 'danger',
  [ChallengeStatus.ENDED]: 'info',
};

export function ChallengeStatusBadge({ status }: { status: ChallengeStatus }) {
  return <Badge tone={CHALLENGE_TONES[status]}>{toTitle(status)}</Badge>;
}

const PARTICIPATION_TONES: Record<ParticipationStatus, Tone> = {
  [ParticipationStatus.ACTIVE]: 'info',
  [ParticipationStatus.COMPLETED]: 'success',
  [ParticipationStatus.WITHDRAWN]: 'neutral',
};

export function ParticipationStatusBadge({ status }: { status: ParticipationStatus }) {
  return <Badge tone={PARTICIPATION_TONES[status]}>{toTitle(status)}</Badge>;
}
