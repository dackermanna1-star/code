// The spell table: Noita's gun_actions.lua ported to TypeScript.
//
// Each entry's `action` mirrors the gun.lua action against the ActionContext (ctx.c is the current shot
// state, times are frames, damage is displayed HP). Spawn tiers/weights and shop prices come from the wiki
// spell infoboxes. Tooltip `stats` are derived automatically by running each action once in a recording
// context ("reflection", as Noita itself does), so stats can never drift from the action code.
//
// Mana: the casting engine charges max(0, mana) at draw time. Add Mana shows mana -30 but its refund is done
// by its action (ctx.addMana), so the mana is never counted twice and it also works as an Always Cast.
//
// To add a spell, add one entry to LIST (and its projectile to projectileDefs.ts if it fires a new one).

import { PROJECTILES } from './projectileDefs';
import { addEffect, defaultShotState } from './shotState';
import type { ActionContext, ShotState, SpellDef, SpellType } from './types';

interface SpellSpec {
  id: string;
  name: string;
  description: string;
  type: SpellType;
  mana: number;
  /** Charges; omitted = unlimited. */
  uses?: number;
  tiers: number[];
  weights: number[];
  price: number;
  /** Extra tooltip lines (merged over the reflected ones). */
  stats?: Record<string, string>;
  action: (ctx: ActionContext) => void;
}

// ---------------------------------------------------------------------------- reflection / tooltip stats

interface Reflection {
  state: ShotState;
  setsFireRateWait: boolean;
  projectiles: string[];
  triggers: { id: string; kind: 'hit' | 'timer' | 'death'; draw: number; timer?: number }[];
  draws: number;
  reload: number;
  manaGain: number;
}

function reflect(action: (ctx: ActionContext) => void): Reflection {
  const run = (baseFireRateWait: number): Reflection => {
    const c = defaultShotState();
    c.fireRateWait = baseFireRateWait;
    const r: Reflection = { state: c, setsFireRateWait: false, projectiles: [], triggers: [], draws: 0, reload: 0, manaGain: 0 };
    const ctx: ActionContext = {
      c,
      addProjectile: (id) => void r.projectiles.push(id),
      addTrigger: (id, kind, draw, timer) => void r.triggers.push({ id, kind, draw, timer }),
      drawActions: (n) => void (r.draws += n),
      addReload: (d) => void (r.reload += d),
      addMana: (a) => void (r.manaGain += a),
      random: () => 0.5,
      permanent: false,
    };
    action(ctx);
    return r;
  };
  const a = run(0);
  const b = run(1000);
  // An action that *sets* cast delay (Chainsaw) is not additive: the two runs disagree.
  a.setsFireRateWait = Math.abs(b.state.fireRateWait - 1000 - a.state.fireRateWait) > 1e-9;
  return a;
}

const num = (n: number): string => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const signed = (n: number): string => (n > 0 ? '+' : n < 0 ? '-' : '') + num(Math.abs(n));
const seconds = (frames: number, sign = true): string =>
  (sign && frames > 0 ? '+' : frames < 0 ? '-' : '') + (Math.abs(frames) / 60).toFixed(2) + ' s';

function buildStats(spec: SpellSpec, r: Reflection): Record<string, string> {
  const s: Record<string, string> = {};
  const d = defaultShotState();
  const c = r.state;
  s['Mana drain'] = num(spec.mana);
  if (spec.uses !== undefined) s['Uses'] = num(spec.uses);

  // The projectile this spell fires (first plain projectile or trigger carrier).
  const projId = r.projectiles[0] ?? r.triggers[0]?.id;
  const p = projId ? PROJECTILES[projId] : undefined;
  if (p) {
    const dm = p.damage;
    if (dm.projectile) s['Damage'] = num(dm.projectile);
    if (dm.slice) s['Slice damage'] = num(dm.slice);
    if (dm.drill) s['Drill damage'] = num(dm.drill);
    if (dm.fire) s['Fire damage'] = num(dm.fire);
    if (dm.electric) s['Electric damage'] = num(dm.electric);
    if (dm.ice) s['Ice damage'] = num(dm.ice);
    if (dm.explosion) s['Explosion damage'] = num(dm.explosion);
    if (dm.healing) s['Healing'] = num(dm.healing);
    if (p.explosion) s['Explosion radius'] = num(p.explosion.radius);
    if (p.dig) s['Digs'] = `radius ${num(p.dig.radius)}, durability ${p.dig.durability}`;
    const count = r.projectiles.length + r.triggers.length;
    if (count > 1) s['Projectiles'] = String(count);
    s['Speed'] = p.stationary ? 'static' : num(Math.round((p.speed[0] + p.speed[1]) / 2));
    if (p.lifetime[0] >= 0) s['Lifetime'] = seconds((p.lifetime[0] + p.lifetime[1]) / 2, false);
    if (p.bounces) s['Bounces'] = String(p.bounces);
  }
  for (const t of r.triggers) {
    const what = t.kind === 'hit' ? 'on hit' : t.kind === 'timer' ? `after ${t.timer ?? 0} frames` : 'on expiry';
    s['Trigger'] = `casts ${t.draw} spell${t.draw === 1 ? '' : 's'} ${what}`;
  }

  if (r.setsFireRateWait) s['Cast delay'] = '= ' + seconds(c.fireRateWait, false);
  else if (c.fireRateWait !== 0) s['Cast delay'] = seconds(c.fireRateWait);
  if (r.reload !== 0) s['Recharge time'] = seconds(r.reload);
  if (c.spread !== 0) s['Spread'] = signed(c.spread) + '°';
  if (r.draws > 0) s['Draws'] = String(r.draws);
  if (c.patternDegrees !== 0) s['Formation'] = num(c.patternDegrees) + '°';
  if (r.manaGain !== 0 && r.manaGain !== -spec.mana) s['Mana'] = signed(r.manaGain);

  // Modifier deltas.
  if (c.speedMult !== d.speedMult) s['Speed'] = '×' + num(c.speedMult);
  if (c.damageProjectile) s['Damage'] = signed(c.damageProjectile);
  if (c.damageExplosion) s['Explosion damage'] = signed(c.damageExplosion);
  if (c.damageFire) s['Fire damage'] = signed(c.damageFire);
  if (c.damageElectric) s['Electric damage'] = signed(c.damageElectric);
  if (c.damageIce) s['Ice damage'] = signed(c.damageIce);
  if (c.damageSlice) s['Slice damage'] = signed(c.damageSlice);
  if (c.explosionRadius) s['Explosion radius'] = signed(c.explosionRadius);
  if (c.critChance) s['Critical chance'] = signed(c.critChance) + '%';
  if (c.lifetimeAdd) s['Lifetime'] = seconds(c.lifetimeAdd);
  if (c.bounces) s['Bounces'] = signed(c.bounces);
  if (c.gravityAdd) s['Gravity'] = signed(c.gravityAdd);
  if (c.homing) s['Homing'] = signed(c.homing);
  if (c.trailMaterial) s['Trail'] = c.trailMaterial;
  if (c.lightRadiusAdd) s['Light radius'] = signed(c.lightRadiusAdd);
  if (c.piercing) s['Piercing'] = 'yes';
  if (c.friendlyFire) s['Friendly fire'] = 'yes';
  return { ...s, ...spec.stats };
}

