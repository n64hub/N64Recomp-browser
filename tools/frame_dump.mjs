// Dumps a recomp's frames by a plan on Linux and checks them, in the container of tools/frame_dump.Dockerfile, which
// tools/remote_frame_dump.sh starts on a Linux host with an NVIDIA GPU: the dumps and
// tools/frame_check.mjs on them, made on that host's GPU and CPU instead of the machine a person or an agent works on.
// A dump is ~20 MB a second of frames, too much to bring back over a slow link, so only the check's text, the
// program's logs, the plan's steps and shots and frame_check's flagged frames stay; the dumps are deleted unless --keep.
//
//   node tools/frame_dump.mjs --game <dir> --exe <name> --game-id <id> --rom <file> --plan <file> --out <dir>
//       [--window <w>x<h>[,<w>x<h>,<w>x<h>]] [--rate <hz>] [--seconds <from>-<to>] [--args "<program args>"]
//       [--env K=V,...] [--config <dir>] [--check "<frame_check args>"] [--workers <n>] [--keep]
//       [--reuse] [--queue <module>] [--vram <MiB>|auto] [--priority low] [--url <url>] [--sound-reference <dir>]
//       [--launcher] [--no-dump] [--slow] [--saves <plan>]
//       [--restart]
//       [--soak <seconds> [--still <seconds>] [--seed <n>]]
//
// --game is the folder of a recomp's Linux build (its release archive unpacked, or its build folder with assets/),
// --exe the program in it, --game-id the name its runtime stores the ROM under (<game id>.z64, as Load ROM does). Each
// run copies --game into a folder of its own under --out with a portable.txt, so its settings and saves are the run's,
// stores the ROM, copies --config's files in (a graphics.json, a general.json) and starts the program with --boot,
// --window and --args, SDL's dummy sound driver, and RT64_FRAME_DUMP (and RT64_FRAME_DUMP_SECONDS from --seconds).
// Each run's sound is recorded too, by tools/sdl_audio_record.c (built with the image's cc and loaded with
// LD_PRELOAD), into <out>/<run>/sound.tsv and sound.raw, and each step of the plan's time into steps.tsv, and
// tools/sound_check.mjs checks the first run's after frame_check, against --sound-reference's if given (a run's folder
// of an earlier dump, by the same plan, of a build whose sound is right), its text in sound_check.txt. The recording
// stays (about 23 MB a minute) for a later check against another.
// RT64's refresh rate is set to Manual at --rate (60) in its graphics.json, made by a first start of the program
// when --config has none: an X server with no display has no refresh rate of its own, and at Display the program presents only the game's own
// frames, which test nothing of the frames between. 60 is a 60 Hz display's, where a game of 30 shows each frame twice,
// once between, as on Windows, where the checks were measured; a game of 60 needs 120. A rate the presents can't keep
// up with doesn't slow the game: RT64 skips a present whose next one is already queued, so the dump keeps only some of
// the game's frames, each at its pace, and the checks read its motion 0.1-0.5 s apart (Mario Golf's at Manual 240 in a
// 1280x960 window under Xvfb, which copied each present on the CPU, kept 3.3 of its own frames a second, each shown 7
// times). Each run's line says how fast its dump came: presents and the
// game's own frames a second, and the presents the game queued against those in the dump, and frame_check leaves a
// dump that lacks over a tenth of them untested (exit 2).
//
// --window gives each run's window: one size is one run, frame_check reading its dump alone; three are three runs of
// the plan, the first checked with the second as --narrower (a 4:3 window) and the third as --wider (32:9), the check
// of the frames between the game's and the sides asks for. Two are tools/seam_check.mjs's: the first at 4 times the
// console's resolution or more (1280x960) and the second at its own (320x240), the first checked for seams thinner
// than a console pixel that the second lacks (its header says how), and --check's arguments are seam_check's. With --window the plan's size steps are skipped. Without it each run is the plan's own size steps
// from a 1280x720 window.
//
// --restart checks that what a player sets is what the game runs, after a first launch and after a restart, in place
// of frame_check: the plan is played three times in one copy of the game, its first launch with only --config's files
// (none given: a new player's very first launch) and two more starts after it (restart, again), each reading what the
// one before it left, the window --window's first size. A first launch's settings must be the defaults in effect, not
// only on disk (librecomp writes them out without calling the options' change callbacks, so an option read only in
// its callback keeps its C++ starting value until the next launch), and a setting or a binding, once written, must
// read back the same at every start. It fails where the first launch's settings files don't hold --config's values,
// where a start changed a value in them, where the runs' dumps were drawn at another size or shown in another number
// of frames a game frame, and where two launches' shots of a still picture differ (restartCheck() says how much). So
// the plan's shots are of moments that hold still at the same game state in every launch (a race's countdown, reached
// by until steps), where an option a player sees shows: Rush 2049's countdown on its first track tells Draw Distance,
// Level of Detail and Scenery Culling at Original from their defaults. On v0.1.26, whose first launch ran them at
// Original, 7 of 18 launches drew so (3 of 6 first launches, and some starts after them too), and 5 of 6 checks failed;
// on v0.1.78, 2 of 15 launches (each a third start, whose files said the defaults), and 2 of 5 checks: the fault strikes at
// some starts and not others, so one pass says little and a game's check is played two or three times. It writes <out>/restart.txt, each run's shots and its settings files (<out>/<run>/settings), and
// passes RT64_FRAME_DUMP_RATE=--rate in place of graphics.json's Manual, which a first launch doesn't have yet. Exit 0
// passes, 1 fails, 3 a run failed.
//
// The plan is tools/capture_window.ps1's (its header has every step), its times in seconds since the program started:
// key, down, up, size, shot (a PNG of the window, <out>/<run>/<name>.png), until, poke, or, peek, dump, find and end
// do what they do there, keys through XTEST into the window and RDRAM through /proc/<pid>/mem (the runtime maps it as
// one 512 MB region, 0x80000000 at its first byte, each 32-bit word in the host's order). burst, record and stop are
// captures, which the dump replaces: they are skipped. drag, Windows' move loop, has no counterpart and fails the run.
// Three steps are this tool's own:
//   <s> clock <addr> <per second>  from here to the run's end, reads the game's 32-bit counter at addr every 100 ms
//                                  against real time, a counter that counts that many a second on a console (Mario
//                                  Golf's frame counter, 0x800B67F0, 30; Donald Duck's clock, 0x800C3D24, 60), and
//                                  tools/game_speed.mjs judges the game's speed from it: each run's speed.tsv has the
//                                  reads, the log what was judged. A game faster than its console fails the run (exit
//                                  1), and one slower too with --slow, for a host known to draw the game at its pace
//   <s> click <x> <y>              clicks at x, y in the window, through XTEST as a mouse does: with --launcher a plan
//                                  starts the game with a click on Start Game (Enter under the pointer doesn't, on X)
//   <s> saves same                 every file in the run's saves/ holds the bytes it held when the run started
//   <s> saves changed <timeout>    waits up to <timeout> seconds (10) for one to differ or a new one to appear (the
//                                  runtime gathers a game's writes for a moment before it writes them); either fails
//                                  the run when it isn't so
// --launcher starts the program without --boot, at its launcher, so a plan can wait there as a player who leaves it
// open does before Start Game (a game whose clock counted the launcher's time played its demos with no title).
// --no-dump plays the plan with RT64's frame dump off and no frame_check, for the clock alone: a dump writes every
// frame, which slows a large window's game below its pace. Its exit is then the clock's: 0 passes, 1 fails, 3 a
// run failed.
//
// --saves <plan> checks that the game finds its save after a restart, in place of the dumps and frame_check: the save
// run plays --plan (which makes a save the game's own way, and ends with `saves changed` once it is written), and the
// program is stopped as a player quits it (SIGTERM, which SDL hands the program as a quit). Then saves/ is moved aside
// and reached through a symlink, and each file in it through a symlink of its own, as a player shares saves through a
// synced folder, and the load run starts the program again in the same folder and plays --saves' plan: it has the game
// load the save and reads that it did (an until on its RAM, a find, a shot), `saves same` once it has loaded (a
// restart that saves nothing leaves the bytes alone; a game that rewrites its save as it boots or on a screen the plan
// crosses, the same bytes as on a console, writes all the same, and the runtime's .bak then moves on to the last save,
// so `saves same` goes before that: Excitebike 64 rewrites its EEPROM leaving its title), and it may save again
// (`saves changed`) to check a write goes through the links. Then every link must still be the link it was, to the
// same file. It runs once, at --window's first size (1280x720). Exit 0 passes; 1 fails (the save run left nothing in
// saves/, the load run's plan unmet or the program crashed, a link replaced); 3 the save run itself failed, which
// checks nothing.
//
// --queue names a JavaScript module exporting gpuRun(spec, run) of a GPU queue the host's GPU work takes turns in: the
// runs then go as one job of type frame-dump and frame_check as a second, frame-check, asking no GPU memory (its
// work is the CPU's), both at --priority (low), linked to --url and naming --game-id as their model, so the queue sizes
// each game's jobs from that game's own runs: the dumps ask --vram MiB, or by default what the queue reads off them
// (1024 before it has any; Mario Golf's three windows held 662), so many runs fit on one GPU side by side. Each asks
// the host memory of the container's cap (its docker run's --memory, read from its cgroup; a game's dumps held
// 0.3-0.6 GB, frame_check up to 3.0 on Mario Golf's three windows with their frames between), never the queue's
// 8 GiB for a game it hasn't measured. A stop the queue asks for ends
// the run in progress, and the tool, with 75. Without --queue it runs at once.
//
// --reuse checks the dumps a run before with --keep left in --out, and makes only those it lacks (a run that didn't
// finish leaves none): a change to frame_check is checked against dumps already made, a check's worth of CPU instead
// of a dump's turn on the GPU and minutes of play. With every dump there it files no frame-dump job, only frame-check.
// The plan, --window, --seconds, --rate and the build must be the ones the dumps were made with; the caller keys --out
// by them.
//
// --workers is frame_check's (a third of the cores it sees unless given), for a container held to fewer cores than
// the host has.
//
// Exit: frame_check's own (0 passes, 1 fails, 2 has nothing to test), or 1 where sound_check fails, 2 where the frames
// pass and sound_check had nothing it could check against --sound-reference (a run that fell behind real time), 3 when
// a run failed (the program exited or crashed, an until or find unmet, no window), 75 when the queue asked it to stop;
// 1 too where a clock step's speed fails.
//
// --soak plays the game for <seconds> instead, the program's own settings (--config's if given), no dump and no
// frame_check: a play by the game's plan through each of its modes and scenes once, a few minutes, that fails on what a
// 90 s boot misses, players' crashes and hangs in one scene. Both such faults it was tried on failed within seconds of
// the plan reaching their scene, so its plan covers scenes, not time. One run, in --window's first size (1280x720). It
// fails, at once, when the program's stderr gets a "Crash:" line (the recomps' crash trace), the program exits (the one
// the kernel kills first when the container runs out of memory, which it then says), or the window's picture stays
// exactly the same for --still seconds (10), from the first time it changed: a hang, or a picture frozen while the
// game goes on. Which one is told by the game's memory (its first 8 MB of RDRAM, read each second), still changing or
// not, since the runs' sound goes to SDL's dummy driver. The frozen picture is kept as frozen.png, the last as end.png.
// One plan step is for soaks: `<t> random <key>,<key>,...` presses one of those keys every 0.3-1.2 s (120 ms each)
// while no plan step is due within a second, until `<t> random off`, from a generator seeded by --seed (1), each
// press in input.log. A plan's own steps keep a still screen from standing 10 s (a title waiting for Start, a static
// menu): press past it, or give random input. Exit: 0 when the time is up with none of those, 1 when one came (the
// line saying which starts "soak FAILED"), 3 and 75 as above. Its queue job is a `soak`, which runs no frame_check.
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { judge } from './game_speed.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : args[i + 1]; };
const flag = (name) => args.includes(name);
const need = (name) => opt(name) ?? (console.error(`frame_dump: ${name} is required (the header says how)`), process.exit(3));
const game = path.resolve(need('--game')), exe = need('--exe'), gameId = need('--game-id');
const rom = path.resolve(need('--rom')), planFile = path.resolve(need('--plan')), out = path.resolve(need('--out'));
const windows = opt('--window') ? opt('--window').split(',').map((s) => s.split('x').map(Number)) : null;
const rate = Number(opt('--rate', 60));
const restart = flag('--restart');
const here = path.dirname(new URL(import.meta.url).pathname);
const runNames = windows?.length === 2 ? ['main', 'low'] : ['main', 'narrower', 'wider'];
const soak = opt('--soak') ? Number(opt('--soak')) : null;
const still = Number(opt('--still', 10));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(s);

