import * as THREE from 'three';
import { G } from '../core/G';
import { clamp, damp, easeInOutCubic, easeOutCubic, lerp, rand, smoothstep } from '../core/math';
import { PART_COUNT, P } from '../zombies/skeleton';
import { S } from '../zombies/Zombie';
import type { Zombie } from '../zombies/Zombie';
import type { Ragdoll } from '../zombies/Ragdolls';
import type { HitInfo, ZombieHit } from '../zombies/ZombieManager';
import { ARM_SUKUNA } from '../weapons/Viewmodel';
import type { Viewmodel } from '../weapons/Viewmodel';
import { Hand } from '../gojo/Gojo';
import { Orb, Pulses, Streaks, setLens } from '../gojo/GojoFX';
import type { OrbStyle } from '../gojo/GojoFX';
import { FlameArrow, GroundCuts, Slashes } from './SukunaFX';
import { Shrine } from './Shrine';

/** Cooldowns (s). Dismantle is the flurry rate while LMB is held. The shrine's starts when it falls. */
export const SUKUNA_CD = { dismantle: 0.16, cleave: 0.9, fuga: 12, shrine: 40 };

const ORB_FIRE: OrbStyle = { core: 0xfff0c8, mid: 0xff6a10, rim: 0xff3008, halo: 0xff5a10, rays: 0.7, swirl: 2.4 };
/** Pinch point of the right hand (thumb meets index) and the centre of the palm, in the hand frame. */
const PINCH = new THREE.Vector3(-0.03, -0.06, -0.06);
const PALM_UP = new THREE.Vector3(0, -0.05, -0.03);

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const F3 = new Float32Array(3);

interface Blade {
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  fwd: THREE.Vector3;
  axis: THREE.Vector3;
  n: THREE.Vector3;
  len: number;
  dist: number;
  range: number;
  t: number;
  hit: Set<number>;
  gPrev: THREE.Vector3 | null;
  sweep: number;
}

type RAct = 'idle' | 'cleave' | 'fuga' | 'shrine' | 'xform';

/**
 * Ryomen Sukuna. U lets him take over: the markings crawl onto the wrists,
 * the nails go black. Dismantle (LMB, hold for a flurry), Cleave (RMB),
 * Fuga (R) and Domain Expansion: Malevolent Shrine (Z). Reverse cursed
 * technique keeps him on his feet.
 */
export class Sukuna {
  active = false;
  armsReady = false;
  gunLower = 0;
  fovMul = 1;
  onRevert: (() => void) | null = null;
  readonly cd = { dismantle: 0, cleave: 0, fuga: 0, shrine: 0 };
  readonly shrine: Shrine;
  /** Damage he actually takes; reverse cursed technique heals the rest away. */
  readonly damageScale = 0.15;
  private regenDelay = 0;
  private reverseT = 0;

  private time = 0;
  private rh!: Hand;
  private lh!: Hand;
  private handsParent: THREE.Object3D | null = null;
  private rAct: RAct = 'idle';
  private rT = 0;
  private xf = { t: -1, on: true, hit: false };
  private bandK = 0;
  private nailK = 0;
  private fovPunch = 0;
  private fovZoom = 1;
  private flexT = 4;

  // fx
  private readonly slashes: Slashes;
  /** Swipe trails drawn across the screen in front of the hand. */
  private readonly vmSlashes: Slashes;
  private readonly cuts: GroundCuts;
  private readonly streaks: Streaks;
  private readonly vmStreaks: Streaks;
  private readonly pulses: Pulses;
  private readonly vmFire = new Orb(ORB_FIRE);
  private readonly vmArrow: FlameArrow;
  private readonly arrow: FlameArrow;
  private readonly light = new THREE.PointLight(0xff6a20, 0, 26, 1.5);
  private readonly vmLight = new THREE.PointLight(0xff6a20, 0, 0.9, 1.4);
  private readonly wave = { t: -1, pos: new THREE.Vector3(), range: 30, dur: 0.7 };

  // Dismantle
  private readonly blades: Blade[] = [];
  private disT = 0;
  private disSide = 1;
  private disIdle = 9;
  private swipe = { t: -1, side: 1, theta: 0 };
  private soundT = 0;

  // Cleave
  private readonly cleave = { t: -1, targets: [] as Zombie[], done: false };

  // Fuga
  private readonly fuga = {
    phase: 'off' as 'off' | 'charge' | 'fly',
    t: 0,
    pos: new THREE.Vector3(),
    prev: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    dist: 0,
    said: false,
  };
  private readonly vmTail = new THREE.Vector3();
  private readonly vmHead = new THREE.Vector3();

  // Malevolent Shrine
  private readonly zCut = new Map<number, number>();
  private readonly rCut = new Map<Ragdoll, number>();
  private mince = 0;
  private ambient = 0;

  private readonly qz: Zombie[] = [];
  private readonly qc: any[] = [];
  private readonly hits: ZombieHit[] = [];

  constructor() {
    this.slashes = new Slashes(G.scene);
    this.vmSlashes = new Slashes(G.vmScene, () => G.vmCamera);
    this.cuts = new GroundCuts(G.scene);
    this.streaks = new Streaks(G.scene, () => G.camera);
    this.vmStreaks = new Streaks(G.vmScene, () => G.vmCamera, 0.015);
    this.pulses = new Pulses(G.scene);
    this.shrine = new Shrine(G.scene);
    this.shrine.onPhase = (p) => {
      if (p === 'rise') this.callout('伏魔御厨子', 'MALEVOLENT SHRINE', 'shrine', true);
      else if (p === 'off') {
        this.cd.shrine = SUKUNA_CD.shrine;
        this.zCut.clear();
        this.rCut.clear();
      }
    };
    this.vmArrow = new FlameArrow(G.fx.glowTex);
    this.arrow = new FlameArrow(G.fx.glowTex);
    G.vmScene.add(this.vmArrow.group, this.vmLight);
    G.scene.add(this.arrow.group);
    this.light.layers.enableAll();
    G.scene.add(this.light);
    this.vmFire.haloScale = 2.0;
  }

  private attach(vm: Viewmodel) {
    if (this.handsParent === vm.handsRoot) return;
    this.handsParent = vm.handsRoot;
    this.rh = new Hand(vm.handsRoot);
    this.lh = new Hand(vm.handsRoot);
    vm.handsRoot.add(this.vmFire.group);
  }

  get busy() {
    return this.fuga.phase === 'charge' || this.shrine.phase === 'sign' || this.shrine.phase === 'rise' || this.xf.t >= 0;
  }

  /** U: let Sukuna out, or push him back down. */
  toggle() {
    if (this.xf.t >= 0) return false;
    if (!this.active) {
      this.active = true;
      this.armsReady = false;
      this.xf = { t: 0, on: true, hit: false };
      this.rAct = 'xform';
      this.bandK = 0;
      this.nailK = 0;
      return true;
    }
    if (this.busy) return false;
    this.xf = { t: 0, on: false, hit: true };
    this.rAct = 'xform';
    G.audio?.play('sukunaRevert', { volume: 0.8 });
    return true;
  }

  forceRevert() {
    if (!this.active && this.xf.t < 0) return;
    this.reset();
    this.active = false;
    this.armsReady = false;
    this.xf.t = -1;
    this.rAct = 'idle';
    this.onRevert?.();
  }

  reset() {
    this.shrine.end();
    this.blades.length = 0;
    this.cleave.t = -1;
    this.fuga.phase = 'off';
    this.wave.t = -1;
    this.zCut.clear();
    this.rCut.clear();
    if (G.game) G.game.timeScale = 1;
    for (const k of Object.keys(this.cd) as (keyof typeof this.cd)[]) this.cd[k] = 0;
    this.slashes.clear();
    this.vmSlashes.clear();
    this.cuts.clear();
    this.streaks.clear();
    this.vmStreaks.clear();
    this.pulses.clear();
    this.vmFire.group.visible = false;
    this.vmArrow.group.visible = false;
    this.arrow.group.visible = false;
    this.light.intensity = this.vmLight.intensity = 0;
    if (this.xf.t >= 0) {
      this.xf.t = -1;
      this.gunLower = 0;
      if (this.xf.on) {
        this.armsReady = this.active;
        this.bandK = this.nailK = 1;
      } else {
        this.active = false;
        this.armsReady = false;
        this.onRevert?.();
      }
    }
    this.rAct = 'idle';
    this.silence();
  }

