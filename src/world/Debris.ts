/**
 * Breakable road junk: light dynamic bodies (planks, sawhorses, cones, crates,
 * sandbags, bins) that the car smashes through, and explosive red barrels.
 *
 * Pieces are spawned with their chunk as kinematic (ANIMATED) bodies so idle
 * barricades far ahead cost nothing, switched to DYNAMIC when the car gets
 * close, and disposed once they fall far behind. Explosive barrels emit an
 * `explosion` event when hit hard and chain-react with each other.
 */
import {
  Mesh, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShapeCylinder, Quaternion, Vector3,
  type InstancedMesh, type Observer, type IPhysicsCollisionEvent, type PhysicsShape, type Scene,
} from "@babylonjs/core";
import type { EventBus } from "../core/Events";
import { CollideWith, Layer } from "../physics/Layers";
import { toon } from "../fx/Materials";
import { Shadows } from "../fx/Shadows";
import { Geo, mix, rgb, tint } from "./Geo";
import type { Colors } from "./Props";

export type DebrisKind = "plank" | "sawhorse" | "cone" | "crate" | "barrel" | "drum" | "sandbag" | "bin";

interface Kind {
  mesh: Mesh;
  shape: PhysicsShape;
  mass: number;
  /** Half height, so callers can rest pieces on the ground. */
  half: number;
}

interface Piece {
  mesh: InstancedMesh;
  body: PhysicsBody;
  kind: DebrisKind;
  chunk: number;
  dynamic: boolean;
  explosive: boolean;
  fuse: number; // >0: seconds until it explodes
  observer: Observer<IPhysicsCollisionEvent> | null;
  dead: boolean;
}

const EXPLODE_IMPULSE = 140; // N*s; roughly a car tap at ~5 m/s
const ACTIVATE_AHEAD = 45;
const ACTIVATE_BEHIND = 12;
const DISPOSE_BEHIND = 70;

export class Debris {
  private kinds = new Map<DebrisKind, Kind>();
  private pieces: Piece[] = [];
  private active = 0;
  private readonly cap: number;
  private unsub: () => void;
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private nextId = 0;

  constructor(private scene: Scene, c: Colors, private events: EventBus, quality: number) {
    this.cap = [30, 50, 70][quality] ?? 50;
    this.buildKinds(c);
    this.unsub = events.on("explosion", (e) => this.onExplosion(e.position, e.radius, e.power));
  }

  /** Height of a piece's center above the ground when resting upright. */
  restHeight(kind: DebrisKind): number {
    return this.kinds.get(kind)?.half ?? 0.5;
  }

  get count(): number {
    return this.pieces.length;
  }

  get activeCount(): number {
    return this.active;
  }

  private buildKinds(c: Colors): void {
    const s = this.scene;
    const mat = toon(s, "#ffffff");
    const orange = rgb("#f26b1d");
    const add = (kind: DebrisKind, build: (g: Geo) => void, shape: PhysicsShape, mass: number, half: number) => {
      const g = new Geo();
      g.jitter = 0.04;
      build(g);
      const mesh = g.toMesh(`debris_${kind}`, s, mat)!;
      // Keep the source enabled (instances need it) but out of sight.
      mesh.position.set(0, -500, 0);
      mesh.receiveShadows = true;
      shape.filterMembershipMask = Layer.DEBRIS;
      shape.filterCollideMask = CollideWith.DEBRIS;
      shape.material = { friction: 0.7, restitution: 0.15 };
      this.kinds.set(kind, { mesh, shape, mass, half });
    };
    const box = (x: number, y: number, z: number) => new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(x, y, z), s);
    const cyl = (h: number, r: number) => new PhysicsShapeCylinder(new Vector3(0, -h / 2, 0), new Vector3(0, h / 2, 0), r, s);

    add("plank", (g) => {
      g.box(0, 0, 0, 2.6, 0.12, 0.32, c.wood, { top: tint(c.wood, 0.1) });
      g.box(-1.1, 0, 0, 0.1, 0.14, 0.34, c.woodDark);
      g.box(1.1, 0, 0, 0.1, 0.14, 0.34, c.woodDark);
    }, box(2.6, 0.12, 0.32), 12, 0.06);

