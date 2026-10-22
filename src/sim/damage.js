// Damage model: projectile hits on soldiers, vehicles (armor facings,
// penetration, component damage), aircraft and structures, plus explosions
// with blast exposure checks, suppression, cratering and building damage.

import { rng } from '../core/rng.js';
import { clamp } from '../core/math.js';

// ------------------------------------------------------------- soldiers

export function hitSoldier(world, s, p, x, y, z, bodyT) {
  const def = p.def;
  const ap = p.ap;
  const ex = ap.explosive || def.explosive;
  if (ex && p.kind !== 'bullet') {
    // Direct hit by a rocket or grenade.
    world.damageSoldier(s, 220, p.owner, def, false);
    explode(world, x, y, z, ex, p.owner, p.faction, def, {});
    return true;
  }
  let dmg = (ap.damage || def.damage || 40) * rng.range(0.75, 1.25);
  const head = bodyT > 0.86;
  if (head) {
    // Helmets occasionally stop a glancing or long-range hit.
    const deflect = (ap.pen || 0) < 12 && rng.chance(0.15 + clamp(p.dist / 2000, 0, 0.25));
    dmg *= deflect ? 0.35 : 2.8;
  } else if (bodyT > 0.45) {
    const vest = s.def.vest || 0;
    if (vest > 0 && (ap.pen || 0) < 13) dmg *= 1 - vest;
  } else {
    dmg *= 0.6;
  }
  if (p.kind === 'bullet') dmg *= clamp(1.05 - p.dist / ((def.range || 500) * 3), 0.5, 1);
  if (ex) {
    // HE autocannon rounds etc.
    explode(world, x, y, z, ex, p.owner, p.faction, def, {});
  }
  world.damageSoldier(s, dmg, p.owner, def, head);
  if (p.owner && p.owner.stats) p.owner.stats.hits++;
  world.emit({ t: 'impact', kind: 'flesh', x, y, z, size: 0.5, nx: -p.vx, ny: -p.vy, nz: -p.vz });
  return true;
}

// ------------------------------------------------------------- vehicles

export function hitVehicle(world, v, p, x, y, z, code) {
  const def = p.def;
  const ap = p.ap;
  const spec = v.spec;
  let axis = code < 0 ? 1 : Math.floor(code / 2);
  const positive = code < 0 ? true : code % 2 === 1;
  let face = axis === 2 ? (positive ? 'front' : 'rear') : axis === 1 ? (positive ? 'top' : 'side') : 'side';
  const turretHit = axis !== 1 && y > v.pos.y + spec.hullHeight + 0.05;
  let armor = v.def.armor[face];
  if (turretHit && face === 'front') armor = v.def.armor.turretFront;
  // Wrecks soak hits but take no further damage.
  // Face normal in world space (yaw only).
  const c = Math.cos(v.yaw);
  const s = Math.sin(v.yaw);
  const sg = positive ? 1 : -1;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  if (axis === 0) {
    nx = sg * c;
    nz = -sg * s;
  } else if (axis === 2) {
    nx = sg * s;
    nz = sg * c;
  } else {
    ny = sg;
  }
  const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
  const cosA = Math.abs((p.vx * nx + p.vy * ny + p.vz * nz) / sp);
  // Glacis/turret slope: frontal plates are angled (~55-65 deg).
  const slope = face === 'front' ? 0.82 : 1;
  const eff = armor / Math.max(0.3, cosA) / slope;
  const ex = ap.explosive || def.explosive;
  const heat = def.kind === 'rocket' || def.kind === 'missile' || def.kind === 'drone';
  let pen = (ap.pen ?? def.pen ?? 0) * rng.range(0.88, 1.12);
  if (!heat && p.kind !== 'artillery') pen *= clamp(1 - p.dist / 9000, 0.75, 1);
  if (p.owner && p.owner.stats) p.owner.stats.hits++;
  v.lastHitTime = world.time;
  if (p.owner) v.threatSource = p.owner;
  if (!v.alive) {
    world.emit({ t: 'impact', kind: 'metal', x, y, z, size: pen > 100 ? 2 : 0.8, nx, ny, nz });
    if (ex) explode(world, x, y, z, ex, p.owner, p.faction, def, { exclude: v });
    return true;
  }
  if (pen >= eff) {
    let dmg = (ap.vehicleDamage ?? def.vehicleDamage ?? (ap.damage || 30) * 0.35) * rng.range(0.75, 1.25);
    if (pen / eff > 3) dmg *= 1.2;
    world.emit({ t: 'impact', kind: 'penetration', x, y, z, size: pen > 300 ? 2.4 : 1.2, nx, ny, nz });
    applyVehicleDamage(world, v, dmg, p.owner, def, { pen: true, face, turretHit });
  } else {
    // Kinetic rounds glance off at shallow angles.
    if (p.kind === 'bullet' && !ex && !p.ricochet && cosA < 0.55 && rng.chance(0.6)) {
      const dot = p.vx * nx + p.vy * ny + p.vz * nz;
      p.vx = (p.vx - 2 * dot * nx) * 0.45 + rng.range(-40, 40);
      p.vy = Math.abs(p.vy - 2 * dot * ny) * 0.45 + rng.range(10, 60);
      p.vz = (p.vz - 2 * dot * nz) * 0.45 + rng.range(-40, 40);
      p.x = x + nx * 0.1;
      p.y = y + 0.1;
      p.z = z + nz * 0.1;
      p.ricochet = true;
      world.emit({ t: 'impact', kind: 'ricochet', x, y, z, size: 0.6, nx, ny, nz });
      return false;
    }
    world.emit({ t: 'impact', kind: 'metal', x, y, z, size: pen > 150 ? 2.2 : pen > 40 ? 1.3 : 0.7, nx, ny, nz });
    // Spall or external damage from heavy non-penetrating hits.
    if (pen > eff * 0.65 && (ap.vehicleDamage || def.vehicleDamage)) {
      applyVehicleDamage(world, v, (ap.vehicleDamage ?? def.vehicleDamage) * 0.08, p.owner, def, { pen: false, face, turretHit });
    } else if (pen > 20 && (face === 'side' || face === 'rear') && rng.chance(0.03)) {
      v.mobilityKill = true;
    }
  }
  if (ex) explode(world, x, y, z, ex, p.owner, p.faction, def, { exclude: v });
  return true;
}

