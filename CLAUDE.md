# CLAUDE.md

Web support for N64 static recompilations: the game, its menus and RT64 built with Emscripten into one page that draws
through WebGPU (README). Almost all of it is written by AI agents, so this file is what the next one needs: how work
lands, the rules, and where everything else is written, and only what the README, the docs and the code can't say.

## Where things are written down

Each describes main as it is, a PR that makes one wrong fixes it in the same PR, and nothing is written in two places:
a doc points at the other.

- `README.md`, for humans: what this is, the Games table, how a recomp uses it, what each fork adds, what this repo
  adds besides the forks, the layout. It changes when a recomp's porter or a player would notice.
- Comments beside the code, for how and why: each file's header (`frontend/CMakeLists.txt`, `patches/apply.cmake`,
  `frontend/*.js`, `site/site.js`, every script in `tools/`) and each fork commit's message. Read the header of the
  file you change first, and update it in the same commit.
- `plays.jsonl`, the one record of every run of a page: never the README, never a game's repo.
- A game's own repo, for a finding that explains that game's code (a game fork's README or BUILDING.md, Rush 2049's
  docs/web.md).
- `docs/`, read when the task needs it:
  - `docs/porting.md`: what the web needs: WebGPU and the shaders, prebuilt shader lists, Emscripten, mods. Read it
    before a port or a change to a fork.
  - `docs/playing.md`: playing and measuring a page, a page's numbers, the games page (`site/`).
  - `docs/publishing.md`: the retest, a critical fix, building and publishing pages.
  - `docs/forks.md`: every fork commit by its label. `docs/game-forks.md`: each game fork's port, its game's own frame
    rate, how the games compare. Read a game fork's part there and its own docs before changing it.
  - `docs/findings.md`: what has been measured, the numbers behind this file's rules included.
  - `docs/phones.md`: playing and measuring a page on an Android phone from a computer, and what phones do differently.
  - `docs/new-recomp.md`: the two checklists, what a new recomp of the project's own (widescreen with the HUD at its
    sides, a graphics sweep past the first level, each controller its own port) and every game's page (the shader
    list, render to RAM, saves, sound, a long play) are played and checked for before they are called done, and where
    each game stands against them. Read it before calling a port or recomp done (Rules says who keeps it).

This repo, the forks and the game forks are public. Write for a stranger, in the present tense: nothing about a
contributor's machine, servers, host names, paths or accounts, no person's name, no history of renames or "until
<date>", nothing about where ROMs are kept. Beside a measurement, the host is "an idle host" or "a busy host".

Markdown here and in those repos is wrapped by hand, so a wrapped line never starts with `+ `, `- `, `* `, `> `, `#`
or a number and `.` or `)` (`1. `, `15) `): Markdown reads it as a list item, a quote or a heading in the middle of the
sentence. Keep that word on the line above.

## How work lands

A change here is one PR on this repo. It merges once CI is green and what it changes has been played (Changing it).
Work found while doing other work is filed and not started, unless it is a critical fix (The pins).

