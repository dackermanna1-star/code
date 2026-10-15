// PlayerController: keyboard/mouse → CharacterIntent for the local player.
//  - fixedUpdate (Priority.Player): buttons, stance/aim hold-toggle semantics, slots, heals, interaction edges.
//  - update (render rate, Priority.Player): mouse look → intent.yaw/pitch (+ free-look offsets for the camera).
import { ctx } from '../../core/GameContext';
import { Priority } from '../../core/Engine';
import type { Action } from '../../core/Input';
import type { Interactable } from '../../core/contracts';
import type { WeaponSlot } from '../../core/types';
import { DEG, clamp, damp } from '../../core/math';
import type { Character } from '../Character';

/** Base mouse sensitivity: degrees per pixel at settings.controls.sensitivity = 1. */
export const BASE_DEG_PER_PX = 0.1;
/** RMB press shorter than this toggles ADS (hybrid mode); longer is a hold. */
const CLICK_TIME = 0.22;
const FREE_LOOK_MAX_YAW = 110 * DEG;
const FREE_LOOK_MAX_PITCH = 70 * DEG;

const SLOT_ACTIONS: [Action, WeaponSlot][] = [
  ['slot1', 'primary1'],
  ['slot2', 'primary2'],
  ['slot3', 'pistol'],
  ['slot4', 'melee'],
  ['slot5', 'throwable'],
];

/** Heal hotkeys → item matcher (resolved against ctx.items.defs, with sensible default ids). */
const HEAL_KEYS: [Action, RegExp[], string[]][] = [
  ['useBandage', [/bandage/i], ['item_bandage']],
  ['useFirstAid', [/first.?aid/i], ['item_firstaid', 'item_first_aid']],
  ['useMedkit', [/med.?kit/i], ['item_medkit']],
  ['useBoost', [/energy|drink/i, /painkiller/i, /adrenaline/i], ['item_energy_drink', 'item_energydrink', 'item_painkiller', 'item_adrenaline']],
];

export class PlayerController {
  /** Free-look offsets (camera only; the body keeps facing intent.yaw). */
  freeLookYaw = 0;
  freeLookPitch = 0;
  /** ADS toggled on by a click (hybrid/toggle modes). */
  private adsToggled = false;
  private rmbHeld = false;
  private rmbPressTime = 0;
  private sprintToggled = false;
  private walkToggled = false;
  private lastSlot: WeaponSlot | null = null;

  install(): void {
    ctx.engine.addSystem({
      name: 'playerController',
      priority: Priority.Player,
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      update: (dt) => this.update(dt),
    });
  }

  get player(): Character | null {
    return (ctx.player as Character | null) ?? null;
  }

  /** Clear hold/toggle states (ADS toggle, sprint/walk toggles) — e.g. after respawn or teleport. */
  resetToggles(): void {
    this.adsToggled = false;
    this.sprintToggled = false;
    this.walkToggled = false;
    this.rmbHeld = false;
    this.freeLookYaw = this.freeLookPitch = 0;
  }

  /** Interactable under the crosshair (for the UI prompt). */
  getFocusedInteractable(): Interactable | null {
    return this.player?.focusedInteractable ?? null;
  }

  private inputActive(): boolean {
    return ctx.input.enabled && !(ctx.ui?.capturesInput ?? false);
  }

  // ── render-rate mouse look ─────────────────────────────────────────────────
  private update(dt: number): void {
    const c = this.player;
    const { dx, dy } = ctx.input.consumeMouseDelta();
    if (!c || !this.inputActive()) return;
    if (ctx.cameraRig.mode !== 'player') return;
    if (c.lifeState === 'dead') return;
    const s = ctx.settings.data.controls;
    const rad = BASE_DEG_PER_PX * s.sensitivity * this.sensitivityMultiplier(c) * DEG;
    const inv = s.invertY ? -1 : 1;
    const freeLook = ctx.input.isDown('freeLook') && c.mode !== 'vehicle';
    if (freeLook) {
      this.freeLookYaw = clamp(this.freeLookYaw - dx * rad, -FREE_LOOK_MAX_YAW, FREE_LOOK_MAX_YAW);
      this.freeLookPitch = clamp(this.freeLookPitch - dy * rad * inv, -FREE_LOOK_MAX_PITCH, FREE_LOOK_MAX_PITCH);
    } else {
      c.intent.yaw -= dx * rad;
      c.intent.pitch = clamp(c.intent.pitch - dy * rad * inv, -1.5, 1.5);
      // Free look snaps back smoothly.
      const k = damp(14, dt);
      this.freeLookYaw -= this.freeLookYaw * k;
      this.freeLookPitch -= this.freeLookPitch * k;
    }
    // Keep yaw bounded.
    if (c.intent.yaw > Math.PI * 4 || c.intent.yaw < -Math.PI * 4) c.intent.yaw = Math.atan2(Math.sin(c.intent.yaw), Math.cos(c.intent.yaw));
  }

