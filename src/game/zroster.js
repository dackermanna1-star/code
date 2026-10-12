// Zombie survival common roster (Milestone 2.5, owner: roster): the commons get looks and
// subtypes - zombified CTs, terrorists, scientists, fat and thin bodies, each its own voice
// pitch - and variants with their own rules (COMMONS). The screamer is a special (a row in
// specials.js SPECIALS, its trick in screamer() here) that hangs back and calls surges
// (g.zombies.director.surge(z, { by: 'screamer' })).
//  - walker: any of the civilian / CT / terrorist / scientist / fat looks
//  - runner: always thin (the wave's runner share, 262-280 u/s)
//  - riot: helmet and a heavy vest; from the front the vest stops most of a body shot (kevlar:
//    no blood, a spark), the head under the cracked visor and the flanks / back are soft.
//    Capped per wave (diff.roster.riotCap), later waves only (from + diff.roster.shift)
//  - crawler: on its belly (playermodels.js crawl pose): the hitboxes, head included, are down
//    at knee height; slow, frail. A leg knockdown (zstagger.js) makes any common one (become)
//  - bloater: swollen and slow; bursts in a cloud of gas that hurts the squad and the horde
//    alike (the gas never gibs a body: no blast "explode")
//  - burning: on fire for good (flames, charred); its claws set you alight (fire.burn); it
//    leaves a small fire where it falls
//  - screamer (special): keeps its distance, in sight; every screamEvery s it roots and
//    shrieks, and the horde surges (the director's surge, or, when it takes none, screamCall of the
//    wave queued to come now) - screamMax times, unless somebody kills it first; then it comes
//    for you itself (so a wave never stalls on one hiding at the back)
// Bodies: a skin per body (createPlayerModel(skin); a body's build is its skin's, body.js);
// spawnZombie reuses a free body of the skin skin(variant) names (a free one of the variant's
// looks if there is one), else makes one; with the pool full, reskin() swaps a free body's
// model for the look (its last corpse is baked first: bodies stay where they fall).
//
// Contract (m2-contracts):
//   z.variant          a common's COMMONS id ('walker', 'runner', 'riot', 'crawler', 'bloater',
//                      'burning'); null for specials and bosses. Set in spawnZombie, kept for
//                      the zombie's life (kill events carry it: e.variant); become() changes it
//   spawnZombie({ variant })  asks for one (the director's wave types do: Crawler Swarm, Iron
//                      Rain); without it roster.pick(wave, o) chooses.
//   roster.pick(wave, o)      the variant for a spawn with options o (o.speed given: a boss's
//                      summons, a walker)
//   roster.skin(variant)      the body's skin (ZOMBIE_SKINS, playermodels.js)
//   roster.reskin(z, skin)    the pool is full and no free body has that skin: z remade in it
//   roster.setup(z, variant, o)  after the generic reset: speed, health, damage, armour, voice
//   roster.dress(z, o)        after the model's reset (spawnZombie): size, crawl pose, char
//   roster.screamer(z, target, cmd, t)  the screamer's trick (Specials.think); false: chase
//   roster.adjust(z, attacker, damage, hitgroup, weaponId, dir, opts)  game.damagePlayer, a
//                      common hit (riot: the vest); returns the damage
//   roster.onClaw(z, target) / roster.onDeath(z, attacker)  ZombieMode.attack / onKilled
//   roster.become(z, variant)  turn a live common into another variant (leg knockdown ->
//                      'crawler', called by zstagger.js)
//   roster.bodyPoints(e)      bots.js aim points for a crawler (its head is at knee height)
// Difficulty: g.zombies.diff.roster { mix, shift, riotCap, screamEvery, screamMax, screamCall,
// gasHurt, gasZombie } (zdiff.js).
// Cheat: zm_common <variant> [near] (sv_cheats 1): one now, outside the wave's count.
import { createPlayerModel } from '../assets/playermodels.js';
import { HITGROUP } from './combatrules.js';

const rand = (a, b) => a + Math.random() * (b - a);
const DEG = Math.PI / 180;
const CORPSE_TIME = 4; // (as zombies.js: a body lies this long before it can be reused)

