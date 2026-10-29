// Plays the page Pages serves and a new build of it interleaved in Chrome, uncapped, and says whether the build plays
// worse (the A/B), or with --smoke plays the build once in Firefox for what only Firefox turns up (the smoke play): the
// retest's two checks (docs/publishing.md, The retest), one game a run.
//
//   node tools/ab_pages.mjs <game> <Pages URL> <build dir or its .html> <rom> <plan.json> --pages-build <label>
//     --build <label> [--smoke] [--record <file>] [--note <text>] [--size <w>x<h>] [--cpu-throttle <rate>] [--port <n>]
//     [--firefox <path>] [--preload <file>] [--out <dir>] [-- <queue command>...]
//
// <game> is publish_pages.sh's name (play_page.mjs's --game), the Pages URL the fork's page (index.html is played
// there, as publish_page.sh puts it up), the build one publish_pages.sh left: its dir if the plan's page is in it,
// else its <name>.html (a plan whose page is index.html, which only Pages has). --pages-build is what Pages' page was
// built from (its tag), --build the build's (the new tag); both go into --record's lines as play_page's --build.
// --firefox is Firefox's executable where page_driver.mjs finds none (play_page's --browser). A browser the run needs that
// isn't there ends it before any play, exit 1, rather than as plays with no summary and a verdict on them.
//
// Each play is one play_page.mjs run of the plan, uncapped at --size (3840x2000, the stand-in's) on a fresh profile.
// The A/B: Chrome Pages, build, then build, Pages unless the first pair is clearly within the noise (the build run
// clean and no more than 5% below Pages'). --cpu-throttle <rate> throttles Chrome's CPU that much (0, unthrottled,
// without). Played in turn, a host that changes under the series reads on both. A first Pages play that fails stops the
// series there: every play after it would stand on the same broken plan or host. --smoke: Firefox the build once, and
// the page Pages serves the same way only if the build's play failed or had WebGPU errors or exceptions. Firefox on
// Windows is held to 30-45 presents a second on integrated graphics by its compositor (docs/findings.md), so its
// presents mostly re-measure that, but it has turned up bugs Chrome didn't (a DMA race, an OOM): its play is read for a
// failed run, WebGPU errors and exceptions, never for presents. A run's line in --record (plays.jsonl) carries a --note
// saying it was one of these (the --note given added), so play_page compares it with nothing: this does. Its --set is
// <game>-<build>-<out's name>, its --role baseline for Pages and candidate for the build. --port is play_page's (a free
// one without). --preload is play_page's, for every play with its --interval 1, and goes into the note: an A/B of how
// much heap a build takes (tools/heap_probe.js), each play's `heap` lines in its log. A queue command after -- goes in
// front of every play, so each takes its own turn on a shared GPU (CLAUDE.md, Playing a page): the A/B's a whole turn,
// the smoke play's a shared one (docs/playing.md, What a change plays). Each play's output goes to
// <out>/<n>-<browser>-<pages|build>.log, its summary beside it as .json, and the plan's shot steps write into <out>
// (its cwd); --out is a new temporary dir without it, kept and named at the end. Run again with the same --out, it
// reads the plays that have a summary there and plays the rest: queue waits can add up to hours, longer than what
// started it may live, and a play stopped part way records nothing.
//
// A Chrome build run is worse when it fails where a Pages run didn't, has WebGPU errors where none of those had any, or
// presents a second more than 10% below the lowest of theirs, play_page's own noise for an uncapped run. The build plays
// worse only if every one of its runs is, and two at least: one worse run gets another pair (build, then Pages) and the
// runs are read again. A run the host slept through fails in play_page and is played again once. Then a table, presents
// a second (each run's median, F a failed run, E<n> its WebGPU errors, X<n> its exceptions), and a verdict: "worse"
// (exit 3), the build not to be published; "not clean" (exit 1), Pages' first play failed, or no worse but a build run
// failed or had WebGPU errors or exceptions, to look at before it is; "no worse" (exit 0). The smoke play's verdict:
// "clean" (exit 0); "worse" (exit 3), the build's play not clean where Pages' is; "not clean" (exit 1), Pages' play
// not clean either, to be filed, the build no worse for it.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { browserExecutable, missingPlanFiles, option } from './page_driver.mjs';

