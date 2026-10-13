// Zombie survival drops, power-ups and airdrops (Milestone 3.5, owner: drops). Kills leave
// small loot (cash, ammo, a health vial) within a per-wave budget (diff.drops); rare power-ups
// (powerups.js: Max Ammo, Insta-Kill, Double Cash, Nuke, Fire Sale); a mid-wave flare marks an
// airdrop crate (a heavy gun or a rare attachment) worth a run across open ground. Loot fades
// after diff.drops.life s.
//
// Contract (m3-contracts section 6) - one list for everything on the floor: game.dropped.
// A weapon entry is { kind: 'weapon', weapon, pos, vel, obj, rest, time } as always; a pickup
// is { kind, id, amount, data, pos, vel, obj, rest, time, expire, reach, gravity, taken }.
// game.updateDropped moves them all (gravity, bounce, settle) and hands a touch to
// game.tryPickup, which sends every kind but 'weapon' here (take). Kinds are PICKUP_KINDS rows:
//   { label, rgb, reach (u; how close counts as a touch), life (true: diff.drops.life s, a
//     number: s, 0: never fades), who ('squad': anyone in it, up and not down; 'human': you),
//     model (a MODELS id), spin (rad/s) / bob (u) on the floor, gravity (u/s^2; 800),
//     canTake(Z, p, d) -> bool (optional), take(Z, p, d) -> true if it was used up }
//   pickups.spawn(kind, pos, { id, amount, data, vel, life, reach, gravity }) -> the entry (or null)
//   pickups.register(kind, spec)   add / replace a kind (the trophy is relics.js TROPHY)
//   pickups.take(p, d)             game.tryPickup: p touched d; true if taken
//   pickups.count(kind) / list(kind)
// Events: 'pickup' { phase: 'spawn' | 'take' | 'expire', kind, id, amount, player, pos },
// 'powerup' { phase: 'on' | 'off', id, player, until }, 'airdrop' { phase: 'call' | 'land' |
// 'open', id, pos } (runstats.js; the drops builder emits the last two).
// Difficulty: g.zombies.diff.drops { budget, chance, powerup, life, powerupSecs, airdropFrom,
// airdropChance } (zdiff.js).
// Console: zm_drops; with sv_cheats 1: zm_drop <kind> [id] [amount] (in front of you).
//
// Scaffold (foundation): the kinds below work (plain models), spawn / take / fade work;
// nothing drops anything yet.
import * as THREE from 'three';
import { inSquad } from './runstats.js';
import { TROPHY } from './relics.js';
import { POWERUPS } from './powerups.js';
import { WEAPON_DEFS } from './weaponsys.js';
import { angleVectors } from '../engine/coords.js';

const rand = (a, b) => a + Math.random() * (b - a);
const BLINK = 5; // s before fading out that it starts to blink
const _f = [0, 0, 0];

const refill = (w, packs) => {
  if (!w || !w.def.ammoBuy || w.ammo >= w.def.maxAmmo) return false;
  w.ammo = Math.min(w.def.maxAmmo, w.ammo + Math.round(w.def.ammoBuy.amount * packs));
  return true;
};

export const PICKUP_KINDS = {
  cash: {
    label: 'Cash', rgb: [90, 230, 90], reach: 32, life: true, who: 'squad', model: 'cash',
    take(Z, p, d) { Z.economy.pay(p, d.amount ?? 50, 'pickup'); return true; },
  },
  ammo: {
    label: 'Ammo', rgb: [220, 190, 90], reach: 32, life: true, who: 'squad', model: 'ammo',
    canTake(Z, p) { return [p.weapons[1], p.weapons[2]].some((w) => w && w.def.ammoBuy && w.ammo < w.def.maxAmmo); },
    take(Z, p, d) { const a = refill(p.weapons[1], d.amount ?? 1), b = refill(p.weapons[2], d.amount ?? 1); return a || b; },
  },
  health: {
    label: 'Health', rgb: [240, 90, 80], reach: 32, life: true, who: 'squad', model: 'health',
    canTake(Z, p) { return p.health < p.maxHealth; },
    take(Z, p, d) { p.health = Math.min(p.maxHealth, p.health + (d.amount ?? 25)); if (p.isLocal) Z.game.hud?.healFlash?.(); return true; },
  },
  powerup: {
    label: 'Power-up', rgb: [255, 255, 255], reach: 36, life: true, who: 'squad', model: 'powerup', spin: 2.5, bob: 4,
    take(Z, p, d) {
      const P = POWERUPS[d.id];
      if (!P) return false;
      if (P.apply) P.apply(Z, p, d);
      if (P.buff) Z.perks.buff(P.squad ? 'squad' : p, P.buff, d.data?.secs ?? null, { source: 'powerup' });
      Z.game.hud?.centerPrint?.(P.name, 2);
      return true;
    },
  },
  airdrop: {
    label: 'Airdrop', rgb: [255, 140, 40], reach: 40, life: 0, who: 'squad', model: 'airdrop', gravity: 800,
    take(Z, p, d) {
      if (!WEAPON_DEFS[d.id]) return false;
      Z.game.giveWeapon(p, d.id, { select: true, fullAmmo: true });
      return true;
    },
  },
  trophy: TROPHY,
};

