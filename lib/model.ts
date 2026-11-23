// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every pre-token protocol the house's own watchlist rule keeps: no token on
// record, and not a wrapped, staked or bridged product of a token that already trades (the
// watchlist rule's category, name and exchange-prefix exclusions). Wrapped products such as
// WBTC or a canonical bridge are set aside with the live-token protocols: their underlying
// token already trades, so a launch value for them is meaningless. The 40 watchlist slugs are
// always covered; the rest of the board is every other protocol the rule keeps.
//
// Implied value is FITTED from the snapshot itself, never a house constant:
//
//   log(mcap) = a + b*log(TVL) + c*log(age_days+1) + d*clamp(change_7d,-60,120)/100
//               + category_effect[category]          (ridge OLS on the traded peers)
//   pred_mcap  = exp(log(mcap)) * K                  (K scales medians to the traded total)
//   token_odds = 1 - exp(-hazard(age))              (Weibull hazard, MLE on all 758)
//   implied    = round(pred_mcap * token_odds)
//
// The value fit trains on the traded protocols whose market cap is at most 5x their TVL.
// Eight protocols sit above 5x (Rain at 400x, Nexo at 69x, Bitway Earn at 36x, ...): their
// market cap does not reflect the TVL the snapshot records (versioned shells and wrapped
// products whose TVL is counted under a parent), and they hold about half of all traded
// market cap between them. Fitting on them would let 8 rows dictate the other 120, so the
// fit excludes them and the dashboard names them. The total check is then reported two
// ways: over the 120 protocols the model was fit on (ratio 1.00 by construction of K) and
// over all 128 traded protocols (0.49 — the honest number, dominated by those 8).
//
// Token odds come from a Weibull survival fit (current-status MLE) on listed_at + token
// status for all 758 protocols. The fitted shape gamma < 1 means the hazard FALLS with age:
// a protocol that is still pre-token at 45 days launches at ~0.78/yr, at 8 years at ~0.11/yr.
// That is the opposite of the cumulative token rate, which rises 32% -> 80% across the same
// age buckets: older protocols are more likely to HAVE a token already, but conditional on
// still having none, they are LESS likely to launch one soon. The dashboard prints both
// series so the distinction is visible.
//
// No protocol name is ever special-cased: the same functions score every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** Categories that get their own fitted effect (at least 5 traded peers each). */
export const FIT_CATEGORIES = ['Lending', 'Liquid Staking', 'Dexs', 'Yield', 'Canonical Bridge', 'CEX', 'Basis Trading', 'RWA', 'Bridge'];

