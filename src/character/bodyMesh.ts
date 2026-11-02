import * as THREE from 'three';
import { B, SkeletonDef } from '../anim/skeleton';
import { Outfit, sleeveLength } from './outfit';
import { clamp01, lerp, smoothstep } from '../core/math';
import { MeshAccum, RingSpec, W, REGION, RegionName, loft, boneW, frameFor, blob, flatBox, clampSym, emitQuads } from './meshKit';
import { buildFemTorso, buildLeatherJacket, buildSkirt, FEM_LEG, BOOT_TOP, BOOT_LIP, bootShaft, buildHeelBoot, buildLongWaveHair, buildEarrings, legHipFactor } from './femMesh';

export { REGION };

export interface BodyMeshOptions {
  def: SkeletonDef;
  outfit: Outfit;
  /** Extra inflation for armour/bruisers. */
  inflate?: number;
  /** The head samples its own atlas layer at twice the detail (uv.x shifted by 1). */
  hiFace?: boolean;
}

/** A woman's arm: slimmer, with less deltoid and biceps. [t, radius, front/back ratio] */
const FEM_ARM: [number, number, number][] = [
  [-0.12, 0.044, 1.0], [-0.05, 0.052, 1.0], [0.02, 0.054, 1.0], [0.1, 0.052, 1.0], [0.22, 0.049, 1.03], [0.36, 0.045, 1.04],
  [0.47, 0.04, 1.0], [0.53, 0.037, 1.0], [0.6, 0.04, 1.0], [0.68, 0.04, 1.0], [0.8, 0.033, 1.0], [0.92, 0.027, 1.0], [1.0, 0.025, 1.0],
];

