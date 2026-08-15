import { useState } from 'react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card, CardBody, PageHeader } from '../components/Card';
import { Empty } from '../components/Empty';
import { ErrorState } from '../components/ErrorState';
import { SelectField, TextAreaField, TextField } from '../components/Field';
import { Loading } from '../components/Loading';
import { Modal } from '../components/Modal';
import { Pagination } from '../components/Pagination';
import { ProgressBar } from '../components/ProgressBar';
import {
  useCompleteHabit,
  useCreateHabit,
  useDeleteHabit,
  useHabits,
  useUpdateHabit,
} from '../hooks/useHabits';
import { orUndefined, useListQuery } from '../hooks/useListQuery';
import type { HabitQuery } from '../services/habits';
import { ApiError } from '../services/api';
import type { HabitSummary } from '../types/api';
import { HabitCategory, valuesOf } from '../types/enums';
import { formatDate, pluralize, toTitle, todayIso } from '../utils/format';

export function HabitsPage() {
  const { query, setFilter, setPage } = useListQuery<HabitQuery>({
    sortBy: 'createdAt',
    sortDir: 'DESC',
    pageSize: 12,
  });

  const habits = useHabits(query);
  const [editing, setEditing] = useState<HabitSummary | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Habits"
        description="Each completion earns points; every unbroken week earns a bonus on top."
        action={<Button onClick={() => setCreating(true)}>New habit</Button>}
      />

      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Search"
            placeholder="Name or description"
            value={query.keyword ?? ''}
            onChange={(event) => setFilter('keyword', orUndefined(event.target.value))}
          />
          <SelectField
            label="Category"
            placeholder="Any category"
            value={query.category ?? ''}
            options={valuesOf(HabitCategory)}
            onChange={(event) =>
              setFilter('category', orUndefined(event.target.value) as HabitCategory | undefined)
            }
          />
          <SelectField
            label="Sort by"
            value={query.sortBy ?? 'createdAt'}
            options={['createdAt', 'name', 'category', 'targetPerWeek']}
            onChange={(event) => setFilter('sortBy', event.target.value as HabitQuery['sortBy'])}
          />
          <SelectField
            label="Archived"
            value={query.includeArchived === true ? 'true' : 'false'}
            options={['false', 'true']}
            onChange={(event) => setFilter('includeArchived', event.target.value === 'true')}
          />
        </CardBody>
      </Card>

      {habits.isPending && <Loading label="Loading your habits" rows={3} />}
      {habits.isError && <ErrorState error={habits.error} onRetry={() => void habits.refetch()} />}

      {habits.isSuccess &&
        (habits.data.items.length === 0 ? (
          <Empty
            filtered={query.keyword !== undefined || query.category !== undefined}
            title={
              query.keyword !== undefined || query.category !== undefined
                ? 'No habits match those filters'
                : 'No habits yet'
            }
            description={
              query.keyword !== undefined || query.category !== undefined
                ? 'Try a different search or clear the category filter.'
                : 'Add the first one — a habit earns points every day you complete it.'
            }
            action={<Button onClick={() => setCreating(true)}>New habit</Button>}
          />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {habits.data.items.map((habit) => (
                <HabitCard key={habit.id} habit={habit} onEdit={() => setEditing(habit)} />
              ))}
            </div>

            <Pagination
              page={habits.data.page}
              totalPages={habits.data.totalPages}
              total={habits.data.total}
              pageSize={habits.data.pageSize}
              onChange={setPage}
              noun="habit"
            />
          </>
        ))}

      {creating && <HabitFormModal onClose={() => setCreating(false)} />}
      {editing !== null && <HabitFormModal habit={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/**
 * One habit, with its streak and this week's progress.
 *
 * Completing is the primary action, and it is disabled once today is already recorded — the server
 * enforces one completion per habit per day with a unique key, so the button is only saving the user a
 * rejected request.
 */
function HabitCard({ habit, onEdit }: { habit: HabitSummary; onEdit: () => void }) {
  const complete = useCompleteHabit();
  const today = todayIso();
  const doneToday = habit.streak.lastCompletedOn === today;

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">{habit.name}</h3>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Badge>{toTitle(habit.category)}</Badge>
              {habit.isArchived && <Badge tone="warning">Archived</Badge>}
            </p>
          </div>

          <div className="text-right">
            <p className="text-forge-600 text-2xl font-bold">{habit.streak.current}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">day streak</p>
          </div>
        </div>

        {habit.description !== null && (
          <p className="text-sm text-slate-600 dark:text-slate-400">{habit.description}</p>
        )}

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              This week: {habit.completionsThisWeek} of {habit.targetPerWeek}
            </span>
            <span>Best: {pluralize(habit.streak.longest, 'day')}</span>
          </div>
          <ProgressBar
            percent={(habit.completionsThisWeek / habit.targetPerWeek) * 100}
            tone={habit.completionsThisWeek >= habit.targetPerWeek ? 'success' : 'forge'}
            label={`${habit.name} weekly progress`}
          />
        </div>

        {complete.isError && <ErrorState error={complete.error} />}

        {complete.isSuccess && complete.data.earnedStreakBonus && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
            Another full week — {complete.data.pointsAwarded} points, including the streak bonus.
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {habit.streak.lastCompletedOn === null
              ? 'Never completed'
              : `Last done ${formatDate(habit.streak.lastCompletedOn)}`}
          </p>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button
              size="sm"
              busy={complete.isPending}
              disabled={doneToday || habit.isArchived}
              onClick={() => complete.mutate({ id: habit.id })}
            >
              {doneToday ? 'Done today' : 'Complete today'}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/** Create and edit share a form, because they differ only in which fields the server will accept. */
function HabitFormModal({ habit, onClose }: { habit?: HabitSummary; onClose: () => void }) {
  const isEdit = habit !== undefined;

  const [name, setName] = useState(habit?.name ?? '');
  const [description, setDescription] = useState(habit?.description ?? '');
  const [category, setCategory] = useState<HabitCategory>(habit?.category ?? HabitCategory.HEALTH);
  const [targetPerWeek, setTargetPerWeek] = useState(String(habit?.targetPerWeek ?? 7));

  const create = useCreateHabit();
  const update = useUpdateHabit();
  const remove = useDeleteHabit();

  const active = isEdit ? update : create;
  const error = active.error instanceof ApiError ? active.error : null;

  const submit = () => {
    const input = {
      name,
      description: description === '' ? undefined : description,
      category,
      targetPerWeek: Number(targetPerWeek),
    };

    if (isEdit) {
      update.mutate({ id: habit.id, input }, { onSuccess: onClose });
    } else {
      create.mutate(input, { onSuccess: onClose });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Edit habit' : 'New habit'}
      footer={
        <>
          {isEdit && (
            <Button
              variant="danger"
              busy={remove.isPending}
              className="mr-auto"
              onClick={() => remove.mutate(habit.id, { onSuccess: onClose })}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={active.isPending} onClick={submit}>
            {isEdit ? 'Save changes' : 'Create habit'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Name"
          value={name}
          required
          error={error?.messageFor('name')}
          onChange={(event) => setName(event.target.value)}
        />

        <TextAreaField
          label="Description"
          value={description}
          rows={3}
          error={error?.messageFor('description')}
          onChange={(event) => setDescription(event.target.value)}
        />

        <SelectField
          label="Category"
          value={category}
          options={valuesOf(HabitCategory)}
          error={error?.messageFor('category')}
          onChange={(event) => setCategory(event.target.value as HabitCategory)}
        />

        <TextField
          label="Target per week"
          type="number"
          min={1}
          max={7}
          value={targetPerWeek}
          hint="Between 1 and 7 days."
          error={error?.messageFor('targetPerWeek')}
          onChange={(event) => setTargetPerWeek(event.target.value)}
        />

        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={habit.isArchived}
              onChange={(event) =>
                update.mutate({ id: habit.id, input: { isArchived: event.target.checked } })
              }
              className="accent-forge-600 size-4 rounded"
            />
            Archived — kept for its history, but no longer completable
          </label>
        )}

        {active.isError && (error === null || error.fieldErrors.length === 0) && (
          <ErrorState error={active.error} />
        )}
        {remove.isError && <ErrorState error={remove.error} />}
      </div>
    </Modal>
  );
}
