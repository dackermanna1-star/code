// LAST LOOKOUT — generative score. Dark, sparse, in D minor:
//   calm   a detuned drone, slow pads drifting through a dark progression, a lonely whistled
//          melody echoing across the valley;
//   fight  adds a pulsing bass ostinato, taiko thumps and a ticking shaker, tension swells;
//   boss   adds heavy toms, dissonant low brass stabs and a Phrygian turn in the bass.
// Layers cross-fade (time constant ~2 s) as the state changes; notes are only scheduled for
// layers that can be heard. A look-ahead scheduler (setInterval) keeps timing tight; every note
// owns a few nodes that disconnect when it ends, and the total is capped.

const D2 = 73.416;
const semi = (n) => D2 * 2 ** (n / 12); // semitones above D2

/** Chords as semitone offsets from D2 (pads voiced an octave up). */
const PROGRESSION = [
  { root: 0, notes: [12, 15, 19] }, // Dm  D F A
  { root: -4, notes: [8, 12, 15] }, // Bb  Bb D F
  { root: 5, notes: [12, 17, 20] }, // Gm  D G Bb
  { root: 7, notes: [11, 14, 19] }, // A   C# E A (the leading tone)
  { root: 0, notes: [12, 15, 19] }, // Dm
  { root: 10, notes: [10, 14, 17] }, // C   C E G
  { root: 3, notes: [10, 15, 19] }, // F   C F A
  { root: 7, notes: [10, 14, 19] }, // Am  C E A
];
const PENTA = [0, 3, 5, 7, 10]; // D minor pentatonic
const BPM = 92;
const BEAT = 60 / BPM;
const MAX_NOTES = 28;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];

