/**
 * All juice: blood bursts, gore decals, car splatter, sparks, debris chips,
 * explosions (fireball, shockwave, smoke, flash, scorch), landing dust,
 * wheel dust, exhaust, boost flame, damage smoke/fire, and post-processing.
 * Everything is pooled; counts scale with the quality setting.
 */
import {
  Color3,
  Color4,
  DefaultRenderingPipeline,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  PhysicsRaycastResult,
  PointLight,
  StandardMaterial,
  Vector3,
  type Camera,
  type InstancedMesh,
  type PhysicsEngineV2,
  type Scene,
  type Texture,
  type TransformNode,
} from "@babylonjs/core";
import { Time } from "../core/Time";
import { LEVELS, type LevelDef } from "../data/levels";
import { Layer } from "../physics/Layers";
import type { GoreMode } from "../core/Save";
import type { GameContext, ISystem, IVehicle } from "../core/types";
import { Tex } from "./Textures";

const QUALITY = { low: 0.4, medium: 0.75, high: 1 };

interface BurstCfg {
  tex: Texture;
  capacity: number;
  blend: number;
  gravity: number;
  life: [number, number];
  size: [number, number];
  power: [number, number];
  color1: Color4;
  color2: Color4;
  colorDead: Color4;
  spread?: number; // 0..1 randomness around the direction
  billboardStretch?: boolean;
  sizeGrow?: number; // multiplier at end of life
  angular?: number;
  drag?: number;
}

/** Round-robin pool of particle systems used for one-shot bursts. */
class Burst {
  private systems: ParticleSystem[] = [];
  private next = 0;
  constructor(scene: Scene, name: string, private cfg: BurstCfg, poolSize = 4) {
    for (let i = 0; i < poolSize; i++) {
      const ps = new ParticleSystem(`${name}${i}`, cfg.capacity, scene);
      ps.particleTexture = cfg.tex;
      ps.blendMode = cfg.blend;
      ps.gravity.set(0, cfg.gravity, 0);
      ps.minLifeTime = cfg.life[0];
      ps.maxLifeTime = cfg.life[1];
      ps.minSize = cfg.size[0];
      ps.maxSize = cfg.size[1];
      ps.minEmitPower = cfg.power[0];
      ps.maxEmitPower = cfg.power[1];
      ps.color1 = cfg.color1;
      ps.color2 = cfg.color2;
      ps.colorDead = cfg.colorDead;
      ps.emitRate = 0;
      ps.minAngularSpeed = -(cfg.angular ?? 0);
      ps.maxAngularSpeed = cfg.angular ?? 0;
      ps.minInitialRotation = 0;
      ps.maxInitialRotation = Math.PI * 2;
      if (cfg.billboardStretch) ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
      if (cfg.sizeGrow) {
        // Size gradients are absolute sizes (not multipliers).
        ps.addSizeGradient(0, cfg.size[0], cfg.size[1]);
        ps.addSizeGradient(1, cfg.size[0] * cfg.sizeGrow, cfg.size[1] * cfg.sizeGrow);
      }
      if (cfg.drag) ps.addDragGradient(0, cfg.drag);
      ps.emitter = new Vector3();
      ps.minEmitBox.setAll(0);
      ps.maxEmitBox.setAll(0);
      ps.updateSpeed = 1 / 60;
      ps.start();
      this.systems.push(ps);
    }
  }
  setColors(c1: Color4, c2: Color4, dead: Color4): void {
    for (const s of this.systems) {
      s.color1 = c1;
      s.color2 = c2;
      s.colorDead = dead;
    }
  }
  emit(pos: Vector3, count: number, dir?: Vector3, powerScale = 1, box = 0): void {
    if (count <= 0) return;
    const ps = this.systems[this.next];
    this.next = (this.next + 1) % this.systems.length;
    (ps.emitter as Vector3).copyFrom(pos);
    ps.minEmitBox.setAll(-box);
    ps.maxEmitBox.setAll(box);
    const sp = this.cfg.spread ?? 1;
    if (dir) {
      ps.direction1.set(dir.x - sp, dir.y - sp * 0.3, dir.z - sp);
      ps.direction2.set(dir.x + sp, dir.y + sp, dir.z + sp);
    } else {
      ps.direction1.set(-1, -0.2, -1);
      ps.direction2.set(1, 1, 1);
    }
    ps.minEmitPower = this.cfg.power[0] * powerScale;
    ps.maxEmitPower = this.cfg.power[1] * powerScale;
    ps.manualEmitCount = Math.round(count);
  }
  setSpeed(s: number): void {
    for (const p of this.systems) p.updateSpeed = s;
  }
  dispose(): void {
    for (const s of this.systems) s.dispose();
  }
}

