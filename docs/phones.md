# Pages on a phone

How a page is played and measured on an Android phone from a computer, what a phone does differently from a desktop,
and what has been measured there. `tools/play_phone.mjs`'s header has its options; docs/playing.md has the rest of
playing a page, and docs/findings.md what was measured on desktops and laptops.

## Sharing a phone

Where agents share a phone, it has a line of its own in the machine's queue (CLAUDE.md, Playing a page), apart from
the GPU's: one turn on the phone at a time, whatever the GPU is doing, so a turn there is neither whole nor shared.
Two at once would open pages on it together and change its Chrome flags and CPU caps under each other, and both get
numbers that mean nothing.

- Everything a play does to the phone runs as one script inside one turn: the `adb forward` to Chrome's DevTools,
  the `adb reverse` for the page, Chrome's command line, the CPU's caps, keeping the screen on, the play itself
  (play_phone.mjs) and its screencaps. A step run outside the turn can land in another agent's play.
- The script puts back what it changed before it exits, on failure too (a `trap ... EXIT` in a shell script): the
  next turn starts from the phone as this one left it. That is Chrome's command line (the file deleted, the flag
  reset, Chrome restarted), each `scaling_max_freq` at the value read before it was written, `svc power stayon` and
  `screen_off_timeout`, the forwards and reverses it made (`adb forward --remove tcp:<port>`,
  `adb reverse --remove tcp:<port>`), and the tabs it opened (`/json/close/<id>`). play_phone.mjs makes its forward
  and opens its tab but leaves both when it ends, so the script removes them.
- One play a turn, as on the GPU, so other agents' turns come between a series; the phone rests between plays anyway
  (Measuring, heat). A turn's limit fits its play and the restarts around it.

## Connecting

- adb reaches the phone over USB or Wi-Fi. A cable that charges may still not carry data, and a phone that was plugged
  in before USB debugging was on can stay invisible to `adb devices`; wireless debugging (Developer options) avoids
  both: `adb pair <address>:<port> <code>` once with the code the phone shows, then the phone announces itself and adb
  connects on its own (`adb devices` lists it as `adb-<serial>._adb-tls-connect._tcp`).
- `adb forward tcp:<port> localabstract:chrome_devtools_remote` gives the phone's Chrome DevTools on that port of the
  computer: `/json/version`, `/json/list` (the tabs), `PUT /json/new?<url>`, `/json/activate/<id>`. Pick a port no
  local browser uses: a headless Chrome on the computer listening on the same port took the forward's place for
  another tool, which then drove the phone's tab instead of its own.
- Talk to a tab over its own socket, `ws://127.0.0.1:<port>/devtools/page/<id>`: Target.attachToTarget through the
  browser's socket hung on the phone. The tab's own socket gets the console of every frame in it, the hub's game
  frame included, once Runtime is enabled; Chrome first replays the tab's earlier console, so lines from before a run
  are told apart by their time.
- Chrome on Android gives a tab in the back no animation frames, and the game draws nothing there: bring a tab to the
  front (`/json/activate/<id>`) before measuring it, and check nothing covers Chrome (its own Settings, a picker,
  the notification shade): `adb shell dumpsys window | grep mCurrentFocus` names the window in front.
- The phone's clock is not the computer's: the console's timestamps ran 11.1-11.8 s ahead. play_phone.mjs reads the
  lead at the start and takes it off.
- Keep the screen on while a computer drives it: `adb shell svc power stayon true` (and `false` after), or a longer
  `settings put system screen_off_timeout <ms>`; note the old value to put back.

## Driving a page

- `Page.addScriptToEvaluateOnNewDocument` puts a script into every frame the tab loads, so a counter of presents
  (`getCurrentTexture` on a WebGPU canvas) counts the hub's game frame too. The game in the hub is `frames[0]` of the
  top document, the same origin, so its `FS` and `Module` are in reach from the top.
- `Input.dispatchTouchEvent` from the protocol is a user gesture: a tap on the hub's tile starts the game in fullscreen
  and landscape as a finger does. `adb shell input tap <x> <y>` taps the screen in its pixels, the protocol's touch the
  top document in CSS pixels (a DPR-3 phone in landscape fullscreen is 800x360 CSS pixels).
