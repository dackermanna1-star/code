// CharacterVisual: the skinned model of a Character with clip locomotion, procedural layers (stances,
// aim, lean, foot IK, weapon IK, gestures, special states), equipment attachments, ragdoll, animation LOD
// and pose capture for hitboxes. Until the asset library is ready it shows the placeholder capsule.
import * as THREE from 'three';
import { ctx } from '../../core/GameContext';
import { clamp, lerpAngle, wrapAngle } from '../../core/math';
import type { DamageInfo } from '../../core/types';
import type { Character } from '../Character';
import type { CharacterLibrary, ModelInstance } from './CharacterLibrary';
import { Locomotion, type LocoInput } from './Locomotion';
import { ProceduralAnimator, type AnimFrameState } from './ProceduralAnimator';
import { WeaponPose } from './WeaponPose';
import { createWeaponVisual, holdStyleFor, type WeaponVisual } from './WeaponModels';
import { SpecialPoses } from './SpecialPoses';
import { Equipment } from './Equipment';
import { Ragdoll } from './Ragdoll';
import { ParachuteVisual } from './Parachute';
import { PlaceholderVisual } from './PlaceholderVisual';
import { installFirstPersonClip, makeClipUniforms, type ClipUniforms } from './FirstPersonClip';
import type { HitReaction, ICharacterVisual, PosePoints, PoseJoint } from './types';
import { JOINT_COUNT, POSE_JOINTS } from './types';
import type { BoneKey } from './Rig';
import type { ClipKind } from './Clips';

const JOINT_BONES: Record<PoseJoint, BoneKey[]> = {
  hips: ['hips'],
  spine: ['spine'],
  chest: ['chest', 'spine'],
  upperChest: ['upperChest', 'chest'],
  neck: ['neck'],
  head: ['head'],
  headTop: ['headTop'],
  upperArmL: ['upperArmL'],
  lowerArmL: ['lowerArmL'],
  handL: ['handL'],
  fingersL: ['middle1L', 'index1L'],
  upperArmR: ['upperArmR'],
  lowerArmR: ['lowerArmR'],
  handR: ['handR'],
  fingersR: ['middle1R', 'index1R'],
  upperLegL: ['upperLegL'],
  lowerLegL: ['lowerLegL'],
  footL: ['footL'],
  toesL: ['toesL', 'toeEndL'],
  upperLegR: ['upperLegR'],
  lowerLegR: ['lowerLegR'],
  footR: ['footR'],
  toesR: ['toesR', 'toeEndR'],
};

const _yAxis = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);
const _sphere = new THREE.Sphere();
const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();
let frustumFrame = -1;

/** Debug switches (window.__game.animDebug) to isolate animation layers. */
export const animDebug = { noProc: false, noWeaponIK: false, noLegs: false, noAim: false };

function cameraFrustum(): THREE.Frustum {
  if (frustumFrame !== ctx.engine.frame) {
    frustumFrame = ctx.engine.frame;
    const cam = ctx.camera;
    cam.updateMatrixWorld();
    _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
  }
  return _frustum;
}

export class CharacterVisual implements ICharacterVisual {
  readonly root = new THREE.Group();
  detailed = false;
  private readonly c: Character;
  private readonly lib: CharacterLibrary;
  private placeholder: PlaceholderVisual | null;
  private inst: ModelInstance | null = null;
  private loco: Locomotion | null = null;
  private proc: ProceduralAnimator | null = null;
  private weaponPose: WeaponPose | null = null;
  private special: SpecialPoses | null = null;
  private equipment: Equipment | null = null;
  private ragdoll: Ragdoll | null = null;
  private chute: ParachuteVisual | null = null;
  private held: WeaponVisual | null = null;
  private heldUid = -1;
  private readonly points = new Float32Array(JOINT_COUNT * 3);
  private hasPose = false;
  private animAccum = 0;
  private sinceAnim = 1e9;
  private fpp = false;
  private clip: ClipUniforms | null = null;
  private fppPatched = false;
  private visible = true;
  private dead = false;
  private lodLevel = 0;
  private readonly frameState: AnimFrameState;
  private readonly locoIn: LocoInput = { stance: 'stand', style: 'unarmed', localVel: new THREE.Vector2(), special: null, sprinting: false };
  /** Visual body yaw (turn-in-place smoothing for the player). */
  private visYaw = 0;

