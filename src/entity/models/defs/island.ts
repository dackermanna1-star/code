/**
 * Tropical island creatures: crab, snake (3 variants), parrot (4 variants), sea turtle.
 * Organic shapes are built from ellipsoids and tubes; painted with the shared PBR brushes.
 * Conventions as in def.ts: metres, feet centre at the origin, +Y up, facing -Z, right = +X.
 */
import type { BoneDef, ModelDef, PrimDef, Sample, V3 } from '../def';
import { chitin, fbm3, feathers, hex, mixRGB, mulRGB, noise3, scales, skin, smooth, worley3, type RGB } from '../paint/brushes';

const EYE_SLOT = { eye: { kind: 'solid' as const, color: 0x050403, roughness: 0.05, sss: 0 } };
const tube = (id: string, bone: string, path: V3[], radius: number | number[] | ((t: number) => number), o: Partial<PrimDef> = {}): PrimDef =>
  ({ kind: 'tube', id, bone, path, radius, sides: 8, segs: Math.max(4, path.length * 3), caps: true, ...o } as PrimDef);
const ell = (id: string, bone: string, center: V3, radius: V3, o: Partial<PrimDef> = {}): PrimDef =>
  ({ kind: 'ellipsoid', id, bone, center, radius, rings: 10, sides: 16, ...o } as PrimDef);

// ================================================================================ crab
export function crabModel(): ModelDef {
  const by = 0.15;
  const bones: BoneDef[] = [
    { name: 'body', parent: null, pivot: [0, by, 0] },
    { name: 'eyes', parent: 'body', pivot: [0, by + 0.05, -0.13] },
  ];
  const prims: PrimDef[] = [
    ell('shell', 'body', [0, by + 0.025, 0], [0.2, 0.065, 0.15], { rings: 12, sides: 22 }),
    ell('belly', 'body', [0, by - 0.012, 0.005], [0.17, 0.04, 0.125]),
    ell('mouth', 'body', [0, by - 0.012, -0.128], [0.045, 0.022, 0.018]),
  ];
  // eye stalks + eyes
  for (const sx of [1, -1]) {
    prims.push(tube(`stalk${sx > 0 ? 'R' : 'L'}`, 'eyes', [[sx * 0.045, by + 0.05, -0.12], [sx * 0.055, by + 0.1, -0.135], [sx * 0.06, by + 0.135, -0.14]], [0.01, 0.009, 0.008], { sides: 6 }));
    prims.push(ell(`eye${sx > 0 ? 'R' : 'L'}`, 'eyes', [sx * 0.061, by + 0.15, -0.141], [0.019, 0.021, 0.019], { mat: 'eye', rings: 8, sides: 10 }));
  }
  // claws: upper arm, forearm + palm, movable finger (dactyl)
  for (const [side, sx] of [['R', 1], ['L', -1]] as const) {
    const big = side === 'R' ? 1.15 : 1;
    const sh: V3 = [sx * 0.15, by, -0.1];
    const el: V3 = [sx * 0.24, by + 0.04, -0.17];
    const wr: V3 = [sx * 0.22, by + 0.05, -0.25];
    bones.push({ name: 'arm' + side, parent: 'body', pivot: sh });
    bones.push({ name: 'claw' + side, parent: 'arm' + side, pivot: el });
    bones.push({ name: 'pinch' + side, parent: 'claw' + side, pivot: [wr[0] + sx * 0.02 * big, wr[1] + 0.02, wr[2] - 0.03] });
    prims.push(tube('arm' + side, 'arm' + side, [sh, [(sh[0] + el[0]) / 2, by + 0.03, (sh[2] + el[2]) / 2], el], [0.022, 0.025, 0.026]));
    prims.push(ell('palm' + side, 'claw' + side, [sx * 0.235, by + 0.045, -0.22], [0.04 * big, 0.035 * big, 0.065 * big], { rot: [0, -sx * 0.4, 0] }));
    prims.push(tube('finger' + side, 'claw' + side, [[sx * 0.22, by + 0.035, -0.27], [sx * 0.205, by + 0.03, -0.32 * big], [sx * 0.19, by + 0.035, -0.345 * big]], [0.018 * big, 0.012 * big, 0.004]));
    prims.push(tube('dactyl' + side, 'pinch' + side, [[sx * 0.24, by + 0.07, -0.26], [sx * 0.225, by + 0.07, -0.315 * big], [sx * 0.2, by + 0.055, -0.345 * big]], [0.016 * big, 0.011 * big, 0.004]));
    // walking legs: 4 per side, fanned back
    const zs = [-0.07, -0.02, 0.03, 0.08];
    for (let i = 0; i < 4; i++) {
      const z = zs[i];
      const fan = (i - 1.2) * 0.05;
      const hip: V3 = [sx * 0.15, by - 0.01, z];
      const knee: V3 = [sx * 0.24, by + 0.05, z + fan];
      const foot: V3 = [sx * 0.29, 0.0, z + fan * 1.6];
      const a = `leg${i}${side}`, b = `leg${i}${side}b`;
      bones.push({ name: a, parent: 'body', pivot: hip });
      bones.push({ name: b, parent: a, pivot: knee });
      prims.push(tube(a, a, [hip, [(hip[0] + knee[0]) / 2, (hip[1] + knee[1]) / 2 + 0.01, (hip[2] + knee[2]) / 2], knee], [0.02, 0.019, 0.017], { sides: 7 }));
      prims.push(tube(b, b, [knee, [knee[0] * 0.55 + foot[0] * 0.45, knee[1] * 0.6, knee[2] * 0.55 + foot[2] * 0.45], foot], [0.017, 0.013, 0.004], { sides: 7 }));
    }
  }
  const shell = hex(0xd2512a), dark = hex(0x7a2412), cream = hex(0xf2dcb4), tip = hex(0x2a1410);
  return {
    key: 'crab', bones, prims, density: 520, sss: 0.15, blood: 2, slots: EYE_SLOT,
    paint: (s: Sample) => {
      if (s.prim === 'belly') { chitin(s, cream, { hair: 0.2, gloss: 0.35 }); return; }
      if (s.prim === 'mouth') { chitin(s, hex(0x8a3018), { hair: 0.3, gloss: 0.3 }); return; }
      if (s.prim.startsWith('stalk')) { chitin(s, hex(0xe0a070), { hair: 0, gloss: 0.5 }); return; }
      chitin(s, shell, { hair: 0.15, gloss: 0.6 });
      // darker mottled back, lighter underside of limbs
      const m = fbm3(s.x * 18, s.y * 18, s.z * 18, 4);
      mixRGB(s, dark, smooth(0.0, 0.4, m + s.ny * 0.25) * 0.65);
      mixRGB(s, cream, smooth(-0.2, -0.8, s.ny) * 0.45);
      // speckles
      const sp = smooth(0.62, 0.75, noise3(s.x * 160, s.y * 160, s.z * 160));
      mixRGB(s, hex(0xf6c47a), sp * 0.35 * smooth(0, 0.6, s.ny));
      if (s.prim.startsWith('finger') || s.prim.startsWith('dactyl')) {
        const t = smooth(0.25, 0.34, Math.abs(s.z));
        mixRGB(s, tip, t);
        s.rough = 0.25;
      }
      if (s.prim === 'shell') s.height += smooth(0.5, 0.9, worley3(s.x * 26, s.y * 26, s.z * 26, 1).f1) * -0.0015;
    },
  };
}

