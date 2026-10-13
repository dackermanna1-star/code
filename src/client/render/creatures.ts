import * as THREE from 'three';
import { instantiate, shade, template, type Instance, type ModelBuilder, type Painter } from './voxelmodel';

/**
 * Blocky creature + humanoid models (wildlife, scavenger NPCs, players,
 * corpses) and their procedural animation. Models face -Z with their feet
 * at y = 0; one Minecraft "pixel" on humanoids is 1.8 / 32 blocks.
 */

export type SpeciesKey = 'stag' | 'boar' | 'wolf' | 'bear';

export interface Rig {
  biped: boolean;
  inst: Instance;
  body: THREE.Group | null;
  bodyY: number;
  head: THREE.Group;
  headRX: number;
  jaw: THREE.Group | null;
  /** quadrupeds: FL, FR, BL, BR; bipeds: L, R */
  legs: THREE.Group[];
  /** bipeds: L, R */
  arms: THREE.Group[];
  tail: THREE.Group | null;
  tailRX: number;
  ears: THREE.Group[];
  held: THREE.Group | null;
  /** leg length (stride scale) */
  legLen: number;
  walk: number;
  run: number;
  /** idle grazing head-down angle (0 = never grazes) */
  graze: number;
  /** corpse layout: body half width and body centre height */
  halfW: number;
  midY: number;
}

// ---------------------------------------------------------------- painting helpers
type P = Painter;
/** 2x2-ish eye: pupil with a 1px highlight above-front. */
function eye(p: P, x: number, y: number, iris: number, pupil = 0x111111, big = false) {
  p.px(x, y, iris, 0);
  if (big) {
    p.px(x + 1, y, pupil, 0);
    p.px(x, y - 1, 0xffffff, 0);
  } else if (iris !== pupil) p.px(x + 1, y, pupil, 0);
}
function stitchesH(p: P, y: number, c: number) {
  for (let x = 0; x < p.w; x += 2) p.px(x, y, c, 0.05);
}

// ---------------------------------------------------------------- species
function buildStag(m: ModelBuilder) {
  const FUR = 0x9c6b3f, DARK = 0x6e4a2a, BELLY = 0xd6b88e, HOOF = 0x2b2018, ANT = 0xe4d6b2, NOSE = 0x1c1816, WHITE = 0xefe4cc, INNER = 0xd9b49a;
  const body = m.part('body', null, [0, 1.04, 0]);
  body.box([0.46, 0.48, 1.1], [0, 0, 0], FUR, {
    f: {
      bottom: (p) => p.fill(BELLY, 0.05),
      side: (p) => {
        p.rows(p.h - 1, 1, BELLY);
        p.rows(p.h - 2, 1, shade(FUR, 1.12));
        for (let i = 0; i < 5; i++) p.px(4 + i * 3, 2 + (i % 2), shade(FUR, 1.25), 0.05); // faint spots
      },
      back: (p) => { p.rect(2, 2, p.w - 4, p.h - 3, WHITE); p.rect(2, p.h - 1, p.w - 4, 1, shade(WHITE, 0.9)); },
      top: (p) => { p.cols(p.cx - 1, 2, DARK); },
    },
  });
  m.part('tail', 'body', [0, 0.2, 0.55]).box([0.12, 0.2, 0.06], [0, -0.08, 0.03], FUR, { f: { back: (p) => p.fill(WHITE, 0.03) } });
  const head = m.part('head', 'body', [0, 0.14, -0.48]);
  head.box([0.22, 0.52, 0.24], [0, 0.2, -0.06], FUR, { r: [-0.35, 0, 0], f: { front: (p) => p.fill(BELLY, 0.04) } });
  head.box([0.28, 0.28, 0.32], [0, 0.48, -0.2], FUR, {
    d: 25,
    f: {
      side: (p) => { eye(p, 2, 3, 0x161210, 0x161210); p.px(2, 2, 0xfaf6ee, 0); p.px(3, 3, NOSE, 0); p.rows(p.h - 1, 1, BELLY); },
      front: (p) => { p.rect(1, 2, p.w - 2, 1, DARK); p.rows(p.h - 2, 2, BELLY); },
      top: (p) => p.rect(1, 0, p.w - 2, p.h, DARK),
    },
  });
  head.box([0.18, 0.17, 0.22], [0, 0.42, -0.46], shade(FUR, 0.92), {
    d: 25,
    f: {
      front: (p) => { p.rect(1, 0, p.w - 2, 2, NOSE); p.rows(p.h - 1, 1, BELLY); },
      bottom: (p) => p.fill(BELLY, 0.04),
      side: (p) => p.rows(p.h - 1, 1, BELLY),
    },
  });
  for (const sx of [-1, 1]) {
    head.box([0.07, 0.18, 0.11], [sx * 0.19, 0.6, -0.12], FUR, { r: [0, 0, -sx * 0.9], f: { front: (p) => p.rect(1, 1, p.w - 2, p.h - 2, INNER) } });
    // antlers
    head.box([0.05, 0.3, 0.05], [sx * 0.12, 0.75, -0.16], ANT, { r: [0.15, 0, -sx * 0.45] });
    head.box([0.05, 0.32, 0.05], [sx * 0.24, 1.0, -0.12], ANT, { r: [0.3, 0, -sx * 0.2] });
    head.box([0.04, 0.17, 0.04], [sx * 0.15, 0.86, -0.25], ANT, { r: [-0.9, 0, 0] });
    head.box([0.04, 0.2, 0.04], [sx * 0.35, 1.02, -0.1], ANT, { r: [0, 0, -sx * 1.0] });
    head.box([0.04, 0.15, 0.04], [sx * 0.27, 1.2, 0.0], ANT, { r: [0.6, 0, -sx * 0.1] });
    head.box([0.04, 0.14, 0.04], [sx * 0.31, 1.15, -0.2], ANT, { r: [-0.6, 0, -sx * 0.3] });
  }
  const legs: Array<[string, number, number]> = [['legFL', -1, -0.4], ['legFR', 1, -0.4], ['legBL', -1, 0.42], ['legBR', 1, 0.42]];
  for (const [k, sx, z] of legs) {
    const l = m.part(k, null, [sx * 0.15, 0.82, z]);
    l.box([0.14, 0.4, 0.16], [0, -0.16, 0], FUR, { f: { side: (p) => p.rows(0, 1, shade(FUR, 0.9)) } });
    l.box([0.1, 0.4, 0.1], [0, -0.56, 0], shade(FUR, 0.86));
    l.box([0.11, 0.07, 0.12], [0, -0.795, -0.01], HOOF);
  }
}

