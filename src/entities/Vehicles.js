// Abandoned vehicles: lazy visuals, rotated collision boxes, trunk / glovebox loot, car alarms.
import * as THREE from 'three';
import { createCarVisual } from './vehicles/CarModels.js';
import { generateLoot } from '../items/loot.js';
import { makeRng, hash32 } from '../core/rng.js';
import { rayBox } from '../world/raycast.js';

// fallback half extents (x = half width, y = half height, z = half length)
const DIMS = {
  sedan: [0.95, 0.75, 2.25], hatchback: [0.9, 0.75, 1.9], suv: [1.0, 0.95, 2.4], pickup: [1.05, 0.95, 2.7],
  van: [1.05, 1.15, 2.6], police: [0.95, 0.8, 2.3], ambulance: [1.15, 1.35, 3.0], military_truck: [1.25, 1.55, 3.6],
  humvee: [1.15, 0.95, 2.4], bus: [1.3, 1.6, 5.6], semi: [1.3, 1.9, 7.8], firetruck: [1.3, 1.6, 4.4], tractor: [1.0, 1.3, 1.8],
};
const VEHICLE_NAMES = {
  sedan: 'Sedan', hatchback: 'Hatchback', suv: 'SUV', pickup: 'Pickup Truck', van: 'Van', police: 'Police Cruiser', ambulance: 'Ambulance',
  military_truck: 'Military Truck', humvee: 'Humvee', bus: 'School Bus', semi: 'Semi Truck', firetruck: 'Fire Truck', tractor: 'Tractor',
};
export const vehicleName = (type) => VEHICLE_NAMES[type] || String(type).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const TRUNK_LOOT = { police: 'police_car_trunk', ambulance: 'ambulance', military_truck: 'military_truck', humvee: 'military_truck', pickup: 'pickup_bed', semi: 'truck_cargo' };

export class Vehicles {
  constructor(game) {
    this.game = game;
    this.list = game.world.vehicles.map((v, i) => {
      const d = DIMS[v.type] || DIMS.sedan;
      const yaw = v.yaw || 0;
      return {
        ...v, idx: i, visual: null, trunk: null, glove: null, alarmOn: 0, alarmUsed: false, alarmSound: null,
        collider: { x: v.x, z: v.z, cos: Math.cos(yaw), sin: Math.sin(yaw), hx: d[0], hz: d[2], bottom: v.y, top: v.y + d[1] * 2, r: Math.hypot(d[0], d[2]) },
      };
    });
    this.colliders = this.list.map((v) => v.collider);
    this.updateT = 0;
    this.tmp = new THREE.Vector3();
  }

  /** Colliders near a point (for physics) */
  nearColliders(x, z, r = 12) {
    const out = [];
    for (const c of this.colliders) if (Math.abs(c.x - x) < r + c.r && Math.abs(c.z - z) < r + c.r) out.push(c);
    return out;
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.updateT -= dt;
    if (this.updateT <= 0) {
      this.updateT = 0.5;
      for (const v of this.list) {
        const d = Math.hypot(v.x - p.x, v.z - p.z);
        if (d < 115 && !v.visual) {
          v.visual = createCarVisual({ type: v.type, color: v.color, wrecked: v.wrecked, burned: v.burned, seed: hash32(v.idx, 99) });
          v.visual.root.position.set(v.x, v.y, v.z);
          v.visual.root.rotation.y = v.yaw || 0;
          g.renderer.scene.add(v.visual.root);
          if (v.visual.halfExtents) {
            const he = v.visual.halfExtents;
            Object.assign(v.collider, { hx: he.x, hz: he.z, top: v.y + he.y * 2, r: Math.hypot(he.x, he.z) });
          }
          v.lightSet = false;
        } else if (d > 150 && v.visual) {
          g.renderer.scene.remove(v.visual.root);
          v.visual.dispose();
          v.visual = null;
        }
        if (v.visual && (!v.lightSet || d < 60)) {
          const w = g.world;
          const x = Math.floor(v.x), y = Math.floor(v.y + 1.2), z = Math.floor(v.z);
          v.visual.setLight(w.skyAt(x, y, z) / 15, w.blockLightAt(x, y, z) / 15);
          v.lightSet = true;
        }
      }
    }
    // alarms
    for (const v of this.list) {
      if (v.alarmOn > 0) {
        v.alarmOn -= dt;
        v.alarmNoiseT = (v.alarmNoiseT || 0) - dt;
        if (v.alarmNoiseT <= 0) { v.alarmNoiseT = 2; g.noise(v.x, v.y + 1, v.z, 55, 'alarm'); }
        if (Math.sin(g.clock * 12) > 0) g.addFlashLight(this.tmp.set(v.x, v.y + 1, v.z).clone(), 0xffa040, 1.5, 8, 0);
        if (v.visual) { v.visual.lights?.setHazards?.(true); v.visual.update?.(dt); }
        if (v.alarmOn <= 0) { v.alarmSound?.stop(); v.alarmSound = null; v.visual?.lights?.setHazards?.(false); }
      }
    }
  }

