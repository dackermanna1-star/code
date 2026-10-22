// Offline scene renderer: drives a real AudioSystem inside an OfflineAudioContext
// at 60 simulated frames per second (suspend/resume), then analyses the output.
// Used by the audio lab and by scripts/audio-check.mjs.
import { AudioSystem } from '/src/audio/AudioSystem.js';
import { Rng } from '/src/audio/dsp.js';
import { bandRatio, centroid, envelope, envelopePeriodicity, levels, peakFreq, spectrum } from './audio-analysis.js';

const FPS = 60;
const DEFAULT_LISTENER = {
  position: { x: 0, y: 1.7, z: 0 },
  forward: { x: 0, y: 0, z: -1 },
  up: { x: 0, y: 1, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
};
// nearIntensity just above the birdsong threshold keeps birds out of measurements.
const QUIET = { wind: 0, rain: 0, thunderstorm: false, battleIntensity: 0, nearIntensity: 0.06, night: false };

// Point `d` metres away at azimuth `az` degrees (0 = straight ahead, 90 = right).
export const at = (d, az = 0, y = 0) => {
  const a = (az * Math.PI) / 180;
  return { x: d * Math.sin(a), y, z: -d * Math.cos(a) };
};

const STRESS_MIX = [
  ['rifle', 26], ['rifle_ak', 18], ['lmg', 8], ['gpmg', 7], ['hmg', 4], ['sniper', 1], ['pistol', 1], ['smg', 2],
  ['autocannon', 5], ['aa_gun', 1], ['heli_gun', 1], ['tank_cannon', 2], ['mortar', 1], ['howitzer', 0.5],
  ['rpg_launch', 1], ['atgm_launch', 0.5], ['grenade_launch', 1], ['mlrs_launch', 0.3], ['rocket_pod', 0.4],
  ['explosion_small', 4], ['explosion_medium', 3], ['explosion_large', 1.2], ['explosion_huge', 0.5], ['explosion_air', 0.2],
  ['impact_dirt', 4], ['impact_metal', 1.5], ['impact_concrete', 2], ['impact_wood', 1], ['ricochet', 1.5],
  ['incoming_shell', 0.3], ['debris', 0.6], ['shell_casings', 0.6], ['vehicle_destroyed', 0.2], ['smoke_launch', 0.2],
];
const STRESS_TOTAL = STRESS_MIX.reduce((s, [, w]) => s + w, 0);

export function pickStressName(rng) {
  let r = rng.next() * STRESS_TOTAL;
  for (const [name, w] of STRESS_MIX) {
    r -= w;
    if (r <= 0) return name;
  }
  return 'rifle';
}

// One frame of the 300 events/s battle stress used by the lab and the checks.
export function stressFrame(audio, rng, dt, rate, state, area = 2000) {
  state.acc = (state.acc ?? 0) + rate * dt;
  while (state.acc >= 1) {
    state.acc -= 1;
    const name = pickStressName(rng);
    const close = rng.chance(0.08);
    const pos = close ? at(rng.range(8, 120), rng.range(-180, 180)) : { x: rng.range(-area / 2, area / 2), y: 0, z: rng.range(-area / 2, area / 2) };
    audio.play(name, pos, { volume: rng.range(0.8, 1) });
    if (rng.chance(0.02)) {
      const p = at(rng.range(1, 15), rng.range(-180, 180), rng.range(0, 4));
      audio.flyby(rng.pick(['bullet', 'bullet', 'bullet', 'heavy', 'shell', 'rocket']), p, rng.range(250, 900));
    }
    if (rng.chance(0.006)) audio.radio('Contact front, engaging', rng.int(2), { priority: rng.int(3) });
  }
}

export function stressLoops(t, count = 12) {
  const kinds = ['tank', 'tank', 'ifv', 'apc', 'truck', 'heli', 'jet', 'drone', 'uav', 'fire', 'plane', 'spaag_radar'];
  const out = [];
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length];
    const r = 30 + i * 45;
    const w = (0.05 + 0.02 * (i % 3)) * (i % 2 ? 1 : -1);
    const a = t * w + i;
    const air = kind === 'heli' || kind === 'jet' || kind === 'plane' || kind === 'uav' || kind === 'drone';
    const speed = kind === 'jet' ? 12 : 1;
    out.push({
      id: `${kind}-${i}`,
      kind,
      position: { x: r * Math.cos(a * speed), y: air ? 60 + i * 10 : 0, z: r * Math.sin(a * speed) },
      velocity: { x: -r * w * speed * Math.sin(a * speed), y: 0, z: r * w * speed * Math.cos(a * speed) },
      intensity: 0.5 + 0.5 * Math.sin(t + i),
    });
  }
  return out;
}

