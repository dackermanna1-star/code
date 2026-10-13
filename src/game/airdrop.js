// Zombie survival airdrops (Milestone 3.5, owner: drops; pickups.js runs it). From wave
// diff.drops.airdropFrom, a wave (not a boss wave) gets one with diff.drops.airdropChance:
// partway through it a red flare pops on open ground away from the squad (500-1400 units by
// path) and a column of red smoke climbs over it; a few seconds later a plane passes over and a
// crate comes down under a parachute (falling with gravity, its drop held to a parachute's
// speed), lands, and sits there with its beacon blinking for diff.drops.crateLife s. Holding
// use beside it for OPEN_T s opens it: a heavy gun (a minigun, an AA-12, a Barrett...: the
// table below; the zombie-only heavies the arsenal adds come in by price) or a rare weapon kit
// (every attachment that fits your primary, and gold plating), and armour.
//
// States: null -> 'flare' (the flare is up) -> 'falling' (the crate is coming down) -> 'landed'
// -> 'opened' (the lid's off; gone in a moment) | gone (faded unopened). Events: 'airdrop'
// { phase: 'call' | 'land' | 'open', id (what was in it, on open), pos } (runstats.js).
import { TraceResult, MASK_WORLD_PLAYER } from '../engine/collision.js';
import { inSquad } from './runstats.js';
import { WEAPON_DEFS } from './weaponsys.js';
import { ATTACHMENTS, ATTACHMENT_IDS, isGun, whyNot, fit, forgeTarget, canRound, TIER_NAMES } from './attachments.js';
import { chuteModel, flareModel } from '../assets/dropmodels.js';

const CORE_P = 0.2, DRAFT_P = 0.2; // a crate's odds (when it isn't a weapon kit) of a forge core / a supply draft; else a heavy gun
const CORE_ROUNDS = ['incendiary', 'shock', 'cryo', 'explosive']; // a forge core that reaches the round tier loads one of these
const rand = (a, b) => a + Math.random() * (b - a);
const tr = new TraceResult();
const FLARE_T = 6; // s from the flare to the crate showing up overhead
const CHUTE = 165; // u/s: a parachute's drop (gravity takes it there and drag holds it)
const OPEN_T = 1.5; // s of holding use to open it
const OPEN_REACH = 60; // u (xy) from the crate's middle
const BEEP = 1.6; // s between beacon beeps
const GONE = 2.5; // s an opened crate stays before it goes
const CRATE_BOX = { mins: [-18, -18, 0], maxs: [18, 18, 28] }; // room it needs coming down
const _a = [0, 0, 0], _b = [0, 0, 0], _v = [0, 0, 0];

/** The heavy guns a crate can hold: [id, weight, first wave, launcher (never for a bot)]. */
export const HEAVY = [
  ['m249', 3, 1], ['aa12', 3, 1], ['flamethrower', 1.5, 1], ['barrett', 2, 4], ['m32', 1.5, 4, true],
  ['minigun', 2, 6], ['rpg', 1, 6, true], ['tesla', 2, 8],
];
const LAUNCHER = new Set(['launcher']);

export class Airdrops {
  constructor(pk) {
    this.pk = pk;
    this.state = null;
    this.planned = null; // { frac (of the wave's count killed), at (time) }: this wave's airdrop
    this.crate = null; // its game.dropped entry
    this.flare = null; // { obj, pos, sound }
    this.opener = null; this.prog = 0; this.lastT = 0;
    this.emitAcc = 0; this.sparkAcc = 0;
    this.hs = { state: null, pos: [0, 0, 0], left: 0, prog: 0, mine: false };
  }

  get game() { return this.pk.game; }
  get Z() { return this.pk.game.zombies; }

  reset() {
    this.cleanup();
    this.planned = null;
  }

  /** Take everything down (a new run, a crate gone). */
  cleanup() {
    if (this.flare) {
      this.flare.obj.removeFromParent();
      this.flare.sound?.stop(0.4);
      this.flare.glow?.removeFromParent();
    }
    this.flare = null;
    if (this.crate && !this.crate.taken) this.pk.remove(this.crate);
    this.crate = null;
    this.state = null;
    this.opener = null; this.prog = 0;
  }

  /** Wave n starts: an airdrop in it, maybe (pickups.onWave). */
  plan(n, boss) {
    const D = this.Z.diff.drops;
    this.planned = null;
    if (boss || n < D.airdropFrom || this.state) return;
    if (this.pk.rnd() >= D.airdropChance) return;
    this.planned = { frac: rand(0.15, 0.4), at: this.game.time + rand(30, 55), from: this.game.time + 10 };
  }

