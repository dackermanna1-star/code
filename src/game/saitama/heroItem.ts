/**
 * "Hero Gloves" (Saitama's red gloves): item registration, the 3D model (two gloved fists in
 * yellow sleeves plus six afterimage fists for barrages), the icon, and the first-person
 * animation (guard, jab, consecutive-punch blur with afterimages, serious-punch wind-up).
 *
 * The model's meshes come in (glove, sleeve) pairs: 0 = right fist, 1 = left fist, 2..7 =
 * afterimages. The hand pose positions every pair in camera space from `HERO_ANIM`, which the
 * hero system drives.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { registerItem } from '../items/registry';
import { registerToolModel, type ModelPart } from '../../render/items/toolModels';
import { registerPainter } from '../../render/items/paint/index';
import { registerHandPose } from '../../render/items/hand';
import { Painter as P, rgba, lin, darken, lighten, rrect, circle, type Ctx } from '../../render/items/paint/kit';

registerItem('hero_gloves', {
  category: 'combat',
  displayName: 'Hero Gloves',
  maxStack: 1,
  rarity: 'epic',
  visual: { kind: 'model', id: 'hero_gloves', color: 0xc8161d, color2: 0xf2c21a },
});

/** Item units per metre for the fists (keeps dropped / icon versions a sensible size). */
const FS = 2.6;
const FISTS = 8;

