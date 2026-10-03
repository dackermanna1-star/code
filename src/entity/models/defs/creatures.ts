/**
 * Model definitions: skeleton, creeper, spider, cow, pig, sheep, chicken.
 * Minecraft proportions (1 px = 1/16 m) rendered with rounded geometry + painted PBR atlases.
 */
import { PX, type BoneDef, type BoxPrim, type ModelDef, type PrimDef, type Sample, type V3 } from '../def';
import { humanoidDef } from './humanoid';
import { bone as boneMat, chitin, ellipseMask, eye, fbm3, feathers, fur, hash31, hex, mcCol, mcRow, mixRGB, mulRGB, noise3, rectMask, skin, smooth, wool, worley3, type RGB } from '../paint/brushes';

/** Box in Minecraft pixel units (from, size). */
function pb(id: string, bone: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, o: Partial<BoxPrim> = {}): BoxPrim {
  return { kind: 'box', id, bone, from: [x * PX, y * PX, z * PX], to: [(x + sx) * PX, (y + sy) * PX, (z + sz) * PX], r: 0.025, ...o };
}
const P3 = (x: number, y: number, z: number): V3 => [x * PX, y * PX, z * PX];

// ================================================================================ skeleton
export function skeletonModel(): ModelDef {
  const bone = hex(0xd9d4c4), grime = hex(0x6e6450);
  const extra: PrimDef[] = [
    pb('spine', 'body', -0.6, 12, 0.2, 1.2, 12, 1.2, { r: 0.018 }),
    pb('pelvis', 'body', -3.5, 12, -1.2, 7, 2, 2.4, { r: 0.03 }),
    pb('sternum', 'body', -0.6, 15.5, -1.9, 1.2, 7.5, 0.8, { r: 0.012 }),
  ];
  for (let i = 0; i < 4; i++) {
    const y = 16 + i * 2;
    const w = 7.2 - Math.abs(i - 1.5) * 0.6;
    extra.push(pb('ribF' + i, 'body', -w / 2, y, -2, w, 0.9, 0.8, { r: 0.012 }));
    extra.push(pb('ribR' + i, 'body', w / 2 - 0.8, y, -2, 0.8, 0.9, 3.4, { r: 0.012 }));
    extra.push(pb('ribL' + i, 'body', -w / 2, y, -2, 0.8, 0.9, 3.4, { r: 0.012 }));
  }
  extra.push(pb('shoulders', 'body', -4, 22.6, -0.4, 8, 1.2, 1.4, { r: 0.018 }));
  return humanoidDef({
    key: 'skeleton',
    arm: [2, 12, 2], leg: [2, 12, 2], armX: 5, noTorso: true, r: 0.022, overlap: 0.03,
    extra, sss: 0.15, blood: 1,
    paint: (s: Sample) => {
      boneMat(s, bone, { grime, cracks: 0.7 });
      if (s.prim === 'head') {
        if (s.face === 'front') {
          // eye sockets (rows 3-4, cols 1-2 / 5-6), nasal cavity, teeth
          for (const cx of [2, 6]) {
            const m = rectMask(s, cx - 1.1, 3, 2.2, 2, 0.35, 0.6);
            s.height -= m * 0.006;
            mixRGB(s, hex(0x0a0806), m * 0.95);
            s.ao *= 1 - m * 0.6;
          }
          const n = rectMask(s, 3.4, 5.2, 1.2, 1, 0.25, 0.3);
          mixRGB(s, hex(0x140f0a), n);
          s.height -= n * 0.004;
          const teeth = rectMask(s, 1.5, 6.6, 5, 0.9, 0.15, 0.1);
          if (teeth > 0) {
            const gap = smooth(0.12, 0.0, Math.abs((((s.u / PX) * 1.6) % 1) - 0.5) - 0.38);
            mixRGB(s, hex(0x1a120a), teeth * gap);
            s.height -= teeth * gap * 0.002;
          }
        }
      } else if (s.prim.startsWith('arm') || s.prim.startsWith('fore') || s.prim.startsWith('leg') || s.prim.startsWith('shin')) {
        // joint knobs darker grime near ends
        const e = Math.min(Math.abs(s.y - 0.75), Math.abs(s.y - 1.125), Math.abs(s.y - 0.375), Math.abs(s.y));
        mixRGB(s, grime, smooth(0.06, 0.0, e) * 0.35);
      }
    },
  });
}