/** Continuous emitter attached to a node or moving point. */
function stream(scene: Scene, name: string, tex: Texture, capacity: number): ParticleSystem {
  const ps = new ParticleSystem(name, capacity, scene);
  ps.particleTexture = tex;
  ps.emitRate = 0;
  ps.updateSpeed = 1 / 60;
  ps.minInitialRotation = 0;
  ps.maxInitialRotation = Math.PI * 2;
  ps.start();
  return ps;
}

/** Flat textured quads stuck to the ground (pooled instances). */
class DecalPool {
  private sources = new Map<string, Mesh>();
  private live: InstancedMesh[] = [];
  constructor(private scene: Scene, private cap: number) {}
  private source(key: string, tex: Texture, color: Color3, alpha: number): Mesh {
    let m = this.sources.get(key);
    if (m) return m;
    m = MeshBuilder.CreateGround(`decal_${key}`, { width: 1, height: 1 }, this.scene);
    const mat = new StandardMaterial(`decalMat_${key}`, this.scene);
    mat.diffuseTexture = tex;
    mat.diffuseTexture.hasAlpha = true;
    mat.useAlphaFromDiffuseTexture = true;
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(0.45);
    mat.specularColor = Color3.Black();
    mat.alpha = alpha;
    mat.zOffset = -4;
    mat.backFaceCulling = false;
    m.material = mat;
    m.isPickable = false;
    m.receiveShadows = true;
    m.position.y = -999;
    this.sources.set(key, m);
    return m;
  }
  add(key: string, tex: Texture, color: Color3, pos: Vector3, normal: Vector3 | null, size: number, alpha = 1, parent?: TransformNode): InstancedMesh {
    const src = this.source(key, tex, color, alpha);
    let inst: InstancedMesh;
    if (this.live.length >= this.cap) {
      inst = this.live.shift()!;
      inst.dispose();
    }
    inst = src.createInstance("d");
    inst.isPickable = false;
    inst.parent = parent ?? null;
    inst.position.copyFrom(pos);
    inst.rotation.set(0, Math.random() * Math.PI * 2, 0);
    if (normal && !parent) {
      // tilt to the surface (small slopes only)
      inst.rotation.x = Math.atan2(normal.z, normal.y) * -1;
      inst.rotation.z = Math.atan2(normal.x, normal.y);
    }
    inst.scaling.set(size, 1, size);
    this.live.push(inst);
    return inst;
  }
  cullBehind(z: number): void {
    while (this.live.length && !this.live[0].parent && this.live[0].position.z < z) this.live.shift()!.dispose();
  }
  dispose(): void {
    for (const d of this.live) d.dispose();
    for (const s of this.sources.values()) s.dispose();
  }
}

interface Flash {
  light: PointLight;
  t: number;
}
interface Ring {
  mesh: Mesh;
  t: number;
  max: number;
}

