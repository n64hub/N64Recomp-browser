// Plays a page in an Android phone's Chrome, driven from a computer over adb and the DevTools protocol, and measures it:
// presents a second, the longest gap between presents, the page's own frames, and RT64's and the page's console lines
// (the prebuilt shaders' build, shader waits and misses, pacing), on the phone's GPU at the phone's size
// (docs/phones.md says how to connect a phone and what was measured this way).
//
//   node tools/play_phone.mjs <url> [--steps <steps.json>] [--seconds <n>] [--json <file>] [--adb <path>]
//     [--serial <device>] [--port <n>] [--tab <id>] [--preload <script.js>] [--no-cache] [--check]
//
// A whole turn on a shared phone (the proxy, the forwards, a blank tab, putting it all back) is tools/phone_turn.mjs,
// which runs this for the play itself. --check only reads the steps and the preload and says what is wrong with them,
// touching nothing on the phone: every step is checked that way before a play starts anyway.
//
// adb forwards --port (9333) to the phone's Chrome, which must be running with USB or wireless debugging on (adb
// devices lists the phone). A new tab is opened and brought to the front, since Chrome on Android gives a tab in the
// back no animation frames and the page would never draw, or --tab <id> (from http://127.0.0.1:<port>/json/list) is
// taken over. The tab gets the counters before the page's own scripts, in every frame it loads, so a game the hub
// plays in its frame is counted too, then goes to the url. A sample a second, a line every 5: presents a second (the
// page's getCurrentTexture calls in whichever frame makes them), the longest gap between presents in ms, and the
// browser's animation frames a second in the top document. Console lines that say something about the GPU or the
// shaders (RT64:, plume, WebGPU, errors) are printed when they come, at the computer's time: the phone's clock is
// read at the start and its lead taken off each line's.
//
// --no-cache loads everything from the network (a build served in place of another under the same URLs).
// --preload adds a script to every frame as play_page.mjs's does (tools/pass_probe.js: its "passes:" lines are
// printed with the rest). --steps plays the page from a JSON array of steps, one after another, while it is sampled: ["wait", ms]; ["until",
// "<regex>", ms] waits for a console line; ["tapText", "<text>", "<selector>", "<inner>"] scrolls the top document's
// innermost element of the selector (default "*") whose text has <text>, or its first <inner> element, into view and
// touches its middle (a touch from the
// protocol is a user gesture, so fullscreen and the orientation lock work as from a finger); ["tap", x, y] touches
// the top document at CSS pixels; ["key", code, key, keyCode, ms] holds a key down for ms (150 if left out), which goes
// to the frame that has the focus, the game's once it was touched; ["planTap", x, y] touches where a play plan's x, y
// (CSS pixels in page_driver.mjs's 1256x645 viewport) are in the top document now, as page_driver moves a click: recompui
// lays its launcher and menus out by the viewport's height, about the centre, so a game's launcher spots come from its
// desktop plan; ["eval", "<js>"] runs <js> in the top document
// and prints what it returns (the hub's game is frames[0], its files frames[0].FS); ["untilEval", "<js>", ms] waits
// for <js> in the top document to be truthy (60 s if left out) and prints it; ["mark"] notes the time and ["at",
// seconds] waits until that long after the last mark (or the play's start), so a play lasts as long whatever its steps
// took; ["leave", seconds] goes to the phone's home screen, as a player who leaves Chrome for another app does, and
// brings Chrome back after that long (its launcher's intent, which shows the tab it left, then 2 s for it to come
// back); ["shot", file] saves the phone's screen (adb screencap); ["profile", seconds, prefix] samples V8's profiler every 0.5 ms in the tab's page and each of its workers
// (the game's threads) for that long, writes each thread's profile to <prefix>.<n>.cpuprofile (DevTools' Performance
// panel opens one), and prints each thread's share of the time outside its waits and its top functions by self time,
// which is how a game frame's work on the CPU is found (docs/phones.md, What holds a page back). Without --steps a person plays on the phone while it measures. It ends after --seconds (240) or, with
// steps, 10 s after the last one, and --json writes the device, Chrome, the samples and the console lines.
//
// What it leaves out, and why: page_driver.mjs's RDRAM helpers (n64r) search the whole heap for the boot globals, which
// on a phone took 13 s of the page's thread a call and found nothing in the hub's frame, so a sample that used them
// froze the page it measured; the browser's own load, which a phone keeps to itself. Chrome on the phone
// keeps its pipeline, code and HTTP caches between visits whatever this does: docs/phones.md says how to start from
// none.
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const adb = option('--adb', 'adb');
const serial = option('--serial', undefined);
const port = Number(option('--port', '9333'));
// A Git Bash path (/c/Users/...) is C:/Users/... to Node on Windows.
const local = (p) => p && (process.platform === 'win32' ? p.replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:') : p);
const stepsFile = local(option('--steps', undefined));
const seconds = Number(option('--seconds', '240'));
const jsonFile = local(option('--json', undefined));
const preload = local(option('--preload', undefined));
const flag = (name) => { const i = args.indexOf(name); if (i >= 0) args.splice(i, 1); return i >= 0; };
const noCache = flag('--no-cache');
const checkOnly = flag('--check');
let tab = option('--tab', undefined);
const url = args[0];
if (!url || args.length > 1) {
  console.error('usage: node tools/play_phone.mjs <url> [--steps <steps.json>] [--seconds <n>] [--json <file>] [--adb <path>] [--serial <device>] [--port <n>] [--tab <id>] [--preload <script.js>] [--no-cache] [--check]');
  process.exit(1);
}

// Each step's arguments, by kind: a number (ms, x, y, keyCode, seconds), a regex that compiles, a file whose folder
// is there, or a string; a ? after one leaves it out.
const stepArgs = { wait: ['ms'], until: ['regex', 'ms?'], untilEval: ['js', 'ms?'], tap: ['x', 'y'], planTap: ['x', 'y'],
  tapText: ['text', 'selector?', 'inner?'], key: ['code', 'key', 'keyCode', 'ms?'], eval: ['js'], shot: ['file'],
  profile: ['seconds', 'prefix'], mark: [], at: ['seconds'], leave: ['seconds'] };
const stepProblem = (step) => {
  if (!Array.isArray(step) || !Object.hasOwn(stepArgs, step[0])) return 'is no step: its first item names none of ' + Object.keys(stepArgs).join(', ');
  const [kind, ...a] = step;
  const want = stepArgs[kind];
  if (a.length > want.length) return `has ${a.length} arguments, ${kind} takes ${want.length}`;
  for (const [i, w] of want.entries()) {
    const name = w.replace('?', ''), v = a[i];
    if (v === undefined || v === null) { if (w.endsWith('?')) continue; return `has no ${name}`; }
    if (['ms', 'x', 'y', 'keyCode', 'seconds'].includes(name)) { if (!Number.isFinite(v)) return `has a ${name} that is not a number`; }
    else if (typeof v !== 'string') return `has a ${name} that is not a string`;
    else if (name === 'regex') { try { new RegExp(v); } catch (e) { return `has a regex that does not compile: ${e.message}`; } }
    else if ((name === 'file' || name === 'prefix') && !fs.existsSync(path.dirname(path.resolve(v)))) return `writes to ${path.dirname(path.resolve(v))}, which is not there`;
  }
  return null;
};
let steps = [];
try {
  steps = stepsFile ? JSON.parse(fs.readFileSync(stepsFile, 'utf8')) : [];
  if (!Array.isArray(steps)) throw new Error('is not a JSON array of steps');
  steps = steps.map((s) => s?.[0] === 'shot' && typeof s[1] === 'string' ? ['shot', local(s[1])]
    : s?.[0] === 'profile' && typeof s[2] === 'string' ? ['profile', s[1], local(s[2])] : s);
  const problems = steps.map((step, i) => [i, stepProblem(step)]).filter(([, p]) => p).map(([i, p]) => `step ${i + 1} ${JSON.stringify(steps[i]).slice(0, 80)} ${p}`);
  if (preload && !fs.existsSync(preload)) problems.push(`the preload ${preload} is not there`);
  if (problems.length) throw new Error(problems.join('\n'));
} catch (error) {
  console.error(`${stepsFile ?? 'the steps'}: ${error.message}`);
  process.exit(1);
}
if (checkOnly) {
  console.log(`${steps.length} steps, all of them good${preload ? ', and the preload is there' : ''}`);
  process.exit(0);
}

const shell = (...command) => execFileSync(adb, [...(serial ? ['-s', serial] : []), ...command], { encoding: 'buffer', maxBuffer: 1 << 26 });
// The GPU's load and clock, where the phone shows them to adb (a Mali in an Exynos does, at /sys/kernel/gpu).
const gpu = () => new Promise((ok) => execFile(adb, [...(serial ? ['-s', serial] : []), 'shell',
  'cat /sys/kernel/gpu/gpu_busy /sys/kernel/gpu/gpu_clock /sys/kernel/gpu/gpu_max_clock'], (error, out) => {
  const [busy, clock, max] = error ? [] : out.split('\n').map((v) => parseInt(v));
  ok(Number.isFinite(busy) ? { gpuBusy: busy, gpuMHz: Math.round(clock / 1000), gpuMaxMHz: Math.round(max / 1000) } : {});
}));
const prop = (name) => shell('shell', 'getprop', name).toString().trim();
shell('forward', `tcp:${port}`, 'localabstract:chrome_devtools_remote');
const http = (path, method = 'GET') => fetch(`http://127.0.0.1:${port}${path}`, { method });
const version = await (await http('/json/version')).json();
const device = { model: prop('ro.product.model'), soc: prop('ro.soc.model') || prop('ro.hardware.chipname'), android: prop('ro.build.version.release') };
console.log(`${device.model} (${device.soc}), Android ${device.android}, ${version.Browser}`);

if (!tab) tab = (await (await http('/json/new?about:blank', 'PUT')).json()).id;
await http(`/json/activate/${tab}`);

// The protocol over the tab's own socket, so its events (the console of every frame) come with no sessions to attach.
const ws = new WebSocket(`ws://127.0.0.1:${port}/devtools/page/${tab}`);
await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error(`no DevTools socket for tab ${tab}`)); });
let id = 0;
const pending = new Map();
const listeners = [];
ws.onmessage = (event) => {
  const m = JSON.parse(event.data);
  if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); } else listeners.forEach((listener) => listener(m));
};
ws.onclose = () => { console.error('the DevTools socket closed (Chrome closed the tab or stopped)'); finish(1); };
const send = (method, params = {}, sessionId = undefined) => new Promise((ok) => {
  const i = ++id;
  pending.set(i, ok);
  ws.send(JSON.stringify({ id: i, method, params, sessionId }));
});
const evaluate = async (expression) => {
  const m = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description ?? m.result.exceptionDetails.text);
  return m.result?.result?.value;
};

