// Mesh rigs driven by Body joints (survivors & special infected). Each body
// part is an Object3D whose matrix is derived from joint pairs every frame.
// Optional "x-ray" silhouettes render teammates through walls (L4D-style glow).
import * as THREE from 'three';
import { PARTS, PART, J, partMatrix } from './body.js';
import { footMatrix } from './crowd.js';
import { buildPartGeometries } from './partgeo.js';
import { getTexture } from '../render/textures.js';

const lin = (hex) => new THREE.Color(hex);

// Paint a face texture for the head sphere (face centred at u = 0.75).
export function paintFace(o) {
  const W = 256, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const skin = new THREE.Color(o.skin);
  const css = (col, k = 1) => `rgb(${Math.min(255, col.r * 255 * k) | 0},${Math.min(255, col.g * 255 * k) | 0},${Math.min(255, col.b * 255 * k) | 0})`;
  // three Color stores linear; convert to sRGB for canvas
  const sk = skin.clone().convertLinearToSRGB();
  g.fillStyle = css(sk);
  g.fillRect(0, 0, W, H);
  // subtle shading noise
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * W, Math.random() * H, 3, 3);
  }
  const fx = W * 0.75; // face centre x
  const eyeY = H * 0.45, mouthY = H * 0.66;
  // hair (top/back)
  if (o.hair != null) {
    const hc = new THREE.Color(o.hair).convertLinearToSRGB();
    g.fillStyle = css(hc);
    g.fillRect(0, 0, W, H * (o.longHair ? 0.36 : 0.3));
    // back of head coverage (away from face)
    g.fillRect(fx + W * 0.2, 0, W * 0.3, H * 0.62);
    g.fillRect(0, 0, fx - W * 0.2, H * 0.62);
    // hairline curve over forehead
    g.beginPath(); g.ellipse(fx, H * 0.26, W * 0.12, H * 0.1, 0, 0, Math.PI); g.fill();
  }
  // eyebrows
  const brow = new THREE.Color(o.brow ?? o.hair ?? 0x2a2018).convertLinearToSRGB();
  g.fillStyle = css(brow);
  g.fillRect(fx - 20, eyeY - 10, 13, 3);
  g.fillRect(fx + 7, eyeY - 10, 13, 3);
  // eyes
  for (const ex of [fx - 13, fx + 13]) {
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(ex, eyeY, 8, 5, 0, 0, 7); g.fill();
    g.fillStyle = '#e8e4dc'; g.beginPath(); g.ellipse(ex, eyeY, 5.5, 3, 0, 0, 7); g.fill();
    g.fillStyle = o.eyeColor || '#3a2a1a'; g.beginPath(); g.arc(ex, eyeY, 2.4, 0, 7); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.arc(ex, eyeY, 1.1, 0, 7); g.fill();
  }
  // nose shadow
  g.fillStyle = css(sk, 0.8); g.fillRect(fx - 3, eyeY + 4, 6, 12);
  // mouth
  g.fillStyle = css(sk, 0.55); g.fillRect(fx - 9, mouthY, 18, 3);
  if (o.lipColor) { g.fillStyle = o.lipColor; g.fillRect(fx - 8, mouthY, 16, 3); }
  // beard / stubble
  if (o.beard != null) {
    const bc = new THREE.Color(o.beard).convertLinearToSRGB();
    g.fillStyle = css(bc);
    if (o.beardStyle === 'goatee') {
      g.fillRect(fx - 10, mouthY - 5, 20, 3);
      g.fillRect(fx - 7, mouthY + 3, 14, 14);
    } else {
      g.beginPath();
      g.moveTo(fx - 26, eyeY + 12); g.lineTo(fx - 22, mouthY + 18); g.lineTo(fx, H * 0.92); g.lineTo(fx + 22, mouthY + 18); g.lineTo(fx + 26, eyeY + 12);
      g.lineTo(fx + 16, mouthY - 6); g.lineTo(fx - 16, mouthY - 6); g.closePath(); g.fill();
      g.fillStyle = css(sk, 0.5); g.fillRect(fx - 7, mouthY, 14, 3);
    }
  }
  if (o.scar) { g.strokeStyle = 'rgba(120,40,40,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(fx + 16, eyeY - 12); g.lineTo(fx + 22, eyeY + 10); g.stroke(); }
  if (o.dirt) { for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(40,20,10,${Math.random() * 0.2})`; g.beginPath(); g.arc(fx + (Math.random() - 0.5) * 60, eyeY + Math.random() * 40, Math.random() * 5, 0, 7); g.fill(); } }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stdMat(color, rough = 0.8, extra = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: 0 }, extra));
}
function clothMat(color, kind = 'fabric', rough = 0.9) {
  const t = getTexture(kind, { size: 256 });
  return new THREE.MeshStandardMaterial({ color, map: t.map, normalMap: t.normalMap, roughness: rough, metalness: 0 });
}

// Build a set of part groups for a humanoid from a look description.
export function buildHumanoid(look) {
  const geos = buildPartGeometries({ fat: look.fat ?? 1, bulk: look.bulk ?? 1, armBulk: look.armBulk, legBulk: look.legBulk, chest: look.chest, segs: 12 });
  if (look.headScale) geos.head.scale(look.headScale, look.headScale, look.headScale);
  const skin = look.skinMat || stdMat(look.skin, 0.62);
  const shirt = look.shirtMat || clothMat(look.shirt ?? 0x777777);
  const pants = look.pantsMat || clothMat(look.pants ?? 0x333344, 'fabric');
  const shoes = stdMat(look.shoes ?? 0x1a1612, 0.55);
  const parts = {};
  const G = (name) => { const g = new THREE.Group(); g.name = name; g.matrixAutoUpdate = false; parts[name] = g; return g; };
  const add = (grp, geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; grp.add(m); return m; };
  // torso
  const torso = G('torso');
  add(torso, geos.torso, shirt);
  if (look.vest) {
    const vg = geos.torso.clone();
    vg.scale(1.06, 0.92, 1.1);
    vg.translate(0, 0.08, 0);
    add(torso, vg, look.vestMat || stdMat(look.vest, 0.45));
  }
  if (look.jacket) {
    const jg = geos.torso.clone();
    jg.scale(1.08, 0.97, 1.12);
    add(torso, jg, look.jacketMat || clothMat(look.jacket));
    // chest pockets
    for (const sx of [-0.07, 0.07]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.02), look.jacketMat || clothMat(look.jacket));
      p.position.set(sx, 0.78, -0.12);
      torso.add(p);
    }
  }
  if (look.under) {
    // visible undershirt at the neckline (open jacket)
    const u = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.02), stdMat(look.under, 0.9));
    u.position.set(0, 0.72, -0.125);
    torso.add(u);
  }
  if (look.tie) {
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.85, 0.012), stdMat(look.tie, 0.5));
    tie.position.set(0, 0.55, -0.128);
    tie.rotation.x = 0.08;
    torso.add(tie);
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.02), stdMat(look.tie, 0.5));
    knot.position.set(0, 0.97, -0.12);
    torso.add(knot);
  }
  if (look.belt !== false) {
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.1, 14), stdMat(0x1a1410, 0.5));
    belt.scale.set(1.2, 1, 0.78);
    belt.position.y = 0.02;
    torso.add(belt);
  }
  // head
  const head = G('head');
  const faceMat = new THREE.MeshStandardMaterial({ map: paintFace(look.face || { skin: look.skin, hair: look.hair }), roughness: 0.6 });
  add(head, geos.head, faceMat);
  if (look.hat === 'beret') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), stdMat(look.hatColor ?? 0x2e3a22, 0.85));
    b.scale.set(1.05, 0.38, 1.1);
    b.position.set(0.02, 0.15, 0.01);
    b.rotation.z = -0.25;
    head.add(b);
  }
  if (look.ponytail) {
    const hairMat = stdMat(look.hair, 0.7);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.104, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    cap.scale.set(0.9, 1.15, 1.06);
    cap.position.y = 0.055;
    head.add(cap);
    const pt = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.18, 4, 8), hairMat);
    pt.position.set(0, 0.03, 0.13);
    pt.rotation.x = 0.35;
    head.add(pt);
    pt.name = 'ponytail';
  } else if (look.hair != null && !look.bald) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.106, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), stdMat(look.hair, 0.8));
    cap.scale.set(0.9, 1.12, 1.05);
    cap.position.y = 0.058;
    head.add(cap);
  }
  if (look.beard3d != null) {
    const bd = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), stdMat(look.beard3d, 0.95));
    bd.scale.set(1.0, 0.9, 0.9);
    bd.position.set(0, 0.0, -0.045);
    head.add(bd);
  }
  // limbs
  const sleeveMat = look.sleeves === 'none' ? skin : (look.jacket ? (look.jacketMat || clothMat(look.jacket)) : shirt);
  const uarmMat = look.sleeves === 'none' ? skin : sleeveMat;
  const farmMat = look.sleeves === 'long' ? sleeveMat : skin;
  for (const side of ['L', 'R']) {
    const ua = G('uarm' + side);
    add(ua, geos.uarm, uarmMat);
    if (look.tattoo && look.sleeves === 'none') {
      const t = new THREE.Mesh(geos.uarm, new THREE.MeshStandardMaterial({ color: 0x1a2838, roughness: 0.7, transparent: true, opacity: 0.5 }));
      t.scale.set(1.02, 0.7, 1.02);
      t.position.y = 0.15;
      ua.add(t);
    }
    const fa = G('farm' + side);
    add(fa, geos.farm, farmMat);
    if (look.sleeves === 'long') {
      // skin hands at the end: separate small mesh
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skin);
      hand.scale.set(0.8, 4.2, 0.5);
      hand.position.y = 1.08;
      fa.add(hand);
    }
    if (look.stripe) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.95, 0.012), stdMat(look.stripe, 0.8));
      st.position.set(side === 'L' ? -0.05 : 0.05, 0.45, 0);
      ua.add(st);
      const st2 = st.clone(); st2.scale.y = 0.8; fa.add(st2);
    }
    const th = G('thigh' + side);
    add(th, geos.thigh, pants);
    const sh = G('shin' + side);
    add(sh, geos.shin, pants);
    const ft = G('foot' + side);
    const fg = new THREE.BoxGeometry(0.105, 0.09, 0.27);
    fg.translate(0, -0.035, -0.065);
    add(ft, fg, shoes);
  }
  return parts;
}

const PART_NAMES = ['torso', 'head', 'uarmL', 'farmL', 'uarmR', 'farmR', 'thighL', 'shinL', 'thighR', 'shinR'];

export class RigModel {
  constructor(scene, parts, opts = {}) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = opts.name || 'rig';
    this.parts = parts;
    this.partArr = PART_NAMES.map((n) => parts[n]);
    for (const n in parts) this.root.add(parts[n]);
    scene.add(this.root);
    this.m4 = new THREE.Matrix4();
    this.arr = new Float32Array(16);
    this.xray = null;
    this.hidden = false;
    if (opts.xray) this.makeXray(opts.xray);
  }
  makeXray(color) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, depthFunc: THREE.GreaterDepth, fog: false });
    this.xrayMat = mat;
    this.xray = [];
    for (const n in this.parts) {
      const g = this.parts[n];
      g.traverse((o) => {
        if (o.isMesh && o.parent === g) {
          const m = new THREE.Mesh(o.geometry, mat);
          m.position.copy(o.position); m.rotation.copy(o.rotation); m.scale.copy(o.scale);
          m.renderOrder = 50;
          m.castShadow = false;
          m.userData.xray = true;
          g.add(m);
          this.xray.push(m);
        }
      });
    }
  }
  setXray(on, color) {
    if (!this.xray) return;
    for (const m of this.xray) m.visible = on;
    if (color != null) this.xrayMat.color.set(color);
  }
  setVisible(v) {
    this.root.visible = v;
  }
  update(body) {
    const a = this.arr;
    for (let i = 0; i < this.partArr.length; i++) {
      const g = this.partArr[i];
      if (!g) continue;
      if (body.severed & (1 << i)) { g.visible = false; continue; }
      g.visible = true;
      partMatrix(body, i, a);
      g.matrix.fromArray(a);
      g.matrixWorldNeedsUpdate = true;
    }
    const fl = this.parts.footL, fr = this.parts.footR;
    if (fl) { footMatrix(body, 0, a); fl.matrix.fromArray(a); fl.visible = !(body.severed & (1 << PART.shinL)); }
    if (fr) { footMatrix(body, 1, a); fr.matrix.fromArray(a); fr.visible = !(body.severed & (1 << PART.shinR)); }
  }
  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => { if (o.geometry && !o.userData.xray) o.geometry.dispose?.(); });
  }
}
