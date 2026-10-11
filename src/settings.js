// Client settings ("config.cfg"), persisted per browser.

const DEFAULTS = {
  name: 'Player',
  sensitivity: 2.5,
  invertY: false,
  volume: 0.8,
  mode: 'native', // native | 640x480 | 800x600 | 1024x768 | 1280x960
  aspect: 'fill', // fill (Hor+) | 4:3
  fov: 90,
  cl_showfps: 1,
  net_graph: 0,
  crosshairColor: [50, 250, 50],
  crosshairSize: 'auto',
  cl_dynamiccrosshair: 1,
  hud_fastswitch: 1,
  announcer: 1,
  newgame: { perTeam: 5, difficulty: 'normal', roundTime: 2.5, freezeTime: 6, c4Timer: 45, startMoney: 800, buyTime: 1.5 },
};

const KEY = 'cs16-dust2-config';

export class Settings {
  constructor() {
    this.v = structuredClone(DEFAULTS);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        for (const k of Object.keys(DEFAULTS)) {
          if (k in saved) this.v[k] = typeof DEFAULTS[k] === 'object' && !Array.isArray(DEFAULTS[k]) ? { ...DEFAULTS[k], ...saved[k] } : saved[k];
        }
      }
    } catch { /* storage unavailable */ }
  }

  get(k) { return this.v[k]; }

  set(k, val) {
    this.v[k] = val;
    try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch { /* ignore */ }
  }

  all() { return structuredClone(this.v); }

  video() { return { mode: this.v.mode, aspect: this.v.aspect, fov: this.v.fov }; }
}
