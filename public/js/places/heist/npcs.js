// The people in the heist: bank customers and staff (who become hostages),
// security guards, police officers and SWAT, and your crew's gunman. Their
// looks, gear and AI brains. Brains walk the bank's navigation graph, which
// has edges that only open with their doors.
import * as THREE from 'three';
import { BotBrain, pick } from '../../engine/Bots.js';
import { GROUP } from '../../engine/Part.js';
import { Gun, GunnerBrain, rr } from '../warzone/combat.js';
import { buildMask } from './models.js';
import { S } from './state.js';
import { FL } from './map.js';
import { scream } from './audio.js';

// --- looks ------------------------------------------------------------------------------------------------
const SKINS = [24, 24, 18, 36, 38, 25, 125, 5, 226];
const SHIRT_STYLES = ['tee', 'long', 'jacket', 'hoodie', 'plaid', 'stripes', 'vest'];
const COLORS = ['#c03030', '#3060a8', '#2a8a4a', '#e0c040', '#7a3a8a', '#e87a20', '#2a2a2a', '#f0f0f0', '#8a6a4a', '#4aa0c8', '#a0a0a0', '#d86aa0'];
const PANTS = ['#2a3a5a', '#3a3a3a', '#5a4a3a', '#1a1a1a', '#6a6a5a', '#2a2a4a'];
const look = (skin, shirt, pants, face = 'Smile') => ({ colors: { head: skin, torso: skin, leftArm: skin, rightArm: skin, leftLeg: skin, rightLeg: skin }, face, hats: [], tshirt: null, shirt, pants });
export function customerLook() {
  const c = pick(COLORS);
  return look(pick(SKINS), { style: pick(SHIRT_STYLES), color: c, color2: pick(COLORS) }, { style: pick(['jeans', 'plain', 'plain']), color: pick(PANTS), shoes: '#1a1a1a' });
}
export const staffLook = (color = '#2a3a5a') => look(pick(SKINS), { style: 'suit', color, color3: pick(['#a01818', '#1a4a9a', '#2a6a2a']) }, { style: 'plain', color: '#1c1c22', shoes: '#111' });
export const guardLook = () => look(pick(SKINS), { style: 'police', color: '#5a5e66' }, { style: 'plain', color: '#22242a', shoes: '#111' });
export const copLook = () => look(pick(SKINS), { style: 'police', color: '#2a4a8a' }, { style: 'plain', color: '#1a2440', shoes: '#111' });
export const swatLook = () => look(pick(SKINS), { style: 'long', color: '#1c222c' }, { style: 'plain', color: '#1c222c', shoes: '#111' });
export const crewLook = (skin, color = '#1b1b1b') => look(skin, { style: 'suit', color, color3: '#1b1b1b' }, { style: 'plain', color: '#151515', shoes: '#0a0a0a' });

// --- gear --------------------------------------------------------------------------------------------------
const GEAR = new Map();
function gear(kind) {
  if (GEAR.has(kind)) return GEAR.get(kind).clone();
  const g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  if (kind === 'cap' || kind === 'guardcap') {
    const col = kind === 'cap' ? 0x1a2848 : 0x3a3e46;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.66, 0.42, 20), M(col)); top.position.y = 0.55; g.add(top);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.72, 0.12, 20), M(col)); crown.position.y = 0.78; g.add(crown);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.5), M(0x111111, { roughness: 0.3 })); brim.position.set(0, 0.36, -0.7); g.add(brim);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.04), M(0xd8b040, { metalness: 0.8, roughness: 0.3 })); badge.position.set(0, 0.6, -0.72); g.add(badge);
  } else if (kind === 'helmet') {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.76, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), M(0x15181c, { roughness: 0.5 })); h.position.y = 0.16; h.scale.set(1, 0.95, 1.05); g.add(h);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.08), M(0x0a0e14, { roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.85 })); visor.position.set(0, 0.06, -0.72); g.add(visor);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 6, 20, Math.PI), M(0x111111)); strap.rotation.y = Math.PI / 2; strap.rotation.z = Math.PI; strap.position.y = 0; g.add(strap);
  } else if (kind === 'vest' || kind === 'heavyvest') {
    const heavy = kind === 'heavyvest';
    const v = new THREE.Mesh(new THREE.BoxGeometry(2.12, 1.7, 1.18), M(heavy ? 0x23262a : 0x1a2028, { roughness: 0.8 })); v.position.y = 0.1; g.add(v);
    for (const x of [-0.55, 0, 0.55]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.16), M(0x2a3038)); p.position.set(x, -0.25, -0.65); g.add(p); }
    const tex = document.createElement('canvas'); tex.width = 128; tex.height = 40; const x = tex.getContext('2d'); x.fillStyle = '#e8e8e8'; x.font = 'bold 30px Arial'; x.textAlign = 'center'; x.fillText(heavy ? 'POLICE' : 'SWAT', 64, 31);
    const t = new THREE.CanvasTexture(tex); t.colorSpace = THREE.SRGBColorSpace;
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.44), new THREE.MeshStandardMaterial({ map: t, transparent: true })); lbl.position.set(0, 0.45, 0.6); g.add(lbl);
    if (heavy) for (const sx of [-1, 1]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 1.25), M(0x23262a)); s.position.set(sx * 1.25, 0.8, 0); g.add(s); }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.shared = true; } });
  GEAR.set(kind, g);
  return g.clone();
}
export function dress(ch, kind) {
  const m = ch.model;
  if (kind === 'police') m.head.add(gear('cap'));
  if (kind === 'guard') m.head.add(gear('guardcap'));
  if (kind === 'swat' || kind === 'heavy') { m.head.add(gear('helmet')); m.torso.add(gear(kind === 'heavy' ? 'heavyvest' : 'vest')); }
}
export function putOnMask(ch, id) {
  if (ch.mask) ch.model.head.remove(ch.mask);
  ch.mask = buildMask(id);
  ch.model.head.add(ch.mask);
  if (ch.model.face) ch.model.face.visible = false;
}