export class FX implements ISystem {
  private q: number;
  private gore: GoreMode;
  private level: LevelDef;
  private unsubs: (() => void)[] = [];
  private pe: PhysicsEngineV2 | null;
  private ray = new PhysicsRaycastResult();
  private decals: DecalPool;
  private pipeline: DefaultRenderingPipeline | null = null;
  private aberration = 0;
  // bursts
  private blood: Burst;
  private bloodMist: Burst;
  private gibs: Burst;
  private sparks: Burst;
  private chips: Burst;
  private dust: Burst;
  private fireball: Burst;
  private smokeBurst: Burst;
  private embers: Burst;
  private confetti: Burst;
  // streams
  private exhaust: ParticleSystem;
  private boostFlame: ParticleSystem;
  private damageSmoke: ParticleSystem;
  private damageFire: ParticleSystem;
  private wheelDust: ParticleSystem[] = [];
  private flashes: Flash[] = [];
  private rings: Ring[] = [];
  private carSplats = 0;
  private gibColor = new Color4();
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private down = new Vector3();
  private scrapeCooldown = 0;
  private pendingSplats: { pos: Vector3; size: number; at: number }[] = [];

  constructor(
    private ctx: GameContext,
    private vehicle: IVehicle,
    camera: Camera,
  ) {
    const scene = ctx.scene;
    const settings = ctx.save.data.settings;
    this.q = QUALITY[settings.quality];
    this.gore = settings.gore;
    this.level = LEVELS[Math.min(ctx.save.data.selectedLevel, LEVELS.length - 1)];
    this.pe = scene.getPhysicsEngine() as PhysicsEngineV2 | null;
    this.decals = new DecalPool(scene, Math.round(160 * this.q) + 20);
    const q = this.q;
    const STD = ParticleSystem.BLENDMODE_STANDARD;
    const ADD = ParticleSystem.BLENDMODE_ADD;
    const c4 = (hex: string, a = 1) => Color4.FromColor3(Color3.FromHexString(hex), a);
    const [g1, g2] = this.goreColors();

    this.blood = new Burst(scene, "blood", {
      tex: Tex.dot(scene), capacity: Math.round(220 * q) + 30, blend: STD, gravity: -16, life: [0.5, 1.1], size: [0.08, 0.26],
      power: [3, 9], color1: g1, color2: g2, colorDead: g2, spread: 0.9, angular: 2,
    });
    this.bloodMist = new Burst(scene, "bloodMist", {
      tex: Tex.puff(scene), capacity: 30, blend: STD, gravity: -1, life: [0.35, 0.6], size: [0.6, 1.2], power: [0.5, 1.5],
      color1: new Color4(g1.r, g1.g, g1.b, 0.7), color2: new Color4(g2.r, g2.g, g2.b, 0.5), colorDead: new Color4(g2.r, g2.g, g2.b, 0), sizeGrow: 2,
    });
    this.gibColor = this.gore === "green" ? c4("#4d6b1f") : c4("#7a1222");
    this.gibs = new Burst(scene, "gibs", {
      tex: Tex.flame(scene), capacity: 60, blend: STD, gravity: -18, life: [0.8, 1.4], size: [0.12, 0.3], power: [4, 10],
      color1: this.gibColor, color2: c4("#4a0d16"), colorDead: c4("#4a0d16"), spread: 1, angular: 8,
    });
    this.sparks = new Burst(scene, "sparks", {
      tex: Tex.spark(scene), capacity: Math.round(160 * q) + 20, blend: ADD, gravity: -14, life: [0.2, 0.5], size: [0.12, 0.3],
      power: [6, 14], color1: c4("#fff3b0"), color2: c4("#ffb347"), colorDead: c4("#ff5a1f", 0), spread: 1, billboardStretch: true,
    });
    this.chips = new Burst(scene, "chips", {
      tex: Tex.dot(scene), capacity: 60, blend: STD, gravity: -16, life: [0.5, 1], size: [0.06, 0.16], power: [3, 7],
      color1: c4("#6b6b70"), color2: c4("#3a3a40"), colorDead: c4("#3a3a40", 0), spread: 1, angular: 6,
    });
    const groundCol = c4(this.level.palette.ground, 0.85);
    this.dust = new Burst(scene, "dust", {
      tex: Tex.puff(scene), capacity: Math.round(120 * q) + 20, blend: STD, gravity: 0.4, life: [0.6, 1.3], size: [0.8, 1.8],
      power: [1.5, 4], color1: groundCol, color2: c4(this.level.palette.ground, 0.6), colorDead: c4(this.level.palette.ground, 0), spread: 1, sizeGrow: 2.4, drag: 0.15,
    });
    this.fireball = new Burst(scene, "fireball", {
      tex: Tex.flame(scene), capacity: Math.round(120 * q) + 30, blend: ADD, gravity: 3, life: [0.35, 0.8], size: [1.2, 2.8],
      power: [4, 11], color1: c4("#fff1a8"), color2: c4("#ff8a1f"), colorDead: c4("#c0261a", 0), spread: 1, sizeGrow: 1.8, drag: 0.4, angular: 2,
    }, 3);
    this.smokeBurst = new Burst(scene, "smokeBurst", {
      tex: Tex.puff(scene), capacity: Math.round(80 * q) + 20, blend: STD, gravity: 2.5, life: [1.5, 3], size: [1.8, 3.5], power: [1.5, 4],
      color1: c4("#3b3333", 0.85), color2: c4("#5a5050", 0.7), colorDead: c4("#6a6060", 0), spread: 1, sizeGrow: 2.5, drag: 0.3, angular: 0.6,
    }, 3);
    this.embers = new Burst(scene, "embers", {
      tex: Tex.dot(scene), capacity: 80, blend: ADD, gravity: -9, life: [0.8, 1.6], size: [0.1, 0.22], power: [8, 18],
      color1: c4("#ffd36b"), color2: c4("#ff7b2e"), colorDead: c4("#802010", 0), spread: 1,
    }, 3);
    this.confetti = new Burst(scene, "confetti", {
      tex: Tex.dot(scene), capacity: 60, blend: ADD, gravity: -6, life: [0.6, 1.1], size: [0.1, 0.2], power: [4, 8],
      color1: c4("#ffd166"), color2: c4("#6ee7ff"), colorDead: c4("#ff4f9a", 0), spread: 1,
    }, 2);

    // Continuous car emitters.
    const v = vehicle;
    this.exhaust = stream(scene, "exhaust", Tex.puff(scene), 60);
    this.exhaust.emitter = v.anchors.exhaust as unknown as Mesh;
    this.exhaust.isLocal = false;
    Object.assign(this.exhaust, { minLifeTime: 0.3, maxLifeTime: 0.6, minSize: 0.12, maxSize: 0.25, minEmitPower: 0.6, maxEmitPower: 1.4 });
    this.exhaust.direction1.set(-0.3, 0.3, -1);
    this.exhaust.direction2.set(0.3, 0.6, -1);
    this.exhaust.color1 = c4("#8a8580", 0.35);
    this.exhaust.color2 = c4("#6a6560", 0.25);
    this.exhaust.colorDead = c4("#a8a098", 0);
    this.exhaust.addSizeGradient(0, 0.12, 0.25).addSizeGradient(1, 0.4, 0.7);

    this.boostFlame = stream(scene, "boost", Tex.flame(scene), Math.round(160 * q) + 40);
    this.boostFlame.emitter = v.anchors.boost as unknown as Mesh;
    this.boostFlame.blendMode = ParticleSystem.BLENDMODE_ADD;
    Object.assign(this.boostFlame, { minLifeTime: 0.08, maxLifeTime: 0.2, minSize: 0.35, maxSize: 0.7, minEmitPower: 10, maxEmitPower: 16 });
    this.boostFlame.direction1.set(-0.12, -0.12, -1);
    this.boostFlame.direction2.set(0.12, 0.12, -1);
    this.boostFlame.color1 = c4("#fff6c8");
    this.boostFlame.color2 = c4("#6ee7ff");
    this.boostFlame.colorDead = c4("#ff6a1f", 0);
    this.boostFlame.addSizeGradient(0, 0.35, 0.7).addSizeGradient(1, 0.1, 0.2);

    this.damageSmoke = stream(scene, "dmgSmoke", Tex.puff(scene), 80);
    this.damageSmoke.emitter = v.anchors.smoke as unknown as Mesh;
    Object.assign(this.damageSmoke, { minLifeTime: 0.8, maxLifeTime: 1.6, minSize: 0.5, maxSize: 1.0, minEmitPower: 1, maxEmitPower: 2 });
    this.damageSmoke.direction1.set(-0.4, 1, -0.6);
    this.damageSmoke.direction2.set(0.4, 1.5, -0.2);
    this.damageSmoke.addSizeGradient(0, 0.5, 1.0).addSizeGradient(1, 1.6, 2.8);

    this.damageFire = stream(scene, "dmgFire", Tex.flame(scene), 60);
    this.damageFire.emitter = v.anchors.smoke as unknown as Mesh;
    this.damageFire.blendMode = ParticleSystem.BLENDMODE_ADD;
    Object.assign(this.damageFire, { minLifeTime: 0.2, maxLifeTime: 0.45, minSize: 0.3, maxSize: 0.7, minEmitPower: 1, maxEmitPower: 2.5 });
    this.damageFire.direction1.set(-0.3, 1, -0.3);
    this.damageFire.direction2.set(0.3, 1.6, 0.3);
    this.damageFire.color1 = c4("#fff1a8");
    this.damageFire.color2 = c4("#ff8a1f");
    this.damageFire.colorDead = c4("#c0261a", 0);

    for (let i = 0; i < 2; i++) {
      const ps = stream(scene, `wheelDust${i}`, Tex.puff(scene), Math.round(70 * q) + 10);
      ps.emitter = new Vector3();
      Object.assign(ps, { minLifeTime: 0.5, maxLifeTime: 1.1, minSize: 0.5, maxSize: 1.1, minEmitPower: 0.5, maxEmitPower: 2 });
      ps.direction1.set(-0.6, 0.4, -1);
      ps.direction2.set(0.6, 1, -0.4);
      ps.color1 = c4("#c9c4c0", 0.35);
      ps.color2 = c4("#a8a4a0", 0.25);
      ps.colorDead = c4("#a8a4a0", 0);
      ps.addSizeGradient(0, 0.5, 1.1).addSizeGradient(1, 1.4, 2.6);
      this.wheelDust.push(ps);
    }

    this.setupPost(camera);
    this.listen();
  }

