import { describe, expect, it } from 'vitest';
import { ZONE_MULT } from '../src/shared/data/damage';
import { itemDef } from '../src/shared/data/items';
import { makeStack, wearSlotIndex } from '../src/shared/sim/inventory';
import { B } from '../src/shared/world/blocks';
import type { Game } from '../src/sim/game';
import type { Player } from '../src/sim/player';
import { Corpse } from '../src/sim/systems/entities';
import { OY, aimAt, build, count, drive, give, hold, makeGame, resetCooldowns, seconds, settle, spawnPlayer, teleport, ticks, totals } from './helpers';

const PISTOL = itemDef('pipe_pistol').weapon!;
const Z = 10.5;

function duel() {
  const game = makeGame();
  const { p: shooter, link: shooterLink } = spawnPlayer(game, 'Shooter', 8.5, Z);
  const { p: target, link: targetLink } = spawnPlayer(game, 'Target', 18.5, Z);
  hold(shooter, 'pipe_pistol');
  shooter.held()!.ammo = 8;
  return { game, shooter, target, shooterLink, targetLink };
}

/** Fire one pistol round at a point on the target and let it fly. Returns damage dealt. */
function shoot(game: Game, shooter: Player, target: Player, heightAboveFeet: number): number {
  const hp = target.vitals.hp;
  resetCooldowns(shooter);
  shooter.held()!.ammo = 8;
  game.handle(shooter, { t: 'fire', ...aimAt(shooter, target.x, target.y + heightAboveFeet, target.z), ct: 0 });
  // hits within a few ticks; vitals regen/bleed are negligible over 0.25 s but stop them anyway
  target.vitals.bleed = 0;
  for (let i = 0; i < 5; i++) {
    game.tick();
    target.vitals.bleed = 0;
  }
  return hp - target.vitals.hp;
}

/** Expected pistol damage at ~10 blocks (falloff uses distance travelled before the hit sub-step). */
const BODY = PISTOL.damage * (1 - (6.5 / PISTOL.range) * 0.5);

describe('projectiles', () => {
  it('a shot at a stationary target in clear line of sight hits and damages it', () => {
    const { game, shooter, target, shooterLink } = duel();
    const dmg = shoot(game, shooter, target, 1.1);
    expect(dmg).toBeGreaterThan(BODY - 1.5);
    expect(dmg).toBeLessThan(PISTOL.damage + 0.5);
    expect(shooterLink.of('hitmark').length).toBeGreaterThan(0);
    expect(shooter.held()!.ammo).toBe(7);
    expect(game.combat.stats.hits).toBe(1);
  });

  it('headshots do more damage and leg shots less', () => {
    const { game, shooter, target, shooterLink } = duel();
    const body = shoot(game, shooter, target, 1.1);
    target.vitals.hp = 100;
    const head = shoot(game, shooter, target, 1.65);
    expect(shooterLink.of('hitmark').at(-1)?.head).toBe(true);
    target.vitals.hp = 100;
    const legs = shoot(game, shooter, target, 0.4);
    expect(head / body).toBeCloseTo(ZONE_MULT.head, 1);
    expect(legs / body).toBeCloseTo(ZONE_MULT.legs, 1);
  });

  it('a terrain wall blocks the shot', () => {
    const { game, shooter, target } = duel();
    for (let y = OY; y <= OY + 2; y++) for (let z = 9; z <= 12; z++) game.world.set(13, y, z, B.stone);
    expect(shoot(game, shooter, target, 1.1)).toBe(0);
    expect(game.combat.stats.hits).toBe(0);
  });

  it('a building wall blocks the shot and takes (tiny) structure damage instead', () => {
    const { game, shooter, target } = duel();
    build(game, null, { type: 'foundation', i: 3, j: 2, oy: OY }, 2);
    const wall = build(game, null, { type: 'wall', i: 3, j: 2, oy: OY, side: 'w' }, 2);
    expect(shoot(game, shooter, target, 1.1)).toBe(0);
    expect(wall.hp).toBeCloseTo(500 - PISTOL.structureDamage! * 0.01, 6);
  });

  it('armor reduces damage by its protection value', () => {
    const { game, shooter, target } = duel();
    const bare = shoot(game, shooter, target, 1.1);
    target.vitals.hp = 100;
    target.inv.wear.slots[wearSlotIndex('vest')] = makeStack('wood_armor');
    expect(target.armor('bullet')).toBeCloseTo(0.12);
    const armored = shoot(game, shooter, target, 1.1);
    expect(armored / bare).toBeCloseTo(1 - 0.12, 2);
  });

  it('armor protection is capped at 80%', () => {
    const { target } = duel();
    for (const id of ['metal_facemask', 'metal_chestplate', 'road_kilt', 'burlap_shirt', 'burlap_shoes', 'hide_gloves']) {
      const slot = wearSlotIndex(itemDef(id).clothing!.slot);
      target.inv.wear.slots[slot] = makeStack(id);
    }
    expect(target.armor('arrow')).toBe(0.8);
  });

  it('misses when aiming beside the target', () => {
    const { game, shooter, target } = duel();
    const hp = target.vitals.hp;
    resetCooldowns(shooter);
    game.handle(shooter, { t: 'fire', ...aimAt(shooter, target.x, target.y + 1.1, target.z + 1.5), ct: 0 });
    ticks(game, 10);
    expect(target.vitals.hp).toBeGreaterThanOrEqual(hp - 0.01);
  });

  it('an empty magazine does not fire; reloading takes time and consumes ammo', () => {
    const { game, shooter, target, shooterLink } = duel();
    shooter.held()!.ammo = 0;
    resetCooldowns(shooter);
    game.handle(shooter, { t: 'fire', ...aimAt(shooter, target.x, target.y + 1.1, target.z), ct: 0 });
    ticks(game, 5);
    expect(shooterLink.of('msg').at(-1)?.text).toMatch(/Out of ammo/);
    expect(game.combat.stats.shots).toBe(0);
    give(shooter, 'pistol_ammo', 20);
    game.handle(shooter, { t: 'reload' });
    seconds(game, PISTOL.reload! - 0.3);
    expect(shooter.held()!.ammo).toBe(0);
    seconds(game, 0.5);
    expect(shooter.held()!.ammo).toBe(8);
    expect(count(shooter, 'pistol_ammo')).toBe(12);
  });

  it('bows consume one arrow per shot and arrows drop over distance', () => {
    const { game, shooter, target } = duel();
    hold(shooter, 'hunting_bow');
    give(shooter, 'wooden_arrow', 3);
    resetCooldowns(shooter);
    // aim slightly high to compensate for the arc at 10 blocks
    game.handle(shooter, { t: 'fire', ...aimAt(shooter, target.x, target.y + 1.5, target.z), ct: 0 });
    expect(count(shooter, 'wooden_arrow')).toBe(2);
    ticks(game, 20);
    expect(target.vitals.hp).toBeLessThan(100);
  });
});

