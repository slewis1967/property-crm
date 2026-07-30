"use client";

/** Newline + the separators accepted when pasting a list of emails. */
const NL = String.fromCharCode(10);

/** Today in Australia/Brisbane — due dates are plain dates with no time, so a
 *  UTC comparison marks obligations overdue a day early for most of the AU day. */
function programToday(): string {
  return new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
const SPLIT_RE = /[\n,]/;

/**
 * AML/CTF program & enrolment — the governance record: AUSTRAC enrolment,
 * compliance officer, program approval, the enterprise risk assessment
 * (customer/transaction/channel/geographic), and the staff training register.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  emptyProgram,
  hydrateProgram,
  officerNotifyDue,
  programObligationsOutstanding,
  daysUntil,
  RISK_RATINGS,
  type AmlProgramData,
  type RiskRating,
} from "../../../utils/aml";

const TEAL = "#0F4C5C";
const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-500";

type TrainingRow = {
  id: string;
  staff_name: string;
  staff_email: string | null;
  module: string;
  completed_on: string | null;
  notes: string | null;
};

const KEY_DATES: { date: string; what: string }[] = [
  { date: "1 Jul 2026", what: "AML/CTF obligations commenced — program, CDD and screening now required" },
  { date: "29 Jul 2026", what: "Deadline to apply to enrol with AUSTRAC" },
  { date: "Within 14 days of enrolling", what: "Notify AUSTRAC of your compliance officer" },
  { date: "Annually from 2027", what: "Lodge your annual AML/CTF compliance report" },
];

export default function ProgramClient() {
  const [p, setP] = useState<AmlProgramData>(() => emptyProgram());
  const [training, setTraining] = useState<TrainingRow[]>([]);
  const outstanding = programObligationsOutstanding(p, programToday());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // New training row
  const [tName, setTName] = useState("");
  const [tEmail, setTEmail] = useState("");
  const [tModule, setTModule] = useState("AML/CTF awareness");
  const [tDate, setTDate] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [prog, train] = await Promise.all([
          fetch("/api/aml/program").then((r) => r.json()),
          fetch("/api/aml/training").then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (prog.ok) setP(hydrateProgram(prog.program));
        if (train.ok) setTraining(train.training ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function edit(mutator: (d: AmlProgramData) => void) {
    setP((prev) => {
      const next = structuredClone(prev);
      mutator(next);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/aml/program", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: p }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Save failed");
      setNotice("Program saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function addTraining() {
    if (!tName) return;
    try {
      const res = await fetch("/api/aml/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffName: tName, staffEmail: tEmail, module: tModule, completedOn: tDate }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Add failed");
      setTraining((t) => [
        { id: json.id, staff_name: tName, staff_email: tEmail || null, module: tModule, completed_on: tDate || null, notes: null },
        ...t,
      ]);
      setTName("");
      setTEmail("");
      setTDate("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed");
    }
  }

  async function removeTraining(id: string) {
    const prev = training;
    setTraining((t) => t.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/aml/training?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Delete failed");
    } catch (e) {
      setTraining(prev);
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading…</p>;

  const notifyDue = officerNotifyDue(p);
  const notifyDays = notifyDue ? daysUntil(notifyDue) : null;

  return (
    <div className="p-6 max-w-4xl mx-auto pb-24">
      <Link href="/aml" className="text-xs text-gray-500 hover:underline">
        ← Back to AML
      </Link>
      <h1 className="text-2xl font-bold mt-1" style={{ color: TEAL }}>
        AML/CTF Program &amp; Enrolment
      </h1>
      <p className="text-sm text-gray-600 mt-1">
        Governance, AUSTRAC enrolment and the enterprise risk assessment required before providing any designated service.
      </p>

      {error && <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>}
      {notice && <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">{notice}</div>}

      {outstanding.length > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
          <strong>Outstanding program obligations</strong>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {outstanding.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Enrolment */}
      <Section title="AUSTRAC enrolment">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Enrolment status">
            <select className={inputCls} value={p.enrolment.status} onChange={(e) => edit((d) => { d.enrolment.status = e.target.value as AmlProgramData["enrolment"]["status"]; })}>
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="enrolled">Enrolled</option>
            </select>
          </Field>
          <Field label="AUSTRAC reference">
            <input className={inputCls} value={p.enrolment.austracReference} onChange={(e) => edit((d) => { d.enrolment.austracReference = e.target.value; })} />
          </Field>
          <Field label="Enrolled on">
            <input type="date" className={inputCls} value={p.enrolment.enrolledAt} onChange={(e) => edit((d) => { d.enrolment.enrolledAt = e.target.value; })} />
          </Field>
          <Field label="Compliance officer notified to AUSTRAC on">
            <input type="date" className={inputCls} value={p.enrolment.officerNotifiedAt} onChange={(e) => edit((d) => { d.enrolment.officerNotifiedAt = e.target.value; })} />
          </Field>
        </div>
        {notifyDue && !p.enrolment.officerNotifiedAt && (
          <p className={`text-xs mt-2 font-semibold ${notifyDays !== null && notifyDays < 0 ? "text-red-700" : "text-amber-700"}`}>
            Notify AUSTRAC of your compliance officer by {notifyDue}
            {notifyDays !== null && (notifyDays < 0 ? " — overdue" : ` — ${notifyDays} day(s) left`)}.
          </p>
        )}
      </Section>

      {/* Compliance officer */}
      <Section title="Compliance officer">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Name">
            <input className={inputCls} value={p.complianceOfficer.name} onChange={(e) => edit((d) => { d.complianceOfficer.name = e.target.value; })} />
          </Field>
          <Field label="Email">
            <input className={inputCls} value={p.complianceOfficer.email} onChange={(e) => edit((d) => { d.complianceOfficer.email = e.target.value; })} />
          </Field>
          <Field label="Appointed on">
            <input type="date" className={inputCls} value={p.complianceOfficer.appointedAt} onChange={(e) => edit((d) => { d.complianceOfficer.appointedAt = e.target.value; })} />
          </Field>
        </div>
      </Section>

      {/* Program approval */}
      <Section title="Program approval">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Approved by (senior manager)">
            <input className={inputCls} value={p.programApproved.approvedBy} onChange={(e) => edit((d) => { d.programApproved.approvedBy = e.target.value; })} />
          </Field>
          <Field label="Approved on">
            <input type="date" className={inputCls} value={p.programApproved.approvedAt} onChange={(e) => edit((d) => { d.programApproved.approvedAt = e.target.value; })} />
          </Field>
          <Field label="Version">
            <input className={inputCls} value={p.programApproved.version} onChange={(e) => edit((d) => { d.programApproved.version = e.target.value; })} />
          </Field>
        </div>
        <Field label="Next review due">
          <input type="date" className={inputCls} value={p.reviewDue} onChange={(e) => edit((d) => { d.reviewDue = e.target.value; })} />
        </Field>
      </Section>

      {/* Independent evaluation of the program */}
      <Section title="Independent evaluation">
        <p className="text-xs text-gray-500 mb-3">
          The program must be independently evaluated by someone not responsible for designing or
          running it. Recording only a &ldquo;next due&rdquo; date proves nothing &mdash; capture who
          did it, what they covered, what they found, and when the findings were closed out.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Last completed">
            <input type="date" className={inputCls} value={p.independentEvaluation.lastCompletedAt} onChange={(e) => edit((d) => { d.independentEvaluation.lastCompletedAt = e.target.value; })} />
          </Field>
          <Field label="Evaluator">
            <input className={inputCls} placeholder="Name / firm" value={p.independentEvaluation.evaluator} onChange={(e) => edit((d) => { d.independentEvaluation.evaluator = e.target.value; })} />
          </Field>
          <Field label="Next due">
            <input type="date" className={inputCls} value={p.independentEvaluation.nextDueAt} onChange={(e) => edit((d) => { d.independentEvaluation.nextDueAt = e.target.value; })} />
          </Field>
          <Field label="Remediation completed">
            <input type="date" className={inputCls} value={p.independentEvaluation.remediationCompletedAt} onChange={(e) => edit((d) => { d.independentEvaluation.remediationCompletedAt = e.target.value; })} />
          </Field>
        </div>
        <Field label="Scope">
          <textarea className={inputCls} rows={2} value={p.independentEvaluation.scope} onChange={(e) => edit((d) => { d.independentEvaluation.scope = e.target.value; })} />
        </Field>
        <Field label="Findings">
          <textarea className={inputCls} rows={3} value={p.independentEvaluation.findings} onChange={(e) => edit((d) => { d.independentEvaluation.findings = e.target.value; })} />
        </Field>
      </Section>

      {/* Periodic AUSTRAC compliance report */}
      <Section title="AUSTRAC compliance report">
        <p className="text-xs text-gray-500 mb-3">
          The periodic return about the business itself. Not an SMR/TTR/IFTI &mdash; those are
          transaction reports with business-day deadlines and live on the Reports page.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Reporting period end">
            <input type="date" className={inputCls} value={p.complianceReport.periodEnd} onChange={(e) => edit((d) => { d.complianceReport.periodEnd = e.target.value; })} />
          </Field>
          <Field label="Due">
            <input type="date" className={inputCls} value={p.complianceReport.dueAt} onChange={(e) => edit((d) => { d.complianceReport.dueAt = e.target.value; })} />
          </Field>
          <Field label="Lodged">
            <input type="date" className={inputCls} value={p.complianceReport.lodgedAt} onChange={(e) => edit((d) => { d.complianceReport.lodgedAt = e.target.value; })} />
          </Field>
          <Field label="AUSTRAC reference">
            <input className={inputCls} value={p.complianceReport.austracReference} onChange={(e) => edit((d) => { d.complianceReport.austracReference = e.target.value; })} />
          </Field>
        </div>
      </Section>

      {/* Who may see an SMR — the tipping-off control */}
      <Section title="Suspicious Matter Report access">
        <p className="text-xs text-gray-500 mb-3">
          Telling anyone that an SMR exists is the tipping-off offence. SMRs are hidden from
          everyone except the compliance officer above, the person who lodged the report, and
          anyone listed here. This is enforced on the server, not just in this screen — if
          nobody is listed and no officer is appointed, only the lodger can see their own report.
        </p>
        <Field label="Additional people who may view SMRs (one email per line)">
          <textarea
            className={`${inputCls} h-24 font-mono text-xs`}
            placeholder="auditor@example.com"
            value={p.smrAccess.join(NL)}
            onChange={(e) =>
              edit((d) => {
                d.smrAccess = e.target.value
                  .split(SPLIT_RE)
                  .map((x) => x.trim().toLowerCase())
                  .filter(Boolean);
              })
            }
          />
        </Field>
      </Section>

      {/* Enterprise risk assessment */}
      <Section title="Enterprise risk assessment">
        <p className="text-xs text-gray-500 mb-3">Assess ML/TF risk across the four AUSTRAC vectors.</p>
        {(["customer", "transaction", "channel", "geographic"] as const).map((dim) => (
          <div key={dim} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start mb-3">
            <div className="text-sm font-semibold text-gray-700 capitalize pt-2">{dim} risk</div>
            <select
              className={inputCls}
              value={p.riskAssessment[dim].rating}
              onChange={(e) => edit((d) => { d.riskAssessment[dim].rating = e.target.value as RiskRating; })}
            >
              {RISK_RATINGS.map((r) => (
                <option key={r} value={r} className="capitalize">
                  {r}
                </option>
              ))}
            </select>
            <input
              className={inputCls}
              placeholder="Notes"
              value={p.riskAssessment[dim].notes}
              onChange={(e) => edit((d) => { d.riskAssessment[dim].notes = e.target.value; })}
            />
          </div>
        ))}
        <Field label="Program notes">
          <textarea className={inputCls} rows={2} value={p.notes} onChange={(e) => edit((d) => { d.notes = e.target.value; })} />
        </Field>
      </Section>

      {/* Training register */}
      <Section title="Staff training register">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input className={inputCls} placeholder="Staff name" value={tName} onChange={(e) => setTName(e.target.value)} />
          <input className={inputCls} placeholder="Email" value={tEmail} onChange={(e) => setTEmail(e.target.value)} />
          <input className={inputCls} placeholder="Module" value={tModule} onChange={(e) => setTModule(e.target.value)} />
          <div className="flex gap-2">
            <input type="date" className={inputCls} value={tDate} onChange={(e) => setTDate(e.target.value)} />
            <button onClick={addTraining} disabled={!tName} className="px-3 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: TEAL }}>
              Add
            </button>
          </div>
        </div>
        {training.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">Staff</th>
                  <th className="text-left font-semibold px-3 py-2">Module</th>
                  <th className="text-left font-semibold px-3 py-2">Completed</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {training.map((t) => (
                  <tr key={t.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      {t.staff_name}
                      {t.staff_email && <span className="text-xs text-gray-400"> · {t.staff_email}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{t.module}</td>
                    <td className="px-3 py-2 text-gray-600">{t.completed_on || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeTraining(t.id)} className="text-xs text-red-600 hover:underline">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Key dates reference */}
      <Section title="Key dates">
        <ul className="space-y-1 text-sm text-gray-700">
          {KEY_DATES.map((k) => (
            <li key={k.date} className="flex gap-3">
              <span className="font-semibold min-w-[11rem]" style={{ color: TEAL }}>
                {k.date}
              </span>
              <span className="text-gray-600">{k.what}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-400 mt-3">
          Enrol and get the free real-estate starter kit at austrac.gov.au. This tool records your program — it is not
          legal advice; confirm scope with your compliance adviser.
        </p>
      </Section>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex justify-end z-40">
        <button onClick={save} disabled={saving} className="px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60" style={{ backgroundColor: TEAL }}>
          {saving ? "Saving…" : "Save program"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-bold text-gray-800 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
