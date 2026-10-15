// Minimal visual used until (or instead of, if assets fail) the skinned model: a capsule body that follows
// the simulation with render interpolation and reflects stance/lean.
import * as THREE from 'three';
import type { Character } from '../Character';
import type { HitReaction, ICharacterVisual, PosePoints } from './types';
import { lerpAngle } from '../../core/math';

const _yAxis = new THREE.Vector3(0, 1, 0);

export class PlaceholderVisual implements ICharacterVisual {
  readonly root = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly c: Character;
  detailed = true;

  constructor(c: Character) {
    this.c = c;
    this.root.name = `char_${c.id}_placeholder`;
    const mat = new THREE.MeshStandardMaterial({ color: c.isPlayer ? 0x5577aa : 0x887755, roughness: 0.8 });
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.2, 4, 12), mat);
    this.body.castShadow = true;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.25), mat);
    nose.position.set(0, 0.55, 0.3);
    this.body.add(nose);
    this.root.add(this.body);
  }

  update(_dt: number, alpha: number): void {
    const c = this.c;
    this.root.position.lerpVectors(c.prevPosition, c.position, alpha);
    const yaw = lerpAngle(c.prevBodyYaw, c.bodyYaw, alpha);
    this.root.quaternion.setFromAxisAngle(_yAxis, yaw + Math.PI);
    const h = Math.max(0.6, c.stanceHeight);
    if (c.stance === 'prone' && c.mode === 'ground') {
      this.body.rotation.set(Math.PI / 2, 0, 0);
      this.body.position.set(0, 0.3, 0);
      this.body.scale.set(1, 1, 1);
    } else {
      this.body.rotation.set(0, 0, -c.lean * 0.3);
      this.body.scale.set(1, h / 1.8, 1);
      this.body.position.set(0, h / 2, 0);
    }
  }

  getPosePoints(): PosePoints | null {
    return null;
  }
  onWeaponChanged(): void {}
  refreshEquipment(): void {}
  hitReaction(_r: HitReaction): void {}
  die(): void {
    this.body.rotation.set(Math.PI / 2, 0, 0);
    this.body.position.set(0, 0.3, 0);
  }
  reset(): void {}
  getMuzzleWorld(): boolean {
    return false;
  }
  getSightEyeWorld(): boolean {
    return false;
  }
  getEyeWorld(): boolean {
    return false;
  }
  setFirstPerson(on: boolean): void {
    this.body.visible = !on;
  }
  setVisible(on: boolean): void {
    this.root.visible = on;
  }
  dispose(): void {
    this.root.removeFromParent();
    this.body.geometry.dispose();
  }
}
