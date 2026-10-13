// Main-thread music API. Runs the OPL3 music engine in an AudioWorklet, or,
// where AudioWorklet is unavailable, in a ScriptProcessorNode on the main
// thread using the same sequencer / driver / OPL3 code.
//
//   const music = await MusicPlayer.create(ctx, musicGainNode);
//   music.setGenmidi(wad.data('GENMIDI'));
//   music.play(wad.data('D_E1M1'), { loop: true });
//
// Options (third argument to create): { opl3 = true, stereoCorrect = false,
// gain = 2 (output gain, 1 = Chocolate Doom's int16 scale) }.

const FALLBACK_BUFFER_SIZE = 4096;

// Copy into a fresh ArrayBuffer we can transfer, so the WAD's own buffer is
// never detached.
function copyBuffer(bytes) {
  let view;
  if (bytes instanceof ArrayBuffer) view = new Uint8Array(bytes);
  else if (ArrayBuffer.isView(bytes)) view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  else throw new TypeError('MusicPlayer: expected a Uint8Array or ArrayBuffer');
  return view.slice().buffer;
}

export class MusicPlayer {
  constructor(context, node, send) {
    this.context = context;
    this.node = node;
    this.send = send;
    this.volume = 1;
    this.usingWorklet = false;
    this.onended = null;
    this.onerror = null;
  }

  static async create(audioContext, destinationNode = audioContext.destination, options = {}) {
    let player = null;
    if (audioContext.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      try {
        // The single-file build provides the worklet as a blob URL.
        await audioContext.audioWorklet.addModule(globalThis.__DOOM_WORKLET_URL || new URL('./music-worklet.js', import.meta.url));
        const node = new AudioWorkletNode(audioContext, 'doom-music', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
          processorOptions: options,
        });
        player = new MusicPlayer(audioContext, node, (msg, transfer) => node.port.postMessage(msg, transfer || []));
        player.usingWorklet = true;
        node.port.onmessage = (e) => player.handleEvent(e.data);
      } catch (err) {
        console.warn('MusicPlayer: AudioWorklet failed, falling back to ScriptProcessorNode', err);
        player = null;
      }
    }
    if (!player) player = await MusicPlayer.createFallback(audioContext, options);
    player.node.connect(destinationNode || audioContext.destination);
    return player;
  }

  static async createFallback(audioContext, options) {
    const { MusicEngine } = await import('./sequencer.js');
    const engine = new MusicEngine(audioContext.sampleRate, options);
    const node = audioContext.createScriptProcessor(FALLBACK_BUFFER_SIZE, 0, 2);
    let scratch = null;
    node.onaudioprocess = (e) => {
      const out = e.outputBuffer;
      const left = out.getChannelData(0);
      let right;
      if (out.numberOfChannels > 1) {
        right = out.getChannelData(1);
      } else {
        if (!scratch || scratch.length !== left.length) scratch = new Float32Array(left.length);
        right = scratch;
      }
      engine.render(left, right, 0, left.length);
    };
    const player = new MusicPlayer(audioContext, node, (msg) => engine.handleMessage(msg));
    engine.onEvent = (msg) => player.handleEvent(msg);
    return player;
  }

  handleEvent(msg) {
    if (!msg) return;
    if (msg.type === 'ended' && this.onended) this.onended();
    else if (msg.type === 'error') {
      if (this.onerror) this.onerror(new Error(msg.message));
      else console.error('MusicPlayer:', msg.message);
    }
  }

  // GENMIDI lump (Uint8Array). Must be set before music is audible; a song
  // started earlier begins once the instruments arrive.
  setGenmidi(bytes) {
    const data = copyBuffer(bytes);
    this.send({ type: 'genmidi', data }, [data]);
  }

  // MUS or MIDI lump (Uint8Array).
  play(bytes, { loop = true } = {}) {
    const data = copyBuffer(bytes);
    this.send({ type: 'play', data, loop }, [data]);
  }

  stop() {
    this.send({ type: 'stop' });
  }

  pause() {
    this.send({ type: 'pause' });
  }

  resume() {
    this.send({ type: 'resume' });
  }

  // 0..1. Like DMX this caps channel volumes (0 also mutes the output).
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v) || 0));
    this.send({ type: 'volume', value: this.volume });
  }

  disconnect() {
    this.node.disconnect();
  }
}
