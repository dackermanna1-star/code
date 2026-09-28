// World pickups (weapons, ammo piles, medkits, pills, throwables, melee) and
// the generic "usable" interaction system (doors, buttons, radios, items).
import * as THREE from 'three';
import { cloneModel } from '../combat/weaponModels.js';
import { WEAPONS, THROWABLES, TIER1, TIER2, MELEE } from '../combat/weaponDefs.js';
import { materials } from '../render/materials.js';
import { pick, rand } from '../core/math.js';

const NAMES = {
  ammo: 'Ammo', medkit: 'First Aid Kit', pills: 'Pain Pills', adrenaline: 'Adrenaline', molotov: 'Molotov', pipebomb: 'Pipe Bomb', bile: 'Bile Jar',
};
export function itemName(type) {
  return NAMES[type] || WEAPONS[type]?.name || type;
}

function ammoPileModel() {
  const g = new THREE.Group();
  const m1 = new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.6, metalness: 0.3 });
  const m2 = new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.8 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 });
  const b = (w, h, d, x, y, z, m, ry = 0) => { const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); k.position.set(x, y, z); k.rotation.y = ry; k.castShadow = true; g.add(k); };
  b(0.32, 0.2, 0.16, 0, 0.1, 0, m1, 0.1);
  b(0.32, 0.2, 0.16, 0.05, 0.3, 0.02, m1, -0.15);
  b(0.3, 0.14, 0.2, -0.3, 0.07, 0.12, m2, 0.5);
  b(0.12, 0.08, 0.2, 0.3, 0.04, -0.05, m2, 0.2);
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 6), brass);
    c.position.set(-0.2 + Math.random() * 0.4, 0.01, -0.2 + Math.random() * 0.1);
    c.rotation.z = Math.PI / 2; c.rotation.y = Math.random() * 3;
    g.add(c);
  }
  return g;
}

