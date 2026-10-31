import type { AbilityId, AbilitySlot, ActionDef, ActiveAction, HitDef } from './types';
import type { Fighter } from './fighter';
import type { Simulation } from './simulation';
import { C } from './constants';
import { clamp } from '../core/math';

/**
 * Divine abilities. Each ability is an ActionDef (frame data, costs, cooldowns) plus behaviour
 * hooks that run inside the simulation. The AI's knowledge of when to use (and how to counter)
 * each ability lives in src/ai/abilityAI.ts.
 */

export type AbilityRole =
  | 'gapclose' | 'escape' | 'crossup' | 'zoning' | 'trap' | 'punish' | 'antiair' | 'defense' | 'counter'
  | 'heal' | 'setup' | 'burst' | 'ultimate' | 'deception' | 'timewarp';

export interface AbilityBehavior {
  def: ActionDef;
  roles: AbilityRole[];
  start?(sim: Simulation, f: Fighter, a: ActiveAction): void;
  update?(sim: Simulation, f: Fighter, a: ActiveAction): void;
  end?(sim: Simulation, f: Fighter, a: ActiveAction): void;
  land?(sim: Simulation, f: Fighter, a: ActiveAction): void;
}

function H(p: Partial<HitDef> & { damage: number }): HitDef {
  return { guard: 14, hitstun: 20, blockstun: 14, kbx: 200, kby: 0, level: 2, ...p };
}

interface DefSpec {
  name: string;
  slot: AbilitySlot;
  startup: number;
  active: number;
  recovery: number;
  energy?: number;
  wrath?: number;
  cd: number;
  range: [number, number];
  clip: string;
  air?: boolean;
  ground?: boolean;
  iframes?: [number, number];
  armor?: number;
  chargeable?: number;
  description: string;
  hit?: HitDef;
  hitbox?: ActionDef['hitbox'];
  height?: ActionDef['height'];
  sfx?: ActionDef['sfx'];
}

function D(id: AbilityId, s: DefSpec): ActionDef {
  return {
    id: `ab.${id}`, name: s.name, kind: 'ability', startup: s.startup, active: s.active, recovery: s.recovery,
    height: s.height ?? 'mid', clip: s.clip, energyCost: s.energy ?? 0, wrathCost: s.wrath ?? 0, cooldown: s.cd,
    range: s.range, airOK: s.air ?? false, groundOK: s.ground ?? true, iframes: s.iframes, armor: s.armor,
    chargeable: s.chargeable, slot: s.slot, abilityId: id, description: s.description, hit: s.hit, hitbox: s.hitbox, sfx: s.sfx,
  };
}

const activeFrame = (a: ActiveAction) => a.frame - (a.def.startup + a.hold);