  private goreColors(): [Color4, Color4] {
    if (this.gore === "green") return [Color4.FromHexString("#8fd13aff"), Color4.FromHexString("#3f7a1cff")];
    if (this.gore === "off") return [Color4.FromHexString("#d8c9a8ff"), Color4.FromHexString("#a89878ff")];
    return [Color4.FromHexString("#e8202eff"), Color4.FromHexString("#8c0f1fff")];
  }

  private goreDecalColor(): Color3 {
    return this.gore === "green" ? Color3.FromHexString("#5d9a22") : Color3.FromHexString("#b0121f");
  }

  private setupPost(camera: Camera): void {
    const settings = this.ctx.save.data.settings;
    const p = new DefaultRenderingPipeline("post", true, this.ctx.scene, [camera]);
    p.fxaaEnabled = true;
    p.bloomEnabled = settings.quality !== "low";
    p.bloomThreshold = this.level.night ? 0.55 : 0.82;
    p.bloomWeight = this.level.night ? 0.55 : 0.32;
    p.bloomKernel = 48;
    p.bloomScale = 0.5;
    p.imageProcessingEnabled = true;
    const ip = p.imageProcessing;
    ip.contrast = 1.18;
    ip.exposure = this.level.night ? 1.05 : 1.08;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.6;
    ip.vignetteColor = new Color4(0.1, 0.03, 0.08, 0);
    ip.toneMappingEnabled = false;
    p.chromaticAberrationEnabled = settings.quality !== "low";
    p.chromaticAberration.aberrationAmount = 0;
    this.pipeline = p;
  }

