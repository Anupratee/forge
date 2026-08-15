import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card, PageHeader, StatCard } from '../components/Card';
import { Empty } from '../components/Empty';
import { ErrorState } from '../components/ErrorState';
import { Loading } from '../components/Loading';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../hooks/useAuth';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useListQuery } from '../hooks/useListQuery';
import { useUpdateProfile } from '../hooks/useProfile';
import type { LeaderboardEntry } from '../types/api';
import { formatPoints } from '../utils/format';

/**
 * Public standings over the points ledger.
 *
 * Opting out is not a display filter — the server excludes an account from the ranking query entirely,
 * so a user who has not opted in has no standing for anyone to see, including this page.
 */
export function LeaderboardPage() {
  const { query, setPage } = useListQuery<{ page?: number; pageSize?: number }>({ pageSize: 20 });
  const leaderboard = useLeaderboard(query);
  const { user } = useAuth();
  const updateProfile = useUpdateProfile();

  const optedIn = user?.leaderboardOptIn ?? false;

  return (
    <>
      <PageHeader
        title="Leaderboard"
        description="Ranked by points earned. Ties share a position."
        action={
          <Button
            variant={optedIn ? 'secondary' : 'primary'}
            busy={updateProfile.isPending}
            onClick={() => updateProfile.mutate({ leaderboardOptIn: !optedIn })}
          >
            {optedIn ? 'Leave the leaderboard' : 'Join the leaderboard'}
          </Button>
        }
      />

      {updateProfile.isError && <ErrorState error={updateProfile.error} />}

      {leaderboard.isSuccess && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Your rank"
            value={leaderboard.data.me.rank ?? '—'}
            detail={leaderboard.data.me.optedIn ? 'Among everyone taking part' : 'Not taking part'}
          />
          <StatCard
            label="Your points"
            value={leaderboard.data.me.optedIn ? formatPoints(leaderboard.data.me.balance) : '—'}
          />
          <StatCard label="Taking part" value={leaderboard.data.total} />
        </div>
      )}

      {/*
        Explains the empty rank rather than leaving a dash unexplained. The balance is the user's own
        to read on their points screen — this page reports only what the ranking contains.
      */}
      {!optedIn && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          You are not on the leaderboard, so you have no rank here and nobody can see your points.
          Joining shows your display name and points total to other members.
        </p>
      )}

      {leaderboard.isPending && <Loading label="Loading the standings" rows={5} />}
      {leaderboard.isError && (
        <ErrorState error={leaderboard.error} onRetry={() => void leaderboard.refetch()} />
      )}

      {leaderboard.isSuccess &&
        (leaderboard.data.items.length === 0 ? (
          <Empty
            title="Nobody has joined yet"
            description="The leaderboard is opt-in, so it stays empty until people choose to appear."
          />
        ) : (
          <>
            <Card>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {leaderboard.data.items.map((entry) => (
                  <LeaderboardRow key={entry.userId} entry={entry} />
                ))}
              </ul>
            </Card>

            <Pagination
              page={leaderboard.data.page}
              totalPages={leaderboard.data.totalPages}
              total={leaderboard.data.total}
              pageSize={leaderboard.data.pageSize}
              onChange={setPage}
              noun="member"
            />
          </>
        ))}
    </>
  );
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <li
      className={`flex items-center gap-4 px-5 py-3 ${
        entry.isSelf ? 'bg-forge-50/60 dark:bg-forge-600/10' : ''
      }`}
    >
      <span className="w-10 shrink-0 text-lg font-bold tabular-nums text-slate-400">
        {entry.rank}
      </span>

      {/*
        The cosmetic someone bought, shown where other people actually see it. This is the payoff for
        spending points on one, and the palette is data from the store rather than anything hardcoded.
      */}
      <span
        aria-hidden="true"
        className="size-8 shrink-0 rounded-full border border-slate-300 dark:border-slate-700"
        style={
          entry.theme === null
            ? undefined
            : {
                background: `linear-gradient(135deg, ${entry.theme.primary}, ${entry.theme.accent})`,
              }
        }
      />

      <span className="min-w-0 flex-1 truncate font-medium text-slate-900 dark:text-slate-100">
        {entry.displayName}
        {entry.isSelf && (
          <>
            {' '}
            <Badge tone="info">You</Badge>
          </>
        )}
      </span>

      <span className="text-forge-600 shrink-0 font-semibold tabular-nums">
        {formatPoints(entry.balance)}
      </span>
    </li>
  );
}
