import * as THREE from 'three';
import { Station } from './Station';
import type { GameContext } from '../game/Context';
import { shot } from '../core/CameraRig';
import { BUILD, WARMER } from '../world/Layout';
import { DragHandler, Input, Interactive } from '../core/Input';
import { BUN_R, FoodPiece } from '../food/FoodKit';
import { BurgerStack } from '../food/BurgerStack';
import { BunId, BUNS, CHEESES, INGREDIENTS, IngredientId, LayerId, SauceId, SAUCES, TOPPINGS, isPatty } from '../food/Ingredients';
import { Geo } from '../world/Builder';
import { Ease, clamp, rand } from '../core/math';
import { canvasTexture, FONT_DISPLAY } from '../render/CanvasTex';
import { lockDecal } from './Locks';
import type { Order } from '../game/Order';

const PLATE_Y = BUILD.plate.y + 0.028;
// Two tiers of pans, like a real sandwich prep rail: everyday toppings in
// front, the fancier unlocks behind them. Cheeses sit at the right end.
const RAIL_FRONT: IngredientId[] = ['lettuce', 'tomato', 'onion', 'pickles', 'bacon', 'cheese_american', 'cheese_swiss'];
const RAIL_BACK: IngredientId[] = ['jalapenos', 'mushrooms', 'onion_rings', 'avocado', 'egg', 'cheese_cheddar', 'cheese_pepperjack'];
const PAN_DEPTH = 0.17;

interface Source {
  id: IngredientId;
  group: THREE.Group;
  home: THREE.Vector3;
  interactive: Interactive;
  glow?: THREE.Mesh;
  lid?: THREE.Mesh;
  kind: 'bin' | 'bun' | 'sauce';
}

