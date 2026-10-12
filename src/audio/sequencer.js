// Music sequencing shared by the AudioWorklet, the ScriptProcessor fallback
// and the offline renderer: walks a normalized event list with
// sample-accurate timing, feeding the DMX driver and rendering the OPL3.

import { OPL3 } from './opl3.js';
import { OplMusicDriver } from './opl-driver.js';
import { parseGenmidi } from './genmidi.js';
import { parseMusic } from './mus.js';

// Chocolate Doom waits 5 ms after the last event before restarting a song.
const LOOP_RESTART_DELAY = 0.005;
const STOP_FADE_TIME = 0.05;
const MUTE_FADE_TIME = 0.02;
const SILENCE_HOLD_TIME = 0.015;
// After a non-looping song ends, wait this long, then fade out whatever is
// left (very slow releases, or envelopes frozen by AR=0/RR=0 dummy voices).
const END_CLEANUP_DELAY = 4;
const END_CLEANUP_FADE = 1;

export class Sequencer {
  constructor(opl, driver, sampleRate) {
    this.opl = opl;
    this.driver = driver;
    this.sampleRate = sampleRate;
    this.song = null;
    this.events = [];
    this.at = new Float64Array(0);
    this.idx = 0;
    this.pos = 0; // output samples since the song (or loop) started
    this.songEnd = 0;
    this.loopEnd = 0;
    this.loop = false;
    this.playing = false;
    this.paused = false;
    this.onEnded = null;
  }

  load(song, loop = true) {
    const sr = this.sampleRate;
    const events = song.events;
    const at = new Float64Array(events.length);
    let last = 0;
    for (let i = 0; i < events.length; i++) {
      at[i] = Math.max(last, Math.round(events[i].time * sr));
      last = at[i];
    }
    this.song = song;
    this.events = events;
    this.at = at;
    this.songEnd = Math.max(last, Math.round(song.duration * sr));
    this.loopEnd = this.songEnd + Math.max(1, Math.round(LOOP_RESTART_DELAY * sr));
    this.loop = loop;
    this.idx = 0;
    this.pos = 0;
    this.playing = true;
    this.paused = false;
    this.driver.startSong();
  }

  // I_OPL_StopSong: release every voice (they ring out naturally).
  stop() {
    this.playing = false;
    this.paused = false;
    this.driver.allNotesOff();
  }

  pause() {
    if (this.playing && !this.paused) {
      this.paused = true;
      this.driver.pause();
    }
  }

  resume() {
    this.paused = false;
  }

  restart() {
    // Release anything still held so nothing hangs across the loop point.
    this.driver.allNotesOff();
    this.driver.startSong();
    this.idx = 0;
    this.pos = 0;
  }

  dispatch(e) {
    const d = this.driver;
    switch (e.type) {
      case 'noteOn': d.noteOn(e.channel, e.note, e.velocity); break;
      case 'noteOff': d.noteOff(e.channel, e.note); break;
      case 'program': d.program(e.channel, e.value); break;
      case 'controller': d.controller(e.channel, e.controller, e.value); break;
      case 'pitchBend': d.pitchBend(e.channel, e.value); break;
      case 'allNotesOff': d.allNotesOff(e.channel); break;
      case 'allSoundsOff': d.allSoundsOff(e.channel); break;
      case 'resetControllers': d.resetControllers(e.channel); break;
      default: break;
    }
  }

  // Render count samples, applying each event at its exact sample position.
  render(outL, outR, offset, count) {
    while (count > 0) {
      let chunk = count;
      if (this.playing && !this.paused) {
        const at = this.at;
        const n = this.events.length;
        while (this.idx < n && at[this.idx] <= this.pos) this.dispatch(this.events[this.idx++]);
        if (this.idx < n) {
          chunk = Math.min(chunk, at[this.idx] - this.pos);
        } else if (this.loop) {
          if (this.pos >= this.loopEnd) {
            this.restart();
            continue;
          }
          chunk = Math.min(chunk, this.loopEnd - this.pos);
        } else if (this.pos >= this.songEnd) {
          this.playing = false;
          this.driver.allNotesOff();
          if (this.onEnded) this.onEnded();
        } else {
          chunk = Math.min(chunk, this.songEnd - this.pos);
        }
      }
      this.opl.generate(outL, outR, offset, chunk);
      offset += chunk;
      count -= chunk;
      if (this.playing && !this.paused) this.pos += chunk;
    }
  }

  get time() {
    return this.pos / this.sampleRate;
  }
}

// Complete music engine: OPL3 + DMX driver + sequencer, plus the message
// protocol shared by the worklet and the main-thread fallback:
//   {type:'genmidi', data}, {type:'play', data, loop}, {type:'stop'},
//   {type:'pause'}, {type:'resume'}, {type:'volume', value: 0..1}
export class MusicEngine {
  constructor(sampleRate, options = {}) {
    this.sampleRate = sampleRate;
    this.options = options;
    this.opl = new OPL3(sampleRate);
    if (options.gain !== undefined) this.opl.gain = options.gain / 32768;
    this.driver = null;
    this.seq = null;
    this.pending = null;
    this.volume = 1;
    this.stopping = false;
    this.gain = 1;
    this.gainTarget = 1;
    this.gainStep = 1 / (MUTE_FADE_TIME * sampleRate);
    this.hold = 0;
    this.cleanup = 0; // samples until the post-song cleanup fade (0 = none)
    this.onEvent = null; // (message) => void, e.g. {type: 'ended'}
    if (options.warmUp !== false) this.warmUp();
  }

