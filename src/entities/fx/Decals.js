// Surface decals (blood splats / drips / pools, bullet holes, scorch marks) in ONE BufferGeometry ring buffer.
// Each quad is oriented to the surface normal, slightly offset, randomly rotated, lit with LIGHTING_GLSL using
// the voxel light baked at placement time. Blood pools grow over time; the oldest decals fade out gently.
import * as THREE from 'three';
import { LIGHTING_GLSL, globalUniforms } from '../../render/materials.js';

const VERT = /* glsl */ `
in vec4 aFrame;   // u0, v0 (from top), du, dv
in vec2 aCorner;  // -1..1
in vec4 aColor;
in vec3 aLight;   // sky, block, kind (1 = blood)
in vec3 aTime;    // birth, grow duration, slot
uniform float uTime;
uniform float uHead;
uniform float uCount;
out vec2 vCorner;
out vec4 vFrame;
out vec4 vColor;
out vec3 vLight;
out vec3 vWorldPos;
out vec3 vNormal;
out float vGrow;
out float vAge;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normal;
  vCorner = aCorner;
  vFrame = aFrame;
  vColor = aColor;
  vLight = aLight;
  float age = uTime - aTime.x;
  vAge = age;
  vGrow = aTime.y > 0.0 ? clamp(age / aTime.y, 0.0, 1.0) : 1.0;
  vGrow = 1.0 - (1.0 - vGrow) * (1.0 - vGrow); // ease out
  vGrow = max(vGrow, 0.08);
  // gentle fade of the oldest decals (about to be recycled)
  float rank = mod(aTime.z - uHead + uCount, uCount);
  vColor.a *= clamp(rank / 48.0, 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const FRAG = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
uniform sampler2D map;
in vec2 vCorner;
in vec4 vFrame;
in vec4 vColor;
in vec3 vLight;
in vec3 vWorldPos;
in vec3 vNormal;
in float vGrow;
in float vAge;
out vec4 fragColor;
void main() {
  vec2 l = vCorner / vGrow * 0.5 + 0.5;
  if (l.x < 0.0 || l.y < 0.0 || l.x > 1.0 || l.y > 1.0) discard;
  vec2 uv = vec2(vFrame.x + l.x * vFrame.z, 1.0 - (vFrame.y + (1.0 - l.y) * vFrame.w));
  vec4 t = texture(map, uv);
  float a = t.a * vColor.a;
  if (a < 0.02) discard;
  vec3 albedo = t.rgb * vColor.rgb;
  vec3 n = normalize(vNormal);
  vec3 lit = computeLighting(vWorldPos, n, vLight.x, vLight.y, 1.0);
  vec3 col = albedo * lit;
  if (vLight.z > 0.5) {
    // blood: darkens / browns as it dries; fresh blood has a wet glint
    float dry = clamp(vAge / 120.0, 0.0, 1.0);
    col *= mix(vec3(1.0), vec3(0.62, 0.55, 0.5), dry);
    vec3 V = normalize(uCamPos - vWorldPos);
    float sp = pow(max(dot(reflect(-uSunDir, n), V), 0.0), 40.0) * (1.0 - dry) * 0.6;
    col += uSunColor * sp * smoothstep(0.5, 0.95, vLight.x) * t.a;
  }
  col = applyFog(col, vWorldPos);
  fragColor = vec4(col, a);
}
`;

