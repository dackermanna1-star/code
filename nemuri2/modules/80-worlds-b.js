/* =============================================================================
   nemuri II — module 80: WORLDS B — "intimate & uncanny"
   Twelve hand-built worlds, each authored on its own: the classroom after
   hours, the laundromat at four, the drowned waiting room, grandmother's
   house grown too large, the motel of your name, the drained pool, the
   karaoke room of singing chairs, the stairwell between floors, the last bus
   stop, the theatre of coats, the attic of breathing toys, and the vending
   machines at the end of the world.

   Built with a small private toolkit:
     * baked light — geometry is merged into a few vertex-coloured batches and
       lit once at build time (sky/ground ambient, a key direction and point
       lamps), so rooms get real pools of lamplight at almost no runtime cost;
     * analytic floors — every walkable surface is a rect / ramp, sampled
       honouring groundClampY, so stairs, landings and lofts just work;
     * solid walls with door/window gaps, exit doors with light leaking out,
       poetic interactables, fog-aware motes, one animation entity per world.
   API: N2.mods.worldsB = { worlds: [names], info: {name: {title, tags}}, isMine(name) }
   ============================================================================= */
var WB = N2.mods.worldsB = { worlds: [], info: {}, version: "1.0" };
var MINE = WB.worlds;
function isMine(n) { return MINE.indexOf(n) >= 0; }
WB.isMine = isMine;
var NO = {};
var TAU = Math.PI * 2;

/* ------------------------------------------------------------ colour ---- */
function C(v) { return (v && v.isColor) ? v.clone() : new THREE.Color(v == null ? 0xffffff : v); }
function hsl(h, s, l) { return new THREE.Color().setHSL(((h % 1) + 1) % 1, clamp(s, 0, 1), clamp(l, 0, 1)); }
function mixC(a, b, t) { return C(a).lerp(C(b), t); }
function cssOf(c) { return "#" + C(c).getHexString(); }

/* --------------------------------------------- baked vertex-colour material */
var VC_VERT = [
  "attribute vec3 aCol;",
  "varying vec3 vCol;",
  "varying vec2 vUvA;",
  "varying float vWA;",
  "varying float vDist;",
  "uniform vec2 uGrid;",
  "uniform vec2 uRepeat;",
  "void main() {",
  "  vec4 lp = vec4(position, 1.0);",
  "#ifdef USE_INSTANCING",
  "  lp = instanceMatrix * lp;",
  "#endif",
  "  vec4 mv = modelViewMatrix * lp;",
  "  vDist = -mv.z;",
  "  vec4 clip = projectionMatrix * mv;",
  "  vec3 ndc = clip.xyz / clip.w;",
  "  ndc.xy = floor(ndc.xy * uGrid + 0.5) / uGrid;",
  "  clip.xyz = ndc * clip.w;",
  "  gl_Position = clip;",
  "  float w = clip.w;",
  "  vUvA = uv * uRepeat * w;",
  "  vWA = w;",
  "#ifdef USE_INSTANCING_COLOR",
  "  vCol = aCol * instanceColor;",
  "#else",
  "  vCol = aCol;",
  "#endif",
  "}"
].join("\n");
var VC_FRAG = [
  "varying vec3 vCol;",
  "varying vec2 vUvA;",
  "varying float vWA;",
  "varying float vDist;",
  "uniform sampler2D uMap;",
  "uniform float uHasMap;",
  "uniform vec3 uColor;",
  "uniform float uOpacity;",
  "uniform vec3 uFog;",
  "uniform vec2 uFogDist;",
  "uniform vec2 uScroll;",
  "uniform float uTime;",
  "uniform float uBright;",
  "void main() {",
  "  vec2 uv = vUvA / vWA + uScroll * uTime;",
  "  vec3 col = uColor * vCol;",
  "  float a = uOpacity;",
  "  if (uHasMap > 0.5) { vec4 t = texture2D(uMap, uv); col *= t.rgb; a *= t.a; }",
  "  col *= uBright;",
  "  if (a < 0.04) discard;",
  "  float f = clamp((vDist - uFogDist.x) / max(0.001, uFogDist.y - uFogDist.x), 0.0, 1.0);",
  "  col = mix(col, uFog, f);",
  "  gl_FragColor = vec4(col, a);",
  "}"
].join("\n");
function vcMat(o) {
  o = o || NO;
  var m = new THREE.ShaderMaterial({
    vertexShader: VC_VERT, fragmentShader: VC_FRAG,
    uniforms: {
      uMap: { value: o.map || null }, uHasMap: { value: o.map ? 1 : 0 },
      uColor: { value: C(o.color == null ? 0xffffff : o.color) },
      uOpacity: { value: o.opacity == null ? 1 : o.opacity },
      uScroll: { value: o.scroll || new THREE.Vector2(0, 0) },
      uBright: { value: o.bright == null ? 1 : o.bright },
      uRepeat: { value: new THREE.Vector2(1, 1) },
      uTime: U_time, uFog: U_fog, uFogDist: U_fogDist, uGrid: U_grid
    },
    transparent: !!o.transparent,
    depthWrite: o.depthWrite != null ? o.depthWrite : !o.transparent,
    side: o.side != null ? o.side : THREE.FrontSide,
    fog: false
  });
  if (o.additive) m.blending = THREE.AdditiveBlending;
  if (o.transparent) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1; }
  return m;
}

/* soft round points that fade into the fog (dust, snow, bubbles, fireflies) */
var PT_VERT = [
  "uniform float uSize;", "uniform float uScale;", "uniform vec2 uFogDist;", "varying float vF;",
  "void main() {",
  "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
  "  gl_Position = projectionMatrix * mv;",
  "  float d = max(0.2, -mv.z);",
  "  gl_PointSize = clamp(uSize * uScale / d, 1.0, 9.0);",
  "  vF = clamp((d - uFogDist.x) / max(0.001, uFogDist.y - uFogDist.x), 0.0, 1.0);",
  "}"
].join("\n");
var PT_FRAG = [
  "uniform vec3 uColor;", "uniform float uOpacity;", "varying float vF;",
  "void main() {",
  "  vec2 c = gl_PointCoord - 0.5;",
  "  float a = 1.0 - smoothstep(0.15, 0.5, length(c));",
  "  a *= uOpacity * (1.0 - vF);",
  "  if (a < 0.02) discard;",
  "  gl_FragColor = vec4(uColor * a, a);",
  "}"
].join("\n");
function ptMat(col, size, opacity) {
  var m = new THREE.ShaderMaterial({
    vertexShader: PT_VERT, fragmentShader: PT_FRAG,
    uniforms: { uColor: { value: C(col) }, uOpacity: { value: opacity == null ? 0.8 : opacity }, uSize: { value: size || 0.08 }, uScale: { value: (typeof internalH === "number" ? internalH : 232) * 0.5 }, uFogDist: U_fogDist },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  });
  return m;
}

/* ---------------------------------------------------- baked-light batch ---- */
// faces: normal, u axis, v axis, and which half-extent (0 x, 1 y, 2 z) each uses
var FACES = [
  [1, 0, 0, 0, 0, -1, 0, 1, 0, 0, 2, 1],
  [-1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 1],
  [0, 1, 0, 1, 0, 0, 0, 0, -1, 1, 0, 2],
  [0, -1, 0, 1, 0, 0, 0, 0, 1, 1, 0, 2],
  [0, 0, 1, 1, 0, 0, 0, 1, 0, 2, 0, 1],
  [0, 0, -1, -1, 0, 0, 0, 1, 0, 2, 0, 1]
];
var SKIP = { px: 1, nx: 2, py: 4, ny: 8, pz: 16, nz: 32 };
var _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _e4 = new THREE.Euler(), _p4 = new THREE.Vector3(), _s4 = new THREE.Vector3(1, 1, 1);
function mtx(x, y, z, rx, ry, rz, sx, sy, sz) {
  _e4.set(rx || 0, ry || 0, rz || 0, "YXZ"); _q4.setFromEuler(_e4); _p4.set(x, y, z); _s4.set(sx || 1, sy || 1, sz || 1);
  _m4.compose(_p4, _q4, _s4); return _m4.elements;
}
function Batch(K, o) {
  o = o || NO;
  this.K = K; this.p = []; this.n = []; this.c = []; this.u = []; this.em = [];
  this.seg = o.seg != null ? o.seg : 3; this.vary = o.vary != null ? o.vary : 0.035;
  this.tile = o.tile || 1; this.mat = o.mat || null; this.chunk = o.chunk != null ? o.chunk : 18;
  this.lit = o.lit !== false; this.parent = o.parent || null;
}
Batch.prototype._col = function (col, vary) {
  var c = C(col);
  if (vary) { var j = (rng() - 0.5) * 2 * vary; c.r = Math.max(0, c.r * (1 + j)); c.g = Math.max(0, c.g * (1 + j)); c.b = Math.max(0, c.b * (1 + j * 0.8)); }
  return c;
};
Batch.prototype._v = function (e, lx, ly, lz, nx, ny, nz, c, em, u, v) {
  this.p.push(e[0] * lx + e[4] * ly + e[8] * lz + e[12], e[1] * lx + e[5] * ly + e[9] * lz + e[13], e[2] * lx + e[6] * ly + e[10] * lz + e[14]);
  this.n.push(nx, ny, nz); this.c.push(c.r, c.g, c.b); this.em.push(em); this.u.push(u, v);
};
// axis-aligned (optionally rotated) box; o: {rx,ry,rz, seg, skip:"ny,py", emit:1.2, vary, tile}
Batch.prototype.box = function (x, y, z, w, h, d, col, o) {
  o = o || NO;
  var e = mtx(x, y, z, o.rx, o.ry, o.rz), ext = [w / 2, h / 2, d / 2], full = [w, h, d];
  var seg = o.seg != null ? o.seg : this.seg, c = this._col(col, o.vary != null ? o.vary : this.vary), em = o.emit || 0;
  var skip = 0; if (o.skip) { var sp = o.skip.split(","); for (var si = 0; si < sp.length; si++) skip |= SKIP[sp[si]] || 0; }
  var tile = o.tile || this.tile;
  for (var f = 0; f < 6; f++) {
    if (skip & (1 << f)) continue;
    var F = FACES[f], hn = ext[F[9]], hu = ext[F[10]], hv = ext[F[11]];
    var su = seg ? Math.min(20, Math.max(1, Math.round(full[F[10]] / seg))) : 1, sv = seg ? Math.min(20, Math.max(1, Math.round(full[F[11]] / seg))) : 1;
    // rotate the face normal into world space
    var nx = e[0] * F[0] + e[4] * F[1] + e[8] * F[2], ny = e[1] * F[0] + e[5] * F[1] + e[9] * F[2], nz = e[2] * F[0] + e[6] * F[1] + e[10] * F[2];
    for (var i = 0; i < su; i++) for (var j = 0; j < sv; j++) {
      var s0 = -1 + 2 * i / su, s1 = -1 + 2 * (i + 1) / su, t0 = -1 + 2 * j / sv, t1 = -1 + 2 * (j + 1) / sv;
      var q = [[s0, t0], [s1, t0], [s1, t1], [s0, t0], [s1, t1], [s0, t1]];
      for (var k = 0; k < 6; k++) {
        var s = q[k][0], t = q[k][1];
        var lx = F[0] * hn + F[3] * hu * s + F[6] * hv * t, ly = F[1] * hn + F[4] * hu * s + F[7] * hv * t, lz = F[2] * hn + F[5] * hu * s + F[8] * hv * t;
        this._v(e, lx, ly, lz, nx, ny, nz, c, em, (s + 1) * hu / tile, (t + 1) * hv / tile);
      }
    }
  }
  return this;
};
// a single quad (w x h) facing +z, rotated by ry/rx; o.two = both sides
Batch.prototype.quad = function (x, y, z, w, h, col, o) {
  o = o || NO;
  var e = mtx(x, y, z, o.rx, o.ry, o.rz), c = this._col(col, o.vary != null ? o.vary : 0), em = o.emit || 0, hw = w / 2, hh = h / 2;
  var nx = e[8], ny = e[9], nz = e[10], tile = o.tile || 0, R = o.uv;
  var q = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  for (var k = 0; k < 6; k++) {
    var uu = tile ? (q[k][0] + 1) * hw / tile : (q[k][0] + 1) / 2, vv = tile ? (q[k][1] + 1) * hh / tile : (q[k][1] + 1) / 2;
    if (R) { uu = R[0] + (R[2] - R[0]) * (q[k][0] + 1) / 2; vv = R[1] + (R[3] - R[1]) * (q[k][1] + 1) / 2; }
    this._v(e, q[k][0] * hw, q[k][1] * hh, 0, nx, ny, nz, c, em, uu, vv);
  }
  if (o.two) { var qb = [[-1, -1], [1, 1], [1, -1], [-1, -1], [-1, 1], [1, 1]]; for (var k2 = 0; k2 < 6; k2++) this._v(e, qb[k2][0] * hw, qb[k2][1] * hh, 0, -nx, -ny, -nz, c, em, (qb[k2][0] + 1) / 2, (qb[k2][1] + 1) / 2); }
  return this;
};
// any three.js geometry, flat-shaded from its triangle normals (then disposed)
Batch.prototype.geo = function (g, x, y, z, col, o) {
  o = o || NO;
  var e = mtx(x, y, z, o.rx, o.ry, o.rz, o.sx, o.sy, o.sz), c = this._col(col, o.vary != null ? o.vary : this.vary), em = o.emit || 0;
  var pa = g.attributes.position.array, ua = g.attributes.uv ? g.attributes.uv.array : null, ia = g.index ? g.index.array : null;
  var n = ia ? ia.length : pa.length / 3, V = [0, 0, 0, 0, 0, 0, 0, 0, 0], fv = o.faceVary || 0, c0 = c;
  for (var t = 0; t < n; t += 3) {
    if (fv) { var jj = 1 + (rng() - 0.5) * 2 * fv; c = { r: c0.r * jj, g: c0.g * jj, b: c0.b * jj }; }
    for (var k = 0; k < 3; k++) { var id = ia ? ia[t + k] : t + k, lx = pa[id * 3], ly = pa[id * 3 + 1], lz = pa[id * 3 + 2]; V[k * 3] = e[0] * lx + e[4] * ly + e[8] * lz + e[12]; V[k * 3 + 1] = e[1] * lx + e[5] * ly + e[9] * lz + e[13]; V[k * 3 + 2] = e[2] * lx + e[6] * ly + e[10] * lz + e[14]; }
    var ax = V[3] - V[0], ay = V[4] - V[1], az = V[5] - V[2], bx = V[6] - V[0], by = V[7] - V[1], bz = V[8] - V[2];
    var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    for (var k2 = 0; k2 < 3; k2++) {
      var id2 = ia ? ia[t + k2] : t + k2;
      this.p.push(V[k2 * 3], V[k2 * 3 + 1], V[k2 * 3 + 2]); this.n.push(nx, ny, nz); this.c.push(c.r, c.g, c.b); this.em.push(em);
      this.u.push(ua ? ua[id2 * 2] : 0, ua ? ua[id2 * 2 + 1] : 0);
    }
  }
  g.dispose();
  return this;
};
Batch.prototype.cyl = function (x, y, z, rt, rb, h, col, o) { o = o || NO; return this.geo(new THREE.CylinderGeometry(rt, rb, h, o.n || 8, 1, !!o.open), x, y, z, col, o); };
Batch.prototype.sph = function (x, y, z, r, col, o) { o = o || NO; return this.geo(new THREE.SphereGeometry(r, o.ws || 8, o.hs || 6), x, y, z, col, o); };
Batch.prototype.cone = function (x, y, z, r, h, col, o) { o = o || NO; return this.geo(new THREE.ConeGeometry(r, h, o.n || 8), x, y, z, col, o); };
Batch.prototype.torus = function (x, y, z, r, t, col, o) { o = o || NO; return this.geo(new THREE.TorusGeometry(r, t, o.rs || 5, o.ts || 12, o.arc || TAU), x, y, z, col, o); };
Batch.prototype.disc = function (x, y, z, r, col, o) { o = o || NO; return this.geo(new THREE.CircleGeometry(r, o.n || 14), x, y, z, col, o); };
Batch.prototype.count = function () { return this.p.length / 3; };
// light every vertex once (ambient sky/ground + key direction + point lamps)
function shadeArray(rig, P, N, Cc, EM) {
  var out = new Float32Array(Cc.length), L = rig.lights, nl = L.length;
  var sk = rig.sky, gd = rig.gnd, dir = rig.dir, dc = rig.dirCol;
  for (var i = 0, v = 0; i < Cc.length; i += 3, v++) {
    var em = EM[v];
    if (em > 0) { out[i] = Cc[i] * em; out[i + 1] = Cc[i + 1] * em; out[i + 2] = Cc[i + 2] * em; continue; }
    var nx = N[i], ny = N[i + 1], nz = N[i + 2], px = P[i], py = P[i + 1], pz = P[i + 2];
    var hy = ny * 0.5 + 0.5, lr = gd.r + (sk.r - gd.r) * hy, lg = gd.g + (sk.g - gd.g) * hy, lb = gd.b + (sk.b - gd.b) * hy;
    if (dir) { var dd = nx * dir.x + ny * dir.y + nz * dir.z; if (dd > 0) { lr += dc.r * dd; lg += dc.g * dd; lb += dc.b * dd; } }
    for (var k = 0; k < nl; k++) {
      var l = L[k], dx = l.x - px, dy = l.y - py, dz = l.z - pz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > l.r2) continue;
      var d = Math.sqrt(d2) || 0.001, ndl = (nx * dx + ny * dy + nz * dz) / d;
      ndl = ndl * 0.7 + 0.3; if (ndl <= 0) continue;
      var a = 1 - d / l.r; a = a * a * ndl * l.i;
      lr += l.c.r * a; lg += l.c.g * a; lb += l.c.b * a;
    }
    out[i] = Cc[i] * lr; out[i + 1] = Cc[i + 1] * lg; out[i + 2] = Cc[i + 2] * lb;
  }
  return out;
}
function makeGeom(P, U, COL) {
  var g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute("aCol", new THREE.Float32BufferAttribute(COL, 3));
  g.computeBoundingSphere();
  return g;
}
// turn the batch into mesh(es); chunked by area so frustum culling still helps
Batch.prototype.flush = function () {
  if (!this.p.length) return [];
  var K = this.K, mat = this.mat || K.mat(), rig = this.lit ? K.rig : K.flatRig;
  var COL = shadeArray(rig, this.p, this.n, this.c, this.em), P = this.p, U = this.u, out = [], parent = this.parent || buildGroup;
  var nTri = P.length / 9;
  if (!this.chunk || nTri < 600) { var m0 = new THREE.Mesh(makeGeom(P, U, COL), mat); parent.add(m0); out.push(m0); if (!this.parent) K.cullable.push(m0); }
  else {
    var bins = {}, cs = this.chunk;
    for (var t = 0; t < nTri; t++) {
      var b = t * 9, cx = (P[b] + P[b + 3] + P[b + 6]) / 3, cz = (P[b + 2] + P[b + 5] + P[b + 8]) / 3, key = Math.floor(cx / cs) + "," + Math.floor(cz / cs);
      (bins[key] || (bins[key] = [])).push(t);
    }
    for (var key2 in bins) {
      var list = bins[key2], p2 = new Float32Array(list.length * 9), u2 = new Float32Array(list.length * 6), c2 = new Float32Array(list.length * 9);
      for (var j = 0; j < list.length; j++) { var tt = list[j]; for (var q = 0; q < 9; q++) { p2[j * 9 + q] = P[tt * 9 + q]; c2[j * 9 + q] = COL[tt * 9 + q]; } for (var q2 = 0; q2 < 6; q2++) u2[j * 6 + q2] = U[tt * 6 + q2]; }
      var m = new THREE.Mesh(makeGeom(p2, u2, c2), mat); parent.add(m); out.push(m); if (!this.parent) K.cullable.push(m);
    }
  }
  this.p = []; this.n = []; this.c = []; this.u = []; this.em = [];
  return out;
};
// build a small batch around a local origin and return it as one movable mesh
Batch.prototype.mesh = function (x, y, z, parent) {
  var K = this.K, mat = this.mat || K.mat(), rig = this.lit ? K.rig : K.flatRig;
  if (!this.p.length) return null;
  var COL = shadeArray(rig, this.p, this.n, this.c, this.em);
  var m = new THREE.Mesh(makeGeom(this.p, this.u, COL), mat); m.position.set(x || 0, y || 0, z || 0);
  (parent || this.parent || buildGroup).add(m);
  this.p = []; this.n = []; this.c = []; this.u = []; this.em = [];
  return m;
};
// the same local batch as a shared geometry (for many moving copies / instancing)
Batch.prototype.geometry = function () {
  var K = this.K, rig = this.lit ? K.rig : K.flatRig;
  var COL = shadeArray(rig, this.p, this.n, this.c, this.em), g = makeGeom(this.p, this.u, COL);
  this.p = []; this.n = []; this.c = []; this.u = []; this.em = [];
  return g;
};

/* -------------------------------------------------------- world context ---- */
// K = one world under construction: batches, floors, lights, doors, motion.
function World(P, mood, rig) {
  var K = this;
  this.P = P; this.mood = mood;
  rig = rig || {};
  this.rig = { sky: C(rig.sky == null ? 0x8890a0 : rig.sky), gnd: C(rig.gnd == null ? 0x303038 : rig.gnd), dir: rig.dir ? new THREE.Vector3(rig.dir[0], rig.dir[1], rig.dir[2]).normalize() : null, dirCol: C(rig.dirCol == null ? 0x000000 : rig.dirCol), lights: [] };
  this.flatRig = { sky: C(0xffffff), gnd: C(0xffffff), dir: null, dirCol: C(0), lights: [] };
  this.batches = []; this.floors = []; this.anims = []; this.ixs = []; this.doors = []; this.cullable = [];
  this._mat = null;
  this.B = this.batch();
  this.ground = function (x, z) {
    var F = K.floors, lim = groundClampY + 0.001, best = -Infinity;
    for (var i = 0; i < F.length; i++) {
      var r = F[i]; if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
      var y = r.f ? r.f(x, z) : r.y;
      if (y <= lim && y > best) best = y;
    }
    return best > -Infinity ? { y: best, on: true } : { y: 0, on: false };
  };
}
World.prototype.mat = function () { return this._mat || (this._mat = vcMat({})); };
World.prototype.batch = function (o) { var b = new Batch(this, o); this.batches.push(b); return b; };
World.prototype.light = function (x, y, z, col, r, i) { this.rig.lights.push({ x: x, y: y, z: z, c: C(col), r: r || 8, r2: (r || 8) * (r || 8), i: i == null ? 1 : i }); return this; };
// shorthands into the default batch; o.solid pushes a collider of the same size
World.prototype.box = function (x, y, z, w, h, d, col, o) {
  o = o || NO; (o.batch || this.B).box(x, y, z, w, h, d, col, o);
  if (o.solid) pushSolidBox(x, z, w / 2, d / 2, o.ry || 0, y - h / 2, y + h / 2);
  return this;
};
World.prototype.cyl = function (x, y, z, rt, rb, h, col, o) { o = o || NO; (o.batch || this.B).cyl(x, y, z, rt, rb, h, col, o); if (o.solid) pushSolidCyl(x, z, Math.max(rt, rb), y - h / 2, y + h / 2); return this; };
World.prototype.sph = function (x, y, z, r, col, o) { (o && o.batch || this.B).sph(x, y, z, r, col, o); return this; };
World.prototype.torus = function (x, y, z, r, t, col, o) { (o && o.batch || this.B).torus(x, y, z, r, t, col, o); return this; };
World.prototype.cone = function (x, y, z, r, h, col, o) { (o && o.batch || this.B).cone(x, y, z, r, h, col, o); return this; };
World.prototype.disc = function (x, y, z, r, col, o) { (o && o.batch || this.B).disc(x, y, z, r, col, o); return this; };
World.prototype.quad = function (x, y, z, w, h, col, o) { (o && o.batch || this.B).quad(x, y, z, w, h, col, o); return this; };
World.prototype.geo = function (g, x, y, z, col, o) { (o && o.batch || this.B).geo(g, x, y, z, col, o); return this; };
World.prototype.solid = function (x, y0, z, w, h, d, ry) { pushSolidBox(x, z, w / 2, d / 2, ry || 0, y0, y0 + h); return this; };
// walkable surface: rect at height y, or y(x,z) function
World.prototype.walk = function (x0, z0, x1, z1, y) {
  var r = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
  if (typeof y === "function") r.f = y; else r.y = y;
  this.floors.push(r); return r;
};
// a floor slab whose top is at y (visible + walkable)
World.prototype.slab = function (x0, z0, x1, z1, y, col, o) {
  o = o || NO; var t = o.t || 0.3, w = Math.abs(x1 - x0), d = Math.abs(z1 - z0);
  (o.batch || this.B).box((x0 + x1) / 2, y - t / 2, (z0 + z1) / 2, w, t, d, col, { seg: o.seg, skip: o.skip || "ny", tile: o.tile, vary: o.vary, emit: o.emit });
  if (o.walk !== false) this.walk(x0, z0, x1, z1, y);
  return this;
};
// a climbable block: visible box, a floor on top, and a collider that stops you walking
// into it from below but lets you step up onto it from anything within ~0.55 m
World.prototype.block = function (x0, z0, x1, z1, top, col, o) {
  o = o || NO; var base = o.base || 0, w = Math.abs(x1 - x0), d = Math.abs(z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  (o.batch || this.B).box(cx, (base + top) / 2, cz, w, top - base, d, col, { seg: o.seg != null ? o.seg : 0, skip: o.skip || "ny", vary: o.vary, ry: 0 });
  this.walk(x0, z0, x1, z1, top);
  if (top - base > 0.56) pushSolidBox(cx, cz, w / 2, d / 2, 0, base - 0.2, top - 0.56);
  return this;
};
// many moving copies of one geometry in a single draw call
World.prototype.instanced = function (geom, count, mat) {
  var m = new THREE.InstancedMesh(geom, mat || this.mat(), count);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; buildGroup.add(m);
  return m;
};
// a ramp walk rect rising along an axis ("x" or "z") from v0 to v1
World.prototype.ramp = function (x0, z0, x1, z1, axis, a, b, y0, y1) {
  return this.walk(x0, z0, x1, z1, function (x, z) { var v = axis === "x" ? x : z, t = clamp((v - a) / (b - a), 0, 1); return y0 + (y1 - y0) * t; });
};
// straight stair: from (x,z) heading dir ("+z","-z","+x","-x") for len metres, width w, y0 -> y1
World.prototype.stairs = function (x, z, dir, len, w, y0, y1, col, o) {
  o = o || NO;
  var n = Math.max(2, Math.round(Math.abs(y1 - y0) / (o.rise || 0.3))), rise = (y1 - y0) / n, run = len / n, ax = dir.charAt(1), sg = dir.charAt(0) === "-" ? -1 : 1;
  for (var i = 0; i < n; i++) {
    var top = y0 + rise * (i + 1) - rise * 0.5, a = (i + 0.5) * run * sg, base = o.floating ? top - (o.thick || 0.22) : Math.min(y0, y1) - 0.05, hgt = top - base;
    if (ax === "z") (o.batch || this.B).box(x, base + hgt / 2, z + a, w, hgt, run + 0.02, i % 2 ? col : mixC(col, 0x000000, 0.06), { seg: 0, skip: "ny", vary: 0.02 });
    else (o.batch || this.B).box(x + a, base + hgt / 2, z, run + 0.02, hgt, w, i % 2 ? col : mixC(col, 0x000000, 0.06), { seg: 0, skip: "ny", vary: 0.02 });
    if (o.solid && top - 0.56 > base) { if (ax === "z") pushSolidBox(x, z + a, w / 2, run / 2, 0, base - 0.3, top - 0.56); else pushSolidBox(x + a, z, run / 2, w / 2, 0, base - 0.3, top - 0.56); }
  }
  var e = ax === "z" ? z + len * sg : x + len * sg;
  if (ax === "z") this.ramp(x - w / 2, z, x + w / 2, e, "z", z, e, y0, y1); else this.ramp(x, z - w / 2, e, z + w / 2, "x", x, e, y0, y1);
  return { x: ax === "x" ? e : x, z: ax === "z" ? e : z, y: y1 };
};
// wall along z at x (from z0 to z1), base y0, height h, thickness o.t; o.gaps: [{a,b,lo,hi}] openings
World.prototype.wallX = function (x, z0, z1, y0, h, col, o) { return this._wall("x", x, z0, z1, y0, h, col, o); };
World.prototype.wallZ = function (z, x0, x1, y0, h, col, o) { return this._wall("z", z, x0, x1, y0, h, col, o); };
World.prototype._wall = function (axis, c, a0, a1, y0, h, col, o) {
  o = o || NO; var t = o.t || 0.3, gaps = (o.gaps || []).slice().sort(function (p, q) { return p.a - q.a; }), K = this, bt = o.batch || this.B;
  var lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  function piece(p0, p1, yb, yt, solid) {
    if (p1 - p0 < 0.01 || yt - yb < 0.01) return;
    var m = (p0 + p1) / 2, L = p1 - p0, H = yt - yb, cy = yb + H / 2;
    if (axis === "x") { bt.box(c, cy, m, t, H, L, col, { seg: o.seg, tile: o.tile, vary: o.vary }); if (solid) pushSolidBox(c, m, t / 2, L / 2, 0, yb, yt); }
    else { bt.box(m, cy, c, L, H, t, col, { seg: o.seg, tile: o.tile, vary: o.vary }); if (solid) pushSolidBox(m, c, L / 2, t / 2, 0, yb, yt); }
  }
  var cur = lo;
  for (var i = 0; i < gaps.length; i++) {
    var g = gaps[i], ga = Math.max(lo, g.a), gb = Math.min(hi, g.b), glo = g.lo || 0, ghi = g.hi == null ? h : g.hi;
    piece(cur, ga, y0, y0 + h, true);
    if (glo > 0) piece(ga, gb, y0, y0 + glo, true);
    if (ghi < h) piece(ga, gb, y0 + ghi, y0 + h, true);
    // windows (raised sill) keep an invisible pane so you cannot step through
    if (glo > 0.2 && g.glass !== false) { if (axis === "x") pushSolidBox(c, (ga + gb) / 2, t / 2, (gb - ga) / 2, 0, y0, y0 + ghi); else pushSolidBox((ga + gb) / 2, c, (gb - ga) / 2, t / 2, 0, y0, y0 + ghi); }
    cur = gb;
  }
  piece(cur, hi, y0, y0 + h, true);
  return this;
};
// an exit door: frame, a leaf left ajar, light spilling from the gap, and the portal link.
// ry: 0 = the door faces +z (you see it from +z). o: {col, frame, light, open, target, kind, w, h, sign}
World.prototype.door = function (x, y, z, ry, target, o) {
  o = o || NO;
  var w = o.w || 1.1, h = o.h || 2.2, b = this.B, fr = o.frame == null ? 0x2a2420 : o.frame, lc = C(o.light == null ? 0xffd9a0 : o.light);
  var g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry || 0; buildGroup.add(g);
  var bb = this.batch({ seg: 0, parent: g, chunk: 0 });
  bb.box(-w / 2 - 0.08, h / 2, 0, 0.16, h + 0.1, 0.22, fr); bb.box(w / 2 + 0.08, h / 2, 0, 0.16, h + 0.1, 0.22, fr); bb.box(0, h + 0.08, 0, w + 0.32, 0.16, 0.22, fr);
  bb.quad(0, h / 2, -0.06, w, h, lc, { emit: o.glow || 1.6 });
  var open = o.open == null ? 0.55 : o.open;
  var leafG = new THREE.Group(); leafG.position.set(-w / 2, 0, 0); leafG.rotation.y = -open; g.add(leafG);
  var lb = this.batch({ seg: 0, parent: leafG, chunk: 0 });
  lb.box(w / 2, h / 2, 0, w - 0.04, h - 0.04, 0.06, o.col == null ? 0x6a5a4a : o.col);
  lb.box(w - 0.14, h * 0.47, 0.06, 0.06, 0.06, 0.08, 0xc8b070, { emit: 1.1 });
  if (o.sign) { bb.box(0, h + 0.38, 0.02, 0.7, 0.24, 0.06, o.sign, { emit: 1.6 }); }
  var sp = N2.glowSprite(lc, o.glowSize || 2.6); sp.position.set(0, h * 0.55, 0.25); sp.material.opacity = 0.55; g.add(sp);
  // portal: a box link just in front of the opening
  var fx = Math.sin(ry || 0) * 0.25, fz = Math.cos(ry || 0) * 0.25;
  pushBoxLink(x + fx, z + fz, w / 2, 0.32, ry || 0, y - 0.4, y + h, o.nudge || { b: rr(-0.1, 0.3), e: rr(-0.1, 0.2) }, o.kind || "door");
  var L = linkables[linkables.length - 1]; L.target = target === undefined ? pickR(ALL_NAMES) : target;
  this.doors.push({ x: x, y: y, z: z, link: L, group: g });
  return L;
};
// a target for an onward door: mostly any dream, sometimes another intimate room
World.prototype.onward = function () { var others = MINE.filter(function (n) { return n !== curBuilding; }); return (others.length && rng() < 0.3) ? pick(others) : pickR(ALL_NAMES); };
// one animation entity for the whole world (frozen by the stillness)
World.prototype.anim = function (fn) { this.anims.push(fn); return this; };
// interactable with poetic lines, said in order (then the last ones repeat). o.on(e, i) for effects
World.prototype.ix = function (obj, x, z, r, lines, o) {
  o = o || NO; var K = this, n = 0;
  if (obj && !obj.parent) buildGroup.add(obj);
  var e = ix(obj, x, z, r || 2.2, {
    kind: o.kind || "n2b", n2b: true,
    update: o.update,
    examine: function (ent) {
      var i = n++; var line = lines[Math.min(i, lines.length - 1)];
      if (i >= lines.length && lines.length > 1) line = lines[1 + ((i - 1) % (lines.length - 1))];
      try { if (o.on) o.on(ent, i); } catch (er) {}
      if (line) beingSpeak(line);
    }
  });
  if (o.glow !== false) { try { addInteractGlow(e, x, z, o.y || 0); } catch (er) {} }
  this.ixs.push(e);
  return e;
};
// soft points drifting inside a box volume. mode: drift | fall | rise
World.prototype.motes = function (n, x0, x1, y0, y1, z0, z1, col, size, mode, speed) {
  var pa = new Float32Array(n * 3), seed = [];
  for (var i = 0; i < n; i++) { pa[i * 3] = rrange(x0, x1); pa[i * 3 + 1] = rrange(y0, y1); pa[i * 3 + 2] = rrange(z0, z1); seed.push(rng() * TAU, 0.4 + rng() * 0.8); }
  var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pa, 3));
  var pts = new THREE.Points(g, ptMat(col, size || 0.07, 0.75)); pts.frustumCulled = false; buildGroup.add(pts);
  var sp = speed || 0.3, H = y1 - y0;
  this.anim(function (dt, t) {
    var a = g.attributes.position.array;
    for (var k = 0; k < n; k++) {
      var s = seed[k * 2], v = seed[k * 2 + 1];
      if (mode === "fall") { a[k * 3 + 1] -= dt * sp * v; if (a[k * 3 + 1] < y0) a[k * 3 + 1] += H; a[k * 3] += Math.sin(t * 0.7 + s) * dt * 0.15; }
      else if (mode === "rise") { a[k * 3 + 1] += dt * sp * v; if (a[k * 3 + 1] > y1) a[k * 3 + 1] -= H; a[k * 3] += Math.sin(t * 2 + s) * dt * 0.1; }
      else { a[k * 3] += Math.sin(t * 0.21 * v + s) * dt * sp * 0.3; a[k * 3 + 1] += Math.cos(t * 0.17 * v + s) * dt * sp * 0.2; a[k * 3 + 2] += Math.sin(t * 0.13 * v + s * 2) * dt * sp * 0.3; }
    }
    g.attributes.position.needsUpdate = true;
  });
  return pts;
};
// a canvas texture painted by fn(ctx, w, h)
World.prototype.tex = function (fn, w, h, smooth, clampIt) {
  var t = canvasTex(function (x, S, H) { fn(x, S, H); }, w || 128, { h: h || w || 128, clamp: !!clampIt });
  if (smooth) { t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; }
  return t;
};
// a flat plane carrying a texture, using the original's material (fogged, unlit)
World.prototype.picture = function (x, y, z, w, h, map, o) {
  o = o || NO;
  var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), objMat({ map: map, bright: o.bright || 1, transparent: !!o.transparent, opacity: o.opacity, side: o.two ? THREE.DoubleSide : THREE.FrontSide, scroll: o.scroll, depthWrite: o.transparent ? false : undefined, decal: o.decal }));
  m.position.set(x, y, z); m.rotation.y = o.ry || 0; if (o.rx) m.rotation.x = o.rx;
  (o.parent || buildGroup).add(m); return m;
};
World.prototype.glowAt = function (x, y, z, col, size, opacity) { var s = N2.glowSprite(col, size || 1.5); s.position.set(x, y, z); s.material.opacity = opacity == null ? 0.7 : opacity; buildGroup.add(s); return s; };
// close the world: flush batches, start the animation entity, return the zone
World.prototype.finish = function (z) {
  var K = this;
  for (var i = 0; i < this.batches.length; i++) { try { this.batches[i].flush(); } catch (e) { console.error("[N2] worlds-b batch", e); } }
  // static chunks wholly inside the fog are not drawn at all (checked a few times a second)
  var cull = this.cullable, cullT = 0;
  var cullFn = function (dt) {
    cullT -= dt; if (cullT > 0) return; cullT = 0.2;
    var far = (U_fogDist.value.y || 60) + 4, cp = camera.position;
    for (var i = 0; i < cull.length; i++) { var m = cull[i], bs = m.geometry.boundingSphere; if (!bs) continue; var d = Math.hypot(bs.center.x - cp.x, bs.center.y - cp.y, bs.center.z - cp.z) - bs.radius; m.visible = d < far; }
  };
  var anims = this.anims, holder = new THREE.Object3D(); buildGroup.add(holder);
  sAnim(holder, function (dt) {
    try { cullFn(dt); } catch (e) {}
    if (freezeBeings) return;
    var t = tNow();
    for (var k = 0; k < anims.length; k++) { try { anims[k](dt, t); } catch (e) {} }
  });
  var P = this.P, mood = this.mood;
  var zone = {
    spawn: z.spawn, ground: this.ground,
    fog: { color: C(z.fog[0]), near: z.fog[1], far: z.fog[2] },
    sky: C(z.sky), flags: z.flags || {}, bounds: z.bounds || 0, killY: z.killY != null ? z.killY : -12,
    desat: z.desat || 0, audioOverride: soundPreset(z.sound || "hum", P, mood)
  };
  if (z.fov) zone.fov = z.fov; if (z.eyeH) zone.eyeH = z.eyeH; if (z.speed) zone.speed = z.speed;
  zone._n2b = { floors: this.floors, entityBase: entities.length, spots: z.spots || null };
  // the doors of the dream just built (debugging, and for modules that want to light the way)
  WB.last = { name: curBuilding, doors: this.doors.map(function (d) { return { x: d.x, y: d.y, z: d.z, link: d.link }; }), ix: this.ixs.length };
  return zone;
};

