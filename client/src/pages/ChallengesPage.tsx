import { Card, CardBody, PageHeader } from '../components/Card';
import { ChallengeCard } from '../components/ChallengeCard';
import { Empty } from '../components/Empty';
import { ErrorState } from '../components/ErrorState';
import { SelectField, TextField } from '../components/Field';
import { Loading } from '../components/Loading';
import { Pagination } from '../components/Pagination';
import { useChallenges } from '../hooks/useChallenges';
import { orUndefined, useListQuery } from '../hooks/useListQuery';
import type { ChallengeQuery } from '../services/challenges';
import { ChallengeCategory, valuesOf } from '../types/enums';

/**
 * The public browse: approved challenges only.
 *
 * That restriction is the server's — this endpoint returns nothing else, to any role. A draft is not
 * filtered out here; it never arrives.
 */
export function ChallengesPage() {
  const { query, setFilter, setPage } = useListQuery<ChallengeQuery>({
    sortBy: 'startDate',
    sortDir: 'ASC',
    pageSize: 12,
  });

  const challenges = useChallenges(query);
  const filtered =
    query.keyword !== undefined ||
    query.category !== undefined ||
    query.dateFrom !== undefined ||
    query.dateTo !== undefined ||
    query.availableOnly === true;

  return (
    <>
      <PageHeader
        title="Challenges"
        description="Time-boxed activities authored by Creators and approved by an Admin."
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
            label="Sort by"
            value={query.sortBy ?? 'startDate'}
            options={['startDate', 'endDate', 'pointsReward', 'capacity', 'title']}
            onChange={(event) =>
              setFilter('sortBy', event.target.value as ChallengeQuery['sortBy'])
            }
          />

          {/* The range selects challenges whose window overlaps it, not ones that start inside it. */}
          <TextField
            label="Running from"
            type="date"
            value={query.dateFrom ?? ''}
            onChange={(event) => setFilter('dateFrom', orUndefined(event.target.value))}
          />
          <TextField
            label="Running to"
            type="date"
            value={query.dateTo ?? ''}
            onChange={(event) => setFilter('dateTo', orUndefined(event.target.value))}
          />
          <SelectField
            label="Availability"
            value={query.availableOnly === true ? 'true' : 'false'}
            options={['false', 'true']}
            hint="'true' hides challenges that are full or finished."
            onChange={(event) => setFilter('availableOnly', event.target.value === 'true')}
          />
        </CardBody>
      </Card>

      {challenges.isPending && <Loading label="Loading challenges" rows={3} />}
      {challenges.isError && (
        <ErrorState error={challenges.error} onRetry={() => void challenges.refetch()} />
      )}

      {challenges.isSuccess &&
        (challenges.data.items.length === 0 ? (
          <Empty
            filtered={filtered}
            title={filtered ? 'No challenges match those filters' : 'No challenges are running'}
            description={
              filtered
                ? 'Try a wider date range, another category, or turn off the availability filter.'
                : 'Approved challenges appear here as Creators publish them.'
            }
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {challenges.data.items.map((challenge) => (
                <ChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  to={`/challenges/${challenge.id}`}
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
