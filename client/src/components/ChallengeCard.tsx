import { Link } from 'react-router-dom';
import type { ChallengeSummary } from '../types/api';
import { uploadUrl } from '../services/api';
import { formatDate, toTitle } from '../utils/format';
import { Badge, ChallengeStatusBadge } from './Badge';
import { Card, CardBody } from './Card';
import { ProgressBar } from './ProgressBar';

/**
 * One challenge, as it appears in every list that shows challenges.
 *
 * The same card serves the User's browse, the Creator's own list, and the Admin's approval queue,
 * which is why the status badge is always rendered rather than assumed: a User only ever sees
 * `APPROVED` or `ENDED` because that is all the API returns them, not because this component hides
 * anything.
 */
export function ChallengeCard({
  challenge,
  to,
  footer,
}: {
  challenge: ChallengeSummary;
  /** Where the card links; omitted for lists where the card is not itself a link. */
  to?: string;
  footer?: React.ReactNode;
}) {
  const seatsUsed = (challenge.participantCount / challenge.capacity) * 100;

  const body = (
    <CardBody className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{challenge.title}</h3>
        <ChallengeStatusBadge status={challenge.status} />
      </div>

      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Badge>{toTitle(challenge.category)}</Badge>
        <span>
          {formatDate(challenge.startDate)} – {formatDate(challenge.endDate)}
        </span>
        {challenge.hasEnded && <Badge tone="info">Finished</Badge>}
        {challenge.isFull && !challenge.hasEnded && <Badge tone="warning">Full</Badge>}
      </p>

      <p className="line-clamp-3 flex-1 text-sm text-slate-600 dark:text-slate-400">
        {challenge.description}
      </p>

      {/*
        A rejection reason is the whole point of rejecting rather than deleting, so it is shown in
        full wherever the challenge appears rather than being hidden behind the detail screen.
      */}
      {challenge.rejectionReason !== null && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
          <span className="font-medium">Rejected:</span> {challenge.rejectionReason}
        </p>
      )}

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            {challenge.participantCount} of {challenge.capacity} joined
          </span>
          <span className="text-forge-600 font-semibold">{challenge.pointsReward} pts</span>
        </div>
        <ProgressBar
          percent={seatsUsed}
          tone={challenge.isFull ? 'danger' : 'forge'}
          label={`${challenge.title} capacity`}
        />
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        By {challenge.creator.displayName}
      </p>

      {footer}
    </CardBody>
  );

  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      {challenge.coverImage !== null && (
        <img src={uploadUrl(challenge.coverImage)} alt="" className="h-32 w-full object-cover" />
      )}

      {to === undefined ? (
        body
      ) : (
        <Link to={to} className="flex h-full flex-col">
          {body}
        </Link>
      )}
    </Card>
  );
}
