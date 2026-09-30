import * as THREE from 'three';
import type { Game } from '../game/Game';
import type { Customer } from '../game/Customer';
import { buildRevolver, buildShooterHand, muzzleFlashTexture, RevolverParts } from './Revolver';
import { Gore, surfaceAt } from '../fx/Gore';
import { Ragdoll } from '../physics/Ragdoll';
import { Spring } from '../core/Tween';
import { h } from '../ui/dom';
import { discard } from '../world/Builder';
import { Ease, clamp, damp, pick, rand } from '../core/math';

/**
 * The revolver at the order counter: a first-person viewmodel that follows
 * the cursor, six rounds, hitscan shots with a full aftermath (ragdolls,
 * blood, bullet holes, brass at reload), panicked customers and all of the
 * bookkeeping that keeps the diner running afterwards.
 */

type Phase = 'holstered' | 'drawing' | 'ready' | 'firing' | 'reloading' | 'holstering';
type Part = 'head' | 'hat' | 'torso' | 'limb';
type Surface = 'glass' | 'metal' | 'wood' | 'plaster';

interface CustomerHit {
  kind: 'customer';
  c: Customer;
  part: Part;
  bone: THREE.Object3D;
  point: THREE.Vector3;
  distance: number;
}

interface WorldHit {
  kind: 'world';
  point: THREE.Vector3;
  normal: THREE.Vector3;
  surface: Surface;
  color: THREE.Color;
  distance: number;
}

type Hit = CustomerHit | WorldHit;

interface Victim {
  c: Customer;
  part: Part;
  bone: THREE.Object3D;
  /** wound position in the bone's space */
  local: THREE.Vector3;
  t: number;
  drip: number;
  pooled: boolean;
}

/** where the grip sits in camera space */
const HIP = new THREE.Vector3(0.16, -0.165, -0.38);
const FIRE_GAP = 0.34;
const RELOAD_TIME = 1.95;

const PANIC_LINES = ['AAAAH!', 'RUN!', "He's got a gun!", 'Call the cops!', 'I just wanted a burger!', 'Nope nope nope!', 'Every man for himself!', 'MOMMY!', 'HELP!', 'Not the face!'];
const AIMED_LINES = ['Whoa, whoa, whoa!', 'Easy there, chef!', 'Is that thing loaded?!', "I'll pay extra!", 'Hey! Not cool!', 'Okay okay okay!', "I'll come back later…", 'What kind of diner is this?!'];
const DRAW_LINES = ['Uh… is that a gun?', 'Wait, what?!', 'Is this part of the service?', "That's not on the menu!"];

const REVOLVER_ICON = `<svg viewBox="0 0 64 40" aria-hidden="true"><path fill="currentColor" d="M3 9h36l2-3h6l2 3h12v7H49l-2 3H33l-2 5-4 1-1 5-2 9c-.3 1.4-1.4 2-2.8 2h-7c-1.6 0-2.6-1.4-2.2-3l3-12c.3-1.3-.4-2.6-1.7-3L3 19z"/><circle cx="36" cy="13" r="4.4" fill="var(--paper)"/><path fill="none" stroke="currentColor" stroke-width="2.4" d="M27 22c0 4 2 6 6 6"/></svg>`;

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);
const FWD = new THREE.Vector3(0, 0, -1);

export class Gunplay {
  readonly gore: Gore;
  phase: Phase = 'holstered';
  private phaseT = 0;
  private parts: RevolverParts;
  /** camera-space rig: view → sway → aim → kick → gun */
  private view = new THREE.Group();
  private sway = new THREE.Group();
  private aim = new THREE.Group();
  private kickG = new THREE.Group();
  private flash: THREE.Sprite;
  private flashSide: THREE.Group;
  private light: THREE.PointLight;
  private tracer: THREE.Mesh;
  private tracerT = 0;
  private flashT = 0;
  private smokeT = 0;
  private loaded = 6;
  private drawAmt = 0;
  private lower = 0;
  private reloadPose = 0;
  private hammer = 0;
  private trigger = 0;
  private crane = 0;
  private cylAngle = 0;
  private cylTarget = 0;
  private kickRot = new Spring(0, 260, 15);
  private kickBack = new Spring(0, 330, 21);
  private swayV = new THREE.Vector2();
  private lastNdc = new THREE.Vector2();
  private aimQ = new THREE.Quaternion();
  private time = 0;
  private raycaster = new THREE.Raycaster();
  private hover: CustomerHit | null = null;
  private aimTime = new Map<Customer, number>();
  private spoken = new Set<Customer>();
  private victims: Victim[] = [];
  private reloadStep = 0;
  private shotsToday = 0;
  private kidWarnAt = -9;
  // DOM
  private dock: HTMLElement;
  private ammoEl: HTMLElement;
  private rounds: HTMLElement[] = [];
  private btn: HTMLButtonElement;
  private crosshair: HTMLElement;
  private hint: HTMLElement;
  private pointer = { x: -100, y: -100 };
  private pointerType = 'mouse';
  private pointerSeen = false;

