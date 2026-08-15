import { useState } from 'react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card, CardBody, PageHeader, StatCard } from '../components/Card';
import { Empty } from '../components/Empty';
import { ErrorState } from '../components/ErrorState';
import { SelectField, TextAreaField, TextField } from '../components/Field';
import { Loading } from '../components/Loading';
import { Modal } from '../components/Modal';
import { Pagination } from '../components/Pagination';
import {
  useCreateExpense,
  useDeleteExpense,
  useExpenses,
  useUpdateExpense,
} from '../hooks/useExpenses';
import { orUndefined, useListQuery } from '../hooks/useListQuery';
import { ApiError, uploadUrl } from '../services/api';
import type { ExpenseQuery } from '../services/expenses';
import type { ExpenseSummary } from '../types/api';
import { ExpenseCategory, ExpenseSource, valuesOf } from '../types/enums';
import { formatDate, formatMoney, toTitle, todayIso } from '../utils/format';

export function ExpensesPage() {
  const { query, setFilter, setPage } = useListQuery<ExpenseQuery>({
    sortBy: 'spentOn',
    sortDir: 'DESC',
    pageSize: 20,
  });

  const expenses = useExpenses(query);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ExpenseSummary | null>(null);

  const filtered =
    query.keyword !== undefined ||
    query.category !== undefined ||
    query.dateFrom !== undefined ||
    query.dateTo !== undefined;

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Private to you. Each one counts against the goal covering its month and category."
        action={<Button onClick={() => setCreating(true)}>Log expense</Button>}
      />

      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Search"
            placeholder="Title or description"
            value={query.keyword ?? ''}
            onChange={(event) => setFilter('keyword', orUndefined(event.target.value))}
          />
          <SelectField
            label="Category"
            placeholder="Any category"
            value={query.category ?? ''}
            options={valuesOf(ExpenseCategory)}
            onChange={(event) =>
              setFilter('category', orUndefined(event.target.value) as ExpenseCategory | undefined)
            }
          />
          <TextField
            label="From"
            type="date"
            value={query.dateFrom ?? ''}
            onChange={(event) => setFilter('dateFrom', orUndefined(event.target.value))}
          />
          <TextField
            label="To"
            type="date"
            value={query.dateTo ?? ''}
            onChange={(event) => setFilter('dateTo', orUndefined(event.target.value))}
          />
        </CardBody>
      </Card>

      {expenses.isPending && <Loading label="Loading your expenses" rows={4} />}
      {expenses.isError && (
        <ErrorState error={expenses.error} onRetry={() => void expenses.refetch()} />
      )}

      {expenses.isSuccess && (
        <>
          {/*
            The totals come from a SQL aggregate over everything matching the filters, not from the
            page — the page is 20 rows, and "how much did I spend on food" is not 20 rows.
          */}
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Total matching these filters"
              value={formatMoney(expenses.data.matchingTotal)}
            />
            <StatCard label="Expenses matching" value={expenses.data.matchingCount} />
          </div>

          {expenses.data.items.length === 0 ? (
            <Empty
              filtered={filtered}
              title={filtered ? 'No expenses match those filters' : 'Nothing logged yet'}
              description={
                filtered
                  ? 'Try widening the date range or clearing the category.'
                  : 'Log what you spend and your budget goals will track it automatically.'
              }
              action={<Button onClick={() => setCreating(true)}>Log expense</Button>}
            />
          ) : (
            <Card>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {expenses.data.items.map((expense) => (
                  <button
                    key={expense.id}
                    type="button"
                    onClick={() => setEditing(expense)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {expense.title}
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <Badge>{toTitle(expense.category)}</Badge>
                        {formatDate(expense.spentOn)}
                        {expense.source !== ExpenseSource.MANUAL && (
                          <Badge tone="info">{toTitle(expense.source)}</Badge>
                        )}
                      </p>
                    </div>

                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatMoney(expense.amount)}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Pagination
            page={expenses.data.page}
            totalPages={expenses.data.totalPages}
            total={expenses.data.total}
            pageSize={expenses.data.pageSize}
            onChange={setPage}
            noun="expense"
          />
        </>
      )}

      {creating && <ExpenseFormModal onClose={() => setCreating(false)} />}
      {editing !== null && <ExpenseFormModal expense={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ExpenseFormModal({ expense, onClose }: { expense?: ExpenseSummary; onClose: () => void }) {
  const isEdit = expense !== undefined;

  const [title, setTitle] = useState(expense?.title ?? '');
  const [description, setDescription] = useState(expense?.description ?? '');
  const [amount, setAmount] = useState(String(expense?.amount ?? ''));
  const [category, setCategory] = useState<ExpenseCategory>(
    expense?.category ?? ExpenseCategory.FOOD,
  );
  const [spentOn, setSpentOn] = useState(expense?.spentOn ?? todayIso());
  const [receipt, setReceipt] = useState<File | undefined>(undefined);

  const create = useCreateExpense();
  const update = useUpdateExpense();
  const remove = useDeleteExpense();

  const active = isEdit ? update : create;
  const error = active.error instanceof ApiError ? active.error : null;

  const submit = () => {
    const input = {
      title,
      description: description === '' ? undefined : description,
      amount: Number(amount),
      category,
      spentOn,
    };

    if (isEdit) {
      update.mutate({ id: expense.id, input, receiptImage: receipt }, { onSuccess: onClose });
    } else {
      create.mutate({ input, receiptImage: receipt }, { onSuccess: onClose });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Edit expense' : 'Log an expense'}
      footer={
        <>
          {isEdit && (
            <Button
              variant="danger"
              busy={remove.isPending}
              className="mr-auto"
              onClick={() => remove.mutate(expense.id, { onSuccess: onClose })}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={active.isPending} onClick={submit}>
            {isEdit ? 'Save changes' : 'Log expense'}
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

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            required
            error={error?.messageFor('amount')}
            onChange={(event) => setAmount(event.target.value)}
          />

          <TextField
            label="Spent on"
            type="date"
            value={spentOn}
            required
            error={error?.messageFor('spentOn')}
            onChange={(event) => setSpentOn(event.target.value)}
          />
        </div>

        <SelectField
          label="Category"
          value={category}
          options={valuesOf(ExpenseCategory)}
          error={error?.messageFor('category')}
          onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
        />

        <TextAreaField
          label="Description"
          value={description}
          rows={3}
          error={error?.messageFor('description')}
          onChange={(event) => setDescription(event.target.value)}
        />

        <div className="space-y-1.5">
          <label
            htmlFor="receipt"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Receipt image
          </label>
          <input
            id="receipt"
            type="file"
            accept="image/*"
            onChange={(event) => setReceipt(event.target.files?.[0])}
            className="file:bg-forge-50 file:text-forge-700 hover:file:bg-forge-100 w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-2 file:text-sm file:font-medium"
          />
          {isEdit && expense.receiptImage !== null && receipt === undefined && (
            <a
              href={uploadUrl(expense.receiptImage)}
              target="_blank"
              rel="noreferrer"
              className="text-forge-600 text-xs hover:underline"
            >
              View the current receipt
            </a>
          )}
        </div>

        {active.isError && (error === null || error.fieldErrors.length === 0) && (
          <ErrorState error={active.error} />
        )}
        {remove.isError && <ErrorState error={remove.error} />}
      </div>
    </Modal>
  );
}
