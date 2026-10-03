// Pointer input: picking, taps, item drag & drop, station gestures, overview panning,
// dragging ingredients out of the fridge and pouring seasonings.

import * as THREE from 'three';
import type { Game } from './Game';
import type { FoodItem, Holder } from './FoodItem';
import { Station } from '../stations/Station';
import { makeFood, type FoodState } from '../food/types';
import { getDef, getSeasoning, hasDef } from '../food/catalog';
import { combine, addSeasoning, isContainerProduct } from '../food/process';
import { COUNTER } from '../world/layout';
import type { SeasoningDef } from '../food/types';

export type DropTarget =
  | { kind: 'station'; station: Station; point: THREE.Vector3 }
  | { kind: 'item'; item: FoodItem; point: THREE.Vector3 }
  | { kind: 'character'; point: THREE.Vector3 }
  | { kind: 'trash'; point: THREE.Vector3 }
  | { kind: 'counter'; point: THREE.Vector3 }
  | { kind: 'dock'; station: Station }
  | { kind: 'hud-trash' };

interface PickHit {
  item?: FoodItem;
  part?: { station: Station; obj: THREE.Object3D };
  character?: boolean;
  station?: Station;
  trash?: boolean;
  point?: THREE.Vector3;
  object?: THREE.Object3D;
}

type Mode = 'none' | 'pending' | 'item' | 'gesture' | 'pan' | 'season';

const TAP_PX = 9;

/** Is this state a base you build dishes on (bread, buns, flat dough, tortilla, pancakes...)? */
export function isBuildBase(s: FoodState): boolean {
  if (s.id === 'assembly') return true;
  if (!hasDef(s.id)) return false;
  const d = getDef(s.id);
  if (d.tags.includes('base') || d.tags.includes('bun')) return true;
  if ((s.id === 'dough' || s.id === 'cookie-dough') && s.form === 'flat') return true;
  if (d.cut === 'bun' && s.form === 'halved') return true;
  if (d.cut === 'bread' && s.form === 'sliced') return true;
  return false;
}

export class Interaction {
  dragItem: FoodItem | null = null;
  private origin: { holder: Holder | null; pos: THREE.Vector3; fromPantry: boolean } | null = null;
  target: DropTarget | null = null;
  private hoverStation: Station | null = null;
  private hoverItem: FoodItem | null = null;
  private pointerId: number | null = null;
  private press: { x: number; y: number; t: number; hit: PickHit } | null = null;
  private mode: Mode = 'none';
  private gestureStation: Station | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private lastX = 0;
  private lastY = 0;
  private season: { def: SeasoningDef; bottle: THREE.Object3D; nozzle: THREE.Vector3; pos: THREE.Vector3; tilt: number; target: FoodItem | Station | null; acc: number; total: number } | null = null;
  private trashHover = false;