  private listen(): void {
    const ev = this.ctx.events;
    this.unsubs.push(
      ev.on("zombieHit", (e) => this.onZombieHit(e.position, e.force)),
      ev.on("limbSevered", (e) => {
        if (this.gore === "off") return;
        this.blood.emit(e.position, 26 * this.q + 6, e.direction.scale(1.2), 1.4);
        this.gibs.emit(e.position, 4, e.direction, 1);
        this.queueSplat(e.position, 1.6, 0.5);
      }),
      ev.on("carImpact", (e) => {
        const n = Math.min(40, e.force * 2.5) * this.q;
        this.sparks.emit(e.position, n, e.normal, Math.min(1.6, e.force / 10));
        this.chips.emit(e.position, n * 0.3, e.normal);
        this.dust.emit(e.position, 4, e.normal, 0.6, 0.4);
        if (e.force > 14) this.aberration = Math.min(1, this.aberration + e.force / 30);
      }),
      ev.on("carScrape", (e) => {
        if (this.scrapeCooldown > 0) return;
        this.scrapeCooldown = 0.05;
        this.tmp.copyFrom(e.velocity).scaleInPlace(-0.08);
        this.tmp.y += 0.6;
        this.sparks.emit(e.position, 6 * this.q + 2, this.tmp, 0.8);
      }),
      ev.on("explosion", (e) => this.onExplosion(e.position, e.radius, e.power)),
      ev.on("landed", (e) => {
        if (e.airTime < 0.35) return;
        const k = Math.min(1, e.airTime / 2);
        for (const w of this.vehicle.wheels) if (w.grounded) this.dust.emit(w.contact, (6 + 16 * k) * this.q, Vector3.UpReadOnly, 1 + k, 0.3);
      }),
      ev.on("stunt", () => {
        this.tmp.copyFrom(this.vehicle.position);
        this.tmp.y += 2;
        this.confetti.emit(this.tmp, 24 * this.q + 6, Vector3.UpReadOnly, 1);
      }),
      ev.on("weaponFired", (e) => {
        if (e.weapon === "gun") this.sparks.emit(e.position, 3, e.direction, 0.6);
      }),
    );
  }

