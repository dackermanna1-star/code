// Co-op networking. The host's browser runs the one authoritative simulation
// (director, infected AI, damage, level scripts). Each joining player replaces
// an AI survivor:
//   * clients send their look/move/button input (30 Hz) plus their predicted
//     position, which the host adopts while the survivor is free to move;
//   * the host broadcasts snapshots (20 Hz) of survivors, infected, doors,
//     props, platforms, lights, loops ... and a stream of discrete events
//     (deaths, explosions, sounds, dialogue, objectives, item pickups);
//   * clients render everything else as interpolated "puppets" and replay
//     gunfire, gore and effects locally so combat still feels immediate.
import * as THREE from 'three';
import { CHARACTERS, ORDER } from '../entities/characters.js';
import { Weapon } from '../combat/weapon.js';
import { Combat } from '../combat/combat.js';
import { Common } from '../entities/infected.js';
import { SpecialInfected, SPECIAL_CLASSES } from '../entities/specials.js';
import { Survivor } from '../entities/survivor.js';
import { BotBrain } from '../entities/bot.js';
import { WindowPane, PhysProp, PropManager, MovingPlatform } from '../world/dynamic.js';
import { ItemManager } from '../world/items.js';
import { Director } from '../ai/director.js';
import { MountedGun } from '../combat/mounted.js';
import { Helicopter } from '../levels/helicopter.js';
import { DF } from '../render/decals.js';
import { wrapAngle, resetRngs } from '../core/math.js';
import { J } from '../entities/body.js';

const SNAP_DT = 1 / 20;
const INPUT_DT = 1 / 30;
const INTERP = 0.11; // seconds of interpolation delay on clients
const LOCAL_EVENTS = new Set(['draw', 'zoom', 'flashlight', 'jump', 'land', 'shove', 'fire']);
const IDLE = ['stand', 'wander', 'sit', 'lie', 'eat'];
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const lerpA = (a, b, k) => a + wrapAngle(b - a) * k;
const charOf = (s) => (s && s.char ? s.char.id : '');
const _v = new THREE.Vector3();

// Deterministic Math.random while building a level so every peer creates the
// same props / dynamics in the same order (index-based sync).
export function withSeed(seed, fn) {
  resetRngs();
  const orig = Math.random;
  let s = (seed >>> 0) || 0x9e3779b9;
  Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  try { return fn(); } finally { Math.random = orig; }
}

// --------------------------------------------------------------- hooks --
// Prototype wrappers are installed once; each checks game.net at call time so
// single-player behaviour is untouched.
let hooked = false;
function installHooks() {
  if (hooked) return;
  hooked = true;
  const wrap = (proto, name, fn) => { const orig = proto[name]; proto[name] = function (...a) { return fn.call(this, orig, a); }; };

  // --- survivors: clients never apply damage / state changes themselves
  for (const m of ['takeDamage', 'incap', 'die']) {
    wrap(Survivor.prototype, m, function (orig, a) { if (this.game.net?.client) return undefined; return orig.apply(this, a); });
  }
  wrap(Survivor.prototype, 'teleport', function (orig, a) { this.tpSeq = (this.tpSeq || 0) + 1; return orig.apply(this, a); });

  // --- common infected
  wrap(Common.prototype, 'die', function (orig, a) {
    const n = this.game.net;
    if (!n?.host) return orig.apply(this, a);
    const [h, dmg] = a;
    const d = h.dir || _v.set(0, 0, 0);
    n.ev(['cd', this.nid, h.part ?? 0, h.zone || 'torso', h.kind || 'bullet', r2(d.x), r2(d.y), r2(d.z), r2(h.knockback || 1),
      (h.gib ? 1 : 0) | (h.explosion ? 2 : 0) | (h.decap ? 4 : 0) | (h.weapon?.def?.kind === 'shotgun' ? 8 : 0), h.pellets || 0, Math.round(dmg ?? 50), charOf(h.attacker)]);
    const g = this.game;
    g.noFwd++;
    try { return orig.apply(this, a); } finally { g.noFwd--; }
  });
  wrap(Common.prototype, 'takeHit', function (orig, a) {
    if (this.game.net?.client && !this.dead) {
      const h = a[0];
      this.body.bloodAmt = Math.min(1, (this.body.bloodAmt || 0.2) + (h.damage || 10) / 200);
      this.mgr.crowd.setBlood(this.slot, this.body.bloodAmt);
      this.pushReaction(h.dir.x, h.dir.z, 1.2 + (h.knockback || 1) * 0.5);
      return undefined;
    }
    return orig.apply(this, a);
  });
  wrap(Common.prototype, 'sever', function (orig, a) {
    const n = this.game.net;
    if (n?.host && !this.dead) n.ev(['cs', this.nid, a[0], r2(a[1]?.x || 0), r2(a[1]?.z || 0)]);
    return orig.apply(this, a);
  });
  wrap(Common.prototype, 'alert', function (orig, a) { if (this.game.net?.client) return undefined; return orig.apply(this, a); });
  wrap(Common.prototype, 'onShoved', function (orig, a) { if (this.game.net?.client) return undefined; return orig.apply(this, a); });

  // --- special infected
  wrap(SpecialInfected.prototype, 'die', function (orig, a) {
    const n = this.game.net;
    if (!n?.host || this.dead) return orig.apply(this, a);
    const h = a[0] || {};
    const d = h.dir || _v.set(0, 0, 0);
    n.ev(['sd', this.nid, r2(d.x), r2(d.y), r2(d.z), r2(h.knockback || 1), h.zone || 'torso', charOf(h.attacker)]);
    const g = this.game;
    g.noFwd++;
    try { return orig.apply(this, a); } finally { g.noFwd--; }
  });
  wrap(SpecialInfected.prototype, 'takeHit', function (orig, a) {
    if (this.game.net?.client && !this.dead) {
      const h = a[0];
      this.pushReaction(h.dir.x, h.dir.z, 0.5 + (h.knockback || 0) * 0.2);
      this.game.fx.blood(h.x, h.y, h.z, h.dir.x * 0.5, 0.2, h.dir.z * 0.5, 0.8);
      return undefined;
    }
    return orig.apply(this, a);
  });
  for (const m of ['onShoved', 'ignite', 'hearNoise']) {
    wrap(SpecialInfected.prototype, m, function (orig, a) { if (this.game.net?.client) return undefined; return orig.apply(this, a); });
  }

  // --- combat
  wrap(Combat.prototype, 'fireWeapon', function (orig, a) {
    if (this.game.net?.host) a[0].fireSeq = (a[0].fireSeq || 0) + 1;
    return orig.apply(this, a);
  });
  wrap(Combat.prototype, 'melee', function (orig, a) {
    if (this.game.net?.host) a[0].meleeSeq = (a[0].meleeSeq || 0) + 1;
    return orig.apply(this, a);
  });
  wrap(Combat.prototype, 'noise', function (orig, a) { if (this.game.net?.client) return undefined; return orig.apply(this, a); });
  wrap(Combat.prototype, 'shove', function (orig, a) {
    const g = this.game;
    if (g.net?.client) { g.audio.play('shove', { pos: a[0].pos, vol: 0.5, owner: a[0] }); return undefined; }
    return orig.apply(this, a);
  });
  wrap(Combat.prototype, 'throwItem', function (orig, a) {
    const r = orig.apply(this, a);
    const n = this.game.net;
    if (n?.host) { const p = this.projectiles[this.projectiles.length - 1]; if (p) n.ev(['p', charOf(a[0]), p.type, r2(p.x), r2(p.y), r2(p.z), r2(p.vx), r2(p.vy), r2(p.vz)]); }
    return r;
  });
  wrap(Combat.prototype, 'launchGrenade', function (orig, a) {
    const n = this.game.net;
    if (n?.client) return undefined;
    const r = orig.apply(this, a);
    if (n?.host) { const p = this.projectiles[this.projectiles.length - 1]; if (p) n.ev(['p', charOf(a[0]), p.type, r2(p.x), r2(p.y), r2(p.z), r2(p.vx), r2(p.vy), r2(p.vz)]); }
    return r;
  });
  wrap(Combat.prototype, 'detonate', function (orig, a) {
    const n = this.game.net;
    if (n?.host) { const p = a[0]; n.ev(['dt', p.type, r2(p.x), r2(p.y), r2(p.z)]); }
    return orig.apply(this, a);
  });
  wrap(Combat.prototype, 'startFire', function (orig, a) {
    const n = this.game.net;
    if (n?.host) n.ev(['f', r2(a[0]), r2(a[1]), r2(a[2]), r2(a[3]), r2(a[4])]);
    return orig.apply(this, a);
  });
  wrap(Combat.prototype, 'explode', function (orig, a) {
    const g = this.game;
    const n = g.net;
    if (!n?.host) return orig.apply(this, a);
    n.ev(['x', r2(a[0]), r2(a[1]), r2(a[2]), r2(a[3]), r2(a[6]?.scale ?? 1)]);
    g.noFwd++;
    try { return orig.apply(this, a); } finally { g.noFwd--; }
  });

  // --- world objects
  wrap(PhysProp.prototype, 'onShot', function (orig, a) {
    if (this.game.net?.client) { const [x, y, z, dir] = a; this.game.fx.chips(x, y, z, -dir.x, -dir.y, -dir.z, [0.4, 0.4, 0.4], 3); return undefined; }
    return orig.apply(this, a);
  });
  wrap(WindowPane.prototype, 'onShot', function (orig, a) { if (this.game.net?.client) return undefined; return orig.apply(this, a); });
  wrap(PropManager.prototype, 'update', function (orig, a) { if (this.game.net?.client) return undefined; return orig.apply(this, a); });
  wrap(PropManager.prototype, 'shoveProps', function (orig, a) { if (this.game.net?.client) return undefined; return orig.apply(this, a); });
  wrap(PropManager.prototype, 'explosionImpulse', function (orig, a) { if (this.game.net?.client) return undefined; return orig.apply(this, a); });

  // --- items: stable ids, pickups replicated by events
  wrap(ItemManager.prototype, 'spawn', function (orig, a) {
    const [type, x, y, z, opts0] = a;
    const opts = Object.assign({}, opts0 || {});
    if (opts.yaw == null) opts.yaw = Math.random() * 6.28;
    const it = orig.call(this, type, x, y, z, opts);
    if (it) {
      this.nextId = (this.nextId || 0) + 1;
      it.id = opts.netId ?? this.nextId;
      it.yaw = opts.yaw;
      it.spawnY = y;
      const n = this.game.net;
      if (n?.host && !n.building) n.ev(['is', it.id, type, r2(x), r2(y), r2(z), r2(opts.yaw)]);
    }
    return it;
  });
  wrap(ItemManager.prototype, 'take', function (orig, a) {
    const it = a[0];
    const was = it.taken;
    const r = orig.apply(this, a);
    const n = this.game.net;
    if (n?.host && !was && it.taken) n.ev(['it', it.id]);
    return r;
  });
  wrap(ItemManager.prototype, 'populate', function (orig, a) { if (this.game.net?.client) return undefined; return orig.apply(this, a); });

  // --- director never runs on clients
  for (const m of ['update', 'spawnMob', 'spawnSpecial', 'spawnWitchAt', 'panic', 'bileMob', 'queueCommons']) {
    wrap(Director.prototype, m, function (orig, a) { if (this.game.net?.client) return m === 'spawnMob' ? 0 : null; return orig.apply(this, a); });
  }
}

