"use client";

import { useState } from "react";
import { errMessage } from "../../utils/errors";

/**
 * "Copy guest link" for a contact. Requests a signed guest link from
 * /api/livekit/guest-link and copies it to the clipboard, so a broker can paste
 * it to a client who then joins the call without a CRM login.
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

  async function copyLink() {
    setLabel("…");
    try {
      const res = await fetch("/api/livekit/guest-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId, guestName }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't create link");
      await navigator.clipboard.writeText(data.url);
      setLabel("✓ Copied");
    } catch (err) {
      setLabel("Link failed");
      console.error("[guest-link]", errMessage(err));
    }
    setTimeout(() => setLabel("🔗 Guest link"), 2500);
  }

  return (
    <button type="button" onClick={copyLink} className={className}>
      {label}
    </button>
  );
}
