/**
 * First-person surface explorer (no suit, no survival – by design).
 *
 * Locomotion follows local physics: gravity g = GM/r² (+ centrifugal term),
 * a fixed human take-off speed (≈ 3.2 m/s) so jump height ∝ 1/g, traction
 * limited by friction μ·g (low-gravity worlds feel floaty and slippery,
 * super-Earths heavy), slopes steeper than ~42° make you slide, and liquids
 * (whatever they are made of) are swum at the surface.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Body } from '../astro/body';
import type { World } from './world';
import type { Input } from './input';

const EYE = 1.68;
const _v = new Vector3(), _v2 = new Vector3(), _q = new Quaternion();

export class Walker {
  body: Body | null = null;
  /** feet position, body-fixed frame (m) */
  readonly pos = new Vector3();
  /** velocity, body-fixed frame (m/s) */
  readonly vel = new Vector3();
  heading = 0; // radians around local up
  pitch = 0;
  onGround = false;
  swimming = false;
  liquid = '';
  bob = 0;
  gravity = 9.81;
  slope = 0;
  stepDist = 0;
  onStep: (() => void) | null = null;
  /** local tangent frame (east/north) kept continuous as you walk */
  private north = new Vector3(0, 0, 1);

  placeAt(body: Body, posBody: Vector3, faceDir?: Vector3) {
    this.body = body;
    this.pos.copy(posBody);
    this.vel.set(0, 0, 0);
    const up = _v.copy(posBody).normalize();
    this.north.set(0, 1, 0).addScaledVector(up, -up.y);
    if (this.north.lengthSq() < 1e-6) this.north.set(1, 0, 0).addScaledVector(up, -up.x);
    this.north.normalize();
    this.heading = 0;
    if (faceDir) {
      const f = faceDir.clone().addScaledVector(up, -faceDir.dot(up)).normalize();
      const east = new Vector3().crossVectors(this.north, up);
      this.heading = Math.atan2(f.dot(east), f.dot(this.north));
    }
    this.pitch = 0;
  }

  /** forward and right vectors on the tangent plane (body-fixed). */
  private basis(up: Vector3, fwd: Vector3, right: Vector3) {
    // re-orthogonalise the north reference against the current up (parallel transport)
    this.north.addScaledVector(up, -this.north.dot(up));
    if (this.north.lengthSq() < 1e-8) this.north.set(1, 0, 0).addScaledVector(up, -up.x);
    this.north.normalize();
    const east = _v2.crossVectors(this.north, up);
    fwd.copy(this.north).multiplyScalar(Math.cos(this.heading)).addScaledVector(east, Math.sin(this.heading));
    right.crossVectors(fwd, up).normalize();
  }

  update(dt: number, world: World, input: Input) {
    const b = this.body;
    if (!b) return;
    const look = input.look();
    this.heading -= look.yaw;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + look.pitch));
    const r = this.pos.length();
    const up = new Vector3().copy(this.pos).divideScalar(r);
    // gravity (+ centrifugal in the rotating frame)
    const period = b.rotation.period;
    const omega = isFinite(period) && period !== 0 ? (2 * Math.PI) / period : 0;
    const axisDist = Math.sqrt(this.pos.x * this.pos.x + this.pos.z * this.pos.z);
    const g = b.mu / (r * r) - omega * omega * axisDist * Math.sqrt(1 - up.y * up.y);
    this.gravity = g;
    // ground & liquid
    const info = world.groundInfo(b, up, 0.15);
    const ground = info.ground;
    const liquidTop = info.liquid;
    const fwd = new Vector3(), right = new Vector3();
    this.basis(up, fwd, right);
    const ix = input.axis('right', 'left') + input.gamepadAxes[0];
    const iz = input.axis('forward', 'back') - input.gamepadAxes[1];
    const running = input.held('run');
    const inLiquid = liquidTop > ground && r < liquidTop + 0.2;
    this.swimming = inLiquid;
    this.liquid = inLiquid ? (b.planet?.liquid ?? 'liquid') : '';
    const vUp = this.vel.dot(up);
    const vTan = this.vel.clone().addScaledVector(up, -vUp);

    if (inLiquid) {
      // swim at the surface: buoyancy pins you near the top, slow propulsion
      const want = fwd.clone().multiplyScalar(iz * 1.3).addScaledVector(right, ix * 1.0);
      vTan.lerp(want, 1 - Math.exp(-dt * 2));
      const targetR = liquidTop - 0.25;
      const vy = (targetR - r) * 2;
      this.vel.copy(vTan).addScaledVector(up, vy);
      this.onGround = false;
    } else {
      // walking: friction-limited acceleration toward the target velocity
      const speed = running ? 5.2 : 1.7;
      const want = fwd.clone().multiplyScalar(iz).addScaledVector(right, ix);
      if (want.lengthSq() > 1) want.normalize();
      want.multiplyScalar(speed);
      if (this.onGround) {
        const maxAcc = Math.min(0.85 * Math.max(g, 0), 12);
        const dv = want.sub(vTan);
        const dvl = dv.length();
        if (dvl > maxAcc * dt) dv.multiplyScalar((maxAcc * dt) / dvl);
        vTan.add(dv);
        this.vel.copy(vTan).addScaledVector(up, vUp);
        if (input.pressed('jump')) this.vel.addScaledVector(up, 3.2);
      } else {
        // little air control
        const dv = want.sub(vTan).multiplyScalar(Math.min(1, dt * 0.4));
        this.vel.add(dv);
      }
      this.vel.addScaledVector(up, -g * dt);
      // thin-air drag ∝ density (negligible on airless worlds)
      const atm = b.planet?.atmosphere;
      if (atm && atm.pressure > 0) this.vel.multiplyScalar(1 - Math.min(0.5, 0.002 * Math.min(atm.pressure, 50) * dt));
    }
    // integrate & collide
    this.pos.addScaledVector(this.vel, dt);
    const r2 = this.pos.length();
    const up2 = _v.copy(this.pos).divideScalar(r2);
    const g2 = world.groundInfo(b, up2, 0.15).ground;
    if (r2 <= g2 + 0.01 && !inLiquid) {
      this.pos.copy(up2).multiplyScalar(g2);
      const vn = this.vel.dot(up2);
      if (vn < 0) this.vel.addScaledVector(up2, -vn);
      this.onGround = true;
      // slope: sample a little around to estimate the ground normal
      const e = 0.6;
      const t1 = fwd.clone(), t2 = right.clone();
      const hF = world.groundInfo(b, up2.clone().multiplyScalar(r2).addScaledVector(t1, e).normalize(), 0.15).ground - g2;
      const hR = world.groundInfo(b, up2.clone().multiplyScalar(r2).addScaledVector(t2, e).normalize(), 0.15).ground - g2;
      const n = up2.clone().multiplyScalar(e).addScaledVector(t1, -hF).addScaledVector(t2, -hR).normalize();
      this.slope = Math.acos(Math.min(1, n.dot(up2)));
      if (this.slope > 0.73) {
        // too steep: slide downhill
        const downhill = n.clone().addScaledVector(up2, -n.dot(up2));
        this.vel.addScaledVector(downhill, g * dt * Math.sin(this.slope));
      }
    } else if (!inLiquid) {
      this.onGround = r2 < g2 + 0.05;
    }
    // footsteps
    const hs = this.vel.clone().addScaledVector(up2, -this.vel.dot(up2)).length();
    if (this.onGround && hs > 0.3) {
      this.stepDist += hs * dt;
      const stride = running ? 1.6 : 0.75;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        this.onStep?.();
      }
      this.bob += hs * dt * 2.2;
    }
  }

  /** Eye position (body-fixed) and view orientation (body-fixed). */
  eye(outPos: Vector3, outQ: Quaternion) {
    const up = _v.copy(this.pos).normalize();
    const bobH = Math.sin(this.bob * Math.PI) * 0.03;
    outPos.copy(this.pos).addScaledVector(up, (this.swimming ? 0.3 : EYE) + bobH);
    const fwd = new Vector3(), right = new Vector3();
    this.basis(up, fwd, right);
    const look = fwd.clone().multiplyScalar(Math.cos(this.pitch)).addScaledVector(up, Math.sin(this.pitch));
    const m = new Matrix4().lookAt(new Vector3(), look, up);
    outQ.setFromRotationMatrix(m);
    void _q;
  }
}
