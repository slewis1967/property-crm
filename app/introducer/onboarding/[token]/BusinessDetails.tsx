"use client";

import { useState } from "react";
import {
  ENTITY_TYPES,
  ENTITY_TYPE_LABEL,
  type EntityType,
} from "../../../../utils/introducer-entity";

/**
 * The applicant's business details.
 *
 * Shown alongside whatever step they are on rather than as a step of its own:
 * the agreement needs these and it is issued after the exam, so there is no one
 * moment to demand them — and someone already halfway through the course should
 * not have to wait for a new state to be invented before they can tell us their
 * ABN. Both live applicants reached the course with no ABN recorded at all.
 *
 * Validation is the same function the server uses. The error text comes back
 * from the server with the field it belongs to, so the two can never drift.
 */
type Props = {
  token: string;
  initial: {
    entity_type: EntityType | null;
    firm_name: string;
    abn: string;
    acn: string;
    registered_address: string;
    confirmed: boolean;
  };
};

export default function BusinessDetails({ token, initial }: Props) {
  const [open, setOpen] = useState(!initial.confirmed);
  const [entityType, setEntityType] = useState<EntityType | "">(initial.entity_type ?? "");
  const [firmName, setFirmName] = useState(initial.firm_name);
  const [abn, setAbn] = useState(initial.abn);
  const [acn, setAcn] = useState(initial.acn);
  const [address, setAddress] = useState(initial.registered_address);

  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(initial.confirmed);
  const [error, setError] = useState<string | null>(null);
  const [badField, setBadField] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setBadField(null);
    try {
      const res = await fetch(`/api/introducer/onboarding/${encodeURIComponent(token)}/business`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: entityType,
          firm_name: firmName,
          abn,
          acn,
          registered_address: address,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        field?: string;
        details?: { abn: string; acn: string; firm_name: string };
      };
      if (!json.ok) {
        setBadField(json.field ?? null);
        setError(json.error ?? "Could not save those details.");
        return;
      }
      // Echo back what was stored — the server formats the numbers, and seeing
      // "51 824 753 556" confirms it took what they typed.
      if (json.details) {
        setAbn(json.details.abn);
        setAcn(json.details.acn);
        setFirmName(json.details.firm_name);
      }
      setSaved(true);
      setOpen(false);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const bad = (f: string) => (badField === f ? "border-red-400" : "border-gray-300");
  const isCompany = entityType === "company";

  if (!open) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="text-sm text-gray-600">
          <p className="font-medium text-gray-900">{firmName || "Your business"}</p>
          {abn && <p className="mt-0.5">ABN {abn}</p>}
          {acn && <p>ACN {acn}</p>}
          {address && <p className="mt-0.5">{address}</p>}
          {saved && <p className="mt-2 text-xs text-gray-500">Saved. These go on your agreement.</p>}
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 text-sm font-semibold underline underline-offset-2"
          style={{ color: "#020e40" }}
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Your referral agreement is with your business, not with you personally, so we need the
        entity’s details exactly as they are registered.
      </p>

      <label className="block">
        <span className="text-sm font-medium text-gray-900">How is your business set up?</span>
        <select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value as EntityType | "")}
          className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${bad("entity_type")}`}
        >
          <option value="">Choose…</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {ENTITY_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-gray-900">Registered name</span>
        <input
          value={firmName}
          onChange={(e) => setFirmName(e.target.value)}
          placeholder="e.g. Equitable Property Pty Ltd"
          className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${bad("firm_name")}`}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-gray-900">ABN</span>
          <input
            value={abn}
            onChange={(e) => setAbn(e.target.value)}
            inputMode="numeric"
            placeholder="11 digits"
            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${bad("abn")}`}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-900">
            ACN {isCompany ? "" : <span className="font-normal text-gray-500">(if you have one)</span>}
          </span>
          <input
            value={acn}
            onChange={(e) => setAcn(e.target.value)}
            inputMode="numeric"
            placeholder={isCompany ? "9 digits" : "Sole traders don’t have one"}
            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${bad("acn")}`}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-gray-900">Registered address</span>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Where formal notices should go"
          className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${bad("registered_address")}`}
        />
      </label>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#020e40" }}
        >
          {busy ? "Saving…" : "Save business details"}
        </button>
        {saved && (
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-500">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
