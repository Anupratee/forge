import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { HabitCategory } from '../entities/Habit';
import { ISO_DATE_PATTERN } from '../utils/date';
import { ListQueryDto, toQueryBoolean } from './ListQueryDto';

/**
 * Habit request bodies and query.
 *
 * Grouped in one module because they are small and only ever change together — splitting four ten-line
 * classes across four files would be filing rather than structure.
 *
 * Notably absent from all of them: any points value. What a completion is worth is policy owned by
 * `PointsPolicy`, and a user-settable reward on a habit they created themselves would be an unlimited
 * supply of points.
 */
export class CreateHabitDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(HabitCategory)
  category!: HabitCategory;

  /** Days a week the user is aiming for. The database enforces the same 1–7 bound. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  targetPerWeek?: number;
}

export class UpdateHabitDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(HabitCategory)
  category?: HabitCategory;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  targetPerWeek?: number;

  /**
   * Archiving is how a habit with history is retired. Deleting one would orphan the ledger entries that
   * reference its completions, so the service permits a real delete only while it has none.
   *
   * No transform here: this arrives in a JSON body as a real boolean, unlike a query string.
   */
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

/** Recording a completion. The date defaults to today and may be backfilled, never set in the future. */
export class CompleteHabitDto {
  @IsOptional()
  @Matches(ISO_DATE_PATTERN, { message: 'date must be a date in YYYY-MM-DD form' })
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export const HABIT_SORT_FIELDS = ['name', 'category', 'createdAt', 'targetPerWeek'] as const;
export type HabitSortField = (typeof HABIT_SORT_FIELDS)[number];

export class HabitQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(HabitCategory)
  category?: HabitCategory;

  @IsOptional()
  @IsIn(HABIT_SORT_FIELDS, { message: `sortBy must be one of: ${HABIT_SORT_FIELDS.join(', ')}` })
  sortBy?: HabitSortField;

  /** Archived habits are hidden unless asked for. Coerced, because it arrives on the query string. */
  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  includeArchived?: boolean;
}