export class Decals {
  constructor(scene, map, max = 600) {
    this.max = max;
    this.head = 0; // next slot to write
    this.count = 0;
    const nv = max * 4;
    const g = new THREE.BufferGeometry();
    const mk = (name, n) => {
      const a = new THREE.BufferAttribute(new Float32Array(nv * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    this.aPosition = mk('position', 3);
    this.aNormal = mk('normal', 3);
    this.aFrame = mk('aFrame', 4);
    this.aCorner = mk('aCorner', 2);
    this.aColor = mk('aColor', 4);
    this.aLight = mk('aLight', 3);
    this.aTime = mk('aTime', 3);
    const idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) {
      const b = i * 4;
      idx.set([b, b + 2, b + 1, b, b + 3, b + 2], i * 6);
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { ...globalUniforms, map: { value: map }, uHead: { value: 0 }, uCount: { value: max } },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -6,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'fx_decals';
    scene.add(this.mesh);
    this.dirtyMin = Infinity; this.dirtyMax = -1;
  }

  clear() {
    this.head = 0; this.count = 0;
    this.geo.setDrawRange(0, 0);
    this.aColor.array.fill(0);
    this.dirtyMin = 0; this.dirtyMax = this.max - 1;
  }

  /**
   * Add a decal. frame [u0,v0,du,dv]; n axis-aligned or arbitrary unit normal; size in metres;
   * color [r,g,b,a]; sky/block 0..1; grow seconds (0 = instant); kind 1 = blood.
   */
  add(x, y, z, nx, ny, nz, size, rot, frame, r, g, b, a, sky, block, grow, kind, time, stretchY = 1) {
    const slot = this.head;
    this.head = (this.head + 1) % this.max;
    if (this.count < this.max) this.count++;
    // tangent basis
    let tx, ty, tz;
    if (Math.abs(ny) > 0.9) { tx = 1; ty = 0; tz = 0; } else { tx = -nz; ty = 0; tz = nx; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; }
    // bitangent = t × n (points up on walls, so drips run downwards); winding is reversed to match
    let bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
    // rotate around n (walls keep "down" for drips when rot = 0)
    const c = Math.cos(rot), s = Math.sin(rot);
    const t2x = tx * c + bx * s, t2y = ty * c + by * s, t2z = tz * c + bz * s;
    const b2x = bx * c - tx * s, b2y = by * c - ty * s, b2z = bz * c - tz * s;
    const h = size * 0.5, hv = h * stretchY;
    const off = 0.006 + (slot % 7) * 0.0012;
    const ox = x + nx * off, oy = y + ny * off, oz = z + nz * off;
    const P = this.aPosition.array, N = this.aNormal.array, Fr = this.aFrame.array, Co = this.aCorner.array, C = this.aColor.array, L = this.aLight.array, T = this.aTime.array;
    const corners = CORNERS;
    for (let k = 0; k < 4; k++) {
      const cx = corners[k * 2], cy = corners[k * 2 + 1];
      const v = slot * 4 + k;
      // corner (cx, cy): cx along t, cy along b (cy = +1 is "up" of the texture)
      P[v * 3] = ox + t2x * cx * h + b2x * cy * hv;
      P[v * 3 + 1] = oy + t2y * cx * h + b2y * cy * hv;
      P[v * 3 + 2] = oz + t2z * cx * h + b2z * cy * hv;
      N[v * 3] = nx; N[v * 3 + 1] = ny; N[v * 3 + 2] = nz;
      Fr[v * 4] = frame[0]; Fr[v * 4 + 1] = frame[1]; Fr[v * 4 + 2] = frame[2]; Fr[v * 4 + 3] = frame[3];
      Co[v * 2] = cx; Co[v * 2 + 1] = cy;
      C[v * 4] = r; C[v * 4 + 1] = g; C[v * 4 + 2] = b; C[v * 4 + 3] = a;
      L[v * 3] = sky; L[v * 3 + 1] = block; L[v * 3 + 2] = kind;
      T[v * 3] = time; T[v * 3 + 1] = grow; T[v * 3 + 2] = slot;
    }
    if (slot < this.dirtyMin) this.dirtyMin = slot;
    if (slot > this.dirtyMax) this.dirtyMax = slot;
    return slot;
  }

  update() {
    this.material.uniforms.uHead.value = this.head;
    this.geo.setDrawRange(0, this.count * 6);
    if (this.dirtyMax < 0) return;
    const s = this.dirtyMin, e = this.dirtyMax;
    for (const a of [this.aPosition, this.aNormal, this.aFrame, this.aCorner, this.aColor, this.aLight, this.aTime]) {
      a.clearUpdateRanges();
      a.addUpdateRange(s * 4 * a.itemSize, (e - s + 1) * 4 * a.itemSize);
      a.needsUpdate = true;
    }
    this.dirtyMin = Infinity; this.dirtyMax = -1;
  }
}
const CORNERS = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
