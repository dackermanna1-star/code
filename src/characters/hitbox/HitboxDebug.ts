// Debug overlay: draws every character's hitbox capsules (color per zone) using instanced meshes.
import * as THREE from 'three';
import type { GameContext } from '../../core/GameContext';
import { Priority } from '../../core/Engine';
import type { HitZone } from '../../core/types';
import type { CharacterRegistry } from '../CharacterRegistry';

const ZONE_COLORS: Record<HitZone, number> = {
  head: 0xff2020,
  neck: 0xff8020,
  chest: 0xffe020,
  stomach: 0x80ff20,
  pelvis: 0x20ffa0,
  arm: 0x20c0ff,
  hand: 0x2060ff,
  leg: 0xa040ff,
  foot: 0xff40c0,
};

const MAX = 4096;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _col = new THREE.Color();

export class HitboxDebug {
  private enabled = false;
  private cylinders: THREE.InstancedMesh | null = null;
  private spheres: THREE.InstancedMesh | null = null;
  private readonly ctx: GameContext;
  private readonly registry: CharacterRegistry;

  constructor(ctx: GameContext, registry: CharacterRegistry) {
    this.ctx = ctx;
    this.registry = registry;
    ctx.engine.addSystem({ name: 'hitboxDebug', priority: Priority.Animation + 5, update: () => this.update() });
  }

  setEnabled(on: boolean): boolean {
    this.enabled = on;
    if (on && !this.cylinders) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false, wireframe: false });
      this.cylinders = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), mat, MAX);
      this.spheres = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), mat, MAX * 2);
      for (const m of [this.cylinders, this.spheres]) {
        m.frustumCulled = false;
        m.renderOrder = 999;
        m.count = 0;
        this.ctx.scene.add(m);
      }
    }
    if (this.cylinders) this.cylinders.visible = on;
    if (this.spheres) this.spheres.visible = on;
    return on;
  }

  private update(): void {
    if (!this.enabled || !this.cylinders || !this.spheres) return;
    let ci = 0;
    let si = 0;
    for (const c of this.registry.list) {
      for (const h of c.getHitboxes()) {
        if (ci >= MAX) break;
        _col.setHex(ZONE_COLORS[h.zone]);
        _mid.addVectors(h.a, h.b).multiplyScalar(0.5);
        _dir.subVectors(h.b, h.a);
        const len = _dir.length();
        if (len > 1e-5) _q.setFromUnitVectors(_up, _dir.divideScalar(len));
        else _q.identity();
        _m.compose(_mid, _q, _s.set(h.radius, len, h.radius));
        this.cylinders.setMatrixAt(ci, _m);
        this.cylinders.setColorAt(ci, _col);
        ci++;
        for (const p of [h.a, h.b]) {
          _m.compose(p, _q.identity(), _s.setScalar(h.radius));
          this.spheres.setMatrixAt(si, _m);
          this.spheres.setColorAt(si, _col);
          si++;
        }
      }
    }
    this.cylinders.count = ci;
    this.spheres.count = si;
    this.cylinders.instanceMatrix.needsUpdate = true;
    this.spheres.instanceMatrix.needsUpdate = true;
    if (this.cylinders.instanceColor) this.cylinders.instanceColor.needsUpdate = true;
    if (this.spheres.instanceColor) this.spheres.instanceColor.needsUpdate = true;
  }
}
