"use client";

import { useState } from "react";
import { errMessage } from "../../utils/errors";

type LinkBrand = "nextkey" | "springboard";

/**
 * "Copy guest link" for a contact. Requests a signed guest link from
 * /api/livekit/guest-link and copies it to the clipboard, so a broker can paste
 * it to a client who then joins the call without a CRM login.
 *
 * The broker picks the brand: a Springboard lead gets a link on
 * book.springboardhomes.com.au, never a nextkey.com.au one. Contacts carry no
 * brand of their own, so this is a choice rather than a guess.
 */
export default function GuestLinkButton({
  contactId,
  guestName,
  className,
}: {
  contactId: string;
  guestName?: string;
  className?: string;
}) {
  const [label, setLabel] = useState("🔗 Guest link");
  const [choosing, setChoosing] = useState(false);

  async function copyLink(brand: LinkBrand) {
    setChoosing(false);
    setLabel("…");
    try {
      const res = await fetch("/api/livekit/guest-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId, guestName, brand }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't create link");
      await navigator.clipboard.writeText(data.url);
      setLabel(brand === "springboard" ? "✓ Springboard link copied" : "✓ NextKey link copied");
    } catch (err) {
      setLabel("Link failed");
      console.error("[guest-link]", errMessage(err));
    }
    setTimeout(() => setLabel("🔗 Guest link"), 2500);
  }

  if (choosing) {
    return (
      <span className="inline-flex items-center gap-1">
        <button type="button" onClick={() => copyLink("nextkey")} className={className}>
          NextKey link
        </button>
        <button type="button" onClick={() => copyLink("springboard")} className={className}>
          Springboard link
        </button>
        <button
          type="button"
          onClick={() => setChoosing(false)}
          aria-label="Cancel"
          className="px-1.5 text-xs text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <button type="button" onClick={() => setChoosing(true)} className={className}>
      {label}
    </button>
  );
}
