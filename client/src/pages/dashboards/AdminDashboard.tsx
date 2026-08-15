import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card, CardBody, CardHeader, PageHeader, StatCard } from '../../components/Card';
import { ChallengeCard } from '../../components/ChallengeCard';
import { Empty } from '../../components/Empty';
import { ErrorState } from '../../components/ErrorState';
import { Loading } from '../../components/Loading';
import { useSystemSummary } from '../../hooks/useAdmin';
import { useAuth } from '../../hooks/useAuth';
import { usePendingChallenges } from '../../hooks/useChallenges';
import { formatPoints, toTitle } from '../../utils/format';

/**
 * The Admin's home: what is waiting for review, and platform-wide figures.
 *
 * Everything shown is an aggregate or a challenge awaiting approval. There is no panel here for a
 * user's habits, budgets, or expenses — not because it is hidden, but because the API exposes no route
 * that would return them to an Admin. That is a property of the server, and the Phase 8 tests assert it.
 */
export function AdminDashboard() {
  const { user } = useAuth();
  const summary = useSystemSummary();
  const pending = usePendingChallenges({ pageSize: 3, sortDir: 'ASC', sortBy: 'createdAt' });

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.displayName ?? ''}`}
        description="Governance: the approval queue, the reward store, and how the platform is doing."
        action={
          <Link to="/admin/approvals">
            <Button>Review queue</Button>
          </Link>
        }
      />

      {summary.isPending && <Loading label="Loading system figures" rows={2} />}
      {summary.isError && (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      )}

      {summary.isSuccess && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Accounts"
              value={summary.data.users.total}
              detail={`${summary.data.users.suspended} suspended`}
            />
            <StatCard
              label="Challenges"
              value={summary.data.challenges.total}
              detail={`${summary.data.challenges.byStatus.PENDING_APPROVAL} awaiting review`}
            />
            <StatCard
              label="Points awarded"
              value={formatPoints(summary.data.economy.pointsAwarded)}
              detail={`${formatPoints(summary.data.economy.pointsSpent)} spent`}
            />
            <StatCard
              label="Redemptions"
              value={summary.data.economy.redemptions}
              detail="Items bought with points"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Accounts by role"
                description="One role per account, set at sign-up."
              />
              <CardBody className="space-y-2">
                {Object.entries(summary.data.users.byRole).map(([role, count]) => (
                  <div key={role} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">{toTitle(role)}</span>
                    <span className="font-semibold tabular-nums">{count}</span>
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Challenges by status"
                description="The lifecycle, across every Creator."
              />
              <CardBody className="space-y-2">
                {Object.entries(summary.data.challenges.byStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">{toTitle(status)}</span>
                    <span className="font-semibold tabular-nums">{count}</span>
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader
          title="Waiting for review"
          description="Nothing here is visible to Users until it is approved."
          action={
            <Link
              to="/admin/approvals"
              className="text-forge-600 text-sm font-medium hover:underline"
            >
              Full queue
            </Link>
          }
        />

        <CardBody>
          {pending.isPending && <Loading label="Loading the queue" rows={2} />}
          {pending.isError && <ErrorState error={pending.error} />}

          {pending.isSuccess &&
            (pending.data.items.length === 0 ? (
              <Empty
                title="The queue is clear"
                description="Submissions appear here as Creators send them for approval."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pending.data.items.map((challenge) => (
                  <ChallengeCard key={challenge.id} challenge={challenge} />
                ))}
              </div>
            ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Reward store"
          description="What points can be spent on."
          action={
            <Link to="/admin/store">
              <Button size="sm" variant="secondary">
                Manage the store
              </Button>
            </Link>
          }
        />
      </Card>
    </>
  );
}
