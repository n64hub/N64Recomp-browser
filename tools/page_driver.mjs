// Drives a recomp's page in Chrome or Firefox for the tools beside it (record_shaders.mjs, play_page.mjs): serves a
// build dir with the headers a threaded page needs, starts the browser with a profile of its own, and runs a plan's
// steps on the page.
//
// Chrome runs headless (muted or with no audio output, WebGPU on, one CSS pixel a pixel unless scale says otherwise) and is driven over the DevTools protocol: its input
// events are trusted, and the ROM goes to the file chooser the page opens. The page opens one only while the click's
// user activation lasts (5 s), and where its thread came to the picker later (a busy host) it shows its own "Choose a
// file" button instead, which the ROM step clicks with a user gesture; where neither came in 10 s (a click before the
// launcher took clicks) it clicks Load ROM again, twice at most, and says so each time. Headless Chrome draws to no display, so its
// presents never go through the desktop's compositor or wait for the display; with headed it runs in a window of its own,
// moved off the desktop as Firefox's is below, with its throttling of hidden windows off, which presents as a player's
// Chrome does. Firefox has no WebGPU adapter headless, so
// it runs in a window of its own, moved off the desktop and sized from a DPI-aware process on Windows, with the
// viewport set to the size asked for, and is driven over WebDriver BiDi. A window off the desktop never has focus, so
// keys are KeyboardEvents dispatched on `window` and clicks mouse events dispatched on the canvas itself; and since
// those carry no user activation, the page answers Load ROM with its own "Choose a file" button, which the ROM step
// clicks after replacing a file input's click() with one that sets its files to the ROM, sent to the page in pieces;
// where the page asked for no file in 10 s (a key OoT: Recompiled's launcher missed as it faded in) it presses Load
// ROM again, as Chrome's step does, twice at most.
// That works whether the page is served here or comes from elsewhere (GitHub Pages), which can't fetch from here.
//
// onScreen puts either browser's window on the desktop instead, maximized, at the desktop's own scale and size, with
// none of the overrides of one CSS pixel a pixel: as a player's window is, which Windows composites. Off the desktop it
// never is, and on a laptop's Intel UHD that flattered Firefox: on screen it took ~30 more points of the Intel chip's 3D
// engine, 3-5 times the GPU process's CPU, and Conker's page fell from 31.5 presents a second to 25.1 with its boot's
// shader wait doubled (Chrome within 2). Its viewport is then whatever the window leaves the page (1920x889 for a
// --size of 1920x945 there), which is why clicks follow the viewport, below.
//
// A step is one of: ["wait", ms], ["until", regex, ms] (a console line), ["click", x, y] (CSS pixels in a 1256x645
// viewport, moved to where recompui puts the same spot in the viewport the page has at the time: it lays its launcher
// and menus out by the viewport's height, about the centre), ["key", code, key, keyCode], ["hold", code, key, keyCode, ms], ["down", code, key, keyCode] and ["up",
// ...] (a key held across the steps between, gas while steering), ["eval", js] (awaited, up to stepMs, below; the
// page has n64r(addr) and n64w(addr, value), RDRAM words at N64 addresses), ["evalFile", path] (relative to the plan),
// ["need", js] (an eval the rest of the plan stands on, a survey's play() that loads a file: false, null or an exception
// ends the run there and fails it, rather than the steps after it pressing keys at a menu for minutes),
// ["rom", x, y] (clicks there, moved as a click is, and gives the page the ROM; ["rom", code, key, keyCode] presses that
// key instead, for a launcher whose Load ROM no one spot reaches at every size; then waits for the launcher to take it,
// below), ["shot", file] (a screenshot of the page),
// ["resize", w, h] (the viewport to that many CSS pixels, as a player's window resized: not on screen, where the
// window is the desktop's), ["hide", ms] (another tab in front of the page's for ms of wall time, then the page's again,
// as a player switching tabs: the page's document is hidden, and the browser throttles it as it does a player's) and
// ["pressUntil", code, key, keyCode, holdMs, everyMs, test, ms] (holds the key for holdMs every everyMs until the
// JavaScript test, which can read RDRAM with n64r, is true, for at most ms: a menu that takes its time, or ignores a
// press while it animates, is passed without timing the presses), and ["clock", read, perSecond] (below). A tool can add
// its own (record_shaders.mjs's "keep").
//
// The game reads its keys once a game frame, so a hold of so many ms covers as many frames as the game managed in them,
// and where frames come unevenly (Firefox's shader waits, RT64's pacing, a laptop) the same plan walks and turns the
// player by other amounts than in Chrome, and the browsers end up in other places. A clock step names a counter the game
// keeps in RDRAM, a JavaScript expression (n64r of its address) that counts perSecond a second of the game's own time:
// from there to the end of the steps, or to a ["clock"] that stops it, a wait's and a hold's ms are of that time, so
// every browser gives the game the same input for the same game time. A hold presses on the clock's next tick and lets
// go once the clock has moved its ms on. A wait or hold whose clock stands still (a load the game counts no time in, a
// wrong address) goes on for at most 5 times its ms and 30 s more, and says so; one that goes back (a level that
// restarts it) counts from there, so a wait over a level's start is that long into the level. A counter the game steps by its frame's
// length (GoldenEye's g_GlobalTimer, in 60ths) is better than one that counts frames, since a variable timestep moves
// the player by that length; a game that keeps no sum of its frames' lengths has one added up by its fork's script
// (DK64's gameTime()). The game's own data symbols (a recomp's data_dump.toml, a decomp's) say where it is. A run
// says how many ticks its holds asked for and how many the clock had moved by when each was let go: a hold lets go
// after the tick it waited for, so the game can read the key in one frame more, and more where the page's thread is
// busy.
//
// The launcher shows Start Game where Load ROM was only once recomp::select_rom has hashed the ROM and stored a copy
// (in HOME/.config/<program id>; every recomp's launcher calls it), and on a busy host that came after a plan's fixed
// wait: its click hit Load ROM, the game never started and the run failed later at 'RDRAM not found'. So a rom step
// ends once a file the ROM's size is in the page's file system outside /tmp (where the picker puts what is picked),
// polled for up to romStoredMs, and says how long that took; with none by then it says so and goes on as before.
// Chrome holds an open picker's input only weakly, and a page whose picker held it no better (one built before
// RecompFrontend-web's and frontend/file_picker.cpp's fix) lost it to a GC within seconds now and then: the file went
// nowhere, no copy came, and the run failed a minute later at 'RDRAM not found'. In Chrome the step says so and fails.
//
// page.stop(reason) ends a run where it is: the step it is in is left (a clock wait included, which on a game that has
// stopped waits out its whole 5 times and 30 s), no step after it starts, and run() throws reason, as a step that failed
// does. A run started after it throws at once.
//
// A debugging connection that closes fails what was waiting on it with what became of the browser: its exit code, or that
// it still runs, and the crash dumps it left (watchBrowser, below). In Chrome a crash of the page's renderer stops the run
// with its dump.
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import net from 'net';
import path from 'path';
import { spawn, execFile, execFileSync } from 'child_process';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Takes "--name value" out of args, or gives the fallback.
// The files a plan's evalFile steps name (relative to the plan) that aren't there: a run refuses the plan before it
// waits for a turn, rather than failing part way through one.
export const missingPlanFiles = (plan, planFile) =>
  [plan.load, plan.setup, plan.start, plan.play, ...(plan.sections ?? []).map((s) => s.steps)].flat().filter(Boolean)
    .filter((step) => Array.isArray(step) && step[0] === 'evalFile')
    .map((step) => path.resolve(path.dirname(planFile), step[1])).filter((file) => !fs.existsSync(file));

