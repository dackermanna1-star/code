import * as THREE from 'three';
import { Station } from './Station';
import type { GameContext } from '../game/Context';
import { shot } from '../core/CameraRig';
import { GRILL, WARMER } from '../world/Layout';
import { DragHandler, Input, Interactive } from '../core/Input';
import { FoodPiece } from '../food/FoodKit';
import { BURNT_AT, DONENESS, Doneness, INGREDIENTS, PATTY_COOK, PattyId } from '../food/Ingredients';
import { Geo } from '../world/Builder';
import { Ease, clamp, noise, rand } from '../core/math';
import type { Gauge } from '../ui/Gauges';
import { lockDecal } from './Locks';

export interface GrillPatty {
  piece: FoodPiece;
  kind: PattyId;
  target?: Doneness;
  slot: number;
  a: number;
  b: number;
  flipped: boolean;
  busy: boolean;
  gauge: Gauge;
  sizzle: number;
  warned: boolean;
  chimed: Set<string>;
  smokeT: number;
  sparkT: number;
  flareT: number;
  hover: number;
}

const SURFACE = GRILL.center.y;
const REST = SURFACE + 0.0105;
const BASE_RATE = 0.062;

export class GrillStation extends Station {
  readonly id = 'grill' as const;
  // frames the raw trays, the grill and the holding tray on its right
  readonly shot = shot([-2.97, 2.37, -4.61], [-2.97, 0.95, -5.72], 42);
  private patties: GrillPatty[] = [];
  private trays: { kind: PattyId; group: THREE.Group; interactive: Interactive; stack: THREE.Group; lid: THREE.Object3D }[] = [];
  private glowMat: THREE.MeshStandardMaterial;
  private slotMarkers: THREE.Mesh[] = [];
  private spatula: THREE.Group;
  private grillHit: THREE.Mesh;
  private time = 0;
  private dragging: FoodPiece | null = null;
  private previewSlot = -1;

