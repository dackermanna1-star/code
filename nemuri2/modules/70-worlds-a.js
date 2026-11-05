/* =============================================================================
   nemuri II — WORLDS A (module 70): twelve hand-built "vast & sublime" dreams.
   Each world is authored individually. They share a small kit (below) that
   the original lacked: merged vertex-coloured geometry with baked faceted
   light (one draw call for hundreds of shapes), shader-driven motion (bob,
   sway, flow, twinkle) on a clock that stops with the dream's stillness,
   gradient sky domes with a sun, soft point clouds, and analytic multi-level
   ground (stairs, helices, ramps) that respects the engine's step clamp.
   ============================================================================= */
var WA = N2.mods.worldsA = { names: [], kit: {} };
var MINE = {};
var TAU = Math.PI * 2;

/* ------------------------------------------------------------- dream clock */
// advances only while the dream plays and is not frozen (stillness / pause)
var UT = { value: 0 };
N2.on("play", function (dt) { try { if (!freezeBeings) UT.value += dt; } catch (e) {} });
function T() { return UT.value; }

/* ----------------------------------------------------------------- shaders */
var VC_VERT = [
  "attribute vec3 aCol;", "varying vec3 vCol;", "varying float vDist;",
  "uniform vec2 uGrid;",
  "#ifdef MOTION",
  "attribute vec4 aMot; attribute float aFx; varying float vEdge;",
  "uniform float uT; uniform vec4 uFlow; uniform vec3 uRate;",
  "#endif",
  "#ifdef MAP",
  "varying vec2 vUvA; varying float vWA;",
  "#endif",
  "void main() {",
  "  vec3 p = position; vCol = aCol;",
  "#ifdef MOTION",
  "  float ph = aMot.x; vEdge = 1.0;",
  "  if (uFlow.w > 0.0 && aMot.y > 0.0) { float k = fract(ph + uT * uRate.x / uFlow.w); p += uFlow.xyz * (k * uFlow.w) * aMot.y; vEdge = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.92, 1.0, k)); }",
  "  if (aMot.z != 0.0) p.y += sin(uT * uRate.y + ph * 6.2831) * aMot.z;",
  "  if (aMot.w != 0.0) { p.x += sin(uT * uRate.y * 0.71 + ph * 11.0) * aMot.w; p.z += cos(uT * uRate.y * 0.53 + ph * 7.0) * aMot.w; }",
  "  if (aFx > 0.0) vCol *= 1.0 - aFx * (0.5 + 0.5 * sin(uT * uRate.z + ph * 40.0));",
  "  else if (aFx < 0.0) vCol *= mix(1.0, 0.12, step(fract(uT * uRate.z * 0.02 + ph * 3.7), -aFx));",
  "#endif",
  "  vec4 mv = modelViewMatrix * vec4(p, 1.0); vDist = -mv.z;",
  "  vec4 clip = projectionMatrix * mv;",
  "  if (abs(clip.w) < 0.002) clip.w = 0.002;",   // a vertex exactly in the eye's plane makes the rasteriser drop its triangle
  "  if (clip.w > 0.05) { vec2 nd = clip.xy / clip.w; nd = floor(nd * uGrid + 0.5) / uGrid; clip.xy = nd * clip.w; }",   // snap (only in front of the eye: no NaN at w = 0)
  "  gl_Position = clip;",
  "#ifdef MAP",
  "  vUvA = uv * clip.w; vWA = clip.w;",
  "#endif",
  "}"].join("\n");
var VC_FRAG = [
  "varying vec3 vCol;", "varying float vDist;",
  "uniform vec3 uFog;", "uniform vec2 uFogDist;", "uniform float uBright;", "uniform float uOpacity;",
  "#ifdef MOTION",
  "varying float vEdge;",
  "#endif",
  "#ifdef MAP",
  "varying vec2 vUvA; varying float vWA; uniform sampler2D uMap; uniform vec2 uScroll; uniform float uT;",
  "#endif",
  "void main() {",
  "  vec3 col = vCol * uBright; float a = uOpacity;",
  "#ifdef MAP",
  "  vec4 t = texture2D(uMap, vUvA / vWA + uScroll * uT); col *= t.rgb; a *= t.a;",
  "  if (a < 0.04) discard;",
  "#endif",
  "#ifdef NOFOG",
  "  float f = 0.0;",
  "#else",
  "  float f = clamp((vDist - uFogDist.x) / max(0.001, uFogDist.y - uFogDist.x), 0.0, 1.0);",
  "#endif",
  "#ifdef MOTION",
  "  float e = vEdge;",
  "#else",
  "  float e = 1.0;",
  "#endif",
  "#ifdef ADD",
  "  gl_FragColor = vec4(col * (1.0 - f) * e * a, 1.0);",
  "#else",
  "  gl_FragColor = vec4(mix(col, uFog, max(f, 1.0 - e)), a);",
  "#endif",
  "}"].join("\n");
var PT_VERT = [
  "attribute vec3 aCol;", "attribute vec4 aMot;", "attribute float aSize;", "attribute float aFx;",
  "uniform float uT;", "uniform vec4 uFlow;", "uniform vec3 uRate;", "uniform vec2 uFogDist;", "uniform float uScale;",
  "varying vec3 vCol;", "varying float vA;", "varying float vSz;",
  "void main() {",
  "  vec3 p = position; float ph = aMot.x; float edge = 1.0;",
  "  if (uFlow.w > 0.0 && aMot.y > 0.0) { float k = fract(ph + uT * uRate.x / uFlow.w); p += uFlow.xyz * (k * uFlow.w) * aMot.y; edge = smoothstep(0.0, 0.1, k) * (1.0 - smoothstep(0.9, 1.0, k)); }",
  "  p.y += sin(uT * uRate.y + ph * 6.2831) * aMot.z;",
  "  p.x += sin(uT * uRate.y * 0.71 + ph * 11.0) * aMot.w; p.z += cos(uT * uRate.y * 0.53 + ph * 7.0) * aMot.w;",
  "  float tw = 1.0; if (aFx > 0.0) tw = 1.0 - aFx * (0.5 + 0.5 * sin(uT * uRate.z + ph * 40.0));",
  "  else if (aFx < 0.0) tw = mix(1.0, 0.0, step(fract(uT * uRate.z * 0.02 + ph * 3.7), -aFx));",
  "  vec4 mv = modelViewMatrix * vec4(p, 1.0); float d = -mv.z;",
  "#ifdef NOFOG",
  "  float f = 0.0;",
  "#else",
  "  float f = clamp((d - uFogDist.x) / max(0.001, uFogDist.y - uFogDist.x), 0.0, 1.0);",
  "#endif",
  "  vA = (1.0 - f * f) * edge * tw; vCol = aCol;",
  "  float s = aSize * uScale / max(0.2, d); vSz = s;",
  "  gl_PointSize = clamp(s, 1.0, 40.0);",
  "  gl_Position = projectionMatrix * mv;",
  "}"].join("\n");
var PT_FRAG = [
  "varying vec3 vCol;", "varying float vA;", "varying float vSz;", "uniform float uBright;",
  "void main() {",
  "  vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0;",
  "  float a = vSz < 2.5 ? 1.0 : (1.0 - smoothstep(0.15, 1.0, r));",
  "  a *= vA; if (a < 0.01) discard;",
  "  gl_FragColor = vec4(vCol * a * uBright, 1.0);",
  "}"].join("\n");
// the sky is shaded per vertex and drawn last at the far plane, so only the
// pixels nothing else covers pay for it
var SKY_VERT = [
  "uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec4 uStops;",
  "uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec2 uSun; uniform float uDim;",
  "varying vec3 vC;",
  "void main() {",
  "  vec3 dir = normalize(position); float y = dir.y;",
  "  vec3 c = uC0;",
  "  c = mix(c, uC1, smoothstep(uStops.x, uStops.y, y));",
  "  c = mix(c, uC2, smoothstep(uStops.y, uStops.z, y));",
  "  c = mix(c, uC3, smoothstep(uStops.z, uStops.w, y));",
  "  float sd = max(dot(dir, uSunDir), 0.0);",
  "  c += uSunCol * pow(sd, uSun.y) * 0.6;",
  "  vC = c * uDim;",
  "  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
  "  gl_Position = vec4(p.xy, p.w * 0.99995, p.w);",
  "}"].join("\n");
var SKY_FRAG = [
  "varying vec3 vC;",
  "void main() { float n = fract(dot(floor(gl_FragCoord.xy), vec2(0.375, 0.6875))); gl_FragColor = vec4(vC + (n - 0.5) / 110.0, 1.0); }"].join("\n");

/* --------------------------------------------------------------- materials */
function vcMat(o) {
  o = o || {};
  var fl = o.flow || null;
  var u = {
    uMap: { value: o.map || null },
    uOpacity: { value: o.opacity != null ? o.opacity : 1 }, uBright: { value: o.bright != null ? o.bright : 1 },
    uScroll: { value: o.scroll || new THREE.Vector2(0, 0) },
    uFlow: { value: fl ? new THREE.Vector4(fl[0], fl[1], fl[2], fl[3]) : new THREE.Vector4(0, 0, 0, 0) },
    uRate: { value: new THREE.Vector3(o.flowSpeed || 1, o.bobSpeed || 0.6, o.twSpeed || 2) },
    uT: UT, uFog: U_fog, uFogDist: U_fogDist, uGrid: U_grid
  };
  var add = !!o.add, defs = {};
  if (add) defs.ADD = 1; if (o.map) defs.MAP = 1; if (o.nofog) defs.NOFOG = 1; if (o.motion || o.flow) defs.MOTION = 1;
  var m = new THREE.ShaderMaterial({
    vertexShader: VC_VERT, fragmentShader: VC_FRAG, uniforms: u, defines: defs,
    transparent: add || !!o.transparent,
    depthWrite: o.depthWrite != null ? o.depthWrite : !(add || o.transparent),
    blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: o.side != null ? o.side : THREE.FrontSide, fog: false
  });
  return m;
}
function ptMat(o) {
  o = o || {};
  var fl = o.flow || null;
  return new THREE.ShaderMaterial({
    vertexShader: PT_VERT, fragmentShader: PT_FRAG, defines: o.nofog ? { NOFOG: 1 } : {},
    uniforms: {
      uT: UT, uFogDist: U_fogDist, uBright: { value: o.bright != null ? o.bright : 1 },
      uScale: { value: (o.scale || 1) * 150 },
      uFlow: { value: fl ? new THREE.Vector4(fl[0], fl[1], fl[2], fl[3]) : new THREE.Vector4(0, 0, 0, 0) },
      uRate: { value: new THREE.Vector3(o.flowSpeed || 1, o.bobSpeed || 0.6, o.twSpeed || 2) }
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  });
}

/* ------------------------------------------------------- merged geometry */
var GEO = {};
function ugeo(kind, a, b) {
  var k = kind + ":" + a + ":" + b; if (GEO[k]) return GEO[k];
  var g;
  if (kind === "box") g = new THREE.BoxGeometry(1, 1, 1);
  else if (kind === "cyl") g = new THREE.CylinderGeometry(a, 1, 1, b, 1, false);       // a = top/bottom radius ratio
  else if (kind === "tube") g = new THREE.CylinderGeometry(1, 1, 1, b, 1, true);
  else if (kind === "tubeN") g = new THREE.CylinderGeometry(1, 1, 1, b, a, true);
  else if (kind === "sph") g = new THREE.SphereGeometry(1, a, b);
  else if (kind === "cone") g = new THREE.ConeGeometry(1, 1, a);
  else if (kind === "plane") g = new THREE.PlaneGeometry(1, 1);
  else if (kind === "planeN") g = new THREE.PlaneGeometry(1, 1, a, b);
  else if (kind === "oct") g = new THREE.OctahedronGeometry(1, 0);
  else if (kind === "ico") g = new THREE.IcosahedronGeometry(1, 0);
  else if (kind === "tor") g = new THREE.TorusGeometry(1, a, 4, b);
  else if (kind === "disc") g = new THREE.CircleGeometry(1, a);
  else if (kind === "boxm") {           // a box keeping only some faces: a = "px nx py ny pz nz" subset
    var full = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), names = ["px", "nx", "py", "ny", "pz", "nz"], src = full.attributes.position.array, suv = full.attributes.uv.array, P2 = [], U2 = [];
    for (var f = 0; f < 6; f++) if (a.indexOf(names[f]) >= 0) { for (var q = 0; q < 6; q++) { var vi = f * 6 + q; P2.push(src[vi * 3], src[vi * 3 + 1], src[vi * 3 + 2]); U2.push(suv[vi * 2], suv[vi * 2 + 1]); } }
    g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(P2, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(U2, 2));
  }
  else g = new THREE.BoxGeometry(1, 1, 1);
  if (g.index) g = g.toNonIndexed();
  return (GEO[k] = g);
}
var _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
var _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _eu = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
var _tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

// MB: accumulates triangles with baked faceted light into one vertex-coloured mesh
function MB(o) {
  o = o || {};
  this.P = []; this.C = []; this.U = []; this.M = []; this.F = [];
  this.L = new THREE.Vector3().fromArray(o.light || [0.35, 0.8, 0.45]).normalize();
  this.amb = o.amb != null ? o.amb : 0.55;
  this.ao = o.ao || null;
}
MB.prototype._shade = function (nx, ny, nz, wy, o) {
  if (o.glow) return 1;
  var amb = o.amb != null ? o.amb : this.amb, L = this.L;
  var d = nx * L.x + ny * L.y + nz * L.z, sh = amb + (1 - amb) * (d > 0 ? d : 0);
  if (ny < -0.6) sh *= o.under != null ? o.under : 0.82;
  var ao = o.ao || this.ao;
  if (ao) { var t = (wy - ao[0]) / (ao[1] - ao[0]); t = t < 0 ? 0 : t > 1 ? 1 : t; sh *= ao[2] + (ao[3] - ao[2]) * t; }
  return sh;
};
MB.prototype._push = function (v, uvx, uvy, r, g, b, sh, o, ph) {
  this.P.push(v.x, v.y, v.z); this.C.push(r * sh, g * sh, b * sh); this.U.push(uvx, uvy);
  this.M.push(ph, o.fl || 0, o.bob || 0, o.sway || 0); this.F.push(o.tw || 0);
};
// add a cached unit geometry with a transform
MB.prototype.geo = function (g, x, y, z, sx, sy, sz, col, o) {
  o = o || {};
  if (o.quat) _q.copy(o.quat); else { _eu.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || "YXZ"); _q.setFromEuler(_eu); }
  _m4.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  if (o.parent) _m4.premultiply(o.parent);
  return this.mat(g, _m4, col, o);
};
MB.prototype.mat = function (g, m4, col, o) {
  o = o || {};
  var pos = g.attributes.position, uv = g.attributes.uv, n = pos.count;
  _c.set(col); var r = _c.r, gg = _c.g, b = _c.b;
  var c2 = o.col2 != null ? new THREE.Color(o.col2) : null;   // vertical two-tone (local y: -0.5 -> col, +0.5 -> col2)
  var ph = o.ph != null ? o.ph : rng();
  for (var i = 0; i + 2 < n; i += 3) {
    for (var k = 0; k < 3; k++) _tri[k].fromBufferAttribute(pos, i + k).applyMatrix4(m4);
    _e1.subVectors(_tri[1], _tri[0]); _e2.subVectors(_tri[2], _tri[0]); _e1.cross(_e2);
    var len = _e1.length() || 1, nx = _e1.x / len, ny = _e1.y / len, nz = _e1.z / len;
    if (o.flipN) { nx = -nx; ny = -ny; nz = -nz; }
    for (var k2 = 0; k2 < 3; k2++) {
      var vv = _tri[k2], sh = this._shade(nx, ny, nz, vv.y, o);
      var rr0 = r, gg0 = gg, bb0 = b;
      if (c2) { var ly = pos.getY(i + k2) + 0.5; ly = ly < 0 ? 0 : ly > 1 ? 1 : ly; rr0 = r + (c2.r - r) * ly; gg0 = gg + (c2.g - gg) * ly; bb0 = b + (c2.b - b) * ly; }
      this._push(vv, uv ? uv.getX(i + k2) * (o.uvs ? o.uvs[0] : 1) : 0, uv ? uv.getY(i + k2) * (o.uvs ? o.uvs[1] : 1) : 0, rr0, gg0, bb0, sh, o, ph);
    }
  }
  return this;
};
MB.prototype.box = function (x, y, z, w, h, d, col, o) { return this.geo((o && o.faces) ? ugeo("boxm", o.faces) : ugeo("box"), x, y, z, w, h, d, col, o); };
MB.prototype.cyl = function (x, y, z, r, h, col, seg, o, topRatio) { return this.geo(ugeo("cyl", topRatio == null ? 1 : topRatio, seg || 8), x, y, z, r, h, r, col, o); };
MB.prototype.sph = function (x, y, z, rx, ry, rz, col, o, ws, hs) { return this.geo(ugeo("sph", ws || 7, hs || 5), x, y, z, rx, ry, rz, col, o); };
MB.prototype.cone = function (x, y, z, r, h, col, seg, o) { return this.geo(ugeo("cone", seg || 8), x, y, z, r, h, r, col, o); };
MB.prototype.oct = function (x, y, z, rx, ry, rz, col, o) { return this.geo(ugeo("oct"), x, y, z, rx, ry, rz, col, o); };
MB.prototype.ico = function (x, y, z, r, col, o) { return this.geo(ugeo("ico"), x, y, z, r, r, r, col, o); };
MB.prototype.tor = function (x, y, z, R, tube, col, seg, o) { return this.geo(ugeo("tor", tube, seg || 12), x, y, z, R, R, R, col, o); };
MB.prototype.disc = function (x, y, z, r, col, seg, o) { o = o || {}; if (o.rx == null) o.rx = -Math.PI / 2; return this.geo(ugeo("disc", seg || 16), x, y, z, r, r, 1, col, o); };
MB.prototype.quadXY = function (x, y, z, w, h, col, o) { return this.geo(ugeo("plane"), x, y, z, w, h, 1, col, o); };
// a raw triangle (world space), optional per-vertex colours
MB.prototype.tri = function (a, b, c, col, o, cb, cc) {
  o = o || {};
  _e1.subVectors(b, a); _e2.subVectors(c, a); _e1.cross(_e2);
  var len = _e1.length() || 1, nx = _e1.x / len, ny = _e1.y / len, nz = _e1.z / len;
  var ph = o.ph != null ? o.ph : 0, cs = [col, cb != null ? cb : col, cc != null ? cc : col], vs = [a, b, c];
  for (var k = 0; k < 3; k++) { _c.set(cs[k]); var sh = this._shade(nx, ny, nz, vs[k].y, o); this._push(vs[k], 0, 0, _c.r, _c.g, _c.b, sh, o, o.phx ? ph + vs[k].x * o.phx : ph); }
  return this;
};
MB.prototype.quad = function (a, b, c, d, col, o, cb, cc, cd) { this.tri(a, b, c, col, o, cb, cc); this.tri(a, c, d, col, o, cc, cd); return this; };
// a beam / segment between two points (box oriented along the segment)
MB.prototype.seg = function (x0, y0, z0, x1, y1, z1, w, h, col, o) {
  o = o || {};
  var dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
  _v.set(dx / L, dy / L, dz / L); _q.setFromUnitVectors(_v2.set(0, 0, 1), _v);
  _m4.compose(_p.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), _q, _s.set(w, h, L));
  return this.mat(o.caps ? ugeo("box") : ugeo("boxm", "px nx py ny"), _m4, col, o);
};
// a faceted height field: hfn(x,z) -> y, colfn(x,y,z,ny) -> colour
MB.prototype.field = function (cx, cz, sx, sz, nx, nz, hfn, colfn, o) {
  o = o || {};
  var pts = [], i, j;
  for (j = 0; j <= nz; j++) for (i = 0; i <= nx; i++) { var x = cx - sx / 2 + sx * i / nx, z = cz - sz / 2 + sz * j / nz; pts.push(new THREE.Vector3(x, hfn(x, z), z)); }
  for (j = 0; j < nz; j++) for (i = 0; i < nx; i++) {
    var a = pts[j * (nx + 1) + i], b = pts[j * (nx + 1) + i + 1], c = pts[(j + 1) * (nx + 1) + i], d = pts[(j + 1) * (nx + 1) + i + 1];
    if (o.skip && o.skip((a.x + d.x) / 2, (a.z + d.z) / 2)) continue;
    var cm = colfn((a.x + d.x) / 2, (a.y + d.y) / 2, (a.z + d.z) / 2);
    this.tri(a, c, b, cm, o); this.tri(b, c, d, cm, o);
  }
  return this;
};
// a (tapered) cylinder from p0 to p1: r0 at p0, r1 at p1
MB.prototype.cylSeg = function (x0, y0, z0, x1, y1, z1, r0, r1, col, seg, o) {
  o = o || {};
  var dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
  _v.set(dx / L, dy / L, dz / L); _q.setFromUnitVectors(_v2.set(0, 1, 0), _v);
  _m4.compose(_p.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), _q, _s.set(r0, L, r0));
  if (o.parent) _m4.premultiply(o.parent);
  return this.mat(ugeo("cyl", Math.round((r1 / r0) * 20) / 20, seg || 7), _m4, col, o);
};
MB.prototype.count = function () { return this.P.length / 3; };
// build: splits big static meshes into spatial chunks (so the camera culls what
// is behind you) and welds shared quad corners into an index buffer.
MB.prototype.build = function (mo) {
  mo = mo || {};
  var n = this.P.length / 3; if (!n) return null;
  var P = this.P, C = this.C, U = this.U, M = this.M, F = this.F;
  var chunk = (mo.flow || mo.nochunk || n < 2400) ? 0 : (mo.chunk || 40);
  var buckets = {}, keys = [], t, k;
  for (t = 0; t < n / 3; t++) {
    var key = "0";
    if (chunk) { var i0 = t * 9, cx = (P[i0] + P[i0 + 3] + P[i0 + 6]) / 3, cz = (P[i0 + 2] + P[i0 + 5] + P[i0 + 8]) / 3; key = Math.floor(cx / chunk) + "," + Math.floor(cz / chunk); }
    if (!buckets[key]) { buckets[key] = []; keys.push(key); }
    buckets[key].push(t);
  }
  var moving = false;
  for (t = 0; t < M.length && !moving; t += 4) if (M[t + 1] || M[t + 2] || M[t + 3]) moving = true;
  for (t = 0; t < F.length && !moving; t++) if (F[t]) moving = true;
  if (moving) mo.motion = true;
  var mat = vcMat(mo), parent = mo.parent || buildGroup, out = null, holder = null;
  if (keys.length > 1) { holder = new THREE.Group(); parent.add(holder); }
  for (k = 0; k < keys.length; k++) {
    var tris = buckets[keys[k]], oP = [], oC = [], oU = [], oM = [], oF = [], idx = [], nv = 0;
    for (var q = 0; q < tris.length; q++) for (var c = 0; c < 3; c++) {
      var vi = tris[q] * 3 + c, found = -1;
      for (var back = 1; back <= 6 && back <= nv; back++) {
        var j = nv - back;
        if (oP[j * 3] === P[vi * 3] && oP[j * 3 + 1] === P[vi * 3 + 1] && oP[j * 3 + 2] === P[vi * 3 + 2] && oC[j * 3] === C[vi * 3] && oC[j * 3 + 1] === C[vi * 3 + 1] && oC[j * 3 + 2] === C[vi * 3 + 2] && oU[j * 2] === U[vi * 2] && oU[j * 2 + 1] === U[vi * 2 + 1] && oM[j * 4] === M[vi * 4] && oM[j * 4 + 1] === M[vi * 4 + 1] && oM[j * 4 + 2] === M[vi * 4 + 2] && oM[j * 4 + 3] === M[vi * 4 + 3] && oF[j] === F[vi]) { found = j; break; }
      }
      if (found < 0) {
        oP.push(P[vi * 3], P[vi * 3 + 1], P[vi * 3 + 2]); oC.push(C[vi * 3], C[vi * 3 + 1], C[vi * 3 + 2]); oU.push(U[vi * 2], U[vi * 2 + 1]);
        oM.push(M[vi * 4], M[vi * 4 + 1], M[vi * 4 + 2], M[vi * 4 + 3]); oF.push(F[vi]); found = nv++;
      }
      idx.push(found);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(oP, 3));
    g.setAttribute("aCol", new THREE.Float32BufferAttribute(oC, 3));
    if (mo.map) g.setAttribute("uv", new THREE.Float32BufferAttribute(oU, 2));
    if (moving) { g.setAttribute("aMot", new THREE.Float32BufferAttribute(oM, 4)); g.setAttribute("aFx", new THREE.Float32BufferAttribute(oF, 1)); }
    g.setIndex(idx);
    g.computeBoundingSphere();
    var m = new THREE.Mesh(g, mat);
    if (mo.flow || mo.nocull) m.frustumCulled = false;
    if (mo.order != null) m.renderOrder = mo.order;
    (holder || parent).add(m);
    if (!out) out = m;
  }
  this.P = this.C = this.U = this.M = this.F = null;
  return holder || out;
};

// PC: soft additive point cloud (stars, motes, rain, snow, embers)
function PC() { this.P = []; this.C = []; this.S = []; this.M = []; this.F = []; }
PC.prototype.add = function (x, y, z, col, size, o) {
  o = o || {}; _c.set(col);
  this.P.push(x, y, z); this.C.push(_c.r, _c.g, _c.b); this.S.push(size || 1);
  this.M.push(o.ph != null ? o.ph : rng(), o.fl || 0, o.bob || 0, o.sway || 0); this.F.push(o.tw || 0);
  return this;
};
PC.prototype.build = function (mo) {
  if (!this.P.length) return null;
  mo = mo || {};
  var g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(this.P, 3));
  g.setAttribute("aCol", new THREE.Float32BufferAttribute(this.C, 3));
  g.setAttribute("aSize", new THREE.Float32BufferAttribute(this.S, 1));
  g.setAttribute("aMot", new THREE.Float32BufferAttribute(this.M, 4));
  g.setAttribute("aFx", new THREE.Float32BufferAttribute(this.F, 1));
  var p = new THREE.Points(g, ptMat(mo)); p.frustumCulled = false;
  if (mo.order != null) p.renderOrder = mo.order;
  (mo.parent || buildGroup).add(p);
  return p;
};
// a dome of stars (or anything) on a big sphere around the origin
function starfield(n, R, col, size, o) {
  o = o || {}; var pc = new PC(), minY = o.minY != null ? o.minY : 0.02;
  for (var i = 0; i < n; i++) {
    var u = minY + rng() * (1 - minY), th = rng() * TAU, s = Math.sqrt(1 - u * u);
    var c = o.colors ? o.colors[(rng() * o.colors.length) | 0] : col;
    pc.add(Math.cos(th) * s * R, u * R + (o.y || 0), Math.sin(th) * s * R, c, size * (0.5 + rng() * (o.vary || 1)), { tw: o.tw != null ? o.tw * rng() : 0.5 * rng() });
  }
  var m = pc.build({ scale: o.scale || 1, twSpeed: o.twSpeed || 1.6, bright: o.bright || 1, nofog: true });
  if (m) followCam(m, true);
  return m;
}

