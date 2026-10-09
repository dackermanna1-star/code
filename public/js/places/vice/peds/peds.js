// The people of Vice City: crowds on the sidewalks of Ocean Drive, old men in
// guayaberas in Little Havana, suits Downtown, sunbathers on the beach,
// gangs on their corners, drivers in every car. They walk the sidewalks,
// wait for the lights and cross at the crosswalks, stop to chat, sit on
// benches and lie in the sun. They hear gunshots and run (or cower, or film
// it), jump out of the way of cars, fight back, scream, report you, and go
// flying when you hit them. When they die they fall as ragdolls and bleed.
// See ARCHITECTURE.md (People) for the contract.
//
//   V.peds = new Peds(world)       ready()  update(dt)  lateUpdate(dt)
//   spawn({x, z, y?, heading, kind: 'civ'|'cop'|'swat'|'gang'|'mission', outfit (name|index), set, weapon, hp, armor,
//          team, ai (a brain: {update(ped, dt), onHit?(ped, attacker, info)}), persistent, state}) -> Ped
//   remove(p)  list  near(x, z, r, out?) -> [Ped] (a shared array, valid until 16 more calls)
//   ray(origin, dir, max, skip(ped)) -> {ped, part, d, point} | null
//   fromDriver(driver, veh) -> Ped    knockDriver(driver, vel)      (traffic's stand-in drivers)
//   ragdollRig(model, {vel, push, onSleep}) -> {stop(), center, asleep, getUp(onDone), push(dir, speed, part), faceUp(), heading()}
//   for police/mission brains: moveTo(p, x, z, speed)  faceTo(p, x, z)  aimAt(p, target|Vector3)  shoot(p, target)
//     lineOfSight(a, b)  setState(p, state, o)  say(p, kind|text, secs)  pickups  drop(kind, pos, o)
// Ped (the Ped contract): pos (feet), heading, vel, kind, team, hp, maxHp, armor, dead, ragdoll, vehicle, seat,
//   weapon, isPlayer=false, hit(dmg, part, dir, attacker, info), knock(vel, from), die(cause, attacker),
//   enterVehicle(veh, seat), exitVehicle(force), flee(threat), say(kind), brain, state, fig (its crowd figure)
// Events: emits 'death' {ped, cause, attacker}, 'pickup' {kind, amount, pos}, 'crime' (assault/murder/copMurder
//   when witnessed), 'noise' {kind:'scream'}; listens to 'noise', 'crime', 'vehicle:eject', 'vehicle:destroyed'.
import * as THREE from 'three';
import { V, K } from '../state.js';
import { Crowd, poseFigure, ITEM, GUN_ITEMS, handPoint, partCenter, PART_NAMES } from './crowd.js';
import { Ragdolls, rigModel } from './ragdoll.js';
import { Walkways } from './nav.js';
import { buildAtlas, OUTFITS, OUTFIT_BY_NAME, SETS, HAT } from './outfits.js';
import { think, act, setState, scare, hurt, dodge, rejoin, steer, LINES, WALK, RUN, SPRINT, wrap } from './ai.js';
import { playShot } from '../../warzone/fx.js';

const MAX_FIGS = 230;
const SPAWN_MIN = 90, SPAWN_MAX = 250, DESPAWN = 330, DESPAWN_FAR = 520;
const NEAR_R = 170;            // full-rate thinking, moving and posing within this of the camera
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _dir = new THREE.Vector3();
const _pt = { x: 0, y: 0, z: 0 };
const ITEM_OF = { pistol: ITEM.pistol, smg: ITEM.smg, uzi: ITEM.smg, mp5: ITEM.smg, rifle: ITEM.rifle, m4: ITEM.rifle, ak: ITEM.ak, ak47: ITEM.ak, shotgun: ITEM.shotgun, sniper: ITEM.sniper, bat: ITEM.bat, knife: ITEM.knife };
const WSTATS = { pistol: { dmg: 22, rpm: 300, spread: 2.6, kind: 'pistol', auto: false }, smg: { dmg: 16, rpm: 700, spread: 4, kind: 'smg', auto: true }, rifle: { dmg: 26, rpm: 600, spread: 2.6, kind: 'rifle', auto: true }, ak: { dmg: 28, rpm: 600, spread: 3.2, kind: 'ak', auto: true }, shotgun: { dmg: 12, rpm: 70, spread: 5, kind: 'shotgun', auto: false, pellets: 7 }, sniper: { dmg: 80, rpm: 40, spread: 0.6, kind: 'sniper', auto: false } };

// ---- a person -----------------------------------------------------------------------------------------------------------
let NEXT_ID = 1;
export class Ped {
  constructor(sys, o) {
    this.sys = sys; this.id = NEXT_ID++;
    this.isPlayer = false;
    this.kind = o.kind || 'civ';
    this.team = o.team || (this.kind === 'cop' || this.kind === 'swat' ? 'cops' : this.kind === 'gang' ? 'gang:' + (o.gang || 'kings') : 'civ');
    this.gang = this.team.startsWith('gang:') ? this.team.slice(5) : null;
    this.gangster = !!this.gang;
    this.pos = new THREE.Vector3(o.x, o.y ?? K.GROUND, o.z);
    this.vel = new THREE.Vector3();
    this.heading = o.heading ?? 0;
    this.maxHp = o.hp ?? (this.kind === 'swat' ? 160 : this.kind === 'cop' ? 110 : this.gangster ? 110 : 100);
    this.hp = this.maxHp; this.armor = o.armor ?? (this.kind === 'swat' ? 100 : 0);
    this.dead = false; this.ragdoll = false; this.vehicle = null; this.seat = -1;
    this.weapon = o.weapon || null;
    this.brain = o.ai && typeof o.ai.update === 'function' ? o.ai : null;
    this.persistent = !!o.persistent || !!this.brain || this.kind === 'mission';
    const r = sys.rand;
    this.seed = r(); this.tough = r(); this.curious = r(); this.speedMul = 0.88 + r() * 0.24;
    this.limp = false; this.grounded = true; this.onNav = false;
    this.nav = { e: null, from: 0, s: 0, off: 0, wait: false };
    this.want = { x: 0, z: 0, face: null, run: false };
    this.st = { t: 0 }; this.state = 'idle';
    this.threat = null; this.group = null; this.home = null;
    // looks
    let cell = typeof o.outfit === 'number' ? o.outfit : o.outfit != null ? OUTFIT_BY_NAME[o.outfit] : null;
    if (cell == null) cell = sys.pickOutfit(o.set || (this.kind === 'cop' ? 'cop' : this.kind === 'swat' ? 'swat' : this.gangster ? 'gang:' + this.gang : 'street'));
    this.outfit = cell;
    const od = OUTFITS[cell] || OUTFITS[0];
    this.cat = od?.cat || 'casual';
    this.jogger = this.cat === 'jogger' && !this.gangster;
    const hats = od?.hats || [0];
    const fig = this.fig = Crowd.figure({ cell, hat: hats[Math.floor(r() * hats.length)], scale: (this.kind === 'swat' ? 1.04 : 0.93 + r() * 0.1) * (od?.gender === 'f' ? 0.96 : 1), owner: this });
    if (od?.gender === 'f') fig.sx = 0.92;
    const items = od?.items || ['none'];
    this.carry = ITEM[items[Math.floor(r() * items.length)]] || 0;
    this.armsWalk = this.carry === ITEM.briefcase || this.carry === ITEM.shopbag ? 'carry' : this.carry === ITEM.surfboard ? 'surf' : this.carry === ITEM.drink || this.carry === ITEM.cup ? 'drink' : null;
    this.walkSpeed = (this.cat === 'old' ? 4.6 : WALK) * this.speedMul;
    this.P = { walk: r() * 6.28, stride: 0, gait: 0, t: 0, seed: this.seed * 10 };
    this.flash = 0; this.deadT = 0; this.downT = 0; this.rag = null; this.wasHitBy = null;
    sys.holdItem(this);
  }
  armed() { return !!this.weapon && this.weapon !== 'fists'; }
  melee() { const it = this.sys.itemFor(this.weapon); return it === ITEM.bat || it === ITEM.knife; }
  hit(dmg, part = 'torso', dir = null, attacker = null, info = {}) { this.sys._hit(this, dmg, part, dir, attacker, info || {}); }
  knock(vel, from) { this.sys._knock(this, vel, from); }
  die(cause = 'killed', attacker = null) { this.sys._die(this, cause, attacker); }
  enterVehicle(veh, seat = 0) { return this.sys._enter(this, veh, seat); }
  exitVehicle(force = false) { this.sys._exit(this, force); }
  flee(threat) { const t = threat?.pos || threat; if (t) scare(this.sys, this, t.x, t.z, threat?.pos ? threat : null, 1.5); }
  say(kind, secs) { this.sys.say(this, kind, secs); }
}

// ---- the manager ------------------------------------------------------------------------------------------------------
export class Peds {
  constructor(world) {
    this.world = world;
    buildAtlas();
    this.crowd = new Crowd(world.scene, MAX_FIGS);
    this.rags = new Ragdolls();
    this.list = [];
    this.time = 0; this.popT = 0; this.sweepT = 0; this.aimT = 0;
    this.seed = 12345;
    this.rand = () => { this.seed = (this.seed * 16807) % 2147483647; return (this.seed - 1) / 2147483646; };
    this.nearRing = Array.from({ length: 16 }, () => []); this.nearI = 0;
    this.drivers = new Map();          // traffic's stand-in drivers -> {fig, P}
    this.pickups = [];
    this.anger = new Map();            // gang -> {until, target}
    this.crossCache = new Map();
    this.initial = true;
    this.rigs = new Set();             // the player's ragdoll (ragdollRig handles)
    this.stats = { ms: 0, live: 0, drawn: 0, rags: 0 };
    this._initPickups(world.scene);
    this._initBubbles(world.scene);
    // the grid for separation and near(): 8-stud cells around the camera
    this.G = 96; this.GC = 8; this.gHead = new Int32Array(this.G * this.G); this.gNext = new Int32Array(1024); this.gx0 = 0; this.gz0 = 0;
  }

  ready() {
    this.nav = new Walkways(V.roads);
    // street furniture people use, filed by 64-stud cell
    this.spots = { bench: new Map(), lounger: new Map(), umbrella: new Map(), bus: new Map() };
    const S = V.props?.spots || {};
    const file = (map, list, kind) => { for (const sp of list || []) { const k = Math.floor(sp.x / 64) * 100003 + Math.floor(sp.z / 64); if (!map.has(k)) map.set(k, []); map.get(k).push({ ...sp, kind, taken: 0 }); } };
    file(this.spots.bench, S.benches, 'bench'); file(this.spots.lounger, S.loungers, 'lounger'); file(this.spots.umbrella, S.umbrellas, 'umbrella'); file(this.spots.bus, S.busStops, 'bus');
    const on = (n, f) => V.events.on(n, f);
    on('noise', (e) => this._noise(e));
    on('crime', (e) => this._crime(e));
    on('vehicle:eject', (e) => { const p = e.who; if (p instanceof Ped) { this._exit(p, true); p.knock(e.vel || _v.set(0, 10, 0), e.veh); p.hit(Math.min(40, (e.vel?.length?.() || 20) * 0.7), 'torso', null, null, { fall: true }); } });
    on('vehicle:destroyed', (e) => { const v = e.veh; if (!v?.seats) return; for (const w of [...v.seats]) if (w instanceof Ped) { this._exit(w, true); w.fig.blood = 1; w.hit(500, 'torso', null, e.attacker, { explosion: true }); w.knock(_v.set((Math.random() - 0.5) * 30, 35, (Math.random() - 0.5) * 30), v); } });
    this._hooks();
  }