  constructor(ctx: GameContext) {
    super(ctx);
    const mats = ctx.world.mats;
    // --------------------------------------------------------------- heat glow under the grates
    this.glowMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff5a14, emissiveIntensity: 1.2, roughness: 1 });
    const glow = new THREE.Mesh(Geo.plane(GRILL.width - 0.06, GRILL.depth - 0.04), this.glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(GRILL.center.x, SURFACE - 0.07, GRILL.center.z);
    this.root.add(glow);
    // burner tubes
    for (let i = 0; i < 4; i++) {
      const tube = new THREE.Mesh(Geo.cyl(0.012, 0.012, GRILL.depth - 0.06, 10), new THREE.MeshStandardMaterial({ color: 0x2a1a12, emissive: 0xff3a0a, emissiveIntensity: 2.2, roughness: 0.6 }));
      tube.rotation.x = Math.PI / 2;
      tube.position.set(GRILL.center.x - GRILL.width / 2 + (GRILL.width / 4) * (i + 0.5), SURFACE - 0.055, GRILL.center.z);
      this.root.add(tube);
    }
    // invisible grill hit area
    this.grillHit = new THREE.Mesh(Geo.box(GRILL.width, 0.05, GRILL.depth), new THREE.MeshBasicMaterial({ visible: false }));
    this.grillHit.position.set(GRILL.center.x, SURFACE, GRILL.center.z);
    this.root.add(this.grillHit);

    // --------------------------------------------------------------- raw patty trays
    const kinds: PattyId[] = ['patty_beef', 'patty_chicken', 'patty_veggie'];
    kinds.forEach((kind, i) => {
      const g = new THREE.Group();
      g.position.set(-3.86, SURFACE - 0.015, -5.46 - i * 0.27);
      this.root.add(g);
      const pan = new THREE.Mesh(Geo.rbox(0.22, 0.03, 0.24, 0.012), mats.steel);
      pan.castShadow = pan.receiveShadow = true;
      g.add(pan);
      const paper = new THREE.Mesh(Geo.box(0.19, 0.002, 0.2), mats.paper);
      paper.position.y = 0.016;
      g.add(paper);
      const stack = new THREE.Group();
      stack.position.y = 0.018;
      g.add(stack);
      for (let k = 0; k < 4; k++) {
        const p = ctx.food.patty(kind);
        p.obj.scale.setScalar(0.78);
        p.obj.position.set(rand(-0.004, 0.004), 0.009 + k * 0.019, rand(-0.004, 0.004));
        p.obj.rotation.y = rand(0, 6);
        stack.add(p.obj);
        if (k < 3) {
          const sheet = new THREE.Mesh(Geo.box(0.15, 0.001, 0.15), mats.paper);
          sheet.position.y = 0.019 * (k + 1) - 0.0005;
          sheet.rotation.y = rand(0, 1);
          stack.add(sheet);
        }
      }
      // steel cover with a rank sticker while the patty type is locked
      const lid = new THREE.Group();
      const cover = new THREE.Mesh(Geo.rbox(0.225, 0.014, 0.245, 0.006), mats.steelDark);
      cover.castShadow = true;
      lid.add(cover);
      const sticker = lockDecal(INGREDIENTS[kind].unlockRank, 0.11);
      sticker.position.y = 0.0075;
      lid.add(sticker);
      lid.position.y = 0.022;
      g.add(lid);
      const it: Interactive = {
        object: g,
        cursor: 'grab',
        enabled: () => ctx.progress.rank >= INGREDIENTS[kind].unlockRank,
        onHover: (h) => {
          this.hoverTray(g, h);
          ctx.ui.hoverLabel(h ? INGREDIENTS[kind].name : null);
        },
        onDown: (_hit, ray) => this.startNewPatty(kind, ray),
      };
      this.trays.push({ kind, group: g, interactive: it, stack, lid });
      this.interactives.push(it);
    });

    // --------------------------------------------------------------- spatula
    this.spatula = new THREE.Group();
    const blade = new THREE.Mesh(Geo.rbox(0.1, 0.004, 0.11, 0.002), mats.steel);
    blade.castShadow = true;
    this.spatula.add(blade);
    const neck = new THREE.Mesh(Geo.box(0.014, 0.004, 0.08), mats.steel);
    neck.position.set(0, 0.018, 0.09);
    neck.rotation.x = -0.45;
    this.spatula.add(neck);
    const handle = new THREE.Mesh(Geo.capsule(0.012, 0.13, 4, 8), mats.std(0x1c1c1f, 0.5));
    handle.rotation.x = Math.PI / 2 - 0.3;
    handle.position.set(0, 0.055, 0.19);
    this.spatula.add(handle);
    this.spatula.visible = false;
    this.root.add(this.spatula);

    // grill + warmer area interactives
    this.interactives.push({
      object: ctx.warmer.hitArea,
      cursor: 'default',
      priority: -1,
    });
    this.buildSlotMarkers();
    this.refreshLocks();
    ctx.world.root.add(this.root);
  }

  // ------------------------------------------------------------------ slots
  private slotPositions(): THREE.Vector3[] {
    const n = this.ctx.progress.grillSlots;
    const cols = n === 4 ? 2 : 3;
    const rows = n === 9 ? 3 : 2;
    const sx = n === 4 ? 0.3 : 0.3;
    const sz = rows === 3 ? 0.2 : 0.26;
    const out: THREE.Vector3[] = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        out.push(new THREE.Vector3(GRILL.center.x + (c - (cols - 1) / 2) * sx, REST, GRILL.center.z + (r - (rows - 1) / 2) * sz));
    return out;
  }

  buildSlotMarkers() {
    for (const m of this.slotMarkers) m.removeFromParent();
    this.slotMarkers = [];
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false });
    for (const p of this.slotPositions()) {
      const ring = new THREE.Mesh(Geo.torus(0.078, 0.003, 6, 40), mat.clone());
      ring.rotation.x = Math.PI / 2;
      ring.position.set(p.x, SURFACE + 0.004, p.z);
      ring.renderOrder = 3;
      this.root.add(ring);
      this.slotMarkers.push(ring);
    }
  }

  private freeSlots(): number[] {
    const n = this.slotPositions().length;
    const used = new Set(this.patties.map((p) => p.slot));
    return [...Array(n).keys()].filter((i) => !used.has(i));
  }

  private nearestFreeSlot(p: THREE.Vector3, maxD = 0.2): number {
    const pos = this.slotPositions();
    let best = -1;
    let bd = maxD;
    for (const i of this.freeSlots()) {
      const d = Math.hypot(pos[i].x - p.x, pos[i].z - p.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private hoverTray(g: THREE.Group, h: boolean) {
    this.ctx.engine.tweens.to(g.position, { y: SURFACE - 0.015 + (h ? 0.012 : 0) }, 0.15);
    if (h) this.ctx.audio.play('hover', { volume: 0.35 });
  }

  // ------------------------------------------------------------------ placing new patties
  private startNewPatty(kind: PattyId, ray: THREE.Ray): DragHandler | void {
    if (this.ctx.busy) return;
    const free = this.freeSlots();
    if (!free.length) {
      this.ctx.ui.toastWorld('Grill is full!', GRILL.center.clone().setY(1.15), 'bad');
      this.ctx.audio.play('error');
      return;
    }
    const piece = this.ctx.food.patty(kind);
    piece.obj.scale.setScalar(1.02);
    this.root.add(piece.obj);
    const start = this.trays.find((t) => t.kind === kind)!.group.position.clone();
    piece.obj.position.copy(start).setY(start.y + 0.09);
    this.ctx.audio.play('pickup', { volume: 0.6 });
    this.dragging = piece;
    const tmp = new THREE.Vector3();
    const target = new THREE.Vector3().copy(piece.obj.position);
    const follow = (r: THREE.Ray) => {
      if (Input.planePoint(r, SURFACE + 0.07, tmp)) {
        target.copy(tmp);
        this.previewSlot = this.nearestFreeSlot(tmp, 0.18);
      }
    };
    follow(ray);
    const updater = this.ctx.engine.onUpdate((dt) => {
      const o = piece.obj.position;
      o.lerp(target, 1 - Math.exp(-dt * 22));
      piece.obj.rotation.z = clamp((target.x - o.x) * 4, -0.4, 0.4);
      piece.obj.rotation.x = clamp((target.z - o.z) * -4, -0.4, 0.4);
      this.showSlotPreview(this.previewSlot);
    });
    return {
      move: (r) => follow(r),
      up: (_r, _n, clicked) => {
        updater();
        this.dragging = null;
        const slot = clicked ? free[0] : this.previewSlot;
        this.showSlotPreview(-1);
        this.previewSlot = -1;
        if (slot >= 0) this.placeOnGrill(piece, kind, slot, clicked);
        else this.discardFlight(piece, start);
      },
      cancel: () => {
        updater();
        this.dragging = null;
        this.showSlotPreview(-1);
        this.discardFlight(piece, start);
      },
    };
  }

  private showSlotPreview(slot: number) {
    this.slotMarkers.forEach((m, i) => {
      const mat = m.material as THREE.MeshBasicMaterial;
      const want = this.dragging ? (i === slot ? 0.9 : this.freeSlots().includes(i) ? 0.22 : 0) : 0;
      mat.opacity += (want - mat.opacity) * 0.3;
    });
  }

  private discardFlight(piece: FoodPiece, to: THREE.Vector3) {
    const from = piece.obj.position.clone();
    this.ctx.engine.tweens.run(0.25, (e) => {
      piece.obj.position.lerpVectors(from, to.clone().setY(to.y + 0.08), e);
      piece.obj.scale.setScalar(1 - e);
    }).done.then(() => {
      piece.obj.removeFromParent();
      piece.dispose();
    });
  }

  private placeOnGrill(piece: FoodPiece, kind: PattyId, slot: number, fly: boolean, goal?: Doneness) {
    const target = this.slotPositions()[slot];
    const from = piece.obj.position.clone();
    const gauge = this.ctx.ui.gauges.create();
    const gp: GrillPatty = {
      piece, kind, target: goal, slot, a: 0, b: 0, flipped: false, busy: true, gauge, sizzle: 0, warned: false,
      chimed: new Set(), smokeT: 0, sparkT: 0, flareT: rand(3, 8), hover: 0,
    };
    this.patties.push(gp);
    const interactive: Interactive = {
      object: piece.obj,
      cursor: 'pointer',
      priority: 2,
      enabled: () => !gp.busy,
      onHover: (h) => {
        gp.hover = h ? 1 : 0;
        if (h) this.ctx.audio.play('hover', { volume: 0.25 });
      },
      onDown: (_hit, ray) => this.pressPatty(gp, ray),
    };
    (gp as any).interactive = interactive;
    this.addInteractive(interactive);
    const dur = fly ? 0.32 : 0.14;
    this.ctx.engine.tweens
      .run(dur, (e, raw) => {
        piece.obj.position.lerpVectors(from, target, e);
        if (fly) piece.obj.position.y += Math.sin(raw * Math.PI) * 0.1;
        piece.obj.rotation.x *= 0.8;
        piece.obj.rotation.z *= 0.8;
      }, { ease: fly ? Ease.inOutQuad : Ease.inQuad })
      .done.then(() => {
        piece.obj.position.copy(target);
        piece.obj.rotation.set(0, piece.obj.rotation.y, 0);
        gp.busy = false;
        gp.sizzle = 1;
        this.landFx(target, 1);
        this.ctx.audio.play('pattyPlace', { pan: this.pan(target) });
        this.ctx.audio.play('sizzleBurst', { volume: 0.9, pan: this.pan(target) });
        this.ctx.rig.addTrauma(0.08);
        this.ctx.haptic(12);
        this.ctx.ui.tutorialEvent('patty-placed');
      });
  }

  private pan(p: THREE.Vector3) {
    return clamp((p.x - GRILL.center.x) / 1.2, -0.8, 0.8);
  }

  private landFx(at: THREE.Vector3, k: number) {
    const fx = this.ctx.fx;
    const p = at.clone();
    p.y = SURFACE + 0.01;
    fx.burst('sizzle', p, Math.round(14 * k), { spread: 1.4 });
    for (let i = 0; i < 6 * k; i++) fx.emit('steam', p.clone().add(new THREE.Vector3(rand(-0.05, 0.05), 0.01, rand(-0.05, 0.05))), { size: 0.05, size1: 0.2 });
    fx.emit('glow', p, { size: 0.3, color: 0xff7a2a, life: 0.35 });
  }

  // ------------------------------------------------------------------ interacting with grill patties
  private pressPatty(gp: GrillPatty, ray: THREE.Ray): DragHandler | void {
    if (gp.busy || this.ctx.busy) return;
    const start = new THREE.Vector3();
    Input.planePoint(ray, SURFACE + 0.02, start);
    let lifted = false;
    const tmp = new THREE.Vector3();
    const target = new THREE.Vector3();
    let updater: (() => void) | null = null;
    let overWarmer = false;
    const lift = () => {
      lifted = true;
      gp.busy = true;
      this.ctx.audio.play('spatula', { volume: 0.6 });
      this.ctx.ui.trash.show();
      target.copy(gp.piece.obj.position);
      updater = this.ctx.engine.onUpdate((dt) => {
        const o = gp.piece.obj.position;
        o.lerp(target, 1 - Math.exp(-dt * 20));
        gp.piece.obj.rotation.z = clamp((target.x - o.x) * 4, -0.35, 0.35);
      });
    };
    return {
      move: (r, ndc) => {
        if (!Input.planePoint(r, SURFACE + 0.07, tmp)) return;
        if (!lifted && tmp.distanceTo(start) > 0.03) lift();
        if (lifted) {
          target.copy(tmp);
          overWarmer = this.overWarmer(tmp);
          this.ctx.ui.trash.setHot(this.ctx.ui.trash.containsNdc(ndc));
        }
      },
      up: (_r, ndc, clicked) => {
        if (!lifted) {
          if (clicked) this.flip(gp);
          return;
        }
        updater?.();
        this.ctx.ui.trash.hide();
        if (this.ctx.ui.trash.containsNdc(ndc)) this.trashPatty(gp);
        else if (overWarmer) this.moveToWarmer(gp, target.clone());
        else this.returnToSlot(gp);
      },
      cancel: () => {
        updater?.();
        this.ctx.ui.trash.hide();
        if (lifted) this.returnToSlot(gp);
      },
    };
  }

  private overWarmer(p: THREE.Vector3) {
    const c = WARMER.center;
    return Math.abs(p.x - c.x) < WARMER.width / 2 + 0.08 && Math.abs(p.z - c.z) < WARMER.depth / 2 + 0.1;
  }

  flip(gp: GrillPatty) {
    if (gp.busy) return;
    gp.busy = true;
    const obj = gp.piece.obj;
    const base = obj.position.clone();
    const startRot = gp.flipped ? Math.PI : 0;
    const sp = this.spatula;
    sp.visible = true;
    sp.position.set(base.x, SURFACE + 0.003, base.z + 0.25);
    sp.rotation.set(0, 0, 0);
    this.ctx.audio.play('spatula', { pan: this.pan(base) });
    const tw = this.ctx.engine.tweens;
    // slide in
    tw.run(0.11, (e) => {
      sp.position.z = base.z + 0.25 - 0.25 * e;
    }, { ease: Ease.outQuad }).done.then(() => {
      this.ctx.audio.play('whoosh', { volume: 0.45, rate: 1.4 });
      return tw.run(0.3, (e, raw) => {
        obj.position.y = base.y + Math.sin(raw * Math.PI) * 0.11;
        obj.position.z = base.z - Math.sin(raw * Math.PI) * 0.02;
        obj.rotation.x = startRot + Math.PI * e;
        sp.position.y = SURFACE + 0.003 + Math.sin(Math.min(1, raw * 2) * Math.PI) * 0.05;
        sp.rotation.x = -Math.sin(Math.min(1, raw * 2) * Math.PI) * 0.6;
      }, { ease: Ease.inOutQuad }).done;
    }).then(() => {
      gp.flipped = !gp.flipped;
      obj.rotation.x = gp.flipped ? Math.PI : 0;
      obj.position.copy(base);
      gp.sizzle = 1;
      gp.warned = false;
      this.landFx(base, 0.8);
      this.ctx.audio.play('flipSlap', { pan: this.pan(base) });
      this.ctx.audio.play('sizzleBurst', { volume: 0.8, pan: this.pan(base) });
      this.ctx.rig.addTrauma(0.06);
      this.ctx.haptic(10);
      gp.busy = false;
      this.ctx.ui.tutorialEvent('patty-flipped');
      tw.run(0.14, (e) => {
        sp.position.z = base.z + 0.3 * e;
      }).done.then(() => (sp.visible = false));
      // squash on landing
      tw.run(0.3, (_e, raw) => {
        const s = Math.sin(raw * Math.PI) * 0.16 * (1 - raw);
        obj.scale.set(1 + s * 0.5, 1 - s, 1 + s * 0.5);
      }).done.then(() => obj.scale.set(1, 1, 1));
    });
  }

  private returnToSlot(gp: GrillPatty) {
    const target = this.slotPositions()[gp.slot];
    const from = gp.piece.obj.position.clone();
    this.ctx.engine.tweens.run(0.18, (e) => {
      gp.piece.obj.position.lerpVectors(from, target, e);
      gp.piece.obj.rotation.z *= 1 - e;
    }).done.then(() => {
      gp.busy = false;
      gp.sizzle = 0.8;
      this.ctx.audio.play('sizzleBurst', { volume: 0.5 });
    });
  }

  private removePatty(gp: GrillPatty) {
    const i = this.patties.indexOf(gp);
    if (i >= 0) this.patties.splice(i, 1);
    gp.gauge.remove();
    this.removeInteractive((gp as any).interactive as Interactive);
  }

  private moveToWarmer(gp: GrillPatty, dropAt: THREE.Vector3) {
    const warmer = this.ctx.warmer;
    const slot = warmer.nearestFree(dropAt);
    if (slot < 0) {
      this.ctx.ui.toastWorld('Holding tray is full!', WARMER.center.clone().setY(1.2), 'bad');
      this.ctx.audio.play('error');
      this.returnToSlot(gp);
      return;
    }
    this.removePatty(gp);
    const obj = gp.piece.obj;
    const from = obj.position.clone();
    const to = warmer.slotWorld(slot).setY(WARMER.center.y - 0.012 + 0.0095);
    this.ctx.engine.tweens.run(0.2, (e) => {
      obj.position.lerpVectors(from, to, e);
      obj.scale.setScalar(1 + (warmer.scale - 1) * e);
    }).done.then(() => {
      obj.rotation.set(gp.flipped ? Math.PI : 0, obj.rotation.y, 0);
      warmer.add({ piece: gp.piece, kind: gp.kind, a: gp.a, b: gp.b, target: gp.target }, slot);
      this.ctx.audio.play('plate', { volume: 0.7 });
      this.ctx.fx.burst('steam', to.clone().setY(to.y + 0.02), 4);
      const avg = (gp.a + gp.b) / 2;
      const d = this.nearestDoneness(avg);
      const good = d && Math.abs(gp.a - DONENESS[d].target) < 0.09 && Math.abs(gp.b - DONENESS[d].target) < 0.09;
      if (gp.a >= BURNT_AT || gp.b >= BURNT_AT) this.ctx.ui.toastWorld('Burnt...', to.clone().setY(1.12), 'bad');
      else if (good) this.ctx.ui.toastWorld(`${DONENESS[d!].label}!`, to.clone().setY(1.12), 'good');
      this.ctx.ui.tutorialEvent('patty-done');
    });
  }

  private nearestDoneness(c: number): Doneness | null {
    let best: Doneness | null = null;
    let bd = 0.12;
    for (const k of Object.keys(DONENESS) as Doneness[]) {
      const d = Math.abs(DONENESS[k].target - c);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }

  private trashPatty(gp: GrillPatty) {
    this.removePatty(gp);
    this.ctx.audio.play('trash');
    const obj = gp.piece.obj;
    this.ctx.engine.tweens.run(0.3, (e) => {
      obj.scale.setScalar(1 - e);
      obj.position.y -= 0.004;
    }).done.then(() => {
      obj.removeFromParent();
      gp.piece.dispose();
    });
    this.ctx.progress.data.stats.burnt++;
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number) {
    this.time += dt;
    const heat = this.ctx.progress.heat;
    const needs = this.ctx.orders.pattyNeeds();
    const smart = this.ctx.progress.level('smart_meter') > 0;
    const chime = this.ctx.progress.level('patty_bell') > 0;
    let sizzleLevel = 0;
    let burning = false;
    let flipReady = false;
    const visible = this.ctx.station === 'grill';
    for (const gp of this.patties) {
      const rate = BASE_RATE * heat * PATTY_COOK[gp.kind].rate;
      const lifted = gp.busy && gp.piece.obj.position.y > REST + 0.02;
      if (!lifted) {
        if (gp.flipped) {
          gp.b += rate * dt;
          gp.a += rate * 0.05 * dt;
        } else {
          gp.a += rate * dt;
          gp.b += rate * 0.05 * dt;
        }
      }
      gp.a = Math.min(1.35, gp.a);
      gp.b = Math.min(1.35, gp.b);
      // object space: bottom = side a
      gp.piece.setCook!(gp.b, gp.a);
      gp.sizzle = Math.max(0.25, gp.sizzle - dt * 0.35);
      const down = gp.flipped ? gp.b : gp.a;
      const up = gp.flipped ? gp.a : gp.b;
      gp.piece.setSizzle?.(lifted ? 0 : clamp(0.4 + gp.sizzle * 0.6));
      gp.piece.setHighlight?.(gp.hover * (0.6 + 0.4 * Math.sin(this.time * 8)));
      sizzleLevel += lifted ? 0 : 0.35 + gp.sizzle * 0.65 * (down < 1 ? 1 : 0.6);

      // chimes & warnings
      if (down > 0.93 && !gp.warned) {
        gp.warned = true;
        this.ctx.audio.play('burnWarning', { pan: this.pan(gp.piece.obj.position) });
        if (visible) this.ctx.ui.toastWorld('Flip it!', gp.piece.obj.position.clone().setY(1.12), 'bad');
      }
      if (down >= BURNT_AT) burning = true;
      if (chime) {
        for (const n of needs) {
          if (n.kind !== gp.kind) continue;
          const t = DONENESS[n.doneness as Doneness].target;
          const key = `${gp.flipped ? 'b' : 'a'}${n.doneness}`;
          if (down >= t && down < t + 0.08 && !gp.chimed.has(key)) {
            gp.chimed.add(key);
            this.ctx.audio.play('timerDing', { pan: this.pan(gp.piece.obj.position) });
            flipReady = true;
          }
        }
      }
      if (down > 0.35 && up < 0.3) flipReady = true;

      // FX
      const p = gp.piece.obj.position;
      if (!lifted) {
        gp.smokeT -= dt;
        if (gp.smokeT <= 0) {
          const burnt = down >= BURNT_AT;
          gp.smokeT = burnt ? 0.07 : down > 0.85 ? 0.14 : down > 0.3 ? 0.28 : 0.45;
          const q = p.clone().add(new THREE.Vector3(rand(-0.05, 0.05), 0.02, rand(-0.05, 0.05)));
          if (burnt) this.ctx.fx.emit('darkSmoke', q, { size: 0.07, size1: 0.35 });
          else if (down < 0.25) this.ctx.fx.emit('steam', q, { size: 0.04, size1: 0.16 });
          else this.ctx.fx.emit('smoke', q, { size: 0.05, size1: 0.26 });
        }
        gp.sparkT -= dt;
        if (gp.sparkT <= 0) {
          gp.sparkT = rand(0.06, 0.2) / (0.5 + gp.sizzle);
          const q = p.clone().add(new THREE.Vector3(rand(-0.07, 0.07), 0.005, rand(-0.07, 0.07)));
          this.ctx.fx.emit('sizzle', q);
        }
        gp.flareT -= dt;
        if (gp.flareT <= 0) {
          gp.flareT = rand(3.5, 9);
          if (down > 0.15 && down < 1.05) this.flare(p);
        }
      }

      // gauge
      if (visible) {
        const s = this.ctx.ui.project(p.clone().setY(p.y + 0.12));
        const needTargets = needs.filter((n) => n.kind === gp.kind).map((n) => DONENESS[n.doneness as Doneness].target);
        gp.gauge.set(down, up, { warn: down > 0.9, labels: smart, targets: smart ? needTargets : [], flipHint: down > 0.35 && up < 0.2 });
        gp.gauge.place(s.x, s.y, !s.behind && !gp.busy);
      } else gp.gauge.place(0, 0, false);
    }
    // glow + light flicker + haze
    const flick = noise.noise2(this.time * 6, 1.3) * 0.15 + noise.noise2(this.time * 17, 4.4) * 0.06;
    this.glowMat.emissiveIntensity = (0.9 + flick) * (0.8 + heat * 0.25);
    this.ctx.world.lighting.grillGlow.intensity = (0.8 + flick * 1.8 + this.patties.length * 0.06) * heat;
    this.ctx.audio.setSizzle(Math.min(1.4, sizzleLevel * 0.35));
    this.ctx.ui.stationAlert('grill', burning ? 2 : flipReady ? 1 : 0);
    if (visible) this.updateHaze(heat);
    else this.ctx.engine.post.heat.strength = 0;
    this.showSlotPreview(this.previewSlot);
  }

  private flare(p: THREE.Vector3) {
    const base = p.clone();
    base.y = SURFACE - 0.02;
    for (let i = 0; i < 10; i++) this.ctx.fx.emit('flame', base.clone().add(new THREE.Vector3(rand(-0.05, 0.05), 0, rand(-0.04, 0.04))), { size: rand(0.06, 0.1) });
    this.ctx.fx.emit('glow', base.clone().setY(base.y + 0.05), { size: 0.35, color: 0xff6a1a, life: 0.4 });
    this.ctx.audio.play('flare', { pan: this.pan(p), volume: 0.6 });
  }

  private updateHaze(heat: number) {
    const h = this.ctx.engine.post.heat;
    const corners = [
      new THREE.Vector3(GRILL.center.x - GRILL.width / 2, SURFACE, GRILL.center.z + GRILL.depth / 2),
      new THREE.Vector3(GRILL.center.x + GRILL.width / 2, SURFACE, GRILL.center.z + GRILL.depth / 2),
      new THREE.Vector3(GRILL.center.x - GRILL.width / 2, SURFACE + 0.35, GRILL.center.z - GRILL.depth / 2),
      new THREE.Vector3(GRILL.center.x + GRILL.width / 2, SURFACE + 0.35, GRILL.center.z - GRILL.depth / 2),
    ];
    let x0 = 1,
      y0 = 1,
      x1 = 0,
      y1 = 0;
    for (const c of corners) {
      c.project(this.ctx.engine.camera);
      const u = c.x * 0.5 + 0.5;
      const v = c.y * 0.5 + 0.5;
      x0 = Math.min(x0, u);
      x1 = Math.max(x1, u);
      y0 = Math.min(y0, v);
      y1 = Math.max(y1, v);
    }
    h.rect.set(x0, y0, x1, y1);
    h.time = this.time;
    h.strength = (0.8 + this.patties.length * 0.12) * heat;
  }

  enter() {
    super.enter();
    this.ctx.ui.tutorialEvent('at-grill');
  }

  exit() {
    super.exit();
    for (const gp of this.patties) gp.gauge.place(0, 0, false);
    this.ctx.ui.hoverLabel(null);
  }

  /** Remove everything (end of day). */
  reset() {
    for (const gp of [...this.patties]) {
      this.removePatty(gp);
      gp.piece.obj.removeFromParent();
      gp.piece.dispose();
    }
    this.buildSlotMarkers();
    this.refreshLocks();
  }

  refreshLocks() {
    for (const t of this.trays) {
      const locked = this.ctx.progress.rank < INGREDIENTS[t.kind].unlockRank;
      t.lid.visible = locked;
      t.stack.visible = !locked;
    }
  }

  get activeCount() {
    return this.patties.length;
  }

  /** Debug/test helper: state of patties. */
  debugState() {
    return this.patties.map((p) => ({ kind: p.kind, a: +p.a.toFixed(2), b: +p.b.toFixed(2), flipped: p.flipped, slot: p.slot }));
  }

  /** Test helpers used by the automated playtest bot. */
  botPlace(kind: PattyId, target?: Doneness) {
    const free = this.freeSlots();
    if (!free.length) return false;
    const piece = this.ctx.food.patty(kind);
    this.root.add(piece.obj);
    piece.obj.position.copy(this.slotPositions()[free[0]]).setY(REST + 0.08);
    this.placeOnGrill(piece, kind, free[0], true, target);
    return true;
  }
  trayPos(kind: PattyId): THREE.Vector3 {
    return this.trays.find((t) => t.kind === kind)!.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.06, 0));
  }
  botPatties(): GrillPatty[] {
    return this.patties;
  }
  botMoveToWarmer(gp: GrillPatty) {
    if (gp.busy || this.ctx.warmer.freeSlot() < 0) return;
    gp.busy = true;
    this.moveToWarmer(gp, this.ctx.warmer.slotWorld(this.ctx.warmer.freeSlot()));
  }
  botFlip(i: number) {
    const gp = this.patties[i];
    if (gp) this.flip(gp);
  }
  botToWarmer(i: number) {
    const gp = this.patties[i];
    if (gp && !gp.busy) {
      gp.busy = true;
      this.moveToWarmer(gp, this.ctx.warmer.slotWorld(Math.max(0, this.ctx.warmer.freeSlot())));
    }
  }
}
