// Sky and weather for the levels, drawn the same low-fi way as the world (15-bit colour with
// the PS1 dither): a gradient dome with an optional sun or moon, stars and drifting clouds; a
// band of distant silhouettes around the horizon (mountains, a skyline, a far wall); and rain,
// snow or dust that falls around the camera.
//
// sky:     { top, horizon, ground, curve, sun: { dir, color, size, halo }, stars, clouds: { layer, color, amount, speed, scale },
//            band: { layer, color, repeat, top, bottom, fog } }
// weather: { kind: 'rain' | 'snow' | 'dust' | 'ash', amount 0..1, color: [r,g,b,a], fall, wind: [x,z], size }
const DITHER = `
const float BAYER[16] = float[16](-4.0, 0.0, -3.0, 1.0, 2.0, -2.0, 3.0, -1.0, -3.0, 1.0, -4.0, 0.0, 3.0, -1.0, 2.0, -2.0);
uniform float uDither;
uniform float uSat;
uniform vec3 uTint;
vec3 psx(vec3 c) {
  c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, uSat) * uTint;
  ivec2 p = ivec2(gl_FragCoord.xy) & 3;
  float d = BAYER[p.y * 4 + p.x] * uDither;
  return floor(clamp(c * 255.0 + d, 0.0, 255.0) / 8.0) / 31.0;
}`;

