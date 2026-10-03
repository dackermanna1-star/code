// Mochi: a soft lilac creature who sits at the table, watches you cook and eats ANYTHING.

import * as THREE from 'three';
import type { Game } from '../game/Game';
import type { FoodItem } from '../game/FoodItem';
import { Face, type FaceTargets } from './Face';
import { Spring } from '../game/anim';
import { LAYOUT } from '../world/layout';
import { smoothProfile, latheGeometry, profileRadiusAt, sweepGeometry, curveThrough, canvasTexture, bumpNoiseTexture, type Profile } from '../models/kit';
import { analyzeMeal, type MealAnalysis } from '../recipes';
import { isLiquid } from '../food/process';
import type { ViewName } from '../game/CameraRig';
import type { VoicePhrase, SfxName } from '../audio';

const LILAC = '#b9a6f2';
const LILAC_DARK = '#9d88e0';
const CREAM = '#fff0e4';
const PINK = '#ffb3c7';

const BODY_H = 0.8;
const TMP_C = new THREE.Color();
const TINT_RED = new THREE.Color('#ff8f80');
const TINT_GREEN = new THREE.Color('#a8e08a');
const TINT_BLUE = new THREE.Color('#a8d4ff');
const TINT_SOOT = new THREE.Color('#8a8088');
const EAR_BASE = new THREE.Color(LILAC);
const BODY_PROFILE: Profile = smoothProfile(
  [
    [0.0001, 0.0],
    [0.17, 0.006],
    [0.255, 0.045],
    [0.29, 0.13],
    [0.3, 0.23],
    [0.295, 0.33],
    [0.282, 0.44],
    [0.258, 0.56],
    [0.215, 0.665],
    [0.15, 0.748],
    [0.07, 0.792],
    [0.0001, 0.8],
  ],
  48,
);
const Z_SCALE = 0.82;
const FACE_Y0 = 0.37, FACE_Y1 = 0.745, FACE_PHI = 1.15;
const MOUTH_Y = FACE_Y0 + (1 - 0.74) * (FACE_Y1 - FACE_Y0);
const EYE_Y = FACE_Y0 + (1 - 0.44) * (FACE_Y1 - FACE_Y0);

type Mood = 'idle' | 'eating' | 'reacting';

export class Character {
  readonly root = new THREE.Group();
  /** Pivot at the bottom of the body; all body motion happens here. */
  private readonly body = new THREE.Group();
  private readonly face = new Face();
  private readonly earL = new THREE.Group();
  private readonly earR = new THREE.Group();
  private readonly tuft = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly belly: THREE.Mesh;
  private readonly bodyMat: THREE.MeshPhysicalMaterial;
  private readonly earMat: THREE.MeshPhysicalMaterial;
  readonly pickMeshes: THREE.Object3D[] = [];
  readonly zone: THREE.Mesh;
  private baseYaw = LAYOUT.character.yaw;

  // body springs
  private lean = new Spring(0, 140, 14);
  private tilt = new Spring(0, 140, 12);
  private turn = new Spring(0, 90, 13);
  private hop = new Spring(0, 220, 13);
  private squash = new Spring(1, 300, 12);
  private shake = 0;
  private shakeAmp = 0;
  private earFlop = new Spring(0, 120, 7);
  private earSpread = new Spring(0, 120, 9);
  private tuftSway = new Spring(0, 70, 4);
  private fullness = 0;
  private bellyS = new Spring(1, 60, 9);

  // arms: target directions in body space
  private armTargetL = new THREE.Vector3(0, -0.25, 1).normalize();
  private armTargetR = new THREE.Vector3(0, -0.25, 1).normalize();
  private armWaveL = 0;
  private armWaveR = 0;
  private shoulderL = new THREE.Vector3(-0.255, 0.335, 0.05);
  private shoulderR = new THREE.Vector3(0.255, 0.335, 0.05);

  // attention
  private lookAtPoint: THREE.Vector3 | null = null;
  private watched: FoodItem | null = null;
  private focus: { p: THREE.Vector3; until: number } | null = null;
  private wanderPoint = new THREE.Vector3();
  private wanderT = 0;
  mood: Mood = 'idle';
  private eatingItem: FoodItem | null = null;
  private anticipating: FoodItem | null = null;
  private lastNotice = new Map<string, number>();
  private idleT = 0;
  private hummed = 0;
  private talkT = 0;
  private talkAmp = 0;
  private chewT = 0;
  private chewAmp = 0;
  private queue: FoodItem[] = [];
  private greeted = false;

