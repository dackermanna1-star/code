// Ice-floe meshes for the gameplay layer: the top surface (custom ice
// material), vertical cliff walls down past the waterline, the black outline
// strokes (top edges + visible vertical corners) and a strip of sea in front.
import * as THREE from 'three';
import { FLOE_BACK, FLOE_BOTTOM_Y, FLOE_FRONT, FLOE_OUTLINE, FLOE_TOP_Y, WATER_LEVEL, type XZ } from '../../config/field';
import { NOISE_GLSL } from './glsl';
import { buildLineGeometry, createLineMaterial, type Segment } from './Lines';

/** Outline stroke width as a fraction of the frame height (2 px at 960 px). */
export const OUTLINE_WIDTH = 2.3 / 960;

export function buildFloeTopGeometry(outline: XZ[] = FLOE_OUTLINE): THREE.BufferGeometry {
  const contour = outline.map(([x, z]) => new THREE.Vector2(x, z));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos: number[] = [];
  for (const [a, b, c] of tris) {
    const [ax, az] = outline[a];
    const [bx, bz] = outline[b];
    const [cx, cz] = outline[c];
    // Up-facing winding: (b - a) x (c - a) must point to +y.
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const order = ny >= 0 ? [a, b, c] : [a, c, b];
    for (const k of order) pos.push(outline[k][0], FLOE_TOP_Y, outline[k][1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.computeBoundingSphere();
  return g;
}

/** Outward horizontal normal of outline edge a -> b (CCW from above). */
function edgeNormal(a: XZ, b: XZ): [number, number] {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  return [-dz / len, dx / len];
}

export function buildFloeWallGeometry(outline: XZ[] = FLOE_OUTLINE): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const [nx, nz] = edgeNormal(a, b);
    const A = [a[0], FLOE_TOP_Y, a[1]];
    const B = [b[0], FLOE_TOP_Y, b[1]];
    const Ab = [a[0], FLOE_BOTTOM_Y, a[1]];
    const Bb = [b[0], FLOE_BOTTOM_Y, b[1]];
    // Outward facing: (A, Ab, B), (B, Ab, Bb).
    for (const p of [A, Ab, B, B, Ab, Bb]) {
      pos.push(p[0], p[1], p[2]);
      nrm.push(nx, 0, nz);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.computeBoundingSphere();
  return g;
}

/** Top-edge strokes along the back and front edges. */
export function buildEdgeSegments(): Segment[] {
  const segs: Segment[] = [];
  for (const edge of [FLOE_BACK, FLOE_FRONT]) {
    for (let i = 0; i + 1 < edge.length; i++) {
      segs.push([
        new THREE.Vector3(edge[i][0], FLOE_TOP_Y, edge[i][1]),
        new THREE.Vector3(edge[i + 1][0], FLOE_TOP_Y, edge[i + 1][1]),
      ]);
    }
  }
  return segs;
}

/**
 * Vertical corner strokes: every outline vertex where at least one adjacent
 * wall faces the camera (creases and silhouettes). Hidden parts are removed
 * by the depth test.
 */
export function buildCornerSegments(cameraPos: THREE.Vector3, outline: XZ[] = FLOE_OUTLINE): Segment[] {
  const segs: Segment[] = [];
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const v = outline[i];
    if (Math.abs(Math.abs(v[0]) - 30) < 1e-3) continue; // far ends, off-screen
    const prev = outline[(i - 1 + n) % n];
    const next = outline[(i + 1) % n];
    const cx = cameraPos.x - v[0];
    const cz = cameraPos.z - v[1];
    const n1 = edgeNormal(prev, v);
    const n2 = edgeNormal(v, next);
    const f1 = n1[0] * cx + n1[1] * cz > 0;
    const f2 = n2[0] * cx + n2[1] * cz > 0;
    if (!f1 && !f2) continue;
    segs.push([new THREE.Vector3(v[0], FLOE_TOP_Y, v[1]), new THREE.Vector3(v[0], FLOE_BOTTOM_Y, v[1])]);
  }
  return segs;
}

/**
 * Cliff walls: grey-blue ice with horizontal water-like streaks. Faces turned
 * towards the light (left) are pale, faces turned right are darker, like the
 * original's front cliffs.
 */
export function createCliffMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLight: { value: new THREE.Vector3(0.5, 0.74, 1.15) },
      uDark: { value: new THREE.Vector3(0.12, 0.17, 0.25) },
      uWater: { value: WATER_LEVEL },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight, uDark;
      uniform float uWater;
      varying vec3 vWorld;
      varying vec3 vNormal;
      ${NOISE_GLSL}
      void main() {
        vec3 n = normalize(vNormal);
        float k = smoothstep(0.12, -0.16, n.x);
        // Walls on the far side (the notch) catch the bright sky over the berg.
        k = max(k, 0.65 * smoothstep(-10.0, -13.0, vWorld.z));
        // Along-face coordinate.
        vec2 t = normalize(vec2(-n.z, n.x));
        float s = dot(vWorld.xz, t);
        float streak = envFbm3(vec2(s * 0.16, vWorld.y * 2.6));
        float blob = envFbm3(vec2(s * 0.09 + 4.0, vWorld.y * 0.7));
        vec3 c = mix(uDark, uLight, k);
        c *= 0.78 + 0.42 * streak;
        c *= 0.8 + 0.4 * smoothstep(0.25, 0.75, blob);
        // Bright sky glint towards the bottom of pale faces, darker under water.
        c += uLight * 0.25 * k * smoothstep(-1.0, -3.0, vWorld.y) * streak;
        c *= vWorld.y < uWater ? 0.55 : 1.0;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Sea strip in front of the floe (normally below the frame; there for safety). */
export function createFrontSea(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(200, 120);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, WATER_LEVEL, 70);
  const mat = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      ${NOISE_GLSL}
      void main() {
        float r = envFbm3(vWorld.xz * vec2(0.08, 0.5));
        vec3 c = mix(vec3(0.07, 0.09, 0.14), vec3(0.3, 0.38, 0.55), r);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'FrontSea';
  return m;
}

export function createOutlineMeshes(cameraPos: THREE.Vector3): THREE.Mesh[] {
  const edges = new THREE.Mesh(buildLineGeometry(buildEdgeSegments()), createLineMaterial(OUTLINE_WIDTH, 0x000000, 0.25));
  edges.name = 'FloeEdgeLines';
  const corners = new THREE.Mesh(
    buildLineGeometry(buildCornerSegments(cameraPos)),
    createLineMaterial(OUTLINE_WIDTH, 0x000000, 0.12),
  );
  corners.name = 'FloeCornerLines';
  for (const m of [edges, corners]) {
    m.frustumCulled = false;
    m.renderOrder = 1;
  }
  return [edges, corners];
}
