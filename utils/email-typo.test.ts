import { describe, it, expect } from "vitest";
import { suggestEmailCorrection, tidyEmail } from "./email-typo";

describe("suggestEmailCorrection", () => {
  it("catches the typo that sent a signing link to a stranger", () => {
    expect(suggestEmailCorrection("feltrin.brendan@gmai.com")).toBe("feltrin.brendan@gmail.com");
  });

  it("catches a dropped, added, substituted and swapped character", () => {
    expect(suggestEmailCorrection("a@gmal.com")).toBe("a@gmail.com");
    expect(suggestEmailCorrection("a@gmaill.com")).toBe("a@gmail.com");
    expect(suggestEmailCorrection("a@gnail.com")).toBe("a@gmail.com");
    expect(suggestEmailCorrection("a@gmial.com")).toBe("a@gmail.com");
    expect(suggestEmailCorrection("a@hotmial.com")).toBe("a@hotmail.com");
    expect(suggestEmailCorrection("a@outlok.com")).toBe("a@outlook.com");
    expect(suggestEmailCorrection("a@gmail.con")).toBe("a@gmail.com");
  });

  it("handles Australian provider domains", () => {
    expect(suggestEmailCorrection("a@bigpond.con.au")).toBe("a@bigpond.com.au");
    expect(suggestEmailCorrection("a@hotmail.com.a")).toBe("a@hotmail.com.au");
  });

  it("keeps the local part exactly as typed and ignores domain case", () => {
    expect(suggestEmailCorrection("  Jo.Smith+crm@GMAI.COM ")).toBe("Jo.Smith+crm@gmail.com");
  });

  it("leaves real providers alone, including ones an edit away from a bigger one", () => {
    for (const d of ["gmail.com", "mail.com", "ymail.com", "email.com", "live.com", "me.com", "hotmail.com.au"]) {
      expect(suggestEmailCorrection(`a@${d}`)).toBeNull();
    }
  });

  it("leaves business domains alone", () => {
    expect(suggestEmailCorrection("brendan@selectprojectmarketing.com.au")).toBeNull();
    expect(suggestEmailCorrection("sean.l@nextkey.com.au")).toBeNull();
  });

  it("does not match against domains too short to mean anything", () => {
    // One edit from me.com / msn.com, and plainly not a typo of either.
    expect(suggestEmailCorrection("a@we.com")).toBeNull();
    expect(suggestEmailCorrection("a@man.com")).toBeNull();
  });

  it("returns null for input that is not an address", () => {
    expect(suggestEmailCorrection("")).toBeNull();
    expect(suggestEmailCorrection("gmai.com")).toBeNull();
    expect(suggestEmailCorrection("a@")).toBeNull();
    expect(suggestEmailCorrection("@gmai.com")).toBeNull();
  });
});

describe("tidyEmail", () => {
  it("strips the trailing punctuation that rides along on a paste", () => {
    expect(tidyEmail(" a@gmail.com, ")).toBe("a@gmail.com");
    expect(tidyEmail("a@gmail.com;")).toBe("a@gmail.com");
    expect(tidyEmail("a@gmail.com")).toBe("a@gmail.com");
    expect(tidyEmail("")).toBe("");
  });
});