A slow step the work repeats (a build, a generator or disassembler run, a recompile, a boot) is made fast before the
work leans on it, unasked: incremental, cached by what it reads, run in parallel. A repo's own tool is fixed in that
repo, in the same work (a game's tools/ by its PR); a script of the work's own, in the scratch.

A request that a rule here turns away is asked about, never answered no and closed: say which rule and what it would
mean to do it anyway, and let whoever asked decide. The rule may be what is wrong, and if so it changes in the same
work.

Priority is by what it breaks: high for a crash, med for an issue that affects every game, low for one game's. Work
that comes from GitHub (an issue, a comment on one, a pull request from outside) is med, or high when it is a crash or
stops someone playing, and never low, whichever game it is. Work without one gets one from whoever first can tell,
before anything else they do on it, and a priority found wrong (the cause known, a second game showing it, a crash, a
cause that is one game's own) is changed at once, in the same work. One game's symptom whose cause is shared code (a
fork, this repo) is med, or high if it crashes or loses the device on any game.

The forks (`rt64-web`, `plume-web`, `hlslpp-web`, `N64ModernRuntime-web`, `N64Recomp-web`, `RecompFrontend-web`) and
the game forks take no PRs: a change is a commit pushed to the fork's `main` as a fast-forward, pinned by its SHA
(`forks.txt` here, a game fork's submodule). This project's own recomps, `rush-2049-recomp`, `perfect-dark-recomp`,
`super-mario-64-recomp`, `f-zero-x-recomp`, `mario-party-recomp`, `mario-party-2-recomp`, `mario-party-3-recomp`,
`super-smash-bros-recomp`, `paper-mario-recomp`, `rayman-2-recomp`, `donald-duck-goin-quackers-recomp`, `dinosaur-planet-recomp`, `turok-recomp`, `turok-2-recomp` and `turok-3-recomp`, work by PRs: moving one's `lib/N64Recomp-browser` is a PR there.
`mario-party-engine`, the code the Mario Party recomps share (their process scheduler, `gen_syms.py`), takes no PRs
either: a change is a commit pushed to its `main`, which each Mario Party recomp's `lib/mario-party-engine` moves onto
by a PR there, built and played like a pin move. Code one Mario Party recomp would copy from another goes there.
`turok-engine`, the code the Turok recomps share (their function finder, the Controller Pak, libultra the runtime
lacks), takes PRs, and each Turok recomp's `lib/turok-engine` moves onto a merged commit by a PR there.

Branches don't outlive their work: every one of these repos deletes a PR's branch when it merges ("Automatically
delete head branches", on in each, a new fork included), and a branch pushed to a fork to hold work not on `main` yet
(`web-wip`, `wip/<topic>`, a game fork's `fix/<topic>` offered upstream) is deleted by the work that lands or drops
it. A fork keeps `main`, `gh-pages` and those branches only: upstream's others are deleted when it is made.

## If the change reaches another repo, YOU make it

This repo's work is all of this project's recomp work, so a change it needs in one of the project's own recomps
(`rush-2049-recomp`, `perfect-dark-recomp`, `super-mario-64-recomp`, `f-zero-x-recomp`, `mario-party-recomp`,
`mario-party-2-recomp`, `mario-party-3-recomp`, `super-smash-bros-recomp`, `paper-mario-recomp`, `rayman-2-recomp`, `donald-duck-goin-quackers-recomp`, `dinosaur-planet-recomp`, `turok-recomp`, `turok-2-recomp`, `turok-3-recomp`) is made in the same work, not handed on as work of its own: a PR there, from a checkout of its
`main`, landed by whoever does the work like one here,
then this repo's half, if it has one. A cause found in a recomp is fixed there, in the work that found it. A fork or a
game fork is changed as The forks says, by a commit pushed to its `main`, never a PR. Rush 2049's own bugs, and Rush
work of its own size, stay Rush 2049's; a small Rush change this work needs (its pin, its shader list or play plan, a
docs line) is made in the same work like any other.

## Rules

- The web support works for every N64 recomp: a change is game-agnostic and behind `__EMSCRIPTEN__`/`__wasm__` (or an
  option on by default with Emscripten). The games' pages are there to build out and test it, not ports of their own:
  what one game or browser turns up is fixed in the shared support unless it really is that game's, and what one game
  does better (a shader list in sections, the late copy) is tried on the others.
- The checklists in docs/new-recomp.md are kept by the work that plays the games, in the same PR (its Keeping them): a
  problem one game turns up that another could have too goes in as an item, an item added is backchecked (its label
  in the row of every game it can apply to, and work filed to play it there), and a play of a game for an item updates
  that game's row. A port or new recomp is called done once its row holds only fails whose fixes are filed.
- Work that is started: a critical fix, a new port, and work whose likely cause is shared code, measured on two games
  or more. One game's polish (one browser's sound in one game, 100 ms gaps at one screen change) is filed and waits
  until asked for.
- A game fork is its recomp plus web support, and takes the recomp's fixes and features from upstream: a merge of its
  main, or of a better-kept fork of it (GoldenEye64Recomp-web merges podulator's). A player blames the page for
  whatever it does wrong, whoever's code it is, so a bug in the recomp that the page shows and upstream isn't fixing
  (no fix under way, an upstream nobody keeps up) is fixed in the game fork's own code and offered upstream where it
  takes one (GoldenEye64Recomp-web's, docs/game-forks.md). What a kept-up upstream has under way or on its roadmap is
  left to it for a while, out of respect, and done in the game fork if it doesn't come. New features of its own (mouse
  aim, controls, enhancements) are asked about first, as any request a rule turns away is (How work lands). The three it
  has (docs/game-forks.md) are a change that runs its game faster when that makes the page play better, and GoldenEye's
  keyboard and mouse and its Ext pad style as the PC ports play them: all in GoldenEye64Recomp-web's own code and none
  in the forks, and the keyboard and mouse in podulator's since it took them.
- Every page interpolates to the display's rate and draws at the canvas's size: RT64's Framerate Display and resolution
  Auto, in every game fork and new port, whatever its recomp's desktop build defaults to (README, The recomp's own
  code). A page held to its game's own rate reads that rate uncapped whatever a change costs or saves (DKR-R 29.8-30.0,
  Jet Force Gemini 19-22, on Original), so one that shows its game's own 20 or 30 because of a default is a bug.
- Every web port records a prebuilt shader list and builds it, as part of the port: without one a page is unplayable
  (docs/porting.md, Prebuilt shader lists).
- Never open a PR, issue or discussion upstream at rt64, plume, N64Recomp, N64ModernRuntime, RecompFrontend,
  BanjoRecomp, Zelda64Recomp or Donkey-Kong-64-Recompiled: their CONTRIBUTING.md asks for no LLM-written code (plume's,
  no AI-made contribution and no AI talking to its maintainers). Nor at dino-recomp or dinomod-enhanced-recompiled, or in
  their Discord: dino-recomp bans AI-made contributions and asks its forks to keep the ban, and Dinomod Enhanced is made
  with no AI and consents to no AI fork bundling it, so neither is forked here. Each fork's README opens with a banner,
  and its GitHub description with "AI-written fork:", saying it is AI-written, not upstream's, and offered to nobody
  upstream (hlslpp-web's says only the first two: hlslpp has no ban). Keep that true of a new fork and of a game fork's
  README. A game's own repo is decided case by case: a game fork offers it only what it takes, said to be AI-written
  (GoldenEye64Recomp-web: to podulator's, which takes fixes, features and build work, each a PR of its own from a
  `fix/<topic>` branch of the fork cut from its `main`, played on its desktop build, without the web code;
  docs/game-forks.md).
- A repo without a license is forked, ported and copied from like a licensed one. That is this project's choice, not
  the law's: in law no license leaves every right with its author.
- No ROMs, ROM-derived assets or extracted game data in git, CI, PRs or pages. A page holds the recompiled code, so it
  is built where the ROM is, never in CI, and its `.data` holds only what it preloads (`tools/publish_page.sh`).
- Nothing here names a game, includes from a game's repo or needs its ROM: the web side gets what it needs through the
  runtime's own interfaces, as every recomp does.
- CI (`.github/workflows/ci.yml`, each job's comment says what it checks) builds every library of a page with Emscripten
  from the forks and checks the shaders, and that `patches/` match the forks and apply to every recomp and game fork
  it is built over. It builds no page (that needs a game), so anything that changes what a page runs is built and
  played before it lands.
  A change to only `*.md`, `plays.jsonl`, `site/` and the tools that play, serve, read and publish pages runs only the
  `changes` job, which also fails while a game in the README's Games table has no entry in `site/news.html`.

## The forks

Each fork's `main` is the commit upstream pins plus the web support, one commit per change (README, The forks; each
commit's message says what and why). rt64-web's `src/contrib/plume` is plume-web and its `src/contrib/hlslpp`
hlslpp-web; N64ModernRuntime-web's `N64Recomp` is N64Recomp-web. Notes name a change by a label (`plume-0003`,
`rt64-0010`) or by fork and commit (`rt64 c89ced0`): `docs/forks.md` has every one, a line each, and a change pushed to
a fork gets its row there in the PR that moves `forks.txt` onto it.

Seventeen options are off on a desktop build, on with Emscripten, and settable natively: docs/forks.md lists them
(Options off on a desktop build).

## Changing it

A game's checkouts hold the web support as uncommitted changes (`patches/apply.cmake`, or the game's own patch script),
so commit to a fork from a separate clone of it:

1. `git clone https://github.com/n64hub/<fork>` (its `main`), make the change, and commit it saying what and why.
   Try it in a game first by applying the same diff to that game's patched checkout (plume is
   `<rt64>/src/contrib/plume`).
2. Push it to `main` as a fast-forward, never a force-push: `forks.txt`, its tags and the recomps pin those commits. A
   change to plume-web, hlslpp-web or N64Recomp-web also moves the submodule in rt64-web or N64ModernRuntime-web: push
   that too. A commit that changes no code (a README) moves no pin, so a fork's `main` may be ahead of `forks.txt`. To
   move a fork to a newer upstream commit, merge it into `main` (never rebase), say in the merge what upstream brought,
   and move its upstream commit in `patches/patches.txt`.
3. Here, on the task's branch: bump `forks.txt`, run `tools/export_patches.sh`, commit `patches/` with it, and open the
   PR. A patch that stops applying to a commit in `patches/pins.txt` means the fork has to change.
4. Before it merges, build pages on the branch and play them by what the change can break (docs/playing.md, What a
   change plays): the smoke play of its own game where it can't move speed, the A/B on its game and one other where it
   can, each a game fork's checkout with its N64Recomp-browser at the branch's commit. After the merge, CI's `tag` job
   tags main `v0.<n+1>.0` when its jobs pass, for a merge that changes `forks.txt`, `patches/`, `frontend/` or
   `renderer/`; check it came (`git ls-remote --tags origin`). A tag is a release: a recomp checks this repo out at
   one, and the retest builds the newest.

Read docs/porting.md before a fork change, and docs/findings.md (WebGPU in Chrome and Firefox) before changing plume's
backend or how RT64 builds pipelines or presents on the web.

## The pins

A change to what a page runs (a fork, `forks.txt`, `patches/`, `frontend/`) ends at its merge and tag, played by what
it can break (Changing it). Every game takes it in the next retest, a run on a schedule that takes every change since
the last one at once (docs/publishing.md): it builds each game's page on the newest tag, plays the ones whose files
changed (each once in Firefox for crashes and errors, and an A/B in Chrome against the page Pages serves on two or three
games that stand for the rest when the tag can move speed), and only a page that boots with no WebGPU errors and plays
no worse than Pages moves its fork onto the tag and is published. One that plays worse stays on
Pages as it was and has work filed. Rush 2049, Perfect Dark, Super Mario 64, F-Zero X, Mario Party 1, 2 and 3,
Super Smash Bros., Paper Mario, Rayman 2, Donald Duck: Goin' Quackers, Dinosaur Planet, Turok: Dinosaur Hunter, Turok 2 and Turok 3 are retested in the same work, never filed for later: each one's pin moves by a PR on its repo that the retest opens and merges, Rush 2049's even to a tag
that left its page's bytes alone, and each is released (Releasing). A new recomp of the project's own whose game isn't released yet is held unreleased
(docs/publishing.md): the retest moves its pin the same way, built and played, and publishes nothing for it.

A critical fix doesn't wait for the retest: a fix for a page on Pages that crashes, never boots, loses its WebGPU
device or can't be played moves the pins of the games it fixes (this project's own recomps' by a PR), builds, plays in Chrome and
Firefox and publishes each, in the same work. A bug only main has waits for the retest; once
the retest publishes it, its fix is critical.

**Publishing** is the deploy; no CI job does it. A retest or critical fix publishes the pages it moves, and a change to
one game's own repo sees that game's page published, unasked, and its desktop build released (Releasing). One publish
carries every change merged since the last, so the work that lands one doesn't publish a page of its own for it:

- Once it merges, the work stays until a publish that carries it is out: the hub's last gh-pages commit names the main
  each game's folder was built from. With none of that game's publishes in flight it publishes, unasked; with one in
  flight it waits for that one and looks again, since a publish started meanwhile may carry it. A publish is in flight
  from its build until the hub serves it and it has booted from Pages, and the work running one says so, from its
  build, where the project's work is coordinated. A change merged during one rides the next, a wait of one publish at
  most, and nobody holds a merge for one: a publish builds main as it is when it starts and publishes that commit's
  build as it was played, whatever main has since (`tools/publish_pages.sh --keep`, `--played`).
- Every page is played before it is published and booted from Pages after, so Pages holds only played pages. A page
  found behind main is played and published by whoever finds it, and one left in flight by work that stopped is
  finished by whoever finds it.

A change to the games page (`site/`, `frontend/save_sync.js`, `frontend/coi_serviceworker.js`) is published at once:
the work that merges it runs `tools/publish_site.sh` from main and checks n64hub.com serves it, since until then the
merge reaches nobody. How: docs/publishing.md.

**Releasing** is the desktop build's deploy, and nothing waits for it: most players play the desktop build, on
Windows or Linux, and the page's publish doesn't reach them. A recomp of the project's own with desktop releases gets a
new one whenever its main has something its last release lacks that the desktop build runs: a fix or feature in its
own code, or a pin moved by the retest, a critical fix or a fork change (the forks are the desktop build's RT64 and
runtime too). One release carries every such change merged since the last, so the work that lands one doesn't cut a
release of its own for it:

- Its PR adds what the player gets to `releases/next.md`, a line under the others (the first change after a release
  makes the file), and bumps no version.
- Once it merges, the work stays until a release that carries it is out. With none of that game's releases in flight
  it releases, unasked; with one in flight it waits for that one and looks again, since a release started meanwhile
  may carry it. A release is in flight from the moment its PR (`Release v<version>`) is opened until GitHub has the
  release `v<version>`, so `gh pr list --search "Release v in:title"` and `gh release view v<main's version_string>`
  tell. A change merged during one rides the next, a wait of one release at most, and nobody holds a merge for one.
- A release is that PR, which bumps `version_string` and moves `releases/next.md` to `releases/v<version>.md`, in the
  last release's shape and saying what the player gets, then both archives built from its merge commit and booted on
  Windows and Linux before they are published (its `tools/release.sh`, which boots each with `boot windows` and
  `boot linux` through `tools/boot_release.sh` and publishes only archives that booted, from a commit of main without
  `releases/next.md`, not main's newest; Rush 2049's docs/releasing.md). One left in flight by work that stopped is
  finished by whoever finds it.

Only a change the desktop build doesn't run (docs, a play plan, the page's shader list, `plays.jsonl`) adds no line and
waits for the next release. A fix for an issue a player filed is answered naming the release that carries it, once
that is out, by the work that fixed it. A game fork has no desktop release of its own, so its page's publish is its
release.

