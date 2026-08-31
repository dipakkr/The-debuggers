import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { THREAT_FAMILIES } from "@/lib/threat-intel/families";
import { V1_FEATURES } from "@/lib/fraud/detector";

/**
 * Counts stated in prose drift away from the code that produced them. Three
 * had already: the corpus was described as spanning seven categories while
 * only six were populated, the detector as having seven features when it has
 * eight, and the suite as 75 tests when it was 86.
 *
 * A submission whose entire argument is "our numbers are checkable" cannot
 * afford a checkable number being wrong, so each one is asserted here against
 * its source of truth.
 */
const DOCS = ["README.md", "docs/threat-research.md", "docs/rubric-coverage.md", "docs/architecture.md"];
const read = (f: string) => readFileSync(f, "utf8");
const docxGen = read("scripts/make-docx.mts");

describe("stated counts match the code", () => {
  it("family count", () => {
    const n = THREAT_FAMILIES.length;
    for (const f of DOCS) {
      const text = read(f);
      const claimed = [...text.matchAll(/(\d+)\s+(?:GenAI-accelerated[\w -]*families|families across)/g)];
      for (const m of claimed) {
        expect(Number(m[1]), `${f} claims ${m[1]} families, corpus has ${n}`).toBe(n);
      }
    }
  });

  it("category count reflects categories that are actually populated", () => {
    const populated = new Set(THREAT_FAMILIES.map((f) => f.category)).size;
    // a category declared in the type union but used by no family must not be
    // counted: the UI groups by populated category and would show fewer
    for (const f of [...DOCS, "scripts/make-docx.mts"]) {
      const text = read(f);
      for (const m of text.matchAll(/across (\d+) (?:categories|channels)/g)) {
        expect(Number(m[1]), `${f} claims ${m[1]} categories, ${populated} are populated`).toBe(populated);
      }
    }
    expect(docxGen).not.toContain("nineteen defensive families");
  });

  it("detector feature count", () => {
    expect(V1_FEATURES.length).toBe(8);
    expect(docxGen, "docx must not claim seven features").not.toMatch(/seven (core )?behaviou?ral features/);
  });

  it("test count quoted in the README matches the suite", () => {
    const dir = "tests/unit";
    const files = [...readdirSync(dir).map((f) => path.join(dir, f)), "tests/load/load.test.ts"];
    const actual = files
      .filter((f) => f.endsWith(".test.ts"))
      .reduce((sum, f) => sum + (read(f).match(/^\s*it\(/gm)?.length ?? 0), 0);
    const claimed = read("README.md").match(/(\d+) tests/);
    expect(claimed, "README should state a test count").toBeTruthy();
    expect(Number(claimed![1]), `README says ${claimed![1]}, suite has ${actual}`).toBe(actual);
  });
});