  constructor(c: Character, lib: CharacterLibrary) {
    this.c = c;
    this.lib = lib;
    this.root.name = `character_${c.id}`;
    this.placeholder = new PlaceholderVisual(c);
    this.root.add(this.placeholder.root);
    this.visYaw = c.bodyYaw;
    this.frameState = { dt: 0, bodyYaw: 0, aimYaw: 0, aimPitch: 0, loco: null!, near: false };
    lib.onReady(() => this.build());
  }

  private build(): void {
    if (this.inst || this.dead) return;
    const inst = this.lib.instantiate(this.c.variant);
    if (!inst || !inst.rig.ok) return;
    this.inst = inst;
    // Measure the rig at identity, then attach under the root.
    const tmp = new THREE.Group();
    tmp.add(inst.container);
    inst.rig.measure(tmp);
    tmp.remove(inst.container);
    this.root.add(inst.container);
    if (this.placeholder) {
      this.root.remove(this.placeholder.root);
      this.placeholder.dispose();
      this.placeholder = null;
    }
    this.loco = new Locomotion(inst.model, this.lib, (this.c.id * 0.137) % 1);
    this.proc = new ProceduralAnimator(this.c, inst.rig);
    this.weaponPose = new WeaponPose(this.c, inst.rig, this.proc.pc);
    this.special = new SpecialPoses(this.c, inst.rig, this.proc, this.proc.pc);
    this.equipment = new Equipment(this.c, inst.rig, this.root);
    this.equipment.refresh();
    this.onWeaponChanged();
    this.setVisible(this.visible);
  }

  // ── per frame ──────────────────────────────────────────────────────────────
  update(dt: number, alpha: number): void {
    const c = this.c;
    this.placeTransform(alpha);
    if (!this.inst) {
      this.placeholder?.update(dt, alpha);
      this.detailed = true;
      return;
    }
    if (!this.visible) return;

    // ── LOD / culling ──
    const cam = ctx.camera.position;
    const d = cam.distanceTo(this.root.position);
    _sphere.center.copy(this.root.position).setY(this.root.position.y + 0.9);
    _sphere.radius = 1.4;
    const inView = c.isPlayer || cameraFrustum().intersectsSphere(_sphere);
    this.inst.container.visible = inView;
    let interval: number;
    if (c.isPlayer || this.dead) interval = 0;
    else if (!inView) interval = 0.25;
    else if (d < 30) interval = 0;
    else if (d < 60) interval = 1 / 30;
    else if (d < 120) interval = 1 / 15;
    else if (d < 300) interval = 1 / 8;
    else interval = 1 / 4;
    // Stance/life changes force an update so hitboxes stay correct.
    if (c.stanceProgress < 1 || c.mode === 'traversal') interval = Math.min(interval, 1 / 15);
    this.detailed = inView && d < 40;
    this.setLod(d > 50 && !c.isPlayer ? 1 : 0);

    this.animAccum += dt;
    this.sinceAnim += dt;
    if (this.sinceAnim < interval) return;
    const adt = Math.min(0.25, this.animAccum);
    this.animAccum = 0;
    this.sinceAnim = 0;

    if (this.ragdoll) {
      this.ragdoll.update(adt);
      this.capturePose();
      return;
    }
    this.animate(adt, d < 25 && inView);
  }

  private placeTransform(alpha: number): void {
    const c = this.c;
    if (this.dead && this.ragdoll) return;
    this.root.position.lerpVectors(c.prevPosition, c.position, alpha);
    if (c.mode === 'vehicle') {
      _q.slerpQuaternions(c.prevSeatQuat, c.seatQuat, alpha);
      this.root.quaternion.copy(_q);
      this.visYaw = c.bodyYaw;
      return;
    }
    let yaw: number;
    if (c.isPlayer && c.mode === 'ground' && c.stance !== 'prone' && c.lifeState === 'alive') yaw = wrapAngle(c.intent.yaw);
    else yaw = lerpAngle(c.prevBodyYaw, c.bodyYaw, alpha);
    this.visYaw = yaw;
    this.root.quaternion.setFromAxisAngle(_yAxis, yaw + Math.PI);
  }