- `Input.dispatchKeyEvent` (`rawKeyDown`, `keyUp`) reaches the game once it has been touched: Enter and Space through
  Rush 2049's menus and the gas, as on a desktop.
- `adb exec-out screencap -p` saves the screen and `adb shell uiautomator dump` lists what is on it as text, bounds
  included, which tells what is in front without a picture: a picture of the screen shows the phone owner's
  notifications too whenever the shade is down. The game's canvas is not in the dump. In Git Bash set
  `MSYS_NO_PATHCONV=1`, or `/sdcard/...` becomes a Windows path.
- A ROM gets onto the phone with `adb push <rom> /sdcard/Download/`. The page's Load ROM opens Android's chooser
  (Camera, Camcorder, Photos & videos), since the input asks for no type; Photos & videos opens the system's file
  picker, whose search finds the file.
- A fresh origin, with nothing stored and nothing cached: serve the site at `http://localhost:<port>` on the computer
  (a proxy of the published hub that also serves its README.md, which the hub reads from its own origin on
  localhost), and `adb reverse tcp:<port> tcp:<port>` makes it the phone's localhost too, a secure context, so WebGPU
  and the service worker work there. The phone's other origins keep their saves and ROMs.
- Chrome's command line on a phone that isn't rooted: chrome://flags `#enable-command-line-on-non-rooted-devices`,
  then `adb shell 'echo "_ <flags>" > /data/local/tmp/chrome-command-line'`, and Chrome stopped and started twice
  (`am force-stop com.android.chrome`, then `monkey -p com.android.chrome -c android.intent.category.LAUNCHER 1`)
  before chrome://version shows them. Delete the file and reset the flag after: Chrome shows a warning bar while it's
  on.

## Measuring

- `tools/play_phone.mjs` plays a page there by steps (or watches a person play) and prints presents a second, the
  longest gap, the animation frames, RT64's and the page's console, and the GPU's load and clock where adb can read
  them (`/sys/kernel/gpu` on an Exynos: `gpu_busy`, `gpu_clock`, `gpu_max_clock`). The CPU's caps are in
  `/sys/devices/system/cpu/cpufreq/policy*/scaling_max_freq`, the temperatures in `adb shell dumpsys thermalservice`.
- **Heat decides the numbers.** A phone caps its clocks as it warms, more while it charges: after half an hour of play
  and measuring (charging, a skin at 39 °C), the Exynos 2100's big cores were held at 1.04 GHz of 2.9, its middle ones
  at 1.04 of 2.8 and its Mali-G78 at 403 MHz of 858, and Rush 2049's race fell from 40-49 presents a second to 11-44.
  So every number from a phone has its clock caps and temperature beside it, the runs it compares are interleaved, and
  the phone rests between them with its tab blank, as a player's phone is cool when the game starts and warm after.
  Neither Power saving (`settings put global low_power 0`, which a Galaxy keeps; `cmd power set-mode` it undoes) nor
  its absence moved those caps: heat set them, and they stayed while the skin was at 39-43 °C.
- `?present-stats` on the game's own page prints plume's presents, how long each took on the GPU, the waits for
  presents in flight and the time spun to a present's slot, and RT64's game frames a second beside the rate the game
  reports and the frames drawn for them. In the hub the game's frame has its own URL, so a `--preload` script that
  adds the query to the game frame's (`history.replaceState` before the page's scripts run) turns it on there.
- A settings file is put in the game's IndexedDB (`/home/web_user /<game>/`, store `FILE_DATA`, the file's path as
  the key, `{ timestamp, mode, contents }`) by an `eval` step before the tile is touched: a file written through
  `FS` once the game has booted is read only at its next start.
