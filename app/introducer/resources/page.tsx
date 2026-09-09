import { requireIntroducerPage } from "../session";
import PortalHeader from "../PortalHeader";
import {
  listPublishedResources,
  acksFor,
  resourcesTableMissing,
} from "../../../utils/introducer-resources-db";
import { toResourceView, shelve, unacknowledged } from "../../../utils/introducer-resources";
import AckButton from "./AckButton";

/**
 * The document library — what an accredited introducer needs to hand.
 *
 * PUBLIC page, session-scoped. Reaching it at all requires a portal session, and
 * a portal session only exists once an application has been activated, so
 * "available after accreditation" needs no gate of its own here.
 *
 * The shelf is the same for everybody; only the acknowledgement state is
 * personal. That is why the acks query is the only one filtered by introducer.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Documents — Springboard Introducer Portal",
  robots: { index: false, follow: false },
};

export default async function IntroducerResourcesPage() {
  const identity = await requireIntroducerPage();

  let sections: ReturnType<typeof shelve> = [];
  let outstanding: ReturnType<typeof unacknowledged> = [];
  let notReady = false;

  try {
    const [rows, acks] = await Promise.all([listPublishedResources(), acksFor(identity.introducerId)]);
    const views = rows.map((r) => toResourceView(r, acks));
    sections = shelve(views);
    outstanding = unacknowledged(views);
  } catch (err) {
    // The page is deployed before the migration runs. Saying so beats a stack
    // trace, and beats an empty shelf that reads as "there are no documents".
    if (!resourcesTableMissing(err)) throw err;
    notReady = true;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader firmName={identity.firmName} userName={identity.fullName ?? identity.email} />

      <main className="mx-auto max-w-4xl px-4 py-7">
        <h1 className="text-2xl font-semibold text-gray-900">Documents</h1>
        <p className="mt-1 text-sm text-gray-600">
          Your manuals and reference material. These are the current versions — please work from
          these rather than a copy you saved earlier.
        </p>

        {notReady ? (
          <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
            <p className="text-gray-900">The library isn’t switched on yet.</p>
            <p className="mt-1 text-sm text-gray-600">
              Nothing’s wrong at your end. Please check back shortly.
            </p>
          </div>
        ) : (
          <>
            {outstanding.length > 0 && (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <strong>
                  {outstanding.length === 1
                    ? "One document needs your confirmation."
                    : `${outstanding.length} documents need your confirmation.`}
                </strong>{" "}
                Read {outstanding.length === 1 ? "it" : "them"} and confirm below. If a document has
                been revised since you last confirmed it, we’ll ask again — the version that governs
                you is the current one.
              </div>
            )}

            {sections.length === 0 ? (
              <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
                <p className="text-gray-900">Nothing here yet.</p>
                <p className="mt-1 text-sm text-gray-600">
                  Your manuals will appear here as they’re published.
                </p>
              </div>
            ) : (
              sections.map((section) => (
                <section key={section.category} className="mt-7">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                    {section.label}
                  </h2>
                  <ul className="mt-2 space-y-2">
                    {section.items.map((doc) => (
                      <li
                        key={doc.id}
                        className="rounded-xl border border-gray-200 bg-white px-4 py-3.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-gray-900">{doc.title}</span>
                              <span className="text-xs text-gray-500">Version {doc.version}</span>
                              {doc.requiresAck &&
                                (doc.acknowledged ? (
                                  <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-800">
                                    Confirmed
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                                    Please confirm
                                  </span>
                                ))}
                            </div>
                            {doc.description && (
                              <p className="mt-1 text-sm text-gray-600">{doc.description}</p>
                            )}
                            <p className="mt-1 text-xs text-gray-500">
                              PDF{doc.sizeLabel ? ` · ${doc.sizeLabel}` : ""}
                            </p>
                          </div>
                          <a
                            href={`/api/introducer/resources/${doc.id}`}
                            className="shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold text-white"
                            style={{ background: "#c7894e" }}
                          >
                            Download
                          </a>
                        </div>

                        {doc.requiresAck && !doc.acknowledged && (
                          <div className="mt-3 border-t border-gray-100 pt-3">
                            <AckButton resourceId={doc.id} version={doc.version} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </>
        )}

        <p className="mt-10 text-xs leading-relaxed text-gray-500">
          These documents are confidential and provided for your use as an accredited introducer.
          Please don’t forward them or publish any part of them. If you need something that isn’t
          here, ask your Springboard contact.
        </p>
      </main>
    </div>
  );
}
