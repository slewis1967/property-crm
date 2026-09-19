import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Section, ContactButtons, Facts, LoadError } from "../../ui";
import { loadLead, loadPipelines, parseTags, pipelineOf, stageOf, stagesOf } from "../../data";
import { formatDateTime } from "../../../../utils/datetime";
import LeadActions from "./LeadActions";

export const dynamic = "force-dynamic";

type NoteEntry = { text: string; created_at: string };

function parseNotes(raw: string | null, fallbackDate: string): NoteEntry[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return raw.trim() ? [{ text: raw, created_at: fallbackDate }] : [];
  }
}

export default async function PhoneLead({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ lead, error }, pipelines] = await Promise.all([loadLead(id), loadPipelines()]);

  if (error) {
    return (
      <>
        <Header title="Lead" back="/m/leads" />
        <div className="px-4 pt-4"><LoadError>Couldn&apos;t load this lead: {error}</LoadError></div>
      </>
    );
  }
  if (!lead) notFound();

  const pipeline = pipelineOf(lead, pipelines);
  const tags = parseTags(lead.tags);
  const name = lead.full_name || lead.email || "(no name)";

  return (
    <>
      <Header
        title={name}
        back={pipeline ? `/m/leads?p=${encodeURIComponent(pipeline.id)}` : "/m/leads"}
        fullHref={`/opportunities/${lead.lead_id}`}
      />

      <div className="px-4 pt-4">
        <ContactButtons phone={lead.phone} email={lead.email} />
      </div>

      <LeadActions
        leadId={lead.lead_id}
        stage={stageOf(lead, pipelines)}
        stages={stagesOf(pipeline)}
        pipelineName={pipeline?.name ?? null}
        notes={parseNotes(lead.notes, lead.created_at || new Date().toISOString())}
      />

      <Section title="Details">
        <Facts
          rows={[
            ["Phone", lead.phone],
            ["Email", lead.email],
            ["Buyer type", lead.buyer_type],
            ["State", lead.state],
            ["Budget", lead.budget],
            ["Temperature", lead.temperature],
            ["Top match", lead.top_match_name],
            ["Source", lead.source],
            ["Created", formatDateTime(lead.created_at, "")],
            ["Tags", tags.length ? tags.join(", ") : null],
          ]}
        />
        {lead.primary_contact_id && (
          <Link
            href={`/m/contacts/${lead.primary_contact_id}`}
            className="mt-3 block rounded-xl bg-white px-4 py-3 text-sm font-medium text-[#0F4C5C] shadow-sm"
          >
            Open contact ›
          </Link>
        )}
      </Section>
    </>
  );
}