  // ---------------------------------------------------------------- the flare
  /**
   * Somewhere to drop: a nav spot 500-1400 units from the squad by path (the flow field: so
   * it can be walked to), with open sky over it and room for the crate. Null if none.
   */
  spot() {
    const g = this.game, Z = this.Z, nodes = g.nav?.nodes;
    if (!nodes?.length) return null;
    const me = g.local?.alive ? g.local : g.players.find((q) => inSquad(q) && q.alive);
    if (!me) return null;
    const dist = Z.dist;
    let best = null, bs = -Infinity;
    for (let i = 0; i < 90; i++) {
      const n = nodes[Math.floor(Math.random() * nodes.length)];
      const pd = dist && dist.length === nodes.length ? dist[n.id] : Math.hypot(n.x - me.pm.origin[0], n.y - me.pm.origin[1]);
      if (!(pd >= 500 && pd <= 1400)) continue;
      // sky: how far up it's clear for a crate
      _a[0] = n.x; _a[1] = n.y; _a[2] = n.z + 8;
      _b[0] = n.x; _b[1] = n.y; _b[2] = n.z + 1300;
      g.collision.trace(_a, _b, CRATE_BOX.mins, CRATE_BOX.maxs, MASK_WORLD_PLAYER, tr);
      if (tr.startsolid) continue;
      const clear = tr.fraction * 1292;
      if (clear < 360) continue;
      const score = Math.min(clear, 900) * 0.6 - Math.abs(pd - 900) * 0.5 - Math.abs(n.z - me.pm.origin[2]) * 0.8;
      if (score > bs) { bs = score; best = { pos: [n.x, n.y, n.z], clear }; }
    }
    return best;
  }

  /** Put the flare up (force: the cheat, any time in a run). True if one went up. */
  call(force = false) {
    const g = this.game, Z = this.Z;
    if (this.state || (!force && Z.state !== 'wave')) return false;
    const s = this.spot();
    if (!s) return false;
    this.planned = null;
    const obj = flareModel();
    obj.position.set(s.pos[0], s.pos[1], s.pos[2]);
    obj.rotation.z = Math.random() * Math.PI * 2;
    g.renderer?.world?.add(obj);
    this.flare = { obj, pos: s.pos, clear: s.clear, sound: g.sound?.loop('flare_loop', { pos: [s.pos[0], s.pos[1], s.pos[2] + 8], volume: 0.9 }) };
    this.state = 'flare';
    this.dropAt = g.time + FLARE_T;
    this.emitAcc = 0;
    g.sound?.play('airdrop_flare', { pos: [s.pos[0], s.pos[1], s.pos[2] + 8], volume: 1 });
    this.pk.ui.show('flare', 'AIRDROP INBOUND', 'Follow the red smoke. Hold E at the crate.');
    g.announce?.('Supply drop inbound');
    Z.events.mode('airdrop', { phase: 'call', id: null, pos: s.pos });
    return true;
  }

  // ---------------------------------------------------------------- the crate
  /** The crate shows up overhead and comes down. */
  spawnCrate() {
    const g = this.game, f = this.flare;
    const h = Math.max(260, Math.min(f.clear - 40, 1000));
    const d = this.pk.spawn('airdrop', [f.pos[0], f.pos[1], f.pos[2] + h], { vel: [0, 0, -CHUTE], life: 0, gravity: 320 });
    if (!d) { this.cleanup(); return; }
    this.adopt(d);
    g.sound?.play('airdrop_plane', { volume: 0.9, attenuation: 'none' });
  }

  /** d (an 'airdrop' entry) is the crate now: on its parachute (the zm_drop cheat lands one too). */
  adopt(d) {
    if (this.crate && this.crate !== d && !this.crate.taken) this.pk.remove(this.crate);
    this.crate = d;
    this.state = 'falling';
    const ch = chuteModel();
    d.obj.add(ch);
    d.obj.userData.chute = ch;
    d.chuteT = 0;
    this.opener = null; this.prog = 0;
  }

