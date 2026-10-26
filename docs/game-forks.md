# The game forks

What each game fork's page is, how it was ported and what porting it found, where its own repo doesn't say it, and
how the games compare. Each fork's README and BUILDING.md hold the rest, and `plays.jsonl` every run of its page.
CLAUDE.md has the rules every fork follows.


Each is on `main`, and each one's README says up front that it is AI-written and not upstream's, and its BUILDING.md how
to build the page (Conker has none: its README's The web page has the steps). On BanjoRecomp-web upstream's
`validate-internal` workflow, a native build on every push to main with no ROM, is disabled. Banjo, Majora's Mask,
Donkey Kong 64 and Conker are on their own upstream submodules and GoldenEye on upstream's at the forks' bases, all
patched by the N64Recomp-browser tag their submodule pins (each fork's `lib/N64Recomp-browser`, Conker's
`tools/N64Recomp-browser`; CLAUDE.md, The pins); Banjo, Majora's Mask, Donkey Kong 64 and GoldenEye include its
`frontend/build_speed.cmake`. In headless Chrome the DK Rap, Banjo's intro and Majora's Mask's attract demo play through
`audio_output.h` with nothing short after the first second.

Each has a prebuilt shader list, `src/rt64_shaders.txt` (its header says what was played and what not). Banjo's fits
Chrome's cache. Majora's Mask's and Donkey Kong 64's are recorded by code, a section an area, as GoldenEye's; Majora's
Mask's is in 17 sections. Firefox waits for a boot before the page's first frame, so a boot holds only what draws before
a frame that starts a section (Donkey Kong 64's BUILDING.md has the waits that showed it). Cold and then warm in
headless Chrome 155 (RTX 2070, host 15-41% busy): Majora's Mask's boot 2.4 and 0.1 s (16.4 and 10.9 s as one list),
Clock Town 1.6 s either way; Donkey Kong 64's 5.0 and 0.4 s (9.6 and 5.2 as one list), Frantic Factory 0.9-1.0 s.
Firefox 157 keeps no built pipelines between visits, so every visit waits as long: Majora's Mask's boot 4.5-4.7 s and
Clock Town 14-16 s, Donkey Kong 64's 15-17 s (26 s as one list) and the Factory 3.6 s. Those Chrome numbers are from
before rt64 950188f, which builds the whole list behind the game; on v0.28.0, cold in headless Chrome 155 (RTX 2070, a
busy host, 2026-10-14): Banjo waited 1.8-2.6 s at the start instead of 3.5, Majora's Mask nothing at the start and 0.5 s
for Clock Town, Donkey Kong 64 nothing at all, the Factory included, Conker nothing at the start and 3.5 s for Windy,
reached before its boot section was built. The cost is frames while the list builds: Banjo, Majora's Mask and Conker
drew 28-42 a second for 5-10 s, Donkey Kong 64's DK Rap 18-31 for ~20 s (115 pipelines in its boot), and GoldenEye (202
pipelines, 19 MB of WGSL) 7-36 through its cast credits until all were built ~93 s in, ~28 s of its sound lost, where on
e6a64ac it waits ~4 s and draws 56-60 there (its first attract demo then waits 6 s and draws 12-29 for ~20 s). That was
rt64 e8e162e's even pacing, not the build threads: each pipeline built behind the game drops a present every second or
two, and 2 in a second paced every game frame to one present, 8-12 a second in GoldenEye's credits (on an idle host the
DK Rap played alike with its boot section on 6, 3, 2 or 1 threads, and waiting for it up front lost 90k-140k audio
frames). With rt64 6734747, cold on an idle host, GoldenEye drew 48-62 through its boot and credits (173k-223k audio
frames short in 120 s against 525k-1.2M) and Donkey Kong 64 55-56 once its boot's ~3 s of black ended, none short.

`n64hub/BanjoRecomp-web` is Banjo-Kazooie: Recompiled, the second recomp the web support was tried on. Its runtime
is older than the forks', so `recomp::start` takes upstream Banjo's arguments, not a `recomp::Configuration`. It has no
externs header. What porting it found is in N64Recomp-browser's README. On a fresh profile about 3 minutes of A through
the opening reached only the dialogue in Banjo's house, so its play plan warps. Its BUILDING.md (The web page) and the
headers of `CMakeLists.txt`, `tools/warp.js` and `src/rt64_shaders.txt` have the rest: how the submodules are patched
and the page built, the shader list's sections and how they were recorded, the play plan and its warps by the game's own
map change request.

`n64hub/Zelda64Recomp-web` is Majora's Mask on upstream's `recomp-frontend` branch (draft PR 722, which moves it
onto RecompFrontend). The commits that branch pins for its `lib/rt64`, `lib/N64ModernRuntime` and `lib/RecompFrontend`
are the forks' bases, so `patches/apply.cmake` applies every patch with `git apply` alone, with no patch of the game's own
on its submodules. In headless Chrome: launcher, Load ROM, the attract demo, title, file select, the intro, Link walking, the
pause menu; its 20 frames a second interpolated to the display's rate. The built-in D-pad mod's icon draws by the HUD in
play. Its BUILDING.md (The web page) has the rest: the submodules and their patches, the D-pad mod recompiled to C and
linked in, render to RAM kept on for the Pictograph Box, the ROM to build with and the one the page takes, the shader
list's sections and how they were recorded.

