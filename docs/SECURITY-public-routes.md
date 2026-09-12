# Public route hardening (sidebar suppression)

This repository routes certain pages through a public portal flow (no Cloudflare Access session). To prevent information leaks (staff route list and badge counts) the edge proxy now tags trusted public requests and the root layout skips all sidebar work.

Public route patterns (must match the proxy carve-outs exactly):

- Signer pages and token APIs: `/sign` and `/sign/*`, `/api/sign/*` (token-scoped only)
- Guest video join page and guest-token API: `/join`, `/join/*`, `/api/livekit/guest-token`
- Self-booking: `/book`, `/book/*`, `/api/book/*`
- Client document portal: `/portal`, `/portal/*`, `/api/portal/*`
- Introducer portal (public-facing): `/introducer`, `/introducer/*`, `/api/introducer/*`
- Channel-partner portal (public-facing): `/partner`, `/partner/*`, `/api/partner/*` — note `"/partners".startsWith("/partner")` is true, so the carve-out matches `/partner` exactly plus `/partner/`; the staff side at `/admin/partners` must never match

How the signal works (non-forgeable):

- `proxy.ts` computes `isPublic*` for the path. It first deletes any incoming `x-public-route` header, then:
  - sets `x-public-route: 1` on the downstream request for trusted public routes
  - sets `x-public-route: 0` for all other routes (including authenticated staff)
- `app/layout.tsx` reads `x-public-route` and, when `1`, does NOT:
  - run any sidebar DB count queries
  - render or serialize the staff sidebar (no staff route list appears in the RSC payload)

Quick verification

1. Public page (e.g. `/portal/<token>`):
   - No sidebar UI visible (chromeless AppShell)
   - Network → document response RSC payload should NOT contain strings like "Review Queue", "Builders", or other staff routes
   - Supabase logs/queries: no reads to `property_review_queue`, `builders`, `deal_packets`, `aml_reports`, or `paid_services`
2. Staff page (e.g. `/properties`) behind Cloudflare Access:
   - Sidebar renders with badges
   - Count queries run (visible in Supabase query log)

Notes

- The proxy strips any client-supplied `x-public-route` before setting its own value, so the signal cannot be forged by a browser.
- See inline comments in `proxy.ts` for the authoritative public path definitions. Keep this file in sync if those change.

