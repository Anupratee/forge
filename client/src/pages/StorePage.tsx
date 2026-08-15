import { useState } from 'react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card, CardBody, CardHeader, PageHeader } from '../components/Card';
import { Empty } from '../components/Empty';
import { ErrorState } from '../components/ErrorState';
import { SelectField, TextField } from '../components/Field';
import { Loading } from '../components/Loading';
import { Pagination } from '../components/Pagination';
import { orUndefined, useListQuery } from '../hooks/useListQuery';
import { usePointsBalance } from '../hooks/usePoints';
import { useRedeem, useRedemptions, useStore } from '../hooks/useRewards';
import { uploadUrl } from '../services/api';
import type { RewardQuery } from '../services/rewards';
import type { RewardItemSummary } from '../types/api';
import { RewardItemType, valuesOf } from '../types/enums';
import { formatPoints, formatTimestamp, toTitle } from '../utils/format';

export function StorePage() {
  const { query, setFilter, setPage } = useListQuery<RewardQuery>({
    sortBy: 'pointsCost',
    sortDir: 'ASC',
    pageSize: 12,
  });

  const store = useStore(query);
  const balance = usePointsBalance();

  return (
    <>
      <PageHeader
        title="Reward store"
        description="Spend what your habits, streaks, and challenges have earned."
        action={
          balance.isSuccess ? (
            <div className="text-right">
              <p className="text-forge-600 text-2xl font-bold">{formatPoints(balance.data)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">points available</p>
            </div>
          ) : undefined
        }
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
            label="Type"
            placeholder="Any type"
            value={query.type ?? ''}
            options={valuesOf(RewardItemType)}
            onChange={(event) =>
              setFilter('type', orUndefined(event.target.value) as RewardItemType | undefined)
            }
          />
          <SelectField
            label="Sort by"
            value={query.sortBy ?? 'pointsCost'}
            options={['pointsCost', 'name', 'createdAt']}
            onChange={(event) => setFilter('sortBy', event.target.value as RewardQuery['sortBy'])}
          />
          <SelectField
            label="Availability"
            value={query.availableOnly === true ? 'true' : 'false'}
            options={['false', 'true']}
            hint="'true' hides items that are out of stock."
            onChange={(event) => setFilter('availableOnly', event.target.value === 'true')}
          />
        </CardBody>
      </Card>

      {store.isPending && <Loading label="Loading the store" rows={3} />}
      {store.isError && <ErrorState error={store.error} onRetry={() => void store.refetch()} />}

      {store.isSuccess &&
        (store.data.items.length === 0 ? (
          <Empty
            filtered
            title="Nothing matches those filters"
            description="Try another type, or clear the in-stock filter."
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {store.data.items.map((item) => (
                <StoreItemCard key={item.id} item={item} balance={balance.data ?? 0} />
              ))}
            </div>

            <Pagination
              page={store.data.page}
              totalPages={store.data.totalPages}
              total={store.data.total}
              pageSize={store.data.pageSize}
              onChange={setPage}
              noun="item"
            />
          </>
        ))}

      <RedemptionHistory />
    </>
  );
}

function StoreItemCard({ item, balance }: { item: RewardItemSummary; balance: number }) {
  const redeem = useRedeem();
  const affordable = balance >= item.pointsCost;

  return (
    <Card className="flex flex-col">
      {item.image !== null && (
        <img src={uploadUrl(item.image)} alt="" className="h-32 w-full rounded-t-xl object-cover" />
      )}

      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">{item.name}</h3>
          <Badge tone={item.type === RewardItemType.COSMETIC ? 'info' : 'success'}>
            {toTitle(item.type)}
          </Badge>
        </div>

        <p className="flex-1 text-sm text-slate-600 dark:text-slate-400">{item.description}</p>

        {/* A cosmetic's palette is data, so it can be previewed without a client release. */}
        {item.cosmeticTheme !== null && (
          <div className="flex gap-1.5" aria-hidden="true">
            {[
              item.cosmeticTheme.primary,
              item.cosmeticTheme.accent,
              item.cosmeticTheme.surface,
            ].map((colour) => (
              <span
                key={colour}
                className="size-5 rounded-full border border-slate-300 dark:border-slate-700"
                style={{ backgroundColor: colour }}
              />
            ))}
          </div>
        )}

        {redeem.isError && <ErrorState error={redeem.error} />}

        {redeem.isSuccess && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
            Redeemed.
            {redeem.data.redemption.voucherCode !== null && (
              <>
                {' '}
                Code{' '}
                <span className="font-mono font-semibold">
                  {redeem.data.redemption.voucherCode}
                </span>
                .
              </>
            )}{' '}
            Balance is now {formatPoints(redeem.data.balance)}.
          </p>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <div>
            <p className="text-forge-600 font-bold">{formatPoints(item.pointsCost)} pts</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {item.inStock ? `${item.stock} in stock` : 'Out of stock'}
            </p>
          </div>

          {/*
            Disabled when it cannot succeed, but the server is still the authority: it row-locks the
            buyer and the item inside one transaction, so two people racing for the last unit get a
            201 and a 409 rather than a negative balance or negative stock.
          */}
          <Button
            size="sm"
            busy={redeem.isPending}
            disabled={!item.inStock || !affordable || redeem.isSuccess}
            onClick={() => redeem.mutate(item.id)}
          >
            {!item.inStock ? 'Out of stock' : affordable ? 'Redeem' : 'Not enough points'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function RedemptionHistory() {
  const [page, setPage] = useState(1);
  const redemptions = useRedemptions({ page, pageSize: 5, sortDir: 'DESC' });

  return (
    <Card>
      <CardHeader
        title="Your redemptions"
        description="Everything you have bought, most recent first."
      />

      {redemptions.isPending && (
        <CardBody>
          <Loading label="Loading your redemptions" rows={2} />
        </CardBody>
      )}

      {redemptions.isError && (
        <CardBody>
          <ErrorState error={redemptions.error} />
        </CardBody>
      )}

      {redemptions.isSuccess &&
        (redemptions.data.items.length === 0 ? (
          <CardBody>
            <Empty title="Nothing redeemed yet" description="Points you spend will show up here." />
          </CardBody>
        ) : (
          <>
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {redemptions.data.items.map((redemption) => (
                <li
                  key={redemption.id}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {redemption.item.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatTimestamp(redemption.redeemedAt)}
                      {redemption.voucherCode !== null && (
                        <>
                          {' · '}
                          <span className="font-mono">{redemption.voucherCode}</span>
                        </>
                      )}
                    </p>
                  </div>

                  {/* The price paid is copied onto the row, so re-pricing the store never rewrites it. */}
                  <span className="shrink-0 font-semibold tabular-nums text-red-600 dark:text-red-400">
                    −{formatPoints(redemption.pointsSpent)}
                  </span>
                </li>
              ))}
            </ul>

            <CardBody className="pt-0">
              <Pagination
                page={redemptions.data.page}
                totalPages={redemptions.data.totalPages}
                total={redemptions.data.total}
                pageSize={redemptions.data.pageSize}
                onChange={setPage}
                noun="redemption"
              />
            </CardBody>
          </>
        ))}
    </Card>
  );
}
