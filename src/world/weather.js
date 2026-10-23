import { U } from '../engine/uniforms.js';
import { gnoise } from './heightfield.js';

// Weather states and the transitions between them. "Auto" wanders between states on a
// time scale of minutes; storms build up and die down gradually.

export const WEATHER = {
  clear: { label: 'Clear', wind: 2.6, gust: 0.25, dust: 0.22, cloud: 0.22, storm: 0, particles: 0.12 },
  breezy: { label: 'Breezy', wind: 6.5, gust: 0.45, dust: 0.3, cloud: 0.4, storm: 0, particles: 0.45 },
  windy: { label: 'Windy', wind: 11.5, gust: 0.65, dust: 0.5, cloud: 0.25, storm: 0.06, particles: 0.85 },
  sandstorm: { label: 'Sandstorm', wind: 17, gust: 0.85, dust: 0.92, cloud: 0.05, storm: 1, particles: 1 },
};

// Auto mode: next-state weights and how long each state lasts (seconds, game time).
const TRANSITIONS = {
  clear: { next: { breezy: 0.7, windy: 0.25, sandstorm: 0.05 }, duration: [240, 480] },
  breezy: { next: { clear: 0.55, windy: 0.4, sandstorm: 0.05 }, duration: [180, 360] },
  windy: { next: { breezy: 0.55, clear: 0.2, sandstorm: 0.25 }, duration: [120, 260] },
  sandstorm: { next: { windy: 0.8, breezy: 0.2 }, duration: [90, 200] },
};

const KEYS = ['wind', 'gust', 'dust', 'cloud', 'storm', 'particles'];
const PREVAILING_BEARING = 225; // the wind blows toward the south-west

export class Weather {
  constructor() {
    this.mode = 'auto';
    this.state = 'clear';
    this.current = { ...WEATHER.clear };
    this.target = WEATHER.clear;
    this.timer = 200;
    this.time = 0;
    this.gust = 0;
    this.windSpeed = this.current.wind;
    this.bearing = PREVAILING_BEARING;
  }

  /** mode: 'auto' or a key of WEATHER. instant skips the transition (for tests). */
  setMode(mode, instant = false) {
    this.mode = mode;
    if (mode !== 'auto') this._enter(mode);
    else this.timer = 60;
    if (instant) Object.assign(this.current, this.target);
  }

  _enter(state) {
    this.state = state;
    this.target = WEATHER[state];
    const [a, b] = TRANSITIONS[state].duration;
    this.timer = a + Math.random() * (b - a);
  }

  _pickNext() {
    const next = TRANSITIONS[this.state].next;
    let r = Math.random();
    for (const [k, w] of Object.entries(next)) {
      r -= w;
      if (r <= 0) return k;
    }
    return 'clear';
  }

  get label() {
    return WEATHER[this.state].label;
  }

  update(dt, { sunElevation = 0.5, timeOfDay = 12 } = {}) {
    this.time += dt;
    if (this.mode === 'auto') {
      this.timer -= dt;
      if (this.timer <= 0) this._enter(this._pickNext());
    }
    // Storms take about a minute to build; calmer changes take ~30 s.
    const tau = this.target.storm > this.current.storm ? 45 : 28;
    const k = 1 - Math.exp(-dt / tau);
    for (const key of KEYS) this.current[key] += (this.target[key] - this.current[key]) * k;

    const t = this.time;
    // Gusts: layered noise, stronger and more frequent as gustiness rises.
    const g = 0.5 + 0.5 * (gnoise(t * 0.21, 3.7) * 1.3 + gnoise(t * 0.83, 9.1) * 0.6);
    this.gust = Math.min(1, Math.max(0, g)) * this.current.gust;
    this.windSpeed = this.current.wind * (0.72 + 0.62 * this.gust);
    // Direction drifts slowly around the prevailing north-easterly.
    this.bearing = PREVAILING_BEARING + gnoise(t * 0.004, 1.3) * 50 + gnoise(t * 0.05, 7.7) * 8;
    const br = (this.bearing * Math.PI) / 180;
    const wx = Math.sin(br);
    const wz = -Math.cos(br);
    U.uWindDir.value.set(wx, wz);
    U.uWindSpeed.value = this.windSpeed;
    U.uGust.value = this.gust;
    U.uDust.value = this.current.dust;
    U.uStorm.value = this.current.storm;
    U.uCloud.value = this.current.cloud;
    U.uWindOffset.value.x += wx * this.windSpeed * dt;
    U.uWindOffset.value.y += wz * this.windSpeed * dt;

    // Heat shimmer: strong sun on hot sand, peaking in the early afternoon.
    const afternoon = Math.max(0, 1 - Math.abs(timeOfDay - 14) / 6);
    const sunUp = Math.min(1, Math.max(0, (sunElevation - 0.12) / 0.45));
    U.uHeat.value = sunUp * (0.35 + 0.65 * afternoon) * (1 - this.current.storm) * (1 - 0.5 * Math.min(1, this.current.wind / 14));
  }

  /** 16-point compass name of the direction the wind comes from. */
  fromCompass() {
    const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const from = (this.bearing + 180) % 360;
    return names[Math.round(from / 22.5) % 16];
  }
}
