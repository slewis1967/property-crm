import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findHostBySlug } from "../../../utils/scheduling-hosts";
import BookClient from "./BookClient";

/**
 * Springboard booking links go out to leads by text and email, so the page must
 * not inherit the root layout's NextKey title and OG card (brand firewall — and
 * "investment guidance" is not something Springboard offers). Next merges
 * metadata shallowly: openGraph and twitter have to be replaced whole, a
 * `title` alone leaves the inherited cards in place. NextKey hosts keep the root
 * metadata apart from the title.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ host: string }>;
}): Promise<Metadata> {
  const { host: slug } = await params;
  const host = findHostBySlug(slug);
  if (!host) return {};
  if (host.brand !== "springboard") {
    return { title: `Book a meeting with ${host.displayName}` };
  }

  const title = "Book a time with Springboard Homes";
  const description = "Book a time to talk with Springboard Homes about your enquiry.";
  const image = { url: `/api/book/${host.slug}/og`, width: 1200, height: 630 };
  return {
    title: "Book a time | Springboard Homes",
    description,
    applicationName: "Springboard Homes",
    appleWebApp: { title: "Springboard Homes" },
    openGraph: {
      title,
      description,
      siteName: "Springboard Homes",
      images: [image],
      type: "website",
      locale: "en_AU",
    },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

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
