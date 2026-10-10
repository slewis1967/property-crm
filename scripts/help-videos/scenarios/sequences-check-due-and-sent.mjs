/** Sequences: what is due next and what was sent. The sequences and people are invented. */
export default {
  start: "/sequences",
  steps: [
    {
      say: "This video shows how to see which follow up messages are due, and which have been sent. On Sequences, scroll to Next 20 due steps.",
      do: async (h) => h.point('h2:has-text("Next 20 due steps")', 1400),
    },
    {
      say: "This lists who gets a message next, and when.",
      do: async (h) => h.point('th:text-is("Due at")', 1300),
    },
    {
      say: "Click a contact's name to open their record.",
      do: async (h) => {
        await h.click('h2:has-text("Next 20 due steps") + div a:has-text("Liam Nguyen")');
        await h.page.waitForURL(/\/contacts\//);
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Go back, then scroll to Recent step activity. This lists the last thirty messages the system tried to send.",
      do: async (h) => {
        await h.page.goBack({ waitUntil: "networkidle" });
        await h.point('h2:has-text("Recent step activity")', 1400);
      },
    },
    {
      say: "Check the Status column. Sent means the message went out.",
      do: async (h) => h.point('span:text-is("sent") >> nth=0', 1400),
    },
    {
      say: "Failed shows the reason in red underneath.",
      do: async (h) => h.point("text=Email address bounced", 1500),
    },
    {
      say: "Skipped means the message was held back.",
      do: async (h) => h.point('span:text-is("skipped") >> nth=0', 1300),
    },
    {
      say: "This page is for viewing only. Ask for a change if someone needs to be added, paused or removed.",
      do: async (h) => h.pause(700),
    },
  ],
};