// ---------------------------------------------------------------- models (shared geometry and materials)
const GEO = new Map(), MAT = new Map();
const geo = (key, make) => GEO.get(key) || (GEO.set(key, make()), GEO.get(key));
const mat = (hex) => MAT.get(hex) || (MAT.set(hex, new THREE.MeshBasicMaterial({ color: hex })), MAT.get(hex));
const box = (x, y, z) => geo(`b${x},${y},${z}`, () => new THREE.BoxGeometry(x, y, z));
const part = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };
const hexOf = (rgb) => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];

/** Plain stand-in models by id (GoldSrc axes: z up, the origin on the floor). The drops builder dresses them up. */
export const MODELS = {
  cash: () => [part(box(10, 5, 2.4), mat(0x2f7a34), 0, 0, 1.2), part(box(3, 5.2, 2.6), mat(0xb8d8a0), 0, 0, 1.2)],
  ammo: () => [part(box(10, 6, 6), mat(0x4f5636), 0, 0, 3), part(box(10.2, 2, 1), mat(0xb08a3a), 0, 0, 6)],
  health: () => [part(box(9, 9, 5), mat(0xe6e6e6), 0, 0, 2.5), part(box(7, 2, 0.8), mat(0xc01818), 0, 0, 5.2), part(box(2, 7, 0.8), mat(0xc01818), 0, 0, 5.2)],
  powerup: (d) => {
    const P = POWERUPS[d.id], c = hexOf(P?.rgb || [255, 255, 255]);
    return [part(geo('octa', () => new THREE.OctahedronGeometry(5)), mat(c), 0, 0, 12), part(box(8, 8, 1), mat(0x202020), 0, 0, 0.5)];
  },
  airdrop: () => [part(box(28, 28, 22), mat(0x6e5230), 0, 0, 11), part(box(29, 4, 23), mat(0x2e2418), 0, 0, 11), part(box(4, 29, 23), mat(0x2e2418), 0, 0, 11)],
  trophy: () => [part(geo('ico', () => new THREE.IcosahedronGeometry(5, 0)), mat(0xffc040), 0, 0, 10), part(box(8, 8, 3), mat(0x2a2016), 0, 0, 1.5)],
};

export class Pickups {
  constructor(game) {
    this.game = game;
    this.kinds = { ...PICKUP_KINDS };
    this.subscribed = false;
    Promise.resolve().then(() => this.subscribe()); // (built before game.zombies is set)
  }

  get Z() { return this.game.zombies; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') this.reset(); });
  }

  /** A new run (ZombieMode.start already cleared the floor: game.clearDropped). */
  reset() {}

  /** Add or replace a kind (spec: the PICKUP_KINDS row shape). */
  register(kind, spec) { this.kinds[kind] = spec; }

  /** Put a kind of pickup down at pos (it falls and settles). o: { id, amount, data, vel, life (s), reach, gravity }. */
  spawn(kind, pos, o = {}) {
    const g = this.game, K = this.kinds[kind];
    if (!K || kind === 'weapon') return null;
    const d = {
      kind, id: o.id ?? null, amount: o.amount ?? null, data: o.data || null, weapon: null,
      pos: pos.slice(), vel: o.vel ? o.vel.slice() : [rand(-50, 50), rand(-50, 50), 140],
      obj: this.model(K, o), rest: false, time: g.time, expire: 0,
      reach: o.reach ?? K.reach ?? 28, gravity: o.gravity ?? K.gravity ?? 800, taken: false,
    };
    d.obj.userData.pickup = d;
    const life = o.life ?? (K.life === true ? this.Z.diff.drops.life : K.life || 0);
    d.expire = life > 0 ? g.time + life : 0;
    d.obj.position.set(pos[0], pos[1], pos[2]);
    g.renderer?.world?.add(d.obj);
    g.dropped.push(d);
    this.emit('spawn', d, null);
    return d;
  }