  private onZombieHit(pos: Vector3, force: number): void {
    const k = Math.min(1.6, force / 14);
    const v = this.vehicle.velocity;
    this.tmp.copyFrom(v).normalize().scaleInPlace(0.9);
    this.tmp.y += 0.9;
    if (this.gore === "off") {
      this.dust.emit(pos, 6, this.tmp, 1, 0.3);
      return;
    }
    this.blood.emit(pos, (30 + 50 * k) * this.q + 8, this.tmp, 0.8 + k * 0.6, 0.25);
    this.bloodMist.emit(pos, 3 + 3 * k, this.tmp, 0.6, 0.2);
    if (force > 10) this.gibs.emit(pos, 3 + 4 * k, this.tmp, 0.8 + k * 0.4);
    // Ground splats where the gore lands: under the hit + thrown ahead along the car's path.
    this.queueSplat(pos, 1.8 + k * 1.2, 0.05);
    const ahead = Math.min(14, v.length() * 0.35);
    for (let i = 0; i < 1 + Math.round(k * 2 * this.q); i++) {
      this.tmp2.copyFrom(pos);
      this.tmp2.x += v.x * 0.03 * ahead + (Math.random() - 0.5) * 3;
      this.tmp2.z += v.z * 0.03 * ahead + Math.random() * ahead;
      this.queueSplat(this.tmp2.clone(), 0.8 + Math.random() * 1.2, 0.4 + Math.random() * 0.4);
    }
    // Splatter on the car (windshield/hood/bumper).
    if (this.carSplats < 26) {
      this.carSplats++;
      const d = this.vehicle.def.size;
      const local = new Vector3((Math.random() - 0.5) * d.width * 0.8, d.height / 2 + 0.02, d.length * (0.1 + Math.random() * 0.35));
      const s = this.decals.add(`car_${this.gore}`, Tex.splat(this.ctx.scene, this.carSplats % 3), this.goreDecalColor(), local, null, 0.5 + Math.random() * 0.6, 0.95, this.vehicle.chassis);
      s.position.copyFrom(local);
    }
  }

