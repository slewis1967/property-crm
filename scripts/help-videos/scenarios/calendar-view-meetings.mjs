/** Calendar: look through the month and week, and open a meeting. Reads only. */
export default {
  start: "/calendar",
  steps: [
    {
      say: "This video shows how to see what meetings are coming up. Click Calendar in the menu on the left.",
      do: async (h) => h.point('nav a[href="/calendar"]', 1200),
    },
    {
      say: "Click Week at the top right to list each day's meetings in order.",
      do: async (h) => {
        await h.click('button:text-is("week")');
        await h.pause(1200);
      },
    },
    {
      say: "Click Month to go back to the whole month.",
      do: async (h) => h.click('button:text-is("month")'),
    },
    {
      say: "Use the arrows to move back and forward. Click Today to jump back to now.",
      do: async (h) => {
        await h.click('button[aria-label="Next"]');
        await h.pause(900);
        await h.click('button:text-is("Today")');
        await h.pause(600);
      },
    },
    {
      say: "Click a meeting to open its details.",
      do: async (h) => h.click('button[title="Discovery call"]'),
    },
    {
      say: "You will see the time, the client, who is hosting and any notes.",
      do: async (h) => h.point('h3:has-text("Discovery call")', 1500),
    },
    {
      say: "Click the client's name to open their contact page. If it is a video meeting, click Join video meeting and the call opens in a new tab.",
      do: async (h) => {
        await h.point('a:has-text("Olivia Bennett")', 1300);
        await h.point('a:has-text("Join video meeting")', 1500);
      },
    },
    {
      say: "Click the cross to close the details.",
      do: async (h) => h.click('div.fixed button:has-text("✕")'),
    },
  ],
};
