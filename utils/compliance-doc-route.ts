/**
 * Shared route boilerplate for the three NCCP/Equifax compliance documents
 * (Borrower Fact Find, NCCP Needs Analysis, Credit File Authorisation).
 *
 * The three doc route sets are the SAME SHAPE — GET list (PII-safe columns),
 * POST create, GET one, PATCH (with the sign-lock), DELETE (blocked when
 * locked), GET history — but each document differs in its table, its
 * denormalised columns, where its status lives, and its terminal/locked value.
 *
 * This module owns the REPEATED control flow (auth guard, the graceful
 * table-missing handling, the sign-lock decision from utils/compliance-audit,
 * the audit-hook invocation, and the standard error shaping). Everything that
 * genuinely DIFFERS per document stays in that route's config object — as
 * typed, explicit callbacks (buildCreateRow / buildPatch) written in the route
 * itself — so no per-doc behaviour is hidden inside a generic blob.
 *
 * BEHAVIOUR-PRESERVING: each handler reproduces its original route's exact
 * response shapes, status codes, log event names, and DB call sequence. The
 * per-route characterization tests (app/api/**\/route.test.ts) prove it.
 */

import { NextResponse } from "next/server";
import { supabase } from "./supabase";
import { requireAuth } from "./cf-access";
import { log, errInfo } from "./logger";
import {
  classifyPatch,
  isLocked,
  recordAudit,
  fetchAuditHistory,
  LOCKED_EDIT_MESSAGE,
  LOCKED_DELETE_MESSAGE,
  type ComplianceDocType,
  type PatchDecision,
} from "./compliance-audit";

/* ── Config shared by every handler ──────────────────────────────────────── */

/** Human message from a Supabase/PostgrestError (each doc util's own variant). */
export type ErrMessageFn = (e: unknown, fallback: string) => string;
/** NARROW "table not created yet" test (each doc util's own variant). Must not
 * treat a column-level error (PGRST204 / 42703) as a missing table. */
export type TableMissingFn = (error: unknown) => boolean;

type ParamsCtx = { params: Promise<{ id: string }> };

/** Fields every handler for a given document needs. */
type BaseConfig = {
  /** The Supabase table. E.g. `borrower_fact_finds` — NOT `fact_finds`. */
  table: string;
  /** Audit/lock discriminator; also drives classifyPatch/isLocked. */
  docType: ComplianceDocType;
  /** Prefix for log event names, e.g. `fact_finds` → `fact_finds.list_failed`. */
  logPrefix: string;
  /** Shown (501) when the table is missing on a write. */
  migrationHint: string;
  errMessage: ErrMessageFn;
  tableMissing: TableMissingFn;
};

/* ── GET list ────────────────────────────────────────────────────────────── */

export type ListConfig = Pick<
  BaseConfig,
  "table" | "logPrefix" | "errMessage" | "tableMissing"
> & {
  /** Explicit, PII-safe columns. NEVER `*` — `data` holds borrower PII. */
  listColumns: string;
  /** Response envelope key, e.g. `factFinds`. */
  listKey: string;
};

/** GET — list documents (newest first), omitting the `data` blob. */
export function makeListHandler(cfg: ListConfig) {
  return async function GET(req: Request): Promise<NextResponse> {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;
    try {
      const { data, error } = await supabase
        .from(cfg.table)
        .select(cfg.listColumns)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) {
        if (cfg.tableMissing(error)) return NextResponse.json({ ok: true, [cfg.listKey]: [] });
        throw error;
      }
      return NextResponse.json({ ok: true, [cfg.listKey]: data ?? [] });
    } catch (e) {
      log.error(`${cfg.logPrefix}.list_failed`, { detail: cfg.errMessage(e, ""), ...errInfo(e) });
      return NextResponse.json({ ok: false, error: cfg.errMessage(e, "List failed") }, { status: 500 });
    }
  };
}

/* ── POST create ─────────────────────────────────────────────────────────── */

/** What a route's per-doc create logic yields for the shared insert + audit. */
export type CreateRow = {
  /** The row to insert (denormalised columns + `data` blob + created_by). */
  row: Record<string, unknown>;
  /** The resolved status, for the create audit's `statusAfter`. */
  status: string;
  /** The snapshot to audit (the `data` blob). */
  snapshot: unknown;
};

