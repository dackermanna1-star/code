// Character: the single simulation entity shared by the player and bots (driven by CharacterIntent).
// Per fixed tick: view → action → locomotion (by mode) → aim flags → combat.updateWeaponHandling → hitboxes.
import * as THREE from 'three';
import { ctx } from '../core/GameContext';
import { emptyIntent } from '../core/contracts';
import type {
  CharacterAction,
  CharacterIntent,
  ICharacter,
  IInventory,
  Interactable,
  IVehicle,
  IWeaponInstance,
} from '../core/contracts';
import type { DamageInfo, EntityId, Hitbox, LifeState, MoveState, Stance, SurfaceType, TeamId, WeaponSlot } from '../core/types';
import { newEntityId } from '../core/types';
import { angleDiff, clamp, dirFromYawPitch, wrapAngle } from '../core/math';
import { CharacterBody } from './movement/CharacterBody';
import {
  CAPSULE_RADIUS,
  EYE_HEIGHT,
  KNOCKED_EYE_HEIGHT,
  KNOCKED_HEIGHT,
  LEAN_OFFSET,
  PRONE_EYE_FORWARD,
  PRONE_VIEW_YAW_LIMIT,
  SEATED_HIP_HEIGHT,
  SPEED,
  STANCE_HEIGHT,
  STANCE_TIME,
  SWIM,
} from './constants';
import type { Gait } from './movement/speed';
import type { ObstacleInfo } from './movement/probes';
import { updateGround, requestStance } from './movement/GroundMotor';
import { updateTraversal } from './movement/Traversal';
import { updateSwim } from './movement/SwimMotor';
import { enterSkydive, updateSkydive } from './movement/SkydiveMotor';
import { updateSeat, placeAfterVehicleExit } from './movement/SeatMotor';
import type { ICharacterVisual } from './anim/types';
import { HitboxSet } from './hitbox/Hitboxes';
import { applyCharacterDamage } from './damage';

export type LocoMode = 'ground' | 'traversal' | 'swim' | 'skydive' | 'vehicle' | 'plane' | 'dead';

export interface TraversalState {
  kind: 'vault' | 'climb';
  t: number;
  duration: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  info: ObstacleInfo;
  dir: THREE.Vector3;
  /** Horizontal speed to carry out of the move. */
  exitSpeed: number;
}

export interface SkydiveState {
  phase: 'freefall' | 'parachute';
  time: number;
  /** 0..1 canopy deployment progress. */
  chuteOpen: number;
  /** Height above ground (m), updated each tick. */
  agl: number;
}

const NO_ACTION: CharacterAction = { kind: 'none' };
const _v = new THREE.Vector3();
const _right = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _fwdZ = new THREE.Vector3();

let warnedFixed = false;

export class Character implements ICharacter {
  readonly id: EntityId = newEntityId();
  name: string;
  teamId: TeamId;
  readonly isPlayer: boolean;
  readonly variant: number;

  // ── simulation state ───────────────────────────────────────────────────────
  readonly position = new THREE.Vector3();
  readonly prevPosition = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  prevYaw = 0;
  /** Facing of the body (lags the view when prone / skydiving; follows the vehicle when seated). */
  bodyYaw = 0;
  prevBodyYaw = 0;
  stance: Stance = 'stand';
  /** Stance before the current transition. */
  stanceFrom: Stance = 'stand';
  stanceProgress = 1;
  stanceDuration = 0;
  /** Continuous body height (m) following stance transitions (used for eye height & animation). */
  stanceHeight: number = STANCE_HEIGHT.stand;
  moveState: MoveState = 'idle';
  mode: LocoMode = 'ground';
  lifeState: LifeState = 'alive';
  health = 100;
  readonly maxHealth = 100;
  knockHealth = 100;
  boost = 0;
  lean = 0;
  isAiming = false;
  isADS = false;
  isSprinting = false;
  isGrounded = true;
  gait: Gait = 'idle';
  /** Target horizontal speed this tick (m/s). */
  targetSpeed = 0;
  action: CharacterAction = NO_ACTION;
  readonly intent: CharacterIntent = emptyIntent();
  readonly inventory: IInventory;
  activeSlot: WeaponSlot | null = null;
  vehicle: IVehicle | null = null;
  seatIndex = -1;
  readonly radius = CAPSULE_RADIUS;
  focusedInteractable: Interactable | null = null;
  /** 0..1 breath (underwater). */
  breath = 1;
  /** Weapons cannot be fired (swim, skydive, vehicle driver, knocked, traversal, plane). */
  weaponsBlocked = false;
  /** Weapon put away by state (swim/skydive/knocked/driver); restored afterwards. */
  holsteredByState = false;
  private resumeSlot: WeaponSlot | null = null;

