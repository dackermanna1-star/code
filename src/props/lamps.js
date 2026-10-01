// Light fixtures. Each returns the housing as `model` and the glowing parts (bulb, lens,
// tubes) as separate parts with emissive: true (class EMISSIVE, warm colours) so the world can
// drive their intensity. meta.anchors.light = light position, meta.anchors.lightDir = unit
// direction, meta.lightColor = suggested colour (hex). Wall lamps: origin on the wall surface,
// bottom centre of the mounting plate; they extend toward +Z.
import {
  VB, mat, V, MCLS, VS_FINE, VS_MED, rgbMul, rgbMix, rgbJitter, valueNoise2, valueNoise3, clamp,
  recolor, grime, mottle, rust, streaks, chips, vrand, emptyModel, rot, xform, lathe, latheZ, torusZ, torusY, TAU, crop,
} from './kit.js';

const norm = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};

/** Small emissive glass shape helper: returns a model of an ellipsoid bulb. */
function bulbModel(vs, rx, ry, rz, color, name = 'bulb') {
  const nx = Math.ceil(rx * 2 + 2), ny = Math.ceil(ry * 2 + 2), nz = Math.ceil(rz * 2 + 2);
  const b = new VB(nx, ny, nz, vs, 'center');
  const m = mat.emissive(b.P, name, color);
  b.g.ellipsoid(nx / 2, ny / 2, nz / 2, rx, ry, rz, m);
  return b.model();
}

/**
 * Caged jelly-jar / bulb guard light: round cast base on the wall, neck, glass globe tilted
 * down inside a wire cage. opts: tilt (rad, default ~0.6), color 'black'|'grey'|'white'|'rust'.
 */
export function cageLamp(rng, opts = {}) {
  const vs = VS_FINE;
  const tilt = opts.tilt ?? rng.range(0.45, 0.8);
  const colors = { black: [34, 34, 36], grey: [110, 112, 112], white: [190, 188, 180], rust: [90, 54, 34] };
  const ck = opts.color ?? rng.pick(Object.keys(colors));
  const b = new VB(12, 12, 8, vs, 'wall');
  const P = b.P;
  const cast = mat.paint(P, 'cast', rgbJitter(rng, colors[ck], 0.05), { cls: MCLS.GENERIC, rough: 0.6, metal: 0.4 });
  // round base plate + junction box boss + neck
  latheZ(b, 6, 6, 0, 2, () => [5.8, -1], cast);
  latheZ(b, 6, 6, 2, 5, () => [3.6, -1], cast);
  latheZ(b, 6, 6, 5, 8, () => [2.2, -1], cast);
  rust(b, [cast], { amount: 0.4, seed: rng.int(1, 1e5), bottom: 2, edges: true });
  // globe assembly as a tilted part: cage + glass (emissive)
  const cb = new VB(14, 14, 18, vs, [-7 * vs, -7 * vs, 0]);
  const cageM = mat.paint(cb.P, 'cage', rgbMul(colors[ck], 0.9), { cls: MCLS.WIRE, rough: 0.5, metal: 0.5 });
  latheZ(cb, 7, 7, 0, 3, () => [4.2, 2.6], cageM); // threaded collar
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.4;
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const z = 3 + t * 13.5;
      const r = 5.6 * Math.sin(Math.PI * (0.15 + 0.7 * t)) + 0.4;
      pts.push([7 + Math.cos(a) * r, 7 + Math.sin(a) * r, z]);
    }
    for (let i = 0; i + 1 < pts.length; i++) cb.g.line(...pts[i], ...pts[i + 1], 0.55, cageM);
  }
  torusZ(cb, 7, 7, 9, 5.7, 0.55, cageM);
  latheZ(cb, 7, 7, 15.5, 17, () => [1.6, -1], cageM);
  const parts = [];
  const neckEnd = [0, 6 * vs, 8 * vs];
  const r = rot(['x', tilt]);
  parts.push({ name: 'cage', model: cb.model(), position: neckEnd, rotation: r });
  const bulbColor = opts.bulbColor ?? rng.pick([[255, 214, 160], [255, 200, 140], [255, 226, 190]]);
  const bulb = bulbModel(vs, 3.8, 3.8, 5.2, bulbColor);
  const bulbCenterLocal = [0, 0, 9 * vs];
  const bulbPos = xform(bulbCenterLocal, neckEnd, r);
  parts.push({ name: 'bulb', model: bulb, position: bulbPos, rotation: r, emissive: true });
  const dir = norm(xform([0, 0, 1], [0, 0, 0], r));
  return {
    model: b.model(),
    parts,
    meta: {
      size: [0.16, 0.2, 0.25], mount: 'wall', kind: 'cageLamp', previewY: 2.3,
      anchors: { light: bulbPos, lightDir: norm([dir[0], dir[1] - 0.6, dir[2]]) }, lightColor: 0xffb46a,
    },
  };
}