// Level objects that are synchronised by index (same build order on all peers).
function netObjects(g) {
  const L = g.level;
  if (L._net) return L._net;
  const plats = [], helis = [], guns = [];
  for (const d of L.dynamics) {
    if (d instanceof MovingPlatform) plats.push(d);
    else if (d instanceof Helicopter) helis.push(d);
    else if (d instanceof MountedGun) guns.push(d);
  }
  L._net = { plats, helis, guns, windows: L.windows || [] };
  return L._net;
}

function survivorByChar(g, id) { return id ? g.survivors.find((s) => s.char.id === id) || null : null; }

// ============================================================== HOST ==
export class CoopHost {
  constructor(session, link, name) {
    installHooks();
    this.session = session;
    this.link = link;
    this.code = link.code;
    this.name = name || 'Host';
    this.host = true;
    this.client = false;
    this.peers = new Map(); // id -> {id, name, char, ready, in, edges, survivor}
    this.events = [];
    this.snapT = 0;
    this.slowT = 0;
    this.loops = new Map();
    this.loopSeq = 1;
    this.building = false;
    this.onChange = null; // lobby refresh callback
    link.on('peer', (id, nm) => this.onPeer(id, nm))
      .on('left', (id) => this.onLeft(id))
      .on('msg', (from, d) => this.onMsg(from, d))
      .on('close', () => this.session.netLost('Lost connection to the relay server.'));
    this.attach(session.game);
  }
  get game() { return this.session.game; }
  ev(e) { this.events.push(e); }

  // Wrap per-game singletons (audio/voice/hud) so their output is forwarded.
  attach(g) {
    g.net = this;
    const host = this;
    const au = g.audio;
    if (!au._netWrapped) {
      au._netWrapped = true;
      const play = au.play.bind(au);
      au.play = (name, opts = {}) => {
        const n = host.session.game?.net;
        if (n === host && opts.pos && !host.session.game.noFwd) n.ev(['a', name, r2(opts.pos.x), r2(opts.pos.y), r2(opts.pos.z), r2(opts.vol ?? 1), charOf(opts.owner)]);
        return play(name, opts);
      };
      const loop = au.loop.bind(au);
      au.loop = (name, opts = {}) => {
        const h = loop(name, opts);
        const n = host.session.game?.net;
        if (n !== host || !h) return h;
        const id = host.loopSeq++;
        const rec = { id, name, pos: opts.pos ? opts.pos.clone() : null, vol: opts.vol ?? 1, owner: charOf(opts.owner) };
        host.loops.set(id, rec);
        const stop = h.stop?.bind(h), set = h.set?.bind(h);
        h.stop = (f) => { host.loops.delete(id); return stop?.(f); };
        h.set = (o) => { if (o.pos) { rec.pos = rec.pos || new THREE.Vector3(); rec.pos.copy(o.pos); } if (o.vol != null) rec.vol = o.vol; return set?.(o); };
        return h;
      };
      const mu = au.music;
      if (mu) {
        const st = mu.setState?.bind(mu), sg = mu.stinger?.bind(mu);
        const fwd = () => host.session.game?.net === host && !host.session.game.noFwd;
        if (st) mu.setState = (s, ...r) => { if (fwd()) host.ev(['m', 0, s]); return st(s, ...r); };
        if (sg) mu.stinger = (s, ...r) => { if (fwd() && s !== 'chapterStart') host.ev(['m', 1, s]); return sg(s, ...r); };
      }
    }
    const v = g.voice;
    if (v && !v._netWrapped) {
      v._netWrapped = true;
      const enq = v.enqueue.bind(v);
      v.enqueue = (item) => { if (g.net === host) host.ev(['v', item.who, item.text, item.prio, item.force ? 1 : 0]); return enq(item); };
    }
    const hud = g.hud;
    if (hud && !hud._netWrapped) {
      hud._netWrapped = true;
      const so = hud.setObjective.bind(hud);
      hud.setObjective = (t, d) => { if (g.net === host) host.ev(['o', t, d ?? 7]); return so(t, d); };
    }
  }

