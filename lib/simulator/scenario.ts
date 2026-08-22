import { mulberry32, hashSeed, uniform, int, pick } from "@/lib/rng";
import { Genome, Transaction } from "@/lib/contracts/genome";
import { World, merchantById, CustomerProfile } from "./world";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export interface CompiledScenario {
  transactions: Transaction[];
  customer_windows: Map<string, [number, number]>;
}

function attackerId(scenario: string, k = 0): string {
  return `X${scenario}${k > 0 ? `-${k}` : ""}`;
}

/**
 * Pure function of (genome, seed, world). Same inputs => byte-identical
 * output. This is what makes exact replay possible.
 */
export function compileScenario(
  genome: Genome,
  seed: number,
  scenario_id: string,
  world: World,
  epochStartMs: number,
  horizonDays: number
): CompiledScenario {
  const rng = mulberry32(seed);
  const windows = new Map<string, [number, number]>();
  const txs: Transaction[] = [];
  let seq = 0;
  const nextId = (kind: "A" | "W") => `${scenario_id}-${kind}${String(++seq).padStart(3, "0")}`;

  const target =
    merchantById(world, pick(rng, world.merchants.filter((m) => m.mcc === genome.merchant.mcc))) ??
    world.merchants[0];

  const [winStart, winEnd] = (() => {
    const s = int(rng, 4, 11);
    return [s, Math.min(23, s + int(rng, 10, 14))] as [number, number];
  })();

  const mkTx = (cid: string, ageDays: number, amount: number, tsMs: number, deviceId: string): Transaction => ({
    tx_id: nextId("A"),
    ts_ms: Math.round(tsMs),
    amount: Math.round(amount * 100) / 100,
    customer_id: cid,
    account_age_days: ageDays,
    merchant_id: target.id,
    mcc: target.mcc,
    device_id: deviceId,
    channel: ["online_retail", "digital_goods", "travel"].includes(target.mcc) ? "ecommerce" : "card_present",
    country: genome.device.geo_jump_km > 800 ? "ABROAD" : "US",
    scenario_id,
    kind: "attack",
    ground_truth: "fraud",
  });

  /** Warmup history so behavioural features (amt_z, new_device) are meaningful. */
  const warmupFor = (cid: string, ageDays: number, includeTargetMerchant: boolean): string => {
    windows.set(cid, [winStart, winEnd]);
    // Aged device => already enrolled in history => not "new". Otherwise fresh.
    const devId = genome.device.age_days >= 14 ? `D-${cid}` : `D-${cid}-NEW`;
    const throwaway = `D-${cid}-OLDDEV`;
    if (ageDays < 7) return devId;
    const wrng = mulberry32((hashSeed(cid) ^ seed) >>> 0);
    const nWarm = Math.max(2, Math.min(24, Math.round((ageDays / 30) * 2)));
    const warmed = genome.device.age_days >= 14;
    for (let i = 0; i < nWarm; i++) {
      const daysAgo = uniform(wrng, 1, Math.min(ageDays - 1, 60));
      const useTarget = includeTargetMerchant && i % 3 === 0;
      const m = useTarget ? target : world.merchants[Math.floor(wrng() * world.merchants.length)];
      txs.push({
        tx_id: nextId("W"),
        ts_ms: Math.round(epochStartMs - daysAgo * DAY_MS),
        amount: Math.round(uniform(wrng, 8, Math.max(12, genome.amount.base * 0.85)) * 100) / 100,
        customer_id: cid,
        account_age_days: ageDays,
        merchant_id: m.id,
        mcc: m.mcc,
        // the attack device enters history ONLY if the genome says it is aged;
        // otherwise it must stay unseen so new_device=1 holds for attack txs
        device_id: warmed && i % 2 === 0 ? devId : `${throwaway}-${i}`,
        channel: "card_present",
        country: "US",
        scenario_id,
        kind: "warmup",
        ground_truth: "legit",
      });
    }
    return devId;
  };

  const dayOffset = int(rng, 1, Math.max(1, horizonDays - 2));
  const startTs = epochStartMs + dayOffset * DAY_MS + genome.temporal.start_hour_utc * HOUR_MS;

  if (genome.family === "mule_fanout") {
    const kAccounts = Math.max(2, Math.min(8, 2 + Math.floor(genome.temporal.span_hours / 24)));
    for (let k = 1; k <= kAccounts; k++) {
      const cid = attackerId(scenario_id, k);
      const devId = warmupFor(cid, genome.identity.account_age_days, !genome.merchant.new_merchant);
      const perAcc = Math.max(2, Math.min(6, Math.floor(genome.velocity.tx_per_hour / 2)));
      let ts = startTs + uniform(rng, 0, genome.temporal.span_hours * HOUR_MS * 0.5);
      for (let j = 0; j < perAcc; j++) {
        txs.push(mkTx(cid, genome.identity.account_age_days, jittered(rng, genome), ts, devId));
        ts += gapMs(rng, genome);
      }
    }
  } else if (genome.family === "card_testing_drain") {
    const cid = attackerId(scenario_id);
    const devId = warmupFor(cid, genome.identity.account_age_days, !genome.merchant.new_merchant);
    let ts = startTs;
    for (let p = 0; p < genome.sequence.probe_count; p++) {
      txs.push(mkTx(cid, genome.identity.account_age_days, uniform(rng, 0.5, 9), ts, devId));
      ts += gapMs(rng, genome);
    }
    if (genome.sequence.drain_after_probe) {
      txs.push(
        mkTx(
          cid,
          genome.identity.account_age_days,
          genome.amount.base * genome.amount.drain_multiplier * (1 + uniform(rng, -genome.amount.jitter, genome.amount.jitter)),
          ts + gapMs(rng, genome),
          devId
        )
      );
    }
  } else {
    // low_and_slow: steady sub-threshold spend over a long window.
    const cid = attackerId(scenario_id);
    const devId = warmupFor(cid, genome.identity.account_age_days, !genome.merchant.new_merchant);
    const nMain = Math.max(1, Math.min(40, Math.floor((genome.temporal.span_hours * HOUR_MS) / genome.sequence.interarrival_s)));
    let ts = startTs;
    for (let j = 0; j < nMain; j++) {
      txs.push(mkTx(cid, genome.identity.account_age_days, jittered(rng, genome), ts, devId));
      ts += gapMs(rng, genome);
    }
  }

  return { transactions: txs, customer_windows: windows };
}

function jittered(rng: () => number, g: Genome): number {
  const amt = g.amount.base * (1 + uniform(rng, -g.amount.jitter, g.amount.jitter));
  return Math.max(0.5, amt);
}

/** Gap between consecutive attack txs. regularity=1 => near-metronomic. */
export function gapMs(rng: () => number, g: Genome): number {
  const factor = g.sequence.regularity >= 0.95 ? uniform(rng, 0.98, 1.02) : uniform(rng, 0.55, 1.45);
  return Math.max(500, g.sequence.interarrival_s * 1000 * factor);
}