/* -------------------------------------------------------------- sky dome */
function skyDome(o) {
  var dim = 1; try { dim = 1 - nightDread * 0.5; } catch (e) {}
  var sd = o.sun ? new THREE.Vector3().fromArray(o.sun.dir).normalize() : new THREE.Vector3(0, 1, 0);
  var st = o.stops || [-0.25, 0.0, 0.22, 0.85];
  var m = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    uniforms: {
      uC0: { value: new THREE.Color(o.c[0]) }, uC1: { value: new THREE.Color(o.c[1]) }, uC2: { value: new THREE.Color(o.c[2]) }, uC3: { value: new THREE.Color(o.c[3]) },
      uStops: { value: new THREE.Vector4(st[0], st[1], st[2], st[3]) },
      uSunDir: { value: sd }, uSunCol: { value: new THREE.Color(o.sun ? o.sun.col : 0x000000) },
      uSun: { value: new THREE.Vector2(0, o.sun ? (o.sun.glow || 8) : 8) },
      uDim: { value: dim }
    },
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false
  });
  var dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 24), m);
  dome.renderOrder = 1000; dome.frustumCulled = false;
  buildGroup.add(dome);
  if (o.sun && o.sun.size) {   // the sun (or moon) disc itself, riding on the dome
    var sb = new MB({ amb: 1 }), sp = sd.clone().multiplyScalar(470), R = 470 * o.sun.size * 1.6;
    var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), sd.clone().negate());
    sb.geo(ugeo("disc", 20), sp.x, sp.y, sp.z, R, R, 1, o.sun.disc || o.sun.col, { quat: q, glow: true });
    sb.geo(ugeo("disc", 20), sp.x * 1.002, sp.y * 1.002, sp.z * 1.002, R * 2.2, R * 2.2, 1, mix(o.sun.disc || o.sun.col, 0x000000, 0.8), { quat: q, glow: true });
    var sm = sb.build({ add: true, nofog: true, parent: dome, nocull: true, depthWrite: false });
    if (sm) sm.renderOrder = 1001;
  }
  followCam(dome, false);
  return dome;
}
// keep an object centred on the camera (sky, stars); keepY=false follows all axes
function followCam(obj, softY) {
  entities.push({ obj: obj, update: function () { if (camera) { obj.position.x = camera.position.x; obj.position.z = camera.position.z; obj.position.y = softY ? camera.position.y * 0.2 : camera.position.y; } } });
}

/* ------------------------------------------------------- analytic ground */
// Multi-level ground: returns the highest surface at (x,z) that is not above
// the engine's step clamp (groundClampY), exactly like raycastGround does.
function GS() { this.s = []; }
GS.prototype.add = function (f) { this.s.push(f); return this; };
GS.prototype.flat = function (y) { return this.add(function () { return y; }); };
// rotations follow mesh.rotation.y: local +z points to (sin ry, cos ry)
GS.prototype.rect = function (x, z, hw, hd, y, ry) {
  var c = Math.cos(ry || 0), s = Math.sin(ry || 0);
  return this.add(function (px, pz) { var dx = px - x, dz = pz - z, lx = dx * c - dz * s, lz = dx * s + dz * c; return (Math.abs(lx) <= hw && Math.abs(lz) <= hd) ? y : null; });
};
// stairs along local +z from (x, z0) rising `rise` per step of length `run`; ry rotates around (x, z0)
GS.prototype.stairs = function (x, z0, hw, steps, run, rise, y0, ry) {
  var c = Math.cos(ry || 0), s = Math.sin(ry || 0);
  return this.add(function (px, pz) { var dx = px - x, dz = pz - z0, lx = dx * c - dz * s, lz = dx * s + dz * c; if (Math.abs(lx) > hw || lz < 0 || lz > steps * run) return null; var i = Math.floor(lz / run); if (i >= steps) i = steps - 1; return y0 + rise * (i + 1); });
};
GS.prototype.disc = function (x, z, r, y, rIn) {
  var r2 = r * r, ri2 = (rIn || 0) * (rIn || 0);
  return this.add(function (px, pz) { var d = (px - x) * (px - x) + (pz - z) * (pz - z); return (d <= r2 && d >= ri2) ? (typeof y === "function" ? y(px, pz) : y) : null; });
};
// a helical ramp around (cx,cz): radius r0..r1, height y0 at angle a0, rising `pitch` per turn (ccw), turns kMin..kMax
GS.prototype.helix = function (cx, cz, r0, r1, y0, pitch, a0, kMin, kMax) {
  return this.add(function (px, pz) {
    var dx = px - cx, dz = pz - cz, rr2 = Math.sqrt(dx * dx + dz * dz); if (rr2 < r0 || rr2 > r1) return null;
    var a = Math.atan2(dz, dx) - a0; a = ((a % TAU) + TAU) % TAU;
    var base = y0 + pitch * a / TAU, lim = (groundClampY === Infinity ? 1e9 : groundClampY + 0.001);
    var k = Math.floor((lim - base) / pitch); if (k > kMax) k = kMax; if (k < kMin) return null;
    return base + k * pitch;
  });
};
GS.prototype.sample = function (x, z) {
  var lim = groundClampY + 0.001, best = -Infinity;
  for (var i = 0; i < this.s.length; i++) { var y = this.s[i](x, z); if (y != null && y <= lim && y > best) best = y; }
  return best > -Infinity ? { y: best, on: true } : { y: 0, on: false };
};
GS.prototype.fn = function () { var self = this; return function (x, z) { return self.sample(x, z); }; };

/* ------------------------------------------------------------ world bits */
// solid box that rotates like a mesh (engine colliders use the opposite sign)
function solid(x, z, hw, hd, ry, y0, y1) { pushSolidBox(x, z, hw, hd, -(ry || 0), y0, y1); }
function yawTo(dx, dz) { return Math.atan2(-dx, -dz); }
function zone(o) {
  return {
    spawn: o.spawn, ground: o.ground,
    fog: { color: new THREE.Color(o.fog[0]), near: o.fog[1], far: o.fog[2] },
    sky: new THREE.Color(o.sky), flags: {}, bounds: o.bounds || 0,
    killY: o.killY != null ? o.killY : -25, desat: o.desat || 0, fov: o.fov,
    audioOverride: soundPreset(o.sound || "hum", o.P, o.mood), n2pack: "a"
  };
}
// water without textures: a flat sheet plus drifting additive glints (no affine
// texture smear on the big near triangles, and much cheaper to fill)
function waterSheet(o) {
  var b = new MB({ amb: 1 });
  b.geo(ugeo("planeN", o.seg || 8, o.seg || 8), o.x || 0, o.y || 0, o.z || 0, o.w, o.d, 1, o.col, { rx: -Math.PI / 2, glow: true });
  var base = b.build(o.opacity != null ? { transparent: true, opacity: o.opacity, order: o.order, nochunk: true } : { nochunk: true });
  var hl = new MB({ amb: 1 }), fdx = o.flow ? o.flow[0] : 0, fdz = o.flow ? o.flow[1] : 0, wrap = o.wrap || 0;
  var ang = o.flow ? Math.atan2(fdx, fdz) : (o.angle || 0);
  for (var i = 0; i < (o.n || 300); i++) {
    var x = (o.x || 0) + rrange(-o.w / 2, o.w / 2), z = (o.z || 0) + rrange(-o.d / 2, o.d / 2);
    if (o.keep && !o.keep(x, z)) continue;
    if (wrap) { x -= fdx * wrap / 2; z -= fdz * wrap / 2; }
    var len = rrange(o.len ? o.len[0] : 1, o.len ? o.len[1] : 4), c = o.hi[(rng() * o.hi.length) | 0];
    hl.quadXY(x, (o.y || 0) + 0.03, z, rrange(0.06, o.thick || 0.18), len, c, { rx: -Math.PI / 2, ry: ang + Math.PI / 2 + (o.flow ? Math.PI / 2 : 0), glow: true, fl: wrap ? 1 : 0, tw: o.tw != null ? o.tw : 0.7 });
  }
  var hm = hl.build(wrap ? { add: true, flow: [fdx, 0, fdz, wrap], flowSpeed: o.speed || 1, twSpeed: o.twSpeed || 2 } : { add: true, twSpeed: o.twSpeed || 2 });
  return { base: base, glints: hm };
}
function tint(hex, dh, ds, dl) { return new THREE.Color(hex).offsetHSL(rrange(-(dh || 0), dh || 0), rrange(-(ds || 0), ds || 0), rrange(-(dl || 0), dl || 0)); }
function mix(a, b, t) { return new THREE.Color(a).lerp(new THREE.Color(b), t); }
function onward() { try { return pickR(ALL_NAMES); } catch (e) { return null; } }
// a glowing doorway: frame + light; the link spans the given floor height
function gate(x, y, z, ry, col, frameCol, target, o) {
  o = o || {};
  var w = o.w || 1.5, h = o.h || 2.5;
  var fb = new MB({ amb: 0.6 });
  var c = Math.cos(ry), s = Math.sin(ry);
  fb.box(x - c * (w / 2 + 0.12), y + h / 2, z + s * (w / 2 + 0.12), 0.24, h + 0.1, 0.3, frameCol, { ry: ry });
  fb.box(x + c * (w / 2 + 0.12), y + h / 2, z - s * (w / 2 + 0.12), 0.24, h + 0.1, 0.3, frameCol, { ry: ry });
  fb.box(x, y + h + 0.1, z, w + 0.5, 0.24, 0.32, frameCol, { ry: ry });
  fb.build();
  var lb = new MB();
  lb.quadXY(x, y + h / 2, z, w, h, col, { ry: ry, glow: true });
  var door = lb.build({ side: THREE.DoubleSide, bright: 1.6 });
  var gl = N2.glowSprite(col, o.glow || 4.5); gl.position.set(x, y + h * 0.55, z); buildGroup.add(gl);
  pushBoxLink(x, z, w / 2 + 0.1, 0.45, -ry, y - 0.6, y + h + 0.3, { b: rr(-0.2, 0.25), e: rr(-0.2, 0.3) }, "door");
  linkables[linkables.length - 1].target = target === undefined ? onward() : target;
  if (door && door.material.uniforms) { var dm = door.material.uniforms.uBright; entities.push({ obj: door, update: function () { dm.value = 1.45 + Math.sin(T() * 1.3 + x) * 0.25; } }); }
  return door;
}
// an interactable that speaks a sequence of poetic lines (valence 0: never yanks you away)
function sayIx(obj, x, z, r, lines, o) {
  o = o || {}; var n = 0;
  var e = ix(obj, x, z, r, {
    kind: o.kind || "n2_thing",
    examine: function (en) {
      var line = lines[n % lines.length]; n++;
      try { beingSpeak(line); } catch (er) {}
      try { if (o.sound) o.sound(); else N2.chime(rrange(520, 780), 1.6, 0.06); } catch (er) {}
      try { if (o.on) o.on(en, n); } catch (er) {}
    },
    update: o.update
  });
  try { addInteractGlow(e, x, z, o.y || 0); } catch (er) {}
  return e;
}
// spatial one-shot sounds near points: [{x,z,r,a,b,fn(pan,k)}]
function soundSpots(list) {
  for (var i = 0; i < list.length; i++) list[i].t = rr(0.5, list[i].a || 3);
  entities.push({ obj: buildGroup, update: function (dt) {
    if (!audio.ctx || audio.muted) return;
    for (var j = 0; j < list.length; j++) {
      var s = list[j], dx = s.x - pos.x, dz = s.z - pos.z, d = Math.sqrt(dx * dx + dz * dz);
      if (s.y != null && Math.abs(pos.y - s.y) > (s.dy || 12)) continue;
      if (d > s.r) continue;
      s.t -= dt; if (s.t > 0) continue;
      s.t = rr(s.a || 3, s.b || 6);
      try { s.fn(clamp(dx / Math.max(4, s.r * 0.5), -1, 1), 1 - d / s.r); } catch (e) {}
    }
  } });
}
function anim(fn) { entities.push({ obj: buildGroup, update: function (dt) { try { fn(dt, T()); } catch (e) {} } }); }
// a tapered pointed arch from (x0,y0,z0) to (x1,y0,z1) rising `rise`, as n beam segments
function arch(mb, x0, z0, x1, z1, y0, rise, n, th, col, o) {
  var pts = [];
  for (var i = 0; i <= n; i++) {
    var t = i / n, u = t * 2 - 1, k = 1 - Math.pow(Math.abs(u), 1.6);
    pts.push([x0 + (x1 - x0) * t, y0 + rise * Math.sqrt(Math.max(0, k)), z0 + (z1 - z0) * t]);
  }
  for (var j = 0; j < n; j++) mb.seg(pts[j][0], pts[j][1], pts[j][2], pts[j + 1][0], pts[j + 1][1], pts[j + 1][2], th, th, col, o);
}
WA.kit = { MB: MB, PC: PC, GS: GS, vcMat: vcMat, skyDome: skyDome, starfield: starfield, gate: gate, sayIx: sayIx, time: T };

/* ------------------------------------------- authored worlds stay authored */
// the engine scatters generic props / a random landmark into every dream; these
// worlds are composed by hand, so they skip that (beings and events still come).
var _placeSceneProps = placeSceneProps;
placeSceneProps = function (z) { if (z && MINE[z.archetypeName]) { sceneProps = []; return; } return _placeSceneProps.apply(this, arguments); };
var _placeLandmark = placeSignatureLandmark;
placeSignatureLandmark = function (z) { if (z && MINE[z.archetypeName]) return; return _placeLandmark.apply(this, arguments); };
var _placeIx = placeInteractables;
placeInteractables = function (z) { if (z && MINE[z.archetypeName]) return; return _placeIx.apply(this, arguments); };

WA.isMine = function (name) { return !!MINE[name]; };
WA.list = function () { return WA.names.map(function (n) { return { name: n, title: N2.worldInfo[n] ? N2.worldInfo[n].title : n }; }); };
function reg(name, title, valence, tags, fn) {
  MINE[name] = 1; WA.names.push(name);
  N2.registerWorld(name, function (P, mood) { return fn(P, mood); }, { valence: valence, tags: ["worlds-a", "vast"].concat(tags || []), title: title });
}

/* =============================================================================
   1. the nave of stairs — a roofless cathedral afloat in cloud, its aisles full
   of staircases that climb into the overcast. one of them can be climbed.
   ============================================================================= */
reg("stair_nave_into_cloud", "the nave of stairs", 1, ["cathedral", "cloud", "stairs"], function (P, mood) {
  var warm = rng() < 0.5;
  var SKY = warm ? [0xe9e3ec, 0xcdc4d8, 0xe9dcc6, 0xf6ecd6] : [0xdfe6ee, 0xbfc8d8, 0xd6dfea, 0xeef2f6];
  var FOG = warm ? 0xc9c0d2 : 0xbcc5d4;
  var stone = warm ? 0x8a8296 : 0x7d8696, stoneL = warm ? 0xd8cfd8 : 0xccd4de, floorA = warm ? 0xa79fae : 0x9aa3b1, floorB = warm ? 0x8c8494 : 0x7f8896;
  skyDome({ c: SKY, sun: { dir: [0.25, 0.7, 0.66], col: warm ? 0x8a6a40 : 0x506070, size: 0.03, glow: 6 } });
  var g = new GS();
  var mb = new MB({ light: [0.3, 0.85, 0.42], amb: 0.58, ao: [0, 14, 0.72, 1.0] });
  // floor: one plane with a two-tone tile texture, a darker runner down the nave
  var X0 = -26, X1 = 26, Z0 = -70, Z1 = 100;
  var fl = new MB({ amb: 1 });
  for (var tx = X0; tx < X1; tx += 4) for (var tz = Z0; tz < Z1; tz += 4) fl.quadXY(tx + 2, 0, tz + 2, 4, 4, ((tx / 4 + tz / 4) & 1) ? floorA : floorB, { rx: -Math.PI / 2, glow: true });
  fl.build();
  mb.box(0, 0.03, (Z0 + Z1) / 2, 3.6, 0.06, Z1 - Z0, warm ? 0x7a6676 : 0x6a7486, { faces: "py", amb: 0.9 });
  // the west wall behind you: a great round window, open to the white
  mb.box(-15, 18, -70, 22, 36, 1.6, stone, { faces: "px nx py pz nz" }); mb.box(15, 18, -70, 22, 36, 1.6, stone, { faces: "px nx py pz nz" });
  mb.box(0, 5, -70, 8, 10, 1.6, stone, { faces: "px nx py pz nz" }); mb.box(0, 34, -70, 8, 4, 1.6, stone, { faces: "px nx py ny pz nz" });
  mb.tor(0, 20, -70, 6.5, 0.12, stoneL, 20);
  for (var sp2 = 0; sp2 < 12; sp2++) { var sa2 = sp2 / 12 * TAU; mb.seg(0, 20, -70, Math.cos(sa2) * 6.5, 20 + Math.sin(sa2) * 6.5, -70, 0.3, 0.3, stoneL); }
  mb.tor(0, 20, -70, 2.2, 0.15, stoneL, 12);
  g.rect(0, (Z0 + Z1) / 2, 26, (Z1 - Z0) / 2, 0);
  // the piers: two rows marching into the fog, joined by pointed arches
  for (var side = -1; side <= 1; side += 2) {
    for (var pz = -60; pz <= 90; pz += 10) {
      var px = side * 12;
      mb.box(px, 1, pz, 3.4, 2, 3.4, stone, { faces: "px nx py pz nz" });
      mb.geo(ugeo("tube", 0, 8), px, 21, pz, 1.25, 38, 1.25, stone, { col2: stoneL });
      mb.box(px, 40.4, pz, 3.0, 1.0, 3.0, stoneL);
      pushSolidCyl(px, pz, 1.6, 0, 40);
      if (pz < 90) arch(mb, px, pz, px, pz + 10, 30, 8, 5, 0.9, stoneL);
      // outer aisle wall: tall lancet frames, open to the sky
      var wx = side * 25;
      mb.box(wx, 13, pz, 1.4, 26, 1.6, stone, { faces: "px nx py pz nz" });
      if (pz < 90) { arch(mb, wx, pz, wx, pz + 10, 18, 8, 5, 0.7, stone); mb.box(wx, 1.2, pz + 5, 0.8, 2.4, 10, stone, { faces: "px nx py" }); }
    }
  }
  // cross arches over the nave
  for (var cz = -60; cz <= 90; cz += 20) arch(mb, -12, cz, 12, cz, 34, 12, 8, 1.1, stoneL);
  // the freestanding stairs that go nowhere, everywhere: into the overcast
  var sm = new MB({ light: [0.3, 0.85, 0.42], amb: 0.6 });
  function flight(x, z, ry, n, run, rise, y0, w, col) {
    var c = Math.sin(ry), s = Math.cos(ry);
    for (var i = 0; i < n; i++) {
      var yy = y0 + rise * (i + 1), d = i * run;
      sm.box(x + c * d, yy - 0.15, z + s * d, w, 0.3, run + 0.05, col, { ry: ry, faces: "px nx py pz nz" });
    }
    var d1 = (n - 1) * run;
    sm.seg(x, y0 - 0.3, z, x + c * d1, y0 + rise * n - 0.6, z + s * d1, 0.3, 0.5, stone);
  }
  var stairCol = stoneL;
  for (var f = 0; f < 14; f++) {
    var sx = (rng() < 0.5 ? -1 : 1) * rrange(14, 22), sz = rrange(-55, 85), sry = rng() < 0.5 ? 0 : Math.PI, base = rrange(0, 12);
    if (rng() < 0.35) { sx = rrange(-8, 8); sz = rrange(66, 92); base = rrange(14, 30); sry = rrange(-0.6, 0.6); }
    flight(sx, sz, sry, rint(18, 36), 1.0, rrange(0.7, 1.0), base, rrange(1.4, 2.6), stairCol);
  }
  // a few spiral stairs coiling up into the cloud
  for (var sp = 0; sp < 2; sp++) {
    var scx = sp ? 19 : -19, scz = 74 + sp * 10, sr = 2.6;
    sm.geo(ugeo("tube", 0, 6), scx, 26, scz, 0.5, 52, 0.5, stone, {});
    for (var st = 0; st < 70; st++) { var sa = st * 0.5; sm.box(scx + Math.cos(sa) * sr, st * 0.75 + 0.3, scz + Math.sin(sa) * sr, 2.4, 0.22, 1.0, stairCol, { ry: -sa, faces: "px nx py pz nz" }); }
  }
  // THE stair: three flights and landings up into the cloud floor
  var W = 2.6, run = 0.9, rise = 0.5, N = 20;
  var flights = [[-20, 0], [6, 10], [32, 20]];
  for (var fi = 0; fi < flights.length; fi++) {
    var z0 = flights[fi][0], y0 = flights[fi][1];
    for (var k = 0; k < N; k++) {
      var yy = y0 + rise * (k + 1);
      sm.box(0, yy - 0.2, z0 + k * run + run / 2, W * 2, 0.4, run + 0.02, k % 2 ? stoneL : mix(stoneL, 0xffffff, 0.12), { faces: "px nx py nz" });
    }
    sm.seg(-W + 0.2, y0 - 0.4, z0, -W + 0.2, y0 + rise * N - 0.6, z0 + N * run, 0.4, 0.8, stone);
    sm.seg(W - 0.2, y0 - 0.4, z0, W - 0.2, y0 + rise * N - 0.6, z0 + N * run, 0.4, 0.8, stone);
    // banister posts
    for (var bp = 0; bp <= N; bp += 5) for (var bs = -1; bs <= 1; bs += 2) sm.box(bs * (W - 0.1), y0 + rise * bp + 0.9, z0 + bp * run, 0.14, 1.2, 0.14, stone, { faces: "px nx pz nz" });
    g.stairs(0, z0, W, N, run, rise, y0);
    var ly = y0 + rise * N, lz0 = z0 + N * run, lz1 = fi < 2 ? flights[fi + 1][0] : lz0 + 14;
    var lw = fi < 2 ? 4.2 : 6;
    sm.box(0, ly - 0.25, (lz0 + lz1) / 2, lw * 2, 0.5, lz1 - lz0, stoneL);
    g.rect(0, (lz0 + lz1) / 2, lw, (lz1 - lz0) / 2, ly);
    // a slender column under each landing
    sm.geo(ugeo("tube", 0, 6), 0, ly / 2 - 0.3, (lz0 + lz1) / 2, 0.6, ly - 0.5, 0.6, stone, {});
    pushSolidCyl(0, (lz0 + lz1) / 2, 0.7, 0, ly - 0.8);
  }
  mb.build();
  sm.build();
  // light falling through the lancets: long additive shafts
  var lb = new MB({ amb: 1 });
  for (var ls = 0; ls < 9; ls++) {
    var lzz = -50 + ls * 16 + rrange(-2, 2), lsx = rng() < 0.5 ? -1 : 1;
    var top = [lsx * 25, 20, lzz], bot = [lsx * rrange(4, 10), 0, lzz + rrange(-3, 6)];
    lb.seg(top[0], top[1], top[2], bot[0], bot[1], bot[2], rrange(1.6, 2.8), 6, warm ? 0x2a2218 : 0x1c2228, { glow: true, ao: [0, 20, 0.1, 1] });
  }
  lb.build({ add: true });
  // the cloud ceiling, drifting slowly sideways
  var cl = new MB({ light: [0.2, 1, 0.3], amb: 0.62 });
  var cloudCol = warm ? 0xf2ebf0 : 0xeef2f6;
  for (var c = 0; c < 44; c++) {
    var ccx = -150, ccy = rrange(38, 58), ccz = rrange(-80, 120), ph = rng(), big = rrange(7, 17);
    for (var pf = 0; pf < 3; pf++) cl.geo(ugeo("ico"), ccx + rrange(-big, big), ccy + rrange(-1.5, 2.5), ccz + rrange(-big * 0.6, big * 0.6), big * rrange(0.7, 1.2), big * rrange(0.3, 0.45), big * rrange(0.6, 0.9), cloudCol, { fl: 1, ph: ph, under: 0.78, ry: rng() * 6 });
  }
  cl.build({ flow: [1, 0, 0, 300], flowSpeed: 1.4 });
  // the sea of cloud below the floor
  var cb = new MB({ light: [0.2, 1, 0.3], amb: 0.7 });
  for (var b2 = 0; b2 < 50; b2++) { var bx = rrange(-160, 160), bz = rrange(-140, 200); if (Math.abs(bx) < 30 && bz > -75 && bz < 105) continue; var bs2 = rrange(10, 24); cb.geo(ugeo("ico"), bx, rrange(-14, -7), bz, bs2, bs2 * 0.35, bs2 * 0.8, cloudCol, { bob: rrange(0.2, 0.6), ry: rng() * 6 }); }
  cb.build({ bobSpeed: 0.25 });
  // motes in the light
  var pc = new PC();
  for (var m = 0; m < 260; m++) pc.add(rrange(-22, 22), rrange(0.5, 26), rrange(-60, 92), warm ? 0xfff0d0 : 0xe8f0ff, rrange(0.08, 0.16), { bob: rrange(0.2, 0.8), sway: rrange(0.2, 0.7), tw: 0.6 });
  pc.build({ bobSpeed: 0.3, bright: 0.8 });
  // a stone font near the start, and a lectern on the last landing
  var font = new MB({ amb: 0.6 });
  font.cyl(7, 0.5, -38, 0.5, 1.0, stone, 8); font.cyl(7, 1.15, -38, 1.3, 0.4, stoneL, 10, {}, 1.0); font.cyl(7, 1.36, -38, 1.1, 0.05, 0x9fb4c8, 10, { glow: true });
  var fontM = font.build();
  pushSolidCyl(7, -38, 1.0, 0, 1.4);
  sayIx(fontM, 7, -38, 2.6, ["the water shows the stairs going down instead", "you see yourself, very small, climbing", "it is so still. like a breath being held for you"], { kind: "font" });
  var topY = 30, lec = new MB({ amb: 0.6 });
  lec.box(2.2, topY + 0.55, 58, 0.3, 1.1, 0.3, 0x5a4a44); lec.box(2.2, topY + 1.15, 58, 1.0, 0.1, 0.7, 0x6a5650, { rx: -0.35 }); lec.box(2.2, topY + 1.23, 58.02, 0.8, 0.04, 0.55, 0xf4ecdc, { rx: -0.35, glow: true });
  var lecM = lec.build();
  sayIx(lecM, 2.2, 58, 2.4, ["a book of everyone who climbed. the last line is still wet", "you turn the page. it is blank, and warm", "your name is not here yet. there is room for it"], { kind: "book", y: topY });
  // doors onward: one at the top in the cloud, two on the ground
  gate(0, topY, 63.4, 0, warm ? 0xffe6b0 : 0xe0f0ff, stone);
  gate(0, 0, 97, 0, warm ? 0xffd8a0 : 0xd0e4ff, stone);
  gate(0, 0, -68, 0, warm ? 0xffd8a0 : 0xd0e4ff, stone);
  soundSpots([
    { x: 0, z: 10, r: 200, a: 18, b: 34, fn: function (pan) { audio.gong(rrange(98, 131), rr(-0.5, 0.5)); } },
    { x: 0, z: 56, y: topY, r: 30, a: 6, b: 12, fn: function (pan) { audio.creature("sigh", pan, 1); } }
  ]);
  return zone({ P: P, mood: mood, spawn: { x: 0, z: -48, yaw: Math.PI }, ground: g.fn(), fog: [FOG, 22, 160], sky: SKY[1], killY: -18, sound: "choir" });
});

/* =============================================================================
   2. a sea of clocks at dawn — shallow, endless water at sunrise; clocks float
   like lilies and stand like buoys. a stair rises out of the sea to the face
   of a drowned clock tower that is just about to strike.
   ============================================================================= */