  constructor(private game: Game) {
    const engine = game.engine;
    this.gore = new Gore(engine.scene, game.fx);
    this.gore.onSound = (kind, at, strength) => {
      const id = kind === 'drip' ? 'drip' : kind === 'gib' ? 'gibSplat' : kind === 'casing' ? 'casing' : 'limbThud';
      this.sound(id, at, (kind === 'casing' ? 0.5 : 0.3) + strength * 0.5, rand(0.9, 1.12));
    };
    this.raycaster.params.Line = { threshold: 0.001 };
    this.raycaster.params.Points = { threshold: 0.001 };

    // ---- viewmodel
    this.parts = buildRevolver();
    const gun = new THREE.Group();
    gun.add(this.parts.root, buildShooterHand());
    gun.position.set(0, 0.085, -0.08); // the grip sits on the kick pivot
    gun.traverse((o) => {
      o.frustumCulled = false; // camera-attached: never culled by a stale bound
    });
    this.kickG.add(gun);
    this.aim.add(this.kickG);
    this.sway.add(this.aim);
    this.view.add(this.sway);
    this.view.position.copy(HIP);
    this.view.scale.setScalar(1.1);
    this.view.visible = false;
    engine.camera.add(this.view);

    // ---- muzzle flash: a camera-facing burst plus a side-on flame cross
    const flashTex = muzzleFlashTexture();
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.flash.visible = false;
    this.flash.scale.setScalar(0.12);
    this.parts.muzzle.add(this.flash);
    this.flashSide = new THREE.Group();
    const sideMat = new THREE.MeshBasicMaterial({ map: flashTex, color: 0xffc27a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    // two planes that both contain the bore axis, stretched along it
    for (const rot of [[Math.PI / 2, 0], [0, Math.PI / 2]]) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sideMat);
      q.rotation.set(rot[0], rot[1], 0);
      this.flashSide.add(q);
    }
    this.flashSide.scale.set(0.05, 0.05, 0.16);
    this.flashSide.position.z = -0.08;
    this.flashSide.visible = false;
    this.parts.muzzle.add(this.flashSide);
    // in the scene from boot (intensity 0) so lit shaders never recompile
    this.light = new THREE.PointLight(0xffb060, 0, 6, 2);
    this.light.castShadow = false;
    engine.scene.add(this.light);
    // a brief hot streak along the bullet's path
    const tracerGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 1, 6, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    this.tracer = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffe2a8, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
    this.tracer.visible = false;
    this.tracer.frustumCulled = false;
    engine.scene.add(this.tracer);

    // ---- HUD: the draw button + a cylinder showing the rounds left
    this.ammoEl = h('div', { class: 'gun-ammo' });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const r = h('i', { style: { left: `${50 + Math.cos(a) * 30}%`, top: `${50 + Math.sin(a) * 30}%` } });
      this.rounds.push(r);
      this.ammoEl.append(r);
    }
    this.btn = h('button', { class: 'icon-btn gun-btn', title: 'Revolver (G)', html: REVOLVER_ICON }) as HTMLButtonElement;
    this.btn.append(h('span', { class: 'key' }, 'G'));
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    this.hint = h('div', { class: 'gun-hint' }, 'Click to fire · R reload · G holster');
    this.dock = h('div', { class: 'gun-dock' }, this.ammoEl, this.btn, this.hint);
    game.ui.hud.append(this.dock);
    this.crosshair = h('div', { class: 'crosshair', html: `<svg viewBox="-32 -32 64 64"><circle r="12" /><path d="M0-25v9M0 25v-9M-25 0h9M25 0h-9" /><circle class="dot" r="1.8" /><path class="nogo" d="M-15-15 15 15" /><path class="mark" d="M-9-9-4-4M9-9 4-4M-9 9-4 4M9 9 4 4" /></svg>` });
    game.ui.root.append(this.crosshair);
    this.renderAmmo();

