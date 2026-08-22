import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("judge-facing UI contract", () => {
  it("shows the thesis, safety boundary, battle stages, and accessible blind-spot alert", () => {
    const page = readFileSync("app/page.tsx", "utf8");
    expect(page).toContain("Generate tomorrow’s fraud today");
    expect(page).toContain("SYNTHETIC PAYMENT ENVIRONMENT");
    expect(page).toContain("IDENTIFY");
    expect(page).toContain("GENERATE");
    expect(page).toContain('role="alert"');
    expect(page).toContain('aria-live="polite"');
  });

  it("includes keyboard focus and reduced-motion styles", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion");
  });
});
