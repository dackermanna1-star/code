import { ASPECT_PALETTES, type AspectId, type AspectPalette } from '../../core/ids';
import type { Simulation } from '../../sim/simulation';
import type { Beam, Projectile, Zone } from '../../sim/types';
import { blit, darken, glowSprite, hotSprite, lighten, rgbaQ, ringSprite } from './sprites';
import { LAYER, PF, PK, type ParticleSystem } from './particles';
import { drawBeamShape, drawBoltNow, FL, Fx, FX, type FxPool, impactBurst, stickFigure, swordPath } from './effects';

/**
 * Renders the simulation's live entities (projectiles, beams, ability zones, decoys, time stop)
 * and emits their ambient particles. Reads the sim only.
 */

const TAU = Math.PI * 2;
const HAZARD: AspectPalette = { name: 'Hazard', primary: '#ff5a2a', secondary: '#ffb070', core: '#fff0e0', dark: '#2a0800', hue: 15, blurb: '' };
const FROZEN: AspectPalette = { name: 'Frozen', primary: '#8fd3ff', secondary: '#e2f6ff', core: '#ffffff', dark: '#0a2030', hue: 200, blurb: '' };

interface Trail {
  xs: Float32Array;
  ys: Float32Array;
  n: number;
  lastX: number;
  lastY: number;
  stamp: number;
  acc: number;
  aspect: AspectId;
  style: string;
  frozen: boolean;
}

interface ZoneState {
  struck: boolean;
  stamp: number;
  acc: number;
  colX: Float32Array; // colossus echo positions
  colN: number;
}

const TRAIL_N = 14;

const pal = (a: AspectId | null): AspectPalette => (a ? ASPECT_PALETTES[a] : HAZARD);

export class EntityRenderer {
  private trails = new Map<number, Trail>();
  private zones = new Map<number, ZoneState>();
  private beamAcc = new Map<number, number>();
  private stamp = 0;
  time = 0;
  private tmp = new Fx();

  clear(): void {
    this.trails.clear();
    this.zones.clear();
    this.beamAcc.clear();
  }

  /* ================================================================== */
  /* Update: trails, emission, strike bursts                            */
  /* ================================================================== */

  update(dt: number, sim: Simulation, ps: ParticleSystem, fx: FxPool): void {
    this.stamp++;
    const st = this.stamp;
    if (dt > 0) this.time += dt;
    const half = sim.arena ? sim.arena.halfWidth : 1300;

    // Projectiles.
    for (const p of sim.projectiles) {
      if (p.dead) continue;
      let tr = this.trails.get(p.id);
      if (!tr) {
        tr = { xs: new Float32Array(TRAIL_N), ys: new Float32Array(TRAIL_N), n: 0, lastX: p.x, lastY: p.y, stamp: st, acc: 0, aspect: p.aspect, style: p.style, frozen: false };
        this.trails.set(p.id, tr);
      }
      tr.stamp = st;
      tr.aspect = p.aspect;
      tr.frozen = p.frozen;
      if (!p.frozen && dt > 0) {
        const moved = Math.abs(p.x - tr.lastX) + Math.abs(p.y - tr.lastY);
        if (moved > 1.5 || tr.n === 0) {
          // shift
          const m = Math.min(tr.n, TRAIL_N - 1);
          for (let i = m; i > 0; i--) {
            tr.xs[i] = tr.xs[i - 1];
            tr.ys[i] = tr.ys[i - 1];
          }
          tr.xs[0] = p.x;
          tr.ys[0] = p.y;
          tr.n = Math.min(TRAIL_N, tr.n + 1);
          tr.lastX = p.x;
          tr.lastY = p.y;
        }
        this.emitProjectile(p, tr, dt, ps, sim);
      }
    }
    for (const [id, tr] of this.trails) {
      if (tr.stamp !== st) {
        // Vanished: small elemental fizzle if it was on-stage.
        if (Math.abs(tr.lastX) < half + 20 && tr.lastY < 20) this.fizzle(tr, ps);
        this.trails.delete(id);
      }
    }

    // Beams.
    for (const b of sim.beams) {
      if (b.dead) continue;
      if (dt <= 0) continue;
      const P = pal(b.aspect);
      let acc = (this.beamAcc.get(b.id) ?? 0) + dt * (b.struggling ? 260 : 110);
      const tx = b.ox + b.dirX * b.length, ty = b.oy + b.dirY * b.length;
      while (acc >= 1) {
        acc -= 1;
        const a = Math.atan2(-b.dirY, -b.dirX) + (Math.random() - 0.5) * (b.struggling ? 3.2 : 1.6);
        const sp = 300 + Math.random() * (b.struggling ? 1500 : 900);
        const i = ps.emit(PK.SPARK, LAYER.FRONT, tx, ty, Math.cos(a) * sp, Math.sin(a) * sp, 0.15 + Math.random() * 0.25, 2 + Math.random() * 2.5, Math.random() < 0.4 ? '#ffffff' : P.secondary);
        ps.grav[i] = 900;
        ps.len[i] = 0.03;
        ps.flags[i] |= PF.WHITE_CORE;
      }
      this.beamAcc.set(b.id, acc);
      if (Math.random() < dt * 30) {
        const i = ps.emit(PK.MOTE, LAYER.FRONT, b.ox + (Math.random() - 0.5) * 40, b.oy + (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 120, -60 - Math.random() * 120, 0.4, 2.5, P.secondary);
        ps.drag[i] = 2;
      }
      if (b.struggling && Math.random() < dt * 14) {
        const f = fx.spawn(FX.LIGHTNING, FL.FRONT, tx, ty, 0.12, Math.random() < 0.5 ? P.primary : '#ffffff');
        const a = Math.random() * TAU;
        const l = 80 + Math.random() * 160;
        f.x2 = tx + Math.cos(a) * l;
        f.y2 = ty + Math.sin(a) * l;
        f.a = 2.2;
      }
    }
    for (const id of this.beamAcc.keys()) if (!sim.beams.some((b) => b.id === id)) this.beamAcc.delete(id);

    // Zones.
    for (const z of sim.zones) {
      if (z.dead) continue;
      let zs = this.zones.get(z.id);
      if (!zs) {
        zs = { struck: false, stamp: st, acc: 0, colX: new Float32Array(6), colN: 0 };
        this.zones.set(z.id, zs);
      }
      zs.stamp = st;
      if (dt <= 0) continue;
      const P = pal(z.aspect);
      if (z.age >= z.warn && !zs.struck) {
        zs.struck = true;
        this.strikeBurst(z, P, ps, fx);
      }
      this.emitZone(z, zs, P, dt, ps);
      if (z.kind === 'colossus') {
        const m = Math.min(zs.colN, 5);
        for (let i = m; i > 0; i--) zs.colX[i] = zs.colX[i - 1];
        zs.colX[0] = z.x;
        zs.colN = Math.min(6, zs.colN + 1);
      }
    }
    for (const [id, zs] of this.zones) if (zs.stamp !== st) this.zones.delete(id);
  }

  private fizzle(tr: Trail, ps: ParticleSystem): void {
    const P = ASPECT_PALETTES[tr.aspect];
    const i = ps.emit(PK.FLASH, LAYER.FRONT, tr.lastX, tr.lastY, 0, 0, 0.1, 14, P.primary);
    ps.size2[i] = 50;
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * TAU;
      const sp = 150 + Math.random() * 350;
      const j = ps.emit(PK.SPARK, LAYER.FRONT, tr.lastX, tr.lastY, Math.cos(a) * sp, Math.sin(a) * sp, 0.15 + Math.random() * 0.15, 1.5 + Math.random() * 1.5, P.secondary);
      ps.len[j] = 0.03;
      ps.drag[j] = 3;
    }
  }

