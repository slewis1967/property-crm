import type { Metadata } from "next";

/**
 * Metadata for the whole client shortlist subtree.
 *
 * The root layout's OpenGraph/web-app tags say "NextKey CRM", and a page title
 * alone does not override them — a client forwarding their link would preview as
 * our internal CRM. Neutral NextKey tags and an empty image list here, where no
 * future page can forget them.
 *
 * `robots: noindex` because the Cloudflare Access bypass makes these paths
 * publicly fetchable.
 */
export const metadata: Metadata = {
  title: "Your property shortlist — NextKey",
  applicationName: "NextKey",
  appleWebApp: { title: "NextKey" },
  robots: { index: false, follow: false },
  openGraph: {
    title: "Your property shortlist — NextKey",
    description: "Properties picked for you by NextKey Property Strategists.",
    type: "website",
    locale: "en_AU",
    images: [],
  },
  twitter: {
    card: "summary",
    title: "Your property shortlist — NextKey",
    description: "Properties picked for you by NextKey Property Strategists.",
    images: [],
  },
};

export default function ShortlistLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