export function applyVehicleDamage(world, v, dmg, attacker, def, info) {
  if (!v.alive) return;
  v.hp -= dmg;
  v.lastHitTime = world.time;
  if (info.pen) {
    const cook = v.def.cookoff || [0.15, 0.2];
    const r = rng.next();
    if (r < (info.turretHit ? cook[1] : cook[0]) * clamp(dmg / 400, 0.4, 1.4)) {
      return world.destroyVehicle(v, attacker, def, true);
    }
    const r2 = rng.next();
    if (info.face === 'rear' && r2 < 0.4) {
      v.mobilityKill = true;
      if (rng.chance(0.45)) world.igniteVehicle(v, attacker, def);
    } else if (info.turretHit && r2 < 0.3) {
      v.firepowerKill = true;
      for (const w of v.weapons) if (w.mount === 'gun' || w.mount === 'coax') w.disabled = true;
    } else if (info.face === 'side' && r2 < 0.22) {
      v.mobilityKill = true;
    }
    if (rng.chance(0.25)) v.crew = Math.max(0, v.crew - 1);
    if (rng.chance(0.12)) world.igniteVehicle(v, attacker, def);
    // Passengers can be hurt by a penetration.
    for (const pas of v.passengers) if (rng.chance(0.15)) world.damageSoldier(pas, rng.range(40, 140), attacker, def, false);
    if (v.crew <= 0) return world.destroyVehicle(v, attacker, def, false);
  }
  if (v.hp <= 0) world.destroyVehicle(v, attacker, def, rng.chance(0.35));
}

// ------------------------------------------------------------- aircraft

export function hitAircraft(world, a, p, x, y, z, proximity) {
  const def = p.def;
  const ap = p.ap;
  let dmg = ap.airDamage ?? def.airDamage ?? ap.vehicleDamage ?? def.vehicleDamage ?? ap.damage ?? def.damage ?? 20;
  if (p.kind === 'bullet' && !def.airDamage) {
    const pen = ap.pen ?? def.pen ?? 0;
    dmg = (ap.damage || def.damage || 30) * (pen < a.def.armor ? 0.12 : 0.9);
  }
  if (proximity) dmg *= rng.range(0.55, 1.05);
  const ex = ap.explosive || def.explosive;
  if (ex && (p.kind !== 'bullet' || proximity)) {
    world.emit({ t: 'explosion', x, y, z, size: ex.size === 'small' ? 'small' : 'medium', radius: ex.radius, air: true, ex });
  } else {
    world.emit({ t: 'impact', kind: 'metal', x, y, z, size: 0.8, nx: -p.vx, ny: -p.vy, nz: -p.vz });
  }
  if (p.owner && p.owner.stats) p.owner.stats.hits++;
  a.lastHitTime = world.time;
  if (p.owner) a.threatSource = p.owner;
  a.hp -= dmg * rng.range(0.8, 1.2);
  if (a.hp <= 0) world.destroyAircraft(a, p.owner, def, 'shot');
  else if (a.hp < a.maxHp * 0.45) a.smoking = 1;
  return true;
}