/* ----------------------------------------------------------- textures ---- */
function noiseFill(x, W, H, base, amt, n, size) {
  x.fillStyle = base; x.fillRect(0, 0, W, H);
  for (var i = 0; i < (n || 300); i++) { var v = (Math.random() - 0.5) * amt; x.fillStyle = v > 0 ? "rgba(255,255,255," + v + ")" : "rgba(0,0,0," + (-v) + ")"; var s = size || 2; x.fillRect(Math.random() * W, Math.random() * H, s, s); }
}
function textLines(x, lines, W, H, o) {
  o = o || NO; x.textAlign = o.align || "center"; x.textBaseline = "middle";
  x.font = (o.weight || "") + " " + (o.size || 14) + "px " + (o.font || "monospace"); x.fillStyle = o.color || "#ffffff";
  var lh = o.lh || (o.size || 14) * 1.35, y0 = H / 2 - (lines.length - 1) * lh / 2 + (o.dy || 0);
  for (var i = 0; i < lines.length; i++) x.fillText(lines[i], o.align === "left" ? (o.x || 8) : W / 2, y0 + i * lh);
}

/* ------------------------------------------------------- registration ---- */
var curBuilding = null;
var INTERIOR_SET = {};
function defineWorld(name, opts, fn) {
  var wrapped = function (P, mood) {
    curBuilding = name;
    try { return fn(P, mood); }
    catch (err) {
      // never take the night down: report, and leave a quiet room with a door in it
      console.error("[N2] worlds-b: " + name + " failed to build", err);
      groundFlat(60, objMat({ color: 0x1a1820, bright: 0.7 }), 0);
      doorPortal(0, 1.2, -6, 0, null, pickR(ALL_NAMES));
      return { spawn: { x: 0, z: 4, yaw: 0 }, ground: FLAT, fog: { color: new THREE.Color(0x0c0a10), near: 4, far: 30 }, sky: new THREE.Color(0x06050a), flags: {}, bounds: 26 };
    }
    finally { curBuilding = null; }
  };
  if (N2.registerWorld(name, wrapped, { valence: opts.valence || 0, tags: opts.tags || [], title: opts.title })) {
    if (MINE.indexOf(name) < 0) MINE.push(name);
    WB.info[name] = { title: opts.title, tags: opts.tags || [], interior: !!opts.interior };
    if (opts.interior) { INTERIOR_SET[name] = 1; try { if (INTERIOR_NAMES.indexOf(name) < 0) INTERIOR_NAMES.push(name); } catch (e) {} }
  }
}

/* ---- curated worlds keep their composition: no random clutter, landmarks
   or wall-shove warps; random beings that spawned inside a wall or over
   nothing are moved onto a real floor. ---- */
function zoneIsMine(z) { return z && !z.bedroom && isMine(z.archetypeName); }
var _placeInteractables = placeInteractables;
placeInteractables = function (z) { if (zoneIsMine(z)) return; return _placeInteractables.apply(this, arguments); };
var _placeSceneProps = placeSceneProps;
placeSceneProps = function (z) { if (zoneIsMine(z)) { sceneProps = []; return; } return _placeSceneProps.apply(this, arguments); };
var _placeLandmark = placeSignatureLandmark;
placeSignatureLandmark = function (z) { if (zoneIsMine(z)) return; return _placeLandmark.apply(this, arguments); };
function floorAt(floors, x, z, near) {
  var best = null;
  for (var i = 0; i < floors.length; i++) { var r = floors[i]; if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue; var y = r.f ? r.f(x, z) : r.y; if (best == null || Math.abs(y - near) < Math.abs(best - near)) best = y; }
  return best;
}
function randomFloorSpot(info, avoidX, avoidZ) {
  var F = info.floors; if (!F.length) return null;
  for (var k = 0; k < 40; k++) {
    var r = F[(Math.random() * F.length) | 0], x = rr(r.x0 + 0.6, r.x1 - 0.6), z = rr(r.z0 + 0.6, r.z1 - 0.6);
    if (r.x1 - r.x0 < 1.4 || r.z1 - r.z0 < 1.4) continue;
    var y = r.f ? r.f(x, z) : r.y;
    if (Math.hypot(x - avoidX, z - avoidZ) < 7) continue;
    if (N2.insideSolid(x, z, y)) continue;
    return { x: x, y: y, z: z };
  }
  return null;
}
var _populateDream = populateDream;
populateDream = function (z) {
  var before = entities.length, r = _populateDream.apply(this, arguments);
  if (!zoneIsMine(z) || !z._n2b) return r;
  try {
    for (var i = entities.length - 1; i >= before; i--) {
      var e = entities[i], o = e && e.obj; if (!o || !o.position) continue;
      var fy = floorAt(z._n2b.floors, o.position.x, o.position.z, o.position.y);
      if (fy != null && Math.abs(fy - o.position.y) < 1.5 && !N2.insideSolid(o.position.x, o.position.z, fy)) continue;
      var s = randomFloorSpot(z._n2b, pos.x, pos.z);
      if (s && !e.float) { o.position.set(s.x, s.y, s.z); }
      else if (!s) { if (o.parent) o.parent.remove(o); entities.splice(i, 1); }
    }
  } catch (er) {}
  return r;
};
N2.on("play", function () {
  // walls in these rooms are walls: the way on is through their doors
  if (N2.lastZone && N2.lastZone._n2b && isMine(N2.lastZone.archetypeName)) wallPush = 0;
});

/* =========================================================================
   1. THE CLASSROOM AFTER HOURS — an endless school corridor at dusk. Every
   doorway opens onto the same classroom, a little later each time. At the far
   end, stairs climb toward the roof door and a sun that will not finish setting.
   ========================================================================= */
defineWorld("after_hours_classroom", { title: "the classroom after hours", tags: ["interior", "school", "dusk"], valence: 0, interior: true }, function (P, mood) {
  var blue = rng() < 0.35;
  var V = blue ? { sky: 0x5a6688, gnd: 0x2a2838, key: 0x8090c8, lamp: 0xc8d8ff, sun: 0x9fb4ff, fog: 0x2e3448, wall: 0xb8b4b0, floor: 0x6a5a4c, sunset: ["#1c2240", "#46406a", "#8a6a8a", "#c8908a"] }
                : { sky: 0x8a6a68, gnd: 0x3a2a26, key: 0xffa060, lamp: 0xffe0b0, sun: 0xffb070, fog: 0x5a3c44, wall: 0xcfc2ae, floor: 0x7a5a40, sunset: ["#2a1830", "#7a3a48", "#d0704a", "#ffc070"] };
  var K = new World(P, mood, { sky: mixC(V.sky, 0x000000, 0.35), gnd: mixC(V.gnd, 0x000000, 0.3), dir: [-1, 0.35, 0.15], dirCol: mixC(V.key, 0x000000, 0.6) });
  var ROOMS = 8, RL = 13, zEnd = 1 - ROOMS * RL, H = 3.4, wall = V.wall, trim = 0x5a4a3c;
  // floors: corridor + classrooms one slab, then the stair hall
  K.slab(-12, zEnd, 2, 8, 0, V.floor, { tile: 1.2, seg: 2.4 });
  K.box(-5, H + 0.15, (zEnd + 8) / 2, 14, 0.3, 8 - zEnd, mixC(wall, 0x000000, 0.25), { seg: 3, skip: "py" });
  // ---- corridor east wall: lockers below, tall windows onto the yard ----
  var wins = [];
  for (var wz = 4; wz > zEnd + 2; wz -= 4.2) wins.push({ a: wz - 1.5, b: wz + 1.5, lo: 1.25, hi: 2.9 });
  K.wallX(2.15, zEnd, 8, 0, H, wall, { gaps: wins });
  for (var lz = 6.5; lz > zEnd + 1; lz -= 0.62) {
    var lc = mixC(blue ? 0x4a6a7a : 0x5a7a6a, 0x000000, (Math.abs(Math.sin(lz * 3.1)) * 0.25));
    K.box(1.78, 0.62, lz, 0.42, 1.2, 0.58, lc, { seg: 0, skip: "ny,px" });
    K.box(1.555, 0.95, lz, 0.02, 0.1, 0.3, 0x2a2a2a, { seg: 0 });
  }
  K.solid(1.8, 0, (zEnd + 8) / 2, 0.5, 1.3, 8 - zEnd);
  // window frames + the yard beyond
  for (var wi = 0; wi < wins.length; wi++) { var wc = (wins[wi].a + wins[wi].b) / 2; K.box(2.15, 2.1, wc, 0.12, 0.08, 3.0, trim, { seg: 0 }); K.box(2.15, 2.1, wc, 0.12, 1.65, 0.08, trim, { seg: 0 }); }
  var yard = K.batch({ seg: 6 });
  yard.box(20, -0.3, (zEnd + 8) / 2, 36, 0.4, 8 - zEnd + 40, blue ? 0x2a2c34 : 0x4a3a32, { skip: "ny" });
  for (var tz = 10; tz > zEnd - 10; tz -= rrange(7, 12)) { var tx = rrange(14, 30), th = rrange(4, 8); yard.cyl(tx, th / 2, tz, 0.18, 0.3, th, 0x1a1410, { n: 5 }); yard.sph(tx, th + 1.1, tz, rrange(1.6, 2.6), blue ? 0x1c2430 : 0x2a2018, { ws: 6, hs: 4, sy: 1.2 }); }
  for (var fz = 8; fz > zEnd - 8; fz -= 3) yard.box(34, 1.0, fz, 0.06, 2.0, 0.06, 0x1a1616, { seg: 0 });
  yard.box(34, 1.9, (zEnd + 8) / 2, 0.06, 0.06, 8 - zEnd + 16, 0x1a1616, { seg: 0 });
  // a hoop in the yard
  yard.cyl(12, 1.6, -30, 0.08, 0.08, 3.2, 0x2a2a2a, { n: 5 }); yard.box(12, 3.3, -30.4, 1.2, 0.8, 0.06, 0xd8d0c8);
  // the endless dusk itself: a painted sky far outside both sides
  var skyTex = K.tex(function (x, W, Hh) {
    var g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, V.sunset[0]); g.addColorStop(0.45, V.sunset[1]); g.addColorStop(0.75, V.sunset[2]); g.addColorStop(1, V.sunset[3]);
    x.fillStyle = g; x.fillRect(0, 0, W, Hh);
    x.fillStyle = "rgba(255,255,255,0.07)"; for (var i = 0; i < 9; i++) { x.fillRect(Math.random() * W, Hh * (0.2 + Math.random() * 0.4), 40 + Math.random() * 80, 3); }
    x.fillStyle = V.sunset[0]; for (var b = 0; b < W; b += 6) { var hh = 6 + Math.abs(Math.sin(b * 0.07)) * 14 + (b % 30 < 6 ? 10 : 0); x.fillRect(b, Hh - hh, 6, hh); }
  }, 256, 128, true);
  K.picture(38, 9, (zEnd + 8) / 2, 220, 30, skyTex, { ry: -Math.PI / 2, bright: 1.15 });
  K.picture(-40, 9, (zEnd + 8) / 2, 220, 30, skyTex, { ry: Math.PI / 2, bright: 1.15 });
  // ---- corridor ceiling lights (some of them dead) + notice boards ----
  var tubes = [];
  for (var cz = 4; cz > zEnd; cz -= 6) {
    var on = rng() < 0.55;
    K.box(0, H - 0.05, cz, 0.3, 0.08, 1.6, on ? V.lamp : 0x6a6a6a, { seg: 0, emit: on ? 1.5 : 0 });
    if (on) K.light(0, H - 0.6, cz, V.lamp, 6.5, 0.45);
    if (on && rng() < 0.25) tubes.push(cz);
  }
  for (var nb = 0; nb < ROOMS; nb++) {
    var nz = 1 - nb * RL - 9;
    K.box(-2.05, 1.6, nz, 0.06, 1.0, 1.6, 0x8a6a4a, { seg: 0 });
    for (var pp = 0; pp < 5; pp++) K.box(-1.99, rrange(1.25, 1.95), nz + rrange(-0.6, 0.6), 0.02, rrange(0.18, 0.3), rrange(0.16, 0.24), hsl(rng(), 0.25, 0.75), { seg: 0, ry: rr(-0.1, 0.1) });
  }
  // ---- eight classrooms, the same one, later each time ----
  var boards = [
    ["today we learned", "how to stay"], ["homework:", "remember the way home"], ["do not run", "in the dream"],
    ["who is still here?"], ["the bell will not ring", "for you"], ["it is later", "than it looks"], ["we waited for you"], ["you can go now"]
  ];
  var deskTops = [], chairsB = K.batch({ seg: 0 }), clocks = [];
  for (var r = 0; r < ROOMS; r++) {
    var z0 = 1 - r * RL, z1 = z0 - RL, zc = (z0 + z1) / 2, late = r / (ROOMS - 1);
    // walls: corridor side with a doorway, outer wall with windows, partition
    var dz = z0 - 2.4;
    K.wallX(-2.05, z1, z0, 0, H, wall, { gaps: [{ a: dz - 0.8, b: dz + 0.8, hi: 2.3 }, { a: zc - 3.6, b: zc - 1.0, lo: 1.3, hi: 2.4 }] });
    K.box(-2.05, 1.3, zc - 2.3, 0.14, 0.06, 2.6, trim, { seg: 0 }); K.box(-2.05, 2.4, zc - 2.3, 0.14, 0.06, 2.6, trim, { seg: 0 });
    K.wallZ(z1, -12, -2.05, 0, H, mixC(wall, 0x000000, 0.04));
    K.wallX(-12, z1, z0, 0, H, mixC(wall, 0xffffff, 0.04), { gaps: [{ a: zc - 5, b: zc - 2.4, lo: 0.85, hi: 2.75 }, { a: zc - 1.3, b: zc + 1.3, lo: 0.85, hi: 2.75 }, { a: zc + 2.4, b: zc + 5, lo: 0.85, hi: 2.75 }] });
    for (var wq = -1; wq <= 1; wq++) { K.box(-12, 1.8, zc + wq * 3.7, 0.1, 0.06, 2.6, trim, { seg: 0 }); K.box(-11.75, 0.8, zc + wq * 3.7, 0.4, 0.06, 2.6, trim, { seg: 0 }); }
    // the open door leaf, a little wider each room
    var la = 0.5 + late * 1.0;
    K.box(-2.05 - 0.78 * Math.sin(la), 1.15, dz + 0.8 - 0.78 * Math.cos(la), 0.06, 2.25, 1.55, 0x7a5a3a, { seg: 0, ry: la });
    K.box(-2.0, 2.45, dz, 0.04, 0.16, 0.5, 0xe8e0d0, { seg: 0, emit: 0.9 });
    // chalkboard (front wall = the z0 side, facing -z)
    K.box(-7, 1.65, z0 - 0.2, 6.2, 1.4, 0.08, 0x2a3a30, { seg: 0 });
    K.box(-7, 0.92, z0 - 0.28, 6.2, 0.06, 0.14, trim, { seg: 0 });
    var bt = boards[r];
    (function (lines) {
      var tt = K.tex(function (x, W, Hh) { x.fillStyle = "rgba(0,0,0,0)"; x.clearRect(0, 0, W, Hh); textLines(x, lines, W, Hh, { size: 18, color: "rgba(230,232,220,0.82)", font: "'Comic Sans MS', 'Segoe Print', cursive" }); x.strokeStyle = "rgba(230,232,220,0.25)"; x.beginPath(); x.moveTo(20, Hh - 14); x.lineTo(W - 30, Hh - 18); x.stroke(); }, 256, 64, true);
      K.picture(-7, 1.68, z0 - 0.25, 5.6, 1.3, tt, { ry: Math.PI, transparent: true, decal: true, bright: 1.1 });
    })(bt);
    // teacher's desk + a lamp
    K.box(-7, 0.4, z0 - 2.0, 1.8, 0.8, 0.8, 0x6a4a30, { solid: true, seg: 0 });
    K.box(-7.5, 0.95, z0 - 1.9, 0.3, 0.3, 0.22, 0x3a2a1a, { seg: 0 });
    // clock above the board
    K.cyl(-7, 2.85, z0 - 0.22, 0.3, 0.3, 0.06, 0xe8e2d4, { rx: Math.PI / 2, n: 12 });
    var hand = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.02), objMat({ color: 0x202020 })); hand.geometry.translate(0, 0.1, 0); hand.position.set(-7, 2.85, z0 - 0.27); buildGroup.add(hand);
    var hand2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.02), objMat({ color: 0x202020 })); hand2.geometry.translate(0, 0.07, 0); hand2.position.set(-7, 2.85, z0 - 0.28); buildGroup.add(hand2);
    clocks.push([hand, hand2, r]);
    // 4 x 4 desks; chairs turn toward the door as it gets later
    for (var cx = 0; cx < 4; cx++) for (var cr = 0; cr < 4; cr++) {
      var x = -10.2 + cx * 2.1, zz = z0 - 4.4 - cr * 2.0, dcol = mixC(0x8a6a48, 0x000000, rng() * 0.15);
      K.box(x, 0.72, zz, 0.75, 0.05, 0.52, dcol, { seg: 0, vary: 0.05 });
      K.box(x - 0.33, 0.36, zz, 0.05, 0.7, 0.46, 0x3a3a3c, { seg: 0, skip: "ny" }); K.box(x + 0.33, 0.36, zz, 0.05, 0.7, 0.46, 0x3a3a3c, { seg: 0, skip: "ny" });
      K.solid(x, 0, zz, 0.8, 0.78, 0.55);
      deskTops.push([x, zz, r, cx, cr]);
      var turn = late * Math.atan2(-2.05 - x, dz - zz) * (0.6 + rng() * 0.5), chx = x + Math.sin(turn) * 0.05, chz = zz - 0.55;
      chairsB.box(chx, 0.42, chz, 0.42, 0.05, 0.4, blue ? 0x4a5a7a : 0x7a4a3a, { ry: turn, vary: 0.06 });
      chairsB.box(chx + Math.sin(turn) * -0.2, 0.7, chz - Math.cos(turn) * 0.2, 0.42, 0.42, 0.04, blue ? 0x4a5a7a : 0x7a4a3a, { ry: turn });
      chairsB.box(chx, 0.2, chz, 0.36, 0.4, 0.34, 0x2a2a2c, { ry: turn, skip: "py,ny" });
    }
    // sunbeams through the outer windows (low, slanted, additive)
    K.light(-10.6, 2.0, zc, V.sun, 9.5, 0.9);
    K.light(-6, 2.6, zc + 1, V.lamp, 7, 0.25);
  }
  // beams: one transparent additive batch
  var beams = K.batch({ seg: 0, mat: vcMat({ transparent: true, opacity: 0.16, additive: true, side: THREE.DoubleSide }), lit: false, chunk: 0 });
  for (var rb = 0; rb < ROOMS; rb++) { var zcb = 1 - rb * RL - RL / 2; for (var bw = -1; bw <= 1; bw++) beams.box(-9.2, 1.1, zcb + bw * 3.7, 4.6, 0.04, 2.5, V.sun, { rz: -0.5, emit: 1 }); }
  // ---- the stair hall at the end: up toward the roof door ----
  var sz0 = zEnd, sh = 7.4;
  K.slab(-2.6, sz0 - 20, 2.6, sz0, 0, mixC(V.floor, 0x000000, 0.1));
  K.wallX(-2.6, sz0 - 20, sz0, 0, sh, wall); K.wallX(2.6, sz0 - 20, sz0, 0, sh, wall, { gaps: [{ a: sz0 - 14, b: sz0 - 6, lo: 2.2, hi: 6.8 }] });
  K.wallZ(sz0 - 20, -2.6, 2.6, 0, sh, wall);
  K.wallZ(zEnd, 2.0, 2.6, 0, H, wall);
  K.box(0, sh + 0.15, sz0 - 10, 5.2, 0.3, 20, mixC(wall, 0x000000, 0.3), { seg: 3, skip: "py" });
  K.box(0, H + 0.5, sz0, 5.2, 1.0, 0.3, wall);
  var st = K.stairs(0, sz0 - 2, "-z", 10, 5.2, 0, 3.6, mixC(V.floor, 0xffffff, 0.1));
  K.slab(-2.6, sz0 - 20, 2.6, sz0 - 12, 3.6, mixC(V.floor, 0x000000, 0.05));
  K.box(-2.45, 1.8 + 0.9, sz0 - 7, 0.06, 0.06, 10.6, 0x3a3a3a, { seg: 0, rx: Math.atan2(3.6, 10) });
  K.box(2.45, 1.8 + 0.9, sz0 - 7, 0.06, 0.06, 10.6, 0x3a3a3a, { seg: 0, rx: Math.atan2(3.6, 10) });
  // the huge low sun through the stair-hall window
  var sun = new THREE.Mesh(new THREE.CircleGeometry(9, 24), objMat({ color: V.sun, bright: 1.35 })); sun.position.set(30, 3.5, sz0 - 10); sun.rotation.y = -Math.PI / 2; buildGroup.add(sun);
  K.glowAt(26, 4, sz0 - 10, V.sun, 22, 0.35);
  K.light(1.8, 4.8, sz0 - 10, V.sun, 10, 1.1);
  K.light(0, 5.4, sz0 - 17, V.lamp, 7, 0.8);
  // exit sign + the roof door, and the way back out the front
  K.box(0, 3.0, zEnd - 0.2, 0.9, 0.3, 0.08, 0x40c070, { seg: 0, emit: 1.6 });
  K.door(0, 3.6, sz0 - 19.8, 0, K.onward(), { light: V.sun, sign: 0x40c070, col: 0x8a7a6a, open: 0.7 });
  K.wallZ(8, -12, 2.15, 0, H, wall, { gaps: [{ a: -0.7, b: 0.7, hi: 2.35 }] });
  // the entrance hall: shoe cubbies, a bench, a plant that has outgrown its pot
  K.wallZ(1, -12, -2.05, 0, H, wall);
  for (var cb = 0; cb < 5; cb++) for (var cl = 0; cl < 4; cl++) { K.box(-11.6, 0.3 + cl * 0.42, 6.6 - cb * 0.9, 0.6, 0.4, 0.84, 0x9a8a72, { seg: 0, vary: 0.06 }); K.box(-11.32, 0.3 + cl * 0.42, 6.6 - cb * 0.9, 0.04, 0.3, 0.7, 0x3a3028, { seg: 0 }); }
  K.solid(-11.6, 0, 4.8, 0.7, 1.8, 4.6);
  K.box(-6, 0.42, 2.0, 3.2, 0.08, 0.5, 0x8a6a48, { solid: true, seg: 0 }); K.box(-7.4, 0.2, 2.0, 0.08, 0.4, 0.4, 0x3a3a3a, { seg: 0 }); K.box(-4.6, 0.2, 2.0, 0.08, 0.4, 0.4, 0x3a3a3a, { seg: 0 });
  K.cyl(-3.0, 0.3, 6.8, 0.35, 0.28, 0.6, 0x8a4a30, { n: 8, solid: true }); K.sph(-3.0, 1.6, 6.8, 0.9, blue ? 0x2a4a3a : 0x3a5a2a, { ws: 6, hs: 5, sy: 1.6 });
  K.light(-6, 2.8, 4.5, V.lamp, 7, 0.55);
  K.door(0, 0, 7.9, Math.PI, K.onward(), { light: mixC(V.sun, 0xffffff, 0.3), open: 0.25, col: 0x6a7a8a });
  K.wallX(-12, 1, 8, 0, H, wall);
  // ---- motion: dust in the sunbeams, a paper plane, clocks, a faulty tube ----
  for (var dm = 0; dm < ROOMS; dm += 2) K.motes(40, -11.5, -6, 0.3, 2.6, 1 - dm * RL - RL, 1 - dm * RL, V.sun, 0.05, "drift", 0.4);
  K.motes(60, -2, 2, 1.0, 6.5, zEnd - 18, zEnd - 2, V.sun, 0.05, "drift", 0.3);
  var plane2 = K.batch({ seg: 0, chunk: 0 });
  plane2.geo(new THREE.ConeGeometry(0.16, 0.55, 3), 0, 0, 0, 0xf2ece0, { rx: -Math.PI / 2, sy: 1, sz: 0.25 });
  var plane3 = plane2.mesh(0, 2.4, 0);
  K.anim(function (dt, t) {
    if (plane3) { var u = (t * 0.06) % 1, pz = 6 - u * (6 - zEnd + 4); plane3.position.set(Math.sin(t * 0.7) * 1.2, 2.2 + Math.sin(t * 1.3) * 0.35 - u * 0.6, pz); plane3.rotation.set(Math.sin(t * 1.3) * 0.2, Math.cos(t * 0.7) * 0.5, Math.sin(t * 0.7) * 0.4); }
    for (var k = 0; k < clocks.length; k++) { var c = clocks[k], dir = c[2] === ROOMS - 1 ? -1 : 1, base = c[2] * 0.6; c[0].rotation.z = -(base * 12 + t * 0.12 * dir); c[1].rotation.z = -(base + t * 0.01 * dir); }
  });
  // ---- interactables ----
  var lastZ0 = 1 - (ROOMS - 1) * RL, my = deskTops[deskTops.length - 6];
  var yours = new THREE.Group(); var yb = K.batch({ seg: 0, parent: yours, chunk: 0 });
  yb.geo(new THREE.ConeGeometry(0.1, 0.3, 3), 0, 0.82, 0, 0xf2ece0, { rx: -Math.PI / 2, sz: 0.3 });
  yb.box(0.2, 0.76, 0.1, 0.18, 0.02, 0.24, 0xe8d8b0, { ry: 0.3 });
  yours.position.set(my[0], 0, my[1]); buildGroup.add(yours); yb.mesh(0, 0, 0, yours);
  K.light(my[0], 1.6, my[1], V.lamp, 3, 0.9);
  K.ix(yours, my[0], my[1], 2.0, [
    "your desk. the drawing you scratched into it is still here, smaller than you remember.",
    "a paper crane, folded badly, the way you used to. it is addressed to tonight.",
    "you sit for a while. nobody calls your name. it is a kind of rest."
  ], { on: function () { if (audio.ctx) audio.creature("creak", 0, 0.8); } });
  var bz0 = 1 - 3 * RL;
  var boardHot = new THREE.Object3D(); boardHot.position.set(-7, 1.6, bz0 - 0.4);
  K.ix(boardHot, -7, bz0 - 0.9, 2.4, [
    "the chalk is still warm. someone wrote your name and then, kindly, erased it.",
    "under the dust, in small letters: you're doing fine.",
    "the board is darker where a hand rested for a long time."
  ], { glow: false, on: function () { if (audio.ctx) audio.creature("tick", 0, 0.6); } });
  var bell = new THREE.Group(); var bb2 = K.batch({ seg: 0, parent: bell, chunk: 0 });
  bb2.cyl(0, 0, 0, 0.16, 0.2, 0.12, 0xb89040, { rx: Math.PI / 2, n: 10 }); bb2.box(0, 0, -0.08, 0.3, 0.3, 0.04, 0x4a4a4a);
  bell.position.set(-1.95, 2.6, 2); bell.rotation.y = Math.PI / 2; buildGroup.add(bell); bb2.mesh(0, 0, 0, bell);
  K.ix(bell, -1.6, 2, 2.2, [
    "the bell rings for no one. nobody hurries.",
    "it rings again, softer, as if apologising.",
    "somewhere upstairs, a chair scrapes back."
  ], { on: function () { if (audio.ctx) { audio.creature("bell", 0, 1.6); audio.creature("bell", 0, 1.61); } } });
  if (tubes.length) { var flick = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 1.6), objMat({ color: V.lamp, bright: 1.6 })); flick.position.set(0, H - 0.04, tubes[0]); buildGroup.add(flick); K.anim(function (dt, t) { flick.material.uniforms.uBright.value = (Math.sin(t * 23) > 0.6 || Math.sin(t * 3.1) > 0.2) ? 1.7 : 0.25; }); }
  return K.finish({
    spawn: { x: 0, y: 0, z: 5, yaw: 0 }, fog: [V.fog, 6, 58], sky: mixC(V.fog, 0x000000, 0.4), bounds: 0, killY: -8, sound: "hum", desat: 0.05
  });
});

/* =========================================================================
   2. THE LAUNDROMAT AT FOUR — fluorescent, empty, raining outside. In every
   porthole a small weather is being washed: a rain, a snow, a storm, a dusk.
   A stair climbs to the loft, where one old dryer stands open and warm.
   ========================================================================= */
