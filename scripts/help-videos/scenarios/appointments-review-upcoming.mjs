/** Appointments: read the counts and lists. Reads only. */
export default {
  start: "/appointments",
  steps: [
    {
      say: "This video shows how to check upcoming and recent meetings. Click Appointments in the menu on the left.",
      do: async (h) => h.point('nav a[href="/appointments"]', 1200),
    },
    {
      say: "The four boxes at the top count upcoming, past, cancelled and archive meetings.",
      do: async (h) => {
        await h.point("p:text-is('Upcoming')", 900);
        await h.point("p:text-is('Cancelled (30d)')", 900);
      },
    },
    {
      say: "The Upcoming list has the soonest meeting first. Each row shows the client, the host and the time.",
      do: async (h) => h.point('span:has-text("Discovery call")', 1500),
    },
    {
      say: "Click a client's name to open their contact page.",
      do: async (h) => h.point('a:has-text("Olivia Bennett")', 1500),
    },
    {
      say: "On a video meeting, click Join meeting to open the call in a new tab.",
      do: async (h) => h.point('a:has-text("Join meeting") >> nth=0', 1500),
    },
    {
      say: "Scroll down for the past thirty days and for cancelled meetings, with the reason they were cancelled.",
      do: async (h) => {
        await h.point('h2:has-text("Past 30 days")', 1200);
        await h.point('h2:has-text("Cancelled")', 900);
        await h.point("text=Cancelled: Client asked to move to next month", 1200);
      },
    },
    {
      say: "This page is for reading only. To book a meeting, open the client in Contacts and click Schedule meeting.",
      do: async (h) => h.pause(500),
    },
  ],
};
