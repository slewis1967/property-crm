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
import { supabaseBrowser } from "../../../utils/supabase-browser";
import { sanitizeEmailHtml } from "../../../utils/sanitize-email";
import {
  MAIL_IDENTITY_KEYS,
  MAIL_IDENTITY_LABELS,
  DEFAULT_IDENTITY_KEY,
  isMailIdentityKey,
  type MailIdentityKey,
} from "../../../utils/mailIdentities";

type DraftPayload = {
  id: string;
  to_addresses: string[] | null;
  cc_addresses: string[] | null;
  bcc_addresses: string[] | null;
  subject: string | null;
  body_html: string | null;
  reply_to_email_id: string | null;
  thread_id: string | null;
  from_identity: string | null;
  updated_at: string;
};

// Wrap a rendered signature in a marker element so the composer can find and
// swap it in place when the From identity changes (instead of stacking two).
function wrapSignature(sigHtml: string): string {
  if (!sigHtml) return "";
  return `<div data-nk-signature="1">${sigHtml}</div>`;
}

type AttachmentChip = {
  id: string;
  filename: string;
  size_bytes: number | null;
  uploading?: boolean;
  error?: string | null;
};

const AUTOSAVE_DEBOUNCE_MS = 5000;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

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
  const [fromIdentity, setFromIdentity] = useState<MailIdentityKey>(DEFAULT_IDENTITY_KEY);

  const [loading, setLoading] = useState(Boolean(draftId || replyToEmailId));
  const [sending, setSending] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [savingNow, setSavingNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentChip[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Snapshot the latest field values so the debounced save uses fresh data
  // without re-binding on every keystroke. Mutating a ref is cheaper than a
  // dep array that fires the effect on each change.
  const latestRef = useRef({ to, cc, bcc, subject, bodyHtml, fromIdentity });

  useEffect(() => {
    latestRef.current = { to, cc, bcc, subject, bodyHtml, fromIdentity };
  }, [to, cc, bcc, subject, bodyHtml, fromIdentity]);

  // ── Hydrate attachments whenever we have a draft id ────────────────────
  useEffect(() => {
    if (!id) {
      setAttachments([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/mail/attachments?draft_id=${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.ok) return;
        setAttachments(
          (data.attachments as Array<{ id: string; filename: string; size_bytes: number | null }>).map(
            (a) => ({ id: a.id, filename: a.filename, size_bytes: a.size_bytes }),
          ),
        );
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  // ── Initial hydration ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        // Pull the signature in parallel so new-compose hydration is fast.
        // Existing drafts already have the sig baked in; only new compose
        // and reply paths need to inject it.
        const sigPromise = (!draftId)
          ? fetch("/api/mail/signature").then((r) => r.json()).catch(() => null)
          : Promise.resolve(null);

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
          setFromIdentity(
            isMailIdentityKey(data.draft.from_identity)
              ? data.draft.from_identity
              : DEFAULT_IDENTITY_KEY,
          );
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
          // Reply body layout: space for the user's reply at top, then their
          // signature, then the quoted original. This matches Gmail/Outlook so
          // the recipient sees the response → signature → quoted history.
          const sigData = await sigPromise;
          const sigHtml = (sigData && sigData.ok ? sigData.html : "") as string;
          // Sanitise the quoted original — inbound body_html is attacker-
          // controlled (anyone can send mail to us), so a `<script>` or
          // onerror payload would otherwise execute in this contentEditable
          // AND get persisted into the draft body for later send.
          const quoted =
            `<p><br></p>` +
            wrapSignature(sigHtml) +
            `<br><br><blockquote style="border-left:3px solid #ddd;padding-left:12px;margin-left:0;color:#666">` +
            `<p style="margin:0 0 6px 0;font-size:12px;color:#999">` +
            `On ${e.sent_at ? new Date(e.sent_at).toLocaleString() : "an earlier date"}, ` +
            `${e.from_name ?? e.from_email} wrote:</p>` +
            sanitizeEmailHtml(e.body_html) +
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
              from_identity: DEFAULT_IDENTITY_KEY,
            }),
          });
          const draftData = await draftRes.json();
          if (draftData.ok && draftData.draft) {
            setId(draftData.draft.id);
            setLastSavedAt(Date.now());
            // Replace URL so a refresh comes back to the draft, not the reply
            window.history.replaceState({}, "", `/inbox/compose?draft=${draftData.draft.id}`);
          }
        } else {
          // Plain new compose — prefill body with a blank line followed by
          // the signature so the user types into the empty space at the top.
          const sigData = await sigPromise;
          const sigHtml = (sigData && sigData.ok ? sigData.html : "") as string;
          if (sigHtml) {
            const initial = `<p><br></p>${wrapSignature(sigHtml)}`;
            setBodyHtml(initial);
            if (bodyRef.current) bodyRef.current.innerHTML = initial;
            // Place caret at the top so first keystroke lands above the
            // signature, not inside it.
            queueMicrotask(() => placeCaretAtStart(bodyRef.current));
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
            from_identity: snapshot.fromIdentity,
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
            from_identity: snapshot.fromIdentity,
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

  // Replace the signature block in the body in place (found via its marker),
  // so switching identity swaps the sig instead of appending a second one.
  // Falls back to appending when the body has no marked signature yet (e.g. an
  // old draft, or a body the user cleared).
  function swapSignatureInBody(newSigHtml: string) {
    const el = bodyRef.current;
    if (!el) return;
    let sigEl = el.querySelector<HTMLElement>("[data-nk-signature]");
    if (!sigEl) {
      sigEl = document.createElement("div");
      sigEl.setAttribute("data-nk-signature", "1");
      el.appendChild(sigEl);
    }
    sigEl.innerHTML = newSigHtml;
    setBodyHtml(el.innerHTML);
    markDirty();
  }

  // Change the sending identity: persist the choice and swap the body's
  // signature to the selected identity's. On a signature fetch failure we keep
  // the identity change (it still persists) and leave the old sig in place.
  async function changeIdentity(next: MailIdentityKey) {
    if (next === fromIdentity) return;
    setFromIdentity(next);
    markDirty();
    try {
      const res = await fetch(`/api/mail/signature?identity=${encodeURIComponent(next)}`);
      const data = await res.json();
      if (data?.ok) swapSignatureInBody(String(data.html ?? ""));
    } catch {
      // Network hiccup — identity still changed; signature stays as-is.
    }
  }

  // ── Attachments ─────────────────────────────────────────────────────────
  //
  // Uploads always need a draft id (the server creates the email_attachments
  // row tied to draft). If the user attaches before typing anything, we
  // bootstrap an empty draft first so the upload has somewhere to land.
  async function ensureDraft(): Promise<string | null> {
    if (id) return id;
    const res = await fetch("/api/mail/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!data?.ok || !data.draft) {
      setError(data?.error ?? "Could not create draft");
      return null;
    }
    setId(data.draft.id);
    window.history.replaceState({}, "", `/inbox/compose?draft=${data.draft.id}`);
    return data.draft.id as string;
  }

  async function uploadFiles(files: FileList | File[]) {
    const draftId = await ensureDraft();
    if (!draftId) return;

    const list = Array.from(files);
    for (const file of list) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`${file.name} is over the ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB limit`);
        continue;
      }
      // Add an optimistic chip immediately with a temp id so the user sees
      // upload progress before the server round-trips back.
      const tempId = `tmp-${Math.random().toString(36).slice(2)}`;
      setAttachments((prev) => [
        ...prev,
        { id: tempId, filename: file.name, size_bytes: file.size, uploading: true },
      ]);

      try {
        const signRes = await fetch("/api/mail/attachments/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draft_id: draftId,
            filename: file.name,
            size: file.size,
            mime_type: file.type || null,
          }),
        });
        const signData = await signRes.json();
        if (!signRes.ok || !signData.ok) throw new Error(signData.error ?? "Sign failed");

        const { token, path, attachment_id } = signData as {
          token: string; path: string; attachment_id: string;
        };
        const { error: upErr } = await supabaseBrowser.storage
          .from("mail-attachments")
          .uploadToSignedUrl(path, token, file);
        if (upErr) throw new Error(upErr.message);

        // Promote the chip from tempId → real id
        setAttachments((prev) =>
          prev.map((a) => (a.id === tempId ? { ...a, id: attachment_id, uploading: false } : a)),
        );
      } catch (e) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === tempId ? { ...a, uploading: false, error: (e as Error).message } : a,
          ),
        );
      }
    }
  }

  async function removeAttachment(attachmentId: string) {
    // Optimistic — remove from UI first, restore if the server rejects.
    const snapshot = attachments;
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    try {
      const res = await fetch(`/api/mail/attachments/${attachmentId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Delete failed");
    } catch (e) {
      setError((e as Error).message);
      setAttachments(snapshot);
    }
  }

  function handleDrop(ev: React.DragEvent<HTMLDivElement>) {
    ev.preventDefault();
    setDragOver(false);
    if (ev.dataTransfer.files && ev.dataTransfer.files.length > 0) {
      void uploadFiles(ev.dataTransfer.files);
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
        <div className="flex items-center border-b border-gray-100 px-4">
          <label htmlFor="from-identity" className="text-xs text-gray-400 uppercase font-semibold w-12">
            From
          </label>
          <select
            id="from-identity"
            value={fromIdentity}
            onChange={(e) => { void changeIdentity(e.target.value as MailIdentityKey); }}
            className="flex-1 px-2 py-2.5 text-sm outline-none bg-transparent text-gray-900"
          >
            {MAIL_IDENTITY_KEYS.map((key) => (
              <option key={key} value={key}>
                {MAIL_IDENTITY_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
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
          <div className="ml-auto">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void uploadFiles(e.target.files);
                e.target.value = "";  // allow re-attaching the same file
              }}
            />
            <ToolbarBtn onClick={() => fileInputRef.current?.click()} title="Attach files">
              📎
            </ToolbarBtn>
          </div>
        </div>

        <div
          ref={bodyRef}
          contentEditable
          suppressContentEditableWarning
          className={`px-4 py-3 min-h-[300px] text-sm text-gray-900 outline-none prose prose-sm max-w-none transition ${
            dragOver ? "bg-[#E6EEF1] outline-dashed outline-2 outline-[#0F4C5C]" : ""
          }`}
          onInput={() => {
            if (bodyRef.current) {
              setBodyHtml(bodyRef.current.innerHTML);
              markDirty();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        />

        {attachments.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <AttachmentChip
                key={a.id}
                attachment={a}
                onRemove={() => void removeAttachment(a.id)}
              />
            ))}
          </div>
        )}
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

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: AttachmentChip;
  onRemove: () => void;
}) {
  const size = attachment.size_bytes ? humanSize(attachment.size_bytes) : "";
  return (
    <span
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs border ${
        attachment.error
          ? "bg-red-50 border-red-200 text-red-700"
          : attachment.uploading
            ? "bg-amber-50 border-amber-200 text-amber-800"
            : "bg-white border-gray-200 text-gray-700"
      }`}
      title={attachment.error ?? undefined}
    >
      <span>📎</span>
      <span className="font-medium max-w-[160px] truncate">{attachment.filename}</span>
      {size && <span className="text-gray-400">{size}</span>}
      {attachment.uploading && <span className="text-amber-700">uploading…</span>}
      {!attachment.uploading && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 text-gray-400 hover:text-red-600"
          title="Remove"
        >
          ✕
        </button>
      )}
    </span>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Position the caret at the very start of a contentEditable element so a
// newly hydrated body with a signature gets the user typing above it.
function placeCaretAtStart(el: HTMLElement | null) {
  if (!el) return;
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(true);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}