// tiny weathers, built once per dream in a local frame (the drum looks down -z)
function weatherGeo(K, kind) {
  var b = K.batch({ seg: 0, lit: false, chunk: 0 }), R = 0.22, i, a, r;
  var bg = { rain: 0x2a3a4a, snow: 0x8a96a8, sun: 0x6aa0d8, storm: 0x1a1a26, stars: 0x0a0e22, leaves: 0xd08a4a, fog: 0x8a9090, aurora: 0x081420, dusk: 0xc8603a }[kind] || 0x333333;
  b.disc(0, 0, -0.12, R, bg, { emit: 1.0, n: 12 });
  function cloud(cx, cy, col, s) { for (var k = 0; k < 3; k++) b.sph(cx + (k - 1) * 0.05 * s, cy + (k === 1 ? 0.02 : 0), -0.08, 0.045 * s, col, { emit: 1.1, ws: 5, hs: 4, sz: 0.5 }); }
  if (kind === "rain") { cloud(0, 0.08, 0xb8c4d0, 1.2); for (i = 0; i < 9; i++) b.box(rr(-0.12, 0.12), rr(-0.15, 0.02), -0.07, 0.006, 0.05, 0.006, 0xa8d0f0, { emit: 1.4 }); }
  else if (kind === "snow") { for (i = 0; i < 16; i++) { a = rng() * TAU; r = Math.sqrt(rng()) * 0.18; b.box(Math.cos(a) * r, Math.sin(a) * r, -0.07, 0.014, 0.014, 0.014, 0xffffff, { emit: 1.6, rz: rng() }); } b.cone(0, -0.1, -0.08, 0.05, 0.12, 0x2a4a3a, { emit: 1, n: 5, rx: 0 }); }
  else if (kind === "sun") { b.sph(0.03, 0.04, -0.08, 0.06, 0xffd860, { emit: 1.7, ws: 8, hs: 6 }); for (i = 0; i < 7; i++) { a = i / 7 * TAU; b.box(0.03 + Math.cos(a) * 0.1, 0.04 + Math.sin(a) * 0.1, -0.08, 0.04, 0.008, 0.008, 0xfff0a0, { emit: 1.6, rz: a }); } cloud(-0.08, -0.08, 0xffffff, 0.9); }
  else if (kind === "storm") { cloud(0, 0.09, 0x3a3a4a, 1.4); cloud(-0.06, 0.05, 0x2a2a38, 1.1); b.box(0.01, -0.02, -0.07, 0.012, 0.09, 0.008, 0xfff2a0, { emit: 2, rz: 0.4 }); b.box(-0.01, -0.09, -0.07, 0.012, 0.08, 0.008, 0xfff2a0, { emit: 2, rz: -0.5 }); }
  else if (kind === "stars") { for (i = 0; i < 22; i++) { a = rng() * TAU; r = Math.sqrt(rng()) * 0.19; b.box(Math.cos(a) * r, Math.sin(a) * r, -0.09, 0.008, 0.008, 0.005, 0xfffbe8, { emit: 1.8 }); } b.sph(0.08, 0.07, -0.09, 0.03, 0xf0ead0, { emit: 1.4, ws: 6, hs: 5, sz: 0.3 }); }
  else if (kind === "leaves") { for (i = 0; i < 12; i++) { a = rng() * TAU; r = Math.sqrt(rng()) * 0.17; b.box(Math.cos(a) * r, Math.sin(a) * r, -0.07, 0.03, 0.018, 0.004, pick([0xff9a40, 0xd84a2a, 0xffd060, 0x9a3a1a]), { emit: 1.4, rz: rng() * 3 }); } }
  else if (kind === "fog") { for (i = 0; i < 7; i++) b.sph(rr(-0.12, 0.12), rr(-0.12, 0.12), -0.08, rr(0.04, 0.07), 0xd8dcdc, { emit: 1.1, ws: 5, hs: 4, sz: 0.4 }); }
  else if (kind === "aurora") { for (i = 0; i < 5; i++) b.box(rr(-0.06, 0.06), 0.06 - i * 0.03, -0.08, 0.3, 0.012, 0.004, i % 2 ? 0x60ffb0 : 0xa070ff, { emit: 1.6, rz: rr(-0.4, 0.4) }); for (i = 0; i < 8; i++) b.box(rr(-0.15, 0.15), rr(-0.15, 0.15), -0.09, 0.007, 0.007, 0.005, 0xffffff, { emit: 1.6 }); }
  else if (kind === "dusk") { b.sph(0, -0.06, -0.09, 0.08, 0xffc070, { emit: 1.6, ws: 8, hs: 6, sz: 0.3 }); b.box(0, -0.13, -0.08, 0.4, 0.06, 0.004, 0x3a2030, { emit: 1 }); for (i = 0; i < 3; i++) b.box(rr(-0.1, 0.1), 0.05 + i * 0.04, -0.08, rr(0.08, 0.16), 0.01, 0.004, 0xffa0a0, { emit: 1.3 }); }
  return b.geometry();
}
defineWorld("four_am_laundromat", { title: "the laundromat at four", tags: ["interior", "night", "rain"], valence: 0, interior: true }, function (P, mood) {
  var warm = rng() < 0.4;
  var V = warm ? { tube: 0xffe8c0, amb: 0x8a8070, fog: 0x1c1a16, wall: 0xd8ccb4, tileA: "#c8bca0", tileB: "#6a6050", mach: 0xe0dcd0, out: 0x101820 }
               : { tube: 0xdaf4ff, amb: 0x7a8a90, fog: 0x0f1a1e, wall: 0xc8d4d0, tileA: "#c8d0cc", tileB: "#4a5a5a", mach: 0xe8ece8, out: 0x0a1018 };
  var K = new World(P, mood, { sky: mixC(V.amb, 0x000000, 0.6), gnd: mixC(V.amb, 0x000000, 0.85) });
  var H = 3.4, HB = 6.8, zSplit = -6, wall = V.wall;
  // floor: checker tiles
  var tileTex = K.tex(function (x, W) { var s = W / 2; x.fillStyle = V.tileA; x.fillRect(0, 0, W, W); x.fillStyle = V.tileB; x.fillRect(0, 0, s, s); x.fillRect(s, s, s, s); x.fillStyle = "rgba(0,0,0,0.12)"; x.fillRect(0, s - 1, W, 2); x.fillRect(s - 1, 0, 2, W); }, 32);
  var FB = K.batch({ mat: vcMat({ map: tileTex }), tile: 1.2, seg: 2 });
  K.slab(-8, -16, 8, 16, 0, 0xffffff, { batch: FB, tile: 1.2, seg: 2 });
  // walls & ceilings (the back third is double height, with a loft)
  K.wallZ(-16, -8, 8, 0, HB, wall);
  K.wallX(-8, zSplit, 16, 0, H, wall); K.wallX(8, zSplit, 16, 0, H, wall);
  K.wallX(-8, -16, zSplit, 0, HB, mixC(wall, 0x000000, 0.06)); K.wallX(8, -16, zSplit, 0, HB, mixC(wall, 0x000000, 0.06));
  K.wallZ(zSplit, -8, 8, H, HB - H, mixC(wall, 0x000000, 0.1));
  K.box(0, H + 0.15, (zSplit + 16) / 2, 16.2, 0.3, 16 - zSplit, mixC(wall, 0xffffff, 0.1), { skip: "py" });
  K.box(0, HB + 0.15, (zSplit - 16) / 2, 16.2, 0.3, 10, mixC(wall, 0x000000, 0.2), { skip: "py" });
  // storefront: two big panes and the door
  K.wallZ(16, -8, 8, 0, H, mixC(wall, 0x000000, 0.15), { gaps: [{ a: -7.2, b: -1.2, lo: 0.8, hi: 3.0 }, { a: -0.7, b: 0.7, hi: 2.3 }, { a: 1.2, b: 7.2, lo: 0.8, hi: 3.0 }] });
  for (var fx = -7.2; fx <= 7.2; fx += 2) if (Math.abs(fx) > 1) K.box(fx, 1.9, 16, 0.08, 2.2, 0.12, 0x4a4a4a, { seg: 0 });
  var glass = K.batch({ seg: 0, mat: vcMat({ transparent: true, opacity: 0.18, side: THREE.DoubleSide }), lit: false, chunk: 0 });
  glass.box(-4.2, 1.9, 16, 6, 2.2, 0.02, 0x9ab8c8, { emit: 1 }); glass.box(4.2, 1.9, 16, 6, 2.2, 0.02, 0x9ab8c8, { emit: 1 });
  // "open all night" in the window, backwards from inside
  var neon = K.tex(function (x, W, Hh) { x.clearRect(0, 0, W, Hh); x.save(); x.translate(W, 0); x.scale(-1, 1); textLines(x, ["open all night"], W, Hh, { size: 22, color: "#ff7aa8", font: "monospace" }); x.restore(); }, 256, 48, true);
  var neonM = K.picture(4.2, 2.65, 15.92, 3.4, 0.64, neon, { ry: Math.PI, transparent: true, bright: 1.6 });
  K.door(0, 0, 15.95, Math.PI, K.onward(), { light: 0x9ab0c8, col: 0x6a7a80, open: 0.35, glow: 1.1 });
  // ---- the washers: an island of two rows back to back ----
  var kinds = ["rain", "snow", "sun", "storm", "stars", "leaves", "fog", "aurora", "dusk"], geos = {};
  for (var gk = 0; gk < kinds.length; gk++) geos[kinds[gk]] = weatherGeo(K, kinds[gk]);
  var wMat = vcMat({}), stormMat = vcMat({}), glassB = K.batch({ seg: 0, mat: vcMat({ transparent: true, opacity: 0.22 }), lit: false, chunk: 0 });
  var drums = [];
  function drum(x, y, z, ry, kind, spin) {
    var g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; buildGroup.add(g);
    var m = new THREE.Mesh(geos[kind], kind === "storm" ? stormMat : wMat); m.position.z = 0.125; g.add(m); m.rotation.z = rng() * TAU;
    drums.push([m, spin, kind]);
    // ring + glass in the static batches (world space)
    var nx = Math.sin(ry), nz = Math.cos(ry);
    K.B.torus(x + nx * 0.04, y, z + nz * 0.04, 0.25, 0.04, 0xb8bcc0, { ry: ry, rs: 4, ts: 12 });
    glassB.disc(x + nx * 0.075, y, z + nz * 0.075, 0.24, 0xc8e0f0, { ry: ry, emit: 1 });
    return g;
  }
  var NW = 11, wz0 = 5.6, oo = 3 + ((rng() * 4) | 0);
  for (var row = -1; row <= 1; row += 2) for (var i = 0; i < NW; i++) {
    var z = wz0 - i * 0.9, x = row * 0.42;
    K.box(x, 0.48, z, 0.8, 0.95, 0.84, V.mach, { seg: 0, skip: "ny", vary: 0.03 });
    K.box(x + row * 0.36, 0.88, z, 0.1, 0.12, 0.7, 0x3a4048, { seg: 0 });
    K.box(x + row * 0.41, 0.88, z - 0.2, 0.02, 0.05, 0.12, 0x60ff90, { seg: 0, emit: 1.4 });
    var kd = (row < 0 && i === oo) ? "rain" : kinds[(i * 3 + (row > 0 ? 4 : 0) + ((rng() * 2) | 0)) % kinds.length];
    drum(x + row * 0.41, 0.5, z, row < 0 ? -Math.PI / 2 : Math.PI / 2, kd, (rng() < 0.2 ? 0 : rr(0.4, 1.6)) * (rng() < 0.5 ? -1 : 1));
  }
  K.box(0, 0.98, wz0 - (NW - 1) * 0.45, 1.7, 0.04, NW * 0.9 + 0.2, 0x8a8a84, { seg: 0 });
  K.solid(0, 0, wz0 - (NW - 1) * 0.45, 1.7, 1.0, NW * 0.9 + 0.2);
  // out-of-order note
  var oooZ = wz0 - oo * 0.9;
  var note = K.tex(function (x, W, Hh) { x.fillStyle = "#f2ecd8"; x.fillRect(0, 0, W, Hh); textLines(x, ["out of", "order"], W, Hh, { size: 13, color: "#3a3040" }); }, 64, 48, true);
  K.picture(-0.84, 0.82, oooZ, 0.26, 0.2, note, { ry: -Math.PI / 2, decal: true });
  // ---- dryers, two high, along the right wall ----
  for (var c = 0; c < 8; c++) for (var lv = 0; lv < 2; lv++) {
    var dz = 5 - c * 1.0, dy = 0.5 + lv * 0.98;
    K.box(7.5, dy, dz, 0.8, 0.96, 0.96, mixC(V.mach, 0x000000, 0.08), { seg: 0, skip: "px", vary: 0.03 });
    drum(7.09, dy, dz, -Math.PI / 2, pick(["dusk", "sun", "leaves", "stars"]), rr(1.2, 2.4));
    K.box(7.09, dy + 0.38, dz, 0.02, 0.1, 0.5, 0x2a2a2a, { seg: 0 });
  }
  K.solid(7.5, 0, 1.5, 0.9, 2.0, 8.2);
  // ---- left wall: folding tables, chairs by the window, a tv nobody watches ----
  for (var t = 0; t < 2; t++) { var tz = 6 - t * 4; K.box(-6.6, 0.86, tz, 1.0, 0.06, 2.6, 0xd8d8d0, { seg: 0, solid: false }); K.box(-6.6, 0.42, tz, 0.9, 0.84, 2.4, 0x5a5a5a, { seg: 0, skip: "py,ny" }); K.solid(-6.6, 0, tz, 1.0, 0.9, 2.6); }
  for (var ch = 0; ch < 5; ch++) { var cx = -6.2 + ch * 0.9; K.box(cx, 0.44, 14.6, 0.48, 0.06, 0.46, warm ? 0xd06a3a : 0x3a8ad0, { seg: 0 }); K.box(cx, 0.72, 14.84, 0.48, 0.5, 0.05, warm ? 0xd06a3a : 0x3a8ad0, { seg: 0 }); K.box(cx, 0.21, 14.6, 0.4, 0.42, 0.36, 0x3a3a3a, { seg: 0, skip: "py,ny" }); }
  K.solid(-4.4, 0, 14.6, 4.6, 0.9, 0.6);
  K.box(-7.75, 2.75, 10, 0.3, 0.1, 0.3, 0x2a2a2a, { seg: 0 }); K.box(-7.45, 2.5, 10, 0.6, 0.5, 0.75, 0x1a1a1c, { seg: 0 });
  var tvTex = K.tex(function (x, W, Hh) { var bars = ["#c8c8c8", "#c8c820", "#20c8c8", "#20c820", "#c820c8", "#c82020", "#2020c8"]; for (var i2 = 0; i2 < 7; i2++) { x.fillStyle = bars[i2]; x.fillRect(i2 * W / 7, 0, W / 7 + 1, Hh * 0.7); } x.fillStyle = "#101010"; x.fillRect(0, Hh * 0.7, W, Hh * 0.3); textLines(x, ["please stand by"], W, Hh * 0.3, { size: 9, color: "#d8d8d8", dy: Hh * 0.7 - 8 }); }, 64, 48);
  var tvScr = K.picture(-7.14, 2.5, 10, 0.52, 0.4, tvTex, { ry: Math.PI / 2, bright: 1.3 });
  // price board
  var price = K.tex(function (x, W, Hh) { x.fillStyle = "#1a2a2a"; x.fillRect(0, 0, W, Hh); textLines(x, ["wash ..... 4", "dry ...... 2", "dream .... free"], W, Hh, { size: 12, color: "#e8f0e0", align: "left", x: 10 }); }, 128, 64, true);
  K.picture(-7.84, 1.9, 4, 1.4, 0.7, price, { ry: Math.PI / 2 });
  // change machine + soap machine on the right, past the dryers
  K.box(7.55, 0.9, 8.2, 0.7, 1.8, 0.8, 0x8a9098, { seg: 0, solid: true });
  K.box(7.18, 1.2, 8.2, 0.04, 0.5, 0.4, 0x50d0ff, { seg: 0, emit: 1.3 });
  K.box(7.55, 0.8, 10.0, 0.7, 1.6, 0.8, warm ? 0xc04a3a : 0x3a6ac0, { seg: 0, solid: true });
  K.box(7.18, 1.15, 10.0, 0.04, 0.7, 0.55, 0xffffff, { seg: 0, emit: 1.1 });
  // ---- fluorescent tubes ----
  var flickTube = null;
  for (var lx = -1; lx <= 1; lx++) for (var lz = 13; lz > zSplit; lz -= 4) {
    K.box(lx * 3.6, H - 0.04, lz, 0.22, 0.07, 1.8, V.tube, { seg: 0, emit: 1.6 });
    K.light(lx * 3.6, H - 0.5, lz, V.tube, 7, 0.75);
    if (!flickTube && lx === 1 && lz < 3) flickTube = [lx * 3.6, lz];
  }
  // ---- the stair to the loft, along the left wall ----
  K.stairs(-7.1, -0.4, "-z", 10.2, 1.2, 0, 3.2, 0x7a7a7a, { floating: true, thick: 0.3 });
  K.solid(-6.45, 0, -5.5, 0.1, 4.2, 10.2);
  K.box(-6.45, 2.6, -5.5, 0.05, 0.05, 10.8, 0x3a3a3a, { seg: 0, rx: Math.atan2(3.2, 10.2) });
  K.slab(-8, -16, 8, -10.6, 3.2, 0x6a6058, { t: 0.3, skip: "" });
  K.box(0.75, 4.25, -10.6, 14.5, 0.06, 0.06, 0x3a3a3a, { seg: 0 }); for (var rp = -6.4; rp <= 8; rp += 1.2) K.box(rp, 3.7, -10.6, 0.05, 1.0, 0.05, 0x3a3a3a, { seg: 0 });
  K.solid(0.75, 3.2, -10.6, 14.5, 1.2, 0.2);
  // under the loft: a staff door, a mop, a dim bulb
  K.box(3, 1.1, -15.85, 1.0, 2.2, 0.06, 0x5a6a6a, { seg: 0 }); K.box(3.4, 1.1, -15.8, 0.06, 0.06, 0.1, 0xc0c0c0, { seg: 0 });
  K.cyl(5.5, 0.6, -15.4, 0.03, 0.03, 1.2, 0x8a6a4a, { n: 4, rz: 0.2 });
  K.light(0, 2.4, -13.5, 0xffc890, 5, 0.6); K.box(0, 2.86, -13.5, 0.12, 0.12, 0.12, 0xffd8a0, { seg: 0, emit: 1.8 });
  // the loft: bags of laundry, a cot, and one old dryer, open and warm
  for (var lb = 0; lb < 9; lb++) K.sph(rr(-6, 6), 3.55, rr(-15.3, -13.5), rr(0.35, 0.6), hsl(rng(), 0.2, 0.55), { ws: 6, hs: 5, sy: 0.8 });
  K.box(-4.5, 3.5, -12.3, 2.0, 0.25, 0.8, 0x6a7a6a, { seg: 0, solid: true }); K.box(-5.3, 3.65, -12.3, 0.4, 0.1, 0.6, 0xe8e4d8, { seg: 0 });
  K.box(4.6, 3.75, -15.2, 1.1, 1.1, 1.0, 0xd8d0b8, { seg: 0, solid: true });
  K.torus(4.6, 3.8, -14.68, 0.33, 0.05, 0xc8b890, { rs: 4, ts: 12 });
  K.B.disc(4.6, 3.8, -14.69, 0.3, 0xffc070, { emit: 1.8 });
  K.box(4.6 + 0.32, 3.8, -14.4, 0.04, 0.6, 0.6, 0xc8c0a8, { seg: 0, ry: -1.0 });
  K.glowAt(4.6, 3.8, -14.4, 0xffb060, 3.2, 0.7);
  K.light(4.6, 3.9, -13.8, 0xffb060, 5.5, 1.3);
  pushBoxLink(4.6, -14.35, 0.55, 0.35, 0, 3.2, 5.0, { b: 0.4, e: -0.1 }, "door"); linkables[linkables.length - 1].target = K.onward();
  // the round skylight: a moon that looks like a porthole
  K.B.torus(0, HB - 0.02, -11.5, 1.6, 0.14, 0x5a5a5a, { rx: Math.PI / 2, rs: 4, ts: 18 });
  var moon = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20), objMat({ color: 0xdce8f0, bright: 1.25 })); moon.position.set(0, HB - 0.03, -11.5); moon.rotation.x = Math.PI / 2; buildGroup.add(moon);
  K.light(0, HB - 1, -11.5, 0xb8d0f0, 7, 0.7);
  // ---- outside: the wet street, rain, a streetlight, windows across the road ----
  var OB = K.batch({ seg: 5 });
  OB.box(0, -0.2, 17.8, 40, 0.2, 3.6, 0x3a3e44, { skip: "ny" }); OB.box(0, -0.4, 24, 40, 0.2, 9, 0x16181c, { skip: "ny" });
  for (var dl = -18; dl < 18; dl += 4) OB.box(dl, -0.29, 24, 1.8, 0.02, 0.15, 0xd8d0a0, { seg: 0, emit: 0.6 });
  for (var b2 = -20; b2 < 20; b2 += rrange(5, 8)) { var bh = rrange(6, 14), bw = rrange(4, 7); OB.box(b2 + bw / 2, bh / 2 - 0.4, 32, bw, bh, 4, mixC(V.out, 0xffffff, rr(0.05, 0.15)), { skip: "ny" }); for (var wy = 1.5; wy < bh - 1; wy += 2.2) for (var wx2 = b2 + 1; wx2 < b2 + bw - 0.5; wx2 += 1.6) if (rng() < 0.22) OB.quad(wx2, wy, 29.98, 0.8, 1.0, rng() < 0.5 ? 0xffd890 : 0x9ac8ff, { emit: 1.3 }); }
  OB.cyl(-4.5, 2.6, 18.6, 0.08, 0.1, 5.6, 0x2a2a2a, { n: 5 }); OB.box(-4.0, 5.35, 18.6, 1.2, 0.1, 0.25, 0x2a2a2a, { seg: 0 }); OB.box(-3.5, 5.25, 18.6, 0.4, 0.08, 0.2, 0xffc070, { seg: 0, emit: 1.8 });
  K.glowAt(-3.5, 5.1, 18.6, 0xffb060, 4, 0.6); K.light(-3.6, 4.5, 18.6, 0xffa050, 12, 1.0);
  OB.box(6, 0.35, 21.5, 4.2, 0.7, 1.9, 0x3a3440, { seg: 0 }); OB.box(5.8, 1.0, 21.5, 2.4, 0.6, 1.7, 0x2a2630, { seg: 0 });
  for (var pd = 0; pd < 6; pd++) OB.quad(rr(-12, 12), -0.27, rr(19.5, 27), rr(1, 3), rr(0.6, 1.6), 0x40506a, { rx: -Math.PI / 2, emit: 1.0 });
  var rainB = K.batch({ seg: 0, lit: false, chunk: 0, mat: vcMat({ transparent: true, opacity: 0.45, additive: true }) });
  for (var rd = 0; rd < 260; rd++) { var ry2 = rr(0, 9); rainB.quad(rr(-16, 16), ry2, rr(16.6, 30), 0.02, 0.5, 0x9ab8d0, { emit: 1, ry: Math.PI }); rainB.quad(rr(-16, 16), ry2 + 9, rr(16.6, 30), 0.02, 0.5, 0x9ab8d0, { emit: 1, ry: Math.PI }); }
  var rainM = rainB.mesh(0, 0, 0);
  // ---- interactables ----
  var oooHot = new THREE.Object3D(); oooHot.position.set(-0.9, 0.5, oooZ);
  K.ix(oooHot, -1.2, oooZ, 2.0, [
    "out of order. inside, a small rain is falling on a small town. it has been raining there all night.",
    "you could watch it for hours. you have, maybe.",
    "the little town has one light on. someone there can't sleep either."
  ], { glow: false, on: function () { if (audio.ctx) audio.creature("hum", -0.3, 0.8); } });
  var cm = new THREE.Object3D(); cm.position.set(7.1, 1.2, 8.2);
  K.ix(cm, 6.6, 8.2, 2.0, [
    "it gives you four coins, still warm, minted with a face you almost remember.",
    "it gives you four more. it seems to want you to stay.",
    "nothing this time. just the sound of coins, very far down."
  ], { glow: false, on: function (e, i) { if (audio.ctx) { for (var k = 0; k < (i < 2 ? 4 : 1); k++) setTimeout(function () { audio.creature("tick", 0.3, 1.4); }, k * 120); } } });
  var sock = new THREE.Group(); var sb = K.batch({ seg: 0, parent: sock, chunk: 0 }); sb.box(0, 0.92, 0, 0.12, 0.04, 0.32, warm ? 0x7a9ac8 : 0xd87a8a); sb.box(0.06, 0.92, 0.14, 0.16, 0.04, 0.1, warm ? 0x7a9ac8 : 0xd87a8a); buildGroup.add(sock); sock.position.set(-6.5, 0, 2.2); sb.mesh(0, 0, 0, sock);
  K.ix(sock, -6.5, 2.2, 2.0, [
    "one sock, folded with great care. the other one is dreaming somewhere else.",
    "it is still warm from the dryer. it has been warm for years."
  ]);
  // ---- motion ----
  var t0 = rng() * 10, flick = null;
  if (flickTube) { flick = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.08, 1.82), objMat({ color: V.tube, bright: 1.6 })); flick.position.set(flickTube[0], H - 0.035, flickTube[1]); buildGroup.add(flick); }
  var hum = 2;
  K.anim(function (dt, t) {
    for (var k = 0; k < drums.length; k++) { var d = drums[k]; d[0].rotation.z += d[1] * dt; }
    var fl = (Math.sin(t * 7.3) > 0.85 || Math.sin(t * 1.7 + 1) > 0.97) ? 2.4 : 1.0;
    stormMat.uniforms.uBright.value = fl;
    if (rainM) rainM.position.y = -((t * 7) % 9);
    if (flick) flick.material.uniforms.uBright.value = (Math.sin(t * 31) > 0.3 && Math.sin(t * 0.9) > -0.4) ? 1.7 : 0.2;
    if (neonM) neonM.material.uniforms.uBright.value = 1.4 + Math.sin(t * 2.1) * 0.15 + (Math.sin(t * 13) > 0.97 ? -0.8 : 0);
    if (tvScr) tvScr.material.uniforms.uBright.value = 1.2 + Math.sin(t * 40) * 0.05;
    hum -= dt; if (hum <= 0) { hum = rr(3, 6); if (audio.ctx && Math.abs(pos.x) < 5 && pos.z > -6) audio.creature("hum", clamp(-pos.x / 6, -1, 1), rr(0.5, 0.7)); }
  });
  K.motes(50, -7, 7, 0.3, 3.0, -15, 14, V.tube, 0.035, "drift", 0.25);
  return K.finish({
    spawn: { x: -2.6, y: 0, z: 13.2, yaw: -0.3 }, fog: [V.fog, 7, 44], sky: V.out, bounds: 0, killY: -8, sound: "machine", desat: 0.05
  });
});

/* =========================================================================
   3. THE WAITING ROOM, UNDERWATER — a dentist's waiting room that has quietly
   filled with sea. Fish thread between the chairs, kelp grows from the carpet,
   and the aquarium in the wall is the only dry place: someone tiny waits in it.
   Up the half-stair, the treatment room, and a door that says next.
   ========================================================================= */
function fishGeo(K, small) {
  var b = K.batch({ seg: 0, chunk: 0, lit: false }), s = small ? 0.5 : 1;
  b.sph(0, 0, 0, 0.17 * s, 0xffffff, { ws: 6, hs: 5, sx: 0.55, sy: 0.95, sz: 1.7, vary: 0 });
  b.cone(0, 0, -0.38 * s, 0.13 * s, 0.22 * s, 0xe8e8e8, { rx: Math.PI / 2, sx: 0.25, n: 4, vary: 0 });
  b.box(0, 0.12 * s, -0.02 * s, 0.02 * s, 0.1 * s, 0.16 * s, 0xdddddd, { seg: 0, vary: 0 });
  b.sph(0.06 * s, 0.04 * s, 0.2 * s, 0.025 * s, 0x101010, { ws: 4, hs: 3, vary: 0 }); b.sph(-0.06 * s, 0.04 * s, 0.2 * s, 0.025 * s, 0x101010, { ws: 4, hs: 3, vary: 0 });
  return b.geometry();
}
defineWorld("aquarium_waiting_room", { title: "the waiting room, underwater", tags: ["interior", "water", "uncanny"], valence: 0, interior: true }, function (P, mood) {
  var K = new World(P, mood, { sky: 0x2a5a66, gnd: 0x0e2a30, dir: [0.2, 1, -0.3], dirCol: 0x1a3a40 });
  var H = 3.0, wall = 0xb8c8c0, carpet = 0x3a5a6a;
  // ---- the waiting room ----
  var carpTex = K.tex(function (x, W) { noiseFill(x, W, W, "#8a9aa0", 0.18, 500, 2); x.strokeStyle = "rgba(40,60,70,0.25)"; for (var i = 0; i < W; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, W); x.stroke(); } }, 64);
  K.slab(-8, -9, 8, 7, 0, carpet, { batch: K.batch({ mat: vcMat({ map: carpTex }), tile: 2, seg: 2 }), tile: 2, seg: 2 });
  K.wallX(-8, -9, 7, 0, H, wall, { gaps: [{ a: -5, b: -1.2, lo: 0.9, hi: 2.4 }, { a: 1.2, b: 5, lo: 0.9, hi: 2.4 }] });
  K.wallX(8, -9, 7, 0, H, wall, { gaps: [{ a: -2, b: 2, lo: 0.8, hi: 2.2 }] });
  K.wallZ(7, -8, 8, 0, H, wall, { gaps: [{ a: 3.4, b: 4.6, hi: 2.3 }] });
  K.wallZ(-9, -8, 8, 0, H, wall, { gaps: [{ a: 2.4, b: 4.2, hi: 2.4 }] });
  K.box(0, H + 0.15, -1, 16.4, 0.3, 16.4, 0xa8b8b4, { skip: "py" });
  for (var wx = -6; wx <= 6; wx += 4) for (var wz = -6; wz <= 5; wz += 4) { K.box(wx, H - 0.03, wz, 1.1, 0.05, 1.1, 0xe0fff8, { seg: 0, emit: 1.35 }); K.light(wx, H - 0.6, wz, 0xc8f0ff, 6.5, 0.55); }
  // window frames on the west wall, the open sea beyond
  for (var wf = -1; wf <= 1; wf += 2) { K.box(-8, 1.65, wf * 3.1, 0.36, 0.08, 3.9, 0x6a7a7a, { seg: 0 }); K.box(-7.8, 0.88, wf * 3.1, 0.3, 0.06, 3.9, 0x6a7a7a, { seg: 0 }); }
  var SEA = K.batch({ seg: 4 });
  SEA.box(-22, -0.5, 0, 26, 0.4, 40, 0x1a3a3a, { skip: "ny" });
  for (var rk = 0; rk < 16; rk++) SEA.sph(rr(-30, -11), rr(-0.4, 0.6), rr(-18, 18), rr(0.8, 2.4), 0x2a4a48, { ws: 6, hs: 4, sy: 0.6 });
  var kelpFar = []; for (var kf = 0; kf < 10; kf++) { var kb = K.batch({ seg: 0, chunk: 0 }), kh = rr(4, 9); for (var ks = 0; ks < 8; ks++) kb.box(Math.sin(ks * 0.8) * 0.2, ks * kh / 8 + kh / 16, 0, 0.18, kh / 8 + 0.05, 0.05, 0x2a5a3a); var km = kb.mesh(rr(-28, -12), -0.3, rr(-16, 16)); if (km) kelpFar.push([km, rng() * TAU]); }
  var whaleB = K.batch({ seg: 0, chunk: 0, lit: false });
  whaleB.sph(0, 0, 0, 3, 0x0a1e26, { ws: 8, hs: 6, sz: 2.8, sy: 0.8 }); whaleB.cone(0, 0.2, -9.5, 2.6, 3, 0x0a1e26, { rx: Math.PI / 2, sy: 0.25, n: 4 }); whaleB.box(2.6, -0.8, 1, 3.2, 0.2, 1.2, 0x0a1e26, { ry: 0.4, rz: -0.3 }); whaleB.box(-2.6, -0.8, 1, 3.2, 0.2, 1.2, 0x0a1e26, { ry: -0.4, rz: 0.3 });
  var whale = whaleB.mesh(-20, 4, 0);
  // the reception counter and the room behind the glass
  K.box(-4, 0.55, -6.4, 6, 1.1, 0.8, 0x7a8a8a, { solid: true, seg: 0 }); K.box(-4, 1.13, -6.4, 6.2, 0.06, 1.0, 0xd8dcd4, { seg: 0 });
  var gB = K.batch({ seg: 0, chunk: 0, lit: false, mat: vcMat({ transparent: true, opacity: 0.16, side: THREE.DoubleSide }) });
  gB.box(-4, 1.8, -6.75, 6, 1.3, 0.03, 0xc8f0f0, { emit: 1 });
  K.solid(-4, 0, -6.75, 6, 2.5, 0.1);
  K.box(-5, 0.75, -8.2, 1.6, 0.06, 0.8, 0x6a5a4a, { seg: 0 }); K.box(-5, 1.05, -8.4, 0.5, 0.36, 0.06, 0x1a2a2a, { seg: 0 }); K.box(-5, 1.05, -8.36, 0.44, 0.3, 0.02, 0x60c0b0, { seg: 0, emit: 1.2 });
  K.light(-5, 1.6, -7.8, 0x80e0d0, 3, 0.6);
  var chairB = K.batch({ seg: 0, chunk: 0 }); chairB.box(0, 0.45, 0, 0.5, 0.08, 0.5, 0x2a3a4a); chairB.box(0, 0.8, -0.24, 0.5, 0.6, 0.06, 0x2a3a4a); chairB.cyl(0, 0.2, 0, 0.04, 0.04, 0.4, 0x8a8a8a, { n: 5 });
  var officeChair = chairB.mesh(-3.2, 0, -8.0);
  var serve = K.tex(function (x, W, Hh) { x.fillStyle = "#100808"; x.fillRect(0, 0, W, Hh); textLines(x, ["now serving", "0"], W, Hh, { size: 15, color: "#ff5040", font: "monospace" }); }, 128, 64, true);
  K.picture(-4, 2.55, -8.84, 1.4, 0.7, serve, { bright: 1.5 });
  // chairs: along the walls, and two rows back to back
  var seat = 0x3a7a8a;
  function chairAt(x, z, ry) { var s = Math.sin(ry), c = Math.cos(ry); K.box(x, 0.45, z, 0.52, 0.09, 0.5, seat, { ry: ry, seg: 0, vary: 0.05 }); K.box(x - s * 0.24, 0.78, z - c * 0.24, 0.52, 0.55, 0.07, seat, { ry: ry, seg: 0, vary: 0.05 }); K.box(x, 0.2, z, 0.46, 0.4, 0.44, 0x5a6060, { ry: ry, seg: 0, skip: "py,ny" }); }
  var seats = [];
  for (var c1 = 0; c1 < 8; c1++) { chairAt(-7.4, -4 + c1 * 1.1, Math.PI / 2); seats.push([-7.4, -4 + c1 * 1.1]); } K.solid(-7.45, 0, -0.15, 0.7, 1.1, 8.8);
  for (var c2 = 0; c2 < 6; c2++) { chairAt(-6 + c2 * 1.1, 6.4, Math.PI); seats.push([-6 + c2 * 1.1, 6.4]); } K.solid(-3.25, 0, 6.4, 6.6, 1.1, 0.7);
  for (var c3 = 0; c3 < 5; c3++) { chairAt(-3.2 + c3 * 1.1, 0.35, 0); chairAt(-3.2 + c3 * 1.1, -0.35, Math.PI); seats.push([-3.2 + c3 * 1.1, 0.35]); } K.solid(-1, 0, 0, 5.6, 1.1, 1.5);
  for (var c4 = 0; c4 < 3; c4++) { chairAt(7.4, -6 + c4 * 1.1, -Math.PI / 2); chairAt(7.4, 3.6 + c4 * 1.1, -Math.PI / 2); } K.solid(7.45, 0, -4.9, 0.7, 1.1, 3.4); K.solid(7.45, 0, 4.7, 0.7, 1.1, 3.4);
  // coffee table, magazines, a rubber plant
  K.box(-4.5, 0.38, 3.2, 1.6, 0.06, 0.8, 0x8a6a4a, { solid: true, seg: 0 }); K.box(-4.5, 0.18, 3.2, 1.4, 0.36, 0.6, 0x4a3a2a, { seg: 0, skip: "py,ny" });
  for (var mg = 0; mg < 6; mg++) K.box(-4.5 + rr(-0.6, 0.6), 0.42 + mg * 0.012, 3.2 + rr(-0.25, 0.25), 0.3, 0.012, 0.22, hsl(rng(), 0.35, 0.6), { seg: 0, ry: rr(-0.5, 0.5) });
  K.cyl(6.9, 0.3, -8.3, 0.32, 0.26, 0.6, 0x7a5a4a, { n: 8, solid: true }); for (var lf = 0; lf < 9; lf++) K.box(6.9 + rr(-0.4, 0.4), 0.8 + lf * 0.16, -8.3 + rr(-0.4, 0.4), 0.26, 0.02, 0.5, 0x2a5a3a, { seg: 0, ry: rng() * 3, rx: rr(-0.5, 0.5) });
  // ---- the dry aquarium in the east wall ----
  var TB = K.batch({ seg: 0, chunk: 0 });
  TB.box(9.35, 1.5, 0, 0.1, 1.6, 4.2, 0x3a3020); TB.box(8.75, 0.78, 0, 1.3, 0.06, 4.2, 0xc8b490); TB.box(8.75, 2.22, 0, 1.3, 0.06, 4.2, 0x2a2420); TB.box(8.75, 1.5, -2.08, 1.3, 1.5, 0.06, 0x3a3020); TB.box(8.75, 1.5, 2.08, 1.3, 1.5, 0.06, 0x3a3020);
  TB.box(9.28, 1.5, 0, 0.02, 1.3, 3.8, 0xb8a080); // tiny wallpaper
  for (var tc = 0; tc < 4; tc++) { var tz = -1.2 + tc * 0.55; TB.box(9.1, 0.93, tz, 0.16, 0.02, 0.15, 0x7a4a3a); TB.box(9.17, 1.02, tz, 0.02, 0.16, 0.15, 0x7a4a3a); TB.box(9.1, 0.86, tz, 0.12, 0.14, 0.12, 0x2a2a2a, { skip: "py" }); }
  TB.cyl(9.08, 1.0, 0.45, 0.035, 0.03, 0.2, 0x6a5a8a, { n: 5 }); TB.sph(9.08, 1.15, 0.45, 0.035, 0xd8b098, { ws: 5, hs: 4 }); TB.box(9.12, 0.93, 0.45, 0.16, 0.02, 0.15, 0x7a4a3a);
  TB.box(9.15, 1.35, 1.4, 0.03, 0.03, 0.03, 0xffe0a0, { emit: 2 }); TB.cyl(9.15, 1.1, 1.4, 0.01, 0.01, 0.5, 0x2a2a2a, { n: 3 });
  K.light(8.9, 1.6, 0.4, 0xffc890, 2.2, 1.6);
  gB.box(8.0, 1.5, 0, 0.02, 1.4, 4.0, 0xd8f0ff, { emit: 1 });
  // ---- the half-stair to the treatment room ----
  K.slab(2.3, -13.2, 4.3, -8.9, 0, carpet);
  K.wallX(2.3, -16.2, -9, 0, 4.7, wall); K.wallX(4.3, -16.2, -9, 0, 4.7, wall);
  K.box(3.3, H + 0.15, -11, 2.0, 0.3, 4.2, 0xa8b8b4, { seg: 0 });
  K.stairs(3.3, -13, "-z", 3.2, 1.95, 0, 1.5, 0x9aa8a4);
  K.box(3.3, 4.85, -14.6, 2.0, 0.3, 3.3, 0xa8b8b4, { seg: 0 });
  K.light(3.3, 2.6, -11.5, 0xc8f0ff, 4, 0.5);
  var TR = 1.5;
  K.slab(-3, -26, 9, -16, TR, 0xc8d4d0, { seg: 2 });
  K.wallZ(-16, -3, 9, TR, 3.2, wall, { gaps: [{ a: 2.3, b: 4.3, hi: 2.6 }] }); K.wallZ(-26, -3, 9, TR, 3.2, wall); K.wallX(-3, -26, -16, TR, 3.2, wall); K.wallX(9, -26, -16, TR, 3.2, wall);
  K.box(-3 + 12 / 2, TR + 3.35, -21, 12.4, 0.3, 10.4, 0xa8b8b4, { skip: "py" });
  // the chair, reclined, under its big lamp
  var cx0 = 3, cz0 = -21;
  K.cyl(cx0, TR + 0.3, cz0, 0.3, 0.45, 0.6, 0xd8dcd8, { n: 10, solid: true });
  K.box(cx0, TR + 0.75, cz0 + 0.2, 0.75, 0.18, 1.1, 0x4ab0b0, { seg: 0 }); K.box(cx0, TR + 1.05, cz0 - 0.65, 0.7, 0.16, 1.0, 0x4ab0b0, { seg: 0, rx: 0.55 }); K.box(cx0, TR + 0.5, cz0 + 1.0, 0.6, 0.14, 0.8, 0x4ab0b0, { seg: 0, rx: -0.5 });
  K.cyl(cx0 + 1.2, TR + 1.4, cz0 - 1.2, 0.05, 0.05, 2.8, 0xc0c0c0, { n: 5 }); K.box(cx0 + 0.6, TR + 2.75, cz0 - 0.6, 1.4, 0.06, 0.06, 0xc0c0c0, { seg: 0, ry: -0.78 });
  K.cyl(cx0, TR + 2.6, cz0, 0.4, 0.3, 0.2, 0xd8dcd8, { n: 10 }); K.disc(cx0, TR + 2.49, cz0, 0.3, 0xfff8e0, { rx: Math.PI / 2, emit: 2 });
  K.light(cx0, TR + 2.2, cz0, 0xfff4e0, 5, 1.1);
  K.box(cx0 - 1.2, TR + 0.95, cz0 - 0.2, 0.7, 0.04, 0.45, 0xc8ccc8, { seg: 0 }); K.cyl(cx0 - 1.2, TR + 0.47, cz0 - 0.2, 0.04, 0.04, 0.95, 0xa0a0a0, { n: 5 });
  // the surface, far overhead: light comes down through it
  var surf = K.picture(3, TR + 3.18, -21, 9, 7, tex(function (x, s) { return drawWater(x, s, P); }), { rx: Math.PI / 2, bright: 1.3, scroll: new THREE.Vector2(0.01, 0.02) });
  var rays = K.batch({ seg: 0, chunk: 0, lit: false, mat: vcMat({ transparent: true, opacity: 0.1, additive: true, side: THREE.DoubleSide }) });
  for (var ry = 0; ry < 7; ry++) rays.box(rr(0, 6), TR + 1.6, rr(-24, -18), rr(0.4, 0.9), 3.2, rr(0.4, 0.9), 0xbff0ff, { emit: 1, rx: rr(-0.25, 0.25), rz: rr(-0.25, 0.25) });
  K.light(4, TR + 3, -19, 0x8ad8e0, 8, 0.7);
  K.door(6.5, TR, -25.85, 0, K.onward(), { light: 0xe0fff8, sign: 0x40d0a0, col: 0xd8e0dc, open: 0.5 });
  K.door(4, 0, 6.85, Math.PI, K.onward(), { light: 0x9ad0e0, col: 0x8a9a9a, open: 0.2, glow: 1.1 });
  // ---- life: fish, kelp from the carpet, bubbles, caustics, two jellyfish lamps ----
  var fg = fishGeo(K, false), fgs = fishGeo(K, true), fmats = [vcMat({ color: 0xff9a50 }), vcMat({ color: 0xa8c8e0 }), vcMat({ color: 0xffd860 }), vcMat({ color: 0xe86a8a })], fish = [];
  for (var fi = 0; fi < 26; fi++) {
    var small = fi > 15, m = new THREE.Mesh(small ? fgs : fg, fmats[fi % 4]); buildGroup.add(m);
    var big = rng() < 0.5;
    fish.push({ m: m, cx: rr(-3, 3), cz: big ? rr(-2, 2) : rr(-5, 4), ax: rr(2, 6), az: rr(1.5, 4), y: rr(0.7, 2.6), w: rr(0.15, 0.4) * (rng() < 0.5 ? -1 : 1), ph: rng() * TAU, bob: rng() * TAU });
  }
  // a school that goes up the half-stair and around the chair
  for (var fj = 0; fj < 8; fj++) { var m2 = new THREE.Mesh(fgs, fmats[1]); buildGroup.add(m2); fish.push({ m: m2, cx: 3, cz: -21, ax: rr(2.5, 4), az: rr(2.5, 4), y: TR + rr(0.8, 2.6), w: 0.35, ph: fj * 0.5, bob: rng() * TAU }); }
  var kelp = [];
  var kspots = [[-7.3, -6.5], [-7.3, 6.3], [7.2, 6.4], [7.3, -8.4], [-1.2, 6.3], [1.6, 0.0], [-6.8, -8.4], [5.6, -7.6], [-2, -21], [8.4, -24]];
  for (var ki = 0; ki < kspots.length; ki++) { var kb2 = K.batch({ seg: 0, chunk: 0 }), kh2 = rr(1.6, 2.8); for (var s2 = 0; s2 < 7; s2++) { kb2.box(Math.sin(s2 * 1.1) * 0.08, s2 * kh2 / 7 + kh2 / 14, 0, 0.12, kh2 / 7 + 0.04, 0.03, mixC(0x3a7a4a, 0x8ab060, s2 / 7)); kb2.box(0.1, s2 * kh2 / 7 + 0.1, 0, 0.2, 0.05, 0.02, 0x5a9a5a, { rz: 0.6 }); } var kfy = kspots[ki][1] < -15 ? TR : 0; var kmm = kb2.mesh(kspots[ki][0], kfy, kspots[ki][1]); if (kmm) kelp.push([kmm, rng() * TAU]); }
  K.motes(90, -7.5, 7.5, 0.1, 2.9, -8.5, 6.5, 0xc8f8ff, 0.06, "rise", 0.5);
  K.motes(30, -2.5, 8.5, TR + 0.1, TR + 3.1, -25.5, -16.5, 0xc8f8ff, 0.05, "rise", 0.5);
  var caus = K.tex(function (x, W) { x.fillStyle = "#000"; x.fillRect(0, 0, W, W); x.strokeStyle = "rgba(190,250,255,0.9)"; x.lineWidth = 1; for (var i2 = 0; i2 < 10; i2++) { x.beginPath(); var px = Math.random() * W, py = Math.random() * W; x.moveTo(px, py); for (var k2 = 0; k2 < 5; k2++) { px += (Math.random() - 0.5) * 30; py += (Math.random() - 0.5) * 30; x.lineTo(px, py); } x.stroke(); } }, 64);
  caus.wrapS = caus.wrapT = THREE.RepeatWrapping;
  var cB = K.batch({ seg: 0, chunk: 0, lit: false, tile: 2.5, mat: vcMat({ map: caus, transparent: true, opacity: 0.13, additive: true, scroll: new THREE.Vector2(0.02, 0.012) }) });
  cB.quad(0, 0.02, -1, 16, 16, 0x6ac8d0, { rx: -Math.PI / 2, emit: 1, tile: 2.5 });
  var cB2 = K.batch({ seg: 0, chunk: 0, lit: false, tile: 3.1, mat: vcMat({ map: caus, transparent: true, opacity: 0.1, additive: true, scroll: new THREE.Vector2(-0.015, 0.02) }) });
  cB2.quad(0, 0.03, -1, 16, 16, 0x6ac8d0, { rx: -Math.PI / 2, emit: 1, tile: 3.1 });
  cB2.quad(3, TR + 0.02, -21, 12, 10, 0x6ac8d0, { rx: -Math.PI / 2, emit: 1, tile: 3.1 });
  var jelly = [];
  for (var jl = 0; jl < 2; jl++) { var jb = K.batch({ seg: 0, chunk: 0, lit: false }); jb.sph(0, 0, 0, 0.45, 0xd0f8ff, { ws: 8, hs: 4, sy: 0.6, emit: 1.3 }); for (var tt = 0; tt < 8; tt++) { var ta = tt / 8 * TAU; jb.box(Math.cos(ta) * 0.3, -0.5, Math.sin(ta) * 0.3, 0.02, 0.8, 0.02, 0xb0e8ff, { emit: 1.2 }); } var jm = jb.mesh(jl ? 3 : -3.5, 2.3, jl ? 2.5 : -3.2); if (jm) jelly.push([jm, jm.position.y, rng() * TAU]); K.light(jl ? 3 : -3.5, 2.0, jl ? 2.5 : -3.2, 0xb0f0ff, 4, 0.6); }
  K.anim(function (dt, t) {
    for (var k = 0; k < fish.length; k++) {
      var f = fish[k], a = f.ph + t * f.w, x = f.cx + Math.cos(a) * f.ax, z = f.cz + Math.sin(a) * f.az;
      f.m.position.set(x, f.y + Math.sin(t * 0.6 + f.bob) * 0.25, z);
      f.m.rotation.y = Math.atan2(-Math.sin(a) * f.ax * f.w, Math.cos(a) * f.az * f.w) + Math.sin(t * 7 + f.bob) * 0.12;
    }
    for (var k2 = 0; k2 < kelp.length; k2++) { kelp[k2][0].rotation.z = Math.sin(t * 0.7 + kelp[k2][1]) * 0.13; kelp[k2][0].rotation.x = Math.cos(t * 0.5 + kelp[k2][1]) * 0.08; }
    for (var k3 = 0; k3 < kelpFar.length; k3++) kelpFar[k3][0].rotation.z = Math.sin(t * 0.4 + kelpFar[k3][1]) * 0.08;
    for (var k4 = 0; k4 < jelly.length; k4++) { var j = jelly[k4]; j[0].position.y = j[1] + Math.sin(t * 0.8 + j[2]) * 0.15; j[0].scale.set(1 + Math.sin(t * 1.6 + j[2]) * 0.08, 1 - Math.sin(t * 1.6 + j[2]) * 0.06, 1 + Math.sin(t * 1.6 + j[2]) * 0.08); }
    if (whale) { var wz = ((t * 0.9) % 70) - 35; whale.position.set(-19 + Math.sin(t * 0.05) * 2, 4 + Math.sin(t * 0.2) * 0.6, wz); }
    if (officeChair) officeChair.rotation.y = Math.sin(t * 0.15) * 1.4;
  });
  // ---- interactables ----
  var bell = new THREE.Group(); var bb = K.batch({ seg: 0, chunk: 0, parent: bell }); bb.sph(0, 0.05, 0, 0.07, 0xd8c070, { ws: 8, hs: 4, sy: 0.6 }); bb.cyl(0, 0.01, 0, 0.08, 0.08, 0.02, 0x3a3a3a, { n: 8 }); bb.cyl(0, 0.1, 0, 0.01, 0.01, 0.04, 0x8a8a8a, { n: 4 });
  bell.position.set(-2.2, 1.17, -6.2); buildGroup.add(bell); bb.mesh(0, 0, 0, bell);
  K.ix(bell, -2.2, -5.7, 2.0, [
    "ding. far above you, someone says your name, kindly, and doesn't call it again.",
    "the sound goes up and up through the water. you watch it go.",
    "a bubble comes back down with a word in it. the word is soon."
  ], { y: 1.1, on: function () { if (audio.ctx) { audio.creature("bell", 0, 2.2); } } });
  var tick = new THREE.Group(); var tb = K.batch({ seg: 0, chunk: 0, parent: tick }); tb.cyl(0, 0.55, 0, 0.04, 0.04, 1.1, 0x8a8a8a, { n: 5 }); tb.box(0, 1.2, 0, 0.3, 0.36, 0.22, 0xc83a3a); tb.box(0, 1.15, 0.12, 0.12, 0.03, 0.02, 0xf2ecd8, { emit: 1.2 });
  tick.position.set(0.6, 0, -6.2); buildGroup.add(tick); tb.mesh(0, 0, 0, tick);
  K.ix(tick, 0.6, -5.8, 2.0, [
    "your number is 0. they have been calling it, softly, for years.",
    "another ticket. it is also 0. so is the next one.",
    "it's alright. there is no one ahead of you."
  ], { on: function () { if (audio.ctx) audio.creature("tick", 0, 1.2); } });
  var tankHot = new THREE.Object3D(); tankHot.position.set(7.6, 1.4, 0);
  K.ix(tankHot, 7.0, 0, 2.4, [
    "inside the glass, a dry little room. someone tiny is waiting there too. they wave.",
    "their lamp is warm. it is the only dry light in the building.",
    "they mouth something slowly: it's your turn soon."
  ], { glow: false, on: function () { if (audio.ctx) audio.creature("squeak", 0.4, 0.8); } });
  return K.finish({
    spawn: { x: -2, y: 0, z: 5.2, yaw: -0.5 }, fog: [0x0c2a30, 2, 26], sky: 0x041418, bounds: 0, killY: -8, sound: "water", desat: 0.05
  });
});

