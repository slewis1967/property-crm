import { describe, it, expect, vi, beforeEach } from "vitest";

/* An in-memory stand-in for the two tables sendPaForSigning touches. It applies
 * the filters for real (eq / is / in), because the thing under test IS the
 * filter: the claim only works if `signing_sent_at is null` is honoured. */
type Row = Record<string, unknown>;
type Query = {
  table: string;
  op: "select" | "update";
  payload: Row | null;
  eq: [string, unknown][];
  is: [string, unknown][];
  in: [string, unknown[]][];
};

const h = vi.hoisted(() => ({
  store: { preliminary_assessments: [] as Row[], signature_requests: [] as Row[] } as Record<string, Row[]>,
  create: vi.fn(),
  /** Runs once, just before the claim update is applied — to stage a race. */
  beforeClaim: null as null | (() => void),
}));

function run(q: Query): { data: Row[]; error: null } {
  if (q.op === "update" && q.payload && "signing_sent_at" in q.payload && q.payload.signing_sent_at) {
    const hook = h.beforeClaim;
    h.beforeClaim = null;
    hook?.();
  }
  const hit = (h.store[q.table] ?? []).filter(
    (r) =>
      q.eq.every(([c, v]) => r[c] === v) &&
      q.is.every(([c, v]) => (r[c] ?? null) === v) &&
      q.in.every(([c, v]) => v.includes(r[c])),
  );
  if (q.op === "update") hit.forEach((r) => Object.assign(r, q.payload));
  return { data: hit, error: null };
}

vi.mock("./supabase", () => ({
  supabase: {
    from(table: string) {
      const q: Query = { table, op: "select", payload: null, eq: [], is: [], in: [] };
      const api = {
        select: () => api,
        update: (row: Row) => ((q.op = "update"), (q.payload = row), api),
        eq: (c: string, v: unknown) => (q.eq.push([c, v]), api),
        is: (c: string, v: unknown) => (q.is.push([c, v]), api),
        in: (c: string, v: unknown[]) => (q.in.push([c, v]), api),
        maybeSingle: () => {
          const { data, error } = run(q);
          return Promise.resolve({ data: data[0] ?? null, error });
        },
        then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) =>
          Promise.resolve(run(q)).then(ok, no),
      };
      return api;
    },
  },
}));

// The real module emails people. Only its constant is real here.
vi.mock("./signature-requests-create", () => ({
  MAX_SIGNERS: 2,
  DEFAULT_EXPIRY_DAYS: 14,
  signEmailHtml: () => "<p>sign</p>",
  createSignatureRequests: h.create,
}));

const { validatePaSigners, paDocLabel, sendPaForSigning } = await import("./pa-signing");

const PA_ID = "0b0f7b56-51d7-4d8e-9c53-0d7f6a3d2c11";
const MARCIA = { name: "Marcia LIBMAN", email: "marcia@example.com" };
const MARK = { name: "Mark Benjamin LIBMAN", email: "mark@example.com" };

const pa = (over: Row = {}): Row => ({
  id: PA_ID,
  status: "Presented",
  signing_sent_at: null,
  signing_error: null,
  data: { applicants: [MARCIA, MARK] },
  ...over,
});
const row = () => h.store.preliminary_assessments[0];
const send = () => sendPaForSigning({ paId: PA_ID, origin: "https://crm.example", createdBy: "rep@example.com" });

beforeEach(() => {
  h.store.preliminary_assessments = [pa()];
  h.store.signature_requests = [];
  h.beforeClaim = null;
  h.create.mockReset();
  h.create.mockResolvedValue({ ok: true, requests: [], links: [] });
});

describe("validatePaSigners", () => {
  it("passes one or two applicants through in applicant order", () => {
    expect(validatePaSigners([MARCIA])).toEqual({ ok: true, signers: [MARCIA] });
    expect(validatePaSigners([MARK, MARCIA])).toEqual({ ok: true, signers: [MARK, MARCIA] });
  });

  it("refuses a PA with nobody on it", () => {
    const r = validatePaSigners([]);
    expect(r.ok).toBe(false);
  });

  it("refuses more applicants than the engine can carry, rather than sending to the first two", () => {
    const r = validatePaSigners([MARCIA, MARK, { name: "Third PERSON", email: "third@example.com" }]);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) {
      expect(r.error).toContain("3 applicants");
      expect(r.error).toContain("not sent to anyone");
    }
  });

  it("refuses when any one applicant has no usable email, and names them", () => {
    for (const email of ["", "not-an-email", "mark@", "mark @example.com"]) {
      const r = validatePaSigners([MARCIA, { name: "Mark Benjamin LIBMAN", email }]);
      expect(r).toMatchObject({ ok: false });
      if (!r.ok) {
        expect(r.error).toContain("Mark Benjamin LIBMAN");
        expect(r.error).not.toContain("Marcia");
      }
    }
  });

  it("still has something to say when the applicant with no email has no name either", () => {
    const r = validatePaSigners([{ name: "", email: "" }]);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain("an unnamed applicant");
  });
});

describe("paDocLabel", () => {
  it("carries the applicants when known", () => {
    expect(paDocLabel("Marcia LIBMAN & Mark Benjamin LIBMAN")).toBe(
      "Preliminary Assessment (Marcia LIBMAN & Mark Benjamin LIBMAN)",
    );
    expect(paDocLabel("")).toBe("Preliminary Assessment");
  });
});