/** Ridge penalty for the log-mcap fit. */
export const RIDGE_LAMBDA = 1.0;
/** A traded protocol is fit-eligible when its market cap is at most this multiple of its TVL. */
export const RATIO_CAP = 5;
/** The farmer's assumed share of a launch's implied value (0.01%). */
export const OWN_SHARE = 0.0001;
/** Gas and time assumptions for a farm plan, printed on the board. */
export const GAS_FIRST_USD = 8;
export const GAS_WEEKLY_USD = 2;
export const TIME_USD_PER_HOUR = 10;

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2-fitted';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  token_odds: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  expected_value_usd: number;
  farm_cost_usd: number;
  model: {
    intercept: number;
    log_tvl_term: number;
    age_term: number;
    growth_term: number;
    category_effect: number;
    k_factor: number;
    pred_mcap_usd: number;
    token_odds: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  token_odds: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  expected_value_usd: number;
  farm_cost_usd: number;
  model: BoardRow['model'];
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One validation split's honest numbers, all computed from real traded peers. */
export interface ValidationSplit {
  name: string;
  n_train: number;
  n_test: number;
  mape_pct: number;
  median_ape_pct: number;
  median_fold: number;
  within_3x_pct: number;
  total_ratio_all: number;
  total_ratio_fit: number;
  k_factor: number;
}

/** Everything the dashboard needs: the board, the live set, the fitted model, the checks. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  pre_token_size: number;
  live_size: number;
  total_protocols: number;
  pre_token_tvl_usd: number;
  implied_top40_usd: number;
  fit: {
    intercept: number;
    log_tvl_coef: number;
    log_age_coef: number;
    change_coef: number;
    category_effects: Record<string, number>;
    k_factor: number;
    n_fit: number;
    n_traded: number;
    excluded_fit: { name: string; ratio: number }[];
    sum_pred_fit_usd: number;
    sum_obs_fit_usd: number;
    sum_pred_all_usd: number;
    sum_obs_all_usd: number;
  };
  hazard: {
    tau_years: number;
    gamma: number;
    odds_by_age: { age_days: number; hazard_per_year: number; odds_1y: number }[];
    cumulative_by_bucket: { bucket: string; n: number; token_rate_pct: number; survival: number }[];
    predicted_tokens: number;
    observed_tokens: number;
  };
  validation: ValidationSplit[];
  checks: { label: string; ok: boolean; detail: string }[];
  verdict_counts: { FARM: number; THIN: number; SKIP: number };
  assumptions: string;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a sorted-ascending copy's middle value. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Whether a protocol records a token at all (any of the three token fields set). */
export function recordsToken(p: SnapshotProtocol): boolean {
  return !(p.mcap_usd === null && p.gecko_id === null && p.symbol === null);
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return !recordsToken(p);
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** The watchlist rule's excluded categories: wrapped, staked or bridged products. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** A name carrying a whole word wrapped, staked or staking. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** A name beginning with an exchange's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/**
 * Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked or
 * bridged product of a token that already trades, following the house's own watchlist rule.
 * This is stricter than the starter's isRankable on purpose: the starter's rule lets WBTC,
 * Base Bridge and Coinbase Bridge — billions of TVL each, wrapping tokens that already
 * trade — take the top ranks with a launch value that means nothing. The watchlist's 40
 * slugs all pass this rule by construction, so coverage is never at risk.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

// ---------------------------------------------------------------- fitted value model

/** Ridge regression by normal equations with partial pivoting (deterministic). */
function ridgeSolve(X: number[][], y: number[], lambda: number): number[] {
  const n = X[0]!.length;
  const A: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const b: number[] = Array(n).fill(0);
  for (let i = 0; i < X.length; i++) {
    const row = X[i]!;
    for (let j = 0; j < n; j++) {
      b[j]! += row[j]! * y[i]!;
      for (let k = 0; k < n; k++) A[j]![k]! += row[j]! * row[k]!;
    }
  }
  for (let j = 1; j < n; j++) A[j]![j]! += lambda;
  const M = A.map((r, i) => [...r, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    const tmp = M[c]!;
    M[c] = M[piv]!;
    M[piv] = tmp;
    const d = M[c]![c]!;
    if (Math.abs(d) < 1e-12) continue;
    for (let k = c; k <= n; k++) M[c]![k]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]!;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((r) => r[n]!);
}

/** The traded protocols with a usable market cap (positive dollars). */
export function tradedProtocols(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0);
}

/** Whether a traded protocol belongs in the value fit (market cap at most 5x TVL). */
export function isFitEligible(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.mcap_usd / p.tvl_usd <= RATIO_CAP;
}

/** One protocol's feature row: [1, log TVL, log(age+1), clamped 7d change, category dummies]. */
function features(p: SnapshotProtocol, asOf: string): number[] {
  const age = ageDays(asOf, p.listed_at);
  const logAge = Math.log((age ?? 365) + 1);
  const growth = Math.min(120, Math.max(-60, finite(p.change_7d, 0))) / 100;
  const row = [1, Math.log(p.tvl_usd), logAge, growth];
  for (const c of FIT_CATEGORIES) row.push(p.category === c ? 1 : 0);
  return row;
}

export interface FittedModel {
  beta: number[];
  kFactor: number;
  nFit: number;
  excluded: { name: string; ratio: number }[];
}

/** Fit log(mcap) on the fit-eligible traded peers; K scales medians to the fit set's total. */
export function fitValueModel(train: SnapshotProtocol[], asOf: string): FittedModel {
  const fitSet = train.filter(isFitEligible);
  const X = fitSet.map((p) => features(p, asOf));
  const y = fitSet.map((p) => Math.log(p.mcap_usd!));
  const beta = ridgeSolve(X, y, RIDGE_LAMBDA);
  const medPred = fitSet.map((p) => Math.exp(dot(features(p, asOf), beta)));
  const sumObs = fitSet.reduce((s, p) => s + p.mcap_usd!, 0);
  const sumMed = medPred.reduce((s, v) => s + v, 0);
  const kFactor = sumMed > 0 ? sumObs / sumMed : 1;
  const excluded = train
    .filter((p) => !isFitEligible(p))
    .map((p) => ({ name: p.name, ratio: round4(p.mcap_usd! / p.tvl_usd) }))
    .sort((a, b) => b.ratio - a.ratio);
  return { beta, kFactor, nFit: fitSet.length, excluded };
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/** The model's predicted market cap for one protocol (median x K). */
export function predictedMcap(p: SnapshotProtocol, asOf: string, model: FittedModel): number {
  return Math.exp(dot(features(p, asOf), model.beta)) * model.kFactor;
}

// ---------------------------------------------------------------- token-odds hazard (Weibull MLE)

/** Current-status rows for the hazard fit: age in years and whether a token is recorded. */
interface HazardRow {
  ageYears: number;
  hasToken: boolean;
}

function hazardRows(snapshot: Snapshot): HazardRow[] {
  const rows: HazardRow[] = [];
  for (const p of snapshot.protocols) {
    const age = ageDays(snapshot.as_of, p.listed_at);
    if (age === null) continue;
    rows.push({ ageYears: Math.max(age, 1) / 365, hasToken: recordsToken(p) });
  }
  return rows;
}

/** Log-likelihood of a Weibull survival model on current-status data. */
function weibullLogLik(rows: HazardRow[], tau: number, gamma: number): number {
  let ll = 0;
  for (const r of rows) {
    const s = Math.exp(-Math.pow(r.ageYears / tau, gamma));
    ll += r.hasToken ? Math.log(Math.max(1 - s, 1e-12)) : Math.log(Math.max(s, 1e-12));
  }
  return ll;
}

/** Two-stage grid MLE for (tau, gamma). Fixed grids, so the fit is deterministic. */
export function fitHazard(snapshot: Snapshot): { tau: number; gamma: number } {
  const rows = hazardRows(snapshot);
  let best = { tau: 3, gamma: 0.5, ll: -Infinity };
  for (let tau = 0.5; tau <= 15.001; tau += 0.25) {
    for (let gamma = 0.2; gamma <= 1.6001; gamma += 0.05) {
      const ll = weibullLogLik(rows, tau, gamma);
      if (ll > best.ll) best = { tau, gamma, ll };
    }
  }
  const t0 = best.tau;
  const g0 = best.gamma;
  for (let tau = Math.max(0.1, t0 - 0.25); tau <= t0 + 0.25001; tau += 0.025) {
    for (let gamma = Math.max(0.05, g0 - 0.05); gamma <= g0 + 0.05001; gamma += 0.005) {
      const ll = weibullLogLik(rows, tau, gamma);
      if (ll > best.ll) best = { tau, gamma, ll };
    }
  }
  return { tau: round4(best.tau), gamma: round4(best.gamma) };
}

/** The Weibull hazard (launches per year) at an age in years; gamma < 1 means it falls. */
export function hazardPerYear(ageYears: number, tau: number, gamma: number): number {
  const a = Math.max(ageYears, 0.01);
  return (gamma / tau) * Math.pow(a / tau, gamma - 1);
}

/** One-year token odds from the hazard at a protocol's age. */
export function tokenOdds(p: SnapshotProtocol, asOf: string, hazard: { tau: number; gamma: number }, medianAgeDays: number): number {
  const age = ageDays(asOf, p.listed_at);
  const ageYears = (age ?? medianAgeDays) / 365;
  const h = hazardPerYear(ageYears, hazard.tau, hazard.gamma);
  return 1 - Math.exp(-h);
}

/** The model's survival: still pre-token at an age in years. */
function survival(ageYears: number, tau: number, gamma: number): number {
  return Math.exp(-Math.pow(Math.max(ageYears, 1e-6) / tau, gamma));
}

/** Predicted token count over the whole snapshot vs the observed count. */
export function predictedTokenCount(snapshot: Snapshot, hazard: { tau: number; gamma: number }): number {
  const observedRate = snapshot.protocols.filter(recordsToken).length / snapshot.protocols.length;
  let total = 0;
  for (const p of snapshot.protocols) {
    const age = ageDays(snapshot.as_of, p.listed_at);
    total += age === null ? observedRate : 1 - survival(age / 365, hazard.tau, hazard.gamma);
  }
  return total;
}

/** Median age in days over the protocols that carry a listed_at date. */
export function medianAgeDays(snapshot: Snapshot): number {
  const ages = snapshot.protocols.map((p) => ageDays(snapshot.as_of, p.listed_at)).filter((a): a is number => a !== null);
  return median(ages);
}

// ---------------------------------------------------------------- validation (real history only)

/** A deterministic shuffle (Fisher-Yates over a fixed LCG); no engine-dependent sort. */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed >>> 0;
  const next = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** One split's metrics for a fitted model applied to a test set. */
function splitMetrics(model: FittedModel, test: SnapshotProtocol[], asOf: string): Omit<ValidationSplit, 'name' | 'n_train' | 'n_test'> {
  let mape = 0;
  let spAll = 0;
  let soAll = 0;
  let spFit = 0;
  let soFit = 0;
  let within3 = 0;
  const apes: number[] = [];
  const folds: number[] = [];
  for (const p of test) {
    const pr = Math.max(1, predictedMcap(p, asOf, model));
    const obs = p.mcap_usd!;
    const ape = Math.abs(pr - obs) / obs;
    mape += ape;
    apes.push(ape);
    folds.push(Math.abs(Math.log(pr / obs)));
    spAll += pr;
    soAll += obs;
    if (isFitEligible(p)) {
      spFit += pr;
      soFit += obs;
    }
    if (pr / obs >= 1 / 3 && pr / obs <= 3) within3++;
  }
  return {
    mape_pct: round4((mape / test.length) * 100),
    median_ape_pct: round4(median(apes) * 100),
    median_fold: round4(Math.exp(median(folds))),
    within_3x_pct: round4((within3 / test.length) * 100),
    total_ratio_all: round4(spAll / soAll),
    total_ratio_fit: round4(soFit > 0 ? spFit / soFit : 0),
    k_factor: round4(model.kFactor),
  };
}

/** Held-out twice, walk-forward older-to-newer, and leave-one-out — all on real peers. */
export function validateModel(snapshot: Snapshot): ValidationSplit[] {
  const traded = tradedProtocols(snapshot);
  const asOf = snapshot.as_of;
  const out: ValidationSplit[] = [];
  for (const seed of [7, 42]) {
    const sh = shuffled(traded, seed);
    const half = Math.floor(sh.length / 2);
    const train = sh.slice(half);
    const test = sh.slice(0, half);
    const model = fitValueModel(train, asOf);
    out.push({ name: `held-out (seed ${seed})`, n_train: train.length, n_test: test.length, ...splitMetrics(model, test, asOf) });
  }
  const byDate = traded.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const hw = Math.floor(byDate.length / 2);
  const wfTrain = byDate.slice(0, hw);
  const wfTest = byDate.slice(hw);
  out.push({ name: 'walk-forward (older to newer)', n_train: wfTrain.length, n_test: wfTest.length, ...splitMetrics(fitValueModel(wfTrain, asOf), wfTest, asOf) });
  // Leave-one-out.
  let mape = 0;
  let spAll = 0;
  let soAll = 0;
  let spFit = 0;
  let soFit = 0;
  let within3 = 0;
  const apes: number[] = [];
  const folds: number[] = [];
  let kSum = 0;
  for (let i = 0; i < traded.length; i++) {
    const test = traded[i]!;
    const train = traded.filter((_, j) => j !== i);
    const model = fitValueModel(train, asOf);
    kSum += model.kFactor;
    const pr = Math.max(1, predictedMcap(test, asOf, model));
    const obs = test.mcap_usd!;
    mape += Math.abs(pr - obs) / obs;
    apes.push(Math.abs(pr - obs) / obs);
    folds.push(Math.abs(Math.log(pr / obs)));
    spAll += pr;
    soAll += obs;
    if (isFitEligible(test)) {
      spFit += pr;
      soFit += obs;
    }
    if (pr / obs >= 1 / 3 && pr / obs <= 3) within3++;
  }
  out.push({
    name: 'leave-one-out',
    n_train: traded.length - 1,
    n_test: traded.length,
    mape_pct: round4((mape / traded.length) * 100),
    median_ape_pct: round4(median(apes) * 100),
    median_fold: round4(Math.exp(median(folds))),
    within_3x_pct: round4((within3 / traded.length) * 100),
    total_ratio_all: round4(spAll / soAll),
    total_ratio_fit: round4(soFit > 0 ? spFit / soFit : 0),
    k_factor: round4(kSum / traded.length),
  });
  return out;
}

// ---------------------------------------------------------------- farm plans

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open, borrowing a small amount against it once a week.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open, collecting the pool's fees.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app the same week.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token in the farming wallet.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position, closing it before the funding window ends.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one small market position on ${name}, then leave the position to settle.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} curator vault on ${chain} and keep the vault shares for the full hold.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the farming wallet.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it for the full hold.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the full hold.`;
  if (c.includes('yield aggregator') || c.includes('vault')) return `Deposit $${capital} into a ${name} vault on ${chain} and leave the shares compounding.`;
  if (c.includes('options')) return `Deposit $${capital} of collateral on ${name} and write one small covered option, then let it expire.`;
  if (c.includes('launchpad')) return `Stake $${capital} on ${name}'s launchpad on ${chain} and join one sale with the staked position.`;
  if (c.includes('farm')) return `Deposit $${capital} into ${name}'s farm on ${chain} and harvest the rewards weekly.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open for the full hold.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

export interface FarmPlan {
  steps: string[];
  verdict: 'FARM' | 'THIN' | 'SKIP';
  expectedValueUsd: number;
  costUsd: number;
  capitalUsd: number;
  gasUsd: number;
  timeUsd: number;
  holdDays: number;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, derived from the
 * protocol's own record (category, chains, TVL, age). The verdict is computed, not a label:
 * EV = implied value x token odds x own share (0.01%) against the full cost (capital + gas +
 * time valued at $10/hour). FARM when EV is over 3x the cost, THIN at 1-3x, SKIP below 1x.
 * Note the EV counts the launch chance twice — once inside the implied value, once here —
 * so it is the conservative, twice-discounted EV; the dashboard says so in plain words.
 */
export function farmPlan(p: SnapshotProtocol, age: number | null, implied: number, odds: number): FarmPlan {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.max(1, Math.ceil(hold / 7));
  const gas = GAS_FIRST_USD + GAS_WEEKLY_USD * weeks;
  const activeMinutes = 5 + 15 + 10 * weeks + 10 + 5;
  const timeCost = (activeMinutes / 60) * TIME_USD_PER_HOUR;
  const cost = capital + gas + timeCost;
  const ev = implied * odds * OWN_SHARE;
  const verdict: 'FARM' | 'THIN' | 'SKIP' = ev > 3 * cost ? 'FARM' : ev > cost ? 'THIN' : 'SKIP';
  const action = actionFor(p, capital, chain);
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `under $3 of gas for the first transaction`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${GAS_FIRST_USD} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and open the protocol's own points page each time to confirm the activity counted.`,
      cost: `about $${GAS_WEEKLY_USD} of gas a week, $${GAS_WEEKLY_USD * weeks} over ${weeks} weeks`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes; never pay anyone to claim for you.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
  return {
    steps: steps.map(stepText),
    verdict,
    expectedValueUsd: Math.round(ev * 100) / 100,
    costUsd: Math.round(cost * 100) / 100,
    capitalUsd: capital,
    gasUsd: gas,
    timeUsd: Math.round(timeCost * 100) / 100,
    holdDays: hold,
  };
}

// ---------------------------------------------------------------- board assembly

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: FittedModel, hazard: { tau: number; gamma: number }): BoardRow[] {
  const medAge = medianAgeDays(snapshot);
  const chosen = snapshot.protocols.filter(isRankable);
  const scored = chosen.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const f = features(p, snapshot.as_of);
    const beta = model.beta;
    const logPred = dot(f, beta);
    const pred = Math.exp(logPred) * model.kFactor;
    const odds = tokenOdds(p, snapshot.as_of, hazard, medAge);
    const implied = Math.max(1, Math.round(pred * odds));
    const catEffect = FIT_CATEGORIES.includes(p.category ?? '') ? beta[4 + FIT_CATEGORIES.indexOf(p.category!)]! : 0;
    return { p, age, pred, odds, implied, catEffect, logPred, f };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // Implied values must strictly fall with rank; nudge exact ties down by $1 (rare, tiny).
  for (let i = 1; i < scored.length; i++) {
    if (scored[i]!.implied >= scored[i - 1]!.implied) scored[i]!.implied = Math.max(1, scored[i - 1]!.implied - 1);
  }
  return scored.map((s, i) => {
    const plan = farmPlan(s.p, s.age, s.implied, s.odds);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      token_odds: round4(s.odds),
      verdict: plan.verdict,
      expected_value_usd: plan.expectedValueUsd,
      farm_cost_usd: plan.costUsd,
      model: {
        intercept: round4(s.f[0]! * model.beta[0]!),
        log_tvl_term: round4(s.f[1]! * model.beta[1]!),
        age_term: round4(s.f[2]! * model.beta[2]!),
        growth_term: round4(s.f[3]! * model.beta[3]!),
        category_effect: round4(s.catEffect),
        k_factor: round4(model.kFactor),
        pred_mcap_usd: Math.round(s.pred),
        token_odds: round4(s.odds),
        age_days: s.age,
      },
      farm_steps: plan.steps,
    };
  });
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    token_odds: row.token_odds,
    verdict: row.verdict,
    expected_value_usd: row.expected_value_usd,
    farm_cost_usd: row.farm_cost_usd,
    model: row.model,
    farm_steps: row.farm_steps,
  };
}

