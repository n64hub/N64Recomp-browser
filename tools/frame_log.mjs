// Reads the game frames RT64 prints with RT64_FRAME_LOG set (rt64-web's WorkloadQueue::logGameFrame(), a build with
// RT64_GAME_FRAME_WORKLOADS on) and lays them over a window capture's (tools/capture_window.ps1), to tell a flicker
// in a frame drawn in parts from one in a frame matched wrongly against the one before.
//
//   node tools/frame_log.mjs <stderr.log> [--captures <captures.tsv>] [--around <capture>[,<capture>...]] [--span <ms>]
//
// It prints how many frames ended for each reason (present: a present of the framebuffer the frame drew; next: the
// next frame's first workload; wait: something waited for one of its workloads; held: a frame with fewer workloads
// that draw than the one before, held for the rest of them, ended at its limit; full: the queue; paused) and how many
// drew in fewer or more workloads than the frame before, and the runs of frames with the same shape (how many
// workloads draw and what each draws to). A frame drawn in parts reads as a frame of fewer workloads that draw between
// two of more; a frame matched wrongly as a frame of the same shape as its neighbours.
//
// With --around, the frames within --span ms (200) of each capture named (a name in captures.tsv, as flicker.txt
// lists them), one line each: its time against the capture's, its end, and its workloads' framebuffers.
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
    const i = args.indexOf(name);
    return (i >= 0) ? args[i + 1] : fallback;
};
const logPath = args[0];
if (!logPath || logPath.startsWith('--')) {
    console.error('usage: node tools/frame_log.mjs <stderr.log> [--captures <captures.tsv>] [--around <name>,...] [--span <ms>]');
    process.exit(2);
}

// The frames, each { t, n, end, drawn, before, workloads: [{ id, shown, off, pairs: ['ADDR/W', ...] }] }.
const frames = [];
for (const line of fs.readFileSync(logPath, 'utf8').split(/\r?\n/)) {
    let m = line.match(/^GF t=(\d+) n=(\d+) end=(\w+) drawn=(\d+) before=(\d+)/);
    if (m) {
        frames.push({ t: Number(m[1]), n: Number(m[2]), end: m[3], drawn: Number(m[4]), before: Number(m[5]), workloads: [] });
        continue;
    }

    m = line.match(/^\s+WL (\d+) shown=([0-9A-F]+) off=(\d) pairs=\d+:(.*)$/);
    if (m && frames.length > 0) {
        frames[frames.length - 1].workloads.push({ id: Number(m[1]), shown: m[2], off: m[3] === '1',
            pairs: m[4].trim().split(/\s+/).filter(Boolean) });
    }
}

if (frames.length === 0) {
    console.log('no game frames: was the build made with RT64_GAME_FRAME_WORKLOADS, and RT64_FRAME_LOG set?');
    process.exit(1);
}

// A frame's shape: the framebuffers each workload that draws draws to, in order.
const shape = (f) => f.workloads.filter((w) => w.pairs.length > 0)
    .map((w) => w.pairs.filter((p) => !p.endsWith('/empty')).map((p) => p.split('/')[0]).join('+')).join(' ');

const ends = {};
let fewer = 0, more = 0;
for (const f of frames) {
    ends[f.end] = (ends[f.end] || 0) + 1;
    fewer += (f.drawn < f.before) ? 1 : 0;
    more += (f.drawn > f.before) ? 1 : 0;
}

const seconds = (frames[frames.length - 1].t - frames[0].t) / 1000;
console.log(`${frames.length} game frames in ${seconds.toFixed(1)} s; ended by ${Object.entries(ends).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`${fewer} drew in fewer workloads than the frame before, ${more} in more`);

const runs = [];
for (const f of frames) {
    const s = `${f.drawn} drawn: ${shape(f)}`;
    if (runs.length > 0 && runs[runs.length - 1].s === s) {
        runs[runs.length - 1].count++;
    }
    else {
        runs.push({ s, t: f.t, count: 1 });
    }
}

console.log(`${runs.length} runs of frames with the same shape (time from the first frame, frames, shape):`);
for (const r of runs) {
    console.log(`  ${((r.t - frames[0].t) / 1000).toFixed(3).padStart(8)} s ${String(r.count).padStart(5)}  ${r.s}`);
}

const around = opt('--around');
if (around) {
    const capturesPath = opt('--captures');
    if (!capturesPath) {
        console.error('--around needs --captures');
        process.exit(2);
    }

    const captures = new Map(fs.readFileSync(capturesPath, 'utf8').split(/\r?\n/).filter(Boolean)
        .map((l) => l.split('\t')).map(([name, t]) => [name, Number(t)]));
    const span = Number(opt('--span', '200'));
    for (const name of around.split(',')) {
        const t = captures.get(name);
        if (t === undefined) {
            console.log(`\n${name}: not in ${capturesPath}`);
            continue;
        }

        console.log(`\n${name} at ${t}:`);
        for (const f of frames.filter((f) => Math.abs(f.t - t) <= span)) {
            console.log(`  ${String(f.t - t).padStart(5)} ms ${f.end.padEnd(7)} ${f.drawn}/${f.before} drawn  ${f.workloads.map((w) =>
                `${w.id}${w.off ? ' off' : ''}${(w.shown !== '00000000') ? ' shows ' + w.shown : ''}[${w.pairs.join(' ')}]`).join(' ')}`);
        }
    }
}
