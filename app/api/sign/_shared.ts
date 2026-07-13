/**
 * Small shared helpers for the PUBLIC signing routes (app/api/sign/[token]/*).
 * Not a route (underscore-prefixed) — just colocated utilities.
 */

/** Best-effort client IP from the forwarding headers (evidence for the audit). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Rate-limit key for a public token endpoint: the client IP plus a short prefix
 * of the token, so a single token can't be hammered and one IP can't spray many
 * tokens. Never the full token (kept out of the rate-limit store).
 */
export function rateKeyFromToken(req: Request, token: string): string {
  const ip = clientIp(req);
  const prefix = typeof token === "string" ? token.slice(0, 8) : "none";
  return `${ip}:${prefix}`;
}
