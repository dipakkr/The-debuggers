import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("submission tooling", () => {
  it("offers benchmark and secret-free handoff commands", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts.handoff).toBe("sh scripts/make-handoff.sh");
    expect(readFileSync("scripts/bench.ts", "utf8")).toContain("memory_rss_mb");
    expect(readFileSync("scripts/make-handoff.sh", "utf8")).not.toMatch(
      /env|printenv|OPENAI_API_KEY/
    );
  });
});
