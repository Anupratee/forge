import { plainToInstance } from 'class-transformer';
import { validate as runValidation } from 'class-validator';
import { parse } from 'csv-parse/sync';
import type { DataSource } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { CreateExpenseDto } from '../dtos/ExpenseDto';
import type { ConfirmImportDto } from '../dtos/ImportExpensesDto';
import { MAX_IMPORT_ROWS } from '../dtos/ImportExpensesDto';
import { Expense, ExpenseCategory } from '../entities/Expense';
import type { AuthContext } from '../middlewares/auth.middleware';
import type { FieldFailure } from '../middlewares/validate.middleware';
import { flatten } from '../middlewares/validate.middleware';
import { ValidationError } from '../utils/AppError';
import { ISO_DATE_PATTERN } from '../utils/date';

/** One parsed row, with whatever is wrong with it. */
export interface PreviewRow {
  /** 1-based position in the source file, so a message can say "row 7" and mean what the user sees. */
  line: number;
  /** Normalised and ready to submit — present even when invalid, so the client can offer a fix. */
  draft: Partial<CreateExpenseDto>;
  errors: FieldFailure[];
}

export interface ImportPreview {
  rows: PreviewRow[];
  validCount: number;
  invalidCount: number;
  /** True when the file held more rows than one request may carry. */
  truncated: boolean;
}

export interface ImportResult {
  imported: number;
}

/**
 * The header names accepted for each field.
 *
 * Real exports do not agree on spelling — a bank calls it `Date`, a spreadsheet `spentOn`, an app
 * `transaction_date`. Matching a set of aliases costs one map and saves every user from renaming
 * columns before they can import.
 */
const HEADER_ALIASES: Record<keyof CreateExpenseDto, string[]> = {
  title: ['title', 'name', 'description of transaction', 'merchant', 'payee', 'particulars'],
  amount: ['amount', 'value', 'debit', 'cost', 'total'],
  category: ['category', 'type', 'group'],
  spentOn: ['spenton', 'date', 'transactiondate', 'transaction date', 'posteddate', 'day'],
  description: ['description', 'notes', 'memo', 'remarks', 'reference'],
};

/**
 * Importing expenses from a file, in two steps that never blur into one.
 *
 * **Preview writes nothing.** It parses, normalises, and validates, and hands back what it found along
 * with what is wrong. **Confirm writes**, and re-validates everything it is given rather than trusting
 * that the client sent back what the preview offered — the preview is a suggestion, not a token.
 *
 * Both the CSV and the AI statement import funnel through here. They differ only in how rows are
 * extracted; once there are rows, the validation, the preview shape, and the write are identical, so
 * there is one place where an imported expense is decided to be acceptable.
 *
 * That place is `CreateExpenseDto` — the very class that validates a manually typed expense. An
 * imported row therefore cannot be anything a hand-entered one could not have been, and there is no
 * second, weaker definition of a valid expense to keep in step.
 */
