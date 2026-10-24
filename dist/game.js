"use strict";(()=>{var ze=Object.defineProperty;var Be=(a,e,t)=>e in a?ze(a,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):a[e]=t;var c=(a,e,t)=>Be(a,typeof e!="symbol"?e+"":e,t);var I=class{constructor(e,t,r,s){this.gl=e;this.name=s;c(this,"prog");c(this,"locs",new Map);this.prog=Ne(e,t,r,s)}use(){return this.gl.useProgram(this.prog),this}loc(e){let t=this.locs.get(e);return t===void 0&&(t=this.gl.getUniformLocation(this.prog,e),this.locs.set(e,t)),t}i(e,t){return this.gl.uniform1i(this.loc(e),t),this}u(e,t){return this.gl.uniform1ui(this.loc(e),t),this}f(e,t){return this.gl.uniform1f(this.loc(e),t),this}f2(e,t,r){return this.gl.uniform2f(this.loc(e),t,r),this}f3(e,t,r,s){return this.gl.uniform3f(this.loc(e),t,r,s),this}f4(e,t,r,s,n){return this.gl.uniform4f(this.loc(e),t,r,s,n),this}v3(e,t){return this.gl.uniform3f(this.loc(e),t[0],t[1],t[2]),this}fv(e,t){return this.gl.uniform1fv(this.loc(e),t),this}f4v(e,t){return this.gl.uniform4fv(this.loc(e),t),this}m4(e,t){return this.gl.uniformMatrix4fv(this.loc(e),!1,t),this}m4v(e,t){return this.gl.uniformMatrix4fv(this.loc(e),!1,t),this}tex(e,t,r,s=this.gl.TEXTURE_2D){let n=this.gl;return n.activeTexture(n.TEXTURE0+t),n.bindTexture(s,r),n.uniform1i(this.loc(e),t),this}};function oe(a,e,t,r){let s=a.createShader(e);if(a.shaderSource(s,t),a.compileShader(s),!a.getShaderParameter(s,a.COMPILE_STATUS)){let n=a.getShaderInfoLog(s)||"",i=t.split(`
`).map((h,u)=>`${String(u+1).padStart(4)}: ${h}`),o=/ERROR: \d+:(\d+)/.exec(n),l="";if(o){let h=parseInt(o[1],10);l=i.slice(Math.max(0,h-4),h+2).join(`
`)}throw new Error(`Shader compile error in ${r} (${e===a.VERTEX_SHADER?"vs":"fs"}):
${n}
${l}`)}return s}function Ne(a,e,t,r){let s=a.createProgram();if(a.attachShader(s,oe(a,a.VERTEX_SHADER,e,r)),a.attachShader(s,oe(a,a.FRAGMENT_SHADER,t,r)),a.linkProgram(s),!a.getProgramParameter(s,a.LINK_STATUS))throw new Error(`Program link error in ${r}: ${a.getProgramInfoLog(s)}`);return s}function q(a,e,t,r,s,n,i={},o=null){let l=a.createTexture();a.bindTexture(a.TEXTURE_2D,l),a.texImage2D(a.TEXTURE_2D,0,r,e,t,0,s,n,o);let h=i.filter??a.LINEAR;a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MIN_FILTER,i.mips?a.LINEAR_MIPMAP_LINEAR:h),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MAG_FILTER,h);let u=i.wrap??a.CLAMP_TO_EDGE;return a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_S,u),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_T,u),i.compare&&(a.texParameteri(a.TEXTURE_2D,a.TEXTURE_COMPARE_MODE,a.COMPARE_REF_TO_TEXTURE),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_COMPARE_FUNC,a.LEQUAL)),l}function bt(a,e,t,r=-1){let s=a.createFramebuffer();a.bindFramebuffer(a.FRAMEBUFFER,s);let n=[];e.forEach((o,l)=>{a.framebufferTexture2D(a.FRAMEBUFFER,a.COLOR_ATTACHMENT0+l,a.TEXTURE_2D,o,0),n.push(a.COLOR_ATTACHMENT0+l)}),t&&(r>=0?a.framebufferTextureLayer(a.FRAMEBUFFER,a.DEPTH_ATTACHMENT,t,0,r):a.framebufferTexture2D(a.FRAMEBUFFER,a.DEPTH_ATTACHMENT,a.TEXTURE_2D,t,0)),a.drawBuffers(n.length?n:[a.NONE]),n.length||a.readBuffer(a.NONE);let i=a.checkFramebufferStatus(a.FRAMEBUFFER);if(i!==a.FRAMEBUFFER_COMPLETE)throw new Error("Framebuffer incomplete: 0x"+i.toString(16));return a.bindFramebuffer(a.FRAMEBUFFER,null),s}var W=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
precision highp sampler2DArray;
precision highp sampler2DArrayShadow;
precision highp sampler3D;
`,J=W+`
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;var ct=48,K=4,le=`
uniform highp usampler2D uQuads;
uniform highp sampler2D uXforms;
const vec3 FN[6] = vec3[6](vec3(1,0,0), vec3(-1,0,0), vec3(0,1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1));
const vec3 FU[6] = vec3[6](vec3(0,1,0), vec3(0,0,1), vec3(0,0,1), vec3(1,0,0), vec3(1,0,0), vec3(0,1,0));
const vec3 FV[6] = vec3[6](vec3(0,0,1), vec3(0,1,0), vec3(1,0,0), vec3(0,0,1), vec3(0,1,0), vec3(1,0,0));
const vec2 CORNER[6] = vec2[6](vec2(0,0), vec2(1,0), vec2(0,1), vec2(0,1), vec2(1,0), vec2(1,1));

struct Quad { vec3 lp; vec3 n; vec2 uv; uint pal; uint ao; uint slot; int face; };

Quad decodeQuad(int vid) {
  int qi = vid / 6;
  int ci = vid - qi * 6;
  uvec4 q = texelFetch(uQuads, ivec2(qi & 4095, qi >> 12), 0);
  Quad r;
  vec3 o = vec3(float(q.x & 0xffffu), float(q.x >> 16u), float(q.y & 0xffffu));
  vec2 wh = vec2(float(((q.y >> 16u) & 0xffu) + 1u), float((q.y >> 24u) + 1u));
  r.face = int((q.z >> 8u) & 7u);
  vec2 c = CORNER[ci];
  r.uv = c * wh;
  r.lp = o + FU[r.face] * r.uv.x + FV[r.face] * r.uv.y;
  r.n = FN[r.face];
  r.pal = q.z & 0xffu;
  r.ao = (q.z >> 11u) & 0xffu;
  r.slot = q.w;
  return r;
}

// Model rows for a body slot (rows 0..2 current, 3..5 previous). Slot 0 = static world (scale 0.1).
void bodyXform(uint slot, bool prev, out vec4 m0, out vec4 m1, out vec4 m2) {
  int row = int(slot);
  int b = prev ? 3 : 0;
  m0 = texelFetch(uXforms, ivec2(b, row), 0);
  m1 = texelFetch(uXforms, ivec2(b + 1, row), 0);
  m2 = texelFetch(uXforms, ivec2(b + 2, row), 0);
}
`,Ct=`
uint pcg(uint v) { uint state = v * 747796405u + 2891336453u; uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u; return (word >> 22u) ^ word; }
uint hash3i(ivec3 p) { return pcg(uint(p.x) * 73856093u ^ pcg(uint(p.y) * 19349663u ^ pcg(uint(p.z) * 83492791u))); }
float hash3f(ivec3 p) { return float(hash3i(p) & 0xffffu) / 65535.0; }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`,Kt=W+le+`
uniform mat4 uViewProj;
uniform mat4 uPrevViewProj;
uniform vec2 uJitter;
uniform int uTransparent;
out vec3 vLocal;
out vec2 vUV;
out vec4 vCur;
out vec4 vPrev;
out vec3 vWorld;
flat out vec3 vNormal;
flat out uint vPal;
flat out vec4 vAO;
flat out int vFace;
void main() {
  Quad q = decodeQuad(gl_VertexID);
  vLocal = q.lp; vUV = q.uv; vPal = q.pal; vFace = q.face;
  uint a = q.ao;
  vAO = vec4(float(a & 3u), float((a >> 2u) & 3u), float((a >> 4u) & 3u), float((a >> 6u) & 3u)) * (1.0 / 3.0);
  vec3 wp, pwp, wn;
  if (q.slot == 0u) { wp = q.lp * 0.1; pwp = wp; wn = q.n; }
  else {
    vec4 m0, m1, m2; bodyXform(q.slot, false, m0, m1, m2);
    vec4 l = vec4(q.lp, 1.0);
    wp = vec3(dot(m0, l), dot(m1, l), dot(m2, l));
    wn = normalize(vec3(dot(m0.xyz, q.n), dot(m1.xyz, q.n), dot(m2.xyz, q.n)));
    bodyXform(q.slot, true, m0, m1, m2);
    pwp = vec3(dot(m0, l), dot(m1, l), dot(m2, l));
  }
  vNormal = wn;
  vWorld = wp;
  vec4 clip = uViewProj * vec4(wp, 1.0);
  vCur = clip;
  vPrev = uPrevViewProj * vec4(pwp, 1.0);
  clip.xy += uJitter * clip.w;
  gl_Position = clip;
}`,ce=Ct+`
uniform highp sampler2D uPalAlbedo;
uniform highp sampler2D uPalParams;
uniform float uEdge;

float vnoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  ivec3 ii = ivec3(i);
  float a = hash3f(ii), b = hash3f(ii + ivec3(1,0,0)), c = hash3f(ii + ivec3(0,1,0)), d = hash3f(ii + ivec3(1,1,0));
  float e = hash3f(ii + ivec3(0,0,1)), g = hash3f(ii + ivec3(1,0,1)), h = hash3f(ii + ivec3(0,1,1)), k = hash3f(ii + ivec3(1,1,1));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}

// pattern ids (see materials.ts / renderer palette upload)
// 0 none, 1 brick, 2 planks, 3 corrugated, 4 concrete, 5 asphalt, 6 grass, 7 dirt, 8 tiles, 9 rust, 10 foliage, 11 container
vec3 surfaceAlbedo(uint pal, int pattern, ivec3 cell, vec3 lp, int face, out float roughMod) {
  vec3 alb = texelFetch(uPalAlbedo, ivec2(int(pal), 0), 0).rgb;
  float h = hash3f(cell);
  float v = (h - 0.5) * 0.10;
  roughMod = 0.0;
  if (pattern == 1) {
    // bricks: 3 voxels long, 1 voxel high, staggered every row; colour per brick
    int row = cell.y;
    int off = (row & 1) * 2;
    ivec3 b = ivec3((cell.x + off) >> 2, row, (cell.z + off) >> 2);
    float hb = hash3f(b);
    v = (hb - 0.5) * 0.28 + (h - 0.5) * 0.06;
    // occasional darker sooty bricks
    if (hb > 0.93) v -= 0.18;
  } else if (pattern == 2) {
    // planks: strips along the longest horizontal axis of the face
    int strip = (face == 2 || face == 3) ? cell.z : cell.y;
    float hs = hash3f(ivec3(strip, cell.x >> 4, 7));
    v = (hs - 0.5) * 0.22 + (h - 0.5) * 0.08;
  } else if (pattern == 4) {
    float n = vnoise(lp * 0.07) * 0.6 + vnoise(lp * 0.21) * 0.4;
    v = (n - 0.5) * 0.26 + (h - 0.5) * 0.07;
  } else if (pattern == 5) {
    float n = vnoise(lp * 0.05);
    v = (n - 0.5) * 0.22 + (h - 0.5) * 0.14;
  } else if (pattern == 6) {
    float n = vnoise(lp * 0.06) * 0.7 + vnoise(lp * 0.25) * 0.3;
    alb = mix(alb, alb * vec3(1.25, 1.15, 0.7), smoothstep(0.55, 0.8, n));
    v = (h - 0.5) * 0.28;
  } else if (pattern == 7) {
    float n = vnoise(lp * 0.09);
    v = (n - 0.5) * 0.3 + (h - 0.5) * 0.16;
  } else if (pattern == 8) {
    ivec3 t = cell >> 2;
    v = (hash3f(t) - 0.5) * 0.06 + (h - 0.5) * 0.03;
    ivec3 m = cell & 3;
    if ((face == 2 && (m.x == 0 || m.z == 0))) v -= 0.12;
  } else if (pattern == 9) {
    float n = vnoise(lp * 0.12) * 0.65 + vnoise(lp * 0.4) * 0.35;
    float rustAmt = smoothstep(0.5, 0.75, n);
    alb = mix(alb, vec3(0.30, 0.12, 0.05), rustAmt * 0.8);
    roughMod = rustAmt * 0.4;
    v = (h - 0.5) * 0.08;
  } else if (pattern == 10) {
    v = (h - 0.5) * 0.45;
    alb *= mix(vec3(1.0), vec3(1.2, 1.15, 0.7), step(0.85, h));
  } else if (pattern == 11) {
    // container: corrugation lines + grime towards the bottom
    float n = vnoise(lp * 0.1);
    v = (n - 0.5) * 0.16 + (h - 0.5) * 0.04;
  } else if (pattern == 3) {
    v = (h - 0.5) * 0.05;
  }
  return alb * (1.0 + v);
}

// corrugated sheet metal: bend the normal across one horizontal axis
vec3 corrugate(vec3 n, int face, vec3 lp) {
  if (face == 2 || face == 3) return n;
  float axis = (face == 0 || face == 1) ? lp.z : lp.x;
  float s = sin(axis * 3.14159 * 1.0);
  vec3 t = (face == 0 || face == 1) ? vec3(0, 0, 1) : vec3(1, 0, 0);
  return normalize(n + t * s * 0.35);
}

float voxelEdge(vec2 uv) {
  vec2 e = fract(uv);
  vec2 d = min(e, 1.0 - e);
  float m = min(d.x, d.y);
  return 1.0 - uEdge * (1.0 - smoothstep(0.0, 0.09, m));
}
`,ue=W+ce+`
in vec3 vLocal;
in vec2 vUV;
in vec4 vCur;
in vec4 vPrev;
in vec3 vWorld;
flat in vec3 vNormal;
flat in uint vPal;
flat in vec4 vAO;
flat in int vFace;
layout(location = 0) out vec4 oAlbedo;
layout(location = 1) out vec4 oNormal;
layout(location = 2) out vec4 oMat;
const vec3 FN_LOCAL[6] = vec3[6](vec3(1,0,0), vec3(-1,0,0), vec3(0,1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1));
void main() {
  vec3 ln = FN_LOCAL[vFace];
  ivec3 cell = ivec3(floor(vLocal - ln * 0.5));
  vec4 prm = texelFetch(uPalParams, ivec2(int(vPal), 0), 0);
  int pattern = int(prm.a * 255.0 + 0.5);
  float roughMod;
  vec3 alb = surfaceAlbedo(vPal, pattern, cell, vLocal, vFace, roughMod);
  vec2 f = fract(vUV);
  float ao = mix(mix(vAO.x, vAO.y, f.x), mix(vAO.z, vAO.w, f.x), f.y);
  ao = ao * ao * (3.0 - 2.0 * ao);
  alb *= voxelEdge(vUV);
  vec3 n = vNormal;
  if (pattern == 3 || pattern == 11) {
    // perturb in local space only for static geometry (bodies keep flat normals)
    if (dot(abs(n - ln), vec3(1.0)) < 0.001) n = corrugate(n, vFace, vLocal);
  }
  vec2 vel = (vCur.xy / vCur.w - vPrev.xy / vPrev.w) * 0.5;
  oAlbedo = vec4(alb, prm.b);
  oNormal = vec4(n * 0.5 + 0.5, ao);
  oMat = vec4(vel, clamp(prm.r + roughMod, 0.02, 1.0), prm.g);
}`,he=W+le+`
uniform mat4 uLightVP;
void main() {
  Quad q = decodeQuad(gl_VertexID);
  vec3 wp;
  if (q.slot == 0u) wp = q.lp * 0.1;
  else {
    vec4 m0, m1, m2; bodyXform(q.slot, false, m0, m1, m2);
    vec4 l = vec4(q.lp, 1.0);
    wp = vec3(dot(m0, l), dot(m1, l), dot(m2, l));
  }
  gl_Position = uLightVP * vec4(wp, 1.0);
}`,me=W+`
void main() {}`,fe=`
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uGroundColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uTime;
uniform vec3 uCamPos;

vec3 skyColor(vec3 d) {
  float y = d.y;
  float t = clamp(y, 0.0, 1.0);
  vec3 c = mix(uSkyHorizon, uSkyZenith, pow(t, 0.55));
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunColor * (pow(sd, 6.0) * 0.06 + pow(sd, 48.0) * 0.18);
  // horizon haze band
  c = mix(c, uFogColor, exp(-max(y, 0.0) * 9.0) * 0.55);
  if (y < 0.0) c = mix(c, uGroundColor * 0.6 + uFogColor * 0.4, smoothstep(0.0, -0.08, y));
  return c;
}

float cloudLayer(vec3 d) {
  if (d.y <= 0.01) return 0.0;
  vec2 p = d.xz / d.y * 0.6 + vec2(uTime * 0.004, uTime * 0.0013);
  float n = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    vec2 ip = floor(p); vec2 fp = fract(p); fp = fp * fp * (3.0 - 2.0 * fp);
    float h00 = fract(sin(dot(ip, vec2(127.1, 311.7))) * 43758.5453);
    float h10 = fract(sin(dot(ip + vec2(1,0), vec2(127.1, 311.7))) * 43758.5453);
    float h01 = fract(sin(dot(ip + vec2(0,1), vec2(127.1, 311.7))) * 43758.5453);
    float h11 = fract(sin(dot(ip + vec2(1,1), vec2(127.1, 311.7))) * 43758.5453);
    n += a * mix(mix(h00, h10, fp.x), mix(h01, h11, fp.x), fp.y);
    p = p * 2.07 + vec2(1.7, 9.2); a *= 0.5;
  }
  return smoothstep(0.52, 0.85, n) * smoothstep(0.01, 0.15, d.y);
}

vec3 fullSky(vec3 d) {
  vec3 c = skyColor(d);
  float cl = cloudLayer(d);
  float sd = max(dot(d, uSunDir), 0.0);
  vec3 cloudCol = mix(uSkyHorizon * 1.1 + uSunColor * 0.15, uSunColor * 0.55 + uSkyZenith * 0.3, pow(sd, 3.0));
  c = mix(c, cloudCol, cl * 0.85);
  return c;
}

vec3 applyFog(vec3 col, vec3 wp, vec3 rd, float dist) {
  // exponential height fog (analytic integral along the ray)
  float b = uFogHeight;
  float a = uFogDensity;
  float ry = rd.y;
  float camH = uCamPos.y;
  float fogAmt;
  if (abs(ry) < 1e-4) fogAmt = a * exp(-camH * b) * dist;
  else fogAmt = a * exp(-camH * b) * (1.0 - exp(-dist * ry * b)) / (ry * b);
  fogAmt = 1.0 - exp(-max(fogAmt, 0.0));
  float sd = max(dot(rd, uSunDir), 0.0);
  vec3 fc = uFogColor + uSunColor * pow(sd, 10.0) * 0.25;
  return mix(col, fc, fogAmt);
}

float D_GGX(float NoH, float a) { float a2 = a * a; float d = NoH * NoH * (a2 - 1.0) + 1.0; return a2 / (3.14159 * d * d + 1e-6); }
vec3 F_Schlick(float VoH, vec3 f0) { return f0 + (1.0 - f0) * pow(1.0 - VoH, 5.0); }
`,be=W+Ct+`
in vec2 vUV;
uniform sampler2D uDepth;
uniform sampler2D uNormal;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform mat4 uView;
uniform vec2 uTexel;
uniform float uRadius;
uniform int uFrame;
out vec4 oAO;
vec3 viewPos(vec2 uv) {
  float d = texture(uDepth, uv).r;
  vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
void main() {
  float d = texture(uDepth, vUV).r;
  if (d >= 1.0) { oAO = vec4(1.0); return; }
  vec3 P = viewPos(vUV);
  vec3 N = normalize((uView * vec4(texture(uNormal, vUV).xyz * 2.0 - 1.0, 0.0)).xyz);
  float noise = ign(gl_FragCoord.xy + float(uFrame % 64) * 5.588238);
  float rot = noise * 6.2831;
  vec3 rv = normalize(vec3(cos(rot), sin(rot), 0.3));
  vec3 T = normalize(rv - N * dot(rv, N));
  vec3 B = cross(N, T);
  float occ = 0.0;
  const int S = 12;
  float radius = uRadius * (0.6 + 0.4 * clamp(-P.z / 6.0, 0.0, 1.0));
  for (int i = 0; i < S; i++) {
    float fi = float(i) + fract(noise * 7.13);
    float r = (fi + 0.5) / float(S);
    float a = fi * 2.39996;
    float z = sqrt(1.0 - r);
    vec3 s = vec3(cos(a) * sqrt(r), sin(a) * sqrt(r), z);
    vec3 sp = P + (T * s.x + B * s.y + N * s.z) * radius * mix(0.2, 1.0, r * r);
    vec4 c = uProj * vec4(sp, 1.0);
    vec2 suv = c.xy / c.w * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) continue;
    float sz = viewPos(suv).z;
    float rangeOk = smoothstep(0.0, 1.0, radius / abs(P.z - sz));
    occ += (sz >= sp.z + 0.02 ? 1.0 : 0.0) * rangeOk;
  }
  float ao = 1.0 - occ / float(S);
  oAO = vec4(ao, 0.0, 0.0, 1.0);
}`,de=W+`
in vec2 vUV;
uniform sampler2D uAO;
uniform sampler2D uDepth;
uniform vec2 uTexel;
uniform vec2 uDir;
uniform float uNear;
uniform float uFar;
out vec4 oAO;
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
void main() {
  float d0 = lin(texture(uDepth, vUV).r);
  float sum = 0.0, wsum = 0.0;
  for (int i = -3; i <= 3; i++) {
    vec2 uv = vUV + uDir * uTexel * float(i) * 1.5;
    float d = lin(texture(uDepth, uv).r);
    float w = exp(-abs(d - d0) / (0.05 * d0 + 0.05)) * (1.0 - abs(float(i)) / 4.0);
    sum += texture(uAO, uv).r * w; wsum += w;
  }
  oAO = vec4(sum / max(wsum, 1e-4), 0, 0, 1);
}`,pe=W+fe+Ct+`
in vec2 vUV;
uniform sampler2D uAlbedo;
uniform sampler2D uNormal;
uniform sampler2D uMat;
uniform sampler2D uDepth;
uniform sampler2D uSSAO;
uniform sampler2DArrayShadow uShadow;
uniform mat4 uInvViewProj;
uniform mat4 uCascadeVP[${K}];
uniform vec4 uCascadeSplits;
uniform float uCascadeTexel[${K}];
uniform vec4 uLightPos[${ct}];
uniform vec4 uLightCol[${ct}];
uniform int uLightCount;
uniform float uAmbient;
uniform int uUseSSAO;
uniform float uShadowSoft;
uniform int uFrame;
out vec4 oColor;

float shadowAt(vec3 wp, vec3 n, float viewDist) {
  int c = 0;
  if (viewDist > uCascadeSplits.x) c = 1;
  if (viewDist > uCascadeSplits.y) c = 2;
  if (viewDist > uCascadeSplits.z) c = 3;
  if (viewDist > uCascadeSplits.w) return 1.0;
  float texel = uCascadeTexel[c];
  vec3 p = wp + n * texel * 1.5;
  vec4 lp = uCascadeVP[c] * vec4(p, 1.0);
  vec3 s = lp.xyz / lp.w * 0.5 + 0.5;
  if (s.x < 0.0 || s.y < 0.0 || s.x > 1.0 || s.y > 1.0) return 1.0;
  float bias = 0.0003 * float(c + 1);
  float r = uShadowSoft / (texel * 2048.0) ;
  float sum = 0.0;
  float ang = ign(gl_FragCoord.xy + float(uFrame % 16) * 3.7) * 6.2831;
  float ca = cos(ang), sa = sin(ang);
  const vec2 taps[8] = vec2[8](vec2(-0.613,0.3617), vec2(0.1702,-0.0405), vec2(-0.2994,-0.6545), vec2(0.6455,-0.2964),
                               vec2(0.4213,0.6801), vec2(-0.7984,-0.3154), vec2(-0.1101,0.8971), vec2(0.8662,0.2549));
  for (int i = 0; i < 8; i++) {
    vec2 o = taps[i];
    o = vec2(o.x * ca - o.y * sa, o.x * sa + o.y * ca) * (1.5 / 2048.0) * (c == 0 ? 1.0 : 1.4);
    sum += texture(uShadow, vec4(s.xy + o, float(c), s.z - bias));
  }
  float sh = sum / 8.0;
  // fade out at the last cascade end
  if (c == 3) sh = mix(sh, 1.0, smoothstep(uCascadeSplits.w * 0.85, uCascadeSplits.w, viewDist));
  return sh;
}

void main() {
  float d = texture(uDepth, vUV).r;
  vec4 wp4 = uInvViewProj * vec4(vUV * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec3 wp = wp4.xyz / wp4.w;
  vec3 rd = normalize(wp - uCamPos);
  if (d >= 1.0) {
    oColor = vec4(fullSky(rd), 1.0);
    return;
  }
  vec4 A = texture(uAlbedo, vUV);
  vec4 Nn = texture(uNormal, vUV);
  vec4 M = texture(uMat, vUV);
  vec3 alb = A.rgb;
  float emissive = A.a * 16.0;
  vec3 n = normalize(Nn.xyz * 2.0 - 1.0);
  float vao = Nn.w;
  float rough = M.b, metal = M.a;
  float dist = length(wp - uCamPos);
  float ssao = uUseSSAO == 1 ? texture(uSSAO, vUV).r : 1.0;
  float ao = vao * mix(1.0, ssao, 0.85);
  vec3 V = -rd;
  vec3 f0 = mix(vec3(0.04), alb, metal);
  vec3 diffCol = alb * (1.0 - metal);

  // sun
  float NoL = max(dot(n, uSunDir), 0.0);
  float sh = NoL > 0.0 ? shadowAt(wp, n, dist) : 0.0;
  vec3 H = normalize(uSunDir + V);
  float NoH = max(dot(n, H), 0.0), VoH = max(dot(V, H), 0.0), NoV = max(dot(n, V), 1e-3);
  float a = max(rough * rough, 0.02);
  vec3 F = F_Schlick(VoH, f0);
  float k = (rough + 1.0); k = k * k / 8.0;
  float G = (NoL / (NoL * (1.0 - k) + k)) * (NoV / (NoV * (1.0 - k) + k));
  vec3 spec = D_GGX(NoH, a) * F * G / max(4.0 * NoL * NoV, 1e-3);
  vec3 col = (diffCol / 3.14159 + spec) * uSunColor * NoL * sh * 3.14159;

  // sky / ambient (hemisphere) with bounce from the ground
  float up = n.y * 0.5 + 0.5;
  vec3 skyAmb = mix(uGroundColor, mix(uSkyHorizon, uSkyZenith, 0.5), up);
  vec3 amb = skyAmb * uAmbient;
  // cheap environment reflection for metals / glossy
  vec3 R = reflect(rd, n);
  vec3 env = skyColor(R) * uAmbient;
  vec3 Fe = f0 + (max(vec3(1.0 - rough), f0) - f0) * pow(1.0 - NoV, 5.0);
  col += (diffCol * amb + env * Fe * (1.0 - rough * 0.7)) * ao;

  // point lights
  for (int i = 0; i < ${ct}; i++) {
    if (i >= uLightCount) break;
    vec4 lp = uLightPos[i];
    vec3 L = lp.xyz - wp;
    float dl2 = dot(L, L);
    float r2 = lp.w * lp.w;
    if (dl2 > r2) continue;
    float dl = sqrt(dl2);
    L /= dl;
    float nl = max(dot(n, L), 0.0);
    float win = 1.0 - dl2 / r2; win *= win;
    float att = win / (dl2 + 0.25);
    vec3 Hl = normalize(L + V);
    float sl = D_GGX(max(dot(n, Hl), 0.0), max(a, 0.08)) * 0.25;
    col += uLightCol[i].rgb * att * (diffCol * nl + f0 * sl * nl) * mix(1.0, ao, 0.5);
  }

  col += alb * emissive;
  col = applyFog(col, wp, rd, dist);
  oColor = vec4(col, 1.0);
}`,ve=W+fe+ce+`
in vec3 vLocal;
in vec2 vUV;
in vec4 vCur;
in vec4 vPrev;
in vec3 vWorld;
flat in vec3 vNormal;
flat in uint vPal;
flat in vec4 vAO;
flat in int vFace;
uniform sampler2DArrayShadow uShadow;
uniform mat4 uCascadeVP[${K}];
uniform vec4 uCascadeSplits;
uniform float uAmbient;
out vec4 oColor;
void main() {
  vec3 alb = texelFetch(uPalAlbedo, ivec2(int(vPal), 0), 0).rgb;
  vec3 n = normalize(vNormal);
  vec3 rd = normalize(vWorld - uCamPos);
  float dist = length(vWorld - uCamPos);
  if (dot(n, rd) > 0.0) n = -n;
  float NoV = max(dot(n, -rd), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - NoV, 5.0);
  vec3 R = reflect(rd, n);
  vec3 env = fullSky(R);
  // simple sun shadow on glass (first matching cascade)
  float sh = 1.0;
  int c = dist > uCascadeSplits.x ? (dist > uCascadeSplits.y ? (dist > uCascadeSplits.z ? 3 : 2) : 1) : 0;
  vec4 lp = uCascadeVP[c] * vec4(vWorld + n * 0.02, 1.0);
  vec3 s = lp.xyz / lp.w * 0.5 + 0.5;
  if (s.x > 0.0 && s.y > 0.0 && s.x < 1.0 && s.y < 1.0 && dist < uCascadeSplits.w) sh = texture(uShadow, vec4(s.xy, float(c), s.z - 0.0005));
  vec3 H = normalize(uSunDir - rd);
  float spec = pow(max(dot(n, H), 0.0), 400.0) * 40.0 * sh;
  float edge = 1.0 - voxelEdge(vUV);
  vec3 col = alb * (uSkyHorizon * uAmbient * 0.6 + uSunColor * max(dot(n, uSunDir), 0.0) * sh * 0.25);
  col = mix(col, env, fres * 0.85) + uSunColor * spec;
  float alpha = clamp(0.22 + fres * 0.6 + edge * 0.5, 0.0, 0.95);
  col = applyFog(col, vWorld, rd, dist);
  oColor = vec4(col, alpha);
}`,xe=W+`
in vec2 vUV;
uniform sampler2D uCurrent;
uniform sampler2D uHistory;
uniform sampler2D uMat;
uniform sampler2D uDepth;
uniform vec2 uTexel;
uniform float uBlend;
uniform int uReset;
uniform mat4 uReproj; // current clip -> previous clip (for static geometry)
out vec4 oColor;
vec3 toYCoCg(vec3 c) { return vec3(0.25*c.r + 0.5*c.g + 0.25*c.b, 0.5*c.r - 0.5*c.b, -0.25*c.r + 0.5*c.g - 0.25*c.b); }
vec3 fromYCoCg(vec3 c) { return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
vec3 tm(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b))); }
vec3 itm(vec3 c) { return c / max(1.0 - max(c.r, max(c.g, c.b)), 1e-4); }
void main() {
  vec3 cur = tm(texture(uCurrent, vUV).rgb);
  if (uReset == 1) { oColor = vec4(itm(cur), 1.0); return; }
  // closest depth in 3x3 for velocity dilation
  float best = 1.0; vec2 bestUV = vUV;
  vec3 m1 = vec3(0.0), m2 = vec3(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 uv = vUV + vec2(float(x), float(y)) * uTexel;
    float d = texture(uDepth, uv).r;
    if (d < best) { best = d; bestUV = uv; }
    vec3 c = toYCoCg(tm(texture(uCurrent, uv).rgb));
    m1 += c; m2 += c * c;
  }
  vec2 vel = texture(uMat, bestUV).rg;
  if (best >= 1.0) {
    // sky: reproject using camera rotation only
    vec4 c = uReproj * vec4(vUV * 2.0 - 1.0, 1.0, 1.0);
    vel = vUV - (c.xy / c.w * 0.5 + 0.5);
  }
  vec2 prevUV = vUV - vel;
  vec3 mean = m1 / 9.0;
  vec3 sigma = sqrt(max(m2 / 9.0 - mean * mean, 0.0));
  vec3 lo = mean - sigma * 1.25, hi = mean + sigma * 1.25;
  vec3 hist = toYCoCg(tm(texture(uHistory, prevUV).rgb));
  // clip towards mean
  vec3 cc = 0.5 * (hi + lo), ext = 0.5 * (hi - lo) + 1e-4;
  vec3 off = hist - cc; vec3 ts = abs(off / ext); float t = max(ts.x, max(ts.y, ts.z));
  if (t > 1.0) hist = cc + off / t;
  hist = fromYCoCg(hist);
  float blend = uBlend;
  if (prevUV.x < 0.0 || prevUV.y < 0.0 || prevUV.x > 1.0 || prevUV.y > 1.0) blend = 1.0;
  float speed = length(vel / uTexel);
  blend = mix(blend, 0.3, clamp(speed / 40.0, 0.0, 1.0));
  vec3 res = mix(hist, cur, blend);
  oColor = vec4(itm(res), 1.0);
}`,ye=W+`
in vec2 vUV;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform int uFirst;
uniform float uThreshold;
out vec4 oColor;
vec3 karis(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b)) * 0.25); }
void main() {
  vec3 a = texture(uSrc, vUV + uTexel * vec2(-2, 2)).rgb, b = texture(uSrc, vUV + uTexel * vec2(0, 2)).rgb, c = texture(uSrc, vUV + uTexel * vec2(2, 2)).rgb;
  vec3 d = texture(uSrc, vUV + uTexel * vec2(-2, 0)).rgb, e = texture(uSrc, vUV).rgb, f = texture(uSrc, vUV + uTexel * vec2(2, 0)).rgb;
  vec3 g = texture(uSrc, vUV + uTexel * vec2(-2, -2)).rgb, h = texture(uSrc, vUV + uTexel * vec2(0, -2)).rgb, i = texture(uSrc, vUV + uTexel * vec2(2, -2)).rgb;
  vec3 j = texture(uSrc, vUV + uTexel * vec2(-1, 1)).rgb, k = texture(uSrc, vUV + uTexel * vec2(1, 1)).rgb;
  vec3 l = texture(uSrc, vUV + uTexel * vec2(-1, -1)).rgb, m = texture(uSrc, vUV + uTexel * vec2(1, -1)).rgb;
  vec3 col;
  if (uFirst == 1) {
    col = karis((a + b + d + e) * 0.25) * 0.125 + karis((b + c + e + f) * 0.25) * 0.125 + karis((d + e + g + h) * 0.25) * 0.125
        + karis((e + f + h + i) * 0.25) * 0.125 + karis((j + k + l + m) * 0.25) * 0.5;
    float br = max(col.r, max(col.g, col.b));
    col *= max(br - uThreshold, 0.0) / max(br, 1e-4);
  } else {
    col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  oColor = vec4(col, 1.0);
}`,ge=W+`
in vec2 vUV;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;
out vec4 oColor;
void main() {
  vec2 r = uTexel * uRadius;
  vec3 c = texture(uSrc, vUV).rgb * 4.0;
  c += (texture(uSrc, vUV + vec2(-r.x, 0)).rgb + texture(uSrc, vUV + vec2(r.x, 0)).rgb + texture(uSrc, vUV + vec2(0, r.y)).rgb + texture(uSrc, vUV + vec2(0, -r.y)).rgb) * 2.0;
  c += texture(uSrc, vUV + vec2(-r.x, r.y)).rgb + texture(uSrc, vUV + vec2(r.x, r.y)).rgb + texture(uSrc, vUV + vec2(-r.x, -r.y)).rgb + texture(uSrc, vUV + vec2(r.x, -r.y)).rgb;
  oColor = vec4(c / 16.0, 1.0);
}`,we=W+Ct+`
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uTime;
uniform vec2 uRes;
uniform float uFlash;
uniform float uDamage;
out vec4 oColor;
vec3 aces(vec3 x) {
  const mat3 m1 = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 m2 = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 v = m1 * x;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(m2 * (a / b), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  vec3 b = texture(uBloom, vUV).rgb;
  c = mix(c, b, uBloomStrength);
  c *= uExposure * (1.0 + uFlash);
  c = aces(c);
  // gentle grading: lift shadows slightly cool, warm highlights
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, c * vec3(0.96, 1.0, 1.06), (1.0 - l) * 0.25);
  c = mix(vec3(l), c, 1.06);
  vec2 q = vUV - 0.5;
  float vig = 1.0 - dot(q, q) * 0.55;
  c *= vig;
  c = mix(c, vec3(0.6, 0.0, 0.0), uDamage * smoothstep(0.2, 0.75, length(q)));
  c = toSRGB(max(c, 0.0));
  float g = ign(gl_FragCoord.xy + fract(uTime * 7.0) * 100.0) - 0.5;
  c += g * (1.0 / 255.0) * 1.5;
  oColor = vec4(c, 1.0);
}`,Me=W+`
in vec2 vUV;
uniform sampler2D uSrc;
out vec4 oColor;
void main() { oColor = texture(uSrc, vUV); }`;var tt=class a{constructor(e,t=256){this.gl=e;c(this,"tex");c(this,"rows");c(this,"capacity");c(this,"top",0);c(this,"freeStart",[]);c(this,"freeSize",[]);c(this,"used",0);this.rows=t,this.capacity=t*4096,this.tex=this.createTex(t)}createTex(e){let t=this.gl,r=t.createTexture();return t.bindTexture(t.TEXTURE_2D,r),t.texStorage2D(t.TEXTURE_2D,1,t.RGBA32UI,4096,e),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),r}grow(e){let t=this.gl,r=this.rows;for(;r*4096<e;)r*=2;let s=Math.min(16384,t.getParameter(t.MAX_TEXTURE_SIZE));if(r>s)throw new Error("QuadPool exhausted");let n=this.createTex(r),i=t.createFramebuffer(),o=t.createFramebuffer();t.bindFramebuffer(t.READ_FRAMEBUFFER,i),t.framebufferTexture2D(t.READ_FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,this.tex,0),t.bindFramebuffer(t.DRAW_FRAMEBUFFER,o),t.framebufferTexture2D(t.DRAW_FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,n,0),t.blitFramebuffer(0,0,4096,this.rows,0,0,4096,this.rows,t.COLOR_BUFFER_BIT,t.NEAREST),t.bindFramebuffer(t.READ_FRAMEBUFFER,null),t.bindFramebuffer(t.DRAW_FRAMEBUFFER,null),t.deleteFramebuffer(i),t.deleteFramebuffer(o),t.deleteTexture(this.tex),this.tex=n,this.rows=r,this.capacity=r*4096}static roundSize(e){return Math.max(16,((e+16-1)/16|0)*16)}alloc(e){let t=a.roundSize(e),r=this.freeStart,s=this.freeSize;for(let i=0;i<r.length;i++)if(s[i]>=t){let o=r[i];return s[i]===t?(r.splice(i,1),s.splice(i,1)):(r[i]+=t,s[i]-=t),this.used+=t,o}this.top+t>this.capacity&&this.grow(this.top+t);let n=this.top;return this.top+=t,this.used+=t,n}free(e,t){let r=a.roundSize(t);this.used-=r;let s=this.freeStart,n=this.freeSize,i=0,o=s.length;for(;i<o;){let l=i+o>>1;s[l]<e?i=l+1:o=l}s.splice(i,0,e),n.splice(i,0,r),i+1<s.length&&s[i]+n[i]===s[i+1]&&(n[i]+=n[i+1],s.splice(i+1,1),n.splice(i+1,1)),i>0&&s[i-1]+n[i-1]===s[i]&&(n[i-1]+=n[i],s.splice(i,1),n.splice(i,1),i--),s[i]+n[i]===this.top&&(this.top=s[i],s.splice(i,1),n.splice(i,1))}upload(e,t,r){let s=this.gl;s.bindTexture(s.TEXTURE_2D,this.tex);let n=e,i=r,o=0;for(;i>0;){let l=n&4095,h=n>>12,u;if(l===0&&i>=4096){let m=i/4096|0;s.texSubImage2D(s.TEXTURE_2D,0,0,h,4096,m,s.RGBA_INTEGER,s.UNSIGNED_INT,t,o*4),u=m*4096}else u=Math.min(i,4096-l),s.texSubImage2D(s.TEXTURE_2D,0,l,h,u,1,s.RGBA_INTEGER,s.UNSIGNED_INT,t,o*4);n+=u,o+=u,i-=u}}get highWater(){return this.top}};var Tt=class{constructor(){c(this,"p",new Float32Array(24))}setFromMatrix(e){let t=this.p,r=e[0],s=e[4],n=e[8],i=e[12],o=e[1],l=e[5],h=e[9],u=e[13],m=e[2],d=e[6],f=e[10],b=e[14],p=e[3],x=e[7],v=e[11],g=e[15],w=(E,F,S,C,D)=>{let T=Math.hypot(F,S,C)||1;t[E*4]=F/T,t[E*4+1]=S/T,t[E*4+2]=C/T,t[E*4+3]=D/T};return w(0,p+r,x+s,v+n,g+i),w(1,p-r,x-s,v-n,g-i),w(2,p+o,x+l,v+h,g+u),w(3,p-o,x-l,v-h,g-u),w(4,p+m,x+d,v+f,g+b),w(5,p-m,x-d,v-f,g-b),this}testBox(e,t,r,s,n,i){let o=this.p;for(let l=0;l<24;l+=4){let h=o[l],u=o[l+1],m=o[l+2],d=o[l+3],f=h>0?s:e,b=u>0?n:t,p=m>0?i:r;if(h*f+u*b+m*p+d<0)return!1}return!0}testSphere(e,t,r,s){let n=this.p;for(let i=0;i<24;i+=4)if(n[i]*e+n[i+1]*t+n[i+2]*r+n[i+3]<-s)return!1;return!0}};var N=(a,e,t,r,s,n,i,o,l,h,u,m=!1)=>({name:a,density:e,hardness:t,blast:r,friction:s,restitution:n,flammable:i,burnTime:o,bond:l,sound:h,debris:u,transparent:m}),z=[];z[0]=N("air",0,0,0,0,0,0,0,0,0,0);z[1]=N("concrete",2.4,2,.72,.8,.05,0,0,1,1,1);z[2]=N("brick",1.9,2,.8,.8,.05,0,0,.75,1,1);z[3]=N("plaster",1.1,1,1.2,.7,.05,0,0,.35,1,0);z[4]=N("wood",.6,1,1.05,.6,.15,1,9,.6,3,2);z[5]=N("metal",2.2,3,.5,.45,.15,0,0,2.4,2,4);z[6]=N("heavy metal",5,4,.28,.45,.1,0,0,4,2,4);z[7]=N("glass",2.5,0,2.2,.4,.05,0,0,.15,4,3,!0);z[8]=N("dirt",1.5,1,1,.9,0,0,0,.3,5,0);z[9]=N("grass",1.4,1,1,.9,0,.15,3,.3,5,0);z[10]=N("gravel",1.7,1,.95,.9,0,0,0,.25,5,1);z[11]=N("rock",2.6,3,.55,.85,.05,0,0,2,1,1);z[12]=N("asphalt",2.3,2,.8,.9,.02,.05,6,.8,1,1);z[13]=N("plastic",.9,1,1.1,.5,.25,.55,6,.5,0,1);z[14]=N("foliage",.25,0,1.6,.8,0,.9,3,.1,0,0);z[15]=N("rubber",1.2,2,.85,1,.45,.5,10,.9,0,1);z[16]=N("explosive",1.6,1,1,.5,.1,.8,1,1.5,2,4);z[17]=N("fabric",.4,1,1.3,.9,0,1,4,.2,0,0);z[18]=N("light",1,0,1.6,.4,.05,0,0,.3,4,3);z[19]=N("bedrock",3,5,0,.9,0,0,0,100,1,1);z[20]=N("rubble",1.6,1,1.25,.95,0,0,0,.12,1,1);z[21]=N("char",.3,0,1.4,.8,0,.15,3,.1,0,0);var et=[{name:"air",mat:0,r:0,g:0,b:0,rough:1,metal:0,emissive:0,density:0}],$t=new Uint8Array(256);function Ve(a){let e=parseInt(a.replace("#",""),16);return[e>>16&255,e>>8&255,e&255]}function Oe(a){switch(a){case 5:return{rough:.45,metal:.75};case 6:return{rough:.5,metal:.65};case 7:return{rough:.05,metal:0};case 13:return{rough:.45,metal:0};case 16:return{rough:.4,metal:.4};case 18:return{rough:.3,metal:0};case 15:return{rough:.75,metal:0};case 12:return{rough:.9,metal:0};default:return{rough:.92,metal:0}}}function A(a,e,t,r={}){let[s,n,i]=Ve(t),o=Oe(e),l=et.length;if(l>255)throw new Error("palette overflow");return et.push({name:a,mat:e,r:s,g:n,b:i,rough:r.rough??o.rough,metal:r.metal??o.metal,emissive:r.emissive??0,density:r.density??0}),$t[l]=1,l}function M(a,e,t,r={}){let s=A(a,e,t[0],r);for(let n=1;n<t.length;n++)A(a+n,e,t[n],r);return $t[s]=t.length,s}var y={asphalt:M("asphalt",12,["#3b3b3d","#363638","#414043","#39383b"]),asphaltPatch:M("asphalt patch",12,["#47464a","#4c4b4e"]),lineWhite:M("line white",12,["#c9c8c0","#bdbcb4"]),lineYellow:M("line yellow",12,["#c9a227","#bf9a25"]),gravel:M("gravel",10,["#7d7870","#6e6a63","#8a857c","#75716a"]),ballast:M("ballast",10,["#5f5c58","#6a6661","#55524e"]),dirt:M("dirt",8,["#5e4a36","#6b5440","#574330","#634e39"]),dirtDark:M("dirt dark",8,["#45362a","#4d3c2e"]),mud:M("mud",8,["#4a3b2c","#43352a"]),sand:M("sand",8,["#b09c75","#a69270"]),grass:M("grass",9,["#4f6b2e","#5a7533","#46612a","#53702f"]),grassDry:M("grass dry",9,["#7d7a45","#72703f"]),rock:M("rock",11,["#6f6f6f","#5f5e5c","#787672"]),bedrock:A("bedrock",19,"#2b2b2e"),coal:M("coal",10,["#1f1f21","#262628","#1a1a1c"]),concrete:M("concrete",1,["#9c9a94","#96948e","#a19f99"]),concreteMid:M("concrete mid",1,["#8a8882","#84827c"]),concreteDark:M("concrete dark",1,["#77756f","#6f6d68"]),concreteStain:M("concrete stain",1,["#66635d","#5c5953"]),concreteFloor:M("concrete floor",1,["#7d817b","#787c76"]),epoxyFloor:M("epoxy floor",1,["#5f7068","#5b6b63"],{rough:.5}),concreteYellow:A("concrete safety yellow",1,"#c99f2c"),cinder:M("cinder block",1,["#a3a19a","#9a9891","#a8a69f"]),concreteBlue:A("concrete painted blue",1,"#4a6a8a"),brick:M("brick",2,["#8e3b2c","#9a4432","#7f3326","#a24c37","#87382a"]),brickDark:M("brick dark",2,["#5e2a22","#673026"]),brickYellow:M("brick yellow",2,["#b58e55","#a98450"]),mortar:M("mortar",2,["#a59f92","#9b9588"]),sootBrick:M("soot brick",2,["#3a2a26","#2f2522"]),plaster:M("plaster white",3,["#d8d5cc","#d2cfc6"]),plasterBeige:M("plaster beige",3,["#cdbf9f","#c6b898"]),plasterGrey:A("plaster grey",3,"#b9b9b4"),plasterBlue:A("plaster blue",3,"#8d9aa6"),plasterGreen:A("plaster green",3,"#9fae95"),ceiling:A("ceiling tile",3,"#e2e0d8"),plank:M("plank",4,["#9b7247","#8a643d","#a37a4d"]),woodDark:M("wood dark",4,["#5c3f25","#664629"]),pallet:M("pallet wood",4,["#b08a5a","#a07b4c","#b89463"]),plywood:M("plywood",4,["#c19a62","#b8925b"]),bark:M("bark",4,["#4e3826","#5a4130","#46321f"]),crate:M("crate wood",4,["#a5814f","#9a7747"]),woodPainted:A("wood painted green",4,"#4b6343"),steel:M("steel",5,["#7a7d80","#73767a","#808386"]),steelDark:M("steel dark",5,["#4a4c4f","#525457"]),rust:M("rust",5,["#8a4b2a","#7a4127","#9a5a33","#6e3d24"],{rough:.85,metal:.3}),galv:M("galvanized",5,["#a4a8aa","#959a9d","#9ca0a3"],{density:.6}),alu:A("aluminum",5,"#b8bcbf",{density:.8,rough:.35}),sheetGrey:M("sheet grey",5,["#8e9397","#868b8f"],{density:.5}),sheetBlue:M("sheet blue",5,["#3d5f86","#395a7f"],{density:.5,rough:.6,metal:.3}),sheetWhite:M("sheet white",5,["#cfd0cb","#c6c7c2"],{density:.5,rough:.6,metal:.3}),sheetGreen:M("sheet green",5,["#5a7a62","#557459"],{density:.5,rough:.6,metal:.3}),sheetRust:M("sheet rust",5,["#7e4a2c","#8c5532"],{density:.5,rough:.85,metal:.25}),paintBlue:A("metal blue",5,"#2f5a8a",{rough:.55,metal:.35}),paintRed:A("metal red",5,"#a32a22",{rough:.55,metal:.35}),paintYellow:M("metal yellow",5,["#d9a521","#cf9c1f"],{rough:.55,metal:.35}),paintGreen:A("metal green",5,"#3d6b45",{rough:.55,metal:.35}),paintOrange:A("metal orange",5,"#d0661f",{rough:.55,metal:.35}),paintWhite:A("metal white",5,"#d6d6d0",{rough:.55,metal:.3}),paintBlack:A("metal black",5,"#222325",{rough:.55,metal:.4}),paintGreyBlue:A("metal grey blue",5,"#59687a",{rough:.55,metal:.35}),paintDarkGreen:A("metal dark green",5,"#2e4a35",{rough:.55,metal:.35}),contRed:M("container red",5,["#8f2f24","#852b21"],{density:.6,rough:.6,metal:.3}),contBlue:M("container blue",5,["#2b4f7c","#284973"],{density:.6,rough:.6,metal:.3}),contGreen:M("container green",5,["#3f6b4b","#3a6345"],{density:.6,rough:.6,metal:.3}),contOrange:M("container orange",5,["#c8642a","#bd5e27"],{density:.6,rough:.6,metal:.3}),contGrey:M("container grey",5,["#8a8f92","#83888b"],{density:.6,rough:.6,metal:.3}),contMaroon:M("container maroon",5,["#6b2a2a","#632727"],{density:.6,rough:.6,metal:.3}),contWhite:M("container white",5,["#cfcfc8","#c5c5be"],{density:.6,rough:.6,metal:.3}),railSteel:A("rail steel",5,"#6a625a",{rough:.35,metal:.8}),chrome:A("chrome",5,"#c8ccd0",{rough:.15,metal:.95}),copper:A("copper",5,"#b06a3a",{rough:.4,metal:.9}),grate:A("grate",5,"#5d6064",{density:.4}),machineGreen:M("machine green",6,["#4f6656","#4a6051"]),machineGrey:M("machine grey",6,["#6b7075","#656a6f"]),machineBlue:M("machine blue",6,["#3c5a78","#385470"]),machineOrange:A("machine orange",6,"#b5612a"),machineYellow:A("machine yellow",6,"#c99a22"),castIron:M("cast iron",6,["#303234","#36383a"]),heavySteel:A("heavy steel",6,"#55585c"),glass:A("window glass",7,"#a9c9d2"),glassDark:A("dark glass",7,"#5d7d88"),glassFrost:A("frosted glass",7,"#cad9da",{rough:.3}),glassGreen:A("green glass",7,"#7aa58a"),plasticWhite:A("plastic white",13,"#d8d8d2"),plasticBlack:A("plastic black",13,"#262626"),plasticBlue:A("plastic blue",13,"#2552a0"),plasticOrange:A("plastic orange",13,"#e0601a"),plasticRed:A("plastic red",13,"#b02a2a"),plasticGreen:A("plastic green",13,"#3a7a3a"),plasticYellow:A("plastic yellow",13,"#d8b830"),plasticGrey:A("plastic grey",13,"#808080"),ibcWhite:A("ibc white",13,"#e2e2da",{rough:.6}),rubber:M("rubber",15,["#1e1e1f","#2a2a2b"]),tarpBlue:A("tarp blue",17,"#2d5d9a"),tarpGreen:A("tarp green",17,"#4a6a3a"),carpet:M("carpet",17,["#5f6266","#595c60"]),carpetBlue:A("carpet blue",17,"#3e4c66"),seat:A("seat fabric",17,"#4a4a52"),cardboard:M("cardboard",17,["#b08d5f","#a6845a"],{density:.15}),paper:A("paper",17,"#e8e6dc",{density:.3}),leaves:M("leaves",14,["#3e5f24","#4a6d2b","#355220","#44662a"]),leavesYellow:M("leaves yellow",14,["#6f7a2a","#7d8030"]),bush:M("bush",14,["#3f5a28","#365024"]),propane:A("propane tank",16,"#d4d4cc"),fuelRed:A("fuel barrel red",16,"#b52a1e"),gasRed:A("gas cylinder red",16,"#a01e1e"),gasBlue:A("gas cylinder blue",16,"#22447a"),gasYellow:A("gas cylinder yellow",16,"#d6b020"),tnt:A("tnt",16,"#9a1a14"),gasWhite:A("gas tank white",16,"#e0e0da"),lampWarm:A("lamp warm",18,"#ffd9a0",{emissive:7}),lampCool:A("lamp cool",18,"#e2f0ff",{emissive:7}),lampRed:A("lamp red",18,"#ff3a26",{emissive:5}),lampGreen:A("lamp green",18,"#46ff6a",{emissive:4}),lampOrange:A("lamp orange",18,"#ffa030",{emissive:6}),screen:A("screen",18,"#6ab0ff",{emissive:1.6}),rubbleConcrete:M("rubble concrete",20,["#8a8780","#7f7c75","#94918a"]),rubbleBrick:M("rubble brick",20,["#7a4636","#6e3f31"]),rubbleDirt:M("rubble dirt",20,["#5a4836","#524231"]),rubbleWood:M("rubble wood",20,["#7a5a3a","#6d5034"]),scrap:M("scrap metal",20,["#5f5f60","#6f5244"]),char:M("char",21,["#1c1a18","#262220","#2e2925"]),ash:A("ash",21,"#4a4744")},Ut=et.length,We=new Uint8Array(256),pt=new Uint8Array(256),Ie=new Float32Array(256),He=new Uint8Array(256),Xe=new Float32Array(256),je=new Float32Array(256),qe=new Float32Array(256),Ye=new Float32Array(256),Qe=new Float32Array(256),Zt=new Uint8Array(256),dt=new Uint8Array(256);for(let a=0;a<256;a++){let e=et[a]??et[0],t=z[e.mat];We[a]=e.mat,pt[a]=t.transparent?1:0,Ie[a]=e.density>0?e.density:t.density,He[a]=a===0?0:t.hardness,Xe[a]=t.blast,je[a]=t.flammable,qe[a]=t.bond,Ye[a]=t.friction,Qe[a]=t.restitution}for(let a=1;a<Ut;a++){let e=et[a].mat;switch(e){case 4:case 17:case 14:case 13:case 9:Zt[a]=y.char+a%3;break;case 15:Zt[a]=y.char;break;default:Zt[a]=0}switch(e){case 1:case 12:case 3:case 11:dt[a]=y.rubbleConcrete+a%3;break;case 2:dt[a]=y.rubbleBrick+a%2;break;case 8:case 9:case 10:dt[a]=y.rubbleDirt+a%2;break;case 4:dt[a]=y.rubbleWood+a%2;break;case 5:case 6:dt[a]=y.scrap+a%2;break;default:dt[a]=0}}var Jt=new Uint8Array(256);for(let a=1;a<Ut;a++){let e=et[a],t=e.name,r=0;switch(e.mat){case 2:r=t.startsWith("mortar")?4:1;break;case 4:r=t.startsWith("bark")?7:2;break;case 1:r=t.startsWith("epoxy")?0:4;break;case 12:r=t.startsWith("line")?4:5;break;case 9:r=6;break;case 8:case 10:case 20:case 11:r=7;break;case 14:r=10;break;case 3:r=t.startsWith("ceiling")?8:0;break;case 5:t.startsWith("galv")||t.startsWith("sheet")?r=3:t.startsWith("container")?r=11:(t.startsWith("rust")||t.startsWith("steel")||t.startsWith("rail"))&&(r=9);break;case 6:r=t.startsWith("cast")?9:0;break}Jt[a]=r}function Y(a,e){let t=$t[a];return t>1?a+e%t:a}function V(){let a=new Float32Array(16);return a[0]=a[5]=a[10]=a[15]=1,a}function kt(a,e,t){let r=e[0],s=e[1],n=e[2],i=e[3],o=e[4],l=e[5],h=e[6],u=e[7],m=e[8],d=e[9],f=e[10],b=e[11],p=e[12],x=e[13],v=e[14],g=e[15];for(let w=0;w<4;w++){let E=t[w*4],F=t[w*4+1],S=t[w*4+2],C=t[w*4+3];a[w*4+0]=E*r+F*o+S*m+C*p,a[w*4+1]=E*s+F*l+S*d+C*x,a[w*4+2]=E*n+F*h+S*f+C*v,a[w*4+3]=E*i+F*u+S*b+C*g}return a}function te(a,e){let t=e[0],r=e[1],s=e[2],n=e[3],i=e[4],o=e[5],l=e[6],h=e[7],u=e[8],m=e[9],d=e[10],f=e[11],b=e[12],p=e[13],x=e[14],v=e[15],g=t*o-r*i,w=t*l-s*i,E=t*h-n*i,F=r*l-s*o,S=r*h-n*o,C=s*h-n*l,D=u*p-m*b,T=u*x-d*b,U=u*v-f*b,R=m*x-d*p,_=m*v-f*p,L=d*v-f*x,P=g*L-w*_+E*R+F*U-S*T+C*D;return P?(P=1/P,a[0]=(o*L-l*_+h*R)*P,a[1]=(s*_-r*L-n*R)*P,a[2]=(p*C-x*S+v*F)*P,a[3]=(d*S-m*C-f*F)*P,a[4]=(l*U-i*L-h*T)*P,a[5]=(t*L-s*U+n*T)*P,a[6]=(x*E-b*C-v*w)*P,a[7]=(u*C-d*E+f*w)*P,a[8]=(i*_-o*U+h*D)*P,a[9]=(r*U-t*_-n*D)*P,a[10]=(b*S-p*E+v*g)*P,a[11]=(m*E-u*S-f*g)*P,a[12]=(o*T-i*R-l*D)*P,a[13]=(t*R-r*T+s*D)*P,a[14]=(p*w-b*F-x*g)*P,a[15]=(u*F-m*w+d*g)*P,a):null}function Ae(a,e,t,r,s){let n=1/Math.tan(e/2);return a.fill(0),a[0]=n/t,a[5]=n,a[10]=(s+r)/(r-s),a[11]=-1,a[14]=2*s*r/(r-s),a}function Ee(a,e,t,r,s,n,i){return a.fill(0),a[0]=2/(t-e),a[5]=2/(s-r),a[10]=-2/(i-n),a[12]=-(t+e)/(t-e),a[13]=-(s+r)/(s-r),a[14]=-(i+n)/(i-n),a[15]=1,a}function Ft(a,e,t,r,s,n,i,o,l,h){let u=e-s,m=t-n,d=r-i,f=Math.hypot(u,m,d);u/=f,m/=f,d/=f;let b=l*d-h*m,p=h*u-o*d,x=o*m-l*u;f=Math.hypot(b,p,x),f<1e-9?(b=1,p=0,x=0):(b/=f,p/=f,x/=f);let v=m*x-d*p,g=d*b-u*x,w=u*p-m*b;return a[0]=b,a[1]=v,a[2]=u,a[3]=0,a[4]=p,a[5]=g,a[6]=m,a[7]=0,a[8]=x,a[9]=w,a[10]=d,a[11]=0,a[12]=-(b*e+p*t+x*r),a[13]=-(v*e+g*t+w*r),a[14]=-(u*e+m*t+d*r),a[15]=1,a}function ut(a,e,t){let r=Math.imul(a|0,2376512323)^Math.imul(e|0,3625334849)^Math.imul(t|0,3407524639);return r=Math.imul(r^r>>>15,739982445),r=Math.imul(r^r>>>12,695872825),(r^r>>>15)>>>0}var _t=(a,e,t)=>ut(a,e,t)/4294967296,Lt=class{constructor(e=1){c(this,"s");this.s=e>>>0}next(){let e=(this.s+=1831565813)>>>0;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}range(e,t){return e+(t-e)*this.next()}int(e,t){return Math.floor(e+(t-e+1)*this.next())}chance(e){return this.next()<e}pick(e){return e[Math.floor(this.next()*e.length)]}};function Ke(a,e,t=0){let r=Math.floor(a),s=Math.floor(e),n=a-r,i=e-s,o=n*n*(3-2*n),l=i*i*(3-2*i),h=_t(r,s,t),u=_t(r+1,s,t),m=_t(r,s+1,t),d=_t(r+1,s+1,t);return h+(u-h)*o+(m-h)*l+(h-u-m+d)*o*l}function Se(a,e,t,r=0){let s=0,n=.5,i=1,o=0;for(let l=0;l<t;l++)s+=n*Ke(a*i,e*i,r+l*17),o+=n,n*=.5,i*=2.03;return s/o}var ee=4096,zt=8,Bt=class{constructor(e){this.canvas=e;c(this,"gl");c(this,"pool");c(this,"multiDraw");c(this,"settings",{scale:1,shadows:!0,shadowSize:2048,ssao:!0,taa:!0,bloom:!0,edge:.07});c(this,"palAlbedo");c(this,"palParams");c(this,"xformTex");c(this,"xformData",new Float32Array(ee*zt*4));c(this,"xformDirtyMax",0);c(this,"freeSlots",[]);c(this,"nextSlot",1);c(this,"pG");c(this,"pShadow");c(this,"pLight");c(this,"pSSAO");c(this,"pBlur");c(this,"pGlass");c(this,"pTAA");c(this,"pBloomDown");c(this,"pBloomUp");c(this,"pFinal");c(this,"pCopy");c(this,"emptyVao");c(this,"w",0);c(this,"h",0);c(this,"canvasW",0);c(this,"canvasH",0);c(this,"gAlbedo");c(this,"gNormal");c(this,"gMat");c(this,"gDepth");c(this,"gFbo");c(this,"hdr");c(this,"linDepth");c(this,"lightFbo");c(this,"forwardFbo");c(this,"ssaoA");c(this,"ssaoB");c(this,"hist",[]);c(this,"histIdx",0);c(this,"bloomMips",[]);c(this,"shadowTex",null);c(this,"shadowFbos",[]);c(this,"shadowSize",0);c(this,"viewProj",V());c(this,"invViewProj",V());c(this,"prevViewProj",V());c(this,"prevValid",!1);c(this,"reproj",V());c(this,"tmp",V());c(this,"frustum",new Tt);c(this,"cascadeVP",[V(),V(),V(),V()]);c(this,"cascadeVPFlat",new Float32Array(16*K));c(this,"cascadeSplits",[10,30,85,220]);c(this,"cascadeTexel",new Float32Array(K));c(this,"cascadeFrame",0);c(this,"lightPos",new Float32Array(ct*4));c(this,"lightCol",new Float32Array(ct*4));c(this,"firsts",new Int32Array(4096));c(this,"counts",new Int32Array(4096));c(this,"drawN",0);c(this,"frame",0);c(this,"jx",0);c(this,"jy",0);c(this,"time",0);c(this,"flash",0);c(this,"damage",0);c(this,"stats",{drawn:0,quads:0,shadowDraws:0});c(this,"forwardPasses",[]);c(this,"cam");c(this,"env");let t=e.getContext("webgl2",{antialias:!1,alpha:!1,depth:!1,stencil:!1,powerPreference:"high-performance",preserveDrawingBuffer:!1});if(!t)throw new Error("WebGL2 is not supported by this browser.");if(this.gl=t,!t.getExtension("EXT_color_buffer_float"))throw new Error("EXT_color_buffer_float not supported.");t.getExtension("OES_texture_float_linear"),this.multiDraw=t.getExtension("WEBGL_multi_draw"),this.pool=new tt(t,512),this.emptyVao=t.createVertexArray();let r=new Uint8Array(256*4),s=new Uint8Array(256*4);for(let i=0;i<Ut;i++){let o=et[i];r[i*4]=o.r,r[i*4+1]=o.g,r[i*4+2]=o.b,r[i*4+3]=255,s[i*4]=Math.round(o.rough*255),s[i*4+1]=Math.round(o.metal*255),s[i*4+2]=Math.min(255,Math.round(o.emissive/16*255)),s[i*4+3]=Jt[i]}this.palAlbedo=q(t,256,1,t.SRGB8_ALPHA8,t.RGBA,t.UNSIGNED_BYTE,{filter:t.NEAREST},r),this.palParams=q(t,256,1,t.RGBA8,t.RGBA,t.UNSIGNED_BYTE,{filter:t.NEAREST},s);let n=this.xformData;for(let i=0;i<2;i++)n[i*12+0]=.1,n[i*12+5]=.1,n[i*12+10]=.1;this.xformTex=q(t,zt,ee,t.RGBA32F,t.RGBA,t.FLOAT,{filter:t.NEAREST},n),this.pG=new I(t,Kt,ue,"gbuffer"),this.pShadow=new I(t,he,me,"shadow"),this.pLight=new I(t,J,pe.replace("out vec4 oColor;",`layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oLin;`).replace(/oColor = vec4\(fullSky\(rd\), 1\.0\);\n    return;/,`oColor = vec4(fullSky(rd), 1.0); oLin = vec4(1e5);
    return;`).replace(`oColor = vec4(col, 1.0);
}`,`oColor = vec4(col, 1.0); oLin = vec4(dist);
}`),"lighting"),this.pSSAO=new I(t,J,be,"ssao"),this.pBlur=new I(t,J,de,"ssaoBlur"),this.pGlass=new I(t,Kt,ve,"glass"),this.pTAA=new I(t,J,xe,"taa"),this.pBloomDown=new I(t,J,ye,"bloomDown"),this.pBloomUp=new I(t,J,ge,"bloomUp"),this.pFinal=new I(t,J,we,"final"),this.pCopy=new I(t,J,Me,"copy")}allocSlot(){return this.freeSlots.pop()??(this.nextSlot<ee?this.nextSlot++:-1)}freeSlot(e){e>0&&this.freeSlots.push(e)}setXform(e,t,r){let s=e*zt*4,n=this.xformData;for(let i=0;i<12;i++)n[s+i]=t[i],n[s+12+i]=r[i];e+1>this.xformDirtyMax&&(this.xformDirtyMax=e+1)}resize(){let e=this.gl,t=Math.min(window.devicePixelRatio||1,2),r=Math.max(1,Math.floor(this.canvas.clientWidth*t)),s=Math.max(1,Math.floor(this.canvas.clientHeight*t)),n=Math.max(1,Math.floor(r*this.settings.scale)),i=Math.max(1,Math.floor(s*this.settings.scale));if((this.canvas.width!==r||this.canvas.height!==s)&&(this.canvas.width=r,this.canvas.height=s),this.canvasW=r,this.canvasH=s,n===this.w&&i===this.h)return;this.w=n,this.h=i;let o=e.LINEAR,l=e.NEAREST;this.gAlbedo=q(e,n,i,e.RGBA8,e.RGBA,e.UNSIGNED_BYTE,{filter:l}),this.gNormal=q(e,n,i,e.RGBA8,e.RGBA,e.UNSIGNED_BYTE,{filter:l}),this.gMat=q(e,n,i,e.RGBA16F,e.RGBA,e.HALF_FLOAT,{filter:l}),this.gDepth=q(e,n,i,e.DEPTH_COMPONENT32F,e.DEPTH_COMPONENT,e.FLOAT,{filter:l}),this.gFbo=bt(e,[this.gAlbedo,this.gNormal,this.gMat],this.gDepth),this.hdr=q(e,n,i,e.RGBA16F,e.RGBA,e.HALF_FLOAT,{filter:o}),this.linDepth=q(e,n,i,e.R32F,e.RED,e.FLOAT,{filter:l}),this.lightFbo=bt(e,[this.hdr,this.linDepth],null),this.forwardFbo=bt(e,[this.hdr],this.gDepth);let h=Math.max(1,n>>1),u=Math.max(1,i>>1);this.ssaoA=this.target(h,u,e.R8,e.RED,e.UNSIGNED_BYTE,o),this.ssaoB=this.target(h,u,e.R8,e.RED,e.UNSIGNED_BYTE,o),this.hist=[this.target(n,i,e.RGBA16F,e.RGBA,e.HALF_FLOAT,o),this.target(n,i,e.RGBA16F,e.RGBA,e.HALF_FLOAT,o)],this.prevValid=!1,this.bloomMips=[];let m=h,d=u;for(let f=0;f<6&&m>=4&&d>=4;f++)this.bloomMips.push(this.target(m,d,e.RGBA16F,e.RGBA,e.HALF_FLOAT,o)),m>>=1,d>>=1}target(e,t,r,s,n,i){let o=q(this.gl,e,t,r,s,n,{filter:i});return{tex:o,fbo:bt(this.gl,[o],null),w:e,h:t}}ensureShadow(){let e=this.settings.shadowSize;if(this.shadowTex&&this.shadowSize===e)return;let t=this.gl;this.shadowTex&&(t.deleteTexture(this.shadowTex),this.shadowFbos.forEach(s=>t.deleteFramebuffer(s)));let r=t.createTexture();t.bindTexture(t.TEXTURE_2D_ARRAY,r),t.texStorage3D(t.TEXTURE_2D_ARRAY,1,t.DEPTH_COMPONENT24,e,e,K),t.texParameteri(t.TEXTURE_2D_ARRAY,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D_ARRAY,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D_ARRAY,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D_ARRAY,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D_ARRAY,t.TEXTURE_COMPARE_MODE,t.COMPARE_REF_TO_TEXTURE),t.texParameteri(t.TEXTURE_2D_ARRAY,t.TEXTURE_COMPARE_FUNC,t.LEQUAL),this.shadowTex=r,this.shadowFbos=[];for(let s=0;s<K;s++)this.shadowFbos.push(bt(t,[],r,s));this.shadowSize=e,this.cascadeFrame=0}beginList(){this.drawN=0}add(e,t){if(!(t<=0)){if(this.drawN>=this.firsts.length){let r=new Int32Array(this.firsts.length*2);r.set(this.firsts),this.firsts=r;let s=new Int32Array(this.counts.length*2);s.set(this.counts),this.counts=s}this.firsts[this.drawN]=e*6,this.counts[this.drawN]=t*6,this.drawN++}}flush(){let e=this.gl,t=this.drawN;if(t!==0){if(this.multiDraw)this.multiDraw.multiDrawArraysWEBGL(e.TRIANGLES,this.firsts,0,this.counts,0,t);else for(let r=0;r<t;r++)e.drawArrays(e.TRIANGLES,this.firsts[r],this.counts[r]);this.drawN=0}}collect(e,t,r,s,n,i,o,l){let h=0,u=e.active,m=e.bounds;for(let d=0;d<u.length;d++){let f=u[d],b=s?e.nTr[f]:e.nOp[f];if(b===0)continue;let p=f*6;if(n>0){let v=Math.max(m[p]-i,0,i-m[p+3]),g=Math.max(m[p+1]-o,0,o-m[p+4]),w=Math.max(m[p+2]-l,0,l-m[p+5]);if(v*v+g*g+w*w>n)continue}if(!r.testBox(m[p],m[p+1],m[p+2],m[p+3],m[p+4],m[p+5]))continue;let x=e.start[f]+(s?e.nOp[f]:0);this.add(x,b),h+=b}for(let d=0;d<t.length;d++){let f=t[d],b=s?f.nTr:f.nOp;b!==0&&r.testSphere(f.x,f.y,f.z,f.r)&&(this.add(f.start+(s?f.nOp:0),b),h+=b)}return h}bindQuadData(e){e.tex("uQuads",0,this.pool.tex),e.tex("uXforms",1,this.xformTex)}fullscreen(){this.gl.drawArrays(this.gl.TRIANGLES,0,3)}render(e,t,r,s,n,i){let o=this.gl;this.resize(),this.cam=e,this.env=t,this.time+=i,this.frame++;let l=this.w,h=this.h;if(o.bindVertexArray(this.emptyVao),this.xformDirtyMax>0&&(o.bindTexture(o.TEXTURE_2D,this.xformTex),o.texSubImage2D(o.TEXTURE_2D,0,0,0,zt,this.xformDirtyMax,o.RGBA,o.FLOAT,this.xformData,0),this.xformDirtyMax=0),kt(this.viewProj,e.proj,e.view),te(this.invViewProj,this.viewProj),this.prevValid||this.prevViewProj.set(this.viewProj),this.settings.taa){let v=Te(this.frame%8+1,2)-.5,g=Te(this.frame%8+1,3)-.5;this.jx=v*2/l,this.jy=g*2/h}else this.jx=0,this.jy=0;this.frustum.setFromMatrix(this.viewProj),this.settings.shadows&&this.renderShadows(e,t,s,n),o.bindFramebuffer(o.FRAMEBUFFER,this.gFbo),o.viewport(0,0,l,h),o.clearColor(0,0,0,0),o.clearDepth(1),o.depthMask(!0),o.colorMask(!0,!0,!0,!0),o.clear(o.COLOR_BUFFER_BIT|o.DEPTH_BUFFER_BIT),o.enable(o.DEPTH_TEST),o.depthFunc(o.LESS),o.enable(o.CULL_FACE),o.cullFace(o.BACK),o.disable(o.BLEND);let u=this.pG.use();this.bindQuadData(u),u.m4("uViewProj",this.viewProj).m4("uPrevViewProj",this.prevViewProj).f2("uJitter",this.jx,this.jy),u.tex("uPalAlbedo",2,this.palAlbedo).tex("uPalParams",3,this.palParams).f("uEdge",this.settings.edge),this.beginList(),this.stats.quads=this.collect(s,n,this.frustum,!1,0,e.x,e.y,e.z),this.stats.drawn=this.drawN,this.flush(),this.settings.ssao&&this.renderSSAO(e),o.disable(o.DEPTH_TEST),o.disable(o.CULL_FACE),o.bindFramebuffer(o.FRAMEBUFFER,this.lightFbo),o.viewport(0,0,l,h);let m=this.pLight.use();this.setEnvUniforms(m,t,e),m.tex("uAlbedo",0,this.gAlbedo).tex("uNormal",1,this.gNormal).tex("uMat",2,this.gMat).tex("uDepth",3,this.gDepth).tex("uSSAO",4,this.ssaoA?this.ssaoA.tex:null).tex("uShadow",5,this.shadowTex,o.TEXTURE_2D_ARRAY),m.m4("uInvViewProj",this.invViewProj),this.setCascadeUniforms(m),m.i("uUseSSAO",this.settings.ssao?1:0).f("uShadowSoft",1).i("uFrame",this.frame);let d=Math.min(r.length,ct);for(let v=0;v<d;v++){let g=r[v];this.lightPos[v*4]=g.x,this.lightPos[v*4+1]=g.y,this.lightPos[v*4+2]=g.z,this.lightPos[v*4+3]=g.radius,this.lightCol[v*4]=g.r,this.lightCol[v*4+1]=g.g,this.lightCol[v*4+2]=g.b,this.lightCol[v*4+3]=0}m.f4v("uLightPos",this.lightPos).f4v("uLightCol",this.lightCol).i("uLightCount",d),this.settings.shadows||this.ensureShadow(),this.fullscreen(),o.bindFramebuffer(o.FRAMEBUFFER,this.forwardFbo),o.viewport(0,0,l,h),o.enable(o.DEPTH_TEST),o.depthMask(!1),o.enable(o.BLEND),o.blendFuncSeparate(o.SRC_ALPHA,o.ONE_MINUS_SRC_ALPHA,o.ZERO,o.ONE),o.disable(o.CULL_FACE);let f=this.pGlass.use();this.bindQuadData(f),f.m4("uViewProj",this.viewProj).m4("uPrevViewProj",this.prevViewProj).f2("uJitter",this.jx,this.jy),f.tex("uPalAlbedo",2,this.palAlbedo).tex("uPalParams",3,this.palParams).f("uEdge",this.settings.edge),f.tex("uShadow",5,this.shadowTex,o.TEXTURE_2D_ARRAY),this.setEnvUniforms(f,t,e),this.setCascadeUniforms(f),this.beginList(),this.collect(s,n,this.frustum,!0,0,e.x,e.y,e.z),this.flush();for(let v of this.forwardPasses)v.draw(this);o.depthMask(!0),o.disable(o.BLEND),o.disable(o.DEPTH_TEST);let b=this.hdr;if(this.settings.taa){let v=this.hist[this.histIdx],g=this.hist[1-this.histIdx];o.bindFramebuffer(o.FRAMEBUFFER,g.fbo),o.viewport(0,0,l,h),kt(this.reproj,this.prevViewProj,this.invViewProj),this.pTAA.use().tex("uCurrent",0,this.hdr).tex("uHistory",1,v.tex).tex("uMat",2,this.gMat).tex("uDepth",3,this.gDepth).f2("uTexel",1/l,1/h).f("uBlend",.1).i("uReset",this.prevValid?0:1).m4("uReproj",this.reproj),this.fullscreen(),this.histIdx=1-this.histIdx,b=g.tex}let p=null;if(this.settings.bloom&&this.bloomMips.length>1){let v=this.pBloomDown.use(),g=b,w=l,E=h;for(let S=0;S<this.bloomMips.length;S++){let C=this.bloomMips[S];o.bindFramebuffer(o.FRAMEBUFFER,C.fbo),o.viewport(0,0,C.w,C.h),v.tex("uSrc",0,g).f2("uTexel",1/w,1/E).i("uFirst",S===0?1:0).f("uThreshold",1),this.fullscreen(),g=C.tex,w=C.w,E=C.h}let F=this.pBloomUp.use();o.enable(o.BLEND),o.blendFunc(o.ONE,o.ONE);for(let S=this.bloomMips.length-1;S>0;S--){let C=this.bloomMips[S],D=this.bloomMips[S-1];o.bindFramebuffer(o.FRAMEBUFFER,D.fbo),o.viewport(0,0,D.w,D.h),F.tex("uSrc",0,C.tex).f2("uTexel",1/C.w,1/C.h).f("uRadius",1),this.fullscreen()}o.disable(o.BLEND),p=this.bloomMips[0].tex}o.bindFramebuffer(o.FRAMEBUFFER,null),o.viewport(0,0,this.canvasW,this.canvasH),this.pFinal.use().tex("uScene",0,b).tex("uBloom",1,p??b).f("uExposure",t.exposure).f("uBloomStrength",p?.06:0).f("uTime",this.time).f2("uRes",this.canvasW,this.canvasH).f("uFlash",this.flash).f("uDamage",this.damage),this.fullscreen(),this.prevViewProj.set(this.viewProj),this.prevValid=!0}invalidateHistory(){this.prevValid=!1}setEnvUniforms(e,t,r){e.v3("uSunDir",t.sunDir).v3("uSunColor",t.sunColor).v3("uSkyZenith",t.skyZenith).v3("uSkyHorizon",t.skyHorizon).v3("uGroundColor",t.groundColor).v3("uFogColor",t.fogColor).f("uFogDensity",t.fogDensity).f("uFogHeight",t.fogHeight).f("uTime",this.time).f3("uCamPos",r.x,r.y,r.z).f("uAmbient",t.ambient)}setCascadeUniforms(e){for(let r=0;r<K;r++)this.cascadeVPFlat.set(this.cascadeVP[r],r*16);this.gl.uniformMatrix4fv(e.loc("uCascadeVP[0]"),!1,this.cascadeVPFlat);let t=this.cascadeSplits;e.f4("uCascadeSplits",t[0],t[1],t[2],this.settings.shadows?t[3]:-1),this.gl.uniform1fv(e.loc("uCascadeTexel[0]"),this.cascadeTexel)}renderShadows(e,t,r,s){let n=this.gl;this.ensureShadow();let i=this.shadowSize,o=this.pShadow.use();this.bindQuadData(o),n.enable(n.DEPTH_TEST),n.depthFunc(n.LESS),n.depthMask(!0),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.colorMask(!1,!1,!1,!1),n.enable(n.POLYGON_OFFSET_FILL),n.polygonOffset(1,2);let l=t.sunDir,h=e.view,u=-h[2],m=-h[6],d=-h[10],f=Math.tan(e.fov/2),b=f*e.aspect,p=new Tt;this.stats.shadowDraws=0;let x=e.near;for(let v=0;v<K;v++){let g=this.cascadeSplits[v];if(v<2||this.cascadeFrame%(v===2?2:4)===(v===2?0:1)||this.cascadeFrame<4){let E=(x+g)*.5,F=1+b*b+f*f,S=E*(1+(b*b+f*f));S>g&&(S=g);let C=Math.sqrt((g-S)*(g-S)+g*g*(F-1)),D=Math.sqrt((S-x)*(S-x)+x*x*(F-1)),T=Math.max(C,D);T=Math.ceil(T*16)/16;let U=e.x+u*S,R=e.y+m*S,_=e.z+d*S,L=Ft(this.tmp,0,0,0,-l[0],-l[1],-l[2],0,1,0),P=T*2/i,at=L[0]*U+L[4]*R+L[8]*_,Q=L[1]*U+L[5]*R+L[9]*_,nt=L[2]*U+L[6]*R+L[10]*_;at=Math.floor(at/P)*P,Q=Math.floor(Q/P)*P,U=L[0]*at+L[1]*Q+L[2]*nt,R=L[4]*at+L[5]*Q+L[6]*nt,_=L[8]*at+L[9]*Q+L[10]*nt;let ot=T+150,Xt=Ft(V(),U+l[0]*ot,R+l[1]*ot,_+l[2]*ot,U,R,_,0,1,0),H=Ee(V(),-T,T,-T,T,.5,ot+T+60);kt(this.cascadeVP[v],H,Xt),this.cascadeTexel[v]=P,n.bindFramebuffer(n.FRAMEBUFFER,this.shadowFbos[v]),n.viewport(0,0,i,i),n.clear(n.DEPTH_BUFFER_BIT),o.m4("uLightVP",this.cascadeVP[v]),p.setFromMatrix(this.cascadeVP[v]),this.beginList(),this.collect(r,s,p,!1,0,e.x,e.y,e.z),this.stats.shadowDraws+=this.drawN,this.flush()}x=g}this.cascadeFrame++,n.disable(n.POLYGON_OFFSET_FILL),n.colorMask(!0,!0,!0,!0),n.cullFace(n.BACK)}renderSSAO(e){let t=this.gl;t.disable(t.DEPTH_TEST),t.disable(t.CULL_FACE);let r=this.ssaoA,s=this.ssaoB;t.bindFramebuffer(t.FRAMEBUFFER,s.fbo),t.viewport(0,0,s.w,s.h);let n=te(V(),e.proj);this.pSSAO.use().tex("uDepth",0,this.gDepth).tex("uNormal",1,this.gNormal).m4("uProj",e.proj).m4("uInvProj",n).m4("uView",e.view).f2("uTexel",1/s.w,1/s.h).f("uRadius",.55).i("uFrame",this.frame),this.fullscreen();let o=this.pBlur.use();o.f("uNear",e.near).f("uFar",e.far),t.bindFramebuffer(t.FRAMEBUFFER,r.fbo),o.tex("uAO",0,s.tex).tex("uDepth",1,this.gDepth).f2("uTexel",1/r.w,1/r.h).f2("uDir",1,0),this.fullscreen(),t.bindFramebuffer(t.FRAMEBUFFER,s.fbo),o.tex("uAO",0,r.tex).f2("uDir",0,1),this.fullscreen(),this.ssaoA=s,this.ssaoB=r}get jitter(){return[this.jx,this.jy]}};function Te(a,e){let t=1,r=0;for(;a>0;)t/=e,r+=t*(a%e),a=Math.floor(a/e);return r}var Nt=2;var O=[];O[0]=[y.asphalt,y.gravel,y.gravel];O[1]=[y.asphaltPatch,y.gravel,y.gravel];O[2]=[y.lineWhite,y.asphalt,y.gravel,y.gravel];O[3]=[y.lineYellow,y.asphalt,y.gravel,y.gravel];O[4]=[y.concrete,y.concrete,y.concreteMid,y.gravel];O[5]=[y.concreteDark,y.concreteMid,y.concreteMid,y.gravel];O[6]=[y.gravel,y.gravel,y.dirt];O[7]=[y.dirt,y.dirt];O[8]=[y.grass,y.dirt,y.dirt];O[9]=[y.grassDry,y.dirt,y.dirt];O[10]=[y.mud,y.mud,y.dirtDark];O[11]=[y.sand,y.sand,y.dirt];O[12]=[y.ballast,y.ballast,y.gravel];O[13]=[y.coal,y.coal,y.coal,y.dirtDark];O[14]=[y.rock,y.rock,y.rock];var Dt=new Uint8Array(120),re=new Uint8Array(15);for(let a=0;a<15;a++){let e=O[a];re[a]=e.length;for(let t=0;t<e.length;t++)Dt[a*8+t]=e[t]}var Gt=class{constructor(e,t,r){this.sx=e;this.sz=t;c(this,"height");c(this,"ground");this.height=new Int16Array(e*t).fill(r),this.ground=new Uint8Array(e*t).fill(8)}heightAt(e,t){return e<0||t<0||e>=this.sx||t>=this.sz?0:this.height[e+t*this.sx]}eval(e,t,r){if(t<Nt)return y.bedrock;let s=e+r*this.sx,n=this.height[s];if(t>=n)return 0;let i=n-1-t,o=this.ground[s],l=ut(e,t,r);return i<re[o]?i===0?Dt[o*8]:Y(Dt[o*8+i],l):(l&63)===0?Y(y.rock,l>>>8):i>14?Y(y.dirtDark,l>>>8):Y(y.dirt,l>>>8)}fillColumn(e,t,r,s,n,i,o){let l=e+t*this.sx,h=this.height[l],u=this.ground[l],m=re[u],d=u*8,f=Math.min(s,h);for(let b=r;b<f;b++,i+=o){if(b<Nt){n[i]=y.bedrock;continue}let p=h-1-b,x=ut(e,b,t);p<m?n[i]=p===0?Dt[d]:Y(Dt[d+p],x):(x&63)===0?n[i]=Y(y.rock,x>>>8):n[i]=p>14?Y(y.dirtDark,x>>>8):Y(y.dirt,x>>>8)}}rangeIn(e,t,r,s){let n=1073741824,i=-1;for(let o=t;o<=s;o++){let l=o*this.sx;for(let h=e;h<=r;h++){let u=this.height[l+h];u<n&&(n=u),u>i&&(i=u)}}return[n,i]}};var st=.1;var ie=4;var se=4096,Z=32,k=5;var Vt=class{constructor(e,t,r,s){this.sx=e;this.sy=t;this.sz=r;c(this,"ncx");c(this,"ncy");c(this,"ncz");c(this,"nchunks");c(this,"nrx");c(this,"nry");c(this,"nrz");c(this,"nregions");c(this,"kind");c(this,"uni");c(this,"data");c(this,"count");c(this,"regionDirty");c(this,"dirtyQueue",[]);c(this,"terrain");c(this,"changeBoxes",[]);c(this,"edits",0);this.ncx=e>>ie,this.ncy=t>>ie,this.ncz=r>>ie,this.nchunks=this.ncx*this.ncy*this.ncz,this.nrx=e>>k,this.nry=t>>k,this.nrz=r>>k,this.nregions=this.nrx*this.nry*this.nrz,this.kind=new Uint8Array(this.nchunks),this.uni=new Uint8Array(this.nchunks),this.data=new Array(this.nchunks).fill(null),this.count=new Int32Array(this.nchunks),this.regionDirty=new Uint8Array(this.nregions),this.terrain=new Gt(e,r,s)}initTerrain(){let e=this.terrain;for(let t=0;t<this.ncz;t++)for(let r=0;r<this.ncx;r++){let[,s]=e.rangeIn(r<<4,t<<4,(r<<4)+15,(t<<4)+15);for(let n=0;n<this.ncy;n++){let i=r+this.ncx*(t+this.ncz*n),o=n<<4;this.data[i]=null,this.kind[i]=o<s||o<Nt?3:0}}}chunkIndex(e,t,r){return e+this.ncx*(r+this.ncz*t)}regionIndex(e,t,r){return e+this.nrx*(r+this.nrz*t)}inBounds(e,t,r){return e>=0&&t>=0&&r>=0&&e<this.sx&&t<this.sy&&r<this.sz}get(e,t,r){if((e|t|r)<0||e>=this.sx||t>=this.sy||r>=this.sz)return this.outside(e,t,r);let s=(e>>4)+this.ncx*((r>>4)+this.ncz*(t>>4)),n=this.kind[s];return n===2?this.data[s][e&15|(r&15)<<4|(t&15)<<8]:n===0?0:n===1?this.uni[s]:this.terrain.eval(e,t,r)}outside(e,t,r){if(t<0)return y.bedrock;if(t>=this.sy)return 0;let s=e<0?0:e>=this.sx?this.sx-1:e,n=r<0?0:r>=this.sz?this.sz-1:r;return this.terrain.eval(s,t,n)}chunkMayBeSolid(e,t,r){if((e|t|r)<0)return t<0;if(e>=this.sx||t>=this.sy||r>=this.sz)return!1;let s=(e>>4)+this.ncx*((r>>4)+this.ncz*(t>>4)),n=this.kind[s];return n===0?!1:n===2?this.count[s]>0:n===1?this.uni[s]!==0:!0}materialize(e){let t=this.kind[e],r=new Uint8Array(se),s=0;if(t===1)r.fill(this.uni[e]),s=this.uni[e]?se:0;else if(t===3){let n=e%this.ncx,i=e/this.ncx|0,o=i%this.ncz,l=i/this.ncz|0,h=n<<4,u=l<<4,m=o<<4,d=this.terrain,f=0;for(let b=0;b<16;b++)for(let p=0;p<16;p++)for(let x=0;x<16;x++){let v=d.eval(h+x,u+b,m+p);r[f++]=v,v&&s++}}return this.data[e]=r,this.kind[e]=2,this.count[e]=s,r}set(e,t,r,s){if((e|t|r)<0||e>=this.sx||t>=this.sy||r>=this.sz)return 0;let n=(e>>4)+this.ncx*((r>>4)+this.ncz*(t>>4)),i;if(this.kind[n]!==2){let h=this.get(e,t,r);if(h===s)return h;i=this.materialize(n)}else i=this.data[n];let o=e&15|(r&15)<<4|(t&15)<<8,l=i[o];return l===s||(i[o]=s,this.edits++,l===0?this.count[n]++:s===0&&--this.count[n]===0&&(this.kind[n]=0,this.data[n]=null),this.markDirty(e,t,r)),l}markDirty(e,t,r){let s=Math.max(0,e-1>>k),n=Math.min(this.nrx-1,e+1>>k),i=Math.max(0,t-1>>k),o=Math.min(this.nry-1,t+1>>k),l=Math.max(0,r-1>>k),h=Math.min(this.nrz-1,r+1>>k);for(let u=i;u<=o;u++)for(let m=l;m<=h;m++)for(let d=s;d<=n;d++){let f=d+this.nrx*(m+this.nrz*u);this.regionDirty[f]||(this.regionDirty[f]=1,this.dirtyQueue.push(f))}}markBoxDirty(e,t,r,s,n,i){let o=Math.max(0,e-1>>k),l=Math.min(this.nrx-1,s+1>>k),h=Math.max(0,t-1>>k),u=Math.min(this.nry-1,n+1>>k),m=Math.max(0,r-1>>k),d=Math.min(this.nrz-1,i+1>>k);for(let f=h;f<=u;f++)for(let b=m;b<=d;b++)for(let p=o;p<=l;p++){let x=p+this.nrx*(b+this.nrz*f);this.regionDirty[x]||(this.regionDirty[x]=1,this.dirtyQueue.push(x))}}noteChange(e,t,r,s,n,i){this.changeBoxes.push(e,t,r,s,n,i)}copyBox(e,t,r,s,n,i,o){o.fill(0,0,s*n*i);let l=e+s,h=t+n,u=r+i,m=s*i;for(let d=t>>4;d<=h-1>>4;d++){let f=Math.max(t,d<<4),b=Math.min(h,(d<<4)+16);for(let p=r>>4;p<=u-1>>4;p++){let x=Math.max(r,p<<4),v=Math.min(u,(p<<4)+16);for(let g=e>>4;g<=l-1>>4;g++){let w=Math.max(e,g<<4),E=Math.min(l,(g<<4)+16),F=E-w;if(g<0||d<0||p<0||g>=this.ncx||d>=this.ncy||p>=this.ncz){for(let D=f;D<b;D++)for(let T=x;T<v;T++){let U=w-e+s*(T-r+i*(D-t));for(let R=w;R<E;R++)o[U++]=this.outside(R,D,T)}continue}let S=g+this.ncx*(p+this.ncz*d),C=this.kind[S];if(C!==0)if(C===1){let D=this.uni[S];if(!D)continue;for(let T=f;T<b;T++)for(let U=x;U<v;U++){let R=w-e+s*(U-r+i*(T-t));o.fill(D,R,R+F)}}else if(C===2){let D=this.data[S];for(let T=f;T<b;T++)for(let U=x;U<v;U++){let R=w&15|(U&15)<<4|(T&15)<<8,_=w-e+s*(U-r+i*(T-t));o.set(D.subarray(R,R+F),_)}}else{let D=this.terrain;for(let T=x;T<v;T++)for(let U=w;U<E;U++)D.fillColumn(U,T,f,b,o,U-e+s*(T-r+i*(f-t)),m)}}}}}gatherRegion(e,t,r,s){let n=Z+2,i=(e<<k)-1,o=(t<<k)-1,l=(r<<k)-1,h=!1,u=!0;for(let b=t*2;b<t*2+2;b++)for(let p=r*2;p<r*2+2;p++)for(let x=e*2;x<e*2+2;x++){let v=this.chunkIndex(x,b,p),g=this.kind[v];(g===3||g===2&&this.count[v]>0||g===1&&this.uni[v])&&(h=!0),g!==3&&(u=!1)}if(!h)return 0;if(u){let[b]=this.terrain.rangeIn(Math.max(0,i),Math.max(0,l),Math.min(this.sx-1,i+n-1),Math.min(this.sz-1,l+n-1));if(o+n<b)return 2}this.copyBox(i,o,l,n,n,n,s);let m=0,d=0,f=n*n*n;for(let b=0;b<f;b++){let p=s[b];p&&(m++,d|=pt[p])}return m===0?0:m===f&&!d?2:1}denseBytes(){let e=0;for(let t=0;t<this.nchunks;t++)this.kind[t]===2&&(e+=se);return e}};var Fe=`"use strict";(()=>{var At=Object.defineProperty;var Ut=(n,t,c)=>t in n?At(n,t,{enumerable:!0,configurable:!0,writable:!0,value:c}):n[t]=c;var L=(n,t,c)=>Ut(n,typeof t!="symbol"?t+"":t,c);var I=class{constructor(t=1024){L(this,"data");L(this,"count",0);this.data=new Uint32Array(t*4)}reset(){this.count=0}push(t,c,d,s){let h=this.count*4;if(h+4>this.data.length){let J=new Uint32Array(this.data.length*2);J.set(this.data),this.data=J}let A=this.data;A[h++]=t,A[h++]=c,A[h++]=d,A[h]=s,this.count++}slice(){return this.data.slice(0,this.count*4)}},kt=[[0,1,2,1],[0,2,1,-1],[1,2,0,1],[1,0,2,-1],[2,0,1,1],[2,1,0,-1]],ot=256,N=new Uint32Array(4096);function ct(n,t,c,d,s,h,A,J,$,it,ut){let Q=t+2,tt=d+2,F=[t,c,d],R=[1,Q*tt,Q],ft=1+Q+Q*tt,U=[0,0,0];for(let V=0;V<6;V++){let Z=kt[V],S=Z[0],W=Z[1],Y=Z[2],nt=Z[3],at=F[S],m=F[W],_=F[Y],et=R[S],r=R[W],i=R[Y],mt=nt*et;N.length<m*_&&(N=new Uint32Array(m*_));let y=N,lt=V<<8;for(let C=0;C<at;C++){let j=0,st=!1,bt=ft+C*et;for(let u=0;u<_;u++){let k=bt+u*i;for(let o=0;o<m;o++,k+=r){let f=n[k];if(f===0){y[j++]=0;continue}let e=k+mt,a=n[e],w=s[f];if(a!==0&&(w||!s[a])){y[j++]=0;continue}let p=f|w<<16;if(w)p|=65280;else{let M=n[e-r],l=n[e+r],b=n[e-i],g=n[e+i],q=M!==0&&!s[M]?1:0,v=l!==0&&!s[l]?1:0,P=b!==0&&!s[b]?1:0,B=g!==0&&!s[g]?1:0;if(q|v|P|B){let E=n[e-r-i],X=n[e+r-i],z=n[e-r+i],G=n[e+r+i],x=E!==0&&!s[E]?1:0,D=X!==0&&!s[X]?1:0,H=z!==0&&!s[z]?1:0,K=G!==0&&!s[G]?1:0,dt=q&&P?0:3-(q+P+x),ht=v&&P?0:3-(v+P+D),yt=q&&B?0:3-(q+B+H),pt=v&&B?0:3-(v+B+K);p|=dt<<8|ht<<10|yt<<12|pt<<14}else{let E=n[e-r-i],X=n[e+r-i],z=n[e-r+i],G=n[e+r+i],x=3-(E!==0&&!s[E]?1:0),D=3-(X!==0&&!s[X]?1:0),H=3-(z!==0&&!s[z]?1:0),K=3-(G!==0&&!s[G]?1:0);p|=x<<8|D<<10|H<<12|K<<14}}y[j++]=p,st=!0}}if(st){U[S]=C+(nt>0?1:0);for(let u=0;u<_;u++){let k=u*m;for(let o=0;o<m;o++){let f=y[k+o];if(f===0)continue;let e=1;for(;o+e<m&&e<ot&&y[k+o+e]===f;)e++;let a=1;t:for(;u+a<_&&a<ot;){let l=(u+a)*m+o;for(let b=0;b<e;b++)if(y[l+b]!==f)break t;a++}for(let l=0;l<a;l++){let b=(u+l)*m+o;for(let g=0;g<e;g++)y[b+g]=0}U[W]=o,U[Y]=u;let w=U[0]+h|U[1]+A<<16,p=(U[2]+J|e-1<<16|a-1<<24)>>>0,M=f&255|lt|(f>>>8&255)<<11|f>>>16<<19;f>>>16?ut.push(w,p,M,$):it.push(w,p,M,$),o+=e-1}}}}}}var rt=new Uint8Array(256),O=new I(8192),T=new I(1024);self.onmessage=n=>{let t=n.data;if(t.type==="init"){rt=t.transparent;return}O.reset(),T.reset(),ct(t.vox,t.sx,t.sy,t.sz,rt,t.ox,t.oy,t.oz,t.slot,O,T);let c=O.slice(),d=T.slice();self.postMessage({id:t.id,opaque:c,trans:d,vox:t.vox},[c.buffer,d.buffer,t.vox.buffer])};})();
`;var Rt=class{constructor(e=1024){c(this,"data");c(this,"count",0);this.data=new Uint32Array(e*4)}reset(){this.count=0}push(e,t,r,s){let n=this.count*4;if(n+4>this.data.length){let o=new Uint32Array(this.data.length*2);o.set(this.data),this.data=o}let i=this.data;i[n++]=e,i[n++]=t,i[n++]=r,i[n]=s,this.count++}slice(){return this.data.slice(0,this.count*4)}},Ze=[[0,1,2,1],[0,2,1,-1],[1,2,0,1],[1,0,2,-1],[2,0,1,1],[2,1,0,-1]],De=256,ae=new Uint32Array(4096);function Re(a,e,t,r,s,n,i,o,l,h,u){let m=e+2,d=r+2,f=[e,t,r],b=[1,m*d,m],p=1+m+m*d,x=[0,0,0];for(let v=0;v<6;v++){let g=Ze[v],w=g[0],E=g[1],F=g[2],S=g[3],C=f[w],D=f[E],T=f[F],U=b[w],R=b[E],_=b[F],L=S*U;ae.length<D*T&&(ae=new Uint32Array(D*T));let P=ae,at=v<<8;for(let Q=0;Q<C;Q++){let nt=0,ot=!1,Xt=p+Q*U;for(let H=0;H<T;H++){let ht=Xt+H*_;for(let X=0;X<D;X++,ht+=R){let j=a[ht];if(j===0){P[nt++]=0;continue}let B=ht+L,$=a[B],mt=s[j];if($!==0&&(mt||!s[$])){P[nt++]=0;continue}let lt=j|mt<<16;if(mt)lt|=65280;else{let vt=a[B-R],rt=a[B+R],it=a[B-_],ft=a[B+_],xt=vt!==0&&!s[vt]?1:0,yt=rt!==0&&!s[rt]?1:0,gt=it!==0&&!s[it]?1:0,wt=ft!==0&&!s[ft]?1:0;if(xt|yt|gt|wt){let Mt=a[B-R-_],At=a[B+R-_],Et=a[B-R+_],St=a[B+R+_],jt=Mt!==0&&!s[Mt]?1:0,qt=At!==0&&!s[At]?1:0,Yt=Et!==0&&!s[Et]?1:0,Qt=St!==0&&!s[St]?1:0,Ue=xt&&gt?0:3-(xt+gt+jt),_e=yt&&gt?0:3-(yt+gt+qt),Le=xt&&wt?0:3-(xt+wt+Yt),ke=yt&&wt?0:3-(yt+wt+Qt);lt|=Ue<<8|_e<<10|Le<<12|ke<<14}else{let Mt=a[B-R-_],At=a[B+R-_],Et=a[B-R+_],St=a[B+R+_],jt=3-(Mt!==0&&!s[Mt]?1:0),qt=3-(At!==0&&!s[At]?1:0),Yt=3-(Et!==0&&!s[Et]?1:0),Qt=3-(St!==0&&!s[St]?1:0);lt|=jt<<8|qt<<10|Yt<<12|Qt<<14}}P[nt++]=lt,ot=!0}}if(ot){x[w]=Q+(S>0?1:0);for(let H=0;H<T;H++){let ht=H*D;for(let X=0;X<D;X++){let j=P[ht+X];if(j===0)continue;let B=1;for(;X+B<D&&B<De&&P[ht+X+B]===j;)B++;let $=1;t:for(;H+$<T&&$<De;){let rt=(H+$)*D+X;for(let it=0;it<B;it++)if(P[rt+it]!==j)break t;$++}for(let rt=0;rt<$;rt++){let it=(H+rt)*D+X;for(let ft=0;ft<B;ft++)P[it+ft]=0}x[E]=X,x[F]=H;let mt=x[0]+n|x[1]+i<<16,lt=(x[2]+o|B-1<<16|$-1<<24)>>>0,vt=j&255|at|(j>>>8&255)<<11|j>>>16<<19;j>>>16?u.push(mt,lt,vt,l):h.push(mt,lt,vt,l),X+=B-1}}}}}}var ne=Z+2,Pe=ne*ne*ne,Wt=class Wt{constructor(e,t,r){this.world=e;this.pool=t;c(this,"start");c(this,"nOp");c(this,"nTr");c(this,"allocN");c(this,"bounds");c(this,"active",[]);c(this,"activePos");c(this,"inflight");c(this,"seq");c(this,"applied");c(this,"workers",[]);c(this,"load",[]);c(this,"jobs",new Map);c(this,"nextJob",1);c(this,"bufPool",[]);c(this,"sortedLen",-1);c(this,"opBuf",new Rt(8192));c(this,"trBuf",new Rt(1024));c(this,"combine",new Uint32Array(4096*4));c(this,"meshedCount",0);c(this,"quadCount",0);c(this,"camX",0);c(this,"camY",0);c(this,"camZ",0);let s=e.nregions;this.start=new Int32Array(s).fill(-1),this.nOp=new Int32Array(s),this.nTr=new Int32Array(s),this.allocN=new Int32Array(s),this.bounds=new Float32Array(s*6),this.activePos=new Int32Array(s).fill(-1),this.inflight=new Uint8Array(s),this.seq=new Uint32Array(s),this.applied=new Uint32Array(s);try{let n=URL.createObjectURL(new Blob([Fe],{type:"text/javascript"}));for(let i=0;i<r;i++){let o=new Worker(n);o.postMessage({type:"init",transparent:pt});let l=i;o.onmessage=h=>this.onResult(l,h.data),o.onerror=h=>{console.error("mesh worker error",h.message)},this.workers.push(o),this.load.push(0)}}catch(n){console.warn("Mesh workers unavailable, meshing on main thread",n)}}get pending(){return this.world.dirtyQueue.length+this.jobs.size}getBuf(){return this.bufPool.pop()??new Uint8Array(Pe)}update(e,t,r,s=2){let n=this.world,i=n.dirtyQueue;if(i.length===0)return;let o=Math.abs(e-this.camX)+Math.abs(t-this.camY)+Math.abs(r-this.camZ)>8;if(i.length!==this.sortedLen||o){this.camX=e,this.camY=t,this.camZ=r;let u=n.nrx,m=n.nrz,d=Z*st,f=p=>{let x=p%u,v=p/u|0,g=v%m,w=v/m|0,E=(x+.5)*d-e,F=(w+.5)*d-t,S=(g+.5)*d-r;return E*E+F*F+S*S},b=i.map(p=>({ri:p,d:f(p)}));b.sort((p,x)=>x.d-p.d);for(let p=0;p<i.length;p++)i[p]=b[p].ri}let l=[],h=0;for(;i.length>0;){let u=this.workers.length>0,m=-1;if(u){let E=Wt.MAX_INFLIGHT;for(let F=0;F<this.load.length;F++)this.load[F]<E&&(E=this.load[F],m=F);if(m<0)break}if(!u&&h>=s)break;let d=i.pop();if(this.inflight[d]){l.push(d);continue}n.regionDirty[d]=0;let f=d%n.nrx,b=d/n.nrx|0,p=b%n.nrz,x=b/n.nrz|0,v=this.getBuf(),g=n.gatherRegion(f,x,p,v),w=++this.seq[d];if(g!==1){this.bufPool.push(v),this.apply(d,w,null,null);continue}if(u){let E=this.nextJob++;this.jobs.set(E,{ri:d,seq:w,worker:m}),this.inflight[d]=1,this.load[m]++,this.workers[m].postMessage({type:"mesh",id:E,vox:v,sx:Z,sy:Z,sz:Z,ox:f<<k,oy:x<<k,oz:p<<k,slot:0},[v.buffer])}else this.opBuf.reset(),this.trBuf.reset(),Re(v,Z,Z,Z,pt,f<<k,x<<k,p<<k,0,this.opBuf,this.trBuf),this.bufPool.push(v),this.apply(d,w,this.opBuf.data.subarray(0,this.opBuf.count*4),this.trBuf.data.subarray(0,this.trBuf.count*4)),h++}for(let u of l)i.push(u);this.sortedLen=i.length}onResult(e,t){let r=this.jobs.get(t.id);this.load[e]--,t.vox&&t.vox.length===Pe&&this.bufPool.push(t.vox),r&&(this.jobs.delete(t.id),this.inflight[r.ri]=0,this.apply(r.ri,r.seq,t.opaque,t.trans))}apply(e,t,r,s){if(t<this.applied[e])return;this.applied[e]=t;let n=r?r.length>>2:0,i=s?s.length>>2:0,o=n+i;if(this.quadCount+=o-this.nOp[e]-this.nTr[e],this.meshedCount++,o===0){this.start[e]>=0&&(this.pool.free(this.start[e],this.allocN[e]),this.start[e]=-1,this.allocN[e]=0),this.nOp[e]=0,this.nTr[e]=0,this.setActive(e,!1);return}let l=this.allocN[e];(this.start[e]<0||tt.roundSize(o)>tt.roundSize(l)||tt.roundSize(l)>tt.roundSize(o)*2+64)&&(this.start[e]>=0&&this.pool.free(this.start[e],l),this.start[e]=this.pool.alloc(o),this.allocN[e]=o),this.combine.length<o*4&&(this.combine=new Uint32Array(Math.max(o*4,this.combine.length*2)));let h=this.combine;r&&h.set(r,0),s&&h.set(s,n*4),this.pool.upload(this.start[e],h,o),this.nOp[e]=n,this.nTr[e]=i,tr(h,o,this.bounds,e*6),this.setActive(e,!0)}setActive(e,t){let r=this.activePos[e];if(t)r<0&&(this.activePos[e]=this.active.length,this.active.push(e));else if(r>=0){let s=this.active.pop();s!==e&&(this.active[r]=s,this.activePos[s]=r),this.activePos[e]=-1}}};c(Wt,"MAX_INFLIGHT",6);var Ot=Wt,$e=[1,2,2,0,0,1],Je=[2,1,0,2,1,0];function tr(a,e,t,r){let s=1e9,n=1e9,i=1e9,o=-1e9,l=-1e9,h=-1e9,u=[0,0,0];for(let m=0;m<e;m++){let d=a[m*4],f=a[m*4+1],b=a[m*4+2];u[0]=d&65535,u[1]=d>>>16,u[2]=f&65535;let p=(f>>>16&255)+1,x=(f>>>24)+1,v=b>>>8&7;u[0]<s&&(s=u[0]),u[1]<n&&(n=u[1]),u[2]<i&&(i=u[2]),u[$e[v]]+=p,u[Je[v]]+=x,u[0]>o&&(o=u[0]),u[1]>l&&(l=u[1]),u[2]>h&&(h=u[2])}t[r]=s*st,t[r+1]=n*st,t[r+2]=i*st,t[r+3]=o*st,t[r+4]=l*st,t[r+5]=h*st}var G=a=>Math.round(a*10),Pt=class{constructor(e,t=1337){this.world=e;c(this,"rng");c(this,"onlyEmpty",!1);c(this,"written",0);this.rng=new Lt(t)}set(e,t,r,s){this.onlyEmpty&&this.world.get(e,t,r)!==0||(this.world.set(e,t,r,s),this.written++)}col(e,t,r,s){return typeof e=="number"?e:e(t,r,s)}box(e,t,r,s,n,i,o){s<e&&([e,s]=[s,e]),n<t&&([t,n]=[n,t]),i<r&&([r,i]=[i,r]);for(let l=t;l<n;l++)for(let h=r;h<i;h++)for(let u=e;u<s;u++){let m=this.col(o,u,l,h);m>=0&&this.set(u,l,h,m)}}clear(e,t,r,s,n,i){let o=this.onlyEmpty;this.onlyEmpty=!1;for(let l=t;l<n;l++)for(let h=r;h<i;h++)for(let u=e;u<s;u++)this.world.set(u,l,h,0);this.onlyEmpty=o}walls(e,t,r,s,n,i,o,l){this.box(e,t,r,s,n,r+o,l),this.box(e,t,i-o,s,n,i,l),this.box(e,t,r+o,e+o,n,i-o,l),this.box(s-o,t,r+o,s,n,i-o,l)}cylY(e,t,r,s,n,i,o=0,l=!1){let h=r*r,u=o>0?r-o:-1,m=u*u,d=Math.ceil(r);for(let f=-d;f<=d;f++)for(let b=-d;b<=d;b++){let p=(b+.5)*(b+.5)+(f+.5)*(f+.5);if(p>h)continue;let x=u<0||p>=m;for(let v=s;v<n;v++){if(!x&&!(l&&(v===s||v===n-1)))continue;let g=Math.floor(e)+b,w=Math.floor(t)+f,E=this.col(i,g,v,w);E>=0&&this.set(g,v,w,E)}}}cylX(e,t,r,s,n,i,o=0,l=!1){let h=r*r,u=o>0?r-o:-1,m=u*u,d=Math.ceil(r);for(let f=-d;f<=d;f++)for(let b=-d;b<=d;b++){let p=(f+.5)*(f+.5)+(b+.5)*(b+.5);if(p>h)continue;let x=u<0||p>=m;for(let v=s;v<n;v++){if(!x&&!(l&&(v===s||v===n-1)))continue;let g=Math.floor(e)+f,w=Math.floor(t)+b,E=this.col(i,v,g,w);E>=0&&this.set(v,g,w,E)}}}cylZ(e,t,r,s,n,i,o=0,l=!1){let h=r*r,u=o>0?r-o:-1,m=u*u,d=Math.ceil(r);for(let f=-d;f<=d;f++)for(let b=-d;b<=d;b++){let p=(f+.5)*(f+.5)+(b+.5)*(b+.5);if(p>h)continue;let x=u<0||p>=m;for(let v=s;v<n;v++){if(!x&&!(l&&(v===s||v===n-1)))continue;let g=Math.floor(t)+f,w=Math.floor(e)+b,E=this.col(i,w,g,v);E>=0&&this.set(w,g,v,E)}}}sphere(e,t,r,s,n,i=0){let o=s*s,l=i>0?s-i:-1,h=l*l,u=Math.ceil(s);for(let m=-u;m<=u;m++)for(let d=-u;d<=u;d++)for(let f=-u;f<=u;f++){let b=(f+.5)**2+(m+.5)**2+(d+.5)**2;if(b>o||l>=0&&b<h)continue;let p=Math.floor(e)+f,x=Math.floor(t)+m,v=Math.floor(r)+d,g=this.col(n,p,x,v);g>=0&&this.set(p,x,v,g)}}line(e,t,r,s,n,i,o,l){let h=s-e,u=n-t,m=i-r,d=Math.max(Math.abs(h),Math.abs(u),Math.abs(m),1),f=Math.floor((o-1)/2),b=o-1-f;for(let p=0;p<=d;p++){let x=Math.round(e+h*p/d),v=Math.round(t+u*p/d),g=Math.round(r+m*p/d);for(let w=-f;w<=b;w++)for(let E=-f;E<=b;E++)for(let F=-f;F<=b;F++){let S=this.col(l,x+w,v+E,g+F);S>=0&&this.set(x+w,v+E,g+F,S)}}}ibeam(e,t,r,s,n,i,o,l){for(let h=0;h<n;h++)for(let u=0;u<i;u++)for(let m=0;m<i;m++){let d=m===0||m===i-1,f=u===i>>1;if(!d&&!f)continue;let b=t,p=r,x=s,v=(E,F)=>{E==="x"?b+=F:E==="y"?p+=F:x+=F};v(e,h),v(o,u);let g=["x","y","z"].find(E=>E!==e&&E!==o);v(g,m);let w=this.col(l,b,p,x);w>=0&&this.set(b,p,x,w)}}static shade(e){return(t,r,s)=>Y(e,ut(t,r,s))}static mix(e){return(t,r,s)=>{let n=ut(t,r,s)/4294967296,i=0;for(let[o,l]of e)if(i+=l,n<i)return o;return e[e.length-1][0]}}};function Ce(a){let e=a.terrain,t=40;for(let i=0;i<a.sz;i++)for(let o=0;o<a.sx;o++){let l=t,h=o-a.sx*.8,u=i-a.sz*.8,m=Math.sqrt(h*h+u*u);m<180&&(l+=Math.round((1-m/180)**2*60*Se(o*.01,i*.01,3))),e.height[o+i*a.sx]=l;let d=0;l>t+2?d=8:o<120||i<120?d=8:o%60<2&&i>200&&i<700&&(d=2),e.ground[o+i*a.sx]=d}a.initTerrain();let r=new Pt(a),s=300,n=300;r.walls(s,t,n,s+G(16),t+G(8),n+G(10),3,y.brick),r.box(s,t+G(8),n,s+G(16),t+G(8)+3,n+G(10),y.concrete),r.box(s+3,t,n+3,s+G(16)-3,t+2,n+G(10)-3,y.concreteFloor);for(let i=0;i<5;i++){let o=s+15+i*30;r.clear(o,t+12,n,o+16,t+40,n+3),r.box(o,t+12,n+1,o+16,t+40,n+2,y.glass)}r.clear(s+G(16)-3,t,n+30,s+G(16),t+28,n+50),r.walls(560,t,300,620,t+200,360,4,y.concrete);for(let i=t+30;i<t+200;i+=30)r.box(560,i,300,620,i+3,360,y.concreteMid);r.walls(300,t,520,420,t+50,600,1,y.galv),r.box(300,t+50,520,420,t+51,600,y.sheetRust),r.cylY(520,560,40,t,t+90,y.paintWhite,1,!0);for(let i=0;i<6;i++)r.box(250+i*14,t,450,260+i*14,t+10,460,y.crate);r.cylY(200,600,2.5,t,t+50,y.bark),r.sphere(200,t+60,600,18,Pt.mix([[y.leaves,.4],[y.leaves+1,.3],[y.leaves+2,.3]])),r.box(345,t+G(8)-6,n+50,355,t+G(8)-5,n+52,y.lampWarm),r.cylY(450,460,3,t,t+9,y.fuelRed),r.walls(650,t,450,650+G(6),t+G(2.6),450+G(2.4),1,y.contBlue),r.box(650,t+G(2.6),450,650+G(6),t+G(2.6)+1,450+G(2.4),y.contBlue)}var It=class{constructor(){c(this,"x",0);c(this,"y",0);c(this,"z",0);c(this,"yaw",0);c(this,"pitch",0);c(this,"roll",0);c(this,"fov",75*Math.PI/180);c(this,"aspect",16/9);c(this,"near",.05);c(this,"far",900);c(this,"view",V());c(this,"proj",V());c(this,"shakeX",0);c(this,"shakeY",0)}forward(e){let t=Math.cos(this.pitch);e.x=-Math.sin(this.yaw)*t,e.y=Math.sin(this.pitch),e.z=-Math.cos(this.yaw)*t}update(e){this.aspect=e;let t=this.pitch+this.shakeY,r=this.yaw+this.shakeX,s=Math.cos(t),n=-Math.sin(r)*s,i=Math.sin(t),o=-Math.cos(r)*s,l=0,h=1,u=0;if(this.roll!==0){let m=-Math.cos(r),d=Math.sin(r),f=Math.cos(this.roll),b=Math.sin(this.roll);l=m*b,h=f,u=d*b}Ft(this.view,this.x,this.y,this.z,this.x+n,this.y+i,this.z+o,l,h,u),Ae(this.proj,this.fov,e,this.near,this.far)}};var Ht=class{constructor(e){this.canvas=e;c(this,"down",new Set);c(this,"pressed",new Set);c(this,"released",new Set);c(this,"mouseDX",0);c(this,"mouseDY",0);c(this,"wheel",0);c(this,"buttons",0);c(this,"btnPressed",0);c(this,"btnReleased",0);c(this,"locked",!1);c(this,"sensitivity",.0022);c(this,"onLockChange",null);window.addEventListener("keydown",t=>{if(t.repeat){this.locked&&t.preventDefault();return}this.down.add(t.code),this.pressed.add(t.code),this.locked&&(t.code==="Tab"||t.code==="Space"||t.code.startsWith("Arrow")||t.code==="F1")&&t.preventDefault()}),window.addEventListener("keyup",t=>{this.down.delete(t.code),this.released.add(t.code)}),window.addEventListener("blur",()=>{this.down.clear(),this.buttons=0}),e.addEventListener("mousedown",t=>{this.locked&&(this.buttons|=1<<t.button,this.btnPressed|=1<<t.button,t.preventDefault())}),window.addEventListener("mouseup",t=>{this.buttons&1<<t.button&&(this.btnReleased|=1<<t.button),this.buttons&=~(1<<t.button)}),window.addEventListener("mousemove",t=>{this.locked&&(Math.abs(t.movementX)>600||Math.abs(t.movementY)>600||(this.mouseDX+=t.movementX,this.mouseDY+=t.movementY))}),window.addEventListener("wheel",t=>{this.locked&&(this.wheel+=Math.sign(t.deltaY))},{passive:!0}),e.addEventListener("contextmenu",t=>t.preventDefault()),document.addEventListener("pointerlockchange",()=>{this.locked=document.pointerLockElement===e,this.locked||(this.down.clear(),this.buttons=0),this.onLockChange?.(this.locked)})}requestLock(){let e=this.canvas.requestPointerLock();e&&typeof e.catch=="function"&&e.catch(()=>{})}isDown(e){return this.down.has(e)}wasPressed(e){return this.pressed.has(e)}wasReleased(e){return this.released.has(e)}mouseDown(e){return(this.buttons&1<<e)!==0}mousePressed(e){return(this.btnPressed&1<<e)!==0}mouseReleased(e){return(this.btnReleased&1<<e)!==0}simKey(e,t){t?(this.down.add(e),this.pressed.add(e)):(this.down.delete(e),this.released.add(e))}simButton(e,t){t?(this.buttons|=1<<e,this.btnPressed|=1<<e):(this.buttons&=~(1<<e),this.btnReleased|=1<<e)}endFrame(){this.pressed.clear(),this.released.clear(),this.mouseDX=0,this.mouseDY=0,this.wheel=0,this.btnPressed=0,this.btnReleased=0}};var er={sunDir:rr([-.45,.52,-.33]),sunColor:[3,2.55,2.1],skyZenith:[.22,.38,.72],skyHorizon:[.72,.78,.86],groundColor:[.28,.25,.21],fogColor:[.62,.67,.74],fogDensity:.0035,fogHeight:.03,ambient:.85,exposure:1};function rr(a){let e=Math.hypot(a[0],a[1],a[2]);return[a[0]/e,a[1]/e,a[2]/e]}async function ir(){let a=document.getElementById("c"),e=new Bt(a),t=new Vt(1024,384,1024,40),r=performance.now();Ce(t),console.log("map generated in",(performance.now()-r).toFixed(0),"ms"),t.markBoxDirty(0,0,0,t.sx-1,t.sy-1,t.sz-1);let s=Math.max(1,Math.min(6,(navigator.hardwareConcurrency||4)-1)),n=new Ot(t,e.pool,s),i=new It;i.x=25,i.y=9,i.z=48,i.yaw=.6,i.pitch=-.15;let o=new URLSearchParams(location.search);if(o.has("cam")){let[d,f,b,p,x]=o.get("cam").split(",").map(Number);i.x=d,i.y=f,i.z=b,i.yaw=p,i.pitch=x}let l=new Ht(a);a.addEventListener("click",()=>l.requestLock());let h=performance.now(),u=window;u.__game={world:t,meshes:n,renderer:e,cam:i,ready:!1,frames:0};function m(){let d=performance.now(),f=Math.min(.05,(d-h)/1e3);h=d,i.yaw-=l.mouseDX*l.sensitivity,i.pitch=Math.max(-1.5,Math.min(1.5,i.pitch-l.mouseDY*l.sensitivity));let b=(l.isDown("ShiftLeft")?30:8)*f,p=-Math.sin(i.yaw),x=-Math.cos(i.yaw);if(l.isDown("KeyW")&&(i.x+=p*b,i.z+=x*b),l.isDown("KeyS")&&(i.x-=p*b,i.z-=x*b),l.isDown("KeyA")&&(i.x+=x*b,i.z-=p*b),l.isDown("KeyD")&&(i.x-=x*b,i.z+=p*b),l.isDown("Space")&&(i.y+=b),l.isDown("KeyC")&&(i.y-=b),n.update(i.x,i.y,i.z),!u.__game.ready&&n.pending>0&&u.__game.frames>2){u.__game.frames++,l.endFrame(),requestAnimationFrame(m);return}i.update(a.clientWidth/Math.max(1,a.clientHeight)),e.render(i,er,[],n,[],f),l.endFrame(),u.__game.frames++,n.pending===0&&(u.__game.ready=!0),requestAnimationFrame(m)}requestAnimationFrame(m)}ir().catch(a=>{console.error(a),document.getElementById("hud").innerHTML=`<pre style="color:#f88;padding:20px;white-space:pre-wrap">${String(a&&a.stack||a)}</pre>`});})();
