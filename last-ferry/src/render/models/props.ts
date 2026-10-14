// Props: the paramedics' stretcher, the crane's pallet of fish crates, a single
// fish crate, the harpoon bolt, the nail-gun nail and the burning flare stick.
import * as THREE from 'three';
import { GunBuilder, box, cone, cyl, cylX, hash3, mix, roundBox, torus, type MatClass } from './kit';
import { blob } from './common';

const V = (x: number, y: number, z: number): [number, number, number] => [x, y, z];

/** Stretcher dimensions (model space: origin at its centre on the deck, long axis X, head end +X). */
export const STRETCHER_MODEL = {
  /** Canvas (bed) height above the origin: a patient lying on it has its root here. */
  bedY: 0.12,
  /** Pole ends. */
  halfLength: 1.0,
  /** Hand grip centres (±x): the medics' hands. Medics stand ±1.15 from the centre. */
  gripX: 0.82,
  /** Pole half spacing (z). */
  poleZ: 0.27,
  /**
   * Origin height while carried: hands at 0.85 (the logic's STRETCHER.height),
   * i.e. stretcher.position.y = carryY.
   */
  carryY: 0.73,
};

function wood(base: THREE.ColorRepresentation, dark: THREE.ColorRepresentation, seed = 0) {
  return (p: THREE.Vector3) => {
    const g = Math.sin(p.x * 60 + Math.sin(p.z * 13 + seed) * 2 + p.y * 7) * 0.5 + 0.5;
    return mix(base, dark, 0.12 + g * 0.3 + hash3(p.x * 7 + seed, p.y * 7, p.z * 7) * 0.15);
  };
}

export function createStretcher(): THREE.Group {
  const S = STRETCHER_MODEL;
  const g = new THREE.Group();
  g.name = 'stretcher';
  const P = new GunBuilder();
  const y = S.bedY;
  for (const s of [1, -1]) {
    const z = s * S.poleZ;
    P.add(cylX(0.024, S.halfLength * 2, 10), 0xc8ccd2, 'metal', { p: V(0, y, z) });
    for (const e of [1, -1]) {
      P.add(cylX(0.03, 0.26, 10), 0x1a1a1c, 'rubber', { p: V(e * (S.halfLength - 0.14), y, z) });
      // folding stirrup feet
      P.add(box(0.03, y, 0.03), 0x9aa0a8, 'metal', { p: V(e * 0.6, y / 2, z) });
      P.add(box(0.12, 0.02, 0.04), 0x9aa0a8, 'metal', { p: V(e * 0.6, 0.01, z) });
    }
  }
  // spreader bars
  for (const e of [1, -1]) P.add(cyl(0.016, 0.016, S.poleZ * 2, 8), 0xb0b4ba, 'metal', { p: V(e * 0.72, y, 0), r: [Math.PI / 2, 0, 0] });
  P.buildInto(g);

  // canvas with a slight sag, rescue orange with grime, and a pillow at the head end
  const C = new GunBuilder();
  const nx = 16;
  const nz = 6;
  const w = S.poleZ * 2 - 0.02;
  const len = 1.46;
  const pos: number[] = [];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const q = (a: number, b: number): [number, number, number] => {
        const x = -len / 2 + (a / nx) * len;
        const z = -w / 2 + (b / nz) * w;
        const sag = 0.035 * Math.sin((b / nz) * Math.PI) * Math.sin((a / nx) * Math.PI);
        return [x, y - sag + 0.01, z];
      };
      const p00 = q(i, j);
      const p10 = q(i + 1, j);
      const p01 = q(i, j + 1);
      const p11 = q(i + 1, j + 1);
      pos.push(...p00, ...p01, ...p11, ...p00, ...p11, ...p10);
    }
  const sheet = new THREE.BufferGeometry();
  sheet.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sheet.computeVertexNormals();
  C.addShaded(
    sheet,
    (p) => {
      const c = new THREE.Color(0xd2561e);
      const v = Math.sin(p.x * 23 + Math.sin(p.z * 31) * 2) * Math.sin(p.z * 19 + p.x * 7);
      if (v > 0.55) c.lerp(new THREE.Color(0x5a1008), 0.7);
      else if (v > 0.35) c.lerp(new THREE.Color(0x6a3a20), 0.35);
      return c;
    },
    'cloth',
    {},
    'quad',
  );
  const under = sheet.clone();
  const idx = under.attributes.position;
  for (let i = 0; i < idx.count; i += 3) {
    // flip winding for the underside
    const ax = idx.getX(i), ay = idx.getY(i), az = idx.getZ(i);
    idx.setXYZ(i, idx.getX(i + 1), idx.getY(i + 1) - 0.004, idx.getZ(i + 1));
    idx.setXYZ(i + 1, ax, ay - 0.004, az);
    idx.setY(i + 2, idx.getY(i + 2) - 0.004);
  }
  under.computeVertexNormals();
  C.add(under, 0x8a3a14, 'cloth');
  C.add(roundBox(0.2, 0.06, 0.4, 0.03), 0xf2f2ee, 'cloth', { p: V(0.6, y + 0.04, 0) });
  // straps hanging off the near side
  for (const x of [-0.3, 0.2]) {
    C.add(box(0.05, 0.004, 0.62), 0x141414, 'cloth', { p: V(x, y + 0.012, 0) });
    C.add(box(0.05, 0.13, 0.004), 0x141414, 'cloth', { p: V(x, y - 0.06, S.poleZ + 0.035) });
    C.add(box(0.06, 0.04, 0.012), 0xb8bcc2, 'metal', { p: V(x, y - 0.12, S.poleZ + 0.035) });
  }
  C.buildInto(g);
  return g;
}

