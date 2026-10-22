// Weather and nature beds: gusting wind (body + howl from one noise loop), rain
// (light/heavy crossfade), birds on calm days, crickets at night and thunder.
import { Rng, clamp, lerp, smoothstep } from './dsp.js';
import { MAX_DELAY, SPEED_OF_SOUND, airCutoff } from './spatial.js';

function loopSource(ctx, entry, dest, rng) {
  const src = new AudioBufferSourceNode(ctx, { buffer: entry.buffer, loop: true });
  src.connect(dest);
  src.start(ctx.currentTime, rng.range(0, entry.duration));
  return src;
}

export class Ambience {
  constructor(ctx, mixer, bank) {
    this.ctx = ctx;
    this.bank = bank;
    this.mixer = mixer;
    this.rng = new Rng(0xa3b);
    const out = mixer.amb;
    const g = () => new GainNode(ctx, { gain: 0 });
    this.windBodyFilter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 500, Q: -3 });
    this.windHowlFilter = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 700, Q: 4 });
    this.windBody = g();
    this.windHowl = g();
    this.windBodyFilter.connect(this.windBody).connect(out);
    this.windHowlFilter.connect(this.windHowl).connect(out);
    const windIn = new GainNode(ctx, { gain: 1 });
    windIn.connect(this.windBodyFilter);
    windIn.connect(this.windHowlFilter);
    this.rainLight = g();
    this.rainHeavy = g();
    this.crickets = g();
    this.rainLight.connect(out);
    this.rainHeavy.connect(out);
    this.crickets.connect(out);
    this.sources = [
      loopSource(ctx, bank.get('amb:wind').near[0], windIn, this.rng),
      loopSource(ctx, bank.get('amb:rain_light').near[0], this.rainLight, this.rng),
      loopSource(ctx, bank.get('amb:rain_heavy').near[0], this.rainHeavy, this.rng),
      loopSource(ctx, bank.get('amb:crickets').near[0], this.crickets, this.rng),
    ];
    this.gust = 1;
    this.gustTarget = 1;
    this.nextGust = 0;
    this.nextBird = 2;
    this.nextStormRumble = 20;
    this.out = out;
  }

  update(dt, sim, env) {
    const now = this.ctx.currentTime;
    const rng = this.rng;
    const storm = env.thunderstorm ? 1 : 0;
    const near = clamp(env.nearIntensity ?? 0, 0, 1);
    const mask = 1 - 0.3 * near;
    // Gusts: a target that jumps every few seconds, approached smoothly.
    this.nextGust -= dt;
    if (this.nextGust <= 0) {
      this.gustTarget = clamp(1 + 0.45 * rng.bi() + (rng.chance(0.15) ? 0.8 : 0), 0.35, 2.2);
      this.nextGust = rng.range(1.5, 5);
    }
    this.gust += (this.gustTarget - this.gust) * (1 - Math.exp(-dt / 1.2));
    this.scheduleEvents(dt, sim, env, near);
    // Bed levels move slowly: refresh their targets ~10 times a second.
    this.paramTimer = (this.paramTimer ?? 0) - dt;
    if (this.paramTimer > 0) return;
    this.paramTimer = 0.1;
    const w = clamp((env.wind ?? 0) + 0.3 * storm, 0, 1.2);
    const gust = this.gust;
    const set = (param, v, tau = 0.25) => param.setTargetAtTime(v, now, tau);
    set(this.windBody.gain, 0.22 * w * (0.55 + 0.45 * gust) * mask);
    set(this.windBodyFilter.frequency, 250 + 800 * w * gust);
    set(this.windHowl.gain, 0.09 * Math.pow(w, 1.5) * gust * gust * mask);
    set(this.windHowlFilter.frequency, 450 + 550 * gust * (0.5 + w));
    const rain = clamp((env.rain ?? 0) + 0.25 * storm, 0, 1);
    const heavy = smoothstep(0.35, 1, rain);
    set(this.rainLight.gain, 0.22 * smoothstep(0, 0.4, rain) * (1 - 0.6 * heavy) * mask, 0.6);
    set(this.rainHeavy.gain, 0.3 * heavy * mask, 0.6);
    const battle = clamp(env.battleIntensity ?? 0, 0, 1);
    const crickets = env.night ? 0.05 * clamp(1 - battle / 0.15, 0, 1) * (1 - rain) : 0;
    set(this.crickets.gain, crickets, 1.5);
  }

  scheduleEvents(dt, sim, env, near) {
    const rng = this.rng;
    const battle = clamp(env.battleIntensity ?? 0, 0, 1);
    const rain = clamp((env.rain ?? 0) + (env.thunderstorm ? 0.25 : 0), 0, 1);
    // Birds only on a quiet day.
    this.nextBird -= dt;
    if (this.nextBird <= 0) {
      if (!env.night && battle < 0.08 && near < 0.05 && rain < 0.5) this.bird();
      this.nextBird = rng.range(2, 9);
    }
    if (env.thunderstorm && sim.timeScale > 0) {
      this.nextStormRumble -= dt;
      if (this.nextStormRumble <= 0) {
        this.thunder(rng.range(3000, 9000), sim);
        this.nextStormRumble = rng.range(25, 70);
      }
    }
  }

  bird() {
    const entry = this.bank.pick('amb:bird');
    if (!entry) return;
    const ctx = this.ctx;
    const src = new AudioBufferSourceNode(ctx, { buffer: entry.buffer, playbackRate: this.rng.range(0.92, 1.08) });
    const gain = new GainNode(ctx, { gain: this.rng.range(0.02, 0.09) });
    const pan = new StereoPannerNode(ctx, { pan: 0.9 * this.rng.bi() });
    src.connect(gain).connect(pan).connect(this.out);
    gain.connect(this.mixer.reverbIn);
    src.start(ctx.currentTime + 0.05);
    src.onended = () => pan.disconnect();
  }

  // Lightning `distance` m away: crack-and-boom if close, a long low roll if far.
  thunder(distance, sim) {
    const ctx = this.ctx;
    const d = Math.max(30, distance || 0);
    const scale = Math.max(sim.timeScale, 0.05);
    const when = ctx.currentTime + Math.min(d / SPEED_OF_SOUND / scale, MAX_DELAY);
    const near = d < 1200;
    const entry = this.bank.pick(near ? 'amb:thunder_near' : 'amb:thunder_far');
    if (!entry) return;
    const rate = (near ? 1 : 0.9) * this.rng.range(0.92, 1.06) * sim.pitch;
    const src = new AudioBufferSourceNode(ctx, { buffer: entry.buffer, playbackRate: rate });
    const filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: clamp(airCutoff(d) * 1.5, 250, 16000), Q: -3 });
    const level = 0.9 * Math.pow(clamp(300 / d, 0, 1), 0.65);
    const gain = new GainNode(ctx, { gain: level });
    const pan = new StereoPannerNode(ctx, { pan: 0.5 * this.rng.bi() });
    const send = new GainNode(ctx, { gain: lerp(0.3, 0.8, clamp(d / 5000, 0, 1)) });
    src.connect(filter).connect(gain).connect(pan).connect(this.out);
    gain.connect(send).connect(this.mixer.reverbIn);
    src.start(when);
    src.onended = () => {
      pan.disconnect();
      send.disconnect();
    };
    if (d < 400) this.mixer.duck(0.6 * (1 - d / 400), when);
  }

  dispose() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // not started
      }
    }
  }
}