`n64hub/Donkey-Kong-64-Recompiled-web` is Donkey Kong 64: Recompiled. In headless Chrome: launcher, Load ROM, the
DK Rap, a new game through the opening cutscenes, DK walking in his house, the pause menu, sound. Upstream's fork of the
runtime adds `--game-mode` beside `--game`, and `recomp::Configuration`'s argc and argv, which the page passes. Its
hooks and patches called C functions whose signatures didn't match the call, which only wasm-ld's `function signature
mismatch` shows, an error with `frontend/` (N64Recomp-browser's README, what a recomp does itself). Before
RecompFrontend-web 75fe596 render to RAM's copy, a list late or exact, crashed boots in headless Chrome 155 a second or
two after Start (a call through a function table out of bounds, or the audio microcode jumping nowhere): 1 in 24 with
rt64 73e9ca0's copy, 5 in 48 with cb75c5c's, none in 24 with the copy taken late but never written to RDRAM (a test
build) or in about 12 exact. The copies that landed were the runtime's dummy frames (320x241), on the game's main
overlay (`.global_asm`, 0x805FB300-0x80761050, code and data, its audio microcode at 0x80741310). Its BUILDING.md (The
web page) and the headers of `patches/timing_fixes.c`, `patches/shader_survey.c` and `web/curl` have the rest: the
submodules and the three-way merge, the mod store kept off without curl, the audio task lost while Chrome built the
boot's shaders and its fix, render to RAM's late copy for the Banana Fairy photo and the dummy-frame crash, the shader
list's sections and Firefox's waits, the ROM.

`n64hub/GoldenEye64Recomp-web` is GoldenEye 007. It is a fork of podulator's GoldenEye64Recomp, which carries on
cblock85's and is on RecompFrontend itself, and merges its main: his launcher, settings, input and mouse, quicksaves,
debug menu, build scripts and release workflow are the fork's. Its diff from his main is the web support and what it
needs (its README, What differs from podulator's main):
- `lib/`: his main vendors its RT64, N64ModernRuntime, RecompFrontend and N64Recomp with changes of its own; the fork's
  are submodules at the commits the forks are built on (`patches/patches.txt`, a row each in `pins.txt`), with his
  changes as `lib-patches/` (RT64's rotation snap and ubershaders-only on every build but the page's, the Reload and
  Crouch inputs and postBlendNoiseNegative, `debug_logging` and the const game ids his launcher passes), which its
  `lib-patches/apply.cmake` applies before N64Recomp-browser's patches. `tools/publish_pages.sh` runs it, and the
  fork's build scripts do before they build N64Recomp from `lib/N64ModernRuntime/N64Recomp`. Its desktop build needs
  the patched N64Recomp too (9aabea3, ec0748e). Upstream RT64 names its Linux DXC `dxc-linux`, where his copy has a
  `dxc` too.
- The page's code, behind `__EMSCRIPTEN__`: no file dialogs or Exit, the canvas as the window, `audio_output.h`, render
  to RAM's late copy, the page's own game id (`ge007.n64.us`, under which browsers keep players' ROMs and saves), and a
  0% Mouse Sensitivity from an earlier page loading as 50%.
- Fixes on every build that his main lacks: the patches yield through `recomp_yield_self_1ms` (a call to
  `yield_self_1ms`, whose signature isn't a native's, trapped the page after ~20 s), `fps.c`'s waits yield,
  `get_frames_remaining` leaves out the buffer queued last, `dump.toml` gives `cosf` the size that takes in `sinf` (his
  `tools_weaken_patched.py` repairs the code after, which the page's build doesn't run), the C library's names renamed,
  `syms.ld`'s comments as `/* */`, which ld.lld reads, and his launcher remembering a ROM picked in it (the runtime's
  `is_rom_valid` knows only the one stored at start, so Start game stayed Select ROM until a restart).
- The shader list, its recording (`patches/shader_survey.c`, `tools/`) and the play plans, which press Enter on his
  launcher's first item at its bottom right, until the game has started (a ROM given takes the focus).

His sky and water are drawn as vertex triangles where cblock85's filled the screen with the fog colour (RT64 has no
raw RDP triangles).
GoldenEye draws its world relative to the room the camera is in, so on the frame the camera crosses a room seam every
matrix jumps, and RT64's frames between that one and the one before drew the world shifted (through a door, the clear
colour): its `patches/origin_interpolation.c` gives that frame matrix groups RT64 pairs with nothing, and is the fix
offered to podulator's, which takes AI-written fixes for bugs its desktop build has too. It draws a room seen through a
portal, and the props and guards in it, clipped to the portal's box on screen, and the walls around a portal don't hide
what is behind them: its `patches/widescreen.c` had made every one of those clips the whole screen, which drew Frigate's
bridge consoles and guards on the bridge's outer wall, blinking as the game toggled them on screen, and a building over
Surface's tree wall. RT64 widens a projection only if its draws' scissors together span the screen, and the game loads
its projection for every room, so its `bgScissorCurrentPlayerView` gives a room cut narrower than the screen one empty
triangle under the whole screen's scissor first, and its box in the widened projection's terms; a box kept to the 4:3
view drew those rooms 4:3, leaving strips of sky at a 16:9 view's edges (Dam's mountain). A wait that polls memory or the clock without
an OS call starves every other game thread on any recomp, as its `patches/fps.c` did; a trace of the count
calls a second found this one. A game's `get_frames_remaining` must match how its audio manager reads osAiGetLength.
With render to RAM's copy a list late, through its whole shader plan its CPU never wrote to a framebuffer whose copy was
pending. Every level adds dozens of shaders (26 combiners, but many render modes: palette textures, fog, depth). Without
the boot section, a cold visit built 13 shaders behind the intro, which fell to ~15 frames a second. In Chrome 155
headless (RTX 2070) the menus took 2.5 s cold, Dam 6.6 s cold and 4.5 s on a later visit: boot and Dam alone are ~9.4 MB
of Chrome's 6 MB cache. To reach a level from a fresh save by hand, mark the earlier ones completed in RAM: `saves`
(data_dump.toml) holds 0x60-byte folders whose 10-bit times start at byte 0x12, and RDRAM is found in the heap by
osTvType, osRomBase and osMemSize at 0x80000300. Its README and BUILDING.md, and the headers of `patches/fps.c`,
`patches/shader_survey.c` and `src/rt64_shaders.txt`, have the rest: the TLBFREE ROM, what the native build needs the
patches for and the renamed functions, the sound fixes, render to RAM's late copy with Dam's timings, the shader list
and how it was recorded, Firefox's waits.