class RunFailed extends Error {}
class SoakFailed extends Error {}
let stopped = false; // the queue asked for a stop
let speedFails = false; // a clock step's run judged the game's speed wrong
const dumping = !flag('--no-dump') && !soak;

const readPlan = (file) => fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
const plan = readPlan(planFile);
const loadPlan = opt('--saves') ? readPlan(path.resolve(opt('--saves'))) : null;

// Every file under dir, by its path relative to dir, with its bytes (read through any link); a link to nothing has none.
function filesOf(dir) {
  const found = new Map();
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name), p = path.join(dir, r);
      let st = null;
      try { st = fs.statSync(p); } catch { /* a dangling link */ }
      if (st?.isDirectory()) walk(r);
      else found.set(r, st ? fs.readFileSync(p) : null);
    }
  };
  if (fs.existsSync(dir)) walk('');
  return found;
}

// The X server every run draws into, larger than any window a plan asks for: Xorg on NVIDIA's own X driver with no
// display (tools/frame_dump.Dockerfile's /etc/X11/frame-dump.conf), so a present stays on the GPU. Into an X server
// without NVIDIA's driver (Xvfb, Xorg's dummy) NVIDIA's Vulkan sends every present down the X socket as XPutImage, MIT-SHM
// or not, its CPU reading the image at ~150-190 MB/s: vkcube on an RTX 5090 presented in 2.8 ms at 320x240, 19 at
// 1280x720, 35 at 1280x960 and 83 at 2560x1440, whatever the screen's size or depth, and on this server in 1.0-1.4 ms
// at every size. Started at the first run that needs it, not while the job waits for its turn on the GPU; its log is
// <out>/xorg.log.
const display = ':7';
let xorg = null;
const xServer = () => (xorg ??= (async () => {
  const proc = spawn('/usr/lib/xorg/Xorg', [display, '-config', 'frame-dump.conf', '-logfile', path.join(out, 'xorg.log'),
    '-noreset', '-nolisten', 'tcp', '-novtswitch', '-sharevts'], { stdio: 'ignore' });
  process.on('exit', () => proc.kill());
  for (const end = Date.now() + 30000; Date.now() < end; await sleep(250)) {
    if (proc.exitCode !== null) break;
    try { execFileSync('xdpyinfo', ['-display', display], { stdio: 'ignore' }); return proc; } catch { /* not up yet */ }
  }
  const errors = fs.existsSync(path.join(out, 'xorg.log')) ? fs.readFileSync(path.join(out, 'xorg.log'), 'utf8')
    .split('\n').filter((l) => /\(EE\)|Fatal/.test(l)).join('\n') : '';
  throw new RunFailed(`no X server: Xorg on NVIDIA's X driver didn't start in 30 s${errors ? `:\n${errors}` : ''}`);
})());
const xdo = (...a) => execFileSync('xdotool', a, { env: { ...process.env, DISPLAY: display } }).toString().trim();