/** The everyday looks (walkers, crawlers and burning ones wear any of them). */
const WALKER_SKINS = ['zombie', 'zct', 'zterror', 'zsci', 'zfat'];
/** Each look's voice: x the pitch of its growls, swipes, pain and death (big and fat: low; thin: high). */
export const VOICE = { zombie: 1, zct: 0.94, zterror: 0.9, zsci: 1.07, zfat: 0.8, zthin: 1.16, zriot: 0.86, zbloat: 0.72 };
/** Every common look (bosses.js raiseDead: the Abomination raises their bodies). */
export const COMMON_SKINS = new Set([...WALKER_SKINS, 'zthin', 'zriot', 'zbloat']);

/**
 * The commons: name, skin (the main look) / skins (any of these), from (first wave; +
 * diff.roster.shift), weight (pick weight among the non-runners, a walker being 1, x
 * diff.roster.mix; 0 = off), hp / dmg (x the wave's), speed ([min, max] u/s, null = the
 * wave's x speedK), scale (the model), armor / helmet (riot: the vest, see adjust), and
 * crawl (the belly pose), burn ([seconds, x its claw a second]: sets you alight), gas (bursts).
 * Runners are the wave's share (waveStats().runners), not a weight.
 */
export const COMMONS = {
  walker: { name: 'Zombie', skin: 'zombie', skins: WALKER_SKINS, from: 1, weight: 0, hp: 1, dmg: 1, speed: null, speedK: 1, scale: 1, armor: 0, helmet: false },
  runner: { name: 'Runner', skin: 'zthin', skins: ['zthin'], from: 1, weight: 0, hp: 1, dmg: 1, speed: [262, 280], speedK: 1, scale: 1.01, armor: 0, helmet: false },
  riot: { name: 'Riot Zombie', skin: 'zriot', skins: ['zriot'], from: 10, weight: 0.1, hp: 1.3, dmg: 1.1, speed: null, speedK: 0.92, scale: 1.02, armor: 100, helmet: false, front: 0.6, flank: 1.15, head: 1.25 },
  crawler: { name: 'Crawler', skin: 'zombie', skins: WALKER_SKINS, from: 4, weight: 0.12, hp: 0.7, dmg: 0.8, speed: null, speedK: 0.72, scale: 1, armor: 0, helmet: false, crawl: true },
  bloater: { name: 'Bloater', skin: 'zbloat', skins: ['zbloat'], from: 6, weight: 0.06, hp: 1.5, dmg: 0.9, speed: null, speedK: 0.8, scale: 1.04, armor: 0, helmet: false, gas: true },
  burning: { name: 'Burning Zombie', skin: 'zombie', skins: WALKER_SKINS, from: 8, weight: 0.07, hp: 0.85, dmg: 0.8, speed: null, speedK: 1.05, scale: 1, armor: 0, helmet: false, burn: [2, 0.35] },
};
const PICKED = ['riot', 'crawler', 'bloater', 'burning']; // (the weighted ones, in a fixed order)

// the screamer: keeps HOLD u from its target (backs off inside it, sits still up to HOLD_MAX
// if it can see him), claws only when cornered; a shriek roots it SHRIEK s
const HOLD = 520, HOLD_MAX = 950, CORNERED = 130, SHRIEK = 1.6;
// a bloater's cloud: radius (u), how long (s)
export const GAS_R = 140; // (bots.js steers clear of it)
const GAS_TIME = 6;
const FLAMES = 60; // flames a second on a burning common

const _v = [0, 0, 0], _w = [0, 0, 0], _feet = [0, 0, 0];
const _fx = { life: 0, size: 0, size1: 0, drag: 0, buoy: 0 };

export class ZRoster {
  constructor(game) {
    this.game = game;
    this.subscribed = false;
    this.clouds = []; // live gas clouds { pos, until, next, by, z }
    this.reset();
    Promise.resolve().then(() => this.subscribe()); // (built before game.zombies is set)
  }

  get Z() { return this.game.zombies; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') this.reset(); });
    ev.on('wave', (e) => { if (e.phase === 'start') this.riots = 0; });
  }

  reset() {
    this.riots = 0; // riot zombies this wave (the cap)
    this.reskins = 0; // bodies remade in another look (pool full)
    this.clouds.length = 0;
  }

  /** Every tick (ZombieMode.tick): the gas clouds. */
  tick(t) {
    if (this.clouds.length) this.gas(t);
  }

  // ---------------------------------------------------------------- who comes
  /** May wave n bring variant k by pick (open from its wave, the riot cap)? */
  open(k, wave) {
    const C = COMMONS[k], R = this.Z.diff.roster;
    if (!(C.weight > 0) || wave < C.from + R.shift) return false;
    return k !== 'riot' || this.riots < this.riotCap();
  }

