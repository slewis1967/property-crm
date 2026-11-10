/** Overview of Calendar: a tour of the page. Reads only. */
export default {
  start: "/calendar",
  steps: [
    {
      say: "This is the Calendar. It shows every meeting booked in the CRM, by month or by week.",
      do: async (h) => h.point("h1", 1300),
    },
    {
      say: "The arrows move back and forward. Today brings you back to now.",
      do: async (h) => {
        await h.point('button[aria-label="Next"]', 800);
        await h.point('button:text-is("Today")', 800);
      },
    },
    {
      say: "Month shows the whole month as a grid. Week lists each day's meetings in order.",
      do: async (h) => {
        await h.click('button:text-is("week")');
        await h.pause(1300);
        await h.click('button:text-is("month")');
      },
    },
    {
      say: "Each day shows its meetings with the start time. Today has a teal circle around the date.",
      do: async (h) => h.point("span.bg-teal-600", 1600),
    },
    {
      say: "Teal meetings are coming up, grey ones have passed, and red with a line through it is cancelled. A small camera means a video meeting.",
      do: async (h) => {
        await h.point('button[title="Discovery call"]', 1000);
        await h.point('button[title="Suburb report review"]', 1000);
        await h.point('button[title="Deposit planning call"]', 1000);
      },
    },
    {
      say: "Click a meeting to see the time, the client, the host and any notes.",
      do: async (h) => {
        await h.click('button[title="Discovery call"]');
        await h.point('h3:has-text("Discovery call")', 1500);
        await h.click('div.fixed button:has-text("✕")');
      },
    },
    {
      say: "Meetings are booked with Schedule meeting on a contact or opportunity. The same meetings are listed on Appointments.",
      do: async (h) => h.point('nav a[href="/appointments"]', 1800),
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