// Presents (getCurrentTexture on a WebGPU canvas) and the gaps between them, in every frame; animation frames too.
const counters = `(() => {
  window.__presents = 0; window.__gaps = []; window.__animationFrames = 0;
  const frame = () => { window.__animationFrames++; requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  let last = 0;
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind) {
    const context = getContext.apply(this, arguments);
    if (kind === 'webgpu' && context && !context.__counted) {
      context.__counted = true;
      const getCurrentTexture = context.getCurrentTexture;
      context.getCurrentTexture = function () {
        window.__presents++;
        const now = performance.now();
        if (last) window.__gaps.push(now - last);
        last = now;
        return getCurrentTexture.apply(this, arguments);
      };
    }
    return context;
  };
})()`;
// The frame that presents: the top document, or the frame of it whose counters have counted a present.
const sample = `(() => {
  const all = [window];
  for (let i = 0; i < frames.length; i++) { try { if (frames[i].__presents !== undefined) all.push(frames[i]); } catch (e) {} }
  const w = all.find((f) => f.__presents > 0) || window;
  return { presents: w.__presents ?? 0, gaps: (w.__gaps || []).splice(0), animationFrames: window.__animationFrames ?? 0 };
})()`;

const t0 = Date.now();
const at = (time = Date.now()) => Math.round((time - t0) / 100) / 10;
const consoleLines = [];
let lead = 0;
listeners.push((m) => {
  let text = null, time = null;
  if (m.method === 'Runtime.consoleAPICalled') {
    text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    time = m.params.timestamp;
    if (!/RT64|plume|WebGPU|shader|error|warn|^passes:/i.test(text) && m.params.type !== 'error') return;
  } else if (m.method === 'Runtime.exceptionThrown') {
    const details = m.params.exceptionDetails;
    text = `exception: ${details.exception?.description ?? details.text}`;
    time = m.params.timestamp;
  } else return;
  // Chrome replays a tab's earlier console once Runtime is enabled; those lines are from before the run.
  if (time - lead < t0) return;
  const line = { at: at(time - lead), text: text.split('\n')[0].slice(0, /^passes:/.test(text) ? 4000 : 300) };
  consoleLines.push(line);
  console.log(`${line.at.toFixed(1).padStart(6)}  ${line.text}`);
});

