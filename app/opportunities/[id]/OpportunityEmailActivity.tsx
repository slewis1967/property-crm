"use client";

/**
 * Email activity for this opportunity's contact — did it arrive, and did they
 * open it?
 *
 * Answers the question the CRM previously couldn't. A client saying "I never
 * got it" used to be unanswerable; establishing that a meeting invite had been
 * delivered-but-never-opened took a manual dig through Brevo's API, by which
 * point the meeting had been missed.
 *
 * The row that matters is DELIVERED BUT NOT OPENED — it reached them and they
 * didn't see it, which on Gmail almost always means spam or Promotions. Called
 * out explicitly rather than left for someone to infer from two timestamps.
 */
import type { EmailMessage } from "../../../utils/email-events";
import { deliveredButUnopened, statusLabel } from "../../../utils/email-events";

function chipClass(status: EmailMessage["status"]): string {
  switch (status) {
    case "clicked":
    case "opened":
      return "bg-green-100 text-green-700";
    case "delivered":
      return "bg-blue-100 text-blue-700";
    case "sent":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-red-100 text-red-700";
  }
}

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-AU", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
    timeZone: "Australia/Brisbane",
  });
}

export default function OpportunityEmailActivity({ messages }: { messages: EmailMessage[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Email activity</h2>
        <span className="text-xs text-gray-400">last 60 days</span>
      </div>

      {messages.length === 0 ? (
        <p className="text-sm text-gray-400">
          No email delivery data for this contact — either nothing has been sent, or they have no
          email address on file.
        </p>
      ) : (
        <div className="space-y-2">
          {messages.map((m, i) => {
            const unopened = deliveredButUnopened(m);
            return (
              <div
                key={`${m.subject}-${m.sentAt}-${i}`}
                className={`rounded-xl border px-4 py-2.5 ${
                  m.problem ? "border-red-200 bg-red-50" : unopened ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">{m.subject}</p>
                    <p className="text-xs text-gray-500">
                      {[
                        m.sentAt && `Sent ${when(m.sentAt)}`,
                        m.deliveredAt && `delivered ${when(m.deliveredAt)}`,
                        m.openedAt && `opened ${when(m.openedAt)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span
                    className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${chipClass(m.status)}`}
                  >
                    {statusLabel(m)}
                  </span>
                </div>

                {m.problem && <p className="mt-1.5 text-xs text-red-700">{m.problem}</p>}

                {unopened && (
                  <p className="mt-1.5 text-xs text-amber-800">
                    Reached their inbox but hasn&apos;t been opened — worth checking their spam or
                    promotions folder before assuming it wasn&apos;t sent. (Open tracking needs
                    images to load, so this isn&apos;t proof they didn&apos;t read it.)
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