const keyNames = { Enter: 'Return', Space: 'space', Shift: 'Shift_L', Escape: 'Escape', Tab: 'Tab', Up: 'Up',
  Down: 'Down', Left: 'Left', Right: 'Right', Backspace: 'BackSpace' };

// tools/sdl_audio_record.c, built once for every run: each run's sound is recorded beside its dump.
let recorder = null;
try {
  recorder = path.join(out, 'sdl_audio_record.so');
  fs.mkdirSync(out, { recursive: true });
  execFileSync('cc', ['-shared', '-fPIC', '-O2', '-o', recorder, path.join(here, 'sdl_audio_record.c'), '-ldl'], { stdio: 'pipe' });
} catch (e) {
  log(`frame_dump: no sound recorded: building sdl_audio_record.c failed: ${(e.stderr ?? e.message).toString().trim()}`);
  recorder = null;
}
const keysym = (name) => {
  if (keyNames[name]) return keyNames[name];
  if (/^[A-Za-z0-9]$/.test(name)) return name.toLowerCase();
  throw new RunFailed(`unknown key ${name}`);
};

// The runtime's RDRAM in pid: its anonymous read-write mapping of 512 MB, or the last 512 MB of a larger one that ends
// where the inaccessible rest of the runtime's reservation (its kuseg window, ---p) begins. The kernel merges the region
// with an anonymous read-write mapping just below it whenever their flags agree, so it isn't always 512 MB on its own.
function rdramOf(pid) {
  const maps = fs.readFileSync(`/proc/${pid}/maps`, 'utf8').split('\n')
    .map((line) => line.match(/^([0-9a-f]+)-([0-9a-f]+) (\S+) \S+ \S+ 0\s*$/)).filter(Boolean)
    .map((m) => ({ start: BigInt('0x' + m[1]), end: BigInt('0x' + m[2]), perms: m[3] }));
  const size = 512n << 20n;
  const exact = maps.find((m) => m.perms === 'rw-p' && m.end - m.start === size);
  if (exact) return exact.start;
  const merged = maps.find((m, i) => m.perms === 'rw-p' && m.end - m.start > size && maps[i + 1]?.start === m.end &&
    maps[i + 1].perms === '---p');
  return merged ? merged.end - size : null;
}

const runName = (i) => (windows ? runNames[i] : 'main');
// A dump a finished run left (--keep), for --reuse.
const kept = (i) => fs.existsSync(path.join(out, runName(i), 'dump.done'));

