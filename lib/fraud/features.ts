import { Transaction, TxFeatures } from "@/lib/contracts/genome";

interface CustState {
  amounts: number[];
  ts: number[];
  devices: Set<string>;
  merchants: Set<string>;
}

interface MerchantHit {
  ts: number;
  cid: string;
  young: boolean;
  firstTouch: boolean;
  amt: number;
  ageDays: number;
}

const HOUR = 3_600_000;

export interface Featurized {
  tx: Transaction;
  f: TxFeatures;
}

function mean(a: number[]): number {
  return a.reduce((s, x) => s + x, 0) / a.length;
}
function std(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) * (x - m))));
}
function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}
export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Single deterministic pass over a time-sorted stream.
 * Same input => same features, byte for byte.
 */
export function featurize(
  sortedTxs: Transaction[],
  customerWindows: Map<string, [number, number]>
): Featurized[] {
  // per (customer|merchant) amount priors for the escalation signal
  const cmIndex = new Map<string, { ts: number; amt: number }[]>();
  for (const t of sortedTxs) {
    const k = `${t.customer_id}|${t.merchant_id}`;
    let arr = cmIndex.get(k);
    if (!arr) cmIndex.set(k, (arr = []));
    arr.push({ ts: t.ts_ms, amt: t.amount });
  }

  const cust = new Map<string, CustState>();
  const merchantHits = new Map<string, MerchantHit[]>();
  const out: Featurized[] = [];

  for (const tx of sortedTxs) {
    let cs = cust.get(tx.customer_id);
    if (!cs) {
      cs = { amounts: [], ts: [], devices: new Set(), merchants: new Set() };
      cust.set(tx.customer_id, cs);
    }
    const now = tx.ts_ms;

    // ---- features computed from history BEFORE absorbing this tx ----
    let vel_1h = 0;
    let vel_24h = 0;
    let probe_count_24h = 0;
    const recentTs: number[] = [];
    const recentAmts: number[] = [];
    for (let i = cs.ts.length - 1; i >= 0; i--) {
      const dt = now - cs.ts[i];
      if (dt > 7 * 24 * HOUR) break;
      if (dt <= HOUR) vel_1h++;
      if (dt <= 24 * HOUR) {
        vel_24h++;
        if (cs.amounts[i] < 10 && dt > 0) probe_count_24h++;
      }
      recentTs.unshift(cs.ts[i]);
      recentAmts.unshift(cs.amounts[i]);
    }

    const amt_z =
      cs.amounts.length >= 3
        ? clamp((tx.amount - mean(cs.amounts)) / Math.max(1, std(cs.amounts)), -2, 12)
        : clamp((tx.amount - 45) / 40, -2, 12); // thin-file population prior

    const win = customerWindows.get(tx.customer_id) ?? [6, 23];
    const hr = new Date(now).getUTCHours();
    const hour_outside_pref = hr < win[0] || hr > win[1] ? 1 : 0;

    const new_device = cs.devices.has(tx.device_id) ? 0 : 1;
    const new_merchant = cs.merchants.has(tx.merchant_id) ? 0 : 1;
    const young_account = tx.account_age_days < 30 ? 1 : 0;

    // escalation vs same-merchant priors within 48h
    let escalation_score = 0;
    const merchPriors: number[] = [];
    for (const e of cmIndex.get(`${tx.customer_id}|${tx.merchant_id}`) ?? []) {
      if (e.ts < now && now - e.ts <= 48 * HOUR) merchPriors.push(e.amt);
    }
    if (merchPriors.length > 0) {
      const ratio = tx.amount / Math.max(0.5, median(merchPriors));
      escalation_score = clamp((ratio - 1) / 6, 0, 1);
    }

    // metronomic-cadence + flat-amount camouflage signal over trailing week
    let pattern_score = 0;
    if (recentTs.length >= 4) {
      const seqTs = [...recentTs.slice(-4), now];
      const gaps: number[] = [];
      for (let i = 1; i < seqTs.length; i++) gaps.push(seqTs[i] - seqTs[i - 1]);
      const gapMean = mean(gaps);
      const gapCv = gapMean > 0 ? std(gaps) / gapMean : 2;
      const amtWindow = [...recentAmts.slice(-4), tx.amount];
      const amtMean = mean(amtWindow);
      const amtCv = amtMean > 0 ? std(amtWindow) / amtMean : 2;
      pattern_score = clamp(1 - 1.5 * gapCv, 0, 1) * clamp(1 - 1.5 * amtCv, 0, 1);
    }

    // graph burst: distinct OTHER young accounts paying this merchant in 24h
    let fan_out_24h = 0;
    let hits = merchantHits.get(tx.merchant_id);
    if (hits) {
      hits = hits.filter((h) => now - h.ts <= 24 * HOUR);
      merchantHits.set(tx.merchant_id, hits);
      fan_out_24h = new Set(hits.filter((h) => h.cid !== tx.customer_id && h.young).map((h) => h.cid)).size;
    }

    // newcomer burst: distinct OTHER customers whose FIRST-EVER payment at
    // this merchant happened within the trailing 48h. Convergence of many
    // first-time payer identities is the mule-network tell. Two discriminators
    // separate coordination from random walk-ins: ticket-size homogeneity and
    // identity-batch coherence (minted-together accounts share creation dates).
    const isNewPairHere = !cs.merchants.has(tx.merchant_id);
    let newcomer_count_48h = 0;
    let newcomer_burst_score = 0;
    if (hits && hits.length) {
      const nc = hits.filter((h) => h.firstTouch && h.cid !== tx.customer_id && now - h.ts <= 48 * HOUR);
      const uniq = new Map<string, { amt: number; ageDays: number }>();
      for (const h of nc.slice(-12)) if (!uniq.has(h.cid)) uniq.set(h.cid, { amt: h.amt, ageDays: h.ageDays });
      // the current tx itself joins its cohort when it is a first-touch:
      // participation in the cluster is part of the evidence
      const cohortSize = isNewPairHere ? uniq.size + 1 : uniq.size;
      newcomer_count_48h = uniq.size;
      if (cohortSize >= 1) {
        const amts = [...[...uniq.values()].map((v) => v.amt), tx.amount];
        const mAmt = mean(amts);
        const amtCv = mAmt > 0 ? std(amts) / mAmt : 2;
        // identity-batch coherence via median/MAD: one unrelated old walk-in
        // must not destroy the signal that the core cohort was minted together
        const ages = [...[...uniq.values()].map((v) => v.ageDays), tx.account_age_days];
        const medAge = median(ages);
        const madAge = median(ages.map((a) => Math.abs(a - medAge)));
        const ageCoherence = clamp(1 - madAge / Math.max(1, medAge), 0, 1);
        const convergence = Math.min(1, cohortSize / 3);
        // soft homogeneity: a single unrelated ticket size must not zero it
        const homogeneity = 0.5 + 0.5 * clamp(1 - amtCv / 0.35, 0, 1);
        newcomer_burst_score = convergence * ageCoherence * homogeneity;
      }
    }

    out.push({
      tx,
      f: {
        amt_z,
        vel_1h,
        vel_24h,
        hour_outside_pref,
        new_device,
        new_merchant,
        probe_count_24h,
        young_account,
        escalation_score,
        pattern_score,
        fan_out_24h,
        newcomer_count_48h,
        newcomer_burst_score,
      },
    });

    // ---- absorb current tx ----
    cs.amounts.push(tx.amount);
    cs.ts.push(now);
    cs.devices.add(tx.device_id);
    const wasNewMerchant = new_merchant === 1;
    cs.merchants.add(tx.merchant_id);
    let mh = merchantHits.get(tx.merchant_id);
    if (!mh) merchantHits.set(tx.merchant_id, (mh = []));
    mh.push({ ts: now, cid: tx.customer_id, young: young_account === 1, firstTouch: wasNewMerchant, amt: tx.amount, ageDays: tx.account_age_days });
  }
  return out;
}
