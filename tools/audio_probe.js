// Where a page's sound runs short, and how full the ring was around it: a preload for play_page.mjs
// (--preload tools/audio_probe.js) that patches frontend/audio_output.js's worklet processor and logs
//
//   audioshort <s> short <n> of <len> ring <fill> peak <peak>
//                                                   a render quantum the ring couldn't fill: <s> seconds into the
//                                                   sound (the frames rendered since it first played, at the
//                                                   context's rate), <n> of its <len> frames silent, <fill> frames in
//                                                   the ring as it started, and the loudest sample played in the 20 ms
//                                                   before it (0-1): 0 is a loss inside the game's own silence, which
//                                                   nobody hears (a boot's logos, say)
//   audioring <s> <low> <low> ...                    once a second, the ring's lowest fill in each 20 ms of the second
//                                                   that ended at <s>, in frames: a game that keeps its ring thin shows
//                                                   low numbers all through, one that stopped making sound a run that
//                                                   falls to 0
//   audiopeak <s> <peak> <peak> ...                  the same second's loudest sample played in each 20 ms, to tell a
//                                                   loss in the game's silence from one in its sound
//   audiomark <s> <hidden|visible>                   the page's tab hidden or shown again (visibilitychange), at <s>
//                                                   on the sound's clock, as near as the last tick (below) puts it
//   pagestall <s> <ms>                               the page's thread answered none of the worklet's ticks, one each
//                                                   20 ms, for <ms> ms, ending at <s>: it was busy, and it runs the
//                                                   game's WebGPU calls, which the game waits for (docs/findings.md, A
//                                                   page in a hidden tab), so a stall there holds the game
//
// The processor's script is a blob audio_output.js hands to audioWorklet.addModule(); the probe fetches it, appends a
// wrapper of RecompAudioProcessor's process(), and adds that in its place. The worklet sends its lines over the node's
// port, tagged, and the port's onmessage, which Module.recompAudioStats() sets (play_page.mjs reads the frames short
// with it), sees only the untagged ones. A short quantum's <s> against ?frame-log's lines and a shot's time says which
// screen it falls on; the audio thread's clock is the context's, not the page's, so line them up by the console's
// order, not by adding times. Only a cross-origin isolated document runs it: the page's own, after
// coi_serviceworker.js's reload.
if (self.crossOriginIsolated && !self.__audioProbe && self.AudioWorklet) {
  self.__audioProbe = true;
  const patch = `
{
  const process = RecompAudioProcessor.prototype.process;
  RecompAudioProcessor.prototype.process = function (inputs, outputs) {
    const length = outputs[0][0].length;
    const fill = (Atomics.load(this.counters, 0) - Atomics.load(this.counters, 1)) >>> 0;
    const short = this.short;
    const started = this.played > 0;
    const result = process.call(this, inputs, outputs);
    if (!started && this.played === 0) {
      return result;
    }
    const p = this.probe || (this.probe = { frames: 0, low: 1e9, lows: [], peak: 0, last: 0, peaks: [],
      window: Math.round(sampleRate / 50) });
    const at = (p.frames / sampleRate).toFixed(3);
    if (this.short > short) {
      this.port.postMessage({ audioProbe: 'audioshort ' + at + ' short ' + (this.short - short) + ' of ' + length +
        ' ring ' + fill + ' peak ' + Math.max(p.last, p.peak).toFixed(3) });
    }
    for (const channel of outputs[0]) {
      for (let i = 0; i < length; i++) {
        p.peak = Math.max(p.peak, Math.abs(channel[i]));
      }
    }
    p.low = Math.min(p.low, fill);
    p.frames += length;
    if (p.frames % p.window < length) {
      this.port.postMessage({ audioProbeTick: p.frames / sampleRate });
      p.lows.push(p.low);
      p.peaks.push(p.peak.toFixed(3));
      p.last = p.peak;
      p.low = 1e9;
      p.peak = 0;
      if (p.lows.length === 50) {
        const second = (p.frames / sampleRate).toFixed(3);
        this.port.postMessage({ audioProbe: 'audioring ' + second + ' ' + p.lows.join(' ') });
        this.port.postMessage({ audioProbe: 'audiopeak ' + second + ' ' + p.peaks.join(' ') });
        p.lows = [];
        p.peaks = [];
      }
    }
    return result;
  };
}
`;
  const addModule = AudioWorklet.prototype.addModule;
  AudioWorklet.prototype.addModule = async function (url, options) {
    const source = await (await fetch(url)).text();
    if (!source.includes('class RecompAudioProcessor')) {
      return addModule.call(this, url, options);
    }
    const patched = URL.createObjectURL(new Blob([source + patch], { type: 'text/javascript' }));
    return addModule.call(this, patched, options);
  };
  const Node = AudioWorkletNode;
  self.AudioWorkletNode = function (context, name, options) {
    const node = new Node(context, name, options);
    if (name === 'recomp-audio') {
      const port = node.port;
      let tick = null, tickMs = 0;
      port.addEventListener('message', (event) => {
        if (event.data && event.data.audioProbe) {
          console.log(event.data.audioProbe);
        }
        if (event.data && (event.data.audioProbeTick !== undefined)) {
          const now = performance.now();
          if ((tick !== null) && (now - tickMs > 60)) {
            console.log('pagestall ' + event.data.audioProbeTick.toFixed(3) + ' ' + Math.round(now - tickMs));
          }
          tick = event.data.audioProbeTick;
          tickMs = now;
        }
      });
      document.addEventListener('visibilitychange', () => {
        if (tick !== null) {
          console.log('audiomark ' + (tick + (performance.now() - tickMs) / 1000).toFixed(3) + ' ' + document.visibilityState);
        }
      });
      port.start();
      let handler = null;
      Object.defineProperty(port, 'onmessage', {
        get: () => handler,
        set: (f) => {
          if (handler) {
            port.removeEventListener('message', handler);
          }
          handler = f && ((event) => (event.data && (event.data.audioProbe || (event.data.audioProbeTick !== undefined))) || f(event));
          if (handler) {
            port.addEventListener('message', handler);
          }
        },
      });
    }
    return node;
  };
  self.AudioWorkletNode.prototype = Node.prototype;
}
