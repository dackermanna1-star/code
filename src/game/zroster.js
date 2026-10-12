// Zombie survival common roster (Milestone 2.5, owner: roster): the commons get looks and
// subtypes - zombified CTs, terrorists, scientists, fat and thin bodies, each its own voice
// pitch - and variants with their own rules (COMMONS). The screamer is a special (a row in
// specials.js SPECIALS, its trick in screamer() here) that hangs back and calls surges
// (g.zombies.director.surge(z, 'screamer')).
//
// Contract (m2-contracts):
//   z.variant          a common's COMMONS id ('walker', 'runner', 'riot', 'crawler', 'bloater',
//                      'burning'); null for specials and bosses. Set in spawnZombie, kept for
//                      the zombie's life (kill events carry it: e.variant).
//   spawnZombie({ variant })  asks for one (the director's wave types do: Crawler Swarm, Iron
//                      Rain); without it roster.pick(wave, o) chooses.
//   roster.pick(wave, o)      the variant for a spawn with options o (o.speed given: a boss's
//                      summons, a walker)
//   roster.skin(variant)      the body's skin (ZOMBIE_SKINS, playermodels.js); spawnZombie
//                      reuses a free body of that skin, or makes one (POOL bodies in all)
//   roster.reskin(z, skin)    the pool is full and no free body has that skin: make z look
//                      like it (or return z as it is), or null to spawn nothing
//   roster.setup(z, variant, o)  after the generic reset: speed (and from the roster, health,
//                      damage, armour, scale, voice...)
//   roster.screamer(z, target, cmd, t)  the screamer's trick (Specials.think); false: chase
//   roster.adjust(z, attacker, damage, hitgroup, weaponId, dir, opts)  game.damagePlayer, a
//                      common hit (riot: frontal multiplier); returns the damage
//   roster.onClaw(z, target) / roster.onDeath(z, attacker)  ZombieMode.attack / onKilled
//   roster.become(z, variant)  turn a live common into another variant (leg knockdown ->
//                      'crawler', called by zstagger.js)
// Difficulty: g.zombies.diff.roster { mix, shift, riotCap } (zdiff.js).
//
// Scaffold (foundation): today's crowd - runners (the wave's share, 262-280 u/s) and walkers,
// all on the one 'zombie' skin. Every other variant has weight 0 until the roster builds it.

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * The commons: name, skin, from (first wave; + diff.roster.shift), weight (pick weight among
 * the non-runner variants, x diff.roster.mix; 0 = off), hp / dmg (x the wave's), speed
 * ([min, max] u/s, null = the wave's), scale (the model), armor / helmet.
 * Runners are the wave's share (waveStats().runners), not a weight.
 */
export const COMMONS = {
  walker: { name: 'Zombie', skin: 'zombie', from: 1, weight: 0, hp: 1, dmg: 1, speed: null, scale: 1, armor: 0, helmet: false },
  runner: { name: 'Zombie', skin: 'zombie', from: 1, weight: 0, hp: 1, dmg: 1, speed: [262, 280], scale: 1, armor: 0, helmet: false },
  riot: { name: 'Riot Zombie', skin: 'zombie', from: 10, weight: 0, hp: 1, dmg: 1, speed: null, scale: 1, armor: 0, helmet: false },
  crawler: { name: 'Crawler', skin: 'zombie', from: 4, weight: 0, hp: 1, dmg: 1, speed: null, scale: 1, armor: 0, helmet: false },
  bloater: { name: 'Bloater', skin: 'zombie', from: 6, weight: 0, hp: 1, dmg: 1, speed: null, scale: 1, armor: 0, helmet: false },
  burning: { name: 'Burning Zombie', skin: 'zombie', from: 8, weight: 0, hp: 1, dmg: 1, speed: null, scale: 1, armor: 0, helmet: false },
};

export class ZRoster {
  constructor(game) {
    this.game = game;
    this.subscribed = false;
    this.reset();
    Promise.resolve().then(() => this.subscribe()); // (built before game.zombies is set)
  }

  get Z() { return this.game.zombies; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') this.reset(); });
  }

  reset() {}

  /** Every tick (ZombieMode.tick). */
  tick(t) { void t; }

  /** The variant for a spawn (see the header). */
  pick(wave, o) {
    if (o.speed != null) return 'walker'; // (a boss's summons: their own speed)
    const S = this.Z.stats, R = this.Z.diff.roster;
    if (Math.random() < S.runners) return 'runner';
    // the rest by weight (scaffold: every weight is 0, walkers only)
    let sum = 0;
    for (const k in COMMONS) { const C = COMMONS[k]; if (C.weight > 0 && wave >= C.from + R.shift) sum += C.weight; }
    if (sum <= 0) return 'walker';
    let r = Math.random() * (sum * R.mix + 1); // (walkers: the rest)
    for (const k in COMMONS) {
      const C = COMMONS[k];
      if (!(C.weight > 0 && wave >= C.from + R.shift)) continue;
      r -= C.weight * R.mix;
      if (r <= 0) return k;
    }
    return 'walker';
  }

  /** The skin a variant's body wears. */
  skin(variant) { return (COMMONS[variant] || COMMONS.walker).skin; }

  /** The pool is full and no free body wears skin: z (any free common body) made to fit, or z as it is. */
  reskin(z, skin) { void skin; return z || null; }

  /** A common's variant stats, after spawnZombie's generic reset (o: its options). */
  setup(z, variant, o) {
    const S = this.Z.stats, C = COMMONS[variant] || COMMONS.walker;
    z.variant = variant;
    z.zSpeed = o.speed ?? (C.speed ? rand(C.speed[0], C.speed[1]) : S.speed * rand(0.9, 1.06));
    if (C.hp !== 1 && o.health == null) z.health = z.maxHealth = Math.round(S.health * C.hp);
    if (C.dmg !== 1) z.zDamage = Math.round(S.damage * C.dmg);
    if (C.armor) { z.armor = C.armor; z.helmet = !!C.helmet; }
  }

  /** Make z (alive) another variant from now on (a leg knockdown: 'crawler', zstagger.js). True when it took. */
  become(z, variant) { void z; void variant; return false; }

  /**
   * game.damagePlayer, for a common (victim.variant set), before armour: the damage it takes
   * (riot zombies: less from the front). Hot path: no allocations.
   */
  adjust(z, attacker, damage, hitgroup, weaponId, dir, opts) { void z; void attacker; void hitgroup; void weaponId; void dir; void opts; return damage; }

  /** A common's claw landed on target (ZombieMode.attack): a burning one sets him alight. */
  onClaw(z, target) { void z; void target; }

  /** A common died (ZombieMode.onKilled): a bloater bursts. Corpses themselves never explode. */
  onDeath(z, attacker) { void z; void attacker; }

  /** The screamer's trick (Specials.think): true when it did its own thing this tick. */
  screamer(z, target, cmd, t) { void z; void target; void cmd; void t; return false; }

  /** HUD state (buildHudState, every frame). */
  hud(s) { void s; }

  /** Per frame (game.frame, zombie mode only). */
  frame(dt) { void dt; }

  /** An unclaimed command (ZombieMode.command). True when it was ours. */
  command(p, cmd, args) { void p; void cmd; void args; return false; }
}
