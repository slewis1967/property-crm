import Link from "next/link";
import { requireIntroducerPage } from "../session";
import PortalHeader from "../PortalHeader";
import { listOwnClients } from "../../api/introducer/_shared";
import { supabase } from "../../../utils/supabase";
import { toPortalView, STATUS_LABELS, type IntroducerClientStatus } from "../../../utils/introducer";

// PUBLIC page, session-scoped. The list is built from the session's introducer
// id — there is no path here that takes an id from the request.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your referrals — Springboard Introducer Portal",
  robots: { index: false, follow: false },
};

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-50 text-blue-800",
  info_requested: "bg-amber-50 text-amber-900",
  accepted: "bg-green-50 text-green-800",
  declined: "bg-gray-100 text-gray-600",
  withdrawn: "bg-gray-100 text-gray-600",
};

export default async function IntroducerClientsPage() {
  const identity = await requireIntroducerPage();
  const rows = await listOwnClients(identity);

  const ids = rows.map((r) => r.id);
  const waiting = new Set<string>();
  if (ids.length > 0) {
    const { data } = await supabase
      .from("introducer_info_requests")
      .select("client_id")
      .in("client_id", ids)
      .eq("status", "open");
    for (const r of (data ?? []) as { client_id: string }[]) waiting.add(r.client_id);
  }

  const clients = rows.map((r) => toPortalView(r));
  const drafts = clients.filter((c) => c.status === "draft");
  const live = clients.filter((c) => c.status !== "draft");

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader firmName={identity.firmName} userName={identity.fullName ?? identity.email} />

      <main className="mx-auto max-w-4xl px-4 py-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Your referrals</h1>
            <p className="mt-1 text-sm text-gray-600">
              Clients you&apos;ve referred to Springboard, and where each one is up to.
            </p>
          </div>
          <Link
            href="/introducer/clients/new"
            className="shrink-0 rounded-lg px-4 py-2.5 font-semibold text-white"
            style={{ background: "#c7894e" }}
          >
            New referral
          </Link>
        </div>

        {waiting.size > 0 && (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>
              {waiting.size} referral{waiting.size === 1 ? "" : "s"} need
              {waiting.size === 1 ? "s" : ""} something from you.
            </strong>{" "}
            Open the ones marked “Action needed” below.
          </div>
        )}

        {clients.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
            <p className="text-gray-900">No referrals yet.</p>
            <p className="mt-1 text-sm text-gray-600">
              Start one when you have a client&apos;s consent to pass their details to us.
            </p>
          </div>
        ) : (
          <>
            {drafts.length > 0 && (
              <section className="mt-7">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Drafts — not sent yet
                </h2>
                <ul className="mt-2 space-y-2">
                  {drafts.map((c) => (
                    <ReferralRow key={c.id} client={c} actionNeeded={false} />
                  ))}
                </ul>
              </section>
            )}

            {live.length > 0 && (
              <section className="mt-7">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Submitted
                </h2>
                <ul className="mt-2 space-y-2">
                  {live.map((c) => (
                    <ReferralRow key={c.id} client={c} actionNeeded={waiting.has(c.id)} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <p className="mt-10 text-xs leading-relaxed text-gray-500">
          Once a referral is submitted its details are locked, so the record we assess is exactly what
          you sent. If something needs correcting, ask your Springboard contact and they&apos;ll authorise
          the change.
        </p>
      </main>
    </div>
  );
}

function ReferralRow({
  client,
  actionNeeded,
}: {
  client: ReturnType<typeof toPortalView>;
  actionNeeded: boolean;
}) {
  const name = `${client.first_name} ${client.last_name}`.trim() || "Unnamed referral";
  const status = client.status as IntroducerClientStatus;
  return (
    <li>
      <Link
        href={`/introducer/clients/${client.id}`}
        className="block rounded-xl border border-gray-200 bg-white px-4 py-3 transition hover:border-gray-300"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{name}</span>
              {client.client_ref && (
                <span className="text-xs text-gray-500">{client.client_ref}</span>
              )}
            </div>
            <div className="mt-0.5 truncate text-sm text-gray-600">
              {client.status === "draft" ? "Not submitted" : client.stage_label}
              {client.suburb ? ` · ${client.suburb}` : ""}
              {client.state ? `, ${client.state}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {actionNeeded && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                Action needed
              </span>
            )}
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[status] ?? "bg-gray-100 text-gray-700"}`}
            >
              {STATUS_LABELS[status] ?? status}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