- The DevTools trace (Tracing over the browser's socket) of a race showed the GPU process's main thread ~53% and the
  page's ~49%, both with the trace's own cost; a trace slowed the page to 25-28 presents a second.
- Never scan the wasm heap from a sampler: `page_driver.mjs`'s RDRAM helpers search the whole heap, 13 s of the
  page's thread a call on a phone, so a sample that used them froze the page it was measuring.

## What holds a page back

A page presents short of the display's rate when the GPU falls behind or when the game's own frames do, and on a phone
it is often the second: each game frame is a run of CPU work, on threads that wait for each other, and a phone's cores
(capped by heat) are 2-4 times slower than a desktop's. RT64 interpolates to the display, so presents can stay up
while game frames fall. Telling them apart:

- `?present-stats`'s RT64 line: game frames a second under the rate the game reports is the CPU. plume's line: a
  present done on the GPU more than a display frame after it, and no time waiting for fewer presents in flight, is the
  GPU.
- A `profile` step in play_phone.mjs's steps profiles every thread of the page for a while and prints each one's busy
  share and top functions; the `.cpuprofile` files open in DevTools' Performance panel for the call paths. Build the
  page linked with `--profiling-funcs` for this: without it a profile names a wasm function only by its index. The
  threads a game frame waits on are the ones to cut: the display list thread (RT64's `send_dl`, `State::fullSync`),
  the game's threads (the recompiled `func_` ones) and the scheduler thread that starts each graphics task.
- What costs on a phone that a desktop hides: a clock read (`emscripten_get_now`, `clock_gettime`) leaves wasm for
  JavaScript, and one per texture uploaded took 9.6% of the display list thread; the web build's `memcmp` (musl's)
  compares a byte at a time, and one over 6 MB a frame took 5 ms; a byte-at-a-time copy (RT64's TMEM loads) is slow
  where a word at a time vectorizes; a wait for the page's thread (plume's device thread) waits behind everything
  queued there, which on a phone is milliseconds; and a wait for the GPU that a desktop's has long finished, such as
  render to RAM's late copy landing at the next list's start, which was a quarter of Conker's display list thread
  (Conker's Bad Fur Day on a Galaxy S21).
- Presents short of the display with neither the game's frames nor the GPU behind are RT64's interpolated frames:
  with present-stats, frames drawn a second under twice the game frames of a game interpolated at 30 is RT64
  skipping a game frame's later frames, which it does when its workload thread runs past each frame's share of the
  game frame's time. The page's thread and RT64's present thread were each under half busy then.
- A game that runs at 60 where it can (Rush 2049 at its 60 fps, Perfect Dark) and that a phone's CPU holds to 30-50
  mixes frames of one and two VIs. Timed at the shortest of the last three (RT64_UNEVEN_FRAME_RATES before rt64
  7844c07), the display's own 60 leaves RT64 nothing to interpolate, so it drew one frame for each game frame and
  presents fell to about the game's rate. Now, while the longer took 3 of the last 8 frames, a frame is timed at the
  longer and gets two: Rush 2049's race without its own hold presented 53 a second against 38-42 (below). The same
  game held to 30 gets two for each frame and drops none, and still presents a few more, so such a game's own code
  holds it to 30 on a page while it can't keep 60 up (Rush 2049 and Perfect Dark below).
- A GPU's load says little on a phone: its clock follows the load, so a lighter frame (resolution Original) ran the
  Mali-G78 at 130 MHz, still 60-80% busy, and presented no more.
- Nor does the time from a present to its end on the GPU: the Mali-G78's governor (Interactive, in
  `/sys/kernel/gpu/gpu_governor`) keeps the GPU at its lowest clock while a frame leaves it time to spare, so a
  present takes 18-23 ms there with the GPU waiting on nothing. plume's waits for fewer presents in flight
  (present-stats) say whether the GPU holds presents back: none is no. The GPU's time at each clock over a run is
  in `/sys/devices/platform/18500000.mali/time_in_state` on an Exynos 2100, read before and after it.

## What a phone does differently

- The canvas is in CSS pixels, not device pixels: on a DPR-3 phone the game frame's canvas was 726x280 in the hub's
  frame (800x360 fullscreen) while the screen is 2400x1080, so Chrome scales the picture up three times. RT64's Auto
  rounds the canvas's lines up to a whole multiple of the game's 240: 2x at 280-480 lines, so it draws 480 lines for a
  280-line canvas, about 2.9 times the canvas's pixels.
- The ROM picker offers the camera and photos first (above).
- Memory is set as on a desktop: every page reserves a 1536 MB heap (`frontend/CMakeLists.txt`) and only what it touches
  is resident. Jet Force Gemini's page from Pages, a minute into its game on a Galaxy S21 (7.2 GB): the page's process
  1.23 GB (PSS), Chrome's GPU process 450 MB and the browser 320 MB, 1.8 GB still available.

## Rush 2049 on a Galaxy S21

An Exynos 2100 (Mali-G78), 8 cores, a 60 Hz screen, Chrome 124 then 156, the page from Pages unless said, a single
race on its first track with the gas held, cool unless said.

- A race drew 40-49 presents a second (frames 60), with gaps up to 40-110 ms, whether or not Chrome kept its caches:
  with its GPU shader disk cache off (`--disable-gpu-shader-disk-cache`) the 76 prebuilt pipelines were built 6.4 s
  after the renderer started, before the race, and the race drew 40-49; after Clear browsing data's "Cached images and
  files" 5.6 s and 40-49; with V8's baseline compiler only (`--js-flags=--liftoff-only`) 32-47.
- A first visit on a fresh origin with the ROM picked there for the first time (the case a player saw 10-20 s of low
  frames in): the launcher drew 60, the race 28-50, as on every later visit. So neither the shaders' first build, nor
  the wasm's first compile, nor the first ROM store makes a first race slow.
- In the race the GPU was 90-96% busy at its capped clock.
- The race's game frames came at 19-25 a second, where the game reports 30 (or 20 or 60), while RT64 drew about 46
  frames a second for them and the page presented 40-44: the CPU's work in each game frame held it back. Its
  profile (hot, CPU capped at 1.04 GHz): the display list thread 52% busy, 30% of that in `RT64::TMEMHasher::hash`
  (about 900 textures hashed a game frame, few of them the same TMEM twice) and 5% in RT64's TMEM loads; the
  scheduler thread 10.5% in Rush 2049's hi-res font scan, which runs before each graphics task goes to RT64 while no
  other game thread runs; the frame loop's thread 10.9% in `memcmp`, Rewind comparing 6 MB of RAM with its copy.
- The hi-res font scan copying a load into its TMEM only when a rectangle reads it (rush-2049-recomp's
  `src/hires_font.cpp`): 26.5-27.2 game frames a second against 22.8-24.1 (3 pairs, interleaved, skin 39-40.5 °C,
  big cores at 1.04 GHz, GPU at 403 MHz); presents 40-43 either way.
- With the font scan's change, Rewind comparing 32 bytes at a time (`src/rewind.cpp`) and RT64's TMEM loads copying a
  word at a time (rt64-web): 28.8 and 29.0 game frames a second against 23.3 between them (skin 39 °C, same caps);
  presents 40-45 either way. Resolution Original drew 39 presents a second and draw distance and detail Original 40.7,
  against 41-45: the GPU's clock fell to 130 MHz at Original, so pixels weren't what held presents.
- What held them: RT64 drew 1.3-1.77 frames for each game frame where the game's 30 on a 60 Hz display gives 2. Its
  workload thread took 6-8 ms to set up each game frame and 13.5-15 ms to draw each frame, 5.5-6.7 ms of that waiting
  for the page's thread after each command list, so the second frame missed its share of the game frame's 33 ms and
  was skipped, in 35-45% of game frames. With plume's device thread waiting one execution behind (plume-web, Device
  thread: upload buffers mapped on the calling side): 0.2-0.6 ms of waiting, 8.7-10 ms a frame, skipped in 1-5%,
  1.93-1.99 frames a game frame, 46-50 drawn and 44.8 presents a second against 35-44 and 39.7 (same caps, 1.04 GHz).
