/**
 * Zombie family models: zombie (green rotting skin, torn cyan shirt, indigo trousers), husk
 * (sun-dried tan skin, faded clothes) and drowned (waterlogged teal skin, kelp, glowing eyes).
 */
import { PX, type ModelDef, type Sample } from '../def';
import { humanoidDef } from './humanoid';
import { cloth, ellipseMask, fbm3, fur, grime, hex, mcXY, mixRGB, mulRGB, noise3, rectMask, ridged3, skin, smooth, worley3, type RGB } from '../paint/brushes';

interface ZPal {
  skin: RGB;
  skinDark: RGB;
  hair: RGB;
  shirt: RGB;
  pants: RGB;
  shoes: RGB;
  rot: RGB;
  eye: RGB;
  eyeGlow: number;
  wet: number;
  kelp: number;
  sun: number;
}

const PAL: Record<string, ZPal> = {
  zombie: { skin: hex(0x5d8a3e), skinDark: hex(0x34521f), hair: hex(0x22331a), shirt: hex(0x1d9a9c), pants: hex(0x3c3a8d), shoes: hex(0x3c3f45), rot: hex(0x4a3a20), eye: hex(0x050505), eyeGlow: 0, wet: 0.15, kelp: 0, sun: 0 },
  husk: { skin: hex(0x9a8a62), skinDark: hex(0x5f5236), hair: hex(0x4b3f2a), shirt: hex(0x8a7b55), pants: hex(0x6a5a40), shoes: hex(0x463b2c), rot: hex(0x4a3b26), eye: hex(0x0b0806), eyeGlow: 0, wet: 0, kelp: 0, sun: 1 },
  drowned: { skin: hex(0x4f9a94), skinDark: hex(0x2a5a5a), hair: hex(0x1a3b2a), shirt: hex(0x3a8a7a), pants: hex(0x3b5a6e), shoes: hex(0x2d3a3c), rot: hex(0x24433a), eye: hex(0x46f0e8), eyeGlow: 1, wet: 0.85, kelp: 1, sun: 0 },
};

const HEAD_TOP = 2.0;

function zombiePaint(kind: string) {
  const P = PAL[kind] ?? PAL.zombie;
  return (s: Sample) => {
    const prim = s.prim;
    if (prim === 'head' || prim === 'nose') return head(s, P);
    if (prim === 'torso') return torso(s, P);
    if (prim.startsWith('arm') || prim.startsWith('fore')) return arm(s, P);
    return leg(s, P);
  };
}

function rotSkin(s: Sample, P: ZPal) {
  skin(s, P.skin, { mottle: 0.9, pores: 0.0004, wrinkles: 0.6, sss: 0.55, rough: 0.55 - P.wet * 0.3, blotch: P.skinDark, blotchAmt: 0.55, vein: P.skinDark, veinAmt: 0.35 });
  // necrotic lesions
  const w = worley3(s.x * 9 + 3, s.y * 9, s.z * 9, 1);
  const lesion = smooth(0.32, 0.18, w.f1) * smooth(0.55, 0.85, w.id);
  if (lesion > 0) {
    mixRGB(s, P.rot, lesion * 0.8);
    s.height -= lesion * 0.0018;
    s.rough = Math.max(0.2, s.rough - lesion * 0.25);
  }
  if (P.sun > 0) {
    // cracked dry skin
    const c = worley3(s.x * 40, s.y * 40, s.z * 40, 1);
    const cr = smooth(0.08, 0.0, c.f2 - c.f1);
    s.height -= cr * 0.0005;
    mulRGB(s, 1 - cr * 0.25);
    s.rough = 0.75;
  }
  if (P.kelp > 0) {
    // barnacles / algae film
    const a = smooth(0.1, 0.6, fbm3(s.x * 5 + 7, s.y * 5, s.z * 5, 4));
    mixRGB(s, hex(0x2c5a2a), a * 0.35);
  }
}

