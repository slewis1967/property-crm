/**
 * Contacts: edit a contact, add a note, send an email.
 * Edit and note are real saves (the seed puts Noah Patel back). The demo cannot
 * send email, so the browser's POST /api/emails is answered with a made-up
 * success, the AI panels get made-up text, and the sender line on the email
 * pop-up is swapped for the demo user (see lib-crm-b.mjs).
 */
import { json, mockContactAi, showDemoSender } from "../lib-crm-b.mjs";

const TIMEFRAME = 'div:has(> label:text-is("Timeframe")) input';

export default {
  start: "/contacts",
  steps: [
    {
      say: "This video shows how to update a contact, add a note and send them an email.",
      do: async (h) => {
        await mockContactAi(h.page);
        await h.page.route("**/api/emails", (r) =>
          r.request().method() === "POST" ? r.fulfill(json({ ok: true, email: { id: "demo-sent" } })) : r.continue(),
        );
        await h.pause(400);
      },
    },
    {
      say: "Click the contact's row to open their page.",
      do: async (h) => {
        await h.click('p:text-is("Noah Patel")');
        await h.page.waitForURL(/\/contacts\/d0000000/);
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Click Edit at the top, change the details, then click Save changes.",
      do: async (h) => {
        await h.click('button:has-text("Edit")');
        await h.click(TIMEFRAME);
        await h.page.locator(TIMEFRAME).fill("");
        await h.type(TIMEFRAME, "3-6 months");
        await h.click('button:has-text("Save changes")');
        await h.page.waitForSelector('button:has-text("Save changes")', { state: "detached" });
      },
    },
    {
      say: "To add a note, click the Notes tab and type in the box.",
      do: async (h) => {
        await h.click('button:text-is("Notes")');
        await h.click("textarea");
        await h.page.keyboard.press("Control+End");
        await h.page.keyboard.type(" Called today. Deposit is nearly ready.", { delay: 35 });
      },
    },
    {
      say: "Click Save. The note also saves by itself when you click outside the box.",
      do: async (h) => {
        await h.click('button:text-is("Save")');
        await h.page.waitForSelector("text=✓ Saved");
      },
    },
    {
      say: "To write to them, click Send Email at the top.",
      do: async (h) => {
        await h.click('button:has-text("Send Email")');
        await h.page.waitForSelector("text=Compose Email");
        await showDemoSender(h.page);
      },
    },
    {
      say: "Fill in the subject and message. Your signature is added for you.",
      do: async (h) => {
        await h.type('input[placeholder="Re: your enquiry"]', "Next steps for your deposit");
        await h.click("div.fixed textarea");
        await h.page.keyboard.type("Hi Noah, great to chat today. I will send the suburb reports through this week.", { delay: 30 });
      },
    },
    {
      say: "Click Send. The email goes straight away and cannot be recalled.",
      do: async (h) => {
        await h.click('div.fixed button:text-is("Send")');
        await h.page.waitForSelector("text=Compose Email", { state: "detached" });
      },
    },
  ],
};
