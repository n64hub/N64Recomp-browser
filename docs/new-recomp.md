# The checklists: a new recomp's and a web port's

Two lists of what a game is played and checked for before it is called done, and a record of where each game stands
against them. A new recomp of this project's own is checked against both: its own list (items 1 to 8), desktop build
and page alike, and the web port list (W1 to W11) for its page. A game fork, a web port of someone else's recomp, is
checked against the web port list. Each item is here because it turned up in a game after that game had been called
done, most of them in a part of the game nobody had played yet. So a game isn't done until each item has been played,
not reasoned about: the first level alone hides most of them. The new recomp's items are in order, the first two first.

How to play and record a page is docs/playing.md; what the web needs of a port (the shaders, Emscripten) is
docs/porting.md, and the steps a port takes the README's Using it in a recomp.

## Keeping them

The lists and the record are kept by the work that plays the games, in the same PR as that work:

- A problem found in one game that another game could have too (a bug a game was called done with, a step a port
  missed, a check that would have caught it) is added here: a line under the item it belongs to, or a new item. Each
  says what to play, what to look for and the game it turned up in, and points at where the fix is written rather than
  saying it twice. A finding only one game can have goes in that game's own docs instead.
- Labels (`4b`, `W3`) are never renumbered or reused, since game repos and commits cite them: a new line takes the
  next letter under its item, a new item the next number.
- An item added or changed is backchecked on this project's own recomps: the work that adds it puts its label in the
  Left cells of every own recomp in the record it can apply to and files work to play it on them (one piece for every
  recomp it reaches, or one a recomp where each needs its own fix), unless it plays them itself. A game fork isn't
  backchecked: it is someone else's recomp plus the same web support the own recomps run, so their plays check that
  support, and a backcheck across every game fork cost more than it found. A game fork's row keeps what its port left,
  and a later item reaches it only when work on that game plays it.
- A play of a game for an item (a backcheck, a port, a fix, the retest) updates that game's row: the label leaves Left
  when the play shows it passes, or stays marked "fails" while the fix is filed. An item a game can't have (item 3 in
  a game of one player) leaves its row, and the game's own docs say why.
- A new port or recomp gets its row in its port's work, every label that applies in Left, each removed only once played.

## Where each game stands

Left is what hasn't been played for yet or fails (marked); an empty cell is every item played and passing. The rows
were first filled from what each game's docs, pull requests and `plays.jsonl` showed had been played, so a backcheck
reads its game's own docs first: a check can have been done without being named. W2, W5, W6 and W7 had been played as
items by almost no game when the record began.

