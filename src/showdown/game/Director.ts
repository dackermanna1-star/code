import * as THREE from 'three';
import { SD } from '../core/SD';
import { Animator } from '../char/Anim';
import { DOWN, GJ_POCKETS, GJ_PURPLE, GJ_SIGN, SK_CHANT1, SK_DOMAIN, SK_IDLE, SK_LAUGH, SK_SIGN, SK_SUMMON, KNEEL } from '../char/Poses';
import { DAY } from '../world/Sky';
import { ShrineEnv, VoidEnv } from '../world/Domains';
import type { Fight } from './Fight';
import { Mahoraga } from './Mahoraga';
import { Timeline } from './Timeline';
import { makeHit } from './Combat';
import { disposeTree } from '../char/Model';

const _v = new THREE.Vector3();
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

type Env = 'city' | 'void' | 'shrine';

/**
 * The fight's story: phases, domain battles, Mahoraga, the World-Cutting
 * Slash and the endings. Runs the cutscenes and swaps the world around.
 */
export class Director {
  phase = 1;
  seq: Timeline | null = null;
  env: Env = 'city';
  readonly voidEnv = new VoidEnv();
  readonly shrineEnv = new ShrineEnv();
  /** the domain clash, when one is on */
  clash: { balance: number; t: number; beat: number; nextBeat: number; hits: number; over: boolean; usedBeat?: number } | null = null;
  /** sure-hit timer for whichever domain won */
  private sureHit: { who: 'void' | 'shrine'; t: number } | null = null;
  maho: Mahoraga | null = null;
  private triggered = new Set<string>();
  private envFade = 0;
  private envTarget: Env = 'city';
  private shrineSlashT = 0;
  /** world-cutting slash telegraph */
  wcs: { n: THREE.Vector3; d: number; t: number; locked: boolean; origin: THREE.Vector3; fwd: THREE.Vector3 } | null = null;
  /** the line a cut leaves across the world, white-hot then fading */
  private cutFx: { n: THREE.Vector3; d: number; t: number } | null = null;

  constructor(readonly fight: Fight) {
    SD.scene.add(this.voidEnv.group, this.shrineEnv.group);
    fight.boss.onThreshold = (k) => this.threshold(k);
  }

  get busy() {
    return !!this.seq && !this.seq.done;
  }

  // ---------------------------------------------------------------- shared helpers
  /** Cutscene mode: no control, third-person bodies, letterbox. */
  cine(on: boolean, letterbox = true) {
    const f = this.fight;
    f.player.control = !on;
    f.boss.cine(on);
    this.maho?.cine(on);
    SD.hideVM = on;
    f.player.model.setShadowOnly(!on);
    f.hud.visible = !on;
    SD.renderer.post.letterbox = on && letterbox ? 1 : 0;
    if (!on) f.player.cam.stopShot();
  }

  /** A fixed or travelling shot. */
  shot(from: THREE.Vector3, to: THREE.Vector3, look0: THREE.Vector3, look1: THREE.Vector3, dur: number, fov: [number, number] = [50, 50], ease: 'io' | 'out' | 'in' | 'lin' = 'io', pan = 0) {
    this.fight.player.cam.play({ from, to, lookFrom: look0, lookTo: look1, dur, fov, ease, hold: true, pan });
  }

  private boss() {
    return this.fight.boss;
  }
  private player() {
    return this.fight.player;
  }