reg("dawn_clock_sea", "a sea of clocks at dawn", 1, ["sea", "clocks", "dawn"], function (P, mood) {
  var v = rng();
  var SKY = v < 0.5 ? [0x3b3f66, 0xf7c99a, 0xe39aa4, 0x46507e] : [0x384a66, 0xf3d6a8, 0xb8a4c8, 0x3e5a86];
  var FOG = v < 0.5 ? 0xe8b496 : 0xe0c0a4;
  skyDome({ c: SKY, stops: [-0.2, 0.0, 0.12, 0.7], sun: { dir: [0.0, 0.05, 1], col: 0xffd7a0, size: 0.035, glow: 5 } });
  var g = new GS();
  var SEA = -0.45;
  g.add(function (x, z) { return (x * x + z * z < 150 * 150) ? SEA : null; });
  // the sea: shallow, gently scrolling, glittering on the path to the sun
  waterSheet({ w: 340, d: 340, col: 0x55547c, hi: [0x4a3a3a, 0x3a3038, 0x2a2834], n: 520, len: [2, 7], angle: Math.PI / 2, tw: 0.8, twSpeed: 1.2 });
  var gl = new PC();
  for (var i = 0; i < 520; i++) { var gz = rrange(10, 240), spread = 2 + gz * 0.16; gl.add(rrange(-spread, spread), 0.05, gz, i % 3 ? 0xffd6a0 : 0xfff0d8, rrange(0.08, 0.2), { tw: 0.95 }); }
  gl.build({ twSpeed: 3.2, bright: 1.1 });
  // clocks
  var cm = new MB({ light: [0.0, 0.55, 1.0], amb: 0.62 }), bobM = new MB({ light: [0.0, 0.55, 1.0], amb: 0.62 });
  var FACE = 0xf2e6cf, RIM = 0xb0874e, INK = 0x2e2a34;
  function clockFace(mb, x, y, z, r, o, nTicks, hands) {
    o = o || {};
    var par = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0)), new THREE.Vector3(1, 1, 1));
    var b = { ph: o.ph != null ? o.ph : rng(), bob: o.bob || 0, parent: par };
    mb.geo(ugeo("tube", 0, 14), 0, -0.12, 0, r * 1.06, 0.3, r * 1.06, RIM, b);
    mb.geo(ugeo("disc", 14), 0, 0.02, 0, r, r, 1, FACE, merge(b, { rx: -Math.PI / 2 }));
    for (var t = 0; t < nTicks; t++) { var a = t / nTicks * TAU; mb.box(Math.cos(a) * r * 0.82, 0.05, Math.sin(a) * r * 0.82, r * (t % 3 ? 0.06 : 0.12), 0.02, r * 0.16, INK, merge(b, { ry: -a + Math.PI / 2, faces: "py" })); }
    if (hands) { var ha = rng() * TAU, hb = rng() * TAU; mb.box(Math.cos(ha) * r * 0.3, 0.07, Math.sin(ha) * r * 0.3, r * 0.6, 0.02, r * 0.07, INK, merge(b, { ry: -ha, faces: "py" })); mb.box(Math.cos(hb) * r * 0.2, 0.08, Math.sin(hb) * r * 0.2, r * 0.42, 0.02, r * 0.1, INK, merge(b, { ry: -hb, faces: "py" })); }
  }
  // the walkable path of lily-clocks toward the sun
  var px0 = 0, pz0 = 0, pads = [];
  for (var p = 0; p < 9; p++) {
    var r = p === 0 ? 4.5 : rrange(2.4, 4.4);
    if (p > 0) { pz0 += rrange(5.5, 7.5); px0 += rrange(-3, 3); px0 *= 0.8; }
    clockFace(cm, px0, 0.15, pz0, r, {}, 12, true);
    g.disc(px0, pz0, r, 0.15 + 0.06);
    pads.push([px0, pz0, r]);
  }
  // the drifting ones, near and far, bobbing on the swell
  for (var b = 0; b < 70; b++) {
    var a2 = rng() * TAU, d2 = rrange(12, 130), bx = Math.cos(a2) * d2, bz = Math.sin(a2) * d2;
    if (Math.abs(bx) < 8 && bz > -4 && bz < 106) continue;
    var br = rrange(0.6, 3.2), ph = rng(), tilt = rrange(-0.5, 0.5);
    clockFace(bobM, bx, rrange(-0.1, 0.25), bz, br, { ph: ph, bob: rrange(0.05, 0.16), rx: tilt * 0.3, rz: tilt * 0.4 }, br > 2 ? 12 : 4, br > 1.2);
  }
  // standing clocks half-sunk like buoys: long cases leaning in the water
  for (var sc = 0; sc < 18; sc++) {
    var sa = rng() * TAU, sd = rrange(14, 120), sx = Math.cos(sa) * sd, sz = Math.sin(sa) * sd;
    if (Math.abs(sx) < 7 && sz > -4 && sz < 106) continue;
    var hh = rrange(2.5, 6), lean = rrange(-0.25, 0.25), ph2 = rng(), wood = mix(0x4a3038, 0x6a4a40, rng());
    bobM.box(sx, hh / 2 - 0.6, sz, 1.1, hh, 0.7, wood, { ph: ph2, bob: 0.08, rz: lean, ry: rng() * 3 });
    bobM.geo(ugeo("cyl", 1, 12), sx - Math.sin(lean) * (hh - 1.2), hh - 1.0, sz, 0.42, 0.08, 0.42, FACE, { ph: ph2, bob: 0.08, rx: Math.PI / 2, glow: true });
  }
  // the drowned tower and the stair that rises out of the sea toward it
  var TZ = 112, TW = 7, faceY = 34;
  var tw = new MB({ light: [0.0, 0.5, -1.0], amb: 0.55, ao: [-2, 50, 0.7, 1.0] });
  var towerCol = 0x6a5a6e, towerL = 0x9a8890;
  tw.box(0, 22, TZ, TW * 2, 48, TW * 2, towerCol, { faces: "px nx pz nz" });
  tw.box(0, 47, TZ, TW * 2 + 1.5, 2, TW * 2 + 1.5, towerL);
  tw.cone(0, 53, TZ, TW * 1.25, 10, towerCol, 4, { ry: Math.PI / 4 });
  for (var lv = 6; lv < 46; lv += 8) tw.box(0, lv, TZ, TW * 2 + 0.6, 0.6, TW * 2 + 0.6, towerL, { faces: "px nx py pz nz" });
  tw.geo(ugeo("cyl", 1, 24), 0, faceY, TZ - TW - 0.2, 6.6, 0.5, 6.6, RIM, { rx: Math.PI / 2 });
  tw.geo(ugeo("disc", 24), 0, faceY, TZ - TW - 0.48, 6.0, 6.0, 1, FACE, { ry: Math.PI, glow: true });
  for (var t2 = 0; t2 < 12; t2++) { var a3 = t2 / 12 * TAU; tw.box(Math.cos(a3) * 5.1, faceY + Math.sin(a3) * 5.1, TZ - TW - 0.52, t2 % 3 ? 0.25 : 0.5, 0.9, 0.04, INK, { rz: a3 + Math.PI / 2, faces: "nz" }); }
  // distant sister towers on the horizon
  for (var st = 0; st < 5; st++) { var sxx = rrange(-260, 260), szz = rrange(170, 280), sh = rrange(30, 70); tw.box(sxx, sh / 2 - 4, szz, sh * 0.18, sh, sh * 0.18, towerCol); tw.cone(sxx, sh - 4 + sh * 0.08, szz, sh * 0.15, sh * 0.16, towerCol, 4, { ry: Math.PI / 4 }); tw.geo(ugeo("disc", 12), sxx, sh * 0.78 - 4, szz - sh * 0.091, sh * 0.06, sh * 0.06, 1, FACE, { ry: Math.PI, glow: true }); }
  // the stair: 52 steps out of the water
  var N = 52, run = 0.9, rise = 0.5, sz0 = TZ - TW - 1.5 - N * run - 4;
  for (var k = 0; k < N; k++) { var yy = SEA + rise * (k + 1); tw.box(0, yy - 0.5, sz0 + k * run + run / 2, 5, 1.0, run + 0.02, k % 2 ? towerL : mix(towerL, 0xffffff, 0.15), { faces: "px nx py nz" }); }
  for (var pl = 6; pl < N; pl += 8) tw.geo(ugeo("tube", 0, 6), 0, (SEA + rise * pl) / 2 - 1, sz0 + pl * run, 0.7, SEA + rise * pl + 2, 0.7, towerCol, {});
  g.stairs(0, sz0, 2.5, N, run, rise, SEA);
  var balY = SEA + rise * N, balZ0 = sz0 + N * run, balZ1 = TZ - TW;
  tw.box(0, balY - 0.25, (balZ0 + balZ1) / 2, 9, 0.5, balZ1 - balZ0 + 0.2, towerL);
  for (var rp = -4; rp <= 4; rp += 1) tw.box(rp, balY + 0.5, balZ0 + 0.1, 0.12, 1.0, 0.12, towerCol, { faces: "px nx pz nz" });
  g.rect(0, (balZ0 + balZ1) / 2, 4.5, (balZ1 - balZ0) / 2, balY);
  solid(0, TZ, TW, TW, 0, -5, 50);
  cm.build(); bobM.build({ bobSpeed: 0.7, nocull: true }); tw.build();
  // the tower's great hands: they move, slowly, toward the hour
  var hands = new MB({ amb: 1 });
  hands.box(0, 2.0, 0, 0.45, 4.2, 0.08, INK, { glow: true }); var hm = hands.build();
  hm.position.set(0, faceY, TZ - TW - 0.62);
  var hands2 = new MB({ amb: 1 });
  hands2.box(0, 1.4, 0, 0.7, 2.9, 0.08, INK, { glow: true }); var hh2 = hands2.build();
  hh2.position.set(0, faceY, TZ - TW - 0.66);
  hm.rotation.z = -0.05; hh2.rotation.z = -0.4;
  anim(function (dt, t) { hm.rotation.z = -0.05 - t * 0.004; hh2.rotation.z = -0.4 - t * 0.0003; });
  // dawn clouds in long rose bands near the horizon
  var cl = new MB({ light: [0, -0.3, -1], amb: 0.8 });
  for (var c = 0; c < 22; c++) { var cx = rrange(-300, 300), cy = rrange(18, 70), cz = rrange(180, 320); cl.geo(ugeo("ico"), cx, cy, cz, rrange(30, 70), rrange(1.5, 4), rrange(6, 12), mix(SKY[2], 0xffffff, rrange(0, 0.3)), { glow: true, fl: 0 }); }
  cl.build({ add: false });
  // a pocket watch on the first pad, and the tower's balcony
  var pw = new MB({ amb: 0.7 });
  clockFace(pw, 1.6, 0.32, 1.2, 0.35, {}, 4, true);
  pw.tor(1.6, 0.3, 0.8, 0.12, 0.25, RIM, 8, { rx: Math.PI / 2 });
  var pwm = pw.build();
  sayIx(pwm, 1.6, 1.2, 2.2, ["a pocket watch, still warm, as if someone just let go of it", "it ticks with your heart. then a little slower", "every clock here is set to the minute before you woke"], { kind: "watch", sound: function () { if (audio.ctx) audio.creature("tick", 0, 1.4); } });
  var bal = new THREE.Object3D(); bal.position.set(0, balY + 1, balZ1 - 1.5); buildGroup.add(bal);
  sayIx(bal, 0, balZ1 - 1.5, 3.2, ["the hands do not move while you look at them", "up close the face is warm, like a cheek in the sun", "it is about to strike. it has been about to strike for years"], { kind: "towerface", y: balY, sound: function () { if (audio.ctx) audio.gong(98, 0); } });
  gate(0, balY, balZ1 - 0.3, Math.PI, 0xfff0c8, towerL);
  gate(-24, SEA + 0.4, -30, 0.6, 0xffe0b8, RIM);
  gate(40, SEA + 0.4, 60, -1.2, 0xffe0b8, RIM);
  // little bobbing platforms under the stray gates
  var gp = new MB({ amb: 0.7 }); clockFace(gp, -24, -0.05, -30, 2.2, {}, 12, true); clockFace(gp, 40, -0.05, 60, 2.2, {}, 12, true); gp.build();
  var spots = [];
  for (var q = 0; q < pads.length; q += 3) spots.push({ x: pads[q][0], z: pads[q][1], r: 9, a: 1.0, b: 1.6, fn: function (pan, k) { audio.creature("tick", pan, 1 + k * 0.5); } });
  spots.push({ x: 0, z: TZ, r: 400, a: 24, b: 40, fn: function (pan) { audio.gong(65.4, 0); audio.gong(98, 0.2); } });
  soundSpots(spots);
  return zone({ P: P, mood: mood, spawn: { x: 0, z: -1.5, y: 0.21, yaw: Math.PI }, ground: g.fn(), fog: [FOG, 26, 190], sky: SKY[1], bounds: 140, killY: -10, sound: "bells" });
});
function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }

/* =============================================================================
   3. the last train over the drowned city — a night train on a single high rail.
   the city it crosses went under long ago; its windows are still lit, and the
   black water holds every one of them twice. the roof is open to the wind.
   ============================================================================= */
reg("drowned_city_night_rail", "the last train over the drowned city", 0, ["train", "city", "night", "water"], function (P, mood) {
  var v = rng();
  var SKY = v < 0.5 ? [0x05070e, 0x2c3858, 0x141c36, 0x05070e] : [0x06060c, 0x3a2a48, 0x1a1430, 0x05040a];
  var FOG = v < 0.5 ? 0x1e2840 : 0x281e36;
  skyDome({ c: SKY, stops: [-0.2, 0.0, 0.18, 0.8], sun: { dir: [-0.5, 0.3, -0.8], col: 0x50505a, disc: 0xd8dce8, size: 0.03, glow: 24 } });
  starfield(260, 400, 0xc8d0ff, 1.0, { minY: 0.08, tw: 0.8 });
  var FLOOR = 8, H = 2.7, CW = 1.65, CARS = 4, CL = 15, GAP = 1.0;
  var total = CARS * CL + (CARS - 1) * GAP, z0 = -total / 2;
  var g = new GS();
  var car = new MB({ light: [0.3, -0.9, 0.2], amb: 0.72 });
  var shell = 0x4a4c5a, shellL = 0x5a6078, seatC = 0x7a4650, floorC = 0x5a4a44, lampC = 0xffd48a;
  var lampsWarm = new MB({ amb: 1 });
  for (var c = 0; c < CARS; c++) {
    var cz0 = z0 + c * (CL + GAP), cz1 = cz0 + CL, cm = (cz0 + cz1) / 2;
    car.box(0, FLOOR - 0.2, cm, CW * 2, 0.4, CL, floorC, { faces: "px nx py pz nz" });
    car.box(0, FLOOR - 1.0, cm, CW * 2 - 0.4, 1.2, CL - 1.4, 0x161a22, { faces: "px nx ny" });
    if (c < CARS - 1) car.box(0, FLOOR + H + 0.12, cm, CW * 2 + 0.2, 0.24, CL + 0.1, shellL, { faces: "px nx py ny pz nz" });
    else {   // the last car keeps a hatch open in its roof above the little stair
      var hA = cz1 - 5.1, hB = cz1 - 1.2;
      car.box(0, FLOOR + H + 0.12, (cz0 + hA) / 2, CW * 2 + 0.2, 0.24, hA - cz0, shellL, { faces: "px nx py ny pz nz" });
      car.box(0, FLOOR + H + 0.12, (hB + cz1) / 2, CW * 2 + 0.2, 0.24, cz1 - hB, shellL, { faces: "px nx py ny pz nz" });
      car.box((CW + 0.1 - 0.35) / 2, FLOOR + H + 0.12, (hA + hB) / 2, CW + 0.1 + 0.35, 0.24, hB - hA, shellL, { faces: "px nx py ny pz nz" });
    }
    for (var sd = -1; sd <= 1; sd += 2) {
      var wx = sd * CW;
      car.box(wx, FLOOR + 0.5, cm, 0.12, 1.0, CL, shell, { faces: "px nx py" });
      car.box(wx, FLOOR + H - 0.35, cm, 0.12, 0.7, CL, shell, { faces: "px nx ny" });
      for (var wp = 0; wp <= CL; wp += 2.5) car.box(wx, FLOOR + 1.45, cz0 + wp, 0.14, 0.95, 0.24, shell, { faces: "px nx pz nz" });
      solid(wx, cm, 0.1, CL / 2, 0, FLOOR - 0.5, FLOOR + H);
      // benches facing the aisle
      for (var bz = cz0 + 1.8; bz < cz1 - 2.5; bz += 2.5) {
        car.box(sd * (CW - 0.45), FLOOR + 0.45, bz + 0.6, 0.7, 0.12, 1.6, seatC, {});
        car.box(sd * (CW - 0.12), FLOOR + 0.85, bz + 0.6, 0.12, 0.8, 1.6, seatC, { faces: "px nx py" });
        car.box(sd * (CW - 0.45), FLOOR + 0.2, bz + 0.6, 0.6, 0.4, 1.4, 0x2a2026, { faces: "px nx" });
      }
      // hanging straps, swaying with the motion of the train
      for (var hz = cz0 + 1.2; hz < cz1 - 0.6; hz += 1.1) { car.box(sd * 0.75, FLOOR + H - 0.3, hz, 0.03, 0.4, 0.03, 0x8a8478, { sway: 0.025, ph: hz * 0.07 }); car.tor(sd * 0.75, FLOOR + H - 0.56, hz, 0.07, 0.22, 0xa49e90, 6, { sway: 0.03, ph: hz * 0.07, ry: Math.PI / 2 }); }
    }
    // end walls with a door gap
    for (var ez = 0; ez < 2; ez++) {
      var zz = ez ? cz1 : cz0;
      for (var es = -1; es <= 1; es += 2) car.box(es * (CW - 0.55), FLOOR + H / 2, zz, 1.1, H, 0.12, shell, { faces: "px nx pz nz" });
      car.box(0, FLOOR + H - 0.3, zz, 1.0, 0.6, 0.12, shell, { faces: "pz nz ny" });
      for (var es2 = -1; es2 <= 1; es2 += 2) solid(es2 * (CW - 0.55), zz, 0.55, 0.08, 0, FLOOR, FLOOR + H);
    }
    // ceiling lamps; one in each car flickers
    for (var lz = cz0 + 2; lz < cz1 - 1; lz += 3.6) lampsWarm.box(0, FLOOR + H - 0.04, lz, 0.5, 0.06, 1.0, lampC, { glow: true, tw: (Math.abs(lz - cm) < 2 && c === 2) ? -0.3 : 0 });
    g.rect(0, cm, CW - 0.25, CL / 2, FLOOR);
    // the roof, walkable from the last car's hatch
    g.rect(0, cm, CW - 0.1, CL / 2, FLOOR + H + 0.24);
    if (c < CARS - 1) { car.box(0, FLOOR - 0.2, cz1 + GAP / 2, 1.2, 0.3, GAP + 0.2, 0x222228); car.box(0, FLOOR + H + 0.18, cz1 + GAP / 2, 1.4, 0.12, GAP + 0.2, 0x3a3a44); g.rect(0, cz1 + GAP / 2, 0.6, GAP / 2 + 0.1, FLOOR); g.rect(0, cz1 + GAP / 2, 0.7, GAP / 2 + 0.1, FLOOR + H + 0.24); }
  }
  // a steep stair to the roof hatch at the back of the last car
  var lastZ1 = z0 + total, hz0 = lastZ1 - 5.0;
  for (var st = 0; st < 6; st++) car.box(-0.9, FLOOR + 0.24 + st * 0.48, hz0 + st * 0.62 + 0.31, 0.9, 0.12, 0.6, 0x6a6058);
  g.stairs(-0.9, hz0, 0.45, 6, 0.62, 0.48, FLOOR);
  // the roof hatch: opening left in the last car's roof is implied by the stair; a railing marks it
  car.box(-0.4, FLOOR + H + 0.55, lastZ1 - 2.2, 0.06, 0.6, 2.4, 0x8a8478);
  // the locomotive nose at the front
  car.box(0, FLOOR + 1.1, z0 - 2.4, CW * 2, 2.6, 4.6, shell, { faces: "px nx py nz" });
  car.box(0, FLOOR + 1.9, z0 - 4.75, CW * 1.6, 0.9, 0.12, 0x9ab4d0, { glow: true });
  // the rail: one beam on tall pylons, running forever both ways
  car.box(0, FLOOR - 1.8, 0, 0.9, 0.7, 600, 0x1c2030, { faces: "px nx py ny" });
  car.build();
  lampsWarm.build({ twSpeed: 9, bright: 1.25 });
  // headlamp beam: a long additive cone ahead into the dark
  var beam = new MB({ amb: 1 });
  beam.geo(ugeo("cone", 10), 0, FLOOR + 1.6, z0 - 5 - 25, 4, 50, 4, 0x2a2418, { glow: true, rx: Math.PI / 2 });
  beam.build({ add: true, side: THREE.DoubleSide });
  // the drowned city sliding past (flows toward +z; the train runs toward -z)
  var city = new MB({ light: [-0.4, 0.6, 0.5], amb: 0.55 }), refl = new MB({ light: [-0.4, 0.6, 0.5], amb: 0.5 });
  var lit = [0xffc66e, 0xffe0a0, 0xffb060, 0xa8d0ff, 0xffd890], LEN = 520;
  function tower(x, zb, w, d, h, col, near) {
    var ph = rng();
    city.box(x, h / 2 - 2, zb, w, h + 4, d, col, { fl: 1, ph: ph, faces: "px nx py pz nz" });
    refl.box(x, -h / 2 + 0.1, zb, w, h, d, mix(col, 0x02040a, 0.45), { fl: 1, ph: ph, glow: true, faces: "px nx pz nz" });
    if (rng() < 0.3) city.box(x, h + 0.6, zb, w * 0.4, 1.2, d * 0.4, col, { fl: 1, ph: ph, faces: "px nx py pz nz" });
    var face = x > 0 ? -1 : 1, nw = near ? rint(6, 16) : rint(3, 8);
    for (var i = 0; i < nw; i++) {
      var wy = rrange(1.5, h - 1), wz = zb + rrange(-d / 2 + 0.8, d / 2 - 0.8), lc = pick(lit);
      city.box(x + face * (w / 2 + 0.02), wy, wz, 0.04, 1.2, 1.0, lc, { fl: 1, ph: ph, glow: true, faces: face < 0 ? "nx" : "px", tw: rng() < 0.08 ? -0.25 : 0 });
      refl.box(x + face * (w / 2 + 0.02), -wy * 0.95, wz, 0.04, 2.6, 0.5, mix(lc, 0x101828, 0.55), { fl: 1, ph: ph, glow: true, faces: face < 0 ? "nx" : "px" });
    }
  }
  var B = [0x283044, 0x323a50, 0x22283a, 0x3a3448];
  for (var b = 0; b < 70; b++) { var side = b % 2 ? 1 : -1, x = side * rrange(14, 70), w = rrange(5, 12), d = rrange(5, 14), h = rrange(3, 26); tower(x, -LEN / 2, w, d, h, pick(B), Math.abs(x) < 35); }
  // the pylons of the rail, passing one by one
  for (var py = 0; py < 18; py++) { var ph3 = py / 18; city.box(0, (FLOOR - 2.2) / 2 - 1, -LEN / 2, 0.9, FLOOR - 1.2 + 2, 0.9, 0x1a1e2a, { fl: 1, ph: ph3, faces: "px nx pz nz" }); refl.box(0, -(FLOOR - 2.2) / 2, -LEN / 2, 0.9, FLOOR - 2.2, 0.9, 0x0a0c14, { fl: 1, ph: ph3, glow: true, faces: "px nx pz nz" }); }
  city.build({ flow: [0, 0, 1, LEN], flowSpeed: 14 });
  refl.build({ flow: [0, 0, 1, LEN], flowSpeed: 14 });
  // the far skyline moves slower (parallax), drowned towers tall as hills
  var far = new MB({ light: [-0.4, 0.6, 0.5], amb: 0.6 });
  for (var f = 0; f < 34; f++) { var fs = f % 2 ? 1 : -1, fx = fs * rrange(90, 200), fh = rrange(20, 70), fw = rrange(10, 24), ph4 = rng(); far.box(fx, fh / 2 - 2, -LEN / 2, fw, fh + 4, fw, 0x1c2234, { fl: 1, ph: ph4, faces: "px nx py pz nz" }); for (var fw2 = 0; fw2 < 6; fw2++) far.box(fx - fs * (fw / 2 + 0.05), rrange(2, fh - 2), -LEN / 2 + rrange(-fw / 2, fw / 2), 0.05, 1.2, 1.0, pick(lit), { fl: 1, ph: ph4, glow: true, faces: fs > 0 ? "nx" : "px" }); }
  far.build({ flow: [0, 0, 1, LEN], flowSpeed: 4 });
  // the black water, holding everything twice
  waterSheet({ w: 300, d: LEN, col: 0x0a1426, opacity: 0.78, order: 2, hi: [0x1a2230, 0x22283a, 0x2a2a30], n: 420, len: [2, 9], flow: [0, 1], wrap: LEN, speed: 14, thick: 0.12 });
  // things left behind
  var tk = new MB({ amb: 0.8 });
  var tz = z0 + CL + GAP + 4.3;
  tk.box(1.2, FLOOR + 0.53, tz, 0.22, 0.02, 0.12, 0xe8dcc0, { glow: true });
  var tkm = tk.build();
  sayIx(tkm, 1.2, tz, 2.0, ["a ticket punched for a station that went under the water years ago", "on the back, in pencil: 'wake me when we get there'", "it is warm. someone was holding it until a moment ago"], { kind: "ticket", y: FLOOR });
  var um = new MB({ amb: 0.7 }), uz = z0 + 2 * (CL + GAP) + 8;
  um.cyl(-1.35, FLOOR + 1.1, uz, 0.02, 1.4, 0x2a2a30, 5); um.cone(-1.35, FLOOR + 0.9, uz, 0.12, 1.0, 0x4a2a3a, 6, { rx: Math.PI });
  var umm = um.build();
  sayIx(umm, -1.2, uz, 2.0, ["an umbrella, still wet. it has not rained here in a long time", "someone left it for the next sleeper. it is yours, if you want it"], { kind: "umbrella", y: FLOOR });
  var cab = new THREE.Object3D(); cab.position.set(0, FLOOR + 1, z0 + 0.8); buildGroup.add(cab);
  sayIx(cab, 0, z0 + 1.0, 2.4, ["no one is driving. the train knows the way", "the rail goes on into the dark. somewhere ahead, a light", "the driver's seat is still warm"], { kind: "cab", y: FLOOR });
  gate(0, FLOOR, z0 + 0.35, 0, 0xfff0c0, shellL, undefined, { w: 1.0, h: 2.1, glow: 2.5 });
  gate(0, FLOOR, lastZ1 - 0.35, Math.PI, 0xd8e8ff, shellL, undefined, { w: 1.0, h: 2.1, glow: 2.5 });
  // the rhythm of the rail
  var beat = 0, cl = { x: 0, z: 0, r: 999, a: 0.42, b: 0.44, fn: function () { beat++; var c2 = audio.ctx; if (!c2) return; audio.noise(0.06, "lowpass", 380, 160, (beat % 4 < 2) ? 0.07 : 0.035, rr(-0.2, 0.2)); } };
  soundSpots([cl, { x: 0, z: 0, r: 999, a: 6, b: 14, fn: function () { audio.noise(1.4, "bandpass", 700, 300, 0.03, rr(-0.6, 0.6)); } }]);
  // the whole train sways a little
  anim(function (dt, t) { if (camera && !(N2.settings && N2.settings.reducedMotion)) camera.rotation.z = Math.sin(t * 1.7) * 0.006 + Math.sin(t * 5.3) * 0.002; });
  return zone({ P: P, mood: mood, spawn: { x: 0, z: z0 + CL + GAP + 3, y: FLOOR, yaw: 0 }, ground: g.fn(), fog: [FOG, 14, 150], sky: SKY[1], killY: 3, sound: "machine" });
});

/* =============================================================================
   4. where the rain goes up — a dark forest under a lake that hangs in the sky.
   rain rises out of the puddles into it. its drowned trees hang upside down.
   a stair winds up the oldest tree toward the water.
   ============================================================================= */
