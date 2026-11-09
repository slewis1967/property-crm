/**
 * Stand-in NEXUS routes for the Opportunities board, opportunity pages and Lead
 * Intake (group "crm-a"). Everything here is made up. State is kept in memory
 * so a moved, tagged or deleted card stays that way between requests.
 *
 *   POST /__crm-a/reset   puts the board back to its starting state (each
 *                         scenario calls this before it records).
 */
const C = (n) => `d0000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const P_SALES = "pl-sales";
const P_INVEST = "pl-investor";

function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

function lead(id, contact, name, email, phone, o = {}) {
  return {
    lead_id: id,
    full_name: name,
    email,
    phone,
    buyer_type: null,
    state: null,
    budget: null,
    budget_numeric: null,
    score: null,
    temperature: "warm",
    ghl_stage: "New Lead",
    match_status: "pending",
    top_match_name: null,
    top_match_price: null,
    timeframe: null,
    message: null,
    source: "website",
    segment: null,
    scoring_notes: null,
    created_at: daysAgo(3),
    primary_contact_id: contact,
    linked_contact_ids: null,
    notes: null,
    tags: null,
    pipeline_id: P_SALES,
    preferred_location: null,
    date_of_birth: null,
    marital_status: null,
    dependents_count: null,
    home_address_street: null,
    home_address_suburb: null,
    home_address_state: null,
    home_address_postcode: null,
    employment_type: null,
    employer_name: null,
    occupation: null,
    annual_income: null,
    partner_annual_income: null,
    existing_savings: null,
    hecs_balance: null,
    ...o,
  };
}

function fresh() {
  return {
    seq: 100,
    pipelines: [
      { id: P_SALES, name: "Sales Pipeline", stages: ["New Lead", "Qualified", "Contacted", "Proposal Sent"], color: "#3b82f6", created_at: daysAgo(200) },
      { id: P_INVEST, name: "Investor Pipeline", stages: ["Enquiry", "Strategy Call", "Property Selected"], color: "#10b981", created_at: daysAgo(120) },
    ],
    leads: [
      lead("opp-1001", C(1), "Olivia Bennett", "olivia.bennett@example.com", "0491 570 101", {
        buyer_type: "First Home Buyer", state: "QLD", budget: "$650,000", score: 82, temperature: "hot",
        ghl_stage: "Qualified", timeframe: "1-3 months", preferred_location: "Brisbane northside",
        message: "Wants a house and land package north of Brisbane.", tags: JSON.stringify(["first-home"]),
        occupation: "Nurse", employment_type: "Full time", annual_income: 92000, existing_savings: 45000,
        home_address_suburb: "Chermside", home_address_state: "QLD", home_address_postcode: "4032", created_at: daysAgo(6),
      }),
      lead("opp-1002", C(4), "Noah Patel", "noah.patel@example.com", "0491 570 104", {
        buyer_type: "First Home Buyer", state: "QLD", budget: "$580,000", score: 55, temperature: "cold",
        ghl_stage: "New Lead", timeframe: "6-12 months", tags: JSON.stringify(["first-home"]), created_at: daysAgo(2),
      }),
      lead("opp-1003", C(5), "Amelia Thompson", "amelia.thompson@example.com", "0491 570 105", {
        buyer_type: "Owner Occupier", state: "QLD", budget: "$820,000", score: 90, temperature: "hot",
        ghl_stage: "Contacted", timeframe: "ASAP", match_status: "matched",
        top_match_name: "Four bedroom home, North Lakes", top_match_price: "$815,000", created_at: daysAgo(12),
      }),
      lead("opp-1004", C(7), "Isla Robinson", "isla.robinson@example.com", "0491 570 107", {
        buyer_type: "First Home Buyer", state: "NSW", budget: "$720,000", score: 63, temperature: "warm",
        ghl_stage: "Qualified", timeframe: "3-6 months", linked_contact_ids: JSON.stringify([C(7), C(8)]),
        partner_annual_income: 95000, annual_income: 105000, created_at: daysAgo(9),
      }),
      lead("opp-1005", C(10), "Lucas Martin", "lucas.martin@example.com", "0491 570 110", {
        buyer_type: "Owner Occupier", state: "SA", budget: "$560,000", score: 48, temperature: "cold",
        ghl_stage: "New Lead", timeframe: "6-12 months", created_at: daysAgo(1),
      }),
      lead("opp-1006", C(12), "Henry Wilson", "henry.wilson@example.com", "0491 570 112", {
        buyer_type: "Downsizer", state: "QLD", budget: "$610,000", score: 58, temperature: "warm",
        ghl_stage: "Proposal Sent", timeframe: "3-6 months", created_at: daysAgo(20),
      }),
      lead("opp-1007", null, "Sample Duplicate", "sample.duplicate@example.com", "0491 570 190", {
        buyer_type: "Investor", state: "QLD", budget: "$500,000", score: 20, temperature: "cold",
        ghl_stage: "New Lead", message: "Entered twice by mistake.", created_at: daysAgo(1),
      }),
      lead("opp-1008", null, "Taylor Example", "taylor.example@example.com", "0491 570 191", {
        buyer_type: "Investor", state: "VIC", budget: "$300,000", score: 15, temperature: "cold",
        ghl_stage: "New Lead", message: "Budget is well under any current stock.", created_at: daysAgo(4),
      }),
      lead("opp-2001", C(2), "Liam Nguyen", "liam.nguyen@example.com", "0491 570 102", {
        buyer_type: "Investor", state: "NSW", budget: "$750,000", score: 74, temperature: "warm",
        ghl_stage: "Strategy Call", pipeline_id: P_INVEST, timeframe: "3-6 months", created_at: daysAgo(8),
      }),
      lead("opp-2002", C(9), "Mia Anderson", "mia.anderson@example.com", "0491 570 109", {
        buyer_type: "Investor", state: "QLD", budget: "$900,000", score: 88, temperature: "hot",
        ghl_stage: "Property Selected", pipeline_id: P_INVEST, timeframe: "ASAP", match_status: "matched",
        top_match_name: "Dual occupancy, Toowoomba", top_match_price: "$890,000", created_at: daysAgo(15),
      }),
      lead("opp-2003", C(11), "Grace Lee", "grace.lee@example.com", "0491 570 111", {
        buyer_type: "Investor", state: "QLD", budget: "$680,000", score: 79, temperature: "hot",
        ghl_stage: "Enquiry", pipeline_id: P_INVEST, timeframe: "1-3 months", created_at: daysAgo(2),
      }),
    ],
  };
}

const S = (globalThis.__crmAState ??= fresh());
const reset = () => Object.assign(S, fresh());
const idOf = (url, prefix) => decodeURIComponent(url.pathname.slice(prefix.length));
const asJson = (v) => (v == null ? null : typeof v === "string" ? v : JSON.stringify(v));

function applyLeadPatch(l, body) {
  for (const [k, v] of Object.entries(body ?? {})) {
    if (k === "stage") l.ghl_stage = v;
    else if (k === "tags" || k === "linked_contact_ids") l[k] = asJson(v);
    else l[k] = v;
  }
}

const routes = {
  "POST /__crm-a/reset": () => {
    reset();
    return { ok: true };
  },

  "GET /api/leads": () => ({ leads: S.leads }),
  "POST /api/leads": (_req, _url, body) => {
    const id = `opp-${++S.seq + 3000}`;
    const l = lead(id, body?.primary_contact_id ?? null, body?.full_name ?? "New lead", body?.email ?? "", body?.phone ?? "", {
      created_at: new Date().toISOString(),
      source: "crm_manual",
    });
    applyLeadPatch(l, body);
    l.lead_id = id;
    if (!l.ghl_stage) l.ghl_stage = "New Lead";
    S.leads.unshift(l);
    return { ok: true, id, lead_id: id, ...l };
  },
  "GET /api/leads/*": (_req, url) => {
    const l = S.leads.find((x) => x.lead_id === idOf(url, "/api/leads/"));
    return l ?? { error: "not found" };
  },
  "PATCH /api/leads/*": (_req, url, body) => {
    const l = S.leads.find((x) => x.lead_id === idOf(url, "/api/leads/"));
    if (!l) return { error: "not found" };
    applyLeadPatch(l, body);
    return { ok: true, ...l };
  },
  "DELETE /api/leads/*": (_req, url) => {
    const id = idOf(url, "/api/leads/");
    S.leads = S.leads.filter((x) => x.lead_id !== id);
    return { ok: true };
  },

  "GET /api/pipelines": () => ({ pipelines: S.pipelines }),
  "POST /api/pipelines": (_req, _url, body) => {
    const p = { id: `pl-${++S.seq}`, name: body?.name ?? "Pipeline", stages: body?.stages ?? [], color: body?.color ?? "#3b82f6", created_at: new Date().toISOString() };
    S.pipelines.push(p);
    return p;
  },
  "PATCH /api/pipelines/*": (_req, url, body) => {
    const p = S.pipelines.find((x) => x.id === idOf(url, "/api/pipelines/"));
    if (!p) return { error: "not found" };
    Object.assign(p, body ?? {});
    return p;
  },
  "DELETE /api/pipelines/*": (_req, url) => {
    const id = idOf(url, "/api/pipelines/");
    S.pipelines = S.pipelines.filter((x) => x.id !== id);
    return { ok: true };
  },
};
export default routes;
