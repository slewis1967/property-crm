/** Brain: add a memory. Saves a real row in the demo database (the seed file removes it again). */
const FORM = "form.bg-gray-50";

export default {
  start: "/brain",
  steps: [
    {
      say: "This is the Brain, the long term memory of the CRM. Here is how to add something for the AI to remember.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click New memory, next to the Search button. A form opens underneath.",
      do: async (h) => h.click('button:has-text("New memory")'),
    },
    {
      say: "Choose the type from the dropdown on the left. The choices are knowledge, learning and playbook.",
      do: async (h) => h.select(`${FORM} select`, "knowledge"),
    },
    {
      say: "Type a clear one line fact in the title box.",
      do: async (h) => h.type(`${FORM} input >> nth=0`, "Example Ridge Builders pay commission in two instalments"),
    },
    {
      say: "Type the full explanation in the details box.",
      do: async (h) =>
        h.type(`${FORM} textarea`, "Half is paid when the contract goes unconditional and half at settlement."),
    },
    {
      say: "Add tags if you like, separated by commas.",
      do: async (h) => h.type(`${FORM} input[placeholder^="comma"]`, "commission, builders"),
    },
    {
      say: "Click Save memory. The new memory appears at the top of the list.",
      do: async (h) => {
        await h.click(`${FORM} button:has-text("Save memory")`);
        await h.page.waitForSelector(FORM, { state: "detached" });
        await h.point('h3:has-text("Example Ridge Builders pay commission")', 1500);
      },
    },
  ],
};
