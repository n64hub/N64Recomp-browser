// One turn on a shared Android phone: plays a game's page from the hub there, a build of it or the one on Pages, and
// puts the phone back as it found it, after a check that the play can start, which runs before the turn joins the
// phone's line (docs/phones.md, Sharing a phone).
//
//   node tools/phone_turn.mjs <hub folder> <build dir | pages> --plan <play_plan.json> --rom <rom> [--steps <steps.json>]
//     [--seconds <n>] [--rest <s>] [--json <file>] [--shots <prefix>] [--preload <script.js>] [--adb <path>]
//     [--serial <device>] [--port <n>] [--proxy-port <n>] [--check] [-- <queue command...>]
//
// e.g. node tools/phone_turn.mjs banjo-tooie build-web --plan ../tools/play_plan.json --rom rom.z64 --steps mine.json \
//        --seconds 150 --json bt.json -- <the machine's queue for the phone> --
//
// The hub folder is the game's folder on the hub (banjo-tooie for https://n64hub.com/banjo-tooie/); its tile is the Games
// table's row whose page that is, in main's README.md. A build dir is served for that folder in place of Pages', its
// <page>.html as the folder's page and its <page>.js, .wasm and .data; "pages" serves Pages' own. --plan is the game's
// desktop plan (its play_plan.json, a path or a URL): its page names the build's files, its load steps wait for the
// launcher (a wait for the shaders' build given 180 s at least, a phone's), and its first rom step and the click after
// it are Load ROM and Start Game, tapped where the plan clicks them as page_driver.mjs moves a click to another viewport
// (play_phone.mjs's planTap), so no turn guesses the phone's launcher spots; a plan that takes them with a key (a rom
// step with a key, a key or pressUntil step after it) gets that key, a pressUntil's three times its everyMs apart (its
// test reads the desktop driver's helpers). The page's file picker is answered with --rom, served by the proxy. --steps are the card's own, play_phone.mjs's steps, run once Start Game is tapped; the
// game plays --seconds (90) from there, however long the steps take, then the play ends. --shots <prefix> saves the
// screen at the launcher and at the end (<prefix>-launcher.png, <prefix>-end.png; a screencap shows the phone's
// notifications too). --preload adds the card's script after this one's, --json is play_phone.mjs's.
//
// The check reads nothing from the phone, so it runs in seconds outside the turn: adb runs; the plan parses, names a page,
// has a Load ROM and a Start Game and every file its evalFile steps name; the ROM is there; the folder has a row in the
// Games table; the build dir (a Git Bash /c/... path is read as C:/...) has the page's four files, and the proxy serves
// the folder's page and its .js, .wasm and .data with 200, from the build where there is one; and every step of the
// play, the card's with the launcher's, parses as play_phone.mjs's (--check there). --check stops after it. With a
// queue command after --, a check that passes runs <queue command...> node tools/phone_turn.mjs <the same arguments>,
// the turn, which checks again (the files may have changed while it waited) before it touches the phone.
//
// The turn: the proxy on --proxy-port (8790) serves the hub at http://localhost:<port> (README.md from main, which the
// hub reads from its own origin), with the build in the folder; adb keeps the screen on (screen_off_timeout as long as it
// goes, svc power stayon true, both left so: a phone that locks on a PIN waits for a person), wakes it and fails if a
// lock screen stays, starts Chrome, forwards --port (9333) to its DevTools and reverses the proxy's port, so the phone's
// localhost is the proxy, a secure context. A tab: a new one from DevTools, else (Chrome refuses one at times) one
// opened by an intent, else a blank one or one left on the proxy. The proxy's origin is emptied (Storage.clearDataForOrigin:
// nothing stored, no service worker, no stored ROM), the tab rests blank for --rest (45) seconds, and play_phone.mjs
// plays: the tile, the plan's load steps, Load ROM, the picker answered, the launcher storing the ROM (a file its size in
// the game's FS), Start Game, the card's steps, until --seconds after Start. The phone's CPU caps, GPU clock and battery
// temperature are printed before and after. On any exit, a signal or a failure included, it puts back what it changed:
// the tab blank and closed if it opened it, the origin emptied, the reverse as it was (another's put back), the forward
// removed if it made it, the proxy stopped. A turn killed outright (a queue's limit, taskkill /F) can't, so give the
// queue's limit a few minutes over the rest, the shaders' wait and the play; the next turn starts from whatever it
// finds anyway.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { missingPlanFiles, option } from './page_driver.mjs';

