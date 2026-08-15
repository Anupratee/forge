import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card, CardBody, CardHeader, PageHeader, StatCard } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { SelectField, TextField } from '../components/Field';
import { Loading } from '../components/Loading';
import {
  useConfirmImport,
  useImportOptions,
  usePreviewCsv,
  usePreviewStatement,
} from '../hooks/useImport';
import type { CreateExpenseInput } from '../services/expenses';
import type { ImportPreview, PreviewRow } from '../types/api';
import { ExpenseCategory, ExpenseSource, valuesOf } from '../types/enums';
import { formatMoney } from '../utils/format';

type Method = 'csv' | 'ai';

/**
 * Import expenses from a file, in two steps that never blur into one.
 *
 * **Nothing is written until Confirm.** The upload step parses and validates and hands back what it
 * found; this screen lets the user fix what is wrong and drop what they do not want; only then does
 * anything reach the database. That separation is what makes an imperfect extractor — a bank's own CSV
 * export, or a model reading a PDF — safe to offer at all.
 *
 * The two methods differ only in how rows are produced. Past that point they share this screen, the
 * same validation, and the same write, so there is one definition of an acceptable imported expense.
 */
export function ImportExpensesPage() {
  const options = useImportOptions();
  const [method, setMethod] = useState<Method>('csv');
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const csv = usePreviewCsv();
  const statement = usePreviewStatement();
  const active = method === 'csv' ? csv : statement;

  return (
    <>
      <PageHeader
        title="Import expenses"
        description="Upload a file, review what was found, then save what you accept."
        action={
          <Link to="/expenses" className="text-forge-600 text-sm font-medium hover:underline">
            Back to expenses
          </Link>
        }
      />

      {preview === null ? (
        <Card>
          <CardHeader title="Choose a file" description="Nothing is saved at this step." />

          <CardBody className="space-y-5">
            {options.isSuccess && options.data.ai && (
              <div className="flex gap-2">
                {(['csv', 'ai'] as const).map((option) => (
                  <Button
                    key={option}
                    variant={method === option ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setMethod(option)}
                  >
                    {option === 'csv' ? 'CSV file' : 'Bank statement (PDF)'}
                  </Button>
                ))}
              </div>
            )}

            {/*
              The AI route needs an API key the server may not have. When it does not, the tab is
              absent rather than present-and-failing — the specification's stated fallback is manual
              and CSV entry, and this is what that looks like.
            */}
            {options.isSuccess && !options.data.ai && (
              <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Statement reading is not configured on this server, so CSV import is the option
                available.
              </p>
            )}

            {method === 'csv' ? <CsvHelp /> : <StatementHelp />}

            <input
              type="file"
              accept={method === 'csv' ? '.csv' : '.pdf'}
              disabled={active.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file === undefined) return;
                active.mutate(file, { onSuccess: setPreview });
              }}
              className="file:bg-forge-50 file:text-forge-700 hover:file:bg-forge-100 w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-2 file:text-sm file:font-medium"
            />

            {active.isPending && (
              <Loading
                label={
                  method === 'csv'
                    ? 'Reading your file'
                    : 'Reading the statement — this takes a moment'
                }
              />
            )}

            {active.isError && <ErrorState error={active.error} />}
          </CardBody>
        </Card>
      ) : (
        <ReviewStep
          preview={preview}
          source={method === 'csv' ? ExpenseSource.CSV_IMPORT : ExpenseSource.AI_IMPORT}
          onStartOver={() => setPreview(null)}
        />
      )}
    </>
  );
}

function CsvHelp() {
  return (
    <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
      <p>
        A header row plus one row per expense. Column names are matched loosely, so{' '}
        <span className="font-mono text-xs">Date</span>,{' '}
        <span className="font-mono text-xs">spent_on</span>, and{' '}
        <span className="font-mono text-xs">Transaction Date</span> all work.
      </p>
      <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-800">
        title,amount,category,date,description{'\n'}
        Groceries,42.50,FOOD,2026-08-03,Weekly shop
      </pre>
    </div>
  );
}

function StatementHelp() {
  return (
    <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
      <p>
        A bank or card statement as a PDF. Outgoing transactions are extracted; credits, refunds,
        and balance lines are skipped.
      </p>
      <p>
        Everything found is a suggestion you review and edit before anything is saved — check the
        dates especially, since statements write them in several ways.
      </p>
    </div>
  );
}

/**
 * The review step: fix, drop, and confirm.
 *
 * Rows the server rejected start excluded and cannot be included until they are fixed, so a confirm can
 * only ever send rows that currently look valid — while the server still re-validates every one of
 * them, because this screen is a convenience and not the authority.
 */
