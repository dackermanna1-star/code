// Procedurally sculpted iceberg for the backdrop.
//
// The berg is a heightfield over the sea plane: a ridge whose crest follows the
// silhouette of the original backdrop photo (traced as frame fractions), plus
// lower lobes in front, Voronoi "block" facets, ridged crevices and fbm lumps.
// It is rendered flat-shaded with a custom ice shader (blue depth tint,
// crevice darkening, fresnel rim, light from the upper left).
import * as THREE from 'three';
import { fbm, mulberry32, ridged, vnoise } from './noise';
import { NOISE_GLSL } from './glsl';

/** Backdrop framing, shared by the berg builder and the backdrop camera. */
export interface BackdropFrame {
  /** Total vertical tan extent of the frame. */
  T: number;
  /** Frame aspect (w/h). */
  aspect: number;
  /** Frame v (from top) of the horizon. */
  vh: number;
  /** Camera height above the sea. */
  camH: number;
  /** Distance of the berg's centre from the camera. */
  dist: number;
}

/** Crest of the berg: frame u -> frame v of the top silhouette (original art). */
const CREST: Array<[number, number]> = [
  [0.035, 0.4],
  [0.06, 0.31],
  [0.075, 0.268],
  [0.095, 0.243],
  [0.125, 0.233],
  [0.16, 0.237],
  [0.19, 0.226],
  [0.215, 0.208],
  [0.25, 0.2],
  [0.29, 0.186],
  [0.33, 0.166],
  [0.37, 0.143],
  [0.41, 0.118],
  [0.44, 0.088],
  [0.47, 0.054],
  [0.5, 0.026],
  [0.53, 0.008],
  [0.57, -0.008],
  [0.6, -0.004],
  [0.625, 0.022],
  [0.65, 0.05],
  [0.675, 0.094],
  [0.7, 0.126],
  [0.73, 0.15],
  [0.76, 0.166],
  [0.785, 0.172],
  [0.81, 0.2],
  [0.84, 0.212],
  [0.865, 0.198],
  [0.885, 0.232],
  [0.9, 0.285],
  [0.915, 0.36],
  [0.93, 0.42],
];

function crestV(u: number): number {
  if (u <= CREST[0][0]) return CREST[0][1] + (CREST[0][0] - u) * 3;
  for (let i = 1; i < CREST.length; i++) {
    const [u1, v1] = CREST[i];
    if (u <= u1) {
      const [u0, v0] = CREST[i - 1];
      const t = (u - u0) / (u1 - u0);
      const s = t * t * (3 - 2 * t);
      return v0 + (v1 - v0) * (0.35 * t + 0.65 * s);
    }
  }
  const [ul, vl] = CREST[CREST.length - 1];
  return vl + (u - ul) * 3;
}

/** Lower lobes in front of the main ridge (frame u, frame v of top, depth offset m, width in u). */
const LOBES: Array<[number, number, number, number]> = [
  [0.16, 0.255, 70, 0.07],
  [0.3, 0.235, 85, 0.06],
  [0.45, 0.2, 60, 0.05],
  [0.58, 0.19, 95, 0.06],
  [0.7, 0.21, 80, 0.05],
  [0.8, 0.22, 55, 0.045],
  [0.855, 0.245, 40, 0.035],
];