  private emitProjectile(p: Projectile, tr: Trail, dt: number, ps: ParticleSystem, sim: Simulation): void {
    const P = ASPECT_PALETTES[p.aspect];
    let rate = 0;
    switch (p.style) {
      case 'kiblast': rate = 22; break;
      case 'bolt': rate = p.aspect === 'inferno' ? 70 : p.aspect === 'verdant' ? 14 : p.aspect === 'chrono' ? 10 : 32; break;
      case 'crescent': rate = 50; break;
      case 'seeker': rate = 26; break;
      case 'gravity': rate = 45; break;
      case 'shockwave': rate = 50; break;
      case 'blade': rate = p.orbitR > 0 ? 6 : 24; break;
      default: rate = 20;
    }
    tr.acc += dt * rate;
    const sp = Math.hypot(p.vx, p.vy) + 1e-3;
    const ux = p.vx / sp, uy = p.vy / sp;
    while (tr.acc >= 1) {
      tr.acc -= 1;
      const jx = (Math.random() - 0.5) * p.r, jy = (Math.random() - 0.5) * p.r;
      switch (p.style) {
        case 'bolt':
          switch (p.aspect) {
            case 'inferno': {
              const i = ps.emit(PK.FLAME, LAYER.FRONT, p.x + jx, p.y + jy, -ux * 80 + (Math.random() - 0.5) * 60, -uy * 80 - 60, 0.22 + Math.random() * 0.2, p.r * (0.9 + Math.random() * 0.6), Math.random() < 0.5 ? P.primary : '#ff3a10');
              ps.setColor2(i, '#fff1c1');
              if (Math.random() < 0.2) ps.emit(PK.EMBER, LAYER.FRONT, p.x, p.y, (Math.random() - 0.5) * 200, -100 - Math.random() * 150, 0.6, 2, '#ffb347');
              break;
            }
            case 'frost': {
              const i = ps.emit(PK.DUST, LAYER.FRONT, p.x + jx, p.y + jy, -ux * 40, -uy * 40, 0.4, p.r * 0.8, '#cdefff', 0.35);
              ps.size2[i] = p.r * 2.4;
              if (Math.random() < 0.3) {
                const j = ps.emit(PK.SHARD, LAYER.FRONT, p.x, p.y, (Math.random() - 0.5) * 160, (Math.random() - 0.5) * 160, 0.35, 3, P.secondary);
                ps.vrot[j] = 12;
              }
              break;
            }
            case 'tempest': {
              const a = Math.random() * TAU;
              const i = ps.emit(PK.SPARK, LAYER.FRONT, p.x, p.y, Math.cos(a) * 420, Math.sin(a) * 420, 0.08 + Math.random() * 0.08, 1.6, Math.random() < 0.5 ? '#ffffff' : P.secondary);
              ps.len[i] = 0.035;
              break;
            }
            case 'void': {
              const i = ps.emit(PK.WISP, LAYER.FRONT, p.x + jx, p.y + jy, -ux * 60, -uy * 60, 0.35, 4, darken(P.primary, 0.55), 0.7);
              ps.drag[i] = 2;
              break;
            }
            case 'radiance': {
              const i = ps.emit(PK.MOTE, LAYER.FRONT, p.x + jx, p.y + jy, -ux * 60 + (Math.random() - 0.5) * 50, -uy * 60 + (Math.random() - 0.5) * 50, 0.35, 2, Math.random() < 0.5 ? '#ffffff' : P.secondary);
              ps.drag[i] = 2;
              break;
            }
            case 'verdant': {
              const i = ps.emit(PK.PETAL, LAYER.FRONT, p.x, p.y, -ux * 80 + (Math.random() - 0.5) * 80, -uy * 80 + (Math.random() - 0.5) * 80, 0.6, 4, P.primary);
              ps.vrot[i] = (Math.random() - 0.5) * 12;
              ps.drag[i] = 1.5;
              break;
            }
            case 'chrono': {
              const i = ps.emit(PK.GLYPH, LAYER.FRONT, p.x, p.y, -ux * 40, -uy * 40, 0.5, 5, P.secondary);
              ps.shape[i] = (Math.random() * 2) | 0;
              ps.vrot[i] = (Math.random() - 0.5) * 6;
              break;
            }
          }
          break;
        case 'crescent': {
          // Sparks shed from the crescent tips.
          const side = Math.random() < 0.5 ? -1 : 1;
          const tipX = p.x - ux * p.r * 0.4 - uy * side * p.r * 1.2, tipY = p.y - uy * p.r * 0.4 + ux * side * p.r * 1.2;
          const i = ps.emit(PK.SPARK, LAYER.FRONT, tipX, tipY, -ux * 300 + (Math.random() - 0.5) * 200, -uy * 300 + (Math.random() - 0.5) * 200, 0.18, 2, Math.random() < 0.5 ? '#ffffff' : P.secondary);
          ps.len[i] = 0.03;
          if (p.grounded && Math.random() < 0.4) {
            const j = ps.emit(PK.DUST, LAYER.BACK, p.x - ux * 30, -10, -ux * 120, -40, 0.6, 16, '#8d7f72', 0.45);
            ps.size2[j] = 50;
          }
          break;
        }
        case 'seeker': {
          const i = ps.emit(PK.MOTE, LAYER.FRONT, p.x + jx * 0.5, p.y + jy * 0.5, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, 0.4, 2 + Math.random() * 1.5, Math.random() < 0.4 ? '#ffffff' : P.primary);
          ps.drag[i] = 1.5;
          break;
        }
        case 'gravity': {
          const a = Math.random() * TAU;
          const rr = p.r * (2.8 + Math.random() * 2.5);
          const i = ps.emit(PK.MOTE, LAYER.FRONT, p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, Math.cos(a + 1.5) * 200, Math.sin(a + 1.5) * 200, 0.6, 2 + Math.random() * 1.5, Math.random() < 0.3 ? '#ffffff' : P.secondary);
          ps.flags[i] |= PF.HOMING;
          ps.hx[i] = p.x + p.vx * 0.3;
          ps.hy[i] = p.y + p.vy * 0.3;
          ps.homing[i] = 1400;
          break;
        }
        case 'shockwave': {
          const i = ps.emit(PK.DUST, LAYER.BACK, p.x - ux * 20 + (Math.random() - 0.5) * 30, -8, -ux * 100 + (Math.random() - 0.5) * 80, -30 - Math.random() * 60, 0.55, 14, '#8d7f72', 0.5);
          ps.size2[i] = 46;
          if (Math.random() < 0.5) {
            const j = ps.emit(PK.DEBRIS, LAYER.FRONT, p.x, -6, -ux * 60 + (Math.random() - 0.5) * 200, -300 - Math.random() * 300, 0.8, 3 + Math.random() * 3, '#2a2420');
            ps.grav[j] = 2200;
            ps.flags[j] |= PF.BOUNCE;
            ps.vrot[j] = 10;
            ps.setColor2(j, '#6b5d52');
          }
          break;
        }
        case 'blade': {
          const i = ps.emit(PK.MOTE, LAYER.FRONT, p.x + jx, p.y + jy, -ux * 40, -uy * 40, 0.3, 2, P.secondary);
          ps.drag[i] = 2;
          break;
        }
        default: {
          const i = ps.emit(PK.MOTE, LAYER.FRONT, p.x + jx, p.y + jy, -ux * 60, -uy * 60, 0.3, 2, P.secondary);
          ps.drag[i] = 2;
        }
      }
    }
    void sim;
  }