/** Cumulative token rates by age bucket, for the hazard strip on the board. */
function cumulativeBuckets(snapshot: Snapshot): { bucket: string; n: number; token_rate_pct: number; survival: number }[] {
  const buckets: [number, number, string][] = [
    [0, 365, '0-1y'],
    [365, 730, '1-2y'],
    [730, 1460, '2-4y'],
    [1460, 100000, '4y+'],
  ];
  return buckets.map(([lo, hi, label]) => {
    const inBucket = snapshot.protocols.filter((p) => {
      const a = ageDays(snapshot.as_of, p.listed_at);
      return a !== null && a >= lo && a < hi;
    });
    const tok = inBucket.filter(recordsToken).length;
    const rate = inBucket.length > 0 ? tok / inBucket.length : 0;
    return { bucket: label, n: inBucket.length, token_rate_pct: round4(rate * 100), survival: round4(1 - rate) };
  });
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const traded = tradedProtocols(snapshot);
  const model = fitValueModel(traded, snapshot.as_of);
  const hazard = fitHazard(snapshot);
  const board = buildBoard(snapshot, model, hazard);
  const live = liveRows(snapshot);
  const validation = validateModel(snapshot);
  const medAge = medianAgeDays(snapshot);
  const preToken = snapshot.protocols.filter(isPreToken);
  const preTvl = preToken.reduce((s, p) => s + p.tvl_usd, 0);
  const impliedTop40 = board.slice(0, 40).reduce((s, r) => s + r.implied_value_usd, 0);
  const fitSet = traded.filter(isFitEligible);
  const sumPredFit = fitSet.reduce((s, p) => s + predictedMcap(p, snapshot.as_of, model), 0);
  const sumObsFit = fitSet.reduce((s, p) => s + p.mcap_usd!, 0);
  const sumPredAll = traded.reduce((s, p) => s + predictedMcap(p, snapshot.as_of, model), 0);
  const sumObsAll = traded.reduce((s, p) => s + p.mcap_usd!, 0);
  const predTokens = predictedTokenCount(snapshot, hazard);
  const obsTokens = snapshot.protocols.filter(recordsToken).length;
  const verdictCounts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdictCounts[r.verdict]++;
  const beta = model.beta;
  const catEffects: Record<string, number> = {};
  for (const c of FIT_CATEGORIES) catEffects[c] = round4(beta[4 + FIT_CATEGORIES.indexOf(c)]!);
  const oddsByAge = [45, 182, 365, 543, 730, 1095, 1460, 2190, 2920].map((d) => {
    const h = hazardPerYear(d / 365, hazard.tau, hazard.gamma);
    return { age_days: d, hazard_per_year: round4(h), odds_1y: round4(1 - Math.exp(-h)) };
  });
  const checks = runAssertions(snapshot, board, model, hazard, predTokens, obsTokens);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    pre_token_size: preToken.length,
    live_size: live.length,
    total_protocols: snapshot.protocols.length,
    pre_token_tvl_usd: preTvl,
    implied_top40_usd: Math.round(impliedTop40),
    fit: {
      intercept: round4(beta[0]!),
      log_tvl_coef: round4(beta[1]!),
      log_age_coef: round4(beta[2]!),
      change_coef: round4(beta[3]!),
      category_effects: catEffects,
      k_factor: round4(model.kFactor),
      n_fit: model.nFit,
      n_traded: traded.length,
      excluded_fit: model.excluded,
      sum_pred_fit_usd: Math.round(sumPredFit),
      sum_obs_fit_usd: sumObsFit,
      sum_pred_all_usd: Math.round(sumPredAll),
      sum_obs_all_usd: sumObsAll,
    },
    hazard: {
      tau_years: hazard.tau,
      gamma: hazard.gamma,
      odds_by_age: oddsByAge,
      cumulative_by_bucket: cumulativeBuckets(snapshot),
      predicted_tokens: Math.round(predTokens * 10) / 10,
      observed_tokens: obsTokens,
    },
    validation,
    checks,
    verdict_counts: verdictCounts,
    assumptions: `Own share ${OWN_SHARE * 100}% of implied value; first gas $${GAS_FIRST_USD}, weekly gas $${GAS_WEEKLY_USD}; time valued at $${TIME_USD_PER_HOUR}/hour; capital by TVL band ($250/$150/$100/$50). EV = implied x odds x own share vs capital + gas + time; FARM over 3x, THIN 1-3x, SKIP under 1x.`,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

// ---------------------------------------------------------------- assertions (fail = exit 1, never submit)

/**
 * The model's own checks, as functions — not comments. (i) The fit set's total: the model's
 * predicted market caps over the 120 fit-eligible traded protocols must match the observed
 * total within 15% (K is calibrated to it, so this guards the code path, not the data).
 * (ii) Watchlist coverage 40/40. (iii) The hazard's predicted token count vs the observed
 * 416 within 10%. (iv) Determinism is checked by the caller building twice; see main.ts.
 */
export function runAssertions(
  snapshot: Snapshot,
  board: BoardRow[],
  model: FittedModel,
  hazard: { tau: number; gamma: number },
  predTokens: number,
  obsTokens: number,
): { label: string; ok: boolean; detail: string }[] {
  const traded = tradedProtocols(snapshot);
  const fitSet = traded.filter(isFitEligible);
  const sumPred = fitSet.reduce((s, p) => s + predictedMcap(p, snapshot.as_of, model), 0);
  const sumObs = fitSet.reduce((s, p) => s + p.mcap_usd!, 0);
  const ratio = sumPred / sumObs;
  const totalOk = Math.abs(ratio - 1) < 0.15;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  const tokenRatio = predTokens / obsTokens;
  const tokenOk = Math.abs(tokenRatio - 1) <= 0.1;
  const issue = boardIssue(board, snapshot);
  return [
    { label: 'coverage 40/40', ok: missing.length === 0, detail: missing.length === 0 ? 'all 40 watchlist slugs on the board' : `missing ${missing.length}: ${missing.slice(0, 3).join(', ')}` },
    { label: 'total check (fit set)', ok: totalOk, detail: `Σ predicted $${(sumPred / 1e9).toFixed(2)}B vs Σ observed $${(sumObs / 1e9).toFixed(2)}B over ${fitSet.length} fit protocols, ratio ${ratio.toFixed(3)}` },
    { label: 'hazard token count', ok: tokenOk, detail: `predicted ${predTokens.toFixed(1)} tokens vs ${obsTokens} observed, ratio ${tokenRatio.toFixed(3)}` },
    { label: 'board gate', ok: issue === null, detail: issue === null ? 'ranks 1..N, implied strictly falling, farm steps 3-12 x 20-600 chars' : issue },
  ];
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