// ================================================================================ creeper
const CREEPER_FACE = ['........', '........', '.XX..XX.', '.XX..XX.', '...XX...', '..XXXX..', '..XXXX..', '..X..X..'];
export function creeperModel(): ModelDef {
  const prims: PrimDef[] = [
    pb('head', 'head', -4, 18, -4, 8, 8, 8, { r: 0.04, seg: 3 }),
    pb('body', 'body', -4, 6, -2, 8, 12, 4, { r: 0.035 }),
    pb('legFR', 'legFR', 0, 0, -6, 4, 6, 4),
    pb('legFL', 'legFL', -4, 0, -6, 4, 6, 4),
    pb('legBR', 'legBR', 0, 0, 2, 4, 6, 4),
    pb('legBL', 'legBL', -4, 0, 2, 4, 6, 4),
  ];
  const bones: BoneDef[] = [
    { name: 'body', parent: null, pivot: P3(0, 6, 0) },
    { name: 'head', parent: 'body', pivot: P3(0, 18, 0) },
    { name: 'legFR', parent: 'body', pivot: P3(2, 6, -2) },
    { name: 'legFL', parent: 'body', pivot: P3(-2, 6, -2) },
    { name: 'legBR', parent: 'body', pivot: P3(2, 6, 2) },
    { name: 'legBL', parent: 'body', pivot: P3(-2, 6, 2) },
  ];
  const greens: RGB[] = [hex(0x5fa64a), hex(0x3f7d34), hex(0x7cc260), hex(0x2f5f2a), hex(0x96d07e), hex(0x4c9140)];
  return {
    key: 'creeper', bones, prims, density: 220, sss: 0.35, blood: 2,
    paint: (s: Sample) => {
      // blocky Minecraft camouflage (per-pixel cells in 3D) with organic, leathery detail
      const cx = Math.floor(s.x / PX + 0.001 * s.nx), cy = Math.floor(s.y / PX), cz = Math.floor(s.z / PX);
      const h = hash31(cx * 3 + Math.round(s.nx * 7), cy * 5 + Math.round(s.ny * 7), cz * 7 + Math.round(s.nz * 7));
      const col = greens[Math.floor(h * h * greens.length * 0.999)];
      const org = fbm3(s.x * 9, s.y * 9, s.z * 9, 4);
      // soften cell edges with noise for a natural mottled look
      const fx = (s.u / PX) % 1, fy = (s.v / PX) % 1;
      const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
      const k = 0.88 + org * 0.2 + noise3(s.x * 120, s.y * 120, s.z * 120) * 0.05;
      s.r = col[0] * k; s.g = col[1] * k; s.b = col[2] * k;
      const w = worley3(s.x * 70, s.y * 70, s.z * 70, 1);
      s.height += smooth(0.0, 0.5, w.f2 - w.f1) * 0.0007 + org * 0.0012 - smooth(0.12, 0.0, edge) * 0.0003;
      s.rough = 0.62 + org * 0.1;
      s.sss = 0.5;
      if (s.prim === 'head' && s.face === 'front') {
        const r = mcRow(s), c = mcCol(s);
        const on = CREEPER_FACE[r]?.[c] === 'X';
        if (on) {
          const [x, y] = [s.u / PX, (s.h - s.v) / PX];
          // soften the pixel feature edges
          const ex = Math.min(x - c, c + 1 - x, y - r, r + 1 - y);
          const nb = (rr: number, cc: number) => CREEPER_FACE[rr]?.[cc] === 'X';
          const solid = (nb(r, c - 1) || x - c > 0.15) && (nb(r, c + 1) || c + 1 - x > 0.15) && (nb(r - 1, c) || y - r > 0.15) && (nb(r + 1, c) || r + 1 - y > 0.15) ? 1 : smooth(0, 0.15, ex);
          mixRGB(s, hex(0x060806), solid);
          s.height -= solid * 0.004;
          s.rough = 0.35;
          s.sss *= 1 - solid;
        }
      }
      if (s.prim.startsWith('leg') && s.y < 0.03) mulRGB(s, 0.75);
    },
  };
}

