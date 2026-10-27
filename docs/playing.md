# Playing and measuring a page

How a page is played and measured, how its numbers are kept, and the games page in `site/`.
CLAUDE.md (The games table) has the rules; `tools/play_page.mjs`'s and `tools/page_driver.mjs`'s headers have the
options; `docs/findings.md` has what was measured this way.

## The tools

- `tools/play_page.mjs` plays a page by a plan in either browser and prints presents a second, sound frames short, the
  shader waits, the shaders the list missed, WebGPU errors and the GPU's and browser's load. A game's plan is its
  `tools/play_plan.json`; a game fork's shader plan plays with `--section`. `tools/page_driver.mjs` drives the browsers
  for it and for your own scripts: Chrome headless (`--headless=new --enable-unsafe-webgpu`) or `--headed` in a window
  off the desktop, Firefox always in a window off the desktop over WebDriver BiDi (Firefox headless has no WebGPU
  adapter). Such a window has no focus, so keys and clicks come from script, the ROM is sent in pieces, and the
  viewport is one CSS pixel a pixel, or `--scale 2`'s two, a laptop at 200%. `--on-screen` maximizes either browser on
  the desktop at its scale instead, with none of those overrides. A plan's clicks are in 1256x645, moved to the
  viewport the page has (`innerWidth`, `innerHeight`), never to `--size`.
- On Windows play_page reads the GPU from Windows' counters for the adapter the page draws with (by LUID), with
  nvidia-smi's GPU 0 beside it: on a laptop with two GPUs that one is the idle discrete GPU.
