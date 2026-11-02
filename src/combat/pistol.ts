import * as THREE from 'three';
import { B } from '../anim/skeleton';
import type { Fighter } from './fighter';

/**
 * Scarlet's pistol: a compact semi-automatic with a suppressor screwed onto the barrel, built from
 * boxes and a cylinder like the melee weapons. It lives in her right hand only while she uses it
 * (drawn from her hip, holstered after). A shot shows a faint flash at the end of the can and a
 * thin tracer for a few frames.
 */
export class Pistol {
  group = new THREE.Group();
  /** Muzzle, in the pistol's own frame (+Z down the barrel, +Y the top of the slide). */
  private muzzle = new THREE.Vector3(0, 0.014, 0.3);
  private tracer: THREE.Line;
  private tracerMat = new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  private flash: THREE.Mesh;
  private flashMat = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  private tracerT = 0;
  private flashT = 0;
  out = false;

  constructor(scene: THREE.Scene) {
    const metal = new THREE.MeshStandardMaterial({ color: 0x1c1d21, metalness: 0.85, roughness: 0.34 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x2b2623, metalness: 0.1, roughness: 0.85 });
    const box = (w: number, h: number, l: number, m: THREE.Material, x: number, y: number, z: number, rx = 0) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m);
      b.position.set(x, y, z);
      b.rotation.x = rx;
      b.castShadow = true;
      this.group.add(b);
      return b;
    };
    box(0.028, 0.032, 0.2, metal, 0, 0.016, 0.05); // slide
    box(0.022, 0.016, 0.03, metal, 0, 0.014, 0.142); // barrel bushing
    box(0.026, 0.11, 0.042, grip, 0, -0.048, -0.022, -0.26); // grip, raked back
    box(0.024, 0.016, 0.1, metal, 0, -0.008, 0.035); // frame / dust cover
    box(0.006, 0.024, 0.046, metal, 0, -0.024, 0.03); // trigger guard
    box(0.006, 0.006, 0.012, metal, 0, 0.036, 0.13); // front sight
    // the suppressor: a matte can, a little fatter than the slide, with a knurled ring at its base
    const can = new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.55, roughness: 0.62 });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0175, 0.0175, 0.14, 14), can);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.014, 0.228);
    tube.castShadow = true;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0195, 0.0195, 0.014, 14), metal);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.014, 0.164);
    this.group.add(tube, ring);
    // muzzle flash: two crossed quads, flared out of the barrel
    // (suppressed: a small, dim flash at the end of the can)
    const fg = new THREE.PlaneGeometry(0.05, 0.08);
    fg.translate(0, 0.04, 0);
    fg.rotateX(Math.PI / 2);
    this.flash = new THREE.Mesh(fg, this.flashMat);
    const f2 = new THREE.Mesh(fg, this.flashMat);
    f2.rotation.z = Math.PI / 2;
    this.flash.add(f2);
    this.flash.position.copy(this.muzzle);
    this.flash.renderOrder = 12;
    this.group.add(this.flash);
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.tracer = new THREE.Line(geo, this.tracerMat);
    this.tracer.frustumCulled = false;
    this.tracer.renderOrder = 11;
    this.tracer.visible = false;
    scene.add(this.tracer);
  }

  /** In the right hand: down the barrel along the fingers, the top of the slide on the thumb side. */
  attach(f: Fighter) {
    const hand = f.model.bones[B.handR];
    hand.add(this.group);
    const u = f.def.restDir[B.handR].clone().normalize();
    const v = f.def.restUp[B.handR].clone().normalize();
    const thumb = new THREE.Vector3().crossVectors(u, v).multiplyScalar(-1).normalize();
    const x = new THREE.Vector3().crossVectors(thumb, u).normalize();
    this.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, thumb, u));
    // the grip sits in the fist, the slide just above the knuckles
    this.group.position.copy(u).multiplyScalar(0.07 * f.scale).addScaledVector(thumb, 0.012 * f.scale).addScaledVector(v, -0.012 * f.scale);
    this.group.scale.setScalar(f.scale);
    this.out = true;
  }

  detach() {
    this.group.removeFromParent();
    this.out = false;
    this.flashT = 0;
    this.flashMat.opacity = 0;
  }

  /** The muzzle in the world. */
  muzzleWorld(out: THREE.Vector3) {
    this.group.updateMatrixWorld(true);
    return out.copy(this.muzzle).applyMatrix4(this.group.matrixWorld);
  }

  /** A shot from the muzzle to `to`: flash and tracer. */
  fire(to: THREE.Vector3) {
    const from = this.muzzleWorld(new THREE.Vector3());
    const pos = this.tracer.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    this.tracer.visible = true;
    this.tracerT = 0.06;
    this.flashT = 0.05;
    this.flash.rotation.y = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.5);
    return from;
  }

  update(dt: number) {
    if (this.tracerT > 0) {
      this.tracerT -= dt;
      this.tracerMat.opacity = Math.max(0, this.tracerT / 0.06) * 0.45;
      if (this.tracerT <= 0) this.tracer.visible = false;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flashMat.opacity = Math.max(0, this.flashT / 0.05) * 0.55;
    } else this.flashMat.opacity = 0;
  }
}
