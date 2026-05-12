"use client";

/**
 * ComposeClient — full-page email composer with auto-save.
 *
 * Behaviour:
 *  - If `draftId` is passed → load the draft and hydrate the fields.
 *  - If `replyToEmailId` is passed → load the source email, derive To/Subject,
 *    pre-quote the original body, create a new draft on first save.
 *  - First keystroke creates the draft (POST) so a refresh doesn't lose work.
 *  - Subsequent changes auto-save (PATCH) on a 5s debounce. The "Saved Xs ago"
 *    indicator updates in real time.
 *  - Send fires the POST /api/mail/drafts/{id}/send endpoint, which deletes
 *    the draft on success and routes to /inbox.
 *
 * The body editor is a contentEditable div with a tiny toolbar — heavier
 * editors (TipTap) are a per-bundle cost we don't need for v1.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type DraftPayload = {
  id: string;
  to_addresses: string[] | null;
  cc_addresses: string[] | null;
  bcc_addresses: string[] | null;
  subject: string | null;
  body_html: string | null;
  reply_to_email_id: string | null;
  thread_id: string | null;
  updated_at: string;
};

const AUTOSAVE_DEBOUNCE_MS = 5000;

export default function ComposeClient({
  draftId,
  replyToEmailId,
}: {
  draftId: string | null;
  replyToEmailId: string | null;
}) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(draftId);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");

  const [loading, setLoading] = useState(Boolean(draftId || replyToEmailId));
  const [sending, setSending] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [savingNow, setSavingNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Snapshot the latest field values so the debounced save uses fresh data
  // without re-binding on every keystroke. Mutating a ref is cheaper than a
  // dep array that fires the effect on each change.
  const latestRef = useRef({ to, cc, bcc, subject, bodyHtml });

  useEffect(() => {
    latestRef.current = { to, cc, bcc, subject, bodyHtml };
  }, [to, cc, bcc, subject, bodyHtml]);

  // ── Initial hydration ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        if (draftId) {
          const res = await fetch(`/api/mail/drafts/${draftId}`);
          const data = (await res.json()) as { ok: boolean; draft?: DraftPayload; error?: string };
          if (!res.ok || !data.ok || !data.draft) throw new Error(data.error ?? "Draft load failed");
          if (cancelled) return;
          setTo((data.draft.to_addresses ?? []).join(", "));
          setCc((data.draft.cc_addresses ?? []).join(", "));
          setBcc((data.draft.bcc_addresses ?? []).join(", "));
          setShowCcBcc(
            (data.draft.cc_addresses ?? []).length > 0 ||
            (data.draft.bcc_addresses ?? []).length > 0,
          );
          setSubject(data.draft.subject ?? "");
          setBodyHtml(data.draft.body_html ?? "");
          if (bodyRef.current) bodyRef.current.innerHTML = data.draft.body_html ?? "";
        } else if (replyToEmailId) {
          const res = await fetch(`/api/emails/${replyToEmailId}`);
          const data = await res.json();
          if (!data.ok || !data.email) throw new Error(data.error ?? "Source email load failed");
          if (cancelled) return;
          const e = data.email;
          // For a reply: To = original sender; Subject = "Re: …" once;
          // Body opens with the user's empty space above a quoted block of
          // the original.
          setTo(e.from_email ?? "");
          setSubject(
            /^re:/i.test(e.subject ?? "") ? (e.subject ?? "") : `Re: ${e.subject ?? ""}`,
          );
          const quoted =
            `<br><br><blockquote style="border-left:3px solid #ddd;padding-left:12px;margin-left:0;color:#666">` +
            `<p style="margin:0 0 6px 0;font-size:12px;color:#999">` +
            `On ${e.sent_at ? new Date(e.sent_at).toLocaleString() : "an earlier date"}, ` +
            `${e.from_name ?? e.from_email} wrote:</p>` +
            (e.body_html ?? "") +
            `</blockquote>`;
          setBodyHtml(quoted);
          if (bodyRef.current) bodyRef.current.innerHTML = quoted;
          // Create draft immediately so reply state is durable even if the
          // user closes the tab before typing anything.
          const draftRes = await fetch("/api/mail/drafts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: e.from_email,
              subject: /^re:/i.test(e.subject ?? "") ? e.subject : `Re: ${e.subject ?? ""}`,
              body_html: quoted,
              reply_to_email_id: replyToEmailId,
              thread_id: e.thread_id,
            }),
          });
          const draftData = await draftRes.json();
          if (draftData.ok && draftData.draft) {
            setId(draftData.draft.id);
            setLastSavedAt(Date.now());
            // Replace URL so a refresh comes back to the draft, not the reply
            window.history.replaceState({}, "", `/inbox/compose?draft=${draftData.draft.id}`);
          }
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [draftId, replyToEmailId]);

  // ── Auto-save logic ─────────────────────────────────────────────────────
  const flushSave = useCallback(async () => {
    if (!dirtyRef.current) return;
    setSavingNow(true);
    const snapshot = latestRef.current;
    try {
      if (id) {
        await fetch(`/api/mail/drafts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: snapshot.to,
            cc: snapshot.cc,
            bcc: snapshot.bcc,
            subject: snapshot.subject,
            body_html: snapshot.bodyHtml,
          }),
        });
      } else {
        // First save creates the draft row. We only insert once any field
        // has content — saves a no-op draft from being created on visits
        // that don't lead to typing.
        const hasContent =
          snapshot.to || snapshot.cc || snapshot.bcc || snapshot.subject || snapshot.bodyHtml.replace(/<[^>]+>/g, "").trim();
        if (!hasContent) {
          dirtyRef.current = false;
          setSavingNow(false);
          return;
        }
        const res = await fetch("/api/mail/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: snapshot.to,
            cc: snapshot.cc,
            bcc: snapshot.bcc,
            subject: snapshot.subject,
            body_html: snapshot.bodyHtml,
          }),
        });
        const data = await res.json();
        if (data.ok && data.draft) {
          setId(data.draft.id);
          window.history.replaceState({}, "", `/inbox/compose?draft=${data.draft.id}`);
        }
      }
      dirtyRef.current = false;
      setLastSavedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingNow(false);
    }
  }, [id]);

  // Schedule a save when any field changes. The debounce lets fast typers
  // hit the API at 5s intervals instead of every keystroke.
  function markDirty() {
    dirtyRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void flushSave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  // Flush on unmount so closing the tab doesn't lose the last few seconds.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void flushSave();
    };
  }, [flushSave]);

  // ── Saved-indicator tick ────────────────────────────────────────────────
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);
  const savedAgo = useMemo(() => {
    if (!lastSavedAt) return null;
    const secs = Math.max(0, Math.round((Date.now() - lastSavedAt) / 1000));
    if (secs < 5) return "Saved just now";
    if (secs < 60) return `Saved ${secs}s ago`;
    return `Saved ${Math.round(secs / 60)}m ago`;
  }, [lastSavedAt, tick]);

  // ── Actions ─────────────────────────────────────────────────────────────
  async function send() {
    setError(null);
    // Make sure latest content is persisted before send. If no draft has
    // been created yet (visit-without-typing edge case), create one inline.
    await flushSave();
    if (!id) {
      setError("Nothing to send.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/mail/drafts/${id}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Send failed");
        setSending(false);
        return;
      }
      router.push("/inbox?view=sent");
    } catch (e) {
      setError((e as Error).message);
      setSending(false);
    }
  }

  async function discard() {
    if (!id) {
      router.push("/inbox");
      return;
    }
    if (!confirm("Discard this draft?")) return;
    await fetch(`/api/mail/drafts/${id}`, { method: "DELETE" });
    router.push("/inbox");
  }

  function applyFormat(cmd: string) {
    // document.execCommand is deprecated but still ships in every browser and
    // is the cheapest way to get bold/italic/link without an editor framework.
    document.execCommand(cmd);
    if (bodyRef.current) {
      setBodyHtml(bodyRef.current.innerHTML);
      markDirty();
    }
  }

  function applyLink() {
    const url = prompt("Link URL");
    if (!url) return;
    document.execCommand("createLink", false, url);
    if (bodyRef.current) {
      setBodyHtml(bodyRef.current.innerHTML);
      markDirty();
    }
  }

  if (loading) {
    return <div className="p-8 text-gray-400 text-sm">Loading draft…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">
          {id ? "Draft" : "New message"}
        </h1>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {savingNow ? "Saving…" : savedAgo}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <RecipientRow
          label="To"
          value={to}
          onChange={(v) => { setTo(v); markDirty(); }}
          autoFocus
        />
        {!showCcBcc && (
          <button
            type="button"
            onClick={() => setShowCcBcc(true)}
            className="px-4 py-1 text-[11px] text-gray-500 hover:text-[#0F4C5C] border-b border-gray-100 w-full text-left"
          >
            + Cc / Bcc
          </button>
        )}
        {showCcBcc && (
          <>
            <RecipientRow label="Cc"  value={cc}  onChange={(v) => { setCc(v); markDirty(); }} />
            <RecipientRow label="Bcc" value={bcc} onChange={(v) => { setBcc(v); markDirty(); }} />
          </>
        )}
        <div className="flex items-center border-b border-gray-100 px-4">
          <label className="text-xs text-gray-400 uppercase font-semibold w-12">Sub</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => { setSubject(e.target.value); markDirty(); }}
            placeholder="Subject"
            className="flex-1 px-2 py-2.5 text-sm outline-none"
          />
        </div>

        <div className="flex items-center gap-1 border-b border-gray-100 px-2 py-1.5 bg-gray-50">
          <ToolbarBtn onClick={() => applyFormat("bold")} title="Bold (Ctrl+B)">
            <strong>B</strong>
          </ToolbarBtn>
          <ToolbarBtn onClick={() => applyFormat("italic")} title="Italic (Ctrl+I)">
            <em>I</em>
          </ToolbarBtn>
          <ToolbarBtn onClick={() => applyFormat("underline")} title="Underline">
            <u>U</u>
          </ToolbarBtn>
          <ToolbarBtn onClick={() => applyFormat("insertUnorderedList")} title="Bulleted list">
            •
          </ToolbarBtn>
          <ToolbarBtn onClick={() => applyFormat("insertOrderedList")} title="Numbered list">
            1.
          </ToolbarBtn>
          <ToolbarBtn onClick={applyLink} title="Insert link">
            🔗
          </ToolbarBtn>
          <ToolbarBtn onClick={() => applyFormat("removeFormat")} title="Clear formatting">
            ⌫
          </ToolbarBtn>
        </div>

        <div
          ref={bodyRef}
          contentEditable
          suppressContentEditableWarning
          className="px-4 py-3 min-h-[300px] text-sm text-gray-900 outline-none prose prose-sm max-w-none"
          onInput={() => {
            if (bodyRef.current) {
              setBodyHtml(bodyRef.current.innerHTML);
              markDirty();
            }
          }}
        />
      </div>

      {error && (
        <p className="mt-3 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between mt-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={send}
            disabled={sending}
            className="px-5 py-2 rounded-lg bg-[#0F4C5C] text-white text-sm font-semibold hover:bg-[#0B3D4A] transition shadow-sm disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
          <button
            type="button"
            onClick={() => void flushSave()}
            className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 text-sm hover:bg-gray-50 transition"
          >
            Save now
          </button>
        </div>
        <button
          type="button"
          onClick={discard}
          className="px-4 py-2 text-sm text-gray-500 hover:text-red-600 transition"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

function RecipientRow({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex items-center border-b border-gray-100 px-4">
      <label className="text-xs text-gray-400 uppercase font-semibold w-12">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        placeholder="name@example.com, comma-separated"
        className="flex-1 px-2 py-2.5 text-sm outline-none"
      />
    </div>
  );
}

function ToolbarBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}  // keep focus in the editor
      onClick={onClick}
      title={title}
      className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 text-sm text-gray-700 transition"
    >
      {children}
    </button>
  );
}
