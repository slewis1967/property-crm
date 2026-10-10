/**
 * "How do I do this?" help — the full set of guides, one list per sidebar
 * group. Add a guide by adding it to the section file; add a video by dropping
 * public/help/<guide id>.mp4 and running `npm run help:manifest`.
 */
import type { HelpSection } from "./types";
import { commandSections } from "./sections/command";
import { crmASections } from "./sections/crm-a";
import { crmBSections } from "./sections/crm-b";
import { complianceStockSections } from "./sections/compliance-stock";
import { systemSections } from "./sections/system";
import videos from "./videos.json";

export type { HelpGuide, HelpSection, HelpStep } from "./types";
export { guidesOf, sectionForPath, searchGuides } from "./match";

export const HELP_SECTIONS: HelpSection[] = [
  ...commandSections,
  ...crmASections,
  ...crmBSections,
  ...complianceStockSections,
  ...systemSections,
];

type VideoInfo = { seconds: number };
const VIDEOS = videos as Record<string, VideoInfo>;

/** The recorded video for a guide, or null when it hasn't been recorded yet. */
export function videoFor(guideId: string): { src: string; poster: string; seconds: number } | null {
  const v = VIDEOS[guideId];
  if (!v) return null;
  return { src: `/help/${guideId}.mp4`, poster: `/help/${guideId}.jpg`, seconds: v.seconds };
}