## The games table

The README's Games table has each game's recomp, repo and page, and nothing about how it plays: a frame rate or a date
means nothing to a player, so a page's numbers are kept in `plays.jsonl`, and kept good. Whoever plays a page that changed (a retest, a critical fix, a change to a game's repo or shader list) does all
of this in the same work, as docs/playing.md says:

- Plays it in Chrome and Firefox, always both (Chrome for the numbers, Firefox for what only it turns up: a race in
  the game's loads, an OOM), its build before it is published and from Pages after: launcher, Load ROM, the shader
  wait, menus (look at them, a `shot` step), a level or race, sound, the frame rate, WebGPU errors in the console.
  A publish of the files that were played (a retest's, a game's own repo's) plays from Pages in Firefox only the
  A/B's games and each page whose `.html` differs from the hub's (its own shell, whose Content-Security-Policy once
  failed only from Pages): the others' bytes played clean in Firefox from the build, and their serving is the hub's,
  which those plays and every page's boot from Pages in headless Chrome check (docs/publishing.md).
- Records every run, failed ones too, in `plays.jsonl` (`play_page.mjs --record`), committed with the work and nowhere
  else.
- Keeps its numbers good: its median presents a second in Chrome on a laptop's integrated graphics (Intel UHD), or
  else on the stand-in for one, are 60 or its game's own rate, and a page below that has work filed to make it 60
  (docs/playing.md, A page's numbers). A new game gets a row in its port's work.

## Playing a page

- Every automatic play (a test, the retest, an A/B, a smoke run) is 2-5 minutes. A game is played by its regular plan
  (`play_plan.json`, 2-3 minutes); its extended plan (`play_plan_extended.json`, 5 at most) is played only when needed,
  and the shaders it misses go into the game's list. A longer one (a plan of more, a run of 10 minutes or more) is for
  a card that needs it and says why: a soak, a leak or OOM hunt, a timing bug that takes many minutes to show
  (docs/playing.md, Which browser, how long).
- Chrome measures, in interleaved pairs. Firefox with its default prefs is played for crashes, traps, WebGPU errors and
  exceptions, not presents: on Windows' integrated graphics its compositor caps every page at 30-45. Firefox's
  performance is measured only for a change that could move it, with `gfx.webrender.compositor` false.
- A smoke play is a shared turn in the GPU queue with a short limit (about 10 minutes), an A/B's play or a soak a
  whole turn with a limit that fits its plan. A card queues one series at a time and stops it at its first failed
  play, and checks its plan's files are there before it queues (docs/playing.md, What a change plays).
- On a desktop GPU a page is measured uncapped (`--uncapped`): capped, every page and build reads about 60 there.
- One page plays at a time on a machine, in any browser (docs/findings.md, Two pages at once). Where agents share a
  machine, each play (one `play_page.mjs` run, one `record_shaders.mjs` recording) takes its turn in that machine's GPU
  queue, started in the background and waited on, one play a turn so others' turns come between a series. Agents never
  message each other about turns: the queue says it.
- A desktop GPU's clock wanders, and a contended host reads exactly like a slow page: write down what else was running
  beside a number. The page Pages serves, played in the same minutes as a new build, interleaved (`--note` them, a
  second pair where the first isn't clearly within the noise), tells the host from the build; one pair before and after
  doesn't (docs/findings.md, Behind CLAUDE.md's rules).
- A plan reaches a level as a player does and plays a minute or more in its levels, its holds on the game's own clock;
  a plan that ends on black is the plan's fault until a direct warp there draws black too (docs/playing.md, Plans).
- A game's desktop build never runs on the GPU from inside WSL2 (Mesa's Dozen over `/dev/dxg`): a device lost there
  wedged the Windows host's GPU driver and froze the whole machine until a restart (docs/findings.md, A desktop build
  on WSL's GPU). Under WSL or Docker it runs on lavapipe, on the CPU; on the GPU only natively, or as its page.

## Ruled out, so don't retry

What each was and what it measured is in docs/findings.md (Ruled out, measured).

- Presents waiting for the animation frame in every browser: on a laptop's Intel UHD Chrome drew as many, with the GPU
  and the browser working harder and twice the long gaps.
- One of plume's WebGPU calls as what grows Firefox's GPU process: none grew it on a test page that submits.
- coi_serviceworker.js's reload missed because its worker got further than register()'s promise: ~100 cold Firefox
  visits always reloaded (shell.html says what a first visit that never started was).
- A cheaper render-to-RAM readback: the time per list stayed, since Chrome paces the readback itself.
- Pilotwings 64's 85-180 ms gaps as its screens change, and Perfect Dark's 133 ms frames in its opening cutscenes, as
  the page's: both are the game's own, on a console and natively too.
- Holding back the list Chrome builds behind the game: the build costs the page little or nothing.
- Building Firefox's pipelines in parallel from the page: its GPU process runs every WebGPU call on one thread, so it
  is slower, and the driver's shader cache spares no rebuild.
- Shorter web builds by ccache behind emcc (it goes in front), configure checks without linking, `RecompiledFuncs/` at
  -O2, or precompiled headers (off for a page: ccache can't cache a file that includes one).
- A fixed heap in place of memory growth (no faster), and `-sGROWABLE_ARRAYBUFFERS=2` (Chrome refuses WebGPU views of a
  growable heap).
- A cheaper GPU frame for Rush 2049's, Majora's Mask's and Conker's pages in the web's own parts: what costs is RT64's
  pixel shaders and Auto's resolution, as on the desktop, and on a phone's Mali too (docs/phones.md).
- A DirectComposition overlay for a WebGPU canvas in Chrome on Windows: Chromium makes one only of video and
  low-latency canvases.
- Building Firefox's shader misses later (where the game sends no frames, or with a later section's wait): a recomp's
  loads are too short, and they come after the list's last section.
- As what paces a page to 30 on a laptop's screen in Firefox: a present's wait() trips to the page's thread, late timed
  waits, the present thread's wait() before its slot sleep, a try's first 0.5 s left out of pace()'s count, 3 presents
  in flight. Each paced the same: what each present costs the GPU in Firefox's compositing decides it.
- The most common of the last frames' VIs as RT64_UNEVEN_FRAME_RATES's frame length: it judders more than the fastest
  of three.
- A list started with the last one's late copy pending, for Perfect Dark at 30 in its levels: its main thread waits for
  a controller sample (`joy_debug_joy`), not the copy.
- Judging a page's timed waits both ways as it plays: it turned several times a second, and the tries cost a sixth.
- A missed shader built in line in Firefox as what stops Perfect Dark's page answering at Defection: the page kept
  drawing, and Firefox's own process answered BiDi late.
- A timed wait to just before a present's slot in Chrome: a tenth end 4-16 ms late, on the system timer's tick.
- wasm SIMD for RT64's TMEM loads and CI4 hashes: up to 9 times as fast alone, and no page drew faster.
- RT64 waiting once for a frame drawn in many workloads, after its last: the game ran at half its rate.
- Skipping or batching the device thread's round trips to keep a hidden page's game running in Chrome: Chrome idles a
  silent hidden tab's process, and the trips were a small part of what it lost.
