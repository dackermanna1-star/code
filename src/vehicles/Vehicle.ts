// STUB — to be replaced by the Vehicle builder. Keep the public API.
import { MeshBuilder, PhysicsAggregate, PhysicsShapeType, Quaternion, Vector3, type AbstractMesh, type TransformNode } from "@babylonjs/core";
import type { CarDef } from "../data/cars";
import type { CarStats, Loadout } from "../data/parts";
import { TransformNode as TN } from "@babylonjs/core";
import type { GameContext, IVehicle, VehicleAnchors, WheelState } from "../core/types";
import { buildCarModel, type CarModel } from "./CarModel";

export class Vehicle implements IVehicle {
  readonly chassis: AbstractMesh;
  readonly model: CarModel;
  fuel: number;
  boost: number;
  health: number;
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  readonly forward = new Vector3(0, 0, 1);
  readonly up = new Vector3(0, 1, 0);
  forwardSpeed = 0;
  airborne = false;
  wrecked = false;
  damageLevel = 0;
  private agg: PhysicsAggregate;
  readonly anchors: VehicleAnchors;
  readonly wheels: WheelState[] = [];
  throttle = 0;
  boosting = false;
  rpm = 0;

  constructor(private ctx: GameContext, readonly def: CarDef, loadout: Loadout, readonly stats: CarStats, spawn: { position: Vector3; yaw: number }) {
    const s = ctx.scene;
    this.chassis = MeshBuilder.CreateBox("chassis", { width: def.size.width, height: def.size.height, depth: def.size.length }, s);
    this.chassis.isVisible = false;
    this.chassis.position.copyFrom(spawn.position);
    this.chassis.rotationQuaternion = Quaternion.FromEulerAngles(0, spawn.yaw, 0);
    this.agg = new PhysicsAggregate(this.chassis, PhysicsShapeType.BOX, { mass: def.mass, friction: 0.3 }, s);
    this.model = buildCarModel(s, def, loadout);
    this.model.root.parent = this.chassis;
    const mk = (n: string) => { const t = new TN(n, s); t.parent = this.chassis; return t; };
    this.anchors = { smoke: mk("smoke"), boost: mk("boost"), weapon: mk("weapon"), exhaust: mk("exhaust"), wheels: this.model.wheels };
    for (let i = 0; i < 4; i++) this.wheels.push({ grounded: true, contact: new Vector3(), slip: 0, compression: 0 });
    this.fuel = stats.fuel;
    this.boost = stats.boostCapacity;
    this.health = stats.health;
  }
  update(dt: number): void {
    const b = this.agg.body;
    this.position.copyFrom(this.chassis.position);
    b.getLinearVelocityToRef(this.velocity);
    this.forwardSpeed = this.velocity.z;
    const inp = this.ctx.input.state;
    if (this.fuel > 0 && inp.throttle > 0) {
      b.applyForce(new Vector3(0, 0, this.stats.enginePower * inp.throttle), this.position);
      this.fuel -= this.stats.fuelPerSecond * dt;
    }
  }
  damage(amount: number): void { this.health -= amount; if (this.health <= 0) this.wrecked = true; }
  applyDrag(fraction: number): void { this.agg.body.setLinearVelocity(this.velocity.scale(1 - fraction)); }
  applyImpulse(impulse: Vector3, at: Vector3): void { this.agg.body.applyImpulse(impulse, at); }
  attach(node: TransformNode): void { node.parent = this.chassis; }
  dispose(): void { this.model.dispose(); this.agg.dispose(); this.chassis.dispose(); }
}