  /** How many riot zombies this wave may bring by pick (a share of its count, at least one). */
  riotCap() { return Math.max(1, Math.round((this.Z.stats?.count || 0) * this.Z.diff.roster.riotCap)); }

  /** The variant for a spawn (see the header). */
  pick(wave, o) {
    if (o.speed != null) return 'walker'; // (a boss's summons: their own speed)
    const S = this.Z.stats, R = this.Z.diff.roster;
    if (Math.random() < S.runners) return 'runner';
    // the rest by weight, a walker weighing 1
    let sum = 0;
    for (const k of PICKED) if (this.open(k, wave)) sum += COMMONS[k].weight;
    if (sum <= 0) return 'walker';
    let r = Math.random() * (sum * R.mix + 1);
    for (const k of PICKED) {
      if (!this.open(k, wave)) continue;
      r -= COMMONS[k].weight * R.mix;
      if (r <= 0) return k;
    }
    return 'walker';
  }

  /** The skin a variant's body wears: one of its looks, a look with a body free right now if there is one. */
  skin(variant) {
    const C = COMMONS[variant] || COMMONS.walker, list = C.skins;
    if (list.length === 1) return list[0];
    const t = this.game.time;
    let n = 0, pickSkin = null;
    for (const q of this.Z.pool) {
      if (q.special || q.alive || !(!q.deathTime || q.baked || q.gibbed || t - q.deathTime > CORPSE_TIME) || !list.includes(q.skin)) continue;
      if (Math.random() * ++n < 1) pickSkin = q.skin; // (one of the free ones, at random)
    }
    return pickSkin || list[Math.floor(Math.random() * list.length)];
  }

  /** The pool is full and no free body wears skin: z (a free common body) remade in that look. */
  reskin(z, skin) {
    if (!z) return null;
    if (z.skin === skin) return z;
    const g = this.game;
    if (z.deathTime && !z.baked && !z.gibbed) g.gore?.bakePlayer(z); // (its last body stays where it fell)
    z.model.dispose();
    z.model = createPlayerModel(skin);
    z.model.object3D.visible = false;
    g.renderer.world.add(z.model.object3D);
    z.skin = skin;
    this.reskins++;
    return z;
  }

  /** A common's variant stats, after spawnZombie's generic reset (o: its options). */
  setup(z, variant, o) {
    const S = this.Z.stats, C = COMMONS[variant] || COMMONS.walker;
    z.variant = COMMONS[variant] ? variant : 'walker';
    z.name = C.name;
    z.zSpeed = o.speed ?? (C.speed ? rand(C.speed[0], C.speed[1]) : S.speed * rand(0.9, 1.06) * C.speedK);
    if (C.hp !== 1) z.health = z.maxHealth = Math.round((o.health ?? S.health) * C.hp);
    if (C.dmg !== 1) z.zDamage = Math.round(S.damage * C.dmg);
    z.armored = !!C.armor; // (the riot vest: adjust)
    z.aflame = !!C.burn; // (on fire for good: onClaw, frame)
    z.gassy = !!C.gas; // (bursts: onDeath)
    z.armor = 0; z.helmet = false; // (the vest works per hit: adjust)
    z.voice = (VOICE[z.skin] ?? 1) * rand(0.96, 1.04);
    if (variant === 'riot') this.riots++;
  }

  /** After spawnZombie's model reset: its size, the crawl, the char of a burning one. */
  dress(z, o) {
    const C = COMMONS[z.variant] || COMMONS.walker, m = z.model;
    m.object3D.scale.setScalar(C.scale * (o.crawler ? 0.8 : 1));
    m.crawl = !!C.crawl;
    if (z.aflame) { z.char = 0.5; m.setChar(0.5); }
  }

  /** Make z (alive) another variant from now on (a leg knockdown: 'crawler', zstagger.js). True when it took. */
  become(z, variant) {
    if (!z?.alive || !z.variant || z.variant === variant || variant !== 'crawler' || z.gassy) return false;
    const C = COMMONS.crawler;
    z.variant = 'crawler';
    z.name = C.name;
    z.zSpeed = Math.min(z.zSpeed, this.Z.stats.speed * C.speedK);
    // (its vest, flames... stay: z.armored, z.aflame) knocked down, it goes onto its hands and knees
    // first (zstagger.js), then flat on its belly once it's there (zstagger.frame sets crawl)
    if (!(z.staggerUntil > this.game.time)) z.model.crawl = true;
    return true;
  }

