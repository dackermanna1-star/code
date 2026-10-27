// Hinged doors: single or double leaves that swing away from the player.
// Leaves are separate meshes (lit by the same baked vertex lighting at their
// starting pose) with segmented colliders so half-open doors block correctly.
import * as THREE from 'three';
import { MeshBuilder } from './builder.js';
import { ci, cj } from './plan.js';

const OPEN_ANGLE = 1.55;
const SEGS = 4;

export class DoorSystem {
  constructor(level, atlas, material, baker, scene) {
    this.level = level;
    this.leaves = [];
    this.doors = [];
    this.colliders = [];
    for (const d of level.doors) {
      if (d.kind === 'opening' || d.kind === 'elevator') continue;
      this.doors.push(d);
      d.leafObjs = [];
      const n = d.leaves || 1;
      const width = d.axis === 'x' ? d.x1 - d.x0 : d.z1 - d.z0;
      const lw = width / n;
      const y = d.k * 4;
      const xc = (d.x0 + d.x1) / 2, zc = (d.z0 + d.z1) / 2;
      // the side the door initially swings into: away from the corridor
      const g = level.grid(d.k);
      let side;
      if (d.axis === 'x') {
        const r = g.roomAt(ci(xc), cj(d.z0 - 0.25));
        side = r >= 0 && level.rooms[r].corridor ? 1 : -1;
      } else {
        const r = g.roomAt(ci(d.x0 - 0.25), cj(zc));
        side = r >= 0 && level.rooms[r].corridor ? 1 : -1;
      }
      d.center = new THREE.Vector3(xc, y + 1.05, zc);
      for (let i = 0; i < n; i++) {
        let hx, hz, base;
        const inset = 0.03;
        if (d.axis === 'x') {
          if (i === 0) { hx = d.x0 + inset; hz = zc; base = 0; }
          else { hx = d.x1 - inset; hz = zc; base = Math.PI; }
        } else {
          if (i === 0) { hx = xc; hz = d.z0 + inset; base = -Math.PI / 2; }
          else { hx = xc; hz = d.z1 - inset; base = Math.PI / 2; }
        }
        const len = lw - inset - 0.012;
        const leaf = { door: d, hx, hy: y, hz, base, len, angle: 0, target: 0, sign: 1, mesh: null, cols: [] };
        // geometry in hinge space
        const b = new MeshBuilder(atlas);
        const tex = d.tex || 'door_wood';
        const edge = tex === 'door_wood' ? 'wood_dark' : 'metal_painted';
        b.box(0, 0, -0.022, len, 2.06, 0.022, { pz: tex, nz: tex, side: edge }, { uv: 'fit' });
        const hxp = len - 0.09;
        const handle = tex === 'door_double' ? null : 'chrome';
        if (handle) {
          b.box(hxp - 0.1, 1.0, 0.022, hxp + 0.02, 1.03, 0.06, handle);
          b.box(hxp - 0.1, 1.0, -0.06, hxp + 0.02, 1.03, -0.022, handle);
        }
        const yaw0 = this.yawFor(leaf, side * (d.open || 0) * OPEN_ANGLE, side);
        const m = new THREE.Matrix4().makeRotationY(yaw0).setPosition(hx, y, hz);
        const bake = baker.bake(b, m);
        const geo = b.buildSingle(bake);
        const mesh = new THREE.Mesh(geo, material);
        mesh.position.set(hx, y, hz);
        mesh.rotation.y = yaw0;
        mesh.matrixAutoUpdate = true;
        scene.add(mesh);
        leaf.mesh = mesh;
        leaf.angle = (d.open || 0) * OPEN_ANGLE;
        leaf.target = leaf.angle;
        leaf.sideSign = side;
        for (let s = 0; s < SEGS; s++) {
          const c = { x0: 0, y0: y, z0: 0, x1: 0, y1: y + 2.06, z1: 0, door: true };
          leaf.cols.push(c);
          this.colliders.push(c);
        }
        this.updateLeaf(leaf);
        this.leaves.push(leaf);
        d.leafObjs.push(leaf);
      }
      d.isOpen = (d.open || 0) > 0.2;
    }
  }

  // yaw for an opening angle toward world side `side` (+1 = +z for x-axis doors, +x for z-axis doors)
  yawFor(leaf, angleSigned, side) {
    // derivative of the free-end direction at the base yaw
    const dvx = -Math.sin(leaf.base), dvz = -Math.cos(leaf.base);
    const d = leaf.door;
    const wantX = d.axis === 'z' ? side : 0;
    const wantZ = d.axis === 'x' ? side : 0;
    const s = Math.sign(dvx * wantX + dvz * wantZ) || 1;
    return leaf.base + s * Math.abs(angleSigned);
  }

