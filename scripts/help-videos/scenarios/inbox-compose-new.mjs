/**
 * Inbox: write and send a new email.
 * The draft saves for real (demo database; the seed clears drafts). The demo
 * cannot send email, so the browser's send call (POST /api/mail/drafts/<id>/send)
 * is answered with a made-up success. The signature the CRM builds in is a real
 * staff member's, so the browser's GET /api/mail/signature is answered with a
 * made-up one. Attaching a file is pointed at, not done.
 */
import { json } from "../lib-crm-b.mjs";

const SIGNATURE =
  '<p style="margin:0"><strong>Demo Broker</strong><br>NextKey Property Strategists<br>demo@example.com · 0491 570 100</p>';

export default {
  start: "/inbox",
  steps: [
    {
      say: "This video shows how to write and send a new email from the CRM.",
      do: async (h) => {
        await h.page.route("**/api/mail/signature*", (r) =>
          r.fulfill(json({ ok: true, html: SIGNATURE, text: "Demo Broker", identity: "nextkey", user_email: "demo@example.com" })),
        );
        await h.page.route("**/api/mail/drafts/*/send", (r) => r.fulfill(json({ ok: true })));
        await h.pause(400);
      },
    },
    {
      say: "Click Compose at the top of the mail list on the left.",
      do: async (h) => {
        await h.click('a:has-text("Compose")');
        await h.page.waitForURL(/\/inbox\/compose/);
        await h.page.waitForSelector("#from-identity");
        await h.pause(600);
      },
    },
    {
      say: "Choose which business to send from. The signature in the message changes to match.",
      do: async (h) => h.point("#from-identity", 1500),
    },
    {
      say: "Type the address in the To box. Separate several addresses with commas. Click C c or B c c to add copies.",
      do: async (h) => {
        await h.type('input[placeholder^="name@example.com"] >> nth=0', "mia.anderson@example.com");
        await h.point('button:has-text("+ Cc / Bcc")', 800);
      },
    },
    {
      say: "Type a subject, then write your message in the large box, above the signature.",
      do: async (h) => {
        await h.type('input[placeholder="Subject"]', "Properties around Toowoomba");
        const body = h.page.locator("div[contenteditable]");
        const box = await body.boundingBox();
        await h.page.mouse.move(box.x + 120, box.y + 18, { steps: 15 });
        await h.page.mouse.click(box.x + 120, box.y + 18);
        await h.page.keyboard.press("Control+Home");
        await h.page.keyboard.type("Hi Mia, I have three properties around Toowoomba that fit your budget. Are you free for a call on Monday?", { delay: 28 });
      },
    },
    {
      say: "Use the buttons above the message for bold, italic and underline. Click the paperclip to attach files.",
      do: async (h) => {
        await h.point('button[title="Bold (Ctrl+B)"]', 700);
        await h.point('button[title="Attach files"]', 1300);
      },
    },
    {
      say: "Your work saves as a draft while you type, so you can leave and finish it later. Click Discard if you change your mind.",
      do: async (h) => h.point('button:text-is("Discard")', 1500),
    },
    {
      say: "Click Send. The email goes straight away and cannot be recalled. You are taken to Sent.",
      do: async (h) => {
        await h.click('button:text-is("Send")');
        await h.page.waitForURL(/view=sent/);
        await h.page.waitForLoadState("networkidle");
      },
    },
  ],
};
