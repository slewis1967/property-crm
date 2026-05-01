// Bulk SMS to all contacts tagged "getahome".
//
// Usage:
//   node --env-file=.env.local scripts/blast_getahome.mjs --dry-run
//   node --env-file=.env.local scripts/blast_getahome.mjs --limit=5
//   node --env-file=.env.local scripts/blast_getahome.mjs --campaign=getahome_2026_05
//
// Reads message body from MESSAGE env var or --message="..." flag.
// Writes every send to sms_log. Skips anyone in sms_opt_outs.
// Resumable: skips contacts already in sms_log for the same campaign.
// Rate limit: 1 SMS / 1.1s. ~6 minutes for 335 contacts.

import { createClient } from "@supabase/supabase-js";

// ---------- args ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
const DRY_RUN = !!args["dry-run"];
const LIMIT = args.limit ? parseInt(args.limit, 10) : null;
const OVERRIDE_TO = args["override-to"] || null; // E.164 — for testing
const CAMPAIGN = args.campaign || (OVERRIDE_TO ? "test_getahome_2026_05" : "getahome_2026_05");
const MESSAGE = args.message || process.env.MESSAGE;

if (!MESSAGE || !MESSAGE.trim()) {
  console.error("ERROR: provide --message=\"...\" or MESSAGE env var");
  process.exit(1);
}
if (MESSAGE.length > 459) {
  console.error(`ERROR: message is ${MESSAGE.length} chars (max 459 / 3 SMS segments)`);
  process.exit(1);
}

// ---------- env ----------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CS_USER = process.env.CLICKSEND_USERNAME;
const CS_KEY = process.env.CLICKSEND_API_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: SUPABASE creds missing in env");
  process.exit(1);
}
if (!DRY_RUN && (!CS_USER || !CS_KEY)) {
  console.error("ERROR: CLICKSEND creds missing in env");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------- helpers ----------
function toE164AU(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, "");
  if (digits.startsWith("+61") && digits.length === 12) return digits;
  if (digits.startsWith("61") && digits.length === 11) return "+" + digits;
  if (digits.startsWith("04") && digits.length === 10) return "+61" + digits.slice(1);
  if (digits.startsWith("4") && digits.length === 9) return "+61" + digits;
  return null;
}

async function sendOne(phone, body) {
  const auth = Buffer.from(`${CS_USER}:${CS_KEY}`).toString("base64");
  const res = await fetch("https://rest.clicksend.com/v3/sms/send", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ source: "nextkey-crm-blast", from: "+61488161674", to: phone, body }],
    }),
  });
  const json = await res.json();
  const msg = json?.data?.messages?.[0];
  if (msg?.status === "SUCCESS") {
    return {
      ok: true,
      provider_msg_id: msg.message_id,
      cost: typeof msg.message_price === "string" ? parseFloat(msg.message_price) : msg.message_price ?? 0,
    };
  }
  return { ok: false, error: msg?.status_text || msg?.status || json?.response_msg || `HTTP ${res.status}` };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- main ----------
console.log("=".repeat(60));
console.log(DRY_RUN ? "DRY RUN — no SMS will be sent" : "LIVE BLAST — SMS will be sent");
console.log(`Campaign: ${CAMPAIGN}`);
console.log(`Message (${MESSAGE.length} chars): ${JSON.stringify(MESSAGE)}`);
console.log(`Limit: ${LIMIT ?? "none"}`);
console.log("=".repeat(60));

// 1. Pull all getahome contacts
const { data: contacts, error: cerr } = await sb
  .from("contacts")
  .select("id, name, first_name, phone")
  .contains("tags", ["getahome"]);
if (cerr) {
  console.error("Failed to fetch contacts:", cerr.message);
  process.exit(1);
}
console.log(`Fetched ${contacts.length} getahome contacts`);

// Sanitize first_name: strip after first space/slash, default to "there".
// Handles oddballs like "Mack/ Mackenzie" or "Cheryl Weston" that ended up
// in first_name from the iCloud import.
function cleanFirstName(raw) {
  if (!raw) return "there";
  const first = String(raw).split(/[\s\/]/)[0].trim();
  return first || "there";
}