function buildBoar(m: ModelBuilder) {
  const FUR = 0x5d4838, DARK = 0x3d2e24, MANE = 0x261c16, SNOUT = 0x8e6e60, NOSE = 0x3a2420, TUSK = 0xefe8d2, HOOF = 0x1e1814, EYE = 0x140d0a;
  const body = m.part('body', null, [0, 0.62, 0]);
  const bristle = (p: P) => p.speckle(shade(FUR, 0.72), 0.18);
  body.box([0.58, 0.52, 0.96], [0, 0, 0.06], FUR, { f: { all: bristle, bottom: (p) => p.fill(shade(FUR, 1.15), 0.06), top: (p) => p.cols(p.cx - 1, 2, DARK) } });
  body.box([0.62, 0.6, 0.4], [0, 0.04, -0.26], shade(FUR, 0.94), { f: { all: bristle } });
  const mane = (p: P) => { p.speckle(shade(MANE, 1.5), 0.2); if (p.face === 'left' || p.face === 'right') for (let x = 0; x < p.w; x += 2) p.px(x, p.h - 1, FUR, 0.1); };
  body.box([0.16, 0.09, 0.42], [0, 0.375, -0.26], MANE, { n: 0.15, f: { all: mane } });
  body.box([0.11, 0.07, 0.46], [0, 0.29, 0.17], MANE, { n: 0.15, f: { all: mane } });
  const tail = m.part('tail', 'body', [0, 0.18, 0.54]);
  tail.box([0.05, 0.2, 0.05], [0, -0.1, 0.01], DARK);
  tail.box([0.08, 0.08, 0.06], [0, -0.22, 0.01], MANE, { n: 0.15 });
  const head = m.part('head', 'body', [0, 0.08, -0.46]);
  head.box([0.42, 0.4, 0.34], [0, -0.04, -0.14], FUR, {
    d: 20,
    f: {
      all: bristle,
      front: (p) => { p.rows(1, 1, DARK); eye(p, 1, 3, EYE, EYE); eye(p, p.w - 2, 3, EYE, EYE); p.px(1, 2, 0xd8d0c0, 0); p.px(p.w - 2, 2, 0xd8d0c0, 0); },
      side: (p) => { eye(p, 1, 3, EYE, EYE); },
    },
  });
  head.box([0.26, 0.2, 0.14], [0, -0.12, -0.37], SNOUT, {
    d: 20,
    f: { front: (p) => { p.border(0.85); p.rect(1, 1, 1, 2, NOSE); p.rect(p.w - 2, 1, 1, 2, NOSE); }, bottom: (p) => p.fill(shade(SNOUT, 0.8)) },
  });
  for (const sx of [-1, 1]) {
    head.box([0.045, 0.13, 0.045], [sx * 0.16, -0.12, -0.39], TUSK, { r: [0, 0, -sx * 0.35], n: 0.03 });
    head.box([0.04, 0.07, 0.04], [sx * 0.2, -0.03, -0.4], TUSK, { r: [0.3, 0, -sx * 0.9], n: 0.03 });
    head.box([0.1, 0.13, 0.05], [sx * 0.17, 0.2, -0.04], DARK, { r: [0.3, 0, -sx * 0.6], f: { front: (p) => p.rect(1, 1, p.w - 2, p.h - 1, 0x7a5050) } });
  }
  const legs: Array<[string, number, number]> = [['legFL', -1, -0.3], ['legFR', 1, -0.3], ['legBL', -1, 0.38], ['legBR', 1, 0.38]];
  for (const [k, sx, z] of legs) {
    m.part(k, null, [sx * 0.18, 0.38, z]).box([0.15, 0.4, 0.15], [0, -0.19, 0], DARK, { f: { all: (p) => p.rows(p.h - 1, 1, HOOF), front: (p) => { p.rows(p.h - 2, 2, HOOF); p.px(p.cx, p.h - 2, shade(HOOF, 1.6), 0); } } });
  }
}