export const option = (args, name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};

// The build dir on 127.0.0.1, with the headers that give the page SharedArrayBuffer, once it is listening. Port 0 (the
// default) is a free one, server.address().port, so plays started beside each other don't clash; a port taken is
// refused. The ROM and saves are kept per origin, port included, so a profile kept between runs needs the same port
// each time. A path ending in / is its index.html, as
// GitHub Pages serves it: a plan whose page is "" opens publish_page.sh's staged dir at /. A file it hasn't got is
// printed once, since a page that 404s on its own files loads nothing and says nothing in its console.
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' };
const missing = new Set();
export const serve = (dir, port = 0) => new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(dir, pathname.endsWith('/') ? pathname + 'index.html' : pathname);
    fs.readFile(file, (err, data) => {
      if (err) {
        if (!missing.has(pathname)) { missing.add(pathname); console.error(`serve: 404 ${pathname} (${err.code})`); }
        res.writeHead(404); res.end(); return;
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store',
        'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
      res.end(data);
    });
  });
  server.once('error', (err) => reject(err.code === 'EADDRINUSE' ? new Error(`port ${port} is taken on 127.0.0.1: give another --port`) : err));
  server.listen(port, '127.0.0.1', () => resolve(server));
});

// Where each browser is when no executable is given. On Windows, the first of its installs there is: Program Files (Chrome
// since Chrome 155, Program Files (x86) before), then %LOCALAPPDATA%, where either's installer puts it when it installs
// for one user only; elsewhere, its name on the PATH. An install anywhere else is given (play_page's --browser).
const localAppData = process.env.LOCALAPPDATA?.replaceAll('\\', '/');
const installs = process.platform === 'win32' ? {
  chrome: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    ...(localAppData ? [`${localAppData}/Google/Chrome/Application/chrome.exe`] : [])],
  firefox: ['C:/Program Files/Mozilla Firefox/firefox.exe', ...(localAppData ? [`${localAppData}/Mozilla Firefox/firefox.exe`] : [])],
} : { chrome: ['google-chrome'], firefox: ['firefox'] };

// The executable open() starts for browser: the one given, else the first install above (a name on the PATH is taken as
// it is). None there throws "Firefox not found at <paths>", which the tools check before they start anything, so a
// missing browser says so rather than failing as a play with no summary (the spawn's ENOENT).
export const browserExecutable = (browser, executable) => {
  const name = { chrome: 'Chrome', firefox: 'Firefox' }[browser];
  if (!name) throw new Error(`no browser ${browser}: chrome or firefox`);
  const paths = executable ? [executable] : installs[browser];
  const found = paths.find((p) => !/[\\/]/.test(p) || fs.existsSync(p));
  if (!found) throw new Error(`${name} not found at ${paths.join(', ')}`);
  return found;
};

// A WebSocket client of text messages (RFC 6455), resolving once open: send(text), and the caller's
// onmessage(text) and onclose(code, reason, error), code 1006 for a socket that dropped with no close frame. Node's own
// WebSocket isn't used: Node 22's (undici 6) masks every frame after its 4,096th with zeros, since its pool of masks,
// 16,386 bytes, isn't a whole number of them, and Firefox drops the connection at the first such frame, which cut
// every Firefox play that sampled each second about 12 minutes in (docs/findings.md, A page that stops answering).
const webSocket = (url) => new Promise((resolve, reject) => {
  const { hostname, port, pathname, search } = new URL(url);
  const socket = net.connect({ host: hostname, port: Number(port) });
  const ws = { onmessage: () => {}, onclose: () => {} };
  let buffered = Buffer.alloc(0), open = false, closed = false, error = null, parts = [];
  // A client's frame: its length in 7, 16 or 64 bits, then a mask of its own and the payload masked with it.
  const frame = (opcode, payload) => {
    const length = payload.length, at = length < 126 ? 2 : length < 65536 ? 4 : 10;
    const out = Buffer.alloc(at + 4 + length);
    out[0] = 0x80 | opcode;
    out[1] = 0x80 | (at === 2 ? length : at === 4 ? 126 : 127);
    if (at === 4) out.writeUInt16BE(length, 2);
    else if (at === 10) out.writeBigUInt64BE(BigInt(length), 2);
    crypto.randomFillSync(out, at, 4);
    for (let i = 0; i < length; i++) out[at + 4 + i] = payload[i] ^ out[at + (i & 3)];
    if (!socket.destroyed) socket.write(out);
  };
  const end = (code, reason) => {
    if (closed) return;
    closed = true;
    socket.destroy();
    if (open) ws.onclose(code, reason, error);
    else reject(new Error(error ?? `no WebSocket at ${url}`));
  };
  ws.send = (text) => frame(0x1, Buffer.from(text));
  socket.on('connect', () => socket.write(`GET ${pathname}${search} HTTP/1.1\r\nHost: ${hostname}:${port}\r\n` +
    `Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\n` +
    'Sec-WebSocket-Version: 13\r\n\r\n'));
  socket.on('error', (e) => { error = e.message; });
  socket.on('close', () => end(1006, ''));
  socket.on('data', (data) => {
    buffered = Buffer.concat([buffered, data]);
    if (!open) {
      const at = buffered.indexOf('\r\n\r\n');
      if (at < 0) return;
      if (!/^HTTP\/1\.1 101/.test(buffered.toString('latin1', 0, at))) { error = buffered.toString('latin1', 0, at).split('\r\n')[0]; end(1006, ''); return; }
      buffered = buffered.subarray(at + 4);
      open = true;
      resolve(ws);
    }
    // The server's frames, unmasked: a message in parts (continuations), ping answered, close answered and ended.
    while (buffered.length >= 2) {
      let length = buffered[1] & 127, at = 2;
      if (length === 126) { if (buffered.length < 4) return; length = buffered.readUInt16BE(2); at = 4; }
      else if (length === 127) { if (buffered.length < 10) return; length = Number(buffered.readBigUInt64BE(2)); at = 10; }
      if (buffered.length < at + length) return;
      const fin = buffered[0] & 0x80, opcode = buffered[0] & 15, payload = buffered.subarray(at, at + length);
      buffered = buffered.subarray(at + length);
      if (opcode === 0x8) { frame(0x8, payload.subarray(0, 2)); end(length >= 2 ? payload.readUInt16BE(0) : 1005, payload.toString('utf8', 2)); return; }
      if (opcode === 0x9) frame(0xa, payload);
      else if (opcode <= 0x2) {
        parts.push(payload);
        if (fin) { const text = Buffer.concat(parts).toString('utf8'); parts = []; ws.onmessage(text); }
      }
    }
  });
});

