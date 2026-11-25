"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SALE_PATH, SALE_STAGE_LABELS } from "../../utils/sales";

type SaleRow = {
  id: string;
  sale_ref: string | null;
  project_name: string | null;
  developer_name: string | null;
  unit_no: string | null;
  buyer: string | null;
  partner: string | null;
  stage: string;
  stage_label: string;
  price: number | null;
  owner: string | null;
  deposit: { totalRequired: number; totalReceived: number };
  next_step: { label: string; due: string | null; overdue: boolean } | null;
  external_stage: string | null;
  updated_at: string;
};

const aud = (n: number | null | undefined) =>
  n ? n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }) : "—";

export const STAGE_TONE: Record<string, string> = {
  requested: "bg-gray-100 text-gray-700",
  hold: "bg-amber-50 text-amber-800",
  eoi: "bg-orange-50 text-orange-800",
  contract_issued: "bg-sky-50 text-sky-800",
  unconditional: "bg-indigo-50 text-indigo-800",
  settled: "bg-green-50 text-green-800",
  declined: "bg-gray-100 text-gray-500",
  released: "bg-gray-100 text-gray-500",
  withdrawn: "bg-gray-100 text-gray-500",
};

export default function SalesClient() {
  const router = useRouter();
  const [scope, setScope] = useState("open");
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("");
  const [sort, setSort] = useState<"updated" | "next" | "price">("next");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/sales?stage=${encodeURIComponent(scope)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (!alive) return;
        if (!json.ok) throw new Error(json.error ?? "Couldn't load sales");
        setRows(json.sales);
        setError(null);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e.message);
        setRows([]);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [scope]);

  const changeScope = (v: string) => {
    setLoading(true);
    setScope(v);
  };

  const projects = useMemo(() => [...new Set(rows.map((r) => r.project_name).filter(Boolean) as string[])].sort(), [rows]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!project || r.project_name === project) &&
        (!q || [r.sale_ref, r.buyer, r.partner, r.unit_no, r.project_name].some((v) => v?.toLowerCase().includes(q))),
    );
    const byNext = (r: SaleRow) => r.next_step?.due ?? "9999-12-31";
    return list.sort((a, b) =>
      sort === "price" ? (b.price ?? 0) - (a.price ?? 0) : sort === "next" ? byNext(a).localeCompare(byNext(b)) : b.updated_at.localeCompare(a.updated_at),
    );
  }, [rows, search, project, sort]);

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 lg:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Sales</h1>
            <p className="mt-1 text-sm text-gray-600">Every sale from reservation to settlement: our direct sales and partner deals together.</p>
          </div>
          <div className="flex gap-2">
            <a href={`/api/sales?stage=${encodeURIComponent(scope)}&format=csv`} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
              Export CSV
            </a>
            <button onClick={() => setCreating(true)} className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800">
              New sale
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lot, buyer, partner…"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 sm:w-64"
          />
          <select value={project} onChange={(e) => setProject(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5" aria-label="Project">
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <select value={scope} onChange={(e) => changeScope(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5" aria-label="Stage">
            <option value="open">Live sales</option>
            <option value="all">All, incl. settled and lost</option>
            {[...SALE_PATH, "released"].map((s) => (
              <option key={s} value={s}>
                {SALE_STAGE_LABELS[s as keyof typeof SALE_STAGE_LABELS]}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5" aria-label="Sort">
            <option value="next">Next step due</option>
            <option value="updated">Recently updated</option>
            <option value="price">Price, high to low</option>
          </select>
          <span className="text-gray-500">{loading ? "Loading…" : `${shown.length} sale${shown.length === 1 ? "" : "s"}`}</span>
        </div>

        {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}

        <div className="mt-4 space-y-2">
          {!loading && !error && shown.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">No sales here.</div>
          )}
          {shown.map((r) => (
            <Link
              key={r.id}
              href={`/sales/${r.id}`}
              className={`grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border bg-white px-4 py-3 text-sm hover:shadow-sm sm:grid-cols-[1.4fr_0.5fr_1.2fr_0.9fr_1.6fr] ${
                r.next_step?.overdue ? "border-l-4 border-l-red-500 border-gray-200" : "border-gray-200"
              }`}
            >
              <div>
                <div className="font-semibold text-gray-900">{r.sale_ref ?? "Untitled sale"}</div>
                <div className="text-xs text-gray-500">
                  {[r.project_name, r.developer_name].filter(Boolean).join(" · ")}
                  {r.partner && <span className="ml-1 rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">{r.partner}</span>}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-400">Unit</div>
                <div className="text-gray-800">{r.unit_no ?? "—"}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-400">Buyer</div>
                <div className="text-gray-800">{r.buyer ?? "—"}</div>
                <div className="text-xs text-gray-500">{aud(r.price)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-400">Status</div>
                <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase ${STAGE_TONE[r.stage] ?? ""}`}>{r.stage_label}</span>
                {r.external_stage && <div className="mt-0.5 text-[11px] text-gray-400">Developer: {r.external_stage}</div>}
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-400">Next step</div>
                <div className={r.next_step?.overdue ? "font-medium text-red-700" : "text-blue-700"}>{r.next_step?.label ?? "—"}</div>
                {r.deposit.totalRequired > 0 && (
                  <div className="text-xs text-gray-500">
                    Deposit {r.deposit.totalReceived ? aud(r.deposit.totalReceived) : "$0"} of {aud(r.deposit.totalRequired)}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {creating && <NewSaleDialog onClose={() => setCreating(false)} onCreated={(id) => router.push(`/sales/${id}`)} />}
    </div>
  );
}

function NewSaleDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = useState({
    sale_ref: "",
    project_name: "",
    developer_name: "",
    unit_no: "",
    buyer_names: "",
    sale_price: "",
    external_url: "",
    reserved: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { reserved, ...fields } = f;
    const body: Record<string, unknown> = { stage: reserved ? "hold" : "requested" };
    for (const [k, v] of Object.entries(fields)) if (v) body[k] = v;
    const res = await fetch("/api/sales", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!json.ok) return setError(json.error ?? "Couldn't create the sale");
    onCreated(json.id);
  }

  const input = "mt-1 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold">New sale</h2>
        <p className="mt-1 text-xs text-gray-500">A direct NextKey sale. Partner deals arrive through the partner portal. Add the rest on the sale page.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-1">Lot reference<input className={input} value={f.sale_ref} onChange={set("sale_ref")} placeholder="GRD-T2-311" /></label>
          <label className="col-span-1">Unit no.<input className={input} value={f.unit_no} onChange={set("unit_no")} placeholder="120" /></label>
          <label>Project<input className={input} value={f.project_name} onChange={set("project_name")} placeholder="The Grande" /></label>
          <label>Developer<input className={input} value={f.developer_name} onChange={set("developer_name")} placeholder="Geocon" /></label>
          <label>Buyer(s)<input className={input} value={f.buyer_names} onChange={set("buyer_names")} /></label>
          <label>Price<input className={input} value={f.sale_price} onChange={set("sale_price")} inputMode="decimal" placeholder="547900" /></label>
          <label className="col-span-2">Developer portal link (optional)<input className={input} value={f.external_url} onChange={set("external_url")} placeholder="https://…" /></label>
          <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={f.reserved} onChange={set("reserved")} />Already reserved with the developer</label>
        </div>
        {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">Cancel</button>
          <button disabled={busy} className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">{busy ? "Creating…" : "Create sale"}</button>
        </div>
      </form>
    </div>
  );
}