  // Recoil view offset reported by combat (radians), for the camera & animation.
  recoilPitch = 0;
  recoilYaw = 0;
  /** Seconds since the last shot (for procedural kick); set by the weapon:fired listener. */
  lastShotTime = -10;

  // ── movement internals (motors) ────────────────────────────────────────────
  readonly body: CharacterBody;
  airTime = 0;
  coyoteTimer = 0;
  jumpBuffer = 0;
  /** Highest point during the current airborne phase (for fall damage sanity). */
  fallStartY = 0;
  lastJumpTime = -10;
  lastLandTime = -10;
  lastLandImpact = 0;
  readonly groundNormal = new THREE.Vector3(0, 1, 0);
  groundSurface: SurfaceType = 'grass';
  /** Ground pitch along the body when prone (radians, + = head up). */
  pronePitch = 0;
  footstepDist = 0;
  /** Footstep phase counter (left/right alternation). */
  footstepIndex = 0;
  traversal: TraversalState | null = null;
  readonly sky: SkydiveState = { phase: 'freefall', time: 0, chuteOpen: 0, agl: 1000 };
  /** World Y of the water surface while swimming. */
  waterSurface = 0;
  underwater = false;
  private drownAcc = 0;
  /** Vehicle seat world transform (hips), updated each tick while seated. */
  readonly seatPos = new THREE.Vector3();
  readonly seatQuat = new THREE.Quaternion();
  readonly prevSeatQuat = new THREE.Quaternion();
  /**
   * Feet position / body orientation relative to the vehicle's simulation transform (refreshed with the
   * seat). The visual places the body from the vehicle's *rendered* root with these, so a seated character
   * never lags or jitters against an interpolated vehicle.
   */
  readonly seatLocalFeet = new THREE.Vector3();
  readonly seatLocalQuat = new THREE.Quaternion();
  /** Seat heading at the last seat update: the player's view turns with the vehicle (PUBG vehicle camera). */
  private seatYawRef: number | null = null;
  /** Body orientation used for hitboxes (sim) — yaw-only except in vehicles. */
  readonly simQuat = new THREE.Quaternion();
  private interactTarget: Interactable | null = null;
  private interactCandidates: Interactable[] = [];

  // ── visuals & hitboxes ─────────────────────────────────────────────────────
  visual: ICharacterVisual | null = null;
  readonly hitboxes: HitboxSet;
  private readonly emptyHitboxes: Hitbox[] = [];
  private readonly fallbackRoot = new THREE.Group();

  constructor(opts: { name: string; teamId: TeamId; isPlayer: boolean; position: THREE.Vector3; yaw?: number; variant?: number }) {
    this.name = opts.name;
    this.teamId = opts.teamId;
    this.isPlayer = opts.isPlayer;
    this.variant = opts.variant ?? 0;
    this.position.copy(opts.position);
    this.prevPosition.copy(opts.position);
    this.yaw = this.prevYaw = this.bodyYaw = this.prevBodyYaw = opts.yaw ?? 0;
    this.intent.yaw = this.yaw;
    this.inventory = ctx.items.createInventory(this);
    this.body = new CharacterBody(ctx.physics, this, this.position);
    this.hitboxes = new HitboxSet(this);
    this.updateSimQuat();
  }

  // ── ICharacter getters ─────────────────────────────────────────────────────
  get activeWeapon(): IWeaponInstance | null {
    return this.activeSlot ? this.inventory.weapons[this.activeSlot] ?? null : null;
  }
  get root(): THREE.Object3D {
    return this.visual?.root ?? this.fallbackRoot;
  }
  get isVisibleDetailed(): boolean {
    return this.visual?.detailed ?? false;
  }
  get height(): number {
    if (this.lifeState === 'knocked') return KNOCKED_HEIGHT;
    return this.stanceHeight;
  }

  // ── fixed tick ─────────────────────────────────────────────────────────────
  fixedUpdate(dt: number): void {
    try {
      this.tick(dt);
    } catch (e) {
      if (!warnedFixed) {
        warnedFixed = true;
        console.error('[characters] fixedUpdate failed', e);
      }
    }
  }

