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
- An item added or changed is backchecked: the work that adds it puts its label in the Left cells of every game in the
  record it can apply to and files work to play it on them (one piece for every game it reaches, or one a game where
  each needs its own fix), unless it plays them itself.
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
| San Francisco Rush 2049 | 2, 3, 4a, 4b, 5a, 6a, 6b | W2, W5, W6, W7 |
| Perfect Dark | 1, 2, 3, 4b, 4c, 5a, 5b, 6a, 6b, 8a | W2, W5, W6, W7, W9 |
| Super Mario 64 | 2, 4a, 4b, 4c, 5a, 5b, 6b, 8a | W2, W5, W6, W7 |
| F-Zero X | 2, 3, 4a, 4b, 4c, 5a, 5b, 6b, 8a, 8c fails | W2, W5, W6, W7, W9 |
| Mario Party | 3, 4a, 4b, 4c, 5a, 5b, 6a, 6b, 8a, 8b, 8c fails | W2, W3 fails, W4 fails, W5, W6, W7, W8 |
| Mario Party 2 | 3, 4a, 4b, 4c, 5a, 5b, 6a, 6b, 8a, 8b, 8c fails | W2, W3 fails, W4 fails, W5, W6, W7, W8 |
| Mario Party 3 | 3, 4a, 4b, 4c, 5a, 5b, 6a, 6b, 8a, 8b, 8c fails | W2, W3 fails, W4 fails, W5, W6, W7, W8 |
| Super Smash Bros. | 1 fails, 2, 4a, 4b, 4c, 5a, 5b, 6b, 8a | W2, W4 fails, W5, W6, W9 |
| Paper Mario | 1 fails, 2, 4a, 4b, 4c, 5a, 5b, 6b, 8a | W2, W4 fails, W5, W6, W7, W9 |
| Rayman 2 | | W2, W5, W6, W7 |
| Donald Duck: Goin' Quackers | 2, 5a, 5b, 6b | W2, W5, W6, W7 |
| Dinosaur Planet | | W2, W5 fails, W7 |
| Turok: Dinosaur Hunter | 4a, 4b, 4c, 5a, 5b, 6a, 6b, 8a | W2, W5, W6, W7, W8, W9 |
| Turok 2: Seeds of Evil | 3, 4a, 4b, 4c, 5a, 5b, 6a, 6b, 8a, 8c fails | W2, W3 fails, W5, W6, W7, W8, W9 |
| Turok 3: Shadow of Oblivion | 3, 4a, 4b, 4c, 5a, 5b, 6a, 6b, 8a | W2, W5, W6, W7, W8, W9 |
| GoldenEye 007 | | W2, W5, W6, W7 |
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
| 1080° Snowboarding | | W2, W5, W6, W7, W8, W9 |
| Space Station Silicon Valley | | W2, W5, W6, W7, W8, W9 |
| Tony Hawk's Pro Skater 2 | | W2, W5, W6, W7, W8, W9 |
| Star Wars: Rogue Squadron | | W2, W5, W6, W7, W9 |
| Beetle Adventure Racing! | | W2, W5, W6, W7, W8, W9 |
| Turok: Rage Wars | | W2, W5, W6, W7, W8, W9 |
| WWF No Mercy | | W2, W5, W6, W7, W8, W9 |

What the fails are: Smash's and Paper Mario's HUD and menus stay in the middle 4:3 (1); F-Zero X's, the Mario Parties'
and Turok 2's READMEs don't link their pages (8c); the Mario Parties' and Turok 2's regular plans, played on a fresh
profile, miss shaders their lists lack (W3); Dinosaur Planet's page still loses one silence of about 10 ms 0.4 s into
its game's sound in Chrome on a first visit, while RT64 holds the game's first frames before it shows one, where the
desktop build loses 22 ms as its sound starts, and none at the logos since plume-web e69d031 (docs/findings.md,
Compute pipelines built at their first dispatch), and about 42 ms at the logos in Firefox (W5); the Mario Parties keep
render to RAM on in their desktop builds, and Smash's and Paper Mario's pages keep the exact copy with no reason given
(W4).

## A new recomp's list

A game the item can't apply to (a single-player game and item 3) says so in its own docs.

### 1. Widescreen, with the HUD at its sides

The page opens widescreen (RT64's Aspect Ratio at Expand, docs/game-forks.md has each game's), and the desktop build
offers it. The 3D reaches the window's edges at 16:9 and at 21:9, and the HUD is anchored to the wide picture's sides
and corners, not left in a 4:3 box in the middle: RT64's `gEXSetRectAlign`, `gEXSetViewportAlign` and edge-aligned
scissors written into the HUD's display list as the game draws each piece (Jet Force Gemini's Screen Corners), or a
game engine's own hooks (turok-engine's `docs/widescreen.md`). Text that crosses the middle stays whole, not split
between the two sides. The game culls to its 4:3 view, so its culling is widened to the picture's.

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
  transition, a frame drawn without its HUD, text or characters.