// 2. Pull opt-outs
const { data: optOuts } = await sb.from("sms_opt_outs").select("phone");
const optOutSet = new Set((optOuts ?? []).map((r) => r.phone));

// 3. Pull already-sent for this campaign (for resumability)
const { data: prior } = await sb
  .from("sms_log")
  .select("phone")
  .eq("campaign", CAMPAIGN)
  .in("status", ["sent", "opted_out"]);
const sentSet = new Set((prior ?? []).map((r) => r.phone));

// 4. Build send list
const queue = [];
const skipped = { no_phone: 0, opted_out: 0, already_sent: 0 };
for (const c of contacts) {
  const phone = toE164AU(c.phone);
  if (!phone) {
    skipped.no_phone++;
    continue;
  }
  if (optOutSet.has(phone)) {
    skipped.opted_out++;
    continue;
  }
  if (sentSet.has(phone)) {
    skipped.already_sent++;
    continue;
  }
  queue.push({ id: c.id, name: c.name, first_name: cleanFirstName(c.first_name), phone });
}

console.log(`Skipped: ${skipped.no_phone} no AU mobile, ${skipped.opted_out} opted out, ${skipped.already_sent} already sent`);
console.log(`Queue: ${queue.length} contacts`);
if (LIMIT && queue.length > LIMIT) {
  queue.length = LIMIT;
  console.log(`Limited to first ${LIMIT}`);
}
console.log(`Estimated cost: ~$${(queue.length * 0.08).toFixed(2)} AUD (at 8c/msg upper bound)`);
console.log("=".repeat(60));

if (DRY_RUN) {
  console.log("DRY RUN - first 5 personalized previews:");
  for (const r of queue.slice(0, 5)) {
    const personalized = MESSAGE.replace(/\{first_name\}/g, r.first_name);
    console.log(`\n  ${r.phone}  ${r.name}`);
    console.log(`  -> ${personalized}`);
    console.log(`  (${personalized.length} chars)`);
  }
  console.log("\nRe-run without --dry-run to actually send.");
  process.exit(0);
}

if (queue.length === 0) {
  console.log("Nothing to send.");
  process.exit(0);
}

// 5. Send loop
let sent = 0;
let failed = 0;
let totalCost = 0;
const startedAt = Date.now();

for (let i = 0; i < queue.length; i++) {
  const r = queue[i];
  const dest = OVERRIDE_TO ? `${OVERRIDE_TO} (test, would be ${r.phone})` : r.phone;
  process.stdout.write(`[${i + 1}/${queue.length}] ${dest} ${r.name?.slice(0, 30) ?? ""}  ... `);

  const personalized = MESSAGE.replace(/\{first_name\}/g, r.first_name);
  const sendTo = OVERRIDE_TO || r.phone;
  const result = await sendOne(sendTo, personalized);

  await sb.from("sms_log").insert({
    contact_id: OVERRIDE_TO ? null : r.id,
    phone: sendTo,
    body: personalized,
    status: result.ok ? "sent" : "failed",
    provider: "clicksend",
    provider_msg_id: result.ok ? result.provider_msg_id : null,
    error: result.ok ? null : result.error,
    campaign: CAMPAIGN,
    cost: result.ok ? result.cost : null,
  });

  if (result.ok) {
    sent++;
    totalCost += result.cost ?? 0;
    process.stdout.write(`OK ($${(result.cost ?? 0).toFixed(4)})\n`);
  } else {
    failed++;
    process.stdout.write(`FAIL — ${result.error}\n`);
  }

  if (i < queue.length - 1) await sleep(1100); // 1.1s rate limit
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
console.log("=".repeat(60));
console.log(`Done in ${elapsed}s`);
console.log(`Sent: ${sent}  Failed: ${failed}`);
console.log(`Total cost: $${totalCost.toFixed(2)} AUD`);