/* =========================================================================
   4. GRANDMOTHER'S HOUSE, TOO LARGE — her kitchen at seven times its size, in
   the late afternoon. You climb a book, a sewing box, a footstool, a chair, a
   ruler, to reach the table where the tea is still warm. The cat sleeps on.
   ========================================================================= */
defineWorld("grandmother_house_vast", { title: "grandmother's house, too large", tags: ["interior", "home", "scale"], valence: 1, interior: true }, function (P, mood) {
  var eve = rng() < 0.4;
  var V = eve ? { key: 0xff9a60, sky: 0x6a5060, gnd: 0x3a2a24, fog: 0x3a2a26, lamp: 0xffc080, out: ["#ffd8a0", "#e08a70", "#6a4a6a"] }
              : { key: 0xffe8b0, sky: 0x8a8a78, gnd: 0x4a3a2a, fog: 0x4a4232, lamp: 0xffe0a8, out: ["#fff4d8", "#c8e0d8", "#8ab0a0"] };
  var K = new World(P, mood, { sky: mixC(V.sky, 0x000000, 0.35), gnd: mixC(V.gnd, 0x000000, 0.4), dir: [0.15, 0.45, -1], dirCol: mixC(V.key, 0x000000, 0.45) });
  var W = 15.5, D = 14, HH = 17.5;
  // linoleum + wallpaper
  var lino = K.tex(function (x, Wd) { var s = Wd / 2; x.fillStyle = "#d8d0b0"; x.fillRect(0, 0, Wd, Wd); x.fillStyle = "#6a8a6a"; x.fillRect(0, 0, s, s); x.fillRect(s, s, s, s); x.fillStyle = "rgba(0,0,0,0.08)"; x.fillRect(0, s - 1, Wd, 1); x.fillRect(s - 1, 0, 1, Wd); for (var i = 0; i < 40; i++) { x.fillStyle = "rgba(255,255,255,0.06)"; x.fillRect(Math.random() * Wd, Math.random() * Wd, 3, 1); } }, 32);
  K.slab(-W, -D, W, D, 0, 0xffffff, { batch: K.batch({ mat: vcMat({ map: lino }), tile: 4.2, seg: 3 }), tile: 4.2, seg: 3 });
  var paper = K.tex(function (x, Wd, Hh) { x.fillStyle = "#e8dcc0"; x.fillRect(0, 0, Wd, Hh); for (var i = 0; i < 4; i++) { x.fillStyle = "rgba(170,120,110,0.25)"; x.fillRect(i * Wd / 4 + 6, 0, 4, Hh); } for (var j = 0; j < 10; j++) { var px = (j % 4) * Wd / 4 + Wd / 8, py = (j * 37) % Hh; x.fillStyle = "rgba(190,110,110,0.35)"; x.beginPath(); x.arc(px, py, 4, 0, 7); x.fill(); x.fillStyle = "rgba(110,150,110,0.35)"; x.fillRect(px - 1, py + 4, 2, 7); } }, 64, 64);
  var WP = K.batch({ mat: vcMat({ map: paper }), tile: 5, seg: 4 });
  K.wallZ(-D, -W, W, 0, HH, 0xffffff, { batch: WP, t: 0.5, gaps: [{ a: -6, b: 1, lo: 7.7, hi: 14 }] });
  K.wallZ(D, -W, W, 0, HH, 0xffffff, { batch: WP, t: 0.5 });
  K.wallX(W, -D, D, 0, HH, 0xffffff, { batch: WP, t: 0.5 });
  K.wallX(-W, -D, D, 0, HH, 0xffffff, { batch: WP, t: 0.5, gaps: [{ a: 2, b: 8, hi: 14 }] });
  K.box(0, HH + 0.2, 0, 2 * W + 1, 0.4, 2 * D + 1, 0xe8e0d0, { skip: "py", seg: 5 });
  for (var sk = -1; sk <= 1; sk += 2) { K.box(sk * (W - 0.3), 0.5, 0, 0.12, 1.0, 2 * D, 0x8a6a4a, { seg: 0 }); K.box(0, 0.5, sk * (D - 0.3), 2 * W, 1.0, 0.12, 0x8a6a4a, { seg: 0 }); }
  // ---- the table, the chair, the climb ----
  var wood = 0x8a5a38, wood2 = 0x6a4428;
  K.box(0, 5.07, -2, 8.4, 0.36, 5.6, wood, { seg: 2 }); K.walk(-4.2, -4.8, 4.2, 0.8, 5.25);
  var cloth = K.tex(function (x, Wd) { x.fillStyle = "#f2ead8"; x.fillRect(0, 0, Wd, Wd); x.fillStyle = "rgba(190,70,70,0.45)"; for (var i = 0; i < Wd; i += 8) { x.fillRect(i, 0, 4, Wd); x.fillRect(0, i, Wd, 4); } }, 32);
  var CB = K.batch({ mat: vcMat({ map: cloth }), tile: 1.6, seg: 2 });
  CB.box(0, 5.27, -2, 6.4, 0.02, 4.2, 0xffffff, { skip: "ny" });
  for (var lg = 0; lg < 4; lg++) { var lx = lg % 2 ? 3.7 : -3.7, lz = lg < 2 ? -4.3 : 0.3; K.cyl(lx, 2.45, lz, 0.32, 0.26, 4.9, wood2, { n: 8, solid: true }); }
  K.box(0, 4.6, -4.6, 7.6, 0.5, 0.2, wood2, { seg: 0 }); K.box(0, 4.6, 0.6, 7.6, 0.5, 0.2, wood2, { seg: 0 });
  // the chair, pulled out a little
  var seatY = 3.15;
  K.box(-2.5, seatY - 0.15, 4.0, 3.2, 0.3, 3.2, wood, { seg: 0 }); K.walk(-4.1, 2.4, -0.9, 5.6, seatY);
  for (var cl = 0; cl < 4; cl++) K.cyl(cl % 2 ? -1.1 : -3.9, seatY / 2 - 0.1, cl < 2 ? 2.6 : 5.4, 0.18, 0.16, seatY - 0.2, wood2, { n: 6, solid: true });
  K.box(-2.5, seatY + 1.8, 5.45, 3.2, 3.4, 0.25, wood, { seg: 0 }); K.solid(-2.5, seatY, 5.45, 3.2, 3.5, 0.3);
  for (var sl = 0; sl < 3; sl++) K.box(-3.5 + sl, seatY + 1.5, 5.45, 0.3, 2.6, 0.27, wood2, { seg: 0 });
  K.box(-2.5, seatY + 0.05, 4.0, 2.6, 0.12, 2.6, 0xa84a4a, { seg: 0 });
  // books, a sewing box, the footstool, a tin: each a step
  K.block(6, 4.5, 9, 7.5, 0.55, 0x3a5a8a); K.box(7.5, 0.3, 4.48, 2.9, 0.4, 0.04, 0xe8e0c8, { seg: 0 });
  K.block(4, 5.0, 7, 7.2, 1.1, 0x8a3a3a); K.box(5.5, 0.85, 4.98, 2.9, 0.42, 0.04, 0xe8e0c8, { seg: 0 });
  K.block(2, 4.6, 4.6, 7.4, 1.65, 0xc89a6a); K.box(3.3, 1.66, 6.0, 2.4, 0.04, 2.6, 0xb88a5a, { seg: 0 });
  for (var sp = 0; sp < 5; sp++) K.cyl(2.6 + sp * 0.45, 1.85, 5.2 + (sp % 2) * 0.6, 0.18, 0.18, 0.4, hsl(sp * 0.18, 0.5, 0.55), { n: 8 });
  K.block(0.0, 3.4, 2.6, 6.2, 2.2, 0x6a4a6a, { base: 1.6 }); for (var fl = 0; fl < 4; fl++) K.cyl(fl % 2 ? 0.25 : 2.35, 0.8, fl < 2 ? 3.65 : 5.95, 0.12, 0.12, 1.6, wood2, { n: 5, solid: true });
  K.block(-1.0, 3.0, 1.2, 5.0, 2.75, 0xb8c0c8, { base: 2.2 }); K.box(0.1, 2.76, 4.0, 1.8, 0.04, 1.6, 0xd85a4a, { seg: 0 });
  // the ruler, laid from the seat up to the table edge
  var rl = Math.hypot(2.6, 2.1);
  K.box(-2.6, (seatY + 5.25) / 2 - 0.05, 1.7, 1.2, 0.1, rl + 0.2, 0xd8c890, { seg: 0, rx: Math.atan2(2.1, 2.6) });
  for (var tk = 0; tk < 10; tk++) K.box(-3.1, seatY + 0.06 + tk * 0.21, 3.0 - tk * 0.26, 0.2, 0.02, 0.02, 0x2a2a2a, { seg: 0 });
  K.ramp(-3.2, 0.4, -2.0, 3.0, "z", 3.0, 0.4, seatY, 5.25);
  // ---- on the table ----
  var cupX = 1.6, cupZ = -1.6, TY = 5.28;
  K.cyl(cupX, TY + 0.03, cupZ, 1.0, 0.9, 0.06, 0xf2f0ea, { n: 16 });
  K.cyl(cupX, TY + 0.42, cupZ, 0.62, 0.42, 0.75, 0xf2f0ea, { n: 14 }); K.disc(cupX, TY + 0.72, cupZ, 0.56, 0x8a4a28, { rx: -Math.PI / 2, n: 14 });
  K.torus(cupX + 0.66, TY + 0.45, cupZ, 0.2, 0.05, 0xf2f0ea, { ts: 8 }); K.torus(cupX, TY + 0.76, cupZ, 0.6, 0.03, 0x4a7ac0, { rx: Math.PI / 2, ts: 14 });
  pushSolidCyl(cupX, cupZ, 0.62, TY, TY + 0.75);
  portalObj(cupX, cupZ, 0.42, TY + 0.6, TY + 2, K.onward(), { b: 0.6, e: -0.2 }, "portal");
  K.motes(30, cupX - 0.3, cupX + 0.3, TY + 0.8, TY + 2.6, cupZ - 0.3, cupZ + 0.3, 0xf8f0e8, 0.07, "rise", 0.35);
  K.sph(-1.8, TY + 0.9, -3.3, 1.1, 0xe8e2d8, { ws: 10, hs: 8, sy: 0.82 }); K.cone(-0.6, TY + 1.0, -3.3, 0.22, 1.0, 0xe8e2d8, { rz: -1.0, n: 6 }); K.sph(-1.8, TY + 1.85, -3.3, 0.3, 0xe8e2d8, { ws: 6, hs: 4, sy: 0.6 }); K.torus(-2.95, TY + 1.0, -3.3, 0.42, 0.07, 0xe8e2d8, { ts: 10 });
  K.torus(-1.8, TY + 1.0, -3.3, 1.08, 0.05, 0x4a7ac0, { rx: Math.PI / 2, ts: 16 });
  pushSolidCyl(-1.8, -3.3, 1.15, TY, TY + 1.9);
  K.cyl(2.6, TY + 0.05, -3.6, 1.0, 1.0, 0.08, 0xe8e8e8, { n: 14 }); K.cyl(2.6, TY + 0.4, -3.6, 0.75, 0.75, 0.6, 0xe8b8c8, { n: 12 }); K.cyl(2.6, TY + 0.72, -3.6, 0.76, 0.76, 0.06, 0xfff2f0, { n: 12 });
  var gB = K.batch({ seg: 0, chunk: 0, lit: false, mat: vcMat({ transparent: true, opacity: 0.14 }) }); gB.sph(2.6, TY + 0.1, -3.6, 0.95, 0xe0f0ff, { ws: 12, hs: 6, emit: 1.2 });
  pushSolidCyl(2.6, -3.6, 1.0, TY, TY + 1.2);
  // the letter and the sugar
  K.box(0.2, TY + 0.02, 0.0, 1.0, 0.02, 0.7, 0xf4ecd8, { seg: 0, ry: 0.3 }); K.box(0.15, TY + 0.04, 0.05, 0.9, 0.02, 0.6, 0xe8dcc0, { seg: 0, ry: 0.42 });
  for (var sc = 0; sc < 4; sc++) K.box(-0.8 + rr(-0.3, 0.3), TY + 0.13, -0.8 + rr(-0.3, 0.3), 0.26, 0.26, 0.26, 0xffffff, { seg: 0, ry: rng() });
  // the radio at the back of the table
  K.box(-3.2, TY + 0.6, -4.3, 1.6, 1.2, 0.8, 0x6a4a30, { seg: 0, solid: true }); K.disc(-3.2, TY + 0.65, -3.89, 0.35, 0xe8c890, { emit: 1.3 }); K.box(-3.2, TY + 1.0, -3.89, 1.3, 0.12, 0.02, 0x2a2a2a, { seg: 0 });
  // ---- the kitchen around you ----
  K.box(-4.75, 3.15, -11.9, 21.5, 6.3, 4.2, 0xc8d0b8, { solid: true, seg: 3, skip: "ny" });
  K.box(-4.75, 6.4, -11.8, 21.8, 0.25, 4.6, 0xb8b0a0, { seg: 3 });
  for (var dr = -14; dr < 6; dr += 3.6) { K.box(dr + 1.7, 3.0, -9.78, 3.3, 5.6, 0.06, 0xd8dcc8, { seg: 0 }); K.box(dr + 3.0, 3.6, -9.72, 0.12, 0.7, 0.12, 0xc8b070, { seg: 0 }); }
  K.box(-9, 12.6, -12.8, 12, 4.4, 2.4, 0xc8d0b8, { seg: 3 }); K.box(4.5, 12.6, -12.8, 6, 4.4, 2.4, 0xc8d0b8, { seg: 3 });
  K.box(-2.5, 6.45, -11.4, 4.5, 0.1, 3, 0x9aa0a8, { seg: 0 });
  K.cyl(-2.5, 8.2, -13.2, 0.18, 0.18, 3.4, 0xb0b4b8, { n: 6 }); K.box(-2.5, 9.8, -12.4, 0.3, 0.3, 1.8, 0xb0b4b8, { seg: 0 });
  // the window over the sink, and the garden beyond, also too large
  var garden = K.tex(function (x, Wd, Hh) { var g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, V.out[0]); g.addColorStop(0.6, V.out[1]); g.addColorStop(1, V.out[2]); x.fillStyle = g; x.fillRect(0, 0, Wd, Hh); for (var i = 0; i < 26; i++) { x.fillStyle = "rgba(60,90,60," + (0.4 + Math.random() * 0.4) + ")"; var gx = Math.random() * Wd; x.fillRect(gx, Hh * (0.4 + Math.random() * 0.3), 2 + Math.random() * 3, Hh); } for (var f = 0; f < 5; f++) { x.fillStyle = "rgba(230,140,150,0.8)"; x.beginPath(); x.arc(Math.random() * Wd, Hh * (0.35 + Math.random() * 0.2), 5 + Math.random() * 6, 0, 7); x.fill(); } }, 128, 128, true);
  K.picture(-2.5, 11, -16, 16, 12, garden, { bright: 1.25 });
  K.box(-2.5, 10.85, -14, 7.2, 0.25, 0.7, 0xf0ece0, { seg: 0 }); K.box(-2.5, 7.75, -13.7, 7.4, 0.25, 1.0, 0xf0ece0, { seg: 0 });
  var curtains = [];
  for (var cu = -1; cu <= 1; cu += 2) { var cbt = K.batch({ seg: 0, chunk: 0 }); for (var fo = 0; fo < 5; fo++) cbt.box(fo * 0.36 * -cu, -2.7, 0, 0.34, 5.6, 0.08, fo % 2 ? 0xd8a8a8 : 0xc89898, { ry: fo % 2 ? 0.3 : -0.3 }); var cm = cbt.mesh(-2.5 + cu * 3.7, 14.2, -13.55); if (cm) curtains.push([cm, cu]); }
  K.light(-2.5, 10, -12, V.key, 14, 1.1);
  // the fridge, humming in the corner
  K.box(12, 6.3, -12, 5, 12.6, 4, 0xe8e8e0, { solid: true, seg: 3, skip: "ny" }); K.box(9.48, 7.5, -10.6, 0.25, 3, 0.4, 0xb8b8b0, { seg: 0 }); K.box(12, 8.6, -9.98, 4.9, 0.06, 0.04, 0xb8b8b0, { seg: 0 });
  for (var mn = 0; mn < 5; mn++) K.box(10.5 + rr(0, 3), rr(9.5, 11.5), -9.97, rr(0.6, 1.0), rr(0.6, 1.0), 0.03, hsl(rng(), 0.3, 0.8), { seg: 0, ry: 0, rz: rr(-0.2, 0.2) });
  // the wall clock with its pendulum
  K.box(-15.1, 10, -3, 0.6, 7, 3, 0x6a4428, { seg: 0 }); K.disc(-14.78, 12, -3, 1.2, 0xf4ecd8, { ry: Math.PI / 2, n: 16 });
  var hands = new THREE.Group(); hands.position.set(-14.74, 12, -3); hands.rotation.y = Math.PI / 2; buildGroup.add(hands);
  var hb = K.batch({ seg: 0, chunk: 0, parent: hands }); hb.box(0, 0.4, 0, 0.08, 0.8, 0.02, 0x1a1a1a); hb.mesh(0, 0, 0, hands);
  var pend = new THREE.Group(); pend.position.set(-14.75, 10.6, -3); buildGroup.add(pend);
  var pb = K.batch({ seg: 0, chunk: 0, parent: pend }); pb.box(0, -1.5, 0, 0.04, 3, 0.08, 0xb89040); pb.cyl(0, -3.1, 0, 0.4, 0.4, 0.06, 0xd8b050, { rz: Math.PI / 2, n: 12, emit: 0.9 }); pb.mesh(0, 0, 0, pend);
  // photographs on the wall (faces turned away by the light)
  for (var ph = 0; ph < 4; ph++) { K.box(15.19, 9 + (ph % 2) * 2.6, -6 + ph * 2.8, 0.1, 2.0, 1.6, 0x4a3a2a, { seg: 0 }); K.box(15.13, 9 + (ph % 2) * 2.6, -6 + ph * 2.8, 0.04, 1.6, 1.2, mixC(0xc8a878, 0xffffff, rng() * 0.3), { seg: 0 }); }
  // the hanging lamp over the table
  K.cyl(0, 14.5, -2, 0.05, 0.05, 6, 0x2a2a2a, { n: 4 });
  K.geo(new THREE.CylinderGeometry(0.6, 2.4, 1.8, 12, 1, true), 0, 11, -2, 0xd8b070, { batch: K.batch({ seg: 0, chunk: 0, mat: vcMat({ side: THREE.DoubleSide }) }) });
  K.sph(0, 10.4, -2, 0.45, 0xfff0c0, { emit: 2 });
  K.light(0, 9.6, -2, V.lamp, 13, 1.3);
  K.glowAt(0, 10.2, -2, V.lamp, 4, 0.5);
  // the rug and the sleeping cat
  K.disc(-8, 0.03, 7.5, 4.2, 0x8a5a4a, { rx: -Math.PI / 2, n: 18, sx: 1.3 }); K.disc(-8, 0.05, 7.5, 3.4, 0xa87060, { rx: -Math.PI / 2, n: 18, sx: 1.3 });
  var catG = new THREE.Group(); catG.position.set(-8, 0, 7.5); catG.rotation.y = 0.6; buildGroup.add(catG);
  var cb2 = K.batch({ seg: 0, chunk: 0, parent: catG }), fur = eve ? 0x6a6a72 : 0xc8803a;
  cb2.sph(0, 1.0, 0, 1.8, fur, { ws: 10, hs: 7, sx: 1.25, sy: 0.6 }); cb2.sph(1.9, 0.85, 0.6, 0.85, fur, { ws: 8, hs: 6, sy: 0.85 });
  cb2.cone(2.2, 1.55, 0.25, 0.25, 0.55, fur, { n: 4, rz: -0.3 }); cb2.cone(2.2, 1.55, 0.95, 0.25, 0.55, fur, { n: 4, rz: -0.3 });
  cb2.torus(-0.4, 0.35, 1.2, 1.4, 0.22, fur, { rx: Math.PI / 2, arc: 3.2, ts: 10 });
  var catM = cb2.mesh(0, 0, 0, catG);
  pushSolidCyl(-8, 7.5, 2.3, 0, 2);
  // the door, left ajar onto a warm hall
  var aj = 0.22, hz = 8, latchX = -W + 6 * Math.sin(aj), latchZ = hz - 6 * Math.cos(aj);
  K.box((-W + latchX) / 2, 7, (hz + latchZ) / 2, 0.35, 14, 6, 0xd8ccb0, { ry: -aj, seg: 0 });
  K.box(latchX + 0.25 * Math.cos(aj), 6.5, latchZ + 0.3, 0.35, 0.35, 0.6, 0xc8b070, { seg: 0, ry: -aj });
  pushSolidBox((-W + latchX) / 2, (hz + latchZ) / 2, 0.18, 3, -aj, 0, 14);
  K.box(-W - 3, 7, 5, 0.3, 14, 8, 0xffe8c0, { seg: 0, emit: 1.3 }); K.box(-W - 1.5, -0.05, 5, 3, 0.1, 8, 0xc8a070, { seg: 0, emit: 0.9 });
  var spill = K.batch({ seg: 0, chunk: 0, lit: false, mat: vcMat({ transparent: true, opacity: 0.3, additive: true, side: THREE.DoubleSide }) });
  spill.quad(-W + 3.0, 0.04, 2.7, 1.4, 5.6, V.lamp, { rx: -Math.PI / 2, emit: 1, ry: Math.PI / 2 - 0.15 });
  K.light(-W + 0.5, 3, 2.6, V.lamp, 8, 1.0);
  K.glowAt(-W - 0.5, 4, 2.6, V.lamp, 6, 0.4);
  pushBoxLink(-W - 0.2, 2.7, 0.45, 0.6, 0, 0, 10, { b: 0.5, e: -0.2 }, "door"); linkables[linkables.length - 1].target = K.onward();
  // dust in the window light
  K.motes(110, -12, 8, 1, 15, -12, 6, mixC(V.key, 0xffffff, 0.4), 0.09, "drift", 0.35);
  // ---- motion ----
  var purr = 3;
  K.anim(function (dt, t) {
    if (catM) { var br = 1 + Math.sin(t * 1.1) * 0.035; catM.scale.set(1, br, 1 + (br - 1) * 0.5); }
    pend.rotation.x = Math.sin(t * 1.6) * 0.22;
    hands.rotation.x = -t * 0.02;
    for (var k = 0; k < curtains.length; k++) curtains[k][0].rotation.x = Math.sin(t * 0.5 + k) * 0.05 + 0.02;
    purr -= dt; if (purr <= 0) { purr = rr(2.5, 4.5); if (audio.ctx && Math.hypot(pos.x + 8, pos.z - 7.5) < 9) audio.creature("breath", clamp((-8 - pos.x) / 10, -1, 1), 0.6); }
  });
  // ---- interactables ----
  var cupHot = new THREE.Object3D(); cupHot.position.set(cupX, TY + 0.4, cupZ);
  K.ix(cupHot, cupX, cupZ + 1.1, 2.2, [
    "still warm. she always left one poured for you, in case.",
    "the tea is very deep. you could fall into it, if you wanted to.",
    "the steam smells of the cupboard where the good biscuits were."
  ], { glow: false, y: TY, on: function () { if (audio.ctx) audio.creature("chime", 0, 0.7); } });
  var gl = new THREE.Group(); var glb = K.batch({ seg: 0, chunk: 0, parent: gl });
  glb.torus(-0.4, 0.06, 0, 0.32, 0.04, 0x8a6a3a, { rx: -Math.PI / 2, ts: 12 }); glb.torus(0.4, 0.06, 0, 0.32, 0.04, 0x8a6a3a, { rx: -Math.PI / 2, ts: 12 }); glb.box(0, 0.06, 0, 0.2, 0.04, 0.04, 0x8a6a3a); glb.box(-0.72, 0.06, -0.5, 0.04, 0.04, 1.0, 0x8a6a3a, { ry: 0.1 }); glb.box(0.72, 0.06, -0.5, 0.04, 0.04, 1.0, 0x8a6a3a, { ry: -0.1 });
  gl.position.set(2.8, TY, -0.1); gl.rotation.y = 0.5; buildGroup.add(gl); glb.mesh(0, 0, 0, gl);
  K.ix(gl, 2.8, -0.1, 2.0, [
    "her reading glasses. through them, the room is the right size again, for a moment.",
    "through them you can almost see her, in the chair, doing the crossword.",
    "you put them back exactly where they were."
  ], { y: TY });
  K.ix(catG, -8, 7.5, 3.6, [
    "it purrs like a far-off engine. it remembers you small.",
    "one ear turns toward you, and then the rest of it stays asleep.",
    "it is warm all the way through, like an afternoon."
  ], { on: function () { if (audio.ctx) audio.creature("breath", 0, 0.5); } });
  return K.finish({
    spawn: { x: 11, y: 0, z: 10, yaw: 0.74 }, fog: [V.fog, 12, 80], sky: mixC(V.fog, 0x000000, 0.4), bounds: 0, killY: -8, sound: "hum", desat: 0
  });
});

/* =========================================================================
   5. THE MOTEL OF YOUR NAME — two storeys of doors under sodium light, and
   every nameplate is yours: you know the handwriting, you cannot read it.
   The ice machine hums. Upstairs, at the very end, one door is open and a
   television is talking quietly to an empty bed.
   ========================================================================= */