function spell(spec: SpellSpec): SpellDef {
  const r = reflect(spec.action);
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    type: spec.type,
    mana: spec.mana,
    maxUses: spec.uses ?? -1,
    spawnTiers: spec.tiers,
    spawnWeights: spec.weights,
    price: spec.price,
    projectile: r.projectiles[0] ?? r.triggers[0]?.id,
    stats: buildStats(spec, r),
    action: spec.action,
  };
}

// ---------------------------------------------------------------------------- action helpers

/** A plain modifier: change the shot state, then draw one more card (gun.lua draw_actions(1, true)). */
const modifier = (apply: (c: ShotState, ctx: ActionContext) => void) => (ctx: ActionContext) => {
  apply(ctx.c, ctx);
  ctx.drawActions(1, true);
};

/** Trail modifiers (Fire / Oil / Water / Acid trail). The contract holds one trail material: the last wins. */
const trail = (mat: string, chance: number) =>
  modifier((c) => {
    c.trailMaterial = mat;
    c.trailChance = Math.min(1, c.trailChance + chance);
    if (mat === 'fire') addEffect(c, 'fire_trail');
  });

/** Formation multicasts: deterministic arc (Noita pattern_degrees, see formationAngles), then draw n. */
const formation = (pattern: number, spread: number, n: number) => (ctx: ActionContext) => {
  ctx.c.patternDegrees = pattern;
  ctx.c.spread += spread;
  ctx.drawActions(n, true);
};

/** Spawn-tier shorthands. */
const ALL_TIERS = [0, 1, 2, 3, 4, 5, 6];

// ---------------------------------------------------------------------------- the table

