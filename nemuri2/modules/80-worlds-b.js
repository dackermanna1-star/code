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
  var nx = e[8], ny = e[9], nz = e[10], tile = o.tile || 0;
  var q = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  for (var k = 0; k < 6; k++) this._v(e, q[k][0] * hw, q[k][1] * hh, 0, nx, ny, nz, c, em, tile ? (q[k][0] + 1) * hw / tile : (q[k][0] + 1) / 2, tile ? (q[k][1] + 1) * hh / tile : (q[k][1] + 1) / 2);
  if (o.two) { var qb = [[-1, -1], [1, 1], [1, -1], [-1, -1], [-1, 1], [1, 1]]; for (var k2 = 0; k2 < 6; k2++) this._v(e, qb[k2][0] * hw, qb[k2][1] * hh, 0, -nx, -ny, -nz, c, em, (qb[k2][0] + 1) / 2, (qb[k2][1] + 1) / 2); }
  return this;
};
// any three.js geometry, flat-shaded from its triangle normals (then disposed)
Batch.prototype.geo = function (g, x, y, z, col, o) {
  o = o || NO;
  var e = mtx(x, y, z, o.rx, o.ry, o.rz, o.sx, o.sy, o.sz), c = this._col(col, o.vary != null ? o.vary : this.vary), em = o.emit || 0;
  var pa = g.attributes.position.array, ua = g.attributes.uv ? g.attributes.uv.array : null, ia = g.index ? g.index.array : null;
  var n = ia ? ia.length : pa.length / 3, V = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (var t = 0; t < n; t += 3) {
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
  var leafG = new THREE.Group(); leafG.position.set(-w / 2, 0, 0); leafG.rotation.y = open; g.add(leafG);
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
World.prototype.tex = function (fn, w, h, smooth) {
  var t = canvasTex(function (x, S, H) { fn(x, S, H); }, w || 128, { h: h || w || 128, clamp: true });
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

/* ---- end of worlds ---- */
