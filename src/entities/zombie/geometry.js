// Shared, cached zombie body geometry (one merged BufferGeometry per variant). Every vertex carries the
// bone it follows (aBone) and a visibility group (aGroup) so a whole zombie renders in ONE draw call with
// a tiny skinning shader (see material.js).
import * as THREE from 'three';
import {
  PX, SKIN, REGIONS, FREE, faceRect, BONE, GROUP, VARIANT_DIMS, jointLayout,
} from './layout.js';

const UV_INSET = 0.012; // texels, avoids nearest-filter bleeding at face edges

class GeoBuilder {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.bone = []; this.group = []; this.idx = [];
    this.boxes = []; // for raycasting: {bone, min:[..], max:[..]}
  }

  /**
   * Box in bone-local pixel space. uvs: {top,bottom,right,front,left,back} → [x,y,w,h] image rects.
   */
  box(bone, group, x0, y0, z0, x1, y1, z1, uvs) {
    const corners = {
      front: [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]],
      back: [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]],
      right: [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]],
      left: [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]],
      top: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
      bottom: [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]],
    };
    const normals = {
      front: [0, 0, 1], back: [0, 0, -1], right: [-1, 0, 0], left: [1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0],
    };
    for (const face of ['top', 'bottom', 'right', 'front', 'left', 'back']) {
      const r = uvs[face];
      if (!r) continue;
      const base = this.pos.length / 3;
      const c = corners[face];
      const n = normals[face];
      const u0 = (r[0] + UV_INSET) / SKIN, u1 = (r[0] + r[2] - UV_INSET) / SKIN;
      // DataTexture with flipY = false: image row 0 is v = 0
      const v0 = (r[1] + UV_INSET) / SKIN, v1 = (r[1] + r[3] - UV_INSET) / SKIN;
      const tuv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      for (let k = 0; k < 4; k++) {
        this.pos.push(c[k][0] * PX, c[k][1] * PX, c[k][2] * PX);
        this.nor.push(n[0], n[1], n[2]);
        this.uv.push(tuv[k][0], tuv[k][1]);
        this.bone.push(bone);
        this.group.push(group);
      }
      this.idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aBone', new THREE.Float32BufferAttribute(this.bone, 1));
    g.setAttribute('aGroup', new THREE.Float32BufferAttribute(this.group, 1));
    g.setIndex(this.idx);
    return g;
  }
}

/** Minecraft-layout face rects for a part, optionally only a row range [r0, r1) of the side faces. */
function partUVs(origin, dims, r0 = 0, r1 = null, caps = {}) {
  const [u, v] = origin;
  const [w, h, d] = dims;
  if (r1 === null) r1 = h;
  const out = {};
  for (const f of ['right', 'front', 'left', 'back']) {
    const r = faceRect(u, v, w, h, d, f);
    out[f] = [r[0], r[1] + r0, r[2], r1 - r0];
  }
  out.top = caps.top !== undefined ? caps.top : faceRect(u, v, w, h, d, 'top');
  out.bottom = caps.bottom !== undefined ? caps.bottom : faceRect(u, v, w, h, d, 'bottom');
  return out;
}
function allFaces(rect) {
  return { top: rect, bottom: rect, right: rect, front: rect, left: rect, back: rect };
}
function sub(rect, x, y, w, h) { return [rect[0] + x, rect[1] + y, w, h]; }

const cache = new Map();

/**
 * Returns {geometry, boxes, dims, joints} for a variant (cached, shared by all zombies of that variant).
 * boxes: per bone local AABB in metres for precise ray tests.
 */
