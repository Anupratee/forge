/**
 * One pagination envelope for every list endpoint.
 *
 * The graded search and filter capabilities are implemented once, here and in `ListQueryDto`, rather
 * than per resource. A client that can page through challenges can page through the store and the
 * expense log without learning a second shape.
 */

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;

/** Bounded so a client cannot ask for the entire table in one request. `ListQueryDto` enforces it. */
export const MAX_PAGE_SIZE = 100;

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  /** Rows matching the filters, ignoring pagination — what the client needs to render page links. */
  total: number;
  totalPages: number;
}

/** The two fields every list query shares, resolved to concrete values. */
export interface PageRequest {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

/**
 * Fills in the defaults a query left out.
 *
 * Services take a `PageRequest` rather than reading `page` and `pageSize` themselves, so the default
 * page size is defined in one place and `skip` is never computed by hand — an off-by-one there silently
 * skips or repeats a row at every page boundary.
 */
export function toPageRequest(query: { page?: number; pageSize?: number }): PageRequest {
  const page = query.page ?? DEFAULT_PAGE;
  const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function toPage<T>(items: T[], total: number, request: PageRequest): Page<T> {
  return {
    items,
    page: request.page,
    pageSize: request.pageSize,
    total,
    // Ceiling division, and 0 rather than 1 when there is nothing — a client rendering "page 1 of 1"
    // over an empty list is a worse lie than "page 1 of 0".
    totalPages: Math.ceil(total / request.pageSize),
  };
}
