/**
 * Inbox: open a conversation and reply.
 * The demo cannot send email, so the browser's send call (POST /api/emails) is
 * answered here with a made-up success. The sender line on the pop-up is also
 * swapped for the demo user (see lib-crm-b.mjs).
 */
import { json, showDemoSender } from "../lib-crm-b.mjs";

const SUBJECT = "Question about the Chermside house and land package";

export default {
  start: "/inbox",
  steps: [
    {
      say: "This video shows how to read and reply to an email. A blue new badge marks a message that is waiting for a reply.",
      do: async (h) => {
        await h.page.route("**/api/emails", (r) =>
          r.request().method() === "POST" ? r.fulfill(json({ ok: true, email: { id: "demo-sent" } })) : r.continue(),
        );
        await h.point("span:has-text('1 new') >> nth=0", 1200);
      },
    },
    {
      say: "Click a conversation to open it.",
      do: async (h) => h.click(`p:has-text("${SUBJECT}")`),
    },
    {
      say: "The messages in the conversation open underneath.",
      do: async (h) => h.point("div.email-body >> nth=0", 1500),
    },
    {
      say: "Click Reply on the message you are answering.",
      do: async (h) => {
        await h.click('button[title="Reply to this message"]');
        await h.page.waitForSelector("text=Compose Email");
        await showDemoSender(h.page);
      },
    },
    {
      say: "The address and subject are filled in for you. Type your reply in the Message box.",
      do: async (h) => {
        await h.click("textarea");
        await h.page.keyboard.press("Control+Home");
        await h.page.keyboard.type(
          "Hi Olivia, yes, the package price includes the driveway and fencing. The land is due to register in March.",
          { delay: 40 },
        );
      },
    },
    {
      say: "You can click AI Draft if you would like a first draft written for you.",
      do: async (h) => h.point('button:has-text("AI Draft")', 1200),
    },
    {
      say: "Click Send. The email goes straight away and cannot be recalled.",
      do: async (h) => {
        await h.click('div.fixed button:text-is("Send")');
        await h.page.waitForSelector("text=Compose Email", { state: "detached" });
      },
    },
    {
      say: "To see the client's whole record, click Open contact for full context.",
      do: async (h) => h.point("text=Open contact for full context", 1500),
    },
  ],
};
