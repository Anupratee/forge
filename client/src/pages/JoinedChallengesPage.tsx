import { Link } from 'react-router-dom';
import { ParticipationStatusBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card, CardBody, PageHeader } from '../components/Card';
import { Empty } from '../components/Empty';
import { ErrorState } from '../components/ErrorState';
import { Loading } from '../components/Loading';
import { Pagination } from '../components/Pagination';
import { ProgressBar } from '../components/ProgressBar';
import { useJoinedChallenges } from '../hooks/useChallenges';
import { useListQuery } from '../hooks/useListQuery';
import type { JoinedChallenge } from '../types/api';
import { formatDate, pluralize } from '../utils/format';

export function JoinedChallengesPage() {
  const { query, setPage } = useListQuery<{ page?: number; pageSize?: number; sortDir?: string }>({
    pageSize: 10,
    sortDir: 'DESC',
  });

  const joined = useJoinedChallenges(query);

  return (
    <>
      <PageHeader
        title="Joined challenges"
        description="Your own participations and how far through each one you are."
      />

      {joined.isPending && <Loading label="Loading your challenges" rows={3} />}
      {joined.isError && <ErrorState error={joined.error} onRetry={() => void joined.refetch()} />}

      {joined.isSuccess &&
        (joined.data.items.length === 0 ? (
          <Empty
            title="You have not joined anything yet"
            description="Browse the approved challenges and join one to start earning check-in points."
            action={
              <Link to="/challenges">
                <Button>Browse challenges</Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="space-y-4">
              {joined.data.items.map((entry) => (
                <JoinedRow key={entry.id} entry={entry} />
              ))}
            </div>

            <Pagination
              page={joined.data.page}
              totalPages={joined.data.totalPages}
              total={joined.data.total}
              pageSize={joined.data.pageSize}
              onChange={setPage}
              noun="participation"
            />
          </>
        ))}
    </>
  );
}

function JoinedRow({ entry }: { entry: JoinedChallenge }) {
  const percent = (entry.checkInCount / entry.requiredDays) * 100;

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              to={`/challenges/${entry.challenge.id}`}
              className="font-semibold text-slate-900 hover:underline dark:text-slate-100"
            >
              {entry.challenge.title}
            </Link>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {formatDate(entry.challenge.startDate)} – {formatDate(entry.challenge.endDate)} ·
              joined {formatDate(entry.joinedAt.slice(0, 10))}
            </p>
          </div>

          <ParticipationStatusBadge status={entry.status} />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
            <span>
              {entry.checkInCount} of {pluralize(entry.requiredDays, 'day')}
            </span>
            <span>{Math.round(percent)}%</span>
          </div>
          <ProgressBar
            percent={percent}
            tone={entry.completedAt !== null ? 'success' : 'forge'}
            label={`${entry.challenge.title} progress`}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {entry.lastCheckInDate === null
              ? 'No check-ins yet'
              : `Last check-in ${formatDate(entry.lastCheckInDate)}`}
          </p>

          <Link to={`/challenges/${entry.challenge.id}`}>
            <Button size="sm" variant="secondary">
              {entry.completedAt === null ? 'Check in' : 'View'}
            </Button>
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