// One run of a plan (planSteps) as <out>/<name>: in a new copy of the game with config's files (<out>/<name>/run), or,
// given work, in that folder as an earlier run left it (a restart, --saves' load run).
async function playRun(name, planSteps, size, signal, { config, work: keptWork }) {
  const dir = path.join(out, name), work = keptWork ?? path.join(dir, 'run');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  if (!keptWork) {
    fs.cpSync(game, work, { recursive: true });
    fs.writeFileSync(path.join(work, 'portable.txt'), '');
    fs.copyFileSync(rom, path.join(work, `${gameId}.z64`));
    for (const f of config ? fs.readdirSync(config) : []) fs.copyFileSync(path.join(config, f), path.join(work, f));
  }
  await xServer();
  const savesDir = path.join(work, 'saves'), savesAtStart = filesOf(savesDir);
  const env = { ...process.env, DISPLAY: display, SDL_AUDIODRIVER: 'dummy' };
  if (dumping && !loadPlan) env.RT64_FRAME_DUMP = path.join(dir, 'dump');
  if (recorder) Object.assign(env, { LD_PRELOAD: recorder, SDL_AUDIO_RECORD: path.join(dir, 'sound') });
  if (dumping && !loadPlan && opt('--seconds')) env.RT64_FRAME_DUMP_SECONDS = opt('--seconds');
  if (restart) env.RT64_FRAME_DUMP_RATE = String(rate); // a first launch has no graphics.json to set Manual in
  for (const kv of (opt('--env') ?? '').split(',').filter(Boolean)) { const k = kv.indexOf('='); env[kv.slice(0, k)] = kv.slice(k + 1); }
  const [w, h] = size ?? [1280, 720];
  const progArgs = [...(flag('--launcher') ? [] : ['--boot']), '--window', `${w}x${h}`, ...(opt('--args') ?? '').split(/\s+/).filter(Boolean)];
  const started = Date.now();
  const proc = spawn(path.join(work, exe), progArgs, { cwd: work, env,
    stdio: ['ignore', fs.openSync(path.join(dir, 'stdout.log'), 'w'), fs.openSync(path.join(dir, 'stderr.log'), 'w')] });
  let exited = null;
  proc.on('exit', (code, sig) => { exited = sig ?? code; });
  // The program is the one the kernel kills when the container runs out of memory, not this tool: a game's memory
  // running away then ends in a verdict, not in a container gone with nothing said.
  try { fs.writeFileSync(`/proc/${proc.pid}/oom_score_adj`, '1000'); } catch { /* not Linux, or gone already */ }
  const oomKills = () => { try { return Number(fs.readFileSync('/sys/fs/cgroup/memory.events', 'utf8').match(/^oom_kill (\d+)/m)?.[1] ?? 0); } catch { return 0; } };
  const oomBefore = oomKills();
  const exitedWith = () => `the program exited with ${exited} at ${t().toFixed(1)}s` +
    (exited === 'SIGKILL' && oomKills() > oomBefore ? `, killed when the container ran out of memory (${capMiB()} MiB)` : '');
  const t = () => (Date.now() - started) / 1000;
  // Each step as it is done: printed, in <run>/plan.log, which stays with the dump (when a reused dump's run had its
  // plan reach a scene), and with its wall-clock time in <run>/steps.tsv (for the sound check).
  const steps = fs.openSync(path.join(dir, 'steps.tsv'), 'w');
  const say = (s) => {
    const l = `${name} ${t().toFixed(1).padStart(6)}s ${s}`;
    log(l);
    fs.appendFileSync(path.join(dir, 'plan.log'), `${l}\n`);
    fs.writeSync(steps, `${Date.now()}\t${s}\n`);
  };
  say(`started ${exe} ${progArgs.join(' ')}`);
  let win = null, mem = null, rdram = null, shift = 0;
  const names = {};
  const errFile = path.join(dir, 'stderr.log');
  const crashLine = () => fs.readFileSync(errFile, 'utf8').match(/^.*Crash:.*$/m)?.[0] ?? null;
  let failed = null; // what the soak's watcher found; false once it is to stop
  const live = () => {
    if (signal?.aborted) { stopped = true; throw new RunFailed(`the queue asked it to stop: ${signal.reason?.message ?? signal.reason}`); }
    if (failed) throw failed;
    if (exited !== null) {
      if (!soak) throw new RunFailed(exitedWith());
      const crash = crashLine();
      throw new SoakFailed(crash ? `the program crashed at ${t().toFixed(1)}s: ${crash}` : exitedWith());
    }
  };
  // The soak's watcher, once a second: a Crash: line in stderr, and the window's picture (xwd's bytes) and the game's
  // first 8 MB of RDRAM, each hashed.
  const xenv = { ...process.env, DISPLAY: display };
  const picture = () => execFileSync('xwd', ['-silent', '-id', win], { env: xenv, maxBuffer: 1 << 28 });
  const png = (buf, file) => execFileSync('convert', ['xwd:-', path.join(dir, file)], { input: buf, env: xenv });
  const sha = (b) => crypto.createHash('sha1').update(b).digest('hex');
  const watch = async () => {
    let errAt = 0, carry = '', lastPic = null, stillFrom = null, lastMem = null, memMoves = 0, memReads = 0;
    while (failed === null && exited === null) {
      await sleep(1000);
      if (failed !== null || exited !== null) break;
      try {
        const size = fs.statSync(errFile).size;
        if (size > errAt) {
          const b = Buffer.alloc(size - errAt);
          const fd = fs.openSync(errFile, 'r'); fs.readSync(fd, b, 0, b.length, errAt); fs.closeSync(fd);
          errAt = size;
          const lines = (carry + b.toString()).split('\n');
          carry = lines.pop();
          const crash = lines.find((l) => /Crash:/.test(l));
          if (crash) { failed = new SoakFailed(`the program crashed at ${t().toFixed(1)}s: ${crash}`); break; }
        }
        const buf = picture(), h = sha(buf);
        if (h !== lastPic) {
          if (lastPic !== null) stillFrom = t();
          lastPic = h; lastMem = null; memMoves = 0; memReads = 0;
          continue;
        }
        if (stillFrom === null) continue; // the picture hasn't changed yet: the boot's, for the boot check to judge
        let m = null;
        try { m = sha(read(0x80000000, 8 << 20)); } catch (e) { if (e instanceof RunFailed) rdram = null; else throw e; }
        if (m !== null) { if (lastMem !== null) { memReads++; if (m !== lastMem) memMoves++; } lastMem = m; }
        if (t() - stillFrom >= still) {
          png(buf, 'frozen.png');
          const game = memReads === 0 ? 'its RDRAM unread'
            : memMoves > 0 ? `the game's RDRAM still changing (${memMoves} of ${memReads} reads): a frozen picture, the game going on`
              : `the game's RDRAM unchanged too (${memReads} reads): a hang`;
          failed = new SoakFailed(`the picture stood still from ${stillFrom.toFixed(1)}s for ${still} s, ${game} (frozen.png)`);
        }
      } catch (e) { if (exited === null && !failed) say(`watcher: ${e.message.split('\n')[0]}`); }
    }
  };
  // A soak's random input: mulberry32 from --seed.
  let seed = Number(opt('--seed', 1)) >>> 0;
  const rng = () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let z = seed;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
  let rand = null, nextRand = 0;
  // Waits until <end> on the run's clock, pressing a random key when one is due and <end> is more than a second off.
  const idle = async (end) => {
    while (t() < end) {
      live();
      if (rand && t() >= nextRand && end - t() > 1) {
        const k = rand[Math.floor(rng() * rand.length)];
        fs.appendFileSync(path.join(dir, 'input.log'), `${t().toFixed(2)} ${k}\n`);
        await press(k);
        nextRand = t() + 0.3 + rng() * 0.9;
      }
      await sleep(10);
    }
  };
  const findWindow = async () => {
    for (const end = Date.now() + 60000; Date.now() < end; await sleep(250)) {
      live();
      let ids = '';
      try { ids = xdo('search', '--onlyvisible', '--pid', String(proc.pid)); } catch { /* none yet */ }
      if (ids) { win = ids.split('\n').pop(); try { xdo('mousemove', '--window', win, '1', '1'); xdo('windowfocus', win); } catch { /* no focus to take */ } return; }
    }
    throw new RunFailed('no window in 60 s');
  };
  const memory = () => {
    if (rdram === null) { rdram = rdramOf(proc.pid); if (rdram === null) throw new RunFailed(`no RDRAM in pid ${proc.pid}`); }
    if (mem === null) mem = fs.openSync(`/proc/${proc.pid}/mem`, 'r+');
    return rdram;
  };
  // A position in /proc/<pid>/mem is a Number: fs.writeSync takes a BigInt one as null and writes at the file's
  // offset, address 0, which fails with EIO (readSync takes either). A user address is below 2^47, so it is exact.
  const at = (addr) => Number(memory() + BigInt(addr - 0x80000000));
  const read = (addr, len = 4) => { const pos = at(addr), b = Buffer.alloc(len); fs.readSync(mem, b, 0, len, pos); return b; };
  const write = (addr, v) => { const pos = at(addr), b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); fs.writeSync(mem, b, 0, 4, pos); };
  const num = (s) => {
    let m = s.match(/^\[(.+)\](?:\+(.+))?$/);
    if (m) return (read(num(m[1])).readUInt32LE() + (m[2] ? num(m[2]) : 0)) >>> 0;
    m = s.match(/^([A-Za-z_]\w*)(?:\+(.+))?$/);
    if (m && !/^0x/i.test(s)) { if (!(m[1] in names)) throw new RunFailed(`no find has set ${m[1]}`); return (names[m[1]] + (m[2] ? num(m[2]) : 0)) >>> 0; }
    return Number(s) >>> 0;
  };
  const press = async (key, ms = 120) => { xdo('keydown', keysym(key)); await sleep(ms); xdo('keyup', keysym(key)); };
  // The clock step's reads, [ms, value], every 100 ms on a timer of their own while the plan goes on.
  let clock = null, clockTimer = null;
  const clockRead = () => {
    try { clock.reads.push([performance.now(), read(clock.addr).readUInt32LE()]); } catch { /* the game's RDRAM not mapped yet */ }
  };
  try {
    await findWindow();
    if (size) xdo('windowsize', win, String(w), String(h));
    const watching = soak ? watch() : null;
    plan: for (const p of planSteps) {
      await idle(soak ? Math.min(Number(p[0]) + shift, soak) : Number(p[0]) + shift);
      if (soak && t() >= soak) break plan;
      live();
      switch (p[1]) {
        case 'key': await press(p[2], p[3] ? Number(p[3]) : 120); say(`key ${p[2]}`); break;
        case 'down': xdo('keydown', keysym(p[2])); say(`down ${p[2]}`); break;
        case 'up': xdo('keyup', keysym(p[2])); say(`up ${p[2]}`); break;
        case 'size':
          if (size) { say(`size ${p[2]}x${p[3]} skipped: --window gives the size`); break; }
          xdo('windowsize', win, p[2], p[3]); say(`size ${p[2]}x${p[3]}`); break;
        case 'shot': {
          const shoot = (file) => execFileSync('bash', ['-c', `xwd -silent -id ${win} | convert xwd:- ${JSON.stringify(path.join(dir, file))}`],
            { env: { ...process.env, DISPLAY: display } });
          shoot(p[2] + '.png');
          // --restart compares shots only of a picture that holds still: a second one half a second later says so.
          if (restart) { await sleep(500); shoot(p[2] + '.still.png'); }
          say(`shot ${p[2]}`); break;
        }
        case 'burst': case 'record': case 'stop': say(`${p[1]} skipped: the dump has every frame`); break;
        case 'drag': throw new RunFailed('drag is Windows\' move loop, which this has no counterpart of');
        case 'until': case 'find': {
          const began = t(), timeout = Number(p[p[1] === 'until' ? 5 : 4]), key = p[p[1] === 'until' ? 6 : 5];
          let met = false, pressed = -10;
          const words = p[1] === 'find' ? p[3].split(',').map(num) : null;
          while (t() - began < timeout) {
            live();
            try {
              if (p[1] === 'until') met = ((read(num(p[2])).readUInt32LE() & num(p[3])) >>> 0) === num(p[4]);
              else {
                const b = read(0x80000000, 32 << 20);
                for (let o = 0; o + 8 <= b.length; o += 4)
                  if (b.readUInt32LE(o) === words[0] && b.readUInt32LE(o + 4) === words[1]) { names[p[2]] = 0x80000000 + o; met = true; break; }
              }
            } catch (e) { if (e instanceof RunFailed && /no RDRAM/.test(e.message)) rdram = null; else throw e; }
            if (met) break;
            if (key && t() - pressed >= 1.5) { pressed = t(); await press(key); }
            await sleep(p[1] === 'until' ? 20 : 500);
          }
          shift += t() - began;
          if (p[1] === 'until') say(`until ${p[2]} ${met ? 'met' : 'NOT met'} after ${(t() - began).toFixed(1)}s`);
          else say(met ? `find ${p[2]} at 0x${names[p[2]].toString(16).toUpperCase()}` : `find ${p[2]} NOT found`);
          if (!met) throw new RunFailed(`${p[1]} ${p[2]} unmet`);
          break;
        }
        case 'poke': write(num(p[2]), num(p[3])); say(`poke ${p[2]} ${p[3]}`); break;
        case 'or': { const a = num(p[2]); write(a, read(a).readUInt32LE() | num(p[3])); say(`or ${p[2]} ${p[3]}`); break; }
        case 'peek': say('peek ' + p[2].split(',').map((a) => `${a}=0x${read(num(a)).readUInt32LE().toString(16).toUpperCase().padStart(8, '0')}`).join(' ')); break;
        case 'dump': fs.writeFileSync(path.join(dir, p[4] + '.bin'), read(num(p[2]), num(p[3]))); say(`dump ${p[2]} ${p[3]} ${p[4]}.bin`); break;
        case 'saves': {
          // The first file whose bytes differ from the run's start, or that appeared or went since.
          const differs = () => {
            const now = filesOf(savesDir);
            for (const [r, b] of now) { const was = savesAtStart.get(r); if (!was !== !b || (b && !b.equals(was))) return r; }
            for (const r of savesAtStart.keys()) if (!now.has(r)) return r;
            return null;
          };
          if (p[2] === 'same') {
            const r = differs();
            if (r !== null) throw new RunFailed(`saves same: saves/${r} changed since the run started`);
            say('saves same'); break;
          }
          if (p[2] !== 'changed') throw new RunFailed(`unknown plan step: ${p.join(' ')}`);
          const began = t();
          let r = null;
          while ((r = differs()) === null && t() - began < Number(p[3] ?? 10)) { live(); await sleep(250); }
          shift += t() - began;
          if (r === null) throw new RunFailed(`saves changed: nothing in saves/ changed in ${p[3] ?? 10} s`);
          say(`saves changed: saves/${r} after ${(t() - began).toFixed(1)}s`); break;
        }
        case 'random':
          rand = p[2] === 'off' ? null : p[2].split(',');
          rand?.forEach(keysym);
          nextRand = t();
          say(`random ${p[2]}`);
          break;
        case 'clock':
          clock = { addr: num(p[2]), perSecond: Number(p[3]), reads: [] };
          clearInterval(clockTimer); clockTimer = setInterval(clockRead, 100); clockRead();
          say(`clock ${p[2]} at ${p[3]} a second`); break;
        case 'click': xdo('mousemove', '--window', win, p[2], p[3]); await sleep(100); xdo('click', '1'); say(`click ${p[2]} ${p[3]}`); break;
        case 'end': break plan;
        default: throw new RunFailed(`unknown plan step: ${p.join(' ')}`);
      }
    }
    if (soak) {
      await idle(soak);
      live();
      failed = false; // stops the watcher
      await watching;
      png(picture(), 'end.png');
      say(`soak passed: ${soak} s`);
    }
  } finally {
    if (failed === null) failed = false;
    clearInterval(clockTimer);
    if (clock) {
      fs.writeFileSync(path.join(dir, 'speed.tsv'), clock.reads.map(([ms, v]) => `${Math.round(ms)}\t${v}`).join('\n') + '\n');
      const { lines, fails } = judge(clock.reads, clock.perSecond, { slow: flag('--slow') });
      for (const line of lines) say(line);
      speedFails ||= fails;
    }
    if (mem !== null) fs.closeSync(mem);
    if (exited === null) {
      proc.kill('SIGTERM');
      for (let n = 0; n < 50 && exited === null; n++) await sleep(100);
      if (exited === null) proc.kill('SIGKILL');
      say('stopped');
    }
  }
  const crash = crashLine();
  if (crash) throw new (soak ? SoakFailed : RunFailed)(`the program crashed: ${crash}`);
  fs.writeFileSync(path.join(dir, 'dump.done'), '');
  const pace = paceOf(path.join(dir, 'dump'));
  if (pace) say(pace);
  return path.join(dir, 'dump');
}

