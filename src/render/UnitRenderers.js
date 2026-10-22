// Instanced rendering of vehicles and aircraft. Every model part (hull,
// turret, gun, rotor...) of every type and faction is an InstancedMesh; per
// frame the visible units write their part matrices (composed from the specs
// pivots) and tints (wrecks are charred).

import * as THREE from 'three';
import { VEHICLE_SPECS, AIRCRAFT_SPECS } from '../sim/specs.js';
import { buildVehicleModel, buildAircraftModel } from './models/index.js';

const _hull = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
const _sphere = new THREE.Sphere();
const _col = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);
const CHAR = new THREE.Color(0.13, 0.12, 0.11);

export class PartBatch {
  constructor(scene, geometry, material, capacity = 32, opts = {}) {
    this.scene = scene;
    this.geometry = geometry;
    this.material = material;
    this.opts = opts;
    this.capacity = 0;
    this.count = 0;
    this.mesh = null;
    this.alloc(capacity);
  }

  alloc(capacity) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.dispose();
    }
    this.capacity = capacity;
    const m = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = !!this.opts.castShadow;
    m.receiveShadow = !!this.opts.receiveShadow;
    m.renderOrder = this.opts.renderOrder || 0;
    m.count = 0;
    this.mesh = m;
    this.scene.add(m);
  }

  begin() {
    this.count = 0;
  }

  push(matrix, color = WHITE) {
    if (this.count >= this.capacity) {
      // Grow: keep what was written this frame.
      const oldM = this.mesh.instanceMatrix.array.slice(0, this.count * 16);
      const oldC = this.mesh.instanceColor.array.slice(0, this.count * 3);
      this.alloc(this.capacity * 2);
      this.mesh.instanceMatrix.array.set(oldM);
      this.mesh.instanceColor.array.set(oldC);
    }
    const i = this.count++;
    matrix.toArray(this.mesh.instanceMatrix.array, i * 16);
    const c = this.mesh.instanceColor.array;
    c[i * 3] = color.r;
    c[i * 3 + 1] = color.g;
    c[i * 3 + 2] = color.b;
  }

  end() {
    const m = this.mesh;
    m.count = this.count;
    if (this.count) {
      m.instanceMatrix.clearUpdateRanges();
      m.instanceMatrix.addUpdateRange(0, this.count * 16);
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.clearUpdateRanges();
      m.instanceColor.addUpdateRange(0, this.count * 3);
      m.instanceColor.needsUpdate = true;
    }
  }
}

// Vehicle paint material: vertex colours, slight dirt toward the ground.
function vehicleMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.18 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.17, 0.12), (1.0 - smoothstep(0.0, 0.9, vH)) * 0.45);');
  };
  mat.customProgramCacheKey = () => 'vehicle-paint';
  return mat;
}

function emissiveMaterial() {
  return new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true });
}

function blurMaterial() {
  return new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
}

export class VehicleRenderer {
  constructor(scene, quality) {
    this.scene = scene;
    this.paint = vehicleMaterial();
    this.glow = emissiveMaterial();
    this.types = {};
    const shadows = !!quality.shadows;
    for (const type of Object.keys(VEHICLE_SPECS)) {
      this.types[type] = [0, 1].map((f) => {
        const { parts } = buildVehicleModel(type, f);
        const b = {};
        for (const [k, g] of Object.entries(parts)) {
          b[k] = new PartBatch(scene, g, k === 'emissive' ? this.glow : this.paint, 16, { castShadow: shadows && k !== 'emissive', receiveShadow: shadows });
        }
        return b;
      });
    }
    this.maxDist = 3200;
  }

