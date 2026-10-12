// Modern AI layer on top of the original chase logic.
//
// The vanilla P_NewChaseDir walks greedily toward the target. Here the goal
// point can come from a sector-graph path search when the target is out of
// sight, from a flanking offset when it is in sight, and hitscan troopers
// side-step after firing or when the player draws a bead on them. Monsters
// keep their original states, attacks and timing, so they still play like
// DOOM, just less likely to get stuck on corners or lose track of you.

import { MF, aproxDistance, pointToAngle, angleDiff } from './defs.js';
import { MT } from './tables.js';
import { ML } from './mapdata.js';

const MONSTER_DOORS = new Set([1, 32, 33, 34]);
const EVADERS = new Set([MT.POSSESSED, MT.SHOTGUY, MT.CHAINGUY, MT.TROOP, MT.WOLFSS]);
const HITSCANNERS = new Set([MT.POSSESSED, MT.SHOTGUY, MT.CHAINGUY, MT.WOLFSS]);

function ext(actor) {
  if (!actor.ext) actor.ext = {};
  return actor.ext;
}

function rand(w) {
  // Small deterministic LCG separate from P_Random.
  w.aiSeed = (Math.imul(w.aiSeed || 1234567, 1103515245) + 12345) >>> 0;
  return (w.aiSeed >>> 8) / 16777216;
}

// --- Sector graph -------------------------------------------------------

function buildGraph(w) {
  const level = w.level;
  const adj = level.sectors.map(() => []);
  for (const line of level.lines) {
    if (!line.backsector || line.frontsector === line.backsector) continue;
    const mid = { x: (line.v1.x + line.v2.x) / 2, y: (line.v1.y + line.v2.y) / 2 };
    adj[line.frontsector.index].push({ line, to: line.backsector, mid });
    adj[line.backsector.index].push({ line, to: line.frontsector, mid });
  }
  w.navGraph = adj;
}

function passable(actor, from, edge) {
  const line = edge.line;
  const to = edge.to;
  if (line.flags & (ML.BLOCKING | ML.BLOCKMONSTERS)) return false;
  const floats = actor.flags & MF.FLOAT;
  const top = Math.min(from.ceilingheight, to.ceilingheight);
  const bottom = Math.max(from.floorheight, to.floorheight);
  if (top - bottom < actor.height) {
    // A closed door the monster can open.
    const isDoor = MONSTER_DOORS.has(line.special) && !(line.flags & ML.SECRET);
    if (!isDoor) return false;
  }
  if (!floats) {
    if (to.floorheight - from.floorheight > 24) return false;
    if (from.floorheight - to.floorheight > 24 && !(actor.flags & MF.DROPOFF)) return false;
    if (to.ceilingheight - to.floorheight < actor.height && !MONSTER_DOORS.has(line.special)) return false;
  }
  return true;
}

function findPath(w, actor, fromSec, toSec) {
  if (!w.navGraph) buildGraph(w);
  if (fromSec === toSec) return [];
  const n = w.level.sectors.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Array(n).fill(null);
  const pos = new Array(n).fill(null);
  dist[fromSec.index] = 0;
  pos[fromSec.index] = { x: actor.x, y: actor.y };
  const open = [fromSec.index];
  const goal = actor.target;
  let expanded = 0;
  while (open.length && expanded < 600) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      const a = open[i], b = open[bi];
      const ha = dist[a] + aproxDistance(pos[a].x - goal.x, pos[a].y - goal.y);
      const hb = dist[b] + aproxDistance(pos[b].x - goal.x, pos[b].y - goal.y);
      if (ha < hb) bi = i;
    }
    const cur = open.splice(bi, 1)[0];
    expanded++;
    if (cur === toSec.index) break;
    const sec = w.level.sectors[cur];
    for (const edge of w.navGraph[cur]) {
      if (!passable(actor, sec, edge)) continue;
      const ni = edge.to.index;
      const d = dist[cur] + aproxDistance(edge.mid.x - pos[cur].x, edge.mid.y - pos[cur].y) + 8;
      if (d < dist[ni]) {
        if (dist[ni] === Infinity) open.push(ni);
        dist[ni] = d;
        prev[ni] = { from: cur, edge };
        pos[ni] = edge.mid;
      }
    }
  }
  if (!prev[toSec.index]) return null;
  const path = [];
  let at = toSec.index;
  while (at !== fromSec.index) {
    const p = prev[at];
    path.unshift(p.edge);
    at = p.from;
  }
  return path;
}

function hasLOS(w, actor) {
  const e = ext(actor);
  if (e.losTic === undefined || w.leveltime - e.losTic >= 8 || e.losTarget !== actor.target) {
    e.losTic = w.leveltime;
    e.losTarget = actor.target;
    e.los = !!actor.target && w.checkSight(actor, actor.target);
  }
  return e.los;
}