| Game | New recomp: left | Web port: left |
|---|---|---|
| San Francisco Rush 2049 | 4c fails, 8a fails | W5, W6's Drive |
| Perfect Dark | 1, 2, 3, 4b, 4c, 5a, 5b, 6a, 6b, 8a fails | W5 fails, W6's Drive, W9 |
| Super Mario 64 | | W5 fails, W6's Drive |
| F-Zero X | | W6's Drive |
| Mario Party | 4c, 5b, 6a, 6b fails, 8a, 8b, 8c fails | W6's Drive, W8 |
| Mario Party 2 | 4c, 5b, 6a, 6b fails, 8a, 8b, 8c fails | W5 fails, W6's Drive, W8 |
| Mario Party 3 | 4c, 5b, 6a, 8a, 8b, 8c fails | W6's Drive, W8 |
| Super Smash Bros. | | W6's Drive |
| Paper Mario | 4a, 4c, 6b | W5 fails, W6's Drive |
| Rayman 2 | | W5 fails, W6's Drive |
| Donald Duck: Goin' Quackers | 2, 5b | W5 fails, W6's Drive |
| Dinosaur Planet | | W5 fails |
| Turok: Dinosaur Hunter | 5a | W5 fails, W6's Drive |
| Turok 2: Seeds of Evil | 2 fails, 4c, 5a | W5 fails, W6's Drive |
| Turok 3: Shadow of Oblivion | 4c, 5a | W5 fails, W6's Drive |
| GoldenEye 007 | | W2, W5 fails, W6, W7 |
| The Legend of Zelda: Majora's Mask | | W2, W5, W6, W7 |
| Banjo-Kazooie | | W2, W5, W6, W7 |
| Conker's Bad Fur Day | | W2, W5, W6, W7 |
| Donkey Kong 64 | | W2, W5, W6, W7 |
| Wave Race 64 | | W5, W6, W7 |
| Pilotwings 64 | | W2, W5, W6, W7 |
| Banjo-Tooie | | W2, W5, W6, W7 |
| Mario Kart 64 | | W2, W5, W6, W7 |
| Star Fox 64 | | W2, W5, W6, W7 |
| The Legend of Zelda: Ocarina of Time | | W2, W5, W6, W7 |
| Diddy Kong Racing | | W2, W5, W6, W7 |
| Jet Force Gemini | | W2, W5, W6, W7 |
| Star Wars Episode I: Racer | | W2, W5, W6, W7, W9 |
| Pokémon Snap | | W2, W5, W6, W7 |
| Rush 2: Extreme Racing USA | | W2, W5, W6, W7 |
| 1080° Snowboarding | | W2, W5, W6, W7, W9 |
| Space Station Silicon Valley | | W2, W5, W6, W7, W9 |
| Tony Hawk's Pro Skater 2 | | W2, W5, W6, W7, W9 |
| Star Wars: Rogue Squadron | | W2, W5, W6, W7, W9 |
| Beetle Adventure Racing! | | W2, W5, W6, W7, W9 |
| Turok: Rage Wars | | W2, W5, W6, W7 |
| WWF No Mercy | | W2, W5, W6, W7, W8, W9 |