  private tick(dt: number): void {
    this.prevPosition.copy(this.position);
    this.prevYaw = this.yaw;
    this.prevBodyYaw = this.bodyYaw;
    this.prevSeatQuat.copy(this.seatQuat);
    const intent = this.intent;

    if (this.lifeState === 'dead' || this.mode === 'dead') {
      this.clearEdges();
      return;
    }

    // View angles from intent (the player's camera writes them at render rate).
    this.yaw = wrapAngle(intent.yaw);
    this.pitch = clamp(intent.pitch, -1.5, 1.5);
    if (this.mode === 'ground' && this.stance === 'prone') this.pitch = clamp(this.pitch, -0.6, 1.0);
    // Prone: the view may only lead the (rate-limited, wall-blocked) body by a bounded angle.
    const lim = this.viewYawLimit();
    if (lim !== null) {
      const d = angleDiff(this.bodyYaw, this.yaw);
      if (Math.abs(d) > lim) {
        const clamped = Math.sign(d) * lim;
        this.yaw = wrapAngle(this.bodyYaw + clamped);
        // The player's camera reads intent.yaw: pull it back by the same amount (PlayerController also clamps
        // at render rate). Bots keep their requested yaw; the body keeps turning toward it.
        if (this.isPlayer) intent.yaw += clamped - d;
      }
    }

    this.updateWeaponBlock();
    this.updateAction(dt);

    switch (this.mode) {
      case 'ground':
        updateGround(this, dt);
        break;
      case 'traversal':
        updateTraversal(this, dt);
        break;
      case 'swim':
        updateSwim(this, dt);
        break;
      case 'skydive':
        updateSkydive(this, dt);
        break;
      case 'vehicle':
        updateSeat(this, dt);
        break;
      case 'plane':
        this.velocity.set(0, 0, 0);
        break;
    }
    this.updateStanceBlend(dt);
    this.updateBreath(dt);
    this.updateAimFlags();
    this.updateSimQuat();

    // Weapon handling (fire/recoil/reload/switching) by the combat module.
    if (this.weaponsBlocked) this.blankWeaponIntent();
    if (this.lifeState === 'alive' || this.lifeState === 'knocked') {
      const r = ctx.combat.updateWeaponHandling(this, dt);
      this.recoilPitch = r?.recoilPitch ?? 0;
      this.recoilYaw = r?.recoilYaw ?? 0;
    }
    this.clearEdges();
    this.hitboxes.update();
  }

  /** Reset edge-triggered intent flags after a tick consumed them. */
  private clearEdges(): void {
    const i = this.intent;
    i.jump = false;
    i.reload = false;
    i.interact = false;
    i.switchSlot = null;
    i.cycleWeapon = 0;
    i.holster = false;
    i.toggleFireMode = false;
    i.useItem = null;
    i.cancel = false;
    i.switchSeat = null;
    i.stance = null;
  }

  private blankWeaponIntent(): void {
    const i = this.intent;
    i.fire = false;
    i.reload = false;
    i.switchSlot = null;
    i.cycleWeapon = 0;
    i.holster = false;
    i.toggleFireMode = false;
    if (this.mode !== 'traversal') {
      i.ads = false;
    }
  }

  // ── stance ─────────────────────────────────────────────────────────────────
  /** Begin a stance transition (motors call this after clearance checks). */
  beginStance(to: Stance): void {
    if (to === this.stance) return;
    const from = this.stance;
    this.stanceFrom = from;
    this.stance = to;
    this.stanceProgress = 0;
    const toProne = to === 'prone' || from === 'prone';
    this.stanceDuration = toProne ? (from === 'stand' || to === 'stand' ? STANCE_TIME.standProne : STANCE_TIME.crouchProne) : STANCE_TIME.standCrouch;
    ctx.events.emit('character:stance', { character: this, from, to });
  }

  private updateStanceBlend(dt: number): void {
    if (this.stanceProgress < 1) this.stanceProgress = Math.min(1, this.stanceProgress + dt / Math.max(0.05, this.stanceDuration));
    let target: number = STANCE_HEIGHT[this.stance];
    if (this.lifeState === 'knocked') target = KNOCKED_HEIGHT;
    if (this.mode === 'swim' || this.mode === 'skydive' || this.mode === 'vehicle' || this.mode === 'plane') target = STANCE_HEIGHT.stand;
    const rate = Math.abs(STANCE_HEIGHT.stand - STANCE_HEIGHT.prone) / Math.max(0.1, this.stanceDuration || STANCE_TIME.standCrouch);
    const d = target - this.stanceHeight;
    const step = rate * dt;
    this.stanceHeight = Math.abs(d) <= step ? target : this.stanceHeight + Math.sign(d) * step;
  }