// ================================================================================ spider
export function spiderModel(): ModelDef {
  const prims: PrimDef[] = [
    pb('neck', 'body', -3, 6, -3, 6, 6, 6, { r: 0.04 }),
    pb('head', 'head', -4, 5, -11, 8, 8, 8, { r: 0.045, seg: 3 }),
    pb('abdomen', 'abdomen', -5, 5, 3, 10, 8, 12, { r: 0.08, seg: 3 }),
  ];
  const bones: BoneDef[] = [
    { name: 'body', parent: null, pivot: P3(0, 9, 0) },
    { name: 'head', parent: 'body', pivot: P3(0, 9, -3) },
    { name: 'abdomen', parent: 'body', pivot: P3(0, 9, 3) },
  ];
  const zs = [-2.4, -0.8, 0.8, 2.4];
  for (let i = 0; i < 4; i++)
    for (const [side, sx] of [['R', 1], ['L', -1]] as const) {
      const z = zs[i];
      const fan = (i - 1.5) * 3.2; // legs fan forward/back
      const hip: V3 = P3(sx * 3, 9, z);
      const knee: V3 = P3(sx * 10, 14, z + fan * 1.2);
      const foot: V3 = P3(sx * 16, 0, z + fan * 2.2);
      const a = `leg${i}${side}`, b = `leg${i}${side}b`;
      prims.push({ kind: 'tube', id: a, bone: a, path: [hip, [(hip[0] + knee[0]) / 2, (hip[1] + knee[1]) / 2 + 0.02, (hip[2] + knee[2]) / 2], knee], radius: [0.055, 0.045, 0.04], sides: 8, segs: 6, caps: true });
      prims.push({ kind: 'tube', id: b, bone: b, path: [knee, [(knee[0] * 0.55 + foot[0] * 0.45), knee[1] * 0.5 + 0.02, (knee[2] * 0.55 + foot[2] * 0.45)], foot], radius: [0.04, 0.03, 0.015], sides: 8, segs: 8, caps: true });
      bones.push({ name: a, parent: 'body', pivot: hip });
      bones.push({ name: b, parent: a, pivot: knee });
    }
  const base = hex(0x2a221d), dark = hex(0x15110e);
  return {
    key: 'spider', bones, prims, density: 210, sss: 0.1, blood: 2,
    paint: (s: Sample) => {
      chitin(s, s.prim === 'abdomen' ? base : dark, { hair: 0.9, gloss: s.prim.startsWith('leg') ? 0.6 : 0.45 });
      fur(s, s.prim === 'abdomen' ? hex(0x3a2f27) : hex(0x241d19), { dir: [0, -0.3, 1], len: 0.02, width: 0.0012, depth: 0.0018, rough: 0.55, sss: 0.1, vary: 0.4 });
      if (s.prim === 'abdomen' && s.face === 'top') {
        // subtle darker chevron pattern
        const v = Math.abs(s.u - s.w / 2) * 2 + (s.v % 0.18);
        mixRGB(s, hex(0x0d0a08), smooth(0.24, 0.2, v % 0.2) * 0.4);
      }
      if (s.prim === 'head' && s.face === 'front') {
        // eight red eyes: 2 big + 6 small (emissive)
        const eyes: [number, number, number][] = [[2.6, 3.4, 0.95], [5.4, 3.4, 0.95], [1.3, 2.3, 0.5], [6.7, 2.3, 0.5], [3.4, 1.9, 0.45], [4.6, 1.9, 0.45], [1.6, 4.6, 0.4], [6.4, 4.6, 0.4]];
        for (const [x, y, r] of eyes) {
          const m = ellipseMask(s, x, y, r, r * 0.9, 0.3);
          if (m <= 0) continue;
          const d = Math.hypot(s.u / PX - x, (s.h - s.v) / PX - y) / r;
          mixRGB(s, hex(0xd0101a), m);
          mixRGB(s, hex(0xff6a50), m * smooth(0.6, 0.0, d) * 0.6);
          s.em = Math.max(s.em, m * 0.55);
          s.rough = 0.05 + (1 - m) * s.rough;
          s.height += m * 0.003 * (1 - d * d);
          s.sss = 0;
        }
        // chelicerae / mouth
        const mo = rectMask(s, 3, 6.2, 2, 1.4, 0.3, 0.4);
        mixRGB(s, hex(0x080605), mo);
      }
    },
  };
}

