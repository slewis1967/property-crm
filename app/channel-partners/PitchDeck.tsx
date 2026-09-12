/**
 * The channel-partner brochure — five A4 pages. Rendered on screen in the
 * panel's "Pitch deck" tab and, via /channel-partners/brochure, printed to PDF
 * to attach or hand over.
 *
 * External-facing, so it wears the NextKey brand (navy #1b1f44 / amber
 * #da9845), and the Springboard page wears Springboard's (navy #020e40 / amber
 * #c7894e) — two brands, never one masthead. Copy comes from the same rules as
 * the email (utils/channel-partners.ts) and was put through compliance review
 * on 2026-09-11; change wording here only with the same care.
 *
 * Fixed-size pages crop silently (overflow:hidden), and the small print is the
 * LAST block on each page — exactly what an overflow deletes without anything
 * looking wrong. Keep copy additions short and re-check the print preview.
 *
 * No hooks, no "use client": it renders inside the client panel and the
 * brochure page alike.
 */
import {
  STREAMS,
  parseStreams,
  stockFigures,
  type ChannelPartner,
  type StockStats,
  type StreamKey,
} from "../../utils/channel-partners";

const NK_NAVY = "#1b1f44";
const NK_AMBER = "#da9845";
const SB_NAVY = "#020e40";
const SB_AMBER = "#c7894e";
const INK = "#23263a";
const MUTED = "#5b6070";
const PAPER = "#fbfaf7";

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Segoe UI', -apple-system, 'Helvetica Neue', Arial, sans-serif";

export type PitchDeckProps = {
  partner?: Pick<ChannelPartner, "company" | "nextkey_stream_fit"> | null;
  stats: StockStats | null;
  springboardRef: string | null;
  /** Include the Springboard page. The brochure route decides (fit + approval, or an internal draft view). */
  showSpringboard: boolean;
};

