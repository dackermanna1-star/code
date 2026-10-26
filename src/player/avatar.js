// Stylized player avatar. Only visible in mirrors (render layer 2) and
// selfies. Rebuilt from the current outfit whenever clothes change.
import * as THREE from 'three';
import { G } from '../game.js';
import { LAYER_AVATAR } from '../core/engine.js';
import { mat, MAT, box, rbox, cyl, sph, torus, cone, capsule, at, rot, group } from '../items/kit.js';
import { getDef } from '../items/registry.js';

export const SKIN_TONES = ['#f6d7c3', '#eac0a2', '#d9a27e', '#b97a56', '#8d5a3b', '#5c3a24'];
export const HAIR_STYLES = ['short', 'long', 'bun', 'curly', 'buzz', 'bob'];
export const HAIR_COLORS = ['#2b1d14', '#5a3825', '#a0652e', '#d9b26f', '#1b1b1b', '#b23a48', '#7b5cff', '#e6e6e6'];

function limb(len, r1, r2, m) {
  const g = cyl(r2, r1, len, m, 14);
  g.geometry = g.geometry.clone(); g.geometry.translate(0, -len / 2, 0);
  return g;
}

export class Avatar {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'avatar';
    scene.add(this.root);
    this.body = null;
    this.t = 0;
    this.pose = 'idle';
    G.events.on('outfitChanged', () => this.rebuild());
  }

  look() { return (G.state.flags.avatar ||= { skin: 1, hair: 0, hairColor: 1 }); }

  rebuild() {
    if (this.body) { this.root.remove(this.body); }
    const look = this.look();
    const w = (slot) => { const uid = G.state.outfit[slot]; const inst = uid && G.items.get(uid); return inst?.def?.use || null; };
    const p = buildPerson({ skin: look.skin, hair: look.hair, hairColor: look.hairColor, top: w('top'), bottom: w('bottom'), shoes: w('shoes'), hat: w('hat'), glasses: w('glasses'), acc: w('accessory'), layer: LAYER_AVATAR });
    this.body = p.body; this.head = p.head; this.arms = p.arms; this.eyes = p.eyes;
    this.root.add(p.body);
  }

  update(dt) {
    if (!this.body) return;
    this.t += dt;
    const p = G.player;
    this.root.position.set(p.pos.x, p.occ ? Math.max(0, p.camPos.y - (p.occ.eye || 1.6)) * (p.occ.seat && !p.occ.lying ? 1 : 0) : p.y, p.pos.z);
    if (p.occ) { this.root.position.x = p.camPos.x; this.root.position.z = p.camPos.z; }
    this.root.rotation.y = p.yaw + Math.PI;
    this.head.rotation.x = -p.pitch * 0.6;
    this.body.position.y = Math.sin(this.t * 1.6) * 0.004;
    // blink
    const blink = (this.t % 4) < 0.12;
    for (const e of this.eyes) e.scale.y = blink ? 0.15 : 1;
    // walking swing
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const sw = Math.sin(p.bob) * Math.min(1, speed / 2.5) * 0.6;
    for (const a of this.arms) {
      if (this.pose === 'wave' && a.s === 1) { a.shoulder.rotation.z = 2.6 + Math.sin(this.t * 10) * 0.25; a.elbow.rotation.x = -0.2; continue; }
      if (this.pose === 'peace' && a.s === 1) { a.shoulder.rotation.set(-1.2, 0, 0.5); a.elbow.rotation.x = -1.6; continue; }
      a.shoulder.rotation.x = sw * a.s;
      a.shoulder.rotation.z = a.s * 0.12; a.shoulder.rotation.y = 0;
      a.elbow.rotation.x = -0.15 - Math.max(0, sw * a.s) * 0.3;
    }
    // sitting: fold legs
    const hips = this.body.children.filter((c) => c.isGroup && Math.abs(c.position.y - 0.94) < 0.01);
    const sitting = p.occ?.seat && !p.occ.lying;
    for (const h of hips) { h.rotation.x = sitting ? -1.45 : Math.sin(p.bob + (h.position.x > 0 ? 0 : Math.PI)) * Math.min(1, speed / 2.5) * 0.5; const knee = h.children.find((c) => c.isGroup); if (knee) knee.rotation.x = sitting ? 1.45 : 0; }
  }
}

