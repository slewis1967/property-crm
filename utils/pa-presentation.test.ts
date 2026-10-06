import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  clampPage,
  contactIdFromRoom,
  guestConfirmedBy,
  guestPaStage,
  guestRateKey,
  isPresenterIdentity,
  sentForSigningLabel,
} from "./pa-presentation";
import { roomForContact } from "./livekit-rooms";

const ID = "3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b";

describe("contactIdFromRoom", () => {
  it("round-trips roomForContact", () => {
    expect(contactIdFromRoom(roomForContact(ID))).toBe(ID);
  });

  it("refuses anything that is not exactly contact-<uuid>", () => {
    for (const room of [
      "",
      "contact-",
      "contact-123",
      `contact-${ID}-extra`,
      `contact-${ID}/../x`,
      ` contact-${ID}`,
      `Contact-${ID}`,
      `meeting-${ID}`,
      ID,
      `contact-${ID.toUpperCase()}`,
    ]) {
      expect(contactIdFromRoom(room), room).toBeNull();
    }
  });

  it("refuses non-strings", () => {
    expect(contactIdFromRoom(null)).toBeNull();
    expect(contactIdFromRoom(undefined)).toBeNull();
    expect(contactIdFromRoom({ room: `contact-${ID}` })).toBeNull();
  });
});

describe("isPresenterIdentity", () => {
  it("accepts a staff email identity", () => {
    expect(isPresenterIdentity("sean.l@nextkey.com.au")).toBe(true);
  });

  it("refuses every guest identity, however it is cased or padded", () => {
    expect(isPresenterIdentity("guest:Mark#1a2b3c4d")).toBe(false);
    expect(isPresenterIdentity("GUEST:Mark")).toBe(false);
    expect(isPresenterIdentity("  guest:Mark")).toBe(false);
    // A guest who names themselves after a rep is still a guest: the prefix is
    // added by the server in front of whatever name the link carries.
    expect(isPresenterIdentity("guest:sean.l@nextkey.com.au#1a2b3c4d")).toBe(false);
  });

  it("refuses a missing identity", () => {
    expect(isPresenterIdentity(undefined)).toBe(false);
    expect(isPresenterIdentity(null)).toBe(false);
    expect(isPresenterIdentity("")).toBe(false);
    expect(isPresenterIdentity("   ")).toBe(false);
  });
});

describe("guestPaStage", () => {
  it("is the document until the video step is shown", () => {
    expect(guestPaStage({})).toBe("pa");
    expect(guestPaStage({ video_shown_at: null, signing_sent_at: null })).toBe("pa");
  });

  it("is the video once the rep has finished presenting", () => {
    expect(guestPaStage({ video_shown_at: "2026-10-06T01:00:00Z" })).toBe("video");
  });

  it("is sent once signing went out, whatever else is stamped", () => {
    expect(
      guestPaStage({ video_shown_at: "2026-10-06T01:00:00Z", signing_sent_at: "2026-10-06T01:20:00Z" }),
    ).toBe("sent");
    expect(guestPaStage({ signing_sent_at: "2026-10-06T01:20:00Z" })).toBe("sent");
  });
});

describe("clampPage", () => {
  it("keeps the page inside the document", () => {
    expect(clampPage(0, 4)).toBe(1);
    expect(clampPage(-3, 4)).toBe(1);
    expect(clampPage(2, 4)).toBe(2);
    expect(clampPage(5, 4)).toBe(4);
    expect(clampPage(2.9, 4)).toBe(2);
  });

  it("survives junk", () => {
    expect(clampPage(Number.NaN, 4)).toBe(1);
    expect(clampPage(3, 0)).toBe(1);
    expect(clampPage(3, Number.NaN)).toBe(1);
  });
});