    add("sawhorse", (g) => {
      // striped board on A-frame legs
      for (let i = 0; i < 6; i++) g.box(-0.75 + i * 0.3, 0.32, 0, 0.3, 0.32, 0.08, i % 2 ? c.white : orange);
      for (const x of [-0.7, 0.7]) {
        g.beam(x, 0.42, 0, x - 0.08, -0.5, -0.25, 0.08, 0.08, c.woodDark);
        g.beam(x, 0.42, 0, x - 0.08, -0.5, 0.25, 0.08, 0.08, c.woodDark);
      }
      g.box(0, -0.05, 0, 1.6, 0.08, 0.08, c.woodDark);
    }, box(1.8, 1.0, 0.5), 15, 0.5);

    add("cone", (g) => {
      g.box(0, -0.335, 0, 0.5, 0.08, 0.5, c.dark);
      g.cyl(0, -0.3, 0, 0.21, 0.05, 0.66, 6, orange);
      g.cyl(0, -0.02, 0, 0.14, 0.11, 0.13, 6, c.white);
    }, box(0.48, 0.75, 0.48), 3, 0.375);

    add("crate", (g) => {
      g.box(0, 0, 0, 0.9, 0.9, 0.9, c.wood, { top: tint(c.wood, 0.1) });
      g.box(0, 0, 0, 0.94, 0.14, 0.94, c.woodDark);
      g.box(0, 0, 0, 0.14, 0.94, 0.94, c.woodDark);
    }, box(0.9, 0.9, 0.9), 20, 0.45);

    add("barrel", (g) => {
      const red = c.red;
      g.cyl(0, -0.575, 0, 0.42, 0.42, 1.15, 10, red, { top: tint(red, -0.2), capBottom: true });
      g.cyl(0, -0.25, 0, 0.44, 0.44, 0.34, 10, rgb("#ffd23a"));
      // hazard diamond on the band
      g.box(0, -0.08, 0.445, 0.22, 0.22, 0.02, c.dark);
      g.cyl(0, 0.38, 0, 0.44, 0.44, 0.08, 10, tint(red, -0.25));
    }, cyl(1.15, 0.42), 30, 0.575);

    add("drum", (g) => {
      const col = mix(c.rust, c.pal.propB, 0.3);
      g.cyl(0, -0.575, 0, 0.42, 0.42, 1.15, 9, col, { top: tint(col, -0.15), capBottom: true });
      g.cyl(0, -0.35, 0, 0.44, 0.44, 0.1, 9, c.dark);
      g.cyl(0, 0.25, 0, 0.44, 0.44, 0.1, 9, c.dark);
    }, cyl(1.15, 0.42), 25, 0.575);

    add("sandbag", (g) => {
      g.box(0, 0, 0, 0.72, 0.28, 0.46, mix(c.pal.ground, c.white, 0.25), { taper: 0.85 });
    }, box(0.72, 0.28, 0.46), 14, 0.14);