export class GenMusic {
  /** ctx: AudioContext; dest: node the music mixes into. */
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(dest);
    // ping-pong echo: the melody and pads hang in the valley
    this.echoIn = ctx.createGain();
    this.echoIn.gain.value = 1;
    const dl = (this.dl = ctx.createDelay(2));
    const dr = (this.dr = ctx.createDelay(2));
    dl.delayTime.value = BEAT * 0.75;
    dr.delayTime.value = BEAT * 1.25;
    const fb = (this.fb = ctx.createGain());
    fb.gain.value = 0.42;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    const merger = ctx.createChannelMerger(2);
    this.echoIn.connect(dl);
    dl.connect(dr);
    dr.connect(tone);
    tone.connect(fb);
    fb.connect(dl);
    const wl = ctx.createGain(), wr = ctx.createGain();
    wl.gain.value = 0.5;
    wr.gain.value = 0.5;
    dl.connect(wl);
    dr.connect(wr);
    wl.connect(merger, 0, 0);
    wr.connect(merger, 0, 1);
    merger.connect(this.out);
    // layer busses
    this.layers = {};
    for (const k of ['calm', 'fight', 'boss']) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.out);
      this.layers[k] = { gain: g, level: 0, target: 0 };
    }
    this.state = 'off';
    this.drone = null;
    this.notes = 0;
    this.timer = null;
    this.nextBeat = 0;
    this.beatN = 0;
    this.chordI = 0;
    this.nextChord = 0;
    this.nextPhrase = 0;
    this.phrase = [];
    this._tick = this._tick.bind(this);
  }

  setState(state) {
    const s = ['calm', 'fight', 'boss', 'off'].includes(state) ? state : 'calm';
    if (s === this.state) return;
    this.state = s;
    const T = { calm: [1, 0, 0], fight: [0.55, 1, 0], boss: [0.35, 0.85, 1], off: [0, 0, 0] }[s];
    const now = this.ctx.currentTime;
    ['calm', 'fight', 'boss'].forEach((k, i) => {
      const L = this.layers[k];
      L.target = T[i];
      L.gain.gain.cancelScheduledValues(now);
      L.gain.gain.setTargetAtTime(T[i], now, s === 'off' ? 1.2 : 2.2);
    });
    if (s === 'off') {
      this._droneLevel(0);
      return;
    }
    this._ensureDrone();
    this._droneLevel(s === 'boss' ? 0.75 : 1);
    if (!this.timer) {
      this.nextBeat = now + 0.1;
      this.nextChord = now + 0.2;
      this.nextPhrase = now + rand(3, 6);
      this.timer = setInterval(this._tick, 60);
      if (this.timer && this.timer.unref) this.timer.unref();
    }
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      this.out.disconnect();
    } catch (e) {
      // already gone
    }
  }

  // -------------------------------------------------------------------------------------------

  _ensureDrone() {
    if (this.drone) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 190;
    lp.Q.value = 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 70;
    lfo.connect(lfoG);
    lfoG.connect(lp.frequency);
    const oscs = [];
    for (const [f, type, lvl] of [[D2 / 2, 'sawtooth', 0.5], [D2 / 2 * 1.004, 'sawtooth', 0.5], [D2 * 0.75 * 1.002, 'sawtooth', 0.32], [D2 / 2, 'sine', 0.9]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = lvl;
      o.connect(og);
      og.connect(type === 'sine' ? g : lp);
      o.start(t);
      oscs.push(o);
    }
    lp.connect(g);
    g.connect(this.out);
    lfo.start(t);
    oscs.push(lfo);
    this.drone = { g, oscs };
  }

  _droneLevel(v) {
    if (!this.drone) return;
    const now = this.ctx.currentTime;
    const g = this.drone.g.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(v * 0.11, now, v ? 3 : 1.5);
  }

  _tick() {
    try {
      const ctx = this.ctx;
      if (ctx.state !== 'running') return;
      const now = ctx.currentTime;
      const ahead = now + 0.3;
      const L = this.layers;
      const calm = L.calm.target > 0.01, fight = L.fight.target > 0.01, boss = L.boss.target > 0.01;
      if (!calm && !fight && !boss) {
        if (now > this.nextChord + 4) {
          clearInterval(this.timer);
          this.timer = null;
        }
        return;
      }
      // pads (calm layer, free time)
      while (this.nextChord < ahead) {
        const ch = PROGRESSION[this.chordI % PROGRESSION.length];
        this.chordI++;
        const len = fight ? BEAT * 8 : rand(9, 13);
        if (calm || fight) this._pad(this.nextChord, len + 3, ch, fight ? 0.55 : 1);
        this.chord = ch;
        this.nextChord += len;
      }
      // the lonely melody (calm), phrases of 3-6 notes with long rests
      if (calm && now + 0.3 > this.nextPhrase) this._phraseAt(Math.max(now + 0.05, this.nextPhrase), fight);
      // beat grid (fight / boss)
      while (this.nextBeat < ahead) {
        const t = this.nextBeat, b = this.beatN;
        if (fight || boss) this._beat(t, b, boss);
        this.beatN++;
        this.nextBeat += BEAT / 2; // eighth notes
      }
    } catch (e) {
      // the score must never break the game
    }
  }

  _phraseAt(t0, busy) {
    const ch = this.chord || PROGRESSION[0];
    const n = 3 + ((Math.random() * 4) | 0);
    let t = t0;
    let deg = pick([0, 2, 3, 4]);
    for (let i = 0; i < n; i++) {
      deg = Math.max(0, Math.min(9, deg + pick([-2, -1, -1, 1, 1, 2, 0])));
      const oct = deg >= 5 ? 12 : 0;
      let st = 24 + PENTA[deg % 5] + oct;
      // lean on chord tones on long notes
      const dur = pick([0.5, 0.75, 1, 1, 1.5, 2]) * (busy ? 0.75 : 1.2);
      if (dur >= 1.5 && Math.random() < 0.6) st = 24 + ch.notes[(Math.random() * 3) | 0] - 12 + (Math.random() < 0.5 ? 12 : 0);
      this._whistle(t, dur * 0.95, semi(st), i === n - 1 ? 1.4 : 1);
      t += dur;
    }
    this.nextPhrase = t + rand(busy ? 6 : 5, busy ? 12 : 11);
  }

  // ---- instruments -------------------------------------------------------------------------

  _note(t, end) {
    if (this.notes >= MAX_NOTES) return null;
    this.notes++;
    const nodes = [];
    let live = 0;
    const done = () => {
      if (--live > 0) return;
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch (e) {
          // fine
        }
      }
      this.notes--;
    };
    return {
      nodes,
      osc: (type, f, dest, detune = 0) => {
        const o = this.ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        if (detune) o.detune.value = detune;
        o.connect(dest);
        o.start(t);
        o.stop(end);
        o.onended = done;
        live++;
        nodes.push(o);
        return o;
      },
      noise: (buf, dest) => {
        const s = this.ctx.createBufferSource();
        s.buffer = buf;
        s.loop = true;
        s.connect(dest);
        s.start(t, Math.random() * Math.max(0, buf.duration - 0.5));
        s.stop(end);
        s.onended = done;
        live++;
        nodes.push(s);
        return s;
      },
      gain: (v = 0) => {
        const g = this.ctx.createGain();
        g.gain.value = v;
        nodes.push(g);
        return g;
      },
      filter: (type, f, q = 0.7) => {
        const b = this.ctx.createBiquadFilter();
        b.type = type;
        b.frequency.value = f;
        b.Q.value = q;
        nodes.push(b);
        return b;
      },
    };
  }

  _pad(t, len, ch, level) {
    const N = this._note(t, t + len + 0.1);
    if (!N) return;
    const g = N.gain(0);
    const lp = N.filter('lowpass', 520, 0.8);
    lp.frequency.setValueAtTime(380, t);
    lp.frequency.linearRampToValueAtTime(900, t + len * 0.45);
    lp.frequency.linearRampToValueAtTime(420, t + len);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05 * level, t + Math.min(3.5, len * 0.35));
    g.gain.setValueAtTime(0.05 * level, t + len - 3.5);
    g.gain.linearRampToValueAtTime(0, t + len);
    for (const n of ch.notes) {
      N.osc('sawtooth', semi(n), lp, -7);
      N.osc('sawtooth', semi(n), lp, 7);
    }
    lp.connect(g);
    g.connect(this.layers.calm.gain);
    const send = N.gain(0.35);
    g.connect(send);
    send.connect(this.echoIn);
  }

  _whistle(t, dur, f, tail) {
    const end = t + dur + 0.6 * tail;
    const N = this._note(t, end);
    if (!N) return;
    const g = N.gain(0);
    const o = N.osc('sine', f, g);
    const o2 = N.osc('triangle', f * 2, N.gain(0));
    // breathy attack, delayed vibrato, a slight scoop into the note
    o.frequency.setValueAtTime(f * 0.97, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vg = N.gain(0);
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.6, dur * 0.6));
    vib.connect(vg);
    vg.connect(o.frequency);
    vib.start(t);
    vib.stop(end);
    N.nodes.push(vib);
    const lvl = 0.06;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl, t + 0.06);
    g.gain.setTargetAtTime(lvl * 0.7, t + 0.06, dur * 0.5);
    g.gain.setTargetAtTime(0, t + dur, 0.12 * tail);
    o2.disconnect();
    const h = N.gain(0.08);
    o2.connect(h);
    h.connect(g);
    g.connect(this.layers.calm.gain);
    const send = N.gain(0.8);
    g.connect(send);
    send.connect(this.echoIn);
  }

  _beat(t, b, boss) {
    const bar = Math.floor(b / 8), pos = b % 8;
    const ch = this.chord || PROGRESSION[0];
    // bass ostinato on the chord root (eighths with a syncopated pattern)
    const pattern = boss ? [1, 0, 1, 1, 0, 1, 1, 0] : [1, 0, 0, 1, 0, 1, 0, 1];
    if (pattern[pos]) {
      let root = ch.root;
      if (boss && pos === 6) root += 1; // the flat second: Phrygian menace
      this._bass(t, BEAT * 0.45, semi(root - 12), pos === 0 ? 1 : 0.7, boss);
    }
    // taiko on 1 and 3 (boss: every beat + pickups)
    if (pos === 0 || pos === 4 || (boss && (pos === 2 || pos === 6 || pos === 7))) this._taiko(t, pos === 0 ? 1 : 0.7, boss);
    // shaker ticks on the off-eighths
    if (pos % 2 === 1) this._tick16(t, pos === 7 ? 0.8 : 0.5);
    // tension swell every 2 bars
    if (pos === 0 && bar % 2 === 0) this._swell(t, BEAT * 7.5, ch, boss);
    // boss: low brass stab on the downbeat of every other bar
    if (boss && pos === 0 && bar % 2 === 1) this._stab(t, ch);
  }

  _bass(t, dur, f, acc, boss) {
    const N = this._note(t, t + dur + 0.08);
    if (!N) return;
    const g = N.gain(0);
    const lp = N.filter('lowpass', 200, 6);
    lp.frequency.setValueAtTime(boss ? 900 : 620, t);
    lp.frequency.exponentialRampToValueAtTime(140, t + dur);
    N.osc('sawtooth', f, lp);
    N.osc('square', f * 0.5, lp, 5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09 * acc, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    lp.connect(g);
    g.connect(this.layers.fight.gain);
  }

  _taiko(t, acc, boss) {
    const N = this._note(t, t + 0.6);
    if (!N) return;
    const g = N.gain(0);
    const o = N.osc('sine', 72, g);
    o.frequency.setValueAtTime(boss ? 82 : 70, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32 * acc, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.5);
    g.connect(boss ? this.layers.boss.gain : this.layers.fight.gain);
    // skin slap
    const h = N.gain(0);
    const bp = N.filter('bandpass', 900, 1.2);
    N.osc('triangle', 180, bp);
    h.gain.setValueAtTime(0, t);
    h.gain.linearRampToValueAtTime(0.05 * acc, t + 0.002);
    h.gain.exponentialRampToValueAtTime(0.0005, t + 0.08);
    bp.connect(h);
    h.connect(boss ? this.layers.boss.gain : this.layers.fight.gain);
  }

  _tick16(t, acc) {
    if (!this.noiseBuf) {
      const sr = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, sr, sr);
      const d = this.noiseBuf.getChannelData(0);
      let s = 12345;
      for (let i = 0; i < d.length; i++) {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        d[i] = (s >>> 0) / 2147483648 - 1;
      }
    }
    const N = this._note(t, t + 0.07);
    if (!N) return;
    const g = N.gain(0);
    const hp = N.filter('highpass', 6500, 0.7);
    N.noise(this.noiseBuf, hp);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.022 * acc, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0003, t + 0.06);
    hp.connect(g);
    g.connect(this.layers.fight.gain);
  }

  _swell(t, len, ch, boss) {
    const N = this._note(t, t + len + 0.2);
    if (!N) return;
    const g = N.gain(0);
    const bp = N.filter('bandpass', 1200, 2.5);
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.linearRampToValueAtTime(1800, t + len);
    // a minor second rubbing at the top of the chord
    const top = ch.notes[2] + 12;
    N.osc('sawtooth', semi(top), bp, -4);
    N.osc('sawtooth', semi(top + 1), bp, 4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.022 * (boss ? 1.3 : 1), t + len * 0.85);
    g.gain.linearRampToValueAtTime(0, t + len);
    bp.connect(g);
    g.connect(this.layers.fight.gain);
    const s = N.gain(0.4);
    g.connect(s);
    s.connect(this.echoIn);
  }

  _stab(t, ch) {
    const N = this._note(t, t + 1.4);
    if (!N) return;
    const g = N.gain(0);
    const lp = N.filter('lowpass', 300, 3);
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 1.1);
    for (const n of [ch.root - 12, ch.root - 11, ch.root - 5]) {
      N.osc('sawtooth', semi(n), lp, -6);
      N.osc('sawtooth', semi(n), lp, 6);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.3);
    lp.connect(g);
    g.connect(this.layers.boss.gain);
  }
}

export const MUSIC_TEMPO = BPM;