// ================================================================================ snake
export const SNAKE_VARIANTS = ['green', 'banded', 'python'] as const;
export const SNAKE_SEGS = 10;
const SNAKE_LEN = 1.7;
/** Body radius along the snake (t = 0 head .. 1 tail tip). */
export function snakeRadius(t: number) {
  return 0.012 + 0.036 * Math.sin(Math.min(1, t * 1.25 + 0.05) * Math.PI) * (1 - t * 0.35) + (t < 0.08 ? 0.006 : 0);
}
export function snakeModel(variant: string): ModelDef {
  const y = 0.045;
  const segL = SNAKE_LEN / SNAKE_SEGS;
  const z0 = -SNAKE_LEN * 0.42;
  const bones: BoneDef[] = [];
  const prims: PrimDef[] = [];
  for (let i = 0; i < SNAKE_SEGS; i++) {
    const za = z0 + i * segL, zb = za + segL;
    const name = i === 0 ? 'body' : `s${i}`;
    bones.push({ name, parent: i === 0 ? null : i === 1 ? 'body' : `s${i - 1}`, pivot: [0, y, za] });
    const ta = i / SNAKE_SEGS, tb = (i + 1) / SNAKE_SEGS;
    // overlap the next segment a little so bends never open a gap
    prims.push(tube(`seg${i}`, name, [[0, y, za - 0.01], [0, y, (za + zb) / 2], [0, y, zb + 0.012]], (t: number) => snakeRadius(ta + (tb - ta) * t) * (i === SNAKE_SEGS - 1 ? 1 - t * 0.85 : 1), { aspect: [1.15, 0.85], sides: 10 }));
  }
  // head
  bones.push({ name: 'head', parent: 'body', pivot: [0, y, z0] });
  bones.push({ name: 'tongue', parent: 'head', pivot: [0, y - 0.005, z0 - 0.09] });
  prims.push(ell('head', 'head', [0, y + 0.006, z0 - 0.045], [0.034, 0.024, 0.056], { rings: 10, sides: 14 }));
  prims.push(ell('snout', 'head', [0, y + 0.002, z0 - 0.085], [0.022, 0.016, 0.022]));
  for (const sx of [1, -1]) prims.push(ell(`eye${sx}`, 'head', [sx * 0.025, y + 0.016, z0 - 0.07], [0.009, 0.009, 0.009], { mat: 'eye', rings: 6, sides: 8 }));
  prims.push(tube('tongueBase', 'tongue', [[0, y - 0.005, z0 - 0.09], [0, y - 0.006, z0 - 0.125]], 0.003, { sides: 4, caps: false }));
  for (const sx of [1, -1]) prims.push(tube(`fork${sx}`, 'tongue', [[0, y - 0.006, z0 - 0.124], [sx * 0.008, y - 0.007, z0 - 0.145]], [0.0025, 0.001], { sides: 4, caps: false }));
  const pal: Record<string, [RGB, RGB, RGB]> = {
    green: [hex(0x2f9a35), hex(0xf2ee9a), hex(0xd8e86a)], // emerald tree boa: green, white flecks, yellow belly
    banded: [hex(0x16161a), hex(0xe8e2c8), hex(0xd8d0b0)], // banded krait: black and cream rings
    python: [hex(0x8a6a3a), hex(0x3a2614), hex(0xd8c49a)], // carpet python: tan with dark blotches
  };
  const [base, mark, belly] = pal[variant] ?? pal.green;
  return {
    key: 'snake|' + variant, bones, prims, density: 900, sss: 0.25, blood: 0, slots: EYE_SLOT,
    paint: (s: Sample) => {
      if (s.prim.startsWith('tongue') || s.prim.startsWith('fork')) { skin(s, hex(0x28080e), { sss: 0.3, rough: 0.3, pores: 0 }); return; }
      scales(s, base, 0.011, 7);
      const t = Math.max(0, Math.min(1, (s.z - z0) / SNAKE_LEN));
      if (variant === 'banded') {
        const band = smooth(0.35, 0.45, Math.abs(((t * 24) % 1) - 0.5) * 2);
        mixRGB(s, mark, band * 0.95);
      } else if (variant === 'python') {
        const w = worley3(s.x * 40, s.y * 40, s.z * 22, 1);
        mixRGB(s, mark, smooth(0.32, 0.18, w.f1) * smooth(-0.2, 0.3, s.ny) * 0.9);
        mixRGB(s, hex(0xb89058), smooth(0.04, 0.0, w.f2 - w.f1) * 0.5);
      } else {
        // white flecks along the spine
        const f = smooth(0.7, 0.85, noise3(s.x * 90, 0, s.z * 30)) * smooth(0.5, 0.9, s.ny);
        mixRGB(s, mark, f);
      }
      mixRGB(s, belly, smooth(-0.25, -0.65, s.ny));
      s.rough = 0.32;
      if (s.prim === 'head' || s.prim === 'snout') s.height += noise3(s.x * 300, s.y * 300, s.z * 300) * 0.0002;
    },
  };
}