const args = process.argv.slice(2);
const dash = args.indexOf('--');
const queue = dash >= 0 ? args.splice(dash).slice(1) : [];
const pagesBuild = option(args, '--pages-build', null);
const build = option(args, '--build', null);
const recordFile = option(args, '--record', null);
const note = option(args, '--note', null);
const size = option(args, '--size', '3840x2000');
const throttle = Number(option(args, '--cpu-throttle', '0'));
const port = option(args, '--port', null);
const outOption = option(args, '--out', null);
const firefox = option(args, '--firefox', null);
const preload = option(args, '--preload', null);
const smoke = args.includes('--smoke');
if (smoke) args.splice(args.indexOf('--smoke'), 1);
if (args.length !== 5 || !pagesBuild || !build) {
  console.error('usage: node tools/ab_pages.mjs <game> <Pages URL> <build dir or its .html> <rom> <plan.json> --pages-build <label> ' +
    '--build <label> [--smoke] [--record <file>] [--note <text>] [--size <w>x<h>] [--cpu-throttle <rate>] [--port <n>] [--firefox <path>] [--preload <file>] [--out <dir>] [-- <queue command>...]');
  process.exit(1);
}
const [game, pagesUrl, buildPath, rom, planFile] = args.map((a, i) => (i >= 2 && !/^https?:/.test(a) ? path.resolve(a) : a));
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
try { smoke ? browserExecutable('firefox', firefox) : browserExecutable('chrome'); } catch (error) {
  console.error(`${error.message}${smoke ? ': give its executable with --firefox' : ''}`);
  process.exit(1);
}
if (missingPlanFiles(plan, planFile).length) {
  console.error(`the plan's evalFile steps name files that aren't there: ${missingPlanFiles(plan, planFile).join(', ')}`);
  process.exit(1);
}
const pagesWhere = /\.html$/.test(pagesUrl) ? pagesUrl : pagesUrl.replace(/\/?$/, '/index.html');
if (!/\.html$/.test(buildPath) && !fs.existsSync(path.join(buildPath, plan.page || 'index.html'))) {
  console.error(`the plan's page ${plan.page || 'index.html'} isn't in ${buildPath}: give the build's <name>.html`);
  process.exit(1);
}
const out = path.resolve(outOption ?? fs.mkdtempSync(path.join(os.tmpdir(), 'ab-pages-')));
fs.mkdirSync(out, { recursive: true });
const record = recordFile && path.resolve(recordFile);
const playPage = fileURLToPath(new URL('./play_page.mjs', import.meta.url));

const chrome = { name: throttle > 1 ? `chrome ${throttle}x` : 'chrome', browser: 'chrome', throttle, runs: [] };
const firefoxSmoke = { name: 'firefox', browser: 'firefox', runs: [] };
const conditions = smoke ? [firefoxSmoke] : [chrome];
let count = 0;
const slept = (r) => /^the host's clock jumped/.test(r.failed ?? '');
const clean = (r) => !r.failed && !r.errors && !r.exceptions;

const playOnce = async (condition, which) => {
  const n = ++count;
  const name = `${n}-${condition.browser}-${which === 'P' ? 'pages' : 'build'}`;
  const json = path.join(out, `${name}.json`);
  const done = fs.existsSync(json);
  const runNote = [smoke ? (which === 'P' ? `the page Pages serves, a smoke play after the ${build} build's wasn't clean` :
    `the ${build} build served locally, a smoke play`) : which === 'P' ? `the page Pages serves, interleaved with the ${build} build` :
    `the ${build} build served locally, interleaved with Pages' ${pagesBuild}`, 'tools/ab_pages.mjs',
    preload && `--preload ${path.basename(preload)}`, note].filter(Boolean).join('; ');
  const command = [...queue, process.execPath, playPage, condition.browser, which === 'P' ? pagesWhere : buildPath, rom, planFile,
    '--uncapped', '--size', size, ...(port ? ['--port', port] : []), '--json', json, ...(firefox && condition.browser === 'firefox' ? ['--browser', firefox] : []), ...(condition.throttle > 1 ? ['--cpu-throttle', String(condition.throttle)] : []),
    ...(preload ? ['--preload', path.resolve(preload), '--interval', '1'] : []),
    ...(record ? ['--record', record, '--game', game, '--build', which === 'P' ? pagesBuild : build, '--note', runNote,
      '--set', `${game}-${build}-${path.basename(out)}`, '--role', which === 'P' ? 'baseline' : 'candidate'] : [])];
  process.stdout.write(`${new Date().toISOString().slice(11, 19)} ${n}. ${condition.name}, ${which === 'P' ? `Pages (${pagesBuild})` : `the build (${build})`}: ` +
    (done ? '(played before) ' : ''));
  let code = 0;
  if (!done) {
    const logFd = fs.openSync(path.join(out, `${name}.log`), 'w');
    code = await new Promise((resolve) => {
      const child = spawn(command[0], command.slice(1), { cwd: out, stdio: ['ignore', logFd, logFd] });
      child.on('error', (error) => resolve(error.message));
      child.on('exit', resolve);
    });
    fs.closeSync(logFd);
  }
  const summary = fs.existsSync(json) ? JSON.parse(fs.readFileSync(json, 'utf8'))
    : { failed: `play_page gave no summary (exit ${code}; ${name}.log)` };
  const run = { which, median: summary.presents?.median ?? null, failed: summary.failed ?? (summary.presents ? null : 'no presents'),
    errors: summary.webgpuErrors?.length ?? 0, exceptions: summary.exceptions ?? 0, p99Ms: summary.frames?.p99Ms ?? null };
  console.log(run.failed ? `failed: ${run.failed}` : `${run.median.toFixed(1)} presents/s, p99 gap ${run.p99Ms} ms` +
    (run.errors ? `, ${run.errors} WebGPU errors` : '') + (run.exceptions ? `, ${run.exceptions} exceptions` : ''));
  return run;
};
const play = async (condition, which) => {
  let run = await playOnce(condition, which);
  if (slept(run)) run = await playOnce(condition, which);
  condition.runs.push(run);
};