  private sensitivityMultiplier(c: Character): number {
    const s = ctx.settings.data.controls;
    if (c.isADS && ctx.cameraRig.zoom > 1.01) {
      const z = ctx.cameraRig.zoom;
      const key = z >= 7 ? '8x' : z >= 5 ? '6x' : z >= 3.5 ? '4x' : z >= 2.5 ? '3x' : '2x';
      return s.scopeSensitivity[key] ?? s.adsSensitivity;
    }
    if (c.isADS) return s.adsSensitivity;
    if (c.isAiming) return s.aimSensitivity;
    return 1;
  }

  // ── fixed-rate buttons ─────────────────────────────────────────────────────
  private fixedUpdate(_dt: number): void {
    const c = this.player;
    if (!c) return;
    const i = c.intent;
    const inp = ctx.input;
    if (!this.inputActive() || ctx.cameraRig.mode !== 'player' || c.lifeState === 'dead') {
      i.moveX = i.moveY = 0;
      i.sprint = i.walk = i.fire = i.aim = i.ads = i.interactHeld = i.freeLook = false;
      i.lean = 0;
      i.dive = i.ascend = false;
      i.vehicle.throttle = i.vehicle.steer = i.vehicle.pitch = 0;
      i.vehicle.handbrake = i.vehicle.boost = i.vehicle.horn = false;
      this.rmbHeld = false;
      return;
    }
    const s = ctx.settings.data.controls;
    const now = ctx.engine.simTime;
    const ax = (inp.isDown('moveRight') ? 1 : 0) - (inp.isDown('moveLeft') ? 1 : 0);
    const ay = (inp.isDown('moveForward') ? 1 : 0) - (inp.isDown('moveBack') ? 1 : 0);
    i.moveX = ax;
    i.moveY = ay;

    // Sprint / walk (hold or toggle).
    if (s.toggleSprint) {
      if (inp.wasPressed('sprint')) this.sprintToggled = !this.sprintToggled;
      if (ay <= 0) this.sprintToggled = false;
      i.sprint = this.sprintToggled;
    } else i.sprint = inp.isDown('sprint');
    if (s.toggleWalk) {
      if (inp.wasPressed('walk')) this.walkToggled = !this.walkToggled;
      i.walk = this.walkToggled;
    } else i.walk = inp.isDown('walk');

    // Stance: requests relative to the current stance so toggles never desync from the character.
    if (s.toggleCrouch) {
      if (inp.wasPressed('crouch')) i.stance = c.stance === 'crouch' ? 'stand' : 'crouch';
    } else {
      if (inp.wasPressed('crouch')) i.stance = 'crouch';
      else if (inp.wasReleased('crouch') && c.stance === 'crouch') i.stance = 'stand';
    }
    if (inp.wasPressed('prone')) i.stance = c.stance === 'prone' ? 'stand' : 'prone';
    i.jump = inp.wasPressed('jump');

    // Swimming: dive / surface.
    i.dive = inp.isDown('crouch') || inp.isDown('walk');
    i.ascend = inp.isDown('jump');

    // Lean (hold).
    i.lean = inp.isDown('leanLeft') ? -1 : inp.isDown('leanRight') ? 1 : 0;
    if (inp.isDown('leanLeft') && inp.isDown('leanRight')) i.lean = 0;

    // Aim / ADS.
    this.updateAim(c, now);

    i.fire = inp.isDown('fire');
    i.reload = inp.wasPressed('reload');
    i.interact = inp.wasPressed('interact');
    i.interactHeld = inp.isDown('interact');
    i.toggleFireMode = inp.wasPressed('fireMode');
    i.holster = inp.wasPressed('holster');
    i.freeLook = inp.isDown('freeLook');

    // Weapon slots / wheel.
    i.switchSlot = null;
    for (const [a, slot] of SLOT_ACTIONS) if (inp.wasPressed(a)) i.switchSlot = slot;
    const wheel = inp.tickWheelDelta();
    i.cycleWeapon = wheel > 0 ? 1 : wheel < 0 ? -1 : 0;
    if (i.switchSlot || i.cycleWeapon || i.holster) this.adsToggled = false;
    if (c.activeSlot !== this.lastSlot) {
      this.adsToggled = false;
      this.lastSlot = c.activeSlot;
    }

    // Quick heals.
    i.useItem = null;
    for (const [a, patterns, defaults] of HEAL_KEYS) if (inp.wasPressed(a)) i.useItem = this.resolveItem(c, patterns, defaults);

    // Perspective toggle (only when the match allows TPP).
    if (inp.wasPressed('togglePerspective')) {
      const allowTpp = ctx.match?.config ? ctx.match.config.perspective !== 'fpp' : true;
      const next = ctx.cameraRig.perspective === 'tpp' ? 'fpp' : 'tpp';
      if (next === 'fpp' || allowTpp) ctx.cameraRig.setPerspective(next);
    }

    // Vehicle controls (driver) + seat switching.
    const v = i.vehicle;
    v.throttle = ay;
    v.steer = ax;
    v.handbrake = inp.isDown('vehicleHandbrake');
    v.boost = inp.isDown('vehicleBoost');
    v.horn = inp.isDown('vehicleHorn');
    v.pitch = (inp.isDown('walk') ? -1 : 0) + (inp.isDown('crouch') ? 1 : 0);
    i.switchSeat = inp.wasPressed('seat1') ? 0 : inp.wasPressed('seat2') ? 1 : inp.wasPressed('seat3') ? 2 : inp.wasPressed('seat4') ? 3 : null;
  }