  private queueSplat(pos: Vector3, size: number, delay: number): void {
    if (this.gore === "off") return;
    this.pendingSplats.push({ pos: pos.clone(), size, at: Time.now + delay });
  }

  private placeGroundDecal(key: string, tex: Texture, color: Color3, pos: Vector3, size: number, alpha: number): void {
    if (!this.pe) return;
    this.tmp.set(pos.x, pos.y + 4, pos.z);
    this.down.set(pos.x, pos.y - 12, pos.z);
    this.pe.raycastToRef(this.tmp, this.down, this.ray, { membership: Layer.WORLD, collideWith: Layer.WORLD });
    if (!this.ray.hasHit) return;
    this.tmp.copyFrom(this.ray.hitPointWorld);
    this.tmp.y += 0.03;
    this.decals.add(key, tex, color, this.tmp, this.ray.hitNormalWorld, size, alpha);
  }

  private onExplosion(pos: Vector3, radius: number, power: number): void {
    const q = this.q;
    const k = Math.min(1.5, power) * (radius / 6);
    this.fireball.emit(pos, (40 + 40 * k) * q + 10, Vector3.UpReadOnly, k, 0.6);
    this.smokeBurst.emit(pos, (18 + 14 * k) * q + 6, Vector3.UpReadOnly, k, 0.8);
    this.embers.emit(pos, (24 + 20 * k) * q, Vector3.UpReadOnly, k);
    this.chips.emit(pos, 20 * q, Vector3.UpReadOnly, 1.6);
    // Flash light.
    const light = new PointLight("boomLight", pos.add(new Vector3(0, 1.5, 0)), this.ctx.scene);
    light.diffuse = Color3.FromHexString("#ffb05a");
    light.range = radius * 5;
    light.intensity = 6;
    this.flashes.push({ light, t: 0 });
    // Shockwave ring.
    const ring = MeshBuilder.CreateGround("shock", { width: 1, height: 1 }, this.ctx.scene);
    const mat = new StandardMaterial("shockMat", this.ctx.scene);
    mat.diffuseTexture = Tex.ring(this.ctx.scene);
    mat.diffuseTexture.hasAlpha = true;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = Color3.FromHexString("#ffe2a0");
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    ring.material = mat;
    ring.position.copyFrom(pos);
    ring.position.y += 0.4;
    ring.isPickable = false;
    this.rings.push({ mesh: ring, t: 0, max: radius * 2.6 });
    // Scorch.
    this.placeGroundDecal("scorch", Tex.scorch(this.ctx.scene), Color3.White(), pos, radius * 1.1, 0.9);
    this.aberration = 1;
    // Camera shake scaled by distance to the car.
    const d = Vector3.Distance(pos, this.vehicle.position);
    this.ctx.events.emit("shake", { intensity: Math.max(0, 0.7 * power * (1 - d / (radius * 6))) });
  }

