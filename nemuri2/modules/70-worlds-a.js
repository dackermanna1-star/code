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
  "attribute vec3 aCol;", "attribute vec4 aMot;", "attribute float aFx;",
  "varying vec3 vCol;", "varying float vDist;", "varying float vEdge;", "varying vec2 vUvA;", "varying float vWA;",
  "uniform vec2 uGrid;", "uniform float uT;", "uniform vec4 uFlow;", "uniform vec3 uRate;",
  "void main() {",
  "  vec3 p = position; float ph = aMot.x; vEdge = 1.0;",
  "  if (uFlow.w > 0.0 && aMot.y > 0.0) { float k = fract(ph + uT * uRate.x / uFlow.w); p += uFlow.xyz * (k * uFlow.w) * aMot.y; vEdge = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.92, 1.0, k)); }",
  "  p.y += sin(uT * uRate.y + ph * 6.2831) * aMot.z;",
  "  p.x += sin(uT * uRate.y * 0.71 + ph * 11.0) * aMot.w; p.z += cos(uT * uRate.y * 0.53 + ph * 7.0) * aMot.w;",
  "  float tw = 1.0;",
  "  if (aFx > 0.0) tw = 1.0 - aFx * (0.5 + 0.5 * sin(uT * uRate.z + ph * 40.0));",
  "  else if (aFx < 0.0) tw = mix(1.0, 0.12, step(fract(uT * uRate.z * 0.02 + ph * 3.7), -aFx));",
  "  vCol = aCol * tw;",
  "  vec4 mv = modelViewMatrix * vec4(p, 1.0); vDist = -mv.z;",
  "  vec4 clip = projectionMatrix * mv; vec3 ndc = clip.xyz / clip.w;",
  "  ndc.xy = floor(ndc.xy * uGrid + 0.5) / uGrid; clip.xyz = ndc * clip.w; gl_Position = clip;",
  "  vUvA = uv * clip.w; vWA = clip.w;",
  "}"].join("\n");