describe("guestConfirmedBy", () => {
  it("prefixes the name so it cannot be mistaken for a staff email", () => {
    expect(guestConfirmedBy("Marcia Libman")).toBe("guest:Marcia Libman");
  });

  it("falls back when the link carried no name", () => {
    expect(guestConfirmedBy(undefined)).toBe("guest:Guest");
    expect(guestConfirmedBy("   ")).toBe("guest:Guest");
  });

  it("flattens control characters and caps the length", () => {
    expect(guestConfirmedBy("Mark\r\nBenjamin\tLibman")).toBe("guest:Mark Benjamin Libman");
    expect(guestConfirmedBy("x".repeat(500)).length).toBe("guest:".length + 80);
  });
});

describe("guestRateKey", () => {
  it("separates two links that share a JWT header", () => {
    const header = "eyJhbGciOiJIUzI1NiJ9.";
    const a = guestRateKey("1.2.3.4", `${header}payloadA.signatureAAAAAAAA`);
    const b = guestRateKey("1.2.3.4", `${header}payloadB.signatureBBBBBBBB`);
    expect(a).not.toBe(b);
  });

  it("never carries the whole token", () => {
    const token = "a".repeat(40) + "b".repeat(12);
    expect(guestRateKey("1.2.3.4", token)).toBe(`1.2.3.4:${"b".repeat(12)}`);
  });
});

describe("sentForSigningLabel", () => {
  it("counts applicants in plain words", () => {
    expect(sentForSigningLabel(2)).toBe("Sent for signing to 2 applicants");
    expect(sentForSigningLabel(1)).toBe("Sent for signing to 1 applicant");
    expect(sentForSigningLabel(0)).toBe("Sent for signing");
  });

  it("says when nothing new went out", () => {
    expect(sentForSigningLabel(2, true)).toBe("Sent for signing to 2 applicants (already sent earlier)");
  });
});

/**
 * pdf.js touches `window`/`DOMMatrix` at module scope, so a STATIC import from
 * any of these files pulls it into the server bundle and breaks SSR while the
 * route still answers 200 (the Leaflet trap in CLAUDE.md "Stock Map"). The
 * dynamic `import()` inside an effect is the only allowed form.
 */
describe("pdf.js stays out of the server bundle", () => {
  const files = [
    "app/components/PaPdfPage.tsx",
    "app/components/PaPresenter.tsx",
    "app/components/PaAudience.tsx",
    "app/components/VideoRoom.tsx",
  ];
  for (const file of files) {
    it(`${file} has no static pdfjs-dist import`, () => {
      const src = readFileSync(path.resolve(__dirname, "..", file), "utf8");
      // `import type` is erased by the compiler and never reaches a bundle.
      expect(src).not.toMatch(/^\s*import\s+(?!type\s)[^;]*from\s+["']pdfjs-dist/m);
      expect(src).not.toMatch(/^\s*import\s+["']pdfjs-dist/m);
      expect(src).not.toMatch(/require\(\s*["']pdfjs-dist/);
    });
  }

  it("PaPdfPage loads the legacy build dynamically", () => {
    const src = readFileSync(path.resolve(__dirname, "..", "app/components/PaPdfPage.tsx"), "utf8");
    expect(src).toMatch(/import\(\s*["']pdfjs-dist\/legacy\/build\/pdf\.mjs["']\s*\)/);
    expect(src).toMatch(/pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs/);
  });
});

describe("guestWindowOpen", () => {
  const now = Date.parse("2026-10-06T04:00:00Z");
  it("is shut when the rep has never pressed Present", async () => {
    const { guestWindowOpen } = await import("./pa-presentation");
    expect(guestWindowOpen(null, now)).toBe(false);
    expect(guestWindowOpen("not a date", now)).toBe(false);
  });
  it("is open during the call and shut three hours after it started", async () => {
    const { guestWindowOpen } = await import("./pa-presentation");
    expect(guestWindowOpen("2026-10-06T03:30:00Z", now)).toBe(true);
    expect(guestWindowOpen("2026-10-06T01:00:01Z", now)).toBe(true);
    expect(guestWindowOpen("2026-10-06T01:00:00Z", now)).toBe(false);
    expect(guestWindowOpen("2026-10-05T03:30:00Z", now)).toBe(false);
  });
});
