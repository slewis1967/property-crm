/**
 * Calendar: book a meeting from the client's contact page.
 * Booking emails the client an invite, which the demo cannot do, so the
 * browser's POST /api/appointments is answered with a made-up success (nothing
 * is saved or sent). The host list is built into the CRM with real staff, so on
 * screen it is swapped for the demo user. AI panels get made-up text.
 */
import { json, mockContactAi, showDemoSender } from "../lib-crm-b.mjs";

function inDays(n) {
  const d = new Date(Date.now() + n * 86400_000);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default {
  start: "/calendar",
  steps: [
    {
      say: "This video shows how to book a new meeting. Meetings are booked from the client's contact page, not from the Calendar itself.",
      do: async (h) => {
        await mockContactAi(h.page);
        await h.page.route("**/api/appointments", (r) =>
          r.request().method() === "POST"
            ? r.fulfill(json({ ok: true, video_link: "http://localhost:3111/join/demo-link", invite_requested: true, invite_sent: true }))
            : r.continue(),
        );
        await h.pause(500);
      },
    },
    {
      say: "Click Contacts in the menu and open the client.",
      do: async (h) => {
        await h.click('nav a[href="/contacts"]');
        await h.click('p:text-is("Grace Lee")');
        await h.page.waitForURL(/\/contacts\/d0000000/);
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Click Schedule meeting at the top of their page.",
      do: async (h) => {
        await h.click('button:has-text("Schedule meeting")');
        await h.page.waitForSelector("text=Meeting host");
        await showDemoSender(h.page);
      },
    },
    {
      say: "Choose the meeting host, the date, the start time and how long it runs.",
      do: async (h) => {
        await h.point("form select", 700);
        await h.click('input[type="date"]');
        await h.page.locator('input[type="date"]').fill(inDays(6));
        await h.click('input[type="time"]');
        await h.page.locator('input[type="time"]').fill("10:30");
        await h.click('button:text-is("45 min")');
      },
    },
    {
      say: "The title and the client's email are filled in for you. Change them if you need to.",
      do: async (h) => h.point('form input[type="email"]', 1200),
    },
    {
      say: "Leave Send invite email ticked and the client is emailed an invite with the video link. Untick it if you do not want them emailed.",
      do: async (h) => {
        // The form is taller than the screen. Leave room under it so the tick
        // box and the button are not hidden behind the caption.
        await h.page.evaluate(() => {
          const wrap = document.querySelector("div.fixed.inset-0.overflow-y-auto");
          if (wrap) {
            wrap.style.paddingBottom = "170px";
            wrap.scrollTop = wrap.scrollHeight;
          }
        });
        await h.point('label:has-text("Send invite email to attendee")', 1800);
      },
    },
    {
      say: "Click Schedule meeting.",
      do: async (h) => {
        await h.click('form button:has-text("Schedule meeting")');
        await h.page.waitForSelector("text=Meeting scheduled");
      },
    },
    {
      say: "Read the message. If it says the invite was not sent, the meeting is still saved, but you need to send the link to the client yourself.",
      do: async (h) => h.point("text=Meeting scheduled", 1500),
    },
    {
      say: "Click Close. The meeting now shows on the Calendar.",
      do: async (h) => h.click('button:text-is("Close")'),
    },
  ],
};