// ---------------------------------------------------------------- fish crates
/** Single fish crate size (origin at its centre). */
export const CRATE_MODEL = { halfX: 0.31, halfY: 0.16, halfZ: 0.22 };

function fish(P: GunBuilder, x: number, y: number, z: number, ry: number, rz: number, k: number, seed: number): void {
  const back = seed % 3 === 0 ? 0x4a5e6c : seed % 3 === 1 ? 0x6a5a3a : 0x3a4a5a;
  const fn = (p: THREE.Vector3, n: THREE.Vector3) => {
    const c = new THREE.Color(back).lerp(new THREE.Color(0xdde2e4), Math.max(0, Math.min(1, 0.5 - n.y * 0.9)));
    return c;
  };
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, rz)), new THREE.Vector3(k, k, k));
  const body = blob(0.15, 0.045, 0.03, 12, 8);
  body.applyMatrix4(m);
  P.addShaded(body, fn, 'skin');
  const tail = cone(0.05, 0.07, 4);
  tail.rotateZ(Math.PI / 2);
  tail.scale(1, 1, 0.25);
  tail.translate(-0.17, 0, 0);
  tail.applyMatrix4(m);
  P.add(tail, back, 'skin');
  const eye = blob(0.01, 0.01, 0.01, 5, 4);
  eye.translate(0.11, 0.012, 0.022);
  eye.applyMatrix4(m);
  P.add(eye, 0xf0f0e8, 'eye');
}

function crateInto(P: GunBuilder, cx: number, cy: number, cz: number, seed: number, withFish = true): void {
  const { halfX: hx, halfY: hy, halfZ: hz } = CRATE_MODEL;
  const base = [0xb89a6a, 0xa88a5a, 0xc0a878][seed % 3];
  const dark = 0x6a5232;
  const wfn = wood(base, dark, seed);
  const add = (geo: THREE.BufferGeometry, xf: { p: [number, number, number]; r?: [number, number, number] }, mat: MatClass = 'wood') => {
    geo.translate(0, 0, 0);
    P.addShaded(geo, wfn, mat, { p: [cx + xf.p[0], cy + xf.p[1], cz + xf.p[2]], r: xf.r });
  };
  // bottom
  add(box(hx * 2, 0.02, hz * 2), { p: V(0, -hy + 0.01, 0) });
  // side slats (two per side with a gap) + corner posts
  for (const s of [1, -1]) {
    for (const yy of [-hy * 0.5, hy * 0.45]) {
      add(box(hx * 2, 0.11, 0.018), { p: V(0, yy, s * (hz - 0.009)) });
      add(box(0.018, 0.11, hz * 2), { p: V(s * (hx - 0.009), yy, 0) });
    }
    for (const t of [1, -1]) add(box(0.035, hy * 2, 0.035), { p: V(s * (hx - 0.018), 0, t * (hz - 0.018)) });
  }
  // dark interior so the gaps read
  P.add(box(hx * 2 - 0.04, hy * 2 - 0.03, hz * 2 - 0.04), 0x2a2018, 'wood', { p: V(cx, cy - 0.005, cz) });
  // painted stencil mark on the long side (a blue fish)
  P.add(box(0.14, 0.05, 0.004), 0x2a5a9a, 'plastic', { p: V(cx, cy + hy * 0.45, cz + hz + 0.001) });
  P.add(cone(0.03, 0.04, 3).rotateZ(Math.PI / 2), 0x2a5a9a, 'plastic', { p: V(cx - 0.09, cy + hy * 0.45, cz + hz + 0.001), s: [1, 1, 0.1] });
  if (!withFish) return;
  // ice + fish piled above the rim, tails sticking out
  P.add(box(hx * 2 - 0.05, 0.02, hz * 2 - 0.05), 0xd8eef4, 'ice', { p: V(cx, cy + hy - 0.02, cz) });
  for (let i = 0; i < 4; i++) {
    const h = hash3(seed, i, 3.3);
    const fx = cx + (h - 0.5) * hx * 1.1;
    const fz = cz + (hash3(i, seed, 7.1) - 0.5) * hz * 1.2;
    const ry = hash3(i * 3, seed, 1) * Math.PI * 2;
    fish(P, fx, cy + hy + 0.005 + i * 0.012, fz, ry, (hash3(seed, i * 2, 9) - 0.5) * 0.4, 1, seed + i);
  }
  // one fish flopping over the side
  fish(P, cx + hx * 0.6, cy + hy * 0.6, cz + hz + 0.03, 0.2, -1.2, 0.95, seed + 7);
}