// --- poses ---------------------------------------------------------------------------------------------------
/** On the floor, hands on head. */
export function poseDown(ch, des, M) {
  M.rs = M.ls = 0.25; M.rh = M.lh = 0.3;
  des.rs = 2.75; des.ls = -2.75; des.rh = 1.57; des.lh = -1.57;
}
/** Hands up (standing, scared). */
export function poseHandsUp(ch, des, M) { M.rs = M.ls = 0.3; des.rs = 2.9; des.ls = -2.9; }

// --- navigation -----------------------------------------------------------------------------------------------
const _from = new THREE.Vector3(), _to = new THREE.Vector3();
function clear(world, ax, az, bx, bz, y) {
  _from.set(ax, y, az); _to.set(bx, y, bz);
  const d = _from.distanceTo(_to);
  if (d < 0.5) return true;
  const hit = world.raycast(_from, _to, { mask: GROUP.WORLD });
  return !hit || hit.distance > d - 1.2;
}
export function nearestNode(world, p) {
  const nodes = S.bank.nodes;
  const order = nodes.map((n, i) => [Math.hypot(n.x - p.x, n.z - p.z), i]).sort((a, b) => a[0] - b[0]);
  for (let k = 0; k < Math.min(5, order.length); k++) {
    const n = nodes[order[k][1]];
    if (clear(world, p.x, p.z, n.x, n.z, p.y)) return order[k][1];
  }
  return order[0][1];
}
export function findPath(start, goal) {
  const nodes = S.bank.nodes;
  const prev = new Map([[start, -1]]), q = [start];
  while (q.length) {
    const c = q.shift(); if (c === goal) break;
    for (const e of nodes[c].n) if (!prev.has(e.to) && (!e.door || S.doors[e.door])) { prev.set(e.to, c); q.push(e.to); }
  }
  if (!prev.has(goal)) return null;
  const path = []; let c = goal;
  while (c !== -1 && c !== undefined) { path.unshift(c); c = prev.get(c); }
  return path;
}

/** Walks a path of graph nodes; subclasses call followPath() from think(). */
const Walker = (Base) => class extends Base {
  goTo(pos) {
    const world = this.game.world;
    const a = nearestNode(world, this.ch.rootPosition), b = typeof pos === 'number' ? pos : nearestNode(world, pos);
    this.path = findPath(a, b) || [];
    this.dest = typeof pos === 'number' ? null : pos.clone();
    this.pathGoal = b;
  }
  /** Steer along the path; returns true when the path is done. */
  followPath(jitter = 1.5) {
    const ch = this.ch;
    while (this.path?.length) {
      const n = S.bank.nodes[this.path[0]];
      if (Math.hypot(n.x - ch.rootPosition.x, n.z - ch.rootPosition.z) < 3.2) { this.path.shift(); continue; }
      // skip ahead when the next node is already in plain view
      if (this.path.length > 1) {
        const n2 = S.bank.nodes[this.path[1]];
        if (Math.hypot(n2.x - ch.rootPosition.x, n2.z - ch.rootPosition.z) < 30 && clear(this.game.world, ch.rootPosition.x, ch.rootPosition.z, n2.x, n2.z, ch.rootPosition.y - 1) && clear(this.game.world, ch.rootPosition.x + 1, ch.rootPosition.z + 1, n2.x, n2.z, ch.rootPosition.y - 2.2)) { this.path.shift(); continue; }
      }
      this.target = new THREE.Vector3(n.x + rr(-jitter, jitter) * 0.3, ch.rootPosition.y, n.z + rr(-jitter, jitter) * 0.3);
      return false;
    }
    if (this.dest) { this.target = this.dest.clone(); if (Math.hypot(this.dest.x - ch.rootPosition.x, this.dest.z - ch.rootPosition.z) > 2) return false; }
    this.target = null;
    return true;
  }
};