  update(world, camera, frustum) {
    for (const t of Object.values(this.types)) for (const f of t) for (const b of Object.values(f)) b.begin();
    const cam = camera.position;
    const max2 = this.maxDist * this.maxDist;
    const draw = (v) => {
      if (v.removed) return;
      const s = v.spec;
      if (v.pos.distanceToSquared(cam) > max2) return;
      _sphere.center.set(v.pos.x, v.pos.y + s.height * 0.5, v.pos.z);
      _sphere.radius = s.length * 0.65;
      if (!frustum.intersectsSphere(_sphere)) return;
      const b = this.types[v.type][v.faction];
      const wreck = !v.alive;
      const tint = wreck ? _col.copy(WHITE).lerp(CHAR, Math.min(1, (v.deadT || 0) / 4 + 0.6)) : WHITE;
      _hull.compose(v.pos, v.quat, _one);
      b.hull.push(_hull, tint);
      // Turret: on the hull, or flying/lying on its own after a cook-off.
      let turret;
      if (v.turretOff) {
        turret = _m.compose(v.turretOff.pos, v.turretOff.quat, _one);
      } else {
        turret = _m.copy(_hull).multiply(_t.makeTranslation(s.turretPivot[0], s.turretPivot[1], s.turretPivot[2])).multiply(_r.makeRotationY(v.turretYaw));
      }
      b.turret.push(turret, tint);
      const recoil = v.type === 'mbt' || v.type === 'spg' ? Math.max(0, 1 - v.recoilT / 0.3) * 0.45 : 0;
      const gun = _t.copy(turret).multiply(_r.makeTranslation(s.gunPivot[0], s.gunPivot[1], s.gunPivot[2] - recoil)).multiply(_r.makeRotationX(-v.gunPitch));
      b.gun.push(gun, tint);
      if (b.radar && s.radarPivot) {
        const radar = _hull.copy(turret).multiply(_r.makeTranslation(s.radarPivot[0], s.radarPivot[1], s.radarPivot[2])).multiply(_t.makeRotationY(v.radarYaw));
        b.radar.push(radar, tint);
      }
      if (b.emissive && !wreck) {
        _hull.compose(v.pos, v.quat, _one);
        b.emissive.push(_hull, world.weather.isNight ? WHITE : _col.setRGB(0.5, 0.5, 0.5));
      }
    };
    for (const u of world.units) if (u.cat === 'veh') draw(u);
    for (const u of world.dead) if (u.cat === 'veh') draw(u);
    for (const t of Object.values(this.types)) for (const f of t) for (const b of Object.values(f)) b.end();
  }
}

export class AircraftRenderer {
  constructor(scene, quality) {
    this.scene = scene;
    this.paint = vehicleMaterial();
    this.glow = emissiveMaterial();
    this.blur = blurMaterial();
    this.types = {};
    const shadows = !!quality.shadows;
    for (const type of Object.keys(AIRCRAFT_SPECS)) {
      this.types[type] = [0, 1].map((f) => {
        const { parts } = buildAircraftModel(type, f);
        const b = {};
        for (const [k, g] of Object.entries(parts)) {
          const isBlur = k.endsWith('Blur');
          const mat = k === 'emissive' ? this.glow : isBlur ? this.blur : this.paint;
          b[k] = new PartBatch(scene, g, mat, type === 'fpv_drone' ? 32 : 8, { castShadow: shadows && !isBlur && k !== 'emissive', renderOrder: isBlur ? 5 : 0 });
        }
        return b;
      });
    }
  }

  update(world, camera, frustum, time) {
    for (const t of Object.values(this.types)) for (const f of t) for (const b of Object.values(f)) b.begin();
    const draw = (a) => {
      if (a.removed || a.hidden) return;
      const s = a.spec;
      _sphere.center.copy(a.pos);
      _sphere.radius = Math.max(2, s.length * 0.7);
      if (!frustum.intersectsSphere(_sphere)) return;
      const b = this.types[a.type][a.faction];
      const wreck = !a.alive && !a.dying;
      const tint = wreck ? _col.copy(CHAR) : a.smoking ? _col.setRGB(0.75, 0.72, 0.7) : WHITE;
      _hull.compose(a.pos, a.quat, _one);
      b.body.push(_hull, tint);
      if (wreck) return;
      // Rotors: blades turn at a slower "apparent" speed; blur discs carry the motion.
      const spin = a.rotor;
      if (b.rotor && s.rotorPivot) {
        const rm = _m.copy(_hull).multiply(_t.makeTranslation(s.rotorPivot[0], s.rotorPivot[1], s.rotorPivot[2]));
        b.rotor.push(_r.copy(rm).multiply(_t.makeRotationY(spin * 0.23)), tint);
        if (b.rotorBlur && !a.landed) b.rotorBlur.push(rm, WHITE);
      }
      if (b.tailRotor && s.tailRotorPivot) {
        const tm = _m.copy(_hull).multiply(_t.makeTranslation(s.tailRotorPivot[0], s.tailRotorPivot[1], s.tailRotorPivot[2]));
        b.tailRotor.push(_r.copy(tm).multiply(_t.makeRotationX(spin * 0.9)), tint);
        if (b.tailRotorBlur && !a.landed) b.tailRotorBlur.push(tm, WHITE);
      }
      if (b.propBlur) b.propBlur.push(_hull, WHITE);
      if (b.emissive) {
        // Navigation lights blink.
        const on = Math.sin(time * 6 + a.id) > -0.3;
        b.emissive.push(_hull, on ? WHITE : _col.setRGB(0.15, 0.15, 0.15));
      }
    };
    for (const u of world.units) if (u.cat === 'air') draw(u);
    for (const u of world.dead) if (u.cat === 'air') draw(u);
    for (const t of Object.values(this.types)) for (const f of t) for (const b of Object.values(f)) b.end();
  }
}
