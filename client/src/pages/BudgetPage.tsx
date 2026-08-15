import { useState } from 'react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card, CardBody, CardHeader, PageHeader, StatCard } from '../components/Card';
import { Empty } from '../components/Empty';
import { ErrorState } from '../components/ErrorState';
import { SelectField, TextAreaField, TextField } from '../components/Field';
import { Loading } from '../components/Loading';
import { Modal } from '../components/Modal';
import { ProgressBar } from '../components/ProgressBar';
import {
  useClaimAdherence,
  useCreateBudgetGoal,
  useDeleteBudgetGoal,
  useMonthSummary,
  useUpdateBudgetGoal,
} from '../hooks/useBudgets';
import { ApiError } from '../services/api';
import type { BudgetGoalSummary } from '../types/api';
import { ExpenseCategory, valuesOf } from '../types/enums';
import { currentMonthIso, formatMoney, formatMonth, toTitle } from '../utils/format';

export function BudgetPage() {
  const [month, setMonth] = useState(currentMonthIso());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BudgetGoalSummary | null>(null);

  const summary = useMonthSummary(month);

  return (
    <>
      <PageHeader
        title="Budget"
        description="One goal per category per month. Hold a limit through the month and claim a bonus."
        action={<Button onClick={() => setCreating(true)}>New goal</Button>}
      />

      <Card>
        <CardBody className="flex flex-wrap items-end gap-4">
          <div className="w-48">
            <TextField
              label="Month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </div>
          <p className="pb-2 text-sm text-slate-500 dark:text-slate-400">
            Showing {formatMonth(month)}
          </p>
        </CardBody>
      </Card>

      {summary.isPending && <Loading label="Loading your budget" rows={2} />}
      {summary.isError && (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      )}

      {summary.isSuccess && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Budgeted" value={formatMoney(summary.data.totalBudgeted)} />
            <StatCard label="Spent" value={formatMoney(summary.data.totalSpent)} />
            <StatCard
              label="Remaining"
              value={formatMoney(summary.data.totalBudgeted - summary.data.totalSpent)}
              detail="Across categories with a goal"
            />
          </div>

          {summary.data.goals.length === 0 ? (
            <Empty
              title={`No goals for ${formatMonth(month)}`}
              description="Set a limit for a category and every expense you log will count against it."
              action={<Button onClick={() => setCreating(true)}>New goal</Button>}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {summary.data.goals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} onEdit={() => setEditing(goal)} />
              ))}
            </div>
          )}

          {/*
            Spending in categories no goal covers. Worth showing on its own: the totals above only
            count budgeted categories, so without this the page would quietly omit real money.
          */}
          {summary.data.unbudgetedSpend.length > 0 && (
            <Card>
              <CardHeader
                title="Spending with no goal"
                description="Real spending this month in categories you have not budgeted for."
              />
              <CardBody className="flex flex-wrap gap-3">
                {summary.data.unbudgetedSpend.map((entry) => (
                  <div
                    key={entry.category}
                    className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
                  >
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {toTitle(entry.category)}
                    </p>
                    <p className="font-semibold">{formatMoney(entry.amount)}</p>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </>
      )}

      {creating && <GoalFormModal month={month} onClose={() => setCreating(false)} />}
      {editing !== null && (
        <GoalFormModal month={month} goal={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function GoalCard({ goal, onEdit }: { goal: BudgetGoalSummary; onEdit: () => void }) {
  const claim = useClaimAdherence();

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">{goal.title}</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-2">
              <Badge>{toTitle(goal.category)}</Badge>
              {goal.isOverBudget && <Badge tone="danger">Over budget</Badge>}
              {goal.adherenceClaimed && <Badge tone="success">Bonus claimed</Badge>}
            </p>
          </div>

          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-400">
              {formatMoney(goal.spentAmount)} of {formatMoney(goal.limitAmount)}
            </span>
            <span
              className={
                goal.isOverBudget
                  ? 'font-semibold text-red-600 dark:text-red-400'
                  : 'text-slate-500'
              }
            >
              {goal.usedPercent}%
            </span>
          </div>
          <ProgressBar
            percent={goal.usedPercent}
            tone={goal.isOverBudget ? 'danger' : 'success'}
            label={`${goal.title} budget used`}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {goal.isOverBudget
              ? `${formatMoney(-goal.remainingAmount)} over`
              : `${formatMoney(goal.remainingAmount)} left`}
          </p>
        </div>

        {claim.isError && <ErrorState error={claim.error} />}

        {claim.isSuccess && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
            Claimed {claim.data.pointsAwarded} points. Balance is now {claim.data.balance}.
          </p>
        )}

        {/*
          The claim only appears once the month has closed and the limit held — the server decides
          both, and refuses a second claim with a unique key on the ledger rather than a pre-check.
        */}
        {goal.adherenceClaimable && !goal.adherenceClaimed && (
          <Button size="sm" busy={claim.isPending} onClick={() => claim.mutate(goal.id)}>
            Claim the adherence bonus
          </Button>
        )}
      </CardBody>
    </Card>
  );
}

function GoalFormModal({
  month,
  goal,
  onClose,
}: {
  month: string;
  goal?: BudgetGoalSummary;
  onClose: () => void;
}) {
  const isEdit = goal !== undefined;

  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [category, setCategory] = useState<ExpenseCategory>(goal?.category ?? ExpenseCategory.FOOD);
  const [limitAmount, setLimitAmount] = useState(String(goal?.limitAmount ?? ''));

  const create = useCreateBudgetGoal();
  const update = useUpdateBudgetGoal();
  const remove = useDeleteBudgetGoal();

  const active = isEdit ? update : create;
  const error = active.error instanceof ApiError ? active.error : null;

  const submit = () => {
    if (isEdit) {
      update.mutate(
        {
          id: goal.id,
          input: {
            title,
            description: description === '' ? undefined : description,
            limitAmount: Number(limitAmount),
          },
        },
        { onSuccess: onClose },
      );
      return;
    }

    create.mutate(
      {
        title,
        description: description === '' ? undefined : description,
        category,
        month,
        limitAmount: Number(limitAmount),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Edit goal' : `New goal for ${formatMonth(month)}`}
      footer={
        <>
          {isEdit && (
            <Button
              variant="danger"
              busy={remove.isPending}
              className="mr-auto"
              onClick={() => remove.mutate(goal.id, { onSuccess: onClose })}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={active.isPending} onClick={submit}>
            {isEdit ? 'Save changes' : 'Create goal'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Title"
          value={title}
          required
          error={error?.messageFor('title')}
          onChange={(event) => setTitle(event.target.value)}
        />

        <TextAreaField
          label="Description"
          value={description}
          rows={3}
          error={error?.messageFor('description')}
          onChange={(event) => setDescription(event.target.value)}
        />

        {/*
          Category and month identify which goal this is, so the server rejects changing them —
          moving a goal to another month would rewrite what it had been measured against.
        */}
        <SelectField
          label="Category"
          value={category}
          options={valuesOf(ExpenseCategory)}
          disabled={isEdit}
          hint={isEdit ? 'A goal cannot change category or month once created.' : undefined}
          error={error?.messageFor('category')}
          onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
        />

        <TextField
          label="Limit"
          type="number"
          min="0.01"
          step="0.01"
          value={limitAmount}
          required
          error={error?.messageFor('limitAmount')}
          onChange={(event) => setLimitAmount(event.target.value)}
        />

        {active.isError && (error === null || error.fieldErrors.length === 0) && (
          <ErrorState error={active.error} />
        )}
        {remove.isError && <ErrorState error={remove.error} />}
      </div>
    </Modal>
  );
}
