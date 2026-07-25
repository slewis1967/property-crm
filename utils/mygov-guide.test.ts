import { describe, it, expect } from "vitest";
import {
  detectDevice,
  financialYearsNeeded,
  guideSteps,
  parseScreenHelp,
  SAVE_AS_PDF,
} from "./mygov-guide";

describe("detectDevice", () => {
  it("recognises the phones clients actually use", () => {
    expect(detectDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/605.1")).toBe("ios");
    expect(detectDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126")).toBe("android");
    expect(detectDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126")).toBe("desktop");
  });
  it("falls back to desktop for anything unknown", () => {
    expect(detectDevice(null)).toBe("desktop");
    expect(detectDevice("")).toBe("desktop");
    expect(detectDevice("curl/8.0")).toBe("desktop");
  });
});

describe("financialYearsNeeded", () => {
  it("does not ask for a financial year that is three weeks old (the NK-10010 case)", () => {
    // 25 July 2026 — the pair YLA accepted on this application was 2025-26 + 2024-25.
    const [a, b] = financialYearsNeeded(new Date("2026-07-25T00:00:00+10:00"));
    expect(a.label).toBe("2025-26");
    expect(b.label).toBe("2024-25");
  });
  it("uses the in-progress year once it has real data in it", () => {
    const [a, b] = financialYearsNeeded(new Date("2027-03-01T00:00:00+10:00"));
    expect(a.label).toBe("2026-27");
    expect(b.label).toBe("2025-26");
  });
  it("switches over on 1 October, not 1 July", () => {
    expect(financialYearsNeeded(new Date("2026-09-30T00:00:00+10:00"))[0].label).toBe("2025-26");
    expect(financialYearsNeeded(new Date("2026-10-01T00:00:00+10:00"))[0].label).toBe("2026-27");
  });
  it("uses the boundary in AEST, not the server's timezone", () => {
    // This runs on UTC servers but is about the AUSTRALIAN financial year, so
    // the changeover must follow the client's calendar, not the machine's.
    // 2026-09-30T23:00Z is already 1 October in Brisbane...
    expect(financialYearsNeeded(new Date("2026-09-30T23:00:00Z"))[0].label).toBe("2026-27");
    // ...and 2026-09-30T13:00Z is still 30 September there.
    expect(financialYearsNeeded(new Date("2026-09-30T13:00:00Z"))[0].label).toBe("2025-26");
  });
  it("labels a turn-of-century year correctly", () => {
    // 2099-00 would be wrong; the modulo must wrap to two digits.
    const [a] = financialYearsNeeded(new Date("2100-03-01T00:00:00+10:00"));
    expect(a.label).toBe("2099-00");
  });
  it("always returns the two years newest-first and consecutive", () => {
    for (const d of ["2026-01-15", "2026-07-01", "2026-11-30", "2027-06-30"]) {
      const [a, b] = financialYearsNeeded(new Date(`${d}T00:00:00+10:00`));
      expect(a.startYear - b.startYear).toBe(1);
    }
  });
});

describe("guideSteps", () => {
  const years = financialYearsNeeded(new Date("2026-07-25T00:00:00+10:00"));

  it("leads with the linking check — where clients are actually stuck", () => {
    expect(guideSteps({ device: "ios", years })[0]!.id).toBe("linked");
  });
  it("names both years explicitly, and says one statement PER EMPLOYER", () => {
    // myGov issues a separate statement per employer — there is no combined
    // document — so a year with two jobs needs both of that year's statements.
    // An earlier version of this step told clients the opposite.
    const year = guideSteps({ device: "ios", years }).find((s) => s.id === "year")!;
    const all = [...year.body, ...(year.actions ?? [])].join(" ");
    expect(all).toContain("2025-26");
    expect(all).toContain("2024-25");
    expect(all).toMatch(/each employer|per employer/i);
    expect(all).not.toMatch(/not two employers/i);
  });
  it("gives device-specific save instructions", () => {
    const ios = guideSteps({ device: "ios", years }).find((s) => s.id === "save")!;
    const android = guideSteps({ device: "android", years }).find((s) => s.id === "save")!;
    expect(ios.actions).toEqual(SAVE_AS_PDF.ios.steps);
    expect(android.actions).toEqual(SAVE_AS_PDF.android.steps);
    expect(ios.actions).not.toEqual(android.actions);
  });
  it("warns off a screenshot at the point the client is about to take one", () => {
    const print = guideSteps({ device: "ios", years }).find((s) => s.id === "print")!;
    expect(print.body.join(" ")).toMatch(/screenshot/i);
  });
});

describe("parseScreenHelp", () => {
  it("parses a good reply", () => {
    const h = parseScreenHelp('{"where":"the ATO home page","next":"Tap Employment","warning":"","stuck":false}');
    expect(h.next).toBe("Tap Employment");
    expect(h.stuck).toBe(false);
  });
  it("hands the client to a human when the reply is unusable", () => {
    // Opposite of the verification gate: unknown here means "get a person", not "fail the doc".
    expect(parseScreenHelp("sorry, I can't tell").stuck).toBe(true);
    expect(parseScreenHelp('{"where":"unclear","next":""}').stuck).toBe(true);
  });
  it("keeps a warning when the client is about to send the wrong document", () => {
    const h = parseScreenHelp('{"where":"your tax return","next":"Go back","warning":"That is your tax return, not the income statement","stuck":false}');
    expect(h.warning).toMatch(/tax return/);
  });
});
