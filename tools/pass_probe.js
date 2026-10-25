// What a page's presents spend the GPU on: a preload for play_page.mjs (--preload tools/pass_probe.js) that wraps the
// page's WebGPU calls and, every 5 s, prints a "passes:" line per kind of pass with how many a present has, their
// draws or workgroups, and the GPU time each takes a present, from timestamp queries where the browser gives them
// ('timestamp-query', where the adapter offers it: Chrome, quantized to 100 us, which averages out over many passes;
// Firefox 158 on a laptop's Intel UHD; counts only elsewhere).
//
// A pass's kind is its attachments' size and formats (a compute pass: "compute" and its shader's WGSL size), and a present is a getCurrentTexture
// call on a WebGPU canvas, so a kind's numbers are per present whatever the game's own frame rate. Copies are counted
// beside the passes, untimed: WebGPU times only passes. The passes are reported an interval late, once their
// timestamps are back. The timestamps cost a query resolve and a readback per command buffer. Beside them, the draws a
// present by fragment shader, each named by its WGSL's size ("70 KB"), and one present's passes in order.
//
// To read what a shader costs, leave its draws out: ?probe-skip=<KB>,... (play_page.mjs --query) skips every draw
// whose fragment shader is that size, and the GPU time and presents a second that come back are the page without
// them (the picture is wrong meanwhile). ?probe-dump=<KB>,... prints each module of that size once, as a JSON string
// after "passes: wgsl ", to read or to build in a page of its own.
(() => {
  if (typeof GPUCommandEncoder === 'undefined') return;
  const CAP = 64;
  const viewTexture = new WeakMap();
  const encoderDevice = new WeakMap();
  const encoderState = new WeakMap();
  const bufferState = new WeakMap();
  const passRecord = new WeakMap();
  const pool = [];
  let presents = 0;
  let current = { presents: 0, records: [] };
  let previous = null;
  let sequence = null;

  const wrap = (proto, name, make) => {
    const original = proto[name];
    if (original) proto[name] = make(original);
  };
  const size = (texture) => texture ? `${texture.width}x${texture.height}` : '?';

  wrap(GPUAdapter.prototype, 'requestDevice', (original) => function (descriptor) {
    const d = Object.assign({}, descriptor);
    if (this.features.has('timestamp-query')) d.requiredFeatures = [...(d.requiredFeatures ?? []), 'timestamp-query'];
    return original.call(this, d);
  });
  wrap(GPUTexture.prototype, 'createView', (original) => function () {
    const view = original.apply(this, arguments);
    viewTexture.set(view, this);
    return view;
  });
  // Each draw's fragment shader by its WGSL's size (the ubershader is the largest).
  const moduleSize = new WeakMap();
  const pipelineShader = new WeakMap();
  const passState = new WeakMap();
  let shaders = new Map();
  // ?probe-skip=<KB>,...: draws whose fragment shader is that size are left out, to read what they cost.
  const skip = new Set((new URLSearchParams(location.search).get('probe-skip') ?? '').split(',').filter((k) => k).map((k) => `${k} KB`));
  const dump = new Set((new URLSearchParams(location.search).get('probe-dump') ?? '').split(',').filter((k) => k).map((k) => `${k} KB`));
  const dumped = new Set();
  if (skip.size) console.log(`passes: leaving out the draws of the ${[...skip].join(', ')} fragment shaders`);
  wrap(GPUDevice.prototype, 'createShaderModule', (original) => function (descriptor) {
    const module = original.apply(this, arguments);
    const code = descriptor?.code ?? '';
    moduleSize.set(module, code.length);
    // ?probe-dump=<KB>: each module of that size printed once, as a JSON string, to read or build alone.
    if (dump.has(`${Math.round(code.length / 1024)} KB`) && !dumped.has(code)) {
      dumped.add(code);
      console.log(`passes: wgsl ${JSON.stringify(code)}`);
    }
    return module;
  });
  const shaderOf = (descriptor) => descriptor?.fragment?.module ? `${Math.round((moduleSize.get(descriptor.fragment.module) ?? 0) / 1024)} KB` : 'none';
  wrap(GPUDevice.prototype, 'createRenderPipeline', (original) => function (descriptor) {
    const pipeline = original.apply(this, arguments);
    pipelineShader.set(pipeline, shaderOf(descriptor));
    return pipeline;
  });
  wrap(GPUDevice.prototype, 'createRenderPipelineAsync', (original) => function (descriptor) {
    return original.apply(this, arguments).then((pipeline) => { pipelineShader.set(pipeline, shaderOf(descriptor)); return pipeline; });
  });
  // A compute pipeline by its shader's WGSL size, to a tenth of a KB, which tells RT64's compute shaders apart.
  const computeOf = (descriptor) => `compute ${((moduleSize.get(descriptor?.compute?.module) ?? 0) / 1024).toFixed(1)} KB`;
  wrap(GPUDevice.prototype, 'createComputePipeline', (original) => function (descriptor) {
    const pipeline = original.apply(this, arguments);
    pipelineShader.set(pipeline, computeOf(descriptor));
    return pipeline;
  });
  wrap(GPUDevice.prototype, 'createComputePipelineAsync', (original) => function (descriptor) {
    return original.apply(this, arguments).then((pipeline) => { pipelineShader.set(pipeline, computeOf(descriptor)); return pipeline; });
  });
  wrap(GPUDevice.prototype, 'createCommandEncoder', (original) => function () {
    const encoder = original.apply(this, arguments);
    encoderDevice.set(encoder, this);
    return encoder;
  });

  // Each command encoder's query set, a pass's two timestamps in it.
  const timestampsFor = (encoder) => {
    let state = encoderState.get(encoder);
    if (state === undefined) {
      const device = encoderDevice.get(encoder);
      state = null;
      if (device && device.features.has('timestamp-query')) {
        state = pool.pop() ?? {
          querySet: device.createQuerySet({ type: 'timestamp', count: 2 * CAP }),
          resolve: device.createBuffer({ size: 16 * CAP, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }),
          read: device.createBuffer({ size: 16 * CAP, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }),
        };
        state.records = [];
      }
      encoderState.set(encoder, state);
    }
    return (state && state.records.length < CAP) ? state : null;
  };
  const begin = (encoder, descriptor, record) => {
    current.records.push(record);
    if (sequence) sequence.push(record);
    const state = timestampsFor(encoder);
    if (!state) return descriptor;
    const n = state.records.length;
    state.records.push(record);
    return Object.assign({}, descriptor, {
      timestampWrites: { querySet: state.querySet, beginningOfPassWriteIndex: 2 * n, endOfPassWriteIndex: 2 * n + 1 },
    });
  };

  wrap(GPUCommandEncoder.prototype, 'beginRenderPass', (original) => function (descriptor) {
    const colors = (descriptor.colorAttachments ?? []).filter((a) => a);
    const colorTextures = colors.map((a) => viewTexture.get(a.view));
    const depth = descriptor.depthStencilAttachment;
    const depthTexture = depth ? viewTexture.get(depth.view) : null;
    const formats = colorTextures.map((t) => t?.format ?? '?');
    if (depthTexture) formats.push(depthTexture.format + (depth.depthReadOnly ? ' read-only' : ''));
    const clears = colors.some((a) => a.loadOp === 'clear') ? ' clear' : '';
    const record = { kind: `${size(colorTextures[0] ?? depthTexture)} ${formats.join('+')}${clears}`, work: 0, ns: null };
    const pass = original.call(this, begin(this, descriptor, record));
    passRecord.set(pass, record);
    passState.set(pass, { shader: '?' });
    return pass;
  });
  wrap(GPURenderPassEncoder.prototype, 'setPipeline', (original) => function (pipeline) {
    const state = passState.get(this);
    if (state) state.shader = pipelineShader.get(pipeline) ?? '?';
    return original.apply(this, arguments);
  });
  wrap(GPUCommandEncoder.prototype, 'beginComputePass', (original) => function (descriptor) {
    const record = { kind: 'compute', work: 0, ns: null };
    const pass = original.call(this, begin(this, descriptor ?? {}, record));
    passRecord.set(pass, record);
    return pass;
  });
  for (const name of ['draw', 'drawIndexed', 'drawIndirect', 'drawIndexedIndirect']) {
    wrap(GPURenderPassEncoder.prototype, name, (original) => function () {
      const record = passRecord.get(this);
      if (record) record.work++;
      const state = passState.get(this);
      if (state) {
        shaders.set(state.shader, (shaders.get(state.shader) ?? 0) + 1);
        if (skip.has(state.shader)) return undefined;
      }
      return original.apply(this, arguments);
    });
  }
  wrap(GPUComputePassEncoder.prototype, 'setPipeline', (original) => function (pipeline) {
    const record = passRecord.get(this);
    if (record) record.kind = pipelineShader.get(pipeline) ?? 'compute';
    return original.apply(this, arguments);
  });
  wrap(GPUComputePassEncoder.prototype, 'dispatchWorkgroups', (original) => function (x, y = 1, z = 1) {
    const record = passRecord.get(this);
    if (record) record.work += x * y * z;
    return original.apply(this, arguments);
  });
  // The probe's own readback copies are made with the unwrapped calls, so they aren't counted as the page's.
  const resolveQuerySet = GPUCommandEncoder.prototype.resolveQuerySet;
  const copyBufferToBuffer = GPUCommandEncoder.prototype.copyBufferToBuffer;
  const copyKind = { copyTextureToTexture: 'copy texture to texture', copyTextureToBuffer: 'copy texture to buffer',
    copyBufferToTexture: 'copy buffer to texture', copyBufferToBuffer: 'copy buffer to buffer' };
  for (const name of Object.keys(copyKind)) {
    wrap(GPUCommandEncoder.prototype, name, (original) => function (source, destination, extent) {
      const texture = source?.texture ?? destination?.texture;
      const area = Array.isArray(extent) ? `${extent[0]}x${extent[1] ?? 1}` : extent ? `${extent.width}x${extent.height ?? 1}` : '';
      const record = { kind: `${copyKind[name]} ${texture ? area : ''}`.trim(), work: 1, ns: null, copy: true };
      current.records.push(record);
      if (sequence && texture) sequence.push(record);
      return original.apply(this, arguments);
    });
  }
  wrap(GPUCommandEncoder.prototype, 'finish', (original) => function () {
    const state = encoderState.get(this);
    if (state && state.records.length) {
      const n = state.records.length;
      resolveQuerySet.call(this, state.querySet, 0, 2 * n, state.resolve, 0);
      copyBufferToBuffer.call(this, state.resolve, 0, state.read, 0, 16 * n);
    }
    const buffer = original.apply(this, arguments);
    if (state) bufferState.set(buffer, state);
    return buffer;
  });
  wrap(GPUQueue.prototype, 'submit', (original) => function (buffers) {
    const result = original.apply(this, arguments);
    for (const buffer of buffers) {
      const state = bufferState.get(buffer);
      if (!state) continue;
      if (!state.records.length) { pool.push(state); continue; }
      state.read.mapAsync(GPUMapMode.READ).then(() => {
        const t = new BigUint64Array(state.read.getMappedRange(0, 16 * state.records.length));
        state.records.forEach((record, i) => {
          const ns = Number(t[2 * i + 1] - t[2 * i]);
          if (ns >= 0 && ns < 1e9) record.ns = ns;
        });
        state.read.unmap();
        state.records = [];
        pool.push(state);
      }, () => {});
    }
    return result;
  });

  // Presents, counted as play_page.mjs counts them.
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind) {
    const context = getContext.apply(this, arguments);
    if (kind === 'webgpu' && context && !context.__passProbe) {
      context.__passProbe = true;
      const getCurrentTexture = context.getCurrentTexture;
      context.getCurrentTexture = function () {
        current.presents++;
        // The passes between an interval's second present and its third, in order.
        if (current.presents === 3 && sequence) {
          console.log(`passes: one present, in order: ${sequence.map((r) => `[${r.kind}${r.copy ? '' : ` ${r.work}`}]`).join(' ')}`);
        }
        sequence = (current.presents === 2) ? [] : null;
        return getCurrentTexture.apply(this, arguments);
      };
    }
    return context;
  };

  setInterval(() => {
    const report = previous;
    previous = current;
    current = { presents: 0, records: [] };
    const drawn = shaders;
    shaders = new Map();
    if (previous.presents) {
      const p = previous.presents;
      const list = [...drawn].sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([shader, draws]) => `${shader} ${(draws / p).toFixed(1)}`);
      console.log(`passes: draws a present by fragment shader: ${list.join(', ')}`);
    }
    if (!report || !report.presents) return;
    const kinds = new Map();
    for (const r of report.records) {
      const k = kinds.get(r.kind) ?? { n: 0, work: 0, timed: 0, ns: 0, copy: r.copy };
      k.n++;
      k.work += r.work;
      if (r.ns !== null) { k.timed++; k.ns += r.ns; }
      kinds.set(r.kind, k);
    }
    const p = report.presents;
    let totalMs = 0;
    const lines = [...kinds].map(([kind, k]) => {
      const ms = k.timed ? (k.ns / k.timed) * k.n / p / 1e6 : null;
      if (ms !== null) totalMs += ms;
      return { kind, ms, text: `${(k.n / p).toFixed(2)}/present ${k.copy ? '' : `${(k.work / k.n).toFixed(1)} ${kind.startsWith('compute') ? 'workgroups' : 'draws'} each `}` +
        (ms !== null ? `${ms.toFixed(3)} ms/present ` : '') + kind };
    }).sort((a, b) => (b.ms ?? -1) - (a.ms ?? -1));
    console.log(`passes: ${p} presents, ${(report.records.filter((r) => !r.copy).length / p).toFixed(1)} passes/present` +
      (totalMs ? `, ${totalMs.toFixed(2)} ms of GPU passes/present` : ''));
    for (const line of lines.slice(0, 16)) console.log(`passes:   ${line.text}`);
  }, 5000);
})();