  // ------------------------------------------------------- peers --
  freeChars() {
    const used = new Set([this.session.settings.character]);
    for (const p of this.peers.values()) if (p.char) used.add(p.char);
    return ORDER.filter((c) => !used.has(c));
  }
  onPeer(id, name) {
    const p = { id, name: name || 'Player ' + id, char: null, ready: false, in: null, edges: {}, lastIn: performance.now() };
    const free = this.freeChars();
    if (!free.length) { this.link.kick(id); return; }
    p.char = free[0];
    this.peers.set(id, p);
    this.link.to(id, { k: 'hi', char: p.char, code: this.code, host: this.name });
    this.session.game.hud?.toast?.(`${p.name} joined as ${CHARACTERS[p.char].name}`, 3);
    if (this.session.state === 'playing' || this.session.state === 'loading') this.sendLoad(p);
    this.onChange?.();
  }
  onLeft(id) {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    const g = this.game;
    const s = p.survivor;
    if (s && g.survivors?.includes(s)) {
      s.remote = null;
      s.isBot = true;
      s.brain = new BotBrain(g, s, g.survivors.indexOf(s));
      g.hud?.toast?.(`${p.name} left — a bot takes over ${s.name}`, 3);
    }
    this.onChange?.();
  }
  onMsg(from, d) {
    const p = this.peers.get(from);
    if (!p || !d) return;
    switch (d.k) {
      case 'in': {
        p.in = d;
        p.lastIn = performance.now();
        const e = d.e;
        if (e) for (const k in e) p.edges[k] = k === 'sl' ? e[k] : (p.edges[k] || 0) + e[k];
        break;
      }
      case 'ready':
        p.ready = true;
        this.bindPeer(p);
        break;
      case 'name': p.name = String(d.name || p.name).slice(0, 24); this.onChange?.(); break;
    }
  }
  bindPeer(p) {
    const g = this.game;
    const s = survivorByChar(g, p.char);
    if (!s) return;
    p.survivor = s;
    s.remote = p.id;
    s.netName = p.name;
    s.isBot = false;
    s.brain = null;
    s.cancelAction?.();
    // force a full refresh for the newcomer
    this.slowT = 0;
  }
  // Called by the session once a chapter is built (start, next chapter, retry).
  chapterLoaded(idx, retry) {
    this.snapT = 0;
    this.events.length = 0;
    this.loops.clear();
    for (const p of this.peers.values()) { p.ready = false; p.survivor = null; this.sendLoad(p, retry); }
  }
  sendLoad(p, retry = false) {
    const S = this.session, g = this.game;
    if (!g.level) return;
    const items = g.items.items.filter((it) => !it.taken).map((it) => [it.id, it.type, r2(it.pos.x), r2(it.spawnY ?? it.pos.y - 0.1), r2(it.pos.z), r2(it.yaw || 0)]);
    const names = { [S.settings.character]: this.name };
    for (const q of this.peers.values()) names[q.char] = q.name;
    // the survivor stays an AI bot until the joining player has loaded
    const s = survivorByChar(g, p.char);
    if (s && s.remote === p.id) { s.remote = null; s.isBot = true; s.brain = new BotBrain(g, s, g.survivors.indexOf(s)); }
    this.link.to(p.id, { k: 'load', ch: S.chapterIdx, diff: S.settings.difficulty, seed: S.levelSeed, char: p.char, items, names, retry: !!retry });
  }

  // --------------------------------------------------- simulation --
  hostPre(dt) {
    const g = this.game;
    for (const p of this.peers.values()) {
      const s = p.survivor;
      if (!s || s.dead || !p.in) continue;
      const d = p.in;
      const c = s.cmd;
      s.yaw = d.yw; s.pitch = d.pt;
      c.mx = d.mx; c.my = d.my;
      const h = d.h | 0;
      c.fire = !!(h & 1); c.use = !!(h & 2); c.crouch = !!(h & 4); c.sprint = !!(h & 8); c.shoveHeld = !!(h & 16);
      const e = p.edges;
      c.firePressed = !!e.fp; c.usePressed = !!e.up; c.jump = !!e.j; c.reload = !!e.r; c.shove = !!e.sh; c.zoom = !!e.z;
      c.flashlight = !!e.f; c.lastWeapon = !!e.lw; c.drop = !!e.dr; c.slot = e.sl ?? -1;
      if (e.fp) c.fire = true;
      p.edges = {};
      // knockback happens on the host: tell the owner and hold its position
      if (s.knock) { this.link.to(p.id, { k: 'kn', x: r2(s.knock.x), y: r2(s.knock.y), z: r2(s.knock.z) }); s.netHold = 0.6; }
      s.netHold = Math.max(0, (s.netHold || 0) - dt);
      const free = !s.incapped && !s.pinned && !s.usingMounted && !(s.action && s.action.immobile) && s.netHold <= 0 && d.tq === (s.tpSeq || 0);
      if (free && d.p) {
        const P = s.phys;
        P.x = d.p[0]; P.y = d.p[1]; P.z = d.p[2];
        P.vx = d.v[0]; P.vy = d.v[1]; P.vz = d.v[2];
        P.onGround = !!d.g;
        s.pos.set(P.x, P.y, P.z);
        s.fallStartY = null;
      }
    }
  }
  hostPost(dt) {
    if (!this.peers.size) { this.events.length = 0; return; }
    this.snapT -= dt;
    this.slowT -= dt;
    let ready = false;
    for (const p of this.peers.values()) if (p.ready) ready = true;
    if (!ready) { this.events.length = 0; return; }
    if (this.events.length) {
      this.sendReady({ k: 'ev', l: this.events });
      this.events = [];
    }
    if (this.snapT <= 0 && !this.link.congested) {
      this.snapT = SNAP_DT;
      const full = this.slowT <= 0;
      if (full) this.slowT = 1;
      this.sendReady(this.snapshot(full));
    }
  }
  sendReady(msg) {
    let all = true;
    for (const p of this.peers.values()) if (!p.ready) { all = false; break; }
    if (all) { this.link.toAll(msg); return; }
    for (const p of this.peers.values()) if (p.ready) this.link.to(p.id, msg);
  }
  sendEnd(type) {
    const g = this.game;
    this.sendReady({ k: 'end', type, stats: g.survivors.map((s) => [s.char.id, s.stats, s.dead ? 1 : 0]), time: this.session.chapterTime || 0, ctime: this.session.campaignTime || 0 });
  }