// --- civilians and staff -----------------------------------------------------------------------------------
export class CivBrain extends Walker(BotBrain) {
  constructor(game, player, role, home) {
    super(game, player, { chattiness: 0 });
    this.role = role; this.home = home; this.state = 'idle';
    this.fear = 1; this.decay = rr(0.75, 1.3);
    this.glanceT = rr(4, 12); this.glancing = 0; this.arriveRadius = 1.6;
    this.dontAvoidEdges = true; this.jumpGaps = false;
    this.speedScale = 0.55;
    this.errand = null;
  }
  get watcher() { return this.role !== 'customer' && this.state === 'idle'; }
  idleChat() {}
  think() {
    this._think();
    // people standing still (or sitting on the floor) aren't simulated
    const ch = this.ch;
    if (ch?.alive) ch.freeze(!this.target && ch.grounded !== false && this.state !== 'flee');
  }
  _think() {
    const ch = this.ch;
    if (this.state === 'idle') {
      // the manager pops out for coffee every so often (a window to grab his keycard)
      if (this.role === 'manager' && !this.errand && this.game.world.time > (this.nextErrand ??= this.game.world.time + rr(25, 35))) {
        this.errand = { until: this.game.world.time + rr(16, 22) };
        this.goTo(new THREE.Vector3(36, FL, -36));
        S.onManagerErrand?.(true);
      }
      if (this.errand) {
        if (this.game.world.time > this.errand.until && !this.errand.back) { this.errand.back = true; this.goTo(new THREE.Vector3(this.home[0], FL, this.home[1])); }
        const done = this.followPath();
        if (done && this.errand.back) { this.errand = null; this.nextErrand = this.game.world.time + rr(30, 45); S.onManagerErrand?.(false); }
        ch.lockFacing = done ? this.home[2] : null;
        return;
      }
      const d = Math.hypot(this.home[0] - ch.rootPosition.x, this.home[1] - ch.rootPosition.z);
      this.target = d > 1.5 ? new THREE.Vector3(this.home[0], ch.rootPosition.y, this.home[1]) : null;
      // glance around now and then (staff can notice you this way)
      this.glanceT -= 0.35;
      if (this.glanceT <= 0) { this.glanceT = rr(6, 14); this.glancing = rr(1.5, 2.8); this.glanceYaw = this.home[2] + rr(-2.6, 2.6); }
      if (this.glancing > 0) { this.glancing -= 0.35; ch.lockFacing = this.glanceYaw; } else ch.lockFacing = d < 2 ? this.home[2] : null;
    } else if (this.state === 'down') {
      this.target = null;
    } else if (this.state === 'flee') {
      ch.lockFacing = null;
      if (this.followPath(2)) this.escaped = true;
    }
  }
  getDown(delay = 0) {
    if (this.state === 'down') return;
    const go = () => {
      if (!this.ch?.alive) return;
      this.state = 'down'; this.fear = 1; this.path = []; this.target = null;
      this.ch.pose = poseDown; this.ch.rootDrop = 1.5; this.ch.lockFacing = this.ch.facing;
      this.ch.walkSpeed = 0;
    };
    if (delay) { this.ch.pose = poseHandsUp; this.game.world.delay(delay, go); } else go();
  }
  flee() {
    if (this.state === 'flee' || !this.ch?.alive) return;
    this.ch.freeze(false);
    this.state = 'flee'; this.ch.pose = null; this.ch.rootDrop = 0; this.ch.walkSpeed = 17; this.speedScale = 1;
    this.goTo(S.bank.id.walk_c);
    scream(this.ch.rootPosition, 1 + Math.random() * 0.3);
  }
}

