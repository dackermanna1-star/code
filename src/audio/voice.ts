import type { AudioSys } from './audio';
import { clamp } from '../core/math';

/**
 * Spoken lines, and the lips that say them.
 *
 * A line plays from the recorded cast when there is one (public/audio/voice: one file per line,
 * with its loudness envelope, made offline by tools/voice), else from the browser's own speech
 * (its most natural voice for the speaker: the "Natural", "Neural", "Enhanced", "Premium" ones
 * first). Either way the speaker's jaw moves with it: with a recording, by its envelope; with
 * the browser's speech, syllable by syllable through each word as the speech reaches it.
 */
export interface Speaker {
  /** The jaw's target this frame (the face rig eases towards it). */
  setSpeech(open: number): void;
}

interface VoiceLine {
  file: string;
  dur: number;
  /** Loudness, 0..255 at 50 per second (base64). */
  env: string;
}

/** How each voice sounds through the browser's speech: female or male, pitch and pace. */
interface Cast {
  fem: boolean;
  pitch: number;
  rate: number;
}
const CAST: Record<string, Cast> = {
  SCARLET: { fem: true, pitch: 0.95, rate: 1.0 },
  IVY: { fem: true, pitch: 1.15, rate: 1.05 },
  VIPER: { fem: true, pitch: 0.9, rate: 0.92 },
  DEZ: { fem: false, pitch: 1.05, rate: 1.08 },
  DOYLE: { fem: false, pitch: 0.72, rate: 0.9 },
  'THE BUTCHER': { fem: false, pitch: 0.66, rate: 0.86 },
  MARCO: { fem: false, pitch: 1.1, rate: 1.06 },
  SAL: { fem: false, pitch: 0.95, rate: 1.0 },
  TEO: { fem: false, pitch: 1.0, rate: 1.04 },
  KX: { fem: false, pitch: 0.9, rate: 1.1 },
};

export interface SpokenLine {
  /** Seconds it takes (an estimate for the browser's speech until it ends). */
  dur: number;
  /** Whether it's still being said. */
  done(): boolean;
  stop(): void;
}