  snapshot(full) {
    const g = this.game, L = g.level;
    const O = netObjects(g);
    const snap = { k: 's', t: r3(g.time) };
    snap.sv = g.survivors.map((s) => this.encSurvivor(s, full));
    const c = [];
    for (const e of g.infected.commons) {
      c.push(e.nid, Math.round(e.pos.x * 100), Math.round(e.pos.y * 100), Math.round(e.pos.z * 100), Math.round(e.yaw * 100), e.state, Math.round((e.curSpeed || 0) * 10),
        (e.burning > 0 ? 1 : 0) | (e.climb ? 2 : 0) | (e.falling ? 4 : 0), Math.max(0, IDLE.indexOf(e.idle)), Math.round((e.attackT || 0) * 100));
    }
    snap.c = c;
    snap.sp = [];
    for (const s of g.infected.specials) {
      if (s.dead || s.removed) continue;
      snap.sp.push([s.nid, s.kind, r2(s.pos.x), r2(s.pos.y), r2(s.pos.z), r3(s.yaw), s.state, r2(s.stateT), r2(s.curSpeed || 0), Math.round(s.hp),
        (s.airborne ? 1 : 0) | (s.enraged ? 2 : 0) | (s.burning > 0 ? 4 : 0) | (s.stumble ? 8 : 0) | (s.climb ? 16 : 0) | (s.falling ? 32 : 0) | (s.hitDone ? 64 : 0),
        charOf(s.target), charOf(s.pinning), r2(s.rage || 0), this.specialExtra(s)]);
    }
    const d = [];
    for (const dr of L.doors) d.push(r2(dr.targetAngle), dr.dirSign, (dr.open ? 1 : 0) | (dr.broken ? 2 : 0) | (dr.locked ? 4 : 0) | (dr.fall ? 8 : 0), dr.fall ? dr.fall.dir : 0);
    snap.d = d;
    let w = '';
    for (const x of O.windows) w += x.broken ? '1' : '0';
    snap.w = w;
    let li = '';
    for (const x of L.lights) li += x.on ? '1' : '0';
    snap.li = li;
    snap.pr = [];
    g.props.props.forEach((p, i) => {
      if (full || !p.sleep || p.dead !== p._netDead) {
        p._netDead = p.dead;
        snap.pr.push(i, r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r3(p.q.x), r3(p.q.y), r3(p.q.z), r3(p.q.w), p.dead ? 1 : 0);
      }
    });
    snap.ht = [];
    (g.hittables || []).forEach((h, i) => {
      if (full || h.flying) snap.ht.push(i, r2(h.pos.x), r2(h.pos.y), r2(h.pos.z), r3(h.grp.rotation.x), r3(h.grp.rotation.y), r3(h.grp.rotation.z));
    });
    snap.mp = O.plats.map((p) => [r3(p.offset.x), r3(p.offset.y), r3(p.offset.z)]);
    snap.hl = O.helis.map((h) => { const gp = h.group; return [gp.visible ? 1 : 0, r2(gp.position.x), r2(gp.position.y), r2(gp.position.z), r3(gp.rotation.x), r3(gp.rotation.y), r3(gp.rotation.z), h.searchOn ? 1 : 0]; });
    snap.mg = O.guns.map((m) => [charOf(m.user), r2(m.heat), m.overheated > 0 ? 1 : 0, r2(m.spin)]);
    let u = '';
    for (const x of g.usables) u += x.enabled !== false ? '1' : '0';
    snap.u = u;
    if (full) snap.up = g.usables.map((x) => x.prompt);
    if (full) {
      // scripted environment changes (fog, moon, exposure) for clients
      const sc = g.scene;
      snap.env = [sc.fog.color.getHex(), r3(sc.fog.density), g.hemi.color.getHex(), g.hemi.groundColor.getHex(), r2(g.hemi.intensity), r2(g.moon.intensity), g.moon.color.getHex(), r2(g.renderer.r.toneMappingExposure), r3(sc.environmentIntensity ?? 0.08)];
      if (g.moonDir) snap.env.push(r3(g.moonDir.x), r3(g.moonDir.y), r3(g.moonDir.z));
    }
    snap.lp = [];
    for (const l of this.loops.values()) snap.lp.push([l.id, l.name, l.pos ? r2(l.pos.x) : null, l.pos ? r2(l.pos.y) : 0, l.pos ? r2(l.pos.z) : 0, r2(l.vol), l.owner]);
    return snap;
  }
  specialExtra(s) {
    if (s.kind === 'smoker') {
      const d = s.tongueDir, e = s.tongueEnd;
      return [r2(s.tongueLen || 0), d ? r3(d.x) : 0, d ? r3(d.y) : 0, d ? r3(d.z) : 1, e ? r2(e.x) : 0, e ? r2(e.y) : 0, e ? r2(e.z) : 0];
    }
    if (s.kind === 'tank') return s.rock ? [r2(s.rock.pos.x), r2(s.rock.pos.y), r2(s.rock.pos.z)] : 0;
    return 0;
  }
  encSurvivor(s, full) {
    const P = s.phys, w = s.inv.primary, sec = s.inv.secondary, a = s.action;
    const O = netObjects(this.game);
    const mg = s.usingMounted ? O.guns.indexOf(s.usingMounted) : -1;
    const flags = (P.onGround ? 1 : 0) | (s.crouching ? 2 : 0) | (s.incapped ? 4 : 0) | (s.dead ? 8 : 0) | (s.sprinting ? 16 : 0) | (s.flashlight ? 32 : 0) |
      (s.weapon?.reloading ? 64 : 0) | (s.weapon?.zoomed ? 128 : 0) | (s.isBot ? 256 : 0);
    const out = [s.char.id, r2(P.x), r2(P.y), r2(P.z), r2(P.vx), r2(P.vy), r2(P.vz), r3(s.yaw), r3(s.pitch), flags,
      Math.round(s.health), r2(s.temp), Math.round(s.incapHP), s.incapCount, s.slot,
      w ? w.type : '', w ? w.clip : 0, w ? w.reserve : 0, sec.type, sec.dual ? 1 : 0, sec.clip, s.inv.throwable || '', s.inv.medkit === true ? 1 : s.inv.medkit || 0, s.inv.pills || '',
      a ? a.type : '', a ? r2(a.t) : 0, a ? r2(a.dur) : 0, charOf(a?.target), a?.label || '',
      s.pinType || '', s.pinned ? s.pinned.nid ?? -1 : -1, r2(s.bile), r2(s.burning), s.tpSeq || 0, s.fireSeq || 0, s.meleeSeq || 0, mg,
      r2(s.crouchT), charOf(s.beingRevived), charOf(s.beingHealed), r3(s.aimPitchOff || 0), s.remote ?? -1, s.throwing ? 1 : 0];
    if (full) out.push(s.stats);
    return out;
  }
  close() {
    this.link.close();
    const g = this.game;
    if (g) {
      for (const s of g.survivors || []) if (s.remote != null) { s.remote = null; s.isBot = true; s.brain = new BotBrain(g, s, g.survivors.indexOf(s)); }
      g.net = null;
    }
  }
}

// ============================================================ CLIENT ==
export class CoopClient {
  constructor(session, link, name) {
    installHooks();
    this.session = session;
    this.link = link;
    this.code = link.code;
    this.name = name || 'Player';
    this.host = false;
    this.client = true;
    this.char = null;
    this.names = {};
    this.snaps = [];
    this.latest = null;
    this.recvAt = 0;
    this.inputT = 0;
    this.edges = {};
    this.cmap = new Map(); // nid -> common puppet
    this.smap = new Map(); // nid -> special puppet
    this.loops = new Map();
    this.loaded = false;
    this.slotMismatchT = 0;
    this.onStatus = null;
    link.on('msg', (from, d) => this.onMsg(d))
      .on('hostClosed', () => this.session.netLost('The host ended the game.'))
      .on('close', () => this.session.netLost('Lost connection to the relay server.'))
      .on('error', (m) => this.session.netLost(m));
    this.attach(session.game);
  }
  get game() { return this.session.game; }
  ev() { /* clients don't emit events */ }
  attach(g) {
    g.net = this;
    const v = g.voice;
    if (v && !v._netClient) {
      v._netClient = true;
      v.say = () => false;
      v.script = () => {};
    }
  }
  onMsg(d) {
    if (!d) return;
    switch (d.k) {
      case 'hi': this.char = d.char; this.hostName = d.host; this.onStatus?.(d); break;
      case 'load': this.char = d.char; this.names = d.names || {}; this.loaded = false; this.snaps = []; this.latest = null; this.session.clientLoad(d); break;
      case 's': if (this.loaded) this.onSnap(d); break;
      case 'ev': if (this.loaded) for (const e of d.l) this.onEvent(e); break;
      case 'kn': { const me = this.game.player; if (me) me.knock = { x: d.x, y: d.y, z: d.z }; break; }
      case 'end': if (this.loaded) this.session.clientEnd(d); break;
    }
  }
  // chapter built locally -> tell the host
  levelReady(items) {
    const g = this.game;
    this.cmap.clear();
    this.smap.clear();
    for (const l of this.loops.values()) l.h?.stop?.(0.1);
    this.loops.clear();
    g.items.clear();
    for (const [id, type, x, y, z, yaw] of items || []) g.items.spawn(type, x, y, z, { yaw, netId: id });
    for (const s of g.survivors) { s.brain = null; s.netName = this.names[s.char.id] || null; }
    g.player.netLocal = true;
    this.ackTp = -1;
    this.loaded = true;
    this.link.up({ k: 'ready' });
  }