// Why one build run plays worse than the condition's Pages runs, or null.
const worse = (condition, run) => {
  const pages = condition.runs.filter((r) => r.which === 'P' && !slept(r));
  const fine = pages.filter((r) => !r.failed);
  if (run.failed) return fine.length ? `failed (${run.failed})` : null;
  if (run.errors && pages.every((r) => !r.errors)) return `${run.errors} WebGPU errors`;
  const lowest = Math.min(...fine.map((r) => r.median));
  return fine.length && run.median < lowest * 0.9 ? `${run.median.toFixed(1)} presents/s, below ${lowest.toFixed(1)} by over 10%` : null;
};
const builds = (condition) => condition.runs.filter((r) => r.which === 'B' && !slept(r));

// The first pair is clearly within the noise: its build run clean and no more than 5% below Pages'.
const withinNoise = (condition) => {
  const [run] = builds(condition);
  const fine = condition.runs.filter((r) => r.which === 'P' && !slept(r) && !r.failed);
  return Boolean(run) && clean(run) && fine.length > 0 && run.median >= Math.min(...fine.map((r) => r.median)) * 0.95;
};

if (smoke) {
  await play(firefoxSmoke, 'B');
  if (!clean(firefoxSmoke.runs.at(-1))) {
    console.log(`firefox: the build's play isn't clean, so Pages is played the same way`);
    await play(firefoxSmoke, 'P');
  }
} else {
  await play(chrome, 'P');
  if (chrome.runs[0].failed) {
    console.log(`verdict: not clean, Pages' first play failed, so the series stops there: fix the plan or the host and play ` +
      `it again with a new --out (logs: ${out})`);
    process.exit(1);
  }
  await play(chrome, 'B');
  if (withinNoise(chrome)) console.log(`${chrome.name}: the first pair is within the noise, so no second`);
  else {
    await play(chrome, 'B');
    await play(chrome, 'P');
    const runs = builds(chrome);
    if (runs.length < 2 && runs.every((r) => worse(chrome, r))) {
      console.log(`${chrome.name}: the build's one run reads worse, so another pair`);
      await play(chrome, 'B');
      await play(chrome, 'P');
    }
  }
}

const median = (values) => {
  const v = [...values].sort((a, b) => a - b);
  return v.length ? (v[(v.length - 1) >> 1] + v[v.length >> 1]) / 2 : null;
};
const cell = (runs) => {
  const each = runs.map((r) => (r.failed ? 'F' : r.median.toFixed(0)) + (r.errors ? ` E${r.errors}` : '') +
    (r.exceptions ? ` X${r.exceptions}` : '')).join(' ');
  const m = median(runs.filter((r) => !r.failed).map((r) => r.median));
  return `${each}${m !== null && runs.length > 1 ? ` = ${m.toFixed(0)}` : ''}`;
};
console.log(`\n${game}, ${size} uncapped, presents/s (each run's median, = their median; F failed, E<n> WebGPU errors, ` +
  `X<n> exceptions${smoke ? '; a smoke play, its presents not compared' : ''}):`);
console.log(`${''.padEnd(12)}${`Pages ${pagesBuild}`.padEnd(26)}build ${build}`);
const found = [];
let unclean = false;
for (const condition of conditions) {
  const pages = condition.runs.filter((r) => r.which === 'P' && !slept(r));
  const runs = builds(condition);
  console.log(`${condition.name.padEnd(12)}${(pages.length ? cell(pages) : '-').padEnd(26)}${cell(runs)}`);
  const why = runs.map((r) => worse(condition, r));
  if (condition === chrome && runs.length >= 2 && why.every(Boolean)) found.push(`${condition.name}: ${why.join('; ')}`);
  if (!runs.length || !runs.every(clean)) unclean = true;
}
console.log(`logs: ${out}`);
if (smoke) {
  const pages = firefoxSmoke.runs.filter((r) => r.which === 'P' && !slept(r));
  if (!unclean) console.log('verdict: clean');
  else if (builds(firefoxSmoke).length && pages.length && pages.every(clean)) {
    console.log('verdict: worse, the build\'s Firefox play isn\'t clean where Pages\' is: look at its log');
    process.exit(3);
  } else console.log(builds(firefoxSmoke).length ? 'verdict: not clean, and neither is Pages\' Firefox play: file it, the build is no worse for it'
    : 'verdict: not clean, the host slept through the build\'s play twice: play it again');
  process.exit(unclean ? 1 : 0);
}
if (found.length) {
  console.log(`verdict: worse, ${found.join(' · ')}`);
  process.exit(3);
}
console.log(unclean ? 'verdict: not clean, no worse than Pages but a run of the build failed or had WebGPU errors or exceptions: look at its log'
  : 'verdict: no worse');
process.exit(unclean ? 1 : 0);
