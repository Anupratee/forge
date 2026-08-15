import type { Request, Response } from 'express';
import type { CreateExpenseDto, ExpenseQueryDto, UpdateExpenseDto } from '../dtos/ExpenseDto';
import type { ConfirmImportDto } from '../dtos/ImportExpensesDto';
import { getAuth } from '../middlewares/auth.middleware';
import { uploadedPath } from '../middlewares/upload.middleware';
import { getQuery, pathId } from '../middlewares/validate.middleware';
import type { BodyOf } from '../middlewares/validate.middleware';
import type { AiStatementService } from '../services/AiStatementService';
import { aiStatementService } from '../services/AiStatementService';
import type { ExpenseImportService } from '../services/ExpenseImportService';
import { expenseImportService } from '../services/ExpenseImportService';
import type { ExpenseService } from '../services/ExpenseService';
import { expenseService } from '../services/ExpenseService';

export class ExpenseController {
  constructor(
    private readonly expenseService: ExpenseService,
    private readonly importService: ExpenseImportService,
    private readonly aiService: AiStatementService,
  ) {}

  create = async (req: BodyOf<CreateExpenseDto>, res: Response): Promise<void> => {
    const expense = await this.expenseService.create(
      getAuth(req),
      req.body,
      uploadedPath(req.file, 'receipts'),
    );

    res.status(201).json(expense);
  };

  update = async (req: BodyOf<UpdateExpenseDto>, res: Response): Promise<void> => {
    const expense = await this.expenseService.update(
      getAuth(req),
      pathId(req),
      req.body,
      uploadedPath(req.file, 'receipts'),
    );

    res.json(expense);
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.expenseService.remove(getAuth(req), pathId(req));
    res.status(204).send();
  };

  list = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.expenseService.list(getAuth(req), getQuery<ExpenseQueryDto>(req)));
  };

  getOne = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.expenseService.getOne(getAuth(req), pathId(req)));
  };

  // -------------------------------------------------------------------- Import

  /**
   * Parses an upload and reports what it found. Writes nothing.
   *
   * The upload middleware guarantees a file is present, so this reads `req.file` behind a check that
   * exists only to satisfy the type — a missing file has already been rejected as a 400.
   */
  previewCsv = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.importService.previewCsv(requireFile(req)));
  };

  /**
   * Which import methods this server can offer.
   *
   * The AI import needs an API key that a deployment may not have, and the specification's stated
   * fallback is manual and CSV entry. Asking once lets the client hide a route it cannot use, rather
   * than presenting it and explaining a 503 afterwards.
   */
  importOptions = (_req: Request, res: Response): void => {
    res.json({ csv: true, ai: this.aiService.isEnabled });
  };

  /**
   * Reads a statement PDF into the same preview a CSV produces. Writes nothing.
   *
   * The model's output is a draft that the user reviews and edits before confirming — which is what
   * makes an extraction that can be wrong safe to offer at all.
   */
  previewStatement = async (req: Request, res: Response): Promise<void> => {
    const rows = await this.aiService.extract(requireFile(req));
    res.json(await this.importService.previewRows(rows));
  };

  /**
   * Writes the rows the user reviewed.
   *
   * 201, because this creates expenses. The rows were validated by the route's DTO and the owner and
   * source are assigned by the service — neither is read from the request.
   */
  confirmImport = async (req: BodyOf<ConfirmImportDto>, res: Response): Promise<void> => {
    res.status(201).json(await this.importService.confirm(getAuth(req), req.body));
  };
}

/**
 * The uploaded bytes.
 *
 * `uploadDocument` rejects a request with no file before a handler runs, so reaching this with none is
 * a wiring mistake rather than a client error — hence a plain Error and a logged 500, not a 400.
 */
function requireFile(req: Request): Buffer {
  if (req.file === undefined) {
    throw new Error(
      `Route ${req.method} ${req.originalUrl} reads an uploaded file but is not behind the uploadDocument middleware`,
    );
  }

  return req.file.buffer;
}

export const expenseController = new ExpenseController(
  expenseService,
  expenseImportService,
  aiStatementService,
);
