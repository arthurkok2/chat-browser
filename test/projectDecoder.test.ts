import { describe, it, expect } from "vitest";
import { decodeProject } from "../src/server/services/projectDecoder.js";

describe("decodeProject", () => {
  it("decodes a simple two-segment path", () => {
    expect(decodeProject("C--Dayforce-tip")).toBe("Dayforce/tip");
  });

  it("decodes a deeper path", () => {
    expect(decodeProject("C--Dayforce-ideal-ic-webapp-dayforce")).toBe("Dayforce/ideal-ic-webapp-dayforce");
  });

  it("strips leading user path segments", () => {
    expect(decodeProject("C--Users-P11F8A4-Documents-myproject")).toBe("myproject");
  });

  it("decodes lowercase drive letter", () => {
    expect(decodeProject("c--Dayforce-candidate-common-ui")).toBe("candidate-common-ui");
  });

  it("returns single segment as-is", () => {
    expect(decodeProject("myrepo")).toBe("myrepo");
  });

  it("returns null input as null", () => {
    expect(decodeProject(null)).toBe(null);
  });
});