`n64hub/CBFD-Recompiled-web` is Conker's Bad Fur Day: Recompiled (its CONTRIBUTING.md welcomes AI-assisted work,
but nothing has been offered to it). Its tools stay upstream's submodules in `tools/`, with `recomp/*.patch` as upstream
has them, and `tools/publish_pages.sh` runs the fork's `tools/web_patch.sh` too; the three files that leaves out are out
of apply.cmake's file list, and its `tools/web_timer.patch` does what N64ModernRuntime 1f46855 does upstream's. Its
changes to those three are the web's as the commit the script names (`MERGED_FROM`) has it, and what the web has
changed in them since is merged in by `apply.cmake --since`, as Snap64's are; timer.cpp's merge starts at
N64Recomp-browser 54e69b8 (`TIMER_MERGED_FROM`), since N64ModernRuntime a25ea81's ordered set of timers is upstream's
set and Conker's patch replaces it with a list, which has no order to lose. rt64-web
03b9dcc and d5121c9 keep rt64's web includes off the lines Conker's rt64 patch adds to; a new web include goes where a
game's patch adds none, or the next retest's Conker build stops on it. N64ModernRuntime 6456ba6 keeps the VI thread's
frame wait off the lines Conker's runtime patch moves its retrace count to, and CI's `cbfd-patches` job applies the
patches over all of Conker's own (`recomp/*.patch`, then `tools/web_patch.sh`, from the fork's main), so a collision is
red on the PR that makes it. In headless Chrome: launcher, Add ROM, the intro,
the bar, Conker walking outside it, sound. Without a GPU, the window build runs under Xvfb with Mesa's software Vulkan
(`--seconds 90`, `--rom` an absolute path since it moves to its own folder): the intro to the bar at 60 VIs a second.
Its shader survey is JavaScript since the fork has no patches library, and its list, `host/rt64_shaders.txt`, is 499
descriptions, 403 pipelines, in 19 sections. In headless Chrome 155 (RTX 2070) the boot took 3.0 s cold and 0.2 s warm
(7.8 and 3.2 s as one list), Windy 3.5 and 2.5 s. Firefox 158 lost the device in Windy before plume 97f4e64 with the
GPU's memory flat; before plume 94a4795 the page never started there, and before rt64 d070e5c it drew 9-13. Its CPU
writes to framebuffers whose copy is pending (0x3B7600, 0x3D6300, 0xE9D80 and others) in every chapter, 89 times over
its shader plan, 30 of them while the copy landed, which before rt64 cb75c5c the copy overwrote; with cb75c5c no chapter
crashed. A game's own `target_link_options(<target> PRIVATE -sINITIAL_MEMORY=...)` overrides `frontend/`'s 1536MB, which
`n64recomp_browser_frontend_page` puts first on the link line. Its README (The web page) and the headers in `tools/`,
`host/` and `build.sh` have the rest: how `build.sh` layers the web patches and which files it leaves out, the save
states, the TLB-mapped pages and the heap, tail calls, sound, render to RAM and its late copy, the shader list's
sections and how they are recorded, Firefox's fixes.

`n64hub/wave-race-64-recomp-web` is Wave Race 64: Recompiled. Fast3D draws as it does natively, with no rt64-web
change. Its water renderer's 16 shaders are included as WGSL blobs. Its water patch is the web-patched tree's diff, so
an rt64-web change beside its lines (rt64 179adb8, 5249040, d19fdcc, b173eb3) stops `git apply` and the patch is made again (applied with fuzz,
then diffed). CI's `wr-patches` job runs its `tools/web_patch.sh` on each PR, so such a change is red there, not at the
page's next build. Its list is in 13 sections, the menus passed with page_driver's `pressUntil` and the gas held with
its `down`/`up`. Its docs/BUILDING.md (The web page) and the
headers of `tools/web_patch.sh`, `tools/patch_rt64_water.py`, `recomp/wr64.toml`, `tools/autopilot.js` and
`src/rt64_shaders.txt` have the rest: how the submodules are patched (apply.cmake, the port's own scripts, the water
patch), the microcode labels it ignores, render to RAM off and why, the shader list and how it was recorded, plays.

`n64hub/BanjoTooieRecompiled-web` is Banjo-Tooie: Recompiled. The game writes thprof creating its threads
(N64ModernRuntime 2e6aa0a). Upstream ships the Suplexmentary Comic NC font in `assets/`, and the page loads it.
Upstream commits its recompiled code, `RecompiledFuncs/` and `rsp/n_aspMain.cpp`; the fork commits neither, as it is
derived from the ROM, and its desktop build makes both from the ROM as its page does (its README, What Is Not
Committed). Its list is 284 descriptions in 11 sections. The word at 0x800459C8 counts 30 a second in every world, not frames
drawn. The desktop build draws every world but Terrydactyland and Hailfire Peaks at 30. Upstream prints temporary
diagnostics of its own (`[tooie] step`, `[probe]`, `[sys-first]`, `[entry-probe]`, `[task1]` once a frame, 17,000
lines in a 2-minute play), which the fork takes out with the hooks that print them: its page's console holds the
page's own lines, the game's errors and the traces an environment variable turns on. It draws ~1,700 batches a frame in
Jinjo Village, 3-7 times Rush 2049's, and RT64 makes each one WebGPU calls on the page's thread, so with Chrome's CPU
throttled 6 times it is the slowest page there, its own draw count and not the web support (docs/findings.md, A page's
thread in Chrome, throttled). Its own patches go in first and the web's on top, so CI's `bt-patches` job runs its
`tools/build_web.sh --patches` on each PR: a web change that meets their lines is red there, not at its next build.
Its BUILDING.md and the headers of
`tools/build_web.sh`, `tools/shader_survey.js`, `tools/make_plans.py` and `src/rt64_shaders.txt` have the rest: how its
own patches and apply.cmake are layered and the files left out, the recompile with the web-patched N64Recomp, render to
RAM off and the leak it showed, the shader list and its survey, the frame rates per world and the page's pacing.

