import { supabase } from "../../../utils/supabase";
import { getStockStats, springboardPitchRef } from "../../../utils/channel-partners-server";
import { parseStreams, type ChannelPartner } from "../../../utils/channel-partners";
import PitchDeck from "../PitchDeck";
import PrintBar from "./PrintBar";

export const dynamic = "force-dynamic";

/**
 * /channel-partners/brochure?partner=<id>[&springboard=draft]
 *
 * The brochure alone, sized for A4, for Print → Save as PDF. With `partner`
 * it is tailored ("Prepared for …", their streams first).
 *
 * The Springboard page is included only when all three hold: the partner's
 * fit includes Springboard, they are not SMSF-stream (the two never share a
 * document), and the pitch has a clause 7 reference. `springboard=draft`
 * forces it in for internal review — it then prints under a NOT APPROVED wash.
 */
export default async function BrochurePage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string; springboard?: string }>;
}) {
  const sp = await searchParams;
  let partner: ChannelPartner | null = null;
  if (sp.partner) {
    const { data } = await supabase.from("channel_partners").select("*").eq("id", sp.partner).maybeSingle();
    partner = (data as ChannelPartner | null) ?? null;
  }
  const [stats, ref] = [await getStockStats(), springboardPitchRef()];
  const streams = parseStreams(partner?.nextkey_stream_fit);
  const eligible = !!partner && streams.includes("springboard") && !streams.includes("smsf");
  const draft = sp.springboard === "draft";
  const showSpringboard = draft || (eligible && !!ref);

  let note: string;
  if (showSpringboard && !ref) note = "Springboard page included as a DRAFT for internal review. It is not approved for issue.";
  else if (eligible && !ref) note = "Springboard page left out: the partner pitch has no clause 7 approval reference yet.";
  else if (showSpringboard) note = `Includes the Springboard page (clause 7 ref ${ref}).`;
  else note = "";

  return (
    <div style={{ background: "#e9e8e4", minHeight: "100vh", paddingBottom: 40 }}>
      <PrintBar title={partner ? `Brochure — ${partner.company}` : "Channel partner brochure"} note={note} />
      <div style={{ paddingTop: 24 }}>
        <PitchDeck partner={partner} stats={stats} springboardRef={ref} showSpringboard={showSpringboard} />
      </div>
    </div>
  );
}