// A JSON-over-WebSocket protocol (CDP and BiDi both are): send(method, params) resolves to the reply, and
// send(method, params, sessionId) goes to one of CDP's attached targets (a worker). send(method, params, sessionId, ms)
// gives up after ms. A call that gets no answer throws an error with unanswered set: one given up on, and every one
// outstanding or sent once the socket has closed (the browser gone). Without that, one call a page never answered (its
// thread blocked) or a browser killed mid-play held its tool for good. explain(), given, says after the close what became
// of the browser (watchBrowser's gone, below), and its answer ends the error's message.
const connect = async (url, onEvent, explain = null) => {
  const ws = await webSocket(url);
  let id = 0, closed = null;
  const pending = new Map();
  const unanswered = (message) => Object.assign(new Error(message), { unanswered: true });
  ws.onmessage = (data) => {
    const m = JSON.parse(data);
    if (!m.id) onEvent(m);
    else { pending.get(m.id)?.resolve(m); pending.delete(m.id); }
  };
  // The close says by its code and reason which end closed and why (1006: the socket dropped with no close frame), the
  // socket's error beside it, and what explain() found.
  ws.onclose = async (code, reason, error) => {
    const why = await (async () => explain?.())().catch(() => '');
    closed ??= unanswered(`the debugging connection closed (code ${code}${reason ? `, "${reason}"` : ''}` +
      `${error ? `, ${error}` : ''})${why ? `: ${why}` : ''}`);
    for (const call of pending.values()) call.reject(closed);
    pending.clear();
  };
  return (method, params = {}, sessionId = undefined, ms = 0) => new Promise((resolve, reject) => {
    if (closed) { reject(closed); return; }
    const i = ++id;
    const timer = ms ? setTimeout(() => { pending.delete(i); reject(unanswered(`no answer to ${method} in ${ms / 1000} s`)); }, ms) : null;
    pending.set(i, { resolve: (m) => { clearTimeout(timer); resolve(m); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });
};

// How long evaluate waits for the page to answer unless told otherwise: a page's own work answers well within it.
const evaluateMs = 30000;
// How long an eval, evalFile or need step waits for its promise: a plan's own script runs on the game's clock (a 30 s
// flight, landing through a test's results, a menu walk of up to 90 s), and one given up on at evaluateMs went on in
// the page beside the steps after it: Pilotwings 64's land(), still pressing A through the skydive's results, ran on
// while go() started on the next test, found the skydive still flying and gave it back. A page that stops answering
// is caught by play_page's sample, in its stalledSeconds.
const stepMs = 600000;
// How long a rom step waits for the launcher to store the ROM.
const romStoredMs = 30000;
// The path of a file of size bytes in the page's file system, outside /tmp, /dev and /proc, or null; false with no FS.
const storedFile = (size) => `(() => {
  if (typeof FS === 'undefined') return false;
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

// RDRAM in the wasm heap, found by the boot globals every game has at 0x80000300: osTvType, osRomBase and osMemSize.
const rdramHelpers = `(() => {
  if (window.n64r) return;
  let base = null;
  const find = () => {
    const h = HEAPU32;
    for (let i = 2; i < h.length - 8; i++) {
      if (h[i] === 0xB0000000 && h[i - 2] <= 2 && (h[i + 4] === 0x400000 || h[i + 4] === 0x800000)) return i * 4 - 0x308;
    }
    throw new Error('RDRAM not found');
  };
  window.n64r = (a) => { base ??= find(); return HEAPU32[(base + (a - 0x80000000)) >>> 2]; };
  window.n64w = (a, v) => { base ??= find(); HEAPU32[(base + (a - 0x80000000)) >>> 2] = v >>> 0; };
  // Waits for the clock read gives to move ticks on from from (from where it is when from is null), polling on a timer,
  // for at most ms; gives back where it is and whether it got there. A clock that goes back (a level that restarts it)
  // counts on from where it went back to.
  window.n64clock = (read, from, ticks, ms) => new Promise((resolve) => {
    const now = new Function('return ' + read), t0 = performance.now();
    let last = from ?? now(), moved = 0;
    const poll = () => {
      const at = now();
      moved = at < last ? 0 : moved + at - last;
      last = at;
      if (moved >= ticks) resolve([at, true]);
      else if (performance.now() - t0 > ms) resolve([at, false]);
      else setTimeout(poll, 1);
    };
    poll();
  });
})()`;

// Opens the browser ("chrome" or "firefox") on about:blank and gives back the page:
//   navigate(url), evaluate(js, ms) (the value, awaited and passed as JSON; throws on an exception, and with unanswered
//   set when the page gives no answer in ms, evaluateMs unless given, or the browser is gone), run(steps, extra),
//   stop(reason) (above), resize(w, h) and hide(ms) (the steps), close(), pid, profile, in Firefox
//   gpuProcessMemory() and geckoProfile, and in Chrome chromeTrace (below).
// onLine gets every console line and uncaught exception, as text. preload is JavaScript run in every document before
// the page's own.
// size is the viewport in CSS pixels, one a pixel, which a plan's clicks are in: 1256x645 unless given, what headless
// Chrome made of a 1280x800 window when the first plans were written. uncapped gives the page animation frames as fast
// as the browser makes them, not at the display's rate (a page opened with ?uncapped presents at that rate, plume's swap
// chain says how): Chrome with --disable-frame-rate-limit, which makes one when the last was drawn, and Firefox with
// layout.frame_rate firefoxUncappedRate, the 360 Hz plume reports. Firefox's 0 makes them as fast as it can whether
// anything was drawn or not, 1,500-11,500 a second on a desktop GPU, and composites or runs script for each, which
// took the GPU and the page's thread from the page (docs/findings.md, Uncapped in Firefox). cpuThrottle
// (Chrome only) slows the page's thread that many times (CDP Emulation.setCPUThrottlingRate), a stand-in for a
// laptop's CPU. scale is the device pixels a CSS pixel off the desktop, 1 unless given: 2 is a laptop at 200%, where a
// page whose canvas went to device pixels (SDL_WINDOW_ALLOW_HIGHDPI) drew four times the pixels and took every click
// at the wrong spot, so Load ROM opened nothing, which no run at 1 shows. onScreen (above) leaves size and scale to the
// window. firefoxPrefs are Firefox prefs of the caller's, set over the ones below, and chromeFlags Chrome switches of the
// caller's, after the ones below. affinity holds the browser, every process of it, to the first that many logical
// processors (0: all), a laptop's few cores in either browser (spawnHeld, below). fallbackAdapter gives the page the browser's software
// WebGPU adapter in place of the GPU, a slow GPU: Chrome started with --use-webgpu-adapter=swiftshader (SwiftShader,
// Vulkan on the CPU; Chrome 155 has no other: its warp, d3d11 and opengles values give the GPU or no adapter) and every
// requestAdapter() asked for forceFallbackAdapter, which is what gives Firefox one (D3D12's WARP, from wgpu's dx12
// backend; Firefox names no adapter to a page, and has none with forceFallbackAdapter on its vulkan backend).
export const firefoxUncappedRate = 360;

// Clicks the button the page shows for its file picker when the click that asked for one carries no user activation
// (frontend/file_picker.cpp), and says whether there was one.
const clickChooseButton = `(() => {
  const b = [...document.querySelectorAll('button')].find((b) => /^Choose (a file|files)$/.test(b.textContent.trim()));
  b?.click();
  return !!b;
})()`;

const fallbackAdapterPreload =`() => {
  if (!self.GPU) return;
  const requestAdapter = GPU.prototype.requestAdapter;
  GPU.prototype.requestAdapter = function (options) { return requestAdapter.call(this, { ...options, forceFallbackAdapter: true }); };
}`;

// spawn(), held to the first affinity logical processors (0: all) on Windows, where a process starts with its parent's
// affinity: this process is held to them while spawn() creates the browser (CreateProcess, before spawn() returns) and
// let go after, so the browser and every process it starts later (Chrome's GPU process and renderers, Firefox's
// launcher's browser and its GPU and content processes) take them, which no flag of either browser does, and the
// helpers started after it (the counters' PowerShell, nvidia-smi) don't. On an SMT processor two logical processors are
// one core (0 and 1 on this repo's desktops), so 4 is two cores of four threads, as a laptop's i3 has. Elsewhere taskset.
const spawnHeld = (affinity, command, args, options) => {
  if (!affinity) return spawn(command, args, options);
  if (process.platform !== 'win32') return spawn('taskset', ['-c', `0-${affinity - 1}`, command, ...args], options);
  const hold = (mask) => execFileSync('powershell', ['-NoProfile', '-Command',
    `$p = Get-Process -Id ${process.pid}; $o = $p.ProcessorAffinity; $p.ProcessorAffinity = ${mask}; [int64]$o`], { encoding: 'utf8' }).trim();
  const all = hold((2n ** BigInt(affinity) - 1n).toString());
  try { return spawn(command, args, options); } finally { hold(all); }
};

// close(): asks the browser to close (ask, Browser.close or browser.close) and waits up to ms for it to exit, then stops it
// with every process it started if it is still running. Chrome can close the socket without answering Browser.close,
// so this waits for the process, not the reply; and over a debugging connection that dropped (1006) the ask never gets
// there. A browser left running holds the GPU and its profile until something stops it: on Windows the tool's own exit
// does (libuv starts a child in a job object that ends with its parent), elsewhere nothing, into whatever plays next.
// taskkill /T takes the browser's own processes with it (it walks the tree from the browser, so before it is gone). The
// wait is 30 s in both: Chrome stopped before it has ended loses what it wrote to its caches (docs/playing.md), and on a
// host at 100% it took 10-12 s to end after Browser.close.
const closeBrowser = async (proc, ask, ms, line) => {
  const running = () => proc.exitCode === null && proc.signalCode === null;
  if (running()) {
    let timer;
    const exited = new Promise((resolve) => { proc.once('exit', resolve); timer = setTimeout(resolve, ms); });
    ask().catch(() => {});
    await exited;
    clearTimeout(timer);
  }
  if (!running()) return;
  line(`page_driver: the browser had not exited ${ms / 1000} s after it was asked to close, so it was stopped`);
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/T', '/F', '/PID', String(proc.pid)], { stdio: 'ignore', windowsHide: true, timeout: 10000 }); } catch {}
  } else {
    try { proc.kill('SIGKILL'); } catch {}
  }
};

// What a browser leaves when it goes, which a debugging connection that closed (1006, ECONNRESET) doesn't say: whether
// it is still running or how it exited, the last lines of its stderr, and the crash dumps its crash reporter wrote in the
// profile (dumpDir: Chrome's Crashpad/reports, Firefox's minidumps), copied to <profile>-crashes since play_page deletes
// a fresh profile at its end. In headless Chrome on Windows (docs/findings.md, A browser that goes) a crash of the tab's
// renderer or of the GPU process leaves the connection open and the browser running, each with a dump; the browser's own
// crash closes it with 1006 and exits with an exception code (0x80000003) and a dump; and the browser stopped from
// outside (taskkill) closes it the same way and exits with 1, with no dump. gone(ms) waits up to ms for the exit, puts
// the stderr's last lines in the log and says what it found; dumps() says where the dumps written since it last looked
// went, or '', which close() puts in the log too (a GPU process's crash the browser lived through).
const watchBrowser = (proc, name, profile, dumpDir, line) => {
  const dir = path.join(profile, dumpDir), kept = `${profile}-crashes`;
  const list = () => { try { return fs.readdirSync(dir).filter((f) => f.endsWith('.dmp')); } catch { return []; } };
  const seen = new Set(list());
  const tail = [];
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (text) => { tail.push(...text.split(/\r?\n/).filter(Boolean)); tail.splice(0, tail.length - 10); });
  let exit = null;
  const exited = new Promise((resolve) => proc.once('exit', (code, signal) => {
    exit = signal ?? (code > 0xffff ? `0x${code.toString(16)}` : String(code));
    resolve();
  }));
  const dumps = () => {
    const found = list().filter((f) => !seen.has(f));
    if (!found.length) return '';
    fs.mkdirSync(kept, { recursive: true });
    for (const f of found) { seen.add(f); try { fs.copyFileSync(path.join(dir, f), path.join(kept, f)); } catch {} }
    return `${found.length} crash dump${found.length > 1 ? 's' : ''}, kept in ${kept}`;
  };
  const gone = async (ms) => {
    await Promise.race([exited, sleep(ms)]);
    if (tail.length) line(`page_driver: ${name}'s stderr ended:\n  ${tail.join('\n  ')}`);
    return `${name} ${exit === null ? `was still running ${ms / 1000} s later` : `exited with code ${exit}`}, ${dumps() || 'no crash dump'}`;
  };
  return { gone, dumps };
};

export const open = async (browser, { profile, port, size = [1256, 645], executable, rom, planDir = '.', preload = '',
  headed = false, onScreen = false, uncapped = false, cpuThrottle = 0, scale = 1, firefoxPrefs = {}, chromeFlags = [], affinity = 0, fallbackAdapter = false,
  onLine = () => {}, log = console.log }) => {
  if (fallbackAdapter) preload = preload ? `() => { (${fallbackAdapterPreload})(); (${preload})(); }` : fallbackAdapterPreload;
  fs.mkdirSync(profile, { recursive: true });
  profile = path.resolve(profile);
  const [width, height] = size;
  const waiters = new Set();
  const line = (text) => { onLine(text); for (const waiter of waiters) waiter(text); };
  let page;
  if (cpuThrottle && browser !== 'chrome') throw new Error('cpuThrottle is Chrome\'s only');
  // A debugging port another browser holds is refused, not shared: the browser started here would take the other
  // address (Chrome binds [::1] when 127.0.0.1 is taken), and the tool would drive and measure the other one's page.
  // Without one given it is a free one, so plays started beside each other each get their own.
  port ??= await freePort();
  for (const host of ['127.0.0.1', '::1']) {
    if (await listening(host, port)) throw new Error(`debugging port ${port} is taken on ${host}: give another --port`);
  }
  const stopPage = (reason) => page?.stop(reason);
  if (browser === 'chrome') page = await openChrome({ profile, port, width, height, executable, rom, preload, headed, onScreen, uncapped, cpuThrottle, scale, chromeFlags, affinity, fallbackAdapter, line, stopPage });
  else if (browser === 'firefox') page = await openFirefox({ profile, port, width, height, executable, rom, preload, onScreen, uncapped, scale, firefoxPrefs, affinity, line });
  else throw new Error(`no browser ${browser}: chrome or firefox`);

  page.profile = profile;
  page.viewport = () => page.evaluate('[innerWidth, innerHeight, devicePixelRatio]');
  // A plan's x and y, in 1256x645, in the viewport the page has now.
  const place = async (x, y) => {
    const [w, h] = await page.viewport();
    const scale = h / 645;
    return [Math.round(w / 2 + (x - 628) * scale), Math.round(h / 2 + (y - 322.5) * scale)];
  };
  let stopped = null;
  let stop;
  const stopping = new Promise((resolve, reject) => { stop = reject; });
  stopping.catch(() => {});
  page.stop = (reason) => { stopped ??= new Error(reason); stop(stopped); };
  page.run = (steps, extra) => Promise.race([runSteps(steps, extra), stopping]);
  const runSteps = async (steps, extra = {}) => {
    let clock = null, asked = 0, held = 0;
    const ticks = (ms) => Math.max(1, Math.round(ms * clock[1] / 1000));
    // ms of the game's time on from from (null: from now), or of wall time with no clock.
    const onClock = async (ms, from = null) => {
      if (!clock) return sleep(ms);
      const [read] = clock;
      const [at, got] = await page.evaluate(`n64clock(${JSON.stringify(read)}, ${from}, ${ticks(ms)}, ${ms * 5 + 30000})`, ms * 5 + 30000 + evaluateMs);
      if (!got) log(`the clock stood still: ${read} stayed ${at} through ${ms} ms of the game's time`);
      return at;
    };
    for (const [op, ...a] of steps) {
      if (stopped) throw stopped;
      if (extra[op]) await extra[op](...a);
      else if (op === 'clock') {
        clock = a.length ? a : null;
        if (clock) await page.evaluate(rdramHelpers);
      }
      else if (op === 'wait') await onClock(a[0]);
      else if (op === 'until') {
        const re = new RegExp(a[0]);
        await new Promise((resolve) => {
          const waiter = (text) => { if (re.test(text)) { clearTimeout(timer); waiters.delete(waiter); resolve(); } };
          const timer = setTimeout(() => { waiters.delete(waiter); log(`timed out waiting for /${a[0]}/`); resolve(); }, a[1]);
          waiters.add(waiter);
        });
      }
      else if (op === 'click') await page.click(...await place(a[0], a[1]));
      else if (op === 'key') { await page.key('down', a); await page.key('up', a); }
      else if (op === 'hold') {
        const from = clock ? await onClock(1000 / clock[1]) : null;
        await page.key('down', a); await onClock(a[3], from); await page.key('up', a);
        if (clock) {
          const after = await page.evaluate(clock[0]);
          asked += ticks(a[3]); held += after >= from ? after - from : after;
        }
      }
      else if (op === 'down' || op === 'up') await page.key(op, a);
      else if (op === 'pressUntil') {
        const [code, key, keyCode, holdMs, everyMs, test, timeoutMs] = a;
        await page.evaluate(rdramHelpers);
        const end = Date.now() + timeoutMs;
        const done = async () => { try { return await page.evaluate(`!!(${test})`) === true; } catch { return false; } };
        while (!(await done())) {
          if (Date.now() > end) { log(`timed out pressing ${key} until ${test}`); break; }
          await page.key('down', [code, key, keyCode]); await sleep(holdMs); await page.key('up', [code, key, keyCode]);
          await sleep(everyMs);
        }
      }
      else if (op === 'eval' || op === 'evalFile' || op === 'need') {
        const js = (op === 'evalFile') ? fs.readFileSync(path.resolve(planDir, a[0]), 'utf8') : a[0];
        let value, failed = false;
        try { await page.evaluate(rdramHelpers); value = await page.evaluate(js, stepMs); } catch (e) { value = 'exception: ' + e.message; failed = true; }
        if (value !== undefined) log(`${op}: ${JSON.stringify(value)}`);
        if (op === 'need' && (failed || value === false || value === null)) throw new Error(`${a[0]} gave ${JSON.stringify(value)}`);
      }
      else if (op === 'rom') {
        await page.rom(typeof a[0] === 'string' ? async () => { await page.key('down', a); await page.key('up', a); }
          : async () => page.click(...await place(a[0], a[1])));
        const given = Date.now(), size = (fs.statSync(rom).size + 3) & ~3;
        let at = null;
        while (!at && Date.now() - given < romStoredMs) {
          at = await page.evaluate(storedFile(size));
          if (at === false) break;
          if (!at) await sleep(250);
        }
        const seconds = ((Date.now() - given) / 1000).toFixed(1);
        if (at === false) log('the page has no FS to see the launcher store the ROM in');
        else log(at ? `the launcher stored the ROM (${at}) ${seconds} s after it was given`
          : `the launcher stored no copy of the ROM in ${seconds} s`);
      }
      else if (op === 'shot') fs.writeFileSync(a[0], await page.screenshot());
      else if (op === 'resize') {
        if (onScreen) throw new Error('resize is off the desktop only: on screen the window is the desktop\'s');
        await page.resize(a[0], a[1]);
      }
      else if (op === 'hide') await page.hide(a[0]);
      else throw new Error(`unknown step ${op}`);
    }
    if (asked) log(`holds on the clock: ${asked} ticks asked, ${held} held`);
  };
  return page;
};

// Wraps js so that both protocols give back its value, awaited, as JSON text.
// A port free on 127.0.0.1 now, the system's pick, for the browser to take.
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer().once('error', reject).listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

const listening = (host, port) => new Promise((resolve) => {
  const socket = net.connect({ host, port });
  socket.setTimeout(1000);
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
  socket.once('timeout', () => { socket.destroy(); resolve(false); });
});

const asJson = (js) => `Promise.resolve((0, eval)(${JSON.stringify(js)})).then((v) => v === undefined ? undefined : JSON.stringify(v))`;

const openChrome = async ({ profile, port, width, height, executable, rom, preload, headed, onScreen, uncapped, cpuThrottle, scale, chromeFlags = [], affinity, fallbackAdapter, line, stopPage }) => {
  // A window off the desktop counts as hidden, and Chrome stops drawing a hidden one unless told not to (on screen,
  // another window over it would hide it too).
  const mode = headed || onScreen
    ? ['--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding', '--no-default-browser-check']
    : ['--headless=new'];
  if (uncapped) mode.push('--disable-frame-rate-limit');
  if (fallbackAdapter) mode.push('--use-webgpu-adapter=swiftshader');
  const size = onScreen ? ['--start-maximized'] : [`--force-device-scale-factor=${scale}`, `--window-size=${width},${height}`];
  // Muted, nothing reaches a speaker, but the page's sound is zeroes, so Chrome reads its tab as silent and lowers a
  // hidden one's process to the background priority it spares a tab that plays sound. --disable-audio-output in
  // chromeFlags plays it to no device instead, which Chrome still hears, so it replaces --mute-audio.
  const mute = chromeFlags.includes('--disable-audio-output') ? [] : ['--mute-audio'];
  const proc = spawnHeld(affinity, browserExecutable('chrome', executable), [...mode, ...size, '--enable-unsafe-webgpu', ...mute,
    '--no-first-run', '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, ...chromeFlags, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const watch = watchBrowser(proc, 'Chrome', profile, 'Crashpad/reports', line);
  let closing = false;
  if (headed && !onScreen && process.platform === 'win32' && !await moveWindow('chrome.exe', profile, width, height)) {
    line('page_driver: Chrome window not moved');
  }
  let targets = null;
  for (let i = 0; i < 300 && !targets; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); }
  }
  if (!targets) throw new Error('Chrome never answered on its debugging port');
  let fileChooser = null, tracingComplete = null;
  // The game's threads are workers, and an exception on one reaches the page only as an ErrorEvent without its stack,
  // so each worker is attached to as it starts and its exceptions are reported from there, stack and all (a wasm
  // frame names its function if the page was linked with --profiling-funcs). Its console lines come through the page
  // already, so only its exceptions are taken. Auto-attach takes the page's service worker too (coi_serviceworker.js on
  // a host without the headers), held until resumed, and Runtime.enable doesn't answer a held service worker: resumed
  // only once that answered, it never activated, and the page from such a host was never cross-origin isolated. So
  // the two go out together; each target takes them in order, so a worker still has Runtime on before it runs.
  const target = targets.find((t) => t.type === 'page');
  let send;
  send = await connect(target.webSocketDebuggerUrl, (m) => {
    // The tab's renderer gone: its connection stays open but nothing in the page answers again, so the run ends here
    // rather than at its next evaluate's timeout, once Crashpad has had a moment to write the dump.
    if (m.method === 'Inspector.targetCrashed') {
      setTimeout(() => {
        const reason = `the page's renderer crashed (${watch.dumps() || 'no crash dump'})`;
        line(`page_driver: ${reason}`);
        stopPage(reason);
      }, 2000);
      return;
    }
    if (m.method === 'Target.attachedToTarget') {
      const session = m.params.sessionId;
      send('Runtime.enable', {}, session).catch(() => {});
      send('Runtime.runIfWaitingForDebugger', {}, session).catch(() => {});
      return;
    }
    if (m.method === 'Page.fileChooserOpened') fileChooser = m.params;
    if (m.method === 'Tracing.tracingComplete') tracingComplete = m.params;
    if (m.method === 'Runtime.consoleAPICalled' && !m.sessionId) {
      line(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      line((m.sessionId ? 'exception on a worker: ' : 'exception: ') +
        (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
    }
  }, () => closing ? '' : watch.gone(5000));
  await send('Inspector.enable');
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  await send('Runtime.enable');
  await send('Page.enable');
  if (!onScreen) await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
  if (cpuThrottle > 1) await send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  if (preload) await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${preload})()` });
  const click = async (x, y) => {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
  };
  return {
    pid: proc.pid,
    navigate: (url) => send('Page.navigate', { url }),
    evaluate: async (js, ms = evaluateMs) => {
      const r = await send('Runtime.evaluate', { expression: asJson(js), awaitPromise: true, returnByValue: true }, undefined, ms);
      if (r.result?.exceptionDetails) {
        throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
      }
      const value = r.result?.result?.value;
      return value === undefined ? undefined : JSON.parse(value);
    },
    click,
    key: (upDown, [code, key, keyCode]) => send('Input.dispatchKeyEvent',
      { type: upDown === 'down' ? 'keyDown' : 'keyUp', code, key: key ?? code, windowsVirtualKeyCode: keyCode ?? 0 }),
    rom: async (act) => {
      await send('Page.setInterceptFileChooserDialog', { enabled: true });
      fileChooser = null;
      for (let tries = 1; !fileChooser; tries++) {
        await act();
        for (const until = Date.now() + 10000; !fileChooser && Date.now() < until;) {
          await sleep(100);
          const r = await send('Runtime.evaluate', { expression: clickChooseButton, userGesture: true, returnByValue: true });
          if (r.result?.result?.value) line('page_driver: the page asked for the ROM with its own button (the click\'s activation had run out): clicked it');
        }
        if (fileChooser) break;
        if (tries === 3) throw new Error('no file chooser opened');
        line('page_driver: no file chooser 10 s after Load ROM: pressing it again');
      }
      const given = await send('DOM.setFileInputFiles', { files: [path.resolve(rom)], backendNodeId: fileChooser.backendNodeId });
      await send('Page.setInterceptFileChooserDialog', { enabled: false });
      if (given.error) throw new Error(`the ROM never reached the page's file input (${given.error.message}): a GC took it`);
    },
    screenshot: async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'),
    resize: (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: false }),
    hide: async (ms) => {
      const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
      await send('Target.activateTarget', { targetId });
      await sleep(ms);
      await send('Target.activateTarget', { targetId: target.id });
      await send('Target.closeTarget', { targetId });
    },
    // A Chrome trace, what DevTools' Performance panel records: start() traces every process and samples the
    // JavaScript and wasm stacks of every thread of the page's (V8's sampler, the workers the game's threads are
    // included), and stop(file) writes the trace as JSON for the Performance panel or ui.perfetto.dev.
    chromeTrace: {
      start: () => send('Tracing.start', { transferMode: 'ReturnAsStream', traceConfig: { recordMode: 'recordAsMuchAsPossible',
        includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
          'toplevel', 'v8.execute', 'blink.console', 'disabled-by-default-v8.cpu_profiler', 'gpu', 'webgpu'] } }),
      stop: async (file) => {
        tracingComplete = null;
        await send('Tracing.end');
        for (let i = 0; i < 1200 && !tracingComplete; i++) await sleep(100);
        if (!tracingComplete?.stream) throw new Error('the trace never completed');
        const out = fs.openSync(file, 'w');
        for (;;) {
          const r = (await send('IO.read', { handle: tracingComplete.stream, size: 1 << 22 })).result;
          fs.writeSync(out, r.base64Encoded ? Buffer.from(r.data, 'base64') : r.data);
          if (r.eof) break;
        }
        fs.closeSync(out);
        await send('IO.close', { handle: tracingComplete.stream });
      },
    },
    close: async () => {
      closing = true;
      await closeBrowser(proc, () => send('Browser.close'), 30000, line);
      const left = watch.dumps();
      if (left) line(`page_driver: Chrome left ${left}`);
    },
  };
};

