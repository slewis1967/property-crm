/**
 * The last step: two documents, signed one at a time.
 *
 * The regression this pins is SBI-2026-0004 and -0005 — accredited introducers
 * sitting on `agreement_sent` with no document behind the step, because
 * `agreement_sent` only ever sent a notice. The rules worth defending are that
 * the SECOND document is offered after the first, and that the application does
 * not advance until BOTH are in.
 *
 * Supabase is faked with a store rather than mocked per-call, because every
 * assertion here is about the data — which documents exist, which are signed,
 * what state the application ends in.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Application } from "./introducer-onboarding-db";

type Row = Record<string, unknown>;

const store = {
  introducer_applications: [] as Row[],
  introducer_agreement_docs: [] as Row[],
  signature_requests: [] as Row[],
  introducer_events: [] as Row[],
};

let idSeq = 0;

type Query = {
  table: keyof typeof store;
  op: "select" | "insert" | "update";
  eq: [string, unknown][];
  ins: [string, unknown[]][];
  payload: Row | null;
};

const matches = (r: Row, q: Query) =>
  q.eq.every(([c, v]) => r[c] === v) &&
  q.ins.every(([c, vs]) => vs.includes(r[c] as never));

function run(q: Query) {
  const rows = store[q.table];

  if (q.op === "insert") {
    const row = { id: `id-${++idSeq}`, created_at: new Date(idSeq).toISOString(), ...q.payload };
    rows.push(row);
    return { data: row, error: null };
  }
  if (q.op === "update") {
    const hit = rows.filter((r) => matches(r, q));
    hit.forEach((r) => Object.assign(r, q.payload));
    return { data: hit, error: null };
  }
  return { data: rows.filter((r) => matches(r, q)), error: null };
}

vi.mock("./supabase", () => ({
  supabase: {
    from(table: keyof typeof store) {
      const q: Query = { table, op: "select", eq: [], ins: [], payload: null };
      const api = {
        select: () => api,
        insert: (row: Row) => ((q.op = "insert"), (q.payload = row), api),
        update: (row: Row) => ((q.op = "update"), (q.payload = row), api),
        eq: (c: string, v: unknown) => (q.eq.push([c, v]), api),
        in: (c: string, v: unknown[]) => (q.ins.push([c, v]), api),
        order: () => api,
        limit: () => api,
        maybeSingle: () => {
          const { data, error } = run(q);
          return Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
        },
        single: () => {
          const { data, error } = run(q);
          return Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
        },
        then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) =>
          Promise.resolve(run(q)).then(ok, no),
      };
      return api;
    },
  },
}));

const {
  openAgreementSigning,
  agreementProgress,
  advanceApplicationOnAgreementSigned,
  AGREEMENT_SEQUENCE,
} = await import("./introducer-agreement-signing");
const { introducerDocDataFor } = await import("./introducer-doc-signing");
const { readyToIssue } = await import("./introducer-agreement");
const { renderIntroducerAgreementHtml } = await import("./pdf/introducerAgreementPdf");

const APP_ID = "545f633f-5700-404e-a787-f0b60f718e04";
const NOW = new Date("2026-08-20T00:00:00.000Z");

const app = (over: Partial<Application> = {}): Application =>
  ({
    id: APP_ID,
    legal_name: "Glenn B Mayes",
    email: "glenn.m@example.com",
    firm_name: "G.B. Mayes Holdings",
    abn: "49 634 656 947",
    acn: "",
    registered_address: "1 Example St",
    tier: "t2",
    agreement_variant: "standard",
    state: "agreement_sent",
    accreditation_no: "SBI-2026-0004",
    ...over,
  }) as Application;

/** Mark whatever document is currently outstanding as executed. */
function signCurrent() {
  const req = store.signature_requests.at(-1)!;
  req.status = "signed";
}

beforeEach(() => {
  idSeq = 0;
  store.introducer_applications = [{ id: APP_ID, state: "agreement_sent" }];
  store.introducer_agreement_docs = [];
  store.signature_requests = [];
  store.introducer_events = [];
});

