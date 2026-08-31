import { mulberry32, hashSeed, uniform, int, pick, lognormal, poisson } from "../rng";
import { MCCS, Transaction } from "@/lib/contracts/genome";

type MCC = (typeof MCCS)[number];

export interface Merchant {
  id: string;
  mcc: MCC;
  mean_ticket: number;
  country: string;
}

export interface CustomerProfile {
  id: string;
  mean_amount: number;
  amount_cv: number;
  cadence_per_day: number;
  active_start: number;
  active_end: number;
  pref_merchants: string[];
  device_ids: string[];
  country: string;
  account_age_days: number;
}

export interface World {
  seed: number;
  customers: CustomerProfile[];
  merchants: Merchant[];
  merchantIndex: Map<string, Merchant>;
}

export function merchantById(world: World, id: string): Merchant | undefined {
  return world.merchantIndex.get(id);
}

const COUNTRIES = ["US", "US", "US", "US", "GB", "FR", "DE", "CA"];

function hourWindow(rng: () => number): [number, number] {
  const start = int(rng, 5, 10);
  return [start, Math.min(23, start + int(rng, 12, 16))];
}

/**
 * Distribution parameters of the synthetic population.
 *
 * Exposed as overrides so the detector can be evaluated against WORLDS IT WAS
 * NOT TUNED ON. Changing only the seed reshuffles the same distributions;
 * changing these reshapes them, which is what actually tests whether a result
 * is a property of the detector or an artefact of the world we happened to
 * pick. Defaults reproduce the calibrated world exactly, so every existing
 * experiment is unaffected.
 */
export interface WorldParams {
  meanAmountLow: number;
  meanAmountHigh: number;
  amountCvLow: number;
  amountCvHigh: number;
  cadenceLow: number;
  cadenceHigh: number;
  /** share of the population under 30 days old */
  youngAccountShare: number;
  /** share of cardholders whose home country is not US */
  foreignHomeShare: number;
  /** share of customers carrying a second device */
  secondDeviceShare: number;
}

export const DEFAULT_WORLD_PARAMS: WorldParams = {
  meanAmountLow: 18,
  meanAmountHigh: 90,
  amountCvLow: 0.3,
  amountCvHigh: 0.75,
  cadenceLow: 0.3,
  cadenceHigh: 3.2,
  youngAccountShare: 0.08,
  foreignHomeShare: 0.18,
  secondDeviceShare: 0.25,
};

export function buildWorld(
  seed = 20260822,
  nCustomers = 1200,
  nMerchants = 300,
  params: WorldParams = DEFAULT_WORLD_PARAMS
): World {
  const rng = mulberry32(seed);
  const merchants: Merchant[] = [];
  for (let i = 0; i < nMerchants; i++) {
    const mcc = pick(rng, MCCS);
    const base: Record<MCC, number> = {
      grocery: 45, fuel: 38, restaurant: 32, electronics: 220,
      travel: 420, online_retail: 65, digital_goods: 25, luxury: 480,
    };
    merchants.push({
      id: `M${String(i + 1).padStart(4, "0")}`,
      mcc,
      mean_ticket: base[mcc] * uniform(rng, 0.6, 1.6),
      country: pick(rng, COUNTRIES),
    });
  }
  const customers: CustomerProfile[] = [];
  for (let i = 0; i < nCustomers; i++) {
    const id = `C${String(i + 1).padStart(4, "0")}`;
    const crng = mulberry32(hashSeed(id) ^ seed);
    const [active_start, active_end] = hourWindow(crng);
    const prefs: string[] = [];
    const nPrefs = int(crng, 4, 8);
    while (prefs.length < nPrefs) {
      const m = pick(crng, merchants).id;
      if (!prefs.includes(m)) prefs.push(m);
    }
    customers.push({
      id,
      mean_amount: lognormal(crng, uniform(crng, params.meanAmountLow, params.meanAmountHigh), 0.5),
      amount_cv: uniform(crng, params.amountCvLow, params.amountCvHigh),
      cadence_per_day: uniform(crng, params.cadenceLow, params.cadenceHigh),
      active_start,
      active_end,
      pref_merchants: prefs,
      device_ids: [`D-${id}-1`, ...(crng() < params.secondDeviceShare ? [`D-${id}-2`] : [])],
      // home country of the cardholder; most spend happens here
      country: crng() < 1 - params.foreignHomeShare ? "US" : pick(crng, COUNTRIES),
      // young accounts; the graph gate must tolerate them without exploding
      // false positives.
      account_age_days:
        crng() < params.youngAccountShare ? int(crng, 15, 29) : int(crng, 60, 2400),
    });
  }
  return { seed, customers, merchants, merchantIndex: new Map(merchants.map((m) => [m.id, m])) };
}

const DAY_MS = 86_400_000;

/** Deterministic legit transaction stream over `days`, starting at EPOCH_START. */
export function generateLegitStream(world: World, seed: number, days: number, epochStartMs: number): Transaction[] {
  const out: Transaction[] = [];
  for (const c of world.customers) {
    const rng = mulberry32((hashSeed(c.id) ^ seed) >>> 0);
    for (let d = 0; d < days; d++) {
      const n = poisson(rng, c.cadence_per_day);
      for (let k = 0; k < n; k++) {
        const hour = c.active_start + rng() * Math.max(1, c.active_end - c.active_start);
        const ts = epochStartMs + d * DAY_MS + hour * 3_600_000;
        const merchant =
          rng() < 0.88 ? merchantById(world, c.pref_merchants[Math.floor(rng() * c.pref_merchants.length)])! : pick(rng, world.merchants);
        const amount = lognormal(rng, c.mean_amount, c.amount_cv);
        const tsMs = Math.round(ts);
        out.push({
          tx_id: "",
          ts_ms: tsMs,
          amount: Math.round(amount * 100) / 100,
          currency: "USD",
          customer_id: c.id,
          account_id: `A-${c.id}`,
          token_id: `T-${c.id}`,
          session_id: `S-${c.id}-${Math.floor(tsMs / DAY_MS)}`,
          account_age_days: c.account_age_days,
          merchant_id: merchant.id,
          mcc: merchant.mcc,
          device_id: rng() < 0.9 ? c.device_ids[0] : c.device_ids[c.device_ids.length - 1],
          channel: ["online_retail", "digital_goods", "travel"].includes(merchant.mcc) ? "ecommerce" : "card_present",
          // genuine cross-border spend (travel, foreign e-commerce) happens,
          // but it is the exception — ~4% of a cardholder's payments
          country: rng() < 0.04 ? merchant.country : c.country,
          scenario_id: "BACKDROP",
          kind: "backdrop",
          ground_truth: "legit",
        });
      }
    }
  }
  out.sort((a, b) => a.ts_ms - b.ts_ms || a.customer_id.localeCompare(b.customer_id));
  // Stable ids assigned once at generation time — never renumbered downstream,
  // so replays stay byte-exact even when merges differ.
  out.forEach((t, i) => (t.tx_id = `BK${String(i + 1).padStart(7, "0")}`));
  return out;
}
