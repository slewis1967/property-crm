/** Overview of Ingestion Runs: a tour of the page. Read only. Demo data only. */
import { centre } from "./lib/compliance-stock.mjs";

const END = "For step by step help with a task here, pick it from the list under this overview.";
const health = "main table >> nth=0";
const runs = "main table >> nth=1";

export default {
  start: "/aggregator/runs",
  steps: [
    {
      say: "This is Ingestion Runs. It is a log of every builder stocklist the system has processed. Nothing here can be changed.",
      do: async (h) => h.pause(600),
    },
    {
      say: "The four totals show the runs listed, the properties added and updated, and the cost.",
      do: async (h) => {
        await h.point("text=Runs (last 100)", 600);
        await h.point("text=Properties added", 600);
        await h.point("text=Total AI cost", 600);
      },
    },
    {
      say: "Source health has one row for each builder. Red and amber mark builders whose stock has gone quiet.",
      do: async (h) => {
        await h.point('h2:has-text("Source health")', 800);
        await h.point(`${health} >> tr:has-text("Tallowwood Building Co") >> td >> nth=2`, 900);
        await h.point(`${health} >> tr:has-text("Kestrel Ridge Developments") >> td >> nth=3`, 900);
      },
    },
    {
      say: "Underneath is the run list. It has one row for each stocklist processed, newest first.",
      do: async (h) => {
        await centre(h, `${runs} >> thead`);
        await h.point(`${runs} >> th:has-text("Email subject")`, 1300);
      },
    },
    {
      say: "Status shows whether a run completed or failed. A failed run gives the reason in red.",
      do: async (h) => {
        await h.point(`${runs} >> th:has-text("Status")`, 700);
        await centre(h, "text=The attachment could not be opened >> nth=0");
        await h.point("text=The attachment could not be opened >> nth=0", 1200);
      },
    },
    {
      say: "The number columns show properties added, updated, withdrawn and sent for review, then the cost and time taken.",
      do: async (h) => {
        await centre(h, `${runs} >> thead`);
        await h.point(`${runs} >> th:has-text("+New")`, 600);
        await h.point(`${runs} >> th:has-text("?Rev")`, 600);
        await h.point(`${runs} >> th:has-text("Cost")`, 600);
      },
    },
    {
      say: "New and updated properties appear on the Aggregator Feed. Anything sent for review waits in the Review Queue.",
      do: async (h) => {
        await h.point('aside a[href="/properties"]', 900);
        await h.point('aside a[href="/aggregator/review"]', 900);
      },
    },
    { say: END, do: async (h) => h.pause(600) },
  ],
};
