/** Small helpers shared by the Command group scenarios (not a scenario itself). */

/** Click into a field that already holds a value, select it all and type over it. */
export async function replace(h, sel, value) {
  await h.click(sel);
  await h.page.keyboard.press("Control+A");
  await h.page.locator(sel).first().pressSequentially(String(value), { delay: 60 });
  await h.pause(300);
}

/** Point at a date box, then set it (typing a date key by key is unreliable). */
export async function setDate(h, sel, isoDate) {
  await h.click(sel);
  await h.page.locator(sel).first().fill(isoDate);
  await h.pause(300);
}

/** yyyy-mm-dd for a day `days` from now, in local time. */
export function isoDay(days = 0) {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The War Room's daily brief is written by an AI service the demo has no key
 * for. Answer the browser's call with a made-up brief about the demo cast, then
 * load the page again so the brief is on screen.
 */
export async function warRoomBrief(h) {
  const text = [
    "• Olivia Bennett is pre-approved and hot. Her pre-approval call is overdue, so ring her first.",
    "• Mia Anderson enquired overnight about a third investment property. Book a strategy call.",
    "• Amelia Thompson is waiting on the four bedroom shortlist. Send it today.",
    "• Two new properties at Demo Meadows are waiting in the review queue.",
  ].join("\n");
  await h.page.route("**/api/ai/dashboard-brief", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, text }) }),
  );
  await h.goto("/");
}

/** The recorder has no printer. Make Print do nothing so the page carries on. */
export async function stubPrint(h) {
  await h.page.evaluate(() => {
    window.print = () => {};
  });
}
