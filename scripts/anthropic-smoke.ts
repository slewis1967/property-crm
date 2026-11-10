/**
 * Live check of every way the CRM calls the Anthropic API. Spends real credit,
 * a few cents at most, so it is run by hand and is not part of the test suite:
 *
 *   npx tsx --env-file=.env.local scripts/anthropic-smoke.ts
 *
 * Uses a made-up PDF and a blank image; no client data is involved.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { aiErrorMessage, aiText, getAnthropic, imageBlock, MODELS, pdfBlock } from "../utils/anthropic";
import { sanitizeVoiceHistory } from "../utils/voice-history";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n" +
    "4 0 obj<</Length 44>>stream\nBT /F1 18 Tf 20 60 Td (Invoice total 4217) Tj ET\nendstream endobj\n" +
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n",
).toString("base64");

async function voiceRoundTrip(): Promise<string> {
  const tools: Anthropic.Tool[] = [
    {
      name: "find_contact",
      description: "Look up a contact by name.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  ];
  const ask = (messages: Anthropic.MessageParam[]) =>
    getAnthropic().messages.create({
      model: MODELS.fast,
      max_tokens: 2048,
      output_config: { effort: "low" },
      system: "You are a CRM assistant. Use find_contact when given a name.",
      tools,
      messages,
    });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: "Find the contact Sam Example." }];
  const first = await ask(messages);
  messages.push({ role: "assistant", content: first.content });
  const call = first.content.find((b) => b.type === "tool_use");
  if (first.stop_reason !== "tool_use" || !call) throw new Error(`no tool call: ${first.stop_reason}`);
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: call.id, content: '{"id":"c1","full_name":"Sam Example"}' }],
  });
  const second = await ask(messages);
  messages.push({ role: "assistant", content: second.content });

  // The next turn, as it arrives from the browser with thinking stripped.
  const history = sanitizeVoiceHistory(JSON.parse(JSON.stringify(messages)));
  const third = await ask([...history, { role: "user", content: "What was their id?" }]);
  return `${third.stop_reason}: ${third.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")}`;
}

const CHECKS: [string, () => Promise<string>][] = [
  ["fast text (low effort)", () => aiText({ user: "Reply with the word ok.", thinking: false, maxTokens: 50 })],
  ["smart text (server fallback)", () => aiText({ model: MODELS.smart, user: "Reply with the word ok.", maxTokens: 50 })],
  [
    "fast web search",
    () =>
      aiText({
        user: 'Search once for the capital of Queensland, then reply only as JSON: {"capital":"..."}',
        web: true,
        thinking: false,
        maxTokens: 300,
      }),
  ],
  [
    "smart web search",
    () =>
      aiText({
        model: MODELS.smart,
        user: 'Search once for the RBA cash rate, then reply only as JSON: {"rate":number}',
        web: true,
        maxTokens: 300,
      }),
  ],
  [
    "PDF",
    () =>
      aiText({
        model: MODELS.extract,
        effort: "low",
        maxTokens: 100,
        messages: [
          { role: "user", content: [pdfBlock(PDF, "smoke.pdf"), { type: "text", text: "What is the invoice total?" }] },
        ],
      }),
  ],
  [
    "image",
    () =>
      aiText({
        model: MODELS.extract,
        effort: "low",
        maxTokens: 100,
        messages: [
          {
            role: "user",
            content: [imageBlock("image/png", PNG_1PX), { type: "text", text: "Describe this image in five words." }],
          },
        ],
      }),
  ],
  ["voice tool loop + stripped history", voiceRoundTrip],
];

async function main() {
  let failed = 0;
  for (const [name, run] of CHECKS) {
    const t0 = Date.now();
    const secs = () => ((Date.now() - t0) / 1000).toFixed(1);
    try {
      const out = await run();
      console.log(`PASS ${name} (${secs()}s): ${out.slice(0, 160).replace(/\s+/g, " ")}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${name} (${secs()}s): ${e instanceof Error ? e.message : String(e)}`);
      aiErrorMessage(e);
    }
  }
  console.log(failed ? `${failed} of ${CHECKS.length} failed` : `All ${CHECKS.length} passed`);
  process.exit(failed ? 1 : 0);
}

void main();
