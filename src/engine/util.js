// Core namespace, constants and math helpers.
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const JJK = (root.JJK = root.JJK || {});

  JJK.W = 640; // internal render width
  JJK.H = 360; // internal render height
  JJK.FPS = 60;
  JJK.GROUND_Y = 322; // screen y of the ground at default camera
  JJK.STAGE_HALF = 600; // half stage width (world units)
  JJK.WALL = 584; // fighter x limit
  JJK.DEBUG = false;

  const U = (JJK.U = {});
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  U.sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
  U.deg = Math.PI / 180;
  U.rad = (d) => d * U.deg;
  U.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  U.approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
  U.wrap = (v, n) => ((v % n) + n) % n;
  U.smooth = (t) => t * t * (3 - 2 * t);
  U.pick = (arr, r = Math.random()) => arr[Math.floor(r * arr.length) % arr.length];
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.chance = (p) => Math.random() < p;

  U.ease = {
    linear: (t) => t,
    in: (t) => t * t,
    out: (t) => 1 - (1 - t) * (1 - t),
    inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    in3: (t) => t * t * t,
    out3: (t) => 1 - Math.pow(1 - t, 3),
    out4: (t) => 1 - Math.pow(1 - t, 4),
    snap: (t) => 1 - Math.pow(1 - t, 6),
    outBack: (t) => {
      const c1 = 1.9, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    outElastic: (t) =>
      t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
    hold: (t) => (t < 1 ? 0 : 1),
    step: (t) => (t < 0.5 ? 0 : 1),
  };

  // Seeded RNG for gameplay logic (deterministic simulation / replays).
  U.makeRng = function (seed) {
    let s = seed >>> 0 || 1;
    const f = function () {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.seed = (v) => (s = v >>> 0 || 1);
    return f;
  };
  JJK.rng = U.makeRng(1234567);

  // Colors -------------------------------------------------------------
  U.hex = function (h) {
    if (Array.isArray(h)) return h;
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.pack = (r, g, b, a = 255) =>
    ((a << 24) | (U.clamp(b | 0, 0, 255) << 16) | (U.clamp(g | 0, 0, 255) << 8) | U.clamp(r | 0, 0, 255)) >>> 0;
  U.unpack = (c) => [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, c >>> 24];
  U.mix = (a, b, t) => [U.lerp(a[0], b[0], t), U.lerp(a[1], b[1], t), U.lerp(a[2], b[2], t)];
  U.mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  U.css = (c, a = 1) =>
    a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  // Build a 4-tone material from a base color.
  // tones: [deep, shadow, base, light]
  U.mat = function (base, opts = {}) {
    const b = U.hex(base);
    const hueShadow = opts.shadowTint ? U.hex(opts.shadowTint) : [40, 20, 70];
    const hueLight = opts.lightTint ? U.hex(opts.lightTint) : [255, 236, 210];
    const deep = opts.deep ? U.hex(opts.deep) : U.mix(U.mul(b, 0.42), hueShadow, 0.28);
    const shadow = opts.shadow ? U.hex(opts.shadow) : U.mix(U.mul(b, 0.7), hueShadow, 0.16);
    const light = opts.light ? U.hex(opts.light) : U.mix(b, hueLight, opts.shine != null ? opts.shine : 0.35);
    return {
      tones: [deep, shadow, b, light],
      gloss: opts.gloss || 0, // specular highlight strength
      emissive: opts.emissive || 0,
      name: opts.name || '',
    };
  };

  U.angleLerp = function (a, b, t) {
    let d = ((b - a + 540) % 360) - 180;
    return a + d * t;
  };

  U.rot = function (x, y, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return [x * c - y * s, x * s + y * c];
  };

  // Simple object pool
  U.Pool = class {
    constructor(make) {
      this.make = make;
      this.free = [];
    }
    get() {
      return this.free.pop() || this.make();
    }
    put(o) {
      this.free.push(o);
    }
  };

  // Format mm:ss
  U.mmss = function (sec) {
    sec = Math.max(0, Math.ceil(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  };

  U.now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // Settings persisted in localStorage (wrapped; works without storage).
  JJK.settings = {
    musicVol: 0.55,
    sfxVol: 0.8,
    voice: true,
    voiceLang: 'en',
    shake: 1.0,
    crt: true,
    flashes: true,
    roundTime: 90,
    rounds: 2, // wins needed
    p1Pad: 0,
    p2Pad: 1,
    frameMeter: true,
  };
  JJK.loadSettings = function () {
    try {
      const raw = root.localStorage && root.localStorage.getItem('cursedArts.settings');
      if (raw) Object.assign(JJK.settings, JSON.parse(raw));
    } catch (e) {}
  };
  JJK.saveSettings = function () {
    try {
      root.localStorage && root.localStorage.setItem('cursedArts.settings', JSON.stringify(JJK.settings));
    } catch (e) {}
  };
})();
