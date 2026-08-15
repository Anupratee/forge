import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card, CardBody, PageHeader } from '../components/Card';
import { ChallengeCard } from '../components/ChallengeCard';
import { Empty } from '../components/Empty';
import { ErrorState } from '../components/ErrorState';
import { SelectField, TextField } from '../components/Field';
import { Loading } from '../components/Loading';
import { Pagination } from '../components/Pagination';
import {
  useAuthoredChallenges,
  useDeleteChallenge,
  useSubmitChallenge,
} from '../hooks/useChallenges';
import { orUndefined, useListQuery } from '../hooks/useListQuery';
import type { AuthoredChallengeQuery } from '../services/challenges';
import type { ChallengeSummary } from '../types/api';
import { ChallengeCategory, ChallengeStatus, valuesOf } from '../types/enums';

/**
 * A Creator's own challenges, at every status.
 *
 * Scoped on the server to the caller — a Creator has no route that returns another Creator's
 * challenges, so there is no ownership check to perform here.
 */
export function AuthoredChallengesPage() {
  const { query, setFilter, setPage } = useListQuery<AuthoredChallengeQuery>({
    sortBy: 'createdAt',
    sortDir: 'DESC',
    pageSize: 12,
  });

  const challenges = useAuthoredChallenges(query);

  return (
    <>
      <PageHeader
        title="My challenges"
        description="Drafts, submissions awaiting approval, and everything already published."
        action={
          <Link to="/authored/new">
            <Button>New challenge</Button>
          </Link>
        }
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
            label="Status"
            placeholder="Any status"
            value={query.status ?? ''}
            options={valuesOf(ChallengeStatus)}
            onChange={(event) =>
              setFilter('status', orUndefined(event.target.value) as ChallengeStatus | undefined)
            }
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
            label="Sort by"
            value={query.sortBy ?? 'createdAt'}
            options={['createdAt', 'startDate', 'title', 'pointsReward']}
            onChange={(event) =>
              setFilter('sortBy', event.target.value as AuthoredChallengeQuery['sortBy'])
            }
          />
        </CardBody>
      </Card>

      {challenges.isPending && <Loading label="Loading your challenges" rows={3} />}
      {challenges.isError && (
        <ErrorState error={challenges.error} onRetry={() => void challenges.refetch()} />
      )}

      {challenges.isSuccess &&
        (challenges.data.items.length === 0 ? (
          <Empty
            filtered={query.status !== undefined || query.keyword !== undefined}
            title="Nothing here yet"
            description="Write a challenge, then submit it for an Admin to approve."
            action={
              <Link to="/authored/new">
                <Button>New challenge</Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {challenges.data.items.map((challenge) => (
                <ChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  footer={<AuthoredActions challenge={challenge} />}
                />
              ))}
            </div>

            <Pagination
              page={challenges.data.page}
              totalPages={challenges.data.totalPages}
              total={challenges.data.total}
              pageSize={challenges.data.pageSize}
              onChange={setPage}
              noun="challenge"
            />
          </>
        ))}
    </>
  );
}

/**
 * What a Creator may do next, decided by status.
 *
 * The same rules live in `services/ChallengeStateMachine.ts` on the server, which is what actually
 * enforces them. These buttons mirror it so the screen does not offer an action that is certain to be
 * refused — a submitted challenge cannot be edited, an approved one cannot be deleted.
 */
function AuthoredActions({ challenge }: { challenge: ChallengeSummary }) {
  const submit = useSubmitChallenge();
  const remove = useDeleteChallenge();

  const editable =
    challenge.status === ChallengeStatus.DRAFT ||
    challenge.status === ChallengeStatus.REJECTED ||
    challenge.status === ChallengeStatus.APPROVED;

  const submittable =
    challenge.status === ChallengeStatus.DRAFT || challenge.status === ChallengeStatus.REJECTED;

  return (
    <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
      {submit.isError && <ErrorState error={submit.error} />}
      {remove.isError && <ErrorState error={remove.error} />}

      <div className="flex flex-wrap gap-2">
        {editable && (
          <Link to={`/authored/${challenge.id}/edit`}>
            <Button size="sm" variant="secondary">
              Edit
            </Button>
          </Link>
        )}

        {submittable && (
          <Button size="sm" busy={submit.isPending} onClick={() => submit.mutate(challenge.id)}>
            Submit for approval
          </Button>
        )}

        {challenge.status === ChallengeStatus.APPROVED && (
          <Link to={`/authored/${challenge.id}/participants`}>
            <Button size="sm" variant="secondary">
              Participants
            </Button>
          </Link>
        )}

        {challenge.status === ChallengeStatus.DRAFT && (
          <Button
            size="sm"
            variant="danger"
            busy={remove.isPending}
            onClick={() => remove.mutate(challenge.id)}
          >
            Delete
          </Button>
        )}
      </div>

      {challenge.status === ChallengeStatus.APPROVED && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Editing the title, dates, capacity, or reward sends this back for approval.
        </p>
      )}
    </div>
  );
}
