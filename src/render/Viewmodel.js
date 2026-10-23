// The played soldier's arms and weapon in first person. They are drawn in a
// pass of their own after the scene (with the depth cleared, so the gun never
// sinks into a wall), lit by the scene's sun and sky. The weapon comes from
// the same primitives as the soldiers' and sways, bobs, kicks, dips for a
// reload and lowers for a sprint.

import * as THREE from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { weaponShapes, limb, ball, box, V, makeRagdollMaterial, M_UNIFORM, M_BOOT, M_GEAR } from './InfantryRenderer.js';

// Per weapon variant, in the soldier's model space (facing +Z, +X to his
// left): the rear sight, the muzzle and the two hands. hip and ads place the
// rear sight in front of the eye (camera space: x right, y up, -z ahead);
// fov is the view while aiming.
const VARIANTS = [
  { sight: [-0.085, 1.432, 0.24], muzzle: [-0.085, 1.345, 0.86], grip: [-0.085, 1.24, 0.31], fore: [-0.085, 1.3, 0.56], post: 0.78, hip: [0.17, -0.16, -0.34], ads: [0, -0.002, -0.3], fov: 46 },
  { sight: [-0.085, 1.392, 0.16], muzzle: [-0.085, 1.35, 1.02], grip: [-0.115, 1.24, 0.3], fore: [-0.085, 1.3, 0.62], post: 0.95, hip: [0.18, -0.17, -0.36], ads: [0, -0.002, -0.32], fov: 48 },
  { sight: [-0.085, 1.42, 0.2], muzzle: [-0.085, 1.345, 1.1], grip: [-0.085, 1.25, 0.3], fore: [-0.085, 1.31, 0.6], hip: [0.17, -0.16, -0.34], ads: [0, 0, -0.16], fov: 14 },
  { sight: [-0.13, 1.5, 0.05], muzzle: [-0.13, 1.5, 0.66], grip: [-0.13, 1.4, 0.2], fore: [-0.13, 1.46, 0.42], hip: [0.19, -0.11, -0.14], ads: [0.1, -0.05, -0.1], fov: 44 },
  { sight: [-0.14, 1.52, 0.0], muzzle: [-0.14, 1.52, 0.74], grip: [-0.06, 1.42, 0.15], fore: [-0.14, 1.46, 0.4], hip: [0.2, -0.11, -0.12], ads: [0.13, -0.06, -0.1], fov: 32 },
  { sight: [-0.1, 1.362, 0.22], muzzle: [-0.1, 1.32, 0.35], grip: [-0.1, 1.25, 0.24], fore: [-0.085, 1.25, 0.26], hip: [0.14, -0.15, -0.36], ads: [0, -0.01, -0.32], fov: 54 },
];

export const VIEW_VARIANTS = VARIANTS;

// Forearms from below the view to the hands on the weapon (the upper arms
// would only swing into view when the weapon tilts).
function armShapes(v) {
  const d = VARIANTS[v];
  const grip = V(...d.grip);
  const fore = V(...d.fore);
  const elR = V(grip.x - 0.17, grip.y - 0.16, grip.z - 0.2);
  const elL = V(fore.x + 0.14, fore.y - 0.2, fore.z - 0.24);
  const parts = [];
  parts.push(limb(elR, grip, 0.052, 0.042, 8, 2, M_UNIFORM));
  parts.push(limb(elL, fore, 0.052, 0.042, 8, 2, M_UNIFORM));
  // Gloves and a watch strap.
  parts.push(ball(0.047, grip.x, grip.y, grip.z, 1, 2, M_BOOT, 1.1));
  parts.push(ball(0.047, fore.x, fore.y - 0.02, fore.z, 1, 2, M_BOOT, 1.1));
  parts.push(box(0.03, 0.095, 0.05, elL.x * 0.25 + fore.x * 0.75 + 0.01, elL.y * 0.25 + fore.y * 0.75, elL.z * 0.25 + fore.z * 0.75, 2, M_GEAR));
  return parts;
}

// Draws a scene over what is already in the buffer, depth cleared first.
class OverlayPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
  }

  render(renderer, writeBuffer, readBuffer) {
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = auto;
  }
}

const _m = new THREE.Vector3();

