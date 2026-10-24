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
- The DevTools trace (Tracing over the browser's socket) of a race showed the GPU process's main thread ~53% and the
  page's ~49%, both with the trace's own cost; a trace slowed the page to 25-28 presents a second.
- Never scan the wasm heap from a sampler: `page_driver.mjs`'s RDRAM helpers search the whole heap, 13 s of the
  page's thread a call on a phone, so a sample that used them froze the page it was measuring.

## What a phone does differently

- The canvas is in CSS pixels, not device pixels: on a DPR-3 phone the game frame's canvas was 726x280 in the hub's
  frame (800x360 fullscreen) while the screen is 2400x1080, so Chrome scales the picture up three times. RT64's Auto
  rounds the canvas's lines up to a whole multiple of the game's 240: 2x at 280-480 lines, so it draws 480 lines for a
  280-line canvas, about 2.9 times the canvas's pixels.
- The ROM picker offers the camera and photos first (above).

## Rush 2049 on a Galaxy S21

An Exynos 2100 (Mali-G78), 8 cores, a 60 Hz screen, Chrome 124 then 156, the page from Pages, a single race on its first track with the gas held, cool unless said.

- A race drew 40-49 presents a second (frames 60), with gaps up to 40-110 ms, whether or not Chrome kept its caches:
  with its GPU shader disk cache off (`--disable-gpu-shader-disk-cache`) the 76 prebuilt pipelines were built 6.4 s
  after the renderer started, before the race, and the race drew 40-49; after Clear browsing data's "Cached images and
  files" 5.6 s and 40-49; with V8's baseline compiler only (`--js-flags=--liftoff-only`) 32-47.
- A first visit on a fresh origin with the ROM picked there for the first time (the case a player saw 10-20 s of low
  frames in): the launcher drew 60, the race 28-50, as on every later visit. So neither the shaders' first build, nor
  the wasm's first compile, nor the first ROM store makes a first race slow.
- In the race the GPU was 90-96% busy at its capped clock.
