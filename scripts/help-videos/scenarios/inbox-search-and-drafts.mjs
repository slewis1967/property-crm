/**
 * Inbox: search mail, look at Sent and reopen a draft. Nothing is sent.
 * The signature the CRM builds in is a real staff member's, so any request for
 * it (GET /api/mail/signature) is answered with a made-up one.
 */
import { json } from "../lib-crm-b.mjs";

export default {
  start: "/inbox",
  steps: [
    {
      say: "This video shows how to search your mail and pick up a message you started earlier.",
      do: async (h) => {
        await h.page.route("**/api/mail/signature*", (r) =>
          r.fulfill(json({ ok: true, html: "<p><strong>Demo Broker</strong><br>demo@example.com</p>", text: "Demo Broker", identity: "nextkey", user_email: "demo@example.com" })),
        );
        await h.pause(400);
      },
    },
    {
      say: "Type in the Search mail box. Results appear after a moment. It searches the list you are in, such as Inbox or Sent.",
      do: async (h) => {
        await h.type('input[placeholder^="Search mail"]', "price list");
        await h.page.waitForURL(/search=/);
        await h.page.waitForSelector("text=Results for");
        await h.pause(800);
      },
    },
    {
      say: "Click the cross in the search box to clear the search.",
      do: async (h) => {
        await h.click('button[title="Clear search"]');
        await h.page.waitForSelector("text=Unread and recent inbound mail");
      },
    },
    {
      say: "Click Sent on the left to see emails you have sent.",
      do: async (h) => {
        await h.click('aside a:has-text("Sent")');
        await h.page.waitForSelector("text=Outbound mail from this account");
        await h.pause(700);
      },
    },
    {
      say: "Click Drafts on the left to see unfinished messages.",
      do: async (h) => {
        await h.click('aside a:has-text("Drafts")');
        await h.page.waitForSelector("text=Completed homes available this month");
      },
    },
    {
      say: "The bin icon on a draft throws it away. A discarded draft cannot be recovered.",
      do: async (h) => h.point('button[title="Discard draft"]', 1500),
    },
    {
      say: "Click a draft to open it and keep writing.",
      do: async (h) => {
        await h.click("text=Completed homes available this month");
        await h.page.waitForURL(/compose\?draft=/);
        await h.page.waitForSelector("#from-identity");
        await h.pause(1200);
      },
    },
  ],
};