  /** bots.js: where a crawler's head, chest and belly are (low, its head out in front). */
  bodyPoints(e) {
    const o = e.pm.origin, feet = o[2] - 36, y = e.pm.angles[1] * DEG, c = Math.cos(y), s = Math.sin(y);
    return { head: [o[0] + c * 12, o[1] + s * 12, feet + 23], chest: [o[0] + c * 4, o[1] + s * 4, feet + 15], belly: [o[0] - c * 8, o[1] - s * 8, feet + 10] };
  }

  // ---------------------------------------------------------------- hits, claws, deaths
  /**
   * game.damagePlayer, for a common (victim.variant set), before armour: the damage it takes.
   * A riot zombie's vest takes a body shot from the front (kevlar this hit: half through, no
   * blood, a spark, x front); its head and its flanks are soft. Hot path: no allocations.
   */
  adjust(z, attacker, damage, hitgroup, weaponId, dir, opts) {
    if (!z.armored) return damage;
    const C = COMMONS.riot;
    z.armor = 0;
    if (hitgroup === HITGROUP.HEAD) return damage * C.head; // (under the cracked visor)
    if (opts.blast) return damage * 0.75; // (the vest takes some of a blast)
    if (!dir || hitgroup === HITGROUP.GENERIC || hitgroup === HITGROUP.LEFTLEG || hitgroup === HITGROUP.RIGHTLEG) return damage;
    // from the front the shot travels against its facing
    const y = z.pm.angles[1] * DEG;
    if (dir[0] * Math.cos(y) + dir[1] * Math.sin(y) > -0.35) return damage * C.flank; // a flank or the back
    z.armor = C.armor; // (computeDamage: kevlar for this hit - no bleeding, the hit_kevlar sound)
    this.spark(z, attacker, dir);
    return damage * C.front;
  }

  /** Sparks off a riot vest where the shot came in (on the line of fire, in front of its chest). */
  spark(z, attacker, dir) {
    const g = this.game, o = z.pm.origin;
    let x = o[0], y = o[1], h = o[2] + 12;
    if (attacker) {
      const e = attacker.eyePos(_w);
      const t = (x - e[0]) * dir[0] + (y - e[1]) * dir[1] + (h - e[2]) * dir[2] - 9;
      x = e[0] + dir[0] * t; y = e[1] + dir[1] * t; h = e[2] + dir[2] * t;
    }
    _v[0] = x; _v[1] = y; _v[2] = h;
    _fx.life = 0.25; _fx.size = 2.5; _fx.size1 = 0.6; _fx.drag = 2; _fx.buoy = -300;
    for (let i = 0; i < 6; i++) {
      _w[0] = -dir[0] * rand(60, 180) + rand(-90, 90); _w[1] = -dir[1] * rand(60, 180) + rand(-90, 90); _w[2] = rand(20, 160);
      g.fire?.emit('spark', _v, _w, _fx);
    }
    if (Math.random() < 0.35) g.sound?.play('ric', { pos: _v, volume: 0.45 });
  }

  /** A common's claw landed on target (ZombieMode.attack): a burning one sets him alight. */
  onClaw(z, target) {
    if (!z.aflame || !target.alive) return;
    const B = COMMONS.burning.burn;
    this.game.fire?.burn(target, z, B[0], Math.max(3, z.zDamage * B[1]), 'zombie');
  }

  /** A common died (ZombieMode.onKilled): a bloater bursts, a burning one leaves a little fire. Corpses themselves never explode. */
  onDeath(z, attacker) {
    const g = this.game, o = z.pm.origin;
    const by = attacker && !attacker.isZombie ? attacker : null; // (the squad's: kills the gas makes are theirs)
    if (z.gassy) {
      const c = [o[0], o[1], o[2] + 10];
      g.sound?.play('bloater_pop', { pos: c, volume: 1, attenuation: 'loud' });
      _fx.drag = 1.6; _fx.buoy = 6;
      for (let i = 0; i < 26; i++) {
        _fx.life = rand(1.2, 2.2); _fx.size = rand(20, 34); _fx.size1 = rand(70, 110);
        _w[0] = rand(-260, 260); _w[1] = rand(-260, 260); _w[2] = rand(10, 160);
        g.fire?.emit(i % 4 ? 'gas' : 'acid', c, _w, _fx);
      }
      g.effects.decal?.('decal_scorch', [o[0], o[1], o[2] - 35.5], [0, 0, 1], 120, [0.38, 0.5, 0.12, 0.6], undefined, true);
      g.gore?.gibPlayer(z, [0, 0, 1], 1.2); // (its own body: like the boomer's)
      g.shakeAt?.(c, 4, 600);
      this.clouds.push({ pos: c, until: g.time + GAS_TIME, next: g.time + 0.15, by, z });
    } else if (z.aflame) {
      g.fire?.ignite([o[0], o[1], o[2] - 30], by, { radius: 36, duration: 2.5, dps: 12, burn: 1.5, quiet: true, weapon: 'molotov' });
    }
  }