export function chaseGoal(w, actor) {
  const target = actor.target;
  if (!w.settings.modernAI || !target) return target;
  const e = ext(actor);
  const sec = actor.subsector.sector;
  const tsec = target.subsector.sector;
  if (hasLOS(w, actor)) {
    e.path = null;
    if (e.flank && !(actor.flags & MF.FLOAT)) {
      const dist = aproxDistance(target.x - actor.x, target.y - actor.y);
      if (dist > 160) {
        const ang = pointToAngle(actor.x, actor.y, target.x, target.y) + e.flank * Math.PI / 2;
        const off = Math.min(dist * 0.35, 200);
        return { x: target.x + Math.cos(ang) * off, y: target.y + Math.sin(ang) * off };
      }
    }
    return target;
  }
  if (sec === tsec) return target;
  const stale = !e.path || e.pathTo !== tsec || w.leveltime - (e.pathTic || 0) > 70
    || (e.path.length && e.path[0].to !== sec && !e.path.some((p) => p.to === sec) && e.pathFrom !== sec);
  if (stale) {
    e.path = findPath(w, actor, sec, tsec);
    e.pathTo = tsec;
    e.pathFrom = sec;
    e.pathTic = w.leveltime;
  }
  if (!e.path || !e.path.length) return target;
  // Drop portals already passed.
  const idx = e.path.findIndex((p) => p.to === sec);
  if (idx >= 0) e.path = e.path.slice(idx + 1);
  if (!e.path.length) return target;
  const edge = e.path[0];
  const l = edge.line;
  const len = l.length || 1;
  const ux = l.dx / len, uy = l.dy / len;
  let t = (actor.x - l.v1.x) * ux + (actor.y - l.v1.y) * uy;
  const margin = Math.min(len / 2, actor.radius + 8);
  t = Math.max(margin, Math.min(len - margin, t));
  // Left of v1->v2 is the back side.
  const sgn = edge.to === l.backsector ? 1 : -1;
  return { x: l.v1.x + ux * t - uy * 32 * sgn, y: l.v1.y + uy * t + ux * 32 * sgn };
}

export function noteStuck(w, actor) {
  const e = ext(actor);
  e.stuck = (e.stuck || 0) + 1;
  e.pathTic = -1000; // force re-path
}

export function onWake(w, actor) {
  if (!w.settings.modernAI) return;
  const e = ext(actor);
  const r = rand(w);
  e.flank = r < 0.25 ? -1 : r < 0.5 ? 1 : 0;
}

function strafe(w, actor, steps) {
  const target = actor.target;
  if (!target) return false;
  const ang = pointToAngle(actor.x, actor.y, target.x, target.y);
  const side = rand(w) < 0.5 ? 1 : -1;
  const dirAngle = ang + side * Math.PI / 2;
  let dir = Math.round(((dirAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 4)) & 7;
  const e = ext(actor);
  e.evadeDir = dir;
  e.evadeSteps = steps;
  return true;
}

// Called after a missile/hitscan attack instead of a new chase direction.
export function afterAttack(w, actor) {
  if (!w.settings.modernAI) return false;
  if (!HITSCANNERS.has(actor.type)) return false;
  if (rand(w) < 0.5) return strafe(w, actor, 2 + Math.floor(rand(w) * 3));
  return false;
}

export function evade(w, actor) {
  if (!w.settings.modernAI) return false;
  const e = ext(actor);
  if (e.evadeSteps > 0) {
    e.evadeSteps--;
    const old = actor.movedir;
    actor.movedir = e.evadeDir;
    if (w.enemyMove(actor)) return true;
    actor.movedir = old;
    e.evadeSteps = 0;
    return false;
  }
  if (!EVADERS.has(actor.type)) return false;
  const p = w.player;
  if (!p || !p.mo || actor.target !== p.mo) return false;
  if (e.evadeCooldown && w.leveltime < e.evadeCooldown) return false;
  const dist = aproxDistance(p.mo.x - actor.x, p.mo.y - actor.y);
  if (dist > 1024 || dist < 96) return false;
  const toActor = pointToAngle(p.mo.x, p.mo.y, actor.x, actor.y);
  const aimErr = Math.abs(angleDiff(p.mo.angle, toActor));
  if (aimErr > 0.12) return false;
  const chance = [0.04, 0.06, 0.1, 0.16, 0.22][w.skill] || 0.1;
  if (rand(w) > chance) return false;
  if (!hasLOS(w, actor)) return false;
  e.evadeCooldown = w.leveltime + 35;
  strafe(w, actor, 2 + Math.floor(rand(w) * 2));
  return evade(w, actor);
}