let trayLinerTex: THREE.Texture | null = null;
function linerTexture(): THREE.Texture {
  if (trayLinerTex) return trayLinerTex;
  trayLinerTex = canvasTexture(512, 400, (ctx, w, h) => {
    ctx.fillStyle = '#fbf6ea';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(196,38,46,0.14)';
    for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? 32 : 0; x < w; x += 64) ctx.fillRect(x, y, 32, 32);
    ctx.fillStyle = 'rgba(196,38,46,0.9)';
    ctx.font = `700 38px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText('SIZZLE & STACK', w / 2, h - 26);
    ctx.font = `600 18px ${FONT_DISPLAY}`;
    ctx.fillText('★ made with love ★', w / 2, 34);
  });
  return trayLinerTex;
}

export function makeTray(mats: GameContext['world']['mats']): THREE.Group {
  const g = new THREE.Group();
  const plastic = mats.phys('trayRed', { color: 0xc4262e, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const base = new THREE.Mesh(Geo.rbox(0.26, 0.018, 0.22, 0.008), plastic);
  base.position.y = 0.009;
  base.castShadow = base.receiveShadow = true;
  g.add(base);
  for (const [x, z, w, d] of [[0, 0.105, 0.26, 0.012], [0, -0.105, 0.26, 0.012], [0.125, 0, 0.012, 0.22], [-0.125, 0, 0.012, 0.22]] as const) {
    const lip = new THREE.Mesh(Geo.rbox(w, 0.022, d, 0.005), plastic);
    lip.position.set(x, 0.02, z);
    lip.castShadow = true;
    g.add(lip);
  }
  const liner = new THREE.Mesh(Geo.box(0.225, 0.002, 0.186), new THREE.MeshStandardMaterial({ map: linerTexture(), roughness: 0.85 }));
  liner.position.y = 0.0195;
  liner.rotation.y = (Math.random() - 0.5) * 0.1;
  liner.receiveShadow = true;
  g.add(liner);
  return g;
}

export class BuildStation extends Station {
  readonly id = 'build' as const;
  readonly shot = shot([-1.3, 2.27, -4.49], [-1.3, 0.97, -5.66], 42);
  stack: BurgerStack | null = null;
  tray: THREE.Group;
  private sources: Source[] = [];
  private marker: THREE.Group;
  private markerRing: THREE.Mesh;
  private dragging = false;
  private stream: THREE.Mesh;
  private flagProto: THREE.Group;
  private warmerIt: Interactive;
  private time = 0;
  onComplete?: (order: Order | null, stack: BurgerStack, tray: THREE.Group) => void;

  constructor(ctx: GameContext) {
    super(ctx);
    const mats = ctx.world.mats;
    this.tray = makeTray(mats);
    this.tray.position.copy(BUILD.plate);
    this.root.add(this.tray);
    this.newStack();

    // drop marker: soft shadow disc + ring
    this.marker = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.065, 40),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    disc.rotation.x = -Math.PI / 2;
    this.marker.add(disc);
    this.markerRing = new THREE.Mesh(Geo.torus(0.07, 0.0025, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    this.markerRing.rotation.x = Math.PI / 2;
    this.marker.add(this.markerRing);
    this.marker.visible = false;
    this.marker.renderOrder = 15;
    this.root.add(this.marker);

    // sauce stream
    this.stream = new THREE.Mesh(Geo.cyl(0.0028, 0.0028, 1, 8, true), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, clearcoat: 1 }));
    this.stream.visible = false;
    this.root.add(this.stream);

    // toothpick flag
    this.flagProto = new THREE.Group();
    const pick = new THREE.Mesh(Geo.cyl(0.0018, 0.0018, 0.12, 6), mats.std(0xe8d3a8, 0.6));
    pick.position.y = 0.06;
    this.flagProto.add(pick);
    const flagTex = canvasTexture(128, 80, (c, w, h) => {
      c.fillStyle = '#c4262e';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffd35a';
      c.font = `700 40px ${FONT_DISPLAY}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('S&S', w / 2, h / 2 + 2);
    });
    const flag = new THREE.Mesh(Geo.plane(0.05, 0.032), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.7 }));
    flag.position.set(0.026, 0.105, 0);
    this.flagProto.add(flag);

    this.buildSources();

    this.warmerIt = {
      object: ctx.warmer.root,
      cursor: 'grab',
      priority: 1,
      onDown: (hit, ray) => {
        const slot = ctx.warmer.slotAt(hit.point);
        if (slot < 0) return;
        return this.dragFromWarmer(slot, ray);
      },
    };
    this.interactives.push(this.warmerIt);
    ctx.world.root.add(this.root);
    this.refreshLocks();
  }

  private newStack() {
    this.stack?.dispose();
    this.stack = new BurgerStack();
    this.stack.group.position.set(BUILD.plate.x, PLATE_Y, BUILD.plate.z);
    this.root.add(this.stack.group);
    this.pendingBottom = this.pendingTop = false;
    this.landChain = Promise.resolve();
  }

  // Pieces still falling onto the tray count as placed, so a quick player can
  // grab the next ingredient immediately; landings are chained to keep order.
  private pendingBottom = false;
  private pendingTop = false;
  private landChain: Promise<void> = Promise.resolve();

  private get hasBottom(): boolean {
    return !!this.stack && (this.stack.hasBottom || this.pendingBottom);
  }
  private get stackClosed(): boolean {
    return !this.stack || this.stack.complete || this.pendingTop;
  }

  // ------------------------------------------------------------------ sources
  private buildSources() {
    const ctx = this.ctx;
    const mats = ctx.world.mats;
    // ---- ingredient pans in the two-tier cold rail
    const step = (BUILD.railX1 - BUILD.railX0) / RAIL_FRONT.length;
    const tiers: [IngredientId[], number, number][] = [
      [RAIL_FRONT, 1.03, -5.8],
      [RAIL_BACK, 1.11, -5.995],
    ];
    for (const [ids, y, z] of tiers)
      ids.forEach((id, i) => {
        const g = new THREE.Group();
        g.position.set(BUILD.railX0 + step * (i + 0.5), y, z);
        g.rotation.x = 0.3;
        this.root.add(g);
        const pan = new THREE.Mesh(Geo.box(step - 0.012, 0.012, PAN_DEPTH), mats.steel);
        pan.position.y = -0.03;
        g.add(pan);
        for (const s of [-1, 1]) {
          const wall = new THREE.Mesh(Geo.box(0.004, 0.05, PAN_DEPTH), mats.steel);
          wall.position.set((s * (step - 0.012)) / 2, -0.008, 0);
          g.add(wall);
        }
        this.fillBin(id, g, step);
        // label
        const label = canvasTexture(256, 64, (c, w, h) => {
          c.fillStyle = '#fffaf0';
          c.fillRect(0, 0, w, h);
          c.fillStyle = INGREDIENTS[id].color;
          c.fillRect(0, 0, 18, h);
          c.fillStyle = '#2a211c';
          c.font = `700 30px ${FONT_DISPLAY}`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          const name = INGREDIENTS[id].name.replace(' Cheese', '').replace('Sharp ', '');
          c.fillText(name, w / 2 + 8, h / 2 + 2, w - 30);
        });
        const lab = new THREE.Mesh(Geo.plane(step - 0.02, 0.034), new THREE.MeshStandardMaterial({ map: label, roughness: 0.6 }));
        lab.position.set(0, -0.032, PAN_DEPTH / 2 + 0.007);
        lab.rotation.x = -0.35;
        g.add(lab);
        // lid (with a rank sticker) for locked pans
        const lid = new THREE.Mesh(Geo.rbox(step - 0.01, 0.012, PAN_DEPTH, 0.004), mats.steelDark);
        lid.position.y = 0.022;
        const sticker = lockDecal(INGREDIENTS[id].unlockRank, Math.min(0.1, step - 0.03));
        sticker.position.y = 0.0065;
        lid.add(sticker);
        g.add(lid);
        const glow = new THREE.Mesh(Geo.box(step - 0.01, 0.002, PAN_DEPTH), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.position.y = 0.03;
        g.add(glow);
        const src: Source = { id, group: g, home: g.position.clone(), kind: 'bin', lid, glow, interactive: null! };
        src.interactive = this.sourceInteractive(src);
        this.sources.push(src);
      });

    // ---- bun boxes (2x2) left of the plate
    BUNS.forEach((id, i) => {
      const g = new THREE.Group();
      g.position.set(-1.78 + (i % 2) * 0.175, BUILD.plate.y + 0.003, -5.47 - Math.floor(i / 2) * 0.2);
      this.root.add(g);
      const box = new THREE.Mesh(Geo.rbox(0.16, 0.035, 0.18, 0.01), mats.cardboard);
      box.position.y = 0.017;
      box.castShadow = box.receiveShadow = true;
      g.add(box);
      const paper = new THREE.Mesh(Geo.box(0.145, 0.002, 0.165), mats.paper);
      paper.position.y = 0.036;
      g.add(paper);
      const heel = ctx.food.bunPart(id, 'bottom');
      heel.obj.scale.setScalar(0.8);
      heel.obj.position.set(-0.018, 0.039, -0.04);
      heel.obj.rotation.set(-0.14, 0, 0.12);
      heel.obj.userData.content = true;
      g.add(heel.obj);
      const crown = ctx.food.bunPart(id, 'top');
      crown.obj.scale.setScalar(0.86);
      crown.obj.position.set(0.008, 0.04, 0.02);
      crown.obj.rotation.set(0.05, rand(0, 6), 0);
      crown.obj.userData.content = true;
      g.add(crown.obj);
      const lid = new THREE.Group();
      const lidBox = new THREE.Mesh(Geo.rbox(0.165, 0.014, 0.185, 0.006), mats.cardboard);
      lid.add(lidBox);
      const lockMesh = lockDecal(INGREDIENTS[id].unlockRank, 0.11);
      lockMesh.position.y = 0.0085;
      lid.add(lockMesh);
      lid.position.y = 0.043;
      g.add(lid);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.085, 32), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.04;
      g.add(glow);
      const src: Source = { id, group: g, home: g.position.clone(), kind: 'bun', lid: lid as unknown as THREE.Mesh, glow, interactive: null! };
      src.interactive = this.sourceInteractive(src);
      this.sources.push(src);
    });

    // ---- squeeze bottles (2 rows of 3) right of the plate
    const caddy = new THREE.Mesh(Geo.rbox(0.36, 0.03, 0.38, 0.01), mats.steel);
    caddy.position.set(-0.895, BUILD.plate.y + 0.016, -5.53);
    caddy.castShadow = caddy.receiveShadow = true;
    this.root.add(caddy);
    SAUCES.forEach((id, i) => {
      const g = this.makeBottle(id);
      g.position.set(-1.005 + (i % 3) * 0.11, BUILD.plate.y + 0.03, -5.44 - Math.floor(i / 3) * 0.18);
      this.root.add(g);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.002;
      g.add(glow);
      const src: Source = { id, group: g, home: g.position.clone(), kind: 'sauce', glow, interactive: null! };
      src.interactive = this.sourceInteractive(src);
      this.sources.push(src);
    });
  }

  private makeBottle(id: SauceId): THREE.Group {
    const g = new THREE.Group();
    const col = new THREE.Color(INGREDIENTS[id].color);
    const body = new THREE.Mesh(
      Geo.lathe('squeeze', [[0, 0], [0.034, 0], [0.037, 0.01], [0.037, 0.1], [0.03, 0.12], [0.014, 0.128], [0.0, 0.129]], 24),
      new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2, transmission: 0 }),
    );
    body.castShadow = body.receiveShadow = true;
    body.name = 'body';
    g.add(body);
    const cap = new THREE.Mesh(Geo.cyl(0.02, 0.022, 0.03, 16), this.ctx.world.mats.std(id === 'mayo' ? 0x3a7bd5 : 0xf6f1e4, 0.4));
    cap.position.y = 0.137;
    g.add(cap);
    const nozzle = new THREE.Mesh(Geo.cone(0.009, 0.05, 12), this.ctx.world.mats.std(id === 'mayo' ? 0x3a7bd5 : 0xf6f1e4, 0.4));
    nozzle.position.y = 0.176;
    g.add(nozzle);
    const label = canvasTexture(256, 128, (c, w, h) => {
      c.fillStyle = '#fffaf0';
      c.fillRect(0, 0, w, h);
      c.fillStyle = INGREDIENTS[id].color;
      c.fillRect(0, 0, w, 16);
      c.fillRect(0, h - 16, w, 16);
      c.fillStyle = '#2a211c';
      c.font = `700 40px ${FONT_DISPLAY}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(INGREDIENTS[id].name.toUpperCase(), w / 2, h / 2 + 2, w - 12);
    });
    const lab = new THREE.Mesh(Geo.cyl(0.0375, 0.0375, 0.055, 24, true), new THREE.MeshStandardMaterial({ map: label, roughness: 0.5 }));
    lab.position.y = 0.055;
    g.add(lab);
    return g;
  }

  private fillBin(id: IngredientId, g: THREE.Group, w: number) {
    const food = this.ctx.food;
    const add = (p: FoodPiece, x: number, y: number, z: number, s: number, ry = 0, rx = 0) => {
      p.obj.scale.setScalar(s);
      p.obj.position.set(x, y, z);
      p.obj.rotation.set(rx, ry, 0);
      p.obj.userData.content = true;
      g.add(p.obj);
      return p;
    };
    const cat = INGREDIENTS[id].category;
    if (cat === 'cheese') {
      for (let k = 0; k < 5; k++) {
        const c = food.cheese(id);
        c.setMelt?.(0, 1);
        add(c, 0, -0.02 + k * 0.004, -0.05 + k * 0.022, 0.95, rand(-0.1, 0.1), -0.35);
      }
      return;
    }
    const n = id === 'lettuce' ? 3 : id === 'egg' ? 2 : id === 'onion_rings' ? 3 : id === 'bacon' ? 3 : 3;
    for (let k = 0; k < n; k++) {
      const p = food.topping(id);
      const s = id === 'lettuce' ? 0.85 : id === 'bacon' ? 0.8 : id === 'egg' ? 0.9 : 1.0;
      add(p, rand(-0.008, 0.008), -0.016 + k * 0.012, -0.07 + k * 0.07, s * (w / 0.155), rand(0, 6), rand(-0.2, 0.1));
    }
  }

  refreshLocks() {
    const rank = this.ctx.progress.rank;
    for (const s of this.sources) {
      const locked = INGREDIENTS[s.id].unlockRank > rank;
      if (s.lid) s.lid.visible = locked;
      s.group.visible = s.kind === 'sauce' ? !locked : true;
      for (const c of s.group.children) if (c.userData.content) c.visible = !locked;
    }
  }

  private sourceInteractive(src: Source): Interactive {
    const it: Interactive = {
      object: src.group,
      cursor: 'grab',
      enabled: () => INGREDIENTS[src.id].unlockRank <= this.ctx.progress.rank,
      onHover: (h) => {
        const k = src.kind === 'bin' ? 0.008 : 0.015;
        this.ctx.engine.tweens.to(src.group.position, { y: src.home.y + (h ? k : 0) }, 0.14);
        if (h) {
          this.ctx.audio.play('hover', { volume: 0.25, rate: 1 + Math.random() * 0.2 });
          this.ctx.ui.hoverLabel(INGREDIENTS[src.id].name);
        } else this.ctx.ui.hoverLabel(null);
      },
      onDown: (_hit, ray) => this.dragFromSource(src, ray),
    };
    this.interactives.push(it);
    return it;
  }

  // ------------------------------------------------------------------ dragging
  private plateCenter(): THREE.Vector3 {
    return new THREE.Vector3(BUILD.plate.x, PLATE_Y, BUILD.plate.z);
  }

  private hoverHeight() {
    return PLATE_Y + (this.stack?.height ?? 0) + 0.085;
  }

  private dragFromSource(src: Source, ray: THREE.Ray): DragHandler | void {
    if (this.ctx.busy || this.completing || !this.stack) return;
    const order = this.ctx.orders.activeBuild;
    if (!order) {
      this.ctx.ui.toastWorld('No ticket to build!', this.plateCenter().setY(1.2), 'bad');
      this.ctx.audio.play('error');
      return;
    }
    if (this.stackClosed) return;
    let piece: FoodPiece;
    let kind: 'bottom' | 'top' | 'layer' = 'layer';
    if (src.kind === 'bun') {
      kind = this.hasBottom ? 'top' : 'bottom';
      piece = this.ctx.food.bunPart(src.id as BunId, kind === 'top' ? 'top' : 'bottom');
    } else if (src.kind === 'sauce') {
      return this.dragSauce(src, ray);
    } else {
      piece = this.ctx.food.make(src.id);
      if (piece.setMelt) piece.setMelt(0, 0.07);
    }
    if (!this.hasBottom && kind !== 'bottom') {
      this.ctx.ui.toastWorld('Start with a bottom bun!', this.plateCenter().setY(1.2), 'bad');
      this.ctx.audio.play('error');
      piece.dispose();
      return;
    }
    this.ctx.audio.play('pickup', { volume: 0.5, rate: 1.1 });
    const startWorld = src.group.position.clone().setY(src.group.position.y + 0.06);
    return this.carry(piece, startWorld, kind, () => this.ctx.audio.play('pickup', { volume: 0.3, rate: 0.8 }));
  }

  private dragFromWarmer(slot: number, ray: THREE.Ray): DragHandler | void {
    if (this.ctx.busy || this.completing || !this.stack) return;
    if (!this.ctx.orders.activeBuild) {
      this.ctx.ui.toastWorld('No ticket to build!', this.plateCenter().setY(1.2), 'bad');
      return;
    }
    if (!this.hasBottom) {
      this.ctx.ui.toastWorld('Start with a bottom bun!', this.plateCenter().setY(1.2), 'bad');
      this.ctx.audio.play('error');
      return;
    }
    if (this.stackClosed) return;
    const wp = this.ctx.warmer.take(slot);
    if (!wp) return;
    const piece = wp.piece;
    // move from warmer group into station root, preserving world transform
    const world = new THREE.Vector3();
    piece.obj.getWorldPosition(world);
    this.root.attach(piece.obj);
    piece.obj.scale.setScalar(1);
    // normalize orientation: keep flip state in object space (rotation.x = PI when flipped)
    (piece as any).__warm = wp;
    this.ctx.audio.play('pickup', { volume: 0.6 });
    return this.carry(piece, world, 'layer', () => {
      // put back
      this.ctx.warmer.add({ piece, kind: wp.kind, a: wp.a, b: wp.b }, slot);
    });
  }

  /** Generic carry → drop onto the stack. */
  private carry(piece: FoodPiece, from: THREE.Vector3, kind: 'bottom' | 'top' | 'layer', onCancel: () => void): DragHandler {
    this.root.add(piece.obj);
    piece.obj.position.copy(from);
    const target = from.clone();
    const tmp = new THREE.Vector3();
    this.dragging = true;
    this.ctx.ui.trash.show();
    const baseRotX = piece.obj.rotation.x;
    const follow = (r: THREE.Ray) => {
      const h = this.hoverHeight();
      if (Input.planePoint(r, h, tmp)) target.copy(tmp);
    };
    const updater = this.ctx.engine.onUpdate((dt) => {
      const o = piece.obj.position;
      o.lerp(target, 1 - Math.exp(-dt * 24));
      piece.obj.rotation.z = clamp((target.x - o.x) * 5, -0.45, 0.45);
      piece.obj.rotation.x = baseRotX + clamp((target.z - o.z) * -5, -0.45, 0.45);
      this.updateMarker(o);
    });
    const finish = () => {
      updater();
      this.dragging = false;
      this.marker.visible = false;
      this.ctx.ui.trash.hide();
    };
    return {
      move: (r, ndc) => {
        follow(r);
        this.ctx.ui.trash.setHot(this.ctx.ui.trash.containsNdc(ndc));
      },
      up: (_r, ndc, clicked) => {
        finish();
        if (this.ctx.ui.trash.containsNdc(ndc)) {
          this.toss(piece);
          return;
        }
        const c = this.plateCenter();
        let dx = target.x - c.x;
        let dz = target.z - c.z;
        if (clicked) {
          // quick-drop: auto-center with a tiny human wobble
          dx = rand(-0.006, 0.006);
          dz = rand(-0.006, 0.006);
          piece.obj.position.set(c.x + dx, this.hoverHeight() + 0.06, c.z + dz);
        }
        this.drop(piece, dx, dz, kind);
      },
      cancel: () => {
        finish();
        onCancel();
      },
    };
  }

  private updateMarker(o: THREE.Vector3) {
    const c = this.plateCenter();
    const dx = o.x - c.x;
    const dz = o.z - c.z;
    const d = Math.hypot(dx, dz);
    this.marker.visible = true;
    const miss = d > 0.11;
    this.marker.position.set(o.x, PLATE_Y + (this.stack?.height ?? 0) + 0.004, o.z);
    const ringMat = this.markerRing.material as THREE.MeshBasicMaterial;
    const acc = clamp(1 - Math.max(0, d - 0.007) / 0.038);
    ringMat.color.setHSL(miss ? 0 : 0.33 * acc, 0.85, 0.6);
    this.markerRing.scale.setScalar(1 + Math.sin(this.time * 10) * 0.04);
  }

  private drop(piece: FoodPiece, dx: number, dz: number, kind: 'bottom' | 'top' | 'layer') {
    const stack = this.stack!;
    const d = Math.hypot(dx, dz);
    if (d > 0.11 && kind !== 'bottom') {
      this.miss(piece);
      return;
    }
    if (kind === 'bottom') {
      dx = clamp(dx, -0.05, 0.05);
      dz = clamp(dz, -0.05, 0.05);
    }
    if (kind === 'bottom') this.pendingBottom = true;
    if (kind === 'top') this.pendingTop = true;
    const startY = piece.obj.position.y;
    const localTarget = stack.topY() + (isPatty(piece.id) ? 0.0105 : 0);
    const worldTarget = PLATE_Y + localTarget;
    const fall = Math.max(0.05, startY - worldTarget);
    const dur = Math.sqrt((2 * fall) / 9.8) * 1.1;
    const from = piece.obj.position.clone();
    const rotX0 = piece.obj.rotation.x;
    const rotZ0 = piece.obj.rotation.z;
    const flipped = Math.abs(rotX0) > 1.5 ? Math.PI : 0;
    const fell = this.ctx.engine.tweens.run(dur, (e) => {
      piece.obj.position.set(from.x + (this.plateCenter().x + dx - from.x) * Math.min(1, e * 1.4), from.y + (worldTarget - from.y) * e, from.z + (this.plateCenter().z + dz - from.z) * Math.min(1, e * 1.4));
      piece.obj.rotation.x = flipped + (rotX0 - flipped) * (1 - e);
      piece.obj.rotation.z = rotZ0 * (1 - e);
    }, { ease: Ease.inQuad }).done;
    this.landChain = Promise.all([fell, this.landChain]).then(() => {
      if (this.stack !== stack) {
        // the burger was trashed while this piece was falling
        piece.obj.removeFromParent();
        piece.dispose();
        return;
      }
      piece.obj.rotation.x = flipped;
      piece.obj.rotation.z = 0;
      stack.land(piece, dx, dz, kind, clamp(fall / 0.1, 0.4, 1.3));
      if (kind === 'bottom') this.pendingBottom = false;
      this.landFeedback(piece, dx, dz, kind);
      if (kind === 'top') this.complete();
    }).catch((err) => console.error('landing failed', err)); // never break the chain
  }

  private landFeedback(piece: FoodPiece, dx: number, dz: number, kind: 'bottom' | 'top' | 'layer') {
    const def = INGREDIENTS[piece.id];
    const p = this.plateCenter().add(new THREE.Vector3(dx, (this.stack?.height ?? 0) + 0.005, dz));
    const snd = def.sound;
    this.ctx.audio.play(snd === 'bun' ? 'bun' : snd === 'patty' ? 'pattyStack' : snd, { volume: 0.9, rate: rand(0.94, 1.06) });
    this.ctx.rig.punch(kind === 'top' ? 0.05 : 0.02);
    this.ctx.rig.addTrauma(kind === 'top' ? 0.08 : 0.04);
    this.ctx.haptic(kind === 'top' ? 18 : 8);
    // particles
    const fx = this.ctx.fx;
    switch (snd) {
      case 'wet':
        fx.burst('drop', p, 6, { color: piece.id === 'pickles' || piece.id === 'jalapenos' ? 0x9ab84a : 0xe0442e, floor: PLATE_Y });
        break;
      case 'leafy':
        fx.burst('drop', p, 4, { color: 0x7cc24e, size: 0.008, floor: PLATE_Y });
        break;
      case 'bun':
        fx.burst('puff', p, 5, { color: 0xf3e3c4, size: 0.03 });
        break;
      case 'patty':
        fx.burst('steam', p, 5);
        fx.burst('drop', p, 3, { color: 0x6b3a1e, floor: PLATE_Y });
        break;
      case 'crunchy':
      case 'crisp':
        fx.burst('drop', p, 5, { color: 0xd9a04a, size: 0.006, floor: PLATE_Y });
        break;
      default:
        fx.burst('puff', p, 3, { size: 0.02 });
    }
    // placement feedback
    const acc = clamp(1 - Math.max(0, Math.hypot(dx, dz) - 0.007) / 0.038);
    const order = this.ctx.orders.activeBuild;
    if (order && kind === 'layer') {
      const idx = (this.stack?.layerCount ?? 1) - 1;
      const want = order.layers[idx];
      if (!want || want.id !== piece.id) {
        this.ctx.ui.toastWorld(want ? 'Wrong layer!' : 'Extra!', p.clone().setY(p.y + 0.12), 'bad');
        this.ctx.audio.play('wrong', { volume: 0.5 });
      } else if (acc > 0.97) this.ctx.ui.toastWorld('Perfect!', p.clone().setY(p.y + 0.12), 'perfect');
      else if (acc < 0.6) this.ctx.ui.toastWorld('Sloppy', p.clone().setY(p.y + 0.12), 'info');
    }
    this.ctx.ui.tutorialEvent('layer-added');
    this.ctx.ui.refreshBuildTicket();
  }

  private miss(piece: FoodPiece) {
    const from = piece.obj.position.clone();
    const floorY = BUILD.plate.y + 0.004;
    this.ctx.audio.play('splat', { volume: 0.8 });
    this.ctx.ui.toastWorld('Missed!', from.clone().setY(1.15), 'bad');
    this.ctx.engine.tweens
      .run(0.35, (e) => {
        piece.obj.position.y = from.y + (floorY - from.y) * e;
        piece.obj.rotation.z += 0.08;
      }, { ease: Ease.inQuad })
      .done.then(() => this.ctx.engine.tweens.run(0.4, (e) => piece.obj.scale.setScalar(1 - e)).done)
      .then(() => {
        piece.obj.removeFromParent();
        piece.dispose();
      });
  }

  private toss(piece: FoodPiece) {
    this.ctx.audio.play('trash');
    this.ctx.engine.tweens.run(0.25, (e) => piece.obj.scale.setScalar(1 - e)).done.then(() => {
      piece.obj.removeFromParent();
      piece.dispose();
    });
  }

  // ------------------------------------------------------------------ sauces
  private dragSauce(src: Source, ray: THREE.Ray): DragHandler | void {
    const stack = this.stack!;
    if (!this.hasBottom) {
      this.ctx.ui.toastWorld('Start with a bottom bun!', this.plateCenter().setY(1.2), 'bad');
      this.ctx.audio.play('error');
      return;
    }
    const bottle = src.group;
    const home = src.home.clone();
    const tmp = new THREE.Vector3();
    const target = bottle.position.clone();
    this.ctx.audio.play('pickup', { volume: 0.5, rate: 1.3 });
    const follow = (r: THREE.Ray) => {
      if (Input.planePoint(r, this.hoverHeight() + 0.03, tmp)) target.copy(tmp).add(new THREE.Vector3(0, 0, 0));
    };
    follow(ray);
    this.ctx.ui.trash.show();
    let busy = false;
    const updater = this.ctx.engine.onUpdate((dt) => {
      if (busy) return;
      // bottle hangs upside down, nozzle tip at the pointer
      const tip = new THREE.Vector3(target.x, target.y, target.z);
      const pos = tip.clone().add(new THREE.Vector3(0, 0.2, 0));
      bottle.position.lerp(pos, 1 - Math.exp(-dt * 20));
      bottle.rotation.x += (Math.PI - bottle.rotation.x) * (1 - Math.exp(-dt * 14));
      bottle.rotation.z = clamp((pos.x - bottle.position.x) * 4, -0.4, 0.4);
      this.updateMarker(new THREE.Vector3(bottle.position.x, 0, bottle.position.z));
    });
    const goHome = () => {
      this.ctx.engine.tweens.to(bottle.position, { x: home.x, y: home.y, z: home.z }, 0.3, { ease: Ease.outBack });
      this.ctx.engine.tweens.to(bottle.rotation, { x: 0, z: 0 }, 0.3);
    };
    return {
      move: (r, ndc) => {
        follow(r);
        this.ctx.ui.trash.setHot(false);
        void ndc;
      },
      up: (_r, _ndc, clicked) => {
        this.ctx.ui.trash.hide();
        const c = this.plateCenter();
        let dx = target.x - c.x;
        let dz = target.z - c.z;
        if (clicked) {
          dx = rand(-0.006, 0.006);
          dz = rand(-0.006, 0.006);
        }
        this.marker.visible = false;
        if (this.stackClosed || Math.hypot(dx, dz) > 0.11) {
          updater();
          goHome();
          return;
        }
        busy = true;
        // move bottle over the drop point then squeeze
        const over = new THREE.Vector3(c.x + dx, PLATE_Y + stack.height + 0.23, c.z + dz);
        this.ctx.engine.tweens.to(bottle.position, { x: over.x, y: over.y, z: over.z }, 0.12);
        this.ctx.engine.tweens.to(bottle.rotation, { x: Math.PI, z: 0 }, 0.12).done
          .then(() => this.landChain) // anything still falling lands first
          .then(() => (this.stack === stack ? this.squirt(src.id as SauceId, bottle, dx, dz) : undefined))
          .then(() => {
            updater();
            goHome();
          });
      },
      cancel: () => {
        updater();
        this.ctx.ui.trash.hide();
        this.marker.visible = false;
        goHome();
      },
    };
  }

  private squirt(id: SauceId, bottle: THREE.Group, dx: number, dz: number): Promise<void> {
    const stack = this.stack!;
    const piece = this.ctx.food.sauce(id);
    const body = bottle.getObjectByName('body')!;
    const matS = this.stream.material as THREE.MeshPhysicalMaterial;
    matS.color.copy(this.ctx.food.sauceMaterial(id).color);
    this.ctx.audio.play('squirt', { rate: rand(0.9, 1.1) });
    stack.land(piece, dx, dz, 'layer', 0.2);
    const item = stack.items[stack.items.length - 1];
    item.grow = { t: 0, dur: 0.6 };
    const top = PLATE_Y + stack.height;
    this.stream.visible = true;
    const nozzle = new THREE.Vector3();
    const fx = this.ctx.fx;
    return this.ctx.engine.tweens
      .run(0.6, (e, raw) => {
        const sq = Math.sin(Math.min(1, raw * 1.3) * Math.PI);
        body.scale.set(1 + sq * 0.12, 1 - sq * 0.08, 1 + sq * 0.12);
        // stream from nozzle to the current sauce head
        bottle.localToWorld(nozzle.set(0, 0.197, 0));
        const len = Math.max(0.01, nozzle.y - top);
        this.stream.position.set(nozzle.x, top + len / 2, nozzle.z);
        this.stream.scale.set(1, len, 1);
        // wobble the bottle along the spiral
        bottle.position.x += Math.cos(raw * 30) * 0.0009;
        bottle.position.z += Math.sin(raw * 30) * 0.0009;
        if (Math.random() < 0.3) fx.emit('drop', new THREE.Vector3(nozzle.x, top + 0.005, nozzle.z), { color: matS.color.getHex(), size: 0.006, floor: top });
        void e;
      })
      .done.then(() => {
        this.stream.visible = false;
        body.scale.set(1, 1, 1);
        this.ctx.audio.play('splat', { volume: 0.4, rate: 1.4 });
        this.landFeedback(piece, dx, dz, 'layer');
      });
  }

  // ------------------------------------------------------------------ completion
  private completing = false;
  private complete() {
    const stack = this.stack!;
    const order = this.ctx.orders.activeBuild;
    this.completing = true;
    const flag = this.flagProto.clone();
    const topY = stack.height + 0.055;
    flag.position.set(stack.items[stack.items.length - 1].dx, topY + 0.25, stack.items[stack.items.length - 1].dz);
    flag.rotation.y = rand(-0.5, 0.5);
    stack.group.add(flag);
    const center = this.plateCenter().setY(PLATE_Y + stack.height + 0.05);
    this.ctx.engine.tweens.run(0.22, (e) => (flag.position.y = topY + 0.25 - 0.28 * e), { ease: Ease.inQuad }).done.then(() => {
      this.ctx.audio.play('stab', { volume: 0.7 });
      this.ctx.audio.play('burgerDone');
      this.ctx.fx.burst('star', center, 10, { spread: 0.8, size: 0.035 });
      this.ctx.fx.burst('glow', center, 1, { size: 0.45, color: 0xffe6a0 });
      this.ctx.rig.punch(0.08);
      this.ctx.ui.toastWorld('Order up!', center.clone().setY(center.y + 0.14), 'perfect');
    });
    this.ctx.engine.tweens.wait(1.1).then(() => {
      stack.settle();
      // hand the finished burger (with its tray) to the pickup counter
      const tray = this.tray;
      tray.attach(stack.group);
      const out = tray;
      const from = out.position.clone();
      this.ctx.audio.play('slide');
      // lift clear of the bottles, then whisk off toward the pass
      return this.ctx.engine.tweens.run(0.5, (e, raw) => {
        const up = Ease.outCubic(Math.min(1, raw * 2.2));
        const across = Ease.inCubic(Math.max(0, (raw - 0.25) / 0.75));
        out.position.set(from.x + across * 1.9, from.y + up * 0.3, from.z + across * 0.25);
        out.rotation.z = -Math.sin(raw * Math.PI) * 0.08;
      }).done.then(() => {
        out.removeFromParent();
        out.rotation.set(0, 0, 0);
        this.onComplete?.(order, stack, out);
        // a fresh tray drops into place
        this.tray = makeTray(this.ctx.world.mats);
        this.tray.position.copy(BUILD.plate).setY(BUILD.plate.y + 0.35);
        this.root.add(this.tray);
        this.stack = null;
        this.newStack();
        this.stack!.group.visible = true;
        return this.ctx.engine.tweens.run(0.32, (e) => (this.tray.position.y = BUILD.plate.y + 0.35 * (1 - e)), { ease: Ease.outBounce }).done.then(() => {
          this.ctx.audio.play('plate', { volume: 0.55, rate: 1.1 });
        });
      });
    }).then(() => {
      this.completing = false;
      this.ctx.ui.refreshBuildTicket();
    });
  }

  /** Throw away the burger in progress. */
  trashBurger() {
    if (!this.stack || !this.stack.items.length || this.completing) return;
    const s = this.stack;
    this.ctx.audio.play('trash');
    this.ctx.engine.tweens.run(0.35, (e) => {
      s.group.position.y = PLATE_Y + e * 0.1;
      s.group.scale.setScalar(1 - e);
      s.group.rotation.z = e * 1.2;
    }).done.then(() => {
      s.dispose();
      if (this.stack === s) this.newStack();
      this.ctx.ui.refreshBuildTicket();
    });
  }

  get inProgress(): boolean {
    return !!this.stack && this.stack.items.length > 0;
  }

  update(dt: number) {
    this.time += dt;
    this.stack?.update(dt);
    // topping guide / next ingredient highlight
    const guide = this.ctx.progress.level('topping_guide') > 0 || (this.ctx.ui.tutorialActive && this.active);
    const order = this.ctx.orders.activeBuild;
    let next: IngredientId | null = null;
    if (guide && order && this.stack && !this.stack.complete) {
      if (!this.stack.hasBottom) next = order.bun;
      else {
        const idx = this.stack.layerCount;
        next = idx < order.layers.length ? order.layers[idx].id : order.bun;
      }
    }
    const pulse = 0.35 + 0.25 * Math.sin(this.time * 6);
    for (const s of this.sources) {
      if (!s.glow) continue;
      const m = s.glow.material as THREE.MeshBasicMaterial;
      const on = next === s.id && !this.dragging;
      m.opacity += ((on ? pulse : 0) - m.opacity) * Math.min(1, dt * 10);
    }
    // warmer highlight for patties
    if (next && isPatty(next)) {
      /* the UI highlights the warmer in the ticket panel */
    }
    void TOPPINGS;
    void CHEESES;
    void WARMER;
    void BUN_R;
    void ({} as LayerId);
  }

  enter() {
    super.enter();
    this.ctx.ui.showBuildTicket(true);
    this.ctx.ui.tutorialEvent('at-build');
  }

  exit() {
    super.exit();
    this.ctx.ui.showBuildTicket(false);
    this.ctx.ui.hoverLabel(null);
  }

  reset() {
    this.stack?.dispose();
    this.newStack();
    this.refreshLocks();
  }

  /** World position of an ingredient source (tests). */
  sourcePos(id: IngredientId): THREE.Vector3 | null {
    const s = this.sources.find((x) => x.id === id);
    return s ? s.group.getWorldPosition(new THREE.Vector3()) : null;
  }

  /** Bot helpers for automated tests. */
  botAdd(id: IngredientId, doneness?: string): boolean {
    if (this.completing) return false;
    if (this.stackClosed) return false;
    const c = this.plateCenter();
    if (INGREDIENTS[id].category === 'sauce') {
      const src = this.sources.find((s) => s.id === id)!;
      const stack = this.stack;
      this.landChain.then(() => (this.stack === stack ? this.squirt(id as SauceId, src.group, 0.002, -0.002) : undefined));
      return true;
    }
    let piece: FoodPiece;
    let kind: 'bottom' | 'top' | 'layer' = 'layer';
    if (INGREDIENTS[id].category === 'bun') {
      kind = this.hasBottom ? 'top' : 'bottom';
      piece = this.ctx.food.bunPart(id as BunId, kind === 'top' ? 'top' : 'bottom');
    } else if (isPatty(id)) {
      const w = this.ctx.warmer;
      let slot = w.items.findIndex((x) => x && x.kind === id && (!doneness || x.target === doneness));
      if (slot < 0) slot = w.items.findIndex((x) => x && x.kind === id);
      if (slot < 0) return false;
      const wp = w.take(slot)!;
      piece = wp.piece;
      this.root.attach(piece.obj);
    } else piece = this.ctx.food.make(id);
    this.root.add(piece.obj);
    piece.obj.position.set(c.x, this.hoverHeight(), c.z);
    this.drop(piece, 0.001, -0.001, kind);
    return true;
  }
}