const hub = 'https://n64hub.com';
const readme = 'https://raw.githubusercontent.com/n64hub/N64Recomp-browser/main/README.md';
const here = path.dirname(fileURLToPath(import.meta.url));
const usage = 'usage: node tools/phone_turn.mjs <hub folder> <build dir | pages> --plan <play_plan.json> --rom <rom> [--steps <steps.json>] '
  + '[--seconds <n>] [--rest <s>] [--json <file>] [--shots <prefix>] [--preload <script.js>] [--adb <path>] [--serial <device>] '
  + '[--port <n>] [--proxy-port <n>] [--check] [-- <queue command...>]';

const all = process.argv.slice(2);
const dash = all.indexOf('--');
const queue = dash < 0 ? [] : all.slice(dash + 1);
const turnArgs = dash < 0 ? all : all.slice(0, dash);
const args = [...turnArgs];
const flag = (name) => { const i = args.indexOf(name); if (i >= 0) args.splice(i, 1); return i >= 0; };
// A Git Bash path (/c/Users/...) is C:/Users/... to Node on Windows.
const local = (p) => p && (process.platform === 'win32' ? p.replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:') : p);
const planFile = option(args, '--plan', undefined);
const rom = local(option(args, '--rom', undefined));
const stepsFile = local(option(args, '--steps', undefined));
const seconds = Number(option(args, '--seconds', '90'));
const rest = Number(option(args, '--rest', '45'));
const jsonFile = local(option(args, '--json', undefined));
const shots = local(option(args, '--shots', undefined));
const preload = local(option(args, '--preload', undefined));
const adb = local(option(args, '--adb', 'adb'));
const serial = option(args, '--serial', undefined);
const port = Number(option(args, '--port', '9333'));
const proxyPort = Number(option(args, '--proxy-port', '8790'));
const checkOnly = flag('--check');
const [folder, where] = args;
if (!folder || !where || !planFile || !rom || args.length > 2 || (dash >= 0 && !queue.length)) {
  console.error(usage);
  process.exit(1);
}
const build = where === 'pages' ? null : path.resolve(local(where));
const log = (line) => console.log(`phone_turn: ${line}`);

const readText = async (p) => /^https?:\/\//.test(p) ? (await fetch(p)).text() : fs.readFileSync(local(p), 'utf8');
let plan = null, planError = null;
try { plan = JSON.parse(await readText(planFile)); } catch (e) { planError = e.message; }
const page = typeof plan?.page === 'string' && plan.page.endsWith('.html') ? plan.page.slice(0, -5) : null;

// The hub at http://localhost:<port>, the build (if any) in its folder and the ROM at /__rom/<its name>; a page is
// <page>.html in the build, the folder's index.html on Pages.
const romUrl = () => '/__rom/' + path.basename(rom).replace(/[^A-Za-z0-9._-]/g, '_');
const types = { '.js': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.data': 'application/octet-stream' };
const serve = (listenPort) => new Promise((ok, fail) => {
  const server = http.createServer(async (req, res) => {
    const sendFile = (file) => {
      const size = fs.statSync(file).size;
      res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'content-length': size,
        'cache-control': 'no-store', 'x-phone-turn': 'local' });
      if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
    };
    try {
      const url = req.url.split('?')[0];
      const m = url.match(new RegExp(`^/${folder}/(.*)$`));
      if (build && m && (m[1] === '' || m[1] === 'index.html' || m[1].startsWith(page + '.')) && !m[1].includes('/'))
        return sendFile(path.join(build, m[1] === '' || m[1] === 'index.html' ? page + '.html' : m[1]));
      if (url === romUrl()) return sendFile(rom);
      if (url === '/__blank') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>blank</title>'); }
      const r = await fetch(url.startsWith('/README.md') ? readme : hub + req.url, { method: req.method, redirect: 'manual' });
      const headers = {};
      for (const [k, v] of r.headers) if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) headers[k] = v;
      if (headers.location) headers.location = headers.location.replace(hub, `http://localhost:${server.address().port}`);
      res.writeHead(r.status, headers);
      if (r.body && req.method !== 'HEAD') Readable.fromWeb(r.body).pipe(res); else res.end();
    } catch (e) { if (!res.headersSent) res.writeHead(502); res.end(String(e)); }
  });
  server.once('error', (e) => fail(new Error(`the proxy can't listen on ${listenPort}: ${e.message}`)));
  server.listen(listenPort, '127.0.0.1', () => ok(server));
});

