import { describe, it, expect } from "vitest";
import { normalizeQuery, clamp } from "@/lib/server/normalize";

describe("normalizeQuery", () => {
  it("should convert to lowercase", () => {
    expect(normalizeQuery("POPUP SALES")).toBe("popup sales");
  });

  it("should remove punctuation", () => {
    expect(normalizeQuery("popup, sales!")).toBe("popup sales");
  });

  it("should collapse multiple spaces", () => {
    expect(normalizeQuery("popup    sales")).toBe("popup sales");
  });

  it("should trim whitespace", () => {
    expect(normalizeQuery("  popup sales  ")).toBe("popup sales");
  });

  it("should handle accents correctly", () => {
    const input = "café";
    const normalized = normalizeQuery(input);
    expect(normalized).toMatch(/caf/);
  });

  it("should return empty string for invalid input", () => {
    expect(normalizeQuery("!!!")).toBe("");
  });

  it("should handle real-world cases", () => {
    expect(normalizeQuery("Popup Sales & Conversion!")).toBe("popup sales conversion");
    expect(normalizeQuery("E-mail Opt-In")).toBe("e mail opt in");
  });
});

describe("clamp", () => {
  it("should clamp value within bounds", () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });

  it("should clamp to min when below", () => {
    expect(clamp(-10, 0, 100)).toBe(0);
  });

  it("should clamp to max when above", () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });

  it("should handle float values", () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(1.5, 0, 1)).toBe(1);
  });
});
