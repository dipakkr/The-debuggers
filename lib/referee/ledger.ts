import fs from "node:fs";
import path from "node:path";
import { ExperimentRow } from "@/lib/contracts/genome";

const LEDGER_PATH = path.join(process.cwd(), "data", "ledger", "experiments.jsonl");

export function appendExperiment(row: ExperimentRow): void {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.appendFileSync(LEDGER_PATH, JSON.stringify(row) + "\n");
}

export function readExperiments(limit = 200): ExperimentRow[] {
  if (!fs.existsSync(LEDGER_PATH)) return [];
  const lines = fs.readFileSync(LEDGER_PATH, "utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).map((l) => JSON.parse(l) as ExperimentRow);
}

export function clearLedger(): void {
  if (fs.existsSync(LEDGER_PATH)) fs.rmSync(LEDGER_PATH);
}