const LIST: SpellDef[] = [
  // ================================================================== projectiles
  spell({
    id: 'LIGHT_BULLET', name: 'Spark bolt', type: 'projectile', mana: 5, price: 100,
    description: 'A weak but enchanting sparkling projectile',
    tiers: [0, 1, 2], weights: [2, 1, 0.5],
    action: (ctx) => {
      ctx.addProjectile('spark_bolt');
      ctx.c.fireRateWait += 3;
      ctx.c.spread -= 1;
      ctx.c.critChance += 5;
    },
  }),
  spell({
    id: 'LIGHT_BULLET_TRIGGER', name: 'Spark bolt with trigger', type: 'projectile', mana: 10, price: 140,
    description: 'A spark bolt that casts another spell upon collision',
    tiers: [0, 1, 2, 3], weights: [1, 0.5, 0.5, 0.5],
    action: (ctx) => {
      ctx.addTrigger('spark_bolt', 'hit', 1);
      ctx.c.fireRateWait += 3;
      ctx.c.critChance += 5;
    },
  }),
  spell({
    id: 'LIGHT_BULLET_TRIGGER_2', name: 'Spark bolt with double trigger', type: 'projectile', mana: 15, price: 250,
    description: 'A spark bolt that casts two new spells upon collision',
    tiers: [2, 3, 5, 6], weights: [1, 0.5, 1, 1],
    action: (ctx) => {
      ctx.addTrigger('spark_bolt_double_trigger', 'hit', 2);
      ctx.c.fireRateWait += 4;
      ctx.c.critChance += 5;
    },
  }),
  spell({
    id: 'LIGHT_BULLET_TIMER', name: 'Spark bolt with timer', type: 'projectile', mana: 10, price: 140,
    description: 'A spark bolt that casts another spell after a timer runs out',
    tiers: [1, 2, 3], weights: [0.5, 0.5, 0.75],
    action: (ctx) => {
      ctx.addTrigger('spark_bolt', 'timer', 1, 10);
      ctx.c.fireRateWait += 3;
      ctx.c.critChance += 5;
    },
  }),
  spell({
    id: 'RUBBER_BALL', name: 'Bouncing burst', type: 'projectile', mana: 5, price: 60,
    description: 'A very bouncy projectile',
    tiers: [0, 1, 6], weights: [1, 1, 0.2],
    action: (ctx) => {
      ctx.addProjectile('bouncing_burst');
      ctx.c.fireRateWait -= 2;
      ctx.c.spread -= 1;
    },
  }),
  spell({
    id: 'SLOW_BULLET', name: 'Energy orb', type: 'projectile', mana: 30, price: 160,
    description: 'A slow but powerful orb of energy',
    tiers: [1, 2, 3, 4], weights: [1, 1, 1, 1],
    action: (ctx) => {
      ctx.addProjectile('energy_orb');
      ctx.c.fireRateWait += 6;
      ctx.c.spread += 3.6;
      ctx.c.recoil += 20;
    },
  }),
  spell({
    id: 'SLOW_BULLET_TRIGGER', name: 'Energy orb with a trigger', type: 'projectile', mana: 50, price: 200,
    description: 'A slow but powerful orb of energy that casts another spell upon collision',
    tiers: [1, 2, 3, 4, 5], weights: [0.5, 0.5, 0.5, 0.5, 1],
    action: (ctx) => {
      ctx.addTrigger('energy_orb', 'hit', 1);
      ctx.c.fireRateWait += 25;
      ctx.c.spread += 10;
      ctx.c.recoil += 20;
    },
  }),
  spell({
    id: 'SLOW_BULLET_TIMER', name: 'Energy orb with a timer', type: 'projectile', mana: 50, price: 200,
    description: 'A slow but powerful orb of energy that casts another spell after a timer runs out',
    tiers: [1, 2, 3, 4, 5, 6], weights: [0.5, 0.5, 0.5, 0.5, 1, 1],
    action: (ctx) => {
      ctx.addTrigger('energy_orb', 'timer', 1, 100);
      ctx.c.fireRateWait += 6;
      ctx.c.spread += 3.6;
      ctx.c.recoil += 20;
    },
  }),
  spell({
    id: 'SPITTER', name: 'Spitter bolt', type: 'projectile', mana: 5, price: 110,
    description: 'A short-lived magical bolt',
    tiers: [0, 1, 2, 3], weights: [1, 1, 1, 0.5],
    action: (ctx) => {
      ctx.addProjectile('spitter_bolt');
      ctx.c.fireRateWait -= 1;
      ctx.c.spread += 6;
    },
  }),
  spell({
    id: 'SPITTER_TIMER', name: 'Spitter bolt with timer', type: 'projectile', mana: 10, price: 140,
    description: 'A short-lived magical bolt that casts another spell after a timer runs out',
    tiers: [0, 1, 2, 3], weights: [0.5, 0.5, 0.5, 1],
    action: (ctx) => {
      ctx.addTrigger('spitter_bolt', 'timer', 1, 40);
      ctx.c.fireRateWait -= 1;
      ctx.c.spread += 6;
    },
  }),
  spell({
    id: 'SPITTER_TIER_2', name: 'Large spitter bolt', type: 'projectile', mana: 25, price: 190,
    description: 'A more powerful version of Spitter bolt',
    tiers: [2, 3, 4, 5], weights: [1, 1, 1, 0.5],
    action: (ctx) => {
      ctx.addProjectile('spitter_bolt_large');
      ctx.c.fireRateWait -= 2;
      ctx.c.spread += 7.5;
    },
  }),
  spell({
    id: 'BUBBLESHOT', name: 'Bubble spark', type: 'projectile', mana: 5, price: 100,
    description: 'A bouncy, inaccurate spell',
    tiers: [0, 1, 2, 3], weights: [1, 0.6, 1, 0.5],
    action: (ctx) => {
      ctx.addProjectile('bubble_spark');
      ctx.c.fireRateWait -= 5;
      // Bubble spark's own 22.9 degree inaccuracy: the contract has no per-projectile spread, so it is
      // expressed through the shot state (it also loosens projectiles multicast together with it).
      ctx.c.spread += 22.9;
    },
  }),
  spell({
    id: 'ARROW', name: 'Arrow', type: 'projectile', mana: 15, price: 140,
    description: 'Summons an arrow',
    tiers: [1, 2, 4, 5], weights: [1, 1, 0.6, 0.3],
    action: (ctx) => {
      ctx.addProjectile('arrow');
      ctx.c.fireRateWait += 10;
      ctx.c.spread -= 20;
      ctx.c.recoil += 30;
    },
  }),
  spell({
    id: 'LASER', name: 'Concentrated light', type: 'projectile', mana: 30, price: 180,
    description: 'A pinpointed beam of light',
    tiers: [1, 2, 4], weights: [1, 1, 1],
    action: (ctx) => {
      ctx.addProjectile('concentrated_light');
      ctx.c.fireRateWait -= 22;
      ctx.c.recoil += 20;
    },
  }),
  spell({
    id: 'HEAL_BULLET', name: 'Healing bolt', type: 'projectile', mana: 15, uses: 20, price: 60,
    description: 'A magical bolt that heals other beings',
    tiers: [2, 3, 4], weights: [1, 1, 0.6],
    action: (ctx) => {
      ctx.addProjectile('healing_bolt');
      ctx.c.fireRateWait += 4;
      ctx.c.spread += 2;
    },
  }),
  spell({
    id: 'TELEPORT_PROJECTILE', name: 'Teleport bolt', type: 'projectile', mana: 40, price: 130,
    description: 'A magical bolt that moves you wherever it ends up flying',
    tiers: [0, 1, 2, 4, 5, 6], weights: [0.6, 0.6, 0.6, 0.4, 0.4, 0.4],
    action: (ctx) => {
      ctx.addProjectile('teleport_bolt');
      ctx.c.fireRateWait += 3;
      ctx.c.spread -= 2;
    },
  }),
  spell({
    id: 'TELEPORT_PROJECTILE_SHORT', name: 'Small teleport bolt', type: 'projectile', mana: 20, price: 130,
    description: 'A shortlived magical bolt that moves you wherever it ends up flying',
    tiers: [0, 1, 2, 4, 5, 6], weights: [0.6, 0.6, 0.6, 0.4, 0.4, 0.4],
    action: (ctx) => {
      ctx.addProjectile('teleport_bolt_small');
      ctx.c.spread -= 2;
    },
  }),
  spell({
    id: 'ACIDSHOT', name: 'Acid ball', type: 'projectile', mana: 20, uses: 20, price: 180,
    description: 'A terrifying acidic projectile',
    tiers: [1, 2, 3, 4], weights: [1, 1, 0.9, 0.6],
    action: (ctx) => {
      ctx.addProjectile('acid_ball');
      ctx.c.fireRateWait += 10;
    },
  }),

  // ------------------------------------------------------------------ explosives
  spell({
    id: 'ROCKET', name: 'Magic missile', type: 'projectile', mana: 70, uses: 10, price: 220,
    description: 'A fiery, explosive projectile',
    tiers: [1, 2, 3, 4, 5], weights: [1, 1, 1, 0.5, 0.3],
    action: (ctx) => {
      ctx.addProjectile('magic_missile');
      ctx.c.fireRateWait += 60;
      ctx.c.recoil += 120;
    },
  }),
  spell({
    id: 'BOMB', name: 'Bomb', type: 'projectile', mana: 25, uses: 3, price: 200,
    description: 'Summons a bomb that destroys ground very efficiently',
    tiers: ALL_TIERS, weights: [1, 1, 1, 1, 0.5, 0.5, 0.1],
    action: (ctx) => {
      ctx.addProjectile('bomb');
      ctx.c.fireRateWait += 100;
    },
  }),
  spell({
    id: 'DYNAMITE', name: 'Dynamite', type: 'projectile', mana: 50, uses: 16, price: 160,
    description: 'Summons a small explosive',
    tiers: [0, 1, 2, 3, 4], weights: [1, 0.9, 0.8, 0.7, 0.6],
    action: (ctx) => {
      ctx.addProjectile('dynamite');
      ctx.c.fireRateWait += 50;
      ctx.c.spread += 6;
    },
  }),
  spell({
    id: 'FIREBALL', name: 'Fireball', type: 'projectile', mana: 70, uses: 15, price: 220,
    description: 'A powerful exploding spell',
    tiers: [0, 3, 4, 6], weights: [1, 0.7, 1, 0.5],
    action: (ctx) => {
      ctx.addProjectile('fireball');
      ctx.c.fireRateWait += 50;
      ctx.c.spread += 4;
      ctx.c.recoil += 20;
    },
  }),
  spell({
    id: 'GRENADE', name: 'Firebolt', type: 'projectile', mana: 50, uses: 25, price: 170,
    description: 'A bouncy, explosive bolt',
    tiers: [0, 1, 2, 3, 4], weights: [1, 1, 0.5, 0.25, 0.2],
    action: (ctx) => {
      ctx.addProjectile('firebolt');
      ctx.c.fireRateWait += 30;
      ctx.c.recoil += 80;
    },
  }),
  spell({
    id: 'MINE', name: 'Unstable crystal', type: 'projectile', mana: 20, uses: 15, price: 200,
    description: 'A crystal that explodes when something comes close to it',
    tiers: [1, 2, 3, 4], weights: [0.6, 0.6, 0.6, 0.6],
    action: (ctx) => {
      ctx.addProjectile('unstable_crystal');
      ctx.c.fireRateWait += 30;
      ctx.c.spread += 5;
    },
  }),
  spell({
    id: 'LIGHTNING', name: 'Lightning bolt', type: 'projectile', mana: 70, price: 250,
    description: 'The primordial force of nature',
    tiers: [3, 4, 5, 6], weights: [0.7, 0.8, 0.9, 1],
    action: (ctx) => {
      ctx.addProjectile('lightning_bolt');
      ctx.c.fireRateWait += 50;
      ctx.c.recoil += 180;
    },
  }),
  spell({
    id: 'DEATH_CROSS', name: 'Death cross', type: 'projectile', mana: 80, price: 210,
    description: 'A deadly energy cross that explodes after a short time',
    tiers: [3, 4, 5, 6], weights: [0.6, 0.5, 0.5, 0.3],
    action: (ctx) => {
      ctx.addProjectile('death_cross');
      ctx.c.fireRateWait += 40;
    },
  }),
  spell({
    id: 'BLACK_HOLE', name: 'Black hole', type: 'projectile', mana: 180, uses: 3, price: 200,
    description: 'A slow orb of void that eats through all obstacles',
    tiers: [3, 4, 5, 6], weights: [0.6, 0.8, 0.8, 0.5],
    action: (ctx) => {
      ctx.addProjectile('black_hole');
      ctx.c.fireRateWait += 80;
    },
  }),

  // ------------------------------------------------------------------ digging
  spell({
    id: 'CHAINSAW', name: 'Chainsaw', type: 'projectile', mana: 1, price: 80,
    description: 'A good tool for cutting meat. Also has some magical properties...',
    tiers: [0, 2], weights: [1, 1],
    action: (ctx) => {
      ctx.addProjectile('chainsaw');
      ctx.c.fireRateWait = 0; // the "magical property": wipes the cast delay accumulated so far (wand's too)
      ctx.c.spread += 6;
      ctx.addReload(-10);
    },
  }),
  spell({
    id: 'DIGGER', name: 'Digging bolt', type: 'projectile', mana: 0, price: 70,
    description: 'A bolt that is ideal for mining operations',
    tiers: [0, 1, 2], weights: [0.5, 1, 0.5],
    action: (ctx) => {
      ctx.addProjectile('digging_bolt');
      ctx.c.fireRateWait += 1;
      ctx.addReload(-10);
    },
  }),
  spell({
    id: 'LUMINOUS_DRILL', name: 'Luminous drill', type: 'projectile', mana: 10, price: 240,
    description: 'A pinpointed, short-ranged beam of concentrated light',
    tiers: [3, 4, 5, 6], weights: [0.6, 0.5, 0.4, 0.3],
    action: (ctx) => {
      ctx.addProjectile('luminous_drill');
      ctx.c.fireRateWait -= 35;
      ctx.addReload(-10);
    },
  }),

  // ------------------------------------------------------------------ elemental
  spell({
    id: 'FLAMETHROWER', name: 'Flamethrower', type: 'projectile', mana: 20, uses: 60, price: 220,
    description: 'A stream of fire!!',
    tiers: [2, 3, 4, 6], weights: [0.8, 0.9, 0.9, 0.6],
    action: (ctx) => {
      ctx.addProjectile('flamethrower');
      ctx.c.spread += 4;
    },
  }),
  spell({
    id: 'FREEZING_GAZE', name: 'Freezing gaze', type: 'projectile', mana: 45, uses: 20, price: 180,
    description: 'A heart-freezingly sinister aura',
    tiers: [2, 3, 4], weights: [0.9, 1, 1],
    action: (ctx) => {
      for (let i = 0; i < 12; i++) ctx.addProjectile('freezing_gaze');
      ctx.c.patternDegrees = Math.max(ctx.c.patternDegrees, 30);
      ctx.c.fireRateWait += 20;
    },
  }),

  // ================================================================== materials
  ...(
    [
      ['CIRCLE_WATER', 'Circle of water', 'circle_water', 20, 15, 160, 'An expanding circle of water'],
      ['CIRCLE_OIL', 'Circle of oil', 'circle_oil', 20, 15, 160, 'An expanding circle of slick oil'],
      ['CIRCLE_FIRE', 'Circle of fire', 'circle_fire', 20, 15, 170, 'An expanding circle of burning air'],
      ['CIRCLE_ACID', 'Circle of acid', 'circle_acid', 40, 4, 180, 'An expanding circle of dripping acid'],
    ] as const
  ).map(([id, name, projectile, mana, uses, price, description]) =>
    spell({
      id, name, description, type: 'material', mana, uses, price,
      tiers: [1, 2, 3, 4], weights: [0.4, 0.4, 0.4, 0.4],
      action: (ctx) => {
        ctx.addProjectile(projectile);
        ctx.c.fireRateWait += 20;
      },
    }),
  ),
  ...(
    [
      // Noita's id for the flammable-gas sea is SEA_ACID_GAS; the game code uses SEA_FLAMGAS.
      ['SEA_WATER', 'Sea of water', 'sea_water', 350, [0.4, 0.3, 0.2], 'Summons a large body of water below the caster'],
      ['SEA_OIL', 'Sea of oil', 'sea_oil', 350, [0.5, 0.6, 0.3], 'Summons a large body of oil below the caster'],
      ['SEA_LAVA', 'Sea of lava', 'sea_lava', 350, [0.2, 0.5, 0.6], 'Summons a large body of lava below the caster'],
      ['SEA_ACID', 'Sea of acid', 'sea_acid', 350, [0.2, 0.4, 0.5], 'Summons a large body of acid below the caster'],
      ['SEA_FLAMGAS', 'Sea of flammable gas', 'sea_flamgas', 200, [0.4, 0.4, 0.3], 'Summons a large body of flammable gas below the caster'],
    ] as const
  ).map(([id, name, projectile, price, weights, description]) =>
    spell({
      id, name, description, type: 'material', mana: 140, uses: 3, price,
      tiers: [4, 5, 6], weights: [...weights],
      action: (ctx) => {
        ctx.addProjectile(projectile);
        ctx.c.fireRateWait += 15;
      },
    }),
  ),
  ...(
    [
      ['MATERIAL_WATER', 'Water', 'spray_water', 110, [1, 2, 3, 4, 5], 'Transmutes mana into a spray of water'],
      ['MATERIAL_OIL', 'Oil', 'spray_oil', 140, [1, 2, 3, 4, 5], 'Transmutes mana into a spray of oil'],
      ['MATERIAL_BLOOD', 'Blood', 'spray_blood', 130, [2, 3, 4, 5], 'Transmutes mana into a spray of blood'],
      ['MATERIAL_ACID', 'Acid', 'spray_acid', 150, [2, 3, 4, 5], 'Transmutes mana into a spray of acid'],
    ] as const
  ).map(([id, name, projectile, price, tiers, description]) =>
    spell({
      id, name, description, type: 'material', mana: 0, price,
      tiers: [...tiers], weights: tiers.map(() => 0.4),
      action: (ctx) => {
        ctx.addProjectile(projectile);
        ctx.c.fireRateWait -= 15;
        ctx.addReload(-10);
      },
    }),
  ),

  // ================================================================== modifiers
  spell({
    id: 'DAMAGE', name: 'Damage plus', type: 'modifier', mana: 5, price: 140,
    description: 'Increases the damage done by a projectile',
    tiers: [1, 2, 3, 4, 5], weights: [0.6, 0.6, 0.8, 0.6, 0.6],
    action: modifier((c) => {
      c.damageProjectile += 10;
      c.fireRateWait += 5;
      c.recoil += 10;
    }),
  }),
  spell({
    id: 'SPEED', name: 'Speed up', type: 'modifier', mana: 3, price: 100,
    description: 'Increases the speed at which a projectile flies through the air',
    tiers: [1, 2, 3], weights: [1, 0.5, 0.5],
    action: modifier((c) => {
      c.speedMult = Math.min(c.speedMult * 2.5, 20);
    }),
  }),
  spell({
    id: 'HEAVY_SHOT', name: 'Heavy shot', type: 'modifier', mana: 7, price: 150,
    description: 'Greatly increases the damage done by a projectile, at the cost of its speed',
    tiers: [2, 3, 4], weights: [0.4, 0.4, 0.5],
    action: modifier((c) => {
      c.damageProjectile += 43.75;
      c.fireRateWait += 10;
      c.speedMult *= 0.3;
      c.recoil += 50;
    }),
  }),
  spell({
    id: 'MANA_REDUCE', name: 'Add mana', type: 'modifier', mana: -30, price: 250,
    description: 'Immediately adds 30 mana to the wand',
    tiers: [1, 2, 3, 4, 5, 6], weights: [0.7, 0.9, 1, 1, 1, 1],
    action: modifier((c, ctx) => {
      c.fireRateWait += 10;
      ctx.addMana(30); // the -30 `mana` field is display-only; the engine never charges negative mana
    }),
  }),
  spell({
    id: 'RECHARGE', name: 'Reduce recharge time', type: 'modifier', mana: 12, price: 200,
    description: 'Reduces the time between spellcasts',
    tiers: [1, 2, 3, 4, 5, 6], weights: [0.8, 0.9, 1, 0.8, 0.9, 1],
    action: (ctx) => {
      ctx.c.fireRateWait -= 10;
      ctx.addReload(-20);
      ctx.drawActions(1, true);
    },
  }),
  spell({
    id: 'HOMING', name: 'Homing', type: 'modifier', mana: 70, price: 220,
    description: 'Makes a projectile accelerate towards your foes',
    tiers: [1, 2, 3, 4, 5, 6], weights: [0.1, 0.4, 0.4, 0.4, 0.4, 0.4],
    action: modifier((c) => {
      c.homing += 1;
      addEffect(c, 'homing');
    }),
  }),
  spell({
    id: 'PIERCING_SHOT', name: 'Piercing shot', type: 'modifier', mana: 140, price: 190,
    description: 'Makes a projectile fly through enemies, but harmful to the caster',
    tiers: [2, 3, 4, 5, 6], weights: [0.4, 0.5, 0.6, 0.6, 0.4],
    action: modifier((c) => {
      c.damageProjectile -= 15;
      c.piercing = true;
      c.friendlyFire = true;
      addEffect(c, 'piercing');
    }),
  }),
  spell({
    id: 'EXPLOSIVE_PROJECTILE', name: 'Explosive projectile', type: 'modifier', mana: 30, price: 120,
    description: 'Makes a projectile more destructive to the environment',
    tiers: [2, 3, 4], weights: [1, 1, 0.8],
    action: modifier((c) => {
      c.explosionRadius += 7.5;
      c.damageExplosion += 5;
      c.fireRateWait += 40;
      c.speedMult *= 0.75;
      c.recoil += 30;
      addEffect(c, 'explosive');
    }),
  }),
  spell({
    id: 'FIRE_TRAIL', name: 'Fire trail', type: 'modifier', mana: 10, price: 130,
    description: 'Gives a projectile a trail of fiery particles',
    tiers: [0, 1, 2, 3, 4], weights: [0.4, 0.5, 0.3, 0.3, 0.2],
    action: trail('fire', 0.5),
  }),
  spell({
    id: 'OIL_TRAIL', name: 'Oil trail', type: 'modifier', mana: 10, price: 160,
    description: 'Gives a projectile a trail of oil',
    tiers: [2, 3, 4], weights: [0.3, 0.3, 0.3],
    action: trail('oil', 0.5),
  }),
  spell({
    id: 'WATER_TRAIL', name: 'Water trail', type: 'modifier', mana: 10, price: 160,
    description: 'Gives a projectile a trail of water',
    tiers: [1, 2, 3, 4], weights: [0.3, 0.3, 0.3, 0.3],
    action: trail('water', 0.6),
  }),
  spell({
    id: 'ACID_TRAIL', name: 'Acid trail', type: 'modifier', mana: 15, price: 160,
    description: 'Gives a projectile a trail of acid',
    tiers: [2, 3, 4, 5], weights: [0.3, 0.3, 0.3, 0.3],
    action: trail('acid', 0.4),
  }),
  spell({
    id: 'BOUNCE', name: 'Bounce', type: 'modifier', mana: 0, price: 50,
    description: 'Makes a projectile bounce on impact',
    tiers: [2, 3, 4, 6], weights: [1, 1, 0.4, 0.2],
    action: modifier((c) => {
      c.bounces += 10;
      addEffect(c, 'bounce_explode');
    }),
  }),
  spell({
    id: 'LIFETIME', name: 'Increase lifetime', type: 'modifier', mana: 40, price: 250,
    description: 'Increases the lifetime of a spell',
    tiers: [3, 4, 5, 6], weights: [0.5, 0.5, 0.5, 0.75],
    action: modifier((c) => {
      c.lifetimeAdd += 75;
      c.fireRateWait += 13;
    }),
  }),
  spell({
    id: 'LIFETIME_DOWN', name: 'Reduce lifetime', type: 'modifier', mana: 10, price: 90,
    description: 'Reduces the lifetime of a spell',
    tiers: [3, 4, 5, 6], weights: [0.5, 0.5, 0.75, 0.5],
    action: modifier((c) => {
      c.lifetimeAdd -= 42;
      c.fireRateWait -= 15;
    }),
  }),
  spell({
    id: 'SPREAD_REDUCE', name: 'Reduce spread', type: 'modifier', mana: 1, price: 100,
    description: 'Reduces the spread of a spell',
    tiers: [1, 2, 3, 4, 5, 6], weights: [0.8, 0.8, 0.8, 0.8, 0.7, 0.6],
    action: modifier((c) => {
      c.spread -= 60;
    }),
  }),
  spell({
    id: 'CRITICAL_HIT', name: 'Critical plus', type: 'modifier', mana: 5, price: 140,
    description: 'Gives a projectile +15% chance of a critical hit',
    tiers: [1, 2, 3, 4, 5], weights: [0.5, 0.6, 0.6, 0.7, 0.6],
    action: modifier((c) => {
      c.critChance += 15;
    }),
  }),
  spell({
    id: 'ELECTRIC_CHARGE', name: 'Electric charge', type: 'modifier', mana: 8, price: 150,
    description: 'Gives a projectile an electric charge, that it will release on impact',
    tiers: [1, 2, 4, 5], weights: [1, 1, 0.8, 0.7],
    action: modifier((c) => {
      c.damageElectric += 2.5;
      addEffect(c, 'electric_charge');
    }),
  }),
  spell({
    id: 'FREEZE', name: 'Freeze charge', type: 'modifier', mana: 10, price: 140,
    description: 'Gives a projectile a frozen charge, that it will release on impact',
    tiers: [1, 3, 4, 5], weights: [1, 1, 0.9, 0.8],
    action: modifier((c) => {
      c.damageIce += 5;
      addEffect(c, 'freeze_charge');
    }),
  }),
  spell({
    id: 'LIGHT', name: 'Light', type: 'modifier', mana: 1, price: 20,
    description: 'Makes a projectile illuminate its surroundings',
    tiers: [0, 1, 2, 3, 4], weights: [1, 0.8, 0.6, 0.4, 0.2],
    action: modifier((c) => {
      c.lightRadiusAdd += 66; // ~267 px light circle -> 133 px radius -> 66 voxels
      addEffect(c, 'light');
    }),
  }),
  spell({
    id: 'GRAVITY', name: 'Gravity', type: 'modifier', mana: 1, price: 50,
    description: 'Makes a projectile be strongly affected by gravity',
    tiers: [2, 3, 4, 5, 6], weights: [0.3, 0.3, 0.3, 0.3, 0.3],
    action: modifier((c) => {
      c.gravityAdd += 300;
      addEffect(c, 'gravity');
    }),
  }),
  spell({
    id: 'GRAVITY_ANTI', name: 'Anti-gravity', type: 'modifier', mana: 1, price: 50,
    description: 'Makes a projectile fall upwards',
    tiers: [2, 3, 4, 5, 6], weights: [0.3, 0.3, 0.3, 0.3, 0.3],
    action: modifier((c) => {
      c.gravityAdd -= 300;
      addEffect(c, 'anti_gravity');
    }),
  }),

  // ================================================================== multicasts
  spell({
    id: 'BURST_2', name: 'Double spell', type: 'multicast', mana: 0, price: 140,
    description: 'Simultaneously casts 2 spells',
    tiers: ALL_TIERS, weights: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8],
    action: (ctx) => ctx.drawActions(2, true),
  }),
  spell({
    id: 'BURST_3', name: 'Triple spell', type: 'multicast', mana: 2, price: 160,
    description: 'Simultaneously casts 3 spells',
    tiers: [1, 2, 3, 4, 5, 6], weights: [0.7, 0.7, 0.7, 0.7, 0.7, 0.7],
    action: (ctx) => ctx.drawActions(3, true),
  }),
  spell({
    id: 'BURST_4', name: 'Quadruple spell', type: 'multicast', mana: 5, price: 180,
    description: 'Simultaneously casts 4 spells',
    tiers: [2, 3, 4, 5, 6], weights: [0.4, 0.5, 0.6, 0.6, 0.6],
    action: (ctx) => ctx.drawActions(4, true),
  }),
  spell({
    id: 'SCATTER_2', name: 'Double scatter spell', type: 'multicast', mana: 0, price: 100,
    description: 'Simultaneously casts 2 spells with low accuracy',
    tiers: [0, 1, 2], weights: [0.8, 0.8, 0.7],
    action: (ctx) => {
      ctx.c.spread += 10;
      ctx.drawActions(2, true);
    },
  }),
  spell({
    id: 'SCATTER_3', name: 'Triple scatter spell', type: 'multicast', mana: 1, price: 120,
    description: 'Simultaneously casts 3 spells with low accuracy',
    tiers: [0, 1, 2, 3], weights: [0.6, 0.7, 0.7, 0.8],
    action: (ctx) => {
      ctx.c.spread += 20;
      ctx.drawActions(3, true);
    },
  }),
  spell({
    id: 'SCATTER_4', name: 'Quadruple scatter spell', type: 'multicast', mana: 2, price: 140,
    description: 'Simultaneously casts 4 spells with low accuracy',
    tiers: [1, 2, 3, 4, 5, 6], weights: [0.5, 0.6, 0.7, 0.8, 0.8, 0.6],
    action: (ctx) => {
      ctx.c.spread += 40;
      ctx.drawActions(4, true);
    },
  }),
  spell({
    id: 'I_SHAPE', name: 'Formation - behind your back', type: 'multicast', mana: 0, price: 30,
    description: 'Casts two spells: one ahead of and one behind the caster',
    tiers: [1, 2, 3], weights: [0.4, 0.5, 0.3],
    action: formation(180, -5, 2),
  }),
  spell({
    id: 'T_SHAPE', name: 'Formation - above and below', type: 'multicast', mana: 3, price: 30,
    description: 'Casts 3 spells - ahead, above and below the caster',
    tiers: [1, 2, 3, 4], weights: [0.4, 0.5, 0.4, 0.3],
    action: formation(90, -8, 3),
  }),
  spell({
    id: 'Y_SHAPE', name: 'Formation - bifurcated', type: 'multicast', mana: 2, price: 30,
    description: 'Casts 2 spells in a bifurcated pattern',
    tiers: [0, 1, 2, 3], weights: [0.8, 0.5, 0.4, 0.3],
    action: formation(45, -8, 2),
  }),
  spell({
    id: 'W_SHAPE', name: 'Formation - trifurcated', type: 'multicast', mana: 3, price: 50,
    description: 'Casts 3 spells in a trifurcated pattern',
    tiers: [2, 3, 4, 5, 6], weights: [0.4, 0.3, 0.5, 0.3, 0.3],
    action: formation(20, -5, 3),
  }),
  spell({
    // Noita id: PENTAGRAM_SHAPE
    id: 'PENTAGON_SHAPE', name: 'Formation - pentagon', type: 'multicast', mana: 5, price: 50,
    description: 'Casts 5 spells in a pentagonal pattern',
    tiers: [1, 2, 3, 4, 5], weights: [0.4, 0.4, 0.3, 0.2, 0.1],
    action: formation(180, -12, 5),
  }),
  spell({
    // Noita id: CIRCLE_SHAPE
    id: 'HEXAGON_SHAPE', name: 'Formation - hexagon', type: 'multicast', mana: 6, price: 50,
    description: 'Casts 6 spells in a hexagonal pattern',
    tiers: [1, 2, 3, 4, 5, 6], weights: [0.1, 0.2, 0.3, 0.3, 0.3, 0.3],
    action: formation(180, -15, 6),
  }),
];

export const SPELL_LIST: SpellDef[] = LIST;
export const SPELLS: Record<string, SpellDef> = Object.fromEntries(LIST.map((s) => [s.id, s]));

/** Every projectile id a spell can spawn (used by tests and asset preloading). */
export function spellProjectileIds(def: SpellDef): string[] {
  const ids = new Set<string>();
  const ctx: ActionContext = {
    c: defaultShotState(),
    addProjectile: (id) => void ids.add(id),
    addTrigger: (id) => void ids.add(id),
    drawActions: () => {},
    addReload: () => {},
    addMana: () => {},
    random: () => 0.5,
    permanent: false,
  };
  def.action(ctx);
  return [...ids];
}