- A page served from a build dir needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy:
  require-corp` (threads need SharedArrayBuffer); on Pages `coi_serviceworker.js` sets them after one reload. Look at a
  page with CDP `Page.captureScreenshot` of that page.
- Look at a desktop build with `tools/capture_window.ps1`: it plays a timed plan of keys in the window of the build it
  starts and captures that window alone with PrintWindow, never the screen, in shots or series, and lists the frames
  unlike both of their neighbours. With `RT64_FRAME_LOG` set, RT64 (rt64-web, RT64_GAME_FRAME_WORKLOADS on) prints
  each game frame, why it ended and what each of its workloads drew, each present and wait, and what of the frame was
  matched with the one before and how far on screen; `tools/frame_log.mjs` reads that beside the captures' times, to
  tell a frame drawn in parts from one matched wrongly. Their headers say how.

## Plans

- A game's `tools/play_plan.json` (DKR-R's, Snap's and Rush 2's in `web/`) is its regular play, 2-3 minutes with
  every timeout counted, and every play of the game is by it unless a card needs more. Its
  `play_plan_extended.json` beside it starts the same and goes on to two or three more levels in 5 minutes or less,
  played only when a change needs a longer play (one to a level or screen only it reaches). The shaders an extended play
  misses go into the game's list, in the same work. Each plan's header says what it plays.
- A plan reaches a level as a player does (the menus where quick, the survey's warp or stage start where not; its
  header says which) and plays a minute or more in its levels, the whole run 2-5 minutes (Which browser, how long). A
  walk sways out and back by as much each way about a spot it was played to and looked at: a blind walk in one
  direction, or back the way it came, carries the character off a ledge, into water or out an exit. Its waits and holds
  in the level are on the game's own clock (a `clock` step, page_driver's header): in ms of the browser's time,
  uneven frames walked Firefox's runs of one plan to other places than Chrome's (docs/findings.md, Behind CLAUDE.md's
  rules). A plan that ends on black is the plan's fault until a direct warp there draws black too (Banjo-Tooie's:
  docs/findings.md, Behind CLAUDE.md's rules).
- The step the rest of a plan stands on (a survey's `play()`, which loads a file) is a `need` (page_driver's header): a
  run that never gets there fails, rather than its warps and walks pressing keys at a menu for minutes, a path no player
  takes. A plan that goes on to more levels in one load makes each level's start one too, checking in RDRAM that the
  level it asked for is the one playing: Pilotwings 64's gyrocopter test didn't end when its results were pressed, so
  the next test's start found a vehicle flying, resolved at once, and the gyrocopter flew on for minutes.
- Load ROM waits for the shader list Chrome builds behind the launcher (an `until` on `RT64: all <n> prebuilt shaders
  built`, or on Firefox's line that it builds none there): a click while it builds can be lost (docs/findings.md,
  Behind CLAUDE.md's rules).
- A level the survey starts may crash when it ends: the screens after it read what the menus before it would have set
  up. So a plan that starts one keeps the player alive for as long as it plays (GoldenEye's `setInvincible()`): a
  GoldenEye play of Dam long enough for its guards to kill Bond stopped on the Mission Failed screen in Chrome and
  Firefox (`strcmp` from `fileGetIndex`, given the name of a briefing mission select never chose:
  `load_briefing_text_for_stage` under `init_menu0C_missionfailed`). A thread of the game that throws ends the run
  as a failed one once nothing has presented for 15 s, and a page that refuses the ROM ends it at once, with the line
  it said that in (`play_page.mjs`).
- A page that gives play_page no answer for 15 s ends the run as failed, "the page stopped answering", and says which
  side stopped (Windows): each of the browser's processes' cores, its main thread's and the tab's busiest threads by
  name, and the failure ends `main threads: the tab's <cores>, <state>; the browser's <cores>, <state>`. The tab's at
  a core, running, is the page's script in a loop (or Emscripten's spin on a futex); the tab's waiting with the
  browser's at a core is the browser's driver. Nothing from inside the page tells them apart: a worker's console lines
  stop with the page's main thread in Firefox and don't reach the driver in Chrome (docs/findings.md, A page that stops
  answering).
- After any mouse click (Load ROM's included) recompui is in mouse mode with nothing focused, and the first key only
  brings the focus back (`update_focus` in `ui_state.cpp` runs after the key reached RmlUi): Enter starts the game on
  the second press, or click Start Game. Every RecompFrontend game does it, desktop too.
- Keep `--profile` between runs for a warm one, on its fixed port: IndexedDB belongs to the origin, port included. For
  a cold visit in Chrome, start a new `--user-data-dir` once on the launcher first: a profile's first run stores nothing
  that hits later, and one whose first run built the shaders never hits. Close Chrome with `Browser.close` and wait for
  the process to end, or it loses what it wrote to its caches (page_driver.mjs's close() waits 30 s, then stops a browser
  still running, with its processes). A debugging port another browser on the machine holds is
  refused (`page_driver.mjs`).

## What a change plays

A change is played by what it can break, before it merges (CLAUDE.md, Changing it) and in the retest
(docs/publishing.md, The retest). A change that could be two kinds is played as the one that risks more.

- Can't change a page's bytes (`*.md`, `plays.jsonl`, `site/`, the tools that play, serve, read and publish pages):
  nothing is played. `site/touch_pad.js` is the exception: every game's page runs it on a phone, so a change to it
  is checked in Chrome's phone emulation (touch, a phone's size) on one game's page served with the branch's `site/`
  (`tools/serve_site.mjs`), the controller driving the game. A new or changed plan is another: it is played as a
  smoke play is, once in each browser, to show that it reaches its levels.
- Changes a page but can't move its speed or timing (the launcher's or a notice's text, a patch merge that builds the
  same code, an entry in a shader list): the smoke play. Its own game's build plays its plan once in Chrome and once in
  Firefox, read for a page that boots and plays, WebGPU errors and exceptions (`failed`, `webgpuErrors` and
  `exceptions` in play_page's `--json`), never for its presents. No second game, no Pages pair.
- Can move speed or timing (a fork's renderer, its device thread, present or wait path, the runtime's threads and
  messages, `frontend/`'s timing, a build option): the A/B, `tools/ab_pages.mjs` on its game and one other, and the
  smoke play in Firefox of each (`ab_pages.mjs --smoke`).
- Can crash or leak only over time (memory, a cache, a timing bug that takes minutes to show): a soak, played only for
  a card that says why.

A card that moves a game's pin onto a tag the retest plays, or will, gives it the smoke play and leaves the A/B to the
retest.

Each play takes its own turn in the machine's GPU queue (CLAUDE.md, Playing a page). A smoke play is a shared turn,
beside others' shared turns, with a short limit (about 10 minutes); an A/B's play and a soak are each a whole turn, the
GPU to themselves, with a limit that fits the plan. So a queue that serves the shortest limit first can put a smoke
play ahead of a soak. A shared turn's presents a second aren't its page's: another card's page can be playing beside
it (both of Snap's slow smoke plays in docs/findings.md, Pokémon Snap's timed waits in Firefox), so a smoke play is
read for crashes, WebGPU errors and exceptions, and a page's number to compare comes from a whole turn.

A card queues one series at a time (an `ab_pages.mjs` run, or a game's smoke plays) and stops a series at its first
failed play: the cause is fixed, then the series is played again, rather than its other plays queued behind a failure.
A series stands on its plan and the files its `evalFile` steps name, so they are checked before it is queued
(`ab_pages.mjs` refuses a plan whose files aren't there before it queues a play, `play_page.mjs` as it starts).

## Which browser, how long

- Every automatic play (a test, the retest, an A/B, a smoke run) is 2-5 minutes from the launcher to the plan's last
  step, in either browser: a game's regular plan is 2-3 minutes and its extended one 5 or less (Plans), more levels
  fitting by playing each for less. A longer play (a plan of more, a run of 10 minutes or more) is for a card that
  needs one and says why: a soak, a leak or OOM hunt, a timing bug that takes many minutes to show.
- Chrome gives the performance numbers, as interleaved pairs of the page Pages serves and the build.
- Firefox with its default prefs is played once a build for what Chrome doesn't turn up (a race in the game's loads, an
  OOM), read for a crash, a trap, WebGPU errors and exceptions, not presents: on Windows on integrated graphics its
  native compositor holds every page to 30-45 presents a second whatever the page does (docs/findings.md, A laptop,
  measured), so its numbers re-measure that cap. Long Firefox plays are the soak's, when hunting a fault that takes
  time.
- Firefox with `--firefox-pref gfx.webrender.compositor=false` measures only a change that could move Firefox's own
  WebGPU performance: without the compositor's cap its numbers show the page's. Default-prefs Firefox pairs are for a
  change about Firefox itself.

## Soaks

A soak plays a page long, for what shows only after many minutes: a leak, a slow crash, Banjo-Kazooie's
`Aborted(OOM)` 550 s into a Firefox play. It plays in Firefox, where those turn up; Chrome's soaks of ten pages found
nothing Firefox's didn't (docs/findings.md, Memory). Each play is the game's plan with its `shot` steps left out and 20
`wait`s of 60 s added, its last scene held 20 minutes (on the game's clock where the plan has one), played from Pages
uncapped at 3840x2000 with `--interval 1 --preload tools/heap_probe.js`, one play a whole turn with `--max 35`. Read
each run's heap break and length and its GPU process's private bytes by the minute: a leak climbs in its last 10
minutes as in its first, the heap's high-water mark steps up and stops. A crash, an abort or steady growth is its own
work, naming the game, the browser, the time and the curve.

## Uncapped, and the browsers' clocks

- On a desktop GPU a page is played uncapped (`--uncapped`): capped, every page and build reads about 60 there.
  `?uncapped` needs the browser's animation frames uncapped too (Chrome `--disable-frame-rate-limit`, Firefox
  `layout.frame_rate` 360, never 0, which spins them at thousands a second: docs/findings.md, Uncapped in Firefox;
  `--uncapped` sets both), and its interpolated frames take turns in 8 color targets of the game's framebuffer at the
  canvas's scale (rt64 8a2c6a7), 0.25-0.55 GB at 3840x2000. A run at the display's rate is for what uncapped switches
  off (RT64's pacing, the presents-in-flight cap, late done callbacks), and so for a laptop's own runs.
- Uncapped measures cost per present (the GPU's, the page's WebGPU calls, the GPU process's), so a higher number on a
  desktop GPU is a cheaper frame everywhere. It can't see done callbacks coming back late (25-45 ms on a laptop's half
  idle Intel UHD, which RT64's pacing takes for a GPU falling behind: Firefox's 20-30 there; a fast GPU's come back
  early) or the compositor on screen, so it doesn't clear a laptop result (docs/findings.md, WebGPU in Chrome and
  Firefox, A laptop, measured).
- Chrome on Windows times its animation frames by the display's vblank; with no display (a monitor off) it sleeps
  17.9 ms between frames, and every page whose game runs below 60 presents ~55.6 at the display's rate. play_page
  records animation frames a second beside the presents, and leaves presents out of the comparison for a display-rate
  run with fewer than 57 (docs/findings.md, Chrome with no display). Firefox times its frames itself and draws ~60
  either way.
- Firefox on Windows ends every timed wait on a page's thread on the system timer's tick, 15.6 ms by default, but a
  desktop often runs a finer one another program asked for, and plays faster than a laptop. `tools/timer_tick.c` (its
  header) stretches each timed wait to that tick: `?timer-tick=15.625`, `?timer-trace=<n>` for the waits left,
  `?timer-exempt=<name>` for what one costs. A wait a page's speed hangs on is never timed.

## What a page says about itself

- `Module.recompAudioStats()` (frames played, frames short); `?present-stats` (plume 90ef8e5: presents a second, how
  late each onSubmittedWorkDone comes back; rt64 f262d56: at each present RT64 drops, where the present thread's time
  went); `?presents-in-flight=<1-8>` (otherwise 2, raised to 4 at most while it holds presents back); `?uncapped`
  (plume 904b26c, rt64 e408ed4); `?record-shaders`; and the console reports each CPU write render to RAM's late copy
  kept. To see a page's sound as the game writes it, wrap `AudioWorkletNode` in a preload, take
  `processorOptions.ring` and sample its two counters every few ms.
- What its GPU time goes on: `--preload tools/pass_probe.js` (its header) prints each kind of pass, their draws and GPU
  time (timestamp queries, where the browser offers them; counts only elsewhere) and the draws by fragment shader;
  `--query probe-skip=<KB>` leaves one shader's draws out to price them (docs/findings.md, A page's GPU time).
- How long the game's frames are against its presents: `--preload tools/frame_lengths.js --query
  '?present-stats&frame-clock=<hex>'`, the address of a clock the game adds each frame's VIs to (Jet Force Gemini's
  800FD748), logs both at each animation frame, and `node tools/frame_lengths.mjs <the play's output>` counts what
  each guess at a frame's length would hold and cut (docs/findings.md, A game's uneven frames). Read it at 60
  animation frames: headless Chrome runs the screen's rate, 240 on a 240 Hz one (Firefox: `--firefox-pref
  layout.frame_rate=60`).
- Whether timed waits off its thread end on time all through a play: `--preload tools/wait_probe.js` logs, each
  second, a worker's shortest of three 100 us waits (`waitprobe <ms>`), what plume and the VI thread measure once as
  the page starts (docs/findings.md, A host that holds Chrome's presents).
- How much of its heap a page has taken, and what ran it out: `--preload tools/heap_probe.js` logs the heap's break
  and length each second (`heap <s> sbrk <MB> len <MB>`) and, before an `Aborted(OOM)`, the request's size and the
  stack that made it (`heapoom`) (docs/findings.md, Memory).
- Video memory: read the adapter's `\GPU Adapter Memory(*)\Dedicated Usage` and nvidia-smi, never
  `\GPU Process Memory(*)\Dedicated Usage`, which climbs by a canvas a frame in Firefox (Windows 10 counts every reopen
  of its shared canvas texture, KB4490156). nvidia-smi's is the whole GPU's, so a page filling video memory beside
  another shows as the other page's climb and its "Out of Memory". play_page reads the GPU process's private bytes each
  sample, and in Firefox about:memory's split of them at the play's start and end (`gpuProcessMemory`); each read holds
  Firefox's page 120-200 ms, so a play's gaps start after the first (docs/findings.md, Memory). Which kind of WebGPU
  work grows it: `tools/gpu_growth.mjs` (its header) plays each kind of a page's calls alone, at the rates
  `--preload tools/webgpu_census.js` reads off the page; whose code made what it grows (D3D12's, a driver's, DXC's,
  Firefox's): `tools/memory_scan.ps1`, unelevated, from outside the process.
- How it comes through what a player's browser does to it: `--fault resize,hidden,audio,device,reload` (play_page's
  header) does each in turn once the play is in its level (a resized window, another tab in front for 30 s, its
  AudioContext suspended, its WebGPU device lost, then a reload over a warm cache and service worker), and records
  whether it presents again after each, and what it said. Play it from Pages, whose cache and service worker a reload
  finds warm (docs/findings.md, Faults), and in Chrome with `--chrome-flag --disable-audio-output`: muted, a hidden
  tab counts as silent and Chrome idles its process, which a player's tab with sound doesn't see (docs/findings.md, A
  page in a hidden tab).
- A thread of the game that traps names only an offset in the wasm on a page linked without `--profiling-funcs`
  (`Game.wasm:8767891: RuntimeError: unreachable executed`); `node tools/wasm_offset.mjs <wasm or URL> <offset>`
  names the function that holds it. `unreachable executed` in the export the page's `.js` calls `___trap` is
  Emscripten's `abort()`, not a bad pointer: it prints `Aborted(<reason>)` just before, play_page puts that line in
  front of the exception in the failure it records, and an empty reason is C's `abort()` (a failed `new`, libc++
  throwing with exceptions off, the runtime's own), which the stderr lines before it say.

## Laptop-like limits on a desktop

A laptop's integrated graphics finds most new flaws. Without one, a desktop takes these stand-ins, each recorded in
the run, so plays.jsonl compares a run only with runs that set the same (numbers: docs/findings.md, The stand-in,
measured, and Laptop-like limits on a desktop, measured):

- `--size 3840x2000 --uncapped`, the stand-in: about 7 times a laptop window's pixels, so a frame's GPU cost
  shows as presents a second. It finds a costly frame and clears none.
- `--size 1920x945`, the laptop window's viewport: what the page lays out and clicks, and the sizes Auto draws at
  (GoldenEye's scene 2682x1320), a target's memory with them. A desktop GPU draws every page at the display's
  rate there, so it is for the other limits and for memory, not for presents.
- `--affinity <n>` holds the browser, every process of it, to n logical processors (4: two cores), in Firefox as in
  Chrome, where `--cpu-throttle` slows only Chrome's page thread. It shows a page short of cores: on 4 Banjo and
  GoldenEye played in Firefox as on 16 at the display's rate, its shader waits ~20% longer.
- `--fallback-adapter` gives the page the browser's software adapter (SwiftShader in Chrome, WARP in Firefox), tens of
  times slower than Intel UHD: GoldenEye's Dam drew 2 presents a second. It checks a page boots and draws with no
  WebGPU errors on a weak adapter's features and limits (no `shader-f16`) and how it behaves far behind (RT64 pacing
  presents to the game's frames, holds overrunning the clock), and is no laptop's speed.

None stands in for Windows composing a laptop's screen on the same GPU (what pacing Firefox to 30 on screen was) or
for the GPU's own speed at a laptop's size; Firefox drawing a list's misses with the ubershader (GoldenEye's Dam
collapse) shows on a desktop as `shader missed:` lines.

## A page's numbers

The README's Games table shows no frame rates and no dates: a page's numbers are its runs in `plays.jsonl`, and the
retest and every change are judged against them.

- A page's number is from a run on integrated graphics (a laptop report or a hand test there), or else from the
  stand-in: the page from Pages on a desktop GPU with a 3840x2000 canvas (about 7 times a laptop window's
  pixels), one CSS pixel a pixel, uncapped (`play_page.mjs --uncapped --size 3840x2000 --play 25`). Uncapped, its
  presents a second are what the page can make: higher is a cheaper frame, 342 or more is the ceiling, and the retest
  compares with earlier uncapped runs only. The stand-in is gentler than a laptop and sees cost only, so it finds a
  problem but can't clear one, and a laptop result stays until a newer laptop run replaces it (docs/findings.md, The
  stand-in, measured, and A laptop, measured).
- The number is the median presents a second in Chrome after the waits. A page reading below 60 that isn't its game's
  own rate (a page showing that, where RT64 paces presents to the game's frames (a GPU falling behind) or doesn't
  interpolate) has work filed to make it 60. A laptop result a fix was made for stands until the laptop plays it again.
- A page given only the smoke play (What a change plays) keeps its numbers, which a change that can't move speed
  leaves standing.
- A laptop's number comes from a run on screen (`--on-screen`: maximized at the laptop's own scale, as a player's window
  is) as well as the usual one off the desktop, and gives the on-screen number: Windows never composites a window off
  the desktop, which flattered Firefox on Intel UHD. Its Chrome run is played headless too, whose presents never wait
  for a compositor or display. Chrome's CPU throttling (CDP `Emulation.setCPUThrottlingRate`, 3) stands in for a
  laptop's slower CPU, but isn't what held Chrome at 51-55 there on v0.46.0 (docs/findings.md, A laptop, measured).
- Every run, failed ones too, goes in `plays.jsonl`, committed with the work
  (`play_page.mjs --record plays.jsonl --game <name> --build <tag>`, with `--note` for anything a player's visit
  wouldn't have: a preload, a test build). What a script compares runs by goes in fields, not the note: `--set <id>`
  for the runs of one interleaved set, `--role baseline` for the page Pages serves and `--role candidate` for the
  build under test, `--host-reading '<json>'` for the host as read just before the play (`gpuBusy`, `cpuBusy`,
  `gpuOthers`, `sessions`, `building`; play_page's header says what each is). A laptop report goes in by hand, its `note` saying so and its `gpu` the
  laptop's adapter. A run without `--note` is compared with the last 5 like it (game, browser, size, play) and flagged
  `regression:` when clearly worse (play_page's header says by how much). The first 216 lines, 2026-10-14 and 10-15,
  were recovered from the runs' logs (`recovered`).
- A new game's row has its Recomp cell naming the upstream recomp and its owner ("[name](url) by owner"), from the
  fork's GitHub parent.

## The games page

`site/` is a page of every game in the Games table: a tile each with its recomp's art or a title card, which a
click plays (the game's page in a frame, or the tab goes to the page where the page isn't cross-origin isolated or
the game's page is on another origin; never a new tab; on a phone, fullscreen in landscape from that tap, and never
upright: when the phone leaves landscape, at the ROM picker or Back, the game is covered until a tap locks it again),
and under it its credit, a link to the game's repo ("Web port") and the
recomp it is based on (the Recomp cell); the art names the game, so no line does. The header says what the page is
and whose the recomps are, What's new under it the first three entries of `site/news.html`, which it links, and a line under the games that it is written with AI, with the link to this repo. It
shows no frame rates: every game plays smoothly but in Firefox on a laptop's built-in graphics, so only there does
the header warn (`site.js`); a retest that finds otherwise changes that warning. Firefox on a phone plays no game, so
there the header says so in red instead and a tile starts nothing. With its OAuth client (`GOOGLE_CLIENT_ID` in `site.js`, which says how the client is set up) the
hub offers sign-in with Google, which keeps the player's saves in their own Google Drive (`frontend/save_sync.js` says
how). Where this browser and the Drive hold a game's saves differently, a sign-in ends in a popup that asks which to
keep. The top bar has the sign-in at its right, and once signed in the player's name, whose menu has Manage
saves (each game's saves in the Drive and the earlier ones it kept, to restore) and Sign out; the footer links its
privacy policy, `site/privacy.html`. It is the top of the hub, the n64hub org's GitHub Pages site (n64hub/n64hub.github.io), whose folders
are every game's page, so they are one origin; `tools/publish_site.sh` publishes it (its header says how) after
a change to `site/` merges, and a change to the Games table needs no publish. Its top also serves every game's page
its on-screen controller on a phone, `site/touch_pad.js` (the header says why there), which it puts into the frame a
game plays in, so that publish is what takes the controller and a change to it to every game. Served locally by `tools/serve_site.mjs`. Keep
it current in the same work as what changes it:

- A new feature or game on the hub (not a fix or a speedup) gets its entry at the top of `site/news.html`, a date and
  one sentence, in the work that lands it, and a publish (`site.js` reads the entries from the published page).
- It reads the table from main's README.md each visit (served locally, the checkout's), finding the columns by header
  (Game, Recomp, Repo, Page): a column renamed or a cell written another way needs
  `site.js`'s parse to follow.
- A new game gets its tile's art, `site/img/<repo>.webp` named as its Repo cell, from what its recomp ships and
  nothing of the game's: the banner or logo its upstream README opens with or its repo's social preview, else its
  app icon (`icons/512.png`), else its launcher, if that is a picture (not RecompFrontend's plain dark one or a
  settings menu), captured in headless Chrome at 1280x720 without a ROM. A banner or launcher is a 640x360 WebP, a
  logo 640 wide with its transparency, an icon 256. `site.js`'s `ART` says how the tile shows it (cover, cover
  unnamed, logo, icon); without one a tile shows a title card, which needs nothing. Clear `sessionStorage` between
  two game pages in one tab, or the second can show the isolation notice (`coi_serviceworker.js`'s reload flag).
- `node tools/serve_site.mjs` serves it at `http://localhost:8742/` and passes every other path to
  GitHub Pages. `site.js` says how the frame stays cross-origin isolated, why it is navigated by `location.replace`
  (Back returns to the grid) and why fullscreen is the game page's own document.
