/**
 * Video calls: find a booked video meeting and its Join button.
 * The demo has no video server, so the call itself is NOT shown: Join video
 * meeting is pointed at, not clicked.
 */
export default {
  start: "/calendar",
  steps: [
    {
      say: "This video shows how to join a video meeting that is already booked. Start on the Calendar.",
      do: async (h) => h.point('nav a[href="/calendar"]', 1200),
    },
    {
      say: "Video meetings have a small camera beside the title.",
      do: async (h) => h.point('button[title="Discovery call"]', 1500),
    },
    {
      say: "Click the meeting to open its details.",
      do: async (h) => {
        await h.click('button[title="Discovery call"]');
        await h.page.waitForSelector('a:has-text("Join video meeting")');
      },
    },
    {
      say: "Click Join video meeting. The call opens in a new tab.",
      do: async (h) => h.point('a:has-text("Join video meeting")', 2000),
    },
    {
      say: "The client joins with the link in their invite email. Always use this button yourself, not the client's link.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Allow the camera and microphone if your browser asks.",
      do: async (h) => h.pause(500),
    },
  ],
};
