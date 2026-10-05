// Visual R6 rig (the only body type that existed in 2008):
//   Head 2x1x1 part with the cylindrical "head" mesh, Torso 2x2x1,
//   arms and legs 1x2x1. Clothing uses the 585x559 shirt/pants template.
import * as THREE from 'three';
import { brickColor } from './BrickColor.js';
import { headGeometry, faceGeometry, faceTexture } from './headshape.js';
import { buildHat } from './hats.js';
import { drawClothing } from './clothing.js';

import { TEMPLATE_W, TEMPLATE_H, REGIONS } from './template.js';
export { TEMPLATE_W, TEMPLATE_H, REGIONS };

// For each face: outward normal, image-right direction and image-up direction
// (as seen from outside, character facing -Z).
const FACE_FRAMES = {
  Front: { n: [0, 0, -1], r: [-1, 0, 0], u: [0, 1, 0] },
  Back: { n: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0] },
  Right: { n: [1, 0, 0], r: [0, 0, -1], u: [0, 1, 0] },
  Left: { n: [-1, 0, 0], r: [0, 0, 1], u: [0, 1, 0] },
  Top: { n: [0, 1, 0], r: [-1, 0, 0], u: [0, 0, 1] },
  Bottom: { n: [0, -1, 0], r: [-1, 0, 0], u: [0, 0, -1] },
};

function faceOfNormal(nx, ny, nz) {
  for (const [name, f] of Object.entries(FACE_FRAMES)) {
    if (Math.abs(f.n[0] - nx) < 0.5 && Math.abs(f.n[1] - ny) < 0.5 && Math.abs(f.n[2] - nz) < 0.5) return name;
  }
  return 'Front';
}

/** Box geometry whose UVs point into a region set of the clothing template. */
function templateBox(sx, sy, sz, regions) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  const h = [sx / 2, sy / 2, sz / 2];
  for (let i = 0; i < pos.count; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const face = faceOfNormal(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    const f = FACE_FRAMES[face];
    const proj = (axis) => (p[0] * axis[0] / h[0] * Math.abs(axis[0]) + p[1] * axis[1] / h[1] * Math.abs(axis[1]) + p[2] * axis[2] / h[2] * Math.abs(axis[2]));
    const s = (proj(f.r) + 1) / 2; // 0..1 left->right
    const t = (proj(f.u) + 1) / 2; // 0..1 bottom->top
    const [rx, ry, rw, rh] = regions[face];
    // inset half a pixel to avoid bleeding
    const U = (rx + 0.5 + s * (rw - 1)) / TEMPLATE_W;
    const V = 1 - (ry + 0.5 + (1 - t) * (rh - 1)) / TEMPLATE_H;
    uv.setXY(i, U, V);
  }
  return g;
}

function colorOf(num) {
  const c = brickColor(num);
  return new THREE.Color().setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);
}

export const DEFAULT_APPEARANCE = {
  colors: { head: 24, torso: 23, leftArm: 24, rightArm: 24, leftLeg: 119, rightLeg: 119 },
  face: 'Smile',
  hats: [],
  shirt: null,
  pants: null,
  tshirt: null,
};

/**
 * Builds the rig. Joints are THREE.Group pivots so the classic Motor angles
 * (RightShoulder, LeftShoulder, RightHip, LeftHip) can be applied directly.
 */
export class CharacterModel {
  constructor(appearance = DEFAULT_APPEARANCE) {
    this.root = new THREE.Group(); // origin = torso center
    this.appearance = appearance;
    this._build();
    this.angles = { rs: 0, ls: 0, rh: 0, lh: 0 };
  }

  _textures() {
    const a = this.appearance;
    const upper = document.createElement('canvas');
    upper.width = TEMPLATE_W; upper.height = TEMPLATE_H;
    const lower = document.createElement('canvas');
    lower.width = TEMPLATE_W; lower.height = TEMPLATE_H;
    const uctx = upper.getContext('2d'), lctx = lower.getContext('2d');
    const css = (n) => '#' + colorOf(n).getHexString(THREE.SRGBColorSpace);
    const fillRegions = (ctx, regions, color) => {
      ctx.fillStyle = color;
      for (const [x, y, w, h] of Object.values(regions)) ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    };
    // skin
    fillRegions(uctx, REGIONS.torso, css(a.colors.torso));
    fillRegions(uctx, REGIONS.rightLimb, css(a.colors.rightArm));
    fillRegions(uctx, REGIONS.leftLimb, css(a.colors.leftArm));
    fillRegions(lctx, REGIONS.torso, css(a.colors.torso));
    fillRegions(lctx, REGIONS.rightLimb, css(a.colors.rightLeg));
    fillRegions(lctx, REGIONS.leftLimb, css(a.colors.leftLeg));
    // pants: legs + torso, shirt: torso + arms (shirt drawn over pants on torso)
    if (a.pants) {
      drawClothing(lctx, a.pants, 'pants');
      const tmp = document.createElement('canvas');
      tmp.width = TEMPLATE_W; tmp.height = TEMPLATE_H;
      drawClothing(tmp.getContext('2d'), a.pants, 'pants');
      for (const [x, y, w, h] of Object.values(REGIONS.torso)) uctx.drawImage(tmp, x, y, w, h, x, y, w, h);
    }
    if (a.shirt) {
      const tmp = document.createElement('canvas');
      tmp.width = TEMPLATE_W; tmp.height = TEMPLATE_H;
      drawClothing(tmp.getContext('2d'), a.shirt, 'shirt');
      for (const set of [REGIONS.torso, REGIONS.rightLimb, REGIONS.leftLimb]) {
        for (const [x, y, w, h] of Object.values(set)) uctx.drawImage(tmp, x, y, w, h, x, y, w, h);
      }
    }
    const mk = (c) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    return { upper: mk(upper), lower: mk(lower) };
  }

