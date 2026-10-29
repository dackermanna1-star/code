// `light` feature: a Babylon PointLight/SpotLight parented to the bulb's island node. The
// bulb part breaking (fracture), detaching (all its bonds gone) or a hard-wired mains fixture
// losing its last connection to the building (any bond of the assembly) kills the light (pop +
// sparks via the `lightBroken` event); shattered bulb fragments are unlit; strong impacts
// make it flicker. Wall switches toggle it; the power state is handled by the lighting system
// (mains lights) and mirrored on the bulb's emissive surface.

import { Color3, PointLight, SpotLight, Vector3, type Light } from "@babylonjs/core";
import type { FeatureDef } from "../model/types.ts";
import { S } from "../../render/surfaces.ts";
import type { Assembly, Bond, Island, Part } from "../runtime/types.ts";
import { BaseFeature } from "./base.ts";
import type { DamageInfo } from "./feature.ts";
import type { FeatureSystem } from "./system.ts";

type LightDef = Extract<FeatureDef, { type: "light" }>;

interface FlickerHost {
  flicker?(light: Light, seconds: number): void;
  lighting?: { flicker?(light: Light, seconds: number): void };
}

export class LightFeature extends BaseFeature {
  declare readonly def: LightDef;
  light: Light | null = null;
  /** Switch state. */
  on: boolean;
  /** Bulb intact and wired. */
  alive = true;
  private readonly hadWorldBond: boolean;
  private flickerT = 0;
  private flickerSeed = 0;
  private baseIntensity: number;
  private ownPoly = false;
  private lastFlicker = -1;

  constructor(fs: FeatureSystem, asm: Assembly, def: FeatureDef, part: Part) {
    super(fs, asm, def, part);
    const d = def as LightDef;
    this.on = d.on !== false;
    this.baseIntensity = Number.isFinite(d.intensity) && d.intensity > 0 ? d.intensity : 1;
    let world = false;
    for (const p of asm.parts) for (const b of p.bonds) if (b.world) world = true;
    this.hadWorldBond = world;
    this.sync();
  }

  get room(): string | null {
    return this.asm.room;
  }

  private get lit(): boolean {
    return this.alive && this.on && (!this.mains || this.fs.powered);
  }

  /** Create/destroy the Babylon light and swap the bulb surface to match the state. */
  sync(): void {
    const want = this.alive && this.on && !!this.part?.island;
    if (want && !this.light) this.create();
    else if (!want && this.light) this.destroyLight();
    this.setEmissive(this.lit);
  }

  private create(): void {
    const part = this.part;
    const isl = part?.island;
    if (!part || !isl) return;
    const d = this.def;
    const scene = this.fs.w.scene;
    const name = `light.${this.asm.type}#${this.asm.id}.${part.id}`;
    const pos = new Vector3(this.local.x, this.local.y, this.local.z);
    let light: Light;
    if (d.kind === "spot") {
      const dir = d.dir ?? { x: 0, y: -1, z: 0 };
      light = new SpotLight(name, pos, new Vector3(dir.x, dir.y, dir.z), d.angle ?? Math.PI / 2.5, 2, scene);
    } else light = new PointLight(name, pos, scene);
    light.parent = isl.node;
    const c = Color3.FromInts((d.color >> 16) & 255, (d.color >> 8) & 255, d.color & 255);
    light.diffuse = c;
    light.specular = c.scale(0.6);
    light.intensity = this.baseIntensity;
    if (Number.isFinite(d.range) && d.range > 0) light.range = d.range;
    this.light = light;
    this.fs.w.render.addLight(light, this.asm.room, this.mains);
  }

  private destroyLight(): void {
    if (!this.light) return;
    this.fs.w.render.removeLight(this.light);
    this.light.dispose();
    this.light = null;
    this.fs.deactivate(this);
  }

  /** Bulb faces glow only while lit (bulb_on ↔ bulb_off). */
  private setEmissive(on: boolean): void {
    const part = this.part;
    if (!part || !part.alive) return;
    const from = on ? S.bulb_off : S.bulb_on;
    const to = on ? S.bulb_on : S.bulb_off;
    if (!part.poly.faces.some((f) => f.attr.surf === from)) return;
    if (!this.ownPoly) {
      // copy-on-write: blueprint polys may be shared between instances
      part.poly = { verts: part.poly.verts, faces: part.poly.faces.map((f) => ({ ...f, attr: { ...f.attr } })) };
      this.ownPoly = true;
    }
    for (const f of part.poly.faces) if (f.attr.surf === from) f.attr.surf = to;
    this.fs.w.markGeom(part);
  }

