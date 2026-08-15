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
import { orUndefined, useListQuery } from '../hooks/useListQuery';
import {
  useAdminRewards,
  useCreateRewardItem,
  useDeleteRewardItem,
  useUpdateRewardItem,
} from '../hooks/useRewards';
import { ApiError } from '../services/api';
import type { RewardQuery } from '../services/rewards';
import type { CosmeticTheme, RewardItemSummary } from '../types/api';
import { RewardItemType, valuesOf } from '../types/enums';
import { formatPoints, toTitle } from '../utils/format';

/** A neutral starting palette for a new cosmetic, so the three colour fields are never empty. */
const DEFAULT_THEME: CosmeticTheme = {
  primary: '#f97316',
  accent: '#0ea5e9',
  surface: '#0f172a',
};

export function AdminStorePage() {
  const { query, setFilter, setPage } = useListQuery<RewardQuery>({
    sortBy: 'createdAt',
    sortDir: 'DESC',
    pageSize: 12,
    includeInactive: true,
  });

  const items = useAdminRewards(query);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RewardItemSummary | null>(null);

  return (
    <>
      <PageHeader
        title="Reward store"
        description="What points can be spent on. Items are deactivated rather than deleted once redeemed."
        action={<Button onClick={() => setCreating(true)}>New item</Button>}
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
            value={query.sortBy ?? 'createdAt'}
            options={['createdAt', 'pointsCost', 'name', 'stock']}
            onChange={(event) => setFilter('sortBy', event.target.value as RewardQuery['sortBy'])}
          />
          <SelectField
            label="Inactive items"
            value={query.includeInactive === true ? 'true' : 'false'}
            options={['true', 'false']}
            hint="Only this listing can show them; the shop never does."
            onChange={(event) => setFilter('includeInactive', event.target.value === 'true')}
          />
        </CardBody>
      </Card>

      {items.isPending && <Loading label="Loading the inventory" rows={3} />}
      {items.isError && <ErrorState error={items.error} onRetry={() => void items.refetch()} />}

      {items.isSuccess &&
        (items.data.items.length === 0 ? (
          <Empty
            filtered={query.keyword !== undefined || query.type !== undefined}
            title="No items"
            description="Add something for users to spend their points on."
            action={<Button onClick={() => setCreating(true)}>New item</Button>}
          />
        ) : (
          <>
            <Card>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {items.data.items.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                        {item.name}
                        <Badge tone={item.type === RewardItemType.COSMETIC ? 'info' : 'success'}>
                          {toTitle(item.type)}
                        </Badge>
                        {!item.isActive && <Badge tone="warning">Inactive</Badge>}
                        {!item.inStock && <Badge tone="danger">Out of stock</Badge>}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-sm text-slate-500 dark:text-slate-400">
                        {item.description}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-forge-600 font-semibold">
                        {formatPoints(item.pointsCost)} pts
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {item.stock} in stock
                      </p>
                    </div>

                    <Button variant="secondary" size="sm" onClick={() => setEditing(item)}>
                      Edit
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>

            <Pagination
              page={items.data.page}
              totalPages={items.data.totalPages}
              total={items.data.total}
              pageSize={items.data.pageSize}
              onChange={setPage}
              noun="item"
            />
          </>
        ))}

      {creating && <ItemFormModal onClose={() => setCreating(false)} />}
      {editing !== null && <ItemFormModal item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ItemFormModal({ item, onClose }: { item?: RewardItemSummary; onClose: () => void }) {
  const isEdit = item !== undefined;

  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [type, setType] = useState<RewardItemType>(item?.type ?? RewardItemType.VOUCHER);
  const [pointsCost, setPointsCost] = useState(String(item?.pointsCost ?? 100));
  const [stock, setStock] = useState(String(item?.stock ?? 10));
  const [theme, setTheme] = useState<CosmeticTheme>(item?.cosmeticTheme ?? DEFAULT_THEME);

  const create = useCreateRewardItem();
  const update = useUpdateRewardItem();
  const remove = useDeleteRewardItem();

  const active = isEdit ? update : create;
  const error = active.error instanceof ApiError ? active.error : null;

  const submit = () => {
    const shared = {
      name,
      description,
      pointsCost: Number(pointsCost),
      stock: Number(stock),
      // A palette only means something for a cosmetic; sending one with a voucher would be noise.
      cosmeticTheme: type === RewardItemType.COSMETIC ? theme : undefined,
    };

    if (isEdit) {
      update.mutate({ id: item.id, input: shared }, { onSuccess: onClose });
    } else {
      create.mutate({ ...shared, type }, { onSuccess: onClose });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Edit item' : 'New reward item'}
      footer={
        <>
          {isEdit && (
            <Button
              variant="danger"
              busy={remove.isPending}
              className="mr-auto"
              onClick={() => remove.mutate(item.id, { onSuccess: onClose })}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={active.isPending} onClick={submit}>
            {isEdit ? 'Save changes' : 'Create item'}
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
          required
          hint="At least 10 characters."
          error={error?.messageFor('description')}
          onChange={(event) => setDescription(event.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Type is fixed after creation — redemptions already recorded assume it. */}
          <SelectField
            label="Type"
            value={type}
            options={valuesOf(RewardItemType)}
            disabled={isEdit}
            error={error?.messageFor('type')}
            onChange={(event) => setType(event.target.value as RewardItemType)}
          />

          <TextField
            label="Cost"
            type="number"
            min={1}
            value={pointsCost}
            required
            error={error?.messageFor('pointsCost')}
            onChange={(event) => setPointsCost(event.target.value)}
          />

          <TextField
            label="Stock"
            type="number"
            min={0}
            value={stock}
            required
            error={error?.messageFor('stock')}
            onChange={(event) => setStock(event.target.value)}
          />
        </div>

        {type === RewardItemType.COSMETIC && (
          <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              Cosmetic palette
            </legend>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Stored as data, so a new theme needs no client release.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              {(['primary', 'accent', 'surface'] as const).map((slot) => (
                <TextField
                  key={slot}
                  label={toTitle(slot)}
                  type="color"
                  value={theme[slot]}
                  className="h-10 p-1"
                  error={error?.messageFor(`cosmeticTheme.${slot}`)}
                  onChange={(event) => setTheme({ ...theme, [slot]: event.target.value })}
                />
              ))}
            </div>
          </fieldset>
        )}

        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={item.isActive}
              onChange={(event) =>
                update.mutate({ id: item.id, input: { isActive: event.target.checked } })
              }
              className="accent-forge-600 size-4 rounded"
            />
            Active — visible in the shop
          </label>
        )}

        {/* Deleting a redeemed item deactivates it instead; the server says which happened. */}
        {remove.isSuccess && remove.data !== null && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            {remove.data.message}
          </p>
        )}

        {active.isError && (error === null || error.fieldErrors.length === 0) && (
          <ErrorState error={active.error} />
        )}
        {remove.isError && <ErrorState error={remove.error} />}
      </div>
    </Modal>
  );
}