`n64hub/pilotwings-64-recomp-web` is Pilotwings 64: Recompiled. The IDO 5.3 and MIPS binutils its decompilation's
ELF is built with are in the Docker image. It is Fast3D, which RT64 draws on WebGPU unchanged. Without render to RAM
both framebuffers' RDRAM stays stale and equal, so `uvCopyFrameBuf`'s copy changes no byte and RT64's check of a
framebuffer's RDRAM before each list (`checkRAM`) sees nothing; the title's fade alternates black frames either way, so
that is not the page's. A game whose CPU copies into a framebuffer RT64 has never drawn, or reads one, still needs it.
Its list is 428 descriptions in 29 sections; with the menus in the boot (80) Firefox waited 18-37 s
before the first frame, split 7-9 s. Its docs/BUILDING.md (The web page) and the headers of `src/frontend.cpp`,
`patches/clocks.c`, `patches/sched.c`, `tools/shader_survey.js` and `tools/merge_shader_sections.py` have the rest: the
decompilation build and the patches, sound, render to RAM off and why, the clock waits, the shader list's sections and
how it was recorded, the scheduler's timeouts taken out, plays.

`n64hub/MarioKart64Recomp-web` is MarioKart 64: Recompiled (GPL-3.0), moved onto RecompFrontend as GoldenEye's is.
`patches.h` maps the game's patches onto rt64's newer extended GBI, and the debug natives they call are stubs.
Upstream's four workflows, native builds without a ROM, are disabled on the fork. Its boot logo draws with no tile,
which on WebGPU left the pipelines built behind the game without a binding their layout named (rt64 f01c3a6). Its list's
sections hold each of 16 courses and four arenas with four players. Its `tools/play_plan.json` is a 50cc Grand Prix's
first three races in one load on the game's own AI, each finish and results passed with A as a player goes on with the
cup, which no section of the list's plan plays. Its README and BUILDING.md, and the headers of `patches/gfx_config.c`,
`tools/shader_survey.js` and `src/rt64_shaders.txt`, have the rest: what moving onto RecompFrontend took, the Controller
Pak, the boot's first display list and its fix, render to RAM kept exact for the jumbotron, the shader list and how it
was recorded.

`n64hub/Starfox64Recomp-web` is Starfox 64: Recompiled (US 1.1, Rev A), moved onto RecompFrontend as Mario Kart
64's is: its `lib/rt64`, `lib/N64ModernRuntime` and `lib/RecompFrontend` are upstream's at the commits the forks are
built on (a row each in `patches/pins.txt`). Its settings (film grain, the radio box, inverted Y, the volumes) are on
RecompFrontend's General and Sound tabs; upstream's debug menu and quicksaves stay out. The cartridge is
MIO0-compressed: N64Recomp reads the ROM `tools/decompress_rom.sh` decompresses with the sf64 decompilation's tools
(`lib/sf64decomp`), and the program takes the plain dump and decompresses it in memory, as upstream's does. Render to
RAM is off: the CPU never reads a frame it drew (the motion blur is the RDP drawing over the last frame). Its CMake
makes `register_patches.cpp` depend on the patches' section table, which N64Recomp writes mid-build: without that an
incremental build after a patch moved stopped at boot ("Failed to find function at"; Mario Kart 64's CMake lacks the
same edge). Its list, 823 descriptions in 24 sections (the boot, the menus to the Lylat map, each planet, the warp
zones, the training, Venom's two routes and Andross, game over, Versus and the ending), is recorded by code:
`patches/shader_survey.c` hands a level, a phase or a game state from the script to the game's own change of state
(`gNextGameState`), with the player's shields kept full; a straight switch to the ending crashed until the survey set
it up as Andross's end does. Its `tools/play_plan.json` plays the menus to Corneria (Start skips the Lylat map's
prologue, A picks the planet) and a minute of it; `tools/play_plan_extended.json` goes on to Meteo and Katina, started
as the list's plan starts them. Its README, BUILDING.md and the headers of those files have the rest.