function fistGeometry(right: boolean): { glove: THREE.BufferGeometry; sleeve: THREE.BufferGeometry } {
  const side = right ? 1 : -1;
  const g: THREE.BufferGeometry[] = [];
  // knuckles forward (-Z): the clenched hand, fingers rolled under
  g.push(new RoundedBoxGeometry(0.1, 0.085, 0.105, 4, 0.032));
  for (let i = 0; i < 4; i++) g.push(new RoundedBoxGeometry(0.024, 0.026, 0.03, 2, 0.01).translate(-0.036 + i * 0.024, 0.016, -0.055));
  // thumb across the front of the fingers
  g.push(new RoundedBoxGeometry(0.06, 0.028, 0.03, 3, 0.012).rotateZ(side * 0.25).translate(-side * 0.015, -0.026, -0.05));
  // flared glove cuff
  g.push(new THREE.CylinderGeometry(0.058, 0.07, 0.08, 20, 1).rotateX(Math.PI / 2).translate(0, 0, 0.09));
  const sleeve = new THREE.CylinderGeometry(0.056, 0.068, 1.1, 20, 1).rotateX(Math.PI / 2).translate(0, 0, 0.67);
  const clean = (x: THREE.BufferGeometry) => {
    const y = x.index ? x.toNonIndexed() : x;
    for (const k of Object.keys(y.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') y.deleteAttribute(k);
    return y.scale(FS, FS, FS);
  };
  return { glove: mergeGeometries(g.map(clean))!, sleeve: clean(sleeve) };
}

let parts: ModelPart[] | null = null;
function heroParts(): ModelPart[] {
  if (parts) return parts;
  const R = fistGeometry(true), L = fistGeometry(false);
  const glove = { color: 0xc8161d, roughness: 0.3, metalness: 0, key: 'hero_glove' };
  const sleeve = { color: 0xf2c21a, roughness: 0.75, metalness: 0, key: 'hero_sleeve' };
  parts = [];
  for (let i = 0; i < FISTS; i++) {
    const f = i % 2 === 0 ? R : L;
    parts.push({ geometry: f.glove, spec: glove }, { geometry: f.sleeve, spec: sleeve });
  }
  return parts;
}
registerToolModel('hero_gloves', () => heroParts());

// ------------------------------------------------------------------------------- icon
registerPainter('hero_gloves', (p: P) => {
  const red = 0xc8161d;
  const draw = (cx: number, cy: number, flip: number) => {
    p.part((g: Ctx) => { rrect(g, cx - 2.6, cy + 1.6, 5.2, 3.0, 1.0); g.fillStyle = rgba(red); g.fill(); }, (g) => {
      g.fillStyle = lin(g, 0, cy + 1.6, 0, cy + 4.6, [[0, lighten(red, 0.25)], [1, darken(red, 0.35)]]);
      g.fillRect(0, 0, 16, 16);
    }, { rough: 0.3 });
    p.part((g: Ctx) => { rrect(g, cx - 3.1, cy - 3.2, 6.2, 5.2, 2.0); g.fillStyle = rgba(red); g.fill(); }, (g) => {
      g.fillStyle = lin(g, cx - 3, cy - 3, cx + 3, cy + 2, [[0, lighten(red, 0.35)], [1, darken(red, 0.3)]]);
      g.fillRect(0, 0, 16, 16);
      g.strokeStyle = rgba(darken(red, 0.5), 0.8);
      g.lineWidth = 0.22;
      g.beginPath();
      for (let i = 1; i < 4; i++) { g.moveTo(cx - 3.1 + i * 1.55, cy - 3.0); g.lineTo(cx - 3.1 + i * 1.55, cy - 1.6); }
      g.stroke();
      g.fillStyle = rgba(lighten(red, 0.6), 0.6);
      circle(g, cx - 1.6 * flip, cy - 2.2, 0.6);
      g.fill();
    }, { rough: 0.3 });
  };
  draw(5.6, 6.2, 1);
  draw(10.4, 9.6, -1);
});

// ------------------------------------------------------------------------------- first person
/** Animation state written by the hero system each frame. */
export const HERO_ANIM = {
  time: 0,
  /** seconds since the last right / left jab (large = idle) */
  jabR: 9,
  jabL: 9,
  /** 0..1 consecutive-punch intensity (afterimages, blur) */
  barrage: 0,
  /** 0..1 serious wind-up */
  charge: 0,
  /** seconds since the last serious punch */
  serious: 9,
  /** true while the serious barrage runs (bigger, slower afterimages) */
  seriousBarrage: false,
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

/** Jab curve: 0 rest → 1 fully extended (fast out, short hold, eased return). */
function jab(t: number, out = 0.05, hold = 0.035, back = 0.17): number {
  if (t < 0) return 0;
  if (t < out) { const k = t / out; return 1 - (1 - k) * (1 - k); }
  if (t < out + hold) return 1;
  const k = (t - out - hold) / back;
  return k >= 1 ? 0 : 1 - k * k * (3 - 2 * k);
}

const SHOULDER_R = new THREE.Vector3(0.36, -0.5, 0.25);
const SHOULDER_L = new THREE.Vector3(-0.36, -0.5, 0.25);
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/** Put a (glove, sleeve) mesh pair with the fist at (x, y, z) and the forearm running back to the shoulder. */
function place(meshes: THREE.Object3D[], i: number, x: number, y: number, z: number, right: boolean, roll = 0, visible = true, sleeve = true) {
  const g = meshes[i * 2], sl = meshes[i * 2 + 1];
  if (!g || !sl) return;
  _v.set(x, y, z);
  _z.copy(right ? SHOULDER_R : SHOULDER_L).sub(_v).normalize();
  _x.crossVectors(_up, _z).normalize();
  _y.crossVectors(_z, _x);
  _m.makeBasis(_x, _y, _z);
  _q.setFromRotationMatrix(_m);
  if (roll) _q.multiply(new THREE.Quaternion().setFromAxisAngle(_Z, roll));
  for (const mesh of [g, sl]) {
    mesh.visible = visible && (mesh === g || sleeve);
    mesh.position.set(x * FS, y * FS, z * FS);
    mesh.quaternion.copy(_q);
  }
}
const _Z = new THREE.Vector3(0, 0, 1);

const rnd = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Camera-space pose of both fists (+ afterimages). */
export function heroHandPose(m: THREE.Matrix4, equip: number, model: THREE.Object3D) {
  const A = HERO_ANIM;
  const t = A.time;
  m.multiply(_m.makeScale(1 / FS, 1 / FS, 1 / FS));
  const kids = model.children;
  const drop = equip * 0.5;
  const breathe = Math.sin(t * 1.8) * 0.006;
  // right fist: jab or serious wind-up / blow
  const s = jab(A.serious, 0.06, 0.12, 0.35);
  const jr = Math.max(jab(A.jabR), s);
  const shake = A.charge > 0 ? (Math.sin(t * 90) * 0.004 + Math.sin(t * 67) * 0.003) * A.charge : 0;
  // guard low on the right, pulled back and trembling while charging a serious punch
  let x = 0.27 + 0.06 * A.charge + shake, y = -0.27 - drop + breathe + 0.03 * A.charge, z = -0.52 + 0.2 * A.charge;
  const ex = 0.05, ey = -0.1, ez = s > 0 ? -1.0 : -0.92;
  x += (ex - x) * jr; y += (ey - y) * jr; z += (ez - z) * jr;
  place(kids, 0, x, y, z, true, -0.15 + 0.15 * jr);
  // left fist
  const jl = jab(A.jabL);
  let lx = -0.27, ly = -0.28 - drop + breathe, lz = -0.55;
  lx += (-0.05 - lx) * jl; ly += (-0.1 - ly) * jl; lz += (-0.92 - lz) * jl;
  place(kids, 1, lx, ly, lz, false, 0.15 - 0.15 * jl);
  // afterimages: a storm of fists hanging in front during barrages
  const frame = Math.floor(t * 40);
  const big = A.seriousBarrage ? 1.35 : 1;
  for (let i = 0; i < 6; i++) {
    const on = A.barrage > 0.05 && rnd(i, frame) < 0.35 + A.barrage * 0.5;
    const ax = (rnd(i + 11, frame) - 0.5) * 0.6 * big;
    const ay = -0.15 + (rnd(i + 23, frame) - 0.5) * 0.3 * big;
    const az = -0.72 - rnd(i + 37, frame) * 0.4 * big;
    place(kids, 2 + i, ax, ay, az, i % 2 === 0, 0, on, false);
  }
}

registerHandPose('hero_gloves', (ps, o) => heroHandPose(ps.m, o.equip, o.model));