  private emitZone(z: Zone, zs: ZoneState, P: AspectPalette, dt: number, ps: ParticleSystem): void {
    const warn = z.age < z.warn;
    const w = z.warn > 0 ? Math.min(1, z.age / z.warn) : 1;
    switch (z.kind) {
      case 'blackhole': {
        if (z.age < z.warn + z.active) {
          zs.acc += dt * (40 + 60 * w);
          while (zs.acc >= 1) {
            zs.acc -= 1;
            const a = Math.random() * TAU;
            const rr = 260 + Math.random() * 300;
            const deb = Math.random() < 0.35;
            const i = ps.emit(deb ? PK.DEBRIS : PK.MOTE, LAYER.FRONT, z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.75, Math.cos(a + 1.57) * 280, Math.sin(a + 1.57) * 220, 1.1, deb ? 3 + Math.random() * 6 : 2 + Math.random() * 2, deb ? '#2a2030' : Math.random() < 0.3 ? '#ffffff' : P.secondary);
            ps.flags[i] |= PF.HOMING;
            ps.hx[i] = z.x;
            ps.hy[i] = z.y;
            ps.homing[i] = 1600;
            ps.vrot[i] = (Math.random() - 0.5) * 12;
            ps.setColor2(i, '#584a62');
          }
        }
        break;
      }
      case 'cataclysm': {
        if (warn) {
          zs.acc += dt * 70;
          const m = this.moonPos(z, -1400);
          while (zs.acc >= 1) {
            zs.acc -= 1;
            const a = Math.random() * TAU;
            const rr = m.r * (0.7 + Math.random() * 0.4);
            const i = ps.emit(PK.FLAME, LAYER.FRONT, m.x + Math.cos(a) * rr, m.y + Math.sin(a) * rr * 0.9, (Math.random() - 0.5) * 120, -260 - Math.random() * 300, 0.45 + Math.random() * 0.35, 26 + Math.random() * 26, Math.random() < 0.8 ? (Math.random() < 0.5 ? '#ff6a1a' : '#ff9a3a') : P.primary);
            ps.setColor2(i, '#fff1c1');
          }
        }
        break;
      }
      case 'lightning': {
        if (warn && w > 0.4 && Math.random() < dt * 30) {
          const i = ps.emit(PK.SPARK, LAYER.FRONT, z.x + (Math.random() - 0.5) * z.r, -Math.random() * 30, (Math.random() - 0.5) * 300, -200 - Math.random() * 400, 0.15, 1.6, P.secondary);
          ps.len[i] = 0.03;
        }
        break;
      }
      case 'lance': {
        if (warn && Math.random() < dt * 25 * w) {
          const i = ps.emit(PK.MOTE, LAYER.FRONT, z.x + (Math.random() - 0.5) * z.r * 1.6, -4, 0, -150 - Math.random() * 250, 0.7, 2.5, P.secondary);
          ps.drag[i] = 0.5;
        }
        break;
      }
      case 'colossus': {
        if (!warn && Math.random() < dt * 40) {
          const i = ps.emit(PK.DUST, LAYER.BACK, z.x, -10, -Math.sign(z.vx) * 200, -60, 0.7, 30, '#8d7f72', 0.5);
          ps.size2[i] = 110;
          const j = ps.emit(PK.MOTE, LAYER.FRONT, z.x + (Math.random() - 0.5) * 60, z.y - Math.random() * z.r * 2, -Math.sign(z.vx) * 300, (Math.random() - 0.5) * 100, 0.5, 3, P.secondary);
          ps.drag[j] = 2;
        }
        break;
      }
      case 'rend': {
        if (!warn && Math.random() < dt * 60) {
          const a = Math.random() * TAU;
          const rr = Math.random() * z.r;
          const i = ps.emit(PK.SPARK, LAYER.FRONT, z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr, (Math.random() - 0.5) * 900, (Math.random() - 0.5) * 900, 0.1, 1.5, '#ffffff');
          ps.len[i] = 0.025;
        }
        break;
      }
      default:
        break;
    }
  }

  private strikeBurst(z: Zone, P: AspectPalette, ps: ParticleSystem, fx: FxPool): void {
    switch (z.kind) {
      case 'lightning': {
        const f = fx.spawn(FX.LIGHTNING, FL.MID, z.x + (Math.random() - 0.5) * 60, -1500, 0.28, P.primary);
        f.x2 = z.x;
        f.y2 = 0;
        f.a = 5;
        f.flag = 1; // keep branches above the ground
        this.groundSplash(ps, z.x, P.secondary, 1);
        break;
      }
      case 'meteor':
        impactBurst(ps, z.x, -20, 0.75, P.primary);
        break;
      case 'cataclysm':
        impactBurst(ps, z.x, -40, 2.4, P.primary);
        impactBurst(ps, z.x, -20, 1.2, '#ff8a3a');
        break;
      case 'lance': {
        impactBurst(ps, z.x, -10, 1.2, P.primary);
        break;
      }
      case 'spike': {
        for (let k = 0; k < 3; k++) {
          const i = ps.emit(PK.DEBRIS, LAYER.FRONT, z.x + (Math.random() - 0.5) * 30, -6, (Math.random() - 0.5) * 360, -380 - Math.random() * 380, 0.6, 2.5 + Math.random() * 3, '#3a302a');
          ps.grav[i] = 2400;
          ps.flags[i] |= PF.BOUNCE;
          ps.vrot[i] = 14;
          ps.setColor2(i, '#5e5048');
        }
        const d = ps.emit(PK.DUST, LAYER.BACK, z.x, -10, 0, -40, 0.6, 20, '#8d7f72', 0.5);
        ps.size2[d] = 70;
        break;
      }
      case 'chains': {
        for (let k = 0; k < 10; k++) {
          const i = ps.emit(PK.GLYPH, LAYER.FRONT, z.x + (Math.random() - 0.5) * z.r * 2, -Math.random() * 40, (Math.random() - 0.5) * 100, -150 - Math.random() * 200, 0.7, 7, P.secondary);
          ps.shape[i] = 2;
          ps.vrot[i] = (Math.random() - 0.5) * 4;
        }
        this.groundSplash(ps, z.x, P.primary, 0.6);
        break;
      }
      case 'rend': {
        const i = ps.emit(PK.FLASH, LAYER.FRONT, z.x, z.y, 0, 0, 0.12, 40, '#ffffff');
        ps.size2[i] = z.r * 1.6;
        break;
      }
      case 'blackhole': {
        const i = ps.emit(PK.FLASH, LAYER.FRONT, z.x, z.y, 0, 0, 0.25, 80, '#ffffff');
        ps.size2[i] = z.r * 3;
        const r = ps.emit(PK.RING, LAYER.FRONT, z.x, z.y, 0, 0, 0.5, 40, P.primary);
        ps.size2[r] = z.r * 2.6;
        ps.len[r] = 20;
        ps.flags[r] |= PF.WHITE_CORE;
        break;
      }
      case 'colossus': {
        const i = ps.emit(PK.FLASH, LAYER.FRONT, z.x, z.y, 0, 0, 0.15, 60, P.primary);
        ps.size2[i] = 260;
        break;
      }
      default:
        break;
    }
  }