  constructor(private game: Game) {
    this.root.name = 'mochi';
    this.root.add(this.body);
    const fuzz = bumpNoiseTexture('mochi-fuzz', 60, 256, true);
    // ---- body
    const bodyGeo = latheGeometry(BODY_PROFILE, 72);
    paintBody(bodyGeo);
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.82, sheen: 1, sheenColor: new THREE.Color('#efe6ff'), sheenRoughness: 0.45, bumpMap: fuzz, bumpScale: 0.6 });
    this.bodyMat = bodyMat;
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.scale.z = Z_SCALE;
    bodyMesh.castShadow = bodyMesh.receiveShadow = true;
    this.body.add(bodyMesh);
    this.belly = bodyMesh;
    // ---- face shell
    const faceProfile: Profile = [];
    for (let i = 0; i <= 18; i++) {
      const y = FACE_Y0 + (i / 18) * (FACE_Y1 - FACE_Y0);
      faceProfile.push([profileRadiusAt(BODY_PROFILE, y) * 1.004, y]);
    }
    const faceGeo = new THREE.LatheGeometry(
      faceProfile.map(([r, y]) => new THREE.Vector2(r, y)),
      48,
      -FACE_PHI,
      FACE_PHI * 2,
    );
    const faceMat = new THREE.MeshStandardMaterial({ map: this.face.texture, transparent: true, roughness: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const faceMesh = new THREE.Mesh(faceGeo, faceMat);
    faceMesh.scale.z = Z_SCALE;
    faceMesh.renderOrder = 2;
    this.body.add(faceMesh);
    // ---- ears
    const earGeo = new THREE.SphereGeometry(0.085, 28, 18);
    earGeo.scale(1, 1.15, 0.55);
    const earMat = new THREE.MeshPhysicalMaterial({ color: LILAC, roughness: 0.8, sheen: 1, sheenColor: new THREE.Color('#efe6ff'), bumpMap: fuzz, bumpScale: 0.5 });
    this.earMat = earMat;
    const innerGeo = new THREE.SphereGeometry(0.06, 24, 14);
    innerGeo.scale(1, 1.1, 0.35);
    const innerMat = new THREE.MeshStandardMaterial({ color: PINK, roughness: 0.6 });
    for (const [ear, side] of [[this.earL, -1], [this.earR, 1]] as [THREE.Group, number][]) {
      const m = new THREE.Mesh(earGeo, earMat);
      m.position.y = 0.075;
      m.castShadow = true;
      const inner = new THREE.Mesh(innerGeo, innerMat);
      inner.position.set(0, 0.075, 0.03);
      ear.add(m, inner);
      ear.position.set(side * 0.15, 0.7, -0.01);
      ear.rotation.z = -side * 0.45;
      this.body.add(ear);
    }
    // ---- tuft (a little curl on top)
    const curl = curveThrough([
      [0, 0, 0],
      [0.01, 0.05, 0.01],
      [0.04, 0.085, 0.0],
      [0.065, 0.07, 0],
      [0.06, 0.045, 0],
      [0.042, 0.05, 0],
    ]);
    const tuftGeo = sweepGeometry(curl, { radius: (t) => 0.018 * (1 - t * 0.65), radialSegments: 12, tubularSegments: 40 });
    const tuftMesh = new THREE.Mesh(tuftGeo, earMat);
    tuftMesh.castShadow = true;
    this.tuft.add(tuftMesh);
    this.tuft.position.set(0, BODY_H - 0.012, 0.01);
    this.body.add(this.tuft);
    // ---- arms
    const armGeo = new THREE.CapsuleGeometry(0.045, 0.12, 8, 16);
    armGeo.translate(0, -0.08, 0);
    const pawGeo = new THREE.SphereGeometry(0.058, 24, 16);
    const pawMat = new THREE.MeshPhysicalMaterial({ color: CREAM, roughness: 0.75, sheen: 0.8, sheenColor: new THREE.Color('#ffffff') });
    for (const [arm, shoulder] of [[this.armL, this.shoulderL], [this.armR, this.shoulderR]] as [THREE.Group, THREE.Vector3][]) {
      const a = new THREE.Mesh(armGeo, earMat);
      a.castShadow = true;
      const paw = new THREE.Mesh(pawGeo, pawMat);
      paw.position.y = -0.19;
      paw.scale.set(1, 0.9, 1.05);
      paw.castShadow = true;
      arm.add(a, paw);
      arm.position.copy(shoulder);
      this.body.add(arm);
    }
    // ---- bib
    this.body.add(makeBib());

    this.root.traverse((o) => {
      o.userData.character = true;
      if ((o as THREE.Mesh).isMesh) this.pickMeshes.push(o);
    });

    // placement: behind the table edge, on the chair
    const tableBack = LAYOUT.table.pos.z - LAYOUT.table.radius;
    const frontAtTable = profileRadiusAt(BODY_PROFILE, LAYOUT.table.topY - LAYOUT.character.pos.y) * Z_SCALE;
    this.root.position.set(LAYOUT.character.pos.x, LAYOUT.character.pos.y, Math.min(LAYOUT.character.pos.z, tableBack - frontAtTable - 0.012));
    this.root.rotation.y = this.baseYaw;

    // drop / tap zone around the head
    this.zone = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), new THREE.MeshBasicMaterial());
    (this.zone.material as THREE.Material).visible = false;
    this.zone.userData.character = true;
    game.scene.add(this.zone);
    this.wanderPoint.set(0, 1, 2);
  }

  // ------------------------------------------------------------------------------------------
  // Geometry helpers

  private localToWorld(p: THREE.Vector3): THREE.Vector3 {
    this.body.updateMatrixWorld(true);
    return this.body.localToWorld(p.clone());
  }

  mouthWorld(): THREE.Vector3 {
    const r = profileRadiusAt(BODY_PROFILE, MOUTH_Y) * Z_SCALE;
    return this.localToWorld(new THREE.Vector3(0, MOUTH_Y, r));
  }

  private headWorld(): THREE.Vector3 {
    return this.localToWorld(new THREE.Vector3(0, EYE_Y, 0.05));
  }

  private forwardWorld(): THREE.Vector3 {
    this.body.updateMatrixWorld(true);
    return new THREE.Vector3(0, 0, 1).transformDirection(this.body.matrixWorld);
  }

  // ------------------------------------------------------------------------------------------
  // Attention

  watch(item: FoodItem | null) {
    this.watched = item;
    if (item && this.mood === 'idle') {
      this.face.set({ eyeWide: 0.25, mouthSmile: 0.6 });
    } else if (!item && this.mood === 'idle') this.face.set({ eyeWide: 0, mouthSmile: 0.45, mouthOpen: 0 });
  }

  busyWith(item: FoodItem): boolean {
    return this.eatingItem === item;
  }

  /** Food is being dangled in front of Mochi. */
  anticipate(item: FoodItem | null) {
    if (this.mood !== 'idle') return;
    if (item === this.anticipating) return;
    this.anticipating = item;
    if (item) {
      let a: MealAnalysis | null = null;
      try {
        a = analyzeMeal(item.state);
      } catch {
        a = null;
      }
      const bad = a && (a.reaction === 'gross' || a.reaction === 'burnt' || a.taste < -0.3);
      if (bad) {
        this.face.set({ mouthOpen: 0, mouthSmile: -0.4, mouthPucker: 0.6, squint: 0.5, browAngle: 0.6, eyeWide: 0 });
        this.lean.target = -0.12;
        this.armTargetL.set(-0.3, 0.6, 1).normalize();
        this.armTargetR.set(0.3, 0.6, 1).normalize();
        this.say('uh-oh');
      } else {
        this.face.set({ mouthOpen: 0.95, mouthSmile: 0.7, mouthWide: 1.25, eyeWide: 0.5, sparkle: 0.6, browY: 0.5, squint: 0, mouthPucker: 0 });
        this.lean.target = 0.14;
        this.say('aah', 1.1);
      }
    } else {
      this.face.set({ mouthOpen: 0, mouthSmile: 0.45, mouthWide: 1, mouthPucker: 0, eyeWide: 0, sparkle: 0, browY: 0, squint: 0, browAngle: 0 });
      this.lean.target = 0;
      this.restArms();
    }
  }

  private restArms() {
    this.armTargetL.set(-0.05, -0.25, 1).normalize();
    this.armTargetR.set(0.05, -0.25, 1).normalize();
    this.armWaveL = this.armWaveR = 0;
  }

  /** Something happened in the kitchen: react a little. */
  notice(kind: string, at: THREE.Vector3) {
    if (this.mood !== 'idle') return;
    const now = this.game.time;
    const last = this.lastNotice.get(kind) ?? -99;
    const cooldown: Record<string, number> = { cut: 2.5, burning: 6, combine: 3, plate: 2, season: 4, 'poke-food': 1.5, 'empty-plate': 2 };
    if (now - last < (cooldown[kind] ?? 3)) {
      this.focus = { p: at.clone(), until: now + 1.2 };
      return;
    }
    this.lastNotice.set(kind, now);
    this.focus = { p: at.clone(), until: now + 2.2 };
    switch (kind) {
      case 'cut':
        this.squash.kick(-1.5);
        if (Math.random() < 0.35) this.say('ooh');
        break;
      case 'burning':
        this.flash({ browAngle: 0.8, mouthSmile: -0.5, mouthOpen: 0.3, eyeWide: 0.6 }, 2);
        this.say('uh-oh');
        this.sweatBurst(3);
        break;
      case 'combine':
        this.hop.kick(1.6);
        this.flash({ eyeHappy: 1, mouthOpen: 0.5, mouthSmile: 1 }, 1.2);
        this.say(Math.random() < 0.5 ? 'ooh' : 'wow');
        break;
      case 'plate':
        this.flash({ eyeWide: 0.5, sparkle: 1, mouthOpen: 0.4, mouthSmile: 0.9, tongue: 0.5 }, 1.6);
        this.hop.kick(1.2);
        this.clap();
        this.say('mmm');
        break;
      case 'poke-food':
        this.say('hehe');
        break;
      case 'empty-plate':
        this.flash({ browAngle: 0.5, mouthSmile: -0.1, browY: 0.4 }, 1.5);
        this.shrug();
        this.say('hmm');
        break;
      case 'season':
        if (Math.random() < 0.4) this.say('ooh');
        break;
      default:
        break;
    }
  }

  /** Tapping Mochi: eat what's on the plate, or giggle. */
  tap() {
    const plate = this.game.stations.plate;
    if (this.mood === 'idle' && plate.contents.length) {
      plate.serve();
      return;
    }
    if (this.mood !== 'idle') return;
    this.hop.kick(2);
    this.squash.kick(-3);
    this.flash({ eyeHappy: 1, mouthOpen: 0.6, mouthSmile: 1, blush: 0.9 }, 1.1);
    this.say(Math.random() < 0.5 ? 'giggle' : 'hehe');
    this.earFlop.kick(4);
    this.tuftSway.kick(6);
    this.game.fx.hearts(this.headWorld().add(new THREE.Vector3(0, 0.3, 0)), 2);
  }

  onViewChange(view: ViewName) {
    if (view === 'plate' || view === 'table') {
      if (this.mood === 'idle' && Math.random() < 0.6) {
        this.armWaveR = 1;
        setTimeout(() => (this.armWaveR = 0), 1200);
        this.say('hi');
      }
    }
  }

  /** First appearance: wave hello. */
  greet() {
    if (this.greeted) return;
    this.greeted = true;
    this.armWaveR = 1;
    this.say('hi');
    this.flash({ eyeHappy: 1, mouthOpen: 0.6, mouthSmile: 1 }, 1.5);
    setTimeout(() => (this.armWaveR = 0), 1600);
  }

  // ------------------------------------------------------------------------------------------
  // Small helpers

  private say(p: VoicePhrase | 'aah' | 'hi' | 'ooh', pitch = 1) {
    const phrase = p as VoicePhrase;
    this.game.audio.voice(phrase, { pitch });
    this.talkT = 0.45;
  }

  private sfx(n: SfxName, volume = 1, pitch = 1) {
    this.game.audio.play(n, { volume, pitch });
  }

  /** Temporarily layer an expression on top of the base. */
  private flash(t: FaceTargets, seconds: number) {
    const prev: FaceTargets = {};
    for (const k of Object.keys(t) as (keyof FaceTargets)[]) prev[k] = this.face.base[k];
    this.face.set(t);
    const mood = this.mood;
    setTimeout(() => {
      if (this.mood === mood) this.face.set(prev);
    }, seconds * 1000);
  }

  private wait(s: number) {
    return this.game.anim.wait(s);
  }

  private clap() {
    let n = 0;
    const tick = () => {
      if (n++ >= 3 || this.mood !== 'idle') {
        this.restArms();
        return;
      }
      const t = n % 2 ? 0.1 : 0.3;
      this.armTargetL.set(t, 0.3, 1).normalize();
      this.armTargetR.set(-t, 0.3, 1).normalize();
      if (n % 2) this.sfx('tap', 0.5, 1.6);
      setTimeout(tick, 140);
    };
    tick();
  }

  private shrug() {
    this.armTargetL.set(-1, 0.4, 0.4).normalize();
    this.armTargetR.set(1, 0.4, 0.4).normalize();
    this.tilt.kick(1);
    setTimeout(() => this.restArms(), 900);
  }

  private sweatBurst(n: number) {
    for (let i = 0; i < n; i++) setTimeout(() => this.game.fx.sweat(this.localToWorld(new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * 0.2, 0.68, 0.12))), i * 220);
  }

  // ------------------------------------------------------------------------------------------
  // Eating

  /** Eat an item (from the plate, or dropped straight onto Mochi). */
  feed(item: FoodItem) {
    if (this.mood !== 'idle') {
      // busy: put it on the plate for later
      const plate = this.game.stations.plate;
      if (!plate.contents.length) {
        plate.receive(item);
        item.flyTo(plate.restPose(item).pos, { onLand: () => item.settle(plate.restPose(item)) });
      } else this.queue.push(item);
      return;
    }
    void this.eat(item);
  }

  private holdPoint(): THREE.Vector3 {
    const m = this.mouthWorld();
    const f = this.forwardWorld();
    return m.addScaledVector(f, 0.15).add(new THREE.Vector3(0, -0.06, 0));
  }

  private async eat(item: FoodItem) {
    const g = this.game;
    this.mood = 'eating';
    this.eatingItem = item;
    this.anticipating = null;
    item.holder?.release(item);
    let a: MealAnalysis;
    try {
      a = analyzeMeal(item.state);
    } catch (e) {
      console.warn('analyzeMeal failed', e);
      a = fallbackAnalysis(item);
    }
    g.ui.mealBanner(a, item);
    // pick it up
    const from = item.position.clone();
    item.mode = 'held';
    const liquid = safe(() => isLiquid(item.state), false) || a.eatStyle === 'gulp' || a.eatStyle === 'slurp';
    const size = Math.max(0.05, item.visual.radius * 2);
    const fit = Math.min(1, 0.2 / size);
    await g.anim.run(0.55, (k) => {
      const p = new THREE.Vector3().lerpVectors(from, this.holdPoint(), k);
      p.y += Math.sin(k * Math.PI) * 0.08;
      item.snapTo(p);
    });
    this.holdArms(true);
    this.lookAtPoint = item.position;
    // first impression
    if (a.inspect) await this.inspect(a);
    else {
      this.face.set({ eyeWide: 0.45, sparkle: a.taste > 0.3 ? 0.9 : 0.2, mouthSmile: 0.8, mouthOpen: 0.25 });
      this.say(a.taste > 0.3 ? 'ooh' : 'hmm');
      await this.wait(0.5);
    }
    if (a.blowFirst) await this.blow(item);
    if (liquid) await this.drink(item, a);
    else {
      const bites = Math.max(1, Math.min(5, a.bites || 3));
      for (let i = 0; i < bites; i++) await this.bite(item, i, bites, a);
    }
    this.holdArms(false);
    this.lookAtPoint = null;
    this.eatingItem = null;
    const eaten = JSON.parse(JSON.stringify(item.state));
    g.items.remove(item);
    void fit;
    // digest & react
    this.fullness = Math.min(2, this.fullness + 0.35 + size * 1.2);
    this.mood = 'reacting';
    await this.react(a);
    g.onMealEaten(a, eaten);
    if (this.fullness > 1.4) await this.burp();
    this.face.reset();
    this.restArms();
    this.lean.target = 0;
    this.mood = 'idle';
    const next = this.queue.shift();
    if (next) setTimeout(() => this.feed(next), 400);
  }

  private holdArms(on: boolean) {
    if (on) {
      const hp = this.body.worldToLocal(this.holdPoint());
      this.armTargetL.copy(hp).sub(this.shoulderL).add(new THREE.Vector3(0.04, 0, 0)).normalize();
      this.armTargetR.copy(hp).sub(this.shoulderR).add(new THREE.Vector3(-0.04, 0, 0)).normalize();
      this.lean.target = 0.08;
    } else this.restArms();
  }

  private async inspect(a: MealAnalysis) {
    this.face.set({ squint: 0.55, browAngle: -0.2, browTilt: 0.8, mouthSmile: -0.1, mouthOpen: 0, eyeWide: 0, sparkle: 0 });
    this.lean.target = 0.22;
    await this.wait(0.35);
    for (let i = 0; i < 2; i++) {
      this.sfx('sniff', 0.8, 1 + i * 0.1);
      this.squash.kick(1.2);
      await this.wait(0.32);
    }
    this.tilt.target = 0.18;
    this.say(a.taste > 0 ? 'hmm' : 'huh');
    await this.wait(0.6);
    this.tilt.target = 0;
    this.lean.target = 0.08;
    this.face.set({ squint: 0, browTilt: 0, browAngle: 0 });
  }

  private async blow(item: FoodItem) {
    this.face.set({ mouthPucker: 1, mouthOpen: 0.15, eyeOpen: 0.7 });
    for (let i = 0; i < 2; i++) {
      this.sfx('whoosh', 0.5, 1.4);
      this.lean.kick(-0.5);
      const m = this.mouthWorld();
      const dir = this.forwardWorld();
      for (let k = 0; k < 4; k++)
        this.game.fx.particles.emit({ pos: m.clone().addScaledVector(dir, 0.03), vel: dir.clone().multiplyScalar(0.5).add(new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.05, 0)), drag: 2, life: 0.6, size: 0.02, sizeEnd: 0.07, color: '#ffffff', alpha: 0.5, sprite: 0 });
      item.state.cook.temp = Math.max(0, item.state.cook.temp - 0.3);
      await this.wait(0.45);
    }
    this.face.set({ mouthPucker: 0, eyeOpen: 1 });
  }

  private biteCenter(item: FoodItem, k: number, n: number): { c: THREE.Vector3; r: number } {
    const b = item.visual.bounds;
    const size = b.getSize(new THREE.Vector3());
    const center = b.getCenter(new THREE.Vector3());
    item.root.updateMatrixWorld(true);
    const mouthLocal = item.root.worldToLocal(this.mouthWorld());
    const dir = mouthLocal.sub(center);
    dir.y *= 0.3;
    dir.normalize();
    const reach = Math.max(size.x, size.z) * 0.5;
    const depth = (k / n) * reach * 1.6;
    const c = center.clone().addScaledVector(dir, reach * 0.95 - depth);
    c.y = b.min.y + size.y * 0.55;
    const r = Math.max(size.x, size.y, size.z) * (k === n - 1 ? 0.9 : 0.34 + k * 0.08);
    return { c, r };
  }

  private async bite(item: FoodItem, k: number, n: number, a: MealAnalysis) {
    const g = this.game;
    // open wide, lunge, chomp
    this.face.set({ mouthOpen: 1.1, mouthWide: 1.3, mouthSmile: 0.5, eyeWide: 0.3, teeth: 0, eyeHappy: 0 });
    this.lean.target = 0.24;
    await this.wait(0.22);
    // food moves into the mouth a little
    const hold = this.holdPoint();
    const toward = this.mouthWorld().lerp(hold, 0.45);
    item.snapTo(toward);
    this.face.set({ mouthOpen: 0, mouthWide: 1 });
    this.squash.kick(-2.4);
    this.lean.kick(0.8);
    const { c, r } = this.biteCenter(item, k, n);
    item.visual.addBite(c, r);
    const flesh = item.state.id === 'assembly' ? '#e8c890' : safe(() => (g as Game).ui.colorOf(item.state.id), '#e8c890');
    const crunchy = a.eatStyle === 'crunch' || a.flags.crunchy;
    this.sfx(crunchy ? 'crunch' : 'chomp', 0.9, 0.9 + Math.random() * 0.2);
    g.fx.crumbs(this.mouthWorld().addScaledVector(this.forwardWorld(), 0.05), flesh, crunchy ? 7 : 4, LAYOUT.table.topY, 0.004);
    if (k === n - 1) item.root.visible = false;
    await this.wait(0.12);
    item.snapTo(hold);
    // chew
    this.lean.target = 0.06;
    this.chewAmp = 1;
    const chews = k === n - 1 ? 4 : 2;
    for (let i = 0; i < chews; i++) {
      this.sfx(crunchy ? 'crunch' : 'chew', 0.55, 0.9 + Math.random() * 0.3);
      if (a.taste > 0.4 && i === 1) this.face.set({ eyeHappy: 1 });
      await this.wait(0.24);
    }
    this.chewAmp = 0;
    if (k === n - 1) {
      this.sfx('gulp', 0.8);
      this.squash.kick(2);
      await this.wait(0.25);
    }
  }

  private async drink(item: FoodItem, a: MealAnalysis) {
    const g = this.game;
    const slurp = a.eatStyle === 'slurp';
    this.face.set({ mouthPucker: 0.9, mouthOpen: 0.2, eyeHappy: 0.6 });
    const hold = this.holdPoint();
    item.snapTo(this.mouthWorld().lerp(hold, 0.35).add(new THREE.Vector3(0, -0.04, 0)));
    for (let i = 0; i < 3; i++) {
      this.sfx(slurp ? 'slurp' : 'gulp', 0.8, 0.9 + i * 0.08);
      this.squash.kick(1.5);
      await this.wait(0.5);
      item.root.scale.multiplyScalar(0.82);
    }
    g.fx.sparkle(item.position, 6);
    item.root.visible = false;
    this.face.set({ mouthPucker: 0, mouthOpen: 0.3, eyeHappy: 0 });
    this.sfx('pop', 0.6);
    await this.wait(0.2);
  }

  private async burp() {
    this.face.set({ mouthOpen: 0.7, mouthPucker: 0.4, eyeOpen: 0.6, blush: 0.9 });
    this.squash.kick(3);
    this.sfx('burp');
    this.game.fx.poof(this.mouthWorld().addScaledVector(this.forwardWorld(), 0.06), '#f4f0ff', 0.5);
    await this.wait(0.7);
    this.face.set({ mouthOpen: 0.4, mouthPucker: 0, eyeHappy: 1, mouthSmile: 0.9 });
    this.say('hehe');
    // rub the belly
    this.armTargetL.set(0.4, -0.6, 0.7).normalize();
    this.armTargetR.set(-0.4, -0.6, 0.7).normalize();
    await this.wait(0.9);
    this.fullness *= 0.6;
  }

  // ------------------------------------------------------------------------------------------
  // Reactions

  private async react(a: MealAnalysis) {
    const g = this.game;
    const head = () => this.headWorld().add(new THREE.Vector3(0, 0.32, 0));
    g.ui.speech(a.quip || '', this.headWorld().add(new THREE.Vector3(0, 0.45, 0)));
    this.face.reset();
    switch (a.reaction) {
      case 'love': {
        this.face.eyeMode = 'heart';
        this.face.set({ mouthOpen: 0.75, mouthSmile: 1, blush: 1, mouthWide: 1.2 });
        this.say('love');
        g.audio.duckMusic(0.5, 2);
        this.armTargetL.set(-0.6, 1, 0.2).normalize();
        this.armTargetR.set(0.6, 1, 0.2).normalize();
        for (let i = 0; i < 3; i++) {
          this.hop.kick(3);
          this.squash.kick(-2);
          g.fx.hearts(head(), 3);
          this.earFlop.kick(5);
          await this.wait(0.42);
        }
        this.armWaveL = this.armWaveR = 1;
        await this.wait(0.8);
        break;
      }
      case 'yum': {
        this.face.set({ eyeHappy: 1, mouthOpen: 0.45, mouthSmile: 1, blush: 0.8 });
        this.say(Math.random() < 0.5 ? 'yum' : 'mmm');
        g.fx.sparkle(head(), 8);
        this.armTargetR.set(-0.3, -0.5, 0.8).normalize();
        for (let i = 0; i < 2; i++) {
          this.lean.kick(-1.2);
          this.hop.kick(1.2);
          await this.wait(0.4);
        }
        g.fx.notes(head(), 2);
        await this.wait(0.7);
        break;
      }
      case 'okay': {
        this.face.set({ mouthSmile: 0.6, eyeHappy: 0.5 });
        this.say('ok');
        this.lean.kick(-0.8);
        await this.wait(1.3);
        break;
      }
      case 'meh': {
        this.face.set({ mouthSmile: 0, eyeOpen: 0.55, browAngle: 0.2, mouthWobble: 0.2 });
        this.say('sigh');
        this.shrug();
        this.earFlop.target = 0.5;
        await this.wait(1.6);
        this.earFlop.target = 0;
        break;
      }
      case 'yuck': {
        this.face.set({ mouthSmile: -0.8, mouthWobble: 0.8, tongue: 0.8, green: 0.35, squint: 0.6, browAngle: 0.5 });
        this.say('bleh');
        this.shakeAmp = 0.5;
        this.armTargetL.set(-0.2, 0.2, 1).normalize();
        this.armTargetR.set(0.2, 0.2, 1).normalize();
        await this.wait(1.6);
        break;
      }
      case 'gross': {
        this.face.eyeMode = 'swirl';
        this.face.set({ mouthSmile: -1, mouthWobble: 1, mouthOpen: 0.4, tongue: 1, green: 0.85 });
        this.say(Math.random() < 0.5 ? 'eww' : 'yuck');
        this.shakeAmp = 1;
        this.sweatBurst(3);
        g.fx.swirl(head());
        this.earFlop.target = 1;
        await this.wait(2.1);
        this.earFlop.target = 0;
        break;
      }
      case 'spicy': {
        this.face.set({ red: 1, eyeWide: 0.9, mouthOpen: 1, mouthWide: 1.2, tears: 0.6, browAngle: 0.6 });
        this.say('spicy');
        g.audio.play('fire');
        g.audio.duckMusic(0.6, 2.5);
        for (let i = 0; i < 10; i++) {
          g.fx.fire(this.mouthWorld().addScaledVector(this.forwardWorld(), 0.04), this.forwardWorld(), 1.2);
          if (i % 3 === 0) for (const side of [-1, 1]) g.fx.earSteam(this.localToWorld(new THREE.Vector3(side * 0.2, 0.72, 0)), new THREE.Vector3(side, 0.3, 0).normalize());
          if (i % 3 === 0) this.hop.kick(2);
          this.armWaveR = 1; // fanning
          await this.wait(0.16);
        }
        this.armWaveR = 0;
        this.say('gasp');
        this.face.set({ mouthOpen: 0.6, tongue: 0.8 });
        this.sweatBurst(4);
        await this.wait(1);
        break;
      }
      case 'sour': {
        this.face.eyeMode = 'closed';
        this.face.set({ mouthPucker: 1, mouthOpen: 0.1, eyeOpen: 0.2, browAngle: 0.7, blush: 0.7 });
        this.squash.target = 0.86;
        this.earFlop.target = 0.9;
        this.say('sour');
        this.shakeAmp = 0.35;
        await this.wait(1.7);
        this.squash.target = 1;
        this.earFlop.target = 0;
        break;
      }
      case 'burnt': {
        this.face.set({ soot: 0.9, mouthOpen: 0.5, mouthSmile: -0.5, eyeOpen: 0.5 });
        for (let i = 0; i < 3; i++) {
          this.sfx('cough');
          this.squash.kick(-2.5);
          this.lean.kick(-1);
          g.fx.smoke(this.mouthWorld().addScaledVector(this.forwardWorld(), 0.05), 0.8, 1.2);
          await this.wait(0.45);
        }
        this.face.eyeMode = 'x';
        this.say('bleh');
        await this.wait(1.1);
        break;
      }
      case 'frozen': {
        this.face.set({ blue: 0.9, mouthOpen: 0.25, teeth: 1, eyeWide: 0.3, browAngle: 0.5 });
        this.say('brr');
        for (let i = 0; i < 12; i++) {
          this.face.over.mouthOpen = i % 2 ? 0.12 : -0.1;
          this.shakeAmp = 0.45;
          if (i % 3 === 0) g.fx.frost(head().add(new THREE.Vector3(0, -0.2, 0)), 0.2, 1.4);
          await this.wait(0.13);
        }
        this.face.over.mouthOpen = 0;
        await this.wait(0.5);
        break;
      }
      case 'weird-good': {
        this.face.set({ squint: 0.5, browTilt: 1 });
        this.say('hmm');
        await this.wait(0.7);
        this.face.set({ squint: 0, browTilt: 0, eyeWide: 1, browY: 1, mouthOpen: 0.8 });
        this.say('gasp');
        await this.wait(0.35);
        this.face.eyeMode = 'star';
        this.face.set({ mouthSmile: 1, mouthOpen: 0.6 });
        this.say('wow');
        g.fx.sparkle(head(), 14, '#fff3a0');
        for (let i = 0; i < 2; i++) {
          this.hop.kick(2.5);
          this.tilt.kick(i % 2 ? 2 : -2);
          await this.wait(0.38);
        }
        await this.wait(0.5);
        break;
      }
      case 'weird-bad': {
        this.face.eyeMode = 'swirl';
        this.face.set({ mouthWobble: 0.8, mouthSmile: -0.3, browTilt: 1 });
        this.tilt.target = 0.25;
        g.fx.swirl(head());
        this.say('huh');
        await this.wait(1.1);
        this.say('bleh');
        this.shakeAmp = 0.4;
        await this.wait(0.8);
        this.tilt.target = 0;
        break;
      }
      case 'sugar-rush': {
        this.face.eyeMode = 'star';
        this.face.set({ mouthOpen: 0.8, mouthSmile: 1, blush: 1 });
        this.say('yay');
        for (let i = 0; i < 8; i++) {
          this.hop.kick(2.2);
          this.tilt.kick(i % 2 ? 2.5 : -2.5);
          this.shakeAmp = 0.3;
          g.fx.sparkle(head(), 5, i % 2 ? '#ff9fd0' : '#9fe8ff');
          if (i === 3) this.say('giggle');
          await this.wait(0.22);
        }
        break;
      }
      case 'tears': {
        this.face.set({ tears: 1, eyeOpen: 0.4, mouthSmile: 0.2, mouthWobble: 0.5, browAngle: 0.6 });
        this.say('cry');
        for (let i = 0; i < 8; i++) {
          for (const side of [-1, 1]) g.fx.tears(this.localToWorld(new THREE.Vector3(side * 0.12, EYE_Y - 0.03, 0.22)), side);
          await this.wait(0.2);
        }
        this.sfx('sniff');
        this.face.set({ tears: 0.4, eyeHappy: 1, mouthSmile: 0.8, mouthWobble: 0 });
        this.say('hehe');
        await this.wait(0.8);
        break;
      }
      default:
        this.face.set({ mouthSmile: 0.6 });
        await this.wait(1.2);
    }
    this.shakeAmp = 0;
    this.armWaveL = this.armWaveR = 0;
    // let a little residue linger (soot fades, tints fade via reset)
  }

  // ------------------------------------------------------------------------------------------
  // Per-frame

  update(dt: number, time: number) {
    const g = this.game;
    // --- attention target
    let target: THREE.Vector3 | null = null;
    if (this.lookAtPoint) target = this.lookAtPoint;
    else if (this.watched) target = this.watched.position;
    else if (this.focus && this.focus.until > g.time) target = this.focus.p;
    else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 1.5 + Math.random() * 3;
        const r = Math.random();
        if (r < 0.45) this.wanderPoint.copy(g.camera.camera.position);
        else if (r < 0.75) {
          const st = g.stationList[Math.floor(Math.random() * g.stationList.length)];
          this.wanderPoint.copy(st.center());
        } else this.wanderPoint.set(this.root.position.x + (Math.random() - 0.5) * 2, 1 + Math.random(), this.root.position.z + 1.5);
      }
      target = this.wanderPoint;
    }
    if (target) this.lookToward(target, dt);

    // --- idle life
    if (this.mood === 'idle') {
      this.idleT += dt;
      if (this.idleT > 9 && Math.random() < dt * 0.15) {
        this.idleT = 0;
        const r = Math.random();
        if (r < 0.4) {
          // hum a little tune
          this.say('mmm', 1.2);
          g.fx.notes(this.headWorld().add(new THREE.Vector3(0.15, 0.3, 0)), 2);
          this.hummed++;
        } else if (r < 0.7) {
          this.tilt.kick(1.5);
          this.earFlop.kick(3);
        } else if (g.stations.plate.contents.length) {
          this.flash({ tongue: 0.6, mouthOpen: 0.3, eyeWide: 0.4 }, 1.2);
          this.say('hungry');
          this.focus = { p: g.stations.plate.center(), until: g.time + 2 };
        } else {
          this.armWaveL = 1;
          setTimeout(() => (this.armWaveL = 0), 900);
        }
      }
    }
    // talking & chewing overlays
    this.talkT = Math.max(0, this.talkT - dt);
    this.talkAmp += ((this.talkT > 0 ? 1 : 0) - this.talkAmp) * (1 - Math.exp(-14 * dt));
    this.chewT += dt;
    const talk = this.talkAmp * (0.25 + 0.25 * Math.sin(time * 26)) * (this.mood === 'idle' ? 1 : 0.6);
    const chew = this.chewAmp * (0.18 + 0.18 * Math.sin(this.chewT * 15));
    this.face.over.mouthOpen = (this.face.over.mouthOpen ?? 0) * 0 + talk + chew;
    this.face.over.cheeks = this.chewAmp * (0.6 + 0.4 * Math.sin(this.chewT * 15));
    this.face.update(dt);
    this.applySkinTint();

    // --- body springs
    const breathe = Math.sin(time * 2.1) * 0.012;
    this.lean.update(dt);
    this.tilt.update(dt);
    this.turn.update(dt);
    this.hop.target = 0;
    this.hop.update(dt);
    this.squash.update(dt);
    this.shake = this.shakeAmp > 0 ? Math.sin(time * 48) * 0.035 * this.shakeAmp : 0;
    if (this.mood === 'idle') this.shakeAmp *= Math.exp(-3 * dt);
    this.bellyS.target = 1 + this.fullness * 0.06;
    this.bellyS.update(dt);
    this.fullness = Math.max(0, this.fullness - dt * 0.02);
    const sq = THREE.MathUtils.clamp(this.squash.value + breathe, 0.75, 1.25);
    this.body.scale.set((1 / Math.sqrt(sq)) * this.bellyS.value, sq, (1 / Math.sqrt(sq)) * this.bellyS.value);
    this.body.position.y = Math.max(0, this.hop.value * 0.04);
    this.body.rotation.set(this.lean.value * 0.6, this.turn.value, this.tilt.value * 0.25 + this.shake, 'YXZ');
    this.root.rotation.y = this.baseYaw;

    // ears & tuft secondary motion
    this.earFlop.update(dt);
    this.earSpread.update(dt);
    this.tuftSway.target = -this.tilt.value * 0.3 - this.turn.vel * 0.05;
    this.tuftSway.update(dt);
    const hopVel = this.hop.vel * 0.04;
    this.earL.rotation.z = 0.45 + this.earFlop.value * 0.9 + hopVel + Math.sin(time * 1.7) * 0.03;
    this.earR.rotation.z = -0.45 - this.earFlop.value * 0.9 - hopVel - Math.sin(time * 1.9 + 1) * 0.03;
    this.earL.rotation.x = this.earR.rotation.x = -this.earFlop.value * 0.4;
    this.tuft.rotation.z = this.tuftSway.value * 0.6 + Math.sin(time * 2.3) * 0.04;
    this.tuft.rotation.x = -this.hop.vel * 0.02;

    // arms (aim towards target directions, with waving)
    this.aimArm(this.armL, this.armTargetL, this.armWaveL, time, -1, dt);
    this.aimArm(this.armR, this.armTargetR, this.armWaveR, time, 1, dt);

    // zone follows the head
    this.zone.position.copy(this.headWorld());

    // hold the food while eating
    if (this.eatingItem && this.eatingItem.mode === 'held') {
      /* position is driven by the eating sequence */
    }
  }

  postUpdate() {}

  /** Whole-body colour shifts: red when spicy, green when grossed out, blue when frozen. */
  private applySkinTint() {
    const red = this.face.value('red'), green = this.face.value('green'), blue = this.face.value('blue'), soot = this.face.value('soot');
    const c = TMP_C.set('#ffffff');
    c.lerp(TINT_RED, Math.min(1, Math.max(0, red)) * 0.75);
    c.lerp(TINT_GREEN, Math.min(1, Math.max(0, green)) * 0.7);
    c.lerp(TINT_BLUE, Math.min(1, Math.max(0, blue)) * 0.7);
    c.lerp(TINT_SOOT, Math.min(1, Math.max(0, soot)) * 0.25);
    this.bodyMat.color.copy(c);
    this.earMat.color.copy(EAR_BASE).multiply(c);
    this.bodyMat.emissive.copy(TINT_RED).multiplyScalar(Math.max(0, red) * 0.12);
  }

  private aimArm(arm: THREE.Group, dir: THREE.Vector3, wave: number, time: number, side: number, dt: number) {
    const d = dir.clone();
    if (wave > 0) d.set(side * 0.6, 1, 0.35 + Math.sin(time * 14) * 0.35).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), d);
    arm.quaternion.slerp(q, 1 - Math.exp(-10 * dt));
  }

  private lookToward(p: THREE.Vector3, dt: number) {
    this.root.updateMatrixWorld(true);
    const local = this.root.worldToLocal(p.clone());
    const eye = new THREE.Vector3(0, EYE_Y, 0.1);
    const d = local.sub(eye);
    const yaw = Math.atan2(d.x, d.z);
    const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    // body turns for big angles, eyes do the rest
    const turnWant = THREE.MathUtils.clamp(yaw * 0.55, -0.75, 0.75);
    this.turn.target = this.mood === 'eating' ? turnWant * 0.3 : turnWant;
    const eyeYaw = yaw - this.turn.value;
    this.face.base.lookX = THREE.MathUtils.clamp(eyeYaw / 0.9, -1, 1);
    this.face.base.lookY = THREE.MathUtils.clamp(pitch / 0.7, -1, 1);
    void dt;
  }
}