function buildWolf(m: ModelBuilder) {
  const FUR = 0x8f9096, BACK = 0x5c5d66, LIGHT = 0xd6d6d8, NOSE = 0x161616, EYE = 0xf0b42a, PUPIL = 0x161010, INNER = 0x4a3838;
  const body = m.part('body', null, [0, 0.72, 0]);
  body.box([0.32, 0.32, 0.7], [0, -0.02, 0.12], FUR, {
    f: { top: (p) => p.rect(1, 0, p.w - 2, p.h, BACK), side: (p) => { p.rows(0, 2, BACK); p.rows(p.h - 1, 1, LIGHT); }, bottom: (p) => p.fill(LIGHT, 0.04) },
  });
  body.box([0.44, 0.44, 0.36], [0, 0.04, -0.28], FUR, {
    f: {
      all: (p) => p.speckle(shade(FUR, 1.15), 0.15),
      top: (p) => p.rect(1, 1, p.w - 2, p.h - 1, BACK),
      side: (p) => { p.rows(0, 2, BACK); p.rows(p.h - 2, 2, LIGHT); },
      front: (p) => { p.rows(0, 2, BACK); p.rect(2, 2, p.w - 4, p.h - 2, LIGHT); },
    },
  });
  const tail = m.part('tail', 'body', [0, 0.08, 0.46], [0.65, 0, 0]);
  tail.box([0.13, 0.13, 0.48], [0, 0, 0.24], FUR, { f: { back: (p) => p.fill(LIGHT, 0.04), side: (p) => { p.rect(p.w - 2, 0, 2, p.h, LIGHT); p.rows(0, 1, BACK); }, top: (p) => p.rect(0, 0, p.w, p.h - 2, BACK) } });
  const head = m.part('head', 'body', [0, 0.1, -0.46]);
  head.box([0.34, 0.3, 0.28], [0, 0.04, -0.12], FUR, {
    d: 24,
    f: {
      front: (p) => {
        p.rows(0, 1, BACK);
        p.rect(1, 2, 2, 1, shade(BACK, 0.8)); p.rect(p.w - 3, 2, 2, 1, shade(BACK, 0.8));
        p.px(1, 3, EYE, 0); p.px(2, 3, PUPIL, 0); p.px(p.w - 2, 3, EYE, 0); p.px(p.w - 3, 3, PUPIL, 0);
        p.rows(p.h - 2, 2, LIGHT); p.rect(0, 4, 1, 1, LIGHT); p.rect(p.w - 1, 4, 1, 1, LIGHT);
      },
      side: (p) => { p.px(1, 3, EYE, 0); p.px(0, 3, PUPIL, 0); p.rows(p.h - 2, 2, LIGHT); p.rows(0, 1, BACK); },
      top: (p) => p.fill(BACK),
    },
  });
  head.box([0.18, 0.14, 0.22], [0, -0.03, -0.36], LIGHT, {
    d: 24,
    f: { front: (p) => { p.rect(1, 0, p.w - 2, 2, NOSE); p.rows(p.h - 1, 1, shade(LIGHT, 0.75)); }, top: (p) => p.rect(1, 0, p.w - 2, p.h, shade(FUR, 0.95)), side: (p) => p.rows(p.h - 1, 1, 0x5a4444) },
  });
  const ears: Array<[string, number]> = [['earL', -1], ['earR', 1]];
  for (const [k, sx] of ears) {
    const e = m.part(k, 'head', [sx * 0.11, 0.18, -0.06]);
    e.box([0.11, 0.12, 0.06], [0, 0.06, 0], FUR, { f: { front: (p) => p.rect(1, 1, p.w - 2, p.h - 1, INNER), top: (p) => p.fill(BACK) } });
    e.box([0.06, 0.07, 0.05], [sx * -0.01, 0.15, 0], BACK);
  }
  const legs: Array<[string, number, number]> = [['legFL', -1, -0.3], ['legFR', 1, -0.3], ['legBL', -1, 0.36], ['legBR', 1, 0.36]];
  for (const [k, sx, z] of legs) {
    m.part(k, null, [sx * 0.12, 0.52, z]).box([0.12, 0.56, 0.12], [0, -0.25, 0], FUR, { f: { all: (p) => p.rows(p.h - 2, 2, LIGHT), front: (p) => p.rows(p.h - 1, 1, shade(LIGHT, 0.8)) } });
  }
}

