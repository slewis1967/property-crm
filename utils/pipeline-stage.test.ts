import { describe, expect, it } from "vitest";
import { DEFAULT_STAGES, normaliseStage } from "./pipeline-stage";

describe("normaliseStage", () => {
  it("keeps an exact stage name", () => {
    expect(normaliseStage("Contacted", DEFAULT_STAGES)).toBe("Contacted");
  });

  it("puts a lead with no stage in the first column", () => {
    expect(normaliseStage(null, DEFAULT_STAGES)).toBe("New Lead");
    expect(normaliseStage(null, [])).toBe("New Lead");
  });

  it("maps legacy names by keyword", () => {
    expect(normaliseStage("Closed - Won", DEFAULT_STAGES)).toBe("Closed Won");
    expect(normaliseStage("lost (no finance)", DEFAULT_STAGES)).toBe("Closed Lost");
    expect(normaliseStage("Contacted - no answer", DEFAULT_STAGES)).toBe("Contacted");
  });

  it("falls back to the first stage for anything unrecognised", () => {
    expect(normaliseStage("Something odd", ["Enquiry", "Booked"])).toBe("Enquiry");
  });
});
