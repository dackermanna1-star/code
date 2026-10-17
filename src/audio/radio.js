// The car radio in the prologue (v2.2): an AM station on low through the '86 Taurus's door speakers,
// and the knob that turns it off.
//   loop('car_radio', { vol, level })  band-limited AM (≈ 260 Hz – 2.7 kHz): an announcer's formant
//       babble (no words), stretches of a generic soft-rock bed (pad chords, a bass pulse, a ticking
//       hat — no melody, no real song), hiss, crackle and slow night-time AM fading. Never repeats.
//   sfx('radio_off')                    the knob's detent click, a speaker pop, the station cut off.
import { burst, envPts, BQ, filt, dbToGain } from './dsp.js';
import { knock, clink, thump } from './synth.js';
import { noiseLayer, modulate } from './layers.js';
import { formantVoice } from './voices.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// A generic four-chord cycle (vi–IV–I–V shapes in A minor / C), voiced as triads; bass roots.
const CHORDS = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];
const ROOTS = [45, 41, 48, 43];

/** The station: talk and music segments crossfading on a slow schedule, under AM hiss and fades. */
export function carRadio(V, eng, o = {}) {
  const R = eng.R.fork();
  const level = o.level ?? -14;
  // the door speakers: boxy, band-limited
  const spk = V.gain(dbToGain(level));
  const hp = V.filter('highpass', 260, 0.8);
  const box = V.filter('peaking', 1150, 1.4, 5);
  const lp = V.filter('lowpass', 2700, 0.9);
  V.chain(spk, hp, box, lp, V.out);
  modulate(V, eng, spk.gain, { period: 11, points: 10, depth: dbToGain(level) * 0.35, seed: 62 }); // AM fading

  // AM hiss + the odd crackle
  noiseLayer(V, eng, { color: 'white', filters: [['bandpass', 1900, 0.6]], level: -27, dest: spk, mod: { period: 3.7, points: 14, depth: 0.6, seed: 61 } });
  const crackleBus = V.gain(dbToGain(-16)); crackleBus.connect(spk);
  eng.addTask(V.t0 + R.range(0.5, 2), (t) => {
    if (V.disposed || V.stopping) return null;
    const v = eng.play('record_crackle', { t, dest: crackleBus, send: null, vol: R.range(0.3, 0.8) });
    if (v) (V.children || (V.children = [])).push(v);
    if (V.children && V.children.length > 6) V.children = V.children.filter((c) => { if (eng.now > c.end + 0.1) { c.dispose(); return false; } return true; });
    return t + R.range(1.5, 6);
  }, V);

  // program buses
  const talk = V.gain(0); talk.connect(spk);
  const music = V.gain(0); music.connect(spk);
  formantVoice(V, eng, { f0: 108, scale: 0.97, rate: 4.8, talk: 0.94, breath: 0.12, lp: 2600, level: 0.85, inton: 0.13, seed: 71, dest: talk });
  formantVoice(V, eng, { f0: 196, scale: 1.14, rate: 4.2, talk: 0.9, breath: 0.15, lp: 2600, level: 0.5, inton: 0.12, seed: 72, dest: talk }); // the co-host, now and then
  musicBed(V, eng, R, music);

  // schedule: talk 7–15 s, music 10–22 s, sometimes the DJ talks over the intro
  let mode = R.chance(0.5) ? 'talk' : 'music';
  eng.addTask(V.t0, (t) => {
    if (V.disposed || V.stopping) return null;
    const xf = 0.6;
    if (mode === 'talk') {
      talk.gain.setTargetAtTime(1, t, xf / 3);
      music.gain.setTargetAtTime(R.chance(0.3) ? 0.25 : 0, t, xf / 3);
      mode = 'music';
      return t + R.range(7, 15);
    }
    music.gain.setTargetAtTime(0.9, t, xf / 3);
    talk.gain.setTargetAtTime(0, t + R.range(0, 1.2), xf / 3);
    mode = 'talk';
    return t + R.range(10, 22);
  }, V);
}

/** No tune: pad triads per bar, a bass pulse on the beat, an off-beat hat (all through the AM band). */
function musicBed(V, eng, R, dest) {
  const bpm = R.range(84, 96), beat = 60 / bpm, bar = beat * 4;
  const pad = V.gain(0.22); const padLp = V.filter('lowpass', 1800, 0.7); V.chain(pad, padLp, dest);
  const voices = CHORDS[0].map((m, i) => {
    const osc = V.osc(i === 0 ? 'triangle' : 'sawtooth', mtof(m), R.range(-8, 8));
    const g = V.gain(i === 0 ? 0.5 : 0.18);
    osc.connect(g); g.connect(pad);
    V.play(osc, 0, null);
    return osc;
  });
  const bassOsc = V.osc('triangle', mtof(ROOTS[0] + 12));
  const bass = V.gain(0); bassOsc.connect(bass); bass.connect(dest);
  V.play(bassOsc, 0, null);
  const hatSrc = V.noise('white');
  const hatBp = V.filter('bandpass', 2300, 1.6);
  const hat = V.gain(0); V.chain(hatSrc, hatBp, hat, dest);
  V.play(hatSrc, 0, null);
  let n = 0;
  eng.addTask(V.t0 + 0.05, (t) => {
    if (V.disposed || V.stopping) return null;
    const c = Math.floor(n / 4) % CHORDS.length;
    const b = n % 4;
    if (b === 0) {
      CHORDS[c].forEach((m, i) => voices[i].frequency.setTargetAtTime(V.hz(mtof(m)), t, 0.02));
      bassOsc.frequency.setTargetAtTime(V.hz(mtof(ROOTS[c] + 12)), t, 0.01);
      pad.gain.setTargetAtTime(0.26, t, 0.05);
      pad.gain.setTargetAtTime(0.16, t + bar * 0.5, 0.6);
    }
    // bass pulse on each beat, hat on the off-beat
    bass.gain.setTargetAtTime(b === 0 ? 0.55 : 0.4, t, 0.008);
    bass.gain.setTargetAtTime(0, t + beat * 0.35, 0.06);
    hat.gain.setTargetAtTime(0.09, t + beat * 0.5, 0.002);
    hat.gain.setTargetAtTime(0, t + beat * 0.5 + 0.02, 0.012);
    n++;
    return t + beat;
  }, V);
}

export const RADIO_SFX = {
  /** The radio knob turned off: a plastic detent click, a speaker pop, the station gone. */
  radio_off: { peak: -14, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(0.3);
    // a last scrap of station (band-limited hiss) cut dead at the click
    burst(o, sr, 0, { dur: 0.05, R, gain: 0.25, env: envPts([[0, 0.6], [0.045, 0.6], [0.05, 0]]), filters: [['bp', 1400, 0.8]] });
    clink(o, sr, 0.045, { f: R.range(2300, 2600), amp: 0.6, t60: 0.012, R });
    knock(o, sr, 0.045, { f: 640, amp: 0.55, t60: 0.025, click: 0.6, R });
    thump(o, sr, 0.05, { f: 70, to: 40, t60: 0.08, amp: 0.45, noise: 0.2, lp: 400, R }); // the speaker cone
    return filt(o, new BQ(sr, 'hp', 40, 0.7));
  } },
};
