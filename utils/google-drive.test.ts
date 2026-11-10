import { describe, expect, it } from "vitest";
import { driveFolderIdFromUrl } from "./google-drive";

/**
 * The submission grants the recipient read access to the packaged folder, and
 * the only handle it has is the folder URL stored on the application. Getting
 * the id out of it wrong means either sending a link nobody can open, or
 * refusing to send at all — so the parse is pinned here.
 */
describe("driveFolderIdFromUrl", () => {
  it("reads the id out of a Drive folder link", () => {
    expect(driveFolderIdFromUrl("https://drive.google.com/drive/folders/1rRPIO1kNlrvrXYroYPawXxEukFd026yC")).toBe(
      "1rRPIO1kNlrvrXYroYPawXxEukFd026yC",
    );
  });

  it("ignores query strings and trailing path", () => {
    expect(driveFolderIdFromUrl("https://drive.google.com/drive/folders/abc-123_XYZ?usp=sharing")).toBe(
      "abc-123_XYZ",
    );
  });

  it("returns null for anything that isn't a folder link", () => {
    // A FILE link is not a folder — sharing the wrong id would grant access to
    // the wrong thing, so this must not half-match.
    expect(driveFolderIdFromUrl("https://drive.google.com/file/d/abc123/view")).toBeNull();
    expect(driveFolderIdFromUrl("")).toBeNull();
    expect(driveFolderIdFromUrl(null)).toBeNull();
    expect(driveFolderIdFromUrl(undefined)).toBeNull();
  });
});