{
  const before = Date.now();
  const phone = await evaluate('Date.now()');
  lead = phone - (before + Date.now()) / 2;
}
await send('Runtime.enable');
await send('Page.enable');
if (noCache) {
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
}
await send('Page.addScriptToEvaluateOnNewDocument', { source: counters });
if (preload) await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(preload, 'utf8') });
await send('Page.navigate', { url });
console.log(`${at().toFixed(1).padStart(6)}  ${url} (the phone's clock leads by ${Math.round(lead)} ms)`);

const samples = [];
let last = null, done = false, code = 0;
const sampler = (async () => {
  for (let i = 1; !done; i++) {
    await new Promise((ok) => setTimeout(ok, 1000));
    let value;
    try { value = await evaluate(sample); } catch { continue; }
    const now = { time: Date.now(), ...value };
    const load = await gpu();
    if (last && now.presents >= last.presents) {
      const dt = (now.time - last.time) / 1000;
      const s = { at: at(now.time), presents: Math.round((now.presents - last.presents) / dt * 10) / 10,
        longestGapMs: Math.round(Math.max(0, ...value.gaps)), animationFrames: Math.round((now.animationFrames - last.animationFrames) / dt * 10) / 10, ...load };
      samples.push(s);
      if (i % 5 === 0) console.log(`${s.at.toFixed(1).padStart(6)}  presents/s ${s.presents} · longest gap ${s.longestGapMs} ms · frames/s ${s.animationFrames}${'gpuBusy' in s ? ` · GPU ${s.gpuBusy}% at ${s.gpuMHz} of ${s.gpuMaxMHz} MHz` : ''}`);
    }
    last = now;
  }
})();

