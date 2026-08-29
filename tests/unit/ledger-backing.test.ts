import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Serverless hosts (Vercel and equivalents) give the application a bundle
 * directory that is READABLE but not WRITABLE. The ledger used to append
 * unconditionally into the repo, which throws EROFS on every generation and
 * every gate run — taking down the core loop, not just the audit trail.
 */
describe("experiment ledger storage backing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("appends into the repo when the working tree is writable", async () => {
    const { ledgerBacking, appendExperiment, readExperiments } = await import("@/lib/referee/ledger");
    expect(ledgerBacking()).toBe("repo");
    const before = readExperiments(5000).length;
    appendExperiment(row("EXP-repo-probe"));
    expect(readExperiments(5000).length).toBe(before + 1);
  });

  it("falls back to the temp directory when the bundle directory is read-only", async () => {
    const repoLedger = path.join(process.cwd(), "data", "ledger", "experiments.jsonl");
    const realAppend = fs.appendFileSync;
    vi.spyOn(fs, "appendFileSync").mockImplementation(((target: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (typeof target === "string" && target === repoLedger) {
        const err = new Error("EROFS: read-only file system") as NodeJS.ErrnoException;
        err.code = "EROFS";
        throw err;
      }
      return (realAppend as unknown as (...a: unknown[]) => void)(target, ...rest);
    }) as typeof fs.appendFileSync);

    vi.resetModules();
    const { ledgerBacking, appendExperiment, readExperiments } = await import("@/lib/referee/ledger");

    // it must not throw, and it must not silently lose the record
    expect(ledgerBacking()).toBe("tmp");
    expect(() => appendExperiment(row("EXP-tmp-probe"))).not.toThrow();
    expect(readExperiments(5000).some((r) => r.experiment_id === "EXP-tmp-probe")).toBe(true);
    expect(fs.existsSync(path.join(os.tmpdir(), "arena-experiments.jsonl"))).toBe(true);
  });

  it("keeps the loop running with no writable filesystem at all", async () => {
    vi.spyOn(fs, "appendFileSync").mockImplementation(() => {
      const err = new Error("EROFS: read-only file system") as NodeJS.ErrnoException;
      err.code = "EROFS";
      throw err;
    });
    vi.resetModules();
    const { ledgerBacking, appendExperiment, readExperiments } = await import("@/lib/referee/ledger");

    expect(ledgerBacking()).toBe("memory");
    expect(() => appendExperiment(row("EXP-mem-probe"))).not.toThrow();
    // the audit view must still be correct even with nothing durable behind it
    expect(readExperiments(5000).some((r) => r.experiment_id === "EXP-mem-probe")).toBe(true);
  });
});

function row(id: string) {
  return {
    experiment_id: id,
    ts: new Date().toISOString(),
    kind: "bench" as const,
    versions: {
      dataset_version: "t", attack_version: "t", detector_version: "t",
      defense_version: "t", reasoning_version: "t",
    },
  };
}
