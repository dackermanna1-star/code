/**
 * The Ion Railgun (creative Combat): a hitscan beam weapon that reaches ships kilometres up.
 * LMB fires (0.3 s recharge): the slug hits the first ship, the mothership or the ground along
 * the aim (a small blast on the ground). Aim assist locks onto the ship nearest the crosshair
 * (within a few degrees, shown by a bracket), since fighters cross the sky far faster than you
 * can track them. Model: gunmetal receiver, twin rails wrapped in
 * glowing coils, a power cell and scope. Works with or without an invasion running.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Game } from '../game';
import type { GameSystem } from '../systems';
import { registerItem, addItemBehavior } from '../items/registry';
import { registerToolModel, type ModelPart } from '../../render/items/toolModels';
import { registerPainter } from '../../render/items/paint/index';
import { registerHandPose } from '../../render/items/hand';
import { Painter as P, rgba, lin, darken, lighten, rrect, type Ctx } from '../../render/items/paint/kit';
import { GUN_TO_ITEM } from '../portal/portalGunModel';
import { gunHandPose } from '../portal/portalItem';
import { shotRaycast } from '../portal/portalMath';
import { BillboardPool, BB_STREAK, BB_GLOW } from './alienRender';
import { ALIENS } from './targets';

registerItem('ion_railgun', {
  category: 'combat',
  displayName: 'Ion Railgun',
  maxStack: 1,
  rarity: 'epic',
  visual: { kind: 'model', id: 'ion_railgun', color: 0x3a3f47, color2: 0x45f4ff },
});

function parts(): ModelPart[] {
  const clean = (g: THREE.BufferGeometry) => {
    const y = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(y.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') y.deleteAttribute(k);
    if (!y.attributes.uv) y.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(y.attributes.position.count * 2), 2));
    return y;
  };
  const merge = (l: THREE.BufferGeometry[]) => mergeGeometries(l.map(clean))!.applyMatrix4(GUN_TO_ITEM);
  const body: THREE.BufferGeometry[] = [], metal: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [];
  body.push(new RoundedBoxGeometry(0.1, 0.13, 0.5, 3, 0.025).translate(0, 0, 0.02));
  body.push(new RoundedBoxGeometry(0.07, 0.11, 0.26, 3, 0.02).rotateX(-0.12).translate(0, -0.01, 0.36));
  dark.push(new RoundedBoxGeometry(0.05, 0.15, 0.065, 3, 0.015).rotateX(0.3).translate(0, -0.12, 0.1));
  for (const y of [0.035, -0.035]) metal.push(new THREE.BoxGeometry(0.03, 0.022, 0.62).translate(0, y, -0.5));
  for (let i = 0; i < 6; i++) glow.push(new THREE.TorusGeometry(0.052, 0.009, 6, 18).translate(0, 0, -0.27 - i * 0.075));
  glow.push(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 10).rotateX(Math.PI / 2).translate(0.065, -0.02, 0.05));
  glow.push(new THREE.SphereGeometry(0.018, 8, 6).translate(0, 0, -0.8));
  dark.push(new THREE.CylinderGeometry(0.024, 0.028, 0.18, 12).rotateX(Math.PI / 2).translate(0, 0.095, -0.02));
  dark.push(new THREE.BoxGeometry(0.02, 0.04, 0.03).translate(0, 0.075, -0.02));
  return [
    { geometry: merge(body), spec: { color: 0x3a3f47, roughness: 0.38, metalness: 0.7, key: 'rail_body' } },
    { geometry: merge(metal), spec: { color: 0xa8b0ba, roughness: 0.22, metalness: 1, key: 'rail_metal' } },
    { geometry: merge(dark), spec: { color: 0x15171b, roughness: 0.6, key: 'rail_dark' } },
    { geometry: merge(glow), spec: { color: 0x45f4ff, roughness: 0.3, emissive: 2.6, key: 'rail_glow' } },
  ];
}
let cached: ModelPart[] | null = null;
registerToolModel('ion_railgun', () => (cached ??= parts()));

registerPainter('ion_railgun', (p: P) => {
  const rot = (g: Ctx) => { g.translate(8, 8); g.rotate(-Math.PI / 4); g.translate(-8, -8); };
  const part = (path: (g: Ctx) => void, fill: number, shade?: (g: Ctx) => void, mat?: any) =>
    p.part((g) => { g.save(); rot(g); path(g); g.restore(); g.fillStyle = rgba(fill); g.fill(); }, shade ? (g) => { g.save(); rot(g); shade(g); g.restore(); } : undefined, mat);
  part((g) => rrect(g, 1.0, 7.4, 4.0, 2.2, 0.6), 0x2a2e35);
  part((g) => rrect(g, 4.6, 6.6, 5.4, 3.0, 0.7), 0x3a3f47, (g) => { g.fillStyle = lin(g, 0, 6.6, 0, 9.6, [[0, lighten(0x3a3f47, 0.35)], [1, darken(0x3a3f47, 0.3)]]); g.fillRect(0, 0, 16, 16); }, { metal: 0.7, rough: 0.4 });
  part((g) => rrect(g, 6.2, 9.4, 1.0, 2.6, 0.4), 0x15171b);
  part((g) => { rrect(g, 9.8, 7.0, 5.6, 0.6, 0.2); rrect(g, 9.8, 8.8, 5.6, 0.6, 0.2, false); }, 0xa8b0ba, undefined, { metal: 1, rough: 0.2 });
  for (let i = 0; i < 5; i++) part((g) => rrect(g, 10.3 + i * 1.0, 6.7, 0.35, 3.0, 0.15), 0x45f4ff, undefined, { emissive: 1 });
  part((g) => rrect(g, 6.0, 5.6, 2.6, 0.9, 0.3), 0x15171b);
});

registerHandPose('ion_railgun', (ps, o) => gunHandPose(ps.m, o.equip));

const _aim = new THREE.Vector3();

/** Aim-assist cone (radians) and range. */
const LOCK_CONE = 0.075;
const RANGE = 4000;

