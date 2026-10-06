// The disasters. Each one has a warning name, how long it lasts, what the
// bots should do about it (get up high, get inside, get into the open, run
// from it), and start/update/stop functions that get a shared context D:
//   D = { world, st (breakable map), water, weather, sky, flames, fx, map,
//         chars() (people on the island), hurt(ch, dmg), kill(ch, pos), shake(amount),
//         collapse(part, vel), ignite(part), explode(pos, r, power) }
import * as THREE from 'three';
import { G } from './maps.js';
import { buildFunnel, buildWave, buildVolcano, lightningBolt, groundMark, tex } from './effects.js';
import * as A from './audio.js';
import { jjk } from './jjk.js';
import { chaos } from './chaos.js';
import { GROUP } from '../../engine/Part.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** A random point on the island (near the map, sometimes near someone). */
function target(D, nearPeople = 0.3) {
  const people = D.chars();
  if (people.length && Math.random() < nearPeople) { const p = pick(people).rootPosition; return V(p.x + rnd(-8, 8), G, p.z + rnd(-8, 8)); }
  const c = D.map.center || [0, 0];
  return V(c[0] + rnd(-92, 92), G, c[1] + rnd(-92, 92));
}
/** Is a character under open sky? */
export function exposed(D, ch) {
  const h = ch.headPosition;
  return !D.world.raycast(V(h.x, h.y + 1.5, h.z), V(h.x, h.y + 160, h.z), { mask: GROUP.WORLD | GROUP.DYNAMIC });
}
function groundY(D, x, z, from = 220) {
  const hit = D.world.raycast(V(x, from, z), V(x, -50, z), { mask: GROUP.WORLD | GROUP.DYNAMIC });
  return hit ? hit.point.y : D.water.level;
}

// --- tornado -------------------------------------------------------------------------------------------------------------
const tornado = {
  id: 'tornado', name: 'Tornado', icon: '🌪️', color: '#8a9aa8', duration: 55, bots: 'away',
  tip: 'Get away from the funnel!',
  start(D, S) {
    const a = Math.random() * Math.PI * 2;
    S.pos = V(Math.cos(a) * 170, 0, Math.sin(a) * 170);
    S.goal = target(D, 0.4);
    S.funnel = buildFunnel(D.world);
    S.scale = 0.15; S.speed = rnd(11, 15);
    D.sky.set({ dome: 0.9, fog: 0x5e6460, near: 80, far: 650, amb: 0.55, sun: 0.35, tint: 0x9aa098 });
    D.weather.set('rain', 0.5);
    A.wind(0.05); A.rain(0.12);
  },
  update(D, S, dt, t) {
    const dur = this.duration;
    S.scale += ((t > dur - 5 ? 0.05 : 1) - S.scale) * Math.min(1, dt * (t > dur - 5 ? 0.9 : 0.4));
    const to = S.goal.clone().sub(S.pos).setY(0);
    if (to.length() < 8) S.goal = target(D, 0.45);
    S.pos.addScaledVector(to.normalize(), S.speed * dt);
    S.funnel.group.position.set(S.pos.x, groundY(D, S.pos.x, S.pos.z, 30) - 2, S.pos.z);
    S.funnel.update(dt, t, S.scale);
    const R = 24 * S.scale;
    const cam = D.world.camera.position;
    const dcam = hdist(cam, S.pos);
    A.volume('wind', Math.min(0.75, 0.12 + 0.6 * Math.max(0, 1 - dcam / 220)) * S.scale + 0.05);
    D.shake(Math.max(0, 1 - dcam / 70) * 0.35 * S.scale);
    D.weather.wind.set(-(S.pos.z - cam.z), 0, S.pos.x - cam.x).normalize().multiplyScalar(30 * Math.max(0, 1 - dcam / 200));
    if (S.scale < 0.3) return;
    // tear the buildings apart
    for (const p of D.st.near(S.pos, R + 6, (p) => p.mesh.position.y < 70 && hdist(p.mesh.position, S.pos) < R + 4)) {
      const d = hdist(p.mesh.position, S.pos);
      if (Math.random() < dt * (p.userData.loose ? 6 : 2.2) * (1.3 - d / (R + 4))) D.collapse(p, V(-(p.mesh.position.z - S.pos.z), 20, p.mesh.position.x - S.pos.x).normalize().multiplyScalar(30));
    }
    // and whirl everything loose up into it
    const swirl = (body, k, lift) => {
      const dx = body.position.x - S.pos.x, dz = body.position.z - S.pos.z, d = Math.hypot(dx, dz) || 1;
      const v = body.velocity;
      const f = Math.max(0, 1 - d / (R * 1.7)) * k;
      v.x += (-dz / d * 95 - dx / d * 45) * f * dt; v.z += (dx / d * 95 - dz / d * 45) * f * dt;
      v.y += (body.position.y < 110 ? lift : -40) * f * dt;
      if (body.position.y > 95) { v.x += dx / d * 80 * dt; v.z += dz / d * 80 * dt; } // flung out of the top
      const sp = Math.hypot(v.x, v.y, v.z); if (sp > 140) { v.x *= 140 / sp; v.y *= 140 / sp; v.z *= 140 / sp; }
    };
    for (const p of D.world.dynamicParts) { if (p.body && hdist(p.body.position, S.pos) < R * 1.7) { p.body.wakeUp(); swirl(p.body, 1, 250); } }
    for (const ch of D.chars()) {
      const d = hdist(ch.rootPosition, S.pos);
      if (d < R * 1.25) {
        if (!ch.platformStand) { ch.platformStand = true; ch.body.velocity.y = 30; }
        ch.inTornado = D.world.time;
        swirl(ch.body, 1.15, 255);
        if (d < R * 0.5 && Math.random() < dt * 2) D.hurt(ch, 12, 'debris');
      }
    }
  },
  stop(D, S) {
    S.funnel?.dispose();
    A.stop('wind'); A.stop('rain');
  },
};

