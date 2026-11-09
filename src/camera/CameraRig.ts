/**
 * Chase camera with:
 *  - smooth follow behind the car along a stabilized heading (doesn't spin when the car flips)
 *  - speed-based FOV and pull-back, extra kick while boosting
 *  - cinematic side swing during long jumps
 *  - trauma-based shake (from `shake` events), slow-mo punch-in
 *  - ground avoidance and a slow orbit once the run is over
 */
import { PhysicsRaycastResult, UniversalCamera, Vector3, type PhysicsEngineV2 } from "@babylonjs/core";
import { Time } from "../core/Time";
import { Layer } from "../physics/Layers";
import type { GameContext, ISystem, IVehicle } from "../core/types";

const BASE_FOV = 0.95;

export class CameraRig implements ISystem {
  readonly camera: UniversalCamera;
  private heading = new Vector3(0, 0, 1);
  private pos = new Vector3();
  private look = new Vector3();
  private side = 0; // 0 = chase, 1 = side cam
  private sideSign = 1;
  private airTime = 0;
  private trauma = 0;
  private orbit = 0;
  private stopped = 0;
  private unsub: () => void;
  private ray = new PhysicsRaycastResult();
  // scratch
  private tmp = new Vector3();
  private desired = new Vector3();
  private sideOffset = new Vector3();

  constructor(private ctx: GameContext, private vehicle: IVehicle) {
    this.camera = new UniversalCamera("chaseCam", Vector3.Zero(), ctx.scene);
    this.camera.minZ = 0.1;
    this.camera.maxZ = 1500;
    this.camera.fov = BASE_FOV;
    this.camera.inputs.clear();
    ctx.scene.activeCamera = this.camera;
    this.heading.copyFrom(vehicle.forward);
    this.heading.y = 0;
    this.heading.normalize();
    this.computeChase(this.pos, 0);
    this.look.copyFrom(vehicle.position);
    this.camera.position.copyFrom(this.pos);
    this.camera.setTarget(this.look);
    this.unsub = ctx.events.on("shake", (e) => {
      if (ctx.save.data.settings.cameraShake) this.trauma = Math.min(1, this.trauma + e.intensity);
    });
  }

  /** Desired chase position for current speed into `out`. */
  private computeChase(out: Vector3, speed: number): void {
    const v = this.vehicle;
    const size = v.def.size;
    const k = Math.min(1, speed / 35);
    const back = size.length * 1.1 + 5 + k * 4;
    const up = size.height * 1.4 + 2.2 + k * 1.2;
    out.copyFrom(v.position);
    out.addInPlace(this.heading.scale(-back));
    out.y += up;
  }

  update(_dt: number): void {
    const dt = Time.realDt; // camera moves in real time so slow-mo feels cinematic
    const v = this.vehicle;
    const vel = v.velocity;
    const flat = Math.hypot(vel.x, vel.z);

    // Stabilized heading: follow horizontal velocity when moving, else the car's forward.
    this.tmp.set(vel.x, 0, vel.z);
    if (flat < 3 || vel.z < -1) {
      this.tmp.set(v.forward.x, 0, v.forward.z);
    }
    if (this.tmp.lengthSquared() > 1e-4) {
      this.tmp.normalize();
      // Bias toward +Z (the road direction) so tumbles never swing the camera around.
      this.tmp.z += 0.6;
      this.tmp.normalize();
      const rate = v.airborne ? 1.2 : 4;
      Vector3.LerpToRef(this.heading, this.tmp, Math.min(1, dt * rate), this.heading);
      this.heading.normalize();
    }

    // Side cam during long jumps.
    if (v.airborne) this.airTime += dt;
    else this.airTime = 0;
    const wantSide = this.airTime > 0.6 && flat > 8 ? 1 : 0;
    if (wantSide && this.side < 0.05) this.sideSign = v.position.x > 0 ? -1 : 1;
    this.side += (wantSide - this.side) * Math.min(1, dt * (wantSide ? 2.2 : 3));

    // Run over? slow orbit.
    const over = v.wrecked || (v.fuel <= 0 && flat < 1.5);
    this.stopped = over ? Math.min(1, this.stopped + dt * 0.5) : Math.max(0, this.stopped - dt);
    if (this.stopped > 0) this.orbit += dt * 0.35;

    this.computeChase(this.desired, flat);
    if (this.side > 0.001) {
      this.sideOffset.copyFrom(v.position);
      this.sideOffset.x += this.sideSign * (10 + v.def.size.length * 0.4);
      this.sideOffset.y += 2.5;
      this.sideOffset.z -= 3;
      Vector3.LerpToRef(this.desired, this.sideOffset, this.side, this.desired);
    }
    if (this.stopped > 0) {
      const r = v.def.size.length + 7;
      this.sideOffset.set(v.position.x + Math.sin(this.orbit) * r, v.position.y + 3.5, v.position.z - Math.cos(this.orbit) * r);
      Vector3.LerpToRef(this.desired, this.sideOffset, this.stopped, this.desired);
    }

    // Critically-damped-ish follow; tighter at high speed so the car stays framed.
    const follow = 1 - Math.exp(-dt * (6 + flat * 0.12));
    Vector3.LerpToRef(this.pos, this.desired, follow, this.pos);

    // Keep the camera above the ground.
    const pe = this.ctx.scene.getPhysicsEngine() as PhysicsEngineV2 | null;
    if (pe) {
      this.tmp.set(this.pos.x, this.pos.y + 20, this.pos.z);
      this.desired.set(this.pos.x, this.pos.y - 30, this.pos.z);
      pe.raycastToRef(this.tmp, this.desired, this.ray, { membership: Layer.WORLD, collideWith: Layer.WORLD });
      if (this.ray.hasHit && this.pos.y < this.ray.hitPointWorld.y + 1.2) this.pos.y = this.ray.hitPointWorld.y + 1.2;
    }

    // Look slightly ahead of the car.
    this.tmp.copyFrom(v.position);
    this.tmp.addInPlace(this.heading.scale((6 + Math.min(flat, 40) * 0.25) * (1 - this.side) * (1 - this.stopped)));
    this.tmp.y += 1;
    Vector3.LerpToRef(this.look, this.tmp, 1 - Math.exp(-dt * 10), this.look);

    // Shake.
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    const t = Time.realNow * 25;
    this.camera.position.set(
      this.pos.x + s * 0.6 * (Math.sin(t * 1.3) + Math.sin(t * 2.7) * 0.5),
      this.pos.y + s * 0.5 * (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.1) * 0.5),
      this.pos.z + s * 0.4 * Math.sin(t * 2.1 + 2),
    );
    this.camera.setTarget(this.look);
    this.camera.rotation.z += s * 0.06 * Math.sin(t * 1.1);

    // FOV: speed + boost, punch-in during slow motion.
    let fov = BASE_FOV + Math.min(flat / 45, 1) * 0.22 + (v.boosting ? 0.1 : 0);
    if (Time.scale < 0.8) fov -= (0.8 - Time.scale) * 0.3;
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
  }

  dispose(): void {
    this.unsub();
    this.camera.dispose();
  }
}
