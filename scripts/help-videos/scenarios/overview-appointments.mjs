/** Overview of Appointments: a tour of the page. Reads only. */
export default {
  start: "/appointments",
  steps: [
    {
      say: "This is Appointments. It lists the same meetings as the Calendar, sorted into upcoming, past and cancelled.",
      do: async (h) => h.point("h1", 1300),
    },
    {
      say: "The four boxes count upcoming meetings, meetings and cancellations in the past thirty days, and old archive bookings.",
      do: async (h) => {
        await h.point("p:text-is('Upcoming')", 800);
        await h.point("p:text-is('Past (30d)')", 700);
        await h.point("p:text-is('Cancelled (30d)')", 700);
        await h.point("p:text-is('Archive (recent 100)')", 700);
      },
    },
    {
      say: "Upcoming lists the meetings still to come, soonest first, with the client, the host and the time.",
      do: async (h) => h.point('span:has-text("Discovery call")', 1700),
    },
    {
      say: "Each one has Join meeting, which opens the video call, and Brief, which writes a short summary of the client.",
      do: async (h) => {
        await h.point('a:has-text("Join meeting") >> nth=0', 1000);
        await h.point('button:has-text("Brief") >> nth=0', 1000);
      },
    },
    {
      say: "Further down, Past thirty days shows meetings that have already happened.",
      do: async (h) => h.point('h2:has-text("Past 30 days")', 1500),
    },
    {
      say: "Cancelled shows meetings that were called off, with the reason if one was given.",
      do: async (h) => {
        await h.point('h2:has-text("Cancelled")', 900);
        await h.point("text=Cancelled: Client asked to move to next month", 1200);
      },
    },
    {
      say: "Every client name is a link to their page in Contacts, which is where new meetings are booked.",
      do: async (h) => h.point('a:has-text("Noah Patel")', 1600),
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
