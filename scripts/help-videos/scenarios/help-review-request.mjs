/**
 * Approve or decline a requested guide. Needs seed/10-help-requests.sql, which
 * also undoes what this recording changes. Every request and person is invented.
 */
const draftCard = 'div.rounded-xl:has-text("one buyer type to another")';
const flaggedCard = 'div.rounded-xl:has-text("without doing the screening")';

const scenario = {
  start: "/help-requests",
  steps: [
    {
      say: "This video shows how a super admin approves or declines a guide that someone has asked for.",
      do: async (h) => h.point('h1:has-text("Help requests")', 1400),
    },
    {
      say: "Each card under Waiting for you is one request. Read the question, then what the checks found.",
      do: async (h) => {
        await h.point("text=one buyer type to another", 1300);
        await h.point("text=What the checks found >> nth=0", 1300);
      },
    },
    {
      say: "Correct the draft if it needs it. Steps go one per line, with any extra detail after an upright bar.",
      do: async (h) => {
        const steps = `${draftCard} >> textarea`;
        await h.click(steps);
        await h.page.locator(steps).press("Control+End");
        await h.page.keyboard.type(" | The change shows straight away.", { delay: 35 });
        await h.pause(500);
      },
    },
    {
      say: "Click Approve and publish. The guide now shows in the help panel for everyone, under the page it was asked from.",
      do: async (h) => {
        await h.click(`${draftCard} >> button:has-text("Approve and publish")`);
        await h.page.waitForSelector("text=/Already decided \\(3\\)/");
        await h.pause(900);
      },
    },
    {
      say: "This one was flagged by the checks, because it asks how to skip a compliance step.",
      do: async (h) => h.point(`${flaggedCard} >> text=What the checks found`, 1700),
    },
    {
      say: "To turn a request down, type a short reason. The person who asked will see it.",
      do: async (h) =>
        h.type(`${flaggedCard} >> input[placeholder^="Reason for declining"]`, "Screening cannot be skipped. See the CDD guides."),
    },
    {
      say: "Then click Decline.",
      do: async (h) => {
        await h.click(`${flaggedCard} >> button:has-text("Decline")`);
        await h.page.waitForSelector("text=/Already decided \\(4\\)/");
        await h.pause(700);
      },
    },
    {
      say: "Decided requests move to the bottom. Use Take down there to withdraw a published guide.",
      do: async (h) => {
        await h.scroll(900);
        await h.point('text="Take down" >> nth=0', 1600);
      },
    },
  ],
};
export default scenario;