// The ROM's picker answered from the proxy, in the game's frame only (window.__phoneTurnRom says how many bytes it gave),
// and ?present-stats added to the frame's query so plume and RT64 print their numbers (docs/phones.md, Measuring).
const preloadScript = () => `(() => {
  const m = location.pathname.match(/^\\/([^/]+)\\/(index\\.html|[^/]+\\.html)?$/);
  if (!m || m[1] !== ${JSON.stringify(folder)}) return;
  if (!/present-stats/.test(location.search))
    history.replaceState(null, '', location.pathname + (location.search ? location.search + '&' : '?') + 'present-stats' + location.hash);
  const click = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type !== 'file') return click.apply(this, arguments);
    fetch(${JSON.stringify(romUrl())}).then((r) => r.arrayBuffer()).then((b) => {
      const dt = new DataTransfer();
      dt.items.add(new File([b], ${JSON.stringify(path.basename(rom))}));
      this.files = dt.files;
      this.dispatchEvent(new Event('change'));
      window.__phoneTurnRom = b.byteLength;
    });
  };
})();
${preload ? fs.readFileSync(preload, 'utf8') : ''}`;

// A file the ROM's size in the game's file system outside /tmp: the launcher's stored copy, so Start Game is showing
// where Load ROM was (page_driver.mjs's rom step says why it is waited for).
const romStored = (size) => `(() => {
  const FS = frames[0]?.FS;
  if (!FS) return null;
  const find = (dir) => {
    for (const name of FS.readdir(dir)) {
      const p = (dir === '/' ? '' : dir) + '/' + name;
      if (name === '.' || name === '..' || p === '/tmp' || p === '/dev' || p === '/proc') continue;
      let st;
      try { st = FS.stat(p); } catch { continue; }
      const found = FS.isDir(st.mode) ? find(p) : st.size === ${size} ? p : null;
      if (found) return found;
    }
    return null;
  };
  return find('/');
})()`;