function buildBear(m: ModelBuilder) {
  const FUR = 0x5c3b24, DARK = 0x3d2717, MUZZLE = 0x9c7652, NOSE = 0x141010, CLAW = 0xd9cdb2, MOUTH = 0x6e1f1f, TEETH = 0xeee8d8, EYE = 0x0e0a08;
  const shag = (p: P) => { p.speckle(shade(FUR, 0.8), 0.2); p.speckle(shade(FUR, 1.18), 0.1); };
  const body = m.part('body', null, [0, 1.02, 0]);
  body.box([0.96, 0.84, 1.5], [0, 0, 0.04], FUR, { f: { all: shag, top: (p) => { shag(p); p.rect(2, 0, p.w - 4, 6, DARK); }, bottom: (p) => p.fill(DARK) } });
  body.box([0.8, 0.22, 0.52], [0, 0.5, -0.34], DARK, { f: { all: shag } });
  body.box([0.14, 0.12, 0.08], [0, 0.22, 0.83], DARK);
  const head = m.part('head', 'body', [0, 0.16, -0.72]);
  head.box([0.56, 0.5, 0.44], [0, 0.02, -0.2], FUR, {
    d: 20,
    f: {
      all: shag,
      front: (p) => { shag(p); p.rect(1, 2, 3, 1, DARK); p.rect(p.w - 4, 2, 3, 1, DARK); eye(p, 2, 4, EYE, EYE); eye(p, p.w - 3, 4, EYE, EYE); p.px(2, 3, 0xffffff, 0); p.px(p.w - 3, 3, 0xffffff, 0); },
      side: (p) => { shag(p); p.px(1, 4, EYE, 0); },
    },
  });
  head.box([0.3, 0.22, 0.24], [0, -0.08, -0.53], MUZZLE, {
    d: 20,
    f: {
      front: (p) => { p.rect(p.cx - 1, 0, 2, 2, NOSE); p.px(p.cx - 2, 0, NOSE, 0); p.px(p.cx + 1, 0, NOSE, 0); p.rect(p.cx - 1, p.h - 1, 2, 1, shade(MUZZLE, 0.6)); },
      bottom: (p) => { p.fill(MOUTH); p.rows(0, 1, TEETH); p.cols(0, 1, TEETH); p.cols(p.w - 1, 1, TEETH); },
      top: (p) => p.rows(p.h - 1, 1, FUR),
    },
  });
  const jaw = m.part('jaw', 'head', [0, -0.19, -0.42]);
  jaw.box([0.26, 0.07, 0.24], [0, -0.035, -0.11], shade(MUZZLE, 0.85), { d: 20, f: { top: (p) => { p.fill(MOUTH); p.rows(0, 1, TEETH); p.cols(0, 1, TEETH); p.cols(p.w - 1, 1, TEETH); } } });
  for (const sx of [-1, 1]) {
    head.box([0.15, 0.14, 0.08], [sx * 0.22, 0.31, -0.08], FUR, { f: { front: (p) => p.rect(1, 1, p.w - 2, p.h - 1, DARK) } });
  }
  const legs: Array<[string, number, number]> = [['legFL', -1, -0.48], ['legFR', 1, -0.48], ['legBL', -1, 0.5], ['legBR', 1, 0.5]];
  for (const [k, sx, z] of legs) {
    const l = m.part(k, null, [sx * 0.3, 0.6, z]);
    l.box([0.3, 0.62, 0.32], [0, -0.29, 0], DARK, { f: { all: (p) => { shag(p); p.rows(p.h - 2, 2, shade(DARK, 0.7)); } } });
    for (const cx of [-0.09, 0, 0.09]) l.box([0.05, 0.05, 0.06], [cx, -0.575, -0.18], CLAW, { n: 0.03 });
  }
}

