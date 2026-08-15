import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, ValidateNested } from 'class-validator';
import { ExpenseSource } from '../entities/Expense';
import { CreateExpenseDto } from './ExpenseDto';

/**
 * How many rows one import may carry.
 *
 * The preview is editable, so the client sends back what the user accepted — which could be the whole
 * file. The cap bounds a single request rather than the feature: a larger statement is imported in
 * batches. It also bounds the transaction the confirm step opens.
 */
export const MAX_IMPORT_ROWS = 500;

/**
 * The sources an import may claim.
 *
 * `MANUAL` is deliberately absent. Expense `source` is otherwise set by the server precisely so a
 * client cannot relabel a hand-typed entry as an import; allowing this endpoint to name a source keeps
 * that property intact, because the only values it accepts are ones that *are* imports. An import
 * cannot pass itself off as manual, and nothing else can pass itself off as an import.
 */
export const IMPORTABLE_SOURCES = [ExpenseSource.CSV_IMPORT, ExpenseSource.AI_IMPORT] as const;
export type ImportableSource = (typeof IMPORTABLE_SOURCES)[number];

/**
 * The confirm step: the rows the user reviewed, possibly after editing them.
 *
 * Each row is a `CreateExpenseDto` — the same class that validates a manually entered expense — so an
 * imported row cannot be anything a typed one could not have been. `ValidateNested` runs the full set
 * of rules per row, and a failure names the offending row by index in its field path.
 */
export class ConfirmImportDto {
  @IsIn(IMPORTABLE_SOURCES, {
    message: `source must be one of: ${IMPORTABLE_SOURCES.join(', ')}`,
  })
  source!: ImportableSource;

  @IsArray()
  @ArrayMinSize(1, { message: 'rows must contain at least one expense' })
  @ArrayMaxSize(MAX_IMPORT_ROWS, {
    message: `rows must contain at most ${MAX_IMPORT_ROWS} expenses`,
  })
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseDto)
  rows!: CreateExpenseDto[];
}