// --- tsunami -----------------------------------------------------------------------------------------------------------
const tsunami = {
  id: 'tsunami', name: 'Tsunami', icon: '🌊', color: '#3a8ae8', duration: 58, bots: 'high',
  tip: 'Get as high as you can!',
  start(D, S) {
    const a = pick([0, 0.5, 1, 1.5]) * Math.PI;
    S.dir = V(Math.sin(a), 0, Math.cos(a));
    S.waves = [{ f: -620, h: 52, made: false, at: 7 }, { f: -620, h: 34, made: false, at: 30 }];
    D.water.target = -9; D.water.speed = 2.5; // the sea draws back first...
    D.sky.set({ dome: 0.35, fog: 0x8aa0b0, near: 150, far: 1200, amb: 0.85, sun: 0.75, tint: 0xb8c8d8 });
    A.rush(0.02);
  },
  update(D, S, dt, t) {
    const cam = D.world.camera.position;
    let near = 0;
    for (const w of S.waves) {
      if (t < w.at) continue;
      if (!w.made) { w.made = true; w.obj = buildWave(D.world, 760, w.h); w.obj.group.rotation.y = Math.atan2(S.dir.x, S.dir.z); w.speed = 52; }
      if (!w.obj) continue;
      w.f += w.speed * dt;
      const grow = Math.min(1, (w.f + 620) / 420);
      w.obj.group.scale.set(1, 0.25 + 0.75 * grow, 1);
      w.obj.group.position.copy(S.dir).multiplyScalar(w.f).setY(D.water.level - 1);
      const top = D.water.level + w.h * (0.25 + 0.75 * grow);
      const pc = cam.x * S.dir.x + cam.z * S.dir.z;
      near = Math.max(near, Math.max(0, 1 - Math.abs(pc - w.f) / 260));
      // spray off the crest
      if (Math.random() < dt * 30) { const side = V(S.dir.z, 0, -S.dir.x).multiplyScalar(rnd(-260, 260)); D.fx.burst(D.fx.mats.dust, S.dir.clone().multiplyScalar(w.f + 4).add(side).setY(top - 2), 3, { speed: [4, 14], size: [2, 5], life: [0.8, 1.6], gravity: 0.4, grow: 2 }); }
      // everything in front of the wave is swept away
      const band = (p) => { const s = p.x * S.dir.x + p.z * S.dir.z; return s > w.f - 16 && s < w.f + 4; };
      if (w.f > -150 && w.f < 160) {
        // (loose things go; walls low down often give way, higher up less so)
        const low = D.water.level + w.h * 0.3;
        for (const p of D.st.near(S.dir.clone().multiplyScalar(w.f), 400, (p) => band(p.mesh.position) && p.mesh.position.y < top - 6)) if (Math.random() < dt * (p.userData.loose ? 7 : p.mesh.position.y < low ? 0.55 : 0.2)) D.collapse(p, S.dir.clone().multiplyScalar(48).setY(12), 2);
        for (const p of D.world.dynamicParts) if (p.body && band(p.body.position) && p.body.position.y < top) { p.body.wakeUp(); p.body.velocity.x = S.dir.x * 55; p.body.velocity.z = S.dir.z * 55; p.body.velocity.y = Math.max(p.body.velocity.y, 10); }
        for (const ch of D.chars()) if (band(ch.rootPosition) && ch.rootPosition.y < top) {
          ch.platformStand = true; ch.inTornado = D.world.time;
          ch.body.velocity.x = S.dir.x * 60; ch.body.velocity.z = S.dir.z * 60; ch.body.velocity.y = Math.max(ch.body.velocity.y, 18);
          if (Math.random() < dt * 3) D.hurt(ch, 8, 'drowned');
        }
      }
      // once it's past the island the sea floods in behind it
      if (w.f > -130 && !w.flooded) { w.flooded = true; D.water.target = w.h > 40 ? 17 : 13; D.water.speed = 16; D.shake(0.6); A.crash(cam); }
      if (w.f > 700) { w.obj.dispose(); w.obj = null; }
    }
    A.volume('rush', 0.05 + near * 0.8 + (D.water.level > 3 ? 0.2 : 0));
    D.shake(near * 0.3);
    if (D.water.level > 4) D.water.current = S.dir.clone().multiplyScalar(14);
    if (t > 46) { D.water.target = 0; D.water.speed = 2.2; }
  },
  stop(D, S) { for (const w of S.waves) w.obj?.dispose(); D.water.target = 0; D.water.speed = 3; D.water.current = null; A.stop('rush'); },
};