  land(d) {
    const g = this.game, t = g.time, Z = this.Z;
    this.state = 'landed';
    d.landT = t;
    d.expire = t + Z.diff.drops.crateLife;
    d.nextBeep = t + 0.8;
    const p = d.pos;
    g.sound?.play('airdrop_land', { pos: p, volume: 1 });
    g.shakeAt?.(p, 3, 900);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(120, 300);
      _v[0] = Math.cos(a) * s; _v[1] = Math.sin(a) * s; _v[2] = rand(10, 70);
      g.fire?.emit('dust', [p[0] + Math.cos(a) * 16, p[1] + Math.sin(a) * 16, p[2] + 4], _v, { life: rand(0.8, 1.6), size: rand(14, 24), size1: rand(50, 80), drag: 2.5, buoy: 10 });
    }
    Z.events.mode('airdrop', { phase: 'land', id: null, pos: p });
  }

  /** Opened by p: what's inside. Returns true (it's used up). */
  open(p, d) {
    const g = this.game, Z = this.Z, t = g.time;
    if (d.opened) return false;
    d.opened = true;
    d.expire = 0;
    d.goneAt = t + GONE;
    if (this.crate !== d) { if (this.crate && !this.crate.taken) this.pk.remove(this.crate); this.crate = d; } // (one handed over directly: pickups.take, a test)
    this.state = 'opened';
    this.opener = null; this.prog = 0;
    const got = this.reward(p, d);
    const inner = d.obj.userData.inner;
    for (const c of inner?.children || []) { if (c.userData.beacon) c.visible = false; if (c.userData.inside) c.visible = true; }
    d.lidT = t;
    g.sound?.play('crate_open', { pos: d.pos, volume: 1 });
    this.pk.ui.crateBanner(got, p);
    this.pk.stats.taken++;
    this.pk.emit('take', d, p);
    Z.events.mode('airdrop', { phase: 'open', id: got.id, pos: d.pos });
    if (this.flare) { this.flare.sound?.stop(1.5); this.flare.sound = null; }
    return true;
  }

  /**
   * What p finds (d.id names a gun: the zm_drop cheat): a heavy gun (never one p holds; a
   * bot gets no launcher) or, about a third of the time when the gun in p's hands can take
   * some, a weapon kit; else now and then a forge core (the gun in hand a tier up) or a supply
   * draft (a perk card). Armour either way. Returns { id, kind: 'gun' | 'kit', name, text }.
   */
  reward(p, d) {
    const g = this.game, rnd = this.pk.rnd;
    p.armor = 100; p.helmet = true;
    const w = isGun(p.weapons[1]) ? p.weapons[1] : null; // (a kit is for a primary)
    const kit = w && !d.id ? ATTACHMENT_IDS.filter((a) => !whyNot(w, a) && !w.att?.[ATTACHMENTS[a].slot]) : [];
    if (!d.id && kit.length >= 2 && rnd() < 0.34) {
      for (const a of kit) fit(w, a);
      w.skin = 'gold';
      if (w.def.maxAmmo > 0) w.ammo = w.def.maxAmmo;
      w.clip = Math.max(w.clip, w.clipMax ?? w.clip);
      g.onLoadoutChanged?.(p, w);
      const gun = w.def.shortName || w.def.name;
      return { id: 'kit', kind: 'kit', name: 'WEAPON KIT', text: `${kit.map((a) => ATTACHMENTS[a].name).join(', ')} and gold plating on your ${gun}` };
    }
    // (Milestone 3 together: a forge core - your gun a tier up, zforge.js - or a supply draft -
    // pick 1 of 3 uncommon-or-rarer perks, perks.js; a draft opened mid-wave waits for the break)
    const x = d.id ? 1 : rnd(), Z = this.Z, fw = forgeTarget(p), FD = Z.diff.forge;
    if (x < CORE_P && fw && (fw.tier | 0) < FD.tiers) {
      fw.tier = (fw.tier | 0) + 1;
      if (fw.tier >= FD.roundFrom && !fw.round && canRound(fw)) fw.round = CORE_ROUNDS[Math.floor(rnd() * CORE_ROUNDS.length)];
      Z.forge.refit(p, fw);
      if (fw.def.maxAmmo > 0) fw.ammo = fw.def.maxAmmo;
      if (p.isLocal) { Z.forge.present(p, fw, fw.tier >= 5); g.sound?.play(fw.tier >= 5 ? 'forge_tier5' : 'forge_hammer', { volume: 0.8 }); }
      const gun = fw.def.shortName || fw.def.name;
      return { id: 'core', kind: 'kit', name: 'FORGE CORE', text: `your ${gun} forged to Tier ${TIER_NAMES[fw.tier]}${fw.round ? `, ${fw.round} rounds` : ''}, full ammo, and armour` };
    }
    if (x < CORE_P + DRAFT_P) {
      const ids = Z.perks.roll(3, { p, curses: false, weight: (pid, row, wt) => (row.rarity === 'common' ? 0 : wt) });
      if (ids.length) {
        Z.perks.offer(p, ids, { source: 'airdrop', title: 'SUPPLY DRAFT - PICK A PERK', quiet: true });
        return { id: 'draft', kind: 'kit', name: 'SUPPLY DRAFT', text: Z.state === 'wave' ? 'a perk card for you at the break, and armour' : 'pick a perk, and armour' };
      }
    }
    const id = d.id && WEAPON_DEFS[d.id] ? d.id : this.heavy(p);
    g.giveWeapon(p, id, { select: true, fullAmmo: true });
    const def = WEAPON_DEFS[id];
    return { id, kind: 'gun', name: (def.shortName || def.name).toUpperCase(), text: def.name };
  }

  /** A heavy gun for p by wave (HEAVY, plus any zombie-only primary at $4000+ the arsenal added). */
  heavy(p) {
    const n = Math.max(1, this.Z.wave), have = p.weapons[1]?.id, rnd = this.pk.rnd;
    const pool = [];
    let total = 0;
    const add = (id, w, from, launcher) => {
      const def = WEAPON_DEFS[id];
      if (!def || id === have || n < from || (p.isBot && (launcher || LAUNCHER.has(def.kind)))) return;
      pool.push(id, w); total += w;
    };
    for (const [id, w, from, l] of HEAVY) add(id, w, from, l);
    for (const id in WEAPON_DEFS) {
      const def = WEAPON_DEFS[id];
      if (def.zombieOnly && def.slot === 1 && def.price >= 4000 && !HEAVY.some((h) => h[0] === id)) add(id, 1.5, 5, false);
    }
    if (!pool.length) return have === 'm249' ? 'aa12' : 'm249';
    let x = rnd() * total;
    for (let i = 0; i < pool.length; i += 2) { x -= pool[i + 1]; if (x <= 0) return pool[i]; }
    return pool[pool.length - 2];
  }

  // ---------------------------------------------------------------- hooks (pickups.js)
  tick(t) {
    const Z = this.Z, dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    const P = this.planned;
    if (P && Z.state === 'wave' && t >= P.from && (Z.killed >= P.frac * (Z.stats?.count || 1) || t >= P.at)) {
      if (!this.call()) P.at = t + 5; // (no spot right now: try again in a bit)
    }
    if (!this.state) return;
    if (this.state === 'flare' && t >= this.dropAt) { this.spawnCrate(); return; }
    const d = this.crate;
    if (!d) { if (this.state !== 'flare') this.cleanup(); return; }
    if (d.taken && !d.opened) { this.cleanup(); return; } // (faded unopened, or cleared away)
    if (this.state === 'falling') {
      if (!d.rest) { if (d.vel[2] < -CHUTE) d.vel[2] = -CHUTE; }
      else this.land(d);
      return;
    }
    if (this.state === 'landed') {
      if (t >= d.nextBeep) { d.nextBeep = t + BEEP; this.game.sound?.play('crate_beep', { pos: d.pos, volume: 0.7 }); }
      this.useTick(d, dt);
      return;
    }
    if (this.state === 'opened' && t >= d.goneAt) {
      if (!d.taken) this.pk.remove(d);
      this.crate = null;
      this.cleanup();
    }
  }

  /** Who's holding use beside the crate (p.cmd: you and the bots alike); OPEN_T s of it opens it. */
  useTick(d, dt) {
    const g = this.game;
    let who = null;
    for (const q of g.players) {
      if (!inSquad(q) || !q.alive || q.downed || q.reviving || !q.cmd || !(q.cmd.wbuttons & 8)) continue;
      const o = q.pm.origin;
      if (Math.hypot(o[0] - d.pos[0], o[1] - d.pos[1]) > OPEN_REACH || Math.abs(o[2] - 36 - d.pos[2]) > 64) continue;
      if (q === this.opener) { who = q; break; }
      if (!who) who = q;
    }
    if (!who) { this.opener = null; this.prog = Math.max(0, this.prog - dt * 2); return; }
    if (who !== this.opener) { this.opener = who; this.prog = 0; }
    this.prog += dt / OPEN_T;
    if (this.prog >= 1) this.open(who, d);
  }

  /** HUD state: H.crate (reused) while there's an airdrop; H.prompt when you can open it. */
  hud(H) {
    const S = this.hs, g = this.game, me = g.local;
    H.crate = null; H.prompt = null;
    if (!this.state) return;
    const d = this.crate, f = this.flare;
    S.state = this.state;
    const p = d && !d.taken ? d.pos : f?.pos;
    if (!p) return;
    S.pos[0] = p[0]; S.pos[1] = p[1]; S.pos[2] = p[2];
    S.left = d?.expire ? Math.max(0, d.expire - g.time) : 0;
    S.prog = this.prog;
    S.mine = !!me && this.opener === me;
    H.crate = S;
    if (this.state === 'landed' && me?.alive && !me.downed && inSquad(me)) {
      const o = me.pm.origin;
      if (Math.hypot(o[0] - d.pos[0], o[1] - d.pos[1]) <= OPEN_REACH && Math.abs(o[2] - 36 - d.pos[2]) <= 64) H.prompt = S;
    }
  }

  /** Per frame: the flare burns and smokes, the crate sways on its chute, the beacon blinks, the lid comes off. */
  frame(dt) {
    if (!this.state) return;
    const g = this.game, t = g.time, f = this.flare, d = this.crate;
    if (f) {
      const fo = f.obj, p = f.pos;
      for (const c of fo.children) if (c.userData.flicker) c.scale.setScalar(c.userData.halo * rand(0.8, 1.15));
      // the smoke column: thick while it's coming, thinner once it's down, none once opened
      const rate = this.state === 'flare' || this.state === 'falling' ? 16 : this.state === 'landed' ? 6 : 0;
      this.emitAcc += dt * rate;
      while (this.emitAcc >= 1) {
        this.emitAcc -= 1;
        _v[0] = rand(-12, 12); _v[1] = rand(-12, 12); _v[2] = rand(70, 110);
        g.fire?.emit('signal', [p[0] + rand(-4, 4), p[1] + rand(-4, 4), p[2] + 6], _v, { life: rand(5, 7.5), size: rand(14, 22), size1: rand(90, 150), drag: 0.15, buoy: 12 });
      }
      if (this.state !== 'opened') {
        this.sparkAcc += dt * 26;
        while (this.sparkAcc >= 1) {
          this.sparkAcc -= 1;
          _v[0] = rand(-60, 60); _v[1] = rand(-60, 60); _v[2] = rand(40, 160);
          g.fire?.emit('spark', [p[0] + rand(-3, 3), p[1] + rand(-3, 3), p[2] + 3], _v, { life: rand(0.2, 0.5), size: rand(1.5, 3), size1: 0.5, drag: 1, buoy: -300 });
        }
      }
    }
    if (!d) return;
    const inner = d.obj.userData.inner, ch = d.obj.userData.chute;
    if (ch && ch.visible) {
      if (this.state === 'falling') { ch.rotation.x = Math.sin(t * 1.3) * 0.08; ch.rotation.y = Math.cos(t * 1.1) * 0.08; if (inner) { inner.rotation.x = ch.rotation.x * 0.6; inner.rotation.y = ch.rotation.y * 0.6; } }
      else {
        // collapsing: the canopy sags and drifts off to one side
        d.chuteT = (d.chuteT || 0) + dt;
        const k = Math.min(1, d.chuteT / 0.9);
        ch.scale.set(1 + 0.3 * k, 1 + 0.3 * k, Math.max(0.05, 1 - k));
        ch.position.x = 30 * k;
        ch.rotation.y = 0.9 * k;
        if (inner) { inner.rotation.x = 0; inner.rotation.y = 0; }
        if (k >= 1) ch.visible = false;
      }
    }
    if (!inner) return;
    for (const c of inner.children) {
      if (c.userData.beacon) c.visible = this.state === 'landed' && (t * 1.25) % 1 < 0.35;
      if (c.userData.inside && c.visible) c.scale.setScalar(c.userData.halo * (0.7 + 0.3 * Math.sin(t * 6)));
    }
    if (d.lidT) {
      // the lid flips off
      const lid = inner.children.find((c) => c.userData.lid);
      const k = Math.min(1, (t - d.lidT) / 0.55);
      if (lid) {
        lid.visible = true;
        lid.position.set(36 * k, 0, 20 + 14 * Math.sin(k * Math.PI) - 18 * k); // (up, over and down flat beside it)
        lid.rotation.y = 0.7 * Math.sin(k * Math.PI) + 0.12 * k;
      }
    }
  }
}