// ================================================================================ quadrupeds
interface QuadOpts {
  key: string;
  body: [number, number, number, number, number, number]; // x,y,z,sx,sy,sz px
  head: [number, number, number, number, number, number];
  headPivot: [number, number, number];
  legSize: [number, number]; // w, h
  legXZ: [number, number, number]; // x offset, front z, back z (centres)
  extra?: PrimDef[];
  slots?: ModelDef['slots'];
  paint: (s: Sample) => void;
  sss?: number;
  r?: number;
  legPrims?: (side: 'FR' | 'FL' | 'BR' | 'BL', x0: number, z0: number) => PrimDef[];
}
function quad(o: QuadOpts): ModelDef {
  const [bx, by, bz, bsx, bsy, bsz] = o.body;
  const [hx, hy, hz, hsx, hsy, hsz] = o.head;
  const [lw, lh] = o.legSize;
  const prims: PrimDef[] = [
    pb('body', 'body', bx, by, bz, bsx, bsy, bsz, { r: o.r ?? 0.05, seg: 3 }),
    pb('head', 'head', hx, hy, hz, hsx, hsy, hsz, { r: 0.04, seg: 3 }),
  ];
  const bones: BoneDef[] = [
    { name: 'body', parent: null, pivot: P3(0, by + bsy / 2, 0) },
    { name: 'head', parent: 'body', pivot: P3(...o.headPivot) },
  ];
  const [lx, fz, bkz] = o.legXZ;
  const knee = lh / 2;
  for (const [side, sx, z] of [['FR', 1, fz], ['FL', -1, fz], ['BR', 1, bkz], ['BL', -1, bkz]] as const) {
    const x0 = sx * lx - lw / 2, z0 = z - lw / 2;
    prims.push(pb('leg' + side, 'leg' + side, x0, knee - 0.5, z0, lw, lh - knee + 0.6 + (by - lh), lw, { r: 0.022 }));
    prims.push(pb('shin' + side, 'shin' + side, x0 + 0.05, 0, z0 + 0.05, lw - 0.1, knee + 0.8, lw - 0.1, { r: 0.022 }));
    if (o.legPrims) prims.push(...o.legPrims(side, x0, z0));
    bones.push({ name: 'leg' + side, parent: 'body', pivot: P3(sx * lx, by + 1, z), box: [P3(x0, knee, z0), P3(x0 + lw, by + 1, z0 + lw)] });
    bones.push({ name: 'shin' + side, parent: 'leg' + side, pivot: P3(sx * lx, knee, z), box: [P3(x0, 0, z0), P3(x0 + lw, knee, z0 + lw)] });
  }
  if (o.extra) prims.push(...o.extra);
  return { key: o.key, bones, prims, density: 190, sss: o.sss ?? 0.5, blood: 0, paint: o.paint, slots: o.slots };
}