function ReviewStep({
  preview,
  source,
  onStartOver,
}: {
  preview: ImportPreview;
  source: typeof ExpenseSource.CSV_IMPORT | typeof ExpenseSource.AI_IMPORT;
  onStartOver: () => void;
}) {
  const [rows, setRows] = useState<PreviewRow[]>(preview.rows);
  const [excluded, setExcluded] = useState<Set<number>>(
    () => new Set(preview.rows.filter((row) => row.errors.length > 0).map((row) => row.line)),
  );

  const confirm = useConfirmImport();

  const accepted = rows.filter((row) => !excluded.has(row.line));
  const total = accepted.reduce((sum, row) => sum + (row.draft.amount ?? 0), 0);

  const update = (line: number, patch: Partial<PreviewRow['draft']>) => {
    setRows((current) =>
      current.map((row) =>
        row.line === line ? { ...row, draft: { ...row.draft, ...patch } } : row,
      ),
    );
  };

  const toggle = (line: number) => {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  };

  if (confirm.isSuccess) {
    return (
      <Card>
        <CardBody className="space-y-4 text-center">
          <p className="text-3xl" aria-hidden="true">
            ✅
          </p>
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">
            Imported {confirm.data.imported} expenses
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            They count against any budget goal covering their month and category.
          </p>
          <div className="flex justify-center gap-3">
            <Link to="/expenses">
              <Button>View expenses</Button>
            </Link>
            <Button variant="secondary" onClick={onStartOver}>
              Import another file
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Rows found" value={preview.rows.length} />
        <StatCard
          label="Will be saved"
          value={accepted.length}
          detail={`${rows.length - accepted.length} excluded`}
        />
        <StatCard label="Total" value={formatMoney(total)} />
      </div>

      {preview.truncated && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          That file had more rows than one import can carry, so only the first {preview.rows.length}{' '}
          are shown. Import these, then upload the rest.
        </p>
      )}

      {preview.invalidCount > 0 && (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {preview.invalidCount} rows could not be read cleanly and start excluded. Fix a row to
          include it, or leave it out.
        </p>
      )}

      <Card>
        <CardHeader title="Review" description="Edit anything that looks wrong before saving." />

        <CardBody className="space-y-4">
          {rows.map((row) => (
            <ReviewRow
              key={row.line}
              row={row}
              excluded={excluded.has(row.line)}
              onToggle={() => toggle(row.line)}
              onChange={(patch) => update(row.line, patch)}
            />
          ))}
        </CardBody>
      </Card>

      {confirm.isError && <ErrorState error={confirm.error} />}

      <div className="flex flex-wrap gap-3">
        <Button
          busy={confirm.isPending}
          disabled={accepted.length === 0}
          onClick={() =>
            confirm.mutate({
              source,
              // Cast rather than re-validate: rows reaching here have every required field, and the
              // server checks them again regardless — this screen is not the authority on validity.
              rows: accepted.map((row) => row.draft as CreateExpenseInput),
            })
          }
        >
          Save {accepted.length} expenses
        </Button>

        <Button variant="secondary" onClick={onStartOver}>
          Start over
        </Button>
      </div>
    </>
  );
}

function ReviewRow({
  row,
  excluded,
  onToggle,
  onChange,
}: {
  row: PreviewRow;
  excluded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<PreviewRow['draft']>) => void;
}) {
  const messageFor = (field: string) =>
    row.errors.find((failure) => failure.field === field)?.messages.join(' ');

  return (
    <div
      className={`space-y-3 rounded-lg border p-3 ${
        excluded
          ? 'border-slate-200 opacity-60 dark:border-slate-800'
          : 'border-slate-300 dark:border-slate-700'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={!excluded}
            onChange={onToggle}
            className="accent-forge-600 size-4 rounded"
          />
          Row {row.line}
        </label>

        {row.errors.length > 0 && <Badge tone="danger">Needs a fix</Badge>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextField
          label="Title"
          value={row.draft.title ?? ''}
          error={messageFor('title')}
          onChange={(event) => onChange({ title: event.target.value })}
        />
        <TextField
          label="Amount"
          type="number"
          min="0.01"
          step="0.01"
          value={row.draft.amount ?? ''}
          error={messageFor('amount')}
          onChange={(event) => onChange({ amount: Number(event.target.value) })}
        />
        <SelectField
          label="Category"
          placeholder="Choose one"
          value={row.draft.category ?? ''}
          options={valuesOf(ExpenseCategory)}
          error={messageFor('category')}
          onChange={(event) => onChange({ category: event.target.value as ExpenseCategory })}
        />
        <TextField
          label="Spent on"
          type="date"
          value={row.draft.spentOn ?? ''}
          error={messageFor('spentOn')}
          onChange={(event) => onChange({ spentOn: event.target.value })}
        />
      </div>
    </div>
  );
}
