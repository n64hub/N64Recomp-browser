// How much of its wasm heap a page has taken, all through a play, and what ran it out: a preload for play_page.mjs
// (--preload tools/heap_probe.js) that logs
//
//   heap sbrk pointer at <hex> [or <hex>...]  once, where the page's sbrk keeps the heap's break (or may)
//   heap <s> sbrk <MB> len <MB>         each second, the break: what malloc has taken from the heap so far, and the
//                                       heap's length (HEAPU8.length)
//   heapoom <thread> asked <bytes>: <stack>
//                                       a thread's sbrk past the heap's end, the moment before abort("OOM")
//   heapgrow <thread> asked <bytes>: <stack>
//                                       the same on a page linked to grow its heap: the heap grows, or the malloc fails
//
// and, with heapwalk in the page's query (play_page.mjs --query ?heapwalk), what the heap holds, every 20 s:
//
//   heapwalk <s> brk <MB> used <MB> free <MB> chunks <n>       dlmalloc's chunks from the heap's start to its top
//   heapwalk <s> most: <size>x<count>=<MB> ...                  the chunk sizes that hold the most, in use
//   heapwalk <s> grew: <size>x+<count>=<MB> ...                 the sizes that gained the most since the last walk
//   heapwalk <s> sample <size> at <hex>: <words>               the first words of two of the most grown sizes' newest
//   heapwalk <s> held <hex> by <hex> in <size> +<offset>: <words>
//                                       a word anywhere in the heap that points at one of the most grown size's
//                                       chunks (six of them, old and new), the chunk that word is in and that chunk's
//                                       first words, or "static" for one below the heap: what keeps them. A growing
//                                       vector or map shows as one chunk holding them all at a stride, reallocated
//                                       larger as it grows; none at all is a leak, a malloc never freed
//
// A page's heap is INITIAL_MEMORY (frontend/CMakeLists.txt) and never grows, so a malloc that doesn't fit calls
// Emscripten's resize import, which aborts with "Aborted(OOM)" and a trap in Emscripten's abort() that names nothing
// (tools/wasm_offset.mjs). A game's own link options can let it grow instead (Conker's page: -sALLOW_MEMORY_GROWTH,
// whose resize import grows the Memory), and then the length is what climbs. The probe wraps that import in every thread, the page's and each pthread worker's (each
// started from a blob that runs the probe and then the page's script), so the request's size and the stack that made
// it come out first, on the page's console. The stack names wasm functions by index (wasm-function[<n>]) and offset,
// which wasm_offset.mjs or the same build linked with --profiling-funcs names. The break is read from the shared heap:
// its address is the one constant in the small function that calls the resize import (sbrk), found in the page's
// wasm as it loads. dlmalloc never gives the break back, so a page that leaks shows a break that climbs, one that
// allocates in a loop a break that leaps in the seconds before the abort, and one whose break holds ran out on a single
// request. Only a cross-origin isolated document runs it: the page's own, after
// coi_serviceworker.js's reload.
if (self.crossOriginIsolated && !self.__heapProbe) {
  self.__heapProbe = true;
  const t0 = performance.now();
  const secs = () => ((performance.now() - t0) / 1000).toFixed(0);
  // In every thread: the resize import, which only aborts, wrapped to say how much was asked and from where.
  const threadProbe = () => {
    const channel = new BroadcastChannel('heapprobe');
    const wrap = (imports) => {
      for (const ns of Object.values(imports || {})) for (const name of Object.keys(ns || {})) {
        const f = ns[name];
        const source = typeof f === 'function' ? Function.prototype.toString.call(f) : '';
        if (/abortOnCannotGrowMemory\(|growMemory\(/.test(source)) {
          self.__heapProbeImport = name;
          const kind = /growMemory\(/.test(source) ? 'heapgrow' : 'heapoom';
          ns[name] = (size) => {
            channel.postMessage({ kind, thread: self.name || 'main', size: size >>> 0, stack: new Error().stack });
            return f(size);
          };
        }
      }
    };
    const instantiate = WebAssembly.instantiate;
    WebAssembly.instantiate = (module, imports) => { wrap(imports); return instantiate(module, imports); };
    const streaming = WebAssembly.instantiateStreaming;
    if (streaming) WebAssembly.instantiateStreaming = (response, imports) => { wrap(imports); return streaming(response, imports); };
  };
  threadProbe();
  new BroadcastChannel('heapprobe').onmessage = ({ data }) =>
    console.log(`${data.kind} ${data.thread} asked ${data.size}: ${String(data.stack).replace(/\s+/g, ' ').slice(0, 3000)}`);
  const PageWorker = self.Worker;
  self.Worker = function (url, options) {
    if (options && options.name === 'em-pthread') {
      const source = `(${threadProbe})();\nimportScripts(${JSON.stringify(new URL(url, location.href).href)});`;
      return new PageWorker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })), options);
    }
    return new PageWorker(url, options);
  };
  self.Worker.prototype = PageWorker.prototype;
  // sbrk's pointer: a function under 200 bytes that calls the resize import and holds one address (sizes and masks
  // match too: an address is 4-aligned and neither a power of two nor one less). The call is found by its bytes, which
  // other code can hold too: where the wasm has a name section (a build linked with --profiling-funcs), the one it
  // calls sbrk; without one every function that passes (GoldenEye's and Majora's Mask's pages have three), and the
  // break is the largest of their values that is 8-aligned, past 1 MB and inside the heap: the others hold 0 there.
  const findSbrk = (bytes) => {
    const b = new Uint8Array(bytes);
    let p = 8;
    const leb = () => { let r = 0, s = 0, x; do { x = b[p++]; r |= (x & 127) << s; s += 7; } while (x & 128); return r >>> 0; };
    const str = () => { const n = leb(); const t = new TextDecoder().decode(b.subarray(p, p + n)); p += n; return t; };
    let imported = 0, target = -1, named = -1;
    const found = [];
    while (p < b.length) {
      const id = b[p++], size = leb(), end = p + size;
      if (id === 2) {
        for (let i = 0, n = leb(); i < n; i++) {
          str();
          const field = str(), kind = b[p++];
          if (kind === 0) { if (field === self.__heapProbeImport) target = imported; imported++; leb(); }
          else if (kind === 1) { p++; if (leb() & 1) { leb(); leb(); } else leb(); }
          else if (kind === 2) { if (leb() & 1) { leb(); leb(); } else leb(); }
          else if (kind === 3) p += 2;
          else if (kind === 4) { p++; leb(); }
        }
      }
      if (id === 10 && target >= 0) {
        for (let i = 0, n = leb(); i < n; i++) {
          const length = leb(), start = p, stop = p + length;
          if (length < 200) {
            let calls = false;
            const consts = new Set();
            for (let q = start; q < stop - 1; q++) {
              if (b[q] === 0x10) { p = q + 1; if (leb() === target) calls = true; }
              if (b[q] === 0x41) { p = q + 1; const v = leb(); if (v > 65536 && v < 0x8000000) consts.add(v); }
            }
            if (calls && consts.size) found.push(Object.assign([...consts], { index: imported + i }));
          }
          p = stop;
        }
      }
      if (id === 0 && str() === 'name') {
        while (p < end) {
          const sub = b[p++], subEnd = leb() + p;
          if (sub === 1) for (let i = 0, n = leb(); i < n; i++) { const index = leb(); if (str() === 'sbrk') named = index; }
          p = subEnd;
        }
      }
      p = end;
    }
    const address = (v) => !(v & 3) && (v & (v - 1)) && ((v + 1) & v);
    return found.filter((c) => named < 0 || c.index === named).map((c) => c.filter(address))
      .filter((c) => c.length === 1).map((c) => c[0]);
  };
  let sbrks = [];
  const pageStreaming = WebAssembly.instantiateStreaming;
  WebAssembly.instantiateStreaming = (response, imports) => pageStreaming(Promise.resolve(response).then((r) => {
    r.clone().arrayBuffer().then((bytes) => {
      sbrks = findSbrk(bytes);
      console.log(sbrks.length ? `heap sbrk pointer at ${sbrks.map((a) => `0x${a.toString(16)}`).join(' or ')}` : 'heap no sbrk pointer found');
    }).catch((e) => console.log(`heap no wasm bytes: ${e}`));
    return r;
  }), imports);
  // The heap: the shared Memory the page makes for its threads.
  let memory = null;
  const PageMemory = WebAssembly.Memory;
  WebAssembly.Memory = function (descriptor) {
    const m = new PageMemory(descriptor);
    if (descriptor && descriptor.shared) memory = m;
    return m;
  };
  WebAssembly.Memory.prototype = PageMemory.prototype;
  setInterval(() => {
    if (!memory || !sbrks.length) return;
    const heap = new Uint32Array(memory.buffer);
    const breaks = sbrks.map((a) => heap[a >>> 2]).filter((v) => !(v & 7) && v > 1 << 20 && v <= memory.buffer.byteLength);
    if (breaks.length) console.log(`heap ${secs()} sbrk ${(Math.max(...breaks) / 1048576).toFixed(1)} len ${(memory.buffer.byteLength / 1048576).toFixed(1)}`);
  }, 1000);
  // The walk, in a worker of its own over the shared heap, so the page's threads run on beside it (a walk of 1.4 GB
  // takes about a second, the pointer search most of it). dlmalloc's state (the page's one mspace, in its static data)
  // is found by its fields: topsize, least_addr and top at words 3, 4 and 6, top past least_addr and top + topsize at
  // the break. Each chunk from least_addr is a header word (+4) of its size and flags (2: in use), up to top. Other
  // threads malloc while it walks, so a walk can stop short at a chunk being split: it says so, and the next one is
  // whole.
  if (/[?&]heapwalk\b/.test(location.search)) {
    const walker = () => {
      let heap = null, state = -1, last = null;
      const hex = (v) => (v >>> 0).toString(16).padStart(8, '0');
      const mb = (v) => (v / 1048576).toFixed(1);
      const words = (address, count, size) => {
        const w = [];
        for (let k = 0; k < count && k * 4 < size; k++) w.push(hex(heap[(address >>> 2) + k]));
        return w.join(' ');
      };
      // Every chunk from the first to top: fn(chunk, size, used).
      const chunks = (fn) => {
        const least = heap[state + 4], top = heap[state + 6];
        for (let p = least + ((8 - ((least + 8) & 7)) & 7); p < top;) {
          const head = heap[(p + 4) >>> 2], size = head & ~7;
          if (size < 16 || p + size > top) return `stopped at a chunk being made at ${hex(p)}`;
          fn(p, size, (head & 2) !== 0);
          p += size;
        }
        return '';
      };
      onmessage = ({ data }) => {
        if (data.buffer) { heap = new Uint32Array(data.buffer); return; }
        const { brk, t } = data;
        if (state < 0) {
          for (let i = 1, end = Math.min(heap.length - 8, (64 << 20) >>> 2); i < end && state < 0; i++) {
            const least = heap[i + 4], top = heap[i + 6], to = top + heap[i + 3];
            if (least >= 1 << 20 && (least >>> 2) > i && top > least && top < brk && to <= brk && to > brk - 4096) state = i;
          }
          if (state < 0) { postMessage(`heapwalk ${t} no dlmalloc state found yet`); return; }
        }
        const sizes = new Map();
        let used = 0, free = 0, count = 0;
        const stopped = chunks((p, size, inUse) => {
          count++;
          if (!inUse) { free += size; return; }
          used += size;
          let e = sizes.get(size);
          if (!e) sizes.set(size, e = { count: 0, old: [], newest: [] });
          if (e.count++ % 97 === 50 && e.old.length < 3) e.old.push(p);
          e.newest.push(p);
          if (e.newest.length > 3) e.newest.shift();
        });
        const lines = [`heapwalk ${t} brk ${mb(brk)} used ${mb(used)} free ${mb(free)} chunks ${count} ${stopped}`];
        const list = (entries) => entries.map(([size, n]) => `${size}x${n}=${mb(size * Math.abs(n))}`).join(' ');
        lines.push(`heapwalk ${t} most: ` + list([...sizes].map(([size, e]) => [size, e.count]).sort((a, b) => b[0] * b[1] - a[0] * a[1]).slice(0, 12)));
        if (last) {
          const grew = [...sizes].map(([size, e]) => [size, e.count - (last.get(size) || 0), e]).filter((g) => g[1] > 0)
            .sort((a, b) => b[0] * b[1] - a[0] * a[1]);
          lines.push(`heapwalk ${t} grew: ` + list(grew.slice(0, 12)).replace(/x(\d)/g, 'x+$1'));
          for (const [size, , e] of grew.slice(0, 3)) for (const p of e.newest.slice(-2)) lines.push(`heapwalk ${t} sample ${size} at ${hex(p + 8)}: ${words(p + 8, 24, size - 8)}`);
          if (grew.length) {
            const targets = new Set([...grew[0][2].old, ...grew[0][2].newest].map((p) => p + 8));
            const hits = [];
            for (let i = 0, end = Math.min(heap.length, heap[state + 6] >>> 2); i < end && hits.length < 16; i++) if (targets.has(heap[i])) hits.push(i * 4);
            if (!hits.length) lines.push(`heapwalk ${t} held: nothing points at ${[...targets].map(hex).join(' ')}`);
            for (const a of hits) if (a < heap[state + 4]) lines.push(`heapwalk ${t} held ${hex(heap[a >>> 2])} by ${hex(a)} static: ${words(a - 16, 12, 48)}`);
            chunks((p, size, inUse) => {
              for (const a of hits) if (a >= p + 8 && a < p + size) lines.push(`heapwalk ${t} held ${hex(heap[a >>> 2])} by ${hex(a)} in ${size}${inUse ? '' : ' (free)'} +${a - p - 8}: ${words(p + 8, 16, size - 8)}`);
            });
          }
        }
        last = new Map([...sizes].map(([size, e]) => [size, e.count]));
        postMessage(lines.join('\n'));
      };
    };
    const walk = new PageWorker(URL.createObjectURL(new Blob([`(${walker})();`], { type: 'text/javascript' })));
    walk.onmessage = ({ data }) => { for (const line of data.split('\n')) console.log(line); };
    let given = false;
    setInterval(() => {
      if (!memory || !sbrks.length) return;
      if (!given) { walk.postMessage({ buffer: memory.buffer }); given = true; }
      const heap = new Uint32Array(memory.buffer);
      const breaks = sbrks.map((a) => heap[a >>> 2]).filter((v) => !(v & 7) && v > 1 << 20 && v <= memory.buffer.byteLength);
      if (breaks.length) walk.postMessage({ brk: Math.max(...breaks), t: secs() });
    }, 20000);
  }
}
