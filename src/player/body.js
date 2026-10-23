import * as THREE from 'three';
import { SHADOW_LAYER } from '../world/vegetation/vegetation.js';

// An invisible stand-in body that only renders into the shadow maps, so at golden hour
// you see your own long shadow walk across the sand. Legs and arms swing with the stride.
export class BodyProxy {
  constructor() {
    const mat = new THREE.MeshBasicMaterial();
    this.parts = [];
    const part = (geo, parent, y) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      m.layers.set(SHADOW_LAYER);
      m.userData.depthMaterial = mat;
      m.frustumCulled = false;
      parent.add(m);
      this.parts.push(m);
      return m;
    };
    this.root = new THREE.Group();
    part(new THREE.CapsuleGeometry(0.16, 0.48, 4, 10), this.root, 1.2);
    part(new THREE.SphereGeometry(0.11, 12, 8), this.root, 1.62);
    const limb = (x, y, radius, length) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      this.root.add(pivot);
      part(new THREE.CapsuleGeometry(radius, length, 3, 8), pivot, -length / 2 - radius);
      return pivot;
    };
    this.legL = limb(-0.1, 0.9, 0.07, 0.72);
    this.legR = limb(0.1, 0.9, 0.07, 0.72);
    this.armL = limb(-0.24, 1.42, 0.045, 0.52);
    this.armR = limb(0.24, 1.42, 0.045, 0.52);
    this.flyPose = 0;
    this.flyHeading = 0;
  }

  update(player, dt = 0.016) {
    const r = this.root;
    // In flight the body stretches out along the direction of travel, one fist forward.
    const v = player.vel;
    const horiz = Math.hypot(v.x, v.z);
    const target = player.flying ? Math.min(1, Math.max(0, (player.airspeed - 2) / 10)) : 0;
    this.flyPose += (target - this.flyPose) * (1 - Math.exp(-dt * 3));
    const pose = this.flyPose;
    if (horiz > 1) this.flyHeading = Math.atan2(v.x, -v.z);
    const heading = pose > 0.01 ? this.flyHeading : player.yaw;
    const climb = Math.atan2(v.y, Math.max(horiz, 1e-3));
    // Level flight lies flat; climbing turns upright, diving turns head-down.
    const tilt = -pose * (Math.PI / 2 - climb * pose);
    r.rotation.set(tilt, -heading, 0, 'YXZ');
    r.position.copy(player.feet);
    r.position.y -= player.sink * (1 - pose);
    // Keep the head near the eyes rather than pivoting about the feet.
    r.position.y += 1.5 * pose;
    if (pose > 0.01) {
      r.position.x -= Math.sin(this.flyHeading) * 1.5 * pose;
      r.position.z += Math.cos(this.flyHeading) * 1.5 * pose;
    }
    const amp = Math.min(1, player.speed / 1.7) * (player.speed > 3 ? 0.75 : 0.45);
    const swing = Math.sin(player.stride * Math.PI) * amp * (1 - pose);
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8 + 2.95 * pose;
    r.updateMatrixWorld(true);
  }
}