- The phone's caps moved with the room: later in the night, cooler (skin 33-35 °C), its big cores were held at 1.35 GHz
  and its GPU not at all, and the race's game frames came at 33-38 a second, Rush 2049 running above 30 where it
  could (frames of 1 VI). Pairs are compared only at the same caps (`clocks before` in each run's log).
- Presents in flight (plume's `?presents-in-flight=<n>`, default 2, rising to 3 after 30-90 s of play): 3 from the
  start drew 43.7 a second, 4 drew 40.7 and never waited for one, against 42.4. The game's frame rate set to
  Original (30) drew 43.3 against 42 at the default 60.
- All of it (the font scan's change, Rewind's, TMEM loads by words and the device thread's), the page built with it
  against the same page without, interleaved, big cores capped at 1.35 GHz, GPU not capped: 34.6 and 34.7 game frames
  a second against 29.1, 40.7-41.5 drawn against 48.6, presents 40-41.9 against 43.6 (skin 33-35 °C). The page without
  them reached 37.4 game frames only with its big cores at 2.08 GHz. With the game above 30, more of its frames are 1
  VI long and RT64_UNEVEN_FRAME_RATES then gave them fewer frames between, so presents stay about 42 (the next bullets).
- The display list thread is the one the game waits on: 64% busy in a race at 1.04 GHz, about 25 ms of each game
  frame, the game's own threads mostly waiting. 18.6% of it was `RT64::TMEMHasher::hash`: counted, the race hashed
  about 65,000 textures a second (2,600 a game frame), 97% of them CI, with 25 updates of the hash each on average,
  most of them a palette's 8 bytes. With a CI4 texture's indices taken from 16 pieces and each run of used palette
  indices hashed in one update (rt64-web, TMEM hash): a CI4 hash took 0.9-1.1 us against 1.5-2.6 on the phone (a
  benchmark of tiles shaped like the race's, the same hashes), and the race's game frames came at 36.5 a second
  against 35.1-35.5 (2 pairs, big cores at 1.35 GHz), presents 40.7 against 39.6-39.7. XXH3's NEON code built for
  wasm SIMD hashed 5-7% faster than its scalar code on the phone and a third slower on a desktop, so it stays scalar.
- Rush 2049's Game Frame Rate at Original (30) against its default 60, the same page: 55.2-55.9 presents a second
  against 40.8-44.3 (2 pairs, big cores at 1.04-1.35 GHz), the game at 27.8-29.7 frames a second against 30.1-31, so
  RT64 drew 1.9 frames a game frame against 1.4. At 60 the game the phone can't keep at 60 mixes frames of 1 and 2
  VIs, and RT64_UNEVEN_FRAME_RATES took a frame's length from the shortest of the last three, so most frames got one
  drawn; at 30 every frame is 2 VIs and gets two. The page now holds the game to 30 while it can't keep 60 up
  (rush-2049-recomp's `src/frame_rate.cpp`): at the default 60 it presented 51.6, 52.5 and 52 a second against 44.9,
  41.1 and 42.7 without it, and 53.4 at Original, big cores at 1.04 GHz each time (the GPU's cap 403-858 MHz), and
  57.4 at 1.35 GHz. Holding after one second of 20-50 frames held a page on a desktop GPU at 30 for 10 s after each
  load, whose second falls short (42 and 50 frames in Rush 2049's regular plan); after two in a row it never held
  there, 300 and 301 presents a second uncapped against 304-318 without it, and the phone presented 52.8 against 45.5.
  The night's changes together (the fork changes, the font scan, Rewind and the two-second hold) against the page Pages
  serves, on a desktop GPU uncapped (one pair, the host serving phone plays): 308.1 presents a second against 322.9,
  within the 300-325 its plays read that night, and no hold.
- RT64_UNEVEN_FRAME_RATES timing a frame at the longer of the last three's VIs while it took 3 of the last 8 frames
  (rt64 7844c07), the same tree built three ways, a race each with the gas held, interleaved: with the game's own hold
  off, 53.0 and 53.0 presents a second against 38.1 and 42.1 timed at the shortest (big cores at 1.04-1.35 GHz, skin
  34-35.5 °C); with the game's hold on and the shortest, 56.1 and 53.7 against 46.9 and 48.0 for the longer with the
  hold off (big cores at 1.04-1.35 GHz, skin 34.4-35.6 °C). So the hold stays, and a game without one gets most of it.

## Other games on a Galaxy S21

The page from Pages, the same phone and night, big cores capped at 1.35 GHz, skin 34-36 °C, about a minute of each.

- Mario Kart 64, a race on Luigi Raceway with the gas held: 59.5 presents a second, the GPU 67-81% busy at 130 MHz.
- Super Mario 64, Castle Grounds: 59.9.
- Banjo-Kazooie, its attract demo in Spiral Mountain: 59.7 (55-60), the GPU up to 90% busy at a low clock.
- GoldenEye 007, Majora's Mask, Donkey Kong 64 and Ocarina of Time, 80 s of each one's attract after Start Game, big
  cores at 1.04 GHz: 59.6, 59.9, 60 and 60.2, the GPU 21-30% busy at 130 MHz.
- Conker's Bad Fur Day, the same: 46.8 (45.8-53.2), each present done on the GPU 19-21 ms after it, the GPU 65-84%
  busy at 130 MHz of a cap of 767-858. Its game frames hold it, not its GPU (Conker's Bad Fur Day on a Galaxy S21).
- Perfect Dark, its intro: 48 (48-51), the GPU 50-75% busy at 130 MHz, so the CPU holds it.
- Perfect Dark's intro with plume's device thread waiting one execution behind and RT64's TMEM loads by words, against
  the page from Pages, interleaved (2 pairs, big cores at 1.35-1.56 GHz, skin 33-36 °C): presents 50-52 a second over
  the intro against 50.6-52.6, and 40.7-40.9 over its last minute against 41.8-42.4, its game at 31.7-32.9. Its
  cutscenes' own stops (docs/findings.md) come and go with the shots, so the intro doesn't tell a few presents apart.
- Perfect Dark held to 30 while it can't keep 60 up (perfect-dark-recomp's `patches/frame_rate.c`), its intro for
  140 s, interleaved with the same tree without it, big cores at 1.04 GHz, GPU not capped, skin 35-36 °C: drawn
  51.5 and 54.4 a second against 45.9 and 46.8, presents 49.5 and 48.8 over the last minute against 44.2 and 46.6,
  the game at 25-27. It tried 60 again 10 s into each hold and kept it at 52-54 frames for most of a minute, where
  the game mixes frames still.
- Jet Force Gemini at the page's Game Frame Rate 60: 53.3 presents a second, RT64's draw 14-17 ms of CPU a frame,
  the GPU 55-71% busy at 130 MHz, so the CPU holds it.
- Jet Force Gemini at its own Game Frame Rate 30 against the page's 60, set in its options file before boot, 115 s
  after its launcher's Start with no input, interleaved (2 pairs, big cores at 1.35-1.56 GHz, skin 33-35 °C):
  presents 60.3 and 59.9 a second against 56.2 and 57.1, the GPU 21-86% busy, mostly at 130 MHz. As with Rush 2049
  and Perfect Dark, 30 interpolated to 60 presents more than a 60 the CPU can't keep. Its port has no hold of its own.
- A hold like theirs in Jet Force Gemini's port (tried, not on its main), at the page's 60 against Pages, interleaved on
  a cooler phone (big cores at 1.56-2.08 GHz, skin 27-33 °C): 59.7 and 55.4 presents a second against 58.6 and 58.6. It
  held in both its runs (45 frames a second, each try at 60 reaching 27-40), but with that much more CPU the page's 60
  presented more than in the pair above, and the hold showed no clear gain.
- The same hold once RT64_UNEVEN_FRAME_RATES took the slowest of the last three frames (rt64 7844c07), both builds on
  that, interleaved (hold, without, without, hold) on a phone warming from big cores at 1.35 GHz to 1.04 (skin 35.5 to
  39.3 °C, the GPU's cap 858 then 403 MHz), the last minute of each: 53.6 and 51.7 presents a second with the hold
  against 53.2 and 53.1 without, the game at 25.5-28.1 either way. It held in both its runs (29-48 frames a second),
  and gained nothing: the slower-rate rule gives a 60 the CPU can't keep the two frames each a hold did, so the hold
  stays off Jet Force Gemini's main.

## Conker's Bad Fur Day on a Galaxy S21

Its attract after Start Game, about 80 s of it, Chrome 156, not charging: the page from Pages (built on v0.106.0) and
main's build (v0.107.0) served in its place, with present-stats.

- 50.4-54.8 presents a second cool (skin 31-35 °C, big cores not capped), the game at 25.4-27.6 frames a second where
  it reports 30, RT64 drawing two frames for each and plume never waiting for fewer presents in flight. With big
  cores held at 1.35 GHz by heat 48-49.4, the game at 19.6-24.6; at 1.04 GHz 50.3, the game at 18.3 where it
  reported 20. So presents follow the game's frames.
- Power saving off (`settings put global low_power 0`) against on, interleaved (2 pairs, cool): 50.8 and 51.6 presents
  a second against 54.8 and 50.9, the GPU at 130 MHz for 77-78% of each run against 70-78%, at 221 MHz most of the
  rest. The governor raises the GPU's clock no more with it off.
- A present's GPU passes (tools/pass_probe.js, Chrome's timestamps, 245-257 presents a reading, main's build): 12.9-13.3
  ms at Auto's 928x432 (2 times its 216 lines, the canvas 773x360). The scene 6.4-6.7 ms (422 draws, fragment shaders
  of 10 and 9 KB the most); render to RAM's second draw at 292x216 1.1-2.0 ms (141 draws, one for each game frame);
  RSPProcessCS 1.25 ms and RSPWorldCS 0.39 ms for its ~7,800 vertices (122 workgroups), 0.05 ms in all on a desktop;
  a depth-only pass of one draw before the scene 1.3 ms, the game's fill rect into its depth buffer, which covers less
  than the whole target, so plume draws it; the canvas's clear 0.4-0.5 ms and the frame drawn into it 0.5-0.6 ms;
  render to RAM's compute passes over the 292x216 frame 0.3 ms. All of it RT64's own, as on a desktop
  (docs/findings.md).
- The canvas's clear is a pass of its own because RT64's present clears it, sets a barrier for the frame's texture and
  then draws, and plume's barrier ends the pass a pending clear starts. Kept pending across the barrier, the clear and
  the draw were one pass of 0.74 ms against 0.38 and 0.49, 0.14 ms of 13, and presents 50.4-50.7 against 50.9-54.3
  (3 pairs, interleaved, skin 31-35 °C): the Mali clears a target alone cheaply, and the change was dropped.
- Resolution Original (464x216): 10.1 ms of GPU passes a present, the scene 3.3 ms, the GPU at 130 MHz for 96% of the
  run, and 49.4 presents a second, the game at 23.8-24.6, big cores at 1.35 GHz: no more than at Auto.
- A profile of every thread (main's build linked with `--profiling-funcs`, big cores at 1.35 GHz, 20 s): the display
  list thread 44% busy (RT64's `RSP::drawIndexedTri`, `setVertexCommon`, Conker's F3DEX2 microcode), RT64's
  workload thread 33% (`RigidBody::lerp`, `GameFrame::match`, its interpolation), the audio microcode's 28%, the
  page's thread 54% and the game's 12%. No thread is near full, so a game frame is set by its threads waiting for each
  other, a chain to cut as Rush 2049's was (What holds a page back).
- The chain, from a trace of the display list thread, the scheduler and the game's threads (25 s of the attract, a
  build with timestamps at each wait): Conker's scheduler swaps the frame when the RDP is done and starts the next
  graphics task at the VI after, and the game's thread has built the next list meanwhile, so a game frame is one
  display list's time on RT64's thread rounded up to whole VIs. Lists of 20-31 ms (p10-p90) made frames of 2 VIs,
  of 33-47 ms frames of 3, and the 30 a second the game asks for needs every list under 33 ms.
- A quarter of that thread's time (24% of a profile's samples, 31% of `send_dl`'s) went in `DTBuffer::map` at each
  list's start: render to RAM's late copy of the list before landed there, and the GPU, at 130 MHz while it keeps up,
  had not finished that frame yet (a present takes it 18-23 ms, What holds a page back). With the copy landing only
  once the GPU has it (rt64 330f84a), against main's build, the same attract, played in turn, from 150 s on: game
  frames a second (the range of its 5 s windows) and presents a second.

  | play | build | big cores, GPU's cap, skin | game frames | presents |
  |---|---|---|---|---|
  | 1 | main | 1.35 GHz, 858 MHz, 33.8-38.3 °C | 25.4 (16.5-27.3) | 53.7 |
  | 2 | the change | 1.04 GHz, 403 MHz, 36.8-39.1 °C | 23.8 (22.2-29.3) | 57.7 |
  | 3 | the change | 1.04 GHz, 403 MHz, 37.1-39.7 °C | 22.6 (20.8-24.0) | 58.0 |
  | 4 | main | 1.04 GHz, 403 MHz, 37.5-39.9 °C | 19.7 (18.5-21.0) | 56.8 |
  | 5 | main | 1.04 GHz, 403 MHz, 38.2-40.3 °C | 19.9 (17.9-23.4) | 55.9 |
  | 6 | the change | 1.04 GHz, 403 MHz, 38.2-40.4 °C | 24.0 (21.3-30.2) | 58.4 |

  The first play started cooler, its big cores at 1.35 GHz until heat held them at 1.04, and compares with none of
  the others. Held alike, the change drew 15-21% more game frames than main in the same minutes, and presents followed.
  The CPU wrote to a framebuffer with a pending copy twice in every play of either build.
- What is left of a list is RT64's own work, as on a desktop: in that profile, without the wait, `State::fullSync`
  25% of the thread (the tiles' TMEM loads and hashes 11.5%, recording the workload 8.5%) and the microcode's vertices
  and triangles 20%.

## Banjo-Tooie on a Galaxy S21

Its attract after Start Game, 240 s of it (about 300 s of the page's time), Chrome 156, charging, big cores held at
1.04-1.35 GHz (skin 33-42 °C): the page from Pages (built on v0.106.0), or that page built with prints, served in its
place. The attract changes level about 125 s and 250 s into the page.

- Before rt64 b173eb3, every one of 7 plays that reached the second level change presented nothing from there on,
  0 a second to the play's end, while the page's thread kept its 60 animation frames and the game its 15-20 frames:
  RT64's present thread dropped every present for a newer one. It decided as it took a present from the queue, before
  waiting for the present's workload, and there each workload ended 89-291 ms after its present was queued (p10-p90,
  5,634 presents) where the game's next present came 33-111 ms after it, so a newer one was always queued. Every play
  also went to 0-4 a second for a few seconds at the first level change, as cool (big cores at 1.35 GHz, skin
  33-34 °C) as hot. play_phone.mjs prints a trace site's first lines only, so the drops' own lines stop early in a log.
- With rt64 b173eb3 (a present dropped only once its workload is done and the newer one's too): 6 of 6 plays kept
  presenting after the second change, 8-22 a second (big cores at 1.04 GHz, skin 36-42 °C), and none fell under 21 at
  the first; before the changes 53-54 a second (each play's median), as before. After the change the GPU was 0-85%
  busy at 130 MHz, so what holds those 8-22 is the CPU's work for each workload.
- A rarer hang: in 3 of the 10 plays before the fix the game stopped in or just after a level change's drop (126, 151
  and 247 s), its watchdog's frame no longer counting and presents at 0. One game thread called `osSendMesg` and `osRecvMesg` in a loop
  and never blocked, 93% of its time in `QueuedMessage::send_blocked_messages` (from `dequeue_external_messages`), and
  it ran above the priority of the game's main thread, which waited in `osSetThreadPri` to run again and never did.
  The runtime's held messages stayed under 16 and no timer fired. None of the 6 plays with the fix hung.
- The page's heap (the break of its 1536 MB) held at 575-717 MB through each play with the fix.
