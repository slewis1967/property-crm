import type { Metadata } from "next";

/**
 * Metadata for the whole partner subtree.
 *
 * The root layout's OpenGraph/web-app tags say "NextKey CRM", and a page title
 * alone does not override them. A partner pasting a portal link to a colleague
 * would preview as our internal CRM — and for a white-labelled firm, as us at
 * all. So the subtree gets neutral tags and an empty image list here, where no
 * future page can forget them.
 *
 * `robots: noindex` because the Cloudflare Access bypass makes these paths
 * publicly fetchable.
 */
export const metadata: Metadata = {
  title: "Partner Portal",
  applicationName: "Partner Portal",
  appleWebApp: { title: "Partner Portal" },
  robots: { index: false, follow: false },
  openGraph: {
    title: "Partner Portal",
    description: "Stock, clients and deals.",
    type: "website",
    locale: "en_AU",
    images: [],
  },
  twitter: { card: "summary", title: "Partner Portal", description: "Stock, clients and deals.", images: [] },
};

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