reg("sky_lake_rain_forest", "where the rain goes up", 1, ["forest", "rain", "lake", "sky"], function (P, mood) {
  var v = rng();
  var SKY = v < 0.5 ? [0x0a1a1c, 0x1c3434, 0x2a5452, 0x5a9a96] : [0x0c1420, 0x1e2c40, 0x30506a, 0x6a96b8];
  var FOG = v < 0.5 ? 0x183032 : 0x1a2a3a;
  var LAKE_Y = 48;
  skyDome({ c: SKY, stops: [-0.2, 0.02, 0.3, 0.9] });
  var g = new GS();
  var TX = 0, TZ = -46;     // the oldest tree
  function hgt(x, z) {
    var d = Math.sqrt((x - TX) * (x - TX) + (z - TZ) * (z - TZ)), flat = clamp((d - 10) / 14, 0, 1);
    return (Math.sin(x * 0.07) * 1.4 + Math.cos(z * 0.06 + x * 0.02) * 1.6 + Math.sin((x + z) * 0.15) * 0.4) * flat;
  }
  g.add(function (x, z) { return (Math.abs(x) < 95 && Math.abs(z) < 95) ? hgt(x, z) : null; });
  var mb = new MB({ light: [0.2, 1.0, 0.1], amb: 0.55 });
  mb.field(0, 0, 190, 190, 30, 30, hgt, function (x, y, z) { var n = Math.sin(x * 0.31) * Math.cos(z * 0.27); return mix(0x1a3424, 0x2e4a30, 0.5 + n * 0.5); });
  // ferns and stones along the floor
  for (var fn2 = 0; fn2 < 90; fn2++) { var fx = rrange(-80, 80), fz = rrange(-80, 80); if (Math.abs(fx - TX) < 9 && Math.abs(fz - TZ) < 9) continue; var fy = hgt(fx, fz); if (rng() < 0.7) { for (var fr = 0; fr < 3; fr++) { var ex2 = fx + rrange(-1.2, 1.2), ez2 = fz + rrange(-1.2, 1.2); mb.tri(new THREE.Vector3(fx - 0.12, fy, fz), new THREE.Vector3(fx + 0.12, fy, fz), new THREE.Vector3(ex2, fy + rrange(0.4, 0.9), ez2), 0x3a6a3e, { glow: true }); } } else mb.geo(ugeo("ico"), fx, fy, fz, rrange(0.4, 1.1), rrange(0.3, 0.6), rrange(0.4, 1.0), 0x4a5452, { ry: rng() * 6 }); }
  // puddles: the sky shows in them, and the rain leaves from them
  var pud = new MB({ amb: 1 }), puddles = [];
  for (var p = 0; p < 26; p++) { var px = rrange(-70, 70), pz = rrange(-70, 70), pr = rrange(1.2, 3.6); if (Math.abs(px - TX) < 12 && Math.abs(pz - TZ) < 12) continue; pud.disc(px, hgt(px, pz) + 0.06, pz, pr, mix(SKY[3], 0xffffff, 0.15), 10, { glow: true }); puddles.push([px, pz, pr]); }
  pud.build({ bright: 0.85 });
  // the forest: tall dark firs, and their drowned twins hanging from the lake
  var trees = new MB({ light: [0.2, 1.0, 0.1], amb: 0.5, ao: [0, 20, 0.6, 1.1] }), inv = new MB({ light: [0, -1, 0], amb: 0.55 });
  var bark = 0x2a2420, fir = 0x1a3a2e, fir2 = 0x24483a;
  function firTree(mb2, x, y, z, h, sgn, o) {
    o = o || {};
    mb2.geo(ugeo("cyl", 0.6, 5), x, y + sgn * h * 0.3, z, h * 0.025, h * 0.6, h * 0.025, bark, o);
    for (var l = 0; l < 3; l++) { var ly = y + sgn * (h * (0.3 + l * 0.22)), lr = h * (0.26 - l * 0.06); mb2.geo(ugeo("cone", 6), x, ly + sgn * h * 0.14, z, lr, h * 0.34, lr, l % 2 ? fir : fir2, merge(o, { rx: sgn < 0 ? Math.PI : 0, ry: l * 0.5 })); }
  }
  for (var t = 0; t < 78; t++) {
    var tx = rrange(-85, 85), tz = rrange(-85, 85);
    if (Math.abs(tx) < 5 && Math.abs(tz - 40) < 8) continue;
    if (Math.abs(tx - TX) < 14 && Math.abs(tz - TZ) < 14) continue;
    var th = rrange(10, 24);
    firTree(trees, tx, hgt(tx, tz) - 0.2, tz, th, 1, {});
    if (th > 14) pushSolidCyl(tx, tz, th * 0.03 + 0.2, -2, th);
  }
  for (var it = 0; it < 46; it++) { var ix2 = rrange(-110, 110), iz = rrange(-110, 110); firTree(inv, ix2, LAKE_Y + 0.5, iz, rrange(8, 20), -1, { sway: 0.15, ph: rng() }); }
  mb.build(); trees.build(); inv.build({ bobSpeed: 0.2 });
  // the lake overhead: seen from beneath, rippling and lit
  var lk = new MB({ amb: 1 });
  lk.geo(ugeo("planeN", 6, 6), 0, LAKE_Y, 0, 420, 420, 1, mix(SKY[3], 0xffffff, 0.12), { rx: Math.PI / 2, glow: true });
  lk.build({ nochunk: true });
  var rip = new MB({ amb: 1 });
  for (var rp = 0; rp < 340; rp++) { var rx0 = rrange(-150, 150), rz0 = rrange(-150, 150); rip.quadXY(rx0, LAKE_Y - 0.05, rz0, rrange(0.1, 0.3), rrange(2, 7), mix(SKY[2], 0x000000, 0.3), { rx: Math.PI / 2, ry: rrange(-0.3, 0.3), glow: true, tw: 0.9, ph: rng() }); }
  rip.build({ add: true, twSpeed: 0.8, side: THREE.DoubleSide });
  // the rain, rising
  var rain = new MB({ amb: 1 });
  for (var r = 0; r < 700; r++) { var rx = rrange(-50, 50), rz = rrange(-50, 50); rain.box(rx, hgt(rx, rz), rz, 0.05, rrange(0.9, 1.8), 0.05, mix(0x6aa0a8, 0xc8f0f0, rng()), { fl: 1, glow: true, faces: "px pz" }); }
  rain.build({ flow: [0, 1, 0, LAKE_Y], flowSpeed: 9, add: true, side: THREE.DoubleSide });
  var drops = new PC();
  for (var d = 0; d < 600; d++) { var pu = puddles[d % puddles.length], ang = rng() * TAU, rd = rng() * pu[2]; var dx = pu[0] + Math.cos(ang) * rd, dz = pu[1] + Math.sin(ang) * rd; drops.add(dx, hgt(dx, dz), dz, 0xa8e8e8, rrange(0.04, 0.07), { fl: 1, sway: 0.3 }); }
  drops.build({ flow: [0, 1, 0, LAKE_Y], flowSpeed: rrange(3, 5), bright: 0.8 });
  // the oldest tree, with a stair winding up its trunk toward the water
  var ot = new MB({ light: [0.3, 1, 0.2], amb: 0.5, ao: [0, 40, 0.6, 1.1] });
  var TR = 3.2, PITCH = 8, TURNS = 3.5, R0 = TR + 0.1, R1 = TR + 2.3;
  ot.geo(ugeo("cyl", 0.7, 9), TX, 20, TZ, TR, 42, TR, 0x3a2e26, {});
  for (var rt = 0; rt < 7; rt++) { var ra = rt / 7 * TAU; ot.seg(TX + Math.cos(ra) * 2, 1.5, TZ + Math.sin(ra) * 2, TX + Math.cos(ra) * 7, -0.4, TZ + Math.sin(ra) * 7, 1.1, 0.9, 0x34281f); }
  var topY = PITCH * TURNS, nSteps = Math.round(TURNS * 36);
  for (var s2 = 0; s2 < nSteps; s2++) {
    var a = s2 / 36 * TAU, y = PITCH * a / TAU, rm = (R0 + R1) / 2;
    ot.box(TX + Math.cos(a) * rm, y - 0.12, TZ + Math.sin(a) * rm, R1 - R0, 0.24, 1.0, s2 % 2 ? 0x6a5444 : 0x5a4636, { ry: -a + Math.PI / 2, faces: "px nx py nz pz" });
    if (s2 % 3 === 0) ot.box(TX + Math.cos(a) * (R1 - 0.05), y + 0.55, TZ + Math.sin(a) * (R1 - 0.05), 0.08, 1.1, 0.08, 0x3a2e26, { faces: "px nx pz nz" });
  }
  var hel4 = new GS(); hel4.helix(TX, TZ, R0 - 0.2, R1 + 0.2, 0, PITCH, 0, 0, Math.floor(TURNS) + 1);
  g.add(function (x, z) { var r4 = hel4.sample(x, z); return (r4.on && r4.y <= PITCH * TURNS + 0.05) ? r4.y : null; });
  var lastA = TURNS * TAU;
  // the crown platform, the rope ladder hanging down from the lake
  ot.geo(ugeo("cyl", 1, 12), TX, topY - 0.2, TZ, 7, 0.4, 7, 0x5a4636, {});
  g.disc(TX, TZ, 7, topY, 0);
  for (var br = 0; br < 9; br++) { var ba = br / 9 * TAU + 0.3; ot.seg(TX, topY + rrange(2, 12), TZ, TX + Math.cos(ba) * rrange(9, 15), topY + rrange(6, 16), TZ + Math.sin(ba) * rrange(9, 15), 0.6, 0.6, 0x34281f); }
  for (var cr = 0; cr < 7; cr++) { var ca = cr / 7 * TAU; ot.geo(ugeo("ico"), TX + Math.cos(ca) * rrange(6, 11), topY + rrange(9, 15), TZ + Math.sin(ca) * rrange(6, 11), rrange(4, 6), rrange(2.5, 3.5), rrange(4, 6), fir2, { ry: rng() * 6 }); }
  var LX = TX + 4.5, LZ = TZ + 2;
  for (var rl = topY + 1; rl < LAKE_Y; rl += 0.6) ot.box(LX, rl, LZ, 0.9, 0.06, 0.08, 0xb8a888, { sway: 0.06, ph: 0.5 });
  ot.box(LX - 0.45, (topY + LAKE_Y) / 2 + 0.5, LZ, 0.04, LAKE_Y - topY, 0.04, 0xb8a888, { sway: 0.06, ph: 0.5 });
  ot.box(LX + 0.45, (topY + LAKE_Y) / 2 + 0.5, LZ, 0.04, LAKE_Y - topY, 0.04, 0xb8a888, { sway: 0.06, ph: 0.5 });
  ot.build({ bobSpeed: 0.8 });
  pushSolidCyl(TX, TZ, TR, -2, 44);
  // a glow where the ladder meets the lake; touching the ladder takes you up
  var lg = N2.glowSprite(0xcff8f0, 9); lg.position.set(LX, LAKE_Y - 0.5, LZ); buildGroup.add(lg);
  portalObj(LX, LZ, 0.8, topY - 0.5, topY + 3, onward(), { b: 0.4, e: 0.2 }, "ladder");
  var lad = new THREE.Object3D(); lad.position.set(LX, topY + 1.5, LZ); buildGroup.add(lad);
  sayIx(lad, TX + 2.2, TZ + 4.2, 2.6, ["you could touch the lake from here. it is cold, and it hums", "the rain passes you on its way up, like it knows you", "a rope ladder. somebody climbed up and did not come down"], { kind: "ladder", y: topY });
  // motes of spray drifting
  var mo = new PC();
  for (var m = 0; m < 180; m++) mo.add(rrange(-60, 60), rrange(2, 30), rrange(-60, 60), 0x9fe8e0, rrange(0.1, 0.2), { bob: 1, sway: 1.5, tw: 0.7 });
  mo.build({ bobSpeed: 0.3, bright: 0.7 });
  // a puddle near the start that remembers
  var p0 = new MB({ amb: 1 }), p0x = 3, p0z = 33;
  p0.disc(p0x, hgt(p0x, p0z) + 0.08, p0z, 1.6, 0xd8fff8, 12, { glow: true });
  var p0m = p0.build({ bright: 1.1 });
  sayIx(p0m, p0x, p0z, 2.4, ["you look down into the puddle and see the sky looking up", "the rain leaves it, and you feel lighter for it", "a nest of wet letters at its edge, all of them addressed upward"], { kind: "puddle", y: hgt(p0x, p0z) });
  gate(-30, hgt(-30, -70), -70, 0.5, 0xc8fff0, 0x2a2420);
  gate(46, hgt(46, 20), 20, -1.4, 0xc8fff0, 0x2a2420);
  soundSpots([
    { x: 0, z: 0, r: 999, a: 0.6, b: 1.8, fn: function () { audio.creature("tick", rr(-0.8, 0.8), rr(0.5, 0.9)); } },
    { x: TX, z: TZ, r: 40, a: 5, b: 9, fn: function (pan) { audio.creature("creak", pan, 0.7); } },
    { x: TX, z: TZ, y: topY, dy: 6, r: 14, a: 4, b: 7, fn: function (pan) { audio.creature("hum", pan, 0.8); } }
  ]);
  return zone({ P: P, mood: mood, spawn: { x: 0, z: 40, y: hgt(0, 40), yaw: 0 }, ground: g.fn(), fog: [FOG, 10, 110], sky: SKY[1], bounds: 92, killY: -10, sound: "water" });
});

/* =============================================================================
   5. the humming tundra — a white plain under the aurora, crossed by two lines
   of telephone poles that hum when you come near. where the lines meet, a
   lineman's tower; at the top, a telephone that is still connected.
   ============================================================================= */
reg("humming_pole_tundra", "the humming tundra", 1, ["snow", "aurora", "night", "wires"], function (P, mood) {
  var v = rng();
  var AUR = v < 0.5 ? [0x3aff9a, 0x40c8ff] : [0xff7ac8, 0x6affc0];
  var SKY = [0x101828, 0x2a3c5c, 0x121c3a, 0x060a18];
  var FOG = 0x2c3c58;
  skyDome({ c: SKY, stops: [-0.2, 0.0, 0.2, 0.75], sun: { dir: [0.6, 0.22, 0.75], col: 0x30384a, disc: 0xdfe6f4, size: 0.018, glow: 20 } });
  starfield(420, 420, 0xdfe8ff, 1.0, { minY: 0.12, tw: 0.9 });
  var g = new GS();
  function hgt(x, z) { return Math.sin(x * 0.045 + 1.3) * 0.9 + Math.cos(z * 0.05 - x * 0.012) * 1.1 + Math.sin((x - z) * 0.11) * 0.25; }
  g.add(function (x, z) { return hgt(x, z); });
  var snow = new MB({ light: [0.6, 0.45, 0.65], amb: 0.42 });
  snow.field(0, 0, 320, 320, 36, 36, hgt, function (x, y, z) { return mix(0x8a9ab8, 0xc8d4ec, clamp(0.5 + y * 0.3, 0, 1)); });
  // drifts and stones half under the snow
  for (var d = 0; d < 90; d++) { var dx = rrange(-140, 140), dz = rrange(-140, 140); snow.geo(ugeo("ico"), dx, hgt(dx, dz) - 0.3, dz, rrange(1.5, 5), rrange(0.4, 1.2), rrange(1, 3), rng() < 0.8 ? 0xb8c6e0 : 0x46506a, { ry: rng() * 6 }); }
  snow.build();
  // two lines of poles, crossing at the tower
  var TX = 0, TZ = -70;
  var poles = new MB({ light: [0.5, 0.6, 0.7], amb: 0.5 }), wires = new MB({ amb: 1 }), glints = new PC();
  var wood = 0x2a2430, polePts = [];
  function line(x0, z0, dirA, curve, n, gap) {
    var pts = [], a = dirA, x = x0, z = z0;
    for (var i = 0; i < n; i++) { pts.push([x, z, a]); a += curve; x += Math.sin(a) * gap; z += Math.cos(a) * gap; }
    for (var j = 0; j < pts.length; j++) {
      var p = pts[j], y = hgt(p[0], p[1]), h = 9 + Math.sin(j * 1.7) * 0.6, ca = Math.cos(p[2]), sa = Math.sin(p[2]);
      poles.geo(ugeo("cyl", 0.8, 5), p[0], y + h / 2 - 0.5, p[1], 0.16, h, 0.16, wood, { rz: Math.sin(j * 2.3) * 0.03 });
      poles.box(p[0], y + h - 1, p[1], 2.6, 0.16, 0.16, wood, { ry: p[2] + Math.PI / 2, faces: "px nx py ny pz nz" });
      for (var k = -1; k <= 1; k++) { var ix0 = p[0] + ca * k * 1.1, iz0 = p[1] - sa * k * 1.1; poles.box(ix0, y + h - 0.82, iz0, 0.12, 0.22, 0.12, 0x8a9ab0, { faces: "px nx pz nz py" }); glints.add(ix0, y + h - 0.7, iz0, AUR[1], 0.14, { tw: 0.8 }); }
      pushSolidCyl(p[0], p[1], 0.3, y - 1, y + h);
      polePts.push({ x: p[0], z: p[1], y: y + h });
      if (j > 0) {
        var q = pts[j - 1], qy = hgt(q[0], q[1]) + 9 + Math.sin((j - 1) * 1.7) * 0.6, qca = Math.cos(q[2]), qsa = Math.sin(q[2]);
        for (var w = -1; w <= 1; w += 2) {
          var ax = q[0] + qca * w * 1.1, az = q[1] - qsa * w * 1.1, bx = p[0] + ca * w * 1.1, bz = p[1] - sa * w * 1.1, ay = qy - 0.7, by = y + h - 0.7;
          var mx = (ax + bx) / 2, mz = (az + bz) / 2, my = (ay + by) / 2 - 1.3;
          wires.seg(ax, ay, az, mx, my, mz, 0.035, 0.035, 0x6a7a98, { glow: true }); wires.seg(mx, my, mz, bx, by, bz, 0.035, 0.035, 0x6a7a98, { glow: true });
        }
      }
    }
    return pts;
  }
  var L1 = line(TX + 6, TZ + 4, 0.02, 0.006, 14, 15);                  // past the start, south
  var L2 = line(TX - 150, TZ - 10, Math.PI / 2, -0.008, 22, 15);       // across, west to east
  poles.build(); wires.build(); glints.build({ twSpeed: 2.2, bright: 0.9 });
  // the aurora: tall curtains, swaying, fading upward
  var au = new MB({ amb: 1 });
  for (var c = 0; c < 4; c++) {
    var cz = rrange(-260, -140) + c * 40, cx0 = rrange(-200, -60), segs = 26, base = rrange(45, 70), tall = rrange(50, 90), col = AUR[c % 2], ph = rng();
    for (var sgi = 0; sgi < segs; sgi++) {
      var t0 = sgi / segs, t1 = (sgi + 1) / segs, x0 = cx0 + t0 * 360, x1 = cx0 + t1 * 360;
      var z0 = cz + Math.sin(t0 * 7 + c) * 30, z1 = cz + Math.sin(t1 * 7 + c) * 30;
      var k0 = Math.sin(t0 * Math.PI), k1 = Math.sin(t1 * Math.PI);
      var c0 = mix(0x000000, col, 0.55 * k0), c1 = mix(0x000000, col, 0.55 * k1);
      au.quad(new THREE.Vector3(x0, base, z0), new THREE.Vector3(x1, base, z1), new THREE.Vector3(x1, base + tall, z1), new THREE.Vector3(x0, base + tall, z0), c0, { glow: true, ph: ph, phx: 0.004, sway: 6 }, c1, 0x000000, 0x000000);
    }
  }
  au.build({ add: true, side: THREE.DoubleSide, bobSpeed: 0.12, nofog: true });
  // falling snow, sparse and slow
  var sn = new PC();
  for (var s = 0; s < 700; s++) sn.add(rrange(-60, 60), 22, rrange(-60, 60), 0xe8f0ff, rrange(0.05, 0.1), { fl: 1, sway: 1.2 });
  sn.build({ flow: [0, -1, 0, 24], flowSpeed: 1.2, bobSpeed: 0.4, bright: 0.9 });
  // the lineman's tower where the lines meet: three flights up to a platform
  var tw = new MB({ light: [0.5, 0.6, 0.7], amb: 0.55 });
  var gy = hgt(TX, TZ), PH = 12, plank = 0x4a3a3a, plankL = 0x5e4a46;
  for (var lg = 0; lg < 4; lg++) { var lx = TX + (lg & 1 ? 2.2 : -2.2), lz = TZ + (lg & 2 ? 2.2 : -2.2); tw.box(lx, gy + PH / 2, lz, 0.35, PH + 1.5, 0.35, wood, { faces: "px nx pz nz" }); pushSolidBox(lx, lz, 0.2, 0.2, 0, gy - 1, gy + PH); }
  for (var br = 0; br < 3; br++) { var by2 = gy + 2 + br * 4; tw.seg(TX - 2.2, by2, TZ - 2.2, TX + 2.2, by2 + 3, TZ - 2.2, 0.12, 0.12, wood); tw.seg(TX + 2.2, by2, TZ + 2.2, TX - 2.2, by2 + 3, TZ + 2.2, 0.12, 0.12, wood); }
  // stairs: run along the outside, turning at the corners
  var runs = [[TX + 3.4, TZ + 3.2, Math.PI], [TX + 3.4, TZ - 3.4, -Math.PI / 2], [TX - 3.4, TZ - 3.4, 0]];
  var rise = 0.5, run2 = 0.8, nS = 8, yb = gy;
  for (var ri = 0; ri < runs.length; ri++) {
    var r0 = runs[ri], sx = Math.sin(r0[2]), sz = Math.cos(r0[2]);
    for (var st = 0; st < nS; st++) tw.box(r0[0] + sx * (st + 0.5) * run2, yb + rise * (st + 1) - 0.1, r0[1] + sz * (st + 0.5) * run2, 1.4, 0.2, run2, st % 2 ? plank : plankL, { ry: r0[2], faces: "px nx py nz pz" });
    g.stairs(r0[0], r0[1], 0.7, nS, run2, rise, yb, r0[2]);
    yb += rise * nS;
    // corner landing
    var lx2 = r0[0] + sx * nS * run2, lz2 = r0[1] + sz * nS * run2;
    tw.box(lx2 + sx * 0.5, yb - 0.1, lz2 + sz * 0.5, 1.6, 0.2, 1.6, plankL, {});
    g.rect(lx2 + sx * 0.5, lz2 + sz * 0.5, 0.85, 0.85, yb);
  }
  var topY = yb;
  tw.box(TX, topY - 0.1, TZ, 6, 0.2, 6, plankL, {});
  g.rect(TX, TZ, 3.1, 3.1, topY);
  for (var rl = 0; rl < 4; rl++) { var ra = rl / 4 * TAU; tw.box(TX + Math.sin(ra) * 2.95, topY + 0.55, TZ + Math.cos(ra) * 2.95, rl % 2 ? 0.08 : 6, 0.08, rl % 2 ? 6 : 0.08, wood, { faces: "py px nx pz nz" }); }
  tw.box(TX, topY + 2.6, TZ, 6.4, 0.16, 6.4, wood, {});
  for (var rp = 0; rp < 4; rp++) tw.box(TX + (rp & 1 ? 2.9 : -2.9), topY + 1.3, TZ + (rp & 2 ? 2.9 : -2.9), 0.14, 2.6, 0.14, wood, { faces: "px nx pz nz" });
  // the telephone on its post, a small lamp above it
  tw.box(TX + 1.2, topY + 0.6, TZ - 1.6, 0.14, 1.2, 0.14, wood); tw.box(TX + 1.2, topY + 1.3, TZ - 1.6, 0.5, 0.6, 0.3, 0x2a2a34); tw.box(TX + 1.2, topY + 1.65, TZ - 1.45, 0.46, 0.12, 0.12, 0x101014);
  tw.build();
  var lamp = N2.glowSprite(0xffe0b0, 2.2); lamp.position.set(TX, topY + 2.3, TZ); buildGroup.add(lamp);
  var phone = new THREE.Object3D(); phone.position.set(TX + 1.2, topY + 1.3, TZ - 1.6); buildGroup.add(phone);
  sayIx(phone, TX + 1.2, TZ - 1.6, 2.2, ["the line is warm. someone on the other end is breathing slowly, asleep", "you say hello. the poles carry it away, one by one, into the north", "very far away, a voice: 'are you dreaming too?'", "you listen for a long time. the hum is a kind of answer"], { kind: "phone", y: topY, sound: function () { if (audio.ctx) { audio.creature("hum", 0, 1.3); audio.creature("static", 0, 1); } } });
  // a lit phone booth at the far end of the first line
  var end = L1[L1.length - 1], bx = end[0] + 6, bz = end[1] + 2, bgy = hgt(bx, bz);
  var booth = new MB({ amb: 0.6 });
  booth.box(bx, bgy + 1.3, bz, 1.3, 2.6, 1.3, 0x7a2a36, { faces: "px nx pz py" }); booth.box(bx, bgy + 1.5, bz - 0.66, 1.0, 1.7, 0.04, 0xffe8b8, { glow: true });
  booth.build();
  gate(bx, bgy, bz - 0.7, 0, 0xfff0c8, 0x7a2a36, undefined, { w: 1.0, h: 2.2, glow: 6 });
  gate(TX + 2.2, topY, TZ + 2.95, Math.PI, 0xd0ffe8, wood, undefined, { w: 1.1, h: 2.2, glow: 3 });
  var stoneIx = new MB({ amb: 0.7 }), sxx = 4, szz = 8;
  stoneIx.geo(ugeo("ico"), sxx, hgt(sxx, szz) + 0.2, szz, 0.7, 0.5, 0.6, 0x46506a, {}); stoneIx.box(sxx, hgt(sxx, szz) + 0.75, szz, 0.5, 0.05, 0.35, 0xe8e2d0, { glow: true, ry: 0.4 });
  var stm = stoneIx.build();
  sayIx(stm, sxx, szz, 2.2, ["a note weighed down by a stone: 'follow the wires. they know who is awake'", "the ink has frozen. it says the same thing twice"], { kind: "note", y: hgt(sxx, szz) });
  var spots = [];
  for (var pp = 0; pp < polePts.length; pp++) { (function (pt, f) { spots.push({ x: pt.x, z: pt.z, r: 11, a: 2.2, b: 3.4, fn: function (pan, k) { audio.creature("hum", pan, f); if (k > 0.6) audio.tone(f * 300, "sine", 0.02, 0.4, 1.6, pan); } }); })(polePts[pp], 0.9 + (pp % 5) * 0.12); }
  soundSpots(spots);
  return zone({ P: P, mood: mood, spawn: { x: 2, z: 30, y: hgt(2, 30), yaw: Math.PI * 0.02 }, ground: g.fn(), fog: [FOG, 20, 190], sky: SKY[1], bounds: 150, sound: "wind" });
});

/* =============================================================================
   6. the library that goes down — a well of shelves with one long walkway
   spiralling down its wall. it does not end: every turn is the turn before.
   a bridge on each turn leads to the column of light in the middle.
   ============================================================================= */