const lineId = (who: string, text: string) => {
  // (stable across builds: who and what, hashed)
  const s = who + '|' + text.replace(/<[^>]+>/g, '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
};

/** Syllables in a word (vowel groups; at least one). */
const syllables = (w: string) => Math.max(1, (w.toLowerCase().replace(/e\b/g, '').match(/[aeiouy]+/g) ?? []).length);

export class VoiceSystem {
  enabled = true;
  volume = 1;
  private lines = new Map<string, VoiceLine>();
  private buffers = new Map<string, AudioBuffer>();
  private voices: SpeechSynthesisVoice[] = [];
  private active: { speaker: Speaker | null; t: number; env: Uint8Array | null; syl: number[]; sylT: number; done: boolean; stop: () => void; est: number } | null = null;

  constructor(private audio: AudioSys) {
    const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    if (synth) {
      const load = () => (this.voices = synth.getVoices());
      load();
      synth.addEventListener?.('voiceschanged', load);
    }
  }

  /** The recorded cast's index (if the game has one). */
  async init() {
    try {
      const r = await fetch('audio/voice/manifest.json');
      if (!r.ok) return;
      const m = (await r.json()) as Record<string, VoiceLine>;
      for (const [k, v] of Object.entries(m)) this.lines.set(k, v);
    } catch {
      /* no recorded cast: the browser's voices */
    }
  }

  /** The best voice the browser has for a speaker (natural-sounding ones first). */
  private pick(who: string): SpeechSynthesisVoice | null {
    const c = CAST[who] ?? { fem: false, pitch: 1, rate: 1 };
    const en = this.voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
    if (!en.length) return null;
    const femName = /female|woman|zira|aria|jenny|samantha|victoria|karen|moira|tessa|fiona|serena|susan|libby|sonia|emma|ava|allison|joanna|salli|kendra|kimberly|ivy|michelle|ana\b|natasha|clara/i;
    const maleName = /\bmale|guy|david|mark|alex|daniel|fred|tom|aaron|arthur|oliver|ryan|brian|matthew|justin|joey|eric|christopher|roger|steffan|thomas|william|davis|tony|jason/i;
    const score = (v: SpeechSynthesisVoice) => {
      let s = 0;
      if (/natural|neural|premium|enhanced|online/i.test(v.name)) s += 10;
      if (/google/i.test(v.name)) s += 3;
      if (c.fem ? femName.test(v.name) : maleName.test(v.name)) s += 6;
      if (c.fem ? maleName.test(v.name) : femName.test(v.name)) s -= 8;
      if (/en-us|en_us/i.test(v.lang)) s += 1;
      return s;
    };
    // (two speakers of the same kind get different voices when there are several)
    const ranked = [...en].sort((a, b) => score(b) - score(a));
    const same = ranked.filter((v) => score(v) >= score(ranked[0]) - 2);
    const idx = Math.abs([...who].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7)) % Math.max(1, Math.min(3, same.length));
    return same[idx] ?? ranked[0];
  }

  /** Say a line (the speaker's jaw moves with it). */
  speak(who: string, text: string, speaker: Speaker | null, opts: { phone?: boolean } = {}): SpokenLine {
    this.stopActive();
    const plain = text.replace(/<[^>]+>/g, '').replace(/[“”]/g, '"');
    const words = plain.split(/\s+/).filter(Boolean);
    const est = Math.min(6.5, 0.6 + plain.length * 0.058);
    const state = { speaker, t: 0, env: null as Uint8Array | null, syl: [] as number[], sylT: 0, done: false, stop: () => undefined as void, est: 0 };
    this.active = state;
    const id = lineId(who, plain);
    const rec = this.lines.get(id);
    const ctx = this.audio.ctx;
    if (this.enabled && rec && ctx) {
      // the recorded line
      const env = Uint8Array.from(atob(rec.env), (c) => c.charCodeAt(0));
      state.env = env;
      void this.playFile(rec, opts.phone ?? false).then((stop) => (state.stop = stop));
      const line: SpokenLine = { dur: rec.dur, done: () => state.done || state.t >= rec.dur, stop: () => this.stopActive() };
      return line;
    }
    // the browser's speech (or, with no voice at all, the lips alone, for the line's length)
    for (const w of words) state.syl.push(syllables(w));
    const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    const voice = this.enabled && synth ? this.pick(who) : null;
    let spoken = false;
    if (synth && voice) {
      const c = CAST[who] ?? { fem: false, pitch: 1, rate: 1 };
      const u = new SpeechSynthesisUtterance(plain);
      u.voice = voice;
      u.pitch = c.pitch;
      u.rate = c.rate;
      u.volume = Math.min(1, this.volume * this.audio.volumes.master);
      this.audio.duck(0.4, Math.max(0.6, est));
      // word by word: each word's syllables open and close the jaw as the speech gets to it
      let wi = 0;
      u.onboundary = (e) => {
        if (e.name && e.name !== 'word') return;
        wi = plain.slice(0, e.charIndex).split(/\s+/).filter(Boolean).length;
        state.sylT = 0;
        state.syl = [syllables(words[wi] ?? 'a')];
      };
      u.onend = () => (state.done = true);
      u.onerror = () => (state.done = true);
      synth.cancel();
      synth.speak(u);
      spoken = true;
      state.stop = () => synth.cancel();
    } else state.est = est;
    return {
      dur: est,
      done: () => state.done || (!spoken && state.t >= est),
      stop: () => this.stopActive(),
    };
  }

  private async playFile(rec: VoiceLine, phone: boolean): Promise<() => void> {
    const ctx = this.audio.ctx!;
    let buf = this.buffers.get(rec.file);
    if (!buf) {
      const r = await fetch(rec.file);
      buf = await ctx.decodeAudioData(await r.arrayBuffer());
      this.buffers.set(rec.file, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 1.15 * this.volume;
    let head: AudioNode = src;
    if (phone) {
      // a phone's narrow band
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 420;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      head.connect(hp);
      hp.connect(lp);
      head = lp;
    }
    head.connect(g);
    // (straight to the master: the effects' compressor would pump with every word)
    g.connect(this.audio.master);
    // (the music and the room step back while someone talks)
    this.audio.duck(0.45, Math.max(0.5, rec.dur));
    src.start();
    return () => {
      try {
        src.stop();
      } catch {
        /* already done */
      }
    };
  }

  /** The game paused: the line waits (the browser's speech pauses with it). */
  pause(on: boolean) {
    const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    if (!synth) return;
    try {
      if (on) synth.pause();
      else synth.resume();
    } catch {
      /* no speech */
    }
  }

  private stopActive() {
    const a = this.active;
    if (!a) return;
    a.done = true;
    a.stop();
    a.speaker?.setSpeech(0);
    this.active = null;
  }
  stopAll() {
    this.stopActive();
  }

  /** Per frame (real seconds): the jaw of whoever's talking. */
  update(dt: number) {
    const a = this.active;
    if (!a) return;
    a.t += dt;
    let open = 0;
    if (a.env) {
      // the recording's loudness, a hair ahead (the mouth opens before the sound comes out)
      const i = Math.min(a.env.length - 1, Math.floor((a.t + 0.04) * 50));
      open = Math.pow(a.env[i] / 255, 0.7) * 0.75;
    } else if (!a.done) {
      // syllables: open and close through each word as it's said, a breath between words (with no
      // voice at all, spread over the line's length)
      a.sylT += dt;
      const n = a.syl.reduce((s, x) => s + x, 0) || 1;
      const T = a.est > 0 ? clamp(a.est / n, 0.13, 0.26) : 0.19;
      const k = a.sylT / T;
      if (k < n) {
        const ph = k % 1;
        const stress = 0.55 + 0.45 * Math.abs(Math.sin(Math.floor(k) * 2.3 + 0.7));
        open = Math.sin(ph * Math.PI) * 0.5 * stress + 0.06;
      } else {
        open = 0.05;
        if (a.est > 0) a.done = true;
      }
    }
    if (a.done) open = 0;
    a.speaker?.setSpeech(open);
    if (a.done) {
      a.speaker?.setSpeech(0);
      this.active = null;
    }
  }
}

export { lineId };
