/**
 * Broadcast: write an email to a tagged group and send it.
 * The wording check and the queueing need outside services the demo does not
 * have, so the browser's POST /api/broadcast is answered here with a made-up
 * success. Nothing is queued or sent.
 */
import { json } from "../lib-crm-b.mjs";

export default {
  start: "/broadcast",
  steps: [
    {
      say: "This video shows how to send one email to a group of contacts.",
      do: async (h) => {
        await h.page.route("**/api/broadcast", (r) =>
          r.request().method() === "POST"
            ? r.fulfill(json({ ok: true, sequence_id: "demo", slug: "broadcast-new-completed-homes", enrolled_count: 5, audience: "Tag: investor", eta_minutes: 5 }))
            : r.continue(),
        );
        await h.pause(600);
      },
    },
    {
      say: "First choose which business the email comes from. Make sure it is the right brand for these people.",
      do: async (h) => h.point('select[aria-label="Sending business"]', 1500),
    },
    {
      say: "Then choose who gets it. Pick all contacts, or a tag. The number beside it is how many people will be emailed.",
      do: async (h) => {
        await h.select('select:has(option[value="__all__"])', "investor");
        await h.point("span:has-text('tag: investor')", 1200);
      },
    },
    {
      say: "If you choose all contacts, you must tick the confirm box first. People who have unsubscribed are always left out.",
      do: async (h) => h.point("text=already opted", 1200),
    },
    {
      say: "Type the subject.",
      do: async (h) => h.type('input[placeholder^="e.g. New SDA"]', "New completed homes this month"),
    },
    {
      say: "Type or paste the email into the body box. The unsubscribe footer is added for you.",
      do: async (h) => {
        await h.click("textarea >> nth=0");
        await h.page.keyboard.type(
          "<p>Hi {{contact.first_name}},</p><p>Three completed homes have just been released. Reply to this email if you would like the details.</p>",
          { delay: 22 },
        );
      },
    },
    {
      say: "Check how it looks in the preview underneath.",
      do: async (h) => h.point("text=Preview (HTML body only", 1500),
    },
    {
      say: "Click Review and send. The wording is checked first. If anything is flagged you can edit it. If it passes, the emails are queued straight away and cannot be cancelled.",
      do: async (h) => {
        await h.click('button:has-text("Review & send to")');
        await h.page.waitForSelector("text=Broadcast queued");
      },
    },
    {
      say: "You will see Broadcast queued. Real emails start going out within about five minutes.",
      do: async (h) => h.point('h1:has-text("Broadcast queued")', 1500),
    },
  ],
};
