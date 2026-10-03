import * as THREE from 'three';
import { G } from '../core/G';
import { clamp, damp, easeInOutCubic, easeOutBack, easeOutCubic, lerp, rand, smoothstep } from '../core/math';
import { P, PART_COUNT } from '../zombies/skeleton';
import { S } from '../zombies/Zombie';
import type { Zombie } from '../zombies/Zombie';
import type { Ragdoll } from '../zombies/Ragdolls';
import type { HitInfo, ZombieHit } from '../zombies/ZombieManager';
import { ARM_GOJO } from '../weapons/Viewmodel';
import type { Viewmodel } from '../weapons/Viewmodel';
import { Arcs, Beam, Orb, ORB_BLUE, ORB_PURPLE, ORB_RED, Pulses, Streaks, clearLenses, setLens } from './GojoFX';
import { Domain } from './Domain';

/** Cooldowns (s). The domain's starts when the void collapses. */
export const GOJO_CD = { blue: 1.2, red: 2.0, purple: 14, domain: 40 };
/** Nothing gets closer than this: the space in between never runs out. */
const INFINITY_R = 1.3;
/** Right index fingertip in the hand frame (just past the nail). */
const TIP = new THREE.Vector3(-0.027, 0.004, -0.162);
/** In front of the left palm (Blue is cast palm-out). */
const PALM = new THREE.Vector3(0, -0.05, -0.035);
/** Above the left palm when it is turned up (Purple). */
const PALM_UP = new THREE.Vector3(0, -0.078, -0.03);
/** Where Blue and Red meet in front of the chest (hands-root space). */
const MEET = new THREE.Vector3(0, -0.045, -0.43);

const BLUE_R = 11;
/** Bodies Blue holds at once (a dense pile of ragdolls is expensive to simulate). */
const BLUE_HOLD = 14;
const RED_R = 12;
const PURPLE_RANGE = 240;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _hx = new THREE.Vector3();
const _hy = new THREE.Vector3();
const _hz = new THREE.Vector3();
const _m = new THREE.Matrix4();
const F3 = new Float32Array(3);

/** Orientation of a hand anchor: fingers along f, back of the hand toward b. */
export function handQuat(out: THREE.Quaternion, fx: number, fy: number, fz: number, bx: number, by: number, bz: number) {
  _hz.set(-fx, -fy, -fz).normalize();
  _hy.set(bx, by, bz);
  _hy.addScaledVector(_hz, -_hy.dot(_hz)).normalize();
  _hx.crossVectors(_hy, _hz);
  _m.makeBasis(_hx, _hy, _hz);
  return out.setFromRotationMatrix(_m);
}

/** Distance from p to segment ab. */
export function segDist(px: number, py: number, pz: number, a: THREE.Vector3, b: THREE.Vector3) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 1e-8 ? ((px - a.x) * abx + (py - a.y) * aby + (pz - a.z) * abz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (a.x + abx * t), py - (a.y + aby * t), pz - (a.z + abz * t));
}

/**
 * One of Gojo's bare hands: an anchor under the viewmodel's hands root that
 * glides toward a target pose. When it is not needed it drops out of view.
 */
export class Hand {
  readonly obj = new THREE.Object3D();
  private readonly tp = new THREE.Vector3();
  private readonly tq = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  /** Presence 0..1: slides in from below the screen. */
  k = 0;
  private want = false;
  private lambda = 14;
  pose = 'relax';
  rate = 16;
  shake = 0;

  constructor(parent: THREE.Object3D) {
    parent.add(this.obj);
  }

  set(px: number, py: number, pz: number, fx: number, fy: number, fz: number, bx: number, by: number, bz: number, pose: string, lambda = 14, rate = 16) {
    this.tp.set(px, py, pz);
    handQuat(this.tq, fx, fy, fz, bx, by, bz);
    this.pose = pose;
    this.lambda = lambda;
    this.rate = rate;
    this.want = true;
  }

  hide() {
    this.want = false;
  }

  /** Jump straight to the target (no glide). */
  snap() {
    this.p.copy(this.tp);
    this.q.copy(this.tq);
  }

  get visible() {
    return this.want || this.k > 0.02;
  }

  update(dt: number) {
    if (this.want && this.k < 0.02) this.snap();
    const a = 1 - Math.exp(-this.lambda * dt);
    this.p.lerp(this.tp, a);
    this.q.slerp(this.tq, a);
    this.k = damp(this.k, this.want ? 1 : 0, this.want ? 7.5 : 10, dt);
    const out = 1 - this.k;
    const o = this.obj;
    o.position.copy(this.p);
    o.position.y -= 0.42 * out;
    o.position.z += 0.08 * out;
    if (this.shake > 0) {
      o.position.x += (Math.random() - 0.5) * this.shake;
      o.position.y += (Math.random() - 0.5) * this.shake;
      o.position.z += (Math.random() - 0.5) * this.shake * 0.5;
    }
    o.quaternion.copy(this.q);
    o.userData.pose = this.pose;
    o.userData.rate = this.rate;
  }

  /** A point given in the hand frame, in hands-root space. */
  local(p: THREE.Vector3, out: THREE.Vector3) {
    return out.copy(p).applyQuaternion(this.obj.quaternion).add(this.obj.position);
  }
}

const BAND_FRAG = /* glsl */ `
uniform float uA;
varying vec2 vUv;
void main(){
  // Gojo's blindfold from the inside: dark cloth in soft folds, a little light at the lifted edge
  float fold = 0.5 + 0.5 * sin(vUv.x * 22.0 + sin(vUv.y * 7.0 + vUv.x * 3.0) * 2.2);
  float fold2 = 0.5 + 0.5 * sin(vUv.x * 9.0 - vUv.y * 4.0);
  vec3 col = mix(vec3(0.006, 0.007, 0.013), vec3(0.03, 0.034, 0.055), fold * 0.7 + fold2 * 0.3);
  float e = vUv.y;
  col += vec3(0.16, 0.2, 0.3) * exp(-e * 90.0) * 0.6;
  float a = smoothstep(0.0, 0.012, e) * (0.93 + 0.05 * fold);
  gl_FragColor = vec4(col, a * uA);
}`;
/** Middle fingertip (right hand frame), where the blindfold's edge sits. */
const MID_TIP = new THREE.Vector3(-0.009, -0.006, -0.145);

type RAct = 'idle' | 'red' | 'purple' | 'domain' | 'xform';

/**
 * Satoru Gojo. J to take off the blindfold. The bare hands cast the Limitless:
 * Lapse: Blue (hold LMB), Reversal: Red (RMB), Hollow Technique: Purple (R)
 * and Domain Expansion: Infinite Void (Z). Infinity keeps everything out.
 */
export class Gojo {
  active = false;
  readonly cd = { blue: 0, red: 0, purple: 0, domain: 0 };
  readonly domain: Domain;
  /** Camera zoom from the techniques (multiplies the player's FOV). */
  fovMul = 1;
  /** The gun goes down before the bare hands come up. */
  gunLower = 0;
  /** True once the bare hands replace the gloves and the gun. */
  armsReady = false;
  /** Fired when the mode ends (the gun comes back up). */
  onRevert: (() => void) | null = null;

  private time = 0;
  private rh!: Hand;
  private lh!: Hand;
  private handsParent: THREE.Object3D | null = null;
  private rAct: RAct = 'idle';
  private rT = 0;
  private xf = { t: -1, on: true, revealed: false };
  private fovPunch = 0;
  private fovZoom = 1;
  private sixPulse = 0;
  private blockT = 0;
  private rippleT = 0;
  private touchT = 0;
  private readonly ripplePos = new THREE.Vector3();

  // ---- FX
  private readonly streaks: Streaks;
  private readonly vmStreaks: Streaks;
  private readonly arcs: Arcs;
  private readonly vmArcs: Arcs;
  private readonly pulses: Pulses;
  private readonly ripples: Pulses;
  private readonly beam: Beam;
  private readonly orbBlue = new Orb(ORB_BLUE);
  private readonly orbRed = new Orb(ORB_RED);
  private readonly orbPurple = new Orb(ORB_PURPLE);
  private readonly vmBlue = new Orb(ORB_BLUE);
  private readonly vmRed = new Orb(ORB_RED);
  private readonly vmPurple = new Orb(ORB_PURPLE);
  private readonly lightA = new THREE.PointLight(0x3a78ff, 0, 18, 1.5);
  private readonly lightB = new THREE.PointLight(0xff2a1a, 0, 16, 1.5);
  private readonly lightC = new THREE.PointLight(0xa040ff, 0, 50, 1.4);
  private readonly vmLightA = new THREE.PointLight(0x3a78ff, 0, 0.9, 1.4);
  private readonly vmLightB = new THREE.PointLight(0xff3020, 0, 0.9, 1.4);
  private readonly band: THREE.Mesh;
  private readonly bandMat: THREE.ShaderMaterial;
  /** Hands-root space positions of the viewmodel orbs, and the same in viewmodel world space. */
  private readonly vmBluePos = new THREE.Vector3();
  private readonly vmRedPos = new THREE.Vector3();
  private readonly vmPurplePos = new THREE.Vector3();
  /** The same points in viewmodel world space (particle attractors). */
  private readonly vmBlueW = new THREE.Vector3();
  private readonly vmRedW = new THREE.Vector3();
  private readonly vmPurpleW = new THREE.Vector3();

  // ---- Lapse: Blue
  private readonly blue = {
    on: false,
    t: 0,
    holding: false,
    collapseT: -1,
    pos: new THREE.Vector3(),
    target: new THREE.Vector3(),
    tickT: 0,
    ringT: 0,
    wakeAcc: 0,
    grow: 0,
    held: 0,
  };
  private readonly coreT = new Map<Ragdoll, number>();

  // ---- Reversal: Red
  private readonly red = {
    phase: 'off' as 'off' | 'charge' | 'fly',
    t: 0,
    pos: new THREE.Vector3(),
    prev: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    dist: 0,
    hit: new Set<Zombie>(),
    flick: 0,
  };
  private readonly wave = { t: -1, pos: new THREE.Vector3(), range: 30, color: 1 };

  // ---- Hollow Technique: Purple
  private readonly purple = {
    phase: 'off' as 'off' | 'charge' | 'fly' | 'fade',
    t: 0,
    ft: 0,
    pos: new THREE.Vector3(),
    prev: new THREE.Vector3(),
    start: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    speed: 0,
    r: 0,
    dist: 0,
    trenchAcc: 0,
    beamI: 0,
    a0: new THREE.Vector3(),
    b0: new THREE.Vector3(),
    merged: false,
    launched: false,
    fxBudget: 0,
  };

  private readonly qz: Zombie[] = [];
  private readonly qc: any[] = [];
  private readonly hits: ZombieHit[] = [];

