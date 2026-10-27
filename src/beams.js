// Moonlight shafts through unboarded windows: additive (PS1 semi-transparency
// mode 1) prisms from the opening down to the floor patch, screen-door dithered.
import * as THREE from 'three';

const vert = /* glsl */ `
in float aFade;
uniform vec2 uSnap;
uniform float uFogNear;
uniform float uFogFar;
out float vFade;
void main() {
  vec4 vp = viewMatrix * modelMatrix * vec4(position, 1.0);
  vec4 cp = projectionMatrix * vp;
  if (cp.w > 0.0) {
    vec2 ndc = floor(cp.xy / cp.w * uSnap + 0.5) / uSnap;
    cp.xy = ndc * cp.w;
  }
  gl_Position = cp;
  vFade = aFade * (1.0 - smoothstep(uFogNear, uFogFar, -vp.z));
}
`;

const frag = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
in float vFade;
out vec4 fragColor;
void main() {
  // dust: slow drifting value noise, then a 2x2 screen-door so it reads as dithered
  vec2 p = floor(gl_FragCoord.xy);
  float n = fract(sin(dot(floor(p / 3.0) + floor(uTime * 2.0), vec2(12.9898, 78.233))) * 43758.5453);
  float a = vFade * (0.75 + 0.25 * n);
  if (mod(p.x + p.y, 2.0) > 0.5 && a < 0.5) discard;
  fragColor = vec4(uColor * a, 1.0);
}
`;

export function buildBeams(level) {
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(0.15, 0.18, 0.27) },
      uSnap: { value: new THREE.Vector2(160, 120) },
      uFogNear: { value: 2.5 },
      uFogFar: { value: 17 },
      uTime: { value: 0 },
    },
  });
  const meshes = [];
  for (const k of [-1, 0, 1]) {
    const m = buildFloor(level, k, material);
    if (m) meshes.push(m);
  }
  return { meshes, material };
}

function buildFloor(level, k, material) {
  const pos = [];
  const fade = [];
  const quad = (a, b, c, d, fa, fb, fc, fd) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    fade.push(fa, fb, fc, fa, fc, fd);
  };
  for (const w of level.windows) {
    if (w.k !== k) continue;
    if (w.boarded || w.hi - w.lo < 0.5) continue;
    const base = w.k * 4;
    const nx = w.nx, nz = w.nz;
    // inner face of the opening
    const inner = w.axis === 'x' ? (nz > 0 ? w.z1 : w.z0) : nx > 0 ? w.x1 : w.x0;
    const a0 = w.axis === 'x' ? w.x0 + 0.05 : w.z0 + 0.05;
    const a1 = w.axis === 'x' ? w.x1 - 0.05 : w.z1 - 0.05;
    const P = (along, out, y) => (w.axis === 'x' ? [along, y, inner + nz * out] : [inner + nx * out, y, along]);
    const slope = 0.88; // inward run per metre of drop
    const yT = base + w.hi, yB = base + w.lo;
    const dT = w.hi * slope, dB = w.lo * slope;
    const i = 0.55; // intensity at the window
    // top and bottom sheets, then the two sides
    quad(P(a0, 0, yT), P(a1, 0, yT), P(a1, dT, base + 0.02), P(a0, dT, base + 0.02), i, i, 0, 0);
    quad(P(a0, 0, yB), P(a1, 0, yB), P(a1, dB, base + 0.02), P(a0, dB, base + 0.02), i, i, 0.05, 0.05);
    quad(P(a0, 0, yB), P(a0, 0, yT), P(a0, dT, base + 0.02), P(a0, dB, base + 0.02), i, i, 0, 0.05);
    quad(P(a1, 0, yT), P(a1, 0, yB), P(a1, dB, base + 0.02), P(a1, dT, base + 0.02), i, i, 0.05, 0);
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.userData.k = k;
  return mesh;
}
