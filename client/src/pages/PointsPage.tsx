import { Card, CardBody, PageHeader, StatCard } from '../components/Card';
import { Empty } from '../components/Empty';
import { ErrorState } from '../components/ErrorState';
import { SelectField, TextField } from '../components/Field';
import { Loading } from '../components/Loading';
import { Pagination } from '../components/Pagination';
import { orUndefined, useListQuery } from '../hooks/useListQuery';
import { useLedger, usePointsBalance } from '../hooks/usePoints';
import type { LedgerQuery } from '../services/points';
import { formatPoints, formatTimestamp, toTitle } from '../utils/format';

export function PointsPage() {
  const { query, setFilter, setPage } = useListQuery<LedgerQuery>({
    sortDir: 'DESC',
    pageSize: 20,
  });

  const balance = usePointsBalance();
  const ledger = useLedger(query);

  return (
    <>
      <PageHeader
        title="Points"
        description="Every earn and spend, in order. This log is the balance — nothing stores a total."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Balance"
          value={balance.isSuccess ? formatPoints(balance.data) : '—'}
          detail="Summed from the ledger on every read"
        />
        <StatCard
          label="Entries"
          value={ledger.isSuccess ? ledger.data.total : '—'}
          detail="Matching the current filters"
        />
      </div>

      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Search"
            placeholder="Description"
            value={query.keyword ?? ''}
            onChange={(event) => setFilter('keyword', orUndefined(event.target.value))}
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
          <SelectField
            label="Order"
            value={query.sortDir ?? 'DESC'}
            options={['DESC', 'ASC']}
            hint="Newest or oldest first."
            onChange={(event) => setFilter('sortDir', event.target.value as LedgerQuery['sortDir'])}
          />
        </CardBody>
      </Card>

      {ledger.isPending && <Loading label="Loading your ledger" rows={5} />}
      {ledger.isError && <ErrorState error={ledger.error} onRetry={() => void ledger.refetch()} />}

      {ledger.isSuccess &&
        (ledger.data.items.length === 0 ? (
          <Empty
            filtered
            title="No entries match those filters"
            description="Complete a habit or check in to a challenge to start earning."
          />
        ) : (
          <>
            <Card>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {ledger.data.items.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {entry.description ?? toTitle(entry.reason)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {toTitle(entry.reason)} · {formatTimestamp(entry.createdAt)}
                      </p>
                    </div>

                    {/* Amounts are signed in the table; spending is a negative row, never a deletion. */}
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${
                        entry.amount < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {formatPoints(entry.amount, { signed: true })}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Pagination
              page={ledger.data.page}
              totalPages={ledger.data.totalPages}
              total={ledger.data.total}
              pageSize={ledger.data.pageSize}
              onChange={setPage}
              noun="entry"
              nounPlural="entries"
            />
          </>
        ))}
    </>
  );
}