// How fast a dump's frames came, from frames.bin's headers (rt64_frame_dump.h's FrameHeader, 40 bytes before each
// frame's 8-bit RGB): presents a second, the game's own frames a second (a game frame is the last of its present's
// frames, its index the count less 1; the rest RT64 draws between), and the presents the game queued (State's
// present ids, one a screen update) against those the dump has: RT64 skips a present whose next one is already queued,
// and shows nothing for one whose game frame it has shown, so the ids the dump lacks are the presents that showed nothing.
function paceOf(dump) {
  const file = path.join(dump, 'frames.bin');
  if (!fs.existsSync(file)) return null;
  const fd = fs.openSync(file, 'r'), size = fs.fstatSync(fd).size, h = Buffer.alloc(40);
  let frames = 0, own = 0, dropped = 0, first = null, last = null, firstId = null, lastId = null;
  const counts = [], ids = new Set();
  for (let o = 0; o + 40 <= size; frames++) {
    fs.readSync(fd, h, 0, 40, o);
    if (h.readUInt32LE(0) !== 0x44465452) break; // rt64_frame_dump.h's FrameDump::Magic
    const w = h.readUInt32LE(4), ht = h.readUInt32LE(8), index = h.readUInt32LE(12), count = h.readUInt32LE(16);
    if (o + 40 + w * ht * 3 > size) break;
    if (index === count - 1) { own++; counts.push(count); }
    dropped += h.readUInt32LE(20);
    const id = Number(h.readBigUInt64LE(24));
    ids.add(id); lastId = id; firstId ??= id;
    last = Number(h.readBigUInt64LE(32)); first ??= last;
    o += 40 + w * ht * 3;
  }
  fs.closeSync(fd);
  const s = (last - first) / 1000;
  if (!(s > 0)) return null;
  counts.sort((a, b) => a - b);
  const a = (n) => (n / s).toFixed(1);
  return `dump: ${frames} frames in ${s.toFixed(1)} s, ${a(frames)} presented a second, ${a(own)} of the game's own ` +
    `(each shown ${counts[counts.length >> 1] ?? 0} times, median), ${a(lastId - firstId + 1)} presents queued a second ` +
    `(${a(ids.size)} in the dump), ${dropped} frames dropped by the writer`;
}