  silence() {
    G.audio?.loop('shrineLoop', 0);
  }

  /** Player.damage passed through: healing slows for a moment, then comes back in full. */
  onHurt() {
    this.regenDelay = 0.35;
  }

  /** A blow that would have killed him: reverse cursed technique restores him at once. */
  reverse() {
    const pl = G.player;
    pl.hp = pl.maxHp * 0.6;
    pl.damageFlash = 0;
    this.reverseT = 0.6;
    const post = G.renderer.post;
    post.flash = Math.max(post.flash, 0.2);
    post.heal = 1;
    G.audio?.play('sukunaRevert', { volume: 0.7, pitch: 1.4 });
    // the strike that should have landed is answered at once
    const p = pl.pos;
    G.zombies.queryRadius(p.x, p.z, 3.2, this.qz);
    for (const z of this.qz) {
      if (!z.alive || z.state === 'down') continue;
      const f = _d.set(z.x - p.x, 0, z.z - p.z).normalize().clone();
      const ax = new THREE.Vector3(-f.z, rand(-0.5, 0.5), f.x).normalize();
      this.cutZombie(z, rand(0.3, 0.9), ax, f, rand(-0.6, 0.6), 'reverse', 0.05);
    }
  }

  hud() {
    const sh = this.shrine;
    return {
      label: '呪いの王 · KING OF CURSES',
      slots: [
        { key: 'LMB', jp: '解', name: 'DISMANTLE', cd: 0, on: this.blades.length > 0, cls: 'kai' },
        { key: 'RMB', jp: '捌', name: 'CLEAVE', cd: this.cd.cleave / SUKUNA_CD.cleave, on: this.cleave.t >= 0, cls: 'hachi' },
        { key: 'R', jp: '開', name: 'FUGA', cd: this.cd.fuga / SUKUNA_CD.fuga, on: this.fuga.phase !== 'off', cls: 'fuga' },
        { key: 'Z', jp: '伏魔御厨子', name: 'SHRINE', cd: sh.active ? 0 : this.cd.shrine / SUKUNA_CD.shrine, on: sh.active, cls: 'shrine', left: sh.active ? sh.remaining : 0 },
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
    this.soundT -= dt;
    if (this.xf.t >= 0) this.updateTransform(dt);
    if (this.active && this.armsReady && this.xf.t < 0 && ok) this.input(dt);
    this.updateHands(dt);
    this.updateBlades(dt);
    this.updateCleave(dt);
    this.updateFuga(dt, vm);
    this.shrine.update(dt);
    this.updateShrine(dt);
    this.updateWave(dt);

    if (this.armsReady) {
      vm.rhObj = this.rh.obj;
      vm.lhObj = this.lh.obj;
      vm.rhVisible = this.rh.visible;
      vm.lhVisible = this.lh.visible;
      vm.setBareLook(ARM_SUKUNA, this.bandK);
      vm.setBareNail(this.nailK);
      this.aura(dt);
    }
    // reverse cursed technique: always mending, faster once the blows stop
    if (this.active) {
      this.regenDelay -= dt;
      const pl = G.player;
      if (pl.alive && pl.hp < pl.maxHp) pl.heal((this.regenDelay <= 0 ? 40 : 18) * dt);
      if (this.reverseT > 0) {
        this.reverseT -= dt;
        G.renderer.post.heal = Math.max(0, this.reverseT / 0.6);
      }
    }
    this.slashes.update(dt);
    this.vmSlashes.update(dt);
    this.cuts.update(dt);
    this.streaks.update(dt);
    this.vmStreaks.update(dt);
    this.pulses.update(dt, this.time);
    if (this.vmFire.group.visible) this.vmFire.update(this.time, G.vmCamera);
    if (this.vmArrow.group.visible) this.vmArrow.update(this.time, G.vmCamera);
    if (this.arrow.group.visible) this.arrow.update(this.time, G.camera);
    this.fovPunch = damp(this.fovPunch, 0, 5, dt);
    this.fovZoom = damp(this.fovZoom, this.zoomTarget(), 4, dt);
    this.fovMul = this.fovZoom + this.fovPunch;
  }

  private zoomTarget() {
    if (this.fuga.phase === 'charge') return this.fuga.t > 0.7 ? 0.86 : 0.95;
    if (this.shrine.phase === 'sign') return 0.93;
    return 1;
  }

  private input(dt: number) {
    const input = G.input;
    const fugaBusy = this.fuga.phase === 'charge';
    const signBusy = this.shrine.phase === 'sign' || this.shrine.phase === 'rise';
    this.disIdle += dt;
    if (input.mouse(0) && !fugaBusy && !signBusy && this.cd.dismantle <= 0) this.fireDismantle();
    if (input.mousePress(2) && this.cd.cleave <= 0 && this.rAct === 'idle' && !fugaBusy) this.startCleave();
    if (input.pressed('KeyR') && this.fuga.phase === 'off' && this.cd.fuga <= 0 && this.rAct === 'idle') this.startFuga();
    if (input.pressed('KeyZ') && !this.shrine.active && this.cd.shrine <= 0 && this.rAct === 'idle' && !fugaBusy) this.startShrine();
  }

  private camPos(out: THREE.Vector3) {
    return G.camera.getWorldPosition(out);
  }

  private aimPoint(maxD: number, out: THREE.Vector3) {
    const o = this.camPos(_o);
    const d = G.player.getAim(_d);
    let t = maxD;
    if (d.y < -0.005) t = Math.min(t, o.y / -d.y);
    this.hits.length = 0;
    G.zombies.rayHits(o.x, o.y, o.z, d.x, d.y, d.z, t, this.hits);
    for (const h of this.hits) if (h.t < t) t = h.t;
    return out.copy(o).addScaledVector(d, t);
  }

  private toVmWorld(local: THREE.Vector3, out: THREE.Vector3) {
    return this.handsParent ? this.handsParent.localToWorld(out.copy(local)) : out.copy(local);
  }

  // ------------------------------------------------------------------ takeover
  private updateTransform(dt: number) {
    const x = this.xf;
    x.t += dt;
    const t = x.t;
    const post = G.renderer.post;
    if (x.on) {
      this.gunLower = easeInOutCubic(t / 0.22);
      if (t >= 0.22 && !this.armsReady) {
        this.armsReady = true;
        this.gunLower = 0;
      }
      // the markings crawl on, the nails blacken
      this.bandK = smoothstep(0.32, 0.85, t);
      this.nailK = smoothstep(0.4, 0.8, t);
      if (t >= 0.2 && t - dt < 0.2) G.audio?.play('sukunaTransform', { volume: 1.1 });
      if (t >= 0.62 && !x.hit) {
        x.hit = true;
        post.impact = 1.3;
        post.impactColor.setRGB(0.95, 0.1, 0.08);
        post.flash = Math.max(post.flash, 0.2);
        post.aberration = Math.max(post.aberration, 1.6);
        post.bloomBoost = Math.max(post.bloomBoost, 0.8);
        G.player.addTrauma(0.55);
        this.fovPunch = 0.07;
        this.callout('両面宿儺', 'THE KING OF CURSES', 'sukuna', true);
        const p = G.player.pos;
        this.pulses.ring(p.x, p.z, 0.5, 14, 0.7, 0xff1a0a, 2.2, 0.05);
        for (let i = 0; i < 36; i++) {
          const a = (i / 36) * Math.PI * 2;
          const sp = rand(5, 9);
          G.fx.dust.emit(p.x + Math.cos(a), 0.2, p.z + Math.sin(a), Math.cos(a) * sp, rand(0.3, 1.2), Math.sin(a) * sp, rand(0.8, 1.4), 0.6, 2.6, 0.3, 0.2, 0.18, 0.55, 0.3, 0.2, 0.18, 0, 3, -0.02, rand(0, 6), 0);
        }
        for (const h of [this.rh, this.lh]) {
          const c = this.toVmWorld(h.local(PALM_UP, _v), _v2);
          for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = rand(0.2, 0.7);
            this.vmStreaks.emit(c.x, c.y, c.z, Math.cos(a) * s, rand(0.1, 0.8), Math.sin(a) * s * 0.5, rand(0.25, 0.6), 0.0012, 2.4, 0.15, 0.1, { drag: 3, stretch: 0.03 });
          }
        }
      }
      if (t >= 1.3) {
        x.t = -1;
        this.rAct = 'idle';
      }
    } else if (t >= 0.28) {
      x.t = -1;
      this.active = false;
      this.armsReady = false;
      this.rAct = 'idle';
      this.shrine.end();
      this.onRevert?.();
    }
  }

  // ------------------------------------------------------------------ hands
  private updateHands(dt: number) {
    const R = this.rh;
    const L = this.lh;
    const T = this.time;
    this.rT += dt;
    R.shake = L.shake = 0;
    if (!this.armsReady) {
      R.hide();
      L.hide();
    } else if (this.rAct === 'xform') {
      const t = this.xf.t;
      if (!this.xf.on) {
        R.hide();
        L.hide();
      } else if (t < 0.95) {
        // he looks at his new hands: palms in, fingers curling as the markings spread
        const pose = t > 0.45 && t < 0.72 ? 'claw' : 'open';
        R.set(0.085, -0.115, -0.32, -0.12, 1, -0.12, 0.05, 0.2, -1, pose, 10, 8);
        L.set(-0.085, -0.12, -0.32, 0.12, 1, -0.12, -0.05, 0.2, -1, pose, 10, 8);
        R.shake = L.shake = t > 0.5 && t < 0.75 ? 0.0025 : 0.0008;
      } else this.idle(R, L, T, dt);
    } else if (this.rAct === 'shrine') {
      // 閻魔天印: the Enma-ten sign held before the chest
      R.set(0.028, -0.1, -0.33, -0.14, 1, -0.22, 1, 0.12, 0.15, 'mudra', 12, 12);
      L.set(-0.028, -0.1, -0.33, 0.14, 1, -0.22, -1, 0.12, 0.15, 'mudra', 12, 12);
      if (this.shrine.phase !== 'sign' && this.shrine.phase !== 'rise') this.rAct = 'idle';
    } else if (this.rAct === 'fuga') {
      this.fugaHands(R, L);
    } else if (this.rAct === 'cleave') {
      const t = this.cleave.t;
      // reach out and seize it
      if (t < 0.09) R.set(0.07, -0.08, -0.52, -0.08, 0.15, -1, 0.1, 1, 0.1, 'claw', 30, 30);
      else R.set(0.1, -0.1, -0.47, -0.08, 0.1, -1, 0.1, 1, 0.1, 'fist', 26, 34);
      this.idleLeft(L, T);
      if (t < 0 || t > 0.4) this.rAct = 'idle';
    } else this.idle(R, L, T, dt);
    // Dismantle swipes override whichever hand is cutting
    const sw = this.swipe;
    if (sw.t >= 0) sw.t += dt;
    if (sw.t > 0.24) sw.t = -1;
    if (sw.t >= 0 && (this.rAct === 'idle' || this.rAct === 'cleave')) {
      const H = sw.side > 0 ? R : L;
      if (sw.side < 0 || this.rAct === 'idle') {
        const s = sw.side;
        const ca = Math.cos(sw.theta);
        const sa = Math.sin(sw.theta);
        const k = easeOutCubic(Math.min(1, sw.t / 0.11));
        // knife hand sweeping along the cut, from its own side across
        const bx = s * 0.1;
        const px = bx + s * ca * lerp(0.16, -0.17, k);
        const py = -0.1 + s * sa * lerp(0.16, -0.17, k);
        H.set(px, py, -0.42 - 0.04 * Math.sin(k * Math.PI), -s * 0.55 * ca - 0.2 * s, -s * 0.55 * sa + 0.05, -1, s * 0.15 - sa * 0.3, 1, 0.1, 'blade', 34, 40);
      }
    }
    R.update(dt);
    L.update(dt);
  }

  private idle(R: Hand, L: Hand, T: number, dt: number) {
    // now and then he flexes his fingers, savouring the body
    this.flexT -= dt;
    const flex = this.flexT < 0.6 && this.flexT > 0;
    if (this.flexT <= 0) this.flexT = rand(5, 9);
    R.set(0.235, -0.2 + Math.sin(T * 1.2) * 0.004, -0.43, -0.32, 0.16, -1, 0.55, 1, 0.12, flex ? 'claw' : 'relax', 9, 7);
    this.idleLeft(L, T);
  }

  private idleLeft(L: Hand, T: number) {
    L.set(-0.24, -0.215 + Math.sin(T * 1.2 + 1.3) * 0.004, -0.44, 0.32, 0.16, -1, -0.55, 1, 0.12, 'relax', 9, 10);
  }

  /** Cursed energy seeping off his fingers. */
  private aura(dt: number) {
    if (Math.random() > dt * 10) return;
    const h = Math.random() < 0.5 ? this.rh : this.lh;
    if (!h.visible) return;
    const c = this.toVmWorld(h.local(_v3.set(rand(-0.03, 0.03), 0.01, rand(-0.12, 0.02)), _v), _v2);
    this.vmStreaks.emit(c.x, c.y, c.z, rand(-0.02, 0.02), rand(0.05, 0.12), rand(-0.02, 0.02), rand(0.4, 0.9), 0.0012, 1.4, 0.06, 0.05, { drag: 1, stretch: 0.03 });
  }

  // ------------------------------------------------------------------ cutting
  /** Damage straight to the body; kind 'explosion' keeps the default death shove out of it. */
  private hurt(z: Zombie, dmg: number, src: string, kind: HitInfo['kind'] = 'explosion') {
    if (!z.alive) return false;
    return G.zombies.damage(z, { damage: dmg, part: P.Torso, x: z.x, y: z.y + 1 * z.scale, z: z.z, dx: 0, dy: 0.2, dz: 0, stopping: 0, pen: 999, kind, weapon: src, noBlood: true, noWound: true, premult: true });
  }

  /** Joints a cut at height ratio r (0 feet .. 1 crown) goes through. */
  private partsFor(r: number, theta: number, side: number): number[] {
    let parts: number[];
    if (r > 0.83) parts = [P.Head];
    else if (r > 0.6) parts = [P.Torso, P.UArmL, P.UArmR];
    else if (r > 0.42) parts = [P.Torso];
    else if (r > 0.22) parts = [P.ULegL, P.ULegR];
    else parts = [P.LLegL, P.LLegR];
    // a steep diagonal also takes the arm on the high side
    if (Math.abs(theta) > 0.4 && r > 0.35 && r < 0.85) parts.push(theta * side > 0 ? P.UArmR : P.UArmL);
    return parts;
  }

  /** Blood thrown out along the line of a cut. */
  private bloodFan(x: number, y: number, z: number, ax: THREE.Vector3, fwd: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) {
      const s = (Math.random() < 0.5 ? -1 : 1) * rand(1, 4.5);
      const k = Math.random();
      const r = 0.22 + k * 0.3;
      const g = 0.008 + k * 0.012;
      const sz = rand(0.03, 0.07);
      G.fx.blood.emit(x, y, z, ax.x * s + fwd.x * rand(0.5, 3), ax.y * s * 0.5 + rand(0.5, 3), ax.z * s + fwd.z * rand(0.5, 3), rand(0.7, 1.4), sz, sz * 0.8, r, g, g, 1, r * 0.6, g * 0.5, g * 0.5, 1, 1.2, 1.0);
    }
    G.fx.mist.emit(x, y, z, fwd.x * 1.5, 0.3, fwd.z * 1.5, rand(0.4, 0.7), 0.25, 1.1, 0.42, 0.02, 0.02, 0.7, 0.25, 0.01, 0.01, 0, 2.5, 0.05, rand(0, 6), 0);
  }

