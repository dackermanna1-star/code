// Kinematic AABB physics against voxel collision boxes (+ rotated vehicle boxes).
// A body: { x, y, z (feet centre), vx, vy, vz, hw (half width), h (height), onGround, stepHeight }

const EPS = 1e-4;
const boxes = [];

function gather(world, minX, minY, minZ, maxX, maxY, maxZ) {
  boxes.length = 0;
  world.forEachSolidBox(minX, minY, minZ, maxX, maxY, maxZ, (x0, y0, z0, x1, y1, z1) => {
    boxes.push(x0, y0, z0, x1, y1, z1);
  });
}

/** Sweep one axis. Returns allowed displacement. */
function sweepAxis(axis, d, bminX, bminY, bminZ, bmaxX, bmaxY, bmaxZ) {
  for (let i = 0; i < boxes.length; i += 6) {
    const x0 = boxes[i], y0 = boxes[i + 1], z0 = boxes[i + 2], x1 = boxes[i + 3], y1 = boxes[i + 4], z1 = boxes[i + 5];
    if (axis === 0) {
      if (y1 <= bminY + EPS || y0 >= bmaxY - EPS || z1 <= bminZ + EPS || z0 >= bmaxZ - EPS) continue;
      if (d > 0 && x0 >= bmaxX - EPS) d = Math.min(d, x0 - bmaxX);
      else if (d < 0 && x1 <= bminX + EPS) d = Math.max(d, x1 - bminX);
    } else if (axis === 1) {
      if (x1 <= bminX + EPS || x0 >= bmaxX - EPS || z1 <= bminZ + EPS || z0 >= bmaxZ - EPS) continue;
      if (d > 0 && y0 >= bmaxY - EPS) d = Math.min(d, y0 - bmaxY);
      else if (d < 0 && y1 <= bminY + EPS) d = Math.max(d, y1 - bminY);
    } else {
      if (x1 <= bminX + EPS || x0 >= bmaxX - EPS || y1 <= bminY + EPS || y0 >= bmaxY - EPS) continue;
      if (d > 0 && z0 >= bmaxZ - EPS) d = Math.min(d, z0 - bmaxZ);
      else if (d < 0 && z1 <= bminZ + EPS) d = Math.max(d, z1 - bminZ);
    }
  }
  return d;
}

function overlapsAny(minX, minY, minZ, maxX, maxY, maxZ) {
  for (let i = 0; i < boxes.length; i += 6) {
    if (boxes[i + 3] > minX + EPS && boxes[i] < maxX - EPS && boxes[i + 4] > minY + EPS && boxes[i + 1] < maxY - EPS &&
      boxes[i + 5] > minZ + EPS && boxes[i + 2] < maxZ - EPS) return true;
  }
  return false;
}

/**
 * Move a body by its velocity for dt seconds, resolving collisions.
 * Returns {hitX, hitZ, hitY} flags. Sets body.onGround.
 * vehicles: optional array of colliders {x, z, cos, sin, hx, hz, top, bottom}
 */
export function moveBody(world, b, dt, vehicles = null) {
  let dx = b.vx * dt, dy = b.vy * dt, dz = b.vz * dt;
  const hw = b.hw, h = b.h;
  const res = { hitX: false, hitY: false, hitZ: false, stepped: false };
  const step = b.onGround ? (b.stepHeight ?? 0.55) : 0;
  gather(world,
    Math.min(b.x - hw, b.x - hw + dx) - 1, Math.min(b.y, b.y + dy) - 1, Math.min(b.z - hw, b.z - hw + dz) - 1,
    Math.max(b.x + hw, b.x + hw + dx) + 1, Math.max(b.y + h, b.y + h + dy) + step + 1, Math.max(b.z + hw, b.z + hw + dz) + 1);

  // Y
  const ny = sweepAxis(1, dy, b.x - hw, b.y, b.z - hw, b.x + hw, b.y + h, b.z + hw);
  if (Math.abs(ny - dy) > 1e-6) { res.hitY = true; if (dy < 0) b.onGround = true; b.vy = 0; }
  else if (dy < -1e-6) b.onGround = false;
  b.y += ny;

  // X then Z, with step-up
  for (const axis of [0, 2]) {
    const d = axis === 0 ? dx : dz;
    if (Math.abs(d) < 1e-9) continue;
    const nd = sweepAxis(axis, d, b.x - hw, b.y, b.z - hw, b.x + hw, b.y + h, b.z + hw);
    if (Math.abs(nd - d) > 1e-6) {
      // try step up
      if (step > 0) {
        const sy = sweepAxis(1, step, b.x - hw, b.y, b.z - hw, b.x + hw, b.y + h, b.z + hw);
        if (sy > 0.05) {
          const ox = axis === 0 ? d : 0, oz = axis === 2 ? d : 0;
          if (!overlapsAny(b.x - hw + ox, b.y + sy, b.z - hw + oz, b.x + hw + ox, b.y + sy + h, b.z + hw + oz)) {
            // find the lowest y we can stand at after moving
            const down = sweepAxis(1, -sy, b.x - hw + ox, b.y + sy, b.z - hw + oz, b.x + hw + ox, b.y + sy + h, b.z + hw + oz);
            b.y += sy + down;
            if (axis === 0) b.x += d; else b.z += d;
            res.stepped = true;
            continue;
          }
        }
      }
      if (axis === 0) { b.x += nd; b.vx = 0; res.hitX = true; } else { b.z += nd; b.vz = 0; res.hitZ = true; }
    } else if (axis === 0) b.x += nd; else b.z += nd;
  }

  if (vehicles) resolveVehicles(b, vehicles, res);
  return res;
}

/** Push body out of rotated vehicle boxes; allow standing on roofs. */
export function resolveVehicles(b, vehicles, res) {
  for (const v of vehicles) {
    const rx = b.x - v.x, rz = b.z - v.z;
    if (rx * rx + rz * rz > (v.r + b.hw + 1) ** 2) continue;
    if (b.y >= v.top - 0.01 || b.y + b.h <= v.bottom) continue;
    // to local
    const lx = rx * v.cos - rz * v.sin;
    const lz = rx * v.sin + rz * v.cos;
    const px = v.hx + b.hw - Math.abs(lx);
    const pz = v.hz + b.hw - Math.abs(lz);
    if (px <= 0 || pz <= 0) continue;
    // landing on the roof?
    const pyTop = v.top - b.y;
    if (pyTop < 0.6 && b.vy <= 0.5) {
      b.y = v.top; b.vy = 0; b.onGround = true;
      continue;
    }
    let nlx = lx, nlz = lz;
    if (px < pz) nlx = Math.sign(lx || 1) * (v.hx + b.hw);
    else nlz = Math.sign(lz || 1) * (v.hz + b.hw);
    // back to world (inverse rotation)
    b.x = v.x + nlx * v.cos + nlz * v.sin;
    b.z = v.z - nlx * v.sin + nlz * v.cos;
    if (res) { res.hitX = true; res.hitVehicle = v; }
  }
}

/** Is the AABB at (x,y,z) free of solid blocks? */
export function boxFree(world, x, y, z, hw, h) {
  gather(world, x - hw, y, z - hw, x + hw, y + h, z + hw);
  return !overlapsAny(x - hw, y, z - hw, x + hw, y + h, z + hw);
}