export function createCrate(seed = 1): THREE.Group {
  const g = new THREE.Group();
  g.name = 'fishCrate';
  const P = new GunBuilder();
  crateInto(P, 0, 0, 0, seed);
  P.buildInto(g);
  return g;
}

/** Pallet of fish crates in a cargo net (origin at the pallet's bottom centre). */
export const PALLET_MODEL = {
  /** Top of the crate stack. */
  top: 1.08,
  /** The net's lifting ring (the crane hook attaches here). */
  ringY: 1.8,
  halfX: 0.98,
  halfZ: 0.72,
};

export function createCratePallet(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'cratePallet';
  const P = new GunBuilder();
  const { halfX: hx, halfY: hy, halfZ: hz } = CRATE_MODEL;
  const pw = wood(0x9a7a50, 0x5a4428, 4);
  // pallet: three runners + deck boards
  for (const z of [-0.6, 0, 0.6]) P.addShaded(box(1.9, 0.1, 0.1), pw, 'wood', { p: V(0, 0.05, z) });
  for (let i = 0; i < 9; i++) P.addShaded(box(0.16, 0.025, 1.36), pw, 'wood', { p: V(-0.88 + i * 0.22, 0.112, 0) });
  // three layers of crates, the top one partial
  const y0 = 0.125 + hy;
  let seed = 1;
  for (let layer = 0; layer < 3; layer++) {
    for (let ix = 0; ix < 3; ix++)
      for (let iz = 0; iz < 3; iz++) {
        if (layer === 2 && (ix + iz) % 2 === 1) continue;
        const x = (ix - 1) * (hx * 2 + 0.01);
        const z = (iz - 1) * (hz * 2 + 0.01);
        crateInto(P, x, y0 + layer * hy * 2, z, seed++, layer === 2 || ix === 2 || iz === 2);
      }
  }
  // cargo net: ropes over the stack, slings from the corners up to a ring
  const rope = 0x6a4a2a;
  const top = PALLET_MODEL.top;
  for (let i = -2; i <= 2; i++) {
    P.add(box(1.96, 0.02, 0.02), rope, 'cloth', { p: V(0, top + 0.02, i * 0.33) });
    P.add(box(0.02, 0.02, 1.4), rope, 'cloth', { p: V(i * 0.46, top + 0.02, 0) });
    for (const s of [1, -1]) {
      P.add(box(0.02, top - 0.1, 0.02), rope, 'cloth', { p: V(i * 0.46, (top + 0.1) / 2, s * 0.7) });
      P.add(box(0.02, top - 0.1, 0.02), rope, 'cloth', { p: V(s * 0.97, (top + 0.1) / 2, i * 0.33) });
    }
  }
  const ring = PALLET_MODEL.ringY;
  for (const sx of [1, -1])
    for (const sz of [1, -1]) {
      const a = new THREE.Vector3(sx * 0.95, top, sz * 0.68);
      const b = new THREE.Vector3(0, ring - 0.06, 0);
      const len = a.distanceTo(b);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      const e = new THREE.Euler().setFromQuaternion(q);
      P.add(cyl(0.018, 0.018, len, 6), rope, 'cloth', { p: [mid.x, mid.y, mid.z], r: [e.x, e.y, e.z] });
    }
  P.add(torus(0.08, 0.018, 6, 16), 0x5a5e64, 'metal', { p: V(0, ring, 0), r: [0, Math.PI / 2, 0] });
  P.buildInto(g);
  return g;
}

// ---------------------------------------------------------------- small projectiles
/** Harpoon bolt: origin at the tail, tip toward -X. Length ≈ 1.0 m. */
export const HARPOON_BOLT_LENGTH = 1.0;
export function createHarpoonBolt(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'harpoonBolt';
  g.add(harpoonBoltParts());
  return g;
}