  /**
   * Cut a zombie through at height ratio r along a blade (axis, travelling fwd).
   * Normal zombies come apart along the cut; bosses lose a chunk of health.
   */
  private cutZombie(z: Zombie, r: number, axis: THREE.Vector3, fwd: THREE.Vector3, theta: number, src: string, bossFrac: number, loud = true) {
    if (!z.alive) return;
    const H = (z.type.body.id === 'dog' ? 1.0 : 1.8) * z.scale;
    const y = z.y + r * H;
    // the visible edge of the cut across the body
    this.slashes.flash({ pos: _v.set(z.x, y, z.z), fwd, axis, len: 1.5 * z.scale, thick: 0.035, bulge: 0.03, color: [2.2, 0.5, 0.4] }, 0.14);
    if (loud && this.soundT <= 0) {
      this.soundT = 0.05;
      G.audio?.play('slashFlesh', { x: z.x, y, z: z.z, volume: 0.9 });
    }
    if (z.type.id === 'boss') {
      this.hurt(z, z.maxHp * bossFrac, src);
      z.kickSpring(S.TorsoPitch, rand(-5, 5));
      z.kickSpring(S.TorsoRoll, rand(-5, 5));
      this.bloodFan(z.x, y, z.z, axis, fwd, 10);
      return;
    }
    const side = Math.sign((z.x - G.player.pos.x) * -fwd.z + (z.z - G.player.pos.z) * fwd.x) || 1;
    // too many bodies already flying: this one is cut to pieces on the spot
    if (!this.room()) {
      this.mincedKill(z, src);
      return;
    }
    this.hurt(z, z.hp + 1, src);
    const rg = z.deathRagdoll as Ragdoll | null;
    if (!rg) return;
    this.splitRagdoll(rg, this.partsFor(r, theta, side), y, axis, fwd);
    this.bloodFan(z.x, y, z.z, axis, fwd, 16);
    G.fx.stains.blood(z.x + rand(-0.4, 0.4), z.z + rand(-0.4, 0.4), rand(0.6, 1.0), 0.4);
  }