  constructor() {
    const camW = () => G.camera;
    const camV = () => G.vmCamera;
    this.streaks = new Streaks(G.scene, camW);
    this.vmStreaks = new Streaks(G.vmScene, camV, 0.015);
    this.arcs = new Arcs(G.scene);
    this.vmArcs = new Arcs(G.vmScene);
    this.pulses = new Pulses(G.scene);
    this.ripples = new Pulses(G.scene);
    this.beam = new Beam(G.scene);
    this.domain = new Domain(G.scene);
    this.domain.onPhase = (p) => {
      if (p === 'expand') this.callout('無量空処', 'INFINITE VOID', 'void', true);
      else if (p === 'inside') this.sixPulse = 1;
      else if (p === 'off') this.cd.domain = GOJO_CD.domain;
    };
    for (const o of [this.orbBlue, this.orbRed, this.orbPurple]) G.scene.add(o.group);
    for (const l of [this.lightA, this.lightB, this.lightC]) {
      l.layers.enableAll();
      G.scene.add(l);
    }
    G.vmScene.add(this.vmLightA, this.vmLightB);
    this.orbPurple.haloScale = 2.3;
    this.vmBlue.haloScale = this.vmRed.haloScale = 2.0;
    this.vmPurple.haloScale = 2.2;
    this.bandMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: BAND_FRAG,
      uniforms: { uA: { value: 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.band = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), this.bandMat);
    this.band.position.set(0, 0, -0.12);
    this.band.renderOrder = 80;
    this.band.visible = false;
    G.vmScene.add(this.band);
  }

  /** Hand anchors live under the viewmodel's hands root (bob and sway with it). */
  private attach(vm: Viewmodel) {
    if (this.handsParent === vm.handsRoot) return;
    this.handsParent = vm.handsRoot;
    this.rh = new Hand(vm.handsRoot);
    this.lh = new Hand(vm.handsRoot);
    for (const o of [this.vmBlue, this.vmRed, this.vmPurple]) vm.handsRoot.add(o.group);
  }

  get infinityRadius() {
    return this.active ? INFINITY_R : 0;
  }

  domainHides = (x: number, z: number) => this.domain.hides(x, z);

  /** Something is mid-cast: the mode can't be dropped right now. */
  get busy() {
    return this.purple.phase === 'charge' || this.domain.phase === 'sign' || this.domain.phase === 'expand' || this.xf.t >= 0;
  }

  /** J: take off the blindfold, or put the gun back in your hands. */
  toggle() {
    if (this.xf.t >= 0) return false;
    if (!this.active) {
      this.active = true;
      this.armsReady = false;
      this.xf = { t: 0, on: true, revealed: false };
      this.rAct = 'xform';
      this.rT = 0;
      return true;
    }
    if (this.busy) return false;
    this.xf = { t: 0, on: false, revealed: true };
    this.rAct = 'xform';
    this.rT = 0;
    if (this.blue.on && this.blue.collapseT < 0) this.blue.holding = false;
    G.audio?.play('gojoRevert', { volume: 0.8 });
    return true;
  }

  /** Back to normal at once (death, menus). */
  forceRevert() {
    if (!this.active && this.xf.t < 0) return;
    this.reset();
    this.active = false;
    this.armsReady = false;
    this.xf.t = -1;
    this.rAct = 'idle';
    this.onRevert?.();
  }

  /** New day / menu: tear every technique down (the mode itself stays). */
  reset() {
    this.domain.end();
    this.blue.on = false;
    this.blue.collapseT = -1;
    this.red.phase = 'off';
    this.purple.phase = 'off';
    this.purple.beamI = 0;
    this.wave.t = -1;
    this.coreT.clear();
    if (G.game) G.game.timeScale = 1;
    for (const k of Object.keys(this.cd) as (keyof typeof this.cd)[]) this.cd[k] = 0;
    this.streaks.clear();
    this.vmStreaks.clear();
    this.pulses.clear();
    this.ripples.clear();
    this.arcs.begin();
    this.arcs.end();
    this.vmArcs.begin();
    this.vmArcs.end();
    this.beam.intensity = 0;
    this.beam.update(this.time);
    for (const o of [this.orbBlue, this.orbRed, this.orbPurple, this.vmBlue, this.vmRed, this.vmPurple]) o.group.visible = false;
    this.lightA.intensity = this.lightB.intensity = this.lightC.intensity = this.vmLightA.intensity = this.vmLightB.intensity = 0;
    this.band.visible = false;
    if (this.xf.t >= 0) {
      // finish a transformation (either way) instantly
      this.xf.t = -1;
      this.gunLower = 0;
      if (this.xf.on) this.armsReady = this.active;
      else {
        this.active = false;
        this.armsReady = false;
        this.onRevert?.();
      }
    }
    this.rAct = 'idle';
    this.silence();
    clearLenses();
  }

  /** Loops off (pause, shop). */
  silence() {
    const a = G.audio;
    if (!a) return;
    a.loop('blueLoop', 0);
    a.loop('purpleLoop', 0);
    a.loop('domainLoop', 0);
  }

  /** Player.damage was stopped by Infinity. */
  blocked(from?: THREE.Vector3) {
    if (this.blockT > 0) return;
    this.blockT = 0.08;
    const pl = G.player;
    let dx: number;
    let dz: number;
    if (from) {
      dx = from.x - pl.pos.x;
      dz = from.z - pl.pos.z;
    } else {
      const f = pl.forward;
      dx = f.x;
      dz = f.z;
    }
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const x = pl.pos.x + dx * 1.1;
    const y = pl.pos.y + 1.25;
    const z = pl.pos.z + dz * 1.1;
    this.ripples.shell(x, y, z, 0.05, 0.8, 0.34, 0xa8e4ff, 1.7);
    for (let i = 0; i < 16; i++) {
      const s = rand(2, 6);
      this.streaks.emit(x, y + rand(-0.3, 0.3), z, dx * s + rand(-2, 2), rand(-1.5, 2.5), dz * s + rand(-2, 2), rand(0.15, 0.32), 0.01, 0.8, 1.5, 2.6, { drag: 3, stretch: 0.03 });
    }
    this.ripplePos.set(x, y, z);
    this.rippleT = 0.36;
    G.audio?.play('infinityBlock', { x, y, z, volume: 0.8 });
    // whatever reached for him bounces off
    const near = G.zombies.nearest(x, z, 2.6);
    if (near && near.type.id !== 'boss') {
      const k = 7 * (1 - near.type.knockResist);
      near.knockX += dx * k;
      near.knockZ += dz * k;
      near.kickSpring(S.TorsoPitch, -4);
    }
  }

  /** HUD: per technique key, glyph, cooldown fraction, active. */
  hud() {
    const d = this.domain;
    return {
      armsReady: this.armsReady,
      slots: [
        { key: 'LMB', jp: '蒼', name: 'BLUE', cd: this.cd.blue / GOJO_CD.blue, on: this.blue.on, cls: 'blue' },
        { key: 'RMB', jp: '赫', name: 'RED', cd: this.cd.red / GOJO_CD.red, on: this.red.phase !== 'off', cls: 'red' },
        { key: 'R', jp: '茈', name: 'PURPLE', cd: this.cd.purple / GOJO_CD.purple, on: this.purple.phase === 'charge' || this.purple.phase === 'fly', cls: 'purple' },
        { key: 'Z', jp: '無量空処', name: 'DOMAIN', cd: d.active ? 0 : this.cd.domain / GOJO_CD.domain, on: d.active, cls: 'void', left: d.active ? d.remaining : 0 },
      ],
    };
  }

  private callout(jp: string, en: string, kind: string, big = false) {
    G.ui?.gojoCallout?.(jp, en, kind, big);
  }

  // =========================================================================
  update(dt: number, vm: Viewmodel, ok: boolean) {
    this.attach(vm);
    this.time += dt;
    for (const k of Object.keys(this.cd) as (keyof typeof this.cd)[]) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.blockT -= dt;
    this.vmArcs.begin();
    this.arcs.begin();

    if (this.xf.t >= 0) this.updateTransform(dt);
    if (this.active && this.armsReady && this.xf.t < 0 && ok) this.input();
    // hands first: the viewmodel orbs ride on this frame's fingertips
    this.updateHands(dt);
    this.updateBlue(dt);
    this.updateRed(dt, vm);
    this.updatePurple(dt, vm);
    this.domain.update(dt);
    this.updateInfinity(dt);
    this.updateWave(dt);

    // viewmodel side
    if (this.armsReady) {
      vm.setBareLook(ARM_GOJO);
      vm.rhObj = this.rh.obj;
      vm.lhObj = this.lh.obj;
      vm.rhVisible = this.rh.visible;
      vm.lhVisible = this.lh.visible;
    }
    this.streaks.update(dt);
    this.vmStreaks.update(dt);
    this.pulses.update(dt, this.time);
    this.ripples.update(dt, this.time);
    this.beam.update(this.time);
    this.arcs.end();
    this.vmArcs.end();
    for (const o of [this.orbBlue, this.orbRed, this.orbPurple]) if (o.group.visible) o.update(this.time, G.camera);
    for (const o of [this.vmBlue, this.vmRed, this.vmPurple]) if (o.group.visible) o.update(this.time, G.vmCamera);

    // Six Eyes: every cursed body glows with its energy
    this.sixPulse = Math.max(0, this.sixPulse - dt * 0.8);
    const br = G.bodyRenderer;
    if (br) br.uniforms.six.value = damp(br.uniforms.six.value, (this.active && this.armsReady ? 0.35 : 0) + this.sixPulse, 5, dt);

    // camera zoom: slow pull in while charging, a punch outward on release
    this.fovPunch = damp(this.fovPunch, 0, 5, dt);
    this.fovZoom = damp(this.fovZoom, this.zoomTarget(), 4, dt);
    this.fovMul = this.fovZoom + this.fovPunch;
  }

  private zoomTarget() {
    if (this.purple.phase === 'charge') return this.purple.t < 1.6 ? 0.9 : 1;
    if (this.domain.phase === 'sign') return 0.94;
    if (this.blue.on && this.blue.collapseT < 0) return 0.975;
    if (this.red.phase === 'charge') return 0.96;
    return 1;
  }

  private input() {
    const input = G.input;
    const purpleBusy = this.purple.phase === 'charge';
    const signBusy = this.domain.phase === 'sign';
    if (input.mousePress(0) && !this.blue.on && this.cd.blue <= 0 && !purpleBusy && !signBusy) this.startBlue();
    if (this.blue.on && this.blue.holding && !input.mouse(0)) this.blue.holding = false;
    if (input.mousePress(2) && this.red.phase === 'off' && this.cd.red <= 0 && this.rAct === 'idle' && !purpleBusy) this.startRed();
    if (input.pressed('KeyR') && this.purple.phase === 'off' && this.cd.purple <= 0 && this.rAct === 'idle' && this.red.phase !== 'charge') this.startPurple();
    if (input.pressed('KeyZ') && !this.domain.active && this.cd.domain <= 0 && this.rAct === 'idle' && !purpleBusy) this.startDomain();
  }

  // ------------------------------------------------------------------ aim helpers
  private camPos(out: THREE.Vector3) {
    return G.camera.getWorldPosition(out);
  }

