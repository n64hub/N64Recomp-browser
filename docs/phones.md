# Pages on a phone

How a page is played and measured on an Android phone from a computer, what a phone does differently from a desktop,
and what has been measured there. `tools/play_phone.mjs`'s header has its options; docs/playing.md has the rest of
playing a page, and docs/findings.md what was measured on desktops and laptops.

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
  where a word at a time vectorizes; and a wait for the page's thread (plume's device thread) waits behind everything
  queued there, which on a phone is milliseconds.
- Presents short of the display with neither the game's frames nor the GPU behind are RT64's interpolated frames:
  with present-stats, frames drawn a second under twice the game frames of a game interpolated at 30 is RT64
  skipping a game frame's later frames, which it does when its workload thread runs past each frame's share of the
  game frame's time. The page's thread and RT64's present thread were each under half busy then.
- A GPU's load says little on a phone: its clock follows the load, so a lighter frame (resolution Original) ran the
  Mali-G78 at 130 MHz, still 60-80% busy, and presented no more.

## What a phone does differently

- The canvas is in CSS pixels, not device pixels: on a DPR-3 phone the game frame's canvas was 726x280 in the hub's
  frame (800x360 fullscreen) while the screen is 2400x1080, so Chrome scales the picture up three times. RT64's Auto
  rounds the canvas's lines up to a whole multiple of the game's 240: 2x at 280-480 lines, so it draws 480 lines for a
  280-line canvas, about 2.9 times the canvas's pixels.
- The ROM picker offers the camera and photos first (above).

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
  VI long and RT64_UNEVEN_FRAME_RATES gives them fewer frames between, so presents stay about 42: what holds them there
  is the GPU, 90-96% busy at its clock.

## Other games on a Galaxy S21

The page from Pages, the same phone and night, big cores capped at 1.35 GHz, skin 34-36 °C, about a minute of each.

- Mario Kart 64, a race on Luigi Raceway with the gas held: 59.5 presents a second, the GPU 67-81% busy at 130 MHz.
- Super Mario 64, Castle Grounds: 59.9.
- Banjo-Kazooie, its attract demo in Spiral Mountain: 59.7 (55-60), the GPU up to 90% busy at a low clock.
- Perfect Dark, its intro: 48 (48-51), the GPU 50-75% busy at 130 MHz, so the CPU holds it.
