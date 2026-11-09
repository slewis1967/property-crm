/**
 * Writes seed/10-compliance-stock.sql. Everything here is invented.
 *   node seed/gen-compliance-stock.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "10-compliance-stock.sql");

const q = (v) => (v === null || v === undefined ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const j = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const arr = (a) => (a.length ? `array[${a.map(q).join(",")}]::text[]` : "array[]::text[]");
const id = (block, n) => `c5000000-0000-4000-${block}-${String(n).padStart(12, "0")}`;
const ago = (days, hours = 0) => `now() - interval '${days} days ${hours} hours'`;

const BUILDERS = ["Bluegum Homes", "Tallowwood Building Co", "Saltbush Constructions", "Ironbark Living", "Kestrel Ridge Developments"];
const EXTRA_BUILDER_NAMES = ["Wattlebird Homes", "Wattlebird Homes Pty Ltd", "wattlebird homes pty ltd (auto)", "Redgum & Co Builders"];

// builder, estate, suburb, state, lat, lng, type, base price, land base, lots
const ESTATES = [
  ["Bluegum Homes", "Curlew Rise", "Caboolture", "QLD", -27.085, 152.951, "House & Land", 612000, 420, 6],
  ["Bluegum Homes", "Banksia Fields", "Ripley", "QLD", -27.685, 152.8, "House & Land", 648000, 400, 5],
  ["Tallowwood Building Co", "Lorikeet Park", "Logan Reserve", "QLD", -27.72, 153.1, "House & Land", 689000, 450, 5],
  ["Tallowwood Building Co", "Stonefly Creek", "Pimpama", "QLD", -27.816, 153.3, "Townhouse", 598000, 180, 4],
  ["Saltbush Constructions", "Heron Quarter", "Oran Park", "NSW", -34.003, 150.74, "House & Land", 935000, 375, 5],
  ["Saltbush Constructions", "Silverleaf Gardens", "Marsden Park", "NSW", -33.694, 150.832, "House & Land", 1040000, 350, 4],
  ["Ironbark Living", "Paperbark Terraces", "Tarneit", "VIC", -37.838, 144.662, "House & Land", 672000, 392, 5],
  ["Ironbark Living", "Magpie Common", "Clyde North", "VIC", -38.112, 145.343, "Townhouse", 615000, 210, 4],
  ["Kestrel Ridge Developments", "Finch Hollow", "Burpengary", "QLD", -27.157, 152.957, "Duplex", 889000, 600, 4],
  ["Kestrel Ridge Developments", "Wagtail Green", "Angle Vale", "SA", -34.64, 138.65, "House & Land", 574000, 430, 4],
  ["Bluegum Homes", "Kingfisher Walk", "Baldivis", "WA", -32.33, 115.83, "House & Land", 658000, 410, 4],
];
// One suburb is left without a map position so the Stock Map shows its "Locate" button.
const UNPLACED = ["Tallowwood Building Co", "Plover Meadows", "Greenbank", "QLD", null, null, "Acreage", 1180000, 4000, 1];

const STREETS = ["Curlew Circuit", "Banksia Drive", "Lorikeet Way", "Stonefly Lane", "Heron Street", "Silverleaf Avenue", "Paperbark Road", "Magpie Close", "Finch Court", "Wagtail Parade", "Kingfisher Boulevard"];
const STATUSES = ["Available", "Available", "Available", "Available", "Under Contract", "Available", "Available", "On Hold"];

let n = 0;
const props = [];
const geos = [];
[...ESTATES, UNPLACED].forEach((e, ei) => {
  const [builder, estate, suburb, state, lat, lng, type, base, land, lots] = e;
  if (lat !== null) geos.push([`${suburb.toUpperCase()}|${state}`, suburb, state, lat, lng]);
  for (let k = 0; k < lots; k++) {
    n++;
    const beds = type === "Townhouse" ? 3 : type === "Duplex" ? 5 : type === "Acreage" ? 5 : [3, 4, 4, 4, 5][(n + k) % 5];
    const baths = beds >= 5 ? 3 : 2;
    const cars = type === "Townhouse" ? 1 : 2;
    const landSize = type === "Acreage" ? land : land + ((n * 37) % 9) * 12;
    const houseSize = type === "Townhouse" ? 148 + k * 6 : type === "Duplex" ? 262 + k * 8 : type === "Acreage" ? 298 : 172 + beds * 9 + k * 5;
    const price = base + k * 13500 + (beds - 4) * 21000 + ((n * 7) % 5) * 1500;
    const split = type === "House & Land" && (n % 3 !== 0);
    const landPrice = split ? Math.round((price * 0.46) / 500) * 500 : 0;
    const housePrice = price - landPrice;
    const hasAddress = k === 0 && ei < 9;
    const rent = n % 2 === 0 ? Math.round((price * 0.047) / 52 / 5) * 5 : null;
    props.push({
      id: id("8a00", n),
      builder_name: builder,
      estate_name: estate,
      lot_number: String(100 + ((n * 17) % 380)),
      street_address: hasAddress ? `${8 + ((n * 5) % 60)} ${STREETS[ei]}` : null,
      suburb,
      state,
      property_type: type,
      bedrooms: beds,
      bathrooms: baths,
      car_spaces: cars,
      land_size: landSize,
      land_size_sqm: landSize,
      house_size: houseSize,
      land_price: landPrice,
      build_price: 0,
      house_price: housePrice,
      total_package_price: price,
      status: STATUSES[n % STATUSES.length],
      titled: n % 3 !== 1,
      contract_type: type === "House & Land" ? (split ? "split" : "single") : "single",
      expected_rent_weekly: rent,
      confidence_score: 0.9,
      description:
        type === "Townhouse"
          ? `Low-maintenance ${beds} bedroom townhouse in ${estate}, a short walk to local shops and parkland.`
          : type === "Duplex"
            ? `Dual-key duplex in ${estate} with two separate living areas under one roof.`
            : type === "Acreage"
              ? `Family home on acreage in ${estate} with room for a shed and a pool.`
              : `${beds} bedroom family home in ${estate} with open-plan living and a covered alfresco.`,
      created_days: 1 + ((n * 3) % 24),
    });
  }
});

let sql = `-- Demo data for the Compliance and Stock help videos. EVERYTHING HERE IS INVENTED.
-- Builders, estates, people and companies are made up; suburb names are real places
-- so the Stock Map has somewhere to draw them. Generated by
-- .work/compliance-stock/gen-seed.mjs. Safe to re-run: it removes its own rows
-- (and the rows the recordings create) and puts them back.
begin;

-- The demo database was missing these two columns from migrations/20260730_aml_ongoing_cdd.sql,
-- which made the CDD Cases list fail to load.
alter table public.aml_cases add column if not exists next_review_at date;
alter table public.aml_cases add column if not exists last_reviewed_at date;

-- ── clear our own rows ───────────────────────────────────────────────────
delete from property_financials where property_id::text like 'c5000000-%';
delete from property_media where property_id::text like 'c5000000-%';
delete from property_review_queue where id::text like 'c5000000-%';
delete from global_stock_pool where id::text like 'c5000000-%' or builder_name in (${[...BUILDERS, ...EXTRA_BUILDER_NAMES].map(q).join(",")});
delete from ingestion_run where id::text like 'c5000000-%';
delete from prospect_builders where id::text like 'c5000000-%';
delete from builders where id::text like 'c5000000-%' or canonical_name in (${[...BUILDERS, ...EXTRA_BUILDER_NAMES].map(q).join(",")});
delete from stock_geocodes where key in (${[...geos.map((g) => g[0]), "GREENBANK|QLD"].map(q).join(",")});
delete from aml_screenings where case_id in (select id from aml_cases where id::text like 'c5000000-%' or coalesce(party_name,'') in ('', 'Olivia Bennett', 'Unnamed party'));
delete from aml_cases where id::text like 'c5000000-%' or coalesce(party_name,'') in ('', 'Olivia Bennett', 'Unnamed party');
delete from aml_reports where id::text like 'c5000000-%' or subject_name in ('Cash deposit, Lot 214 Curlew Rise');
delete from aml_training where id::text like 'c5000000-%' or staff_name in ('Priya Desai');

-- ── stock ────────────────────────────────────────────────────────────────
`;

const cols = ["id", "builder_name", "estate_name", "lot_number", "street_address", "suburb", "state", "property_type", "bedrooms", "bathrooms", "car_spaces", "land_size", "land_size_sqm", "house_size", "land_price", "build_price", "house_price", "status", "titled", "contract_type", "expected_rent_weekly", "confidence_score", "description"];
sql += `insert into global_stock_pool (${cols.join(", ")}, pipeline_status, source, created_at, updated_at, last_seen_at) values\n`;
sql += props.map((p) => `(${cols.map((c) => q(p[c])).join(", ")}, 'active', 'demo', ${ago(p.created_days)}, ${ago(1)}, ${ago(1)})`).join(",\n") + ";\n\n";

sql += `insert into stock_geocodes (key, suburb, state, lat, lng, precision, provider, display, failed, attempts) values\n`;
sql += geos.map((g) => `(${q(g[0])}, ${q(g[1])}, ${q(g[2])}, ${g[3]}, ${g[4]}, 'suburb', 'demo', ${q(`${g[1]}, ${g[2]}, Australia`)}, false, 1)`).join(",\n") + ";\n\n";

// One fully-detailed property for the detail page.
sql += `update global_stock_pool set rebates = '10000', land_registration_date = '2026-11-20', expected_rent_weekly = 590 where id = ${q(id("8a00", 1))};\n`;
sql += `insert into property_media (id, property_id, kind, storage_path) values (${q(id("8a10", 1))}, ${q(id("8a00", 1))}, 'brochure_pdf', '#brochure');\n`;
sql += `insert into property_financials (property_id, gross_developer_fee) values (${q(id("8a00", 2))}, 22000);\n\n`;

// ── builders
const b = (nn, name, o = {}) =>
  `(${q(id("8b00", nn))}, ${q(name)}, ${arr(o.aliases ?? [])}, ${arr(o.domains ?? [])}, ${q(o.email ?? null)}, ${q(o.phone ?? null)}, ${o.active ?? true}, ${o.draft ?? false}, ${o.outreach ?? true}, ${o.last ? ago(o.last) : "null"}, ${o.noReplies ?? 0}, ${q(o.notes ?? null)}, ${ago(o.created ?? 90)})`;
sql += `insert into builders (id, canonical_name, aliases, sender_domains, contact_email, contact_phone, active, draft, auto_outreach_enabled, last_contact_at, consecutive_no_replies, extraction_notes, created_at) values\n`;
sql += [
  b(1, "Bluegum Homes", { aliases: ["Bluegum", "Bluegum Homes QLD"], domains: ["bluegumhomes.example.com"], email: "stock@bluegumhomes.example.com", phone: "0491 570 211", last: 1, notes: "Lot number is in the first column. Prices include site costs." }),
  b(2, "Tallowwood Building Co", { aliases: ["Tallowwood"], domains: ["tallowwood.example.com"], email: "sales@tallowwood.example.com", phone: "0491 570 212", last: 6, noReplies: 1 }),
  b(3, "Saltbush Constructions", { aliases: ["Saltbush"], domains: ["saltbush.example.com"], email: "stocklist@saltbush.example.com", phone: "0491 570 213", last: 3 }),
  b(4, "Ironbark Living", { aliases: ["Ironbark"], domains: ["ironbarkliving.example.com"], email: "partners@ironbarkliving.example.com", phone: "0491 570 214", last: 2 }),
  b(5, "Kestrel Ridge Developments", { aliases: ["Kestrel Ridge"], domains: ["kestrelridge.example.com"], email: "hello@kestrelridge.example.com", phone: "0491 570 215", last: 21, noReplies: 2 }),
  b(6, "wattlebird homes pty ltd (auto)", { domains: ["wattlebird.example.com"], draft: true, created: 1 }),
].join(",\n") + ";\n\n";

// ── ingestion runs
const run = (nn, builderIdx, subject, days, hours, status, a, u, w, r, cost, err = null, secs = 41) =>
  `(${q(id("8c00", nn))}, ${q(`demo-email-${nn}`)}, ${q(subject)}, ${ago(days, hours)}, ${builderIdx ? q(id("8b00", builderIdx)) : "null"}, ${q(builderIdx ? [null, ...BUILDERS, "Wattlebird Homes"][builderIdx] : "Wattlebird Homes")}, ${ago(days, hours)}, ${ago(days, hours)} + interval '${secs} seconds', 1, ${a + u + r}, ${a}, ${u}, ${w}, ${r}, ${q(status)}, ${q(err)}, ${cost})`;
sql += `insert into ingestion_run (id, email_id, email_subject, email_received_at, builder_id, builder_name, started_at, ended_at, artifacts_seen, props_extracted, props_added, props_updated, props_withdrawn, props_to_review, status, error, ai_cost_usd) values\n`;
sql += [
  run(1, 1, "Bluegum Homes stocklist, week of 5 October", 1, 2, "completed", 3, 9, 1, 2, 0.0412),
  run(2, 4, "Ironbark Living: Paperbark Terraces price update", 2, 5, "completed", 0, 7, 0, 0, 0.0188, null, 27),
  run(3, 3, "Saltbush Constructions October availability", 3, 1, "partial", 2, 5, 0, 3, 0.0366, null, 58),
  run(4, 6, "New release: Wattlebird Homes at Greenbank", 1, 8, "completed", 0, 0, 0, 1, 0.0091, null, 19),
  run(5, 2, "Tallowwood stock list (attached)", 4, 3, "failed", 0, 0, 0, 0, 0.0, "The attachment could not be opened. It is password protected.", 6),
  run(6, 2, "Tallowwood stock list (attached)", 5, 3, "failed", 0, 0, 0, 0, 0.0, "The attachment could not be opened. It is password protected.", 5),
  run(7, 1, "Bluegum Homes stocklist, week of 28 September", 8, 2, "completed", 5, 6, 2, 0, 0.0397),
  run(8, 2, "Tallowwood Building Co: Lorikeet Park and Stonefly Creek", 6, 4, "completed", 4, 3, 0, 1, 0.0301, null, 49),
  run(9, 4, "Ironbark Living stocklist", 9, 6, "completed", 6, 1, 1, 0, 0.0274, null, 36),
  run(10, 3, "Saltbush Constructions September availability", 12, 1, "completed", 7, 0, 0, 0, 0.0329, null, 44),
  run(11, 5, "Kestrel Ridge availability", 7, 2, "completed", 0, 0, 0, 0, 0.0102, null, 15),
  run(12, 5, "Kestrel Ridge availability", 14, 2, "completed", 0, 0, 0, 0, 0.0099, null, 14),
  run(13, 5, "Kestrel Ridge Developments: Finch Hollow and Wagtail Green", 21, 2, "completed", 6, 0, 0, 0, 0.0287, null, 39),
  run(14, 1, "Bluegum Homes stocklist, week of 21 September", 15, 2, "completed", 4, 2, 0, 0, 0.0318),
].join(",\n") + ";\n\n";

// ── review queue
const rq = (nn, runN, builder, estate, lot, conf, reasons, extra, status = "pending") => {
  const raw = { builder_name: builder, estate_name: estate, lot_number: lot, street_address: null, suburb: null, state: null, bedrooms: null, bathrooms: null, car_spaces: null, land_size_sqm: null, house_size: null, house_price: null, land_price: null, total_package_price: null, expected_rent_weekly: null, sda_category: null, rebates: null, status: "Available", ...extra };
  return `(${q(id("8d00", nn))}, ${q(id("8c00", runN))}, ${j(raw)}, 'insert', ${q(builder)}, ${q(estate)}, ${q(lot)}, ${conf}, ${arr(reasons)}, ${q(status)}, ${status === "pending" ? "null" : q("demo@example.com")}, ${status === "pending" ? "null" : ago(2)}, ${ago(nn > 6 ? 6 : 1, nn)})`;
};
sql += `insert into property_review_queue (id, ingestion_run_id, raw_extraction, proposed_action, builder_name, estate_name, lot_number, confidence_score, reasons, status, reviewed_by, reviewed_at, created_at) values\n`;
sql += [
  rq(1, 1, "Bluegum Homes", "Curlew Rise", "231", 0.46, ["price missing", "land size missing"], { suburb: "Caboolture", state: "QLD", bedrooms: 4, bathrooms: 2, car_spaces: 2, house_size: 208 }),
  rq(2, 1, "Bluegum Homes", "Banksia Fields", "118", 0.41, ["suburb missing"], { state: "QLD", bedrooms: 4, bathrooms: 2, car_spaces: 2, land_size_sqm: 412, house_size: 204, house_price: 661500 }),
  rq(3, 3, "Saltbush Constructions", "Heron Quarter", "77", 0.38, ["bedrooms missing", "price looks too low"], { suburb: "Oran Park", state: "NSW", bathrooms: 2, car_spaces: 2, land_size_sqm: 375, house_price: 94800 }),
  rq(4, 3, "Saltbush Constructions", "Silverleaf Gardens", "302", 0.33, ["lot number unclear", "land price missing"], { suburb: "Marsden Park", state: "NSW", bedrooms: 5, bathrooms: 3, car_spaces: 2, house_size: 241, house_price: 1068000 }),
  rq(5, 3, "Saltbush Constructions", "Heron Quarter", "81", 0.29, ["this row may be a display home"], { suburb: "Oran Park", state: "NSW", bedrooms: 4, bathrooms: 2, car_spaces: 2, house_price: 958000, status: "Display" }),
  rq(6, 4, "Wattlebird Homes", "Plover Meadows", "12", 0.22, ["new builder", "price missing", "bedrooms missing"], { suburb: "Greenbank", state: "QLD", land_size_sqm: 4000 }),
  rq(7, 8, "Tallowwood Building Co", "Lorikeet Park", "164", 0.44, ["land size missing"], { suburb: "Logan Reserve", state: "QLD", bedrooms: 4, bathrooms: 2, car_spaces: 2, house_price: 702500 }, "approved"),
  rq(8, 8, "Tallowwood Building Co", "Stonefly Creek", "9", 0.47, ["car spaces missing"], { suburb: "Pimpama", state: "QLD", bedrooms: 3, bathrooms: 2, house_price: 611500 }, "approved"),
  rq(9, 8, "Tallowwood Building Co", "Lorikeet Park", "0", 0.18, ["lot number unclear", "this row may be a heading"], { suburb: "Logan Reserve", state: "QLD" }, "rejected"),
].join(",\n") + ";\n\n";

// ── prospect builders
const pb = (nn, company, o) =>
  `(${q(id("8e00", nn))}, ${q(company)}, ${q(o.category)}, ${q(o.location)}, ${q(o.website)}, ${q(o.signup ?? null)}, ${q(o.stock)}, ${q(o.terms ?? null)}, ${q(o.next ?? null)}, ${q(o.notes ?? null)}, ${j(o.contacts)}, ${q(o.status)}, ${o.req ? ago(o.req) : "null"}, ${o.req ? q("demo@example.com") : "null"}, ${o.signed ? ago(o.signed) : "null"}, ${o.signed ? q("demo@example.com") : "null"}, ${o.onb ? ago(o.onb) : "null"}, ${o.onb ? q("demo@example.com") : "null"}, ${o.builder ? q(id("8b00", o.builder)) : "null"}, ${ago(40 - nn)})`;
sql += `insert into prospect_builders (id, company, category, location, website, signup_method, stock_types, commission_notes, next_action, notes, contacts, status, agreement_requested_at, agreement_requested_by, agreement_signed_at, agreement_signed_by, onboarded_at, onboarded_by, builder_id, created_at) values\n`;
sql += [
  pb(1, "Redgum & Co Builders", { category: "Builder", location: "Brisbane, QLD", website: "https://redgumbuilders.example.com", signup: "Email the partnerships team", stock: "House and land, townhouses", terms: "Fee paid at settlement", next: "Ask for their marketing agreement", contacts: [{ name: "Hannah Whitlock", role: "Partnerships Manager", email: "hannah.whitlock@redgumbuilders.example.com", phone: "0491 570 221" }], status: "prospect" }),
  pb(2, "Stringybark Projects", { category: "Developer", location: "Geelong, VIC", website: "https://stringybark.example.com", signup: "Online partner form", stock: "House and land", next: "Call to introduce NextKey", contacts: [{ name: "Tom Achterberg", role: "Sales Director", email: "tom@stringybark.example.com", phone: "0491 570 222" }], status: "prospect" }),
  pb(3, "Lyrebird Property Group", { category: "Project marketer", location: "Sydney, NSW", website: "https://lyrebirdproperty.example.com", stock: "Apartments, townhouses", terms: "Staged fee", contacts: [{ name: "Mei Castellano", role: "Channel Manager", email: "mei@lyrebirdproperty.example.com", phone: "0491 570 223" }], status: "agreement_requested", req: 6 }),
  pb(4, "Coolabah Homes", { category: "Builder", location: "Adelaide, SA", website: "https://coolabahhomes.example.com", stock: "House and land", terms: "Fee paid at settlement", contacts: [{ name: "Darcy Lindqvist", role: "General Manager", email: "darcy@coolabahhomes.example.com", phone: "0491 570 224" }], status: "agreement_signed", req: 18, signed: 4 }),
  pb(5, "Bluegum Homes", { category: "Builder", location: "Brisbane, QLD", website: "https://bluegumhomes.example.com", stock: "House and land", terms: "Fee paid at settlement", contacts: [{ name: "Ruby Okafor", role: "Sales Coordinator", email: "stock@bluegumhomes.example.com", phone: "0491 570 211" }], status: "onboarded", req: 120, signed: 105, onb: 95, builder: 1 }),
].join(",\n") + ";\n\n";

// ── AML
const addr = (line1, suburb, state, postcode) => ({ line1, suburb, state, postcode, country: "Australia" });
const emptyAddr = { line1: "", suburb: "", state: "", postcode: "", country: "Australia" };
const caseData = (o) => ({
  partyType: o.type ?? "individual",
  partyRole: o.role ?? "buyer",
  entity: {
    fullLegalName: o.name ?? "",
    dob: o.dob ?? "",
    residentialAddress: o.address ?? emptyAddr,
    idDocument: { type: "drivers_licence", number: o.idNo ?? "", expiry: o.idNo ? "2030-06-30" : "", country: "Australia", verified: !!o.idNo },
    companyName: o.company ?? "",
    acnAbn: o.acn ?? "",
    registeredOffice: o.office ?? emptyAddr,
    trustName: o.trust ?? "",
    trustType: o.trustType ?? "",
    fundName: "",
  },
  beneficialOwners: o.owners ?? [],
  sourceOfFunds: o.funds ? { category: o.funds, description: o.fundsNote ?? "", verified: true } : { category: "", description: "", verified: false },
  sourceOfWealth: { description: o.wealth ?? "", verified: !!o.wealth },
  verification: { provider: "manual", status: o.idNo ? "verified" : "not_started", reference: "", verifiedAt: "" },
  screening: { status: o.screen ?? "pending", lastScreenedAt: o.screen && o.screen !== "pending" ? "2026-10-06T01:30:00.000Z" : "", lists: [] },
  riskRating: o.risk ?? "low",
  riskFactors: { pep: false, highRiskCountry: false, cashIntensive: false, complexStructure: !!o.complex, notes: "" },
  notes: o.notes ?? "",
});
const amlCase = (nn, party, status, o, days, review = null) =>
  `(${q(id("8f00", nn))}, ${q(party)}, ${q(o.type ?? "individual")}, ${q(o.role ?? "buyer")}, ${q(status)}, ${q(o.risk ?? "low")}, ${q(o.screen ?? "pending")}, ${q(o.contact ?? null)}, ${j(caseData(o))}, 'demo@example.com', 'demo@example.com', ${ago(days + 3)}, ${ago(days)}, ${review ? q(review) : "null"})`;
sql += `insert into aml_cases (id, party_name, party_type, party_role, status, risk_rating, screening_status, contact_id, data, created_by, updated_by, created_at, updated_at, next_review_at) values\n`;
sql += [
  amlCase(1, "Liam Nguyen", "In Progress", { name: "Liam Nguyen", dob: "1986-03-14", address: addr("27 Wattle Street", "Parramatta", "NSW", "2150"), idNo: "DL4471902", funds: "savings", fundsNote: "Savings held with his bank for more than two years. Statements sighted.", contact: "d0000000-0000-4000-8000-000000000002" }, 1),
  amlCase(2, "Charlotte Walker", "Screening", { name: "Charlotte Walker", dob: "1990-11-02", address: addr("5 Lakeview Crescent", "Geelong", "VIC", "3220"), idNo: "DL8820146", funds: "sale_of_property", fundsNote: "Proceeds from the sale of her unit. Settlement statement sighted.", screen: "clear", contact: "d0000000-0000-4000-8000-000000000003" }, 2),
  amlCase(3, "Harbourline Holdings Pty Ltd", "Enhanced DD", { type: "company", role: "seller", name: "Felix Marchetti", company: "Harbourline Holdings Pty Ltd", acn: "000 000 019", office: addr("Level 2, 40 Example Street", "Brisbane City", "QLD", "4000"), owners: [{ fullLegalName: "Felix Marchetti", dob: "1974-08-21", ownershipPercent: 60, role: "Director", verified: true }, { fullLegalName: "Ingrid Marchetti", dob: "1977-01-09", ownershipPercent: 40, role: "Director", verified: false }], funds: "business_income", risk: "high", complex: true, screen: "potential_match" }, 3),
  amlCase(4, "Noah Patel", "Draft", { name: "Noah Patel", contact: "d0000000-0000-4000-8000-000000000004" }, 5),
  amlCase(5, "Wren Family Trust", "Cleared", { type: "trust", name: "Sophie Wren", trust: "Wren Family Trust", trustType: "Discretionary", owners: [{ fullLegalName: "Sophie Wren", dob: "1981-05-30", ownershipPercent: null, role: "Trustee", verified: true }], funds: "investment", screen: "clear" }, 190, "2026-10-01"),
  amlCase(6, "Olivia Bennett (duplicate)", "Draft", { name: "Olivia Bennett (duplicate)" }, 0),
].join(",\n") + ";\n\n";
sql += `insert into aml_screenings (id, case_id, subject_name, subject_kind, provider, result, screened_by, screened_at) values
(${q(id("8f10", 1))}, ${q(id("8f00", 2))}, 'Charlotte Walker', 'party', 'manual', 'clear', 'demo@example.com', ${ago(2)}),
(${q(id("8f10", 2))}, ${q(id("8f00", 3))}, 'Felix Marchetti', 'beneficial_owner', 'manual', 'potential_match', 'demo@example.com', ${ago(3)}),
(${q(id("8f10", 3))}, ${q(id("8f00", 5))}, 'Sophie Wren', 'beneficial_owner', 'manual', 'clear', 'demo@example.com', ${ago(190)});\n\n`;

sql += `insert into aml_reports (id, report_type, status, subject_name, trigger_date, due_date, terrorism_related, confidential, austrac_reference, lodged_at, created_by, updated_by, created_at) values
(${q(id("9000", 1))}, 'TTR', 'draft', 'Cash deposit, Lot 131 Banksia Fields', current_date - 3, current_date + 9, false, false, null, null, 'demo@example.com', 'demo@example.com', ${ago(3)}),
(${q(id("9000", 2))}, 'IFTI', 'draft', 'Overseas transfer, Harbourline Holdings Pty Ltd', current_date - 6, current_date + 6, false, false, null, null, 'demo@example.com', 'demo@example.com', ${ago(6)}),
(${q(id("9000", 3))}, 'TTR', 'draft', 'Cash deposit, Lot 77 Heron Quarter', current_date - 21, current_date - 7, false, false, null, null, 'demo@example.com', 'demo@example.com', ${ago(21)}),
(${q(id("9000", 4))}, 'TTR', 'lodged', 'Cash deposit, Lot 9 Stonefly Creek', current_date - 40, current_date - 26, false, false, 'TTR-DEMO-000123', ${ago(30)}, 'demo@example.com', 'demo@example.com', ${ago(40)}),
(${q(id("9000", 5))}, 'IFTI', 'draft', 'Entered twice by mistake', current_date - 1, current_date + 13, false, false, null, null, 'demo@example.com', 'demo@example.com', ${ago(1)});\n\n`;

sql += `insert into aml_training (id, staff_name, staff_email, module, completed_on, created_by, created_at) values
(${q(id("9100", 1))}, 'Grace Holloway', 'grace.holloway@example.com', 'AML/CTF awareness', current_date - 60, 'demo@example.com', ${ago(60)}),
(${q(id("9100", 2))}, 'Marcus Tran', 'marcus.tran@example.com', 'AML/CTF awareness', current_date - 58, 'demo@example.com', ${ago(58)}),
(${q(id("9100", 3))}, 'Grace Holloway', 'grace.holloway@example.com', 'Suspicious matter reporting', current_date - 30, 'demo@example.com', ${ago(30)});\n\n`;

const program = {
  enrolment: { status: "in_progress", austracReference: "", enrolledAt: "", officerNotifiedAt: "" },
  complianceOfficer: { name: "", email: "", appointedAt: "" },
  programApproved: { approvedBy: "Marcus Tran", approvedAt: "2026-06-24", version: "1.0" },
  reviewDue: "2027-06-24",
  independentEvaluation: { lastCompletedAt: "", evaluator: "", nextDueAt: "2027-06-30", remediationCompletedAt: "", scope: "", findings: "" },
  complianceReport: { periodEnd: "2026-12-31", dueAt: "2027-03-31", lodgedAt: "", austracReference: "" },
  smrAccess: [],
  riskAssessment: {
    customer: { rating: "medium", notes: "Mostly owner occupiers and local investors." },
    transaction: { rating: "low", notes: "Funds move through solicitor trust accounts." },
    channel: { rating: "medium", notes: "Some clients are met by video only." },
    geographic: { rating: "low", notes: "Australian residents." },
  },
  notes: "",
};
sql += `insert into aml_program (org, data, updated_by) values ('nextkey', ${j(program)}, 'demo@example.com')
on conflict (org) do update set data = excluded.data, updated_by = excluded.updated_by, updated_at = now();\n\ncommit;\n`;

fs.writeFileSync(OUT, sql);
console.log(`wrote ${OUT}: ${props.length} properties, ${geos.length} suburbs placed`);
