// Procedural interior environment cube (pure data): golden-hour apartment radiance for the
// IBL fallback used until the real reflection probe capture exists. PURE MODULE (no Babylon).
// Face order/orientation = GL cube-map convention (+X,-X,+Y,-Y,+Z,-Z; row 0 = top), identical
// to Babylon's CubeMapToSphericalPolynomialTools file faces so SH and sampling agree.

// Cube face orientation (GL convention, row 0 = top), identical to Babylon's
// CubeMapToSphericalPolynomialTools file faces so SH and sampling agree:
//   dir = normal + u * fileX + v * fileY, u,v in [-1, 1]
export const CUBE_FACES: Array<{ n: [number, number, number]; x: [number, number, number]; y: [number, number, number] }> = [
  { n: [1, 0, 0], x: [0, 0, -1], y: [0, -1, 0] }, // +X right (east)
  { n: [-1, 0, 0], x: [0, 0, 1], y: [0, -1, 0] }, // -X left (west)
  { n: [0, 1, 0], x: [1, 0, 0], y: [0, 0, 1] }, // +Y up
  { n: [0, -1, 0], x: [1, 0, 0], y: [0, 0, -1] }, // -Y down
  { n: [0, 0, 1], x: [1, 0, 0], y: [0, -1, 0] }, // +Z front (north)
  { n: [0, 0, -1], x: [-1, 0, 0], y: [0, -1, 0] }, // -Z back (south)
];

const sm = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Linear HDR radiance seen from the middle of the apartment at golden hour, for a unit
 * direction (x east, y up, z north). Low-frequency by design: it only has to give glossy
 * surfaces and metals a believable interior to reflect until the real capture exists.
 */
export function interiorRadiance(x: number, y: number, z: number, out: number[] = [0, 0, 0]): number[] {
  const horiz = Math.sqrt(x * x + z * z) || 1;
  const hx = x / horiz,
    hz = z / horiz;
  // walls: warm off-white, north/east walls catch sun patches
  let r = 0.4,
    g = 0.355,
    b = 0.3;
  const sunPatch = sm(0.2, 0.9, hz * 0.8 + hx * 0.4) * sm(-0.05, 0.1, y) * sm(0.55, 0.25, y);
  r += sunPatch * 0.45;
  g += sunPatch * 0.3;
  b += sunPatch * 0.14;
  // ceiling
  const ceil = sm(0.25, 0.75, y);
  r += (0.52 - r) * ceil;
  g += (0.49 - g) * ceil;
  b += (0.45 - b) * ceil;
  // floor: laminate with warm sun patches towards the south windows
  const flo = sm(-0.1, -0.45, y);
  const floorSun = sm(0.3, 0.8, -hz) * sm(-0.15, -0.35, y) * sm(-0.85, -0.55, y);
  const fr = 0.17 + floorSun * 0.55,
    fg = 0.105 + floorSun * 0.36,
    fb = 0.06 + floorSun * 0.18;
  r += (fr - r) * flo;
  g += (fg - g) * flo;
  b += (fb - b) * flo;
  // south windows (living room sliding door + window): bright warm sky, mullions
  const south = sm(0.62, 0.8, -hz) * sm(-0.1, 0.02, y) * sm(0.62, 0.48, y);
  if (south > 0) {
    const az = Math.atan2(hx, -hz); // 0 = due south, + towards east
    const mull = 0.75 + 0.25 * sm(0.0, 0.08, Math.abs(Math.sin(az * 9)));
    const k = south * mull;
    const sky = sm(0.0, 0.45, y);
    const wr = 2.6 + (1.25 - 2.6) * sky,
      wg = 1.85 + (1.35 - 1.85) * sky,
      wb = 1.15 + (1.6 - 1.15) * sky;
    r += (wr - r) * k;
    g += (wg - g) * k;
    b += (wb - b) * k;
  }
  // east window (bedroom 2 / kitchen side): cooler sky, smaller
  const east = sm(0.82, 0.93, hx) * sm(0.0, 0.08, y) * sm(0.5, 0.38, y);
  if (east > 0) {
    r += (1.05 - r) * east;
    g += (1.15 - g) * east;
    b += (1.4 - b) * east;
  }
  out[0] = r;
  out[1] = g;
  out[2] = b;
  return out;
}

/** Six float RGBA faces (+X,-X,+Y,-Y,+Z,-Z) of the procedural interior environment. */
export function interiorEnvironmentFaces(size: number): Float32Array[] {
  const faces: Float32Array[] = [];
  const c = [0, 0, 0];
  for (const f of CUBE_FACES) {
    const data = new Float32Array(size * size * 4);
    for (let py = 0; py < size; py++) {
      const v = ((py + 0.5) / size) * 2 - 1;
      for (let px = 0; px < size; px++) {
        const u = ((px + 0.5) / size) * 2 - 1;
        let dx = f.n[0] + u * f.x[0] + v * f.y[0];
        let dy = f.n[1] + u * f.x[1] + v * f.y[1];
        let dz = f.n[2] + u * f.x[2] + v * f.y[2];
        const inv = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
        dx *= inv;
        dy *= inv;
        dz *= inv;
        interiorRadiance(dx, dy, dz, c);
        const o = (py * size + px) * 4;
        data[o] = c[0];
        data[o + 1] = c[1];
        data[o + 2] = c[2];
        data[o + 3] = 1;
      }
    }
    faces.push(data);
  }
  return faces;
}