  private animate(dt: number, near: boolean): void {
    const c = this.c;
    const inst = this.inst!;
    const proc = this.proc!;
    // Keep the held weapon in sync with the character.
    const w = c.activeWeapon;
    if ((w?.uid ?? -1) !== this.heldUid) this.onWeaponChanged();

    // ── locomotion input ──
    const li = this.locoIn;
    const yaw = this.visYaw;
    const vx = c.velocity.x, vz = c.velocity.z;
    // Local velocity: right = (cos, -sin), forward = (-sin, -cos)
    li.localVel.set(vx * Math.cos(yaw) - vz * Math.sin(yaw), -vx * Math.sin(yaw) - vz * Math.cos(yaw));
    li.stance = c.stance === 'prone' && c.stanceProgress < 0.5 && c.stanceFrom !== 'prone' ? 'crouch' : c.stance;
    const cls = w?.def.class;
    const hs = holdStyleFor(cls);
    li.style = hs === 'rifle' ? 'rifle' : hs === 'pistol' ? 'pistol' : 'unarmed';
    li.sprinting = c.isSprinting;
    li.special = this.specialKind();
    if (li.special === 'loco' as ClipKind) li.special = null;
    inst.rig.restorePostMixer();
    this.loco!.update(dt, li);
    inst.rig.savePostMixer();
    inst.container.updateMatrixWorld(true);

    // ── procedural ──
    const fs = this.frameState;
    fs.dt = dt;
    fs.bodyYaw = yaw;
    fs.aimYaw = c.isPlayer ? c.intent.yaw : c.yaw;
    fs.aimPitch = c.isPlayer ? c.intent.pitch : c.pitch;
    if (c.isPlayer) {
      fs.aimYaw += c.recoilYaw;
      fs.aimPitch += c.recoilPitch;
    }
    fs.loco = this.loco!.out;
    fs.near = near;
    proc.pc.setFrame(this.root, yaw, fs.aimYaw, fs.aimPitch);
    const sp = this.special!;
    if (!animDebug.noProc && !this.loco!.forceClip) {
      if (li.special) sp.apply(fs, li.special, this.loco!.out.specialCovered);
      else proc.applyGround(fs);
    }
    // Weapon + arms (not while swimming/skydiving: holstered).
    this.weaponPose!.firstPerson = this.fpp && this.c.isPlayer && ctx.cameraRig?.perspective === 'fpp';
    if (!animDebug.noWeaponIK) this.weaponPose!.update(dt, this.held, this.root);
    if (!animDebug.noProc && !this.loco!.forceClip) sp.applyPostWeapon(fs, li.special, !!this.held);
    this.equipment?.update();
    this.updateChute(dt);
    this.capturePose();
    this.applyFirstPerson();
  }

  private updateChute(dt: number): void {
    const c = this.c;
    const deployed = c.mode === 'skydive' && c.sky.phase === 'parachute';
    if (!deployed && !this.chute) return;
    if (!this.chute) {
      this.chute = new ParachuteVisual();
      ctx.scene.add(this.chute.group);
    }
    const rig = this.inst!.rig;
    const sl = rig.bones.upperArmL ? _v.setFromMatrixPosition(rig.bones.upperArmL.matrixWorld) : _v.copy(this.root.position);
    const sr = rig.bones.upperArmR ? _v2.setFromMatrixPosition(rig.bones.upperArmR.matrixWorld) : _v2.copy(this.root.position);
    this.chute.update(dt, deployed, c.sky.chuteOpen, this.root, sl, sr, c.intent.moveX, c.intent.moveY);
  }

  private specialKind(): ClipKind | null {
    const c = this.c;
    switch (c.mode) {
      case 'swim':
        return Math.hypot(c.velocity.x, c.velocity.z) > 0.4 || c.underwater ? 'swim' : 'swimIdle';
      case 'skydive':
        return c.sky.phase === 'freefall' ? 'freefall' : 'parachute';
      case 'vehicle':
        return 'seated';
      case 'traversal':
        return c.traversal?.kind === 'climb' ? 'climb' : 'vault';
      case 'ground':
        if (c.lifeState === 'knocked') return null;
        if (!c.isGrounded && c.airTime > 0.15) return 'fall';
        return null;
      default:
        return null;
    }
  }

  /** Capture joint positions in the sim-aligned frame (interpolated position + sim body orientation). */
  private capturePose(): void {
    const c = this.c;
    const rig = this.inst!.rig;
    if (c.mode === 'vehicle') _q.copy(c.seatQuat);
    else _q.setFromAxisAngle(_yAxis, c.bodyYaw + Math.PI);
    // Use the visual root position (interpolated) so the captured offsets are pose-only.
    _m.compose(this.root.position, _q, _one);
    _inv.copy(_m).invert();
    for (let i = 0; i < POSE_JOINTS.length; i++) {
      const j = POSE_JOINTS[i];
      let bone: THREE.Bone | undefined;
      for (const k of JOINT_BONES[j]) {
        bone = rig.bones[k];
        if (bone) break;
      }
      if (bone) _v.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(_inv);
      else if (j === 'headTop') {
        const head = rig.bones.head!;
        _v.setFromMatrixPosition(head.matrixWorld);
        _v2.set(0, 0.2, 0);
        _v.add(_v2).applyMatrix4(_inv);
      } else _v.set(0, 0, 0);
      this.points[i * 3] = _v.x;
      this.points[i * 3 + 1] = _v.y;
      this.points[i * 3 + 2] = _v.z;
    }
    this.hasPose = true;
  }