export function buildBodyGeometry(opts: BodyMeshOptions): THREE.BufferGeometry {
  const { def, outfit } = opts;
  const s = def.scale;
  const k = def.spec.bulk;
  const R = def.rest;
  const m = new MeshAccum();
  const fem = def.spec.fem > 0.5;
  const clothInfl = outfit.top === 'jacket' || outfit.top === 'hoodie' || outfit.top === 'coat' || outfit.top === 'leather' ? 1.07 : outfit.top === 'gi' ? 1.06 : outfit.top === 'bare' ? 0.985 : 1.0;
  const torsoSkin = outfit.top === 'bare' ? 1 : 0;

  // ------------------------------------------------------------------ torso
  if (fem) {
    buildFemTorso(m, def, outfit);
    if (outfit.top === 'leather') buildLeatherJacket(m, def);
    if (outfit.bottom === 'skirt') buildSkirt(m, def);
  } else {
    const hipsY = R[B.hips].y;
    const gut = def.spec.gut;
    const cd = def.spec.chestDepth;
    const sh = def.spec.shoulders;
    const hw = def.spec.hipsW;
    // [y (relative to hips bone, unscaled), rx, rzF, rzB, zOff, weights, gut]
    const prof: [number, number, number, number, number, W, number][] = [
      [-0.13, 0.095 * hw, 0.07, 0.075, -0.0, [[B.hips, 1]], 0],
      [-0.07, 0.15 * hw, 0.094, 0.108, -0.005, [[B.hips, 1]], 0.2],
      [0.0, 0.156 * hw, 0.098, 0.102, 0.0, [[B.hips, 0.85], [B.spine, 0.15]], 0.45],
      [0.07, 0.146, 0.097, 0.088, 0.004, [[B.hips, 0.35], [B.spine, 0.65]], 0.9],
      [0.14, 0.145, 0.1, 0.086, 0.006, [[B.spine, 0.85], [B.chest, 0.15]], 1.0],
      [0.21, 0.155, 0.106 * cd, 0.09, 0.006, [[B.spine, 0.5], [B.chest, 0.5]], 0.7],
      [0.29, 0.172 * sh, 0.116 * cd, 0.096, 0.004, [[B.spine, 0.15], [B.chest, 0.85]], 0.2],
      [0.36, 0.186 * sh, 0.118 * cd, 0.102, 0.0, [[B.chest, 1]], 0],
      [0.42, 0.192 * sh, 0.104 * cd, 0.104, -0.006, [[B.chest, 1]], 0],
      [0.47, 0.175 * sh, 0.08, 0.09, -0.012, [[B.chest, 0.92], [B.neck, 0.08]], 0],
      [0.505, 0.135 * sh, 0.066, 0.078, -0.016, [[B.chest, 0.75], [B.neck, 0.25]], 0],
      [0.54, 0.08, 0.06, 0.068, -0.016, [[B.chest, 0.4], [B.neck, 0.6]], 0],
    ];
    const rings: RingSpec[] = prof.map((r, i) => {
      const y = hipsY + r[0] * s;
      const inflate = (r[0] > 0.05 ? clothInfl : 1) * k;
      return {
        c: new THREE.Vector3(0, y, r[4] * s),
        ax: new THREE.Vector3(1, 0, 0),
        az: new THREE.Vector3(0, 0, 1),
        rx: r[1] * s * inflate,
        rzF: r[2] * s * inflate,
        rzB: r[3] * s * inflate,
        pw: 2.35,
        w: r[5],
        v: i / (prof.length - 1),
        skin: i >= prof.length - 2 ? (outfit.top === 'bare' || outfit.top === 'tank' || outfit.top === 'vest' ? 1 : 0.5) : torsoSkin,
        bulgeF: r[6] * gut * 0.06 * s,
      };
    });
    loft(m, rings, 18, 'torso', true, false);
  }

  // ------------------------------------------------------------------ neck
  {
    const n0 = R[B.neck];
    const h0 = R[B.head];
    const rings: RingSpec[] = [];
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = lerp(n0.y - 0.035 * s, h0.y + 0.02 * s, t);
      const r = lerp(0.066, 0.056, t) * s * Math.max(0.92, k * 0.97) * lerp(1, 0.9, def.spec.fem);
      rings.push({
        c: new THREE.Vector3(0, y, lerp(n0.z, h0.z - 0.01 * s, t)),
        ax: new THREE.Vector3(1, 0, 0),
        az: new THREE.Vector3(0, 0, 1),
        rx: r * 1.02,
        rzF: r * 0.95,
        rzB: r,
        w: t < 0.5 ? boneW(B.chest, B.neck, 0.5 + t) : boneW(B.neck, B.head, (t - 0.5) * 1.6),
        v: t,
        skin: outfit.head === 'balaclava' || outfit.top === 'hoodie' ? 0 : 1,
      });
    }
    loft(m, rings, 10, 'neck', false, false);
  }

  // ------------------------------------------------------------------ head
  buildHead(m, def, outfit, !!opts.hiFace);

  // ------------------------------------------------------------------ arms
  for (const side of [1, -1]) {
    const cl = side > 0 ? B.clavL : B.clavR;
    const ua = side > 0 ? B.uarmL : B.uarmR;
    const fa = side > 0 ? B.farmL : B.farmR;
    const ha = side > 0 ? B.handL : B.handR;
    const S = R[ua];
    const E = R[fa];
    const Wr = R[ha];
    const sl = sleeveLength(outfit.top);
    const sleeveInfl = sl > 0.5 ? (outfit.top === 'jacket' || outfit.top === 'hoodie' || outfit.top === 'coat' ? 1.12 : outfit.top === 'leather' ? 1.04 : 1.05) : sl > 0 ? 1.06 : 1;
    // profile along arm: t in [0,1] from shoulder (slightly inside torso) to wrist
    const prof: [number, number, number][] = fem ? FEM_ARM : [
      // t, radius (scaled), front/back ratio
      [-0.12, 0.05, 1.0],
      [-0.05, 0.064, 1.0],
      [0.02, 0.068, 1.0],
      [0.1, 0.063, 1.0],
      [0.22, 0.058, 1.04],
      [0.36, 0.052, 1.06],
      [0.47, 0.044, 1.0],
      [0.53, 0.04, 1.0],
      [0.6, 0.043, 1.0],
      [0.68, 0.044, 1.0],
      [0.8, 0.036, 1.0],
      [0.92, 0.029, 1.0],
      [1.0, 0.027, 1.0],
    ];
    const lenUA = S.distanceTo(E);
    const lenFA = E.distanceTo(Wr);
    const total = lenUA + lenFA;
    const elbowT = lenUA / total;
    const dirUA = E.clone().sub(S).normalize();
    const dirFA = Wr.clone().sub(E).normalize();
    const rings: RingSpec[] = [];
    prof.forEach((pp, i) => {
      const [t, rad, fb] = pp;
      const d = t * total;
      let c: THREE.Vector3;
      let dir: THREE.Vector3;
      if (d <= lenUA) {
        c = S.clone().addScaledVector(dirUA, d);
        dir = dirUA;
      } else {
        c = E.clone().addScaledVector(dirFA, d - lenUA);
        dir = dirFA;
      }
      const fr = frameFor(dir, new THREE.Vector3(0, 0, 1));
      let w: W;
      if (t < 0.02) w = [[cl, 0.25 + (0.02 - t) * 1.5], [ua, 0.75]];
      else if (t < elbowT - 0.07) w = [[ua, 1]];
      else if (t < elbowT + 0.07) w = boneW(ua, fa, (t - (elbowT - 0.07)) / 0.14);
      else if (t < 0.93) w = [[fa, 1]];
      else w = boneW(fa, ha, (t - 0.93) / 0.07 * 0.5);
      const isSleeve = t < sl;
      const r = rad * s * k * (isSleeve ? sleeveInfl : 1) * (t < 0.15 ? Math.max(1, def.spec.shoulders * 0.9) : 1);
      rings.push({
        c,
        ax: fr.ax,
        az: fr.az,
        rx: r,
        rzF: r * fb,
        rzB: r * (2 - fb),
        w,
        v: clamp01((t + 0.12) / 1.12),
        skin: isSleeve ? 0 : 1,
      });
    });
    loft(m, rings, 12, 'arm', true, false);
    buildFist(m, def, side, outfit);
  }

  // ------------------------------------------------------------------ legs
  for (const side of [1, -1]) {
    const th = side > 0 ? B.thighL : B.thighR;
    const sh = side > 0 ? B.shinL : B.shinR;
    const ft = side > 0 ? B.footL : B.footR;
    const H = R[th];
    const K = R[sh];
    const A = R[ft];
    const lenT = H.distanceTo(K);
    const lenS = K.distanceTo(A);
    const total = lenT + lenS;
    const kneeT = lenT / total;
    const dirT = K.clone().sub(H).normalize();
    const dirS = A.clone().sub(K).normalize();
    const pantsInfl = outfit.bottom === 'gi' ? 1.18 : outfit.bottom === 'cargo' ? 1.1 : outfit.bottom === 'track' ? 1.07 : outfit.bottom === 'skirt' ? 1.0 : 1.03;
    const shorts = outfit.bottom === 'shorts';
    const tights = outfit.bottom === 'skirt';
    const kneeBoots = outfit.shoes === 'kneeboots';
    let prof: [number, number, number, number][] = fem ? FEM_LEG : [
      // t, radius, rz front scale, x offset outward
      [-0.1, 0.1, 1.0, -0.01],
      [0.0, 0.097, 1.0, 0.002],
      [0.1, 0.086, 1.0, 0.004],
      [0.22, 0.078, 1.0, 0.004],
      [0.36, 0.066, 1.0, 0.002],
      [0.47, 0.054, 1.04, 0.0],
      [0.53, 0.053, 1.06, 0.0],
      [0.62, 0.058, 0.9, 0.0],
      [0.72, 0.054, 0.85, 0.0],
      [0.84, 0.04, 0.95, 0.0],
      [0.95, 0.034, 1.0, 0.0],
      [1.04, 0.036, 1.0, 0.0],
    ];
    if (kneeBoots) {
      // the leather shaft from just under the knee: a rolled lip, then the boot over the calf
      const legAt = (t: number) => {
        let i = 0;
        while (i < prof.length - 2 && prof[i + 1][0] < t) i++;
        const a = prof[i], b = prof[i + 1];
        const f = clamp01((t - a[0]) / (b[0] - a[0]));
        return [lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
      };
      const above = prof.filter((p) => p[0] < BOOT_LIP[0][0] - 1e-4);
      const lip = BOOT_LIP.map(([t, extra], i) => {
        const [r, fz] = legAt(t);
        return [t, i === 0 ? r : bootShaft(t) + extra, i === 0 ? fz : 1.0, 0] as [number, number, number, number];
      });
      const below = prof.filter((p) => p[0] > BOOT_LIP[BOOT_LIP.length - 1][0] + 1e-4).map((p) => [p[0], Math.max(p[1] + 0.004, bootShaft(p[0])), 1.0, 0] as [number, number, number, number]);
      prof = [...above, ...lip, ...below];
    }
    const rings: RingSpec[] = [];
    prof.forEach((pp) => {
      const [t, rad, fz, xo] = pp;
      const d = t * total;
      let c: THREE.Vector3;
      let dir: THREE.Vector3;
      if (d <= lenT) {
        c = H.clone().addScaledVector(dirT, d);
        dir = dirT;
      } else {
        c = K.clone().addScaledVector(dirS, d - lenT);
        dir = dirS;
      }
      c.x += xo * side * s;
      const fr = frameFor(dir, new THREE.Vector3(0, 0, 1));
      let w: W;
      if (t < 0.06) w = [[B.hips, 0.45 - t * 3], [th, 0.55 + t * 3]];
      else if (t < kneeT - 0.07) w = [[th, 1]];
      else if (t < kneeT + 0.07) w = boneW(th, sh, (t - (kneeT - 0.07)) / 0.14);
      else if (t < 0.95) w = [[sh, 1]];
      else w = boneW(sh, ft, (t - 0.95) / 0.09);
      const booted = kneeBoots && t >= BOOT_TOP - 1e-4;
      const covered = booted || (shorts ? t < 0.42 : !tights);
      let infl = covered && !booted ? pantsInfl * (outfit.bottom === 'gi' ? lerp(1, 1.12, smoothstep(0.3, 1.0, t)) : 1) : 1;
      // a lab coat's skirts stand off the thighs down to the knee
      if (outfit.top === 'coat' && t < 0.47) infl *= 1.16;
      const r = rad * s * k * infl * legHipFactor(def.spec.hipsW, t);
      // sheer tights let bruises show through a little
      const skin = booted ? 0 : tights ? (outfit.legwear ? 0.5 : 1) : covered ? 0 : 1;
      rings.push({ c, ax: fr.ax, az: fr.az, rx: r, rzF: r * fz, rzB: r, w, v: clamp01((t + 0.1) / 1.14), skin });
    });
    loft(m, rings, fem ? 16 : 12, 'leg', false, false);
    if (kneeBoots && def.spec.heel > 0) buildHeelBoot(m, def, side);
    else buildShoe(m, def, side, outfit);
  }

  // ------------------------------------------------------------------ gear
  buildGear(m, def, outfit);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(m.sw, 4));
  g.setAttribute('aSkin', new THREE.Float32BufferAttribute(m.skin, 1));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(m.sway, 2));
  g.setIndex(m.idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ head
function buildHead(m: MeshAccum, def: SkeletonDef, outfit: Outfit, hiFace: boolean) {
  const s = def.scale * def.spec.headSize;
  const f = def.spec.fem;
  const hb = def.rest[B.head];
  const center = new THREE.Vector3(hb.x, hb.y + 0.07 * s, hb.z + 0.012 * s);
  const rx = lerp(0.088, 0.078, f) * s, ry = lerp(0.118, 0.113, f) * s, rz = lerp(0.104, 0.099, f) * s;
  const lat = f > 0.5 ? 24 : 14, lon = f > 0.5 ? 36 : 20;
  const [u0, v0, uw, vh] = REGION.head;
  const grid: number[][] = [];
  const p = new THREE.Vector3();
  const headStart = m.count;
  for (let j = 0; j <= lat; j++) {
    const phi = (j / lat) * Math.PI; // 0 = bottom (chin), PI = top
    const cy = -Math.cos(phi);
    const sy = Math.sin(phi);
    const row: number[] = [];
    for (let i = 0; i <= lon; i++) {
      const th = (i / lon) * Math.PI * 2; // 0 = back
      let x = -Math.sin(th) * sy;
      let z = -Math.cos(th) * sy;
      let y = cy;
      // ---- shape
      let sx = rx, sz = rz;
      if (y < 0) {
        const jt = Math.pow(-y, lerp(1.4, 1.6, f));
        sx *= lerp(1, lerp(0.74, 0.75, f), jt); // jaw taper (a woman's: an oval, to a finer chin)
        if (f > 0 && y < -0.72) sx *= lerp(1, 0.86, f * smoothstep(-0.72, -0.95, y));
        sz *= lerp(1, 0.9, jt);
      }
      let px = x * sx;
      let py = y * ry;
      let pz = z * sz;
      // a woman's chin: a rounded, defined underside rather than the ellipsoid's point
      if (f > 0 && y < -0.78) py = lerp(py, (-0.78 + (y + 0.78) * 0.62) * ry, f);
      // face flattening & chin forward
      if (z > 0) {
        const front = Math.pow(z, 2);
        pz -= front * lerp(0.012, 0.0105, f) * s * (1 - Math.abs(y));
        if (y < -0.3) pz += front * lerp(0.008, 0.0065, f) * s * smoothstep(-0.3, -0.85, y); // chin
      }
      // brow ridge (soft on a woman)
      const browY = 0.12;
      const bz = Math.max(0, z);
      pz += bz * bz * lerp(0.012, 0.0045, f) * s * Math.exp(-Math.pow((y - browY) / 0.12, 2)) * (1 - x * x * 1.4);
      // cheekbones (higher and fuller on a woman)
      pz += bz * lerp(0.006, 0.007, f) * s * Math.exp(-Math.pow((y - lerp(-0.12, -0.07, f)) / 0.15, 2)) * Math.exp(-Math.pow((Math.abs(x) - 0.55) / 0.2, 2));
      // nose
      if (f < 0.5) {
        const nw = lerp(0.1, 0.08, f);
        const nose = Math.exp(-Math.pow(x / nw, 2)) * Math.exp(-Math.pow((y + 0.22) / 0.16, 2)) * Math.pow(bz, 8);
        pz += nose * lerp(0.016, 0.0135, f) * s;
      } else {
        // a woman's nose: a straight bridge rising to a defined tip, then back in under it
        const ny = y < -0.34 ? Math.exp(-Math.pow((y + 0.34) / 0.06, 2)) : smoothstep(0.1, -0.34, y);
        const nw = lerp(0.055, 0.085, smoothstep(0.0, -0.36, y));
        const nose = ny * Math.exp(-Math.pow(x / nw, 2)) * Math.pow(bz, 6);
        pz += nose * 0.019 * s * f;
        // full lips: the upper, a soft groove, the lower
        const lipX = Math.exp(-Math.pow(x / 0.2, 2)) * Math.pow(bz, 5);
        pz += lipX * f * s * (0.0055 * Math.exp(-Math.pow((y + 0.62) / 0.045, 2)) + 0.006 * Math.exp(-Math.pow((y + 0.72) / 0.05, 2)));
        pz -= lipX * f * s * 0.0035 * Math.exp(-Math.pow((y + 0.8) / 0.035, 2)); // under the lower lip
        pz += Math.pow(bz, 3) * f * s * 0.004 * Math.exp(-Math.pow((y + 0.9) / 0.07, 2)) * Math.exp(-Math.pow(x / 0.3, 2)); // the chin
      }
      if (f > 0) {
        // a little hollow under the cheekbones, eye sockets under the brow
        pz -= f * 0.0008 * s * Math.exp(-Math.pow((y + 0.38) / 0.12, 2)) * Math.exp(-Math.pow((Math.abs(x) - 0.55) / 0.15, 2)) * bz;
        pz -= f * 0.0028 * s * Math.exp(-Math.pow((y - 0.01) / 0.08, 2)) * Math.exp(-Math.pow((Math.abs(x) - 0.38) / 0.12, 2)) * bz * bz;
        // the jaw and the back of the head under the skull are slimmer (the neck takes over)
        if (z < 0) pz *= lerp(1, 0.8, f * smoothstep(-0.35, -0.95, y));
      }
      // occipital bulge
      if (z < 0) pz -= Math.pow(-z, 3) * 0.008 * s * Math.exp(-Math.pow((y - 0.1) / 0.4, 2));
      p.set(center.x + px, center.y + py, center.z + pz);
      const w: W = y < -0.55 ? [[B.head, 0.75], [B.neck, 0.25]] : [[B.head, 1]];
      // skin mask: face skin, hair region not skin (approx by height/back)
      const hairCover = outfit.hairStyle === 'bald' || outfit.hairStyle === 'buzz' ? 0 : smoothstep(0.15, 0.4, y + (z < 0 ? 0.35 : -0.05));
      let skin = 1 - hairCover;
      if (outfit.head === 'balaclava' || outfit.head === 'mask') skin = 0;
      row.push(m.vert(p, u0 + uw * (i / lon), v0 + vh * (j / lat), w, skin));
    }
    grid.push(row);
  }
  emitQuads(m, grid, () => center);
  // ears
  for (const side of [1, -1]) {
    const ec = new THREE.Vector3(center.x + side * rx * 0.97, center.y - 0.004 * s, center.z - 0.006 * s);
    const er = lerp(0.02, 0.0175, f) * s;
    const eg: number[][] = [];
    for (let j = 0; j <= 4; j++) {
      const phi = (j / 4) * Math.PI;
      const row: number[] = [];
      for (let i = 0; i <= 6; i++) {
        const th = (i / 6) * Math.PI * 2;
        const pp = new THREE.Vector3(
          ec.x + side * (Math.sin(phi) * Math.cos(th) * 0.35 + 0.25) * er,
          ec.y + -Math.cos(phi) * er * 1.5,
          ec.z + Math.sin(phi) * Math.sin(th) * er * 0.8,
        );
        row.push(m.vert(pp, u0 + uw * 0.25, v0 + vh * 0.5, [[B.head, 1]], 1));
      }
      eg.push(row);
    }
    const earInside = new THREE.Vector3(ec.x + side * 0.25 * er, ec.y, ec.z);
    emitQuads(m, eg, () => earInside);
  }
  if (hiFace) {
    // the head (and ears) sample a layer of their own at twice the detail
    for (let i = headStart; i < m.count; i++) {
      m.uv[i * 2] = 1 + Math.min(0.9999, Math.max(0, (m.uv[i * 2] - u0) / uw));
      m.uv[i * 2 + 1] = Math.min(1, Math.max(0, (m.uv[i * 2 + 1] - v0) / vh));
    }
  }
  if (outfit.extras.includes('earrings')) buildEarrings(m, def, center, rx);
  // hair / headwear shells
  const shell = (rScale: number, yMin: number, region: RegionName, extraBack = 0, skin = 0, mohawk = false) => {
    const [hu0, hv0, huw, hvh] = REGION[region];
    const g2: number[][] = [];
    const lat2 = 8, lon2 = 18;
    for (let j = 0; j <= lat2; j++) {
      const yy = lerp(yMin, 1, j / lat2);
      const phi = Math.acos(clampSym(yy));
      const row: number[] = [];
      for (let i = 0; i <= lon2; i++) {
        const th = (i / lon2) * Math.PI * 2;
        const sy = Math.sin(phi);
        let x = -Math.sin(th) * sy;
        let z = -Math.cos(th) * sy;
        const y = Math.cos(phi);
        // raise front hairline: pull front-bottom vertices up
        let yy2 = y;
        if (z > 0.15 && y < 0.62) yy2 = lerp(y, 0.62, smoothstep(0.15, 0.85, z) * 0.92);
        let rs = rScale;
        if (z < 0) rs += extraBack * Math.pow(-z, 2) * smoothstep(0.6, -0.2, y);
        let mh = 0;
        if (mohawk) mh = Math.exp(-Math.pow(x / 0.18, 2)) * 0.035 * s * smoothstep(0.1, 0.7, y);
        const px = center.x + x * rx * rs;
        const py = center.y + yy2 * ry * rs + mh;
        const pz = center.z + z * rz * rs + (z > 0 ? 0 : 0);
        row.push(m.vert(new THREE.Vector3(px, py, pz), hu0 + huw * (i / lon2), hv0 + hvh * (j / lat2), [[B.head, 1]], skin));
      }
      g2.push(row);
    }
    emitQuads(m, g2, () => center);
  };
  const hs = outfit.hairStyle;
  if (hs === 'longwave' && outfit.head === 'none') buildLongWaveHair(m, def, center, rx, ry, rz);
  if (outfit.head === 'none' || outfit.head === 'bandana' || outfit.head === 'headband' || outfit.head === 'mask') {
    if (hs === 'short' || hs === 'slick' || hs === 'long' || hs === 'ponytail' || hs === 'topknot') shell(1.06, -0.15, 'hair', hs === 'long' ? 0.12 : 0.04);
    if (hs === 'mohawk') shell(1.015, 0.25, 'hair', 0, 0, true);
    if (hs === 'ponytail' || hs === 'topknot') {
      // small knot/tail
      const kc = hs === 'topknot' ? new THREE.Vector3(center.x, center.y + ry * 1.05, center.z - rz * 0.25) : new THREE.Vector3(center.x, center.y + ry * 0.35, center.z - rz * 1.12);
      blob(m, kc, new THREE.Vector3(0.028, 0.028, 0.028).multiplyScalar(s), 'hair', [[B.head, 1]], 0);
      if (hs === 'ponytail') blob(m, kc.clone().add(new THREE.Vector3(0, -0.07 * s, -0.025 * s)), new THREE.Vector3(0.024, 0.07, 0.024).multiplyScalar(s), 'hair', [[B.head, 0.6], [B.neck, 0.4]], 0);
    }
  }
  if (outfit.head === 'cap' || outfit.head === 'beanie' || outfit.head === 'helmet') {
    shell(outfit.head === 'helmet' ? 1.14 : 1.07, outfit.head === 'beanie' ? -0.05 : 0.05, 'gear', 0.02);
    if (outfit.head === 'cap') {
      // brim
      const bc = new THREE.Vector3(center.x, center.y + ry * 0.42, center.z + rz * 1.02);
      flatBox(m, bc, new THREE.Vector3(0.075 * s, 0.006 * s, 0.05 * s), -0.12, 'gear', [[B.head, 1]]);
    }
  }
  if (outfit.head === 'hood') {
    shell(1.18, -0.45, 'gear', 0.28);
  }
}

// ------------------------------------------------------------------ fist
function buildFist(m: MeshAccum, def: SkeletonDef, side: number, outfit: Outfit) {
  const ha = side > 0 ? B.handL : B.handR;
  const fa = side > 0 ? B.farmL : B.farmR;
  const s = def.scale * Math.max(1, def.spec.bulk * 0.92) * lerp(1, 0.87, def.spec.fem);
  const W0 = def.rest[ha];
  const u = def.restDir[ha].clone();
  const v = def.restUp[ha].clone();
  const w = new THREE.Vector3().crossVectors(u, v).multiplyScalar(side); // thumb dir
  const skin = outfit.hands === 'gloves' ? 0 : outfit.hands === 'wraps' ? 0.3 : 1;
  const [u0, v0, uw, vh] = REGION.hand;
  // superellipsoid fist
  const L = 0.098 * s, Wd = 0.088 * s, T = 0.058 * s;
  const cU = 0.052 * s, cV = -0.004 * s;
  const lat = 7, lon = 10;
  const g: number[][] = [];
  for (let j = 0; j <= lat; j++) {
    const phi = (j / lat) * Math.PI;
    const row: number[] = [];
    for (let i = 0; i <= lon; i++) {
      const th = (i / lon) * Math.PI * 2;
      const e = 0.55; // squareness
      const sp = Math.sin(phi), cp = Math.cos(phi);
      const st = Math.sin(th), ct = Math.cos(th);
      const fx = Math.sign(cp) * Math.pow(Math.abs(cp), e);
      const fy = Math.sign(sp * ct) * Math.pow(Math.abs(sp * ct), e);
      const fz = Math.sign(sp * st) * Math.pow(Math.abs(sp * st), e);
      // fx along u (finger axis), fy along v (back), fz along w (thumb side)
      let du = fx * L * 0.5;
      let dv = fy * T * 0.5;
      let dw = fz * Wd * 0.5;
      // narrower at wrist
      if (fx < 0) {
        dv *= lerp(1, 0.75, -fx);
        dw *= lerp(1, 0.8, -fx);
      }
      // knuckle ridge on back/front
      if (fx > 0.5 && fy > 0) dv += 0.004 * s;
      const p = W0.clone().addScaledVector(u, cU + du).addScaledVector(v, cV + dv).addScaledVector(w, dw);
      const wt: W = fx < -0.7 ? [[ha, 0.7], [fa, 0.3]] : [[ha, 1]];
      row.push(m.vert(p, u0 + uw * (i / lon), v0 + vh * (j / lat), wt, skin));
    }
    g.push(row);
  }
  const fistC = W0.clone().addScaledVector(u, cU).addScaledVector(v, cV);
  emitQuads(m, g, () => fistC);
  // thumb
  const tc = W0.clone().addScaledVector(u, 0.05 * s).addScaledVector(v, -0.026 * s).addScaledVector(w, 0.038 * s);
  blob(m, tc, new THREE.Vector3(0.016, 0.016, 0.016).multiplyScalar(s), 'hand', [[ha, 1]], skin, 4, 6);
}

// ------------------------------------------------------------------ shoe
function buildShoe(m: MeshAccum, def: SkeletonDef, side: number, outfit: Outfit) {
  const ft = side > 0 ? B.footL : B.footR;
  const to = side > 0 ? B.toeL : B.toeR;
  const sh = side > 0 ? B.shinL : B.shinR;
  const s = def.scale;
  const A = def.rest[ft];
  const bare = outfit.shoes === 'barefoot' || outfit.shoes === 'wraps';
  const boot = outfit.shoes === 'boots' || outfit.shoes === 'kneeboots';
  const skin = bare ? 1 : 0;
  // rings along z (heel -> toe), cross-section rounded rect in x/y
  const prof: [number, number, number, number, W][] = [
    // z offset from ankle, half width, bottom y(abs), top y(abs)
    [-0.07, 0.034, 0.0, boot ? 0.16 : 0.085, [[ft, 1]]],
    [-0.055, 0.042, 0.0, boot ? 0.17 : 0.1, [[ft, 1]]],
    [-0.02, 0.046, 0.0, boot ? 0.17 : 0.11, boot ? [[ft, 0.85], [sh, 0.15]] : [[ft, 1]]],
    [0.03, 0.048, 0.0, 0.09, [[ft, 1]]],
    [0.08, 0.05, 0.0, 0.07, [[ft, 1]]],
    [0.12, 0.05, 0.0, 0.058, [[ft, 0.6], [to, 0.4]]],
    [0.16, 0.046, 0.0, 0.048, [[to, 1]]],
    [0.19, 0.036, 0.004, 0.038, [[to, 1]]],
    [0.205, 0.022, 0.008, 0.028, [[to, 1]]],
  ];
  const rings: RingSpec[] = prof.map((pp, i) => {
    const [z, hw, yb, yt] = pp;
    const hh = ((yt - yb) * s) / 2;
    return {
      c: new THREE.Vector3(A.x + side * 0.004 * s, (yb * s + yt * s) / 2, A.z + z * s),
      ax: new THREE.Vector3(1, 0, 0),
      az: new THREE.Vector3(0, 1, 0),
      rx: hw * s * (bare ? 0.9 : 1),
      rzF: hh,
      rzB: hh,
      pw: 3.2,
      w: pp[4],
      v: i / (prof.length - 1),
      skin,
    };
  });
  // loft uses az as the 'front' axis; here az = up so 'front' = top of shoe.
  loft(m, rings, 10, 'foot', true, true);
}

// ------------------------------------------------------------------ gear
function buildGear(m: MeshAccum, def: SkeletonDef, outfit: Outfit) {
  const s = def.scale;
  const k = def.spec.bulk;
  const R = def.rest;
  const ring = (y: number, rx: number, rz: number, h: number, w: W, zOff = 0, region: RegionName = 'gear') => {
    const rings: RingSpec[] = [0, 1].map((i) => ({
      c: new THREE.Vector3(0, y + (i - 0.5) * h, zOff),
      ax: new THREE.Vector3(1, 0, 0),
      az: new THREE.Vector3(0, 0, 1),
      rx,
      rzF: rz,
      rzB: rz,
      pw: 2.35,
      w,
      v: i,
      skin: 0,
    }));
    loft(m, rings, 18, region, false, false);
  };
  const hipsY = R[B.hips].y;
  if (outfit.extras.includes('belt') || outfit.extras.includes('sash') || outfit.top === 'gi') {
    ring(hipsY + 0.04 * s, 0.158 * s * k * 1.07, 0.103 * s * k * 1.07, 0.04 * s, [[B.hips, 0.6], [B.spine, 0.4]], 0.002 * s);
  }
  if (outfit.extras.includes('kneepads')) {
    for (const side of [1, -1]) {
      const kn = R[side > 0 ? B.shinL : B.shinR];
      blob(m, kn.clone().add(new THREE.Vector3(0, 0.0, 0.045 * s)), new THREE.Vector3(0.048, 0.06, 0.03).multiplyScalar(s * k), 'gear', [[side > 0 ? B.shinL : B.shinR, 0.6], [side > 0 ? B.thighL : B.thighR, 0.4]], 0);
    }
  }
  if (outfit.extras.includes('shoulderpads')) {
    for (const side of [1, -1]) {
      const sp = R[side > 0 ? B.uarmL : B.uarmR];
      blob(m, sp.clone().add(new THREE.Vector3(side * 0.02 * s, 0.04 * s, 0)), new THREE.Vector3(0.085, 0.05, 0.085).multiplyScalar(s * k), 'gear', [[side > 0 ? B.uarmL : B.uarmR, 0.6], [side > 0 ? B.clavL : B.clavR, 0.4]], 0);
    }
  }
  if (outfit.extras.includes('chestarmor')) {
    blob(m, new THREE.Vector3(0, R[B.chest].y + 0.06 * s, 0.07 * s * k), new THREE.Vector3(0.17, 0.13, 0.07).multiplyScalar(s * k), 'gear', [[B.chest, 1]], 0, 6, 10);
  }
  if (outfit.extras.includes('bracers')) {
    for (const side of [1, -1]) {
      const fa = side > 0 ? B.farmL : B.farmR;
      const ha = side > 0 ? B.handL : B.handR;
      const c = R[fa].clone().lerp(R[ha], 0.62);
      const dir = R[ha].clone().sub(R[fa]).normalize();
      const fr = frameFor(dir, new THREE.Vector3(0, 0, 1));
      const rings: RingSpec[] = [0, 1, 2].map((i) => ({
        c: c.clone().addScaledVector(dir, (i - 1) * 0.06 * s),
        ax: fr.ax,
        az: fr.az,
        rx: (0.046 - i * 0.004) * s * k,
        rzF: (0.046 - i * 0.004) * s * k,
        rzB: (0.046 - i * 0.004) * s * k,
        w: [[fa, 1]],
        v: i / 2,
        skin: 0,
      }));
      loft(m, rings, 10, 'gear', false, false);
    }
  }
  if (outfit.extras.includes('chain')) {
    ring(R[B.neck].y - 0.02 * s, 0.075 * s, 0.07 * s, 0.012 * s, [[B.chest, 0.5], [B.neck, 0.5]], 0.01 * s);
  }
}