  constructor(private game: Game, private el: HTMLElement) {
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e, true));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ------------------------------------------------------------------------------------------
  // Picking

  private setRay(x: number, y: number) {
    const r = this.el.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.game.camera.camera);
  }

  /** True while a finger is busy dragging food or pouring a seasoning. */
  get active(): boolean {
    return !!this.dragItem || !!this.season || this.mode !== 'none';
  }

  get ray(): THREE.Ray {
    return this.raycaster.ray;
  }

  private visiblePickables(exclude?: FoodItem): THREE.Object3D[] {
    const list: THREE.Object3D[] = [];
    for (const it of this.game.items.list) if (it !== exclude && it.root.visible && it.mode !== 'fly') list.push(it.visual.content);
    for (const st of this.game.stationList) for (const obj of st.parts.keys()) list.push(obj);
    list.push(...this.game.character.pickMeshes);
    return list;
  }

  pick(x: number, y: number, exclude?: FoodItem): PickHit {
    this.setRay(x, y);
    const hits = this.raycaster.intersectObjects(this.visiblePickables(exclude), true);
    outer: for (const h of hits) {
      if (h.object.userData.noPick) continue;
      for (let a: THREE.Object3D | null = h.object; a; a = a.parent) if (a.userData.noPickTree) continue outer;
      const item = this.game.items.fromObject(h.object);
      if (item) return { item, point: h.point, object: h.object };
      let o: THREE.Object3D | null = h.object;
      while (o) {
        if (o.userData.character) return { character: true, point: h.point, object: h.object };
        const partOf = o.userData.partOf as THREE.Object3D | undefined;
        if (partOf) {
          const st = this.game.stationList.find((s) => s.parts.has(partOf));
          if (st) return { part: { station: st, obj: partOf }, point: h.point, object: h.object };
        }
        o = o.parent;
      }
    }
    // invisible zones
    const zones: THREE.Object3D[] = [this.game.trash.zone, this.game.character.zone];
    for (const st of this.game.stationList) zones.push(...st.zones);
    const zh = this.raycaster.intersectObjects(zones, false);
    if (zh.length) {
      const o = zh[0].object;
      if (o.userData.trash) return { trash: true, point: zh[0].point };
      if (o.userData.character) return { character: true, point: zh[0].point };
      const st = o.userData.station as Station | undefined;
      if (st) {
        const hidden = st.hiddenPick();
        if (hidden) return { item: hidden, station: st, point: zh[0].point };
        return { station: st, point: zh[0].point };
      }
    }
    // counter top
    const p = this.planePoint(COUNTER.topY);
    if (p && this.game.counter.contains(p)) return { point: p };
    return {};
  }

  private planePoint(y: number): THREE.Vector3 | null {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, out) ? out : null;
  }

  /** Height of the drag plane for the current view. */
  private workY(): number {
    const v = this.game.camera.view;
    if (v === 'overview') return COUNTER.topY + 0.16;
    if (v === 'table' || v === 'plate') return 0.74 + 0.16;
    const st = this.game.stations[v as keyof typeof this.game.stations];
    return st ? st.center().y + 0.14 : COUNTER.topY + 0.16;
  }

  // ------------------------------------------------------------------------------------------
  // Pointer events

  private onDown(e: PointerEvent) {
    this.game.audio.unlock();
    this.game.ui.onUserGesture();
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    const hit = this.pick(e.clientX, e.clientY);
    this.press = { x: e.clientX, y: e.clientY, t: performance.now(), hit };
    this.mode = 'pending';
    // station gesture (not on food): knife strokes, whisking, stirring, pan shaking
    const view = this.game.camera.view;
    const st = this.game.currentStation();
    if (st && !hit.item && (hit.station === st || hit.part?.station === st || !hit.station) && view === st.view) {
      const point = hit.point ?? this.planePoint(st.center().y) ?? st.center();
      if (st.gestureStart(point, hit.object ?? null)) {
        this.mode = 'gesture';
        this.gestureStation = st;
      }
    }
  }

  private onMove(e: PointerEvent) {
    // parallax (mouse hover)
    const r = this.el.getBoundingClientRect();
    if (e.pointerType === 'mouse') this.game.camera.setParallax(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    if (this.mode === 'season' && this.season) {
      this.moveSeason(e.clientX, e.clientY);
      return;
    }
    if (this.pointerId !== e.pointerId) {
      if (this.pointerId === null && e.pointerType === 'mouse') this.hoverFeedback(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - this.lastX;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    if (this.mode === 'pending' && this.press) {
      const moved = Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y);
      if (moved > TAP_PX) {
        const hit = this.press.hit;
        if (hit.item && !this.game.character.busyWith(hit.item)) this.startDrag(hit.item, e.clientX, e.clientY);
        else if (this.game.camera.view === 'overview') this.mode = 'pan';
        else this.mode = 'none';
      }
    }
    if (this.mode === 'item') this.moveDrag(e.clientX, e.clientY);
    else if (this.mode === 'gesture' && this.gestureStation) {
      this.setRay(e.clientX, e.clientY);
      const st = this.gestureStation;
      const p = this.planePoint(st.center().y) ?? st.center();
      st.gestureMove(p, this.raycaster.ray);
    } else if (this.mode === 'pan') {
      this.game.camera.pan(dx, r.width);
    }
  }

  private onUp(e: PointerEvent, cancelled = false) {
    if (this.mode === 'season' && this.season) {
      this.endSeason();
      this.pointerId = null;
      this.mode = 'none';
      return;
    }
    if (this.pointerId !== e.pointerId) return;
    this.pointerId = null;
    try {
      this.el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (this.mode === 'item') this.endDrag(cancelled);
    else if (this.mode === 'gesture' && this.gestureStation) {
      const st = this.gestureStation;
      st.gestureEnd();
      // a gesture that did not move counts as a tap
      if (this.press && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) <= TAP_PX && !cancelled) this.tap(this.press.hit);
      this.gestureStation = null;
    } else if (this.mode === 'pending' && this.press && !cancelled) this.tap(this.press.hit);
    else if (this.mode === 'pan') this.game.camera.releasePan();
    this.mode = 'none';
    this.press = null;
  }

  private hoverFeedback(x: number, y: number) {
    const hit = this.pick(x, y);
    const item = hit.item ?? null;
    if (item !== this.hoverItem) {
      this.hoverItem?.visual.setHighlight(0);
      this.hoverItem = item;
      item?.visual.setHighlight(0.25);
    }
    const pointer = item || hit.part || hit.character || (hit.station && this.game.camera.view === 'overview');
    this.el.style.cursor = pointer ? 'pointer' : 'default';
  }

  // ------------------------------------------------------------------------------------------
  // Taps

  private tap(hit: PickHit) {
    const g = this.game;
    if (hit.item) {
      const h = hit.item.holder;
      if (h instanceof Station) {
        if (g.camera.view !== h.view && g.camera.view === 'overview') g.goTo(h.view);
        else h.tapItem(hit.item, hit.point ?? hit.item.position);
      } else {
        hit.item.wobble(1);
        g.audio.play('tap', { pitch: 0.9 + Math.random() * 0.3 });
        g.character.notice('poke-food', hit.item.position);
      }
      return;
    }
    if (hit.part) {
      const st = hit.part.station;
      // first tap on a far-away station flies there; taps on parts of the visible station act
      if (g.camera.view === 'overview' && st.id !== 'plate') {
        g.goTo(st.view);
        return;
      }
      st.parts.get(hit.part.obj)?.();
      return;
    }
    if (hit.character) {
      if (g.camera.view === 'overview') g.goTo('plate');
      g.character.tap();
      return;
    }
    if (hit.trash) {
      g.audio.play('tap');
      return;
    }
    if (hit.station) {
      if (g.camera.view !== hit.station.view) g.goTo(hit.station.view);
      else hit.station.tapSurface(hit.point ?? hit.station.center());
      return;
    }
    // plain worktop taps in a station view: let the station decide (board: chop nearest)
    const st = g.currentStation();
    if (st && hit.point) st.tapSurface(hit.point);
  }

  // ------------------------------------------------------------------------------------------
  // Dragging food

  startDrag(item: FoodItem, x: number, y: number, fromPantry = false) {
    this.mode = 'item';
    this.dragItem = item;
    this.origin = { holder: item.holder, pos: item.position.clone(), fromPantry };
    item.holder?.release(item);
    item.beginDrag();
    this.game.audio.play('pickup', { pitch: 0.95 + Math.random() * 0.15 });
    if (item.name) this.game.ui.floatLabel(item.name, item.position.clone().add(new THREE.Vector3(0, item.visual.height + 0.1, 0)), 'info', 0.8);
    this.game.character.watch(item);
    this.game.ui.setDragging(true);
    this.moveDrag(x, y);
  }

  /** Start dragging a brand-new ingredient out of the fridge panel. */
  beginPantryDrag(id: string, x: number, y: number, pointerId: number) {
    if (this.dragItem) return;
    this.pointerId = pointerId;
    this.setRay(x, y);
    const p = this.planePoint(this.workY()) ?? new THREE.Vector3(0, COUNTER.topY + 0.2, -0.5);
    const item = this.game.items.spawn(makeFood(id), p);
    item.snapTo(p);
    this.game.fx.poof(p, '#ffffff', 0.4);
    this.startDrag(item, x, y, true);
  }

  private moveDrag(x: number, y: number) {
    const item = this.dragItem;
    if (!item) return;
    this.setRay(x, y);
    const target = this.findTarget(x, y, item);
    this.setTarget(target);
    let hover: THREE.Vector3 | null = null;
    if (target) {
      switch (target.kind) {
        case 'station':
          hover = target.station.hoverPoint();
          break;
        case 'item':
          hover = target.item.position.clone().add(new THREE.Vector3(0, target.item.visual.height + 0.06, 0));
          break;
        case 'character':
          hover = this.game.character.mouthWorld().add(new THREE.Vector3(0, -0.11, 0.17));
          break;
        case 'trash':
          hover = this.game.trash.mouth.clone().add(new THREE.Vector3(0, 0.14, 0));
          break;
        default:
          break;
      }
    }
    const plane = this.planePoint(this.workY());
    const free = plane ?? item.position.clone();
    // clamp to the room
    free.x = THREE.MathUtils.clamp(free.x, -3.2, 3.3);
    free.z = THREE.MathUtils.clamp(free.z, -0.95, 1.4);
    // blend towards the hover point so it feels magnetic but still follows the finger
    const want = hover ? free.clone().lerp(hover, 0.75) : free;
    item.dragTarget.copy(want);
    item.shadowSurfaceY = target?.kind === 'station' ? target.station.surfaceY(item) : target?.kind === 'item' ? target.item.position.y + target.item.visual.height : want.y - 0.16;
    this.game.ui.dragAt(x, y);
  }

  private findTarget(x: number, y: number, item: FoodItem): DropTarget | null {
    // HUD first
    const hud = this.game.ui.dropTargetAt(x, y);
    if (hud) return hud;
    const hit = this.pick(x, y, item);
    if (hit.item && hit.item !== item) {
      const h = hit.item.holder;
      const canCombine = (h?.combines || isBuildBase(hit.item.state)) && !(h instanceof Station && h.id !== 'plate' && h.id !== 'board');
      if (canCombine && !isContainerProduct(hit.item.state)) return { kind: 'item', item: hit.item, point: hit.point! };
      if (h instanceof Station) return { kind: 'station', station: h, point: hit.point! };
    }
    if (hit.character) return { kind: 'character', point: hit.point! };
    if (hit.part) return { kind: 'station', station: hit.part.station, point: hit.point! };
    if (hit.station) return { kind: 'station', station: hit.station, point: hit.point! };
    if (hit.trash) return { kind: 'trash', point: hit.point! };
    if (hit.point && this.game.counter.contains(hit.point)) return { kind: 'counter', point: hit.point };
    return null;
  }

  private setTarget(t: DropTarget | null) {
    const prevStation = this.hoverStation;
    const nextStation = t?.kind === 'station' ? t.station : t?.kind === 'dock' ? null : null;
    if (prevStation !== nextStation) {
      prevStation?.hover(false);
      nextStation?.hover(true);
      this.hoverStation = nextStation;
      if (nextStation) this.game.audio.play('tap', { volume: 0.3, pitch: 1.6 });
    }
    const nextItem = t?.kind === 'item' ? t.item : null;
    if (this.hoverItem !== nextItem) {
      this.hoverItem?.visual.setHighlight(0);
      nextItem?.visual.setHighlight(0.55);
      this.hoverItem = nextItem;
    }
    const trash = t?.kind === 'trash';
    if (trash !== this.trashHover) {
      this.game.trash.hover(trash);
      this.trashHover = trash;
    }
    this.game.character.anticipate(t?.kind === 'character' ? this.dragItem : null);
    this.game.ui.highlightDrop(t);
    this.target = t;
  }

  private endDrag(cancelled: boolean) {
    const item = this.dragItem;
    const target = cancelled ? null : this.target;
    this.setTarget(null);
    this.dragItem = null;
    this.game.ui.setDragging(false);
    this.game.character.watch(null);
    if (!item) return;
    this.drop(item, target);
  }

  cancelDrag() {
    this.setTarget(null);
    this.dragItem = null;
    this.mode = 'none';
    this.game.ui.setDragging(false);
  }

  /** Resolve a drop. */
  drop(item: FoodItem, target: DropTarget | null) {
    const g = this.game;
    const origin = this.origin;
    this.origin = null;
    if (!target) {
      // nowhere sensible: back where it came from (or back into the fridge)
      if (origin?.fromPantry) {
        g.fx.poof(item.position, '#ffffff', 0.6);
        g.audio.play('swish', { volume: 0.6 });
        g.items.remove(item);
        return;
      }
      const back = origin?.holder;
      if (back && back.accepts(item)) {
        back.receive(item, origin!.pos);
        const pose = back.restPose(item);
        item.flyTo(pose.pos, { onLand: () => item.settle(back.restPose(item)) });
      } else this.parkOnCounter(item, origin?.pos);
      return;
    }
    switch (target.kind) {
      case 'station':
        this.toStation(item, target.station);
        break;
      case 'dock':
        this.toStation(item, target.station, true);
        break;
      case 'item':
        this.combineInto(item, target.item);
        break;
      case 'character':
        g.feed(item);
        break;
      case 'trash':
      case 'hud-trash':
        g.trash.dispose(item);
        break;
      case 'counter':
        this.parkOnCounter(item, target.point);
        break;
    }
  }

  toStation(item: FoodItem, st: Station, fly = false) {
    const g = this.game;
    if (st.id === 'plate' && st.contents.length && st.contents[0] !== item) {
      this.combineInto(item, st.contents[0]);
      return;
    }
    if (!st.accepts(item)) {
      g.ui.floatLabel(st.contents.length >= st.capacity ? 'Full!' : 'Nope!', st.hoverPoint(), 'info');
      g.audio.play('boing', { volume: 0.5 });
      this.parkOnCounter(item);
      return;
    }
    st.receive(item);
    const pose = st.restPose(item);
    item.flyTo(pose.pos, {
      dur: fly ? 0.7 : 0.28,
      height: fly ? 0.35 : 0.06,
      onLand: () => {
        item.settle(st.restPose(item));
        this.landFx(item, st.surfaceY(item));
      },
    });
    // dropping into a station from afar flies the camera there
    if (g.camera.view === 'overview' || fly) g.goTo(st.view);
  }

  parkOnCounter(item: FoodItem, at?: THREE.Vector3) {
    const g = this.game;
    g.counter.receive(item, at ?? new THREE.Vector3(2.3, COUNTER.topY, -0.62));
    const pose = g.counter.restPose(item);
    item.flyTo(pose.pos, { height: at ? 0.05 : 0.3, onLand: () => this.landFx(item, COUNTER.topY) });
  }

  combineInto(item: FoodItem, base: FoodItem) {
    const g = this.game;
    let combined: FoodState;
    try {
      combined = combine(base.state, item.state);
    } catch (e) {
      console.warn('combine failed', e);
      this.parkOnCounter(item);
      return;
    }
    const top = base.position.clone().add(new THREE.Vector3(0, base.visual.height, 0));
    item.flyTo(top, {
      dur: 0.25,
      height: 0.05,
      onLand: () => {
        g.items.remove(item);
        base.setState(combined, true);
        if (base.holder) base.settle(base.holder.restPose(base));
        base.land(1.4);
        g.fx.sparkle(top, 8);
        g.audio.play('combine');
        g.ui.floatLabel(base.name, top.clone().add(new THREE.Vector3(0, 0.08, 0)), 'good');
        g.character.notice('combine', base.position);
      },
    });
  }

  landFx(item: FoodItem, floorY: number) {
    const g = this.game;
    const tex = hasDef(item.state.id) ? getDef(item.state.id).texture : 'soft';
    const map: Record<string, Parameters<typeof g.audio.play>[0]> = { liquid: 'drop-liquid', crunchy: 'drop-crunchy', crispy: 'drop-crunchy', juicy: 'drop-squish', creamy: 'drop-squish', powder: 'drop-soft', chewy: 'drop-soft', fluffy: 'drop-soft', soft: 'drop-soft' };
    g.audio.play(map[tex] ?? 'drop-soft', { pitch: 0.9 + Math.random() * 0.2 });
    if (tex === 'powder') g.fx.dust(item.position.clone().setY(floorY + 0.02));
    else if (tex === 'crispy' || tex === 'crunchy') g.fx.crumbs(item.position.clone().setY(floorY + 0.02), hasDef(item.state.id) ? getDef(item.state.id).colors.flesh : '#e8c890', 3, floorY, 0.003);
  }

  // ------------------------------------------------------------------------------------------
  // Seasoning

  beginSeasonDrag(id: string, x: number, y: number, pointerId: number) {
    const def = getSeasoning(id);
    const bottle = this.game.makeBottle(def);
    this.game.scene.add(bottle.root);
    bottle.root.scale.setScalar(1.25);
    this.pointerId = pointerId;
    this.mode = 'season';
    this.season = { def, bottle: bottle.root, nozzle: bottle.nozzle, pos: new THREE.Vector3(), tilt: 0, target: null, acc: 0, total: 0 };
    this.game.audio.play('pickup');
    this.moveSeason(x, y);
    this.season.bottle.position.copy(this.season.pos);
  }

  private moveSeason(x: number, y: number) {
    const s = this.season!;
    this.setRay(x, y);
    const hit = this.pick(x, y);
    let target: FoodItem | Station | null = null;
    let anchor: THREE.Vector3 | null = null;
    if (hit.item) {
      const h = hit.item.holder;
      if (h instanceof Station && ['pot', 'bowl', 'blender', 'pan'].includes(h.id) && (isContainerProduct(hit.item.state) || h.id === 'pot')) target = h;
      else target = hit.item;
      anchor = target instanceof Station ? target.center() : hit.item.position.clone().add(new THREE.Vector3(0, hit.item.visual.height, 0));
    } else if (hit.station && hit.station.contents.length) {
      target = hit.station;
      anchor = hit.station.center();
    }
    s.target = target;
    const plane = this.planePoint(this.workY() + 0.1) ?? s.pos;
    const want = anchor ? anchor.clone().add(new THREE.Vector3(0.05, 0.16, 0.02)) : plane;
    s.pos.copy(anchor ? plane.clone().lerp(want, 0.8) : plane);
    this.game.ui.dragAt(x, y);
  }

  /** Called every frame: animate the bottle & dispense. */
  updateSeason(dt: number) {
    const s = this.season;
    if (!s) return;
    const b = s.bottle;
    b.position.lerp(s.pos, 1 - Math.exp(-18 * dt));
    const pouring = !!s.target;
    const kind = s.def.kind;
    const tiltTarget = pouring ? (kind === 'shake' ? 2.5 : kind === 'spread' ? 1.2 : 2.2) : 0.15;
    s.tilt += (tiltTarget - s.tilt) * (1 - Math.exp(-10 * dt));
    const shake = pouring && kind === 'shake' ? Math.sin(performance.now() / 45) * 0.25 : 0;
    b.rotation.set(0, 0, s.tilt + shake);
    if (!pouring) return;
    // nozzle in world space
    b.updateMatrixWorld(true);
    const noz = s.nozzle.clone().applyMatrix4(b.matrixWorld);
    const g = this.game;
    const color = s.def.color;
    const floor = s.target instanceof Station ? s.target.center().y : (s.target as FoodItem).position.y + (s.target as FoodItem).visual.height * 0.6;
    if (kind === 'shake') {
      for (let i = 0; i < 2; i++)
        g.fx.particles.emit({ pos: noz.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.02)), vel: new THREE.Vector3((Math.random() - 0.5) * 0.1, -0.6, (Math.random() - 0.5) * 0.1), acc: new THREE.Vector3(0, -3, 0), life: 0.35, size: s.def.id === 'sprinkles' ? 0.008 : 0.005, color: s.def.id === 'sprinkles' ? ['#ff5fa8', '#ffd23f', '#5fd3ff', '#7ce08a'][Math.floor(Math.random() * 4)] : color, sprite: s.def.id === 'sprinkles' ? 13 : 8, fadeIn: 0 });
    } else if (kind === 'squeeze' || kind === 'pour') {
      g.fx.particles.emit({ pos: noz.clone(), vel: new THREE.Vector3(0, -0.8, 0), acc: new THREE.Vector3(0, -4, 0), life: Math.max(0.12, (noz.y - floor) / 1.2), size: kind === 'squeeze' ? 0.012 : 0.009, color, sprite: 4, fadeIn: 0, rot: Math.PI });
    } else if (kind === 'spread' || kind === 'spray') {
      if (Math.random() < 0.5) g.fx.particles.emit({ pos: noz.clone(), vel: new THREE.Vector3(0, -0.5, 0), acc: new THREE.Vector3(0, -3, 0), life: Math.max(0.1, (noz.y - floor) / 1.0), size: 0.018, color, sprite: 8, fadeIn: 0 });
    }
    // apply
    s.acc += dt;
    s.total += dt;
    if (s.acc >= 0.25) {
      const amount = s.acc * 0.8;
      s.acc = 0;
      const tgt = s.target;
      if (tgt instanceof Station) {
        const list = tgt.contents.filter((i) => i.mode === 'rest');
        for (const it of list) {
          if ((it.state.season[s.def.id] ?? 0) < 4) addSeasoning(it.state, s.def.id, amount / Math.max(1, list.length));
          it.refresh();
        }
        if (list[0]) g.character.notice('season', list[0].position);
      } else if (tgt) {
        if ((tgt.state.season[s.def.id] ?? 0) < 4) addSeasoning(tgt.state, s.def.id, amount);
        tgt.refresh();
        tgt.wobble(0.15);
        g.decals.add(tgt, s.def, noz);
      }
      g.audio.play(kind === 'shake' ? 'shake' : kind === 'squeeze' ? 'squeeze' : kind === 'spray' ? 'spray' : kind === 'spread' ? 'plop' : 'pour', { volume: 0.5 });
    }
  }

  private endSeason() {
    const s = this.season;
    this.season = null;
    if (!s) return;
    const b = s.bottle;
    this.game.fx.poof(b.position, '#ffffff', 0.4);
    this.game.anim.run(0.2, (k) => b.scale.setScalar(1.25 * (1 - k)), { done: () => b.removeFromParent() });
    if (s.target instanceof Object && s.total > 0.3) {
      const item = s.target instanceof Station ? s.target.contents[0] : s.target;
      if (item) {
        item.refreshName();
        this.game.ui.floatLabel(item.name || s.def.name, item.position.clone().add(new THREE.Vector3(0, item.visual.height + 0.08, 0)), 'info');
      }
    }
    this.game.ui.setDragging(false);
  }

  update(dt: number) {
    this.updateSeason(dt);
  }
}
