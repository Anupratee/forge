import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { env, isAiImportEnabled } from '../config/env';
import { ExpenseCategory } from '../entities/Expense';
import { AppError, ValidationError } from '../utils/AppError';
import { MAX_IMPORT_ROWS } from '../dtos/ImportExpensesDto';

/**
 * Raised when the feature has no API key configured.
 *
 * 503 rather than 404 or 500: the endpoint exists and is not broken, it is switched off — which is the
 * distinction the client needs to offer CSV instead of showing an error.
 */
export class AiImportUnavailableError extends AppError {
  readonly status = 503;
  readonly code = 'AI_IMPORT_UNAVAILABLE';
}

/**
 * The shape the model must return.
 *
 * Deliberately the same fields `CreateExpenseDto` validates, so extracted rows enter the ordinary
 * preview pipeline and are re-checked by the same rules a typed expense faces. This schema constrains
 * the model; `class-validator` is still what decides whether a row may be written.
 */
const ExtractedExpense = z.object({
  title: z.string().describe('The merchant or a short description of what was bought'),
  amount: z.number().describe('A positive amount. Statements write debits several ways; normalise'),
  category: z
    .enum(Object.values(ExpenseCategory) as [string, ...string[]])
    .describe('Best-guess category. Use OTHER when genuinely unclear rather than inventing one'),
  spentOn: z.string().describe('The transaction date as YYYY-MM-DD'),
  description: z
    .string()
    .nullable()
    .describe('Any extra reference from the statement line, or null'),
});

const ExtractedStatement = z.object({
  expenses: z.array(ExtractedExpense),
});

const SYSTEM_PROMPT = `You extract spending from a bank or card statement so a person can review it before it is saved.

Extract only money going out — debits, purchases, withdrawals, fees. Skip credits, refunds, incoming
transfers, interest received, and running-balance lines: this is an expense log, not a transaction log.

Amounts are always positive. Statements write a debit in several ways — a minus sign, parentheses,
a separate debit column — and all of them mean the same thing here.

Dates must be YYYY-MM-DD. Statements often use DD/MM/YYYY or MM/DD/YYYY, which are indistinguishable
for the first twelve days of a month. Use the statement's own header, its date range, or the ordering
of the rows to decide which it is, and apply that reading consistently to every row.

Do not invent transactions, and do not guess at a line you cannot read — omitting a row is better than
inventing one, because a person is about to review this and a plausible fabrication is the one error
they are least likely to catch.`;

/**
 * Reads a statement PDF into expense rows a person then reviews.
 *
 * **The model never writes anything.** Its output is a draft: it goes through the same preview and the
 * same `CreateExpenseDto` validation as a CSV, and nothing reaches the database until the user confirms
 * what they saw. That is the whole reason the import pipeline is two steps — an extraction that can be
 * wrong is safe when a person approves it, and unsafe when it writes directly.
 *
 * **The PDF is sent to the model as a document rather than being text-extracted first.** The plan
 * called for `pdf-parse`; sending the file directly removes that dependency and handles statements a
 * text extractor cannot — scanned pages, multi-column layouts, tables whose reading order is not the
 * text order. The model reads those natively, which is the failure mode this feature exists for.
 *
 * The feature switches itself off when no API key is configured, and the UI falls back to CSV — the
 * behaviour the specification asks for.
 */
export class AiStatementService {
  private readonly client: Anthropic | null;

  constructor(apiKey: string | null) {
    this.client = apiKey === null ? null : new Anthropic({ apiKey });
  }

  get isEnabled(): boolean {
    return this.client !== null;
  }

  async extract(file: Buffer): Promise<Record<string, unknown>[]> {
    if (this.client === null) {
      throw new AiImportUnavailableError(
        'AI statement import is not configured on this server. Use CSV import instead.',
      );
    }

    const response = await this.client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: {
        // Extraction is transcription with a little judgement, not reasoning — low effort is both
        // cheaper and faster here, and the schema does the structural work.
        effort: 'low',
        format: zodOutputFormat(ExtractedStatement),
      },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: file.toString('base64'),
              },
            },
            {
              type: 'text',
              text: `Extract every outgoing transaction from this statement, at most ${MAX_IMPORT_ROWS}.`,
            },
          ],
        },
      ],
    });

    // A refusal is a successful HTTP response with no content, so this has to be checked before the
    // parsed output is read — otherwise a declined request looks like an empty statement.
    if (response.stop_reason === 'refusal') {
      throw new ValidationError(
        'The model declined to read that document. If it is a bank statement, try the CSV import.',
      );
    }

    const parsed = response.parsed_output;

    if (parsed === null) {
      throw new ValidationError('Could not read any transactions from that statement.');
    }

    if (parsed.expenses.length === 0) {
      throw new ValidationError(
        'No outgoing transactions were found in that document. Check that it is a statement rather than a summary.',
      );
    }

    // Handed on as loose records on purpose: `ExpenseImportService` normalises and validates them
    // exactly as it does CSV rows. Nothing about having come from a model earns a shortcut.
    return parsed.expenses.map((expense) => ({ ...expense }));
  }
}

export const aiStatementService = new AiStatementService(
  isAiImportEnabled ? env.anthropicApiKey : null,
);