const SKY_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uVP;
uniform vec3 uCam;
out vec3 vDir;
void main() {
  vDir = aPos;
  vec4 p = uVP * vec4(uCam + aPos * 60.0, 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
}`;

const SKY_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec3 vDir;
out vec4 outColor;
uniform vec3 uTop, uHorizon, uGround;
uniform float uCurve;
uniform vec3 uSunDir, uSunColor;
uniform float uSunSize, uSunHalo;
uniform float uStars, uTime;
uniform sampler2DArray uTex;
uniform float uCloudLayer, uCloudAmount, uCloudSpeed, uCloudScale;
uniform vec3 uCloudColor;
${DITHER}
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h >= 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), uCurve)) : mix(uHorizon, uGround, clamp(-h * 5.0, 0.0, 1.0));
  if (uStars > 0.0 && h > 0.04) {
    vec3 cell = floor(d * 140.0);
    float s = hash(cell);
    if (s > 1.0 - uStars * 0.012) col = mix(col, vec3(0.95, 0.94, 0.88), (0.5 + 0.5 * sin(uTime * (1.0 + s * 3.0) + s * 40.0)) * smoothstep(0.04, 0.25, h));
  }
  if (uCloudAmount > 0.0 && h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * uCloudScale + vec2(uTime * uCloudSpeed, uTime * uCloudSpeed * 0.37);
    vec4 t = texture(uTex, vec3(uv, uCloudLayer));
    float a = t.r * uCloudAmount * smoothstep(0.0, 0.18, h);
    col = mix(col, uCloudColor * (0.7 + 0.3 * t.g), clamp(a, 0.0, 1.0));
  }
  if (uSunSize > 0.0) {
    float s = dot(d, normalize(uSunDir));
    col += uSunColor * pow(max(s, 0.0), 18.0) * uSunHalo;
    if (s > cos(uSunSize)) col = uSunColor;
  }
  outColor = vec4(psx(col), 1.0);
}`;

const BAND_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
uniform mat4 uVP;
uniform vec3 uCam;
out vec2 vUV;
out float vH;
void main() {
  vUV = aUV;
  vH = aPos.y;
  vec4 p = uVP * vec4(uCam + aPos * 58.0, 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
}`;

const BAND_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 vUV;
in float vH;
out vec4 outColor;
uniform sampler2DArray uTex;
uniform float uLayer, uFogK;
uniform vec3 uColor, uHorizon;
${DITHER}
void main() {
  vec4 t = texture(uTex, vec3(vUV, uLayer));
  if (t.a < 0.5) discard;
  vec3 c = mix(t.rgb * uColor, uHorizon, uFogK);
  outColor = vec4(psx(c), 1.0);
}`;

const WX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aSeed;
layout(location=1) in vec2 aCorner;
uniform mat4 uVP;
uniform vec3 uCam, uRight, uBox;
uniform float uTime, uFall, uSize, uKind, uLen;
uniform vec2 uWind;
out vec2 vC;
void main() {
  vec3 p = aSeed * uBox;
  p.y -= uTime * uFall * (0.8 + 0.4 * aSeed.x);
  p.xz += uWind * uTime;
  if (uKind > 0.5) p.xz += vec2(sin(uTime * 0.9 + aSeed.z * 30.0), cos(uTime * 0.7 + aSeed.x * 20.0)) * 0.35;
  vec3 org = uCam - uBox * 0.5;
  p = mod(p - org, uBox) + org;
  vec3 up = uKind < 0.5 ? normalize(vec3(-uWind.x, uFall, -uWind.y)) : vec3(0.0, 1.0, 0.0);
  float len = uKind < 0.5 ? uLen : uSize;
  p += uRight * aCorner.x * uSize + up * aCorner.y * len;
  vC = aCorner;
  gl_Position = uVP * vec4(p, 1.0);
}`;

const WX_FS = `#version 300 es
precision highp float;
in vec2 vC;
out vec4 outColor;
uniform vec4 uColor;
uniform float uKind;
${DITHER}
void main() {
  if (uKind > 0.5 && dot(vC, vC) > 1.0) discard;
  outColor = vec4(psx(uColor.rgb), uColor.a);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('sky shader: ' + gl.getShaderInfoLog(s));
  return s;
}
function program(gl, vs, fs, names) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('sky link: ' + gl.getProgramInfoLog(p));
  const u = {};
  for (const n of names) u[n] = gl.getUniformLocation(p, n);
  return { p, u };
}

const COMMON = ['uVP', 'uCam', 'uDither', 'uSat', 'uTint'];
const WX_COUNT = 1400;

export class SkyFx {
  constructor(r) {
    this.r = r;
    const gl = (this.gl = r.gl);
    this.sky = program(gl, SKY_VS, SKY_FS, [...COMMON, 'uTop', 'uHorizon', 'uGround', 'uCurve', 'uSunDir', 'uSunColor', 'uSunSize', 'uSunHalo', 'uStars', 'uTime', 'uTex', 'uCloudLayer', 'uCloudAmount', 'uCloudSpeed', 'uCloudScale', 'uCloudColor']);
    this.band = program(gl, BAND_VS, BAND_FS, [...COMMON, 'uTex', 'uLayer', 'uFogK', 'uColor', 'uHorizon']);
    this.wx = program(gl, WX_VS, WX_FS, [...COMMON, 'uRight', 'uBox', 'uTime', 'uFall', 'uSize', 'uKind', 'uLen', 'uWind', 'uColor']);
    this.domeMesh = this.makeDome();
    this.bandMeshes = new Map();
    this.wxMesh = this.makeWeather();
  }

  makeDome() {
    const gl = this.gl, pos = [], idx = [];
    const SEG = 24, RING = 12;
    for (let j = 0; j <= RING; j++) {
      const el = -0.5 + (j / RING) * (Math.PI / 2 + 0.5);
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        pos.push(Math.cos(el) * Math.sin(a), Math.sin(el), -Math.cos(el) * Math.cos(a));
      }
    }
    for (let j = 0; j < RING; j++) for (let i = 0; i < SEG; i++) {
      const a = j * (SEG + 1) + i, b = a + SEG + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    return this.upload([[0, 3, new Float32Array(pos)]], new Uint16Array(idx));
  }

  // a ring of quads from elevation `bottom` to `top` (tangents of the angle), texture repeated
  makeBand(repeat, top, bottom) {
    const key = repeat + ':' + top + ':' + bottom;
    if (this.bandMeshes.has(key)) return this.bandMeshes.get(key);
    const pos = [], uv = [], idx = [];
    const SEG = 48;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2, s = Math.sin(a), c = -Math.cos(a);
      const u = (i / SEG) * repeat;
      pos.push(s, bottom, c, s, top, c);
      uv.push(u, 1, u, 0);
    }
    for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    const m = this.upload([[0, 3, new Float32Array(pos)], [1, 2, new Float32Array(uv)]], new Uint16Array(idx));
    this.bandMeshes.set(key, m);
    return m;
  }

  makeWeather() {
    const seed = [], corner = [], idx = [];
    let s = 12345;
    const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let k = 0; k < WX_COUNT; k++) {
      const x = rnd(), y = rnd(), z = rnd();
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { seed.push(x, y, z); corner.push(cx, cy); }
      const b = k * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    return this.upload([[0, 3, new Float32Array(seed)], [1, 2, new Float32Array(corner)]], new Uint16Array(idx));
  }

  upload(attrs, idx) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    for (const [loc, n, data] of attrs) {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0);
    }
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: idx.length };
  }

  common(P, cam, grade) {
    const gl = this.gl, r = this.r;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uVP, false, r.vp);
    gl.uniform3f(P.u.uCam, cam.x, cam.y, cam.z);
    gl.uniform1f(P.u.uDither, r.dither ? 1 : 0);
    gl.uniform1f(P.u.uSat, grade.sat);
    gl.uniform3f(P.u.uTint, grade.tint[0], grade.tint[1], grade.tint[2]);
  }

  // texture layer numbers live in up to four arrays; the sky samples only the first one
  layerUnit(layer) { return layer; }

  // before the world: the dome and the horizon band (no depth writes; everything draws over them)
  drawSky(cam, sky, time, grade) {
    if (!sky) return;
    const gl = this.gl;
    const cull = gl.isEnabled(gl.CULL_FACE);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.BLEND);
    const P = this.sky;
    this.common(P, cam, grade);
    const u = P.u;
    const v3 = (loc, a, d) => { const x = a || d; gl.uniform3f(loc, x[0], x[1], x[2]); };
    v3(u.uTop, sky.top, [0.2, 0.25, 0.35]);
    v3(u.uHorizon, sky.horizon, [0.5, 0.5, 0.5]);
    v3(u.uGround, sky.ground || sky.horizon, [0.3, 0.3, 0.3]);
    gl.uniform1f(u.uCurve, sky.curve ?? 0.55);
    const sun = sky.sun;
    gl.uniform1f(u.uSunSize, sun ? sun.size ?? 0.05 : 0);
    v3(u.uSunDir, sun && sun.dir, [0, 1, 0]);
    v3(u.uSunColor, sun && sun.color, [1, 1, 1]);
    gl.uniform1f(u.uSunHalo, sun ? sun.halo ?? 0.35 : 0);
    gl.uniform1f(u.uStars, sky.stars || 0);
    gl.uniform1f(u.uTime, time);
    const cl = sky.clouds;
    gl.uniform1i(u.uTex, 0);
    gl.uniform1f(u.uCloudAmount, cl && cl.layerIndex >= 0 ? cl.amount ?? 0.6 : 0);
    gl.uniform1f(u.uCloudLayer, cl && cl.layerIndex >= 0 ? cl.layerIndex : 0);
    gl.uniform1f(u.uCloudSpeed, cl ? cl.speed ?? 0.004 : 0);
    gl.uniform1f(u.uCloudScale, cl ? cl.scale ?? 0.35 : 0.35);
    v3(u.uCloudColor, cl && cl.color, [0.8, 0.8, 0.8]);
    gl.bindVertexArray(this.domeMesh.vao);
    gl.drawElements(gl.TRIANGLES, this.domeMesh.count, gl.UNSIGNED_SHORT, 0);
    const bd = sky.band;
    if (bd && bd.layerIndex >= 0) {
      const B = this.band;
      this.common(B, cam, grade);
      gl.uniform1i(B.u.uTex, 0);
      gl.uniform1f(B.u.uLayer, bd.layerIndex);
      gl.uniform1f(B.u.uFogK, bd.fog ?? 0.45);
      v3(B.u.uColor, bd.color, [1, 1, 1]);
      v3(B.u.uHorizon, sky.horizon, [0.5, 0.5, 0.5]);
      const m = this.makeBand(bd.repeat || 8, bd.top ?? 0.12, bd.bottom ?? -0.02);
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    if (cull) gl.enable(gl.CULL_FACE);
  }

  // after the opaque world: falling particles around the camera
  drawWeather(cam, wx, time, grade) {
    if (!wx || !(wx.amount > 0)) return;
    const gl = this.gl;
    const P = this.wx, u = P.u;
    this.common(P, cam, grade);
    const kind = wx.kind === 'rain' ? 0 : 1;
    const rx = Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
    gl.uniform3f(u.uRight, rx, 0, rz);
    const box = wx.kind === 'rain' ? [22, 14, 22] : [16, 10, 16];
    gl.uniform3f(u.uBox, box[0], box[1], box[2]);
    gl.uniform1f(u.uTime, time);
    const fall = wx.fall ?? (wx.kind === 'rain' ? 9 : wx.kind === 'snow' ? 1.1 : wx.kind === 'ash' ? 0.6 : 0.08);
    gl.uniform1f(u.uFall, fall);
    gl.uniform1f(u.uSize, wx.size ?? (wx.kind === 'rain' ? 0.012 : wx.kind === 'snow' ? 0.035 : 0.018));
    gl.uniform1f(u.uLen, wx.len ?? 0.35);
    gl.uniform1f(u.uKind, kind);
    const w = wx.wind || [0, 0];
    gl.uniform2f(u.uWind, w[0], w[1]);
    const c = wx.color || (wx.kind === 'rain' ? [0.62, 0.66, 0.72, 0.45] : wx.kind === 'snow' ? [0.92, 0.93, 0.95, 0.85] : [0.9, 0.86, 0.7, 0.5]);
    gl.uniform4f(u.uColor, c[0], c[1], c[2], c[3]);
    const cull = gl.isEnabled(gl.CULL_FACE);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.bindVertexArray(this.wxMesh.vao);
    const n = Math.max(1, Math.min(WX_COUNT, Math.round(WX_COUNT * Math.min(1, wx.amount))));
    gl.drawElements(gl.TRIANGLES, n * 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    if (cull) gl.enable(gl.CULL_FACE);
  }
}