// ================================================================================ parrot
export const PARROT_VARIANTS = ['scarlet', 'blue', 'green', 'grey'] as const;
export function parrotModel(variant: string): ModelDef {
  const bones: BoneDef[] = [
    { name: 'body', parent: null, pivot: [0, 0.14, 0] },
    { name: 'head', parent: 'body', pivot: [0, 0.3, -0.03] },
    { name: 'wingR', parent: 'body', pivot: [0.055, 0.27, -0.01] },
    { name: 'wingL', parent: 'body', pivot: [-0.055, 0.27, -0.01] },
    { name: 'tail', parent: 'body', pivot: [0, 0.14, 0.045] },
    { name: 'legR', parent: 'body', pivot: [0.025, 0.1, 0] },
    { name: 'legL', parent: 'body', pivot: [-0.025, 0.1, 0] },
  ];
  const prims: PrimDef[] = [
    ell('body', 'body', [0, 0.2, 0.005], [0.055, 0.095, 0.06], { rot: [0.25, 0, 0] }),
    ell('head', 'head', [0, 0.32, -0.04], [0.045, 0.045, 0.05]),
    ell('cheek', 'head', [0, 0.315, -0.065], [0.036, 0.03, 0.02]),
    tube('beakTop', 'head', [[0, 0.33, -0.08], [0, 0.325, -0.105], [0, 0.3, -0.112]], [0.017, 0.012, 0.003], { sides: 8 }),
    ell('beakLow', 'head', [0, 0.303, -0.088], [0.012, 0.01, 0.014]),
    ell('wingR', 'wingR', [0.06, 0.2, 0.025], [0.016, 0.085, 0.05], { rot: [0.3, 0, -0.05] }),
    ell('wingL', 'wingL', [-0.06, 0.2, 0.025], [0.016, 0.085, 0.05], { rot: [0.3, 0, 0.05] }),
    ell('tail', 'tail', [0, 0.06, 0.09], [0.022, 0.11, 0.012], { rot: [0.45, 0, 0] }),
  ];
  for (const sx of [1, -1]) {
    prims.push(ell(`eye${sx}`, 'head', [sx * 0.037, 0.335, -0.05], [0.008, 0.008, 0.008], { mat: 'eye', rings: 6, sides: 8 }));
    const n = sx > 0 ? 'legR' : 'legL';
    prims.push(tube(n, n, [[sx * 0.025, 0.11, 0], [sx * 0.028, 0.06, -0.005], [sx * 0.028, 0.035, -0.01]], [0.009, 0.007, 0.007], { sides: 6 }));
    prims.push(tube(n + 'toe', n, [[sx * 0.028, 0.035, -0.035], [sx * 0.028, 0.032, 0.02]], 0.005, { sides: 5 }));
  }
  type Pal = { body: RGB; wing: RGB; band: RGB; tail: RGB; face: RGB; belly: RGB };
  const pals: Record<string, Pal> = {
    scarlet: { body: hex(0xd8261a), wing: hex(0x1e4fd0), band: hex(0xf2c51e), tail: hex(0xd8261a), face: hex(0xf2ece4), belly: hex(0xc81e18) },
    blue: { body: hex(0x2a72d8), wing: hex(0x1d55b8), band: hex(0x2ab8c8), tail: hex(0x1d4aa8), face: hex(0xf0ece6), belly: hex(0xf4b81a) },
    green: { body: hex(0x3fb43a), wing: hex(0x2a8a30), band: hex(0x2a5ad8), tail: hex(0x2e9a2e), face: hex(0x9ad85a), belly: hex(0x8ad840) },
    grey: { body: hex(0x8a8e94), wing: hex(0x6a6e74), band: hex(0x5a5e64), tail: hex(0xc8241e), face: hex(0xe8e8e8), belly: hex(0xa0a4aa) },
  };
  const p = pals[variant] ?? pals.scarlet;
  return {
    key: 'parrot|' + variant, bones, prims, density: 900, sss: 0.3, blood: 0, slots: EYE_SLOT,
    paint: (s: Sample) => {
      if (s.prim.startsWith('beak')) {
        chitin(s, s.prim === 'beakTop' ? hex(0xe8dcc0) : hex(0x2a2420), { hair: 0, gloss: 0.5 });
        if (variant === 'scarlet' || variant === 'grey') mixRGB(s, hex(0x1e1a18), smooth(0.31, 0.3, s.y) * 0.8);
        return;
      }
      if (s.prim.startsWith('leg')) { skin(s, hex(0x5a5250), { rough: 0.6, wrinkles: 1, sss: 0.2 }); return; }
      if (s.prim === 'cheek') { skin(s, p.face, { sss: 0.5, rough: 0.6, mottle: 0.2 }); return; }
      let c = p.body;
      if (s.prim.startsWith('wing')) {
        // coverts in body colour, a band, flight feathers toward the tip
        const t = (0.28 - s.y) / 0.17;
        c = t < 0.3 ? p.body : t < 0.5 ? p.band : p.wing;
      } else if (s.prim === 'tail') c = p.tail;
      else if (s.prim === 'body' && s.nz < -0.2) c = p.belly;
      feathers(s, c, s.prim === 'head' ? 0.01 : 0.016, 3);
      if (s.prim === 'head') mixRGB(s, p.face, smooth(-0.3, -0.75, s.nz) * smooth(0.3, 0.33, s.y) * 0.0);
      s.rough = 0.62;
    },
  };
}