describe("sendPaForSigning", () => {
  it("claims, sends to every applicant as Springboard, and moves the status on", async () => {
    const r = await send();
    expect(r).toEqual({ ok: true, alreadySent: false, sentTo: [MARCIA.email, MARK.email] });
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create.mock.calls[0][0]).toMatchObject({
      docType: "preliminary_assessment",
      docId: PA_ID,
      signers: [MARCIA, MARK],
      brand: "springboard",
      deliver: "email",
      origin: "https://crm.example",
      createdBy: "rep@example.com",
      docLabel: "Preliminary Assessment (Marcia LIBMAN & Mark Benjamin LIBMAN)",
    });
    expect(row().status).toBe("Sent for signing");
    expect(row().signing_sent_at).toBeTruthy();
    expect(row().signing_error).toBeNull();
  });

  it("does not send twice", async () => {
    await send();
    const again = await send();
    expect(again).toEqual({ ok: true, alreadySent: true, sentTo: [MARCIA.email, MARK.email] });
    expect(h.create).toHaveBeenCalledTimes(1);
  });

  it("loses the race cleanly when another caller claims between the read and the write", async () => {
    h.beforeClaim = () => {
      row().signing_sent_at = "2026-10-06T01:00:00.000Z";
    };
    const r = await send();
    expect(r).toMatchObject({ ok: true, alreadySent: true });
    expect(h.create).not.toHaveBeenCalled();
    // The winner's claim is untouched.
    expect(row().signing_sent_at).toBe("2026-10-06T01:00:00.000Z");
  });

  it("releases the claim and records why when the send fails", async () => {
    h.create.mockResolvedValue({ ok: false, error: "Could not send for signature: boom", status: 502 });
    const r = await send();
    expect(r).toEqual({ ok: false, error: "Could not send for signature: boom", status: 502 });
    expect(row().signing_sent_at).toBeNull();
    expect(row().signing_error).toBe("Could not send for signature: boom");
    expect(row().status).toBe("Presented");

    // And because the claim was released, the retry really does send.
    h.create.mockResolvedValue({ ok: true, requests: [], links: [] });
    expect(await send()).toMatchObject({ ok: true, alreadySent: false });
  });

  it("releases the claim when the send throws", async () => {
    h.create.mockRejectedValue(new Error("network"));
    const r = await send();
    expect(r).toMatchObject({ ok: false, status: 500 });
    expect(row().signing_sent_at).toBeNull();
    expect(row().signing_error).toBeTruthy();
  });

  it("sends to nobody when the PA has a third applicant, and tells the rep", async () => {
    h.store.preliminary_assessments = [
      pa({ data: { applicants: [MARCIA, MARK, { name: "Third PERSON", email: "t@example.com" }] } }),
    ];
    const r = await send();
    expect(r).toMatchObject({ ok: false, status: 422 });
    expect(h.create).not.toHaveBeenCalled();
    expect(row().signing_sent_at).toBeNull();
    expect(row().signing_error).toContain("3 applicants");
  });

  it("sends to nobody when one applicant has no email", async () => {
    h.store.preliminary_assessments = [pa({ data: { applicants: [MARCIA, { name: MARK.name }] } })];
    const r = await send();
    expect(r).toMatchObject({ ok: false, status: 422 });
    expect(h.create).not.toHaveBeenCalled();
    expect(row().signing_error).toContain(MARK.name);
  });

  it("refuses a signed or superseded PA", async () => {
    for (const status of ["Signed", "Superseded"]) {
      h.store.preliminary_assessments = [pa({ status })];
      expect(await send()).toMatchObject({ ok: false, status: 409 });
    }
    expect(h.create).not.toHaveBeenCalled();
  });

  it("does not add a second set of requests when some already exist for this PA", async () => {
    h.store.signature_requests = [
      { doc_type: "preliminary_assessment", doc_id: PA_ID, signer_email: MARCIA.email },
    ];
    const r = await send();
    expect(r).toEqual({ ok: true, alreadySent: true, sentTo: [MARCIA.email] });
    expect(h.create).not.toHaveBeenCalled();
    expect(row().signing_sent_at).toBeTruthy();
  });

  it("only moves the status forward from Received or Presented", async () => {
    h.store.preliminary_assessments = [pa({ status: "Sent for signing" })];
    expect(await send()).toMatchObject({ ok: true, alreadySent: false });
    expect(row().status).toBe("Sent for signing");
  });

  it("404s an unknown PA and 400s a malformed id", async () => {
    h.store.preliminary_assessments = [];
    expect(await send()).toMatchObject({ ok: false, status: 404 });
    expect(
      await sendPaForSigning({ paId: "nope", origin: "https://crm.example", createdBy: "rep@example.com" }),
    ).toMatchObject({ ok: false, status: 400 });
  });
});


describe("outstandingSigners", () => {
  it("resends to everyone who has not signed, whatever state their link is in", async () => {
    const { outstandingSigners } = await import("./pa-signing");
    const rows = [
      { id: "a", status: "signed" },
      { id: "b", status: "viewed" },
      { id: "c", status: "declined" },
      { id: "d", status: "sent" },
    ];
    expect(outstandingSigners(rows).map((r) => r.id)).toEqual(["b", "c", "d"]);
  });
  it("is empty once everyone has signed", async () => {
    const { outstandingSigners } = await import("./pa-signing");
    expect(outstandingSigners([{ status: "signed" }, { status: "signed" }])).toEqual([]);
  });
});