// --- flash flood ----------------------------------------------------------------------------------------------------------
const flood = {
  id: 'flood', name: 'Flash Flood', icon: '💧', color: '#5aa0d8', duration: 60, bots: 'high',
  tip: 'The water is rising - get up high!',
  start(D, S) {
    D.water.target = 26; D.water.speed = 0.75;
    D.water.setTint(0x7a6a48);
    const a = Math.random() * Math.PI * 2; S.cur = V(Math.cos(a), 0, Math.sin(a));
    D.weather.set('rain', 0.9);
    D.sky.set({ dome: 0.75, fog: 0x7a8288, near: 90, far: 700, amb: 0.65, sun: 0.45, tint: 0xa0a8b0 });
    A.rain(0.18); A.rush(0.05);
  },
  update(D, S, dt, t) {
    D.water.current = S.cur.clone().multiplyScalar(8 + 6 * Math.sin(t * 0.3));
    A.volume('rush', Math.min(0.6, 0.05 + D.water.level / 40));
    // the water picks up anything loose
    for (const p of D.st.near(V(0, D.water.level, 0), 300, (p) => p.userData.loose && p.mesh.position.y < D.water.level - 0.5)) if (Math.random() < dt * 0.7) D.collapse(p, D.water.current.clone());
    for (const ch of D.chars()) if (ch.rootPosition.y < D.water.level + 1 && ch.swimming) { ch.body.velocity.x += D.water.current.x * dt * 3; ch.body.velocity.z += D.water.current.z * dt * 3; }
    if (t > this.duration - 10) { D.water.target = 0; D.water.speed = 3; }
  },
  stop(D) { D.water.target = 0; D.water.speed = 3; D.water.current = null; D.water.setTint(0x4a90c8); A.stop('rain'); A.stop('rush'); },
};