  // ── weapons & state holstering ─────────────────────────────────────────────
  private updateWeaponBlock(): void {
    const seatCanShoot = this.vehicle ? this.vehicle.seats[this.seatIndex]?.canShoot ?? false : true;
    const holster =
      this.mode === 'swim' ||
      this.mode === 'skydive' ||
      this.mode === 'plane' ||
      this.lifeState === 'knocked' ||
      (this.mode === 'vehicle' && !seatCanShoot);
    if (holster && !this.holsteredByState) {
      this.holsteredByState = true;
      this.resumeSlot = this.activeSlot;
      if (this.action.kind === 'reload' || this.action.kind === 'switchWeapon' || this.action.kind === 'throw') this.setAction(NO_ACTION);
      this.setActiveSlotInternal(null);
    } else if (!holster && this.holsteredByState) {
      this.holsteredByState = false;
      const s = this.resumeSlot;
      this.resumeSlot = null;
      if (s && this.inventory.weapons[s] && this.lifeState === 'alive') this.setActiveSlotInternal(s);
    }
    this.weaponsBlocked = holster || this.mode === 'traversal' || (this.stance === 'prone' && this.stanceProgress < 1 && this.stanceFrom !== 'prone');
  }

  private setActiveSlotInternal(slot: WeaponSlot | null): void {
    if (slot === this.activeSlot) return;
    this.activeSlot = slot;
    this.visual?.onWeaponChanged();
    ctx.events.emit('weapon:switch', { character: this, slot });
  }

  equipSlot(slot: WeaponSlot | null): void {
    if (slot && !this.inventory.weapons[slot]) slot = null;
    if (this.holsteredByState || this.lifeState !== 'alive') {
      this.resumeSlot = slot;
      return;
    }
    this.setActiveSlotInternal(slot);
  }

  refreshEquipmentVisuals(): void {
    this.visual?.refreshEquipment();
    if (this.activeSlot && !this.inventory.weapons[this.activeSlot]) this.setActiveSlotInternal(null);
    else this.visual?.onWeaponChanged();
  }

  // ── aim flags ──────────────────────────────────────────────────────────────
  private updateAimFlags(): void {
    const i = this.intent;
    const w = this.activeWeapon;
    const cls = w?.def.class;
    const busy = this.action.kind === 'useItem' || this.action.kind === 'interact' || this.action.kind === 'revive';
    const canAim =
      this.lifeState === 'alive' &&
      (this.mode === 'ground' || (this.mode === 'vehicle' && !this.weaponsBlocked)) &&
      !this.isSprinting &&
      !busy;
    this.isAiming = canAim && (i.aim || i.ads);
    const canADS =
      canAim &&
      !!w &&
      cls !== 'melee' &&
      cls !== 'throwable' &&
      this.action.kind !== 'reload' &&
      this.action.kind !== 'switchWeapon' &&
      !(this.stance === 'prone' && this.stanceProgress < 1);
    this.isADS = canADS && i.ads;
  }