- Interpolation: on the frame a level section, room or the world's origin changes, what is drawn snaps rather than
  blending between the two (Dinosaur Planet's, Perfect Dark's and GoldenEye's sections); characters' model parts carry
  ids of their own, or RT64 pairs one character's parts with a look-alike's (Mario Party's, Rayman 2's, Goin'
  Quackers'); 2D (sprites, scrolling textures, particles, menus) moves at the display's rate, not the game's.
- Letterboxes: black bars or a black row where the picture should reach the window, at odd window heights too, and
  the picture's last row and column filled at any window size (Turok 3's cutscene bars stopped a column short at
  1280x720, RT64's anchoring, docs/forks.md; Dinosaur Planet's a row short, with a grey strip of an old frame under
  them, since the game's own scissor ends a row before the frame's, its docs/restored-content.md).
- Tiling: seams or misaligned tiles on walls, ground, sky and the HUD's pieces at high resolution.
- Widescreen: things culled or the level cut off near the picture's left and right edges (a game can cut its level a
  second time, at 16:9, as Turok 2 does); full-screen overlays, tints, wipes and fades cut at the 4:3 picture's
  scissor rather than reaching the window's edges (`RT64_SCISSOR_INSIDE_FRAMEBUFFER`, docs/forks.md); rooms seen
  through doors and portals clipped or drawn on walls.
- Missing draws: text, glyphs, the map's lines or a menu screen that comes up empty.

### 3. Every controller its own port

A game of several players plays each controller as a port of its own, as a console does: with two pads plugged in,
the second pad plays port 2 without anyone assigning players first, and the game's multiplayer offers a player for
each. RecompFrontend's `RECOMPINPUT_PADS_IN_ORDER` does that (set before `add_subdirectory` of RecompFrontend, with
`RECOMPINPUT_SINGLE_PLAYER_UNTIL_ASSIGNED`, `set_single_player_mode(false)` and the game's player count), and the
game's `get_connected_device_info` reports a controller in port 1, in each port a pad is connected for
(`get_detected_controller_count`) and in each assigned player's: F-Zero X's, Super Smash Bros.' and Mario Party's
`main.cpp` are the pattern. Single-player mode, where every pad plays port 1, is for a game of one player only. The
page plays it with stand-in pads (W7).

### 4. Input

- **4a.** On a new profile: mouse look on and pointing the way the game's stick does, and keyboard defaults that reach
  every menu (the arrows and the D-pad's keys) as well as play.
- **4b.** Start or Enter pressed or held through the boot: many games open their Controller Pak manager for it, which
  must neither crash nor stop the game.
- **4c.** Bindings are kept across a restart and a pad plugged in again, two pads of one model included.

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
  (`SDL_AUDIODRIVER=disk`, `SDL_DISKAUDIOFILE`) records what the game played, its gaps as runs of zeros.

### 7. The page

The web port list, every item of it.

### 8. The release

- **8a.** The desktop build runs on Windows and on Linux, Mesa's lavapipe included.
- **8b.** Its icon, window title and launcher art are its own game's, not the recomp it was started from.
- **8c.** Its README links its page.

## The web port list

Every game's page, a game fork's or a recomp of the project's own, is checked for each.

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
  (`audioShort`), nor after the tab is hidden and shown again.
- **W6.** The game finds its save after the page is reloaded and after the browser is closed and opened again, and a
  signed-in player's save reaches the Drive and comes back in another browser (`frontend/save_sync.js`).
- **W7.** A stand-in pad (`tools/gamepad_probe.js`) drives the launcher, the menus and play, its rumble played; a game
  of several players has a pads plan that plugs a pad a port (Super Smash Bros.' `tools/play_plan_pads.json`, item 3).
- **W8.** A regular plan and an extended one (docs/playing.md, Plans): the regular plan reaches a level as a player
  does and plays a minute or more in it, and the extended plan's misses are in the shader list.
- **W9.** A long play, over 3 minutes of the game's busiest screens at 3840 wide, in Chrome and in Firefox, without
  running out of memory or a "memory access out of bounds".
- **W10.** Firefox played on its own and from Pages: black frames, white edges, traps and freezes have turned up there
  and in no other browser.
- **W11.** Its place on the hub and on GitHub: a Games row and an entry in `site/news.html` (docs/playing.md, The games
  page), its tile's art or a title card and its score; a game fork's README opens with its banner and its GitHub
  description with "AI-written fork:" (CLAUDE.md, Rules).
