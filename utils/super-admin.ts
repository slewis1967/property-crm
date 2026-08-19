/**
 * Super admin — the single authority for decisions that can't be delegated.
 *
 * The CRM has had exactly one privilege level since it was built: "is behind
 * Cloudflare Access". That was right while every user was Sean or Glenn. The
 * introducer portal breaks that assumption — accepting a third party's client
 * into the pipeline, and authorising a change to a submitted referral, are
 * decisions that sit with Sean personally, not with "whoever is logged in".
 *
 * So this is a second, narrower gate that sits ON TOP of Cloudflare Access, not
 * instead of it. A staff member is still fully authenticated; they simply can't
 * perform the two acts reserved to the owner.
 *
 * Configured by env, not by a database table, deliberately: a table of admins is
 * a table someone can be added to. Changing SUPER_ADMIN_EMAILS requires access
 * to the Netlify environment, which is Sean's alone.
 */

const DEFAULT_SUPER_ADMINS = ["sean.l@nextkey.com.au"];

/** Lower-cased set of the emails permitted to act as super admin. */
export function superAdminEmails(): Set<string> {
  const raw = (process.env.SUPER_ADMIN_EMAILS ?? "").trim();
  const list = raw
    ? raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_SUPER_ADMINS;
  return new Set(list);
}

/**
 * Is this authenticated CF Access identity the super admin?
 *
 * Fails CLOSED on anything unexpected — an empty string, the unauthenticated
 * sentinel from utils/cf-access.ts, or a value that isn't a string at all.
 */
export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  return superAdminEmails().has(email.trim().toLowerCase());
}

/* ── narrower still: overriding the accreditation course ─────────────────
 *
 * Reopening the course for a candidate — timers off, module gates open, a
 * failed exam's re-locking undone — is the one action that changes what an
 * accreditation MEANS rather than who holds it. A certificate issued off a
 * sitting that skipped the reading timers was earned under different
 * conditions from every other one, and the person who answers for that is the
 * owner personally.
 *
 * So it does NOT ride on SUPER_ADMIN_EMAILS. That is a LIST, and a list that
 * grows for perfectly good operational reasons — a second person who can accept
 * referrals and authorise an unlock is a normal thing to want, and it must not
 * silently hand them the ability to soften what accreditation requires.
 *
 * Own env var, own default, defaulting to one address. Setting
 * COURSE_OVERRIDE_EMAILS is a deliberate act in the Netlify environment, which
 * is the owner's alone — the same reasoning as above, applied one level in.
 */

const DEFAULT_COURSE_OVERRIDE = ["sean.l@nextkey.com.au"];

/** Lower-cased set of the emails permitted to override the course's gates. */
export function courseOverrideEmails(): Set<string> {
  const raw = (process.env.COURSE_OVERRIDE_EMAILS ?? "").trim();
  const list = raw
    ? raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_COURSE_OVERRIDE;
  return new Set(list);
}

/**
 * May this identity reopen the accreditation course for a candidate?
 *
 * Fails CLOSED on anything unexpected, exactly as isSuperAdmin does — an empty
 * string, the unauthenticated sentinel from utils/cf-access.ts, or a value that
 * is not a string at all.
 */
export function canOverrideCourse(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  return courseOverrideEmails().has(email.trim().toLowerCase());
}
