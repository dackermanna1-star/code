// View frustum extraction and AABB tests.

export class Frustum {
  readonly p = new Float32Array(24); // 6 planes (a,b,c,d), normals pointing inwards

  setFromMatrix(m: Float32Array): this {
    const p = this.p;
    // rows of the column-major matrix
    const r0x = m[0], r0y = m[4], r0z = m[8], r0w = m[12];
    const r1x = m[1], r1y = m[5], r1z = m[9], r1w = m[13];
    const r2x = m[2], r2y = m[6], r2z = m[10], r2w = m[14];
    const r3x = m[3], r3y = m[7], r3z = m[11], r3w = m[15];
    const set = (i: number, a: number, b: number, c: number, d: number) => {
      const l = Math.hypot(a, b, c) || 1;
      p[i * 4] = a / l; p[i * 4 + 1] = b / l; p[i * 4 + 2] = c / l; p[i * 4 + 3] = d / l;
    };
    set(0, r3x + r0x, r3y + r0y, r3z + r0z, r3w + r0w); // left
    set(1, r3x - r0x, r3y - r0y, r3z - r0z, r3w - r0w); // right
    set(2, r3x + r1x, r3y + r1y, r3z + r1z, r3w + r1w); // bottom
    set(3, r3x - r1x, r3y - r1y, r3z - r1z, r3w - r1w); // top
    set(4, r3x + r2x, r3y + r2y, r3z + r2z, r3w + r2w); // near
    set(5, r3x - r2x, r3y - r2y, r3z - r2z, r3w - r2w); // far
    return this;
  }

  /** AABB test, returns false if box is completely outside. */
  testBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
    const p = this.p;
    for (let i = 0; i < 24; i += 4) {
      const a = p[i], b = p[i + 1], c = p[i + 2], d = p[i + 3];
      const x = a > 0 ? x1 : x0, y = b > 0 ? y1 : y0, z = c > 0 ? z1 : z0;
      if (a * x + b * y + c * z + d < 0) return false;
    }
    return true;
  }

  testSphere(x: number, y: number, z: number, r: number): boolean {
    const p = this.p;
    for (let i = 0; i < 24; i += 4) if (p[i] * x + p[i + 1] * y + p[i + 2] * z + p[i + 3] < -r) return false;
    return true;
  }
}
