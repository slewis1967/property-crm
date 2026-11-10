/**
 * /shared-folder — the org-wide shared file library.
 *
 * Thin server shell: it exists to read `?parent=` off the URL (so a folder can
 * be bookmarked and shared as a link) and to hand it to the client component,
 * which owns every subsequent fetch. Access control is the Cloudflare Access
 * gate in proxy.ts — this route is deliberately NOT on any bypass list, so
 * "everyone in the organisation" is exactly the existing Access policy.
 */
import SharedFolderClient from "./SharedFolderClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Shared Folder — NextKey CRM",
};

export default async function SharedFolderPage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string }>;
}) {
  const { parent } = await searchParams;
  return <SharedFolderClient initialParent={parent ?? null} />;
}