  /** Bring the fighters face to face at a distance for a cutscene. */
  private stage(dist: number) {
    const p = this.player();
    const b = this.boss();
    const c = _v.addVectors(p.f.pos, b.f.pos).multiplyScalar(0.5).setY(0);
    if (c.length() > 40) c.setLength(40);
    const dir = new THREE.Vector3().subVectors(b.f.pos, p.f.pos).setY(0);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1);
    dir.normalize();
    const pp = c.clone().addScaledVector(dir, -dist / 2);
    const bp = c.clone().addScaledVector(dir, dist / 2);
    p.f.place(pp.x, SD.city.groundY(pp.x, pp.z), pp.z);
    b.f.place(bp.x, SD.city.groundY(bp.x, bp.z), bp.z);
    p.yaw = Math.atan2(-dir.x, -dir.z);
    p.pitch = 0;
    b.yaw = Math.atan2(-dir.x, -dir.z);
    return { c, dir };
  }

  // ---------------------------------------------------------------- environments
  setEnv(e: Env) {
    this.envTarget = e;
  }

  private updateEnv(dt: number) {
    if (this.envTarget !== this.env) {
      this.envFade += dt * 2.5;
      if (this.envFade >= 1) {
        this.env = this.envTarget;
        this.envFade = 0;
        this.applyEnv();
      }
    }
    // a white flash crossing between worlds
    if (this.envTarget !== this.env) SD.renderer.post.flash = Math.max(SD.renderer.post.flash, Math.sin(this.envFade * Math.PI) * 0.9);
    const cam = SD.camera;
    if (this.voidEnv.group.visible) this.voidEnv.update(SD.time, cam, this.player().f.pos);
    if (this.shrineEnv.group.visible) this.shrineEnv.update(SD.time, cam);
  }

  private applyEnv() {
    const city = SD.city;
    const e = this.env;
    city.group.visible = e !== 'void';
    city.sky.mesh.visible = e === 'city';
    this.voidEnv.group.visible = e === 'void';
    this.shrineEnv.group.visible = e === 'shrine';
    const fog = city.fog;
    if (e === 'void') {
      fog.density = 0.0;
      city.hemi.color.setRGB(0.4, 0.55, 1.0);
      city.hemi.groundColor.setRGB(0.05, 0.08, 0.2);
      city.hemi.intensity = 1.0;
      city.sun.color.setRGB(0.85, 0.92, 1.0);
      city.sun.intensity = 1.6;
    } else if (e === 'shrine') {
      fog.color.setRGB(0.22, 0.02, 0.01);
      fog.density = 0.006;
      city.hemi.color.setRGB(1.0, 0.25, 0.15);
      city.hemi.groundColor.setRGB(0.25, 0.02, 0.01);
      city.hemi.intensity = 1.1;
      city.sun.color.setRGB(1.0, 0.45, 0.3);
      city.sun.intensity = 1.4;
    } else {
      fog.color.copy(DAY.haze);
      fog.density = DAY.fogDensity;
      city.hemi.color.copy(DAY.hemiSky);
      city.hemi.groundColor.copy(DAY.hemiGround);
      city.hemi.intensity = DAY.hemiIntensity;
      city.sun.color.copy(DAY.sunColor);
      city.sun.intensity = DAY.sunIntensity;
    }
  }

  // ---------------------------------------------------------------- phases
  private threshold(k: number) {
    // never on top of another set piece, a domain or the player's own cutscene
    if (this.busy || this.clash || this.sureHit || this.awaitAnswer > 0 || this.env !== 'city' || this.envTarget !== 'city') return true;
    if (this.fight.mode !== 'fight' || !this.player().alive) return true;
    const b = this.boss();
    if (k <= 0.7 && !this.triggered.has('domain')) {
      this.triggered.add('domain');
      this.phase = 2;
      b.floorK = 0.46;
      this.domainBattle();
      return true;
    }
    if (k <= 0.46 && !this.triggered.has('maho')) {
      this.triggered.add('maho');
      this.phase = 3;
      b.floorK = 0.22;
      this.summonMahoraga();
      return true;
    }
    if (k <= 0.22 && !this.triggered.has('finale')) {
      this.triggered.add('finale');
      this.phase = 4;
      b.floorK = 0;
      this.finale();
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- title and intro
  /** The two of them squared up in the middle of the junction. */
  private faceOff() {
    const p = this.player();
    const b = this.boss();
    p.f.place(0, SD.city.groundY(0, 8), 8);
    b.f.place(0, SD.city.groundY(0, -8), -8);
    p.yaw = 0;
    p.pitch = 0;
    b.yaw = 0;
    p.anim.stance = GJ_POCKETS;
    b.anim.stance = SK_IDLE;
    b.anim.stop();
    p.anim.stop();
    p.model.setExpr('neutral');
    b.model.setExpr('smirk');
  }

  private attractOn = false;
  private attractT = 0;
  private attractShot = -1;

  /** Title screen: the face-off behind the menu, in long drifting shots. */
  attract() {
    this.cine(true, false);
    this.fight.hud.shown = false;
    this.faceOff();
    this.attractOn = true;
    this.attractT = 0;
    this.attractShot = -1;
  }

  private updateAttract(dt: number) {
    if (!this.attractOn) return;
    this.attractT -= dt;
    const post = SD.renderer.post;
    // dip to black between shots
    post.fade = this.attractT < 0.5 ? Math.max(0, 1 - this.attractT / 0.5) : Math.max(0, post.fade - dt * 2);
    if (this.attractT > 0) return;
    this.attractShot = (this.attractShot + 1) % 4;
    const p = this.player().f.pos;
    const b = this.boss().f.pos;
    const P = (o: THREE.Vector3, x: number, y: number, z: number) => o.clone().add(V(x, y, z));
    const dur = 8;
    // the menu fills the left of the frame, so the pair sits right of centre
    const shots: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3, [number, number], number][] = [
      // over Gojo's left shoulder: Sukuna waits down the street
      [P(p, -0.6, 1.82, 1.5), P(p, -0.5, 1.8, 1.15), P(b, 0, 1.45, 0), P(b, 0, 1.55, 0), [30, 27], 0.12],
      // low in front of Gojo: the strongest against the skyline
      [P(p, 1.6, 0.25, -2.5), P(p, 1.3, 0.35, -2.05), P(p, 0, 1.45, 0), P(p, 0, 1.6, 0), [40, 36], 0.14],
      // low behind Sukuna's right shoulder, looking up the street at Gojo
      [P(b, 0.55, 1.15, -1.6), P(b, 0.45, 1.3, -1.25), P(p, 0, 1.65, 0), P(p, 0, 1.75, 0), [32, 28], 0.12],
      // the junction from the rooftops
      [V(-44, 58, 52), V(-36, 50, 40), V(0, 0, 0), V(0, 0, -4), [44, 40], 0.16],
    ];
    const s = shots[this.attractShot];
    this.fight.player.cam.play({ from: s[0], to: s[1], lookFrom: s[2], lookTo: s[3], dur, fov: s[4], ease: 'lin', hold: true, pan: s[5] });
    this.attractT = dur;
    post.fade = 1;
  }

  private introDone: (() => void) | null = null;
  private vsCam = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 6000);

  /**
   * December 24th, noon: the city from above, Sukuna, Gojo, the VS card, and
   * straight into Gojo's eyes. `short` (a rematch) starts at the VS card.
   */
  intro(short: boolean, onDone: () => void) {
    const p = this.player();
    const b = this.boss();
    this.attractOn = false;
    this.introDone = onDone;
    this.cine(true);
    this.fight.hud.shown = true;
    this.fight.hud.skippable = true;
    this.faceOff();
    const post = SD.renderer.post;
    post.fade = 0;
    const music = SD.music;
    const t = new Timeline();
    this.seq = t;
    const pp = p.f.pos.clone();
    const bp = b.f.pos.clone();
    const O = (o: THREE.Vector3, x: number, y: number, z: number) => o.clone().add(V(x, y, z));
    const vs = () => {
      // 五条悟 vs 両面宿儺: two close-ups split on a diagonal, manga-inked
      post.manga = 1;
      post.split = 1;
      post.splitAngle = 0.32;
      post.splitPos = 0;
      p.model.setExpr('smirk');
      b.model.setExpr('grin');
      this.shot(O(pp, 0.16, 1.77, -0.82), O(pp, 0.1, 1.77, -0.62), O(pp, 0, 1.75, 0), O(pp, 0, 1.76, 0), 2.6, [30, 26], 'lin', -0.15);
      this.vsCam.aspect = SD.camera.aspect;
      SD.renderer.splitScene = { scene: SD.scene, camera: this.vsCam };
      SD.menu?.vsCard(true);
      SD.audio?.play('vsSting', { volume: 1.2 });
      this.fight.hud.caption('', '', 0);
      music?.duck(1, 0.2);
      music?.mix(0.4, 0.8, 0, 0.3);
    };
    const vsTick = (k: number) => {
      post.manga = 1;
      // Sukuna's half: his own camera, drifting in
      const c = this.vsCam;
      c.position.copy(O(bp, -0.16 + k * 0.04, 1.72, 0.82 - k * 0.18));
      c.up.set(0, 1, 0);
      c.lookAt(O(bp, 0, 1.69, 0));
      c.rotateY(0.15);
      c.fov = 30 - k * 4;
      c.aspect = SD.camera.aspect;
      c.updateProjectionMatrix();
      c.updateMatrixWorld();
    };
    const go = () => {
      SD.menu?.vsCard(false);
      post.split = 0;
      SD.renderer.splitScene = null;
      post.manga = 0;
      // from over his shoulder into his eyes
      this.shot(O(pp, 0.55, 2.15, 2.6), O(pp, 0, 1.76, 0.05), O(pp, -0.1, 1.6, -8), O(bp, 0, 1.4, 0), 0.9, [58, 76], 'in');
      SD.audio?.play('whoosh', { volume: 0.8 });
    };
    if (!short) {
      t.at(0, () => {
        post.fade = 1;
        this.shot(V(-74, 96, 124), V(-44, 62, 74), V(0, 40, -220), V(0, 2, 0), 4.3, [56, 46], 'io');
        SD.audio?.play('wind', { volume: 0.7 });
        music?.mix(0, 0, 0, 0.5);
        music?.duck(1, 0.2);
      });
      t.during(0, 1.4, (k) => (post.fade = 1 - k));
      t.at(0.7, () => this.fight.hud.caption('十二月二十四日　正午　新宿', 'DECEMBER 24 — 12:00 — SHINJUKU', 3.4));
      t.at(4.3, () => {
        this.shot(O(bp, 1.15, 0.25, 3.3), O(bp, 0.75, 0.6, 2.6), O(bp, 0, 1.1, 0), O(bp, 0, 1.55, 0), 3.0, [40, 34], 'io');
        SD.audio?.play('taiko', { volume: 0.9 });
        music?.mix(0, 0.55, 0, 2.5);
      });
      t.at(4.9, () => {
        b.model.setExpr('grin');
        SD.hud?.subtitle('待ちわびたぞ　五条悟', "I've waited long for this, Satoru Gojo.", 'sukuna', 2.4);
      });
      t.at(5.6, () => b.anim.play(SK_LAUGH));
      t.at(7.3, () => {
        // over his shoulder: Gojo, hands in pockets, sixteen metres away
        this.shot(O(bp, -0.36, 1.74, -1.15), O(bp, -0.3, 1.72, -0.95), O(pp, 0.3, 1.4, 0), O(pp, 0.2, 1.5, 0), 1.6, [30, 27], 'lin', -0.1);
      });
      t.at(8.9, () => {
        this.shot(O(pp, 0.4, 1.7, -1.75), O(pp, 0.22, 1.75, -1.3), O(pp, 0, 1.7, 0), O(pp, 0, 1.74, 0), 2.6, [34, 28], 'io');
        SD.audio?.play('taiko', { volume: 0.9 });
      });
      t.at(9.3, () => {
        p.model.setExpr('smirk');
        SD.hud?.subtitle('お待たせ', 'Sorry to keep you waiting.', 'gojo', 2);
      });
    }
    const T = short ? 0 : 11.5;
    t.at(T, vs);
    t.during(T, T + 2.6, (k) => vsTick(k));
    t.at(T + 2.6, go);
    t.at(T + 3.5, () => this.startDuel());
    t.end(T + 3.6);
  }

  /** SPACE during the intro. */
  skipIntro() {
    if (!this.introDone) return;
    SD.menu?.vsCard(false);
    SD.renderer.post.split = 0;
    SD.renderer.splitScene = null;
    SD.renderer.post.manga = 0;
    SD.renderer.post.fade = 0;
    this.fight.hud.caption('', '', 0);
    this.startDuel();
  }

  /** Hands the fight to the player. */
  private startDuel() {
    const done = this.introDone;
    if (!done) return;
    this.introDone = null;
    this.seq = null;
    this.faceOff();
    this.cine(false);
    this.fight.hud.skippable = false;
    const p = this.player();
    p.model.setExpr('neutral');
    this.boss().model.setExpr('smirk');
    SD.hud?.callout('開戦', 'FIGHT', '', 1.4);
    SD.audio?.play('taiko', { volume: 1.2 });
    SD.audio?.play('vsSting', { volume: 0.6 });
    p.cam.shake(0.3);
    SD.renderer.post.speed = 0.8;
    SD.renderer.post.speedMode = 0;
    SD.renderer.post.speedFocus.set(0.5, 0.5);
    SD.music?.duck(1, 0.2);
    SD.music?.mix(1, 0.35, 0, 1);
    done();
  }

  /** Puts the world back the way the fight found it. */
  dispose() {
    this.seq = null;
    this.after.length = 0;
    this.attractOn = false;
    this.introDone = null;
    this.clash = null;
    this.sureHit = null;
    this.wcs = null;
    this.cutFx = null;
    if (this.maho) {
      this.maho.dispose();
      this.maho.model.dispose();
    }
    this.maho = null;
    this.voidEnv.group.removeFromParent();
    this.shrineEnv.group.removeFromParent();
    disposeTree(this.voidEnv.group);
    disposeTree(this.shrineEnv.group);
    if (this.clashSceneObj) {
      const env = this.clashSceneObj.userData.env as VoidEnv;
      // Gojo's body may still be standing in the clash world
      this.clashSceneObj.remove(this.player().model.group);
      disposeTree(env.group);
      this.clashSceneObj = null;
    }
    this.env = 'city';
    this.envTarget = 'city';
    this.applyEnv();
    SD.renderer.splitScene = null;
    SD.menu?.vsCard(false);
  }

  // ---------------------------------------------------------------- 領域展開
  domainBattle() {
    const p = this.player();
    const b = this.boss();
    const t = new Timeline();
    this.seq = t;
    const music = SD.music;
    t.at(0, () => {
      this.cine(true);
      const { dir } = this.stage(16);
      b.anim.play(SK_DOMAIN);
      b.model.setExpr('grin');
      music?.duck(0.3, 0.5);
      // over Sukuna's shoulder, then his hands
      const bp = b.f.pos;
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      this.shot(
        bp.clone().addScaledVector(dir, 3.2).addScaledVector(side, 1.1).setY(1.55),
        bp.clone().addScaledVector(dir, 2.2).addScaledVector(side, 0.5).setY(1.45),
        bp.clone().setY(1.35),
        bp.clone().setY(1.35),
        2.4,
        [42, 32],
      );
      SD.renderer.post.manga = 1;
      SD.hud?.subtitle('領域展開', 'Domain Expansion.', 'sukuna');
      SD.audio?.play('gong', { volume: 0.9 });
    });
    t.during(0, 2.4, () => (SD.renderer.post.manga = 1));
    t.at(2.4, () => {
      // the shrine rises behind him
      this.shrineEnv.place(b.f.pos, new THREE.Vector3().subVectors(p.f.pos, b.f.pos));
      this.shrineEnv.group.visible = true;
      SD.hud?.callout('伏魔御廚子', 'Malevolent Shrine', 'sukuna', 2.6);
      SD.audio?.play('shrineStart', { volume: 1.3 });
      const bp = b.f.pos;
      const back = new THREE.Vector3().subVectors(p.f.pos, b.f.pos).setY(0).normalize();
      this.shot(bp.clone().addScaledVector(back, 14).setY(1.2), bp.clone().addScaledVector(back, 10).setY(2.5), bp.clone().setY(3), this.shrineEnv.shrine.position.clone().setY(14), 2.2, [55, 60]);
      SD.renderer.post.impact = 1;
      SD.renderer.post.impactColor.setRGB(1, 0.1, 0.1);
      music?.mix(0.2, 0, 1, 1);
      music?.duck(1, 1);
    });
    t.at(4.6, () => {
      // back to Gojo's eyes: answer it or eat the sure-hit
      this.cine(false);
      this.player().cam.stopShot();
      SD.timing.slowmo(2.4, 0.3, 0.4);
      SD.hud?.prompt('Z', '領域展開 — DOMAIN EXPANSION', 2.4);
      this.awaitAnswer = 2.4;
    });
    t.end(4.7);
  }

  /** real seconds left to answer Sukuna's domain */
  awaitAnswer = 0;

  /** Called each frame while waiting for Gojo's answer. */
  private updateAnswer(dt: number) {
    if (this.awaitAnswer <= 0) return;
    this.awaitAnswer -= dt;
    const p = this.player();
    if (SD.input.pressed('KeyZ') && p.alive) {
      this.awaitAnswer = 0;
      SD.hud?.prompt('', '', 0);
      SD.timing.reset();
      this.startClash();
      return;
    }
    if (this.awaitAnswer <= 0) {
      SD.hud?.prompt('', '', 0);
      this.domainResult('shrine', true);
    }
  }

  private startClash() {
    const p = this.player();
    const b = this.boss();
    const t = new Timeline();
    this.seq = t;
    p.arms.R.set({ p: [0.02, -0.08, -0.34], r: [1.45, -0.2, -0.5], pose: 'cross' }, 400, 34);
    SD.hud?.callout('領域展開「無量空処」', 'Domain Expansion: Infinite Void', 'void', 2.4);
    SD.audio?.play('domainStart', { volume: 1.3 });
    t.at(0.9, () => {
      this.cine(true);
      const { c, dir } = this.stage(9);
      // side-on: Gojo's half of the frame is the void, Sukuna's the shrine
      p.anim.stance = GJ_SIGN;
      b.anim.stance = SK_SIGN;
      b.anim.play(SK_DOMAIN);
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const camPos = c.clone().addScaledVector(side, 9).setY(1.6);
      this.shot(camPos, camPos.clone().addScaledVector(side, -1.5), c.clone().setY(1.4), c.clone().setY(1.4), 12, [52, 46], 'lin');
      this.voidEnv.group.visible = false;
      this.shrineEnv.group.visible = true;
      SD.city.group.visible = false;
      SD.city.sky.mesh.visible = false;
      // the clash: one split screen, two worlds pushing on the line
      SD.renderer.splitScene = { scene: this.clashScene(), camera: SD.camera };
      SD.renderer.post.split = 1;
      const toward = new THREE.Vector3().subVectors(b.f.pos, p.f.pos).normalize();
      void toward;
      this.clash = { balance: 0, t: 0, beat: 0, nextBeat: 0.6, hits: 0, over: false };
      SD.hud?.clash(true, 0, 0);
      SD.audio?.play('chant', { volume: 1 });
      SD.music?.mix(1, 1, 0.6, 0.5);
    });
    t.end(0.95);
  }

  private clashSceneObj: THREE.Scene | null = null;
  /** The void as seen on Gojo's side of the split. */
  private clashScene() {
    if (!this.clashSceneObj) {
      const s = new THREE.Scene();
      const v = new VoidEnv();
      v.group.visible = true;
      s.add(v.group);
      s.add(new THREE.HemisphereLight(0x8fb4ff, 0x101830, 1.4));
      const d = new THREE.DirectionalLight(0xdfe8ff, 2);
      d.position.set(3, 6, 4);
      s.add(d);
      s.userData.env = v;
      this.clashSceneObj = s;
    }
    const s = this.clashSceneObj;
    // Gojo stands in his own world for the clash
    s.add(this.player().model.group);
    (s.userData.env as VoidEnv).aim(new THREE.Vector3().subVectors(this.player().f.pos, this.boss().f.pos));
    return s;
  }

  private updateClash(dt: number) {
    const c = this.clash;
    if (!c || c.over) return;
    c.t += dt;
    const beatLen = 0.5;
    const diff = this.boss().diff;
    if (c.t >= c.nextBeat) {
      c.nextBeat += beatLen;
      c.beat++;
      // Sukuna leans on the line every beat
      c.balance -= 0.05 * (0.6 + diff.aggression * 0.6);
      SD.audio?.play('taiko', { volume: 0.6 });
      this.player().cam.shake(0.12);
    }
    const toBeat = Math.min(Math.abs(c.t - (c.nextBeat - beatLen)), Math.abs(c.nextBeat - c.t));
    // one press per beat: on it pushes the line, off it (or mashing) gives ground
    const beatId = Math.round(c.t / beatLen);
    if (SD.input.mousePress(0) || SD.input.pressed('Space')) {
      const good = toBeat < 0.11 && c.usedBeat !== beatId;
      if (good) {
        c.usedBeat = beatId;
        const perfect = toBeat < 0.05;
        c.balance += perfect ? 0.13 : 0.1;
        c.hits++;
        SD.audio?.play('block', { volume: 0.7 });
        SD.hud?.ono(perfect ? 'ドンッ' : 'ドッ', null, perfect ? 1 : 0.8);
        this.player().cam.shake(0.1);
      } else {
        c.balance -= 0.03;
        SD.audio?.play('whiff', { volume: 0.5 });
      }
    }
    c.balance = THREE.MathUtils.clamp(c.balance, -1, 1);
    // the line between the worlds sits between the two of them and rides the balance
    const post = SD.renderer.post;
    const asp = SD.renderer.width / SD.renderer.height;
    const gp = this.player().aim(new THREE.Vector3()).project(SD.camera);
    const sp = this.boss().aim(new THREE.Vector3()).project(SD.camera);
    // the void belongs on Gojo's side of the frame
    const gojoLeft = gp.x < sp.x;
    post.splitAngle = gojoLeft ? Math.PI + 0.25 : 0.25;
    const n = new THREE.Vector2(Math.cos(post.splitAngle), Math.sin(post.splitAngle));
    const mid = new THREE.Vector2(((gp.x + sp.x) / 2) * 0.5 * asp, ((gp.y + sp.y) / 2) * 0.5);
    // pushing toward Sukuna moves the line away from Gojo
    post.splitPos = mid.dot(n) - c.balance * 0.4;
    post.aberration = 0.6 + Math.abs(c.balance) * 1.2;
    post.speed = 0.35;
    post.speedMode = 0;
    SD.hud?.clash(true, c.balance, 1 - Math.min(1, toBeat / (beatLen / 2)));
    // sparks and slashes on the seam
    if (Math.random() < 0.5) SD.fx.burst(_v.addVectors(this.player().f.pos, this.boss().f.pos).multiplyScalar(0.5).setY(rnd(0.5, 3)), _v.set(0, 1, 0), 6, 2.4, 2.4, 2.6, 10);
    if (c.t > 9 || Math.abs(c.balance) >= 1) {
      c.over = true;
      SD.hud?.clash(false, 0, 0);
      this.domainResult(c.balance > 0 ? 'void' : 'shrine', false);
    }
  }

  /** One domain swallows the other. */
  private domainResult(winner: 'void' | 'shrine', unanswered: boolean) {
    const p = this.player();
    const b = this.boss();
    SD.renderer.post.split = 0;
    SD.renderer.splitScene = null;
    // Gojo's body back into the real scene
    SD.scene.add(p.model.group);
    p.anim.stance = GJ_POCKETS;
    b.anim.stance = SK_IDLE;
    this.cine(false);
    this.clash = null;
    SD.city.group.visible = true;
    if (winner === 'void') {
      this.setEnv('void');
      this.shrineEnv.group.visible = false;
      SD.hud?.callout('無量空処', 'The void floods his mind', 'void', 2.6);
      SD.audio?.play('domainEnd', { volume: 0.4 });
      SD.audio?.play('purpleFire', { volume: 0.6 });
      b.stunFor(6.5);
      b.model.setExpr('shock');
      this.sureHit = { who: 'void', t: 7 };
      SD.music?.mix(0.4, 0.8, 1, 0.8);
    } else {
      this.setEnv('shrine');
      this.voidEnv.group.visible = false;
      SD.hud?.callout('伏魔御廚子', unanswered ? 'Sure-hit: nothing can stop the slashing' : 'Your domain shatters', 'sukuna', 2.6);
      SD.audio?.play('shrineLoop', { volume: 1 });
      this.sureHit = { who: 'shrine', t: 5 };
      SD.music?.mix(1, 0.4, 1, 0.8);
    }
    // the brain burns out on a domain either way
    p.burnout = unanswered ? 0 : 8;
    this.seq = null;
  }

  private updateSureHit(dt: number) {
    const s = this.sureHit;
    if (!s) return;
    s.t -= dt;
    const p = this.player();
    const b = this.boss();
    if (s.who === 'void') {
      // information overload: light streaming into his skull
      if (b.alive) {
        const h = b.aim(_v).add(V(0, 0.45, 0));
        for (let i = 0; i < 3; i++) {
          const a = rnd(0, Math.PI * 2);
          const q = h.clone().add(V(Math.cos(a) * rnd(1, 3), rnd(-1, 2), Math.sin(a) * rnd(1, 3)));
          SD.fx.streaks.emit(q.x, q.y, q.z, 0, 0, 0, 0.6, 0.02, 1.2, 1.6, 2.6, { center: h, pull: 120, stretch: 0.04 });
        }
      }
    } else {
      // the shrine cuts everything in reach, sure-hit
      this.shrineSlashT -= dt;
      if (this.shrineSlashT <= 0) {
        this.shrineSlashT = 0.12;
        const at = p.aim(new THREE.Vector3()).add(V(rnd(-1.5, 1.5), rnd(-1, 1), rnd(-1.5, 1.5)));
        const fwd = V(rnd(-1, 1), rnd(-0.3, 0.3), rnd(-1, 1)).normalize();
        const axis = V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).cross(fwd).normalize();
        SD.fx.slashes.flash({ pos: at, fwd, axis, len: rnd(1.5, 3.5), thick: 0.06, bulge: 0.3, color: [1.8, 0.4, 0.35] }, 0.2);
        if (p.alive) p.receive(makeHit('shrine', 11 * b.diff.dmg, p.aim(new THREE.Vector3()), fwd, { knock: 0, stun: 0, sure: true, source: b }));
        SD.audio?.play('dismantle', { volume: 0.6 });
        // and the street around is diced too
        const g = p.f.pos.clone().add(V(rnd(-20, 20), 0, rnd(-20, 20)));
        SD.fx.cuts.add(g.x - rnd(1, 4), g.z - rnd(1, 4), g.x + rnd(1, 4), g.z + rnd(1, 4), 0.07, 20);
      }
    }
    if (s.t <= 0) {
      this.sureHit = null;
      if (this.burnAfter > 0) {
        p.burnout = Math.max(p.burnout, this.burnAfter);
        this.burnAfter = 0;
        SD.hud?.hint('Burnout: your technique is scorched. Reverse Cursed Technique (F) heals the brain faster.', 4);
      }
      this.setEnv('city');
      this.shrineEnv.group.visible = false;
      SD.audio?.play('domainEnd', { volume: 0.9 });
      SD.music?.mix(1, 0.6, 0, 1.5);
      b.model.setExpr('neutral');
      if (b.alive) {
        SD.hud?.subtitle(s.who === 'void' ? '…やってくれたな' : 'ケヒッ', s.who === 'void' ? "...You've done it now." : 'Heh.', 'sukuna');
        if (s.who === 'void') b.anim.play(SK_LAUGH);
      }
    }
  }

  /** Gojo opens his domain on his own: it lands, or Sukuna answers with his. */
  playerDomain() {
    if (this.busy || this.clash || this.sureHit) return;
    const b = this.boss();
    const p = this.player();
    const near = b.alive && b.f.pos.distanceTo(p.f.pos) < 40;
    if (near && this.phase >= 2 && b.state !== 'stunned' && Math.random() < 0.65) {
      // 領域展開 — 伏魔御廚子: they meet in the middle
      SD.hud?.subtitle('領域展開', 'Domain Expansion.', 'sukuna', 1.6);
      this.shrineEnv.place(b.f.pos, new THREE.Vector3().subVectors(p.f.pos, b.f.pos));
      this.startClash();
      return;
    }
    this.setEnv('void');
    this.voidEnv.aim(new THREE.Vector3().subVectors(b.f.pos, p.f.pos));
    if (near) {
      b.stunFor(5.5);
      b.model.setExpr('shock');
    }
    if (this.maho?.alive && this.maho.f.pos.distanceTo(p.f.pos) < 40) this.maho.stunFor(4);
    this.sureHit = { who: 'void', t: 6 };
    SD.music?.mix(0.4, 0.8, 1, 0.8);
    p.burnout = 0;
    this.burnAfter = 8;
  }

  /** burnout handed to Gojo once his domain closes */
  private burnAfter = 0;

  // ---------------------------------------------------------------- 魔虚羅
  summonMahoraga() {
    const b = this.boss();
    const p = this.player();
    const t = new Timeline();
    this.seq = t;
    t.at(0, () => {
      this.cine(true);
      const { dir } = this.stage(22);
      b.anim.play(SK_SUMMON);
      const bp = b.f.pos;
      const side = V(-dir.z, 0, dir.x);
      this.shot(bp.clone().addScaledVector(dir, 2.8).addScaledVector(side, -0.8).setY(1.5), bp.clone().addScaledVector(dir, 2.2).addScaledVector(side, -0.4).setY(1.45), bp.clone().setY(1.35), bp.clone().setY(1.3), 2.6, [40, 34]);
      SD.renderer.post.manga = 1;
      SD.hud?.subtitle('布瑠部由良由良', 'Furube yura yura...', 'sukuna', 2.6);
      SD.music?.duck(0.2, 0.4);
      SD.audio?.play('gong', { volume: 1 });
    });
    t.during(0, 2.6, () => (SD.renderer.post.manga = 1));
    t.at(2.6, () => {
      // the shadow pools, the wheel turns up first, then the General rises
      const dir = V(Math.sin(b.yaw), 0, Math.cos(b.yaw));
      const at = b.f.pos.clone().addScaledVector(dir, 5).addScaledVector(V(-dir.z, 0, dir.x), 4);
      this.maho = new Mahoraga(at.x, at.z, p, b.diff);
      this.maho.cine(true);
      this.maho.yaw = Math.atan2(p.f.pos.x - at.x, p.f.pos.z - at.z);
      this.maho.f.place(at.x, -5, at.z);
      SD.enemies.push(this.maho);
      this.maho.onEvent = (e) => {
        if (e === 'dead') this.mahoDown();
      };
      SD.fx.crater(at.clone().setY(0.2), V(0, 1, 0), 9);
      SD.fx.dustRing(at.x, 0.2, at.z, 6, 40, 10);
      const lookAt = at.clone().setY(3.5);
      const from = at.clone().addScaledVector(V(Math.sin(this.maho.yaw), 0, Math.cos(this.maho.yaw)), 11).setY(0.6);
      this.shot(from, from.clone().add(V(0, 0.4, 0)), lookAt.clone().setY(1), lookAt, 3.4, [50, 44], 'out');
      SD.audio?.play('collapse', { volume: 1 });
    });
    t.during(2.6, 4.6, (k) => {
      const m = this.maho!;
      m.f.place(m.f.pos.x, -5 + 5 * (1 - Math.pow(1 - k, 3)), m.f.pos.z);
      m.model.group.position.copy(m.f.pos);
      p.cam.shake(0.05);
    });
    t.at(4.6, () => {
      this.maho!.roar();
      SD.hud?.callout('八握剣異戒神将魔虚羅', 'Eight-Handled Sword Divergent Sila Divine General Mahoraga', 'sukuna', 3);
      SD.renderer.post.impact = 1.1;
      SD.renderer.post.impactColor.setRGB(0.9, 0.85, 0.7);
      p.cam.shake(0.8);
      SD.music?.duck(1, 0.3);
      SD.music?.mix(1, 1, 0, 0.5);
    });
    t.at(6.8, () => {
      this.cine(false);
      this.maho!.cine(false);
      SD.hud?.hint('Mahoraga adapts: every hit it takes — and every blow Infinity stops — turns the wheel.', 5);
    });
    t.end(6.9);
  }

  private mahoDown() {
    const m = this.maho;
    if (!m) return;
    SD.hud?.callout('調伏', 'The General falls', '', 2.2);
    SD.audio?.play('collapse', { volume: 1.3 });
    // it kneels, then sinks back into the shadows
    const t = new Timeline();
    t.during(3, 6, (k) => {
      m.model.group.position.y = m.f.pos.y - k * 6;
      if (Math.random() < 0.5) SD.fx.ink.emit(m.f.pos.x + rnd(-2, 2), 0.3, m.f.pos.z + rnd(-2, 2), 0, rnd(1, 3), 0, rnd(0.5, 1), rnd(0.5, 1.2), 0.1, 0.02, 0.0, 0.03, 0.8, 0.05, 0, 0.05, 0, 0.5, -0.1);
    });
    t.at(6, () => {
      m.dispose();
      if (this.maho === m) this.maho = null;
    });
    this.after.push(t);
  }

  /** Background timelines that run alongside gameplay. */
  private after: Timeline[] = [];

  // ---------------------------------------------------------------- 世界を断つ斬撃
  finale() {
    const b = this.boss();
    const p = this.player();
    const t = new Timeline();
    this.seq = t;
    t.at(0, () => {
      this.cine(true);
      const { dir } = this.stage(26);
      b.anim.stance = SK_IDLE;
      b.anim.play(SK_LAUGH);
      b.model.setExpr('grin');
      const bp = b.f.pos;
      this.shot(bp.clone().addScaledVector(dir, 4).setY(1.3), bp.clone().addScaledVector(dir, 3).setY(1.5), bp.clone().setY(1.5), bp.clone().setY(1.6), 2.4, [40, 34]);
      SD.hud?.subtitle('魔虚羅は見せてくれた', 'Mahoraga showed me the way.', 'sukuna', 2.4);
      SD.music?.duck(0.25, 0.4);
    });
    t.at(2.4, () => {
      b.anim.play(SK_CHANT_CLIP);
      SD.renderer.post.manga = 1;
      SD.hud?.subtitle('世界ごと断てばいい', "If I can't cut you, I'll cut the world.", 'sukuna', 2.6);
    });
    t.during(2.4, 5, () => (SD.renderer.post.manga = 1));
    // the skyline behind Gojo, a breath of stillness, then one line through all of it
    const cut = { n: V(0, 1, 0), d: 0, dir: V(0, 0, 1) };
    t.at(5, () => {
      SD.renderer.post.manga = 0;
      const dir = V(Math.sin(b.yaw), 0, Math.cos(b.yaw));
      const side = V(-dir.z, 0, dir.x);
      cut.dir.copy(dir);
      cut.n.set(0, 1, 0).addScaledVector(side, 0.36).addScaledVector(dir, -0.05).normalize();
      cut.d = cut.n.dot(p.f.pos.clone().addScaledVector(dir, 70).setY(34));
      const from = p.f.pos.clone().addScaledVector(dir, -14).setY(2.2);
      this.shot(from, from.clone().add(V(0, 1.2, 0)).addScaledVector(dir, 2), p.f.pos.clone().addScaledVector(dir, 40).setY(30), p.f.pos.clone().addScaledVector(dir, 60).setY(34), 4.2, [62, 60], 'lin');
      SD.music?.duck(0.0, 0.3);
      SD.audio?.play('wind', { volume: 0.6 });
    });
    t.at(5.7, () => {
      SD.world.slice(cut.n, cut.d, null, cut.dir, 'wcs', 1.0);
      this.cutFlash(cut.n, cut.d);
      SD.audio?.play('wcs', { volume: 1.5 });
      SD.renderer.post.flash = 0.35;
      SD.timing.hitstop(0.08);
      p.cam.shake(0.5);
      SD.hud?.callout('世界を断つ斬撃', 'The World-Cutting Slash', 'sukuna', 3);
    });
    t.at(6.7, () => {
      p.cam.shake(0.9);
      SD.audio?.play('collapse', { volume: 1.4 });
    });
    t.at(8.4, () => {
      this.cine(false);
      SD.music?.duck(1, 0.5);
      SD.music?.mix(1, 1, 0.3, 1);
      SD.hud?.hint('His last trump card: when the red line runs through you, get out of it — or break his chant.', 5);
      SD.hud?.hint2?.('Hold R: the 200% Hollow Purple — 九綱・偏光・烏と声明・表裏の間', 6);
    });
    t.end(8.5);
  }

  /** Sukuna chants the cut in phase 4: the plane is shown, then it falls. */
  telegraphWCS(n: THREE.Vector3, d: number, origin: THREE.Vector3, fwd: THREE.Vector3) {
    if (this.wcs) {
      this.wcs.n.copy(n);
      this.wcs.d = d;
      return;
    }
    this.wcs = { n, d, t: 0, locked: false, origin, fwd };
  }

  /** A cut has happened along n·x = d: trace it white across everything. */
  cutFlash(n: THREE.Vector3, d: number) {
    this.cutFx = { n: n.clone(), d, t: 0 };
  }

  updateWCS(dt: number) {
    const post = SD.renderer.post;
    const w = this.wcs;
    if (w) {
      w.t += dt;
      // a red thread through the street, buildings and sky, beating faster as the chant closes
      const beat = 0.5 + 0.5 * Math.sin(w.t * (8 + w.t * 5));
      post.cutLine = 0.6 + 0.4 * beat;
      post.cutPlane.set(w.n.x, w.n.y, w.n.z, w.d);
      post.cutColor.setRGB(1, 0.06, 0.05);
      post.cutWidth = 1.6 + beat * 1.2;
      return;
    }
    const c = this.cutFx;
    if (c) {
      c.t += dt;
      const k = c.t / 2.2;
      post.cutPlane.set(c.n.x, c.n.y, c.n.z, c.d);
      // white-hot, then a thin seam that lingers
      const hot = Math.max(0, 1 - c.t / 0.7);
      const w = 0.85 + hot * 0.15;
      post.cutColor.setRGB(w, w, w * 1.02);
      post.cutWidth = 1.5 + hot * 3.5;
      post.cutLine = k < 1 ? 1 - k * k * k : 0;
      if (k >= 1) this.cutFx = null;
      return;
    }
    post.cutLine = 0;
  }

  clearWCS() {
    this.wcs = null;
  }

  // ---------------------------------------------------------------- endings
  victory(onDone: () => void) {
    const b = this.boss();
    const p = this.player();
    const t = new Timeline();
    this.seq = t;
    t.at(0, () => {
      SD.timing.slowmo(1.2, 0.15, 0.6);
      SD.renderer.post.manga = 1;
      SD.audio?.play('gong', { volume: 1.2 });
      SD.music?.duck(0.15, 1.5);
    });
    t.at(1.0, () => {
      this.cine(true);
      const { dir } = this.stage(7);
      b.anim.stop();
      b.anim.stance = KNEEL;
      b.model.setExpr('hurt');
      p.anim.stance = GJ_POCKETS;
      const side = V(-dir.z, 0, dir.x);
      const mid = p.f.pos.clone().lerp(b.f.pos, 0.5);
      this.shot(mid.clone().addScaledVector(side, 7).setY(1.2), mid.clone().addScaledVector(side, 5.5).setY(1.6), mid.clone().setY(1.2), mid.clone().setY(1.3), 4, [44, 40]);
      SD.hud?.subtitle('…見事だ　五条悟', '...Magnificent, Satoru Gojo.', 'sukuna', 3.2);
    });
    t.at(4.4, () => {
      const pp = p.f.pos;
      const dir = V(Math.sin(p.yaw + Math.PI), 0, Math.cos(p.yaw + Math.PI));
      this.shot(pp.clone().addScaledVector(dir, 1.6).setY(1.75), pp.clone().addScaledVector(dir, 1.25).setY(1.78), pp.clone().setY(1.76), pp.clone().setY(1.78), 3.4, [36, 30], 'io', -0.22);
      p.model.setExpr('smirk');
      SD.hud?.subtitle('大丈夫　僕　最強だから', "Don't worry. I'm the strongest.", 'gojo', 3.4);
      SD.renderer.post.manga = 0;
    });
    t.at(7.8, () => onDone());
    t.end(7.9);
  }

  defeat(onDone: () => void) {
    const b = this.boss();
    const p = this.player();
    const t = new Timeline(true);
    this.seq = t;
    t.at(0, () => {
      SD.timing.slowmo(2, 0.1, 0.5);
      SD.audio?.play('wcs', { volume: 1.2 });
      SD.renderer.post.sliceAngle = 0.35;
      SD.renderer.post.sliceOffset = 0;
      SD.music?.duck(0.0, 2);
    });
    t.during(0.4, 2.4, (k) => (SD.renderer.post.slice = k));
    t.at(2.6, () => {
      SD.renderer.post.slice = 0;
      this.cine(true);
      // Gojo has fallen a few paces off; Sukuna stands over the street
      const { dir } = this.stage(7);
      p.anim.stop();
      p.anim.stance = DOWN;
      p.model.setExpr('closed');
      b.anim.stop();
      b.anim.stance = SK_IDLE;
      b.model.setExpr('smirk');
      const bp = b.f.pos.clone();
      // dir runs from Gojo to Sukuna: the camera stands off Sukuna's shoulder, looking back at his face
      const side = V(-dir.z, 0, dir.x);
      const c0 = bp.clone().addScaledVector(dir, -1.9).addScaledVector(side, 0.9);
      const c1 = bp.clone().addScaledVector(dir, -1.5).addScaledVector(side, 0.65);
      this.shot(c0.setY(b.f.pos.y + 1.5), c1.setY(b.f.pos.y + 1.56), bp.clone().setY(b.f.pos.y + 1.5), bp.clone().setY(b.f.pos.y + 1.55), 4.8, [36, 31], 'io', 0.22);
      SD.renderer.post.manga = 1;
      SD.hud?.subtitle('天晴れだ　五条悟', 'Splendid, Satoru Gojo.', 'sukuna', 2.2);
    });
    t.during(2.6, 7, () => (SD.renderer.post.manga = 1));
    t.at(4.8, () => SD.hud?.subtitle('生涯貴様を忘れることはないだろう', 'I shall never forget you for as long as I live.', 'sukuna', 2.6));
    t.at(7.4, () => onDone());
    t.end(7.5);
    void p;
  }

  // ---------------------------------------------------------------- frame
  update(dt: number, realDt: number) {
    if (this.seq && !this.seq.done) this.seq.update(this.seq.real ? realDt : dt);
    for (let i = this.after.length - 1; i >= 0; i--) {
      this.after[i].update(dt);
      if (this.after[i].done) this.after.splice(i, 1);
    }
    this.updateAnswer(realDt);
    this.updateClash(dt);
    this.updateSureHit(dt);
    this.updateEnv(dt);
    this.updateWCS(dt);
    this.updateAttract(dt);
    if (this.maho) {
      this.maho.update(dt);
      // dead, it no longer moves the story; while sinking the timeline owns the model
      if (!this.maho.alive) this.maho.model.group.position.x = this.maho.f.pos.x;
    }
  }
}

/** Chant poses strung together for the finale's speech. */
const SK_CHANT_CLIP = {
  name: 'chantSpeech',
  fadeIn: 0.3,
  fadeOut: 0.4,
  keys: [
    { t: 0, p: SK_IDLE },
    { t: 0.6, e: 'io' as const, p: SK_CHANT1 },
    { t: 2.4, e: 'io' as const, p: SK_IDLE },
  ],
};

void Animator;
void GJ_PURPLE;
