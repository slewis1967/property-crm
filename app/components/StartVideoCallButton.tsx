"use client";

/**
 * "Video call" button for a contact / opportunity detail page.
 *
 * Opens the call room for this contact in a new tab (app/video/[room]). The
 * room is deterministic per contact, so the broker can send the same link to
 * the client (or the client opens it from their own portal) and both land in
 * the same call. Token minting happens on the call page, not here.
 *
 * Mirrors the existing "Schedule meeting" button affordance on the contact
 * detail; drop it next to that.
 */
export default function StartVideoCallButton({
  contactId,
  className,
  label = "🎥 Video call",
}: {
  contactId: string;
  className?: string;
  label?: string;
}) {
  const href = `/video/contact-${encodeURIComponent(contactId)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {label}
    </a>
  );
}