  triggerAlarm(v) {
    if (!v.alarm || v.alarmUsed || v.burned) return false;
    v.alarmUsed = true;
    v.alarmOn = 32;
    v.alarmSound = this.game.audio.loop('car_alarm', { pos: { x: v.x, y: v.y + 1, z: v.z }, volume: 1 });
    this.game.ui?.toast('A car alarm is blaring!', 'danger');
    this.game.noise(v.x, v.y + 1, v.z, 60, 'alarm');
    return true;
  }

  onShot(v) { if (Math.random() < 0.7) this.triggerAlarm(v); }
  onBump(v) { if (Math.random() < 0.25) this.triggerAlarm(v); }

  raycast(origin, dir, maxDist) {
    let best = null;
    for (const v of this.list) {
      const c = v.collider;
      const ox = origin.x - c.x, oz = origin.z - c.z;
      if (ox * ox + oz * oz > (maxDist + c.r) ** 2) continue;
      // into local space
      const lx = ox * c.cos - oz * c.sin, lz = ox * c.sin + oz * c.cos;
      const dx = dir.x * c.cos - dir.z * c.sin, dz = dir.x * c.sin + dir.z * c.cos;
      const h = rayBox(lx, origin.y, lz, dx, dir.y, dz, -c.hx, c.bottom + 0.15, -c.hz, c.hx, c.top, c.hz);
      if (h && h.t <= maxDist && (!best || h.t < best.dist)) {
        best = { v, dist: h.t, point: new THREE.Vector3(origin.x + dir.x * h.t, origin.y + dir.y * h.t, origin.z + dir.z * h.t) };
      }
    }
    return best;
  }

  lootDescs(v) {
    const g = this.game;
    const rng = makeRng(hash32(g.world.seed, v.idx, 4242));
    const opts = { scavenging: g.player.skillLevel('scavenging'), day: g.time.day };
    if (!v.trunk) {
      v.trunk = new Array(v.type === 'semi' ? 14 : 8).fill(null);
      if (!v.burned) generateLoot(v.loot || TRUNK_LOOT[v.type] || 'car_trunk', rng, { ...opts, size: v.trunk.length }).forEach((s, i) => { if (i < v.trunk.length) v.trunk[i] = s; });
    }
    if (!v.glove) {
      v.glove = new Array(3).fill(null);
      if (!v.burned && v.type !== 'semi' && v.type !== 'tractor') generateLoot(v.gloveLoot || 'car_glovebox', rng, { ...opts, size: 3 }).forEach((s, i) => { if (i < 3) v.glove[i] = s; });
    }
    const name = vehicleName(v.type);
    const bay = v.type === 'pickup' ? 'Truck Bed' : v.type === 'semi' ? 'Cargo Trailer' : v.type === 'ambulance' || v.type === 'van' || v.type === 'bus' || v.type === 'military_truck' ? 'Rear Compartment' : 'Trunk';
    const out = [{ key: 'veh:' + v.idx + ':t', name: `${bay} (${name}${v.burned ? ', burned out' : ''})`, kind: 'vehicle', slots: v.trunk }];
    if (v.type !== 'semi' && v.type !== 'tractor') out.push({ key: 'veh:' + v.idx + ':g', name: 'Glovebox', kind: 'vehicle', slots: v.glove });
    return out;
  }

  clear() {
    for (const v of this.list) {
      if (v.visual) { this.game.renderer.scene.remove(v.visual.root); v.visual.dispose(); v.visual = null; }
      v.alarmSound?.stop();
    }
  }

  toJSON() {
    return this.list.filter((v) => v.trunk || v.glove || v.alarmUsed).map((v) => ({ i: v.idx, t: v.trunk, g: v.glove, a: v.alarmUsed }));
  }
  load(arr) {
    for (const d of arr || []) {
      const v = this.list[d.i];
      if (!v) continue;
      v.trunk = d.t; v.glove = d.g; v.alarmUsed = d.a;
    }
  }
}