// ---------------------------------------------------------------------------------------------

function paintBody(g: THREE.BufferGeometry) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const lilac = new THREE.Color(LILAC), dark = new THREE.Color(LILAC_DARK), cream = new THREE.Color(CREAM);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(x, z); // 0 = front
    // belly: front, lower half (soft oval)
    const bx = a / 0.95, by = (y - 0.2) / 0.2;
    const belly = THREE.MathUtils.smoothstep(1.05, 0.75, Math.sqrt(bx * bx + by * by));
    c.copy(lilac).lerp(dark, THREE.MathUtils.smoothstep(0.25, 0.0, y) * 0.5 + THREE.MathUtils.smoothstep(0.6, 1, Math.abs(a) / Math.PI) * 0.25);
    c.lerp(cream, belly * 0.85);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function makeBib(): THREE.Object3D {
  const tex = canvasTexture(
    512,
    256,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      // scalloped bottom edge
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(w, h * 0.72);
      const n = 9;
      for (let i = n; i >= 0; i--) {
        const x = (i / n) * w;
        ctx.quadraticCurveTo(x + w / n / 2, h * 0.98, x, h * 0.72);
      }
      ctx.closePath();
      ctx.fill();
      // polka dots
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#ff8a9a';
      for (let y = 30; y < h; y += 52)
        for (let x = (y / 52) % 2 ? 26 : 52; x < w; x += 52) {
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.fill();
        }
      ctx.restore();
      // top band
      ctx.fillStyle = '#ff8a9a';
      ctx.fillRect(0, 0, w, 16);
    },
    { key: 'mochi-bib' },
  );
  const prof: Profile = [];
  for (let i = 0; i <= 10; i++) {
    const y = 0.16 + (i / 10) * 0.21;
    prof.push([profileRadiusAt(BODY_PROFILE, y) * 1.03 + 0.004, y]);
  }
  const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40, -0.95, 1.9);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.7, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat);
  m.scale.z = Z_SCALE * 1.02;
  m.castShadow = true;
  return m;
}

function safe<T>(fn: () => T, fb: T): T {
  try {
    return fn();
  } catch {
    return fb;
  }
}

function fallbackAnalysis(item: FoodItem): MealAnalysis {
  return {
    name: item.name || 'Mystery Food',
    dishId: null,
    category: 'silly',
    taste: 0.3,
    weirdness: 0.3,
    flags: { burnt: 0, raw: 0, spicy: 0, sour: 0, sweet: 0, salty: 0, frozen: 0, hot: 0, crunchy: false, liquid: false, gross: false, sugarRush: false, onionTears: false, melty: false },
    reaction: 'okay',
    inspect: false,
    blowFirst: false,
    bites: 3,
    eatStyle: 'bite',
    quip: 'Hmm!',
  };
}