export function buildIcebergGeometry(f: BackdropFrame): THREE.BufferGeometry {
  const W = f.T * f.aspect * f.dist; // frame width (m) at the berg's distance
  const u0 = 0.03;
  const u1 = 0.95;
  const x0 = (u0 - 0.5) * W;
  const x1 = (u1 - 0.5) * W;
  const z0 = -f.dist - 0.22 * W;
  const z1 = -f.dist + 0.36 * W;
  const nx = 230;
  const nz = 120;
  const cell = (x1 - x0) / nx;
  const cellZ = (z1 - z0) / nz;

  // Height at the crest for a given frame u, at distance d from the camera.
  const hAt = (v: number, d: number) => f.camH + (f.vh - v) * f.T * d;
  // Crest line wanders in depth so the ridge is not a straight wall.
  const crestZ = (x: number) => -f.dist + 36 * (fbm(x / 160, 3.1, 3, 7) - 0.5) - 20;

  /** Envelope: the berg's overall mass (ridge under the traced crest + front lobes). */
  const envelope = (x: number, z: number) => {
    const d = -z;
    const u = 0.5 + x / (f.T * f.aspect * d);
    const zc = crestZ(x);
    const dc = -zc;
    const crest = hAt(crestV(0.5 + x / (f.T * f.aspect * dc)), dc) + 12;
    const dzc = z - zc;
    const slope = dzc > 0 ? 0.95 + 0.4 * fbm(x / 90, 1.7, 3, 3) : 1.3;
    let h = crest - slope * Math.pow(Math.abs(dzc), 1.06);
    for (const [lu, lv, ldz, lw] of LOBES) {
      const du = (u - lu) / lw;
      const zl = zc + ldz;
      const dzl = (z - zl) / 30;
      const r2 = du * du + dzl * dzl * 0.6;
      if (r2 < 4) h = Math.max(h, hAt(lv, d) + 10 - 10 * r2 - 1.0 * Math.max(0, z - zl));
    }
    return h;
  };

  // Ice blocks: rounded boxes with tilted flat tops and steep sides, stacked
  // under the envelope. Their union is the berg.
  interface Block { x: number; z: number; c: number; s: number; sx: number; sz: number; r: number; top: number; gx: number; gz: number; k: number }
  const rnd = mulberry32(1234);
  const blocks: Block[] = [];
  for (let n = 0; blocks.length < 170 && n < 4000; n++) {
    const bx = x0 + 12 + (x1 - x0 - 24) * rnd();
    const zc = crestZ(bx);
    const bz = zc - 50 + 170 * Math.pow(rnd(), 0.8);
    const e = envelope(bx, bz);
    if (e < 6) continue;
    // Tops follow the envelope's slope (pyramid of blocks) plus a random tilt.
    const egx = (envelope(bx + 6, bz) - envelope(bx - 6, bz)) / 12;
    const egz = (envelope(bx, bz + 6) - envelope(bx, bz - 6)) / 12;
    const a = (rnd() - 0.5) * 0.9;
    const sx = 10 + 28 * rnd();
    const sz = 8 + 18 * rnd();
    blocks.push({
      x: bx,
      z: bz,
      c: Math.cos(a),
      s: Math.sin(a),
      sx,
      sz,
      r: Math.min(sx, sz) * (0.35 + 0.55 * rnd()),
      top: e - 2 - 12 * rnd() * rnd(),
      // World gradient -> block-local gradient.
      gx: (0.8 * egx) * Math.cos(a) + (0.5 * egz) * Math.sin(a) + (rnd() - 0.5) * 0.45,
      gz: -(0.8 * egx) * Math.sin(a) + (0.5 * egz) * Math.cos(a) + (rnd() - 0.5) * 0.35,
      k: 1.6 + 3.2 * rnd(),
    });
  }

  const H = new Float32Array((nx + 1) * (nz + 1));
  const seam = new Float32Array(H.length);
  const idx = (i: number, j: number) => j * (nx + 1) + i;
  for (let j = 0; j <= nz; j++) {
    const z = z0 + ((z1 - z0) * j) / nz;
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      // Low fill so gaps between blocks are crevices, not holes to the sea.
      let h = envelope(x, z) - 30;
      let h2 = h;
      for (const b of blocks) {
        const dx = x - b.x;
        const dz = z - b.z;
        if (Math.abs(dx) > b.sx + 90 || Math.abs(dz) > b.sz + 90) continue;
        const lx = dx * b.c + dz * b.s;
        const lz = -dx * b.s + dz * b.c;
        const qx = Math.abs(lx) - (b.sx - b.r);
        const qz = Math.abs(lz) - (b.sz - b.r);
        const out = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - b.r;
        const tx = Math.max(-b.sx, Math.min(b.sx, lx));
        const tz = Math.max(-b.sz, Math.min(b.sz, lz));
        const tilt = Math.max(-12, Math.min(12, b.gx * tx + b.gz * tz));
        const dome = 3.5 * ((tx * tx) / (b.sx * b.sx) + (tz * tz) / (b.sz * b.sz));
        const hb = b.top + tilt - dome - b.k * Math.max(out, 0);
        if (hb > h) {
          h2 = h;
          h = hb;
        } else if (hb > h2) h2 = hb;
      }
      // Seams where two blocks meet at similar heights become crevices.
      seam[idx(i, j)] = 1 - Math.min(1, Math.max(0, (h - h2) / 1.2));
      // Vertical grooves on the faces + surface lumps.
      const rg = ridged(x / 16 + 0.1 * z / 16, z / 60, 3, 23);
      h -= 3 * (1 - rg) * (1 - rg);
      h += 10 * (fbm(x / 34, z / 26, 3, 41) - 0.5);
      h += 0.8 * (fbm(x / 7, z / 7, 2, 77) - 0.5);

      // Fade the edges of the patch below the waterline.
      const ex = Math.min(i, nx - i) / 6;
      const ez = Math.min(j, nz - j) / 6;
      if (ex < 1 || ez < 1) h = Math.min(h, -8 + 8 * Math.min(ex, ez));
      H[idx(i, j)] = Math.max(h, -12);
    }
  }

  // Crevice term: how far each vertex sits below its neighbourhood's mean.
  const crev = new Float32Array(H.length);
  const R = 3;
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      let s = 0;
      let n = 0;
      for (let dj = -R; dj <= R; dj += 1) {
        const jj = Math.min(nz, Math.max(0, j + dj));
        for (let di = -R; di <= R; di += 1) {
          const ii = Math.min(nx, Math.max(0, i + di));
          s += H[idx(ii, jj)];
          n++;
        }
      }
      crev[idx(i, j)] = Math.max(0, Math.min(1, Math.max((s / n - H[idx(i, j)]) / 7, seam[idx(i, j)] * 0.7)));
    }
  }

  // Jittered grid -> irregular facets once flat shaded. Only keep cells that
  // reach above the sea (saves ~half the triangles).
  const pos: number[] = [];
  const cv: number[] = [];
  const sn: number[] = [];
  const vert = (i: number, j: number) => {
    const jx = (vnoise(i * 1.7, j * 2.3, 91) - 0.5) * cell * 0.45;
    const jz = (vnoise(i * 2.9, j * 1.3, 92) - 0.5) * cell * 0.45;
    const x = x0 + ((x1 - x0) * i) / nx + (i > 0 && i < nx ? jx : 0);
    const z = z0 + ((z1 - z0) * j) / nz + (j > 0 && j < nz ? jz : 0);
    // Smooth normal from the heightfield (central differences).
    const hl = H[idx(Math.max(0, i - 1), j)];
    const hr = H[idx(Math.min(nx, i + 1), j)];
    const hd = H[idx(i, Math.max(0, j - 1))];
    const hu = H[idx(i, Math.min(nz, j + 1))];
    const gx = (hr - hl) / (2 * cell);
    const gz = (hu - hd) / (2 * cellZ);
    const inv = 1 / Math.hypot(gx, 1, gz);
    return [x, H[idx(i, j)], z, crev[idx(i, j)], -gx * inv, inv, -gz * inv];
  };
  const verts: number[][] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) verts.push(vert(i, j));
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = verts[idx(i, j)];
      const b = verts[idx(i + 1, j)];
      const c = verts[idx(i, j + 1)];
      const d = verts[idx(i + 1, j + 1)];
      if (Math.max(a[1], b[1], c[1], d[1]) < -1) continue;
      // Alternate the diagonal for a less regular look.
      const tris = (i + j) % 2 === 0 ? [a, c, b, b, c, d] : [a, c, d, a, d, b];
      for (const p of tris) {
        pos.push(p[0], p[1], p[2]);
        cv.push(p[3]);
        sn.push(p[4], p[5], p[6]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCrevice', new THREE.Float32BufferAttribute(cv, 1));
  g.setAttribute('aSmoothN', new THREE.Float32BufferAttribute(sn, 3));
  g.computeBoundingSphere();
  return g;
}

export function createIcebergMaterial(lightDir: THREE.Vector3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLightDir: { value: lightDir.clone().normalize() },
      // Linear, pre-tone-mapping (ACES inverse of the photo's tones).
      uLit: { value: new THREE.Vector3(0.36, 0.48, 0.78) }, // #b4c2da
      uSnow: { value: new THREE.Vector3(0.33, 0.42, 0.68) },
      uMid: { value: new THREE.Vector3(0.135, 0.185, 0.32) }, // #7083a5
      uShadow: { value: new THREE.Vector3(0.04, 0.06, 0.14) }, // #30406a
      uDeep: { value: new THREE.Vector3(0.03, 0.042, 0.1) }, // #25314f
      uSky: { value: new THREE.Vector3(0.45, 0.46, 0.62) },
      uHaze: { value: new THREE.Vector3(0.4, 0.4, 0.54) },
    },
    vertexShader: /* glsl */ `
      attribute float aCrevice;
      attribute vec3 aSmoothN;
      varying vec3 vWorld;
      varying vec3 vSmoothN;
      varying float vCrev;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vCrev = aCrevice;
        vSmoothN = aSmoothN;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLightDir, uLit, uSnow, uMid, uShadow, uDeep, uSky, uHaze;
      varying vec3 vWorld;
      varying vec3 vSmoothN;
      varying float vCrev;
      ${NOISE_GLSL}
      void main() {
        vec3 Nf = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        vec3 V = normalize(cameraPosition - vWorld);
        if (dot(Nf, V) < 0.0) Nf = -Nf;
        // Semi-flat shading: facets, softened by the smooth heightfield normal.
        vec3 N = normalize(mix(Nf, normalize(vSmoothN), 0.45));
        // Per-facet jitter from a coarse noise of the position.
        float jit = envNoise(vWorld.xz / 7.0 + vWorld.y / 9.0) - 0.5;
        float ndl = dot(N, uLightDir) + jit * 0.22;
        float lit = smoothstep(0.55, 0.95, ndl);
        float shade = smoothstep(0.36, -0.15, ndl);
        vec3 c = mix(uMid, uLit, lit);
        c = mix(c, uShadow, shade);
        // Upward faces catch the overcast sky (pale tops).
        c = mix(c, uSnow, smoothstep(0.75, 0.97, N.y) * 0.5);
        // Crevices and undersides: deep saturated blue.
        float cr = smoothstep(0.05, 0.55, vCrev);
        c = mix(c, uDeep, cr * 0.8);
        c = mix(c, uDeep, smoothstep(0.0, -0.5, N.y) * 0.6);
        // Darker towards the waterline.
        c *= 1.0 - 0.25 * smoothstep(40.0, 0.0, vWorld.y);
        // Fresnel rim picks up the sky.
        float fr = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
        c = mix(c, uSky, fr * 0.3);
        // Aerial perspective.
        c = mix(c, uHaze, 0.06);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
}
