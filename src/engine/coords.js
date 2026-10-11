// GoldSrc space (x east, y north, z up) <-> three.js space (y up).
// See docs/conventions.md.

export const DEG = Math.PI / 180;

export function gsToThree(x, y, z, out) {
  out.x = x;
  out.y = z;
  out.z = -y;
  return out;
}

export function threeToGs(v, out = [0, 0, 0]) {
  out[0] = v.x;
  out[1] = -v.z;
  out[2] = v.y;
  return out;
}

// GoldSrc AngleVectors: pitch (+ = down), yaw (CCW from +X), degrees.
export function angleVectors(pitch, yaw, forward, right, up) {
  const sp = Math.sin(pitch * DEG), cp = Math.cos(pitch * DEG);
  const sy = Math.sin(yaw * DEG), cy = Math.cos(yaw * DEG);
  if (forward) {
    forward[0] = cp * cy;
    forward[1] = cp * sy;
    forward[2] = -sp;
  }
  if (right) {
    right[0] = sy;
    right[1] = -cy;
    right[2] = 0;
  }
  if (up) {
    up[0] = sp * cy;
    up[1] = sp * sy;
    up[2] = cp;
  }
}