  model(K, o) {
    const grp = new THREE.Group();
    grp.name = `pickup_${K.model}`;
    const inner = new THREE.Group(); // (spun and bobbed by frame)
    for (const m of (MODELS[K.model] || MODELS.ammo)({ id: o.id ?? null, data: o.data || null })) inner.add(m);
    grp.add(inner);
    grp.userData.inner = inner;
    grp.userData.dispose = () => {}; // (shared geometry and materials)
    return grp;
  }

  /** May p have it at all (K.who)? */
  may(p, K) {
    if (!p.alive || p.downed || !inSquad(p)) return false;
    return K.who !== 'human' || !p.isBot;
  }

  /** game.tryPickup: p touched d. True if it was taken. */
  take(p, d) {
    const K = this.kinds[d.kind];
    if (!K || d.taken || !this.may(p, K)) return false;
    if (K.canTake && !K.canTake(this.Z, p, d)) return false;
    if (!K.take(this.Z, p, d)) return false;
    this.remove(d);
    this.game.sound?.play('ammo_pickup', { pos: p.isLocal ? null : p.eyePos(), volume: 0.8 });
    this.emit('take', d, p);
    return true;
  }

  remove(d) {
    d.taken = true;
    d.obj.removeFromParent();
    d.obj.userData.dispose?.();
  }

  emit(phase, d, p) {
    this.Z.events.mode('pickup', { phase, kind: d.kind, id: d.id, amount: d.amount, player: p, pos: d.pos });
  }

  list(kind = null) { return this.game.dropped.filter((d) => d.kind !== 'weapon' && !d.taken && (!kind || d.kind === kind)); }
  count(kind = null) { let n = 0; for (const d of this.game.dropped) if (d.kind !== 'weapon' && !d.taken && (!kind || d.kind === kind)) n++; return n; }

  // ---------------------------------------------------------------- scaffold hooks
  /** Every tick (ZombieMode.tick): loot fades (blinking its last BLINK s). */
  tick(t) {
    for (const d of this.game.dropped) {
      if (!d.expire || d.taken) continue;
      if (t >= d.expire) { this.remove(d); this.emit('expire', d, null); continue; }
      d.obj.visible = t < d.expire - BLINK || (t * 6) % 1 < 0.6;
    }
  }

  /** HUD state (buildHudState, every frame). */
  hud(s) { void s; }

  /** Per frame (game.frame, zombie mode only): power-ups and trophies spin and bob on the floor. */
  frame(dt) {
    const t = this.game.time;
    for (const d of this.game.dropped) {
      if (d.kind === 'weapon' || d.taken) continue;
      const K = this.kinds[d.kind], inner = d.obj.userData.inner;
      if (!K || !inner) continue;
      if (K.spin) inner.rotation.z += K.spin * dt;
      if (K.bob) inner.position.z = K.bob * (0.5 + 0.5 * Math.sin(t * 2.4 + d.time));
    }
  }

  /** zm_drops; with sv_cheats 1: zm_drop <kind> [id] [amount]. */
  command(p, cmd, args = []) {
    const g = this.game, out = (t) => g.console?.print?.(t);
    if (cmd === 'zm_drops') { out(this.list().map((d) => `${d.kind}${d.id ? ':' + d.id : ''}${d.expire ? ` ${Math.max(0, d.expire - g.time).toFixed(0)}s` : ''}`).join(', ') || 'nothing on the floor'); return true; }
    if (cmd !== 'zm_drop') return false;
    if (!g.console?.cheats) { out('zm_drop needs sv_cheats 1'); return true; }
    const kind = String(args[0] || '');
    if (!this.kinds[kind] || kind === 'weapon') { out(`zm_drop <${Object.keys(this.kinds).join('|')}> [id] [amount]`); return true; }
    if (!p.alive) { out('zm_drop: you are dead'); return true; }
    angleVectors(0, p.pm.angles[1], _f, null, null);
    const o = p.pm.origin, pos = [o[0] + _f[0] * 80, o[1] + _f[1] * 80, o[2] + 10];
    this.Z.taint();
    const d = this.spawn(kind, pos, { id: args[1] || (kind === 'powerup' ? Object.keys(POWERUPS)[0] : kind === 'airdrop' ? 'minigun' : null), amount: args[2] != null ? +args[2] : null, vel: [0, 0, 60] });
    out(d ? `${kind}${d.id ? ' ' + d.id : ''} dropped` : 'zm_drop: no');
    return true;
  }
}
