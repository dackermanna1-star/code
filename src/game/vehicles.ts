// Vehicle entries (sim + view + audio voices) and the AI driver.

import * as THREE from 'three';
import { Vehicle } from '../sim/vehicle/vehicle.ts';
import type { VehicleDef } from '../sim/vehicle/defs.ts';
import { VehicleView } from '../render/vehicleView.ts';
import type { EngineVoice, VehicleNoise } from '../audio/audio.ts';
import { clamp } from '../sim/math.ts';

export type Role = 'player' | 'ai' | 'parked';

export class VehicleEntry {
  readonly vehicle: Vehicle;
  readonly view: VehicleView;
  role: Role;
  engineVoice: EngineVoice | null = null;
  noiseVoice: VehicleNoise | null = null;
  ai: AIDriver | null = null;
  color: number;
  /** cooldowns for effects */
  lastCrashSound = 0;
  lastCrunch = 0;
  smokeTimer = 0;
  fire = 0;
  readonly id: number;

  constructor(vehicle: Vehicle, view: VehicleView, role: Role, color: number) {
    this.vehicle = vehicle;
    this.view = view;
    this.role = role;
    this.color = color;
    this.id = vehicle.id;
  }

  get def(): VehicleDef {
    return this.vehicle.def;
  }
}

/** Simple ram-the-target AI for demolition derbies. */
export class AIDriver {
  target: VehicleEntry | null = null;
  private stuckTimer = 0;
  private reverseTimer = 0;
  private retarget = 0;
  aggression = 1;
  readonly home: THREE.Vector3;
  readonly radius: number;

  constructor(home: THREE.Vector3, radius: number) {
    this.home = home;
    this.radius = radius;
  }

  update(dt: number, self: VehicleEntry, all: VehicleEntry[]): void {
    const v = self.vehicle;
    const inp = v.input;
    this.retarget -= dt;
    if (this.retarget <= 0 || !this.target || !all.includes(this.target)) {
      this.retarget = 3 + Math.random() * 3;
      let best: VehicleEntry | null = null, bd = Infinity;
      for (const e of all) {
        if (e === self) continue;
        const d = Math.hypot(e.vehicle.position[0] - v.position[0], e.vehicle.position[2] - v.position[2]) * (e.role === 'player' ? 0.5 : 1);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      this.target = best;
    }
    if (!v.drivetrain.running || v.damage.engine > 0.95) {
      inp.throttle = 0;
      inp.brake = 0.3;
      inp.steer = 0;
      return;
    }
    let tx = this.home.x, tz = this.home.z;
    if (this.target) {
      const t = this.target.vehicle;
      // lead the target a little
      tx = t.position[0] + t.velocity[0] * 0.4;
      tz = t.position[2] + t.velocity[2] * 0.4;
    }
    // stay inside the arena
    const hx = v.position[0] - this.home.x, hz = v.position[2] - this.home.z;
    if (Math.hypot(hx, hz) > this.radius) {
      tx = this.home.x;
      tz = this.home.z;
    }
    const fx = v.forward[0], fz = v.forward[2];
    const dx = tx - v.position[0], dz = tz - v.position[2];
    // angle from forward to target (positive = target to the left)
    const cross = fz * dx - fx * dz;
    const dotp = fx * dx + fz * dz;
    const ang = Math.atan2(cross, dotp);
    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      inp.throttle = 0;
      inp.brake = 1;
      inp.steer = -Math.sign(ang);
      return;
    }
    inp.steer = clamp(ang * 2, -1, 1);
    const sp = Math.abs(v.speed);
    inp.throttle = Math.abs(ang) > 1.2 ? 0.55 : 0.85 * this.aggression + 0.15;
    inp.brake = 0;
    inp.handbrake = Math.abs(ang) > 1.6 && sp > 8 ? 1 : 0;
    if (sp < 1.0) this.stuckTimer += dt;
    else this.stuckTimer = 0;
    if (this.stuckTimer > 2.0) {
      this.stuckTimer = 0;
      this.reverseTimer = 1.4;
    }
  }
}