export type CreateConfig = BaseConfig & {
  /**
   * ALL per-doc create logic: parse the body, resolve the `data` blob (blank /
   * hydrate / contact prefill), resolve status, and build the denormalised row.
   * Written in the route so the per-doc specifics stay visible and typed.
   */
  buildCreateRow: (body: Record<string, unknown>, auth: string) => Promise<CreateRow> | CreateRow;
  /**
   * Columns added by a migration that may not have been applied yet. If the
   * insert fails because one is missing, it is retried ONCE without them.
   *
   * This decouples a deploy from its SQL: the feature degrades (that column is
   * simply not populated) instead of 500ing. Opt-in per route on purpose — a
   * blanket retry would silently swallow genuine schema bugs for every other
   * document type using this factory.
   */
  optionalColumns?: readonly string[];
  /** True when the error is specifically a missing column. Required with optionalColumns. */
  columnMissing?: (error: unknown) => boolean;
};

/** POST — create a document, then record a `create` audit. */
export function makeCreateHandler(cfg: CreateConfig) {
  return async function POST(req: Request): Promise<NextResponse> {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;
    try {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const { row, status, snapshot } = await cfg.buildCreateRow(body, auth);

      let { data: inserted, error } = await supabase.from(cfg.table).insert(row).select("id").single();
      if (error && cfg.optionalColumns?.length && cfg.columnMissing?.(error)) {
        const trimmed = { ...row };
        for (const c of cfg.optionalColumns) delete trimmed[c];
        log.warn(`${cfg.logPrefix}.optional_columns_absent`, { columns: cfg.optionalColumns.join(",") });
        ({ data: inserted, error } = await supabase.from(cfg.table).insert(trimmed).select("id").single());
      }
      if (error) {
        if (cfg.tableMissing(error)) return NextResponse.json({ ok: false, error: cfg.migrationHint }, { status: 501 });
        throw error;
      }
      const id = (inserted as { id: string }).id;
      await recordAudit({
        docType: cfg.docType,
        docId: id,
        action: "create",
        changedBy: auth,
        statusAfter: status,
        snapshot,
      });
      return NextResponse.json({ ok: true, id });
    } catch (e) {
      log.error(`${cfg.logPrefix}.create_failed`, { detail: cfg.errMessage(e, ""), ...errInfo(e) });
      return NextResponse.json({ ok: false, error: cfg.errMessage(e, "Create failed") }, { status: 500 });
    }
  };
}

/* ── GET one ─────────────────────────────────────────────────────────────── */

export type GetOneConfig = BaseConfig & {
  /**
   * Columns for the single-document read. FF/NA use `*` (the whole row incl. the
   * `data` blob); CA lists them explicitly. Either way the `data` blob is
   * returned here — this is the single-document endpoint, not the list.
   */
  oneColumns: string;
  /** Response envelope key, e.g. `factFind`. */
  itemKey: string;
  /** Merge the stored blob over the current template before returning it. */
  hydrate: (raw: unknown) => unknown;
};

/** GET — one document, including the full (hydrated) `data` blob. */
export function makeGetOneHandler(cfg: GetOneConfig) {
  return async function GET(req: Request, { params }: ParamsCtx): Promise<NextResponse> {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;
    try {
      const { data, error } = await supabase.from(cfg.table).select(cfg.oneColumns).eq("id", id).maybeSingle();
      if (error) {
        if (cfg.tableMissing(error)) return NextResponse.json({ ok: false, error: cfg.migrationHint }, { status: 501 });
        throw error;
      }
      if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      // `select(cfg.oneColumns)` takes a runtime column string, so supabase can't
      // infer the row shape — narrow through unknown to read the `data` blob.
      const row = data as unknown as Record<string, unknown>;
      return NextResponse.json({ ok: true, [cfg.itemKey]: { ...row, data: cfg.hydrate(row.data) } });
    } catch (e) {
      log.error(`${cfg.logPrefix}.get_failed`, { detail: cfg.errMessage(e, ""), ...errInfo(e) });
      return NextResponse.json({ ok: false, error: cfg.errMessage(e, "Load failed") }, { status: 500 });
    }
  };
}

