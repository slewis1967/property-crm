"use client";

/**
 * HelpButton — the "How do I do this?" button on every staff page.
 *
 * Only the button lives here. The panel and all the guides behind it are
 * fetched the first time someone clicks, so the guides (which describe internal
 * screens) stay out of the bundle shared with public pages, and no page pays
 * for help it never opens. Rendered by the root layout for staff routes only.
 */
import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const HelpPanel = dynamic(() => import("./HelpPanel"), { ssr: false });

export default function HelpButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // Moving to another page closes the panel, so a guide for the old page is
  // never left sitting over the new one.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  if (open) return <HelpPanel onClose={close} />;
  return (
    <button
      type="button"
      data-appshell-chrome
      data-help-button
      onClick={() => setOpen(true)}
      className="fixed bottom-6 right-24 h-14 px-4 rounded-full bg-[#FFB627] text-gray-900 text-sm font-semibold shadow-lg hover:bg-[#f0a400] flex items-center gap-2 z-40 transition"
      aria-haspopup="dialog"
    >
      <span aria-hidden className="text-lg leading-none">?</span>
      <span>How do I do this?</span>
    </button>
  );
}
