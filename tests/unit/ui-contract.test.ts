import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync("app/page.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

describe("judge-facing UI contract", () => {
  it("keeps the safety boundary and the full closed loop visible", () => {
    expect(page).toContain("Synthetic environment");
    for (const stage of ["IDENTIFY", "GENERATE", "ATTACK", "EVADE", "DISCOVER", "DEFEND", "REPLAY", "MEASURE"]) {
      expect(page, `stage ${stage} must appear in the rail`).toContain(stage);
    }
  });

  it("names the team and the challenge, as the submission rules require", () => {
    expect(page).toContain("Mastercard Innovation Challenge 2026");
    expect(page).toContain("The debuggers");
  });

  it("announces asynchronous work and errors to assistive technology", () => {
    expect(page).toContain('role="alert"');
    expect(page).toContain('aria-live="polite"');
    expect(page).toContain('aria-current');
    expect(page).toContain("sr-only");
  });

  it("reports BOTH recall definitions so review holds are never passed off as declines", () => {
    expect(page).toContain("Recall (decline)");
    expect(page).toContain("Recall incl. review");
  });

  it("surfaces the referee's statistical evidence, not just point estimates", () => {
    expect(page).toContain("McNemar");
    expect(page).toContain("Wilson interval");
  });

  it("separates the discovery replay from the fresh-seed generalisation replay", () => {
    expect(page).toContain("Exact replay · discovery scenario");
    expect(page).toContain("Generalisation replay · fresh seeds");
  });

  it("uses the Mastercard brand palette rather than an arbitrary theme", () => {
    expect(css).toContain("#eb001b");
    expect(css).toContain("#ff5f00");
    expect(css).toContain("#f79e1b");
    // colour must carry decision meaning
    expect(css).toContain("--block:");
    expect(css).toContain("--review:");
    expect(css).toContain("--allow:");
  });

  it("includes keyboard focus, reduced-motion and dark-scheme handling", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("prefers-color-scheme: dark");
  });

  it("is responsive rather than fixed to a desktop viewport", () => {
    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain("minmax(");
  });
});
