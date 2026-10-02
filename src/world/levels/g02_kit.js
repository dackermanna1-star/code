// Helpers shared by the levels of group 02 (pipes, tunnels, machinery). World side only.
import { defineProp, propMat as S } from '../props.js';
import { pnoise } from '../../gfx/texgen.js';
import { hr, cbox, owns, levelDoor } from './kit.js';

export const TAU = Math.PI * 2;

// floor division / positive modulo for absolute (possibly negative) coordinates
export const fdiv = (a, n) => Math.floor(a / n);
export const pmod = (a, n) => ((a % n) + n) % n;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// pick from a list with a coordinate hash
export const hpick = (list, a, b, salt) => list[Math.floor(hr(a, b, salt) * list.length) % list.length];

const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mulc = (c, m) => [c[0] * m, c[1] * m, c[2] * m];
export { mixc, mulc };

// Texture painter for pipe skins (for defineTexture): a bright streak and a dark streak around
// the circumference, a bolted joint band at v = 0, rust and drips.
export function pipeSkin(base, rustAmt = 0.4, rust = [150, 70, 30]) {
  return (p, r) => {
    p.fill(base);
    p.map((x, y, c) => {
      const u = x / 64;
      const hl = 0.7 + 0.45 * Math.exp(-Math.pow((u - 0.32) * 7, 2)) - 0.3 * Math.exp(-Math.pow((u - 0.82) * 6, 2));
      const n = pnoise(x, y, 6, 7);
      const rs = n > 0.56 ? Math.min(1, (n - 0.56) * 5) * rustAmt : 0;
      return mulc(mixc(c, rust, rs), hl);
    });
    p.grain(0.05);
    p.rect(0, 0, 64, 5, mulc(base, 0.55));
    p.rect(0, 5, 64, 1, mulc(base, 1.25), 0.7);
    for (let x = 4; x < 64; x += 10) p.disc(x, 2.5, 1.1, mulc(base, 1.35));
    for (let i = 0; i < 3; i++) p.drip(r.int(0, 63), r.int(8, 40), r.int(10, 24), [30, 18, 14], 0.35, 1);
  };
}

// A generic prop made of straight rods: opts.segs = [[ax, ay, az, bx, by, bz, r, sides, matName, caps]],
// optional opts.boxes (collision, local coordinates).
defineProp('g02_rods', {
  build(mb, p) {
    for (const s of p.opts.segs) mb.rod(s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7] || 6, S(s[8] || 'metal_dark'), !!s[9]);
  },
  boxes: (p) => p.opts.boxes || null,
});

// Place a level door inside the zone only (doors are recorded for the phone by the zone that owns them).
export function placeDoor(zb, x, z, rot, opts) {
  if (!zb.in(Math.floor(x), Math.floor(z))) return null;
  return levelDoor(zb, x, z, rot, opts);
}

// Rotation of a door standing against a wall whose front should face the given direction.
export const DOOR_ROT = { S: Math.PI, N: 0, E: -Math.PI / 2, W: Math.PI / 2 };   // facing +z, -z, +x, -x ... see doorFacing
// front of a door with rotation rot faces (sin rot, -cos rot)
export const doorFacing = (dx, dz) => Math.atan2(dx, -dz);

// -------------------------------------------------------------------- script helpers (game thread)

// Level zones have no event table of their own, so the building's generic ambient events (a
// ringing phone, a falling ceiling tile) must not fire here: keep that timer from running out.
export function quiet(ctx) {
  const e = ctx.game.events;
  if (e && e.timer < 60) e.timer = 60;
}

const rnd = (a, b) => a + Math.random() * (b - a);

// Scripted distant sounds: list of { snd, every: [lo, hi] s, dist: [lo, hi] m, vol: [lo, hi], y, first }
export function ambientEvents(ctx, dt, list) {
  const st = ctx.state.g02ev || (ctx.state.g02ev = {});
  const p = ctx.player;
  for (let k = 0; k < list.length; k++) {
    const e = list[k];
    let t = st[k];
    if (t === undefined) t = e.first ?? rnd(e.every[0], e.every[1]) * 0.5;
    t -= dt;
    if (t <= 0) {
      t = rnd(e.every[0], e.every[1]);
      const a = Math.random() * TAU, d = rnd(e.dist[0], e.dist[1]);
      const v = e.vol ? rnd(e.vol[0], e.vol[1]) : 1;
      ctx.game.audioCall('play', e.snd, p.x + Math.sin(a) * d, p.y + (e.y ?? 1.5), p.z - Math.cos(a) * d, { distant: d > (e.near ?? 18), vol: v });
      if (e.then) e.then(ctx, a, d);
    }
    st[k] = t;
  }
}

// Take over flicker channels for a level: fn(flicker, time) runs right after the engine has
// animated them each frame, only while the player is on that level.
export function flickerHook(ctx, levelN, fn) {
  const f = ctx.game.flicker;
  f.g02hook = { n: levelN, fn, game: ctx.game };
  if (f.g02wrapped) return;
  f.g02wrapped = true;
  const orig = f.update.bind(f);
  f.update = (t) => {
    orig(t);
    const h = f.g02hook;
    if (h && h.game.levelN === h.n) h.fn(f, t);
  };
}

// seconds the player has spent on a level in this visit, from a script (a gap in the calls
// means the player left and came back: the clock starts over)
export function levelClock(ctx, dt) {
  const st = ctx.state;
  if (st.lastT === undefined || ctx.time - st.lastT > 1.5) st.clock = 0;
  st.lastT = ctx.time;
  st.clock = (st.clock || 0) + dt;
  return st.clock;
}

export { hr, cbox, owns, levelDoor };
