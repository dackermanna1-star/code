// Procedurally sculpted iceberg for the backdrop.
//
// The berg is a heightfield over the sea plane: a ridge whose crest follows the
// silhouette of the original backdrop photo (traced as frame fractions), plus
// lower lobes in front, Voronoi "block" facets, ridged crevices and fbm lumps.
// It is rendered flat-shaded with a custom ice shader (blue depth tint,
// crevice darkening, fresnel rim, light from the upper left).
import * as THREE from 'three';
import { cellular, fbm, ridged, vnoise } from './noise';
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
  const depth = 0.42 * W;
  const z0 = -f.dist - depth * 0.5;
  const z1 = -f.dist + depth * 0.5;
  const nx = 300;
  const nz = 140;
  const cell = (x1 - x0) / nx;

  // Height at the crest for a given frame u, at distance d from the camera.
  const hAt = (v: number, d: number) => f.camH + (f.vh - v) * f.T * d;

  const H = new Float32Array((nx + 1) * (nz + 1));
  const idx = (i: number, j: number) => j * (nx + 1) + i;
  for (let j = 0; j <= nz; j++) {
    const z = z0 + ((z1 - z0) * j) / nz;
    const d = -z;
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      // Frame u seen from the camera for this column at this depth.
      const u = 0.5 + x / (f.T * f.aspect * d);
      // Crest line wanders in depth so the ridge is not a straight wall.
      const zc = -f.dist + 18 * (fbm(x / 160, 3.1, 3, 7) - 0.5) * 2 - 20;
      const dc = -zc;
      const crest = hAt(crestV(0.5 + x / (f.T * f.aspect * dc)), dc) - 6;
      const dzc = z - zc;
      // Front faces steep (~60 deg), back faces a bit gentler.
      const slope = dzc > 0 ? 1.55 + 0.6 * fbm(x / 90, 1.7, 3, 3) : 1.2;
      let h = crest - slope * Math.pow(Math.abs(dzc), 1.08);

      // Front lobes.
      for (const [lu, lv, ldz, lw] of LOBES) {
        const du = (u - lu) / lw;
        const zl = zc + ldz;
        const dzl = (z - zl) / 30;
        const r2 = du * du + dzl * dzl * 0.6;
        if (r2 < 4) {
          const lh = hAt(lv, d) - 12 * r2 - 26 * Math.max(0, Math.abs(du) - 0.6) * 1.0 - 1.4 * Math.max(0, z - zl);
          h = Math.max(h, lh);
        }
      }

      // Block facets: each Voronoi cell gets a tilted plane offset.
      const c = cellular(x / 34, z / 30, 11);
      const tiltX = (c.id - 0.5) * 0.9;
      const tiltZ = (vnoise(c.id * 97.0, 3.3, 5) - 0.5) * 0.9;
      h += (c.id - 0.5) * 16 + tiltX * (x / 34 - c.cx) * 34 * 0.5 + tiltZ * (z / 30 - c.cy) * 30 * 0.5;
      // Crack lines between blocks.
      h -= 7 * Math.max(0, 1 - (c.f2 - c.f1) * 6);

      // Vertical crevices (grooves running down the faces) + lumps.
      const rg = ridged(x / 22 + 0.15 * z / 22, z / 70, 4, 23);
      h -= 16 * (1 - rg) * (1 - rg);
      h += 22 * (fbm(x / 70, z / 55, 4, 41) - 0.5);
      h += 5 * (fbm(x / 9, z / 9, 2, 77) - 0.5);

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
      crev[idx(i, j)] = Math.max(0, Math.min(1, (s / n - H[idx(i, j)]) / 9));
    }
  }

  // Jittered grid -> irregular facets once flat shaded. Only keep cells that
  // reach above the sea (saves ~half the triangles).
  const pos: number[] = [];
  const cv: number[] = [];
  const vert = (i: number, j: number) => {
    const jx = (vnoise(i * 1.7, j * 2.3, 91) - 0.5) * cell * 0.7;
    const jz = (vnoise(i * 2.9, j * 1.3, 92) - 0.5) * cell * 0.7;
    const x = x0 + ((x1 - x0) * i) / nx + (i > 0 && i < nx ? jx : 0);
    const z = z0 + ((z1 - z0) * j) / nz + (j > 0 && j < nz ? jz : 0);
    return [x, H[idx(i, j)], z, crev[idx(i, j)]];
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
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCrevice', new THREE.Float32BufferAttribute(cv, 1));
  g.computeBoundingSphere();
  return g;
}

export function createIcebergMaterial(lightDir: THREE.Vector3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLightDir: { value: lightDir.clone().normalize() },
      uLit: { value: new THREE.Vector3(0.95, 1.2, 1.85) },
      uMid: { value: new THREE.Vector3(0.24, 0.33, 0.62) },
      uShadow: { value: new THREE.Vector3(0.085, 0.125, 0.25) },
      uDeep: { value: new THREE.Vector3(0.035, 0.05, 0.13) },
      uSky: { value: new THREE.Vector3(0.6, 0.58, 0.78) },
      uHaze: { value: new THREE.Vector3(0.62, 0.6, 0.78) },
    },
    vertexShader: /* glsl */ `
      attribute float aCrevice;
      varying vec3 vWorld;
      varying float vCrev;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vCrev = aCrevice;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLightDir, uLit, uMid, uShadow, uDeep, uSky, uHaze;
      varying vec3 vWorld;
      varying float vCrev;
      ${NOISE_GLSL}
      void main() {
        vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        vec3 V = normalize(cameraPosition - vWorld);
        if (dot(N, V) < 0.0) N = -N;
        float ndl = dot(N, uLightDir);
        float t = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
        // Per-facet brightness jitter from a coarse noise of the position.
        float jit = envNoise(vWorld.xz / 9.0 + vWorld.y / 13.0) - 0.5;
        t = clamp(t + jit * 0.16, 0.0, 1.0);
        vec3 c = mix(uShadow, uMid, smoothstep(0.18, 0.55, t));
        c = mix(c, uLit, smoothstep(0.55, 0.97, t));
        // Upward faces catch the overcast sky (snowy tops).
        c += uSky * 0.35 * smoothstep(0.55, 0.95, N.y);
        // Crevices: deep saturated blue.
        float cr = smoothstep(0.05, 0.75, vCrev);
        c = mix(c, uDeep, cr * 0.85);
        // Darker, bluer towards the waterline.
        float base = smoothstep(55.0, 0.0, vWorld.y);
        c *= 1.0 - 0.3 * base;
        // Fresnel rim picks up the sky.
        float fr = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
        c = mix(c, uSky, fr * 0.35);
        // Aerial perspective.
        c = mix(c, uHaze, 0.07);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
}