  toggle(): boolean {
    if (!this.alive) return false;
    this.on = !this.on;
    this.sync();
    return true;
  }

  /** Kill the light permanently. */
  break(reason: "bulb" | "wires"): void {
    if (!this.alive) return;
    const pos = this.worldPos();
    this.alive = false;
    const wasLit = !!this.light && (!this.mains || this.fs.powered);
    this.destroyLight();
    this.setEmissive(false);
    if (pos && (wasLit || reason === "bulb")) this.fs.w.events.emit("feature", { kind: "lightBroken", pos, intensity: wasLit ? 1 : 0.4 });
  }

  onDamage(ev: DamageInfo): void {
    if (!this.light || !this.lit) return;
    if (ev.energy < 6 && ev.absorbed < 2) return;
    const s = Math.min(1.6, 0.25 + ev.energy / 80);
    this.flicker(s);
  }

  /** Flicker for `seconds` (lighting system if it offers it, else locally). */
  flicker(seconds: number): void {
    if (!this.light || this.now - this.lastFlicker < 0.15) return;
    this.lastFlicker = this.now;
    const r = this.fs.w.render as unknown as FlickerHost;
    if (typeof r.flicker === "function") r.flicker(this.light, seconds);
    else if (r.lighting && typeof r.lighting.flicker === "function") r.lighting.flicker(this.light, seconds);
    else {
      this.flickerT = Math.max(this.flickerT, seconds);
      this.flickerSeed = Math.random() * 100;
      this.fs.activate(this);
    }
    const pos = this.worldPos();
    if (pos) this.fs.w.events.emit("feature", { kind: "lightFlicker", pos, intensity: Math.min(1, seconds) });
  }

  update(dt: number): void {
    if (!this.light) {
      this.fs.deactivate(this);
      return;
    }
    if (this.flickerT <= 0) return;
    this.flickerT -= dt;
    if (this.flickerT <= 0 || !this.lit) {
      this.light.intensity = this.baseIntensity;
      this.flickerT = 0;
      this.fs.deactivate(this);
      return;
    }
    const t = this.now * 37 + this.flickerSeed;
    const n = Math.sin(t) * Math.sin(t * 2.3 + 1.7) * Math.sin(t * 5.1);
    this.light.intensity = this.baseIntensity * (n > 0.15 ? 1 : n < -0.35 ? 0.05 : 0.45);
  }

  onFracture(old: Part): void {
    if (old === this.part) this.break("bulb");
  }

  onPartKilled(part: Part): void {
    if (part === this.part) this.break("bulb");
  }

  onBondBroken(_bond: Bond, part: Part): void {
    if (!this.alive) return;
    // bulb pulled out of its socket
    if (part === this.part && part.bonds.length === 0 && this.asm.parts.size > 1) this.break("wires");
  }

  /** Any bond of the assembly broke: a hard-wired fixture torn from the ceiling/wall rips its cable. */
  onAsmBondBroken(): void {
    if (!this.alive || !this.mains || !this.hadWorldBond) return;
    if (!this.wired()) this.break("wires");
  }

  /**
   * The bulb still reaches the building through live bonds (rigid or jointed: a pendant on its
   * chain, a swing-arm lamp on its hinge). Fixtures are small — a plain BFS over the bonds.
   */
  private wired(): boolean {
    const start = this.part;
    if (!start || !start.alive) return false;
    const seen = new Set<Part>([start]);
    const stack: Part[] = [start];
    while (stack.length) {
      const p = stack.pop()!;
      for (const b of p.bonds) {
        if (!b.alive) continue;
        if (b.world) return true;
        const o = b.other(p);
        if (o && !seen.has(o)) {
          seen.add(o);
          stack.push(o);
        }
      }
    }
    return false;
  }

  onIslandChanged(_part: Part, island: Island): void {
    if (this.light) this.light.parent = island.node;
    else if (this.alive && this.on) this.sync(); // host was between islands (deferred split)
  }

  onPower(): void {
    this.setEmissive(this.lit);
  }

  override dispose(): void {
    this.destroyLight();
    super.dispose();
  }
}
