import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card, CardBody, CardHeader, PageHeader, StatCard } from '../../components/Card';
import { ChallengeStatusBadge } from '../../components/Badge';
import { Empty } from '../../components/Empty';
import { ErrorState } from '../../components/ErrorState';
import { Loading } from '../../components/Loading';
import { ProgressBar } from '../../components/ProgressBar';
import { useAuth } from '../../hooks/useAuth';
import { useAuthoredChallenges } from '../../hooks/useChallenges';
import { ChallengeStatus } from '../../types/enums';
import { formatDate } from '../../utils/format';

/**
 * The Creator's home: their own challenges, what each is waiting on, and how their participants are doing.
 *
 * Every number here is derived from one endpoint — the Creator's own challenge list. There is no
 * cross-Creator view to build, because the API has none: a Creator cannot see another Creator's
 * challenges or participants at all.
 */
export function CreatorDashboard() {
  const { user } = useAuth();

  // A generous page, because these counts describe the whole portfolio rather than a page of it.
  const challenges = useAuthoredChallenges({ pageSize: 100, sortDir: 'DESC', sortBy: 'createdAt' });

  const items = challenges.data?.items ?? [];
  const countOf = (status: ChallengeStatus) =>
    items.filter((challenge) => challenge.status === status).length;

  const approved = items.filter((challenge) => challenge.status === ChallengeStatus.APPROVED);
  const totalParticipants = items.reduce((sum, challenge) => sum + challenge.participantCount, 0);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.displayName ?? ''}`}
        description="Your challenges and the people taking part in them."
        action={
          <Link to="/authored/new">
            <Button>New challenge</Button>
          </Link>
        }
      />

      {challenges.isPending && <Loading label="Loading your challenges" rows={3} />}
      {challenges.isError && (
        <ErrorState error={challenges.error} onRetry={() => void challenges.refetch()} />
      )}

      {challenges.isSuccess && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Drafts"
              value={countOf(ChallengeStatus.DRAFT)}
              detail="Not yet submitted"
            />
            <StatCard
              label="Awaiting approval"
              value={countOf(ChallengeStatus.PENDING_APPROVAL)}
              detail="With an Admin"
            />
            <StatCard
              label="Live"
              value={countOf(ChallengeStatus.APPROVED)}
              detail={`${countOf(ChallengeStatus.ENDED)} finished`}
            />
            <StatCard
              label="Participants"
              value={totalParticipants}
              detail="Across everything you have published"
            />
          </div>

          {/*
            Rejections come first: they are the only status with something the Creator must act on,
            and the reason is the actionable part.
          */}
          {countOf(ChallengeStatus.REJECTED) > 0 && (
            <Card>
              <CardHeader
                title="Needs your attention"
                description="An Admin sent these back. Edit and resubmit when you have addressed the reason."
              />
              <CardBody className="space-y-3">
                {items
                  .filter((challenge) => challenge.status === ChallengeStatus.REJECTED)
                  .map((challenge) => (
                    <div
                      key={challenge.id}
                      className="rounded-lg border border-red-200 p-3 dark:border-red-900/60"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {challenge.title}
                        </p>
                        <Link to={`/authored/${challenge.id}/edit`}>
                          <Button size="sm" variant="secondary">
                            Edit and resubmit
                          </Button>
                        </Link>
                      </div>
                      {challenge.rejectionReason !== null && (
                        <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                          {challenge.rejectionReason}
                        </p>
                      )}
                    </div>
                  ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Live challenges"
              description="Approved and visible to Users. Open one to see individual progress."
              action={
                <Link to="/authored" className="text-forge-600 text-sm font-medium hover:underline">
                  All challenges
                </Link>
              }
            />

            <CardBody className="space-y-4">
              {approved.length === 0 ? (
                <Empty
                  title="Nothing live yet"
                  description="Write a challenge and submit it — an Admin approves it before anyone can join."
                  action={
                    <Link to="/authored/new">
                      <Button size="sm">New challenge</Button>
                    </Link>
                  }
                />
              ) : (
                approved.slice(0, 5).map((challenge) => (
                  <div key={challenge.id} className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <Link
                          to={`/authored/${challenge.id}/participants`}
                          className="font-medium text-slate-900 hover:underline dark:text-slate-100"
                        >
                          {challenge.title}
                        </Link>
                        <ChallengeStatusBadge status={challenge.status} />
                      </span>

                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {challenge.participantCount} / {challenge.capacity} joined
                      </span>
                    </div>

                    <ProgressBar
                      percent={(challenge.participantCount / challenge.capacity) * 100}
                      tone={challenge.isFull ? 'danger' : 'forge'}
                      label={`${challenge.title} capacity`}
                    />

                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(challenge.startDate)} – {formatDate(challenge.endDate)}
                    </p>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </>
      )}
    </>
  );
}