  private groundSplash(ps: ParticleSystem, x: number, color: string, power: number): void {
    let i = ps.emit(PK.FLASH, LAYER.FRONT, x, -10, 0, 0, 0.14, 30, '#ffffff');
    ps.size2[i] = 160 * power;
    for (let k = 0; k < 16 * power; k++) {
      const a = -Math.PI * Math.random();
      const sp = 400 + Math.random() * 900;
      i = ps.emit(PK.SPARK, LAYER.FRONT, x, -6, Math.cos(a) * sp, Math.sin(a) * sp, 0.2 + Math.random() * 0.25, 2 + Math.random() * 2, Math.random() < 0.5 ? '#ffffff' : color);
      ps.grav[i] = 1500;
      ps.len[i] = 0.03;
    }
    i = ps.emit(PK.RING, LAYER.FRONT, x, -6, 0, 0, 0.35, 10, color);
    ps.size2[i] = 120 * power;
    ps.len[i] = 8;
  }

  private moonPos(z: Zone, viewTop: number): { x: number; y: number; r: number } {
    const w = z.warn > 0 ? Math.min(1, z.age / z.warn) : 1;
    const r = z.r * 0.72;
    const startY = Math.min(viewTop, -1200) - r * 1.5;
    const endY = -r * 0.35;
    const e = Math.pow(w, 2.2);
    return { x: z.x + (1 - e) * 260, y: startY + (endY - startY) * e, r };
  }

  /* ================================================================== */
  /* Drawing                                                            */
  /* ================================================================== */

  drawBack(ctx: CanvasRenderingContext2D, sim: Simulation, viewTop: number): void {
    // Time stop overlay.
    if (sim.timeStop) {
      const s = sim.fighters[sim.timeStop.by];
      this.drawClock(ctx, s.x, s.y - 60, ASPECT_PALETTES[s.def.aspect].primary, 0.55);
    }
    // Ground telegraphs.
    for (const z of sim.zones) {
      if (z.dead) continue;
      this.drawZoneBack(ctx, z, viewTop);
    }
    // Decoys.
    for (const d of sim.decoys) {
      const owner = sim.fighters[d.owner];
      const P = ASPECT_PALETTES[owner.def.aspect];
      const fade = Math.max(0, d.t / Math.max(1, d.maxT));
      const facing = d.vx >= 0 ? 1 : -1;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let e = 3; e >= 0; e--) {
        ctx.globalAlpha = fade * (e === 0 ? 0.75 : 0.22 / e);
        ctx.strokeStyle = e === 0 ? lighten(P.primary, 0.3) : P.primary;
        ctx.lineWidth = e === 0 ? 6 : 5;
        stickFigure(ctx, d.x - facing * e * 26, d.y, facing, this.time * 16 + d.x * 0.02, true);
      }
      ctx.globalAlpha = fade * 0.6;
      blit(ctx, glowSprite(P.primary), d.x, d.y - 60, 70);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawMid(ctx: CanvasRenderingContext2D, sim: Simulation, viewTop: number): void {
    for (const z of sim.zones) {
      if (z.dead) continue;
      this.drawZoneMid(ctx, z, viewTop, sim);
    }
    for (const b of sim.beams) {
      if (b.dead) continue;
      this.drawBeam(ctx, b, sim);
    }
    for (const p of sim.projectiles) {
      if (p.dead) continue;
      this.drawProjectile(ctx, p, sim);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Persistent time-stop clock overlay at an explicit point (finisher time stops). */
  drawClockAt(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    this.drawClock(ctx, x, y, color, 0.55);
  }

  private drawClock(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, alpha: number): void {
    const R = 540;
    const t = this.time;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * 0.35;
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.22;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, R * 0.86, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU;
      const big = i % 5 === 0;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * R * (big ? 0.9 : 0.95), y + Math.sin(a) * R * (big ? 0.9 : 0.95));
      ctx.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R);
      ctx.stroke();
    }
    // Frozen hands with a faint shimmer.
    ctx.globalAlpha = alpha * (0.3 + 0.1 * Math.sin(t * 3));
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(-1.2) * R * 0.75, y + Math.sin(-1.2) * R * 0.75);
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(0.5) * R * 0.5, y + Math.sin(0.5) * R * 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* -------------------------- projectiles -------------------------- */