  /** Space left in the ragdoll budget for another body. */
  private room() {
    return G.ragdolls.active.length < G.ragdolls.maxActive - 2;
  }

  /** Killed without a ragdoll: a spray of meat and blood (or ash, for fire). */
  private mincedKill(z: Zombie, src: string, ash = false) {
    const x = z.x;
    const y = z.y + 0.9 * z.scale;
    const zz = z.z;
    if (ash) {
      for (let i = 0; i < 10; i++) {
        const sh = rand(0.05, 0.12);
        G.fx.dust.emit(x + rand(-0.3, 0.3), y + rand(-0.6, 0.6), zz + rand(-0.3, 0.3), rand(-1, 1), rand(0.5, 2.5), rand(-1, 1), rand(1, 2), rand(0.3, 0.5), rand(0.9, 1.6), sh, sh * 0.9, sh * 0.85, 0.8, sh, sh, sh, 0, 1.2, -0.05, rand(0, 6), rand(-1, 1));
        G.fx.sparksP.emit(x, y + rand(-0.6, 0.6), zz, rand(-2, 2), rand(1, 4), rand(-2, 2), rand(0.5, 1.2), 0.04, 0.01, 4, 1.2, 0.2, 1, 1.4, 0.2, 0.05, 1, 0.6, 0.6);
      }
    } else {
      G.fx.gore(x, y, zz, 6, z.skin);
      this.bloodFan(x, y, zz, _v.set(1, 0, 0), _v2.set(0, 0, 1), 10);
      G.fx.stains.blood(x, zz, 0.9, 0.3);
    }
    G.zombies.vaporize(z, { damage: z.hp, part: P.Torso, x, y, z: zz, dx: 0, dy: 1, dz: 0, stopping: 0, pen: 999, kind: ash ? 'fire' : 'explosion', weapon: src, noBlood: true, noWound: true, premult: true });
  }

