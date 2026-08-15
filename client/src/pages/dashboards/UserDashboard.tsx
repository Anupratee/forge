import { Link } from 'react-router-dom';
import { Badge, ParticipationStatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card, CardBody, CardHeader, PageHeader, StatCard } from '../../components/Card';
import { Empty } from '../../components/Empty';
import { ErrorState } from '../../components/ErrorState';
import { Loading } from '../../components/Loading';
import { ProgressBar } from '../../components/ProgressBar';
import { useMonthSummary } from '../../hooks/useBudgets';
import { useAuth } from '../../hooks/useAuth';
import { useJoinedChallenges } from '../../hooks/useChallenges';
import { useCompleteHabit, useHabits } from '../../hooks/useHabits';
import { usePointsBalance } from '../../hooks/usePoints';
import {
  currentMonthIso,
  formatMoney,
  formatMonth,
  formatPoints,
  pluralize,
  toTitle,
  todayIso,
} from '../../utils/format';

/**
 * The User's home: habits and streaks, this month's budget, joined challenges, and the balance.
 *
 * Each panel reads one endpoint and hands off to the screen that owns that area, so this stays a
 * summary rather than becoming a second, divergent copy of every feature.
 */
export function UserDashboard() {
  const { user } = useAuth();
  const balance = usePointsBalance();
  const habits = useHabits({ pageSize: 4, sortBy: 'createdAt', sortDir: 'DESC' });
  const budget = useMonthSummary(currentMonthIso());
  const joined = useJoinedChallenges({ pageSize: 3, sortDir: 'DESC' });

  const activeStreaks = habits.data?.items.filter((habit) => habit.streak.current > 0).length ?? 0;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.displayName ?? ''}`}
        description="Everything you are tracking, in one place."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Points"
          value={balance.isSuccess ? formatPoints(balance.data) : '—'}
          detail="Summed from your ledger"
        />
        <StatCard
          label="Habits"
          value={habits.isSuccess ? habits.data.total : '—'}
          detail={`${activeStreaks} with a live streak`}
        />
        <StatCard
          label="Spent this month"
          value={budget.isSuccess ? formatMoney(budget.data.totalSpent) : '—'}
          detail={
            budget.isSuccess ? `of ${formatMoney(budget.data.totalBudgeted)} budgeted` : undefined
          }
        />
        <StatCard label="Challenges joined" value={joined.isSuccess ? joined.data.total : '—'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <HabitsPanel />
        <BudgetPanel />
      </div>

      <ChallengesPanel />
    </>
  );
}

function HabitsPanel() {
  const habits = useHabits({ pageSize: 4, sortBy: 'createdAt', sortDir: 'DESC' });
  const complete = useCompleteHabit();
  const today = todayIso();

  return (
    <Card>
      <CardHeader
        title="Habits"
        description="Complete one to earn points; hold a week for the streak bonus."
        action={
          <Link to="/habits" className="text-forge-600 text-sm font-medium hover:underline">
            All habits
          </Link>
        }
      />

      <CardBody className="space-y-4">
        {habits.isPending && <Loading label="Loading habits" rows={2} />}
        {habits.isError && <ErrorState error={habits.error} />}

        {habits.isSuccess &&
          (habits.data.items.length === 0 ? (
            <Empty
              title="No habits yet"
              description="Start with one — daily is easier than perfect."
              action={
                <Link to="/habits">
                  <Button size="sm">Add a habit</Button>
                </Link>
              }
            />
          ) : (
            habits.data.items.map((habit) => {
              const doneToday = habit.streak.lastCompletedOn === today;

              return (
                <div key={habit.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                      {habit.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {pluralize(habit.streak.current, 'day')} streak · {habit.completionsThisWeek}/
                      {habit.targetPerWeek} this week
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant={doneToday ? 'secondary' : 'primary'}
                    disabled={doneToday || habit.isArchived}
                    busy={complete.isPending && complete.variables?.id === habit.id}
                    onClick={() => complete.mutate({ id: habit.id })}
                  >
                    {doneToday ? 'Done' : 'Complete'}
                  </Button>
                </div>
              );
            })
          ))}

        {complete.isError && <ErrorState error={complete.error} />}
      </CardBody>
    </Card>
  );
}

function BudgetPanel() {
  const month = currentMonthIso();
  const budget = useMonthSummary(month);

  return (
    <Card>
      <CardHeader
        title={`Budget — ${formatMonth(month)}`}
        description="Spending against the limits you set."
        action={
          <Link to="/budget" className="text-forge-600 text-sm font-medium hover:underline">
            Manage
          </Link>
        }
      />

      <CardBody className="space-y-4">
        {budget.isPending && <Loading label="Loading your budget" rows={2} />}
        {budget.isError && <ErrorState error={budget.error} />}

        {budget.isSuccess &&
          (budget.data.goals.length === 0 ? (
            <Empty
              title="No goals this month"
              description="Set a limit and your expenses will track against it automatically."
              action={
                <Link to="/budget">
                  <Button size="sm">Set a goal</Button>
                </Link>
              }
            />
          ) : (
            budget.data.goals.slice(0, 4).map((goal) => (
              <div key={goal.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <Badge>{toTitle(goal.category)}</Badge>
                    <span className="text-slate-600 dark:text-slate-400">{goal.title}</span>
                  </span>
                  <span
                    className={
                      goal.isOverBudget
                        ? 'font-semibold text-red-600 dark:text-red-400'
                        : 'text-slate-500'
                    }
                  >
                    {formatMoney(goal.spentAmount)} / {formatMoney(goal.limitAmount)}
                  </span>
                </div>
                <ProgressBar
                  percent={goal.usedPercent}
                  tone={goal.isOverBudget ? 'danger' : 'success'}
                  label={`${goal.title} budget used`}
                />
              </div>
            ))
          ))}
      </CardBody>
    </Card>
  );
}

function ChallengesPanel() {
  const joined = useJoinedChallenges({ pageSize: 3, sortDir: 'DESC' });

  return (
    <Card>
      <CardHeader
        title="Your challenges"
        description="Check in daily to earn, and finish every day for the completion reward."
        action={
          <Link to="/my-challenges" className="text-forge-600 text-sm font-medium hover:underline">
            All joined
          </Link>
        }
      />

      <CardBody className="space-y-4">
        {joined.isPending && <Loading label="Loading your challenges" rows={2} />}
        {joined.isError && <ErrorState error={joined.error} />}

        {joined.isSuccess &&
          (joined.data.items.length === 0 ? (
            <Empty
              title="Not in any challenge"
              description="Joining one adds social accountability to the habits you already track."
              action={
                <Link to="/challenges">
                  <Button size="sm">Browse challenges</Button>
                </Link>
              }
            />
          ) : (
            joined.data.items.map((entry) => (
              <div key={entry.id} className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    to={`/challenges/${entry.challenge.id}`}
                    className="font-medium text-slate-900 hover:underline dark:text-slate-100"
                  >
                    {entry.challenge.title}
                  </Link>
                  <ParticipationStatusBadge status={entry.status} />
                </div>

                <ProgressBar
                  percent={(entry.checkInCount / entry.requiredDays) * 100}
                  tone={entry.completedAt !== null ? 'success' : 'forge'}
                  label={`${entry.challenge.title} progress`}
                />

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {entry.checkInCount} of {pluralize(entry.requiredDays, 'day')} checked in
                </p>
              </div>
            ))
          ))}
      </CardBody>
    </Card>
  );
}