// ------------------------------------------------------------- structures

const MAT_IMPACT = { metal: 'metal', wood: 'wood', hedge: 'foliage', sandbag: 'dirt', rock: 'concrete' };

export function hitStructure(world, s, p, x, y, z, nx, ny, nz) {
  const def = p.def;
  const ap = p.ap;
  const ex = ap.explosive || def.explosive;
  if (s.kind === 'wreck' && s.unit) {
    world.emit({ t: 'impact', kind: 'metal', x, y, z, size: 0.8, nx, ny, nz });
    if (ex) explode(world, x + nx * 0.3, y + ny * 0.3, z + nz * 0.3, ex, p.owner, p.faction, def, {});
    return true;
  }
  world.emit({ t: 'impact', kind: MAT_IMPACT[s.material] || 'concrete', x, y, z, size: (ap.pen || 0) > 100 ? 2 : 0.7, nx, ny, nz });
  if (ex) {
    explode(world, x + nx * 0.3, y + ny * 0.3, z + nz * 0.3, ex, p.owner, p.faction, def, { struct: s });
    return true;
  }
  const kin = (ap.pen || 0) > 100 ? (ap.vehicleDamage || def.vehicleDamage || 100) * 0.6 : (ap.damage || def.damage || 30) * 0.015;
  damageStructure(world, s, kin, p.owner);
  if (p.kind === 'bullet' && !p.ricochet && s.material !== 'hedge' && s.material !== 'sandbag' && rng.chance(0.18)) {
    const dot = p.vx * nx + p.vy * ny + p.vz * nz;
    if (dot < 0 && Math.abs(dot) / (Math.hypot(p.vx, p.vy, p.vz) || 1) < 0.4) {
      p.vx = (p.vx - 2 * dot * nx) * 0.4;
      p.vy = (p.vy - 2 * dot * ny) * 0.4 + rng.range(5, 30);
      p.vz = (p.vz - 2 * dot * nz) * 0.4;
      p.x = x + nx * 0.1;
      p.y = y;
      p.z = z + nz * 0.1;
      p.ricochet = true;
      return false;
    }
  }
  return true;
}

export function damageStructure(world, s, amount, source) {
  if (s.destroyed || amount <= 0 || s.kind === 'wreck') return;
  s.hp -= amount;
  const dmg = 1 - Math.max(0, s.hp) / s.maxHp;
  if (dmg - s.damage > 0.04 || s.hp <= 0) {
    s.damage = dmg;
    s.version++;
  }
  if (s.kind === 'building' && dmg > 0.55 && s.burning <= 0 && s.material !== 'concrete' && rng.chance(0.25)) {
    s.burning = rng.range(60, 200);
    s.version++;
    world.burningStructures.add(s);
  }
  if (s.hp <= 0) world.destroyStructure(s, source);
}

// ------------------------------------------------------------- explosions

