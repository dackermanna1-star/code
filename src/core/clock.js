// In-game clock: 1 real second = 1 game minute at 1x speed.
import { G } from '../game.js';
import { clamp, smoothstep } from './utils.js';

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_LABEL = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };

export class Clock {
  constructor() {
    this.speedMult = 1; // temporary multiplier (sleeping fast-forward)
    this._lastHour = null;
    this._lastDay = null;
  }

  get total() { return G.state.time; }
  get day() { return Math.floor(G.state.time / 1440) + 1; }
  get minuteOfDay() { return ((G.state.time % 1440) + 1440) % 1440; }
  get hour() { return this.minuteOfDay / 60; }
  get dayName() { return DAY_NAMES[(this.day - 1) % 7]; }
  get seasonIndex() {
    const start = G.state.flags.startSeason ?? seasonFromDate(new Date(G.state.createdAt));
    return (start + Math.floor((this.day - 1) / 7)) % 4;
  }
  get season() { return SEASONS[this.seasonIndex]; }
  get dayOfSeason() { return ((this.day - 1) % 7) + 1; }

  update(dt) {
    const scale = (G.state.settings.timeScale || 1) * this.speedMult;
    G.state.time += dt * scale;
    const h = Math.floor(this.hour);
    if (this._lastHour !== null && h !== this._lastHour) G.events.emit('hour', h);
    this._lastHour = h;
    const d = this.day;
    if (this._lastDay !== null && d !== this._lastDay) G.events.emit('newDay', d);
    this._lastDay = d;
  }

  // Sun position & daylight factor
  sun() {
    const h = this.hour;
    // sunrise ~6:00, sunset ~19:30
    const rise = 6, set = 19.5;
    const t = (h - rise) / (set - rise); // 0..1 during the day
    const elevation = Math.sin(clamp(t, -0.2, 1.2) * Math.PI) * 0.95; // radians-ish (max ~54°)
    const azimuth = Math.PI * (0.15 + t * 0.7); // from east (+x) over north (-z) to west (-x)
    const daylight = smoothstep(-0.12, 0.25, elevation);
    const golden = clamp(1 - Math.abs(elevation - 0.08) / 0.25, 0, 1) * daylight;
    return { t, elevation, azimuth, daylight, golden, night: 1 - smoothstep(-0.2, 0.05, elevation) };
  }

  fmt(total = this.total, withAmPm = true) {
    const m = ((Math.floor(total) % 1440) + 1440) % 1440;
    let hh = Math.floor(m / 60); const mm = m % 60;
    const ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12; if (hh === 0) hh = 12;
    return `${hh}:${String(mm).padStart(2, '0')}${withAmPm ? ' ' + ampm : ''}`;
  }

  fmtDuration(minutes) {
    minutes = Math.max(0, Math.round(minutes));
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  isNight() { const h = this.hour; return h < 6 || h >= 20; }
  partOfDay() {
    const h = this.hour;
    if (h < 5) return 'night';
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    if (h < 21) return 'evening';
    return 'night';
  }
}

export function seasonFromDate(d) {
  const m = d.getMonth();
  if (m >= 2 && m <= 4) return 0;
  if (m >= 5 && m <= 7) return 1;
  if (m >= 8 && m <= 10) return 2;
  return 3;
}
