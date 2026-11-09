/**
 * Video calls: get the client's joining link and find the Video call button.
 * The demo has no video server, so the call itself is NOT shown: the Video call
 * button is pointed at, not clicked. The Guest link button asks the server for
 * a signed link (needs the video keys), so that one browser call
 * (POST /api/livekit/guest-link) is answered here with a made-up link.
 * The AI panels on the contact page are answered with made-up text too.
 */
import { json, mockContactAi } from "../lib-crm-b.mjs";

export default {
  start: "/contacts",
  steps: [
    {
      say: "This video shows how to start a video call with a client.",
      do: async (h) => {
        await mockContactAi(h.page);
        await h.page.route("**/api/livekit/guest-link", (r) =>
          r.fulfill(json({ ok: true, url: "http://localhost:3111/join/demo-link" })),
        );
        await h.page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await h.pause(500);
      },
    },
    {
      say: "Open the client from the Contacts page.",
      do: async (h) => {
        await h.click('p:text-is("Olivia Bennett")');
        await h.page.waitForURL(/\/contacts\/d0000000/);
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Click Guest link at the top of their page. The button changes to Copied, and the client's joining link is ready to paste.",
      do: async (h) => {
        await h.click('button:has-text("Guest link")');
        await h.page.waitForSelector('button:has-text("Copied")');
      },
    },
    {
      say: "Paste the link into an email or text message to the client. The CRM does not send it for you.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Then click Video call. The call opens in a new tab. Always join this way yourself, not through the client's link.",
      do: async (h) => h.point('a:has-text("Video call")', 2200),
    },
    {
      say: "Allow the camera and microphone if your browser asks. When you leave the call, you come back to this page.",
      do: async (h) => h.pause(500),
    },
  ],
};
