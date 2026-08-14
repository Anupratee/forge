import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { ChallengeCategory, ChallengeStatus } from '../entities/Challenge';
import { ListQueryDto } from './ListQueryDto';

/**
 * The columns a challenge list may be ordered by.
 *
 * An allow-list, because `sortBy` reaches an ORDER BY clause. Interpolating a free-text value there is an
 * injection; mapping a validated member of this list to a column is not.
 */
export const CHALLENGE_SORT_FIELDS = [
  'startDate',
  'endDate',
  'pointsReward',
  'capacity',
  'title',
  'createdAt',
] as const;

export type ChallengeSortField = (typeof CHALLENGE_SORT_FIELDS)[number];

/**
 * Browsing challenges: the shared filters plus a category and a sort column.
 *
 * There is deliberately no `status` here. The public browse shows approved challenges and nothing else, so
 * accepting a status and overriding it would let a client ask for drafts and receive approved rows with no
 * indication their filter was discarded. Because unknown properties are rejected by name, `?status=DRAFT`
 * gets an explicit 400 instead.
 */
export class ChallengeQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(ChallengeCategory)
  category?: ChallengeCategory;

  @IsOptional()
  @IsIn(CHALLENGE_SORT_FIELDS, {
    message: `sortBy must be one of: ${CHALLENGE_SORT_FIELDS.join(', ')}`,
  })
  sortBy?: ChallengeSortField;
}

/**
 * A Creator listing their own challenges, where filtering by status is the point — it is how the dashboard
 * separates drafts from what is awaiting review from what is live.
 */
export class OwnedChallengeQueryDto extends ChallengeQueryDto {
  @IsOptional()
  @IsEnum(ChallengeStatus)
  status?: ChallengeStatus;
}