const touch = async (x, y) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((ok) => setTimeout(ok, 60));
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const waitFor = (pattern, ms) => new Promise((ok, fail) => {
  const from = consoleLines.length;
  const timer = setInterval(() => {
    if (consoleLines.slice(from).some((line) => pattern.test(line.text))) { clearInterval(timer); ok(); }
  }, 200);
  setTimeout(() => { clearInterval(timer); fail(new Error(`no console line like ${pattern} in ${ms / 1000} s`)); }, ms);
});

// A profile of the page and every worker in it, attached to as the protocol's flat sessions. A wasm thread waiting shows
// as samples of its wait (Atomics.wait under _do_futex_wait, a condition variable), so those are taken out of its busy
// share along with the idle ones. (program) is the browser's own work on the thread, outside script: the page's WebGPU
// calls, for one.
const waits = /^\(idle\)$|futex_wait|_timedwait|cond_wait|condition_variable::wait|^__timedwait_cp$/;
const profile = async (secs, prefix) => {
  const sessions = new Map();
  const start = async (sessionId) => {
    await send('Profiler.enable', {}, sessionId);
    await send('Profiler.setSamplingInterval', { interval: 500 }, sessionId);
    await send('Profiler.start', {}, sessionId);
  };
  const attached = (m) => {
    if (m.method !== 'Target.attachedToTarget') return;
    const { sessionId, targetInfo } = m.params;
    sessions.set(sessionId, targetInfo);
    send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, sessionId);
    if (targetInfo.type === 'worker' || targetInfo.type === 'iframe') start(sessionId);
    send('Runtime.runIfWaitingForDebugger', {}, sessionId);
  };
  listeners.push(attached);
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  await start(undefined);
  await new Promise((ok) => setTimeout(ok, secs * 1000));
  listeners.splice(listeners.indexOf(attached), 1);
  let n = 0;
  for (const sessionId of [undefined, ...sessions.keys()]) {
    const p = (await send('Profiler.stop', {}, sessionId)).result?.profile;
    if (!p) continue;
    fs.writeFileSync(`${prefix}.${n}.cpuprofile`, JSON.stringify(p));
    const byId = new Map(p.nodes.map((node) => [node.id, node]));
    const self = new Map();
    let total = 0, waiting = 0;
    p.samples.forEach((nodeId, i) => {
      const dt = p.timeDeltas[i] ?? 0;
      const name = byId.get(nodeId).callFrame.functionName || '(anonymous)';
      total += dt;
      if (waits.test(name)) waiting += dt;
      else self.set(name, (self.get(name) ?? 0) + dt);
    });
    const what = sessionId ? sessions.get(sessionId).type : 'page';
    const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, t]) => `${(100 * t / total).toFixed(1)}% ${name.slice(0, 70)}`);
    console.log(`${at().toFixed(1).padStart(6)}  profile ${n} (${what}): busy ${(100 * (total - waiting) / total).toFixed(0)}%: ${top.join(' · ')}`);
    n++;
  }
  await send('Target.setAutoAttach', { autoAttach: false, waitForDebuggerOnStart: false, flatten: true });
};

