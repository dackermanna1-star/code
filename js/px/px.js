/* What Derry Keeps — pixel art kit.
 *
 * Every picture in the game is drawn at native pixel resolution into a
 * palette-indexed buffer: backgrounds and CGs at 320×180, character sprites
 * at 118×176 (the same pixel size on screen). Colors come from hand-tuned,
 * hue-shifted ramps (dark → light). A time-of-day preset then lights the
 * picture the way Stardew does it: an ambient multiply, plus light sources
 * (windows, lamps, the Lamp) that lift their surroundings in dithered steps.
 * Finally the image is upscaled with nearest neighbour by a whole number and
 * the browser fits it to the stage.
 *
 * Art files register with PX.bg(id, def), PX.cg(id, def), PX.char(id, def).
 * See docs/ART_DIRECTION.md for the style rules and the API in use.
 */
(function () {
  'use strict';
  const PX = (window.PX = { W: 320, H: 180, SW: 118, SH: 176 });
  const ART = (PX.ART = { bgs: {}, cgs: {}, chars: {} });
  PX.bg = (id, def) => { ART.bgs[id] = def; };
  PX.cg = (id, def) => { ART.cgs[id] = def; };
  PX.char = (id, def) => { ART.chars[id] = def; };
  PX.hasBg = (id) => !!(ART.bgs[id] || ART.cgs[id]);
  PX.hasChar = (id) => !!ART.chars[id];

  /* ------------------------------------------------------------------ */
  /* color + rng                                                         */
  const hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  PX.hex = hex;
  PX.rgbHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const toHsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; };
  const fromHsl = ([h, s, l]) => { h = ((h % 360) + 360) % 360 / 360; const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; if (s === 0) return [l * 255, l * 255, l * 255]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255]; };
  PX.hsl = toHsl; PX.fromHsl = fromHsl;
  PX.mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  /* seeded rng: mulberry32 over a string hash */
  PX.rng = (seed) => {
    let h = 1779033703 ^ String(seed).length;
    for (let i = 0; i < String(seed).length; i++) { h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    const r = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    r.range = (lo, hi) => lo + r() * (hi - lo);
    return r;
  };

  /* ------------------------------------------------------------------ */
  /* palette: ramps of hand-tuned colors, darkest first                  */
  /* A color code is (rampIndex << 4) | shade. Bit 15 marks an emissive  */
  /* pixel (lit from within: sky, lamps, screens): ambient light skips it. */
  const RAMPS = [null];           // index 0 = empty
  const RAMP_ID = {};
  const P = (PX.P = {});           // P.brick[3] -> color code
  PX.EMIT = 0x8000;
  PX.ramp = function (name, hexes) {
    let id = RAMP_ID[name];
    if (id === undefined) { id = RAMPS.length; RAMPS.push(null); RAMP_ID[name] = id; }
    RAMPS[id] = hexes.map(hex);
    P[name] = RAMPS[id].map((_, s) => (id << 4) | s);
    P[name].id = id;
    P[name].n = hexes.length;
    P[name].top = P[name][hexes.length - 1];
    return P[name];
  };
  /* emissive version of a code */
  PX.E = (c) => c | PX.EMIT;
  /* shift a code's shade within its ramp (clamped) */
  PX.sh = (c, d) => { const id = (c & 0x7ff0) >> 4, n = RAMPS[id] ? RAMPS[id].length : 1, s = Math.max(0, Math.min(n - 1, (c & 15) + d)); return (c & 0x8000) | (id << 4) | s; };
  PX.rgbOf = (c) => { const id = (c & 0x7ff0) >> 4; return RAMPS[id] ? RAMPS[id][c & 15] : [0, 0, 0]; };
  /* generate a hue-shifted ramp from a mid color (for quick extra materials) */
  PX.hsRamp = function (name, mid, n = 6, o = {}) {
    const [h, s, l] = toHsl(hex(mid));
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const lo = Math.max(0.05, l - (o.down || 0.36)), hi = Math.min(0.95, l + (o.up || 0.34));
      const L = lo + (hi - lo) * t;
      const shift = (o.hue === undefined ? 18 : o.hue);
      // darks rotate toward violet (250°), lights toward yellow (55°)
      const toward = (from, target, amt) => { let d = ((target - from + 540) % 360) - 180; return from + Math.sign(d) * Math.min(Math.abs(d), amt); };
      const H = t < 0.5 ? toward(h, 250, shift * (0.5 - t) * 2) : toward(h, 55, shift * (t - 0.5) * 2);
      const S = Math.max(0, Math.min(1, s * (0.82 + 0.3 * (1 - Math.abs(2 * t - 1))) * (o.sat || 1)));
      out.push(PX.rgbHex(fromHsl([H, S, L])));
    }
    return PX.ramp(name, out);
  };

  const R = PX.ramp;
  /* darks and outlines */
  R('ink', ['#100c16', '#1b1523', '#271e31', '#352a42', '#463956', '#5b4b6c']);
  R('plum', ['#26142b', '#3d1f3c', '#572d4d', '#734061', '#935873', '#b47788']);
  /* skins: outline, deep shadow, shadow, mid, light, highlight */
  R('skin_peach', ['#58213a', '#8f3f4b', '#c4685c', '#e8977a', '#f8c19e', '#ffe0c4']);
  R('skin_fair', ['#4a2139', '#83425a', '#b46f7e', '#daa0a1', '#f1c8c0', '#fde7e0']);
  R('skin_warm', ['#4c2029', '#83413c', '#b16650', '#d38d6a', '#eab38d', '#f8d5b3']);
  R('skin_brown', ['#2b111b', '#4f2522', '#773c2e', '#9a573d', '#bc7955', '#d99e78']);
  R('skin_old', ['#542739', '#8a4b57', '#b87a79', '#daa59c', '#efcbc0', '#fbe7df']);
  R('skin_ghost', ['#26303a', '#45566a', '#6a8090', '#93a9b4', '#bdd0d4', '#e2efee']);
  /* hair */
  R('hair_brown', ['#1f1018', '#3a1d22', '#592f26', '#7b482f', '#9f663c', '#c48a54']);
  R('hair_dark', ['#130a12', '#21121b', '#331d26', '#482b30', '#623f3d', '#835a4d']);
  R('hair_black', ['#0e0b16', '#181524', '#232036', '#312e4a', '#454363', '#5f5f82']);
  R('hair_honey', ['#381d17', '#673d22', '#966632', '#c09246', '#e1bd6a', '#f5df9c']);
  R('hair_blond', ['#38281a', '#6a4e26', '#9c7839', '#c6a256', '#e4ca80', '#f7eab3']);
  R('hair_white', ['#372d43', '#5f576f', '#8c8599', '#b7b1c0', '#dbd6e0', '#f7f4f8']);
  R('hair_gray', ['#23222d', '#42404c', '#65636f', '#8b8993', '#b0aeb6', '#d6d4da']);
  R('hair_auburn', ['#2a0f14', '#521e1b', '#80321e', '#ab4c29', '#ce7036', '#e99850']);
  R('hair_red', ['#2c0d12', '#591919', '#8c291f', '#be3d29', '#e06239', '#f68e53']);
  R('hair_mid', ['#271711', '#45281d', '#643f30', '#84573e', '#a47351', '#c49368']);
  /* eyes, whites, lips, blush */
  R('eye_green', ['#17251f', '#2b4535', '#456a4e', '#6a9170', '#9abb93', '#c8dcbc']);
  R('eye_blue', ['#121a36', '#203266', '#37579c', '#5a83c6', '#90b3e4', '#c6dcf6']);
  R('eye_brown', ['#1b0f0d', '#382014', '#58361f', '#7a522f', '#a0784b', '#c6a47a']);
  R('eye_gray', ['#1a202e', '#323c50', '#536078', '#79879e', '#a6b2c4', '#d0d8e2']);
  R('eye_hazel', ['#1f1a10', '#3c3418', '#5e5224', '#82743a', '#a89a5a', '#cec080']);
  R('white', ['#5c5266', '#a49aac', '#d6d0da', '#efebf0', '#faf8fa', '#ffffff']);
  R('lip', ['#561d2e', '#8b3344', '#b54d59', '#d67877', '#eca39a', '#f8cbc0']);
  R('lip_red', ['#4c0f1f', '#84172b', '#b52939', '#db4d54', '#f07b76', '#fbb0a8']);
  R('blush', ['#b85462', '#d67079', '#ea8f91', '#f5aead', '#fbcac6', '#ffe4e0']);
  R('tear', ['#2a3e66', '#4a6aa0', '#78a0d0', '#a8c8ec', '#d4e6f8', '#ffffff']);
  /* fabrics */
  R('olive', ['#1d2013', '#33381f', '#4b522e', '#666f40', '#869056', '#a8b276']);
  R('maroon', ['#270e17', '#461723', '#6a2230', '#8e313f', '#b14757', '#cf6d79']);
  R('navy', ['#0f1222', '#1a2038', '#253052', '#33426c', '#475a88', '#6378a4']);
  R('denim', ['#121a2c', '#1f2c48', '#2f4266', '#435c86', '#5f7ba4', '#86a0c2']);
  R('red', ['#2a0a10', '#4c1219', '#741b23', '#9c2a2d', '#c1413a', '#dc654f']);
  R('mustard', ['#2e2008', '#57400e', '#866416', '#b38d22', '#d8b33a', '#f0d468']);
  R('cream', ['#3a2e26', '#665446', '#958068', '#bca78c', '#dccaae', '#f3e8d2']);
  R('camel', ['#2e1d12', '#55351c', '#7f5428', '#a77538', '#c8964e', '#e2b872']);
  R('teal', ['#0c1f22', '#143538', '#1e4f50', '#2c6b68', '#428a82', '#64aca0']);
  R('plaid_r', ['#26080e', '#480f18', '#701a22', '#982a2c', '#bb4338', '#d8654c']);
  R('knit_gray', ['#1f1d24', '#38353f', '#55515c', '#76727c', '#9a96a0', '#c0bcc4']);
  R('green_jkt', ['#0e1c16', '#173024', '#214634', '#2e6046', '#437e5c', '#609e76']);
  R('pink', ['#3a1424', '#682640', '#963c5a', '#bf5c78', '#de869c', '#f4b8c6']);
  R('yellow', ['#3a2a0a', '#6c4e10', '#a07a18', '#cfa62a', '#ecca48', '#fbe68a']);
  R('black_cloth', ['#0a090e', '#131218', '#1d1c24', '#282731', '#363542', '#484758']);
  R('white_cloth', ['#4a4654', '#7a7684', '#a8a4b0', '#cdcad3', '#e8e6ec', '#fbfafc']);
  /* outdoors */
  R('sky_day', ['#335f99', '#4a7eb8', '#689fd2', '#8fbfe4', '#b9dbf0', '#e2f1f8']);
  R('sky_dusk', ['#2a2150', '#4e3169', '#83476f', '#c06768', '#ec935d', '#ffc46c']);
  R('sky_night', ['#05071a', '#0a112e', '#121d47', '#1c2c5f', '#2c4078', '#435892']);
  R('sky_quiet', ['#030505', '#060b0a', '#0a1412', '#121e1b', '#1b2a26', '#283a34']);
  R('sky_rain', ['#2a3040', '#3e4658', '#545e72', '#6e788c', '#8a94a6', '#a8b0be']);
  R('cloud', ['#575c84', '#868bae', '#b2b5d0', '#d6d8e9', '#f0f0f7', '#ffffff']);
  R('grass', ['#11211a', '#1c3621', '#2b5027', '#406d31', '#5d8c3b', '#84ab4b']);
  R('grass_fall', ['#201d0e', '#3a3513', '#57511b', '#787026', '#9c9436', '#c0b852']);
  R('leaf_orange', ['#381308', '#68230c', '#9e3b12', '#d05e1b', '#ee8a2b', '#ffb64b']);
  R('leaf_red', ['#2c0a10', '#581217', '#8a1d20', '#b72f29', '#db4a33', '#f47649']);
  R('leaf_gold', ['#382808', '#68480c', '#9a6e12', '#ca981b', '#ecc22d', '#fae268']);
  R('pine', ['#091512', '#0f231b', '#173327', '#204533', '#2c593f', '#3c6f4d']);
  R('bark', ['#160d0e', '#291915', '#3f271d', '#573927', '#724f35', '#8f6945']);
  R('birch', ['#2a2830', '#4e4c55', '#7c7a82', '#aeacb2', '#d6d4d8', '#f2f0f2']);
  R('dirt', ['#1f140f', '#382419', '#553823', '#734f31', '#916944', '#b08a5e']);
  R('water', ['#09131f', '#112337', '#1b3953', '#295571', '#3d758f', '#5d9baf']);
  /* built */
  R('wood', ['#25120d', '#422119', '#64351f', '#894b29', '#ac6939', '#ca8b51']);
  R('wood_pale', ['#392517', '#5d3f27', '#855f39', '#aa8251', '#c7a26f', '#e1c393']);
  R('wood_dark', ['#140b0c', '#24130f', '#371d15', '#4b291c', '#623826', '#7c4b33']);
  R('brick', ['#290d10', '#4d1917', '#772921', '#9b3b2b', '#bb573b', '#d17955']);
  R('stone', ['#1d1b25', '#34323d', '#4d4b55', '#696771', '#89878f', '#adabb1']);
  R('stone_warm', ['#292120', '#453933', '#63554b', '#827365', '#a29383', '#c3b5a3']);
  R('concrete', ['#2b2b2f', '#46464b', '#626267', '#818185', '#a1a1a3', '#c3c3c3']);
  R('asphalt', ['#111117', '#1b1b23', '#272731', '#353541', '#454553', '#595967']);
  R('roof', ['#13131d', '#1f1f2d', '#2d2d41', '#3d3d55', '#51516b', '#696985']);
  R('roof_red', ['#220c10', '#3e1418', '#5e1e20', '#802c2a', '#a03e36', '#bc5a48']);
  R('house_green', ['#131f19', '#203327', '#2e4937', '#3f6149', '#557b5d', '#709777']);
  R('house_blue', ['#141a26', '#222c40', '#334260', '#465a7e', '#5e769a', '#7c94b4']);
  R('house_yellow', ['#352a14', '#5e4b22', '#8a7034', '#b4974c', '#d4b96c', '#ecd898']);
  R('trim', ['#3b3b49', '#696979', '#9999a5', '#c3c3cb', '#e1e1e5', '#f5f5f5']);
  R('wall_cream', ['#392d27', '#655345', '#937f69', '#bba78d', '#dbc9af', '#f1e5cf']);
  R('wall_yellow', ['#3d3120', '#695533', '#977f4b', '#bfa767', '#dbc789', '#f1e3b3']);
  R('wall_green', ['#1b2420', '#2e3d35', '#43594d', '#5b7766', '#779582', '#98b3a0']);
  R('wall_rose', ['#3a2228', '#644049', '#8f626a', '#b6868c', '#d4aaab', '#ecd0cc']);
  R('wall_blue', ['#1a2030', '#2c3650', '#424f70', '#5c6a8e', '#7c8aaa', '#a2aec6']);
  R('metal', ['#191b23', '#2d313d', '#454b59', '#636b7b', '#8991a1', '#b5bdc7']);
  R('chrome', ['#2a2e3a', '#4a5262', '#727c8e', '#9ea8b8', '#c8d0dc', '#f0f4f8']);
  R('paper', ['#4a4236', '#7a6e5a', '#a89a80', '#cbbe9f', '#e6dcc2', '#f8f2e2']);
  R('tile_red', ['#2a0c0e', '#4c1416', '#741f1e', '#9a3028', '#bb4a37', '#d46c50']);
  R('linoleum', ['#2c2a26', '#4a463e', '#6a6458', '#8c8474', '#aea592', '#cec6b2']);
  R('green_glass', ['#06150d', '#0c2617', '#143a23', '#1f5232', '#2e6e44', '#46905c']);
  /* light (draw these emissive with PX.E) */
  R('lamp', ['#682812', '#a6501a', '#de8a2b', '#f6b84a', '#ffdb7c', '#fff4c8']);
  R('lantern', ['#0b2a14', '#15502a', '#287f40', '#55b35c', '#9ddf89', '#e2ffd2']);
  R('tv', ['#0f1938', '#1b2f6e', '#2f53a6', '#5983d6', '#93b7f2', '#d5e7ff']);
  R('neon', ['#3a0614', '#740c24', '#b0183a', '#e43858', '#ff7a8e', '#ffc4cc']);
  R('fire', ['#4a0e06', '#8a2408', '#c8480e', '#f07e1e', '#ffbc46', '#fff0a8']);

  /* ------------------------------------------------------------------ */
  /* time of day: ambient multiply + sprite light preset                 */
  /* mul is applied to every non-emissive pixel; light channels pull the */
  /* multiply toward their own color where they reach.                   */
  PX.TIME = {
    day: { mul: [1, 1, 1], sprite: 'day' },
    morning: { mul: [1.0, 0.97, 0.92], sprite: 'morning' },
    afternoon: { mul: [1.04, 0.95, 0.82], sprite: 'afternoon' },
    dusk: { mul: [0.84, 0.66, 0.7], sprite: 'dusk' },
    evening: { mul: [0.62, 0.55, 0.6], sprite: 'interior_lamp' },
    night: { mul: [0.33, 0.37, 0.58], sprite: 'night' },
    quiet: { mul: [0.2, 0.27, 0.28], sprite: 'quiet' },
    dawn: { mul: [0.66, 0.64, 0.82], sprite: 'morning' },
    rain: { mul: [0.6, 0.66, 0.76], sprite: 'rain' },
    dim: { mul: [0.4, 0.37, 0.4], sprite: 'dim' },
    flashlight: { mul: [0.16, 0.15, 0.2], sprite: 'dim' },
    fluorescent: { mul: [0.96, 1, 0.98], sprite: 'fluorescent' },
    festival: { mul: [0.46, 0.42, 0.6], sprite: 'dusk' },
    lanterns: { mul: [0.3, 0.3, 0.48], sprite: 'night' },
    empty_night: { mul: [0.3, 0.33, 0.46], sprite: 'night' },
    none: { mul: [1, 1, 1], sprite: 'day' }
  };
  /* light channel colors (multipliers; >1 brightens) */
  PX.LIGHTS = {
    warm: [1.28, 1.02, 0.7],
    sun: [1.3, 1.1, 0.78],
    cool: [0.72, 0.88, 1.25],
    green: [0.62, 1.3, 0.72],
    white: [1.12, 1.12, 1.12],
    red: [1.35, 0.6, 0.55]
  };
  /* sprite color matrices the engine applies per background (r, g, b gain, saturation) */
  PX.SPRITE_LIGHT = {
    morning: { r: 1.02, g: 0.99, b: 0.95, s: 1 },
    day: { r: 1, g: 1, b: 1, s: 1 },
    afternoon: { r: 1.06, g: 0.98, b: 0.86, s: 1.04 },
    dusk: { r: 0.96, g: 0.8, b: 0.82, s: 0.95 },
    night: { r: 0.6, g: 0.66, b: 0.86, s: 0.8 },
    quiet: { r: 0.56, g: 0.72, b: 0.62, s: 0.62 },
    rain: { r: 0.82, g: 0.86, b: 0.94, s: 0.85 },
    interior_lamp: { r: 1.0, g: 0.88, b: 0.74, s: 0.95 },
    fluorescent: { r: 0.96, g: 1.0, b: 0.98, s: 0.9 },
    dim: { r: 0.62, g: 0.6, b: 0.64, s: 0.75 }
  };

  /* 4×4 ordered-dither thresholds in (0,1) */
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
  PX.bayer = bayer;

  /* ------------------------------------------------------------------ */
  /* Surface                                                             */
  class Surf {
    constructor(w, h, o) {
      this.w = w; this.h = h; this.o = o || {};
      this.d = new Uint16Array(w * h);
      this.L = {};
      this.mask = null;
      this.rng = this.o.rng || PX.rng('surf');
    }
    /* ---- pixels ---- */
    px(x, y, c) {
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      const i = y * this.w + x;
      if (this.mask && !this.mask[i]) return;
      this.d[i] = c;
    }
    get(x, y) { x = Math.floor(x); y = Math.floor(y); return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[y * this.w + x]; }
    fill(c) { if (!this.mask) this.d.fill(c); else this.rect(0, 0, this.w, this.h, c); return this; }
    rect(x, y, w, h, c) {
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
      for (let yy = y0; yy < y1; yy++) {
        const row = yy * this.w;
        for (let xx = x0; xx < x1; xx++) { if (!this.mask || this.mask[row + xx]) this.d[row + xx] = c; }
      }
      return this;
    }
    hline(x0, x1, y, c) { if (x1 < x0) [x0, x1] = [x1, x0]; return this.rect(x0, y, x1 - x0 + 1, 1, c); }
    vline(x, y0, y1, c) { if (y1 < y0) [y0, y1] = [y1, y0]; return this.rect(x, y0, 1, y1 - y0 + 1, c); }
    /* Bresenham line; c may be a function (i, x, y) -> code for patterned lines */
    line(x0, y0, x1, y1, c) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy, i = 0;
      for (;;) {
        const cc = typeof c === 'function' ? c(i, x0, y0) : c;
        if (cc) this.px(x0, y0, cc);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
        i++;
      }
      return this;
    }
    /* polyline through points */
    path(pts, c) { for (let i = 1; i < pts.length; i++) this.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c); return this; }
    /* scanline polygon fill (pixel centers); c may be fn(x, y) -> code */
    poly(pts, c) {
      if (!pts || pts.length < 3) return this;
      let minY = Infinity, maxY = -Infinity;
      for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
      const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(this.h - 1, Math.ceil(maxY));
      const xs = [];
      for (let y = y0; y <= y1; y++) {
        const sy = y + 0.5; xs.length = 0;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const a = pts[i], b = pts[j];
          if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(this.w - 1, Math.floor(xs[k + 1] - 0.5));
          for (let x = xa; x <= xb; x++) {
            const cc = typeof c === 'function' ? c(x, y) : c;
            if (cc) this.px(x, y, cc);
          }
        }
      }
      return this;
    }
    /* filled ellipse centred on (cx, cy); c may be fn(x, y, nx, ny) with normalised offsets */
    ellipse(cx, cy, rx, ry, c) {
      const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
      for (let y = y0; y <= y1; y++) {
        const ny = (y + 0.5 - cy) / ry;
        if (Math.abs(ny) > 1) continue;
        const hw = rx * Math.sqrt(1 - ny * ny);
        const xa = Math.ceil(cx - hw - 0.5), xb = Math.floor(cx + hw - 0.5);
        for (let x = xa; x <= xb; x++) {
          const cc = typeof c === 'function' ? c(x, y, (x + 0.5 - cx) / rx, ny) : c;
          if (cc) this.px(x, y, cc);
        }
      }
      return this;
    }
    circle(cx, cy, r, c) { return this.ellipse(cx, cy, r, r, c); }
    /* one-pixel ellipse outline */
    ring(cx, cy, rx, ry, c) {
      const pts = []; const n = Math.max(16, Math.round((rx + ry) * 4));
      for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * rx - 0.5, cy + Math.sin(a) * ry - 0.5]); }
      const seen = new Set();
      for (let i = 1; i < pts.length; i++) this.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], (k, x, y) => { const key = x + ',' + y; if (seen.has(key)) return 0; seen.add(key); return c; });
      return this;
    }
    /* ---- dithering ---- */
    /* draw c on pixels whose Bayer threshold is below `level` (0..1) */
    dither(x, y, w, h, c, level) { return this._ditherRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h), c, level); }
    _ditherRect(x, y, w, h, c, level) {
      for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) if (bayer(xx, yy) < level) this.px(xx, yy, c);
      return this;
    }
    dith(x, y, w, h, c, level) { return this._ditherRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h), c, level); }
    ditherPoly(pts, c, level) { return this.poly(pts, (x, y) => (bayer(x, y) < level ? c : 0)); }
    /* vertical stepped gradient through codes (top → bottom) with dithered seams */
    vgrad(x, y, w, h, codes, seam = 3) {
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      const n = codes.length;
      for (let yy = 0; yy < h; yy++) {
        const t = (yy + 0.5) / h * n - 0.5;      // band coordinate
        const k = Math.max(0, Math.min(n - 1, Math.floor(t)));
        const f = t - k;                          // 0..1 within band
        const edge = Math.min(0.5, seam / (h / n)); // seam width in band units
        for (let xx = 0; xx < w; xx++) {
          let c = codes[k];
          if (k + 1 < n && f > 1 - edge) { const tt = (f - (1 - edge)) / edge; if (bayer(x + xx, y + yy) < tt * 0.5) c = codes[k + 1]; }
          if (k > 0 && f < edge) { const tt = 1 - f / edge; if (bayer(x + xx, y + yy) < tt * 0.5) c = codes[k - 1]; }
          this.px(x + xx, y + yy, c);
        }
      }
      return this;
    }
    hgrad(x, y, w, h, codes, seam = 3) {
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      const n = codes.length;
      for (let xx = 0; xx < w; xx++) {
        const t = (xx + 0.5) / w * n - 0.5, k = Math.max(0, Math.min(n - 1, Math.floor(t))), f = t - k, edge = Math.min(0.5, seam / (w / n));
        for (let yy = 0; yy < h; yy++) {
          let c = codes[k];
          if (k + 1 < n && f > 1 - edge) { const tt = (f - (1 - edge)) / edge; if (bayer(x + xx, y + yy) < tt * 0.5) c = codes[k + 1]; }
          if (k > 0 && f < edge) { const tt = 1 - f / edge; if (bayer(x + xx, y + yy) < tt * 0.5) c = codes[k - 1]; }
          this.px(x + xx, y + yy, c);
        }
      }
      return this;
    }
    /* ---- clipping: region is [x,y,w,h], a polygon [[x,y]...], or fn(x,y)->bool ---- */
    clip(region, fn) {
      const prev = this.mask;
      const m = new Uint8Array(this.w * this.h);
      if (typeof region === 'function') { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (region(x, y)) m[y * this.w + x] = 1; }
      else if (region.length === 4 && typeof region[0] === 'number') { const [x, y, w, h] = region.map(Math.round); for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) m[yy * this.w + xx] = 1; }
      else { const saved = this.mask, d = this.d; this.mask = null; this.d = m; this.poly(region, 1); this.d = d; this.mask = saved; }
      if (prev) for (let i = 0; i < m.length; i++) m[i] &= prev[i];
      this.mask = m;
      try { fn(this); } finally { this.mask = prev; }
      return this;
    }
    /* clip to pixels currently holding one of the given codes (or any non-empty if omitted) */
    clipTo(codes, fn) {
      const set = codes ? new Set([].concat(codes)) : null;
      return this.clip((x, y) => { const v = this.d[y * this.w + x]; return set ? set.has(v) : v !== 0; }, fn);
    }
    /* replace codes inside an optional region */
    recolor(map, region) {
      const run = () => { for (let i = 0; i < this.d.length; i++) { const v = this.d[i]; if (map[v] !== undefined && (!this.mask || this.mask[i])) this.d[i] = map[v]; } };
      if (region) this.clip(region, run); else run();
      return this;
    }
    /* ---- shapes with built-in shading ---- */
    /* Fill a polygon with ramp shades: base, a light band on the lit side and a
     * shadow band on the far side, plus a selective outline. ramp = P.name.
     * o: { base: shade, light: 'left'|'right'|'top', band: px, outline: shade|false } */
    shape(pts, ramp, o = {}) {
      const base = o.base === undefined ? 3 : o.base;
      const band = o.band === undefined ? 2 : o.band;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of pts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
      const tmp = new Surf(this.w, this.h); tmp.poly(pts, 1);
      const inside = (x, y) => x >= 0 && y >= 0 && x < this.w && y < this.h && tmp.d[y * this.w + x] === 1;
      const light = o.light || 'left';
      const dirx = light === 'left' ? -1 : light === 'right' ? 1 : 0, diry = light === 'top' ? -1 : 0;
      for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(this.h - 1, Math.ceil(maxY)); y++) {
        for (let x = Math.max(0, Math.floor(minX)); x <= Math.min(this.w - 1, Math.ceil(maxX)); x++) {
          if (!inside(x, y)) continue;
          let s = base;
          // distance to the edge toward and away from the light
          let dl = 0, ds = 0;
          for (let k = 1; k <= band + 1; k++) { if (!inside(x + dirx * k, y + diry * k)) { dl = k; break; } }
          for (let k = 1; k <= band + 1; k++) { if (!inside(x - dirx * k, y - diry * k)) { ds = k; break; } }
          if (o.shadow !== false && ds && ds <= band) s = base - 1;
          if (o.lit !== false && dl && dl <= Math.max(1, band - 1)) s = base + 1;
          const isEdge = !inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1);
          if (isEdge && o.outline !== false) s = o.outline === undefined ? 0 : o.outline;
          this.px(x, y, ramp[Math.max(0, Math.min(ramp.length - 1, s))]);
        }
      }
      return this;
    }
    /* selective outline: opaque pixels next to empty ones become a darker shade
     * of their own ramp (or `code` if given). Run on sprites after drawing. */
    outline(o = {}) {
      const w = this.w, h = this.h, d = this.d, out = new Uint16Array(d);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, v = d[i];
        if (!v) continue;
        const e = (x > 0 && !d[i - 1]) || (x < w - 1 && !d[i + 1]) || (y > 0 && !d[i - w]) || (y < h - 1 && !d[i + w]) || x === 0 || y === 0 || x === w - 1;
        if (e && !(o.skipBottom && y === h - 1)) out[i] = o.code || (v & 0x7ff0) | Math.min(v & 15, o.shade || 0);
      }
      this.d.set(out);
      return this;
    }
    /* draw an outline of `code` around every pixel matching `codes` where it borders other content */
    edge(codes, code, o = {}) {
      const set = new Set([].concat(codes)), w = this.w, h = this.h, d = this.d, out = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; if (!set.has(d[i])) continue;
        const n = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        for (const [xx, yy] of n) { if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const v = d[yy * w + xx]; if (!set.has(v) && (o.any || v)) { out.push(i); break; } }
      }
      for (const i of out) d[i] = code;
      return this;
    }
    /* shift every non-emissive pixel in a region by d shades (cast shadows, porch shade).
     * region: [x,y,w,h], polygon, or fn(x,y)->bool; o.dither (0..1) shifts only part of the pixels */
    shift(region, d, o = {}) {
      const run = () => {
        for (let i = 0; i < this.d.length; i++) {
          if (this.mask && !this.mask[i]) continue;
          const v = this.d[i]; if (!v || (v & 0x8000)) continue;
          if (o.dither !== undefined && bayer(i % this.w, (i / this.w) | 0) >= o.dither) continue;
          if (o.only && !o.only(v)) continue;
          this.d[i] = PX.sh(v, d);
        }
      };
      return this.clip(region, run);
    }
    /* ---- light ---- */
    /* add light of a channel in an elliptical pool; amount ~0.4..1.2 */
    light(ch, cx, cy, rx, ry, amount = 1, o = {}) {
      const L = this.L[ch] || (this.L[ch] = new Float32Array(this.w * this.h));
      ry = ry || rx;
      const core = o.core === undefined ? 0.15 : o.core;
      for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(this.h - 1, Math.ceil(cy + ry)); y++) {
        for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(this.w - 1, Math.ceil(cx + rx)); x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, r = Math.sqrt(dx * dx + dy * dy);
          if (r >= 1) continue;
          const f = r < core ? 1 : 1 - (r - core) / (1 - core);
          if (this.mask && !this.mask[y * this.w + x]) continue;
          L[y * this.w + x] += amount * f * f * (3 - 2 * f) * 0.999;
        }
      }
      return this;
    }
    /* light filling a polygon, optionally fading along an axis: o.fade = {x0,y0,x1,y1} (full at 0 → none at 1) */
    lightPoly(ch, pts, amount = 0.6, o = {}) {
      const L = this.L[ch] || (this.L[ch] = new Float32Array(this.w * this.h));
      const f = o.fade;
      const tmp = new Surf(this.w, this.h); tmp.poly(pts, 1);
      for (let i = 0; i < tmp.d.length; i++) {
        if (!tmp.d[i] || (this.mask && !this.mask[i])) continue;
        let a = amount;
        if (f) { const x = i % this.w, y = (i / this.w) | 0; const vx = f.x1 - f.x0, vy = f.y1 - f.y0; const t = Math.max(0, Math.min(1, ((x - f.x0) * vx + (y - f.y0) * vy) / (vx * vx + vy * vy))); a *= 1 - t; }
        L[i] += a;
      }
      return this;
    }
    /* ---- copying ---- */
    stamp(src, dx, dy, o = {}) {
      for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
        const v = src.d[y * src.w + (o.flip ? src.w - 1 - x : x)];
        if (v) this.px(dx + x, dy + y, o.map ? o.map(v) : v);
      }
      return this;
    }
    /* ---- composing ---- */
    compose(timeName, o = {}) {
      const T = PX.TIME[timeName] || PX.TIME.day;
      const w = this.w, h = this.h, n = w * h;
      const cv = o.canvas || document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(w, h), out = img.data;
      const chans = Object.keys(this.L).filter((k) => PX.LIGHTS[k]);
      const mul = T.mul;
      const steps = o.lightSteps || 4;
      for (let i = 0; i < n; i++) {
        const v = this.d[i], k = i * 4;
        if (!v) { if (o.opaque) { out[k] = 5; out[k + 1] = 6; out[k + 2] = 10; out[k + 3] = 255; } continue; }
        const rgb = RAMPS[(v & 0x7ff0) >> 4][v & 15];
        let m0 = mul[0], m1 = mul[1], m2 = mul[2];
        if (!(v & 0x8000)) {
          if (chans.length) {
            let tot = 0, c0 = 0, c1 = 0, c2 = 0;
            for (const ch of chans) { const a = this.L[ch][i]; if (a > 0) { const col = PX.LIGHTS[ch]; tot += a; c0 += col[0] * a; c1 += col[1] * a; c2 += col[2] * a; } }
            if (tot > 0) {
              const x = i % w, y = (i / w) | 0;
              const q = Math.min(steps, Math.floor(tot * steps + bayer(x, y))) / steps;
              if (q > 0) { const t = Math.min(1, q); m0 += (c0 / tot - m0) * t; m1 += (c1 / tot - m1) * t; m2 += (c2 / tot - m2) * t; }
            }
          }
        } else { m0 = m1 = m2 = 1; }
        out[k] = Math.min(255, rgb[0] * m0); out[k + 1] = Math.min(255, rgb[1] * m1); out[k + 2] = Math.min(255, rgb[2] * m2); out[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return cv;
    }
  }
  PX.Surf = Surf;
  PX.surf = (w, h, o) => new Surf(w || PX.W, h || PX.H, o);

  /* ------------------------------------------------------------------ */
  /* textures and set pieces (methods on Surf)                           */
  const S = Surf.prototype;
  const clampS = (r, s) => r[Math.max(0, Math.min(r.length - 1, s))];

  /* running-bond brick: r = ramp, mortar = code */
  S.bricks = function (x, y, w, h, r, o = {}) {
    const bw = o.bw || 6, bh = o.bh || 3, rng = o.rng || this.rng, base = o.base === undefined ? 3 : o.base;
    const mortar = o.mortar || P.stone[2];
    this.rect(x, y, w, h, mortar);
    for (let row = 0, yy = y; yy < y + h; row++, yy += bh) {
      const off = row % 2 ? Math.floor(bw / 2) : 0;
      for (let xx = x - off; xx < x + w; xx += bw) {
        const s = base + (rng() < 0.18 ? -1 : rng() < 0.12 ? 1 : 0);
        const x0 = Math.max(x, xx), x1 = Math.min(x + w, xx + bw - 1);
        const y1 = Math.min(y + h, yy + bh - 1);
        if (x1 <= x0 || y1 <= yy) continue;
        this.rect(x0, yy, x1 - x0, y1 - yy, clampS(r, s));
        if (bh > 2) this.hline(x0, x1 - 1, y1 - 1, clampS(r, s - 1));
        if (rng() < 0.35) this.px(x0, yy, clampS(r, s + 1));
      }
    }
    return this;
  };
  /* horizontal clapboard siding */
  S.clapboard = function (x, y, w, h, r, o = {}) {
    const bd = o.board || 3, base = o.base === undefined ? 3 : o.base, rng = o.rng || this.rng;
    for (let yy = y; yy < y + h; yy += bd) {
      this.rect(x, yy, w, Math.min(bd, y + h - yy), clampS(r, base));
      this.hline(x, x + w - 1, yy, clampS(r, base + 1));
      if (bd > 2 && yy + bd - 1 < y + h) this.hline(x, x + w - 1, yy + bd - 1, clampS(r, base - 1));
      if (o.seams !== false && rng() < 0.5) { const sx = x + rng.int(2, Math.max(3, w - 3)); this.vline(sx, yy + 1, Math.min(y + h - 1, yy + bd - 2), clampS(r, base - 1)); }
    }
    return this;
  };
  /* vertical board-and-batten / plank wall or floor; o.horiz for floors */
  S.planks = function (x, y, w, h, r, o = {}) {
    const pw = o.pw || 5, base = o.base === undefined ? 3 : o.base, rng = o.rng || this.rng;
    if (o.horiz) {
      for (let yy = y; yy < y + h; yy += pw) {
        const s = base + (rng() < 0.3 ? -1 : 0);
        this.rect(x, yy, w, Math.min(pw, y + h - yy), clampS(r, s));
        this.hline(x, x + w - 1, yy, clampS(r, base - 2));
        for (let k = 0; k < w / 9; k++) { const gx = x + rng.int(0, w - 6), gy = yy + rng.int(1, pw - 1); if (gy < y + h) this.hline(gx, gx + rng.int(2, 6), gy, clampS(r, s - 1)); }
        let sx = x + rng.int(4, 30);
        while (sx < x + w) { this.vline(sx, yy + 1, Math.min(y + h - 1, yy + pw - 1), clampS(r, base - 2)); sx += rng.int(26, 52); }
      }
    } else {
      for (let xx = x; xx < x + w; xx += pw) {
        const s = base + (rng() < 0.3 ? -1 : 0);
        this.rect(xx, y, Math.min(pw, x + w - xx), h, clampS(r, s));
        this.vline(xx, y, y + h - 1, clampS(r, base - 2));
        if (pw > 3) this.vline(xx + 1, y, y + h - 1, clampS(r, s + 1));
        for (let k = 0; k < h / 10; k++) { const gx = xx + rng.int(2, pw - 1), gy = y + rng.int(0, h - 5); if (gx < x + w) this.vline(gx, gy, gy + rng.int(2, 5), clampS(r, s - 1)); }
      }
    }
    return this;
  };
  /* staggered shingles for roofs; o.slope lets rows follow a roof edge */
  S.shingles = function (x, y, w, h, r, o = {}) {
    const sw = o.sw || 5, sh = o.sh || 3, base = o.base === undefined ? 3 : o.base, rng = o.rng || this.rng;
    for (let row = 0, yy = y; yy < y + h; row++, yy += sh) {
      const off = row % 2 ? Math.floor(sw / 2) : 0;
      for (let xx = x - off; xx < x + w; xx += sw) {
        const s = base + (rng() < 0.22 ? -1 : rng() < 0.1 ? 1 : 0);
        this.rect(Math.max(x, xx), yy, Math.min(sw, x + w - Math.max(x, xx)), Math.min(sh, y + h - yy), clampS(r, s));
        this.hline(Math.max(x, xx), Math.min(x + w - 1, xx + sw - 1), Math.min(y + h - 1, yy + sh - 1), clampS(r, base - 2));
        this.vline(Math.max(x, xx), yy, Math.min(y + h - 1, yy + sh - 1), clampS(r, base - 1));
      }
    }
    return this;
  };
  /* grass field with tufts; r = ramp */
  S.grass = function (x, y, w, h, r, o = {}) {
    const rng = o.rng || this.rng, base = o.base === undefined ? 2 : o.base;
    this.rect(x, y, w, h, clampS(r, base));
    const dens = o.density || 0.09;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const q = rng();
      if (q < dens) { const len = rng.int(1, 3); for (let k = 0; k < len; k++) this.px(xx, yy - k, clampS(r, base + 1 + (k === len - 1 && rng() < 0.5 ? 1 : 0))); }
      else if (q < dens * 1.6) this.px(xx, yy, clampS(r, base - 1));
    }
    return this;
  };
  /* random speckles of codes over a rect (only on existing pixels if o.onTop) */
  S.noise = function (x, y, w, h, codes, density = 0.05, o = {}) {
    const rng = o.rng || this.rng;
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) {
      if (rng() < density && (!o.onTop || this.get(xx, yy))) this.px(xx, yy, codes[Math.floor(rng() * codes.length)]);
    }
    return this;
  };
  /* leafy canopy: clustered blobs lit from upper left. r = ramp (or array of ramps to mix) */
  S.foliage = function (cx, cy, rx, ry, r, o = {}) {
    const rng = o.rng || this.rng, ramps = Array.isArray(r[0]) ? r : [r];
    const n = o.clusters || Math.round((rx * ry) / 9);
    const lx = o.lightX === undefined ? -0.6 : o.lightX, ly = o.lightY === undefined ? -0.7 : o.lightY;
    // dark core
    this.ellipse(cx, cy, rx * 0.92, ry * 0.9, (x, y, nx, ny) => clampS(ramps[0], 1 + (nx * lx + ny * ly > 0.35 ? 1 : 0)));
    const blobs = [];
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng());
      blobs.push([cx + Math.cos(a) * d * rx * 0.86, cy + Math.sin(a) * d * ry * 0.84, rng.range(1.6, o.blob || 3.4), ramps[Math.floor(rng() * ramps.length)]]);
    }
    // back to front: darker blobs first so lit ones sit on top
    blobs.sort((p, q) => ((p[0] - cx) * lx + (p[1] - cy) * ly) - ((q[0] - cx) * lx + (q[1] - cy) * ly));
    for (const [bx, by, br, rr] of blobs) {
      const lit = ((bx - cx) / rx) * lx + ((by - cy) / ry) * ly;  // >0 toward light
      const s = lit > 0.45 ? 4 : lit > 0.1 ? 3 : lit > -0.3 ? 2 : 1;
      this.ellipse(bx, by, br, br * 0.85, (x, y, nx, ny) => {
        const local = nx * lx + ny * ly;
        let ss = s + (local > 0.45 ? 1 : 0) + (local < -0.6 ? -1 : 0);
        return clampS(rr, ss);
      });
    }
    // a few bright leaf flecks on the lit rim
    for (let i = 0; i < n * 0.6; i++) {
      const a = rng() * Math.PI * 2, d = 0.6 + rng() * 0.4;
      const px = cx + Math.cos(a) * d * rx, py = cy + Math.sin(a) * d * ry;
      if (Math.cos(a) * lx + Math.sin(a) * ly > 0.2) this.px(px, py, clampS(ramps[0], 5));
      else if (rng() < 0.4) this.px(px, py, clampS(ramps[0], 1));
    }
    return this;
  };
  /* puffy cloud */
  S.cloud = function (cx, cy, w, h, o = {}) {
    const rng = o.rng || this.rng, r = o.ramp || P.cloud, top = o.top === undefined ? 4 : o.top;
    const blobs = [];
    const n = Math.max(3, Math.round(w / 7));
    for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); const bx = cx - w / 2 + t * w; const hh = h * (0.45 + 0.55 * Math.sin(Math.PI * t)) * rng.range(0.75, 1.05); blobs.push([bx, cy - hh * 0.35, Math.max(3, hh * 0.62)]); }
    const em = o.emit ? PX.EMIT : 0;
    for (const [bx, by, br] of blobs) this.ellipse(bx, by, br * 1.15, br, (x, y, nx, ny) => (ny > 0.45 ? r[top - 2] : ny > -0.1 ? r[top - 1] : r[top]) | em);
    this.rect(Math.round(cx - w / 2), Math.round(cy - 1), Math.round(w), Math.round(h * 0.3), r[top - 2] | em);
    return this;
  };
  /* a conifer: stacked jagged tiers, lit from the left */
  S.pine = function (x, base, h, r, o = {}) {
    const rng = o.rng || this.rng, wmax = o.w || h * 0.42;
    const tiers = Math.max(3, Math.round(h / 7));
    this.rect(x - 1, base - Math.round(h * 0.12), 2, Math.round(h * 0.12) + 1, (o.trunk || P.bark)[1]);
    for (let t = 0; t < tiers; t++) {
      const ty = base - Math.round(h * 0.1) - Math.round((t / tiers) * h * 0.9);
      const tw = wmax * (1 - t / tiers) * 0.95 + 1.5;
      const th = Math.round(h / tiers) + 3;
      for (let yy = 0; yy < th; yy++) {
        const hw = Math.round(tw * (yy / th) + 0.5);
        for (let xx = -hw; xx <= hw; xx++) {
          let s = xx < -hw * 0.35 ? 3 : xx > hw * 0.35 ? 1 : 2;
          if (yy === th - 1 && rng() < 0.5) s = 1;
          if (Math.abs(xx) === hw && rng() < 0.5) continue;
          this.px(x + xx, ty - th + yy, clampS(r, s + (o.light || 0)));
        }
      }
    }
    this.px(x, base - h, clampS(r, 3 + (o.light || 0)));
    return this;
  };
  /* stars: emissive dots */
  S.stars = function (x, y, w, h, n, o = {}) {
    const rng = o.rng || this.rng;
    for (let i = 0; i < n; i++) {
      const sx = x + rng.int(0, w - 1), sy = y + rng.int(0, h - 1), b = rng();
      this.px(sx, sy, PX.E(b > 0.92 ? P.white[5] : b > 0.6 ? P.cloud[3] : P.cloud[1]));
      if (b > 0.97) { this.px(sx - 1, sy, PX.E(P.cloud[1])); this.px(sx + 1, sy, PX.E(P.cloud[1])); this.px(sx, sy - 1, PX.E(P.cloud[1])); this.px(sx, sy + 1, PX.E(P.cloud[1])); }
    }
    return this;
  };
  /* a window: frame, sill, glass (day reflection or lit), mullions, optional curtains.
   * o: { frame: ramp, lit: bool, glass: 'day'|'dusk'|'night'|'dark', mull: 'cross'|'v'|'h'|'none', curtain: ramp, light: amount }
   * When lit, the glass is emissive warm and a warm glow spills out. */
  S.window = function (x, y, w, h, o = {}) {
    const fr = o.frame || P.trim, rng = o.rng || this.rng;
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    this.rect(x - 1, y - 1, w + 2, h + 2, fr[1]);
    this.rect(x, y, w, h, fr[3]);
    const gx = x + 1, gy = y + 1, gw = w - 2, gh = h - 2;
    if (o.lit) {
      this.vgrad(gx, gy, gw, gh, [PX.E(P.lamp[5]), PX.E(P.lamp[4]), PX.E(P.lamp[3])], 2);
      if (o.silhouette) o.silhouette(this, gx, gy, gw, gh);
    } else {
      const g = o.glass || 'day';
      const ramp = g === 'day' ? [P.sky_day[2], P.sky_day[3], P.sky_day[1]] : g === 'dusk' ? [P.sky_dusk[3], P.sky_dusk[2], P.sky_dusk[1]] : g === 'night' ? [P.sky_night[3], P.sky_night[2], P.sky_night[1]] : [P.ink[3], P.ink[2], P.ink[1]];
      this.vgrad(gx, gy, gw, gh, ramp, 1);
      // a diagonal glint
      for (let k = 0; k < Math.min(gw, gh); k++) { const px = gx + Math.round(gw * 0.2) + k - Math.round(gh * 0.3), py = gy + k; if (px >= gx && px < gx + gw) this.px(px, py, P.white[3]); }
    }
    if (o.curtain) {
      const cw = Math.max(1, Math.round(gw * 0.22)), c = o.curtain;
      this.rect(gx, gy, cw, gh, c[3]); this.vline(gx + cw - 1, gy, gy + gh - 1, c[2]);
      this.rect(gx + gw - cw, gy, cw, gh, c[2]); this.vline(gx + gw - cw, gy, gy + gh - 1, c[3]);
      for (let yy = gy; yy < gy + gh; yy += 3) { this.px(gx + 1, yy, c[4]); this.px(gx + gw - 2, yy + 1, c[1]); }
    }
    const mull = o.mull || 'cross';
    if (mull === 'cross' || mull === 'v') this.vline(x + Math.floor(w / 2), y, y + h - 1, fr[2]);
    if (mull === 'cross' || mull === 'h') this.hline(x, x + w - 1, y + Math.floor(h / 2), fr[2]);
    if (mull === 'grid') { for (let k = 1; k < 3; k++) this.vline(x + Math.round((w * k) / 3), y, y + h - 1, fr[2]); this.hline(x, x + w - 1, y + Math.floor(h / 2), fr[2]); }
    // sill
    if (o.sill !== false) { this.rect(x - 2, y + h, w + 4, 2, fr[4]); this.hline(x - 2, x + w + 1, y + h + 1, fr[1]); }
    if (o.lit && o.light !== 0) this.light('warm', x + w / 2, y + h / 2, (o.glow || 1) * (w * 1.6 + 6), (o.glow || 1) * (h * 1.4 + 6), o.light || 0.7);
    return this;
  };
  /* irregular fieldstone / foundation */
  S.stones = function (x, y, w, h, r, o = {}) {
    const rng = o.rng || this.rng;
    this.rect(x, y, w, h, r[1]);
    for (let yy = y; yy < y + h; yy += 3) {
      let xx = x + (((yy - y) / 3) % 2 ? -2 : 0);
      while (xx < x + w) {
        const sw = rng.int(3, 7), s = rng.pick([2, 3, 3, 4]);
        this.rect(Math.max(x, xx), yy, Math.min(sw - 1, x + w - Math.max(x, xx)), Math.min(2, y + h - yy), r[s]);
        this.px(Math.max(x, xx), yy, r[Math.min(5, s + 1)]);
        xx += sw;
      }
    }
    return this;
  };
  /* Simple one-point-perspective room: returns polygons for the back wall,
   * floor, ceiling and side walls given the back-wall rectangle. */
  PX.room = function (bx0, by0, bx1, by1, o = {}) {
    const W = o.W || PX.W, H = o.H || PX.H;
    return {
      back: [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]],
      floor: [[bx0, by1], [bx1, by1], [W, H], [0, H]],
      ceil: [[0, 0], [W, 0], [bx1, by0], [bx0, by0]],
      left: [[0, 0], [bx0, by0], [bx0, by1], [0, H]],
      right: [[bx1, by0], [W, 0], [W, H], [bx1, by1]],
      /* point on the left wall at depth t (0 = back wall, 1 = picture plane) and height v (0 = floor, 1 = ceiling) */
      leftAt: (t, v) => { const x = bx0 * (1 - t); const yTop = by0 * (1 - t), yBot = by1 + (H - by1) * t; return [x, yBot + (yTop - yBot) * v]; },
      rightAt: (t, v) => { const x = bx1 + (W - bx1) * t; const yTop = by0 * (1 - t), yBot = by1 + (H - by1) * t; return [x, yBot + (yTop - yBot) * v]; },
      floorAt: (u, t) => { const xl = bx0 * (1 - t), xr = bx1 + (W - bx1) * t; return [xl + (xr - xl) * u, by1 + (H - by1) * t]; }
    };
  };

  /* ------------------------------------------------------------------ */
  /* rendering for the engine                                            */
  /* Whole-number upscale for crisp pixels; the browser fits the result.  */
  PX.F = 4;
  PX.setScale = (f) => { PX.F = Math.max(1, Math.min(8, Math.round(f))); };
  PX.scaleFor = (cssW, cssH) => { const dpr = Math.min(3, window.devicePixelRatio || 1); return Math.max(2, Math.min(6, Math.ceil(Math.max(cssW / PX.W, cssH / PX.H) * dpr - 0.15))); };
  PX.upscale = function (src, f) {
    f = f || PX.F;
    const c = document.createElement('canvas');
    c.width = src.width * f; c.height = src.height * f;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, c.width, c.height);
    c.className = 'px';
    return c;
  };
  const cache = new Map();
  const remember = (k, v) => { cache.set(k, v); if (cache.size > 90) cache.delete(cache.keys().next().value); return v; };
  PX.clearCache = () => cache.clear();

  /* draw a background/CG at native size; returns { canvas, time, lightName } */
  PX.drawBg = function (id, time, variant) {
    const def = ART.bgs[id] || ART.cgs[id];
    if (!def) return null;
    const t = time && (!def.times || def.times.includes(time)) ? time : (def.times ? def.times[0] : time || 'day');
    const key = 'bg|' + id + '|' + t + '|' + (variant || '');
    if (cache.has(key)) return cache.get(key);
    const o = { time: t, variant: variant || null, W: PX.W, H: PX.H, rng: PX.rng(id + ':' + (variant || '')), night: /night|quiet|lanterns|festival|flashlight|empty_night/.test(t) };
    const s = new Surf(PX.W, PX.H, o);
    try { def.draw(s, o); } catch (e) { console.error('px art error', id, e); s.fill(P.ink[1]); }
    const preset = (def.preset && def.preset[t]) || t;
    const canvas = s.compose(PX.TIME[preset] ? preset : 'day', { opaque: true });
    const lightName = (def.light && def.light[t]) || (PX.TIME[preset] || PX.TIME.day).sprite;
    return remember(key, { canvas, time: t, lightName });
  };
  PX.renderBg = function (id, time, variant) {
    const r = PX.drawBg(id, time, variant);
    if (!r) return null;
    return { el: PX.upscale(r.canvas), time: r.time, light: PX.SPRITE_LIGHT[r.lightName] || PX.SPRITE_LIGHT.day, lightName: r.lightName };
  };
  /* characters: def.draw(s, o) draws into a 118×176 transparent surface; o.expr, o.blink, o.outfit */
  PX.drawChar = function (id, expr, o = {}) {
    const def = ART.chars[id];
    if (!def) return null;
    const key = 'ch|' + id + '|' + (expr || 'neutral') + '|' + (o.blink ? 1 : 0) + '|' + (o.outfit || '') + '|' + (o.flip ? 1 : 0);
    if (cache.has(key)) return cache.get(key);
    const oo = { expr: expr || 'neutral', blink: !!o.blink, outfit: o.outfit || null, flip: !!o.flip, rng: PX.rng('char:' + id), W: PX.SW, H: PX.SH };
    const s = new Surf(PX.SW, PX.SH, oo);
    try { def.draw(s, oo); } catch (e) { console.error('px char error', id, e); }
    let out = s;
    if (oo.flip) { out = new Surf(PX.SW, PX.SH, oo); out.stamp(s, 0, 0, { flip: true }); if (def.decal) def.decal(out, oo); }
    else if (def.decal) def.decal(out, oo);
    return remember(key, out.compose('none'));
  };
  PX.renderChar = function (id, expr, o = {}) {
    const open = PX.drawChar(id, expr, o);
    if (!open) return null;
    const def = ART.chars[id];
    const closed = def.noBlink ? null : PX.drawChar(id, expr, Object.assign({}, o, { blink: true }));
    return { open: PX.upscale(open), closed: closed ? PX.upscale(closed) : null };
  };
  /* head-and-shoulders crop for the dialogue box and notebook */
  PX.renderPortrait = function (id, expr, size) {
    const full = PX.drawChar(id, expr, {});
    if (!full) return null;
    const def = ART.chars[id];
    const box = def.portraitBox || [25, 4, 68, 68];
    const c = document.createElement('canvas');
    c.width = box[2]; c.height = box[3];
    c.getContext('2d').drawImage(full, box[0], box[1], box[2], box[3], 0, 0, box[2], box[3]);
    return PX.upscale(c, size || 4);
  };
})();