function hoof(s: Sample, col: RGB) {
  if (s.y < 0.07) {
    const keep = s.height;
    chitin(s, col, { hair: 0, gloss: 0.4 });
    s.height = keep + noise3(s.x * 200, s.y * 40, s.z * 200) * 0.0003;
    if (s.y < 0.015) mulRGB(s, 0.6);
  }
}

export function cowModel(): ModelDef {
  const dark = hex(0x3b2a1e), white = hex(0xe8e4dc), pink = hex(0xd9a19a), horn = hex(0xd8d0bc);
  return quad({
    key: 'cow',
    body: [-6, 11, -9, 12, 10, 18], head: [-4, 14, -15, 8, 8, 6], headPivot: [0, 18, -9],
    legSize: [4, 12], legXZ: [4, -6, 6.5],
    extra: [
      pb('hornR', 'head', 4, 21, -12.5, 1.2, 3, 1.2, { r: 0.012, rot: [0, 0, -0.35], origin: P3(4, 21, -12) }),
      pb('hornL', 'head', -5.2, 21, -12.5, 1.2, 3, 1.2, { r: 0.012, rot: [0, 0, 0.35], origin: P3(-4, 21, -12) }),
      pb('muzzle', 'head', -2.5, 14.2, -16, 5, 3.4, 1.4, { r: 0.02 }),
      pb('udder', 'body', -2, 9.6, 3, 4, 1.6, 5, { r: 0.025 }),
    ],
    paint: (s) => {
      // short-hair coat, Minecraft cow pattern: dark brown with irregular white patches
      const patch = fbm3(s.x * 2.6 + 7, s.y * 2.6, s.z * 2.6, 4) + (s.prim === 'head' ? 0.05 : 0);
      const isWhite = s.prim.startsWith('shin') || patch > 0.12;
      const base = isWhite ? white : dark;
      fur(s, base, { dir: [0, -0.5, 0.8], len: 0.025, width: 0.0014, depth: 0.0008, rough: 0.7, sss: 0.3, vary: 0.2 });
      const e = smooth(0.04, 0.0, Math.abs(patch - 0.12));
      if (e > 0 && !s.prim.startsWith('shin')) mixRGB(s, [(white[0] + dark[0]) / 2, (white[1] + dark[1]) / 2, (white[2] + dark[2]) / 2], e * 0.5);
      if (s.prim === 'head' && s.face === 'front') {
        // white blaze down the face, eyes
        const bl = rectMask(s, 2.8, 0, 2.4, 6, 0.6, 0.8);
        mixRGB(s, white, bl);
        for (const cx of [1.5, 6.5]) eye(s, cx, 3.5, 0.75, 0.75, hex(0x1a120c), 0.6);
      }
      if (s.prim === 'muzzle') {
        skin(s, pink, { sss: 0.6, rough: 0.45, pores: 0.0006 });
        if (s.face === 'front') for (const cx of [1, 4]) { const n = ellipseMask(s, cx, 1.5, 0.45, 0.6, 0.3); mixRGB(s, hex(0x5a2a28), n); s.height -= n * 0.003; }
      }
      if (s.prim === 'udder') skin(s, pink, { sss: 0.7, rough: 0.5 });
      if (s.prim.startsWith('horn')) { boneMat(s, horn, { cracks: 0.2 }); s.rough = 0.4; if (s.y > 23.5 * PX) mixRGB(s, hex(0x5a5040), 0.6); }
      if (s.prim.startsWith('shin')) hoof(s, hex(0x2b241e));
    },
  });
}