    // ---- input
    window.addEventListener('pointermove', (e) => {
      this.pointerType = e.pointerType;
      // a finger resting on a HUD button is not aiming anywhere
      if (e.pointerType !== 'mouse' && e.target !== engine.canvas) return;
      this.pointerSeen = true;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.crosshair.style.translate = `${e.clientX}px ${e.clientY}px`;
    });
    engine.canvas.addEventListener('pointerdown', (e) => {
      this.pointerType = e.pointerType;
      if (!this.armed || e.button !== 0 || game.engine.paused) return;
      this.pointerSeen = true;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.crosshair.style.translate = `${e.clientX}px ${e.clientY}px`;
      this.syncNdc();
      this.trigger1();
    });
    engine.onUpdate((dt) => this.update(dt), 95);
  }

  // ------------------------------------------------------------------ state
  get armed(): boolean {
    return this.phase !== 'holstered';
  }

  private get allowed(): boolean {
    const g = this.game;
    return g.progress.data.settings.revolver && g.state === 'day' && g.station === 'order' && !g.rig.transitioning && !g.stations.order.taking;
  }

  toggle() {
    if (this.phase === 'holstered') this.draw();
    else this.holster();
  }

  draw() {
    if (this.phase !== 'holstered' || !this.allowed) return;
    const g = this.game;
    this.setPhase('drawing');
    this.view.visible = true;
    this.hammer = 0;
    g.input.cancel();
    g.input.enabled = false;
    g.ui.hoverLabel(null);
    g.rig.zoom = 0.94;
    g.rig.aimLook = 1;
    g.rig.lookPitch = -0.1; // lean in and look down over the counter a little
    g.rig.lean.set(0.02, 0.18, 0.3);
    g.audio.play('gunDraw', { volume: 0.8 });
    g.engine.canvas.classList.add('aiming');
    if (!this.pointerSeen || this.pointerType !== 'mouse') {
      // nothing aimed yet (touch screens): start from the middle of the view
      const r = g.engine.canvas.getBoundingClientRect();
      this.pointer.x = r.left + r.width / 2;
      this.pointer.y = r.top + r.height * 0.45;
      this.crosshair.style.translate = `${this.pointer.x}px ${this.pointer.y}px`;
    }
    this.crosshair.classList.add('on');
    this.dock.classList.add('armed');
    this.spoken.clear();
    // whoever is at the counter notices
    const c = g.customers.atCounter;
    if (c && !c.def.app.kid) {
      g.engine.tweens.wait(0.35).then(() => {
        if (!this.armed || c.state !== 'atCounter') return;
        c.setExpression('surprised');
        c.gesture('handsUp', 2.2);
        g.ui.speech.say(c, pick(DRAW_LINES), { duration: 1.8 });
        g.audio.voice(c.def.p, 'sad', 0.7);
        g.ui.speech.emote(c, 'exclaim');
        this.spoken.add(c);
      });
    }
  }

  holster(instant = false) {
    if (this.phase === 'holstered' || (this.phase === 'holstering' && !instant)) return;
    if (this.phase === 'reloading') this.finishReload();
    if (instant) this.stow();
    else {
      this.setPhase('holstering');
      this.game.audio.play('gunHolster', { volume: 0.7 });
    }
    const g = this.game;
    g.rig.zoom = 1;
    g.rig.aimLook = 0;
    g.rig.lean.set(0, 0, 0);
    g.engine.canvas.classList.remove('aiming');
    this.crosshair.classList.remove('on', 'target', 'nogo');
    this.dock.classList.remove('armed');
  }

  private stow() {
    this.setPhase('holstered');
    this.view.visible = false;
    this.drawAmt = 0;
    this.flash.visible = false;
    this.flashSide.visible = false;
    this.light.intensity = 0;
    const g = this.game;
    // hand the pointer back to the station (unless a camera move owns it)
    if (!g.rig.transitioning && (g.state === 'day' || g.state === 'closing')) g.input.enabled = true;
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.phaseT = 0;
  }

  /** New day / quit to title: everything back to square one. */
  reset() {
    this.holster(true);
    this.loaded = 6;
    this.cylAngle = this.cylTarget = 0;
    this.crane = 0;
    for (const r of this.parts.rounds) r.visible = true;
    this.victims.length = 0;
    this.aimTime.clear();
    this.spoken.clear();
    this.gore.clear();
    this.game.engine.timeScale = 1;
    this.game.audio.musicRestore();
    this.shotsToday = 0;
    this.renderAmmo();
  }

  // ------------------------------------------------------------------ firing
  private syncNdc() {
    const r = this.game.engine.canvas.getBoundingClientRect();
    tmpV.set(((this.pointer.x - r.left) / r.width) * 2 - 1, -((this.pointer.y - r.top) / r.height) * 2 + 1, 0);
    this.raycaster.setFromCamera(new THREE.Vector2(tmpV.x, tmpV.y), this.game.engine.camera);
  }

  /** Trigger pull: fire, dry-fire, or refuse (kids are off limits). */
  private trigger1() {
    if (this.phase !== 'ready') return;
    const g = this.game;
    const hit = this.trace();
    if (hit?.kind === 'customer' && hit.c.def.app.kid && hit.c.state !== 'dead') {
      if (this.time - this.kidWarnAt > 1.2) {
        this.kidWarnAt = this.time;
        g.audio.play('error', { volume: 0.6 });
        g.ui.floatText('Not the kids!', this.pointer.x, this.pointer.y - 30, 'bad');
      }
      return;
    }
    if (this.loaded <= 0) {
      this.setPhase('firing');
      this.hammer = 0;
      this.trigger = 1;
      g.audio.play('dryFire');
      this.hint.textContent = 'Empty! Reloading…';
      g.engine.tweens.wait(0.3).then(() => {
        if ((this.phase === 'ready' || this.phase === 'firing') && this.loaded <= 0) this.reload();
      });
      return;
    }
    this.shoot(hit);
  }

  private shoot(hit: Hit | null) {
    const g = this.game;
    const cam = g.engine.camera;
    this.loaded--;
    this.shotsToday++;
    this.renderAmmo();
    this.setPhase('firing');
    this.hammer = 0;
    this.trigger = 1;
    // bang
    g.audio.play('gunshot', { rate: rand(0.94, 1.05) });
    g.audio.musicCut(9);
    g.rig.kick(rand(0.9, 1.15), rand(-0.25, 0.25));
    g.rig.addTrauma(0.32);
    g.rig.punch(0.025);
    g.ctx.haptic(35);
    this.kickRot.kick(rand(8.5, 10));
    this.kickBack.kick(1.5);
    this.flashT = 0.06;
    this.smokeT = 1.4;
    this.flash.visible = true;
    this.flash.material.rotation = rand(0, Math.PI * 2);
    this.flash.scale.setScalar(rand(0.1, 0.15));
    this.flashSide.visible = true;
    this.flashSide.rotation.z = rand(0, Math.PI);
    this.light.intensity = 9;
    this.parts.muzzle.getWorldPosition(this.light.position);
    g.engine.post.grade.setFlashColor(new THREE.Color(1, 0.86, 0.62));
    g.engine.post.grade.flash = 0.07;
    if (g.ui.tutorialActive) g.ui.tutorial.stop();
    // tracer from the muzzle to wherever the round stops
    const from = this.parts.muzzle.getWorldPosition(new THREE.Vector3());
    const to = hit ? hit.point.clone() : this.raycaster.ray.at(40, new THREE.Vector3());
    this.showTracer(from, to);
    if (hit?.kind === 'customer') this.hitCustomer(hit);
    else if (hit) this.hitWorld(hit);
    this.alarm();
    void cam;
  }

  private showTracer(from: THREE.Vector3, to: THREE.Vector3) {
    const len = from.distanceTo(to);
    if (len < 0.3) return;
    this.tracer.position.copy(from);
    this.tracer.lookAt(to);
    this.tracer.scale.set(1, 1, len);
    this.tracer.visible = true;
    this.tracerT = 0.05;
  }

  reload() {
    if ((this.phase !== 'ready' && this.phase !== 'firing') || this.loaded >= 6) return;
    this.setPhase('reloading');
    this.reloadStep = 0;
    this.hint.textContent = 'Reloading…';
    this.dock.classList.add('reloading');
  }

  private finishReload() {
    this.loaded = 6;
    this.crane = 0;
    this.reloadPose = 0;
    for (const r of this.parts.rounds) r.visible = true;
    this.hammer = 1;
    this.hint.textContent = 'Click to fire · R reload · G holster';
    this.dock.classList.remove('reloading');
    this.renderAmmo();
  }

  // ------------------------------------------------------------------ hit tests
  /** Closest customer under the pointer (bodies included), cheap per frame. */
  private pickCustomer(): CustomerHit | null {
    const ray = this.raycaster.ray;
    let best: CustomerHit | null = null;
    for (const c of this.game.customers.list) {
      if (c.state === 'gone') continue;
      const center = c.ragdoll ? c.ragdoll.get(Ragdoll.PELVIS, tmpV2) : tmpV2.copy(c.pos).setY(0.9);
      if (!ray.intersectsSphere(new THREE.Sphere(center, 1.15))) continue;
      const hits = this.raycaster.intersectObject(c.root, true);
      for (const hh of hits) {
        if (!c.model.owns(hh.object) || !visibleChain(hh.object)) continue;
        if (!best || hh.distance < best.distance) best = this.customerHit(c, hh);
        break;
      }
    }
    return best;
  }

  private customerHit(c: Customer, hh: THREE.Intersection): CustomerHit {
    const r = c.model.rig;
    let part: Part = 'limb';
    let bone: THREE.Object3D = r.chest;
    for (let o: THREE.Object3D | null = hh.object; o && o !== r.root; o = o.parent) {
      if (o === r.hatGroup) {
        part = 'hat';
        bone = r.head;
        break;
      }
      if (o === r.head || o === r.neck) {
        part = 'head';
        bone = r.head;
        break;
      }
      if (o === r.chest || o === r.spine || o === r.pelvis) {
        part = 'torso';
        bone = o;
        break;
      }
      if (([r.shoulderL, r.shoulderR, r.elbowL, r.elbowR, r.handL, r.handR, r.hipL, r.hipR, r.kneeL, r.kneeR, r.footL, r.footR] as THREE.Object3D[]).includes(o)) {
        part = 'limb';
        bone = o;
        break;
      }
    }
    return { kind: 'customer', c, part, bone, point: hh.point.clone(), distance: hh.distance };
  }

  /** Full trace for a shot: the first thing the round meets, customer or diner. */
  private trace(): Hit | null {
    const g = this.game;
    const roots = new Map<THREE.Object3D, Customer>();
    for (const c of g.customers.list) if (c.state !== 'gone') roots.set(c.root, c);
    const hits = this.raycaster.intersectObject(g.world.root, true);
    for (const hh of hits) {
      const o = hh.object as THREE.Mesh;
      if (!(o as THREE.Mesh).isMesh || !visibleChain(o)) continue;
      // whose is it?
      let owner: Customer | undefined;
      for (let p: THREE.Object3D | null = o; p; p = p.parent) {
        owner = roots.get(p);
        if (owner) break;
      }
      if (owner) {
        if (!owner.model.owns(o)) continue; // held food, trays: the round passes by
        return this.customerHit(owner, hh);
      }
      const mat = (Array.isArray(o.material) ? o.material[hh.face?.materialIndex ?? 0] : o.material) as THREE.MeshStandardMaterial & { transmission?: number };
      if (!mat || mat.blending === THREE.AdditiveBlending || (mat.transparent && !mat.depthWrite && mat.opacity < 0.2)) continue;
      if ((mat as THREE.Material).type === 'MeshBasicMaterial' && mat.transparent) continue; // light shafts, shadow blobs
      const normal = hh.face ? hh.face.normal.clone().transformDirection(hitMatrix(hh)) : this.raycaster.ray.direction.clone().negate();
      if (normal.dot(this.raycaster.ray.direction) > 0) normal.negate();
      let surface: Surface = 'plaster';
      if ((mat.transparent && mat.opacity < 0.6) || (mat.transmission ?? 0) > 0.2) surface = 'glass';
      else if ((mat.metalness ?? 0) > 0.6) surface = 'metal';
      else if (normal.y > 0.6 && hh.point.y > 0.5) surface = 'wood';
      return { kind: 'world', point: hh.point.clone(), normal, surface, color: (mat.color ?? new THREE.Color(0xdddddd)).clone(), distance: hh.distance };
    }
    return null;
  }

  // ------------------------------------------------------------------ impacts
  private hitWorld(hit: WorldHit) {
    const fx = this.game.fx;
    const at = hit.point;
    this.gore.bulletHole(at, hit.normal, hit.surface === 'glass');
    const out = hit.normal.clone().multiplyScalar(0.9);
    switch (hit.surface) {
      case 'glass':
        this.sound('glassCrack', at, 0.9);
        fx.burst('spark', at, 6, { color: 0xffffff, color1: 0xbfe4ff, size: 0.012, vel: out });
        break;
      case 'metal':
        this.sound('metalHit', at, 0.9);
        fx.burst('spark', at, 14, { vel: out.clone().multiplyScalar(1.6), size: 0.016 });
        if (Math.random() < 0.55) this.sound('ricochet', at, 0.8);
        break;
      case 'wood':
        this.sound('woodHit', at, 0.9);
        fx.burst('puff', at, 5, { vel: out, color: hit.color.getHex(), size: 0.03, size1: 0.1 });
        fx.burst('drop', at, 7, { vel: out.clone().multiplyScalar(1.5), color: hit.color.clone().multiplyScalar(0.7).getHex(), size: 0.008, floor: 0.01 });
        break;
      default:
        this.sound('plasterHit', at, 0.9);
        fx.burst('puff', at, 8, { vel: out, color: hit.color.clone().lerp(new THREE.Color(0xffffff), 0.35).getHex(), size: 0.04, size1: 0.16, life: 0.9 });
        fx.burst('drop', at, 8, { vel: out.clone().multiplyScalar(1.4), color: 0xd8d0c4, size: 0.007, floor: 0.01 });
        if (Math.random() < 0.2) this.sound('ricochet', at, 0.5);
    }
  }

  private hitCustomer(hit: CustomerHit) {
    const g = this.game;
    const c = hit.c;
    const dir = this.raycaster.ray.direction.clone();
    const entry = hit.point;
    // a shot through the hat just sends it flying
    if (hit.part === 'hat') {
      this.knockHat(c, dir, 1.2);
      this.sound('fleshHit', entry, 0.25, 2.2);
      if (c.state !== 'dead') {
        c.setExpression('terrified');
        g.ui.speech.say(c, pick(['MY HAT!', 'Whoa!!', 'That was close!']), { mood: 'angry', duration: 1.4 });
      }
      return;
    }
    const first = c.state !== 'dead';
    if (first) {
      if (c.order) g.orders.cancel(c.order);
      this.dropHeld(c);
      g.customers.killed(c);
      g.ui.speech.clearFor(c);
      g.ui.refreshServe();
    }
    const force = hit.part === 'head' ? 7 : hit.part === 'torso' ? 5 : 3.6;
    c.die(entry, dir, force);
    if (first) {
      this.listenForLanding(c, hit.part);
      // someone dropping right in front of the counter: look down after them
      if (c.pos.distanceTo(g.engine.camera.position) < 2.4 && g.rig.lookPitch > -0.34) {
        const from = g.rig.lookPitch;
        g.engine.tweens.run(
          0.55,
          (k) => {
            if (this.armed) g.rig.lookPitch = Math.min(g.rig.lookPitch, from + (-0.36 - from) * k);
          },
          { delay: 0.12, ease: Ease.inOutCubic },
        );
      }
    }
    let bleed = entry;
    this.aimTime.delete(c);
    const gore = this.gore;
    gore.wound(hit.bone, entry, hit.part === 'head' ? 0.016 : 0.02);
    gore.mist(entry, dir.clone().negate(), hit.part === 'head' ? 0.5 : 0.3);
    if (hit.part === 'head') {
      // the round exits through the back of the skull
      const head = c.model.rig.head.getWorldPosition(new THREE.Vector3());
      const exit = exitPoint(this.raycaster.ray.origin, dir, head, c.model.dims.headR * 1.02) ?? entry.clone().addScaledVector(dir, 0.1);
      gore.wound(c.model.rig.head, exit, 0.034);
      bleed = exit;
      gore.mist(exit, dir, 1.7);
      gore.spray(exit, dir, 85, 5.5, 0.5, 1.3);
      gore.spray(exit, dir.clone().setY(dir.y + 0.4), 30, 2.4, 0.9, 1.6);
      gore.gibsFrom(exit, dir, 14);
      this.splatterBehind(exit, dir, 0.6);
      this.knockHat(c, dir, 1);
      this.sound('headHit', entry, 1);
      if (first) this.headshotMoment(c);
    } else {
      const exit = entry.clone().addScaledVector(dir, hit.part === 'torso' ? 0.24 : 0.1);
      gore.mist(exit, dir, hit.part === 'torso' ? 0.9 : 0.5);
      gore.spray(exit, dir, hit.part === 'torso' ? 40 : 16, 3.4, 0.5, 1.1);
      if (hit.part === 'torso') this.splatterBehind(exit, dir, 0.4);
      this.sound('fleshHit', entry, 1, hit.part === 'torso' ? 1 : 1.2);
    }
    this.markHit(hit.part === 'head');
    this.victims.push({ c, part: hit.part, bone: hit.bone, local: hit.bone.worldToLocal(bleed.clone()), t: 0, drip: 0, pooled: false });
  }

  /** Paint the nearest surface behind an exit wound. */
  private splatterBehind(from: THREE.Vector3, dir: THREE.Vector3, size: number) {
    const rc = new THREE.Raycaster(from.clone().addScaledVector(dir, 0.05), dir, 0, 3.2);
    const hits = rc.intersectObject(this.game.world.root, true);
    const roots = new Set<THREE.Object3D>(this.game.customers.list.map((c) => c.root));
    for (const hh of hits) {
      if (!(hh.object as THREE.Mesh).isMesh || !visibleChain(hh.object)) continue;
      let isCustomer = false;
      for (let p: THREE.Object3D | null = hh.object; p; p = p.parent) if (roots.has(p)) isCustomer = true;
      if (isCustomer) continue;
      const n = hh.face ? hh.face.normal.clone().transformDirection(hitMatrix(hh)) : dir.clone().negate();
      if (n.dot(dir) > 0) n.negate();
      const at = hh.point.clone();
      const delay = hh.distance / 14;
      this.game.engine.tweens.wait(delay).then(() => {
        this.gore.splat(at, n, size * rand(0.8, 1.2), 1.2, rand(0, 6));
        for (let i = 0; i < 6; i++) {
          const off = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).projectOnPlane(n).setLength(rand(0.1, 0.35) * size * 2);
          this.gore.splat(at.clone().add(off), n, size * rand(0.12, 0.3), rand(1, 2), rand(0, 6));
        }
        this.sound('gibSplat', at, 0.5);
      });
      return;
    }
  }

  private knockHat(c: Customer, dir: THREE.Vector3, strength: number) {
    const hat = c.model.rig.hatGroup;
    if (!hat.children.length || hat.parent === this.gore.root) return;
    const v = dir.clone().multiplyScalar(2.6 * strength).add(new THREE.Vector3(rand(-0.4, 0.4), 1.6 * strength, rand(-0.4, 0.4)));
    this.gore.launch(hat, v, new THREE.Vector3(rand(-9, 9), rand(-6, 6), rand(-9, 9)), 0.1);
    c.debris.push(hat);
  }

  /** Food and trays fall out of dead hands. */
  private dropHeld(c: Customer) {
    const r = c.model.rig;
    const joints = new Set<THREE.Object3D>(Object.values(r));
    const held: THREE.Object3D[] = [];
    for (const j of [r.chest, r.handL, r.handR, c.model.holdL, c.model.holdR])
      for (const ch of j.children) {
        if (joints.has(ch) || ch === c.model.holdL || ch === c.model.holdR || c.model.owns(ch) || ch.userData.wound) continue;
        held.push(ch);
      }
    for (const item of held) {
      const burger = c.burger && (item === c.burger.group || c.burger.group.parent === item) ? c.burger : null;
      if (burger) c.burger = null;
      const v = new THREE.Vector3(rand(-0.6, 0.6), rand(0.4, 1.2), rand(-0.6, 0.6));
      this.gore.launch(item, v, new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), 0.05, () => {
        if (burger) burger.dispose();
        discard(item);
      });
    }
  }

  /** Thuds as the body lands; blood where a shot head meets the floor. */
  private listenForLanding(c: Customer, part: Part) {
    const rd = c.ragdoll!;
    rd.onImpact = (i) => {
      if (i.speed < 0.8) return;
      const heavy = i.joint === Ragdoll.PELVIS || i.joint === Ragdoll.CHEST;
      const head = i.joint === Ragdoll.HEAD;
      const vol = clamp(i.speed / 3.5, 0.15, 1);
      this.sound(heavy ? 'bodyFall' : head ? 'headThud' : 'limbThud', i.at, vol, rand(0.9, 1.1));
      if (head && part === 'head' && i.speed > 1.2) {
        this.gore.splat(new THREE.Vector3(i.at.x, surfaceAt(i.at.x, i.at.z, i.at.y), i.at.z), undefined, rand(0.12, 0.2), 1.3);
        this.gore.spray(i.at, new THREE.Vector3(rand(-1, 1), 0.6, rand(-1, 1)), 10, 1.4, 0.8, 1);
      }
    };
  }

  /** Compile see-through shader variants for the fade-out while the body falls. */
  private warmFade(c: Customer) {
    const e = this.game.engine;
    const r = e.renderer;
    const prev = r.getRenderTarget();
    // programs are keyed on the output target: warm the ones the composer uses
    r.setRenderTarget(e.post.composer.inputBuffer);
    c.model.prepareFade(r, e.camera, e.scene);
    r.setRenderTarget(prev);
  }

  /** Slow motion and a flourish for the first clean headshot on someone. */
  private headshotMoment(c: Customer) {
    const g = this.game;
    const p = g.ui.project(c.bubbleAnchor());
    if (!p.behind) g.ui.floatText('HEADSHOT', p.x, p.y, 'bad headshot');
    if (!g.progress.data.settings.motion) return;
    const e = g.engine;
    e.timeScale = 0.3;
    e.uiTweens.run(0.45, (k) => (e.timeScale = 0.3 + 0.7 * k), { delay: 0.75, ease: Ease.inOutQuad });
  }

  private markHit(head: boolean) {
    const x = this.crosshair;
    x.classList.remove('hit', 'kill');
    void x.offsetWidth;
    x.classList.add('hit');
    if (head) x.classList.add('kill');
  }

  /** Everyone who heard that makes for the door, screaming. */
  private alarm() {
    const g = this.game;
    const cam = g.engine.camera.position;
    let screams = 0;
    let fled = 0;
    for (const c of g.customers.list) {
      if (c.state === 'dead' || c.state === 'gone' || c.panic) continue;
      const d = c.pos.distanceTo(cam);
      const delay = 0.12 + d * 0.025 + rand(0, 0.35);
      const scream = screams < 4 && Math.random() < 0.8;
      if (scream) screams++;
      fled++;
      g.engine.tweens.wait(delay).then(() => {
        if (c.state === 'dead' || c.state === 'gone' || c.panic) return;
        if (c.order) g.orders.cancel(c.order);
        g.customers.flee(c);
        g.ui.refreshServe();
        g.ui.speech.say(c, pick(PANIC_LINES), { mood: 'angry', duration: 1.5 });
        g.ui.speech.emote(c, 'exclaim');
        if (scream) {
          const local = g.engine.camera.worldToLocal(c.headPos);
          g.audio.scream(c.def.p, { pan: clamp(local.x / 4, -0.9, 0.9), volume: 0.5 * clamp(1.4 - d / 10, 0.25, 1) });
        }
      });
    }
    if (fled && this.shotsToday === 1) g.ui.toast('😱 Shots fired! Everyone is running for the door.', 'bad');
  }

  // ------------------------------------------------------------------ per frame
  private update(dt: number) {
    this.time += dt;
    const g = this.game;
    // flashes run on the wall clock, not in slow motion
    const rdt = dt / Math.max(0.05, g.engine.timeScale);
    this.gore.enabled = g.progress.data.settings.gore;
    this.gore.update(dt);
    this.updateVictims(dt);
    this.dock.classList.toggle('show', g.progress.data.settings.revolver && g.state === 'day' && g.station === 'order');
    // leaving the counter (or the day ending) puts the gun away
    if (this.armed && this.phase !== 'holstering' && !this.allowedToStay()) this.holster(true);
    // flash + light decay
    if (this.flashT > 0) {
      this.flashT -= rdt;
      const k = Math.max(0, this.flashT / 0.06);
      this.light.intensity = 9 * k * k;
      g.engine.post.grade.flash = 0.07 * k;
      if (this.flashT <= 0.03) {
        this.flash.visible = false;
        this.flashSide.visible = false;
      }
      if (this.flashT <= 0) {
        this.light.intensity = 0;
        g.engine.post.grade.flash = 0;
      }
    }
    if (this.tracerT > 0) {
      this.tracerT -= rdt;
      (this.tracer.material as THREE.MeshBasicMaterial).opacity = Math.max(0, this.tracerT / 0.05);
      if (this.tracerT <= 0) this.tracer.visible = false;
    }
    if (this.smokeT > 0) {
      this.smokeT -= dt;
      if (this.view.visible && Math.random() < dt * 22 * this.smokeT) {
        const p = this.parts.muzzle.getWorldPosition(new THREE.Vector3());
        g.fx.emit('smoke', p, { size: 0.015, size1: rand(0.08, 0.14), life: rand(0.9, 1.6), color: 0xcfc8c0, color1: 0xe8e2dc });
      }
    }
    if (this.phase === 'holstered') return;
    this.phaseT += dt;
    g.rig.edgeScroll = this.pointerType === 'mouse';
    g.engine.camera.updateMatrixWorld();
    this.syncNdc();
    this.hover = this.pickCustomer();
    this.updateReactions(dt);
    this.updateCrosshair();
    this.animate(dt);
  }

  private allowedToStay(): boolean {
    const g = this.game;
    return g.progress.data.settings.revolver && (g.state === 'day' || g.state === 'closing') && g.station === 'order' && !g.stations.serve.serving;
  }

  private updateCrosshair() {
    const hv = this.hover;
    const kid = !!hv && !!hv.c.def.app.kid && hv.c.state !== 'dead';
    this.crosshair.classList.toggle('target', !!hv && !kid);
    this.crosshair.classList.toggle('nogo', kid);
    this.crosshair.classList.toggle('reload', this.phase === 'reloading');
  }

  /** People who find the gun pointed at them put their hands up. */
  private updateReactions(dt: number) {
    const g = this.game;
    const hv = this.hover?.c;
    for (const [c, t] of this.aimTime) if (c !== hv) this.aimTime.set(c, Math.max(0, t - dt * 2));
    if (!hv || hv.state === 'dead' || hv.panic || hv.def.app.kid || this.phase === 'holstering') return;
    const t = (this.aimTime.get(hv) ?? 0) + dt;
    this.aimTime.set(hv, t);
    if (t < 0.3) return;
    if (hv.state === 'queued' || hv.state === 'atCounter' || hv.state === 'waiting' || hv.state === 'toQueue' || hv.state === 'toWait' || hv.state === 'eating') {
      hv.gesture('handsUp', 0.9);
      hv.setExpression('terrified');
    }
    if (!this.spoken.has(hv)) {
      this.spoken.add(hv);
      g.ui.speech.say(hv, pick(AIMED_LINES), { mood: 'angry', duration: 1.7 });
      g.audio.voice(hv.def.p, 'sad', 0.8);
      g.ui.speech.emote(hv, 'sweat');
    }
  }

  private updateVictims(dt: number) {
    for (let i = this.victims.length - 1; i >= 0; i--) {
      const v = this.victims[i];
      const c = v.c;
      if (c.state !== 'dead' || !c.ragdoll) {
        this.victims.splice(i, 1);
        continue;
      }
      v.t += dt;
      // the wound keeps bleeding while the body settles
      if (v.t < 9) {
        v.drip -= dt;
        if (v.drip <= 0) {
          v.drip = rand(0.03, 0.1) * (v.t < 2 ? 1 : 2.5);
          const p = v.bone.localToWorld(v.local.clone());
          this.gore.spray(p, DOWN, v.part === 'head' ? 2 : 1, 0.25, 1.3, 0.8);
        }
      }
      if (!v.pooled && c.ragdoll.sleeping) {
        v.pooled = true;
        // the body is still: a good moment to compile its fade-out shaders
        this.warmFade(c);
        const under = v.part === 'head' ? c.ragdoll.headRest() : v.part === 'torso' ? c.ragdoll.get(Ragdoll.CHEST) : v.bone.localToWorld(v.local.clone());
        this.gore.pool(under, v.part === 'head' ? 0.55 : v.part === 'torso' ? 0.42 : 0.25, 0, 14);
      }
    }
  }

  // ------------------------------------------------------------------ animation
  private animate(dt: number) {
    const g = this.game;
    const cam = g.engine.camera;
    const P = this.parts;
    // ---- draw / holster
    const up = this.phase === 'holstering' ? 0 : 1;
    this.drawAmt = clamp(this.drawAmt + (up ? dt / 0.32 : -dt / 0.26));
    if (this.phase === 'drawing' && this.drawAmt >= 1) {
      this.setPhase('ready');
      this.hammer = 1;
      g.audio.play('hammerCock', { volume: 0.8 });
    }
    if (this.phase === 'holstering' && this.drawAmt <= 0) {
      this.stow();
      return;
    }
    const e = Ease.outCubic(this.drawAmt);
    // keep the gun on screen on narrow (portrait) displays
    const halfW = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect * -HIP.z;
    this.view.position.x = Math.min(HIP.x, halfW * 0.72);
    // ---- firing cycle: trigger resets, thumb re-cocks, the cylinder indexes
    if (this.phase === 'firing') {
      if (this.phaseT > 0.1) this.trigger = Math.max(0, this.trigger - dt / 0.1);
      if (this.phaseT > 0.16 && this.hammer < 1) {
        if (this.hammer === 0) {
          g.audio.play('hammerCock', { volume: 0.7 });
          this.cylTarget += Math.PI / 3;
        }
        this.hammer = Math.min(1, this.hammer + dt / 0.09);
      }
      if (this.phaseT > FIRE_GAP) {
        this.setPhase('ready');
        this.trigger = 0;
        this.hammer = 1;
      }
    }
    if (this.phase === 'reloading') this.animateReload(dt);
    // ---- lower the muzzle when it points at a kid
    const kid = !!this.hover && !!this.hover.c.def.app.kid && this.hover.c.state !== 'dead';
    this.lower = damp(this.lower, kid ? 1 : 0, 10, dt);
    // ---- sway: lag behind fast mouse moves, breathe
    const ndc = g.input.ndc;
    this.swayV.x = damp(this.swayV.x, (ndc.x - this.lastNdc.x) / Math.max(dt, 1e-3), 12, dt);
    this.swayV.y = damp(this.swayV.y, (ndc.y - this.lastNdc.y) / Math.max(dt, 1e-3), 12, dt);
    this.lastNdc.copy(ndc);
    const t = this.time;
    const s = this.sway;
    s.position.set(
      clamp(-this.swayV.x * 0.006, -0.02, 0.02) - this.reloadPose * 0.05,
      -0.24 * (1 - e) + Math.sin(t * 1.7) * 0.0018 + clamp(-this.swayV.y * 0.005, -0.015, 0.015) - this.reloadPose * 0.03 - this.lower * 0.03,
      this.reloadPose * 0.02,
    );
    s.rotation.set(-1.0 * (1 - e) + this.reloadPose * 0.62 - this.lower * 0.55, this.reloadPose * 0.25, 0.35 * (1 - e) + this.reloadPose * 0.55 + Math.sin(t * 0.9) * 0.012 + clamp(this.swayV.x * 0.01, -0.06, 0.06));
    // ---- aim: point the bore at whatever is under the crosshair
    const target = this.hover ? this.hover.point : this.raycaster.ray.at(7, tmpV);
    const local = cam.worldToLocal(tmpV2.copy(target)).sub(HIP).normalize();
    local.x = clamp(local.x, -0.6, 0.6);
    local.y = clamp(local.y, -0.45, 0.5);
    local.normalize();
    tmpQ.setFromUnitVectors(FWD, local);
    this.aimQ.slerp(tmpQ, 1 - Math.exp(-dt * (this.phase === 'reloading' ? 6 : 20)));
    this.aim.quaternion.copy(this.aimQ);
    // ---- recoil springs
    this.kickG.rotation.x = this.kickRot.update(dt);
    this.kickG.position.z = this.kickBack.update(dt) * 0.06;
    // ---- mechanism
    P.hammer.rotation.x = this.hammer * 0.95;
    P.trigger.rotation.x = -this.trigger * 0.35;
    this.cylAngle = damp(this.cylAngle, this.cylTarget, 28, dt);
    P.cylinder.rotation.z = this.cylAngle;
    P.crane.rotation.z = this.crane * 1.45;
    P.crane.position.x = -0.011 - this.crane * 0.013;
  }

  private animateReload(dt: number) {
    const g = this.game;
    const t = this.phaseT;
    const P = this.parts;
    // hammer down, tip the gun over, swing the cylinder out
    this.hammer = Math.max(0, this.hammer - dt / 0.08);
    this.reloadPose = t < 0.3 ? Ease.inOutCubic(t / 0.3) : t < 1.62 ? 1 : 1 - Ease.inOutCubic(clamp((t - 1.62) / 0.33));
    // muzzle up while the empties drop out
    this.reloadPose += t > 0.4 && t < 0.7 ? Math.sin(((t - 0.4) / 0.3) * Math.PI) * 0.35 : 0;
    this.crane = t < 0.18 ? 0 : t < 1.5 ? Ease.outBack(clamp((t - 0.18) / 0.18)) : 1 - Ease.inCubic(clamp((t - 1.5) / 0.1));
    const once = (at: number, fn: () => void) => {
      if (t >= at && this.reloadStep < at) {
        this.reloadStep = at;
        fn();
      }
    };
    once(0.18, () => g.audio.play('craneOpen', { volume: 0.8 }));
    once(0.5, () => {
      g.audio.play('ejectRod', { volume: 0.7 });
      const from = P.cylinder.localToWorld(new THREE.Vector3(0, 0, 0.03));
      this.gore.ejectCasings(from, 6);
      for (const r of P.rounds) r.visible = false;
      this.rounds.forEach((r) => r.classList.remove('full'));
    });
    for (let i = 0; i < 6; i++)
      once(0.72 + i * 0.13, () => {
        P.rounds[i].visible = true;
        g.audio.play('roundIn', { volume: 0.6, rate: rand(0.95, 1.08) });
        this.rounds[i].classList.add('full');
      });
    once(1.5, () => {
      g.audio.play('craneClose', { volume: 0.85 });
      this.cylTarget += (Math.PI / 3) * (2 + Math.floor(rand(0, 3)));
    });
    once(1.78, () => {
      g.audio.play('hammerCock', { volume: 0.7 });
    });
    if (t > 1.78) this.hammer = Math.min(1, (t - 1.78) / 0.08);
    if (t >= RELOAD_TIME) {
      this.finishReload();
      this.setPhase('ready');
    }
  }

  private renderAmmo() {
    this.rounds.forEach((r, i) => r.classList.toggle('full', i < this.loaded));
    this.dock.classList.toggle('empty', this.loaded === 0);
  }

  // ------------------------------------------------------------------ helpers
  /** A sound placed in the stereo field and attenuated with distance. */
  private sound(id: string, at: THREE.Vector3, volume: number, rate = 1) {
    const cam = this.game.engine.camera;
    const local = cam.worldToLocal(at.clone());
    const d = local.length();
    this.game.audio.play(id, { volume: volume * clamp(1.35 - d / 12, 0.15, 1), pan: clamp(local.x / 3.5, -0.9, 0.9), rate });
  }
}

/** World matrix of what a ray hit (including the instance, for instanced meshes). */
function hitMatrix(hh: THREE.Intersection): THREE.Matrix4 {
  const o = hh.object as THREE.InstancedMesh;
  if (!o.isInstancedMesh || hh.instanceId === undefined) return o.matrixWorld;
  const m = new THREE.Matrix4();
  o.getMatrixAt(hh.instanceId, m);
  return m.premultiply(o.matrixWorld);
}

/** Is the object (and every parent) visible? Raycasts ignore visibility. */
function visibleChain(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/** Far intersection of a ray with a sphere (where a round leaves the head). */
function exitPoint(origin: THREE.Vector3, dir: THREE.Vector3, center: THREE.Vector3, r: number): THREE.Vector3 | null {
  const oc = tmpV.copy(center).sub(origin);
  const tc = oc.dot(dir);
  const d2 = oc.lengthSq() - tc * tc;
  if (d2 > r * r) return null;
  const t2 = tc + Math.sqrt(r * r - d2);
  return origin.clone().addScaledVector(dir, t2);
}
