import { notFound } from "next/navigation";
import { findHostBySlug } from "../../../utils/scheduling-hosts";
import BookClient from "./BookClient";

/**
 * PUBLIC self-book page: /book/<host-slug>. The in-house replacement for the
 * Google Calendar booking pages. Renders chromeless (see AppShell) so external
 * leads see a clean page, not the CRM. Reachability requires a Cloudflare Access
 * bypass for /book/* + /api/book/* (same as the guest-video routes).
 */
export default async function BookPage({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host: slug } = await params;
  const host = findHostBySlug(slug);
  if (!host) notFound();

  return (
    <BookClient
      slug={host.slug}
      hostName={host.displayName}
      hostLabel={host.label}
      brand={host.brand}
    />
  );
}
