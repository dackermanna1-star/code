/**
 * Portal gun mod: the "Portal Gun" item (creative Tools & Utilities). Left click fires a blue
 * portal, right click an orange one. Shots fly out of the device, pass through existing portals,
 * and open a portal where they land on a flat run of opaque blocks (nudged to fit, settling onto
 * the floor on walls), or fizzle. With both portals open:
 *
 *  - Rendering: each visible portal shows a full off-screen render of the world seen from a
 *    virtual camera behind the other portal (oblique near plane on the exit, scissored to the
 *    portal's screen rect), with portals-in-portals recursing a few levels before falling back
 *    to the membrane. You see yourself (and the gun) through them.
 *  - Passage: the wall behind each portal stops colliding, you walk (or fall) into it, and the
 *    moment your eye crosses the portal plane you, your momentum and your view go through the
 *    same rigid transform. The camera keeps rendering from the entry side until the
 *    interpolated eye is actually through, the temporal history (TAA) is carried across, any
 *    view roll straightens out smoothly, and your body is drawn coming out of the other side
 *    while you straddle the opening. Items and mobs go through too.
 *  - Flings keep their speed (low air drag until you land); exits on floors pop you out.
 *
 * Plus: rim-flame shaders, opening/closing animations, sparks, coloured light, shot bolts,
 * hum loops, the Portal-style crosshair, saved portals.
 */
import * as THREE from 'three';
import type { Game } from '../game';
import type { GameSystem } from '../systems';
import { addItemBehavior } from '../items/registry';
import { registerHandPose } from '../../render/items/hand';
import { gunHandPose } from './portalItem';
import { COLLISION_HOLES, AABB } from '../../physics/aabb';
import { ViewTarget, type ExtraView, type Renderer } from '../../render/renderer';
import { LivingEntity } from '../../entity/living';
import { ItemEntity } from '../../entity/itemEntity';
import { PortalFrame, placePortal, portalFits, portalTransform, shotRaycast, crossesPortal, PORTAL_HW, PORTAL_HH, type ShotHit } from './portalMath';
import { transitBody, transitEntity } from './portalTransit';
import { PortalVisual, SparkFx, ShotBolt, PORTAL_COLORS, PORTAL_HEX, virtualCamera, portalScreenRect } from './portalRender';
import { PlayerBody } from './playerBody';


const SHOT_SPEED = 130;
const SHOT_RANGE = 240;
const FIRE_COOLDOWN = 0.22;

interface Portal {
  color: number;
  frame: PortalFrame;
  visual: PortalVisual;
  hum: any;
  lightT: number;
  sparkT: number;
}

interface Shot {
  color: number;
  segs: { a: THREE.Vector3; b: THREE.Vector3 }[];
  seg: number;
  along: number;
  bolt: ShotBolt;
  result: { kind: 'place'; hit: ShotHit; facing: THREE.Vector3 } | { kind: 'fizzle'; hit: ShotHit } | { kind: 'none' };
  trailT: number;
}

interface ViewNode {
  entry: Portal;
  exit: Portal;
  cam: THREE.PerspectiveCamera;
  level: number;
  scissor: number[];
  target: ViewTarget;
  children: ViewNode[];
}

interface CameraTransit {
  mInv: THREE.Matrix4;
  qInv: THREE.Quaternion;
  exit: PortalFrame;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _box = new AABB();
const _frustum = new THREE.Frustum();
const _pm = new THREE.Matrix4();
const _b3 = new THREE.Box3();
const rnd = Math.random;

export class PortalSystem implements GameSystem {
  readonly name = 'portalGun';
  private game!: Game;
  readonly portals: (Portal | null)[] = [null, null];
  private closing: PortalVisual[] = [];
  private shots: Shot[] = [];
  private readonly fx = new THREE.Scene();
  private sparks = new SparkFx();
  private body: PlayerBody | null = null;
  private targets: ViewTarget[] = [];
  private cams: THREE.PerspectiveCamera[] = [];
  private nodes: ViewNode[] = [];
  private time = 0;
  private cooldown = 0;
  private lastColor = 0;
  private recoil = 0;
  /** Seconds since the last shot (drives the closed-form recoil kick). */
  private kickT = 10;
  private gunGlow = 0;
  // camera continuity
  private roll = 0;
  private readonly camOffset = new THREE.Vector3();
  private transit: CameraTransit | null = null;
  private pendingHistory: THREE.Matrix4 | null = null;
  private hud: HTMLElement | null = null;
  private hudParts: { l: SVGElement; r: SVGElement; lf: SVGElement; rf: SVGElement } | null = null;
  private hudShown = false;
  private validateT = 0;

