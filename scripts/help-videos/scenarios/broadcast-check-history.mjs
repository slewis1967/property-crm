/** Broadcast: read the history of past sends. Reads only. */
export default {
  start: "/broadcast",
  steps: [
    {
      say: "This video shows how to check how a broadcast email went.",
      do: async (h) => h.pause(600),
    },
    {
      say: "Scroll down to Broadcast history. Each past broadcast shows its subject, date and number of recipients.",
      do: async (h) => {
        await h.point('h2:has-text("Broadcast history")', 1000);
        await h.point('p:text-is("New listings this week")', 1200);
      },
    },
    {
      say: "Click Refresh to update the numbers. A new broadcast starts as pending and moves to sent over a few minutes.",
      do: async (h) => {
        await h.click('button:text-is("Refresh")');
        await h.pause(900);
      },
    },
    {
      say: "Read the sent, pending and failed counts. The bar fills up as more emails are sent.",
      do: async (h) => {
        await h.point('li:has-text("New listings this week") >> text=sent', 800);
        await h.point('li:has-text("New listings this week") >> text=pending', 800);
        await h.point('li:has-text("New listings this week") >> text=failed', 800);
      },
    },
    {
      say: "If some emails failed, click why beside the failed count to see what went wrong.",
      do: async (h) => {
        await h.click('button:text-is("why?")');
        await h.point("text=Mailbox is full", 1500);
      },
    },
    {
      say: "A finished broadcast shows every email as sent.",
      do: async (h) => h.point('p:text-is("October property update")', 1500),
    },
  ],
};