export const ABILITIES: Record<AbilityId, AbilityBehavior> = {
  /* ============================ MOBILITY ============================ */
  phantomStep: {
    def: D('phantomStep', {
      name: 'Phantom Step', slot: 'mobility', startup: 1, active: 1, recovery: 1, energy: 16, cd: 210, range: [0, 900],
      clip: 'ab.vanish', air: true, description: 'Vanish and reappear behind the foe, primed to strike.',
    }),
    roles: ['crossup', 'gapclose', 'escape'],
    start(sim, f) {
      const p = sim.teleportTarget(f, 'behind');
      f.beginVanish(sim, p.x, p.y, 'phantomStep', 6);
      f.addBuff('haste', 50, 1);
    },
  },

  flashCut: {
    def: D('flashCut', {
      name: 'Flash Cut', slot: 'mobility', startup: 7, active: 9, recovery: 15, energy: 18, cd: 210, range: [60, 340],
      clip: 'ab.flashCut', iframes: [6, 16], description: 'A blinding dash straight through the enemy, cutting as you pass.',
      hit: H({ damage: 90, guard: 26, hitstun: 30, kbx: -260, kby: -380, level: 3, tag: 'cut' }),
      hitbox: { ax: -30, ay: -80, bx: 30, by: -70, r: 30 }, sfx: 'slash_hit',
    }),
    roles: ['gapclose', 'punish', 'crossup'],
    update(sim, f, a) {
      const af = activeFrame(a);
      if (af === 0) {
        f.vx = f.facing * 1750 * f.speedMult;
        a.data.noPush = 1;
        sim.emit({ type: 'dash', side: f.side, x: f.x, y: f.y, dir: f.facing, air: !f.grounded });
      }
      if (af >= 0 && af < a.def.active) {
        a.data.noPush = 1;
        a.data.float = 1;
        f.vy = 0;
      }
      if (af === a.def.active) f.vx *= 0.2;
    },
  },

  voidGate: {
    def: D('voidGate', {
      name: 'Void Gate', slot: 'mobility', startup: 9, active: 1, recovery: 4, energy: 14, cd: 200, range: [0, 1400],
      clip: 'ab.voidGate', air: true, description: 'Tear a rift and step through it to anywhere nearby.',
    }),
    roles: ['escape', 'crossup', 'gapclose'],
    start(sim, f, a) {
      const place = (a.data.place as number) === 1 ? 'away' : undefined;
      void place;
      sim.emit({ type: 'seq', kind: 'voidGate', beat: 'open', a: f.side, b: sim.opponentOf(f).side, x: f.x, y: f.y - 60 });
    },
    update(sim, f, a) {
      a.data.float = 1;
      f.vy = Math.min(f.vy, 0) * 0.8;
      if (a.frame === a.def.startup - 1) {
        const want = a.aim ? { x: a.aim.x, y: a.aim.y } : sim.teleportTarget(f, 'above');
        const p = sim.clampToArena(want.x, want.y);
        sim.emit({ type: 'seq', kind: 'voidGate', beat: 'exit', a: f.side, b: sim.opponentOf(f).side, x: p.x, y: p.y - 60 });
        f.beginVanish(sim, p.x, p.y, 'voidGate', 8);
      }
    },
  },

  galeAscent: {
    def: D('galeAscent', {
      name: 'Gale Ascent', slot: 'mobility', startup: 5, active: 2, recovery: 4, energy: 16, cd: 300, range: [0, 260],
      clip: 'ab.galeAscent', iframes: [0, 8], description: 'A cyclone hurls you skyward, blasting away anyone close.',
    }),
    roles: ['escape', 'antiair', 'gapclose'],
    update(sim, f, a) {
      if (activeFrame(a) === 0) {
        const opp = sim.opponentOf(f);
        const away = a.aim ? Math.sign(a.aim.x - f.x) || f.facing : f.facing;
        f.grounded = false;
        f.y = Math.min(f.y, -2);
        f.vy = -1750;
        f.vx = away * 360;
        sim.explode(f, f.x, f.y - 50, 90, H({ damage: 24, guard: 12, hitstun: 26, kbx: 520, kby: -700, launch: true, level: 2, tag: 'wind' }), 'ab.galeAscent', { selfSafe: true });
        void opp;
      }
    },
  },

  mirage: {
    def: D('mirage', {
      name: 'Mirage', slot: 'mobility', startup: 3, active: 1, recovery: 2, energy: 22, cd: 390, range: [80, 700],
      clip: 'ab.mirage', description: 'Send a perfect decoy charging in while you vanish and strike from behind.',
    }),
    roles: ['deception', 'crossup', 'gapclose'],
    start(sim, f) {
      const opp = sim.opponentOf(f);
      sim.spawnDecoy(f, f.x, f.y, Math.sign(opp.x - f.x) * 900, 30);
      const p = sim.teleportTarget(f, 'behind');
      f.beginVanish(sim, p.x, p.y, 'mirage', 26);
      f.addBuff('haste', 70, 1);
    },
  },

  /* ============================= RANGED ============================= */
  barrage: {
    def: D('barrage', {
      name: 'Divine Barrage', slot: 'ranged', startup: 10, active: 30, recovery: 12, energy: 20, cd: 230, range: [180, 1500],
      clip: 'ab.barrage', air: true, description: 'Hover and unleash a rapid volley of elemental bolts.',
    }),
    roles: ['zoning'],
    update(sim, f, a) {
      if (!f.grounded) {
        a.data.float = 1;
        f.vy *= 0.8;
        f.vx *= 0.9;
      }
      const af = activeFrame(a);
      if (af >= 0 && af < 30 && af % 6 === 0) {
        const opp = sim.opponentOf(f);
        const h = f.handPos();
        const tx = opp.x, ty = opp.centerY();
        const ang = Math.atan2(ty - h.y, tx - h.x) + (sim.rng.next() - 0.5) * 0.22;
        const sp = 1060 * (f.def.aspect === 'tempest' ? 1.15 : 1);
        sim.spawnProjectile(f, {
          x: h.x, y: h.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 12, style: 'bolt', life: 110, power: 0.8,
          hit: H({ damage: 24, guard: 7, hitstun: 13, blockstun: 9, kbx: 110, level: 1 }), source: 'ab.barrage',
        });
      }
    },
  },

  crescentWave: {
    def: D('crescentWave', {
      name: 'Crescent Wave', slot: 'ranged', startup: 12, active: 1, recovery: 18, energy: 18, cd: 200, range: [150, 1600],
      clip: 'ab.crescentWave', air: true, description: 'A slash so fast it tears loose and flies as a crescent of force.',
    }),
    roles: ['zoning', 'punish'],
    update(sim, f, a) {
      if (activeFrame(a) === 0) {
        const opp = sim.opponentOf(f);
        let vx = f.facing * 920, vy = 0;
        let y = f.y - 56;
        if (!f.grounded) {
          const ang = Math.atan2(opp.centerY() - (f.y - 60), opp.x - f.x);
          vx = Math.cos(ang) * 920;
          vy = Math.sin(ang) * 920;
          y = f.y - 60;
        }
        sim.spawnProjectile(f, {
          x: f.x + f.facing * 50, y, vx, vy, r: 40, style: 'crescent', life: 130, power: 2.4, grounded: f.grounded,
          hit: H({ damage: 88, guard: 30, hitstun: 30, kbx: 420, kby: -480, knockdown: true, level: 3, tag: 'cut' }), source: 'ab.crescentWave',
        });
      }
    },
  },

  seekerOrbs: {
    def: D('seekerOrbs', {
      name: 'Seeker Wisps', slot: 'ranged', startup: 14, active: 1, recovery: 14, energy: 24, cd: 330, range: [200, 1600],
      clip: 'ab.seekerOrbs', air: true, description: 'Three patient wisps that hunt the enemy wherever they flee.',
    }),
    roles: ['zoning', 'trap'],
    update(sim, f, a) {
      if (activeFrame(a) === 0) {
        for (let i = 0; i < 3; i++) {
          const ang = -Math.PI / 2 + (i - 1) * 0.9;
          sim.spawnProjectile(f, {
            x: f.x + Math.cos(ang) * 60, y: f.y - 80 + Math.sin(ang) * 60, vx: Math.cos(ang) * 260 + f.facing * 120, vy: Math.sin(ang) * 260,
            r: 15, style: 'seeker', life: 220, homing: 3.3, power: 1, armedIn: 8,
            hit: H({ damage: 36, guard: 10, hitstun: 18, kbx: 160, kby: -120, level: 2 }), source: 'ab.seekerOrbs',
          });
        }
      }
    },
  },

  starfall: {
    def: D('starfall', {
      name: 'Starfall', slot: 'ranged', startup: 16, active: 1, recovery: 16, energy: 30, cd: 520, range: [250, 2400],
      clip: 'ab.starfall', air: true, description: 'Call down a storm of falling stars around the foe.',
    }),
    roles: ['zoning', 'trap'],
    update(sim, f, a) {
      if (activeFrame(a) === 0) {
        const opp = sim.opponentOf(f);
        const offsets = [0, -150, 150, -290, 290, 0];
        for (let i = 0; i < 6; i++) {
          sim.spawnZone(f, {
            kind: 'meteor', x: opp.x + offsets[i] + (sim.rng.next() - 0.5) * 60, y: 0, r: 72, warn: 40 + i * 13, active: 8,
            hit: H({ damage: 52, guard: 22, hitstun: 26, kbx: 260, kby: -560, knockdown: true, level: 3 }), source: 'ab.starfall',
            trackUntil: i === 5 ? 30 + i * 13 : 0, trackSpeed: 420,
          });
        }
      }
    },
  },

  thunderJudgment: {
    def: D('thunderJudgment', {
      name: 'Thunder Judgment', slot: 'ranged', startup: 14, active: 1, recovery: 14, energy: 28, cd: 450, range: [200, 2400],
      clip: 'ab.thunder', air: true, description: 'Three tracking lightning strikes that stun on contact.',
    }),
    roles: ['zoning', 'trap', 'antiair'],
    update(sim, f, a) {
      if (activeFrame(a) === 0) {
        const opp = sim.opponentOf(f);
        for (let i = 0; i < 3; i++) {
          const warn = 34 + i * 22;
          sim.spawnZone(f, {
            kind: 'lightning', x: opp.x, y: 0, r: 58, warn, active: 6, trackUntil: warn - 12, trackSpeed: 520,
            hit: H({ damage: 60, guard: 24, hitstun: 34, kbx: 120, kby: -260, level: 3, tag: 'stun' }), source: 'ab.thunderJudgment',
            fullHeight: true,
          });
        }
      }
    },
  },

  spikeEruption: {
    def: D('spikeEruption', {
      name: 'Spike Eruption', slot: 'ranged', startup: 12, active: 33, recovery: 12, energy: 22, cd: 290, range: [100, 1100],
      clip: 'ab.spikes', description: 'A ripple of jagged spikes races along the ground.',
    }),
    roles: ['zoning', 'punish'],
    update(sim, f, a) {
      const af = activeFrame(a);
      if (af >= 0 && af < 33 && af % 3 === 0) {
        const k = af / 3;
        const x = f.x + f.facing * (90 + k * 72);
        if (Math.abs(x) < sim.arena.halfWidth - 10) {
          sim.spawnZone(f, {
            kind: 'spike', x, y: 0, r: 42, warn: 5, active: 7,
            hit: H({ damage: 50, guard: 16, hitstun: 30, kbx: 120, kby: -980, launch: true, level: 2 }), source: 'ab.spikeEruption',
          });
        }
      }
    },
  },

  gravityOrb: {
    def: D('gravityOrb', {
      name: 'Gravity Orb', slot: 'ranged', startup: 14, active: 1, recovery: 16, energy: 26, cd: 400, range: [150, 1300],
      clip: 'ab.gravityOrb', air: true, description: 'A crawling singularity that drags the foe in, then detonates.',
    }),
    roles: ['trap', 'setup', 'zoning'],
    update(sim, f, a) {
      if (activeFrame(a) === 0) {
        const opp = sim.opponentOf(f);
        const h = f.handPos();
        const ang = Math.atan2(opp.centerY() - h.y, opp.x - h.x);
        sim.spawnProjectile(f, {
          x: h.x, y: h.y, vx: Math.cos(ang) * 330, vy: Math.sin(ang) * 330, r: 26, style: 'gravity', life: 105, power: 3,
          pull: 1500, explode: 150, reflectable: false,
          hit: H({ damage: 88, guard: 30, hitstun: 36, kbx: 160, kby: -900, launch: true, level: 3 }), source: 'ab.gravityOrb',
        });
      }
    },
  },

  /* ============================= SPECIAL ============================ */
  annihilationBeam: {
    def: D('annihilationBeam', {
      name: 'Annihilation Beam', slot: 'special', startup: 34, active: 50, recovery: 24, energy: 40, cd: 560, range: [150, 2600],
      clip: 'ab.beam', air: true, chargeable: 30, description: 'Gather everything into one cataclysmic beam. Beams that meet will struggle.',
    }),
    roles: ['zoning', 'punish', 'burst'],
    update(sim, f, a) {
      if (!f.grounded) {
        a.data.float = 1;
        f.vy *= 0.85;
        f.vx *= 0.9;
      } else {
        f.vx *= 0.8;
      }
      const af = activeFrame(a);
      if (af === 0) {
        const opp = sim.opponentOf(f);
        const h = f.handPos();
        const ang = Math.atan2(opp.centerY() - h.y, opp.x - h.x);
        const power = 1 + a.hold / 60;
        sim.spawnBeam(f, { dirX: Math.cos(ang), dirY: Math.sin(ang), width: 40 + a.hold * 0.6, dps: 8.6 * power, life: a.def.active, source: 'ab.annihilationBeam' });
      }
      if (af >= 0 && af < a.def.active) {
        f.vx += -f.facing * 22; // recoil push
      }
    },
  },

  bindingChains: {
    def: D('bindingChains', {
      name: 'Binding Chains', slot: 'special', startup: 14, active: 1, recovery: 16, energy: 22, cd: 430, range: [100, 1100],
      clip: 'ab.chains', air: true, description: 'Spectral chains erupt beneath the foe and bind them in place.',
    }),
    roles: ['setup', 'trap', 'punish'],
    update(sim, f, a) {
      if (activeFrame(a) === 0) {
        const opp = sim.opponentOf(f);
        sim.spawnZone(f, {
          kind: 'chains', x: opp.x, y: 0, r: 70, warn: 18, active: 6, trackUntil: 9, trackSpeed: 600,
          hit: H({ damage: 30, guard: 12, hitstun: 80, kbx: 0, kby: 0, level: 2, tag: 'bind', unblockable: false }), source: 'ab.bindingChains',
          fullHeight: true, maxHeight: 220,
        });
      }
    },
  },

  dimensionRend: {
    def: D('dimensionRend', {
      name: 'Dimension Rend', slot: 'special', startup: 16, active: 1, recovery: 20, energy: 28, cd: 400, range: [100, 1500],
      clip: 'ab.rend', air: true, description: 'Mark a region of space, then shred it with countless invisible cuts.',
    }),
    roles: ['trap', 'zoning', 'punish'],
    update(sim, f, a) {
      if (activeFrame(a) === 0) {
        const opp = sim.opponentOf(f);
        // Predict where the foe will be.
        const px = clamp(opp.x + opp.vx * 0.35, -sim.arena.halfWidth + 60, sim.arena.halfWidth - 60);
        const py = Math.min(-70, opp.y + opp.vy * 0.2 - 60);
        sim.spawnZone(f, {
          kind: 'rend', x: px, y: py, r: 140, warn: 26, active: 24, interval: 4,
          hit: H({ damage: 17, guard: 8, hitstun: 16, blockstun: 8, kbx: 30, kby: -60, level: 1, tag: 'cut' }), source: 'ab.dimensionRend',
        });
      }
    },
  },

  titanSlam: {
    def: D('titanSlam', {
      name: 'Titan Slam', slot: 'special', startup: 10, active: 40, recovery: 14, energy: 18, cd: 280, range: [100, 650],
      clip: 'ab.titanSlam', iframes: [4, 18], description: 'Leap skyward and crash down, sending shockwaves along the earth.',
    }),
    roles: ['gapclose', 'zoning', 'punish'],
    update(sim, f, a) {
      const af = activeFrame(a);
      if (a.frame === 4 && f.grounded) {
        const opp = sim.opponentOf(f);
        f.grounded = false;
        f.y = -2;
        f.vy = -1250;
        const dist = clamp(opp.x - f.x, -560, 560);
        f.vx = dist / 0.75;
      }
      // Steer toward the target while airborne (hard to simply walk away from).
      if (!f.grounded && af < 8) {
        const opp = sim.opponentOf(f);
        const want = clamp((opp.x - f.x) / 0.35, -900, 900);
        f.vx += (want - f.vx) * 0.12;
      }
      if (af >= 8 && !f.grounded) f.vy = Math.max(f.vy, 1400);
      if (af >= a.def.active - 1 && !f.grounded) a.frame = a.def.startup + a.hold + a.def.active - 2; // hold until landing
    },
    land(sim, f, a) {
      if (a.data.landed) return;
      a.data.landed = 1;
      f.vx = 0;
      sim.explode(f, f.x, -20, 150, H({ damage: 126, guard: 36, hitstun: 30, kbx: 380, kby: -700, knockdown: true, level: 4 }), 'ab.titanSlam', { selfSafe: true });
      for (const dir of [-1, 1]) {
        sim.spawnProjectile(f, {
          x: f.x + dir * 70, y: -34, vx: dir * 1050, vy: 0, r: 34, style: 'shockwave', life: 55, grounded: true, power: 2,
          hit: H({ damage: 80, guard: 22, hitstun: 26, kbx: 300, kby: -520, knockdown: true, level: 2 }), source: 'ab.titanSlam', reflectable: false,
        });
      }
      sim.emit({ type: 'crater', x: f.x, r: 120 });
      a.frame = a.def.startup + a.hold + a.def.active;
    },
  },

  bladeStorm: {
    def: D('bladeStorm', {
      name: 'Blade Storm', slot: 'special', startup: 10, active: 6, recovery: 12, energy: 34, cd: 620, range: [150, 1400],
      clip: 'ab.bladeStorm', air: true, description: 'Six spectral blades orbit you, shield you, then fire one by one.',
    }),
    roles: ['zoning', 'defense'],
    update(sim, f, a) {
      if (activeFrame(a) === 0) {
        for (let i = 0; i < 4; i++) {
          sim.spawnProjectile(f, {
            x: f.x, y: f.y - 70, vx: 0, vy: 0, r: 16, style: 'blade', life: 240, power: 1.2,
            orbitR: 95, orbitAng: (i / 4) * Math.PI * 2, orbitSpeed: 5.2, releaseTick: sim.tick + 48 + i * 8, armedIn: 0,
            hit: H({ damage: 22, guard: 8, hitstun: 15, kbx: 150, kby: -80, level: 2, tag: 'cut' }), source: 'ab.bladeStorm',
          });
        }
      }
    },
  },

  chronoStop: {
    def: D('chronoStop', {
      name: 'Chrono Stop', slot: 'special', startup: 22, active: 1, recovery: 4, energy: 45, cd: 900, range: [0, 900],
      clip: 'ab.chronoStop', air: true, description: 'Halt time itself. Only you may move.',
    }),
    roles: ['timewarp', 'setup', 'punish'],
    update(sim, f, a) {
      if (!f.grounded) {
        a.data.float = 1;
        f.vy *= 0.8;
      }
      if (a.frame === 1) sim.emit({ type: 'seq', kind: 'chronoStop', beat: 'windup', a: f.side, b: sim.opponentOf(f).side, x: f.x, y: f.y - 60 });
      if (activeFrame(a) === 0) sim.startTimeStop(f, 84);
    },
  },

  /* ============================= DEFENSE ============================ */
  aegis: {
    def: D('aegis', {
      name: 'Aegis Dome', slot: 'defense', startup: 4, active: 1, recovery: 8, energy: 22, cd: 470, range: [0, 2600],
      clip: 'ab.aegis', air: true, description: 'A dome of divine light absorbs everything, then bursts outward.',
    }),
    roles: ['defense'],
    update(sim, f, a) {
      if (activeFrame(a) === 0) {
        f.addBuff('shield', 80, 190);
        sim.emit({ type: 'buff', side: f.side, id: 'shield', on: true });
      }
    },
  },

  mirrorWard: {
    def: D('mirrorWard', {
      name: 'Mirror Ward', slot: 'defense', startup: 2, active: 44, recovery: 10, energy: 12, cd: 200, range: [0, 2600],
      clip: 'ab.mirrorWard', air: true, description: 'A shimmering ward that reflects projectiles and repels strikes.',
    }),
    roles: ['defense', 'counter'],
    update(sim, f, a) {
      if (!f.grounded) {
        a.data.float = 1;
        f.vy *= 0.7;
      }
      const af = activeFrame(a);
      if (af === 0) {
        f.addBuff('reflect', a.def.active, 1);
        sim.emit({ type: 'buff', side: f.side, id: 'reflect', on: true });
      }
    },
    end(sim, f) {
      f.removeBuff('reflect');
      sim.emit({ type: 'buff', side: f.side, id: 'reflect', on: false });
    },
  },

  counterStance: {
    def: D('counterStance', {
      name: 'Iai Counter', slot: 'defense', startup: 2, active: 60, recovery: 18, energy: 14, cd: 300, range: [0, 400],
      clip: 'ab.counter', description: 'A still, perfect stance. Any strike that comes is answered by death.',
    }),
    roles: ['counter', 'defense'],
    update(sim, f, a) {
      const af = activeFrame(a);
      if (af === 0) f.addBuff('counter', a.def.active, 1);
    },
    end(sim, f) {
      f.removeBuff('counter');
    },
  },

  phaseShift: {
    def: D('phaseShift', {
      name: 'Phase Shift', slot: 'defense', startup: 2, active: 1, recovery: 2, energy: 20, cd: 400, range: [0, 2600],
      clip: 'ab.phase', air: true, description: 'Become intangible for a breath and reposition untouchable.',
    }),
    roles: ['escape', 'defense'],
    update(sim, f, a) {
      if (activeFrame(a) === 0) {
        f.addBuff('phase', 42, 1);
        f.addBuff('haste', 42, 1);
        sim.emit({ type: 'buff', side: f.side, id: 'phase', on: true });
      }
    },
  },

  chronoRewind: {
    def: D('chronoRewind', {
      name: 'Chrono Rewind', slot: 'defense', startup: 5, active: 1, recovery: 18, energy: 30, cd: 980, range: [0, 2600],
      clip: 'ab.rewind', air: true, iframes: [0, 24], description: 'Unwind the last two seconds of your own fate.',
    }),
    roles: ['heal', 'escape'],
    update(sim, f, a) {
      if (activeFrame(a) === 0) {
        const h = f.history.length > 120 ? f.history[f.history.length - 120] : f.history[0];
        if (h) {
          const fromX = f.x, fromY = f.y;
          const healed = Math.max(0, Math.min(h.hp, f.hp + 0.1 * f.maxHp) - f.hp);
          f.hp += healed;
          f.stats.healing += healed;
          const p = sim.clampToArena(h.x, h.y);
          f.x = p.x;
          f.y = p.y;
          f.grounded = f.y >= -0.5;
          if (f.grounded) f.y = 0;
          f.vx = 0;
          f.vy = 0;
          f.removeBuff('burn');
          f.removeBuff('chill');
          sim.emit({ type: 'rewind', side: f.side, fromX, fromY, toX: f.x, toY: f.y, healed });
        }
      }
    },
  },

  secondWind: {
    def: D('secondWind', {
      name: 'Second Wind', slot: 'defense', startup: 28, active: 1, recovery: 10, energy: 0, cd: 900, range: [500, 2600],
      clip: 'ab.secondWind', description: 'Breathe in the divine: restore health, energy and guard.',
    }),
    roles: ['heal'],
    update(sim, f, a) {
      if (activeFrame(a) === 0) {
        f.addBuff('regen', 120, 23);
        f.gainEnergy(20);
        f.guard = C.GUARD;
        sim.emit({ type: 'heal', side: f.side, amount: 46 });
      }
    },
  },

  /* ============================= ULTIMATE =========================== */
  ascension: {
    def: D('ascension', {
      name: 'Ascension', slot: 'ultimate', startup: 1, active: 1, recovery: 1, wrath: 100, cd: 60, range: [0, 2600],
      clip: 'ab.ascension', air: true, description: 'Shed mortal limits: faster, stronger, airborne — for a while.',
    }),
    roles: ['ultimate', 'burst'],
    start(sim, f) {
      sim.emit({ type: 'ultimate', side: f.side, abilityId: 'ascension', name: 'Ascension' });
      sim.startTransform(f);
    },
  },

  thousandCuts: {
    def: D('thousandCuts', {
      name: 'Thousand Cuts', slot: 'ultimate', startup: 10, active: 11, recovery: 30, wrath: 100, cd: 60, range: [60, 420],
      clip: 'ab.thousandCuts', iframes: [8, 22], description: 'A single step. A thousand cuts. Then silence.',
      hit: H({ damage: 40, guard: 70, hitstun: 40, blockstun: 26, kbx: 300, kby: -200, level: 4, tag: 'thousandCuts' }),
      hitbox: { ax: -20, ay: -86, bx: 44, by: -70, r: 34 }, sfx: 'finisher_slash',
    }),
    roles: ['ultimate', 'punish', 'gapclose'],
    start(sim, f) {
      sim.emit({ type: 'ultimate', side: f.side, abilityId: 'thousandCuts', name: 'Thousand Cuts' });
    },
    update(sim, f, a) {
      const af = activeFrame(a);
      if (af === 0) f.vx = f.facing * 1900;
      if (af >= 0 && af < a.def.active) {
        a.data.noPush = 1;
        a.data.float = 1;
        f.vy = 0;
      }
      if (af === a.def.active) f.vx *= 0.15;
    },
  },

  supernova: {
    def: D('supernova', {
      name: 'Supernova', slot: 'ultimate', startup: 42, active: 1, recovery: 32, wrath: 100, cd: 60, range: [0, 420],
      clip: 'ab.supernova', air: true, armor: 42, description: 'Become a dying star. Everything nearby is consumed.',
    }),
    roles: ['ultimate', 'burst'],
    start(sim, f) {
      sim.emit({ type: 'ultimate', side: f.side, abilityId: 'supernova', name: 'Supernova' });
    },
    update(sim, f, a) {
      a.data.float = 1;
      f.vx *= 0.85;
      f.vy *= 0.8;
      if (activeFrame(a) === 0) {
        sim.explode(f, f.x, f.y - 60, 460, H({ damage: 275, guard: 95, hitstun: 50, blockstun: 30, kbx: 900, kby: -900, launch: true, level: 4, crush: true }), 'ab.supernova', { selfSafe: true, big: true });
      }
    },
  },

  heavensLance: {
    def: D('heavensLance', {
      name: "Heaven's Lance", slot: 'ultimate', startup: 18, active: 1, recovery: 20, wrath: 100, cd: 60, range: [0, 2600],
      clip: 'ab.lance', air: true, description: 'A pillar of judgment hunts the foe from the heavens.',
    }),
    roles: ['ultimate', 'zoning', 'trap'],
    start(sim, f) {
      sim.emit({ type: 'ultimate', side: f.side, abilityId: 'heavensLance', name: "Heaven's Lance" });
    },
    update(sim, f, a) {
      if (activeFrame(a) === 0) {
        const opp = sim.opponentOf(f);
        sim.spawnZone(f, {
          kind: 'lance', x: opp.x, y: 0, r: 112, warn: 64, active: 9, trackUntil: 46, trackSpeed: 420,
          hit: H({ damage: 272, guard: 100, hitstun: 50, kbx: 200, kby: -900, launch: true, level: 4, unblockable: true }), source: 'ab.heavensLance',
          fullHeight: true,
        });
      }
    },
  },

  blackHole: {
    def: D('blackHole', {
      name: 'Event Horizon', slot: 'ultimate', startup: 24, active: 1, recovery: 20, wrath: 100, cd: 60, range: [0, 1400],
      clip: 'ab.blackHole', air: true, description: 'Open a black hole that devours the battlefield, then collapses.',
    }),
    roles: ['ultimate', 'trap'],
    start(sim, f) {
      sim.emit({ type: 'ultimate', side: f.side, abilityId: 'blackHole', name: 'Event Horizon' });
    },
    update(sim, f, a) {
      if (activeFrame(a) === 0) {
        const opp = sim.opponentOf(f);
        const x = clamp(opp.x + Math.sign(opp.x - f.x || 1) * 120, -sim.arena.halfWidth + 220, sim.arena.halfWidth - 220);
        sim.spawnZone(f, {
          kind: 'blackhole', x, y: -170, r: 270, warn: 66, active: 6, pull: 2700,
          hit: H({ damage: 280, guard: 100, hitstun: 50, kbx: 400, kby: -1000, launch: true, level: 4, unblockable: true }), source: 'ab.blackHole',
        });
      }
    },
  },

  colossus: {
    def: D('colossus', {
      name: 'Colossus Reaver', slot: 'ultimate', startup: 30, active: 1, recovery: 24, wrath: 100, cd: 60, range: [0, 2600],
      clip: 'ab.colossus', description: 'A titanic spectral blade sweeps the entire arena.',
    }),
    roles: ['ultimate', 'zoning'],
    start(sim, f) {
      sim.emit({ type: 'ultimate', side: f.side, abilityId: 'colossus', name: 'Colossus Reaver' });
    },
    update(sim, f, a) {
      if (activeFrame(a) === 0) {
        sim.spawnZone(f, {
          kind: 'colossus', x: f.x - f.facing * 260, y: -70, r: 125, warn: 0, active: 80, vx: f.facing * 2100,
          hit: H({ damage: 245, guard: 100, hitstun: 46, kbx: 760, kby: -620, knockdown: true, level: 4, unblockable: true }), source: 'ab.colossus',
        });
      }
    },
  },

  cataclysm: {
    def: D('cataclysm', {
      name: 'Cataclysm', slot: 'ultimate', startup: 38, active: 1, recovery: 18, wrath: 100, cd: 60, range: [0, 2600],
      clip: 'ab.cataclysm', air: true, description: 'Drag a burning moon from the sky onto your enemy.',
    }),
    roles: ['ultimate', 'zoning', 'trap'],
    start(sim, f) {
      sim.emit({ type: 'ultimate', side: f.side, abilityId: 'cataclysm', name: 'Cataclysm' });
    },
    update(sim, f, a) {
      if (activeFrame(a) === 0) {
        const opp = sim.opponentOf(f);
        sim.spawnZone(f, {
          kind: 'cataclysm', x: opp.x, y: 0, r: 340, warn: 66, active: 10, trackUntil: 48, trackSpeed: 330,
          hit: H({ damage: 260, guard: 100, hitstun: 50, kbx: 700, kby: -1100, launch: true, level: 4, unblockable: true }), source: 'ab.cataclysm',
        });
      }
    },
  },
};

export const ABILITY_IDS = Object.keys(ABILITIES) as AbilityId[];

export function abilityDef(id: AbilityId): ActionDef {
  return ABILITIES[id].def;
}
