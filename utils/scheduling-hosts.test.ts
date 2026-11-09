import { describe, expect, it } from "vitest";
import { SCHEDULING_HOSTS, findHostBySlug } from "./scheduling-hosts";

describe("scheduling hosts — post-booking hand-off", () => {
  it("sends Springboard self-bookings on to the Springboard website", () => {
    const host = findHostBySlug("springboard");
    expect(host?.postBookingUrl).toBe("https://springboardhomes.com.au/booked/");
  });

  it("keeps NextKey hosts on the CRM confirmation panel", () => {
    for (const host of SCHEDULING_HOSTS.filter((h) => h.brand === "nextkey")) {
      expect(host.postBookingUrl).toBeUndefined();
    }
  });

  it("only ever hands off to an https URL on a brand domain", () => {
    for (const host of SCHEDULING_HOSTS) {
      if (!host.postBookingUrl) continue;
      const u = new URL(host.postBookingUrl);
      expect(u.protocol).toBe("https:");
      expect(u.hostname.endsWith("springboardhomes.com.au")).toBe(true);
    }
  });
});