interface Beam {
  a: THREE.Vector3;
  b: THREE.Vector3;
  age: number;
}

export class RailgunSystem implements GameSystem {
  readonly name = 'railgun';
  private game!: Game;
  private scene = new THREE.Scene();
  private pool: BillboardPool | null = null;
  private beams: Beam[] = [];
  private cd = 0;
  private recoil = 0;
  private time = 0;
  private lockEl: HTMLDivElement | null = null;

  init(game: Game) {
    this.game = game;
    addItemBehavior('ion_railgun', { ownsMouse: true });
    registerHandPose('ion_railgun', (ps, o) => gunHandPose(ps.m, o.equip, this.recoil, this.time));
    (game.renderExtras.forward ??= []).push(this.scene);
  }

  update(game: Game, dt: number) {
    this.time += dt;
    this.cd -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 2.2);
    const p: any = game.player;
    const holding = !!p && !p.dead && !p.vehicle && !p.spectator && p.mainHand?.item.name === 'ion_railgun';
    if (holding && game.input.enabled && !game.paused && game.input.isDown('attack') && this.cd <= 0) this.fire();
    this.updateLock(holding && !game.paused);
    if (!this.pool && this.beams.length) {
      this.pool = new BillboardPool(game.renderer, 64, false, 1.2);
      this.scene.add(this.pool.mesh);
    }
    if (this.pool) {
      this.pool.begin();
      for (let i = this.beams.length - 1; i >= 0; i--) {
        const b = this.beams[i];
        b.age += dt;
        if (b.age > 0.35) { this.beams.splice(i, 1); continue; }
        const f = 1 - b.age / 0.35;
        const d = b.b.clone().sub(b.a);
        const L = d.length();
        d.divideScalar(L);
        const mid = b.a.clone().addScaledVector(d, L / 2);
        this.pool.push(mid.x, mid.y, mid.z, 0.12 + (1 - f) * 0.3, L / 2, 3 * f * f, 14 * f * f, 16 * f * f, 1, BB_STREAK, 0, 0, d.x, d.y, d.z);
        this.pool.push(b.b.x, b.b.y, b.b.z, 2.5 * f, 2.5 * f, 4 * f, 12 * f, 14 * f, 1, BB_GLOW, 0);
      }
      this.pool.commit();
    }
  }

  /** Bracket over the ship the aim assist will hit. */
  private updateLock(on: boolean) {
    const g = this.game;
    let target: THREE.Vector3 | null = null;
    const cam = g.cameraCtl.camera;
    if (on && ALIENS.active) {
      const d = _aim.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
      target = ALIENS.active.lockOn(cam.position, d, RANGE, LOCK_CONE);
    }
    if (!target) { if (this.lockEl) this.lockEl.style.display = 'none'; return; }
    if (!this.lockEl) {
      const parent = (g as any).ui?.hud?.el ?? document.body;
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;pointer-events:none;z-index:5;' +
        'background:linear-gradient(#ff4b3e,#ff4b3e) 0 0/10px 2px,linear-gradient(#ff4b3e,#ff4b3e) 0 0/2px 10px,' +
        'linear-gradient(#ff4b3e,#ff4b3e) 100% 0/10px 2px,linear-gradient(#ff4b3e,#ff4b3e) 100% 0/2px 10px,' +
        'linear-gradient(#ff4b3e,#ff4b3e) 0 100%/10px 2px,linear-gradient(#ff4b3e,#ff4b3e) 0 100%/2px 10px,' +
        'linear-gradient(#ff4b3e,#ff4b3e) 100% 100%/10px 2px,linear-gradient(#ff4b3e,#ff4b3e) 100% 100%/2px 10px;background-repeat:no-repeat;' +
        'filter:drop-shadow(0 0 3px #ff4b3e)';
      parent.appendChild(el);
      this.lockEl = el;
    }
    const p = _aim.copy(target).project(cam);
    if (p.z > 1) { this.lockEl.style.display = 'none'; return; }
    const box = this.lockEl.parentElement!;
    const w = box.clientWidth || window.innerWidth, h = box.clientHeight || window.innerHeight;
    this.lockEl.style.display = 'block';
    this.lockEl.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px) rotate(${(this.time * 90) % 90}deg)`;
  }

  private fire() {
    const g = this.game;
    this.cd = 0.3;
    this.recoil = 0.3;
    const cam = g.cameraCtl.camera;
    const o = cam.position.clone();
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const hit = shotRaycast(g.world, o, d, 900);
    const maxT = hit ? hit.dist : RANGE;
    const r = ALIENS.active?.rayHit(o, d, maxT, 70, LOCK_CONE) ?? { t: maxT, what: null };
    const end = r.at ? r.at.clone() : o.clone().addScaledVector(d, r.what ? r.t : maxT);
    const muzzle = new THREE.Vector3(0.2, -0.16, -0.8).applyQuaternion(cam.quaternion).add(o);
    this.beams.push({ a: muzzle, b: end, age: 0 });
    g.audio?.play?.('alien.railgun', { volume: 1 });
    g.particles?.flash?.(muzzle.x, muzzle.y, muzzle.z, 0x6ff6ff, 6, 0.1, 5);
    if (!r.what && hit) {
      const ex: any = (g as any).explosions;
      ex?.explode?.(hit.point.clone().addScaledVector(d, -0.3), 1.6, { breakBlocks: true, source: g.player });
    }
  }

  onWorldChange() {
    this.beams.length = 0;
    if (this.lockEl) this.lockEl.style.display = 'none';
  }
}