  /**
   * RMB semantics (settings.controls.aimMode):
   *  - hybrid (PUBG default): click toggles ADS; hold = over-the-shoulder aim in TPP (ADS in FPP) while held.
   *  - hold: ADS while held.  - toggle: click toggles ADS.
   */
  private updateAim(c: Character, now: number): void {
    const inp = ctx.input;
    const i = c.intent;
    const mode = ctx.settings.data.controls.aimMode;
    const fpp = ctx.cameraRig.perspective === 'fpp';
    if (inp.wasPressed('aim')) {
      this.rmbHeld = true;
      this.rmbPressTime = now;
    }
    const held = this.rmbHeld && inp.isDown('aim');
    const heldLong = held && now - this.rmbPressTime >= CLICK_TIME;
    if (inp.wasReleased('aim') && this.rmbHeld) {
      this.rmbHeld = false;
      const short = now - this.rmbPressTime < CLICK_TIME;
      if (mode !== 'hold' && short) this.adsToggled = !this.adsToggled;
    }
    if (!inp.isDown('aim')) this.rmbHeld = false;
    // Sprinting forward cancels a toggled ADS.
    if (i.sprint && i.moveY > 0) this.adsToggled = false;
    if (c.mode !== 'ground' && c.mode !== 'vehicle') this.adsToggled = false;

    if (mode === 'hold') {
      i.ads = held;
      i.aim = held;
    } else if (mode === 'toggle') {
      i.ads = this.adsToggled;
      i.aim = this.adsToggled;
    } else {
      i.ads = this.adsToggled || (fpp && heldLong);
      i.aim = i.ads || heldLong || (held && !this.adsToggled && now - this.rmbPressTime > 0.08);
    }
  }

  private resolveItem(c: Character, patterns: RegExp[], defaults: string[]): string | null {
    const defs = ctx.items?.defs ?? {};
    const ids = Object.keys(defs);
    for (const re of patterns) {
      const id = ids.find((k) => re.test(k) || re.test(defs[k].name));
      if (id && c.inventory.count(id) > 0) return id;
    }
    for (const id of defaults) if (c.inventory.count(id) > 0) return id;
    // Let the items module reject it (UI feedback) if nothing is carried.
    const first = ids.find((k) => patterns[0].test(k));
    return first ?? defaults[0];
  }
}