  updateLeaf(leaf) {
    const yaw = this.yawFor(leaf, leaf.angle, leaf.sideSign);
    leaf.mesh.rotation.y = yaw;
    const cx = Math.cos(yaw), sz = -Math.sin(yaw);
    const moving = Math.abs(leaf.angle - leaf.target) > 0.02;
    for (let s = 0; s < SEGS; s++) {
      const t0 = (s / SEGS) * leaf.len, t1 = ((s + 1) / SEGS) * leaf.len;
      const ax = leaf.hx + cx * t0, az = leaf.hz + sz * t0;
      const bx = leaf.hx + cx * t1, bz = leaf.hz + sz * t1;
      const c = leaf.cols[s];
      const pad = 0.045;
      c.x0 = Math.min(ax, bx) - pad;
      c.x1 = Math.max(ax, bx) + pad;
      c.z0 = Math.min(az, bz) - pad;
      c.z1 = Math.max(az, bz) + pad;
      c.off = moving; // swinging leaves don't shove the player around
    }
  }

  // Player tries to use a door. Returns a message string or null.
  use(d, playerPos, audio) {
    const pos = d.center;
    if (d.barricaded) {
      audio?.play('door_barricaded', pos);
      return "IT'S BEEN NAILED SHUT FROM THIS SIDE.";
    }
    if (d.locked === 'chained') {
      audio?.play('door_locked', pos);
      return 'CHAINED SHUT FROM OUTSIDE.';
    }
    if (d.locked) {
      audio?.play('door_locked', pos);
      return 'LOCKED.';
    }
    if (d.oneWay) {
      const v = d.oneWay.axis === 'z' ? playerPos.z - pos.z : playerPos.x - pos.x;
      if (Math.sign(v) !== d.oneWay.side) {
        audio?.play('door_locked', pos);
        return "IT WON'T OPEN. LOCKED FROM THE OTHER SIDE.";
      }
      d.oneWay = null;
      audio?.play('door_open', pos);
      this.swing(d, playerPos, true);
      return 'THE PUSH BAR GIVES WITH A CLANG.';
    }
    const opening = !d.isOpen;
    this.swing(d, playerPos, opening);
    audio?.play(opening ? 'door_open' : 'door_close', pos);
    return null;
  }

  swing(d, playerPos, open) {
    d.isOpen = open;
    const away = d.axis === 'x' ? Math.sign(d.center.z - playerPos.z) || 1 : Math.sign(d.center.x - playerPos.x) || 1;
    for (const leaf of d.leafObjs) {
      if (open) {
        if (leaf.angle < 0.05) leaf.sideSign = away;
        leaf.target = OPEN_ANGLE;
      } else leaf.target = 0;
    }
  }

  update(dt) {
    for (const leaf of this.leaves) {
      if (leaf.angle === leaf.target) continue;
      const diff = leaf.target - leaf.angle;
      const step = Math.sign(diff) * Math.max(Math.abs(diff) * dt * 5, dt * 0.6);
      if (Math.abs(step) >= Math.abs(diff)) leaf.angle = leaf.target;
      else leaf.angle += step;
      this.updateLeaf(leaf);
    }
  }

  // Nearest door hit by a ray within maxDist.
  raycast(o, dir, maxDist) {
    let best = null, bestT = maxDist;
    for (const d of this.doors) {
      const dx = d.center.x - o.x, dz = d.center.z - o.z;
      if (dx * dx + dz * dz > 16 || Math.abs(d.center.y - o.y) > 2.5) continue;
      const boxes = [{ x0: d.x0, y0: d.k * 4, z0: d.z0, x1: d.x1, y1: d.k * 4 + 2.1, z1: d.z1 }];
      for (const l of d.leafObjs) for (const c of l.cols) boxes.push(c);
      for (const bx of boxes) {
        const t = rayBox(o, dir, bx);
        if (t !== null && t < bestT) {
          bestT = t;
          best = d;
        }
      }
    }
    return best ? { door: best, t: bestT } : null;
  }

  setVisibility(camPos, far) {
    const f2 = (far + 2) * (far + 2);
    for (const leaf of this.leaves) {
      const dx = leaf.hx - camPos.x, dz = leaf.hz - camPos.z, dy = leaf.hy + 1 - camPos.y;
      leaf.mesh.visible = dx * dx + dz * dz < f2 && Math.abs(dy) < 6;
    }
  }
}

export function rayBox(o, d, b) {
  let tmin = 0, tmax = 1e9;
  for (const [oo, dd, lo, hi] of [[o.x, d.x, b.x0, b.x1], [o.y, d.y, b.y0, b.y1], [o.z, d.z, b.z0, b.z1]]) {
    if (Math.abs(dd) < 1e-9) {
      if (oo < lo || oo > hi) return null;
    } else {
      let t1 = (lo - oo) / dd, t2 = (hi - oo) / dd;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