  /** Where the crosshair ray meets the ground (or a zombie), capped at maxD. */
  private aimPoint(maxD: number, out: THREE.Vector3, zombies: boolean) {
    const o = this.camPos(_o);
    const d = G.player.getAim(_d);
    let t = maxD;
    if (d.y < -0.005) t = Math.min(t, o.y / -d.y);
    if (zombies) {
      this.hits.length = 0;
      G.zombies.rayHits(o.x, o.y, o.z, d.x, d.y, d.z, t, this.hits);
      for (const h of this.hits) if (h.t < t) t = h.t;
    }
    return out.copy(o).addScaledVector(d, t);
  }

  /** Blue hangs where you look, a little off the ground, never inside Infinity. */
  private blueTarget(out: THREE.Vector3) {
    this.aimPoint(17, out, false);
    out.y = clamp(out.y + 1.2, 1.15, 6.5);
    const pl = G.player.pos;
    const dx = out.x - pl.x;
    const dz = out.z - pl.z;
    const d = Math.hypot(dx, dz);
    if (d < 4.2) {
      const f = G.player.forward;
      const k = d > 0.01 ? 4.2 / d : 0;
      out.x = d > 0.01 ? pl.x + dx * k : pl.x + f.x * 4.2;
      out.z = d > 0.01 ? pl.z + dz * k : pl.z + f.z * 4.2;
    }
    return out;
  }

  // ------------------------------------------------------------------ transformation
  private updateTransform(dt: number) {
    const x = this.xf;
    x.t += dt;
    const t = x.t;
    const post = G.renderer.post;
    if (x.on) {
      // the gun goes down, the blindfold comes off
      this.gunLower = easeInOutCubic(t / 0.22);
      if (t >= 0.22 && !this.armsReady) {
        this.armsReady = true;
        this.gunLower = 0;
      }
      if (t >= 0.08 && t - dt < 0.08) G.audio?.play('gojoTransform', { volume: 1 });
      if (t >= 0.5 && !x.revealed) {
        x.revealed = true;
        post.flash = Math.max(post.flash, 0.22);
        post.aberration = Math.max(post.aberration, 1.4);
        post.bloomBoost = Math.max(post.bloomBoost, 1.0);
        this.sixPulse = 1.4;
        this.fovPunch = 0.06;
        G.player.addTrauma(0.25);
        this.callout('五条 悟', 'THE STRONGEST', 'six', true);
        // glitter of the Six Eyes waking up
        const cp = this.camPos(_v);
        const f = G.player.getAim(_d);
        for (let i = 0; i < 90; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = rand(0.6, 2.2);
          const px = cp.x + f.x * 2.2 + Math.cos(a) * r;
          const py = cp.y + f.y * 2.2 + Math.sin(a) * r * 0.6;
          const pz = cp.z + f.z * 2.2 + Math.sin(a + 1.3) * r;
          this.streaks.emit(px, py, pz, Math.cos(a) * rand(1, 4), Math.sin(a) * rand(1, 3), Math.sin(a + 1.3) * rand(1, 4), rand(0.3, 0.8), 0.006, 0.8, 1.6, 2.8, { drag: 2.5, stretch: 0.02 });
        }
      }
      if (t >= 1.25) {
        x.t = -1;
        this.band.visible = false;
        this.rAct = 'idle';
      }
    } else {
      if (t >= 0.28) {
        x.t = -1;
        this.active = false;
        this.armsReady = false;
        this.rAct = 'idle';
        this.domain.end();
        this.onRevert?.();
      }
    }
  }

  // ------------------------------------------------------------------ hands
  private updateHands(dt: number) {
    const R = this.rh;
    const L = this.lh;
    const T = this.time;
    this.rT += dt;
    R.shake = 0;
    L.shake = 0;
    if (!this.armsReady) {
      R.hide();
      L.hide();
    } else if (this.rAct === 'xform') {
      const t = this.xf.t;
      if (!this.xf.on) {
        R.hide();
        L.hide();
      } else if (t < 0.88) {
        // palm in, fingers under the cloth: push the blindfold up off the eyes
        const y = lerp(-0.26, 0.24, easeInOutCubic((t - 0.28) / 0.55));
        R.set(0.03, y, -0.3, -0.06, 1, -0.1, 0.05, 0.15, -1, 'open', 22, 14);
      } else this.idleRight(R, T);
      if (this.xf.on) L.hide();
    } else if (this.rAct === 'purple') {
      this.purpleHands(R, L);
    } else {
      if (this.rAct === 'red') this.redHand(R);
      else if (this.rAct === 'domain') {
        // 領域展開: index and middle crossed in front of the face
        R.set(0.078, -0.066, -0.31, -0.1, 1, -0.18, 0.12, 0.2, -1, 'cross', 13, 12);
        if (this.domain.phase !== 'sign' && this.domain.phase !== 'expand') this.rAct = 'idle';
      } else this.idleRight(R, T);
      // left hand: Lapse: Blue
      const b = this.blue;
      if (b.on && b.collapseT < 0) {
        // palm out, fingers clawing at space and dragging it in
        L.set(-0.15 + Math.sin(T * 1.7) * 0.004, -0.085 + Math.sin(T * 2.3) * 0.003, -0.47, 0.12, 0.8, -0.65, -0.05, 0.45, 1, b.t < 0.18 ? 'open' : 'claw', 18, 7);
        L.shake = 0.0016 + 0.0022 * smoothstep(0, 3, b.t);
      } else if (b.on && b.collapseT < 0.45) {
        // crush it: the hand snaps shut
        L.set(-0.14, -0.08, -0.5, 0.1, 0.75, -0.7, -0.05, 0.45, 1, 'fist', 24, 30);
      } else L.hide();
    }
    R.update(dt);
    L.update(dt);
    this.updateBand();
  }

  /** The blindfold's lower edge rides just above the fingertips of the lifting hand. */
  private updateBand() {
    const x = this.xf;
    if (x.t < 0.22 || !x.on || !this.armsReady) {
      this.band.visible = false;
      return;
    }
    const p = this.toVmWorld(this.rh.local(MID_TIP, _v), _v2);
    const tan = Math.tan((G.vmCamera.fov * Math.PI) / 360);
    const edge = clamp(p.y / (Math.max(0.05, -p.z) * tan) + 0.035, -1.3, 1.4);
    const z = 0.12;
    this.band.position.set(0, edge * z * tan + 0.17, -z);
    this.bandMat.uniforms.uA.value = Math.min(1, (x.t - 0.22) / 0.06);
    this.band.visible = edge < 1.12;
  }

  private idleRight(R: Hand, T: number) {
    R.set(0.235, -0.205 + Math.sin(T * 1.3) * 0.004, -0.43, -0.32, 0.16, -1, 0.55, 1, 0.12, 'relax', 9, 10);
  }

  private redHand(R: Hand) {
    const r = this.red;
    if (r.phase === 'charge') {
      R.set(0.115, -0.1, -0.46, -0.06, 0.035, -1, 0.95, 0.35, 0, 'point', 22, 20);
      R.shake = 0.0012 + r.t * 0.006;
    } else {
      // recoil flick, then back to rest
      const k = r.flick;
      R.set(0.12, -0.095 + k * 0.03, -0.45 + k * 0.05, -0.06, 0.035 + k * 0.6, -1, 0.95, 0.35, 0, 'point', 30, 20);
      if (this.rT > 0.5) this.rAct = 'idle';
    }
  }

  private purpleHands(R: Hand, L: Hand) {
    const p = this.purple;
    const t = p.t;
    if (p.phase !== 'charge') {
      // the follow-through after the launch
      if (this.rT < 0.55) R.set(0.05, -0.058, -0.6, -0.05, 0.03, -1, 0.95, 0.3, 0, 'point', 26, 20);
      else {
        this.rAct = 'idle';
        this.idleRight(R, this.time);
      }
      L.hide();
      return;
    }
    if (t < 0.55) {
      R.set(0.17, -0.085, -0.43, -0.25, 0.65, -0.9, 0.9, 0.3, 0.3, 'point', 11, 16);
      L.set(-0.17, -0.135, -0.42, 0.3, 0.1, -1, 0, -1, 0, 'open', 11, 16);
    } else if (t < 1.25) {
      R.set(0.088, -0.07, -0.4, -0.45, 0.3, -1, 0.85, 0.4, 0.2, 'point', 6, 10);
      L.set(-0.09, -0.13, -0.4, 0.4, 0.1, -1, 0.1, -1, 0, 'open', 6, 10);
    } else if (t < 1.6) {
      // brace: pull back before the release
      R.set(0.1, -0.06, -0.35, -0.25, 0.12, -1, 0.95, 0.3, 0, 'point', 14, 18);
      L.set(-0.055, -0.14, -0.39, 0.25, 0.05, -1, 0.1, -1, 0, 'open', 14, 18);
      R.shake = L.shake = 0.002;
    }
  }

  // ------------------------------------------------------------------ Infinity
  private updateInfinity(dt: number) {
    if (this.rippleT > 0) {
      this.rippleT -= dt;
      const k = 1 - this.rippleT / 0.36;
      if (this.wave.t < 0) setLens(3, this.ripplePos, 0.22, 0.9 * (1 - k), G.camera, 1, 0.1 + k * 0.7);
    }
    if (!this.active || !this.armsReady) return;
    // anything pressing against the boundary makes space ripple
    this.touchT -= dt;
    if (this.touchT > 0) return;
    this.touchT = 0.14;
    const pl = G.player.pos;
    G.zombies.queryRadius(pl.x, pl.z, INFINITY_R + 0.55, this.qz);
    let n = 0;
    for (const z of this.qz) {
      if (n >= 2 || z.state === 'down') continue;
      const dx = z.x - pl.x;
      const dz = z.z - pl.z;
      const d = Math.hypot(dx, dz) || 1;
      const x = pl.x + (dx / d) * INFINITY_R * 0.92;
      const zz = pl.z + (dz / d) * INFINITY_R * 0.92;
      this.ripples.shell(x, 0.8 + Math.random() * 0.9, zz, 0.04, 0.45, 0.28, 0x9fd8ff, 0.8);
      n++;
    }
  }

  // ------------------------------------------------------------------ Lapse: Blue
  private startBlue() {
    const b = this.blue;
    b.on = true;
    b.t = 0;
    b.holding = true;
    b.collapseT = -1;
    b.tickT = 0;
    b.ringT = 0;
    b.wakeAcc = 0;
    b.grow = 0;
    this.blueTarget(b.target);
    b.pos.copy(b.target);
    this.orbBlue.group.visible = true;
    this.orbBlue.radius = 0;
    this.coreT.clear();
    this.callout('術式順転「蒼」', 'CURSED TECHNIQUE LAPSE: BLUE', 'blue');
    G.audio?.play('blueStart', { x: b.pos.x, y: b.pos.y, z: b.pos.z, volume: 1.1 });
    const post = G.renderer.post;
    post.aberration = Math.max(post.aberration, 0.6);
    post.bloomBoost = Math.max(post.bloomBoost, 0.5);
    // space folds inward
    this.pulses.shell(b.pos.x, b.pos.y, b.pos.z, 4.5, 0.4, 0.35, 0x4a90ff, 2.2);
    this.pulses.ring(b.pos.x, b.pos.z, 9, 0.6, 0.5, 0x3d7dff, 1.6, 0.04);
  }