  init(game: Game) {
    this.game = game;
    addItemBehavior('portal_gun', { ownsMouse: true });
    registerHandPose('portal_gun', (ps, o) => this.handPose(ps, o));
    this.fx.add(this.sparks.points);
    (game.renderExtras.forward ??= []).push(this.fx);
    try {
      this.body = new PlayerBody(game);
      (game.renderExtras.gbuffer ??= []).push(this.body.scene);
      (game.renderExtras.shadow ??= []).push(this.body.scene);
    } catch (e) {
      console.warn('[portals] player body unavailable', e);
    }
    game.renderExtras.views = { plan: (cam: THREE.PerspectiveCamera, r: Renderer) => this.plan(cam, r), main: () => this.mainView() };
    game.cameraCtl.postPose = (cam, dt) => this.postPose(cam, dt);
    // no targeting (or breaking) the wall behind a linked portal you are looking through
    game.interaction.targetFilter = (eye, dir, hit) => !this.throughOpening(eye, dir, hit.dist);
    (game as any).portalMapPoint = (from: THREE.Vector3, p: THREE.Vector3) => this.mapPoint(from, p);
    game.events.on('dimensionChanged', () => this.reset());
  }

  onWorldChange() {
    this.reset();
  }

  // ------------------------------------------------------------------------------- state
  private get linked(): boolean {
    return !!this.portals[0] && !!this.portals[1];
  }
  private partner(p: Portal): Portal {
    return this.portals[1 - p.color]!;
  }

  private reset() {
    for (const p of this.portals) if (p) this.removePortal(p, false);
    this.portals[0] = this.portals[1] = null;
    for (const v of this.closing) v.dispose();
    this.closing.length = 0;
    for (const s of this.shots) s.bolt.dispose();
    this.shots.length = 0;
    this.sparks.clear();
    this.transit = null;
    this.pendingHistory = null;
    this.roll = 0;
    this.camOffset.set(0, 0, 0);
    COLLISION_HOLES.holes = [];
  }

  private openPortal(color: number, frame: PortalFrame, quiet = false) {
    const old = this.portals[color];
    if (old) this.removePortal(old, true);
    const visual = new PortalVisual(color, frame);
    this.fx.add(visual.root);
    const g = this.game;
    const hum = g.audio?.loop?.('loop.portal.hum', { pos: frame.c, volume: 0.55 }) ?? null;
    const p: Portal = { color, frame, visual, hum, lightT: 0, sparkT: 0 };
    this.portals[color] = p;
    if (!quiet) {
      g.audio?.play?.('portal.open', { pos: frame.c, volume: 1.1 });
      const c = PORTAL_COLORS[color];
      for (let i = 0; i < 90; i++) {
        const a = rnd() * Math.PI * 2;
        const ex = Math.cos(a) * PORTAL_HW, ey = Math.sin(a) * PORTAL_HH;
        _v.copy(frame.c).addScaledVector(frame.right, ex).addScaledVector(frame.up, ey).addScaledVector(frame.n, 0.03);
        _w.copy(frame.right).multiplyScalar(Math.cos(a) * (1.5 + rnd() * 3)).addScaledVector(frame.up, Math.sin(a) * (1.5 + rnd() * 3)).addScaledVector(frame.n, rnd() * 2.5);
        this.sparks.emit(_v.x, _v.y, _v.z, _w.x, _w.y, _w.z, c, 3 + rnd() * 5, 0.35 + rnd() * 0.5, 3.5, 3);
      }
      g.particles?.flash?.(frame.c.x + frame.n.x * 0.6, frame.c.y + frame.n.y * 0.6, frame.c.z + frame.n.z * 0.6, PORTAL_HEX[color], 40, 0.45, 10);
    }
    this.updateHoles();
  }