// --- earthquake ---------------------------------------------------------------------------------------------------------------
const quake = {
  id: 'earthquake', name: 'Earthquake', icon: '🌍', color: '#b88a50', duration: 48, bots: 'open',
  tip: 'Get out of the buildings!',
  start(D, S) {
    S.cracks = [];
    D.sky.set({ dome: 0.15, fog: 0xb8a890, near: 200, far: 1300, amb: 0.95, sun: 0.9, tint: 0xd0c0a0 });
    A.rumble(0.05);
  },
  intensity(t) {
    if (t < 3) return 0.25;
    if (t < 6) return 0.25 + (t - 3) / 3 * 0.75;
    if (t < 26) return 0.85 + 0.15 * Math.sin(t * 2.3);
    if (t < 31) return 1 - (t - 26) / 5 * 0.65;
    if (t > 36 && t < 43) return 0.8 + 0.15 * Math.sin(t * 3);
    return 0.3;
  },
  update(D, S, dt, t) {
    const I = this.intensity(t);
    D.shake(I * 0.9);
    A.volume('rumble', 0.15 + I * 0.75);
    // people stagger about
    for (const ch of D.chars()) {
      ch.quakeJitter = V(rnd(-1, 1), 0, rnd(-1, 1)).multiplyScalar(I * 0.75);
      if (ch.grounded && Math.random() < dt * I * 1.6) ch.body.velocity.y = rnd(8, 18) * I;
    }
    // loose things rattle and fall over
    for (const p of D.world.dynamicParts) if (p.body && p.body.position.y < 80 && Math.random() < 0.3) { p.body.wakeUp(); p.body.velocity.x += rnd(-20, 20) * I * dt * 3; p.body.velocity.z += rnd(-20, 20) * I * dt * 3; if (Math.random() < dt * I * 2) p.body.velocity.y += rnd(5, 15); }
    // and the buildings come down, the top first
    const n = I > 0.5 ? dt * I * 9 : dt * I * 2;
    let k = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    if (k) {
      const parts = [...D.st.parts].filter((p) => p.anchored && !p.destroyed && !p.userData.fixed);
      while (k-- > 0 && parts.length) {
        let best = null;
        for (let i = 0; i < 6; i++) { const c = pick(parts); if (!best || c.mesh.position.y + (c.userData.loose ? 15 : 0) > best.mesh.position.y + (best.userData.loose ? 15 : 0)) best = c; }
        D.collapse(best, V(rnd(-6, 6), rnd(0, 6), rnd(-6, 6)));
      }
    }
    if (Math.random() < dt * I * 2.5) A.crumble(D.world.camera.position.clone().add(V(rnd(-20, 20), 0, rnd(-20, 20))));
    // the ground cracks open
    if (S.cracks.length < 10 && Math.random() < dt * I * 0.45) {
      const p = target(D, 0.2);
      const m = groundMark(D.world, tex().crack, p.x, G + 0.06, p.z, rnd(16, 34), { color: 0xffffff });
      S.cracks.push(m);
      D.fx.burst(D.fx.mats.dust, V(p.x, G + 1, p.z), 14, { speed: [3, 10], size: [2, 4], life: [1, 2], gravity: 0.1, grow: 2 });
    }
  },
  stop(D, S) { for (const m of S.cracks) setTimeout(() => D.world.scene.remove(m), 4000); for (const ch of D.chars()) ch.quakeJitter = null; A.stop('rumble'); },
};