  // ── actions (healing, hold-to-interact) ───────────────────────────────────
  private updateAction(dt: number): void {
    const i = this.intent;
    if (i.cancel && (this.action.kind === 'useItem' || this.action.kind === 'interact')) this.cancelAction();

    // Consumables.
    if (i.useItem && this.lifeState === 'alive' && this.mode !== 'skydive' && this.mode !== 'plane' && this.action.kind !== 'useItem') {
      try {
        if (ctx.items.canUse(this, i.useItem)) {
          if (this.action.kind === 'reload' || this.action.kind === 'interact') this.setAction(NO_ACTION);
          if (this.action.kind === 'none') {
            this.setAction({ kind: 'useItem', itemId: i.useItem, progress: 0, duration: Math.max(0.1, ctx.items.useDuration(i.useItem)) });
          }
        }
      } catch (e) {
        console.warn('[characters] useItem failed', e);
      }
    }

    // Interaction (F): vehicle exit, chute deploy, or the best interactable.
    if (this.isPlayer && this.lifeState === 'alive' && (this.mode === 'ground' || this.mode === 'swim')) {
      this.focusedInteractable = ctx.interactions.best(this, this.interactCandidates);
    } else if (this.isPlayer) {
      this.focusedInteractable = null;
    }
    if (i.interact) this.onInteractPressed();

    const a = this.action;
    if (a.kind === 'useItem') {
      const cancel = i.jump || (i.fire && !!this.activeWeapon) || this.mode === 'traversal' || this.mode === 'swim' || this.lifeState !== 'alive';
      if (cancel) {
        this.cancelAction();
      } else {
        a.progress += dt;
        if (a.progress >= a.duration) {
          const id = a.itemId;
          this.setAction(NO_ACTION);
          try {
            ctx.items.applyUse(this, id);
          } catch (e) {
            console.warn('[characters] applyUse failed', e);
          }
        }
      }
    } else if (a.kind === 'interact') {
      const it = this.interactTarget;
      const ok =
        !!it &&
        i.interactHeld &&
        this.lifeState === 'alive' &&
        it.available(this) &&
        Math.hypot(it.position.x - this.position.x, it.position.z - this.position.z) <= it.range + 0.6;
      if (!ok) {
        this.cancelAction();
      } else {
        a.progress += dt;
        if (a.progress >= a.duration) {
          this.setAction(NO_ACTION);
          this.interactTarget = null;
          try {
            it!.interact(this);
          } catch (e) {
            console.warn('[characters] interact failed', e);
          }
        }
      }
    }
  }

  private onInteractPressed(): void {
    if (this.vehicle) {
      try {
        this.vehicle.exit(this);
      } catch (e) {
        console.warn('[characters] vehicle exit failed', e);
      }
      return;
    }
    if (this.mode === 'skydive') {
      if (this.sky.phase === 'freefall' && this.sky.time > 0.5) this.deployParachute();
      return;
    }
    if (this.lifeState !== 'alive' || (this.mode !== 'ground' && this.mode !== 'swim')) return;
    if (this.action.kind === 'interact') return;
    const it = this.isPlayer ? this.focusedInteractable : ctx.interactions.best(this, this.interactCandidates);
    if (!it) return;
    const hold = it.holdTime(this);
    if (hold <= 0) {
      try {
        it.interact(this);
      } catch (e) {
        console.warn('[characters] interact failed', e);
      }
    } else {
      if (this.action.kind === 'useItem' || this.action.kind === 'reload') this.setAction(NO_ACTION);
      this.interactTarget = it;
      this.setAction({ kind: 'interact', label: it.label(this), progress: 0, duration: hold });
    }
  }

  cancelAction(): void {
    this.interactTarget = null;
    this.setAction(NO_ACTION);
  }

  setAction(a: CharacterAction): void {
    this.action = a;
  }

  /** Speed cap (m/s) imposed by the current action, Infinity when none. */
  actionSpeedCap(): number {
    const a = this.action;
    if (a.kind === 'useItem') return /first|med/i.test(a.itemId) ? SPEED.healSlow : SPEED.healWalk;
    if (a.kind === 'interact' || a.kind === 'revive' || a.kind === 'beingRevived') return 0;
    return Infinity;
  }

  // ── breath / drowning ──────────────────────────────────────────────────────
  private updateBreath(dt: number): void {
    if (this.mode === 'swim' && this.underwater) {
      this.breath = Math.max(0, this.breath - dt / SWIM.breathSeconds);
      if (this.breath <= 0 && this.lifeState === 'alive') {
        this.drownAcc += SWIM.drownDps * dt;
        if (this.drownAcc >= 1) {
          const amount = Math.floor(this.drownAcc);
          this.drownAcc -= amount;
          applyCharacterDamage(this, { type: 'drown', amount });
        }
      }
    } else {
      this.breath = Math.min(1, this.breath + dt / 3);
      this.drownAcc = 0;
    }
  }

  // ── skydive ────────────────────────────────────────────────────────────────
  deployParachute(): void {
    if (this.mode !== 'skydive' || this.sky.phase !== 'freefall') return;
    this.sky.phase = 'parachute';
    this.sky.chuteOpen = 0;
    this.moveState = 'parachute';
    ctx.events.emit('character:parachute', { character: this, phase: 'open' });
  }