/**
 * Industrial RLM gooseneck lamp: wall plate, curved pipe arm (~reach out), enamel dome shade
 * (dark outside, white inside) with a bulb. opts: reach (m, default 0.6), shadeColor [r,g,b],
 * shadeDia (m). Origin: wall surface, bottom centre of the mounting plate.
 */
export function rlmLamp(rng, opts = {}) {
  const vs = VS_FINE;
  const reach = opts.reach ?? 0.6;
  const shadeR = (opts.shadeDia ?? rng.range(0.36, 0.42)) / 2 / vs;
  const R = reach / vs;
  const armRise = 0.24 / vs;
  const plateY = 12;
  const nz = Math.ceil(R + shadeR + 4), ny = Math.ceil(plateY + armRise + 20), nx = Math.ceil(shadeR * 2 + 6);
  const b = new VB(nx, ny, nz, vs, 'corner');
  const P = b.P;
  const outer = opts.shadeColor ?? rng.pick([[30, 50, 40], [26, 26, 28], [40, 44, 52], [60, 40, 30]]);
  const steel = mat.paint(P, 'arm', rgbJitter(rng, rgbMul(outer, 1.05), 0.05), { cls: MCLS.GENERIC, rough: 0.55, metal: 0.5 });
  const enamel = mat.paint(P, 'enamel', rgbJitter(rng, outer, 0.05), { cls: MCLS.GENERIC, rough: 0.3, metal: 0.2 });
  const white = mat.paint(P, 'inner', [214, 212, 200], { cls: MCLS.GENERIC, rough: 0.35, metal: 0 });
  const socket = mat.steel(P, 'socket', [60, 58, 54]);
  const cx = nx / 2;
  // wall plate (round flange) + arm out of the plate
  latheZ(b, cx, plateY, 0, 2, () => [6.5, -1], steel);
  latheZ(b, cx, plateY, 2, 4, () => [3, -1], steel);
  // gooseneck: semicircle up and over toward the shade
  const zc = 4 + (R - 4) / 2, rr = (R - 4) / 2;
  let prev = [cx, plateY, 4];
  const shadeTopY = plateY + 2;
  for (let i = 1; i <= 24; i++) {
    const a = Math.PI - (i / 24) * Math.PI;
    const p = [cx, plateY + Math.sin(a) * Math.min(rr, armRise), zc + Math.cos(a) * rr];
    b.g.line(...prev, ...p, 1.25, steel);
    prev = p;
  }
  b.g.line(...prev, cx, shadeTopY + 4, R, 1.25, steel);
  // shade: dome around a vertical axis at z = R, opening downward. Voxels touching the air
  // under the dome are white enamel, voxels touching the outside air are the shade colour.
  const sy0 = shadeTopY - 12; // rim height
  const topY = shadeTopY + 4;
  const rOut = (y) => {
    const t = (y - sy0) / (topY - sy0);
    if (t > 0.86) return 2.6;
    return shadeR * (1 - 0.82 * Math.pow(t, 1.6)) + (t < 0.08 ? 1 : 0);
  };
  const tmp = mat.generic(P, 'tmp', [255, 0, 255]);
  lathe(b, cx, R, sy0, topY, (y) => {
    const t = (y - sy0) / (topY - sy0);
    return t > 0.86 ? [2.6, -1] : [rOut(y), rOut(y) - 2.2];
  }, (x, y, z) => ((y - sy0) / (topY - sy0) > 0.86 ? socket : tmp));
  const interiorAir = (x, y, z) => {
    if (y < sy0 || y >= topY) return false;
    const d = Math.hypot(x + 0.5 - cx, z + 0.5 - R);
    return d < rOut(y + 0.5) - 1.5;
  };
  const recol = [];
  b.g.forEach((v, x, y, z) => {
    if (v !== tmp) return;
    let inner = false;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      if (!b.get(x + dx, y + dy, z + dz) && interiorAir(x + dx, y + dy, z + dz)) inner = true;
    }
    recol.push(x, y, z, inner ? white : enamel);
  });
  for (let i = 0; i < recol.length; i += 4) b.set(recol[i], recol[i + 1], recol[i + 2], recol[i + 3]);
  // chipped enamel + rust at the rim, dirt on top
  chips(b, rng, [enamel], { density: 0.006, kinds: ['bare', 'bare', 'rust'] });
  rust(b, [steel], { amount: 0.35, seed: rng.int(1, 1e5), bottom: 0, edges: true });
  streaks(b, rng, [enamel], { count: 4, len: [2, 6], kind: 'rust', t: 0.4 });
  const parts = [];
  const bulb = bulbModel(vs, 3.4, 4.2, 3.4, opts.bulbColor ?? [255, 212, 150]);
  b.setMount([-cx * vs, -(plateY - 6) * vs, 0]);
  const bulbPos = [0, b.my(sy0 + 4.5), b.mz(R)];
  parts.push({ name: 'bulb', model: bulb, position: bulbPos, rotation: [0, 0, 0], emissive: true });
  return {
    model: b.model(),
    parts,
    meta: {
      size: b.sizeM(), mount: 'wall', kind: 'rlmLamp', previewY: 2.2,
      anchors: { light: [0, bulbPos[1] - 0.04, bulbPos[2]], lightDir: [0, -1, 0] }, lightColor: 0xffc27a, reach,
    },
  };
}

