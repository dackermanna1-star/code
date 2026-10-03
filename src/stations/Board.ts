// Cutting board: knife (tap to chop, swipe to slice), peeler, rolling pin and masher.

import * as THREE from 'three';
import { Station, type ActionSpec } from './Station';
import type { FoodItem, RestPose } from '../game/FoodItem';
import { cut, peel, flatten, mash, canCut, canPeel } from '../food/process';
import { getDef, hasDef } from '../food/catalog';
import type { ToolProp } from '../world/props/types';
import { ease } from '../game/anim';

export type ToolName = 'knife' | 'peeler' | 'rollingPin' | 'masher';

const TOOL_LABEL: Record<ToolName, string> = { knife: 'Knife', peeler: 'Peeler', rollingPin: 'Rolling Pin', masher: 'Masher' };

export class BoardStation extends Station {
  readonly id = 'board' as const;
  readonly label = 'Cutting Board';
  readonly icon = 'board';
  override capacity = 3;
  override combines = true;
  tool: ToolName = 'knife';
  private toolObj: THREE.Object3D | null = null;
  private toolHome = new Map<ToolName, { pos: THREE.Vector3; quat: THREE.Quaternion; parent: THREE.Object3D }>();
  private toolActive = false;
  private toolPos = new THREE.Vector3();
  private toolYaw = 0;
  private toolDown = 0; // 0..1 chop depth
  private busy = false;
  private queuedTap: FoodItem | null = null;
  private stroke: { last: THREE.Vector3; cutItems: Set<FoodItem>; dist: number } | null = null;
  private idleT = 0;

  constructor(game: import('../game/Game').Game) {
    super(game);
    const b = game.kitchen.board;
    const c = this.center();
    this.boxZone(c.clone().add(new THREE.Vector3(0, 0.08, 0)), [b.size[0] + 0.06, 0.18, b.size[1] + 0.06]);
    for (const [name, t] of Object.entries(game.kitchen.tools) as [ToolName, ToolProp][]) {
      t.root.updateMatrixWorld(true);
      this.toolHome.set(name, { pos: t.root.position.clone(), quat: t.root.quaternion.clone(), parent: t.root.parent ?? game.scene });
      this.registerPart(t.root, () => this.selectTool(name));
    }
  }

