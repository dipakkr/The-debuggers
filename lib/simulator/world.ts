import { mulberry32, hashSeed, uniform, int, pick, lognormal, poisson } from "../rng";
import { MCCS, MCC, Transaction, GroundTruth } from "@/lib/contracts/genome";

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

export function buildWorld(seed = 20260822, nCustomers = 1200, nMerchants = 300): World {
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
      mean_amount: lognormal(crng, uniform(crng, 18, 90), 0.5),
      amount_cv: uniform(crng, 0.3, 0.75),
      cadence_per_day: uniform(crng, 0.3, 3.2),
      active_start,
      active_end,
      pref_merchants: prefs,
      device_ids: [`D-${id}-1`, ...(crng() < 0.25 ? [`D-${id}-2`] : [])],
      country: "US",
      // ~8% of the legit population are young accounts; the graph gate must
      // tolerate them without exploding false positives.
      account_age_days: crng() < 0.08 ? int(crng, 15, 29) : int(crng, 60, 2400),
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
        out.push({
          tx_id: "",
          ts_ms: Math.round(ts),
          amount: Math.round(amount * 100) / 100,
          customer_id: c.id,
          account_age_days: c.account_age_days,
          merchant_id: merchant.id,
          mcc: merchant.mcc,
          device_id: rng() < 0.9 ? c.device_ids[0] : c.device_ids[c.device_ids.length - 1],
          channel: ["online_retail", "digital_goods", "travel"].includes(merchant.mcc) ? "ecommerce" : "card_present",
          country: merchant.country,
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