// ================================================================================ sea turtle
export function turtleModel(): ModelDef {
  const by = 0.17;
  const bones: BoneDef[] = [
    { name: 'body', parent: null, pivot: [0, by, 0] },
    { name: 'head', parent: 'body', pivot: [0, by, -0.4] },
    { name: 'finFR', parent: 'body', pivot: [0.22, by - 0.02, -0.24] },
    { name: 'finFL', parent: 'body', pivot: [-0.22, by - 0.02, -0.24] },
    { name: 'finBR', parent: 'body', pivot: [0.17, by - 0.03, 0.3] },
    { name: 'finBL', parent: 'body', pivot: [-0.17, by - 0.03, 0.3] },
  ];
  const prims: PrimDef[] = [
    ell('shell', 'body', [0, by + 0.04, 0.02], [0.34, 0.12, 0.46], { rings: 14, sides: 24 }),
    ell('plastron', 'body', [0, by - 0.03, 0.02], [0.3, 0.05, 0.4]),
    tube('neck', 'head', [[0, by, -0.36], [0, by + 0.01, -0.44], [0, by + 0.02, -0.5]], [0.055, 0.05, 0.048], { sides: 10 }),
    ell('head', 'head', [0, by + 0.025, -0.55], [0.07, 0.06, 0.09]),
    ell('beak', 'head', [0, by + 0.01, -0.625], [0.04, 0.03, 0.03]),
  ];
  for (const sx of [1, -1]) {
    prims.push(ell(`eye${sx}`, 'head', [sx * 0.055, by + 0.045, -0.585], [0.014, 0.014, 0.014], { mat: 'eye', rings: 6, sides: 8 }));
    const fr = sx > 0 ? 'finFR' : 'finFL', bk = sx > 0 ? 'finBR' : 'finBL';
    prims.push(ell(fr, fr, [sx * 0.4, by - 0.04, -0.3], [0.2, 0.018, 0.075], { rot: [0, sx * 0.45, -sx * 0.12] }));
    prims.push(ell(bk, bk, [sx * 0.23, by - 0.05, 0.42], [0.08, 0.016, 0.1], { rot: [0, -sx * 0.5, 0] }));
  }
  const shell = hex(0x6a4a22), seam = hex(0x2a1c0c), skinC = hex(0x6e7462), pale = hex(0xe6d8ae);
  return {
    key: 'sea_turtle', bones, prims, density: 340, sss: 0.2, blood: 0, slots: EYE_SLOT,
    paint: (s: Sample) => {
      if (s.prim === 'shell') {
        // scutes: large polygonal plates with radiating amber streaks and dark seams
        const w = worley3(s.x * 6.5, s.y * 3, s.z * 5.2, 0.6);
        const plate = smooth(0.0, 0.06, w.f2 - w.f1);
        const streak = fbm3(Math.atan2(s.x, s.z) * 3 + w.id * 9, s.y * 4, w.f1 * 8, 3);
        s.r = shell[0]; s.g = shell[1]; s.b = shell[2];
        mixRGB(s, hex(0xb07a2e), smooth(-0.1, 0.4, streak) * 0.7);
        mixRGB(s, hex(0x3a2810), smooth(0.3, 0.7, fbm3(s.x * 14, 0, s.z * 14, 3)) * 0.4);
        mixRGB(s, seam, 1 - plate);
        s.height += plate * 0.003 + streak * 0.0006;
        s.rough = 0.38 + (1 - plate) * 0.3;
        s.sss = 0;
        return;
      }
      if (s.prim === 'plastron') { chitin(s, pale, { hair: 0, gloss: 0.3 }); return; }
      if (s.prim === 'beak') { chitin(s, hex(0x4a4234), { hair: 0, gloss: 0.4 }); return; }
      scales(s, skinC, s.prim === 'head' ? 0.018 : 0.026, 11);
      // pale scale edges like a green turtle
      const w = worley3(s.x * 40, s.y * 40, s.z * 40, 1);
      mixRGB(s, hex(0xd8d0a8), smooth(0.05, 0.0, w.f2 - w.f1) * 0.6);
      mixRGB(s, pale, smooth(-0.3, -0.8, s.ny) * 0.7);
      mulRGB(s, 0.95);
    },
  };
}
