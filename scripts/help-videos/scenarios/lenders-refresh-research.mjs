/**
 * Lender Policy: refresh a lender's research.
 *
 * The real button asks an AI service to re-read the lender's public pages. The
 * demo has no key for it, so the browser's call to /api/lenders/research is
 * answered here with a made-up result (the counts in the blue message are
 * invented and the record itself is not changed). No client records on screen.
 */
export default {
  start: "/lenders/macquarie-bank",
  steps: [
    {
      say: "This is a lender's record in Lender Policy. Here is how to refresh its research when it looks out of date.",
      do: async (h) => {
        await h.page.route("**/api/lenders/research", async (route) => {
          await new Promise((r) => setTimeout(r, 3500));
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({ ok: true, accepted: 6, rejected: 1, applied: true }),
          });
        });
        await h.pause(400);
      },
    },
    {
      say: "First check the Researched date in the grey bar. It tells you how old the record is.",
      do: async (h) => h.point("span:has-text('Researched ')", 1800),
    },
    {
      say: "Click Re-research from public sources at the top right.",
      do: async (h) => h.click('button:has-text("Re-research from public sources")'),
    },
    {
      say: "The button shows Researching while the CRM re-reads the lender's public policy pages. This can take a minute.",
      do: async (h) => h.page.waitForSelector("div.bg-blue-50.border-blue-200", { timeout: 20000 }),
    },
    {
      say: "A blue message tells you how many figures were accepted and how many were rejected. New figures are saved as soon as it finishes.",
      do: async (h) => h.point("div.bg-blue-50.border-blue-200", 2200),
    },
    {
      say: "Then read through the figures. Anything you have confirmed yourself is kept.",
      do: async (h) => {
        await h.scroll(420);
        await h.pause(1200);
      },
    },
  ],
};