    add("bin", (g) => {
      const col = mix(c.pal.propB, c.metal, 0.5);
      g.cyl(0, -0.48, 0, 0.33, 0.37, 0.96, 8, col, { capBottom: true });
      g.cyl(0, 0.46, 0, 0.4, 0.3, 0.12, 8, tint(col, -0.2));
    }, cyl(0.96, 0.37), 10, 0.48);
  }

  /** Spawn a piece at its center position (kinematic until the car is near). */
  spawn(kind: DebrisKind, x: number, y: number, z: number, yaw: number, chunk: number, pitch = 0, roll = 0): void {
    const k = this.kinds.get(kind);
    if (!k) return;
    const mesh = k.mesh.createInstance(`${kind}_${this.nextId++}`);
    mesh.position.set(x, y, z);
    mesh.rotationQuaternion = Quaternion.FromEulerAngles(pitch, yaw, roll);
    mesh.isPickable = false;
    const body = new PhysicsBody(mesh, PhysicsMotionType.ANIMATED, false, this.scene);
    body.shape = k.shape;
    body.setMassProperties({ mass: k.mass });
    const p: Piece = { mesh, body, kind, chunk, dynamic: false, explosive: kind === "barrel", fuse: 0, observer: null, dead: false };
    if (p.explosive) {
      body.setCollisionCallbackEnabled(true);
      p.observer = body.getCollisionObservable().add((e) => {
        if (p.fuse <= 0 && !p.dead && e.impulse > EXPLODE_IMPULSE) p.fuse = 0.02;
      });
    }
    Shadows.cast(mesh, false);
    this.pieces.push(p);
  }

  private activate(p: Piece): void {
    if (p.dynamic) return;
    p.body.setMotionType(PhysicsMotionType.DYNAMIC);
    p.body.setMassProperties({ mass: this.kinds.get(p.kind)!.mass });
    p.dynamic = true;
    this.active++;
  }

  private remove(p: Piece): void {
    if (p.dead) return;
    p.dead = true;
    if (p.dynamic) this.active--;
    if (p.observer) p.body.getCollisionObservable().remove(p.observer);
    Shadows.remove(p.mesh);
    p.body.dispose();
    p.mesh.dispose();
  }

  update(dt: number, carPos: Vector3): void {
    const cz = carPos.z;
    let behindDynamic = 0;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      if (p.dead) continue;
      const z = p.mesh.position.z;
      if (p.fuse > 0) {
        p.fuse -= dt;
        if (p.fuse <= 0) {
          this.detonate(p);
          continue;
        }
      }
      if (z < cz - DISPOSE_BEHIND || p.mesh.position.y < -60) {
        this.remove(p);
        continue;
      }
      if (!p.dynamic && z < cz + ACTIVATE_AHEAD && z > cz - ACTIVATE_BEHIND) this.activate(p);
      if (p.dynamic && z < cz - 25) behindDynamic++;
    }
    // Over budget: drop the pieces furthest behind the car.
    if (this.active > this.cap && behindDynamic > 0) {
      for (const p of this.pieces) {
        if (this.active <= this.cap) break;
        if (!p.dead && p.dynamic && p.mesh.position.z < cz - 25) this.remove(p);
      }
    }
    // Compact the list occasionally.
    if (this.pieces.length > 40 && this.pieces.some((p) => p.dead)) this.pieces = this.pieces.filter((p) => !p.dead);
  }

  private detonate(p: Piece): void {
    const pos = p.mesh.position.clone();
    this.remove(p);
    this.events.emit("explosion", { position: pos, radius: 6, power: 1 });
  }

  /** Any explosion (ours, zombies', weapons') pushes debris and lights barrels. */
  private onExplosion(center: Vector3, radius: number, power: number): void {
    const r2 = radius * radius * 1.44;
    for (const p of this.pieces) {
      if (p.dead) continue;
      const d = this.tmp.copyFrom(p.mesh.position).subtractInPlace(center);
      const l2 = d.lengthSquared();
      if (l2 > r2) continue;
      if (p.explosive) {
        if (p.fuse <= 0) p.fuse = 0.12 + Math.sqrt(l2) * 0.03;
        continue;
      }
      this.activate(p);
      const l = Math.sqrt(l2) || 1;
      const k = this.kinds.get(p.kind)!;
      const strength = power * k.mass * 14 * (1 - l / (radius * 1.2));
      d.scaleInPlace(1 / l);
      d.y = d.y * 0.5 + 0.8;
      d.scaleInPlace(Math.max(0, strength));
      this.tmp2.copyFrom(p.mesh.position);
      this.tmp2.y += 0.1;
      p.body.applyImpulse(d, this.tmp2);
    }
  }

  /** Dispose every piece that belongs to a chunk. */
  disposeChunk(chunk: number): void {
    for (const p of this.pieces) if (p.chunk === chunk) this.remove(p);
  }

  dispose(): void {
    this.unsub();
    for (const p of this.pieces) this.remove(p);
    this.pieces = [];
    for (const k of this.kinds.values()) {
      k.shape.dispose();
      k.mesh.dispose();
    }
    this.kinds.clear();
  }
}
