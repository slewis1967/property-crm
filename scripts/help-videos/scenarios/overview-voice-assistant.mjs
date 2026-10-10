/**
 * Overview of the voice assistant: a tour of the panel and its buttons.
 *
 * NOT A REAL CONVERSATION. A headless browser cannot hear speech and the demo
 * CRM has no AI key, so the one spoken line is fed in by a stand-in microphone
 * and the browser's /api/voice/converse call is answered inside this scenario
 * with a made-up reply (see lib/system-voice.mjs, which also explains why the
 * doubled bubbles of development mode are hidden). The panel and buttons are
 * the real ones. Nothing is saved or sent.
 */
import { installFakeMic, answerWith, holdAndSay } from "./lib/system-voice.mjs";

const ASK = "Find Olivia Bennett";
export default {
  start: "/contacts",
  steps: [
    {
      say: "The voice assistant lets you talk to the CRM from any page. It opens from the round microphone button at the bottom right.",
      do: async (h) => {
        await installFakeMic(h);
        await answerWith(h, {
          [ASK]: {
            reply: "I found Olivia Bennett, a first home buyer in Chermside. Would you like to log a call or set a reminder?",
            side_effects: [{ kind: "find_contact", query: "Olivia Bennett", top: { name: "Olivia Bennett" } }],
          },
        });
        await h.point('button[title="Open voice assistant"]', 1500);
        await h.click('button[title="Open voice assistant"]');
      },
    },
    {
      say: "The top bar of the panel shows what the assistant is doing. Here it is waiting for you.",
      do: async (h) => h.point("text=Hold mic or spacebar to talk", 1600),
    },
    {
      say: "Before you start, the middle of the panel suggests things to try.",
      do: async (h) => h.point("text=/^Try:/", 1600),
    },
    {
      say: "The large microphone button is how you talk. Hold it down while you speak and let go when you finish. Holding the spacebar does the same.",
      do: async (h) => {
        await h.point('button[title="Hold to talk"]', 1200);
        await holdAndSay(h, ASK);
      },
    },
    {
      say: "What you said appears on the right, and the reply appears on the left. The reply is also read out loud.",
      do: async (h) => {
        await h.page.waitForSelector("text=I found Olivia Bennett");
        await h.point("text=I found Olivia Bennett", 1600);
      },
    },
    {
      say: "The small tick line under a reply confirms what was done.",
      do: async (h) => h.point("text=Found: Olivia Bennett", 1500),
    },
    {
      say: "Reset clears the conversation so you can start again. The cross closes the panel and stops the assistant speaking.",
      do: async (h) => {
        await h.point('button[title="Clear conversation"]', 1200);
        await h.point('button[title="Close"]', 1200);
      },
    },
    {
      say: "For step by step help with a task, pick it from the list under this overview.",
      do: async (h) => h.pause(600),
    },
  ],
};