  // ---- helpers ----------------------------------------------------------------------------------------------------------
  pickOutfit(set) { const a = SETS[set] || SETS.street; return a[Math.floor(this.rand() * a.length)]; }
  itemFor(w) { return w ? ITEM_OF[w] ?? ITEM.pistol : 0; }
  weaponStats(w) { return WSTATS[w] || V.combat?.WEAPONS?.[w] || WSTATS.pistol; }
  /** What they hold: their weapon when fighting, their thing (phone, briefcase...) otherwise. */
  holdItem(p) {
    const fighting = p.state === 'shoot' || p.state === 'fight' || (p.brain && p.armed());
    const w = this.itemFor(p.weapon);
    p.fig.item = p.dead ? 0 : fighting && w ? w : p.state === 'flee' || p.state === 'cower' || p.state === 'handsup' ? 0 : p.state === 'film' ? ITEM.phone : (p.state === 'idle' && (p.st.arms === 'phone' || p.st.arms === 'text')) ? ITEM.phone : p.carry;
    if (p.gangster && w && !fighting && p.state !== 'flee') p.fig.item = GUN_ITEMS.has(w) && p.st.arms === 'pistolLow' ? w : p.fig.item;
  }
  visible(x, y, z, margin = 0.5) {
    const cam = this.world.camera;
    cam.getWorldDirection(_dir);
    const dx = x - cam.position.x, dy = y - cam.position.y, dz = z - cam.position.z, d = Math.hypot(dx, dy, dz) || 1;
    return (dx * _dir.x + dy * _dir.y + dz * _dir.z) / d > margin;
  }
  ground(x, y, z) { const g = V.phys?.groundAt?.(x, y + 4, z, 0.5, 5); return Number.isFinite(g) ? g : (V.ground?.heightAt?.(x, z) ?? K.GROUND); }

  // ---- population ---------------------------------------------------------------------------------------------------------
  /** How many people should be about here and now. */
  _target(cam) {
    const D = V.plan?.districtAt?.(cam.x, cam.z);
    const h = V.time?.hour ?? 14;
    const tod = h < 2 ? 0.55 : h < 5 ? 0.18 : h < 7 ? 0.35 : h < 10 ? 0.75 : h < 17 ? 0.9 : h < 23 ? 1 : 0.7;
    let busy = D ? D.peds ?? 0.5 : 0.4;
    if (D?.id === 'southbeach' && cam.x > 2600 && (h > 17 || h < 2)) busy *= 1.2;
    const q = V.settings?.quality === 'low' ? 0.6 : 1;
    return Math.round(Math.max(10, 104 * Math.min(1.15, busy * tod)) * q);
  }
  /** Which wardrobe fits this spot (district, time, beach). */
  _setAt(x, z, sand) {
    const D = V.plan?.districtAt?.(x, z), h = V.time?.hour ?? 14, night = h > 20 || h < 4, day = h > 8 && h < 18, r = this.rand();
    if (sand) return r < (day ? 0.62 : 0.2) ? 'beach' : r < 0.8 ? 'tourist' : r < 0.9 ? 'jogger' : 'street';
    const id = D?.id;
    if (id === 'southbeach' || id === 'midbeach' || id === 'northbeach') return night ? (r < 0.45 ? 'club' : r < 0.75 ? 'street' : 'tourist') : r < 0.3 ? 'tourist' : r < 0.55 ? 'beach' : r < 0.65 ? 'jogger' : 'street';
    if (id === 'downtown' || id === 'brickell' || id === 'brickellkey') return night ? (r < 0.3 ? 'club' : r < 0.55 ? 'business' : 'street') : r < 0.5 ? 'business' : 'street';
    if (id === 'havana') return r < 0.35 ? 'old' : r < 0.85 ? 'street' : 'caribbean';
    if (id === 'littlehaiti') return r < 0.55 ? 'caribbean' : 'street';
    if (id === 'overtown' || id === 'wynwood') return r < 0.2 && day ? 'worker' : r < 0.4 ? 'caribbean' : 'street';
    if (id === 'port') return r < 0.65 ? 'worker' : 'street';
    if (id === 'airport') return r < 0.5 ? 'tourist' : r < 0.8 ? 'business' : 'street';
    return r < 0.12 ? 'jogger' : r < 0.25 ? 'old' : 'street';
  }

