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
import { ISO_DATE_PATTERN } from '../utils/date';
import { MAX_MONEY_AMOUNT } from '../utils/numeric.transformer';
import { ListQueryDto } from './ListQueryDto';

/**
 * Expense request bodies and query.
 *
 * `source` is absent from both write DTOs on purpose. Whether a row was typed in, imported from a CSV, or
 * extracted from a statement is a fact the server knows and the client should not be able to assert —
 * being able to relabel a manual entry as an import would make the audit trail worthless.
 */
export class CreateExpenseDto {
  @IsString()
  @Length(2, 140)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_MONEY_AMOUNT)
  amount!: number;

  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  /** The day the money was spent. This is what assigns the expense to a budget month. */
  @Matches(ISO_DATE_PATTERN, { message: 'spentOn must be a date in YYYY-MM-DD form' })
  spentOn!: string;
}

export class UpdateExpenseDto {
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
  amount?: number;

  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @Matches(ISO_DATE_PATTERN, { message: 'spentOn must be a date in YYYY-MM-DD form' })
  spentOn?: string;
}

export const EXPENSE_SORT_FIELDS = ['spentOn', 'amount', 'category', 'title', 'createdAt'] as const;
export type ExpenseSortField = (typeof EXPENSE_SORT_FIELDS)[number];

export class ExpenseQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @IsIn(EXPENSE_SORT_FIELDS, {
    message: `sortBy must be one of: ${EXPENSE_SORT_FIELDS.join(', ')}`,
  })
  sortBy?: ExpenseSortField;

  /** Lower and upper bounds on the amount, for "what did I spend more than 5000 on" questions. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Max(MAX_MONEY_AMOUNT)
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Max(MAX_MONEY_AMOUNT)
  maxAmount?: number;
}