/* ── PATCH ───────────────────────────────────────────────────────────────── */

/** What a route's per-doc patch logic yields for the shared lock + update. */
export type PatchBuild = {
  /** The update object (denormalised columns + `data` blob + updated_at/by). */
  patch: Record<string, unknown>;
  /** The status the document would have AFTER this patch — drives the lock. */
  incomingStatus: string;
  /** The snapshot to audit (the new `data` blob, or null when unchanged). */
  snapshot: unknown;
};

export type PatchConfig = BaseConfig & {
  /**
   * ALL per-doc patch logic: given the parsed body and the CURRENT status,
   * build the update object, the resulting `incomingStatus` (FF/NA read it from
   * `body.status`; CA reads it from the hydrated `data.status`), and the audit
   * snapshot. Pure construction — the shared handler applies the sign-lock and
   * only writes when the decision isn't `reject`.
   */
  buildPatch: (body: Record<string, unknown>, currentStatus: string, auth: string) => PatchBuild;
  /** See CreateConfig.optionalColumns — same deploy-vs-migration decoupling on update. */
  optionalColumns?: readonly string[];
  /** See CreateConfig.columnMissing. */
  columnMissing?: (error: unknown) => boolean;
  /**
   * Optional completion guard. Given the would-be-saved snapshot, return the
   * human-readable list of things still missing before this document may reach
   * its terminal (locked) status. Enforced ONLY on the "sign" transition — a
   * non-empty result blocks the sign-off with 422, so a stub can't be signed as
   * Complete. Returns [] (or is absent) to allow.
   */
  completionBlockers?: (snapshot: unknown) => string[];
  /**
   * Optional side effect fired AFTER a successful update + audit — e.g. syncing
   * derived records when a document first reaches its terminal status. Runs
   * inside its own try/catch and can NEVER fail the save (a hook error is logged
   * and swallowed). Use `decision.kind` to react only to the transition you care
   * about — e.g. `"sign"` is the not-locked → locked (Complete/signed) move.
   */
  onAfterCommit?: (ctx: {
    id: string;
    decision: PatchDecision;
    body: Record<string, unknown>;
    snapshot: unknown;
    auth: string;
  }) => Promise<void>;
};

/**
 * PATCH — save the form under the sign-lock. Fetches the current status first
 * (the lock is derived from it), classifies the change, refuses an in-place edit
 * of a signed/locked document (409), otherwise applies the update and audits it.
 */
export function makePatchHandler(cfg: PatchConfig) {
  return async function PATCH(req: Request, { params }: ParamsCtx): Promise<NextResponse> {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;
    try {
      const body = (await req.json()) as Record<string, unknown>;

      // Fetch the current status first — the sign-lock is derived from it.
      const { data: current, error: fetchErr } = await supabase
        .from(cfg.table)
        .select("status")
        .eq("id", id)
        .maybeSingle();
      if (fetchErr) {
        if (cfg.tableMissing(fetchErr)) return NextResponse.json({ ok: false, error: cfg.migrationHint }, { status: 501 });
        throw fetchErr;
      }
      if (!current) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

      const currentStatus = (current as { status: string }).status;
      const { patch, incomingStatus, snapshot } = cfg.buildPatch(body, currentStatus, auth);

      const decision = classifyPatch(cfg.docType, currentStatus, incomingStatus);
      if (decision.kind === "reject") {
        return NextResponse.json({ ok: false, error: LOCKED_EDIT_MESSAGE }, { status: 409 });
      }

      // Completion guard: refuse to sign off a stub. Only on the sign transition
      // (not on ordinary draft saves), so an in-progress form still saves freely.
      if (decision.kind === "sign" && cfg.completionBlockers) {
        const blockers = cfg.completionBlockers(snapshot);
        if (blockers.length) {
          return NextResponse.json(
            {
              ok: false,
              error: `Can't mark this Complete yet — still needed: ${blockers.join(", ")}.`,
              blockers,
            },
            { status: 422 },
          );
        }
      }

      let { error } = await supabase.from(cfg.table).update(patch).eq("id", id);
      if (error && cfg.optionalColumns?.length && cfg.columnMissing?.(error)) {
        const trimmed = { ...patch };
        for (const c of cfg.optionalColumns) delete trimmed[c];
        log.warn(`${cfg.logPrefix}.optional_columns_absent`, { columns: cfg.optionalColumns.join(",") });
        ({ error } = await supabase.from(cfg.table).update(trimmed).eq("id", id));
      }
      if (error) {
        if (cfg.tableMissing(error)) return NextResponse.json({ ok: false, error: cfg.migrationHint }, { status: 501 });
        throw error;
      }
      await recordAudit({
        docType: cfg.docType,
        docId: id,
        action: decision.kind,
        changedBy: auth,
        statusAfter: incomingStatus,
        snapshot,
      });
      // Post-commit side effect (best-effort — never fails the save).
      if (cfg.onAfterCommit) {
        try {
          await cfg.onAfterCommit({ id, decision, body, snapshot, auth });
        } catch (hookErr) {
          log.error(`${cfg.logPrefix}.after_commit_failed`, { detail: cfg.errMessage(hookErr, ""), ...errInfo(hookErr) });
        }
      }
      return NextResponse.json({ ok: true });
    } catch (e) {
      log.error(`${cfg.logPrefix}.update_failed`, { detail: cfg.errMessage(e, ""), ...errInfo(e) });
      return NextResponse.json({ ok: false, error: cfg.errMessage(e, "Save failed") }, { status: 500 });
    }
  };
}