  private updateBlue(dt: number) {
    const b = this.blue;
    if (!b.on) {
      this.orbBlue.group.visible = false;
      if (this.purple.phase !== 'charge') G.audio?.loop('blueLoop', 0);
      this.lightA.intensity = damp(this.lightA.intensity, 0, 12, dt);
      return;
    }
    b.t += dt;
    const cam = G.camera;
    if (b.collapseT < 0) {
      if (this.active && b.holding) this.blueTarget(b.target);
      const k = 1 - Math.exp(-4.5 * dt);
      b.pos.lerp(b.target, k);
      b.grow = easeOutBack(Math.min(1, b.t / 0.32));
      const pulse = 1 + Math.sin(b.t * 9) * 0.05 + Math.sin(b.t * 23) * 0.02;
      this.orbBlue.radius = 0.55 * b.grow * pulse;
      this.orbBlue.intensity = 1.1 + Math.sin(b.t * 13) * 0.12;
      this.orbBlue.group.position.copy(b.pos);
      this.bluePull(dt, 1);
      this.blueFx(dt, 1);
      setLens(0, b.pos, 1.0 * b.grow, 1.0, cam);
      G.audio?.loop('blueLoop', 0.95 * Math.min(1, b.grow), 0.9 + Math.min(0.2, b.t * 0.05));
      G.player.addTrauma(dt * 0.18);
      if ((!b.holding && b.t >= 0.6) || b.t >= 5 || !this.active) this.collapseBlue();
    } else {
      b.collapseT += dt;
      const c = b.collapseT;
      if (c < 0.2) {
        // the last, violent inhale
        const k = c / 0.2;
        this.orbBlue.radius = 0.55 * (1 - easeInOutCubic(k) * 0.82);
        this.orbBlue.intensity = 1.2 + k * 2.6;
        this.orbBlue.group.position.copy(b.pos);
        this.bluePull(dt, 2.6);
        this.blueFx(dt, 2);
        setLens(0, b.pos, 1.0 + k * 0.6, 1.0 + k * 0.8, cam);
        G.audio?.loop('blueLoop', 0.95 * (1 - k), 1.1 + k * 0.6);
      } else {
        if (this.orbBlue.group.visible) this.blueImplode();
        this.orbBlue.group.visible = false;
        G.audio?.loop('blueLoop', 0);
        if (c > 0.6) {
          b.on = false;
          this.coreT.clear();
        }
      }
    }
  }

  private collapseBlue() {
    const b = this.blue;
    if (b.collapseT >= 0) return;
    b.collapseT = 0;
    b.holding = false;
    this.cd.blue = GOJO_CD.blue;
    G.audio?.play('blueCollapse', { x: b.pos.x, y: b.pos.y, z: b.pos.z, volume: 1.1 });
  }