// ---------------------------------------------------------------- humanoids
const PX = 1.8 / 32;
const HD = 1 / PX; // texels per unit: 8px heads like Minecraft

export interface Outfit {
  key: string;
  skin: number;
  hair: number;
  torso: number;
  arms: number;
  hands: number;
  legs: number;
  feet: number;
  head?: number;
  mask?: boolean;
  vest?: number;
  scavenger?: boolean;
  dead?: boolean;
}

function buildHumanoid(m: ModelBuilder, o: Outfit) {
  const S = PX;
  const skinFace = (p: P) => {
    // Minecraft-style face: hair band, white/iris eyes, mouth
    p.rows(0, 2, o.hair, 0.08);
    p.px(0, 2, o.hair, 0.08); p.px(p.w - 1, 2, o.hair, 0.08);
    const eyeC = o.dead ? 0x3a2020 : 0x2a3a6a;
    if (o.dead) {
      // X eyes
      for (const ex of [1, p.w - 3]) { p.px(ex, 3, eyeC, 0); p.px(ex + 1, 4, eyeC, 0); p.px(ex + 1, 3, eyeC, 0); p.px(ex, 4, eyeC, 0); }
    } else {
      p.px(1, 4, 0xf4f4f4, 0); p.px(2, 4, eyeC, 0);
      p.px(p.w - 2, 4, 0xf4f4f4, 0); p.px(p.w - 3, 4, eyeC, 0);
    }
    p.rect(3, 6, 2, 1, shade(o.skin, 0.7), 0);
    p.px(3, 5, shade(o.skin, 0.88), 0); p.px(4, 5, shade(o.skin, 0.88), 0);
  };
  const legs: Array<[string, number]> = [['legL', -1], ['legR', 1]];
  for (const [k, sx] of legs) {
    const l = m.part(k, null, [sx * 2 * S, 12 * S, 0]);
    const pantsDetail = (p: P) => {
      p.rows(0, 1, shade(o.legs, 0.85));
      p.rows(p.h - 3, 3, o.feet, 0.06);
      p.rows(p.h - 1, 1, shade(o.feet, 0.7), 0.04);
    };
    l.box([4 * S, 12 * S, 4 * S], [0, -6 * S, 0], o.legs, {
      d: HD,
      f: {
        all: pantsDetail,
        front: (p) => {
          pantsDetail(p);
          // scavengers wear patched trousers
          if (o.scavenger) { p.rect(sx < 0 ? 1 : 0, 5, 2, 2, shade(o.legs, 1.25)); p.px(1, 5, shade(o.legs, 0.7), 0); }
          p.cols(sx < 0 ? p.w - 1 : 0, 1, shade(o.legs, 0.9));
        },
        bottom: (p) => p.fill(shade(o.feet, 0.6)),
      },
    });
    if (o.scavenger) l.box([4.2 * S, 1.4 * S, 1.2 * S], [0, -11.3 * S, -2.4 * S], o.feet, { d: HD });
  }
  const hips = m.part('hips', null, [0, 12 * S, 0]);
  const torsoFront = (p: P) => {
    if (o.scavenger) {
      p.cols(p.cx, 1, shade(o.torso, 0.7));
      p.rect(1, 3, 2, 2, shade(o.torso, 0.82)); p.rect(p.w - 3, 3, 2, 2, shade(o.torso, 0.82));
      p.rect(1, 6, 2, 2, shade(o.torso, 1.2));
    } else if (o.torso !== o.skin) {
      p.rect(2, 0, p.w - 4, 1, shade(o.torso, 0.75)); // collar
    }
    p.rows(p.h - 2, 1, o.scavenger ? 0x4a3220 : shade(o.legs, 0.8));
    if (o.scavenger) p.rect(p.cx - 1, p.h - 2, 2, 1, 0xb0a070, 0);
  };
  hips.box([8 * S, 12 * S, 4 * S], [0, 6 * S, 0], o.torso, {
    d: HD,
    f: { front: torsoFront, back: (p) => { p.rows(p.h - 2, 1, o.scavenger ? 0x4a3220 : shade(o.legs, 0.8)); }, side: (p) => p.rows(p.h - 2, 1, o.scavenger ? 0x4a3220 : shade(o.legs, 0.8)) },
  });
  if (o.vest !== undefined || o.scavenger) {
    const plate = o.vest ?? 0x8a5a34;
    hips.box([7 * S, 5.5 * S, 0.7 * S], [0, 8 * S, -2.3 * S], plate, {
      d: HD,
      n: 0.1,
      f: {
        front: (p) => {
          p.border(0.75);
          for (const [x, y] of [[0, 0], [p.w - 1, 0], [0, p.h - 1], [p.w - 1, p.h - 1]]) p.px(x, y, shade(plate, 1.4), 0);
          if (o.scavenger) { for (let i = 0; i < p.w; i++) p.px(i, Math.floor(i * 0.6) + 1, 0x9c8a3c, 0.1); p.speckle(shade(plate, 0.6), 0.12); }
        },
      },
    });
  }
  if (o.scavenger && !o.dead) {
    hips.box([6 * S, 7 * S, 3 * S], [0, 6.5 * S, 3.5 * S], 0x4c4a38, { d: HD, f: { back: (p) => { p.rows(0, 2, shade(0x4c4a38, 0.8)); p.rect(p.cx - 1, 2, 2, 1, 0xa89a6a, 0); p.cols(1, 1, 0x3a3020); p.cols(p.w - 2, 1, 0x3a3020); } } });
    hips.box([7.5 * S, 2.2 * S, 2.2 * S], [0, 11 * S, 3.7 * S], 0x7a3a2c, { d: HD, f: { all: (p) => { p.cols(1, 1, 0x3a2a1a); p.cols(p.w - 2, 1, 0x3a2a1a); } } });
  }
  const head = m.part('head', 'hips', [0, 12 * S, 0]);
  if (o.scavenger) {
    const HOOD = 0x8c7650, HOODD = 0x6a5638;
    const burlap = (p: P) => { p.speckle(shade(HOOD, 0.85), 0.25); for (let y = 1; y < p.h; y += 3) stitchesH(p, y, shade(HOOD, 0.8)); };
    head.box([8 * S, 8 * S, 8 * S], [0, 4 * S, 0], HOOD, {
      d: HD,
      f: {
        all: burlap,
        front: (p) => { burlap(p); p.rect(1, 1, p.w - 2, p.h - 1, 0x1e1a14, 0.05); },
        top: (p) => { burlap(p); p.cols(p.cx, 1, HOODD); p.rows(p.cx, 1, HOODD); },
      },
    });
    const MASK = 0x77736a;
    head.box([6.4 * S, 6 * S, 0.8 * S], [0, 3.5 * S, -4.2 * S], MASK, {
      d: HD,
      n: 0.12,
      f: {
        all: (p) => { p.speckle(0x8a4a2a, 0.25, 0.15); p.speckle(0x5a564e, 0.15); },
        front: (p) => {
          p.speckle(0x8a4a2a, 0.3, 0.15);
          p.speckle(0x9a958a, 0.12);
          p.rect(1, 1, p.w - 2, 1, 0x0e0c0a, 0);
          if (o.dead) { p.px(1, 1, 0x3a1010, 0); p.px(p.w - 2, 1, 0x3a1010, 0); }
          for (const [x, y] of [[0, 0], [p.w - 1, 0], [0, p.h - 1], [p.w - 1, p.h - 1]]) p.px(x, y, 0xb8a888, 0);
          for (let x = 2; x < p.w - 2; x += 2) p.px(x, p.h - 2, 0x1a1410, 0);
        },
      },
    });
    head.box([7 * S, 2.6 * S, 1.2 * S], [0, 0.6 * S, 4.4 * S], HOODD, { d: HD, f: { all: burlap } });
  } else {
    head.box([8 * S, 8 * S, 8 * S], [0, 4 * S, 0], o.skin, {
      d: HD,
      n: 0.03,
      f: {
        front: skinFace,
        side: (p) => { p.rows(0, 2, o.hair, 0.08); p.rect(3, 2, p.w - 3, 2, o.hair, 0.08); p.px(3, 4, shade(o.skin, 0.85), 0); },
        back: (p) => p.rect(0, 0, p.w, 5, o.hair, 0.08),
        top: (p) => p.fill(o.hair, 0.08),
      },
    });
    if (o.head !== undefined) {
      head.box([8.8 * S, 4.4 * S, 8.8 * S], [0, 6.3 * S, 0], o.head, { d: HD, n: 0.08, f: { all: (p) => p.rows(p.h - 1, 1, shade(o.head!, 0.75)) } });
      if (o.mask) head.box([7 * S, 5 * S, 0.8 * S], [0, 3.2 * S, -4.3 * S], o.head, { d: HD, n: 0.08, f: { front: (p) => { p.border(0.8); p.rect(1, 1, p.w - 2, 1, 0x101010, 0); } } });
    }
  }
  const arms: Array<[string, number]> = [['armL', -1], ['armR', 1]];
  for (const [k, sx] of arms) {
    const a = m.part(k, 'hips', [sx * 6 * S, 10 * S, 0]);
    const sleeve = (p: P) => {
      if (o.arms !== o.skin) p.rows(0, o.scavenger ? 10 : 8, o.arms, 0.07);
      p.rows(p.h - 2, 2, o.hands, o.hands === o.skin ? 0.03 : 0.07);
      if (o.arms !== o.skin && o.hands === o.skin) p.rows(8, 1, shade(o.arms, 0.8));
    };
    a.box([4 * S, 12 * S, 4 * S], [0, -4 * S, 0], o.skin, { d: HD, n: 0.03, f: { all: sleeve, top: (p) => p.fill(o.arms, 0.07), bottom: (p) => p.fill(o.hands, 0.05) } });
    if (o.scavenger && sx < 0) a.box([4.8 * S, 1.6 * S, 4.8 * S], [0, 1.7 * S, 0], 0x7a7a72, { d: HD, n: 0.12, f: { all: (p) => { p.speckle(0x8a5a34, 0.3); p.border(0.8); } } });
  }
  m.part('held', 'armR', [0, -9 * S, -0.6 * S]);
}