  _populate(dt) {
    if ((this.popT -= dt) > 0) return;
    this.popT = 0.25;
    const cam = this.world.camera.position;
    // let go of people far away (and old bodies out of sight)
    let live = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.persistent || p.vehicle) { if (!p.dead) live += p.persistent ? 0 : 1; continue; }
      const d = Math.hypot(p.pos.x - cam.x, p.pos.z - cam.z);
      const seen = d < 400 && this.visible(p.pos.x, p.pos.y + 2, p.pos.z, 0.45);
      if (p.dead) {
        if ((p.deadT > 60 && !seen) || d > 420 || p.deadT > 200) this.remove(p);
      } else if ((d > DESPAWN && !seen) || d > DESPAWN_FAR) this.remove(p);
      else live++;
    }
    this.stats.live = live;
    if (!this.nav) return;
    if (this.lastCam && Math.hypot(cam.x - this.lastCam.x, cam.z - this.lastCam.z) > 300) this.initial = true;
    (this.lastCam ||= new THREE.Vector3()).copy(cam);
    const want = this._target(cam);
    let n = this.initial ? Math.min(want - live, 60) : Math.min(3, want - live);
    for (let k = 0; k < n && this.list.length < MAX_FIGS - 40; k++) this._spawnOne(cam, this.initial);
    this._beach(cam);
    if (this.initial && live > 0) this.initial = false;
    if (this.initial && this.nav.edges.length) this.initial = false;
  }

  /** One new person (or a little group) on a sidewalk out of sight. */
  _spawnOne(cam, initial) {
    const r = this.rand;
    const sp = this.nav.pick(cam.x, cam.z, initial ? 25 : SPAWN_MIN, SPAWN_MAX, r, (x, z) => initial || Math.hypot(x - cam.x, z - cam.z) > 190 || !this.visible(x, cam.y, z, 0.35));
    if (!sp) return;
    const e = sp.edge, D = V.plan?.districtAt?.(sp.x, sp.z);
    const gangHere = D?.gang && this.rand() < 0.22 && this._gangCount(D.gang) < 14;
    const kind = r();
    const side = r() < 0.5 ? 1 : -1, wHalf = Math.max(1.5, e.w / 2 - 2);
    if (gangHere || kind < 0.12) {
      // a group: standing and talking (gangs on their corners)
      const n = 2 + Math.floor(r() * (gangHere ? 3 : 2));
      const off = side * wHalf * 0.7;
      this.nav.point(e, e.a, sp.s, off, _pt);
      const cx = _pt.x, cz = _pt.z, y = _pt.y;
      const set = gangHere ? 'gang:' + D.gang : this._setAt(cx, cz);
      const group = { members: [], x: cx, z: cz };
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.5, rr = 2.0 + r() * 0.6;
        const p = this.spawn({ x: cx + Math.cos(a) * rr, z: cz + Math.sin(a) * rr, y, kind: gangHere ? 'gang' : 'civ', gang: D?.gang, set, weapon: gangHere ? (r() < 0.6 ? 'pistol' : r() < 0.6 ? 'smg' : 'bat') : null, state: 'none' });
        if (!p) break;
        p.group = group; group.members.push(p);
        setState(this, p, 'chat', { center: group, secs: gangHere ? null : 20 + r() * 50, x: p.pos.x, z: p.pos.z });
        p.heading = Math.atan2(cx - p.pos.x, cz - p.pos.z);
        this.joinNav(p, 30, true);
      }
      return;
    }
    // a bench nearby? sit on it (or wait at the bus stop)
    if (kind < 0.24) { const b = this._freeSpot('bench', sp.x, sp.z, 60) || this._freeSpot('bus', sp.x, sp.z, 60); if (b) { this._spawnAtSpot(b); return; } }
    const p = this.spawn({ x: sp.x, z: sp.z, y: sp.y, set: this._setAt(sp.x, sp.z), state: 'none' });
    if (!p) return;
    p.onNav = true;
    const fwd = r() < 0.5;
    p.nav.e = e; p.nav.from = fwd ? e.a : e.b; p.nav.s = fwd ? sp.s : e.len - sp.s; p.nav.off = this._laneOff(p, e);
    this.nav.point(e, p.nav.from, p.nav.s, p.nav.off, _pt); p.pos.set(_pt.x, _pt.y, _pt.z);
    p.heading = Math.atan2(e.ux * (fwd ? 1 : -1), e.uz * (fwd ? 1 : -1));
    if (kind < 0.36 && !p.jogger) setState(this, p, 'idle', { secs: 5 + r() * 20, arms: null, x: p.pos.x + (-e.uz) * side * wHalf * 0.6, z: p.pos.z + e.ux * side * wHalf * 0.6 });
    else setState(this, p, 'walk');
    if (p.state === 'idle') p.st.arms = this._idleArms(p);
  }
  _idleArms(p) { const it = p.carry; return it === ITEM.phone ? (this.rand() < 0.5 ? 'phone' : 'text') : it === ITEM.drink || it === ITEM.cup || it === ITEM.cigar ? 'drink' : this.rand() < 0.4 ? 'text' : this.rand() < 0.4 ? 'fold' : 'idle'; }
  _laneOff(p, e) { const w = e.kind === 'walk' ? Math.max(0, e.w / 2 - 2.2) : 1.4; return (0.15 + p.seed * 0.85) * w; }
  _gangCount(g) { let n = 0; for (const p of this.list) if (p.gang === g && !p.dead) n++; return n; }

  _freeSpot(kind, x, z, r) {
    const map = this.spots?.[kind];
    if (!map) return null;
    const ci = Math.floor(x / 64), cj = Math.floor(z / 64), rc = Math.ceil(r / 64);
    let best = null, bd = r;
    for (let i = ci - rc; i <= ci + rc; i++) for (let j = cj - rc; j <= cj + rc; j++) {
      const c = map.get(i * 100003 + j);
      if (c) for (const s of c) { if (s.taken >= (kind === 'bench' ? 2 : kind === 'bus' ? 3 : 1)) continue; const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
    }
    return best;
  }
  /** Sit on a bench (two places), wait at a bus stop, lie on a lounger. */
  _spawnAtSpot(s, set) {
    const h = s.heading || 0, fx = Math.sin(h), fz = Math.cos(h), rx = -fz, rz = fx;
    let x = s.x, z = s.z, state = 'sit', o = {};
    if (s.kind === 'bench') { const slot = s.taken === 0 ? -1.25 : 1.25; x = s.x + rx * slot - fx * 0.35; z = s.z + rz * slot - fz * 0.35; o = { spot: { x, z, heading: h, ref: s }, seatY: 2.2, secs: 30 + this.rand() * 90 }; }
    else if (s.kind === 'bus') { x = s.x + rx * (this.rand() - 0.5) * 6 - fx * 2; z = s.z + rz * (this.rand() - 0.5) * 6 - fz * 2; state = 'idle'; o = { secs: 20 + this.rand() * 40, face: { x: s.x + fx * 20, z: s.z + fz * 20 }, x, z }; }
    else if (s.kind === 'lounger') { x = s.x + fx * 2.5; z = s.z + fz * 2.5; state = 'lie'; o = { spot: { x, z, heading: h, ref: s }, secs: 60 + this.rand() * 120 }; }
    const p = this.spawn({ x, z, y: s.y, set: set || this._setAt(x, z, s.kind === 'lounger'), state: 'none' });
    if (!p) return null;
    s.taken++;
    if (o.spot) o.spot.ref = s;
    p.spotRef = s;
    setState(this, p, state, o);
    if (state === 'idle') p.st.arms = this._idleArms(p);
    p.heading = h;
    if (state === 'lie') { p.pos.y = (s.y ?? p.pos.y) + 1.44; p.beach = true; }
    if (state === 'sit') p.pos.y = s.y ?? p.pos.y;
    return p;
  }
  leaveSpot(p) { if (p.spotRef) { p.spotRef.taken = Math.max(0, p.spotRef.taken - 1); p.spotRef = null; } p.pinned = false; }

  /** The beach by day: sunbathers on the loungers, people walking the sand. */
  _beach(cam) {
    if (!V.ground?.kindAt) return;
    const h = V.time?.hour ?? 14, day = h > 7.5 && h < 19;
    let n = 0;
    for (const p of this.list) if (p.beach && !p.dead) n++;
    const want = day ? 26 : 5;
    if (n >= want) return;
    for (let k = 0; k < 2 && n < want; k++) {
      const a = this.rand() * Math.PI * 2, rr = 60 + this.rand() * 200;
      const x = cam.x + Math.cos(a) * rr, z = cam.z + Math.sin(a) * rr;
      if (Math.hypot(x - cam.x, z - cam.z) < 150 && this.visible(x, cam.y, z, 0.3) && !this.initial) continue;
      if (day && this.rand() < 0.45) { const s = this._freeSpot('lounger', x, z, 50); if (s) { if (this._spawnAtSpot(s)) n++; continue; } }
      const kd = V.ground.kindAt(x, z);
      if (kd !== 1 && kd !== 2) continue;
      const p = this.spawn({ x, z, set: this._setAt(x, z, true), state: 'none' });
      if (!p) return;
      p.beach = true; p.home = { x, z }; n++;
      const r = this.rand();
      if (r < 0.3 && day) { setState(this, p, 'lie', { spot: { x, z, heading: this.rand() * 6.28 }, secs: 60 + this.rand() * 200 }); p.pos.y = this.ground(x, 6, z) + 0.15; }
      else if (r < 0.5) setState(this, p, 'idle', { secs: 10 + this.rand() * 30, arms: this._idleArms(p), x, z });
      else setState(this, p, 'wander');
    }
  }
  /** A point on the sand near (x, z) in direction a (or just near). */
  beachPoint(x, z, a, r) {
    for (let k = 0; k < 6; k++) {
      const px = x + Math.cos(a + k * 0.9) * r, pz = z + Math.sin(a + k * 0.9) * r;
      const kd = V.ground?.kindAt?.(px, pz);
      if (kd === 1 || kd === 2) return { x: px, z: pz };
    }
    return { x, z };
  }

  // ---- spawning and removing ------------------------------------------------------------------------------------------------
  spawn(o = {}) {
    if (this.crowd.figs.length >= MAX_FIGS) return null;
    const p = new Ped(this, o);
    if (o.y == null) p.pos.y = this.ground(p.pos.x, 40, p.pos.z);
    if (!this.crowd.add(p.fig)) return null;
    this.list.push(p);
    if (p.brain) p.state = 'brain';
    else if (o.state !== 'none') { if (o.state) setState(this, p, o.state, o.st || {}); else if (!this.joinNav(p, 40)) setState(this, p, 'idle', { secs: 5 }); else setState(this, p, 'walk'); }
    this._poseNow(p);
    return p;
  }
  remove(p) {
    const i = this.list.indexOf(p);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.crowd.remove(p.fig);
    if (p.rag) { p.rag.stop(); p.rag = null; }
    if (p.vehicle) { p.vehicle.leave?.(p); p.vehicle = null; }
    this.leaveSpot(p);
    if (p.group) { const g = p.group.members; const k = g.indexOf(p); if (k >= 0) g.splice(k, 1); }
    p.removed = true;
    this._unbubble(p);
  }
  /** Everyone within r of (x, z): a shared array (one of 16 in turn). */
  near(x, z, r, out) {
    const res = out || this.nearRing[this.nearI = (this.nearI + 1) & 15];
    res.length = 0;
    const r2 = r * r;
    for (const p of this.list) { const dx = p.pos.x - x, dz = p.pos.z - z; if (dx * dx + dz * dz <= r2) res.push(p); }
    return res;
  }

  // ---- the sidewalks -------------------------------------------------------------------------------------------------------
  /** Put p on the nearest sidewalk (heading the way it faces). */
  joinNav(p, maxR = 60, keepPos = false) {
    const n = this.nav?.nearest(p.pos.x, p.pos.z, maxR);
    if (!n) { p.onNav = false; return false; }
    const e = n.edge;
    const fwd = e.ux * Math.sin(p.heading) + e.uz * Math.cos(p.heading) >= 0;
    p.nav.e = e; p.nav.from = fwd ? e.a : e.b; p.nav.s = fwd ? n.s : e.len - n.s; p.nav.off = this._laneOff(p, e); p.nav.wait = false;
    p.onNav = true;
    void keepPos;
    return true;
  }
  turnBack(p) { const nv = p.nav; if (!nv.e) return; nv.from = this.nav.other(nv.e, nv.from); nv.s = Math.max(0, nv.e.len - nv.s); nv.wait = false; nv.pending = null; }

  /** Walk along the sidewalk graph: round corners, waiting for the lights at crosswalks. */
  followNav(p, dt, speed, want, depth = 0) {
    const N = this.nav, nv = p.nav, e = nv.e;
    if (!e || depth > 4) { if (!e) p.onNav = false; return; }
    // how far along are we (projected, so being pushed about doesn't matter)
    const fx = N.nx(nv.from), fz = N.nz(nv.from), dir = e.a === nv.from ? 1 : -1, ux = e.ux * dir, uz = e.uz * dir;
    const s = (p.pos.x - fx) * ux + (p.pos.z - fz) * uz;
    nv.s = Math.max(nv.s, Math.min(e.len, s));
    if (e.len - nv.s < 1.6) {
      // at the end: choose the way on
      const node = N.other(e, nv.from);
      const next = nv.pending && N.links[node].includes(nv.pending.id) ? nv.pending : this._nextEdge(p, e, node, false);
      nv.pending = null;
      if (next.kind === 'cross' && !this.canCross(next)) {
        // wait at the kerb, facing across
        N.point(e, nv.from, e.len, nv.off, _pt);
        const o = N.other(next, node);
        setState(this, p, 'wait', { edge: next, x: _pt.x, z: _pt.z, face: { x: N.nx(o), z: N.nz(o) }, next });
        nv.pending = next;
        return;
      }
      nv.e = next; nv.from = node; nv.s = 0; nv.off = this._laneOff(p, next);
      return this.followNav(p, dt, speed, want, depth + 1);
    }
    const ahead = Math.min(e.len, nv.s + 3.5);
    N.point(e, nv.from, ahead, nv.off, _pt);
    // hurry across the road when the lights change
    let sp = speed;
    if (e.kind === 'cross') { const L = this._crossLight(e); sp = L === 'red' ? speed * 1.15 : speed * 1.7; }
    steer(want, p, _pt.x, _pt.z, sp, 0.5);
  }
  /** Running away along the sidewalks: at each corner, the way that leads furthest from the danger (across roads too). */
  fleeNav(p, dt, speed, want, th, depth = 0) {
    const N = this.nav, nv = p.nav, e = nv.e;
    if (!e || depth > 4) { if (!e) p.onNav = false; return; }
    const dir = e.a === nv.from ? 1 : -1, ux = e.ux * dir, uz = e.uz * dir;
    const ax = p.pos.x - th.x, az = p.pos.z - th.z;
    // running towards it? turn round
    if ((ux * ax + uz * az) < -0.3 * Math.hypot(ax, az) && Math.hypot(ax, az) < 80 && (p.st.turned || 0) < 2) { this.turnBack(p); p.st.turned = (p.st.turned || 0) + 1; }
    const fx = N.nx(nv.from), fz = N.nz(nv.from), d2 = e.a === nv.from ? 1 : -1;
    const s = (p.pos.x - fx) * e.ux * d2 + (p.pos.z - fz) * e.uz * d2;
    nv.s = Math.max(nv.s, Math.min(e.len, s));
    if (e.len - nv.s < 1.6) {
      const node = N.other(e, nv.from);
      const next = this._nextEdge(p, e, node, true, th);
      nv.e = next; nv.from = node; nv.s = 0; nv.off = this._laneOff(p, next) * 0.5; nv.pending = null;
      return this.fleeNav(p, dt, speed, want, th, depth + 1);
    }
    N.point(nv.e, nv.from, Math.min(nv.e.len, nv.s + 4), nv.off, _pt);
    steer(want, p, _pt.x, _pt.z, speed, 0.5);
  }
  _nextEdge(p, e, node, fleeing, th) {
    const N = this.nav, links = N.links[node];
    const din = { x: N.nx(node) - N.nx(N.other(e, node)), z: N.nz(node) - N.nz(N.other(e, node)) };
    const dl = Math.hypot(din.x, din.z) || 1;
    let best = e, bw = -Infinity;
    for (const id of links) {
      const n = N.edges[id];
      if (n === e && links.length > 1) continue;
      const o = N.other(n, node), dx = N.nx(o) - N.nx(node), dz = N.nz(o) - N.nz(node), l = Math.hypot(dx, dz) || 1;
      let w;
      if (fleeing) {
        const ax = N.nx(o) - th.x, az = N.nz(o) - th.z;
        w = Math.hypot(ax, az) - Math.hypot(N.nx(node) - th.x, N.nz(node) - th.z) + this.rand() * 4;
      } else {
        const straight = (dx * din.x + dz * din.z) / (l * dl);
        w = (n.kind === 'cross' ? 0.5 : 1) * (0.7 + 0.6 * Math.max(0, straight)) + this.rand() * 0.9;
        if (n === e) w = -5;
      }
      if (w > bw) { bw = w; best = n; }
    }
    return best;
  }
  _crossLight(e) {
    const c = e.cross, n = c && V.plan?.nodes?.[c.node];
    if (!n || !n.light) return null;
    return V.roads?.lightState?.(c.node, c.edge) || 'green';
  }
  /** May people cross here now? (red for the cars, and nothing coming) */
  canCross(e) {
    const c = e.cross;
    if (!c) return true;
    const k = e.id, cached = this.crossCache.get(k);
    if (cached && this.time - cached.t < 0.4) return cached.ok;
    const L = this._crossLight(e);
    let ok = !L || L === 'red';
    if (ok) {
      const mx = (c.ax + c.bx) / 2, mz = (c.az + c.bz) / 2;
      const list = V.vehicles?.near?.(mx, mz, L ? 34 : 75);
      if (list) for (const v of list) {
        const sp = Math.hypot(v.vel.x, v.vel.z);
        if (sp < 3) continue;
        if ((mx - v.pos.x) * v.vel.x + (mz - v.pos.z) * v.vel.z > 0) { ok = false; break; }
      }
    }
    this.crossCache.set(k, { t: this.time, ok });
    return ok;
  }

  // ---- per frame: thinking and moving ------------------------------------------------------------------------------------
  update(dt) {
    if (dt <= 0 || !this.nav) return;
    const t0 = performance.now();
    this.time += dt;
    this._populate(dt);
    this._grid();
    this._perceive(dt);
    const cam = this.world.camera.position;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      const dx = p.pos.x - cam.x, dz = p.pos.z - cam.z, far = dx * dx + dz * dz > NEAR_R * NEAR_R;
      p.far = far;
      // far away: a tenth of the work
      p.acc = (p.acc || 0) + dt;
      if (far && p.acc < 0.1 && !p.dead) continue;
      const pdt = Math.min(0.25, p.acc); p.acc = 0;
      this._step(p, pdt, far);
    }
    this.stats.ms = performance.now() - t0;
  }

  _step(p, dt, far) {
    if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 5);
    if (p.dead) { p.deadT += dt; return; }
    if (p.vehicle) { this._inVehicle(p, dt); return; }
    if (p.state === 'down' || p.state === 'getup') { this._down(p, dt); return; }
    // the brain: police and mission scripts take over completely
    p.pinned = false; p.keepHeading = false;
    if (p.brain) {
      const P = p.P;
      P.arms = null; P.aimDir = null; P.aimPitch = 0; P.crouch = 0; P.lean = 0; P.twist = 0; P.act = 0; P.hipY = 2; P.legs = 0; P.lie = 0; P.look = 0; P.headYaw = 0; P.t = this.time;
      p.want.x = 0; p.want.z = 0; p.want.face = null;
      p.brain.update(p, dt);
    } else {
      // decisions a few times a second
      p.thinkT = (p.thinkT ?? this.rand() * 0.25) - dt;
      if (p.thinkT <= 0) { p.thinkT = 0.22 + this.rand() * 0.08; think(this, p, 0.25); }
      act(this, p, dt);
    }
    this._move(p, dt, far);
  }

  /** Steering, separation, collision and the walk cycle. */
  _move(p, dt, far) {
    const want = p.want, P = p.P;
    if (p.pinned) { P.stride = 0; P.gait = 0; return; }
    let wx = want.x, wz = want.z;
    // keep a little apart (and out of the player's way)
    if (!far) {
      const sep = this._separation(p);
      wx += sep.x; wz += sep.z;
    }
    const air = !p.grounded;
    const acc = air ? 6 : p.state === 'flee' || p.state === 'fight' ? 60 : 30;
    const dvx = wx - p.vel.x, dvz = wz - p.vel.z, dl = Math.hypot(dvx, dvz), m = acc * dt;
    if (p.state !== 'dodge') { if (dl > m) { p.vel.x += dvx / dl * m; p.vel.z += dvz / dl * m; } else { p.vel.x = wx; p.vel.z = wz; } }
    // move: with collision near the camera, on the ground snapshot far away
    if (!far) {
      const r = V.phys.moveBody(p.pos, p.vel, dt, { r: 1.05, h: 5, step: 1.7, grounded: p.grounded, gravity: K.G });
      const was = p.grounded;
      p.grounded = r.grounded;
      if (!p.grounded) { p.fallY = Math.max(p.fallY ?? p.pos.y, p.pos.y); }
      else if (!was) { const drop = (p.fallY ?? p.pos.y) - p.pos.y; p.fallY = null; if (drop > 14) { this._knock(p, _v.set(p.vel.x * 0.5, 2, p.vel.z * 0.5), null); p.hit((drop - 12) * 5, 'legL', null, null, { fall: true }); } }
      if (p.pos.y < -40) { this.remove(p); return; }
    } else {
      p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
      p.gT = (p.gT || 0) - dt;
      if (p.gT <= 0) { p.gT = 0.5; p.pos.y = this.ground(p.pos.x, p.pos.y, p.pos.z); }
      p.vel.y = 0; p.grounded = true;
    }
    // water: they swim back (people on foot avoid the sea; this catches the pushed and the dodging)
    if (p.pos.y < -1.5 && V.ground?.waterAt?.(p.pos.x, p.pos.z) === 0) { p.pos.y = -1.5; p.vel.y = Math.max(0, p.vel.y); }
    // facing
    const hs = Math.hypot(p.vel.x, p.vel.z);
    let face = null;
    if (want.face) face = Math.atan2(want.face.x - p.pos.x, want.face.z - p.pos.z);
    else if (hs > 0.6 && !p.keepHeading) face = Math.atan2(p.vel.x, p.vel.z);
    if (face != null) { const d = wrap(face - p.heading); p.heading += d * Math.min(1, dt * (p.state === 'shoot' || p.state === 'fight' ? 14 : 8)); }
    // the walk cycle follows the speed
    const sp = hs * (p.grounded ? 1 : 0.3);
    P.stride += (Math.min(1, sp / 7) - P.stride) * Math.min(1, dt * 8);
    P.gait = sp > 16.5 ? 2 : sp > 9.5 ? 1 : 0;
    P.walk += dt * (sp > 0.3 ? 3.0 + sp * 0.36 : 0);
    if (!p.grounded && p.state === 'dodge') { P.legs = 0.6; P.lean = 0.7; }
  }

  // the separation grid (8-stud cells around the camera)
  _grid() {
    const cam = this.world.camera.position, G = this.G, C = this.GC;
    this.gx0 = Math.floor(cam.x / C) - G / 2; this.gz0 = Math.floor(cam.z / C) - G / 2;
    this.gHead.fill(-1);
    if (this.gNext.length < this.list.length) this.gNext = new Int32Array(this.list.length * 2);
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      if (p.dead || p.vehicle || p.pinned && p.state === 'lie') continue;
      const gi = Math.floor(p.pos.x / C) - this.gx0, gj = Math.floor(p.pos.z / C) - this.gz0;
      if (gi < 0 || gj < 0 || gi >= G || gj >= G) continue;
      const k = gi * G + gj;
      this.gNext[i] = this.gHead[k]; this.gHead[k] = i;
    }
  }
  _separation(p) {
    const out = _pt; out.x = 0; out.z = 0;
    const G = this.G, C = this.GC;
    const gi = Math.floor(p.pos.x / C) - this.gx0, gj = Math.floor(p.pos.z / C) - this.gz0;
    const R = 2.6;
    for (let i = gi - 1; i <= gi + 1; i++) for (let j = gj - 1; j <= gj + 1; j++) {
      if (i < 0 || j < 0 || i >= G || j >= G) continue;
      for (let k = this.gHead[i * G + j]; k >= 0; k = this.gNext[k]) {
        const q = this.list[k];
        if (q === p) continue;
        const dx = p.pos.x - q.pos.x, dz = p.pos.z - q.pos.z, d2 = dx * dx + dz * dz;
        if (d2 > R * R || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), f = (R - d) / R;
        out.x += dx / d * f * 6; out.z += dz / d * f * 6;
      }
    }
    // the player: step aside (and complain if they barge into us)
    const P = V.player;
    if (P && !P.vehicle && !P.dead && P.pos) {
      const dx = p.pos.x - P.pos.x, dz = p.pos.z - P.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 9 && d2 > 1e-6) {
        const d = Math.sqrt(d2), f = (3 - d) / 3;
        out.x += dx / d * f * 9; out.z += dz / d * f * 9;
        const ps = Math.hypot(P.vel?.x || 0, P.vel?.z || 0);
        if (d < 2.3 && ps > 12 && (p.state === 'walk' || p.state === 'idle' || p.state === 'wait' || p.state === 'chat') && this.time - (p.bumpT || -9) > 4) {
          p.bumpT = this.time;
          p.vel.x += dx / d * 8; p.vel.z += dz / d * 8;
          this.say(p, 'hey', 2);
          if (p.tough > 0.93 && !p.gangster) setState(this, p, 'fight', { target: P });
        }
      }
    }
    return out;
  }

  // ---- perception: being aimed at, cars coming ----------------------------------------------------------------------------
  _perceive(dt) {
    const W = V.weapons, P = V.player;
    // aimed at: hands up (civilians) or trouble (gangs)
    const tg = W?.aiming && W.target instanceof Ped ? W.target : null;
    if (tg && !tg.dead && !tg.brain) {
      this.aimT = this.aimTarget === tg ? this.aimT + dt : 0; this.aimTarget = tg;
      const d = Math.hypot(tg.pos.x - P.pos.x, tg.pos.z - P.pos.z);
      if (tg.gangster && this.aimT > 0.7) this.angerGang(tg, P);
      else if (!tg.gangster && tg.kind === 'civ' && d < 40 && tg.state !== 'handsup' && tg.state !== 'flee' && tg.state !== 'down' && tg.state !== 'getup' && tg.state !== 'fight' && tg.state !== 'shoot' && !tg.vehicle) {
        if (tg.tough > 0.85 && tg.armed()) setState(this, tg, 'shoot', { target: P });
        else if (tg.tough < 0.75 || d < 15) { setState(this, tg, 'handsup', {}); this.say(tg, 'handsup', 2); }
        else scare(this, tg, P.pos.x, P.pos.z, P, 1);
      }
    } else { this.aimT = 0; this.aimTarget = null; }
    // gangs that are angry with someone go for them
    for (const [g, a] of this.anger) {
      if (this.time > a.until || !a.target || a.target.dead) { this.anger.delete(g); continue; }
    }
    // cars: every tenth of a second, look along each fast car's path for people to jump clear
    if ((this.sweepT -= dt) <= 0) { this.sweepT = 0.1; this._sweepCars(); }
  }
  _sweepCars() {
    const vs = V.vehicles?.list;
    if (!vs) return;
    const cam = this.world.camera.position;
    for (const v of vs) {
      if (v.dead || v.kind === 'boat' || v.kind === 'heli' || v.kind === 'plane') continue;
      const sp = Math.hypot(v.vel.x, v.vel.z);
      if (sp < 12) continue;
      if (Math.abs(v.pos.x - cam.x) > 260 || Math.abs(v.pos.z - cam.z) > 260) continue;
      const fx = v.vel.x / sp, fz = v.vel.z / sp, look = sp * 1.15 + 6, hw = (v.size?.w || 7) / 2 + 2.6;
      const list = this.near(v.pos.x + fx * look / 2, v.pos.z + fz * look / 2, look / 2 + hw);
      for (const p of list) {
        if (p.dead || p.vehicle || p.brain || p.isPlayer) continue;
        const dx = p.pos.x - v.pos.x, dz = p.pos.z - v.pos.z;
        const along = dx * fx + dz * fz, side = dx * -fz + dz * fx;
        if (along < (v.size?.l || 12) * 0.3 || along > look || Math.abs(side) > hw) continue;
        const tti = along / sp;
        if (tti < 0.22) continue; // too late
        // the side away from the car's path (most jump; a few freeze)
        if (p.rand === undefined && p.tough < 0.08) continue;
        const s = side >= 0 ? -1 : 1;
        // (dodge's side is relative to the car's heading: +1 = its right)
        const h = v.heading ?? Math.atan2(fx, fz), rx = -Math.cos(h), rz = Math.sin(h);
        const away = (dx * rx + dz * rz) >= 0 ? 1 : -1;
        void s;
        dodge(this, p, v, away);
      }
    }
  }

  // ---- events -------------------------------------------------------------------------------------------------------------
  _noise(e) {
    if (!e?.pos) return;
    const k = e.kind, r = e.r || 60;
    if (k === 'horn') {
      // a honk: people in front of the car hurry along
      for (const p of this.near(e.pos.x, e.pos.z, Math.min(r, 30))) if (!p.dead && p.state === 'wait') { /* (they'd rather wait) */ }
      return;
    }
    const level = k === 'explosion' ? 2.2 : k === 'shot' ? 1.3 : k === 'crash' ? 0.6 : k === 'scream' ? 0.5 : 0.5;
    for (const p of this.near(e.pos.x, e.pos.z, r)) {
      if (p.dead || p.vehicle) continue;
      const d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
      if (k === 'crash' || k === 'scream') {
        if (d > r * 0.6) continue;
        if (k === 'crash' && p.curious > 0.6 && d > 18 && (p.state === 'walk' || p.state === 'idle')) { setState(this, p, 'film', { secs: 3 + this.rand() * 5 }); p.threat = { x: e.pos.x, z: e.pos.z, by: null, t: this.time }; continue; }
        if (d < 25) scare(this, p, e.pos.x, e.pos.z, e.src || null, level);
        continue;
      }
      if (p.brain) { p.brain.onNoise?.(p, e); continue; }
      scare(this, p, e.pos.x, e.pos.z, e.src?.isPlayer || e.src?.pos ? e.src : e.by || null, level * (1 - d / r * 0.5));
    }
    if (k === 'shot' || k === 'explosion') V.traffic?.panic?.(e.pos, Math.min(r, 160));
  }
  _crime(e) {
    if (!e?.pos || e.fromPeds) return;
    const k = e.kind;
    if (k === 'carjack' || k === 'hitPed' || k === 'murder' || k === 'assault' || k === 'copMurder') {
      for (const p of this.near(e.pos.x, e.pos.z, k === 'hitPed' ? 30 : 45)) {
        if (p.dead || p === e.victim || p.vehicle) continue;
        if (p.gangster && e.victim?.gang === p.gang && e.by?.isPlayer) { this.angerGang(p, e.by); continue; }
        if (p.brain) { p.brain.onCrime?.(p, e); continue; }
        if (p.state === 'walk' || p.state === 'idle' || p.state === 'wait' || p.state === 'chat' || p.state === 'sit' || p.state === 'wander') scare(this, p, e.pos.x, e.pos.z, e.by, k === 'hitPed' ? 0.8 : 1.2);
      }
    }
  }
  /** A crime against p by `by`: reported to the police if anyone saw it (the victim counts if they live). */
  report(p, kind, by) {
    if (!by?.isPlayer || p.reported?.[kind] > this.time - 10) return;
    (p.reported ||= {})[kind] = this.time;
    V.events.emit('crime', { kind, pos: p.pos.clone(), by, victim: p, fromPeds: true });
  }
  /** The gang of p is out for `who` (60 s): every member nearby fights. */
  angerGang(p, who) {
    if (!p.gang || !who) return;
    const a = this.anger.get(p.gang);
    if (!a || a.target !== who) this.anger.set(p.gang, { until: this.time + 60, target: who });
    else a.until = this.time + 60;
    for (const q of this.near(p.pos.x, p.pos.z, 80)) {
      if (q.gang !== p.gang || q.dead || q.vehicle || q.brain || q.state === 'shoot' || q.state === 'fight' || q.state === 'down' || q.state === 'getup') continue;
      this.leaveSpot(q);
      setState(this, q, q.armed() && !q.melee() ? 'shoot' : 'fight', { target: who });
      if (this.rand() < 0.4) this.say(q, 'hostile', 2);
    }
  }

  // ---- damage --------------------------------------------------------------------------------------------------------------
  _hit(p, dmg, part, dir, attacker, info) {
    if (p.removed) return;
    const point = info.point || partCenter(p.fig, Math.max(0, PART_NAMES.indexOf(part)), _w);
    if (dir && !info.noBlood && !info.fall) V.fx?.blood?.(point.clone ? point : _w.copy(point), dir, { head: part === 'head', heavy: dmg > 40 || info.explosion, melee: !!info.melee });
    p.fig.blood = Math.min(1, (p.fig.blood || 0) + (info.melee ? 0.04 : info.bullet ? 0.16 : 0.08) * (dmg > 30 ? 1.6 : 1));
    if (p.dead) {
      // a body: it takes the push
      if (p.rag && dir) p.rag.push(dir, info.bullet ? 10 : info.melee ? 9 : 14, part);
      return;
    }
    if (V.cheats?.peds === 'god' && !attacker?.isPlayer) return;
    // (like player.hit: the part multiplies; armour soaks up most of the rest)
    let d = dmg;
    if (part === 'head') d *= info.bullet ? 4 : info.melee ? 1.5 : 1;
    else if (part !== 'torso') d *= info.bullet ? 0.65 : 1;
    if (p.armor > 0 && !info.fall && part !== 'head') { const a = Math.min(p.armor, d * 0.7); p.armor -= a; d -= a; }
    p.hp -= d;
    p.flash = 1;
    p.lastHit = { dir: dir ? dir.clone?.() || null : null, part, info, by: attacker, t: this.time };
    if (attacker) p.wasHitBy = attacker;
    if ((part === 'legL' || part === 'legR') && info.bullet && this.rand() < 0.7) p.limp = true;
    if (p.vehicle && p.hp > 0) return;
    if (p.hp <= 0) {
      const cause = info.bullet ? 'shot' : info.vehicle ? 'run over' : info.explosion ? 'blown up' : info.fall ? 'fell' : info.melee ? 'beaten' : 'killed';
      this._die(p, cause, attacker, dir, part, info);
      return;
    }
    // heavy blows knock people down
    if (info.melee && (info.heavy || d >= 24 || info.knock) && dir && !p.vehicle) {
      this._knock(p, _v.set(dir.x * 16, 9, dir.z * 16), attacker);
      if (attacker?.isPlayer) this.report(p, 'assault', attacker);
      return;
    }
    hurt(this, p, attacker, { dir: dir ? { x: dir.x, z: dir.z } : null, melee: !!info.melee, bullet: !!info.bullet });
  }

  _knock(p, vel, from) {
    if (p.removed || p.vehicle) return;
    const carHit = from?.def && from.pos ? from : null;
    if (p.rag) { p.rag.setVel(vel, carHit); p.downT = 0; return; }
    this.leaveSpot(p);
    this._poseNow(p);
    p.rag = this.rags.start(p.fig, { vel, carHit, onSleep: (r) => this._ragSleep(p, r) });
    p.ragdoll = true;
    p.fig.item = 0;
    if (p.carry && !p.dead && p.carry !== ITEM.phone) { p.dropped = p.carry; p.carry = 0; p.armsWalk = null; }
    if (!p.dead) { p.state = 'down'; p.st = { t: 0, after: p.st?.after }; p.downT = 0; }
  }

  _die(p, cause, attacker, dir, part, info = {}) {
    if (p.dead) return;
    p.dead = true; p.hp = 0; p.state = 'dead'; p.deadT = 0;
    p.fig.blood = Math.max(p.fig.blood, info.explosion ? 0.9 : 0.45);
    this.leaveSpot(p);
    // into a ragdoll (if not already one), pushed the way the blow went
    if (p.vehicle) {
      const v = p.vehicle;
      if (v.dead || v.kind === 'bike' || v.kind === 'boat') { this._exit(p, true); }
      else { p.slumped = true; }
    }
    if (!p.vehicle) {
      const push = dir ? (info.bullet ? (part === 'head' ? 15 : 10) * (info.pellets ? 2 : 1) : info.melee ? 14 : info.explosion ? 0 : 6) : 0;
      if (!p.rag) {
        _u.copy(p.vel); _u.y = Math.max(0, _u.y);
        this._poseNow(p);
        p.rag = this.rags.start(p.fig, { vel: _u, onSleep: (r) => this._ragSleep(p, r) });
        p.ragdoll = true;
      }
      if (push && dir) p.rag.push(dir, push, part || 'torso');
      p.rag.maxT = 14;
    }
    p.fig.item = 0;
    // things they had on them
    const amt = Math.round((p.cat === 'business' ? 30 + this.rand() * 120 : p.gangster ? 20 + this.rand() * 80 : 4 + this.rand() * 40));
    if (this.rand() < 0.8) this.drop('money', p.pos, { amount: amt });
    if (p.armed() && !p.brain?.noDrop) this.drop('weapon', p.pos, { weapon: p.weapon, ammo: p.weapon === 'pistol' ? 17 : 30 });
    if (this.rand() < 0.4) V.audio?.scream?.(p.pos, true);
    // the record, the police, the stats
    const by = attacker?.isPlayer ? attacker : attacker?.driver?.isPlayer ? attacker.driver : attacker;
    V.events.emit('death', { ped: p, cause, attacker: by });
    if (by?.isPlayer) {
      const st = V.stats || (V.stats = {});
      st.kills = (st.kills || 0) + 1;
      if (p.team === 'cops') st.copKills = (st.copKills || 0) + 1;
      const witnessed = p.team === 'cops' || this.list.some((q) => q !== p && !q.dead && Math.abs(q.pos.x - p.pos.x) < 70 && Math.abs(q.pos.z - p.pos.z) < 70);
      if (witnessed) V.events.emit('crime', { kind: p.team === 'cops' ? 'copMurder' : 'murder', pos: p.pos.clone(), by, victim: p, fromPeds: true });
    }
    if (p.gangster && by) this.angerGang(p, by);
    // everyone near screams and runs
    for (const q of this.near(p.pos.x, p.pos.z, 40)) if (q !== p && !q.dead) { if (q.brain) q.brain.onDeath?.(q, p, by); else scare(this, q, p.pos.x, p.pos.z, by, 1.2); }
    this._unbubble(p);
  }

  _ragSleep(p, r) {
    if (p.dead) {
      const c = r.center;
      const g = this.ground(c.x, c.y, c.z);
      if (c.y - g < 2.5) V.fx?.pool?.(c.x, c.z, g, 1 + this.rand() * 0.8);
    }
  }

  /** Knocked over: lie there a moment (the ragdoll), then get up and run (or fight). */
  _down(p, dt) {
    const r = p.rag;
    if (p.state === 'down') {
      p.downT += dt;
      if (r) { const c = r.center; p.pos.set(c.x, this.ground(c.x, c.y, c.z), c.z); }
      if ((r?.asleep && p.downT > 1.2) || p.downT > 6) {
        // stand up from wherever the body lies
        p.getup = new GetUp(p.fig, r, p.fig.scale, this.ground(p.pos.x, p.pos.y + 2, p.pos.z));
        r?.stop(); p.rag = null;
        p.state = 'getup'; p.st = { t: 0, after: p.st.after };
      }
      return;
    }
    const g = p.getup;
    if (!g || g.update(dt, p.fig, p.P)) {
      p.ragdoll = false; p.getup = null;
      p.pos.set(g ? g.x : p.pos.x, g ? g.y : p.pos.y, g ? g.z : p.pos.z); p.heading = g ? g.heading : p.heading;
      p.vel.set(0, 0, 0); p.grounded = true;
      const after = p.st.after;
      const by = p.wasHitBy;
      if (after === 'fight' && by && !by.dead) setState(this, p, p.armed() && !p.melee() ? 'shoot' : 'fight', { target: by });
      else if (p.gangster && by) this.angerGang(p, by);
      else { if (by) p.threat = { x: by.pos?.x ?? p.pos.x, z: by.pos?.z ?? p.pos.z, by, t: this.time }; setState(this, p, 'flee', { secs: 8 }); if (this.rand() < 0.5) this.say(p, p.carjacked ? 'carjack' : 'scared', 2); }
      this.joinNav(p, 40);
    } else { p.pos.set(g.x, g.y, g.z); p.heading = g.heading; }
  }

  // ---- in vehicles -------------------------------------------------------------------------------------------------------
  _enter(p, veh, seat = 0) {
    if (!veh || p.dead) return false;
    if (veh.enter ? !veh.enter(p, seat) : (seat === 0 && (veh.driver = p, false))) return false;
    this.leaveSpot(p);
    p.vehicle = veh; p.seat = seat; p.vel.set(0, 0, 0);
    if (p.rag) { p.rag.stop(); p.rag = null; p.ragdoll = false; }
    if (!p.brain) setState(this, p, 'drive');
    V.events.emit('vehicle:enter', { who: p, veh });
    return true;
  }
  _exit(p, force = false) {
    const veh = p.vehicle;
    if (!veh) return;
    const seat = p.seat;
    if (veh.leave) veh.leave(p); else if (veh.driver === p) veh.driver = null;
    p.vehicle = null; p.seat = -1; p.slumped = false;
    const e = veh.exitPoint?.(seat >= 0 ? seat : 'left', _v);
    if (e) p.pos.set(e.x, Number.isFinite(e.y) ? e.y : veh.pos.y, e.z); else p.pos.set(veh.pos.x + 4, veh.pos.y, veh.pos.z);
    p.heading = veh.heading ?? p.heading;
    p.vel.copy(veh.vel || _v.set(0, 0, 0)).multiplyScalar(0.6); p.vel.y = 0;
    p.grounded = false;
    if (!p.brain && !p.dead) { if (!this.joinNav(p, 40)) setState(this, p, 'idle', { secs: 2 }); else setState(this, p, 'walk'); }
    V.events.emit('vehicle:exit', { who: p, veh });
    void force;
  }
  _inVehicle(p, dt) {
    const v = p.vehicle;
    if (v.removed) { p.vehicle = null; this.remove(p); return; }
    p.pos.copy(v.pos);
    p.heading = v.heading ?? p.heading;
    p.vel.copy(v.vel);
    if (p.brain && !p.dead) p.brain.update(p, dt);
    // shot at the wheel: get out and run
    if (p.bail != null && !p.dead && !p.brain && (p.bail -= dt) <= 0) {
      p.bail = null;
      this._exit(p, true);
      const by = p.wasHitBy;
      if (by?.pos) p.threat = { x: by.pos.x, z: by.pos.z, by, t: this.time };
      setState(this, p, 'flee', { secs: 10 });
      this.say(p, 'scared', 2);
    }
  }

  /** Traffic's stand-in driver was pulled out (or got out): a real person steps out of the car. */
  fromDriver(driver, veh) {
    if (!driver || driver.ped) return driver?.ped || null;
    const rec = this.drivers.get(driver);
    const e = veh.exitPoint?.(0, _v) || _v.set(veh.pos.x + 4, veh.pos.y, veh.pos.z);
    const p = this.spawn({ x: e.x, z: e.z, y: Number.isFinite(e.y) ? e.y : undefined, heading: veh.heading, outfit: rec ? rec.fig.cell : undefined, set: veh.type === 'police' ? 'cop' : undefined, kind: veh.type === 'police' ? 'cop' : 'civ', state: 'none' });
    if (!p) return null;
    if (rec) { p.fig.hat = rec.fig.hat; p.fig.scale = rec.fig.scale; this.crowd.remove(rec.fig); this.drivers.delete(driver); }
    driver.ped = p;
    p.carjacked = true;
    p.tough = Math.max(p.tough, driver.tough || 0);
    setState(this, p, 'idle', { secs: 1 });
    // posed as if still sitting, so the pull out starts from the seat
    if (veh.seatWorld) {
      veh.seatWorld(0, _m);
      p.fig.rootMat = _m2.copy(_m).multiply(_m.makeTranslation(0, -1.7, 0));
      p.P.legs = Math.PI / 2 - 0.2; p.P.arms = 'drive';
      poseFigure(p.fig, p.P);
      p.fig.rootMat = null;
    }
    return p;
  }
  /** A traffic driver was shot through the glass: a real person in the seat takes the hit (and bails out if alive). */
  _shootDriver(w, veh, seat, dmg, part, dir, attacker, info = {}) {
    const rec = this.drivers.get(w);
    if (!rec || veh.seats?.[seat] !== w) return;
    veh.leave?.(w);
    w.dead = true;
    const p = this.spawn({ x: veh.pos.x, z: veh.pos.z, y: veh.pos.y, outfit: rec.fig.cell, state: 'none' });
    this.crowd.remove(rec.fig); this.drivers.delete(w);
    if (!p) return;
    p.fig.hat = rec.fig.hat; p.fig.scale = rec.fig.scale;
    w.ped = p;
    this._enter(p, veh, seat);
    p.hit(dmg, part, dir, attacker, info);
    if (!p.dead) { p.bail = 0.5 + this.rand() * 0.6; p.wasHitBy = attacker; }
  }
  knockDriver(driver, vel) {
    const p = driver?.ped || this.fromDriver(driver, driver?.veh);
    if (!p) return;
    p.knock(vel, V.player);
    p.st.after = p.tough > 0.8 ? 'fight' : 'flee';
    p.wasHitBy = V.player;
    this.say(p, 'carjack', 2.2);
  }

  // ---- drawing -----------------------------------------------------------------------------------------------------------
  lateUpdate(dt) {
    if (!this.nav) return;
    // behind the title screen the city still lives (the session only runs gameplay in play)
    const now = performance.now(), real = Math.min(0.05, (now - (this.lastNow || now)) / 1000);
    this.lastNow = now;
    if (V.session?.state === 'title' && real > 0) { this.update(real); dt = real; }
    const t0 = performance.now();
    this.rags.update(dt);
    for (const h of this.rigs) h._write(dt);
    const cam = this.world.camera.position;
    for (const p of this.list) {
      const f = p.fig;
      f.flash = p.flash;
      if (p.rag) {
        if (!p.rag.asleep || !p.ragWritten) { p.rag.writeMats(f.mats); p.ragWritten = p.rag.asleep; const c = p.rag.center; p.pos.x = c.x; p.pos.z = c.z; if (p.dead) p.pos.y = Math.min(p.pos.y, c.y); }
        if (p.dead && p.deadT > 50) f.fade = Math.max(0, 1 - (p.deadT - 50) / 10);
        continue;
      }
      if (p.state === 'getup') continue; // (posed by GetUp)
      if (p.dead && !p.rag) { this._poseDead(p); continue; }
      if (p.far && p.acc > 0) continue; // posed at their own (lower) rate
      this._poseNow(p);
    }
    this._drawDrivers(cam);
    this._updatePickups(dt);
    this._updateBubbles(dt);
    this.crowd.update(this.world.camera);
    this.stats.drawn = this.crowd.drawn; this.stats.rags = this.rags.awake;
    this.stats.lateMs = performance.now() - t0;
  }
  _poseNow(p) {
    const f = p.fig;
    if (p.vehicle) { this._poseSeated(f, p.vehicle, p.seat, p.P, p.slumped); return; }
    f.x = p.pos.x; f.y = p.pos.y; f.z = p.pos.z; f.heading = p.heading; f.rootMat = null;
    poseFigure(f, p.P);
  }
  _poseDead(p) { const f = p.fig; f.x = p.pos.x; f.y = p.pos.y; f.z = p.pos.z; f.heading = p.heading; p.P.fall = 1; p.P.stride = 0; poseFigure(f, p.P); }
  _poseSeated(f, veh, seat, P, slumped) {
    if (!veh.seatWorld) return;
    veh.seatWorld(Math.max(0, seat), _m);
    const bike = veh.kind === 'bike';
    _m.multiply(_m2.makeTranslation(0, -1.65, 0));
    f.rootMat = _m;
    P.stride = 0; P.walk = 0; P.hipY = 2; P.crouch = 0; P.lie = 0; P.fall = 0; P.roll = 0; P.aimDir = null; P.tilt = 0; P.twist = 0;
    P.legs = bike ? 1.15 : Math.PI / 2 - 0.15; P.spread = bike ? 0.3 : 0.05;
    P.arms = bike ? 'bike' : seat === 0 ? 'drive' : 'sit';
    P.lean = slumped ? 0.7 : bike ? 0.28 : -0.05; P.look = slumped ? 0.6 : 0; P.headYaw = slumped ? 0.4 : Math.sin(this.time * 0.3 + (P.seed || 0)) * 0.25;
    poseFigure(f, P);
    f.rootMat = null;
    const vis = veh.kind !== 'car' || !veh.def?.hideDriver;
    f.hidden = !vis;
  }
  /** Everyone sitting in a vehicle who isn't a Ped of ours (traffic's drivers): a figure in the seat. */
  _drawDrivers(cam) {
    const vs = V.vehicles?.list;
    if (!vs) return;
    const mark = (this.dmark = (this.dmark || 0) + 1);
    for (const v of vs) {
      if (!v.seats || v.removed) continue;
      const dx = v.pos.x - cam.x, dz = v.pos.z - cam.z;
      if (dx * dx + dz * dz > 300 * 300) continue;
      for (let i = 0; i < v.seats.length; i++) {
        const w = v.seats[i];
        if (!w || w.isPlayer || w instanceof Ped || w.debug || w.dead) continue;
        let rec = this.drivers.get(w);
        if (!rec) {
          if (this.crowd.figs.length >= MAX_FIGS) continue;
          const set = v.type === 'police' ? 'cop' : v.type === 'ambulance' ? 'street' : v.type === 'taxi' ? 'street' : this._setAt(v.pos.x, v.pos.z);
          const cell = this.pickOutfit(set), od = OUTFITS[cell];
          const fig = Crowd.figure({ cell, hat: (od.hats || [0])[Math.floor(this.rand() * (od.hats || [0]).length)], scale: 0.94 + this.rand() * 0.08 });
          rec = { fig, P: { t: 0, seed: this.rand() * 10 }, mark };
          w.tough = this.rand();
          // bullets can find them: the proxy turns into a real person in the seat when hit
          const sys = this, seat = i, veh = v;
          fig.owner = rec.proxy = { isDriverProxy: true, driver: w, kind: 'civ', team: 'civ', dead: false, vehicle: v, seat: i, hp: 100, maxHp: 100, armor: 0, get pos() { return veh.pos; }, heading: 0, vel: veh.vel,
            hit: (dmg, part, dir, attacker, info) => sys._shootDriver(w, veh, seat, dmg, part, dir, attacker, info), knock() {}, die() {} };
          this.drivers.set(w, rec);
          this.crowd.add(fig);
        }
        rec.mark = mark;
        rec.P.t = this.time;
        this._poseSeated(rec.fig, v, i, rec.P, false);
      }
    }
    for (const [w, rec] of this.drivers) if (rec.mark !== mark) { this.crowd.remove(rec.fig); this.drivers.delete(w); }
  }

  // ---- for brains (police, missions) ------------------------------------------------------------------------------------
  /** Walk/run towards (x, z) this frame (call every frame). */
  moveTo(p, x, z, speed = RUN) { return steer(p.want, p, x, z, speed, 1.5); }
  faceTo(p, x, z) { p.want.face = { x, z }; }
  /** Aim at a target (Ped/player/Vector3): the pose and the gun follow. */
  aimAt(p, target) {
    const tp = target?.pos || target;
    if (!tp) return;
    const ty = (tp.y || 0) + (target?.pos ? 3.1 : 0);
    handPoint(p.fig, _w);
    const d = (p._aimDir ||= new THREE.Vector3()).set(tp.x - _w.x, ty - _w.y, tp.z - _w.z).normalize();
    const it = this.itemFor(p.weapon);
    p.P.arms = it === ITEM.pistol || !it ? 'pistol' : 'rifle'; p.P.aimDir = d; p.P.aimPitch = Math.asin(Math.max(-1, Math.min(1, d.y))); p.P.twist = p.P.arms === 'rifle' ? 0.25 : 0.1;
    p.want.face = tp;
    p.fig.item = it || ITEM.pistol;
  }
  /** Fire the ped's weapon at a target (aims first). */
  shoot(p, target) {
    this.aimAt(p, target);
    handPoint(p.fig, _w);
    this.fire(p, target, _w, p._aimDir);
  }
  setState(p, s, o) { setState(this, p, s, o); }
  /** Can a see b? (eye to chest, through nothing solid) */
  lineOfSight(a, b) {
    const ax = a.pos.x, ay = a.pos.y + 4.4, az = a.pos.z;
    const bx = b.pos.x, by = (b.pos.y || 0) + 3, bz = b.pos.z;
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
    if (d < 1) return true;
    const hit = V.phys?.ray?.(ax, ay, az, dx / d, dy / d, dz / d, d - 1, { skip: (bx2) => bx2.vehicle === a.vehicle || bx2.vehicle === b.vehicle || bx2.kerb || bx2.prop });
    return !hit;
  }

  /** Fire p's gun from `origin` along `dir` (with the weapon's spread). Uses V.combat when there is one. */
  fire(p, target, origin, dir) {
    const w = this.weaponStats(p.weapon);
    const spread = (w.spread || 3) * (p.kind === 'swat' ? 0.6 : p.kind === 'cop' ? 0.8 : 1.15) * (Math.hypot(p.vel.x, p.vel.z) > 3 ? 1.6 : 1);
    const n = w.pellets || 1;
    for (let k = 0; k < (V.combat?.fire ? 1 : n); k++) {
      _dir.copy(dir);
      const a = this.rand() * Math.PI * 2, r = Math.sqrt(this.rand()) * spread * Math.PI / 180;
      _u.set(-dir.z, 0, dir.x).normalize();
      _v.crossVectors(_u, dir).normalize();
      _dir.addScaledVector(_u, Math.cos(a) * r).addScaledVector(_v, Math.sin(a) * r).normalize();
      if (V.combat?.fire) { V.combat.fire(p, origin.clone(), _dir.clone(), p.weapon || 'pistol'); continue; }
      // (no combat system yet: a plain hitscan)
      this._hitscan(p, origin, _dir, w);
    }
    if (!V.combat?.fire) {
      try { playShot(w.kind || 'pistol', origin.clone(), false, false); } catch (e) { /* audio not ready */ }
      V.events.emit('noise', { pos: origin.clone(), r: 140, kind: 'shot', src: p });
    }
  }
  _hitscan(p, o, d, w) {
    const wall = V.phys?.ray?.(o.x, o.y, o.z, d.x, d.y, d.z, 300, { skip: (b) => b.vehicle === p.vehicle });
    const max = wall ? wall.d : 300;
    let best = this.ray(o, d, max, (q) => q === p), bd = best ? best.d : max;
    const P = V.player;
    if (P && !P.dead && P.pos) {
      // the player as a cylinder
      const cx = P.pos.x - o.x, cz = P.pos.z - o.z, t = cx * d.x + cz * d.z;
      if (t > 0 && t < bd) {
        const qx = o.x + d.x * t - P.pos.x, qz = o.z + d.z * t - P.pos.z, qy = o.y + d.y * t - P.pos.y;
        if (qx * qx + qz * qz < 1.3 && qy > 0 && qy < 5.4) { best = { ped: P, part: qy > 4.2 ? 'head' : qy < 2 ? 'legL' : 'torso', d: t, point: new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t) }; bd = t; }
      }
    }
    if (best) best.ped.hit(w.dmg || 20, best.part, d.clone(), p, { bullet: true, point: best.point });
  }
  /** A punch or kick landing (or not). */
  meleeHit(p, tg, kick) {
    if (V.combat?.melee && !kick) { const r = V.combat.melee(p, p.melee() ? p.weapon : 'fists'); if (r !== undefined) return; }
    const dx = tg.pos.x - p.pos.x, dz = tg.pos.z - p.pos.z, d = Math.hypot(dx, dz);
    if (d > 3.8 || Math.abs((tg.pos.y || 0) - p.pos.y) > 3) { V.audio?.punch?.(p.pos, false); return; }
    const facing = Math.abs(wrap(Math.atan2(dx, dz) - p.heading)) < 1.0;
    if (!facing) return;
    _dir.set(dx / d, 0.15, dz / d);
    const bat = p.melee();
    const dmg = bat ? 22 + this.rand() * 10 : kick ? 12 + this.rand() * 6 : 6 + this.rand() * 5;
    tg.hit(dmg, this.rand() < 0.3 ? 'head' : 'torso', _dir.clone(), p, { melee: true, heavy: kick || bat, point: _w.set(tg.pos.x, (tg.pos.y || 0) + 3.6, tg.pos.z).clone() });
    if (kick && tg.knock && !tg.isPlayer && this.rand() < 0.35) tg.knock(_v.set(_dir.x * 14, 8, _dir.z * 14), p);
    else if ((kick || bat) && tg.isPlayer && this.rand() < 0.25) tg.knock?.(_v.set(_dir.x * 10, 6, _dir.z * 10), p);
    V.audio?.punch?.(tg.pos, kick || bat);
    V.cam?.shake?.(tg.isPlayer ? 0.3 : 0);
  }

  // ---- bullets ---------------------------------------------------------------------------------------------------------------
  /** The first person (not the player) a ray hits: {ped, part, d, point} | null. */
  ray(origin, dir, max = 1000, skip) {
    const r = this.crowd.ray(origin, dir, max, (f) => !f.owner || f.owner.removed || (skip && skip(f.owner)));
    if (!r) return null;
    return { ped: r.fig.owner, part: r.part, d: r.d, point: r.point };
  }

  // ---- the player's ragdoll -------------------------------------------------------------------------------------------------
  /**
   * Let an engine CharacterModel (the player) fall as a ragdoll from its current pose.
   * o: {vel (Vector3, studs/s), carHit (vehicle), push: {dir, speed, part}, onSleep(handle)}
   * The handle: stop() (back to animation), center, asleep, getUp(onDone(x, y, z, heading)), push(dir, speed, part), faceUp(), heading()
   */
  ragdollRig(model, o = {}) {
    const rig = rigModel(model).read();
    const rag = this.rags.start(rig, { vel: o.vel, carHit: o.carHit || null, push: o.push, onSleep: () => o.onSleep?.(handle), maxT: o.maxT || 10 });
    const sys = this;
    const handle = {
      rag, rig,
      get center() { return rag.center; },
      get asleep() { return rag.asleep; },
      get active() { return !rag.stopped || !!handle.gu; },
      push: (dir, speed, part) => rag.push(dir, speed, part),
      faceUp: () => rag.faceUp(), heading: () => rag.heading(),
      /** Stand back up (about 1.1 s); onDone(x, y, z, heading) when on your feet. */
      getUp(onDone) {
        if (handle.gu) return;
        const c = rag.center;
        handle.gu = new GetUp(rig, rag, 1, sys.ground(c.x, c.y + 2, c.z));
        handle.onDone = onDone;
        rag.stop();
      },
      stop() { rag.stop(); handle.gu = null; rig.reset(); sys.rigs.delete(handle); },
      /** (called by peds.lateUpdate) */
      _write(dt) {
        if (handle.gu) {
          if (handle.gu.update(dt, handle.fig, handle.P)) { const g = handle.gu; handle.gu = null; rig.reset(); sys.rigs.delete(handle); handle.onDone?.(g.x, g.y, g.z, g.heading); return; }
          rig.write();
          return;
        }
        if (!rag.stopped && (!rag.asleep || !handle.wrote)) { rag.writeMats(rig.mats); rig.write(); handle.wrote = rag.asleep; }
      },
    };
    handle.fig = { mats: rig.mats, scale: 1, x: 0, y: 0, z: 0, heading: 0, item: 0, itemMat: new THREE.Matrix4() };
    handle.P = { t: 0 };
    this.rigs.add(handle);
    return handle;
  }

  // ---- pickups (money and guns from the dead) -----------------------------------------------------------------------------
  _initPickups(scene) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 10, 64, 64, 62); gr.addColorStop(0, 'rgba(120,255,120,0.95)'); gr.addColorStop(0.6, 'rgba(40,200,60,0.85)'); gr.addColorStop(1, 'rgba(20,120,30,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f4fff0'; g.font = 'bold 84px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 64, 68);
    g.strokeStyle = '#0a5a14'; g.lineWidth = 3; g.strokeText('$', 64, 68);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    this.money = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.7, 1.7), mat, 64);
    this.money.count = 0; this.money.frustumCulled = false; this.money.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.money.name = 'peds-money';
    scene.add(this.money);
  }
  /** Leave a pickup: 'money' {amount} or 'weapon' {weapon, ammo}. */
  drop(kind, pos, o = {}) {
    const a = this.rand() * Math.PI * 2;
    const x = pos.x + Math.cos(a) * 1.5, z = pos.z + Math.sin(a) * 1.5;
    const pk = { kind, x, z, y: this.ground(x, (pos.y || 0) + 2, z), t: 0, amount: o.amount || 0, weapon: o.weapon, ammo: o.ammo || 0, mat: new THREE.Matrix4() };
    this.pickups.push(pk);
    if (this.pickups.length > 60) this.pickups.shift();
    V.events.emit('pickup', { kind, amount: pk.amount, weapon: pk.weapon, pos: new THREE.Vector3(x, pk.y, z) });
    return pk;
  }
  _updatePickups(dt) {
    const P = V.player, list = this.pickups;
    let n = 0;
    const extra = this.crowd.extra || (this.crowd.extra = []);
    extra.length = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const pk = list[i];
      pk.t += dt;
      if (pk.t > 90) { list.splice(i, 1); continue; }
      if (P && !P.dead && P.pos && Math.abs(P.pos.x - pk.x) < 3 && Math.abs(P.pos.z - pk.z) < 3 && Math.abs(P.pos.y - pk.y) < 4 && pk.t > 0.4) {
        if (pk.kind === 'money') { P.money = (P.money || 0) + pk.amount; V.hud?.money?.(pk.amount); }
        else if (pk.kind === 'weapon') { const ok = V.weapons?.give?.(pk.weapon, pk.ammo); if (ok === false) continue; V.hud?.notify?.(`Picked up: ${pk.weapon}`); }
        V.audio?.pickup?.(_v.set(pk.x, pk.y, pk.z));
        list.splice(i, 1); continue;
      }
      const spin = this.time * 2.4 + i, bob = 1.2 + Math.sin(this.time * 3 + i) * 0.25;
      if (pk.kind === 'money' && n < 64) {
        _q.setFromAxisAngle(_s.set(0, 1, 0), spin);
        _m.compose(_p.set(pk.x, pk.y + bob, pk.z), _q, _s.set(1, 1, 1));
        this.money.setMatrixAt(n++, _m);
      } else if (pk.kind === 'weapon') {
        // (drawn by the crowd's item mesh, lying and turning)
        const it = this.itemFor(pk.weapon);
        _q.setFromEuler(_e2.set(Math.PI / 2, spin, 0, 'YXZ'));
        pk.mat.compose(_p.set(pk.x, pk.y + bob, pk.z), _q, _s.set(1, 1, 1));
        extra.push({ item: it, mat: pk.mat });
      }
    }
    this.money.count = n; this.money.instanceMatrix.needsUpdate = true; this.money.visible = n > 0;
  }

  // ---- chat bubbles (the 2008 kind) ---------------------------------------------------------------------------------------
  _initBubbles(scene) {
    this.bubbles = [];
    for (let i = 0; i < 8; i++) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 128;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
      sp.visible = false; sp.renderOrder = 5; sp.name = 'peds-bubble';
      scene.add(sp);
      this.bubbles.push({ sp, c, tex, p: null, t: 0, secs: 0 });
    }
  }
  /** Say something (a LINES kind, or the words themselves) in a bubble over the head. */
  say(p, kind, secs = 2.2) {
    if (!p || p.dead || !this.bubbles) return;
    const cam = this.world.camera.position;
    if (Math.hypot(p.pos.x - cam.x, p.pos.z - cam.z) > 90) return;
    const lines = LINES[kind];
    const text = lines ? lines[Math.floor(this.rand() * lines.length)] : String(kind);
    let b = this.bubbles.find((q) => q.p === p) || this.bubbles.find((q) => !q.p) || this.bubbles.reduce((a, q) => (q.t > a.t ? q : a));
    b.p = p; b.t = 0; b.secs = secs;
    const g = b.c.getContext('2d');
    g.clearRect(0, 0, 512, 128);
    g.font = 'bold 34px Arial';
    const w = Math.min(490, g.measureText(text).width + 40), x0 = (512 - w) / 2;
    g.fillStyle = 'rgba(255,255,255,0.96)'; g.strokeStyle = 'rgba(40,40,40,0.9)'; g.lineWidth = 3;
    const r = 18, y0 = 10, h = 72;
    g.beginPath(); g.moveTo(x0 + r, y0); g.lineTo(x0 + w - r, y0); g.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r); g.lineTo(x0 + w, y0 + h - r); g.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    g.lineTo(276, y0 + h); g.lineTo(256, y0 + h + 30); g.lineTo(240, y0 + h); g.lineTo(x0 + r, y0 + h); g.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r); g.lineTo(x0, y0 + r); g.quadraticCurveTo(x0, y0, x0 + r, y0); g.closePath();
    g.fill(); g.stroke();
    g.fillStyle = '#141414'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, y0 + h / 2 + 2);
    b.tex.needsUpdate = true;
    b.sp.scale.set(8, 2, 1);
    b.sp.visible = true;
    p.saying = text;
  }
  _unbubble(p) { if (!this.bubbles) return; for (const b of this.bubbles) if (b.p === p) { b.p = null; b.sp.visible = false; } }
  _updateBubbles(dt) {
    for (const b of this.bubbles) {
      if (!b.p) continue;
      b.t += dt;
      if (b.t > b.secs || b.p.removed || b.p.dead) { b.p = null; b.sp.visible = false; continue; }
      const e = b.p.fig.mats[0].elements;
      b.sp.position.set(e[12], e[13] + 2.4, e[14]);
      b.sp.material.opacity = Math.min(1, (b.secs - b.t) * 3, b.t * 8);
    }
  }

  // ---- tests and debugging ------------------------------------------------------------------------------------------------
  _hooks() {
    const sys = this;
    const add = () => {
      if (!window.__vc) return setTimeout(add, 500);
      window.__vc.peds = {
        sys, Ped,
        count: () => ({ list: sys.list.length, alive: sys.list.filter((p) => !p.dead).length, figs: sys.crowd.figs.length, drawn: sys.crowd.drawn, rags: sys.rags.list.length, awake: sys.rags.awake, drivers: sys.drivers.size, ms: +sys.stats.ms.toFixed(2), lateMs: +(sys.stats.lateMs || 0).toFixed(2), states: sys.list.reduce((a, p) => { a[p.state] = (a[p.state] || 0) + 1; return a; }, {}) }),
        spawn: (o) => sys.spawn(o),
        /** a crowd standing around a point (for screenshots) */
        crowdAt: (x, z, n = 20, r = 12, o = {}) => { const out = []; for (let i = 0; i < n; i++) { const a = i * 2.4, rr = Math.sqrt((i + 0.5) / n) * r; const p = sys.spawn({ x: x + Math.cos(a) * rr, z: z + Math.sin(a) * rr, heading: sys.rand() * 6.28, ...o }); if (p) out.push(p); } return out; },
        noise: (x, z, r = 120, kind = 'shot') => V.events.emit('noise', { pos: new THREE.Vector3(x, K.GROUND + 3, z), r, kind }),
        kill: (p, dir) => p.hit(500, 'torso', dir || new THREE.Vector3(1, 0.2, 0).normalize(), V.player, { bullet: true }),
        clear: () => { for (const p of [...sys.list]) sys.remove(p); sys.initial = true; },
        stop: (on = true) => { sys.frozen = on; },
      };
    };
    add();
  }
}