defineWorld("motel_of_your_name", { title: "the motel of your name", tags: ["exterior", "night", "uncanny"], valence: -1 }, function (P, mood) {
  var K = new World(P, mood, { sky: 0x2a3050, gnd: 0x141420, dir: [0.4, 0.8, 0.3], dirCol: 0x101830 });
  var FZ = -6, N = 12, UP = 3.6, wallC = 0xc8b8a0, trim = 0x8a3a3a;
  // ground: parking lot, curb, the walkway
  K.slab(-3, -46, 46, 46, 0, 0x2a2a30, { seg: 6 });
  K.slab(-6, -33, -3, 33, 0.3, 0x8a8478, { seg: 3 });
  for (var st = -30; st <= 30; st += 4.2) K.box(4, 0.01, st, 6, 0.02, 0.1, 0xb8b8a8, { seg: 0, emit: 0.55 });
  // the building
  K.box(-10, 3.8, 0, 8, 7.6, 66, wallC, { solid: true, seg: 3, skip: "ny" });
  K.box(-10, 7.9, 0, 8.6, 0.6, 66.6, trim, { seg: 3 });
  K.slab(-6, -33, -3.4, 33, UP, 0x7a7468, { t: 0.3, skip: "", seg: 3 });
  K.box(-4.6, 7.0, 0, 3.4, 0.25, 66.4, 0x6a5a4a, { seg: 3 });
  for (var pz = -32; pz <= 32; pz += 5) { K.box(-3.5, UP / 2, pz, 0.22, UP, 0.22, 0xd8d0c0, { seg: 0, solid: true }); K.box(-3.5, UP + 1.7, pz, 0.18, 3.4, 0.18, 0xd8d0c0, { seg: 0 }); }
  K.box(-3.45, UP + 1.0, 0, 0.06, 0.06, 66, 0xd8d0c0, { seg: 0 }); for (var rz = -32; rz < 32; rz += 0.5) K.box(-3.45, UP + 0.5, rz, 0.03, 1.0, 0.03, 0xd8d0c0, { seg: 0 });
  K.solid(-3.45, UP, 0, 0.2, 1.3, 66);
  // nameplates & numbers: one atlas for all the doors
  var atlas = K.tex(function (x, W, Hh) {
    x.fillStyle = "#e8e0c8"; x.fillRect(0, 0, W, Hh);
    for (var i = 0; i < 24; i++) {
      var cx = (i % 6) * W / 6, cy = Math.floor(i / 6) * Hh / 4, cw = W / 6, ch = Hh / 4;
      x.fillStyle = "#c8b890"; x.fillRect(cx + 2, cy + 2, cw - 4, ch - 4); x.fillStyle = "#e8e0c8"; x.fillRect(cx + 4, cy + 4, cw - 8, ch - 8);
      x.fillStyle = "#3a2a20"; x.font = "bold 16px monospace"; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(String(i < 12 ? 101 + i : 201 + i - 12), cx + cw / 2, cy + ch * 0.3);
      // the name: handwriting you know and cannot read
      x.strokeStyle = "#2a2a5a"; x.lineWidth = 1.4; x.beginPath(); var px = cx + 7, py = cy + ch * 0.68; x.moveTo(px, py);
      for (var k = 0; k < 9; k++) { px += 3; x.quadraticCurveTo(px - 1, py - 4 - (k % 3) * 2, px + 1.5, py + ((k * 7) % 3) - 1); }
      x.stroke();
    }
  }, 256, 256, true);
  var plates = K.batch({ seg: 0, chunk: 0, mat: vcMat({ map: atlas }) });
  var doorsLit = [], portalDoors = {}, pd = 0;
  while (pd < 7) { var cand = (rng() * 23) | 0; if (cand !== 12 && !portalDoors[cand]) { portalDoors[cand] = 1; pd++; } }
  var windows = [];
  for (var fl = 0; fl < 2; fl++) for (var i = 0; i < N; i++) {
    var dz = -27.5 + i * 5, dy = fl ? UP : 0.3, id = fl * N + i;
    var dcol = hsl(0.02 + (id % 3) * 0.04, 0.35, 0.36);
    if (fl === 1 && i === 0) continue;   // the open one, built below
    K.box(FZ + 0.03, dy + 1.1, dz, 0.08, 2.2, 1.05, dcol, { seg: 0 });
    K.box(FZ + 0.03, dy + 1.1, dz + 0.58, 0.1, 2.3, 0.1, 0xd8d0c0, { seg: 0 }); K.box(FZ + 0.03, dy + 1.1, dz - 0.58, 0.1, 2.3, 0.1, 0xd8d0c0, { seg: 0 }); K.box(FZ + 0.03, dy + 2.27, dz, 0.1, 0.1, 1.26, 0xd8d0c0, { seg: 0 });
    K.box(FZ + 0.09, dy + 1.05, dz - 0.36, 0.06, 0.08, 0.08, 0xd8b860, { seg: 0, emit: 0.9 });
    var cu = (id % 6) / 6, cv = 1 - Math.floor(id / 6) / 4;
    plates.quad(FZ + 0.08, dy + 1.6, dz, 0.36, 0.36, 0xffffff, { ry: Math.PI / 2, uv: [cu, cv - 0.25, cu + 1 / 6, cv], emit: 1.0 });
    if (portalDoors[id]) {
      K.box(FZ + 0.09, dy + 0.03, dz, 0.04, 0.04, 0.95, 0xffd8a0, { seg: 0, emit: 1.8 });
      pushBoxLink(FZ + 0.3, dz, 0.3, 0.5, 0, dy - 0.3, dy + 2.4, { b: rr(-0.3, 0.3), e: rr(-0.1, 0.3) }, "door"); linkables[linkables.length - 1].target = K.onward();
    }
    // the window beside it: curtains, some lit
    var lit = rng() < 0.4, wc = lit ? (rng() < 0.3 ? 0x7aa0ff : 0xffc888) : 0x1a1a24;
    var wm = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), objMat({ color: wc, bright: lit ? 1.3 : 0.6 })); wm.position.set(FZ + 0.04, dy + 1.45, dz + 2.0); wm.rotation.y = Math.PI / 2; buildGroup.add(wm);
    windows.push({ m: wm, lit: lit, z: dz + 2.0, y: dy, base: lit ? 1.3 : 0.6, glow: 0 });
    K.box(FZ + 0.06, dy + 1.45, dz + 2.0, 0.06, 1.2, 0.08, 0x3a3030, { seg: 0 }); K.box(FZ + 0.06, dy + 0.88, dz + 2.0, 0.1, 0.06, 1.55, 0xd8d0c0, { seg: 0 });
    K.box(FZ + 0.08, dy + 1.45, dz + 1.45, 0.04, 1.1, 0.35, 0x8a5a6a, { seg: 0 }); K.box(FZ + 0.08, dy + 1.45, dz + 2.55, 0.04, 1.1, 0.35, 0x8a5a6a, { seg: 0 });
    if (i % 2 === 0) { K.box(FZ + 0.25, dy + (fl ? 3.2 : 3.15), dz + 1, 0.3, 0.12, 0.3, 0xfff0d0, { seg: 0, emit: 1.6 }); K.light(FZ + 0.8, dy + 2.8, dz + 1, 0xffe0b0, 6.5, 0.85); }
  }
  // the open door at the end of the upper floor: a television talks to an empty bed
  var endZ = -27.5;
  K.door(FZ + 0.12, UP, endZ, Math.PI / 2, K.onward(), { light: 0x8ab0ff, col: hsl(0.02, 0.35, 0.36), open: 1.1, glow: 1.4, nudge: { b: -0.2, e: 0.1 } });
  var tvGlow = K.glowAt(FZ - 0.8, UP + 1.2, endZ, 0x8ab0ff, 3.5, 0.6);
  K.light(FZ + 0.6, UP + 1.3, endZ, 0x8ab0ff, 5, 1.0);
  // the stair up, at the north end
  K.stairs(6.5, 33.6, "-x", 9.9, 2.2, 0, UP, 0x8a8478, { floating: true, thick: 0.3 });
  K.slab(-6, 32.8, -3.4, 34.8, UP, 0x7a7468, { t: 0.3, skip: "" });
  K.box(-4.7, UP + 0.5, 34.8, 2.6, 1.0, 0.06, 0xd8d0c0, { seg: 0 }); K.solid(-4.7, UP, 34.8, 2.6, 1.3, 0.2);
  K.solid(-4.7, UP, -33, 2.6, 1.3, 0.2);
  K.cyl(-3.5, UP / 2, 34.6, 0.12, 0.12, UP, 0xd8d0c0, { n: 5, solid: true });
  // the office, at the south end
  K.slab(-12, -42, -2, -33, 0.3, 0x6a5a4a);
  K.wallX(-2, -42, -33, 0.3, 3.2, 0xb8a888, { gaps: [{ a: -40.5, b: -36.5, lo: 0.9, hi: 2.6 }, { a: -35.4, b: -34.2, hi: 2.3 }] });
  K.wallZ(-42, -12, -2, 0.3, 3.2, 0xb8a888); K.wallX(-12, -42, -33, 0.3, 3.2, 0xb8a888); K.wallZ(-33, -12, -6, 0.3, 3.2, 0xb8a888);
  K.box(-7, 3.6, -37.5, 10.4, 0.3, 9.4, 0x8a3a3a, { seg: 3 });
  K.box(-7, 0.85, -38, 1.0, 1.1, 5, 0x6a4a30, { seg: 0, solid: true }); K.box(-7, 1.42, -38, 1.2, 0.05, 5.2, 0xb89a70, { seg: 0 });
  for (var kh = 0; kh < 12; kh++) K.box(-11.85, 2.0 + (kh % 3) * 0.3, -40 + Math.floor(kh / 3) * 0.5, 0.04, 0.08, 0.04, 0xd8b860, { seg: 0, emit: 1.0 });
  K.box(-11.88, 2.3, -39.2, 0.04, 1.2, 2.2, 0x5a3a2a, { seg: 0 });
  K.light(-6, 3.0, -37.5, 0xffd8a0, 8, 1.0); K.box(-6, 3.4, -37.5, 0.5, 0.1, 0.5, 0xfff0d0, { seg: 0, emit: 1.6 });
  var offT = K.tex(function (x, W, Hh) { x.fillStyle = "#101010"; x.fillRect(0, 0, W, Hh); textLines(x, ["office"], W, Hh, { size: 18, color: "#ffd890" }); }, 128, 32, true);
  K.picture(-1.8, 3.0, -37.5, 2.2, 0.5, offT, { ry: Math.PI / 2, bright: 1.5 });
  // the sign: motel / vacancy, the "no" coming and going
  K.cyl(12, 4.5, -18, 0.18, 0.22, 9, 0x4a4a50, { n: 6, solid: true });
  var signT = K.tex(function (x, W, Hh) { x.fillStyle = "#1a1018"; x.fillRect(0, 0, W, Hh); x.strokeStyle = "#ff6aa8"; x.lineWidth = 3; x.strokeRect(5, 5, W - 10, Hh - 10); textLines(x, ["motel"], W, Hh, { size: 30, color: "#ff8ac0", font: "monospace", weight: "bold" }); }, 128, 64, true);
  var vacT = K.tex(function (x, W, Hh) { x.fillStyle = "#101418"; x.fillRect(0, 0, W, Hh); textLines(x, ["   vacancy"], W, Hh, { size: 16, color: "#60ff9a" }); }, 128, 32, true);
  var noT = K.tex(function (x, W, Hh) { x.clearRect(0, 0, W, Hh); textLines(x, ["no"], W, Hh, { size: 16, color: "#ff4a3a" }); }, 32, 32, true);
  var sgA = K.picture(12, 8.4, -18, 4, 2, signT, { ry: -Math.PI / 2, bright: 1.6, two: true });
  K.picture(12, 6.6, -18, 3.2, 0.8, vacT, { ry: -Math.PI / 2, bright: 1.5, two: true });
  var noM = K.picture(11.98, 6.6, -19.2, 0.8, 0.8, noT, { ry: -Math.PI / 2, bright: 1.6, transparent: true, two: true });
  K.light(10.5, 7.5, -18, 0xff7ab0, 9, 0.7);
  // two cars that have been parked a long time
  for (var cr = 0; cr < 2; cr++) { var czz = cr ? 7.5 : -11.5, ccol = cr ? 0x4a5a6a : 0x6a4a3a; K.box(4.3, 0.55, czz, 4.4, 0.8, 1.9, ccol, { seg: 0, solid: true }); K.box(4.1, 1.25, czz, 2.4, 0.65, 1.7, ccol, { seg: 0 }); K.box(4.1, 1.25, czz, 2.3, 0.5, 1.72, 0x1a2030, { seg: 0 }); for (var wh = 0; wh < 4; wh++) K.cyl(wh < 2 ? 2.8 : 5.8, 0.32, czz + (wh % 2 ? 0.9 : -0.9), 0.32, 0.32, 0.25, 0x101010, { rx: Math.PI / 2, n: 8 }); }
  // the ice machine and a vending machine on the ground walkway
  K.box(-5.45, 0.95, -0.55, 0.9, 1.3, 1.0, 0xd8dcd8, { seg: 0, solid: true }); K.box(-4.98, 1.25, -0.55, 0.04, 0.3, 0.7, 0x3a7ac0, { seg: 0, emit: 1.2 });
  var iceT = K.tex(function (x, W, Hh) { x.fillStyle = "#2a5a9a"; x.fillRect(0, 0, W, Hh); textLines(x, ["ice"], W, Hh, { size: 16, color: "#e8f4ff" }); }, 64, 32, true);
  K.picture(-4.96, 1.3, -0.55, 0.5, 0.25, iceT, { ry: Math.PI / 2, bright: 1.3 });
  K.box(-5.45, 1.25, 0.65, 0.9, 1.9, 0.95, 0xa83a3a, { seg: 0, solid: true }); K.box(-4.98, 1.4, 0.65, 0.04, 1.1, 0.65, 0xfff4e0, { seg: 0, emit: 1.3 });
  K.light(-4.6, 1.6, 0.6, 0xffe8d0, 4.5, 0.9);
  // parking-lot lamps and the far highway
  for (var lp = -1; lp <= 1; lp += 2) { var lpz = lp * 16; K.cyl(16, 4, lpz, 0.12, 0.15, 8, 0x3a3a40, { n: 5 }); K.box(15.2, 7.95, lpz, 1.8, 0.15, 0.35, 0x3a3a40, { seg: 0 }); K.box(14.6, 7.85, lpz, 0.6, 0.08, 0.3, 0xffb050, { seg: 0, emit: 2 }); K.light(14.6, 7, lpz, 0xffa040, 15, 1.0); K.glowAt(14.6, 7.7, lpz, 0xffa040, 4, 0.5); }
  var FAR = K.batch({ seg: 8 });
  FAR.box(62, 1.5, 0, 6, 3, 300, 0x1a1a24, { skip: "ny" });
  for (var hp = -140; hp < 140; hp += 18) { FAR.cyl(58, 5, hp, 0.15, 0.15, 7, 0x1a1a20, { n: 4 }); FAR.box(58, 8.4, hp, 0.1, 0.1, 2.4, 0x1a1a20, { seg: 0 }); }
  for (var hl = 0; hl < 14; hl++) FAR.sph(rr(70, 120), rr(-4, 8), rr(-140, 140), rr(8, 20), 0x10121c, { ws: 6, hs: 4, sy: 0.5 });
  var hwB = K.batch({ seg: 0, chunk: 0, lit: false }); for (var cc = 0; cc < 6; cc++) { hwB.box(61, 3.3, cc * 50 - 150, 0.3, 0.2, 0.6, cc % 2 ? 0xffe8c0 : 0xff4030, { emit: 2 }); }
  var hwM = hwB.mesh(0, 0, 0);
  var stars = K.motes(160, -100, 100, 30, 60, -100, 100, 0xe8ecff, 0.18, "drift", 0.02);
  // moths around the lamps
  var mothPts = []; for (var mo = 0; mo < 4; mo++) mothPts.push(K.motes(6, FZ + 0.4, FZ + 1.2, 2.6, 3.4, -25 + mo * 10, -24 + mo * 10, 0xfff4d0, 0.05, "drift", 1.4));
  // ---- interactables ----
  var plateHot = new THREE.Object3D(); plateHot.position.set(FZ + 0.1, UP + 1.6, 27.5);
  K.ix(plateHot, FZ + 1.2, 27.5, 2.2, [
    "it's your name. you'd know it anywhere. you can't read it.",
    "the next door has your name too. so does the one after that.",
    "someone has written it carefully, the way you write a name you are afraid to forget."
  ], { glow: false, y: UP, on: function () { if (audio.ctx) audio.creature("tick", 0, 0.8); } });
  var iceHot = new THREE.Object3D(); iceHot.position.set(-5.4, 1.0, -0.55);
  K.ix(iceHot, -4.6, -0.55, 2.2, [
    "it hums the same note as the fridge at home. you were never sure where home was.",
    "a scoop of ice, every cube perfectly clear. in one of them, a tiny lit window.",
    "the hum goes on. it will go on after you leave."
  ], { glow: false, y: 0.3, on: function () { if (audio.ctx) { audio.creature("hum", 0, 0.6); audio.creature("tick", 0, 1.8); } } });
  var book = new THREE.Group(); var gbk = K.batch({ seg: 0, chunk: 0, parent: book }); gbk.box(0, 0.02, 0, 0.5, 0.04, 0.7, 0x5a2a2a); gbk.box(0, 0.045, 0, 0.46, 0.01, 0.66, 0xf2ead8); gbk.box(0.18, 0.06, -0.15, 0.12, 0.01, 0.01, 0x2a2a6a);
  book.position.set(-7, 1.45, -37); buildGroup.add(book); gbk.mesh(0, 0, 0, book);
  K.ix(book, -6.2, -37, 2.4, [
    "the guestbook is full of your handwriting. every night, you checked in.",
    "beside each entry, in a different hand: welcome back.",
    "the last line is empty. the pen is warm."
  ], { y: 1.45, on: function () { if (audio.ctx) { audio.creature("bell", 0, 2.4); } } });
  // ---- motion: neon, the tv, windows that notice you, the highway ----
  var tvT = 0;
  K.anim(function (dt, t) {
    var nv = Math.sin(t * 0.7) > 0.1 ? (Math.sin(t * 29) > -0.6 ? 1.7 : 0.3) : 0.05;
    if (noM) noM.material.uniforms.uBright.value = nv;
    if (sgA) sgA.material.uniforms.uBright.value = 1.5 + (Math.sin(t * 17) > 0.97 ? -0.9 : 0);
    tvT -= dt; if (tvT <= 0) { tvT = rr(0.08, 0.35); if (tvGlow) tvGlow.material.opacity = rr(0.3, 0.8); }
    for (var k = 0; k < windows.length; k++) {
      var w = windows[k], near = Math.abs(pos.z - w.z) < 3 && Math.abs(pos.y - w.y) < 2 && pos.x < 0;
      w.glow += ((near ? 1 : 0) - w.glow) * Math.min(1, dt * 1.5);
      if (w.m.material.uniforms) w.m.material.uniforms.uBright.value = w.base + w.glow * (w.lit ? 0.4 : 0.9);
    }
    if (hwM) hwM.position.z = ((t * 9) % 50);
    if (stars) stars.rotation.y = t * 0.002;
  });
  return K.finish({
    spawn: { x: 5, y: 0, z: -29, yaw: 2.6 }, fog: [0x0e1224, 12, 90], sky: 0x060814, bounds: 0, killY: -10, sound: "night", desat: 0.05
  });
});

/* =========================================================================
   6. THE DRAINED POOL — a public pool at night with no water in it. The lane
   lines still float where the surface was, and they keep going: past the far
   wall, through another pool, and another, and out into the dark.
   ========================================================================= */
defineWorld("drained_night_pool", { title: "the drained pool", tags: ["exterior", "night", "water"], valence: 0 }, function (P, mood) {
  var K = new World(P, mood, { sky: 0x2a4a6a, gnd: 0x0a1420, dir: [-0.3, 0.8, 0.5], dirCol: 0x18283a });
  var tileT = K.tex(function (x, W) { x.fillStyle = "#9ac8d8"; x.fillRect(0, 0, W, W); x.fillStyle = "rgba(20,50,70,0.35)"; for (var i = 0; i < W; i += 8) { x.fillRect(i, 0, 1, W); x.fillRect(0, i, W, 1); } }, 32);
  var TB = K.batch({ mat: vcMat({ map: tileT }), tile: 1.6, seg: 3 });
  var deckT = K.tex(function (x, W) { noiseFill(x, W, W, "#a8a8a0", 0.16, 300, 2); }, 32);
  var DB = K.batch({ mat: vcMat({ map: deckT }), tile: 2, seg: 4 });
  var L = 24, HW = 8, NB = 4, zs = [];
  for (var b = 0; b < NB; b++) zs.push(-3 - b * (L + 3));
  var zLast = zs[NB - 1] - L;
  // deck: sides, front, between basins, back
  K.slab(-15, zLast - 6, -HW, 9, 0, 0xffffff, { batch: DB, tile: 2 }); K.slab(HW, zLast - 6, 15, 9, 0, 0xffffff, { batch: DB, tile: 2 });
  K.slab(-HW, -3, HW, 9, 0, 0xffffff, { batch: DB, tile: 2 });
  for (var bb = 0; bb < NB - 1; bb++) K.slab(-HW, zs[bb + 1], HW, zs[bb] - L, 0, 0xffffff, { batch: DB, tile: 2 });
  K.slab(-HW, zLast - 6, HW, zLast, 0, 0xffffff, { batch: DB, tile: 2 });
  var shade = [0xffffff, 0xd8e4ec, 0xb0c0d0, 0x8a98b0];
  for (var k = 0; k < NB; k++) {
    var z0 = zs[k], z1 = z0 - L, deepZ = z1 + 4, col = shade[k];
    // floor slopes from the shallow end (-1.2) to the deep end (-3.4)
    (function (z0, deepZ) {
      K.walk(-HW, z1, HW, z0, function (x, z) { var t = clamp((z0 - z) / (z0 - deepZ), 0, 1); return -1.2 - 2.2 * t; });
    })(z0, deepZ);
    var segs = 8;
    for (var s = 0; s < segs; s++) { var za = z0 - s * (L - 4) / segs, zb = z0 - (s + 1) * (L - 4) / segs, ya = -1.2 - 2.2 * s / segs, yb = -1.2 - 2.2 * (s + 1) / segs, len = Math.hypot(za - zb, ya - yb); TB.box(0, (ya + yb) / 2 - 0.1, (za + zb) / 2, 2 * HW, 0.2, len + 0.02, col, { rx: -Math.atan2(ya - yb, za - zb), tile: 1.6, skip: "ny" }); }
    TB.box(0, -3.5, z1 + 2, 2 * HW, 0.2, 4, col, { tile: 1.6, skip: "ny" });
    // walls (tiled) + colliders so the basin keeps you until the steps
    TB.box(-HW - 0.15, -1.75, (z0 + z1) / 2, 0.3, 3.5, L, col, { tile: 1.6 }); TB.box(HW + 0.15, -1.75, (z0 + z1) / 2, 0.3, 3.5, L, col, { tile: 1.6 });
    TB.box(0, -0.6, z0 + 0.15, 2 * HW, 1.2, 0.3, col, { tile: 1.6 }); TB.box(0, -1.75, z1 - 0.15, 2 * HW, 3.5, 0.3, col, { tile: 1.6 });
    pushSolidBox(-HW - 0.15, (z0 + z1) / 2, 0.15, L / 2, 0, -4, -0.56); pushSolidBox(HW + 0.15, (z0 + z1) / 2, 0.15, L / 2, 0, -4, -0.56);
    pushSolidBox(0, z0 + 0.15, HW, 0.15, 0, -4, -0.56); pushSolidBox(0, z1 - 0.15, HW, 0.15, 0, -4, -0.56);
    // coping and a dark band of lane markings on the floor
    K.box(-HW - 0.3, 0.04, (z0 + z1) / 2, 0.6, 0.1, L + 0.6, 0xe8e8e0, { seg: 0 }); K.box(HW + 0.3, 0.04, (z0 + z1) / 2, 0.6, 0.1, L + 0.6, 0xe8e8e0, { seg: 0 });
    for (var ln = -3; ln <= 3; ln++) { var lx = ln * 2; for (var s2 = 0; s2 < segs; s2++) { var za2 = z0 - 1 - s2 * (L - 6) / segs, zb2 = z0 - 1 - (s2 + 1) * (L - 6) / segs; var ya2 = -1.2 - 2.2 * clamp((z0 - za2) / (L - 4), 0, 1), yb2 = -1.2 - 2.2 * clamp((z0 - zb2) / (L - 4), 0, 1); K.box(lx, (ya2 + yb2) / 2 + 0.01, (za2 + zb2) / 2, 0.25, 0.02, Math.hypot(za2 - zb2, ya2 - yb2), 0x1a3a5a, { seg: 0, rx: -Math.atan2(ya2 - yb2, za2 - zb2) }); } }
    // steps: down at the near corner, up at the deep end (as no pool ever has)
    K.stairs(HW - 1.2, z0, "-z", 2.4, 2.0, 0, -1.2, mixC(col, 0x000000, 0.1));
    K.stairs(0, deepZ, "-z", 4, 4, -3.4, 0, mixC(col, 0x000000, 0.05));
    // the pool lights in the walls, one dead in every pool
    for (var pl = 0; pl < 3; pl++) { var plz = z0 - 4 - pl * 7, plx = (pl % 2 ? 1 : -1) * (HW - 0.01), live = pl !== k % 3; K.disc(plx, -1.2 - 1.6 * clamp((z0 - plz) / (L - 4), 0, 1) - 0.4, plz, 0.28, live ? 0x8af0ff : 0x2a3a3a, { ry: plx > 0 ? -Math.PI / 2 : Math.PI / 2, emit: live ? 1.8 : 0.6 }); if (live) K.light(plx * 0.92, -2, plz, 0x6ad8f0, 6, 0.9 - k * 0.15); }
  }
  // the last pool still has a little water in its deep end
  var lastW = K.picture(0, -2.65, zs[NB - 1] - L * 0.62, 2 * HW, L * 0.75, tex(function (x, s) { return drawWater(x, s, P); }), { rx: -Math.PI / 2, transparent: true, opacity: 0.55, bright: 1.1, scroll: new THREE.Vector2(0.004, 0.003) });
  // the lane lines: they float where the water was, and keep going
  var ropes = [], ropeEnd = zLast - 150;
  for (var r = -3; r <= 3; r++) {
    var rb = K.batch({ seg: 0, chunk: 0, lit: false }), x0 = r * 2, prevx = x0, prevz = 6;
    for (var zz = 6; zz > ropeEnd; zz -= (zz > zLast ? 2 : 4)) {
      var nz = zz - (zz > zLast ? 2 : 4), t = clamp((zLast - nz) / (zLast - ropeEnd), 0, 1), nx = x0 * (1 - t * 0.85), cx = (prevx + nx) / 2, cz = (prevz + nz) / 2;
      var seg = Math.floor((6 - zz) / 2), ccol = (seg % 5 === 0) ? 0xd83a3a : (seg % 2 ? 0xe8e8e8 : 0x3a6ad8);
      rb.box(cx, 0, cz, 0.16, 0.16, 1.9, ccol, { ry: Math.atan2(nx - prevx, nz - prevz), emit: 1.05, skip: "ny" });
      prevx = nx; prevz = nz;
    }
    var rm = rb.mesh(0, 0.06, 0); if (rm) ropes.push([rm, rng() * TAU]);
  }
  // starting blocks, flags, the lifeguard chair, the diving tower
  var numT = K.tex(function (x, W, Hh) { x.fillStyle = "#e8e8e0"; x.fillRect(0, 0, W, Hh); for (var i = 0; i < 8; i++) { x.fillStyle = "#1a2a4a"; x.font = "bold 22px monospace"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(i + 1), (i + 0.5) * W / 8, Hh / 2); } }, 256, 32, true);
  var NBt = K.batch({ seg: 0, chunk: 0, mat: vcMat({ map: numT }) });
  for (var sb = 0; sb < 8; sb++) { var sx = -7 + sb * 2; K.box(sx, 0.38, 1.2, 0.7, 0.75, 0.7, 0xd8d8d0, { seg: 0, solid: true }); K.box(sx, 0.78, 1.05, 0.75, 0.06, 0.85, 0xb8d0d8, { seg: 0, rx: 0.12 }); NBt.quad(sx, 0.45, 1.56, 0.5, 0.36, 0xffffff, { uv: [sb / 8, 0, (sb + 1) / 8, 1], emit: 1.0 }); }
  for (var fz = 0; fz < 2; fz++) { var flz = fz ? -22 : -8; K.cyl(-HW - 1.2, 1.3, flz, 0.05, 0.05, 2.6, 0xd8d8d0, { n: 4 }); K.cyl(HW + 1.2, 1.3, flz, 0.05, 0.05, 2.6, 0xd8d8d0, { n: 4 }); for (var fx = -HW - 1; fx < HW + 1; fx += 0.6) K.cone(fx, 2.35, flz, 0.18, 0.4, (Math.round(fx / 0.6) % 2) ? 0xd83a3a : 0xe8e8e8, { rx: Math.PI, n: 3, emit: 1.0 }); K.box(0, 2.55, flz, 2 * HW + 2.4, 0.02, 0.02, 0xd8d8d0, { seg: 0 }); }
  K.cyl(-11, 1.4, -15, 0.06, 0.06, 2.8, 0xe8e8e0, { n: 4 }); K.cyl(-12, 1.4, -15, 0.06, 0.06, 2.8, 0xe8e8e0, { n: 4 }); K.box(-11.5, 2.9, -15, 1.2, 0.12, 1.0, 0xd8d8d0, { seg: 0 }); K.box(-11.5, 3.4, -15.45, 1.2, 0.9, 0.08, 0xd8d8d0, { seg: 0 }); K.box(-11.5, 4.1, -15, 1.6, 0.06, 1.6, 0xd85a3a, { seg: 0 });
  K.solid(-11.5, 0, -15, 1.4, 3, 1.2);
  K.stairs(11, -1.5, "-z", 10, 2, 0, 5, 0xd8d8d0, { floating: true, thick: 0.25 });
  K.slab(9.6, -15.5, 12.4, -11.5, 5, 0xd8d8d0, { t: 0.3, skip: "" });
  for (var tl = 0; tl < 4; tl++) K.cyl(tl % 2 ? 9.8 : 12.2, 2.5, tl < 2 ? -11.7 : -15.3, 0.12, 0.12, 5, 0xd8d8d0, { n: 5, solid: true });
  K.slab(3.6, -14.0, 9.6, -13.0, 5, 0x4a8ab0, { t: 0.15, skip: "" });
  K.box(11, 5.5, -15.5, 2.8, 1.0, 0.05, 0xe8e8e0, { seg: 0 }); K.solid(11, 5, -15.55, 2.8, 1.3, 0.2); K.box(12.4, 5.5, -13.5, 0.05, 1.0, 4, 0xe8e8e0, { seg: 0 }); K.solid(12.45, 5, -13.5, 0.2, 1.3, 4);
  // fence, the changing rooms, trees, streetlights
  for (var fz2 = 8; fz2 > zLast - 6; fz2 -= 3) { K.cyl(-15, 1.2, fz2, 0.04, 0.04, 2.4, 0x6a7070, { n: 4 }); K.cyl(15, 1.2, fz2, 0.04, 0.04, 2.4, 0x6a7070, { n: 4 }); }
  var fenceT = K.tex(function (x, W) { x.clearRect(0, 0, W, W); x.strokeStyle = "rgba(160,170,170,0.8)"; x.lineWidth = 1; for (var i = -W; i < W * 2; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + W, W); x.stroke(); x.beginPath(); x.moveTo(i + W, 0); x.lineTo(i, W); x.stroke(); } }, 32);
  var FB = K.batch({ seg: 0, chunk: 0, lit: false, tile: 1, mat: vcMat({ map: fenceT, transparent: true, side: THREE.DoubleSide, opacity: 0.7 }) });
  FB.quad(-15, 1.2, (8 + zLast - 6) / 2, 14 - zLast, 2.4, 0x8a9a9a, { ry: Math.PI / 2, emit: 1, tile: 1 }); FB.quad(15, 1.2, (8 + zLast - 6) / 2, 14 - zLast, 2.4, 0x8a9a9a, { ry: Math.PI / 2, emit: 1, tile: 1 });
  K.solid(-15, 0, (8 + zLast - 6) / 2, 0.2, 2.6, 14 - zLast); K.solid(15, 0, (8 + zLast - 6) / 2, 0.2, 2.6, 14 - zLast);
  K.box(0, 1.6, 10.5, 30, 3.2, 3, 0xc8c0b0, { seg: 3, solid: true }); K.box(0, 3.3, 10.5, 30.4, 0.2, 3.4, 0x6a5a4a, { seg: 3 });
  K.box(6, 1.1, 8.98, 1.1, 2.2, 0.04, 0x2a3a3a, { seg: 0 });
  K.door(-6, 0, 8.95, Math.PI, K.onward(), { light: 0xc8e0e8, col: 0x5a7a8a, open: 0.4, glow: 1.2 });
  var chT = K.tex(function (x, W, Hh) { x.fillStyle = "#1a3a4a"; x.fillRect(0, 0, W, Hh); textLines(x, ["changing", "no running"], W, Hh, { size: 12, color: "#e8f0f0" }); }, 128, 48, true);
  K.picture(0, 2.5, 8.97, 2.4, 0.9, chT, { ry: Math.PI });
  for (var tr = 0; tr < 30; tr++) { var side = tr % 2 ? 1 : -1, tx = side * rr(19, 34), tz = rr(zLast - 20, 20), th = rr(5, 10); K.cyl(tx, th / 2, tz, 0.25, 0.35, th, 0x0e1218, { n: 5 }); K.sph(tx, th + 1, tz, rr(2.2, 3.4), 0x0c141a, { ws: 6, hs: 4, sy: 1.3 }); }
  var GB = K.batch({ seg: 10 });
  GB.box(-35, -0.25, (zLast - 6 + 9) / 2, 40, 0.3, 140, 0x0c1218, { skip: "ny" }); GB.box(35, -0.25, (zLast - 6 + 9) / 2, 40, 0.3, 140, 0x0c1218, { skip: "ny" });
  GB.box(0, -0.25, 16, 30, 0.3, 14, 0x0c1218, { skip: "ny" });
  for (var sl = 0; sl < 3; sl++) { var slz = 4 - sl * 45; K.cyl(-14, 3.5, slz, 0.1, 0.12, 7, 0x3a3a40, { n: 5 }); K.box(-13.3, 6.95, slz, 1.6, 0.12, 0.3, 0x3a3a40, { seg: 0 }); K.box(-12.8, 6.85, slz, 0.6, 0.08, 0.25, 0xd8f0ff, { seg: 0, emit: 2 }); K.light(-12.8, 6, slz, 0xb8d8ff, 16, 0.9); K.glowAt(-12.8, 6.7, slz, 0xb8d8ff, 3.5, 0.5); }
  // sky: stars and a low moon
  K.motes(200, -120, 120, 25, 70, zLast - 120, 60, 0xf0f4ff, 0.2, "drift", 0.01);
  var moon = N2.glowSprite(0xe8f0ff, 30); moon.position.set(-40, 26, zLast - 30); moon.material.opacity = 0.55; buildGroup.add(moon);
  var moonD = new THREE.Mesh(new THREE.CircleGeometry(4.5, 20), objMat({ color: 0xf2f4ea, bright: 1.3 })); moonD.position.set(-40, 26, zLast - 30); moonD.lookAt(0, 0, 0); buildGroup.add(moonD);
  // leaves skittering in the basins
  K.motes(60, -7, 7, -3.2, -0.8, zLast, -3, 0xc8a070, 0.07, "drift", 0.9);
  // the destination: a lit doorway at the end of the last deck, the ropes running through it
  K.door(0, 0, zLast - 4.5, 0, K.onward(), { light: 0x9af0ff, frame: 0xd8d8d0, col: 0xb8d8e0, open: 1.2, glow: 1.8, sign: 0x60d0ff });
  K.light(0, 2, zLast - 3, 0x9af0ff, 8, 1.1);
  // ---- interactables ----
  var whistle = new THREE.Group(); var wb = K.batch({ seg: 0, chunk: 0, parent: whistle }); wb.box(0, 0, 0, 0.12, 0.08, 0.06, 0xd8c040); wb.cyl(0, 0.1, 0, 0.005, 0.005, 0.2, 0xd83a3a, { n: 3 });
  whistle.position.set(-11.2, 3.0, -14.7); buildGroup.add(whistle); wb.mesh(0, 0, 0, whistle);
  K.ix(whistle, -10.2, -14.7, 2.4, [
    "you blow the whistle. somewhere very far away, a child comes up for air.",
    "nobody is in the pool. the whistle is for the dark, maybe.",
    "the sound goes down all the lanes at once, and none of it comes back."
  ], { y: 0, on: function () { if (audio.ctx) { audio.tone(2200, "square", 0.05, 0.01, 0.5, 0); audio.tone(2260, "square", 0.04, 0.01, 0.5, 0); } } });
  var towel = new THREE.Group(); var twb = K.batch({ seg: 0, chunk: 0, parent: towel }); twb.box(0, 0.03, 0, 1.0, 0.05, 1.7, 0xd86a8a); for (var st2 = 0; st2 < 4; st2++) twb.box(0, 0.06, -0.6 + st2 * 0.4, 1.0, 0.01, 0.12, 0xf2e8d8);
  towel.position.set(-11, 0, -42); towel.rotation.y = 0.3; buildGroup.add(towel); twb.mesh(0, 0, 0, towel);
  K.ix(towel, -11, -42, 2.0, [
    "a towel, still damp. the shape of someone who was sitting here a moment ago.",
    "it smells of chlorine and of being eight years old.",
    "you fold it, and leave it for them."
  ]);
  var lightHot = new THREE.Object3D(); lightHot.position.set(-HW + 0.2, -2.4, zs[NB - 1] - 11);
  K.ix(lightHot, -HW + 1.2, zs[NB - 1] - 11, 2.4, [
    "the last pool light hums like a held breath.",
    "you put your hand on the glass. it is warm, like something is on the other side.",
    "on the other side, very faintly, someone is swimming toward you."
  ], { glow: false, on: function () { if (audio.ctx) audio.creature("hum", -0.4, 0.5); } });
  K.anim(function (dt, t) {
    for (var q = 0; q < ropes.length; q++) { ropes[q][0].position.y = 0.06 + Math.sin(t * 0.6 + ropes[q][1]) * 0.05; ropes[q][0].rotation.z = Math.sin(t * 0.4 + ropes[q][1]) * 0.004; }
    if (lastW && lastW.material.uniforms) lastW.material.uniforms.uOpacity.value = 0.5 + Math.sin(t * 0.3) * 0.08;
  });
  return K.finish({
    spawn: { x: 0, y: 0, z: 6, yaw: 0 }, fog: [0x0a1626, 14, 95], sky: 0x050a16, bounds: 0, killY: -14, sound: "water", desat: 0.05
  });
});

/* =========================================================================
   7. THE KARAOKE ROOM OF EMPTY CHAIRS — a corridor of humming booths opens
   onto the party room. No one is here. The chairs are singing anyway, all
   together, softly, and the words scroll by for you on the screen.
   ========================================================================= */