  // ── ICharacter API ─────────────────────────────────────────────────────────
  getEyePosition(out: THREE.Vector3): THREE.Vector3 {
    const p = this.position;
    if (this.mode === 'vehicle') {
      return out.set(0, 0.72, 0.05).applyQuaternion(this.seatQuat).add(this.seatPos);
    }
    if (this.mode === 'swim') return out.set(p.x, p.y + EYE_HEIGHT.stand, p.z);
    if (this.mode === 'skydive' || this.mode === 'plane') return out.set(p.x, p.y + 1.0, p.z);
    if (this.lifeState === 'knocked') return out.set(p.x, p.y + KNOCKED_EYE_HEIGHT, p.z);
    // Eye height follows the continuous stance height; prone moves the head forward.
    const h = this.stanceHeight;
    let eye: number;
    let fwd = 0;
    if (h >= STANCE_HEIGHT.crouch) {
      const t = (h - STANCE_HEIGHT.crouch) / (STANCE_HEIGHT.stand - STANCE_HEIGHT.crouch);
      eye = EYE_HEIGHT.crouch + (EYE_HEIGHT.stand - EYE_HEIGHT.crouch) * t;
    } else {
      const t = (h - STANCE_HEIGHT.prone) / (STANCE_HEIGHT.crouch - STANCE_HEIGHT.prone);
      eye = EYE_HEIGHT.prone + (EYE_HEIGHT.crouch - EYE_HEIGHT.prone) * t;
      fwd = PRONE_EYE_FORWARD * (1 - t);
    }
    out.set(p.x, p.y + eye, p.z);
    if (fwd > 0) {
      out.x += -Math.sin(this.bodyYaw) * fwd;
      out.z += -Math.cos(this.bodyYaw) * fwd;
      out.y += Math.sin(this.pronePitch) * fwd * (1 - (h - STANCE_HEIGHT.prone) / (STANCE_HEIGHT.crouch - STANCE_HEIGHT.prone));
    }
    if (this.lean !== 0) {
      this.rightVector(_right);
      out.addScaledVector(_right, this.lean * LEAN_OFFSET);
      out.y -= Math.abs(this.lean) * 0.07;
    }
    return out;
  }

  getAimDirection(out: THREE.Vector3): THREE.Vector3 {
    return dirFromYawPitch(this.yaw, this.pitch, out);
  }

  getMuzzlePosition(out: THREE.Vector3): THREE.Vector3 {
    if (this.visual?.detailed && this.activeWeapon && this.visual.getMuzzleWorld(out)) return out;
    this.getEyePosition(out);
    this.getAimDirection(_v);
    this.rightVector(_right);
    out.addScaledVector(_v, 0.75).addScaledVector(_right, this.isADS ? 0 : 0.18);
    out.y -= this.isADS ? 0.05 : 0.15;
    return out;
  }

