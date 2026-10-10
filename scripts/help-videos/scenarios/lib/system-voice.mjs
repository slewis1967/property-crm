/**
 * Shared by the voice-assistant-* scenarios.
 *
 * A headless browser has no microphone and the demo CRM has no AI key, so the
 * voice assistant cannot really hear or answer while recording. These helpers
 * stand in for both ends, in the BROWSER only:
 *   - installFakeMic: replaces the browser's speech recognition with one that
 *     "hears" a line we give it, word by word, while the mic button is held.
 *   - answerWith: answers the browser's /api/voice/converse call with made-up
 *     replies, chosen by what was "said", in the shape the real route returns.
 * The panel, the buttons, the transcript and the tick lines are the real UI.
 *
 * One more adjustment: the demo CRM runs in development mode, where React runs
 * the panel's "finished listening" step twice, so every line and every reply
 * shows up twice. That does not happen on the live site, so installFakeMic
 * hides the second copy of each bubble to show what staff really see.
 */

export async function installFakeMic(h) {
  await h.page.addStyleTag({
    content: "div.fixed div.overflow-y-auto.space-y-2 > div:nth-child(even){display:none !important}",
  });
  await h.page.evaluate(() => {
    class FakeRecognition {
      start() {
        const words = (window.__helpSpeech || "").split(" ");
        let n = 0;
        this._timer = setInterval(() => {
          n = Math.min(words.length, n + 1);
          const transcript = words.slice(0, n).join(" ");
          this.onresult?.({ results: [Object.assign([{ transcript }], { isFinal: n === words.length })] });
          if (n === words.length) clearInterval(this._timer);
        }, 230);
      }
      stop() {
        clearInterval(this._timer);
        const full = window.__helpSpeech || "";
        this.onresult?.({ results: [Object.assign([{ transcript: full }], { isFinal: true })] });
        setTimeout(() => this.onend?.(), 120);
      }
      abort() {
        clearInterval(this._timer);
      }
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = FakeRecognition;
  });
}

/** Answer /api/voice/converse with the made-up reply listed for what was said. */
export async function answerWith(h, replies) {
  await h.page.route("**/api/voice/converse", async (route) => {
    const said = route.request().postDataJSON()?.transcript ?? "";
    const r = replies[said] ?? { reply: "Sorry, I didn't get that." };
    await new Promise((res) => setTimeout(res, 1100)); // show "Thinking…" briefly
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, reply: r.reply, history: [], side_effects: r.side_effects ?? [] }),
    });
  });
}

/** Hold the big microphone button while the line is "spoken", then let go. */
export async function holdAndSay(h, line) {
  await h.page.evaluate((t) => (window.__helpSpeech = t), line);
  await h.point('button[title="Hold to talk"]', 300);
  await h.page.mouse.down();
  await h.pause(line.split(" ").length * 230 + 700);
  await h.page.mouse.up();
  await h.pause(400);
}