  _build() {
    const a = this.appearance;
    const tex = this._textures();
    const mat = (map) => new THREE.MeshPhongMaterial({ map, shininess: 12, specular: 0x1c1c1c });
    const upperMat = mat(tex.upper), lowerMat = mat(tex.lower);
    this.materials = [upperMat, lowerMat];

    const torso = new THREE.Mesh(templateBox(2, 2, 1, REGIONS.torso), upperMat);
    this.torso = torso;
    this.root.add(torso);

    // T-shirt decal: square on the torso front
    if (a.tshirt) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      drawClothing(c.getContext('2d'), a.tshirt, 'tshirt');
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshPhongMaterial({ map: t, transparent: true, shininess: 8, depthWrite: false }));
      decal.position.z = -0.505;
      decal.rotation.y = Math.PI;
      torso.add(decal);
    }

    // Head
    this.neck = new THREE.Group();
    this.neck.position.set(0, 1, 0);
    this.root.add(this.neck);
    const head = new THREE.Mesh(headGeometry(), new THREE.MeshPhongMaterial({ color: colorOf(a.colors.head), shininess: 14, specular: 0x1c1c1c }));
    head.position.y = 0.5 + 0.05;
    this.neck.add(head);
    this.head = head;
    const face = new THREE.Mesh(faceGeometry(), new THREE.MeshPhongMaterial({ map: faceTexture(), transparent: true, depthWrite: false, shininess: 10 }));
    head.add(face);
    // hats
    this.hats = [];
    for (const key of a.hats || []) {
      const hat = buildHat(key);
      if (hat) {
        hat.traverse((o) => { if (o.userData.skin) o.material = new THREE.MeshPhongMaterial({ color: colorOf(a.colors.head), shininess: 14, side: THREE.DoubleSide }); });
        head.add(hat);
        this.hats.push(hat);
      }
    }

    const limb = (x, y, regions, material, name) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const m = new THREE.Mesh(templateBox(1, 2, 1, regions), material);
      m.name = name;
      pivot.add(m);
      this.root.add(pivot);
      return { pivot, mesh: m };
    };
    // Shoulders at (+-1.5, 0.5): arm centre is 0.5 below the pivot.
    const ra = limb(1.5, 0.5, REGIONS.rightLimb, upperMat, 'Right Arm'); ra.mesh.position.y = -0.5;
    const la = limb(-1.5, 0.5, REGIONS.leftLimb, upperMat, 'Left Arm'); la.mesh.position.y = -0.5;
    // Hips at (+-0.5, -1): leg centre 1 below.
    const rl = limb(0.5, -1, REGIONS.rightLimb, lowerMat, 'Right Leg'); rl.mesh.position.y = -1;
    const ll = limb(-0.5, -1, REGIONS.leftLimb, lowerMat, 'Left Leg'); ll.mesh.position.y = -1;
    this.rightShoulder = ra.pivot; this.leftShoulder = la.pivot;
    this.rightHip = rl.pivot; this.leftHip = ll.pivot;
    this.rightArm = ra.mesh; this.leftArm = la.mesh; this.rightLeg = rl.mesh; this.leftLeg = ll.mesh;

    // Tool grip: in the right hand, at the bottom of the right arm.
    this.rightGrip = new THREE.Group();
    this.rightGrip.position.set(0, -1, 0);
    this.rightArm.add(this.rightGrip);
  }

  /** Apply classic Motor angles (radians). Positive right-side angles swing forward. */
  setAngles(rs, ls, rh, lh) {
    this.angles.rs = rs; this.angles.ls = ls; this.angles.rh = rh; this.angles.lh = lh;
    // Character faces -Z; a positive rotation about +X swings a hanging limb toward -Z (forward).
    this.rightShoulder.rotation.x = rs;
    this.leftShoulder.rotation.x = -ls;
    this.rightHip.rotation.x = rh;
    this.leftHip.rotation.x = -lh;
  }

  /** Meshes for death break-apart: [mesh, size[x,y,z]]. */
  limbs() {
    const L = [[this.torso, [2, 2, 1]], [this.head, [1.2, 1.2, 1.2]], [this.rightArm, [1, 2, 1]], [this.leftArm, [1, 2, 1]], [this.rightLeg, [1, 2, 1]], [this.leftLeg, [1, 2, 1]]];
    return L;
  }

  setVisible(v) { this.root.visible = v; }

  dispose() {
    this.root.traverse((o) => {
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) { if (m.map && !m.map.userData.shared) m.map.dispose(); m.dispose(); }
      }
    });
  }
}