export function getZombieGeometry(variant) {
  const key = VARIANT_DIMS[variant] ? variant : 'walker';
  if (cache.has(key)) return cache.get(key);
  const dims = VARIANT_DIMS[key];
  const J = jointLayout(dims);
  const B = new GeoBuilder();
  const [tw, th, td] = dims.torso;
  const [aw, ad] = dims.arm;
  const [lw, ld] = dims.leg;
  const R = REGIONS;
  const mid = (o, dms, row) => { // 1-row strip from the front face, used for hidden inner caps
    const r = faceRect(o[0], o[1], dms[0], dms[1], dms[2], 'front');
    return [r[0], r[1] + row, r[2], 1];
  };

  // ---- torso (pivot at hip level, centre)
  const tb = [-tw / 2, 0, -td / 2, tw / 2, th, td / 2];
  B.box(BONE.torso, GROUP.torso, ...tb, partUVs(R.torso.base, R.torso.dims));
  const ti = 0.25;
  B.box(BONE.torso, GROUP.torso, tb[0] - ti, tb[1] - ti, tb[2] - ti, tb[3] + ti, tb[4] + ti, tb[5] + ti, partUVs(R.torso.over, R.torso.dims));

  // ---- head: cranium (y 2..8) + jaw (y 0..2, hinged at the back)
  const hd = R.head.dims;
  const mouth = FREE.mouth;
  B.box(BONE.head, GROUP.head, -4, 2, -4, 4, 8, 4, partUVs(R.head.base, hd, 0, 6, { bottom: sub(mouth, 0, 0, 8, 4) }));
  const hi = 0.5;
  B.box(BONE.head, GROUP.hat, -4 - hi, 2 - hi * 0.6, -4 - hi, 4 + hi, 8 + hi, 4 + hi, partUVs(R.head.over, hd, 0, 6, { bottom: null }));
  // jaw in jaw-local space (hinge at head (0,2,-3.5))
  const [jx, jy, jz] = J.jaw;
  B.box(BONE.jaw, GROUP.jaw, -3.9 - jx, 0 - jy, -4 - jz, 3.9 - jx, 2 - jy, 3.95 - jz, partUVs(R.head.base, hd, 6, 8, { top: sub(mouth, 0, 4, 8, 4) }));

  // ---- arms (upper pivot at shoulder: y -4..2, lower pivot at elbow: y -6..0)
  const armBoxes = (side, uBone, lBone, uGroup, lGroup, reg) => {
    const ux = [-aw / 2, aw / 2], uz = [-ad / 2, ad / 2];
    const dm = reg.dims;
    B.box(uBone, uGroup, ux[0], -4, uz[0], ux[1], 2, uz[1], partUVs(reg.base, dm, 0, 6, { bottom: mid(reg.base, dm, 6) }));
    B.box(lBone, lGroup, ux[0], -6, uz[0], ux[1], 0, uz[1], partUVs(reg.base, dm, 6, 12, { top: mid(reg.base, dm, 6) }));
    const oi = 0.25;
    B.box(uBone, uGroup, ux[0] - oi, -4, uz[0] - oi, ux[1] + oi, 2 + oi, uz[1] + oi, partUVs(reg.over, dm, 0, 6, { bottom: null }));
    B.box(lBone, lGroup, ux[0] - oi, -6 - oi, uz[0] - oi, ux[1] + oi, 0, uz[1] + oi, partUVs(reg.over, dm, 6, 12, { top: null }));
  };
  armBoxes('R', BONE.armUR, BONE.armLR, GROUP.armUR, GROUP.armLR, R.armR);
  armBoxes('L', BONE.armUL, BONE.armLL, GROUP.armUL, GROUP.armLL, R.armL);

  // ---- legs (upper pivot at hip: y -6..0, lower pivot at knee: y -6..0)
  const legBoxes = (uBone, lBone, uGroup, lGroup, reg) => {
    const lx = [-lw / 2, lw / 2], lz = [-ld / 2, ld / 2];
    const dm = reg.dims;
    B.box(uBone, uGroup, lx[0], -6, lz[0], lx[1], 0, lz[1], partUVs(reg.base, dm, 0, 6, { bottom: mid(reg.base, dm, 6) }));
    B.box(lBone, lGroup, lx[0], -6, lz[0], lx[1], 0, lz[1], partUVs(reg.base, dm, 6, 12, { top: mid(reg.base, dm, 6) }));
    const oi = 0.25;
    B.box(uBone, uGroup, lx[0] - oi, -6, lz[0] - oi, lx[1] + oi, 0 + oi, lz[1] + oi, partUVs(reg.over, dm, 0, 6, { bottom: null }));
    B.box(lBone, lGroup, lx[0] - oi, -6 - oi, lz[0] - oi, lx[1] + oi, 0, lz[1] + oi, partUVs(reg.over, dm, 6, 12, { top: null }));
  };
  legBoxes(BONE.legUR, BONE.legLR, GROUP.legUR, GROUP.legLR, R.legR);
  legBoxes(BONE.legUL, BONE.legLL, GROUP.legUL, GROUP.legLL, R.legL);

  // ---- stumps (hidden until dismember)
  const gore = FREE.gore;
  const goreCap = sub(gore, 2, 2, 4, 4);
  const goreRing = sub(gore, 0, 0, 8, 2);
  B.box(BONE.torso, GROUP.stumpNeck, -2.2, th, -1.6, 2.2, th + 1.4, 1.6, { ...allFaces(goreRing), top: goreCap });
  const stumpArm = (bone, gSh, gEl, reg) => {
    const dm = reg.dims;
    const e = 0.08;
    B.box(bone, gSh, -aw / 2 - e, -1.2, -ad / 2 - e, aw / 2 + e, 2 + e, ad / 2 + e, partUVs(reg.base, dm, 0, 3, { bottom: goreCap }));
    B.box(bone, gEl, -aw / 2 + 0.15, -4.6, -ad / 2 + 0.15, aw / 2 - 0.15, -3.9, ad / 2 - 0.15, { ...allFaces(goreRing), bottom: goreCap });
  };
  stumpArm(BONE.armUR, GROUP.stumpShR, GROUP.stumpElR, R.armR);
  stumpArm(BONE.armUL, GROUP.stumpShL, GROUP.stumpElL, R.armL);
  const stumpLeg = (bone, gHip, gKn, reg) => {
    const dm = reg.dims;
    const e = 0.08;
    B.box(bone, gHip, -lw / 2 - e, -2.4, -ld / 2 - e, lw / 2 + e, 0.2, ld / 2 + e, partUVs(reg.base, dm, 0, 3, { bottom: goreCap }));
    B.box(bone, gKn, -lw / 2 + 0.15, -6.7, -ld / 2 + 0.15, lw / 2 - 0.15, -5.9, ld / 2 - 0.15, { ...allFaces(goreRing), bottom: goreCap });
  };
  stumpLeg(BONE.legUR, GROUP.stumpHipR, GROUP.stumpKnR, R.legR);
  stumpLeg(BONE.legUL, GROUP.stumpHipL, GROUP.stumpKnL, R.legL);

  // ---- accessories (shown per outfit)
  const accA = FREE.accA, accB = FREE.accB, accC = FREE.accC;
  // backpack on the back of the torso
  const bpW = Math.min(7, tw - 1), bpD = 3;
  B.box(BONE.torso, GROUP.backpack, -bpW / 2, 2.5, -td / 2 - bpD, bpW / 2, 11, -td / 2 + 0.1, {
    back: sub(accB, 0, 0, 8, 10), front: sub(accB, 0, 10, 8, 6), top: sub(accB, 0, 10, 8, 3), bottom: sub(accB, 0, 13, 8, 3),
    left: sub(accB, 0, 10, 3, 6), right: sub(accB, 5, 10, 3, 6),
  });
  // cap visor (front of the forehead)
  B.box(BONE.head, GROUP.visor, -4.0, 6.3, 3.9, 4.0, 6.85, 6.6, allFaces(sub(accA, 0, 0, 8, 4)));
  // round brim (helmets / hard hats / hats)
  B.box(BONE.head, GROUP.brim, -5.6, 6.4, -6.2, 5.6, 7.1, 6.2, allFaces(sub(accA, 0, 4, 8, 4)));
  // swollen belly (bloater): a second box bulging out of the torso front, textured with the shirt front
  if (dims.belly) {
    const [bw, by0, bz0, by1, bdepth] = dims.belly;
    const TF = faceRect(R.torso.base[0], R.torso.base[1], 8, 12, 4, 'front');
    const TR = faceRect(R.torso.base[0], R.torso.base[1], 8, 12, 4, 'right');
    const TL = faceRect(R.torso.base[0], R.torso.base[1], 8, 12, 4, 'left');
    const r0 = 2, r1 = 11;
    B.box(BONE.torso, GROUP.torso, -bw / 2, by0, bz0, bw / 2, by1, bz0 + bdepth, {
      front: [TF[0], TF[1] + r0, 8, r1 - r0], right: [TR[0], TR[1] + r0, 4, r1 - r0], left: [TL[0], TL[1] + r0, 4, r1 - r0],
      top: [TF[0], TF[1] + r0, 8, 1], bottom: [TF[0], TF[1] + r1 - 1, 8, 1],
    });
  }
  // pustules (bloater)
  if (key === 'bloater') {
    const bz = dims.belly ? dims.belly[2] + dims.belly[4] : td / 2;
    const pust = [
      [2.5, 7.0, bz, 2.2], [-3.0, 4.0, bz, 1.8], [tw / 2, 8, 0.5, 2.0], [-tw / 2, 6, -1.0, 2.4], [4.8, 4.5, bz - 1.5, 1.8],
      [1.0, 3.0, -td / 2, 2.0], [-2.0, 9.6, bz - 1.2, 1.5], [-4.8, 7.5, bz - 2.0, 1.6],
    ];
    pust.forEach(([x, y, z, s], i) => {
      const r = sub(accC, (i % 2) * 4, Math.floor(i / 2) * 4 % 16, 4, 4);
      B.box(BONE.torso, GROUP.pustules, x - s / 2, y - s / 2, z - s / 2, x + s / 2, y + s / 2, z + s / 2, allFaces(r));
    });
  }

  const geometry = B.build();
  const s = dims.scale;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8 * s, 0), 1.6 * s);
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-1.6 * s, -0.2, -1.6 * s), new THREE.Vector3(1.6 * s, 2.0 * s, 1.6 * s));

  // ray-test boxes per bone (metres, bone-local); include overlay inflation
  const P = (a) => a.map((v) => v * PX);
  const boxes = [];
  boxes[BONE.torso] = { min: P([-tw / 2 - 0.25, 0, -td / 2 - 0.25]), max: P([tw / 2 + 0.25, th + 0.25, td / 2 + 0.25]) };
  boxes[BONE.head] = { min: P([-4.3, 1.5, -4.3]), max: P([4.3, 8.4, 4.3]) };
  boxes[BONE.jaw] = { min: P([-3.9 - jx, -jy, -4 - jz]), max: P([3.9 - jx, 2 - jy, 4 - jz]) };
  for (const b of [BONE.armUR, BONE.armUL]) boxes[b] = { min: P([-aw / 2 - 0.25, -4, -ad / 2 - 0.25]), max: P([aw / 2 + 0.25, 2.25, ad / 2 + 0.25]) };
  for (const b of [BONE.armLR, BONE.armLL]) boxes[b] = { min: P([-aw / 2 - 0.25, -6.25, -ad / 2 - 0.25]), max: P([aw / 2 + 0.25, 0, ad / 2 + 0.25]) };
  for (const b of [BONE.legUR, BONE.legUL]) boxes[b] = { min: P([-lw / 2 - 0.25, -6, -ld / 2 - 0.25]), max: P([lw / 2 + 0.25, 0.25, ld / 2 + 0.25]) };
  for (const b of [BONE.legLR, BONE.legLL]) boxes[b] = { min: P([-lw / 2 - 0.25, -6.25, -ld / 2 - 0.25]), max: P([lw / 2 + 0.25, 0, ld / 2 + 0.25]) };

  const entry = { geometry, boxes, dims, joints: J };
  cache.set(key, entry);
  return entry;
}
