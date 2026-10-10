/**
 * War Room: tick off a task. Completes a seeded demo task (the seed file puts it back).
 * The daily brief at the top of the page is a made-up stand-in; see lib/command-util.mjs.
 */
import { warRoomBrief } from "../lib/command-util.mjs";

const ROW = 'div.flex.items-start:has(p:text-is("Send Amelia the four bedroom shortlist"))';

export default {
  start: "/",
  steps: [
    {
      say: "This is the War Room, the home page of the CRM. Here is how to tick off a task once you have finished it.",
      do: async (h) => warRoomBrief(h),
    },
    {
      say: "Scroll to Open Tasks. It sits under the four number cards, and lists tasks soonest due first.",
      do: async (h) => h.point('h2:has-text("Open Tasks")', 1400),
    },
    {
      say: "Find the task. The line underneath shows who it is for and when it is due.",
      do: async (h) => h.point(`${ROW} p >> nth=1`, 1800),
    },
    {
      say: "Tick the box to the left of the task.",
      do: async (h) => {
        await h.click(`${ROW} input[type="checkbox"]`);
        await h.page.waitForSelector(ROW, { state: "detached" });
      },
    },
    {
      say: "The task is marked complete and leaves the list. You cannot untick it from this page, so only tick it when the job is done.",
      do: async (h) => h.point('h2:has-text("Open Tasks")', 1200),
    },
  ],
};