export function pigModel(): ModelDef {
  const pinkC = hex(0xeea3a0), snout = hex(0xe0898a);
  return quad({
    key: 'pig',
    body: [-5, 6, -8, 10, 8, 16], head: [-4, 8, -14, 8, 8, 8], headPivot: [0, 12, -6],
    legSize: [4, 6], legXZ: [3, -5, 5.5], r: 0.06,
    extra: [pb('snout', 'head', -2, 9, -15, 4, 3, 1.2, { r: 0.018 })],
    paint: (s) => {
      skin(s, pinkC, { mottle: 0.6, pores: 0.0005, sss: 0.75, rough: 0.5, blotch: hex(0xd78a88), blotchAmt: 0.4 });
      // sparse bristles
      const b = smooth(0.82, 0.95, noise3(s.x * 300, s.y * 300, s.z * 300));
      mixRGB(s, hex(0xf6d6c8), b * 0.5);
      s.height += b * 0.0003;
      // dirt on lower body / legs
      mixRGB(s, hex(0x6b5038), smooth(0.25, 0.0, s.y) * smooth(-0.2, 0.4, fbm3(s.x * 6, s.y * 6, s.z * 6, 3)) * 0.6);
      if (s.prim === 'snout') {
        skin(s, snout, { sss: 0.6, rough: 0.4, pores: 0.0008, wrinkles: 0.8 });
        if (s.face === 'front') for (const cx of [0.95, 3.05]) { const n = ellipseMask(s, cx, 1.5, 0.45, 0.65, 0.3); mixRGB(s, hex(0x5e2c2e), n); s.height -= n * 0.004; }
      }
      if (s.prim === 'head' && s.face === 'front') {
        for (const cx of [1.5, 6.5]) {
          const w = ellipseMask(s, cx, 3.5, 0.95, 0.65, 0.3);
          mixRGB(s, hex(0xf2efe8), w);
          eye(s, cx + (cx < 4 ? 0.35 : -0.35), 3.5, 0.5, 0.5, hex(0x1b120c), 0.7);
        }
      }
      if (s.prim.startsWith('shin')) hoof(s, hex(0x6b4a40));
    },
  });
}

export function sheepModel(): ModelDef {
  const face = hex(0xd3b49c), legC = hex(0xc9a68e);
  const lump = (x: number, y: number, z: number) => fbm3(x * 9, y * 9, z * 9, 3) * 0.02 + worley3(x * 14, y * 14, z * 14, 1).f1 * -0.012;
  return quad({
    key: 'sheep',
    body: [-4, 12, -8, 8, 6, 16], head: [-3, 15, -14, 6, 6, 8], headPivot: [0, 18, -7],
    legSize: [4, 12], legXZ: [3, -5, 5.5],
    extra: [
      pb('woolBody', 'body', -4, 12, -8, 8, 6, 16, { mat: 'wool', inflate: 0.11, r: 0.14, seg: 3, div: [3, 2, 5], displace: lump }),
      pb('woolHead', 'head', -3, 16, -12.5, 6, 6, 6, { mat: 'wool', inflate: 0.035, r: 0.06, seg: 3, div: 2, displace: (x, y, z) => lump(x, y, z) * 0.4 }),
    ],
    legPrims: (side, x0, z0) => [pb('woolLeg' + side, 'leg' + side, x0, 6, z0, 4, 6, 4, { mat: 'wool', inflate: 0.03, r: 0.04, displace: (x, y, z) => lump(x, y, z) * 0.3 })],
    slots: { wool: { kind: 'atlas', sss: 0.5 } },
    paint: (s) => {
      if (s.prim.startsWith('wool')) { wool(s, hex(0xf2f0ea)); return; }
      if (s.prim === 'body') { skin(s, hex(0xd8c0ae), { sss: 0.6, rough: 0.6 }); return; }
      fur(s, s.prim === 'head' ? face : legC, { dir: [0, -1, 0], len: 0.01, width: 0.0009, depth: 0.0004, rough: 0.65, sss: 0.4, vary: 0.15 });
      if (s.prim === 'head' && s.face === 'front') {
        for (const cx of [1.0, 5.0]) { const w = ellipseMask(s, cx, 2.6, 0.7, 0.45, 0.3); mixRGB(s, hex(0xefe9e0), w); eye(s, cx + (cx < 3 ? 0.25 : -0.25), 2.6, 0.38, 0.38, hex(0x1a120c), 0.75); }
        const n = rectMask(s, 2, 3.8, 2, 1.4, 0.35, 0.5);
        mixRGB(s, hex(0xb98f84), n);
        const m = rectMask(s, 2.4, 5.2, 1.2, 0.35, 0.15, 0.1);
        mixRGB(s, hex(0x4a3028), m);
      }
      if (s.prim.startsWith('shin')) hoof(s, hex(0x3a3028));
    },
  });
}