export function buildPerson({ skin: skinIdx = 1, hair = 0, hairColor = 1, top: topU = null, bottom: botU = null, shoes = null, hat = null, glasses = null, acc = null, layer = LAYER_AVATAR } = {}) {
  const look = { skin: skinIdx, hair, hairColor };
  const self = {};
  const skin = mat(SKIN_TONES[look.skin % SKIN_TONES.length], { rough: 0.65 });
  const hairM = mat(HAIR_COLORS[look.hairColor % HAIR_COLORS.length], { rough: 0.75, sheen: 0.4 });
  const top = topU || { style: 'tee', color: '#f2f2f2' };
  const bottom = botU || { style: 'sweats', color: '#6c757d' };
  const topM = top.fabric === 'knit' ? MAT.knit(top.color) : MAT.fabric(top.color);
  const botM = bottom.style === 'jeans' ? mat(bottom.color, { rough: 0.85 }) : MAT.fabric(bottom.color);
  const b = new THREE.Group();
  const bulky = ['hoodie', 'sweater', 'jacket', 'coat', 'puffer'].includes(top.style);
  // torso
  const torso = cyl(bulky ? 0.19 : 0.17, bulky ? 0.17 : 0.15, 0.56, topM, 20); at(torso, 0, 1.2, 0); b.add(torso);
  b.add(at(sph(bulky ? 0.19 : 0.17, topM, 20, 10), 0, 1.45, 0)).children.at(-1).scale.set(1, 0.45, 0.85);
  torso.scale.z = 0.72;
  if (top.style === 'dress') { b.add(at(cone(0.32, 0.6, topM, 24), 0, 0.7, 0)); b.children.at(-1).rotation.x = 0; }
  if (top.style === 'jacket' || top.style === 'coat' || top.style === 'shirt') {
    const inner = mat(top.color2 || '#f4f4f4', { rough: 0.8 });
    b.add(at(box(0.09, 0.46, 0.02, inner), 0, 1.22, 0.115));
  }
  if (top.style === 'hoodie') b.add(at(rot(torus(0.11, 0.045, topM, 8, 16, Math.PI * 1.2), 0.3, 0, Math.PI * -0.1), 0, 1.5, -0.08));
  if (top.color2 && top.style !== 'jacket') b.add(at(cyl(0.17, 0.17, 0.05, mat(top.color2, { rough: 0.8 }), 20), 0, 0.96, 0)).children.at(-1).scale.z = 0.72;
  // neck & head
  b.add(at(cyl(0.05, 0.055, 0.1, skin, 12), 0, 1.53, 0));
  const head = new THREE.Group(); head.position.set(0, 1.66, 0); b.add(head);
  const skull = sph(0.11, skin, 24, 18); skull.scale.set(0.95, 1.08, 1); head.add(skull);
  const eyeM = mat('#1b1b1b', { rough: 0.3 });
  self.eyes = [];
  for (const s of [-1, 1]) { const e = sph(0.014, eyeM, 10, 8); at(e, s * 0.038, 0.015, 0.098); head.add(e); self.eyes.push(e); }
  const smile = torus(0.025, 0.004, mat('#7a3b2e'), 6, 12, Math.PI); smile.rotation.z = Math.PI; at(smile, 0, -0.04, 0.1); head.add(smile);
  for (const s of [-1, 1]) head.add(at(sph(0.02, mat('#f4978e', { rough: 0.8, opacity: 0.35, transparent: true }), 8, 6), s * 0.06, -0.02, 0.085));
  head.add(at(sph(0.016, skin, 8, 6), 0, -0.005, 0.11));
  // hair
  const style = HAIR_STYLES[look.hair % HAIR_STYLES.length];
  if (!hat || style === 'long' || style === 'bob') {
    if (style !== 'buzz') { const cap = sph(0.118, hairM, 20, 12, undefined); cap.scale.set(1, 1, 1.02); cap.geometry = new THREE.SphereGeometry(0.118, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.55); at(cap, 0, 0.012, -0.008); head.add(cap); }
    else head.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.113, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM), 0, 0.005, 0));
  }
  if (style === 'long') head.add(at(rbox(0.22, 0.32, 0.08, 0.04, hairM), 0, -0.12, -0.07));
  if (style === 'bob') head.add(at(rbox(0.25, 0.14, 0.2, 0.06, hairM), 0, -0.03, -0.02));
  if (style === 'bun' && !hat) head.add(at(sph(0.05, hairM, 14, 10), 0, 0.1, -0.08));
  if (style === 'curly' && !hat) for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; head.add(at(sph(0.04, hairM, 8, 6), Math.cos(a) * 0.09, 0.06 + Math.sin(i * 1.7) * 0.03, Math.sin(a) * 0.08 - 0.01)); }
  // hat
  if (hat) {
    const hm = hat.fabric === 'knit' ? MAT.knit(hat.color) : mat(hat.color, { rough: 0.7 });
    if (hat.style === 'beanie') { head.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.125, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hm), 0, 0.02, 0)); head.add(at(cyl(0.127, 0.127, 0.045, hm, 20), 0, 0.03, 0)); if (hat.color2) head.add(at(sph(0.03, MAT.knit(hat.color2), 10, 8), 0, 0.15, 0)); }
    else if (hat.style === 'bucket') { head.add(at(cyl(0.1, 0.125, 0.09, hm, 20), 0, 0.09, 0)); head.add(at(cyl(0.18, 0.18, 0.008, hm, 24), 0, 0.045, 0)); }
    else if (hat.style === 'beret') { const be = cyl(0.14, 0.14, 0.03, hm, 24); be.rotation.z = 0.2; at(be, 0.02, 0.1, 0); head.add(be); }
    else if (hat.style === 'crown') { head.add(at(cyl(0.1, 0.1, 0.07, MAT.gold(), 8, undefined, true), 0, 0.13, 0)); }
    else { head.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.122, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hm), 0, 0.025, 0)); const brim = cyl(0.1, 0.1, 0.008, mat(hat.color2 || hat.color, { rough: 0.7 }), 20); brim.scale.set(0.75, 1, 1); at(brim, 0, 0.03, 0.11); head.add(brim); }
  }
  if (glasses) {
    const gm = mat(glasses.color || '#111', { rough: 0.3, metal: glasses.style === 'wire' ? 1 : 0 });
    const lens = mat(glasses.lens || '#88aacc', { rough: 0.05, opacity: glasses.style === 'sun' ? 0.85 : 0.2, transparent: true });
    for (const s of [-1, 1]) { const rim = torus(0.028, 0.004, gm, 6, 18); at(rim, s * 0.042, 0.015, 0.113); head.add(rim); const l = cyl(0.027, 0.027, 0.002, lens, 16); l.rotation.x = Math.PI / 2; at(l, s * 0.042, 0.015, 0.113); head.add(l); }
    head.add(at(box(0.03, 0.004, 0.004, gm), 0, 0.018, 0.115));
  }
  if (acc) {
    const am = mat(acc.color || '#222', { rough: 0.4, metal: acc.metal ? 1 : 0 });
    if (acc.style === 'headphones') { head.add(at(rot(torus(0.125, 0.012, am, 8, 20, Math.PI), 0, 0, 0), 0, 0.02, 0)); for (const s of [-1, 1]) head.add(at(rot(cyl(0.04, 0.04, 0.03, am, 16), 0, 0, Math.PI / 2), s * 0.12, -0.01, 0)); }
    else if (acc.style === 'chain' || acc.style === 'necklace') b.add(at(rot(torus(0.09, 0.006, am, 6, 24), Math.PI / 2 - 0.3, 0, 0), 0, 1.47, 0.03));
    else if (acc.style === 'scarf') b.add(at(rot(torus(0.085, 0.035, MAT.knit(acc.color), 8, 20), Math.PI / 2, 0, 0), 0, 1.52, 0));
    else if (acc.style === 'backpack') b.add(at(rbox(0.3, 0.4, 0.14, 0.05, am), 0, 1.22, -0.2));
  }
  // arms
  const sleeveLong = ['hoodie', 'sweater', 'jacket', 'coat', 'shirt', 'longsleeve', 'puffer'].includes(top.style);
  const sleeveless = top.style === 'tank';
  self.arms = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(s * (bulky ? 0.23 : 0.21), 1.44, 0);
    const upper = limb(0.3, 0.052, 0.058, sleeveless ? skin : topM); shoulder.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.3; shoulder.add(elbow);
    elbow.add(limb(0.26, 0.04, 0.05, sleeveLong ? topM : skin));
    const hand = sph(0.042, skin, 12, 10); hand.scale.set(0.8, 1.1, 0.6); at(hand, 0, -0.29, 0); elbow.add(hand);
    if (acc?.style === 'watch' && s === -1) elbow.add(at(cyl(0.045, 0.045, 0.025, mat(acc.color || '#c9a86a', { metal: 1, rough: 0.3 }), 14), 0, -0.24, 0));
    shoulder.rotation.z = s * 0.12;
    elbow.rotation.x = -0.15;
    b.add(shoulder);
    self.arms.push({ shoulder, elbow, s });
  }
  // legs
  const shorts = ['shorts', 'skirt'].includes(bottom.style);
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.085, 0.94, 0);
    hip.add(limb(0.43, 0.065, 0.075, botM));
    const knee = new THREE.Group(); knee.position.y = -0.43; hip.add(knee);
    knee.add(limb(0.42, 0.048, 0.06, shorts ? skin : botM));
    // shoes
    const sm = mat(shoes?.color || SKIN_TONES[look.skin % SKIN_TONES.length], { rough: 0.6 });
    const sole = mat(shoes?.color2 || shoes?.color || '#eeeeee', { rough: 0.7 });
    if (shoes) { const shoe = rbox(0.11, shoes.style === 'boots' ? 0.14 : 0.08, 0.26, 0.04, sm); at(shoe, 0, -0.42 + (shoes.style === 'boots' ? 0.03 : 0), 0.05); knee.add(shoe); knee.add(at(rbox(0.115, 0.025, 0.27, 0.01, sole), 0, -0.46, 0.05)); }
    else knee.add(at(rbox(0.09, 0.05, 0.22, 0.025, sm), 0, -0.44, 0.04));
    b.add(hip);
  }
  if (bottom.style === 'skirt') b.add(at(cone(0.24, 0.32, botM, 20), 0, 0.82, 0));
  else b.add(at(cyl(0.16, 0.16, 0.14, botM, 20), 0, 0.92, 0)).children.at(-1).scale.z = 0.75;
  b.traverse((o) => { o.layers.set(layer); if (o.isMesh) { o.castShadow = layer === 0; o.receiveShadow = true; } });
  void capsule; void getDef;
  return { body: b, head, arms: self.arms, eyes: self.eyes };
}

