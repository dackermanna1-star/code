import * as THREE from 'three';
import { G } from '../core/G';
import { bump, clamp, damp, easeInOutCubic, easeOutCubic, lerp, rand, ramp4, smoothstep } from '../core/math';
import { GRENADE, WEAPON_MAP, WeaponDef, statsFor } from './defs';
import { buildGrenade, buildWeaponModel, WeaponModel } from './models';
import { Viewmodel } from './Viewmodel';
import { Kick } from './Kick';
import { Emote, Pee } from './Gestures';
import { Gojo } from '../gojo/Gojo';
import { cursedPostFrame } from '../gojo/GojoFX';
import { Sukuna } from '../sukuna/Sukuna';
import { randomCone } from './Ballistics';
import { C, mat } from './ModelBuilder';

type Stats = ReturnType<typeof statsFor>;

export interface OwnedWeapon {
  id: string;
  def: WeaponDef;
  level: number;
  s: Stats;
  ammo: number;
  needsCycle: boolean;
  model: WeaponModel | null;
  cyl: number;
  lockedBack: boolean;
}

type State = 'idle' | 'equip' | 'holster' | 'cycle' | 'reload' | 'throw';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

const FLASH: Record<string, number> = {
  pistol: 0.13, shotgun: 0.3, smg: 0.16, rifle: 0.2, mg: 0.25, marksman: 0.22, sniper: 0.3, launcher: 0.35, bow: 0, energy: 0, flame: 0, particle: 0,
};

export class WeaponController {
  readonly vm: Viewmodel;
  slots: (OwnedWeapon | null)[] = [null, null, null, null];
  cur = 0;
  prevSlot = 1;
  state: State = 'equip';
  stateT = 0;
  stateDur = 0.45;
  private pendingSlot = -1;
  cooldown = 0;
  burstLeft = 0;
  ads = 0;
  spin = 0;
  heat = 0;
  charge = 0;
  draw = 0;
  bloom = 0;
  fireT = 10;
  grenades = 1;
  // reload sub-state
  private rl = { shell: false, phase: 'start' as 'start' | 'shell' | 'end' | 'rack', emptyStart: false, dropped: false, inserted: false, charged: false };
  private cycleEjected = false;
  private cycleSoundA = false;
  private cycleSoundB = false;
  // grenade throw
  private thr = { phase: 'none' as 'none' | 'ready' | 'hold' | 'throw' | 'done', t: 0, released: false };
  private grenadeModel = buildGrenade();
  private arcLine: THREE.Line;
  private arcMarker: THREE.Mesh;
  private propMag: THREE.Object3D | null = null;
  private flameAcc = 0;
  private flameHitT = 0;
  private spinSoundT = 0;
  private lastShotT = -10;
  private sprintBlock = 0;
  onFire: ((w: OwnedWeapon) => void) | null = null;
  onKillFeed: ((s: string) => void) | null = null;
  strength = 1;
  /** Player movement multiplier from weapon handling. */
  moveMul = 1;
  private scopeHideT = 0;

  readonly kick: Kick;
  readonly emote: Emote;
  readonly pee = new Pee();
  /** Satoru Gojo mode (J): bare hands and the Limitless instead of guns. */
  readonly gojo: Gojo;
  /** Ryomen Sukuna mode (U): Dismantle, Cleave, Fuga and the Malevolent Shrine. */
  readonly sukuna: Sukuna;

