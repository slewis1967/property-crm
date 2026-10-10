/** Program and Enrolment: add a staff training record. Demo data only. */
import { hideVoiceButton, centre, setDate, waitForApi } from "./lib/compliance-stock.mjs";

const S = 'section:has(h2:text-is("Staff training register"))';

export default {
  start: "/aml/program",
  steps: [
    {
      say: "This video shows how to add a staff training record.",
      do: async (h) => {
        await hideVoiceButton(h);
        await h.pause(400);
      },
    },
    {
      say: "Scroll down to the Staff training register.",
      do: async (h) => {
        await centre(h, S);
        await h.point(`${S} h2`, 1000);
      },
    },
    {
      say: "Type the staff member's name and email.",
      do: async (h) => {
        await h.type(`${S} input[placeholder="Staff name"]`, "Priya Desai");
        await h.type(`${S} input[placeholder="Email"]`, "priya.desai@example.com");
      },
    },
    {
      say: "Check the module box. Type over it if the training was a different module.",
      do: async (h) => h.point(`${S} input[placeholder="Module"]`, 1300),
    },
    {
      say: "Choose the date the training was completed.",
      do: async (h) => setDate(h, `${S} input[type="date"]`, "2026-10-06"),
    },
    {
      say: "Click Add. The record is saved straight away. You do not need to click Save program.",
      do: async (h) => {
        const done = waitForApi(h, "/api/aml/training", "POST");
        await h.click(`${S} button:text-is("Add")`);
        await done.catch(() => {});
        await h.point(`${S} tr:has-text("Priya Desai")`, 1200);
      },
    },
    {
      say: "To take a record out, click Remove on its row. It goes straight away, with no confirmation, and cannot be undone.",
      do: async (h) => h.point(`${S} tr:has-text("Priya Desai") button:has-text("Remove")`, 1800),
    },
  ],
};
