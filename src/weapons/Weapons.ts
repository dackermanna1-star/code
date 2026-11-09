/**
 * Roof weapons by loadout tier:
 *   1 Roof Gun · 2 Heavy Gun · 3 Flamethrower · 4 Heavy Gun + Flamethrower
 * Hold Space to fire. Guns auto-aim at the nearest zombie in a forward cone
 * (hitscan with visible tracers); the flamethrower sets everything in its
 * cone on fire.
 */
import {
  Color4,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  TransformNode,
  Vector3,
  type InstancedMesh,
} from "@babylonjs/core";
import { Time } from "../core/Time";
import { outline, toon } from "../fx/Materials";
import { Tex } from "../fx/Textures";
import type { GameContext, ISystem, ITarget, IVehicle, IZombies } from "../core/types";

interface Tracer {
  mesh: InstancedMesh;
  from: Vector3;
  to: Vector3;
  t: number;
}

const GUNS = {
  1: { rate: 7, ammo: 60, force: 7, scale: 1 },
  2: { rate: 11, ammo: 120, force: 11, scale: 1.3 },
} as const;

export class Weapons implements ISystem {
  ammo = 0;
  maxAmmo = 0;
  flameFuel = 0;
  maxFlameFuel = 0;
  weaponName = "None";
  private gun: (typeof GUNS)[1 | 2] | null = null;
  private hasFlamer = false;
  private turret: TransformNode | null = null;
  private head: TransformNode | null = null;
  private barrel: Mesh | null = null;
  private muzzle: TransformNode | null = null;
  private flash: Mesh | null = null;
  private nozzle: TransformNode | null = null;
  private flame: ParticleSystem | null = null;
  private tracerSrc: Mesh | null = null;
  private tracers: Tracer[] = [];
  private cooldown = 0;
  private recoil = 0;
  private flameTick = 0;
  private yaw = 0;
  private pitch = 0;
  private tmp = new Vector3();
  private dir = new Vector3();

  constructor(
    private ctx: GameContext,
    private vehicle: IVehicle,
    private zombies: IZombies,
  ) {
    const tier = vehicle.stats.weaponTier;
    if (tier <= 0) return;
    if (tier === 1 || tier === 2) this.gun = GUNS[tier];
    if (tier === 4) this.gun = GUNS[2];
    this.hasFlamer = tier >= 3;
    this.weaponName = ["None", "Roof Gun", "Heavy Gun", "Flamethrower", "Twin Flame + Gun"][tier];
    if (this.gun) this.ammo = this.maxAmmo = this.gun.ammo;
    if (this.hasFlamer) this.flameFuel = this.maxFlameFuel = 8;
    this.build();
  }