/**
 * Sodium wall pack: die-cast box with cooling fins and a prismatic lens (emissive part).
 * opts: color [r,g,b], lens 'sodium'|'white'. Origin: wall surface, bottom centre.
 */
export function wallPack(rng, opts = {}) {
  const vs = VS_FINE;
  const W = 24, H = 17, D = 15;
  const b = new VB(W + 2, H + 4, D + 2, vs, 'wall');
  const P = b.P;
  const cast = mat.paint(P, 'cast', opts.color ?? rgbJitter(rng, rng.pick([[54, 44, 36], [40, 40, 42], [80, 80, 78]]), 0.05), { cls: MCLS.GENERIC, rough: 0.55, metal: 0.4 });
  const x0 = 1;
  // back box + sloped front: top half solid, lower front is the lens frame
  for (let z = 0; z < D; z++) {
    const top = H - Math.max(0, z - D * 0.55) * 0.9;
    b.box(x0, 0, z, x0 + W, Math.round(top), z + 1, cast);
  }
  // fins on top
  for (let x = x0 + 2; x < x0 + W - 2; x += 3) b.box(x, H, 1, x + 1, H + 2, D - 6, cast);
  // lens recess (cleared) on the front-bottom
  b.box(x0 + 2, 1, D - 1, x0 + W - 2, 9, D, 0);
  b.box(x0 + 2, 0, 4, x0 + W - 2, 1, D - 1, 0);
  // conduit hub on top
  b.box(Math.round(x0 + W / 2) - 1, H, 0, Math.round(x0 + W / 2) + 2, H + 4, 3, cast);
  grime(b, [cast], { h: 6, amount: 0.3, seed: 3 });
  streaks(b, rng, [cast], { count: 3, len: [3, 8], kind: 'dirt' });
  // lens: prismatic glass, front + underside (emissive part)
  const lb = new VB(W - 4, 9, D - 4, vs, 'corner');
  const lensCol = opts.lens === 'white' ? [255, 236, 210] : [255, 168, 80];
  const lens = mat.emissive(lb.P, 'lens', lensCol);
  const lensD = mat.emissive(lb.P, 'lensRib', rgbMul(lensCol, 0.82));
  lb.box(0, 0, D - 5, W - 4, 8, D - 4, lens);
  lb.box(0, 0, 0, W - 4, 1, D - 4, lens);
  for (let x = 0; x < W - 4; x += 2) {
    lb.box(x, 0, D - 5, x + 1, 8, D - 4, lensD);
    lb.box(x, 0, 0, x + 1, 1, D - 4, lensD);
  }
  const lm = lb.model([0, 0, 0]);
  const origin = b.origin;
  const lpos = [origin[0] + (x0 + 2) * vs, 0, 4 * vs];
  lm.origin = [0, 0, 0];
  return {
    model: b.model(),
    parts: [{ name: 'lens', model: lm, position: lpos, rotation: [0, 0, 0], emissive: true }],
    meta: {
      size: b.sizeM(), mount: 'wall', kind: 'wallPack', previewY: 2.5,
      anchors: { light: [0, 0.03, (D - 3) * vs], lightDir: norm([0, -0.75, 0.66]) }, lightColor: opts.lens === 'white' ? 0xffe0c0 : 0xff9a40,
    },
  };
}

