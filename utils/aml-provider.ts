/**
 * AML verification + screening provider interface.
 *
 * Customer verification and sanctions/PEP/adverse-media screening are delegated
 * to an external provider (First AML — firstaml.com — is the platform ARG uses
 * across AU/NZ). This module is the seam: a typed interface plus a First AML
 * implementation and a manual/offline fallback, mirroring utils/brevo.ts —
 * reads its key from process.env, returns a discriminated `{ ok }` envelope, and
 * FAILS SOFT when the key is absent (feature disabled, never throws) so the app
 * runs end-to-end without live credentials.
 *
 * Wiring First AML live is a config step, not a code change: set FIRST_AML_API_KEY
 * (and optionally FIRST_AML_BASE_URL) and the provider switches from the manual
 * stub to real API calls. Until then, verifications/screenings are recorded
 * manually by the compliance officer and marked provider:"manual".
 */

import {
  ALL_SCREENING_LIST_CODES,
  type ScreeningListCode,
  type ScreeningResult,
} from "./aml";

/* ── Shared envelope ─────────────────────────────────────────────────────── */

export type ProviderError = { ok: false; error: string };

/* ── Verification (identity) ─────────────────────────────────────────────── */

export type VerifySubject = {
  fullLegalName: string;
  dob?: string;
  /** e.g. "individual" | "company" | "trust" | "smsf" — for provider routing. */
  entityType?: string;
  email?: string;
  reference?: string;
};

export type VerifyStartResult =
  | {
      ok: true;
      /** Provider identifier for this verification (stored on the case). */
      reference: string;
      /** Secure link the customer completes their ID verification through. */
      inviteUrl: string;
      status: "pending";
    }
  | ProviderError;

/* ── Screening (sanctions / PEP / adverse media) ─────────────────────────── */

export type ScreeningMatch = {
  list: ScreeningListCode;
  matchedName: string;
  /** 0–100 confidence, when the provider supplies one. */
  score: number;
  details: string;
};

export type ScreenResult =
  | {
      ok: true;
      reference: string;
      result: ScreeningResult;
      matches: ScreeningMatch[];
      screenedAt: string;
    }
  | ProviderError;

export type ScreenOptions = {
  name: string;
  dob?: string;
  lists?: ScreeningListCode[];
};

/* ── Provider interface ──────────────────────────────────────────────────── */

export interface AmlProvider {
  readonly id: string;
  /** True when the provider is configured to make live calls. */
  readonly live: boolean;
  startVerification(subject: VerifySubject): Promise<VerifyStartResult>;
  screen(opts: ScreenOptions): Promise<ScreenResult>;
}

/* ── First AML implementation ────────────────────────────────────────────── */

const FIRST_AML_DEFAULT_BASE = "https://api.firstaml.com/v1";

class FirstAmlProvider implements AmlProvider {
  readonly id = "first_aml";
  readonly live = true;
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
    };
  }

  async startVerification(subject: VerifySubject): Promise<VerifyStartResult> {
    if (!subject.fullLegalName) return { ok: false, error: "Subject name is required" };
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/verifications`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          name: subject.fullLegalName,
          dateOfBirth: subject.dob || undefined,
          entityType: subject.entityType || undefined,
          email: subject.email || undefined,
          externalReference: subject.reference || undefined,
        }),
      });
    } catch (e) {
      return { ok: false, error: `First AML request failed: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `First AML ${res.status}: ${body.slice(0, 300)}` };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string; inviteUrl?: string; url?: string };
    return {
      ok: true,
      reference: json.id ?? "",
      inviteUrl: json.inviteUrl ?? json.url ?? "",
      status: "pending",
    };
  }

  async screen(opts: ScreenOptions): Promise<ScreenResult> {
    if (!opts.name) return { ok: false, error: "Subject name is required" };
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/screenings`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          name: opts.name,
          dateOfBirth: opts.dob || undefined,
          lists: opts.lists ?? ALL_SCREENING_LIST_CODES,
        }),
      });
    } catch (e) {
      return { ok: false, error: `First AML request failed: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `First AML ${res.status}: ${body.slice(0, 300)}` };
    }
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      result?: string;
      matches?: { list?: string; name?: string; score?: number; details?: string }[];
    };
    const matches: ScreeningMatch[] = (json.matches ?? [])
      .filter((m): m is { list: string; name?: string; score?: number; details?: string } => typeof m.list === "string")
      .map((m) => ({
        list: (ALL_SCREENING_LIST_CODES.includes(m.list as ScreeningListCode)
          ? (m.list as ScreeningListCode)
          : "ADVERSE_MEDIA"),
        matchedName: m.name ?? opts.name,
        score: typeof m.score === "number" ? m.score : 0,
        details: m.details ?? "",
      }));
    const result: ScreeningResult =
      json.result === "confirmed_match" || json.result === "potential_match" || json.result === "clear"
        ? json.result
        : matches.length > 0
          ? "potential_match"
          : "clear";
    return { ok: true, reference: json.id ?? "", result, matches, screenedAt: new Date().toISOString() };
  }
}

/* ── Manual fallback (no live provider configured) ───────────────────────── */

/**
 * The offline provider. Every call fails soft with a clear reason so the UI can
 * fall back to a MANUAL workflow — the compliance officer runs the checks
 * themselves and records the outcome — rather than blocking. This mirrors
 * utils/brevo.ts returning `{ ok:false }` when BREVO_API_KEY is missing.
 */
class ManualProvider implements AmlProvider {
  readonly id = "manual";
  readonly live = false;
  async startVerification(): Promise<VerifyStartResult> {
    return { ok: false, error: "FIRST_AML_API_KEY not set — record verification manually" };
  }
  async screen(): Promise<ScreenResult> {
    return { ok: false, error: "FIRST_AML_API_KEY not set — record screening manually" };
  }
}

/* ── Factory ─────────────────────────────────────────────────────────────── */

let cached: AmlProvider | null = null;

/** The configured provider — First AML when keyed, else the manual fallback. */
export function amlProvider(): AmlProvider {
  if (cached) return cached;
  const key = process.env.FIRST_AML_API_KEY;
  if (key) {
    const base = process.env.FIRST_AML_BASE_URL || FIRST_AML_DEFAULT_BASE;
    cached = new FirstAmlProvider(key, base);
  } else {
    cached = new ManualProvider();
  }
  return cached;
}

/** Test seam: reset the memoised provider (e.g. after stubbing env). */
export function __resetAmlProvider(): void {
  cached = null;
}