var LYRICS = ["we were awake", "in somebody's dream", "the chairs remember", "everyone who sat", "sing it softly", "the room is listening", "nobody is late here", "the song goes on", "without us", "and that's alright", "la la la", "la la la", "hold the last note", "for the one who left", "they kept your seat", "they kept your seat", ""];
defineWorld("karaoke_empty_chairs", { title: "the karaoke room of empty chairs", tags: ["interior", "music", "uncanny"], valence: 1, interior: true }, function (P, mood) {
  var K = new World(P, mood, { sky: 0x3a2a4a, gnd: 0x140a1a });
  var HC = 2.8, HR = 6.0, wall = 0x3a2a48;
  var carpT = K.tex(function (x, W) { x.fillStyle = "#1a1030"; x.fillRect(0, 0, W, W); for (var i = 0; i < 30; i++) { x.fillStyle = ["#ff4ab0", "#40e0ff", "#ffd040", "#8a5aff"][i % 4]; x.globalAlpha = 0.5; var cx = Math.random() * W, cy = Math.random() * W; x.fillRect(cx, cy, 3, 1); x.fillRect(cx + 1, cy - 1, 1, 3); } x.globalAlpha = 1; }, 64);
  var CP = K.batch({ mat: vcMat({ map: carpT }), tile: 2, seg: 3 });
  // ---- the corridor of booths ----
  K.slab(-1.6, 0, 1.6, 22.2, 0, 0xffffff, { batch: CP, tile: 2 });
  K.wallX(-1.75, 0, 22.2, 0, HC, wall); K.wallX(1.75, 0, 22.2, 0, HC, wall); K.wallZ(22.2, -1.75, 1.75, 0, HC, wall, { gaps: [{ a: -0.6, b: 0.6, hi: 2.3 }] });
  K.box(0, HC + 0.15, 11.1, 3.8, 0.3, 22.4, 0x241830, { seg: 3 });
  var booths = [], boothCols = [0xff5ab0, 0x40d8ff, 0xffc040, 0x9a6aff, 0x60ff9a];
  for (var bz = 2.5; bz < 21; bz += 3) for (var sd = -1; sd <= 1; sd += 2) {
    var bx = sd * 1.6, ry = sd < 0 ? Math.PI / 2 : -Math.PI / 2;
    K.box(bx, 1.1, bz, 0.08, 2.2, 1.0, 0x2a1a24, { seg: 0 });
    K.box(bx, 1.1, bz + 0.55, 0.12, 2.3, 0.1, 0x8a6a9a, { seg: 0 }); K.box(bx, 1.1, bz - 0.55, 0.12, 2.3, 0.1, 0x8a6a9a, { seg: 0 }); K.box(bx, 2.27, bz, 0.12, 0.1, 1.2, 0x8a6a9a, { seg: 0 });
    var c = pick(boothCols), wm = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.6), objMat({ color: c, bright: 1.4 })); wm.position.set(bx - sd * 0.05, 1.5, bz); wm.rotation.y = ry; buildGroup.add(wm);
    booths.push({ m: wm, z: bz, ph: rng() * TAU, f: rr(1.5, 3.5), side: sd });
    K.box(bx - sd * 0.06, 0.03, bz, 0.04, 0.03, 0.9, c, { seg: 0, emit: 1.4 });
  }
  for (var lz = 2; lz < 22; lz += 4) { K.box(0, HC - 0.03, lz, 0.5, 0.05, 0.5, 0xffe0f0, { seg: 0, emit: 1.2 }); K.light(0, HC - 0.5, lz, 0xff9ad8, 5, 0.5); }
  K.door(0, 0, 22.05, Math.PI, K.onward(), { light: 0xffd8f0, col: 0x4a3a5a, open: 0.25, glow: 1.1 });
  // ---- the party room ----
  K.slab(-9, -18, 9, 0, 0, 0xffffff, { batch: CP, tile: 2 });
  K.wallZ(0, -9, 9, 0, HR, wall, { gaps: [{ a: -1.6, b: 1.6, hi: HC }] });
  K.wallZ(-18, -9, 9, 0, HR, wall); K.wallX(-9, -18, 0, 0, HR, wall); K.wallX(9, -18, 0, 0, HR, wall);
  K.box(0, HR + 0.15, -9, 18.4, 0.3, 18.4, 0x1a1024, { skip: "py" });
  // acoustic panels
  for (var ap = -15; ap < -1; ap += 2.2) for (var s2 = -1; s2 <= 1; s2 += 2) K.box(s2 * 8.82, 2.6, ap, 0.06, 2.4, 1.8, (Math.round(ap) % 2) ? 0x4a2a5a : 0x2a3a5a, { seg: 0 });
  // stage + screen
  K.block(-9, -18, 9, -12.5, 0.55, 0x2a1a2a, { seg: 3 });
  K.box(0, 0.3, -12.48, 18, 0.5, 0.06, 0x5a2a6a, { seg: 0, emit: 0.4 });
  for (var fl = -8.5; fl <= 8.5; fl += 1.0) K.box(fl, 0.6, -12.6, 0.3, 0.1, 0.12, pick(boothCols), { seg: 0, emit: 1.6 });
  K.box(0, 0.27, -12.0, 3, 0.27, 1.0, 0x3a2a3a, { seg: 0 }); K.walk(-1.5, -12.5, 1.5, -11.5, 0.27);
  var lyr = K.tex(function (x, W, Hh) {
    x.fillStyle = "#0a0614"; x.fillRect(0, 0, W, Hh);
    var g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, "rgba(90,40,140,0.5)"); g.addColorStop(1, "rgba(20,60,120,0.5)"); x.fillStyle = g; x.fillRect(0, 0, W, Hh);
    x.textAlign = "center"; x.textBaseline = "middle"; x.font = "20px monospace";
    for (var i = 0; i < LYRICS.length; i++) { x.fillStyle = i % 2 ? "#ffe8ff" : "#a8f0ff"; x.fillText(LYRICS[i], W / 2, (i + 0.5) * Hh / LYRICS.length); }
  }, 256, 512, true);
  lyr.wrapT = THREE.RepeatWrapping;
  var screenM = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.2), objMat({ map: lyr, bright: 1.25, scroll: new THREE.Vector2(0, 0.022) }));
  screenM.position.set(0, 3.4, -17.82); buildGroup.add(screenM);
  setRepeat(screenM.material, 1, 0.3);
  K.box(0, 3.4, -17.9, 9.4, 4.6, 0.1, 0x0a0a10, { seg: 0 });
  K.light(0, 3.4, -16, 0x8ab0ff, 8, 0.8);
  // the mic, its spotlight, the encore door
  K.cyl(0, 0.6, -14.4, 0.25, 0.28, 0.05, 0x2a2a2a, { n: 8 }); K.cyl(0, 1.3, -14.4, 0.025, 0.025, 1.4, 0xb0b0b8, { n: 5 }); K.sph(0, 2.05, -14.38, 0.08, 0x3a3a3a, { ws: 6, hs: 5 });
  pushSolidCyl(0, -14.4, 0.25, 0.5, 2.2);
  var cone = new THREE.Mesh(new THREE.ConeGeometry(1.4, 6, 14, 1, true), vcMat({ transparent: true, opacity: 0.12, additive: true, side: THREE.DoubleSide }));
  cone.geometry.setAttribute("aCol", new THREE.Float32BufferAttribute(new Float32Array(cone.geometry.attributes.position.count * 3).fill(1), 3));
  cone.material.uniforms.uColor.value = C(0xfff0d8); cone.position.set(0, 3.55, -14.4); buildGroup.add(cone);
  K.light(0, 3.5, -14, 0xfff0d8, 5, 1.2);
  K.door(-6.5, 0.55, -17.82, 0, K.onward(), { light: 0xff9ad8, sign: 0xff4ab0, col: 0x5a2a5a, open: 0.6 });
  // sofas along the walls, low tables, glasses
  for (var so = -1; so <= 1; so += 2) {
    if (so > 0) { K.box(so * 8.25, 0.25, -7.5, 1.2, 0.5, 7, 0x6a2a4a, { seg: 0, solid: true }); K.box(so * 8.7, 0.75, -7.5, 0.4, 1.0, 7, 0x5a2240, { seg: 0 }); }
    K.box(so * 6.9, 0.25, -7.5, 1.0, 0.5, 3, 0x2a2030, { seg: 0, solid: true });
    for (var gl = 0; gl < 4; gl++) K.cyl(so * 6.9 + rr(-0.3, 0.3), 0.6, -7.5 + rr(-1.2, 1.2), 0.05, 0.04, 0.18, pick([0xffc0e0, 0xc0f0ff, 0xfff0a0]), { n: 6, emit: 0.9 });
  }
  // the balcony over the entrance, and its stair
  K.stairs(-8.15, -12, "+z", 8.5, 1.4, 0, 3.0, 0x3a2a3a, { floating: true, thick: 0.25 });
  K.solid(-7.4, 0, -7.75, 0.1, 3.0, 8.5);
  K.slab(-9, -3.5, 9, 0, 3.0, 0x2a1a2a, { t: 0.3, skip: "" });
  K.box(0.7, 3.95, -3.5, 16.6, 0.06, 0.06, 0x8a6a9a, { seg: 0 }); for (var bp = -7.2; bp <= 9; bp += 0.8) K.box(bp, 3.5, -3.5, 0.04, 0.9, 0.04, 0x8a6a9a, { seg: 0 });
  K.solid(0.7, 3.0, -3.5, 16.6, 1.3, 0.2);
  K.box(3, 3.35, -1.2, 3, 0.5, 1.0, 0x4a2a5a, { seg: 0, solid: true }); K.box(3, 3.8, -0.7, 3, 0.7, 0.3, 0x4a2a5a, { seg: 0 });
  K.light(0, 5, -2, 0x9a6aff, 7, 0.6);
  // the disco ball and its turning specks
  K.cyl(0, 5.75, -7, 0.02, 0.02, 0.5, 0x8a8a8a, { n: 3 });
  var ballB = K.batch({ seg: 0, chunk: 0, lit: false }); ballB.sph(0, 0, 0, 0.6, 0x9aa0b8, { ws: 12, hs: 9, emit: 1.0, faceVary: 0.6 });
  var ball = ballB.mesh(0, 5.2, -7);
  var specks = K.motes(150, -8.5, 8.5, 0.2, 5.8, -17, -0.5, 0xffffff, 0.09, "drift", 0.0);
  K.light(-5, 4.5, -8, 0xff4ab0, 10, 0.9); K.light(5, 4.5, -8, 0x40d8ff, 10, 0.9); K.light(0, 4.5, -3, 0xffc040, 8, 0.5);
  // the audience: chairs that sing
  var chairB = K.batch({ seg: 0, chunk: 0, lit: false });
  chairB.box(0, 0.45, 0, 0.55, 0.08, 0.5, 0x5a4a5a); chairB.box(-0.24, 0.22, 0, 0.05, 0.44, 0.45, 0x3a3a40); chairB.box(0.24, 0.22, 0, 0.05, 0.44, 0.45, 0x3a3a40); chairB.box(0, 0.75, 0.24, 0.55, 0.6, 0.05, 0x4a3a4a);
  var chairG = chairB.geometry();
  var panB = K.batch({ seg: 0, chunk: 0, lit: false }); panB.box(0, 0.78, 0.21, 0.42, 0.42, 0.02, 0xffffff, { emit: 1.4 }); var panG = panB.geometry();
  var seats = [];
  for (var row = 0; row < 6; row++) for (var col = -4; col <= 4; col++) { if (col === 0) continue; seats.push({ x: col * 1.5, z: -10.5 + row * 1.4, ph: (row * 9 + col) * 0.37, row: row }); }
  var chairsI = K.instanced(chairG, seats.length), panI = K.instanced(panG, seats.length, vcMat({}));
  var _o = new THREE.Object3D(), _c = new THREE.Color();
  for (var si = 0; si < seats.length; si++) { _o.position.set(seats[si].x, 0, seats[si].z); _o.rotation.set(0, 0, 0); _o.updateMatrix(); chairsI.setMatrixAt(si, _o.matrix); panI.setMatrixAt(si, _o.matrix); panI.setColorAt(si, _c.setHSL(si / seats.length, 0.7, 0.6)); }
  for (var rw = 0; rw < 6; rw++) { K.solid(-3.75, 0, -10.5 + rw * 1.4, 5.3, 1.1, 0.55); K.solid(3.75, 0, -10.5 + rw * 1.4, 5.3, 1.1, 0.55); }
  // ---- the song ----
  var chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]], beat = 0, bi = 0, chorus = 0;
  function singChord(vol) {
    if (!audio.ctx) return;
    var ch = chords[bi % chords.length]; bi++;
    for (var n = 0; n < 3; n++) audio.tone(ch[n] * (n === 2 && chorus > 0 ? 2 : 1), "triangle", vol * (n ? 0.7 : 1), 0.25, 1.5, (n - 1) * 0.4);
    if (chorus > 0) audio.tone(ch[0] * 0.5, "sine", vol * 0.8, 0.1, 1.4, 0);
  }
  K.anim(function (dt, t) {
    if (ball) ball.rotation.y = t * 0.6;
    if (specks) specks.rotation.y = t * 0.25;
    var amp = chorus > 0 ? 1 : 0.4;
    for (var k = 0; k < seats.length; k++) {
      var s = seats[k], w = Math.sin(t * 2.2 + s.ph), lean = Math.sin(t * 0.9 + s.row * 0.6) * 0.06 * amp;
      _o.position.set(s.x, Math.max(0, w) * 0.05 * amp, s.z); _o.rotation.set(lean, Math.sin(t * 0.7 + s.ph) * 0.05, w * 0.04 * amp); _o.updateMatrix();
      chairsI.setMatrixAt(k, _o.matrix); panI.setMatrixAt(k, _o.matrix);
      panI.setColorAt(k, _c.setHSL((t * 0.05 + k / seats.length * 0.5) % 1, 0.7, 0.35 + Math.max(0, w) * 0.3 * amp));
    }
    chairsI.instanceMatrix.needsUpdate = true; panI.instanceMatrix.needsUpdate = true; if (panI.instanceColor) panI.instanceColor.needsUpdate = true;
    for (var b = 0; b < booths.length; b++) { var bo = booths[b]; if (bo.m.material.uniforms) bo.m.material.uniforms.uBright.value = 1.0 + Math.max(0, Math.sin(t * bo.f + bo.ph)) * 0.9; }
    if (cone) cone.material.uniforms.uOpacity.value = 0.1 + Math.sin(t * 1.3) * 0.03 + (chorus > 0 ? 0.06 : 0);
    beat -= dt; chorus = Math.max(0, chorus - dt);
    if (beat <= 0) {
      beat = 1.3;
      var d = Math.hypot(pos.x, pos.z + 7), vol = clamp(1 - d / 16, 0, 1) * 0.05 + (chorus > 0 ? 0.04 : 0);
      if (vol > 0.004) singChord(vol);
      if (pos.z > 1 && audio.ctx && rng() < 0.4) audio.creature("music", pos.x < 0 ? -0.7 : 0.7, rr(0.7, 1.1));
    }
  });
  // ---- interactables ----
  var micHot = new THREE.Object3D(); micHot.position.set(0, 2.0, -14.4);
  K.ix(micHot, 0, -13.6, 2.4, [
    "you sing the only line you remember. the chairs know the rest.",
    "they hold the last note for you, a long time, until you are ready to let it go.",
    "you sing again. somewhere a seat is warm again."
  ], { glow: false, y: 0.55, on: function () { chorus = 9; beat = 0; } });
  var book = new THREE.Group(); var bk = K.batch({ seg: 0, chunk: 0, parent: book }); bk.box(0, 0.03, 0, 0.42, 0.06, 0.55, 0x2a5a8a); bk.box(0, 0.065, 0, 0.38, 0.01, 0.5, 0xf2ead8);
  book.position.set(-6.9, 0.5, -6.6); buildGroup.add(book); bk.mesh(0, 0, 0, book);
  K.ix(book, -6.4, -6.6, 2.2, [
    "the songbook. every song in it has the same name. you almost remember the tune.",
    "someone has underlined one line in pencil: they kept your seat.",
    "the last page is a song you haven't written yet."
  ], { y: 0.5 });
  var tam = new THREE.Group(); var tb = K.batch({ seg: 0, chunk: 0, parent: tam }); tb.torus(0, 0, 0, 0.2, 0.03, 0xd8b060, { rx: Math.PI / 2, ts: 12 }); for (var jn = 0; jn < 5; jn++) { var ja = jn / 5 * TAU; tb.cyl(Math.cos(ja) * 0.2, 0, Math.sin(ja) * 0.2, 0.04, 0.04, 0.02, 0xe8e8f0, { n: 6, emit: 1.1 }); }
  tam.position.set(6.9, 0.55, -8.2); buildGroup.add(tam); tb.mesh(0, 0, 0, tam);
  K.ix(tam, 6.4, -8.2, 2.2, [
    "a tambourine, left mid-song. you shake it once, and every chair turns its head.",
    "it jingles like keys in a coat pocket. someone is coming home.",
    "you keep time for them, for a while."
  ], { y: 0.5, on: function () { if (audio.ctx) { audio.creature("rustle", 0, 1); audio.creature("tick", 0.2, 1.2); } chorus = Math.max(chorus, 3); } });
  return K.finish({
    spawn: { x: 0, y: 0, z: 20, yaw: 0 }, fog: [0x140a1c, 6, 40], sky: 0x05030a, bounds: 0, killY: -8, sound: "choir", desat: 0
  });
});

/* =========================================================================
   8. THE STAIRWELL BETWEEN FLOORS — a concrete stairwell that never ends but
   keeps changing: one floor is snowing, one has a window on the sea, one is
   flooded, one has grass on the steps. The numbers are wrong. Keep climbing.
   ========================================================================= */
defineWorld("between_floors_stairwell", { title: "the stairwell between floors", tags: ["interior", "vertical", "liminal"], valence: 0, interior: true }, function (P, mood) {
  var K = new World(P, mood, { sky: 0x5a6a68, gnd: 0x1a2020 });
  var FH = 3.6, LO = -4, HI = 9, conc = 0xa8aca4;
  var FLOORS = {
    "-4": { sign: "b4", wall: 0x4a4e4a, lamp: 0x8a9a8a, dim: 0.35 }, "-3": { sign: "b3", wall: 0x5a5e58, lamp: 0x9aaa9a, dim: 0.45 },
    "-2": { sign: "b2", wall: 0x6a6e68, lamp: 0xb8c8b8, dim: 0.6 }, "-1": { sign: "b1", wall: 0x7a7e76, lamp: 0xd0d8c8, dim: 0.8 },
    "0": { sign: "1", wall: 0x8a9088, lamp: 0xe8f0e0 }, "1": { sign: "2", wall: 0x8a9a88, lamp: 0xe8f0d8, plant: 1 },
    "2": { sign: "3", wall: 0x7a8a96, lamp: 0xd8e4f0, sea: "night" }, "3": { sign: "3", wall: 0x8a96a0, lamp: 0xf0f4f8, sea: "day" },
    "4": { sign: "4½", wall: 0xc8ccd4, lamp: 0xe8f0ff, snow: 1 }, "5": { sign: "−1", wall: 0x5a7a80, lamp: 0x9ad8e0, flood: 1 },
    "6": { sign: "7", wall: 0xb89a7a, lamp: 0xffd8a0, home: 1 }, "7": { sign: "?", wall: 0x2a2c2c, lamp: 0x40ff90, dark: 1 },
    "8": { sign: "9", wall: 0x8a9a7a, lamp: 0xf0ffd8, grass: 1 }, "9": { sign: "roof", wall: 0x6a7a90, lamp: 0xc8d8ff, roof: 1 }
  };
  var yMin = LO * FH, yMax = HI * FH + 3.6;
  // the shaft: four tall walls, dressed floor by floor
  for (var f = LO; f <= HI; f++) {
    var F = FLOORS[f], Y = f * FH, wc = F.wall, top = f === HI ? 3.6 : FH;
    K.wallX(-3.35, -5.55, 5.55, Y, top, wc, { t: 0.3 }); K.wallX(3.35, -5.55, 5.55, Y, top, wc, { t: 0.3, gaps: F.sea ? [{ a: 3.3, b: 5.2, lo: 2.3, hi: 3.55 }] : [] });
    K.wallZ(-5.55, -3.35, 3.35, Y, top, mixC(wc, 0x000000, 0.06), { t: 0.3 }); K.wallZ(5.55, -3.35, 3.35, Y, top, mixC(wc, 0x000000, 0.03), { t: 0.3 });
    K.box(0, Y + 0.9, -5.38, 6.6, 0.06, 0.04, mixC(wc, 0x000000, 0.25), { seg: 0 });
    // the floor landing and the door
    K.slab(-3.2, -5.4, 3.2, -3.0, Y, conc, { t: 0.3, skip: "" });
    var dark = !!F.dark;
    if (F.roof) K.door(0, Y, -5.37, 0, K.onward(), { light: 0xc8d8ff, frame: 0x3a3a40, col: 0x5a6a7a, open: 1.0, glow: 1.8, sign: 0x60ff90, nudge: { b: 0.6, e: 0.1 } });
    else K.door(0, Y, -5.37, 0, K.onward(), { light: F.lamp, frame: 0x3a3a40, col: mixC(wc, 0x000000, 0.35), open: dark ? 0.1 : rr(0.06, 0.3), glow: dark ? 0.6 : 1.0 });
    var sT = (function (txt, dark2) { return K.tex(function (x, W, Hh) { x.fillStyle = dark2 ? "#101412" : "#e8e8e0"; x.fillRect(0, 0, W, Hh); x.fillStyle = dark2 ? "#40ff90" : "#1a1a1a"; x.font = "bold " + (txt.length > 2 ? 20 : 34) + "px monospace"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(txt, W / 2, Hh / 2 + 2); }, 64, 64, true); })(F.sign, dark);
    K.picture(1.45, Y + 1.7, -5.38, 0.5, 0.5, sT, { bright: dark ? 1.4 : 1.0 });
    if (!dark) { K.box(-2.3, Y + 2.7, -5.34, 0.4, 0.2, 0.12, F.lamp, { seg: 0, emit: 1.6 }); K.light(-2.3, Y + 2.4, -4.6, F.lamp, 6.5, F.dim || 0.9); }
    else { K.box(-1.2, Y + 2.55, -5.35, 0.5, 0.2, 0.06, 0x40ff90, { seg: 0, emit: 1.8 }); K.light(-1, Y + 2.2, -4.8, 0x40ff90, 4, 0.6); }
    if (f === HI) { K.box(0, Y + 3.75, 0, 6.8, 0.3, 11.2, wc, { seg: 2 }); break; }
    // flight A up the left, the half landing, flight B up the right
    K.stairs(-1.85, -3.0, "+z", 6.0, 2.7, Y, Y + 1.8, F.grass ? 0x6a8a4a : conc, { floating: true, thick: 0.28 });
    K.slab(-3.2, 3.0, 3.2, 5.4, Y + 1.8, conc, { t: 0.3, skip: "" });
    K.stairs(1.85, 3.0, "-z", 6.0, 2.7, Y + 1.8, Y + FH, F.grass ? 0x6a8a4a : conc, { floating: true, thick: 0.28 });
    // railings round the well
    var rail = 0x2a3a3a;
    K.box(-0.5, Y + 0.9 + 1.0, 0, 0.06, 0.06, 6.3, rail, { seg: 0, rx: -Math.atan2(1.8, 6) }); K.box(0.5, Y + 1.8 + 0.9 + 1.0, 0, 0.06, 0.06, 6.3, rail, { seg: 0, rx: Math.atan2(1.8, 6) });
    for (var bz = -2.6; bz <= 2.6; bz += 0.65) { var ya = Y + 1.8 * (bz + 3) / 6, yb = Y + 1.8 + 1.8 * (3 - bz) / 6; K.box(-0.5, ya + 0.5, bz, 0.03, 1.0, 0.03, rail, { seg: 0 }); K.box(0.5, yb + 0.5, bz, 0.03, 1.0, 0.03, rail, { seg: 0 }); }
    K.box(0, Y + 1.8 + 1.0, 3.0, 1.0, 0.06, 0.06, rail, { seg: 0 }); K.box(0, Y + 1.0, -3.0, 1.0, 0.06, 0.06, rail, { seg: 0 });
    pushSolidBox(-0.56, 0, 0.07, 3.0, 0, Y - 0.2, Y + 1.8 + 1.5); pushSolidBox(0.56, 0, 0.07, 3.0, 0, Y + 1.6, Y + FH + 1.5);
    pushSolidBox(0, 3.02, 0.55, 0.07, 0, Y + 1.6, Y + 1.8 + 1.5); pushSolidBox(0, -3.02, 0.55, 0.07, 0, Y - 0.2, Y + 1.5);
    if (!dark) { K.box(0, Y + 1.8 + 2.7, 5.34, 0.4, 0.2, 0.12, F.lamp, { seg: 0, emit: 1.5 }); K.light(0, Y + 1.8 + 2.4, 4.6, F.lamp, 6, (F.dim || 0.9) * 0.9); }
    // ---- what this floor remembers ----
    if (f === 0) { K.cyl(-3.0, Y + 0.45, -4.2, 0.14, 0.14, 0.7, 0xc83a2a, { n: 8 }); K.torus(2.4, Y + 0.4, 4.2, 0.38, 0.04, 0x1a1a1a, { ry: 0.2, ts: 10 }); }
    if (F.plant) { K.cyl(-2.5, Y + 1.8 + 0.3, 4.6, 0.35, 0.28, 0.6, 0x8a4a3a, { n: 8 }); for (var lf = 0; lf < 26; lf++) K.box(-2.5 + rr(-0.9, 0.9), Y + 1.8 + rr(0.7, 3.2), 4.6 + rr(-0.6, 0.6), 0.36, 0.03, 0.22, mixC(0x2a5a2a, 0x6a9a4a, rng()), { seg: 0, ry: rng() * 3, rx: rr(-0.6, 0.6) }); for (var vn = 0; vn < 10; vn++) K.box(-0.5, Y + rr(0.2, 2.6), rr(-2.6, 2.6), 0.08, 0.05, 0.3, 0x3a6a3a, { seg: 0, rx: rr(-1, 1) }); }
    if (F.sea) {
      var night = F.sea === "night";
      var seaT = K.tex(function (x, W, Hh) { var g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, night ? "#0a1028" : "#a8c8e8"); g.addColorStop(0.55, night ? "#1a2a4a" : "#d8e8f0"); g.addColorStop(0.56, night ? "#0a1a2a" : "#5a8aa8"); g.addColorStop(1, night ? "#02060c" : "#2a5a7a"); x.fillStyle = g; x.fillRect(0, 0, W, Hh); x.fillStyle = night ? "#2a2a30" : "#5a5a60"; x.fillRect(W * 0.7, Hh * 0.38, 4, Hh * 0.18); if (night) { x.fillStyle = "rgba(255,255,240,0.9)"; for (var i = 0; i < 20; i++) x.fillRect(Math.random() * W, Math.random() * Hh * 0.5, 1, 1); } }, 64, 64, true);
      var seaM = K.picture(3.55, Y + 2.95, 4.25, 2.2, 1.4, seaT, { ry: -Math.PI / 2, bright: night ? 1.2 : 1.35 });
      K.box(3.3, Y + 2.3, 4.25, 0.4, 0.08, 2.0, 0x3a3a3a, { seg: 0 });
      if (night) { var beam = K.glowAt(3.54, Y + 3.0, 4.25 - 0.45, 0xfff8d0, 0.6, 0.0); K.anim(function (dt, t) { beam.material.opacity = Math.sin(t * 1.2) > 0.85 ? 0.95 : 0.0; }); K.light(2.6, Y + 1.8 + 1.5, 4.25, 0x6a8ab0, 4, 0.6); }
      else K.light(2.6, Y + 1.8 + 1.5, 4.25, 0xe8f0ff, 5, 1.0);
    }
    if (F.snow) { K.motes(140, -3.1, 3.1, Y, Y + FH + 1.8, -5.3, 5.3, 0xffffff, 0.08, "fall", 0.7); for (var sn = 0; sn < 6; sn++) { K.box(-1.85, Y + 0.3 * (sn + 1) - 0.13, -2.5 + sn, 2.6, 0.04, 0.5, 0xf4f8ff, { seg: 0 }); K.box(1.85, Y + 1.8 + 0.3 * (sn + 1) - 0.13, 2.5 - sn, 2.6, 0.04, 0.5, 0xf4f8ff, { seg: 0 }); } K.box(0, Y + 0.02, -4.2, 6.2, 0.04, 2.2, 0xf4f8ff, { seg: 0 }); }
    if (F.flood) { var fw = K.batch({ seg: 0, chunk: 0, lit: false, mat: vcMat({ transparent: true, opacity: 0.4, additive: false }) }); fw.quad(0, Y + 0.12, -4.2, 6.3, 2.3, 0x3a7a8a, { rx: -Math.PI / 2, emit: 1.1 }); fw.quad(0, Y + 1.8 + 0.12, 4.2, 6.3, 2.3, 0x3a7a8a, { rx: -Math.PI / 2, emit: 1.1 }); K.motes(30, -3, 3, Y + 0.1, Y + 0.3, -5.3, -3.1, 0xc8f8ff, 0.05, "drift", 0.3); }
    if (F.home) { for (var hp = 0; hp < 5; hp++) K.box(-3.18, Y + 1.8 + 1.5, 3.4 + hp * 0.42, 0.02, 2.6, 0.2, hp % 2 ? 0xd8b890 : 0xc8a880, { seg: 0 }); K.cyl(-2.6, Y + 1.8 + 0.5, 4.8, 0.2, 0.25, 1.0, 0x6a4a3a, { n: 6 }); K.sph(-2.6, Y + 1.8 + 1.25, 4.8, 0.3, 0xffe0a8, { emit: 1.5, ws: 6, hs: 5 }); K.light(-2.6, Y + 1.8 + 1.3, 4.6, 0xffc890, 5, 1.0); K.box(1.2, Y + 0.05, -4.0, 0.28, 0.1, 0.12, 0x8a6a9a, { seg: 0, ry: 0.4 }); }
    if (F.grass) { for (var gr = 0; gr < 60; gr++) { var gz = rr(-3, 3), onA = rng() < 0.5, gy = onA ? Y + 1.8 * (gz + 3) / 6 : Y + 1.8 + 1.8 * (3 - gz) / 6; K.box(onA ? rr(-3.1, -0.6) : rr(0.6, 3.1), gy + 0.12, gz, 0.04, rr(0.15, 0.35), 0.04, 0x6a9a4a, { seg: 0, rz: rr(-0.3, 0.3) }); } }
  }
  // the well below, going down into nothing; and above, the roof's sky
  K.box(0, yMin - 0.3, -4.2, 6.6, 0.3, 2.4, 0x2a2e2c, { seg: 0 });
  // ---- interactables ----
  var noteT = K.tex(function (x, W, Hh) { x.fillStyle = "#f4eecc"; x.fillRect(0, 0, W, Hh); textLines(x, ["keep climbing", "it gets kinder"], W, Hh, { size: 10, color: "#3a3040" }); }, 64, 40, true);
  K.picture(-0.46, 1.8 + 0.9, 2.2, 0.3, 0.2, noteT, { ry: Math.PI / 2, decal: true });
  var noteHot = new THREE.Object3D(); noteHot.position.set(-0.5, 2.0, 2.2);
  K.ix(noteHot, -1.2, 2.2, 2.0, [
    "a note taped to the rail: if you are reading this, you are between. keep climbing, it gets kinder.",
    "on the back, in the same hand: i'm a few floors up. i'll leave the lights on.",
    "the tape is old. whoever wrote it climbed a long time ago."
  ], { glow: false, y: 1.8, on: function () { if (audio.ctx) audio.creature("rustle", 0, 0.8); } });
  var signHot = new THREE.Object3D(); signHot.position.set(1.45, 3 * FH + 1.7, -5.3);
  K.ix(signHot, 1.2, -4.5, 2.2, [
    "3. the floor below was also 3. the number keeps changing when you blink. it has always been this floor.",
    "you blink. it's still 3. it seems relieved.",
    "you could stay on this floor. it would let you."
  ], { glow: false, y: 3 * FH, on: function () { if (audio.ctx) audio.creature("tick", 0, 0.6); } });
  var seaHot = new THREE.Object3D(); seaHot.position.set(3.3, 2 * FH + 3.3, 4.25);
  K.ix(seaHot, 2.4, 4.25, 2.2, [
    "salt on the glass. a lighthouse blinks exactly when you do.",
    "out there a boat is going somewhere, slowly, with its one light on.",
    "you can hear the sea through the concrete, or the building breathing."
  ], { glow: false, y: 2 * FH + 1.8, on: function () { if (audio.ctx) audio.creature("sigh", 0.5, 0.8); } });
  // footsteps of someone else, a few floors up, on the dark floor
  var stepT = 3;
  K.anim(function (dt) {
    stepT -= dt; if (stepT > 0) return; stepT = rr(0.45, 0.6);
    var fl2 = Math.floor((pos.y + 0.5) / FH);
    if (audio.ctx && (fl2 === 6 || fl2 === 7) && rng() < 0.6) audio.creature("tick", rr(-0.3, 0.3), 0.5);
  });
  return K.finish({
    spawn: { x: -1.8, y: 0, z: -3.4, yaw: Math.PI }, fog: [0x0e1214, 3, 24], sky: 0x020304, bounds: 0, killY: yMin - 8, sound: "hum", desat: 0.05
  });
});

/* =========================================================================
   9. THE BUS STOP AT THE EDGE OF EVERYTHING — a road across a dusk meadow
   that simply ends: past the kerb there are only stars, above and below. A
   bus comes now and then, stops, opens its doors, and drives on off the edge.
   ========================================================================= */