  private removePortal(p: Portal, animate: boolean) {
    p.hum?.stop?.(0.3);
    if (this.portals[p.color] === p) this.portals[p.color] = null;
    if (animate) {
      p.visual.closing = true;
      p.visual.show('membrane');
      this.closing.push(p.visual);
      this.game.audio?.play?.('portal.close', { pos: p.frame.c, volume: 0.8 });
      const c = PORTAL_COLORS[p.color];
      for (let i = 0; i < 40; i++) {
        _v.copy(p.frame.c).addScaledVector(p.frame.right, (rnd() - 0.5) * PORTAL_HW * 2).addScaledVector(p.frame.up, (rnd() - 0.5) * PORTAL_HH * 2).addScaledVector(p.frame.n, 0.05);
        this.sparks.emit(_v.x, _v.y, _v.z, p.frame.n.x * rnd() * 2 + (rnd() - 0.5), p.frame.n.y * rnd() * 2 + (rnd() - 0.5), p.frame.n.z * rnd() * 2 + (rnd() - 0.5), c, 3, 0.5 + rnd() * 0.4, 2, 2);
      }
    } else p.visual.dispose();
    this.updateHoles();
  }

  /** The tunnels behind linked portals stop colliding. */
  private updateHoles() {
    COLLISION_HOLES.world = this.game?.world ?? null;
    COLLISION_HOLES.holes = this.linked ? [this.portals[0]!.frame.tunnel(), this.portals[1]!.frame.tunnel()] : [];
  }

  /** Does the ray pass through a linked portal's opening before `maxT`? */
  private throughOpening(o: THREE.Vector3, d: THREE.Vector3, maxT: number): boolean {
    if (!this.linked) return false;
    for (const x of this.portals as Portal[]) {
      const denom = d.dot(x.frame.n);
      if (denom > -1e-4) continue;
      const t = _w.copy(x.frame.c).sub(o).dot(x.frame.n) / denom;
      if (t < 0 || t > maxT + 0.01) continue;
      _w.copy(o).addScaledVector(d, t);
      const l = x.frame.toLocal(_w);
      if (x.frame.insideRect(l.x, l.y)) return true;
    }
    return false;
  }

  /** If the segment from → p passes through a linked portal, move p to where it comes out. */
  private mapPoint(from: THREE.Vector3, p: THREE.Vector3) {
    if (!this.linked) return;
    for (const x of this.portals as Portal[]) {
      if (!crossesPortal(x.frame, from, p)) continue;
      p.applyMatrix4(portalTransform(x.frame, this.partner(x).frame));
      return;
    }
  }

  // ------------------------------------------------------------------------------- firing
  private holdingGun(): boolean {
    const p: any = this.game.player;
    return !!p && !p.dead && !p.vehicle && !p.spectator && p.mainHand?.item.name === 'portal_gun';
  }

  private muzzle(out: THREE.Vector3): THREE.Vector3 {
    const cam = this.game.cameraCtl.camera;
    if (this.game.cameraCtl.perspective !== 'first') return out.copy(this.game.player.eyePos).addScaledVector(this.game.player.lookDir(_d), 0.6);
    return out.set(0.2, -0.17, -0.62).applyQuaternion(cam.quaternion).add(cam.position);
  }

