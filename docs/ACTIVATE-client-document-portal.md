# Activate the client document portal

The code is on `feat/client-document-portal`. Nothing is reachable until steps
A and B below are done. Step C is only needed when the Google Drive export is
built — do it later, not now.

Order matters: **A then B**. Doing B first would expose a route whose tables
don't exist yet.

---

## A. Apply the migration

`migrations/20260720_client_document_portal.sql` creates two tables and a
private storage bucket.

**Supabase dashboard → SQL Editor → New query** → paste the file contents → Run.

**Verify** (same SQL editor):

```sql
select count(*) from document_requests;   -- expect 0, not an error
select count(*) from client_documents;    -- expect 0, not an error
select id, public, file_size_limit from storage.buckets where id = 'client-documents';
```

The bucket must come back **`public = false`**. If it says true, stop — these
are payslips, photo ID and super statements, and a public bucket means anyone
with a guessable path can read them.

---

## B. Cloudflare Access bypass

`crm.nextkey.com.au` sits behind CF Access, so a borrower is blocked before
Next.js ever runs. Add **Bypass** applications for the two public paths. CF
Access matches the *most specific* path, so these override the domain-wide
login for just those routes.

**Cloudflare dashboard → Zero Trust → Access → Applications → Add an
application → Self-hosted**, twice:

| Application name | Subdomain / Domain | Path | Policy |
|---|---|---|---|
| CRM client portal (page) | `crm` / `nextkey.com.au` | `portal` | Action **Bypass**, Include **Everyone** |
| CRM client portal (API) | `crm` / `nextkey.com.au` | `api/portal` | Action **Bypass**, Include **Everyone** |

Path `portal` also covers `/portal/<token>`, and `api/portal` covers
`/api/portal/<token>/*`.

**These must mirror `isPublicPortalRoute` in `proxy.ts` exactly.** If the CF
paths and the code exemption drift apart you get one of two failures: routes
that 403 for clients, or — worse — authed routes silently losing their CF
Access header. That second failure is the trap the signing flow hit, which is
why `/api/sign/requests` had to move to `/api/signature-requests`.

**Do NOT add a bypass for `api/document-requests`.** That is the rep-side
management API and must keep its CF Access identity.

**Verify:** open a portal link in an incognito window (no CF session). You
should get the upload page, not the Access login screen.

### Why this is safe

Bypass means anyone with the URL reaches those endpoints — intended. The
security is the token, not the network:

- The raw token is 256 bits of randomness in the URL path. Only its SHA-256
  hash is stored, so a database leak cannot be replayed as a portal link.
- Every handler re-resolves the token itself and scopes all reads and writes to
  that request's own rows. A caller cannot reach another client's documents by
  supplying an id.
- The storage bucket is private with no RLS policies at all — the anon key
  cannot touch it. Reads and writes go only through routes holding the
  service-role key, and uploads use short-lived signed URLs.
- Unknown, cancelled and expired tokens all return the same "This link is not
  valid" message, so the endpoint can't be used to probe which tokens exist.

---

## C. Google service account — needed for the Drive export

The Drive export is now built (`utils/google-drive.ts`,
`/api/document-requests/[id]/export`). Until these three env vars are set, the
portal still works — the rep just can't push a finished set to Drive; the
"Send to Drive" button returns a "not configured" message and nothing else
breaks.

Steps:

1. **Google Cloud Console → APIs & Services → Library → enable the Google Drive API.**
2. **IAM & Admin → Service Accounts → Create service account.** Name it
   something like `nextkey-client-documents`. No project roles needed — Drive
   access comes from folder sharing, not IAM.
3. **Keys → Add key → Create new key → JSON.** Download it. Treat this file
   like a password: it grants access to whatever the account can see. Do not
   paste it into chat, commit it, or email it.
4. Copy the service account's email (ends `@<project>.iam.gserviceaccount.com`).
5. In **Google Drive**, create a folder (e.g. "Client Documents — PA
   submissions") in a NextKey-owned account. Share it with that service account
   email as **Editor**. Copy the folder id from the URL:
   `drive.google.com/drive/folders/<THIS>`.
6. Set three environment variables in **Netlify → Site settings → Environment
   variables**:

   | Variable | Value |
   |---|---|
   | `GOOGLE_SA_EMAIL` | the service account email |
   | `GOOGLE_SA_PRIVATE_KEY` | the `private_key` value from the JSON, newlines intact |
   | `GOOGLE_DRIVE_PARENT_FOLDER_ID` | the folder id from step 5 |

A service account is used rather than a rep's personal Google login so the
documents survive someone leaving, and so no individual's Drive holds other
people's payslips and ID.

---

## Rollback

The portal is inert until a document request exists — there is no link to open
and no way to create one until the rep-side UI ships. To disable it after that:

- Fastest: delete or disable the two Cloudflare Bypass applications. Clients
  immediately get the Access login screen instead of the portal; nothing else
  in the CRM is affected.
- Code-side: remove `isPublicPortalRoute` from the `||` chain in `proxy.ts`.

Neither touches stored documents.

---

## A privacy constraint that is not optional

**Do not issue a portal link before a lead has reached fact-find / PA stage.**

AUSTRAC initial customer due diligence is not due at enquiry, so collecting
photo ID from someone who has only filled in a web form is Privacy Act exposure
with no AML justification. The portal asks for ID because YLA require it *for
the Preliminary Assessment* — that is the point in the process where it is
justified, and not before.