// Everything that can be known before the phone is touched; throws with every problem found. Returns what the turn needs.
const check = async (base) => {
  const problems = [];
  const fail = (text) => problems.push(text);
  try { execFileSync(adb, ['version'], { stdio: 'ignore' }); } catch { fail(`adb doesn't run (${adb}): give --adb <path>`); }

  if (planError) fail(`the plan ${planFile} doesn't parse: ${planError}`);
  if (plan && !page) fail(`the plan names no page (its "page" is ${JSON.stringify(plan.page)})`);
  let romStep = null, startStep = null, load = [];
  if (plan) {
    const before = [...(plan.setup ?? []), ...(plan.start ?? [])];
    const i = before.findIndex((s) => s[0] === 'rom');
    romStep = before[i];
    startStep = i >= 0 ? before.slice(i + 1).find((s) => ['click', 'key', 'pressUntil'].includes(s[0])) : null;
    const spot = (s) => s.length >= 3 && Number.isFinite(s[1]) && Number.isFinite(s[2]) && s[1] >= 0 && s[1] <= 1256 && s[2] >= 0 && s[2] <= 645;
    if (!romStep) fail('the plan has no rom step (Load ROM) in its setup or start');
    else if (typeof romStep[1] !== 'string' && !spot(romStep)) fail(`the plan's rom step ${JSON.stringify(romStep)} is no spot in 1256x645`);
    if (romStep && !startStep) fail('the plan has no click, key or pressUntil after its rom step (Start Game)');
    else if (startStep && startStep[0] === 'click' && !spot(startStep)) fail(`the plan's Start Game ${JSON.stringify(startStep)} is no spot in 1256x645`);
    load = (plan.load ?? []).map((s) => s[0] === 'until' ? ['until', s[1], Math.max(s[2] ?? 60000, 180000)] : s);
    if (/^https?:\/\//.test(planFile)) {
      for (const s of [plan.load, plan.setup, plan.start, plan.play, ...(plan.sections ?? []).map((x) => x.steps)].flat().filter((s) => s?.[0] === 'evalFile')) {
        const r = await fetch(new URL(s[1], planFile), { method: 'HEAD' }).catch(() => null);
        if (r?.status !== 200) fail(`the plan's evalFile ${s[1]} is not at ${new URL(s[1], planFile)}`);
      }
    } else {
      const missing = missingPlanFiles(plan, local(planFile));
      if (missing.length) fail(`the plan's evalFile steps name files that aren't there: ${missing.join(', ')}`);
    }
  }

  let romSize = 0;
  try { romSize = fs.statSync(rom).size; } catch { fail(`the ROM ${rom} is not there`); }
  if (romSize && (romSize < 1 << 20 || romSize > 1 << 26)) fail(`the ROM ${rom} is ${romSize} bytes, no N64 ROM's size`);

  let tile = null;
  try {
    const row = (await (await fetch(base + '/README.md')).text()).split('\n')
      .find((line) => line.startsWith('|') && line.includes(`(${hub}/${folder}/)`));
    tile = row?.split('|')[1].trim();
    if (!tile) fail(`main's README.md has no Games row whose page is ${hub}/${folder}/, so the hub has no tile to tap`);
  } catch (e) { fail(`the proxy gave no README.md: ${e.message}`); }

  if (build && !fs.existsSync(build)) fail(`the build dir ${build} is not there`);
  else if (page) {
    if (build) for (const ext of ['html', 'js', 'wasm', 'data'])
      if (!fs.existsSync(path.join(build, `${page}.${ext}`))) fail(`the build dir has no ${page}.${ext} (the plan's page is ${plan.page})`);
    for (const file of ['', `${page}.js`, `${page}.wasm`, `${page}.data`]) {
      const r = await fetch(`${base}/${folder}/${file}`, { method: file ? 'HEAD' : 'GET' }).catch((e) => ({ status: e.message }));
      if (r.status !== 200) fail(`the proxy gave ${r.status} for /${folder}/${file}`);
      else if (build && r.headers.get('x-phone-turn') !== 'local') fail(`the proxy gave /${folder}/${file} from Pages, not the build`);
      else if (!file && !(await r.text()).includes(`${page}.js`)) fail(`/${folder}/ is no page of ${page}.js: the plan is another game's, or the folder is`);
    }
  }

  const turn = { steps: [], tmp: fs.mkdtempSync(path.join(os.tmpdir(), 'phone-turn-')) };
  if (romStep && startStep && tile) {
    const tap = (s) => typeof s[1] === 'string' ? ['key', s[1], s[2], s[3]] : ['planTap', s[1], s[2]];
    const press = ['key', ...startStep.slice(1, 5)];
    const start = startStep[0] === 'click' ? [tap(startStep)] : startStep[0] === 'key' ? [press]
      : [press, ['wait', startStep[5] ?? 1500], press, ['wait', startStep[5] ?? 1500], press];
    let mine = [];
    if (stepsFile) try { mine = JSON.parse(fs.readFileSync(stepsFile, 'utf8')); } catch { /* play_phone.mjs --check says why, below */ }
    turn.steps = [['wait', 3000], ['tapText', tile, 'article.tile', '.art'], ...load,
      ...(shots ? [['shot', `${shots}-launcher.png`]] : []), tap(romStep), ['untilEval', 'frames[0]?.__phoneTurnRom', 60000],
      ['untilEval', romStored((romSize + 3) & ~3), 60000], ...start, ['mark'], ...(Array.isArray(mine) ? mine : [mine]),
      ['at', seconds], ...(shots ? [['shot', `${shots}-end.png`]] : [])];
  }
  turn.stepsFile = path.join(turn.tmp, 'steps.json');
  turn.preloadFile = path.join(turn.tmp, 'preload.js');
  fs.writeFileSync(turn.stepsFile, JSON.stringify(turn.steps));
  try { fs.writeFileSync(turn.preloadFile, preloadScript()); } catch (e) { fail(`the preload ${preload} can't be read: ${e.message}`); }
  // The card's steps by themselves first, so a problem is told by their own numbers, then the whole play.
  const playCheck = (file) => {
    try {
      execFileSync(process.execPath, [path.join(here, 'play_phone.mjs'), base + '/', '--steps', file, '--preload', turn.preloadFile, '--check'],
        { encoding: 'utf8', stdio: 'pipe' });
      return true;
    } catch (e) { fail((e.stderr || e.message).trim()); }
  };
  if (turn.steps.length && (!stepsFile || playCheck(stepsFile))) playCheck(turn.stepsFile);
  if (problems.length) {
    fs.rmSync(turn.tmp, { recursive: true, force: true });
    throw new Error(problems.join('\n'));
  }
  log(`the check passed: ${tile}'s ${page} from ${build ?? 'Pages'}, Load ROM and Start Game where the plan takes them, ${turn.steps.length} steps, ${seconds} s of play`);
  return turn;
};

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

