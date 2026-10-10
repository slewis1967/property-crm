/** Settings: give the voice assistant extra instructions. */
export default {
  start: "/settings",
  steps: [
    {
      say: "This video shows how to give the voice assistant extra instructions. In Settings, find AI instructions at the top of the page.",
      do: async (h) => h.point('h2:text-is("AI instructions")', 1300),
    },
    {
      say: "Type your instructions in the large box, as plain sentences.",
      do: async (h) =>
        h.type('textarea[placeholder^="e.g."]', "When booking callbacks, suggest weekday mornings first. Keep a warm, plain tone."),
    },
    {
      say: "The counter underneath shows how much room is left.",
      do: async (h) => h.point("text=/\\d+\\/4000/", 1300),
    },
    {
      say: "Click Save instructions.",
      do: async (h) => {
        await h.click('button:has-text("Save instructions")');
        await h.page.waitForSelector('span:text-is("Saved")');
      },
    },
    {
      say: "Saved appears beside the button. The assistant follows the instructions from its next reply.",
      do: async (h) => h.point('span:text-is("Saved")', 1500),
    },
    {
      say: "To remove them, clear the box and save again. The assistant still asks before it sends any text message or email.",
      do: async (h) => h.point('textarea[placeholder^="e.g."]', 1500),
    },
  ],
};
