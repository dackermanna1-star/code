"use strict";(()=>{var Gr=Object.defineProperty;var Wr=(c,t,e)=>t in c?Gr(c,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):c[t]=e;var h=(c,t,e)=>Wr(c,typeof t!="symbol"?t+"":t,e);var J=class{constructor(t,e,r,i){this.gl=t;this.name=i;h(this,"prog");h(this,"locs",new Map);this.prog=Hr(t,e,r,i)}use(){return this.gl.useProgram(this.prog),this}loc(t){let e=this.locs.get(t);return e===void 0&&(e=this.gl.getUniformLocation(this.prog,t),this.locs.set(t,e)),e}i(t,e){return this.gl.uniform1i(this.loc(t),e),this}u(t,e){return this.gl.uniform1ui(this.loc(t),e),this}f(t,e){return this.gl.uniform1f(this.loc(t),e),this}f2(t,e,r){return this.gl.uniform2f(this.loc(t),e,r),this}f3(t,e,r,i){return this.gl.uniform3f(this.loc(t),e,r,i),this}f4(t,e,r,i,n){return this.gl.uniform4f(this.loc(t),e,r,i,n),this}v3(t,e){return this.gl.uniform3f(this.loc(t),e[0],e[1],e[2]),this}fv(t,e){return this.gl.uniform1fv(this.loc(t),e),this}f4v(t,e){return this.gl.uniform4fv(this.loc(t),e),this}m4(t,e){return this.gl.uniformMatrix4fv(this.loc(t),!1,e),this}m4v(t,e){return this.gl.uniformMatrix4fv(this.loc(t),!1,e),this}tex(t,e,r,i=this.gl.TEXTURE_2D){let n=this.gl;return n.activeTexture(n.TEXTURE0+e),n.bindTexture(i,r),n.uniform1i(this.loc(t),e),this}};function Xe(c,t,e,r){let i=c.createShader(t);if(c.shaderSource(i,e),c.compileShader(i),!c.getShaderParameter(i,c.COMPILE_STATUS)){let n=c.getShaderInfoLog(i)||"",s=e.split(`
`).map((o,u)=>`${String(u+1).padStart(4)}: ${o}`),a=/ERROR: \d+:(\d+)/.exec(n),l="";if(a){let o=parseInt(a[1],10);l=s.slice(Math.max(0,o-4),o+2).join(`
`)}throw new Error(`Shader compile error in ${r} (${t===c.VERTEX_SHADER?"vs":"fs"}):
${n}
${l}`)}return i}function Hr(c,t,e,r){let i=c.createProgram();if(c.attachShader(i,Xe(c,c.VERTEX_SHADER,t,r)),c.attachShader(i,Xe(c,c.FRAGMENT_SHADER,e,r)),c.linkProgram(i),!c.getProgramParameter(i,c.LINK_STATUS))throw new Error(`Program link error in ${r}: ${c.getProgramInfoLog(i)}`);return i}function rt(c,t,e,r,i,n,s={},a=null){let l=c.createTexture();c.bindTexture(c.TEXTURE_2D,l),c.texImage2D(c.TEXTURE_2D,0,r,t,e,0,i,n,a);let o=s.filter??c.LINEAR;c.texParameteri(c.TEXTURE_2D,c.TEXTURE_MIN_FILTER,s.mips?c.LINEAR_MIPMAP_LINEAR:o),c.texParameteri(c.TEXTURE_2D,c.TEXTURE_MAG_FILTER,o);let u=s.wrap??c.CLAMP_TO_EDGE;return c.texParameteri(c.TEXTURE_2D,c.TEXTURE_WRAP_S,u),c.texParameteri(c.TEXTURE_2D,c.TEXTURE_WRAP_T,u),s.compare&&(c.texParameteri(c.TEXTURE_2D,c.TEXTURE_COMPARE_MODE,c.COMPARE_REF_TO_TEXTURE),c.texParameteri(c.TEXTURE_2D,c.TEXTURE_COMPARE_FUNC,c.LEQUAL)),l}function Tt(c,t,e,r=-1){let i=c.createFramebuffer();c.bindFramebuffer(c.FRAMEBUFFER,i);let n=[];t.forEach((a,l)=>{c.framebufferTexture2D(c.FRAMEBUFFER,c.COLOR_ATTACHMENT0+l,c.TEXTURE_2D,a,0),n.push(c.COLOR_ATTACHMENT0+l)}),e&&(r>=0?c.framebufferTextureLayer(c.FRAMEBUFFER,c.DEPTH_ATTACHMENT,e,0,r):c.framebufferTexture2D(c.FRAMEBUFFER,c.DEPTH_ATTACHMENT,c.TEXTURE_2D,e,0)),c.drawBuffers(n.length?n:[c.NONE]),n.length||c.readBuffer(c.NONE);let s=c.checkFramebufferStatus(c.FRAMEBUFFER);if(s!==c.FRAMEBUFFER_COMPLETE)throw new Error("Framebuffer incomplete: 0x"+s.toString(16));return c.bindFramebuffer(c.FRAMEBUFFER,null),i}var $=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
precision highp sampler2DArray;
precision highp sampler2DArrayShadow;
precision highp sampler3D;
`,ut=$+`
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;var gt=48,it=4,je=`
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
`,qt=`
uint pcg(uint v) { uint state = v * 747796405u + 2891336453u; uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u; return (word >> 22u) ^ word; }
uint hash3i(ivec3 p) { return pcg(uint(p.x) * 73856093u ^ pcg(uint(p.y) * 19349663u ^ pcg(uint(p.z) * 83492791u))); }
float hash3f(ivec3 p) { return float(hash3i(p) & 0xffffu) / 65535.0; }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`,Te=$+je+`
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
}`,qe=qt+`
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
`,Ye=$+qe+`
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
}`,Qe=$+je+`
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
}`,Ke=$+`
void main() {}`,Ze=`
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
`,$e=$+qt+`
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
}`,Je=$+`
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
}`,tr=$+Ze+qt+`
in vec2 vUV;
uniform sampler2D uAlbedo;
uniform sampler2D uNormal;
uniform sampler2D uMat;
uniform sampler2D uDepth;
uniform sampler2D uSSAO;
uniform sampler2DArrayShadow uShadow;
uniform mat4 uInvViewProj;
uniform mat4 uCascadeVP[${it}];
uniform vec4 uCascadeSplits;
uniform float uCascadeTexel[${it}];
uniform vec4 uLightPos[${gt}];
uniform vec4 uLightCol[${gt}];
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
  for (int i = 0; i < ${gt}; i++) {
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
}`,er=$+Ze+qe+`
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
uniform mat4 uCascadeVP[${it}];
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
}`,rr=$+`
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
}`,sr=$+`
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
}`,nr=$+`
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
}`,ir=$+qt+`
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
}`,or=$+`
in vec2 vUV;
uniform sampler2D uSrc;
out vec4 oColor;
void main() { oColor = texture(uSrc, vUV); }`;var et=class c{constructor(t,e=256){this.gl=t;h(this,"tex");h(this,"rows");h(this,"capacity");h(this,"top",0);h(this,"freeStart",[]);h(this,"freeSize",[]);h(this,"used",0);this.rows=e,this.capacity=e*4096,this.tex=this.createTex(e)}createTex(t){let e=this.gl,r=e.createTexture();return e.bindTexture(e.TEXTURE_2D,r),e.texStorage2D(e.TEXTURE_2D,1,e.RGBA32UI,4096,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),r}grow(t){let e=this.gl,r=this.rows;for(;r*4096<t;)r*=2;let i=Math.min(16384,e.getParameter(e.MAX_TEXTURE_SIZE));if(r>i)throw new Error("QuadPool exhausted");let n=this.createTex(r),s=e.createFramebuffer(),a=e.createFramebuffer();e.bindFramebuffer(e.READ_FRAMEBUFFER,s),e.framebufferTexture2D(e.READ_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,this.tex,0),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,a),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,n,0),e.blitFramebuffer(0,0,4096,this.rows,0,0,4096,this.rows,e.COLOR_BUFFER_BIT,e.NEAREST),e.bindFramebuffer(e.READ_FRAMEBUFFER,null),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.deleteFramebuffer(s),e.deleteFramebuffer(a),e.deleteTexture(this.tex),this.tex=n,this.rows=r,this.capacity=r*4096}static roundSize(t){return Math.max(16,((t+16-1)/16|0)*16)}alloc(t){let e=c.roundSize(t),r=this.freeStart,i=this.freeSize;for(let s=0;s<r.length;s++)if(i[s]>=e){let a=r[s];return i[s]===e?(r.splice(s,1),i.splice(s,1)):(r[s]+=e,i[s]-=e),this.used+=e,a}this.top+e>this.capacity&&this.grow(this.top+e);let n=this.top;return this.top+=e,this.used+=e,n}free(t,e){let r=c.roundSize(e);this.used-=r;let i=this.freeStart,n=this.freeSize,s=0,a=i.length;for(;s<a;){let l=s+a>>1;i[l]<t?s=l+1:a=l}i.splice(s,0,t),n.splice(s,0,r),s+1<i.length&&i[s]+n[s]===i[s+1]&&(n[s]+=n[s+1],i.splice(s+1,1),n.splice(s+1,1)),s>0&&i[s-1]+n[s-1]===i[s]&&(n[s-1]+=n[s],i.splice(s,1),n.splice(s,1),s--),i[s]+n[s]===this.top&&(this.top=i[s],i.splice(s,1),n.splice(s,1))}upload(t,e,r){let i=this.gl;i.bindTexture(i.TEXTURE_2D,this.tex);let n=t,s=r,a=0;for(;s>0;){let l=n&4095,o=n>>12,u;if(l===0&&s>=4096){let m=s/4096|0;i.texSubImage2D(i.TEXTURE_2D,0,0,o,4096,m,i.RGBA_INTEGER,i.UNSIGNED_INT,e,a*4),u=m*4096}else u=Math.min(s,4096-l),i.texSubImage2D(i.TEXTURE_2D,0,l,o,u,1,i.RGBA_INTEGER,i.UNSIGNED_INT,e,a*4);n+=u,a+=u,s-=u}}get highWater(){return this.top}};var Nt=class{constructor(){h(this,"p",new Float32Array(24))}setFromMatrix(t){let e=this.p,r=t[0],i=t[4],n=t[8],s=t[12],a=t[1],l=t[5],o=t[9],u=t[13],m=t[2],f=t[6],d=t[10],v=t[14],b=t[3],y=t[7],p=t[11],x=t[15],g=(M,S,w,z,A)=>{let R=Math.hypot(S,w,z)||1;e[M*4]=S/R,e[M*4+1]=w/R,e[M*4+2]=z/R,e[M*4+3]=A/R};return g(0,b+r,y+i,p+n,x+s),g(1,b-r,y-i,p-n,x-s),g(2,b+a,y+l,p+o,x+u),g(3,b-a,y-l,p-o,x-u),g(4,b+m,y+f,p+d,x+v),g(5,b-m,y-f,p-d,x-v),this}testBox(t,e,r,i,n,s){let a=this.p;for(let l=0;l<24;l+=4){let o=a[l],u=a[l+1],m=a[l+2],f=a[l+3],d=o>0?i:t,v=u>0?n:e,b=m>0?s:r;if(o*d+u*v+m*b+f<0)return!1}return!0}testSphere(t,e,r,i){let n=this.p;for(let s=0;s<24;s+=4)if(n[s]*t+n[s+1]*e+n[s+2]*r+n[s+3]<-i)return!1;return!0}};var H=(c,t,e,r,i,n,s,a,l,o,u,m=!1)=>({name:c,density:t,hardness:e,blast:r,friction:i,restitution:n,flammable:s,burnTime:a,bond:l,sound:o,debris:u,transparent:m}),W=[];W[0]=H("air",0,0,0,0,0,0,0,0,0,0);W[1]=H("concrete",2.4,2,.72,.8,.05,0,0,1,1,1);W[2]=H("brick",1.9,2,.8,.8,.05,0,0,.75,1,1);W[3]=H("plaster",1.1,1,1.2,.7,.05,0,0,.35,1,0);W[4]=H("wood",.6,1,1.05,.6,.15,1,9,.6,3,2);W[5]=H("metal",2.2,3,.5,.45,.15,0,0,2.4,2,4);W[6]=H("heavy metal",5,4,.28,.45,.1,0,0,4,2,4);W[7]=H("glass",2.5,0,2.2,.4,.05,0,0,.15,4,3,!0);W[8]=H("dirt",1.5,1,1,.9,0,0,0,.3,5,0);W[9]=H("grass",1.4,1,1,.9,0,.15,3,.3,5,0);W[10]=H("gravel",1.7,1,.95,.9,0,0,0,.25,5,1);W[11]=H("rock",2.6,3,.55,.85,.05,0,0,2,1,1);W[12]=H("asphalt",2.3,2,.8,.9,.02,.05,6,.8,1,1);W[13]=H("plastic",.9,1,1.1,.5,.25,.55,6,.5,0,1);W[14]=H("foliage",.25,0,1.6,.8,0,.9,3,.1,0,0);W[15]=H("rubber",1.2,2,.85,1,.45,.5,10,.9,0,1);W[16]=H("explosive",1.6,1,1,.5,.1,.8,1,1.5,2,4);W[17]=H("fabric",.4,1,1.3,.9,0,1,4,.2,0,0);W[18]=H("light",1,0,1.6,.4,.05,0,0,.3,4,3);W[19]=H("bedrock",3,5,0,.9,0,0,0,100,1,1);W[20]=H("rubble",1.6,1,1.25,.95,0,0,0,.12,1,1);W[21]=H("char",.3,0,1.4,.8,0,.15,3,.1,0,0);var ht=[{name:"air",mat:0,r:0,g:0,b:0,rough:1,metal:0,emissive:0,density:0}],Fe=new Uint8Array(256);function jr(c){let t=parseInt(c.replace("#",""),16);return[t>>16&255,t>>8&255,t&255]}function qr(c){switch(c){case 5:return{rough:.45,metal:.75};case 6:return{rough:.5,metal:.65};case 7:return{rough:.05,metal:0};case 13:return{rough:.45,metal:0};case 16:return{rough:.4,metal:.4};case 18:return{rough:.3,metal:0};case 15:return{rough:.75,metal:0};case 12:return{rough:.9,metal:0};default:return{rough:.92,metal:0}}}function C(c,t,e,r={}){let[i,n,s]=jr(e),a=qr(t),l=ht.length;if(l>255)throw new Error("palette overflow");return ht.push({name:c,mat:t,r:i,g:n,b:s,rough:r.rough??a.rough,metal:r.metal??a.metal,emissive:r.emissive??0,density:r.density??0}),Fe[l]=1,l}function k(c,t,e,r={}){let i=C(c,t,e[0],r);for(let n=1;n<e.length;n++)C(c+n,t,e[n],r);return Fe[i]=e.length,i}var E={asphalt:k("asphalt",12,["#3b3b3d","#363638","#414043","#39383b"]),asphaltPatch:k("asphalt patch",12,["#47464a","#4c4b4e"]),lineWhite:k("line white",12,["#c9c8c0","#bdbcb4"]),lineYellow:k("line yellow",12,["#c9a227","#bf9a25"]),gravel:k("gravel",10,["#7d7870","#6e6a63","#8a857c","#75716a"]),ballast:k("ballast",10,["#5f5c58","#6a6661","#55524e"]),dirt:k("dirt",8,["#5e4a36","#6b5440","#574330","#634e39"]),dirtDark:k("dirt dark",8,["#45362a","#4d3c2e"]),mud:k("mud",8,["#4a3b2c","#43352a"]),sand:k("sand",8,["#b09c75","#a69270"]),grass:k("grass",9,["#4f6b2e","#5a7533","#46612a","#53702f"]),grassDry:k("grass dry",9,["#7d7a45","#72703f"]),rock:k("rock",11,["#6f6f6f","#5f5e5c","#787672"]),bedrock:C("bedrock",19,"#2b2b2e"),coal:k("coal",10,["#1f1f21","#262628","#1a1a1c"]),concrete:k("concrete",1,["#9c9a94","#96948e","#a19f99"]),concreteMid:k("concrete mid",1,["#8a8882","#84827c"]),concreteDark:k("concrete dark",1,["#77756f","#6f6d68"]),concreteStain:k("concrete stain",1,["#66635d","#5c5953"]),concreteFloor:k("concrete floor",1,["#7d817b","#787c76"]),epoxyFloor:k("epoxy floor",1,["#5f7068","#5b6b63"],{rough:.5}),concreteYellow:C("concrete safety yellow",1,"#c99f2c"),cinder:k("cinder block",1,["#a3a19a","#9a9891","#a8a69f"]),concreteBlue:C("concrete painted blue",1,"#4a6a8a"),brick:k("brick",2,["#8e3b2c","#9a4432","#7f3326","#a24c37","#87382a"]),brickDark:k("brick dark",2,["#5e2a22","#673026"]),brickYellow:k("brick yellow",2,["#b58e55","#a98450"]),mortar:k("mortar",2,["#a59f92","#9b9588"]),sootBrick:k("soot brick",2,["#3a2a26","#2f2522"]),plaster:k("plaster white",3,["#d8d5cc","#d2cfc6"]),plasterBeige:k("plaster beige",3,["#cdbf9f","#c6b898"]),plasterGrey:C("plaster grey",3,"#b9b9b4"),plasterBlue:C("plaster blue",3,"#8d9aa6"),plasterGreen:C("plaster green",3,"#9fae95"),ceiling:C("ceiling tile",3,"#e2e0d8"),plank:k("plank",4,["#9b7247","#8a643d","#a37a4d"]),woodDark:k("wood dark",4,["#5c3f25","#664629"]),pallet:k("pallet wood",4,["#b08a5a","#a07b4c","#b89463"]),plywood:k("plywood",4,["#c19a62","#b8925b"]),bark:k("bark",4,["#4e3826","#5a4130","#46321f"]),crate:k("crate wood",4,["#a5814f","#9a7747"]),woodPainted:C("wood painted green",4,"#4b6343"),steel:k("steel",5,["#7a7d80","#73767a","#808386"]),steelDark:k("steel dark",5,["#4a4c4f","#525457"]),rust:k("rust",5,["#8a4b2a","#7a4127","#9a5a33","#6e3d24"],{rough:.85,metal:.3}),galv:k("galvanized",5,["#a4a8aa","#959a9d","#9ca0a3"],{density:.6}),alu:C("aluminum",5,"#b8bcbf",{density:.8,rough:.35}),sheetGrey:k("sheet grey",5,["#8e9397","#868b8f"],{density:.5}),sheetBlue:k("sheet blue",5,["#3d5f86","#395a7f"],{density:.5,rough:.6,metal:.3}),sheetWhite:k("sheet white",5,["#cfd0cb","#c6c7c2"],{density:.5,rough:.6,metal:.3}),sheetGreen:k("sheet green",5,["#5a7a62","#557459"],{density:.5,rough:.6,metal:.3}),sheetRust:k("sheet rust",5,["#7e4a2c","#8c5532"],{density:.5,rough:.85,metal:.25}),paintBlue:C("metal blue",5,"#2f5a8a",{rough:.55,metal:.35}),paintRed:C("metal red",5,"#a32a22",{rough:.55,metal:.35}),paintYellow:k("metal yellow",5,["#d9a521","#cf9c1f"],{rough:.55,metal:.35}),paintGreen:C("metal green",5,"#3d6b45",{rough:.55,metal:.35}),paintOrange:C("metal orange",5,"#d0661f",{rough:.55,metal:.35}),paintWhite:C("metal white",5,"#d6d6d0",{rough:.55,metal:.3}),paintBlack:C("metal black",5,"#222325",{rough:.55,metal:.4}),paintGreyBlue:C("metal grey blue",5,"#59687a",{rough:.55,metal:.35}),paintDarkGreen:C("metal dark green",5,"#2e4a35",{rough:.55,metal:.35}),contRed:k("container red",5,["#8f2f24","#852b21"],{density:.6,rough:.6,metal:.3}),contBlue:k("container blue",5,["#2b4f7c","#284973"],{density:.6,rough:.6,metal:.3}),contGreen:k("container green",5,["#3f6b4b","#3a6345"],{density:.6,rough:.6,metal:.3}),contOrange:k("container orange",5,["#c8642a","#bd5e27"],{density:.6,rough:.6,metal:.3}),contGrey:k("container grey",5,["#8a8f92","#83888b"],{density:.6,rough:.6,metal:.3}),contMaroon:k("container maroon",5,["#6b2a2a","#632727"],{density:.6,rough:.6,metal:.3}),contWhite:k("container white",5,["#cfcfc8","#c5c5be"],{density:.6,rough:.6,metal:.3}),railSteel:C("rail steel",5,"#6a625a",{rough:.35,metal:.8}),chrome:C("chrome",5,"#c8ccd0",{rough:.15,metal:.95}),copper:C("copper",5,"#b06a3a",{rough:.4,metal:.9}),grate:C("grate",5,"#5d6064",{density:.4}),machineGreen:k("machine green",6,["#4f6656","#4a6051"]),machineGrey:k("machine grey",6,["#6b7075","#656a6f"]),machineBlue:k("machine blue",6,["#3c5a78","#385470"]),machineOrange:C("machine orange",6,"#b5612a"),machineYellow:C("machine yellow",6,"#c99a22"),castIron:k("cast iron",6,["#303234","#36383a"]),heavySteel:C("heavy steel",6,"#55585c"),glass:C("window glass",7,"#a9c9d2"),glassDark:C("dark glass",7,"#5d7d88"),glassFrost:C("frosted glass",7,"#cad9da",{rough:.3}),glassGreen:C("green glass",7,"#7aa58a"),plasticWhite:C("plastic white",13,"#d8d8d2"),plasticBlack:C("plastic black",13,"#262626"),plasticBlue:C("plastic blue",13,"#2552a0"),plasticOrange:C("plastic orange",13,"#e0601a"),plasticRed:C("plastic red",13,"#b02a2a"),plasticGreen:C("plastic green",13,"#3a7a3a"),plasticYellow:C("plastic yellow",13,"#d8b830"),plasticGrey:C("plastic grey",13,"#808080"),ibcWhite:C("ibc white",13,"#e2e2da",{rough:.6}),rubber:k("rubber",15,["#1e1e1f","#2a2a2b"]),tarpBlue:C("tarp blue",17,"#2d5d9a"),tarpGreen:C("tarp green",17,"#4a6a3a"),carpet:k("carpet",17,["#5f6266","#595c60"]),carpetBlue:C("carpet blue",17,"#3e4c66"),seat:C("seat fabric",17,"#4a4a52"),cardboard:k("cardboard",17,["#b08d5f","#a6845a"],{density:.15}),paper:C("paper",17,"#e8e6dc",{density:.3}),leaves:k("leaves",14,["#3e5f24","#4a6d2b","#355220","#44662a"]),leavesYellow:k("leaves yellow",14,["#6f7a2a","#7d8030"]),bush:k("bush",14,["#3f5a28","#365024"]),propane:C("propane tank",16,"#d4d4cc"),fuelRed:C("fuel barrel red",16,"#b52a1e"),gasRed:C("gas cylinder red",16,"#a01e1e"),gasBlue:C("gas cylinder blue",16,"#22447a"),gasYellow:C("gas cylinder yellow",16,"#d6b020"),tnt:C("tnt",16,"#9a1a14"),gasWhite:C("gas tank white",16,"#e0e0da"),lampWarm:C("lamp warm",18,"#ffd9a0",{emissive:7}),lampCool:C("lamp cool",18,"#e2f0ff",{emissive:7}),lampRed:C("lamp red",18,"#ff3a26",{emissive:5}),lampGreen:C("lamp green",18,"#46ff6a",{emissive:4}),lampOrange:C("lamp orange",18,"#ffa030",{emissive:6}),screen:C("screen",18,"#6ab0ff",{emissive:1.6}),rubbleConcrete:k("rubble concrete",20,["#8a8780","#7f7c75","#94918a"]),rubbleBrick:k("rubble brick",20,["#7a4636","#6e3f31"]),rubbleDirt:k("rubble dirt",20,["#5a4836","#524231"]),rubbleWood:k("rubble wood",20,["#7a5a3a","#6d5034"]),scrap:k("scrap metal",20,["#5f5f60","#6f5244"]),char:k("char",21,["#1c1a18","#262220","#2e2925"]),ash:C("ash",21,"#4a4744")},Yt=ht.length,ze=new Uint8Array(256),bt=new Uint8Array(256),Qt=new Float32Array(256),Yr=new Uint8Array(256),Qr=new Float32Array(256),Kr=new Float32Array(256),Zr=new Float32Array(256),Re=new Float32Array(256),Pe=new Float32Array(256),Ee=new Uint8Array(256),Et=new Uint8Array(256);for(let c=0;c<256;c++){let t=ht[c]??ht[0],e=W[t.mat];ze[c]=t.mat,bt[c]=e.transparent?1:0,Qt[c]=t.density>0?t.density:e.density,Yr[c]=c===0?0:e.hardness,Qr[c]=e.blast,Kr[c]=e.flammable,Zr[c]=e.bond,Re[c]=e.friction,Pe[c]=e.restitution}for(let c=1;c<Yt;c++){let t=ht[c].mat;switch(t){case 4:case 17:case 14:case 13:case 9:Ee[c]=E.char+c%3;break;case 15:Ee[c]=E.char;break;default:Ee[c]=0}switch(t){case 1:case 12:case 3:case 11:Et[c]=E.rubbleConcrete+c%3;break;case 2:Et[c]=E.rubbleBrick+c%2;break;case 8:case 9:case 10:Et[c]=E.rubbleDirt+c%2;break;case 4:Et[c]=E.rubbleWood+c%2;break;case 5:case 6:Et[c]=E.scrap+c%2;break;default:Et[c]=0}}var De=new Uint8Array(256);for(let c=1;c<Yt;c++){let t=ht[c],e=t.name,r=0;switch(t.mat){case 2:r=e.startsWith("mortar")?4:1;break;case 4:r=e.startsWith("bark")?7:2;break;case 1:r=e.startsWith("epoxy")?0:4;break;case 12:r=e.startsWith("line")?4:5;break;case 9:r=6;break;case 8:case 10:case 20:case 11:r=7;break;case 14:r=10;break;case 3:r=e.startsWith("ceiling")?8:0;break;case 5:e.startsWith("galv")||e.startsWith("sheet")?r=3:e.startsWith("container")?r=11:(e.startsWith("rust")||e.startsWith("steel")||e.startsWith("rail"))&&(r=9);break;case 6:r=e.startsWith("cast")?9:0;break}De[c]=r}function st(c,t){let e=Fe[c];return e>1?c+t%e:c}var ot=class c{constructor(t=0,e=0,r=0){this.x=t;this.y=e;this.z=r}set(t,e,r){return this.x=t,this.y=e,this.z=r,this}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}clone(){return new c(this.x,this.y,this.z)}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}scale(t){return this.x*=t,this.y*=t,this.z*=t,this}addScaled(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}cross(t){let e=this.y*t.z-this.z*t.y,r=this.z*t.x-this.x*t.z,i=this.x*t.y-this.y*t.x;return this.x=e,this.y=r,this.z=i,this}len(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}lenSq(){return this.x*this.x+this.y*this.y+this.z*this.z}normalize(){let t=this.len();return t>1e-12&&this.scale(1/t),this}distTo(t){let e=this.x-t.x,r=this.y-t.y,i=this.z-t.z;return Math.sqrt(e*e+r*r+i*i)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this}applyQuat(t){let e=this.x,r=this.y,i=this.z,n=t.x,s=t.y,a=t.z,l=t.w,o=2*(s*i-a*r),u=2*(a*e-n*i),m=2*(n*r-s*e);return this.x=e+l*o+(s*m-a*u),this.y=r+l*u+(a*o-n*m),this.z=i+l*m+(n*u-s*o),this}applyQuatInv(t){let e=this.x,r=this.y,i=this.z,n=-t.x,s=-t.y,a=-t.z,l=t.w,o=2*(s*i-a*r),u=2*(a*e-n*i),m=2*(n*r-s*e);return this.x=e+l*o+(s*m-a*u),this.y=r+l*u+(a*o-n*m),this.z=i+l*m+(n*u-s*o),this}},wt=class c{constructor(t=0,e=0,r=0,i=1){this.x=t;this.y=e;this.z=r;this.w=i}set(t,e,r,i){return this.x=t,this.y=e,this.z=r,this.w=i,this}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w,this}clone(){return new c(this.x,this.y,this.z,this.w)}identity(){return this.x=0,this.y=0,this.z=0,this.w=1,this}normalize(){let t=Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w);return t<1e-12?(this.identity(),this):(t=1/t,this.x*=t,this.y*=t,this.z*=t,this.w*=t,this)}setAxisAngle(t,e,r,i){let n=i*.5,s=Math.sin(n);return this.x=t*s,this.y=e*s,this.z=r*s,this.w=Math.cos(n),this}multiply(t,e){let r=t.x,i=t.y,n=t.z,s=t.w,a=e.x,l=e.y,o=e.z,u=e.w;return this.x=s*a+r*u+i*o-n*l,this.y=s*l-r*o+i*u+n*a,this.z=s*o+r*l-i*a+n*u,this.w=s*u-r*a-i*l-n*o,this}integrate(t,e,r,i){let n=t*i*.5,s=e*i*.5,a=r*i*.5,l=this.x,o=this.y,u=this.z,m=this.w;return this.x+=n*m+s*u-a*o,this.y+=s*m+a*l-n*u,this.z+=a*m+n*o-s*l,this.w+=-n*l-s*o-a*u,this.normalize()}slerp(t,e){let r=this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w,i=t.x,n=t.y,s=t.z,a=t.w;r<0&&(r=-r,i=-i,n=-n,s=-s,a=-a);let l,o;if(r>.9995)l=1-e,o=e;else{let u=Math.acos(r),m=Math.sin(u);l=Math.sin((1-e)*u)/m,o=Math.sin(e*u)/m}return this.x=this.x*l+i*o,this.y=this.y*l+n*o,this.z=this.z*l+s*o,this.w=this.w*l+a*o,this.normalize()}toMat3(t,e=0){let r=this.x,i=this.y,n=this.z,s=this.w,a=r+r,l=i+i,o=n+n,u=r*a,m=r*l,f=r*o,d=i*l,v=i*o,b=n*o,y=s*a,p=s*l,x=s*o;t[e+0]=1-(d+b),t[e+1]=m-x,t[e+2]=f+p,t[e+3]=m+x,t[e+4]=1-(u+b),t[e+5]=v-y,t[e+6]=f-p,t[e+7]=v+y,t[e+8]=1-(u+d)}};function Q(){let c=new Float32Array(16);return c[0]=c[5]=c[10]=c[15]=1,c}function Zt(c,t,e){let r=t[0],i=t[1],n=t[2],s=t[3],a=t[4],l=t[5],o=t[6],u=t[7],m=t[8],f=t[9],d=t[10],v=t[11],b=t[12],y=t[13],p=t[14],x=t[15];for(let g=0;g<4;g++){let M=e[g*4],S=e[g*4+1],w=e[g*4+2],z=e[g*4+3];c[g*4+0]=M*r+S*a+w*m+z*b,c[g*4+1]=M*i+S*l+w*f+z*y,c[g*4+2]=M*n+S*o+w*d+z*p,c[g*4+3]=M*s+S*u+w*v+z*x}return c}function ke(c,t){let e=t[0],r=t[1],i=t[2],n=t[3],s=t[4],a=t[5],l=t[6],o=t[7],u=t[8],m=t[9],f=t[10],d=t[11],v=t[12],b=t[13],y=t[14],p=t[15],x=e*a-r*s,g=e*l-i*s,M=e*o-n*s,S=r*l-i*a,w=r*o-n*a,z=i*o-n*l,A=u*b-m*v,R=u*y-f*v,T=u*p-d*v,P=m*y-f*b,F=m*p-d*b,U=f*p-d*y,D=x*U-g*F+M*P+S*T-w*R+z*A;return D?(D=1/D,c[0]=(a*U-l*F+o*P)*D,c[1]=(i*F-r*U-n*P)*D,c[2]=(b*z-y*w+p*S)*D,c[3]=(f*w-m*z-d*S)*D,c[4]=(l*T-s*U-o*R)*D,c[5]=(e*U-i*T+n*R)*D,c[6]=(y*M-v*z-p*g)*D,c[7]=(u*z-f*M+d*g)*D,c[8]=(s*F-a*T+o*A)*D,c[9]=(r*T-e*F-n*A)*D,c[10]=(v*w-b*M+p*x)*D,c[11]=(m*M-u*w-d*x)*D,c[12]=(a*R-s*P-l*A)*D,c[13]=(e*P-r*R+i*A)*D,c[14]=(b*g-v*S-y*x)*D,c[15]=(u*S-m*g+f*x)*D,c):null}function ar(c,t,e,r,i){let n=1/Math.tan(t/2);return c.fill(0),c[0]=n/e,c[5]=n,c[10]=(i+r)/(r-i),c[11]=-1,c[14]=2*i*r/(r-i),c}function cr(c,t,e,r,i,n,s){return c.fill(0),c[0]=2/(e-t),c[5]=2/(i-r),c[10]=-2/(s-n),c[12]=-(e+t)/(e-t),c[13]=-(i+r)/(i-r),c[14]=-(s+n)/(s-n),c[15]=1,c}function Vt(c,t,e,r,i,n,s,a,l,o){let u=t-i,m=e-n,f=r-s,d=Math.hypot(u,m,f);u/=d,m/=d,f/=d;let v=l*f-o*m,b=o*u-a*f,y=a*m-l*u;d=Math.hypot(v,b,y),d<1e-9?(v=1,b=0,y=0):(v/=d,b/=d,y/=d);let p=m*y-f*b,x=f*v-u*y,g=u*b-m*v;return c[0]=v,c[1]=p,c[2]=u,c[3]=0,c[4]=b,c[5]=x,c[6]=m,c[7]=0,c[8]=y,c[9]=g,c[10]=f,c[11]=0,c[12]=-(v*t+b*e+y*r),c[13]=-(p*t+x*e+g*r),c[14]=-(u*t+m*e+f*r),c[15]=1,c}function Mt(c,t,e){let r=Math.imul(c|0,2376512323)^Math.imul(t|0,3625334849)^Math.imul(e|0,3407524639);return r=Math.imul(r^r>>>15,739982445),r=Math.imul(r^r>>>12,695872825),(r^r>>>15)>>>0}var Kt=(c,t,e)=>Mt(c,t,e)/4294967296,Ft=class{constructor(t=1){h(this,"s");this.s=t>>>0}next(){let t=(this.s+=1831565813)>>>0;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}range(t,e){return t+(e-t)*this.next()}int(t,e){return Math.floor(t+(e-t+1)*this.next())}chance(t){return this.next()<t}pick(t){return t[Math.floor(this.next()*t.length)]}};function $r(c,t,e=0){let r=Math.floor(c),i=Math.floor(t),n=c-r,s=t-i,a=n*n*(3-2*n),l=s*s*(3-2*s),o=Kt(r,i,e),u=Kt(r+1,i,e),m=Kt(r,i+1,e),f=Kt(r+1,i+1,e);return o+(u-o)*a+(m-o)*l+(o-u-m+f)*a*l}function lr(c,t,e,r=0){let i=0,n=.5,s=1,a=0;for(let l=0;l<e;l++)i+=n*$r(c*s,t*s,r+l*17),a+=n,n*=.5,s*=2.03;return i/a}var Ce=4096,$t=8,Jt=class{constructor(t){this.canvas=t;h(this,"gl");h(this,"pool");h(this,"multiDraw");h(this,"settings",{scale:1,shadows:!0,shadowSize:2048,ssao:!0,taa:!0,bloom:!0,edge:.07});h(this,"palAlbedo");h(this,"palParams");h(this,"xformTex");h(this,"xformData",new Float32Array(Ce*$t*4));h(this,"xformDirtyMax",0);h(this,"freeSlots",[]);h(this,"nextSlot",1);h(this,"pG");h(this,"pShadow");h(this,"pLight");h(this,"pSSAO");h(this,"pBlur");h(this,"pGlass");h(this,"pTAA");h(this,"pBloomDown");h(this,"pBloomUp");h(this,"pFinal");h(this,"pCopy");h(this,"emptyVao");h(this,"w",0);h(this,"h",0);h(this,"canvasW",0);h(this,"canvasH",0);h(this,"gAlbedo");h(this,"gNormal");h(this,"gMat");h(this,"gDepth");h(this,"gFbo");h(this,"hdr");h(this,"linDepth");h(this,"lightFbo");h(this,"forwardFbo");h(this,"ssaoA");h(this,"ssaoB");h(this,"hist",[]);h(this,"histIdx",0);h(this,"bloomMips",[]);h(this,"shadowTex",null);h(this,"shadowFbos",[]);h(this,"shadowSize",0);h(this,"viewProj",Q());h(this,"invViewProj",Q());h(this,"prevViewProj",Q());h(this,"prevValid",!1);h(this,"reproj",Q());h(this,"tmp",Q());h(this,"frustum",new Nt);h(this,"cascadeVP",[Q(),Q(),Q(),Q()]);h(this,"cascadeVPFlat",new Float32Array(16*it));h(this,"cascadeSplits",[10,30,85,220]);h(this,"cascadeTexel",new Float32Array(it));h(this,"cascadeFrame",0);h(this,"lightPos",new Float32Array(gt*4));h(this,"lightCol",new Float32Array(gt*4));h(this,"firsts",new Int32Array(4096));h(this,"counts",new Int32Array(4096));h(this,"drawN",0);h(this,"frame",0);h(this,"jx",0);h(this,"jy",0);h(this,"time",0);h(this,"flash",0);h(this,"damage",0);h(this,"stats",{drawn:0,quads:0,shadowDraws:0});h(this,"forwardPasses",[]);h(this,"cam");h(this,"env");let e=t.getContext("webgl2",{antialias:!1,alpha:!1,depth:!1,stencil:!1,powerPreference:"high-performance",preserveDrawingBuffer:!1});if(!e)throw new Error("WebGL2 is not supported by this browser.");if(this.gl=e,!e.getExtension("EXT_color_buffer_float"))throw new Error("EXT_color_buffer_float not supported.");e.getExtension("OES_texture_float_linear"),this.multiDraw=e.getExtension("WEBGL_multi_draw"),this.pool=new et(e,512),this.emptyVao=e.createVertexArray();let r=new Uint8Array(256*4),i=new Uint8Array(256*4);for(let s=0;s<Yt;s++){let a=ht[s];r[s*4]=a.r,r[s*4+1]=a.g,r[s*4+2]=a.b,r[s*4+3]=255,i[s*4]=Math.round(a.rough*255),i[s*4+1]=Math.round(a.metal*255),i[s*4+2]=Math.min(255,Math.round(a.emissive/16*255)),i[s*4+3]=De[s]}this.palAlbedo=rt(e,256,1,e.SRGB8_ALPHA8,e.RGBA,e.UNSIGNED_BYTE,{filter:e.NEAREST},r),this.palParams=rt(e,256,1,e.RGBA8,e.RGBA,e.UNSIGNED_BYTE,{filter:e.NEAREST},i);let n=this.xformData;for(let s=0;s<2;s++)n[s*12+0]=.1,n[s*12+5]=.1,n[s*12+10]=.1;this.xformTex=rt(e,$t,Ce,e.RGBA32F,e.RGBA,e.FLOAT,{filter:e.NEAREST},n),this.pG=new J(e,Te,Ye,"gbuffer"),this.pShadow=new J(e,Qe,Ke,"shadow"),this.pLight=new J(e,ut,tr.replace("out vec4 oColor;",`layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oLin;`).replace(/oColor = vec4\(fullSky\(rd\), 1\.0\);\n    return;/,`oColor = vec4(fullSky(rd), 1.0); oLin = vec4(1e5);
    return;`).replace(`oColor = vec4(col, 1.0);
}`,`oColor = vec4(col, 1.0); oLin = vec4(dist);
}`),"lighting"),this.pSSAO=new J(e,ut,$e,"ssao"),this.pBlur=new J(e,ut,Je,"ssaoBlur"),this.pGlass=new J(e,Te,er,"glass"),this.pTAA=new J(e,ut,rr,"taa"),this.pBloomDown=new J(e,ut,sr,"bloomDown"),this.pBloomUp=new J(e,ut,nr,"bloomUp"),this.pFinal=new J(e,ut,ir,"final"),this.pCopy=new J(e,ut,or,"copy")}allocSlot(){return this.freeSlots.pop()??(this.nextSlot<Ce?this.nextSlot++:-1)}freeSlot(t){t>0&&this.freeSlots.push(t)}setXform(t,e,r){let i=t*$t*4,n=this.xformData;for(let s=0;s<12;s++)n[i+s]=e[s],n[i+12+s]=r[s];t+1>this.xformDirtyMax&&(this.xformDirtyMax=t+1)}resize(){let t=this.gl,e=Math.min(window.devicePixelRatio||1,2),r=Math.max(1,Math.floor(this.canvas.clientWidth*e)),i=Math.max(1,Math.floor(this.canvas.clientHeight*e)),n=Math.max(1,Math.floor(r*this.settings.scale)),s=Math.max(1,Math.floor(i*this.settings.scale));if((this.canvas.width!==r||this.canvas.height!==i)&&(this.canvas.width=r,this.canvas.height=i),this.canvasW=r,this.canvasH=i,n===this.w&&s===this.h)return;this.w=n,this.h=s;let a=t.LINEAR,l=t.NEAREST;this.gAlbedo=rt(t,n,s,t.RGBA8,t.RGBA,t.UNSIGNED_BYTE,{filter:l}),this.gNormal=rt(t,n,s,t.RGBA8,t.RGBA,t.UNSIGNED_BYTE,{filter:l}),this.gMat=rt(t,n,s,t.RGBA16F,t.RGBA,t.HALF_FLOAT,{filter:l}),this.gDepth=rt(t,n,s,t.DEPTH_COMPONENT32F,t.DEPTH_COMPONENT,t.FLOAT,{filter:l}),this.gFbo=Tt(t,[this.gAlbedo,this.gNormal,this.gMat],this.gDepth),this.hdr=rt(t,n,s,t.RGBA16F,t.RGBA,t.HALF_FLOAT,{filter:a}),this.linDepth=rt(t,n,s,t.R32F,t.RED,t.FLOAT,{filter:l}),this.lightFbo=Tt(t,[this.hdr,this.linDepth],null),this.forwardFbo=Tt(t,[this.hdr],this.gDepth);let o=Math.max(1,n>>1),u=Math.max(1,s>>1);this.ssaoA=this.target(o,u,t.R8,t.RED,t.UNSIGNED_BYTE,a),this.ssaoB=this.target(o,u,t.R8,t.RED,t.UNSIGNED_BYTE,a),this.hist=[this.target(n,s,t.RGBA16F,t.RGBA,t.HALF_FLOAT,a),this.target(n,s,t.RGBA16F,t.RGBA,t.HALF_FLOAT,a)],this.prevValid=!1,this.bloomMips=[];let m=o,f=u;for(let d=0;d<6&&m>=4&&f>=4;d++)this.bloomMips.push(this.target(m,f,t.RGBA16F,t.RGBA,t.HALF_FLOAT,a)),m>>=1,f>>=1}target(t,e,r,i,n,s){let a=rt(this.gl,t,e,r,i,n,{filter:s});return{tex:a,fbo:Tt(this.gl,[a],null),w:t,h:e}}ensureShadow(){let t=this.settings.shadowSize;if(this.shadowTex&&this.shadowSize===t)return;let e=this.gl;this.shadowTex&&(e.deleteTexture(this.shadowTex),this.shadowFbos.forEach(i=>e.deleteFramebuffer(i)));let r=e.createTexture();e.bindTexture(e.TEXTURE_2D_ARRAY,r),e.texStorage3D(e.TEXTURE_2D_ARRAY,1,e.DEPTH_COMPONENT24,t,t,it),e.texParameteri(e.TEXTURE_2D_ARRAY,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D_ARRAY,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D_ARRAY,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D_ARRAY,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D_ARRAY,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(e.TEXTURE_2D_ARRAY,e.TEXTURE_COMPARE_FUNC,e.LEQUAL),this.shadowTex=r,this.shadowFbos=[];for(let i=0;i<it;i++)this.shadowFbos.push(Tt(e,[],r,i));this.shadowSize=t,this.cascadeFrame=0}beginList(){this.drawN=0}add(t,e){if(!(e<=0)){if(this.drawN>=this.firsts.length){let r=new Int32Array(this.firsts.length*2);r.set(this.firsts),this.firsts=r;let i=new Int32Array(this.counts.length*2);i.set(this.counts),this.counts=i}this.firsts[this.drawN]=t*6,this.counts[this.drawN]=e*6,this.drawN++}}flush(){let t=this.gl,e=this.drawN;if(e!==0){if(this.multiDraw)this.multiDraw.multiDrawArraysWEBGL(t.TRIANGLES,this.firsts,0,this.counts,0,e);else for(let r=0;r<e;r++)t.drawArrays(t.TRIANGLES,this.firsts[r],this.counts[r]);this.drawN=0}}collect(t,e,r,i,n,s,a,l){let o=0,u=t.active,m=t.bounds;for(let f=0;f<u.length;f++){let d=u[f],v=i?t.nTr[d]:t.nOp[d];if(v===0)continue;let b=d*6;if(n>0){let p=Math.max(m[b]-s,0,s-m[b+3]),x=Math.max(m[b+1]-a,0,a-m[b+4]),g=Math.max(m[b+2]-l,0,l-m[b+5]);if(p*p+x*x+g*g>n)continue}if(!r.testBox(m[b],m[b+1],m[b+2],m[b+3],m[b+4],m[b+5]))continue;let y=t.start[d]+(i?t.nOp[d]:0);this.add(y,v),o+=v}for(let f=0;f<e.length;f++){let d=e[f],v=i?d.nTr:d.nOp;v!==0&&r.testSphere(d.x,d.y,d.z,d.r)&&(this.add(d.start+(i?d.nOp:0),v),o+=v)}return o}bindQuadData(t){t.tex("uQuads",0,this.pool.tex),t.tex("uXforms",1,this.xformTex)}fullscreen(){this.gl.drawArrays(this.gl.TRIANGLES,0,3)}render(t,e,r,i,n,s){let a=this.gl;this.resize(),this.cam=t,this.env=e,this.time+=s,this.frame++;let l=this.w,o=this.h;if(a.bindVertexArray(this.emptyVao),this.xformDirtyMax>0&&(a.bindTexture(a.TEXTURE_2D,this.xformTex),a.texSubImage2D(a.TEXTURE_2D,0,0,0,$t,this.xformDirtyMax,a.RGBA,a.FLOAT,this.xformData,0),this.xformDirtyMax=0),Zt(this.viewProj,t.proj,t.view),ke(this.invViewProj,this.viewProj),this.prevValid||this.prevViewProj.set(this.viewProj),this.settings.taa){let p=ur(this.frame%8+1,2)-.5,x=ur(this.frame%8+1,3)-.5;this.jx=p*2/l,this.jy=x*2/o}else this.jx=0,this.jy=0;this.frustum.setFromMatrix(this.viewProj),this.settings.shadows&&this.renderShadows(t,e,i,n),a.bindFramebuffer(a.FRAMEBUFFER,this.gFbo),a.viewport(0,0,l,o),a.clearColor(0,0,0,0),a.clearDepth(1),a.depthMask(!0),a.colorMask(!0,!0,!0,!0),a.clear(a.COLOR_BUFFER_BIT|a.DEPTH_BUFFER_BIT),a.enable(a.DEPTH_TEST),a.depthFunc(a.LESS),a.enable(a.CULL_FACE),a.cullFace(a.BACK),a.disable(a.BLEND);let u=this.pG.use();this.bindQuadData(u),u.m4("uViewProj",this.viewProj).m4("uPrevViewProj",this.prevViewProj).f2("uJitter",this.jx,this.jy),u.tex("uPalAlbedo",2,this.palAlbedo).tex("uPalParams",3,this.palParams).f("uEdge",this.settings.edge),this.beginList(),this.stats.quads=this.collect(i,n,this.frustum,!1,0,t.x,t.y,t.z),this.stats.drawn=this.drawN,this.flush(),this.settings.ssao&&this.renderSSAO(t),a.disable(a.DEPTH_TEST),a.disable(a.CULL_FACE),a.bindFramebuffer(a.FRAMEBUFFER,this.lightFbo),a.viewport(0,0,l,o);let m=this.pLight.use();this.setEnvUniforms(m,e,t),m.tex("uAlbedo",0,this.gAlbedo).tex("uNormal",1,this.gNormal).tex("uMat",2,this.gMat).tex("uDepth",3,this.gDepth).tex("uSSAO",4,this.ssaoA?this.ssaoA.tex:null).tex("uShadow",5,this.shadowTex,a.TEXTURE_2D_ARRAY),m.m4("uInvViewProj",this.invViewProj),this.setCascadeUniforms(m),m.i("uUseSSAO",this.settings.ssao?1:0).f("uShadowSoft",1).i("uFrame",this.frame);let f=Math.min(r.length,gt);for(let p=0;p<f;p++){let x=r[p];this.lightPos[p*4]=x.x,this.lightPos[p*4+1]=x.y,this.lightPos[p*4+2]=x.z,this.lightPos[p*4+3]=x.radius,this.lightCol[p*4]=x.r,this.lightCol[p*4+1]=x.g,this.lightCol[p*4+2]=x.b,this.lightCol[p*4+3]=0}m.f4v("uLightPos",this.lightPos).f4v("uLightCol",this.lightCol).i("uLightCount",f),this.settings.shadows||this.ensureShadow(),this.fullscreen(),a.bindFramebuffer(a.FRAMEBUFFER,this.forwardFbo),a.viewport(0,0,l,o),a.enable(a.DEPTH_TEST),a.depthMask(!1),a.enable(a.BLEND),a.blendFuncSeparate(a.SRC_ALPHA,a.ONE_MINUS_SRC_ALPHA,a.ZERO,a.ONE),a.disable(a.CULL_FACE);let d=this.pGlass.use();this.bindQuadData(d),d.m4("uViewProj",this.viewProj).m4("uPrevViewProj",this.prevViewProj).f2("uJitter",this.jx,this.jy),d.tex("uPalAlbedo",2,this.palAlbedo).tex("uPalParams",3,this.palParams).f("uEdge",this.settings.edge),d.tex("uShadow",5,this.shadowTex,a.TEXTURE_2D_ARRAY),this.setEnvUniforms(d,e,t),this.setCascadeUniforms(d),this.beginList(),this.collect(i,n,this.frustum,!0,0,t.x,t.y,t.z),this.flush();for(let p of this.forwardPasses)p.draw(this);a.depthMask(!0),a.disable(a.BLEND),a.disable(a.DEPTH_TEST);let v=this.hdr;if(this.settings.taa){let p=this.hist[this.histIdx],x=this.hist[1-this.histIdx];a.bindFramebuffer(a.FRAMEBUFFER,x.fbo),a.viewport(0,0,l,o),Zt(this.reproj,this.prevViewProj,this.invViewProj),this.pTAA.use().tex("uCurrent",0,this.hdr).tex("uHistory",1,p.tex).tex("uMat",2,this.gMat).tex("uDepth",3,this.gDepth).f2("uTexel",1/l,1/o).f("uBlend",.1).i("uReset",this.prevValid?0:1).m4("uReproj",this.reproj),this.fullscreen(),this.histIdx=1-this.histIdx,v=x.tex}let b=null;if(this.settings.bloom&&this.bloomMips.length>1){let p=this.pBloomDown.use(),x=v,g=l,M=o;for(let w=0;w<this.bloomMips.length;w++){let z=this.bloomMips[w];a.bindFramebuffer(a.FRAMEBUFFER,z.fbo),a.viewport(0,0,z.w,z.h),p.tex("uSrc",0,x).f2("uTexel",1/g,1/M).i("uFirst",w===0?1:0).f("uThreshold",1),this.fullscreen(),x=z.tex,g=z.w,M=z.h}let S=this.pBloomUp.use();a.enable(a.BLEND),a.blendFunc(a.ONE,a.ONE);for(let w=this.bloomMips.length-1;w>0;w--){let z=this.bloomMips[w],A=this.bloomMips[w-1];a.bindFramebuffer(a.FRAMEBUFFER,A.fbo),a.viewport(0,0,A.w,A.h),S.tex("uSrc",0,z.tex).f2("uTexel",1/z.w,1/z.h).f("uRadius",1),this.fullscreen()}a.disable(a.BLEND),b=this.bloomMips[0].tex}a.bindFramebuffer(a.FRAMEBUFFER,null),a.viewport(0,0,this.canvasW,this.canvasH),this.pFinal.use().tex("uScene",0,v).tex("uBloom",1,b??v).f("uExposure",e.exposure).f("uBloomStrength",b?.06:0).f("uTime",this.time).f2("uRes",this.canvasW,this.canvasH).f("uFlash",this.flash).f("uDamage",this.damage),this.fullscreen(),this.prevViewProj.set(this.viewProj),this.prevValid=!0}invalidateHistory(){this.prevValid=!1}setEnvUniforms(t,e,r){t.v3("uSunDir",e.sunDir).v3("uSunColor",e.sunColor).v3("uSkyZenith",e.skyZenith).v3("uSkyHorizon",e.skyHorizon).v3("uGroundColor",e.groundColor).v3("uFogColor",e.fogColor).f("uFogDensity",e.fogDensity).f("uFogHeight",e.fogHeight).f("uTime",this.time).f3("uCamPos",r.x,r.y,r.z).f("uAmbient",e.ambient)}setCascadeUniforms(t){for(let r=0;r<it;r++)this.cascadeVPFlat.set(this.cascadeVP[r],r*16);this.gl.uniformMatrix4fv(t.loc("uCascadeVP[0]"),!1,this.cascadeVPFlat);let e=this.cascadeSplits;t.f4("uCascadeSplits",e[0],e[1],e[2],this.settings.shadows?e[3]:-1),this.gl.uniform1fv(t.loc("uCascadeTexel[0]"),this.cascadeTexel)}renderShadows(t,e,r,i){let n=this.gl;this.ensureShadow();let s=this.shadowSize,a=this.pShadow.use();this.bindQuadData(a),n.enable(n.DEPTH_TEST),n.depthFunc(n.LESS),n.depthMask(!0),n.enable(n.CULL_FACE),n.cullFace(n.FRONT),n.colorMask(!1,!1,!1,!1),n.enable(n.POLYGON_OFFSET_FILL),n.polygonOffset(1,2);let l=e.sunDir,o=t.view,u=-o[2],m=-o[6],f=-o[10],d=Math.tan(t.fov/2),v=d*t.aspect,b=new Nt;this.stats.shadowDraws=0;let y=t.near;for(let p=0;p<it;p++){let x=this.cascadeSplits[p];if(p<2||this.cascadeFrame%(p===2?2:4)===(p===2?0:1)||this.cascadeFrame<4){let M=(y+x)*.5,S=1+v*v+d*d,w=M*(1+(v*v+d*d));w>x&&(w=x);let z=Math.sqrt((x-w)*(x-w)+x*x*(S-1)),A=Math.sqrt((w-y)*(w-y)+y*y*(S-1)),R=Math.max(z,A);R=Math.ceil(R*16)/16;let T=t.x+u*w,P=t.y+m*w,F=t.z+f*w,U=Vt(this.tmp,0,0,0,-l[0],-l[1],-l[2],0,1,0),D=R*2/s,I=U[0]*T+U[4]*P+U[8]*F,N=U[1]*T+U[5]*P+U[9]*F,q=U[2]*T+U[6]*P+U[10]*F;I=Math.floor(I/D)*D,N=Math.floor(N/D)*D,T=U[0]*I+U[1]*N+U[2]*q,P=U[4]*I+U[5]*N+U[6]*q,F=U[8]*I+U[9]*N+U[10]*q;let B=R+150,V=Vt(Q(),T+l[0]*B,P+l[1]*B,F+l[2]*B,T,P,F,0,1,0),L=cr(Q(),-R,R,-R,R,.5,B+R+60);Zt(this.cascadeVP[p],L,V),this.cascadeTexel[p]=D,n.bindFramebuffer(n.FRAMEBUFFER,this.shadowFbos[p]),n.viewport(0,0,s,s),n.clear(n.DEPTH_BUFFER_BIT),a.m4("uLightVP",this.cascadeVP[p]),b.setFromMatrix(this.cascadeVP[p]),this.beginList(),this.collect(r,i,b,!1,0,t.x,t.y,t.z),this.stats.shadowDraws+=this.drawN,this.flush()}y=x}this.cascadeFrame++,n.disable(n.POLYGON_OFFSET_FILL),n.colorMask(!0,!0,!0,!0),n.cullFace(n.BACK)}renderSSAO(t){let e=this.gl;e.disable(e.DEPTH_TEST),e.disable(e.CULL_FACE);let r=this.ssaoA,i=this.ssaoB;e.bindFramebuffer(e.FRAMEBUFFER,i.fbo),e.viewport(0,0,i.w,i.h);let n=ke(Q(),t.proj);this.pSSAO.use().tex("uDepth",0,this.gDepth).tex("uNormal",1,this.gNormal).m4("uProj",t.proj).m4("uInvProj",n).m4("uView",t.view).f2("uTexel",1/i.w,1/i.h).f("uRadius",.55).i("uFrame",this.frame),this.fullscreen();let a=this.pBlur.use();a.f("uNear",t.near).f("uFar",t.far),e.bindFramebuffer(e.FRAMEBUFFER,r.fbo),a.tex("uAO",0,i.tex).tex("uDepth",1,this.gDepth).f2("uTexel",1/r.w,1/r.h).f2("uDir",1,0),this.fullscreen(),e.bindFramebuffer(e.FRAMEBUFFER,i.fbo),a.tex("uAO",0,r.tex).f2("uDir",0,1),this.fullscreen(),this.ssaoA=i,this.ssaoB=r}get jitter(){return[this.jx,this.jy]}};function ur(c,t){let e=1,r=0;for(;c>0;)e/=t,r+=e*(c%t),c=Math.floor(c/t);return r}var te=2;var K=[];K[0]=[E.asphalt,E.gravel,E.gravel];K[1]=[E.asphaltPatch,E.gravel,E.gravel];K[2]=[E.lineWhite,E.asphalt,E.gravel,E.gravel];K[3]=[E.lineYellow,E.asphalt,E.gravel,E.gravel];K[4]=[E.concrete,E.concrete,E.concreteMid,E.gravel];K[5]=[E.concreteDark,E.concreteMid,E.concreteMid,E.gravel];K[6]=[E.gravel,E.gravel,E.dirt];K[7]=[E.dirt,E.dirt];K[8]=[E.grass,E.dirt,E.dirt];K[9]=[E.grassDry,E.dirt,E.dirt];K[10]=[E.mud,E.mud,E.dirtDark];K[11]=[E.sand,E.sand,E.dirt];K[12]=[E.ballast,E.ballast,E.gravel];K[13]=[E.coal,E.coal,E.coal,E.dirtDark];K[14]=[E.rock,E.rock,E.rock];var It=new Uint8Array(120),Ue=new Uint8Array(15);for(let c=0;c<15;c++){let t=K[c];Ue[c]=t.length;for(let e=0;e<t.length;e++)It[c*8+e]=t[e]}var ee=class{constructor(t,e,r){this.sx=t;this.sz=e;h(this,"height");h(this,"ground");this.height=new Int16Array(t*e).fill(r),this.ground=new Uint8Array(t*e).fill(8)}heightAt(t,e){return t<0||e<0||t>=this.sx||e>=this.sz?0:this.height[t+e*this.sx]}eval(t,e,r){if(e<te)return E.bedrock;let i=t+r*this.sx,n=this.height[i];if(e>=n)return 0;let s=n-1-e,a=this.ground[i],l=Mt(t,e,r);return s<Ue[a]?s===0?It[a*8]:st(It[a*8+s],l):(l&63)===0?st(E.rock,l>>>8):s>14?st(E.dirtDark,l>>>8):st(E.dirt,l>>>8)}fillColumn(t,e,r,i,n,s,a){let l=t+e*this.sx,o=this.height[l],u=this.ground[l],m=Ue[u],f=u*8,d=Math.min(i,o);for(let v=r;v<d;v++,s+=a){if(v<te){n[s]=E.bedrock;continue}let b=o-1-v,y=Mt(t,v,e);b<m?n[s]=b===0?It[f]:st(It[f+b],y):(y&63)===0?n[s]=st(E.rock,y>>>8):n[s]=b>14?st(E.dirtDark,y>>>8):st(E.dirt,y>>>8)}}rangeIn(t,e,r,i){let n=1073741824,s=-1;for(let a=e;a<=i;a++){let l=a*this.sx;for(let o=t;o<=r;o++){let u=this.height[l+o];u<n&&(n=u),u>s&&(s=u)}}return[n,s]}};var _=.1;var Le=4;var _e=4096,at=32,G=5;var re=class{constructor(t,e,r,i){this.sx=t;this.sy=e;this.sz=r;h(this,"ncx");h(this,"ncy");h(this,"ncz");h(this,"nchunks");h(this,"nrx");h(this,"nry");h(this,"nrz");h(this,"nregions");h(this,"kind");h(this,"uni");h(this,"data");h(this,"count");h(this,"regionDirty");h(this,"dirtyQueue",[]);h(this,"terrain");h(this,"changeBoxes",[]);h(this,"edits",0);this.ncx=t>>Le,this.ncy=e>>Le,this.ncz=r>>Le,this.nchunks=this.ncx*this.ncy*this.ncz,this.nrx=t>>G,this.nry=e>>G,this.nrz=r>>G,this.nregions=this.nrx*this.nry*this.nrz,this.kind=new Uint8Array(this.nchunks),this.uni=new Uint8Array(this.nchunks),this.data=new Array(this.nchunks).fill(null),this.count=new Int32Array(this.nchunks),this.regionDirty=new Uint8Array(this.nregions),this.terrain=new ee(t,r,i)}initTerrain(){let t=this.terrain;for(let e=0;e<this.ncz;e++)for(let r=0;r<this.ncx;r++){let[,i]=t.rangeIn(r<<4,e<<4,(r<<4)+15,(e<<4)+15);for(let n=0;n<this.ncy;n++){let s=r+this.ncx*(e+this.ncz*n),a=n<<4;this.data[s]=null,this.kind[s]=a<i||a<te?3:0}}}chunkIndex(t,e,r){return t+this.ncx*(r+this.ncz*e)}regionIndex(t,e,r){return t+this.nrx*(r+this.nrz*e)}inBounds(t,e,r){return t>=0&&e>=0&&r>=0&&t<this.sx&&e<this.sy&&r<this.sz}get(t,e,r){if((t|e|r)<0||t>=this.sx||e>=this.sy||r>=this.sz)return this.outside(t,e,r);let i=(t>>4)+this.ncx*((r>>4)+this.ncz*(e>>4)),n=this.kind[i];return n===2?this.data[i][t&15|(r&15)<<4|(e&15)<<8]:n===0?0:n===1?this.uni[i]:this.terrain.eval(t,e,r)}outside(t,e,r){if(e<0)return E.bedrock;if(e>=this.sy)return 0;let i=t<0?0:t>=this.sx?this.sx-1:t,n=r<0?0:r>=this.sz?this.sz-1:r;return this.terrain.eval(i,e,n)}chunkMayBeSolid(t,e,r){if((t|e|r)<0)return e<0;if(t>=this.sx||e>=this.sy||r>=this.sz)return!1;let i=(t>>4)+this.ncx*((r>>4)+this.ncz*(e>>4)),n=this.kind[i];return n===0?!1:n===2?this.count[i]>0:n===1?this.uni[i]!==0:!0}materialize(t){let e=this.kind[t],r=new Uint8Array(_e),i=0;if(e===1)r.fill(this.uni[t]),i=this.uni[t]?_e:0;else if(e===3){let n=t%this.ncx,s=t/this.ncx|0,a=s%this.ncz,l=s/this.ncz|0,o=n<<4,u=l<<4,m=a<<4,f=this.terrain,d=0;for(let v=0;v<16;v++)for(let b=0;b<16;b++)for(let y=0;y<16;y++){let p=f.eval(o+y,u+v,m+b);r[d++]=p,p&&i++}}return this.data[t]=r,this.kind[t]=2,this.count[t]=i,r}set(t,e,r,i){if((t|e|r)<0||t>=this.sx||e>=this.sy||r>=this.sz)return 0;let n=(t>>4)+this.ncx*((r>>4)+this.ncz*(e>>4)),s;if(this.kind[n]!==2){let o=this.get(t,e,r);if(o===i)return o;s=this.materialize(n)}else s=this.data[n];let a=t&15|(r&15)<<4|(e&15)<<8,l=s[a];return l===i||(s[a]=i,this.edits++,l===0?this.count[n]++:i===0&&--this.count[n]===0&&(this.kind[n]=0,this.data[n]=null),this.markDirty(t,e,r)),l}markDirty(t,e,r){let i=Math.max(0,t-1>>G),n=Math.min(this.nrx-1,t+1>>G),s=Math.max(0,e-1>>G),a=Math.min(this.nry-1,e+1>>G),l=Math.max(0,r-1>>G),o=Math.min(this.nrz-1,r+1>>G);for(let u=s;u<=a;u++)for(let m=l;m<=o;m++)for(let f=i;f<=n;f++){let d=f+this.nrx*(m+this.nrz*u);this.regionDirty[d]||(this.regionDirty[d]=1,this.dirtyQueue.push(d))}}markBoxDirty(t,e,r,i,n,s){let a=Math.max(0,t-1>>G),l=Math.min(this.nrx-1,i+1>>G),o=Math.max(0,e-1>>G),u=Math.min(this.nry-1,n+1>>G),m=Math.max(0,r-1>>G),f=Math.min(this.nrz-1,s+1>>G);for(let d=o;d<=u;d++)for(let v=m;v<=f;v++)for(let b=a;b<=l;b++){let y=b+this.nrx*(v+this.nrz*d);this.regionDirty[y]||(this.regionDirty[y]=1,this.dirtyQueue.push(y))}}noteChange(t,e,r,i,n,s){this.changeBoxes.push(t,e,r,i,n,s)}copyBox(t,e,r,i,n,s,a){a.fill(0,0,i*n*s);let l=t+i,o=e+n,u=r+s,m=i*s;for(let f=e>>4;f<=o-1>>4;f++){let d=Math.max(e,f<<4),v=Math.min(o,(f<<4)+16);for(let b=r>>4;b<=u-1>>4;b++){let y=Math.max(r,b<<4),p=Math.min(u,(b<<4)+16);for(let x=t>>4;x<=l-1>>4;x++){let g=Math.max(t,x<<4),M=Math.min(l,(x<<4)+16),S=M-g;if(x<0||f<0||b<0||x>=this.ncx||f>=this.ncy||b>=this.ncz){for(let A=d;A<v;A++)for(let R=y;R<p;R++){let T=g-t+i*(R-r+s*(A-e));for(let P=g;P<M;P++)a[T++]=this.outside(P,A,R)}continue}let w=x+this.ncx*(b+this.ncz*f),z=this.kind[w];if(z!==0)if(z===1){let A=this.uni[w];if(!A)continue;for(let R=d;R<v;R++)for(let T=y;T<p;T++){let P=g-t+i*(T-r+s*(R-e));a.fill(A,P,P+S)}}else if(z===2){let A=this.data[w];for(let R=d;R<v;R++)for(let T=y;T<p;T++){let P=g&15|(T&15)<<4|(R&15)<<8,F=g-t+i*(T-r+s*(R-e));a.set(A.subarray(P,P+S),F)}}else{let A=this.terrain;for(let R=y;R<p;R++)for(let T=g;T<M;T++)A.fillColumn(T,R,d,v,a,T-t+i*(R-r+s*(d-e)),m)}}}}}gatherRegion(t,e,r,i){let n=at+2,s=(t<<G)-1,a=(e<<G)-1,l=(r<<G)-1,o=!1,u=!0;for(let v=e*2;v<e*2+2;v++)for(let b=r*2;b<r*2+2;b++)for(let y=t*2;y<t*2+2;y++){let p=this.chunkIndex(y,v,b),x=this.kind[p];(x===3||x===2&&this.count[p]>0||x===1&&this.uni[p])&&(o=!0),x!==3&&(u=!1)}if(!o)return 0;if(u){let[v]=this.terrain.rangeIn(Math.max(0,s),Math.max(0,l),Math.min(this.sx-1,s+n-1),Math.min(this.sz-1,l+n-1));if(a+n<v)return 2}this.copyBox(s,a,l,n,n,n,i);let m=0,f=0,d=n*n*n;for(let v=0;v<d;v++){let b=i[v];b&&(m++,f|=bt[b])}return m===0?0:m===d&&!f?2:1}denseBytes(){let t=0;for(let e=0;e<this.nchunks;e++)this.kind[e]===2&&(t+=_e);return t}};var hr=`"use strict";(()=>{var At=Object.defineProperty;var Ut=(n,t,c)=>t in n?At(n,t,{enumerable:!0,configurable:!0,writable:!0,value:c}):n[t]=c;var L=(n,t,c)=>Ut(n,typeof t!="symbol"?t+"":t,c);var I=class{constructor(t=1024){L(this,"data");L(this,"count",0);this.data=new Uint32Array(t*4)}reset(){this.count=0}push(t,c,d,s){let h=this.count*4;if(h+4>this.data.length){let J=new Uint32Array(this.data.length*2);J.set(this.data),this.data=J}let A=this.data;A[h++]=t,A[h++]=c,A[h++]=d,A[h]=s,this.count++}slice(){return this.data.slice(0,this.count*4)}},kt=[[0,1,2,1],[0,2,1,-1],[1,2,0,1],[1,0,2,-1],[2,0,1,1],[2,1,0,-1]],ot=256,N=new Uint32Array(4096);function ct(n,t,c,d,s,h,A,J,$,it,ut){let Q=t+2,tt=d+2,F=[t,c,d],R=[1,Q*tt,Q],ft=1+Q+Q*tt,U=[0,0,0];for(let V=0;V<6;V++){let Z=kt[V],S=Z[0],W=Z[1],Y=Z[2],nt=Z[3],at=F[S],m=F[W],_=F[Y],et=R[S],r=R[W],i=R[Y],mt=nt*et;N.length<m*_&&(N=new Uint32Array(m*_));let y=N,lt=V<<8;for(let C=0;C<at;C++){let j=0,st=!1,bt=ft+C*et;for(let u=0;u<_;u++){let k=bt+u*i;for(let o=0;o<m;o++,k+=r){let f=n[k];if(f===0){y[j++]=0;continue}let e=k+mt,a=n[e],w=s[f];if(a!==0&&(w||!s[a])){y[j++]=0;continue}let p=f|w<<16;if(w)p|=65280;else{let M=n[e-r],l=n[e+r],b=n[e-i],g=n[e+i],q=M!==0&&!s[M]?1:0,v=l!==0&&!s[l]?1:0,P=b!==0&&!s[b]?1:0,B=g!==0&&!s[g]?1:0;if(q|v|P|B){let E=n[e-r-i],X=n[e+r-i],z=n[e-r+i],G=n[e+r+i],x=E!==0&&!s[E]?1:0,D=X!==0&&!s[X]?1:0,H=z!==0&&!s[z]?1:0,K=G!==0&&!s[G]?1:0,dt=q&&P?0:3-(q+P+x),ht=v&&P?0:3-(v+P+D),yt=q&&B?0:3-(q+B+H),pt=v&&B?0:3-(v+B+K);p|=dt<<8|ht<<10|yt<<12|pt<<14}else{let E=n[e-r-i],X=n[e+r-i],z=n[e-r+i],G=n[e+r+i],x=3-(E!==0&&!s[E]?1:0),D=3-(X!==0&&!s[X]?1:0),H=3-(z!==0&&!s[z]?1:0),K=3-(G!==0&&!s[G]?1:0);p|=x<<8|D<<10|H<<12|K<<14}}y[j++]=p,st=!0}}if(st){U[S]=C+(nt>0?1:0);for(let u=0;u<_;u++){let k=u*m;for(let o=0;o<m;o++){let f=y[k+o];if(f===0)continue;let e=1;for(;o+e<m&&e<ot&&y[k+o+e]===f;)e++;let a=1;t:for(;u+a<_&&a<ot;){let l=(u+a)*m+o;for(let b=0;b<e;b++)if(y[l+b]!==f)break t;a++}for(let l=0;l<a;l++){let b=(u+l)*m+o;for(let g=0;g<e;g++)y[b+g]=0}U[W]=o,U[Y]=u;let w=U[0]+h|U[1]+A<<16,p=(U[2]+J|e-1<<16|a-1<<24)>>>0,M=f&255|lt|(f>>>8&255)<<11|f>>>16<<19;f>>>16?ut.push(w,p,M,$):it.push(w,p,M,$),o+=e-1}}}}}}var rt=new Uint8Array(256),O=new I(8192),T=new I(1024);self.onmessage=n=>{let t=n.data;if(t.type==="init"){rt=t.transparent;return}O.reset(),T.reset(),ct(t.vox,t.sx,t.sy,t.sz,rt,t.ox,t.oy,t.oz,t.slot,O,T);let c=O.slice(),d=T.slice();self.postMessage({id:t.id,opaque:c,trans:d,vox:t.vox},[c.buffer,d.buffer,t.vox.buffer])};})();
`;var pt=class{constructor(t=1024){h(this,"data");h(this,"count",0);this.data=new Uint32Array(t*4)}reset(){this.count=0}push(t,e,r,i){let n=this.count*4;if(n+4>this.data.length){let a=new Uint32Array(this.data.length*2);a.set(this.data),this.data=a}let s=this.data;s[n++]=t,s[n++]=e,s[n++]=r,s[n]=i,this.count++}slice(){return this.data.slice(0,this.count*4)}},Jr=[[0,1,2,1],[0,2,1,-1],[1,2,0,1],[1,0,2,-1],[2,0,1,1],[2,1,0,-1]],mr=256,Be=new Uint32Array(4096);function se(c,t,e,r,i,n,s,a,l,o,u){let m=t+2,f=r+2,d=[t,e,r],v=[1,m*f,m],b=1+m+m*f,y=[0,0,0];for(let p=0;p<6;p++){let x=Jr[p],g=x[0],M=x[1],S=x[2],w=x[3],z=d[g],A=d[M],R=d[S],T=v[g],P=v[M],F=v[S],U=w*T;Be.length<A*R&&(Be=new Uint32Array(A*R));let D=Be,I=p<<8;for(let N=0;N<z;N++){let q=0,B=!1,V=b+N*T;for(let L=0;L<R;L++){let Z=V+L*F;for(let X=0;X<A;X++,Z+=P){let Y=c[Z];if(Y===0){D[q++]=0;continue}let O=Z+U,tt=c[O],nt=i[Y];if(tt!==0&&(nt||!i[tt])){D[q++]=0;continue}let xt=Y|nt<<16;if(nt)xt|=65280;else{let Rt=c[O-P],ft=c[O+P],dt=c[O-F],St=c[O+F],Pt=Rt!==0&&!i[Rt]?1:0,Dt=ft!==0&&!i[ft]?1:0,kt=dt!==0&&!i[dt]?1:0,Ct=St!==0&&!i[St]?1:0;if(Pt|Dt|kt|Ct){let Ut=c[O-P-F],Lt=c[O+P-F],_t=c[O-P+F],Bt=c[O+P+F],we=Ut!==0&&!i[Ut]?1:0,Me=Lt!==0&&!i[Lt]?1:0,Ae=_t!==0&&!i[_t]?1:0,Se=Bt!==0&&!i[Bt]?1:0,Nr=Pt&&kt?0:3-(Pt+kt+we),Vr=Dt&&kt?0:3-(Dt+kt+Me),Ir=Pt&&Ct?0:3-(Pt+Ct+Ae),Or=Dt&&Ct?0:3-(Dt+Ct+Se);xt|=Nr<<8|Vr<<10|Ir<<12|Or<<14}else{let Ut=c[O-P-F],Lt=c[O+P-F],_t=c[O-P+F],Bt=c[O+P+F],we=3-(Ut!==0&&!i[Ut]?1:0),Me=3-(Lt!==0&&!i[Lt]?1:0),Ae=3-(_t!==0&&!i[_t]?1:0),Se=3-(Bt!==0&&!i[Bt]?1:0);xt|=we<<8|Me<<10|Ae<<12|Se<<14}}D[q++]=xt,B=!0}}if(B){y[g]=N+(w>0?1:0);for(let L=0;L<R;L++){let Z=L*A;for(let X=0;X<A;X++){let Y=D[Z+X];if(Y===0)continue;let O=1;for(;X+O<A&&O<mr&&D[Z+X+O]===Y;)O++;let tt=1;t:for(;L+tt<R&&tt<mr;){let ft=(L+tt)*A+X;for(let dt=0;dt<O;dt++)if(D[ft+dt]!==Y)break t;tt++}for(let ft=0;ft<tt;ft++){let dt=(L+ft)*A+X;for(let St=0;St<O;St++)D[dt+St]=0}y[M]=X,y[S]=L;let nt=y[0]+n|y[1]+s<<16,xt=(y[2]+a|O-1<<16|tt-1<<24)>>>0,Rt=Y&255|I|(Y>>>8&255)<<11|Y>>>16<<19;Y>>>16?u.push(nt,xt,Rt,l):o.push(nt,xt,Rt,l),X+=O-1}}}}}}function fr(c,t,e,r,i){let n=t+2,s=r+2,a=e+2,l=i&&i.length>=n*a*s?i:new Uint8Array(n*a*s);l.fill(0,0,n*a*s);for(let o=0;o<e;o++)for(let u=0;u<r;u++){let m=t*(u+r*o),f=1+n*(u+1+s*(o+1));l.set(c.subarray(m,m+t),f)}return l}var Ne=at+2,dr=Ne*Ne*Ne,ie=class ie{constructor(t,e,r){this.world=t;this.pool=e;h(this,"start");h(this,"nOp");h(this,"nTr");h(this,"allocN");h(this,"bounds");h(this,"active",[]);h(this,"activePos");h(this,"inflight");h(this,"seq");h(this,"applied");h(this,"workers",[]);h(this,"load",[]);h(this,"jobs",new Map);h(this,"nextJob",1);h(this,"bufPool",[]);h(this,"sortedLen",-1);h(this,"opBuf",new pt(8192));h(this,"trBuf",new pt(1024));h(this,"combine",new Uint32Array(4096*4));h(this,"meshedCount",0);h(this,"quadCount",0);h(this,"camX",0);h(this,"camY",0);h(this,"camZ",0);let i=t.nregions;this.start=new Int32Array(i).fill(-1),this.nOp=new Int32Array(i),this.nTr=new Int32Array(i),this.allocN=new Int32Array(i),this.bounds=new Float32Array(i*6),this.activePos=new Int32Array(i).fill(-1),this.inflight=new Uint8Array(i),this.seq=new Uint32Array(i),this.applied=new Uint32Array(i);try{let n=URL.createObjectURL(new Blob([hr],{type:"text/javascript"}));for(let s=0;s<r;s++){let a=new Worker(n);a.postMessage({type:"init",transparent:bt});let l=s;a.onmessage=o=>this.onResult(l,o.data),a.onerror=o=>{console.error("mesh worker error",o.message)},this.workers.push(a),this.load.push(0)}}catch(n){console.warn("Mesh workers unavailable, meshing on main thread",n)}}get pending(){return this.world.dirtyQueue.length+this.jobs.size}getBuf(){return this.bufPool.pop()??new Uint8Array(dr)}update(t,e,r,i=2){let n=this.world,s=n.dirtyQueue;if(s.length===0)return;let a=Math.abs(t-this.camX)+Math.abs(e-this.camY)+Math.abs(r-this.camZ)>8;if(s.length!==this.sortedLen||a){this.camX=t,this.camY=e,this.camZ=r;let u=n.nrx,m=n.nrz,f=at*_,d=b=>{let y=b%u,p=b/u|0,x=p%m,g=p/m|0,M=(y+.5)*f-t,S=(g+.5)*f-e,w=(x+.5)*f-r;return M*M+S*S+w*w},v=s.map(b=>({ri:b,d:d(b)}));v.sort((b,y)=>y.d-b.d);for(let b=0;b<s.length;b++)s[b]=v[b].ri}let l=[],o=0;for(;s.length>0;){let u=this.workers.length>0,m=-1;if(u){let M=ie.MAX_INFLIGHT;for(let S=0;S<this.load.length;S++)this.load[S]<M&&(M=this.load[S],m=S);if(m<0)break}if(!u&&o>=i)break;let f=s.pop();if(this.inflight[f]){l.push(f);continue}n.regionDirty[f]=0;let d=f%n.nrx,v=f/n.nrx|0,b=v%n.nrz,y=v/n.nrz|0,p=this.getBuf(),x=n.gatherRegion(d,y,b,p),g=++this.seq[f];if(x!==1){this.bufPool.push(p),this.apply(f,g,null,null);continue}if(u){let M=this.nextJob++;this.jobs.set(M,{ri:f,seq:g,worker:m}),this.inflight[f]=1,this.load[m]++,this.workers[m].postMessage({type:"mesh",id:M,vox:p,sx:at,sy:at,sz:at,ox:d<<G,oy:y<<G,oz:b<<G,slot:0},[p.buffer])}else this.opBuf.reset(),this.trBuf.reset(),se(p,at,at,at,bt,d<<G,y<<G,b<<G,0,this.opBuf,this.trBuf),this.bufPool.push(p),this.apply(f,g,this.opBuf.data.subarray(0,this.opBuf.count*4),this.trBuf.data.subarray(0,this.trBuf.count*4)),o++}for(let u of l)s.push(u);this.sortedLen=s.length}onResult(t,e){let r=this.jobs.get(e.id);this.load[t]--,e.vox&&e.vox.length===dr&&this.bufPool.push(e.vox),r&&(this.jobs.delete(e.id),this.inflight[r.ri]=0,this.apply(r.ri,r.seq,e.opaque,e.trans))}apply(t,e,r,i){if(e<this.applied[t])return;this.applied[t]=e;let n=r?r.length>>2:0,s=i?i.length>>2:0,a=n+s;if(this.quadCount+=a-this.nOp[t]-this.nTr[t],this.meshedCount++,a===0){this.start[t]>=0&&(this.pool.free(this.start[t],this.allocN[t]),this.start[t]=-1,this.allocN[t]=0),this.nOp[t]=0,this.nTr[t]=0,this.setActive(t,!1);return}let l=this.allocN[t];(this.start[t]<0||et.roundSize(a)>et.roundSize(l)||et.roundSize(l)>et.roundSize(a)*2+64)&&(this.start[t]>=0&&this.pool.free(this.start[t],l),this.start[t]=this.pool.alloc(a),this.allocN[t]=a),this.combine.length<a*4&&(this.combine=new Uint32Array(Math.max(a*4,this.combine.length*2)));let o=this.combine;r&&o.set(r,0),i&&o.set(i,n*4),this.pool.upload(this.start[t],o,a),this.nOp[t]=n,this.nTr[t]=s,rs(o,a,this.bounds,t*6),this.setActive(t,!0)}setActive(t,e){let r=this.activePos[t];if(e)r<0&&(this.activePos[t]=this.active.length,this.active.push(t));else if(r>=0){let i=this.active.pop();i!==t&&(this.active[r]=i,this.activePos[i]=r),this.activePos[t]=-1}}};h(ie,"MAX_INFLIGHT",6);var ne=ie,ts=[1,2,2,0,0,1],es=[2,1,0,2,1,0];function rs(c,t,e,r){let i=1e9,n=1e9,s=1e9,a=-1e9,l=-1e9,o=-1e9,u=[0,0,0];for(let m=0;m<t;m++){let f=c[m*4],d=c[m*4+1],v=c[m*4+2];u[0]=f&65535,u[1]=f>>>16,u[2]=d&65535;let b=(d>>>16&255)+1,y=(d>>>24)+1,p=v>>>8&7;u[0]<i&&(i=u[0]),u[1]<n&&(n=u[1]),u[2]<s&&(s=u[2]),u[ts[p]]+=b,u[es[p]]+=y,u[0]>a&&(a=u[0]),u[1]>l&&(l=u[1]),u[2]>o&&(o=u[2])}e[r]=i*_,e[r+1]=n*_,e[r+2]=s*_,e[r+3]=a*_,e[r+4]=l*_,e[r+5]=o*_}var j=c=>Math.round(c*10),Ot=class{constructor(t,e=1337){this.world=t;h(this,"rng");h(this,"onlyEmpty",!1);h(this,"written",0);this.rng=new Ft(e)}set(t,e,r,i){this.onlyEmpty&&this.world.get(t,e,r)!==0||(this.world.set(t,e,r,i),this.written++)}col(t,e,r,i){return typeof t=="number"?t:t(e,r,i)}box(t,e,r,i,n,s,a){i<t&&([t,i]=[i,t]),n<e&&([e,n]=[n,e]),s<r&&([r,s]=[s,r]);for(let l=e;l<n;l++)for(let o=r;o<s;o++)for(let u=t;u<i;u++){let m=this.col(a,u,l,o);m>=0&&this.set(u,l,o,m)}}clear(t,e,r,i,n,s){let a=this.onlyEmpty;this.onlyEmpty=!1;for(let l=e;l<n;l++)for(let o=r;o<s;o++)for(let u=t;u<i;u++)this.world.set(u,l,o,0);this.onlyEmpty=a}walls(t,e,r,i,n,s,a,l){this.box(t,e,r,i,n,r+a,l),this.box(t,e,s-a,i,n,s,l),this.box(t,e,r+a,t+a,n,s-a,l),this.box(i-a,e,r+a,i,n,s-a,l)}cylY(t,e,r,i,n,s,a=0,l=!1){let o=r*r,u=a>0?r-a:-1,m=u*u,f=Math.ceil(r);for(let d=-f;d<=f;d++)for(let v=-f;v<=f;v++){let b=(v+.5)*(v+.5)+(d+.5)*(d+.5);if(b>o)continue;let y=u<0||b>=m;for(let p=i;p<n;p++){if(!y&&!(l&&(p===i||p===n-1)))continue;let x=Math.floor(t)+v,g=Math.floor(e)+d,M=this.col(s,x,p,g);M>=0&&this.set(x,p,g,M)}}}cylX(t,e,r,i,n,s,a=0,l=!1){let o=r*r,u=a>0?r-a:-1,m=u*u,f=Math.ceil(r);for(let d=-f;d<=f;d++)for(let v=-f;v<=f;v++){let b=(d+.5)*(d+.5)+(v+.5)*(v+.5);if(b>o)continue;let y=u<0||b>=m;for(let p=i;p<n;p++){if(!y&&!(l&&(p===i||p===n-1)))continue;let x=Math.floor(t)+d,g=Math.floor(e)+v,M=this.col(s,p,x,g);M>=0&&this.set(p,x,g,M)}}}cylZ(t,e,r,i,n,s,a=0,l=!1){let o=r*r,u=a>0?r-a:-1,m=u*u,f=Math.ceil(r);for(let d=-f;d<=f;d++)for(let v=-f;v<=f;v++){let b=(d+.5)*(d+.5)+(v+.5)*(v+.5);if(b>o)continue;let y=u<0||b>=m;for(let p=i;p<n;p++){if(!y&&!(l&&(p===i||p===n-1)))continue;let x=Math.floor(e)+d,g=Math.floor(t)+v,M=this.col(s,g,x,p);M>=0&&this.set(g,x,p,M)}}}sphere(t,e,r,i,n,s=0){let a=i*i,l=s>0?i-s:-1,o=l*l,u=Math.ceil(i);for(let m=-u;m<=u;m++)for(let f=-u;f<=u;f++)for(let d=-u;d<=u;d++){let v=(d+.5)**2+(m+.5)**2+(f+.5)**2;if(v>a||l>=0&&v<o)continue;let b=Math.floor(t)+d,y=Math.floor(e)+m,p=Math.floor(r)+f,x=this.col(n,b,y,p);x>=0&&this.set(b,y,p,x)}}line(t,e,r,i,n,s,a,l){let o=i-t,u=n-e,m=s-r,f=Math.max(Math.abs(o),Math.abs(u),Math.abs(m),1),d=Math.floor((a-1)/2),v=a-1-d;for(let b=0;b<=f;b++){let y=Math.round(t+o*b/f),p=Math.round(e+u*b/f),x=Math.round(r+m*b/f);for(let g=-d;g<=v;g++)for(let M=-d;M<=v;M++)for(let S=-d;S<=v;S++){let w=this.col(l,y+g,p+M,x+S);w>=0&&this.set(y+g,p+M,x+S,w)}}}ibeam(t,e,r,i,n,s,a,l){for(let o=0;o<n;o++)for(let u=0;u<s;u++)for(let m=0;m<s;m++){let f=m===0||m===s-1,d=u===s>>1;if(!f&&!d)continue;let v=e,b=r,y=i,p=(M,S)=>{M==="x"?v+=S:M==="y"?b+=S:y+=S};p(t,o),p(a,u);let x=["x","y","z"].find(M=>M!==t&&M!==a);p(x,m);let g=this.col(l,v,b,y);g>=0&&this.set(v,b,y,g)}}static shade(t){return(e,r,i)=>st(t,Mt(e,r,i))}static mix(t){return(e,r,i)=>{let n=Mt(e,r,i)/4294967296,s=0;for(let[a,l]of t)if(s+=l,n<s)return a;return t[t.length-1][0]}}};function br(c){let t=c.terrain,e=40;for(let s=0;s<c.sz;s++)for(let a=0;a<c.sx;a++){let l=e,o=a-c.sx*.8,u=s-c.sz*.8,m=Math.sqrt(o*o+u*u);m<180&&(l+=Math.round((1-m/180)**2*60*lr(a*.01,s*.01,3))),t.height[a+s*c.sx]=l;let f=0;l>e+2?f=8:a<120||s<120?f=8:a%60<2&&s>200&&s<700&&(f=2),t.ground[a+s*c.sx]=f}c.initTerrain();let r=new Ot(c),i=300,n=300;r.walls(i,e,n,i+j(16),e+j(8),n+j(10),3,E.brick),r.box(i,e+j(8),n,i+j(16),e+j(8)+3,n+j(10),E.concrete),r.box(i+3,e,n+3,i+j(16)-3,e+2,n+j(10)-3,E.concreteFloor);for(let s=0;s<5;s++){let a=i+15+s*30;r.clear(a,e+12,n,a+16,e+40,n+3),r.box(a,e+12,n+1,a+16,e+40,n+2,E.glass)}r.clear(i+j(16)-3,e,n+30,i+j(16),e+28,n+50),r.walls(560,e,300,620,e+200,360,4,E.concrete);for(let s=e+30;s<e+200;s+=30)r.box(560,s,300,620,s+3,360,E.concreteMid);r.walls(300,e,520,420,e+50,600,1,E.galv),r.box(300,e+50,520,420,e+51,600,E.sheetRust),r.cylY(520,560,40,e,e+90,E.paintWhite,1,!0);for(let s=0;s<6;s++)r.box(250+s*14,e,450,260+s*14,e+10,460,E.crate);r.cylY(200,600,2.5,e,e+50,E.bark),r.sphere(200,e+60,600,18,Ot.mix([[E.leaves,.4],[E.leaves+1,.3],[E.leaves+2,.3]])),r.box(345,e+j(8)-6,n+50,355,e+j(8)-5,n+52,E.lampWarm),r.cylY(450,460,3,e,e+9,E.fuelRed),r.walls(650,e,450,650+j(6),e+j(2.6),450+j(2.4),1,E.contBlue),r.box(650,e+j(2.6),450,650+j(6),e+j(2.6)+1,450+j(2.4),E.contBlue)}var oe=class{constructor(){h(this,"x",0);h(this,"y",0);h(this,"z",0);h(this,"yaw",0);h(this,"pitch",0);h(this,"roll",0);h(this,"fov",75*Math.PI/180);h(this,"aspect",16/9);h(this,"near",.05);h(this,"far",900);h(this,"view",Q());h(this,"proj",Q());h(this,"shakeX",0);h(this,"shakeY",0)}forward(t){let e=Math.cos(this.pitch);t.x=-Math.sin(this.yaw)*e,t.y=Math.sin(this.pitch),t.z=-Math.cos(this.yaw)*e}update(t){this.aspect=t;let e=this.pitch+this.shakeY,r=this.yaw+this.shakeX,i=Math.cos(e),n=-Math.sin(r)*i,s=Math.sin(e),a=-Math.cos(r)*i,l=0,o=1,u=0;if(this.roll!==0){let m=-Math.cos(r),f=Math.sin(r),d=Math.cos(this.roll),v=Math.sin(this.roll);l=m*v,o=d,u=f*v}Vt(this.view,this.x,this.y,this.z,this.x+n,this.y+s,this.z+a,l,o,u),ar(this.proj,this.fov,t,this.near,this.far)}};var ae=class{constructor(t){this.canvas=t;h(this,"down",new Set);h(this,"pressed",new Set);h(this,"released",new Set);h(this,"mouseDX",0);h(this,"mouseDY",0);h(this,"wheel",0);h(this,"buttons",0);h(this,"btnPressed",0);h(this,"btnReleased",0);h(this,"locked",!1);h(this,"sensitivity",.0022);h(this,"onLockChange",null);window.addEventListener("keydown",e=>{if(e.repeat){this.locked&&e.preventDefault();return}this.down.add(e.code),this.pressed.add(e.code),this.locked&&(e.code==="Tab"||e.code==="Space"||e.code.startsWith("Arrow")||e.code==="F1")&&e.preventDefault()}),window.addEventListener("keyup",e=>{this.down.delete(e.code),this.released.add(e.code)}),window.addEventListener("blur",()=>{this.down.clear(),this.buttons=0}),t.addEventListener("mousedown",e=>{this.locked&&(this.buttons|=1<<e.button,this.btnPressed|=1<<e.button,e.preventDefault())}),window.addEventListener("mouseup",e=>{this.buttons&1<<e.button&&(this.btnReleased|=1<<e.button),this.buttons&=~(1<<e.button)}),window.addEventListener("mousemove",e=>{this.locked&&(Math.abs(e.movementX)>600||Math.abs(e.movementY)>600||(this.mouseDX+=e.movementX,this.mouseDY+=e.movementY))}),window.addEventListener("wheel",e=>{this.locked&&(this.wheel+=Math.sign(e.deltaY))},{passive:!0}),t.addEventListener("contextmenu",e=>e.preventDefault()),document.addEventListener("pointerlockchange",()=>{this.locked=document.pointerLockElement===t,this.locked||(this.down.clear(),this.buttons=0),this.onLockChange?.(this.locked)})}requestLock(){let t=this.canvas.requestPointerLock();t&&typeof t.catch=="function"&&t.catch(()=>{})}isDown(t){return this.down.has(t)}wasPressed(t){return this.pressed.has(t)}wasReleased(t){return this.released.has(t)}mouseDown(t){return(this.buttons&1<<t)!==0}mousePressed(t){return(this.btnPressed&1<<t)!==0}mouseReleased(t){return(this.btnReleased&1<<t)!==0}simKey(t,e){e?(this.down.add(t),this.pressed.add(t)):(this.down.delete(t),this.released.add(t))}simButton(t,e){e?(this.buttons|=1<<t,this.btnPressed|=1<<t):(this.buttons&=~(1<<t),this.btnReleased|=1<<t)}endFrame(){this.pressed.clear(),this.released.clear(),this.mouseDX=0,this.mouseDY=0,this.wheel=0,this.btnPressed=0,this.btnReleased=0}};function mt(c,t,e,r){return t-=c.ox,e-=c.oy,r-=c.oz,t<0||e<0||r<0||t>=c.sx||e>=c.sy||r>=c.sz?c.outside:c.data[t+c.sx*(r+c.sz*e)]}var Gt=class{constructor(t=256){h(this,"n",0);h(this,"cap",0);h(this,"p",new Float64Array(0));h(this,"nrm",new Float64Array(0));h(this,"depth",new Float64Array(0));h(this,"sample",new Int32Array(0));h(this,"feat",new Int32Array(0));h(this,"mat",new Uint8Array(0));this.grow(t)}grow(t){let e=new Float64Array(t*3),r=new Float64Array(t*3),i=new Float64Array(t),n=new Int32Array(t),s=new Int32Array(t),a=new Uint8Array(t);e.set(this.p),r.set(this.nrm),i.set(this.depth),n.set(this.sample),s.set(this.feat),a.set(this.mat),this.p=e,this.nrm=r,this.depth=i,this.sample=n,this.feat=s,this.mat=a,this.cap=t}reset(){this.n=0}push(t,e,r,i,n,s,a,l,o,u){this.n>=this.cap&&this.grow(this.cap*2);let m=this.n++;this.p[m*3]=t,this.p[m*3+1]=e,this.p[m*3+2]=r,this.nrm[m*3]=i,this.nrm[m*3+1]=n,this.nrm[m*3+2]=s,this.depth[m]=a,this.sample[m]=l,this.feat[m]=o,this.mat[m]=u}};function Ve(c,t,e,r,i,n,s,a){let l=i+n,o=Math.floor(t-l),u=Math.floor(t+l),m=Math.floor(e-l),f=Math.floor(e+l),d=Math.floor(r-l),v=Math.floor(r+l),b=l*l,y=c.data,p=c.sx,x=c.sy,g=c.sz,M=c.ox,S=c.oy,w=c.oz,z=c.outside;for(let A=m;A<=f;A++){let R=A-S;for(let T=d;T<=v;T++){let P=T-w;for(let F=o;F<=u;F++){let U=F-M,D;if(U<0||R<0||P<0||U>=p||R>=x||P>=g?D=z:D=y[U+p*(P+g*R)],!D)continue;let I=t<F?-1:t>F+1?1:0,N=e<A?-1:e>A+1?1:0,q=r<T?-1:r>T+1?1:0;if(I!==0||N!==0||q!==0){if(I!==0&&mt(c,F+I,A,T)||N!==0&&mt(c,F,A+N,T)||q!==0&&mt(c,F,A,T+q))continue;let B=I<0?F:I>0?F+1:t,V=N<0?A:N>0?A+1:e,L=q<0?T:q>0?T+1:r,Z=t-B,X=e-V,Y=r-L,O=Z*Z+X*X+Y*Y;if(O>=b)continue;let tt=Math.sqrt(O),nt=tt>1e-9?1/tt:0;a.push(B,V,L,Z*nt,X*nt,Y*nt,i-tt,s,F*73856093^A*19349663^T*83492791,D)}else{let B=1e9,V=-1,L;if(mt(c,F+1,A,T)||(L=F+1-t,L<B&&(B=L,V=0)),mt(c,F-1,A,T)||(L=t-F,L<B&&(B=L,V=1)),mt(c,F,A+1,T)||(L=A+1-e,L<B&&(B=L,V=2)),mt(c,F,A-1,T)||(L=e-A,L<B&&(B=L,V=3)),mt(c,F,A,T+1)||(L=T+1-r,L<B&&(B=L,V=4)),mt(c,F,A,T-1)||(L=r-T,L<B&&(B=L,V=5)),V<0)continue;let Z=V===0?1:V===1?-1:0,X=V===2?1:V===3?-1:0,Y=V===4?1:V===5?-1:0;a.push(t+Z*B,e+X*B,r+Y*B,Z,X,Y,i+B,s,F*73856093^A*19349663^T*83492791^21845,D)}}}}}function Ie(c,t,e,r,i){if(i.length=0,e-t<=r){for(let a=t;a<e;a++)i.push(a);return}let s=[[],[],[],[],[],[]];for(let a=t;a<e;a++){let l=c.nrm[a*3],o=c.nrm[a*3+1],u=c.nrm[a*3+2],m=Math.abs(l),f=Math.abs(o),d=Math.abs(u),v=m>=f&&m>=d?l>0?0:1:f>=d?o>0?2:3:u>0?4:5;s[v].push(a)}for(let a of s){if(a.length===0)continue;if(a.length<=r){for(let w of a)i.push(w);continue}let l=a[0];for(let w of a)c.depth[w]>c.depth[l]&&(l=w);let o=c.p,u=l,m=-1;for(let w of a){let z=(o[w*3]-o[l*3])**2+(o[w*3+1]-o[l*3+1])**2+(o[w*3+2]-o[l*3+2])**2;z>m&&(m=z,u=w)}let f=l,d=-1,v=o[u*3]-o[l*3],b=o[u*3+1]-o[l*3+1],y=o[u*3+2]-o[l*3+2];for(let w of a){let z=o[w*3]-o[l*3],A=o[w*3+1]-o[l*3+1],R=o[w*3+2]-o[l*3+2],T=b*R-y*A,P=y*z-v*R,F=v*A-b*z,U=T*T+P*P+F*F;U>d&&(d=U,f=w)}let p=l,x=-1,g=(o[l*3]+o[u*3]+o[f*3])/3,M=(o[l*3+1]+o[u*3+1]+o[f*3+1])/3,S=(o[l*3+2]+o[u*3+2]+o[f*3+2])/3;for(let w of a){if(w===l||w===u||w===f)continue;let z=(o[w*3]-g)**2+(o[w*3+1]-M)**2+(o[w*3+2]-S)**2,A=Math.min(z,(o[w*3]-o[l*3])**2+(o[w*3+1]-o[l*3+1])**2+(o[w*3+2]-o[l*3+2])**2,(o[w*3]-o[u*3])**2+(o[w*3+1]-o[u*3+1])**2+(o[w*3+2]-o[u*3+2])**2,(o[w*3]-o[f*3])**2+(o[w*3+1]-o[f*3+1])**2+(o[w*3+2]-o[f*3+2])**2);A>x&&(x=A,p=w)}i.push(l),u!==l&&i.push(u),f!==l&&f!==u&&i.push(f),p!==l&&p!==u&&p!==f&&i.push(p)}}var Wt=class{constructor(){h(this,"dist",0);h(this,"x",0);h(this,"y",0);h(this,"z",0);h(this,"nx",0);h(this,"ny",0);h(this,"nz",0);h(this,"vx",0);h(this,"vy",0);h(this,"vz",0);h(this,"pal",0);h(this,"face",-1);h(this,"body",null)}};function pr(c,t,e,r,i,n,s,a,l){return ss((o,u,m)=>c.get(o,u,m),t*10,e*10,r*10,i,n,s,a*10,l,-1e9,-1e9,-1e9,1e9,1e9,1e9)?(l.dist/=10,l.x/=10,l.y/=10,l.z/=10,l.body=null,!0):!1}var pn=new Wt;function ss(c,t,e,r,i,n,s,a,l,o,u,m,f,d,v){let b=Math.floor(t),y=Math.floor(e),p=Math.floor(r),x=i>0?1:i<0?-1:0,g=n>0?1:n<0?-1:0,M=s>0?1:s<0?-1:0,S=x!==0?Math.abs(1/i):1/0,w=g!==0?Math.abs(1/n):1/0,z=M!==0?Math.abs(1/s):1/0,A=x>0?(b+1-t)*S:x<0?(t-b)*S:1/0,R=g>0?(y+1-e)*w:g<0?(e-y)*w:1/0,T=M>0?(p+1-r)*z:M<0?(r-p)*z:1/0,P=0,F=-1;for(let U=0;U<2e4;U++){if(b>=o&&y>=u&&p>=m&&b<f&&y<d&&p<v){let D=c(b,y,p);if(D)return l.dist=P,l.x=t+i*P,l.y=e+n*P,l.z=r+s*P,l.vx=b,l.vy=y,l.vz=p,l.pal=D,l.nx=F===0?-x:0,l.ny=F===1?-g:0,l.nz=F===2?-M:0,l.face=F,F<0&&(l.nx=-i,l.ny=-n,l.nz=-s),!0}if(A<R?A<T?(P=A,A+=S,b+=x,F=0):(P=T,T+=z,p+=M,F=2):R<T?(P=R,R+=w,y+=g,F=1):(P=T,T+=z,p+=M,F=2),P>a)return!1}return!1}var ns=10,is=.25,os=.004,as=1.6,vr=.09,yr=.14,cs=.45,xr=4,ye=class ye{constructor(){h(this,"n",0);h(this,"cap",0);h(this,"a",new Int32Array(0));h(this,"b",new Int32Array(0));h(this,"f",new Float64Array(0));h(this,"key",new Int32Array(0));h(this,"matB",new Uint8Array(0));this.grow(1024)}grow(t){let e=ye.S,r=new Int32Array(t),i=new Int32Array(t),n=new Float64Array(t*e),s=new Int32Array(t),a=new Uint8Array(t);r.set(this.a),i.set(this.b),n.set(this.f),s.set(this.key),a.set(this.matB),this.a=r,this.b=i,this.f=n,this.key=s,this.matB=a,this.cap=t}};h(ye,"S",32);var lt=ye,ce=0,le=1,ue=2,he=3,me=4,fe=5,gr=6,wr=7,Mr=8,Ar=9,Sr=10,Tr=11,Er=12,Fr=13,zr=14,Rr=15,Pr=16,Dr=17,Oe=18,kr=19,Cr=20,Ur=21,ct=22,vt=23,yt=24,Lr=25,de=26,_r=27,ve=class{constructor(t){this.world=t;h(this,"bodies",[]);h(this,"gravity",-9.81);h(this,"onImpact",null);h(this,"onRemove",null);h(this,"stats",{awake:0,contacts:0,pairs:0,ms:0});h(this,"cs",new lt);h(this,"raw",new Gt(512));h(this,"tmp",new Gt(128));h(this,"keep",[]);h(this,"cache",new Uint8Array(64*1024));h(this,"view",{data:this.cache,sx:0,sy:0,sz:0,ox:0,oy:0,oz:0,outside:0});h(this,"prevImpulse",new Map);h(this,"prevL",new Float64Array(0));h(this,"sortBuf",[]);h(this,"hit",new Wt);h(this,"bv",new Float64Array(0));h(this,"parent",new Int32Array(0))}add(t){t.updateDerived(),t.prevPos.copy(t.pos),t.prevRot.copy(t.rot),this.bodies.push(t)}remove(t){let e=this.bodies.indexOf(t);e>=0&&(this.bodies[e]=this.bodies[this.bodies.length-1],this.bodies.pop()),t.removed=!0}wakeBox(t,e,r,i,n,s){for(let a of this.bodies){if(!a.sleeping)continue;let l=a.aabb;l[0]>i||l[3]<t||l[1]>n||l[4]<e||l[2]>s||l[5]<r||a.wake()}}step(t){let e=performance.now(),r=this.bodies,i=r.length,n=0;for(let l=0;l<i;l++){let o=r[l];if(o.prevPos.copy(o.pos),o.prevRot.copy(o.rot),o.contacts=0,o.age++,o.damageCooldown>0&&(o.damageCooldown-=t),o.sleeping||o.kinematic)continue;n++,o.vel.y+=this.gravity*t;let u=1/(1+t*.04),m=1/(1+t*.12);o.vel.scale(u),o.ang.scale(m),o.updateDerived()}this.stats.awake=n,this.bv.length<i*16&&(this.bv=new Float64Array(i*32));let s=this.bv;for(let l=0;l<i;l++){let o=r[l],u=l*16;s[u]=o.vel.x,s[u+1]=o.vel.y,s[u+2]=o.vel.z,s[u+3]=o.ang.x,s[u+4]=o.ang.y,s[u+5]=o.ang.z;let m=!o.sleeping&&!o.kinematic;s[u+6]=m?o.invMass:0;for(let f=0;f<9;f++)s[u+7+f]=m?o.invIW[f]:0;o._idx=l}let a=this.cs;a.n=0;for(let l=0;l<i;l++){let o=r[l];o.sleeping||o.kinematic||this.collideWorld(o,l,t)}this.collideBodies(t),this.stats.contacts=a.n,this.prepare(t);for(let l=0;l<ns;l++)this.solveIteration();for(let l=0;l<i;l++){let o=r[l];if(o.sleeping||o.kinematic)continue;let u=l*16;o.vel.set(s[u],s[u+1],s[u+2]),o.ang.set(s[u+3],s[u+4],s[u+5])}this.storeWarmStart(),this.emitImpacts();for(let l=0;l<i;l++){let o=r[l];if(o.sleeping||o.kinematic)continue;let u=o.vel.len();u>70&&o.vel.scale(70/u);let m=o.ang.len();m>40&&o.ang.scale(40/m);let f=u*t;if(f>.12&&o.radius<1.5){let d=o.vel.x/u,v=o.vel.y/u,b=o.vel.z/u;if(pr(this.world,o.pos.x,o.pos.y,o.pos.z,d,v,b,f+o.radius*.3,this.hit)){let y=Math.max(0,this.hit.dist-o.radius*.3);if(y<f){o.pos.addScaled(o.vel,y/u);let p=o.vel.x*this.hit.nx+o.vel.y*this.hit.ny+o.vel.z*this.hit.nz;p<0&&(o.vel.x-=p*this.hit.nx*1.2,o.vel.y-=p*this.hit.ny*1.2,o.vel.z-=p*this.hit.nz*1.2),o.rot.integrate(o.ang.x,o.ang.y,o.ang.z,t),o.updateDerived();continue}}}o.pos.addScaled(o.vel,t),o.rot.integrate(o.ang.x,o.ang.y,o.ang.z,t),o.updateDerived(),o.pos.y<-30&&this.onRemove?.(o)}this.updateSleep(t),this.stats.ms=performance.now()-e}collideWorld(t,e,r){let i=t.aabb,n=t.vel.len()+t.ang.len()*t.radius,s=Math.min(2.5,Math.max(.15,n*r*10*1.2)),a=Math.ceil(t.sampleR+s)+2,l=Math.floor(i[0]*10)-a,o=Math.floor(i[1]*10)-a,u=Math.floor(i[2]*10)-a,m=Math.ceil(i[3]*10)+a,f=Math.ceil(i[4]*10)+a,d=Math.ceil(i[5]*10)+a,v=this.world,b=!1;for(let D=o>>4;D<=f>>4&&!b;D++)for(let I=u>>4;I<=d>>4&&!b;I++)for(let N=l>>4;N<=m>>4;N++)if(v.chunkMayBeSolid(N<<4,D<<4,I<<4)){b=!0;break}if(!b)return;let y=m-l+1,p=f-o+1,x=d-u+1,g=y*p*x;if(g>4e6)return;this.cache.length<g&&(this.cache=new Uint8Array(Math.max(g,this.cache.length*2))),v.copyBox(l,o,u,y,p,x,this.cache);let M=this.view;M.data=this.cache,M.sx=y,M.sy=p,M.sz=x,M.ox=l,M.oy=o,M.oz=u,M.outside=0;let S=this.raw;S.reset();let w=t.R,z=t.samples,A=t.com.x,R=t.com.y,T=t.com.z,P=t.pos.x*10,F=t.pos.y*10,U=t.pos.z*10;for(let D=0;D<t.nSamples;D++){let I=z[D*4]-A,N=z[D*4+1]-R,q=z[D*4+2]-T,B=P+w[0]*I+w[1]*N+w[2]*q,V=F+w[3]*I+w[4]*N+w[5]*q,L=U+w[6]*I+w[7]*N+w[8]*q;Ve(M,B,V,L,z[D*4+3],s,D,S)}if(S.n!==0){Ie(S,0,S.n,xr,this.keep);for(let D of this.keep)this.addContact(e,-1,S.p[D*3]*_,S.p[D*3+1]*_,S.p[D*3+2]*_,S.nrm[D*3],S.nrm[D*3+1],S.nrm[D*3+2],S.depth[D]*_,t.id*92821^S.sample[D]*6271^S.feat[D],S.mat[D],t.friction,t.restitution)}}collideBodies(t){let e=this.bodies,r=this.sortBuf;r.length=0;for(let n of e)(!n.kinematic||n.held)&&r.push(n);r.sort((n,s)=>n.aabb[0]-s.aabb[0]);let i=0;for(let n=0;n<r.length;n++){let s=r[n],a=s.aabb[3];for(let l=n+1;l<r.length;l++){let o=r[l];if(o.aabb[0]>a+.05)break;if((s.sleeping||s.kinematic)&&(o.sleeping||o.kinematic))continue;let u=s.aabb,m=o.aabb;u[1]>m[4]+.05||m[1]>u[4]+.05||u[2]>m[5]+.05||m[2]>u[5]+.05||(i++,this.collidePair(s,o,t))}}this.stats.pairs=i}collidePair(t,e,r){let i=Math.abs(t.vel.x-e.vel.x)+Math.abs(t.vel.y-e.vel.y)+Math.abs(t.vel.z-e.vel.z);t.sleeping&&i>.35&&this.wakeIsland(t),e.sleeping&&i>.35&&this.wakeIsland(e);let n=i+t.ang.len()*t.radius+e.ang.len()*e.radius,s=Math.min(2.5,Math.max(.15,n*r*10*1.2)),a=this.raw;if(a.reset(),this.samplesVsBody(t,e,s,a,1),this.samplesVsBody(e,t,s,a,-1),a.n===0)return;Ie(a,0,a.n,xr,this.keep);let l=t._idx,o=e._idx,u=Math.sqrt(t.friction*e.friction),m=Math.max(t.restitution,e.restitution);for(let f of this.keep)this.addContact(l,o,a.p[f*3],a.p[f*3+1],a.p[f*3+2],a.nrm[f*3],a.nrm[f*3+1],a.nrm[f*3+2],a.depth[f],t.id*92821^e.id*51787^a.sample[f]*6271^a.feat[f],a.mat[f],u,m)}samplesVsBody(t,e,r,i,n){let s=this.tmp;s.reset();let a={data:e.vox,sx:e.sx,sy:e.sy,sz:e.sz,ox:0,oy:0,oz:0,outside:0},l=t.R,o=e.R,u=t.samples,m=t.com.x,f=t.com.y,d=t.com.z,v=e.radius*10+2;for(let b=0;b<t.nSamples;b++){let y=(u[b*4]-m)*_,p=(u[b*4+1]-f)*_,x=(u[b*4+2]-d)*_,g=t.pos.x+l[0]*y+l[1]*p+l[2]*x,M=t.pos.y+l[3]*y+l[4]*p+l[5]*x,S=t.pos.z+l[6]*y+l[7]*p+l[8]*x,w=g-e.pos.x,z=M-e.pos.y,A=S-e.pos.z,R=(o[0]*w+o[3]*z+o[6]*A)*10+e.com.x,T=(o[1]*w+o[4]*z+o[7]*A)*10+e.com.y,P=(o[2]*w+o[5]*z+o[8]*A)*10+e.com.z,F=R-e.com.x,U=T-e.com.y,D=P-e.com.z;F*F+U*U+D*D>v*v||R<-2||T<-2||P<-2||R>e.sx+2||T>e.sy+2||P>e.sz+2||Ve(a,R,T,P,u[b*4+3],r,b,s)}for(let b=0;b<s.n;b++){let y=(s.p[b*3]-e.com.x)*_,p=(s.p[b*3+1]-e.com.y)*_,x=(s.p[b*3+2]-e.com.z)*_,g=e.pos.x+o[0]*y+o[1]*p+o[2]*x,M=e.pos.y+o[3]*y+o[4]*p+o[5]*x,S=e.pos.z+o[6]*y+o[7]*p+o[8]*x,w=s.nrm[b*3],z=s.nrm[b*3+1],A=s.nrm[b*3+2],R=(o[0]*w+o[1]*z+o[2]*A)*n,T=(o[3]*w+o[4]*z+o[5]*A)*n,P=(o[6]*w+o[7]*z+o[8]*A)*n;i.push(g,M,S,R,T,P,s.depth[b]*_,s.sample[b]+(n<0?1e5:0),s.feat[b],s.mat[b])}}addContact(t,e,r,i,n,s,a,l,o,u,m,f,d){let v=this.cs;v.n>=v.cap&&v.grow(v.cap*2);let b=v.n++;v.a[b]=t,v.b[b]=e,v.key[b]=u,v.matB[b]=m;let y=v.f,p=b*lt.S;y[p+ce]=r,y[p+le]=i,y[p+ue]=n,y[p+he]=s,y[p+me]=a,y[p+fe]=l,y[p+_r]=o;let x=e<0?Math.sqrt(f*Re[m]):f;y[p+Lr]=x,y[p+ct]=0,y[p+vt]=0,y[p+yt]=0,y[p+28]=e<0?Math.max(d,Pe[m])*.8:d}prepare(t){let e=this.cs,r=e.f,i=this.bv,n=this.bodies,s=this.prevImpulse,a=this.prevL;for(let l=0;l<e.n;l++){let o=l*lt.S,u=n[e.a[l]],m=e.a[l]*16,f=e.b[l],d=r[o+he],v=r[o+me],b=r[o+fe],y=r[o+ce]-u.pos.x,p=r[o+le]-u.pos.y,x=r[o+ue]-u.pos.z;r[o+gr]=y,r[o+wr]=p,r[o+Mr]=x;let g=0,M=0,S=0,w=-1;if(f>=0){let V=n[f];g=r[o+ce]-V.pos.x,M=r[o+le]-V.pos.y,S=r[o+ue]-V.pos.z,w=f*16}r[o+Ar]=g,r[o+Sr]=M,r[o+Tr]=S;let z,A,R;Math.abs(d)>.57?(z=v,A=-d,R=0):(z=0,A=b,R=-v);let T=1/Math.hypot(z,A,R);z*=T,A*=T,R*=T;let P=v*R-b*A,F=b*z-d*R,U=d*A-v*z;r[o+Er]=z,r[o+Fr]=A,r[o+zr]=R,r[o+Rr]=P,r[o+Pr]=F,r[o+Dr]=U,r[o+Oe]=Ge(i,m,w,y,p,x,g,M,S,d,v,b),r[o+kr]=Ge(i,m,w,y,p,x,g,M,S,z,A,R),r[o+Cr]=Ge(i,m,w,y,p,x,g,M,S,P,F,U);let D=be(i,m,w,y,p,x,g,M,S,d,v,b);r[o+de]=D;let I=r[o+_r],N;I>0?N=Math.min(is*Math.max(I-os,0)/t,as):N=I/t;let q=r[o+28];D<-1.2&&q>0&&(N=Math.max(N,-q*D)),r[o+Ur]=N;let B=s.get(e.key[l]);if(B!==void 0){r[o+ct]=a[B*3]*.85,r[o+vt]=a[B*3+1]*.85,r[o+yt]=a[B*3+2]*.85;let L=d*r[o+ct]+z*r[o+vt]+P*r[o+yt],Z=v*r[o+ct]+A*r[o+vt]+F*r[o+yt],X=b*r[o+ct]+R*r[o+vt]+U*r[o+yt];pe(i,m,w,y,p,x,g,M,S,L,Z,X)}u.contacts++,f>=0&&n[f].contacts++}}solveIteration(){let t=this.cs,e=t.f,r=this.bv;for(let i=0;i<t.n;i++){let n=i*lt.S,s=t.a[i]*16,a=t.b[i]>=0?t.b[i]*16:-1,l=e[n+gr],o=e[n+wr],u=e[n+Mr],m=e[n+Ar],f=e[n+Sr],d=e[n+Tr],v=e[n+Lr]*e[n+ct];{let w=e[n+Er],z=e[n+Fr],A=e[n+zr],T=-be(r,s,a,l,o,u,m,f,d,w,z,A)*e[n+kr],P=e[n+vt],F=P+T;F>v?F=v:F<-v&&(F=-v),T=F-P,e[n+vt]=F,T!==0&&pe(r,s,a,l,o,u,m,f,d,w*T,z*T,A*T)}{let w=e[n+Rr],z=e[n+Pr],A=e[n+Dr],T=-be(r,s,a,l,o,u,m,f,d,w,z,A)*e[n+Cr],P=e[n+yt],F=P+T;F>v?F=v:F<-v&&(F=-v),T=F-P,e[n+yt]=F,T!==0&&pe(r,s,a,l,o,u,m,f,d,w*T,z*T,A*T)}let b=e[n+he],y=e[n+me],p=e[n+fe],x=be(r,s,a,l,o,u,m,f,d,b,y,p),g=(e[n+Ur]-x)*e[n+Oe],M=e[n+ct],S=M+g;S<0&&(S=0),g=S-M,e[n+ct]=S,g!==0&&pe(r,s,a,l,o,u,m,f,d,b*g,y*g,p*g)}}storeWarmStart(){let t=this.cs,e=t.f;this.prevImpulse.clear(),this.prevL.length<t.n*3&&(this.prevL=new Float64Array(t.n*6));for(let r=0;r<t.n;r++){let i=r*lt.S;this.prevImpulse.set(t.key[r],r),this.prevL[r*3]=e[i+ct],this.prevL[r*3+1]=e[i+vt],this.prevL[r*3+2]=e[i+yt]}}emitImpacts(){if(!this.onImpact)return;let t=this.cs,e=t.f,r=this.bodies,i=new Map;for(let n=0;n<t.n;n++){let s=n*lt.S,a=e[s+de];if(a>-2||e[s+ct]<=0)continue;let l=t.a[n],o=i.get(l);(o===void 0||e[o*lt.S+de]>a)&&i.set(l,n)}for(let[,n]of i){let s=n*lt.S,a=r[t.a[n]],l=t.b[n]>=0?r[t.b[n]]:null;this.onImpact({a,b:l,x:e[s+ce],y:e[s+le],z:e[s+ue],nx:e[s+he],ny:e[s+me],nz:e[s+fe],speed:-e[s+de],meff:e[s+Oe],matB:t.matB[n]})}}find(t){let e=this.parent;for(;e[t]!==t;)e[t]=e[e[t]],t=e[t];return t}updateSleep(t){let e=this.bodies,r=e.length;this.parent.length<r&&(this.parent=new Int32Array(r*2));let i=this.parent;for(let a=0;a<r;a++)i[a]=a;let n=this.cs;for(let a=0;a<n.n;a++){let l=n.b[a];if(l<0)continue;let o=e[n.a[a]],u=e[l];if(o.sleeping||u.sleeping||o.kinematic||u.kinematic)continue;let m=this.find(n.a[a]),f=this.find(l);m!==f&&(i[m]=f)}let s=new Map;for(let a=0;a<r;a++){let l=e[a];if(l.sleeping||l.kinematic)continue;l.vel.lenSq()<vr*vr&&l.ang.lenSq()<yr*yr?l.sleepTime+=t:l.sleepTime=0;let u=this.find(a),m=s.get(u);s.set(u,m===void 0?l.sleepTime:Math.min(m,l.sleepTime))}for(let a=0;a<r;a++){let l=e[a];if(l.sleeping||l.kinematic)continue;s.get(this.find(a))>cs&&(l.sleeping=!0,l.vel.set(0,0,0),l.ang.set(0,0,0))}}wakeIsland(t){t.wake();let e=t.aabb;for(let r of this.bodies){if(!r.sleeping)continue;let i=r.aabb;e[0]>i[3]+.05||i[0]>e[3]+.05||e[1]>i[4]+.05||i[1]>e[4]+.05||e[2]>i[5]+.05||i[2]>e[5]+.05||r.wake()}}};function Ge(c,t,e,r,i,n,s,a,l,o,u,m){let f=c[t+6],d=i*m-n*u,v=n*o-r*m,b=r*u-i*o,y=c[t+7]*d+c[t+8]*v+c[t+9]*b,p=c[t+10]*d+c[t+11]*v+c[t+12]*b,x=c[t+13]*d+c[t+14]*v+c[t+15]*b;return f+=d*y+v*p+b*x,e>=0&&(f+=c[e+6],d=a*m-l*u,v=l*o-s*m,b=s*u-a*o,y=c[e+7]*d+c[e+8]*v+c[e+9]*b,p=c[e+10]*d+c[e+11]*v+c[e+12]*b,x=c[e+13]*d+c[e+14]*v+c[e+15]*b,f+=d*y+v*p+b*x),f>1e-12?1/f:0}function be(c,t,e,r,i,n,s,a,l,o,u,m){let f=c[t]+c[t+4]*n-c[t+5]*i,d=c[t+1]+c[t+5]*r-c[t+3]*n,v=c[t+2]+c[t+3]*i-c[t+4]*r;return e>=0&&(f-=c[e]+c[e+4]*l-c[e+5]*a,d-=c[e+1]+c[e+5]*s-c[e+3]*l,v-=c[e+2]+c[e+3]*a-c[e+4]*s),f*o+d*u+v*m}function pe(c,t,e,r,i,n,s,a,l,o,u,m){let f=c[t+6];if(f>0){c[t]+=o*f,c[t+1]+=u*f,c[t+2]+=m*f;let d=i*m-n*u,v=n*o-r*m,b=r*u-i*o;c[t+3]+=c[t+7]*d+c[t+8]*v+c[t+9]*b,c[t+4]+=c[t+10]*d+c[t+11]*v+c[t+12]*b,c[t+5]+=c[t+13]*d+c[t+14]*v+c[t+15]*b}if(e>=0){let d=c[e+6];if(d>0){c[e]-=o*d,c[e+1]-=u*d,c[e+2]-=m*d;let v=a*m-l*u,b=l*o-s*m,y=s*u-a*o;c[e+3]-=c[e+7]*v+c[e+8]*b+c[e+9]*y,c[e+4]-=c[e+10]*v+c[e+11]*b+c[e+12]*y,c[e+5]-=c[e+13]*v+c[e+14]*b+c[e+15]*y}}}var ls=1,xe=class{constructor(t,e,r,i){h(this,"id",ls++);h(this,"sx");h(this,"sy");h(this,"sz");h(this,"vox");h(this,"count",0);h(this,"mass",0);h(this,"invMass",0);h(this,"com",new ot);h(this,"invIL",new Float64Array(9));h(this,"invIW",new Float64Array(9));h(this,"R",new Float64Array(9));h(this,"pos",new ot);h(this,"rot",new wt);h(this,"vel",new ot);h(this,"ang",new ot);h(this,"prevPos",new ot);h(this,"prevRot",new wt);h(this,"samples",new Float32Array(0));h(this,"nSamples",0);h(this,"sampleR",.5);h(this,"radius",0);h(this,"aabb",new Float64Array(6));h(this,"sleeping",!1);h(this,"sleepTime",0);h(this,"island",0);h(this,"age",0);h(this,"slot",-1);h(this,"meshStart",-1);h(this,"meshAlloc",0);h(this,"nOp",0);h(this,"nTr",0);h(this,"meshDirty",!0);h(this,"explosive",0);h(this,"kinematic",!1);h(this,"damageCooldown",0);h(this,"dirtyShape",!1);h(this,"removed",!1);h(this,"tag",0);h(this,"friction",.6);h(this,"restitution",.1);h(this,"contacts",0);h(this,"lastImpactSound",0);h(this,"held",!1);this.sx=t,this.sy=e,this.sz=r,this.vox=i}idx(t,e,r){return t+this.sx*(r+this.sz*e)}get(t,e,r){return t<0||e<0||r<0||t>=this.sx||e>=this.sy||r>=this.sz?0:this.vox[t+this.sx*(r+this.sz*e)]}computeMass(){let{sx:t,sy:e,sz:r,vox:i}=this,n=0,s=0,a=0,l=0,o=0,u=0,m=0,f=0;for(let w=0;w<e;w++)for(let z=0;z<r;z++){let A=t*(z+r*w);for(let R=0;R<t;R++,A++){let T=i[A];if(!T)continue;let P=Qt[T];n+=P,s+=P*(R+.5),a+=P*(w+.5),l+=P*(z+.5),o++,ze[T]===16&&u++}}if(this.count=o,this.explosive=u,o===0||n<=0)return this.mass=0,this.invMass=0,!1;s/=n,a/=n,l/=n,this.com.set(s,a,l);let d=0,v=0,b=0,y=0,p=0,x=0,g=_*_;for(let w=0;w<e;w++)for(let z=0;z<r;z++){let A=t*(z+r*w);for(let R=0;R<t;R++,A++){let T=i[A];if(!T)continue;let P=Qt[T],F=(R+.5-s)*_,U=(w+.5-a)*_,D=(z+.5-l)*_;d+=P*(U*U+D*D),v+=P*(F*F+D*D),b+=P*(F*F+U*U),y-=P*F*U,p-=P*F*D,x-=P*U*D}}let M=n*g/6;d+=M,v+=M,b+=M;let S=n*g*.25;return d=Math.max(d,S),v=Math.max(v,S),b=Math.max(b,S),us(this.invIL,d,y,p,y,v,x,p,x,b),this.mass=n,this.invMass=1/n,!0}buildSamples(){let{sx:t,sy:e,sz:r,vox:i}=this,n=this.count>6e4?4:this.count>2500?2:1,s=[],a=(o,u,m)=>!this.get(o-1,u,m)||!this.get(o+1,u,m)||!this.get(o,u-1,m)||!this.get(o,u+1,m)||!this.get(o,u,m-1)||!this.get(o,u,m+1);if(n===1)for(let o=0;o<e;o++)for(let u=0;u<r;u++)for(let m=0;m<t;m++)!i[m+t*(u+r*o)]||!a(m,o,u)||s.push(m+.5,o+.5,u+.5,.5);else for(let o=0;o<e;o+=n)for(let u=0;u<r;u+=n)for(let m=0;m<t;m+=n){let f=0,d=0,v=0,b=0,y=!1;for(let p=o;p<Math.min(e,o+n);p++)for(let x=u;x<Math.min(r,u+n);x++)for(let g=m;g<Math.min(t,m+n);g++)i[g+t*(x+r*p)]&&(f++,d+=g+.5,v+=p+.5,b+=x+.5,!y&&a(g,p,x)&&(y=!0));f===0||!y||s.push(d/f,v/f,b/f,n*.5)}if(this.count<=400)for(let o=0;o<=e;o++)for(let u=0;u<=r;u++)for(let m=0;m<=t;m++){let f=0;for(let d=0;d<8;d++)this.get(m-1+(d&1),o-1+(d>>1&1),u-1+(d>>2))&&f++;f===0||f===8||f>2||s.push(m,o,u,.06)}this.samples=new Float32Array(s),this.nSamples=s.length/4,this.sampleR=n*.5;let l=0;for(let o=0;o<s.length;o+=4){let u=s[o]-this.com.x,m=s[o+1]-this.com.y,f=s[o+2]-this.com.z,d=u*u+m*m+f*f;d>l&&(l=d)}this.radius=(Math.sqrt(l)+this.sampleR+.9)*_}updateDerived(){this.rot.toMat3(this.R);let t=this.R,e=this.invIL,r=this.invIW,i=[0,0,0,0,0,0,0,0,0];for(let x=0;x<3;x++)for(let g=0;g<3;g++)i[x*3+g]=t[x*3]*e[g]+t[x*3+1]*e[3+g]+t[x*3+2]*e[6+g];for(let x=0;x<3;x++)for(let g=0;g<3;g++)r[x*3+g]=i[x*3]*t[g*3]+i[x*3+1]*t[g*3+1]+i[x*3+2]*t[g*3+2];let n=this.sx*.5*_,s=this.sy*.5*_,a=this.sz*.5*_,l=(this.sx*.5-this.com.x)*_,o=(this.sy*.5-this.com.y)*_,u=(this.sz*.5-this.com.z)*_,m=this.pos.x+t[0]*l+t[1]*o+t[2]*u,f=this.pos.y+t[3]*l+t[4]*o+t[5]*u,d=this.pos.z+t[6]*l+t[7]*o+t[8]*u,v=Math.abs(t[0])*n+Math.abs(t[1])*s+Math.abs(t[2])*a,b=Math.abs(t[3])*n+Math.abs(t[4])*s+Math.abs(t[5])*a,y=Math.abs(t[6])*n+Math.abs(t[7])*s+Math.abs(t[8])*a,p=this.aabb;p[0]=m-v,p[1]=f-b,p[2]=d-y,p[3]=m+v,p[4]=f+b,p[5]=d+y}gridToWorld(t,e,r,i){let n=this.R,s=(t-this.com.x)*_,a=(e-this.com.y)*_,l=(r-this.com.z)*_;return i.x=this.pos.x+n[0]*s+n[1]*a+n[2]*l,i.y=this.pos.y+n[3]*s+n[4]*a+n[5]*l,i.z=this.pos.z+n[6]*s+n[7]*a+n[8]*l,i}worldToGrid(t,e,r,i){let n=this.R,s=t-this.pos.x,a=e-this.pos.y,l=r-this.pos.z;return i.x=(n[0]*s+n[3]*a+n[6]*l)*10+this.com.x,i.y=(n[1]*s+n[4]*a+n[7]*l)*10+this.com.y,i.z=(n[2]*s+n[5]*a+n[8]*l)*10+this.com.z,i}pointVel(t,e,r,i){let n=t-this.pos.x,s=e-this.pos.y,a=r-this.pos.z;return i.x=this.vel.x+this.ang.y*a-this.ang.z*s,i.y=this.vel.y+this.ang.z*n-this.ang.x*a,i.z=this.vel.z+this.ang.x*s-this.ang.y*n,i}applyImpulse(t,e,r,i,n,s){if(this.invMass===0)return;this.vel.x+=t*this.invMass,this.vel.y+=e*this.invMass,this.vel.z+=r*this.invMass;let a=i-this.pos.x,l=n-this.pos.y,o=s-this.pos.z,u=l*r-o*e,m=o*t-a*r,f=a*e-l*t,d=this.invIW;this.ang.x+=d[0]*u+d[1]*m+d[2]*f,this.ang.y+=d[3]*u+d[4]*m+d[5]*f,this.ang.z+=d[6]*u+d[7]*m+d[8]*f}modelRows(t,e,r){let i=[0,0,0,0,0,0,0,0,0];r.toMat3(i);let n=_,s=this.com.x,a=this.com.y,l=this.com.z;for(let o=0;o<3;o++){let u=i[o*3]*n,m=i[o*3+1]*n,f=i[o*3+2]*n;t[o*4]=u,t[o*4+1]=m,t[o*4+2]=f,t[o*4+3]=(o===0?e.x:o===1?e.y:e.z)-(u*s+m*a+f*l)}}wake(){this.sleeping=!1,this.sleepTime=0}};function us(c,t,e,r,i,n,s,a,l,o){let u=n*o-s*l,m=-(i*o-s*a),f=i*l-n*a,d=t*u+e*m+r*f,v=d!==0?1/d:0;c[0]=u*v,c[1]=-(e*o-r*l)*v,c[2]=(e*s-r*n)*v,c[3]=m*v,c[4]=(t*o-r*a)*v,c[5]=-(t*s-r*i)*v,c[6]=f*v,c[7]=-(t*l-e*a)*v,c[8]=(t*n-e*i)*v}var At=new pt(4096),zt=new pt(256),We=new Uint8Array(0),Ht=new Uint32Array(0),Xt=new Float32Array(12),He=new Float32Array(12),jt=new ot,Br=new wt,ge=class{constructor(t){this.renderer=t;h(this,"draws",[]);h(this,"drawPool",[])}build(t){let e=this.renderer;if(t.slot<0&&(t.slot=e.allocSlot(),t.slot<0))return;let r=(t.sx+2)*(t.sy+2)*(t.sz+2);We.length<r&&(We=new Uint8Array(r*2));let i=fr(t.vox,t.sx,t.sy,t.sz,We);At.reset(),zt.reset(),se(i,t.sx,t.sy,t.sz,bt,0,0,0,t.slot,At,zt);let n=At.count+zt.count;t.meshStart>=0&&(et.roundSize(n)>et.roundSize(t.meshAlloc)||n===0)&&(e.pool.free(t.meshStart,t.meshAlloc),t.meshStart=-1,t.meshAlloc=0),n>0&&(t.meshStart<0&&(t.meshStart=e.pool.alloc(n),t.meshAlloc=n),Ht.length<n*4&&(Ht=new Uint32Array(n*8)),Ht.set(At.data.subarray(0,At.count*4),0),Ht.set(zt.data.subarray(0,zt.count*4),At.count*4),e.pool.upload(t.meshStart,Ht,n)),t.nOp=At.count,t.nTr=zt.count,t.meshDirty=!1}release(t){let e=this.renderer;t.meshStart>=0&&(e.pool.free(t.meshStart,t.meshAlloc),t.meshStart=-1,t.meshAlloc=0),t.slot>=0&&(e.freeSlot(t.slot),t.slot=-1)}update(t,e){let r=this.renderer;for(let i of this.draws)this.drawPool.push(i);this.draws.length=0;for(let i of t){if(i.meshDirty&&this.build(i),i.slot<0||i.nOp+i.nTr===0)continue;let n=i._lastRows;jt.copy(i.prevPos).lerp(i.pos,e),Br.copy(i.prevRot).slerp(i.rot,e),i.modelRows(Xt,jt,Br),n?He.set(n):He.set(Xt),r.setXform(i.slot,Xt,He),n?n.set(Xt):i._lastRows=new Float32Array(Xt);let s=this.drawPool.pop()??{slot:0,start:0,nOp:0,nTr:0,x:0,y:0,z:0,r:0};s.slot=i.slot,s.start=i.meshStart,s.nOp=i.nOp,s.nTr=i.nTr,s.x=jt.x,s.y=jt.y,s.z=jt.z,s.r=i.radius,this.draws.push(s)}}};var hs={sunDir:ms([-.45,.52,-.33]),sunColor:[3,2.55,2.1],skyZenith:[.22,.38,.72],skyHorizon:[.72,.78,.86],groundColor:[.28,.25,.21],fogColor:[.62,.67,.74],fogDensity:.0035,fogHeight:.03,ambient:.85,exposure:1};function ms(c){let t=Math.hypot(c[0],c[1],c[2]);return[c[0]/t,c[1]/t,c[2]/t]}async function fs(){let c=document.getElementById("c"),t=new Jt(c),e=new re(1024,384,1024,40),r=performance.now();br(e),console.log("map generated in",(performance.now()-r).toFixed(0),"ms"),e.markBoxDirty(0,0,0,e.sx-1,e.sy-1,e.sz-1);let i=Math.max(1,Math.min(6,(navigator.hardwareConcurrency||4)-1)),n=new ne(e,t.pool,i),s=new oe;s.x=25,s.y=9,s.z=48,s.yaw=.6,s.pitch=-.15;let a=new URLSearchParams(location.search);if(a.has("cam")){let[p,x,g,M,S]=a.get("cam").split(",").map(Number);s.x=p,s.y=x,s.z=g,s.yaw=M,s.pitch=S}let l=new ve(e),o=new ge(t),u=new Ft(7),m=()=>{for(let p=0;p<40;p++){let x=u.int(2,12),g=u.int(2,10),M=u.int(2,12),S=new Uint8Array(x*g*M).fill(u.pick([E.crate,E.concrete,E.brick,E.steel,E.plank,E.paintRed])),w=new xe(x,g,M,S);w.computeMass(),w.buildSamples(),w.pos.set(28+u.range(-3,3),6+p*.8,40+u.range(-3,3)),w.rot.setAxisAngle(.3,.8,.5,u.range(0,3)).normalize(),w.ang.set(u.range(-2,2),u.range(-2,2),u.range(-2,2)),l.add(w)}};a.has("phys")&&m();let f=0,d=new ae(c);c.addEventListener("click",()=>d.requestLock());let v=performance.now(),b=window;b.__game={world:e,meshes:n,renderer:t,cam:s,ready:!1,frames:0,physics:l,extraStats:()=>({phys:l.stats,bodies:l.bodies.length,sleeping:l.bodies.filter(p=>p.sleeping).length,ys:l.bodies.slice(0,8).map(p=>+p.pos.y.toFixed(2))})};function y(){let p=performance.now(),x=Math.min(.05,(p-v)/1e3);v=p,s.yaw-=d.mouseDX*d.sensitivity,s.pitch=Math.max(-1.5,Math.min(1.5,s.pitch-d.mouseDY*d.sensitivity));let g=(d.isDown("ShiftLeft")?30:8)*x,M=-Math.sin(s.yaw),S=-Math.cos(s.yaw);if(d.isDown("KeyW")&&(s.x+=M*g,s.z+=S*g),d.isDown("KeyS")&&(s.x-=M*g,s.z-=S*g),d.isDown("KeyA")&&(s.x+=S*g,s.z-=M*g),d.isDown("KeyD")&&(s.x-=S*g,s.z+=M*g),d.isDown("Space")&&(s.y+=g),d.isDown("KeyC")&&(s.y-=g),d.wasPressed("KeyP")&&m(),b.__game.ready||a.has("physnow")){f+=x;let w=0;for(;f>=1/60&&w<3;)l.step(1/60),f-=1/60,w++;w===3&&(f=0)}if(o.update(l.bodies,Math.min(1,f*60)),n.update(s.x,s.y,s.z),!b.__game.ready&&n.pending>0&&b.__game.frames>2){b.__game.frames++,d.endFrame(),requestAnimationFrame(y);return}s.update(c.clientWidth/Math.max(1,c.clientHeight)),t.render(s,hs,[],n,o.draws,x),d.endFrame(),b.__game.frames++,n.pending===0&&(b.__game.ready=!0),requestAnimationFrame(y)}requestAnimationFrame(y)}fs().catch(c=>{console.error(c),document.getElementById("hud").innerHTML=`<pre style="color:#f88;padding:20px;white-space:pre-wrap">${String(c&&c.stack||c)}</pre>`});})();