defineWorld("last_bus_stop_edge", { title: "the bus stop at the edge of everything", tags: ["exterior", "dusk", "void"], valence: 1 }, function (P, mood) {
  var K = new World(P, mood, { sky: 0x6a5a8a, gnd: 0x1a1428, dir: [0, 0.35, -1], dirCol: 0x6a4a5a });
  var EDGE = -60;
  // the meadow and the road, ending
  var grassT = K.tex(function (x, W) { noiseFill(x, W, W, "#3a4a3a", 0.22, 400, 2); }, 32);
  K.slab(-70, EDGE, -4.2, 70, 0, 0xffffff, { batch: K.batch({ mat: vcMat({ map: grassT }), tile: 3, seg: 8 }), tile: 3 });
  K.slab(4.2, EDGE, 70, 70, 0, 0xffffff, { batch: K.batch({ mat: vcMat({ map: grassT }), tile: 3, seg: 8 }), tile: 3 });
  K.slab(-4.2, EDGE, 4.2, 70, 0.02, 0x2a2a32, { seg: 4 });
  for (var dz = 68; dz > EDGE + 1; dz -= 4) K.box(0, 0.035, dz, 0.15, 0.02, 2, 0xd8d0a0, { seg: 0, emit: 0.7 });
  K.box(-3.9, 0.035, 5, 0.1, 0.02, 130, 0xc8c8c0, { seg: 0, emit: 0.5 }); K.box(3.9, 0.035, 5, 0.1, 0.02, 130, 0xc8c8c0, { seg: 0, emit: 0.5 });
  // the cliff face beneath the edge, ragged
  var cliff = K.batch({ seg: 0 });
  for (var cx = -68; cx < 70; cx += 4) { var dd = rr(0.5, 3), hh = rr(14, 40); cliff.box(cx, -hh / 2, EDGE - dd / 2 + 0.2, rr(3.5, 5), hh, dd, mixC(0x2a2438, 0x000000, rng() * 0.3), { ry: rr(-0.1, 0.1) }); }
  for (var tf = 0; tf < 120; tf++) { var tx = rr(-65, 65), tz = rr(EDGE + 1, 65); if (Math.abs(tx) < 5) continue; K.cone(tx, 0.18, tz, rr(0.08, 0.2), rr(0.3, 0.6), mixC(0x3a5a3a, 0x8a8a5a, rng()), { n: 3 }); }
  // the shelter
  var glassM = K.batch({ seg: 0, chunk: 0, lit: false, mat: vcMat({ transparent: true, opacity: 0.18, side: THREE.DoubleSide }) });
  K.box(8, 2.65, -39, 3.4, 0.12, 6.4, 0x3a3a44, { seg: 0 });
  K.box(9.55, 1.3, -39, 0.1, 2.6, 0.1, 0x5a5a64, { seg: 0 }); for (var pz = -42; pz <= -36; pz += 3) { K.cyl(9.55, 1.3, pz, 0.05, 0.05, 2.6, 0x5a5a64, { n: 5 }); K.cyl(6.45, 1.3, pz, 0.05, 0.05, 2.6, 0x5a5a64, { n: 5 }); }
  glassM.box(9.55, 1.45, -39, 0.03, 2.2, 6, 0xb8c8e8, { emit: 1 }); glassM.box(8, 1.45, -42.15, 3.0, 2.2, 0.03, 0xb8c8e8, { emit: 1 });
  K.solid(9.55, 0, -39, 0.2, 2.6, 6.2); K.solid(8, 0, -42.15, 3.2, 2.6, 0.2);
  K.box(8.9, 0.48, -39, 0.7, 0.08, 3.6, 0x8a6a4a, { seg: 0 }); K.box(9.25, 0.8, -39, 0.06, 0.5, 3.6, 0x8a6a4a, { seg: 0 }); K.box(8.9, 0.22, -40.6, 0.06, 0.45, 0.4, 0x3a3a3a, { seg: 0 }); K.box(8.9, 0.22, -37.4, 0.06, 0.45, 0.4, 0x3a3a3a, { seg: 0 });
  K.solid(8.9, 0, -39, 0.8, 0.55, 3.6);
  var adT = K.tex(function (x, W, Hh) { var g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, "#2a3060"); g.addColorStop(1, "#c88aa0"); x.fillStyle = g; x.fillRect(0, 0, W, Hh); x.fillStyle = "rgba(255,240,230,0.85)"; x.beginPath(); x.ellipse(W / 2, Hh * 0.58, W * 0.28, Hh * 0.1, 0, 0, 7); x.fill(); x.fillStyle = "#2a3060"; x.fillRect(W * 0.3, Hh * 0.55, W * 0.4, 2); textLines(x, ["rest."], W, Hh * 0.4, { size: 18, color: "#fff4f0" }); textLines(x, ["nothing else"], W, Hh * 0.3, { size: 8, color: "#fff4f0", dy: Hh * 0.68 }); }, 64, 128, true);
  var adM = K.picture(8.05, 1.45, -42.08, 1.4, 2.0, adT, { bright: 1.5 });
  K.light(8, 1.6, -41, 0xe8c8d8, 4, 0.9); K.box(8, 2.55, -39, 1.6, 0.06, 0.15, 0xfff0e0, { seg: 0, emit: 1.6 }); K.light(8, 2.3, -39, 0xfff0e0, 5, 0.8);
  var ttT = K.tex(function (x, W, Hh) { x.fillStyle = "#f0ece0"; x.fillRect(0, 0, W, Hh); x.fillStyle = "#2a3a6a"; x.fillRect(0, 0, W, 14); textLines(x, ["route 0"], W, 14, { size: 10, color: "#fff" }); var y = 26; for (var i = 0; i < 6; i++) { textLines(x, ["soon", "soon"], W, 0, { size: 9, color: "#2a2a2a", dy: y + i * 16 - Hh / 2 + Hh / 2, lh: 0, align: "left", x: 8 }); x.fillStyle = "#2a2a2a"; x.font = "9px monospace"; x.textAlign = "right"; x.fillText("soon", W - 8, y + i * 16); } }, 64, 128, true);
  K.picture(9.48, 1.5, -40.6, 0.6, 1.1, ttT, { ry: -Math.PI / 2 });
  K.cyl(5, 1.4, -35, 0.05, 0.05, 2.8, 0x8a8a90, { n: 5 });
  var stopT = K.tex(function (x, W, Hh) { x.fillStyle = "#2a5a3a"; x.beginPath(); x.arc(W / 2, Hh / 2, W / 2 - 1, 0, 7); x.fill(); x.strokeStyle = "#f0f0e0"; x.lineWidth = 3; x.stroke(); textLines(x, ["end of", "route"], W, Hh, { size: 11, color: "#f0f0e0" }); }, 64, 64, true);
  K.picture(5, 2.85, -35, 0.8, 0.8, stopT, { ry: 0.5, transparent: true, two: true });
  // streetlights and telephone poles, the wires sagging toward the edge
  for (var sl = 50; sl > EDGE + 5; sl -= 20) { K.cyl(5.4, 3.5, sl, 0.1, 0.13, 7, 0x3a3a40, { n: 5 }); K.box(4.6, 6.95, sl, 1.8, 0.12, 0.3, 0x3a3a40, { seg: 0 }); K.box(3.9, 6.85, sl, 0.6, 0.08, 0.25, 0xffb060, { seg: 0, emit: 2 }); K.light(3.9, 6, sl, 0xffa050, 14, 1.0); K.glowAt(3.9, 6.6, sl, 0xffa050, 3.5, 0.5); }
  var prev = null;
  for (var tp = 60; tp > EDGE - 1; tp -= 24) { K.cyl(-8, 4.5, tp, 0.14, 0.18, 9, 0x2a2018, { n: 5 }); K.box(-8, 8.6, tp, 2.2, 0.14, 0.14, 0x2a2018, { seg: 0 }); if (prev != null) for (var wi = -1; wi <= 1; wi += 2) for (var sg = 0; sg < 6; sg++) { var za = prev - sg * (prev - tp) / 6, zb = prev - (sg + 1) * (prev - tp) / 6, ya = 8.6 - Math.sin(sg / 6 * Math.PI) * 1.2, yb = 8.6 - Math.sin((sg + 1) / 6 * Math.PI) * 1.2; K.box(-8 + wi, (ya + yb) / 2, (za + zb) / 2, 0.03, 0.03, Math.hypot(za - zb, ya - yb), 0x101010, { seg: 0, rx: Math.atan2(ya - yb, za - zb) }); } prev = tp; }
  // the lookout, built out over the edge
  K.stairs(-13, -44, "-z", 10, 2.4, 0, 4, 0x6a4a30, { floating: true, thick: 0.25, solid: false });
  K.slab(-16, -61.5, -10, -54, 4, 0x6a4a30, { t: 0.25, skip: "" });
  for (var lp = 0; lp < 4; lp++) K.cyl(lp % 2 ? -10.3 : -15.7, 2, lp < 2 ? -54.3 : -61.2, 0.12, 0.12, 4, 0x4a3420, { n: 5, solid: true });
  K.box(-13, 4.55, -61.5, 6, 0.06, 0.06, 0x4a3420, { seg: 0 }); K.box(-16, 4.55, -57.75, 0.06, 0.06, 7.5, 0x4a3420, { seg: 0 }); K.box(-10, 4.55, -57.75, 0.06, 0.06, 7.5, 0x4a3420, { seg: 0 });
  K.solid(-13, 4, -61.5, 6, 1.3, 0.2); K.solid(-16, 4, -57.75, 0.2, 1.3, 7.5); K.solid(-10, 4, -57.75, 0.2, 1.3, 7.5);
  K.cyl(-13, 4.5, -60.6, 0.06, 0.06, 1.0, 0x3a3a40, { n: 5 }); K.box(-13, 5.1, -60.6, 0.3, 0.25, 0.5, 0x5a6a7a, { seg: 0 });
  // the void: stars all around, a pale moon below the horizon, the road drifting away in pieces
  K.motes(260, -160, 160, -90, 70, -300, EDGE - 5, 0xf0ecff, 0.35, "drift", 0.02);
  K.motes(120, -120, 120, 25, 70, EDGE, 80, 0xf0ecff, 0.25, "drift", 0.01);
  var moonS = N2.glowSprite(0xf0e0ff, 140); moonS.position.set(10, -40, -240); moonS.material.opacity = 0.45; buildGroup.add(moonS);
  var frags = [];
  for (var fr = 0; fr < 9; fr++) {
    var fb = K.batch({ seg: 0, chunk: 0 }), fl = rr(2.5, 6);
    fb.box(0, -0.2, 0, rr(3, 8), 0.4, fl, 0x2a2a32); fb.box(0, 0.01, 0, 0.15, 0.02, fl * 0.5, 0xd8d0a0, { emit: 0.8 });
    if (rng() < 0.4) { fb.cyl(2, 3, 0, 0.08, 0.1, 6, 0x3a3a40, { n: 5 }); fb.box(1.4, 6, 0, 1.4, 0.1, 0.2, 0xffb060, { emit: 1.6 }); }
    var fm = fb.mesh(rr(-6, 6), rr(-3, 1), rr(-90, -70));
    if (fm) frags.push({ m: fm, v: rr(0.6, 1.4), y0: fm.position.y, ph: rng() * TAU, x0: fm.position.x, z: -70 - fr * 22 });
  }
  // ---- the bus ----
  var busG = new THREE.Group(); buildGroup.add(busG);
  var bus = K.batch({ seg: 0, chunk: 0, parent: busG });
  bus.box(0, 1.75, 0, 2.6, 2.7, 10.5, 0xc8a050); bus.box(0, 0.32, 0, 2.5, 0.3, 10.3, 0x2a2a2a);
  for (var bw = -4; bw <= 4; bw += 1.6) { bus.box(1.31, 2.15, bw, 0.02, 0.9, 1.3, 0xffd8a0, { emit: 1.5 }); bus.box(-1.31, 2.15, bw, 0.02, 0.9, 1.3, 0xffd8a0, { emit: 1.5 }); }
  bus.box(0, 2.1, -5.26, 2.3, 1.1, 0.02, 0xffe0b0, { emit: 1.2 }); bus.box(0, 2.95, -5.27, 1.6, 0.3, 0.02, 0x101010); bus.box(0, 2.95, -5.28, 1.4, 0.2, 0.02, 0xffb040, { emit: 1.8 });
  bus.box(0.85, 0.9, -5.27, 0.35, 0.2, 0.02, 0xfff4e0, { emit: 2 }); bus.box(-0.85, 0.9, -5.27, 0.35, 0.2, 0.02, 0xfff4e0, { emit: 2 });
  bus.box(0.9, 0.9, 5.27, 0.3, 0.2, 0.02, 0xff3020, { emit: 2 }); bus.box(-0.9, 0.9, 5.27, 0.3, 0.2, 0.02, 0xff3020, { emit: 2 });
  for (var whl = 0; whl < 4; whl++) bus.cyl(whl % 2 ? 1.25 : -1.25, 0.5, whl < 2 ? -3.4 : 3.4, 0.5, 0.5, 0.3, 0x141414, { rz: Math.PI / 2, n: 10 });
  var doorL = new THREE.Group(); doorL.position.set(1.32, 0, -3.6); busG.add(doorL);
  var db = K.batch({ seg: 0, chunk: 0, parent: doorL }); db.box(0, 1.5, 0.5, 0.06, 2.6, 1.0, 0x8a7040); db.box(0.02, 1.9, 0.5, 0.02, 1.2, 0.8, 0xffd8a0, { emit: 1.3 });
  bus.box(1.29, 1.5, -3.1, 0.02, 2.6, 1.0, 0xffe0b0, { emit: 1.6 });
  var headL = N2.glowSprite(0xfff4e0, 3); headL.position.set(0, 1, -5.6); headL.material.opacity = 0.6; busG.add(headL);
  pushSolidBox(0, 0, 1.35, 5.3, 0, 0, 3.2); var busSolid = gSolid[gSolid.length - 1];
  pushBoxLink(0, 0, 0.6, 0.7, 0, 999, -999, { b: 0.6, e: 0.1 }, "door"); var busLink = linkables[linkables.length - 1]; busLink.target = K.onward();
  WB.bus = { link: busLink, group: busG };
  var BX = 2.0, STOPZ = -39, CYC = 72, off = rr(-6, -2);
  function busZ(c) {
    if (c < 14) return 95 - (95 - STOPZ) * (1 - Math.pow(1 - c / 14, 2));   // arriving, slowing
    if (c < 26) return STOPZ;                                                  // waiting, doors open
    var u2 = (c - 26) / 20; return STOPZ - u2 * u2 * 230;                       // leaving, off the edge
  }
  var lastPhase = -1, engine = 0;
  K.anim(function (dt, t) {
    var c = ((t + off) % CYC + CYC) % CYC;
    var z = busZ(c), y = 0;
    if (z < EDGE) y = (EDGE - z) * 0.09;
    var vis = c < 46;
    busG.visible = vis; busG.position.set(BX, y, z); busG.rotation.x = z < EDGE ? -0.05 : 0;
    busSolid.x = BX; busSolid.z = z; busSolid.y0 = vis ? y : 999; busSolid.y1 = vis ? y + 3.2 : -999;
    var open = c >= 14.6 && c < 25.4;
    doorL.rotation.y += ((open ? -1.4 : 0) - doorL.rotation.y) * Math.min(1, dt * 4);
    busLink.x = BX + 1.6; busLink.z = z - 3.1; busLink.y0 = open ? -0.5 : 999; busLink.y1 = open ? 3 : -999;
    var ph = c < 14 ? 0 : c < 26 ? 1 : c < 46 ? 2 : 3;
    if (ph !== lastPhase) { lastPhase = ph; if (audio.ctx) { var pan = clamp((BX - pos.x) / 12, -1, 1); if (ph === 1) { audio.creature("sigh", pan, 1); audio.creature("chime", pan, 0.8); } if (ph === 2) audio.creature("creak", pan, 0.7); } }
    engine -= dt; if (engine <= 0) { engine = 0.9; var dz2 = Math.abs(z - pos.z); if (audio.ctx && vis && ph !== 1 && dz2 < 50) audio.tone(48 + (ph === 2 ? 10 : 0), "sawtooth", 0.035 * (1 - dz2 / 50), 0.3, 1.0, clamp((BX - pos.x) / 12, -1, 1)); }
    for (var k = 0; k < frags.length; k++) { var f = frags[k]; f.z -= dt * f.v; if (f.z < -260) f.z = -64; f.m.position.set(f.x0 + Math.sin(t * 0.1 + f.ph) * 2, f.y0 - (-64 - f.z) * 0.06 + Math.sin(t * 0.3 + f.ph) * 0.3, f.z); f.m.rotation.set(Math.sin(t * 0.05 + f.ph) * 0.3, f.ph + t * 0.02, Math.cos(t * 0.04 + f.ph) * 0.2); }
    if (adM) adM.material.uniforms.uBright.value = 1.35 + Math.sin(t * 0.8) * 0.15;
  });
  K.motes(40, -30, 30, 0.3, 2.5, -55, 40, 0xd8ff9a, 0.07, "drift", 0.6);
  // ---- interactables ----
  var ttHot = new THREE.Object3D(); ttHot.position.set(9.4, 1.5, -40.6);
  K.ix(ttHot, 8.4, -40.6, 2.2, [
    "every departure says: soon. it has been soon for a long time. that's alright.",
    "someone has written in the margin: it always comes. it always comes.",
    "the last bus is listed twice, as if it might be needed again."
  ], { glow: false, on: function () { if (audio.ctx) audio.creature("tick", 0, 1); } });
  var binHot = new THREE.Object3D(); binHot.position.set(-13, 5.1, -60.6);
  K.ix(binHot, -13, -59.8, 2.2, [
    "through the viewer you see the bus stop from very far away. someone is waiting there. it's you, a while ago.",
    "you look down. the stars go on under the road, under everything.",
    "the coin runs out. the view stays."
  ], { glow: false, y: 4, on: function () { if (audio.ctx) audio.creature("tick", 0, 0.7); } });
  var benchHot = new THREE.Object3D(); benchHot.position.set(8.9, 0.6, -38.5);
  K.ix(benchHot, 8.0, -38.5, 2.2, [
    "the seat is warm, as if someone just left on the last bus.",
    "you sit and wait. the meadow breathes. a moth lands on the timetable.",
    "it is very quiet at the edge of everything. it is not frightening. it is just quiet."
  ], { glow: false, on: function () { if (audio.ctx) audio.creature("creak", 0, 0.9); } });
  return K.finish({
    spawn: { x: 6, y: 0.02, z: -28, yaw: 0.1 }, fog: [0x1a1630, 16, 135], sky: 0x0a0818, bounds: 0, killY: -20, sound: "wind", desat: 0
  });
});

/* =========================================================================
   10. THE THEATRE OF COATS — you are on stage, in the light. Every seat in
   the house is taken by a coat with no one inside, and as you move, very
   slowly, they turn to follow you. The exit is at the back of the balcony.
   ========================================================================= */
defineWorld("coat_theatre", { title: "the theatre of coats", tags: ["interior", "uncanny", "stage"], valence: -1, interior: true }, function (P, mood) {
  var K = new World(P, mood, { sky: 0x4a2a2a, gnd: 0x140606 });
  var SY = 1.2, BY = 7.8, red = 0x7a1a20, gold = 0xb08a40, wallC = 0x3a1a1a;
  var ROWS = 12, rowZ = function (k) { return 2.2 + k * 1.75; }, floorY = function (z) { return clamp(z - 1, 0, 24) * (4 / 24); };
  // ---- the house: raked floor in terraces, walls, ceiling, chandelier ----
  K.walk(-12, -2, 12, 26, function (x, z) { return floorY(z); });
  K.box(0, -0.05, -0.5, 24, 0.1, 3, 0x2a1010, { seg: 3 });
  for (var tk = 0; tk < 13; tk++) { var za = 1 + tk * 2, zb = za + 2, ya = floorY(za), yb = floorY(zb); K.box(0, (ya + yb) / 2 - 0.1, (za + zb) / 2, 24, 0.2, Math.hypot(2, yb - ya) + 0.02, 0x3a1416, { rx: -Math.atan2(yb - ya, 2), seg: 4, skip: "ny" }); }
  K.wallX(-12, -2, 26, 0, 13, wallC, { seg: 4 }); K.wallX(12, -2, 26, 0, 13, wallC, { seg: 4 }); K.wallZ(26, -12, 12, 0, 13, mixC(wallC, 0x000000, 0.2), { seg: 4 });
  K.box(0, 13.15, 12, 24.4, 0.3, 28.4, 0x2a1010, { skip: "py", seg: 4 });
  for (var sc = 2; sc < 25; sc += 5.5) for (var sd = -1; sd <= 1; sd += 2) { K.box(sd * 11.8, floorY(sc) + 4, sc, 0.2, 0.5, 0.3, gold, { seg: 0 }); K.sph(sd * 11.65, floorY(sc) + 4.4, sc, 0.18, 0xffd8a0, { emit: 1.6, ws: 6, hs: 4 }); K.light(sd * 11, floorY(sc) + 4.4, sc, 0xffb080, 6, 0.55); }
  var chB = K.batch({ seg: 0, chunk: 0, lit: false }); chB.cyl(0, 0, 0, 1.6, 0.4, 0.8, 0xb08a40, { n: 10, open: true }); for (var cr = 0; cr < 24; cr++) { var ca = cr / 24 * TAU; chB.cone(Math.cos(ca) * (cr % 2 ? 1.5 : 1.0), -0.7 - (cr % 3) * 0.2, Math.sin(ca) * (cr % 2 ? 1.5 : 1.0), 0.08, 0.4, 0xfff0d0, { rx: Math.PI, n: 4, emit: 1.5 }); }
  var chand = chB.mesh(0, 11.4, 12); K.cyl(0, 12.4, 12, 0.02, 0.02, 1.6, 0x3a3a3a, { n: 3 }); K.light(0, 10.6, 12, 0xffe0b0, 12, 0.7);
  // ---- the seats, and the coats in them ----
  var seatB = K.batch({ seg: 0, chunk: 0 });
  var coatPos = [];
  for (var r = 0; r < ROWS; r++) {
    var z = rowZ(r), y = floorY(z);
    for (var side = -1; side <= 1; side += 2) {
      for (var i = 0; i < 7; i++) {
        var x = side * (2.4 + i * 1.2);
        seatB.box(x, y + 0.42, z, 0.95, 0.12, 0.6, red, { skip: "ny" }); seatB.box(x, y + 0.85, z + 0.33, 0.95, 0.85, 0.12, red, { skip: "ny" }); seatB.box(x - 0.5, y + 0.55, z, 0.08, 0.45, 0.6, 0x2a1a14, { skip: "ny" }); seatB.box(x, y + 0.2, z, 0.8, 0.4, 0.4, 0x1a0e0e, { skip: "py,ny,pz" });
        if (rng() < 0.88) coatPos.push({ x: x, y: y + 0.48, z: z, ry: 0, ph: rng() * TAU, front: r });
      }
      K.solid(side * 6, y, z + 0.05, 8.6, 1.3, 0.75);
    }
  }
  // the balcony and its two rows
  K.slab(-12, 18, 12, 26, BY, 0x3a1416, { t: 0.4, skip: "", seg: 4 });
  K.box(-0.7, BY + 0.55, 18, 22.6, 1.1, 0.25, red, { seg: 2 }); K.box(-0.7, BY + 1.12, 18, 22.8, 0.08, 0.35, gold, { seg: 0 });
  K.solid(-0.7, BY, 18, 22.6, 1.4, 0.3);
  for (var br = 0; br < 2; br++) { var bz = 20.5 + br * 2.2; for (var bi = 0; bi < 14; bi++) { var bx = -8.6 + bi * 1.25; if (Math.abs(bx) < 1.2) continue; seatB.box(bx, BY + 0.42, bz, 0.95, 0.12, 0.6, red); seatB.box(bx, BY + 0.85, bz + 0.33, 0.95, 0.85, 0.12, red); if (rng() < 0.85) coatPos.push({ x: bx, y: BY + 0.48, z: bz, ry: 0, ph: rng() * TAU, front: 20 }); } K.solid(-4.6, BY, bz + 0.05, 8.2, 1.3, 0.75); K.solid(5.1, BY, bz + 0.05, 7.8, 1.3, 0.75); }
  K.stairs(11.1, 5.5, "+z", 12.5, 1.4, floorY(5.5), BY, 0x4a1a1a, { solid: true });
  K.light(0, BY + 2.5, 22, 0xffa070, 9, 0.6);
  K.door(0, BY, 25.82, Math.PI, K.onward(), { light: 0xc8ffd8, sign: 0x40d070, col: 0x4a1a1a, open: 0.3, glow: 1.3 });
  // coats: one geometry, many copies, all very slowly turning toward you
  var cb = K.batch({ seg: 0, chunk: 0, lit: false });
  cb.box(0, 0.62, 0.02, 0.56, 0.14, 0.26, 0xffffff, { skip: "ny" }); cb.box(0, 0.25, 0.0, 0.5, 0.65, 0.24, 0xe8e8e8, { skip: "py,ny" }); cb.box(0, -0.05, -0.12, 0.46, 0.12, 0.42, 0xd8d8d8, { skip: "ny" });
  cb.box(-0.32, 0.3, -0.08, 0.11, 0.55, 0.13, 0xdddddd, { rx: 0.35, skip: "py" }); cb.box(0.32, 0.3, -0.08, 0.11, 0.55, 0.13, 0xdddddd, { rx: 0.35, skip: "py" });
  cb.quad(-0.12, 0.66, -0.12, 0.16, 0.18, 0xf4f4f4, { ry: Math.PI - 0.5, rx: 0.3 }); cb.quad(0.12, 0.66, -0.12, 0.16, 0.18, 0xf4f4f4, { ry: Math.PI + 0.5, rx: 0.3 });
  cb.box(0, 0.76, 0.02, 0.02, 0.14, 0.02, 0x8a8a8a, { skip: "ny" });
  var coatG = cb.geometry(), coats = K.instanced(coatG, coatPos.length, vcMat({}));
  var _o = new THREE.Object3D(), coatCols = [0x3a3a44, 0x5a4a3a, 0x2a2a2a, 0x6a5a5a, 0x3a4a5a, 0x5a3a3a, 0x8a7a6a];
  for (var ci = 0; ci < coatPos.length; ci++) { var cp = coatPos[ci]; _o.position.set(cp.x, cp.y, cp.z); _o.rotation.set(0, 0, 0); _o.updateMatrix(); coats.setMatrixAt(ci, _o.matrix); coats.setColorAt(ci, C(pick(coatCols)).multiplyScalar(rr(0.6, 1.0))); }
  // ---- the stage ----
  K.block(-9, -12, 9, -2, SY, 0x3a2418, { seg: 3 });
  var planks = K.batch({ seg: 0 }); for (var pk = -8.5; pk < 9; pk += 1.0) planks.box(pk, SY + 0.005, -7, 0.02, 0.01, 10, 0x2a1810);
  K.stairs(0, -2.0, "+z", 2.2, 3.0, SY, 0, 0x3a2418);
  pushSolidBox(-5.25, -2.05, 3.75, 0.1, 0, -0.3, SY - 0.56); pushSolidBox(5.25, -2.05, 3.75, 0.1, 0, -0.3, SY - 0.56);
  for (var ft = -8.6; ft <= 8.6; ft += 0.8) { if (Math.abs(ft) < 1.6) continue; K.box(ft, SY + 0.06, -2.25, 0.3, 0.12, 0.16, 0xfff0c0, { seg: 0, emit: 1.8 }); }
  for (var fl = -1; fl <= 1; fl++) K.light(fl * 6, SY + 0.4, -2.6, 0xffe0a0, 7, 0.9);
  // the proscenium, the curtains, the painted night behind you
  K.box(-10.5, 6.5, -2, 3, 13, 0.6, wallC, { seg: 3, solid: true }); K.box(10.5, 6.5, -2, 3, 13, 0.6, wallC, { seg: 3, solid: true }); K.box(0, 10.3, -2, 18, 5.4, 0.6, wallC, { seg: 3 });
  K.box(0, 7.55, -1.65, 18.2, 0.25, 0.12, gold, { seg: 0 }); K.box(-9.05, 3.8, -1.65, 0.25, 7.6, 0.12, gold, { seg: 0 }); K.box(9.05, 3.8, -1.65, 0.25, 7.6, 0.12, gold, { seg: 0 });
  K.wallX(-9, -12, -2, 0, 13, 0x1a0a0a); K.wallX(9, -12, -2, 0, 13, 0x1a0a0a); K.wallZ(-12, -9, 9, 0, 13, 0x1a0a0a);
  var valB = K.batch({ seg: 0, chunk: 0 }); for (var vf = -8.5; vf <= 8.5; vf += 0.5) valB.box(vf, 7.0, -2.3, 0.5, 1.1, 0.2, vf % 1 ? red : mixC(red, 0x000000, 0.25), { ry: (vf * 2) % 2 ? 0.25 : -0.25 }); valB.flush();
  var curt = [];
  for (var cs = -1; cs <= 1; cs += 2) { var cbt = K.batch({ seg: 0, chunk: 0 }); for (var fo = 0; fo < 6; fo++) cbt.box(-cs * fo * 0.34, -3.15, 0, 0.36, 6.3, 0.18, fo % 2 ? red : mixC(red, 0x000000, 0.25), { ry: fo % 2 ? 0.3 : -0.3 }); var cm = cbt.mesh(cs * 8.7, SY + 6.3, -2.45); if (cm) curt.push({ m: cm, side: cs, x0: cs * 8.7, close: 0 }); }
  var night = K.tex(function (x, W, Hh) { var g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, "#0a0c22"); g.addColorStop(1, "#2a1a3a"); x.fillStyle = g; x.fillRect(0, 0, W, Hh); x.fillStyle = "#f2ead0"; x.beginPath(); x.arc(W * 0.7, Hh * 0.3, 18, 0, 7); x.fill(); x.fillStyle = "#0a0c22"; x.beginPath(); x.arc(W * 0.7 + 8, Hh * 0.3 - 4, 16, 0, 7); x.fill(); for (var i = 0; i < 40; i++) { x.fillStyle = "rgba(255,250,230," + Math.random() + ")"; x.fillRect(Math.random() * W, Math.random() * Hh * 0.7, 2, 2); } x.fillStyle = "#14102a"; for (var h = 0; h < W; h += 16) { x.beginPath(); x.arc(h + 8, Hh, 14 + (h % 32 ? 4 : 0), Math.PI, 0); x.fill(); } }, 256, 128, true);
  K.picture(0, 5.5, -11.8, 17.6, 9, night, { bright: 1.0 });
  var waves = []; for (var wv = 0; wv < 3; wv++) { var wb = K.batch({ seg: 0, chunk: 0 }); for (var wx = -8; wx <= 8; wx += 1.6) wb.cone(wx, 0, 0, 0.8, 0.9, mixC(0x2a3a6a, 0x5a7aaa, wv / 3), { n: 3, sz: 0.1 }); var wm = wb.mesh(0, SY + 0.45, -10.8 + wv * 0.9); if (wm) waves.push([wm, wv]); }
  K.light(0, 6, -9, 0x6a6aa0, 9, 0.5);
  // the follow-spot, from the back of the house, on you
  var spotM = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 1.3, 1, 14, 1, true), vcMat({ transparent: true, opacity: 0.09, additive: true, side: THREE.DoubleSide }));
  spotM.geometry.translate(0, -0.5, 0); spotM.geometry.rotateX(-Math.PI / 2);
  spotM.geometry.setAttribute("aCol", new THREE.Float32BufferAttribute(new Float32Array(spotM.geometry.attributes.position.count * 3).fill(1), 3));
  spotM.material.uniforms.uColor.value = C(0xfff0d0); buildGroup.add(spotM);
  var SPOT = new THREE.Vector3(0, BY + 4.5, 24.5);
  K.box(0, BY + 4.4, 24.8, 0.6, 0.5, 0.9, 0x2a2a2a, { seg: 0 }); K.disc(0, BY + 4.4, 24.34, 0.22, 0xfff4e0, { ry: Math.PI, emit: 2.2 });
  var spotPool = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16), objMat({ color: 0xfff0d0, bright: 1.1, transparent: true, opacity: 0.16, depthWrite: false })); spotPool.rotation.x = -Math.PI / 2; buildGroup.add(spotPool);
  // ---- motion ----
  var rustle = 4, applause = 0;
  K.anim(function (dt, t) {
    for (var k = 0; k < coatPos.length; k++) {
      var cp = coatPos[k], want = clamp(Math.atan2(-(pos.x - cp.x), -(pos.z - cp.z)), -0.55, 0.55);
      cp.ry += (want - cp.ry) * Math.min(1, dt * 0.35);
      var br = 1 + Math.sin(t * 0.9 + cp.ph) * 0.02;
      _o.position.set(cp.x, cp.y, cp.z); _o.rotation.set(0, cp.ry, 0); _o.scale.set(1, br, 1); _o.updateMatrix(); coats.setMatrixAt(k, _o.matrix);
    }
    coats.instanceMatrix.needsUpdate = true; _o.scale.set(1, 1, 1);
    var eye = camera.position, dx = eye.x - SPOT.x, dy = pos.y - SPOT.y, dz = eye.z - SPOT.z, len = Math.hypot(dx, dy, dz);
    spotM.position.copy(SPOT); spotM.scale.set(1, 1, len); spotM.lookAt(pos.x, pos.y, pos.z);
    spotM.material.uniforms.uOpacity.value = 0.09 * clamp((len - 7) / 9, 0, 1);
    spotPool.position.set(pos.x, pos.y + 0.03, pos.z);
    for (var c2 = 0; c2 < curt.length; c2++) { var cu = curt[c2]; cu.m.position.x = cu.x0 - cu.side * cu.close * 3.2; cu.m.rotation.z = Math.sin(t * 0.6 + c2) * 0.01; cu.close = Math.max(0, cu.close - dt * 0.02); }
    for (var w = 0; w < waves.length; w++) waves[w][0].position.x = Math.sin(t * 0.5 + waves[w][1] * 1.7) * 0.6;
    if (chand) chand.rotation.y = Math.sin(t * 0.2) * 0.05;
    rustle -= dt; if (rustle <= 0) { rustle = applause > 0 ? rr(0.05, 0.12) : rr(4, 9); if (audio.ctx) audio.creature(applause > 0 ? "rustle" : pick(["rustle", "sigh"]), rr(-0.8, 0.8), rr(0.6, 1.0)); }
    applause = Math.max(0, applause - dt);
  });
  // ---- interactables ----
  var mark = new THREE.Group(); var mb = K.batch({ seg: 0, chunk: 0, parent: mark }); mb.box(0, 0.01, 0, 0.6, 0.01, 0.08, 0xe8e0c0, { ry: 0.785, emit: 1.1 }); mb.box(0, 0.01, 0, 0.6, 0.01, 0.08, 0xe8e0c0, { ry: -0.785, emit: 1.1 });
  mark.position.set(0, SY, -4.2); buildGroup.add(mark); mb.mesh(0, 0, 0, mark);
  K.ix(mark, 0, -4.2, 1.8, [
    "your mark. your line is blank. the coats wait, patiently. they would forgive anything.",
    "you say something. it doesn't matter what. a sleeve lifts a little, the way a hand might.",
    "you take a bow. somewhere in the dark, a coat slips from a seat and folds itself."
  ], { y: SY, on: function (e, i) { if (i === 2) applause = 2.5; } });
  var front = coatPos.filter(function (c) { return c.front === 0; })[0];
  if (front) {
    var fHot = new THREE.Object3D(); fHot.position.set(front.x, front.y + 0.4, front.z);
    K.ix(fHot, front.x, front.z - 0.9, 2.2, [
      "a coat you lost years ago. the pocket still holds a ticket stub for tonight.",
      "it is warm, as if someone has only just stood up out of it.",
      "the ticket says: row a, seat yours. admit one."
    ], { glow: false, y: front.y, on: function () { if (audio.ctx) audio.creature("rustle", 0, 0.9); } });
  }
  var rope = new THREE.Group(); var rb = K.batch({ seg: 0, chunk: 0, parent: rope }); rb.cyl(0, 2.2, 0, 0.04, 0.04, 4.4, 0xc8a870, { n: 5 }); rb.sph(0, 0.2, 0, 0.1, 0xb08a40, { ws: 6, hs: 4 });
  rope.position.set(-8.4, SY, -3.0); buildGroup.add(rope); rb.mesh(0, 0, 0, rope);
  K.ix(rope, -8.0, -3.0, 2.0, [
    "you pull the rope. the curtain falls a little. the coats applaud with their empty sleeves.",
    "again. the sound is like rain on a great many shoulders.",
    "the curtain rises by itself. they want you to stay."
  ], { y: SY, on: function () { applause = 2.6; for (var q = 0; q < curt.length; q++) curt[q].close = Math.min(1, curt[q].close + 0.4); } });
  return K.finish({
    spawn: { x: 0, y: SY, z: -5.2, yaw: Math.PI }, fog: [0x120808, 8, 56], sky: 0x050202, bounds: 0, killY: -8, sound: "choir", desat: 0.05
  });
});

/* =========================================================================
   11. THE ATTIC OF BREATHING TOYS — up through the hatch, under the rafters,
   the toys you forgot are asleep, and breathing softly. The train still goes
   round. Climb the trunks to the beam that leads to the round moon window.
   ========================================================================= */