  private build(): void {
    const scene = this.ctx.scene;
    const metal = toon(scene, "#5a5f66");
    const dark = toon(scene, "#2a2c30");
    const turret = new TransformNode("turret", scene);
    turret.parent = this.vehicle.anchors.weapon;
    this.turret = turret;
    const base = MeshBuilder.CreateCylinder("turretBase", { diameter: 0.9, height: 0.18, tessellation: 10 }, scene);
    base.parent = turret;
    base.position.y = 0.09;
    base.material = dark;
    outline(base, 0.02);
    const head = new TransformNode("turretHead", scene);
    head.parent = turret;
    head.position.y = 0.3;
    this.head = head;
    const s = this.gun?.scale ?? 1;
    if (this.gun) {
      const body = MeshBuilder.CreateBox("gunBody", { width: 0.45 * s, height: 0.32 * s, depth: 0.7 * s }, scene);
      body.parent = head;
      body.material = metal;
      outline(body, 0.02);
      const shield = MeshBuilder.CreateBox("gunShield", { width: 0.8 * s, height: 0.45 * s, depth: 0.06 }, scene);
      shield.parent = head;
      shield.position.set(0, 0.05, 0.3 * s);
      shield.material = toon(scene, "#6b7a4f");
      outline(shield, 0.02);
      const barrel = MeshBuilder.CreateCylinder("gunBarrel", { diameter: 0.1 * s, height: 0.9 * s, tessellation: 8 }, scene);
      barrel.rotation.x = Math.PI / 2;
      barrel.bakeCurrentTransformIntoVertices();
      barrel.parent = head;
      barrel.position.set(0.12 * (this.hasFlamer ? 1 : 0), 0.04, 0.7 * s);
      barrel.material = dark;
      this.barrel = barrel;
      const muzzle = new TransformNode("muzzle", scene);
      muzzle.parent = barrel;
      muzzle.position.z = 0.48 * s;
      this.muzzle = muzzle;
      const flash = MeshBuilder.CreatePlane("muzzleFlash", { size: 0.6 * s }, scene);
      flash.parent = muzzle;
      flash.position.z = 0.15;
      flash.billboardMode = Mesh.BILLBOARDMODE_ALL;
      const fm = toon(scene, "#ffd36b", { unlit: true });
      flash.material = fm;
      flash.isVisible = false;
      this.flash = flash;
      // tracer source (a thin glowing box stretched along Z)
      this.tracerSrc = MeshBuilder.CreateBox("tracerSrc", { width: 0.06, height: 0.06, depth: 1 }, scene);
      this.tracerSrc.material = toon(scene, "#fff2a0", { unlit: true });
      this.tracerSrc.position.y = -999;
      this.tracerSrc.isPickable = false;
    }
    if (this.hasFlamer) {
      const tank = MeshBuilder.CreateCylinder("flameTank", { diameter: 0.32, height: 0.6, tessellation: 10 }, scene);
      tank.rotation.x = Math.PI / 2;
      tank.parent = head;
      tank.position.set(this.gun ? -0.3 : 0, 0.05, -0.05);
      tank.material = toon(scene, "#c0392b");
      outline(tank, 0.02);
      const pipe = MeshBuilder.CreateCylinder("flamePipe", { diameter: 0.12, height: 0.8, tessellation: 8 }, scene);
      pipe.rotation.x = Math.PI / 2;
      pipe.parent = head;
      pipe.position.set(this.gun ? -0.3 : 0, 0.05, 0.6);
      pipe.material = dark;
      const nozzle = new TransformNode("nozzle", scene);
      nozzle.parent = pipe;
      nozzle.position.y = 0.45; // pipe local Y = forward after rotation
      this.nozzle = nozzle;
      const pilot = MeshBuilder.CreateSphere("pilot", { diameter: 0.12, segments: 4 }, scene);
      pilot.parent = nozzle;
      pilot.material = toon(scene, "#6ee7ff", { emissive: 1.2 });
      const ps = new ParticleSystem("flamer", 500, scene);
      ps.particleTexture = Tex.flame(scene);
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.emitter = nozzle as unknown as Mesh;
      ps.minEmitBox.setAll(0);
      ps.maxEmitBox.setAll(0);
      ps.minLifeTime = 0.25;
      ps.maxLifeTime = 0.45;
      ps.minEmitPower = 18;
      ps.maxEmitPower = 26;
      ps.addSizeGradient(0, 0.25, 0.4).addSizeGradient(1, 1.4, 2.4);
      ps.color1 = Color4.FromHexString("#fff6c8ff");
      ps.color2 = Color4.FromHexString("#ffae3bff");
      ps.colorDead = Color4.FromHexString("#c0261a00");
      ps.addDragGradient(0, 0.3);
      ps.gravity.set(0, 2, 0);
      ps.emitRate = 0;
      ps.minAngularSpeed = -3;
      ps.maxAngularSpeed = 3;
      ps.updateSpeed = 1 / 60;
      ps.start();
      this.flame = ps;
    }
  }

  /** Muzzle-forward world direction from the turret head. */
  private aimDir(out: Vector3): Vector3 {
    this.head!.computeWorldMatrix(true);
    return Vector3.TransformNormalToRef(Vector3.Forward(), this.head!.getWorldMatrix(), out).normalize();
  }

  private pickTarget(from: Vector3, range: number, cos: number): ITarget | null {
    const fwd = this.vehicle.forward;
    for (const t of this.zombies.targetsNear(from, range)) {
      this.tmp.copyFrom(t.position).subtractInPlace(from).normalize();
      if (Vector3.Dot(this.tmp, fwd) > cos) return t;
    }
    return null;
  }

