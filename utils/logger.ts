/**
 * Structured logging.
 *
 * Netlify captures stdout/stderr per function invocation, so a single
 * JSON line per event is enough to make failures greppable after the
 * fact ("why didn't that broadcast send?"). No external service — if a
 * log drain (Sentry/Logtail) is added later, swap the sink in `emit`.
 *
 * Edge-safe: uses only console + Date, so proxy.ts can import it too.
 */

type Level = "info" | "warn" | "error";

interface LogFields {
  [k: string]: unknown;
}

function emit(level: Level, event: string, fields: LogFields): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Coerce an unknown thrown value into a stable {message, stack}. */
export function errInfo(e: unknown): { message: string; stack?: string } {
  if (e instanceof Error) return { message: e.message, stack: e.stack };
  return { message: String(e) };
}

export const log = {
  info: (event: string, fields: LogFields = {}) => emit("info", event, fields),
  warn: (event: string, fields: LogFields = {}) => emit("warn", event, fields),
  error: (event: string, fields: LogFields = {}) => emit("error", event, fields),
};
