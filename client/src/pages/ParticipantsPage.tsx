import { Link, useParams } from 'react-router-dom';
import { ParticipationStatusBadge } from '../components/Badge';
import { Card, CardBody, PageHeader, StatCard } from '../components/Card';
import { Empty } from '../components/Empty';
import { ErrorState } from '../components/ErrorState';
import { Loading } from '../components/Loading';
import { Pagination } from '../components/Pagination';
import { ProgressBar } from '../components/ProgressBar';
import { useChallenge, useParticipants } from '../hooks/useChallenges';
import { useListQuery } from '../hooks/useListQuery';
import { formatDate, pluralize } from '../utils/format';

/**
 * Participant progress for one of the Creator's own challenges.
 *
 * The scoping is the server's: this endpoint filters to challenges the caller created, and answers 404
 * rather than 403 for anyone else's — a 403 would confirm the challenge exists. So there is no
 * ownership check in this component, and no way to reach another Creator's participants by editing the
 * URL.
 *
 * Note what is shown: a display name and check-in progress on *this* challenge. Nothing about a
 * participant's habits, budgets, or balance, none of which any Creator route exposes.
 */
export function ParticipantsPage() {
  const { id = '' } = useParams();
  const { query, setPage } = useListQuery<{ page?: number; pageSize?: number }>({ pageSize: 20 });

  const challenge = useChallenge(id);
  const participants = useParticipants(id, query);

  return (
    <>
      <PageHeader
        title="Participants"
        description={challenge.isSuccess ? challenge.data.title : 'Progress on your challenge'}
      />

      <Link to="/authored" className="text-forge-600 text-sm hover:underline">
        ← My challenges
      </Link>

      {challenge.isSuccess && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Joined"
            value={`${challenge.data.participantCount} / ${challenge.data.capacity}`}
          />
          <StatCard
            label="Runs"
            value={formatDate(challenge.data.startDate)}
            detail={`until ${formatDate(challenge.data.endDate)}`}
          />
          <StatCard label="Reward" value={`${challenge.data.pointsReward} pts`} />
        </div>
      )}

      {participants.isPending && <Loading label="Loading participants" rows={4} />}
      {participants.isError && (
        <ErrorState error={participants.error} onRetry={() => void participants.refetch()} />
      )}

      {participants.isSuccess &&
        (participants.data.items.length === 0 ? (
          <Empty
            title="Nobody has joined yet"
            description="Participants appear here as soon as someone joins."
          />
        ) : (
          <>
            <Card>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {participants.data.items.map((participant) => {
                  const percent = (participant.checkInCount / participant.requiredDays) * 100;

                  return (
                    <li key={participant.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-100">
                            {participant.participant.displayName}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Joined {formatDate(participant.joinedAt.slice(0, 10))}
                            {participant.lastCheckInDate !== null &&
                              ` · last check-in ${formatDate(participant.lastCheckInDate)}`}
                          </p>
                        </div>

                        <ParticipationStatusBadge status={participant.status} />
                      </div>

                      <div className="mt-3 space-y-1.5">
                        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span>
                            {participant.checkInCount} of{' '}
                            {pluralize(participant.requiredDays, 'day')}
                          </span>
                          <span>{Math.round(percent)}%</span>
                        </div>
                        <ProgressBar
                          percent={percent}
                          tone={participant.completedAt !== null ? 'success' : 'forge'}
                          label={`${participant.participant.displayName} progress`}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <CardBody className="p-0">
              <Pagination
                page={participants.data.page}
                totalPages={participants.data.totalPages}
                total={participants.data.total}
                pageSize={participants.data.pageSize}
                onChange={setPage}
                noun="participant"
              />
            </CardBody>
          </>
        ))}
    </>
  );
}
