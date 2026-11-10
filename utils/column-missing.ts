/**
 * "Is this error the database telling me a COLUMN isn't there?"
 *
 * The house rule is that code ships before the SQL is run, so every feature that
 * adds a column needs a rung that copes with the window in between. Each of
 * those rungs needs this question answered, and answering it slightly wrong is
 * uniquely nasty: the fallback silently never fires, and the feature fails in
 * exactly the window the fallback existed to cover.
 *
 * TWO WAYS TO GET IT WRONG, both of which have happened in this repo:
 *
 *   1. TESTING ONLY FOR POSTGRES CODES. A write through PostgREST to an unknown
 *      column never reaches Postgres — PostgREST rejects it first with PGRST204
 *      ("Could not find the 'x' column of 'y' in the schema cache"), not 42703.
 *      `docColumnMissing` in document-requests-db.ts checks 42703 and the text
 *      "column ... does not exist", so it matches a SELECT and misses every
 *      INSERT.
 *
 *   2. TESTING TOO LOOSELY. Treating any column-ish error as "the migration
 *      hasn't run" makes a genuine schema mismatch report itself as "run the
 *      migration you already ran" — the trap utils/factfind.ts documents against
 *      `factFindsTableMissing`, and the reason a caller names the columns it is
 *      actually prepared to give up.
 *
 * So: the error must look like a column problem AND, when the caller names
 * columns, name one of them. A different column being absent is a real error and
 * must not be swallowed by a retry that drops the wrong thing.
 *
 * Deliberately NOT a table-missing test. A missing table means the migration was
 * never run at all and the caller should say so, not quietly degrade — see
 * `docTableMissing` / `introducerTablesMissing` for that question.
 */
export type PgLikeError = { code?: string; message?: string } | null | undefined;

/** PostgREST's schema-cache rejection, and Postgres's own undefined_column. */
const COLUMN_CODES = new Set(["PGRST204", "42703"]);

/** What the two of them say when a column is the problem. */
const COLUMN_TEXT = /could not find the .* column|column .* does not exist|unknown column/i;

export function columnMissing(error: PgLikeError, columns: readonly string[] = []): boolean {
  if (!error) return false;

  const message = error.message ?? "";
  const looksLikeColumn = (error.code ? COLUMN_CODES.has(error.code) : false) || COLUMN_TEXT.test(message);
  if (!looksLikeColumn) return false;

  // No names given: the caller will accept any column-shaped failure.
  if (columns.length === 0) return true;

  const lower = message.toLowerCase();
  return columns.some((c) => lower.includes(c.toLowerCase()));
}
