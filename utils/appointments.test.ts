import { describe, expect, it } from "vitest";
import { appointmentIcsUid, nextIcsSequence, validateAppointmentPatch } from "./appointments";

const current = { start_time: "2026-11-10T00:00:00.000Z", end_time: "2026-11-10T01:00:00.000Z" };

describe("validateAppointmentPatch", () => {
  it("moves both ends and flags the time change", () => {
    const r = validateAppointmentPatch(
      { start_time: "2026-11-11T10:00:00+10:00", end_time: "2026-11-11T10:30:00+10:00" },
      current,
    );
    expect(r).toEqual({
      ok: true,
      timeChanged: true,
      patch: { start_time: "2026-11-11T00:00:00.000Z", end_time: "2026-11-11T00:30:00.000Z" },
    });
  });

  it("rejects an end before the start, including against the stored start", () => {
    expect(validateAppointmentPatch({ end_time: "2026-11-09T23:00:00Z" }, current).ok).toBe(false);
    expect(
      validateAppointmentPatch({ start_time: "2026-11-10T02:00:00Z", end_time: "2026-11-10T01:00:00Z" }, current).ok,
    ).toBe(false);
  });

  it("title-only edit does not touch times", () => {
    const r = validateAppointmentPatch({ title: "  New title " }, current);
    expect(r).toEqual({ ok: true, timeChanged: false, patch: { event_title: "New title" } });
  });

  it("same times resubmitted are not a change", () => {
    const r = validateAppointmentPatch(
      { start_time: "2026-11-10T10:00:00+10:00", end_time: "2026-11-10T11:00:00+10:00" },
      current,
    );
    expect(r.ok && r.timeChanged).toBe(false);
  });

  it("rejects blank title, bad dates and bad host", () => {
    expect(validateAppointmentPatch({ title: "  " }, current).ok).toBe(false);
    expect(validateAppointmentPatch({ start_time: "not a date" }, current).ok).toBe(false);
    expect(validateAppointmentPatch({ host_email: "nope" }, current).ok).toBe(false);
  });

  it("blank notes/location clear the field", () => {
    const r = validateAppointmentPatch({ notes: " ", location: "" }, current);
    expect(r.ok && r.patch).toEqual({ additional_notes: null, location: null });
  });
});

describe("appointmentIcsUid / nextIcsSequence", () => {
  it("matches the uid the invite was originally sent under", () => {
    expect(appointmentIcsUid("abc", "nextkey")).toBe("appt-abc@nextkey.com.au");
    expect(appointmentIcsUid("abc", "springboard")).toBe("appt-abc@springboardhomes.com.au");
  });
  it("sequence is a positive integer above the original 0", () => {
    expect(nextIcsSequence(1_762_700_000_123)).toBe(1_762_700_000);
  });
});