  center(): THREE.Vector3 {
    const b = this.game.kitchen.board;
    return b.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, b.surfaceY, 0));
  }

  protected override maxItemRadius(): number {
    return this.contents.length > 1 ? 0.13 : 0.19;
  }

  protected slot(item: FoodItem): RestPose {
    const i = this.contents.indexOf(item);
    const n = this.contents.length;
    const w = this.game.kitchen.board.size[0];
    const c = this.center();
    const x = n <= 1 ? 0 : -w * 0.3 + (i * (w * 0.6)) / (n - 1);
    return { pos: new THREE.Vector3(c.x + x, c.y, c.z + (i % 2 ? 0.02 : -0.02)), rotY: (item.state.seed % 60) * 0.01 - 0.3 };
  }

  override action(): ActionSpec | null {
    return null;
  }

  selectTool(name: ToolName) {
    if (this.game.camera.view !== 'board') {
      this.game.goTo('board');
    }
    if (this.tool === name && this.toolActive) return;
    this.putToolBack();
    this.tool = name;
    this.game.audio.play('click');
    this.game.ui.setTool(name);
    this.liftTool();
  }

  private liftTool() {
    const t = this.game.kitchen.tools[this.tool];
    if (!t) return;
    this.toolObj = t.root;
    t.root.userData.noPickTree = true;
    // move to the scene root so we can animate in world space
    const wp = t.root.getWorldPosition(new THREE.Vector3());
    this.game.scene.attach(t.root);
    t.root.position.copy(wp);
    this.toolActive = true;
    const c = this.center();
    this.toolPos.copy(c).add(new THREE.Vector3(this.game.kitchen.board.size[0] * 0.42, 0.1, 0.06));
    this.toolYaw = -0.4;
    this.idleT = 0;
  }

  private putToolBack() {
    if (!this.toolObj) return;
    const home = this.toolHome.get(this.tool);
    const obj = this.toolObj;
    this.toolObj = null;
    this.toolActive = false;
    obj.userData.noPickTree = false;
    if (!home) return;
    const from = obj.position.clone();
    const fromQ = obj.quaternion.clone();
    this.game.anim.run(0.35, (k) => {
      obj.position.lerpVectors(from, home.parent.localToWorld(home.pos.clone()), k);
      obj.quaternion.slerpQuaternions(fromQ, home.quat, k);
    }, { done: () => {
      home.parent.attach(obj);
      obj.position.copy(home.pos);
      obj.quaternion.copy(home.quat);
    } });
  }

  override enterView() {
    this.game.ui.setTool(this.tool);
    this.liftTool();
  }

  override leaveView() {
    this.putToolBack();
  }

  override tapItem(item: FoodItem) {
    if (this.game.camera.view !== 'board') {
      this.game.goTo('board');
      return;
    }
    if (!this.toolActive) this.liftTool();
    this.useTool(item, true);
  }

  /** Tapping near food on the board uses the tool on the nearest item (forgiving for little fingers). */
  override tapSurface(point: THREE.Vector3) {
    let best: FoodItem | null = null;
    let bd = 0.16;
    for (const it of this.contents) {
      const d = Math.hypot(it.position.x - point.x, it.position.z - point.z) - it.visual.radius * 0.5;
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    if (best) this.tapItem(best);
  }

  /** Apply the current tool to an item. */
  useTool(item: FoodItem, animate: boolean) {
    if (this.busy && animate) {
      // remember one tap made mid-chop so quick tapping keeps chopping at the knife's pace
      this.queuedTap = item;
      return;
    }
    const g = this.game;
    const def = hasDef(item.state.id) ? getDef(item.state.id) : null;
    const top = item.position.clone().add(new THREE.Vector3(0, item.visual.height * 0.6, 0));
    let next = null;
    switch (this.tool) {
      case 'knife':
        next = canCut(item.state) ? cut(item.state) : null;
        break;
      case 'peeler':
        next = canPeel(item.state) ? peel(item.state) : null;
        break;
      case 'rollingPin':
        next = flatten(item.state);
        break;
      case 'masher':
        next = mash(item.state);
        break;
    }
    const doIt = () => {
      if (!next) {
        item.wobble(0.8);
        g.audio.play('boing', { volume: 0.5, pitch: 1.2 });
        const msg = this.tool === 'knife' ? 'All chopped!' : this.tool === 'peeler' ? 'No peel!' : this.tool === 'rollingPin' ? 'Flat already!' : 'Mashed!';
        g.ui.floatLabel(msg, top.clone().add(new THREE.Vector3(0, 0.06, 0)), 'info');
        return;
      }
      item.setState(next, true);
      this.arrange();
      const flesh = def?.colors.juice ?? def?.colors.flesh ?? '#e8d8b0';
      const floor = this.center().y;
      switch (this.tool) {
        case 'knife': {
          g.audio.play('chop', { pitch: 0.9 + Math.random() * 0.25 });
          const juicy = def && ['juicy', 'liquid', 'creamy'].includes(def.texture);
          if (juicy) g.fx.splash(top, flesh, 6, floor, 0.6);
          g.fx.crumbs(top, def?.colors.flesh ?? '#e8d8b0', juicy ? 3 : 6, floor, 0.004);
          g.character.notice('cut', item.position);
          break;
        }
        case 'peeler':
          g.audio.play('peel');
          g.fx.peel(top, def?.colors.skin ?? '#c79a5b', floor, 5);
          break;
        case 'rollingPin':
          g.audio.play('roll');
          g.fx.dust(top, '#fbf7ee', 0.8);
          break;
        case 'masher':
          g.audio.play('mash');
          g.fx.splash(top, flesh, 5, floor, 0.4);
          break;
      }
      item.land(1.2);
      g.ui.floatLabel(item.name, item.position.clone().add(new THREE.Vector3(0, item.visual.height + 0.07, 0)), 'info', 0.9);
    };
    if (!animate || !this.toolObj) {
      doIt();
      return;
    }
    // tool animation: hop over the item, strike, recover
    this.busy = true;
    const above = item.position.clone().add(new THREE.Vector3(0, Math.max(0.06, item.visual.height + 0.05), 0));
    const start = this.toolPos.clone();
    this.game.anim
      .run(0.12, (k) => this.toolPos.lerpVectors(start, above, k), { ease: ease.outQuad })
      .then(() => this.game.anim.run(0.07, (k) => (this.toolDown = k), { ease: ease.inQuad }))
      .then(() => {
        doIt();
        return this.game.anim.run(0.16, (k) => (this.toolDown = 1 - k), { ease: ease.outQuad });
      })
      .then(() => {
        this.busy = false;
        const next = this.queuedTap;
        this.queuedTap = null;
        if (next && this.contents.includes(next) && this.game.camera.view === 'board') this.useTool(next, true);
      });
  }

  // knife swipes / tool strokes
  override gestureStart(point: THREE.Vector3): boolean {
    if (this.game.camera.view !== 'board') return false;
    if (!this.toolActive) this.liftTool();
    this.stroke = { last: point.clone(), cutItems: new Set(), dist: 0 };
    this.toolPos.copy(point).setY(this.center().y + 0.05);
    return true;
  }

  override gestureMove(point: THREE.Vector3) {
    const s = this.stroke;
    if (!s) return;
    const surfaceY = this.center().y;
    const p = point.clone().setY(surfaceY);
    const seg = p.clone().sub(s.last);
    s.dist += seg.length();
    if (seg.lengthSq() > 1e-6) this.toolYaw = Math.atan2(-seg.z, seg.x) + Math.PI / 2;
    this.toolPos.copy(p).setY(surfaceY + 0.03);
    this.toolDown = 0.6;
    // crossing items -> one action per item per stroke
    for (const it of this.contents) {
      if (s.cutItems.has(it) || it.mode !== 'rest') continue;
      const c = it.position;
      const d = distToSegment2D(c, s.last, p);
      if (d < Math.max(0.03, it.visual.radius * 0.8)) {
        s.cutItems.add(it);
        this.useTool(it, false);
        if (this.tool === 'knife') this.game.audio.play('slice', { volume: 0.7 });
      }
    }
    s.last.copy(p);
  }

  override gestureEnd() {
    this.stroke = null;
    this.toolDown = 0;
  }

  override update(dt: number) {
    const obj = this.toolObj;
    if (!obj) return;
    this.idleT += dt;
    // follow the tool target with a hand-like lag
    const target = this.toolPos.clone();
    target.y -= this.toolDown * 0.045;
    obj.position.lerp(target, 1 - Math.exp(-22 * dt));
    // pose per tool: knife & peeler held blade-down, rolling pin flat, masher upright
    const q = new THREE.Quaternion();
    const yaw = this.toolYaw;
    if (this.tool === 'knife') q.setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.25 - this.toolDown * 0.25, yaw, 0, 'YXZ'));
    else if (this.tool === 'peeler') q.setFromEuler(new THREE.Euler(-0.5 - this.toolDown * 0.4, yaw, 0, 'YXZ'));
    else if (this.tool === 'rollingPin') q.setFromEuler(new THREE.Euler(0, yaw + Math.PI / 2, 0, 'YXZ'));
    else q.setFromEuler(new THREE.Euler(0, yaw, Math.PI / 2 - 0.1, 'YXZ'));
    obj.quaternion.slerp(q, 1 - Math.exp(-16 * dt));
  }

  get toolLabel(): string {
    return TOOL_LABEL[this.tool];
  }
}

function distToSegment2D(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const abx = b.x - a.x, abz = b.z - a.z;
  const apx = p.x - a.x, apz = p.z - a.z;
  const len = abx * abx + abz * abz;
  const t = len > 0 ? Math.max(0, Math.min(1, (apx * abx + apz * abz) / len)) : 0;
  const dx = a.x + abx * t - p.x, dz = a.z + abz * t - p.z;
  return Math.sqrt(dx * dx + dz * dz);
}
