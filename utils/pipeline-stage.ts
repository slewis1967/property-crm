/**
 * Which column of a pipeline a lead sits in.
 *
 * Leads carry a free-text `ghl_stage`; pipelines carry their own list of stage
 * names. Legacy GoHighLevel data uses names that don't match exactly ("Closed -
 * Won", "Contacted - no answer"), so an unmatched stage is mapped by keyword,
 * and anything unrecognised lands in the pipeline's first stage.
 *
 * Shared by the opportunities kanban and the phone view (/m/leads) so a lead
 * shows the same stage in both.
 */

/** Stage names used when a lead has no pipeline, or its pipeline has no stages. */
export const DEFAULT_STAGES = [
  "New Lead", "Qualified", "Matched", "Contacted",
  "Proposal Sent", "Negotiating", "Closed Won", "Closed Lost",
];

export function normaliseStage(raw: string | null, stages: string[]): string {
  if (!raw) return stages[0] || "New Lead";
  // Exact match first
  if (stages.includes(raw)) return raw;
  // Fuzzy fallback for legacy data
  const s = raw.toLowerCase();
  if (s.includes("won"))      return stages.find(x => x.toLowerCase().includes("won"))  || stages[stages.length - 2] || stages[0];
  if (s.includes("lost"))     return stages.find(x => x.toLowerCase().includes("lost")) || stages[stages.length - 1] || stages[0];
  if (s.includes("qualif"))   return stages.find(x => x.toLowerCase().includes("qualif")) || stages[1] || stages[0];
  if (s.includes("match"))    return stages.find(x => x.toLowerCase().includes("match")) || stages[0];
  if (s.includes("contact"))  return stages.find(x => x.toLowerCase().includes("contact")) || stages[0];
  if (s.includes("proposal") || s.includes("sent")) return stages.find(x => x.toLowerCase().includes("proposal") || x.toLowerCase().includes("sent")) || stages[0];
  if (s.includes("negotiat")) return stages.find(x => x.toLowerCase().includes("negotiat")) || stages[0];
  return stages[0];
}