// --- meteor shower -------------------------------------------------------------------------------------------------------------
function rockMesh(r) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshLambertMaterial({ map: tex().lava, emissive: 0xff5a10, emissiveMap: tex().lava, emissiveIntensity: 1.2, color: 0x5a3020 }));
  const p = m.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 1 + rnd(-0.18, 0.18); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
  m.geometry.computeVertexNormals();
  return m;
}
/** Flaming rocks flying along a path: ballistic (g) or straight (speed). */
function launch(D, S, from, vel, r, g, onImpact) {
  const mesh = rockMesh(r); mesh.position.copy(from);
  D.world.scene.add(mesh);
  const rock = { mesh, vel, r, g, alive: true };
  rock.fire = D.flames.add(() => (rock.alive ? mesh.position : null), r * 2.2);
  rock.onImpact = onImpact;
  S.rocks.push(rock);
  return rock;
}
function updateRocks(D, S, dt) {
  for (const rk of [...S.rocks]) {
    rk.vel.y -= rk.g * dt;
    const next = rk.mesh.position.clone().addScaledVector(rk.vel, dt);
    const hit = D.world.raycast(rk.mesh.position, next, { mask: GROUP.WORLD | GROUP.DYNAMIC });
    rk.mesh.rotation.x += dt * 3; rk.mesh.rotation.z += dt * 2;
    if (Math.random() < dt * 25) D.fx.burst(D.fx.mats.dust, rk.mesh.position, 1, { speed: [0, 2], size: [rk.r * 1.6, rk.r * 2.6], life: [0.8, 1.6], gravity: -0.02, grow: 1.5 });
    const water = next.y < D.water.level;
    if (hit || water || next.y < -20) {
      const at = hit ? hit.point : next;
      rk.alive = false; D.world.scene.remove(rk.mesh); rk.mesh.geometry.dispose();
      S.rocks.splice(S.rocks.indexOf(rk), 1);
      if (water && !hit) { A.splash(at, 1.5); D.fx.burst(D.fx.mats.dust, at.clone().setY(D.water.level), 20, { speed: [6, 20], size: [1, 2.5], life: [0.6, 1.2], gravity: 0.8 }); continue; }
      rk.onImpact(at, hit);
      continue;
    }
    rk.mesh.position.copy(next);
  }
}
const meteor = {
  id: 'meteor', name: 'Meteor Shower', icon: '☄️', color: '#ff7a30', duration: 50, bots: 'inside',
  tip: 'Take cover - they hit hard!',
  start(D, S) {
    S.rocks = []; S.next = 1.5;
    D.sky.set({ dome: 0.55, fog: 0x8a6a5a, near: 160, far: 1100, amb: 0.75, sun: 0.6, tint: 0xd09070 });
    A.wind(0.08);
  },
  update(D, S, dt, t) {
    S.next -= dt;
    if (S.next <= 0 && t < this.duration - 4) {
      S.next = Math.max(0.28, 1.3 - t * 0.022) * rnd(0.6, 1.3);
      const to = target(D, 0.35);
      const a = Math.random() * Math.PI * 2;
      const from = to.clone().add(V(Math.cos(a) * 160, 280, Math.sin(a) * 160));
      const r = rnd(1.6, 3.6);
      const vel = to.clone().sub(from).normalize().multiplyScalar(rnd(150, 190));
      A.whoosh(from.clone().lerp(to, 0.7));
      launch(D, S, from, vel, r, 0, (at) => {
        D.explode(at, 4 + r * 1.6, r > 3 ? 1.4 : 1);
        D.mark(at, 'scorch', 8 + r * 3);
        if (Math.random() < 0.5) { const near = D.st.near(at, 8)[0]; if (near) D.ignite(near); }
      });
    }
    updateRocks(D, S, dt);
  },
  stop(D, S) { for (const rk of S.rocks) { rk.alive = false; D.world.scene.remove(rk.mesh); } S.rocks = []; A.stop('wind'); },
};