// ---------------------------------------------------------------- public
const SPECIES_NAMES: Record<string, SpeciesKey> = { stag: 'stag', deer: 'stag', boar: 'boar', pig: 'boar', wolf: 'wolf', bear: 'bear' };

/** Species key from either the key or display name ('Grey Wolf' -> wolf). */
export function speciesOf(n: string | undefined): SpeciesKey | 'scavenger' | null {
  const s = (n ?? '').toLowerCase();
  if (s.includes('scav')) return 'scavenger';
  for (const k in SPECIES_NAMES) if (s.includes(k)) return SPECIES_NAMES[k];
  return null;
}

const SPECIES_INFO: Record<SpeciesKey, { build: (m: ModelBuilder) => void; legLen: number; walk: number; run: number; graze: number; headRX: number; tailRX: number; halfW: number; midY: number; bodyY: number }> = {
  stag: { build: buildStag, legLen: 0.82, walk: 2, run: 7.5, graze: 1.05, headRX: 0, tailRX: 0, halfW: 0.23, midY: 1.04, bodyY: 1.04 },
  boar: { build: buildBoar, legLen: 0.38, walk: 1.6, run: 5.5, graze: 0.45, headRX: -0.12, tailRX: 0, halfW: 0.3, midY: 0.62, bodyY: 0.62 },
  wolf: { build: buildWolf, legLen: 0.52, walk: 2.2, run: 7.2, graze: 0, headRX: 0, tailRX: 0.65, halfW: 0.22, midY: 0.72, bodyY: 0.72 },
  bear: { build: buildBear, legLen: 0.6, walk: 1.8, run: 6.6, graze: 0.35, headRX: -0.08, tailRX: 0, halfW: 0.48, midY: 1.02, bodyY: 1.02 },
};

