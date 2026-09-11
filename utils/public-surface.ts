/**
 * Request header that tells the root layout "this is a page an outsider sees".
 *
 * Set ONLY by proxy.ts, which overwrites whatever the client sent. The root
 * layout reads it to skip the staff sidebar and its database counts: the
 * sidebar is hidden on public pages by AppShell, but a hidden server-rendered
 * prop is still serialised into the page payload — so without this, anyone
 * loading /partner or /introducer received our internal queue counts and the
 * full staff route list. Found in the partner-portal review, 2026-09-11.
 *
 * A forged value can only ever REMOVE chrome from a staff page, never add
 * access, and the proxy strips it anyway.
 */
export const PUBLIC_SURFACE_HEADER = "x-nk-surface";
export const PUBLIC_SURFACE_VALUE = "public";