  /** The gas clouds: every 0.25 s, everyone in one (in the open, not behind a wall) chokes on it. */
  gas(t) {
    const g = this.game, R = this.Z.diff.roster;
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      if (t >= c.until) { this.clouds.splice(i--, 1); continue; }
      if (t < c.next) continue;
      c.next = t + 0.25;
      const p = c.pos;
      for (const q of g.players) {
        if (!q.alive || q.isBoss) continue;
        const o = q.pm.origin, dx = o[0] - p[0], dy = o[1] - p[1], dz = o[2] - p[2];
        if (dx * dx + dy * dy > GAS_R * GAS_R || dz > 90 || dz < -70) continue;
        if (!g.visible(p, q.eyePos(_v))) continue;
        if (q.isZombie) g.damagePlayer(q, c.by, Math.max(1, q.maxHealth * R.gasZombie * 0.25), HITGROUP.GENERIC, 'bloater', null, null, { blast: true, acid: true, from: p });
        else g.damagePlayer(q, c.z, R.gasHurt * 0.25, HITGROUP.GENERIC, 'bloater', null, null, { blast: true, acid: true, from: p });
      }
    }
  }

  // ---------------------------------------------------------------- the screamer
  /** The screamer's trick (Specials.think): true when it did its own thing this tick. */
  screamer(z, target, cmd, t) {
    const S = z.sp, Z = this.Z;
    if (S.scream == null) { S.scream = t + rand(2.5, 4); S.calls = 0; S.seeT = 0; } // (its first call soon after it shows up)
    const o = z.pm.origin, to = target.pm.origin;
    const d = Math.hypot(to[0] - o[0], to[1] - o[1]);
    if (S.state === 'scream') { // rooted, head back, shrieking
      Z.specials.face(z, to, 6);
      if (t >= S.until) S.state = 'chase';
      return true;
    }
    if (d < CORNERED || S.calls >= Z.diff.roster.screamMax) return false; // cornered, or hoarse (its last call made): it comes for you
    if (t >= S.seeT) { S.seeT = t + 0.3; S.sees = Z.specials.sees(z, target); }
    if (t >= S.scream && Z.state === 'wave' && (S.sees || d < HOLD_MAX)) { this.scream(z, t); return true; }
    if (d < HOLD) { this.flee(z, target, cmd, t); return true; }
    if (d < HOLD_MAX && S.sees) { Z.specials.face(z, to, 8); Z.separate(z, cmd); return true; } // hangs back where it can see you
    return false; // far off or out of sight: comes closer (the flow field)
  }

  /** The call: it roots and shrieks, and the horde surges (the director's surge, or a few of the wave queued now). */
  scream(z, t) {
    const g = this.game, Z = this.Z, S = z.sp, R = Z.diff.roster;
    S.state = 'scream'; S.until = t + SHRIEK;
    S.scream = t + rand(R.screamEvery[0], R.screamEvery[1]);
    S.calls++;
    z.lastShot = t; // (the model's arms fly up)
    g.sound?.play('screamer_shriek', { pos: z.eyePos(), volume: 1, attenuation: 'loud', channel: `${z.id}:voice` });
    z.nextGrowl = Math.max(z.nextGrowl || 0, t + 3);
    const me = g.local, D = Z.director;
    if (D.surge(z, { by: 'screamer' })) return; // (the director calls the surge out itself)
    if (S.calls === 1 && me?.alive && Math.hypot(me.pm.origin[0] - z.pm.origin[0], me.pm.origin[1] - z.pm.origin[1]) < 2000) g.hud?.centerPrint?.('A Screamer is calling the horde!\nKill it.', 2.5);
    // the director took no surge (one is on, or one was just over): a few of the wave's own come
    // now, from its front (queued with the director: counted in the wave, never extras)
    const n = Math.min(R.screamCall, Math.max(0, Z.stats.count - Z.spawned - D.pending.length - (D.riseLeft || 0)));
    for (let i = 0; i < n; i++) D.queue(null, { front: z.front, at: t + 0.3 + i * 0.35 });
  }

  /** Back off from target: one step uphill on the flow field (away from every survivor) at a time. */
  flee(z, target, cmd, t) {
    const nav = this.game.nav, dist = this.Z.dist, f = z.feet(_feet);
    let gl = z.fleeGoal;
    if (!gl || t >= z.fleeT || Math.hypot(gl.x - f[0], gl.y - f[1]) < 24) {
      z.fleeT = t + 0.5; gl = z.fleeGoal = null;
      const n = dist && (nav.nearest(f, 120) || nav.nearestXY(f, 200, 80));
      if (n) {
        let bd = dist[n.id];
        for (const e of n.edges) if (e.kind !== 'jump' && dist[e.to] > bd && dist[e.to] < Infinity) { bd = dist[e.to]; gl = nav.nodes[e.to]; }
        z.fleeGoal = gl;
      }
    }
    if (!gl) { this.Z.specials.face(z, target.pm.origin, 8); return; } // (nowhere further: stands its ground)
    _v[0] = gl.x; _v[1] = gl.y;
    this.Z.specials.face(z, _v, 12);
    cmd.forwardmove = 400;
  }

  // ---------------------------------------------------------------- per frame
  /** HUD state (buildHudState, every frame). */
  hud(s) { void s; }

  /** Per frame (game.frame, zombie mode only): burning commons' flames, the gas clouds. */
  frame(dt) {
    if (!(dt > 0)) return;
    const g = this.game, fire = g.fire;
    if (!fire) return;
    for (const z of this.Z.pool) {
      if (!z.alive || !z.aflame) continue;
      for (let n = dt * FLAMES; n > 0; n--) if (n >= 1 || Math.random() < n) this.flame(fire, z);
    }
    const t = g.time;
    for (const c of this.clouds) {
      const k = Math.min(1, (c.until - t) / 2);
      if (!(Math.random() < dt * 14 * k)) continue;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * GAS_R * 0.8;
      _v[0] = c.pos[0] + Math.cos(a) * r; _v[1] = c.pos[1] + Math.sin(a) * r; _v[2] = c.pos[2] - 20 + rand(0, 50);
      _w[0] = rand(-12, 12); _w[1] = rand(-12, 12); _w[2] = rand(4, 16);
      _fx.life = rand(1.6, 2.4); _fx.size = rand(40, 60); _fx.size1 = rand(90, 130); _fx.drag = 0.8; _fx.buoy = 4;
      fire.emit('gas', _v, _w, _fx);
    }
  }

  /** One flame licking up a burning common (a crawler's stay low), now and then smoke. */
  flame(fire, z) {
    const o = z.pm.origin, low = z.model?.crawl;
    _v[0] = o[0] + rand(-11, 11); _v[1] = o[1] + rand(-11, 11); _v[2] = o[2] - 32 + rand(0, low ? 18 : 60);
    _w[0] = rand(-15, 15); _w[1] = rand(-15, 15); _w[2] = rand(40, 100);
    _fx.life = rand(0.35, 0.6); _fx.size = rand(16, 26); _fx.size1 = 6; _fx.drag = 1; _fx.buoy = 110;
    fire.emit('fire', _v, _w, _fx);
    if (Math.random() < 0.06) { _v[2] += 30; _w[2] = 40; _fx.life = 1.4; _fx.size = 14; _fx.size1 = 50; _fx.buoy = 20; fire.emit('smoke', _v, _w, _fx); }
  }

  /** An unclaimed command (ZombieMode.command). True when it was ours: zm_common <variant> [near] (a cheat). */
  command(p, cmd, args) {
    if (cmd !== 'zm_common') return false;
    const g = this.game, con = g.console;
    const say = (s) => con?.print?.(s);
    if (!con?.cheats) { say('zm_common needs sv_cheats 1'); return true; }
    const v = String(args?.[0] || '').toLowerCase();
    if (!COMMONS[v]) { say(`usage: zm_common <${Object.keys(COMMONS).join('|')}> [near]`); return true; }
    if (this.Z.state === 'over' || this.Z.state === 'idle') { say('zm_common: no run on'); return true; }
    this.Z.taint();
    const near = args[1] === 'near' && p?.alive ? p.pm.origin.slice() : null;
    say(this.Z.spawnZombie({ variant: v, near, extra: true }) ? `${COMMONS[v].name} incoming` : 'zm_common: no room');
    return true;
  }
}