/**
 * Oval cast bulkhead light with ribbed glass (emissive) behind an eyelid cage.
 * opts: color 'black'|'white'|'grey'|'green'. Origin: wall surface, bottom centre.
 */
export function bulkhead(rng, opts = {}) {
  const vs = VS_FINE;
  const colors = { black: [34, 34, 36], white: [196, 194, 186], grey: [120, 122, 120], green: [44, 66, 52] };
  const ck = opts.color ?? rng.pick(Object.keys(colors));
  const W = 22, H = 15;
  const b = new VB(W + 2, H + 2, 8, vs, 'wall');
  const P = b.P;
  const cast = mat.paint(P, 'cast', rgbJitter(rng, colors[ck], 0.04), { cls: MCLS.GENERIC, rough: 0.5, metal: 0.4 });
  const cx = (W + 2) / 2, cy = (H + 2) / 2;
  const inOval = (x, y, sx, sy) => ((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2 < 1;
  for (let y = 0; y < H + 2; y++)
    for (let x = 0; x < W + 2; x++) {
      if (!inOval(x + 0.5, y + 0.5, W / 2, H / 2)) continue;
      const ring = !inOval(x + 0.5, y + 0.5, W / 2 - 2, H / 2 - 2);
      b.box(x, y, 0, x + 1, y + 1, ring ? 5 : 2, cast);
    }
  // eyelid cage bars across the glass
  for (const dy of [-3, 0, 3]) b.box(Math.round(cx - W / 2 + 3), Math.round(cy + dy), 6, Math.round(cx + W / 2 - 3), Math.round(cy + dy) + 1, 7, cast);
  for (const dx of [-W / 2 + 3, W / 2 - 4]) b.box(Math.round(cx + dx), Math.round(cy - 4), 5, Math.round(cx + dx) + 1, Math.round(cy + 5), 7, cast);
  if (ck !== 'black') chips(b, rng, [cast], { density: 0.02, kinds: ['rust', 'bare'] });
  rust(b, [cast], { amount: 0.3, seed: rng.int(1, 1e5), bottom: 1, edges: true });
  // glass dome: emissive, ribbed (alternating tone)
  const gb = new VB(W - 2, H - 2, 4, vs, 'corner');
  const g1 = mat.emissive(gb.P, 'glass', opts.bulbColor ?? [255, 218, 170]);
  const g2 = mat.emissive(gb.P, 'rib', [236, 196, 150]);
  for (let y = 0; y < H - 2; y++)
    for (let x = 0; x < W - 2; x++) {
      const dx = (x + 0.5 - (W - 2) / 2) / ((W - 4) / 2), dy = (y + 0.5 - (H - 2) / 2) / ((H - 4) / 2);
      const r = dx * dx + dy * dy;
      if (r >= 1) continue;
      const h = Math.round((1 - r) * 3);
      for (let z = 0; z <= h; z++) gb.set(x, y, z, x % 2 ? g1 : g2);
    }
  const gm = gb.model([0, 0, 0]);
  const gpos = [b.origin[0] + 2 * vs, 2 * vs, 2 * vs];
  return {
    model: b.model(),
    parts: [{ name: 'glass', model: gm, position: gpos, rotation: [0, 0, 0], emissive: true }],
    meta: {
      size: b.sizeM(), mount: 'wall', kind: 'bulkhead', previewY: 2.3,
      anchors: { light: [0, cy * vs, 6 * vs], lightDir: norm([0, -0.5, 0.86]) }, lightColor: 0xffd9a8,
    },
  };
}

/**
 * Old 4 ft two-tube fluorescent strip with a cracked wraparound diffuser; tubes visible through
 * missing chunks. Emissive parts: tubes (bright) and diffuser (dimmer glow).
 * opts: length (m, 1.2), cracked (bool). Origin: wall surface, bottom centre.
 */
export function fluoroFixture(rng, opts = {}) {
  const vs = VS_FINE;
  const L = Math.round((opts.length ?? 1.22) / vs);
  const b = new VB(L + 2, 9, 10, vs, 'wall');
  const P = b.P;
  const housing = mat.paint(P, 'housing', rgbJitter(rng, [186, 184, 176], 0.04), { cls: MCLS.GENERIC, rough: 0.5, metal: 0.3 });
  const endcap = mat.plastic(P, 'endcap', [60, 60, 60]);
  // channel + end caps
  b.box(1, 1, 0, L + 1, 8, 3, housing);
  b.box(0, 0, 0, 3, 9, 9, endcap);
  b.box(L - 1, 0, 0, L + 2, 9, 9, endcap);
  rust(b, [housing], { amount: 0.3, seed: rng.int(1, 1e5), bottom: 0, edges: true });
  streaks(b, rng, [housing], { count: 3, len: [2, 5], kind: 'dirt' });
  // tubes (emissive)
  const tb = new VB(L - 4, 7, 4, vs, 'corner');
  const tubeC = opts.tubeColor ?? [224, 246, 228];
  const tube = mat.emissive(tb.P, 'tube', tubeC);
  const tubeEnd = mat.emissive(tb.P, 'tubeEnd', rgbMul(tubeC, 0.55));
  for (const ty of [1.5, 5.5]) {
    tb.g.cylX(ty, 2, 1.3, 0, L - 4, tube);
    tb.box(0, Math.round(ty) - 1, 1, 3, Math.round(ty) + 1, 3, tubeEnd);
    tb.box(L - 7, Math.round(ty) - 1, 1, L - 4, Math.round(ty) + 1, 3, tubeEnd);
  }
  // diffuser (wraparound prismatic), cracked with missing chunks (dimmer emissive)
  const db = new VB(L - 4, 9, 7, vs, 'corner');
  const dif = mat.emissive(db.P, 'diffuser', rgbMul(tubeC, 0.62));
  const bug = mat.generic(db.P, 'bugs', [40, 36, 30]);
  const cracked = opts.cracked ?? rng.chance(0.75);
  const holes = [];
  if (cracked) for (let i = 0, n = rng.int(1, 3); i < n; i++) holes.push([rng.int(8, L - 12), rng.int(0, 8), rng.range(3, 8)]);
  for (let x = 0; x < L - 4; x++)
    for (let y = 0; y < 9; y++)
      for (let z = 0; z < 7; z++) {
        const shell = y === 0 || y === 8 || z === 6;
        if (!shell || (z === 0 && y > 0 && y < 8)) continue;
        let skip = false;
        for (const [hx, hy, hr] of holes) if (Math.hypot(x - hx, (y - hy) * 1.4) < hr + (vrand(x, y, z, 5) - 0.5) * 2) skip = true;
        if (skip) continue;
        db.set(x, y, z, y === 0 && vrand(x, y, z, 7) < 0.06 ? bug : dif);
      }
  const tpos = [b.origin[0] + 3 * vs, 1 * vs, 3 * vs];
  const dpos = [b.origin[0] + 3 * vs, 0, 3 * vs];
  return {
    model: b.model(),
    parts: [
      { name: 'tubes', model: tb.model([0, 0, 0]), position: tpos, rotation: [0, 0, 0], emissive: true },
      { name: 'diffuser', model: db.model([0, 0, 0]), position: dpos, rotation: [0, 0, 0], emissive: true },
    ],
    meta: {
      size: b.sizeM(), mount: 'wall', kind: 'fluoroFixture', previewY: 2.6,
      anchors: { light: [0, 0.02, 0.07], lightDir: norm([0, -0.7, 0.7]) }, lightColor: 0xd8ffe0,
    },
  };
}

/**
 * Cobra-head street light on a curved mast arm, for utility poles.
 * opts: reach (m, horizontal distance from the pole surface to the head centre, default 1.4),
 * rise (m, arm rise, default 0.35), lens 'sodium'|'led'. Origin: arm bracket on the pole surface
 * (back plane z = 0), bracket centre at y = 0; arm and head extend toward +Z.
 * meta.anchors.light: lens centre (light points down).
 */
export function cobraHead(rng, opts = {}) {
  const vs = VS_FINE;
  const reach = opts.reach ?? 1.4;
  const rise = opts.rise ?? 0.35;
  const R = reach / vs, RS = rise / vs;
  const HL = 52, HW = 22, HH = 11; // head length / width / height (voxels)
  const nz = Math.ceil(R + HL * 0.6 + 4), ny = Math.ceil(RS + HH + 18), nx = HW + 6;
  const b = new VB(nx, ny, nz, vs, 'corner');
  const P = b.P;
  const alu = mat.paint(P, 'alu', rgbJitter(rng, [142, 144, 140], 0.04), { cls: MCLS.GENERIC, rough: 0.45, metal: 0.6 });
  const arm = mat.galv(P, 'arm', [130, 132, 130]);
  const dark = mat.generic(P, 'dark', [40, 40, 40]);
  const cx = nx / 2, y0 = 8;
  // pole bracket (two band clamps)
  b.box(Math.round(cx - 4), y0 - 6, 0, Math.round(cx + 4), y0 + 6, 3, arm);
  for (const dy of [-5, 4]) b.box(Math.round(cx - 6), y0 + dy, 0, Math.round(cx + 6), y0 + dy + 2, 1, arm);
  // curved mast arm: rises then levels toward the head
  let prev = [cx, y0, 3];
  const armEnd = R - HL * 0.38;
  for (let i = 1; i <= 30; i++) {
    const t = i / 30;
    const z = 3 + (armEnd - 3) * t;
    const y = y0 + RS * Math.sin(Math.min(1, t * 1.3) * Math.PI / 2);
    b.g.line(...prev, cx, y, z, 1.5, arm);
    prev = [cx, y, z];
  }
  // brace under the arm
  b.g.line(cx, y0 - 5, 3, cx, y0 + RS * 0.85, Math.min(armEnd, R * 0.45), 0.9, arm);
  // head: cobra shape (tapered toward the arm, rounded nose), flat bottom with lens recess
  const hy = Math.round(y0 + RS) - 2;
  const hz0 = armEnd - 3;
  for (let z = 0; z < HL; z++) {
    const t = z / HL;
    const w = HW * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.25 + 0.05))) / 2;
    const h = HH * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.08)));
    for (let x = Math.round(cx - w); x < Math.round(cx + w); x++) {
      const ex = 1 - Math.abs(x + 0.5 - cx) / w;
      const top = Math.round(h * (0.65 + 0.35 * Math.sqrt(Math.max(0, ex))));
      b.box(x, hy, Math.round(hz0 + z), x + 1, hy + top, Math.round(hz0 + z) + 1, alu);
    }
  }
  // lens recess underneath
  const lx0 = Math.round(cx - HW * 0.3), lx1 = Math.round(cx + HW * 0.3), lz0 = Math.round(hz0 + HL * 0.3), lz1 = Math.round(hz0 + HL * 0.88);
  b.box(lx0, hy, lz0, lx1, hy + 1, lz1, dark);
  b.box(lx0, hy, lz0, lx1, hy + 1, lz1, 0);
  // photocell on top
  b.g.cylY(cx, hz0 + HL * 0.45, 2.2, hy + HH - 1, hy + HH + 3, mat.plastic(P, 'photocell', [40, 40, 40]));
  grime(b, [alu], { h: hy + 2, amount: 0.3, y0: hy, seed: 4 });
  streaks(b, rng, [alu], { count: 4, len: [2, 6], kind: 'dirt' });
  // lens (emissive): shallow drop lens under the head
  const lensC = opts.lens === 'led' ? [236, 240, 255] : [255, 160, 70];
  const lb = new VB(lx1 - lx0, 3, lz1 - lz0, vs, 'corner');
  const lm = mat.emissive(lb.P, 'lens', lensC);
  for (let z = 0; z < lz1 - lz0; z++)
    for (let x = 0; x < lx1 - lx0; x++) {
      const u = (x + 0.5) / (lx1 - lx0) * 2 - 1, w = (z + 0.5) / (lz1 - lz0) * 2 - 1;
      if (u * u + w * w * 0.6 > 1.15) continue;
      const d = Math.round((1 - u * u) * (1 - w * w) * 2);
      for (let y = 2 - d; y < 3; y++) lb.set(x, y, z, lm);
    }
  b.setMount([-cx * vs, -y0 * vs, 0]);
  const lpos = [b.mx(lx0), b.my(hy) - 2 * vs, b.mz(lz0)];
  return {
    model: b.model(),
    parts: [{ name: 'lens', model: lb.model([0, 0, 0]), position: lpos, rotation: [0, 0, 0], emissive: true }],
    meta: {
      size: b.sizeM(), mount: 'wall', kind: 'cobraHead', previewY: 3,
      anchors: { light: [0, b.my(hy) - 2 * vs, b.mz((lz0 + lz1) / 2)], lightDir: [0, -1, 0] }, lightColor: opts.lens === 'led' ? 0xe8f0ff : 0xff9440, reach,
    },
  };
}
