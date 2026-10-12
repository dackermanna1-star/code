// Minimal column-major mat4 helpers for the camera.

export function perspective(tanX, tanY, near, far) {
  const m = new Float32Array(16);
  m[0] = 1 / tanX;
  m[5] = 1 / tanY;
  m[10] = -(far + near) / (far - near);
  m[11] = -1;
  m[14] = -(2 * far * near) / (far - near);
  return m;
}

// Doom-space camera (x east, y north, z up) to GL view matrix where
// GL x = doom x, GL y = doom z, GL z = -doom y.
export function viewMatrix(x, y, z, yaw, pitch, roll = 0) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  // forward, right, up in GL space
  let f = [cp * cy, sp, -cp * sy];
  let r = [sy, 0, cy];
  let u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  if (roll) {
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const r2 = [r[0] * cr + u[0] * sr, r[1] * cr + u[1] * sr, r[2] * cr + u[2] * sr];
    const u2 = [u[0] * cr - r[0] * sr, u[1] * cr - r[1] * sr, u[2] * cr - r[2] * sr];
    r = r2; u = u2;
  }
  const ex = x, ey = z, ez = -y;
  const m = new Float32Array(16);
  m[0] = r[0]; m[4] = r[1]; m[8] = r[2];
  m[1] = u[0]; m[5] = u[1]; m[9] = u[2];
  m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2];
  m[12] = -(r[0] * ex + r[1] * ey + r[2] * ez);
  m[13] = -(u[0] * ex + u[1] * ey + u[2] * ez);
  m[14] = (f[0] * ex + f[1] * ey + f[2] * ez);
  m[15] = 1;
  return m;
}

export function multiply(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

// Projects a doom-space point; returns [ndcX, ndcY, depth] or null if behind.
export function projectPoint(viewProj, x, y, z) {
  const gx = x, gy = z, gz = -y;
  const cx = viewProj[0] * gx + viewProj[4] * gy + viewProj[8] * gz + viewProj[12];
  const cy = viewProj[1] * gx + viewProj[5] * gy + viewProj[9] * gz + viewProj[13];
  const cw = viewProj[3] * gx + viewProj[7] * gy + viewProj[11] * gz + viewProj[15];
  if (cw <= 0.01) return null;
  return [cx / cw, cy / cw, cw];
}