const db = (v) => 20 * Math.log10(Math.max(v, 1e-9));

function mixDown(buffer) {
  const l = buffer.getChannelData(0);
  const r = buffer.getChannelData(1);
  const m = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) m[i] = 0.5 * (l[i] + r[i]);
  return { l, r, m };
}

function windowPeak(x, sr, t0, t1) {
  let p = 0;
  const a = Math.max(0, Math.round(t0 * sr));
  const b = Math.min(x.length, Math.round(t1 * sr));
  for (let i = a; i < b; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
}

function windowRms(x, sr, t0, t1) {
  let s = 0;
  const a = Math.max(0, Math.round(t0 * sr));
  const b = Math.min(x.length, Math.round(t1 * sr));
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
}

// First sharp onset in [t0, t1): a 5 ms window 12 dB above the median of the
// preceding 100 ms (robust against decaying tails and echoes of earlier shots).
function onsetAfter(x, sr, t0, t1) {
  const env = envelope(x, sr, 0.005);
  const end = Math.min(env.length, Math.floor(t1 / 0.005));
  for (let i = Math.max(20, Math.floor(t0 / 0.005)); i < end; i++) {
    const prev = Array.from(env.subarray(i - 20, i)).sort((a, b) => a - b);
    if (env[i] > prev[10] * 4 && env[i] > 2e-4) return i * 0.005;
  }
  return -1;
}

export const SCENES = {
  // Speed of sound and distance: rifles at 34, 343 and 1029 m straight ahead.
  distance: {
    duration: 8,
    events: [[0.2, 'rifle', 34.3], [1.2, 'rifle', 343], [3.5, 'rifle', 1029]],
    frame(audio, t, f) {
      for (const [te, name, d] of this.events) if (f === Math.round(te * FPS)) audio.play(name, at(d, 0));
    },
    analyze({ m }, sr) {
      return this.events.map(([te, name, d]) => {
        const onset = onsetAfter(m, sr, te, te + 4.5);
        const spec = spectrum(m, sr, { from: Math.round(Math.max(0, onset) * sr), len: Math.round(0.08 * sr) });
        return {
          name, distance: d, expectedDelay: d / 343, delay: onset - te,
          peakDb: db(windowPeak(m, sr, onset, onset + 0.15)), centroid: centroid(spec),
        };
      });
    },
  },
  // Close huge blast in the middle of steady rifle fire: limiter, duck, ear ringing.
  blast: {
    duration: 5,
    setup() {
      this.duck = [];
    },
    frame(audio, t, f) {
      if (f % 9 === 0) audio.play('rifle', at(60, -40));
      if (f === 60) audio.play('explosion_huge', at(25, 20));
      this.duck.push([t, audio.mixer.duckGain.gain.value, audio.mixer.muffle.frequency.value]);
    },
    analyze({ l, r, m }, sr) {
      const after = this.duck.filter(([t]) => t > 1.05 && t < 2.5);
      const late = this.duck.filter(([t]) => t > 4.4);
      return {
        peak: Math.max(levels(l).peak, levels(r).peak),
        bad: levels(l).bad + levels(r).bad,
        rifleDb: db(windowPeak(m, sr, 0.2, 0.95)),
        blastPeakDb: db(windowPeak(m, sr, 1.05, 1.4)),
        duckMinDb: db(Math.min(...after.map(([, g]) => g))),
        muffleMinHz: Math.min(...after.map(([, , f]) => f)),
        duckEndDb: db(Math.min(...late.map(([, g]) => g))),
      };
    },
  },
  // Lone close blast: spectral line of the ringing tone after the bang.
  ringing: {
    duration: 3.5,
    frame(audio, t, f) {
      if (f === 6) audio.play('explosion_huge', at(15, 0));
    },
    analyze({ m }, sr) {
      const spec = spectrum(m, sr, { from: Math.round(1.6 * sr), len: Math.round(0.8 * sr), size: 8192 });
      const f = peakFreq(spec, 3300, 4700);
      const k = Math.round(f / spec.binHz);
      const neighbours = [];
      for (let j = k - 60; j <= k + 60; j++) if (Math.abs(j - k) > 6 && j > 0) neighbours.push(spec.power[j]);
      neighbours.sort((a, b) => a - b);
      const prominence = 10 * Math.log10(spec.power[k] / Math.max(neighbours[neighbours.length >> 1], 1e-30));
      return { toneHz: f, prominenceDb: prominence };
    },
  },
  // Jet loop passing overhead at 250 m/s: doppler and retarded loudness peak.
  jetpass: {
    duration: 12,
    frame(audio, t) {
      const x = -1500 + 250 * t;
      audio.setLoops([{ id: 'jet', kind: 'jet', position: { x, y: 150, z: 0 }, velocity: { x: 250, y: 0, z: 0 }, intensity: 0.8 }]);
    },
    analyze({ m }, sr) {
      const spec = (t0) => spectrum(m, sr, { from: Math.round(t0 * sr), len: Math.round(1.5 * sr) });
      const env = envelope(m, sr, 0.1);
      let best = 0;
      let bestI = 0;
      env.forEach((v, i) => {
        if (v > best) {
          best = v;
          bestI = i;
        }
      });
      return {
        centroidApproach: centroid(spec(2.5)),
        centroidRecede: centroid(spec(8.5)),
        loudestAt: bestI * 0.1 + 0.05,
        visualPassAt: 6,
      };
    },
  },
  // FPV drone passing 20 m in front at 40 m/s: pitch before vs after the pass.
  doppler: {
    duration: 10,
    frame(audio, t) {
      const x = -200 + 40 * t;
      audio.setLoops([{ id: 'fpv', kind: 'drone', position: { x, y: 10, z: -20 }, velocity: { x: 40, y: 0, z: 0 }, intensity: 0.5 }]);
    },
    analyze({ m }, sr) {
      const pitch = (t0) => peakFreq(spectrum(m, sr, { from: Math.round(t0 * sr), len: Math.round(1.5 * sr), size: 8192 }), 150, 450);
      const approach = pitch(1.5);
      const recede = pitch(7.0);
      return { approachHz: approach, recedeHz: recede, ratio: approach / recede, expected: (343 + 40 * 0.95) / (343 - 40 * 0.95) };
    },
  },
  // The rotary cannon burst should last opts.duration and buzz at its firing rate.
  jetgun: {
    duration: 4,
    frame(audio, t, f) {
      if (f === 6) audio.play('jet_gun', at(80, 0), { duration: 1.5 });
    },
    analyze({ m }, sr) {
      const env = envelope(m, sr, 0.02);
      let pk = 0;
      for (const v of env) pk = Math.max(pk, v);
      let first = -1;
      let last = -1;
      env.forEach((v, i) => {
        if (v > pk * 0.25) {
          if (first < 0) first = i;
          last = i;
        }
      });
      const seg = m.subarray(Math.round(0.6 * sr), Math.round(1.4 * sr));
      return { burstSeconds: (last - first) * 0.02, rate: envelopePeriodicity(seg, sr, 40, 140) };
    },
  },
  // 300 events/s over a 2 km square plus a dozen loops: no clipping, NaN or voice overflow.
  stress: {
    duration: 6,
    setup(audio) {
      audio.setEnvironment({ ...QUIET, wind: 0.4, battleIntensity: 0.8, nearIntensity: 0.6 });
      this.rng = new Rng(42);
      this.state = {};
    },
    frame(audio, t) {
      stressFrame(audio, this.rng, 1 / FPS, 300, this.state);
      audio.setLoops(stressLoops(t));
    },
    analyze({ l, r }) {
      const L = levels(l);
      const R = levels(r);
      return { peak: Math.max(L.peak, R.peak), rmsDb: db(Math.max(L.rms, R.rms)), bad: L.bad + R.bad };
    },
  },
  // Weather beds and a near lightning strike.
  weather: {
    duration: 6,
    setup(audio) {
      audio.setEnvironment({ ...QUIET, wind: 0.7, rain: 0.9, thunderstorm: true });
    },
    frame(audio, t, f) {
      if (f === 30) audio.thunder(600);
    },
    analyze({ l, r, m }, sr) {
      return {
        peak: Math.max(levels(l).peak, levels(r).peak),
        bad: levels(l).bad + levels(r).bad,
        bedRmsDb: db(windowRms(m, sr, 0.2, 2.0)),
        thunderRmsDb: db(windowRms(m, sr, 2.4, 4.5)),
      };
    },
  },
  // Radio flood: rate limiting and band-limited chatter.
  radio: {
    duration: 6,
    frame(audio, t, f) {
      if (f % 6 === 0 && f < 120) audio.radio(`Message ${f}`, f % 2, { priority: f % 3 });
    },
    analyze({ m }, sr) {
      const spec = spectrum(m, sr);
      return { band: bandRatio(spec, 250, 3500), rmsDb: db(windowRms(m, sr, 0, 6)) };
    },
  },
};

// Output-level calibration: each case alone in a quiet scene; reports peak / RMS dBFS.
export const CALIBRATION = [
  ['rifle', 10], ['rifle', 100], ['rifle', 400], ['rifle', 1000], ['hmg', 50], ['pistol', 10],
  ['autocannon', 100], ['tank_cannon', 50], ['tank_cannon', 1000], ['howitzer', 3000],
  ['explosion_small', 50], ['explosion_medium', 100], ['explosion_large', 300], ['explosion_huge', 200],
  ['explosion_huge', 3000], ['impact_metal', 10], ['shell_casings', 3], ['incoming_shell', 60],
  ['loop:tank', 30], ['loop:heli', 150], ['loop:jet', 400], ['loop:drone', 10], ['loop:fire', 10],
  ['amb:wind', 0.5], ['amb:rain', 0.7], ['amb:battle', 0.6],
];

export async function renderCalibration(sampleRate) {
  const rows = [];
  for (const [name, arg] of CALIBRATION) {
    const travel = name.startsWith('amb:') || name.startsWith('loop:') ? 0 : Math.min(8, arg / 343);
    const scene = {
      duration: name.startsWith('amb:') || name.startsWith('loop:') ? 3 : 4 + travel,
      setup(audio) {
        if (name === 'amb:wind') audio.setEnvironment({ ...QUIET, wind: arg });
        if (name === 'amb:rain') audio.setEnvironment({ ...QUIET, rain: arg });
        if (name === 'amb:battle') audio.setEnvironment({ ...QUIET, battleIntensity: arg });
      },
      frame(audio, t, f) {
        if (name.startsWith('loop:')) {
          audio.setLoops([{ id: 'x', kind: name.slice(5), position: at(arg, 30, name === 'loop:jet' || name === 'loop:heli' ? 80 : 0), velocity: { x: 0, y: 0, z: 0 }, intensity: 0.7 }]);
        } else if (!name.startsWith('amb:') && f === 6) {
          audio.play(name, at(arg, 30), { duration: name === 'incoming_shell' ? 2 : 0 });
        }
      },
      analyze({ m }, sr) {
        // Loops and beds are measured after their fade-in; one-shots from the start.
        const skip = name.startsWith('amb:') || name.startsWith('loop:') ? 0.5 : 0;
        const lv = levels(m.subarray(Math.round(skip * sr)));
        const env = envelope(m, sr, 0.1);
        let loudest = 0;
        for (const v of env) loudest = Math.max(loudest, v);
        return { peakDb: db(lv.peak), rmsDb: db(lv.rms), loudest100msDb: db(loudest) };
      },
    };
    const res = await renderScene(scene, { sampleRate });
    rows.push({ name, arg, ...res.result });
  }
  return rows;
}

export async function renderScene(sceneOrName, { sampleRate = 44100, voiceCap = 48 } = {}) {
  const scene = typeof sceneOrName === 'string' ? Object.create(SCENES[sceneOrName]) : sceneOrName;
  const sr = sampleRate;
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.round(scene.duration * sr), sampleRate: sr });
  const audio = new AudioSystem({ context: ctx, maxVoices: voiceCap, workers: 0 });
  await audio.start();
  audio.setEnvironment(QUIET);
  if (scene.setup) scene.setup(audio);
  const listener = scene.listener || DEFAULT_LISTENER;
  let maxVoices = 0;
  let maxLoops = 0;
  let updateMs = 0;
  const frames = Math.floor(scene.duration * FPS);
  const step = (f) => {
    const t0 = performance.now();
    scene.frame(audio, f / FPS, f, listener);
    audio.update(1 / FPS, listener);
    updateMs += performance.now() - t0;
    const s = audio.stats();
    maxVoices = Math.max(maxVoices, s.voices);
    maxLoops = Math.max(maxLoops, s.loops);
  };
  for (let f = 1; f < frames; f++) {
    ctx.suspend(f / FPS).then(() => {
      step(f);
      ctx.resume();
    });
  }
  step(0);
  const t0 = performance.now();
  const buffer = await ctx.startRendering();
  const renderMs = performance.now() - t0;
  const stats = audio.stats();
  audio.dispose();
  const ch = mixDown(buffer);
  return {
    result: scene.analyze(ch, sr),
    maxVoices,
    maxLoops,
    renderMs,
    realtimeFactor: (scene.duration * 1000) / renderMs,
    updateMsPerFrame: updateMs / frames,
    stats,
  };
}
