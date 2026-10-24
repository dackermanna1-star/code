// First-person tool models: small voxel models (2 cm voxels) rendered through the normal pipeline,
// positioned relative to the camera with swing / recoil / throw / walk-bob animations.

import { Grid, Builder } from '../map/builder';
import { Body } from '../physics/body';
import { P } from '../world/materials';
import { Quat, Vec3 } from '../engine/math';
import { Tool } from './tools';
import { Camera } from '../engine/camera';

function model(t: Tool): Grid {
  switch (t) {
    case Tool.Hammer: {
      const g = new Grid(8, 6, 38), b = new Builder(g);
      b.box(3, 2, 0, 5, 4, 32, (x, y, z) => (z < 8 ? P.rubber : P.woodDark + ((z >> 2) & 1)));
      b.box(1, 0, 31, 7, 6, 38, P.steelDark);
      b.box(0, 1, 32, 8, 5, 37, P.steel);
      return g;
    }
    case Tool.Shotgun: {
      const g = new Grid(8, 10, 46), b = new Builder(g);
      b.box(3, 6, 10, 5, 8, 46, P.paintBlack);             // barrel
      b.box(3, 4, 18, 5, 6, 40, P.steelDark);             // magazine tube
      b.box(2, 3, 26, 6, 6, 36, P.woodDark);              // pump
      b.box(2, 4, 8, 6, 9, 20, P.steelDark);              // receiver
      b.box(3, 0, 0, 5, 7, 10, P.woodDark);               // stock
      b.box(3, 2, 10, 5, 5, 13, P.paintBlack);            // grip
      return g;
    }
    case Tool.Rifle: {
      const g = new Grid(8, 12, 52), b = new Builder(g);
      b.box(3, 6, 12, 5, 8, 52, P.paintBlack);
      b.box(2, 4, 8, 6, 9, 26, P.paintGreyBlue);
      b.box(3, 9, 12, 5, 12, 26, P.paintBlack);           // scope
      b.box(3, 10, 11, 5, 11, 12, P.glassDark);
      b.box(3, 0, 0, 5, 7, 9, P.paintGreyBlue);
      b.box(3, 1, 14, 5, 4, 18, P.steelDark);             // magazine
      return g;
    }
    case Tool.PipeBomb: {
      const g = new Grid(6, 6, 18), b = new Builder(g);
      b.box(1, 1, 1, 5, 5, 17, P.steelDark);
      b.box(0, 0, 0, 6, 6, 2, P.paintBlack); b.box(0, 0, 16, 6, 6, 18, P.paintBlack);
      b.box(2, 5, 6, 3, 6, 12, P.paintRed); b.box(3, 5, 8, 4, 6, 14, P.paintYellow);
      return g;
    }
    case Tool.Bomb: {
      const g = new Grid(12, 12, 12), b = new Builder(g);
      b.box(0, 0, 0, 12, 12, 12, P.tnt);
      b.box(0, 3, 0, 12, 5, 12, P.paintBlack); b.box(0, 8, 0, 12, 10, 12, P.paintBlack);
      b.box(3, 12, 3, 9, 12, 6, P.lampRed);
      b.box(4, 12, 4, 8, 12, 5, P.screen);
      return g;
    }
    case Tool.Rocket: {
      const g = new Grid(12, 14, 52), b = new Builder(g);
      b.cylZ(6, 9, 4.5, 0, 52, (x, y, z) => (z < 3 || z > 49 ? P.paintBlack : P.paintDarkGreen), 1.2);
      b.box(5, 0, 18, 7, 6, 22, P.paintBlack);   // grip
      b.box(5, 2, 28, 7, 6, 31, P.paintBlack);
      b.box(3, 13, 24, 6, 14, 30, P.steelDark);  // sight
      return g;
    }
    case Tool.Torch: {
      const g = new Grid(8, 10, 30), b = new Builder(g);
      b.cylZ(4, 4, 3.6, 0, 14, P.gasBlue);
      b.box(3, 3, 14, 5, 5, 26, P.copper);
      b.box(3, 3, 26, 5, 5, 30, P.steelDark);
      b.box(2, 7, 10, 6, 9, 13, P.paintBlack);
      return g;
    }
    case Tool.Grab: default: {
      const g = new Grid(10, 6, 14), b = new Builder(g);
      b.box(1, 0, 0, 9, 5, 8, P.carpet);                 // glove
      for (let k = 0; k < 4; k++) b.box(1 + k * 2, 1, 8, 2 + k * 2, 4, 13, P.carpet);
      b.box(0, 0, 0, 10, 5, 1, P.paintYellow);
      return g;
    }
  }
}

