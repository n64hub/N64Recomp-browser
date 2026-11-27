// Per workload with the place arrow (a 38x24 rect): its x, how it paired (the RT line's tail), and the cut lines.
import fs from 'node:fs';
const lines = fs.readFileSync(process.argv[2], 'latin1').split('\n');
const cuts = new Map(), arrows = new Map();
for (const l of lines) {
    const f = l.split(' ');
    if (f[0] === 'CUT1' || f[0] === 'CUT2') {
        const wid = +f[1].slice(4);
        if (l.endsWith('cut=1')) cuts.set(wid, (cuts.get(wid) || '') + f[0] + ' ' + (f.find(x => x.startsWith('step=')) || '') + ' ' + (f.find(x => x.startsWith('prev=')) || '') + ';');
    } else if (f[0] === 'RT') {
        const r = (f.find(x => x.startsWith('rect=')) || '').slice(5).split(',').map(Number);
        if (r.length === 4 && Math.abs(r[2] - r[0] - 152) <= 2 && Math.abs(r[3] - r[1] - 96) <= 2) {
            const wid = +f[1];
            const i = l.indexOf(' X ');
            arrows.set(wid, `x=${r[0] / 4} ${i >= 0 ? l.slice(i + 1) : l.split(' ').slice(-3).join(' ')}`);
        }
    }
}
const ws = [...arrows.keys()].sort((a, b) => a - b);
let prevX = null;
for (const w of ws) {
    const x = +arrows.get(w).split(' ')[0].slice(2);
    console.log(w, (prevX === null ? '' : (x - prevX).toFixed(1)).padStart(6), arrows.get(w), cuts.has(w) ? 'CUT ' + cuts.get(w) : '');
    prevX = x;
}
