/** CDD Cases: start a new case for a buyer and fill it in. Demo data only. */
import { hideVoiceButton, setDate } from "./lib/compliance-stock.mjs";

const field = (label) => `label:has-text("${label}") input`;

export default {
  start: "/aml",
  steps: [
    {
      say: "This video shows how to start a customer due diligence case for a buyer or seller.",
      do: async (h) => {
        await hideVoiceButton(h);
        await h.pause(500);
      },
    },
    {
      say: "Next to New CDD case, choose the party type. You cannot change it later.",
      do: async (h) => h.select("main select >> nth=0", "individual"),
    },
    {
      say: "Click Start CDD. The new case opens straight away.",
      do: async (h) => {
        await h.click('button:has-text("Start CDD")');
        await h.page.waitForURL(/\/aml\/[0-9a-f-]{36}$/);
        await h.page.waitForSelector("text=CDD completeness");
      },
    },
    {
      say: "Choose their role in the transaction.",
      do: async (h) => h.select('label:has-text("Role in transaction") select', "buyer"),
    },
    {
      say: "Fill in the Identity section with their legal name, date of birth, address and identity document.",
      do: async (h) => {
        await h.type(field("Full legal name"), "Olivia Bennett");
        await setDate(h, field("Date of birth"), "1993-04-18");
        await h.type('input[placeholder="Street address"]', "14 Rosella Street");
        await h.page.locator('input[placeholder="Suburb"]').fill("Chermside");
        await h.page.locator('input[placeholder="State"]').fill("QLD");
        await h.page.locator('input[placeholder="Postcode"]').fill("4032");
        await h.type('input[placeholder="Document number"]', "DL1029384");
      },
    },
    {
      say: "Under Source of funds, choose a category and tick the box once you have the evidence.",
      do: async (h) => {
        await h.select('label:has-text("Category") select', "savings");
        await h.click('label:has-text("Source of funds evidenced") input');
      },
    },
    {
      say: "Tick anything that applies under Risk assessment. The rating underneath updates by itself.",
      do: async (h) => h.point("text=Derived rating", 1400),
    },
    {
      say: "Check the CDD completeness box near the top. It lists anything still missing.",
      do: async (h) => h.point('h2:has-text("CDD completeness")', 1400),
    },
    {
      say: "Click Save in the bar at the bottom. The case also saves by itself while you type.",
      do: async (h) => {
        await h.click('button:text-is("Save")');
        await h.pause(900);
      },
    },
  ],
};
