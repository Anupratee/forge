import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card, CardBody, PageHeader } from '../components/Card';
import { Empty } from '../components/Empty';
import { ErrorState } from '../components/ErrorState';
import { SelectField, TextField } from '../components/Field';
import { Loading } from '../components/Loading';
import { Pagination } from '../components/Pagination';
import { useAdminUsers, useSetUserRole, useSetUserStatus } from '../hooks/useAdminUsers';
import { orUndefined, useListQuery } from '../hooks/useListQuery';
import type { AdminUserQuery } from '../services/admin';
import type { ManagedUser } from '../types/api';
import { Role, UserStatus, valuesOf } from '../types/enums';
import { formatTimestamp, toTitle } from '../utils/format';

/**
 * Account management: who exists, what role they hold, and whether they may sign in.
 *
 * Deliberately narrow. There is no delete — removing an account would orphan its ledger history and any
 * challenges it created, both of which must stay readable — and nothing here reads a user's habits,
 * budgets, or expenses, because the API has no route that would return them to an Admin.
 */
export function AdminUsersPage() {
  const { query, setFilter, setPage } = useListQuery<AdminUserQuery>({
    sortBy: 'createdAt',
    sortDir: 'DESC',
    pageSize: 20,
  });

  const users = useAdminUsers(query);
  const filtered =
    query.keyword !== undefined || query.role !== undefined || query.status !== undefined;

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Suspend, reactivate, and change roles. Accounts are never deleted."
      />

      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Search"
            placeholder="Name or email"
            value={query.keyword ?? ''}
            onChange={(event) => setFilter('keyword', orUndefined(event.target.value))}
          />
          <SelectField
            label="Role"
            placeholder="Any role"
            value={query.role ?? ''}
            options={valuesOf(Role)}
            onChange={(event) =>
              setFilter('role', orUndefined(event.target.value) as Role | undefined)
            }
          />
          <SelectField
            label="Status"
            placeholder="Any status"
            value={query.status ?? ''}
            options={valuesOf(UserStatus)}
            onChange={(event) =>
              setFilter('status', orUndefined(event.target.value) as UserStatus | undefined)
            }
          />
          <SelectField
            label="Sort by"
            value={query.sortBy ?? 'createdAt'}
            options={['createdAt', 'displayName', 'email', 'role', 'lastLoginAt']}
            onChange={(event) =>
              setFilter('sortBy', event.target.value as AdminUserQuery['sortBy'])
            }
          />
        </CardBody>
      </Card>

      {users.isPending && <Loading label="Loading accounts" rows={5} />}
      {users.isError && <ErrorState error={users.error} onRetry={() => void users.refetch()} />}

      {users.isSuccess &&
        (users.data.items.length === 0 ? (
          <Empty
            filtered={filtered}
            title={filtered ? 'No accounts match those filters' : 'No accounts'}
            description={filtered ? 'Try a different search, role, or status.' : undefined}
          />
        ) : (
          <>
            <Card>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {users.data.items.map((account) => (
                  <AccountRow key={account.id} account={account} />
                ))}
              </ul>
            </Card>

            <Pagination
              page={users.data.page}
              totalPages={users.data.totalPages}
              total={users.data.total}
              pageSize={users.data.pageSize}
              onChange={setPage}
              noun="account"
            />
          </>
        ))}
    </>
  );
}

function AccountRow({ account }: { account: ManagedUser }) {
  const setStatus = useSetUserStatus();
  const setRole = useSetUserRole();

  const suspended = account.status === UserStatus.SUSPENDED;

  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
            {account.displayName}
            <Badge tone={suspended ? 'danger' : 'success'}>{toTitle(account.status)}</Badge>
            {account.isSelf && <Badge tone="info">You</Badge>}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {account.email} ·{' '}
            {account.lastLoginAt === null
              ? 'never signed in'
              : `last seen ${formatTimestamp(account.lastLoginAt)}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/*
            An Admin's own controls are absent rather than disabled-with-a-tooltip: the server refuses
            self-suspension and self-role-changes outright, because either would lock the platform's
            only governing role out of the screen that could undo it.
          */}
          {account.isSelf ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              You cannot change your own role or status.
            </p>
          ) : (
            <>
              <div className="w-40">
                <SelectField
                  label="Role"
                  value={account.role}
                  options={valuesOf(Role)}
                  disabled={setRole.isPending}
                  onChange={(event) =>
                    setRole.mutate({ id: account.id, role: event.target.value as Role })
                  }
                />
              </div>

              <Button
                variant={suspended ? 'primary' : 'danger'}
                size="sm"
                busy={setStatus.isPending}
                onClick={() =>
                  setStatus.mutate({
                    id: account.id,
                    status: suspended ? UserStatus.ACTIVE : UserStatus.SUSPENDED,
                  })
                }
              >
                {suspended ? 'Reactivate' : 'Suspend'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/*
        The interesting failure is demoting the last active Admin, which the server refuses with a 409 —
        the message explains why, so it is shown rather than replaced with something generic.
      */}
      {setRole.isError && <ErrorState error={setRole.error} />}
      {setStatus.isError && <ErrorState error={setStatus.error} />}

      {setStatus.isSuccess && setStatus.data.status === UserStatus.SUSPENDED && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Suspended. Their existing token stops working on their next request — the API re-reads
          status every time rather than trusting the token.
        </p>
      )}
    </li>
  );
}