describe('melee & explosions vs players', () => {
  it('melee hits a player in reach', () => {
    const game = makeGame();
    const { p: a } = spawnPlayer(game, 'A', 8.5, Z);
    const { p: b } = spawnPlayer(game, 'B', 10.5, Z);
    hold(a, 'wooden_spear');
    resetCooldowns(a);
    game.handle(a, { t: 'swing', ...aimAt(a, b.x, b.y + 1.1, b.z) });
    expect(100 - b.vitals.hp).toBeCloseTo(itemDef('wooden_spear').weapon!.damage, 0);
    expect(a.held()!.dur).toBe(199);
  });

  it('explosions hurt players nearby, less behind cover', () => {
    const game = makeGame();
    const { p: open } = spawnPlayer(game, 'Open', 8.5, Z);
    const { p: covered } = spawnPlayer(game, 'Covered', 8.5, Z + 20);
    for (let y = OY; y <= OY + 3; y++) for (let x = 6; x <= 11; x++) game.world.set(x, y, Z + 20 - 1.5, B.concrete);
    const st = itemDef('tin_grenade').explosive!;
    game.combat.explode(open.x, OY + 0.5, open.z - 2, st, null);
    game.combat.explode(covered.x, OY + 0.5, covered.z - 2, st, null);
    const dOpen = 100 - open.vitals.hp, dCovered = 100 - covered.vitals.hp;
    expect(dOpen).toBeGreaterThan(20);
    expect(dCovered).toBeCloseTo(dOpen * 0.25, 0);
  });
});

