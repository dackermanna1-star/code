import { clamp, wrapAngle } from '../core/math';
import type { Simulation } from './simulation';
import { DT } from './types';

/** Projectile, beam, zone and decoy updates (movement, lifetime, environment). */

export function updateProjectiles(sim: Simulation): void {
  const half = sim.arena.halfWidth;
  for (const p of sim.projectiles) {
    if (p.dead || p.frozen) continue;
    p.age++;
    p.life--;
    if (p.armedIn > 0) p.armedIn--;
    const owner = sim.fighters[p.owner];
    const target = sim.fighters[p.owner === 0 ? 1 : 0];

    // Orbiting blades.
    if (p.orbitR > 0) {
      if (p.releaseTick > sim.tick && owner.state !== 'dead') {
        p.orbitAng += p.orbitSpeed * DT;
        p.x = owner.x + Math.cos(p.orbitAng) * p.orbitR;
        p.y = owner.y - 70 + Math.sin(p.orbitAng) * p.orbitR * 0.75;
        p.rot = p.orbitAng + Math.PI / 2;
        continue;
      }
      // Release toward the target.
      p.orbitR = 0;
      const ang = Math.atan2(target.centerY() - p.y, target.x - p.x);
      p.vx = Math.cos(ang) * 1450;
      p.vy = Math.sin(ang) * 1450;
      p.rot = ang;
      p.life = 70;
      sim.emit({ type: 'projectile', side: p.owner, id: p.id, style: p.style, x: p.x, y: p.y, source: p.source, aspect: p.aspect });
    }

    if (p.homing > 0 && target.state !== 'dead' && target.state !== 'vanish') {
      const want = Math.atan2(target.centerY() - p.y, target.x - p.x);
      const cur = Math.atan2(p.vy, p.vx);
      const turn = clamp(wrapAngle(want - cur), -p.homing * DT, p.homing * DT);
      const sp = Math.min(760, Math.hypot(p.vx, p.vy) + 520 * DT);
      p.vx = Math.cos(cur + turn) * sp;
      p.vy = Math.sin(cur + turn) * sp;
    }
    if (p.gravity) p.vy += p.gravity * DT;

    // Gravity orb pulls the enemy toward it.
    if (p.pull > 0 && !target.intangible && !target.scripted && !target.timeFrozen) {
      const dx = p.x - target.x, dy = p.y - target.centerY();
      const d = Math.hypot(dx, dy);
      if (d < 390 && d > 10) {
        const f = p.pull * (1 - d / 390) * DT;
        target.vx += (dx / d) * f;
        if (!target.grounded) target.vy += (dy / d) * f * 0.6;
      }
    }

    p.x += p.vx * DT;
    p.y += p.vy * DT;
    if (p.style !== 'blade') p.rot += DT * 8;
    else p.rot = Math.atan2(p.vy, p.vx);

    if (p.grounded) {
      p.y = Math.min(p.y, -p.r * 0.85);
    } else if (p.y > -2) {
      p.dead = true;
      sim.emit({ type: 'projectileHit', owner: p.owner, x: p.x, y: 0, style: p.style, aspect: p.aspect, blocked: false, target: 'ground' });
      if (p.explode > 0) sim.explode(owner, p.x, -10, p.explode, p.hit, p.source);
      continue;
    }
    if (Math.abs(p.x) > half + 60 || p.y < sim.arena.ceiling - 200) {
      p.dead = true;
      continue;
    }
    if (p.life <= 0) {
      p.dead = true;
      if (p.explode > 0) sim.explode(owner, p.x, p.y, p.explode, p.hit, p.source);
      continue;
    }
    // Props absorb projectiles (and take damage).
    for (const pr of sim.props) {
      if (pr.broken) continue;
      if (Math.abs(p.x - pr.def.x) < pr.def.width / 2 + p.r && p.y > -pr.def.height) {
        // Only collide when the projectile is between the fighters' plane and the prop: props are
        // slightly behind the fight plane, so only big projectiles clip them.
        if (p.r < 30 && p.style !== 'meteor') continue;
        sim.damageProp(pr, p.hit.damage * 0.6, p.x, p.y, Math.sign(p.vx) || 1);
        if (p.power < 2.2) {
          p.dead = true;
          sim.emit({ type: 'projectileHit', owner: p.owner, x: p.x, y: p.y, style: p.style, aspect: p.aspect, blocked: false, target: 'prop' });
        } else {
          p.power -= 0.8;
        }
        break;
      }
    }
  }
  sim.projectiles = sim.projectiles.filter((p) => !p.dead);
}