// --- volcanic eruption --------------------------------------------------------------------------------------------------------------
const volcano = {
  id: 'volcano', name: 'Volcanic Eruption', icon: '🌋', color: '#ff4a10', duration: 62, bots: 'inside',
  tip: 'Lava bombs incoming! Stay off the lava!',
  start(D, S) {
    S.rocks = []; S.pools = [];
    const a = Math.random() * Math.PI * 2;
    S.base = V(Math.cos(a) * 270, 0, Math.sin(a) * 270);
    S.v = buildVolcano(D.world);
    S.v.group.position.set(S.base.x, -140, S.base.z);
    S.next = 9; S.heat = 0;
    D.sky.set({ dome: 0.85, fog: 0x6a4a3a, near: 90, far: 800, amb: 0.6, sun: 0.45, tint: 0xd07a40 });
    D.weather.set('ash', 0.6);
    A.rumble(0.3);
  },
  update(D, S, dt, t) {
    const dur = this.duration;
    // it rises out of the sea, erupts, and sinks back at the end
    const y = t < 8 ? -140 + (t / 8) * 140 : t > dur - 6 ? -((t - (dur - 6)) / 6) * 140 : 0;
    S.v.group.position.y = y - 4;
    if (t < 8) D.shake(0.5);
    S.heat = Math.min(1, Math.max(0, (t - 7) / 6));
    S.v.update(dt, S.heat);
    A.volume('rumble', 0.2 + S.heat * 0.4);
    const crater = S.base.clone().setY(y + S.v.H - 4);
    if (S.heat > 0) {
      // the smoke column and the lava fountain
      if (Math.random() < dt * 8) D.flames.puff(crater.clone().add(V(rnd(-8, 8), rnd(0, 10), rnd(-8, 8))), rnd(20, 40));
      if (Math.random() < dt * 30) D.fx.burst(D.fx.mats.spark, crater, 3, { speed: [20, 60], size: [0.8, 1.8], life: [0.8, 1.6], gravity: 0.6, dir: V(0, 1, 0), cone: 0.4 });
    }
    S.next -= dt;
    if (S.heat >= 1 && S.next <= 0 && t < dur - 7) {
      S.next = rnd(0.35, 1.1) * Math.max(0.5, 1.2 - t / 80);
      const to = target(D, 0.3);
      const T = rnd(3.2, 4.2), g = 98;
      const vel = to.clone().sub(crater).multiplyScalar(1 / T); vel.y += 0.5 * g * T;
      if (Math.random() < 0.5) { D.shake(0.3); A.thunder(crater, false); }
      launch(D, S, crater.clone(), vel, rnd(2, 3.4), g, (at) => {
        D.explode(at, 7, 1.1);
        // a pool of lava that burns for a while
        const m = D.mark(at, 'lava', rnd(9, 14));
        S.pools.push({ m, at, r: 5.5, t: 10 });
        const near = D.st.near(at, 7); for (const p of near.slice(0, 2)) D.ignite(p);
      });
    }
    updateRocks(D, S, dt);
    for (const pool of [...S.pools]) {
      pool.t -= dt;
      pool.m.material.opacity = Math.min(1, pool.t / 3);
      if (Math.random() < dt * 4) D.fx.burst(D.fx.mats.spark, pool.at, 1, { speed: [1, 4], size: [0.3, 0.6], life: [0.3, 0.7], gravity: -0.2 });
      for (const ch of D.chars()) if (hdist(ch.rootPosition, pool.at) < pool.r && Math.abs(ch.rootPosition.y - 3 - pool.at.y) < 2.5) D.hurt(ch, 40 * dt, 'lava');
      if (pool.t <= 0) { D.world.scene.remove(pool.m); S.pools.splice(S.pools.indexOf(pool), 1); }
    }
  },
  stop(D, S) { S.v.dispose(); for (const rk of S.rocks) { rk.alive = false; D.world.scene.remove(rk.mesh); } for (const p of S.pools) D.world.scene.remove(p.m); A.stop('rumble'); },
};

