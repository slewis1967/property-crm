/**
 * Voice assistant: log a call and set a reminder by voice.
 *
 * NOT A REAL CONVERSATION. A headless browser cannot hear speech and the demo
 * CRM has no AI key, so the spoken lines are fed in by a stand-in microphone
 * and the browser's /api/voice/converse call is answered inside this scenario
 * with made-up replies (see lib/system-voice.mjs, which also explains why the
 * doubled bubbles of development mode are hidden). The panel and buttons are
 * the real ones. Nothing is saved or sent.
 */
import { installFakeMic, answerWith, holdAndSay } from "./lib/system-voice.mjs";

const CALL = "Log a call with Olivia Bennett. She wants to see the display home on Saturday";
const REMIND = "Remind me to follow up with Olivia on Friday";
const friday = (() => {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
})();
export default {
  start: "/contacts",
  steps: [
    {
      say: "This video shows how to log a call or set a reminder by voice. Click the round microphone button at the bottom right of the page.",
      do: async (h) => {
        await installFakeMic(h);
        await answerWith(h, {
          [CALL]: {
            reply: "Done. I have logged that call on Olivia Bennett's record.",
            side_effects: [{ kind: "log_call", contact_name: "Olivia Bennett" }],
          },
          [REMIND]: {
            reply: "I have set a reminder to follow up with Olivia Bennett on Friday.",
            side_effects: [{ kind: "create_task", title: "Follow up with Olivia Bennett", due_date: friday }],
          },
        });
        await h.click('button[title="Open voice assistant"]');
      },
    },
    {
      say: "Press and hold the large microphone button. Say who the call was with and what was said.",
      do: async (h) => holdAndSay(h, CALL),
    },
    {
      say: "Let go and listen to the reply. If the assistant asks a question, hold the button again to answer it.",
      do: async (h) => {
        await h.page.waitForSelector("text=I have logged that call");
        await h.point("text=I have logged that call", 1200);
      },
    },
    {
      say: "The small tick line under the reply confirms the note was logged on the contact.",
      do: async (h) => h.point("text=Note logged on Olivia Bennett", 1500),
    },
    {
      say: "For a reminder, hold the button and say who to follow up and when.",
      do: async (h) => holdAndSay(h, REMIND),
    },
    {
      say: "The tick line shows the task and its due date.",
      do: async (h) => {
        await h.page.waitForSelector("text=Task: Follow up with Olivia Bennett");
        await h.point("text=Task: Follow up with Olivia Bennett", 1500);
      },
    },
  ],
};