// --- police, SWAT and the bank's guards --------------------------------------------------------------------------
export class CopBrain extends Walker(GunnerBrain) {
  constructor(game, player, kind, opts = {}) {
    super(game, player, { chattiness: 0, skill: opts.skill ?? (kind === 'swat' ? rr(0.6, 0.85) : kind === 'heavy' ? rr(0.55, 0.75) : rr(0.35, 0.65)), sight: opts.sight ?? 220 });
    this.kind = kind; this.mode = opts.mode || 'hold';
    this.hold = opts.hold || null; this.holdUntil = opts.holdUntil ?? Infinity;
    this.dormant = !!opts.dormant;
    this.path = []; this.repath = 0; this.arriveRadius = 2.4;
    this.combatSpeed = kind === 'heavy' ? 8 : 12;
    this.aimPenalty = S.plan?.diff === 'hard' ? 0.85 : 1.1;
  }
  idleChat() {}
  isEnemy(o) { return !this.dormant && o.team && o.team === S.crewTeam; }
  onSpot(enemy) { S.onCopSpot?.(this, enemy); }
  think() {
    const ch = this.ch, world = this.game.world;
    if (this.dormant) { this.target = null; ch.freeze(true); return; }
    ch.freeze(false);
    const enemy = this.scan();
    if (this.mode === 'hold' && world.time > this.holdUntil) { this.mode = 'assault'; this.path = []; }
    if (enemy) {
      S.lastSeen = { pos: enemy.character.rootPosition.clone(), t: world.time };
      const d = enemy.character.rootPosition.distanceTo(ch.rootPosition);
      if (this.mode === 'hold' && this.hold) {
        // peek out from cover: sidestep around the hold position
        if ((this.strafeT -= 0.35) <= 0) { this.strafeT = rr(1.2, 2.6); this.strafeDir = -this.strafeDir; }
        this.target = this.hold.clone().add(new THREE.Vector3(this.strafeDir * 2.5, 0, 0));
        return;
      }
      const away = ch.rootPosition.clone().sub(enemy.character.rootPosition).setY(0).normalize();
      const side = new THREE.Vector3(-away.z, 0, away.x);
      if ((this.strafeT -= 0.35) <= 0) { this.strafeT = rr(1, 2.4); this.strafeDir = Math.random() < 0.5 ? -1 : 1; }
      const want = ch.tool?.stats?.pellets ? 12 : this.kind === 'heavy' ? 18 : 26;
      this.target = ch.rootPosition.clone().addScaledVector(side, this.strafeDir * 4).addScaledVector(away, d > want ? -5 : d < 10 ? 4 : 0);
      this.path = [];
      return;
    }
    if (this.mode === 'hold' && this.hold) {
      this.target = Math.hypot(this.hold.x - ch.rootPosition.x, this.hold.z - ch.rootPosition.z) > 2 ? this.hold.clone() : null;
      this.faceTarget = this.hold.face ?? null;
      return;
    }
    // assault: head for the crew (where they were last seen, or the player)
    this.repath -= 0.35;
    if (!this.path?.length || this.repath <= 0) {
      this.repath = rr(3, 5);
      const me = this.game.localPlayer?.character;
      const goal = S.lastSeen && world.time - S.lastSeen.t < 12 ? S.lastSeen.pos : me?.alive ? me.rootPosition : null;
      if (goal) this.goTo(goal);
    }
    this.followPath(2);
    if (this.lastHurt && world.time - this.lastHurt.t < 2 && this.lastHurt.p.character?.alive) {
      const t = this.lastHurt.p.character.rootPosition;
      ch.lockFacing = Math.atan2(-(t.x - ch.rootPosition.x), -(t.z - ch.rootPosition.z));
    } else if (!this.enemy) ch.lockFacing = null;
  }
}

