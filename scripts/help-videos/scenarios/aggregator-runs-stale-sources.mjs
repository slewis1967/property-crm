/** Ingestion Runs: spot a builder whose stock has stopped updating. Read only; demo data. */
const health = "main table >> nth=0";
const cell = (builder, n) => `${health} >> tr:has-text("${builder}") >> td >> nth=${n}`;

export default {
  start: "/aggregator/runs",
  steps: [
    {
      say: "This video shows how to spot a builder whose stock has stopped updating.",
      do: async (h) => h.pause(600),
    },
    {
      say: "Find the Source health table. It has one row for each builder, with the quietest builders at the top.",
      do: async (h) => h.point('h2:has-text("Source health")', 1500),
    },
    {
      say: "Check the Last read OK column. Red means the source has not been read successfully for more than three days.",
      do: async (h) => {
        await h.point(`${health} >> th:has-text("Last read OK")`, 800);
        await h.point(cell("Tallowwood Building Co", 2), 1500);
      },
    },
    {
      say: "Check the Last change column. Amber means nothing has been added or updated for more than two weeks.",
      do: async (h) => {
        await h.point(`${health} >> th:has-text("Last change")`, 800);
        await h.point(cell("Kestrel Ridge Developments", 3), 1500);
      },
    },
    {
      say: "The Last run column shows the latest status and time for each builder.",
      do: async (h) => h.point(cell("Tallowwood Building Co", 1), 1500),
    },
    {
      say: "If a builder has gone quiet, find their runs in the table underneath to see what went wrong.",
      do: async (h) => h.point("text=The attachment could not be opened >> nth=0", 1600),
    },
  ],
};
