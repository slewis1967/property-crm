/**
 * Shared helpers for the PUBLIC client document portal (app/api/portal/[token]/*).
 * Not a route (underscore-prefixed).
 *
 * Trust model, identical to the e-signature routes: the raw token in the URL is
 * a 256-bit unguessable bearer credential. We store only its SHA-256 hash, so a
 * database leak cannot be replayed as a portal link. Every handler re-resolves
 * the token itself — never trust a caller-supplied request_id.
 */
import { supabase } from "../../../utils/supabase";
import { hashToken } from "../../../utils/sign-token";

export type PortalRequest = {
  id: string;
  client_ref: string | null;
  applicant_name: string;
  applicant_email: string | null;
  /** Resolves the client's own signed compliance documents. */
  contact_id: string | null;
  status: string;
  expires_at: string;
  drive_folder_url: string | null;
};

export type Resolved =
  | { ok: true; request: PortalRequest }
  | { ok: false; status: number; error: string };

/**
 * Look up a portal session from a raw token. Returns a discriminated result
 * rather than throwing so handlers can map it straight onto a response.
 *
 * Deliberately returns the SAME "This link is not valid" message for unknown,
 * cancelled and expired tokens — a distinct "expired" message would let someone
 * probe which tokens ever existed.
 */
export async function resolveToken(token: string): Promise<Resolved> {
  if (!token || typeof token !== "string" || token.length < 20) {
    return { ok: false, status: 404, error: "This link is not valid." };
  }

  const { data, error } = await supabase
    .from("document_requests")
    .select("id,client_ref,applicant_name,applicant_email,contact_id,status,expires_at,drive_folder_url")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: "Something went wrong. Please try again." };
  if (!data) return { ok: false, status: 404, error: "This link is not valid." };

  if (data.status === "cancelled" || data.status === "expired") {
    return { ok: false, status: 410, error: "This link is no longer active. Please contact your Springboard consultant." };
  }
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 410, error: "This link has expired. Please contact your Springboard consultant." };
  }

  return { ok: true, request: data as PortalRequest };
}

/**
 * Has a rep released the director ID walkthrough to this client?
 *
 * Queried SEPARATELY rather than joined into resolveToken's select on purpose.
 * Adding a new column to that shared select would take the entire portal down
 * with "column does not exist" on every request if this feature shipped before
 * its migration ran — which is precisely how the YLA sweep silently broke.
 * Here, a missing column just means the video stays hidden.
 *
 * Fails CLOSED: any error returns false. For gated content the safe default is
 * "not visible".
 */
export async function trainingVideoReleased(requestId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("document_requests")
    .select("training_video_released_at")
    .eq("id", requestId)
    .maybeSingle();
  if (error || !data) return false;
  return Boolean((data as { training_video_released_at?: string | null }).training_video_released_at);
}

/** Best-effort client IP, for audit on a public endpoint. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

// surnameOf / surnameForApplicant live in utils/yla-documents.ts (single source).