/** Your crew's gunman: sticks with you, fights the cops, yells at hostages. */
export class CrewBrain extends Walker(GunnerBrain) {
  constructor(game, player, def) {
    super(game, player, { chattiness: 0, skill: def.skill, sight: 200 });
    this.def = def; this.path = []; this.repath = 0; this.arriveRadius = 3;
    this.combatSpeed = 14; this.shoutT = rr(6, 12);
  }
  idleChat() {}
  isEnemy(o) { return o.team && o.team === S.policeTeam; }
  think() {
    const ch = this.ch, world = this.game.world;
    const me = this.game.localPlayer?.character;
    const enemy = this.scan();
    const follow = me?.alive ? me.rootPosition : null;
    if (enemy) {
      // fight, but don't wander off
      const d = follow ? follow.distanceTo(ch.rootPosition) : 0;
      if (d > 22 && follow) { this.goTo(follow); this.followPath(1); return; }
      const away = ch.rootPosition.clone().sub(enemy.character.rootPosition).setY(0).normalize();
      const side = new THREE.Vector3(-away.z, 0, away.x);
      if ((this.strafeT -= 0.35) <= 0) { this.strafeT = rr(1, 2.5); this.strafeDir = Math.random() < 0.5 ? -1 : 1; }
      this.target = ch.rootPosition.clone().addScaledVector(side, this.strafeDir * 3);
      return;
    }
    if (!follow) { this.target = null; return; }
    // keep a few studs behind and to the side of the player, out of the line of fire
    const d = follow.distanceTo(ch.rootPosition);
    if (d > 12) {
      this.repath -= 0.35;
      if (!this.path?.length || this.repath <= 0) { this.repath = 1.5; this.goTo(follow); }
      this.followPath(1);
    } else {
      this.path = [];
      const yaw = this.game.camera.yaw;
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const spot = follow.clone().addScaledVector(fwd, -4.5).addScaledVector(right, this.side ??= (Math.random() < 0.5 ? -4 : 4));
      // only if that spot is reachable in a straight line (not through a wall)
      const hit = this.game.world.raycast(new THREE.Vector3(follow.x, follow.y, follow.z), new THREE.Vector3(spot.x, follow.y, spot.z), { mask: GROUP.WORLD });
      if (hit) spot.copy(follow).addScaledVector(fwd, -3);
      this.target = spot.distanceTo(ch.rootPosition) > 1.5 ? spot : null;
      ch.lockFacing = null;
    }
    void world;
  }
}

// --- spawning --------------------------------------------------------------------------------------------------
let copN = 0;
const COP_NAMES = ['Daniels', 'Kowalski', 'Reyes', 'Murphy', 'Okafor', 'Chen', 'Brooks', 'Novak', 'Hughes', 'Patel', 'Garcia', 'Doyle', 'Washington', 'Ivanova', 'Kim', 'Russo'];
/** Add an NPC to the game at (x, y, z) facing yaw. opts: {name, look, team, gear, health, guns, brain(game, player)} */
export function spawnNPC(game, x, y, z, yaw, opts) {
  const p = game.addPlayer({ name: opts.name, appearance: opts.look, isBot: true });
  p.appearanceOverride = opts.look;
  p.npc = opts.kind || 'npc';
  if (opts.team) game.setTeam(p, opts.team);
  p.spawnOverride = { position: new THREE.Vector3(x, y, z), yaw };
  p.brain = opts.brain(game, p);
  game.spawnPlayer(p);
  const ch = p.character;
  ch.ragdoll = true;
  if (opts.health) { ch.maxHealth = ch.health = opts.health; }
  if (opts.gear) dress(ch, opts.gear);
  if (opts.mask) putOnMask(ch, opts.mask);
  if (opts.damageFilter) ch.damageFilter = opts.damageFilter;
  if (opts.guns) {
    p.backpack = opts.guns.map(([id, att]) => new Gun(game, p, id, att || []));
    p.equipped = -1;
    if (!opts.holstered) game.equip(p, 0);
  }
  ch.walkSpeed = opts.walkSpeed ?? 16;
  return p;
}
export function copName(kind) {
  const n = COP_NAMES[copN++ % COP_NAMES.length];
  return kind === 'swat' || kind === 'heavy' ? `SWAT ${n}` : `Officer ${n}`;
}
const ARMOR_SWAT = (dmg, zone) => (zone === 'torso' ? dmg * 0.5 : zone === 'head' ? dmg * 0.7 : dmg);
const ARMOR_HEAVY = (dmg, zone) => (zone === 'torso' ? dmg * 0.35 : zone === 'head' ? dmg * 0.6 : dmg * 0.7);
export function spawnCop(game, kind, x, y, z, yaw, brainOpts = {}) {
  const guns = kind === 'swat' ? [[pick(['m4', 'm4', 'mp5']), ['reddot']]] : kind === 'heavy' ? [['m249', ['reddot']]] : [[pick(['glock', 'glock', 'remington', 'mp5']), []]];
  return spawnNPC(game, x, y, z, yaw, {
    name: copName(kind), kind, look: kind === 'police' ? copLook() : swatLook(), team: S.policeTeam, gear: kind,
    health: kind === 'heavy' ? 260 : kind === 'swat' ? 120 : 100,
    damageFilter: kind === 'swat' ? ARMOR_SWAT : kind === 'heavy' ? ARMOR_HEAVY : null,
    guns, walkSpeed: kind === 'heavy' ? 10 : 15,
    brain: (g, p) => new CopBrain(g, p, kind, brainOpts),
  });
}
