import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
} from 'class-validator';
import { ExpenseCategory } from '../entities/Expense';
import { ISO_MONTH_PATTERN } from '../utils/date';
import { MAX_MONEY_AMOUNT } from '../utils/numeric.transformer';
import { ListQueryDto } from './ListQueryDto';

export class CreateBudgetGoalDto {
  @IsString()
  @Length(2, 140)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  /** The month to cap, as `2026-08`. The service expands it to the stored `2026-08-01`. */
  @Matches(ISO_MONTH_PATTERN, { message: 'month must be in YYYY-MM form' })
  month!: string;

  /**
   * `IsNumber` with two decimal places rather than `IsInt` — a budget of 8000.50 is legitimate. The upper
   * bound matches the column, so an over-large value is a 400 naming the field rather than a numeric
   * overflow from PostgreSQL surfacing as a 500.
   */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_MONEY_AMOUNT)
  limitAmount!: number;
}

/**
 * Editing a goal. Neither `month` nor `category` can change: together with the owner they are the goal's
 * identity and the natural key expenses are matched on, so changing one would silently re-point the goal at
 * a different set of expenses. Delete and recreate instead.
 */
export class UpdateBudgetGoalDto {
  @IsOptional()
  @IsString()
  @Length(2, 140)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_MONEY_AMOUNT)
  limitAmount?: number;
}

export const BUDGET_SORT_FIELDS = ['periodMonth', 'category', 'limitAmount', 'createdAt'] as const;
export type BudgetSortField = (typeof BUDGET_SORT_FIELDS)[number];

export class BudgetQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @Matches(ISO_MONTH_PATTERN, { message: 'month must be in YYYY-MM form' })
  month?: string;

  @IsOptional()
  @IsIn(BUDGET_SORT_FIELDS, { message: `sortBy must be one of: ${BUDGET_SORT_FIELDS.join(', ')}` })
  sortBy?: BudgetSortField;
}

/** The month a summary is asked for, defaulting to the current one. */
export class MonthQueryDto {
  @IsOptional()
  @Matches(ISO_MONTH_PATTERN, { message: 'month must be in YYYY-MM form' })
  month?: string;
}