describe('death & corpses', () => {
  function killTarget() {
    const ctx = duel();
    const { game, shooter, target } = ctx;
    give(target, 'wood', 500);
    give(target, 'cloth', 40);
    hold(target, 'stone_hatchet', 1, 3);
    target.inv.wear.slots[wearSlotIndex('torso')] = makeStack('burlap_shirt');
    const before = totals([target.inv.main, target.inv.belt, target.inv.wear]);
    let shots = 0;
    while (target.alive && shots < 10) {
      shoot(game, shooter, target, 1.65);
      shots++;
    }
    return { ...ctx, before, shots };
  }

  it('killing a player credits the killer and leaves a corpse holding their whole inventory', () => {
    const { game, shooter, target, targetLink, before, shots } = killTarget();
    expect(target.alive).toBe(false);
    expect(shots).toBe(2);
    expect(target.killedBy).toBe('Shooter');
    expect(shooter.kills).toBe(1);
    expect(targetLink.of('died')).toHaveLength(1);
    const corpse = [...game.entities.corpses].find((c) => c.name === 'Target') as Corpse;
    expect(corpse).toBeDefined();
    expect(Math.hypot(corpse.x - target.x, corpse.z - target.z)).toBeLessThan(0.01);
    expect(totals([corpse.container])).toEqual(before);
    expect(target.inv.main.isEmpty() && target.inv.belt.isEmpty() && target.inv.wear.isEmpty()).toBe(true);
    // dead players are no longer hit by anything
    expect(shoot(game, shooter, target, 1.1)).toBe(0);
  });

  it('the corpse can be looted by walking up to it', () => {
    const { game, shooter, target, before } = killTarget();
    const corpse = [...game.entities.corpses].find((c) => c.name === 'Target')!;
    teleport(game, shooter, corpse.x - 2, OY, corpse.z);
    settle(game, shooter);
    shooter.inv.clear();
    resetCooldowns(shooter);
    game.handle(shooter, { t: 'interact', ...aimAt(shooter, corpse.x, corpse.y + 0.25, corpse.z) });
    expect(shooter.loot).toEqual({ kind: 'entity', id: corpse.id });
    for (let i = 0; i < 36; i++) game.handle(shooter, { t: 'inv', op: 'quick', from: ['loot', i] });
    expect(totals([shooter.inv.main, shooter.inv.belt, shooter.inv.wear])).toEqual(before);
    ticks(game, 2);
    expect(game.entities.corpses.has(corpse)).toBe(false); // empty corpses vanish
    expect(target.alive).toBe(false);
  });

  it('respawning restores a fresh character with the start kit', () => {
    const { game, target } = killTarget();
    game.handle(target, { t: 'respawn' });
    expect(target.alive).toBe(true);
    expect(target.vitals.hp).toBe(60);
    expect(count(target, 'rock')).toBe(1);
    expect(count(target, 'wood')).toBe(0);
    ticks(game, 10);
    expect(target.ready).toBe(true);
  });

  it('dying to the environment also leaves a corpse', () => {
    const game = makeGame();
    const { p } = spawnPlayer(game, 'Faller', 8.5, 8.5);
    give(p, 'stone', 10);
    teleport(game, p, 8.5, OY + 40, 8.5);
    drive(game, p, 4); // physics advances with the client's input stream
    expect(p.alive).toBe(false);
    expect(p.killedBy).toBe('Fall damage');
    expect([...game.entities.corpses].some((c) => c.name === 'Faller' && c.container.slots.some((s) => s?.id === 'stone'))).toBe(true);
  });
});

describe('fall damage through the server', () => {
  it('a 10-block drop hurts, a 3-block drop does not', () => {
    const game = makeGame();
    const { p } = spawnPlayer(game, 'Jumper', 8.5, 8.5);
    teleport(game, p, 8.5, OY + 3, 8.5);
    drive(game, p, 2);
    expect(p.y).toBeCloseTo(OY, 3);
    expect(p.vitals.hp).toBeGreaterThanOrEqual(100 - 0.01);
    teleport(game, p, 8.5, OY + 10, 8.5);
    drive(game, p, 2);
    expect(p.alive).toBe(true);
    expect(p.vitals.hp).toBeLessThan(60);
    expect(p.lastDamagedBy).toBe('fall');
  });
});

describe('players who moved', () => {
  // BUG: players are put in the entity spatial grid when they join/respawn, but never re-bucketed
  // when they move (only animals and thrown explosives call entities.updateCell; see
  // src/sim/game.ts processInputs). Once a player walks out of their 32x32 grid cell,
  // entities.near() no longer returns them, so bullets, melee, explosions, the "something is in
  // the way" build check and door-blocking checks all ignore them.
  it.fails('a player who walked away from their spawn cell can still be shot', () => {
    const game = makeGame();
    const { p: target } = spawnPlayer(game, 'Walker', -40.5, 8.5);
    const { p: shooter } = spawnPlayer(game, 'Shooter', -55.5, 8.5);
    drive(game, target, 10, { f: 1, yaw: -Math.PI / 2 });
    expect(target.x).toBeGreaterThan(0); // walked ~40 blocks east, across a 32-block cell boundary
    teleport(game, shooter, target.x - 10, OY, target.z);
    settle(game, shooter);
    hold(shooter, 'pipe_pistol');
    target.vitals.hp = 100;
    expect(shoot(game, shooter, target, 1.1)).toBeGreaterThan(20);
  });
});