// graphics.json for every run: --config's, or the one a first start of the program writes, at Manual --rate.
async function makeConfig() {
  const config = path.join(out, 'config');
  fs.rmSync(config, { recursive: true, force: true });
  fs.mkdirSync(config, { recursive: true });
  if (opt('--config')) fs.cpSync(path.resolve(opt('--config')), config, { recursive: true });
  if (soak) return config; // the program's own settings, as a player first runs it
  const gj = path.join(config, 'graphics.json');
  if (!fs.existsSync(gj)) {
    const work = path.join(out, 'first-start');
    fs.rmSync(work, { recursive: true, force: true });
    fs.cpSync(game, work, { recursive: true });
    fs.writeFileSync(path.join(work, 'portable.txt'), '');
    await xServer();
    const proc = spawn(path.join(work, exe), [], { cwd: work, stdio: 'ignore',
      env: { ...process.env, DISPLAY: display, SDL_AUDIODRIVER: 'dummy' } });
    for (let n = 0; n < 300 && !fs.existsSync(path.join(work, 'graphics.json')); n++) await sleep(100);
    await sleep(500);
    proc.kill('SIGKILL');
    if (!fs.existsSync(path.join(work, 'graphics.json'))) throw new RunFailed('the program wrote no graphics.json in 30 s');
    fs.copyFileSync(path.join(work, 'graphics.json'), gj);
    fs.rmSync(work, { recursive: true, force: true });
  }
  const g = JSON.parse(fs.readFileSync(gj, 'utf8'));
  if (!('rr_option' in g)) log('frame_dump: graphics.json has no rr_option; the refresh rate is left as it is');
  else { g.rr_option = 'Manual'; g.rr_manual_value = rate; fs.writeFileSync(gj, JSON.stringify(g, null, 4)); }
  return config;
}

const runs = windows ?? [null];
const reusing = () => flag('--reuse') && runs.every((_, i) => kept(i));

async function dumps(signal) {
  const made = [];
  let config = null;
  for (const [i, size] of runs.entries()) {
    if (flag('--reuse') && kept(i)) { log(`${runName(i)} reused`); made.push(path.join(out, runName(i), 'dump')); continue; }
    config ??= await makeConfig();
    made.push(await playRun(runName(i), plan, size, signal, { config }));
  }
  return made;
}

// --saves: the save run, saves/ put behind links, the load run in the same folder, and the links checked. Returns the
// exit code.
async function saveCheck(signal) {
  const config = await makeConfig();
  const work = path.join(out, 'save', 'run'), saves = path.join(work, 'saves'), size = windows?.[0] ?? null;
  try { await playRun('save', plan, size, signal, { config }); }
  catch (e) {
    if (!(e instanceof RunFailed) || stopped) throw e;
    log(`frame_dump: the save run failed, which checks nothing: ${e.message}`);
    return 3;
  }
  const made = filesOf(saves);
  for (const [r, b] of made) log(`saved saves/${r}: ${b ? `${b.length} bytes` : 'a link to nothing'}`);
  if (!made.size) { log('frame_dump: FAIL: the save run left nothing in saves/'); return 1; }
  // saves/ moves to saves-linked/ and each file in it to saves-files/, each reached through a relative link, which
  // resolves to the same file whether it is read from the link's folder or from its target's.
  const links = new Map([['saves', 'saves-linked']]);
  fs.renameSync(saves, path.join(work, 'saves-linked'));
  fs.symlinkSync('saves-linked', saves);
  for (const r of made.keys()) {
    const at = path.join(work, 'saves-linked', r), to = path.join(work, 'saves-files', r);
    if (fs.lstatSync(at).isSymbolicLink()) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(at, to);
    links.set(path.join('saves', r), path.relative(path.dirname(at), to));
    fs.symlinkSync(links.get(path.join('saves', r)), at);
  }
  let failed = null;
  try { await playRun('load', loadPlan, size, signal, { config, work }); }
  catch (e) {
    if (!(e instanceof RunFailed) || stopped) throw e;
    failed = `the load run: ${e.message}`;
  }
  const broken = [...links].map(([l, target]) => {
    let now = null;
    try { now = fs.readlinkSync(path.join(work, l)); } catch { /* not a link */ }
    if (now === target) return null;
    const what = now !== null ? `a link to ${now}` : fs.existsSync(path.join(work, l)) ? 'no longer a link' : 'gone';
    return `${l}, a link to ${target}, is ${what}`;
  }).filter(Boolean);
  for (const f of [failed, ...broken].filter(Boolean)) log(`frame_dump: FAIL: ${f}`);
  if (failed || broken.length) return 1;
  log(`frame_dump: the save check passes: the save was found after a restart, through ${links.size} link(s) that stayed`);
  return 0;
}

