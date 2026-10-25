// What each guess at a game frame's length would hold and cut, from a play: reads the VILOG lines
// tools/frame_lengths.js printed in play_page.mjs's output and, from the order of the game's frames of 2 and 3 VIs,
// counts what RT64_UNEVEN_FRAME_RATES (rt64 179adb8, VIHistory::logicalRateFromFactors) and other guesses would do.
//
//   node tools/frame_lengths.mjs <play_page.mjs's output>
//
// RT64 draws a frame's interpolated frames at a rate it guesses before the frame's length is known. A frame that lasts
// longer than the guess holds its last interpolated frame (a display frame with no present); one that lasts less is cut
// short when the next frame comes (a skipped moment). So, from the frames' lengths alone, it counts per guess the
// display frames held and the frames cut, in display frames at 60 a second (at a display of 240, four times as many).
// The guesses are only made where RT64 interpolates at all (the last three frames' slowest at most twice the fastest):
//
//   main   the fastest of the last three (RT64's, where the slowest took fewer than 3 of the last 8: rt64 7844c07)
//   last   the last frame's
//   mode3  the most common of the last three (a tie: the faster)
//   mode5  the most common of the last five
//
// Each at a lag of 1 and 2: RT64 counts a frame's VIs at the screen's swap to it (rt64_state.cpp, pushFactor) but picks
// the rate as the next frame's display list ends (logicalRateFromFactors), so what it knows may end a frame or two
// before the frame it times. Last, per 5 s of animation frames at 60 a second, the display frames main would hold at
// each lag against those that got no present: the lag that fits is RT64's (a run with frames held by the game's
// lengths, not by its loads or the browser's own pacing, tells them apart).
import fs from 'node:fs';

let P = '', D = '';
for (const line of fs.readFileSync(process.argv[2], 'utf8').split('\n')) {
  const m = line.match(/VILOG \d+ P(\d+) D([0-9x]+)/);
  if (m) { P += m[1]; D += m[2]; }
}
if (!D) throw new Error('no VILOG lines: was the play run with --preload tools/frame_lengths.js and frame-clock?');

// Each move of the clock is one game frame, of that many VIs.
const frames = [];
for (let i = 0; i < D.length; i++) if (D[i] !== '0') frames.push({ at: i, vis: D[i] === 'x' ? Infinity : Number(D[i]) });
const v = frames.map((f) => f.vis);
const count = (xs) => xs.reduce((c, x) => ({ ...c, [x]: (c[x] ?? 0) + 1 }), {});
const runs = [];
let run = 0;
for (const x of v) {
  if (x === 3) run++;
  else if (run) { runs.push(run); run = 0; }
}
const held = [...P].filter((c) => c === '0').length;
console.log(`${D.length} animation frames, ${v.length} game frames, VIs a frame (VIs: frames) ${JSON.stringify(count(v))}`);
console.log(`runs of 3-VI frames (length: runs) ${JSON.stringify(count(runs))}`);
console.log(`animation frames without a present ${held} (${(held / D.length * 100).toFixed(1)}%)`);

const mode = (xs) => {
  const c = count(xs);
  return Number(Object.keys(c).sort((a, b) => (c[b] - c[a]) || (a - b))[0]);
};
const guesses = {
  main: (h) => Math.min(...h.slice(-3)),
  last: (h) => h[h.length - 1],
  mode3: (h) => mode(h.slice(-3)),
  mode5: (h) => mode(h.slice(-5)),
};
const interpolated = (h) => h.every((x) => x <= 3) && (Math.max(...h.slice(-3)) <= 2 * Math.min(...h.slice(-3)));
for (const lag of [1, 2]) {
  console.log(`lag ${lag}: a guess knows the frames up to ${lag} before the one it times`);
  for (const [name, guess] of Object.entries(guesses)) {
    let timed = 0, holds = 0, cuts = 0, cutFrames = 0;
    for (let k = lag + 4; k < v.length; k++) {
      const h = v.slice(k - lag - 4, k - lag + 1);
      if (!interpolated(h) || (v[k] > 3)) continue;
      timed++;
      const g = guess(h);
      if (v[k] > g) holds += v[k] - g;
      if (g > v[k]) { cuts++; cutFrames += g - v[k]; }
    }
    console.log(`  ${name.padEnd(5)} ${timed} frames timed: ${holds} display frames held, ${cuts} frames cut (${cutFrames} display frames of motion skipped)`);
  }
}
for (const lag of [0, 1, 2, 3]) {
  let predicted = 0, observed = 0, squares = 0, windows = 0;
  for (let w = 0; w + 300 <= D.length; w += 300, windows++) {
    let p = 0;
    for (let k = lag + 2; k < frames.length; k++) {
      if ((frames[k].at < w) || (frames[k].at >= w + 300)) continue;
      const h = v.slice(k - lag - 2, k - lag + 1);
      if (!interpolated(h) || (v[k] > 3)) continue;
      p += Math.max(0, v[k] - Math.min(...h));
    }
    const o = [...P.slice(w, w + 300)].filter((c) => c === '0').length;
    predicted += p;
    observed += o;
    squares += (p - o) ** 2;
  }
  console.log(`main at lag ${lag}: ${predicted} display frames held, ${observed} without a present, ` +
    `${Math.sqrt(squares / windows).toFixed(1)} apart per 5 s (rms)`);
}