export class ItemManager {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.highlight = null;
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide });
  }
  clear() {
    for (const it of this.items) it.mesh?.parent?.remove(it.mesh);
    this.items = [];
  }
  spawn(type, x, y, z, opts = {}) {
    const g = this.game;
    let mesh;
    if (type === 'ammo') mesh = ammoPileModel();
    else mesh = cloneModel(type === 'pistol' ? 'pistol' : type);
    if (!mesh) return null;
    mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const def = WEAPONS[type];
    const yaw = opts.yaw ?? Math.random() * 6.28;
    // lay weapons on their side
    if (def && !def.melee) { mesh.rotation.set(0, yaw, Math.PI / 2); mesh.position.set(x, y + 0.035, z); }
    else if (def && def.melee) { mesh.rotation.set(Math.PI / 2, yaw, 0); mesh.position.set(x, y + 0.03, z); }
    else if (type === 'medkit') { mesh.rotation.set(-Math.PI / 2, 0, yaw); mesh.position.set(x, y + 0.045, z); }
    else if (type === 'pills' || type === 'adrenaline') { mesh.rotation.set(0, yaw, 0); mesh.position.set(x, y + 0.05, z); }
    else if (THROWABLES[type]) { mesh.rotation.set(0, yaw, 0); mesh.position.set(x, y + (type === 'pipebomb' ? 0.03 : 0.07), z); if (type === 'pipebomb') mesh.rotation.z = Math.PI / 2; }
    else mesh.position.set(x, y, z);
    g.level.addObject(mesh);
    const it = {
      type, pos: new THREE.Vector3(x, y + 0.1, z), mesh, taken: false, infinite: type === 'ammo' || !!opts.infinite, count: opts.count ?? 1,
      weapon: def ? { clip: opts.clip, reserve: opts.reserve } : null,
    };
    this.items.push(it);
    return it;
  }
  // Resolve level spawn descriptors (called once at chapter start).
  populate(level, director) {
    const groups = new Map();
    for (const sp of level.itemSpawns) {
      if (sp.group) {
        if (!groups.has(sp.group)) groups.set(sp.group, []);
        groups.get(sp.group).push(sp);
        continue;
      }
      this.spawnFromDesc(sp, director);
    }
    // groups: pick one spawn in each group
    for (const [, list] of groups) this.spawnFromDesc(pick(list), director);
  }
  spawnFromDesc(sp, director) {
    let chance = sp.chance ?? 1;
    const hurt = director ? director.teamHurt() : 0;
    let type = sp.type;
    if (type === 'health') { type = Math.random() < 0.35 + hurt * 0.3 ? 'medkit' : 'pills'; chance = Math.min(1, chance + hurt * 0.4); }
    else if (type === 'tier1') type = pick(TIER1);
    else if (type === 'tier2') type = pick(TIER2);
    else if (type === 'throwable') type = pick(['molotov', 'pipebomb', 'pipebomb', 'molotov', 'bile']);
    else if (type === 'melee') type = pick(MELEE);
    else if (type === 'secondary') type = Math.random() < 0.6 ? pick(MELEE) : Math.random() < 0.5 ? 'pistol' : 'magnum';
    if (Math.random() > chance) return;
    const n = sp.count || 1;
    for (let i = 0; i < n; i++) this.spawn(type, sp.x + (n > 1 ? (i - (n - 1) / 2) * 0.35 : 0), sp.y, sp.z + (n > 1 ? Math.sin(i * 1.7) * 0.08 : 0), { yaw: sp.yaw });
  }
  near(pos, r) {
    const out = [];
    for (const it of this.items) if (!it.taken && it.pos.distanceTo(pos) < r) out.push(it);
    return out;
  }
  // Give item to survivor. Returns true if taken.
  take(it, s) {
    if (it.taken) return false;
    const g = this.game;
    const t = it.type;
    let ok = false, dropped = null;
    if (t === 'ammo') {
      const w = s.inv.primary;
      if (w && w.refill()) { ok = true; g.audio.play('ammoPickup', { pos: it.pos, owner: s }); }
      else if (s.isHuman) g.hud?.toast('Ammo already full');
      if (ok) g.onPickup?.(s, it);
      return ok;
    }
    const def = WEAPONS[t];
    if (def) {
      if (def.slot === 0) {
        if (s.inv.primary && s.inv.primary.type === t) {
          ok = s.inv.primary.refill() || true;
        } else {
          dropped = s.inv.primary ? s.inv.primary.type : null;
          s.giveWeapon(t);
          ok = true;
        }
      } else if (def.slot === 1) {
        const cur = s.inv.secondary;
        if (t === 'pistol' && cur.type === 'pistol' && cur.dual) { ok = false; }
        else {
          if (!(t === 'pistol' && cur.type === 'pistol')) dropped = cur.type === 'pistol' ? null : cur.type;
          if (cur.type === 'pistol' && t !== 'pistol' && cur.dual) dropped = 'pistol';
          s.giveWeapon(t);
          ok = true;
        }
      }
      if (ok) g.audio.play('weaponPickup', { pos: it.pos, owner: s });
    } else if (THROWABLES[t]) {
      if (s.inv.throwable !== t) { dropped = s.inv.throwable; s.inv.throwable = t; ok = true; }
    } else if (t === 'medkit') {
      if (!s.inv.medkit) { s.inv.medkit = true; ok = true; }
    } else if (t === 'pills' || t === 'adrenaline') {
      if (!s.inv.pills) { s.inv.pills = t; ok = true; }
    }
    if (!ok) { if (s.isHuman) g.hud?.toast('You already have that'); return false; }
    if (!it.infinite) {
      it.taken = true;
      it.mesh.parent?.remove(it.mesh);
    }
    if (dropped && dropped !== t) {
      // swap: drop the old item where the new one was
      this.spawn(dropped, it.pos.x, it.pos.y - 0.1, it.pos.z);
    }
    if (!def) g.audio.play('pickup', { pos: it.pos, owner: s });
    g.onPickup?.(s, it);
    return true;
  }
  // What the human is looking at / near (items and generic usables).
  findUsable(s) {
    const g = this.game;
    const eye = s.eye(new THREE.Vector3());
    const dir = s.aimDir(new THREE.Vector3());
    let best = null, bs = -1e9;
    const consider = (pos, r, obj) => {
      const dx = pos.x - eye.x, dy = pos.y - eye.y, dz = pos.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > r) return;
      const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / (d || 1);
      if (dot < 0.82 && d > 0.9) return;
      const score = dot * 3 - d;
      if (score > bs) {
        // stop the sight check 0.35 m short: a door's use point sits inside
        // the door's own collider, which would otherwise always block it
        const k = Math.max(0, d - 0.35) / (d || 1);
        if (!g.level.col.lineOfSight(eye.x, eye.y, eye.z, eye.x + dx * k, eye.y + (dy + 0.05) * k, eye.z + dz * k)) return;
        bs = score; best = obj;
      }
    };
    for (const it of this.items) if (!it.taken) consider(it.pos, 2.1, { item: it, pos: it.pos, prompt: (it.type === 'ammo' ? 'Refill ammo' : 'Pick up ' + itemName(it.type)) });
    for (const u of g.usables) if (u.enabled !== false) consider(u.pos, u.radius || 2, { usable: u, pos: u.pos, prompt: u.prompt, hold: u.hold });
    // revive target
    for (const o of g.survivors) {
      if (o === s || o.dead || !o.incapped || o.pinned) continue;
      const d = o.pos.distanceTo(s.pos);
      if (d < 1.8) { best = { revive: o, pos: o.pos, prompt: 'Help ' + o.name + ' up', hold: 5 }; break; }
    }
    return best;
  }
  setHighlight(it) {
    if (this.highlight === it) return;
    if (this.highlight && this.highlight.glow) { this.highlight.glow.parent?.remove(this.highlight.glow); this.highlight.glow = null; }
    this.highlight = it;
    if (!it || !it.mesh) return;
    const glow = new THREE.Group();
    it.mesh.updateMatrixWorld(true);
    it.mesh.traverse((o) => {
      if (!o.isMesh) return;
      const m = new THREE.Mesh(o.geometry, this.glowMat);
      m.matrixAutoUpdate = false;
      m.matrix.copy(o.matrixWorld).multiply(new THREE.Matrix4().makeScale(1.12, 1.12, 1.12));
      glow.add(m);
    });
    it.glow = glow;
    this.game.scene.add(glow);
  }
  update(dt) {
    this.glowMat.opacity = 0.22 + Math.sin(this.game.time * 5) * 0.12;
  }
}
