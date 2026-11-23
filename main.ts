// Token Radar's entry program (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>),
// fits the value model and the token-odds hazard from that snapshot in lib/model.ts, scores
// every pre-token protocol the watchlist rule keeps, writes the ranked board to
// /output/board.json, and copies this repository's dashboard/ and screenshots/ to /output.
// Last, it writes /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library. The dashboard is a static page, no framework and no network:
// dashboard/index.html, dashboard/app.css and dashboard/app.js read /output/data.js, which
// this program writes from the same board.
//
// Before writing anything the program runs the model's own assertions (lib/model.ts
// runAssertions): watchlist coverage, the fit set's total check, the hazard's token count,
// and the board gate. Any failure exits 1 and writes nothing. It also builds the radar
// twice in-process and refuses to continue unless both builds are byte-identical.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));

// Build twice in-process: the two builds must be byte-identical, or nothing is written.
const first = buildRadar(snapshot);
const second = buildRadar(snapshot);
const firstJson = JSON.stringify({ rows: first.board });
const secondJson = JSON.stringify({ rows: second.board });
const firstData = dataScript(first.radar);
const secondData = dataScript(second.radar);
if (firstJson !== secondJson || firstData !== secondData) {
  process.stderr.write('token radar: the two in-process builds differ: refusing to write a non-deterministic board\n');
  process.exit(1);
}
const { board, radar } = first;

const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}
const failed = radar.checks.filter((c) => !c.ok);
if (failed.length > 0) {
  for (const c of failed) process.stderr.write(`token radar: assertion failed: ${c.label}: ${c.detail}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${firstJson}\n`);
writeFileSync(join(out, 'data.js'), firstData);

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const top = board[0]!;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.pre_token_size} pre-token, ${radar.live_size} live set aside)\n` +
    `token radar: #1 ${top.name} $${top.implied_value_usd.toLocaleString('en-US')} (odds ${top.token_odds}, ${top.verdict}); top-40 implied $${(radar.implied_top40_usd / 1e9).toFixed(2)}B\n` +
    `token radar: fit log(mcap) = ${radar.fit.intercept} + ${radar.fit.log_tvl_coef}*logTVL + ${radar.fit.log_age_coef}*log(age+1) + ${radar.fit.change_coef}*chg, K=${radar.fit.k_factor}, n=${radar.fit.n_fit} fit / ${radar.fit.n_traded} traded\n` +
    `token radar: hazard Weibull tau=${radar.hazard.tau_years}y gamma=${radar.hazard.gamma}; predicted ${radar.hazard.predicted_tokens} tokens vs ${radar.hazard.observed_tokens} observed\n` +
    radar.validation.map((v) => `token radar: ${v.name}: median fold ${v.median_fold}x, within-3x ${v.within_3x_pct}%, total ratio (fit) ${v.total_ratio_fit}, (all) ${v.total_ratio_all}, MAPE ${v.mape_pct}%\n`).join('') +
    radar.checks.map((c) => `token radar: check ${c.ok ? 'PASS' : 'FAIL'} ${c.label}: ${c.detail}\n`).join('') +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')}, ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