/* ── DELETE ──────────────────────────────────────────────────────────────── */

export type DeleteConfig = BaseConfig;

/**
 * DELETE — remove a document. Fetches the row first: a locked (signed/complete)
 * document can't be deleted (409), and its final state is snapshotted into the
 * audit log before removal.
 */
export function makeDeleteHandler(cfg: DeleteConfig) {
  return async function DELETE(req: Request, { params }: ParamsCtx): Promise<NextResponse> {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;
    try {
      const { data: current, error: fetchErr } = await supabase
        .from(cfg.table)
        .select("status,data")
        .eq("id", id)
        .maybeSingle();
      if (fetchErr) {
        if (cfg.tableMissing(fetchErr)) return NextResponse.json({ ok: false, error: cfg.migrationHint }, { status: 501 });
        throw fetchErr;
      }
      if (!current) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      const row = current as { status: string; data: unknown };
      if (isLocked(cfg.docType, row.status)) {
        return NextResponse.json({ ok: false, error: LOCKED_DELETE_MESSAGE }, { status: 409 });
      }

      const { error } = await supabase.from(cfg.table).delete().eq("id", id);
      if (error) throw error;
      await recordAudit({
        docType: cfg.docType,
        docId: id,
        action: "delete",
        changedBy: auth,
        statusAfter: row.status,
        snapshot: row.data,
      });
      return NextResponse.json({ ok: true });
    } catch (e) {
      log.error(`${cfg.logPrefix}.delete_failed`, { detail: cfg.errMessage(e, ""), ...errInfo(e) });
      return NextResponse.json({ ok: false, error: cfg.errMessage(e, "Delete failed") }, { status: 500 });
    }
  };
}

/* ── GET history ─────────────────────────────────────────────────────────── */

export type HistoryConfig = Pick<BaseConfig, "docType" | "logPrefix" | "errMessage">;

/**
 * GET — the audit trail for one document (newest first). No PII snapshot is
 * returned (fetchAuditHistory omits data_snapshot). Returns [] when the audit
 * table hasn't been created yet, so the history panel degrades gracefully.
 */
export function makeHistoryHandler(cfg: HistoryConfig) {
  return async function GET(req: Request, { params }: ParamsCtx): Promise<NextResponse> {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;
    try {
      const history = await fetchAuditHistory(cfg.docType, id);
      return NextResponse.json({ ok: true, history });
    } catch (e) {
      log.error(`${cfg.logPrefix}.history_failed`, { detail: cfg.errMessage(e, ""), ...errInfo(e) });
      return NextResponse.json({ ok: false, error: cfg.errMessage(e, "History failed") }, { status: 500 });
    }
  };
}
