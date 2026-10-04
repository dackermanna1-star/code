/**
 * The player's own body (third person, and what you see of yourself through portals): Steve's
 * proportions with healthy skin, short brown hair, a cyan cotton tee, indigo jeans and grey
 * sneakers, painted procedurally like the mobs.
 */
import { type ModelDef, type Sample } from '../def';
import { humanoidDef } from './humanoid';
import { cloth, ellipseMask, fbm3, fur, hex, mixRGB, mulRGB, noise3, rectMask, skin, smooth } from '../paint/brushes';

const SKIN = hex(0xc69477);
const SKIN_DARK = hex(0x9a6a50);
const HAIR = hex(0x3b2414);
const SHIRT = hex(0x2fb4b4);
const JEANS = hex(0x3a3f8e);
const SHOES = hex(0x55585e);
const EYE_WHITE = hex(0xe8e8ec);
const IRIS = hex(0x4a3cb0);
const HEAD_TOP = 2.0;

function healthySkin(s: Sample) {
  skin(s, SKIN, { mottle: 0.35, pores: 0.0003, wrinkles: 0.15, sss: 0.6, rough: 0.48, blotch: SKIN_DARK, blotchAmt: 0.15 });
}

function head(s: Sample) {
  healthySkin(s);
  const ragged = noise3(s.x * 40, s.y * 10, s.z * 40) * 0.012;
  let hairLine = HEAD_TOP - 0.1;
  if (s.face === 'back') hairLine = HEAD_TOP - 0.3;
  else if (s.face === 'left' || s.face === 'right') hairLine = HEAD_TOP - 0.15 - Math.max(0, (s.z + 0.25) / 0.5) * 0.1;
  const hairM = s.face === 'top' ? 1 : smooth(hairLine - 0.01, hairLine + 0.01, s.y + ragged);
  if (hairM > 0 && s.prim === 'head') {
    const keep = { r: s.r, g: s.g, b: s.b, h: s.height, ro: s.rough, ss: s.sss };
    fur(s, HAIR, { dir: [0, -0.3, 0.95], len: 0.04, width: 0.0016, depth: 0.0012, rough: 0.55, sss: 0.15, vary: 0.25 });
    const m = hairM;
    s.r = keep.r + (s.r - keep.r) * m; s.g = keep.g + (s.g - keep.g) * m; s.b = keep.b + (s.b - keep.b) * m;
    s.height = keep.h + (s.height - keep.h) * m; s.rough = keep.ro + (s.rough - keep.ro) * m; s.sss = keep.ss + (s.sss - keep.ss) * m;
  }
  if (s.face !== 'front' || s.prim !== 'head') return;
  // eyes (row 4): white + blue-violet iris, short beard shadow, mouth
  for (const cx of [2, 6]) {
    const white = rectMask(s, cx - 1, 4, 2, 1, 0.15, 0.25);
    if (white > 0) {
      mixRGB(s, EYE_WHITE, white);
      const iris = rectMask(s, cx + (cx < 4 ? 0 : -1), 4, 1, 1, 0.15, 0.25);
      mixRGB(s, IRIS, iris * white);
      s.rough = s.rough + (0.1 - s.rough) * white;
    }
    const brow = rectMask(s, cx - 1.1, 3.1, 2.2, 0.5, 0.25, 0.3);
    mixRGB(s, HAIR, brow * 0.85);
  }
  const beard = smooth(0.35, 0.65, fbm3(s.x * 30, s.y * 30, s.z * 30, 2)) * rectMask(s, 1, 6, 6, 2, 0.6, 0.6);
  mixRGB(s, SKIN_DARK, beard * 0.25);
  const mouth = rectMask(s, 2.5, 6.35, 3, 0.55, 0.25, 0.3);
  mixRGB(s, hex(0x6a3a2c), mouth * 0.8);
}

function torso(s: Sample) {
  cloth(s, SHIRT, { thread: 0.0035, wear: 0.15, dirt: hex(0x3b3a34), dirtAmt: 0.12, rough: 0.82, seed: 1 });
  // collar
  if (s.face === 'front') {
    const collar = ellipseMask(s, 4, 0.2, 2.2, 1.1, 0.4);
    if (collar > 0) {
      healthySkin(s);
      const k = collar;
      mixRGB(s, SKIN, k);
    }
  }
}

function arm(s: Sample) {
  // short tee sleeves on the upper arm
  if (!s.prim.startsWith('fore') && s.y > 1.25) {
    cloth(s, SHIRT, { thread: 0.0035, wear: 0.15, rough: 0.82, seed: 2 });
    return;
  }
  healthySkin(s);
  const bottom = s.y - (s.prim.startsWith('fore') ? 0.75 : 1.125);
  if (s.prim.startsWith('fore') && bottom < 0.14 && (s.face === 'front' || s.face === 'bottom')) {
    const hand = smooth(0.14, 0.1, bottom);
    const fingers = Math.abs(Math.sin((s.u / s.w) * Math.PI * 4));
    s.height += hand * (fingers * 0.0012 - 0.0004);
    s.ao *= 1 - hand * (1 - fingers) * 0.3;
  }
}

function leg(s: Sample) {
  if (s.y < 0.11) {
    cloth(s, SHOES, { thread: 0.0018, wear: 0.2, rough: 0.6, seed: 4 });
    if (s.y < 0.025) mulRGB(s, 0.55);
    return;
  }
  cloth(s, JEANS, { thread: 0.0026, twill: true, wear: 0.35, dirt: hex(0x2e2a24), dirtAmt: 0.15, rough: 0.86, seed: 3 });
  const seam = smooth(0.012, 0.0, Math.abs(s.u - s.w / 2)) * (s.face === 'left' || s.face === 'right' ? 1 : 0);
  mulRGB(s, 1 - seam * 0.25);
}

export function playerModel(): ModelDef {
  return humanoidDef({
    key: 'player:steve',
    paint: (s: Sample) => {
      const prim = s.prim;
      if (prim === 'head' || prim === 'nose') return head(s);
      if (prim === 'torso') return torso(s);
      if (prim.startsWith('arm') || prim.startsWith('fore')) return arm(s);
      return leg(s);
    },
    sss: 0.5,
    blood: 0,
    mass: 75,
  });
}
