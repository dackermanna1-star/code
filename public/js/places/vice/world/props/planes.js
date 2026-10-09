// Procedural airliners for the apron: a fuselage of rings (rounded nose,
// tail cone sweeping up), swept wings with winglets, a tailplane, a fin in the
// airline's colours, engines on pylons, landing gear, a cheatline and a band
// of windows that light up at night. Local space: nose towards +z, wheels on
// y = 0, centred on the wing root.
import { L, tint, shade, cylAB } from './kit.js';
import { frame } from './beach.js';

export const LIVERIES = [
  { name: 'Vice Air', body: 0xfbfbf8, belly: 0xc9ccd2, tail: 0xff3f8e, stripe: 0x1fc7c1, engine: 0xff3f8e },
  { name: 'Sunshine Airways', body: 0xfbfbf8, belly: 0xd7d9dd, tail: 0xff8a1c, stripe: 0xffc21a, engine: 0xfbfbf8 },
  { name: 'Atlantic', body: 0xf4f6fa, belly: 0x1d3f7a, tail: 0x1d3f7a, stripe: 0x1d3f7a, engine: 0x1d3f7a },
  { name: 'Flamingo Express', body: 0xffe3ee, belly: 0xffffff, tail: 0xf25c9b, stripe: 0xf25c9b, engine: 0xffffff },
  { name: 'Teal Jet', body: 0xfbfbf8, belly: 0xbfc4ca, tail: 0x0f9b8e, stripe: 0x0f9b8e, engine: 0x0f9b8e },
  { name: 'Vice Cargo', body: 0xfbfbf8, belly: 0xa9adb3, tail: 0x6b3e26, stripe: 0xe0a33a, engine: 0xbfc4ca },
];
export const TYPES = {
  narrow: { L: 122, R: 6.2, span: 112, fin: 30, eng: [17], er: 3.4, gear: 7.5 },
  wide: { L: 188, R: 9.2, span: 186, fin: 42, eng: [30], er: 5.6, gear: 9.5 },
  jumbo: { L: 210, R: 10, span: 200, fin: 46, eng: [30, 56], er: 4.4, gear: 10 },
};

