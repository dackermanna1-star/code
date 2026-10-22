// Weather and time of day. Drives visibility for spotting, wind for smoke and
// parachutes, and is read by the renderer (sky, fog, rain, lightning) and the
// audio system (wind/rain beds, thunder).

import { rng } from '../core/rng.js';
import { clamp, lerp } from '../core/math.js';

export const WEATHER_PRESETS = {
  clear: { cloud: 0.12, rain: 0, fog: 0.05, wind: 0.25 },
  overcast: { cloud: 0.8, rain: 0, fog: 0.18, wind: 0.4 },
  rain: { cloud: 0.92, rain: 0.65, fog: 0.3, wind: 0.55 },
  storm: { cloud: 1, rain: 1, fog: 0.35, wind: 0.9, lightning: true },
  fog: { cloud: 0.55, rain: 0, fog: 1, wind: 0.08 },
};

export const TIME_PRESETS = { dawn: 6.1, morning: 9, noon: 13, afternoon: 16.2, dusk: 19.1, night: 23.3 };

export class Weather {
  constructor({ condition = 'clear', time = 'morning', dynamic = true, timeFlow = 1 } = {}) {
    this.dynamic = dynamic;
    this.condition = condition in WEATHER_PRESETS ? condition : 'clear';
    const p = WEATHER_PRESETS[this.condition];
    this.cloud = p.cloud;
    this.rain = p.rain;
    this.fog = p.fog;
    this.windSpeed = 2 + p.wind * 12;
    this.windDir = rng.range(0, Math.PI * 2);
    this.lightning = !!p.lightning;
    this.target = { ...p };
    this.hour = typeof time === 'number' ? time : TIME_PRESETS[time] ?? 9;
    this.timeFlow = timeFlow; // seconds of day-night cycle per simulated second
    this.nextChange = rng.range(240, 420);
    this.lightningTimer = rng.range(6, 20);
    this.flash = 0; // lightning flash intensity for the renderer
    this.strike = null; // last lightning strike {x, z, t}
    this.windX = 0;
    this.windZ = 0;
    this.gust = 0;
    this.updateWind(0);
  }

  setCondition(c, instant = false) {
    if (!(c in WEATHER_PRESETS)) return;
    this.condition = c;
    this.target = { ...WEATHER_PRESETS[c] };
    this.lightning = !!this.target.lightning;
    if (instant) {
      this.cloud = this.target.cloud;
      this.rain = this.target.rain;
      this.fog = this.target.fog;
      this.windSpeed = 2 + this.target.wind * 12;
    }
  }

  updateWind(dt) {
    this.gust += dt;
    const g = 1 + 0.25 * Math.sin(this.gust * 0.7) + 0.12 * Math.sin(this.gust * 2.3);
    this.windX = Math.sin(this.windDir) * this.windSpeed * g;
    this.windZ = Math.cos(this.windDir) * this.windSpeed * g;
  }

  update(dt) {
    this.hour = (this.hour + (dt * this.timeFlow) / 3600) % 24;
    const k = Math.min(1, dt * 0.01);
    this.cloud = lerp(this.cloud, this.target.cloud, k);
    this.rain = lerp(this.rain, this.target.rain, k * 1.4);
    this.fog = lerp(this.fog, this.target.fog, k);
    this.windSpeed = lerp(this.windSpeed, 2 + this.target.wind * 12, k);
    this.windDir += dt * 0.004;
    this.updateWind(dt);
    if (this.dynamic) {
      this.nextChange -= dt;
      if (this.nextChange <= 0) {
        this.nextChange = rng.range(240, 480);
        const order = ['clear', 'overcast', 'rain', 'storm', 'fog'];
        const i = order.indexOf(this.condition);
        const next = rng.weighted([
          [order[clamp(i + 1, 0, 3)], 3],
          [order[clamp(i - 1, 0, 3)], 3],
          ['fog', this.isNight ? 1.5 : 0.6],
          ['clear', 1],
        ]);
        this.setCondition(next);
      }
    }
    this.flash = Math.max(0, this.flash - dt * 6);
    if (this.lightning && this.rain > 0.5) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = rng.range(5, 18);
        this.flash = 1;
        this.strike = { x: rng.range(-1400, 1400), z: rng.range(-1400, 1400), t: 0 };
      }
    }
  }

  // Sun elevation in radians: sunrise 06:06, sunset 19:36.
  get sunElevation() {
    const rise = 6.1;
    const set = 19.6;
    const dayLen = set - rise;
    const h = this.hour;
    if (h >= rise && h <= set) return Math.sin(((h - rise) / dayLen) * Math.PI) * 1.05;
    const since = h > set ? h - set : h + 24 - set;
    return -Math.sin((since / (24 - dayLen)) * Math.PI) * 0.9;
  }

  // Sun bearing as a yaw (atan2(x, z)): east (+X) at dawn, south (+Z) at noon, west at dusk.
  get sunAzimuth() {
    return ((12 - this.hour) / 12) * Math.PI;
  }

  // 0 (deep night) .. 1 (full day).
  get daylight() {
    return clamp((this.sunElevation + 0.1) / 0.35, 0, 1);
  }

  get isNight() {
    return this.daylight < 0.25;
  }

  // Maximum visual spotting distance in metres for the naked eye.
  get visibility() {
    const fogVis = lerp(4000, 280, Math.pow(this.fog, 0.8));
    const rainVis = lerp(1, 0.55, this.rain);
    const light = lerp(0.3, 1, this.daylight);
    return fogVis * rainVis * light;
  }

  // Thermal sights see through darkness and most rain, less through fog.
  get thermalVisibility() {
    return lerp(4500, 900, this.fog) * lerp(1, 0.8, this.rain);
  }
}