  // ---------------------------------------------------- snapshots --
  onSnap(s) {
    const now = performance.now() / 1000;
    s.recv = now;
    // index commons by nid for interpolation
    const m = new Map();
    for (let i = 0; i < s.c.length; i += 10) m.set(s.c[i], i);
    s.cm = m;
    const sm = new Map();
    for (const e of s.sp) sm.set(e[0], e);
    s.sm = sm;
    if (this.latest && s.t < this.latest.t - 1) this.snaps = []; // host time reset (new chapter)
    this.snaps.push(s);
    if (this.snaps.length > 12) this.snaps.shift();
    // host clock estimate
    if (!this.latest || this.snaps.length === 1) this.clock = s.t;
    this.latest = s;
    this.recvAt = now;
    this.applyLatest(s);
  }
  // discrete state that doesn't interpolate
  applyLatest(s) {
    const g = this.game, L = g.level;
    const O = netObjects(g);
    // doors
    const d = s.d;
    for (let i = 0, k = 0; k < L.doors.length && i < d.length; i += 4, k++) {
      const dr = L.doors[k];
      dr.targetAngle = d[i]; dr.dirSign = d[i + 1];
      const f = d[i + 2];
      dr.open = !!(f & 1); dr.locked = !!(f & 4);
      if ((f & 2) && !dr.broken) {
        dr.broken = true;
        dr.collider.enabled = false;
        if (dr.usable) dr.usable.enabled = false;
        dr.fall = { t: 0, dir: d[i + 3] || 1 };
        g.fx.chips(dr.cx, dr.cy + 1, dr.cz, 0, 0.5, 0, [0.3, 0.2, 0.12], 20);
      }
    }
    for (let i = 0; i < O.windows.length && i < s.w.length; i++) if (s.w[i] === '1' && !O.windows[i].broken) O.windows[i].shatter();
    for (let i = 0; i < L.lights.length && i < s.li.length; i++) L.lights[i].on = s.li[i] === '1';
    for (let i = 0; i < g.usables.length && i < s.u.length; i++) g.usables[i].enabled = s.u[i] === '1';
    if (s.up) {
      for (let i = 0; i < g.usables.length && i < s.up.length; i++) {
        const u = g.usables[i];
        const desc = Object.getOwnPropertyDescriptor(u, 'prompt');
        if (!desc || 'value' in desc || desc.set) u.prompt = s.up[i];
      }
    }
    // props (dead flag + targets for smoothing)
    const pr = s.pr;
    for (let i = 0; i < pr.length; i += 9) {
      const p = g.props.props[pr[i]];
      if (!p) continue;
      p.net = p.net || { x: 0, y: 0, z: 0, q: new THREE.Quaternion() };
      p.net.x = pr[i + 1]; p.net.y = pr[i + 2]; p.net.z = pr[i + 3];
      p.net.q.set(pr[i + 4], pr[i + 5], pr[i + 6], pr[i + 7]);
      if (pr[i + 8] && !p.dead) { p.dead = true; p.obj.visible = false; }
    }
    const ht = s.ht;
    for (let i = 0; i < ht.length; i += 7) {
      const h = g.hittables[ht[i]];
      if (!h) continue;
      h.net = { x: ht[i + 1], y: ht[i + 2], z: ht[i + 3], rx: ht[i + 4], ry: ht[i + 5], rz: ht[i + 6] };
    }
    // mounted guns
    s.mg.forEach((m, i) => {
      const gun = O.guns[i];
      if (!gun) return;
      const u = survivorByChar(g, m[0]);
      gun.heat = m[1]; gun.overheated = m[2] ? 1 : 0; gun.spin = m[3];
      if (u !== gun.user) {
        if (gun.user) gun.user.usingMounted = null;
        gun.user = u;
        gun.u.enabled = !u;
      }
      if (u) u.usingMounted = gun;
    });
    // loops
    const seen = new Set();
    for (const [id, name, x, y, z, vol, owner] of s.lp) {
      seen.add(id);
      let l = this.loops.get(id);
      const pos = x == null ? null : new THREE.Vector3(x, y, z);
      if (!l) {
        const o = { vol };
        if (pos) o.pos = pos;
        const ow = survivorByChar(g, owner);
        if (ow) o.owner = ow;
        l = { h: g.audio.loop(name, o) };
        this.loops.set(id, l);
      } else if (pos) l.h?.set?.({ pos, vol });
    }
    for (const [id, l] of this.loops) if (!seen.has(id)) { l.h?.stop?.(0.3); this.loops.delete(id); }
    if (s.env) {
      const [fc, fd, hc, hg, hi, mi, mc, ex, ei, mx, my, mz] = s.env;
      const sc = g.scene;
      sc.fog.color.setHex(fc); sc.fog.density = fd;
      if (sc.background?.isColor) sc.background.setHex(fc);
      g.hemi.color.setHex(hc); g.hemi.groundColor.setHex(hg); g.hemi.intensity = hi;
      g.moon.intensity = mi; g.moon.color.setHex(mc);
      g.renderer.r.toneMappingExposure = ex;
      sc.environmentIntensity = ei;
      if (mx != null && g.moonDir) g.moonDir.set(mx, my, mz);
    }
    // stats (full snapshots)
    for (const e of s.sv) { if (e && e.length > 43) { const sv = survivorByChar(g, e[0]); if (sv) sv.stats = e[43]; } }
  }