  /** Horizontal right vector for the current view yaw. */
  rightVector(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  getHitboxes(): readonly Hitbox[] {
    if (this.lifeState === 'dead' || this.mode === 'plane') return this.emptyHitboxes;
    return this.hitboxes.boxes;
  }

  applyHealthDelta(delta: number, info?: DamageInfo): void {
    if (!isFinite(delta)) return;
    this.health = clamp(this.health + delta, 0, this.maxHealth);
    if (delta < 0 && info && info.type !== 'drown' && info.type !== 'zone' && info.type !== 'bleed') {
      this.visual?.hitReaction({ zone: info.zone, direction: info.direction, amount: -delta });
    }
  }

  setLifeState(state: LifeState, info?: DamageInfo): void {
    if (state === this.lifeState) return;
    const prev = this.lifeState;
    this.lifeState = state;
    if (state === 'knocked') {
      if (this.mode === 'traversal') this.traversal = null;
      if (this.mode !== 'vehicle') this.mode = this.mode === 'swim' ? 'swim' : 'ground';
      this.cancelAction();
      this.lean = 0;
      this.stance = 'crouch';
      this.stanceProgress = 1;
      if (this.mode === 'ground') {
        if (this.body.fits('knocked', this.position)) this.body.setShape('knocked', this.position);
        else this.body.setShape('prone', this.position);
      }
      this.moveState = 'knocked';
    } else if (state === 'alive') {
      if (prev === 'dead') {
        this.health = Math.max(1, this.health);
        this.body.setEnabled(true);
        this.mode = 'ground';
        this.visual?.reset();
      }
      this.stance = 'crouch';
      this.stanceProgress = 1;
      if (this.mode === 'ground') {
        // Revived under something lower than a crouch (knocked bodies fit under tables): stay prone.
        if (this.body.fits('crouch', this.position)) this.body.setShape('crouch', this.position);
        else {
          this.stance = 'prone';
          this.stanceHeight = Math.min(this.stanceHeight, STANCE_HEIGHT.crouch);
          this.body.setShape('prone', this.position, this.bodyYaw);
        }
      }
      this.moveState = 'idle';
      this.knockHealth = 100;
    } else if (state === 'dead') {
      if (this.vehicle) {
        const v = this.vehicle;
        try {
          v.exit(this);
        } catch {
          /* ignore */
        }
        if (this.vehicle) this.setVehicle(null, -1);
      }
      this.cancelAction();
      this.traversal = null;
      this.mode = 'dead';
      this.moveState = 'dead';
      this.health = 0;
      this.lean = 0;
      this.isADS = this.isAiming = this.isSprinting = false;
      this.body.setEnabled(false);
      this.focusedInteractable = null;
      this.visual?.die(info);
    }
  }

  teleport(pos: THREE.Vector3, yaw?: number): void {
    const far = pos.distanceToSquared(this.position) > 50 * 50;
    this.position.copy(pos);
    if (this.mode !== 'plane' || far) this.prevPosition.copy(pos);
    if (yaw !== undefined) {
      this.yaw = this.prevYaw = this.bodyYaw = this.prevBodyYaw = yaw;
      this.intent.yaw = yaw;
    }
    if (this.mode !== 'plane') this.velocity.set(0, 0, 0);
    this.body.syncTo(this.position);
    this.traversal = null;
    if (this.mode === 'traversal') this.mode = 'ground';
    // Teleported under something lower than the current stance (spawn/revive spots under low ceilings): the
    // KCC's penetration recovery would pop the capsule on top of the obstacle — duck instead.
    if (this.mode === 'ground' && this.lifeState === 'alive' && this.stance !== 'prone' && !this.body.fits(this.stance, this.position, false)) {
      if (this.stance === 'stand' && this.body.fits('crouch', this.position, false)) {
        this.stance = 'crouch';
        this.body.setShape('crouch', this.position);
      } else if (this.body.proneBodyFits(this.position, this.bodyYaw, 0, false)) {
        this.stance = 'prone';
        this.pronePitch = 0;
        this.body.setShape('prone', this.position, this.bodyYaw);
      }
      this.stanceProgress = 1;
      this.stanceHeight = STANCE_HEIGHT[this.stance];
    }
    this.airTime = 0;
    this.fallStartY = this.position.y;
    this.updateSimQuat();
    this.hitboxes.update();
  }

  setVehicle(vehicle: IVehicle | null, seatIndex: number): void {
    if (vehicle) {
      const wasIn = this.vehicle;
      this.vehicle = vehicle;
      this.seatIndex = seatIndex;
      this.mode = 'vehicle';
      this.moveState = 'vehicle';
      this.traversal = null;
      this.lean = 0;
      if (this.action.kind === 'interact') this.cancelAction();
      this.body.setEnabled(false);
      if (this.stance !== 'stand') {
        this.stance = 'stand';
        this.stanceProgress = 1;
        this.body.setShape('stand', this.position);
      }
      vehicle.getSeatTransform(seatIndex, this.seatPos, this.seatQuat);
      if (!wasIn) {
        this.prevSeatQuat.copy(this.seatQuat);
        this.seatYawRef = null;
      }
      this.updateSeatFeet();
      if (!wasIn) {
        this.prevPosition.copy(this.position);
        // Getting in: the player's view faces the vehicle's forward (then turns with it).
        if (this.isPlayer) {
          this.intent.yaw = this.yaw = this.prevYaw = this.bodyYaw;
          this.intent.pitch = this.pitch = -0.08;
        }
      }
    } else if (this.vehicle) {
      const v = this.vehicle;
      this.vehicle = null;
      this.seatIndex = -1;
      this.seatYawRef = null;
      this.mode = this.lifeState === 'dead' ? 'dead' : 'ground';
      if (this.lifeState !== 'dead') {
        this.moveState = this.lifeState === 'knocked' ? 'knocked' : 'idle';
        this.body.setEnabled(true);
        placeAfterVehicleExit(this, v);
      }
    }
  }

  /** Feet position from the seat hips transform (+ the same pose relative to the vehicle). */
  updateSeatFeet(): void {
    _v.set(0, -SEATED_HIP_HEIGHT, 0).applyQuaternion(this.seatQuat);
    this.position.copy(this.seatPos).add(_v);
    // Body yaw = heading of the seat's forward (+Z, assets face +Z) projected on the ground.
    _fwdZ.set(0, 0, 1).applyQuaternion(this.seatQuat);
    if (_fwdZ.x * _fwdZ.x + _fwdZ.z * _fwdZ.z > 1e-8) this.bodyYaw = wrapAngle(Math.atan2(_fwdZ.x, _fwdZ.z) + Math.PI);
    const v = this.vehicle;
    if (v) {
      _q.copy(v.quaternion).invert();
      this.seatLocalFeet.copy(this.position).sub(v.position).applyQuaternion(_q);
      this.seatLocalQuat.copy(_q).multiply(this.seatQuat);
      // The player's view is relative to the vehicle: when it turns, the view turns with it (looking out of
      // the side window keeps looking out of the side window). Bots aim with absolute yaw from their AI.
      if (this.isPlayer) {
        if (this.seatYawRef !== null) {
          const d = angleDiff(this.seatYawRef, this.bodyYaw);
          if (d !== 0) {
            this.intent.yaw += d;
            this.yaw = wrapAngle(this.yaw + d);
          }
        }
        this.seatYawRef = this.bodyYaw;
      }
    }
  }

  /**
   * Re-read the seat after the vehicles moved this tick (called post-physics by the characters module) so the
   * seated body, eye and hitboxes match the vehicle that combat ray-tests and the renderer draws.
   */
  syncSeat(): void {
    const v = this.vehicle;
    if (!v || this.mode !== 'vehicle' || this.lifeState === 'dead') return;
    try {
      v.getSeatTransform(this.seatIndex, this.seatPos, this.seatQuat);
    } catch {
      return;
    }
    this.updateSeatFeet();
    this.velocity.copy(v.velocity);
    this.updateSimQuat();
    this.hitboxes.update();
  }

  setMoveState(state: MoveState): void {
    switch (state) {
      case 'freefall':
      case 'parachute':
        enterSkydive(this, state === 'parachute');
        break;
      case 'plane':
        this.mode = 'plane';
        this.moveState = 'plane';
        this.traversal = null;
        this.body.setEnabled(false);
        this.velocity.set(0, 0, 0);
        this.visual?.setVisible(false);
        break;
      case 'swim':
        this.mode = 'swim';
        this.moveState = 'swim';
        this.body.setEnabled(true);
        this.visual?.setVisible(true);
        break;
      case 'dead':
        this.setLifeState('dead');
        break;
      case 'knocked':
        this.setLifeState('knocked');
        break;
      case 'vehicle':
        break;
      default:
        // Back to normal ground locomotion (e.g. after the plane or a scripted sequence).
        if (this.lifeState === 'dead') return;
        this.mode = 'ground';
        this.moveState = state === 'air' ? 'air' : 'idle';
        this.isGrounded = state !== 'air';
        this.body.setEnabled(true);
        this.body.setShape('stand', this.position);
        this.stance = 'stand';
        this.stanceHeight = STANCE_HEIGHT.stand;
        this.visual?.setVisible(true);
        break;
    }
  }

  setTeamMarker(color: number | null): void {
    this.visual?.setMarker?.(color);
  }

  /** Max view yaw offset from the body (rad) in the current state, or null when the view is free. */
  viewYawLimit(): number | null {
    return this.mode === 'ground' && this.stance === 'prone' && this.lifeState === 'alive' ? PRONE_VIEW_YAW_LIMIT : null;
  }

  /** Request a stance from code (bots/tests); performs the same clearance checks as the intent path. */
  requestStance(s: Stance): boolean {
    return requestStance(this, s);
  }

  updateSimQuat(): void {
    if (this.mode === 'vehicle') {
      // Seat orientation (assets face +Z, so the seat quaternion already maps model space).
      this.simQuat.copy(this.seatQuat);
    } else {
      this.simQuat.setFromAxisAngle(_yAxis, this.bodyYaw + Math.PI);
    }
  }

  dispose(): void {
    try {
      this.body.dispose();
    } catch {
      /* already removed */
    }
    this.visual?.dispose();
    this.visual = null;
  }
}