  private drawTrail(ctx: CanvasRenderingContext2D, tr: Trail | undefined, x: number, y: number, width: number, color: string, alpha: number): void {
    if (!tr || tr.n < 2) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    let px = x, py = y;
    for (let i = 1; i < tr.n; i++) {
      const k = 1 - i / tr.n;
      ctx.globalAlpha = alpha * k;
      ctx.lineWidth = Math.max(0.5, width * k);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(tr.xs[i], tr.ys[i]);
      ctx.stroke();
      px = tr.xs[i];
      py = tr.ys[i];
    }
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, sim: Simulation): void {
    const P = p.frozen ? FROZEN : ASPECT_PALETTES[p.aspect];
    const tr = this.trails.get(p.id);
    const r = p.r;
    const sp = Math.hypot(p.vx, p.vy);
    const ang = sp > 1 ? Math.atan2(p.vy, p.vx) : p.rot;
    const t = this.time;
    ctx.lineJoin = 'round';
    switch (p.style) {
      case 'kiblast':
      case 'orb':
      case 'reflected': {
        this.drawTrail(ctx, tr, p.x, p.y, r * 1.5, P.primary, 0.6);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        blit(ctx, glowSprite(P.primary), p.x, p.y, r * (p.style === 'orb' ? 4 : 3.2));
        blit(ctx, hotSprite(P.secondary), p.x, p.y, r * 1.7);
        if (p.style === 'reflected') {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 1.4, 0, TAU);
          ctx.stroke();
        }
        break;
      }
      case 'bolt':
        this.drawBolt(ctx, p, P, tr, ang, t);
        break;
      case 'spear': {
        this.drawTrail(ctx, tr, p.x, p.y, r * 0.7, P.secondary, 0.7);
        this.drawDiamond(ctx, p.x, p.y, ang, r * 5.5, r * 0.55, P);
        break;
      }
      case 'crescent':
        this.drawCrescent(ctx, p, P, ang);
        break;
      case 'seeker': {
        if (tr && tr.n > 2) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = P.primary;
          ctx.lineCap = 'round';
          let px = p.x, py = p.y;
          for (let i = 1; i < tr.n; i++) {
            const k = 1 - i / tr.n;
            const nx = -(tr.ys[i] - py), ny = tr.xs[i] - px;
            const nl = Math.hypot(nx, ny) || 1;
            const off = Math.sin(i * 1.3 - t * 14 + p.id) * 7 * k;
            const qx = tr.xs[i] + (nx / nl) * off, qy = tr.ys[i] + (ny / nl) * off;
            ctx.globalAlpha = 0.75 * k;
            ctx.lineWidth = r * 1.1 * k + 0.5;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(qx, qy);
            ctx.stroke();
            px = qx;
            py = qy;
          }
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        blit(ctx, glowSprite(P.primary), p.x, p.y, r * 3.4);
        blit(ctx, hotSprite(P.secondary), p.x, p.y, r * 1.5);
        // eye-like flicker
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 20 + p.id);
        blit(ctx, hotSprite('#ffffff'), p.x, p.y, r * 0.8);
        break;
      }
      case 'meteor': {
        this.drawTrail(ctx, tr, p.x, p.y, r * 2.2, '#ff7a2a', 0.8);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        blit(ctx, hotSprite(P.primary), p.x, p.y, r * 2.8);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#2a1712';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.7, 0, TAU);
        ctx.fill();
        break;
      }
      case 'spike': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#231b16';
        ctx.beginPath();
        ctx.moveTo(r * 2.4, 0);
        ctx.lineTo(r * 0.4, -r * 0.7);
        ctx.lineTo(-r * 1.2, -r * 0.3);
        ctx.lineTo(-r * 1.0, r * 0.4);
        ctx.lineTo(r * 0.5, r * 0.75);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = P.primary;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'blade': {
        let a = ang;
        if (p.orbitR > 0) {
          const owner = sim.fighters[p.owner];
          a = Math.atan2(p.y - (owner.y - 70), p.x - owner.x);
        }
        if (p.orbitR <= 0) this.drawTrail(ctx, tr, p.x, p.y, 10, P.primary, 0.45);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(a);
        ctx.translate(-26, 0);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = P.primary;
        swordPath(ctx, 66, 6.5);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.globalAlpha = 0.7;
        blit(ctx, glowSprite(P.primary), 34, 0, 34);
        ctx.restore();
        break;
      }
      case 'gravity': {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.9;
        blit(ctx, glowSprite(P.primary), p.x, p.y, r * 4.2);
        blit(ctx, ringSprite(P.secondary), p.x, p.y, r * 2.3);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(1, 0.38);
        for (let i = 0; i < 3; i++) {
          const a0 = t * (7 + i * 2) + i * 2;
          ctx.globalAlpha = 0.9 - i * 0.2;
          ctx.strokeStyle = i === 0 ? '#ffffff' : P.secondary;
          ctx.lineWidth = i === 0 ? 4 : 7;
          ctx.beginPath();
          ctx.arc(0, 0, r * (1.5 + i * 0.35), a0, a0 + 3.8);
          ctx.stroke();
        }
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.85, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = lighten(P.primary, 0.5);
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }
      case 'shockwave': {
        const dir = Math.sign(p.vx) || 1;
        const H = r * 2.6, Wd = r * 1.8;
        ctx.globalCompositeOperation = 'lighter';
        for (let e = 2; e >= 0; e--) {
          const ox = p.x - dir * e * 26;
          ctx.globalAlpha = e === 0 ? 0.85 : 0.3 / e;
          const g = ctx.createLinearGradient(ox - dir * Wd, 0, ox + dir * Wd * 0.3, 0);
          g.addColorStop(0, rgbaQ(P.primary, 0));
          g.addColorStop(0.7, rgbaQ(P.primary, 0.8));
          g.addColorStop(1, rgbaQ('#ffffff', 1));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(ox - dir * Wd, 0);
          ctx.quadraticCurveTo(ox - dir * Wd * 0.2, -H * 1.05, ox + dir * Wd * 0.3, -H * 0.15);
          ctx.lineTo(ox + dir * Wd * 0.35, 0);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      default: {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        blit(ctx, glowSprite(P.primary), p.x, p.y, r * 3);
        blit(ctx, hotSprite(P.secondary), p.x, p.y, r * 1.4);
      }
    }
    if (p.frozen) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#e8f7ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.6, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, L: number, W: number, P: AspectPalette): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6;
    blit(ctx, glowSprite(P.primary), 0, 0, L * 0.7);
    ctx.globalAlpha = 1;
    ctx.fillStyle = P.secondary;
    ctx.beginPath();
    ctx.moveTo(L * 0.5, 0);
    ctx.lineTo(0, -W);
    ctx.lineTo(-L * 0.5, 0);
    ctx.lineTo(0, W);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(L * 0.45, 0);
    ctx.lineTo(0, -W * 0.4);
    ctx.lineTo(-L * 0.3, 0);
    ctx.lineTo(0, W * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawBolt(ctx: CanvasRenderingContext2D, p: Projectile, P: AspectPalette, tr: Trail | undefined, ang: number, t: number): void {
    const r = p.r;
    const aspect = p.frozen ? 'frost' : p.aspect;
    switch (aspect) {
      case 'inferno': {
        this.drawTrail(ctx, tr, p.x, p.y, r * 2, P.primary, 0.55);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        ctx.globalCompositeOperation = 'lighter';
        // flame tongue
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = P.primary;
        ctx.beginPath();
        const fl = r * (3.2 + Math.sin(t * 40 + p.id) * 0.5);
        ctx.moveTo(r * 1.1, 0);
        ctx.quadraticCurveTo(0, -r * 1.3, -fl, (Math.random() - 0.5) * r * 0.6);
        ctx.quadraticCurveTo(0, r * 1.3, r * 1.1, 0);
        ctx.fill();
        ctx.restore();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        blit(ctx, glowSprite(P.primary), p.x, p.y, r * 3.2);
        blit(ctx, hotSprite('#ffb347'), p.x, p.y, r * 1.8);
        break;
      }
      case 'frost': {
        this.drawTrail(ctx, tr, p.x, p.y, r * 0.9, '#cdefff', 0.4);
        this.drawDiamond(ctx, p.x, p.y, ang, r * 4.4, r * 1.0, P);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(r * 2.2, 0);
        ctx.lineTo(0, -r);
        ctx.lineTo(-r * 2.2, 0);
        ctx.lineTo(0, r);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'tempest': {
        // Crackling zig-zag bolt along the velocity.
        const L = r * 6;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const tx = p.x - ca * L, ty = p.y - sa * L;
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let pass = 0; pass < 3; pass++) {
          ctx.globalAlpha = pass === 0 ? 0.4 : 1;
          ctx.strokeStyle = pass === 0 ? P.primary : pass === 1 ? P.secondary : '#ffffff';
          ctx.lineWidth = pass === 0 ? r * 1.6 : pass === 1 ? r * 0.6 : r * 0.25;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          const seg = 5;
          for (let i = 1; i < seg; i++) {
            const u = i / seg;
            const off = (Math.sin(i * 12.9898 + Math.floor(t * 30) * 7.1 + p.id) * 43758.5453 % 1) * r * 1.6;
            ctx.lineTo(tx + ca * L * u - sa * off, ty + sa * L * u + ca * off);
          }
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
        blit(ctx, glowSprite(P.primary), p.x, p.y, r * 3.4);
        blit(ctx, hotSprite(P.secondary), p.x, p.y, r * 1.5);
        break;
      }
      case 'void': {
        this.drawTrail(ctx, tr, p.x, p.y, r * 1.6, P.primary, 0.45);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        blit(ctx, glowSprite(P.primary), p.x, p.y, r * 3.4);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#050008';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.95, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = P.secondary;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const a = t * 9 + (i * TAU) / 3;
          blit(ctx, hotSprite(P.secondary), p.x + Math.cos(a) * r * 1.5, p.y + Math.sin(a) * r * 1.5, 5);
        }
        break;
      }
      case 'radiance': {
        this.drawTrail(ctx, tr, p.x, p.y, r * 0.8, '#ffffff', 0.65);
        this.drawDiamond(ctx, p.x, p.y, ang, r * 6.5, r * 0.6, P);
        break;
      }
      case 'verdant': {
        this.drawTrail(ctx, tr, p.x, p.y, r * 1.0, P.primary, 0.35);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang + Math.sin(t * 12 + p.id) * 0.25);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        blit(ctx, glowSprite(P.primary), 0, 0, r * 3);
        ctx.globalAlpha = 1;
        ctx.fillStyle = P.primary;
        ctx.beginPath();
        ctx.moveTo(r * 2.4, 0);
        ctx.quadraticCurveTo(0, -r * 1.3, -r * 2.0, 0);
        ctx.quadraticCurveTo(0, r * 1.3, r * 2.4, 0);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(r * 2.2, 0);
        ctx.lineTo(-r * 2.4, 0);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'chrono': {
        this.drawTrail(ctx, tr, p.x, p.y, r * 1.2, P.primary, 0.45);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        blit(ctx, glowSprite(P.primary), p.x, p.y, r * 3.2);
        blit(ctx, hotSprite(P.secondary), p.x, p.y, r * 1.4);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(t * 2 + p.id);
        ctx.strokeStyle = P.secondary;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 2.1, r * 0.8, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(t * 16) * r * 0.9, p.y + Math.sin(t * 16) * r * 0.9);
        ctx.stroke();
        break;
      }
      default: {
        ctx.globalCompositeOperation = 'lighter';
        blit(ctx, glowSprite(P.primary), p.x, p.y, r * 3);
        blit(ctx, hotSprite(P.secondary), p.x, p.y, r * 1.4);
      }
    }
  }

  private drawCrescent(ctx: CanvasRenderingContext2D, p: Projectile, P: AspectPalette, ang: number): void {
    const R = p.r * 1.45;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let e = 3; e >= 0; e--) {
      ctx.save();
      ctx.translate(p.x - Math.cos(ang) * e * 30, p.y - Math.sin(ang) * e * 30);
      ctx.rotate(ang);
      const alpha = e === 0 ? 1 : 0.28 / e;
      // Crescent: outer arc bulging forward, inner arc set back.
      ctx.globalAlpha = alpha * 0.65;
      ctx.fillStyle = P.primary;
      ctx.beginPath();
      ctx.arc(-R * 0.5, 0, R, -1.15, 1.15);
      ctx.arc(-R * 0.95, 0, R * 0.92, 1.0, -1.0, true);
      ctx.closePath();
      ctx.fill();
      if (e === 0) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = lighten(P.secondary, 0.3);
        ctx.beginPath();
        ctx.arc(-R * 0.5, 0, R, -1.05, 1.05);
        ctx.arc(-R * 0.62, 0, R * 0.92, 0.98, -0.98, true);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(-R * 0.5, 0, R, -0.95, 0.95);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 0.5;
    blit(ctx, glowSprite(P.primary), p.x, p.y, R * 1.6);
    ctx.restore();
  }

  /* ----------------------------- beams ----------------------------- */

  private drawBeam(ctx: CanvasRenderingContext2D, b: Beam, sim: Simulation): void {
    const P = ASPECT_PALETTES[b.aspect];
    const frozen = sim.timeStop !== null && sim.timeStop.by !== b.owner;
    const grow = Math.min(1, b.age / 4);
    drawBeamShape(ctx, b.ox, b.oy, b.dirX, b.dirY, b.length, b.width * (0.6 + 0.4 * grow) * (b.struggling ? 1.15 : 1), frozen ? FROZEN.primary : P.primary, frozen ? FROZEN.secondary : P.secondary, frozen ? 0 : this.time, b.struggling, 1);
    if (b.struggling) {
      // Violent crackling sphere at the meeting point.
      const tx = b.ox + b.dirX * b.length, ty = b.oy + b.dirY * b.length;
      const R = b.width * (1.6 + Math.random() * 0.6);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.9;
      blit(ctx, glowSprite(P.primary), tx, ty, R * 2.4);
      blit(ctx, hotSprite('#ffffff'), tx, ty, R * 1.1);
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * TAU;
        const l = R * (1.2 + Math.random() * 1.6);
        drawBoltNow(ctx, tx, ty, tx + Math.cos(a) * l, ty + Math.sin(a) * l, i % 2 ? '#ffffff' : P.secondary, 2, 0.8, this.tmp);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* ----------------------------- zones ----------------------------- */

  private groundMarker(ctx: CanvasRenderingContext2D, x: number, r: number, color: string, w: number, pulse: number): void {
    const ry = Math.max(6, r * 0.2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.1 + 0.25 * w;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, -2, r, ry, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = (0.45 + 0.55 * w) * (0.75 + 0.25 * pulse);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 + 3 * w;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1 + w;
    ctx.globalAlpha *= 0.7;
    ctx.stroke();
    // Countdown ring closing in.
    const cr = r * (1 + 0.9 * (1 - w));
    ctx.globalAlpha = 0.25 + 0.6 * w;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, -2, cr, Math.max(6, cr * 0.2), 0, 0, TAU);
    ctx.stroke();
  }

  private column(ctx: CanvasRenderingContext2D, x: number, halfW: number, top: number, color: string, alpha: number): void {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(x - halfW, 0, x + halfW, 0);
    g.addColorStop(0, rgbaQ(color, 0));
    g.addColorStop(0.5, rgbaQ(color, 0.8));
    g.addColorStop(1, rgbaQ(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - halfW, top, halfW * 2, -top);
  }

  private drawZoneBack(ctx: CanvasRenderingContext2D, z: Zone, viewTop: number): void {
    const warn = z.age < z.warn;
    const w = z.warn > 0 ? Math.min(1, z.age / z.warn) : 1;
    const P = pal(z.aspect);
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (10 + 18 * w));
    if (z.kind.startsWith('hazard_')) {
      if (warn) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.18 + 0.3 * w * pulse;
        ctx.strokeStyle = HAZARD.primary;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(z.x, -2, z.r, Math.max(6, z.r * 0.2), 0, 0, TAU);
        ctx.stroke();
      }
      return;
    }
    switch (z.kind) {
      case 'meteor':
      case 'lightning':
      case 'lance':
      case 'spike':
        if (warn) this.groundMarker(ctx, z.x, z.r, P.primary, w, pulse);
        if (warn && (z.kind === 'lightning' || z.kind === 'lance')) this.column(ctx, z.x, z.r * 0.6, viewTop - 100, P.primary, 0.05 + 0.12 * w);
        if (warn && z.kind === 'spike') {
          // Glowing ground cracks.
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.4 + 0.6 * w;
          ctx.strokeStyle = P.secondary;
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const dir = i % 2 ? 1 : -1;
            ctx.moveTo(z.x, -1);
            ctx.lineTo(z.x + dir * z.r * (0.4 + 0.2 * i), -1 + ((i * 7) % 5) - 2);
            ctx.lineTo(z.x + dir * z.r * (0.7 + 0.25 * i), -1);
          }
          ctx.stroke();
        }
        break;
      case 'chains': {
        if (!warn) break;
        this.groundMarker(ctx, z.x, z.r, P.primary, w, pulse);
        // Rotating rune marks.
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5 + 0.5 * w;
        ctx.strokeStyle = P.secondary;
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
          const a = this.time * 2 + (i / 8) * TAU;
          const cx = z.x + Math.cos(a) * z.r * 0.8, cy = -2 + Math.sin(a) * z.r * 0.16;
          ctx.beginPath();
          ctx.moveTo(cx - 5, cy - 4);
          ctx.lineTo(cx, cy + 3);
          ctx.lineTo(cx + 5, cy - 4);
          ctx.stroke();
        }
        break;
      }
      case 'cataclysm': {
        // Growing shadow + danger ring.
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.15 + 0.5 * w * w;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(z.x, -2, z.r * (0.3 + 0.8 * w), z.r * 0.14 * (0.3 + 0.8 * w), 0, 0, TAU);
        ctx.fill();
        if (warn) this.groundMarker(ctx, z.x, z.r, P.primary, w, pulse);
        break;
      }
      case 'blackhole':
        if (warn) this.groundMarker(ctx, z.x, z.r * 0.8, P.primary, w * 0.6, pulse);
        break;
      default:
        break;
    }
  }

