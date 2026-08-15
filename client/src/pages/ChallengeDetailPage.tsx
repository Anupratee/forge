import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChallengeStatusBadge, ParticipationStatusBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card, CardBody, CardHeader, PageHeader, StatCard } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { TextAreaField, TextField } from '../components/Field';
import { Loading } from '../components/Loading';
import { ProgressBar } from '../components/ProgressBar';
import { useAuth } from '../hooks/useAuth';
import { useChallengeParticipation } from '../hooks/useChallengeParticipation';
import { useChallenge, useCheckIn, useJoinChallenge } from '../hooks/useChallenges';
import { uploadUrl } from '../services/api';
import type { ChallengeSummary, ParticipationProgress } from '../types/api';
import { formatDate, formatPoints, pluralize, toTitle, todayIso } from '../utils/format';

export function ChallengeDetailPage() {
  const { id = '' } = useParams();
  const challenge = useChallenge(id);
  const { isUser } = useAuth();

  if (challenge.isPending) return <Loading label="Loading the challenge" />;
  if (challenge.isError) {
    return <ErrorState error={challenge.error} onRetry={() => void challenge.refetch()} />;
  }

  return (
    <>
      <PageHeader
        title={challenge.data.title}
        description={`By ${challenge.data.creator.displayName}`}
        action={<ChallengeStatusBadge status={challenge.data.status} />}
      />

      <Link to="/challenges" className="text-forge-600 text-sm hover:underline">
        ← All challenges
      </Link>

      {challenge.data.coverImage !== null && (
        <img
          src={uploadUrl(challenge.data.coverImage)}
          alt=""
          className="h-56 w-full rounded-xl object-cover"
        />
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Category" value={toTitle(challenge.data.category)} />
        <StatCard
          label="Runs"
          value={formatDate(challenge.data.startDate)}
          detail={`until ${formatDate(challenge.data.endDate)}`}
        />
        <StatCard
          label="Participants"
          value={`${challenge.data.participantCount} / ${challenge.data.capacity}`}
          detail={challenge.data.isFull ? 'Full' : 'Seats available'}
        />
        <StatCard
          label="Reward"
          value={`${formatPoints(challenge.data.pointsReward)} pts`}
          detail="On completing every day"
        />
      </div>

      <Card>
        <CardHeader title="About this challenge" />
        <CardBody>
          <p className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300">
            {challenge.data.description}
          </p>
        </CardBody>
      </Card>

      {/*
        Joining and checking in are User-only actions, and the API enforces that. A Creator or Admin
        reading this page sees the challenge without the panel, rather than a button that would 403.
      */}
      {isUser && <ParticipationPanel challenge={challenge.data} />}
    </>
  );
}

/**
 * Join, or check in if already joined.
 *
 * Which of the two is offered depends on whether the caller has a participation, which comes from
 * their own joined list rather than from the challenge — the challenge record has no idea who is
 * looking at it, and asking it to would leak participants to everyone.
 */
function ParticipationPanel({ challenge }: { challenge: ChallengeSummary }) {
  const participation = useChallengeParticipation(challenge.id);
  const join = useJoinChallenge();

  if (participation.isPending) return <Loading label="Checking whether you have joined" />;
  if (participation.isError) return <ErrorState error={participation.error} />;

  if (participation.data !== null) {
    return <CheckInPanel challenge={challenge} progress={participation.data} />;
  }

  const closed = challenge.hasEnded || challenge.isFull;

  return (
    <Card>
      <CardHeader
        title="Join this challenge"
        description={`Check in each day to earn points, and finish every day for the ${formatPoints(challenge.pointsReward)}-point reward.`}
      />
      <CardBody className="space-y-3">
        {join.isError && <ErrorState error={join.error} />}

        <Button busy={join.isPending} disabled={closed} onClick={() => join.mutate(challenge.id)}>
          {challenge.hasEnded ? 'This challenge has finished' : challenge.isFull ? 'Full' : 'Join'}
        </Button>

        {/*
          Capacity is held by a row lock on the challenge inside the join transaction, so two people
          racing for the last seat get a 201 and a 409 — this button is a courtesy, not the limit.
        */}
        {challenge.isFull && !challenge.hasEnded && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Every seat is taken. Capacity is enforced when you join, so this cannot be worked around
            by refreshing.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function CheckInPanel({
  challenge,
  progress,
}: {
  challenge: ChallengeSummary;
  progress: ParticipationProgress;
}) {
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayIso());
  const [proof, setProof] = useState<File | undefined>(undefined);

  const checkIn = useCheckIn();
  const doneToday = progress.lastCheckInDate === todayIso();
  const percent = (progress.checkInCount / progress.requiredDays) * 100;

  return (
    <Card>
      <CardHeader
        title="Your progress"
        description="One check-in per day, enforced by the database rather than by this form."
        action={<ParticipationStatusBadge status={progress.status} />}
      />

      <CardBody className="space-y-5">
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-400">
              {progress.checkInCount} of {pluralize(progress.requiredDays, 'day')} checked in
            </span>
            <span className="text-slate-500">{Math.round(percent)}%</span>
          </div>
          <ProgressBar
            percent={percent}
            tone={progress.completedAt !== null ? 'success' : 'forge'}
            label="Challenge progress"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {progress.lastCheckInDate === null
              ? 'No check-ins yet'
              : `Last check-in ${formatDate(progress.lastCheckInDate)}`}
          </p>
        </div>

        {progress.completedAt !== null && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
            Completed — the {formatPoints(challenge.pointsReward)}-point reward has been paid.
          </p>
        )}

        {checkIn.isSuccess && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
            Checked in for {formatDate(checkIn.data.date)} — {checkIn.data.pointsAwarded} points.
            {checkIn.data.completedChallenge && ' That completed the challenge.'} Balance is now{' '}
            {formatPoints(checkIn.data.balance)}.
          </p>
        )}

        {checkIn.isError && <ErrorState error={checkIn.error} />}

        {progress.completedAt === null && !challenge.hasEnded && (
          <form
            className="space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800"
            onSubmit={(event) => {
              event.preventDefault();
              checkIn.mutate(
                {
                  id: challenge.id,
                  input: { date, note: note === '' ? undefined : note },
                  proofImage: proof,
                },
                { onSuccess: () => setNote('') },
              );
            }}
          >
            {/*
              The date is settable so a missed day can be backfilled, bounded by the challenge's own
              window. The server validates the same range independently.
            */}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Date"
                type="date"
                value={date}
                min={challenge.startDate}
                max={todayIso() < challenge.endDate ? todayIso() : challenge.endDate}
                onChange={(event) => setDate(event.target.value)}
              />

              <div className="space-y-1.5">
                <label
                  htmlFor="proof"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Proof image
                </label>
                <input
                  id="proof"
                  type="file"
                  accept="image/*"
                  onChange={(event) => setProof(event.target.files?.[0])}
                  className="file:bg-forge-50 file:text-forge-700 hover:file:bg-forge-100 w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-2 file:text-sm file:font-medium"
                />
              </div>
            </div>

            <TextAreaField
              label="Note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />

            {/*
              What a check-in is worth is server policy (`services/PointsPolicy.ts`) and is not
              exposed by any endpoint, so it is reported from the response rather than printed here.
              A number hardcoded in the client would be a second copy of the policy, and the wrong one.
            */}
            <Button
              type="submit"
              busy={checkIn.isPending}
              disabled={doneToday && date === todayIso()}
            >
              {doneToday && date === todayIso() ? 'Already checked in today' : 'Check in'}
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