export function buildAnimalRig(species: SpeciesKey, dead = false): Rig {
  const info = SPECIES_INFO[species];
  const inst = instantiate(template(`animal:${species}`, info.build, 16));
  const N = inst.nodes;
  const rig: Rig = {
    biped: false,
    inst,
    body: N.body,
    bodyY: info.bodyY,
    head: N.head,
    headRX: info.headRX,
    jaw: N.jaw ?? null,
    legs: [N.legFL, N.legFR, N.legBL, N.legBR],
    arms: [],
    tail: N.tail ?? null,
    tailRX: info.tailRX,
    ears: [N.earL, N.earR].filter(Boolean),
    held: null,
    legLen: info.legLen,
    walk: info.walk,
    run: info.run,
    graze: info.graze,
    halfW: info.halfW,
    midY: info.midY,
  };
  if (dead) layCarcass(rig);
  else rig.head.rotation.x = rig.headRX;
  return rig;
}

export const SCAVENGER_OUTFIT: Outfit = {
  key: 'scavenger', skin: 0xc68e64, hair: 0x2a2018, torso: 0x3e4234, arms: 0x3e4234, hands: 0x2e2620, legs: 0x5e5038, feet: 0x2a221c, scavenger: true,
};

export function buildHumanoidRig(o: Outfit): Rig {
  const key = `humanoid:${o.key}:${o.dead ? 'dead' : 'alive'}`;
  const inst = instantiate(template(key, (m) => buildHumanoid(m, o), HD));
  const N = inst.nodes;
  N.armL.rotation.order = 'YXZ';
  N.armR.rotation.order = 'YXZ';
  const rig: Rig = {
    biped: true,
    inst,
    body: N.hips,
    bodyY: 12 * PX,
    head: N.head,
    headRX: 0,
    jaw: null,
    legs: [N.legL, N.legR],
    arms: [N.armL, N.armR],
    tail: null,
    tailRX: 0,
    ears: [],
    held: N.held,
    legLen: 12 * PX,
    walk: 1.6,
    run: 4.6,
    graze: 0,
    halfW: 2 * PX,
    midY: 0.9,
  };
  if (o.dead) layBody(rig);
  return rig;
}

