/**
 * Paid Accounts: refresh balances and send the digest email now.
 *
 * The demo CRM holds no supplier or email keys, so both buttons would fail.
 * The browser's two calls (/api/paid-services/balances and
 * /api/paid-services/alerts) are answered inside this scenario with made-up
 * successes, so the video shows the messages staff would see. No email is sent.
 */
const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
export default {
  start: "/paid-services",
  steps: [
    {
      say: "This video shows how to refresh balances and send the digest email straight away. Find the Daily check bar, under the four summary tiles.",
      do: async (h) => {
        await h.page.route("**/api/paid-services/balances", (route) =>
          route.fulfill(
            json({
              ok: true,
              result: { ok: true, checked: 1, failed: 0, outcomes: [{ name: "Example SMS Credits", ok: true, remaining: 12, unit: "AUD" }] },
            }),
          ),
        );
        await h.page.route("**/api/paid-services/alerts", (route) =>
          route.fulfill(json({ ok: true, result: { sent: true, flagged: 3 } })),
        );
        await h.point('strong:text-is("Daily check:")', 1500);
      },
    },
    {
      say: "It shows when the automatic check last ran.",
      do: async (h) => h.point("text=/last ran/", 1200),
    },
    {
      say: "Click Refresh balances to read the current prepaid balances.",
      do: async (h) => {
        await h.click('button:has-text("Refresh balances")');
        await h.page.waitForSelector("text=Read Example SMS Credits");
      },
    },
    {
      say: "A green message shows what was read.",
      do: async (h) => h.point("text=Read Example SMS Credits", 1400),
    },
    {
      say: "To email the attention list now, click Send digest now. A box asks you to confirm and names the address it will go to. Click OK.",
      do: async (h) => {
        await h.point('button:has-text("Send digest now")', 2500);
        await h.click('button:has-text("Send digest now")');
        await h.page.waitForSelector("text=Digest emailed to");
      },
    },
    {
      say: "This sends a real email straight away and cannot be undone. The message confirms where it went.",
      do: async (h) => h.point("text=Digest emailed to", 1600),
    },
    {
      say: "If nothing needs attention, no email is sent, and the message tells you so.",
      do: async (h) => h.pause(600),
    },
  ],
};