`n64hub/oot-recompiled-web` is OoT: Recompiled (GPL-3.0, NTSC-U 1.0), Ocarina of Time on a runtime and an interface
of its own: no RecompFrontend, its own RmlUi launcher and menus (`src/ui/`). Its `lib/rt64` and `lib/N64ModernRuntime`
are at Conker's commits, so `pins.txt`'s rows cover them. With no RecompFrontend it has no file picker of its own, so
N64Recomp-browser's `frontend/file_picker.h` (`n64recomp_browser::pick_files`) opens the browser's. Upstream shapes its
window to the launcher and to the game's aspect; the page leaves the window alone. A page opens in widescreen (Aspect
ratio at Expand to the window, the HUD within 16:9; the desktop build opens in the console's 4:3), and a page's
settings saved in 4:3 move to it once. A room drawn over a 4:3 picture (Link's house, the castle grounds) stays 4:3,
on the desktop too. The game reads the keyboard once a
frame at its 20 a second, so a script holds a key 150-300 ms. Its list, `src/rt64_shaders.txt`, is 564 descriptions in
24 sections, the boot 69. Its survey clears a new file's opening cutscene at the file select's hand-over, since clearing
it mid-cutscene hung the game on a black screen, and warps as a child or an adult by the play state's `linkAgeOnLoad`,
since the save's `linkAge` alone is overwritten. Its `tools/play_plan.json` loads File 1 as a player does and plays
Link's house and the pause menu; `tools/play_plan_extended.json` goes on to Lake Hylia, the graveyard and the Desert
Colossus by the survey's warp. With its survey waiting on a timer, Chrome's longest gap as the
file loads is under a second. Its BUILDING.md and the headers of `web/page.cmake`, `web/stubs.cpp`, `web/survey.cpp`,
`tools/shader_survey.js` and `src/rt64_shaders.txt` have the rest: what differs on a page (the launcher, the window as
the canvas and dp scaling, the first run's defaults), render to RAM kept exact for the pause background, the shader list
and its survey, the warps.

`n64hub/JetForceGemini-Recomp-web` is Jet Force Gemini: Recompiled, VibinToast's, and merges his releases (v1.2.2):
his launcher (RmlUi, no RecompFrontend), options, profiles and renderer are the fork's. His `lib/` pins his forks of
rt64, N64ModernRuntime and N64Recomp; the page's are upstream's at the commits N64Recomp-browser patches, with the web
support and then his changes made again for those commits on top (`patches/web/rt64.patch`: F3DDKR, Dinosaur Planet's
and the game's own changes, bloom, SSAO, fog, the vignette and the soft shadows, over the newer imgui and implot his
rt64 pins; `patches/web/N64ModernRuntime.patch`; `patches/web/N64Recomp.patch`), and `patches/web/dkr.patch` is the
page's code in his (the canvas, the menus' WGSL shaders, sound on the browser's audio thread, the file picker, rumble
through the Gamepad API, the dummy frame kept out of RDRAM as RecompFrontend 75fe596 does), all applied in a clone of
the checkout by `tools/build_web.sh`. The game binds draw buffers the workload hasn't made before the first one does,
which WebGPU refused until rt64-web f01c3a6 bound a zeroed one. Its `rt64.patch` is his renderer, so it can't move into
rt64-web, and it goes on top of the web's: CI's `jfg-patches` job runs its `tools/build_web.sh --patches` (the whole
patch step, no ROM) with the PR's checkout, so a change here to the lines it touches is red in its own PR and is
settled there, by rebasing the fork's patch or keeping the web's lines off its. Its list, `src/rt64_shaders.txt`, is
727 descriptions in 16 sections, the boot 40 and a planet 20-86 descriptions each.

The page opens widescreen, at Game Frame Rate 60 and with Frame Interpolation at Monitor, where his desktop build opens
4:3 at the game's own pacing without Frame Interpolation, and moves a page's settings saved before it did to those once
(`page_defaults` in its options file). RT64 interpolates in play since rt64 179adb8: the game draws its shadows' render
targets in a display list of its own before each frame's, which RT64 took for a frame, so the frame after it matched
nothing and was never interpolated, and its frames take 2 and 3 VIs on a page, which upstream's original rate needs
equal. His runtime holds the game thread that submits a display list until the graphics thread has drawn it (upstream's
never waits there), which held the whole game through render to RAM's exact copy. The game rebuilds a list's memory as
soon as it has submitted it, so the page copies RDRAM's 8 MB at the submit and lets the game go, RT64 reading the list
from the copy (as DKR-R-web's runtime does) and writing render to RAM's copies to the game's RDRAM and the copy both.
Its scheduler, the thread that submits the lists, starts a sound task only once the graphics task has left the RSP,
yielding the graphics task, which the runtime answers with its completion: the page sends the RSP's completion as the
graphics thread takes the task, and the RDP's once the frame is drawn, which needed N64ModernRuntime 66539ab (the game
leaves a controller message blocked for good, and the RDP's completion, alone, waited behind it for the next retrace).
With the RSP's completion once the frame was drawn, the page at 60 ran 130,000-260,000 sound frames short over the plan
uncapped (headless Chrome 155, 3840x2000, RTX 2070); with it once RT64 had read the list, the scheduler held until
then, 14,600-25,500, where the GPU is busiest and RT64 reaches a list behind 2-3 others; with the copy, 0, against
18,745 and 21,178 on that page in two interleaved pairs. Its BUILDING.md and the headers of `tools/build_web.sh`,
`tools/shader_survey.js`, `tools/make_plans.py` and `src/rt64_shaders.txt` have the rest: how his code and patches are
built into a page, the recompile without call tracking, render to RAM kept exact and why, the list read from a copy of
RDRAM, the scheduler hook, the frame rates, the shader list and its survey.

`n64hub/DKR-R-web` is DKR-R (MIT, 1.0.8 and its main to d94b05f), on a runtime and a launcher of its own (ImGui, no
RecompFrontend). `dependencies.lock.json` pins rt64 at Banjo's commit and N64ModernRuntime ae1ffbb. Its checkouts carry
DKR-R's patches before the web's, so `pins.txt` has no row for it: CI's `dkr-patches` job runs its
`scripts/build_web.sh --patches` (DKR-R's patches, `apply.cmake` with its skip list, `patches/web/`, and DKR-R's
configure-time stages, no ROM) with the PR's checkout, against DKR-R-web's main. A conflict there is settled in
DKR-R-web (the skip list, `patches/web/`), as v0.57.0's held messages in `mesgqueue.cpp` were (DKR-R-web 8a2ac6b), or
by keeping the web's lines off DKR-R's in the fork. Where both change a file (rt64's RasterPS.hlsl,
TextureSampler.hlsli, `rt64_raster_params.h`, the shader library, the game frame and workload queue), its
`patches/web/<project>.patch` makes the web's change, merged from the commit `scripts/build_web.sh` names
(`web_merged_from`), and what the web has changed in them since is merged in by `apply.cmake --since`. Before it named
one, a change here to those files reached the page only once that patch made it too: rt64 0560318's decal bounds did,
but the workload queue went without the offscreen passes, the pipeline warm-up and the capped interpolated targets, and
the runtime read the ROM 1 KB at a time, until v0.82.0. N64ModernRuntime's `mesgqueue.cpp` takes DKR-R's alone, without
the web's held messages (66539ab): DKR-R's own `runtime-deferred-events.patch` does the same, a blocked external
message kept in a list of its own until a receive frees its queue, and is staged over that file at configure time.
rt64-web 0a9fcb6 keeps the web's lines off those DKR-R's and Jet Force Gemini's patches change, as 03b9dcc and d5121c9
do for Conker's, and 3c6a1cc off those where they and Snap64's add their includes. rt64 9086c93's frame matching by
each hash's group of calls replaces the loop DKR-R's `patches/rt64/0007` changes, so `patches/web` takes the web's
loop with 0007's look at condition where each side's calls are collected (DKR-R-web 2bd6689). A first run plays DKR-R's Modern profile, the only one that interpolates (Accurate, the desktop's
default, holds RT64 at Original and 30), widescreen as Modern is by default (a first run's settings would give it the
runtime's starting 4:3), and a profile the player saves from DKR-R's overlay is kept: the overlay opens on a page
(Escape, F1, a controller's Back) through rt64-web's inspector on plume (8b9dce2), without online play, its restart
and exit, or its CRT filters, which need images the inspector on a page doesn't draw. Modern goes with its
Match display passed on as RT64's Display, since SDL's Emscripten port reports no refresh rate. DKR-R's updater is left
out: a page is updated by its site. `record_shaders.mjs --from` goes on with a recording of its list stopped partway.
The list was recorded in Accurate; in Modern, recorded with `?record-shaders` over the title, the menus, Timber's
Island and Dino Domain, the game asked for 119 descriptions, all in it but one, which differs from one in it only by
the culling bit. Its docs/WEB.md and the headers of `scripts/build_web.sh`, `web/shader_survey.js` and
`web/rt64_shaders.txt` have the rest: how its patches and the web's are layered, the launcher, sound, input focus,
render to RAM off, the fixed heap, the shader list and how it is recorded by the game's teleport, the play plan.

`n64hub/Snap64Recomp-web` is Snap64 Recomp (1.1.5), Pokémon Snap (US), on its port's own forks of rt64, plume and
N64ModernRuntime (their `snap64` branches), the one game fork whose rt64 isn't upstream's: ~8,000 lines of the port's
in RT64 (each object's identity for interpolation, its frame pacing and presentation, Photo Detail's framebuffer
readback, the Snap Station's overlay, primitive-depth sprites). `apply.cmake` patches them, but for the files where
both change the same lines (`patches/web/files.txt`, 24 of rt64's and 6 of the runtime's), whose web change is its
`patches/web/<project>.patch`, merged by hand. Its `tools/build_web.sh` then takes what N64Recomp-browser has changed in
those files since that merge (`apply.cmake --since`, README), and stops only where that meets the port's own lines:
that is merged into its patch by hand. CI's `snap-patches` job runs its `tools/build_web.sh --patches` (that step, no
ROM) with the PR's checkout, against its main, so a web change that meets the port's lines, in a file left out or one
that isn't yet, is red in the PR that makes it and is merged into `patches/web` there (a new file added to `files.txt`). On v0.70.0 rt64-web had changed 9 of the then 13 files since its patch was written, which
the build had left out with nothing said. Two of that merge's choices: in `rt64_vi.cpp` frames of uneven VIs
interpolate as the web has them (rt64 179adb8, 7844c07) and the port's last measured rate is what's left, in place of
0; in `RasterPS.hlsl` a decal pipeline with `DECAL_DEPTH_BOUNDS` writes the web's bound as its depth (rt64 0560318), and
every other the port's depth. In `rt64_gbi_rdp.cpp`'s full sync the port's focus dot draws first, as the frame's last
draws, and then the web's check whether the list ends there (rt64 1c9e639). HAL's object manager runs each object on a
thread that stops itself, which the libultra
thread stop ignored a start of (N64ModernRuntime-web 6515ea8). Render to RAM keeps the exact copy but in the title's
film and attract demo: a course's focus dot is found in the frame just drawn, and Oak's check, the album and the
report score a photo from the buffer it was just rendered into, outside a course. Nothing scores the film's frames or
the demo's (a course played from its recorded script, whose focus dot comes a frame late), so while the film's routine
runs or the demo plays the copy lands a list late (renderToRAMLate), which on a phone spares their lists the wait for
the GPU (docs/phones.md, Pokémon Snap on a Galaxy S21). A play shows no kept writes. It
opens widescreen, RT64's Expand in a course as the desktop's Widescreen setting draws it (off on the desktop):
the setting is on with Emscripten, and a page's settings saved before, whose Off no player chose, are turned on once.
The fork widens the forest film the title opens with too, which the port leaves 4:3: it runs from the title's own
code, not a course's, so its routine is wrapped and the picture is wide while it runs (its `src/overlay_hook.cpp`).
The title, Oak's lab and the other 2D screens stay pillarboxed, since their art ends at 320, and the film's first
shot has a dark strip past the 4:3 edge at the left, where its sky ends (its docs/KNOWN-ISSUES.md).
Its list is 199 shaders, the boot and 9 sections (the menus, a section a course, the report screens), recorded by
code but for three Firefox plays missed: `web/survey.cpp` starts a course from the main menu and `web/shader_survey.js`
rides it to its end, taking photos and throwing the items. Its docs/WEB.md and the headers of `tools/build_web.sh`,
`web/page.cmake` and `web/rt64_shaders.txt` have the rest.

`n64hub/rush2recompiled-web` is Rush 2 Recompiled, Rush 2: Extreme Racing USA (US), whose repo has no license
(CLAUDE.md, Rules). It is on its own commits of rt64, N64ModernRuntime and RecompFrontend, which its
`lib/patches/<submodule>.patch` change (4,900 lines on rt64's 46 files: car reflection and ambient occlusion shaders,
the Variable frame rate's timeline, generated mipmaps, MSAA's coverage), patched by the N64Recomp-browser tag its
`lib/N64Recomp-browser` pins. Its `tools/build_web.sh` applies Rush 2's patches first, then `apply.cmake` project by
project, but for the files where both change the same lines (`web/patches/files.txt`: 11 of rt64's, the runtime's
`config.cpp` and `events.cpp`, 2 of RecompFrontend's), whose web change is its `web/patches/<project>.patch`, merged by hand, and what N64Recomp-browser
has changed in them since is merged in by `apply.cmake --since`, as Snap64's is, and CI's `rush2-patches` job runs its
`tools/build_web.sh --patches` on each PR as `snap-patches` does Snap64's. One of them applies as is but names what the port renamed (`ui_mod_menu.cpp`), so it is listed too. Two of
the merge's choices: Rush 2's generated mipmaps and texels of a region of a larger image are read through the web's draw
texture slots (`sampleTileTextureGrad()`, `loadTileTexture()`), and `RasterPS.hlsl`'s coverage output (`SV_Coverage`)
is left out of a page's shaders, since naga takes no sample mask output and the page draws one sample a pixel. Its
texture cache binds a generated-mipmap texture with no view as the decoder's storage target for the first level, which
plume 827a073 binds as that level, as D3D12 does (before it every race drew black, 10,208 WebGPU errors in one play).
The page leaves out online play, for
`src/online/online_web.cpp`, an offline machine to the game, the texture upscaler, which starts a program, and N64:
Recompiled code mods. Render to RAM is off: nothing in the game reads a frame back, and on a phone the exact copy
held its demos to half the game frames (docs/phones.md, Rush 2 on a Galaxy S21). Its list is 82 shaders: the boot (the launcher, the title and the menus, 37) and 9 sections (the
title's demos, a race on each of the 7 tracks, a stunt course), recorded by `web/shader_plan.json`, which drives the
menus by the front end's screen and the track select's entry in RDRAM. Its docs/BUILDING.md (The web page) and the
header of `tools/build_web.sh` has the rest.

`n64hub/1080-Snowboarding-recomp-web` is 1080° Snowboarding: Recompiled, 1080° Snowboarding (USA), GPL-3.0. It is
on cdlewis's rt64, N64ModernRuntime and RecompFrontend, the ones Snowboard Kids' recomps are on, which its own
`patches/runtime/` change further (rt64's camera cuts and the stale write-backs it skips, a projection depth remap,
the HD boards' per-texture scale), patched by the N64Recomp-browser tag its `lib/N64Recomp-browser` pins. Its
`tools/build_web.sh` applies the game's patches first, then `apply.cmake` project by project, but for the files where
both change the same lines (`web/patches/files.txt`: 11 of rt64's, hlslpp's `wasm.h`, N64Recomp's `cgenerator.cpp`,
RecompFrontend's `profiles.cpp`), whose web change is its `web/patches/<project>.patch`, merged by hand, and what
N64Recomp-browser has changed in them since is merged in by `apply.cmake --since`, as Snap64's is, and CI's
`snowboarding-patches` job runs its `tools/build_web.sh --patches` on each PR as `snap-patches` does Snap64's. Its rt64 is
newer than the web's: its texture decoder is shared with the CPU (`src/shared`, which calls TMEM's sizes
`TMEM_RDP_*`), and with `RT64_UNEVEN_FRAME_RATES` the web's rate for uneven frames is used in `rt64_vi.cpp`, the
game's otherwise. The page leaves out RetroAchievements, which needs a server, and MSAA, and keeps every other
option at the desktop's defaults. Its list is 54 shaders: the boot (the launcher, the intro, the title and its demo,
the menus, 43) and 4 sections (Crystal Lake's Match Race, Time Attack on Crystal Peak and Golden Forest, Training),
recorded by `tools/shader_plan.json`, which knows where the game is by its loaded modules (`tools/game_state.js`). Its
BUILDING.md and the headers of `tools/build_web.sh` and `web/rt64_shaders.txt` have the rest.

`n64hub/perfect-dark-recomp` is Perfect Dark (USA rev 1), not a fork but this project's own recomp, as Rush 2049's
is (GPL-3.0), made from the game's MIT decompilation. It is on upstream's rt64, N64ModernRuntime and RecompFrontend at
the commits GoldenEye's are on (`patches/pins.txt`), patched by the N64Recomp-browser tag its `lib/N64Recomp-browser`
pins, and carries no patches of its own to them, so CI has no job for it. Perfect Dark runs its lib segment at
0x70001050 and its game code at 0x7f000000 behind the TLB, where N64Recomp's memory macros index RDRAM by address -
0x80000000, so the decompilation is relinked without the TLB (`tools/relink.ld.patch`), each segment where it already
sits in an 8 MB console's RDRAM (lib at 0x80001050, game at 0x80220000, where the game's own 8 MB path unzips it), and
the recompiler reads its code from that relink. None of the relink is in git: at run time the game's own inflate
unpacks the player's ROM, and the relocation list, `syms/relocs.txt` (6,482 words, found by linking at two bases),
shifts the pointers outside `.text`, after which RDRAM is the relink byte for byte outside `.text`. Backing the 0x7f
addresses as Conker's page does was ruled out: it needs RDRAM plus 0xFF000000, past wasm32's 4 GB. RT64 draws its
graphics as they are but for the sky's clouds and water, raw RDP triangles RT64 drops, which `patches/sky.c` draws as
3D triangles as GoldenEye's recomp does. Its audio microcode is Rare's `aspMain` with an MP3 decoder overlaid on it,
which RSPRecomp swaps in where the code DMAs it, and the program drops whole audio frames, never part of one, when
more than 100 ms is queued. Its build, `tools/build_decomp.sh` (the decompilation checked against the ROM, the
relink, the list and the symbols) then `tools/build_web.sh`, runs Docker images of its own, so `publish_pages.sh`
runs it on the build host and not in rush-2049-recomp's image. Its list is 702 shaders, 278 pipelines: the boot (42)
and a section a solo mission (21), recorded by `tools/record_shaders.sh`, where `patches/shader_survey.c` starts each
mission as mission select's Accept does, plus 74 the plans' plays, the publish's boot check, a minute in each
mission and a route through 12 of them missed afterwards. Its docs/building.md and docs/web.md have the rest.

`n64hub/super-mario-64-recomp` is Super Mario 64 (USA 1.0), not a fork but this project's own recomp, as Rush
2049's and Perfect Dark's are (GPL-3.0), from the n64decomp/sm64 decompilation's symbols, with RecompFrontend's launcher
and menus. It is on upstream's rt64, N64ModernRuntime and RecompFrontend at the commits Majora's Mask's are on
(`patches/pins.txt`), patched by the N64Recomp-browser tag its `lib/N64Recomp-browser` pins, and then by its own
`runtime-patches/` (RecompFrontend's built-in texture packs, for its Hi-res Font), which change files the patches change
too, so CI's `sm64-patches` job applies them over the patches on each PR. Its patches (MIPS C against the
decompilation's headers) tag every matrix for RT64's interpolation, by graph node and object, widen the view, the HUD
and the sky to the window's shape, and keep a few modern options, each with an Original value; the page keeps them all
at the desktop's defaults (Hi-res Font Original, Draw Distance High), which cost it nothing measured. Render to RAM is
off: the game never reads a frame it drew. IDO narrows a char or short argument in the function that takes it, so a
patch replacing a game function whose caller passes a wider value takes it as a word. Its `tools/build_web.sh` runs a
Docker image of its own, so `publish_pages.sh` runs it on the build host and not in rush-2049-recomp's image. Its list
is 198 shaders, 147 pipelines: the boot (the launcher, the logo, the title's Mario head, the file select, 29) and 33
sections (the castle grounds, the castle's floors, the courtyard, the 15 courses at each act, the secret and Bowser
stages, the ending), recorded by `tools/record_shaders.sh` and `tools/shader_plan.json`, which warps Mario into each
from the castle grounds through the survey in `patches/shader_survey.c`, with the misses of the plays added by hand,
those of `tools/play_plan_full.json` among them: a play of the whole game (every act's star, the three Bowsers, the
ending and the credits) in about 56 minutes, for what the regular plans never reach. Its README, CLAUDE.md and
docs/web.md have the rest.

`n64hub/f-zero-x-recomp` is F-Zero X (USA), not a fork but this project's own recomp, as Rush 2049's, Perfect Dark's
and Super Mario 64's are (GPL-3.0), from the inspectredc/fzerox decompilation's symbols, with RecompFrontend's launcher
and menus. It is on upstream's rt64, N64ModernRuntime and RecompFrontend at the commits Majora's Mask's are on
(`patches/pins.txt`), patched by the N64Recomp-browser tag its `lib/N64Recomp-browser` pins, and then by its own
`runtime-patches/` (RT64 drawing the game's own microcode, F3DFLX2, as F3DEX2 plus its alpha light, which gives the
machines their paint and shading), which change files the patches change too, so CI's `fzx-patches` job applies them
over the patches on each PR. Its patches (MIPS C against the decompilation's headers) split each camera's combined
projection and view for RT64's interpolation and tag the racers by who they are, with RT64 blending a camera's eye
on the line between its two places (`RT64_INTERPOLATE_CAMERA_EYE`, on for its desktop build too), widen the race's
sky to the window's shape, and open a race's views of one or two players to the picture's edges: the game's scissor
keeps them in from 4:3's (the black border a console shows too), which RT64 keeps as far in from the window's, so
its `Camera_Draw` sets them with `gEXSetScissor` from the edges; its menus' frame, 12, 8, 308, 232, is enlarged to the
whole picture after each menu draws, the framebuffer drawn back over itself as a texture a few rows at a time, which
RT64 takes from what it drew. A second depth clear over the whole race picture cost a quarter of the presents at 4K and
set off a crash in render to RAM's read buffers, so the race keeps the game's own. Its race HUD is placed from the
picture's edges by N64Recomp text hooks at the start of each function that draws a part of it, which write RT64's
`gEXSetRectAlign` and an edge-aligned scissor into the game's display list: none of its 227-line HUD function is
copied. Its `tools/build_web.sh` runs a Docker image of its own, so `publish_pages.sh` runs it on the build host and not in rush-2049-recomp's image. Its list is 76 shaders: the
boot (the launcher, the title and the main menu, 6) and a section for each of the 24 courses of the four cups, 53-63
each and most of them in every one, recorded by `tools/record_shaders.sh` and `tools/shader_plan.json`, which writes
the course at machine select where the race reads it and has the computer drive player 1's machine, as its play plans
do. Its README, CLAUDE.md and docs/web.md have the rest.

## The games' own frame rates

A page presents at the display's rate whatever its game runs at (CLAUDE.md, Rules). The game's own rate, set by the
game forks' code: Rush 2049 60 (its Game Frame Rate, Original 30), Perfect Dark up to 60 (as the game ticks at most
once a VI; its controller reads held it to 30 on a fast CPU, which its `patches/frame_rate.c` undoes), Pilotwings 64 60 (a variable timestep), Diddy Kong
Racing 30 (DKR-R's Accurate profile, the desktop's default, holds RT64 at Original; the page plays Modern), Jet Force
Gemini 30 dropping to 20 when a frame runs long, or 60 (its Game Frame Rate, 60 on a page: 54-59 at the display's 60
and 18-30 uncapped at 3840x2000, against 29 and 17-19 at the game's own pacing), and the
cartridge's for the other eleven: F-Zero X 60 in a one-player race, Super Mario 64 30, Rush 2 30, Majora's Mask 20, Banjo-Kazooie 20-30, Donkey Kong 64 30, Banjo-Tooie 30
(Terrydactyland 12, Hailfire Peaks 10), Wave Race 64 20 in races, Star Fox 64 30 (20 where a scene sets 3 VIs a
frame), GoldenEye's and Conker's variable. None of the eleven has an option to run faster.

A game fork may take a change that runs its game faster when that makes the page play better. Weigh it: logic at 60
gives lower input lag, motion the game computes rather than RT64 interpolates, and what interpolation misses (some
particles and 2D), but no more presents, and it doubles the game's CPU work and RT64's per display list (4-12 ms each
on a page), which a laptop's CPU pays for. For the frame rate on screen, or to measure a page, it buys nothing.
