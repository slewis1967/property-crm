import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const CRM_FIELDS = [
  { key: "full_name",       label: "Full Name",       desc: "Contact's full name (use if stored as one field)" },
  { key: "first_name",      label: "First Name",      desc: "Contact's first name only" },
  { key: "last_name",       label: "Last Name",       desc: "Contact's last name / surname only" },
  { key: "email",           label: "Email",           desc: "Email address" },
  { key: "phone",           label: "Phone",           desc: "Phone or mobile number" },
  { key: "buyer_type",      label: "Buyer Type",      desc: "Type of buyer e.g. Investor, First Home Buyer, Downsizer" },
  { key: "preferred_state", label: "State",           desc: "Australian state abbreviation e.g. QLD, NSW" },
  { key: "budget_max",      label: "Budget",          desc: "Maximum budget as a number" },
  { key: "timeframe",       label: "Timeframe",       desc: "Purchase timeframe e.g. ASAP, 3-6 months" },
  { key: "temperature",     label: "Temperature",     desc: "Lead temperature: hot, warm, or cold" },
  { key: "source",          label: "Source",          desc: "Where the lead came from" },
  { key: "skip",            label: "Skip (ignore)",   desc: "Do not import this column" },
];

export async function POST(req: NextRequest) {
  const { headers: csvHeaders, sampleRows } = await req.json();

  if (!csvHeaders?.length) {
    return NextResponse.json({ error: "No headers provided" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "your_api_key_here") {
    // Fallback: best-guess heuristic mapping without AI
    const mapping: Record<string, string> = {};
    for (const h of csvHeaders) {
      const lower = h.toLowerCase().replace(/[\s_-]+/g, "");
      if (["fullname","contactname"].some(k => lower.includes(k)) || lower === "name") mapping[h] = "full_name";
      else if (["firstname","givenname","fname"].some(k => lower.includes(k))) mapping[h] = "first_name";
      else if (["lastname","surname","familyname","lname"].some(k => lower.includes(k))) mapping[h] = "last_name";
      else if (lower.includes("email") || lower.includes("mail")) mapping[h] = "email";
      else if (["phone","mobile","cell","contact"].some(k => lower.includes(k))) mapping[h] = "phone";
      else if (["buyer","type","category","clienttype"].some(k => lower.includes(k))) mapping[h] = "buyer_type";
      else if (["state","location","region","province"].some(k => lower.includes(k))) mapping[h] = "preferred_state";
      else if (["budget","price","amount","max","spend"].some(k => lower.includes(k))) mapping[h] = "budget_max";
      else if (["timeframe","timeline","when","timing"].some(k => lower.includes(k))) mapping[h] = "timeframe";
      else if (["temp","heat","hot","warm","cold","priority"].some(k => lower.includes(k))) mapping[h] = "temperature";
      else if (["source","origin","channel","referral"].some(k => lower.includes(k))) mapping[h] = "source";
      else mapping[h] = "skip";
    }
    return NextResponse.json({ mapping, method: "heuristic" });
  }

  const client = new Anthropic({ apiKey });

  const sampleText = sampleRows?.slice(0, 3).map((row: Record<string, string>, i: number) =>
    `Row ${i + 1}: ${JSON.stringify(row)}`
  ).join("\n") || "No sample data";

  const prompt = `You are mapping CSV column headers to CRM contact fields.

CSV Headers: ${JSON.stringify(csvHeaders)}

Sample data:
${sampleText}

Available CRM fields:
${CRM_FIELDS.map(f => `- "${f.key}": ${f.desc}`).join("\n")}

Instructions:
- Map each CSV header to exactly one CRM field key from the list above
- Use "skip" for columns that don't match any CRM field
- If a column contains a full name (first + last together), map it to "full_name"
- If separate first name and last name columns exist, map them to "first_name" and "last_name" respectively — they will be combined automatically
- Be smart about abbreviations, alternate spellings, and different languages

Return ONLY a JSON object with no explanation: {"csv_header": "crm_field_key", ...}`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text.trim() : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const mapping = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // Validate all keys are valid CRM fields
    const validKeys = new Set(CRM_FIELDS.map(f => f.key));
    for (const [col, field] of Object.entries(mapping)) {
      if (!validKeys.has(field as string)) mapping[col] = "skip";
    }
    // Ensure all headers have a mapping
    for (const h of csvHeaders) {
      if (!(h in mapping)) mapping[h] = "skip";
    }

    return NextResponse.json({ mapping, method: "ai" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