// ================================================================================ chicken
export function chickenModel(): ModelDef {
  const prims: PrimDef[] = [
    pb('body', 'body', -3, 4, -4, 6, 6, 8, { r: 0.04, seg: 3 }),
    pb('head', 'head', -2, 9, -6, 4, 6, 3, { r: 0.025, seg: 2 }),
    pb('beak', 'head', -2, 11, -8, 4, 2, 2, { r: 0.012 }),
    pb('wattle', 'head', -1, 9, -7, 2, 2, 2, { r: 0.015 }),
    pb('comb', 'head', -0.5, 15, -5.5, 1, 1.4, 2.4, { r: 0.008 }),
    pb('wingR', 'wingR', 3, 5.5, -3, 1, 4, 6, { r: 0.012 }),
    pb('wingL', 'wingL', -4, 5.5, -3, 1, 4, 6, { r: 0.012 }),
    pb('tail', 'body', -2, 8, 3.5, 4, 3, 1.4, { r: 0.015, rot: [-0.5, 0, 0], origin: P3(0, 8, 4) }),
  ];
  const bones: BoneDef[] = [
    { name: 'body', parent: null, pivot: P3(0, 7, 0) },
    { name: 'head', parent: 'body', pivot: P3(0, 9, -4) },
    { name: 'wingR', parent: 'body', pivot: P3(3, 9.5, 0) },
    { name: 'wingL', parent: 'body', pivot: P3(-3, 9.5, 0) },
  ];
  for (const [side, sx] of [['R', 1], ['L', -1]] as const) {
    const n = 'leg' + side;
    prims.push({ kind: 'tube', id: n, bone: n, path: [P3(sx * 1.5, 4.5, 1), P3(sx * 1.5, 2, 0.5), P3(sx * 1.5, 0.3, 0)], radius: [0.022, 0.016, 0.014], sides: 7, segs: 4, caps: true });
    prims.push(pb('foot' + side, n, sx * 1.5 - 1.5, 0, -2.2, 3, 0.45, 3, { r: 0.008 }));
    bones.push({ name: n, parent: 'body', pivot: P3(sx * 1.5, 4.5, 1) });
  }
  const white = hex(0xf3f1ea);
  return {
    key: 'chicken', bones, prims, density: 300, sss: 0.4, blood: 0,
    paint: (s) => {
      if (s.prim === 'beak' || s.prim.startsWith('leg') || s.prim.startsWith('foot')) {
        chitin(s, s.prim === 'beak' ? hex(0xf2b33c) : hex(0xe8a23a), { hair: 0, gloss: 0.45 });
        if (s.prim !== 'beak') { const sc = Math.abs(Math.sin(s.y * 900)); s.height += sc * 0.0002; }
        else if (s.face === 'front' && s.v > s.h * 0.45 && s.v < s.h * 0.55) mulRGB(s, 0.55);
        return;
      }
      if (s.prim === 'wattle' || s.prim === 'comb') { skin(s, hex(0xd8231e), { sss: 0.8, rough: 0.4, wrinkles: 1 }); return; }
      feathers(s, white, s.prim === 'head' ? 0.018 : 0.03);
      if (s.prim === 'head' && (s.face === 'left' || s.face === 'right')) eye(s, 1, 2.2, 0.5, 0.5, hex(0x120c08), 0.8);
    },
  };
}
