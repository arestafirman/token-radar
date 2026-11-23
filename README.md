# Token Radar — pre-token protocols ranked by fitted implied value

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/arestafirman/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/arestafirman/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

Entry for [token-radar-01](https://make.fun/bounty/token-radar-01): a program that reads the
sealed DefiLlama snapshot (2026-11-14, 758 protocols) and writes a dashboard ranking the
pre-token protocols by implied launch value, each with a costed farm plan and a FARM / THIN /
SKIP verdict.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

`main.ts` (Node 22, stdlib only) writes `board.json`, `data.js`, `dashboard/`,
`screenshots/` and `dossier.json` to the output directory. It builds the radar twice
in-process and writes nothing unless both builds are byte-identical; the model assertions
(coverage, total check, hazard token count, board gate) must all pass or it exits 1.

## Model (fitted from the snapshot, not assumed)

- Value: `log(mcap) = 4.1163 + 0.5739·log(TVL) + 0.2461·log(age+1) − 0.3867·chg7d/100
  + category effect`, ridge OLS on 120 traded peers (market cap ≤ 5× TVL), × K 2.7112
  to scale medians to the fit set's total. Category effects run from −0.87 (Liquid
  Staking) to +0.74 (Basis Trading). Eight protocols above 5× mcap/TVL (Rain 400×, Nexo
  69×, Bitway Earn 36×, …) are excluded from the fit and named on the board — they hold
  about half of all traded market cap.
- Token odds: Weibull survival MLE on `listed_at` + token status for all 758 protocols
  (τ 2.975y, γ 0.54). Odds **fall** with age: 1-year odds 0.54 at 45 days, 0.11 at 8
  years — while the cumulative token rate rises 32% → 80% across the same buckets.
  The hazard predicts 391.5 tokens vs 416 observed.
- Implied value = predicted market cap × token odds. Board: 198 rows (all 40 watchlist
  slugs covered), #1 Sentora Curator $47.01M, #2 Steakhouse Financial $45.71M.
  Wrapped, staked and bridged products (WBTC, Base Bridge, …) are set aside with the
  live-token protocols: their underlying token already trades.

## Validation (real traded peers, no synthetic tests)

| Split | Median fold | Within 3× | Total ratio (fit) |
|---|---|---|---|
| Held-out, seed 7 | 4.39× | 31% | 0.93 |
| Held-out, seed 42 | 4.59× | 41% | 0.70 |
| Walk-forward (older → newer) | 3.50× | 46% | 1.10 |
| Leave-one-out | 3.56× | 43% | 0.95 |

Read the median fold, not MAPE: mcap/TVL spans 100×, so a handful of tiny-cap
protocols dominate MAPE (held-out MAPE 825–7,031%). The total ratio over **all**
128 traded protocols is 0.49 in-sample — the honest number, dominated by the 8
excluded outliers above.

## Farm verdicts

EV = implied value × token odds × 0.01% own share vs cost (capital $50–250 by TVL
band + gas + time at $10/hour). FARM over 3× cost, THIN 1–3×, SKIP under 1×.
Board mix: 19 FARM, 82 THIN, 97 SKIP. The EV counts the launch chance twice (once
inside implied, once in the EV) — deliberately conservative, and the board says so.

## Files

- `main.ts` — entrypoint: read snapshot, assert, write board + dashboard + dossier
- `lib/model.ts` — fitted value model, Weibull hazard, validation, farm plans
- `vendor/makefun-board.ts` — make.fun dossier library, byte-identical with the kit
- `dashboard/` — static page (index.html, app.css, app.js), renders offline from data.js
- `screenshots/` — 1-board.jpg, 2-detail.jpg, 3-filtered.jpg, rendered from this dashboard