function head(s: Sample, P: ZPal) {
  rotSkin(s, P);
  const top = HEAD_TOP;
  // hair: matted strands on the scalp, ragged hairline
  const ragged = noise3(s.x * 40, s.y * 10, s.z * 40) * 0.025 + fbm3(s.x * 12, 0, s.z * 12, 2) * 0.03;
  let hairLine = top - 0.09;
  if (s.face === 'back') hairLine = top - 0.33;
  else if (s.face === 'left' || s.face === 'right') hairLine = top - 0.16 - Math.max(0, (s.z + 0.25) / 0.5) * 0.12;
  const hairM = s.face === 'top' ? 1 : smooth(hairLine - 0.015, hairLine + 0.015, s.y + ragged);
  if (hairM > 0 && s.prim === 'head') {
    const keep = { r: s.r, g: s.g, b: s.b, h: s.height, ro: s.rough, ss: s.sss };
    fur(s, P.hair, { dir: [0, -0.4, 0.9], len: 0.05, width: 0.0018, depth: 0.0015, rough: 0.6 - P.wet * 0.3, sss: 0.2, vary: 0.35 });
    // bald patches
    const bald = smooth(0.25, 0.45, fbm3(s.x * 7 + 1, s.y * 7, s.z * 7, 3));
    const m = hairM * (1 - bald * 0.85);
    s.r = keep.r + (s.r - keep.r) * m; s.g = keep.g + (s.g - keep.g) * m; s.b = keep.b + (s.b - keep.b) * m;
    s.height = keep.h + (s.height - keep.h) * m; s.rough = keep.ro + (s.rough - keep.ro) * m; s.sss = keep.ss + (s.sss - keep.ss) * m;
  }
  if (s.face !== 'front') return;
  if (s.prim === 'nose') {
    // nostrils at the bottom of the nose
    mulRGB(s, 0.8);
    const [x, y] = mcXY(s);
    void x;
    if (s.v < 0.012) mulRGB(s, 0.6);
    void y;
    return;
  }
  // brow ridge (row 3), sunken sockets (row 4), cheek hollows, mouth (row 6)
  const brow = rectMask(s, 0.6, 2.7, 6.8, 1.1, 0.5, 0.5);
  s.height += brow * 0.002;
  for (const cx of [2, 6]) {
    const sock = ellipseMask(s, cx, 4.45, 1.45, 0.95, 0.6);
    s.height -= sock * 0.004;
    mixRGB(s, P.skinDark, sock * 0.7);
    s.ao *= 1 - sock * 0.45;
    const eyeM = rectMask(s, cx - 1, 4, 2, 1, 0.2, 0.35);
    if (eyeM > 0) {
      const gl = P.eyeGlow;
      mixRGB(s, P.eye, eyeM);
      s.rough = s.rough + (0.12 - s.rough) * eyeM;
      s.height -= eyeM * 0.001;
      if (gl > 0) {
        s.em = Math.max(s.em, eyeM * 0.9);
      } else {
        // dull filmy eyeball deep in the socket
        const film = ellipseMask(s, cx + 0.2, 4.45, 0.45, 0.32, 0.4);
        mixRGB(s, hex(0x2a2f22), film * 0.55);
      }
    }
  }
  const cheek = ellipseMask(s, 1.3, 6, 1.1, 1.2, 0.8) + ellipseMask(s, 6.7, 6, 1.1, 1.2, 0.8);
  s.height -= cheek * 0.0012;
  // mouth: dark slit with lips and a few teeth
  const mouth = rectMask(s, 2, 6.25, 4, 0.7, 0.25, 0.3);
  if (mouth > 0) {
    const [x] = mcXY(s);
    const tooth = smooth(0.3, 0.1, Math.abs(((x * 2.2) % 1) - 0.5)) * rectMask(s, 2.3, 6.3, 3.4, 0.3, 0.15, 0.1);
    mixRGB(s, hex(0x1a0d08), mouth * 0.92);
    mixRGB(s, hex(0x8a7a4a), tooth * 0.7 * mouth);
    s.height -= mouth * 0.0025 * (1 - tooth * 0.7);
    s.rough = s.rough + (0.3 - s.rough) * mouth;
  }
  const lip = rectMask(s, 1.8, 5.95, 4.4, 1.3, 0.35, 0.5) - mouth;
  if (lip > 0) mixRGB(s, P.skinDark, lip * 0.5);
}