// --- thunderstorm ---------------------------------------------------------------------------------------------------------------------
const storm = {
  id: 'thunder', name: 'Thunderstorm', icon: '⚡', color: '#e8e070', duration: 50, bots: 'inside',
  tip: 'Lightning strikes tall things - and you!',
  start(D, S) {
    S.next = 3;
    D.sky.set({ dome: 1, fog: 0x3a4048, near: 60, far: 520, amb: 0.4, sun: 0.2, tint: 0x8a909a });
    D.weather.set('rain', 1);
    A.rain(0.3); A.wind(0.12);
  },
  update(D, S, dt, t) {
    D.weather.wind.set(12, 0, 6);
    S.next -= dt;
    if (S.next > 0 || t > this.duration - 2) return;
    S.next = rnd(0.9, 2.6);
    // people, tall things and random spots
    let at;
    const r = Math.random(), people = D.chars();
    if (r < 0.38 && people.length) { const p = pick(people).rootPosition; at = V(p.x + rnd(-3, 3), 0, p.z + rnd(-3, 3)); }
    else if (r < 0.7) { const tall = [...D.st.parts].filter((p) => p.anchored && !p.destroyed).sort((a, b) => b.mesh.position.y - a.mesh.position.y).slice(0, 12); const p = pick(tall); at = p ? p.mesh.position.clone() : target(D, 0); }
    else at = target(D, 0);
    at.y = groundY(D, at.x, at.z);
    lightningBolt(D.world, at);
    D.sky.flash = 1;
    const cam = D.world.camera.position, dist = cam.distanceTo(at);
    if (dist < 140) A.thunder(at, true); else setTimeout(() => A.thunder(at, false), Math.min(3000, dist * 6));
    D.fx.burst(D.fx.mats.spark, at, 30, { speed: [8, 30], size: [0.15, 0.4], life: [0.3, 0.8], gravity: 0.8 });
    D.mark(at, 'scorch', 7);
    for (const ch of D.chars()) {
      const d = ch.rootPosition.distanceTo(at);
      if (d < 6) D.kill(ch, at, 'lightning');
      else if (d < 11) D.hurt(ch, 40, 'lightning');
    }
    for (const p of D.st.near(at, 6)) { D.collapse(p, V(rnd(-10, 10), 30, rnd(-10, 10))); if (Math.random() < 0.4) D.ignite(p); }
    D.shake(Math.max(0, 1 - dist / 120) * 0.6);
  },
  stop() { A.stop('rain'); A.stop('wind'); },
};

// --- fire -----------------------------------------------------------------------------------------------------------------------------
const fire = {
  id: 'fire', name: 'Fire', icon: '🔥', color: '#ff6a1a', duration: 60, bots: 'open',
  tip: 'Stay away from the flames!',
  start(D) {
    const parts = [...D.st.parts].filter((p) => p.anchored && !p.destroyed && !p.userData.fixed && p.name !== 'Glass');
    for (let i = 0; i < 4; i++) { const p = pick(parts); if (p) D.ignite(p); }
    D.sky.set({ dome: 0.3, fog: 0x8a7a6a, near: 120, far: 900, amb: 0.85, sun: 0.75, tint: 0xd0a080 });
    A.crackle(0.1);
  },
  update(D, S, dt, t) {
    // a fresh outbreak now and then
    if (Math.random() < dt * 0.12 && t < this.duration - 10) { const parts = [...D.st.parts].filter((p) => p.anchored && !p.destroyed && !p.userData.fixed); const p = pick(parts); if (p) D.ignite(p); }
  },
  stop() { },
};

