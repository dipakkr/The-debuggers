/**
 * Small statistics helpers. Every headline claim in this repository is a
 * proportion measured on a finite sample, so each one ships with an interval
 * or a test rather than a bare point estimate.
 */

export interface Interval {
  low: number;
  high: number;
}

/**
 * Wilson score interval for a binomial proportion. Preferred over the normal
 * (Wald) interval because fraud counts here are small and the proportions sit
 * near the ends of [0,1], where Wald intervals are badly wrong.
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): Interval {
  if (n === 0) return { low: 0, high: 0 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

export interface McNemarResult {
  /** caught before, missed after — the regressions */
  before_only: number;
  /** missed before, caught after — the improvements */
  after_only: number;
  statistic: number;
  p_value: number;
  significant_at_05: boolean;
}

/**
 * McNemar's test for two classifiers scored on the SAME transactions.
 * The before/after comparison here is paired by construction (identical
 * scenarios, identical seeds, identical legitimate pool), so an unpaired
 * two-proportion test would understate the evidence. Uses the continuity-
 * corrected chi-square, which is the standard choice once b + c >= 25, and
 * an exact binomial tail below that.
 */
export function mcnemar(beforeOnly: number, afterOnly: number): McNemarResult {
  const b = beforeOnly;
  const c = afterOnly;
  const n = b + c;
  if (n === 0) {
    return { before_only: b, after_only: c, statistic: 0, p_value: 1, significant_at_05: false };
  }
  let statistic: number;
  let p: number;
  if (n >= 25) {
    statistic = Math.pow(Math.abs(b - c) - 1, 2) / n;
    p = chiSquare1dfTail(statistic);
  } else {
    statistic = Math.min(b, c);
    // exact two-sided binomial test with p = 0.5
    let tail = 0;
    for (let k = 0; k <= Math.min(b, c); k++) tail += binomPmf(k, n, 0.5);
    p = Math.min(1, 2 * tail);
  }
  return {
    before_only: b,
    after_only: c,
    statistic: Math.round(statistic * 1e4) / 1e4,
    p_value: Math.round(p * 1e6) / 1e6,
    significant_at_05: p < 0.05,
  };
}

function binomPmf(k: number, n: number, p: number): number {
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}
function logChoose(n: number, k: number): number {
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}
/** Lanczos approximation; ample precision for the counts involved here. */
function logGamma(x: number): number {
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const z = x - 1;
  let a = 0.99999999999980993;
  for (let i = 0; i < g.length; i++) a += g[i] / (z + i + 1);
  const t = z + g.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}
/** Upper tail of the chi-square distribution with one degree of freedom. */
function chiSquare1dfTail(x: number): number {
  return erfc(Math.sqrt(x / 2));
}
/** Complementary error function, Numerical-Recipes rational approximation. */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + z / 2);
  const ans =
    t *
    Math.exp(
      -z * z - 1.26551223 +
        t * (1.00002368 +
          t * (0.37409196 +
            t * (0.09678418 +
              t * (-0.18628806 +
                t * (0.27886807 +
                  t * (-1.13520398 +
                    t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? ans : 2 - ans;
}
