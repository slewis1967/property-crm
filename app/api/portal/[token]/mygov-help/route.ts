/**
 * POST /api/portal/<token>/mygov-help
 *   Body: { image: "data:image/...;base64,..." }
 *
 * PUBLIC. The client is stuck somewhere in myGov, photographs their screen, and
 * this tells them the single next thing to tap. Getting the ATO income
 * statement is the biggest stumbling block in the whole document set, and the
 * step people stall on differs every time — so rather than a longer guide, we
 * look at where they actually are.
 *
 * The screenshot is deliberately NEVER stored. It is a photo of a logged-in
 * government session and can show a TFN and income; it goes to the model in the
 * request body and is discarded with the response. Nothing is written to
 * storage or the database, and only the (short, non-identifying) instruction is
 * logged.
 *
 * INTERNET-FACING: token-resolved, rate-limited hard (each call is a vision
 * model request, so the limit is cost control as much as abuse control).
 */
import { NextResponse } from "next/server";
import { MODELS, orChat } from "../../../../../utils/openrouter";
import { enforceRateLimit } from "../../../../../utils/rate-limit";
import { resolveToken, clientIp } from "../../_shared";
import {
  financialYearsNeeded,
  screenHelpPrompt,
  parseScreenHelp,
} from "../../../../../utils/mygov-guide";
import { log, errInfo } from "../../../../../utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A phone screenshot is well under this; the cap stops a video-sized payload. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveToken(token);
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }

  // Every call is a vision-model request. Tight per-token+IP window.
  const limited = enforceRateLimit(req, {
    windowMs: 60_000,
    max: 6,
    keyFn: () => `portal-mygov-help:${token}:${clientIp(req)}`,
  });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const image = typeof body?.image === "string" ? body.image : "";
  const m = image.match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!m) {
    return NextResponse.json({ ok: false, error: "Please attach a photo of your screen." }, { status: 400 });
  }
  const mime = m[1]!.toLowerCase();
  if (!ALLOWED.includes(mime)) {
    return NextResponse.json({ ok: false, error: "That file type isn't supported — a screenshot or photo is fine." }, { status: 400 });
  }
  // base64 is 4/3 of the byte length; check before decoding anything.
  if ((m[2]!.length * 3) / 4 > MAX_IMAGE_BYTES) {
    return NextResponse.json({ ok: false, error: "That image is too large — please try a screenshot." }, { status: 413 });
  }

  const years = financialYearsNeeded(new Date());
  try {
    const response = await orChat({
      model: MODELS.extract,
      max_tokens: 400,
      reasoning: { effort: "low" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: image } },
            { type: "text", text: screenHelpPrompt(years) },
          ],
        },
      ],
    });
    const text = response.choices?.[0]?.message?.content;
    const help = parseScreenHelp(typeof text === "string" ? text : "");
    log.info("portal.mygov_help", { requestId: resolved.request.id, stuck: help.stuck });
    return NextResponse.json({ ok: true, help });
  } catch (e) {
    log.error("portal.mygov_help_failed", { requestId: resolved.request.id, ...errInfo(e) });
    // Never leave the client staring at an error on the step they're stuck on.
    return NextResponse.json({
      ok: true,
      help: {
        where: "",
        next: "",
        warning: "",
        stuck: true,
      },
    });
  }
}