  private fire(color: number) {
    const g = this.game;
    const p: any = g.player;
    this.cooldown = FIRE_COOLDOWN;
    this.lastColor = color;
    this.kickT = 0;
    this.gunGlow = 1;
    g.audio?.play?.(color ? 'portal.gun.orange' : 'portal.gun.blue', { volume: 0.9 });
    const cam = g.cameraCtl.camera;
    let o = _v.copy(g.cameraCtl.eyeWorld).clone();
    let d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    if (g.cameraCtl.perspective !== 'first') { o = p.eyePos.clone(); d = p.lookDir(new THREE.Vector3()); }
    const segs: Shot['segs'] = [];
    let start = this.muzzle(new THREE.Vector3());
    let remaining = SHOT_RANGE;
    let result: Shot['result'] = { kind: 'none' };
    for (let hop = 0; hop < 5; hop++) {
      const hit = shotRaycast(g.world, o, d, remaining);
      let best: { t: number; x: Portal } | null = null;
      if (this.linked) {
        for (const x of this.portals as Portal[]) {
          const denom = d.dot(x.frame.n);
          if (denom > -1e-4) continue;
          const t = _w.copy(x.frame.c).sub(o).dot(x.frame.n) / denom;
          if (t < 0.02 || t > (hit ? hit.dist + 0.01 : remaining)) continue;
          _w.copy(o).addScaledVector(d, t);
          const l = x.frame.toLocal(_w);
          if (!x.frame.insideRect(l.x, l.y, -0.04)) continue;
          if (!best || t < best.t) best = { t, x };
        }
      }
      if (best) {
        const hp = o.clone().addScaledVector(d, best.t);
        segs.push({ a: start, b: hp });
        const m = portalTransform(best.x.frame, this.partner(best.x).frame);
        o = hp.applyMatrix4(m).addScaledVector(this.partner(best.x).frame.n, 0.01);
        d = d.clone().applyQuaternion(_q.setFromRotationMatrix(m)).normalize();
        start = o.clone();
        remaining -= best.t;
        continue;
      }
      if (hit) {
        segs.push({ a: start, b: hit.point.clone() });
        const facing = new THREE.Vector3(d.x, 0, d.z);
        if (facing.lengthSq() < 1e-6) facing.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
        result = { kind: 'place', hit, facing: facing.normalize() };
      } else segs.push({ a: start, b: o.clone().addScaledVector(d, remaining) });
      break;
    }
    const bolt = new ShotBolt(color);
    this.fx.add(bolt.obj);
    const shot: Shot = { color, segs, seg: 0, along: 0, bolt, result, trailT: 0 };
    this.shots.push(shot);
    // muzzle flash
    const mz = this.muzzle(_w);
    g.particles?.flash?.(mz.x, mz.y, mz.z, PORTAL_HEX[color], 8, 0.12, 5);
    const c = PORTAL_COLORS[color];
    const fd = segs[0] ? _d.copy(segs[0].b).sub(segs[0].a).normalize() : d;
    for (let i = 0; i < 14; i++) this.sparks.emit(mz.x, mz.y, mz.z, fd.x * (2 + rnd() * 5) + (rnd() - 0.5) * 1.5, fd.y * (2 + rnd() * 5) + (rnd() - 0.5) * 1.5, fd.z * (2 + rnd() * 5) + (rnd() - 0.5) * 1.5, c, 5, 0.12 + rnd() * 0.12, 6);
  }

  private updateShots(dt: number) {
    const g = this.game;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      let step = SHOT_SPEED * dt;
      let done = false;
      while (step > 0 && !done) {
        const seg = s.segs[s.seg];
        const len = seg.a.distanceTo(seg.b);
        const left = len - s.along;
        if (step < left) { s.along += step; step = 0; }
        else {
          step -= left;
          s.seg++;
          s.along = 0;
          if (s.seg >= s.segs.length) done = true;
        }
      }
      const seg = s.segs[Math.min(s.seg, s.segs.length - 1)];
      const dir = _d.copy(seg.b).sub(seg.a).normalize();
      const pos = done ? _v.copy(seg.b) : _v.copy(seg.a).addScaledVector(dir, s.along);
      s.bolt.place(pos, dir);
      // trail
      s.trailT += dt;
      const c = PORTAL_COLORS[s.color];
      while (s.trailT > 0.004) {
        s.trailT -= 0.004;
        this.sparks.emit(pos.x - dir.x * rnd() * 0.5, pos.y - dir.y * rnd() * 0.5, pos.z - dir.z * rnd() * 0.5, (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.6, c, 2.5, 0.18 + rnd() * 0.2, 4);
      }
      g.particles?.flash?.(pos.x, pos.y, pos.z, PORTAL_HEX[s.color], 2.5, 0.05, 4);
      if (done) {
        this.shots.splice(i, 1);
        s.bolt.dispose();
        this.land(s);
      }
    }
  }