describe("introducerDocDataFor", () => {
  it("cites the accreditation number on the agreement, and never on the NDA", () => {
    expect(introducerDocDataFor(app(), "introducer_nda", NOW.toISOString()).accreditation_no).toBe("");
    expect(
      introducerDocDataFor(app(), "introducer_agreement", NOW.toISOString()).accreditation_no,
    ).toBe("SBI-2026-0004");
  });

  it("puts the fee on a paid schedule and nowhere else", () => {
    const paid = app({ agreement_variant: "paid", fee_per_settlement: "$2,500 per settled referral" });
    expect(introducerDocDataFor(paid, "introducer_schedule", NOW.toISOString()).fee_per_settlement).toBe(
      "$2,500 per settled referral",
    );
    // The agreement carries no money, and a standard schedule must not either —
    // it ships beside terms saying no fee is payable.
    expect(introducerDocDataFor(paid, "introducer_agreement", NOW.toISOString()).fee_per_settlement).toBe("");
    const standard = app({ fee_per_settlement: "$2,500 per settled referral" });
    expect(
      introducerDocDataFor(standard, "introducer_schedule", NOW.toISOString()).fee_per_settlement,
    ).toBe("");
  });
});

describe("openAgreementSigning", () => {
  it("offers the referral agreement first", async () => {
    const opened = await openAgreementSigning(app(), NOW);
    expect(opened.ok && opened.docType).toBe("introducer_agreement");
    expect(opened.ok && opened.remaining).toBe(2);
  });

  it("offers the schedule once the agreement is signed, not the agreement again", async () => {
    await openAgreementSigning(app(), NOW);
    signCurrent();

    const second = await openAgreementSigning(app(), NOW);
    expect(second.ok && second.docType).toBe("introducer_schedule");
    expect(second.ok && second.remaining).toBe(1);
  });

  it("reaches the same document twice rather than minting a second one", async () => {
    const a = await openAgreementSigning(app(), NOW);
    const b = await openAgreementSigning(app(), NOW);
    expect(a.ok && b.ok && a.docId).toBe(b.ok ? b.docId : "");
    expect(store.introducer_agreement_docs).toHaveLength(1);
    // One request row, rotated — a second would never let allSigned be true.
    expect(store.signature_requests).toHaveLength(1);
  });

  it("says so plainly when both are already in", async () => {
    for (let i = 0; i < AGREEMENT_SEQUENCE.length; i++) {
      await openAgreementSigning(app(), NOW);
      signCurrent();
    }
    const done = await openAgreementSigning(app(), NOW);
    expect(done).toMatchObject({ ok: false, reason: "complete" });
  });

  it("refuses a paid schedule with no fee, and names the reason", async () => {
    const paid = app({ agreement_variant: "paid" });
    await openAgreementSigning(paid, NOW);
    signCurrent();

    const schedule = await openAgreementSigning(paid, NOW);
    expect(schedule.ok).toBe(false);
    expect(!schedule.ok && schedule.reason).toBe("not_ready");
    expect(!schedule.ok && schedule.error).toMatch(/referral fee has not been set/);
  });

  it("refuses anything before the certificate, since both documents cite the number", async () => {
    const early = await openAgreementSigning(app({ accreditation_no: null }), NOW);
    expect(early.ok).toBe(false);
    expect(!early.ok && early.error).toMatch(/no accreditation number/);
  });
});

describe("advanceApplicationOnAgreementSigned", () => {
  it("does not advance on the first of the two signatures", async () => {
    const first = await openAgreementSigning(app(), NOW);
    signCurrent();

    const res = await advanceApplicationOnAgreementSigned(first.ok ? first.docId : "", "glenn.m@example.com");
    expect(res).toEqual({ advanced: false, complete: false });
    expect(store.introducer_applications[0].state).toBe("agreement_sent");
  });

  it("advances once the second is in", async () => {
    let last = "";
    for (let i = 0; i < AGREEMENT_SEQUENCE.length; i++) {
      const o = await openAgreementSigning(app(), NOW);
      last = o.ok ? o.docId : last;
      signCurrent();
    }

    const res = await advanceApplicationOnAgreementSigned(last, "glenn.m@example.com");
    expect(res).toEqual({ advanced: true, complete: true });
    expect(store.introducer_applications[0].state).toBe("agreement_signed");
    expect(store.introducer_events.at(-1)).toMatchObject({ action: "agreement_signed" });
  });

  it("never drags an activated introducer backwards", async () => {
    let last = "";
    for (let i = 0; i < AGREEMENT_SEQUENCE.length; i++) {
      const o = await openAgreementSigning(app(), NOW);
      last = o.ok ? o.docId : last;
      signCurrent();
    }
    // Staff activated them in the window before the hook ran. Forward-only: a
    // no-op is correct here, not a re-opened step.
    store.introducer_applications[0].state = "activated";

    const res = await advanceApplicationOnAgreementSigned(last, "glenn.m@example.com");
    expect(res).toEqual({ advanced: false, complete: true });
    expect(store.introducer_applications[0].state).toBe("activated");
  });
});