  private applyFirstPerson(): void {
    const inst = this.inst;
    if (!inst || !this.weaponPose) return;
    if (this.fpp) {
      if (!this.clip) {
        this.clip = makeClipUniforms();
        installFirstPersonClip(inst.container, this.clip);
      }
      this.weaponPose.eye(this.clip.uClipCenter.value);
      this.clip.uClipRadius.value = 0.21 * (inst.rig.height / 1.8);
    } else if (this.clip) {
      this.clip.uClipRadius.value = 0;
    }
  }

  private setLod(level: number): void {
    if (level === this.lodLevel || !this.inst) return;
    this.lodLevel = level;
    const inst = this.inst;
    if (!inst.lod1 || inst.lod1Meshes.length === 0) return;
    inst.lod1.visible = level === 1;
    for (const m of inst.meshes) m.visible = level === 0;
  }

  // ── ICharacterVisual ───────────────────────────────────────────────────────
  /** Debug: force a clip by name (null to resume normal animation). */
  forceClip(name: string | null): void {
    if (this.loco) this.loco.forceClip = name;
  }

  getPosePoints(): PosePoints | null {
    return this.hasPose ? this.points : null;
  }

  onWeaponChanged(): void {
    const w = this.c.activeWeapon;
    const uid = w?.uid ?? -1;
    if (uid === this.heldUid && (this.held || !w)) {
      this.equipment?.refreshWeapons();
      return;
    }
    this.heldUid = uid;
    if (this.held) {
      this.held.object.removeFromParent();
      this.held = null;
    }
    if (w && this.inst) {
      this.held = createWeaponVisual(w);
      if (this.held) this.root.add(this.held.object);
    }
    this.equipment?.refreshWeapons();
  }

  refreshEquipment(): void {
    this.equipment?.refresh();
    if (this.clip && this.inst) installFirstPersonClip(this.inst.container, this.clip);
  }

  hitReaction(r: HitReaction): void {
    this.proc?.hit(r);
  }

  die(info?: DamageInfo): void {
    if (this.dead) return;
    this.dead = true;
    if (this.held) {
      this.held.object.removeFromParent();
      this.held = null;
      this.heldUid = -1;
    }
    this.equipment?.clearWeapons();
    if (this.inst) {
      try {
        this.ragdoll = new Ragdoll(this.c, this.inst.rig, this.root, info);
      } catch (e) {
        console.warn('[characters] ragdoll failed', e);
        this.ragdoll = null;
      }
    } else this.placeholder?.die();
  }

  reset(): void {
    this.dead = false;
    this.ragdoll?.dispose();
    this.ragdoll = null;
    this.equipment?.refresh();
    this.onWeaponChanged();
  }

  getMuzzleWorld(out: THREE.Vector3): boolean {
    const m = this.held?.muzzle;
    if (!m) return false;
    m.getWorldPosition(out);
    return true;
  }

  getSightEyeWorld(out: THREE.Vector3): boolean {
    const s = this.held?.sightEye;
    if (!s || !this.weaponPose) return false;
    s.getWorldPosition(out);
    return true;
  }

  getEyeWorld(out: THREE.Vector3): boolean {
    if (!this.weaponPose || !this.inst) return false;
    // Eye from the head joint (head scale in FPP doesn't move the joint itself).
    this.weaponPose.eye(out);
    return true;
  }

  setFirstPerson(on: boolean): void {
    if (on === this.fpp && (!on || this.fppPatched)) return;
    this.fpp = on;
    if (on) this.fppPatched = true;
    if (on && this.clip && this.inst) installFirstPersonClip(this.inst.container, this.clip);
    this.placeholder?.setFirstPerson(on);
    this.applyFirstPerson();
  }

  /** True when this visual is drawn for a first-person camera (weapon pose uses the FPP hip pose). */
  get firstPerson(): boolean {
    return this.fpp;
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.root.visible = on;
  }

  dispose(): void {
    this.chute?.dispose();
    this.ragdoll?.dispose();
    this.loco?.dispose();
    this.equipment?.dispose();
    this.root.removeFromParent();
    this.placeholder?.dispose();
  }
}

export { clamp };
