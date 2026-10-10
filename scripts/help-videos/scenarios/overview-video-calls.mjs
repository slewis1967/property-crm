/**
 * Overview of Video calls: a tour of the places a call is started or joined.
 * The demo has no video server, so no call is opened: every button is pointed
 * at, not clicked. The AI panels on the contact page are answered with made-up text.
 */
import { mockContactAi } from "../lib-crm-b.mjs";

export default {
  start: "/contacts",
  steps: [
    {
      say: "This is a tour of video calls. There is no video page in the menu. Calls are started from a contact, and joined from a booked meeting.",
      do: async (h) => {
        await mockContactAi(h.page);
        await h.pause(400);
      },
    },
    {
      say: "Open a contact. The Video call button at the top of their page opens a call with them in a new tab.",
      do: async (h) => {
        await h.click('p:text-is("Olivia Bennett")');
        await h.page.waitForURL(/\/contacts\/d0000000/);
        await h.page.waitForLoadState("networkidle");
        await h.point('a:has-text("Video call")', 1800);
      },
    },
    {
      say: "Guest link copies a joining link you can send to the client, so they can join without logging in.",
      do: async (h) => h.point('button:has-text("Guest link")', 1800),
    },
    {
      say: "Schedule meeting books a meeting for later, and emails the client an invite with a video link.",
      do: async (h) => h.point('button:has-text("Schedule meeting")', 1800),
    },
    {
      say: "On the Calendar, a small camera marks a video meeting. Click it to find the Join video meeting button.",
      do: async (h) => {
        await h.click('nav a[href="/calendar"]');
        await h.click('button[title="Discovery call"]');
        await h.point('a:has-text("Join video meeting")', 1500);
        await h.click('div.fixed button:has-text("✕")');
      },
    },
    {
      say: "On Appointments, the same call can be opened with Join meeting in the Upcoming list.",
      do: async (h) => {
        await h.click('nav a[href="/appointments"]');
        await h.page.waitForSelector("h1:has-text('Appointments')");
        await h.point('a:has-text("Join meeting") >> nth=0', 1600);
      },
    },
    {
      say: "The call itself opens in its own tab with your camera and microphone. It needs a live call, so it is not shown here.",
      do: async (h) => h.pause(400),
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