reg("endless_spiral_library", "the library that goes down", 0, ["library", "spiral", "interior", "endless"], function (P, mood) {
  var v = rng();
  var FOG = v < 0.5 ? 0x1c120c : 0x10121a, WALL = v < 0.5 ? 0xd8b898 : 0xb8c0d8, PLANK = v < 0.5 ? 0x6a4a34 : 0x4a4a5a, PLANK2 = v < 0.5 ? 0x5a3e2c : 0x3e3e4c, RAIL = v < 0.5 ? 0x3a261a : 0x2a2a34;
  var LIGHT = v < 0.5 ? 0x3a2812 : 0x1e2838;
  var PITCH = 9, R0 = 10.5, R1 = 16.6, RW = 17.2, K0 = -4, K1 = 4, BRIDGE_A = Math.PI / 2;
  skyDome({ c: [FOG, FOG, FOG, FOG] });
  var g = new GS();
  g.helix(0, 0, R0 - 0.1, R1 + 0.3, 0, PITCH, 0, K0 - 1, K1 + 1);
  // shelves: one tall cylinder of books, repeating every turn
  var spines = [0x6a2a2a, 0x2a4a3a, 0x8a6a2a, 0x2a3458, 0xc8b898, 0x5a2a4a, 0x3a5a5a, 0x7a4a2a];
  var btex = tex(function (x, s) {
    x.fillStyle = "#1a120c"; x.fillRect(0, 0, s, s);
    var rowH = s / 3;
    for (var r = 0; r < 3; r++) {
      var y0 = r * rowH, xx = 0;
      while (xx < s) { var w = 2 + (rng() * 6 | 0), h = rowH * (0.6 + rng() * 0.32); if (rng() < 0.08) { xx += w + 2; continue; } x.fillStyle = hex(new THREE.Color(spines[(rng() * spines.length) | 0]).offsetHSL(0, 0, rrange(-0.06, 0.06))); x.fillRect(xx, y0 + rowH - 4 - h, w, h); if (rng() < 0.4) { x.fillStyle = "rgba(230,200,140,0.5)"; x.fillRect(xx, y0 + rowH - 4 - h * 0.7, w, 1); } xx += w; }
      x.fillStyle = "#4a3020"; x.fillRect(0, y0 + rowH - 4, s, 4);
    }
  });
  var wall = new MB({ amb: 1 });
  var H = PITCH * (K1 - K0 + 1);
  wall.geo(ugeo("tubeN", (K1 - K0 + 1) * 3, 48), 0, (K0 + K1) / 2 * PITCH + PITCH / 2, 0, RW, H, RW, WALL, { glow: true, flipN: true, uvs: [48, H / 3] });
  wall.build({ map: btex, side: THREE.BackSide, nochunk: true });
  // the walkway: one long ramp of planks along the wall, with a rail at its inner edge
  var wk = new MB({ light: [0.2, 1, 0.1], amb: 0.62 }), SEG = 48;
  function hp(a, r, k) { return new THREE.Vector3(Math.cos(a) * r, PITCH * a / TAU + k * PITCH, Math.sin(a) * r); }
  for (var k = K0; k <= K1; k++) for (var i = 0; i < SEG; i++) {
    var a0 = i / SEG * TAU, a1 = (i + 1) / SEG * TAU, col = i % 2 ? PLANK : PLANK2;
    var o0 = hp(a0, R1 + 0.2, k), o1 = hp(a1, R1 + 0.2, k), n0 = hp(a0, R0, k), n1 = hp(a1, R0, k);
    wk.quad(n0, n1, o1, o0, col, {});
    var d0 = n0.clone(), d1 = n1.clone(); d0.y -= 0.5; d1.y -= 0.5;
    wk.quad(d0, d1, n1, n0, RAIL, { amb: 0.5 });
    var u0 = o0.clone(), u1 = o1.clone(); u0.y -= 0.5; u1.y -= 0.5; wk.quad(u0, u1, d1, d0, 0x24160e, {});
    var r0 = hp(a0, R0 + 0.12, k), r1 = hp(a1, R0 + 0.12, k);
    wk.seg(r0.x, r0.y + 1.0, r0.z, r1.x, r1.y + 1.0, r1.z, 0.09, 0.09, RAIL);
    if (i % 2 === 0) wk.box(r0.x, r0.y + 0.5, r0.z, 0.08, 1.0, 0.08, RAIL, { faces: "px nx pz nz" });
  }
  // a bridge on every turn to the middle, and a round reading platform around the light
  var bridgeY = PITCH * BRIDGE_A / TAU;
  for (var kb = K0; kb <= K1; kb++) {
    var by = bridgeY + kb * PITCH;
    wk.box(0, by - 0.15, (3 + R0 + 0.2) / 2, 2.2, 0.3, R0 + 0.2 - 3, PLANK, { faces: "px nx py ny" });
    for (var bs = -1; bs <= 1; bs += 2) wk.seg(bs * 1.05, by + 1.0, 3, bs * 1.05, by + 1.0, R0, 0.08, 0.08, RAIL);
    wk.geo(ugeo("cyl", 1, 16), 0, by - 0.15, 0, 3.1, 0.3, 3.1, PLANK2, {});
    g.rect(0, (3 + R0) / 2, 1.1, (R0 - 3) / 2 + 0.2, by); g.disc(0, 0, 3.1, by, 1.35);
    // a reading desk on the walkway of every turn, opposite the bridge
    var da = Math.PI * 1.25, dr = 15.6, dy = PITCH * da / TAU + kb * PITCH, dx = Math.cos(da) * dr, dz = Math.sin(da) * dr;
    wk.box(dx, dy + 0.75, dz, 1.6, 0.08, 0.8, 0x4a3020, { ry: -da + Math.PI / 2 });
    wk.box(dx, dy + 0.37, dz, 1.4, 0.74, 0.6, 0x3a2418, { ry: -da + Math.PI / 2, faces: "px nx pz nz" });
    wk.box(dx, dy + 0.82, dz, 0.6, 0.04, 0.42, 0xf0e2c4, { ry: -da + Math.PI / 2, glow: true });
    wk.geo(ugeo("ico"), dx + 0.5, dy + 1.0, dz + 0.3, 0.16, 0.16, 0.16, 0xa8ff9a, { glow: true });
  }
  wk.build();
  // the column of light in the well, and lamps hanging on long chains
  var lc = new MB({ amb: 1 });
  lc.geo(ugeo("tube", 0, 10), 0, (K0 + K1) / 2 * PITCH, 0, 1.25, H + 40, 1.25, LIGHT, { glow: true });
  lc.geo(ugeo("tube", 0, 10), 0, (K0 + K1) / 2 * PITCH, 0, 0.5, H + 40, 0.5, mix(LIGHT, 0xffffff, 0.35), { glow: true });
  lc.build({ add: true, nochunk: true, side: THREE.DoubleSide });
  var lamps = new MB({ amb: 1 }), lampPC = new PC();
  for (var la = 0; la < 5; la++) {
    var ang = la / 5 * TAU + 0.4, lr = rrange(5, 8), lx = Math.cos(ang) * lr, lz = Math.sin(ang) * lr, ly = rrange(1, 8);
    lamps.box(lx, (K0 + K1) / 2 * PITCH, lz, 0.04, H + 40, 0.04, 0x2a1a10, {});
    for (var kl = K0; kl <= K1; kl++) { lamps.geo(ugeo("oct"), lx, ly + kl * PITCH, lz, 0.32, 0.45, 0.32, 0xffd080, { glow: true }); lampPC.add(lx, ly + kl * PITCH, lz, 0xffc070, 1.4, {}); }
  }
  lamps.build({ nochunk: true }); lampPC.build({ bright: 0.7 });
  // pages falling slowly down the well, turning
  var pg = new MB({ amb: 1 });
  for (var p = 0; p < 90; p++) { var pa = rng() * TAU, pr = rrange(2, 9.5); pg.box(Math.cos(pa) * pr, K1 * PITCH + 10, Math.sin(pa) * pr, 0.28, 0.01, 0.36, 0xe8dcc0, { fl: 1, sway: 0.8, glow: true, rx: rrange(-0.6, 0.6), rz: rrange(-0.6, 0.6) }); }
  pg.build({ flow: [0, -1, 0, H + 20], flowSpeed: 1.1, bobSpeed: 0.5 });
  var dust = new PC();
  for (var d = 0; d < 200; d++) { var da2 = rng() * TAU, dr2 = rrange(1.5, 16); dust.add(Math.cos(da2) * dr2, rrange(-20, 20), Math.sin(da2) * dr2, 0xffe0b0, rrange(0.05, 0.1), { bob: 0.6, sway: 0.8, tw: 0.6 }); }
  dust.build({ bobSpeed: 0.25, bright: 0.8 });
  // the endless part: a turn of the walkway is the turn before
  var wraps = 0, said = {};
  var LINES = { "-2": "you have passed this desk before", "-4": "the numbers on the spines are counting down", "-7": "there is no bottom. there is only further", "-11": "you could stop here. no one would mind", "2": "you are climbing back toward something", "5": "the top is a rumour the books tell each other" };
  anim(function () {
    if (phase !== "play") return;
    // the rail and the shelves hold you (softly, without pulling you away)
    var r = Math.sqrt(pos.x * pos.x + pos.z * pos.z), lim = null;
    var lv = (((pos.y - bridgeY) % PITCH) + PITCH * 1.5) % PITCH - PITCH / 2, atBridge = Math.abs(lv) < 0.45;
    var inLane = pos.z > 0 && Math.abs(pos.x) < 1.0;
    if (r > R1 - 0.2) lim = R1 - 0.2;
    else if (grounded && r < R0 + 0.35 && r > 2.9) {
      if (atBridge && pos.z > 0 && Math.abs(pos.x) < 1.6) { if (r > 3.3) pos.x = clamp(pos.x, -0.95, 0.95); else if (!inLane) lim = 2.9; }
      else if (atBridge && r < 3.3) lim = 2.9;
      else lim = R0 + 0.35;
    }
    if (lim != null && r > 0.01) { var k2 = lim / r; pos.x *= k2; pos.z *= k2; }
    if (camera) { camera.position.x = pos.x; camera.position.z = pos.z; }
    if (!grounded) return;
    var sh = 0;
    if (pos.y < -PITCH * 0.5) sh = PITCH; else if (pos.y > PITCH * 0.5 + 0.6) sh = -PITCH;
    if (!sh) return;
    pos.y += sh; if (camera) camera.position.y += sh;
    wraps -= sh / PITCH;
    var key = String(wraps);
    if (LINES[key] && !said[key]) { said[key] = 1; beingSpeak(LINES[key]); }
  });
  // the desk you keep coming back to, and the light
  var deskA = Math.PI * 1.25, desk = new THREE.Object3D(); desk.position.set(Math.cos(deskA) * 15.6, PITCH * deskA / TAU + 1, Math.sin(deskA) * 15.6); buildGroup.add(desk);
  sayIx(desk, Math.cos(deskA) * 15.6, Math.sin(deskA) * 15.6, 2.4, ["the book is open to the page you are reading", "someone has underlined one line: 'you are allowed to stop'", "the lamp is still warm. the chair is pulled out for you", "in the margin, small: 'i came down this far too'"], { kind: "desk", sound: function () { if (audio.ctx) audio.creature("rustle", 0, 1); } });
  var lightIx = new THREE.Object3D(); lightIx.position.set(0, bridgeY + 1, 0); buildGroup.add(lightIx);
  sayIx(lightIx, 0, 2.2, 1.6, ["the light comes from below. it always has", "it is warm on your face, like a window in the morning", "step into it, if you want to be somewhere else"], { kind: "light", sound: function () { if (audio.ctx) audio.creature("hum", 0, 1.2); } });
  portalObj(0, 0, 1.1, -999, 999, onward(), { b: 0.5, e: 0.1 }, "light");
  soundSpots([
    { x: 0, z: 0, r: 999, a: 3, b: 7, fn: function () { audio.creature("rustle", rr(-0.8, 0.8), rr(0.7, 1.2)); } },
    { x: 0, z: 0, r: 999, a: 14, b: 26, fn: function () { audio.gong(rrange(55, 73), rr(-0.4, 0.4)); } }
  ]);
  var sa = 0.6, sr = 13.6;
  return zone({ P: P, mood: mood, spawn: { x: Math.cos(sa) * sr, z: Math.sin(sa) * sr, y: PITCH * sa / TAU, yaw: yawTo(Math.sin(sa), -Math.cos(sa)) }, ground: g.fn(), fog: [FOG, 6, 48], sky: FOG, killY: -40, sound: "choir" });
});

/* =============================================================================
   7. the festival nobody came to — a slow river at dusk, crowded with floating
   lanterns; stalls lit and waiting on the banks; an arched bridge; silent
   fireworks. downstream, a lantern tree on an island in the lake.
   ============================================================================= */
var FW_VERT = [
  "attribute vec3 aDir; attribute vec3 aCol; attribute float aPh;",
  "uniform float uT; uniform vec2 uFogDist; uniform float uScale;",
  "varying vec3 vCol; varying float vA;",
  "void main() {",
  "  float k = fract(uT / 9.0 + aPh) * 1.8;",
  "  float on = step(k, 1.0); k = min(k, 1.0);",
  "  vec3 p = position + aDir * (16.0 * (1.0 - exp(-4.0 * k))) + vec3(0.0, -7.0 * k * k, 0.0);",
  "  vec4 mv = modelViewMatrix * vec4(p, 1.0); float d = -mv.z;",
  "  vA = on * (1.0 - k) * (1.0 - k) * smoothstep(0.0, 0.03, k);",
  "  vCol = aCol;",
  "  gl_PointSize = clamp(uScale * 0.5 / max(1.0, d) * (1.0 - k * 0.5), 1.0, 6.0);",
  "  gl_Position = projectionMatrix * mv;",
  "}"].join("\n");