function torso(s: Sample, P: ZPal) {
  const neckHole = s.face === 'front' ? smooth(0.04, 0.0, Math.abs(s.u - s.w / 2) * 0.8 - (1.5 - (s.h - s.v) / PX) * 0.035 + 0.005) : 0;
  // tears: worley holes with frayed edges
  const t = worley3(s.x * 7 + 2, s.y * 7, s.z * 7, 1);
  const tearShape = smooth(0.3, 0.26, t.f1 + noise3(s.x * 70, s.y * 70, s.z * 70) * 0.05) * smooth(0.45, 0.7, t.id);
  const tear = Math.max(neckHole, tearShape);
  // shirt
  cloth(s, P.shirt, { thread: 0.004, wear: 0.45, dirt: hex(0x3b3324), dirtAmt: 0.55, rough: 0.82 - P.wet * 0.35, seed: 1 });
  // blood/rot stains
  const st = smooth(0.25, 0.6, fbm3(s.x * 6 + 5, s.y * 6, s.z * 6, 4));
  mixRGB(s, kindStain(P), st * 0.45);
  if (P.kelp > 0) kelpStrands(s);
  if (tear > 0.01) {
    const shirtR = s.r, shirtG = s.g, shirtB = s.b, shirtH = s.height, shirtRo = s.rough, shirtS = s.sss;
    rotSkin(s, P);
    s.height -= 0.0015;
    const k = tear;
    s.r = shirtR + (s.r - shirtR) * k; s.g = shirtG + (s.g - shirtG) * k; s.b = shirtB + (s.b - shirtB) * k;
    s.height = shirtH + (s.height - shirtH) * k; s.rough = shirtRo + (s.rough - shirtRo) * k; s.sss = shirtS + (s.sss - shirtS) * k;
    // frayed dark rim
    const rim = smooth(0.0, 0.5, tear) * smooth(1.0, 0.5, tear);
    mulRGB(s, 1 - rim * 0.45);
    s.height += rim * 0.0008;
  }
}

function kindStain(P: ZPal): RGB {
  return P.sun ? hex(0x5a4a30) : P.kelp ? hex(0x1e3a30) : hex(0x3a2a14);
}

function kelpStrands(s: Sample) {
  const k = ridged3(s.x * 6, s.y * 1.5, s.z * 6, 2);
  const m = smooth(0.8, 0.95, k) * smooth(0.0, 0.4, fbm3(s.x * 3, s.y * 3, s.z * 3, 2) + 0.1);
  if (m > 0) {
    mixRGB(s, hex(0x2f5b22), m * 0.9);
    s.height += m * 0.002;
    s.rough = 0.35;
  }
}

function arm(s: Sample, P: ZPal) {
  rotSkin(s, P);
  // hand: bottom 0.12 m — knuckles, finger creases, darker grime under nails
  const bottom = s.y - (s.prim.startsWith('fore') ? 0.75 : 1.125);
  if (s.prim.startsWith('fore') && bottom < 0.14) {
    const hand = smooth(0.14, 0.1, bottom);
    mixRGB(s, P.skinDark, hand * 0.25);
    if (s.face === 'front' || s.face === 'bottom') {
      const fingers = Math.abs(Math.sin((s.u / s.w) * Math.PI * 4));
      s.height += hand * (fingers * 0.0015 - 0.0005);
      s.ao *= 1 - hand * (1 - fingers) * 0.35;
    }
    if (bottom < 0.02) mulRGB(s, 0.75);
  }
  grime(s, hex(0x2a2416), 0.25, 5);
  if (P.kelp > 0) kelpStrands(s);
}

function leg(s: Sample, P: ZPal) {
  if (s.y < 0.105) {
    // worn leather shoes
    const keep = s.y;
    cloth(s, P.shoes, { thread: 0.0018, wear: 0.3, rough: 0.6 - P.wet * 0.25, seed: 4 });
    const scuff = smooth(0.2, 0.7, fbm3(s.x * 14, s.y * 14, s.z * 14, 3));
    mulRGB(s, 1 - scuff * 0.25);
    s.height += smooth(0.1, 0.095, keep) * -0.001;
    if (keep < 0.022) { mulRGB(s, 0.55); s.rough = 0.8; }
    return;
  }
  cloth(s, P.pants, { thread: 0.0028, twill: true, wear: 0.55, dirt: hex(0x2e2618), dirtAmt: 0.6, rough: 0.84 - P.wet * 0.35, seed: 3 });
  // knee wear, torn hems
  const knee = smooth(0.09, 0.0, Math.abs(s.y - 0.38)) * (s.face === 'front' ? 1 : 0.2);
  const l = (s.r + s.g + s.b) / 3;
  s.r += (l * 1.25 - s.r) * knee * 0.5; s.g += (l * 1.25 - s.g) * knee * 0.5; s.b += (l * 1.2 - s.b) * knee * 0.5;
  const hem = smooth(0.13, 0.105, s.y + noise3(s.x * 60, 0, s.z * 60) * 0.01);
  if (hem > 0) { rotSkin(s, P); s.height -= 0.001; }
  if (P.kelp > 0) kelpStrands(s);
}

export function zombieModel(kind: 'zombie' | 'husk' | 'drowned' = 'zombie'): ModelDef {
  return humanoidDef({
    key: 'zombie:' + kind,
    paint: zombiePaint(kind),
    nose: { w: 2, h: 1.4, d: 0.55, row: 4.9 },
    sss: 0.55,
    blood: kind === 'drowned' ? 2 : 0,
  });
}
