// From a trace's stderr: workloads the rect loop saw (RTW), those cut, those with a cut verdict (CUT1/CUT2 cut=1), and
// the place arrow (a 38x24 rect) in each: paired, unpaired, or its workload cut (so its rects all held).
import fs from 'node:fs';
const lines = fs.readFileSync(process.argv[2], 'latin1').split('\n');
const rtw = new Map(), verdict = new Map(), arrow = new Map();
for (const l of lines) {
    const f = l.split(' ');
    if (f[0] === 'RTW') rtw.set(+f[1], f[2] === 'cut=1');
    else if ((f[0] === 'CUT1' || f[0] === 'CUT2') && l.trimEnd().endsWith('cut=1')) {
        const w = +f[1].slice(4);
        verdict.set(w, (verdict.get(w) || '') + f[0] + ' ' + f.find((x) => x.startsWith('step=')) + ' ' + f.find((x) => x.startsWith('prev=')) + '; ');
    } else if (f[0] === 'RT') {
        const r = (f.find((x) => x.startsWith('rect=')) || '').slice(5).split(',').map(Number);
        if (r.length === 4 && Math.abs(r[2] - r[0] - 152) <= 2 && Math.abs(r[3] - r[1] - 96) <= 2 && r[0] >= 0 && r[2] <= 4 * 427 * 3)
            arrow.set(+f[1], { x: r[0] / 4, paired: !l.includes(' X ') });
    }
}
const cut = [...rtw].filter(([, c]) => c).map(([w]) => w);
console.log(`workloads ${rtw.size}, with a cut verdict ${verdict.size}, cut ${cut.length}`);
const aw = [...arrow.keys()].sort((a, b) => a - b);
console.log(`arrow in ${aw.length} workloads, paired ${aw.filter((w) => arrow.get(w).paired).length}, unpaired ${aw.filter((w) => !arrow.get(w).paired).length}`);
// A workload cut between two the arrow is in (one apart): the arrow was there too, and held.
let held = 0;
for (let i = 1; i < aw.length; i++) for (let w = aw[i - 1] + 1; w < aw[i]; w++) if (rtw.get(w) && aw[i] - aw[i - 1] <= 3) { held++; if (process.argv[3]) console.log('held', w, verdict.get(w) || ''); }
console.log(`arrow held in cut workloads between its own: ${held}`);
if (process.argv[3]) for (const w of cut) console.log('cut', w, verdict.get(w) || '(no verdict line)');
