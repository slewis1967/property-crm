"use client";

import { useMemo, useState } from "react";
import {
  MAIL_IDENTITY_KEYS,
  MAIL_IDENTITY_LABELS,
  DEFAULT_IDENTITY_KEY,
  type MailIdentityKey,
} from "../../utils/mailIdentities";

interface TagCount {
  tag: string;
  count: number;
}

interface Violation {
  law: string;
  severity: "high" | "medium" | "low";
  snippet: string;
  reason: string;
  fix: string;
}

interface SendResult {
  ok: true;
  sequence_id: string;
  slug: string;
  enrolled_count: number;
  audience: string;
  eta_minutes: number;
}

const severityStyle: Record<Violation["severity"], string> = {
  high: "bg-red-100 text-red-800 border-red-300",
  medium: "bg-amber-100 text-amber-800 border-amber-300",
  low: "bg-gray-100 text-gray-700 border-gray-300",
};

export default function BroadcastClient({
  totalEligible,
  tags,
  optedOutCount,
}: {
  totalEligible: number;
  tags: TagCount[];
  optedOutCount: number;
}) {
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [textBody, setTextBody] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  // One control decides two things that must never disagree: the regulatory
  // identity the copy is reviewed under, and the address it is sent from.
  const [brand, setBrand] = useState<MailIdentityKey>(DEFAULT_IDENTITY_KEY);
  const [confirmAll, setConfirmAll] = useState(false);
  const [violations, setViolations] = useState<Violation[] | null>(null);
  const [reviewFailed, setReviewFailed] = useState<string | null>(null);
  const [ackViolations, setAckViolations] = useState(false);
  // Server-issued, content-bound token from a prior review_required /
  // review_failed response. Echoed back to authorise the override send.
  // The server re-derives the content hash, so editing the copy after a
  // review silently invalidates this and forces a fresh review.
  const [reviewToken, setReviewToken] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audienceCount = useMemo(() => {
    if (selectedTag === null) return totalEligible;
    return tags.find((t) => t.tag === selectedTag)?.count ?? 0;
  }, [selectedTag, totalEligible, tags]);

  const audienceLabel = selectedTag === null ? "All contacts" : `Tag: ${selectedTag}`;

  async function postBroadcast(
    mode: "review" | "override_violations" | "override_outage",
  ): Promise<void> {
    setSending(true);
    setError(null);
    setReviewFailed(null);
    try {
      // On a plain review, send no token (forces the server-side review).
      // On either override, echo the token the server issued earlier.
      const tokenForRequest = mode === "review" ? null : reviewToken;
      const r = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject,
          html_body: htmlBody,
          text_body: textBody,
          tag: selectedTag,
          brand,
          review_token: tokenForRequest,
        }),
      });
      const body = await r.json();
      if (body.status === "review_required") {
        setViolations(body.violations as Violation[]);
        setReviewToken(body.review_token ?? null);
        setAckViolations(false);
        return;
      }
      if (body.status === "review_failed") {
        setReviewFailed(body.error || "compliance review failed");
        setReviewToken(body.review_token ?? null);
        return;
      }
      if (!body.ok) {
        setError(body.error || `HTTP ${r.status}`);
        return;
      }
      setResult(body as SendResult);
      setViolations(null);
      setReviewToken(null);
      // Nudge the history section (sibling component) to refetch so the
      // just-queued broadcast shows up as pending without a page reload.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("broadcast:sent"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  function handleSendClick() {
    if (!subject.trim()) {
      setError("Subject is required.");
      return;
    }
    if (!htmlBody.trim()) {
      setError("HTML body is required.");
      return;
    }
    if (selectedTag === null && !confirmAll) {
      setError(`Tick "I confirm send to all ${totalEligible} contacts" first.`);
      return;
    }
    void postBroadcast("review");
  }

  if (result) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold mb-4">Broadcast queued</h1>
        <div className="bg-green-50 border border-green-200 rounded-xl p-6">
          <p className="text-green-900 text-lg font-semibold mb-2">
            ✓ Enrolled {result.enrolled_count} contact{result.enrolled_count === 1 ? "" : "s"}
          </p>
          <p className="text-sm text-green-800 mb-3">
            Audience: <strong>{result.audience}</strong>
            <br />
            Sequence slug: <code className="text-xs bg-white px-1 rounded">{result.slug}</code>
          </p>
          <p className="text-sm text-green-800">
            The sequence runner picks up due enrolments every 5 minutes. Estimated time to last
            send: <strong>~{result.eta_minutes} min</strong>.
          </p>
          <p className="text-xs text-green-700 mt-3">
            Watch it drain from pending to sent in <strong>Broadcast history</strong> below (hit
            Refresh), or see live step activity on{" "}
            <a href="/sequences" className="underline">/sequences</a>.
          </p>
        </div>
        <button
          onClick={() => {
            setResult(null);
            setSubject("");
            setHtmlBody("");
            setTextBody("");
            setSelectedTag(null);
            setConfirmAll(false);
          }}
          className="mt-6 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 text-sm"
        >
          Compose another
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-bold mb-2">Broadcast email</h1>
      <p className="text-gray-500 text-sm mb-6">
        Send a one-off email to every eligible contact (or a tagged subset). Runs through AU
        compliance review before any DB writes. The runner applies the Spam-Act footer +
        unsubscribe filter on every send — you don&apos;t need to add either to the body.
      </p>

      {/* Audience picker */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <h2 className="font-semibold mb-3">Audience</h2>
        <div className="flex items-center gap-2 mb-3">
          <select
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value as MailIdentityKey);
              // The review token is bound to the brand as well as the copy, so
              // switching business invalidates it. Drop it now rather than
              // letting the server reject it later.
              setReviewToken(null);
              setViolations(null);
              setAckViolations(false);
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            aria-label="Sending business"
          >
            {MAIL_IDENTITY_KEYS.map((k) => (
              <option key={k} value={k}>
                Send as {MAIL_IDENTITY_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <select
            value={selectedTag ?? "__all__"}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedTag(v === "__all__" ? null : v);
              setConfirmAll(false);
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
          >
            <option value="__all__">All contacts ({totalEligible.toLocaleString()})</option>
            {tags.map((t) => (
              <option key={t.tag} value={t.tag}>
                {t.tag} ({t.count.toLocaleString()})
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-600 whitespace-nowrap">
            → <strong>{audienceCount.toLocaleString()}</strong> {audienceLabel.toLowerCase()}
          </span>
        </div>
        <p className="text-xs text-gray-400">
          {optedOutCount.toLocaleString()} contact{optedOutCount === 1 ? "" : "s"} already opted
          out of email — excluded from every audience automatically.
        </p>
        {selectedTag === null && (
          <label className="flex items-center gap-2 mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
            <input
              type="checkbox"
              checked={confirmAll}
              onChange={(e) => setConfirmAll(e.target.checked)}
            />
            I confirm send to all {totalEligible.toLocaleString()} contacts.
          </label>
        )}
      </div>

      {/* Compose form */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4 space-y-4">
        <div>
          <label className="block text-sm font-semibold mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="e.g. New SDA properties — November 2026"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">HTML body</label>
          <textarea
            value={htmlBody}
            onChange={(e) => setHtmlBody(e.target.value)}
            rows={10}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
            placeholder="<p>Hi {{contact.first_name}},</p><p>...</p>"
          />
          <p className="text-xs text-gray-400 mt-1">
            Merge tags: <code>{"{{contact.first_name}}"}</code>,{" "}
            <code>{"{{contact.full_name}}"}</code>, <code>{"{{contact.email}}"}</code>,{" "}
            <code>{"{{contact.state}}"}</code>. Footer + unsubscribe added automatically.
          </p>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Plain-text body (optional)</label>
          <textarea
            value={textBody}
            onChange={(e) => setTextBody(e.target.value)}
            rows={4}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Fallback for clients that don't render HTML."
          />
        </div>
      </div>

      {/* HTML preview */}
      {htmlBody.trim() && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <h2 className="font-semibold mb-3 text-sm text-gray-600">Preview (HTML body only — footer added at send time)</h2>
          <div
            className="border border-gray-200 rounded p-4 text-sm bg-gray-50"
            dangerouslySetInnerHTML={{ __html: htmlBody }}
          />
        </div>
      )}

      {/* Errors */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}
      {reviewFailed && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 mb-4 text-sm">
          ⚠ Compliance review failed: {reviewFailed}. You can still send by ticking the override
          and submitting again.
          <label className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              checked={ackViolations}
              onChange={(e) => setAckViolations(e.target.checked)}
            />
            I&apos;ll skip the automated compliance review for this send.
          </label>
          {ackViolations && (
            <button
              onClick={() => void postBroadcast("override_outage")}
              disabled={sending}
              className="mt-3 px-4 py-2 bg-amber-700 text-white rounded text-sm hover:bg-amber-800 disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send without review"}
            </button>
          )}
        </div>
      )}

      {/* Violations modal (inline) */}
      {violations && violations.length > 0 && (
        <div className="bg-white border-2 border-red-300 rounded-xl p-5 mb-4">
          <h2 className="font-bold text-red-800 mb-3">
            ⚠ Compliance review flagged {violations.length} issue
            {violations.length === 1 ? "" : "s"}
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            The automated compliance check (Claude Haiku, AU law lens) flagged the wording below.
            Review carefully before sending. You can edit the copy and re-submit, or override.
          </p>
          <ul className="space-y-3 mb-4">
            {violations.map((v, i) => (
              <li key={i} className={`border rounded-lg p-3 ${severityStyle[v.severity]}`}>
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="font-semibold text-sm">{v.law}</span>
                  <span className="text-[10px] uppercase tracking-wide font-bold">
                    {v.severity}
                  </span>
                </div>
                <p className="text-xs italic mb-1">&ldquo;{v.snippet}&rdquo;</p>
                <p className="text-xs mb-1">
                  <strong>Why:</strong> {v.reason}
                </p>
                <p className="text-xs">
                  <strong>Fix:</strong> {v.fix}
                </p>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ackViolations}
              onChange={(e) => setAckViolations(e.target.checked)}
            />
            I&apos;ve read these warnings and want to send anyway.
          </label>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setViolations(null)}
              className="px-4 py-2 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50"
            >
              Edit copy
            </button>
            <button
              onClick={() => void postBroadcast("override_violations")}
              disabled={!ackViolations || sending}
              className="px-4 py-2 bg-red-700 text-white rounded text-sm hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? "Sending..." : "Override and send"}
            </button>
          </div>
        </div>
      )}

      {/* Primary send button */}
      {!violations && !reviewFailed && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleSendClick}
            disabled={sending}
            className="px-6 py-3 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-700 disabled:opacity-50"
          >
            {sending ? "Reviewing..." : `Review & send to ${audienceCount.toLocaleString()}`}
          </button>
          <p className="text-xs text-gray-400">
            Runs through compliance review first — you&apos;ll see flags before any send fires.
          </p>
        </div>
      )}
    </div>
  );
}