  // Per-frame interpolation of continuous state.
  interpolate(dt) {
    const g = this.game;
    const snaps = this.snaps;
    if (!snaps.length) return;
    const now = performance.now() / 1000;
    const target = this.latest.t + Math.min(0.25, now - this.recvAt) - INTERP;
    // smooth clock (avoid jitter)
    this.clock = this.clock == null ? target : this.clock + dt + (target - this.clock) * Math.min(1, dt * 4);
    if (Math.abs(this.clock - target) > 0.5) this.clock = target;
    const t = this.clock;
    let a = snaps[0], b = snaps[0];
    for (let i = 0; i < snaps.length; i++) {
      if (snaps[i].t <= t) a = snaps[i];
      if (snaps[i].t >= t) { b = snaps[i]; break; }
      b = snaps[i];
    }
    const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
    // discrete per-snapshot processing (shots etc.) once the render clock passes it
    for (const s of snaps) if (!s.done && s.t <= t) { s.done = true; this.processDiscrete(s); }
    this.interpSurvivors(a, b, k);
    this.interpCommons(a, b, k);
    this.interpSpecials(a, b, k);
    this.interpObjects(a, b, k);
  }
  processDiscrete(s) {
    const g = this.game;
    for (const e of s.sv) {
      const sv = survivorByChar(g, e[0]);
      if (!sv || sv === g.player) continue;
      const fs = e[34], ms = e[35];
      if (sv._fs == null) sv._fs = fs;
      if (sv._ms == null) sv._ms = ms;
      let shots = Math.min(4, fs - sv._fs);
      sv._fs = fs;
      const w = sv.weapon;
      while (shots-- > 0 && w && !w.def.melee) {
        sv.pos.set(e[1], e[2], e[3]);
        sv.yaw = e[7]; sv.pitch = e[8];
        g.combat.fireWeapon(sv, w);
      }
      if (ms > sv._ms && w && w.def.melee) g.combat.melee(sv, w);
      sv._ms = ms;
    }
  }
  interpSurvivors(a, b, k) {
    const g = this.game;
    const me = g.player;
    for (let i = 0; i < b.sv.length; i++) {
      const eb = b.sv[i];
      const s = survivorByChar(g, eb[0]);
      if (!s) continue;
      const ea = a.sv.find((x) => x[0] === eb[0]) || eb;
      const mine = s === me;
      this.applySurvivorState(s, eb, mine);
      if (mine) continue;
      const P = s.phys;
      P.x = ea[1] + (eb[1] - ea[1]) * k; P.y = ea[2] + (eb[2] - ea[2]) * k; P.z = ea[3] + (eb[3] - ea[3]) * k;
      P.vx = eb[4]; P.vy = eb[5]; P.vz = eb[6];
      s.pos.set(P.x, P.y, P.z);
      s.yaw = lerpA(ea[7], eb[7], k);
      s.pitch = ea[8] + (eb[8] - ea[8]) * k;
    }
  }
  applySurvivorState(s, e, mine) {
    const g = this.game;
    const f = e[9];
    s.phys.onGround = mine ? s.phys.onGround : !!(f & 1);
    if (!mine) { s.crouching = !!(f & 2); s.sprinting = !!(f & 16); s.crouchT = e[37]; s.aimPitchOff = e[40]; }
    const wasInc = s.incapped;
    s.incapped = !!(f & 4);
    if (s.incapped && !wasInc) s.phys.h = 0.7;
    s.dead = !!(f & 8);
    if (!mine) s.flashlight = !!(f & 32);
    s.isBot = !!(f & 256);
    s.health = e[10]; s.temp = e[11]; s.incapHP = e[12]; s.incapCount = e[13];
    // inventory
    const inv = s.inv;
    const pt = e[15];
    if (!pt) inv.primary = null;
    else if (!inv.primary || inv.primary.type !== pt) inv.primary = new Weapon(pt, { clip: e[16], reserve: e[17] });
    if (inv.secondary.type !== e[18] || !!inv.secondary.dual !== !!e[19]) inv.secondary = new Weapon(e[18], { dual: !!e[19] });
    inv.throwable = e[21] || null; inv.medkit = e[22] === 1 ? true : e[22] || false; inv.pills = e[23] || null;
    const w = s.weapon;
    if (mine) {
      // ammo from the host when our local weapon is idle
      const now = performance.now();
      if (inv.primary && inv.primary.type === pt && !inv.primary.reloading && now - inv.primary.lastFire > 450) { inv.primary.clip = e[16]; inv.primary.reserve = e[17]; }
      if (!inv.secondary.reloading && now - inv.secondary.lastFire > 450) inv.secondary.clip = e[20];
      // slot: adopt host slot if we disagree for a while (pickups, forced swaps)
      if (e[14] !== s.slot) {
        this.slotMismatchT += 1 / 20;
        if (this.slotMismatchT > 0.5 && s.hasSlot(e[14])) { s.slot = e[14]; s.onEvent?.('draw', s.slot); this.slotMismatchT = 0; }
        else if (!s.hasSlot(s.slot)) { s.slot = e[14]; s.onEvent?.('draw', s.slot); }
      } else this.slotMismatchT = 0;
    } else {
      s.slot = e[14];
      if (w) { const rl = !!(f & 64); if (rl && !w.reloading && w.startReload) { w.reloading = true; } else if (!rl) w.reloading = false; w.zoomed = !!(f & 128); }
      if (inv.primary && inv.primary.type === pt) { inv.primary.clip = e[16]; inv.primary.reserve = e[17]; }
    }
    // action
    if (e[24]) {
      s.action = s.action && s.action.type === e[24] ? s.action : { type: e[24], immobile: e[24] !== 'pills' };
      s.action.t = e[25]; s.action.dur = e[26]; s.action.target = survivorByChar(g, e[27]); s.action.label = e[28];
    } else s.action = null;
    s.beingRevived = survivorByChar(g, e[38]);
    s.beingHealed = survivorByChar(g, e[39]);
    // pinned
    s.pinType = e[29] || null;
    if (s.pinType) s.pinned = this.smap.get(e[30]) || s.pinned || { kind: s.pinType, shoveable: false, nid: e[30] };
    else s.pinned = null;
    s.bile = e[31]; s.burning = e[32];
    s.throwing = e[42] ? (s.throwing || 0.001) : 0;
    // mounted gun is applied from the gun list; clear if host says none
    if (e[36] < 0 && s.usingMounted) s.usingMounted = null;
    if (mine) {
      // teleports & host-controlled movement
      const tq = e[33];
      const P = s.phys;
      const hostMoves = s.incapped || s.pinned || s.usingMounted || s.dead || (s.action && s.action.immobile);
      if (tq !== this.ackTp) {
        this.ackTp = tq;
        s.teleport(e[1], e[2], e[3], e[7]);
      } else if (hostMoves || (s.netHold || 0) > 0) {
        P.x += (e[1] - P.x) * 0.35; P.y += (e[2] - P.y) * 0.35; P.z += (e[3] - P.z) * 0.35;
        P.vx = e[4]; P.vz = e[6];
        s.pos.set(P.x, P.y, P.z);
      } else {
        // safety: large divergence (e.g. host-side push) -> snap
        const dx = e[1] - P.x, dz = e[3] - P.z;
        if (dx * dx + dz * dz > 25) { P.x = e[1]; P.y = e[2]; P.z = e[3]; s.pos.set(P.x, P.y, P.z); }
      }
    }
  }
  puppetCommon(nid, x, y, z, chase) {
    const g = this.game;
    const c = g.infected.spawnCommon(x, y, z, { chase });
    if (!c) return null;
    c.nid = nid;
    c.puppet = true;
    c.net = { x, y, z, yaw: 0, state: 0, idle: 'stand', sp: 0, fl: 0, at: 0 };
    this.cmap.set(nid, c);
    return c;
  }
  interpCommons(a, b, k) {
    const g = this.game;
    const B = b.c, A = a.c;
    const alive = new Set();
    for (let i = 0; i < B.length; i += 10) {
      const nid = B[i];
      alive.add(nid);
      const ia = a.cm.get(nid);
      const src = ia != null ? A : B, j = ia != null ? ia : i;
      const x = (src[j + 1] + (B[i + 1] - src[j + 1]) * k) / 100, y = (src[j + 2] + (B[i + 2] - src[j + 2]) * k) / 100, z = (src[j + 3] + (B[i + 3] - src[j + 3]) * k) / 100;
      let c = this.cmap.get(nid);
      if (c && c.dead) continue;
      if (!c) { c = this.puppetCommon(nid, x, y, z, B[i + 5] !== 0); if (!c) continue; }
      const n = c.net;
      n.x = x; n.y = y; n.z = z;
      n.yaw = lerpA(src[j + 4] / 100, B[i + 4] / 100, k);
      n.state = B[i + 5]; n.sp = B[i + 6] / 10; n.fl = B[i + 7]; n.idle = IDLE[B[i + 8]] || 'stand'; n.at = B[i + 9] / 100;
    }
    // commons culled by the host (not killed) vanish
    for (const [nid, c] of this.cmap) {
      if (c.nid !== nid) { this.cmap.delete(nid); continue; }
      if (c.dead) { if (c.deadT > 60 || c.slot < 0) this.cmap.delete(nid); continue; }
      if (!alive.has(nid) && !(this.latest.cm.has(nid))) {
        const m = g.infected;
        const i = m.commons.indexOf(c);
        if (i >= 0) { m.commons.splice(i, 1); m.crowd.release(c.slot); c.slot = -1; m.pool.push(c); }
        this.cmap.delete(nid);
      }
    }
  }
  interpSpecials(a, b, k) {
    const g = this.game;
    const seen = new Set();
    for (const eb of b.sp) {
      const nid = eb[0];
      seen.add(nid);
      const ea = a.sm.get(nid) || eb;
      let sp = this.smap.get(nid);
      if (sp && sp.dead) continue;
      if (!sp) {
        const C = SPECIAL_CLASSES[eb[1]];
        if (!C) continue;
        sp = new C(g.infected);
        sp.nid = nid;
        sp.puppet = true;
        sp.placeAt(eb[2], eb[3], eb[4]);
        sp.yaw = eb[5];
        sp.animate(0.016);
        sp.body.storePrev();
        g.infected.specials.push(sp);
        this.smap.set(nid, sp);
        g.onSpecialSpawn?.(sp);
      }
      sp.net = {
        x: ea[2] + (eb[2] - ea[2]) * k, y: ea[3] + (eb[3] - ea[3]) * k, z: ea[4] + (eb[4] - ea[4]) * k, yaw: lerpA(ea[5], eb[5], k),
        state: eb[6], st: eb[7], sp: eb[8], hp: eb[9], fl: eb[10], target: eb[11], pin: eb[12], rage: eb[13], ex: eb[14],
      };
    }
    for (const [nid, sp] of this.smap) {
      if (sp.dead) { if (sp.removed) this.smap.delete(nid); continue; }
      if (!seen.has(nid) && !this.latest.sm.has(nid)) { sp.remove(); this.smap.delete(nid); }
    }
  }
  interpObjects(a, b, k) {
    const g = this.game;
    const O = netObjects(g);
    // platforms: move colliders smoothly and give them a velocity so riders are carried
    b.mp.forEach((ob, i) => {
      const p = O.plats[i];
      if (!p) return;
      const oa = a.mp[i] || ob;
      const x = oa[0] + (ob[0] - oa[0]) * k, y = oa[1] + (ob[1] - oa[1]) * k, z = oa[2] + (ob[2] - oa[2]) * k;
      const dt = Math.max(1e-3, this.lastDt || 1 / 60);
      const v = p.col.vel;
      v[0] = (x - p.offset.x) / dt; v[1] = (y - p.offset.y) / dt; v[2] = (z - p.offset.z) / dt;
      if (Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]) > 60) { v[0] = v[1] = v[2] = 0; }
      for (const e of p.extra) e.d.vel = v;
      p.offset.set(x, y, z);
      p.apply();
    });
    b.hl.forEach((hb, i) => {
      const h = O.helis[i];
      if (!h) return;
      const ha = a.hl[i] || hb;
      const gp = h.group;
      gp.visible = !!hb[0];
      gp.position.set(ha[1] + (hb[1] - ha[1]) * k, ha[2] + (hb[2] - ha[2]) * k, ha[3] + (hb[3] - ha[3]) * k);
      gp.rotation.set(ha[4] + (hb[4] - ha[4]) * k, lerpA(ha[5], hb[5], k), ha[6] + (hb[6] - ha[6]) * k);
      if (!!hb[7] !== h.searchOn) h.setSearchlight(!!hb[7]);
      if (h.vLight) { h.vLight.on = gp.visible; }
    });
    for (const p of g.props.props) {
      if (!p.net || p.dead) continue;
      const kk = Math.min(1, (this.lastDt || 0.016) * 12);
      p.pos.x += (p.net.x - p.pos.x) * kk; p.pos.y += (p.net.y - p.pos.y) * kk; p.pos.z += (p.net.z - p.pos.z) * kk;
      p.q.slerp(p.net.q, kk);
      p.obj.position.set(p.pos.x, p.pos.y - (p.upright ? p.bottom - p.r : 0), p.pos.z);
      p.obj.quaternion.copy(p.q);
    }
    for (const h of g.hittables || []) {
      if (!h.net) continue;
      const kk = Math.min(1, (this.lastDt || 0.016) * 12);
      h.pos.x += (h.net.x - h.pos.x) * kk; h.pos.y += (h.net.y - h.pos.y) * kk; h.pos.z += (h.net.z - h.pos.z) * kk;
      h.grp.position.copy(h.pos);
      h.grp.rotation.set(h.net.rx, h.net.ry, h.net.rz);
      const hx = h.hx, hz = h.hz;
      h.col.min = [h.pos.x - hx, h.pos.y, h.pos.z - hz];
      h.col.max = [h.pos.x + hx, h.pos.y + h.hy, h.pos.z + hz];
    }
  }

  // ------------------------------------------------------- events --
  onEvent(e) {
    const g = this.game;
    const me = g.player;
    switch (e[0]) {
      case 'a': {
        const owner = survivorByChar(g, e[6]);
        g.audio.play(e[1], { pos: new THREE.Vector3(e[2], e[3], e[4]), vol: e[5], owner: owner || undefined });
        break;
      }
      case 'm': if (e[1]) g.audio.music?.stinger?.(e[2]); else g.audio.music?.setState?.(e[2]); break;
      case 'v': {
        const v = g.voice;
        Object.getPrototypeOf(v).enqueue.call(v, { who: e[1], text: e[2], prio: e[3], force: !!e[4] });
        break;
      }
      case 'o': g.hud.setObjective(e[1], e[2]); break;
      case 'se': {
        const s = survivorByChar(g, e[1]);
        if (!s) break;
        if (s === me && LOCAL_EVENTS.has(e[2])) break;
        const d = this.decodeEventData(e[2], e[3]);
        if (s === me && e[2] === 'hurt' && d.amount > 18) g.shake(Math.min(1, d.amount / 40));
        if (s !== me && e[2] === 'shove') g.audio.play('shove', { pos: s.pos, vol: 0.5, owner: s });
        s.onEvent?.(e[2], d);
        break;
      }
      case 'we': {
        const s = survivorByChar(g, e[1]);
        if (!s || s === me || !s.weapon) break;
        this.session.onWeaponEvent(s, s.weapon, e[2]);
        break;
      }
      case 'cd': {
        const c = this.cmap.get(e[1]);
        if (!c || c.dead) break;
        const fl = e[9];
        const h = {
          part: e[2], zone: e[3], kind: e[4], dir: new THREE.Vector3(e[5], e[6], e[7]), knockback: e[8], gib: !!(fl & 1), explosion: !!(fl & 2), decap: !!(fl & 4),
          pellets: e[10], weapon: fl & 8 ? { def: { kind: 'shotgun' } } : null, attacker: survivorByChar(g, e[12]), damage: e[11],
        };
        if (c.net) { c.pos.set(c.net.x, c.net.y, c.net.z); c.yaw = c.net.yaw; }
        c.die(h, e[11]);
        break;
      }
      case 'cs': {
        const c = this.cmap.get(e[1]);
        if (c && !c.dead) c.sever(e[2], new THREE.Vector3(e[3], 0, e[4]), 3);
        break;
      }
      case 'sd': {
        const sp = this.smap.get(e[1]);
        if (!sp || sp.dead) break;
        sp.die({ dir: new THREE.Vector3(e[2], e[3], e[4]), knockback: e[5], zone: e[6], attacker: survivorByChar(g, e[7]) });
        if (sp.kind === 'tank') g.onTankKilled?.(sp);
        break;
      }
      case 'p': {
        const [, who, type, x, y, z, vx, vy, vz] = e;
        const p = { type, x, y, z, vx, vy, vz, t: 0, fuse: 99, owner: survivorByChar(g, who), bounces: 0, rest: false, spin: 0, net: true, beepT: 0 };
        p.mesh = g.itemModels ? g.itemModels.throwableMesh(type) : null;
        if (p.mesh) g.scene.add(p.mesh);
        g.combat.projectiles.push(p);
        break;
      }
      case 'dt': {
        const [, type, x, y, z] = e;
        const P = g.combat.projectiles;
        let bi = -1, bd = 1e9;
        for (let i = 0; i < P.length; i++) { if (P[i].type !== type) continue; const d = Math.hypot(P[i].x - x, P[i].y - y, P[i].z - z); if (d < bd) { bd = d; bi = i; } }
        if (bi >= 0) { const p = P[bi]; if (p.mesh) p.mesh.parent?.remove(p.mesh); P.splice(bi, 1); }
        if (type === 'molotov') g.fx.explosion(x, y + 0.2, z, 0.35);
        else if (type === 'bile') { g.fx.cloud(x, y, z, 2.5, [0.35, 0.45, 0.08], 25, 4); g.decals.add(x, y + 0.02, z, 0, 1, 0, 3, DF.BILE); }
        break;
      }
      case 'f': g.combat.startFire(e[1], e[2], e[3], e[4], e[5], null); break;
      case 'cam': {
        // scripted cutscene camera watching a helicopter
        const heli = netObjects(g).helis[e[4]];
        const cam = g.renderer.camera;
        this.session.cinematic(true);
        for (const x of g.survivors) x.model?.setHidden(true);
        g.hooks.cutscene = () => {
          cam.position.set(e[1], e[2], e[3]);
          if (heli) { const p = heli.group.position; cam.lookAt(p.x, p.y + 1, p.z); }
        };
        break;
      }
      case 'x': this.explodeFx(e[1], e[2], e[3], e[4], e[5]); break;
      case 'is': if (!g.items.items.some((it) => it.id === e[1])) g.items.spawn(e[2], e[3], e[4], e[5], { yaw: e[6], netId: e[1] }); break;
      case 'it': {
        const it = g.items.items.find((x) => x.id === e[1]);
        if (it && !it.taken) { it.taken = true; it.mesh?.parent?.remove(it.mesh); if (g.items.highlight === it) g.items.setHighlight(null); }
        break;
      }
    }
  }
  decodeEventData(e, d) {
    const g = this.game;
    if (d == null || typeof d !== 'object') return d;
    if (e === 'hurt') return { amount: d.a, type: d.t, attacker: d.x != null ? { pos: new THREE.Vector3(d.x, 0, d.z) } : null };
    if (d.type) return { type: d.type, dur: d.dur, t: 0, target: survivorByChar(g, d.target) };
    return d;
  }
  explodeFx(x, y, z, radius, scale) {
    const g = this.game;
    g.fx.explosion(x, y + 0.3, z, scale);
    g.fx.shockwave(x, y + 0.2, z, radius);
    g.lights.flash(x, y + 1, z, 0xffa050, 60, radius * 5, 0.35);
    g.audio.play('explosion', { pos: new THREE.Vector3(x, y, z), vol: 1.2 });
    const gh = g.level.col.groundHeight(x, y + 0.5, z, 3);
    if (gh > -1e8) g.decals.add(x, gh + 0.01, z, 0, 1, 0, radius * 1.1, DF.SCORCH);
    g.infected.forEachNear(x, z, radius * 1.6, (e) => {
      if (!e.dead) return;
      const d = Math.hypot(e.pos.x - x, e.pos.z - z) || 1;
      const k = Math.max(0, 1 - d / (radius * 1.5));
      e.ragdoll?.impulseAll((e.pos.x - x) / d * 12 * k, 8 * k, (e.pos.z - z) / d * 12 * k);
    });
    g.infected.corpseImpulse?.(x, y, z, radius * 2, 12);
    const me = g.player;
    const pd = Math.hypot(me.pos.x - x, me.pos.z - z);
    if (pd < radius * 5) g.shake(Math.max(0.15, 1 - pd / (radius * 5)));
  }

  // --------------------------------------------------------- frame --
  clientUpdate(dt) {
    const g = this.game;
    const S = this.session;
    const L = g.level;
    this.lastDt = dt;
    g.time += dt;
    g.frameNo++;
    g.stats.time += dt;
    g.ctrl.buildCmd(dt);
    const me = g.player;
    if (g.hooks.cutscene) { const c = me.cmd; for (const key in c) if (typeof c[key] === 'boolean') c[key] = false; else if (typeof c[key] === 'number') c[key] = 0; c.slot = -1; }
    this.collectEdges(me.cmd);
    this.interpolate(dt);
    me.netHold = Math.max(0, (me.netHold || 0) - dt);
    if (me.knock) me.netHold = 0.5;
    // local survivor: predicted movement + weapon feedback (visual combat)
    const wasW = me.weapon;
    me.update(dt);
    const w = me.weapon || wasW;
    if (w) for (const e of w.consumeEvents()) { g.viewmodel.event(e); g.hooks.onWeaponEvent?.(me, w, e); }
    for (const s of g.survivors) if (s !== me && s.weapon) s.weapon.consumeEvents();
    // level: visual dynamics only (scripts/triggers/timers run on the host)
    L.time += dt;
    for (const d of L.dynamics) if (!(d instanceof MovingPlatform)) d.update?.(dt);
    S.afterSurvivors(dt);
    g.infected.update(dt);
    g.combat.update(dt);
    g.gibs.update(dt);
    g.shells.update(dt);
    g.fx.update(dt);
    g.decals.update(dt);
    g.ctrl.updateCamera(dt);
    if (g.hooks.cutscene) { g.hooks.cutscene(dt); g.camPos.copy(g.renderer.camera.position); g.viewmodel.visible = false; }
    g.viewmodel.update(dt, me, g.ctrl.look);
    g.updateLighting(dt);
    g.sky.update(g.camPos);
    // use prompt (the host performs the actual interaction)
    if (!me.dead && !me.incapped && !me.pinned && !me.usingMounted) {
      const u = g.items.findUsable(me);
      g.currentUsable = u;
      g.items.setHighlight(u && u.item ? u.item : null);
    } else { g.currentUsable = null; g.items.setHighlight(null); }
    g.hooks.afterUpdate?.(dt);
    this.inputT -= dt;
    if (this.inputT <= 0) { this.inputT = INPUT_DT; this.sendInput(); }
  }
  collectEdges(c) {
    const e = this.edges;
    if (c.firePressed) e.fp = 1;
    if (c.usePressed) e.up = 1;
    if (c.jump) e.j = 1;
    if (c.reload) e.r = 1;
    if (c.shove) e.sh = 1;
    if (c.zoom) e.z = 1;
    if (c.flashlight) e.f = 1;
    if (c.lastWeapon) e.lw = 1;
    if (c.drop) e.dr = 1;
    if (c.slot >= 0) e.sl = c.slot;
  }
  sendInput() {
    const g = this.game;
    const s = g.player;
    const c = s.cmd, P = s.phys;
    const d = {
      k: 'in', yw: r3(s.yaw), pt: r3(s.pitch), mx: r2(c.mx), my: r2(c.my),
      h: (c.fire ? 1 : 0) | (c.use ? 2 : 0) | (c.crouch ? 4 : 0) | (c.sprint ? 8 : 0) | (c.shoveHeld ? 16 : 0),
      p: [r3(P.x), r3(P.y), r3(P.z)], v: [r2(P.vx), r2(P.vy), r2(P.vz)], g: P.onGround ? 1 : 0, tq: this.ackTp,
    };
    if (Object.keys(this.edges).length) { d.e = this.edges; this.edges = {}; }
    this.link.up(d);
  }
  close() {
    for (const l of this.loops.values()) l.h?.stop?.(0.1);
    this.loops.clear();
    this.link.close();
    const g = this.game;
    if (g) { g.net = null; if (g.player) g.player.netLocal = false; }
  }
}

