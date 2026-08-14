/**
 * Escapes the wildcards in a keyword before it is wrapped in `%…%` for an ILIKE match.
 *
 * Without this, a search for `50%` matches every row, and `_` quietly matches any single character —
 * so a user searching for `report_final` would get results they did not ask for and no explanation.
 *
 * PostgreSQL's default LIKE escape character is the backslash, so no `ESCAPE` clause is needed at the
 * call site. Shared by every keyword filter, so the behaviour cannot differ between resources.
 */
export function escapeLikePattern(keyword: string): string {
  return keyword.replace(/[\\%_]/g, (character) => `\\${character}`);
}
