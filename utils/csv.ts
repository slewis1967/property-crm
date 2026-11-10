// Pure, dependency-free CSV serialisation helpers.
//
// Used by the contacts list "Export CSV" action (client-side download).
// Kept pure + framework-free so it can be unit-tested in isolation and
// reused anywhere a CSV needs building without pulling in a heavy library.

export type CsvValue = string | number | boolean | null | undefined;

export interface CsvColumn<T> {
  /** Column heading written to the first row. */
  header: string;
  /** Extracts the cell value for a given row. */
  value: (row: T) => CsvValue;
}

/**
 * Escape a single CSV field per RFC 4180.
 *
 * A field is wrapped in double quotes when it contains a comma, a double
 * quote, or a line break; embedded double quotes are doubled. `null` and
 * `undefined` become an empty field. Everything else is stringified as-is.
 */
export function escapeCsvField(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build a CSV string from `rows` using the given `columns`.
 *
 * Rows are separated by CRLF (RFC 4180). The header row is always emitted,
 * even when there are no data rows, so the output is a valid single-header
 * CSV rather than an empty string.
 */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const headerLine = columns.map((col) => escapeCsvField(col.header)).join(",");
  const bodyLines = rows.map((row) =>
    columns.map((col) => escapeCsvField(col.value(row))).join(",")
  );
  return [headerLine, ...bodyLines].join("\r\n");
}