/** The bolt as a group (also used inside the harpoon gun). */
export function harpoonBoltParts(): THREE.Group {
  const g = new THREE.Group();
  const P = new GunBuilder();
  const L = HARPOON_BOLT_LENGTH;
  P.add(cylX(0.016, L - 0.16, 10), 0xc4c8cc, 'metal', { p: V(-(L - 0.16) / 2, 0, 0) });
  // head: cone tip + four swept barbs
  P.add(cone(0.032, 0.16, 10).rotateZ(Math.PI / 2), 0xdfe3e6, 'metal', { p: V(-L + 0.08, 0, 0) });
  P.add(cylX(0.034, 0.04, 10), 0x8a9096, 'metal', { p: V(-L + 0.17, 0, 0) });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const b = box(0.12, 0.012, 0.006);
    P.add(b, 0xc8ccd0, 'metal', { p: V(-L + 0.2, Math.cos(a) * 0.04, Math.sin(a) * 0.04), r: [a, 0, 0.0] });
    P.add(box(0.1, 0.01, 0.006), 0xc8ccd0, 'metal', { p: V(-L + 0.23, Math.cos(a) * 0.05, Math.sin(a) * 0.05), r: [a, 0, Math.cos(a) * 0.4] });
  }
  // tail: red fletch band + line eye
  P.add(cylX(0.02, 0.06, 10), 0xc81e1e, 'plastic', { p: V(-0.08, 0, 0) });
  P.add(torus(0.025, 0.008, 6, 12), 0x8a9096, 'metal', { p: V(0.02, 0, 0), r: [0, Math.PI / 2, 0] });
  P.buildInto(g);
  return g;
}

/** Nail: origin at the head, point toward -X. Exaggerated (≈ 0.12 m) so it reads stuck in a body. */
export function createNail(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'nail';
  const P = new GunBuilder();
  P.add(cylX(0.016, 0.006, 10), 0xd8dce0, 'metal', { p: V(-0.003, 0, 0) });
  P.add(cylX(0.0065, 0.095, 6), 0xc8ccd0, 'metal', { p: V(-0.0535, 0, 0) });
  P.add(cone(0.0065, 0.024, 6).rotateZ(Math.PI / 2), 0xc8ccd0, 'metal', { p: V(-0.113, 0, 0) });
  P.buildInto(g);
  return g;
}

/**
 * Burning flare stick lying on the deck (fire zones): origin at its centre on
 * the deck, burning end toward -X. The glowing tip uses the 'glow' class
 * (self-lit); `userData.tip` is the burning end (attach a light / sparks).
 */
export function createFlareCartridge(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'flareStick';
  const P = new GunBuilder();
  const r = 0.03;
  P.add(cylX(r, 0.24, 12), 0xd42a1e, 'plastic', { p: V(0.02, r, 0) });
  P.add(cylX(r * 1.05, 0.03, 12), 0xf2f2f2, 'plastic', { p: V(0.06, r, 0) });
  P.add(cylX(r * 1.08, 0.025, 12), 0x1a1a1a, 'plastic', { p: V(0.145, r, 0) });
  P.add(blob(0.012, 0.012, 0.012, 6, 4), 0x2a2a2a, 'plastic', { p: V(-0.098, r, 0) });
  P.buildInto(g);
  const G = new GunBuilder();
  G.add(cylX(r * 0.95, 0.03, 12), 0xfff2c0, 'glow', { p: V(-0.11, r, 0) });
  G.add(blob(0.045, 0.045, 0.045, 10, 8), 0xffa040, 'glow', { p: V(-0.14, r + 0.01, 0) });
  G.add(blob(0.026, 0.026, 0.026, 8, 6), 0xffffe0, 'glow', { p: V(-0.13, r + 0.005, 0) });
  G.buildInto(g);
  const tip = new THREE.Object3D();
  tip.name = 'tip';
  tip.position.set(-0.14, r + 0.02, 0);
  g.add(tip);
  g.userData.tip = tip;
  return g;
}

/** Flare-pistol cartridge (12 ga style: orange hull, brass base); origin at its centre, nose toward -X. */
export function flareShellParts(P: GunBuilder, x = 0, y = 0, z = 0, k = 1): void {
  P.add(cylX(0.021 * k, 0.07 * k, 12), 0xff6a14, 'plastic', { p: V(x - 0.005 * k, y, z) });
  P.add(cylX(0.022 * k, 0.022 * k, 12), 0xd8aa40, 'metal', { p: V(x + 0.04 * k, y, z) });
  P.add(cylX(0.025 * k, 0.005 * k, 12), 0xc89a30, 'metal', { p: V(x + 0.052 * k, y, z) });
  P.add(cylX(0.012 * k, 0.003 * k, 8), 0xffd8a0, 'glow', { p: V(x - 0.041 * k, y, z) });
}

