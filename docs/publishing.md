# The retest and publishing

How a change here reaches every game's page: the retest, a critical fix, and how pages are built and published.
CLAUDE.md (The pins) has the rules this carries out; `tools/publish_pages.sh`'s header has its options.

## The retest

A run on a schedule that takes every change since the last one at once:

- For each game fork it builds the page on main's newest tag and, if the page's files changed, plays that build by
  what the tag can break (docs/playing.md, What a change plays), read from what it took since the last retest
  (`git log <played>..<tag>`). Every changed page gets the smoke play of its build in Firefox,
  `tools/ab_pages.mjs --smoke`, and Chrome's boot from Pages after it is published (`tools/publish_pages.sh`). A tag
  that can move speed or timing also gets the A/B, `tools/ab_pages.mjs`, on two or three games that stand for the rest
  (Banjo-Kazooie and Conker's Bad Fur Day, and the game a change in it was about): a shared change moves every page the
  same way, so an A/B of each would measure the same thing again and again. If one of those plays worse, every other
  changed page gets the A/B too before any moves. Each play is by the game's regular plan (2-3 minutes), uncapped at the
  stand-in's size, and goes in `plays.jsonl` under one `--set` with its `--role` and a note saying so; ab_pages.mjs's
  header says what it plays and how it reads a verdict: a build is worse only if its second Chrome run is worse too, a
  drop within the noise is not, and a build whose Firefox play isn't clean is worse only if Pages' plays clean, its
  failure filed either way. Leaks, OOMs and other faults that take many minutes to show are the soak's, not the
  retest's.
- Only a page that boots with no WebGPU errors and plays no worse than its row and its earlier runs moves its fork's
  N64Recomp-browser onto the tag (a commit to the fork's `main`), is published and gets its row updated. One that plays
  worse stays on Pages as it was, its fork on its last tag, and has work filed. So a fork's `main` is what its page was
  built from, and `git log <played>..<built>` here lists what a page took since it was last played.
- Rush 2049, Perfect Dark, Super Mario 64 and F-Zero X, this project's own recomps, are retested in the same work,
  built, played, recorded and their rows updated the same way, never filed for later; only their pins move differently, by a
  PR on each one's repo that moves `lib/N64Recomp-browser` to the tag and builds the same bytes, which the retest
  merges before it publishes the page. Rush 2049's PR also runs the desktop game, and its pin moves even to a tag that
  left its page's bytes alone, since its desktop build can take something from it. A critical fix that plays every game takes it along the same way.
- `tools/publish_pages.sh <rush-2049-recomp checkout> --browser <tag> --keep <dir>`, run where the ROMs are, builds
  every game's main, Rush 2049's too, with N64Recomp-browser moved to the tag (in the build host's copy only), names
  the pages whose files differ from what Pages serves and copies each of those builds into `<dir>/<game>` as it
  finishes; one with the same bytes took nothing and is left alone. Those are played from `<dir>`, and nothing waits
  for anything it doesn't need: the smoke plays follow the builds one game behind (a play is a GPU turn beside a
  build's CPU, a build doesn't measure), the stand-in games' A/B goes first, since its verdict gates every pin, and
  once it reads no worse each game's pin moves as soon as its own smoke play is clean, and
  `tools/publish_pages.sh <rush-2049-recomp checkout> <game> --played <dir>` publishes the files that were played,
  with no second build (it checks the moved main is the built one with only the pin moved) and boots it from Pages in
  headless Chrome, in a whole turn of its own between the next game's plays, and its row is updated. Each page
  published is then played from Pages in Firefox by its regular plan, `tools/play_pages.sh <rush-2049-recomp checkout>
  firefox <game>...`, which needs no build: a second machine with the ROMs can play those while the first builds and
  plays the next games, and hand back its `plays.jsonl` lines as a branch for the run's PR. Every play,
  the boots included, takes its turn in the same queue, so one page plays at a time on the machine (CLAUDE.md,
  Playing a page). A game fork whose own patches have to change with its pin (one that no longer applies on the tag)
  builds that commit with `--ref <commit> --browser <tag>` and plays it before its main moves. So does one whose own
  patches carry a copy of a fix the tag now has (docs/forks.md names it beside the fork's commit): the commit that moves
  its pin drops the copy, which leaves the shared fix the only one, unless a desktop build of the fork applies its own
  patches and no web patch (Conker's build.cmd, Banjo-Tooie's): the copy stays for that build.

## A critical fix

A fix for a page on Pages that crashes, never boots, loses its WebGPU device or can't be played moves the pins of the
games it fixes (this project's own recomps' by a PR), builds, plays in Chrome and Firefox and publishes each, and updates their rows,
in the same work; the others take it in the retest.

A change only a desktop build compiles (code outside the WGSL build, rt64 7734fe4) reaches Rush 2049's desktop build
through its pin, checked by a run of the desktop game: no page is republished and no game fork moves.

A fork's rt64 older than 7910126 needs a fresh build dir when it moves: an incremental build keeps WGSL made from an
`.hlsli` that changed (Conker's page built that way failed every pipeline with "Binding doesn't exist"); moving onto
7910126 rebuilds every shader.

## Building and publishing a page

Each game's page is a folder of the hub, the n64hub org's GitHub Pages site (n64hub/n64hub.github.io, at
`https://n64hub.com/<folder>/`), beside the games' page at its top, so they are one origin and a game plays in that page's
frame. Its Page cell in the README links it. It is built from main
with its shader list by its BUILDING.md on Linux, in rush-2049-recomp's Docker image (its `tools/docker/Dockerfile`,
which its `tools/remote_build.sh -C <checkout>` builds in; a tool a build lacks goes into that Dockerfile), with
`EM_CACHE` set to a mounted folder, since emsdk's environment resets it (a new one needs
`$EM_CACHE/sysroot/lib/pkgconfig` made first, or `embuilder` fails writing `sdl2.pc`).

`tools/publish_page.sh <build dir> <name> n64hub/n64hub.github.io "main <sha>" --into <folder>` publishes one;
`tools/publish_pages.sh` does it for every game, or the ones it is given, each into its folder (its list). The hub's
last commit names, a line each, the main each folder was built from (`<folder>/: built from main <sha>
(n64hub/<fork>)`, in `git log -1 --format=%b` of its gh-pages). A game fork's own Pages, at
`https://n64hub.com/<fork>/` under the org site's domain, is a page that sends a player on to the game's folder. A change to one game's own repo is played from a `--dry-run` build of
that game, then published by a `tools/publish_pages.sh` run with its name.

A test page, a game fork's branch to be played by hand before it lands, is published on its fork's own Pages, beside
that page, with `tools/publish_page.sh <build dir> <name> n64hub/<fork> "<branch> <sha>" --into <branch>`, at
`https://n64hub.com/<fork>/<branch>/`, and taken off with `--drop <branch>` when the branch lands or is
dropped. Publishing main's page keeps every folder, and a test page leaves main's page and the other folders alone
(the script's header says how). A test build in copies of its own on the build host (`PAGES_COPY`) cleans them the
same way once its work lands or is dropped (`tools/publish_pages.sh`'s header).

The first visit reloads once (`coi_serviceworker.js`); right after a publish that can take a second visit.