describe("agreementProgress", () => {
  it("reports nothing signed before anything is issued", async () => {
    expect(await agreementProgress(APP_ID)).toEqual({
      signed: [],
      outstanding: ["introducer_agreement", "introducer_schedule"],
      complete: false,
    });
  });

  it("does not count a document whose signature is still outstanding", async () => {
    await openAgreementSigning(app(), NOW);
    const p = await agreementProgress(APP_ID);
    expect(p.signed).toEqual([]);
    expect(p.complete).toBe(false);
  });
});

describe("the BDM arrangement", () => {
  const bdm = () =>
    app({
      agreement_variant: "paid",
      fee_per_settlement: "$5,000 per settled referral, including GST",
      recruits_introducers: true,
    });

  it("carries the network entitlement onto the schedule and nothing else", () => {
    expect(
      introducerDocDataFor(bdm(), "introducer_schedule", NOW.toISOString()).recruits_introducers,
    ).toBe(true);
    // The referral agreement says what the introducer may do; the money — and
    // therefore the network entitlement — lives only in the schedule.
    expect(
      introducerDocDataFor(bdm(), "introducer_agreement", NOW.toISOString()).recruits_introducers,
    ).toBe(false);
  });

  it("refuses a network entitlement on the standard arrangement", () => {
    // Springboard pays a standard introducer nothing at all, so there is
    // nothing for a network to earn a share of.
    const wrong = introducerDocDataFor(
      app({ recruits_introducers: true }),
      "introducer_schedule",
      NOW.toISOString(),
    );
    wrong.recruits_introducers = true;
    expect(readyToIssue(wrong)).toMatchObject({ ok: false });
    expect(
      readyToIssue(wrong) as { reason: string },
    ).toHaveProperty("reason", expect.stringMatching(/STANDARD arrangement/));
  });

  it("says on the document that the fee covers recruits' settled matters", async () => {
    const d = introducerDocDataFor(bdm(), "introducer_schedule", NOW.toISOString());
    const html = await renderIntroducerAgreementHtml(d, []);
    expect(html).toMatch(/introduced by you or by an introducer you recruited/);
    expect(html).toMatch(/Introducers you recruit/);
    // The recruit contracts with Springboard, not with the BDM — the clause
    // that keeps this from reading as employment or agency.
    expect(html).toMatch(/neither their employer nor their principal/);
    // And what the BDM pays them is explicitly outside our documents.
    expect(html).toMatch(/Springboard is not a party to it/);
  });

  it("leaves a non-recruiter's schedule saying only what it used to", async () => {
    const d = introducerDocDataFor(
      app({ agreement_variant: "paid", fee_per_settlement: "$5,000" }),
      "introducer_schedule",
      NOW.toISOString(),
    );
    const html = await renderIntroducerAgreementHtml(d, []);
    expect(html).not.toMatch(/Introducers you recruit/);
    expect(html).toMatch(/per settled matter introduced by you/);
  });
});

describe("the paid schedule tracks the Referral Fee Addendum", () => {
  const paid = () =>
    introducerDocDataFor(
      app({ agreement_variant: "paid", fee_per_settlement: "$5,000 including GST" }),
      "introducer_schedule",
      NOW.toISOString(),
    );

  it("pays on the addendum's terms, not 30 days from settlement", async () => {
    // The earlier wording promised payment Springboard could not honour — it
    // pays out of a Program Fee that has not necessarily cleared by then. Two
    // instruments describing one fee differently is a dispute waiting to happen.
    const html = await renderIntroducerAgreementHtml(paid(), []);
    expect(html).toMatch(/Program Fee for that matter in cleared funds/);
    expect(html).toMatch(/within 14 days of your invoice/);
    expect(html).not.toMatch(/within 30 days of settlement/);
  });

  it("carries the clawback, the one-per-client cap and the disclosure condition", async () => {
    const html = await renderIntroducerAgreementHtml(paid(), []);
    expect(html.replace(/\s+/g, " ")).toMatch(/repayable on demand if the settlement is later rescinded or unwound/);
    expect(html).toMatch(/One referral fee is payable for each client/);
    expect(html).toMatch(/A referral fee is withheld for any client/);
    // And never the standard schedule's blanket phrase, which means the
    // opposite and which a paid introducer must not meet in their own document.
    expect(html).not.toMatch(/No referral fee is payable/);
    expect(html).toMatch(/Accreditation must be current/);
  });

  it("still says the standard arrangement pays nothing, in as many words", async () => {
    const html = await renderIntroducerAgreementHtml(
      introducerDocDataFor(app(), "introducer_schedule", NOW.toISOString()),
      [],
    );
    expect(html).toMatch(/No referral fee is payable/);
    expect(html).not.toMatch(/within 14 days of your invoice/);
  });
});