export default function PitchDeck({ partner, stats, springboardRef, showSpringboard }: PitchDeckProps) {
  const fig = stats && stats.available >= 100 ? stockFigures(stats) : null;
  const partnerStreams = partner ? parseStreams(partner.nextkey_stream_fit) : [];
  // Springboard and SMSF never share a document (same rule as the email): a
  // reader putting "deposit help" beside "SMSF" draws the one conclusion we
  // may not invite. So a brochure carrying the Springboard page drops the SMSF
  // tile and the SMSF mention.
  const order: Exclude<StreamKey, "springboard">[] = showSpringboard ? ["core", "sda", "multi"] : ["core", "smsf", "sda", "multi"];
  const streams = [...order].sort((a, b) => Number(partnerStreams.includes(b)) - Number(partnerStreams.includes(a)));

  return (
    <div id="cp-brochure" style={{ fontFamily: SANS, color: INK }}>
      <style>{DECK_CSS}</style>

      {/* ── 1. Cover ─────────────────────────────────────────────── */}
      <section className="cpd-page" style={{ background: PAPER }}>
        <div style={{ padding: "44px 56px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/channel-partners/nextkey-logo.png" alt="NextKey" style={{ height: 58 }} />
          <span className="cpd-eyebrow" style={{ color: NK_AMBER }}>Channel partner program</span>
        </div>
        <div style={{ padding: "40px 56px 0" }}>
          <h1 style={{ fontFamily: SERIF, fontSize: 56, lineHeight: 1.04, color: NK_NAVY, margin: 0, fontWeight: 700, letterSpacing: "-0.5px" }}>
            We find the stock.
            <br />
            <span style={{ color: NK_AMBER }}>You close the deal.</span>
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.5, color: MUTED, margin: "22px 0 0", maxWidth: 600 }}>
            NextKey sources new and project property from builders and developers across Australia, researches it, and
            hands it to you ready to present, under your own brand.
          </p>
        </div>
        <div style={{ position: "relative", margin: "34px 0 0", height: 520 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/channel-partners/hero-street.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <div style={{ position: "absolute", left: 0, bottom: 0, width: 260, height: 14, background: NK_AMBER }} />
        </div>
        <div style={{ background: NK_NAVY, color: "#fff", padding: "26px 56px 22px" }}>
          {fig ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
                <Stat n={fig.listings} label="current listings" />
                <Stat n={fig.builders} label="builders and developers" />
                <Stat n={fig.suburbs} label="suburbs" />
                <Stat n={fig.added} label="added in the last 30 days" />
              </div>
              <p style={{ fontSize: 11, color: "#aeb3cc", margin: "14px 0 0" }}>
                As at {fig.asAt}. Live figures from the NextKey stock platform, rounded down; they change daily.
              </p>
            </>
          ) : (
            <p style={{ fontSize: 16, margin: 0 }}>New and project stock from builders and developers, researched and ready to present.</p>
          )}
        </div>
        <div style={{ padding: "18px 56px", display: "flex", justifyContent: "space-between", fontSize: 13, color: MUTED }}>
          <span>{partner ? <>Prepared for <strong style={{ color: NK_NAVY }}>{partner.company}</strong></> : "Channel partner overview"}</span>
          <span>nextkey.com.au</span>
        </div>
      </section>

      {/* ── 2. How it works ──────────────────────────────────────── */}
      <section className="cpd-page" style={{ background: "#fff", padding: "52px 56px" }}>
        <span className="cpd-eyebrow" style={{ color: NK_AMBER }}>How it works</span>
        <h2 className="cpd-h2" style={{ fontFamily: SERIF, color: NK_NAVY }}>Your sourcing team, without the payroll.</h2>

        <FlowDiagram builders={fig?.builders ?? null} />
        <p style={{ fontSize: 13, color: MUTED, margin: "10px 0 0", textAlign: "center" }}>
          You own the client relationship. We never contact your buyers.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 24, marginTop: 34 }}>
          <Step n="01" title="We source">
            Builders and developers send us their stocklists. Our platform extracts the listings, and we check them before
            they reach your feed.
          </Step>
          <Step n="02" title="We research">
            Suburb data, planning context and property detail, prepared as reports under your branding.
          </Step>
          <Step n="03" title="You close">
            Choose the stock that suits your buyers and present it under your brand. You advise, you transact, you keep the
            relationship.
          </Step>
        </div>

        <h3 style={{ fontSize: 15, letterSpacing: "1.5px", textTransform: "uppercase", color: NK_NAVY, margin: "40px 0 14px" }}>
          What changes for your business
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
          <Benefit icon="people" title="Room for more buyers, same headcount">
            Stock and research arrive ready, so each adviser can work with more buyers without a sourcing team behind them.
          </Benefit>
          <Benefit icon="clock" title="Less time between brief and shortlist">
            No more hunting through builder PDFs between a buyer&apos;s brief and a shortlist you can put in front of them.
          </Benefit>
          <Benefit icon="chart" title="Research capacity, not payroll">
            Add research capacity without adding researchers to your payroll.
          </Benefit>
          <Benefit icon="grid" title="A wider market">
            Add {showSpringboard ? "SDA" : "SMSF, SDA"} or multi-tenancy stock to what you offer without finding new suppliers.
          </Benefit>
        </div>
        <p className="cpd-small" style={{ marginTop: 22 }}>
          Listing details come from builders and developers; confirm price and availability before presenting.
        </p>
      </section>

      {/* ── 3. Streams ───────────────────────────────────────────── */}
      <section className="cpd-page" style={{ background: PAPER, padding: "52px 56px" }}>
        <span className="cpd-eyebrow" style={{ color: NK_AMBER }}>What we supply</span>
        <h2 className="cpd-h2" style={{ fontFamily: SERIF, color: NK_NAVY }}>One supplier. Every kind of new stock your buyers ask for.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 18, marginTop: 26 }}>
          {streams.map((k) => {
            const s = STREAMS[k];
            const focus = partnerStreams.includes(k);
            return (
              <div key={k} style={{ background: "#fff", borderRadius: 6, overflow: "hidden", boxShadow: "0 1px 3px rgba(27,31,68,.12)" }}>
                <div style={{ position: "relative", height: 178 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  {focus && (
                    <span style={{ position: "absolute", top: 10, left: 10, background: NK_AMBER, color: NK_NAVY, fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", padding: "4px 8px", borderRadius: 3 }}>
                      Your focus
                    </span>
                  )}
                </div>
                <div style={{ padding: "14px 16px 16px", borderTop: `4px solid ${s.colour}` }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: NK_NAVY }}>{s.label}</div>
                  <p style={{ fontSize: 13, lineHeight: 1.5, color: MUTED, margin: "6px 0 0" }}>{s.blurb}</p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="cpd-small" style={{ marginTop: 22 }}>
          NextKey sources new and project stock only: house and land (single and two-part contracts), townhouses,
          apartments, dual living, co-living, new commercial and SDA. We do not state or forecast rent, yield, capital
          growth or occupancy, and we do not provide financial, tax, superannuation or NDIS advice.
        </p>
      </section>

      {/* ── 4. Platform + contact ────────────────────────────────── */}
      <section className="cpd-page" style={{ background: "#fff", padding: "52px 56px 0", display: "flex", flexDirection: "column" }}>
        <span className="cpd-eyebrow" style={{ color: NK_AMBER }}>The platform</span>
        <h2 className="cpd-h2" style={{ fontFamily: SERIF, color: NK_NAVY }}>Built on our own AI platform.</h2>
        <p style={{ fontSize: 16, lineHeight: 1.5, color: MUTED, margin: "10px 0 0", maxWidth: 620 }}>
          The system that runs our business runs your feed. Partners get the benefit without any setup.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)", gap: 28, marginTop: 26 }}>
          <div style={{ display: "grid", gap: 16 }}>
            <Capability icon="doc" title="Extracts every stocklist">
              Builders&apos; PDFs, spreadsheets and emails are read by our platform and turned into structured listings, then
              checked before they reach your feed.
            </Capability>
            <Capability icon="pin" title="Maps the market">
              Every listing placed by suburb, so you can see where the stock is and how prices sit.
            </Capability>
            <Capability icon="match" title="Matches stock to briefs">
              Tell us your buyers&apos; briefs and we&apos;ll send you matching stock.
            </Capability>
            <Capability icon="report" title="Prepares the research">
              Suburb and planning research compiled into reports, ready for your brand.
            </Capability>
          </div>
          <PlatformIllustration />
        </div>

        <div style={{ marginTop: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 330px", background: NK_NAVY, color: "#fff", margin: "0 -56px", minHeight: 360 }}>
            <div style={{ padding: "44px 40px 40px 56px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1.12 }}>Let&apos;s talk about a channel agreement.</div>
              <p style={{ fontSize: 14, color: "#c9cde0", margin: "10px 0 16px" }}>
                Fifteen minutes, and we&apos;ll bring a sample of current stock in your area.
              </p>
              <div style={{ fontSize: 14, lineHeight: 1.7 }}>
                <strong style={{ color: NK_AMBER }}>Sean Lewis</strong>, Co-Founder
                <br />
                0494 822 912 · sean.l@nextkey.com.au · nextkey.com.au
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/channel-partners/partners-meeting.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
          <p className="cpd-small" style={{ padding: "14px 0 20px", margin: 0 }}>
            General information only. NextKey Property Strategists sources and researches property and does not provide
            financial, credit, tax, superannuation or NDIS advice. Partners remain responsible for their own licensing,
            advice and dealings with their clients. Stock figures are as at the date shown and change daily.
          </p>
        </div>
      </section>

      {/* ── 5. Springboard (its own brand; gated by clause 7) ────── */}
      {showSpringboard && (
        <section className="cpd-page" style={{ background: "#f7f3ec", padding: "48px 56px", position: "relative" }}>
          {!springboardRef && <DraftWash />}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/channel-partners/springboard-logo.png" alt="Springboard Homes" style={{ height: 50 }} />
            <span className="cpd-eyebrow" style={{ color: SB_AMBER }}>For accredited introducers</span>
          </div>
          <h2 className="cpd-h2" style={{ fontFamily: SERIF, color: SB_NAVY, marginTop: 30 }}>
            A pathway for eligible buyers without a full deposit.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 26, marginTop: 22 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/channel-partners/springboard-keys.jpg" alt="" style={{ width: "100%", height: 380, objectFit: "cover", borderRadius: 6 }} />
            <p style={{ fontSize: 17, lineHeight: 1.55, color: SB_NAVY, margin: 0, alignSelf: "center" }}>
              The Community Funding Program, offered through Your Loan Assist, may be able to help eligible buyers who
              haven&apos;t saved a full deposit purchase a completed home, with the deposit raised by Australians helping
              Australians buy property.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, marginTop: 28 }}>
            <SbPoint title="Refer, don't advise">
              You introduce the client. Your Loan Assist&apos;s licensed Finance team assesses eligibility and, if the buyer
              proceeds, arranges the finance.
            </SbPoint>
            <SbPoint title="Completed homes only">
              Established homes and finished new builds. Not house-and-land construction contracts.
            </SbPoint>
            <SbPoint title="By invitation">
              Introducer accreditation is by invitation and includes an NDA, an ID check and an exam.
            </SbPoint>
          </div>
          <div style={{ marginTop: 30 }}>
            <div style={{ fontSize: 12, letterSpacing: "1.5px", textTransform: "uppercase", color: SB_AMBER, fontWeight: 700 }}>
              The path to accreditation
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 10 }}>
              {["Invitation", "NDA", "ID check", "Accreditation exam", "Agreement", "Introducer portal"].map((s, i, a) => (
                <span key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ background: "#fff", border: `1px solid ${SB_AMBER}`, color: SB_NAVY, borderRadius: 20, padding: "6px 12px", fontSize: 13, fontWeight: 600 }}>
                    {s}
                  </span>
                  {i < a.length - 1 && <span style={{ color: SB_AMBER }}>→</span>}
                </span>
              ))}
            </div>
          </div>
          <p className="cpd-small" style={{ position: "absolute", left: 56, right: 56, bottom: 36, margin: 0 }}>
            Eligibility depends on a number of factors and is assessed by Your Loan Assist (CRE8 Finance Pty Ltd, ABN 69
            605 092 377, Australian Credit Licence 477483). Approval is not guaranteed.
            {springboardRef ? ` Ref ${springboardRef}.` : ""}
          </p>
        </section>
      )}
    </div>
  );
}

const DECK_CSS = `
  #cp-brochure .cpd-page {
    width: 794px; height: 1123px; overflow: hidden; box-sizing: border-box;
    margin: 0 auto 28px; box-shadow: 0 2px 14px rgba(20,24,50,.14);
    page-break-after: always; break-after: page; position: relative;
  }
  #cp-brochure .cpd-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
  #cp-brochure .cpd-h2 { font-size: 36px; line-height: 1.12; margin: 10px 0 0; font-weight: 700; }
  #cp-brochure .cpd-small { font-size: 11px; line-height: 1.5; color: ${MUTED}; }
  @media print {
    body * { visibility: hidden !important; }
    #cp-brochure, #cp-brochure * { visibility: visible !important; }
    #cp-brochure { position: absolute; left: 0; top: 0; }
    #cp-brochure .cpd-page { margin: 0; box-shadow: none; }
    .no-print { display: none !important; }
    @page { size: A4; margin: 0; }
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 700, color: NK_AMBER, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 13, color: "#dfe2ef", marginTop: 6 }}>{label}</div>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: SERIF, fontSize: 30, color: NK_AMBER, fontWeight: 700 }}>{n}</div>
      <div style={{ fontWeight: 700, fontSize: 17, color: NK_NAVY, margin: "4px 0 6px" }}>{title}</div>
      <p style={{ fontSize: 13.5, lineHeight: 1.5, color: MUTED, margin: 0 }}>{children}</p>
    </div>
  );
}

function Benefit({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, background: PAPER, borderRadius: 6, padding: "14px 16px" }}>
      <Icon name={icon} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, color: NK_NAVY }}>{title}</div>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: MUTED, margin: "4px 0 0" }}>{children}</p>
      </div>
    </div>
  );
}

function Capability({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <Icon name={icon} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, color: NK_NAVY }}>{title}</div>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: MUTED, margin: "3px 0 0" }}>{children}</p>
      </div>
    </div>
  );
}

function SbPoint({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderTop: `4px solid ${SB_AMBER}`, borderRadius: 4, padding: "14px 14px 16px" }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: SB_NAVY }}>{title}</div>
      <p style={{ fontSize: 13, lineHeight: 1.5, color: "#44485a", margin: "6px 0 0" }}>{children}</p>
    </div>
  );
}

function DraftWash() {
  return (
    <>
      <div
        style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5,
          background: "repeating-linear-gradient(135deg, rgba(185,28,28,.05) 0 18px, transparent 18px 36px)",
        }}
      />
      <div
        style={{
          position: "absolute", top: "44%", left: "-10%", right: "-10%", transform: "rotate(-24deg)", zIndex: 6,
          textAlign: "center", fontSize: 64, fontWeight: 800, letterSpacing: 6, color: "rgba(185,28,28,.16)", pointerEvents: "none",
        }}
      >
        NOT APPROVED
      </div>
      <div
        style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 7, background: "#b91c1c", color: "#fff",
          fontSize: 12, fontWeight: 700, textAlign: "center", padding: "6px 10px", letterSpacing: ".5px",
        }}
      >
        DRAFT — NOT FOR ISSUE. Requires Your Loan Assist&apos;s written clause 7 approval.
      </div>
    </>
  );
}

/** Builders → NextKey platform → your firm → your buyers. Plain boxes + arrows; prints crisply. */
function FlowDiagram({ builders }: { builders: string | null }) {
  const box = (bg: string, fg: string, title: string, sub: string, border?: string) => (
    <div style={{ background: bg, color: fg, borderRadius: 8, padding: "16px 12px", textAlign: "center", border: border ?? "none", minHeight: 96, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
      <div style={{ fontSize: 12, marginTop: 6, opacity: 0.85, lineHeight: 1.4 }}>{sub}</div>
    </div>
  );
  const arrow = (
    <svg width="28" height="20" viewBox="0 0 28 20" aria-hidden style={{ alignSelf: "center", flexShrink: 0 }}>
      <path d="M2 10h20M16 4l6 6-6 6" fill="none" stroke={NK_AMBER} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 28px 1.25fr 28px 1fr 28px 0.8fr", gap: 6, marginTop: 30, alignItems: "stretch" }}>
      {box(PAPER, NK_NAVY, "Builders & developers", builders ? `${builders} sending stocklists` : "Sending stocklists", "1px solid #e6e2d8")}
      {arrow}
      {box(NK_NAVY, "#fff", "NextKey platform", "extracts · checks · maps · researches")}
      {arrow}
      {box(NK_AMBER, NK_NAVY, "Your firm", "present · advise · transact")}
      {arrow}
      {box(PAPER, NK_NAVY, "Your buyers", "your clients, your brand", "1px solid #e6e2d8")}
    </div>
  );
}

/** A labelled illustration of the platform: suburb bubbles + a match card. Not real data. */
function PlatformIllustration() {
  const bubbles = [
    { x: 70, y: 70, r: 26 }, { x: 150, y: 52, r: 14 }, { x: 210, y: 96, r: 34 }, { x: 118, y: 132, r: 18 },
    { x: 250, y: 168, r: 12 }, { x: 62, y: 178, r: 11 }, { x: 180, y: 190, r: 22 },
  ];
  return (
    <div style={{ background: PAPER, borderRadius: 8, padding: 14, border: "1px solid #ece8de", position: "relative" }}>
      <span style={{ position: "absolute", top: 10, right: 12, fontSize: 10, letterSpacing: "1px", textTransform: "uppercase", color: MUTED }}>
        Illustrative
      </span>
      <svg viewBox="0 0 300 230" width="100%" aria-hidden>
        <path d="M20 40 Q80 10 150 22 T290 40 L290 220 L20 220 Z" fill="#eef0f6" />
        <path d="M40 200 C90 150 120 170 170 120 S260 70 285 60" fill="none" stroke="#d8dbe7" strokeWidth="3" />
        {bubbles.map((b, i) => (
          <circle key={i} cx={b.x} cy={b.y} r={b.r} fill={i === 2 ? NK_AMBER : NK_NAVY} fillOpacity={i === 2 ? 0.9 : 0.55} />
        ))}
        <circle cx="210" cy="96" r="42" fill="none" stroke={NK_AMBER} strokeWidth="2" strokeDasharray="4 4" />
      </svg>
      <div style={{ background: "#fff", borderRadius: 6, padding: "10px 12px", boxShadow: "0 1px 4px rgba(27,31,68,.15)", marginTop: -6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: NK_AMBER }}>New match</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: NK_NAVY, marginTop: 2 }}>4 bed house and land · [Suburb] QLD</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Matched to brief: QLD, 4 bed, under $750k</div>
      </div>
    </div>
  );
}

type IconName = "people" | "clock" | "chart" | "grid" | "doc" | "pin" | "match" | "report";

/** Stroke icons on one 24px grid, one style. */
function Icon({ name }: { name: IconName }) {
  const p: Record<IconName, React.ReactNode> = {
    people: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14c2.4.2 4 1.8 4.5 4.5" /></>,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
    chart: <><path d="M4 20h16" /><path d="M7 16v-4M12 16V8M17 16v-6" /></>,
    grid: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>,
    doc: <><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z" /><path d="M14 3.5V8h4M9.5 12h6M9.5 15.5h6" /></>,
    pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" /><circle cx="12" cy="10" r="2.3" /></>,
    match: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /><path d="M8 10.5l1.8 1.8 3.2-3.4" /></>,
    report: <><rect x="5" y="3.5" width="14" height="17" rx="1.5" /><path d="M8.5 16v-3M12 16V9.5M15.5 16v-5" /></>,
  };
  return (
    <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 8, background: NK_NAVY, display: "grid", placeItems: "center" }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={NK_AMBER} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {p[name]}
      </svg>
    </span>
  );
}