defineWorld("breathing_toy_attic", { title: "the attic of breathing toys", tags: ["interior", "childhood", "night"], valence: 1, interior: true }, function (P, mood) {
  var K = new World(P, mood, { sky: 0x8a849a, gnd: 0x3a3038, dir: [0, 0.5, 1], dirCol: 0x3a4060 });
  var HW = 5.5, L = 14, RIDGE = 6, slope = (RIDGE - 0.6) / 6, wood = 0x6a4a34, dark = 0x3a2a20;
  function roofY(x) { return RIDGE - Math.abs(x) * slope; }
  var plank = K.tex(function (x, W) { x.fillStyle = "#7a5a40"; x.fillRect(0, 0, W, W); for (var i = 0; i < 4; i++) { x.fillStyle = ["#6a4a34", "#7e5c42", "#735238", "#684830"][i]; x.fillRect(0, i * W / 4, W, W / 4 - 1); x.fillStyle = "rgba(0,0,0,0.3)"; x.fillRect(0, (i + 1) * W / 4 - 1, W, 1); } }, 32);
  var PB = K.batch({ mat: vcMat({ map: plank }), tile: 1.6, seg: 2 });
  // floor, with the hatch you came up through
  K.slab(-HW, -11.4, HW, L, 0, 0xffffff, { batch: PB, tile: 1.6 });
  K.slab(-HW, -L, -0.6, -11.4, 0, 0xffffff, { batch: PB, tile: 1.6 }); K.slab(0.6, -L, HW, -11.4, 0, 0xffffff, { batch: PB, tile: 1.6 }); K.slab(-0.6, -L, 0.6, -12.6, 0, 0xffffff, { batch: PB, tile: 1.6 });
  K.box(-0.62, -1, -12, 0.06, 2, 1.2, dark, { seg: 0 }); K.box(0.62, -1, -12, 0.06, 2, 1.2, dark, { seg: 0 }); K.box(0, -1, -12.62, 1.2, 2, 0.06, dark, { seg: 0 }); K.box(0, -1, -11.38, 1.2, 2, 0.06, dark, { seg: 0 });
  for (var lr = 0; lr < 4; lr++) K.box(0, -0.2 - lr * 0.4, -12.5, 0.9, 0.05, 0.05, 0x8a6a4a, { seg: 0 });
  K.box(0, -2.4, -12, 1.2, 0.05, 1.2, 0xffd8a0, { seg: 0, emit: 1.3 });
  portalObj(0, -12, 0.35, -3, 0.25, K.onward(), { b: -0.2, e: -0.1 }, "fall");
  // the roof: two slopes, rafters, collar beams, knee walls
  var RB = K.batch({ mat: vcMat({ map: plank, side: THREE.DoubleSide }), tile: 1.6, seg: 3 });
  var ang = Math.atan2(RIDGE - 0.6, 6), slen = Math.hypot(6, RIDGE - 0.6);
  RB.box(-3, (RIDGE + 0.6) / 2 + 0.12, 0, slen + 0.4, 0.2, 2 * L + 0.4, 0xc8c0b8, { rz: ang, tile: 1.6 }); RB.box(3, (RIDGE + 0.6) / 2 + 0.12, 0, slen + 0.4, 0.2, 2 * L + 0.4, 0xc8c0b8, { rz: -ang, tile: 1.6 });
  for (var rz = -L + 0.7; rz < L; rz += 1.4) {
    K.box(-3, (RIDGE + 0.6) / 2 - 0.05, rz, slen, 0.22, 0.14, dark, { rz: ang, seg: 0 }); K.box(3, (RIDGE + 0.6) / 2 - 0.05, rz, slen, 0.22, 0.14, dark, { rz: -ang, seg: 0 });
    K.box(0, 3.55, rz, 5.2, 0.2, 0.16, dark, { seg: 0 });
  }
  K.box(0, RIDGE - 0.1, 0, 0.2, 0.25, 2 * L, dark, { seg: 0 });
  K.wallX(-5.0, -L, L, 0, 1.5, mixC(wood, 0x000000, 0.2), { t: 0.12 }); K.wallX(5.0, -L, L, 0, 1.5, mixC(wood, 0x000000, 0.2), { t: 0.12 });
  // gables: strips that narrow toward the ridge, a round window at the far end
  for (var gs = 0; gs < 12; gs++) {
    var y0 = gs * 0.5, y1 = y0 + 0.5, hw = Math.max(0.1, (RIDGE - y1) / slope);
    K.box(0, (y0 + y1) / 2, -L - 0.1, 2 * hw + 0.6, 0.5, 0.2, mixC(wood, 0x000000, 0.1), { seg: 0 });
    if (y1 <= 3.5 || y0 >= 5.3) K.box(0, (y0 + y1) / 2, L + 0.1, 2 * hw + 0.6, 0.5, 0.2, mixC(wood, 0x000000, 0.1), { seg: 0 });
    else { var side = (2 * hw + 0.6 - 1.9) / 2; if (side > 0.02) { K.box(-(0.95 + side / 2), (y0 + y1) / 2, L + 0.1, side, 0.5, 0.2, mixC(wood, 0x000000, 0.1), { seg: 0 }); K.box(0.95 + side / 2, (y0 + y1) / 2, L + 0.1, side, 0.5, 0.2, mixC(wood, 0x000000, 0.1), { seg: 0 }); } }
  }
  K.solid(0, 0, -L - 0.1, 2 * HW, 6, 0.3); K.solid(0, 0, L + 0.1, 2 * HW, 3.5, 0.3);
  K.torus(0, 4.4, L - 0.02, 0.92, 0.12, 0x8a6a4a, { rs: 5, ts: 18 }); K.box(0, 4.4, L - 0.02, 0.06, 1.8, 0.06, 0x8a6a4a, { seg: 0 }); K.box(0, 4.4, L - 0.02, 1.8, 0.06, 0.06, 0x8a6a4a, { seg: 0 });
  var nightT = K.tex(function (x, W, Hh) { var g = x.createRadialGradient(W * 0.6, Hh * 0.4, 2, W / 2, Hh / 2, W * 0.7); g.addColorStop(0, "#f8f8ff"); g.addColorStop(0.08, "#d8e0ff"); g.addColorStop(0.2, "#3a4a7a"); g.addColorStop(1, "#0a0c22"); x.fillStyle = g; x.fillRect(0, 0, W, Hh); for (var i = 0; i < 30; i++) { x.fillStyle = "rgba(255,255,255," + Math.random() + ")"; x.fillRect(Math.random() * W, Math.random() * Hh, 1, 1); } }, 64, 64, true);
  K.picture(0, 4.4, L + 1.2, 6, 6, nightT, { ry: Math.PI, bright: 1.3 });
  K.light(0, 4.4, L - 1, 0xb8c8ff, 13, 1.4); K.light(0, 1.0, L - 7, 0x9ab0ff, 7, 0.7); K.light(0, 0.6, -12, 0xffc890, 5, 0.8);
  var beam = K.batch({ seg: 0, chunk: 0, lit: false, mat: vcMat({ transparent: true, opacity: 0.09, additive: true, side: THREE.DoubleSide }) });
  beam.box(0, 2.2, L - 3.7, 1.7, 1.7, 8.2, 0xc8d8ff, { rx: -Math.atan2(4.4, 7.4) * 0.72, emit: 1 });
  K.motes(70, -1.2, 1.2, 0.2, 4.6, L - 8, L - 0.5, 0xd8e4ff, 0.05, "drift", 0.2);
  K.motes(60, -4.5, 4.5, 0.3, 4.5, -L + 1, L - 1, 0xffe8c8, 0.04, "drift", 0.15);
  // fairy lights strung along a rafter
  for (var fl = 0; fl < 18; fl++) { var fx = -4 + fl * 0.47, fz = 1.4 + Math.sin(fl * 0.7) * 0.15; K.sph(fx, roofY(fx) - 0.45 - Math.sin(fl / 17 * Math.PI) * 0.4, fz, 0.05, [0xffd890, 0xff9aa8, 0xa8d8ff, 0xc8ffa8][fl % 4], { emit: 2, ws: 4, hs: 3 }); }
  K.light(-2.5, 3.2, 1.4, 0xffc890, 8, 0.9); K.light(2.5, 3.2, 1.4, 0xffb8c8, 8, 0.8); K.light(0, 3.0, -6, 0xffd8b0, 8, 0.6); K.light(0, 3.0, 8, 0xd8c8ff, 8, 0.6);
  // the old lamp on a crate
  K.box(-3.6, 0.35, -1, 0.8, 0.7, 0.8, 0x8a6a4a, { seg: 0, solid: true }); K.cyl(-3.6, 1.0, -1, 0.04, 0.04, 0.6, 0x3a3a3a, { n: 4 }); K.geo(new THREE.CylinderGeometry(0.15, 0.32, 0.3, 8, 1, true), -3.6, 1.35, -1, 0xd8a868, { batch: K.batch({ seg: 0, chunk: 0, mat: vcMat({ side: THREE.DoubleSide }) }) });
  K.sph(-3.6, 1.3, -1, 0.08, 0xfff0c0, { emit: 2, ws: 5, hs: 4 }); K.light(-3.6, 1.4, -1, 0xffc070, 9, 1.5);
  // the climb: a trunk, boxes, a dresser, a crate, a hatbox, then the plank over the collar beams
  K.block(2.0, -5.6, 3.8, -4.4, 0.55, 0x5a3a2a); K.box(2.9, 0.56, -5.0, 1.7, 0.02, 0.1, 0xb89040, { seg: 0 }); K.box(2.9, 0.3, -5.61, 0.2, 0.2, 0.02, 0xb89040, { seg: 0 });
  K.block(1.9, -4.5, 3.4, -3.5, 1.1, 0x4a5a7a); K.box(2.65, 1.12, -4.0, 0.4, 0.06, 0.08, 0x2a2a2a, { seg: 0 });
  K.block(1.5, -3.6, 3.0, -2.7, 1.65, 0xa88a6a);
  K.block(0.7, -2.8, 2.2, -1.8, 2.2, 0x6a4a3a); for (var dwr = 0; dwr < 3; dwr++) K.box(1.45, 0.4 + dwr * 0.65, -2.81, 1.3, 0.5, 0.02, 0x7a5a48, { seg: 0 });
  K.block(-0.1, -2.6, 1.4, -1.5, 2.75, 0xb8a888); K.box(0.65, 1.4, -2.61, 1.3, 2.4, 0.02, 0xa89878, { seg: 0 });
  K.block(-0.4, -2.4, 0.8, -1.6, 3.3, 0xc87a8a, { base: 2.75 });
  K.slab(-0.6, -2.0, 0.6, L - 0.2, 3.75, 0x8a6a4a, { t: 0.1, skip: "" });
  K.slab(-1.3, L - 1.6, 1.3, L - 0.2, 3.75, 0x8a6a4a, { t: 0.1, skip: "" });
  pushBoxLink(0, L - 0.15, 0.9, 0.3, 0, 3.6, 5.5, { b: 0.7, e: 0.0 }, "window"); linkables[linkables.length - 1].target = K.onward();
  // ---- the toys ----
  var anims = [];
  // a rocking horse
  var horse = new THREE.Group(); horse.position.set(3.0, 0, 0.6); horse.rotation.y = -0.4; buildGroup.add(horse);
  var hb = K.batch({ seg: 0, chunk: 0, parent: horse });
  for (var rk = -1; rk <= 1; rk += 2) for (var rs = -1; rs <= 1; rs++) hb.box(rk * 0.2, 0.07 + Math.abs(rs) * 0.07, rs * 0.46, 0.06, 0.05, 0.5, 0x8a3a2a, { rx: -rs * 0.3 });
  hb.box(0, 0.1, 0.0, 0.4, 0.04, 0.06, 0x8a3a2a);
  hb.box(0, 0.75, 0, 0.35, 0.4, 1.1, 0xe8e0d0); hb.box(0, 1.05, 0.55, 0.22, 0.45, 0.25, 0xe8e0d0, { rx: -0.4 }); hb.box(0, 1.25, 0.75, 0.2, 0.2, 0.4, 0xe8e0d0); hb.box(0, 1.15, 0.45, 0.05, 0.4, 0.3, 0x3a2a1a, { rx: -0.4 });
  for (var hl = 0; hl < 4; hl++) hb.box(hl % 2 ? 0.12 : -0.12, 0.45, hl < 2 ? 0.4 : -0.4, 0.07, 0.45, 0.07, 0xe8e0d0);
  hb.box(0, 0.98, -0.05, 0.4, 0.06, 0.4, 0xc83a3a); hb.mesh(0, 0, 0, horse);
  pushSolidCyl(3.0, 0.6, 0.7, 0, 1.4);
  anims.push(function (t) { horse.rotation.x = Math.sin(t * 0.9) * 0.14; });
  // the train on its round track
  K.torus(-2.6, 0.04, 3.2, 1.6, 0.04, 0x5a5a5a, { rx: Math.PI / 2, ts: 24 }); K.torus(-2.6, 0.04, 3.2, 1.35, 0.04, 0x5a5a5a, { rx: Math.PI / 2, ts: 24 });
  var train = new THREE.Group(); train.position.set(-2.6, 0, 3.2); buildGroup.add(train);
  var tb = K.batch({ seg: 0, chunk: 0, parent: train });
  for (var car = 0; car < 4; car++) { var ca = car * 0.42, tx = Math.cos(ca) * 1.48, tz = Math.sin(ca) * 1.48, cc = [0x3a6ad8, 0xd83a3a, 0x3aa85a, 0xd8b03a][car]; tb.box(tx, 0.18, tz, 0.26, 0.22, 0.42, cc, { ry: -ca }); if (car === 0) { tb.cyl(tx, 0.38, tz, 0.05, 0.05, 0.2, 0x2a2a2a, { n: 6 }); tb.sph(tx, 0.22, tz, 0.03, 0xffe8a0, { emit: 2, ws: 4, hs: 3 }); } }
  tb.mesh(0, 0, 0, train);
  anims.push(function (t) { train.rotation.y = -t * 0.35; });
  // stuffed animals along the knee walls, breathing in their sleep
  var plush = [], spots = [[-4.4, -8.5, 0], [-4.4, -5.8, 1], [-4.3, 6.2, 0], [4.3, 2.3, 1], [4.4, 8.6, 0], [-4.4, 10.8, 1], [4.3, -6.4, 0]];
  for (var pi = 0; pi < spots.length; pi++) {
    var sp = spots[pi], pg = new THREE.Group(); pg.position.set(sp[0], 0, sp[1]); pg.rotation.y = sp[0] < 0 ? Math.PI / 2 : -Math.PI / 2; buildGroup.add(pg);
    var pb = K.batch({ seg: 0, chunk: 0, parent: pg }), fur = [0xb88a5a, 0xd8c8c0, 0x8a6a8a, 0xc8a070, 0x9ab0c8][pi % 5], rab = sp[2];
    pb.sph(0, 0.35, 0, 0.32, fur, { ws: 8, hs: 6, sy: 1.1 }); pb.sph(0, 0.85, 0.05, 0.24, fur, { ws: 8, hs: 6 });
    if (rab) { pb.box(-0.09, 1.2, 0, 0.08, 0.36, 0.05, fur, { rz: 0.15 }); pb.box(0.09, 1.2, 0, 0.08, 0.36, 0.05, fur, { rz: -0.15 }); }
    else { pb.sph(-0.17, 1.03, 0, 0.08, fur, { ws: 5, hs: 4 }); pb.sph(0.17, 1.03, 0, 0.08, fur, { ws: 5, hs: 4 }); }
    pb.sph(-0.08, 0.9, 0.23, 0.03, 0x1a1a1a, { ws: 4, hs: 3 }); pb.sph(0.08, 0.9, 0.23, 0.03, 0x1a1a1a, { ws: 4, hs: 3 }); pb.sph(0, 0.82, 0.27, 0.04, 0x5a3a3a, { ws: 4, hs: 3 });
    pb.sph(-0.24, 0.3, 0.2, 0.1, fur, { ws: 5, hs: 4 }); pb.sph(0.24, 0.3, 0.2, 0.1, fur, { ws: 5, hs: 4 });
    var pm = pb.mesh(0, 0, 0, pg); plush.push({ m: pm, g: pg, ph: rng() * TAU, x: sp[0], z: sp[1] });
  }
  anims.push(function (t) { for (var k = 0; k < plush.length; k++) { var p = plush[k]; if (!p.m) continue; var b = Math.sin(t * 0.8 + p.ph); p.m.scale.set(1 + b * 0.03, 1 + b * 0.045, 1 + b * 0.03); } });
  // the dollhouse, every window lit
  var DH = K.batch({ seg: 0, chunk: 0 });
  DH.box(3.5, 0.6, 6.2, 1.6, 1.2, 1.0, 0xe8d8c8); DH.cone(3.5, 1.5, 6.2, 1.25, 0.65, 0x8a3a3a, { n: 4, ry: Math.PI / 4, sz: 0.75 });
  for (var dw = 0; dw < 4; dw++) DH.box(3.0 + (dw % 2) * 1.0, 0.35 + Math.floor(dw / 2) * 0.5, 5.68, 0.22, 0.2, 0.02, 0xffd890, { emit: 1.8 });
  DH.box(3.5, 0.2, 5.68, 0.2, 0.32, 0.02, 0x6a4a3a);
  K.solid(3.5, 0, 6.2, 1.7, 1.6, 1.1); K.light(3.5, 0.6, 5.2, 0xffd890, 2.2, 0.8);
  // music box with its dancer
  K.block(-4.2, -6.6, -3.0, -5.4, 0.55, 0x5a3a2a);
  K.box(-3.6, 0.7, -6.0, 0.5, 0.3, 0.4, 0x8a5a7a, { seg: 0 }); K.box(-3.6, 0.95, -6.21, 0.5, 0.3, 0.02, 0x8a5a7a, { seg: 0, rx: 0.4 });
  var dancer = new THREE.Group(); dancer.position.set(-3.6, 0.85, -6.0); buildGroup.add(dancer);
  var dnb = K.batch({ seg: 0, chunk: 0, parent: dancer }); dnb.cone(0, 0.08, 0, 0.08, 0.1, 0xf8e8f0, { n: 8, rx: Math.PI }); dnb.box(0, 0.17, 0, 0.03, 0.12, 0.03, 0xf8e8f0); dnb.sph(0, 0.25, 0, 0.025, 0xf0d8c8, { ws: 4, hs: 3 }); dnb.box(0, 0.2, 0, 0.16, 0.01, 0.01, 0xf8e8f0); dnb.mesh(0, 0, 0, dancer);
  anims.push(function (t) { dancer.rotation.y = t * 1.2; });
  // a mobile of stars turning under the ridge
  var mobile = new THREE.Group(); mobile.position.set(0, 5.3, 1.2); buildGroup.add(mobile);
  var mob = K.batch({ seg: 0, chunk: 0, lit: false, parent: mobile }); mob.box(0, 0, 0, 1.4, 0.02, 0.02, 0x8a6a4a); mob.box(0, -0.4, 0, 0.02, 0.02, 1.0, 0x8a6a4a);
  for (var st = 0; st < 5; st++) { var sa = st / 5 * TAU, sx = Math.cos(sa) * 0.65, sz = Math.sin(sa) * 0.5; mob.box(sx, -0.25 - (st % 2) * 0.4, sz, 0.005, 0.5, 0.005, 0xc8c8c8); mob.geo(new THREE.OctahedronGeometry(0.1, 0), sx, -0.55 - (st % 2) * 0.4, sz, 0xffe8a0, { sz: 0.4, emit: 1.6 }); }
  mob.sph(0, -0.9, 0, 0.12, 0xf0f0ff, { ws: 6, hs: 5, emit: 1.4 }); mob.mesh(0, 0, 0, mobile);
  anims.push(function (t) { mobile.rotation.y = t * 0.18; });
  // the jack-in-the-box, waiting
  K.box(-2.2, 0.25, 9.0, 0.5, 0.5, 0.5, 0xd84a3a, { seg: 0, solid: true }); K.box(-2.2, 0.25, 9.26, 0.4, 0.4, 0.02, 0xffd84a, { seg: 0 });
  var jack = new THREE.Group(); jack.position.set(-2.2, 0.5, 9.0); buildGroup.add(jack);
  var jb = K.batch({ seg: 0, chunk: 0, parent: jack }); for (var sp2 = 0; sp2 < 5; sp2++) jb.torus(0, sp2 * 0.1 + 0.05, 0, 0.1, 0.015, 0xc8c8c8, { rx: Math.PI / 2, ts: 8 }); jb.sph(0, 0.6, 0, 0.14, 0xf0e0d0, { ws: 6, hs: 5 }); jb.cone(0, 0.8, 0, 0.12, 0.22, 0x3a6ad8, { n: 6 }); jb.mesh(0, 0, 0, jack);
  jack.scale.y = 0.02; var jackT = rr(10, 18), jackUp = 0;
  anims.push(function (t, dt) { jackT -= dt; if (jackT <= 0) { jackT = rr(14, 26); jackUp = 3; if (audio.ctx && Math.hypot(pos.x + 2.2, pos.z - 9) < 10) audio.creature("squeak", clamp((-2.2 - pos.x) / 8, -1, 1), 0.8); } jackUp = Math.max(0, jackUp - dt); var tgt = jackUp > 0 ? 1 : 0.02; jack.scale.y += (tgt - jack.scale.y) * Math.min(1, dt * (jackUp > 0 ? 14 : 1.5)); });
  // sheets over furniture, boxes, a little chair
  K.box(-3.6, 0.6, 9.6, 1.4, 1.2, 1.0, 0xe8e4dc, { seg: 0, solid: true }); K.box(-3.6, 1.22, 9.6, 1.5, 0.06, 1.1, 0xf0ece4, { seg: 0 });
  K.box(3.6, 0.9, -10.6, 1.2, 1.8, 1.0, 0xe8e4dc, { seg: 0, solid: true }); K.box(3.6, 1.82, -10.6, 1.3, 0.06, 1.1, 0xf0ece4, { seg: 0 });
  for (var bx = 0; bx < 6; bx++) K.box(rr(-4.2, -2.8), 0.25 + bx * 0.0, rr(-10.5, -7.5), rr(0.4, 0.8), 0.5, rr(0.4, 0.7), mixC(0xb89a7a, 0x6a5a4a, rng()), { seg: 0, ry: rr(-0.3, 0.3) });
  K.solid(-3.5, 0, -9, 1.6, 0.6, 3.2);
  K.box(1.2, 0.3, 10.6, 0.5, 0.05, 0.5, 0xd8b8d8, { seg: 0 }); K.box(1.2, 0.55, 10.84, 0.5, 0.5, 0.05, 0xd8b8d8, { seg: 0 }); K.box(1.2, 0.15, 10.6, 0.4, 0.3, 0.4, 0x6a4a5a, { seg: 0, skip: "py,ny" });
  // ---- motion ----
  K.anim(function (dt, t) { for (var k = 0; k < anims.length; k++) anims[k](t, dt); });
  // ---- interactables ----
  var rab0 = plush[1];
  K.ix(rab0.g, rab0.x + 0.8, rab0.z, 2.0, [
    "it's breathing in its sleep. you tuck it in. it sighs.",
    "one ear is worn thin where somebody held it every night.",
    "it smells of a bedroom you haven't been in for years."
  ], { on: function () { if (audio.ctx) audio.creature("sigh", 0, 0.7); } });
  var mbHot = new THREE.Object3D(); mbHot.position.set(-3.6, 0.8, -6.0);
  var notes = [523, 659, 784, 659, 587, 523, 494, 523];
  K.ix(mbHot, -3.0, -6.0, 2.0, [
    "a tune you used to fall asleep to. it still knows the way.",
    "the dancer turns, and turns, and never once gets dizzy.",
    "you wind it again. the whole attic seems to settle."
  ], { glow: false, y: 0.55, on: function () { if (!audio.ctx) return; for (var n = 0; n < notes.length; n++) (function (f, d) { setTimeout(function () { N2.chime(f, 1.4, 0.06, "triangle"); }, d); })(notes[n], n * 380); } });
  var dhHot = new THREE.Object3D(); dhHot.position.set(3.5, 0.6, 5.6);
  K.ix(dhHot, 3.3, 5.0, 2.2, [
    "in the tiny bedroom, a tiny you is asleep. the lights are on in every room, just in case.",
    "someone has left a tiny glass of water by the tiny bed.",
    "you turn off one light. the others stay on, for company."
  ], { glow: false, on: function () { if (audio.ctx) audio.creature("chime", 0.3, 1.2); } });
  return K.finish({
    spawn: { x: 0, y: 0, z: -10.2, yaw: Math.PI }, fog: [0x18121e, 4, 34], sky: 0x06040a, bounds: 0, killY: -6, sound: "night", desat: 0
  });
});

/* =========================================================================
   12. THE VENDING MACHINES AT THE END OF THE WORLD — a hospital corridor at
   night, an alcove with two humming machines and three plastic chairs, and
   then the building simply stops. Beyond is a very slow dawn, and the floor
   goes on in pieces, rising, to a single chair facing the light.
   ========================================================================= */
defineWorld("vending_alcove_world_end", { title: "the vending machines at the end of the world", tags: ["interior", "dawn", "void"], valence: 1, interior: true }, function (P, mood) {
  var K = new World(P, mood, { sky: 0x8a7a8a, gnd: 0x2a2028, dir: [0, 0.3, -1], dirCol: 0x8a5a5a });
  var H = 3.0, wall = 0xc8d8cc, sun = 0xffc8a8;
  var linoT = K.tex(function (x, W) { noiseFill(x, W, W, "#b8c8b8", 0.2, 500, 1); x.fillStyle = "rgba(0,0,0,0.12)"; x.fillRect(0, 0, W, 1); x.fillRect(0, 0, 1, W); }, 32);
  var LB = K.batch({ mat: vcMat({ map: linoT }), tile: 1.2, seg: 3 });
  // ---- the corridor ----
  K.slab(-2.2, 0, 2.2, 40, 0, 0xffffff, { batch: LB, tile: 1.2 });
  var doorsX = [];
  for (var dz = 4; dz < 38; dz += 6) doorsX.push(dz);
  K.wallX(-2.2, 0, 40, 0, H, wall); K.wallX(2.2, 0, 40, 0, H, wall);
  K.wallZ(40, -2.2, 2.2, 0, H, wall);
  K.box(0, H + 0.15, 20, 4.8, 0.3, 40, 0xd8e4dc, { seg: 3 });
  for (var di = 0; di < doorsX.length; di++) {
    var zl = doorsX[di], zr = zl + 2;
    K.box(-2.02, 1.15, zl, 0.08, 2.3, 1.2, 0x8aa0a0, { seg: 0 }); K.box(-1.97, 1.65, zl + 0.25, 0.02, 0.5, 0.3, (di === 3) ? 0xffe0b0 : 0x1a2428, { seg: 0, emit: di === 3 ? 1.3 : 0 }); K.box(-1.96, 1.05, zl - 0.42, 0.04, 0.06, 0.12, 0xc0c0c0, { seg: 0 });
    K.box(2.02, 1.15, zr, 0.08, 2.3, 1.2, 0x8aa0a0, { seg: 0 }); K.box(1.97, 1.65, zr - 0.25, 0.02, 0.5, 0.3, 0x1a2428, { seg: 0 }); K.box(1.96, 1.05, zr + 0.42, 0.04, 0.06, 0.12, 0xc0c0c0, { seg: 0 });
    if (di === 3) K.light(-1.6, 1.8, zl + 0.25, 0xffe0b0, 3, 0.6);
  }
  for (var hr = -1; hr <= 1; hr += 2) K.box(hr * 2.02, 0.9, 20, 0.06, 0.08, 40, 0x8a6a4a, { seg: 0 });
  var dead = {}; dead[(rng() * 6) | 0] = 1; dead[(rng() * 6) | 0] = 1;
  var tubes = [];
  for (var tz = 37; tz > 1; tz -= 6) { var off = dead[Math.round((37 - tz) / 6)]; K.box(0, H - 0.04, tz, 0.3, 0.07, 1.6, off ? 0x8a8a8a : 0xf0fff8, { seg: 0, emit: off ? 0 : 1.5 }); if (!off) { K.light(0, H - 0.5, tz, 0xe8fff0, 6.5, 0.75); tubes.push(tz); } }
  // gurney, wheelchair, a drip stand, a sign on the floor
  K.box(1.5, 0.75, 28, 0.75, 0.12, 2.0, 0xe8eef0, { seg: 0, solid: true }); K.box(1.5, 0.84, 28, 0.7, 0.06, 1.9, 0xf8f8f8, { seg: 0 }); for (var gl = 0; gl < 4; gl++) K.cyl(gl % 2 ? 1.8 : 1.2, 0.37, gl < 2 ? 27.2 : 28.8, 0.03, 0.03, 0.74, 0xa0a8a8, { n: 4 });
  K.torus(-1.6, 0.35, 18, 0.32, 0.03, 0x3a3a3a, { ry: Math.PI / 2, ts: 10 }); K.torus(-1.6, 0.35, 18.5, 0.32, 0.03, 0x3a3a3a, { ry: Math.PI / 2, ts: 10 }); K.box(-1.6, 0.5, 18.25, 0.5, 0.06, 0.5, 0x3a5a7a, { seg: 0 }); K.box(-1.6, 0.8, 18.5, 0.5, 0.55, 0.05, 0x3a5a7a, { seg: 0 }); K.solid(-1.6, 0, 18.25, 0.7, 0.9, 0.8);
  K.cyl(1.6, 0.9, 12, 0.02, 0.02, 1.8, 0xb0b8b8, { n: 4 }); K.box(1.6, 1.7, 12, 0.18, 0.28, 0.06, 0xd8f0f8, { seg: 0, emit: 0.9 }); K.cyl(1.6, 0.03, 12, 0.25, 0.25, 0.05, 0x8a9090, { n: 5 });
  K.box(0.5, 0.35, 22, 0.4, 0.7, 0.02, 0xffd030, { seg: 0, rx: 0.2 }); K.box(0.5, 0.35, 22.2, 0.4, 0.7, 0.02, 0xffd030, { seg: 0, rx: -0.2 });
  // ---- the alcove ----
  K.slab(-4.2, -6, 4.2, 0, 0, 0xffffff, { batch: LB, tile: 1.2 });
  K.wallX(-4.2, -5.2, 0, 0, H, wall); K.wallX(4.2, -5.2, 0, 0, H, wall);
  K.wallZ(0, -4.2, -2.2, 0, H, wall); K.wallZ(0, 2.2, 4.2, 0, H, wall);
  K.box(0, H + 0.15, -2.6, 8.4, 0.3, 5.2, 0xd8e4dc, { seg: 2 });
  // two vending machines, humming, lighting the alcove
  var vend = [];
  for (var vm = 0; vm < 2; vm++) { var vz = -1.6 - vm * 1.5, vc = vm ? 0x3a6ac8 : 0xc83a4a; K.box(-3.65, 1.0, vz, 0.9, 2.0, 1.3, vc, { seg: 0, solid: true }); K.box(-3.19, 1.25, vz - 0.12, 0.02, 1.3, 0.9, 0xfff8f0, { seg: 0, emit: 1.6 }); for (var row = 0; row < 4; row++) for (var col = 0; col < 3; col++) K.box(-3.17, 0.75 + row * 0.3, vz - 0.42 + col * 0.3, 0.02, 0.16, 0.1, hsl(rng(), 0.6, 0.55), { seg: 0, emit: 1.3 }); K.box(-3.19, 0.35, vz - 0.12, 0.03, 0.2, 0.7, 0x1a1a1a, { seg: 0 }); K.light(-2.6, 1.4, vz, vm ? 0x9ac0ff : 0xffb0b8, 5.5, 1.1); }
  K.box(3.7, 0.55, -1.6, 0.5, 1.1, 0.5, 0xe8e8e8, { seg: 0, solid: true }); K.cyl(3.7, 1.45, -1.6, 0.2, 0.2, 0.6, 0xa8d8f0, { n: 10 });
  var gB = K.batch({ seg: 0, chunk: 0, lit: false, mat: vcMat({ transparent: true, opacity: 0.35 }) }); gB.cyl(3.7, 1.45, -1.6, 0.21, 0.21, 0.62, 0xc8f0ff, { n: 10, emit: 1.1 });
  var bubble = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), objMat({ color: 0xffffff, bright: 1.4 })); bubble.position.set(3.7, 1.18, -1.6); buildGroup.add(bubble);
  for (var ch = -1; ch <= 1; ch++) { K.box(ch * 1.2, 0.44, -4.4, 0.5, 0.06, 0.48, 0xd8a05a, { seg: 0 }); K.box(ch * 1.2, 0.72, -4.16, 0.5, 0.5, 0.05, 0xd8a05a, { seg: 0 }); K.box(ch * 1.2, 0.21, -4.4, 0.44, 0.42, 0.4, 0x6a6a6a, { seg: 0, skip: "py,ny" }); }
  K.solid(0, 0, -4.35, 3.4, 0.9, 0.6);
  K.cyl(3.6, 0.3, -4.6, 0.25, 0.2, 0.6, 0xc8c0b0, { n: 8 }); for (var pl = 0; pl < 7; pl++) K.box(3.6 + rr(-0.3, 0.3), 0.8 + pl * 0.12, -4.6 + rr(-0.3, 0.3), 0.25, 0.02, 0.45, 0x3a6a4a, { seg: 0, ry: rng() * 3, rx: rr(-0.5, 0.5) });
  // ---- where the building stops ----
  var shard = K.batch({ seg: 0 });
  for (var sx = -4.2; sx < 4.2; sx += 0.7) { var d = rr(0.2, 1.0); shard.box(sx + 0.35, -0.15, -6 - d / 2 + 0.05, 0.7, 0.3, d, 0xb8c8b8, { ry: rr(-0.2, 0.2), rz: rr(-0.1, 0.1) }); shard.box(sx + 0.35, H + 0.15, -5.2 - d / 2, 0.7, 0.3, d * 0.8, 0xd8e4dc, { ry: rr(-0.2, 0.2) }); K.walk(sx, -6 - d + 0.3, sx + 0.7, -6, 0); }
  for (var ws = 0; ws < 5; ws++) { shard.box(-4.2, ws * 0.6 + 0.3, -5.4 - rr(0, 0.8), 0.3, 0.6, rr(0.2, 1.0), wall); shard.box(4.2, ws * 0.6 + 0.3, -5.4 - rr(0, 0.8), 0.3, 0.6, rr(0.2, 1.0), wall); }
  shard.box(0, -3, -6.3, 8.6, 6, 0.6, 0x6a6a70, { ry: 0.02 });
  // the dawn: a sun that has been rising for a long time, a sea of cloud beneath
  var sunS = N2.glowSprite(sun, 90); sunS.position.set(0, 2, -170); sunS.material.opacity = 0.6; buildGroup.add(sunS);
  var sunS2 = N2.glowSprite(0xfff0e0, 26); sunS2.position.set(0, 2, -168); sunS2.material.opacity = 0.9; buildGroup.add(sunS2);
  var cloudT = K.tex(function (x, W, Hh) { x.clearRect(0, 0, W, Hh); for (var i = 0; i < 60; i++) { var g = x.createRadialGradient(0, 0, 0, 0, 0, 1); x.save(); x.translate(Math.random() * W, Math.random() * Hh); x.scale(18 + Math.random() * 30, 6 + Math.random() * 8); g.addColorStop(0, "rgba(255,230,230,0.55)"); g.addColorStop(1, "rgba(255,230,230,0)"); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill(); x.restore(); } }, 256, 256, true);
  var clouds = [];
  for (var cl = 0; cl < 3; cl++) { var cm = K.picture(0, -12 - cl * 7, -90, 400, 260, cloudT, { rx: -Math.PI / 2, transparent: true, opacity: 0.6 - cl * 0.15, bright: 1.1 - cl * 0.2, scroll: new THREE.Vector2(0.002 + cl * 0.001, 0.0) }); clouds.push(cm); }
  K.motes(140, -120, 120, -10, 60, -220, -10, 0xfff0f0, 0.25, "drift", 0.02);
  // debris drifting away: chairs, a door, a bed, tiles, a clock
  var debris = [];
  function debrisPiece(kind) {
    var b = K.batch({ seg: 0, chunk: 0 });
    if (kind === 0) { b.box(0, 0.44, 0, 0.5, 0.06, 0.48, 0xd8a05a); b.box(0, 0.72, 0.24, 0.5, 0.5, 0.05, 0xd8a05a); b.box(0, 0.21, 0, 0.44, 0.42, 0.4, 0x6a6a6a); }
    else if (kind === 1) { b.box(0, 0, 0, 1.0, 2.1, 0.08, 0x8aa0a0); b.box(0, 0.4, 0.05, 0.3, 0.5, 0.02, 0x1a2428); }
    else if (kind === 2) { b.box(0, 0.5, 0, 0.9, 0.15, 2.0, 0xf0f4f4); b.box(0, 0.9, -0.95, 0.9, 0.7, 0.06, 0xa0a8a8); }
    else if (kind === 3) { b.box(0, 0, 0, 1.2, 0.08, 1.2, 0xd8e4dc); b.box(0.2, 0.05, 0.1, 0.3, 0.02, 1.0, 0xf0fff8, { emit: 1.2 }); }
    else { b.cyl(0, 0, 0, 0.3, 0.3, 0.06, 0xf0f0e8, { rx: Math.PI / 2, n: 12 }); b.box(0, 0.08, 0.04, 0.02, 0.18, 0.01, 0x1a1a1a); }
    return b.mesh(0, 0, 0);
  }
  for (var db = 0; db < 14; db++) { var dm = debrisPiece(db % 5); if (dm) debris.push({ m: dm, x: rr(-30, 30), y: rr(-8, 12), z: rr(-120, -20), v: rr(0.2, 0.6), ph: rng() * TAU, spin: rr(-0.2, 0.2) }); }
  // the floor goes on, in pieces, rising
  var chunks = [], CN = 10;
  for (var ck = 0; ck < CN; ck++) {
    var cz = -7.6 - ck * 2.45, cx2 = Math.sin(ck * 0.9) * 1.4, cy = 0.33 * (ck + 1), sz = rr(2.4, 2.9);
    var cbk = K.batch({ seg: 0, chunk: 0 });
    cbk.box(0, -0.1, 0, sz, 0.2, sz, 0xb8c8b8, { ry: rr(-0.15, 0.15) }); cbk.cone(0, -0.8, 0, sz * 0.55, 1.2, 0x6a6a70, { rx: Math.PI, n: 5, faceVary: 0.3 });
    if (rng() < 0.4) cbk.box(rr(-0.6, 0.6), 0.02, rr(-0.6, 0.6), 0.3, 0.01, 0.3, 0x8aa0a0);
    var cmesh = cbk.mesh(cx2, cy, cz);
    var rec = { m: cmesh, y: cy, ph: ck * 0.7 };
    (function (r, cx3, cz3, half) { K.walk(cx3 - half, cz3 - half, cx3 + half, cz3 + half, function () { return r.y + Math.sin(tNow() * 0.5 + r.ph) * 0.05; }); })(rec, cx2, cz, sz / 2 - 0.05);
    chunks.push(rec);
  }
  var IZ = -7.6 - CN * 2.45 - 1.9, IY = 0.33 * (CN + 1);
  K.slab(-3, IZ - 3, 3, IZ + 3, IY, 0xb8c8b8, { t: 0.3, skip: "" }); K.cone(0, IY - 1.6, IZ, 4, 2.6, 0x6a6a70, { rx: Math.PI, n: 6, faceVary: 0.3 });
  var lastChair = new THREE.Group(); lastChair.position.set(0, IY, IZ + 0.6); buildGroup.add(lastChair);
  var lcb = K.batch({ seg: 0, chunk: 0, parent: lastChair }); lcb.box(0, 0.44, 0, 0.5, 0.06, 0.48, 0xd8a05a); lcb.box(0, 0.72, 0.24, 0.5, 0.5, 0.05, 0xd8a05a); lcb.box(0, 0.21, 0, 0.44, 0.42, 0.4, 0x6a6a6a); lcb.mesh(0, 0, 0, lastChair);
  K.solid(0, IY, IZ + 0.6, 0.6, 0.9, 0.6);
  K.door(1.8, IY, IZ - 2.2, 0, K.onward(), { light: sun, frame: 0x8aa0a0, col: 0x8aa0a0, open: 0.9, glow: 1.8, nudge: { b: 0.8, e: -0.1 } });
  K.light(0, IY + 2, IZ, sun, 8, 1.0);
  // ---- motion ----
  var hum = 1, bubbleY = 0;
  K.anim(function (dt, t) {
    for (var k = 0; k < chunks.length; k++) { var c = chunks[k]; if (c.m) { c.m.position.y = c.y + Math.sin(t * 0.5 + c.ph) * 0.05; c.m.rotation.z = Math.sin(t * 0.3 + c.ph) * 0.01; } }
    for (var d2 = 0; d2 < debris.length; d2++) { var p = debris[d2]; p.z -= dt * p.v; if (p.z < -160) p.z = -20; p.m.position.set(p.x + Math.sin(t * 0.05 + p.ph) * 3, p.y + Math.sin(t * 0.2 + p.ph) * 0.8, p.z); p.m.rotation.set(t * p.spin, t * p.spin * 0.7 + p.ph, Math.sin(t * 0.1 + p.ph)); }
    bubbleY = (bubbleY + dt * 0.03) % 0.55; bubble.position.y = 1.18 + bubbleY;
    hum -= dt; if (hum <= 0) { hum = rr(2.5, 4); if (audio.ctx && pos.z < 2 && pos.z > -7) audio.creature("hum", -0.5, rr(0.45, 0.55)); }
  });
  // ---- interactables ----
  var vHot = new THREE.Object3D(); vHot.position.set(-3.2, 1.2, -1.6);
  K.ix(vHot, -2.4, -1.6, 2.2, [
    "it gives you a small warm can. the label says: for later.",
    "another. this one says: for the way back.",
    "the machine hums a little louder, pleased to be useful at the end of things."
  ], { glow: false, on: function () { if (audio.ctx) { audio.creature("low", -0.3, 0.9); audio.creature("tick", -0.3, 1.5); } } });
  var cHot = new THREE.Object3D(); cHot.position.set(3.6, 1.4, -1.6);
  K.ix(cHot, 2.9, -1.6, 2.2, [
    "a single bubble rises. it takes a very long time. you wait with it.",
    "it reaches the top. the water settles. you feel, briefly, that you did something.",
    "the water is cold and tastes faintly of morning."
  ], { glow: false, on: function () { bubbleY = 0; if (audio.ctx) audio.creature("squeak", 0.4, 0.6); } });
  K.ix(lastChair, 0, IZ + 1.4, 2.2, [
    "you sit. the world ends slowly, and very gently, like a light someone forgot to turn off.",
    "the sun doesn't move. it is in no hurry. neither are you.",
    "behind you, very far away, a vending machine hums. it will keep you company."
  ], { y: IY, on: function () { if (audio.ctx) N2.chime(392, 3, 0.05, "sine"); } });
  return K.finish({
    spawn: { x: 0, y: 0, z: 37, yaw: 0 }, fog: [0x3a2c3c, 10, 110], sky: 0x4a3446, bounds: 0, killY: -25, sound: "glass", desat: 0
  });
});

/* ---- end of worlds ---- */