if (checkOnly || queue.length) {
  let turn;
  try {
    const proxy = await serve(0);
    try { turn = await check(`http://127.0.0.1:${proxy.address().port}`); } finally { proxy.close(); }
  } catch (e) {
    console.error(`phone_turn: the check failed, so no turn was taken:\n${e.message}`);
    process.exit(1);
  }
  fs.rmSync(turn.tmp, { recursive: true, force: true });
  if (checkOnly) process.exit(0);
  log(`joining the line: ${queue.join(' ')}`);
  const child = spawn(queue[0], [...queue.slice(1), process.execPath, fileURLToPath(import.meta.url), ...turnArgs], { stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
} else {
  await playTurn();
}

async function playTurn() {
  const shell = (...command) => execFileSync(adb, [...(serial ? ['-s', serial] : []), ...command], { encoding: 'utf8', maxBuffer: 1 << 26 });
  // One whose failure and stderr don't matter (monkey's echo of its arguments, dumpsys's broken pipe under grep -m1).
  const quiet = (...command) => {
    try { return execFileSync(adb, [...(serial ? ['-s', serial] : []), ...command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; }
  };
  const devtools = (p, method = 'GET') => fetch(`http://127.0.0.1:${port}${p}`, { method });
  const origin = `http://localhost:${proxyPort}`;
  // The protocol over a tab's own socket: one command, then closed.
  const onTab = (id, method, params = {}) => new Promise((ok, fail) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/devtools/page/${id}`);
    const timer = setTimeout(() => { ws.close(); fail(new Error(`no answer to ${method}`)); }, 10000);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method, params }));
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === 1) { clearTimeout(timer); ws.close(); ok(m); } };
    ws.onerror = () => { clearTimeout(timer); fail(new Error(`no DevTools socket for tab ${id}`)); };
  });

  let proxy, turn;
  try {
    proxy = await serve(proxyPort);
    turn = await check(`http://127.0.0.1:${proxyPort}`);
  } catch (e) {
    proxy?.close();
    console.error(`phone_turn: the check failed at the turn's start:\n${e.message}`);
    process.exit(1);
  }

  // What the turn finds, so it can put it back.
  let hadForward = true, oldReverse = null, tab = null, ourTab = false, child = null, restored = false;
  const restore = async () => {
    if (restored) return;
    restored = true;
    if (tab) {
      await onTab(tab, 'Page.navigate', { url: 'about:blank' }).catch(() => {});
      await onTab(tab, 'Storage.clearDataForOrigin', { origin, storageTypes: 'all' }).catch(() => {});
      if (ourTab) await devtools(`/json/close/${tab}`).catch(() => {});
    }
    if (oldReverse) quiet('reverse', `tcp:${proxyPort}`, oldReverse); else quiet('reverse', '--remove', `tcp:${proxyPort}`);
    if (!hadForward) quiet('forward', '--remove', `tcp:${port}`);
    proxy.close();
    fs.rmSync(turn.tmp, { recursive: true, force: true });
    log('put the phone back: the tab, the origin\'s data, the reverse and the forward');
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, async () => {
    child?.kill();
    await restore();
    process.exit(130);
  });

  let code = 1;
  try {
    if (quiet('get-state').trim() !== 'device') throw new Error(`adb sees no phone${serial ? ` ${serial}` : ''}`);
    shell('shell', 'settings put system screen_off_timeout 2147483647; svc power stayon true');
    shell('shell', 'input keyevent KEYCODE_WAKEUP');
    await sleep(1000);
    shell('shell', 'wm dismiss-keyguard');
    await sleep(2000);
    const focus = () => quiet('shell', 'dumpsys window | grep -m1 mCurrentFocus').trim();
    if (/NotificationShade|Keyguard|Bouncer/.test(focus())) throw new Error(`the phone is locked (${focus()}): only a person can unlock it`);

    hadForward = shell('forward', '--list').split('\n').some((line) => line.split(/\s+/)[1] === `tcp:${port}`);
    oldReverse = shell('reverse', '--list').split('\n').map((line) => line.trim().split(/\s+/)).find((f) => f[1] === `tcp:${proxyPort}`)?.[2] ?? null;
    if (oldReverse === `tcp:${proxyPort}`) oldReverse = null;
    quiet('shell', 'monkey -p com.android.chrome -c android.intent.category.LAUNCHER 1');
    await sleep(2000);
    shell('forward', `tcp:${port}`, 'localabstract:chrome_devtools_remote');
    shell('reverse', `tcp:${proxyPort}`, `tcp:${proxyPort}`);
    const version = await (await devtools('/json/version')).json().catch(() => null);
    if (!version) throw new Error(`no Chrome DevTools on the phone at ${port} (Chrome stopped, or USB debugging off)`);

    // A tab: a new one; else one an intent opens (a new application_id each time makes Chrome open a new tab); else a
    // blank one, or one a killed turn left on the proxy.
    const pages = async () => (await (await devtools('/json/list')).json()).filter((t) => t.type === 'page');
    try { tab = JSON.parse(await (await devtools('/json/new?about:blank', 'PUT')).text()).id; ourTab = true; } catch {}
    if (!tab) {
      quiet('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `${origin}/__blank`, '-p', 'com.android.chrome',
        '--es', 'com.android.browser.application_id', `phone_turn_${Date.now()}`);
      for (let i = 0; i < 20 && !tab; i++, await sleep(500)) tab = (await pages()).find((t) => t.url === `${origin}/__blank`)?.id;
      ourTab = !!tab;
    }
    if (!tab) tab = (await pages()).find((t) => t.url === 'about:blank' || t.url.startsWith(origin + '/'))?.id;
    if (!tab) throw new Error('no tab: Chrome opened none, by DevTools or an intent, and none is blank');
    await devtools(`/json/activate/${tab}`);
    await onTab(tab, 'Page.navigate', { url: 'about:blank' });
    await onTab(tab, 'Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
    log(`${version.Browser}, tab ${tab}${ourTab ? '' : ' (one that was there)'}, ${origin} emptied; resting ${rest} s blank`);
    await sleep(rest * 1000);
    if (!/com\.android\.chrome/.test(focus())) throw new Error(`something covers Chrome: ${focus()}`);

    const clocks = () => quiet('shell', 'echo CPU caps $(cat /sys/devices/system/cpu/cpufreq/policy*/scaling_max_freq) kHz,'
      + ' GPU max $(cat /sys/kernel/gpu/gpu_max_clock 2>/dev/null) kHz, battery $(dumpsys battery | grep -m1 temperature)').trim();
    log(`before: ${clocks()}`);
    child = spawn(process.execPath, [path.join(here, 'play_phone.mjs'), `${origin}/`, '--tab', tab, '--port', String(port), '--adb', adb,
      ...(serial ? ['--serial', serial] : []), '--steps', turn.stepsFile, '--preload', turn.preloadFile, '--no-cache',
      ...(jsonFile ? ['--json', jsonFile] : [])], { stdio: 'inherit' });
    code = await new Promise((ok) => child.on('exit', (c) => ok(c ?? 1)));
    child = null;
    log(`after: ${clocks()}`);
  } catch (e) {
    console.error(`phone_turn: ${e.message}`);
    code = 1;
  }
  await restore();
  process.exit(code);
}