async function soakRun(signal) {
  try { await playRun('soak', plan, windows?.[0] ?? null, signal, { config: await makeConfig() }); return 0; }
  catch (e) { if (!(e instanceof SoakFailed)) throw e; log(`soak FAILED: ${e.message}`); return 1; }
}

// --restart: the plan played three times in one copy of the game, a first launch with only --config's files and two
// starts after it, each run's settings files copied to <out>/<run>/settings as it ends.
const restartNames = ['first', 'restart', 'again'];
const jsonFiles = (d) => fs.readdirSync(d).filter((f) => f.endsWith('.json') && fs.statSync(path.join(d, f)).isFile());
async function restartRuns(signal) {
  const config = opt('--config') ? path.resolve(opt('--config')) : null;
  const work = path.join(out, 'first', 'run');
  for (const name of restartNames) {
    await playRun(name, plan, windows?.[0] ?? null, signal, { config, work: name === 'first' ? undefined : work });
    const kept = path.join(out, name, 'settings');
    fs.mkdirSync(kept, { recursive: true });
    for (const f of jsonFiles(work)) fs.copyFileSync(path.join(work, f), path.join(kept, f));
  }
}

// Each settings file's values by key (a.b.c, a.0 for an array's first), as JSON text.
function flatten(v, key = '', into = new Map()) {
  if (v !== null && typeof v === 'object' && (Array.isArray(v) ? v.length : Object.keys(v).length))
    for (const [k, x] of Object.entries(v)) flatten(x, key ? `${key}.${k}` : k, into);
  else into.set(key, JSON.stringify(v));
  return into;
}
function settingsOf(d) {
  const files = new Map();
  for (const f of fs.existsSync(d) ? jsonFiles(d) : []) {
    try { files.set(f, flatten(JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')))); }
    catch (e) { files.set(f, new Map([['(the file)', `not JSON: ${e.message}`]])); }
  }
  return files;
}
// What changed from settings a to b: each value that differs, and each file or key one of them lacks.
function settingsDiff(a, b, keysOfA = false) {
  const lines = [];
  for (const [f, av] of a) {
    const bv = b.get(f);
    if (!bv) { lines.push(`${f}: gone`); continue; }
    for (const [k, x] of av) if (bv.get(k) !== x) lines.push(`${f}: ${k} ${x} -> ${bv.get(k) ?? '(gone)'}`);
    if (!keysOfA) for (const k of bv.keys()) if (!av.has(k)) lines.push(`${f}: ${k} (new) ${bv.get(k)}`);
  }
  if (!keysOfA) for (const f of b.keys()) if (!a.has(f)) lines.push(`${f}: new`);
  return lines;
}

// A shot as a grey 160x120 picture, for comparing runs' shots of the same window.
function thumb(file) {
  return execFileSync('convert', [file, '-resize', '160x120!', '-colorspace', 'Gray', '-depth', '8', 'gray:-'],
    { maxBuffer: 1 << 20 });
}
const mae = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

// A dump's frames by their headers alone: the size they were drawn at and how many frames each game frame was shown
// in, the most common of each.
function dumpShape(d) {
  const file = path.join(d, 'frames.bin');
  if (!fs.existsSync(file)) return null;
  const fd = fs.openSync(file, 'r'), size = fs.fstatSync(fd).size, head = Buffer.alloc(40);
  const sizes = new Map(), counts = new Map();
  let frames = 0;
  for (let o = 0; o + 40 <= size; frames++) {
    fs.readSync(fd, head, 0, 40, o);
    if (head.readUInt32LE(0) !== 0x44465452) break; // rt64_frame_dump.h's FrameDump::Magic
    const w = head.readUInt32LE(4), h = head.readUInt32LE(8), k = `${w}x${h}`, c = head.readUInt32LE(16);
    sizes.set(k, (sizes.get(k) ?? 0) + 1);
    counts.set(c, (counts.get(c) ?? 0) + 1);
    o += 40 + w * h * 3;
  }
  fs.closeSync(fd);
  const most = (m) => [...m].sort((x, y) => y[1] - x[1])[0]?.[0];
  return frames ? { frames, size: most(sizes), count: most(counts) } : null;
}

// --restart's verdict, also in <out>/restart.txt. It fails where the first launch's settings files don't hold
// --config's values, where a start changed a value the one before it wrote (a setting or a binding not read back),
// where a dump's frames were drawn at another size or shown in another number of frames a game frame, and where two
// launches' shots of a picture that holds still differ by more than SHOT_SLACK (of 255, a grey pixel's mean). A shot
// that differs by more from its .still, taken half a second later, is moving and isn't compared: a launch's moment
// wanders by a frame or two, which a still picture doesn't show. Rush 2049's countdown on its first track, from three
// launches each, read 0.1-1.0 apart within a launch's settings and 9-10 between Draw Distance, Level of Detail and
// Scenery Culling at Original and at their defaults; its attract race, moving, 14-37.
const SHOT_SLACK = 3;
function restartCheck() {
  const lines = [], say = (s) => lines.push(s);
  let failed = false;
  const fail = (s) => { failed = true; say(`FAIL ${s}`); };
  const given = settingsOf(opt('--config') ? path.resolve(opt('--config')) : path.join(out, 'none'));
  const runs = restartNames.map((n) => ({ name: n, settings: settingsOf(path.join(out, n, 'settings')) }));
  say(`settings files the first launch left: ${[...runs[0].settings.keys()].join(', ') || 'none'}`);
  for (const l of settingsDiff(given, runs[0].settings, true)) fail(`--config's value not kept by the first launch: ${l}`);
  for (let i = 1; i < runs.length; i++)
    for (const l of settingsDiff(runs[i - 1].settings, runs[i].settings)) fail(`changed by the ${runs[i].name} start: ${l}`);
  const shapes = restartNames.map((n) => dumpShape(path.join(out, n, 'dump')));
  if (shapes.every(Boolean)) {
    say(`dumps: ${shapes.map((s, i) => `${restartNames[i]} ${s.frames} frames at ${s.size}, ${s.count} a game frame`).join('; ')}`);
    for (const k of ['size', 'count']) if (new Set(shapes.map((s) => s[k])).size > 1) fail(`the runs' frames differ in ${k}`);
  } else say('dumps: not in every run (a build without RT64_FRAME_DUMP), so only the shots compare the pictures');
  const shots = fs.readdirSync(path.join(out, 'first')).filter((f) => f.endsWith('.png') && !f.endsWith('.still.png'));
  for (const s of shots) {
    const files = restartNames.map((n) => path.join(out, n, s));
    if (!files.every((f) => fs.existsSync(f) && fs.existsSync(f.replace(/\.png$/, '.still.png')))) { say(`shot ${s}: not in every run`); continue; }
    const pics = files.map(thumb), moved = files.map((f, i) => mae(pics[i], thumb(f.replace(/\.png$/, '.still.png'))));
    if (Math.max(...moved) > SHOT_SLACK) { say(`shot ${s}: moving (${moved.map((m) => m.toFixed(1)).join(', ')} in half a second), not compared`); continue; }
    const apart = [[0, 1], [1, 2], [0, 2]].map(([i, j]) => `${restartNames[i]}-${restartNames[j]} ${mae(pics[i], pics[j]).toFixed(1)}`);
    const worst = Math.max(...[[0, 1], [1, 2], [0, 2]].map(([i, j]) => mae(pics[i], pics[j])));
    (worst > SHOT_SLACK ? fail : say)(`shot ${s}: launches apart ${apart.join(', ')}`);
  }
  if (!shots.length) say('shots: none in the plan, so the pictures aren\'t compared');
  say(failed ? 'restart check: FAILS' : 'restart check: passes');
  const text = lines.join('\n') + '\n';
  fs.writeFileSync(path.join(out, 'restart.txt'), text);
  process.stdout.write(text);
  return failed ? 1 : 0;
}

function check(made) {
  const a = [path.join(here, made.length === 2 ? 'seam_check.mjs' : 'frame_check.mjs'), made[0]];
  if (made.length === 2) a.push('--low', made[1]);
  if (made.length === 3) a.push('--narrower', made[1], '--wider', made[2]);
  if (opt('--workers') && (made.length !== 2)) a.push('--workers', opt('--workers'));
  fs.rmSync(path.join(out, 'flagged'), { recursive: true, force: true });
  a.push('--save', path.join(out, 'flagged'), ...(opt('--check') ?? '').split(/\s+/).filter(Boolean));
  log(`${path.basename(a[0], '.mjs')} ${a.slice(1).join(' ')}`);
  let code = 0, text;
  try { text = execFileSync(process.execPath, a, { maxBuffer: 1 << 28 }).toString(); }
  catch (e) { // a check killed (by its container's memory cap) says so, not just exits 1 with no text
    code = e.status ?? 1; text = (e.stdout ?? '').toString() + (e.stderr ?? '').toString() + (e.signal ? `killed by ${e.signal}\n` : '');
  }
  fs.writeFileSync(path.join(out, `${path.basename(a[0], '.mjs')}.txt`), text);
  process.stdout.write(text);
  log(`${path.basename(a[0], '.mjs')} exited ${code}`);
  return code;
}

// sound_check on the first run's recording, after frame_check, in the same job: its exit, 1 where it fails.
function soundCheck(made) {
  const a = [path.join(here, 'sound_check.mjs'), path.dirname(made[0])];
  if (opt('--sound-reference')) a.push('--reference', path.resolve(opt('--sound-reference')));
  log(`sound_check ${a.slice(1).join(' ')}`);
  let code = 0, text;
  try { text = execFileSync(process.execPath, a, { maxBuffer: 1 << 24 }).toString(); }
  catch (e) { // a check killed (by its container's memory cap) says so, not just exits 1 with no text
    code = e.status ?? 1; text = (e.stdout ?? '').toString() + (e.stderr ?? '').toString() + (e.signal ? `killed by ${e.signal}\n` : '');
  }
  fs.writeFileSync(path.join(out, 'sound_check.txt'), text);
  process.stdout.write(text);
  log(`sound_check exited ${code}`);
  return code;
}
const both = (made) => {
  const frames = check(made), sound = soundCheck(made);
  return sound === 1 ? 1 : sound === 2 && opt('--sound-reference') && frames === 0 ? 2 : frames;
};

// The container's memory cap in MiB (cgroup v2's memory.max), null when it has none (the queue then reads the game's
// last runs).
function capMiB() {
  try {
    const max = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
    return /^\d+$/.test(max) ? Math.ceil(Number(max) / 1048576) : null;
  } catch { return null; }
}

let code;
try {
  await sleep(500);
  if (opt('--queue')) {
    const { gpuRun } = await import(pathToFileURL(path.resolve(opt('--queue'))).href);
    const spec = (type, label, vramMiB) => ({ type, label, vramMiB, model: gameId, priority: opt('--priority', 'low'),
      ...(vramMiB === 'auto' ? { guessMiB: 1024 } : {}), ramMiB: capMiB(),
      url: opt('--url') || undefined, ref: process.env.HOSTNAME,
      onUpdate: (j) => j.state === 'waiting' && log(`queue: ${type} waiting, ${j.ahead} ahead${j.waitMs != null ? `, ~${Math.ceil(j.waitMs / 60000)} min` : ''}: ${j.why?.text ?? 'going next'}`) });
    const vram = opt('--vram', 'auto') === 'auto' ? 'auto' : Number(opt('--vram'));
    if (loadPlan) code = await gpuRun(spec('frame-dump', `Save check: ${gameId}`, vram), (signal) => saveCheck(signal));
    else if (soak) code = await gpuRun(spec('soak', `Soak: ${gameId}, ${soak} s`, vram), (signal) => soakRun(signal));
    else {
      const made = reusing() && !restart ? await dumps(null) : await gpuRun(spec('frame-dump', `Frame dump: ${gameId}`, vram),
        (signal) => (restart ? restartRuns(signal) : dumps(signal)));
      // --restart's check reads headers and 160x120 shots, seconds of one core: no job of its own.
      if (restart) code = restartCheck();
      else code = dumping ? await gpuRun(spec('frame-check', `frame_check: ${gameId}`, 0), async () => both(made)) : 0;
    }
  } else if (loadPlan) code = await saveCheck(null);
  else if (soak) code = await soakRun(null);
  else if (restart) { await restartRuns(null); code = restartCheck(); }
  else code = dumping ? both(await dumps(null)) : (await dumps(null), 0);
  if (speedFails) { log("frame_dump: the game's speed fails (the clock step's lines above)"); code = 1; }
} catch (e) {
  log(`frame_dump: ${e instanceof RunFailed ? e.message : e?.stack ?? e}`);
  code = stopped ? 75 : 3;
}
for (const n of [...runNames, ...restartNames, 'save', 'load', 'soak', 'first-start']) {
  if (!flag('--keep')) fs.rmSync(path.join(out, n, 'dump'), { recursive: true, force: true });
  fs.rmSync(path.join(out, n, 'run'), { recursive: true, force: true });
}
process.exit(code);
