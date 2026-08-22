import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ExperimentRow } from "@/lib/contracts/genome";

const LEDGER_PATH = path.join(process.cwd(), "data", "ledger", "experiments.jsonl");

export function appendExperiment(row: ExperimentRow): void {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.appendFileSync(LEDGER_PATH, JSON.stringify(row) + "\n");
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
  if (!fs.existsSync(LEDGER_PATH)) return [];
  return parseExperimentLines(fs.readFileSync(LEDGER_PATH, "utf8")).slice(-limit);
}

export function clearLedger(): void {
  if (fs.existsSync(LEDGER_PATH)) fs.rmSync(LEDGER_PATH);
}
