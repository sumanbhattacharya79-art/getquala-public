/** Client-side bracket headroom / marginal tax (mirrors tax_estimation/bracket_utils.py). */

const ANCHOR_YEAR = 2026;

const BRACKETS = {
  single: [
    [11925, 0.1],
    [48475, 0.12],
    [103350, 0.22],
    [197300, 0.24],
    [250525, 0.32],
    [626350, 0.35],
    [Infinity, 0.37],
  ],
  joint: [
    [23850, 0.1],
    [96950, 0.12],
    [206700, 0.22],
    [394600, 0.24],
    [501050, 0.32],
    [751600, 0.35],
    [Infinity, 0.37],
  ],
};

const LTCG_T15 = { single: 48350, joint: 96700 };
const STD_DED = { single: 15000, joint: 30000 };

const IRMAA_STANDARD = { single: 109000, joint: 218000 };
const SS_TIER1 = { single: 25000, joint: 32000 };
const SS_TIER2 = { single: 34000, joint: 44000 };

export function inflationFactor(taxYear, cpi = 0.025) {
  const y = taxYear - ANCHOR_YEAR;
  if (y <= 0) return 1;
  return (1 + cpi) ** y;
}

export function bracketTop(rate, filing, taxYear, cpi = 0.025) {
  const b = BRACKETS[filing] || BRACKETS.single;
  const f = inflationFactor(taxYear, cpi);
  const row = b.find(([, r]) => Math.abs(r - rate) < 0.001) || b[2];
  const top = row[0];
  return top === Infinity ? Infinity : top * f;
}

export function federalMarginalOnAdditional(
  baseOrdinaryTaxable,
  additionalIncome,
  filing,
  taxYear,
  cpi = 0.025
) {
  const b = BRACKETS[filing] || BRACKETS.single;
  const f = inflationFactor(taxYear, cpi);
  let tax = 0;
  let income = baseOrdinaryTaxable + additionalIncome;
  let prev = 0;
  for (const [raw, rate] of b) {
    const thresh = raw === Infinity ? Infinity : raw * f;
    const band = Math.min(income, thresh) - prev;
    if (band > 0) tax += band * rate;
    prev = thresh;
    if (income <= thresh) break;
  }
  let taxBase = 0;
  income = baseOrdinaryTaxable;
  prev = 0;
  for (const [raw, rate] of b) {
    const thresh = raw === Infinity ? Infinity : raw * f;
    const band = Math.min(income, thresh) - prev;
    if (band > 0) taxBase += band * rate;
    prev = thresh;
    if (income <= thresh) break;
  }
  return Math.max(0, tax - taxBase);
}

export function taxableSocialSecurity(ss, nonSs, exempt, filing) {
  if (ss <= 0) return 0;
  const t1 = SS_TIER1[filing] || SS_TIER1.single;
  const t2 = SS_TIER2[filing] || SS_TIER2.single;
  const combined = nonSs + exempt + 0.5 * ss;
  if (combined <= t1) return 0;
  if (combined <= t2) return Math.min(0.5 * ss, 0.5 * (combined - t1));
  return Math.min(
    0.85 * ss,
    0.85 * (combined - t2) + 0.5 * Math.min(ss, t2 - t1)
  );
}

export function magiSensitivityCurve({
  baseOrdinary = 40000,
  baseLtcg = 10000,
  ssAnnual = 24000,
  filing = "single",
  taxYear = 2026,
  cpi = 0.025,
  maxAdditional = 100000,
  step = 2000,
}) {
  const f = inflationFactor(taxYear, cpi);
  const std = (STD_DED[filing] || STD_DED.single) * f;
  const irmaaCap = (IRMAA_STANDARD[filing] || IRMAA_STANDARD.single) * f;
  const ltcg0Top = (LTCG_T15[filing] || LTCG_T15.single) * f;
  const points = [];
  for (let add = 0; add <= maxAdditional; add += step) {
    const ssTax = taxableSocialSecurity(ssAnnual, baseOrdinary + add, 0, filing);
    const ordTaxable = Math.max(0, baseOrdinary + add + ssTax - std);
    const fed = federalMarginalOnAdditional(ordTaxable - add, add, filing, taxYear, cpi);
    const totalMagi = baseOrdinary + add + baseLtcg + ssTax;
    const irmaaHit = totalMagi > irmaaCap;
    const inLtcg0 = ordTaxable + baseLtcg <= ltcg0Top;
    points.push({
      additional: add,
      federalTax: fed,
      magi: totalMagi,
      irmaaHit,
      inLtcg0Zone: inLtcg0,
      ssTorpedo: ssTax > 0 && add > 0 && ssTax / add > 0.3,
    });
  }
  return { points, irmaaCap, ltcg0Top, stdDeduction: std };
}

/** Gross tax ÷ MAGI (decimal). Uses API field when present. */
export function effectiveTaxRateFromRow(row) {
  if (!row || typeof row !== "object") return null;
  const preset = row.effective_tax_rate;
  if (preset != null && Number.isFinite(Number(preset))) return Number(preset);
  const gross = row.total_gross_tax;
  const magi = row.magi;
  if (gross == null || magi == null) return null;
  const g = Number(gross);
  const m = Number(magi);
  if (!Number.isFinite(g) || !Number.isFinite(m) || m <= 0) return null;
  return Math.max(0, g) / m;
}

export function lifetimeEffectiveTaxRate(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  let gross = 0;
  let magi = 0;
  let n = 0;
  for (const r of rows) {
    const rate = effectiveTaxRateFromRow(r);
    if (rate == null) continue;
    gross += Number(r.total_gross_tax) || 0;
    magi += Number(r.magi) || 0;
    n += 1;
  }
  if (!n || magi <= 0) return null;
  return gross / magi;
}

export function fmtEffectiveTaxPct(rate) {
  if (rate == null || !Number.isFinite(Number(rate))) return "—";
  return `${(Number(rate) * 100).toFixed(1)}%`;
}