// ---------------------------------------------------- puppet updates --
Common.prototype.puppetUpdate = function (dt) {
  const n = this.net;
  if (n) {
    this.pos.set(n.x, n.y, n.z);
    this.yaw = n.yaw;
    this.state = n.state;
    this.idle = n.idle;
    this.curSpeed = n.sp;
    this.attackT = n.at;
    this.climb = n.fl & 2 ? (this.climb || { t: 0 }) : null;
    this.falling = !!(n.fl & 4);
    this.burning = n.fl & 1 ? 1 : 0;
  }
  this.hitReact(dt);
  const g = this.game;
  if (this.burning > 0 && Math.random() < 0.5) g.fx.fire(this.pos.x + (Math.random() - 0.5) * 0.3, this.pos.y + 0.5 + Math.random(), this.pos.z + (Math.random() - 0.5) * 0.3, 0.5);
  this.animate(dt);
};

SpecialInfected.prototype.puppetUpdate = function (dt) {
  const g = this.game;
  if (this.dead) {
    this.deadT += dt;
    if (this.ragdoll) this.ragdoll.step(dt, g.level.col);
    this.pos.set(this.body.jx(J.PELVIS), this.body.jy(J.PELVIS), this.body.jz(J.PELVIS));
    this.rig.update(this.body);
    if (this.deadT > 40) this.remove();
    return;
  }
  const n = this.net;
  if (n) {
    this.pos.set(n.x, n.y, n.z);
    this.yaw = n.yaw;
    if (n.state !== this.state) this.stateT = n.st; else this.stateT += dt;
    this.state = n.state;
    this.curSpeed = n.sp;
    this.hp = n.hp;
    this.airborne = !!(n.fl & 1);
    this.enraged = !!(n.fl & 2);
    this.burning = n.fl & 4 ? 1 : 0;
    this.stumble = n.fl & 8 ? (this.stumble || { t: 1, vx: 0, vz: 0 }) : null;
    this.climb = n.fl & 16 ? (this.climb || { t: 0 }) : null;
    this.falling = !!(n.fl & 32);
    this.hitDone = !!(n.fl & 64);
    this.target = survivorByChar(g, n.target);
    this.pinning = survivorByChar(g, n.pin);
    this.rage = n.rage;
    const ex = n.ex;
    if (this.kind === 'smoker' && ex) {
      this.tongueLen = ex[0];
      this.tongueDir = this.tongueDir || new THREE.Vector3();
      this.tongueDir.set(ex[1], ex[2], ex[3]);
      this.tongueEnd.set(ex[4], ex[5], ex[6]);
    }
    if (this.kind === 'tank') {
      if (ex) { this.rockMesh.visible = true; this.rockMesh.position.set(ex[0], ex[1], ex[2]); this.rockMesh.rotation.x += dt * 5; }
      else this.rockMesh.visible = false;
    }
  }
  this.hitReact(dt);
  if (this.burning > 0 && Math.random() < 0.6) g.fx.fire(this.pos.x + (Math.random() - 0.5) * 0.4, this.pos.y + 0.5 + Math.random() * this.height * 0.7, this.pos.z + (Math.random() - 0.5) * 0.4, 0.6);
  if (this.kind === 'smoker') this.updateTongue();
  this.animate(dt);
};