  // Run the synthesis loop briefly on a throwaway patch so the JIT has
  // optimised it before the first song needs real-time performance.
  warmUp() {
    const opl = this.opl;
    const regs = [
      [0x20, 0xc1], [0x23, 0x21], [0x40, 0x10], [0x43, 0x00], [0x60, 0xf3], [0x63, 0xf4],
      [0x80, 0x45], [0x83, 0x46], [0xe0, 0x01], [0xe3, 0x02], [0xc0, 0x0e], [0xa0, 0x98], [0xb0, 0x31],
      [0x21, 0x01], [0x24, 0x01], [0x41, 0x00], [0x44, 0x00], [0x61, 0xf0], [0x64, 0xf0],
      [0x81, 0x0f], [0x84, 0x0f], [0xc1, 0x01], [0xa1, 0x50], [0xb1, 0x2d],
    ];
    for (const [r, v] of regs) opl.write(r, v);
    const n = 1024;
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    for (let i = 0; i < 4; i++) {
      opl.generate(l, r, 0, n);
      opl.writeBuffered(0xb0, i & 1 ? 0x31 : 0x11);
    }
    opl.reset();
  }

  setGenmidi(data) {
    const genmidi = parseGenmidi(toBytes(data));
    const current = this.seq && this.seq.playing ? { song: this.seq.song, loop: this.seq.loop } : null;
    this.opl.reset();
    this.driver = new OplMusicDriver(this.opl, genmidi, this.options);
    this.driver.setVolume(this.volume);
    this.seq = new Sequencer(this.opl, this.driver, this.sampleRate);
    this.seq.onEnded = () => {
      this.cleanup = Math.round(END_CLEANUP_DELAY * this.sampleRate);
      this.emit({ type: 'ended' });
    };
    const next = this.pending || current;
    this.pending = null;
    if (next) this.playSong(next.song, next.loop);
  }

  play(data, loop = true) {
    this.playSong(parseMusic(toBytes(data)), loop);
  }

  playSong(song, loop = true) {
    if (!this.seq) {
      this.pending = { song, loop };
      return;
    }
    // Like DMX, the previous song's notes are released and ring out.
    if (this.seq.playing) this.seq.stop();
    this.stopping = false;
    this.hold = 0;
    this.cleanup = 0;
    this.fadeTo(this.baseTarget(), MUTE_FADE_TIME / 4);
    this.seq.load(song, loop);
  }

  stop() {
    this.pending = null;
    this.cleanup = 0;
    if (!this.seq) return;
    const wasPlaying = this.seq.playing;
    this.seq.stop();
    if (wasPlaying || !this.opl.isSilent()) {
      this.stopping = true;
      this.fadeTo(0, STOP_FADE_TIME);
    }
  }

  pause() {
    if (this.seq) this.seq.pause();
  }

  resume() {
    if (this.seq) this.seq.resume();
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));
    if (this.driver) this.driver.setVolume(this.volume);
    if (!this.stopping) this.fadeTo(this.baseTarget(), MUTE_FADE_TIME);
  }

  baseTarget() {
    return this.stopping || this.volume === 0 ? 0 : 1;
  }

  fadeTo(target, seconds) {
    this.gainTarget = target;
    this.gainStep = 1 / Math.max(1, seconds * this.sampleRate);
  }

  emit(message) {
    if (this.onEvent) this.onEvent(message);
  }

  handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    try {
      switch (msg.type) {
        case 'genmidi': this.setGenmidi(msg.data); break;
        case 'play': this.play(msg.data, msg.loop !== false); break;
        case 'stop': this.stop(); break;
        case 'pause': this.pause(); break;
        case 'resume': this.resume(); break;
        case 'volume': this.setVolume(msg.value); break;
        default: break;
      }
    } catch (err) {
      this.emit({ type: 'error', message: String((err && err.message) || err) });
    }
  }

  render(outL, outR, offset, count) {
    if (!this.seq) {
      outL.fill(0, offset, offset + count);
      outR.fill(0, offset, offset + count);
      return;
    }
    const seq = this.seq;
    const active = (seq.playing && !seq.paused) || this.stopping || this.hold > 0;
    if (!active && this.opl.isIdle()) {
      // Nothing playing and the chip has gone quiet: skip the emulation.
      this.opl.generateSilence(outL, outR, offset, count);
      this.cleanup = 0;
      return;
    }
    seq.render(outL, outR, offset, count);
    if (this.cleanup > 0) {
      this.cleanup -= count;
      if (this.cleanup <= 0) {
        this.cleanup = 0;
        if (!this.seq.playing && !this.opl.isSilent()) {
          this.stopping = true;
          this.fadeTo(0, END_CLEANUP_FADE);
        }
      }
    }
    this.applyGain(outL, outR, offset, count);
  }

  applyGain(outL, outR, offset, count) {
    let g = this.gain;
    if (g === 1 && this.gainTarget === 1 && this.hold === 0) return;
    const end = offset + count;
    for (let i = offset; i < end; i++) {
      if (this.hold > 0) {
        g = 0;
        if (--this.hold === 0) this.fadeTo(this.baseTarget(), MUTE_FADE_TIME / 4);
      } else {
        if (g < this.gainTarget) g = Math.min(this.gainTarget, g + this.gainStep);
        else if (g > this.gainTarget) g = Math.max(this.gainTarget, g - this.gainStep);
        if (g === 0 && this.stopping) {
          // Faded out: now cut the voices for real, then restore the gain
          // once the chip has gone quiet.
          this.stopping = false;
          this.driver.silence();
          this.hold = Math.max(1, Math.round(SILENCE_HOLD_TIME * this.sampleRate));
        }
      }
      outL[i] *= g;
      outR[i] *= g;
    }
    this.gain = g;
  }
}

function toBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array(data);
}
