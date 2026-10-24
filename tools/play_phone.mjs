// Plays a page in an Android phone's Chrome, driven from a computer over adb and the DevTools protocol, and measures it:
// presents a second, the longest gap between presents, the page's own frames, and RT64's and the page's console lines
// (the prebuilt shaders' build, shader waits and misses, pacing), on the phone's GPU at the phone's size
// (docs/phones.md says how to connect a phone and what was measured this way).
//
//   node tools/play_phone.mjs <url> [--steps <steps.json>] [--seconds <n>] [--json <file>] [--adb <path>]
//     [--serial <device>] [--port <n>] [--tab <id>]
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
// --steps plays the page from a JSON array of steps, one after another, while it is sampled: ["wait", ms]; ["until",
// "<regex>", ms] waits for a console line; ["tapText", "<text>", "<selector>"] scrolls the top document's first
// element of the selector (default "*") whose text has <text> into view and touches its middle (a touch from the
// protocol is a user gesture, so fullscreen and the orientation lock work as from a finger); ["tap", x, y] touches
// the top document at CSS pixels; ["key", code, key, keyCode, ms] holds a key down for ms (150 if left out), which goes
// to the frame that has the focus, the game's once it was touched; ["shot", file] saves the phone's screen (adb
// screencap). Without --steps a person plays on the phone while it measures. It ends after --seconds (240) or, with
// steps, 10 s after the last one, and --json writes the device, Chrome, the samples and the console lines.
//
// What it leaves out, and why: page_driver.mjs's RDRAM helpers (n64r) search the whole heap for the boot globals, which
// on a phone took 13 s of the page's thread a call and found nothing in the hub's frame, so a sample that used them
// froze the page it measured; the GPU's and the browser's load, which a phone keeps to itself. Chrome on the phone
// keeps its pipeline, code and HTTP caches between visits whatever this does: docs/phones.md says how to start from
// none.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

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
const stepsFile = option('--steps', undefined);
const seconds = Number(option('--seconds', '240'));
const jsonFile = option('--json', undefined);
let tab = option('--tab', undefined);
const url = args[0];
if (!url || args.length > 1) {
  console.error('usage: node tools/play_phone.mjs <url> [--steps <steps.json>] [--seconds <n>] [--json <file>] [--adb <path>] [--serial <device>] [--port <n>] [--tab <id>]');
  process.exit(1);
}
const steps = stepsFile ? JSON.parse(fs.readFileSync(stepsFile, 'utf8')) : [];

const shell = (...command) => execFileSync(adb, [...(serial ? ['-s', serial] : []), ...command], { encoding: 'buffer' });
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
const send = (method, params = {}) => new Promise((ok) => {
  const i = ++id;
  pending.set(i, ok);
  ws.send(JSON.stringify({ id: i, method, params }));
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
    if (!/RT64|plume|WebGPU|shader|error|warn/i.test(text) && m.params.type !== 'error') return;
  } else if (m.method === 'Runtime.exceptionThrown') {
    const details = m.params.exceptionDetails;
    text = `exception: ${details.exception?.description ?? details.text}`;
    time = m.params.timestamp;
  } else return;
  // Chrome replays a tab's earlier console once Runtime is enabled; those lines are from before the run.
  if (time - lead < t0) return;
  const line = { at: at(time - lead), text: text.split('\n')[0].slice(0, 300) };
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
await send('Page.addScriptToEvaluateOnNewDocument', { source: counters });
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
    if (last && now.presents >= last.presents) {
      const dt = (now.time - last.time) / 1000;
      const s = { at: at(now.time), presents: Math.round((now.presents - last.presents) / dt * 10) / 10,
        longestGapMs: Math.round(Math.max(0, ...value.gaps)), animationFrames: Math.round((now.animationFrames - last.animationFrames) / dt * 10) / 10 };
      samples.push(s);
      if (i % 5 === 0) console.log(`${s.at.toFixed(1).padStart(6)}  presents/s ${s.presents} · longest gap ${s.longestGapMs} ms · frames/s ${s.animationFrames}`);
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

const finish = (exitCode) => {
  done = true;
  if (jsonFile) fs.writeFileSync(jsonFile, JSON.stringify({ time: new Date(t0).toISOString(), device, chrome: version.Browser, url,
    phoneClockLeadMs: Math.round(lead), samples, console: consoleLines }, null, 1) + '\n');
  const presents = samples.map((s) => s.presents).filter((p) => p > 0).sort((a, b) => a - b);
  if (presents.length) console.log(`presents/s ${presents[presents.length >> 1]} median, ${presents[0]}-${presents[presents.length - 1]}, over ${presents.length} s that presented`);
  process.exit(exitCode);
};

try {
  for (const step of steps) {
    const [kind, ...a] = step;
    if (kind === 'wait') await new Promise((ok) => setTimeout(ok, a[0]));
    else if (kind === 'until') await waitFor(new RegExp(a[0]), a[1] ?? 60000);
    else if (kind === 'tap') await touch(a[0], a[1]);
    else if (kind === 'tapText') {
      const spot = await evaluate(`(async () => {
        const el = [...document.querySelectorAll(${JSON.stringify(a[1] ?? '*')})].reverse().find((e) => e.textContent.includes(${JSON.stringify(a[0])}) && e.getBoundingClientRect().width > 0);
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        await new Promise((ok) => setTimeout(ok, 500));
        const r = el.getBoundingClientRect();
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
    } else if (kind === 'shot') fs.writeFileSync(a[0], shell('exec-out', 'screencap', '-p'));
    else throw new Error(`unknown step ${JSON.stringify(step)}`);
  }
} catch (error) {
  console.error(`the steps stopped: ${error.message}`);
  code = 1;
}
await new Promise((ok) => setTimeout(ok, steps.length ? 10000 : Math.max(0, seconds * 1000 - (Date.now() - t0))));
finish(code);
