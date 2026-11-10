import type { Metadata } from "next";

/**
 * Metadata for the whole introducer subtree.
 *
 * The root layout sets app-wide OpenGraph and web-app tags that say "NextKey
 * Property Strategists" / "NextKey CRM". Those are inherited by every page, and
 * a page `title` alone does NOT override them — so pasting a portal link into
 * Slack, WhatsApp or LinkedIn previewed as NextKey even once the visible page
 * said Springboard. An introducer sharing the link with a colleague at their own
 * firm is a normal thing to do, so this is a real leak, just a quieter one than
 * the page body.
 *
 * Declared in a layout rather than on each page so future pages under
 * /introducer inherit it and can't reintroduce the leak by forgetting.
 * Individual pages still set their own `title`, which merges over this.
 *
 * `robots: noindex` matters here too: the CF Access bypass makes these paths
 * publicly fetchable, so without it a crawler could index the sign-in page.
 */
export const metadata: Metadata = {
  title: "Introducer Portal — Springboard Homes",
  applicationName: "Springboard Introducer Portal",
  appleWebApp: { title: "Springboard" },
  robots: { index: false, follow: false },
  openGraph: {
    title: "Springboard Introducer Portal",
    description: "Register a client and follow their progress.",
    type: "website",
    locale: "en_AU",
    // Explicitly emptied: the root layout's og:image is a NextKey asset, and an
    // inherited image would put NextKey artwork on a Springboard link preview.
    images: [],
  },
  twitter: {
    card: "summary",
    title: "Springboard Introducer Portal",
    description: "Register a client and follow their progress.",
    images: [],
  },
};

export default function IntroducerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