  constructor() {
    this.vm = new Viewmodel();
    this.kick = new Kick(G.vmScene);
    this.emote = new Emote(G.vmScene);
    this.gojo = new Gojo();
    G.gojo = this.gojo;
    this.sukuna = new Sukuna();
    G.sukuna = this.sukuna;
    this.gojo.onRevert = this.sukuna.onRevert = () => {
      // the gun comes back up
      this.state = 'equip';
      this.stateT = 0;
      this.stateDur = 0.45;
      G.audio?.play('equip', { volume: 0.6 });
    };
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 64), 3));
    this.arcLine = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xfff2a0, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.85, depthTest: true }));
    this.arcLine.frustumCulled = false;
    this.arcLine.visible = false;
    G.scene.add(this.arcLine);
    const rg = new THREE.RingGeometry(0.5, 0.62, 24);
    rg.rotateX(-Math.PI / 2);
    this.arcMarker = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.8, depthWrite: false }));
    this.arcMarker.visible = false;
    G.scene.add(this.arcMarker);
  }

  get w(): OwnedWeapon | null {
    return this.slots[this.cur];
  }

  /** Rebuild owned weapons for a loadout (keeps ammo when possible). */
  setLoadout(ids: (string | null)[], levels: Record<string, number>) {
    const old = new Map(this.slots.filter(Boolean).map((w) => [w!.id, w!]));
    this.slots = ids.slice(0, 4).map((id) => {
      if (!id || !WEAPON_MAP[id]) return null;
      const def = WEAPON_MAP[id];
      const level = levels[id] ?? 0;
      const prev = old.get(id);
      if (prev && prev.level === level) return prev;
      const s = statsFor(def, level);
      return { id, def, level, s, ammo: s.mag, needsCycle: false, model: null, cyl: 0, lockedBack: false };
    });
    while (this.slots.length < 4) this.slots.push(null);
    if (!this.slots[this.cur]) this.cur = this.slots.findIndex(Boolean);
    if (this.cur < 0) this.cur = 0;
    this.equip(this.cur, true);
  }

  refillAll() {
    for (const w of this.slots) if (w) {
      w.ammo = w.s.mag;
      w.needsCycle = false;
      w.lockedBack = false;
    }
  }

  private ensureModel(w: OwnedWeapon) {
    if (!w.model) w.model = buildWeaponModel(w.id, w.s.visual);
    return w.model;
  }

  equip(slot: number, instant = false) {
    const w = this.slots[slot];
    if (!w) return;
    if (slot !== this.cur) this.prevSlot = this.cur;
    this.cur = slot;
    const m = this.ensureModel(w);
    this.vm.setModel(m, w.def.category === 'bow');
    this.resetParts(w);
    this.state = 'equip';
    this.stateT = instant ? 0.4 : 0;
    this.stateDur = 0.42;
    this.spin = 0;
    this.heat = 0;
    this.charge = 0;
    this.draw = 0;
    this.burstLeft = 0;
    G.player.weightMul = w.s.weight;
    G.audio?.play('equip', { volume: 0.6 });
  }

  private resetParts(w: OwnedWeapon) {
    const m = w.model;
    if (!m) return;
    const rest = (m.mb as any).rest as Map<THREE.Object3D, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }> | undefined;
    if (!rest) {
      const map = new Map();
      for (const k of Object.keys(m.mb.parts)) {
        const o = m.mb.parts[k];
        map.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
      }
      (m.mb as any).rest = map;
    } else {
      for (const [o, r] of rest) {
        o.position.copy(r.p);
        o.quaternion.copy(r.q);
        o.scale.copy(r.s);
        o.visible = o.name !== 'oldmag';
      }
    }
  }
  private rest(name: string) {
    const m = this.w?.model;
    if (!m) return null;
    const o = m.mb.parts[name];
    if (!o) return null;
    const r = ((m.mb as any).rest as Map<THREE.Object3D, any>).get(o);
    return { o, r };
  }

  private switchTo(slot: number) {
    if (slot === this.cur || !this.slots[slot]) return;
    if (this.state === 'throw') return;
    this.pendingSlot = slot;
    this.state = 'holster';
    this.stateT = 0;
    this.stateDur = 0.2;
  }

  startReload() {
    const w = this.w;
    if (!w || this.state === 'reload' || this.state === 'throw' || this.state === 'equip' || this.state === 'holster') return;
    if (w.ammo >= w.s.mag || w.s.reloadType === 'none') return;
    this.state = 'reload';
    this.stateT = 0;
    this.rl.emptyStart = w.ammo === 0;
    this.rl.dropped = false;
    this.rl.inserted = false;
    this.rl.charged = false;
    this.charge = 0;
    this.spin = Math.min(this.spin, 0.5);
    if (w.s.reloadType === 'shell') {
      this.rl.shell = true;
      this.rl.phase = 'start';
      this.stateDur = 0.28;
    } else {
      this.rl.shell = false;
      this.stateDur = w.s.reload;
    }
    G.audio?.play('reloadStart', { volume: 0.5 });
  }

  // -------------------------------------------------------------------------
  update(dt: number) {
    const w = this.w;
    const input = G.input;
    const pl = G.player;
    this.fireT += dt;
    this.cooldown -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 6);
    this.sprintBlock = Math.max(0, this.sprintBlock - dt);
    this.stateT += dt;

    // ---- gestures: K toggles pee mode, hold T to flip off the horde
    const gestureOk = pl.alive && !G.game?.uiBlocking && !G.placement?.active;
    if (!pl.alive && this.pee.on) this.pee.reset();

    // ---- J: become Satoru Gojo, U: let Sukuna out (pressing the other key swaps straight over)
    const gojo = this.gojo;
    const suk = this.sukuna;
    cursedPostFrame(dt);
    if (!pl.alive) {
      if (gojo.active) gojo.forceRevert();
      if (suk.active) suk.forceRevert();
    }
    if (gestureOk && this.state !== 'throw') {
      if (input.pressed('KeyJ')) {
        if (suk.active) suk.forceRevert();
        if (gojo.toggle() && this.pee.on) this.pee.reset();
      } else if (input.pressed('KeyU')) {
        if (gojo.active) gojo.forceRevert();
        if (suk.toggle() && this.pee.on) this.pee.reset();
      }
    }
    if (gojo.active || suk.active) {
      this.updateCursed(dt, gestureOk);
      return;
    }
    this.vm.armSet = 'glove';

    if (gestureOk && input.pressed('KeyK') && this.state !== 'throw') this.pee.toggle();
    const peeing = this.pee.on;
    const wantEmote = gestureOk && !peeing && !!w && input.down('KeyT') && (this.state === 'idle' || this.state === 'cycle');
    // only a held T blocks switching/reloading; the hand drops back while the next action starts
    const emoting = wantEmote;

    // ---- slot switching
    if (pl.alive && this.state !== 'throw' && !G.placement?.active && !peeing) {
      const wheel = input.consumeWheel();
      if (!emoting) for (let i = 0; i < 4; i++) if (input.pressed('Digit' + (i + 1))) this.switchTo(i);
      if (wheel !== 0 && !emoting) {
        for (let k = 1; k <= 4; k++) {
          const i = (this.cur + (wheel > 0 ? k : -k) + 8) % 4;
          if (this.slots[i]) {
            this.switchTo(i);
            break;
          }
        }
      }
      if (!emoting) {
        if (input.pressed('KeyQ')) this.switchTo(this.prevSlot);
        if (input.pressed('KeyR')) this.startReload();
        if (input.pressed('KeyG') && this.grenades > 0 && this.state !== 'reload') this.beginThrow();
      }
      if ((input.pressed('KeyV') || input.mousePress(1)) && !G.game?.uiBlocking) this.kick.tryStart();
    }

    // ---- state machine
    if (this.state === 'holster' && this.stateT >= this.stateDur) {
      if (this.pendingSlot >= 0) this.equip(this.pendingSlot);
      this.pendingSlot = -1;
    } else if (this.state === 'equip' && this.stateT >= this.stateDur) {
      this.state = 'idle';
    } else if (this.state === 'cycle' && this.stateT >= this.stateDur) {
      this.state = 'idle';
      if (w) w.needsCycle = false;
    } else if (this.state === 'reload' && w) {
      this.updateReload(w);
    } else if (this.state === 'throw') {
      this.updateThrow(dt);
    }

    // ---- ADS
    const canAds = pl.alive && w && this.state !== 'throw' && this.state !== 'holster' && !(this.state === 'reload' && w.def.category !== 'bow') && !G.placement?.active && !peeing && !emoting && !this.emote.active;
    const wantAds = canAds && input.mouse(2);
    this.ads = damp(this.ads, wantAds ? 1 : 0, wantAds ? 13 : 16, dt);
    this.vm.ads = w?.def.scope ? Math.min(1, this.ads * 1.6) : this.ads;
    const scoped = !!w?.def.scope && this.ads > 0.85;
    G.renderer.post.scope = scoped ? clamp((this.ads - 0.85) / 0.1, 0, 1) : 0;
    this.vm.hideWeapon = scoped;
    this.vm.hideArms = scoped;
    const adsFov = w ? w.s.adsFov ?? w.def.adsFov : 1;
    pl.fovMul = lerp(1, adsFov, this.ads);
    this.moveMul = 1 - this.ads * 0.35 - (this.spin > 0.2 ? 0.25 : 0) - this.draw * 0.3;
    pl.moveMul = this.moveMul * (peeing ? 0.55 : 1);

    // ---- firing
    if (w && pl.alive && this.state !== 'throw' && !G.placement?.active && !G.game?.uiBlocking && !peeing) this.updateTrigger(w, dt);
    else {
      this.spin = Math.max(0, this.spin - dt * 1.2);
      this.heat = Math.max(0, this.heat - dt * 1.5);
      this.charge = 0;
      if (this.draw > 0) this.draw = Math.max(0, this.draw - dt * 3);
    }

    // ---- animation
    this.animate(dt);
    this.gojo.update(dt, this.vm, false);
    this.sukuna.update(dt, this.vm, false);
    this.kick.update(dt, this.vm);
    this.pee.update(dt, this.vm, pl.alive && !G.game?.uiBlocking && input.mouse(0));
    this.emote.update(dt, this.vm, wantEmote, w?.def.category === 'bow');
    const [mdx, mdy] = [G.input.mouseDX, G.input.mouseDY];
    this.vm.update(dt, mdx, mdy, pl.moving ? Math.min(1, Math.hypot(pl.vel.x, pl.vel.z) / 4.7) : 0, pl.sprinting && this.sprintBlock <= 0 && this.ads < 0.2, pl.onGround);
    void this.scopeHideT;
  }

  /** Gojo or Sukuna: the guns are put away; the hands belong to the technique. */
  private updateCursed(dt: number, ok: boolean) {
    const vm = this.vm;
    const pl = G.player;
    const input = G.input;
    const cur = this.gojo.active ? this.gojo : this.sukuna;
    this.ads = damp(this.ads, 0, 16, dt);
    vm.ads = this.ads;
    G.renderer.post.scope = 0;
    this.spin = Math.max(0, this.spin - dt * 1.2);
    this.heat = Math.max(0, this.heat - dt * 1.5);
    this.charge = 0;
    this.draw = Math.max(0, this.draw - dt * 3);
    this.burstLeft = 0;
    vm.hideArms = false;
    if (pl.alive && !G.game?.uiBlocking && (input.pressed('KeyV') || input.mousePress(1))) this.kick.tryStart();
    if (cur.armsReady) {
      vm.armSet = 'gojo';
      vm.hideWeapon = true;
      vm.animPos.set(0, 0, 0);
      vm.animRot.set(0, 0, 0);
      vm.lower = 0;
      vm.lhTarget = null;
      vm.rhTarget = null;
      vm.leftProp.clear();
      vm.rightProp.clear();
    } else {
      // the gun goes down first
      vm.armSet = 'glove';
      vm.hideWeapon = false;
      this.animate(dt);
      vm.lower = Math.max(vm.lower, cur.gunLower);
    }
    this.gojo.update(dt, vm, ok && this.gojo.active);
    this.sukuna.update(dt, vm, ok && this.sukuna.active);
    pl.fovMul = cur.fovMul;
    this.moveMul = cur === this.sukuna ? 1.15 : 1.12;
    pl.moveMul = this.moveMul;
    this.kick.update(dt, vm);
    this.vm.update(dt, G.input.mouseDX, G.input.mouseDY, pl.moving ? Math.min(1, Math.hypot(pl.vel.x, pl.vel.z) / 4.7) : 0, pl.sprinting, pl.onGround);
  }

  // -------------------------------------------------------------------------
  private updateTrigger(w: OwnedWeapon, dt: number) {
    const input = G.input;
    const s = w.s;
    const mode = s.mode;
    const held = input.mouse(0);
    const pressed = input.mousePress(0);
    const released = input.mouseRelease(0);
    const ready = this.state === 'idle' || (this.state === 'reload' && this.rl.shell && w.ammo > 0 && pressed);
    if (this.state === 'reload' && this.rl.shell && pressed && w.ammo > 0) {
      // interrupt shell reload
      this.state = 'idle';
    }

    // ran dry: start reloading on its own once the trigger is let go
    if (this.state === 'idle' && w.ammo <= 0 && s.reloadType !== 'none' && !held && this.fireT > 0.3 && this.cooldown <= 0) {
      this.startReload();
      return;
    }

    // special continuous modes
    if (mode === 'spin') {
      if (held && this.state === 'idle') this.spin = Math.min(1, this.spin + dt / 0.85);
      else this.spin = Math.max(0, this.spin - dt / 1.4);
      this.spinSoundT -= dt;
      if (this.spin > 0.05 && this.spinSoundT <= 0) {
        this.spinSoundT = 0.12;
        G.audio?.play('minigunSpin', { volume: 0.25 + this.spin * 0.35, pitch: 0.5 + this.spin * 0.8, voices: 3 });
      }
      if (held && this.spin >= 1 && this.state === 'idle') this.autoFire(w, dt);
      else if (pressed && w.ammo <= 0 && this.state === 'idle') this.dry(w);
      return;
    }
    if (mode === 'heat') {
      if (held && this.state === 'idle' && w.ammo > 0) {
        if (this.heat < 1 && this.heat + dt / 0.5 >= 1) G.audio?.play('laserReady', { volume: 0.6 });
        this.heat = Math.min(1, this.heat + dt / 0.5);
        if (this.heat < 1 && Math.random() < dt * 20) G.audio?.play('laserCharge', { volume: 0.2, pitch: 0.6 + this.heat, voices: 2 });
      } else this.heat = Math.max(0, this.heat - dt * 1.6);
      if (held && this.heat >= 1 && this.state === 'idle') this.autoFire(w, dt);
      else if (pressed && w.ammo <= 0 && this.state === 'idle') this.dry(w);
      return;
    }
    if (mode === 'charge') {
      const ch = s.charge!;
      if (held && this.state === 'idle' && w.ammo > 0) {
        const prev = this.charge;
        this.charge = Math.min(1, this.charge + dt / ch.time);
        if (Math.floor(prev * 8) !== Math.floor(this.charge * 8)) G.audio?.play('pirCharge', { volume: 0.35, pitch: 0.6 + this.charge * 1.2, voices: 2 });
        G.player.addTrauma(dt * 0.25 * this.charge);
      }
      if (released && this.charge > 0.05 && this.state === 'idle') {
        this.firePIR(w, this.charge);
        this.charge = 0;
      }
      if (!held) this.charge = Math.max(0, this.charge - dt * 3);
      if (pressed && w.ammo <= 0 && this.state === 'idle') this.dry(w);
      return;
    }
    if (mode === 'bow') {
      if (held && this.state === 'idle') {
        if (this.draw === 0) G.audio?.play('bowDraw', { volume: 0.6 });
        this.draw = Math.min(1, this.draw + dt / 0.7);
      }
      if (released && this.draw > 0.12 && this.state === 'idle') {
        this.fireArrow(w, this.draw);
        this.draw = 0;
        this.state = 'cycle';
        this.stateT = 0;
        this.stateDur = s.reload + 0.25;
      } else if (!held) this.draw = Math.max(0, this.draw - dt * 4);
      return;
    }
    if (mode === 'flame') {
      if (held && this.state === 'idle' && w.ammo > 0) this.flame(w, dt);
      else {
        this.flameAcc = 0;
        if (pressed && w.ammo <= 0 && this.state === 'idle') this.dry(w);
      }
      return;
    }

    if (!ready) return;
    if (mode === 'auto') {
      if (held) this.autoFire(w, dt);
      return;
    }
    if (mode === 'burst') {
      if (pressed && this.burstLeft <= 0 && this.cooldown <= 0) this.burstLeft = s.burst ?? 3;
      if (this.burstLeft > 0 && this.cooldown <= 0) {
        if (w.ammo <= 0) {
          this.burstLeft = 0;
          this.dry(w);
          return;
        }
        this.fireOnce(w);
        this.burstLeft--;
        this.cooldown = this.burstLeft > 0 ? 60 / s.rpm : 60 / s.rpm + 0.18;
      }
      return;
    }
    // semi / manual
    if (pressed && this.cooldown <= 0) {
      if (w.ammo <= 0) {
        this.dry(w);
        return;
      }
      if (w.needsCycle) {
        this.startCycle(w);
        return;
      }
      this.fireOnce(w);
      this.cooldown = 60 / s.rpm;
      if ((mode === 'pump' || mode === 'bolt') && w.ammo > 0) {
        w.needsCycle = true;
        this.startCycle(w);
      } else if (mode === 'pump' || mode === 'bolt') {
        w.needsCycle = true;
      }
    }
  }

  private autoFire(w: OwnedWeapon, dt: number) {
    if (this.cooldown > 0) return;
    if (w.ammo <= 0) {
      if (G.input.mousePress(0)) this.dry(w);
      return;
    }
    const interval = 60 / w.s.rpm;
    // fire possibly multiple rounds this frame at very high RPM
    let n = 0;
    while (this.cooldown <= 0 && w.ammo > 0 && n < 4) {
      this.fireOnce(w);
      this.cooldown += interval;
      n++;
    }
    if (this.cooldown < -interval) this.cooldown = 0;
    void dt;
  }

  private dry(w: OwnedWeapon) {
    G.audio?.play('dryFire', { volume: 0.7 });
    this.cooldown = 0.25;
    if (w.s.reloadType !== 'none') this.startReload();
  }

  private startCycle(w: OwnedWeapon) {
    this.state = 'cycle';
    this.stateT = 0;
    this.cycleEjected = false;
    this.cycleSoundA = false;
    this.cycleSoundB = false;
    const s = w.s;
    this.stateDur = s.mode === 'bolt' ? Math.max(0.75, 60 / s.rpm * 0.85) : Math.max(0.36, 60 / s.rpm * 0.9);
  }

  // -------------------------------------------------------------------------
  private muzzleWorld(out: THREE.Vector3) {
    const p = this.vm.anchorPos('muzzle', _v);
    return this.vm.toWorld(p, out);
  }

  private aimDir(out: THREE.Vector3) {
    return G.player.getAim(out);
  }

  private spreadDeg(w: OwnedWeapon) {
    const pl = G.player;
    let sp = w.s.spread;
    const mv = Math.min(1, Math.hypot(pl.vel.x, pl.vel.z) / 4.7);
    sp *= 1 + mv * 0.6 + (pl.onGround ? 0 : 1.5) + (pl.sprinting ? 0.6 : 0);
    if (w.s.pellets > 1) sp *= 1 - this.ads * 0.2;
    else sp *= 1 - this.ads * (w.def.scope ? 0.95 : 0.6);
    if (w.def.scope && this.ads < 0.8 && w.s.pellets === 1) sp += 2.5 * (1 - this.ads);
    return sp + this.bloom;
  }

  fireOnce(w: OwnedWeapon) {
    const s = w.s;
    const def = w.def;
    w.ammo--;
    this.fireT = 0;
    this.lastShotT = G.time;
    this.sprintBlock = 0.4;
    const cam = G.camera;
    const origin = cam.position;
    const aim = this.aimDir(_dir);
    const from = this.muzzleWorld(_v2.clone());
    const cat = def.category;
    const supp = def.special === 'suppressed';
    // projectile weapons
    if (def.projectile) {
      const p = def.projectile;
      const d = randomCone(aim, this.spreadDeg(w), new THREE.Vector3());
      const start = from.clone().addScaledVector(d, 0.1);
      G.projectiles.fire(
        { kind: p.kind, damage: s.damage, pen: s.pen, stopping: s.stopping, weapon: def.id, explosive: p.explosive, fire: p.fire, gravity: p.gravity },
        start,
        d,
        p.speed,
      );
      if (def.id === 'rpg') {
        // backblast
        const back = new THREE.Vector3().copy(aim).multiplyScalar(-1);
        for (let i = 0; i < 12; i++)
          G.fx.smoke.emit(origin.x + back.x * 0.8, origin.y - 0.1, origin.z + back.z * 0.8, back.x * rand(2, 6) + rand(-1, 1), rand(0, 1.5), back.z * rand(2, 6) + rand(-1, 1), rand(1, 2), 0.3, 1.8, 0.75, 0.75, 0.72, 0.6, 0.7, 0.7, 0.7, 0, 1.8, -0.02);
      }
    } else if (s.pellets > 1) {
      G.ballistics.spread(origin.x, origin.y, origin.z, aim, s.pellets, this.spreadDeg(w), {
        damage: s.damage, pen: s.pen, stopping: s.stopping, range: s.range, kind: 'pellet', weapon: def.id, falloffStart: 8, falloffMin: 0.35,
        tracer: true, from, tracerColor: 0xffc860, tracerWidth: 0.012, gore: 0.2, headMul: def.headMul,
      }, 2);
    } else {
      const d = randomCone(aim, this.spreadDeg(w), new THREE.Vector3());
      const laser = cat === 'energy';
      G.ballistics.ray(origin.x, origin.y, origin.z, d.x, d.y, d.z, {
        damage: s.damage, pen: s.pen, stopping: s.stopping, range: laser ? 220 : s.range, kind: laser ? 'laser' : 'bullet', weapon: def.id,
        tracer: !supp, from, tracerColor: laser ? 0x40e0ff : 0xffd27a, tracerWidth: laser ? 0.05 : cat === 'sniper' ? 0.03 : 0.018,
        headMul: def.headMul, eliteMul: def.eliteMul, gore: cat === 'sniper' || def.id === 'm2' ? 0.4 : 0, ignite: laser ? 2 : undefined,
      });
      if (laser) {
        G.fx.lights.muzzleFlash(from, 10, 0x40c0ff);
      }
    }
    // feedback
    const r = def.recoil;
    const adsK = 1 - this.ads * 0.35;
    G.player.addRecoil(r.pitch * rand(0.85, 1.15) * adsK, rand(-1, 1) * r.yaw * adsK, def.category === 'sniper' ? 5 : 9);
    G.player.addTrauma(r.shake * (1 - this.ads * 0.4));
    this.bloom = Math.min(6, this.bloom + r.pitch * 30);
    const flash = supp ? 0 : FLASH[cat] ?? 0.18;
    this.vm.fireKick(r.kick * (1 - this.ads * 0.4), flash * (def.id === 'm2' || def.id === 'minigun' ? 1.6 : 1));
    if (flash > 0) G.fx.lights.muzzleFlash(from, 14 + flash * 60);
    if (!supp && flash > 0) G.fx.muzzleSmoke(from.x, from.y, from.z, aim.x, aim.y, aim.z, cat === 'shotgun' ? 1.6 : 0.8);
    G.audio?.play(def.sound, { pitchVar: 0.04, weapon: true });
    this.onFire?.(w);
    // casings (auto-ejecting actions)
    const manual = s.mode === 'pump' || s.mode === 'bolt' || s.mode === 'break' || w.def.reloadType === 'revolver' || w.def.casing === 'none' || def.anim === 'break';
    if (!manual) this.ejectCasing(w);
    // pistol slide lock
    if (w.ammo === 0 && (def.anim === 'pistol' || def.anim === 'handcannon')) w.lockedBack = true;
    // revolver/M32 cylinder rotation
    w.cyl += 1;
    // Garand ping
    if (def.id === 'garand' && w.ammo === 0) {
      const ep = this.vm.toWorld(this.vm.anchorPos('eject', _v), new THREE.Vector3());
      G.fx.gibs.spawn(ep.x, ep.y, ep.z, rand(-0.5, 0.5), 3.5, rand(-0.5, 0.5), 0.03, 0.02, 0.045, 0xd9a843);
      G.audio?.play('garandPing', { volume: 0.9 });
      const c = this.rest('clip');
      if (c) c.o.visible = false;
    }
    // M1911 air strike
    if (def.special === 'airstrike' && w.ammo === 0) {
      const hp = G.player.hp / G.player.maxHp;
      const chance = hp < 0.5 ? 1 : lerp(1, 0.1, (hp - 0.5) / 0.5);
      if (Math.random() < chance) G.airstrike?.call();
    }
    if (w.ammo === 0 && s.reloadType !== 'none' && def.category !== 'bow' && s.mode !== 'pump' && s.mode !== 'bolt') {
      // auto reload shortly after emptying
      setTimeout(() => {
        if (this.w === w && w.ammo === 0 && this.state === 'idle') this.startReload();
      }, 250);
    }
  }

  private ejectCasing(w: OwnedWeapon) {
    const kind = w.def.casing;
    if (kind === 'none') return;
    const p = this.vm.toWorld(this.vm.anchorPos('eject', _v), new THREE.Vector3());
    const cam = G.camera;
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const f = _v2.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const pv = G.player.vel;
    const sp = rand(1.8, 3.2);
    const vx = _right.x * sp + _up.x * 1.5 + f.x * rand(-0.3, 0.6) + pv.x;
    const vy = _right.y * sp + _up.y * rand(1.5, 2.8) + pv.y * 0.5;
    const vz = _right.z * sp + _up.z * 1.5 + f.z * rand(-0.3, 0.6) + pv.z;
    const floor = Math.max(0, G.player.pos.y > 0.3 ? G.player.pos.y : 0);
    if (kind === 'shell') G.fx.shells.spawn(p.x, p.y, p.z, vx, vy, vz, 0.022, 0.058, 0.022, undefined, floor);
    else if (kind === 'big') G.fx.bigCasings.spawn(p.x, p.y, p.z, vx, vy, vz, 0.017, 0.075, 0.017, undefined, floor);
    else if (kind === 'rifle') G.fx.casings.spawn(p.x, p.y, p.z, vx, vy, vz, 0.011, 0.045, 0.011, undefined, floor);
    else G.fx.casings.spawn(p.x, p.y, p.z, vx, vy, vz, 0.01, 0.022, 0.01, undefined, floor);
  }

  private fireArrow(w: OwnedWeapon, draw: number) {
    const def = w.def;
    const p = def.projectile!;
    const aim = this.aimDir(_dir);
    const from = this.muzzleWorld(new THREE.Vector3());
    const d = randomCone(aim, this.spreadDeg(w) * (1.5 - draw), new THREE.Vector3());
    const str = 1 + (this.strength - 1) * (def.strengthScale ?? 1);
    const dmg = w.s.damage * (0.25 + 0.75 * draw) * str;
    G.projectiles.fire(
      { kind: p.kind, damage: dmg, pen: w.s.pen * (0.4 + 0.6 * draw), stopping: w.s.stopping * draw, weapon: def.id, explosive: p.explosive, fire: p.fire, gravity: p.gravity },
      from.addScaledVector(d, 0.2),
      d,
      p.speed * (0.45 + 0.55 * draw),
    );
    G.audio?.play(def.sound, { pitchVar: 0.05 });
    this.vm.fireKick(0.5, 0);
    G.player.addRecoil(0.008, 0, 8);
    this.fireT = 0;
    this.onFire?.(w);
  }

  private firePIR(w: OwnedWeapon, c: number) {
    const ch = w.s.charge!;
    const cost = Math.max(1, Math.round(1 + c * (ch.maxAmmo - 1)));
    if (w.ammo <= 0) return;
    w.ammo = Math.max(0, w.ammo - cost);
    const k = c * c * 0.5 + c * 0.5;
    const dmg = lerp(ch.minDmg, ch.maxDmg, k);
    const pen = lerp(ch.minPen, ch.maxPen, k);
    const sp = lerp(ch.minSp, ch.maxSp, k);
    const cam = G.camera;
    const aim = this.aimDir(_dir);
    const from = this.muzzleWorld(new THREE.Vector3());
    const end = G.ballistics.ray(cam.position.x, cam.position.y, cam.position.z, aim.x, aim.y, aim.z, {
      damage: dmg, pen, stopping: sp, range: 220, kind: 'energy', weapon: w.def.id, gore: 0.6 + c, noImpactFx: true,
    });
    const color = w.level >= 2 ? 0xff50ff : w.level >= 1 ? 0x50ffd8 : 0xffa040;
    const ex = cam.position.x + aim.x * end;
    const ey = cam.position.y + aim.y * end;
    const ez = cam.position.z + aim.z * end;
    // beam: several stacked tracers for thickness
    for (let i = 0; i < 3; i++) G.fx.tracers.add(from.x, from.y, from.z, ex, ey, ez, G.time, color, 0.05 + c * 0.14 - i * 0.02, 900, 0.35 + c * 0.25, end);
    const n = Math.round(10 + c * 40);
    for (let i = 0; i < n; i++) {
      const t = Math.random();
      const px = from.x + (ex - from.x) * t;
      const py = from.y + (ey - from.y) * t;
      const pz = from.z + (ez - from.z) * t;
      const col = new THREE.Color(color);
      G.fx.sparksP.emit(px, py, pz, rand(-1, 1), rand(-1, 1), rand(-1, 1), rand(0.2, 0.5), 0.03, 0.01, col.r * 3, col.g * 3, col.b * 3, 1, col.r, col.g, col.b, 0, 1, 0.2);
    }
    G.fx.sparks(ex, ey, ez, -aim.x, -aim.y, -aim.z, Math.round(10 + c * 30), 8);
    if (c > 0.35) {
      G.explosions.explode(ex, Math.max(0.3, ey), ez, 1.5 + c * 3, 30 + c * 90, { source: 'player', gore: 1, weapon: w.def.id, player: false, force: 0.8 });
    }
    G.fx.lights.muzzleFlash(from, 30 + c * 60, color);
    G.player.addRecoil(0.02 + c * 0.08, rand(-0.01, 0.01), 6);
    G.player.addTrauma(0.1 + c * 0.45);
    this.vm.fireKick(1 + c * 2.5, 0);
    G.postKick?.(0.2 + c * 0.6);
    G.audio?.play('pirFire', { volume: 0.7 + c * 0.3, pitch: 1.2 - c * 0.4 });
    this.cooldown = 0.35;
    this.fireT = 0;
    this.onFire?.(w);
  }

  private flame(w: OwnedWeapon, dt: number) {
    const f = w.def.flame!;
    w.ammo = Math.max(0, w.ammo - dt * 10);
    this.fireT = 0;
    const aim = this.aimDir(_dir);
    const from = this.muzzleWorld(new THREE.Vector3());
    const blue = f.color === 'blue';
    this.flameAcc += dt * 90;
    const pv = G.player.vel;
    while (this.flameAcc > 1) {
      this.flameAcc -= 1;
      const d = randomCone(aim, f.cone * 0.55, new THREE.Vector3());
      const sp = f.range * rand(1.3, 1.9);
      const life = rand(0.45, 0.75);
      const r0 = blue ? 1.2 : 3;
      const g0 = blue ? 1.8 : 1.6;
      const b0 = blue ? 3.2 : 0.4;
      G.fx.fire.emit(from.x, from.y, from.z, d.x * sp + pv.x, d.y * sp + rand(0, 1) + pv.y, d.z * sp + pv.z, life, 0.08, 0.7 + f.range * 0.04, r0, g0, b0, 1, 1.6, 0.25, 0.04, 0, 1.6, -0.35, rand(0, 6), rand(-3, 3));
    }
    if (Math.random() < dt * 8)
      G.fx.smoke.emit(from.x + aim.x * f.range * 0.8, from.y + aim.y * f.range * 0.8 + 0.5, from.z + aim.z * f.range * 0.8, rand(-0.5, 0.5), rand(0.5, 1.5), rand(-0.5, 0.5), rand(1.5, 3), 0.4, 2.2, 0.12, 0.11, 0.1, 0.45, 0.2, 0.19, 0.18, 0, 0.8, -0.06);
    G.fx.lights.muzzleFlash(from.clone().addScaledVector(aim, 2), 22 + Math.random() * 10, blue ? 0x80a0ff : 0xff8830);
    this.flameHitT -= dt;
    if (this.flameHitT <= 0) {
      this.flameHitT = 0.1;
      const cam = G.camera.position;
      const near: any[] = [];
      G.zombies.queryRadius(cam.x + aim.x * f.range * 0.5, cam.z + aim.z * f.range * 0.5, f.range * 0.6 + 1, near);
      const cosCone = Math.cos(((f.cone + 6) * Math.PI) / 180);
      for (const z of near) {
        const dx = z.x - cam.x;
        const dy = z.y + 1 - cam.y;
        const dz = z.z - cam.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > f.range + 0.5) continue;
        if ((dx * aim.x + dy * aim.y + dz * aim.z) / d < cosCone && d > 1.2) continue;
        G.zombies.damage(z, { damage: f.dps * 0.1, part: 1, x: z.x, y: z.y + 1, z: z.z, dx: aim.x, dy: 0, dz: aim.z, stopping: 5, pen: 0, kind: 'fire', weapon: w.def.id, noBlood: true });
        G.zombies.ignite(z, f.burn, 5, w.def.id);
      }
      // flames lick the ground and leave fire
      if (Math.random() < 0.18) {
        const hit = G.physics.castRay(cam.x, cam.y, cam.z, aim.x, aim.y, aim.z, f.range, (0xffff << 16) | 1);
        const t = hit ? hit.t : f.range;
        if (hit) G.fx.addFirePatch(cam.x + aim.x * t, cam.z + aim.z * t, 0.9, 4, f.burn, w.def.id);
      }
      // corpses catch fire
      const cs = G.ragdolls.corpsesNear(cam.x + aim.x * f.range * 0.6, cam.z + aim.z * f.range * 0.6, f.range * 0.4);
      for (const c of cs) if (c.burnT <= 0) c.burnT = 6;
      G.audio?.play(w.def.sound, { volume: 0.5, voices: 3 });
    }
    this.vm.fireKick(0.05, 0);
    if (w.ammo <= 0) this.startReload();
  }

  // -------------------------------------------------------------------------
  private updateReload(w: OwnedWeapon) {
    const s = w.s;
    if (this.rl.shell) {
      if (this.stateT < this.stateDur) return;
      this.stateT = 0;
      if (this.rl.phase === 'start') {
        this.rl.phase = 'shell';
        this.stateDur = s.reload;
        this.rl.inserted = false;
      } else if (this.rl.phase === 'shell') {
        if (w.ammo < s.mag && !G.input.mouse(0)) {
          this.stateDur = s.reload;
          this.rl.inserted = false;
        } else {
          this.rl.phase = 'end';
          this.stateDur = 0.25;
        }
      } else if (this.rl.phase === 'end') {
        if (this.rl.emptyStart || w.needsCycle) {
          this.rl.phase = 'rack';
          this.stateDur = 0.45;
          this.cycleEjected = true;
          this.cycleSoundA = false;
          this.cycleSoundB = false;
        } else this.state = 'idle';
      } else {
        w.needsCycle = false;
        this.state = 'idle';
      }
      return;
    }
    if (this.stateT >= this.stateDur) {
      w.ammo = w.s.mag;
      w.needsCycle = false;
      w.lockedBack = false;
      this.state = 'idle';
      this.resetParts(w);
    }
  }

  /** Insert-shell moment during a per-shell reload animation. */
  private shellInserted(w: OwnedWeapon) {
    if (w.ammo < w.s.mag) {
      w.ammo++;
      G.audio?.play('shellIn', { pitchVar: 0.06 });
    }
  }

  // -------------------------------------------------------------------------
  private beginThrow() {
    if (this.state === 'throw') return;
    this.state = 'throw';
    this.stateT = 0;
    this.thr.phase = 'ready';
    this.thr.t = 0;
    this.thr.released = false;
  }

  private updateThrow(dt: number) {
    const th = this.thr;
    th.t += dt;
    const held = G.input.down('KeyG');
    if (!held) th.released = true;
    if (th.phase === 'ready' && th.t > 0.38) {
      th.phase = 'hold';
      th.t = 0;
      G.audio?.play('grenadePin', { volume: 0.9 });
    }
    if (th.phase === 'hold') {
      this.updateArc(true);
      if (th.released && th.t > 0.05) {
        th.phase = 'throw';
        th.t = 0;
      }
    } else this.updateArc(false);
    if (th.phase === 'throw' && th.t >= 0.12 && !(th as any).thrown) {
      (th as any).thrown = true;
      const { pos, vel } = this.throwParams();
      G.projectiles.throwGrenade(pos, vel, GRENADE.fuse);
      this.grenades--;
      G.progress?.useGrenade?.();
      G.audio?.play('grenadeThrow', { volume: 0.8 });
    }
    if (th.phase === 'throw' && th.t >= 0.5) {
      (th as any).thrown = false;
      th.phase = 'none';
      this.state = 'equip';
      this.stateT = 0.1;
      this.stateDur = 0.4;
    }
  }

  private throwParams() {
    const cam = G.camera;
    const aim = this.aimDir(new THREE.Vector3());
    const pos = cam.position.clone().addScaledVector(aim, 0.4);
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    pos.addScaledVector(_right, 0.15);
    pos.y -= 0.05;
    const vel = aim.clone().multiplyScalar(17).add(new THREE.Vector3(0, 3.2, 0)).add(G.player.vel.clone().multiplyScalar(0.8));
    return { pos, vel };
  }

  private updateArc(show: boolean) {
    this.arcLine.visible = show;
    this.arcMarker.visible = show;
    if (!show) return;
    const { pos, vel } = this.throwParams();
    const arr = (this.arcLine.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const p = pos.clone();
    const v = vel.clone();
    let n = 0;
    let landed = false;
    for (let i = 0; i < 64; i++) {
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
      n = i + 1;
      if (landed) continue;
      const dt = 0.04;
      v.y -= 9.81 * dt;
      p.addScaledVector(v, dt);
      if (p.y <= 0.05) {
        p.y = 0.05;
        landed = true;
        this.arcMarker.position.set(p.x, 0.06, p.z);
      }
    }
    for (let i = n; i < 64; i++) {
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    }
    this.arcLine.geometry.getAttribute('position').needsUpdate = true;
    this.arcLine.computeLineDistances();
    this.arcMarker.scale.setScalar(1 + Math.sin(G.time * 8) * 0.08);
  }

  // -------------------------------------------------------------------------
  /** Procedural per-archetype animation. */
  private animate(dt: number) {
    const vm = this.vm;
    const w = this.w;
    vm.animPos.set(0, 0, 0);
    vm.animRot.set(0, 0, 0);
    vm.lhTarget = null;
    vm.rhTarget = null;
    vm.lhObj = null;
    vm.rhObj = null;
    vm.lhVisible = true;
    vm.rhVisible = true;
    vm.lower = 0;
    vm.leftProp.clear();
    vm.rightProp.clear();
    if (!w || !w.model) return;
    const m = w.model;
    const anim = w.def.anim;
    const k = clamp(this.stateT / Math.max(0.001, this.stateDur), 0, 1);
    this.resetParts(w);
    const P = m.mb.parts;
    const A = m.mb.anchors;

    // equip / holster
    if (this.state === 'equip') {
      const e = easeOutCubic(k);
      vm.lower = 1 - e;
      vm.animRot.z += (1 - e) * 0.4;
    } else if (this.state === 'holster') {
      vm.lower = easeInOutCubic(k);
    }

    // continuous visuals
    if (P.spin) P.spin.rotation.z = (P.spin.rotation.z + dt * this.spin * 60) % (Math.PI * 2);
    if (P.spin) (P.spin as any)._rot = ((P.spin as any)._rot ?? 0) + dt * this.spin * 60;
    if (P.spin) P.spin.rotation.z = (P.spin as any)._rot;
    if (P.coil) {
      const glow = w.def.category === 'energy' ? 0.3 + this.heat * 0.7 + (this.fireT < 0.1 ? 0.5 : 0) : 0.3 + this.charge * 1.5;
      P.coil.traverse((o) => {
        const mm = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
        if (mm && mm.emissive) mm.emissiveIntensity = glow * (0.8 + Math.random() * 0.4);
      });
      if (this.charge > 0) {
        vm.animPos.x += rand(-1, 1) * this.charge * 0.004;
        vm.animPos.y += rand(-1, 1) * this.charge * 0.004;
        if (Math.random() < this.charge * 0.6) {
          const mw = this.muzzleWorld(new THREE.Vector3());
          const a = Math.random() * Math.PI * 2;
          const col = new THREE.Color(w.level >= 2 ? 0xff50ff : w.level >= 1 ? 0x50ffd8 : 0xffa040);
          G.fx.sparksP.emit(mw.x + Math.cos(a) * 0.4, mw.y + Math.sin(a) * 0.4, mw.z, -Math.cos(a) * 2, -Math.sin(a) * 2, 0, 0.2, 0.02, 0.01, col.r * 3, col.g * 3, col.b * 3, 1, col.r, col.g, col.b, 1, 0, 0);
        }
      }
    }
    if (P.pilot) P.pilot.scale.setScalar(0.8 + Math.random() * 0.6);
    if (P.cylinder && (anim === 'revolver' || anim === 'mgl')) {
      const per = anim === 'mgl' ? Math.PI / 3 : Math.PI / 3;
      const target = w.cyl * per;
      const cur = (P.cylinder as any)._a ?? target;
      const na = damp(cur, target, 25, dt);
      (P.cylinder as any)._a = na;
      P.cylinder.rotation.z = na;
    }
    if (P.hammer) {
      const hk = this.fireT < 0.05 ? 0 : clamp((this.fireT - 0.05) / 0.12, 0, 1);
      P.hammer.rotation.x = -0.5 * hk + (anim === 'revolver' && this.fireT < 0.05 ? 0.2 : 0);
    }
    if (P.trigger) P.trigger.rotation.x = this.fireT < 0.08 ? -0.35 : 0;
    // slide/bolt kick on fire
    const slideK = this.fireT < 0.09 ? bump(this.fireT, 0, 0.09) : 0;
    if (P.slide) P.slide.position.z += (w.lockedBack ? 0.035 : slideK * 0.035);
    if (P.bolt && (anim === 'smg' || anim === 'rifle' || anim === 'lmg' || anim === 'garand')) P.bolt.position.z += slideK * 0.03;

    // bow string & arrow
    if (anim === 'bow') this.animBow(w, k);

    // missing rocket in RPG after firing
    if (anim === 'rpg' && P.rocket) P.rocket.visible = w.ammo > 0;

    if (this.state === 'cycle') this.animCycle(w, k);
    if (this.state === 'reload') this.animReload(w, k);
    if (this.state === 'throw') this.animThrow();
    void A;
  }

  private camPoint(x: number, y: number, z: number) {
    return new THREE.Vector3(x, y, z);
  }

  private lerpTarget(a: THREE.Vector3, b: THREE.Vector3, t: number) {
    return a.clone().lerp(b, clamp(t, 0, 1));
  }

  private supportPos() {
    return this.vm.anchorPos(this.w?.def.category === 'bow' ? 'grip' : 'support', new THREE.Vector3());
  }

  private animCycle(w: OwnedWeapon, k: number) {
    const vm = this.vm;
    const P = w.model!.mb.parts;
    const anim = w.def.anim;
    if (anim === 'pump' || (anim === 'shotmag' && P.pump)) {
      const back = smoothstep(0.12, 0.42, k) - smoothstep(0.48, 0.78, k);
      if (P.pump) P.pump.position.z += back * 0.085;
      vm.animRot.z -= bump(k, 0.1, 0.85) * 0.1;
      vm.animRot.x += bump(k, 0.1, 0.8) * 0.05;
      vm.animPos.y -= bump(k, 0.1, 0.85) * 0.012;
      if (k > 0.3 && !this.cycleSoundA) {
        this.cycleSoundA = true;
        G.audio?.play('pumpBack', {});
      }
      if (k > 0.4 && !this.cycleEjected) {
        this.cycleEjected = true;
        this.ejectCasing(w);
      }
      if (k > 0.6 && !this.cycleSoundB) {
        this.cycleSoundB = true;
        G.audio?.play('pumpForward', {});
      }
    } else if (anim === 'bolt') {
      const grab = ramp4(k, 0.08, 0.2, 0.78, 0.92);
      const up = smoothstep(0.18, 0.3, k) - smoothstep(0.66, 0.76, k);
      const back = smoothstep(0.3, 0.48, k) - smoothstep(0.5, 0.66, k);
      if (P.bolt) {
        P.bolt.rotation.z += up * 1.1;
        P.bolt.position.z += back * 0.075;
      }
      vm.animRot.z += bump(k, 0.05, 0.95) * 0.25;
      vm.animPos.y += bump(k, 0.05, 0.95) * 0.015;
      vm.animPos.x -= bump(k, 0.05, 0.95) * 0.02;
      if (grab > 0 && P.bolt) {
        const bp = P.bolt.getWorldPosition(new THREE.Vector3());
        const gp = this.vm.anchorPos('grip', new THREE.Vector3());
        vm.rhTarget = gp.lerp(bp.add(new THREE.Vector3(0.03, 0, 0)), grab);
      }
      if (k > 0.3 && !this.cycleSoundA) {
        this.cycleSoundA = true;
        G.audio?.play('boltBack', {});
      }
      if (k > 0.45 && !this.cycleEjected) {
        this.cycleEjected = true;
        this.ejectCasing(w);
      }
      if (k > 0.55 && !this.cycleSoundB) {
        this.cycleSoundB = true;
        G.audio?.play('boltForward', {});
      }
    } else if (anim === 'bow') {
      // nock a new arrow: right hand reaches back over the shoulder
      const reach = bump(k, 0.0, 0.8);
      const sp = this.vm.anchorPos('support', new THREE.Vector3());
      vm.rhTarget = sp.lerp(this.camPoint(0.18, -0.05, 0.05), reach);
      if (P.arrow) P.arrow.visible = k > 0.55;
    }
  }

  private animBow(w: OwnedWeapon, _k: number) {
    const P = w.model!.mb.parts;
    const d = easeOutCubic(this.draw);
    if (P.arrow) {
      P.arrow.position.z += d * 0.3;
      P.arrow.visible = this.state !== 'cycle' || this.stateT / this.stateDur > 0.55;
    }
    this.vm.animRot.z += 0.12;
    this.vm.animPos.z += d * 0.02;
    this.vm.animPos.x += d * 0.02;
    const st = P.string;
    if (st && st.children.length >= 2) {
      const nockZ = 0.035 + d * 0.3;
      const tipY = 0.3;
      const tipZ = 0.02 + 0.0;
      const segs = [st.children[0], st.children[1]];
      segs.forEach((c, i) => {
        const sy = i === 0 ? tipY : -tipY;
        const dy = sy;
        const dz = tipZ - nockZ;
        const len = Math.hypot(dy, dz);
        c.position.set(0, dy / 2, (tipZ + nockZ) / 2 - 0.035);
        c.scale.set(1, len, 1);
        c.rotation.set(Math.atan2(dz, dy) * (i === 0 ? -1 : 1) * (i === 0 ? -1 : -1), 0, 0);
        c.rotation.x = -Math.atan2(dz, dy);
      });
    }
  }

  private animReload(w: OwnedWeapon, k: number) {
    const vm = this.vm;
    const m = w.model!;
    const P = m.mb.parts;
    const anim = w.def.anim;
    const rt = w.s.reloadType;
    const off = this.camPoint(-0.12, -0.5, -0.2);

    if (this.rl.shell) {
      const ph = this.rl.phase;
      const tilt = ph === 'start' ? easeOutCubic(k) : ph === 'end' ? 1 - easeInOutCubic(k) : ph === 'rack' ? 0 : 1;
      vm.animRot.z += tilt * 0.55;
      vm.animRot.x += tilt * 0.12;
      vm.animPos.x -= tilt * 0.03;
      vm.animPos.y += tilt * 0.02;
      if (ph === 'shell') {
        const port = this.vm.anchorPos('magwell', new THREE.Vector3());
        const sup = this.supportPos();
        let t: THREE.Vector3;
        if (k < 0.35) t = this.lerpTarget(sup, off, easeInOutCubic(k / 0.35));
        else if (k < 0.72) t = this.lerpTarget(off, port.clone().add(new THREE.Vector3(0, -0.03, 0.04)), easeInOutCubic((k - 0.35) / 0.37));
        else if (k < 0.85) t = this.lerpTarget(port.clone().add(new THREE.Vector3(0, -0.03, 0.04)), port, (k - 0.72) / 0.13);
        else t = this.lerpTarget(port, sup, (k - 0.85) / 0.15);
        vm.lhTarget = t;
        if (k > 0.3 && k < 0.8) this.addShellProp();
        if (k >= 0.8 && !this.rl.inserted) {
          this.rl.inserted = true;
          this.shellInserted(w);
        }
      } else if (ph === 'rack') {
        const back = smoothstep(0.1, 0.4, k) - smoothstep(0.45, 0.8, k);
        if (P.pump) P.pump.position.z += back * 0.085;
        if (k > 0.25 && !this.cycleSoundA) {
          this.cycleSoundA = true;
          G.audio?.play('pumpBack', {});
        }
        if (k > 0.55 && !this.cycleSoundB) {
          this.cycleSoundB = true;
          G.audio?.play('pumpForward', {});
        }
      }
      return;
    }

    if (anim === 'revolver') {
      const open = smoothstep(0.02, 0.14, k) - smoothstep(0.84, 0.92, k);
      if (P.crane) P.crane.rotation.z += open * 1.45;
      const tilt = ramp4(k, 0, 0.14, 0.86, 1);
      vm.animRot.z += tilt * 0.75;
      vm.animRot.x += tilt * 0.3 + bump(k, 0.14, 0.32) * 0.95;
      vm.animPos.x -= tilt * 0.06;
      vm.animPos.y += tilt * 0.03;
      if (k > 0.24 && !this.rl.dropped) {
        this.rl.dropped = true;
        G.audio?.play('cylOpen', {});
        const cp = this.vm.anchorPos('magwell', new THREE.Vector3());
        const wp = this.vm.toWorld(cp, new THREE.Vector3());
        const spent = w.s.mag;
        for (let i = 0; i < spent; i++) G.fx.casings.spawn(wp.x + rand(-0.02, 0.02), wp.y, wp.z + rand(-0.02, 0.02), rand(-0.4, 0.4), rand(-1, 0.3), rand(-0.4, 0.4), 0.012, 0.03, 0.012);
      }
      const port = this.vm.anchorPos('magwell', new THREE.Vector3());
      const sup = this.supportPos();
      let t: THREE.Vector3;
      if (k < 0.28) t = sup;
      else if (k < 0.45) t = this.lerpTarget(sup, off, easeInOutCubic((k - 0.28) / 0.17));
      else if (k < 0.66) t = this.lerpTarget(off, port.clone().add(new THREE.Vector3(-0.02, 0.0, 0.07)), easeInOutCubic((k - 0.45) / 0.21));
      else if (k < 0.74) t = this.lerpTarget(port.clone().add(new THREE.Vector3(-0.02, 0.0, 0.07)), port.clone().add(new THREE.Vector3(-0.01, 0, 0.03)), (k - 0.66) / 0.08);
      else if (k < 0.84) t = this.lerpTarget(port.clone().add(new THREE.Vector3(-0.01, 0, 0.03)), off, easeInOutCubic((k - 0.74) / 0.1));
      else t = this.lerpTarget(off, sup, easeInOutCubic((k - 0.84) / 0.16));
      vm.lhTarget = t;
      if (k > 0.44 && k < 0.73) this.addSpeedloader(w.s.mag);
      if (k > 0.72 && !this.rl.inserted) {
        this.rl.inserted = true;
        G.audio?.play('speedloader', {});
      }
      if (k > 0.86 && !this.rl.charged) {
        this.rl.charged = true;
        G.audio?.play('cylClose', {});
      }
      return;
    }

    if (anim === 'break' || anim === 'gl') {
      const open = smoothstep(0.02, 0.2, k) - smoothstep(0.72, 0.84, k);
      if (P.break) P.break.rotation.x -= open * 0.75;
      const tilt = ramp4(k, 0, 0.18, 0.84, 1);
      vm.animRot.x += tilt * 0.3;
      vm.animRot.z += tilt * 0.2;
      vm.animPos.y += tilt * 0.02;
      if (k > 0.22 && !this.rl.dropped) {
        this.rl.dropped = true;
        G.audio?.play('breakOpen', {});
        if (w.def.casing !== 'none') {
          const ep = this.vm.toWorld(this.vm.anchorPos('eject', new THREE.Vector3()), new THREE.Vector3());
          const n = w.s.mag;
          for (let i = 0; i < n; i++) {
            if (w.def.casing === 'shell') G.fx.shells.spawn(ep.x, ep.y, ep.z, rand(-0.5, 0.5), rand(2, 3.5), rand(-0.5, 0.5), 0.022, 0.058, 0.022);
            else G.fx.bigCasings.spawn(ep.x, ep.y, ep.z, rand(-0.5, 0.5), rand(2, 3.5), rand(-0.5, 0.5), 0.017, 0.075, 0.017);
          }
        }
      }
      const port = this.vm.anchorPos('eject', new THREE.Vector3());
      const sup = this.supportPos();
      let t: THREE.Vector3;
      if (k < 0.26) t = sup;
      else if (k < 0.42) t = this.lerpTarget(sup, off, easeInOutCubic((k - 0.26) / 0.16));
      else if (k < 0.6) t = this.lerpTarget(off, port.clone().add(new THREE.Vector3(0, 0.02, 0.05)), easeInOutCubic((k - 0.42) / 0.18));
      else if (k < 0.7) t = this.lerpTarget(port.clone().add(new THREE.Vector3(0, 0.02, 0.05)), port, (k - 0.6) / 0.1);
      else t = this.lerpTarget(port, sup, easeInOutCubic((k - 0.7) / 0.3));
      vm.lhTarget = t;
      if (k > 0.42 && k < 0.68) this.addShellProp(w.def.casing === 'shell' ? 2 : 1, w.def.id === 'm79');
      if (k > 0.8 && !this.rl.charged) {
        this.rl.charged = true;
        G.audio?.play('breakClose', {});
      }
      return;
    }

    if (anim === 'rpg') {
      const port = this.vm.anchorPos('muzzle', new THREE.Vector3());
      const sup = this.supportPos();
      const tilt = ramp4(k, 0, 0.15, 0.85, 1);
      vm.animRot.x -= tilt * 0.35;
      vm.animPos.y -= tilt * 0.04;
      vm.animRot.z += tilt * 0.15;
      let t: THREE.Vector3;
      if (k < 0.3) t = this.lerpTarget(sup, off, easeInOutCubic(k / 0.3));
      else if (k < 0.62) t = this.lerpTarget(off, port.clone().add(new THREE.Vector3(0, 0, -0.2)), easeInOutCubic((k - 0.3) / 0.32));
      else if (k < 0.8) t = this.lerpTarget(port.clone().add(new THREE.Vector3(0, 0, -0.2)), port.clone().add(new THREE.Vector3(0, -0.04, 0.02)), (k - 0.62) / 0.18);
      else t = this.lerpTarget(port, sup, easeInOutCubic((k - 0.8) / 0.2));
      vm.lhTarget = t;
      if (P.rocket) P.rocket.visible = k > 0.78;
      if (k > 0.3 && k < 0.78 && P.rocket) {
        const r = P.rocket.clone();
        r.visible = true;
        r.position.set(0, 0, -0.1);
        this.vm.leftProp.add(r);
      }
      if (k > 0.78 && !this.rl.inserted) {
        this.rl.inserted = true;
        G.audio?.play('rocketLoad', {});
      }
      return;
    }

    // generic magazine / belt / clip / energy / fuel reload
    const tilt = ramp4(k, 0, 0.12, 0.88, 1);
    const isBelt = rt === 'belt';
    vm.animRot.z += tilt * (isBelt ? 0.25 : 0.45);
    vm.animRot.x += tilt * 0.12;
    vm.animPos.y += tilt * 0.02;
    vm.animPos.x -= tilt * 0.02;
    if (P.cover && isBelt) P.cover.rotation.x -= (smoothstep(0.1, 0.22, k) - smoothstep(0.8, 0.88, k)) * 1.4;
    if (P.cylinder && anim === 'mgl') {
      const open = smoothstep(0.05, 0.18, k) - smoothstep(0.82, 0.92, k);
      P.cylinder.position.x += open * 0.07;
      P.cylinder.position.y -= open * 0.02;
    }
    const magName = rt === 'clip' ? 'clip' : 'mag';
    const mag = P[magName];
    const well = this.vm.anchorPos('magwell', new THREE.Vector3());
    const sup = this.supportPos();
    const below = well.clone().add(new THREE.Vector3(0, -0.12, 0.04));
    let t: THREE.Vector3;
    if (k < 0.12) t = sup;
    else if (k < 0.24) t = this.lerpTarget(sup, well, easeInOutCubic((k - 0.12) / 0.12));
    else if (k < 0.42) t = this.lerpTarget(well, off, easeInOutCubic((k - 0.24) / 0.18));
    else if (k < 0.62) t = this.lerpTarget(off, below, easeInOutCubic((k - 0.42) / 0.2));
    else if (k < 0.74) t = this.lerpTarget(below, well, easeInOutCubic((k - 0.62) / 0.12));
    else if (k < 0.86 && this.rl.emptyStart && (P.bolt || P.slide)) {
      const bp = (P.bolt ?? P.slide)!.getWorldPosition(new THREE.Vector3());
      t = this.lerpTarget(well, bp.add(new THREE.Vector3(0.02, 0.01, 0)), easeInOutCubic((k - 0.74) / 0.12));
    } else t = this.lerpTarget(k < 0.86 ? well : (P.bolt ?? P.slide ?? P.root)!.getWorldPosition(new THREE.Vector3()), sup, easeInOutCubic((k - 0.86) / 0.14));
    vm.lhTarget = t;
    if (mag) {
      if (k > 0.24 && k < 0.66) {
        mag.visible = false;
        if (k < 0.42) {
          // the old mag drops away
          const dropK = (k - 0.24) / 0.18;
          mag.visible = true;
          mag.position.y -= dropK * dropK * 0.35;
          mag.rotation.x += dropK * 0.5;
        }
      } else if (k >= 0.66 && k < 0.74) {
        const ins = (k - 0.66) / 0.08;
        mag.position.y -= (1 - ins) * 0.06;
      }
      if (k > 0.42 && k < 0.66) {
        const clone = mag.clone();
        clone.visible = true;
        clone.position.set(0, 0.05, 0);
        clone.rotation.set(0, 0, 0);
        this.vm.leftProp.add(clone);
      }
    }
    if (k > 0.26 && !this.rl.dropped) {
      this.rl.dropped = true;
      G.audio?.play(isBelt ? 'coverOpen' : 'magOut', {});
      if (mag && rt !== 'energy' && rt !== 'fuel') {
        const wp = this.vm.toWorld(well, new THREE.Vector3());
        G.fx.splinters.spawn(wp.x, wp.y - 0.05, wp.z, rand(-0.3, 0.3), -0.5, rand(-0.3, 0.3), 0.03, 0.12, 0.05, isBelt ? 0x4d5a33 : 0x222226);
      }
    }
    if (k > 0.72 && !this.rl.inserted) {
      this.rl.inserted = true;
      G.audio?.play(rt === 'clip' ? 'clipIn' : isBelt ? 'beltIn' : 'magIn', {});
    }
    if (k > 0.8 && !this.rl.charged && this.rl.emptyStart) {
      this.rl.charged = true;
      G.audio?.play(isBelt ? 'coverClose' : w.def.category === 'pistol' ? 'slideRelease' : 'boltRack', {});
      if (P.bolt) P.bolt.position.z += 0.04;
    } else if (k > 0.84 && !this.rl.charged && isBelt) {
      this.rl.charged = true;
      G.audio?.play('coverClose', {});
    }
    if (P.clip && rt === 'clip') P.clip.visible = k > 0.7 || w.ammo > 0;
  }

  private shellMesh: THREE.Object3D | null = null;
  private addShellProp(n = 1, gl = false) {
    if (!this.shellMesh) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.05), mat(C.RED));
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.021, 0.021, 0.014), mat(C.BRASS));
      base.position.z = 0.02;
      g.add(body, base);
      this.shellMesh = g;
    }
    for (let i = 0; i < n; i++) {
      const s = this.shellMesh.clone();
      s.position.set(i * 0.024 - 0.012 * (n - 1), 0.02, -0.03);
      if (gl) s.scale.setScalar(1.6);
      this.vm.leftProp.add(s);
    }
  }
  private speedMesh: THREE.Object3D | null = null;
  private addSpeedloader(n: number) {
    if (!this.speedMesh) {
      const g = new THREE.Group();
      const hub = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.02), mat(C.BLACK));
      g.add(hub);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.03), mat(C.BRASS));
        r.position.set(Math.cos(a) * 0.013, Math.sin(a) * 0.013, -0.02);
        g.add(r);
      }
      this.speedMesh = g;
    }
    const s = this.speedMesh.clone();
    s.position.set(0.01, 0.02, -0.04);
    this.vm.leftProp.add(s);
    void n;
  }

  private animThrow() {
    const vm = this.vm;
    const th = this.thr;
    const gm = this.grenadeModel.root;
    vm.lower = th.phase === 'ready' ? easeInOutCubic(Math.min(1, th.t / 0.18)) : 1;
    vm.lhVisible = true;
    vm.rhVisible = true;
    // hands operate independently of the (lowered) weapon
    let rh: THREE.Vector3;
    let lh: THREE.Vector3;
    if (th.phase === 'ready') {
      const e = easeOutCubic(clamp((th.t - 0.12) / 0.2, 0, 1));
      rh = this.camPoint(0.14, -0.45 + e * 0.27, -0.32);
      lh = this.camPoint(-0.1, -0.5 + e * 0.3, -0.34);
      if (th.t > 0.26) {
        const pull = clamp((th.t - 0.26) / 0.12, 0, 1);
        lh = this.camPoint(-0.02 - pull * 0.12, -0.19 - pull * 0.05, -0.34);
      }
    } else if (th.phase === 'hold') {
      rh = this.camPoint(0.2, -0.12 + Math.sin(G.time * 4) * 0.005, -0.2);
      lh = this.camPoint(-0.16, -0.2, -0.4);
    } else {
      const t = th.t;
      const swing = easeOutCubic(clamp(t / 0.14, 0, 1));
      rh = this.camPoint(0.2 - swing * 0.18, -0.12 + swing * 0.06, -0.2 - swing * 0.35);
      lh = this.camPoint(-0.16, -0.2 - swing * 0.2, -0.4);
      if (t > 0.2) {
        const back = clamp((t - 0.2) / 0.3, 0, 1);
        rh.lerp(this.camPoint(0.14, -0.5, -0.3), back);
        lh.lerp(this.camPoint(-0.1, -0.5, -0.3), back);
      }
    }
    vm.rhTarget = rh;
    vm.lhTarget = lh;
    const held = th.phase === 'ready' || th.phase === 'hold' || (th.phase === 'throw' && th.t < 0.12);
    if (held) {
      const g = gm.clone();
      g.position.set(0, 0.02, -0.03);
      const pin = g.getObjectByName('pin');
      if (pin) pin.visible = th.phase === 'ready' && th.t < 0.3;
      vm.rightProp.add(g);
      if (th.phase !== 'ready' || th.t >= 0.3) {
        const ring = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.004), mat(C.CHROME));
        ring.position.set(0, 0.03, -0.02);
        vm.leftProp.add(ring);
      }
    }
  }

  /** HUD info. */
  info() {
    const w = this.w;
    if (!w) return null;
    return {
      name: w.s.levelName,
      ammo: Math.ceil(w.ammo),
      mag: w.s.mag,
      reloading: this.state === 'reload',
      reloadK: this.state === 'reload' ? (this.rl.shell ? w.ammo / w.s.mag : this.stateT / this.stateDur) : 0,
      mode: w.s.mode,
      spin: this.spin,
      heat: this.heat,
      charge: this.charge,
      draw: this.draw,
      fuel: w.def.category === 'flame',
      grenades: this.grenades,
      category: w.def.category,
    };
  }
}
