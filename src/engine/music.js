// Procedural, sample-free music: a lookahead step sequencer (setInterval 25ms,
// scheduling ~0.12s ahead on the AudioContext clock) driving synthesized
// instruments (taiko, shamisen-ish plucks, synth bass, drums, pads, bells).
// Each track plays on its own "deck" (gain + private reverb) so switching
// tracks crossfades and cut() can silence everything instantly.
// Output: deck -> JJK.Audio._musicBus (musicVol) -> hush -> master chain.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U;
  const M = (JJK.Music = {});
  const A = JJK.Audio;
  const S = A && A._synth;
  const LOOKAHEAD = 0.12, TICK_MS = 25;

  // ---------------------------------------------------------------- notes
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const acc = (s) => (s === '#' ? 1 : s === 'b' ? -1 : 0);
  function nm(s) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
    return m ? 12 * (+m[3] + 1) + NOTE[m[1]] + acc(m[2]) : null;
  }
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // Bars of 16 tokens ("D5", "." rest, "-" tie) -> per-bar step index of {m, n}.
  function seq(bars) {
    return bars.map((str) => {
      const idx = new Array(16).fill(null);
      let last = null;
      str.trim().split(/\s+/).forEach((tk, i) => {
        if (tk === '-') {
          if (last) last.n++;
        } else if (tk === '.') last = null;
        else {
          const m = nm(tk);
          if (m == null || i > 15) return;
          last = { m, n: 1 };
          (idx[i] || (idx[i] = [])).push(last);
        }
      });
      return idx;
    });
  }
  const CHQ = {
    '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
    m9: [0, 3, 7, 10, 14], 9: [0, 4, 7, 10, 14], sus4: [0, 5, 7], dim: [0, 3, 6], 5: [0, 7],
  };
  const chordCache = {};
  function chord(name) {
    if (chordCache[name]) return chordCache[name];
    const m = /^([A-G])(#|b)?(.*)$/.exec(name);
    return (chordCache[name] = { pc: NOTE[m[1]] + acc(m[2]), iv: CHQ[m[3]] || CHQ[''] });
  }
  const rootAt = (pc, lo) => lo + ((((pc - lo) % 12) + 12) % 12);
  const tones = (ch, lo, n) => ch.iv.slice(0, n || 3).map((i) => rootAt(ch.pc, lo) + i);

  // ---------------------------------------------------------------- instruments
  const L = (v, o) => S.L(v, o);
  const fin = (v) => S.finish(v);
  function nv(d, t, vol, pan, rev) {
    const v = S.voice(d.E, { when: t, dest: d.dry, revDest: d.verbIn, vol, pan, nocount: true });
    if (rev) v.verb(rev);
    return v;
  }
  const X = {
    kick(d, t, g) {
      const v = nv(d, t, g);
      L(v, { src: 'sine', f: [[0, 165], [0.05, 55], [0.3, 42]], a: 0.001, d: 0.34, g: 0.75 });
      L(v, { src: 'triangle', f: [[0, 320], [0.02, 90]], a: 0.0005, d: 0.03, g: 0.25 });
      L(v, { src: 'white', fl: { type: 'highpass', f: 2500 }, a: 0.0005, d: 0.008, g: 0.2 });
      fin(v);
    },
    snare(d, t, g) {
      const v = nv(d, t, g, 0, 0.16);
      L(v, { src: 'white', fl: { type: 'bandpass', f: 1900, Q: 0.9 }, a: 0.001, d: 0.17, g: 0.55 });
      L(v, { src: 'white', fl: { type: 'highpass', f: 5000 }, a: 0.001, d: 0.07, g: 0.25 });
      L(v, { src: 'triangle', f: [[0, 240], [0.04, 175]], a: 0.001, d: 0.09, g: 0.35 });
      fin(v);
    },
    clap(d, t, g) {
      const v = nv(d, t, g, 0, 0.2);
      [0, 0.011, 0.023].forEach((x, i) => L(v, { src: 'white', t: x, fl: { type: 'bandpass', f: 1300, Q: 1.4 }, a: 0.0008, d: i === 2 ? 0.16 : 0.012, g: 0.5 }));
      fin(v);
    },
    hat(d, t, g, open, pan) {
      const v = nv(d, t, g, pan || 0);
      L(v, { src: 'white', fl: [{ type: 'highpass', f: 7500 }, { type: 'peaking', f: 10000, Q: 1, gain: 6 }], a: 0.0008, d: open ? 0.22 : 0.035, g: 0.25 });
      fin(v);
    },
    taiko(d, t, g, f) {
      f = f || 72;
      const v = nv(d, t, g, 0, 0.25);
      L(v, { src: 'sine', f: [[0, f * 1.9], [0.035, f * 1.1], [0.5, f]], a: 0.001, d: 0.6, g: 0.75 });
      L(v, { src: 'brown', fl: { type: 'lowpass', f: 450 }, a: 0.001, d: 0.18, g: 0.5 });
      L(v, { src: 'white', fl: { type: 'bandpass', f: 1000, Q: 1.2 }, a: 0.0005, d: 0.025, g: 0.25 });
      fin(v);
    },
    shime(d, t, g, pan) {
      const v = nv(d, t, g, pan || 0, 0.18);
      L(v, { src: 'sine', f: [[0, 420], [0.03, 300]], a: 0.0008, d: 0.12, g: 0.4 });
      L(v, { src: 'white', fl: { type: 'bandpass', f: 2200, Q: 2 }, a: 0.0005, d: 0.03, g: 0.3 });
      fin(v);
    },
    ka(d, t, g, pan) {
      const v = nv(d, t, g, pan || 0, 0.1);
      L(v, { src: 'white', fl: { type: 'bandpass', f: 2600, Q: 3 }, a: 0.0005, d: 0.03, g: 0.6 });
      L(v, { src: 'triangle', f: 850, a: 0.0005, d: 0.025, g: 0.25 });
      fin(v);
    },
    // shamisen-ish: bright saw with a fast filter snap, buzzy sawari and bachi click
    pluck(d, t, m, g, dur, bright, pan, rev) {
      const f = hz(m), v = nv(d, t, g, pan || 0, rev == null ? 0.15 : rev);
      bright = bright == null ? 1 : bright;
      L(v, { src: 'sawtooth', f: [[0, f * 1.012], [0.025, f]], fl: { type: 'lowpass', f: [[0, Math.min(9000, f * 10 * bright)], [0.09, f * 2.2]], Q: 3 }, a: 0.001, d: dur, g: 0.32 });
      L(v, { src: 'square', f: [[0, f * 2.03], [0.025, f * 2.01]], fl: { type: 'bandpass', f: Math.min(6000, f * 5), Q: 2 }, a: 0.001, d: dur * 0.5, g: 0.06 });
      L(v, { src: 'white', fl: { type: 'highpass', f: 3000 }, a: 0.0005, d: 0.012, g: 0.1 });
      fin(v);
    },
    bass(d, t, m, g, dur, cut) {
      const f = hz(m), v = nv(d, t, g);
      cut = cut || 800;
      L(v, { src: 'sawtooth', f, fl: { type: 'lowpass', f: [[0, cut * 3], [0.08, cut]], Q: 5 }, a: 0.003, h: dur * 0.5, d: dur * 0.5 + 0.05, g: 0.3 });
      L(v, { src: 'sine', f, a: 0.003, h: dur * 0.5, d: dur * 0.5 + 0.05, g: 0.4 });
      fin(v);
    },
    pad(d, t, ms, dur, g, cut) {
      const v = nv(d, t, g, 0, 0.4);
      ms.forEach((m) => [-8, 8].forEach((det) =>
        L(v, { src: 'sawtooth', f: hz(m), det, fl: { type: 'lowpass', f: cut || 1400, Q: 1 }, a: dur * 0.25, h: dur * 0.45, d: dur * 0.5, g: 0.06, pan: det > 0 ? 0.3 : -0.3 })));
      fin(v);
    },
    bell(d, t, m, g, dur, pan) {
      const f = hz(m), v = nv(d, t, g, pan || 0, 0.6);
      dur = dur || 2.5;
      L(v, { src: 'sine', f, fm: { f: f * 3.51, i: [[0, f * 2.2], [dur * 0.5, f * 0.05]] }, a: 0.002, d: dur, g: 0.25 });
      L(v, { src: 'sine', f: f * 2, a: 0.002, d: dur * 0.4, g: 0.06 });
      fin(v);
    },
    // shakuhachi-ish breathy flute with delayed vibrato
    flute(d, t, m, g, dur) {
      const f = hz(m), v = nv(d, t, g, -0.1, 0.35);
      L(v, { src: 'triangle', f, fm: { f: 5.2, i: [[0, 0.01], [0.3, f * 0.012], [dur + 0.1, f * 0.014]] }, a: 0.07, h: dur * 0.65, d: dur * 0.35 + 0.1, g: 0.3 });
      L(v, { src: 'sine', f: f * 2, a: 0.08, h: dur * 0.5, d: dur * 0.4, g: 0.05 });
      L(v, { src: 'white', fl: { type: 'bandpass', f: Math.min(9000, f * 2), Q: 3 }, a: 0.04, h: dur * 0.3, d: dur * 0.5, g: 0.12 });
      fin(v);
    },
    epiano(d, t, m, g, dur) {
      const f = hz(m), v = nv(d, t, g, 0, 0.25);
      L(v, { src: 'sine', f, fm: { f, i: [[0, f * 1.1], [0.4, f * 0.08]] }, am: { f: 4.5, d: 0.15 }, a: 0.002, d: dur, g: 0.22 });
      L(v, { src: 'sine', f: f * 4, a: 0.001, d: 0.15, g: 0.03 });
      fin(v);
    },
    lead(d, t, m, g, dur, pan) {
      const f = hz(m), v = nv(d, t, g, pan || 0, 0.25);
      L(v, { src: 'square', f, fm: { f: 5.5, i: [[0, 0.01], [0.2, f * 0.01]] }, fl: { type: 'lowpass', f: Math.min(8000, f * 6), Q: 2 }, a: 0.01, h: dur * 0.6, d: dur * 0.4 + 0.08, g: 0.16 });
      L(v, { src: 'sawtooth', f, det: 7, fl: { type: 'lowpass', f: Math.min(8000, f * 4) }, a: 0.01, h: dur * 0.6, d: dur * 0.4 + 0.08, g: 0.1 });
      fin(v);
    },
    stab(d, t, ms, g, dur) {
      const v = nv(d, t, g, 0, 0.35);
      ms.forEach((m) => [-10, 0, 10].forEach((det) =>
        L(v, { src: 'sawtooth', f: hz(m), det, fl: { type: 'lowpass', f: [[0, 600], [0.04, 5000], [dur, 1200]], Q: 2 }, a: 0.01, h: dur * 0.3, d: dur * 0.7, g: 0.04 })));
      fin(v);
    },
    drone(d, t, ms, dur, g, cut) {
      const v = nv(d, t, g, 0, 0.3);
      ms.forEach((m) => [-6, 6].forEach((det) =>
        L(v, { src: 'sawtooth', f: hz(m), det, fl: { type: 'lowpass', f: cut || 300, Q: 4 }, dist: 1.5, a: dur * 0.3, h: dur * 0.4, d: dur * 0.3, g: 0.07, pan: det > 0 ? 0.25 : -0.25 })));
      fin(v);
    },
    growl(d, t, m, dur, g) {
      const v = nv(d, t, g, 0, 0.2);
      L(v, { src: 'sawtooth', f: hz(m), fl: { type: 'lowpass', f: [[0, 120], [dur * 0.5, 600], [dur, 150]], Q: 6 }, dist: 3, am: { f: 22, d: 0.5 }, a: dur * 0.4, h: dur * 0.2, d: dur * 0.4, g: 0.2 });
      fin(v);
    },
    sub(d, t, m, g, dur) {
      const v = nv(d, t, g);
      L(v, { src: 'sine', f: hz(m), a: 0.01, h: dur * 0.5, d: dur * 0.5, g: 0.5 });
      fin(v);
    },
    heart(d, t, g) {
      const v = nv(d, t, g, 0, 0.2);
      L(v, { src: 'sine', f: [[0, 70], [0.06, 44]], a: 0.004, d: 0.3, g: 0.6 });
      L(v, { src: 'sine', t: 0.22, f: [[0, 60], [0.06, 40]], a: 0.004, d: 0.3, g: 0.4 });
      fin(v);
    },
    crash(d, t, g) {
      const v = nv(d, t, g, 0, 0.25);
      L(v, { src: 'white', fl: { type: 'highpass', f: 4500 }, a: 0.001, d: 1.6, g: 0.25 });
      L(v, { src: 'white', fl: { type: 'bandpass', f: 7000, Q: 2 }, a: 0.001, d: 0.9, g: 0.12 });
      fin(v);
    },
    swell(d, t, dur, g) {
      const v = nv(d, t, g, 0, 0.3);
      L(v, { src: 'white', fl: { type: 'bandpass', f: [[0, 500], [dur, 6000]], Q: 1.2 }, env: [[0, 0.001], [dur, 0.3], [dur + 0.03, 0.0003]] });
      fin(v);
    },
    gong(d, t, f, g) {
      const v = nv(d, t, g, 0, 0.45);
      [[1, 0.22, 4], [1.19, 0.1, 3], [1.56, 0.09, 2.6], [2.0, 0.07, 2.2], [2.66, 0.05, 1.6], [3.01, 0.04, 1.4], [4.18, 0.025, 1]].forEach(([r, gg, dd]) =>
        [0, 1].forEach((k) => L(v, { src: 'sine', f: f * r + (k ? 0.6 + r * 0.3 : 0), a: 0.004, d: dd, g: gg * 0.5, pan: k ? 0.3 : -0.3 })));
      L(v, { src: 'brown', fl: { type: 'lowpass', f: 300 }, a: 0.002, d: 0.3, g: 0.3 });
      fin(v);
    },
    shimmer(d, t, f, g, dur, pan) {
      const v = nv(d, t, g, pan || 0, 0.6);
      [1, 1.0035].forEach((k) => L(v, { src: 'sine', f: f * k, a: dur * 0.4, d: dur * 0.6, g: 0.06, am: { f: 9, d: 0.5 } }));
      fin(v);
    },
  };

  // ---------------------------------------------------------------- tracks
  // step(d, bar, step16, time, stepDur, intensity)
  const TR = {};

  TR.battle = {
    bpm: 150, bars: 16, vol: 0.5,
    ch: ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Eb', 'C', 'Gm', 'Gm', 'Bb', 'A', 'Dm', 'Bb', 'Eb', 'A'],
    bass: [0, null, 0, 0, 12, null, 0, 0, 0, null, 0, 0, 12, null, 0, 7],
    lead: seq([
      'D5 . A4 . D5 . Eb5 . D5 - A4 . G4 . A4 .',
      'D5 . . F5 - Eb5 D5 . A4 - - . . . . .',
      'Bb4 . F4 . Bb4 . D5 . F5 - Eb5 . D5 . Bb4 .',
      'C5 . G4 . C5 . E5 . G5 - - - E5 . C5 .',
      'D5 . A4 . D5 . Eb5 . D5 - A4 . G4 . A4 .',
      'D5 . . F5 - G5 A5 . G5 F5 Eb5 . D5 . . .',
      'Eb5 . Bb4 . G4 . Bb4 . Eb5 - D5 . Bb4 . G4 .',
      'C5 - - - G4 . C5 . E5 - D5 . C5 . Bb4 .',
      'G4 . . Bb4 . D5 . G5 - - F5 . D5 . . .',
      'Eb5 - D5 . Bb4 . G4 . A4 - Bb4 . D5 . . .',
      'F5 . . D5 . Bb4 . F4 . Bb4 D5 . F5 . G5 .',
      'A5 - - - E5 . C#5 . A4 - - - . . . .',
      'D5 . F5 . A5 . G5 F5 Eb5 . D5 . A4 . D5 .',
      'Bb4 . D5 . F5 . Eb5 D5 Bb4 . F4 . Bb4 . D5 .',
      'Eb5 . G5 . Bb5 - A5 G5 Eb5 . G5 . Bb5 . G5 .',
      'A5 - - - . . E5 . C#5 . A4 . E5 . A5 .',
    ]),
    step(d, b, st, t, sd, I) {
      const ch = chord(this.ch[b]), root = rootAt(ch.pc, 33);
      const fill = b % 4 === 3 && st >= 12, roll = b % 8 === 7 && st >= 12;
      // drums
      if (!fill && (st === 0 || st === 7 || st === 8 || st === 10 || (I > 0.55 && st === 14))) X.kick(d, t, st === 0 ? 0.95 : 0.8);
      if (st === 4 || st === 12) {
        X.snare(d, t, 0.75);
        if (I > 0.4) X.clap(d, t, 0.35 * I);
      }
      if (roll && st > 12) X.snare(d, t, 0.3 + (st - 12) * 0.12);
      if (fill && b % 8 === 3 && st !== 13) X.taiko(d, t, 0.6, 100 - (st - 12) * 9);
      if (st === 0 && (b % 8 === 0 || (I > 0.4 && b % 4 === 0))) X.crash(d, t, 0.55);
      if (st % 2 === 0) X.hat(d, t, st % 4 === 2 ? 0.5 : 0.3, false, 0.2);
      else if (I > 0.6) X.hat(d, t, 0.12 + 0.25 * (I - 0.6), false, -0.2);
      if (st === 14 && b % 2 === 1) X.hat(d, t, 0.3, true, 0.2);
      // taiko layer (intensity)
      if (I > 0.3) {
        const k = 0.35 + (0.5 * (I - 0.3)) / 0.7;
        if (st === 0 || st === 6) X.taiko(d, t, k, 70);
        if (st === 11 || st === 13) X.shime(d, t, k * 0.7, 0.3);
        if (I > 0.8 && (st === 3 || st === 9)) X.taiko(d, t, k * 0.7, 85);
      }
      // bass + pad
      const bo = this.bass[st];
      if (bo != null) X.bass(d, t, root + bo, st % 4 === 0 ? 0.55 : 0.45, sd * (st % 4 === 0 ? 1.4 : 0.8), 500 + 900 * I);
      if (st === 0) X.pad(d, t, tones(ch, 50), sd * 16, 0.3 + 0.25 * I, 900 + 2600 * I);
      // shamisen lead, parallel-4th harmony and counter-arp with intensity
      const ev = this.lead[b][st];
      if (ev) {
        for (let i = 0; i < ev.length; i++) {
          const e = ev[i];
          X.pluck(d, t, e.m, 0.55, e.n * sd + 0.12, 0.8 + 0.4 * I, 0.15);
          if (I > 0.5) X.lead(d, t, e.m - 5, (I - 0.5) * 0.9, e.n * sd, -0.2);
        }
      }
      if (I > 0.7 && st % 2 === 1) {
        const tt = tones(ch, 62);
        X.pluck(d, t, tt[(st >> 1) % tt.length] + 12, (I - 0.7) * 1.2, sd * 1.5, 0.6, -0.35, 0.25);
      }
    },
  };

  TR.title = {
    bpm: 84, bars: 8, vol: 0.55,
    ch: ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'Gm', 'A'],
    mel: seq([
      'D5 - - - - - - - A4 - - - C5 - D5 -',
      'Eb5 - - - D5 - - - C5 - Bb4 - A4 - - -',
      'G4 - - - Bb4 - - - D5 - - - C5 - Bb4 -',
      'A4 - - - - - - - - - - - . . . .',
      'D5 - - - F5 - - - G5 - - - A5 - G5 -',
      'F5 - Eb5 - D5 - - - Bb4 - - - C5 - D5 -',
      'G5 - - - F5 - Eb5 - D5 - - - Bb4 - G4 -',
      'A4 - - - - - - - - - - - - - - -',
    ]),
    step(d, b, st, t, sd) {
      const ch = chord(this.ch[b]), r = rootAt(ch.pc, 38), tt = tones(ch, 55);
      if (st === 0) {
        X.pad(d, t, tones(ch, 50).concat([rootAt(ch.pc, 50) + 12]), sd * 16 * 1.05, 0.35, 1300);
        X.bass(d, t, r, 0.4, sd * 14, 300);
        if (b === 0) X.crash(d, t, 0.4);
        if (b % 4 === 0) X.bell(d, t, rootAt(ch.pc, 74), 0.3, 3);
      }
      const big = { 0: [0.9, 65], 6: [0.5, 80], 10: [0.55, 80], 12: [0.8, 65], 14: [0.4, 90] }[st];
      if (big) X.taiko(d, t, big[0], big[1]);
      if (st === 3 || st === 11) X.ka(d, t, 0.35);
      if (b % 4 === 3 && st >= 12) X.shime(d, t, 0.25 + (st - 12) * 0.1, 0.2);
      if (st === 2 || st === 5 || st === 10 || st === 13) X.pluck(d, t, tt[(st + b) % 3] + 12, 0.25, sd * 3, 0.8, 0.25, 0.25);
      if (b >= 4 && st % 2 === 0) X.hat(d, t, 0.12, false, -0.2);
      const ev = this.mel[b][st];
      if (ev) ev.forEach((e) => X.flute(d, t, e.m, 0.5, e.n * sd));
    },
  };

  TR.select = {
    bpm: 126, bars: 8, vol: 0.45,
    ch: ['Dm', 'Dm', 'Bb', 'C', 'Gm', 'Gm', 'Eb', 'A'],
    step(d, b, st, t, sd) {
      const ch = chord(this.ch[b]), r = rootAt(ch.pc, 33), tt = tones(ch, 57);
      if (st % 4 === 0) X.kick(d, t, 0.8);
      if (st === 4 || st === 12) X.clap(d, t, 0.45);
      if (st % 4 === 2) X.hat(d, t, 0.35, true, 0.15);
      else X.hat(d, t, 0.12, false, -0.15);
      if (st % 2 === 0) X.bass(d, t, r + (st % 4 === 2 ? 12 : 0), 0.45, sd * 1.5, 700);
      const arp = [tt[0], tt[2], tt[0] + 12, tt[1] + 12];
      X.pluck(d, t, arp[st % 4] + (st >= 8 && b % 2 ? 12 : 0), 0.22, sd * 2, 0.7, st % 2 ? 0.3 : -0.3, 0.2);
      if (st === 0) X.pad(d, t, tt, sd * 16, 0.25, 1100);
      if (st === 0 && b % 4 === 0) X.crash(d, t, 0.3);
      if (b % 4 === 3 && st >= 12 && st % 2 === 0) X.snare(d, t, 0.3);
    },
  };

  // Unlimited Void: slow lydian clusters, bells, heartbeat, shimmer, swells.
  TR.void = {
    bpm: 60, bars: 8, vol: 0.8,
    cl: [['D3', 'A3', 'E4', 'G#4', 'C#5'], ['Bb2', 'F3', 'C4', 'E4', 'A4'], ['G2', 'D3', 'A3', 'B3', 'F#4'], ['Eb2', 'Bb2', 'F3', 'A3', 'D4']].map((c) => c.map(nm)),
    bells: ['D5', 'E5', 'F#5', 'G#5', 'A5', 'B5', 'C#6', 'D6', 'E6'].map(nm),
    step(d, b, st, t, sd) {
      const cl = this.cl[(b >> 1) % 4], bs = this.bells;
      if (st === 0 && b % 2 === 0) {
        X.pad(d, t, cl, sd * 32 * 1.1, 0.35, 1600);
        X.sub(d, t, cl[0] - 12, 0.35, sd * 30);
      }
      if (st === 0) X.heart(d, t, 0.35);
      if ((st === 0 || st === 5 || st === 10 || st === 13) && (b * 31 + st * 17) % 5 < 3)
        X.bell(d, t, bs[(b * 7 + st * 3) % bs.length], 0.22, 3.5, ((b + st) % 3) * 0.5 - 0.5);
      if (st === 8) X.shimmer(d, t, hz(bs[(b * 5) % bs.length] + 12), 0.25, sd * 12, b % 2 ? 0.6 : -0.6);
      if (b % 2 === 1 && st === 8) X.swell(d, t, sd * 8, 0.2);
      if (b % 4 === 3 && st === 12) X.bell(d, t, cl[0] + 18, 0.15, 3);
    },
  };

  // Malevolent Shrine: taiko groove, minor-2nd drones, temple bell, low riff.
  TR.shrine = {
    bpm: 92, bars: 8, vol: 0.6,
    riff: seq(['D3 . . Eb3 . . D3 . . . G#2 . A2 . . .', 'D3 . D3 Eb3 . . G#2 . . A2 . . D3 . Eb3 .']),
    step(d, b, st, t, sd) {
      if (st === 0 && b % 4 === 0) {
        X.drone(d, t, [38, 39], sd * 64 * 1.05, 0.5, 280);
        X.drone(d, t, [44], sd * 64, 0.25, 400);
        X.gong(d, t, 98, 0.5);
      }
      const big = { 0: 0.8, 3: 0.6, 8: 0.75, 14: 0.55 }[st];
      if (big) X.taiko(d, t, big, 62);
      if (st === 6 || st === 11) X.taiko(d, t, 0.5, 95);
      if (st === 2 || st === 10 || st === 15) X.ka(d, t, 0.3, st === 10 ? 0.3 : -0.3);
      if (b % 4 === 3 && st >= 12) X.shime(d, t, 0.3 + (st - 12) * 0.1);
      const ev = this.riff[b < 4 ? 0 : 1][st];
      if (ev) ev.forEach((e) => X.pluck(d, t, e.m, 0.45, e.n * sd + 0.1, 0.5, 0, 0.2));
      if (b % 2 === 1 && st === 8) X.growl(d, t, 26, sd * 8, 0.4);
      if (b % 4 === 2 && st === 0) X.bell(d, t, 75, 0.12, 3);
    },
  };

  // Domain clash: rising 16th ostinato (up a semitone every 2 bars).
  TR.clash = {
    bpm: 140, bars: 8, vol: 0.5,
    ost: [0, 0, 7, 0, 1, 0, 7, 0, 0, 0, 7, 0, 1, 0, 8, 7],
    step(d, b, st, t, sd) {
      const tr = b >> 1;
      X.pluck(d, t, 62 + tr + this.ost[st], st % 4 === 0 ? 0.35 : 0.24, sd * 0.9, 0.5 + 0.15 * tr, st % 2 ? 0.25 : -0.25, 0.1);
      if (st % 2 === 0) X.bass(d, t, 38 + tr, 0.45, sd * 0.9, 400 + 150 * tr);
      if (b < 4 ? st === 0 || st === 8 : st % 4 === 0) X.kick(d, t, 0.8);
      X.hat(d, t, st % 4 === 0 ? 0.3 : 0.14, false, 0.2);
      if (st === 0) X.taiko(d, t, 0.6, 68);
      if (st === 0 && b % 2 === 0) X.pad(d, t, [50 + tr, 56 + tr, 57 + tr], sd * 32, 0.3, 900 + 300 * tr);
      if (b === 7 && (st >= 8 || st % 2 === 0)) X.snare(d, t, 0.2 + st * 0.03);
      if (b === 6 && st === 0) X.swell(d, t, sd * 32, 0.3);
      if (b === 0 && st === 0) X.crash(d, t, 0.45);
    },
  };

  // Victory: 2-bar triumphant sting (plays once), then a quiet 4-bar loop.
  TR.victory = {
    bpm: 116, intro: 2, bars: 4, vol: 0.55,
    ch: ['D', 'Bm', 'G', 'A'],
    step(d, b, st, t, sd) {
      if (b === 0) {
        if (st === 0) {
          X.crash(d, t, 0.6); X.taiko(d, t, 0.9, 65); X.kick(d, t, 0.9);
          X.stab(d, t, [62, 66, 69, 74], 0.5, sd * 3); X.bass(d, t, 38, 0.5, sd * 4, 600);
        }
        if (st < 4) X.pluck(d, t, [62, 66, 69, 74][st], 0.4, sd * 2, 1.1);
        if (st === 4) X.lead(d, t, 74, 0.45, sd * 4);
        if (st === 8) {
          X.stab(d, t, [62, 67, 71, 74], 0.45, sd * 2); X.taiko(d, t, 0.7, 75); X.bass(d, t, 43, 0.5, sd * 3, 600);
        }
        if (st === 10) X.lead(d, t, 76, 0.4, sd * 2);
        if (st === 12) {
          X.stab(d, t, [64, 69, 73, 76], 0.45, sd * 3); X.taiko(d, t, 0.7, 80); X.snare(d, t, 0.5);
          X.bass(d, t, 45, 0.5, sd * 4, 600); X.lead(d, t, 78, 0.4, sd * 3);
        }
        if (st === 14 || st === 15) X.snare(d, t, 0.35);
      } else if (b === 1) {
        if (st === 0) {
          X.crash(d, t, 0.6); X.kick(d, t, 0.9); X.taiko(d, t, 0.9, 62);
          X.stab(d, t, [62, 66, 69, 74, 78], 0.55, sd * 14); X.lead(d, t, 81, 0.45, sd * 12);
          X.bass(d, t, 38, 0.55, sd * 14, 500); X.bell(d, t, 86, 0.25, 3);
        }
      } else {
        const ch = chord(this.ch[b - 2]), tt = tones(ch, 57);
        if (st === 0) {
          X.pad(d, t, tt, sd * 16, 0.18, 1000);
          X.sub(d, t, rootAt(ch.pc, 38), 0.3, sd * 14);
        }
        if (st === 0 || st === 8) tt.forEach((m) => X.epiano(d, t, m, 0.18, sd * 7));
        if (st % 2 === 0) X.pluck(d, t, [tt[0], tt[1], tt[2], tt[1]][(st >> 1) % 4] + 12, 0.12, sd * 3, 0.6, st % 4 ? 0.3 : -0.3, 0.3);
        if (st === 4 || st === 12) X.hat(d, t, 0.1);
      }
    },
  };

  // Training: laid-back swung groove with e-piano chords.
  TR.training = {
    bpm: 98, bars: 8, vol: 0.5, swing: 0.14,
    ch: ['Dm9', 'Gm9', 'Bbmaj7', 'A7', 'Dm9', 'Gm9', 'Bbmaj7', 'A7'],
    mel: seq([
      'A4 . . C5 . . D5 . . . . . . . . .',
      '. . . . . . F5 - E5 . D5 . . . . .',
      'D5 . . . A4 . . C5 . . . . . . . .',
      '. . . . E5 . . . C#5 - - - . . . .',
      'A4 . . C5 . . D5 . F5 . . . E5 . . .',
      '. . . . . . D5 - C5 . A4 . . . . .',
      'F5 . . . E5 . D5 . . . A4 . . . . .',
      '. . . . E5 . . . G5 - F5 - E5 - . .',
    ]),
    bassline: { 0: [0, 5], 7: [0, 2], 10: [7, 3], 14: [12, 2] },
    step(d, b, st, t, sd) {
      const ch = chord(this.ch[b]), r = rootAt(ch.pc, 38);
      if (st === 0 || st === 7 || st === 10) X.kick(d, t, st === 0 ? 0.65 : 0.5);
      if (st === 4 || st === 12) X.ka(d, t, 0.45, 0.1);
      if (st % 2 === 0) X.hat(d, t, st % 4 === 2 ? 0.2 : 0.13, false, 0.25);
      else if (st === 15) X.hat(d, t, 0.08, false, -0.25);
      const bl = this.bassline[st];
      if (bl) X.bass(d, t, r + bl[0], 0.45, sd * bl[1], 450);
      if (st === 0 || st === 10) ch.iv.forEach((i) => X.epiano(d, t, rootAt(ch.pc, 50) + i, 0.16, sd * (st ? 5 : 8)));
      const ev = this.mel[b][st];
      if (ev) ev.forEach((e) => X.pluck(d, t, e.m, 0.3, e.n * sd + 0.1, 0.6, 0.2, 0.25));
    },
  };

  // ---------------------------------------------------------------- decks / scheduler
  const decks = [];
  let cur = null, want = null, target = 0, paused = false, timer = null;
  const warned = {};
  const liveE = () => (A && A._E) || null;

  // Private reverb units, reused once their tail has died out.
  function verbUnit(E, d) {
    const c = E.ctx, now = c.currentTime, pool = E._mverb || (E._mverb = []);
    let u = null;
    for (let i = 0; i < pool.length; i++) if (!pool[i].owner && (pool[i].free <= now || pool.length >= 4)) u = u || pool[i];
    if (!u) {
      u = { inp: c.createGain(), hp: c.createBiquadFilter(), cv: c.createConvolver(), out: c.createGain(), owner: null, free: 0 };
      u.hp.type = 'highpass';
      u.hp.frequency.value = 200;
      u.cv.buffer = E.mir || (E.mir = S.makeIR(c, 2.4, 2.0, 0.6));
      u.out.gain.value = 0.7;
      u.inp.connect(u.hp); u.hp.connect(u.cv); u.cv.connect(u.out);
      pool.push(u);
    }
    u.owner = d;
    try { u.out.disconnect(); } catch (e) {}
    u.out.connect(d.dry);
    return u;
  }
  function makeDeck(E, name, dest) {
    const c = E.ctx, tr = TR[name];
    const d = {
      E, c, tr, name, step: 0, next: c.currentTime + 0.06, I: target, sd: 60 / tr.bpm / 4,
      total: ((tr.intro || 0) + tr.bars) * 16, loopAt: (tr.intro || 0) * 16, stopAt: 0, dead: false,
    };
    d.gain = c.createGain();
    d.gain.gain.value = 0;
    d.gain.connect(dest || E.music);
    d.dry = c.createGain();
    d.dry.gain.value = tr.vol;
    d.dry.connect(d.gain);
    d.unit = verbUnit(E, d);
    d.verbIn = d.unit.inp;
    return d;
  }
  function kill(d, ms) {
    d.dead = true;
    if (d.unit) {
      d.unit.owner = null;
      d.unit.free = d.c.currentTime + 2.6;
    }
    setTimeout(() => {
      try { d.gain.disconnect(); } catch (e) {}
    }, ms);
  }
  function fadeTo(d, val, sec) {
    const p = d.gain.gain, now = d.c.currentTime;
    S.hold(p, now);
    if (sec > 0.005) p.linearRampToValueAtTime(val, now + sec);
    else p.setValueAtTime(val, now);
  }
  function run(d) {
    const s = d.step, b = s >> 4, st = s & 15;
    if (st === 0) d.I = U.approach(d.I, target, 0.34); // intensity moves at bar lines
    const t = d.next + (st % 2 ? (d.tr.swing || 0) * d.sd : 0);
    try {
      d.tr.step(d, b, st, t, d.sd, d.I);
    } catch (e) {
      if (!warned[d.name]) {
        warned[d.name] = 1;
        try { console.warn('[JJK.Music] ' + d.name + ': ' + e); } catch (e2) {}
      }
    }
  }
  function advance(d) {
    d.step++;
    if (d.step >= d.total) d.step = d.loopAt;
    d.next += d.sd;
  }
  function tick() {
    const E = liveE();
    if (!E || E.ctx.state !== 'running') return;
    const now = E.ctx.currentTime;
    for (let i = decks.length - 1; i >= 0; i--) {
      const d = decks[i];
      if (d.dead) {
        decks.splice(i, 1);
        continue;
      }
      if (d.stopAt && now >= d.stopAt) {
        kill(d, 50);
        decks.splice(i, 1);
        continue;
      }
      if (paused) continue;
      // fell behind (throttled tab, suspended context): skip ahead silently
      for (let g = 0; d.next < now - 0.05 && g < 8192; g++) advance(d);
      while (d.next < now + LOOKAHEAD) {
        run(d);
        advance(d);
      }
    }
    if (!decks.length && timer) {
      clearInterval(timer);
      timer = null;
    }
  }
  function ensureTimer() {
    if (!timer) timer = setInterval(tick, TICK_MS);
    tick();
  }
  function start(fade) {
    const E = liveE();
    if (!E || !S || !want) return;
    if (cur && cur.name === want && !cur.dead && !cur.stopAt) return;
    const now = E.ctx.currentTime;
    if (cur && !cur.dead) {
      fadeTo(cur, 0, fade);
      cur.stopAt = now + fade + 0.05;
    }
    const d = makeDeck(E, want);
    fadeTo(d, 1, fade);
    decks.push(d);
    cur = d;
    while (decks.length > 3) kill(decks.shift(), 30); // rapid switching
    ensureTimer();
  }

  // ---------------------------------------------------------------- public API
  M.play = function (track, fadeSec) {
    if (!TR[track]) {
      if (!warned['t:' + track]) {
        warned['t:' + track] = 1;
        try { console.warn('[JJK.Music] unknown track "' + track + '"'); } catch (e) {}
      }
      return;
    }
    if (want === track && cur && !cur.dead && !cur.stopAt) return;
    want = track;
    paused = false;
    start(fadeSec == null ? 0.4 : Math.max(0, +fadeSec || 0));
  };
  M.setIntensity = function (x) {
    target = U.clamp(+x || 0, 0, 1);
  };
  // Instant silence (6ms anti-click ramp), including reverb tails.
  M.cut = function () {
    want = null;
    const E = liveE();
    if (E) {
      const now = E.ctx.currentTime;
      decks.forEach((d) => {
        const p = d.gain.gain;
        S.hold(p, now);
        p.linearRampToValueAtTime(0, now + 0.006);
        kill(d, 60);
      });
    }
    decks.length = 0;
    cur = null;
  };
  M.stop = function (fadeSec) {
    want = null;
    const E = liveE();
    if (E) {
      const fade = fadeSec == null ? 0.5 : Math.max(0, +fadeSec || 0), now = E.ctx.currentTime;
      decks.forEach((d) => {
        if (d.stopAt || d.dead) return;
        fadeTo(d, 0, fade);
        d.stopAt = now + fade + 0.05;
      });
    }
    cur = null;
  };
  M.pause = function () {
    if (paused) return;
    paused = true;
    decks.forEach((d) => {
      if (!d.stopAt && !d.dead) fadeTo(d, 0, 0.08);
    });
  };
  M.resume = function () {
    if (!paused) return;
    paused = false;
    const E = liveE();
    if (!E) return;
    const now = E.ctx.currentTime;
    decks.forEach((d) => {
      if (d.stopAt || d.dead) return;
      d.next = now + 0.05;
      fadeTo(d, 1, 0.2);
    });
  };
  M.tracks = () => Object.keys(TR);
  Object.defineProperty(M, 'current', { enumerable: true, get: () => want });
  Object.defineProperty(M, 'intensity', { enumerable: true, get: () => target });

  // Start a track requested before the AudioContext existed.
  if (A && A._onUnlock) A._onUnlock(() => start(0.6));

  // Offline render for analysis -> Promise<AudioBuffer|null>.
  M._render = function (track, seconds, intensity) {
    seconds = seconds || 10;
    const o = A && A._offline ? A._offline(seconds + 2.5, true) : null;
    if (!o || !TR[track]) return Promise.resolve(null);
    const saved = target;
    target = U.clamp(intensity || 0, 0, 1);
    const d = makeDeck(o.E, track, o.E.music);
    d.gain.gain.value = 1;
    d.I = target;
    d.next = 0.05;
    while (d.next < seconds) {
      run(d);
      advance(d);
    }
    target = saved;
    return o.ctx.startRendering();
  };
})();
