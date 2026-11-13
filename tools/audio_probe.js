// Where a page's sound runs short, and how full the game keeps the ring: a preload for play_page.mjs
// (--preload tools/audio_probe.js) that wraps audio_output.js's worklet processor as the page adds it and logs, from its
// first frame played,
//
//   audioprobe latency <baseLatency s> <outputLatency s>           the context's, as the page opens its sound
//   audioprobe short <s> <frames> <fill>                           a render quantum short: when in the sound, how
//                                                                  many frames, and the ring's fill as it started
//   audioprobe low <s> <fill>,<fill>,...                           each second, the ring's lowest fill in each 20 ms
//
// <s> is seconds of the sound's frames rendered, played and short, since the first played. The processor writes into
// a SharedArrayBuffer of the probe's own, passed in its processorOptions, and the page's thread prints it every 100
// ms, so the node's port (Module.recompAudioStats) carries nothing more. Only a cross-origin isolated document has one.
if (self.crossOriginIsolated && typeof AudioWorkletNode !== 'undefined' && !self.__audioProbe) {
  self.__audioProbe = true;
  const events = new Int32Array(new SharedArrayBuffer(4 * (1 + 3 * 65536)));
  const wrap = `
class RecompAudioProbe extends RecompAudioProcessor {
  constructor(options) {
    super(options);
    this.events = new Int32Array(options.processorOptions.probe);
    this.low = 1e9;
    this.window = 0;
  }
  record(type, a, b) {
    const n = Atomics.load(this.events, 0);
    if (n < 65536) {
      this.events.set([type, a, b], 1 + 3 * n);
      Atomics.store(this.events, 0, n + 1);
    }
  }
  process(inputs, outputs) {
    const fill = (Atomics.load(this.counters, 0) - Atomics.load(this.counters, 1)) >>> 0;
    const short = this.short;
    const result = super.process(inputs, outputs);
    if (this.played > 0) {
      const at = this.played + this.short;
      if (this.short > short) {
        this.record(1, at, (this.short - short) * 65536 + Math.min(fill, 65535));
      }
      this.low = Math.min(this.low, fill);
      if (Math.floor(at / 960) > this.window) {
        this.record(2, this.window, this.low);
        this.window = Math.floor(at / 960);
        this.low = 1e9;
      }
    }
    return result;
  }
}
registerProcessor('recomp-audio', RecompAudioProbe);
`;
  const addModule = AudioWorklet.prototype.addModule;
  AudioWorklet.prototype.addModule = async function (url, options) {
    const source = await (await fetch(url)).text();
    if (!source.includes('class RecompAudioProcessor')) {
      return addModule.call(this, url, options);
    }
    const patched = source.replace("registerProcessor('recomp-audio', RecompAudioProcessor);", wrap);
    return addModule.call(this, URL.createObjectURL(new Blob([patched], { type: 'text/javascript' })), options);
  };
  const Node = AudioWorkletNode;
  self.AudioWorkletNode = class extends Node {
    constructor(context, name, options) {
      if (name === 'recomp-audio') {
        options.processorOptions.probe = events.buffer;
        console.log(`audioprobe latency ${context.baseLatency} ${context.outputLatency}`);
      }
      super(context, name, options);
    }
  };
  let seen = 0;
  let second = -1;
  let lows = [];
  setInterval(() => {
    const n = Atomics.load(events, 0);
    for (; seen < n; seen++) {
      const [type, a, b] = events.subarray(1 + 3 * seen, 4 + 3 * seen);
      if (type === 1) {
        console.log(`audioprobe short ${(a / 48000).toFixed(3)} ${b >> 16} ${b & 65535}`);
      } else {
        const s = Math.floor(a / 50);
        if (s !== second && lows.length) {
          console.log(`audioprobe low ${second} ${lows.join(',')}`);
          lows = [];
        }
        second = s;
        lows.push(b);
      }
    }
  }, 100);
}
