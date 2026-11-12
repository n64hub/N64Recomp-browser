# A new recomp's checklist

What a new recomp of this project's own is checked for before it is called done, desktop build and page alike. Each
item is here because it turned up in more than one game after that game had been called done, most of them in a part
of the game nobody had played yet. So a recomp isn't done until each item has been played, not reasoned about:
the first level alone hides most of them. The items are in order, the first two first. A game the item can't apply to
(a single-player game and item 3) says so in its own docs.

How to play and record a page is docs/playing.md; what the web needs of a port (the shaders, Emscripten) is
docs/porting.md.

## 1. Widescreen, with the HUD at its sides

The page opens widescreen (RT64's Aspect Ratio at Expand, docs/game-forks.md has each game's), and the desktop build
offers it. The 3D reaches the window's edges at 16:9 and at 21:9, and the HUD is anchored to the wide picture's sides
and corners, not left in a 4:3 box in the middle: RT64's `gEXSetRectAlign`, `gEXSetViewportAlign` and edge-aligned
scissors written into the HUD's display list as the game draws each piece (Jet Force Gemini's Screen Corners), or a
game engine's own hooks (turok-engine's `docs/widescreen.md`). Text that crosses the middle stays whole, not split
between the two sides. The game culls to its 4:3 view, so its culling is widened to the picture's.

## 2. A graphics sweep, played past the first level

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
- Letterboxes: black bars or a black row where the picture should reach the window, at odd window heights too.
- Tiling: seams or misaligned tiles on walls, ground, sky and the HUD's pieces at high resolution.
- Widescreen: things culled or the level cut off near the picture's left and right edges (a game can cut its level a
  second time, at 16:9, as Turok 2 does); full-screen overlays, tints, wipes and fades cut at the 4:3 picture's
  scissor rather than reaching the window's edges (`RT64_SCISSOR_INSIDE_FRAMEBUFFER`, docs/forks.md); rooms seen
  through doors and portals clipped or drawn on walls.
- Missing draws: text, glyphs, the map's lines or a menu screen that comes up empty.

## 3. Every controller its own port

A game of several players plays each controller as a port of its own, as a console does: with two pads plugged in,
the second pad plays port 2 without anyone assigning players first, and the game's multiplayer offers a player for
each. RecompFrontend's `RECOMPINPUT_PADS_IN_ORDER` does that (set before `add_subdirectory` of RecompFrontend, with
`RECOMPINPUT_SINGLE_PLAYER_UNTIL_ASSIGNED`, `set_single_player_mode(false)` and the game's player count), and the
game's `get_connected_device_info` reports a controller in port 1, in each port a pad is connected for
(`get_detected_controller_count`) and in each assigned player's: F-Zero X's, Super Smash Bros.' and Mario Party's
`main.cpp` are the pattern. Single-player mode, where every pad plays port 1, is for a game of one player only. A
page's plan checks it with stand-in pads (`tools/gamepad_probe.js`'s `plugPads`), as Super Smash Bros.'
`tools/play_plan_pads.json` does, rumble included.

## 4. Input

- On a new profile: mouse look on and pointing the way the game's stick does, and keyboard defaults that reach every
  menu (the arrows and the D-pad's keys) as well as play.
- Start or Enter pressed or held through the boot: many games open their Controller Pak manager for it, which must
  neither crash nor stop the game.
- Bindings are kept across a restart and a pad plugged in again, two pads of one model included.

## 5. Saves and settings

- The game finds its save (EEPROM, SRAM, flash or Controller Pak) again after a restart, on the desktop and on the
  page, and a Controller Pak and a Rumble Pak work together if the game uses both.
- A first launch's settings are the defaults in effect, not only on disk: librecomp writes them out without calling
  the options' change callbacks, so an option read only in its callback keeps its C++ starting value until the next
  launch. Checked on a new profile, on the desktop and on the page.

## 6. Timing and sound

- libultra's `osSetTime` is named in the game's syms (it is often missed), so the runtime sees the game set its
  clock, and time spent in the launcher before Start Game doesn't reach the game's clock (an attract demo that skips
  ahead, a game that runs fast for a while). Checked by waiting two minutes in the launcher first, and below full speed.
- No sound lost or turned to noise: through the boot (none short in the first 10 s on the page), a window dragged, a
  tab hidden and shown again. On Windows a drag holds the window's thread in the move loop that a `WM_SYSCOMMAND`
  `SC_MOVE` posted to the window starts as well, which a script holds and ends (Escape) without the mouse, and SDL's
  disk driver (`SDL_AUDIODRIVER=disk`, `SDL_DISKAUDIOFILE`) records what the game played, its gaps as runs of zeros.

## 7. The page

- A prebuilt shader list (docs/porting.md) that covers what the sweep plays: the attract demo, pause, the Controller
  Pak manager, weapons and moves, each aspect ratio, so no frame waits on a shader the list missed.
- A long play (over 3 minutes, the game's busiest screens, 3840 wide) without running out of memory or a "memory
  access out of bounds".
- Firefox played on its own: black frames, white edges, traps and freezes have turned up there and in no other
  browser.
- Render to RAM chosen, and why written beside the call: each display list's copy of its frame into RDRAM waits
  5-6 ms for the browser's readback (README, The recomp's own code), and left at RT64's default it is the exact copy
  with no reason anyone gave. Off where the game's CPU never reads a frame it drew, nor writes into one
  (`set_render_to_ram(false)`, and off on the desktop build too, where it is a second draw of every frame: Rush 2049's
  and Super Mario 64's Copy Frames to RAM option, Off by default). Else the copy a list late on the page, where the
  game can take a frame one list old (`set_render_to_ram_late(true)`, played through its levels and the console's
  reports of CPU writes to a framebuffer with a copy pending read). Else the exact copy, naming what reads it (Majora's
  Mask's Pictograph Box, Jet Force Gemini's shadows' render targets).

## 8. The release

- The desktop build runs on Windows and on Linux, Mesa's lavapipe included.
- Its icon, window title and launcher art are its own game's, not the recomp it was started from.
- Its README links its page.