  /** Sever joints and throw what's above the cut along the blade. */
  private splitRagdoll(rg: Ragdoll, parts: number[], cutY: number, axis: THREE.Vector3, fwd: THREE.Vector3, spurt = true) {
    let n = 0;
    for (const p of parts) {
      if (!rg.joints[p]) continue;
      G.ragdolls.sever(rg, p, spurt && n === 0);
      n++;
    }
    const sweep = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < PART_COUNT; i++) {
      const b = rg.bodies[i];
      if (!b) continue;
      const t = b.translation();
      const m = b.mass();
      if (t.y > cutY) {
        // the upper piece slides off the cut
        b.applyImpulse({ x: (fwd.x * rand(2, 5) + axis.x * sweep * 1.5) * m, y: rand(0.5, 2) * m, z: (fwd.z * rand(2, 5) + axis.z * sweep * 1.5) * m }, true);
        b.applyTorqueImpulse({ x: rand(-1, 1) * m * 0.08, y: rand(-1, 1) * m * 0.08, z: rand(-1, 1) * m * 0.08 }, true);
      } else b.applyImpulse({ x: fwd.x * 0.6 * m, y: 0, z: fwd.z * 0.6 * m }, true);
    }
  }

  /** Every joint at once: Cleave and the shrine leave nothing whole. */
  private dice(rg: Ragdoll, cx: number, cy: number, cz: number, power: number) {
    for (let i = 1; i < PART_COUNT; i++) if (rg.joints[i]) G.ragdolls.sever(rg, i, i === P.Torso);
    for (let i = 0; i < PART_COUNT; i++) {
      const b = rg.bodies[i];
      if (!b) continue;
      const t = b.translation();
      const dx = t.x - cx;
      const dy = t.y - cy;
      const dz = t.z - cz;
      const l = Math.hypot(dx, dy, dz) || 1;
      const m = b.mass() * rand(1.5, 4) * power;
      b.applyImpulse({ x: (dx / l) * m, y: (Math.max(0, dy / l) + 0.6) * m, z: (dz / l) * m }, true);
      b.applyTorqueImpulse({ x: rand(-1, 1) * m * 0.05, y: rand(-1, 1) * m * 0.05, z: rand(-1, 1) * m * 0.05 }, true);
    }
  }

  // ------------------------------------------------------------------ Dismantle
  private fireDismantle() {
    this.cd.dismantle = SUKUNA_CD.dismantle;
    if (this.disIdle > 1.2) this.callout('解', 'DISMANTLE', 'kai');
    this.disIdle = 0;
    this.disSide = -this.disSide;
    const side = this.disSide;
    // alternate diagonals, now and then dead level
    const theta = Math.random() < 0.25 ? rand(-0.08, 0.08) : side * rand(0.18, 0.6);
    const cam = G.camera;
    const fwd = G.player.getAim(new THREE.Vector3());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const axis = right.multiplyScalar(Math.cos(theta)).addScaledVector(up, Math.sin(theta));
    axis.addScaledVector(fwd, -axis.dot(fwd)).normalize();
    const n = new THREE.Vector3().crossVectors(fwd, axis).normalize();
    const start = this.camPos(new THREE.Vector3()).addScaledVector(fwd, 1.6).addScaledVector(up, -0.15);
    this.blades.push({ pos: start.clone(), prev: start.clone(), fwd, axis, n, len: 2.5, dist: 0, range: 78, t: 0, hit: new Set(), gPrev: null, sweep: theta });
    this.swipe = { t: 0, side, theta };
    // the stroke itself, a bright arc across the view
    const ca = Math.cos(theta);
    const sa = Math.sin(theta);
    this.vmSlashes.flash({ pos: new THREE.Vector3(side * 0.02, -0.08, -0.5), fwd: new THREE.Vector3(0, 0, -1), axis: new THREE.Vector3(ca, sa, 0), len: 0.62, thick: 0.004, bulge: -0.1, color: [2.0, 0.3, 0.25] }, 0.1);
    G.audio?.play('dismantle', { volume: 0.85, pitchVar: 0.08 });
    G.player.addTrauma(0.05);
    this.fovPunch = Math.max(this.fovPunch, 0.008);
    G.renderer.post.aberration = Math.max(G.renderer.post.aberration, 0.25);
  }

  private updateBlades(dt: number) {
    for (let i = this.blades.length - 1; i >= 0; i--) {
      const b = this.blades[i];
      b.t += dt;
      b.prev.copy(b.pos);
      const step = 140 * dt;
      b.pos.addScaledVector(b.fwd, step);
      b.dist += step;
      b.len = Math.min(11, 2.5 + b.t * 85);
      const fade = clamp((b.range - b.dist) / 12, 0, 1) * Math.min(1, b.t / 0.02);
      this.slashes.draw({ pos: b.pos, fwd: b.fwd, axis: b.axis, len: b.len, thick: 0.07, bulge: 0.14, color: [1.8, 0.16, 0.12], fade });
      // afterimages trailing the edge
      for (const [back, f] of [[1.6, 0.45], [3.4, 0.2]] as const) {
        if (b.dist < back) continue;
        this.slashes.draw({ pos: b.pos.clone().addScaledVector(b.fwd, -back), fwd: b.fwd, axis: b.axis, len: b.len * (1 - back * 0.03), thick: 0.06, bulge: 0.14, color: [1.4, 0.08, 0.06], fade: fade * f });
      }
      this.bladeHits(b, step);
      this.bladeGround(b);
      if (b.dist >= b.range || b.pos.y < -2) this.blades.splice(i, 1);
    }
  }

  /** What the flying edge passes through this frame comes apart at that height. */
  private bladeHits(b: Blade, step: number) {
    const half = b.len / 2;
    const mx = (b.prev.x + b.pos.x) / 2;
    const mz = (b.prev.z + b.pos.z) / 2;
    G.zombies.queryRadius(mx, mz, half + step / 2 + 1.5, this.qz);
    for (const z of this.qz) {
      if (!z.alive || z.state === 'down' || b.hit.has(z.id)) continue;
      const H = (z.type.body.id === 'dog' ? 1.0 : 1.8) * z.scale;
      _v.set(z.x, z.y + H / 2, z.z);
      const s = _v2.subVectors(_v, b.prev).dot(b.fwd);
      if (s < -0.45 || s > step + 0.45) continue;
      // where the blade's plane cuts the zombie's upright axis
      _v3.copy(b.prev).addScaledVector(b.fwd, s);
      _v2.subVectors(_v, _v3);
      const ra = _v2.dot(b.axis);
      const rn = _v2.dot(b.n);
      const ny = b.n.y;
      let r: number;
      if (Math.abs(ny) > 0.2) {
        const tt = -rn / ny;
        const h = H / 2 + tt;
        if (h < 0.03 * H || h > 1.02 * H) continue;
        const la = ra + tt * b.axis.y;
        if (Math.abs(la) > half) continue;
        r = h / H;
      } else {
        // a vertical cut: only if it passes through the body
        if (Math.abs(rn) > 0.32 * z.scale || Math.abs(ra) > half) continue;
        r = 0.5;
      }
      b.hit.add(z.id);
      this.cutZombie(z, clamp(r, 0, 1), b.axis, b.fwd, b.sweep, 'dismantle', 0.06);
    }
    // bodies already down get cut again where the edge crosses them
    let cutsLeft = 6;
    for (const rg of G.ragdolls.active as Ragdoll[]) {
      if (cutsLeft <= 0) break;
      for (let i = 1; i < PART_COUNT; i++) {
        const body = rg.bodies[i];
        if (!body || !rg.joints[i]) continue;
        const t = body.translation();
        _v.set(t.x, t.y, t.z);
        const s = _v2.subVectors(_v, b.prev).dot(b.fwd);
        if (s < -0.3 || s > step + 0.3) continue;
        _v3.copy(b.prev).addScaledVector(b.fwd, s);
        _v2.subVectors(_v, _v3);
        if (Math.abs(_v2.dot(b.n)) > 0.25 || Math.abs(_v2.dot(b.axis)) > half) continue;
        G.ragdolls.sever(rg, i, false);
        body.applyImpulse({ x: b.fwd.x * body.mass() * 3, y: body.mass() * 1.5, z: b.fwd.z * body.mass() * 3 }, true);
        this.bloodFan(t.x, t.y, t.z, b.axis, b.fwd, 6);
        cutsLeft--;
        break;
      }
    }
  }

  /** A blade dipping under the road carves a straight gash along its path. */
  private bladeGround(b: Blade) {
    const ay = b.axis.y;
    let g: THREE.Vector3 | null = null;
    if (Math.abs(ay) > 0.05) {
      const u = -b.pos.y / ay;
      if (Math.abs(u) < b.len / 2) g = _v.copy(b.pos).addScaledVector(b.axis, u);
    }
    if (g && b.gPrev) {
      this.cuts.add(b.gPrev.x, b.gPrev.z, g.x, g.z, 0.14);
      if (Math.random() < 0.5) {
        const c = rand(0.14, 0.26);
        G.fx.chips.emit(g.x, 0.05, g.z, rand(-1, 1), rand(1, 3), rand(-1, 1), rand(0.4, 0.8), rand(0.02, 0.05), 0.02, c, c * 0.95, c * 0.9, 1, c, c * 0.95, c * 0.9, 1, 0.3, 1, rand(0, 6), rand(-8, 8));
        G.fx.dust.emit(g.x, 0.1, g.z, 0, rand(0.3, 0.8), 0, rand(0.4, 0.8), 0.15, 0.6, 0.3, 0.29, 0.28, 0.45, 0.3, 0.29, 0.28, 0, 1, -0.02, rand(0, 6), 0);
      }
    }
    if (g) {
      if (!b.gPrev) b.gPrev = new THREE.Vector3();
      b.gPrev.copy(g);
    } else b.gPrev = null;
  }

  // ------------------------------------------------------------------ Cleave
  private startCleave() {
    const c = this.cleave;
    const cp = this.camPos(_o);
    const aim = G.player.getAim(_d);
    // the target under the crosshair, or failing that whatever is closest in front
    let best: Zombie | null = null;
    let bestS = Infinity;
    for (const z of G.zombies.list) {
      if (!z.alive || z.state === 'down') continue;
      _v.set(z.x - cp.x, z.y + 0.9 * z.scale - cp.y, z.z - cp.z);
      const d = _v.length();
      if (d > 34) continue;
      const cos = _v.dot(aim) / d;
      const ang = Math.acos(clamp(cos, -1, 1));
      const lim = d < 5 ? 0.9 : 0.26;
      if (ang > lim) continue;
      const s = ang * 10 + d * 0.05;
      if (s < bestS) {
        bestS = s;
        best = z;
      }
    }
    c.targets.length = 0;
    if (best) {
      c.targets.push(best);
      G.zombies.queryRadius(best.x, best.z, 3.4, this.qz);
      for (const z of this.qz) if (z !== best && z.alive && z.state !== 'down' && c.targets.length < 7) c.targets.push(z);
    }
    c.t = 0;
    c.done = false;
    this.rAct = 'cleave';
    this.cd.cleave = SUKUNA_CD.cleave;
    this.callout('捌', 'CLEAVE', 'hachi');
    G.audio?.play('cleave', { volume: 1 });
    // the web of cuts settles over every target
    for (const z of c.targets) {
      const cy = z.y + 0.9 * z.scale;
      for (let i = 0; i < 10; i++) {
        const f = _v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().clone();
        const ax = _v2.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).cross(f).normalize().clone();
        this.slashes.flash(
          { pos: _v3.set(z.x + rand(-0.25, 0.25), cy + rand(-0.6, 0.6) * z.scale, z.z + rand(-0.25, 0.25)), fwd: f, axis: ax, len: rand(1.4, 2.5) * z.scale, thick: 0.03, bulge: 0.02, color: [2.4, 0.35, 0.3] },
          0.26,
          i * 0.011,
        );
      }
    }
    if (!best) {
      // nothing in reach: the cut still tears the air in front of him
      const p = this.camPos(_v).addScaledVector(aim, 4);
      for (let i = 0; i < 6; i++) {
        const f = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
        const ax = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).cross(f).normalize();
        this.slashes.flash({ pos: p, fwd: f, axis: ax, len: rand(1.5, 2.6), thick: 0.03, bulge: 0.02, color: [2.4, 0.35, 0.3] }, 0.2, i * 0.012);
      }
    }
  }

  private updateCleave(dt: number) {
    const c = this.cleave;
    if (c.t < 0) return;
    c.t += dt;
    if (!c.done && c.t >= 0.12) {
      c.done = true;
      let first = true;
      for (const z of c.targets) {
        if (!z.alive) continue;
        const cx = z.x;
        const cy = z.y + 0.9 * z.scale;
        const cz = z.z;
        if (z.type.id === 'boss') {
          this.hurt(z, z.maxHp * 0.3, 'cleave');
          z.kickSpring(S.TorsoPitch, 6);
          this.bloodFan(cx, cy, cz, _v.set(1, 0, 0), _v2.set(0, 0, 1), 24);
          if (z.alive) continue;
        } else this.hurt(z, z.hp + 1, 'cleave');
        const rg = z.deathRagdoll as Ragdoll | null;
        if (rg) this.dice(rg, cx, cy, cz, 1);
        G.fx.gore(cx, cy, cz, 7, z.skin);
        this.bloodFan(cx, cy, cz, _v.set(1, 0, 0), _v2.set(0, 0, 1), 14);
        this.bloodFan(cx, cy, cz, _v.set(0, 0, 1), _v2.set(1, 0, 0), 14);
        G.fx.stains.blood(cx, cz, 1.3, 0.35);
        if (first) {
          first = false;
          G.audio?.play('slashFlesh', { x: cx, y: cy, z: cz, volume: 1.1 });
          G.audio?.play('gib', { x: cx, y: cy, z: cz, volume: 0.9 });
        }
      }
      if (c.targets.length) {
        G.player.addTrauma(0.15);
        G.renderer.post.aberration = Math.max(G.renderer.post.aberration, 0.6);
      }
    }
    if (c.t > 0.5) c.t = -1;
  }

  // ------------------------------------------------------------------ Fuga
  private startFuga() {
    const f = this.fuga;
    f.phase = 'charge';
    f.t = 0;
    f.said = false;
    this.rAct = 'fuga';
    this.rT = 0;
    G.audio?.play('fugaDraw', { volume: 1.1 });
  }

  private fugaHands(R: Hand, L: Hand) {
    const f = this.fuga;
    const t = f.t;
    if (f.phase !== 'charge') {
      // release: the drawing hand springs open, the bow hand follows through
      if (this.rT < 0.45) {
        R.set(0.17, -0.02, -0.24, -0.3, 0.25, -1, 0.5, 0.8, 0.2, 'open', 28, 34);
        L.set(-0.05, -0.08, -0.52, 0.12, 0.05, -1, -0.5, 1, 0, 'open', 20, 20);
      } else {
        this.rAct = 'idle';
        this.idle(R, L, this.time, 0);
      }
      return;
    }
    if (t < 0.32) {
      // fire kindles in the right palm
      R.set(0.05, -0.13, -0.36, -0.12, 0.25, -1, 0.05, -1, 0.2, 'open', 12, 14);
      L.set(-0.12, -0.16, -0.42, 0.2, 0.1, -1, -0.5, 1, 0, 'relax', 10, 10);
    } else {
      // drawn like a bow: the left fist forward, the right hand pulls the flame back to the cheek
      const k = easeInOutCubic((t - 0.32) / 0.42);
      R.set(lerp(0.05, 0.12, k), lerp(-0.13, -0.045, k), lerp(-0.36, -0.19, k), -0.25, 0.08, -1, 0.65, 0.75, 0.1, k > 0.4 ? 'pinch' : 'open', 14, 14);
      L.set(-0.06, -0.075, -0.5, 0.1, 0.06, -1, -0.6, 0.8, 0, 'fist', 12, 14);
      if (t > 0.75) R.shake = L.shake = 0.0016;
    }
  }

  private updateFuga(dt: number, vm: Viewmodel) {
    const f = this.fuga;
    const post = G.renderer.post;
    if (f.phase === 'off') {
      this.vmFire.group.visible = false;
      this.vmArrow.group.visible = false;
      this.arrow.group.visible = false;
      this.vmLight.intensity = damp(this.vmLight.intensity, 0, 12, dt);
      this.light.intensity = damp(this.light.intensity, 0, 10, dt);
      return;
    }
    f.t += dt;
    if (f.phase === 'charge') {
      const t = f.t;
      const game = G.game;
      if (game) game.timeScale = t >= 0.7 && t < 1.25 ? 0.5 : 1;
      const palm = this.rh.local(PALM_UP, _v);
      const pinch = this.rh.local(PINCH, _v2);
      // the bow hand's fist, a little ahead of it
      const bow = this.lh.local(_v3.set(0, 0.0, -0.11), new THREE.Vector3());
      if (t < 0.36) {
        this.vmFire.group.visible = true;
        this.vmFire.group.position.copy(palm);
        this.vmFire.radius = 0.009 * easeOutCubic(t / 0.25) * (1 + Math.random() * 0.25);
        this.vmFire.intensity = 0.85;
        this.vmArrow.group.visible = false;
      } else {
        // the flame stretches into an arrow between the hands
        this.vmFire.group.visible = false;
        const k = easeOutCubic(clamp((t - 0.36) / 0.3, 0, 1));
        this.vmTail.copy(pinch);
        this.vmHead.copy(pinch).lerp(bow, k);
        this.vmHead.addScaledVector(_d.subVectors(bow, pinch).normalize(), 0.09 * k);
        this.toVmWorld(this.vmTail, _n);
        this.toVmWorld(this.vmHead, _o);
        this.vmArrow.group.visible = true;
        this.vmArrow.aim(_n, _o);
        this.vmArrow.radius = 0.011 * (0.4 + 0.6 * k) * (1 + Math.sin(this.time * 41) * 0.08);
        this.vmArrow.intensity = 1.0 + (t > 0.75 ? 0.5 + Math.sin(this.time * 25) * 0.25 : 0);
        setLens(2, _o, 0.02, 0.6, G.vmCamera, 1, 0.03);
      }
      // embers and heat
      const src = this.toVmWorld(t < 0.36 ? palm : this.vmHead, new THREE.Vector3());
      if (Math.random() < 0.9) {
        this.vmStreaks.emit(src.x + rand(-0.01, 0.01), src.y, src.z + rand(-0.01, 0.01), rand(-0.05, 0.05), rand(0.06, 0.2), rand(-0.05, 0.05), rand(0.3, 0.6), 0.0012, 3, 1.2, 0.2, { drag: 1, stretch: 0.02 });
      }
      this.vmLight.position.copy(src);
      this.vmLight.intensity = 2.5 + Math.random();
      post.bloomBoost = Math.max(post.bloomBoost, 0.3 + smoothstep(0.4, 1.0, t) * 0.6);
      if (t >= 0.75 && !f.said) {
        f.said = true;
        this.callout('■「開」', 'FUGA', 'fuga', true);
        post.impact = 1.2;
        post.impactColor.setRGB(1.0, 0.45, 0.1);
        post.aberration = Math.max(post.aberration, 1.4);
        G.player.addTrauma(0.3);
      }
      if (t > 0.75) G.player.addTrauma(dt * 0.4);
      if (t >= 1.3) this.loose(vm);
      return;
    }
    // ---- in flight
    f.prev.copy(f.pos);
    f.pos.addScaledVector(f.vel, dt);
    f.dist += f.vel.length() * dt;
    const head = _v.copy(f.pos);
    const tail = _v2.copy(f.pos).addScaledVector(f.vel, -4.5 / f.vel.length());
    this.arrow.group.visible = true;
    this.arrow.aim(tail, head);
    this.arrow.radius = 0.42;
    this.arrow.intensity = 1.25;
    this.light.position.copy(f.pos);
    this.light.color.setHex(0xff7020);
    this.light.intensity = 70;
    setLens(2, f.pos, 0.6, 0.5, G.camera, 1, 1.2);
    for (let i = 0; i < 10; i++) {
      const w = Math.random();
      const x = lerp(f.prev.x, f.pos.x, w) - f.vel.x * 0.02;
      const y = lerp(f.prev.y, f.pos.y, w) - f.vel.y * 0.02;
      const z = lerp(f.prev.z, f.pos.z, w) - f.vel.z * 0.02;
      G.fx.fire.emit(x + rand(-0.2, 0.2), y + rand(-0.2, 0.2), z + rand(-0.2, 0.2), rand(-1, 1), rand(0, 1.5), rand(-1, 1), rand(0.3, 0.7), rand(0.5, 1.0), 0.1, 3.2, 1.4, 0.3, 1, 1.6, 0.25, 0.03, 0, 1.5, -0.3, rand(0, 6), rand(-2, 2));
    }
    if (Math.random() < 0.6) G.fx.smoke.emit(f.pos.x, f.pos.y, f.pos.z, rand(-0.3, 0.3), rand(0.4, 1.2), rand(-0.3, 0.3), rand(1.5, 3), 0.4, 1.8, 0.12, 0.1, 0.09, 0.5, 0.2, 0.18, 0.17, 0, 1, -0.04, rand(0, 6), rand(-0.4, 0.4));
    // hit something?
    let hit = f.pos.y < 0.3 || f.dist > 90 || this.shrine.touches(f.pos.x, f.pos.y, f.pos.z);
    if (!hit) {
      G.zombies.queryRadius(f.pos.x, f.pos.z, 2.5, this.qz);
      for (const z of this.qz) {
        if (!z.alive || z.state === 'down') continue;
        if (Math.hypot(z.x - f.pos.x, z.y + 0.9 * z.scale - f.pos.y, z.z - f.pos.z) < 1.2 * z.scale + 0.4) {
          hit = true;
          break;
        }
      }
    }
    if (hit) {
      f.phase = 'off';
      this.arrow.group.visible = false;
      this.fugaBlast(f.pos.x, Math.max(0.5, f.pos.y), f.pos.z, 1 + this.shrine.power * 0.9);
    }
  }

  /** Let the arrow go. */
  private loose(vm: Viewmodel) {
    const f = this.fuga;
    f.phase = 'fly';
    f.t = 0;
    f.dist = 0;
    this.rT = 0;
    this.cd.fuga = SUKUNA_CD.fuga;
    if (G.game) G.game.timeScale = 1;
    this.vmArrow.group.visible = false;
    this.toVmWorld(this.vmHead, _v);
    vm.toWorld(_v, f.pos);
    f.prev.copy(f.pos);
    const target = this.aimPoint(95, _v2);
    f.vel.subVectors(target, f.pos);
    if (f.vel.lengthSq() < 1) f.vel.copy(G.player.getAim(_d));
    f.vel.normalize().multiplyScalar(80);
    G.audio?.play('fugaFire', { volume: 1.1 });
    vm.recoilPos.kick(0, 0.015, 0.7);
    vm.recoilRot.kick(1.4, 0, 0.3);
    G.player.addRecoil(0.04, 0, 7);
    G.player.addTrauma(0.35);
    this.fovPunch = 0.08;
    const post = G.renderer.post;
    post.aberration = Math.max(post.aberration, 1.2);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(2, 7);
      G.fx.fire.emit(f.pos.x, f.pos.y, f.pos.z, Math.cos(a) * s + f.vel.x * 0.05, rand(-1, 3), Math.sin(a) * s + f.vel.z * 0.05, rand(0.2, 0.45), rand(0.3, 0.6), 0.05, 3.2, 1.5, 0.35, 1, 1.6, 0.25, 0.03, 0, 2.5, -0.2, rand(0, 6), rand(-3, 3));
    }
  }

  /** The firestorm. Inside the shrine it fills the whole domain. */
  private fugaBlast(x: number, y: number, z: number, power: number) {
    const R = 16 * power;
    // set everything alight first so the dead burn as they fall
    G.ragdolls.blast(x, y, z, R, 11 * Math.min(1.4, power));
    for (const rg of G.ragdolls.active as Ragdoll[]) {
      rg.center(F3);
      if (Math.hypot(F3[0] - x, F3[2] - z) < R) rg.fireT = Math.max(rg.fireT, rand(4, 7));
    }
    G.zombies.queryRadius(x, z, R + 1, this.qz);
    for (const zb of this.qz) {
      if (!zb.alive) continue;
      const dx = zb.x - x;
      const dz = zb.z - z;
      const d = Math.hypot(dx, (zb.y + 0.9 * zb.scale - y) * 0.6, dz);
      if (d > R) continue;
      const f = Math.pow(1 - d / R, 0.7);
      const l = Math.hypot(dx, dz) || 1;
      const nx = dx / l;
      const nz = dz / l;
      G.zombies.ignite(zb, 60, 7, 'fuga');
      const boss = zb.type.id === 'boss';
      const wasDown = zb.state === 'down';
      const dmg = boss ? f * (0.12 * zb.maxHp + 1000) : f * (1.5 * zb.maxHp + 300);
      if (!boss && !wasDown && dmg >= zb.hp && !this.room()) {
        this.mincedKill(zb, 'fuga', true);
        continue;
      }
      const killed = this.hurt(zb, dmg, 'fuga', 'fire');
      const sp = 5 + 14 * f;
      if (killed) {
        const rg = zb.deathRagdoll as Ragdoll | null;
        if (rg) {
          rg.fireT = Math.max(rg.fireT, rand(5, 8));
          for (const b of rg.bodies) if (b) b.applyImpulse({ x: nx * sp * b.mass(), y: (3 + 6 * f) * b.mass(), z: nz * sp * b.mass() }, true);
        }
      } else if (!boss && zb.type.knockResist < 0.9) {
        if (!wasDown) G.zombies.knockdown(zb, null);
        if (zb.ragdoll) for (const b of zb.ragdoll.bodies) if (b) b.applyImpulse({ x: nx * sp * 0.8 * b.mass(), y: (2 + 4 * f) * b.mass(), z: nz * sp * 0.8 * b.mass() }, true);
      }
    }
    // the ground keeps burning
    const patches = Math.round(9 * power);
    for (let i = 0; i < patches; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = R * Math.sqrt(Math.random()) * 0.75;
      G.fx.addFirePatch(x + Math.cos(a) * d, z + Math.sin(a) * d, rand(2.6, 4.5), rand(6, 10), 40, 'fuga');
    }
    this.fugaFx(x, y, z, R, power);
  }

  private fugaFx(x: number, y: number, z: number, R: number, power: number) {
    const post = G.renderer.post;
    const dist = this.camPos(_v).distanceTo(_v2.set(x, y, z));
    const near = clamp(1.25 - dist / (50 * power), 0, 1);
    post.flash = Math.max(post.flash, 0.45 * near);
    post.impact = Math.max(post.impact, 1.25 * near);
    post.impactColor.setRGB(1.0, 0.5, 0.12);
    post.aberration = Math.max(post.aberration, 1.8 * near + 0.4);
    post.bloomBoost = Math.max(post.bloomBoost, 1.6);
    G.player.addTrauma(0.3 + 0.7 * near);
    this.fovPunch = Math.max(this.fovPunch, 0.07 * near);
    this.wave.t = 0;
    this.wave.pos.set(x, y + 2, z);
    this.wave.range = 34 * power;
    this.wave.dur = 0.9;
    G.audio?.play('fugaBlast', { x, y, z, volume: 1.35 });
    G.fx.lights.flash(x, y + 3, z, 0xff7020, 420 * power, 70 * power, 1.3, 0.35);
    G.fx.flashes.emit(x, y + 1, z, 0, 0, 0, 0.3, 6 * power, 30 * power, 4, 2.6, 1.2, 1, 3, 0.8, 0.1, 0);
    this.pulses.shell(x, y, z, 1, R * 1.05, 0.8, 0xff6a10, 3.6);
    this.pulses.shell(x, y, z, 0.5, R * 0.55, 0.4, 0xffe0a0, 2.8);
    this.pulses.ring(x, z, 1, R * 1.7, 1.0, 0xff5010, 2.4, 0.05);
    const k = Math.min(2, power);
    // the fireball
    for (let i = 0; i < 520 * k; i++) {
      const u = Math.random() * 1.4 - 0.25;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const sp = rand(4, 22) * power;
      const w = Math.random();
      G.fx.fire.emit(
        x + rand(-0.5, 0.5), y + rand(0, 0.6), z + rand(-0.5, 0.5),
        Math.cos(a) * s * sp, Math.abs(u) * sp + rand(1, 5), Math.sin(a) * s * sp,
        rand(0.8, 2.2), rand(1.2, 3.4) * power, rand(0.3, 0.9),
        3.4, 1.8 + w, 0.5 + w * 0.5, 1, 1.6, 0.25, 0.03, 0, 1.6, -0.45, rand(0, 6), rand(-2, 2),
      );
    }
    // a towering column with a cap
    for (let i = 0; i < 180 * k; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 2.5 * power;
      G.fx.fire.emit(x + Math.cos(a) * r, y, z + Math.sin(a) * r, Math.cos(a) * 1.5, rand(10, 30) * Math.sqrt(power), Math.sin(a) * 1.5, rand(1.2, 2.4), rand(1.5, 3.2) * power, rand(0.6, 1.4), 3.2, 1.6, 0.4, 1, 1.4, 0.2, 0.03, 0, 1.2, -0.2, rand(0, 6), rand(-1, 1));
    }
    for (let i = 0; i < 90 * k; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(0, 6) * power;
      const sh = rand(0.06, 0.16);
      G.fx.smoke.emit(x + Math.cos(a) * r, y + rand(2, 10) * power, z + Math.sin(a) * r, Math.cos(a) * rand(1, 4), rand(3, 9), Math.sin(a) * rand(1, 4), rand(4, 8), rand(2, 4) * power, rand(6, 11) * power, sh, sh * 0.9, sh * 0.85, 0.85, sh * 1.5, sh * 1.45, sh * 1.4, 0, 0.8, -0.05, rand(0, 6), rand(-0.3, 0.3));
    }
    for (let i = 0; i < 220 * k; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(6, 26);
      G.fx.sparksP.emit(x, y + 1, z, Math.cos(a) * sp, rand(4, 18), Math.sin(a) * sp, rand(0.8, 2.2), 0.05, 0.015, 4, 1.4, 0.3, 1, 1.6, 0.25, 0.05, 1, 0.5, 1);
    }
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const sp = rand(10, 18) * power;
      G.fx.dust.emit(x, 0.3, z, Math.cos(a) * sp, rand(0.3, 1.2), Math.sin(a) * sp, rand(1.2, 2.2), 1, 4.5, 0.32, 0.22, 0.16, 0.6, 0.32, 0.22, 0.16, 0, 2.8, -0.02, rand(0, 6), 0);
    }
    if (y < 4) {
      G.fx.stains.scorch(x, z, R * 0.55);
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(5, 18);
        const c = rand(0.1, 0.22);
        G.fx.chips.emit(x, 0.2, z, Math.cos(a) * sp, rand(4, 14), Math.sin(a) * sp, rand(1, 2), rand(0.05, 0.12), 0.05, c, c * 0.8, c * 0.7, 1, c, c * 0.8, c * 0.7, 1, 0.3, 1, rand(0, 6), rand(-10, 10));
      }
    }
  }

  private updateWave(dt: number) {
    const w = this.wave;
    if (w.t < 0) return;
    w.t += dt;
    const k = w.t / w.dur;
    if (k >= 1) {
      w.t = -1;
      return;
    }
    setLens(3, w.pos, 2.2, 1.2 * (1 - k), G.camera, 1, 0.8 + w.range * easeOutCubic(k));
  }

  // ------------------------------------------------------------------ Malevolent Shrine
  private startShrine() {
    if (!this.shrine.begin()) return;
    this.rAct = 'shrine';
    this.rT = 0;
    this.callout('領域展開', 'DOMAIN EXPANSION', 'shrine', true);
    G.audio?.play('blueStart', { volume: 0.6, pitch: 0.4 });
    const post = G.renderer.post;
    post.bloomBoost = Math.max(post.bloomBoost, 0.4);
    post.aberration = Math.max(post.aberration, 0.5);
  }

  /** Inside the shrine everything is cut, again and again, until there is nothing left to cut. */
  private updateShrine(dt: number) {
    const sh = this.shrine;
    if (sh.phase !== 'inside' && sh.phase !== 'rise') return;
    const c = sh.center;
    const R = sh.R;
    const cam = this.camPos(_o);
    // the living
    G.zombies.queryRadius(c.x, c.z, R, this.qz);
    for (const z of this.qz) {
      if (!z.alive || z.state === 'down' || !sh.contains(z.x, z.z)) continue;
      let next = this.zCut.get(z.id);
      if (next === undefined) next = rand(0, 0.3);
      next -= dt;
      if (next <= 0) {
        next = rand(0.18, 0.45);
        const theta = rand(-1.2, 1.2);
        const fwd = _v2.set(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).normalize().clone();
        const axis = _v3.set(Math.cos(theta), Math.sin(theta), 0).cross(fwd).cross(fwd).normalize().negate().clone();
        this.cutZombie(z, rand(0.15, 0.95), axis, fwd, theta, 'shrine', 0.035, Math.random() < 0.3);
      }
      this.zCut.set(z.id, next);
    }
    // the fallen are cut into smaller and smaller pieces
    let minced = 0;
    for (const rg of [...(G.ragdolls.active as Ragdoll[])]) {
      rg.center(F3);
      if (!sh.contains(F3[0], F3[2]) || rg.zombie) continue;
      let next = this.rCut.get(rg);
      if (next === undefined) next = rand(0.1, 0.4);
      next -= dt;
      if (next <= 0) {
        next = rand(0.25, 0.6);
        const joints: number[] = [];
        for (let i = 1; i < PART_COUNT; i++) if (rg.joints[i]) joints.push(i);
        if (joints.length) {
          const p = joints[Math.floor(Math.random() * joints.length)];
          const b = rg.bodies[p];
          G.ragdolls.sever(rg, p, false);
          if (b) {
            const t = b.translation();
            const f = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize();
            const ax = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).cross(f).normalize();
            this.slashes.flash({ pos: new THREE.Vector3(t.x, t.y, t.z), fwd: f, axis: ax, len: 1.2, thick: 0.03, bulge: 0.03, color: [2.2, 0.4, 0.3] }, 0.12);
            this.bloodFan(t.x, t.y, t.z, ax, f, 5);
            b.applyImpulse({ x: f.x * b.mass() * 2, y: b.mass() * 2, z: f.z * b.mass() * 2 }, true);
          }
        } else if (rg.age > 1.2 && minced < 3) {
          // nothing left to sever: minced
          minced++;
          G.fx.gore(F3[0], F3[1], F3[2], 4, rg.skin);
          this.bloodFan(F3[0], F3[1], F3[2], _v.set(1, 0, 0), _v2.set(0, 0, 1), 8);
          this.rCut.delete(rg);
          G.ragdolls.destroy(rg);
          continue;
        }
      }
      this.rCut.set(rg, next);
    }
    // corpses on the road
    this.mince += dt * 10;
    if (this.mince >= 1) {
      G.ragdolls.corpsesNear(cam.x, cam.z, 40, this.qc);
      while (this.mince >= 1 && this.qc.length) {
        this.mince -= 1;
        const i = Math.floor(Math.random() * this.qc.length);
        const cp = this.qc[i];
        this.qc.splice(i, 1);
        if (!sh.contains(cp.x, cp.z)) continue;
        G.fx.gore(cp.x, 0.4, cp.z, 3, cp.skin);
        const f = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize();
        const ax = new THREE.Vector3(rand(-1, 1), 0.3, rand(-1, 1)).cross(f).normalize();
        this.slashes.flash({ pos: new THREE.Vector3(cp.x, 0.4, cp.z), fwd: f, axis: ax, len: 1.6, thick: 0.03, bulge: 0.03, color: [2.2, 0.4, 0.3] }, 0.14);
        G.ragdolls.removeCorpse(cp);
      }
      this.mince = Math.min(this.mince, 1);
    }
    // the air itself is full of cuts
    this.ambient += dt * (sh.phase === 'inside' ? 110 : 35);
    const fwd = G.player.getAim(_d);
    while (this.ambient >= 1) {
      this.ambient -= 1;
      // mostly where he is looking, a few anywhere
      const a = Math.atan2(fwd.x, fwd.z) + rand(-1.1, 1.1) * (Math.random() < 0.8 ? 1 : 3);
      const d = rand(4, 38);
      const p = new THREE.Vector3(cam.x + Math.sin(a) * d, rand(0.2, 7), cam.z + Math.cos(a) * d);
      if (!sh.contains(p.x, p.z)) continue;
      const f = new THREE.Vector3(rand(-1, 1), rand(-0.4, 0.4), rand(-1, 1)).normalize();
      const ax = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).cross(f).normalize();
      this.slashes.flash({ pos: p, fwd: f, axis: ax, len: rand(2.5, 11), thick: 0.05, bulge: rand(0.05, 0.16), color: [1.9, 0.24, 0.18] }, rand(0.1, 0.22));
      if (Math.random() < 0.25) {
        // the ground under it is cut too, and spits up debris
        const ga = Math.random() * Math.PI * 2;
        const gl = rand(1.5, 6);
        const gx = p.x + Math.cos(ga) * gl * 0.5;
        const gz = p.z + Math.sin(ga) * gl * 0.5;
        this.cuts.add(p.x, p.z, p.x + Math.cos(ga) * gl, p.z + Math.sin(ga) * gl, rand(0.08, 0.18));
        for (let i = 0; i < 4; i++) {
          const c = rand(0.1, 0.2);
          G.fx.chips.emit(gx, 0.05, gz, rand(-2, 2), rand(2, 6), rand(-2, 2), rand(0.6, 1.2), rand(0.03, 0.08), 0.03, c, c * 0.6, c * 0.55, 1, c, c * 0.6, c * 0.55, 1, 0.3, 1, rand(0, 6), rand(-10, 10));
        }
      }
    }
    if (Math.random() < dt * 5) G.audio?.play('dismantle', { volume: 0.35, pitchVar: 0.2 });
  }
}
