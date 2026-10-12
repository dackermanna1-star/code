// First-person presentation: Mina's sleeve and hand holding the active wand (its procedural sprite
// extruded into voxels) or a flask. Rendered in its own pass so it never clips into terrain.
import * as THREE from 'three';
import { extrudeGrid, gridFromImage, voxelBox } from './spriteMesh';
import { wandSprite } from './art/wandSprite';
import { potionIcon } from './art/itemIcons';
import type { WandStats } from '../magic/types';

const PIX = 0.13; // world units per sprite pixel

export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private root = new THREE.Group();
  private arm: THREE.Mesh;
  private held = new THREE.Group();
  private heldMesh: THREE.Mesh | null = null;
  private material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private ambient = new THREE.AmbientLight(0xffffff, 2);
  private key = new THREE.DirectionalLight(0xffeedd, 2);
  private kickT = 0;
  private swapT = 0;
  private swayX = 0;
  private swayY = 0;
  private heldKey = '';
  /** muzzle offset in held-group local space */
  private muzzleLocal = new THREE.Vector3();
  private bobPhase = 0;
  visible = true;

  constructor(fov: number) {
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 50);
    this.scene.add(this.ambient);
    this.key.position.set(-1, 2, 1);
    this.scene.add(this.key);
    this.scene.add(this.root);
    this.root.scale.setScalar(0.33);
    // sleeve (purple robe) + hand
    const sleeve = voxelBox(4, 4, 11, 0.32, (x, y, z) => {
      if (z > 9 && (x === 0 || x === 3 || y === 0 || y === 3)) return '#3a2450';
      if (z >= 10) return null;
      return (x + y + z) % 5 === 0 ? '#4c3068' : '#5a3a7c';
    });
    this.arm = new THREE.Mesh(sleeve, this.material);
    this.arm.position.set(1.85, -1.75, -1.2);
    this.arm.rotation.set(0.25, 0.32, 0);
    this.root.add(this.arm);
    const hand = new THREE.Mesh(voxelBox(3, 3, 3, 0.3, () => '#d9a07a'), this.material);
    hand.position.set(0, 0.05, -1.95);
    this.arm.add(hand);
    this.held.position.set(1.32, -1.08, -3.0);
    this.root.add(this.held);
  }

  resize(aspect: number, fov: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  setWand(stats: WandStats | null): void {
    const key = stats ? `w${stats.spriteSeed}-${stats.capacity}-${stats.actionsPerRound}` : 'none';
    if (key === this.heldKey) return;
    this.heldKey = key;
    this.clearHeld();
    if (!stats) return;
    const img = wandSprite(stats.spriteSeed, stats);
    const geo = extrudeGrid(gridFromImage(img), PIX, 2);
    const m = new THREE.Mesh(geo, this.material);
    // sprite +x (tip) points forward (-z); handle sits in the hand
    m.rotation.set(0, Math.PI / 2 + 0.32, 0);
    m.rotation.order = 'YXZ';
    m.rotateZ(0.22);
    const half = (img.w * PIX) / 2;
    m.position.set(0, 0.15, -half + 0.6);
    this.held.add(m);
    this.heldMesh = m;
    // muzzle: the sprite's tip in mesh space
    this.muzzleLocal.set(half, 0.1, 0);
    this.swapT = 1;
  }

  setPotion(colorHex: string | null, fill: number): void {
    const key = `p${colorHex}-${Math.round(fill * 10)}`;
    if (key === this.heldKey) return;
    this.heldKey = key;
    this.clearHeld();
    const img = potionIcon(colorHex, fill);
    const geo = extrudeGrid(gridFromImage(img), 0.07, 3);
    const m = new THREE.Mesh(geo, this.material);
    m.position.set(-0.3, 0.55, -0.4);
    m.rotation.set(0, -0.3, 0);
    this.held.add(m);
    this.heldMesh = m;
    this.muzzleLocal.set(0, 0.9, 0);
    this.swapT = Math.max(this.swapT, 0.6);
  }

  setEmpty(): void {
    if (this.heldKey === 'empty') return;
    this.heldKey = 'empty';
    this.clearHeld();
  }

  private clearHeld(): void {
    if (this.heldMesh) {
      this.held.remove(this.heldMesh);
      this.heldMesh.geometry.dispose();
      this.heldMesh = null;
    }
  }

  kick(strength = 1): void {
    this.kickT = Math.min(1.5, this.kickT + strength);
  }

  update(dt: number, speed: number, onGround: boolean, lookDX: number, lookDY: number, light: THREE.Color, hurt: number): void {
    this.kickT = Math.max(0, this.kickT - dt * 7);
    this.swapT = Math.max(0, this.swapT - dt * 4);
    this.swayX += (-lookDX * 0.0008 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (lookDY * 0.0008 - this.swayY) * Math.min(1, dt * 10);
    if (onGround && speed > 1) this.bobPhase += dt * speed * 0.55;
    const bob = onGround ? Math.min(1, speed / 19) : 0;
    const bx = Math.sin(this.bobPhase) * 0.12 * bob;
    const by = -Math.abs(Math.cos(this.bobPhase)) * 0.1 * bob;
    const k = this.kickT;
    this.root.position.set(0.2 + bx * 0.35 + this.swayX * 3, -0.12 + by * 0.35 - this.swapT * 1.1 + this.swayY * 3 - hurt * 0.12, 0.3 + k * 0.18);
    this.root.rotation.set(k * 0.12 + this.swayY, this.swayX, 0);
    // three.js Lambert divides by PI: scale intensities so 1.0 means "full brightness"
    this.ambient.color.copy(light);
    this.ambient.intensity = Math.PI * 0.85;
    this.key.intensity = Math.PI * (0.25 + light.r * 0.35);
    this.root.visible = this.visible;
  }

  /** World-space muzzle position given the main camera (view model shares its pose). */
  muzzleWorld(mainCam: THREE.Camera, out: THREE.Vector3): THREE.Vector3 {
    out.copy(this.muzzleLocal);
    const ref = this.heldMesh ?? this.held;
    ref.updateWorldMatrix(true, false);
    out.applyMatrix4(ref.matrixWorld); // view-model space == camera space
    return out.applyMatrix4(mainCam.matrixWorld);
  }
}