export function explode(world, x, y, z, ex, owner, faction, def, opts = {}) {
  const R = ex.radius;
  const Rs = R * 3.2;
  const terrain = world.terrain;
  const ground = terrain.heightAt(x, z);
  const air = opts.air || y > ground + Math.max(4, R * 0.5);
  world.emit({ t: 'explosion', x, y, z, size: ex.size, radius: R, air, ex, mat: air ? -1 : terrain.materialAt(x, z), owner });
  world.noteCombat(x, z, ex.size === 'huge' ? 6 : ex.size === 'large' ? 4 : 2);

  // Local arrays: explosions can chain (cook-offs, fuel tanks) and re-enter here.
  const cand = world.unitGrid.queryRadius(x, z, Rs + 4, []);
  for (let i = 0; i < cand.length; i++) {
    const u = cand[i];
    if (!u.alive || u.hidden || u === opts.exclude) continue;
    const dx = u.pos.x - x;
    const dz = u.pos.z - z;
    if (u.cat === 'inf') {
      const cy = u.pos.y + (u.stance === 2 ? 0.25 : u.stance === 1 ? 0.8 : 1.1);
      const dy = cy - y;
      const d = Math.hypot(dx, dy, dz);
      if (d < R) {
        let dmg = ex.damage * Math.pow(1 - d / R, 1.3) + (d < R * 0.2 ? ex.damage * 0.5 : 0);
        // Cover between the blast and the soldier absorbs most of it.
        if (d > 1.2 && !world.blastExposed(x, y + 0.3, z, u.pos.x, cy, u.pos.z)) dmg *= 0.12;
        // Fragments fly up and out: lying flat is the best protection.
        if (u.stance === 2 && d > R * 0.15) dmg *= 0.3;
        else if (u.stance === 1) dmg *= 0.72;
        if (u.roof && y < u.pos.y - 1) dmg *= 0.2;
        if (dmg > 4) world.damageSoldier(u, dmg, owner, def, false);
      }
      if (u.alive && d < Rs && u.faction !== faction) {
        u.suppression = Math.min(1, u.suppression + ex.suppression * (1 - d / Rs) * (u.cover ? 0.6 : 1));
        u.lastShotAt = world.time;
      }
    } else if (u.cat === 'veh') {
      const d = Math.hypot(dx, dz, u.pos.y + 1 - y);
      const r = R * 0.7;
      if (d < r + u.radius * 0.5) {
        const k = clamp(1 - (d - u.radius * 0.5) / r, 0, 1);
        const roof = u.def.armor.top * 1.4;
        if (ex.blastPen * k > roof * 0.6) {
          applyVehicleDamage(world, u, ex.damage * 0.6 * k, owner, def, { pen: ex.blastPen * k > roof, face: 'top', turretHit: false });
        } else if (k > 0.5 && ex.size === 'huge' && rng.chance(0.15)) {
          u.mobilityKill = true;
        }
      }
    } else if (u.cat === 'air') {
      const d = Math.hypot(dx, dz, u.pos.y - y);
      if (d < R * (u.aclass === 'drone' ? 1.5 : 0.8)) {
        u.hp -= ex.damage * (1 - d / R) * (u.aclass === 'drone' ? 3 : 0.5);
        if (u.hp <= 0) world.destroyAircraft(u, owner, def, 'blast');
      }
    }
  }

  // Structures.
  const structs = world.structures.queryRadius(x, z, R + 20, []);
  const structFactor = ex.size === 'huge' ? 1.6 : ex.size === 'large' ? 1.0 : ex.size === 'medium' ? 0.55 : 0.15;
  for (let i = 0; i < structs.length; i++) {
    const s = structs[i];
    if (s.destroyed || s.kind === 'wreck') continue;
    const c = Math.cos(s.yaw);
    const sn = Math.sin(s.yaw);
    const rx = x - s.x;
    const rz = z - s.z;
    const lx = Math.max(0, Math.abs(rx * c - rz * sn) - s.hx);
    const lz = Math.max(0, Math.abs(rx * sn + rz * c) - s.hz);
    const ly = Math.max(0, s.y - y, y - (s.y + s.solidH));
    const d = Math.hypot(lx, ly, lz);
    const reach = R * 0.75 + (s === opts.struct ? R * 0.4 : 0);
    if (d < reach) {
      const dmg = ex.damage * structFactor * (1 - d / reach) * (s === opts.struct ? 1.6 : 1);
      damageStructure(world, s, dmg, owner);
    }
  }

  // Trees near big blasts are knocked down.
  if (!air && (ex.size === 'huge' || ex.size === 'large')) {
    const trees = world.map.trees.grid.queryRadius(x, z, R * 0.6, []);
    for (const t of trees) {
      if (!t.alive) continue;
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < R * 0.6 && rng.chance(ex.size === 'huge' ? 0.7 : 0.35)) world.fellTree(t, Math.atan2(t.x - x, t.z - z));
    }
  }

  // Terrain scars.
  if (!air) {
    if (ex.crater > 0 && terrain.materialAt(x, z) !== 6) {
      terrain.crater(x, z, ex.crater * 1.5, ex.crater * 0.42);
      world.onCrater(x, z, ex.crater * 1.5);
    }
    terrain.burn(x, z, Math.max(1.5, R * (ex.size === 'huge' ? 0.55 : 0.4)), ex.size === 'small' ? 70 : 150);
    // Dust and smoke that briefly block sight.
    if (ex.size !== 'small') world.smoke.add(x, ground + R * 0.25, z, R * (ex.size === 'huge' ? 0.9 : 0.6), ex.size === 'huge' ? 14 : 7, 0.06, 'dust');
  }
}
