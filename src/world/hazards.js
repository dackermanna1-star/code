// Environmental hazards: electrical panels (zap anything knocked into them,
// arcing across wet floors) and steam vents that burst on a timer.

import { NJ } from '../fighter/skeleton.js';

const near = [];

export class Hazards {
  constructor(sim) {
    this.sim = sim;
    this.list = sim.level.hazards.map((h) => ({
      ...h,
      cooldown: 0,
      sparkT: 0,
      burst: 0,
      timer: h.phase || 0,
      zaps: 0,
      arcT: 0,
      arcTarget: null,
    }));
  }

  update(dt) {
    for (const hz of this.list) {
      if (hz.type === 'electric') this.updateElectric(hz, dt);
      else if (hz.type === 'steam') this.updateSteam(hz, dt);
    }
  }

  inZone(hz, x, y, pad = 0) {
    return x > hz.x - hz.w / 2 - pad && x < hz.x + hz.w / 2 + pad && y > hz.y - hz.h - pad && y < hz.y + 4;
  }

  updateElectric(hz, dt) {
    const sim = this.sim;
    hz.cooldown -= dt;
    hz.arcT -= dt;
    hz.sparkT -= dt;
    if (hz.sparkT <= 0) {
      hz.sparkT = sim.rng.range(1.5, 4.5);
      sim.emit({ t: 'sparks', x: hz.x + sim.rng.range(-hz.w / 3, hz.w / 3), y: hz.y - hz.h * sim.rng.range(0.4, 0.9), power: 0.3, idle: true });
    }
    if (hz.cooldown > 0) return;
    sim.fighterHash.query(hz.x, hz.y - hz.h / 2, hz.w, near);
    const h = sim.h;
    for (const f of near) {
      if (f.removed || f.zapT > 0) continue;
      if (f.isHero && sim.time - (f.lastZap || -10) < 2.5) continue;
      let touch = false;
      if (f.ragdolled || f.state === 'grabbed') {
        if (f.dead && f.rag.sleeping) continue;
        const sp = f.rag.maxSpeed(h);
        if (sp < 140) continue;
        for (let i = 0; i < NJ; i++) {
          const p = f.rag.p[i];
          if (this.inZone(hz, p.x, p.y, p.r)) {
            touch = true;
            break;
          }
        }
      } else if (f.state === 'hitstun' && Math.abs(f.vx) > 170) {
        touch = this.inZone(hz, f.x, f.y - 40, 8);
      }
      if (!touch) continue;
      const by = f.knock ? f.knock.by : f.thrownBy || f.lastHitBy;
      f.knock = f.knock || { by, chainId: sim.newChain(by), depth: 0, time: sim.time, kind: 'electric' };
      f.zapSource = hz;
      f.lastZap = sim.time;
      f.electrocute(f.isHero ? 0.6 : 0.9, (f.isHero ? 22 : 75) * Math.max(0.6, sim.settings.hazardDensity));
      hz.cooldown = 1.1;
      hz.arcT = 0.9;
      hz.arcTarget = f;
      hz.zaps++;
      sim.emit({ t: 'zap', x: hz.x, y: hz.y - hz.h * 0.6, power: 1, f, hz, by });
      if (sim.level.condition === 'wet') this.arcAcrossFloor(hz, f, by);
      break;
    }
  }

  // Wet floors carry the shock to anyone standing nearby.
  arcAcrossFloor(hz, src, by) {
    const sim = this.sim;
    sim.fighterHash.query(hz.x, hz.y - 20, 190, near);
    for (const f of near) {
      if (f === src || f.removed || f.dead || f.zapT > 0) continue;
      if (Math.abs(f.y - hz.y) > 12 || !f.grounded) continue;
      f.zapSource = hz;
      f.knock = { by, chainId: sim.newChain(by), depth: 1, time: sim.time, kind: 'electric' };
      f.electrocute(0.45, f.isHero ? 14 : 28);
      sim.emit({ t: 'zap', x: f.x, y: f.y - 20, power: 0.6, f, hz, by, floor: true });
    }
  }

  updateSteam(hz, dt) {
    const sim = this.sim;
    hz.timer += dt;
    const period = hz.period;
    const phase = hz.timer % period;
    const active = phase < 1.3;
    if (active && hz.burst <= 0) sim.emit({ t: 'steam', x: hz.x, y: hz.y, dir: hz.dir, on: true });
    if (!active && hz.burst > 0) sim.emit({ t: 'steam', x: hz.x, y: hz.y, dir: hz.dir, on: false });
    hz.burst = active ? 1 : 0;
    if (!active) return;
    const x0 = hz.dir > 0 ? hz.x : hz.x - hz.length;
    const x1 = hz.dir > 0 ? hz.x + hz.length : hz.x;
    sim.fighterHash.query((x0 + x1) / 2, hz.y, hz.length * 0.6, near);
    const h = sim.h;
    for (const f of near) {
      if (f.removed) continue;
      if (f.ragdolled || f.state === 'grabbed') {
        for (const p of f.rag.p) {
          if (p.x > x0 && p.x < x1 && Math.abs(p.y - hz.y) < 40) p.addVel(hz.dir * 1400 * dt, -500 * dt, h);
        }
        f.rag.sleeping = false;
        continue;
      }
      if (f.x < x0 || f.x > x1 || Math.abs(f.y - 62 - hz.y) > 60) continue;
      const k = 1 - Math.abs(f.x - hz.x) / hz.length;
      f.vx += hz.dir * 900 * k * dt;
      if (!f.dead && sim.rng.chance(dt * 3)) {
        f.damage(3, null, 'steam');
        if (!f.isHero || sim.rng.chance(0.3)) f.hitstun(0.25, hz.dir * 260 * k, 0, false);
      }
    }
  }
}
