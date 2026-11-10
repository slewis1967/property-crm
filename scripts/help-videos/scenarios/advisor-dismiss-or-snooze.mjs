/**
 * Advisor: dismiss one recommendation and snooze another. Uses seeded demo
 * recommendations. The two small browser boxes (reason, number of days) are
 * answered automatically by the recorder and do not appear in the video.
 */
const card = (title) => `div.bg-white.border.rounded-xl:has(h3:has-text("${title}"))`;
const DISMISS = card("Post a weekly suburb snapshot on social media");
const SNOOZE = card("Send a reminder the day before each appointment");

export default {
  start: "/advisor",
  steps: [
    {
      say: "This is the Advisor page. Here is how to dismiss a recommendation, or put one off until later.",
      do: async (h) =>
        h.page.evaluate(() => {
          window.prompt = (msg, def) => (String(msg).startsWith("Why") ? "Not a priority this quarter" : def || "7");
        }),
    },
    {
      say: "Click the recommendation to open it.",
      do: async (h) => h.click(`${DISMISS} h3`),
    },
    {
      say: "To reject it, click Dismiss.",
      do: async (h) => h.point(`${DISMISS} button:has-text("Dismiss")`, 1000),
    },
    {
      say: "A box asks why. Type your reason and click OK. The reason helps the advisor make better suggestions next time.",
      do: async (h) => {
        await h.click(`${DISMISS} button:has-text("Dismiss")`);
        await h.page.waitForSelector(DISMISS, { state: "detached" });
      },
    },
    {
      say: "To put a recommendation off instead, open it and click Snooze.",
      do: async (h) => {
        await h.click(`${SNOOZE} h3`);
        await h.point(`${SNOOZE} button:has-text("Snooze")`, 1000);
      },
    },
    {
      say: "A box asks for the number of days and suggests seven. Click OK, and it leaves the list until then.",
      do: async (h) => {
        await h.click(`${SNOOZE} button:has-text("Snooze")`);
        await h.page.waitForSelector(SNOOZE, { state: "detached" });
        await h.pause(600);
      },
    },
    {
      say: "Dismissed recommendations are kept under Dismissed in the top row.",
      do: async (h) => {
        await h.click('button:text-is("Dismissed")');
        await h.point('h3:has-text("Post a weekly suburb snapshot")', 1200);
      },
    },
  ],
};
