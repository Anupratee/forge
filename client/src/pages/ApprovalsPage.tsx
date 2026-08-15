import { useState } from 'react';
import { Button } from '../components/Button';
import { Card, CardBody, PageHeader } from '../components/Card';
import { ChallengeCard } from '../components/ChallengeCard';
import { Empty } from '../components/Empty';
import { ErrorState } from '../components/ErrorState';
import { SelectField, TextAreaField, TextField } from '../components/Field';
import { Loading } from '../components/Loading';
import { Modal } from '../components/Modal';
import { Pagination } from '../components/Pagination';
import {
  useApproveChallenge,
  usePendingChallenges,
  useRejectChallenge,
} from '../hooks/useChallenges';
import { orUndefined, useListQuery } from '../hooks/useListQuery';
import { ApiError } from '../services/api';
import type { ChallengeQuery } from '../services/challenges';
import type { ChallengeSummary } from '../types/api';
import { ChallengeCategory, valuesOf } from '../types/enums';

/**
 * The approval queue — the gate everything a User can see passes through.
 *
 * Approval is Admin-only at the route *and* in the state machine, so a Creator cannot approve their own
 * work even if this screen were reachable. Rejection requires a reason, because "rejected" with no
 * explanation gives the Creator nothing to act on.
 */
export function ApprovalsPage() {
  const { query, setFilter, setPage } = useListQuery<ChallengeQuery>({
    sortBy: 'createdAt',
    sortDir: 'ASC',
    pageSize: 12,
  });

  const pending = usePendingChallenges(query);
  const [rejecting, setRejecting] = useState<ChallengeSummary | null>(null);

  return (
    <>
      <PageHeader
        title="Approval queue"
        description="Nothing is visible to Users until it is approved here."
      />

      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            options={valuesOf(ChallengeCategory)}
            onChange={(event) =>
              setFilter(
                'category',
                orUndefined(event.target.value) as ChallengeCategory | undefined,
              )
            }
          />
          <SelectField
            label="Order"
            value={query.sortDir ?? 'ASC'}
            options={['ASC', 'DESC']}
            hint="Oldest submissions first by default."
            onChange={(event) =>
              setFilter('sortDir', event.target.value as ChallengeQuery['sortDir'])
            }
          />
        </CardBody>
      </Card>

      {pending.isPending && <Loading label="Loading the queue" rows={3} />}
      {pending.isError && (
        <ErrorState error={pending.error} onRetry={() => void pending.refetch()} />
      )}

      {pending.isSuccess &&
        (pending.data.items.length === 0 ? (
          <Empty
            title="Nothing is waiting for review"
            description="Challenges appear here the moment a Creator submits one."
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pending.data.items.map((challenge) => (
                <ChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  footer={
                    <ReviewActions challenge={challenge} onReject={() => setRejecting(challenge)} />
                  }
                />
              ))}
            </div>

            <Pagination
              page={pending.data.page}
              totalPages={pending.data.totalPages}
              total={pending.data.total}
              pageSize={pending.data.pageSize}
              onChange={setPage}
              noun="submission"
            />
          </>
        ))}

      {rejecting !== null && (
        <RejectModal challenge={rejecting} onClose={() => setRejecting(null)} />
      )}
    </>
  );
}

function ReviewActions({
  challenge,
  onReject,
}: {
  challenge: ChallengeSummary;
  onReject: () => void;
}) {
  const approve = useApproveChallenge();

  return (
    <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
      {approve.isError && <ErrorState error={approve.error} />}

      <div className="flex gap-2">
        <Button size="sm" busy={approve.isPending} onClick={() => approve.mutate(challenge.id)}>
          Approve
        </Button>
        <Button size="sm" variant="danger" onClick={onReject}>
          Reject
        </Button>
      </div>
    </div>
  );
}

function RejectModal({ challenge, onClose }: { challenge: ChallengeSummary; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const reject = useRejectChallenge();
  const error = reject.error instanceof ApiError ? reject.error : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reject "${challenge.title}"`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            busy={reject.isPending}
            onClick={() => reject.mutate({ id: challenge.id, reason }, { onSuccess: onClose })}
          >
            Reject
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          The Creator sees this reason and can edit and resubmit. Rejecting does not delete their
          work.
        </p>

        <TextAreaField
          label="Reason"
          value={reason}
          rows={4}
          required
          hint="At least 10 characters."
          error={error?.messageFor('reason')}
          onChange={(event) => setReason(event.target.value)}
        />

        {reject.isError && (error === null || error.fieldErrors.length === 0) && (
          <ErrorState error={reject.error} />
        )}
      </div>
    </Modal>
  );
}
