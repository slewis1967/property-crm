/**
 * POST /api/document-requests/<id>/verify   (AUTHED)
 *
 * The verification agent. Gathers an APPLICATION's collected documents (all
 * per-applicant requests sharing application_id), then checks each against YLA's
 * standard — deterministic structural checks (PDF, <1MB, not password-locked)
 * plus an AI visual check (legible / correct document / not a screenshot / not
 * rotated). Returns a pass/fail with specific, fixable issues per document.
 *
 * This is the gate before auto-packaging + auto-submitting to YLA: a fail must
 * stop the send so a bad set never costs the client a week.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { requiredSlots } from "../../../../../utils/yla-documents";
import { MODELS, orChat } from "../../../../../utils/openrouter";
import {
  DOCUMENT_REQUESTS_TABLE,
  DOC_MIGRATION_HINT,
  docTableMissing,
} from "../../../../../utils/document-requests-db";
import {
  hasPdfHeader,
  looksEncrypted,
  structuralIssues,
  visualCheckPrompt,
  parseVisualVerdict,
  visualIssues,
  docVerdict,
  buildResult,
  type DocVerdict,
} from "../../../../../utils/yla-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "client-documents";
const SELECT = "id,client_ref,application_id,applicant_name,status,created_at";
const AI_CONCURRENCY = 5;

type Matched = {
  requestId: string;
  applicant: string;
  docKey: string;
  filename: string;
  storage_path: string;
  mime: string;
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  // Allow skipping the AI pass (?visual=0) for a fast structural-only check.
  const doVisual = new URL(req.url).searchParams.get("visual") !== "0";

  const { data: request, error: reqErr } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (reqErr) {
    if (docTableMissing(reqErr)) return NextResponse.json({ ok: false, error: DOC_MIGRATION_HINT }, { status: 503 });
    return NextResponse.json({ ok: false, error: reqErr.message }, { status: 500 });
  }
  if (!request) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // The application = all requests sharing application_id (else just this one).
  let siblings = [request];
  if (request.application_id) {
    const { data: sibs } = await supabase
      .from(DOCUMENT_REQUESTS_TABLE)
      .select(SELECT)
      .eq("application_id", request.application_id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true });
    if (sibs && sibs.length) siblings = sibs;
  }

  const slots = requiredSlots();
  const matched: Matched[] = [];
  const missing: string[] = [];
  let received = 0;

  for (let ai = 0; ai < siblings.length; ai++) {
    const sib = siblings[ai]!;
    const who = siblings.length > 1 ? `Applicant ${ai + 1}` : sib.applicant_name || "Applicant";
    const { data: docs } = await supabase
      .from("client_documents")
      .select("id,doc_type,filename,storage_path,mime_type,status,uploaded_at")
      .eq("request_id", sib.id)
      .neq("status", "replaced")
      .order("uploaded_at", { ascending: true });

    const used = new Set<string>();
    for (const slot of slots) {
      const m = (docs ?? []).find((d) => !used.has(d.id) && d.doc_type === slot.docKey);
      if (!m) {
        missing.push(`${who}: ${slot.label}${slot.docKey === "photo_id" ? (slot.slot === 1 ? " (front)" : " (back)") : ""}`);
        continue;
      }
      used.add(m.id);
      received++;
      matched.push({
        requestId: sib.id,
        applicant: who,
        docKey: slot.docKey,
        filename: m.filename,
        storage_path: m.storage_path,
        mime: m.mime_type || "application/pdf",
      });
    }
  }

  // Verify each matched doc (bounded concurrency). Structural always; visual when
  // enabled. A fetch/AI failure becomes an explicit issue, never a silent pass.
  const verdicts: DocVerdict[] = new Array(matched.length);
  let next = 0;
  async function worker() {
    while (next < matched.length) {
      const i = next++;
      const m = matched[i]!;
      const structural: string[] = [];
      const visual: string[] = [];
      let sizeBytes = 0;
      try {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(m.storage_path, 300);
        if (!signed?.signedUrl) throw new Error("could not read from storage");
        const res = await fetch(signed.signedUrl);
        if (!res.ok) throw new Error("could not download");
        const buf = new Uint8Array(await res.arrayBuffer());
        sizeBytes = buf.byteLength;
        structural.push(
          ...structuralIssues({
            mime: m.mime,
            sizeBytes,
            isPdfHeader: hasPdfHeader(buf),
            encrypted: looksEncrypted(buf),
          }),
        );

        // Only run the (paid) visual check on files we could actually read and
        // that are structurally a PDF — a non-PDF already fails.
        if (doVisual && structural.length === 0) {
          const dataUrl = `data:application/pdf;base64,${Buffer.from(buf).toString("base64")}`;
          const chatBody: Record<string, unknown> = {
            model: MODELS.extract,
            max_tokens: 600,
            reasoning: { effort: "low" },
            messages: [
              {
                role: "user",
                content: [
                  { type: "file", file: { filename: m.filename, file_data: dataUrl } },
                  { type: "text", text: visualCheckPrompt(m.docKey) },
                ],
              },
            ],
            plugins: [{ id: "file-parser", pdf: { engine: "native" } }],
          };
          const response = await orChat(chatBody);
          const text = response.choices?.[0]?.message?.content;
          visual.push(...visualIssues(parseVisualVerdict(typeof text === "string" ? text : "")));
        }
      } catch (e) {
        structural.push(`couldn't be checked (${e instanceof Error ? e.message : "read error"})`);
      }
      verdicts[i] = docVerdict({
        docKey: m.docKey,
        applicant: m.applicant,
        filename: m.filename,
        sizeBytes,
        structural,
        visual,
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(AI_CONCURRENCY, matched.length) }, () => worker()));

  const result = buildResult({
    applicantCount: siblings.length,
    received,
    missing,
    docs: verdicts.filter(Boolean),
  });

  return NextResponse.json({
    ok: true,
    application_id: request.application_id,
    client_ref: request.client_ref,
    visual_checked: doVisual,
    ...result,
  });
}