  private drawZoneMid(ctx: CanvasRenderingContext2D, z: Zone, viewTop: number, sim: Simulation): void {
    const warn = z.age < z.warn;
    const w = z.warn > 0 ? Math.min(1, z.age / z.warn) : 1;
    const P = pal(z.aspect);
    const activeK = warn ? 0 : Math.min(1, (z.age - z.warn) / Math.max(1, z.active));
    const t = this.time;
    if (z.kind.startsWith('hazard_')) return;
    switch (z.kind) {
      case 'lightning': {
        if (warn) {
          if (w > 0.75 && Math.random() < 0.5) drawBoltNow(ctx, z.x + (Math.random() - 0.5) * 40, viewTop - 50, z.x, 0, P.primary, 1, 0.25, this.tmp);
        } else {
          this.column(ctx, z.x, z.r * 0.9, viewTop - 100, P.primary, 0.35 * (1 - activeK));
          drawBoltNow(ctx, z.x + (Math.random() - 0.5) * 50, viewTop - 80, z.x, 0, P.primary, 6, 1 - activeK * 0.5, this.tmp);
        }
        break;
      }
      case 'meteor': {
        const fallTicks = 20;
        if (warn && z.warn - z.age <= fallTicks) {
          const u = 1 - (z.warn - z.age) / fallTicks;
          const e = u * u;
          const sx = z.x + 420, sy = Math.min(viewTop, -900) - 200;
          const mx = sx + (z.x - sx) * e, my = sy + (0 - sy) * e;
          const ang = Math.atan2(0 - sy, z.x - sx);
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 1; i <= 5; i++) {
            ctx.globalAlpha = 0.6 - i * 0.08;
            blit(ctx, glowSprite(i < 3 ? '#ffb347' : P.primary), mx - Math.cos(ang) * i * 40, my - Math.sin(ang) * i * 40, 70 - i * 9);
          }
          ctx.globalAlpha = 1;
          blit(ctx, hotSprite(P.primary), mx, my, 64);
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#26160f';
          ctx.beginPath();
          ctx.arc(mx, my, 18, 0, TAU);
          ctx.fill();
        } else if (!warn) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 1 - activeK;
          ctx.save();
          ctx.translate(z.x, -10);
          ctx.scale(1, 0.45);
          blit(ctx, hotSprite(P.primary), 0, 0, z.r * 2.4);
          ctx.restore();
        }
        break;
      }
      case 'rend': {
        if (warn) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.35 + 0.5 * w;
          ctx.strokeStyle = P.primary;
          ctx.lineWidth = 2;
          ctx.setLineDash([12, 10]);
          ctx.lineDashOffset = -t * 60;
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.r, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.15 + 0.3 * w;
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = -3; i <= 3; i++) {
            const o = (i / 3.5) * z.r;
            const hlen = Math.sqrt(Math.max(0, z.r * z.r - o * o));
            ctx.moveTo(z.x - hlen, z.y + o);
            ctx.lineTo(z.x + hlen, z.y + o);
            ctx.moveTo(z.x + o, z.y - hlen);
            ctx.lineTo(z.x + o, z.y + hlen);
          }
          ctx.stroke();
          // Corner brackets.
          ctx.globalAlpha = 0.6 + 0.4 * w;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          const s = z.r * 1.1;
          ctx.beginPath();
          for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            ctx.moveTo(z.x + cx * s, z.y + cy * s * 0.6);
            ctx.lineTo(z.x + cx * s, z.y + cy * s);
            ctx.lineTo(z.x + cx * s * 0.6, z.y + cy * s);
          }
          ctx.stroke();
        } else {
          // Flashing cuts through space.
          ctx.globalCompositeOperation = 'lighter';
          const n = 4 + ((Math.random() * 4) | 0);
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI;
            const off = (Math.random() - 0.5) * z.r * 1.4;
            const ca = Math.cos(a), sa = Math.sin(a);
            const hl = Math.sqrt(Math.max(0, z.r * z.r - off * off)) * 1.15;
            const cx = z.x - sa * off, cy = z.y + ca * off;
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = P.primary;
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.moveTo(cx - ca * hl, cy - sa * hl);
            ctx.lineTo(cx + ca * hl, cy + sa * hl);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          ctx.globalAlpha = 0.25 * (1 - activeK);
          blit(ctx, glowSprite(P.primary), z.x, z.y, z.r * 1.3);
        }
        break;
      }
      case 'chains': {
        if (warn) break;
        const rise = Math.min(1, (z.age - z.warn) / 4);
        const H = Math.min(z.maxHeight, 230) * rise;
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (let c = 0; c < 4; c++) {
          const phase = c * 1.6 + t * 6;
          for (let pass = 0; pass < 2; pass++) {
            ctx.globalAlpha = pass === 0 ? 0.45 : 1;
            ctx.strokeStyle = pass === 0 ? P.primary : lighten(P.secondary, 0.4);
            ctx.lineWidth = pass === 0 ? 7 : 2.5;
            ctx.beginPath();
            const links = 9;
            for (let l = 0; l < links; l++) {
              const u = l / links;
              const yy = -u * H;
              const xx = z.x + Math.sin(u * 7 + phase) * z.r * 0.55 * (1 - u * 0.4);
              ctx.moveTo(xx + 6, yy);
              ctx.ellipse(xx, yy, 6, 10, Math.sin(u * 7 + phase) * 0.8 + (l % 2) * 1.2, 0, TAU);
            }
            ctx.stroke();
          }
        }
        break;
      }
      case 'spike': {
        if (warn) break;
        const age = z.age - z.warn;
        const grow = Math.min(1, age / 2.5);
        const shrink = Math.max(0, (age - z.active * 0.6) / (z.active * 0.4 + 1));
        const H = 150 * grow * (1 - shrink * 0.8);
        const W = z.r * 0.75;
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = darken(P.primary, 0.75);
        ctx.beginPath();
        ctx.moveTo(z.x - W, 0);
        ctx.lineTo(z.x - W * 0.35, -H * 0.55);
        ctx.lineTo(z.x - W * 0.5, -H * 0.62);
        ctx.lineTo(z.x + W * 0.05, -H);
        ctx.lineTo(z.x + W * 0.35, -H * 0.48);
        ctx.lineTo(z.x + W * 0.55, -H * 0.52);
        ctx.lineTo(z.x + W, 0);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = P.primary;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(z.x + W * 0.05, -H);
        ctx.lineTo(z.x, -H * 0.2);
        ctx.stroke();
        break;
      }
      case 'lance': {
        if (warn) {
          // Faint targeting beam from the sky.
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = (0.2 + 0.4 * w) * (0.7 + 0.3 * Math.random());
          ctx.strokeStyle = P.secondary;
          ctx.lineWidth = 2 + 4 * w;
          ctx.beginPath();
          ctx.moveTo(z.x, viewTop - 100);
          ctx.lineTo(z.x, 0);
          ctx.stroke();
        } else {
          const out = activeK;
          const W = z.r * 1.15 * (1 - out * 0.6);
          const top = viewTop - 200;
          for (const [ww, col, al] of [[W * 1.5, P.primary, 0.4], [W * 0.85, lighten(P.secondary, 0.3), 0.8], [W * 0.32, '#ffffff', 1]] as [number, string, number][]) {
            this.column(ctx, z.x, ww, top, col, al * (1 - out * 0.7));
          }
          ctx.globalAlpha = 1 - out;
          ctx.save();
          ctx.translate(z.x, -6);
          ctx.scale(1, 0.25);
          blit(ctx, hotSprite(P.primary), 0, 0, W * 3);
          ctx.restore();
        }
        break;
      }
      case 'blackhole': {
        const R = warn ? 30 + 85 * w : 115 * (1 - activeK);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.8;
        blit(ctx, ringSprite(P.primary), z.x, z.y, R * 2.2);
        ctx.globalAlpha = 0.45;
        blit(ctx, glowSprite(P.primary), z.x, z.y, R * 3.4);
        ctx.save();
        ctx.translate(z.x, z.y);
        ctx.scale(1, 0.3);
        for (let i = 0; i < 4; i++) {
          const a0 = t * (5 + i * 1.3) + i * 1.7;
          ctx.globalAlpha = 0.9 - i * 0.15;
          ctx.strokeStyle = i === 0 ? '#ffffff' : i % 2 ? P.primary : lighten(P.primary, 0.5);
          ctx.lineWidth = i === 0 ? 10 : 18;
          ctx.beginPath();
          ctx.arc(0, 0, R * (1.4 + i * 0.25), a0, a0 + 4);
          ctx.stroke();
        }
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(z.x, z.y, R, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = lighten(P.primary, 0.6);
        ctx.lineWidth = 2.5;
        ctx.stroke();
        break;
      }
      case 'cataclysm': {
        if (warn) {
          const m = this.moonPos(z, viewTop);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.9;
          blit(ctx, glowSprite('#ff6a1a'), m.x, m.y, m.r * 2.6);
          blit(ctx, glowSprite(P.primary), m.x, m.y, m.r * 1.9);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          const g = ctx.createRadialGradient(m.x - m.r * 0.3, m.y - m.r * 0.3, m.r * 0.1, m.x, m.y, m.r);
          g.addColorStop(0, '#5a3020');
          g.addColorStop(0.7, '#2a140c');
          g.addColorStop(1, '#120805');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.r, 0, TAU);
          ctx.fill();
          // Craters.
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          for (let i = 0; i < 6; i++) {
            const a = i * 2.1 + z.id;
            ctx.beginPath();
            ctx.arc(m.x + Math.cos(a) * m.r * 0.5, m.y + Math.sin(a) * m.r * 0.45, m.r * (0.08 + (i % 3) * 0.05), 0, TAU);
            ctx.fill();
          }
          // Burning leading edge.
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = '#ffb347';
          ctx.lineWidth = 10;
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.r, 0.2, Math.PI - 0.2);
          ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.stroke();
        } else {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 1 - activeK;
          blit(ctx, hotSprite('#ff8a3a'), z.x, -60, z.r * 2.2 * (1 + activeK));
        }
        break;
      }
      case 'colossus': {
        if (warn) break;
        const dir = Math.sign(z.vx) || 1;
        const zs = this.zones.get(z.id);
        const fade = 1 - Math.max(0, activeK - 0.8) / 0.2;
        ctx.globalCompositeOperation = 'lighter';
        const n = zs ? zs.colN : 1;
        for (let e = n - 1; e >= 0; e--) {
          const x = zs ? zs.colX[e] : z.x;
          const alpha = (e === 0 ? 1 : 0.35 * (1 - e / n)) * fade;
          this.giantBlade(ctx, x, z.y, z.r, dir, P, alpha, e === 0);
        }
        break;
      }
      default:
        break;
    }
    void sim;
  }

  private giantBlade(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, dir: number, P: AspectPalette, alpha: number, edge: boolean): void {
    const H = r * 2.6;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = P.primary;
    ctx.beginPath();
    ctx.moveTo(r * 0.5, -H * 0.55);
    ctx.quadraticCurveTo(r * 1.2, 0, r * 0.5, H * 0.5);
    ctx.lineTo(-r * 0.6, H * 0.35);
    ctx.quadraticCurveTo(0, 0, -r * 0.6, -H * 0.45);
    ctx.closePath();
    ctx.fill();
    if (edge) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(r * 0.5, -H * 0.55);
      ctx.quadraticCurveTo(r * 1.2, 0, r * 0.5, H * 0.5);
      ctx.stroke();
      ctx.strokeStyle = lighten(P.secondary, 0.4);
      ctx.lineWidth = 16;
      ctx.globalAlpha = alpha * 0.5;
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.6;
      blit(ctx, glowSprite(P.primary), r * 0.6, 0, H * 0.8);
    }
    ctx.restore();
  }
}