  private land(s: Shot) {
    const g = this.game;
    if (s.result.kind === 'none') return;
    const hit = s.result.hit;
    let frame: PortalFrame | null = null;
    if (s.result.kind === 'place') {
      const other = this.portals[1 - s.color]?.frame ?? null;
      frame = placePortal(g.world, hit, s.result.facing, other);
    }
    if (frame) {
      this.openPortal(s.color, frame);
      return;
    }
    // fizzle
    const n = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]][hit.face] ?? [0, 1, 0];
    const c = PORTAL_COLORS[s.color];
    const p = hit.point;
    g.audio?.play?.('portal.fizzle', { pos: p, volume: 0.9 });
    g.particles?.flash?.(p.x + n[0] * 0.3, p.y + n[1] * 0.3, p.z + n[2] * 0.3, PORTAL_HEX[s.color], 10, 0.2, 5);
    for (let i = 0; i < 45; i++) {
      const sp = 1 + rnd() * 5;
      this.sparks.emit(p.x + n[0] * 0.02, p.y + n[1] * 0.02, p.z + n[2] * 0.02, (n[0] + (rnd() - 0.5) * 1.6) * sp, (n[1] + (rnd() - 0.5) * 1.6) * sp, (n[2] + (rnd() - 0.5) * 1.6) * sp, c, 4, 0.2 + rnd() * 0.45, 3, 6);
    }
  }

  // ------------------------------------------------------------------------------- per frame
  update(game: Game, dt: number, alpha: number) {
    this.time += dt;
    const inp = game.input;
    const p: any = game.player;
    const holding = this.holdingGun();
    if (this.cooldown > 0) this.cooldown -= dt;
    if (holding && inp.enabled && !game.paused) {
      if (inp.wasPressed('attack') && this.cooldown <= 0) this.fire(0);
      else if (inp.wasPressed('use') && this.cooldown <= 0) this.fire(1);
    }
    // gun recoil: fast kick, smooth return (closed form, stable at any frame rate)
    this.kickT += dt;
    const kt = this.kickT / 0.05;
    this.recoil = kt < 12 ? 0.3 * kt * Math.exp(1 - kt) : 0;
    this.gunGlow = Math.max(0, this.gunGlow - dt * 2.5);
    this.updateShots(dt);
    // portals: animation, light, embers, hum
    const linked = this.linked;
    for (const pt of this.portals) {
      if (!pt) continue;
      pt.visual.update(dt, this.time);
      const f = pt.frame;
      pt.lightT -= dt;
      if (pt.lightT <= 0) {
        pt.lightT = 0.06;
        game.particles?.flash?.(f.c.x + f.n.x * 0.5, f.c.y + f.n.y * 0.5, f.c.z + f.n.z * 0.5, PORTAL_HEX[pt.color], 2.2 * pt.visual.open, 0.12, 6);
      }
      pt.sparkT -= dt;
      const c = PORTAL_COLORS[pt.color];
      while (pt.sparkT <= 0) {
        pt.sparkT += 1 / 45;
        const a = rnd() * Math.PI * 2;
        const ex = Math.cos(a) * PORTAL_HW * pt.visual.open, ey = Math.sin(a) * PORTAL_HH * pt.visual.open;
        _v.copy(f.c).addScaledVector(f.right, ex).addScaledVector(f.up, ey).addScaledVector(f.n, 0.02);
        const t = (rnd() - 0.5) * 0.8;
        _w.copy(f.right).multiplyScalar(Math.cos(a) * 0.35 - Math.sin(a) * t).addScaledVector(f.up, Math.sin(a) * 0.35 + Math.cos(a) * t).addScaledVector(f.n, 0.15 + rnd() * 0.4);
        this.sparks.emit(_v.x, _v.y, _v.z, _w.x, _w.y, _w.z, c, 2.2 + rnd() * 2.5, 0.4 + rnd() * 0.6, 1.5, -0.4);
      }
      if (!linked) pt.visual.show('membrane');
    }
    for (let i = this.closing.length - 1; i >= 0; i--) {
      if (!this.closing[i].update(dt, this.time)) {
        this.closing[i].dispose();
        this.closing.splice(i, 1);
      }
    }
    this.sparks.update(dt);
    // validity (blocks broken / placed in front)
    this.validateT -= dt;
    if (this.validateT <= 0) {
      this.validateT = 0.25;
      for (const pt of this.portals) if (pt && game.world.isLoaded(Math.floor(pt.frame.c.x), Math.floor(pt.frame.c.z)) && !portalFits(game.world, pt.frame)) {
        this.removePortal(pt, true);
        game.audio?.play?.('portal.fizzle', { pos: pt.frame.c, volume: 1 });
      }
    }
    // body + the copy coming out of the other side while straddling
    let clone: THREE.Matrix4 | null = null;
    if (linked && p) {
      for (const pt of this.portals as Portal[]) {
        if (pt.frame.tunnel(_box, 2.0).intersects(p.box)) { clone = portalTransform(pt.frame, this.partner(pt).frame); break; }
      }
    }
    this.body?.update(alpha, dt, clone);
    // gun glow colour (third person copy)
    if (this.body) for (const m of this.body.heldMaterials()) this.tintGlow(m);
    // camera roll / offset recovery
    this.roll *= Math.exp(-dt * 5.5);
    if (Math.abs(this.roll) < 1e-4) this.roll = 0;
    this.camOffset.multiplyScalar(Math.exp(-dt * 9));
    this.updateHud(holding);
  }

  private tintGlow(m: THREE.RawShaderMaterial) {
    const u = m.uniforms;
    if (!u.u_color) return;
    (u.u_color.value as THREE.Color).setHex(PORTAL_HEX[this.lastColor]);
    u.u_emissive.value = 2.4 + this.gunGlow * 5;
  }

  /** First-person placement of the device (camera space). */
  private handPose(ps: { m: THREE.Matrix4 }, o: { equip: number; dt: number; model: THREE.Object3D }) {
    gunHandPose(ps.m, o.equip, this.recoil, this.time);
    o.model.traverse((ob) => {
      const m = (ob as THREE.Mesh).material as THREE.RawShaderMaterial | undefined;
      if (m?.uniforms?.u_emissive && m.uniforms.u_emissive.value > 0.5) this.tintGlow(m);
    });
  }

  // ------------------------------------------------------------------------------- physics
  physics(game: Game, _dt: number) {
    this.transit = null;
    const p: any = game.player;
    if (p && (p.onGround || p.inWater || p.flying || p.onClimbable)) p.airDragScale = 1;
    if (!this.linked || !p) return;
    const A = this.portals[0]!, B = this.portals[1]!;
    // the player: crosses when the eye crosses
    if (!p.vehicle && !p.dead) {
      const eyeH = game.cameraCtl.currentEyeHeight;
      const e0 = _v.set(p.prevPos.x, p.prevPos.y + eyeH, p.prevPos.z);
      const e1 = _w.set(p.pos.x, p.pos.y + eyeH, p.pos.z);
      for (const x of [A, B]) {
        if (!crossesPortal(x.frame, e0, e1)) continue;
        const y = this.partner(x);
        const r = transitBody(p, eyeH, x.frame, y.frame, this.roll);
        this.roll = r.roll;
        this.camOffset.sub(r.shift);
        const mInv = r.m.clone().invert();
        this.transit = { mInv, qInv: r.q.clone().invert(), exit: y.frame };
        this.pendingHistory = r.m.clone();
        game.audio?.play?.('portal.enter', { volume: 0.8 });
        game.events.emit('portalTransit', { entity: p, from: x.color, to: y.color });
        break;
      }
    }
    // other entities near the portals: cross when their centre crosses
    for (const e of game.entities.list as any[]) {
      if (e === p || e.removed || e.vehicle || e.passenger || e.isVehicle) continue;
      if (!(e instanceof ItemEntity) && !(e instanceof LivingEntity)) continue;
      if (e.width > PORTAL_HW * 2 - 0.1 || e.height > PORTAL_HH * 2 - 0.1) continue;
      const h = e.height / 2;
      for (const x of [A, B]) {
        if (Math.abs(x.frame.side(e.pos)) > 3) continue;
        const c0 = _v.set(e.prevPos.x, e.prevPos.y + h, e.prevPos.z);
        const c1 = _w.set(e.pos.x, e.pos.y + h, e.pos.z);
        if (!crossesPortal(x.frame, c0, c1)) continue;
        const y = this.partner(x);
        transitEntity(e, x.frame, y.frame);
        game.audio?.play?.('portal.enter', { pos: y.frame.c, volume: 0.5, pitch: 1.2 });
        break;
      }
      if (e.onGround || e.inWater) e.airDragScale = 1;
    }
  }

  // ------------------------------------------------------------------------------- camera
  private postPose(cam: THREE.PerspectiveCamera, _dt: number) {
    if (this.roll) cam.rotation.z += this.roll;
    cam.position.add(this.camOffset);
    const tr = this.transit;
    if (tr && tr.exit.side(cam.position) < 0) {
      // the interpolated eye is still on the entry side: draw from there (through the portal)
      cam.position.applyMatrix4(tr.mInv);
      cam.quaternion.premultiply(tr.qInv);
      return;
    }
    if (this.pendingHistory) {
      this.game.renderer.transformHistory(this.pendingHistory);
      this.pendingHistory = null;
    }
  }

  // ------------------------------------------------------------------------------- views
  private maxLevel(r: Renderer) {
    const q = r.settings.quality;
    return q === 'low' ? 1 : q === 'medium' ? 2 : 3;
  }

  private visibleFrom(x: Portal, cam: THREE.Camera, camPos: THREE.Vector3): boolean {
    const f = x.frame;
    const s = f.side(camPos);
    if (s < -0.15) return false;
    if (s < 0) {
      // only while the camera is inside the opening (stepping through)
      const l = f.toLocal(camPos, _d);
      if (!f.insideRect(l.x, l.y, 0.05)) return false;
    }
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
    const h = f.halfExtents(_d);
    _b3.min.set(f.c.x - h.x - 0.05, f.c.y - h.y - 0.05, f.c.z - h.z - 0.05);
    _b3.max.set(f.c.x + h.x + 0.05, f.c.y + h.y + 0.05, f.c.z + h.z + 0.05);
    return _frustum.intersectsBox(_b3);
  }

  private plan(cam: THREE.PerspectiveCamera, r: Renderer): ExtraView[] {
    this.nodes.length = 0;
    if (!this.linked) return [];
    const max = this.maxLevel(r);
    const base = cam.projectionMatrix.clone();
    let used = 0;
    const scaleFor = (level: number) => (level === 1 ? 1 : level === 2 ? 0.6 : 0.45);
    const recurse = (parent: THREE.Camera, parentPos: THREE.Vector3, level: number, exit: Portal | null, scissor: number[], out: ViewNode[]) => {
      for (const x of this.portals as Portal[]) {
        if (x === exit || x.visual.open < 0.02) continue;
        if (!this.visibleFrom(x, parent, parentPos)) continue;
        const rect = portalScreenRect(x.frame, parent);
        if (!rect) continue;
        const sc = [Math.max(rect[0], scissor[0]), Math.max(rect[1], scissor[1]), Math.min(rect[2], scissor[2]), Math.min(rect[3], scissor[3])];
        if (sc[2] - sc[0] <= 1e-3 || sc[3] - sc[1] <= 1e-3) continue;
        if (level > max || used >= 8) continue;
        const y = this.partner(x);
        const vcam = (this.cams[used] ??= new THREE.PerspectiveCamera());
        const target = (this.targets[used] ??= new ViewTarget());
        used++;
        const s = scaleFor(level);
        target.setSize(r.width * s, r.height * s);
        virtualCamera(vcam, parent, base, cam.fov, cam.aspect, portalTransform(x.frame, y.frame), y.frame);
        const node: ViewNode = { entry: x, exit: y, cam: vcam, level, scissor: sc, target, children: [] };
        recurse(vcam, vcam.position.clone(), level + 1, y, sc, node.children);
        out.push(node);
      }
    };
    recurse(cam, cam.position.clone(), 1, null, [0, 0, 1, 1], this.nodes);
    const views: ExtraView[] = [];
    const flatten = (n: ViewNode) => {
      for (const c of n.children) flatten(c);
      views.push({
        camera: n.cam,
        target: n.target,
        scissor: n.scissor,
        shadowSlot: n.level === 1 ? Math.min(1, this.nodes.indexOf(n)) : -1,
        before: () => {
          this.configure(n.children, n.exit);
          this.body?.setViewVisible(true, n.cam.position);
        },
      });
    };
    for (const n of this.nodes) flatten(n);
    return views;
  }

  /** Set each portal's look for the view being drawn. */
  private configure(children: ViewNode[], hidden: Portal | null, camPos?: THREE.Vector3) {
    for (const pt of this.portals) {
      if (!pt) continue;
      if (pt === hidden) { pt.visual.show('hidden'); continue; }
      if (!this.linked) { pt.visual.show('membrane'); continue; }
      const child = children.find((c) => c.entry === pt);
      let near = false;
      if (camPos) {
        const s = pt.frame.side(camPos);
        if (s < 0.3 && s > -0.2) {
          const l = pt.frame.toLocal(camPos, _d);
          near = pt.frame.insideRect(l.x, l.y, 0.08);
        }
      }
      if (child) pt.visual.show('view', child.target.color, near);
      else pt.visual.show('deep');
    }
  }

  private mainView() {
    this.configure(this.nodes, null, this.game.renderer.lastCamera?.position ?? this.game.cameraCtl.camera.position);
    this.body?.setViewVisible(false);
  }

  // ------------------------------------------------------------------------------- HUD
  private updateHud(holding: boolean) {
    const g = this.game;
    const parent: HTMLElement | undefined = g.ui?.hud?.el;
    if (!parent) return;
    if (!this.hud) {
      const style = document.createElement('style');
      style.textContent = `.portal-mode .crosshair { display: none; }
.portal-xhair { position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px 0 0 -23px; pointer-events: none; display: none; filter: drop-shadow(0 0 3px rgba(0,0,0,0.6)); }`;
      document.head.appendChild(style);
      const el = document.createElement('div');
      el.className = 'portal-xhair';
      el.innerHTML = `<svg width="46" height="46" viewBox="-23 -23 46 46">
        <path data-p="lf" d="M -6 -15 A 15.5 15.5 0 0 0 -6 15 L -6 11 A 12 12 0 0 1 -6 -11 Z" fill="#2f8bff" opacity="0"/>
        <path data-p="l" d="M -6 -15 A 15.5 15.5 0 0 0 -6 15" fill="none" stroke="#5aa8ff" stroke-width="2.2" stroke-linecap="round"/>
        <path data-p="rf" d="M 6 -15 A 15.5 15.5 0 0 1 6 15 L 6 11 A 12 12 0 0 0 6 -11 Z" fill="#ff7a12" opacity="0"/>
        <path data-p="r" d="M 6 -15 A 15.5 15.5 0 0 1 6 15" fill="none" stroke="#ff9a40" stroke-width="2.2" stroke-linecap="round"/>
        <circle r="1.6" fill="rgba(255,255,255,0.9)"/>
      </svg>`;
      parent.appendChild(el);
      const q = (k: string) => el.querySelector(`[data-p="${k}"]`) as SVGElement;
      this.hud = el;
      this.hudParts = { l: q('l'), r: q('r'), lf: q('lf'), rf: q('rf') };
    }
    const show = holding && g.cameraCtl.perspective === 'first' && !g.ui?.hudHidden;
    if (show !== this.hudShown) {
      this.hudShown = show;
      this.hud.style.display = show ? 'block' : 'none';
      parent.classList.toggle('portal-mode', show);
    }
    if (show && this.hudParts) {
      this.hudParts.lf.setAttribute('opacity', this.portals[0] ? '0.95' : '0');
      this.hudParts.rf.setAttribute('opacity', this.portals[1] ? '0.95' : '0');
    }
  }

  // ------------------------------------------------------------------------------- save
  save(game: Game) {
    const f = (p: Portal | null) => (p ? { c: p.frame.c.toArray(), n: p.frame.n.toArray(), u: p.frame.up.toArray() } : null);
    return { dim: game.dimension, portals: this.portals.map(f) };
  }

  load(game: Game, data: any) {
    if (!data || data.dim !== game.dimension || !Array.isArray(data.portals)) return;
    data.portals.forEach((d: any, i: number) => {
      if (!d) return;
      const frame = new PortalFrame(new THREE.Vector3().fromArray(d.c), new THREE.Vector3().fromArray(d.n), new THREE.Vector3().fromArray(d.u));
      this.openPortal(i, frame, true);
    });
  }

  dispose() {
    this.reset();
    this.body?.dispose();
    for (const t of this.targets) t.dispose();
    this.hud?.remove();
  }
}