  /** The vacuum: living zombies are dragged in, bodies and corpses fly into the core and get crushed. */
  private bluePull(dt: number, power: number) {
    const b = this.blue;
    const bx = b.pos.x;
    const by = b.pos.y;
    const bz = b.pos.z;
    // ---- the living
    b.tickT += dt;
    const tick = b.tickT >= 0.1;
    if (tick) b.tickT = 0;
    G.zombies.queryRadius(bx, bz, BLUE_R, this.qz);
    const roomForBodies = b.held < BLUE_HOLD && G.ragdolls.active.length < G.ragdolls.maxActive - 3;
    let held = 0;
    for (const z of this.qz) {
      if (!z.alive || z.state === 'down') continue;
      const dx = bx - z.x;
      const dz = bz - z.z;
      const d = Math.hypot(dx, dz);
      if (d > BLUE_R) continue;
      const f = 1 - d / BLUE_R;
      const boss = z.type.id === 'boss';
      const resist = z.type.knockResist;
      const inv = 1 / Math.max(0.3, d);
      const a = (16 + 75 * f * f) * (1 - resist) * power * dt;
      z.knockX += (dx * inv - dz * inv * 0.35) * a;
      z.knockZ += (dz * inv + dx * inv * 0.35) * a;
      if (Math.random() < dt * 5 * f) {
        z.kickSpring(S.TorsoPitch, -rand(2, 5) * f);
        z.kickSpring(S.HeadRoll, rand(-3, 3));
      }
      // ripped off their feet near the core
      if (d < 3.6 && !boss && resist < 0.9 && roomForBodies && Math.random() < dt * 7 * power) {
        G.zombies.knockdown(z, null);
        continue;
      }
      // crushed: the core of Blue is a point every direction is falling into
      if (tick && d < 2.7) {
        const dmg = (boss ? 0.045 : 1.1) * z.maxHp * 0.1 * power;
        if (!boss && z.hp <= dmg && !roomForBodies) this.crushLiving(z);
        else this.hurt(z, dmg, 'blue', -dx * inv, -dz * inv);
      }
    }
    // ---- bodies (knocked down, freshly dead, woken corpses)
    const now = G.ragdolls.active as Ragdoll[];
    for (let k = now.length - 1; k >= 0; k--) {
      // a kill below can set off an exploder whose blast freezes other bodies
      const r = now[k];
      if (!r) continue;
      let captured = false;
      for (let i = 0; i < PART_COUNT; i++) {
        const body = r.bodies[i];
        if (!body) continue;
        const t = body.translation();
        const dx = bx - t.x;
        const dy = by - t.y;
        const dz = bz - t.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > 9.5) continue;
        captured = true;
        const m = body.mass();
        const inv = 1 / Math.max(0.05, d);
        const acc = (Math.min(85, 190 / Math.max(1, d * d)) + 9 * (1 - d / 9.5)) * power;
        // swirl around the vertical axis through the orb
        const sx = -dz * inv;
        const sz = dx * inv;
        const lift = 9.81 * 0.85 * (1 - d / 9.5);
        const j = m * dt;
        body.applyImpulse({ x: (dx * inv * acc + sx * acc * 0.42) * j, y: (dy * inv * acc + lift) * j, z: (dz * inv * acc + sz * acc * 0.42) * j }, true);
        if (d < 1.5) {
          // the core holds them: bleed off speed so they pile up instead of orbiting
          const v = body.linvel();
          const kd = Math.max(0, 1 - dt * 7);
          body.setLinvel({ x: v.x * kd, y: v.y * kd, z: v.z * kd }, true);
          body.applyTorqueImpulse({ x: rand(-1, 1) * m * 0.05, y: rand(-1, 1) * m * 0.05, z: rand(-1, 1) * m * 0.05 }, true);
        }
      }
      if (!captured) continue;
      held++;
      // held in the vortex: no settling, no getting up
      r.age = Math.min(r.age, 0.5);
      r.restT = 0;
      r.center(F3);
      const dc = Math.hypot(F3[0] - bx, F3[1] - by, F3[2] - bz);
      if (dc < 1.6) {
        const ct = (this.coreT.get(r) ?? 0) + dt * power;
        this.coreT.set(r, ct);
        if (r.zombie) {
          if (tick) this.hurt(r.zombie, r.zombie.maxHp * 0.16 * power, 'blue', 0, 0);
        } else if (ct > 0.35 + (r.id % 6) * 0.1 || (held > BLUE_HOLD && ct > 0.15)) this.crush(r);
      }
    }
    b.held = held;
    // ---- corpses on the road are torn loose and sucked in
    b.wakeAcc += dt * 12 * power;
    if (b.wakeAcc >= 1) {
      G.ragdolls.corpsesNear(bx, bz, 8.5, this.qc);
      while (b.wakeAcc >= 1) {
        b.wakeAcc -= 1;
        if (!this.qc.length || b.held >= BLUE_HOLD - 4 || G.ragdolls.active.length >= G.ragdolls.maxActive - 4) {
          b.wakeAcc = 0;
          break;
        }
        const i = Math.floor(Math.random() * this.qc.length);
        const c = this.qc[i];
        this.qc.splice(i, 1);
        const r = G.ragdolls.unfreeze(c);
        if (r) for (const body of r.bodies) if (body) body.applyImpulse({ x: 0, y: body.mass() * 2.5, z: 0 }, true);
      }
    }
  }

  /** Too many bodies already in the vortex: this one is crushed where it stands. */
  private crushLiving(z: Zombie) {
    const x = z.x;
    const y = z.y + 1 * z.scale;
    const zz = z.z;
    G.fx.gore(x, y, zz, 2, z.skin);
    this.bloodSpray(x, y, zz, 18);
    G.fx.stains.blood(x, zz, 0.9, 0.3);
    G.zombies.vaporize(z, { damage: z.hp, part: P.Torso, x, y, z: zz, dx: 0, dy: 1, dz: 0, stopping: 0, pen: 999, kind: 'explosion', weapon: 'blue', noBlood: true, noWound: true, premult: true });
  }

  /** Blood droplets (no per-drop ground stains: those are stamped once per body). */
  private bloodSpray(x: number, y: number, z: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(1, 5);
      const k = Math.random();
      const r = 0.22 + k * 0.3;
      const g = 0.008 + k * 0.012;
      const sz = rand(0.03, 0.07);
      G.fx.blood.emit(x, y, z, Math.cos(a) * s, rand(0.5, 4), Math.sin(a) * s, rand(0.8, 1.5), sz, sz * 0.8, r, g, g, 1, r * 0.6, g * 0.5, g * 0.5, 1, 1.2, 1.0);
    }
  }

  /** A body compressed into nothing at the core of Blue. */
  private crush(r: Ragdoll) {
    r.center(F3);
    const [x, y, z] = F3;
    G.fx.gore(x, y, z, 3, r.skin);
    this.bloodSpray(x, y, z, 22);
    // what falls out of the vortex lands below it
    G.fx.stains.blood(x + rand(-0.6, 0.6), z + rand(-0.6, 0.6), rand(0.6, 1.1), Math.sqrt(Math.max(0.1, y) / 4.9));
    const c = this.blue.pos;
    // a red mist that spirals back into the point
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(0.6, 1.8);
      const px = c.x + Math.cos(a) * r;
      const py = c.y + rand(-0.8, 0.8);
      const pz = c.z + Math.sin(a) * r;
      const T = rand(0.35, 0.7);
      G.fx.mist.emit(px, py, pz, (c.x - px) / T - Math.sin(a) * 2, (c.y - py) / T, (c.z - pz) / T + Math.cos(a) * 2, T, rand(0.3, 0.6), 0.05, 0.36, 0.015, 0.015, 0.8, 0.2, 0.01, 0.01, 0.4, 0, 0, rand(0, 6), rand(-3, 3));
    }
    G.audio?.play('gib', { x, y, z, volume: 0.9, pitch: 0.8 });
    this.coreT.delete(r);
    G.ragdolls.destroy(r);
  }

  private blueFx(dt: number, power: number) {
    const b = this.blue;
    const c = b.pos;
    const g = b.grow;
    // light spiralling into the singularity
    const n = Math.round((150 * power) * dt * g + Math.random());
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = rand(2.5, 9);
      const dx = Math.cos(a) * s;
      const dy = u * 0.55;
      const dz = Math.sin(a) * s;
      const sw = rand(2.5, 6);
      const w = Math.random();
      this.streaks.emit(c.x + dx * r, Math.max(0.1, c.y + dy * r), c.z + dz * r, -dz * sw - dx, -dy, dx * sw - dz, 2.2, 0.018, 0.25 + w * 1.0, 0.55 + w * 1.25, 2.6 + w * 0.4, { center: c, pull: 55 * power, drag: 0.25, stretch: 0.05 });
    }
    // asphalt dust and grit torn off the ground toward the orb
    const nd = Math.round(26 * dt * g * power + Math.random() * 0.6);
    for (let i = 0; i < nd; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(1.5, 7);
      const px = c.x + Math.cos(a) * r;
      const pz = c.z + Math.sin(a) * r;
      const T = rand(0.6, 1.1);
      const shade = rand(0.16, 0.28);
      G.fx.dust.emit(px, 0.15, pz, (c.x - px) / T, (c.y - 0.15) / T, (c.z - pz) / T, T * 0.92, rand(0.35, 0.7), 0.08, shade, shade * 0.97, shade * 0.95, 0.55, shade, shade, shade * 1.05, 0, 0, 0, rand(0, 6), rand(-4, 4));
    }
    const nc = Math.round(22 * dt * g * power + Math.random() * 0.6);
    for (let i = 0; i < nc; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(1, 6.5);
      const px = c.x + Math.cos(a) * r;
      const pz = c.z + Math.sin(a) * r;
      const T = rand(0.45, 0.85);
      const shade = rand(0.12, 0.26);
      G.fx.chips.emit(px, 0.05, pz, (c.x - px) / T, (c.y - 0.05) / T, (c.z - pz) / T, T * 0.95, rand(0.03, 0.08), 0.02, shade, shade * 0.95, shade * 0.9, 1, shade, shade * 0.95, shade * 0.9, 1, 0, 0, rand(0, 6), rand(-10, 10));
    }
    // crackling blue arcs
    const na = Math.round(3 * power + Math.random() * 2);
    for (let i = 0; i < na; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = 0.55 * g;
      const L = rand(1, 2.8) * g;
      _v.set(c.x + Math.cos(a) * s * r, c.y + u * r, c.z + Math.sin(a) * s * r);
      _v2.set(c.x + Math.cos(a) * s * (r + L), c.y + u * (r + L), c.z + Math.sin(a) * s * (r + L));
      const w = Math.random();
      this.arcs.arc(_v, _v2, 0.5 + w, 1.0 + w, 3.0, 0.45, 7);
    }
    // imploding ground rings
    b.ringT -= dt * power;
    if (b.ringT <= 0) {
      b.ringT = 0.42;
      this.pulses.ring(c.x, c.z, 8 * g, 0.5, 0.55, 0x3d7dff, 1.3, 0.04);
    }
    // light
    const L = this.lightA;
    L.color.setHex(0x3a78ff);
    L.position.copy(c);
    L.distance = 20;
    L.intensity = (26 + Math.sin(this.time * 31) * 5) * g * power;
  }

  /** Release: everything snaps into the point, then the crushed mass falls out. */
  private blueImplode() {
    const b = this.blue;
    const c = b.pos;
    const post = G.renderer.post;
    const near = Math.max(0, 1 - this.camPos(_v).distanceTo(c) / 30);
    post.flash = Math.max(post.flash, 0.12 * near);
    post.aberration = Math.max(post.aberration, 1.0);
    post.bloomBoost = Math.max(post.bloomBoost, 0.6);
    G.player.addTrauma(0.15 + 0.4 * near);
    this.fovPunch = Math.max(this.fovPunch, 0.025 * near);
    this.pulses.shell(c.x, c.y, c.z, 0.15, 5.5, 0.38, 0x6ab4ff, 3.2);
    this.pulses.shell(c.x, c.y, c.z, 0.1, 2.2, 0.22, 0xd8f0ff, 2.6);
    this.pulses.ring(c.x, c.z, 0.5, 10, 0.55, 0x4a90ff, 1.8, 0.05);
    G.fx.lights.flash(c.x, c.y, c.z, 0x4a90ff, 90, 30, 0.45, 0.2);
    G.fx.flashes.emit(c.x, c.y, c.z, 0, 0, 0, 0.12, 2, 5, 1.2, 2.2, 4, 1, 0.4, 0.8, 2, 0);
    for (let i = 0; i < 160; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const sp = rand(6, 22);
      const w = Math.random();
      this.streaks.emit(c.x, c.y, c.z, Math.cos(a) * s * sp, u * sp * 0.7, Math.sin(a) * s * sp, rand(0.25, 0.6), 0.02, 0.4 + w, 0.9 + w, 3, { drag: 4, stretch: 0.03 });
    }
    // the crush: whatever was close is gone
    G.zombies.queryRadius(c.x, c.z, 4.6, this.qz);
    for (const z of this.qz) {
      if (!z.alive) continue;
      const d = Math.hypot(z.x - c.x, z.z - c.z);
      const f = 1 - d / 4.6;
      const boss = z.type.id === 'boss';
      this.hurt(z, boss ? z.maxHp * 0.06 * f : z.maxHp * (0.5 + 0.7 * f) + 120 * f, 'blue', 0, 0);
    }
    for (const r of [...(G.ragdolls.active as Ragdoll[])]) {
      r.center(F3);
      const d = Math.hypot(F3[0] - c.x, F3[1] - c.y, F3[2] - c.z);
      if (d < 1.7 && !r.zombie && Math.random() < 0.7) {
        this.crush(r);
        continue;
      }
      if (d > 6) continue;
      for (const body of r.bodies) {
        if (!body) continue;
        const t = body.translation();
        const dx = t.x - c.x;
        const dy = t.y - c.y;
        const dz = t.z - c.z;
        const l = Math.hypot(dx, dy, dz) || 1;
        const m = body.mass() * rand(3, 7);
        body.applyImpulse({ x: (dx / l) * m, y: (dy / l) * m * 0.5 + m * 0.3, z: (dz / l) * m }, true);
      }
    }
    // a pressed-in crater where it touched the ground
    if (c.y < 3.5) {
      const s = 3.4 - c.y * 0.6;
      G.fx.stains.stamp(c.x, c.z, s, 0.03, 0.035, 0.05, 0.6, 8 + Math.floor(Math.random() * 8));
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const sp = rand(4, 8);
        G.fx.dust.emit(c.x, 0.2, c.z, Math.cos(a) * sp, rand(0.2, 0.8), Math.sin(a) * sp, rand(0.7, 1.3), 0.5, 2.2, 0.32, 0.31, 0.3, 0.55, 0.32, 0.31, 0.3, 0, 3.5, -0.02, rand(0, 6), 0);
      }
    }
  }

  /** Damage that bypasses armour (it's space itself doing it). */
  private hurt(z: Zombie, dmg: number, src: string, dx: number, dz: number) {
    if (!z.alive) return false;
    const h: HitInfo = { damage: dmg, part: P.Torso, x: z.x, y: z.y + 1.1 * z.scale, z: z.z, dx, dy: 0.2, dz, stopping: 0, pen: 999, kind: 'explosion', weapon: src, noBlood: true, noWound: true, premult: true };
    return G.zombies.damage(z, h);
  }

  // ------------------------------------------------------------------ Reversal: Red
  private startRed() {
    const r = this.red;
    r.phase = 'charge';
    r.t = 0;
    r.flick = 0;
    this.rAct = 'red';
    this.rT = 0;
    this.callout('術式反転「赫」', 'CURSED TECHNIQUE REVERSAL: RED', 'red');
    G.audio?.play('redCharge', { volume: 0.9 });
  }

  private updateRed(dt: number, vm: Viewmodel) {
    const r = this.red;
    r.flick = damp(r.flick, 0, 9, dt);
    if (r.phase === 'off') {
      this.orbRed.group.visible = false;
      if (this.purple.phase !== 'charge') this.vmRed.group.visible = false;
      this.lightB.intensity = damp(this.lightB.intensity, 0, 12, dt);
      if (this.purple.phase !== 'charge') this.vmLightB.intensity = damp(this.vmLightB.intensity, 0, 14, dt);
      return;
    }
    r.t += dt;
    if (r.phase === 'charge') {
      const k = clamp(r.t / 0.32, 0, 1);
      this.rh.local(TIP, this.vmRedPos);
      this.vmRed.group.visible = true;
      this.vmRed.group.position.copy(this.vmRedPos);
      this.vmRed.radius = 0.012 * easeOutCubic(k) * (1 + (Math.random() - 0.5) * 0.25);
      this.vmRed.intensity = 0.9 + k * 0.5;
      this.vmFxAround(this.vmRedPos, this.vmRedW, 3, 0.4, 0.25, 0.045, 2 + Math.round(k * 3));
      this.vmLightB.position.copy(this.toVmWorld(this.vmRedPos, _v));
      this.vmLightB.intensity = 3 * k;
      setLens(2, this.toVmWorld(this.vmRedPos, _v), 0.008 + 0.01 * k, 0.6, G.vmCamera, 1, 0.02 + 0.01 * k);
      if (r.t >= 0.32) this.fireRed(vm);
      return;
    }
    // ---- in flight
    r.prev.copy(r.pos);
    r.pos.addScaledVector(r.vel, dt);
    r.dist += r.vel.length() * dt;
    const o = this.orbRed;
    o.group.visible = true;
    o.group.position.copy(r.pos);
    o.radius = Math.min(0.42, 0.06 + r.dist * 0.08) * (1 + Math.sin(this.time * 40) * 0.06);
    o.intensity = 1.5;
    this.vmRed.group.visible = false;
    this.vmLightB.intensity = damp(this.vmLightB.intensity, 0, 14, dt);
    const L = this.lightB;
    L.color.setHex(0xff2a1a);
    L.position.copy(r.pos);
    L.distance = 15;
    L.intensity = 42;
    setLens(2, r.pos, 0.45, 0.7, G.camera, 1, 0.8);
    // trail
    for (let i = 0; i < 7; i++) {
      const w = Math.random();
      this.streaks.emit(lerp(r.prev.x, r.pos.x, w), lerp(r.prev.y, r.pos.y, w), lerp(r.prev.z, r.pos.z, w), -r.vel.x * 0.08 + rand(-2, 2), -r.vel.y * 0.08 + rand(-2, 2), -r.vel.z * 0.08 + rand(-2, 2), rand(0.15, 0.35), 0.02, 3, 0.3 + w * 0.8, 0.2 + w * 0.5, { drag: 3, stretch: 0.03 });
    }
    // anything along the line is thrown aside
    G.zombies.queryRadius(r.pos.x, r.pos.z, 4, this.qz);
    let hit = false;
    for (const z of this.qz) {
      if (!z.alive || z.state === 'down') continue;
      const cy = z.y + 0.95 * z.scale;
      const d = segDist(z.x, cy, z.z, r.prev, r.pos);
      if (d < 1.15 * z.scale + 0.25) {
        hit = true;
        break;
      }
      if (d < 3 && !r.hit.has(z)) {
        r.hit.add(z);
        this.repelFromLine(z, r.vel);
      }
    }
    if (hit || r.dist > 70 || r.pos.y < 0.25) this.detonateRed(r.pos.x, Math.max(0.4, r.pos.y), r.pos.z);
  }

  private fireRed(vm: Viewmodel) {
    const r = this.red;
    r.phase = 'fly';
    r.t = 0;
    r.dist = 0;
    r.hit.clear();
    r.flick = 1;
    // leave the fingertip where it is on screen, then fly at the crosshair
    this.toVmWorld(this.vmRedPos, _v);
    vm.toWorld(_v, r.pos);
    const target = this.aimPoint(90, _v2, true);
    r.vel.subVectors(target, r.pos);
    if (r.vel.lengthSq() < 1) r.vel.copy(G.player.getAim(_d));
    r.vel.normalize().multiplyScalar(72);
    r.prev.copy(r.pos);
    this.rT = 0;
    this.cd.red = GOJO_CD.red;
    vm.recoilPos.kick(0, 0.02, 0.5);
    vm.recoilRot.kick(1.2, 0, 0.3);
    G.player.addRecoil(0.03, 0, 9);
    G.player.addTrauma(0.22);
    this.fovPunch = Math.max(this.fovPunch, 0.03);
    G.audio?.play('redFire', { volume: 1 });
    this.pulses.shell(r.pos.x, r.pos.y, r.pos.z, 0.05, 1.4, 0.22, 0xff3a2a, 2.2);
    G.renderer.post.aberration = Math.max(G.renderer.post.aberration, 0.8);
    for (let i = 0; i < 30; i++) {
      const s = rand(2, 9);
      this.streaks.emit(r.pos.x, r.pos.y, r.pos.z, r.vel.x * 0.05 + rand(-1, 1) * s, rand(-1, 1) * s, r.vel.z * 0.05 + rand(-1, 1) * s, rand(0.1, 0.25), 0.012, 3, 0.5, 0.35, { drag: 5, stretch: 0.02 });
    }
  }

  /** Red brushing past: flung sideways off the line of fire. */
  private repelFromLine(z: Zombie, vel: THREE.Vector3) {
    const vl = Math.hypot(vel.x, vel.z) || 1;
    const fx = vel.x / vl;
    const fz = vel.z / vl;
    // perpendicular, away from the line
    let px = -fz;
    let pz = fx;
    const rel = (z.x - this.red.pos.x) * px + (z.z - this.red.pos.z) * pz;
    if (rel < 0) {
      px = -px;
      pz = -pz;
    }
    const boss = z.type.id === 'boss';
    const killed = this.hurt(z, boss ? z.maxHp * 0.03 : z.maxHp * 0.45, 'red', px, pz);
    const r = killed ? z.deathRagdoll : null;
    if (r) this.launch(r, px * 0.8 + fx * 0.6, pz * 0.8 + fz * 0.6, 11, 4);
    else if (z.alive && !boss && z.type.knockResist < 0.9) {
      G.zombies.knockdown(z, null);
      if (z.ragdoll) this.launch(z.ragdoll, px * 0.8 + fx * 0.6, pz * 0.8 + fz * 0.6, 9, 3.5);
    } else if (z.alive) {
      z.knockX += px * 6 * (1 - z.type.knockResist);
      z.knockZ += pz * 6 * (1 - z.type.knockResist);
    }
  }

  /** Throw a ragdoll (every part) with a velocity change. */
  private launch(r: Ragdoll, nx: number, nz: number, speed: number, up: number) {
    for (const body of r.bodies) {
      if (!body) continue;
      const m = body.mass();
      body.applyImpulse({ x: (nx * speed + rand(-1.5, 1.5)) * m, y: (up + rand(-1, 2)) * m, z: (nz * speed + rand(-1.5, 1.5)) * m }, true);
      body.applyTorqueImpulse({ x: rand(-1, 1) * m * 0.12, y: rand(-1, 1) * m * 0.12, z: rand(-1, 1) * m * 0.12 }, true);
    }
  }

  /** The divergence of infinity: a violent repulsion that throws everything outward. */
  private detonateRed(x: number, y: number, z: number) {
    const r = this.red;
    r.phase = 'off';
    this.orbRed.group.visible = false;
    const R = RED_R;
    // bodies already in the air go first, so fresh kills only get their own throw
    G.ragdolls.blast(x, y, z, R, 13);
    G.zombies.queryRadius(x, z, R + 1, this.qz);
    for (const zb of this.qz) {
      if (!zb.alive) continue;
      const cy = zb.y + 0.9 * zb.scale;
      const dx = zb.x - x;
      const dy = cy - y;
      const dz = zb.z - z;
      const d = Math.hypot(dx, dy * 0.6, dz);
      if (d > R) continue;
      const f = Math.pow(1 - d / R, 0.8);
      const l = Math.hypot(dx, dz) || 1;
      const nx = dx / l;
      const nz = dz / l;
      const boss = zb.type.id === 'boss';
      const dmg = boss ? f * (0.1 * zb.maxHp + 900) : f * (1.6 * zb.maxHp + 300);
      const sp = 6 + 18 * f;
      const up = 3 + 7 * f;
      const wasDown = zb.state === 'down';
      const killed = this.hurt(zb, dmg, 'red', nx, nz);
      if (killed) {
        const rg = zb.deathRagdoll as Ragdoll | null;
        if (rg) {
          this.launch(rg, nx, nz, sp, up);
          if (f > 0.45 && zb.type.id !== 'brute') G.zombies.dismember(rg, f, 0.5, zb);
        }
      } else if (!boss && zb.type.knockResist < 0.9) {
        if (!wasDown) G.zombies.knockdown(zb, null);
        if (zb.ragdoll) this.launch(zb.ragdoll, nx, nz, sp * 0.85, up);
      } else {
        zb.knockX += nx * sp * 1.5 * (1 - zb.type.knockResist);
        zb.knockZ += nz * sp * 1.5 * (1 - zb.type.knockResist);
      }
    }
    // the dead on the road get thrown too
    G.ragdolls.corpsesNear(x, z, 6, this.qc);
    let woke = 0;
    for (const c of this.qc) {
      if (woke >= 8 || G.ragdolls.active.length >= G.ragdolls.maxActive - 2) break;
      const rg = G.ragdolls.unfreeze(c);
      if (!rg) continue;
      woke++;
      const dx = c.x - x;
      const dz = c.z - z;
      const l = Math.hypot(dx, dz) || 1;
      const f = 1 - Math.min(1, l / 6);
      this.launch(rg, dx / l, dz / l, 6 + 12 * f, 3 + 6 * f);
    }
    this.redBlastFx(x, y, z);
  }

  private redBlastFx(x: number, y: number, z: number) {
    const R = RED_R;
    const post = G.renderer.post;
    const dist = this.camPos(_v).distanceTo(_v2.set(x, y, z));
    const near = clamp(1.15 - dist / 45, 0, 1);
    post.flash = Math.max(post.flash, 0.4 * near);
    post.aberration = Math.max(post.aberration, 1.6 * near + 0.3);
    post.bloomBoost = Math.max(post.bloomBoost, 0.9);
    post.impact = Math.max(post.impact, 1.15 * near);
    post.impactColor.setRGB(1.0, 0.16, 0.1);
    G.player.addTrauma(0.2 + 0.65 * near);
    this.fovPunch = Math.max(this.fovPunch, 0.05 * near);
    this.wave.t = 0;
    this.wave.pos.set(x, y, z);
    this.wave.range = 32;
    G.audio?.play('redBlast', { x, y, z, volume: 1.25 });
    G.fx.lights.flash(x, y + 0.5, z, 0xff3020, 170, 42, 0.5, 0.3);
    G.fx.flashes.emit(x, y, z, 0, 0, 0, 0.16, 3, 13, 4, 1.4, 1.0, 1, 3, 0.2, 0.1, 0);
    this.pulses.shell(x, y, z, 0.4, R * 1.1, 0.5, 0xff2a1a, 3.2);
    this.pulses.shell(x, y, z, 0.2, R * 0.5, 0.28, 0xffd2c4, 2.6);
    this.pulses.ring(x, z, 0.6, R * 1.6, 0.75, 0xff3020, 2.2, 0.05);
    this.pulses.ring(x, z, 0.3, R * 0.9, 0.45, 0xffc0b0, 1.6, 0.03);
    for (let i = 0; i < 380; i++) {
      const u = Math.random() * 1.6 - 0.6;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const sp = rand(14, 46);
      const w = Math.random();
      this.streaks.emit(x, y, z, Math.cos(a) * s * sp, u * sp * 0.75, Math.sin(a) * s * sp, rand(0.3, 0.8), 0.025, 3.2, 0.3 + w * 1.0, 0.2 + w * 0.7, { drag: 3, gravity: 0.15, stretch: 0.035 });
    }
    for (let i = 0; i < 120; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(5, 18);
      G.fx.sparksP.emit(x, y, z, Math.cos(a) * sp, rand(2, 12), Math.sin(a) * sp, rand(0.5, 1.4), 0.04, 0.01, 4, 0.6, 0.3, 1, 1.4, 0.1, 0.05, 1, 0.6, 1);
    }
    if (y < 3) {
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const sp = rand(8, 15);
        G.fx.dust.emit(x, 0.25, z, Math.cos(a) * sp, rand(0.3, 1.2), Math.sin(a) * sp, rand(1, 1.8), 0.8, 3.4, 0.36, 0.33, 0.3, 0.6, 0.36, 0.33, 0.3, 0, 3.2, -0.02, rand(0, 6), 0);
      }
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(4, 16);
        const c = rand(0.14, 0.28);
        G.fx.chips.emit(x, 0.15, z, Math.cos(a) * sp, rand(3, 11), Math.sin(a) * sp, rand(0.9, 1.8), rand(0.04, 0.1), 0.04, c, c * 0.9, c * 0.8, 1, c, c * 0.9, c * 0.8, 1, 0.3, 1, rand(0, 6), rand(-10, 10));
      }
      G.fx.stains.scorch(x, z, 3.6);
    }
  }

  /** Expanding refraction ring after Red. */
  private updateWave(dt: number) {
    const w = this.wave;
    if (w.t < 0) return;
    w.t += dt;
    const k = w.t / 0.65;
    if (k >= 1) {
      w.t = -1;
      return;
    }
    setLens(3, w.pos, 1.8, 1.1 * (1 - k), G.camera, 1, 0.6 + w.range * easeOutCubic(k));
  }

  // ------------------------------------------------------------------ Hollow Technique: Purple
  private startPurple() {
    const p = this.purple;
    p.phase = 'charge';
    p.t = 0;
    p.merged = false;
    p.launched = false;
    this.rAct = 'purple';
    this.rT = 0;
    if (this.blue.on && this.blue.collapseT < 0) this.collapseBlue();
    G.audio?.play('purpleCharge', { volume: 1.1 });
    G.renderer.post.bloomBoost = Math.max(G.renderer.post.bloomBoost, 0.4);
  }

  // ------------------------------------------------------------------ Domain Expansion
  private startDomain() {
    if (!this.domain.begin()) return;
    this.rAct = 'domain';
    this.rT = 0;
    this.callout('領域展開', 'DOMAIN EXPANSION', 'void', true);
    G.audio?.play('blueStart', { volume: 0.7, pitch: 0.55 });
    const post = G.renderer.post;
    post.bloomBoost = Math.max(post.bloomBoost, 0.5);
    post.aberration = Math.max(post.aberration, 0.5);
  }

  private toVmWorld(local: THREE.Vector3, out: THREE.Vector3) {
    return this.handsParent ? this.handsParent.localToWorld(out.copy(local)) : out.copy(local);
  }

  /** Sparks, arcs and inward streaks around a point in the viewmodel (hands-root space). */
  private vmFxAround(local: THREE.Vector3, c: THREE.Vector3, r: number, g: number, b: number, reach: number, arcs: number) {
    this.toVmWorld(local, c);
    for (let i = 0; i < arcs; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const L = reach * rand(0.5, 1);
      _v3.set(c.x + Math.cos(a) * s * L, c.y + u * L, c.z + Math.sin(a) * s * L);
      this.vmArcs.arc(c, _v3, r, g, b, reach * 0.35, 5);
    }
    if (Math.random() < 0.8) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const L = reach * rand(1.5, 3);
      this.vmStreaks.emit(c.x + Math.cos(a) * s * L, c.y + u * L, c.z + Math.sin(a) * s * L, 0, 0, 0, 0.5, 0.0012, r * 0.8, g * 0.8 + 0.2, b * 0.8 + 0.2, { center: c, pull: 0.0025, stretch: 0.02 });
    }
  }

  private updatePurple(dt: number, vm: Viewmodel) {
    const p = this.purple;
    if (p.phase === 'off') {
      this.orbPurple.group.visible = false;
      this.vmPurple.group.visible = false;
      if (this.red.phase === 'off') this.vmRed.group.visible = false;
      this.vmBlue.group.visible = false;
      this.vmLightA.intensity = damp(this.vmLightA.intensity, 0, 14, dt);
      this.lightC.intensity = damp(this.lightC.intensity, 0, 6, dt);
      G.audio?.loop('purpleLoop', 0);
      this.fadeBeam(dt);
      return;
    }
    if (p.phase === 'charge') {
      p.t += dt;
      this.purpleCharge(dt, vm);
      return;
    }
    this.purpleFly(dt);
  }

  private purpleCharge(dt: number, vm: Viewmodel) {
    const p = this.purple;
    const t = p.t;
    const post = G.renderer.post;
    const game = G.game;
    if (game) game.timeScale = t >= 0.75 && t < 1.3 ? 0.42 : 1;
    const R = this.rh;
    const L = this.lh;
    post.bloomBoost = Math.max(post.bloomBoost, 0.3 + smoothstep(0.4, 1.25, t) * 0.8);
    if (!p.merged) {
      // Blue in the left palm, Red at the right fingertip
      const fa = easeOutCubic(t / 0.45);
      const ra = R.local(TIP, _v);
      const la = L.local(PALM_UP, _v2);
      if (t < 0.55) {
        this.vmBluePos.copy(la);
        this.vmRedPos.copy(ra);
        p.a0.copy(la);
        p.b0.copy(ra);
      } else {
        // they leave the hands and fall into orbit around each other
        const s = easeInOutCubic((t - 0.55) / 0.7);
        const mid = _v3.addVectors(p.a0, p.b0).multiplyScalar(0.5).lerp(MEET, s);
        const half = p.a0.distanceTo(p.b0) * 0.5 * Math.pow(1 - s, 1.25);
        const th = s * Math.PI * 2 * 2.25;
        const e1x = (p.a0.x - p.b0.x) / (p.a0.distanceTo(p.b0) || 1);
        const e1y = (p.a0.y - p.b0.y) / (p.a0.distanceTo(p.b0) || 1);
        const ox = (Math.cos(th) * e1x - Math.sin(th) * e1y) * half;
        const oy = (Math.sin(th) * e1x + Math.cos(th) * e1y) * half * 0.75;
        const oz = Math.sin(th * 0.5) * half * 0.35;
        this.vmBluePos.set(mid.x + ox, mid.y + oy, mid.z + oz);
        this.vmRedPos.set(mid.x - ox, mid.y - oy, mid.z - oz);
      }
      this.vmBlue.group.visible = true;
      this.vmRed.group.visible = true;
      this.vmBlue.group.position.copy(this.vmBluePos);
      this.vmRed.group.position.copy(this.vmRedPos);
      const pulse = 1 + Math.sin(this.time * 30) * 0.08;
      this.vmBlue.radius = 0.016 * fa * pulse;
      this.vmRed.radius = 0.013 * fa * pulse;
      this.vmBlue.intensity = this.vmRed.intensity = 0.9 + smoothstep(0.55, 1.25, t) * 0.6;
      this.vmFxAround(this.vmBluePos, this.vmBlueW, 0.6, 1.1, 3, 0.05, 2);
      this.vmFxAround(this.vmRedPos, this.vmRedW, 3, 0.3, 0.2, 0.045, 2);
      // the two forces reach for each other
      if (t > 0.55) {
        const k = smoothstep(0.55, 1.2, t);
        const bw = this.toVmWorld(this.vmBluePos, _v);
        const rw = this.toVmWorld(this.vmRedPos, _v2);
        for (let i = 0; i < 1 + Math.round(k * 3); i++) this.vmArcs.arc(bw, rw, 1.6, 0.6, 2.8, 0.03 * (1 - k * 0.6), 9);
      }
      this.vmLightA.position.copy(this.toVmWorld(this.vmBluePos, _v));
      this.vmLightA.color.setHex(0x3a78ff);
      this.vmLightA.intensity = 2 * fa;
      this.vmLightB.position.copy(this.toVmWorld(this.vmRedPos, _v));
      this.vmLightB.intensity = 2 * fa;
      setLens(0, this.toVmWorld(this.vmBluePos, _v), 0.02 * fa, 0.8, G.vmCamera);
      setLens(2, this.toVmWorld(this.vmRedPos, _v), 0.012 * fa, 0.7, G.vmCamera, 1, 0.025);
      G.player.addTrauma(dt * 0.25);
      if (t >= 1.25) this.mergePurple();
      return;
    }
    // merged: the imaginary mass, held between the hands
    const k = clamp((t - 1.25) / 0.35, 0, 1);
    this.vmPurplePos.copy(MEET);
    this.vmPurplePos.y += Math.sin(this.time * 40) * 0.0015;
    this.vmPurple.group.visible = true;
    this.vmPurple.group.position.copy(this.vmPurplePos);
    this.vmPurple.radius = (0.026 + 0.014 * easeOutCubic(k)) * (1 + Math.sin(this.time * 47) * 0.06);
    this.vmPurple.intensity = 1.15 + Math.sin(this.time * 33) * 0.15;
    this.vmFxAround(this.vmPurplePos, this.vmPurpleW, 1.8, 0.7, 3, 0.07, 4);
    this.vmLightA.position.copy(this.toVmWorld(this.vmPurplePos, _v));
    this.vmLightA.color.setHex(0xa040ff);
    this.vmLightA.intensity = 3.5;
    this.vmLightB.intensity = 0;
    setLens(1, this.toVmWorld(this.vmPurplePos, _v), 0.03 + 0.012 * k, 1.0, G.vmCamera);
    G.player.addTrauma(dt * 0.6);
    if (t >= 1.6) this.launchPurple(vm);
  }

  private mergePurple() {
    const p = this.purple;
    p.merged = true;
    this.vmBlue.group.visible = false;
    this.vmRed.group.visible = false;
    const post = G.renderer.post;
    post.impact = 1.3;
    post.impactColor.setRGB(0.72, 0.38, 1.0);
    post.flash = Math.max(post.flash, 0.5);
    post.aberration = Math.max(post.aberration, 2.2);
    post.bloomBoost = Math.max(post.bloomBoost, 1.6);
    G.player.addTrauma(0.45);
    this.callout('虚式「茈」', 'HOLLOW TECHNIQUE: PURPLE', 'purple', true);
    // a ring of light where the two infinities collide
    const w = this.toVmWorld(MEET, _v);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const s = rand(0.15, 0.5);
      this.vmStreaks.emit(w.x, w.y, w.z, Math.cos(a) * s, Math.sin(a) * s, rand(-0.05, 0.05), rand(0.15, 0.35), 0.0015, 2.2, 1.2, 3, { drag: 4, stretch: 0.03 });
    }
  }

  private launchPurple(vm: Viewmodel) {
    const p = this.purple;
    p.phase = 'fly';
    p.launched = true;
    p.ft = 0;
    p.dist = 0;
    p.trenchAcc = 0;
    p.speed = 16;
    p.r = 0.15;
    if (G.game) G.game.timeScale = 1;
    this.rT = 0;
    this.cd.purple = GOJO_CD.purple;
    this.vmPurple.group.visible = false;
    this.toVmWorld(MEET, _v);
    vm.toWorld(_v, p.pos);
    p.start.copy(p.pos);
    p.prev.copy(p.pos);
    p.pos.y = Math.max(0.9, p.pos.y);
    const d = G.player.getAim(p.dir);
    d.y = clamp(d.y, -0.1, 0.42);
    d.normalize();
    this.orbPurple.group.visible = true;
    const post = G.renderer.post;
    post.impact = 1.35;
    post.impactColor.setRGB(0.78, 0.45, 1.0);
    post.flash = Math.max(post.flash, 0.25);
    post.aberration = Math.max(post.aberration, 2.6);
    post.bloomBoost = Math.max(post.bloomBoost, 1.2);
    G.player.addTrauma(0.85);
    G.player.addRecoil(0.09, 0, 5);
    this.fovPunch = 0.12;
    vm.recoilPos.kick(0, 0.03, 0.9);
    vm.recoilRot.kick(2.2, 0, 0.6);
    G.audio?.play('purpleFire', { volume: 1.2 });
    // the launch alone knocks back everything around him
    const pl = G.player.pos;
    G.zombies.queryRadius(pl.x, pl.z, 5.5, this.qz);
    for (const z of this.qz) {
      if (!z.alive || z.state === 'down' || z.type.knockResist >= 0.9) continue;
      const dx = z.x - pl.x;
      const dz = z.z - pl.z;
      const l = Math.hypot(dx, dz) || 1;
      G.zombies.knockdown(z, null);
      if (z.ragdoll) this.launch(z.ragdoll, dx / l, dz / l, 9, 3);
    }
    this.pulses.shell(p.pos.x, p.pos.y, p.pos.z, 0.2, 6, 0.35, 0xb060ff, 2.4);
    this.pulses.ring(pl.x, pl.z, 0.5, 9, 0.5, 0xa040ff, 1.8, 0.05);
    this.wave.t = 0;
    this.wave.pos.copy(p.pos).addScaledVector(p.dir, 2);
    this.wave.range = 18;
  }

  private purpleFly(dt: number) {
    const p = this.purple;
    p.ft += dt;
    this.vmLightA.intensity = damp(this.vmLightA.intensity, 0, 14, dt);
    if (p.phase === 'fly') {
      p.prev.copy(p.pos);
      p.speed = Math.min(88, p.speed + 130 * dt);
      p.pos.addScaledVector(p.dir, p.speed * dt);
      if (p.pos.y < 0.9) p.pos.y = 0.9;
      const step = p.prev.distanceTo(p.pos);
      p.dist += step;
      // it swells as it leaves: never so fast that it swallows the camera
      p.r = Math.min(3.3, 0.15 + p.dist * 0.5);
      const o = this.orbPurple;
      o.group.position.copy(p.pos);
      o.radius = p.r * (1 + Math.sin(this.time * 37) * 0.04);
      o.intensity = 1.25 + Math.sin(this.time * 23) * 0.12;
      p.fxBudget = 700;
      this.erase(p.prev, p.pos, p.r);
      this.purpleTrail(dt, step);
      // a thin afterimage of its path, starting well ahead of the eyes
      if (p.dist > 9) {
        _v3.copy(p.start).addScaledVector(p.dir, 7);
        this.beam.set(_v3, p.pos, Math.min(0.75, p.r * 0.22));
        p.beamI = 0.55;
      }
      this.beam.intensity = p.beamI;
      const L = this.lightC;
      L.position.copy(p.pos);
      L.intensity = 140;
      setLens(1, p.pos, p.r * 0.9, 1.3, G.camera);
      const camD = this.camPos(_v).distanceTo(p.pos);
      G.audio?.loop('purpleLoop', clamp(1.15 - camD / 120, 0.15, 1), 1);
      if (camD < 50) G.player.addTrauma(dt * 0.9 * (1 - camD / 50));
      if (p.dist > PURPLE_RANGE || p.ft > 4) this.endPurple();
    } else {
      // 'fade'
      this.fadeBeam(dt);
      const o = this.orbPurple;
      o.radius *= Math.exp(-dt * 9);
      o.intensity *= Math.exp(-dt * 4);
      if (o.radius < 0.05) o.group.visible = false;
      this.lightC.intensity = damp(this.lightC.intensity, 0, 6, dt);
      G.audio?.loop('purpleLoop', 0);
      if (p.beamI <= 0.01 && !o.group.visible) p.phase = 'off';
    }
  }

  private fadeBeam(dt: number) {
    const p = this.purple;
    p.beamI = Math.max(0, p.beamI - dt * 0.6);
    this.beam.intensity = p.beamI;
  }

  private endPurple() {
    const p = this.purple;
    p.phase = 'fade';
    const x = p.pos.x;
    const y = p.pos.y;
    const z = p.pos.z;
    this.pulses.shell(x, y, z, p.r, p.r * 9, 1.0, 0xa040ff, 3);
    this.pulses.ring(x, z, p.r, p.r * 12, 1.2, 0x9030ff, 2, 0.04);
    G.fx.lights.flash(x, y, z, 0xa040ff, 200, 80, 0.9, 0.2);
    G.fx.flashes.emit(x, y, z, 0, 0, 0, 0.3, 8, 30, 2.4, 1.2, 4, 1, 0.6, 0.2, 1.2, 0);
  }

  /** Imaginary mass: everything its sphere sweeps through stops existing. */
  private erase(a: THREE.Vector3, b: THREE.Vector3, r: number) {
    const p = this.purple;
    const reach = r + a.distanceTo(b) + 6;
    G.zombies.queryRadius(b.x, b.z, reach, this.qz);
    for (const z of this.qz) {
      if (!z.alive) continue;
      if (z.state === 'down' && z.ragdoll) continue; // handled with the bodies
      const cy = z.y + 0.9 * z.scale;
      const d = segDist(z.x, cy, z.z, a, b);
      if (d < r + 0.45 * z.scale) {
        this.disintegrate(z.partPos, z.has.bind(z));
        G.zombies.vaporize(z, this.purpleHit(z));
      } else if (d < r + 5 && z.state !== 'down') {
        // the shock of its passing
        const nx = z.x - b.x;
        const nz = z.z - b.z;
        const l = Math.hypot(nx, nz) || 1;
        if (z.type.knockResist < 0.9 && G.ragdolls.active.length < G.ragdolls.maxActive) {
          G.zombies.knockdown(z, null);
          if (z.ragdoll) this.launch(z.ragdoll, nx / l, nz / l, 8 + (r + 5 - d) * 2, 3);
        } else {
          z.knockX += (nx / l) * 8 * (1 - z.type.knockResist);
          z.knockZ += (nz / l) * 8 * (1 - z.type.knockResist);
        }
      }
    }
    // bodies: knocked down, dead and still falling
    for (const rg of [...(G.ragdolls.active as Ragdoll[])]) {
      let gone = false;
      let near = false;
      for (const body of rg.bodies) {
        if (!body) continue;
        const t = body.translation();
        const d = segDist(t.x, t.y, t.z, a, b);
        if (d < r + 0.3) {
          gone = true;
          break;
        }
        if (d < r + 4) near = true;
      }
      if (gone) {
        this.disintegrate(rg.partPos, rg.has.bind(rg));
        if (rg.zombie && rg.zombie.alive) G.zombies.vaporize(rg.zombie, this.purpleHit(rg.zombie));
        else G.ragdolls.destroy(rg);
      } else if (near) {
        rg.center(F3);
        const nx = F3[0] - b.x;
        const nz = F3[2] - b.z;
        const l = Math.hypot(nx, nz) || 1;
        for (const body of rg.bodies) if (body) body.applyImpulse({ x: (nx / l) * body.mass() * 0.5, y: body.mass() * 0.3, z: (nz / l) * body.mass() * 0.5 }, true);
      }
    }
    // corpses lying in its path
    if (b.y - r < 0.8) {
      G.ragdolls.corpsesNear(b.x, b.z, r + 0.6, this.qc);
      for (const c of this.qc) {
        if (p.fxBudget > 0) this.disintegrate(c.partPos, (i: number) => (c.mask & (1 << i)) !== 0, 0.5);
        G.ragdolls.removeCorpse(c);
      }
    }
  }

  private purpleHit(z: Zombie): HitInfo {
    return { damage: z.hp, part: P.Torso, x: z.x, y: z.y + 1, z: z.z, dx: this.purple.dir.x, dy: 0, dz: this.purple.dir.z, stopping: 0, pen: 999, kind: 'energy', weapon: 'purple', noBlood: true, noWound: true, premult: true };
  }

  /** Every part of a body comes apart into light and ash. */
  private disintegrate(pos: Float32Array, has: (i: number) => boolean, scale = 1) {
    const p = this.purple;
    if (p.fxBudget <= 0) return;
    const dir = p.dir;
    for (let i = 0; i < PART_COUNT; i++) {
      if (!has(i)) continue;
      const x = pos[i * 3];
      const y = pos[i * 3 + 1];
      const z = pos[i * 3 + 2];
      const n = Math.max(1, Math.round(3 * scale));
      for (let k = 0; k < n; k++) {
        const s = rand(2, 9);
        const w = Math.random();
        this.streaks.emit(x, y, z, dir.x * s * 2 + rand(-3, 3), rand(-1, 4), dir.z * s * 2 + rand(-3, 3), rand(0.25, 0.6), 0.02, 1.4 + w, 0.5 + w * 0.8, 2.8, { drag: 2.5, stretch: 0.03, center: p.pos, pull: 40 });
      }
      const ash = rand(0.05, 0.12);
      G.fx.dust.emit(x, y, z, dir.x * 3 + rand(-1, 1), rand(0.2, 1.5), dir.z * 3 + rand(-1, 1), rand(0.8, 1.6), rand(0.15, 0.3), rand(0.6, 1.1), ash, ash * 0.9, ash * 1.1, 0.75, ash, ash, ash * 1.2, 0, 1.5, -0.05, rand(0, 6), rand(-1, 1));
      p.fxBudget -= n + 1;
    }
  }

  private purpleTrail(dt: number, step: number) {
    const p = this.purple;
    const c = p.pos;
    const r = p.r;
    // light and matter drawn into the mass
    const n = Math.round(1100 * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const L = r * rand(1.4, 3);
      const w = Math.random();
      this.streaks.emit(c.x + Math.cos(a) * s * L, c.y + u * L, c.z + Math.sin(a) * s * L, p.dir.x * p.speed * 0.6, 0, p.dir.z * p.speed * 0.6, 0.6, 0.03, 1.5 + w, 0.55 + w * 0.9, 3, { center: c, pull: 180, drag: 0.5, stretch: 0.04 });
    }
    // crackle on its skin
    for (let i = 0; i < 4; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      _v.set(c.x + Math.cos(a) * s * r, c.y + u * r, c.z + Math.sin(a) * s * r);
      _v2.copy(_v).addScaledVector(_v3.set(Math.cos(a) * s, u, Math.sin(a) * s), r * rand(0.4, 1.2));
      this.arcs.arc(_v, _v2, 1.8, 0.8, 3.2, r * 0.25, 6);
    }
    // the ground it touched is gone: a smoking trench
    if (c.y - r < 0.4) {
      p.trenchAcc += step;
      while (p.trenchAcc > 0.7) {
        p.trenchAcc -= 0.7;
        const x = c.x - p.dir.x * p.trenchAcc;
        const z = c.z - p.dir.z * p.trenchAcc;
        const half = Math.sqrt(Math.max(0, r * r - c.y * c.y));
        const w = Math.max(0.6, half * 1.15);
        G.fx.stains.stamp(x, z, w, 0.045, 0.036, 0.05, 0.62, 8 + Math.floor(Math.random() * 8));
        G.fx.stains.stamp(x, z, w * 0.5, 0.016, 0.012, 0.02, 0.55, 8 + Math.floor(Math.random() * 8));
        // embers along the lips of the trench
        for (const side of [-1, 1]) {
          const ex = x + p.dir.z * side * w * 0.45;
          const ez = z - p.dir.x * side * w * 0.45;
          G.fx.fire.emit(ex, 0.05, ez, rand(-0.2, 0.2), rand(0.2, 0.8), rand(-0.2, 0.2), rand(1.2, 2.6), rand(0.25, 0.5), 0.05, 1.6, 0.4, 2.6, 1, 0.5, 0.1, 1, 0, 0.5, -0.1, rand(0, 6), rand(-1, 1));
          G.fx.smoke.emit(ex, 0.2, ez, rand(-0.5, 0.5), rand(0.6, 1.6), rand(-0.5, 0.5), rand(2, 4), 0.5, 2.4, 0.1, 0.09, 0.12, 0.6, 0.18, 0.17, 0.2, 0, 0.8, -0.03, rand(0, 6), rand(-0.4, 0.4));
        }
        for (let i = 0; i < 3; i++) {
          const sp = rand(3, 9);
          const a = Math.random() * Math.PI * 2;
          const cc = rand(0.12, 0.25);
          G.fx.chips.emit(x, 0.1, z, Math.cos(a) * sp * 0.5, rand(3, 9), Math.sin(a) * sp * 0.5, rand(0.9, 1.6), rand(0.05, 0.12), 0.05, cc, cc * 0.9, cc * 0.85, 1, cc, cc * 0.9, cc * 0.85, 1, 0.3, 1, rand(0, 6), rand(-8, 8));
        }
      }
    }
  }
}