/** Writes a plane into g (surface) and gw (windows) at (x, y, z) facing heading h. */
export function airliner(g, gw, x, y, z, h, type, liv) {
  const T = TYPES[type], F = frame(g, x, y, z, h), FW = frame(gw, x, y, z, h);
  const K = 1.12;
  const cBody = tint(liv.body, K), cBelly = tint(liv.belly, K), cTail = tint(liv.tail, K), cStripe = tint(liv.stripe, K), cEng = tint(liv.engine, K);
  const grey = [0.72, 0.74, 0.77], dark = [0.16, 0.17, 0.19];
  const R = T.R, Lf = T.L, cy = T.gear + R; // fuselage centre height
  const SEG = 14, z0 = -Lf * 0.52, z1 = Lf * 0.48;
  // rings: radius and centre height along the length (nose rounded, tail cone sweeping up)
  const rings = [];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const t = i / N, zz = z1 - t * (z1 - z0); // from the nose back
    let r = R, yc = cy;
    if (t < 0.12) { const u = t / 0.12; r = R * Math.sqrt(1 - (1 - u) * (1 - u)) * (0.15 + 0.85 * u) + 0.2; yc = cy - (1 - u) * R * 0.25; }
    else if (t > 0.72) { const u = (t - 0.72) / 0.28; r = R * (1 - u * 0.85); yc = cy + u * R * 0.7; }
    rings.push({ z: zz, r: Math.max(0.3, r), yc });
  }
  const colAt = (a) => { const s = Math.sin(a); return s < -0.3 ? cBelly : cBody; }; // a: angle round the ring, sin = up
  smoothTube(g, x, y, z, h, rings.map((q) => ({ c: [0, q.yc, q.z], r: q.r })), SEG, { lay: L.stucco, scale: 8, rough: 0.35 }, colAt);
  // the cheatline and the windows, down both sides of the cabin
  const w0 = rings[3].z, w1 = rings[15].z;
  for (const sx of [-1, 1]) {
    const za = sx > 0 ? w0 : w1, zb = sx > 0 ? w1 : w0;
    F.quad([sx * (R + 0.05), cy - 1.6, za], [sx * (R + 0.05), cy - 1.6, zb], [sx * (R + 0.05), cy - 0.6, zb], [sx * (R + 0.05), cy - 0.6, za], { lay: L.stucco, tint: cStripe });
    FW.quad([sx * (R + 0.07), cy + 0.6, za], [sx * (R + 0.07), cy + 0.6, zb], [sx * (R + 0.07), cy + 1.7, zb], [sx * (R + 0.07), cy + 1.7, za], { lay: L.whiteTiles, tint: [0.08, 0.1, 0.13], rough: 0.1, glow: 0.85 });
    // the cockpit windows
    const cz = rings[1].z - 1.2, cr = rings[2].r;
    const cw = [[sx * cr * 0.55, cy + cr * 0.55, cz + 1.4], [sx * cr * 0.95, cy + cr * 0.2, cz - 1.2], [sx * cr * 0.92, cy + cr * 0.45, cz - 1.6], [sx * cr * 0.5, cy + cr * 0.78, cz + 0.6]];
    if (sx < 0) cw.reverse();
    FW.quad(cw[0], cw[1], cw[2], cw[3], { lay: L.whiteTiles, tint: [0.05, 0.07, 0.1], rough: 0.05, glow: 0.3 });
  }
  // wings: swept, with a little dihedral and winglets
  const span = T.span / 2, rc = Lf * 0.22, tc = Lf * 0.06, sweep = 0.48, zr = rc * 0.45, wy = cy - R * 0.55;
  for (const sx of [-1, 1]) {
    const tipY = wy + span * 0.08, tipZf = zr - span * sweep, tipZb = tipZf - tc;
    const rf = [sx * R * 0.8, wy, zr], rb = [sx * R * 0.8, wy, zr - rc], tf = [sx * span, tipY, tipZf], tb = [sx * span, tipY, tipZb];
    const th = 1.0;
    const up = (p, d) => [p[0], p[1] + d, p[2]];
    const q = (a, b, c, d, o) => (sx > 0 ? F.quad(a, b, c, d, o) : F.quad(d, c, b, a, o));
    q(up(rf, th), up(tf, th * 0.4), up(tb, th * 0.4), up(rb, th), { lay: L.stucco, tint: grey, scale: 10, rough: 0.4 });
    q(rb, tb, tf, rf, { lay: L.stucco, tint: shade(grey, 0.85), scale: 10 });
    q(rf, tf, up(tf, th * 0.4), up(rf, th), { lay: L.stucco, tint: grey });
    q(up(rb, th), up(tb, th * 0.4), tb, rb, { lay: L.stucco, tint: grey });
    // winglet
    q([tf[0], tipY + 0.4, tipZf], [tb[0], tipY + 0.4, tipZb], [tb[0] + sx * 0.6, tipY + 8, tipZb - 3], [tf[0] + sx * 0.6, tipY + 8, tipZf - 6], { lay: L.stucco, tint: cTail });
    q([tf[0] + sx * 0.6, tipY + 8, tipZf - 6], [tb[0] + sx * 0.6, tipY + 8, tipZb - 3], [tb[0], tipY + 0.4, tipZb], [tf[0], tipY + 0.4, tipZf], { lay: L.stucco, tint: cTail });
    // engines on pylons under the wing
    for (const ex of T.eng) {
      const t = ex / span, ez = zr - ex * sweep + T.er * 1.6, ey = wy + ex * 0.08 - T.er - 1.4, el = T.er * 4.4;
      smoothTube(g, x, y, z, h, [{ c: [sx * ex, ey, ez + el * 0.55], r: T.er * 0.92 }, { c: [sx * ex, ey, ez + el * 0.42], r: T.er }, { c: [sx * ex, ey, ez - el * 0.2], r: T.er * 0.92 }, { c: [sx * ex, ey, ez - el * 0.45], r: T.er * 0.72 }], 14, { lay: L.stucco, scale: 6, rough: 0.35 }, () => cEng);
      // the intake: a dark disc just inside the lip, with a spinner
      const iz = ez + el * 0.5;
      for (let k = 0; k < 14; k++) {
        const a0 = (k / 14) * Math.PI * 2, a1 = ((k + 1) / 14) * Math.PI * 2, rr = T.er * 0.86;
        F.quad([sx * ex, ey, iz], [sx * ex, ey, iz], [sx * ex + Math.cos(a1) * rr, ey + Math.sin(a1) * rr, iz], [sx * ex + Math.cos(a0) * rr, ey + Math.sin(a0) * rr, iz], { lay: L.concrete, tint: dark, normal: [0, 0, 1] });
      }
      F.tube([sx * ex, ey, iz], [sx * ex, ey, iz + T.er * 0.5], T.er * 0.25, 0.05, 6, { lay: L.concrete, tint: [0.5, 0.52, 0.55] });
      F.tube([sx * ex, ey, ez - el * 0.45], [sx * ex, ey, ez - el * 0.45 - T.er * 1.2], T.er * 0.5, 0.2, 8, { lay: L.concrete, tint: [0.35, 0.33, 0.32] });
      F.box(sx * ex, ey + T.er + 0.8, ez - el * 0.2, 0.6, 1.1, el * 0.35, { lay: L.stucco, tint: grey });
      void t;
    }
    // main gear
    const gx = sx * R * 0.9, gz = zr - rc * 0.55;
    F.box(gx, (wy + 2) / 2, gz, 0.5, (wy - 2) / 2, 0.5, { lay: L.concrete, tint: dark });
    for (const dz of [-1.6, 1.6]) F.tube([gx - 1.2, 1.9, gz + dz], [gx + 1.2, 1.9, gz + dz], 1.9, 1.9, 8, { lay: L.concrete, tint: [0.08, 0.08, 0.09] });
  }
  // nose gear
  const nz = rings[3].z;
  F.box(0, (cy - R * 0.7) / 2 + 0.5, nz, 0.35, (cy - R * 0.7) / 2, 0.35, { lay: L.concrete, tint: dark });
  F.tube([-0.9, 1.3, nz], [0.9, 1.3, nz], 1.3, 1.3, 8, { lay: L.concrete, tint: [0.08, 0.08, 0.09] });
  // tailplane
  const tz = rings[N - 3].z + 2, ty = rings[N - 3].yc, ts = T.span * 0.17, trc = Lf * 0.12;
  for (const sx of [-1, 1]) {
    const q = (a, b, c, d, o) => (sx > 0 ? F.quad(a, b, c, d, o) : F.quad(d, c, b, a, o));
    const rf = [sx * 2, ty, tz], rb = [sx * 2, ty, tz - trc], tf = [sx * ts, ty + 1.5, tz - ts * 0.75], tb = [sx * ts, ty + 1.5, tz - ts * 0.75 - trc * 0.4];
    q([rf[0], rf[1] + 0.6, rf[2]], [tf[0], tf[1] + 0.3, tf[2]], [tb[0], tb[1] + 0.3, tb[2]], [rb[0], rb[1] + 0.6, rb[2]], { lay: L.stucco, tint: grey });
    q(rb, tb, tf, rf, { lay: L.stucco, tint: shade(grey, 0.85) });
  }
  // the fin, in the airline's colour
  const fz0 = rings[N - 6].z, fy0 = rings[N - 6].yc + rings[N - 6].r * 0.7, fh = T.fin, frc = Lf * 0.2;
  const fA = [0, fy0, fz0], fB = [0, fy0, fz0 - frc], fC = [0, fy0 + fh, fz0 - frc - fh * 0.62], fD = [0, fy0 + fh, fz0 - fh * 0.62 - frc * 0.35];
  for (const sx of [-1, 1]) {
    const o = (p) => [sx * 0.7, p[1], p[2]];
    const q = (a, b, c, d, op) => (sx > 0 ? F.quad(a, b, c, d, op) : F.quad(d, c, b, a, op));
    q(o(fB), o(fC), o(fD), o(fA), { lay: L.stucco, tint: cTail, scale: 10 });
    // a stripe across the fin
    q([sx * 0.75, fy0 + fh * 0.35, fz0 - frc - fh * 0.217 + 0.4], [sx * 0.75, fy0 + fh * 0.5, fz0 - frc - fh * 0.31], [sx * 0.75, fy0 + fh * 0.5, fz0 - fh * 0.31 - frc * 0.175 + 2], [sx * 0.75, fy0 + fh * 0.35, fz0 - fh * 0.217 + 2.4], { lay: L.stucco, tint: cStripe });
  }
  F.quad([0.7, fy0 + fh, fz0 - fh * 0.62 - frc * 0.35], [-0.7, fy0 + fh, fz0 - fh * 0.62 - frc * 0.35], [-0.7, fy0 + fh, fz0 - frc - fh * 0.62], [0.7, fy0 + fh, fz0 - frc - fh * 0.62], { lay: L.stucco, tint: cTail });
  // beacon lights: red on the belly and the fin top (glow at night)
  F.box(0, fy0 + fh + 0.4, fz0 - frc * 0.5 - fh * 0.62, 0.35, 0.35, 0.35, { lay: L.whiteTiles, tint: [1, 0.15, 0.1], glow: 1 });
  return { len: Lf, span: T.span, h: fy0 + fh, cy, R };
}

/** A smooth tube through ring centres (local, along the plane's frame) with radial normals; col(angle) per vertex. */
function smoothTube(g, x, y, z, h, rings, seg, o, col) {
  const c = Math.cos(h), s = Math.sin(h), base = g.count, sc = 1 / (o.scale || 8);
  for (let i = 0; i < rings.length; i++) {
    const R = rings[i];
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, nx = Math.cos(a), ny = Math.sin(a);
      const lx = R.c[0] + nx * R.r, ly = R.c[1] + ny * R.r, lz = R.c[2];
      const t = col(a);
      g.vert(x + lx * c + lz * s, y + ly, z - lx * s + lz * c, nx * c, ny, -nx * s, (j / seg) * R.r * 6.28 * sc, lz * sc, o.lay, o.rough ?? 0.5, 0, t[0], t[1], t[2], null);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < seg; j++) {
    const a = base + i * (seg + 1) + j, b = a + 1, d = a + seg + 1, e = d + 1;
    g.idx.push(a, d, b, b, d, e); // rings run nose to tail (decreasing z): this winding faces out
  }
}