What the fails are: 4c's pads are played with two stand-in pads of one id (W7's `unplugPad` and `replugPad`). On
Super Smash Bros.' page a binding written to the controls file is read back after a restart and kept through each pad
pulled out and plugged in again, both pads reading the one profile their model shares; where each pad plays a port
of its own (item 3) a pad plugged in again took the last port, and the pads after it moved up one while it was out,
and a pad plugged in again at a lower place than another of its model rumbled that one (Rush 2049's page: all of a
two-player race's rumble on pad 2). RecompFrontend ebd361b, 9fc3d68 and 74eb087 (docs/forks.md) fix both, and give an
assigned or joined player back their controller: on builds of them Super Smash Bros.' pads keep ports 1 and 2 through
each replug and restart, and F-Zero X's four rumble each, the first two plugged in again, so both pass 4c. Perfect
Dark, the Mario Parties and Turok 2 and 3 play their pads by the same code, and 4c is left for their next pin move's
play. Rush 2049's pads join on their first press and already came back to their players on its page (its runtime
patch RecompFrontend-0004, the same as 9fc3d68), but its rumble fails until its pin takes 74eb087. Where every pad
plays port 1 the ports pass, so Super Mario 64 and Turok: Dinosaur Hunter, whose keyboard half was played (a key added
on the Controls tab kept across a quit and a restart, walking the Turoks' player forward), pass 4c, and Paper Mario's
keyboard half is left;
Turok 2's desktop build drops its map from some of the frames Frame Interpolation adds at Manual 120 while the player
moves, 5-13 of 75-80 captures, with `RT64_GAME_FRAME_WORKLOADS` on or off and none at Original (filed); the Turoks' 5a is unplayed: none of the three writes its Controller Pak before a save
point in a level (`saves/controllerpak_0.mpk` stays absent through their boots, intros and attract demos, and
turok-engine writes the pak only on a change), and no save point was reached near Turok 1's or Turok 2's start; the Mario Parties' READMEs don't link their pages (8c); F-Zero X's page in Firefox loses
none in its boot's first 10 s built on v0.201.0 but inside its own silence (0.6-2.5 s from Pages on v0.184.0, as
section boot's shaders were built with the game waiting), and none after its tab is hidden and shown in either
browser, so it passes W5: the 2.4 s it loses in the 2.6 s its first race's section takes to build 45 shaders is a
later section's wait, which W5 doesn't count;
Dinosaur Planet's page still loses 315-816 frames in its sound's first second in Chrome on first visits, where its
first audio tasks come late (filed), and none after it since the ring's count leaves out the browser's burst, and the desktop
build loses 22 ms as its sound starts, none at the logos since plume-web e69d031 (docs/findings.md, Compute pipelines
built at their first dispatch), and in Firefox, since plume-web 4381169 none at its first 3D, and since plume-web
0ac34ab 1-2 thousand frames at its menu, where Firefox built RT64's ubershader in line (71-83 thousand); Super Mario 64's page in Chrome loses about 95 ms in its boot's first 0.2 s
and at 3.4 s inside its own silence, where the game's sound code makes nothing as it reloads, and 3-85 ms of its logo's
fading sound at 0.5-0.6 s in 4 of 10 plays, where the ring is still refilling (none in 10 plays since, and the
browser's burst left out of the ring's count cuts less of the logo's sound at its 6 s reset, 1 play of 5 against 4; W5); Paper
Mario's boot loses sound in both browsers only inside its own silence, which lasts until its intro stage's music, but
its tab hidden in its intro loses 16-32 ms of that music in Chrome in some plays, as the present thread waits for a
present in flight (filed), and in Firefox the intro story's own shaders, which RT64 builds a few at a time with the
game waiting, break up its music for 0.1-0.3 s a dozen times (W5); the Mario Parties' pages in Firefox lose
none in their boot's first 10 s built on v0.200.0 (66k-108k from Pages on v0.184.0, as section boot's shaders were
built with the game waiting), and built on v0.201.0 each came through its tab hidden 30 s and shown again on a GPU
94-96% busy, Firefox's GPU process at 2.0-2.3 GB while hidden and the page back within 5 s, none short after but
Mario Party 3's 132 frames in 1 play of 2, where that play lost thousands before the hide too; on v0.200.0, and from
Pages on v0.184.0 until their pins move, none drew for 25-60 s after the show on a busy GPU, Firefox's GPU process
grown to 9-11 GB while hidden by the frames interpolated for presents a hidden page skips, which rt64 edd5da8 no
longer draws; with the GPU to themselves, from Pages, they came through, but Mario Party 2's 59k short there the
1.4 s its section Minigames13's 34 shaders took, a later section's wait, which W5 doesn't count, so Mario Party 2
passes it;
Mario Party 1's and 2's desktop builds drop about 22 ms of sound every few seconds whatever the window does, none
more for a drag (6b, filed). In Firefox, where every page's boot section was built
with its sound started (0.1-11.7 s short in the first 10 s on 37 pages of 38), it is built before the game starts
since rt64 c5ced59: GoldenEye's page loses 0.8 s there, against 7.9-9.1 s from Pages, which may be play_page.mjs's
own memory report (filed), and Rush 2049's 3.2-4.2 s, its race section's 8-9 s wait coming in those 10 s, a later
section's wait, which W5 doesn't count (docs/findings.md, Firefox's boot wait and the first sound). What Rush 2049
lost after its tab was hidden and shown again (412 frames in Chrome, 1,013-12,259 in Firefox, uncapped) wasn't the
hide's: its race lost as much visible and none hidden, each loss where the runtime held the game at a list RT64 took
long over (docs/findings.md, A page in a hidden tab). Since its page keeps 100 ms of sound queued (its src/main.cpp),
it passes W5: capped at 3840x2000 and hidden 30 s, none short after the show in 4 Firefox plays of 4 (main 3,935 and
110 in 2 of 4, at the attract race's end) and 2 Chrome plays of 3, the third 10,259 on a GPU shared with two other
plays and a process outside the machine's queue (plays.jsonl set rush-queue-100-capped). Uncapped, where its race
keeps an RTX 2070 98% busy by itself, Firefox still lost 1,689 in 1 play of 2 (main 1,350-7,740 in 3 of 3): a GPU
too slow for most of the game's lists, which no queue covers.
The own recomps' backcheck of W2, W5, W6 and W7 (`--backcheck`, from Pages built on v0.184.0, Dinosaur Planet's on
v0.190.0 and the Turoks' on v0.186.0-v0.187.0): every page opened Load ROM at its first click at 2x (W2) and kept its
saves, the game's own and a file planted in `saves/`, through a reload and the browser closed and opened again (W6,
whose Drive half, a signed-in player's, is played by hand and left), and the stand-in pad drove every launcher and
plan, Super Mario 64's rumble reaching it 67 times (W7; the Turoks' plans needed `padKeys` for their own pad layout,
Left Ctrl, Tab, E and Q their pad's right trigger, North and shoulders). Every page lost sound in Chrome's boot's
first 10 s, 79-710 ms, counted then without asking whether the game was silent there; `--backcheck` now leaves out a
short quantum with nothing played in the 20 ms before it (`tools/audio_probe.js`), and built on v0.203.0 Mario Party
lost none there, Super Smash Bros. 196 frames and Mario Party 2 808, all inside their own silence, so none of the three
loses sound in Chrome's boot (Super Smash Bros. none in Firefox's either, nor after its tab was hidden in either
browser: it passes W5), and in Firefox's 0.3-10 s,
its boot section's shaders built with the game waiting, which rt64 c5ced59 builds before the game starts; after the
tab was hidden 30 s, Chrome's pages lost 0-972 ms (Turok 3 972, Super Smash Bros. 193, Mario Party 3 167, Dinosaur
Planet 94), and Firefox's 1.1-6.4 s on Rush 2049, Mario Party 2 and 3, Donald Duck, Dinosaur Planet and Turok 3, whose
Pages predate rt64 edd5da8 (the Mario Parties built on v0.201.0 lost none there; W5, which F-Zero X passes on
v0.201.0, above). Built on v0.203.0, Mario Party 2's page in Chrome lost 40 ms of its music 2.2 s after its tab was
shown again, where Pages on v0.184.0 lost none (filed with Rush 2049's loss there), so it fails W5 again.

## A new recomp's list

A game the item can't apply to (a single-player game and item 3) says so in its own docs.

### 1. Widescreen, with the HUD at its sides

The page opens widescreen (RT64's Aspect Ratio at Expand, docs/game-forks.md has each game's), and the desktop build
offers it. The 3D reaches the window's edges at 16:9 and at 21:9, and the HUD is anchored to the wide picture's sides
and corners, not left in a 4:3 box in the middle: RT64's `gEXSetRectAlign`, `gEXSetViewportAlign` and edge-aligned
scissors written into the HUD's display list as the game draws each piece (Jet Force Gemini's Screen Corners), or a
game engine's own hooks (turok-engine's `docs/widescreen.md`). Text that crosses the middle stays whole, not split
between the two sides. A scissor set around the HUD covers every scissor the frame's 3D drew with, or RT64 stops
widening the 3D (Super Smash Bros.' `patches/hud.c`). The game culls to its 4:3 view, so its culling is widened to the
picture's.

### 2. A graphics sweep, played past the first level

Played on the desktop at 4:3, 16:9 and 21:9 with Frame Interpolation on (at a display rate above the game's, 120 Hz
where it can be had), at a high resolution (where seams show), and on the page in Chrome and
Firefox, with captures or clips of what is found. What it plays, beyond the first level's start:

- Later levels (a save, a Controller Pak image or a cheat reaches them), every kind of transition the game has
  (level loads, warps and portals, cutscenes in and out, the pause menu, the map, fades, wipes and irises, dying and
  respawning, the attract demo), menus and dialogs, and a slow walk across section, room and cell boundaries and
  through doorways.

What it looks for:

- Flicker: a surface or the HUD blinking frame to frame, z-fighting, a frame of garbage or a stale framebuffer in a
  transition, a frame drawn without its HUD, text or characters, or with only the part of its world drawn first. A
  game that draws a frame in several RSP tasks needs `RT64_GAME_FRAME_WORKLOADS` on its desktop build too, as its page
  has it, or RT64 interpolates each task as a frame of its own (docs/forks.md; the Mario Parties', Paper Mario's and
  Turok 1's and 2's CMakeLists.txt: Paper Mario's opening at Mario's house showed the house's inside without its outer
  wall, roof and trees in half the frames one host showed; Turok 1's and 2's map is a task of its own after the
  level's). A page opened with `?frame-log` and read by `tools/frame_log.mjs`
  tells: a frame drawn in several tasks reads as `drawn=2` or more, frame after frame, where the game draws it so. The
  other own recomps drew each frame in one through their play plans, a frame or two at a screen change aside.
- Interpolation: on the frame a level section, room or the world's origin changes, what is drawn snaps rather than
  blending between the two (Dinosaur Planet's, Perfect Dark's and GoldenEye's sections); characters' model parts carry
  ids of their own, or RT64 pairs one character's parts with a look-alike's (Mario Party's, Rayman 2's, Goin'
  Quackers'); a keyframed animation drawn without ids (flags, cloth, water) holds together in the frames drawn between
  the game's: the rt64 fork's automatic vertex interpolation pairs two frames' vertices by their order, so a game that
  plays one by switching meshes whose vertices aren't in the same order needs those draws in a group with an id
  (Rush 2049's start-line flags broke into shards about one drawn frame in six, its src/node_interpolation.cpp; no
  other game's regular plan showed it, docs/findings.md, Keyframed meshes under the automatic vertex interpolation);
  2D (sprites, scrolling textures, particles, menus) moves at the display's rate, not the game's.
- Letterboxes: black bars or a black row where the picture should reach the window, at odd window heights too, and
  the picture's last row and column filled at any window size (Turok 3's cutscene bars stopped a column short at
  1280x720, RT64's anchoring, docs/forks.md; Dinosaur Planet's a row short, with a grey strip of an old frame under
  them, since the game's own scissor ends a row before the frame's, its docs/restored-content.md; Super Mario 64's
  title backdrop the window's top row, flickering with three framebuffers' old frames, since the game's full-screen
  projection falls a quarter of a line short of the top, which only a picture taller than 240 rows shows, its
  patches/widescreen.c).
- Tiling: seams or misaligned tiles on walls, ground, sky and the HUD's pieces at high resolution.
- Widescreen: things culled or the level cut off near the picture's left and right edges (a game can cut its level a
  second time, at 16:9, as Turok 2 does); an off-screen marker (a bubble or an arrow for a character past the edge)
  placed at the 4:3 picture's edge; full-screen overlays, tints, wipes and fades cut at the 4:3 picture's
  scissor rather than reaching the window's edges (`RT64_SCISSOR_INSIDE_FRAMEBUFFER`, docs/forks.md); rooms seen
  through doors and portals clipped or drawn on walls; beside a menu's or title's 4:3 picture, a picture made for the
  4:3 frame repeated across the window, or sides never cleared that keep an old frame (Paper Mario's title and file
  select showed copies of a framed painting with white between them, and its black beside a 4:3 frame was never drawn:
  RT64 drops an extended fill whose right side, before it is moved from its origin, is left of its left side, its
  patches/widescreen.c).
- Missing draws: text, glyphs, the map's lines or a menu screen that comes up empty.

### 3. Every controller its own port

A game of several players plays each controller as a port of its own, as a console does: with two pads plugged in,
the second pad plays port 2 without anyone assigning players first, and the game's multiplayer offers a player for
each. RecompFrontend's `RECOMPINPUT_PADS_IN_ORDER` does that (set before `add_subdirectory` of RecompFrontend, with
`RECOMPINPUT_SINGLE_PLAYER_UNTIL_ASSIGNED`, `set_single_player_mode(false)` and the game's player count), and the
game's `get_connected_device_info` reports a controller in port 1, in each port a pad is connected for
(`get_detected_controller_count`) and in each assigned player's, each with a Rumble Pak in it unless the game keeps
its save on a Controller Pak there (5a): a game that finds no Rumble Pak (`osMotorInit`) never rumbles for that
player. F-Zero X's, Super Smash Bros.' and Mario Party's `main.cpp` are the pattern. A game whose pads become
players on their first press (per-pad bindings) can keep that and join every connected pad in the order it was
plugged in on any pad's first press instead (Rush 2049's `RecompFrontend-0009` runtime patch). Single-player mode,
where every pad plays port 1, is for a game of one player only. The page plays it with stand-in pads (W7), their
rumble included.

### 4. Input

- **4a.** On a new profile: mouse look on and pointing the way the game's stick does, and keyboard defaults that reach
  every menu (the arrows and the D-pad's keys) as well as play.
- **4b.** Start or Enter pressed or held through the boot: many games open their Controller Pak manager for it, which
  must neither crash nor stop the game. The launcher's own Enter on Start Game can be that press: Turok: Dinosaur
  Hunter's first read of the pad comes while the key is still down, so a game started with Enter opened its manager
  every time (Start leaves it).
- **4c.** Bindings are kept across a restart and a pad plugged in again, two pads of one model included, and a pad
  plugged in again plays the port it played before. A page plays the pads with no pad on the machine: W7's stand-in
  pads, one pulled out and plugged in again by `unplugPad` and `replugPad`, a binding written to the controls file
  (`<HOME>/.config/<program id>/controls.json`, the page's `FS`) and read back on the same profile's next visit.

### 5. Saves and settings

- **5a.** The game finds its save (EEPROM, SRAM, flash or Controller Pak) again after a restart of the desktop build
  (the page's is W6), and a Controller Pak and a Rumble Pak work together if the game uses both.
- **5b.** A first launch's settings are the defaults in effect, not only on disk: librecomp writes them out without
  calling the options' change callbacks, so an option read only in its callback keeps its C++ starting value until
  the next launch. Checked on a new profile, on the desktop and on the page.

### 6. Timing and sound

- **6a.** libultra's `osSetTime` is named in the game's syms (it is often missed), so the runtime sees the game set
  its clock, and time spent in the launcher before Start Game doesn't reach the game's clock (an attract demo that
  skips ahead, a game that runs fast for a while). Checked by waiting two minutes in the launcher first, and below full
  speed. A game that never calls it passes where nothing a player sees reads `osGetTime` (Mario Party's only
  performance meter does).
- **6b.** No sound lost or turned to noise on the desktop through the boot and a window dragged (the page's is W5). On
  Windows a drag holds the window's thread in the move loop that a `WM_SYSCOMMAND` `SC_MOVE` posted to the window
  starts as well, which a script holds and ends (Escape) without the mouse, and SDL's disk driver
  (`SDL_AUDIODRIVER=disk`, `SDL_DISKAUDIOFILE`) records what the game played, its gaps as runs of zeros
  (`tools/capture_window.ps1`'s `drag`). A gap is a loss only where a recording of the same boot without drags has
  none (a game's own cut to its attract demo is a run of zeros too, as Turok: Dinosaur Hunter's is) and a second drag
  play loses it again: Turok 3's first lost 65 ms in a drag over its title music beside a page play at 3840 wide, and
  two more lost nothing.

### 7. The page

The web port list, every item of it.

### 8. The release

- **8a.** The desktop build runs on Windows and on Linux, Mesa's lavapipe included: its release's boot
  (`tools/boot_release.sh`, 90 s) passes on both. A build whose pin is older than plume a8e74eb crashes on lavapipe
  seconds into its game (docs/findings.md, A desktop build on Mesa's lavapipe), so it fails until the retest moves it.
- **8b.** Its icon, window title and launcher art are its own game's, not the recomp it was started from.
- **8c.** Its README links its page.

## The web port list

Every game's page, a game fork's or a recomp of the project's own, is checked for each. W2, W5, W6 and W7 are one
short play a browser: `bash tools/play_pages.sh <rush-2049-recomp checkout> chrome <game> --backcheck`, and again with
`firefox` (`play_page.mjs --backcheck`, its header), from Pages on a fresh profile, which prints a verdict for each and
records the run in `plays.jsonl`. Firefox's play is W5's alone; a save reaching the Drive (W6) is a signed-in
player's, played by hand.

- **W1.** It draws at the display's rate and the canvas's size whatever the recomp's desktop build defaults to
  (Framerate Display, resolution Auto: the README's The recomp's own code): played uncapped in Chrome, it presents
  well above its game's own rate.
- **W2.** Its canvas is in CSS pixels (no `SDL_WINDOW_ALLOW_HIGHDPI`, docs/porting.md): at `--scale 2`
  (`tools/page_driver.mjs`) Load ROM opens the file picker and the launcher takes clicks where they land (Wave Race
  64's opened nothing).
- **W3.** A prebuilt shader list (docs/porting.md, Prebuilt shader lists), in sections a level or an area for a game
  of many levels, its header saying what was played and what not: the regular plan played on a fresh profile misses
  none (`shaderMisses`), and what the sweep plays (the attract demo, pause, the Controller Pak manager, weapons and
  moves, each aspect ratio) is in it.
- **W4.** Render to RAM chosen, and why written beside the call: each display list's copy of its frame into RDRAM
  waits 5-6 ms for the browser's readback (README, The recomp's own code), and left at RT64's default it is the exact
  copy with no reason anyone gave. Off where the game's CPU never reads a frame it drew, nor writes into one
  (`set_render_to_ram(false)`, and in a recomp of the project's own off on the desktop build too, where it is a second
  draw of every frame: Rush 2049's and Super Mario 64's Copy Frames to RAM option, Off by default). Else the copy a
  list late on the page, where the game can take a frame one list old (`set_render_to_ram_late(true)`, played through
  its levels and the console's reports of CPU writes to a framebuffer with a copy pending read). Else the exact copy,
  naming what reads it (Majora's Mask's Pictograph Box, Jet Force Gemini's shadows' render targets).
- **W5.** No sound lost or turned to noise: none short in the boot's first 10 s in Chrome and Firefox
  (`audioShort`), nor after the tab is hidden and shown again. A loss inside the game's own silence (a boot's silent
  logos) is no sound lost: `tools/audio_probe.js` logs each short render quantum with the loudest sample played
  before it, 0 there. Nor is Firefox's wait for a later section of the prebuilt list (`play_page.mjs`'s
  `shaderWaits` past the boot's, RT64's "building N prebuilt shaders for section X, the game waiting"): the game is
  held under the page's panel as at a load, its sound with it, since a held game makes none (docs/findings.md,
  Firefox's boot wait and the first sound). The stray rounds of section (none), a few shaders at a time in the middle
  of play, are still sound lost.
- **W6.** The game finds its save after the page is reloaded and after the browser is closed and opened again, and a
  signed-in player's save reaches the Drive and comes back in another browser (`frontend/save_sync.js`).
- **W7.** A stand-in pad (`tools/gamepad_probe.js`) drives the launcher, the menus and play, its rumble played; a game
  of several players has a pads plan that plugs a pad a port (Super Smash Bros.' `tools/play_plan_pads.json`, item 3).
- **W8.** A regular plan (docs/playing.md, Plans) that reaches a level as a player does and plays a minute or more in
  it, and a shader list recorded on what it plays. The levels past the plan's go into the list when a card's play
  reaches them, never as work of their own: a shader the list misses costs Firefox 0.2-0.3 s once, Chrome draws it
  with the ubershader until it is built, and the page remembers it (docs/porting.md, Prebuilt shader lists). An
  extended plan is no part of it either: a game gets one when a card first needs a longer play.
- **W9.** A long play, over 3 minutes of the game's busiest screens at 3840 wide, in Chrome and in Firefox, without
  running out of memory or a "memory access out of bounds".
- **W10.** Firefox played on its own and from Pages: black frames, white edges, traps and freezes have turned up there
  and in no other browser.
- **W11.** Its place on the hub and on GitHub: a Games row and an entry in `site/news.html` (docs/playing.md, The games
  page), its tile's art or a title card and its score; a game fork's README opens with its banner and its GitHub
  description with "AI-written fork:" (CLAUDE.md, Rules).
