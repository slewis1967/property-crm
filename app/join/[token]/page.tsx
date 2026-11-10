import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import JoinClient from "./JoinClient";
import {
  BOOK_HOST_HEADER,
  SPRINGBOARD_BOOK_ORIGIN,
  SPRINGBOARD_ICON_PATH,
} from "../../../utils/springboard-book-host";

async function onBookHost(): Promise<boolean> {
  return (await headers()).get(BOOK_HOST_HEADER) === "1";
}

/**
 * On book.springboardhomes.com.au a Springboard lead opens this page from
 * their booking invite, so it must not inherit the root layout's NextKey
 * title, icons and OG card. Next merges metadata shallowly, so each is replaced
 * whole. On the CRM host the page keeps the root metadata, as before.
 */
export async function generateMetadata(): Promise<Metadata> {
  if (!(await onBookHost())) return {};
  const title = "Your video meeting | Springboard Homes";
  const description = "Join your video meeting with Springboard Homes.";
  const icon = { url: SPRINGBOARD_ICON_PATH, sizes: "180x180", type: "image/png" };
  return {
    metadataBase: new URL(SPRINGBOARD_BOOK_ORIGIN),
    title,
    description,
    applicationName: "Springboard Homes",
    appleWebApp: { title: "Springboard Homes" },
    icons: { icon: [icon], apple: [icon], shortcut: SPRINGBOARD_ICON_PATH },
    // A personal, tokenised link: never index it.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      siteName: "Springboard Homes",
      images: [{ url: "/api/book/springboard/og", width: 1200, height: 630 }],
      type: "website",
      locale: "en_AU",
    },
    twitter: { card: "summary_large_image", title, description, images: ["/api/book/springboard/og"] },
  };
}

export async function generateViewport(): Promise<Viewport> {
  return (await onBookHost()) ? { themeColor: "#020e40" } : {};
}

/**
 * Public guest-join page: /join/<guest-token>.
 *
 * Unwraps the signed guest token from the path and hands it to the client,
 * which redeems it at /api/livekit/guest-token for a LiveKit join token. No
 * CRM login required — but Cloudflare Access must have a bypass for `/join/*`
 * (and `/api/livekit/guest-token`) or external guests hit the Access wall.
 * Also served on book.springboardhomes.com.au for Springboard self-bookings
 * (utils/springboard-book-host.ts).
 */
export default async function GuestJoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <JoinClient guestToken={decodeURIComponent(token)} />;
}
