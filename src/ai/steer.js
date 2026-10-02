// Turns "go to (x, surface)" into per-step movement intent, following the
// navigation graph (stairs, drops, jumps) with local obstacle handling.

import { clamp } from '../core/math.js';

export function stairsOf(sim, f) {
  const g = f.groundSolid;
  if (!f.grounded || !g || !g.step) return null;
  return sim.nav.surfaces[g.surface] || null;
}

export function surfaceOfFighter(f) {
  return f.surface >= 0 ? f.surface : f.lastSurface;
}

// opts: { run, arrive, careful (avoid unplanned drops), noJump }
export function steerTo(f, sim, tx, tSurf, opts = {}) {
  const it = f.intent;
  const nav = sim.nav;
  const s = f.scale;
  it.climb = false;
  let goalX = tx;
  let plannedEdge = false;
  const from = surfaceOfFighter(f);
  const onStairs = stairsOf(sim, f);

  if (from >= 0 && tSurf >= 0 && from !== tSurf) {
    let link = f._link;
    if (!link || f._lf !== from || f._lt !== tSurf || sim.time - f._ltime > 0.7) {
      link = nav.nextLink(from, tSurf, f.x);
      f._link = link;
      f._lf = from;
      f._lt = tSurf;
      f._ltime = sim.time;
    }
    if (link) {
      const lx = link.xa !== undefined ? clamp(tx, link.xa, link.xb) : link.x;
      const S = nav.surfaces[link.type === 'stairsEnter' ? link.to : link.from];
      switch (link.type) {
        case 'stairsEnter': {
          const fromBottom = Math.abs(link.x - S.xBottom) < Math.abs(link.x - S.xTop);
          if (fromBottom) {
            const nearBottom = Math.abs(f.x - S.xBottom) < 20 * s || (f.x - S.xBottom) * S.dir > 0 && (f.x - S.xBottom) * S.dir < 60;
            if (nearBottom) {
              goalX = S.xTop;
              it.climb = true;
            } else goalX = lx;
          } else {
            goalX = S.xBottom; // walk into the opening, snap onto the top step
            plannedEdge = true;
          }
          break;
        }
        case 'stairsExit': {
          const toTop = Math.abs(link.x - S.xTop) < Math.abs(link.x - S.xBottom);
          goalX = link.x2;
          if (toTop) it.climb = true;
          plannedEdge = true;
          break;
        }
        case 'drop': {
          goalX = link.x2 + link.dir * 16;
          plannedEdge = true;
          if (link.vault && Math.abs(f.x - link.x) < 34 * s && f.state === 'ground' && !opts.noJump) {
            it.jump = true;
            it.jumpVy = 560;
          }
          break;
        }
        case 'dropThrough': {
          goalX = lx;
          if (Math.abs(f.x - lx) < 18 * s && f.grounded) it.drop = true;
          plannedEdge = true;
          break;
        }
        case 'jump': {
          goalX = link.x2 + link.dir * 30;
          plannedEdge = true;
          const dist = (link.x - f.x) * link.dir;
          const lead = 18 + Math.abs(f.vx) * 0.09;
          if (dist < lead && dist > -24 && f.state === 'ground' && f.grounded && !opts.noJump && Math.sign(f.vx || link.dir) === link.dir) {
            it.jump = true;
            it.jumpVy = link.dy < -40 ? f.jumpSpeed : Math.max(520, f.jumpSpeed * 0.85);
          }
          break;
        }
      }
    }
  }

  const dx = goalX - f.x;
  const arrive = opts.arrive !== undefined ? opts.arrive : 8;
  it.mx = Math.abs(dx) < arrive ? 0 : Math.sign(dx);
  it.run = opts.run !== undefined ? opts.run && Math.abs(dx) > 50 : Math.abs(dx) > 120;
  if (onStairs && it.mx === onStairs.dir) it.climb = true;

  // jump low obstacles in the way
  if (it.mx !== 0 && f.blockedX === it.mx && f.state === 'ground' && f.grounded && f.blockedSolid && !opts.noJump) {
    const bs = f.blockedSolid;
    if (bs.y > f.y - 105 * s && bs.kind !== 'wall') {
      it.jump = true;
      it.jumpVy = f.jumpSpeed;
    }
  }
  // unexpected hole ahead (broken skylight, gap): jump it or stop
  if (it.mx !== 0 && !plannedEdge && f.grounded && f.state === 'ground' && !onStairs && (opts.careful || f.intelligence > 0.3)) {
    const ax = f.x + it.mx * (26 + Math.abs(f.vx) * 0.08) * s;
    const g = sim.level.groundUnder(ax - 3, ax + 3, f.y - 4, 50, true, true);
    if (!g) {
      const far = sim.level.groundUnder(ax + it.mx * 140 - 10, ax + it.mx * 140 + 10, f.y - 60, 120, true, true);
      if (far && Math.abs(dx) > 120 && !opts.noJump && Math.abs(f.vx) > 160) {
        it.jump = true;
        it.jumpVy = f.jumpSpeed;
      } else if (Math.abs(dx) > 30) it.mx = 0;
    }
  }
}

// True if a and b can reach each other by walking without leaving the surface.
export function sameArena(a, b) {
  const sa = surfaceOfFighter(a);
  const sb = surfaceOfFighter(b);
  return sa === sb && sa >= 0;
}
