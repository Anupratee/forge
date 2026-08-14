import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from '../utils/pagination';
import { ISO_DATE_PATTERN } from '../utils/date';

export type SortDirection = 'ASC' | 'DESC';

/**
 * Query-string coercion: `"true"` and `"false"` become booleans, anything else is left alone so
 * `@IsBoolean` rejects it.
 *
 * Mapping unrecognised values to `false` instead would make the validator unreachable, and
 * `?availableOnly=yes` would quietly mean "no".
 */
export function toQueryBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/** Normalises `?sortDir=desc` so callers need not shout. */
function toUpperCase({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.toUpperCase() : value;
}

/**
 * The filters every list endpoint accepts.
 *
 * Per-resource subclasses add `category` and `sortBy`, because the valid values for those differ by
 * resource and a free-text `sortBy` reaching an ORDER BY clause is an injection. Everything general —
 * keyword, date range, direction, pagination, availability — is defined once here.
 *
 * Values arrive as strings on the query string, so numbers and booleans are coerced before validation.
 * That is why every numeric field carries `@Type`: without it `page=2` would fail `@IsInt` as `"2"`.
 */
export class ListQueryDto {
  /** Free text, matched case-insensitively against the resource's own text columns. */
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'keyword must not be blank' })
  keyword?: string;

  /**
   * Inclusive date range, `YYYY-MM-DD`. What it filters is resource-specific and documented on each
   * endpoint — for challenges it selects windows that overlap the range, for expenses the day spent.
   */
  @IsOptional()
  @Matches(ISO_DATE_PATTERN, { message: 'dateFrom must be a date in YYYY-MM-DD form' })
  dateFrom?: string;

  @IsOptional()
  @Matches(ISO_DATE_PATTERN, { message: 'dateTo must be a date in YYYY-MM-DD form' })
  dateTo?: string;

  @IsOptional()
  @Transform(toUpperCase)
  @IsIn(['ASC', 'DESC'], { message: 'sortDir must be ASC or DESC' })
  sortDir?: SortDirection;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;

  /**
   * Hides what cannot be acted on. Availability is defined per resource: a challenge that is not full
   * and whose window has not closed, a reward item still in stock.
   */
  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  availableOnly?: boolean;
}