export function updateBeams(sim: Simulation): void {
  const half = sim.arena.halfWidth;
  for (const b of sim.beams) {
    if (b.dead) continue;
    const owner = sim.fighters[b.owner];
    const stillFiring = owner.state === 'action' && (owner.action?.def.abilityId === 'annihilationBeam' || owner.action?.def.id === 'beamAnswer') && !owner.timeFrozen;
    if (owner.timeFrozen) continue;
    if (!stillFiring && !b.struggling) {
      b.dead = true;
      sim.emit({ type: 'beamEnd', side: b.owner, id: b.id });
      continue;
    }
    b.age++;
    const h = owner.handPos();
    b.ox = h.x;
    b.oy = h.y;
    if (!b.struggling) {
      b.length = Math.min(b.maxLength, b.length + 4600 * DT);
      // Clip at walls and ground.
      if (b.dirX !== 0) {
        const wallX = b.dirX > 0 ? half : -half;
        const tWall = (wallX - b.ox) / b.dirX;
        if (tWall > 0) b.length = Math.min(b.length, tWall);
      }
      if (b.dirY > 0.05) {
        const tGround = (0 - b.oy) / b.dirY;
        if (tGround > 0) b.length = Math.min(b.length, tGround);
      }
      // Props in the path take damage.
      for (const pr of sim.props) {
        if (pr.broken) continue;
        const t = (pr.def.x - b.ox) / (b.dirX || 1e-6);
        if (t > 0 && t < b.length) {
          const y = b.oy + b.dirY * t;
          if (y > -pr.def.height && y < 0) sim.damageProp(pr, b.dps * 0.5, pr.def.x, y, Math.sign(b.dirX) || 1);
        }
      }
    }
  }
  sim.beams = sim.beams.filter((b) => !b.dead);
}

export function updateZones(sim: Simulation): void {
  for (const z of sim.zones) {
    if (z.dead) continue;
    if (z.owner !== null && sim.timeStop && sim.timeStop.by !== z.owner) continue; // frozen in time
    z.age++;
    const target = z.owner === null ? null : sim.fighters[z.owner === 0 ? 1 : 0];
    if (target && z.age < z.trackUntil && target.state !== 'vanish') {
      const dx = target.x - z.x;
      z.x += clamp(dx, -z.trackSpeed * DT, z.trackSpeed * DT);
    }
    if (z.pull > 0 && z.age < z.warn + z.active) {
      for (const f of sim.fighters) {
        if (z.owner !== null && f.side === z.owner) continue;
        if (f.intangible || f.scripted || f.timeFrozen) continue;
        const dx = z.x - f.x, dy = z.y - f.centerY();
        const d = Math.hypot(dx, dy);
        if (d < 620 && d > 12) {
          const s = z.pull * (1 - d / 620) * DT;
          f.vx += (dx / d) * s;
          if (!f.grounded) f.vy += (dy / d) * s * 0.7;
          else if (d < 300) {
            f.grounded = false;
            f.y = Math.min(f.y, -2);
            f.vy = Math.min(f.vy, -120);
          }
        }
      }
      for (const p of sim.projectiles) {
        const dx = z.x - p.x, dy = z.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 400 && d > 5) {
          p.vx += (dx / d) * 2400 * DT;
          p.vy += (dy / d) * 2400 * DT;
          if (d < 40) p.dead = true;
        }
      }
    }
    if (z.vx !== 0 && z.age >= z.warn) z.x += z.vx * DT;
    if (z.age === z.warn) {
      sim.emit({ type: 'zoneStrike', id: z.id, kind: z.kind, x: z.x, y: z.y, r: z.r, owner: z.owner, aspect: z.aspect });
      // Environmental destruction from big strikes.
      const big = z.kind === 'cataclysm' || z.kind === 'meteor' || z.kind === 'lance' || z.kind === 'blackhole' || z.kind === 'hazard_starfall';
      if (big) {
        if (z.kind !== 'blackhole') sim.emit({ type: 'crater', x: z.x, r: Math.min(260, z.r * (z.kind === 'meteor' ? 0.9 : 0.75)) });
        for (const pr of sim.props) {
          if (pr.broken) continue;
          if (Math.abs(pr.def.x - z.x) < z.r + pr.def.width / 2) sim.damageProp(pr, z.hit.damage * (z.kind === 'meteor' ? 0.8 : 2), pr.def.x, -pr.def.height * 0.4, Math.sign(pr.def.x - z.x) || 1);
        }
      }
    }
    if (z.kind === 'colossus' && z.age >= z.warn) {
      for (const pr of sim.props) {
        if (!pr.broken && Math.abs(pr.def.x - z.x) < z.r) sim.damageProp(pr, 40, pr.def.x, -80, Math.sign(z.vx) || 1);
      }
      if (Math.abs(z.x) > sim.arena.halfWidth + 300) z.dead = true;
    }
    if (z.age >= z.warn + z.active) z.dead = true;
  }
  sim.zones = sim.zones.filter((z) => !z.dead);
}

export function updateDecoys(sim: Simulation): void {
  for (const d of sim.decoys) {
    d.t--;
    d.x += d.vx * DT;
    const target = sim.fighters[d.owner === 0 ? 1 : 0];
    if (Math.abs(target.x - d.x) < 70) d.vx *= 0.7;
  }
  sim.decoys = sim.decoys.filter((d) => d.t > 0);
}