const finish = (exitCode) => {
  done = true;
  if (jsonFile) fs.writeFileSync(jsonFile, JSON.stringify({ time: new Date(t0).toISOString(), device, chrome: version.Browser, url,
    phoneClockLeadMs: Math.round(lead), samples, console: consoleLines }, null, 1) + '\n');
  const presents = samples.map((s) => s.presents).filter((p) => p > 0).sort((a, b) => a - b);
  if (presents.length) console.log(`presents/s ${presents[presents.length >> 1]} median, ${presents[0]}-${presents[presents.length - 1]}, over ${presents.length} s that presented`);
  process.exit(exitCode);
};

let mark = t0;
try {
  for (const step of steps) {
    const [kind, ...a] = step;
    if (kind === 'wait') await new Promise((ok) => setTimeout(ok, a[0]));
    else if (kind === 'until') await waitFor(new RegExp(a[0]), a[1] ?? 60000);
    else if (kind === 'untilEval') {
      const end = Date.now() + (a[1] ?? 60000);
      let value;
      while (!(value = await evaluate(a[0]).catch(() => null))) {
        if (Date.now() > end) throw new Error(`${a[0].slice(0, 80)} was still not true after ${(a[1] ?? 60000) / 1000} s`);
        await new Promise((ok) => setTimeout(ok, 500));
      }
      console.log(`${at().toFixed(1).padStart(6)}  ${JSON.stringify(value)}`);
    } else if (kind === 'mark') mark = Date.now();
    else if (kind === 'at') await new Promise((ok) => setTimeout(ok, Math.max(0, mark + a[0] * 1000 - Date.now())));
    else if (kind === 'tap') await touch(a[0], a[1]);
    else if (kind === 'planTap') {
      const [w, h] = await evaluate('[innerWidth, innerHeight]');
      const scale = h / 645;
      await touch(Math.round(w / 2 + (a[0] - 628) * scale), Math.round(h / 2 + (a[1] - 322.5) * scale));
    }
    else if (kind === 'tapText') {
      const spot = await evaluate(`(async () => {
        const el = [...document.querySelectorAll(${JSON.stringify(a[1] ?? '*')})].reverse().find((e) => e.textContent.includes(${JSON.stringify(a[0])}) && e.getBoundingClientRect().width > 0);
        const target = el && (${JSON.stringify(a[2] ?? null)} ? el.querySelector(${JSON.stringify(a[2] ?? null)}) : el);
        if (!target) return null;
        target.scrollIntoView({ block: 'center' });
        await new Promise((ok) => setTimeout(ok, 500));
        const r = target.getBoundingClientRect();
        return [r.x + r.width / 2, r.y + r.height / 2];
      })()`);
      if (!spot) throw new Error(`nothing on the page says "${a[0]}"`);
      await touch(spot[0], spot[1]);
    } else if (kind === 'key') {
      const [code, key, keyCode, ms] = a;
      const event = { code, key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event });
      await new Promise((ok) => setTimeout(ok, ms ?? 150));
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
    } else if (kind === 'eval') console.log(`${at().toFixed(1).padStart(6)}  ${JSON.stringify(await evaluate(a[0]))}`);
    else if (kind === 'shot') fs.writeFileSync(a[0], shell('exec-out', 'screencap', '-p'));
    else if (kind === 'profile') await profile(a[0], a[1]);
    else if (kind === 'leave') {
      shell('shell', 'input', 'keyevent', 'KEYCODE_HOME');
      await new Promise((ok) => setTimeout(ok, a[0] * 1000));
      shell('shell', 'monkey', '-p', 'com.android.chrome', '-c', 'android.intent.category.LAUNCHER', '1');
      await new Promise((ok) => setTimeout(ok, 2000));
    }
    else throw new Error(`unknown step ${JSON.stringify(step)}`);
  }
} catch (error) {
  console.error(`the steps stopped: ${error.message}`);
  code = 1;
}
await new Promise((ok) => setTimeout(ok, steps.length ? 10000 : Math.max(0, seconds * 1000 - (Date.now() - t0))));
finish(code);
