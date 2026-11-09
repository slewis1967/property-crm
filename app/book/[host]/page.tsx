import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { findHostBySlug } from "../../../utils/scheduling-hosts";
import {
  BOOK_HOST_HEADER,
  SPRINGBOARD_BOOK_ORIGIN,
  SPRINGBOARD_ICON_PATH,
} from "../../../utils/springboard-book-host";
import BookClient from "./BookClient";

/**
 * Springboard booking links go out to leads by text and email, so the page must
 * not inherit the root layout's NextKey title, icons and OG card (brand
 * firewall — and "investment guidance" is not something Springboard offers).
 * Next merges metadata shallowly: openGraph, twitter and icons have to be
 * replaced whole, a `title` alone leaves the inherited ones in place. NextKey
 * hosts keep the root metadata apart from the title.
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
  const icon = { url: SPRINGBOARD_ICON_PATH, sizes: "180x180", type: "image/png" };
  // On book.springboardhomes.com.au (proxy.ts sets this header after deleting
  // any client copy) absolute URLs and the canonical are built on that host. On
  // the CRM host they stay as they were, so links already sent out keep a
  // working preview image.
  const onBookHost = (await headers()).get(BOOK_HOST_HEADER) === "1";
  return {
    ...(onBookHost
      ? { metadataBase: new URL(SPRINGBOARD_BOOK_ORIGIN), alternates: { canonical: "/" } }
      : {}),
    title: "Book a time | Springboard Homes",
    description,
    applicationName: "Springboard Homes",
    appleWebApp: { title: "Springboard Homes" },
    icons: { icon: [icon], apple: [icon], shortcut: SPRINGBOARD_ICON_PATH },
    openGraph: {
      title,
      description,
      siteName: "Springboard Homes",
      images: [image],
      type: "website",
      locale: "en_AU",
      ...(onBookHost ? { url: "/" } : {}),
    },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

/** Browser chrome tint: Springboard navy rather than the root's NextKey teal. */
export async function generateViewport({
  params,
}: {
  params: Promise<{ host: string }>;
}): Promise<Viewport> {
  const { host: slug } = await params;
  return findHostBySlug(slug)?.brand === "springboard" ? { themeColor: "#020e40" } : {};
}

/**
 * PUBLIC self-book page: /book/<host-slug>. The in-house replacement for the
 * Google Calendar booking pages. Renders chromeless (see AppShell) so external
 * leads see a clean page, not the CRM. On crm.nextkey.com.au, reachability
 * requires a Cloudflare Access bypass for /book/* + /api/book/* (same as the
 * guest-video routes). The Springboard page is also served at the root of
 * book.springboardhomes.com.au (utils/springboard-book-host.ts).
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
      postBookingUrl={host.postBookingUrl ?? null}
    />
  );
}