/** Animal carcass: rolled onto its side, legs stiff. */
function layCarcass(r: Rig) {
  const m = r.inst.root;
  m.rotation.z = Math.PI / 2;
  m.position.set(r.midY, r.halfW, 0);
  r.legs[0].rotation.x = 0.35;
  r.legs[1].rotation.x = 0.5;
  r.legs[2].rotation.x = -0.3;
  r.legs[3].rotation.x = -0.15;
  r.head.rotation.x = r.headRX + 0.25;
  r.head.rotation.z = -0.15;
  if (r.jaw) r.jaw.rotation.x = -0.25;
  if (r.tail) r.tail.rotation.x = r.tailRX * 0.3;
}

/** Humanoid body lying on its back, limbs splayed. */
function layBody(r: Rig) {
  const m = r.inst.root;
  m.rotation.x = Math.PI / 2;
  m.position.set(0, 2 * PX + 0.02, -0.9);
  r.arms[0].rotation.set(0, 0, -1.0);
  r.arms[1].rotation.set(0.2, 0, 0.75);
  r.legs[0].rotation.z = -0.18;
  r.legs[1].rotation.z = 0.12;
  r.head.rotation.y = 0.45;
}

export function hairFor(seed: number): number {
  const HAIR = [0x3a2616, 0x1e1a18, 0x6a4a2a, 0x8a6a3a, 0x4a3020, 0x9a8a6a];
  return HAIR[seed % HAIR.length];
}

/** Player outfit from wear item colours (slots: head, torso, vest, legs, feet, hands). */
export function playerOutfit(skin: number, hair: number, wear: Array<{ key: string; c: number } | undefined>, dead = false): Outfit {
  const torso = wear[1]?.c;
  const legs = wear[3]?.c ?? 0x6a6250;
  return {
    key: `p:${skin}:${hair}:${wear.map((w) => (w ? w.key : '')).join(',')}`,
    skin,
    hair,
    torso: torso ?? skin,
    arms: torso ?? skin,
    hands: wear[5]?.c ?? skin,
    legs,
    feet: wear[4]?.c ?? shade(legs, 0.55),
    head: wear[0]?.c,
    mask: !!wear[0]?.key.includes('mask'),
    vest: wear[2]?.c,
    dead,
  };
}