var FW_FRAG = ["varying vec3 vCol; varying float vA;", "void main() { if (vA < 0.01) discard; gl_FragColor = vec4(vCol * vA, 1.0); }"].join("\n");
function fireworks(n, area) {
  var P2 = [], D = [], C = [], H = [];
  var cols = [0xffc070, 0xff8aa0, 0xa8d8ff, 0xfff0c0, 0xc8a0ff];
  for (var b = 0; b < n; b++) {
    var cx = area.x + rrange(-area.w, area.w), cy = area.y + rrange(0, area.h), cz = area.z + rrange(-area.d, area.d), ph = rng(), col = new THREE.Color(pick(cols));
    for (var i = 0; i < 90; i++) {
      var u = rng() * 2 - 1, th = rng() * TAU, sr = Math.sqrt(1 - u * u), sp = 0.75 + rng() * 0.25;
      P2.push(cx, cy, cz); D.push(Math.cos(th) * sr * sp, u * sp, Math.sin(th) * sr * sp); C.push(col.r, col.g, col.b); H.push(ph);
    }
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P2, 3)); g.setAttribute("aDir", new THREE.Float32BufferAttribute(D, 3));
  g.setAttribute("aCol", new THREE.Float32BufferAttribute(C, 3)); g.setAttribute("aPh", new THREE.Float32BufferAttribute(H, 1));
  var m = new THREE.ShaderMaterial({ vertexShader: FW_VERT, fragmentShader: FW_FRAG, uniforms: { uT: UT, uFogDist: U_fogDist, uScale: { value: 150 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  var pts = new THREE.Points(g, m); pts.frustumCulled = false; buildGroup.add(pts); return pts;
}

reg("unpeopled_lantern_river", "the festival nobody came to", 0, ["river", "lanterns", "festival", "dusk"], function (P, mood) {
  var v = rng();
  var SKY = v < 0.5 ? [0x1a1426, 0xd88a5a, 0x5a3a6a, 0x141634] : [0x10141e, 0xc0708a, 0x3a3a6a, 0x0e1230];
  var FOG = v < 0.5 ? 0x4a3048 : 0x3a2c4c;
  skyDome({ c: SKY, stops: [-0.2, 0.0, 0.1, 0.6], sun: { dir: [0, 0.02, 1], col: 0x6a3020, glow: 6 } });
  starfield(160, 400, 0xfff0e0, 0.9, { minY: 0.3 });
  var g = new GS();
  var RW = 11, BANK = 1.4, Z0 = -90, Z1 = 150, LAKE = 150;
  // banks: stone embankments falling to the water
  var mb = new MB({ light: [0.2, 0.8, 0.6], amb: 0.58 });
  for (var sd = -1; sd <= 1; sd += 2) {
    mb.box(sd * (RW + 22), BANK - 0.2, (Z0 + Z1) / 2, 44, 0.4, Z1 - Z0, 0x3a3240, { faces: "py" });
    mb.box(sd * (RW + 0.3), BANK / 2 - 0.4, (Z0 + Z1) / 2, 0.6, BANK + 0.8, Z1 - Z0, 0x3a3038, { faces: sd < 0 ? "px py" : "nx py" });
    g.rect(sd * (RW + 22), (Z0 + Z1) / 2, 22, (Z1 - Z0) / 2, BANK);
  }
  // paving lines on the bank
  for (var pz = Z0; pz < Z1; pz += 3) for (var sd2 = -1; sd2 <= 1; sd2 += 2) mb.box(sd2 * (RW + 6), BANK + 0.01, pz, 10, 0.02, 0.06, 0x3a3240, { faces: "py" });
  // the lake downstream, and the island with its lantern tree
  var IX = -14, IZ = LAKE + 46, IR = 9;
  mb.geo(ugeo("cyl", 0.85, 16), IX, 0.3, IZ, IR, 1.6, IR, 0x3a3436, {});
  g.disc(IX, IZ, IR - 0.3, 1.1);
  // a pier from the east bank out to the island
  var pierX0 = RW + 2, pierZ = IZ;
  for (var px = IX + IR - 1; px < RW + 6; px += 1.2) mb.box(px, 1.1, pierZ, 1.1, 0.16, 2.4, 0x5a4636, { faces: "px nx py pz nz" });
  for (var pp = IX + IR; pp < RW + 6; pp += 4) for (var ps = -1; ps <= 1; ps += 2) mb.geo(ugeo("cyl", 1, 5), pp, 0.2, pierZ + ps * 1.1, 0.14, 2.0, 0.14, 0x3a2a22, {});
  g.rect((IX + IR - 1 + RW + 6) / 2, pierZ, (RW + 6 - (IX + IR - 1)) / 2, 1.2, 1.18);
  // east bank continues around the lake to the pier
  mb.box(RW + 22, BANK - 0.2, LAKE + 40, 44, 0.4, 80, 0x4a4048, { faces: "py" }); g.rect(RW + 22, LAKE + 40, 22, 40, BANK);
  mb.box(RW + 0.3, BANK / 2 - 0.4, LAKE + 40, 0.6, BANK + 0.8, 80, 0x3a3038, { faces: "nx py" });
  // water
  waterSheet({ x: 0, z: 60, w: 2 * RW, d: 400, seg: 4, col: 0x2a2440, hi: [0x2a2030, 0x3a2a30, 0x201a2a], n: 260, len: [1, 4], flow: [0, 1], wrap: 400, speed: 1.2, thick: 0.1 });
  waterSheet({ x: -60, z: LAKE + 70, w: 140, d: 140, col: 0x2a2440, hi: [0x2a2030, 0x3a2a30], n: 160, len: [1, 4], angle: Math.PI / 2, thick: 0.1 });
  // the stone bridge: an arch you can walk over
  var BZ = 30, SPAN = RW + 3, RISE = 3.2;
  function archY(x) { var t = (x + SPAN) / (2 * SPAN); return BANK + RISE * Math.sin(Math.PI * clamp(t, 0, 1)); }
  for (var bx = -SPAN; bx < SPAN; bx += 1.0) { var y0 = archY(bx), y1 = archY(bx + 1.0); mb.seg(bx, y0 - 0.3, BZ, bx + 1.0, y1 - 0.3, BZ, 3.6, 0.6, 0x6a5a62, { caps: true }); }
  for (var bb = -SPAN + 1; bb < SPAN; bb += 2) for (var bs = -1; bs <= 1; bs += 2) mb.box(bb, archY(bb) + 0.4, BZ + bs * 1.7, 0.18, 0.8, 0.18, 0x5a4a52, { faces: "px nx pz nz py" });
  arch(mb, -RW, BZ - 1.6, RW, BZ - 1.6, -0.6, RISE + 0.6, 10, 0.5, 0x4a3e48); arch(mb, -RW, BZ + 1.6, RW, BZ + 1.6, -0.6, RISE + 0.6, 10, 0.5, 0x4a3e48);
  g.add(function (x, z) { return (Math.abs(z - BZ) < 1.75 && Math.abs(x) < SPAN) ? archY(x) : null; });
  // garlands of paper lanterns between poles along both banks
  var gl = new MB({ amb: 1 }), glP = new PC();
  var LCOL = [0xff9a50, 0xffc870, 0xff6a5a, 0xfff0d0];
  for (var s3 = -1; s3 <= 1; s3 += 2) {
    var prev = null;
    for (var lz = Z0 + 4; lz < Z1; lz += 12) {
      var lx = s3 * (RW + 2.2);
      mb.geo(ugeo("cyl", 1, 5), lx, BANK + 2.6, lz, 0.1, 5.2, 0.1, 0x2a2026, {});
      if (prev) for (var li = 1; li < 6; li++) { var t = li / 6, gx = lx, gz = prev + (lz - prev) * t, gy = BANK + 5 - Math.sin(Math.PI * t) * 1.4, lc = LCOL[(li + lz) % 4]; gl.geo(ugeo("cyl", 0.8, 6), gx, gy, gz, 0.22, 0.42, 0.22, lc, { glow: true, sway: 0.04, ph: lz * 0.01 }); if (li % 3 === 1) glP.add(gx, gy, gz, lc, 0.5, {}); }
      prev = lz;
    }
  }
  // the empty stalls along the west bank
  var stallX = -(RW + 8);
  for (var st = 0; st < 9; st++) {
    var sz = Z0 + 12 + st * 13 + rrange(-2, 2), awn = pick([0x8a2a3a, 0x2a4a6a, 0x7a5a2a, 0x3a5a3a]);
    mb.box(stallX, BANK + 0.5, sz, 1.6, 1.0, 3.4, 0x5a4030, { faces: "px nx py pz nz" });
    for (var c4 = 0; c4 < 4; c4++) mb.box(stallX + (c4 & 1 ? 0.75 : -0.75), BANK + 1.4, sz + (c4 & 2 ? 1.6 : -1.6), 0.1, 2.8, 0.1, 0x3a2a22, { faces: "px nx pz nz" });
    mb.box(stallX + 0.2, BANK + 2.9, sz, 2.2, 0.08, 3.8, awn, { rz: -0.25 });
    pushSolidBox(stallX, sz, 0.8, 1.7, 0, BANK, BANK + 1.0);
    for (var gd = 0; gd < 5; gd++) gl.box(stallX + rrange(-0.5, 0.5), BANK + 1.08, sz + rrange(-1.4, 1.4), 0.2, 0.16, 0.2, pick([0xffd8a0, 0xff9aa8, 0xa8e0ff, 0xfff0c0]), { glow: true });
    gl.geo(ugeo("oct"), stallX + 0.5, BANK + 2.4, sz, 0.2, 0.3, 0.2, 0xffd890, { glow: true }); glP.add(stallX + 0.5, BANK + 2.4, sz, 0xffc070, 0.8, {});
  }
  // the lantern tree on the island; steps circle its trunk to a platform
  var TRK = 0x3a2a26, TH = 16;
  mb.geo(ugeo("cyl", 0.6, 7), IX, 1.1 + TH / 2, IZ, 1.0, TH, 1.0, TRK, {});
  for (var tb = 0; tb < 10; tb++) { var ta = tb / 10 * TAU + rng(), tl = rrange(4, 8), ty = 1.1 + rrange(7, TH), ex = IX + Math.cos(ta) * tl, ez = IZ + Math.sin(ta) * tl, ey = ty + rrange(1, 4); mb.seg(IX, ty, IZ, ex, ey, ez, 0.3, 0.3, TRK); for (var hl = 0; hl < 4; hl++) { var hx = IX + (ex - IX) * (0.4 + hl * 0.2), hz = IZ + (ez - IZ) * (0.4 + hl * 0.2), hy = ty + (ey - ty) * (0.4 + hl * 0.2) - 0.9; gl.geo(ugeo("cyl", 0.8, 6), hx, hy, hz, 0.25, 0.45, 0.25, pick(LCOL), { glow: true, sway: 0.05 }); if (hl % 2) glP.add(hx, hy, hz, 0xffb060, 0.6, {}); } }
  var PLAT = 5.5, nst = 14, TURN = 0.8, PR7 = 2.6;
  for (var tsx = 0; tsx < nst; tsx++) { var sa2 = (tsx + 0.5) / nst * TAU * TURN, sr2 = 3.45; mb.box(IX + Math.cos(sa2) * sr2, 1.1 + (tsx + 1) * (PLAT - 1.1) / nst - 0.1, IZ + Math.sin(sa2) * sr2, 1.6, 0.2, 1.2, 0x6a5444, { ry: -sa2 + Math.PI / 2 }); }
  var hel7 = new GS(); hel7.helix(IX, IZ, PR7 + 0.05, 4.3, 1.1, (PLAT - 1.1) / TURN, 0, 0, 0);
  g.add(function (x, z) { var r7 = hel7.sample(x, z); return (r7.on && r7.y <= PLAT + 0.05) ? r7.y : null; });
  mb.geo(ugeo("cyl", 1, 12), IX, PLAT - 0.15, IZ, PR7, 0.3, PR7, 0x6a5444, {});
  g.disc(IX, IZ, PR7 + 0.05, PLAT);
  pushSolidCyl(IX, IZ, 1.0, 0, PLAT + 4);
  // willows along the east bank, their long hair hanging toward the water; benches between
  var wil = new MB({ light: [0.2, 0.8, 0.6], amb: 0.5 });
  for (var wl = 0; wl < 9; wl++) {
    var wx = RW + rrange(5, 9), wz = Z0 + 16 + wl * 15 + rrange(-3, 3), wh = rrange(5, 7);
    wil.geo(ugeo("cyl", 0.55, 6), wx, BANK + wh / 2, wz, 0.4, wh, 0.4, 0x2a2224, { rz: rrange(-0.15, 0.05) });
    pushSolidCyl(wx, wz, 0.45, BANK - 1, BANK + wh);
    for (var wb = 0; wb < 14; wb++) { var wa = rng() * TAU, wr = rrange(0.8, 3.4), hx2 = wx + Math.cos(wa) * wr, hz2 = wz + Math.sin(wa) * wr, top = BANK + wh + rrange(-0.4, 0.8) - wr * 0.25, len = rrange(2.2, 4.2); wil.box(hx2, top - len / 2, hz2, 0.12, len, 0.12, mix(0x2a4a3a, 0x4a6a4a, rng()), { sway: 0.12, ph: wz * 0.02 + wb * 0.01, faces: "px nx pz nz" }); }
    wil.geo(ugeo("ico"), wx, BANK + wh + 0.4, wz, 3.2, 1.2, 3.2, 0x2e4a3a, { ry: rng() * 6 });
    if (wl % 2) { var bz2 = wz + 7; wil.box(RW + 4, BANK + 0.45, bz2, 0.5, 0.08, 1.8, 0x5a4030, {}); wil.box(RW + 4.22, BANK + 0.75, bz2, 0.06, 0.5, 1.8, 0x5a4030, {}); for (var bl = -1; bl <= 1; bl += 2) wil.box(RW + 4, BANK + 0.22, bz2 + bl * 0.75, 0.45, 0.45, 0.06, 0x3a2a22, {}); }
  }
  // paper lamps on posts along the east bank, and low hills far off on both sides
  for (var lpz = Z0 + 8; lpz < Z1 + 60; lpz += 14) { var lpx = RW + 13; wil.box(lpx, BANK + 1.1, lpz, 0.1, 2.2, 0.1, 0x2a2026, { faces: "px nx pz nz" }); gl.box(lpx, BANK + 2.35, lpz, 0.42, 0.5, 0.42, pick(LCOL), { glow: true, faces: "px nx py pz nz" }); glP.add(lpx, BANK + 2.35, lpz, 0xffc070, 0.7, {}); }
  for (var hl2 = 0; hl2 < 16; hl2++) { var hs2 = hl2 % 2 ? 1 : -1, hx3 = hs2 * rrange(70, 130), hz3 = rrange(-140, 260), hw3 = rrange(30, 60); wil.geo(ugeo("ico"), hx3, -2, hz3, hw3, rrange(8, 18), hw3 * 0.8, mix(0x1e1626, 0x2a2232, rng()), { ry: rng() * 6 }); }
  wil.build({ bobSpeed: 0.6 });
  mb.build(); gl.build({ bobSpeed: 0.9 }); glP.build({ bright: 0.5 });
  // the lanterns on the river, drifting downstream, each with its own reflection
  var fl = new MB({ amb: 1 }), rf = new MB({ amb: 1 }), FLOW = 260;
  for (var f = 0; f < 110; f++) {
    var fx = rrange(-RW + 1, RW - 1), ph = rng(), lc2 = pick(LCOL), sc = rrange(0.7, 1.2);
    fl.box(fx, 0.3 * sc, Z0 - 20, 0.42 * sc, 0.5 * sc, 0.42 * sc, lc2, { fl: 1, ph: ph, bob: 0.05, glow: true, faces: "px nx py pz nz" });
    fl.box(fx, 0.06, Z0 - 20, 0.6 * sc, 0.08, 0.6 * sc, 0x3a2a22, { fl: 1, ph: ph, bob: 0.05, faces: "py" });
    rf.quadXY(fx, 0.02, Z0 - 20 + 0.9, 0.35 * sc, 2.4, mix(lc2, 0x000000, 0.55), { fl: 1, ph: ph, rx: -Math.PI / 2, glow: true, tw: 0.4 });
  }
  fl.build({ flow: [0, 0, 1, FLOW], flowSpeed: 1.2, bobSpeed: 1.2 });
  rf.build({ flow: [0, 0, 1, FLOW], flowSpeed: 1.2, add: true, twSpeed: 3 });
  // those already arrived, gathered on the lake
  var lk = new MB({ amb: 1 });
  for (var lq = 0; lq < 70; lq++) { var la = rng() * TAU, ld = rrange(10, 40), qx = IX - 20 + Math.cos(la) * ld * 1.4, qz = IZ + Math.sin(la) * ld; if (qx > RW - 1) continue; lk.box(qx, 0.3, qz, 0.42, 0.5, 0.42, pick(LCOL), { bob: 0.06, glow: true, faces: "px nx py pz nz" }); }
  lk.build({ bobSpeed: 1.0 });
  // silent fireworks, far over the lake
  fireworks(7, { x: -40, y: 40, z: LAKE + 80, w: 60, h: 30, d: 30 });
  // a lantern you can let go of; a bell nobody answers; a mask on a hook
  var rel = new MB({ amb: 1 }), relX = RW + 3, relZ = -40;
  rel.box(relX, BANK + 0.3, relZ, 0.45, 0.55, 0.45, 0xffd8a0, { glow: true });
  var relM = rel.build({ nochunk: true });
  var rising = 0, ry0 = BANK + 0.3;
  sayIx(relM, relX, relZ, 2.2, ["you write nothing on it. it rises anyway", "it goes up to join the others", "the sky takes it gently, like a letter"], { kind: "lantern", y: BANK, on: function () { rising = 1; if (relM) relM.position.y = 0; } });
  anim(function (dt) { if (rising && relM) { relM.position.y += dt * 1.6; relM.position.x += Math.sin(T() * 0.7) * dt * 0.3; if (relM.position.y > 60) { relM.position.y = 0; rising = 0; } } });
  var mask = new MB({ amb: 0.9 }), maskZ = Z0 + 12 + 6 * 13;
  mask.sph(stallX - 0.2, BANK + 2.0, maskZ + 1.7, 0.22, 0.28, 0.08, 0xf0e8dc, {}); mask.box(stallX - 0.28, BANK + 2.05, maskZ + 1.62, 0.05, 0.02, 0.02, 0x2a2026, { glow: true }); mask.box(stallX - 0.12, BANK + 2.05, maskZ + 1.62, 0.05, 0.02, 0.02, 0x2a2026, { glow: true });
  var maskM = mask.build({ nochunk: true });
  sayIx(maskM, stallX - 0.2, maskZ + 1.7, 2.4, ["a mask of a smiling no one. it is warm inside", "you hold it up. the river looks different through it: full of people", "you put it back. they go away again"], { kind: "mask", y: BANK });
  var tree = new THREE.Object3D(); tree.position.set(IX, PLAT + 1, IZ); buildGroup.add(tree);
  sayIx(tree, IX - 1.5, IZ + 1.4, 2.6, ["every lantern on the tree has a name on it. one of them is yours", "the festival was for someone. you think it was for you"], { kind: "tree", y: PLAT });
  gate(IX - 1.0, PLAT, IZ - 2.1, Math.PI, 0xffd8a0, TRK, undefined, { w: 1.1, h: 2.2 });
  gate(-(RW + 14), BANK, Z0 + 4, 0, 0xffe0b8, 0x3a2a22);
  soundSpots([
    { x: 0, z: 60, r: 999, a: 2.5, b: 6, fn: function () { audio.noise(0.9, "lowpass", 600, 300, 0.025, rr(-0.5, 0.5)); } },
    { x: -40, z: LAKE + 80, r: 999, a: 9, b: 16, fn: function () { audio.creature("chime", rr(-0.6, 0.6), rr(0.5, 0.8)); } }
  ]);
  return zone({ P: P, mood: mood, spawn: { x: RW + 4, z: Z0 + 10, y: BANK, yaw: Math.PI * 1.02 }, ground: g.fn(), fog: [FOG, 18, 150], sky: SKY[1], killY: -5, sound: "water" });
});

/* =============================================================================
   8. the lighthouse of other windows — a headland at night; the tower is built
   of lit windows, every one somebody else's evening. a stair winds around it
   to the lamp, which turns slowly over the black sea.
   ============================================================================= */
reg("lighthouse_of_windows", "the lighthouse of other windows", 1, ["lighthouse", "sea", "night", "windows"], function (P, mood) {
  var v = rng();
  var SKY = v < 0.5 ? [0x04060c, 0x16243a, 0x0a1226, 0x020408] : [0x06060c, 0x1e1a34, 0x0e0c22, 0x030308];
  var FOG = v < 0.5 ? 0x0e1a2c : 0x14122a;
  skyDome({ c: SKY, stops: [-0.2, 0.0, 0.15, 0.7] });
  starfield(380, 420, 0xe0e8ff, 1.0, { minY: 0.06, tw: 0.9 });
  var g = new GS();
  var TX = 0, TZ = -40, TR = 6.5, BASE = 3, TOP = 42.2;
  function landE(x, z) {      // signed distance-ish to the headland's edge (positive = inland)
    var cx = Math.sin(z * 0.05) * 6, w = 11 + Math.sin(z * 0.09 + 1) * 3.5 + Math.cos(z * 0.21) * 1.2;
    var e1 = (z < 72 && z > -50) ? w - Math.abs(x - cx) : -99;
    var e2 = 25 + Math.sin(Math.atan2(z - TZ, x - TX) * 5) * 2 - Math.sqrt((x - TX) * (x - TX) + (z - TZ) * (z - TZ));
    return Math.max(e1, e2, z > 66 ? -99 : -99);
  }
  function hgt(x, z) { var e = landE(x, z), top = BASE + Math.sin(x * 0.23) * Math.cos(z * 0.17) * 0.5 + Math.sin(z * 0.08) * 0.4; return e > 4 ? top : e > 0 ? top * (0.35 + 0.65 * e / 4) : top * 0.35 + e * 0.9; }
  g.add(function (x, z) { var e = landE(x, z); return e > 0 ? hgt(x, z) : null; });
  var land = new MB({ light: [-0.3, 0.7, 0.6], amb: 0.5 });
  land.field(0, 5, 120, 170, 34, 46, hgt, function (x, y, z) { var e = landE(x, z); return e > 3 ? mix(0x16262a, 0x22343a, (Math.sin(x * 0.7) * Math.cos(z * 0.6) + 1) / 2) : e > -0.5 ? 0x3a3a42 : 0x2a2a34; }, { skip: function (x, z) { return landE(x, z) < -4; } });
  // rocks heaped along the shore
  for (var r = 0; r < 160; r++) { var rx = rrange(-55, 55), rz = rrange(-75, 75), e = landE(rx, rz); if (e > 0.5 || e < -4) continue; land.geo(ugeo("ico"), rx, hgt(rx, rz) + rrange(-0.3, 0.4), rz, rrange(0.8, 2.6), rrange(0.6, 1.8), rrange(0.8, 2.4), mix(0x22222c, 0x4a4a54, rng()), { ry: rng() * 6, rx: rng() }); }
  // the sea, and the windows' light lying on it
  waterSheet({ w: 500, d: 500, seg: 10, col: 0x0e1a2c, hi: [0x16202e, 0x1a2434, 0x202a3a], n: 420, len: [2, 6], flow: [0.3, 1], wrap: 500, speed: 0.8, thick: 0.14, keep: function (x, z) { return landE(x, z) < -1; } });
  var WCOL = [0xffc878, 0xffe0a8, 0xffb070, 0xa8c8ff, 0xffd0d8, 0xc8ffd8, 0xfff0c8];
  var glint = new MB({ amb: 1 });
  for (var gl2 = 0; gl2 < 70; gl2++) { var ga = rng() * TAU, gd = rrange(26, 70), gx = TX + Math.cos(ga) * gd, gz = TZ + Math.sin(ga) * gd; if (landE(gx, gz) > -1) continue; glint.quadXY(gx, 0.04, gz, 0.3, rrange(1.5, 4), mix(pick(WCOL), 0x000000, 0.5), { rx: -Math.PI / 2, ry: ga + Math.PI / 2, glow: true, tw: 0.8 }); }
  glint.build({ add: true, twSpeed: 2.5 });
  // the tower: a sixteen-sided column of other people's windows
  var tw = new MB({ light: [-0.3, 0.7, 0.6], amb: 0.5 }), wins = new MB({ amb: 1 }), SIDES = 16;
  tw.geo(ugeo("tube", 0, SIDES), TX, (BASE + TOP) / 2 - 0.5, TZ, TR, TOP - BASE + 1, TR, 0x1a1c28, { ry: Math.PI / SIDES });
  var faceR = TR * Math.cos(Math.PI / SIDES) + 0.03;
  for (var row = 0; row < 16; row++) for (var col = 0; col < SIDES; col++) {
    var a = (col + 0.5) / SIDES * TAU, wy = BASE + 1.6 + row * 2.4, wx = TX + Math.cos(a) * faceR, wz = TZ + Math.sin(a) * faceR, ry = -a + Math.PI / 2;
    if (rng() < 0.22) { wins.quadXY(wx, wy, wz, 1.5, 1.6, 0x10121a, { ry: ry, glow: true }); continue; }
    var wc = pick(WCOL), blink = rng() < 0.1 ? -0.3 : 0;
    wins.quadXY(wx, wy, wz, 1.5, 1.6, wc, { ry: ry, glow: true, tw: blink, ph: rng() });
    var ox = Math.cos(a) * 0.02, oz = Math.sin(a) * 0.02, tx = -Math.sin(a), tz = Math.cos(a);
    var kind = rng();
    if (kind < 0.25) wins.quadXY(wx + ox + tx * 0.45, wy, wz + oz + tz * 0.45, 0.6, 1.6, mix(wc, 0x2a1a20, 0.5), { ry: ry, glow: true });          // a curtain half drawn
    else if (kind < 0.33) { wins.quadXY(wx + ox - tx * 0.3, wy - 0.45, wz + oz - tz * 0.3, 0.3, 0.7, 0x1a1418, { ry: ry, glow: true }); wins.quadXY(wx + ox - tx * 0.3, wy - 0.0, wz + oz - tz * 0.3, 0.5, 0.35, 0x1a1418, { ry: ry, glow: true }); }   // a plant
    else if (kind < 0.39) { wins.quadXY(wx + ox + tx * 0.25, wy - 0.55, wz + oz + tz * 0.25, 0.4, 0.3, 0x1a1418, { ry: ry, glow: true }); wins.quadXY(wx + ox + tx * 0.13, wy - 0.33, wz + oz + tz * 0.13, 0.08, 0.14, 0x1a1418, { ry: ry, glow: true }); wins.quadXY(wx + ox + tx * 0.37, wy - 0.33, wz + oz + tz * 0.37, 0.08, 0.14, 0x1a1418, { ry: ry, glow: true }); }  // a sleeping cat on the sill
    else if (kind < 0.45) { wins.quadXY(wx + ox - tx * 0.4, wy - 0.2, wz + oz - tz * 0.4, 0.05, 0.9, 0x1a1418, { ry: ry, glow: true }); wins.quadXY(wx + ox - tx * 0.4, wy + 0.3, wz + oz - tz * 0.4, 0.35, 0.25, mix(wc, 0xffffff, 0.5), { ry: ry, glow: true }); }   // a reading lamp
    // the mullion
    wins.quadXY(wx + ox, wy, wz + oz, 0.06, 1.6, 0x1a1c28, { ry: ry, glow: true });
  }
  // the gallery and the lamp room at the top
  tw.geo(ugeo("cyl", 1, 20), TX, TOP - 0.2, TZ, 9, 0.4, 9, 0x2a2c38, {});
  for (var rp = 0; rp < 32; rp++) { var ra = rp / 32 * TAU; tw.box(TX + Math.cos(ra) * 8.8, TOP + 0.55, TZ + Math.sin(ra) * 8.8, 0.08, 1.1, 0.08, 0x3a3c48, { faces: "px nx pz nz" }); }
  tw.tor(TX, TOP + 1.1, TZ, 8.8, 0.006, 0x3a3c48, 32, { rx: Math.PI / 2 });
  tw.cone(TX, TOP + 6.8, TZ, 4.6, 3.2, 0x22242e, 12);
  tw.geo(ugeo("cyl", 1, 12), TX, TOP + 5.0, TZ, 4.4, 0.4, 4.4, 0x2a2c38, {});
  for (var lp = 0; lp < 12; lp++) { var la = lp / 12 * TAU; tw.box(TX + Math.cos(la) * 4.1, TOP + 2.5, TZ + Math.sin(la) * 4.1, 0.12, 5, 0.12, 0x2a2c38, { faces: "px nx pz nz" }); }
  g.disc(TX, TZ, 8.9, TOP, 4.3);
  // the stair winding around the tower
  var PITCH = 9, R0 = TR + 0.1, R1 = TR + 2.1, SPT = 40, a0 = Math.PI / 2, nSteps = Math.floor((TOP - BASE) / PITCH * SPT);
  for (var s2 = 0; s2 < nSteps; s2++) {
    var aa = a0 + s2 / SPT * TAU, yy = BASE + PITCH * s2 / SPT, rm = (R0 + R1) / 2;
    tw.box(TX + Math.cos(aa) * rm, yy - 0.1, TZ + Math.sin(aa) * rm, R1 - R0, 0.2, 1.05, s2 % 2 ? 0x4a4c58 : 0x3a3c48, { ry: -aa + Math.PI / 2, faces: "px nx py pz nz" });
    if (s2 % 2 === 0) tw.box(TX + Math.cos(aa) * (R1 - 0.05), yy + 0.55, TZ + Math.sin(aa) * (R1 - 0.05), 0.06, 1.1, 0.06, 0x5a5c68, { faces: "px nx pz nz" });
  }
  var hel = new GS(); hel.helix(TX, TZ, R0 - 0.1, R1 + 0.1, BASE, PITCH, a0, 0, 4);
  g.add(function (x, z) { var r2 = hel.sample(x, z); return (r2.on && r2.y <= TOP + 0.05) ? r2.y : null; });
  land.build(); tw.build(); wins.build({ twSpeed: 6 });
  // the lamp and its two slow beams
  var core = N2.glowSprite(0xfff4d0, 7); core.position.set(TX, TOP + 2.6, TZ); buildGroup.add(core);
  var beamG = new THREE.Group(); beamG.position.set(TX, TOP + 2.6, TZ); buildGroup.add(beamG);
  var bm = new MB({ amb: 1 });
  bm.geo(ugeo("cyl", 0.04, 12), 0, 0, -70, 12, 140, 12, 0x000000, { rx: -Math.PI / 2, glow: true, col2: 0x4a4026 });
  bm.geo(ugeo("cyl", 0.04, 12), 0, 0, 70, 12, 140, 12, 0x000000, { rx: Math.PI / 2, glow: true, col2: 0x4a4026 });
  bm.build({ add: true, parent: beamG, nocull: true });
  beamG.rotation.x = 0.06;
  anim(function (dt, t) { beamG.rotation.y = t * 0.35; });
  // soft rails: the stair and gallery hold you without pulling you away
  anim(function () {
    if (phase !== "play" || !grounded) return;
    var dx = pos.x - TX, dz = pos.z - TZ, r3 = Math.sqrt(dx * dx + dz * dz), lim = null;
    if (pos.y > BASE + 0.8 && pos.y < TOP - 0.3) { if (r3 < TR + 0.45) lim = TR + 0.45; else if (r3 > R1 - 0.15) lim = R1 - 0.15; }
    else if (pos.y >= TOP - 0.3) { if (r3 > 8.6) lim = 8.6; else if (r3 < 4.6) lim = 4.6; }
    else if (r3 < TR + 0.4) lim = TR + 0.4;
    if (lim != null && r3 > 0.01) { pos.x = TX + dx / r3 * lim; pos.z = TZ + dz / r3 * lim; if (camera) { camera.position.x = pos.x; camera.position.z = pos.z; } }
  });
  // things to sit with
  var mail = new MB({ amb: 0.7 }), mx = TX + 2.6, mz = TZ + 9.6, my = hgt(mx, mz);
  mail.box(mx, my + 0.6, mz, 0.08, 1.2, 0.08, 0x3a3a44); mail.box(mx, my + 1.3, mz, 0.4, 0.35, 0.55, 0x6a2a2a); mail.box(mx, my + 1.37, mz + 0.29, 0.3, 0.04, 0.02, 0xf0e8d0, { glow: true });
  var mailM = mail.build({ nochunk: true });
  sayIx(mailM, mx, mz, 2.2, ["letters addressed to windows. none of them have been opened", "one is addressed to you, in your own handwriting", "inside, only: 'the light was on. i saw it. thank you.'"], { kind: "mailbox", y: my, sound: function () { if (audio.ctx) audio.creature("rustle", 0, 1); } });
  var bench = new MB({ amb: 0.7 }), bx = 3.5, bz = 22, by = hgt(bx, bz);
  bench.box(bx, by + 0.45, bz, 1.8, 0.08, 0.5, 0x4a3a30, {}); bench.box(bx, by + 0.75, bz + 0.25, 1.8, 0.5, 0.06, 0x4a3a30, {}); bench.box(bx - 0.8, by + 0.22, bz, 0.08, 0.45, 0.45, 0x2a2a30, {}); bench.box(bx + 0.8, by + 0.22, bz, 0.08, 0.45, 0.45, 0x2a2a30, {});
  var benchM = bench.build({ nochunk: true });
  sayIx(benchM, bx, bz, 2.2, ["from here every window is someone awake, keeping you company", "you count them. you lose count. it doesn't matter", "somewhere up there a kettle is boiling"], { kind: "bench", y: by });
  var top = new THREE.Object3D(); top.position.set(TX, TOP + 1.2, TZ + 6); buildGroup.add(top);
  sayIx(top, TX, TZ + 6.2, 2.6, ["one window, up here, is yours. the lamp is still on", "the light goes out over the sea and comes back, like breath", "no ship has come. it keeps the light anyway"], { kind: "gallery", y: TOP });
  gate(TX, TOP, TZ + 4.35, 0, 0xfff4d0, 0x2a2c38, undefined, { w: 1.2, h: 2.3 });
  gate(TX, hgt(TX, TZ - TR - 0.5), TZ - TR - 0.15, Math.PI, 0xffd8a0, 0x2a2c38, undefined, { w: 1.3, h: 2.3 });
  soundSpots([
    { x: 0, z: 0, r: 999, a: 4, b: 8, fn: function () { audio.noise(2.4, "lowpass", 500, 200, 0.05, rr(-0.7, 0.7)); } },
    { x: TX, z: TZ, r: 30, a: 6, b: 11, fn: function (pan) { audio.creature(rng() < 0.5 ? "music" : "voice", pan, rrange(0.6, 0.9)); } }
  ]);
  return zone({ P: P, mood: mood, spawn: { x: Math.sin(50 * 0.05) * 6, z: 50, y: hgt(Math.sin(2.5) * 6, 50), yaw: 0.1 }, ground: g.fn(), fog: [FOG, 16, 170], sky: SKY[1], killY: -6, sound: "water" });
});

/* =============================================================================
   9. inside the snow globe — a small winter town under a sky of glass. outside
   the glass, enormous and soft, a room at night: a desk lamp, books, a window.
   the belfry can be climbed. touch the glass and the snow remembers to fall.
   ============================================================================= */
reg("inside_the_snowglobe", "inside the snow globe", 1, ["snow", "town", "glass", "small"], function (P, mood) {
  var v = rng();
  var R = 56, warmLamp = v < 0.5 ? 0xffc070 : 0xffd8a8;
  var FOG = 0x2a2230;
  skyDome({ c: [0x120e14, 0x2a2026, 0x1a141c, 0x0c0a10], stops: [-0.3, -0.05, 0.2, 0.8] });
  var g = new GS();
  function hgt(x, z) { var d = Math.sqrt(x * x + z * z); return 0.6 * Math.cos(d * 0.12) + 0.25 * Math.sin(x * 0.3) * Math.cos(z * 0.27) - (d > R - 6 ? (d - R + 6) * 0.15 : 0); }
  g.add(function (x, z) { return (x * x + z * z < (R - 1) * (R - 1)) ? hgt(x, z) : null; });
  var town = new MB({ light: [0.7, 0.6, 0.3], amb: 0.55 });
  town.field(0, 0, 2 * R, 2 * R, 28, 28, hgt, function (x, y, z) { return mix(0xb8c0d8, 0xe8eef8, clamp(0.5 + y * 0.6, 0, 1)); }, { skip: function (x, z) { return x * x + z * z > R * R; } });
  // the plinth outside: a wooden base, and a desk that goes on for ever
  var out = new MB({ light: [0.7, 0.6, 0.3], amb: 0.5 });
  out.geo(ugeo("tube", 0, 32), 0, -6, 0, R + 1.5, 9, R + 1.5, 0x3a2418, {});
  out.geo(ugeo("tor", 0.04, 40), 0, -2.0, 0, R + 1.6, R + 1.6, R + 1.6, 0x8a6a3a, { rx: Math.PI / 2 });
  out.box(0, -10.2, 0, 900, 0.4, 900, 0x2a1a14, { faces: "py" });
  // the giant room: a desk lamp, a stack of books, a window with the real night
  out.geo(ugeo("cyl", 0.9, 12), 160, -6, -110, 26, 8, 26, 0x2a2a30, {});
  out.seg(160, -2, -110, 150, 120, -120, 6, 6, 0x34343c);
  out.seg(150, 120, -120, 105, 150, -95, 5, 5, 0x34343c);
  out.geo(ugeo("cone", 16), 95, 130, -90, 34, 40, 34, 0x3a2a24, { rz: 0.5, rx: 0.2 });
  for (var bk = 0; bk < 6; bk++) out.box(-150 + rrange(-6, 6), -10 + bk * 14 + 7, -60 + rrange(-6, 6), rrange(70, 100), 14, rrange(48, 60), pick([0x5a2a2a, 0x2a3a5a, 0x4a4a2a, 0x3a2a3a, 0x2a4a3a]), { ry: rrange(-0.2, 0.2) });
  out.box(0, 120, -360, 420, 8, 6, 0x2a1e18); out.box(0, 330, -360, 420, 8, 6, 0x2a1e18); out.box(-210, 225, -360, 8, 218, 6, 0x2a1e18); out.box(210, 225, -360, 8, 218, 6, 0x2a1e18); out.box(0, 225, -360, 6, 218, 6, 0x2a1e18);
  out.box(0, 225, -366, 420, 210, 2, 0x1a2440, { glow: true });
  out.build({ nofog: false });
  var moon = N2.glowSprite(0xe8eeff, 46); moon.position.set(-90, 260, -362); buildGroup.add(moon);
  var lampGlow = N2.glowSprite(warmLamp, 100); lampGlow.position.set(92, 110, -88); buildGroup.add(lampGlow);
  var outStars = new PC(); for (var os = 0; os < 120; os++) outStars.add(rrange(-200, 200), rrange(130, 320), -364, 0xffffff, rrange(1, 2.4), { tw: 0.8 }); outStars.build({ scale: 1, nofog: true });
  // the town: little houses with warm windows, a ring road, firs
  var HOUSE = [0x6a4a4a, 0x4a5a6a, 0x7a6a5a, 0x5a4a62, 0x6a6a5a], ROOF = 0xf0f4fa;
  var placed = [];
  function freeAt(x, z, rr2) { for (var i = 0; i < placed.length; i++) { var p = placed[i]; if ((p[0] - x) * (p[0] - x) + (p[1] - z) * (p[1] - z) < (p[2] + rr2) * (p[2] + rr2)) return false; } return true; }
  placed.push([0, 0, 8]); placed.push([0, 14, 4]);
  var wl = new MB({ amb: 1 });
  for (var h = 0; h < 60 && placed.length < 34; h++) {
    var ha = rng() * TAU, hd = rrange(14, R - 12), hx = Math.cos(ha) * hd, hz = Math.sin(ha) * hd, hw = rrange(2.6, 4), hdp = rrange(2.6, 4.2), hh = rrange(2.4, 4.2);
    if (!freeAt(hx, hz, 4.2)) continue; placed.push([hx, hz, 3.6]);
    var hy = hgt(hx, hz) - 0.3, ry = -ha + Math.PI / 2 + rrange(-0.2, 0.2), cr = Math.cos(ry), sr = Math.sin(ry);
    town.box(hx, hy + hh / 2, hz, hw, hh, hdp, pick(HOUSE), { ry: ry });
    town.box(hx - sr * 0, hy + hh + hw * 0.22, hz, hw * 0.74, hw * 0.74, hdp + 0.4, ROOF, { ry: ry, rz: Math.PI / 4, order: "YXZ" });
    town.box(hx + cr * hw * 0.25, hy + hh + hw * 0.5, hz - sr * hw * 0.25, 0.4, 1.2, 0.4, 0x4a3a3a, { ry: ry });
    solid(hx, hz, hw / 2, hdp / 2, ry, hy - 1, hy + hh + 1);
    for (var wn = 0; wn < 3; wn++) { var side = wn % 2 ? 1 : -1, ox = (wn - 1) * hw * 0.3; wl.quadXY(hx + cr * ox + sr * side * (hdp / 2 + 0.02), hy + hh * 0.55, hz - sr * ox + cr * side * (hdp / 2 + 0.02), 0.55, 0.7, rng() < 0.85 ? warmLamp : 0x2a2a3a, { ry: ry + (side < 0 ? Math.PI : 0), glow: true, tw: rng() < 0.1 ? -0.2 : 0 }); }
  }
  for (var f = 0; f < 70; f++) { var fa = rng() * TAU, fd = rrange(10, R - 4), fx = Math.cos(fa) * fd, fz = Math.sin(fa) * fd; if (!freeAt(fx, fz, 1.6)) continue; placed.push([fx, fz, 1.2]); var fh = rrange(2.5, 6), fy = hgt(fx, fz); town.geo(ugeo("cyl", 0.6, 5), fx, fy + 0.4, fz, 0.18, 0.8, 0.18, 0x3a2a24, {}); town.cone(fx, fy + 0.6 + fh * 0.35, fz, fh * 0.32, fh * 0.7, 0x2a4a3e, 6); town.cone(fx, fy + 0.6 + fh * 0.72, fz, fh * 0.22, fh * 0.5, 0x3a5a4e, 6, { ry: 0.5 }); town.cone(fx, fy + 0.6 + fh * 0.62, fz, fh * 0.26, fh * 0.12, 0xe8eef8, 6); }
  // lamp posts around the square
  var lpc = new PC();
  for (var lp = 0; lp < 12; lp++) { var la = lp / 12 * TAU, lx = Math.cos(la) * 10.5, lz = Math.sin(la) * 10.5, ly = hgt(lx, lz); town.box(lx, ly + 1.4, lz, 0.1, 2.8, 0.1, 0x2a2a30, { faces: "px nx pz nz" }); wl.geo(ugeo("oct"), lx, ly + 2.9, lz, 0.2, 0.28, 0.2, warmLamp, { glow: true }); lpc.add(lx, ly + 2.9, lz, warmLamp, 1.4, {}); }
  // the belfry in the square, with a stair along its side
  var BX = 0, BZ = 0, BW = 2.6, BH = 8, by0 = hgt(0, 0) - 0.1;
  town.box(BX, by0 + BH / 2, BZ, BW * 2, BH, BW * 2, 0x8a7a8a, { faces: "px nx pz nz" });
  town.box(BX, by0 + BH, BZ, BW * 2 + 0.4, 0.3, BW * 2 + 0.4, 0x6a5a6a);
  for (var pc = 0; pc < 4; pc++) town.box(BX + (pc & 1 ? BW - 0.25 : -BW + 0.25), by0 + BH + 2, BZ + (pc & 2 ? BW - 0.25 : -BW + 0.25), 0.5, 4, 0.5, 0x8a7a8a, { faces: "px nx pz nz" });
  town.box(BX, by0 + BH + 4.1, BZ, BW * 2 + 0.6, 0.3, BW * 2 + 0.6, 0x6a5a6a);
  town.cone(BX, by0 + BH + 6.2, BZ, BW * 1.5, 4, ROOF, 4, { ry: Math.PI / 4 });
  town.geo(ugeo("disc", 12), BX, by0 + BH - 1.6, BZ + BW + 0.02, 1.0, 1.0, 1, 0xf0e8d0, { glow: true });
  solid(BX, BZ, BW, BW, 0, by0 - 1, by0 + BH);
  var run = 0.8, sx0 = BX + BW + 0.8, NS = 17, sz0 = BZ + BW + NS * run - 1, sy0 = hgt(sx0, sz0 + 0.4) - 0.05, rise = (by0 + BH - sy0) / NS;
  for (var s = 0; s < NS; s++) town.box(sx0, sy0 + rise * (s + 1) - 0.12, sz0 - (s + 0.5) * run, 1.4, 0.24, run, s % 2 ? 0xa89aa8 : 0x9a8c9a, { faces: "px nx py nz pz" });
  for (var sp = 0; sp < NS; sp += 3) town.box(sx0, sy0 + (rise * sp) / 2 - 0.2, sz0 - (sp + 0.5) * run, 0.3, rise * sp + 0.3, 0.3, 0x6a5a6a, { faces: "px nx pz nz" });
  g.stairs(sx0, sz0, 0.7, NS, run, rise, sy0, Math.PI);
  var landZ = sz0 - NS * run;
  town.box(sx0 - 0.4, by0 + BH - 0.12, landZ - 0.6, 2.2, 0.24, 1.6, 0x9a8c9a);
  g.rect(sx0 - 0.4, landZ - 0.6, 1.1, 0.8, by0 + BH);
  g.rect(BX, BZ, BW + 0.2, BW + 0.2, by0 + BH + 0.15);
  town.build(); wl.build({ twSpeed: 5 }); lpc.build({ bright: 0.6 });
  var bell = new MB({ amb: 0.8 });
  bell.geo(ugeo("cyl", 0.55, 10), BX, by0 + BH + 2.4, BZ, 0.9, 1.4, 0.9, 0xc8a050, {}); bell.box(BX, by0 + BH + 3.4, BZ, 1.6, 0.2, 0.2, 0x3a2a22);
  var bellM = bell.build({ nochunk: true });
  sayIx(bellM, BX, BZ, 3.0, ["the bell rings. the snow listens", "far outside the glass, something enormous turns its head", "the sound stays inside. it has nowhere else to go"], { kind: "bell", y: by0 + BH, sound: function () { if (audio.ctx) { audio.gong(98, 0); audio.creature("bell", 0, 0.8); } } });
  // the glass: faint, with long curved highlights
  var hl = new MB({ amb: 1 });
  for (var hi = 0; hi < 3; hi++) { var h0 = -0.9 + hi * 0.35; for (var hs = 0; hs < 10; hs++) { var e0 = 0.4 + hs * 0.08, e1 = e0 + 0.08; var p0 = new THREE.Vector3().setFromSphericalCoords(R - 0.3, e0, h0), p1 = new THREE.Vector3().setFromSphericalCoords(R - 0.3, e1, h0), p2 = new THREE.Vector3().setFromSphericalCoords(R - 0.3, e1, h0 + 0.05), p3 = new THREE.Vector3().setFromSphericalCoords(R - 0.3, e0, h0 + 0.05); hl.quad(p0, p1, p2, p3, 0x2a3038, { glow: true }); } }
  hl.build({ add: true, side: THREE.DoubleSide, nochunk: true });
  // the snow, and a little drift of it in the air
  var sn = new PC(), SN = 1400;
  for (var i2 = 0; i2 < SN; i2++) { var sa = rng() * TAU, sdd = Math.sqrt(rng()) * (R - 3); sn.add(Math.cos(sa) * sdd, 34, Math.sin(sa) * sdd, 0xffffff, rrange(0.06, 0.12), { fl: 1, sway: rrange(0.5, 2.0) }); }
  var snow = sn.build({ flow: [0, -1, 0, 36], flowSpeed: 0.9, bobSpeed: 0.5, bright: 1.0 });
  // touch the glass: it shakes, and the snow swirls up
  var storm = 0, EX = 0, EZ = R - 4;
  var edge = new THREE.Object3D(); edge.position.set(EX, hgt(EX, EZ) + 1.5, EZ); buildGroup.add(edge);
  sayIx(edge, EX, EZ, 3.0, ["you touch the glass. the whole world trembles, and the snow remembers to fall", "it is cold. on the other side, it is warm", "your breath fogs the glass from the inside"], { kind: "glass", y: hgt(EX, EZ), on: function () { storm = 6; try { if (!(N2.settings && N2.settings.reducedMotion)) shake = Math.max(shake, 1.2); } catch (e) {} if (audio.ctx) audio.creature("low", 0, 0.6); } });
  anim(function (dt) {
    if (!snow) return; var u = snow.material.uniforms;
    if (storm > 0) { storm -= dt; u.uRate.value.x = 0.9 + storm * 1.6; u.uRate.value.y = 0.5 + storm * 0.5; } else { u.uRate.value.x = 0.9; u.uRate.value.y = 0.5; }
  });
  // a soft wall where the glass is (no pull)
  anim(function () { if (phase !== "play") return; var r2 = Math.sqrt(pos.x * pos.x + pos.z * pos.z); if (r2 > R - 2.2) { pos.x *= (R - 2.2) / r2; pos.z *= (R - 2.2) / r2; if (camera) { camera.position.x = pos.x; camera.position.z = pos.z; } } });
  gate(-(R - 3) * 0.7, hgt(-(R - 3) * 0.7, -(R - 3) * 0.7), -(R - 3) * 0.7, Math.PI * 0.75, 0xe8f0ff, 0x6a7a8a, undefined, { w: 1.2, h: 2.4 });
  gate(BX, by0, BZ - BW - 0.1, Math.PI, 0xffd8a0, 0x6a5a6a, undefined, { w: 1.2, h: 2.2 });
  soundSpots([
    { x: 0, z: 0, r: 999, a: 6, b: 12, fn: function () { audio.creature("chime", rr(-0.7, 0.7), rrange(0.7, 1.1)); } },
    { x: 0, z: 0, r: 999, a: 20, b: 40, fn: function () { audio.gong(41, 0); } }
  ]);
  return zone({ P: P, mood: mood, spawn: { x: 0, z: 30, y: hgt(0, 30), yaw: 0 }, ground: g.fn(), fog: [FOG, 50, 520], sky: 0x2a2026, killY: -12, sound: "bells" });
});

/* =============================================================================
   10. the paper moon harbour — everything folded: a harbour of paper boats on
   a sea of paper waves, a town cut from card in layers, a moon on a string.
   a great paper ship is moored at the end of the pier; climb to its bridge.
   ============================================================================= */
reg("paper_moon_harbour", "the paper moon harbour", 1, ["paper", "harbour", "moon", "night"], function (P, mood) {
  var v = rng();
  var INK = v < 0.5 ? 0x1c2a4a : 0x2a1c3a, PAPER = 0xefe6d2, PAPER2 = 0xd8ccb4, FOG = v < 0.5 ? 0x24345a : 0x34284a;
  skyDome({ c: [INK, mix(INK, 0x6a7aa0, 0.5), mix(INK, 0x3a4a70, 0.4), mix(INK, 0x000000, 0.4)], stops: [-0.2, 0.0, 0.2, 0.8] });
  var g = new GS();
  var mb = new MB({ light: [-0.5, 0.6, 0.6], amb: 0.62 });
  // paper waves: rows of folded ridges, rocking gently
  var wv = new MB({ light: [-0.5, 0.6, 0.6], amb: 0.55 });
  for (var row = 0; row < 34; row++) {
    var wz = -150 + row * 7 + rrange(-1, 1), ph = rng(), col = mix(0x8aa0c8, 0x5a6a98, row % 2 ? 0.2 : 0.6);
    for (var t = -26; t < 26; t++) {
      var x0 = t * 8, x1 = x0 + 8, hh = rrange(0.6, 1.2);
      var a = new THREE.Vector3(x0, -0.2, wz - 1.6), b = new THREE.Vector3(x1, -0.2, wz - 1.6), c = new THREE.Vector3(x1, hh, wz), d = new THREE.Vector3(x0, hh, wz), e2 = new THREE.Vector3(x1, -0.2, wz + 1.6), f2 = new THREE.Vector3(x0, -0.2, wz + 1.6);
      wv.quad(a, d, c, b, col, { ph: ph, bob: 0.12 }); wv.quad(d, f2, e2, c, mix(col, 0xffffff, 0.25), { ph: ph, bob: 0.12 });
    }
  }
  wv.geo(ugeo("plane"), 0, -0.3, 0, 500, 500, 1, 0x3a4a78, { rx: -Math.PI / 2, glow: true });
  wv.build({ bobSpeed: 0.7 });
  // the long pier, out into the waves
  var PX = 0, PZ0 = 40, PZ1 = -70, PY = 1.6;
  for (var pz = PZ0; pz > PZ1; pz -= 1.3) mb.box(PX, PY - 0.1, pz, 4, 0.2, 1.2, (Math.round(pz / 1.3) & 1) ? PAPER : PAPER2, { faces: "px nx py pz nz" });
  for (var pl = PZ0; pl > PZ1; pl -= 6) for (var ps = -1; ps <= 1; ps += 2) { mb.box(PX + ps * 2.1, PY / 2 - 0.3, pl, 0.3, PY + 0.8, 0.3, PAPER2, { faces: "px nx pz nz" }); mb.box(PX + ps * 2.1, PY + 0.6, pl, 0.1, 1.2, 0.1, PAPER2, { faces: "px nx pz nz" }); }
  for (var rl = PZ0; rl > PZ1 + 6; rl -= 6) for (var rs = -1; rs <= 1; rs += 2) mb.box(PX + rs * 2.1, PY + 1.1, rl - 3, 0.06, 0.06, 6, PAPER2, {});
  g.rect(PX, (PZ0 + PZ1) / 2, 2, (PZ0 - PZ1) / 2, PY);
  // the quay along the shore, and the town cut out of card behind it, in layers
  mb.box(0, PY - 0.5, PZ0 + 10, 200, 1.0, 20, PAPER2, { faces: "py nz" });
  g.rect(0, PZ0 + 10, 100, 10, PY);
  var LAY = [[56, 0xc8bca8, 6, 16], [90, 0x8a8aa0, 10, 28], [140, 0x5a6488, 14, 44], [210, 0x3a4670, 22, 70]];
  var winM = new MB({ amb: 1 });
  for (var L = 0; L < LAY.length; L++) {
    var lz = PZ0 + LAY[L][0], lc = LAY[L][1], x = -220;
    while (x < 220) {
      var w = rrange(LAY[L][2], LAY[L][2] * 2), h = rrange(LAY[L][2] * 0.6, LAY[L][3]);
      mb.quadXY(x + w / 2, PY + h / 2, lz, w, h, lc, { ry: Math.PI, glow: true });
      if (rng() < 0.5) { var rh = w * 0.4; mb.tri(new THREE.Vector3(x + w, PY + h, lz), new THREE.Vector3(x, PY + h, lz), new THREE.Vector3(x + w / 2, PY + h + rh, lz), lc, { glow: true }); }
      var nw = Math.floor(w * h / (40 + L * 60));
      for (var wi = 0; wi < nw; wi++) winM.quadXY(x + rrange(1, w - 1), PY + rrange(1, h - 1), lz - 0.05, 0.9 + L * 0.4, 1.0 + L * 0.5, pick([0xffd890, 0xffe8b8, 0xffc070]), { ry: Math.PI, glow: true, tw: rng() < 0.15 ? -0.25 : 0 });
      x += w + rrange(-2, 1);
    }
  }
  // paper boats: some moored, some drifting
  var boats = new MB({ light: [-0.5, 0.6, 0.6], amb: 0.6 });
  function paperBoat(mb2, x, y, z, s, ry, o) {
    var c = Math.cos(ry), sn = Math.sin(ry);
    function P3(lx, ly, lz) { return new THREE.Vector3(x + (lx * c + lz * sn) * s, y + ly * s, z + (-lx * sn + lz * c) * s); }
    var col = o.col || PAPER, col2 = mix(col, 0x8a7a6a, 0.25);
    mb2.quad(P3(-1.6, 0.6, 0), P3(-1.0, 0, 0.5), P3(1.0, 0, 0.5), P3(1.6, 0.6, 0), col, o);
    mb2.quad(P3(1.6, 0.6, 0), P3(1.0, 0, -0.5), P3(-1.0, 0, -0.5), P3(-1.6, 0.6, 0), col, o);
    mb2.tri(P3(-0.7, 0.4, 0), P3(0.7, 0.4, 0), P3(0, 1.5, 0), col2, o); mb2.tri(P3(0.7, 0.4, 0), P3(-0.7, 0.4, 0), P3(0, 1.5, 0), col2, o);
  }
  for (var bt = 0; bt < 60; bt++) { var bx = rrange(-90, 90), bz = rrange(-130, 30); if (Math.abs(bx) < 5 && bz > PZ1 - 30) continue; paperBoat(boats, bx, 0.25, bz, rrange(0.6, 2.4), rng() * TAU, { ph: rng(), bob: 0.15, col: rng() < 0.2 ? pick([0xd8a8a8, 0xa8c8d8, 0xe8d8a0]) : PAPER }); }
  boats.build({ bobSpeed: 0.8 });
  // the great paper ship at the end of the pier: a ramp up, a deck, a bridge above
  var SX = 12.5, SZ = PZ1 - 6, SL = 34, SW = 9, DECK = 4.2, BR = 9.2;
  var sh = new MB({ light: [-0.5, 0.6, 0.6], amb: 0.6 });
  function SP(lx, ly, lz) { return new THREE.Vector3(SX + lx, ly, SZ + lz); }
  sh.quad(SP(-SW / 2, DECK, -SL / 2), SP(-SW / 2 + 2, -0.5, -SL / 2 + 4), SP(-SW / 2 + 2, -0.5, SL / 2 - 4), SP(-SW / 2, DECK, SL / 2), PAPER2, {});
  sh.quad(SP(SW / 2, DECK, SL / 2), SP(SW / 2 - 2, -0.5, SL / 2 - 4), SP(SW / 2 - 2, -0.5, -SL / 2 + 4), SP(SW / 2, DECK, -SL / 2), PAPER2, {});
  sh.tri(SP(-SW / 2, DECK, SL / 2), SP(0, DECK + 2.5, SL / 2 + 6), SP(SW / 2, DECK, SL / 2), PAPER, {}); sh.tri(SP(SW / 2, DECK, -SL / 2), SP(0, DECK + 2.5, -SL / 2 - 6), SP(-SW / 2, DECK, -SL / 2), PAPER, {});
  sh.box(SX, DECK - 0.1, SZ, SW, 0.2, SL, PAPER, { faces: "py ny" });
  g.rect(SX, SZ, SW / 2 - 0.2, SL / 2, DECK);
  // the gangplank from the pier
  var gp0 = new THREE.Vector3(PX + 2, PY, SZ + 8), gp1 = new THREE.Vector3(SX - SW / 2, DECK, SZ + 8);
  sh.seg(gp0.x, gp0.y - 0.08, gp0.z, gp1.x, gp1.y - 0.08, gp1.z, 0.1, 1.6, PAPER2, {});
  sh.box((gp0.x + gp1.x) / 2, (gp0.y + gp1.y) / 2 - 0.08, gp0.z, gp1.x - gp0.x + 0.2, 0.12, 1.6, PAPER2, { rz: Math.atan2(gp1.y - gp0.y, gp1.x - gp0.x) });
  g.add(function (x, z) { if (Math.abs(z - gp0.z) > 0.85 || x < gp0.x - 0.1 || x > gp1.x + 0.3) return null; var t2 = clamp((x - gp0.x) / (gp1.x - gp0.x), 0, 1); return gp0.y + (gp1.y - gp0.y) * t2; });
  // the folded cabin and its stair up to the bridge
  sh.box(SX, DECK + (BR - DECK) / 2, SZ - 6, 6, BR - DECK, 7, PAPER2, { faces: "px nx pz nz" });
  sh.box(SX, BR - 0.1, SZ - 6, 7, 0.2, 8, PAPER, { faces: "py ny px nx pz nz" });
  solid(SX, SZ - 6, 3, 3.5, 0, DECK, BR);
  var NS = 10, rr2 = (BR - DECK) / NS;
  for (var s2 = 0; s2 < NS; s2++) sh.box(SX + 3.8, DECK + rr2 * (s2 + 1) - 0.1, SZ + 0.2 - s2 * 0.75 - 0.375, 1.4, 0.2, 0.75, s2 % 2 ? PAPER : PAPER2, {});
  g.stairs(SX + 3.8, SZ + 0.2, 0.7, NS, 0.75, rr2, DECK, Math.PI);
  g.rect(SX, SZ - 6, 3.5, 4, BR);
  // the sail: one tall folded triangle
  sh.tri(SP(0, BR, -4), SP(0, BR, -9.5), SP(0, BR + 14, -6.5), PAPER, {}); sh.tri(SP(0, BR, -9.5), SP(0, BR, -4), SP(0, BR + 14, -6.5), mix(PAPER, 0x8a7a6a, 0.2), {});
  sh.build();
  // paper cranes on threads, and cut-out stars swinging
  var cr = new MB({ amb: 0.8 });
  for (var cn = 0; cn < 28; cn++) {
    var cx = rrange(-50, 50), cz = rrange(-100, 30), cy = rrange(9, 22), ph2 = rng();
    cr.box(cx, cy + 20, cz, 0.02, 40, 0.02, 0x8a8a9a, { ph: ph2, sway: 0.25, glow: true });
    cr.tri(new THREE.Vector3(cx - 0.9, cy + 0.3, cz), new THREE.Vector3(cx, cy, cz - 0.2), new THREE.Vector3(cx, cy, cz + 0.4), PAPER, { ph: ph2, sway: 0.25 });
    cr.tri(new THREE.Vector3(cx + 0.9, cy + 0.3, cz), new THREE.Vector3(cx, cy, cz + 0.4), new THREE.Vector3(cx, cy, cz - 0.2), PAPER2, { ph: ph2, sway: 0.25 });
    cr.tri(new THREE.Vector3(cx, cy, cz - 0.6), new THREE.Vector3(cx, cy + 0.5, cz + 0.6), new THREE.Vector3(cx, cy, cz + 0.6), PAPER, { ph: ph2, sway: 0.25 });
  }
  var stars = new MB({ amb: 1 });
  for (var sk = 0; sk < 40; sk++) {
    var sx = rrange(-160, 160), sy = rrange(35, 90), sz = rrange(-220, -40), rad = rrange(0.8, 2.0), ph3 = rng();
    stars.box(sx, sy + 40, sz, 0.05, 80, 0.05, 0x5a6a8a, { ph: ph3, sway: 0.5, glow: true });
    for (var pt = 0; pt < 5; pt++) { var aa = pt / 5 * TAU + Math.PI / 2, ab = aa + TAU / 10, ac = aa - TAU / 10; stars.tri(new THREE.Vector3(sx, sy, sz), new THREE.Vector3(sx + Math.cos(ac) * rad * 0.4, sy + Math.sin(ac) * rad * 0.4, sz), new THREE.Vector3(sx + Math.cos(aa) * rad, sy + Math.sin(aa) * rad, sz), 0xf8ecc0, { ph: ph3, sway: 0.5, glow: true }); stars.tri(new THREE.Vector3(sx, sy, sz), new THREE.Vector3(sx + Math.cos(aa) * rad, sy + Math.sin(aa) * rad, sz), new THREE.Vector3(sx + Math.cos(ab) * rad * 0.4, sy + Math.sin(ab) * rad * 0.4, sz), 0xe8dcb0, { ph: ph3, sway: 0.5, glow: true }); }
  }
  cr.build({ bobSpeed: 0.5 }); stars.build({ bobSpeed: 0.35, side: THREE.DoubleSide }); mb.build(); winM.build({ twSpeed: 4 });
  // the paper moon, on its string
  var mg = new THREE.Group(); mg.position.set(-40, 70, -170); buildGroup.add(mg);
  var mm = new MB({ amb: 1 }), MR = 18;
  for (var mf = 0; mf < 12; mf++) { var m0 = mf / 12 * TAU, m1 = (mf + 1) / 12 * TAU; mm.tri(new THREE.Vector3(0, 0, mf % 2 ? 1.2 : 0), new THREE.Vector3(Math.cos(m0) * MR, Math.sin(m0) * MR, 0), new THREE.Vector3(Math.cos(m1) * MR, Math.sin(m1) * MR, 0), mf % 2 ? 0xfff2cc : 0xc8b890, { glow: true }); }
  mm.box(0, MR + 100, 0, 0.3, 200, 0.3, 0x8a8a9a, { glow: true });
  var moonMesh = mm.build({ parent: mg, nochunk: true, side: THREE.DoubleSide, nofog: true });
  var mglow = N2.glowSprite(0x8a7a5a, 60); mglow.position.set(-40, 70, -172); buildGroup.add(mglow);
  var moonOn = 1, moonK = 1;
  anim(function (dt, t2) { mg.rotation.y = Math.sin(t2 * 0.15) * 0.35; mg.rotation.z = Math.sin(t2 * 0.11) * 0.04; moonK += ((moonOn ? 1 : 0.08) - moonK) * Math.min(1, dt * 3); if (moonMesh && moonMesh.material) moonMesh.material.uniforms.uBright.value = 0.15 + moonK * 0.85; mglow.material.opacity = moonK; });
  // a pull-cord on a post at the start of the pier: it is the moon's switch
  var cord = new MB({ amb: 0.8 });
  var CZ = PZ0 - 9;
  cord.box(PX + 2.6, PY + 1.6, CZ, 0.16, 3.2, 0.16, PAPER2); cord.box(PX + 2.3, PY + 3.1, CZ, 0.6, 0.08, 0.08, PAPER2); cord.box(PX + 2.05, PY + 2.2, CZ, 0.02, 1.8, 0.02, 0x6a6a7a, { glow: true }); cord.geo(ugeo("oct"), PX + 2.05, PY + 1.3, CZ, 0.07, 0.1, 0.07, 0xf0e0b0, { glow: true });
  var cordM = cord.build({ nochunk: true });
  sayIx(cordM, PX + 2.2, CZ, 2.2, ["you pull the string. far away, the moon goes out", "you pull again. it comes back, a little brighter, as if it missed you", "someone hung it up there by hand. you can see the tape"], { kind: "cord", y: PY, on: function () { moonOn = moonOn ? 0 : 1; if (audio.ctx) audio.creature("tick", 0, 0.8); } });
  var letter = new MB({ amb: 0.7 });
  paperBoat(letter, PX - 1.2, PY + 0.05, PZ0 - 14, 0.28, 0.6, { col: 0xf4ecd8 });
  var letterM = letter.build({ nochunk: true });
  sayIx(letterM, PX - 1.2, PZ0 - 14, 2.0, ["a letter folded into a boat. the ink has run; only 'come back' is left", "it was never sent. it was only set down here, to wait", "you put it in the water. it does not sink"], { kind: "letter", y: PY });
  var brdg = new THREE.Object3D(); brdg.position.set(SX, BR + 1, SZ - 6); buildGroup.add(brdg);
  sayIx(brdg, SX - 1.5, SZ - 4.5, 2.6, ["from up here the whole town is a single folded sheet", "the ship is ready to sail, as soon as somebody unfolds the sea", "the wind smells like a new book"], { kind: "bridge", y: BR });
  gate(SX - 1.2, BR, SZ - 9.6, Math.PI, 0xfff4d8, PAPER2, undefined, { w: 1.2, h: 2.2 });
  gate(-20, PY, PZ0 + 18, Math.PI, 0xffe8c0, PAPER2, undefined, { w: 1.4, h: 2.4 });
  soundSpots([
    { x: 0, z: 0, r: 999, a: 3, b: 7, fn: function () { audio.noise(1.2, "highpass", 2600, 3800, 0.02, rr(-0.8, 0.8)); } },
    { x: 0, z: 0, r: 999, a: 8, b: 15, fn: function () { audio.creature("squeak", rr(-0.5, 0.5), rrange(0.6, 0.9)); } }
  ]);
  return zone({ P: P, mood: mood, spawn: { x: PX, z: PZ0 - 4, y: PY, yaw: 0 }, ground: g.fn(), fog: [FOG, 20, 200], sky: INK, killY: -6, sound: "glass" });
});

/* =============================================================================
   11. the desert of sleeping hands — dunes at the last of dusk. enormous hands
   lie half under the sand, palms up, breathing very slowly. one forearm makes a
   road up into an open palm, where something small and bright is asleep.
   ============================================================================= */
reg("sleeping_hands_desert", "the desert of sleeping hands", 0, ["desert", "dunes", "giants", "dusk"], function (P, mood) {
  var v = rng();
  var SKY = v < 0.5 ? [0x6a4a52, 0xf0a868, 0xa85a72, 0x2a2050] : [0x5a4a5a, 0xf0c088, 0x9a6a8a, 0x22284a];
  var FOG = v < 0.5 ? 0xc88a70 : 0xc8a088, SAND = v < 0.5 ? 0xd8a070 : 0xd8b088, SKIN = 0xd8c0aa;
  var sunDir = [-0.2, 0.04, -1];
  skyDome({ c: SKY, stops: [-0.2, 0.0, 0.12, 0.7], sun: { dir: sunDir, col: 0xffc080, disc: 0xffe0b0, size: 0.04, glow: 4 } });
  var g = new GS();
  function dune(x, z) { return Math.sin(x * 0.035 + Math.sin(z * 0.02) * 2) * 3.2 + Math.cos(z * 0.05 + x * 0.01) * 2.0 + Math.sin((x + z) * 0.11) * 0.5; }
  // the palm you can climb into, and the forearm that leads there
  var HX = 0, HZ = -70, PALM_Y = 7.5;
  function flatNear(x, z, h) { var dx = x - HX, dz = z - HZ, d = Math.sqrt(dx * dx + dz * dz); var k = clamp((d - 16) / 20, 0, 1); return h * k + 0.2 * (1 - k); }
  function hgt(x, z) { return flatNear(x, z, dune(x, z)); }
  g.add(function (x, z) { return (Math.abs(x) < 190 && Math.abs(z) < 190) ? hgt(x, z) : null; });
  var mb = new MB({ light: [sunDir[0], 0.35, sunDir[2]], amb: 0.38 });
  mb.field(0, 0, 380, 380, 40, 40, hgt, function (x, y, z) { return mix(mix(SAND, 0x7a4a50, 0.35), SAND, clamp(0.5 + y * 0.12, 0, 1)); });
  // a hand: palm, curled fingers, a thumb; all of it breathing on one slow phase
  var hands = new MB({ light: [sunDir[0], 0.4, sunDir[2]], amb: 0.42 });
  function finger(mb2, b, x, y, z, ux, uz, len, rad, curl, tilt) {
    var px = x, py = y, pz = z, e = tilt;
    for (var k = 0; k < 3; k++) {
      var L = len * [0.42, 0.33, 0.27][k], c = Math.cos(e), nx = px + ux * c * L, ny = py + Math.sin(e) * L, nz = pz + uz * c * L, r1 = rad * (0.92 - k * 0.07);
      mb2.cylSeg(px, py, pz, nx, ny, nz, rad * (1 - k * 0.07), r1, mix(SKIN, 0x9a7a7a, k * 0.06), 6, b);
      mb2.sph(nx, ny, nz, r1, r1, r1, SKIN, b, 6, 4);
      px = nx; py = ny; pz = nz; e += curl * (0.5 + k * 0.3);
    }
  }
  function hand(x, y, z, S, ry, curl, o) {
    var par = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(S, S, S));
    var b = merge(o, { parent: par });
    hands.sph(0, 0, 0, 1.0, 0.32, 1.1, SKIN, b, 8, 5);            // palm
    for (var f = 0; f < 4; f++) { var fx = -0.6 + f * 0.4, fa = (f - 1.5) * 0.1; finger(hands, b, fx, 0.05, -0.9, Math.sin(fa), -Math.cos(fa), [1.5, 1.75, 1.65, 1.25][f], 0.17, curl, 0.05); }
    finger(hands, b, 0.9, 0.0, 0.1, 0.8, -0.6, 1.0, 0.2, curl * 0.6, 0.15);                 // thumb
    hands.cylSeg(0, -0.1, 0.9, 0, -0.6, 4.6, 0.62, 0.7, SKIN, 8, b);                         // forearm sinking into the sand
  }
  hand(-60, -1.2, -20, 9, 0.7, 0.9, { ph: 0.1, bob: 0.25 });
  hand(70, -1.5, -40, 11, -0.9, 1.3, { ph: 0.4, bob: 0.3 });
  hand(40, -1.0, 50, 7, 2.6, 1.6, { ph: 0.7, bob: 0.2 });
  hand(-80, -2.0, 70, 12, -2.2, 0.6, { ph: 0.25, bob: 0.3 });
  // fingertips breaking the surface here and there
  for (var ft = 0; ft < 14; ft++) { var tx = rrange(-150, 150), tz = rrange(-150, 150); if (Math.abs(tx - HX) < 30 && Math.abs(tz - HZ) < 30) continue; var ty = hgt(tx, tz); hands.geo(ugeo("cyl", 0.7, 6), tx, ty + 0.8, tz, 0.8, 2.6, 0.8, SKIN, { rz: rrange(-0.5, 0.5), rx: rrange(-0.5, 0.5), ph: rng(), bob: 0.08 }); hands.sph(tx, ty + 2.1, tz, 0.6, 0.6, 0.6, SKIN, { ph: rng(), bob: 0.08 }); }
  // far away, a hand raised out of the horizon as tall as weather
  hands.geo(ugeo("cyl", 0.8, 8), 120, 60, -330, 22, 150, 22, mix(SKIN, FOG, 0.3), {});
  hands.sph(120, 140, -330, 30, 22, 12, mix(SKIN, FOG, 0.3), {});
  for (var gf = 0; gf < 4; gf++) hands.geo(ugeo("cyl", 0.7, 6), 120 - 24 + gf * 16, 175 + (gf === 1 || gf === 2 ? 8 : 0), -330, 6, 50, 6, mix(SKIN, FOG, 0.3), { rz: (gf - 1.5) * 0.08 });
  // THE hand: open, palm up, its forearm lying across the dune like a road
  var hp = new MB({ light: [sunDir[0], 0.4, sunDir[2]], amb: 0.42 });
  var PR = 9;
  hp.sph(HX, PALM_Y - 1.6, HZ, PR, 2.2, PR * 1.05, SKIN, {}, 12, 6);
  for (var f2 = 0; f2 < 4; f2++) { var fa = -0.75 + f2 * 0.5, ux2 = Math.sin(fa), uz2 = -Math.cos(fa); finger(hp, {}, HX + ux2 * PR * 0.82, PALM_Y - 0.6, HZ + uz2 * PR * 0.82, ux2, uz2, 15 - Math.abs(f2 - 1.5) * 2, 1.3, 0.55, 0.15); }
  finger(hp, {}, HX + PR * 0.9, PALM_Y - 0.8, HZ + 1.5, 0.85, -0.5, 10, 1.5, 0.35, 0.3);
  // the forearm, lying across the dune like a road up to the wrist
  var FR = 3.6, FA0 = new THREE.Vector3(HX, hgt(HX, HZ + 44) - 0.3 - FR * 1.1 * 0.97, HZ + 44), FA1 = new THREE.Vector3(HX, PALM_Y + 0.1 - FR * 0.97, HZ + PR - 0.5);
  hp.cylSeg(FA0.x, FA0.y, FA0.z, FA1.x, FA1.y, FA1.z, FR * 1.1, FR, SKIN, 10, {});
  hp.sph(FA1.x, FA1.y + 0.4, FA1.z, FR * 1.05, FR * 0.9, FR * 1.05, SKIN, {}, 9, 6);
  g.add(function (x, z) { var dx = x - HX; if (Math.abs(dx) > FR * 0.8 || z > FA0.z || z < FA1.z - 1) return null; var t3 = clamp((FA0.z - z) / (FA0.z - FA1.z), 0, 1), rr3 = FR * (1.1 - 0.1 * t3); return FA0.y + (FA1.y - FA0.y) * t3 + Math.sqrt(Math.max(0, rr3 * rr3 - dx * dx)) * 0.97; });
  g.disc(HX, HZ, PR * 0.86, function (x, z) { var dx = x - HX, dz = z - HZ; return PALM_Y - 0.25 + (dx * dx + dz * dz) / (PR * PR) * 0.5; });
  // something asleep in the palm: small, bright, breathing
  var star = new MB({ amb: 1 });
  star.oct(HX, PALM_Y + 0.6, HZ, 0.45, 0.6, 0.45, 0xfff0c8, { glow: true, ph: 0.3, bob: 0.08 });
  var starM = star.build({ nochunk: true, bobSpeed: 0.6, bright: 1.4 });
  var sg = N2.glowSprite(0xffe0a0, 6); sg.position.set(HX, PALM_Y + 0.7, HZ); buildGroup.add(sg);
  var opened = false;
  sayIx(starM, HX, HZ, 2.6, ["something small and bright, asleep in the palm. it is warm, like a held breath", "you hold it a moment. it is the size of a heartbeat", "it does not wake. but the hand, very slowly, opens a little more"], { kind: "sleeping light", y: PALM_Y, on: function (e, n) { sg.scale.set(6 + n * 2, 6 + n * 2, 1); if (n >= 2 && !opened) { opened = true; portalObj(HX, HZ, 0.9, PALM_Y - 1, PALM_Y + 3, onward(), { b: 0.5, e: 0.0 }, "light"); beingSpeak("you could go where it is dreaming. step into the light"); } if (audio.ctx) { audio.creature("chime", 0, 0.7); } } });
  // a fingertip near the start, warm to the touch
  var tip = new MB({ amb: 0.6 }), tpx = 6, tpz = 26, tpy = hgt(tpx, tpz);
  tip.geo(ugeo("cyl", 0.7, 7), tpx, tpy + 0.6, tpz, 0.9, 1.8, 0.9, SKIN, { rz: 0.2, ph: 0.5, bob: 0.06 }); tip.sph(tpx - 0.15, tpy + 1.5, tpz, 0.65, 0.6, 0.65, SKIN, { ph: 0.5, bob: 0.06 });
  var tipM = tip.build({ nochunk: true, bobSpeed: 0.5 });
  sayIx(tipM, tpx, tpz, 2.4, ["a fingertip, warm as a cheek. somewhere under the sand, someone is dreaming of holding you", "you hold it, the way you'd hold a child's hand crossing a road", "the sand around it rises and falls. it is breathing"], { kind: "fingertip", y: tpy });
  mb.build(); hands.build({ bobSpeed: 0.18 }); hp.build();
  // sand blowing low over the dunes, toward the sun
  var sb = new MB({ amb: 1 });
  for (var s3 = 0; s3 < 160; s3++) { var bx = rrange(-80, 80), bz = rrange(-80, 80); sb.box(bx - 80, hgt(bx, bz) + rrange(0.1, 1.0), bz, rrange(1.5, 4), 0.04, 0.04, 0x3a2418, { fl: 1, glow: true, faces: "py pz" }); }
  sb.build({ flow: [1, 0, 0, 160], flowSpeed: 6, add: true, side: THREE.DoubleSide });
  var dust = new PC(); for (var d = 0; d < 200; d++) dust.add(rrange(-60, 60), rrange(0.3, 6), rrange(-60, 60), 0xffe0c0, rrange(0.06, 0.12), { bob: 0.5, sway: 1.2, tw: 0.5 }); dust.build({ bobSpeed: 0.4, bright: 0.6 });
  starfield(90, 400, 0xffe8ff, 0.8, { minY: 0.35, tw: 0.6 });
  // two old doorframes half sunk in the dunes
  gate(-46, hgt(-46, 10) - 0.4, 10, 0.9, 0xffe8c8, 0x8a6a5a, undefined, { w: 1.4, h: 2.5 });
  gate(54, hgt(54, -90) - 0.4, -90, -0.7, 0xffe8c8, 0x8a6a5a, undefined, { w: 1.4, h: 2.5 });
  soundSpots([
    { x: 0, z: 0, r: 999, a: 3, b: 6, fn: function () { audio.noise(2.6, "bandpass", 900, 500, 0.04, rr(-0.8, 0.8)); } },
    { x: HX, z: HZ, r: 60, a: 7, b: 11, fn: function (pan, k) { audio.creature("breath", pan, 0.6 + k * 0.4); } }
  ]);
  return zone({ P: P, mood: mood, spawn: { x: 0, z: 40, y: hgt(0, 40), yaw: 0 }, ground: g.fn(), fog: [FOG, 30, 260], sky: SKY[1], bounds: 170, sound: "wind", desat: 0.05 });
});

/* =============================================================================
   12. the observatory of mended stars — a mountaintop above a sea of cloud.
   scaffolds climb into the night, hung with stars on chains; some are cracked
   and dim, waiting. a crane turns slowly with one in its hook. climb to the
   catwalk and mend the one at the end.
   ============================================================================= */
reg("star_mending_observatory", "the observatory of mended stars", 1, ["stars", "observatory", "night", "mountain"], function (P, mood) {
  var v = rng();
  var SKY = v < 0.5 ? [0x0c1428, 0x1c2a4a, 0x0a1230, 0x02040c] : [0x140c24, 0x2a1c44, 0x120a2a, 0x04020a];
  var FOG = v < 0.5 ? 0x1a2848 : 0x241a40, STAR = 0xfff0c0, IRON = 0x3a3e50, IRONL = 0x5a5e72;
  skyDome({ c: SKY, stops: [-0.25, -0.02, 0.2, 0.8] });
  // the sky: a dense field, and a river of stars across it; some blink while they are being mended
  var sf = new PC();
  for (var i = 0; i < 900; i++) { var u = 0.03 + rng() * 0.97, th = rng() * TAU, s = Math.sqrt(1 - u * u); sf.add(Math.cos(th) * s * 420, u * 420, Math.sin(th) * s * 420, pick([0xffffff, 0xfff0d0, 0xd0e0ff]), rrange(0.5, 1.4), { tw: rng() < 0.06 ? -0.4 : rng() * 0.6 }); }
  for (var j = 0; j < 700; j++) { var t = rng() * TAU, w = (rng() - 0.5) * 0.25, dir = new THREE.Vector3(Math.cos(t), Math.sin(t) * 0.9 + w, Math.sin(t) * 0.3 + w).normalize(); if (dir.y < 0.02) dir.y = -dir.y + 0.02; dir.normalize().multiplyScalar(410); sf.add(dir.x, dir.y, dir.z, 0xe8e0ff, rrange(0.4, 0.9), { tw: rng() * 0.5 }); }
  var sfm = sf.build({ twSpeed: 1.4, nofog: true }); if (sfm) followCam(sfm, true);
  var g = new GS();
  var PR = 42;
  function hgt(x, z) { var d = Math.sqrt(x * x + z * z); return d < PR - 6 ? Math.sin(x * 0.2) * Math.cos(z * 0.17) * 0.25 : -(d - PR + 6) * 1.4; }
  g.add(function (x, z) { return (x * x + z * z < (PR - 1) * (PR - 1)) ? hgt(x, z) : null; });
  var mb = new MB({ light: [0.3, 0.8, -0.5], amb: 0.5 });
  mb.field(0, 0, 2 * PR + 10, 2 * PR + 10, 26, 26, hgt, function (x, y, z) { return y > -0.5 ? mix(0x3a3a4a, 0x4a4a5a, (Math.sin(x) * Math.cos(z) + 1) / 2) : 0x2a2a38; }, { skip: function (x, z) { return x * x + z * z > (PR + 4) * (PR + 4); } });
  // the mountain falling away beneath, rocks at the edge
  mb.cyl(0, -30, 0, PR + 2, 50, 0x22222e, 14, {}, 0.6);
  for (var r = 0; r < 70; r++) { var ra = rng() * TAU, rd = rrange(PR - 5, PR + 1), rx = Math.cos(ra) * rd, rz = Math.sin(ra) * rd; mb.geo(ugeo("ico"), rx, hgt(rx, rz) + 0.3, rz, rrange(1, 3), rrange(0.8, 2.2), rrange(1, 3), mix(0x2a2a38, 0x4a4a58, rng()), { ry: rng() * 6 }); }
  // the sea of cloud far below, moonlit
  var cl = new MB({ light: [0.3, 1, -0.4], amb: 0.6 });
  for (var c = 0; c < 70; c++) { var ca = rng() * TAU, cd = rrange(55, 300), big = rrange(14, 40); cl.geo(ugeo("ico"), Math.cos(ca) * cd, rrange(-34, -26), Math.sin(ca) * cd, big, big * 0.3, big * 0.8, mix(0x6a7aa0, 0xa8b4d0, rng()), { ry: rng() * 6, bob: rrange(0.3, 0.8), ph: rng() }); }
  cl.geo(ugeo("disc", 24), 0, -32, 0, 420, 420, 1, 0x5a6890, { glow: true, rx: -Math.PI / 2 });
  cl.build({ bobSpeed: 0.15 });
  // the observatory: a drum, a dome with its slit open, the telescope looking out
  var OX = -14, OZ = -10, OR = 8, OH = 6;
  var wallSegs = 20;
  for (var ws = 0; ws < wallSegs; ws++) {
    var a0 = ws / wallSegs * TAU, a1 = (ws + 1) / wallSegs * TAU, am = (a0 + a1) / 2;
    if (Math.abs(((am - Math.PI / 2) + TAU) % TAU) < 0.25 || Math.abs(((am - Math.PI / 2) + TAU) % TAU - TAU) < 0.25) continue;   // the doorway faces +z
    var wx = OX + Math.cos(am) * OR, wz = OZ + Math.sin(am) * OR, wlen = 2 * OR * Math.sin(Math.PI / wallSegs) + 0.1;
    mb.box(wx, OH / 2, wz, wlen, OH, 0.4, 0xc8c4bc, { ry: -am + Math.PI / 2, faces: "px nx pz nz" });
    solid(wx, wz, wlen / 2, 0.25, -am + Math.PI / 2, -1, OH);
  }
  mb.geo(ugeo("tor", 0.05, 24), OX, OH, OZ, OR + 0.2, OR + 0.2, OR + 0.2, 0x8a8678, { rx: Math.PI / 2 });
  for (var dm = 0; dm < 16; dm++) {
    if (dm === 3 || dm === 4) continue;            // the slit
    var d0 = dm / 16 * TAU, d1 = (dm + 1) / 16 * TAU;
    for (var lat = 0; lat < 4; lat++) {
      var e0 = lat / 4 * Math.PI / 2, e1 = (lat + 1) / 4 * Math.PI / 2, R0 = OR + 0.3;
      var p00 = new THREE.Vector3(OX + Math.cos(d0) * Math.cos(e0) * R0, OH + Math.sin(e0) * R0, OZ + Math.sin(d0) * Math.cos(e0) * R0);
      var p10 = new THREE.Vector3(OX + Math.cos(d1) * Math.cos(e0) * R0, OH + Math.sin(e0) * R0, OZ + Math.sin(d1) * Math.cos(e0) * R0);
      var p11 = new THREE.Vector3(OX + Math.cos(d1) * Math.cos(e1) * R0, OH + Math.sin(e1) * R0, OZ + Math.sin(d1) * Math.cos(e1) * R0);
      var p01 = new THREE.Vector3(OX + Math.cos(d0) * Math.cos(e1) * R0, OH + Math.sin(e1) * R0, OZ + Math.sin(d0) * Math.cos(e1) * R0);
      mb.quad(p00, p01, p11, p10, (dm + lat) % 2 ? 0xd8d4cc : 0xc0bcb4, {}); mb.quad(p00, p10, p11, p01, 0x3a3640, {});
    }
  }
  // the telescope, aimed up through the slit
  var ta = 3.5 / 16 * TAU, tdx = Math.cos(ta), tdz = Math.sin(ta);
  mb.cylSeg(OX - tdx * 2, 2.2, OZ - tdz * 2, OX + tdx * 5.5, 9.5, OZ + tdz * 5.5, 0.9, 0.75, 0x4a4e66, 10, {});
  mb.cylSeg(OX, 0, OZ, OX, 2.6, OZ, 0.8, 0.5, IRON, 8, {});
  pushSolidCyl(OX, OZ, 0.9, 0, 3);
  // workbenches with star fragments, glowing; tools laid out
  var glowM = new MB({ amb: 1 }), sparks = new PC();
  for (var wb = 0; wb < 3; wb++) {
    var bx = OX + [-4.5, 3.5, 0][wb], bz = OZ + [2.5, 3, -5][wb];
    mb.box(bx, 0.9, bz, 2.2, 0.1, 1.0, 0x5a4636, {}); for (var lg = 0; lg < 4; lg++) mb.box(bx + (lg & 1 ? 1 : -1), 0.45, bz + (lg & 2 ? 0.4 : -0.4), 0.08, 0.9, 0.08, 0x3a2a22, { faces: "px nx pz nz" });
    solid(bx, bz, 1.1, 0.5, 0, 0, 1);
    for (var fr = 0; fr < 4; fr++) { var fx = bx + rrange(-0.8, 0.8), fz = bz + rrange(-0.3, 0.3); glowM.oct(fx, 1.05, fz, 0.1, 0.16, 0.1, STAR, { glow: true, ry: rng() * 3, tw: 0.4 }); sparks.add(fx, 1.2, fz, STAR, 0.5, { tw: 0.9 }); }
  }
  // scaffolds climbing into the sky, hung with stars on chains
  var SC = [[16, -18, 30], [22, 14, 24], [-20, 20, 34]], hung = [];
  function scaffold(x, z, h) {
    var s2 = 2.2;
    for (var cn = 0; cn < 4; cn++) mb.box(x + (cn & 1 ? s2 : -s2), h / 2, z + (cn & 2 ? s2 : -s2), 0.22, h, 0.22, IRON, { faces: "px nx pz nz" });
    for (var lv = 3; lv < h; lv += 3) { mb.box(x, lv, z - s2, 2 * s2, 0.14, 0.14, IRONL, {}); mb.box(x, lv, z + s2, 2 * s2, 0.14, 0.14, IRONL, {}); mb.box(x - s2, lv, z, 0.14, 0.14, 2 * s2, IRONL, {}); mb.box(x + s2, lv, z, 0.14, 0.14, 2 * s2, IRONL, {}); if ((lv / 3) % 2) { mb.seg(x - s2, lv - 3, z - s2, x + s2, lv, z - s2, 0.08, 0.08, IRON); mb.seg(x + s2, lv - 3, z + s2, x - s2, lv, z + s2, 0.08, 0.08, IRON); } }
    for (var cn2 = 0; cn2 < 4; cn2++) pushSolidBox(x + (cn2 & 1 ? s2 : -s2), z + (cn2 & 2 ? s2 : -s2), 0.15, 0.15, 0, 0, h);
    // arms reaching out with stars on chains
    for (var arm = 0; arm < 3; arm++) {
      var aa = rng() * TAU, al = rrange(5, 9), ay = h - rrange(0, 8), ex = x + Math.cos(aa) * al, ez = z + Math.sin(aa) * al;
      mb.seg(x, ay, z, ex, ay, ez, 0.15, 0.15, IRONL);
      var cl2 = rrange(2, 6); mb.box(ex, ay - cl2 / 2, ez, 0.04, cl2, 0.04, 0x8a8a9a, { sway: 0.04, ph: arm * 0.3 });
      var broken = rng() < 0.45; hung.push([ex, ay - cl2 - 0.7, ez, broken]);
    }
  }
  for (var sci = 0; sci < SC.length; sci++) scaffold(SC[sci][0], SC[sci][1], SC[sci][2]);
  // stars hanging; the broken ones are dim and cracked
  for (var hs = 0; hs < hung.length; hs++) { var hh = hung[hs]; if (hh[3]) { glowM.oct(hh[0], hh[1], hh[2], 0.6, 0.85, 0.6, 0x6a6058, { ph: hs * 0.1, sway: 0.04, glow: true }); glowM.box(hh[0], hh[1], hh[2] + 0.01, 0.05, 1.2, 0.05, 0x1a1418, { ph: hs * 0.1, sway: 0.04, glow: true, rz: 0.5 }); sparks.add(hh[0], hh[1], hh[2], 0xffd890, 0.8, { tw: 1.0, ph: rng() }); } else { glowM.oct(hh[0], hh[1], hh[2], 0.6, 0.85, 0.6, STAR, { ph: hs * 0.1, sway: 0.04, glow: true }); sparks.add(hh[0], hh[1], hh[2], STAR, 3.0, { ph: rng(), tw: 0.3 }); } }
  // the climbable scaffold: switchback stairs inside the first frame to a catwalk
  var CX = SC[0][0], CZ = SC[0][1], CATY = 15, rise = 0.5, run = 0.75, NS = 10, yb = 0;
  for (var fl = 0; fl < 3; fl++) {
    var dirz = fl % 2 ? -1 : 1, sx = CX + (fl % 2 ? 1.1 : -1.1), sz0 = CZ - dirz * 3.6;
    for (var st = 0; st < NS; st++) mb.box(sx, yb + rise * (st + 1) - 0.08, sz0 + dirz * (st + 0.5) * run, 1.6, 0.16, run, st % 2 ? IRONL : 0x6a6e82, { faces: "px nx py pz nz" });
    g.stairs(sx, sz0, 0.8, NS, run, rise, yb, dirz > 0 ? 0 : Math.PI);
    yb += rise * NS;
    var lz = sz0 + dirz * (NS * run + 0.8);
    mb.box(CX, yb - 0.08, lz, 4.4, 0.16, 1.6, IRONL, { faces: "px nx py pz nz" });
    g.rect(CX, lz, 2.2, 0.85, yb);
  }
  // NB: three flights of 5 m reach the catwalk at 15 m
  var catZ = CZ + 3.6 + 0.8, catLen = 22, cdir = new THREE.Vector3(-0.55, 0, 0.83).normalize();
  var ce = new THREE.Vector3(CX + cdir.x * catLen, CATY, catZ + cdir.z * catLen), cm = new THREE.Vector3((CX + ce.x) / 2, CATY, (catZ + ce.z) / 2), cry = Math.atan2(cdir.x, cdir.z);
  mb.box(cm.x, CATY - 0.08, cm.z, 1.4, 0.16, catLen, IRONL, { ry: cry, faces: "px nx py ny" });
  for (var cp = 0; cp <= catLen; cp += 2) for (var cs = -1; cs <= 1; cs += 2) { var ppx = CX + cdir.x * cp + Math.cos(cry) * cs * 0.7, ppz = catZ + cdir.z * cp - Math.sin(cry) * cs * 0.7; mb.box(ppx, CATY + 0.55, ppz, 0.06, 1.1, 0.06, IRON, { faces: "px nx pz nz" }); }
  mb.seg(CX + Math.cos(cry) * 0.7, CATY + 1.1, catZ - Math.sin(cry) * 0.7, ce.x + Math.cos(cry) * 0.7, CATY + 1.1, ce.z - Math.sin(cry) * 0.7, 0.06, 0.06, IRON);
  mb.seg(CX - Math.cos(cry) * 0.7, CATY + 1.1, catZ + Math.sin(cry) * 0.7, ce.x - Math.cos(cry) * 0.7, CATY + 1.1, ce.z + Math.sin(cry) * 0.7, 0.06, 0.06, IRON);
  mb.box(ce.x, CATY - 0.08, ce.z, 3, 0.16, 3, IRONL, {});
  g.rect(cm.x, cm.z, 0.65, catLen / 2 + 0.6, CATY, cry); g.rect(ce.x, ce.z, 1.5, 1.5, CATY);
  for (var sp2 = 0; sp2 < 3; sp2++) { var sxp = CX + cdir.x * catLen * (0.35 + sp2 * 0.3), szp = catZ + cdir.z * catLen * (0.35 + sp2 * 0.3); mb.box(sxp, CATY / 2, szp, 0.25, CATY, 0.25, IRON, { faces: "px nx pz nz" }); pushSolidBox(sxp, szp, 0.15, 0.15, 0, 0, CATY - 2); }
  // the crane: turning slowly, a dim star in its hook
  var crane = new THREE.Group(); crane.position.set(4, 0, 22); buildGroup.add(crane);
  var cb = new MB({ light: [0.3, 0.8, -0.5], amb: 0.5 });
  cb.box(0, 13, 0, 0.8, 26, 0.8, IRON, { faces: "px nx pz nz" }); cb.box(5, 26, 0, 16, 0.6, 0.6, IRONL, {}); cb.box(-4, 25.6, 0, 3, 1.4, 1.4, IRON, {});
  cb.box(11, 21, 0, 0.04, 10, 0.04, 0x8a8a9a, {}); cb.oct(11, 15.4, 0, 0.8, 1.1, 0.8, 0x7a6e60, { glow: true });
  cb.build({ parent: crane, nochunk: true });
  pushSolidCyl(4, 22, 0.6, 0, 26);
  anim(function (dt, t2) { crane.rotation.y = Math.sin(t2 * 0.07) * 1.2; });
  mb.build(); glowM.build({ bobSpeed: 0.6, twSpeed: 4 }); sparks.build({ twSpeed: 9, bright: 1.1 });
  // the star at the end of the catwalk, waiting to be mended
  var bsG = new THREE.Group(); bsG.position.set(ce.x + cdir.x * 2.2, CATY + 1.8, ce.z + cdir.z * 2.2); buildGroup.add(bsG);
  var bs = new MB({ amb: 1 });
  bs.oct(0, 0, 0, 0.9, 1.25, 0.9, 0xffffff, { glow: true }); bs.box(0, 2.3, 0, 0.04, 2.2, 0.04, 0x8a8a9a, { glow: true }); bs.box(0, 0, 0.02, 0.07, 1.6, 0.07, 0x000000, { glow: true, rz: 0.4 }); bs.box(0.2, -0.3, 0.02, 0.07, 0.8, 0.07, 0x000000, { glow: true, rz: -0.7 });
  var bsM = bs.build({ parent: bsG, nochunk: true });
  if (bsM) bsM.material.uniforms.uBright.value = 0.32;
  var mendGlow = N2.glowSprite(STAR, 0.5); mendGlow.position.copy(bsG.position); buildGroup.add(mendGlow);
  var mended = 0;
  sayIx(bsG, bsG.position.x - cdir.x * 1.2, bsG.position.z - cdir.z * 1.2, 2.6, ["a cracked star, cold to the touch. you hold the pieces together", "you breathe on it, the way you'd warm your hands. the crack closes", "it is mended. it remembers how to shine, and goes up to where it belongs"], { kind: "broken star", y: CATY, on: function (e, n) {
    mended = n;
    if (audio.ctx) { N2.chime(523 * Math.pow(1.25, n - 1), 2.4, 0.08); if (n >= 3) { N2.chime(659, 3, 0.07); N2.chime(784, 3.4, 0.06); } }
    if (n >= 3 && !e._done) { e._done = true; portalObj(bsG.position.x, bsG.position.z, 1.3, CATY - 1, CATY + 4, onward(), { b: 0.6, e: 0.2 }, "star"); }
  } });
  anim(function (dt, t3) {
    if (!bsM) return; var u2 = bsM.material.uniforms.uBright, want = mended >= 3 ? 2.2 : 0.32 + mended * 0.4;
    u2.value += (want - u2.value) * Math.min(1, dt * 2);
    var sc = 0.5 + Math.max(0, u2.value - 0.3) * 6; mendGlow.scale.set(sc, sc, 1);
    bsG.rotation.y = t3 * 0.3; bsG.position.y = CATY + 1.8 + (mended >= 3 ? Math.min(8, (u2.value - 0.3) * 0.5) : Math.sin(t3) * 0.08);
    mendGlow.position.y = bsG.position.y;
  });
  var scope = new THREE.Object3D(); scope.position.set(OX - tdx * 2, 2.4, OZ - tdz * 2); buildGroup.add(scope);
  sayIx(scope, OX - tdx * 2.5, OZ - tdz * 2.5, 2.4, ["through it you see a window, very far away. a light is on. it is yours", "the lens is fogged from the inside, as if someone was just looking", "a list taped to the eyepiece: stars still to mend. it is very long, and someone has been crossing them off"], { kind: "telescope" });
  gate(OX, 0, OZ - OR + 0.5, 0, 0xfff0c8, IRON, undefined, { w: 1.3, h: 2.4 });
  soundSpots([
    { x: 0, z: 0, r: 999, a: 4, b: 9, fn: function () { audio.creature("tick", rr(-0.7, 0.7), rrange(0.4, 0.8)); } },
    { x: 0, z: 0, r: 999, a: 10, b: 18, fn: function () { audio.creature("chime", rr(-0.6, 0.6), rrange(0.5, 1.2)); } },
    { x: CX, z: CZ, r: 25, a: 5, b: 9, fn: function (pan) { audio.creature("creak", pan, 0.6); } }
  ]);
  return zone({ P: P, mood: mood, spawn: { x: 2, z: 30, y: hgt(2, 30), yaw: Math.PI * 0.15 }, ground: g.fn(), fog: [FOG, 24, 260], sky: SKY[1], killY: -24, sound: "glass" });
});