// --- acid rain -------------------------------------------------------------------------------------------------------------------------
const acid = {
  id: 'acid', name: 'Acid Rain', icon: '☢️', color: '#9aff3a', duration: 52, bots: 'inside',
  tip: 'Get under a roof!',
  start(D, S) {
    S.eating = []; S.marks = [];
    D.sky.set({ dome: 0.8, fog: 0x8a9a5a, near: 70, far: 600, amb: 0.65, sun: 0.45, tint: 0xb8e070 });
    D.weather.set('acid', 0.9);
    A.rain(0.2);
  },
  update(D, S, dt) {
    // it eats through roofs
    // (it falls everywhere, but only what it lands on that can melt matters: aim at the buildings)
    if (!S.pool || S.poolT-- <= 0) { S.pool = [...D.st.parts].filter((p) => p.anchored && !p.userData.fixed && !p.destroyed); S.poolT = 60; }
    if (S.pool.length && Math.random() < dt * 9) {
      const q = pick(S.pool), x = q.mesh.position.x + rnd(-2, 2), z = q.mesh.position.z + rnd(-2, 2);
      const hit = D.world.raycast(V(x, 200, z), V(x, -10, z), { mask: GROUP.WORLD });
      const p = hit?.part;
      if (p && p.structure && p.anchored && !p.userData.eaten && !p.userData.fixed) {
        p.userData.eaten = true;
        p.structure.detach(p);
        const mat = (Array.isArray(p.mesh.material) ? p.mesh.material[0] : p.mesh.material).clone();
        p.mesh.material = mat;
        S.eating.push({ p, t: 0, mat, c0: mat.color.clone() });
      }
    }
    for (const e of [...S.eating]) {
      e.t += dt;
      e.mat.color.copy(e.c0).lerp(new THREE.Color(0x7aff2a), Math.min(1, e.t / 3));
      if (Math.random() < dt * 4) D.fx.burst(D.fx.mats.dust, e.p.mesh.position.clone().setY(e.p.mesh.position.y + e.p.size.y / 2), 1, { speed: [1, 3], size: [0.6, 1.2], life: [0.5, 1], gravity: -0.1 });
      if (e.t > 5) { S.eating.splice(S.eating.indexOf(e), 1); if (Math.random() < 0.5) D.collapse(e.p); else D.st.remove(e.p); }
    }
    // puddles
    if (S.marks.length < 25 && Math.random() < dt * 0.8) { const p = target(D, 0); S.marks.push(D.mark(V(p.x, groundY(D, p.x, p.z), p.z), 'acid', rnd(4, 9))); }
    // and burns anyone out in it
    for (const ch of D.chars()) if (exposed(D, ch)) { D.hurt(ch, 9 * dt, 'acid'); ch.acidT = D.world.time; }
  },
  stop(D, S) { for (const m of S.marks) D.world.scene.remove(m); A.stop('rain'); },
};

// --- blizzard -----------------------------------------------------------------------------------------------------------------------------
const blizzard = {
  id: 'blizzard', name: 'Blizzard', icon: '❄️', color: '#bfe8ff', duration: 52, bots: 'inside',
  tip: 'Get inside before you freeze!',
  start(D, S) {
    S.a = Math.random() * Math.PI * 2; S.gust = 0;
    D.sky.set({ dome: 0.85, fog: 0xe4ecf2, near: 25, far: 260, amb: 1.1, sun: 0.5, tint: 0xeef4f8 });
    D.weather.set('snow', 1);
    A.wind(0.3);
    D.snow?.(true);
  },
  update(D, S, dt, t) {
    S.a += dt * 0.12;
    S.gust = 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1));
    const dir = V(Math.cos(S.a), 0, Math.sin(S.a));
    D.weather.wind.copy(dir).multiplyScalar(25 + 40 * S.gust);
    A.volume('wind', 0.3 + S.gust * 0.5);
    D.snowAmount = Math.min(1, t / 25);
    for (const ch of D.chars()) {
      if (!exposed(D, ch)) continue;
      ch.windPush = dir.clone().multiplyScalar(0.55 * S.gust);
      D.hurt(ch, 4.5 * dt, 'froze'); ch.coldT = D.world.time;
    }
    for (const p of D.world.dynamicParts) if (p.body && p.body.position.y < 80 && S.gust > 0.6) { p.body.velocity.x += dir.x * 20 * dt; p.body.velocity.z += dir.z * 20 * dt; }
    // the wind tears loose things away
    if (S.gust > 0.7 && Math.random() < dt * 2) { const loose = [...D.st.parts].filter((p) => p.userData.loose && p.anchored); const p = pick(loose); if (p) D.collapse(p, dir.clone().multiplyScalar(30)); }
  },
  stop(D) { for (const ch of D.chars()) ch.windPush = null; A.stop('wind'); D.snow?.(false); },
};

export const DISASTERS = [tornado, tsunami, flood, quake, meteor, volcano, storm, fire, acid, blizzard, jjk, chaos];
