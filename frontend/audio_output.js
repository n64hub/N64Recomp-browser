// Link with --pre-js (n64recomp_browser_frontend does): the page's side of n64recomp_browser::audio (audio_output.h), an
// AudioWorkletNode on the audio context sdl_audio.js makes. Its processor reads the ring straight out of the program's
// memory, a SharedArrayBuffer, on the browser's audio thread. Until it plays (the browser keeps the context suspended
// until the player first clicks or presses a key), a timer empties the ring as it fills, as SDL's port did with its
// silence timer: the runtime holds the game's audio interrupts back while much is queued, and some games wait on them.
// Module.recompAudioStats() resolves to { played, short }: frames played and frames the ring ran dry for, since it
// started.
const recompAudioProcessor = `
class RecompAudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions;
    this.counters = new Int32Array(o.memory, o.ring, 2);
    this.samples = new Float32Array(o.memory, o.samples, o.frames * o.channels);
    this.mask = o.frames - 1;
    this.channels = o.channels;
    this.played = 0;
    this.short = 0;
    this.port.onmessage = () => this.port.postMessage({ played: this.played, short: this.short });
  }
  process(inputs, outputs) {
    const out = outputs[0];
    const length = out[0].length;
    const write = Atomics.load(this.counters, 0) >>> 0;
    const read = Atomics.load(this.counters, 1) >>> 0;
    const count = Math.min(length, (write - read) >>> 0);
    for (let c = 0; c < out.length; c++) {
      const channel = out[c];
      const from = Math.min(c, this.channels - 1);
      for (let i = 0; i < count; i++) {
        channel[i] = this.samples[((read + i) & this.mask) * this.channels + from];
      }
    }
    Atomics.store(this.counters, 1, (read + count) | 0);
    if (this.played > 0) {
      this.short += length - count;
    }
    this.played += count;
    return true;
  }
}
registerProcessor('recomp-audio', RecompAudioProcessor);
`;

function recompAudioOpen(ring, samples, frames, channels) {
  const context = Module['SDL2'].audioContext;
  let node = null;
  setInterval(() => {
    if (!node || context.state !== 'running') {
      const counters = new Int32Array(HEAPU8.buffer, ring, 2);
      Atomics.store(counters, 1, Atomics.load(counters, 0));
    }
  }, 10);
  const url = URL.createObjectURL(new Blob([recompAudioProcessor], { type: 'text/javascript' }));
  context.audioWorklet.addModule(url).then(() => {
    node = new AudioWorkletNode(context, 'recomp-audio', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [channels],
      processorOptions: { memory: HEAPU8.buffer, ring, samples, frames, channels },
    });
    node.connect(context.destination);
    Module['recompAudioStats'] = () => new Promise((resolve) => {
      node.port.onmessage = (event) => resolve(event.data);
      node.port.postMessage(null);
    });
  }).catch((error) => console.error('Audio output: ' + error));
  return context.sampleRate;
}

// The frames the browser renders from the ring in one go, which queued_frames() leaves out (audio_output.cpp): the
// context's baseLatency, which Chrome sets as it makes the context (0.01 s on Windows), before it first plays.
function recompAudioBrowserFrames() {
  const context = Module['SDL2'].audioContext;
  return Math.round((context.baseLatency || 0) * context.sampleRate);
}