// Moves the window of the browser (its exe's name) whose command line names this profile off the desktop, big enough
// for the viewport, or with no size maximizes it on the desktop.
// From a DPI-aware process, or a desktop scaled 175% makes it 1.75 times as big.
const moveWindow = (exe, profile, width, height) => new Promise((resolve) => {
  const place = width
    ? `[W.U]::SetWindowPos($w, [IntPtr]::Zero, -${width + 200}, 0, ${width + 100}, ${height + 200}, 0x14)`
    : '[W.U]::ShowWindow($w, 3)';
  const script = `
Add-Type -Name U -Namespace W -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetWindowPos(System.IntPtr h, System.IntPtr a, int x, int y, int cx, int cy, uint f); [DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int c); [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();'
[W.U]::SetProcessDPIAware() | Out-Null
$w = 0
for ($i = 0; $i -lt 100 -and -not $w; $i++) {
  Start-Sleep -Milliseconds 200
  $w = Get-CimInstance Win32_Process -Filter "Name='${exe}'" | ? { $_.CommandLine -and $_.CommandLine.Contains($env:PAGE_DRIVER_PROFILE) } |
    % { (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).MainWindowHandle } | ? { $_ -and $_ -ne 0 } | Select-Object -First 1
}
if ($w) { ${place} | Out-Null; 'moved' }`;
  execFile('powershell', ['-NoProfile', '-Command', script], { env: { ...process.env, PAGE_DRIVER_PROFILE: profile } },
    (err, stdout) => resolve(!err && stdout.includes('moved')));
});