  update(_dt: number): void {
    if (!this.head) return;
    const dt = Time.dt;
    const input = this.ctx.input.state;
    const v = this.vehicle;
    const firing = input.fire && !v.wrecked;
    this.head.computeWorldMatrix(true);
    const origin = this.head.getAbsolutePosition();

    // Aim: track the nearest zombie in a forward cone, else look forward.
    const target = this.gun ? this.pickTarget(origin, 45, Math.cos((70 * Math.PI) / 180)) : null;
    let wantYaw = 0;
    let wantPitch = 0;
    if (target) {
      // Convert target into the turret's parent (anchor) space.
      const anchor = this.turret!;
      anchor.computeWorldMatrix(true);
      const inv = anchor.getWorldMatrix().clone().invert();
      const local = Vector3.TransformCoordinates(target.position, inv);
      wantYaw = Math.atan2(local.x, local.z);
      wantPitch = -Math.atan2(local.y - 0.3, Math.hypot(local.x, local.z));
    }
    this.yaw += (wantYaw - this.yaw) * Math.min(1, dt * 12);
    this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * 12);
    this.head.rotation.set(Math.max(-0.5, Math.min(0.35, this.pitch)), this.yaw, 0);

    // Guns.
    this.cooldown -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 10);
    if (this.barrel) this.barrel.position.z = 0.7 * (this.gun?.scale ?? 1) - this.recoil * 0.15;
    if (this.flash) this.flash.isVisible = this.recoil > 0.6;
    if (this.gun && firing && this.ammo > 0 && this.cooldown <= 0) {
      this.cooldown = 1 / this.gun.rate;
      this.ammo--;
      this.recoil = 1;
      this.fireGun(target);
    }

    // Flamethrower.
    if (this.flame) {
      const on = this.hasFlamer && firing && this.flameFuel > 0;
      this.flame.emitRate = on ? 260 : 0;
      this.flame.updateSpeed = (1 / 60) * Time.scale;
      if (on) {
        this.flameFuel = Math.max(0, this.flameFuel - dt);
        this.aimDir(this.dir);
        this.flame.direction1.set(this.dir.x - 0.12, this.dir.y - 0.05, this.dir.z - 0.12);
        this.flame.direction2.set(this.dir.x + 0.12, this.dir.y + 0.15, this.dir.z + 0.12);
        // Moving car: flame inherits velocity so it doesn't trail behind.
        this.flame.direction1.addInPlace(v.velocity.scale(1 / 22));
        this.flame.direction2.addInPlace(v.velocity.scale(1 / 22));
        this.flameTick -= dt;
        if (this.flameTick <= 0) {
          this.flameTick = 0.12;
          const nozzle = this.nozzle!.getAbsolutePosition();
          for (const t of this.zombies.targetsNear(nozzle, 12)) {
            this.tmp.copyFrom(t.position).subtractInPlace(nozzle).normalize();
            if (Vector3.Dot(this.tmp, this.dir) > 0.82) t.hit(2, this.tmp, "fire");
          }
          this.ctx.events.emit("weaponFired", { position: nozzle.clone(), direction: this.dir.clone(), weapon: "flamer" });
        }
      }
    }

    // Tracers fly out and vanish.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.t += Time.realDt / 0.08;
      if (tr.t >= 1) {
        tr.mesh.dispose();
        this.tracers.splice(i, 1);
        continue;
      }
      Vector3.LerpToRef(tr.from, tr.to, Math.min(1, tr.t + 0.25), this.tmp);
      tr.mesh.position.copyFrom(this.tmp);
    }
  }

  private fireGun(target: ITarget | null): void {
    const from = this.muzzle!.getAbsolutePosition().clone();
    const dir = this.aimDir(new Vector3());
    let to: Vector3;
    if (target && target.alive) {
      to = target.position.clone();
      to.x += (Math.random() - 0.5) * 0.3;
      to.y += (Math.random() - 0.5) * 0.3;
      const hitDir = to.subtract(from).normalize();
      target.hit(this.gun!.force, hitDir, "bullet");
    } else {
      to = from.add(dir.scale(45));
    }
    const len = Vector3.Distance(from, to);
    const m = this.tracerSrc!.createInstance("tracer");
    m.isPickable = false;
    m.scaling.set(1, 1, Math.min(6, len * 0.4));
    m.lookAt(to);
    m.position.copyFrom(from);
    this.tracers.push({ mesh: m, from, to, t: 0 });
    this.ctx.events.emit("weaponFired", { position: from, direction: dir, weapon: "gun" });
  }

  dispose(): void {
    for (const t of this.tracers) t.mesh.dispose();
    this.flame?.dispose();
    this.tracerSrc?.dispose();
    this.turret?.dispose();
  }
}