const _e2 = new THREE.Euler();

// ---- getting up -------------------------------------------------------------------------------------------------------------
// From the ragdoll's last shape: blend into lying flat (on the back or the front), then sit/push up, crouch, stand.
const KEYS_UP = [
  { t: 0, hipY: 0.55, legs: Math.PI / 2, lean: -Math.PI / 2 + 0.08, armF: -0.2 },
  { t: 0.38, hipY: 0.55, legs: Math.PI / 2 - 0.1, lean: -0.15, armF: -0.6 },
  { t: 0.68, hipY: 1.15, legs: 1.25, lean: 0.55, armF: 0.6 },
  { t: 1, hipY: 2, legs: 0, lean: 0, armF: 0.05 },
];
const KEYS_DOWN = [
  { t: 0, hipY: 0.55, legs: -Math.PI / 2 + 0.1, lean: Math.PI / 2 - 0.08, armF: Math.PI / 2 },
  { t: 0.35, hipY: 1.0, legs: -0.7, lean: 1.15, armF: 1.3 },
  { t: 0.68, hipY: 1.2, legs: 1.1, lean: 0.6, armF: 0.7 },
  { t: 1, hipY: 2, legs: 0, lean: 0, armF: 0.05 },
];
const _bp = new THREE.Vector3(), _bq = new THREE.Quaternion(), _bs = new THREE.Vector3(), _cp = new THREE.Vector3(), _cq = new THREE.Quaternion();
export class GetUp {
  /** body: {mats} as the ragdoll left it; rag: the ragdoll; groundY: where they lie. */
  constructor(body, rag, scale, groundY) {
    this.from = body.mats.map((m) => m.clone());
    this.up = rag ? rag.faceUp() : true;
    const hd = rag ? rag.heading() : 0;
    // face up: the feet point away from the head (forward = hips -> feet); face down: forward = towards the head
    this.heading = this.up ? hd + Math.PI : hd;
    const P = rag?.pos;
    this.x = P ? (P[0] + P[3]) / 2 : body.mats[1].elements[12];
    this.z = P ? (P[2] + P[5]) / 2 : body.mats[1].elements[14];
    this.y = groundY;
    this.t = 0; this.dur = 1.15; this.blend = 0.28;
    this.scale = scale || 1;
  }
  /** Pose fig (its mats) for this moment; true when standing. */
  update(dt, fig, P) {
    this.t += dt;
    const u = Math.min(1, this.t / this.dur);
    const K = this.up ? KEYS_UP : KEYS_DOWN;
    let i = 0; while (i < K.length - 2 && u > K[i + 1].t) i++;
    const a = K[i], b = K[i + 1], f = Math.min(1, Math.max(0, (u - a.t) / (b.t - a.t)));
    const e = f * f * (3 - 2 * f);
    const L = (k) => a[k] + (b[k] - a[k]) * e;
    fig.x = this.x; fig.y = this.y; fig.z = this.z; fig.heading = this.heading; fig.rootMat = null; fig.scale = fig.scale || this.scale;
    P.stride = 0; P.walk = 0; P.gait = 0; P.crouch = 0; P.lie = 0; P.fall = 0; P.roll = 0; P.aimDir = null; P.twist = 0; P.tilt = 0; P.look = 0; P.spread = 0.05;
    P.hipY = L('hipY'); P.legs = L('legs'); P.lean = L('lean'); P.arms = 'getup'; P.armF = L('armF');
    poseFigure(fig, P);
    // blend from where the ragdoll left the limbs
    const w = Math.min(1, this.t / this.blend);
    if (w < 1) for (let k = 0; k < 6; k++) {
      this.from[k].decompose(_bp, _bq, _bs);
      fig.mats[k].decompose(_cp, _cq, _bs);
      _cp.lerpVectors(_bp, _cp, w); _bq.slerp(_cq, w);
      fig.mats[k].compose(_cp, _bq, _bs.set(this.scale, this.scale, this.scale));
    }
    return u >= 1;
  }
}