// rest pose per tool: grip point (grid z), offset right/up/forward (m), pitch/yaw/roll tilt (rad)
const POSE: { grip: number; o: [number, number, number]; r: [number, number, number] }[] = [];
POSE[Tool.Hammer] = { grip: 5, o: [0.32, -0.38, 0.4], r: [0.55, -0.28, -0.1] };
POSE[Tool.Shotgun] = { grip: 12, o: [0.17, -0.17, 0.3], r: [0.03, 0.025, 0] };
POSE[Tool.Rifle] = { grip: 15, o: [0.16, -0.165, 0.28], r: [0.03, 0.02, 0] };
POSE[Tool.PipeBomb] = { grip: 9, o: [0.2, -0.2, 0.38], r: [0.35, 0.3, 0.45] };
POSE[Tool.Bomb] = { grip: 6, o: [0.26, -0.25, 0.46], r: [0.15, 0.35, 0.1] };
POSE[Tool.Rocket] = { grip: 20, o: [0.19, -0.135, 0.2], r: [0.0, 0.02, 0] };
POSE[Tool.Torch] = { grip: 7, o: [0.2, -0.2, 0.34], r: [0.12, 0.12, 0] };
POSE[Tool.Grab] = { grip: 4, o: [0.18, -0.2, 0.36], r: [0.2, 0.2, 0.1] };

export class ViewModel {
  bodies: Body[] = [];
  private q = new Quat();
  private tq = new Quat();
  private swayX = 0; private swayY = 0;
  private retract = 0;
  private switchT = 1;
  private lastTool = -1;
  visible = true;

  constructor() {
    for (let t = 0; t < Tool.COUNT; t++) {
      const g = model(t as Tool);
      const b = new Body(g.sx, g.sy, g.sz, g.vox);
      b.com.set(g.sx / 2, g.sy / 2, POSE[t].grip);
      b.scale = 0.02;
      b.radius = 2;
      b.count = 1;
      this.bodies.push(b);
    }
  }

  /**
   * Returns the body to draw for the current tool, positioned in front of the camera.
   * wallDist: distance to the nearest surface straight ahead (the tool is pulled back near walls).
   */
  update(cam: Camera, tool: Tool, anim: number, recoil: number, bob: number, dt: number, mouseDX: number, mouseDY: number, torch: boolean, wallDist: number): Body | null {
    if (!this.visible) return null;
    const b = this.bodies[tool];
    const pose = POSE[tool];
    if (tool !== this.lastTool) { this.lastTool = tool; this.switchT = 0; }
    this.switchT = Math.min(1, this.switchT + dt * 4);
    // camera basis
    const yaw = cam.yaw, pitch = cam.pitch;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fx = -Math.sin(yaw) * cp, fy = sp, fz = -Math.cos(yaw) * cp;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const ux = Math.sin(yaw) * sp, uy = cp, uz = Math.cos(yaw) * sp;
    const k = Math.min(1, dt * 10);
    this.swayX += (Math.max(-0.04, Math.min(0.04, -mouseDX * 0.0005)) - this.swayX) * k;
    this.swayY += (Math.max(-0.04, Math.min(0.04, mouseDY * 0.0005)) - this.swayY) * k;
    const want = Math.max(0, Math.min(1, (0.85 - wallDist) / 0.6));
    this.retract += (want - this.retract) * Math.min(1, dt * 12);
    const sw = 1 - this.switchT;
    let ox = pose.o[0] + this.swayX, oy = pose.o[1] + Math.sin(bob * 2) * 0.012 + this.swayY - sw * sw * 0.3, oz = pose.o[2] + Math.sin(bob) * 0.006;
    let lp = pose.r[0], ly = pose.r[1], lr = pose.r[2];
    // pulled back and lowered near walls
    oz -= this.retract * 0.2; oy -= this.retract * 0.06; lp += this.retract * 0.5;
    if (tool === Tool.Hammer) {
      // anim = 1 at impact, eases back to the raised rest pose
      const a = anim * anim * (3 - 2 * anim);
      lp -= a * 1.55; oz += a * 0.12; oy += a * 0.06; ox -= a * 0.06; ly += a * 0.15;
    } else if (tool === Tool.Shotgun || tool === Tool.Rifle || tool === Tool.Rocket) {
      oz -= recoil * 1.1; lp += recoil * 3.5; oy += recoil * 0.2;
    } else if (tool === Tool.PipeBomb || tool === Tool.Bomb) {
      const s = Math.sin(anim * Math.PI);
      oz += s * 0.25; oy += s * 0.14; lp += s * 0.8;
    } else if (tool === Tool.Torch && torch) {
      ox += (Math.random() - 0.5) * 0.003; oy += (Math.random() - 0.5) * 0.003;
    } else if (tool === Tool.Grab) {
      oz += anim * 0.08;
    }
    // compose rotation: camera (yaw, pitch) then local tilt
    this.q.setAxisAngle(0, 1, 0, yaw);
    this.tq.setAxisAngle(1, 0, 0, pitch);
    this.q.multiply(this.q, this.tq);
    this.tq.setAxisAngle(0, 1, 0, ly);
    this.q.multiply(this.q, this.tq);
    this.tq.setAxisAngle(1, 0, 0, lp);
    this.q.multiply(this.q, this.tq);
    this.tq.setAxisAngle(0, 0, 1, lr);
    this.q.multiply(this.q, this.tq);
    // models point along +z in grid space; the camera looks along -z: rotate 180 degrees around y
    this.tq.setAxisAngle(0, 1, 0, Math.PI);
    this.q.multiply(this.q, this.tq);
    b.pos.set(cam.x + rx * ox + ux * oy + fx * oz, cam.y + uy * oy + fy * oz, cam.z + rz * ox + uz * oy + fz * oz);
    b.rot.copy(this.q);
    b.prevPos.copy(b.pos); b.prevRot.copy(b.rot);
    return b;
  }
}
