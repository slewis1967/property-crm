/** Shared bits for the Compliance and Stock help-video scenarios. */

const HIDE = 'button[title="Open voice assistant"]{display:none !important}';

/**
 * Hide the floating microphone button. It sits on top of the Save buttons in
 * the bottom bar of the AML pages and would be clicked instead of them.
 * Call it in the first step; it also covers pages opened later.
 */
export async function hideVoiceButton(h) {
  await h.page.context().addInitScript((css) => {
    const add = () => {
      const s = document.createElement("style");
      s.textContent = css;
      document.documentElement.appendChild(s);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add);
    else add();
  }, HIDE);
  await h.page.addStyleTag({ content: HIDE });
}

/** Click a date box, then set its value (typing into a date box is unreliable). */
export async function setDate(h, selector, iso) {
  await h.click(selector);
  await h.page.locator(selector).first().fill(iso);
  await h.pause(300);
}

/**
 * The recorder auto-accepts browser pop-ups with an empty answer. Where a page
 * asks for text in a pop-up, answer it with this instead.
 */
export async function answerPrompts(h, text) {
  await h.page.evaluate((t) => {
    window.prompt = () => t;
  }, text);
}

/** Wait for a fetch the page makes, so the next step sees the result. */
export function waitForApi(h, part, method = "GET") {
  return h.page.waitForResponse((r) => r.url().includes(part) && r.request().method() === method, { timeout: 20000 });
}

/** Bring a control to the middle of the screen first, so the caption bar does not cover it. */
export async function centre(h, selector) {
  await h.page.locator(selector).first().evaluate((el) => el.scrollIntoView({ block: "center" }));
  await h.pause(400);
}

/** Click a spot inside an element (0..1 across and down). For things with no button of their own, like a map bubble. */
export async function clickInside(h, selector, fx = 0.5, fy = 0.5) {
  const box = await h.page.locator(selector).first().boundingBox();
  const x = box.x + box.width * fx;
  const y = box.y + box.height * fy;
  await h.page.mouse.move(x, y, { steps: 25 });
  await h.pause(500);
  await h.page.mouse.down();
  await h.page.mouse.up();
  await h.pause(400);
}