const openFirefox = async ({ profile, port, width, height, executable, rom, preload, onScreen, uncapped, scale, firefoxPrefs, affinity, line }) => {
  // No first-run pages or crash restore, scale device pixels a CSS pixel (but on screen), sound allowed to start without a click
  // but silent.
  const prefs = { 'browser.shell.checkDefaultBrowser': false, 'datareporting.policy.dataSubmissionEnabled': false,
    'browser.aboutwelcome.enabled': false, 'app.update.auto': false, 'browser.sessionstore.resume_from_crash': false,
    'dom.webgpu.enabled': true, 'media.volume_scale': '0.0', ...(onScreen ? {} : { 'layout.css.devPixelsPerPx': scale.toFixed(1) }),
    'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0, 'layout.frame_rate': uncapped ? firefoxUncappedRate : -1, ...firefoxPrefs };
  fs.writeFileSync(path.join(profile, 'user.js'),
    Object.entries(prefs).map(([k, v]) => `user_pref("${k}", ${JSON.stringify(v)});`).join('\n') + '\n');
  // BiDi's session.new answers only once the browser's startup idle tasks have run, and on a fresh profile they wait
  // behind its first sync of remote settings from Mozilla's servers (dozens of collections into IndexedDB). The remote
  // agent points remote settings at a dummy server (services.settings.server) so that they stay off the network, but a
  // release Firefox ignores that pref unless MOZ_REMOTE_SETTINGS_DEVTOOLS is 1. Without it session.new took 30 s to over
  // 8 minutes on some hosts, which ran smoke plays out of their turns; with it a headless start answered in 2-14 s
  // (docs/findings.md, Firefox slow to start).
  const proc = spawnHeld(affinity, browserExecutable('firefox', executable), ['-no-remote', '-profile', profile,
    '--remote-debugging-port', String(port), '--remote-allow-system-access', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, MOZ_REMOTE_SETTINGS_DEVTOOLS: '1', MOZ_CRASHREPORTER_NO_REPORT: '1' } });
  const watch = watchBrowser(proc, 'Firefox', profile, 'minidumps', line);
  let send = null, closing = false;
  for (let i = 0; i < 150 && !send; i++) {
    try {
      send = await connect(`ws://127.0.0.1:${port}/session`, (m) => {
        if (m.method === 'log.entryAdded') line(m.params.type === 'javascript' ? 'exception: ' + m.params.text : m.params.text);
      }, () => closing ? '' : watch.gone(5000));
    } catch { await sleep(200); }
  }
  if (!send) throw new Error('Firefox never answered on its debugging port');
  await send('session.new', { capabilities: {} });
  await send('session.subscribe', { events: ['log.entryAdded'] });
  const context = (await send('browsingContext.getTree', {})).result.contexts[0].context;
  if (process.platform === 'win32' && !await moveWindow('firefox.exe', profile, onScreen ? 0 : width, height)) line('page_driver: Firefox window not moved');
  if (!onScreen) {
    const viewport = await send('browsingContext.setViewport', { context, viewport: { width, height }, devicePixelRatio: scale });
    if (viewport.error) line(`page_driver: viewport not set: ${viewport.message ?? viewport.error}`);
  }
  if (preload) await send('script.addPreloadScript', { functionDeclaration: preload });
  const evaluate = async (js, ms = evaluateMs) => {
    const r = await send('script.evaluate', { expression: asJson(js), target: { context }, awaitPromise: true }, undefined, ms);
    if (r.error) throw new Error(r.message ?? r.error);
    if (r.result.type === 'exception') throw new Error(r.result.exceptionDetails.text);
    const value = r.result.result.value;
    return value === undefined ? undefined : JSON.parse(value);
  };
  const click = (x, y) => evaluate(`(() => {
    const canvas = document.getElementById('canvas') ?? document.querySelector('canvas');
    for (const type of ['mousemove', 'mousedown', 'mouseup']) {
      canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: ${x}, clientY: ${y}, button: 0, buttons: type === 'mousedown' ? 1 : 0 }));
    }
  })()`);
  return {
    pid: proc.pid,
    // What about:memory says of the GPU process, in MB (null if Firefox has none): private bytes, Firefox's own heap
    // (mozjemalloc: Gecko's WebGPU code and wgpu), the system heap (Windows' heaps: the D3D12 runtime, the GPU's
    // driver, DXC) and the GPU memory it has committed, dedicated and shared. Read from nsIMemoryReporterManager in
    // the browser's chrome context, which BiDi reaches only with --remote-allow-system-access; about:memory itself
    // can't be opened from BiDi. A leak there shows which of them grows, so whose it is.
    gpuProcessMemory: async () => {
      const chrome = (await send('browsingContext.getTree', { 'moz:scope': 'chrome' })).result?.contexts?.[0]?.context;
      if (!chrome) return null;
      const r = await send('script.evaluate', { target: { context: chrome }, awaitPromise: true, expression: `new Promise((resolve) => {
        const paths = { 'private': 'private', 'heap-allocated': 'heap', 'system-heap-allocated': 'systemHeap',
          'gpu-committed': 'gpuCommitted', 'gpu-dedicated': 'gpuDedicated', 'gpu-shared': 'gpuShared' };
        const out = {};
        Cc['@mozilla.org/memory-reporter-manager;1'].getService(Ci.nsIMemoryReporterManager).getReports(
          (process, path, kind, units, amount) => {
            if (/^GPU /.test(process) && paths[path]) out[paths[path]] = Math.round(amount / 1048576);
          }, null, () => resolve(JSON.stringify(out)), null, false);
      })` });
      const value = r.result?.result?.value;
      return value && value !== '{}' ? JSON.parse(value) : null;
    },
    // The Gecko profiler over every process, the GPU process included (a profile Firefox writes at shutdown,
    // MOZ_PROFILER_SHUTDOWN, leaves that one out): start() samples the threads that carry a page's work, the page's
    // own and the GPU process's CanvasRenderer, which does all of a page's WebGPU, every interval ms with native
    // stacks and each sample's CPU time; dump(file) writes the profile as JSON for profiler.firefox.com, unsymbolicated.
    geckoProfile: {
      start: async (interval = 10) => {
        const chrome = (await send('browsingContext.getTree', { 'moz:scope': 'chrome' })).result?.contexts?.[0]?.context;
        await send('script.evaluate', { target: { context: chrome }, awaitPromise: true, expression: `Services.profiler.StartProfiler(
          1 << 26, ${interval}, ['stackwalk', 'cpu'],
          ['GeckoMain', 'CanvasRenderer', 'Compositor', 'Renderer', 'DOM Worker', 'WebGPU']), undefined` });
        return chrome;
      },
      dump: async (file) => {
        const chrome = (await send('browsingContext.getTree', { 'moz:scope': 'chrome' })).result?.contexts?.[0]?.context;
        const r = await send('script.evaluate', { target: { context: chrome }, awaitPromise: true, expression:
          `Services.profiler.dumpProfileToFileAsync(${JSON.stringify(path.resolve(file))}).then(() => Services.profiler.StopProfiler())` });
        if (r.result?.type === 'exception') throw new Error(r.result.exceptionDetails.text);
      },
    },
    navigate: (url) => send('browsingContext.navigate', { context, url, wait: 'none' }),
    evaluate,
    click,
    key: (upDown, [code, key, keyCode]) => evaluate(`window.dispatchEvent(new KeyboardEvent('key${upDown}',
      { bubbles: true, code: ${JSON.stringify(code)}, key: ${JSON.stringify(key ?? code)}, keyCode: ${keyCode ?? 0}, which: ${keyCode ?? 0} })), undefined`),
    rom: async (act) => {
      const data = fs.readFileSync(rom);
      await evaluate(`window.__romPieces = []; undefined`);
      for (let i = 0; i < data.length; i += 1 << 19) {
        await evaluate(`window.__romPieces.push(Uint8Array.from(atob('${data.subarray(i, i + (1 << 19)).toString('base64')}'), (c) => c.charCodeAt(0))); undefined`);
      }
      await evaluate(`(() => {
        window.__romGiven = false;
        const click = HTMLInputElement.prototype.click;
        HTMLInputElement.prototype.click = function () {
          if (this.type !== 'file' || window.__romGiven) return click.apply(this, arguments);
          const files = new DataTransfer();
          files.items.add(new File(window.__romPieces, ${JSON.stringify(path.basename(rom))}));
          this.files = files.files;
          window.__romGiven = true;
          this.dispatchEvent(new Event('change', { bubbles: true }));
        };
      })()`);
      for (let tries = 1; ; tries++) {
        await act();
        for (let i = 0; i < 100; i++) {
          await sleep(100);
          if (await evaluate(`window.__romGiven || (${clickChooseButton}, false)`)) return;
        }
        if (tries === 3) throw new Error('the page never asked for a file');
        line('page_driver: the page asked for no file 10 s after Load ROM: pressing it again');
      }
    },
    screenshot: async () => Buffer.from((await send('browsingContext.captureScreenshot', { context })).result.data, 'base64'),
    resize: (w, h) => send('browsingContext.setViewport', { context, viewport: { width: w, height: h }, devicePixelRatio: scale }),
    hide: async (ms) => {
      const tab = (await send('browsingContext.create', { type: 'tab' })).result.context;
      await sleep(ms);
      await send('browsingContext.activate', { context });
      await send('browsingContext.close', { context: tab });
    },
    close: async () => {
      closing = true;
      await closeBrowser(proc, () => send('browser.close'), 30000, line);
      const left = watch.dumps();
      if (left) line(`page_driver: Firefox left ${left}`);
    },
  };
};
