import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { ExperimentRow } from "@/lib/contracts/genome";

/**
 * The Referee's append-only experiment ledger.
 *
 * Storage is resolved once, at first write, because the deployment target
 * decides what is possible:
 *
 *   - Local and container hosts: append to `data/ledger/experiments.jsonl`
 *     inside the repo, which is what `npm run evidence` and the tests read.
 *   - Serverless hosts (Vercel and equivalents): the bundle directory is
 *     READ-ONLY. Writing there throws EROFS on every generation and every
 *     gate run, which would take down the core loop. There we fall back to
 *     the per-instance writable temp directory, and finally to memory.
 *
 * An in-memory mirror is always maintained so the audit view is correct even
 * when nothing durable is available. This is a prototype-grade ledger either
 * way: a production deployment needs a real append-only store, which is
 * stated in the architecture notes rather than pretended away here.
 */

const REPO_LEDGER = path.join(process.cwd(), "data", "ledger", "experiments.jsonl");
const TMP_LEDGER = path.join(os.tmpdir(), "arena-experiments.jsonl");

export type LedgerBacking = "repo" | "tmp" | "memory";

let backing: LedgerBacking | null = null;
let ledgerPath: string | null = null;
const memory: ExperimentRow[] = [];
const MEMORY_LIMIT = 2000;

function canWrite(target: string): boolean {
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, "");
    return true;
  } catch {
    return false;
  }
}

function resolveBacking(): LedgerBacking {
  if (backing) return backing;
  if (canWrite(REPO_LEDGER)) {
    ledgerPath = REPO_LEDGER;
    backing = "repo";
  } else if (canWrite(TMP_LEDGER)) {
    ledgerPath = TMP_LEDGER;
    backing = "tmp";
  } else {
    ledgerPath = null;
    backing = "memory";
  }
  return backing;
}

/** Which store the ledger actually landed on. Surfaced in the audit view so a
 *  reviewer can see whether these records survive a restart. */
export function ledgerBacking(): LedgerBacking {
  return resolveBacking();
}

export function appendExperiment(row: ExperimentRow): void {
  memory.push(row);
  if (memory.length > MEMORY_LIMIT) memory.splice(0, memory.length - MEMORY_LIMIT);

  if (resolveBacking() === "memory" || !ledgerPath) return;
  try {
    fs.appendFileSync(ledgerPath, JSON.stringify(row) + "\n");
  } catch {
    // a filesystem that accepted a probe write but rejects this one must not
    // be allowed to fail an experiment; the in-memory mirror already has it
    backing = "memory";
    ledgerPath = null;
  }
}

export function makeExperimentId(input: Record<string, unknown>): string {
  const payload = JSON.stringify(
    Object.fromEntries(
      Object.entries(input).sort(([a], [b]) => a.localeCompare(b))
    )
  );
  return `EXP-${createHash("sha256").update(payload).digest("hex").slice(0, 16)}`;
}

export function parseExperimentLines(text: string): ExperimentRow[] {
  return text
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as ExperimentRow];
      } catch {
        return [];
      }
    });
}

export function readExperiments(limit = 200): ExperimentRow[] {
  resolveBacking();
  if (ledgerPath && fs.existsSync(ledgerPath)) {
    const onDisk = parseExperimentLines(fs.readFileSync(ledgerPath, "utf8"));
    if (onDisk.length >= memory.length) return onDisk.slice(-limit);
  }
  return memory.slice(-limit);
}

export function clearLedger(): void {
  memory.length = 0;
  if (ledgerPath && fs.existsSync(ledgerPath)) fs.rmSync(ledgerPath);
}