export class ExpenseImportService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Parses a CSV upload into a preview.
   *
   * `columns` with a normaliser gives case- and spacing-insensitive headers; `relax_column_count` keeps
   * a trailing comma or a short row from failing the whole file, since one malformed row should be
   * reported as one bad row rather than as an unreadable upload.
   */
  async previewCsv(file: Buffer): Promise<ImportPreview> {
    let records: Record<string, string>[];

    try {
      records = parse(file, {
        columns: (header: string[]) => header.map((column) => normalizeHeader(column)),
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        bom: true,
      });
    } catch (error) {
      // A parse failure is the file's problem, not the server's, and the library's message names the
      // line — far more useful than "could not read the file".
      throw new ValidationError(
        `Could not read that CSV: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    if (records.length === 0) {
      throw new ValidationError('That CSV has a header but no rows');
    }

    return this.buildPreview(
      records.map((record, index) => ({
        // +2 rather than +1: the header occupies line 1, so the first data row is line 2 on screen.
        line: index + 2,
        raw: pickAliases(record),
      })),
    );
  }

  /**
   * Builds a preview from rows some other extractor produced — the AI statement import.
   *
   * Rows arriving this way are validated exactly as CSV rows are. Nothing about having come from a
   * model earns them a shortcut; if anything the opposite.
   */
  async previewRows(rows: Record<string, unknown>[]): Promise<ImportPreview> {
    return this.buildPreview(rows.map((raw, index) => ({ line: index + 1, raw })));
  }

  /**
   * Writes the reviewed rows.
   *
   * One transaction: an import half-applied is worse than one refused, because the user cannot tell
   * which half landed and re-importing would double what did.
   *
   * The rows have already been validated by `validateBody(ConfirmImportDto)` at the route — this
   * assigns the owner and the source itself rather than reading either from the request.
   */
  async confirm(actor: AuthContext, input: ConfirmImportDto): Promise<ImportResult> {
    const expenses = input.rows.map((row) => ({
      userId: actor.userId,
      title: row.title.trim(),
      description: row.description ?? null,
      amount: row.amount,
      category: row.category,
      spentOn: row.spentOn,
      source: input.source,
      receiptImage: null,
    }));

    await this.dataSource.transaction(async (manager) => {
      await manager.insert(Expense, expenses);
    });

    return { imported: expenses.length };
  }

  // ---------------------------------------------------------------- Internal

  private async buildPreview(
    entries: { line: number; raw: Record<string, unknown> }[],
  ): Promise<ImportPreview> {
    const truncated = entries.length > MAX_IMPORT_ROWS;
    const considered = truncated ? entries.slice(0, MAX_IMPORT_ROWS) : entries;

    const rows = await Promise.all(
      considered.map(async ({ line, raw }) => {
        const draft = normalizeDraft(raw);

        // The same validation a manually created expense goes through, including the whitelist — so a
        // stray column in the file is reported rather than silently carried into the database.
        const instance = plainToInstance(CreateExpenseDto, draft);
        const failures = await runValidation(instance, {
          whitelist: true,
          forbidNonWhitelisted: true,
          forbidUnknownValues: true,
        });

        return { line, draft, errors: flatten(failures) };
      }),
    );

    return {
      rows,
      validCount: rows.filter((row) => row.errors.length === 0).length,
      invalidCount: rows.filter((row) => row.errors.length > 0).length,
      truncated,
    };
  }
}

/** Lower-cased and stripped of spaces, underscores, and hyphens, so `Spent On` matches `spent_on`. */
function normalizeHeader(column: string): string {
  return column.toLowerCase().replace(/[\s_-]+/g, '');
}

/** Maps a record's recognised headers onto DTO field names, dropping anything unrecognised. */
function pickAliases(record: Record<string, string>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const match = aliases.map(normalizeHeader).find((alias) => record[alias] !== undefined);
    if (match !== undefined) picked[field] = record[match];
  }

  return picked;
}

/**
 * Turns loose input into the shape `CreateExpenseDto` expects, without deciding whether it is valid.
 *
 * The distinction matters: this coerces `"1,234.50"` to a number and `"food"` to `FOOD`, because those
 * are the same value written differently. It does not repair a missing title or invent a date — that
 * would be guessing, and the validator would have nothing to complain about.
 */
function normalizeDraft(raw: Record<string, unknown>): Partial<CreateExpenseDto> {
  const draft: Partial<CreateExpenseDto> = {};

  const title = asTrimmedString(raw.title);
  if (title !== undefined) draft.title = title;

  const description = asTrimmedString(raw.description);
  if (description !== undefined) draft.description = description;

  const amount = normalizeAmount(raw.amount);
  if (amount !== undefined) draft.amount = amount;

  const category = normalizeCategory(raw.category);
  if (category !== undefined) draft.category = category;

  const spentOn = normalizeDate(raw.spentOn);
  if (spentOn !== undefined) draft.spentOn = spentOn;

  return draft;
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * `"1,234.50"`, `"$1234.50"`, `"(12.30)"` and `"-12.30"` all become a positive number.
 *
 * Statements write a debit in several ways, and parentheses are the accounting convention for a
 * negative. An expense is an amount spent, so the sign carries no information here — `CreateExpenseDto`
 * requires it positive, and a row that cannot be read at all is left absent for the validator to catch.
 */
function normalizeAmount(value: unknown): number | undefined {
  if (typeof value === 'number') return Math.abs(value);
  if (typeof value !== 'string') return undefined;

  const digits = value.replace(/[^0-9.-]/g, '');
  if (digits === '' || digits === '-' || digits === '.') return undefined;

  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return undefined;

  // Two decimal places, matching the numeric(12,2) column — a statement occasionally carries more.
  return Math.round(Math.abs(parsed) * 100) / 100;
}

/** Case-insensitive match against the enum; anything unrecognised is left for the validator to reject. */
function normalizeCategory(value: unknown): ExpenseCategory | undefined {
  const text = asTrimmedString(value);
  if (text === undefined) return undefined;

  // Compared as strings rather than as enum members: `upper` is arbitrary text from a file, so
  // narrowing it to the enum first would be the assertion this comparison exists to avoid.
  const upper = text.toUpperCase().replace(/[\s-]+/g, '_');
  return Object.values(ExpenseCategory).find((category) => String(category) === upper);
}

/**
 * Accepts `YYYY-MM-DD` as-is, and converts the two unambiguous slash formats.
 *
 * `DD/MM/YYYY` and `MM/DD/YYYY` are genuinely indistinguishable for the first twelve days of a month,
 * and guessing would silently file a January expense in October. So only `YYYY/MM/DD` is converted;
 * anything else is left alone, and the validator reports it as a date the user has to fix. A visible
 * error beats a wrong date nobody notices.
 */
function normalizeDate(value: unknown): string | undefined {
  const text = asTrimmedString(value);
  if (text === undefined) return undefined;

  if (ISO_DATE_PATTERN.test(text)) return text;

  const slashed = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(text);
  if (slashed !== null) {
    const [, year, month, day] = slashed;
    return `${year}-${month?.padStart(2, '0')}-${day?.padStart(2, '0')}`;
  }

  return text;
}

export const expenseImportService = new ExpenseImportService(AppDataSource);