export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 30);
    this.scene.add(this.camera);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(this.sun, this.sun.target, this.hemi);
    // root: placement in front of the eye; inner: model space -> camera space
    // around the rear sight.
    this.root = new THREE.Group();
    this.inner = new THREE.Group();
    this.inner.rotation.y = Math.PI;
    this.root.add(this.inner);
    this.camera.add(this.root);
    this.pass = new OverlayPass(this.scene, this.camera);
    this.pass.enabled = false;
    this.meshes = new Map();
    this.materials = [makeRagdollMaterial(0), makeRagdollMaterial(1)];
    this.current = null;
    this.variant = -1;
    this.faction = -1;
  }

  // One instanced mesh (count 1) per variant and faction, for the soldiers'
  // camouflage material.
  mesh(v, faction) {
    const key = v * 2 + faction;
    let m = this.meshes.get(key);
    if (m) return m;
    const d = VARIANTS[v];
    // Iron sights for the rifle and the machine gun: a rear aperture (two
    // ears either side of the line of sight) and a front post rising to it.
    const shapes = [...weaponShapes(v, d.post ? 1 : 0), ...armShapes(v)];
    if (d.post) {
      const [x, y, z] = d.sight;
      for (const s of [-1, 1]) shapes.push(box(0.007, 0.032, 0.02, x + s * 0.013, y - 0.016, z + 0.02, 2, M_GEAR));
      shapes.push(box(0.03, 0.012, 0.03, x, y - 0.034, z + 0.02, 2, M_GEAR));
      shapes.push(box(0.006, y - d.muzzle[1] - 0.002, 0.01, x, (y + d.muzzle[1]) / 2 - 0.001, d.post, 2, M_GEAR));
    }
    const geo = mergeGeometries(shapes, false);
    geo.setAttribute('aRag', new THREE.InstancedBufferAttribute(new Float32Array([0.37, 0]), 2));
    m = new THREE.InstancedMesh(geo, this.materials[faction], 1);
    m.setMatrixAt(0, new THREE.Matrix4());
    m.frustumCulled = false;
    this.meshes.set(key, m);
    return m;
  }

  // Show the weapon variant v for a soldier of a faction; seed varies the camo.
  set(v, faction, seed) {
    if (v !== this.variant || faction !== this.faction) {
      if (this.current) this.inner.remove(this.current);
      this.current = this.mesh(v, faction);
      this.inner.add(this.current);
      this.variant = v;
      this.faction = faction;
    }
    const a = this.current.geometry.getAttribute('aRag');
    if (a.array[0] !== seed) {
      a.array[0] = seed;
      a.needsUpdate = true;
    }
    const s = VARIANTS[v].sight;
    this.inner.position.set(s[0], -s[1], s[2]);
  }

  // Place the weapon: pos (camera space) for the rear sight, then extra
  // pitch/yaw/roll. Matches the main camera so screen positions agree.
  update(mainCam, pos, pitch, yaw, roll, sky) {
    const c = this.camera;
    c.position.copy(mainCam.position);
    c.quaternion.copy(mainCam.quaternion);
    if (c.fov !== mainCam.fov || c.aspect !== mainCam.aspect) {
      c.fov = mainCam.fov;
      c.aspect = mainCam.aspect;
      c.updateProjectionMatrix();
    }
    this.root.position.copy(pos);
    this.root.rotation.set(pitch, yaw, roll, 'YXZ');
    if (sky) {
      this.sun.color.copy(sky.sun.color);
      this.sun.intensity = sky.sun.intensity;
      const d = sky.sun.position.clone().sub(sky.sun.target.position).normalize();
      this.sun.position.copy(c.position).add(d);
      this.sun.target.position.copy(c.position);
      this.hemi.color.copy(sky.hemi.color);
      this.hemi.groundColor.copy(sky.hemi.groundColor);
      this.hemi.intensity = sky.hemi.intensity;
    }
    c.updateMatrixWorld(true);
    this.sun.target.updateMatrixWorld();
  }

  // World position of the muzzle (after update()).
  muzzle(out) {
    const m = VARIANTS[this.variant].muzzle;
    this.inner.updateMatrixWorld(true);
    return out.copy(_m.set(m[0], m[1], m[2])).applyMatrix4(this.inner.matrixWorld);
  }
}