var VC_FRAG = [
  "varying vec3 vCol;", "varying float vDist;", "varying float vEdge;", "varying vec2 vUvA;", "varying float vWA;",
  "uniform vec3 uFog;", "uniform vec2 uFogDist;", "uniform float uBright;", "uniform float uOpacity;",
  "uniform sampler2D uMap;", "uniform float uHasMap;", "uniform vec2 uScroll;", "uniform float uT;",
  "void main() {",
  "  vec3 col = vCol * uBright; float a = uOpacity;",
  "  if (uHasMap > 0.5) { vec4 t = texture2D(uMap, vUvA / vWA + uScroll * uT); col *= t.rgb; a *= t.a; }",
  "  if (a < 0.04) discard;",
  "  float f = clamp((vDist - uFogDist.x) / max(0.001, uFogDist.y - uFogDist.x), 0.0, 1.0);",
  "#ifdef ADD",
  "  gl_FragColor = vec4(col * (1.0 - f) * vEdge * a, 1.0);",
  "#else",
  "  gl_FragColor = vec4(mix(col, uFog, max(f, 1.0 - vEdge)), a);",
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
  "  float f = clamp((d - uFogDist.x) / max(0.001, uFogDist.y - uFogDist.x), 0.0, 1.0);",
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
var SKY_VERT = [
  "varying vec3 vDir;",
  "void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"].join("\n");
var SKY_FRAG = [
  "varying vec3 vDir;",
  "uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec4 uStops;",
  "uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec2 uSun; uniform float uDim;",
  "void main() {",
  "  vec3 dir = normalize(vDir); float y = dir.y;",
  "  vec3 c = uC0;",
  "  c = mix(c, uC1, smoothstep(uStops.x, uStops.y, y));",
  "  c = mix(c, uC2, smoothstep(uStops.y, uStops.z, y));",
  "  c = mix(c, uC3, smoothstep(uStops.z, uStops.w, y));",
  "  float sd = max(dot(dir, uSunDir), 0.0);",
  "  c += uSunCol * (pow(sd, uSun.y) * 0.55 + smoothstep(1.0 - uSun.x, 1.0 - uSun.x * 0.55, sd));",
  "  float n = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);",
  "  gl_FragColor = vec4(c * uDim + (n - 0.5) / 96.0, 1.0);",
  "}"].join("\n");

/* --------------------------------------------------------------- materials */
function vcMat(o) {
  o = o || {};
  var fl = o.flow || null;
  var u = {
    uMap: { value: o.map || null }, uHasMap: { value: o.map ? 1 : 0 },
    uOpacity: { value: o.opacity != null ? o.opacity : 1 }, uBright: { value: o.bright != null ? o.bright : 1 },
    uScroll: { value: o.scroll || new THREE.Vector2(0, 0) },
    uFlow: { value: fl ? new THREE.Vector4(fl[0], fl[1], fl[2], fl[3]) : new THREE.Vector4(0, 0, 0, 0) },
    uRate: { value: new THREE.Vector3(o.flowSpeed || 1, o.bobSpeed || 0.6, o.twSpeed || 2) },
    uT: UT, uFog: U_fog, uFogDist: U_fogDist, uGrid: U_grid
  };
  var add = !!o.add;
  var m = new THREE.ShaderMaterial({
    vertexShader: VC_VERT, fragmentShader: VC_FRAG, uniforms: u, defines: add ? { ADD: 1 } : {},
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
    vertexShader: PT_VERT, fragmentShader: PT_FRAG,
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
  _eu.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || "YXZ"); _q.setFromEuler(_eu);
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
  for (var k = 0; k < 3; k++) { _c.set(cs[k]); var sh = this._shade(nx, ny, nz, vs[k].y, o); this._push(vs[k], 0, 0, _c.r, _c.g, _c.b, sh, o, ph); }
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
MB.prototype.count = function () { return this.P.length / 3; };
MB.prototype.build = function (mo) {
  if (!this.P.length) return null;
  mo = mo || {};
  var g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(this.P, 3));
  g.setAttribute("aCol", new THREE.Float32BufferAttribute(this.C, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(this.U, 2));
  g.setAttribute("aMot", new THREE.Float32BufferAttribute(this.M, 4));
  g.setAttribute("aFx", new THREE.Float32BufferAttribute(this.F, 1));
  g.computeBoundingSphere();
  var m = new THREE.Mesh(g, vcMat(mo));
  if (mo.flow || mo.nocull) m.frustumCulled = false;
  if (mo.order != null) m.renderOrder = mo.order;
  this.P = this.C = this.U = this.M = this.F = null;
  (mo.parent || buildGroup).add(m);
  return m;
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
  var m = pc.build({ scale: o.scale || 1, twSpeed: o.twSpeed || 1.6, bright: o.bright || 1 });
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
      uSun: { value: new THREE.Vector2(o.sun ? (o.sun.size || 0.02) : 0.0001, o.sun ? (o.sun.glow || 8) : 8) },
      uDim: { value: dim }
    },
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false
  });
  var dome = new THREE.Mesh(new THREE.SphereGeometry(560, 24, 16), m);
  dome.renderOrder = -100; dome.frustumCulled = false;
  buildGroup.add(dome);
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
  var ftex = tex(function (x, s) { x.fillStyle = hex(new THREE.Color(floorA)); x.fillRect(0, 0, s, s); x.fillStyle = hex(new THREE.Color(floorB)); x.fillRect(0, 0, s / 2, s / 2); x.fillRect(s / 2, s / 2, s / 2, s / 2); x.fillStyle = "rgba(255,255,255,0.08)"; x.fillRect(0, 0, s, 2); x.fillRect(0, 0, 2, s); });
  var fl = new MB({ amb: 1 });
  fl.geo(ugeo("planeN", 8, 26), 0, 0, (Z0 + Z1) / 2, X1 - X0, Z1 - Z0, 1, 0xffffff, { rx: -Math.PI / 2, uvs: [(X1 - X0) / 8, (Z1 - Z0) / 8], glow: true });
  fl.build({ map: ftex });
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
  for (var ls = 0; ls < 14; ls++) {
    var lzz = -55 + ls * 11 + rrange(-2, 2), lsx = rng() < 0.5 ? -1 : 1;
    var top = [lsx * 25, 20, lzz], bot = [lsx * rrange(4, 10), 0, lzz + rrange(-3, 6)];
    lb.seg(top[0], top[1], top[2], bot[0], bot[1], bot[2], rrange(1.6, 2.8), 6, warm ? 0x2a2218 : 0x1c2228, { glow: true, ao: [0, 20, 0.1, 1] });
  }
  lb.build({ add: true });
  // the cloud ceiling, drifting slowly sideways
  var cl = new MB({ light: [0.2, 1, 0.3], amb: 0.62 });
  var cloudCol = warm ? 0xf2ebf0 : 0xeef2f6;
  for (var c = 0; c < 64; c++) {
    var ccx = -150, ccy = rrange(38, 58), ccz = rrange(-80, 120), ph = rng(), big = rrange(7, 17);
    for (var pf = 0; pf < 3; pf++) cl.geo(ugeo("ico"), ccx + rrange(-big, big), ccy + rrange(-1.5, 2.5), ccz + rrange(-big * 0.6, big * 0.6), big * rrange(0.7, 1.2), big * rrange(0.3, 0.45), big * rrange(0.6, 0.9), cloudCol, { fl: 1, ph: ph, under: 0.78, ry: rng() * 6 });
  }
  cl.build({ flow: [1, 0, 0, 300], flowSpeed: 1.4 });
  // the sea of cloud below the floor
  var cb = new MB({ light: [0.2, 1, 0.3], amb: 0.7 });
  for (var b2 = 0; b2 < 50; b2++) { var bx = rrange(-160, 160), bz = rrange(-140, 200); if (Math.abs(bx) < 30 && bz > -75 && bz < 105) continue; var bs2 = rrange(10, 24); cb.geo(ugeo("ico"), bx, rrange(-14, -7), bz, bs2, bs2 * 0.35, bs2 * 0.8, cloudCol, { bob: rrange(0.2, 0.6), ry: rng() * 6 }); }
  cb.disc(0, -12, 0, 260, mix(cloudCol, FOG, 0.4), 24, { glow: true });
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
