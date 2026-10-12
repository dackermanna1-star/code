// AudioWorkletProcessor 'doom-music': OPL3 emulator + DMX driver + sequencer
// rendering stereo output on the audio thread.
//
// Port messages: {type:'genmidi', data: ArrayBuffer}, {type:'play', data:
// ArrayBuffer, loop}, {type:'stop'}, {type:'pause'}, {type:'resume'},
// {type:'volume', value: 0..1}. Posts back {type:'ended'} / {type:'error'}.

import { MusicEngine } from './sequencer.js';

class DoomMusicProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    // sampleRate is a global of the AudioWorkletGlobalScope.
    this.engine = new MusicEngine(sampleRate, opts);
    this.engine.onEvent = (msg) => this.port.postMessage(msg);
    this.port.onmessage = (e) => this.engine.handleMessage(e.data);
    this.scratch = null;
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const left = out[0];
    let right = out[1];
    if (!right) {
      if (!this.scratch || this.scratch.length !== left.length) this.scratch = new Float32Array(left.length);
      right = this.scratch;
    }
    this.engine.render(left, right, 0, left.length);
    if (out.length === 1) {
      for (let i = 0; i < left.length; i++) left[i] = 0.5 * (left[i] + right[i]);
    }
    return true;
  }
}

registerProcessor('doom-music', DoomMusicProcessor);