  update(_dt: number): void {
    const dt = Time.realDt;
    const v = this.vehicle;
    this.scrapeCooldown -= dt;

    // Pending ground splats.
    if (this.pendingSplats.length) {
      const key = `gore_${this.gore}`;
      const col = this.goreDecalColor();
      for (let i = this.pendingSplats.length - 1; i >= 0; i--) {
        const s = this.pendingSplats[i];
        if (Time.now < s.at) continue;
        this.placeGroundDecal(key, Tex.splat(this.ctx.scene, i % 3), col, s.pos, s.size, 0.92);
        this.pendingSplats.splice(i, 1);
      }
    }
    this.decals.cullBehind(v.position.z - 90);

    // Particles follow game time (slow-mo slows them too).
    const speed = (1 / 60) * Time.scale;
    for (const b of [this.blood, this.bloodMist, this.gibs, this.sparks, this.chips, this.dust, this.fireball, this.smokeBurst, this.embers, this.confetti]) b.setSpeed(speed);

    // Exhaust & boost.
    const flat = Math.hypot(v.velocity.x, v.velocity.z);
    this.exhaust.emitRate = v.fuel > 0 && !v.wrecked ? 4 + v.throttle * 14 : 0;
    this.boostFlame.emitRate = v.boosting ? 260 * this.q + 60 : 0;

    // Damage smoke/fire.
    const dmg = v.damageLevel;
    this.damageSmoke.emitRate = dmg > 0.4 ? 8 + dmg * 30 : 0;
    const smokeCol = dmg > 0.7 ? "#2a2626" : "#e8e4de";
    const c = Color4.FromHexString(smokeCol + "cc");
    this.damageSmoke.color1 = c;
    this.damageSmoke.color2 = c;
    this.damageSmoke.colorDead = new Color4(c.r, c.g, c.b, 0);
    this.damageFire.emitRate = dmg > 0.85 || v.wrecked ? 40 : 0;

    // Wheel dust from the rear wheels.
    for (let i = 0; i < 2; i++) {
      const w = v.wheels[2 + i];
      const ps = this.wheelDust[i];
      if (w && w.grounded && flat > 4) {
        (ps.emitter as Vector3).copyFrom(w.contact);
        // Tire smoke only when the tire is actually sliding.
        ps.emitRate = w.slip > 0.3 ? (w.slip - 0.3) * 70 * this.q : 0;
      } else ps.emitRate = 0;
    }

    // Flashes & rings.
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      f.light.intensity = Math.max(0, 6 * (1 - f.t / 0.35));
      if (f.t > 0.35) {
        f.light.dispose();
        this.flashes.splice(i, 1);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const t = r.t / 0.45;
      const s = 1 + r.max * (1 - Math.pow(1 - Math.min(1, t), 3));
      r.mesh.scaling.set(s, 1, s);
      (r.mesh.material as StandardMaterial).alpha = Math.max(0, 1 - t);
      if (t >= 1) {
        r.mesh.material?.dispose();
        r.mesh.dispose();
        this.rings.splice(i, 1);
      }
    }

    // Post effects: slow-mo desaturation/vignette, impact aberration, boost.
    const p = this.pipeline;
    if (p) {
      const slow = Math.max(0, 1 - Time.scale);
      this.aberration = Math.max(0, this.aberration - dt * 2.5);
      p.chromaticAberration.aberrationAmount = this.aberration * 40 + (v.boosting ? 12 : 0) + slow * 20;
      p.imageProcessing.vignetteWeight = 1.6 + slow * 3;
      p.imageProcessing.colorCurvesEnabled = false;
      p.imageProcessing.contrast = 1.18 + slow * 0.25;
    }
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    for (const b of [this.blood, this.bloodMist, this.gibs, this.sparks, this.chips, this.dust, this.fireball, this.smokeBurst, this.embers, this.confetti]) b.dispose();
    for (const s of [this.exhaust, this.boostFlame, this.damageSmoke, this.damageFire, ...this.wheelDust]) s.dispose();
    for (const f of this.flashes) f.light.dispose();
    for (const r of this.rings) r.mesh.dispose();
    this.decals.dispose();
    this.pipeline?.dispose();
  }
}
