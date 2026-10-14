// The rescue helicopter (VHEL): spawned by the Chinatown script when the
// hold-out ends, it flies the 9062 path nodes in order (their angle is the
// order), easing into a hover over the last one (the pier's north end) and,
// if the player misses the extraction window, climbs away. Flight is plain
// steering maths on saved state, so it is deterministic and survives saves.

import { MT } from '../tables.js';
import { normAngle, angleDiff } from '../defs.js';
import { setThingPosition, unsetThingPosition } from '../maputl.js';

const CRUISE_ALT = 448; // above the floor along the path
const HOVER_ALT = 176; // above the floor at the last node
const MAX_SPEED = 12; // units per tic (420 units/s)
const ACCEL = 0.45;
const TURN = 0.05; // radians per tic
const LEAVE_TICS = 8 * 35;

// The path: node positions with flying heights under the ceiling.
export function heliPath(w, zoneCentre) {
  const nodes = [...w.mobjs].filter((m) => m.type === MT.CT_HELINODE)
    .sort((a, b) => (a.spawnpoint.angle - b.spawnpoint.angle) || (a.id - b.id));
  const pts = nodes.map((m) => ({ x: m.x, y: m.y }));
  if (!pts.length && zoneCentre) {
    pts.push({ x: zoneCentre.x - 1024, y: zoneCentre.y + 1024 }, { x: zoneCentre.x, y: zoneCentre.y });
  }
  return pts.map((p, i) => {
    const sec = w.pointInSubsector(p.x, p.y).sector;
    const alt = i === pts.length - 1 ? HOVER_ALT : CRUISE_ALT;
    const top = sec.ceilingheight - 96 - 8;
    return { x: p.x, y: p.y, z: Math.max(sec.floorheight + 64, Math.min(sec.floorheight + alt, top)) };
  });
}

function place(w, mo, x, y, z) {
  unsetThingPosition(w, mo);
  mo.x = x;
  mo.y = y;
  setThingPosition(w, mo);
  const sec = mo.subsector.sector;
  mo.z = Math.min(z, sec.ceilingheight - mo.height - 4);
  mo.floorz = sec.floorheight;
  mo.ceilingz = sec.ceilingheight;
}

// New flight state with the helicopter at the first node, or null.
export function spawnHeli(w, path) {
  if (!path.length) return null;
  const p0 = path[0];
  const mo = w.spawnMobj(p0.x, p0.y, p0.z, MT.CT_VHEL);
  const next = path[Math.min(1, path.length - 1)];
  mo.angle = normAngle(Math.atan2(next.y - p0.y, next.x - p0.x));
  mo.saveInterp();
  w.sound(mo, 'heli', { loop: true, channel: 'heli' });
  return { mo, path, i: Math.min(1, path.length - 1), vx: 0, vy: 0, vz: 0, phase: 'fly', t: 0, hz: p0.z };
}

// One tic of flight; returns the phase ('fly', 'hover', 'leave', 'gone').
export function tickHeli(w, h) {
  const mo = h.mo;
  if (!mo || mo.removed) return 'gone';
  h.t++;
  let tx, ty, tz, speed = MAX_SPEED;
  if (h.phase === 'fly') {
    const p = h.path[h.i];
    tx = p.x; ty = p.y; tz = p.z;
    const last = h.i === h.path.length - 1;
    const dist = Math.hypot(tx - mo.x, ty - mo.y, tz - mo.z);
    if (last) speed = Math.min(MAX_SPEED, Math.max(0.6, dist / 24));
    else if (dist < 96) h.i++;
    if (last && dist < 6 && Math.hypot(h.vx, h.vy, h.vz) < 1.2) {
      h.phase = 'hover';
      h.t = 0;
      h.hz = tz;
      h.vx = h.vy = h.vz = 0;
    }
  }
  if (h.phase === 'hover') {
    const p = h.path[h.path.length - 1];
    place(w, mo, p.x + Math.sin(h.t * 0.031) * 4, p.y + Math.cos(h.t * 0.023) * 4, h.hz + Math.sin(h.t * 0.06) * 6);
    mo.angle = normAngle(mo.angle + Math.sin(h.t * 0.02) * 0.002);
    return h.phase;
  }
  if (h.phase === 'leave') {
    // Up and away along the current heading.
    tx = mo.x + Math.cos(mo.angle) * 2048;
    ty = mo.y + Math.sin(mo.angle) * 2048;
    tz = mo.z + 512;
    if (h.t > LEAVE_TICS) {
      w.stopLoop(mo, 'heli');
      w.removeMobj(mo);
      h.mo = null;
      h.phase = 'gone';
      return h.phase;
    }
  }
  // Steer: accelerate toward the wanted velocity.
  const dx = tx - mo.x, dy = ty - mo.y, dz = tz - mo.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  const wx = dx / d * speed, wy = dy / d * speed, wz = dz / d * speed;
  const ax = wx - h.vx, ay = wy - h.vy, az = wz - h.vz;
  const a = Math.hypot(ax, ay, az);
  const k = a > ACCEL ? ACCEL / a : 1;
  h.vx += ax * k; h.vy += ay * k; h.vz += az * k;
  place(w, mo, mo.x + h.vx, mo.y + h.vy, mo.z + h.vz);
  if (Math.hypot(h.vx, h.vy) > 0.8) {
    const want = Math.atan2(h.vy, h.vx);
    const diff = angleDiff(mo.angle, want);
    mo.angle = normAngle(mo.angle + Math.max(-TURN, Math.min(TURN, diff)));
  }
  return h.phase;
}

export function heliLeave(h) {
  if (h && h.phase !== 'gone') {
    h.phase = 'leave';
    h.t = 0;
  }
}
