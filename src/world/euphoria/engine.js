// @ts-nocheck
/*
 * Active-ragdoll physics engine ("euphoria" engine) extracted from the user's Ragdoll Lab
 * (ragdoll-lab_7.html). XPBD rigid-body solver, 17-segment human ragdoll and its
 * balance / stepping / falling / bracing / ground / get-up / reflex controller.
 *
 * The code is the lab's own (machine-minified identifiers kept as-is); the only changes are:
 *  - build-time body scaling (withBuildScale) so big characters get a matching physical body,
 *  - static bodies skip per-step AABB/shape updates unless flagged `kinematic`,
 *  - contacts against `kinematic` static proxies accumulate the impulse on the proxy
 *    (two-way coupling with the game's Rapier props),
 *  - the lab's anatomy-mesh builder (rendering only) is omitted.
 * See src/world/euphoria/bridge.ts for how the game drives it.
 */
const __S = { s: 1, r: 1, m: 1, g: 1 };
class L {
  constructor(t = 0, e = 0, s = 0) {
    (this.x = t), (this.y = e), (this.z = s);
  }
  set(t, e, s) {
    return (this.x = t), (this.y = e), (this.z = s), this;
  }
  copy(t) {
    return (this.x = t.x), (this.y = t.y), (this.z = t.z), this;
  }
  clone() {
    return new L(this.x, this.y, this.z);
  }
  setZero() {
    return (this.x = 0), (this.y = 0), (this.z = 0), this;
  }
  add(t) {
    return (this.x += t.x), (this.y += t.y), (this.z += t.z), this;
  }
  sub(t) {
    return (this.x -= t.x), (this.y -= t.y), (this.z -= t.z), this;
  }
  addVectors(t, e) {
    return (
      (this.x = t.x + e.x), (this.y = t.y + e.y), (this.z = t.z + e.z), this
    );
  }
  subVectors(t, e) {
    return (
      (this.x = t.x - e.x), (this.y = t.y - e.y), (this.z = t.z - e.z), this
    );
  }
  scale(t) {
    return (this.x *= t), (this.y *= t), (this.z *= t), this;
  }
  addScaled(t, e) {
    return (this.x += t.x * e), (this.y += t.y * e), (this.z += t.z * e), this;
  }
  negate() {
    return (this.x = -this.x), (this.y = -this.y), (this.z = -this.z), this;
  }
  dot(t) {
    return this.x * t.x + this.y * t.y + this.z * t.z;
  }
  cross(t) {
    const e = this.y * t.z - this.z * t.y,
      s = this.z * t.x - this.x * t.z,
      n = this.x * t.y - this.y * t.x;
    return (this.x = e), (this.y = s), (this.z = n), this;
  }
  crossVectors(t, e) {
    const s = t.y * e.z - t.z * e.y,
      n = t.z * e.x - t.x * e.z,
      i = t.x * e.y - t.y * e.x;
    return (this.x = s), (this.y = n), (this.z = i), this;
  }
  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }
  normalize() {
    const t = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    if (t > 1e-12) {
      const e = 1 / t;
      (this.x *= e), (this.y *= e), (this.z *= e);
    }
    return this;
  }
  distanceTo(t) {
    const e = this.x - t.x,
      s = this.y - t.y,
      n = this.z - t.z;
    return Math.sqrt(e * e + s * s + n * n);
  }
  distanceToSq(t) {
    const e = this.x - t.x,
      s = this.y - t.y,
      n = this.z - t.z;
    return e * e + s * s + n * n;
  }
  lerp(t, e) {
    return (
      (this.x += (t.x - this.x) * e),
      (this.y += (t.y - this.y) * e),
      (this.z += (t.z - this.z) * e),
      this
    );
  }
  lerpVectors(t, e, s) {
    return (
      (this.x = t.x + (e.x - t.x) * s),
      (this.y = t.y + (e.y - t.y) * s),
      (this.z = t.z + (e.z - t.z) * s),
      this
    );
  }
  applyQuat(t) {
    const e = this.x,
      s = this.y,
      n = this.z,
      i = t.x,
      a = t.y,
      r = t.z,
      l = t.w,
      c = 2 * (a * n - r * s),
      h = 2 * (r * e - i * n),
      u = 2 * (i * s - a * e);
    return (
      (this.x = e + l * c + (a * u - r * h)),
      (this.y = s + l * h + (r * c - i * u)),
      (this.z = n + l * u + (i * h - a * c)),
      this
    );
  }
  applyQuatInv(t) {
    const e = this.x,
      s = this.y,
      n = this.z,
      i = -t.x,
      a = -t.y,
      r = -t.z,
      l = t.w,
      c = 2 * (a * n - r * s),
      h = 2 * (r * e - i * n),
      u = 2 * (i * s - a * e);
    return (
      (this.x = e + l * c + (a * u - r * h)),
      (this.y = s + l * h + (r * c - i * u)),
      (this.z = n + l * u + (i * h - a * c)),
      this
    );
  }
  applyMat3(t) {
    const e = this.x,
      s = this.y,
      n = this.z;
    return (
      (this.x = t[0] * e + t[1] * s + t[2] * n),
      (this.y = t[3] * e + t[4] * s + t[5] * n),
      (this.z = t[6] * e + t[7] * s + t[8] * n),
      this
    );
  }
  anyPerpendicular(t) {
    return (
      Math.abs(this.x) < 0.57
        ? t.set(0, this.z, -this.y)
        : t.set(this.y, -this.x, 0),
      t.normalize()
    );
  }
  toArray(t = [], e = 0) {
    return (t[e] = this.x), (t[e + 1] = this.y), (t[e + 2] = this.z), t;
  }
  fromArray(t, e = 0) {
    return (this.x = t[e]), (this.y = t[e + 1]), (this.z = t[e + 2]), this;
  }
  isFinite() {
    return (
      Number.isFinite(this.x) &&
      Number.isFinite(this.y) &&
      Number.isFinite(this.z)
    );
  }
}
class ae {
  constructor(t = 0, e = 0, s = 0, n = 1) {
    (this.x = t), (this.y = e), (this.z = s), (this.w = n);
  }
  set(t, e, s, n) {
    return (this.x = t), (this.y = e), (this.z = s), (this.w = n), this;
  }
  copy(t) {
    return (this.x = t.x), (this.y = t.y), (this.z = t.z), (this.w = t.w), this;
  }
  clone() {
    return new ae(this.x, this.y, this.z, this.w);
  }
  identity() {
    return (this.x = 0), (this.y = 0), (this.z = 0), (this.w = 1), this;
  }
  multiplyQuats(t, e) {
    const s = t.x,
      n = t.y,
      i = t.z,
      a = t.w,
      r = e.x,
      l = e.y,
      c = e.z,
      h = e.w;
    return (
      (this.x = s * h + a * r + n * c - i * l),
      (this.y = n * h + a * l + i * r - s * c),
      (this.z = i * h + a * c + s * l - n * r),
      (this.w = a * h - s * r - n * l - i * c),
      this
    );
  }
  multiply(t) {
    return this.multiplyQuats(this, t);
  }
  premultiply(t) {
    return this.multiplyQuats(t, this);
  }
  multiplyConjA(t, e) {
    const s = -t.x,
      n = -t.y,
      i = -t.z,
      a = t.w,
      r = e.x,
      l = e.y,
      c = e.z,
      h = e.w;
    return (
      (this.x = s * h + a * r + n * c - i * l),
      (this.y = n * h + a * l + i * r - s * c),
      (this.z = i * h + a * c + s * l - n * r),
      (this.w = a * h - s * r - n * l - i * c),
      this
    );
  }
  multiplyConjB(t, e) {
    const s = t.x,
      n = t.y,
      i = t.z,
      a = t.w,
      r = -e.x,
      l = -e.y,
      c = -e.z,
      h = e.w;
    return (
      (this.x = s * h + a * r + n * c - i * l),
      (this.y = n * h + a * l + i * r - s * c),
      (this.z = i * h + a * c + s * l - n * r),
      (this.w = a * h - s * r - n * l - i * c),
      this
    );
  }
  conjugate() {
    return (this.x = -this.x), (this.y = -this.y), (this.z = -this.z), this;
  }
  dot(t) {
    return this.x * t.x + this.y * t.y + this.z * t.z + this.w * t.w;
  }
  lengthSq() {
    return (
      this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w
    );
  }
  normalize() {
    let t = Math.sqrt(
      this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w,
    );
    return t < 1e-12
      ? this.identity()
      : ((t = 1 / t),
        (this.x *= t),
        (this.y *= t),
        (this.z *= t),
        (this.w *= t),
        this);
  }
  canonical() {
    return (
      this.w < 0 &&
        ((this.x = -this.x),
        (this.y = -this.y),
        (this.z = -this.z),
        (this.w = -this.w)),
      this
    );
  }
  setFromAxisAngle(t, e) {
    const s = e * 0.5,
      n = Math.sin(s);
    return (
      (this.x = t.x * n),
      (this.y = t.y * n),
      (this.z = t.z * n),
      (this.w = Math.cos(s)),
      this
    );
  }
  setFromRotVec(t) {
    const e = Math.sqrt(t.x * t.x + t.y * t.y + t.z * t.z);
    if (e < 1e-9)
      return (
        (this.x = t.x * 0.5),
        (this.y = t.y * 0.5),
        (this.z = t.z * 0.5),
        (this.w = 1),
        this.normalize()
      );
    const s = Math.sin(e * 0.5) / e;
    return (
      (this.x = t.x * s),
      (this.y = t.y * s),
      (this.z = t.z * s),
      (this.w = Math.cos(e * 0.5)),
      this
    );
  }
  toRotVec(t) {
    let e = this.x,
      s = this.y,
      n = this.z,
      i = this.w;
    i < 0 && ((e = -e), (s = -s), (n = -n), (i = -i));
    const a = Math.sqrt(e * e + s * s + n * n);
    if (a < 1e-9) return t.set(2 * e, 2 * s, 2 * n);
    const l = (2 * Math.atan2(a, i)) / a;
    return t.set(e * l, s * l, n * l);
  }
  angle() {
    const t = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    return 2 * Math.atan2(t, Math.abs(this.w));
  }
  setFromUnitVectors(t, e) {
    let s = t.x * e.x + t.y * e.y + t.z * e.z + 1;
    return (
      s < 1e-8
        ? ((s = 0),
          Math.abs(t.x) > Math.abs(t.z)
            ? ((this.x = -t.y), (this.y = t.x), (this.z = 0), (this.w = s))
            : ((this.x = 0), (this.y = -t.z), (this.z = t.y), (this.w = s)))
        : ((this.x = t.y * e.z - t.z * e.y),
          (this.y = t.z * e.x - t.x * e.z),
          (this.z = t.x * e.y - t.y * e.x),
          (this.w = s)),
      this.normalize()
    );
  }
  setFromBasis(t, e, s) {
    const n = t.x,
      i = e.x,
      a = s.x,
      r = t.y,
      l = e.y,
      c = s.y,
      h = t.z,
      u = e.z,
      d = s.z,
      f = n + l + d;
    if (f > 0) {
      const p = 0.5 / Math.sqrt(f + 1);
      (this.w = 0.25 / p),
        (this.x = (u - c) * p),
        (this.y = (a - h) * p),
        (this.z = (r - i) * p);
    } else if (n > l && n > d) {
      const p = 2 * Math.sqrt(1 + n - l - d);
      (this.w = (u - c) / p),
        (this.x = 0.25 * p),
        (this.y = (i + r) / p),
        (this.z = (a + h) / p);
    } else if (l > d) {
      const p = 2 * Math.sqrt(1 + l - n - d);
      (this.w = (a - h) / p),
        (this.x = (i + r) / p),
        (this.y = 0.25 * p),
        (this.z = (c + u) / p);
    } else {
      const p = 2 * Math.sqrt(1 + d - n - l);
      (this.w = (r - i) / p),
        (this.x = (a + h) / p),
        (this.y = (c + u) / p),
        (this.z = 0.25 * p);
    }
    return this.normalize();
  }
  setFromEuler(t, e, s, n = "XYZ") {
    const i = Math.cos(t / 2),
      a = Math.cos(e / 2),
      r = Math.cos(s / 2),
      l = Math.sin(t / 2),
      c = Math.sin(e / 2),
      h = Math.sin(s / 2);
    switch (n) {
      case "XYZ":
        (this.x = l * a * r + i * c * h),
          (this.y = i * c * r - l * a * h),
          (this.z = i * a * h + l * c * r),
          (this.w = i * a * r - l * c * h);
        break;
      case "YXZ":
        (this.x = l * a * r + i * c * h),
          (this.y = i * c * r - l * a * h),
          (this.z = i * a * h - l * c * r),
          (this.w = i * a * r + l * c * h);
        break;
      case "ZXY":
        (this.x = l * a * r - i * c * h),
          (this.y = i * c * r + l * a * h),
          (this.z = i * a * h + l * c * r),
          (this.w = i * a * r - l * c * h);
        break;
      case "ZYX":
        (this.x = l * a * r - i * c * h),
          (this.y = i * c * r + l * a * h),
          (this.z = i * a * h - l * c * r),
          (this.w = i * a * r + l * c * h);
        break;
      case "YZX":
        (this.x = l * a * r + i * c * h),
          (this.y = i * c * r + l * a * h),
          (this.z = i * a * h - l * c * r),
          (this.w = i * a * r - l * c * h);
        break;
      case "XZY":
        (this.x = l * a * r - i * c * h),
          (this.y = i * c * r - l * a * h),
          (this.z = i * a * h + l * c * r),
          (this.w = i * a * r + l * c * h);
        break;
    }
    return this;
  }
  slerp(t, e) {
    if (e === 0) return this;
    if (e === 1) return this.copy(t);
    const s = this.x,
      n = this.y,
      i = this.z,
      a = this.w;
    let r = a * t.w + s * t.x + n * t.y + i * t.z,
      l = t.x,
      c = t.y,
      h = t.z,
      u = t.w;
    if (
      (r < 0 && ((l = -l), (c = -c), (h = -h), (u = -u), (r = -r)), r >= 0.9995)
    )
      return (
        (this.x = s + e * (l - s)),
        (this.y = n + e * (c - n)),
        (this.z = i + e * (h - i)),
        (this.w = a + e * (u - a)),
        this.normalize()
      );
    const d = Math.acos(r),
      f = Math.sqrt(1 - r * r),
      p = Math.sin((1 - e) * d) / f,
      m = Math.sin(e * d) / f;
    return (
      (this.x = s * p + l * m),
      (this.y = n * p + c * m),
      (this.z = i * p + h * m),
      (this.w = a * p + u * m),
      this
    );
  }
  slerpQuats(t, e, s) {
    return this.copy(t).slerp(e, s);
  }
  integrate(t, e) {
    const s = 0.5 * e * t.x,
      n = 0.5 * e * t.y,
      i = 0.5 * e * t.z,
      a = this.x,
      r = this.y,
      l = this.z,
      c = this.w;
    return (
      (this.x += s * c + n * l - i * r),
      (this.y += n * c + i * a - s * l),
      (this.z += i * c + s * r - n * a),
      (this.w += -s * a - n * r - i * l),
      this.normalize()
    );
  }
  isFinite() {
    return (
      Number.isFinite(this.x) &&
      Number.isFinite(this.y) &&
      Number.isFinite(this.z) &&
      Number.isFinite(this.w)
    );
  }
}
function jA(o, t = new Float64Array(9)) {
  const e = o[0],
    s = o[1],
    n = o[2],
    i = o[3],
    a = o[4],
    r = o[5],
    l = o[6],
    c = o[7],
    h = o[8],
    u = a * h - r * c,
    d = -(i * h - r * l),
    f = i * c - a * l,
    p = e * u + s * d + n * f;
  if (Math.abs(p) < 1e-18) return t.fill(0), t;
  const m = 1 / p;
  return (
    (t[0] = u * m),
    (t[1] = -(s * h - n * c) * m),
    (t[2] = (s * r - n * a) * m),
    (t[3] = d * m),
    (t[4] = (e * h - n * l) * m),
    (t[5] = -(e * r - n * i) * m),
    (t[6] = f * m),
    (t[7] = -(e * c - s * l) * m),
    (t[8] = (e * a - s * i) * m),
    t
  );
}
function ZA(o, t, e, s, n = new Float64Array(9)) {
  const i = o.x,
    a = o.y,
    r = o.z,
    l = o.w,
    c = 1 - 2 * (a * a + r * r),
    h = 2 * (i * a - r * l),
    u = 2 * (i * r + a * l),
    d = 2 * (i * a + r * l),
    f = 1 - 2 * (i * i + r * r),
    p = 2 * (a * r - i * l),
    m = 2 * (i * r - a * l),
    x = 2 * (a * r + i * l),
    g = 1 - 2 * (i * i + a * a);
  return (
    (n[0] = c * c * t + h * h * e + u * u * s),
    (n[1] = c * d * t + h * f * e + u * p * s),
    (n[2] = c * m * t + h * x * e + u * g * s),
    (n[3] = n[1]),
    (n[4] = d * d * t + f * f * e + p * p * s),
    (n[5] = d * m * t + f * x * e + p * g * s),
    (n[6] = n[2]),
    (n[7] = n[5]),
    (n[8] = m * m * t + x * x * e + g * g * s),
    n
  );
}
function j(o, t, e) {
  return o < t ? t : o > e ? e : o;
}
function ee(o, t, e) {
  const s = j((e - o) / (t - o), 0, 1);
  return s * s * (3 - 2 * s);
}
function Ht(o, t, e) {
  return o + (t - o) * e;
}
function Qs(o, t, e) {
  return o < t ? Math.min(o + e, t) : Math.max(o - e, t);
}
function cn(o) {
  for (; o > Math.PI; ) o -= 2 * Math.PI;
  for (; o < -Math.PI; ) o += 2 * Math.PI;
  return o;
}
function Ty(o = 1234567) {
  let t = o >>> 0;
  return function () {
    t = (t + 1831565813) >>> 0;
    let s = t;
    return (
      (s = Math.imul(s ^ (s >>> 15), s | 1)),
      (s ^= s + Math.imul(s ^ (s >>> 7), s | 61)),
      ((s ^ (s >>> 14)) >>> 0) / 4294967296
    );
  };
}
function Wg(o, t = 0) {
  const e = Math.floor(o),
    s = o - e,
    n = (a) => {
      let r = Math.sin((a + t * 57.13) * 127.1) * 43758.5453;
      return (r - Math.floor(r)) * 2 - 1;
    },
    i = s * s * (3 - 2 * s);
  return n(e) * (1 - i) + n(e + 1) * i;
}
let KA = 1;
const Yo = new L(),
  $o = new L(),
  ui = new L(),
  vo = new Float64Array(9);
class uc {
  constructor(t = {}) {
    (this.id = KA++),
      (this.name = t.name ?? `body${this.id}`),
      (this.pos = new L()),
      (this.rot = new ae()),
      (this.vel = new L()),
      (this.angVel = new L()),
      (this.prevPos = new L()),
      (this.prevRot = new ae()),
      (this.framePos = new L()),
      (this.frameRot = new ae()),
      (this.mass = 0),
      (this.invMass = 0),
      (this.inertiaLocal = new Float64Array(9)),
      (this.invInertiaLocal = new Float64Array(9)),
      (this.isStatic = t.isStatic ?? !1),
      (this.shapes = []),
      (this.linearDamping = t.linearDamping ?? 0.02),
      (this.angularDamping = t.angularDamping ?? 0.05),
      (this.gravityScale = t.gravityScale ?? 1),
      (this.maxLinearSpeed = 250),
      (this.maxAngularSpeed = 90),
      (this.force = new L()),
      (this.torque = new L()),
      (this.collisionGroup = t.collisionGroup ?? 1),
      (this.collisionMask = t.collisionMask ?? 65535),
      (this.ignore = null),
      (this.contactImpulse = new L()),
      (this.groundImpulse = 0),
      (this.contactCount = 0),
      (this.groundContact = !1),
      (this.groundContactPoints = []),
      (this.groundContactUsed = 0),
      (this.sleeping = !1),
      (this.sleepTimer = 0),
      (this.world = null),
      (this.aabbMin = new L()),
      (this.aabbMax = new L()),
      (this.userData = t.userData ?? {});
  }
  addShape(t) {
    return (t.body = this), this.shapes.push(t), t;
  }
  setMassFromShapes(t, e = {}) {
    const s = e.recenter ?? !0,
      n = this.shapes.filter((c) => !c.massless);
    let i = 0;
    for (const c of n) i += c.volume() * (c.densityScale ?? 1);
    const a = new L();
    for (const c of n)
      a.addScaled(c.localPos, (c.volume() * (c.densityScale ?? 1)) / i);
    if ((e.com && a.copy(e.com), s))
      for (const c of this.shapes) c.localPos.sub(a);
    const r = new Float64Array(9),
      l = new L();
    for (const c of n) {
      const h = (t * c.volume() * (c.densityScale ?? 1)) / i;
      c.principalInertia(h, l), ZA(c.localRot, l.x, l.y, l.z, vo);
      const u = s ? c.localPos : Yo.subVectors(c.localPos, a),
        d = u.lengthSq();
      (r[0] += vo[0] + h * (d - u.x * u.x)),
        (r[1] += vo[1] - h * u.x * u.y),
        (r[2] += vo[2] - h * u.x * u.z),
        (r[3] += vo[3] - h * u.y * u.x),
        (r[4] += vo[4] + h * (d - u.y * u.y)),
        (r[5] += vo[5] - h * u.y * u.z),
        (r[6] += vo[6] - h * u.z * u.x),
        (r[7] += vo[7] - h * u.z * u.y),
        (r[8] += vo[8] + h * (d - u.z * u.z));
    }
    if (e.inertiaScale) for (let c = 0; c < 9; c++) r[c] *= e.inertiaScale;
    return this.setMassProperties(t, r), a;
  }
  setMassProperties(t, e) {
    (this.mass = t),
      (this.invMass = this.isStatic || t <= 0 ? 0 : 1 / t),
      this.inertiaLocal.set(e),
      this.isStatic || t <= 0
        ? this.invInertiaLocal.fill(0)
        : jA(e, this.invInertiaLocal);
  }
  makeStatic() {
    (this.isStatic = !0),
      (this.invMass = 0),
      this.invInertiaLocal.fill(0),
      this.vel.setZero(),
      this.angVel.setZero();
  }
  invInertiaMul(t, e) {
    const s = this.invInertiaLocal;
    e.copy(t).applyQuatInv(this.rot);
    const n = e.x,
      i = e.y,
      a = e.z;
    return (
      (e.x = s[0] * n + s[1] * i + s[2] * a),
      (e.y = s[3] * n + s[4] * i + s[5] * a),
      (e.z = s[6] * n + s[7] * i + s[8] * a),
      e.applyQuat(this.rot)
    );
  }
  inertiaMul(t, e) {
    const s = this.inertiaLocal;
    e.copy(t).applyQuatInv(this.rot);
    const n = e.x,
      i = e.y,
      a = e.z;
    return (
      (e.x = s[0] * n + s[1] * i + s[2] * a),
      (e.y = s[3] * n + s[4] * i + s[5] * a),
      (e.z = s[6] * n + s[7] * i + s[8] * a),
      e.applyQuat(this.rot)
    );
  }
  inverseMassAt(t, e) {
    return this.invMass === 0
      ? 0
      : ($o.crossVectors(t, e),
        this.invInertiaMul($o, ui),
        this.invMass + $o.dot(ui));
  }
  inverseMassAngular(t) {
    return this.invMass === 0 ? 0 : (this.invInertiaMul(t, ui), t.dot(ui));
  }
  applyPositionalImpulse(t, e, s) {
    this.invMass !== 0 &&
      (this.pos.addScaled(t, s * this.invMass),
      $o.crossVectors(e, t),
      this.invInertiaMul($o, ui),
      ui.scale(s),
      this.rot.integrate(ui, 1));
  }
  applyAngularPositionalImpulse(t, e) {
    this.invMass !== 0 &&
      (this.invInertiaMul(t, ui), ui.scale(e), this.rot.integrate(ui, 1));
  }
  applyImpulse(t, e) {
    this.invMass !== 0 &&
      (this.vel.addScaled(t, this.invMass),
      Yo.subVectors(e, this.pos),
      $o.crossVectors(Yo, t),
      this.invInertiaMul($o, ui),
      this.angVel.add(ui),
      this.wake());
  }
  applyAngularImpulse(t) {
    this.invMass !== 0 &&
      (this.invInertiaMul(t, ui), this.angVel.add(ui), this.wake());
  }
  applyForceAt(t, e) {
    this.force.add(t),
      Yo.subVectors(e, this.pos),
      $o.crossVectors(Yo, t),
      this.torque.add($o);
  }
  velocityAt(t, e) {
    return (
      Yo.subVectors(t, this.pos),
      e.crossVectors(this.angVel, Yo),
      e.add(this.vel)
    );
  }
  localToWorld(t, e) {
    return e.copy(t).applyQuat(this.rot).add(this.pos);
  }
  worldToLocal(t, e) {
    return e.subVectors(t, this.pos).applyQuatInv(this.rot);
  }
  localDirToWorld(t, e) {
    return e.copy(t).applyQuat(this.rot);
  }
  worldDirToLocal(t, e) {
    return e.copy(t).applyQuatInv(this.rot);
  }
  setPose(t, e) {
    this.pos.copy(t),
      this.rot.copy(e).normalize(),
      this.prevPos.copy(this.pos),
      this.prevRot.copy(this.rot),
      this.framePos.copy(this.pos),
      this.frameRot.copy(this.rot);
  }
  wake() {
    (this.sleeping = !1), (this.sleepTimer = 0);
  }
  kineticEnergy() {
    return this.invMass === 0
      ? 0
      : (this.inertiaMul(this.angVel, Yo),
        0.5 * this.mass * this.vel.lengthSq() + 0.5 * this.angVel.dot(Yo));
  }
  computeAABB(t, e) {
    const s = this.aabbMin,
      n = this.aabbMax;
    s.set(1 / 0, 1 / 0, 1 / 0), n.set(-1 / 0, -1 / 0, -1 / 0);
    for (const a of this.shapes)
      a.collides &&
        (a.updateWorld(this.pos, this.rot),
        (s.x = Math.min(s.x, a.aabbMin.x)),
        (s.y = Math.min(s.y, a.aabbMin.y)),
        (s.z = Math.min(s.z, a.aabbMin.z)),
        (n.x = Math.max(n.x, a.aabbMax.x)),
        (n.y = Math.max(n.y, a.aabbMax.y)),
        (n.z = Math.max(n.z, a.aabbMax.z)));
    let i = e;
    if (t > 0 && !this.isStatic) {
      let a = 0;
      for (const r of this.shapes)
        a = Math.max(a, r.localPos.length() + r.boundingRadius());
      i += (this.vel.length() + this.angVel.length() * a) * t;
    }
    (s.x -= i), (s.y -= i), (s.z -= i), (n.x += i), (n.y += i), (n.z += i);
  }
}
function Tr(o, t, e, s, n, i, a, r, l = 1 / 0) {
  const c = o ? o.inverseMassAt(n, e) : 0,
    h = t ? t.inverseMassAt(i, e) : 0,
    u = a / (r * r),
    d = c + h + u;
  if (d < 1e-12) return 0;
  let f = s / d;
  return (
    f > l ? (f = l) : f < -l && (f = -l),
    Gd.copy(e).scale(f),
    o && o.applyPositionalImpulse(Gd, n, 1),
    t && t.applyPositionalImpulse(Gd, i, -1),
    f
  );
}
const Gd = new L();
function su(o, t, e, s, n, i, a = 1 / 0) {
  const r = o ? o.inverseMassAngular(e) : 0,
    l = t ? t.inverseMassAngular(e) : 0,
    c = n / (i * i),
    h = r + l + c;
  if (h < 1e-12) return 0;
  let u = s / h;
  return (
    u > a ? (u = a) : u < -a && (u = -a),
    qd.copy(e).scale(u),
    o && o.applyAngularPositionalImpulse(qd, 1),
    t && t.applyAngularPositionalImpulse(qd, -1),
    u
  );
}
const qd = new L(),
  Vn = 0,
  xi = 1,
  G0 = 2;
let QA = 1;
class kn {
  constructor(t, e = {}) {
    (this.id = QA++),
      (this.type = t),
      (this.radius = e.radius ?? 0),
      (this.halfHeight = e.halfHeight ?? 0),
      (this.halfExtents = e.halfExtents
        ? new L().copy(e.halfExtents)
        : new L()),
      (this.localPos = e.localPos ? new L().copy(e.localPos) : new L()),
      (this.localRot = e.localRot ? new ae().copy(e.localRot) : new ae()),
      (this.friction = e.friction ?? 0.6),
      (this.restitution = e.restitution ?? 0.1),
      (this.material = e.material ?? "default"),
      (this.collides = e.collides ?? !0),
      (this.body = null),
      (this.tag = e.tag ?? null),
      (this.wPos = new L()),
      (this.wRot = new ae()),
      (this.p0 = new L()),
      (this.p1 = new L()),
      (this.ax = new L(1, 0, 0)),
      (this.ay = new L(0, 1, 0)),
      (this.az = new L(0, 0, 1)),
      (this.aabbMin = new L()),
      (this.aabbMax = new L());
  }
  static sphere(t, e = {}) {
    return new kn(Vn, { ...e, radius: t });
  }
  static capsule(t, e, s = {}) {
    return new kn(xi, { ...s, radius: t, halfHeight: e });
  }
  static box(t, e, s, n = {}) {
    return new kn(G0, {
      ...n,
      halfExtents: new L(t, e, s),
      radius: n.radius ?? 0,
    });
  }
  static capsuleBetween(t, e, s, n = {}) {
    const i = new L().addVectors(t, e).scale(0.5),
      a = new L().subVectors(e, t),
      r = a.length();
    a.normalize();
    const l = new ae().setFromUnitVectors(new L(0, 1, 0), a);
    return new kn(xi, {
      ...n,
      radius: s,
      halfHeight: r * 0.5,
      localPos: i,
      localRot: l,
    });
  }
  volume() {
    const t = this.radius;
    switch (this.type) {
      case Vn:
        return (4 / 3) * Math.PI * t * t * t;
      case xi: {
        const e = 2 * this.halfHeight;
        return Math.PI * t * t * e + (4 / 3) * Math.PI * t * t * t;
      }
      case G0: {
        const e = 2 * this.halfExtents.x,
          s = 2 * this.halfExtents.y,
          n = 2 * this.halfExtents.z;
        return (
          e * s * n +
          2 * t * (e * s + s * n + n * e) +
          Math.PI * t * t * (e + s + n) +
          (4 / 3) * Math.PI * t * t * t
        );
      }
    }
    return 0;
  }
  principalInertia(t, e = new L()) {
    const s = this.radius;
    switch (this.type) {
      case Vn: {
        const n = 0.4 * t * s * s;
        return e.set(n, n, n);
      }
      case xi: {
        const n = 2 * this.halfHeight,
          i = Math.PI * s * s * n,
          a = (4 / 3) * Math.PI * s * s * s,
          r = (t * i) / (i + a),
          l = t - r,
          c = r * (s * s * 0.5) + l * (0.4 * s * s),
          h =
            r * ((n * n) / 12 + (s * s) / 4) +
            l * (0.4 * s * s + (n * n) / 4 + (3 * n * s) / 8);
        return e.set(h, c, h);
      }
      case G0: {
        const n = this.halfExtents.x + s * 0.8,
          i = this.halfExtents.y + s * 0.8,
          a = this.halfExtents.z + s * 0.8;
        return e.set(
          (t / 3) * (i * i + a * a),
          (t / 3) * (n * n + a * a),
          (t / 3) * (n * n + i * i),
        );
      }
    }
    return e.set(0, 0, 0);
  }
  updateWorld(t, e) {
    this.wRot.multiplyQuats(e, this.localRot),
      this.wPos.copy(this.localPos).applyQuat(e).add(t);
    const s = this.radius;
    if (this.type === Vn)
      this.aabbMin.set(this.wPos.x - s, this.wPos.y - s, this.wPos.z - s),
        this.aabbMax.set(this.wPos.x + s, this.wPos.y + s, this.wPos.z + s);
    else if (this.type === xi) {
      this.ay.set(0, 1, 0).applyQuat(this.wRot);
      const n = this.halfHeight;
      this.p0.copy(this.wPos).addScaled(this.ay, -n),
        this.p1.copy(this.wPos).addScaled(this.ay, n),
        this.aabbMin.set(
          Math.min(this.p0.x, this.p1.x) - s,
          Math.min(this.p0.y, this.p1.y) - s,
          Math.min(this.p0.z, this.p1.z) - s,
        ),
        this.aabbMax.set(
          Math.max(this.p0.x, this.p1.x) + s,
          Math.max(this.p0.y, this.p1.y) + s,
          Math.max(this.p0.z, this.p1.z) + s,
        );
    } else {
      this.ax.set(1, 0, 0).applyQuat(this.wRot),
        this.ay.set(0, 1, 0).applyQuat(this.wRot),
        this.az.set(0, 0, 1).applyQuat(this.wRot);
      const n = this.halfExtents,
        i =
          Math.abs(this.ax.x) * n.x +
          Math.abs(this.ay.x) * n.y +
          Math.abs(this.az.x) * n.z +
          s,
        a =
          Math.abs(this.ax.y) * n.x +
          Math.abs(this.ay.y) * n.y +
          Math.abs(this.az.y) * n.z +
          s,
        r =
          Math.abs(this.ax.z) * n.x +
          Math.abs(this.ay.z) * n.y +
          Math.abs(this.az.z) * n.z +
          s;
      this.aabbMin.set(this.wPos.x - i, this.wPos.y - a, this.wPos.z - r),
        this.aabbMax.set(this.wPos.x + i, this.wPos.y + a, this.wPos.z + r);
    }
  }
  boundingRadius() {
    switch (this.type) {
      case Vn:
        return this.radius;
      case xi:
        return this.radius + this.halfHeight;
      default:
        return this.halfExtents.length() + this.radius;
    }
  }
  signedDistance(t) {
    const e = this.radius;
    if (this.type === Vn) return t.distanceTo(this.wPos) - e;
    if (this.type === xi) {
      const d = this.p1.x - this.p0.x,
        f = this.p1.y - this.p0.y,
        p = this.p1.z - this.p0.z,
        m = d * d + f * f + p * p;
      let x =
        ((t.x - this.p0.x) * d +
          (t.y - this.p0.y) * f +
          (t.z - this.p0.z) * p) /
        (m || 1);
      x = x < 0 ? 0 : x > 1 ? 1 : x;
      const g = this.p0.x + d * x - t.x,
        b = this.p0.y + f * x - t.y,
        v = this.p0.z + p * x - t.z;
      return Math.sqrt(g * g + b * b + v * v) - e;
    }
    const s = t.x - this.wPos.x,
      n = t.y - this.wPos.y,
      i = t.z - this.wPos.z,
      a =
        Math.abs(s * this.ax.x + n * this.ax.y + i * this.ax.z) -
        this.halfExtents.x,
      r =
        Math.abs(s * this.ay.x + n * this.ay.y + i * this.ay.z) -
        this.halfExtents.y,
      l =
        Math.abs(s * this.az.x + n * this.az.y + i * this.az.z) -
        this.halfExtents.z,
      c = Math.max(a, 0),
      h = Math.max(r, 0),
      u = Math.max(l, 0);
    return (
      Math.sqrt(c * c + h * h + u * u) + Math.min(Math.max(a, r, l), 0) - e
    );
  }
}
class Um {
  constructor(t) {
    (this.sink = t),
      (this.flip = !1),
      (this.margin = 0.006),
      (this.feature = -1);
  }
  add(t, e, s, n, i, a, r, l, c, h, u) {
    this.flip
      ? this.sink(e, t, a, r, l, s, n, i, -c, -h, -u)
      : this.sink(t, e, s, n, i, a, r, l, c, h, u);
  }
}
function fa(o) {
  return o < 0 ? 0 : o > 1 ? 1 : o;
}
function Mu(o, t, e, s, n, i, a, r, l, c, h, u = 0, d = 1, f = 0) {
  const p = e - a,
    m = s - r,
    x = n - l,
    g = p * p + m * m + x * x,
    b = i + c + h.margin;
  if (g > b * b) return;
  let v, y, M;
  if (g > 1e-18) {
    const w = Math.sqrt(g);
    (v = p / w), (y = m / w), (M = x / w);
  } else (v = u), (y = d), (M = f);
  h.add(
    o,
    t,
    e - v * i,
    s - y * i,
    n - M * i,
    a + v * c,
    r + y * c,
    l + M * c,
    v,
    y,
    M,
  );
}
function Gg(o, t, e, s, n, i, a) {
  const r = i.p0,
    l = i.p1,
    c = l.x - r.x,
    h = l.y - r.y,
    u = l.z - r.z,
    d = c * c + h * h + u * u,
    f = d > 1e-12 ? fa(((t - r.x) * c + (e - r.y) * h + (s - r.z) * u) / d) : 0;
  Mu(o, i, t, e, s, n, r.x + c * f, r.y + h * f, r.z + u * f, i.radius, a);
}
const Xl = { s: 0, t: 0 };
function Ey(o, t, e, s, n, i, a, r, l, c, h, u) {
  const d = o - a,
    f = t - r,
    p = e - l,
    m = s * s + n * n + i * i,
    x = c * c + h * h + u * u,
    g = c * d + h * f + u * p,
    b = 1e-12;
  let v, y;
  if (m <= b && x <= b) (v = 0), (y = 0);
  else if (m <= b) (v = 0), (y = fa(g / x));
  else {
    const M = s * d + n * f + i * p;
    if (x <= b) (y = 0), (v = fa(-M / m));
    else {
      const w = s * c + n * h + i * u,
        S = m * x - w * w;
      (v = S > b ? fa((w * g - M * x) / S) : 0),
        (y = (w * v + g) / x),
        y < 0
          ? ((y = 0), (v = fa(-M / m)))
          : y > 1 && ((y = 1), (v = fa((w - M) / m)));
    }
  }
  (Xl.s = v), (Xl.t = y);
}
function JA(o, t, e) {
  const s = o.p0,
    n = o.p1,
    i = t.p0,
    a = t.p1,
    r = n.x - s.x,
    l = n.y - s.y,
    c = n.z - s.z,
    h = a.x - i.x,
    u = a.y - i.y,
    d = a.z - i.z,
    f = r * r + l * l + c * c,
    p = h * h + u * u + d * d;
  if (
    f > 1e-8 &&
    p > 1e-8 &&
    Math.abs(r * h + l * u + c * d) / Math.sqrt(f * p) > 0.995
  ) {
    const b = ((i.x - s.x) * r + (i.y - s.y) * l + (i.z - s.z) * c) / f,
      v = ((a.x - s.x) * r + (a.y - s.y) * l + (a.z - s.z) * c) / f,
      y = fa(Math.min(b, v)),
      M = fa(Math.max(b, v));
    if ((M - y) * Math.sqrt(f) > 0.02) {
      for (let w = 0; w < 2; w++) {
        const S = w === 0 ? y : M,
          _ = s.x + r * S,
          A = s.y + l * S,
          E = s.z + c * S,
          k = fa(((_ - i.x) * h + (A - i.y) * u + (E - i.z) * d) / p);
        Mu(
          o,
          t,
          _,
          A,
          E,
          o.radius,
          i.x + h * k,
          i.y + u * k,
          i.z + d * k,
          t.radius,
          e,
        );
      }
      return;
    }
  }
  Ey(s.x, s.y, s.z, r, l, c, i.x, i.y, i.z, h, u, d);
  const m = Xl.s,
    x = Xl.t;
  Mu(
    o,
    t,
    s.x + r * m,
    s.y + l * m,
    s.z + c * m,
    o.radius,
    i.x + h * x,
    i.y + u * x,
    i.z + d * x,
    t.radius,
    e,
  );
}
function Rl(o, t, e, s, n, i, a) {
  const r = i.ax,
    l = i.ay,
    c = i.az,
    h = i.halfExtents,
    u = i.wPos,
    d = t - u.x,
    f = e - u.y,
    p = s - u.z,
    m = d * r.x + f * r.y + p * r.z,
    x = d * l.x + f * l.y + p * l.z,
    g = d * c.x + f * c.y + p * c.z;
  let b = m < -h.x ? -h.x : m > h.x ? h.x : m,
    v = x < -h.y ? -h.y : x > h.y ? h.y : x,
    y = g < -h.z ? -h.z : g > h.z ? h.z : g;
  const M = i.radius;
  let w, S, _;
  if (b !== m || v !== x || y !== g) {
    const P = m - b,
      R = x - v,
      z = g - y,
      H = P * P + R * R + z * z,
      N = n + M + a.margin;
    if (H > N * N) return;
    const I = Math.sqrt(H);
    (w = P / I), (S = R / I), (_ = z / I);
  } else {
    const P = h.x - Math.abs(m),
      R = h.y - Math.abs(x),
      z = h.z - Math.abs(g);
    (w = S = _ = 0),
      P <= R && P <= z
        ? ((w = m >= 0 ? 1 : -1), (b = w * h.x))
        : R <= z
          ? ((S = x >= 0 ? 1 : -1), (v = S * h.y))
          : ((_ = g >= 0 ? 1 : -1), (y = _ * h.z));
  }
  const A = r.x * w + l.x * S + c.x * _,
    E = r.y * w + l.y * S + c.y * _,
    k = r.z * w + l.z * S + c.z * _,
    T = u.x + r.x * b + l.x * v + c.x * y,
    D = u.y + r.y * b + l.y * v + c.y * y,
    C = u.z + r.z * b + l.z * v + c.z * y;
  a.add(
    o,
    i,
    t - A * n,
    e - E * n,
    s - k * n,
    T + A * M,
    D + E * M,
    C + k * M,
    A,
    E,
    k,
  );
}
function p0(o, t, e, s, n, i, a, r, l, c) {
  const h = o + s * c,
    u = t + n * c,
    d = e + i * c,
    f = h < -a ? -a - h : h > a ? h - a : 0,
    p = u < -r ? -r - u : u > r ? u - r : 0,
    m = d < -l ? -l - d : d > l ? d - l : 0;
  return f * f + p * p + m * m;
}
const dh = 0.6180339887498949;
function qg(o, t, e) {
  const s = t.wPos,
    n = t.ax,
    i = t.ay,
    a = t.az,
    r = t.halfExtents,
    l = o.p0,
    c = o.p1,
    h = o.radius;
  let u = l.x - s.x,
    d = l.y - s.y,
    f = l.z - s.z;
  const p = u * n.x + d * n.y + f * n.z,
    m = u * i.x + d * i.y + f * i.z,
    x = u * a.x + d * a.y + f * a.z;
  (u = c.x - l.x), (d = c.y - l.y), (f = c.z - l.z);
  const g = u * n.x + d * n.y + f * n.z,
    b = u * i.x + d * i.y + f * i.z,
    v = u * a.x + d * a.y + f * a.z,
    y = h + t.radius + e.margin,
    M = Math.min(p, p + g),
    w = Math.max(p, p + g),
    S = Math.min(m, m + b),
    _ = Math.max(m, m + b),
    A = Math.min(x, x + v),
    E = Math.max(x, x + v);
  if (
    M > r.x + y ||
    w < -r.x - y ||
    S > r.y + y ||
    _ < -r.y - y ||
    A > r.z + y ||
    E < -r.z - y
  )
    return;
  let k = 0,
    T = 1,
    D = T - dh * (T - k),
    C = k + dh * (T - k),
    P = p0(p, m, x, g, b, v, r.x, r.y, r.z, D),
    R = p0(p, m, x, g, b, v, r.x, r.y, r.z, C);
  for (let Q = 0; Q < 22; Q++)
    P < R
      ? ((T = C),
        (C = D),
        (R = P),
        (D = T - dh * (T - k)),
        (P = p0(p, m, x, g, b, v, r.x, r.y, r.z, D)))
      : ((k = D),
        (D = C),
        (P = R),
        (C = k + dh * (T - k)),
        (R = p0(p, m, x, g, b, v, r.x, r.y, r.z, C)));
  const z = (k + T) * 0.5,
    H = p0(p, m, x, g, b, v, r.x, r.y, r.z, z),
    N = c.x - l.x,
    I = c.y - l.y,
    U = c.z - l.z;
  if (H < 1e-14) {
    for (let Q = 0; Q <= 4; Q++) {
      const W = Q / 4;
      Rl(o, l.x + N * W, l.y + I * W, l.z + U * W, h, t, e);
    }
    return;
  }
  const $ = Math.sqrt(N * N + I * I + U * U);
  Rl(o, l.x, l.y, l.z, h, t, e), Rl(o, c.x, c.y, c.z, h, t, e);
  const G = $ > 1e-6 ? (h * 0.5) / $ : 1;
  z > G && z < 1 - G && Rl(o, l.x + N * z, l.y + I * z, l.z + U * z, h, t, e);
}
const fh = new Float64Array(24),
  t4 = new Float64Array(24);
function e4(o, t, e, s, n, i, a) {
  let r = 0;
  for (let l = 0; l < t; l++) {
    const c = (l + 1) % t,
      h = o[l * 3],
      u = o[l * 3 + 1],
      d = o[l * 3 + 2],
      f = o[c * 3],
      p = o[c * 3 + 1],
      m = o[c * 3 + 2],
      x = s * h + n * u + i * d - a,
      g = s * f + n * p + i * m - a;
    if (
      (x <= 0 && ((e[r * 3] = h), (e[r * 3 + 1] = u), (e[r * 3 + 2] = d), r++),
      x <= 0 != g <= 0)
    ) {
      const b = x / (x - g);
      (e[r * 3] = h + (f - h) * b),
        (e[r * 3 + 1] = u + (p - u) * b),
        (e[r * 3 + 2] = d + (m - d) * b),
        r++;
    }
    if (r >= 8) break;
  }
  return r;
}
const js = [null, null, null],
  Zs = [null, null, null],
  Nn = [0, 0, 0],
  Un = [0, 0, 0],
  s4 = new Float64Array(9),
  dr = new Float64Array(9);
function n4(o, t, e) {
  (js[0] = o.ax),
    (js[1] = o.ay),
    (js[2] = o.az),
    (Zs[0] = t.ax),
    (Zs[1] = t.ay),
    (Zs[2] = t.az),
    (Nn[0] = o.halfExtents.x),
    (Nn[1] = o.halfExtents.y),
    (Nn[2] = o.halfExtents.z),
    (Un[0] = t.halfExtents.x),
    (Un[1] = t.halfExtents.y),
    (Un[2] = t.halfExtents.z);
  const s = o.radius + t.radius + e.margin,
    n = t.wPos.x - o.wPos.x,
    i = t.wPos.y - o.wPos.y,
    a = t.wPos.z - o.wPos.z;
  for (let nt = 0; nt < 3; nt++)
    for (let ft = 0; ft < 3; ft++) {
      const K = js[nt].x * Zs[ft].x + js[nt].y * Zs[ft].y + js[nt].z * Zs[ft].z;
      (s4[nt * 3 + ft] = K), (dr[nt * 3 + ft] = Math.abs(K) + 1e-7);
    }
  let r = -1 / 0,
    l = -1,
    c = 0,
    h = 0,
    u = 0,
    d = 0,
    f = 0;
  for (let nt = 0; nt < 3; nt++) {
    const ft = js[nt],
      K = n * ft.x + i * ft.y + a * ft.z,
      it = Un[0] * dr[nt * 3] + Un[1] * dr[nt * 3 + 1] + Un[2] * dr[nt * 3 + 2],
      J = Math.abs(K) - (Nn[nt] + it);
    if (J > s) return;
    if (J > r) {
      (r = J), (l = 0), (c = nt);
      const lt = K >= 0 ? 1 : -1;
      (u = ft.x * lt), (d = ft.y * lt), (f = ft.z * lt);
    }
  }
  for (let nt = 0; nt < 3; nt++) {
    const ft = Zs[nt],
      K = n * ft.x + i * ft.y + a * ft.z,
      it = Nn[0] * dr[nt] + Nn[1] * dr[3 + nt] + Nn[2] * dr[6 + nt],
      J = Math.abs(K) - (it + Un[nt]);
    if (J > s) return;
    if (J > r + 1e-4) {
      (r = J), (l = 1), (h = nt);
      const lt = K >= 0 ? 1 : -1;
      (u = ft.x * lt), (d = ft.y * lt), (f = ft.z * lt);
    }
  }
  const p = r;
  for (let nt = 0; nt < 3; nt++)
    for (let ft = 0; ft < 3; ft++) {
      const K = js[nt],
        it = Zs[ft];
      let J = K.y * it.z - K.z * it.y,
        lt = K.z * it.x - K.x * it.z,
        ct = K.x * it.y - K.y * it.x;
      const At = Math.sqrt(J * J + lt * lt + ct * ct);
      if (At < 1e-4) continue;
      (J /= At), (lt /= At), (ct /= At);
      const Pt =
          Nn[0] * Math.abs(js[0].x * J + js[0].y * lt + js[0].z * ct) +
          Nn[1] * Math.abs(js[1].x * J + js[1].y * lt + js[1].z * ct) +
          Nn[2] * Math.abs(js[2].x * J + js[2].y * lt + js[2].z * ct),
        Ct =
          Un[0] * Math.abs(Zs[0].x * J + Zs[0].y * lt + Zs[0].z * ct) +
          Un[1] * Math.abs(Zs[1].x * J + Zs[1].y * lt + Zs[1].z * ct) +
          Un[2] * Math.abs(Zs[2].x * J + Zs[2].y * lt + Zs[2].z * ct),
        Ft = n * J + i * lt + a * ct,
        Z = Math.abs(Ft) - (Pt + Ct);
      if (Z > s) return;
      if (Z > r && Z > p + 0.002 + Math.abs(p) * 0.05) {
        (r = Z), (l = 2), (c = nt), (h = ft);
        const se = Ft >= 0 ? 1 : -1;
        (u = J * se), (d = lt * se), (f = ct * se);
      }
    }
  if (l === 2) {
    const nt = u,
      ft = d,
      K = f;
    let it = o.wPos.x,
      J = o.wPos.y,
      lt = o.wPos.z;
    for (let zt = 0; zt < 3; zt++) {
      if (zt === c) continue;
      const kt = js[zt],
        It = kt.x * nt + kt.y * ft + kt.z * K >= 0 ? 1 : -1;
      (it += kt.x * Nn[zt] * It),
        (J += kt.y * Nn[zt] * It),
        (lt += kt.z * Nn[zt] * It);
    }
    let ct = t.wPos.x,
      At = t.wPos.y,
      Pt = t.wPos.z;
    for (let zt = 0; zt < 3; zt++) {
      if (zt === h) continue;
      const kt = Zs[zt],
        It = kt.x * nt + kt.y * ft + kt.z * K >= 0 ? -1 : 1;
      (ct += kt.x * Un[zt] * It),
        (At += kt.y * Un[zt] * It),
        (Pt += kt.z * Un[zt] * It);
    }
    const Ct = js[c],
      Ft = Zs[h],
      Z = Nn[c],
      se = Un[h];
    Ey(
      it - Ct.x * Z,
      J - Ct.y * Z,
      lt - Ct.z * Z,
      Ct.x * 2 * Z,
      Ct.y * 2 * Z,
      Ct.z * 2 * Z,
      ct - Ft.x * se,
      At - Ft.y * se,
      Pt - Ft.z * se,
      Ft.x * 2 * se,
      Ft.y * 2 * se,
      Ft.z * 2 * se,
    );
    const pe = Xl.s,
      Y = Xl.t,
      F = it - Ct.x * Z + Ct.x * 2 * Z * pe,
      ht = J - Ct.y * Z + Ct.y * 2 * Z * pe,
      mt = lt - Ct.z * Z + Ct.z * 2 * Z * pe,
      st = ct - Ft.x * se + Ft.x * 2 * se * Y,
      dt = At - Ft.y * se + Ft.y * 2 * se * Y,
      yt = Pt - Ft.z * se + Ft.z * 2 * se * Y;
    if ((st - F) * nt + (dt - ht) * ft + (yt - mt) * K > s) return;
    const ut = o.radius,
      _t = t.radius;
    e.add(
      o,
      t,
      F + nt * ut,
      ht + ft * ut,
      mt + K * ut,
      st - nt * _t,
      dt - ft * _t,
      yt - K * _t,
      -nt,
      -ft,
      -K,
    );
    return;
  }
  const m = l === 0,
    x = m ? o : t,
    g = m ? t : o,
    b = m ? js : Zs,
    v = m ? Zs : js,
    y = m ? Nn : Un,
    M = m ? Un : Nn,
    w = m ? c : h,
    S = m ? u : -u,
    _ = m ? d : -d,
    A = m ? f : -f;
  let E = 0,
    k = -1;
  for (let nt = 0; nt < 3; nt++) {
    const ft = Math.abs(v[nt].x * S + v[nt].y * _ + v[nt].z * A);
    ft > k && ((k = ft), (E = nt));
  }
  const T = v[E].x * S + v[E].y * _ + v[E].z * A > 0 ? -1 : 1,
    D = g.wPos.x + v[E].x * M[E] * T,
    C = g.wPos.y + v[E].y * M[E] * T,
    P = g.wPos.z + v[E].z * M[E] * T,
    R = (E + 1) % 3,
    z = (E + 2) % 3,
    H = v[R],
    N = v[z],
    I = M[R],
    U = M[z],
    $ = [1, 1, -1, 1, -1, -1, 1, -1];
  for (let nt = 0; nt < 4; nt++) {
    const ft = $[nt * 2] * I,
      K = $[nt * 2 + 1] * U;
    (fh[nt * 3] = D + H.x * ft + N.x * K),
      (fh[nt * 3 + 1] = C + H.y * ft + N.y * K),
      (fh[nt * 3 + 2] = P + H.z * ft + N.z * K);
  }
  let G = 4;
  const Q = x.wPos,
    W = (w + 1) % 3,
    q = (w + 2) % 3;
  let O = fh,
    X = t4;
  for (let nt = 0; nt < 4 && G > 0; nt++) {
    const ft = nt < 2 ? b[W] : b[q],
      K = nt < 2 ? y[W] : y[q],
      it = nt % 2 === 0 ? 1 : -1,
      J = ft.x * it,
      lt = ft.y * it,
      ct = ft.z * it,
      At = J * Q.x + lt * Q.y + ct * Q.z + K;
    G = e4(O, G, X, J, lt, ct, At);
    const Pt = O;
    (O = X), (X = Pt);
  }
  const tt = S * Q.x + _ * Q.y + A * Q.z + y[w],
    pt = x.radius,
    ot = g.radius;
  for (let nt = 0; nt < G; nt++) {
    const ft = O[nt * 3],
      K = O[nt * 3 + 1],
      it = O[nt * 3 + 2],
      J = S * ft + _ * K + A * it - tt;
    if (J > s) continue;
    const lt = ft - S * ot,
      ct = K - _ * ot,
      At = it - A * ot,
      Pt = ft - S * J + S * pt,
      Ct = K - _ * J + _ * pt,
      Ft = it - A * J + A * pt;
    m
      ? e.add(o, t, Pt, Ct, Ft, lt, ct, At, -S, -_, -A)
      : e.add(o, t, lt, ct, At, Pt, Ct, Ft, S, _, A);
  }
}
function Bm(o, t, e) {
  const s = o.type,
    n = t.type;
  s === Vn
    ? n === Vn
      ? Mu(
          o,
          t,
          o.wPos.x,
          o.wPos.y,
          o.wPos.z,
          o.radius,
          t.wPos.x,
          t.wPos.y,
          t.wPos.z,
          t.radius,
          e,
        )
      : n === xi
        ? Gg(o, o.wPos.x, o.wPos.y, o.wPos.z, o.radius, t, e)
        : Rl(o, o.wPos.x, o.wPos.y, o.wPos.z, o.radius, t, e)
    : s === xi
      ? n === Vn
        ? ((e.flip = !e.flip),
          Gg(t, t.wPos.x, t.wPos.y, t.wPos.z, t.radius, o, e),
          (e.flip = !e.flip))
        : n === xi
          ? JA(o, t, e)
          : qg(o, t, e)
      : n === Vn
        ? ((e.flip = !e.flip),
          Rl(t, t.wPos.x, t.wPos.y, t.wPos.z, t.radius, o, e),
          (e.flip = !e.flip))
        : n === xi
          ? ((e.flip = !e.flip), qg(t, o, e), (e.flip = !e.flip))
          : n4(o, t, e);
}
function ph(o, t, e, s, n, i, a, r) {
  e - n > i + r.margin ||
    t < a.minX ||
    t > a.maxX ||
    s < a.minZ ||
    s > a.maxZ ||
    r.add(o, null, t, e - n, s, t, i, s, 0, 1, 0);
}
function i4(o, t, e, s) {
  if (o.aabbMin.y > t + s.margin) return;
  const n = o.radius;
  if (o.type === Vn)
    (s.feature = 0), ph(o, o.wPos.x, o.wPos.y, o.wPos.z, n, t, e, s);
  else if (o.type === xi)
    (s.feature = 0),
      ph(o, o.p0.x, o.p0.y, o.p0.z, n, t, e, s),
      (s.feature = 1),
      ph(o, o.p1.x, o.p1.y, o.p1.z, n, t, e, s);
  else {
    const i = o.wPos,
      a = o.halfExtents,
      r = o.ax,
      l = o.ay,
      c = o.az;
    for (let h = 0; h < 8; h++) {
      const u = h & 1 ? a.x : -a.x,
        d = h & 2 ? a.y : -a.y,
        f = h & 4 ? a.z : -a.z,
        p = i.x + r.x * u + l.x * d + c.x * f,
        m = i.y + r.y * u + l.y * d + c.y * f,
        x = i.z + r.z * u + l.z * d + c.z * f;
      (s.feature = h), ph(o, p, m, x, n, t, e, s);
    }
  }
  s.feature = -1;
}
const Xd = new L(),
  mh = new L(),
  gh = new L();
function Up(o, t, e, s, n, i, a, r, l, c, h) {
  const u = o - a,
    d = t - r,
    f = e - l,
    p = u * s + d * n + f * i,
    m = u * u + d * d + f * f - c * c,
    x = p * p - m;
  if (x < 0) return !1;
  const g = Math.sqrt(x);
  return (h[0] = -p - g), (h[1] = -p + g), !0;
}
const la = [0, 0];
function o4(o, t, e, s) {
  const n = o.p0,
    i = o.p1,
    a = o.radius;
  let r = i.x - n.x,
    l = i.y - n.y,
    c = i.z - n.z;
  const h = Math.sqrt(r * r + l * l + c * c);
  let u = 1 / 0,
    d = -1 / 0;
  if (h > 1e-9) {
    (r /= h), (l /= h), (c /= h);
    const f = t.x - n.x,
      p = t.y - n.y,
      m = t.z - n.z,
      x = e.x * r + e.y * l + e.z * c,
      g = f * r + p * l + m * c,
      b = e.x - r * x,
      v = e.y - l * x,
      y = e.z - c * x,
      M = f - r * g,
      w = p - l * g,
      S = m - c * g,
      _ = b * b + v * v + y * y,
      A = 2 * (b * M + v * w + y * S),
      E = M * M + w * w + S * S - a * a;
    let k = -1 / 0,
      T = 1 / 0,
      D = !0;
    if (_ > 1e-12) {
      const C = A * A - 4 * _ * E;
      if (C < 0) D = !1;
      else {
        const P = Math.sqrt(C);
        (k = (-A - P) / (2 * _)), (T = (-A + P) / (2 * _));
      }
    } else E > 0 && (D = !1);
    if (D) {
      let C, P;
      if (Math.abs(x) > 1e-12) {
        if (((C = (0 - g) / x), (P = (h - g) / x), C > P)) {
          const H = C;
          (C = P), (P = H);
        }
      } else
        g >= 0 && g <= h ? ((C = -1 / 0), (P = 1 / 0)) : ((C = 1), (P = 0));
      const R = Math.max(k, C),
        z = Math.min(T, P);
      R <= z && ((u = Math.min(u, R)), (d = Math.max(d, z)));
    }
  }
  return (
    Up(t.x, t.y, t.z, e.x, e.y, e.z, n.x, n.y, n.z, a, la) &&
      ((u = Math.min(u, la[0])), (d = Math.max(d, la[1]))),
    Up(t.x, t.y, t.z, e.x, e.y, e.z, i.x, i.y, i.z, a, la) &&
      ((u = Math.min(u, la[0])), (d = Math.max(d, la[1]))),
    u > d ? !1 : ((s.tIn = u), (s.tOut = d), !0)
  );
}
function Xg(o, t, e, s, n, i, a) {
  const r = Math.abs(o) - s,
    l = Math.abs(t) - n,
    c = Math.abs(e) - i,
    h = Math.max(r, 0),
    u = Math.max(l, 0),
    d = Math.max(c, 0);
  return Math.sqrt(h * h + u * u + d * d) + Math.min(Math.max(r, l, c), 0) - a;
}
function a4(o, t, e, s) {
  const n = o.wPos,
    i = o.ax,
    a = o.ay,
    r = o.az,
    l = o.halfExtents,
    c = o.radius,
    h = t.x - n.x,
    u = t.y - n.y,
    d = t.z - n.z,
    f = [
      h * i.x + u * i.y + d * i.z,
      h * a.x + u * a.y + d * a.z,
      h * r.x + u * r.y + d * r.z,
    ],
    p = [
      e.x * i.x + e.y * i.y + e.z * i.z,
      e.x * a.x + e.y * a.y + e.z * a.z,
      e.x * r.x + e.y * r.y + e.z * r.z,
    ],
    m = [l.x + c, l.y + c, l.z + c];
  let x = -1 / 0,
    g = 1 / 0,
    b = 0,
    v = 1;
  for (let R = 0; R < 3; R++) {
    if (Math.abs(p[R]) < 1e-12) {
      if (f[R] < -m[R] || f[R] > m[R]) return !1;
      continue;
    }
    let z = (-m[R] - f[R]) / p[R],
      H = (m[R] - f[R]) / p[R],
      N = -1;
    if (z > H) {
      const I = z;
      (z = H), (H = I), (N = 1);
    }
    if ((z > x && ((x = z), (b = R), (v = N)), H < g && (g = H), x > g))
      return !1;
  }
  if (c <= 0) {
    (s.tIn = x), (s.tOut = g);
    const R = [0, 0, 0];
    return (
      (R[b] = v),
      s.normal.set(
        i.x * R[0] + a.x * R[1] + r.x * R[2],
        i.y * R[0] + a.y * R[1] + r.y * R[2],
        i.z * R[0] + a.z * R[1] + r.z * R[2],
      ),
      (s.normalSet = !0),
      !0
    );
  }
  let y = Math.max(x, -1e3),
    M = !1;
  for (let R = 0; R < 48; R++) {
    const z = Xg(
      f[0] + p[0] * y,
      f[1] + p[1] * y,
      f[2] + p[2] * y,
      l.x,
      l.y,
      l.z,
      c,
    );
    if (z < 1e-5) {
      M = !0;
      break;
    }
    if (((y += z), y > g)) break;
  }
  if (!M) return !1;
  let w = g;
  for (let R = 0; R < 48; R++) {
    const z = Xg(
      f[0] + p[0] * w,
      f[1] + p[1] * w,
      f[2] + p[2] * w,
      l.x,
      l.y,
      l.z,
      c,
    );
    if (z < 1e-5 || ((w -= z), w < y)) break;
  }
  (s.tIn = y), (s.tOut = Math.max(w, y));
  const S = f[0] + p[0] * y,
    _ = f[1] + p[1] * y,
    A = f[2] + p[2] * y,
    E = Math.abs(S) - l.x,
    k = Math.abs(_) - l.y,
    T = Math.abs(A) - l.z;
  let D, C, P;
  return (
    E > 0 || k > 0 || T > 0
      ? ((D = Math.max(E, 0) * Math.sign(S)),
        (C = Math.max(k, 0) * Math.sign(_)),
        (P = Math.max(T, 0) * Math.sign(A)))
      : ((D = C = P = 0),
        E >= k && E >= T
          ? (D = Math.sign(S))
          : k >= T
            ? (C = Math.sign(_))
            : (P = Math.sign(A))),
    s.normal
      .set(
        i.x * D + a.x * C + r.x * P,
        i.y * D + a.y * C + r.y * P,
        i.z * D + a.z * C + r.z * P,
      )
      .normalize(),
    (s.normalSet = !0),
    !0
  );
}
function Yg(o, t, e, s, n) {
  n.normalSet = !1;
  let i = !1;
  if (o.type === Vn) {
    const a = o.wPos;
    (i = Up(t.x, t.y, t.z, e.x, e.y, e.z, a.x, a.y, a.z, o.radius, la)),
      i && ((n.tIn = la[0]), (n.tOut = la[1]));
  } else
    o.type === xi
      ? (i = o4(o, t, e, n))
      : o.type === G0 && (i = a4(o, t, e, n));
  if (!i || n.tOut < 0 || n.tIn > s) return !1;
  if (!n.normalSet)
    if ((gh.copy(t).addScaled(e, Math.max(n.tIn, 0)), o.type === Vn))
      n.normal.subVectors(gh, o.wPos).normalize();
    else {
      const a = o.p0,
        r = o.p1;
      mh.subVectors(r, a);
      const l = mh.lengthSq();
      let c = l > 1e-12 ? Xd.subVectors(gh, a).dot(mh) / l : 0;
      (c = Math.max(0, Math.min(1, c))),
        Xd.copy(a).addScaled(mh, c),
        n.normal.subVectors(gh, Xd).normalize();
    }
  return !0;
}
const bs = new L(),
  Is = new L(),
  Hs = new L(),
  Tn = new L(),
  is = new L(),
  ls = new L(),
  Ds = new L(),
  pn = new L(),
  Xe = new L(),
  xh = new L(),
  fr = new ae(),
  Ji = new L(),
  jo = new L(),
  Pa = new L();
class r4 {
  constructor() {
    (this.bodyA = null),
      (this.bodyB = null),
      (this.shapeA = null),
      (this.shapeB = null),
      (this.n = new L()),
      (this.rA = new L()),
      (this.rB = new L()),
      (this.lambdaN = 0),
      (this.vnPre = 0),
      (this.friction = 0.6),
      (this.staticFriction = 0.7),
      (this.restitution = 0),
      (this.compliance = 0),
      (this.key = -1),
      (this.anchor = null),
      (this.impact = null);
  }
}
class l4 {
  constructor() {
    (this.p = new L()),
      (this.local = new L()),
      (this.material = !1),
      (this.stamp = 0);
  }
}
class c4 {
  constructor() {
    (this.bodyA = null),
      (this.bodyB = null),
      (this.shapeA = null),
      (this.shapeB = null),
      (this.impulse = 0),
      (this.speed = 0),
      (this.point = new L()),
      (this.normal = new L()),
      (this.weight = 0);
  }
}
class ky {
  constructor(t = {}) {
    (this.gravity = new L(0, t.gravity ?? -9.81, 0)),
      (this.substeps = t.substeps ?? 20),
      (this.groundY = 0),
      (this.groundHalfSize = t.groundHalfSize ?? 12);
    const e = this.groundHalfSize;
    (this.groundRect = t.groundRect
      ? { ...t.groundRect }
      : { minX: -e, maxX: e, minZ: -e, maxZ: e }),
      (this.groundFriction = t.groundFriction ?? 0.85),
      (this.groundRestitution = t.groundRestitution ?? 0.1),
      (this.groundMaterial = "concrete"),
      (this.bodies = []),
      (this.staticBodies = []),
      (this.joints = []),
      (this.constraints = []),
      (this.contacts = []),
      (this.contactPool = []),
      (this.numContacts = 0),
      (this.pairs = []),
      (this.sortList = []),
      (this.time = 0),
      (this.restitutionThreshold = 0.35),
      (this.margin = 0.006),
      (this.substepHooks = []),
      (this.impacts = new Map()),
      (this.impactPool = []),
      (this.impactList = []),
      (this.collector = new Um(this._addContact.bind(this))),
      (this.collector.margin = this.margin),
      (this.stats = { contacts: 0, pairs: 0, stepMs: 0 }),
      (this.killY = -30),
      (this.patchAll = !1),
      (this.anchors = new Map()),
      (this.anchorStamp = 0),
      (this.torsionalFriction = !0),
      (this.anchorPass = t.anchorPass ?? !0),
      (this.materialAnchors = t.materialAnchors ?? !0),
      (this.kineticRelease = t.kineticRelease ?? !0),
      (this.anchorRestSpeed = t.anchorRestSpeed ?? 0.1),
      (this.onBodyRemoved = null);
  }
  setGroundRect(t, e, s, n) {
    this.groundRect = { minX: t, maxX: s, minZ: e, maxZ: n };
  }
  overGround(t, e) {
    const s = this.groundRect;
    return t >= s.minX && t <= s.maxX && e >= s.minZ && e <= s.maxZ;
  }
  addBody(t) {
    (t.world = this),
      this.bodies.includes(t) || this.bodies.push(t),
      t.isStatic && !this.staticBodies.includes(t) && this.staticBodies.push(t),
      t.framePos.copy(t.pos),
      t.frameRot.copy(t.rot),
      t.prevPos.copy(t.pos),
      t.prevRot.copy(t.rot);
    for (const e of t.shapes) e.updateWorld(t.pos, t.rot);
    return t.computeAABB(0, this.margin * 2), t;
  }
  removeBody(t) {
    const e = this.bodies.indexOf(t);
    e >= 0 && this.bodies.splice(e, 1);
    const s = this.staticBodies.indexOf(t);
    s >= 0 && this.staticBodies.splice(s, 1),
      (this.joints = this.joints.filter(
        (n) => n.parent !== t && n.child !== t,
      )),
      (this.constraints = this.constraints.filter((n) => n.body !== t)),
      (t.world = null);
  }
  addJoint(t) {
    return this.joints.push(t), t;
  }
  removeJoint(t) {
    const e = this.joints.indexOf(t);
    e >= 0 && this.joints.splice(e, 1);
  }
  addConstraint(t) {
    return this.constraints.push(t), t;
  }
  removeConstraint(t) {
    const e = this.constraints.indexOf(t);
    e >= 0 && this.constraints.splice(e, 1);
  }
  step(t) {
    const e = typeof performance < "u" ? performance.now() : 0,
      s = this.bodies;
    for (const i of s)
      i.framePos.copy(i.pos),
        i.frameRot.copy(i.rot),
        i.contactImpulse.setZero(),
        (i.groundImpulse = 0),
        (i.contactCount = 0),
        (i.groundContact = !1),
        (i.groundContactUsed = 0);
    for (const i of this.joints) i.resetStats();
    this.beginImpacts(), this.broadphase(t);
    const n = t / this.substeps;
    for (let i = 0; i < this.substeps; i++) {
      for (const a of this.substepHooks) a(n, this, i);
      this.integrate(n),
        this.generateContacts(),
        this.solvePositions(n),
        this.updateVelocities(n),
        this.solveVelocities(n);
    }
    for (const i of s) i.force.setZero(), i.torque.setZero();
    this.finishImpacts(), (this.time += t);
    for (let i = s.length - 1; i >= 0; i--) {
      const a = s[i];
      a.pos.y < this.killY &&
        !a.userData.persistent &&
        (this.removeBody(a), this.onBodyRemoved && this.onBodyRemoved(a));
    }
    e && (this.stats.stepMs = performance.now() - e);
  }
  integrate(t) {
    const e = this.gravity;
    for (const s of this.bodies) {
      if (s.invMass === 0) continue;
      s.prevPos.copy(s.pos), s.prevRot.copy(s.rot);
      const n = s.gravityScale;
      (s.vel.x += t * (e.x * n + s.force.x * s.invMass)),
        (s.vel.y += t * (e.y * n + s.force.y * s.invMass)),
        (s.vel.z += t * (e.z * n + s.force.z * s.invMass)),
        s.linearDamping > 0 && s.vel.scale(1 / (1 + t * s.linearDamping));
      const i = s.vel.length();
      i > s.maxLinearSpeed && s.vel.scale(s.maxLinearSpeed / i),
        s.pos.addScaled(s.vel, t),
        s.inertiaMul(s.angVel, bs),
        Is.crossVectors(s.angVel, bs),
        Hs.subVectors(s.torque, Is),
        s.invInertiaMul(Hs, Tn),
        s.angVel.addScaled(Tn, t),
        s.angularDamping > 0 && s.angVel.scale(1 / (1 + t * s.angularDamping));
      const a = s.angVel.length();
      a > s.maxAngularSpeed && s.angVel.scale(s.maxAngularSpeed / a),
        s.rot.integrate(s.angVel, t);
    }
  }
  updateVelocities(t) {
    const e = 1 / t;
    for (const s of this.bodies) {
      if (s.invMass === 0) continue;
      s.vel.subVectors(s.pos, s.prevPos).scale(e),
        fr.multiplyConjB(s.rot, s.prevRot);
      const n = fr.w >= 0 ? 2 * e : -2 * e;
      s.angVel.set(fr.x * n, fr.y * n, fr.z * n);
    }
  }
  broadphase(t) {
    const e = this.sortList;
    e.length = 0;
    for (const n of this.bodies)
      (n.invMass === 0 && !n.kinematic && n._aabbReady) ||
        (n.computeAABB(t, this.margin * 2), (n._aabbReady = !0)),
        e.push(n);
    e.sort((n, i) => n.aabbMin.x - i.aabbMin.x);
    const s = this.pairs;
    s.length = 0;
    for (let n = 0; n < e.length; n++) {
      const i = e[n];
      for (let a = n + 1; a < e.length; a++) {
        const r = e[a];
        if (r.aabbMin.x > i.aabbMax.x) break;
        (i.invMass === 0 && r.invMass === 0) ||
          r.aabbMin.y > i.aabbMax.y ||
          r.aabbMax.y < i.aabbMin.y ||
          r.aabbMin.z > i.aabbMax.z ||
          r.aabbMax.z < i.aabbMin.z ||
          (i.collisionGroup & r.collisionMask) === 0 ||
          (r.collisionGroup & i.collisionMask) === 0 ||
          (i.ignore && i.ignore.has(r)) ||
          (r.ignore && r.ignore.has(i)) ||
          s.push(i, r);
      }
    }
    this.stats.pairs = s.length / 2;
  }
  generateContacts() {
    if (
      ((this.numContacts = 0), this.anchorStamp++, this.anchorStamp % 64 === 0)
    )
      for (const [i, a] of this.anchors)
        a.stamp < this.anchorStamp - 120 && this.anchors.delete(i);
    for (const i of this.bodies)
      if (i.invMass !== 0 || i.kinematic)
        for (const a of i.shapes) a.updateWorld(i.pos, i.rot);
    const t = this.collector;
    t.flip = !1;
    const e = this.pairs,
      s = this.margin;
    for (let i = 0; i < e.length; i += 2) {
      const a = e[i],
        r = e[i + 1];
      for (const l of a.shapes)
        if (l.collides)
          for (const c of r.shapes)
            c.collides &&
              (l.aabbMin.x > c.aabbMax.x + s ||
                l.aabbMax.x < c.aabbMin.x - s ||
                l.aabbMin.y > c.aabbMax.y + s ||
                l.aabbMax.y < c.aabbMin.y - s ||
                l.aabbMin.z > c.aabbMax.z + s ||
                l.aabbMax.z < c.aabbMin.z - s ||
                Bm(l, c, t));
    }
    const n = this.groundY + s;
    for (const i of this.bodies)
      if (!(i.invMass === 0 || i.aabbMin.y > n + 0.5))
        for (const a of i.shapes)
          a.collides && i4(a, this.groundY, this.groundRect, t);
    this.stats.contacts = this.numContacts;
  }
  _addContact(t, e, s, n, i, a, r, l, c, h, u) {
    let d = null;
    if (e && (t.body.invMass === 0 || e.body.invMass === 0)) {
      if (t.body.invMass === 0) {
        const M = t;
        (t = e), (e = M);
        let w = s;
        (s = a),
          (a = w),
          (w = n),
          (n = r),
          (r = w),
          (w = i),
          (i = l),
          (l = w),
          (c = -c),
          (h = -h),
          (u = -u);
      }
      (d = e), (e = null);
    }
    if (e && e.body.id < t.body.id) {
      const M = t;
      (t = e), (e = M);
      let w = s;
      (s = a),
        (a = w),
        (w = n),
        (n = r),
        (r = w),
        (w = i),
        (i = l),
        (l = w),
        (c = -c),
        (h = -h),
        (u = -u);
    }
    let f = this.contactPool[this.numContacts];
    f || ((f = new r4()), this.contactPool.push(f)), this.numContacts++;
    const p = t.body,
      m = e ? e.body : null;
    (f.bodyA = p),
      (f.bodyB = m),
      (f.shapeA = t),
      (f.shapeB = e || d),
      f.n.set(c, h, u),
      Ds.set(s, n, i),
      p.worldToLocal(Ds, f.rA),
      pn.set(a, r, l),
      m ? m.worldToLocal(pn, f.rB) : f.rB.copy(pn),
      (f.lambdaN = 0);
    const x = e || d,
      g = t.friction,
      b = x ? x.friction : this.groundFriction;
    (f.friction = Math.sqrt(g * b)),
      (f.staticFriction = f.friction * 1.15),
      (f.restitution = Math.max(
        t.restitution,
        x ? x.restitution : this.groundRestitution,
      )),
      (f.compliance = Math.max(t.compliance ?? 0, x ? (x.compliance ?? 0) : 0)),
      (f.key = -1),
      (f.anchor = null),
      (f.impact = null);
    const v = t.type === G0 && t.radius <= 0.02;
    let y = this.collector.feature;
    if (
      (d &&
        ((y = -1),
        h > 0.6 &&
          (Hs.set(s - t.wPos.x, n - t.wPos.y, i - t.wPos.z),
          (y =
            8 +
            (Hs.dot(t.ax) > 0 ? 1 : 0) +
            (Hs.dot(t.ay) > 0 ? 2 : 0) +
            (Hs.dot(t.az) > 0 ? 4 : 0)))),
      !e && y >= 0 && (v || this.materialAnchors))
    ) {
      f.key = t.id * 16 + y;
      let M = this.anchors.get(f.key);
      Hs.copy(f.rA).applyQuat(p.prevRot).add(p.prevPos);
      let w =
        !M ||
        M.stamp < this.anchorStamp - 60 ||
        (M.stamp < this.anchorStamp - 1 &&
          Math.hypot(M.p.x - Hs.x, M.p.z - Hs.z) > 0.02);
      !w && !v && M.local.distanceTo(f.rA) > 0.004 && (w = !0);
      let S = !1;
      v ||
        (p.velocityAt(Ds, Tn),
        (S = Math.hypot(Tn.x, Tn.z) > this.anchorRestSpeed),
        S && M && (M.stamp = -1e9)),
        S
          ? (f.key = -1)
          : (w &&
              (M || ((M = new l4()), this.anchors.set(f.key, M)),
              M.p.copy(Hs),
              (M.p.y = this.groundY),
              M.local.copy(f.rA)),
            (M.material = !v),
            (M.stamp = this.anchorStamp),
            (f.anchor = M));
    }
    p.velocityAt(Ds, bs),
      m && (m.velocityAt(pn, Is), bs.sub(Is)),
      (f.vnPre = bs.dot(f.n));
  }
  solvePositions(t) {
    for (const i of this.joints) i.solvePosition(t);
    for (const i of this.constraints) i.solvePosition(t);
    const e = this.numContacts,
      s = this.contactPool;
    let n = 0;
    for (; n < e; ) {
      const i = s[n].bodyA,
        a = s[n].bodyB;
      let r = n + 1;
      for (; r < e && s[r].bodyA === i && s[r].bodyB === a; ) r++;
      for (let l = n; l < r; l++) this.solveContactNormal(s[l], t);
      if (a === null) {
        this.solveAnchoredFriction(s, n, r, t);
        for (let l = n; l < r; l++)
          s[l].anchor || this.solveContactFriction(s[l], t);
      } else if (this.patchAll) this.solvePatchFriction(s, n, r, t);
      else for (let l = n; l < r; l++) this.solveContactFriction(s[l], t);
      n = r;
    }
    if (this.anchorPass)
      for (const i of this.joints) i.enabled && i.solveAnchor(t);
  }
  solveContactNormal(t, e) {
    const s = t.bodyA,
      n = t.bodyB;
    is.copy(t.rA).applyQuat(s.rot),
      Ds.copy(is).add(s.pos),
      n
        ? (ls.copy(t.rB).applyQuat(n.rot), pn.copy(ls).add(n.pos))
        : (pn.copy(t.rB), ls.setZero());
    const i = t.n,
      a = (pn.x - Ds.x) * i.x + (pn.y - Ds.y) * i.y + (pn.z - Ds.z) * i.z;
    a <= 0 || (t.lambdaN += Tr(s, n, i, a, is, ls, t.compliance, e));
  }
  solveAnchoredFriction(t, e, s, n) {
    let i = 0,
      a = 0,
      r = 0,
      l = !1;
    const c = t[e].bodyA;
    for (let d = e; d < s; d++) {
      const f = t[d];
      if (f.lambdaN <= 0 || !f.anchor) continue;
      f.anchor.material && (l = !0),
        (i += f.lambdaN),
        (a += f.staticFriction * f.lambdaN),
        is.copy(f.anchor.material ? f.anchor.local : f.rA).applyQuat(c.rot),
        Ds.copy(is).add(c.pos),
        Xe.subVectors(Ds, f.anchor.p),
        (Xe.y = 0);
      const p = Xe.length();
      p < 1e-10 ||
        (Xe.scale(1 / p), (r += p / Math.max(c.inverseMassAt(is, Xe), 1e-9)));
    }
    if (i <= 0) return;
    a /= i;
    const h = a * i;
    let u = r > h ? h / r : 1;
    u < 1 && this.kineticRelease && l && (u = 0);
    for (let d = e; d < s; d++) {
      const f = t[d];
      if (f.lambdaN <= 0 || !f.anchor) continue;
      const p = f.anchor.material ? f.anchor.local : f.rA;
      is.copy(p).applyQuat(c.rot),
        Ds.copy(is).add(c.pos),
        Xe.subVectors(Ds, f.anchor.p),
        (Xe.y = 0);
      const m = Xe.length();
      m < 1e-10 ||
        (Xe.scale(-1 / m),
        u > 0 && Tr(c, null, Xe, m * u, is, null, 0, n),
        u < 1 &&
          (is.copy(p).applyQuat(c.rot),
          f.anchor.p.copy(is).add(c.pos),
          (f.anchor.p.y = this.groundY)));
    }
  }
  solveContactFriction(t, e) {
    if (t.lambdaN <= 0) return;
    const s = t.bodyA,
      n = t.bodyB;
    is.copy(t.rA).applyQuat(s.rot),
      Ds.copy(is).add(s.pos),
      bs.copy(t.rA).applyQuat(s.prevRot).add(s.prevPos),
      Is.subVectors(Ds, bs),
      n
        ? (ls.copy(t.rB).applyQuat(n.rot),
          pn.copy(ls).add(n.pos),
          Hs.copy(t.rB).applyQuat(n.prevRot).add(n.prevPos),
          Tn.subVectors(pn, Hs),
          Is.sub(Tn))
        : ls.setZero();
    const i = t.n;
    Xe.copy(Is).addScaled(i, -Is.dot(i));
    const a = Xe.length();
    if (a < 1e-10) return;
    Xe.scale(1 / a);
    const r = s.inverseMassAt(is, Xe) + (n ? n.inverseMassAt(ls, Xe) : 0);
    r < 1e-12 ||
      (a / r < t.staticFriction * t.lambdaN &&
        (xh.copy(Xe).negate(), Tr(s, n, xh, a, is, ls, 0, e)));
  }
  contactDynamicFriction(t, e) {
    if (t.lambdaN <= 0) return;
    const s = t.bodyA,
      n = t.bodyB;
    is.copy(t.rA).applyQuat(s.rot),
      Ds.copy(is).add(s.pos),
      s.velocityAt(Ds, bs),
      n
        ? (ls.copy(t.rB).applyQuat(n.rot),
          pn.copy(ls).add(n.pos),
          n.velocityAt(pn, Is),
          bs.sub(Is))
        : ls.setZero();
    const i = t.n;
    Xe.copy(bs).addScaled(i, -bs.dot(i));
    const a = Xe.length();
    if (a < 1e-9) return;
    Xe.scale(1 / a);
    const r = s.inverseMassAt(is, Xe) + (n ? n.inverseMassAt(ls, Xe) : 0);
    if (r < 1e-12) return;
    const l = Math.min((t.friction * t.lambdaN * r) / e, a);
    Tn.copy(Xe).scale(-l / r), this.applyPairImpulse(s, n, Tn, is, ls);
  }
  solvePatchFriction(t, e, s, n) {
    let i = 0;
    Ji.setZero(), jo.setZero(), Pa.setZero();
    let a = 0;
    for (let f = e; f < s; f++) {
      const p = t[f];
      p.lambdaN <= 0 ||
        ((i += p.lambdaN),
        Ji.addScaled(p.rA, p.lambdaN),
        jo.addScaled(p.rB, p.lambdaN),
        Pa.addScaled(p.n, p.lambdaN),
        (a += p.staticFriction * p.lambdaN));
    }
    if (i <= 0) return;
    Ji.scale(1 / i), jo.scale(1 / i), Pa.normalize(), (a /= i);
    const r = t[e].bodyA,
      l = t[e].bodyB;
    let c = 0,
      h = 0;
    for (let f = e; f < s; f++) {
      const p = t[f];
      p.lambdaN <= 0 || ((c += bs.subVectors(p.rA, Ji).length()), h++);
    }
    c = h ? c / h : 0;
    const u = Pa;
    if (c > 1e-4 && this.torsionalFriction) {
      fr.multiplyConjB(r.rot, r.prevRot).toRotVec(bs);
      let f = bs.dot(u);
      l && (fr.multiplyConjB(l.rot, l.prevRot).toRotVec(Is), (f -= Is.dot(u)));
      const p = Math.abs(f);
      if (p > 1e-10) {
        const m = r.inverseMassAngular(u) + (l ? l.inverseMassAngular(u) : 0);
        if (m > 1e-12) {
          const x = a * i * c,
            g = Math.min(p, x * m);
          su(r, l, u, f > 0 ? -g : g, 0, n);
        }
      }
    }
    is.copy(Ji).applyQuat(r.rot),
      Ds.copy(is).add(r.pos),
      bs.copy(Ji).applyQuat(r.prevRot).add(r.prevPos),
      Is.subVectors(Ds, bs),
      l
        ? (ls.copy(jo).applyQuat(l.rot),
          pn.copy(ls).add(l.pos),
          Hs.copy(jo).applyQuat(l.prevRot).add(l.prevPos),
          Tn.subVectors(pn, Hs),
          Is.sub(Tn))
        : ls.setZero(),
      Xe.copy(Is).addScaled(u, -Is.dot(u));
    const d = Xe.length();
    if (d > 1e-10) {
      Xe.scale(1 / d);
      const f = r.inverseMassAt(is, Xe) + (l ? l.inverseMassAt(ls, Xe) : 0);
      if (f > 1e-12) {
        const p = a * i,
          m = Math.min(d, p * f);
        xh.copy(Xe).negate(), Tr(r, l, xh, m, is, ls, 0, n);
      }
    }
  }
  solveVelocities(t) {
    const e = this.numContacts,
      s = this.contactPool,
      n = Math.abs(this.gravity.y),
      i = Math.max(this.restitutionThreshold, 2 * n * t);
    let a = 0;
    for (; a < e; ) {
      const r = s[a].bodyA,
        l = s[a].bodyB;
      let c = a + 1;
      for (; c < e && s[c].bodyA === r && s[c].bodyB === l; ) c++;
      for (let h = a; h < c; h++) {
        const u = s[h];
        if (u.lambdaN <= 0) continue;
        this.recordContact(u, t),
          is.copy(u.rA).applyQuat(r.rot),
          Ds.copy(is).add(r.pos),
          r.velocityAt(Ds, bs),
          l
            ? (ls.copy(u.rB).applyQuat(l.rot),
              pn.copy(ls).add(l.pos),
              l.velocityAt(pn, Is),
              bs.sub(Is))
            : ls.setZero();
        const d = u.n,
          f = bs.dot(d),
          p = Math.abs(u.vnPre) > i ? u.restitution : 0,
          m = -f + Math.max(-p * u.vnPre, 0);
        if (Math.abs(m) < 1e-9) continue;
        const x = r.inverseMassAt(is, d) + (l ? l.inverseMassAt(ls, d) : 0);
        x < 1e-12 ||
          (Tn.copy(d).scale(m / x),
          this.applyPairImpulse(r, l, Tn, is, ls),
          u.impact && m > 0 && (u.impact.impulse += m / x));
      }
      if (l === null || this.patchAll) this.patchDynamicFriction(s, a, c, t);
      else for (let h = a; h < c; h++) this.contactDynamicFriction(s[h], t);
      a = c;
    }
    for (const r of this.joints) r.solveVelocity(t);
    for (const r of this.constraints) r.solveVelocity(t);
  }
  applyPairImpulse(t, e, s, n, i) {
    t.invMass > 0 &&
      (t.vel.addScaled(s, t.invMass),
      Is.crossVectors(n, s),
      t.invInertiaMul(Is, Hs),
      t.angVel.add(Hs)),
      e &&
        e.invMass > 0 &&
        (e.vel.addScaled(s, -e.invMass),
        Is.crossVectors(i, s),
        e.invInertiaMul(Is, Hs),
        e.angVel.sub(Hs));
  }
  patchDynamicFriction(t, e, s, n) {
    let i = 0,
      a = 0,
      r = 0,
      l = 0;
    Ji.setZero(), jo.setZero(), Pa.setZero();
    for (let f = e; f < s; f++) {
      const p = t[f];
      p.lambdaN <= 0 ||
        ((i += p.lambdaN),
        Ji.addScaled(p.rA, p.lambdaN),
        jo.addScaled(p.rB, p.lambdaN),
        Pa.addScaled(p.n, p.lambdaN),
        (a += p.friction * p.lambdaN));
    }
    if (i <= 0) return;
    Ji.scale(1 / i), jo.scale(1 / i), Pa.normalize(), (a /= i);
    for (let f = e; f < s; f++) {
      const p = t[f];
      p.lambdaN <= 0 || ((r += bs.subVectors(p.rA, Ji).length()), l++);
    }
    r = l ? r / l : 0;
    const c = t[e].bodyA,
      h = t[e].bodyB,
      u = Pa;
    if (r > 1e-4 && this.torsionalFriction) {
      let f = c.angVel.dot(u);
      h && (f -= h.angVel.dot(u));
      const p = Math.abs(f);
      if (p > 1e-9) {
        const m = c.inverseMassAngular(u) + (h ? h.inverseMassAngular(u) : 0);
        if (m > 1e-12) {
          const x = Math.min((a * i * r * m) / n, p);
          Tn.copy(u).scale((f > 0 ? -x : x) / m),
            c.invMass > 0 && (c.invInertiaMul(Tn, Hs), c.angVel.add(Hs)),
            h && h.invMass > 0 && (h.invInertiaMul(Tn, Hs), h.angVel.sub(Hs));
        }
      }
    }
    is.copy(Ji).applyQuat(c.rot),
      Ds.copy(is).add(c.pos),
      c.velocityAt(Ds, bs),
      h
        ? (ls.copy(jo).applyQuat(h.rot),
          pn.copy(ls).add(h.pos),
          h.velocityAt(pn, Is),
          bs.sub(Is))
        : ls.setZero(),
      Xe.copy(bs).addScaled(u, -bs.dot(u));
    const d = Xe.length();
    if (d > 1e-9) {
      Xe.scale(1 / d);
      const f = c.inverseMassAt(is, Xe) + (h ? h.inverseMassAt(ls, Xe) : 0);
      if (f > 1e-12) {
        const p = Math.min((a * i * f) / n, d);
        Tn.copy(Xe).scale(-p / f), this.applyPairImpulse(c, h, Tn, is, ls);
      }
    }
  }
  beginImpacts() {
    for (const t of this.impactList) this.impactPool.push(t);
    (this.impactList.length = 0), this.impacts.clear();
  }
  recordContact(t, e) {
    const s = t.bodyA,
      n = t.bodyB,
      i = t.lambdaN / e;
    if ((bs.copy(t.n).scale(i), s.contactImpulse.add(bs), s.contactCount++, n))
      n.contactImpulse.sub(bs), n.contactCount++;
    else if (
      (t.shapeB &&
        t.shapeB.body &&
        t.shapeB.body.kinematic &&
        (t.shapeB.body.contactImpulse.sub(bs), t.shapeB.body.contactCount++),
      (s.groundImpulse += i),
      (s.groundContact = !0),
      s.groundContactUsed < 16)
    ) {
      let c = s.groundContactPoints[s.groundContactUsed];
      c || ((c = new L()), s.groundContactPoints.push(c)),
        c.copy(t.rB),
        s.groundContactUsed++;
    }
    const a = n
      ? s.id < n.id
        ? s.id * 65536 + n.id
        : n.id * 65536 + s.id
      : s.id * 65536;
    let r = this.impacts.get(a);
    r ||
      ((r = this.impactPool.pop() || new c4()),
      (r.bodyA = s),
      (r.bodyB = n),
      (r.shapeA = t.shapeA),
      (r.shapeB = t.shapeB),
      (r.impulse = 0),
      (r.speed = 0),
      (r.weight = 0),
      r.point.setZero(),
      r.normal.copy(t.n),
      this.impacts.set(a, r),
      this.impactList.push(r)),
      (r.impulse += i),
      (t.impact = r);
    const l = -t.vnPre;
    l > r.speed &&
      ((r.speed = l),
      (r.shapeA = t.shapeA),
      (r.shapeB = t.shapeB),
      r.normal.copy(t.n)),
      i > 0 &&
        (Ds.copy(t.rA).applyQuat(s.rot).add(s.pos),
        r.point.scale(r.weight).addScaled(Ds, i),
        (r.weight += i),
        r.point.scale(1 / r.weight));
  }
  finishImpacts() {}
  raycastAll(t, e, s, n = null) {
    const i = [],
      a = { tIn: 0, tOut: 0, normal: new L() };
    for (const r of this.bodies)
      if (!(n && !n(r)))
        for (const l of r.shapes)
          (!l.collides && !l.raycastable) ||
            (l.updateWorld(r.pos, r.rot),
            Yg(l, t, e, s, a) &&
              i.push({
                body: r,
                shape: l,
                tIn: a.tIn,
                tOut: a.tOut,
                point: new L().copy(t).addScaled(e, Math.max(a.tIn, 0)),
                normal: a.normal.clone(),
              }));
    if (e.y < -1e-6) {
      const r = (this.groundY - t.y) / e.y;
      if (r > 0 && r < s) {
        const l = new L().copy(t).addScaled(e, r);
        this.overGround(l.x, l.z) &&
          i.push({
            body: null,
            shape: null,
            tIn: r,
            tOut: r + 1,
            point: l,
            normal: new L(0, 1, 0),
            ground: !0,
          });
      }
    }
    return i.sort((r, l) => r.tIn - l.tIn), i;
  }
  raycast(t, e, s, n = null) {
    const i = this.raycastAll(t, e, s, n);
    return i.length ? i[0] : null;
  }
  surfaceAt(t, e, s = 10, n = null) {
    let i = this.overGround(t, e) ? this.groundY : -1e3,
      a = null,
      r = 1;
    if (this.staticBodies.length) {
      $g.set(t, s, e);
      for (const l of this.staticBodies)
        if (
          !(
            l.aabbMin.x > t ||
            l.aabbMax.x < t ||
            l.aabbMin.z > e ||
            l.aabbMax.z < e ||
            l.aabbMin.y > s ||
            l.aabbMax.y < i
          )
        )
          for (const c of l.shapes) {
            if (
              !c.collides ||
              c.aabbMax.y < i ||
              c.aabbMin.y > s ||
              !Yg(c, $g, h4, s - i, yh) ||
              yh.tIn < 0
            )
              continue;
            const h = s - yh.tIn;
            h > i && ((i = h), (a = l), (r = yh.normal.y));
          }
    }
    return n && ((n.y = i), (n.body = a), (n.ny = r)), i;
  }
}
const $g = new L(),
  h4 = new L(0, -1, 0),
  yh = { tIn: 0, tOut: 0, normal: new L(), normalSet: !1 },
  jg = 0,
  L0 = 1,
  Zg = 2,
  Kg = 3,
  m0 = new ae(),
  bh = new ae(),
  Bn = new ae(),
  Qg = new ae(),
  g0 = new ae(),
  Yd = new ae(),
  $d = new ae(),
  cs = new L(),
  Ga = new L(),
  qa = new L(),
  Jg = new L(),
  bn = new L(),
  Xi = new L(),
  wr = new L(),
  Jn = new L(),
  ca = new L(),
  Ry = { twist: 0, sx: 0, sz: 0 };
function u4(o, t, e = Ry) {
  let s = o.w,
    n = o.x,
    i = o.y,
    a = o.z;
  s < 0 && ((s = -s), (n = -n), (i = -i), (a = -a));
  const r = Math.sqrt(s * s + i * i);
  let l = 1,
    c = 0;
  r > 1e-9 && ((l = s / r), (c = i / r)), (e.twist = 2 * Math.atan2(c, l));
  let h, u;
  t
    ? ((h = l * n - c * a), (u = l * a + c * n))
    : ((h = n * l + a * c), (u = a * l - n * c));
  const d = r,
    f = Math.sqrt(h * h + u * u);
  if (f < 1e-9) (e.sx = 2 * h), (e.sz = 2 * u);
  else {
    const p = 2 * Math.atan2(f, d);
    (e.sx = (h / f) * p), (e.sz = (u / f) * p);
  }
  return e;
}
function d4(o, t, e, s, n) {
  return (
    Yd.set(0, Math.sin(o * 0.5), 0, Math.cos(o * 0.5)),
    Jg.set(t, 0, e),
    $d.setFromRotVec(Jg),
    s ? n.multiplyQuats(Yd, $d) : n.multiplyQuats($d, Yd),
    n
  );
}
class tx {
  constructor(t, e, s = {}) {
    (this.name = s.name ?? "joint"),
      (this.parent = t),
      (this.child = e),
      (this.anchorP = new L().copy(s.anchorP ?? new L())),
      (this.anchorC = new L().copy(s.anchorC ?? new L())),
      (this.frameP = new ae().copy(s.frameP ?? new ae())),
      (this.frameC = new ae().copy(s.frameC ?? new ae())),
      (this.swingInChildFrame = s.swingInChildFrame ?? !1),
      (this.limits = s.limits ?? null),
      (this.limitCompliance = s.limitCompliance ?? 0),
      (this.posCompliance = s.posCompliance ?? 0),
      (this.enabled = !0),
      (this.driveMode = jg),
      (this.target = new ae()),
      (this.targetAngVel = new L()),
      (this.stiffness = 0),
      (this.damping = 0),
      (this.maxTorque = 1 / 0),
      (this.worldDamping = !1),
      (this.limitImpulse = 0),
      (this.driveImpulse = 0),
      (this.anchorImpulse = 0),
      (this.userData = s.userData ?? {});
  }
  setDrive(t, e, s, n, i = 1 / 0) {
    (this.driveMode = t),
      e && this.target.copy(e),
      (this.stiffness = s),
      (this.damping = n),
      (this.maxTorque = i);
  }
  relativeRotation(t) {
    return t.multiplyConjA(this.parent.rot, this.child.rot);
  }
  jointRotation(t) {
    return (
      m0.multiplyQuats(this.parent.rot, this.frameP),
      bh.multiplyQuats(this.child.rot, this.frameC),
      t.multiplyConjA(m0, bh)
    );
  }
  worldAnchor(t) {
    return this.parent.localToWorld(this.anchorP, t);
  }
  resetStats() {
    (this.limitImpulse = 0), (this.driveImpulse = 0), (this.anchorImpulse = 0);
  }
  solvePosition(t) {
    this.enabled &&
      (this.driveMode !== jg && this.stiffness > 0 && this.solveDrive(t),
      this.limits && this.solveLimits(t),
      this.solveAnchor(t));
  }
  solveAnchor(t) {
    const e = this.parent,
      s = this.child;
    Jn.copy(this.anchorP).applyQuat(e.rot),
      ca.copy(this.anchorC).applyQuat(s.rot),
      Xi.copy(Jn).add(e.pos),
      wr.copy(ca).add(s.pos),
      bn.subVectors(Xi, wr);
    const n = bn.length();
    if (n < 1e-10) return;
    bn.scale(1 / n);
    const i = Tr(s, e, bn, n, ca, Jn, this.posCompliance, t);
    this.anchorImpulse += Math.abs(i) / t;
  }
  solveDrive(t) {
    const e = this.parent,
      s = this.child;
    if (this.driveMode === Kg) {
      Bn.multiplyConjB(this.target, e.rot), Bn.toRotVec(cs);
      const a = cs.length();
      if (a < 1e-8) return;
      cs.scale(1 / a);
      const r = su(e, s, cs, a, 1 / this.stiffness, t, this.maxTorque * t * t);
      this.driveImpulse += Math.abs(r) / t;
      return;
    }
    this.driveMode === L0
      ? g0.multiplyQuats(e.rot, this.target)
      : g0.copy(this.target),
      Bn.multiplyConjB(g0, s.rot),
      Bn.toRotVec(cs);
    const n = cs.length();
    if (n < 1e-8) return;
    cs.scale(1 / n);
    const i = su(s, e, cs, n, 1 / this.stiffness, t, this.maxTorque * t * t);
    this.driveImpulse += Math.abs(i) / t;
  }
  solveLimits(t) {
    const e = this.parent,
      s = this.child,
      n = this.limits;
    m0.multiplyQuats(e.rot, this.frameP),
      bh.multiplyQuats(s.rot, this.frameC),
      Bn.multiplyConjA(m0, bh),
      Bn.w < 0 &&
        ((Bn.x = -Bn.x), (Bn.y = -Bn.y), (Bn.z = -Bn.z), (Bn.w = -Bn.w));
    const i = u4(Bn, this.swingInChildFrame, Ry);
    let a = i.twist,
      r = i.sx,
      l = i.sz,
      c = !1;
    if (
      (n.twist &&
        (a < n.twist[0]
          ? ((a = n.twist[0]), (c = !0))
          : a > n.twist[1] && ((a = n.twist[1]), (c = !0))),
      n.swingX && n.swingZ)
    )
      if (n.mode === "box")
        r < n.swingX[0]
          ? ((r = n.swingX[0]), (c = !0))
          : r > n.swingX[1] && ((r = n.swingX[1]), (c = !0)),
          l < n.swingZ[0]
            ? ((l = n.swingZ[0]), (c = !0))
            : l > n.swingZ[1] && ((l = n.swingZ[1]), (c = !0));
      else {
        const d = r >= 0 ? n.swingX[1] : -n.swingX[0],
          f = l >= 0 ? n.swingZ[1] : -n.swingZ[0],
          p = r / Math.max(d, 1e-4),
          m = l / Math.max(f, 1e-4),
          x = p * p + m * m;
        if (x > 1) {
          const g = 1 / Math.sqrt(x);
          (r *= g), (l *= g), (c = !0);
        }
      }
    if (!c) return;
    d4(a, r, l, this.swingInChildFrame, Qg),
      g0.multiplyConjB(Qg, Bn),
      g0.toRotVec(cs),
      cs.applyQuat(m0);
    const h = cs.length();
    if (h < 1e-9) return;
    cs.scale(1 / h);
    const u = su(s, e, cs, h, this.limitCompliance, t);
    this.limitImpulse += Math.abs(u) / t;
  }
  solveVelocity(t) {
    if (!this.enabled || this.damping <= 0) return;
    const e = this.parent,
      s = this.child;
    this.driveMode === Kg
      ? cs.copy(e.angVel).negate()
      : this.worldDamping
        ? cs.copy(s.angVel)
        : cs.subVectors(s.angVel, e.angVel),
      cs.sub(this.targetAngVel);
    const n = cs.length();
    if (n < 1e-9) return;
    cs.scale(1 / n);
    const i = s.inverseMassAngular(cs) + e.inverseMassAngular(cs);
    if (i < 1e-12) return;
    const a = this.damping * t;
    let r = (n * a) / (1 + a * i);
    const l = this.maxTorque * t;
    r > l && (r = l),
      Ga.copy(cs).scale(-r),
      s.invInertiaMul(Ga, qa),
      s.angVel.add(qa),
      Ga.scale(-1),
      e.invInertiaMul(Ga, qa),
      e.angVel.add(qa);
  }
}
class f4 {
  constructor(t, e, s, n = {}) {
    (this.body = t),
      (this.localPoint = new L().copy(e)),
      (this.target = new L().copy(s)),
      (this.compliance = n.compliance ?? 1e-4),
      (this.maxForce = n.maxForce ?? 2e3),
      (this.damping = n.damping ?? 8),
      (this.enabled = !0);
  }
  solvePosition(t) {
    if (!this.enabled) return;
    const e = this.body;
    Jn.copy(this.localPoint).applyQuat(e.rot),
      Xi.copy(Jn).add(e.pos),
      bn.subVectors(this.target, Xi);
    const s = bn.length();
    s < 1e-9 ||
      (bn.scale(1 / s),
      Tr(e, null, bn, s, Jn, null, this.compliance, t, this.maxForce * t * t));
  }
  solveVelocity(t) {
    if (!this.enabled || this.damping <= 0) return;
    const e = this.body;
    Jn.copy(this.localPoint).applyQuat(e.rot),
      Xi.copy(Jn).add(e.pos),
      e.velocityAt(Xi, cs);
    const s = cs.length();
    if (s < 1e-6) return;
    bn.copy(cs).scale(1 / s);
    const n = e.inverseMassAt(Jn, bn),
      i = Math.min(1, this.damping * t),
      a = (s * i) / n;
    Ga.copy(bn).scale(-Math.min(a, this.maxForce * t)), e.applyImpulse(Ga, Xi);
  }
}
class p4 {
  constructor(t, e, s, n, i = {}) {
    (this.A = t),
      (this.B = s),
      (this.localA = new L().copy(e)),
      (this.localB = new L().copy(n)),
      (this.offset = new L()),
      (this.compliance = i.compliance ?? 1 / 4e3),
      (this.maxForce = i.maxForce ?? 600),
      (this.damping = i.damping ?? 0),
      (this.enabled = !1),
      (this.body = t);
  }
  solvePosition(t) {
    if (!this.enabled) return;
    const e = this.A,
      s = this.B;
    Jn.copy(this.localA).applyQuat(e.rot),
      ca.copy(this.localB).applyQuat(s.rot),
      Xi.copy(Jn).add(e.pos),
      wr.copy(ca).add(s.pos),
      bn.subVectors(Xi, wr).sub(this.offset);
    const n = bn.length();
    n < 1e-9 ||
      (bn.scale(-1 / n),
      Tr(e, s, bn, n, Jn, ca, this.compliance, t, this.maxForce * t * t));
  }
  solveVelocity(t) {
    if (!this.enabled || this.damping <= 0) return;
    const e = this.A,
      s = this.B;
    Jn.copy(this.localA).applyQuat(e.rot),
      ca.copy(this.localB).applyQuat(s.rot),
      Xi.copy(Jn).add(e.pos),
      wr.copy(ca).add(s.pos),
      e.velocityAt(Xi, cs),
      s.velocityAt(wr, Ga),
      cs.sub(Ga);
    const n = cs.length();
    if (n < 1e-6) return;
    bn.copy(cs).scale(1 / n);
    const i = e.inverseMassAt(Jn, bn) + s.inverseMassAt(ca, bn);
    if (i < 1e-12) return;
    const a = Math.min(1, this.damping * t),
      r = Math.min((n * a) / i, this.maxForce * t);
    qa.copy(bn).scale(-r),
      e.applyImpulse(qa, Xi),
      qa.negate(),
      s.applyImpulse(qa, wr);
  }
}
const m4 = Math.PI / 180,
  Ly = 12 * m4,
  Py = Math.sin(Ly),
  zy = Math.cos(Ly),
  ni = {
    hipL: new L(0.088, 0.925, 0),
    kneeL: new L(0.097, 0.505, 0.006),
    ankleL: new L(0.105, 0.085, -0.02),
    lumbar: new L(0, 1.035, -0.045),
    thoracic: new L(0, 1.195, -0.055),
    neckBase: new L(0, 1.475, -0.05),
    neckTop: new L(0, 1.595, -0.02),
    shoulderL: new L(0.18, 1.43, -0.035),
  };
ni.elbowL = new L(0.18 + 0.3 * Py, 1.43 - 0.3 * zy, -0.045);
ni.wristL = new L(ni.elbowL.x + 0.255 * Py, ni.elbowL.y - 0.255 * zy, -0.032);
const x0 = new L(0, 1, 0),
  Bp = new L(0, 0, 1),
  pr = new L(1, 0, 0);
function Zo(o, t) {
  const e = t.clone().normalize(),
    s = o.clone().addScaled(e, -o.dot(e)).normalize(),
    n = new L().crossVectors(s, e);
  return new ae().setFromBasis(s, e, n);
}
function Om(o, t) {
  const e = o.clone().normalize(),
    s = t.clone().addScaled(e, -t.dot(e)).normalize(),
    n = new L().crossVectors(e, s);
  return new ae().setFromBasis(n, e, s);
}
const ju = (o, t) => new L().subVectors(t, o).normalize(),
  Vm = ju(ni.shoulderL, ni.elbowL),
  Op = ju(ni.elbowL, ni.wristL),
  Cy = ju(ni.hipL, ni.kneeL),
  Iy = ju(ni.kneeL, ni.ankleL),
  g4 = new L().crossVectors(Bp, Vm).normalize(),
  ex = new L(0.6, -0.45, 0.62).normalize(),
  Vp = [
    {
      name: "pelvis",
      parent: null,
      mass: 8.4,
      shapes: [
        {
          type: "box",
          center: [0, 0.965, -0.025],
          half: [0.1, 0.055, 0.065],
          radius: 0.05,
        },
      ],
      region: "pelvis",
    },
    {
      name: "abdomen",
      parent: "pelvis",
      mass: 12,
      joint: "lumbar",
      shapes: [
        {
          type: "box",
          center: [0, 1.115, -0.02],
          half: [0.09, 0.05, 0.05],
          radius: 0.055,
        },
      ],
      region: "abdomen",
    },
    {
      name: "chest",
      parent: "abdomen",
      mass: 11.6,
      joint: "thoracic",
      shapes: [
        {
          type: "box",
          center: [0, 1.33, -0.035],
          half: [0.105, 0.105, 0.06],
          radius: 0.055,
        },
      ],
      region: "chest",
    },
    {
      name: "neck",
      parent: "chest",
      mass: 1.1,
      joint: "neckBase",
      shapes: [
        {
          type: "capsule",
          a: [0, 1.47, -0.045],
          b: [0, 1.585, -0.022],
          radius: 0.05,
        },
      ],
      region: "neck",
    },
    {
      name: "head",
      parent: "neck",
      mass: 4.5,
      joint: "neckTop",
      shapes: [
        {
          type: "capsule",
          a: [0, 1.638, 0.022],
          b: [0, 1.7, -0.004],
          radius: 0.086,
        },
      ],
      region: "head",
    },
    {
      name: "upperArmL",
      parent: "chest",
      mass: 2,
      joint: "shoulderL",
      shapes: [{ type: "capsule", a: "shoulderL", b: "elbowL", radius: 0.044 }],
      bone: { from: "shoulderL", to: "elbowL", name: "humerus", radius: 0.012 },
      region: "upperArm",
    },
    {
      name: "forearmL",
      parent: "upperArmL",
      mass: 1.2,
      joint: "elbowL",
      shapes: [{ type: "capsule", a: "elbowL", b: "wristL", radius: 0.036 }],
      bone: {
        from: "elbowL",
        to: "wristL",
        name: "radius/ulna",
        radius: 0.011,
      },
      region: "forearm",
    },
    {
      name: "handL",
      parent: "forearmL",
      mass: 0.45,
      joint: "wristL",
      shapes: [{ type: "hand", radius: 0.011 }],
      region: "hand",
    },
    {
      name: "thighL",
      parent: "pelvis",
      mass: 10.5,
      joint: "hipL",
      shapes: [{ type: "capsule", a: "hipL", b: "kneeL", radius: 0.068 }],
      bone: { from: "hipL", to: "kneeL", name: "femur", radius: 0.014 },
      region: "thigh",
    },
    {
      name: "shinL",
      parent: "thighL",
      mass: 3.25,
      joint: "kneeL",
      shapes: [{ type: "capsule", a: "kneeL", b: "ankleL", radius: 0.047 }],
      bone: { from: "kneeL", to: "ankleL", name: "tibia", radius: 0.013 },
      region: "shin",
    },
    {
      name: "footL",
      parent: "shinL",
      mass: 1.05,
      joint: "ankleL",
      shapes: [
        {
          type: "box",
          center: [0.105, 0.03, 0.05],
          half: [0.042, 0.02, 0.112],
          radius: 0.01,
        },
      ],
      region: "foot",
    },
  ],
  jd = {
    lumbar: {
      frame: Zo(pr, x0),
      swingChild: !1,
      limits: {
        swingX: [-0.4, 0.78],
        swingZ: [-0.36, 0.36],
        twist: [-0.2, 0.2],
        mode: "ellipse",
      },
      k: 1100,
      d: 70,
      tmax: 300,
    },
    thoracic: {
      frame: Zo(pr, x0),
      swingChild: !1,
      limits: {
        swingX: [-0.32, 0.55],
        swingZ: [-0.32, 0.32],
        twist: [-0.5, 0.5],
        mode: "ellipse",
      },
      k: 900,
      d: 55,
      tmax: 250,
    },
    neckBase: {
      frame: Zo(pr, x0),
      swingChild: !1,
      limits: {
        swingX: [-0.65, 0.62],
        swingZ: [-0.45, 0.45],
        twist: [-0.6, 0.6],
        mode: "ellipse",
      },
      k: 160,
      d: 7,
      tmax: 70,
    },
    neckTop: {
      frame: Zo(pr, x0),
      swingChild: !1,
      limits: {
        swingX: [-0.45, 0.38],
        swingZ: [-0.28, 0.28],
        twist: [-0.8, 0.8],
        mode: "ellipse",
      },
      k: 90,
      d: 3.5,
      tmax: 40,
    },
    shoulderL: {
      frame: Om(ex, x0),
      centerDir: ex,
      boneDir: Vm,
      swingChild: !1,
      limits: {
        swingX: [-1.3, 2.1],
        swingZ: [-1.5, 1.85],
        twist: [-1.25, 1.35],
        mode: "ellipse",
      },
      k: 160,
      d: 9,
      tmax: 95,
    },
    elbowL: {
      frame: Zo(Op, g4),
      swingChild: !0,
      limits: {
        twist: [-2.55, 0.04],
        swingX: [-0.06, 0.06],
        swingZ: [-0.05, 0.05],
        mode: "box",
      },
      k: 80,
      d: 3,
      tmax: 70,
    },
    wristL: {
      frame: Zo(Bp, Op),
      swingChild: !0,
      limits: {
        twist: [-1.45, 1.45],
        swingX: [-1.3, 1.1],
        swingZ: [-0.35, 0.6],
        mode: "ellipse",
      },
      k: 14,
      d: 0.35,
      tmax: 16,
    },
    hipL: {
      frame: Zo(pr, Cy),
      swingChild: !1,
      limits: {
        swingX: [-2.05, 0.48],
        swingZ: [-0.8, 0.5],
        twist: [-0.8, 0.65],
        mode: "ellipse",
      },
      k: 650,
      d: 40,
      tmax: 330,
    },
    kneeL: {
      frame: Zo(Iy, pr),
      swingChild: !0,
      limits: {
        twist: [-0.03, 2.55],
        swingX: [-0.12, 0.12],
        swingZ: [-0.04, 0.04],
        mode: "box",
      },
      k: 650,
      d: 40,
      tmax: 320,
    },
    ankleL: {
      frame: Zo(Bp, pr),
      swingChild: !0,
      limits: {
        twist: [-0.38, 0.85],
        swingX: [-0.45, 0.28],
        swingZ: [-0.22, 0.22],
        mode: "ellipse",
      },
      k: 450,
      d: 21,
      tmax: 220,
    },
  };
function Bl(o) {
  return new L(-o.x, o.y, o.z);
}
function x4(o) {
  const t = new L(1, 0, 0).applyQuat(o),
    e = new L(0, 1, 0).applyQuat(o),
    s = new L(0, 0, 1).applyQuat(o),
    n = Bl(t).negate(),
    i = Bl(e),
    a = Bl(s);
  return new ae().setFromBasis(n, i, a);
}
function y4(o) {
  return {
    mode: o.mode,
    swingX: [o.swingX[0], o.swingX[1]],
    swingZ: [-o.swingZ[1], -o.swingZ[0]],
    twist: [-o.twist[1], -o.twist[0]],
  };
}
function Cs(o) {
  if (ni[o]) return ni[o].clone().scale(__S.s);
  if (o.endsWith("R")) {
    const t = ni[o.slice(0, -1) + "L"];
    if (t) return Bl(t).scale(__S.s);
  }
  throw new Error(`unknown landmark ${o}`);
}
function _r(o) {
  return o.endsWith("L") ? o.slice(0, -1) + "R" : o;
}
function b4(o) {
  const t = { ...o };
  return (
    Array.isArray(o.center) &&
      (t.center = [-o.center[0], o.center[1], o.center[2]]),
    typeof o.a == "string"
      ? (t.a = _r(o.a))
      : Array.isArray(o.a) && (t.a = [-o.a[0], o.a[1], o.a[2]]),
    typeof o.b == "string"
      ? (t.b = _r(o.b))
      : Array.isArray(o.b) && (t.b = [-o.b[0], o.b[1], o.b[2]]),
    t
  );
}
function v4() {
  const o = [];
  for (const s of Vp) o.push({ ...s, side: s.name.endsWith("L") ? "L" : "C" });
  for (const s of Vp) {
    if (!s.name.endsWith("L")) continue;
    const n = {
      ...s,
      name: _r(s.name),
      parent: _r(s.parent),
      joint: _r(s.joint),
      side: "R",
      shapes: s.shapes.map(b4),
      bone: s.bone
        ? { ...s.bone, from: _r(s.bone.from), to: _r(s.bone.to) }
        : void 0,
    };
    o.push(n);
  }
  const t = [],
    e = new Set();
  for (; t.length < o.length; )
    for (const s of o)
      e.has(s.name) ||
        ((!s.parent || e.has(s.parent)) && (t.push(s), e.add(s.name)));
  return t;
}
function M4(o) {
  if (jd[o]) return { ...jd[o], name: o, side: o.endsWith("L") ? "L" : "C" };
  const t = jd[o.slice(0, -1) + "L"];
  if (!t) throw new Error(`unknown joint ${o}`);
  const e = {
    ...t,
    name: o,
    side: "R",
    frame: x4(t.frame),
    limits: y4(t.limits),
  };
  return (
    t.centerDir && (e.centerDir = Bl(t.centerDir)),
    t.boneDir && (e.boneDir = Bl(t.boneDir)),
    e
  );
}
Vp.reduce((o, t) => o + t.mass * (t.name.endsWith("L") ? 2 : 1), 0);
const rn = { upperArmDirL: Vm, forearmDirL: Op, thighDirL: Cy, shinDirL: Iy },
  sx = new L(),
  w4 = new ae(),
  nx = 2;
function wu(o) {
  return typeof o == "string" ? Cs(o) : new L(o[0] * __S.s, o[1] * __S.s, o[2] * __S.s);
}
function _4(o, t) {
  const e = { friction: 0.9, restitution: 0.05, material: "flesh" };
  if (o.type === "capsule")
    return kn.capsuleBetween(wu(o.a), wu(o.b), o.radius * __S.r, e);
  if (o.type === "box") {
    const foot = t.name.startsWith("foot"),
      hw = foot ? __S.s : __S.r;
    const s = kn.box(o.half[0] * hw, o.half[1] * __S.s, o.half[2] * (foot ? __S.s : __S.r), {
      ...e,
      radius: o.radius * hw,
    });
    return (
      s.localPos.set(o.center[0] * __S.s, o.center[1] * __S.s, o.center[2] * __S.s),
      t.name.startsWith("foot") && ((s.friction = 1), (s.material = "shoe")),
      s
    );
  }
  if (o.type === "hand") {
    const s = t.side,
      n = Cs(s === "L" ? "wristL" : "wristR"),
      i = rn.forearmDirL.clone();
    s === "R" && (i.x = -i.x);
    const a = kn.box(0.006 * __S.s, 0.072 * __S.s, 0.033 * __S.s, { ...e, radius: o.radius * __S.s });
    return (
      a.localPos.copy(n).addScaled(i, 0.083 * __S.s),
      a.localRot.setFromUnitVectors(new L(0, -1, 0), i),
      a
    );
  }
  throw new Error(`bad shape ${o.type}`);
}
class Dy {
  constructor(t, e = {}) {
    (this.world = t),
      (this.segments = {}),
      (this.segList = []),
      (this.joints = {}),
      (this.jointList = []),
      (this.bodies = []),
      (this.totalMass = 0),
      (this.extraBodies = []),
      (this.fractureJoints = []),
      (this.buildScale = { ...__S }),
      this.build(),
      this.resetPose(e.position ?? new L(0, 0, 0), e.yaw ?? 0);
  }
  build() {
    const t = v4();
    for (const e of t) {
      const s = new uc({
        name: e.name,
        linearDamping: 0.02,
        angularDamping: 0.15,
      });
      s.collisionGroup = nx;
      const n = {
        name: e.name,
        def: e,
        side: e.side,
        body: s,
        bindPos: new L(),
        parent: null,
        children: [],
        joint: null,
        bone: e.bone ?? null,
        fractured: null,
      };
      for (const a of e.shapes) {
        const r = _4(a, n);
        (r.tag = e.name), s.addShape(r);
      }
      const i = s.setMassFromShapes(e.mass * __S.m);
      n.bindPos.copy(i),
        (s.userData = { ragdoll: this, segment: n }),
        (this.segments[e.name] = n),
        this.segList.push(n),
        this.bodies.push(s),
        (this.totalMass += e.mass * __S.m);
    }
    for (const e of this.segList) {
      const s = e.def;
      if (!s.parent) continue;
      const n = this.segments[s.parent];
      (e.parent = n), n.children.push(e);
      const i = M4(s.joint);
      (i.k *= __S.g), (i.d *= __S.g), (i.tmax *= __S.g);
      const
        a = Cs(s.joint);
      let r = i.frame.clone(),
        l = i.frame.clone();
      if (i.centerDir) {
        const h = new ae().setFromUnitVectors(i.centerDir, i.boneDir);
        l = new ae().multiplyQuats(h, r);
      }
      const c = new tx(n.body, e.body, {
        name: s.joint,
        anchorP: new L().subVectors(a, n.bindPos),
        anchorC: new L().subVectors(a, e.bindPos),
        frameP: r,
        frameC: l,
        swingInChildFrame: i.swingChild,
        limits: i.limits,
        limitCompliance: 1e-6,
      });
      (c.userData = { def: i, segment: e, bindAnchor: a }),
        (e.joint = c),
        (this.joints[s.joint] = c),
        this.jointList.push(c);
    }
    this.setupCollisionFilter();
  }
  setupCollisionFilter() {
    for (const s of this.segList) {
      s.body.ignore = new Set();
      for (const n of s.body.shapes) n.updateWorld(s.bindPos, new ae());
    }
    for (const s of this.segList)
      s.parent &&
        (s.body.ignore.add(s.parent.body), s.parent.body.ignore.add(s.body));
    let t = !1;
    const e = new Um(() => {
      t = !0;
    });
    e.margin = 0.004;
    for (let s = 0; s < this.segList.length; s++)
      for (let n = s + 1; n < this.segList.length; n++) {
        const i = this.segList[s].body,
          a = this.segList[n].body;
        if (!i.ignore.has(a)) {
          t = !1;
          for (const r of i.shapes) for (const l of a.shapes) Bm(r, l, e);
          t && (i.ignore.add(a), a.ignore.add(i));
        }
      }
  }
  addToWorld() {
    for (const t of this.bodies) this.world.addBody(t);
    for (const t of this.jointList) this.world.addJoint(t);
  }
  removeFromWorld() {
    for (const t of this.allBodies()) this.world.removeBody(t);
    for (const t of this.jointList) this.world.removeJoint(t);
    for (const t of this.fractureJoints) this.world.removeJoint(t);
  }
  fractureSegment(t, e) {
    if (t.fractured || !t.bone) return null;
    const s = t.def.shapes[0];
    if (s.type !== "capsule") return null;
    e = Math.min(Math.max(e, 0.22), 0.78);
    const n = wu(s.a),
      i = wu(s.b),
      a = new L().lerpVectors(n, i, e),
      r = new L().subVectors(i, n).normalize(),
      l = t.body,
      c = l.mass,
      h = { friction: 0.9, restitution: 0.05, material: "flesh" },
      u = new uc({
        name: t.name + "Frag",
        linearDamping: l.linearDamping,
        angularDamping: l.angularDamping,
      });
    u.collisionGroup = nx;
    const d = kn.capsuleBetween(a, i, s.radius, h);
    (d.tag = t.name), u.addShape(d);
    const f = u.setMassFromShapes(c * (1 - e)),
      p = t.bindPos.clone();
    l.shapes.length = 0;
    const m = kn.capsuleBetween(n, a, s.radius, h);
    (m.tag = t.name), l.addShape(m);
    const x = l.setMassFromShapes(c * e),
      g = new L().subVectors(x, p),
      b = g.clone().applyQuat(l.rot),
      v = l.angVel.clone(),
      y = l.vel.clone(),
      M = l.pos.clone();
    l.pos.add(b),
      l.prevPos.add(b),
      l.framePos.add(g.clone().applyQuat(l.frameRot)),
      l.vel.add(new L().crossVectors(v, b)),
      t.bindPos.copy(x);
    const w = new L().subVectors(f, p).applyQuat(l.rot);
    u.setPose(new L().addVectors(M, w), l.rot),
      u.framePos
        .copy(l.framePos)
        .add(new L().subVectors(f, x).applyQuat(l.frameRot)),
      u.frameRot.copy(l.frameRot),
      u.vel.copy(y).add(new L().crossVectors(v, w)),
      u.angVel.copy(v),
      (u.userData = { ragdoll: this, segment: t, fragment: !0, bindPos: f });
    for (const A of this.jointList)
      if ((A.child === l && A.anchorC.sub(g), A.parent === l)) {
        const E = new L().addVectors(A.anchorP, p);
        new L().subVectors(E, a).dot(r) > 0
          ? ((A.parent = u), A.anchorP.subVectors(E, f))
          : A.anchorP.sub(g);
      }
    const S = Om(r, new L(0, 0, 1)),
      _ = new tx(l, u, {
        name: t.name + "Fracture",
        anchorP: new L().subVectors(a, x),
        anchorC: new L().subVectors(a, f),
        frameP: S,
        frameC: S,
        limits: {
          swingX: [-1, 1],
          swingZ: [-0.9, 0.9],
          twist: [-0.7, 0.7],
          mode: "ellipse",
        },
        limitCompliance: 2e-5,
      });
    (_.driveMode = 1),
      _.target.identity(),
      (_.stiffness = 3),
      (_.damping = 0.5),
      (_.maxTorque = 12),
      (_.userData = { fracture: !0, segment: t }),
      (u.ignore = new Set(l.ignore)),
      u.ignore.add(l),
      l.ignore.add(u);
    for (const A of this.allBodies())
      A.ignore && A.ignore.has(l) && A.ignore.add(u);
    return (
      this.world.addBody(u),
      this.world.addJoint(_),
      this.extraBodies.push(u),
      this.fractureJoints.push(_),
      (t.fractured = {
        extra: [u],
        joint: _,
        t: e,
        pointBind: a,
        axis: r,
        fragBind: f,
        delta: g,
      }),
      { seg: t, fragment: u, joint: _, pointBind: a, axisBind: r, delta: g }
    );
  }
  resetPose(t, e = 0) {
    (this.origin = t.clone()), (this.yaw = e);
    const s = new ae().setFromAxisAngle(new L(0, 1, 0), e);
    for (const n of this.segList)
      sx.copy(n.bindPos).applyQuat(s).add(t),
        n.body.setPose(sx, s),
        n.body.vel.setZero(),
        n.body.angVel.setZero();
  }
  applyPose(t, e, s) {
    this.segments.pelvis.body.setPose(t, e);
    for (const i of this.segList) {
      if (!i.parent) continue;
      const a = i.joint,
        r = i.parent.body,
        l = s[a.name] ?? w4.identity(),
        c = new ae().multiplyQuats(r.rot, l),
        h = r.localToWorld(a.anchorP, new L()),
        u = new L().copy(a.anchorC).applyQuat(c);
      u.subVectors(h, u), i.body.setPose(u, c);
    }
  }
  get pelvis() {
    return this.segments.pelvis.body;
  }
  computeCOM(t = new L()) {
    t.setZero();
    let e = 0;
    for (const s of this.allBodies()) t.addScaled(s.pos, s.mass), (e += s.mass);
    return t.scale(1 / e);
  }
  computeCOMVelocity(t = new L()) {
    t.setZero();
    let e = 0;
    for (const s of this.allBodies()) t.addScaled(s.vel, s.mass), (e += s.mass);
    return t.scale(1 / e);
  }
  allBodies() {
    return this.extraBodies.length
      ? this.bodies.concat(this.extraBodies)
      : this.bodies;
  }
  isRagdollBody(t) {
    return t && t.userData && t.userData.ragdoll === this;
  }
  segmentOf(t) {
    return t && t.userData && t.userData.ragdoll === this
      ? t.userData.segment
      : null;
  }
  kineticEnergy() {
    let t = 0;
    for (const e of this.allBodies()) t += e.kineticEnergy();
    return t;
  }
}
const Mo = new L(),
  ol = new L(),
  y0 = new L(),
  al = new L(),
  rl = new L(),
  Qd = new L(),
  vh = new L(),
  ux = new ae(),
  dx = new ae();
function ll(o, t, e, s, n) {
  return (
    y0.copy(o).normalize(),
    Qd.copy(t).addScaled(y0, -t.dot(y0)).normalize(),
    vh.crossVectors(y0, Qd),
    ux.setFromBasis(y0, Qd, vh),
    al.copy(e).normalize(),
    rl.copy(s).addScaled(al, -s.dot(al)),
    rl.lengthSq() < 1e-10 && al.anyPerpendicular(rl),
    rl.normalize(),
    vh.crossVectors(al, rl),
    dx.setFromBasis(al, rl, vh),
    n.multiplyConjB(dx, ux)
  );
}
function fx(o, t, e, s, n, i, a = 0) {
  Mo.subVectors(t, o);
  let r = Mo.length();
  const l = r / (e + s),
    c = (e + s) * Math.cos(a * 0.5) - 1e-4,
    h = Math.abs(e - s) + 0.02;
  r < 1e-6 ? (Mo.set(0, -1, 0), (r = h)) : Mo.scale(1 / r),
    (r = Math.min(Math.max(r, h), c)),
    ol.copy(n).addScaled(Mo, -n.dot(Mo)),
    ol.lengthSq() < 1e-10 && Mo.anyPerpendicular(ol),
    ol.normalize();
  const u = (e * e + r * r - s * s) / (2 * e * r),
    d = Math.min(1, Math.max(-1, u)),
    f = Math.sqrt(1 - d * d);
  return (
    i.mid
      .copy(o)
      .addScaled(Mo, e * d)
      .addScaled(ol, e * f),
    i.end.copy(o).addScaled(Mo, r),
    i.dir1.subVectors(i.mid, o).normalize(),
    i.dir2.subVectors(i.end, i.mid).normalize(),
    i.axis.crossVectors(ol, Mo).normalize(),
    (i.reach = l),
    i
  );
}
function px() {
  return {
    mid: new L(),
    end: new L(),
    dir1: new L(),
    dir2: new L(),
    axis: new L(),
    reach: 0,
  };
}
const b0 = (o) => (o === "L" ? "R" : "L"),
  Ca = new L(),
  Ko = new L(),
  Jd = new L(),
  mx = new L(),
  cl = 0.085,
  gx = new L(0, -0.03, 0.09),
  hl = 0.2,
  Mh = 0.25,
  I4 = [
    [-0.07, 0],
    [0.04, 0.06],
    [0.04, -0.06],
    [0.12, 0],
    [0.2, 0.04],
    [0.2, -0.04],
    [0.24, 0],
    [0.27, 0],
  ];
class D4 {
  constructor(t) {
    (this.ctl = t),
      (this.maxSpeed = 1.25),
      (this.width = 0.17),
      (this.look = new L()),
      (this.dir = new L(0, 0, 1)),
      (this.violation = new L()),
      (this.catchMargin = 0),
      this.reset();
  }
  reset() {
    (this.state = "idle"),
      (this.speed = 0),
      (this.nextFoot = null),
      (this.ds = 0),
      (this.shift = null),
      (this.pause = 0),
      (this.interrupted = !1),
      (this.progressT = 0),
      (this.progressD = 1 / 0),
      (this.stuck = 0),
      (this.remaining = 1 / 0),
      (this.obstacleAhead = null),
      (this.crossTrack = 0);
  }
  get active() {
    return this.state !== "idle";
  }
  get stepping() {
    return this.active && this.ctl.mode === "balance" && this.pause <= 0;
  }
  fitness() {
    const t = this.ctl,
      e = Math.min(t.legStrength.L, t.legStrength.R);
    return (
      j((e - 0.45) / 0.45, 0, 1) *
      j(1 - 0.45 * t.pain, 0.4, 1) *
      j(t.balanceSkill, 0.3, 1)
    );
  }
  swingTime(t) {
    return t <= 1.25
      ? j(0.5 - 0.065 * t, 0.41, 0.5)
      : Math.max(0.34, 0.42 - 0.07 * (t - 1.25));
  }
  dsTime(t) {
    return t <= 1.25
      ? j(0.16 - 0.05 * t, 0.09, 0.16)
      : Math.max(0.02, 0.0875 - 0.06 * (t - 1.25));
  }
  begin() {
    this.state === "idle"
      ? ((this.state = "walk"),
        (this.speed = 0),
        (this.nextFoot = null),
        (this.ds = 0),
        (this.shift = null),
        (this.progressT = 0),
        (this.progressD = 1 / 0),
        (this.stuck = 0))
      : (this.state = "walk");
  }
  finish(t = "arrived") {
    this.planted = null;
    const e = this.ctl.nav;
    e &&
      !e.done &&
      ((e.done = !0),
      (e.status = t),
      this.ctl.events.push({
        type: "walkEnd",
        status: t,
        time: this.ctl.time,
      }));
    const s = this.state !== "idle";
    if (
      ((this.state = "idle"),
      (this.shift = null),
      (this.speed = 0),
      s && this.ctl.mode === "balance")
    ) {
      const n = this.ctl,
        i = n.sens,
        a = n.soleCenter("L", Ca),
        r = n.soleCenter("R", Ko),
        l = r.x - a.x,
        c = r.z - a.z,
        h = j(
          ((i.cp.x - a.x) * l + (i.cp.z - a.z) * c) / (l * l + c * c || 1e-6),
          0.15,
          0.85,
        );
      n.cdes && n.cdes.set(a.x + l * h, 0, a.z + c * h), n.comInt.setZero();
    }
  }
  update(t) {
    const e = this.ctl,
      s = e.nav,
      n = e.sens;
    if (!s || s.done) {
      this.state !== "idle" && this.finish(s ? s.status : "stopped");
      return;
    }
    if ((this.state === "idle" && this.begin(), e.mode !== "balance")) {
      (this.interrupted = !0),
        (this.speed = 0),
        (this.nextFoot = null),
        (this.shift = null),
        (e.mode === "dead" || e.mode === "unconscious") && this.finish(e.mode);
      return;
    }
    this.interrupted &&
      ((this.interrupted = !1),
      (s.needsReplan = !0),
      (this.pause = Math.max(this.pause, 1)),
      (this.progressT = 0),
      (this.progressD = 1 / 0)),
      (this.pause = Math.max(0, this.pause - t));
    const i = this.fitness();
    if (i <= 0.02) {
      this.finish("too injured");
      return;
    }
    const a = s.path,
      r = Ca.set(n.com.x, 0, n.com.z);
    let l = j(s.i || 0, 0, a.length - 1);
    for (;;) {
      const k = a[l],
        T = l > 0 ? a[l - 1] : s.start,
        D = k.x - T.x,
        C = k.z - T.z,
        P = D * D + C * C,
        R = P > 1e-6 ? ((r.x - T.x) * D + (r.z - T.z) * C) / P : 1,
        z = Math.hypot(k.x - r.x, k.z - r.z);
      if (l < a.length - 1 && (R > 1 || z < 0.35)) l++;
      else break;
    }
    s.i = l;
    let c = Math.hypot(a[l].x - r.x, a[l].z - r.z);
    for (let k = l + 1; k < a.length; k++)
      c += Math.hypot(a[k].x - a[k - 1].x, a[k].z - a[k - 1].z);
    if (((this.remaining = c), s.goalEnds)) {
      let k = 0;
      for (; k < s.goalEnds.length - 1 && l >= s.goalEnds[k]; ) k++;
      s.goalIndex = k;
    }
    const h = Math.hypot(n.comVel.x, n.comVel.z);
    {
      const k = a[l],
        T = l > 0 ? a[l - 1] : s.start,
        D = k.x - T.x,
        C = k.z - T.z,
        P = Math.hypot(D, C);
      (this.crossTrack =
        P > 0.05
          ? j(((n.cp.x - T.x) * C - (n.cp.z - T.z) * D) / P, -0.4, 0.4)
          : 0),
        (P <= 0.05 || c < 0.6) && (this.crossTrack = 0);
    }
    const u = 0.55 + 0.45 * h,
      d = this.pointAlong(a, l, r, u, Ko),
      f = Math.atan2(this.dir.x, this.dir.z);
    this.dir.set(d.x - r.x, 0, d.z - r.z),
      this.dir.lengthSq() < 1e-6 &&
        this.dir.set(Math.sin(e.heading), 0, Math.cos(e.heading)),
      this.dir.normalize();
    let p = 1;
    if (e.crowd && e.crowd.length) {
      let k = 0,
        T = 0;
      for (const D of e.crowd) {
        const C = r.x - D.x,
          P = r.z - D.z,
          R = Math.hypot(C, P) || 0.001,
          z = -(C * this.dir.x + P * this.dir.z);
        if (z < -0.2) continue;
        const H = 0.45 + D.r;
        if (R > H + 0.9) continue;
        const N = j((H + 0.9 - R) / 0.9, 0, 1.5),
          I = this.dir.x * P - this.dir.z * C > 0 ? 1 : -1;
        (k += -this.dir.z * I * N + (C / R) * N * 0.5),
          (T += this.dir.x * I * N + (P / R) * N * 0.5),
          z > 0 &&
            Math.abs(this.dir.x * P - this.dir.z * C) < H &&
            (p = Math.min(p, j((R - H) / 1, 0.35, 1)));
      }
      (this.dir.x += k * 1.2), (this.dir.z += T * 1.2), this.dir.normalize();
    }
    const m = Math.atan2(this.dir.x, this.dir.z);
    if (h > 1 && this.stepping) {
      const k = ee(1, 1.8, h),
        T = Ht(5, 1.6, k),
        D = Ht(1.4, 0.35, k),
        C = Math.atan2(n.comVel.x, n.comVel.z);
      let P = f + j(cn(m - f), -T * t, T * t);
      (P = C + j(cn(P - C), -D, D)), this.dir.set(Math.sin(P), 0, Math.cos(P));
    }
    const x = Math.atan2(this.dir.x, this.dir.z),
      g = cn(x - e.heading),
      b = cn(m - e.heading),
      v = (s.speed ?? this.maxSpeed) * (0.35 + 0.65 * i),
      y = Math.sqrt(2 * 0.75 * Math.max(0, c - 0.12)),
      M = ee(1.2, 1.8, h),
      w = j(1 - (Math.abs(b) - Ht(0.3, 0.12, M)) / 0.6, 0.4 * M, 1),
      S = this.obstacleAhead ? 0.7 : 10;
    let _ = Math.min(v, y, S) * w * p;
    this.pause > 0 && (_ = 0),
      (this.speed = Qs(
        this.speed,
        _,
        (_ > this.speed ? 0.8 : Ht(1.6, 1.1, M)) * t,
      ));
    const A = e.step;
    if (
      (A &&
        A.kind === "walk" &&
        A.turnTo !== void 0 &&
        (e.heading = Qs(
          e.heading,
          e.heading + cn(A.turnTo - e.heading),
          3 * t,
        )),
      (this.err = g),
      (s.goalIndex === void 0 ||
        !s.goals ||
        s.goalIndex >= s.goals.length - 1) &&
      (c < 0.25 || (c < 0.5 && (h < 0.2 || Math.abs(g) > 1.2)))
        ? (this.state = "stop")
        : this.state === "stop" && c > 0.8 && (this.state = "walk"),
      (this.stopT = this.state === "stop" ? (this.stopT || 0) + t : 0),
      this.state === "stop" &&
        ((!e.step &&
          h < 0.12 &&
          n.footContact.L &&
          n.footContact.R &&
          this.pause <= 0) ||
          this.stopT > 2.5))
    ) {
      this.finish("arrived");
      return;
    }
    if (((this.progressT += t), c < this.progressD - 0.3))
      (this.progressD = c), (this.progressT = 0);
    else if (this.progressT > 6) {
      if (((this.progressT = 0), (this.progressD = c), ++this.stuck > 2)) {
        this.finish("stuck");
        return;
      }
      s.needsReplan = !0;
    }
    if (((this.obstacleAhead = this.scanAhead(r, 2.2)), !e.threat)) {
      if (this.obstacleAhead)
        this.look.set(
          this.obstacleAhead.x,
          this.obstacleAhead.y + 0.1,
          this.obstacleAhead.z,
        );
      else {
        const k = this.pointAlong(a, l, r, 3, Jd);
        this.look.set(k.x, n.floorY + 1.15, k.z);
      }
      e.lookTarget = this.look;
    }
  }
  meanFootYaw() {
    const t = this.plantYaw("L"),
      e = this.plantYaw("R");
    return Math.atan2(Math.sin(t) + Math.sin(e), Math.cos(t) + Math.cos(e));
  }
  plantYaw(t) {
    const e = this.planted;
    return e && e[t] !== null ? e[t] : this.ctl.footYaw(t);
  }
  onLand(t) {
    const e = this.planted || (this.planted = { L: null, R: null });
    (e[t.foot] = this.active ? t.yaw : null), (this.nextFoot = b0(t.foot));
  }
  pointAlong(t, e, s, n, i) {
    const a = this.ctl.nav;
    let r = e > 0 ? t[e - 1] : a.start,
      l = t[e],
      c = l.x - r.x,
      h = l.z - r.z;
    const u = c * c + h * h,
      d = u > 1e-6 ? j(((s.x - r.x) * c + (s.z - r.z) * h) / u, 0, 1) : 1;
    let f = r.x + c * d,
      p = r.z + h * d,
      m = n,
      x = e;
    for (;;) {
      const g = t[x].x - f,
        b = t[x].z - p,
        v = Math.hypot(g, b);
      if (v >= m || x === t.length - 1) {
        const y = v > 1e-6 ? Math.min(1, m / v) : 0;
        return i.set(f + g * y, t[x].y, p + b * y);
      }
      (m -= v), (f = t[x].x), (p = t[x].z), x++;
    }
  }
  scanAhead(t, e) {
    const s = this.ctl,
      i = s.sens.floorY;
    for (let a = 0.4; a < e; a += 0.1) {
      const r = t.x + this.dir.x * a,
        l = t.z + this.dir.z * a,
        c = s.floorAt(r, l, i);
      if (Math.abs(c - i) > 0.03) return mx.set(r, c, l);
    }
    return null;
  }
  gait(t) {
    const e = this.ctl,
      s = e.sens;
    if (!this.stepping) return !1;
    const n = Math.hypot(s.comVel.x, s.comVel.z);
    if (
      (this.state === "stop" &&
        this.speed < 0.15 &&
        n < 0.25 &&
        s.cpDist < 0.02) ||
      (this.speed < 0.1 &&
        Math.abs(this.err || 0) > 0.6 &&
        n > 0.3 &&
        !this.shift)
    )
      return !1;
    this.ds += t;
    const i = (this.nextFoot = this.chooseFoot()),
      a = b0(i);
    if (!s.footContact[a]) return !1;
    if (n < 0.35) {
      (!this.shift || this.shift.foot !== i) &&
        (this.shift = { foot: i, t: 0 }),
        (this.shift.t += t);
      const r = e.soleCenter(a, Ca),
        l = e.soleCenter(i, Ko),
        c = l.x - r.x,
        h = l.z - r.z,
        u = Math.hypot(c, h) || 1,
        d = ((s.cp.x - r.x) * c + (s.cp.z - r.z) * h) / u,
        f = Math.abs(this.err || 0) > 0.6;
      if (
        !(d < (f ? 0.07 : 0.05) || this.shift.t > (f ? 0.4 : 0.7)) ||
        this.shift.t < 0.1
      )
        return !0;
    } else if (this.ds < this.dsTime(this.speed)) return !0;
    return (
      (this.shift = null),
      e.beginStep(i, "walk"),
      (this.nextFoot = a),
      (this.ds = 0),
      !0
    );
  }
  shiftTarget(t) {
    if (!this.shift || !this.stepping) return !1;
    const e = this.ctl,
      s = e.soleCenter(b0(this.shift.foot), Ca),
      n = e.soleCenter(this.shift.foot, Ko);
    return (
      t.set(Ht(n.x, s.x, 0.85), 0, Ht(n.z, s.z, 0.85)),
      (t.x += this.dir.x * 0.03),
      (t.z += this.dir.z * 0.03),
      !0
    );
  }
  chooseFoot() {
    const t = this.ctl,
      e = t.sens;
    if (this.nextFoot && e.footContact[b0(this.nextFoot)]) return this.nextFoot;
    const s = cn(Math.atan2(this.dir.x, this.dir.z) - t.heading);
    if (Math.abs(s) > 0.45) return s > 0 ? "L" : "R";
    const n = t.soleCenter("L", Ca),
      i = t.soleCenter("R", Ko),
      a = n.x * this.dir.x + n.z * this.dir.z,
      r = i.x * this.dir.x + i.z * this.dir.z;
    return Math.abs(a - r) > 0.05
      ? a < r
        ? "L"
        : "R"
      : Math.abs(s) > 0.2
        ? s > 0
          ? "L"
          : "R"
        : e.footLoad.L < e.footLoad.R
          ? "L"
          : "R";
  }
  setupStep(t) {
    const e = this.ctl,
      s = this.speed,
      n = Math.atan2(this.dir.x, this.dir.z),
      i = Ht(0.6, 0.35, j(s / 1, 0, 1)),
      a = this.plantYaw(t.stance);
    t.turnTo = a + j(cn(n - a), -i, i);
    const r = t.foot === "L" ? 1 : -1;
    cn(t.turnTo - a) * r < -0.25 && (t.turnTo = a - r * 0.25);
    const c = e.sens,
      h = Math.hypot(c.comVel.x, c.comVel.z);
    if (h > 1.1) {
      const d = Math.atan2(c.comVel.x, c.comVel.z),
        f = Ht(0.6, 0.3, ee(1.1, 1.8, h));
      t.turnTo = d + j(cn(t.turnTo - d), -f, f);
    }
    (t.walkV = s), (t.duration = this.swingTime(s));
    const u = e.legStrength[t.stance];
    u < 0.9 && (t.duration *= Ht(0.8, 1, j((u - 0.5) / 0.4, 0, 1))),
      (t.lift = 0.045 + 0.02 * s),
      (t.terrainSide = 0),
      (t.profile = null);
  }
  planTarget(t, e) {
    const s = this.ctl,
      n = s.sens,
      i = Math.max(0.04, t.duration - t.t),
      a = s.stancePivot(t.stance, Ca, !0),
      r = n.w0,
      l = Math.exp(r * i),
      c = t.turnTo ?? s.heading,
      h = Math.sin(c),
      u = Math.cos(c),
      d = u,
      f = -h;
    let p = a.x + (n.cpB.x - a.x) * l,
      m = a.z + (n.cpB.z - a.z) * l;
    const x =
        this.state === "stop"
          ? 0
          : Math.min(this.speed, (t.walkV ?? this.speed) + 0.35),
      g = this.swingTime(x) + this.dsTime(x),
      b = Math.exp(r * g),
      v = n.comVel.x * this.dir.x + n.comVel.z * this.dir.z,
      y = (x * g) / (b - 1) + (x > 0.05 ? j(0.14 * (x - v), -0.06, 0.08) : 0),
      M = t.foot === "L" ? 1 : -1,
      w =
        this.state === "stop"
          ? Math.max(0.09, this.width * 0.5)
          : Math.max(this.width / (1 + b), 0.05),
      S = this.crossTrack;
    (p += -this.dir.x * y + d * M * w + this.dir.z * S * 0.15),
      (m += -this.dir.z * y + f * M * w - this.dir.x * S * 0.15);
    const _ = s.soleCenter(t.stance, Ko);
    let A = (p - _.x) * h + (m - _.z) * u,
      E = (p - _.x) * d + (m - _.z) * f;
    const k = A,
      T = E,
      D = Ht(0.13, 0.08, ee(0.25, 0.45, Math.abs(A)));
    E = M * j(M * E, D, 0.42);
    const C = 0.85 + 0.25 * j(x - 1.25, 0, 1);
    A = j(A, -0.4, C);
    const P = Math.hypot(A, E);
    P > C + 0.07 && ((A *= (C + 0.07) / P), (E *= (C + 0.07) / P));
    const R = k - A,
      z = T - E;
    this.violation.set(h * R + d * z, 0, u * R + f * z);
    const H = ee(1.3, 1.8, t.walkV ?? 0),
      N = Math.hypot(R, z);
    return (
      H > 0 &&
        N > 0.3 &&
        t.t > 0.25 * t.duration &&
        (this.speed = Math.min(
          this.speed,
          Math.max(
            1,
            (t.walkV ?? 0) * (1 - 0.4 * H * j((N - 0.3) / 0.5, 0, 1)),
          ),
        )),
      N > (this.obstacleAhead ? 0.35 : 0.2) + 0.6 * H + this.catchMargin &&
      t.t > 0.03 + 0.25 * t.duration * H
        ? (this.violation.setZero(),
          (t.kind = "catch"),
          (this.pause = Math.max(this.pause, Ht(0.8, 0.12, H))),
          (this.nextFoot = null),
          s.planStepTarget(e))
        : ((e.x = _.x + h * A + d * E - h * 0.058),
          (e.z = _.z + u * A + f * E - u * 0.058),
          this.terrainAdjust(t, e, h, u, _.y),
          e)
    );
  }
  footprint(t, e, s, n, i, a) {
    const r = n,
      l = -s;
    let c = 1 / 0,
      h = -1 / 0,
      u = -1 / 0;
    for (const [f, p] of I4) {
      const m = this.ctl.floorAt(t + s * f + r * p, e + n * f + l * p, i);
      m < c && (c = m), m > h && (h = m);
    }
    for (const f of [hl + 0.08, hl + 0.11])
      u = Math.max(u, this.ctl.floorAt(t + s * f, e + n * f, i));
    let d = !0;
    if (u > h + 0.02)
      for (let f = hl + 0.1; f <= hl + 0.34 && d; f += 0.06)
        this.ctl.floorAt(t + s * f, e + n * f, i) < u - 0.02 && (d = !1);
    return (a.lo = c), (a.hi = h), (a.front = u), (a.standable = d), a;
  }
  terrainAdjust(t, e, s, n, i) {
    const a = this._fp || (this._fp = { lo: 0, hi: 0 }),
      r = (d, f) => (
        this.footprint(d, f, s, n, i, a),
        a.hi - a.lo < 0.03 &&
          Math.abs(a.hi - i) <= Mh &&
          (a.front - a.hi < 0.02 || (a.standable && a.front - a.hi < Mh))
      );
    if (!this.ctl.world.staticBodies.length)
      return (e.y = this.ctl.world.groundY + cl), e;
    if (r(e.x, e.z)) return (e.y = a.hi + cl), e;
    const l = e.x,
      c = e.z;
    let h = t.terrainSide || (t.profile ? 1 : 0);
    if (!h) {
      const d = this.ctl.soleCenter(t.stance, Jd);
      h = (l - d.x) * s + (c - d.z) * n < 0.45 ? 1 : -1;
    }
    let u = !1;
    for (let d = 1; d <= 10 && !u; d++) {
      const f = d * 0.035,
        p = h > 0 ? [f, -f] : [-f, f];
      for (const m of p)
        if (r(l + s * m, c + n * m)) {
          (e.x = l + s * m),
            (e.z = c + n * m),
            t.terrainSide || (t.terrainSide = Math.sign(m)),
            (u = !0);
          break;
        }
    }
    if (!u) {
      const d = (f, p) => (
        this.footprint(f, p, s, n, i, a),
        a.hi - a.lo < 0.03 && Math.abs(a.hi - i) <= Mh
      );
      for (let f = 11; f <= 22 && !u; f++)
        d(l - s * f * 0.035, c - n * f * 0.035) &&
          ((e.x = l - s * f * 0.035), (e.z = c - n * f * 0.035), (u = !0));
      u || (this.footprint(l, c, s, n, i, a), (a.hi = Math.min(a.hi, i + Mh)));
    }
    return (e.y = a.hi + cl), e;
  }
  buildProfile(t) {
    const e = this.ctl;
    if (!e.world.staticBodies.length) {
      t.profile = null;
      return;
    }
    const s = 20,
      n = t.profile || (t.profile = new Float32Array(s + 1)),
      i = t.start.x,
      a = t.start.z,
      r = t.target.x,
      l = t.target.z,
      c = r - i,
      h = l - a,
      u = Math.hypot(c, h) || 0.001,
      d = c / u,
      f = h / u,
      p = Math.max(t.start.y, t.target.y) - cl;
    let m = !1;
    for (let g = 0; g <= s; g++) {
      const b = g / s,
        v = i + c * b,
        y = a + h * b;
      let M = -1 / 0;
      for (const S of [-0.06 - 0.03, 0, 0.08, 0.15, hl, hl + 0.05])
        M = Math.max(M, e.floorAt(v + d * S, y + f * S, p));
      const w = Ht(t.start.y, t.target.y, b) - cl;
      M > w + 0.015 && (m = !0), (n[g] = M + cl + 0.065);
    }
    if (!m) {
      t.profile = null;
      return;
    }
    const x = this._tmp || (this._tmp = new Float32Array(s + 1));
    for (let g = 0; g <= s; g++) {
      let b = n[g];
      for (let v = 0; v <= s; v++)
        b = Math.max(b, n[v] - ((1.3 * Math.abs(g - v)) / s) * u);
      x[g] = b;
    }
    n.set(x), (t.profileTop = Math.max(...x) - Math.max(t.start.y, t.target.y));
  }
  progressGate(t, e) {
    const s = t.profile;
    if (!s) return 1;
    const n = s.length - 1;
    for (let i = Math.ceil((t.u || 0) * n); i <= n; i++)
      if (s[i] > e + 0.05) return Math.max(0, (i - 1) / n);
    return 1;
  }
  profileAt(t, e, s = 0.2) {
    const n = t.profile;
    if (!n) return -1 / 0;
    const i = n.length - 1,
      a = j(e, 0, 1) * i,
      r = Math.min(i - 1, Math.floor(a)),
      l = a - r;
    let c = n[r] * (1 - l) + n[r + 1] * l;
    for (let h = r + 1; h <= Math.min(i, Math.ceil((e + s) * i)); h++)
      c = Math.max(c, n[h]);
    return c;
  }
  heelOff(t, e, s) {
    const n = this.ctl,
      i = n.sens,
      a = this.heel || (this.heel = { L: 0, R: 0 }),
      r = Math.sin(n.heading),
      l = Math.cos(n.heading),
      c = n.ankleWorld(t, s),
      h = n.ankleWorld(b0(t), Ko),
      u = n.seg.pelvis.body.pos,
      d = -((c.x - u.x) * r + (c.z - u.z) * l),
      f = (h.x - c.x) * r + (h.z - c.z) * l;
    if (n.step && n.step.foot === t) return (a[t] = 0), 0;
    let p = 0;
    this.stepping &&
      i.footContact[t] &&
      f > 0.12 &&
      (p = j((d - 0.06) * 2, 0, 0.6)),
      (a[t] = Qs(
        a[t],
        p,
        (p > a[t]
          ? Ht(3.5, 6, ee(1.3, 1.6, Math.hypot(i.comVel.x, i.comVel.z)))
          : 6) * e,
      ));
    const m = a[t];
    if (m < 0.01) return 0;
    const g = n.seg["foot" + t].body.localToWorld(gx, Jd),
      b = mx.subVectors(n.geo["ankleInFoot" + t], gx),
      v = n.footYaw(t),
      y = Math.cos(v),
      M = Math.sin(v),
      w = Math.cos(m),
      S = Math.sin(m),
      _ = b.y * w - b.z * S,
      A = b.y * S + b.z * w;
    return (
      s.set(
        g.x + b.x * y + A * M,
        Math.max(g.y, i.footFloor[t]) + _,
        g.z - b.x * M + A * y,
      ),
      m
    );
  }
  armSwing() {
    const t = this.ctl,
      e = t.sens,
      s = Math.hypot(e.comVel.x, e.comVel.z);
    if (s < 0.15 && !t.step) return 0;
    const n = Math.sin(t.heading),
      i = Math.cos(t.heading),
      a = t.ankleWorld("L", Ca),
      r = t.ankleWorld("R", Ko),
      l = (r.x - a.x) * n + (r.z - a.z) * i;
    return -j(l * 0.55, -0.42, 0.42) * j(s / 0.8, 0, 1);
  }
  pelvisYaw() {
    const t = this.ctl,
      e = t.sens,
      s = Math.hypot(e.comVel.x, e.comVel.z),
      n = Math.sin(t.heading),
      i = Math.cos(t.heading),
      a = t.ankleWorld("L", Ca),
      r = t.ankleWorld("R", Ko),
      l = (r.x - a.x) * n + (r.z - a.z) * i;
    return j(l * 0.14, -0.09, 0.09) * j(s / 0.8, 0, 1);
  }
}
const ts = 9.81,
  mi = new L(0, 1, 0),
  Yn = new L(0, 0, 1),
  Ke = new L(1, 0, 0),
  F4 = 120,
  xx = 80,
  Le = ["L", "R"],
  Lt = new L(),
  Ut = new L(),
  Xt = new L(),
  Pe = new L(),
  Wt = new ae(),
  ke = new ae(),
  as = new ae();
function to(o, t = new ae()) {
  return t.setFromAxisAngle(mi, o);
}
function ul(o) {
  return Lt.set(0, 0, 1).applyQuat(o), Math.atan2(Lt.x, Lt.z);
}
function N4(o) {
  if (o.length < 3) return o.slice();
  const t = o.slice().sort((i, a) => i.x - a.x || i.z - a.z),
    e = (i, a, r) => (a.x - i.x) * (r.z - i.z) - (a.z - i.z) * (r.x - i.x),
    s = [];
  for (const i of t) {
    for (; s.length >= 2 && e(s[s.length - 2], s[s.length - 1], i) <= 0; )
      s.pop();
    s.push(i);
  }
  const n = [];
  for (let i = t.length - 1; i >= 0; i--) {
    const a = t[i];
    for (; n.length >= 2 && e(n[n.length - 2], n[n.length - 1], a) <= 0; )
      n.pop();
    n.push(a);
  }
  return n.pop(), s.pop(), s.concat(n);
}
function yx(o, t, e, s) {
  if (o.length === 0) return 1 / 0;
  if (o.length === 1)
    return (s.x = o[0].x), (s.z = o[0].z), Math.hypot(t - o[0].x, e - o[0].z);
  let n = o.length >= 3,
    i = 1 / 0;
  for (let a = 0; a < o.length; a++) {
    const r = o[a],
      l = o[(a + 1) % o.length],
      c = l.x - r.x,
      h = l.z - r.z,
      u = c * c + h * h || 1e-12;
    let d = ((t - r.x) * c + (e - r.z) * h) / u;
    d = j(d, 0, 1);
    const f = r.x + c * d,
      p = r.z + h * d,
      m = Math.hypot(t - f, e - p);
    m < i && ((i = m), (s.x = f), (s.z = p)),
      c * (e - r.z) - h * (t - r.x) < 0 && (n = !1);
  }
  return n ? -i : i;
}
class U4 {
  constructor(t, e = {}) {
    (this.rd = t),
      (this.world = t.world),
      (this.seg = t.segments),
      (this.jt = t.joints),
      (this.time = 0),
      (this.mode = "balance"),
      (this.modeTime = 0),
      (this.tone = 1),
      (this.toneTarget = 1),
      (this.legStrength = { L: 1, R: 1 }),
      (this.armStrength = { L: 1, R: 1 }),
      (this.spineStrength = 1),
      (this.neckStrength = 1),
      (this.balanceSkill = 1),
      (this.autoGetUp = !0),
      (this.respiration = 1),
      (this.assistGain = 1),
      (this.stepAssist = 1),
      (this.vAssist = 0.3),
      (this.chestAssist = 1),
      (this.driveGain = 1.5),
      (this.driveMax = 0.07),
      (this.walkLean = 0),
      (this.strengthScale = 1),
      (this.assistTilt = 0.12),
      (this.violationAssist = 1),
      (this.fearless = !1),
      (this.armDriver = null),
      (this.reactions = "realistic"),
      (this.fencing = null),
      (this.twitches = null),
      (this.dying = null),
      (this.assist = 1),
      (this.alive = !0),
      (this.conscious = !0),
      (this.pain = 0),
      (this.fear = 0),
      (this.startle = 0),
      (this.lookTarget = null),
      (this.armTask = { L: null, R: null }),
      (this.wounds = []),
      (this.threat = null),
      (this.flinch = { amount: 0, kind: "torso", side: 0, time: -1 }),
      (this.dodge = new L()),
      (this.holding = { L: null, R: null }),
      (this.events = []),
      (this.debug = {
        cp: new L(),
        com: new L(),
        support: [],
        stepTarget: null,
      }),
      (this.rng = e.rng ?? Math.random),
      (this.seed = this.rng() * 100),
      this.initGeometry(),
      (this.footSpring = {});
    for (const s of Le) {
      const n = new p4(
        this.seg["foot" + s].body,
        this.geo["ankleInFoot" + s],
        this.seg.pelvis.body,
        this.geo["hipAnchor" + s],
        { compliance: 4e-4, maxForce: 200, damping: 5 },
      );
      (this.footSpring[s] = n), this.world.addConstraint(n);
    }
    (this.loco = new D4(this)),
      (this.nav = null),
      (this.crowd = null),
      (this.cmd = {});
    for (const s of t.jointList) {
      const n = s.userData.def;
      this.cmd[s.name] = {
        mode: L0,
        target: new ae(),
        k: n.k,
        d: n.d,
        tmax: n.tmax,
        act: 1,
      };
    }
    (this.step = null),
      (this.lastStepEnd = -1),
      (this.stepCount = 0),
      (this.fallDir = new L(0, 0, 1)),
      (this.heading = 0),
      (this.groundTime = 0),
      (this.sens = {
        com: new L(),
        comVel: new L(),
        cp: new L(),
        cpB: new L(),
        footContact: { L: !1, R: !1 },
        footLoad: { L: 0, R: 0 },
        footFloor: { L: 0, R: 0 },
        floorY: 0,
        support: [],
        cpDist: 0,
        cpClosest: { x: 0, z: 0 },
        upTilt: 0,
        chestTilt: 0,
        pelvisH: 0,
        headH: 0,
        groundParts: 0,
      }),
      this.resetState();
  }
  initGeometry() {
    const t = this.rd,
      e = {};
    for (const s of Le) {
      const n = Cs("hip" + s),
        i = Cs("knee" + s),
        a = Cs("ankle" + s),
        r = Cs("shoulder" + s),
        l = Cs("elbow" + s),
        c = Cs("wrist" + s);
      (e["L1" + s] = n.distanceTo(i)),
        (e["L2" + s] = i.distanceTo(a)),
        (e["A1" + s] = r.distanceTo(l)),
        (e["A2" + s] = l.distanceTo(c)),
        (e["thighDir" + s] = new L().subVectors(i, n).normalize()),
        (e["shinDir" + s] = new L().subVectors(a, i).normalize()),
        (e["uarmDir" + s] = new L().subVectors(l, r).normalize()),
        (e["farmDir" + s] = new L().subVectors(c, l).normalize()),
        (e["legAxis" + s] = new L()
          .crossVectors(Yn, new L().subVectors(a, n).normalize())
          .normalize()),
        (e["armAxis" + s] = new L()
          .crossVectors(new L(0, 0, -1), new L().subVectors(c, r).normalize())
          .normalize());
      const h = t.segments.pelvis,
        u = t.segments.chest;
      (e["hipAnchor" + s] = new L().subVectors(n, h.bindPos)),
        (e["shoulderAnchor" + s] = new L().subVectors(r, u.bindPos));
      const d = t.segments["foot" + s];
      e["ankleInFoot" + s] = new L().subVectors(a, d.bindPos);
      const f = t.segments["hand" + s];
      (e["wristInHand" + s] = new L().subVectors(c, f.bindPos)),
        (e["palmInHand" + s] = new L(s === "L" ? -0.02 : 0.02, -0.01, 0.005));
      const p = new L().subVectors(c, l).normalize(),
        m = new L(0, 0, 1).addScaled(p, -p.z).normalize(),
        x = new L().crossVectors(p, m).normalize();
      s === "R" && x.negate(),
        (e["handBasis" + s] = new ae().setFromBasis(
          x,
          p,
          new L().crossVectors(x, p),
        ));
    }
    (e.pelvisBindY = t.segments.pelvis.bindPos.y),
      (e.chestBind = t.segments.chest.bindPos.clone()),
      (e.headBind = t.segments.head.bindPos.clone()),
      (this.geo = e);
  }
  resetState() {
    (this.fencing = this.twitches = null),
      (this.mode = "balance"),
      (this.modeTime = 0),
      (this.tone = 1),
      (this.toneTarget = 1),
      (this.assist = 1),
      (this.step = null),
      (this.stepCount = 0),
      (this.lastStepEnd = -1),
      (this.groundTime = 0),
      (this.startle = 0),
      (this.heading = ul(this.rd.pelvis.rot)),
      (this.recover = 0),
      (this.comInt = new L()),
      (this.servo = { kp: 0.6, kd: 0.4, ki: 0.4 }),
      (this.settleFoot = null),
      (this.settleTime = 0),
      (this.awkwardTime = 0),
      this.resetGetUp();
  }
  setMode(t) {
    t !== this.mode &&
      (this.events.push({
        type: "mode",
        from: this.mode,
        to: t,
        time: this.time,
      }),
      (this.mode = t),
      (this.modeTime = 0),
      t !== "balance" &&
        ((this.step = null),
        (this.wmAmount = 0),
        this.wmDir && this.wmDir.setZero(),
        this.snap && (this.snap.t0 = -9),
        this.attention && (this.attention.until = 0)),
      t === "getup" && ((this.gu = null), (this.guReplans = 0)));
  }
  walkTo(t, e = null, s = {}) {
    if (!t || !t.length) return;
    const n = this.seg.pelvis.body.pos;
    (this.nav = {
      path: t.map((i) => i.clone()),
      goals: (e || [t[t.length - 1]]).map((i) => i.clone()),
      goalEnds: s.goalEnds || null,
      goalIndex: 0,
      start: new L(n.x, 0, n.z),
      i: 0,
      done: !1,
      status: "walking",
      needsReplan: !1,
      speed: s.speed,
    }),
      this.loco.begin();
  }
  updateRoute(t, e = null) {
    if (!this.nav || !t || !t.length) return;
    const s = this.seg.pelvis.body.pos;
    (this.nav.path = t.map((n) => n.clone())),
      (this.nav.start = new L(s.x, 0, s.z)),
      (this.nav.i = 0),
      e && (this.nav.goalEnds = e);
  }
  stopWalk(t = "stopped") {
    !this.nav || this.nav.done || this.loco.finish(t);
  }
  get walking() {
    return !!this.nav && !this.nav.done && this.loco.active;
  }
  resumeBalance() {
    const t = this.seg.pelvis.body;
    (this.heading = ul(t.rot)),
      (this.cdes = null),
      (this.pelvisYTarget = t.pos.y),
      this.comInt.setZero(),
      (this.settleFoot = null),
      (this.kneel = null),
      this.setMode("balance");
  }
  sense() {
    const t = this.rd,
      e = this.sens;
    t.computeCOM(e.com), t.computeCOMVelocity(e.comVel);
    let s = 1 / 0;
    for (const p of Le) {
      const m = this.seg["foot" + p].body;
      let x;
      if (m.groundContactUsed) {
        x = 0;
        for (let g = 0; g < m.groundContactUsed; g++)
          x += m.groundContactPoints[g].y;
        x /= m.groundContactUsed;
      } else x = this.world.surfaceAt(m.pos.x, m.pos.z, m.pos.y + 0.02);
      (e.footFloor[p] = x), m.groundContact && (s = Math.min(s, x));
    }
    const n = this.seg.pelvis.body;
    s === 1 / 0 && (s = this.world.surfaceAt(n.pos.x, n.pos.z, n.pos.y)),
      (e.floorY = s);
    const i = s,
      a = Math.max(0.3, e.com.y - i),
      r = Math.sqrt(ts / a);
    (e.w0 = r), e.cp.set(e.com.x + e.comVel.x / r, i, e.com.z + e.comVel.z / r);
    const l = (t.totalMass * ts) / 60,
      c = [];
    for (const p of Le) {
      const m = this.seg["foot" + p].body,
        x = m.groundImpulse / l;
      if (
        ((e.footLoad[p] = x),
        (e.footContact[p] = m.groundContact && x > 0.03),
        m.groundContact)
      ) {
        const g = m.shapes[0],
          b = g.halfExtents;
        for (let v = 0; v < 4; v++)
          Lt.set(
            v & 1 ? b.x : -b.x,
            -b.y - g.radius,
            v & 2 ? b.z + g.radius * 0.5 : -b.z - g.radius * 0.5,
          ).add(g.localPos),
            m.localToWorld(Lt, Ut),
            Ut.y < e.footFloor[p] + 0.03 && c.push({ x: Ut.x, z: Ut.z });
      }
    }
    if (
      ((e.support = N4(c)),
      (e.cpDist = yx(e.support, e.cp.x, e.cp.z, e.cpClosest)),
      this.step)
    ) {
      const p = this.step.foot;
      let m = 0;
      Xt.setZero(), Pe.setZero();
      for (const x of t.segList) {
        const g = x.name;
        if (
          !(
            g.endsWith(p) &&
            (g.startsWith("thigh") ||
              g.startsWith("shin") ||
              g.startsWith("foot"))
          )
        )
          for (
            let b = -1;
            b < (x.fractured ? x.fractured.extra.length : 0);
            b++
          ) {
            const v = b < 0 ? x.body : x.fractured.extra[b];
            Xt.addScaled(v.pos, v.mass),
              Pe.addScaled(v.vel, v.mass),
              (m += v.mass);
          }
      }
      Xt.scale(1 / m),
        Pe.scale(1 / m),
        e.cpB.set(Xt.x + Pe.x / r, i, Xt.z + Pe.z / r);
    } else e.cpB.copy(e.cp);
    e.comDist = yx(e.support, e.com.x, e.com.z, {});
    const h = this.seg.pelvis.body,
      u = this.seg.chest.body,
      d = this.seg.head.body;
    Lt.set(0, 1, 0).applyQuat(h.rot),
      (e.upTilt = Math.acos(j(Lt.y, -1, 1))),
      Lt.set(0, 1, 0).applyQuat(u.rot),
      (e.chestTilt = Math.acos(j(Lt.y, -1, 1))),
      (e.pelvisH = h.pos.y - i),
      (e.headH = d.pos.y - i);
    let f = 0;
    for (const p of this.rd.segList)
      p.name.startsWith("foot") || (p.body.groundContact && f++);
    (e.groundParts = f),
      (e.torsoGround =
        this.seg.chest.body.groundContact ||
        this.seg.pelvis.body.groundContact ||
        this.seg.abdomen.body.groundContact),
      this.debug.cp.copy(e.cp),
      this.debug.com.copy(e.com),
      (this.debug.support = e.support);
  }
  update(t) {
    (this.time += t),
      (this.modeTime += t),
      (this.events.length = 0),
      this.sense();
    for (const s of Le) this.footSpring[s].enabled = !1;
    if (
      ((this.startle = Math.max(0, this.startle - t * 2.5)),
      this.threat && (this.lastThreatTime = this.time),
      (this.flinch.amount *= Math.exp(-t / 0.35)),
      this.alive && this.respiration > 0)
    ) {
      const s = j(13 + 10 * this.pain + (this.respRateBoost || 0), 8, 40);
      this.breathPhase = (this.breathPhase || 0) + t * (s / 60) * Math.PI * 2;
    }
    (this.breath =
      this.alive && this.respiration > 0
        ? Math.sin(this.breathPhase || 0) * this.respiration
        : 0),
      this.updateMode(t),
      this.loco.update(t);
    const e = this.toneTarget < this.tone ? 3.5 : 1.2;
    switch (((this.tone = Qs(this.tone, this.toneTarget, e * t)), this.mode)) {
      case "balance":
        this.doBalance(t);
        break;
      case "falling":
        this.doFalling(t);
        break;
      case "ground":
        this.doGround(t);
        break;
      case "getup":
        this.doGetUp(t);
        break;
      default:
        this.doLimp(t);
    }
    this.applyArmTasks(t),
      this.armDriver && this.alive && this.armDriver(t),
      this.commit(),
      this.applyGravityCompensation();
  }
  updateMode(t) {
    const e = this.sens;
    if (!this.alive) {
      if (
        this.reactions === "rdr" &&
        !this.dying &&
        this.mode === "balance" &&
        this.modeTime > 0.05
      ) {
        const i = this.sens.comVel,
          a = Math.hypot(i.x, i.z);
        this.dying = {
          t: 0,
          dur: 0.6 + 0.7 * this.rng(),
          dir: a > 0.05 ? new L(i.x / a, 0, i.z / a) : null,
        };
      }
      const n = this.dying;
      if (n && !n.done && this.mode === "balance") {
        n.t += t;
        const i = j(n.t / n.dur, 0, 1);
        if (
          ((this.toneTarget = 1 - 0.8 * i),
          i >= 1 || this.sens.pelvisH < 0.6 || this.sens.upTilt > 0.75)
        )
          n.done = !0;
        else return;
      }
      (this.toneTarget = 0), this.setMode("dead");
      return;
    }
    if (!this.conscious) {
      (this.toneTarget = 0.04), this.setMode("unconscious");
      return;
    }
    this.toneTarget = 1;
    const s =
      Math.min(this.legStrength.L, this.legStrength.R) > 0.35 &&
      this.legStrength.L + this.legStrength.R > 1;
    if (
      ((this.mode === "unconscious" || this.mode === "dead") &&
        (this.mode === "unconscious" && (this.wokeAt = this.time),
        this.setMode("ground")),
      this.mode === "balance")
    ) {
      this.airborne =
        !e.footContact.L && !e.footContact.R ? (this.airborne || 0) + t : 0;
      const n = 0.5 * ee(1.2, 1.8, Math.hypot(e.comVel.x, e.comVel.z)),
        i =
          e.upTilt > 0.62
            ? "tilt"
            : e.chestTilt > 0.8
              ? "chest"
              : e.pelvisH < 0.55
                ? "low"
                : this.airborne > 0.3 && e.com.y < 0.85
                  ? "airborne"
                  : e.cpDist > 0.75 + n && e.cpDist < 1e3 && this.step === null
                    ? "capture point"
                    : s
                      ? null
                      : "legs",
        a = !!i;
      a && (this.lostReason = i),
        a &&
          (this.modeTime > 0.25 || !s) &&
          (this.fallDir.set(e.comVel.x, 0, e.comVel.z),
          this.fallDir.lengthSq() < 0.01 &&
            (Lt.set(0, 1, 0).applyQuat(this.seg.chest.body.rot),
            this.fallDir.set(Lt.x, 0, Lt.z)),
          this.fallDir.normalize(),
          (this.fallCause =
            !s && Math.hypot(e.comVel.x, e.comVel.z) < 0.7 && e.upTilt < 0.45
              ? "legs"
              : "balance"),
          (this.kneel = null),
          this.setMode("falling"));
    } else if (this.mode === "falling") {
      const n = this.fallCause === "legs" ? this.kneel : null,
        i =
          this.seg.footL.body.groundContact &&
          this.seg.footR.body.groundContact;
      if (
        n &&
        n.phase === "drop" &&
        s &&
        this.pain < 0.8 &&
        e.pelvisH > 0.74 &&
        this.seg.pelvis.body.vel.y > -1 &&
        i &&
        e.upTilt < 0.35
      ) {
        this.resumeBalance();
        return;
      }
      if (n && n.ready === "getup" && this.ableToGetUp()) {
        this.setMode("getup");
        return;
      }
      let a =
        e.torsoGround &&
        this.rd.computeCOMVelocity(Lt).length() < 0.6 &&
        this.seg.head.body.vel.length() < 0.5;
      n &&
        (a =
          a &&
          this.seg.chest.body.groundContact &&
          this.seg.head.body.pos.y - this.world.groundY < 0.22),
        (a || this.modeTime > (n ? 12 : 2.5)) && this.setMode("ground");
    } else
      this.mode === "ground"
        ? e.footContact.L &&
          e.footContact.R &&
          e.pelvisH > 0.8 &&
          e.upTilt < 0.3
          ? this.standUp()
          : this.wantsToGetUp(t) && this.setMode("getup")
        : this.mode === "getup" &&
          (this.modeTime > 14
            ? this.failGetUp("timeout")
            : this.ableToGetUp(!0)
              ? this.getUpToppling() && this.failGetUp("toppled")
              : this.failGetUp("unable"));
  }
  setRel(t, e, s, n, i) {
    const a = this.cmd[t];
    a &&
      ((a.mode = L0),
      a.target.copy(e),
      s !== void 0 && (a.k = s),
      n !== void 0 && (a.d = n),
      i !== void 0 && (a.tmax = i));
  }
  setWorld(t, e, s, n, i) {
    const a = this.cmd[t];
    a &&
      ((a.mode = Zg),
      a.target.copy(e),
      s !== void 0 && (a.k = s),
      n !== void 0 && (a.d = n),
      i !== void 0 && (a.tmax = i));
  }
  feedForward(t, e, s) {
    const n = this.cmd[t];
    n.prevTarget || (n.prevTarget = new ae().copy(e)),
      as
        .multiplyConjB(e, n.prevTarget)
        .toRotVec(n.ffVel || (n.ffVel = new L())),
      n.ffVel.scale(1 / s),
      n.ffVel.length() > 20 && n.ffVel.setZero(),
      n.prevTarget.copy(e),
      (n.ff = !0);
  }
  gains(t, e = 1) {
    const s = this.jt[t].userData.def,
      n = this.cmd[t];
    return (n.k = s.k * e), (n.d = s.d * Math.sqrt(e)), (n.tmax = s.tmax), n;
  }
  regionStrength(t) {
    const e = t[t.length - 1];
    if (this.dying && !this.dying.done) {
      const s = j(this.dying.t / this.dying.dur, 0, 1);
      return t.startsWith("hip") ||
        t.startsWith("knee") ||
        t.startsWith("ankle")
        ? this.legStrength[e] * (1 - 0.75 * s * s)
        : t.startsWith("shoulder") ||
            t.startsWith("elbow") ||
            t.startsWith("wrist")
          ? 0.12
          : t.startsWith("neck")
            ? 0.08
            : this.spineStrength * (0.75 - 0.45 * s);
    }
    return t.startsWith("hip") || t.startsWith("knee") || t.startsWith("ankle")
      ? this.legStrength[e]
      : t.startsWith("shoulder") ||
          t.startsWith("elbow") ||
          t.startsWith("wrist")
        ? this.armStrength[e]
        : t.startsWith("neck")
          ? this.neckStrength
          : this.spineStrength;
  }
  commit() {
    const t = this.tone;
    for (const e of this.rd.jointList) {
      const s = this.cmd[e.name],
        n = this.regionStrength(e.name),
        i = Math.max(t * n * s.act, s.reflex || 0);
      s.reflex = 0;
      // residual joint hold; the game weakens it on the dead (residualHold) so limbs drape under gravity
      const hold = this.residualHold ?? 1,
        a = 3 * hold,
        r = (0.9 + 0.006 * e.userData.def.tmax * (1 - t)) * (0.5 + 0.5 * hold),
        l = 12 * hold;
      (e.driveMode = i < 0.02 ? L0 : s.mode),
        i < 0.02
          ? (e.relativeRotation(e.target), (e.stiffness = a))
          : (e.target.copy(s.target), (e.stiffness = s.k * i + a)),
        (e.damping = s.d * Math.sqrt(i) + r),
        (e.maxTorque = s.tmax * i * this.strengthScale + l),
        (e.worldDamping = e.driveMode === Zg),
        s.ff && e.worldDamping
          ? e.targetAngVel.copy(s.ffVel)
          : e.targetAngVel.setZero(),
        s.ff || (s.prevTarget = null),
        (s.ff = !1),
        (s.act = 1);
    }
    if (this.mode === "balance" && this.assist > 0.01) {
      const e = this.seg.pelvis.body;
      Lt.set(0, 1, 0).applyQuat(e.rot), Ut.crossVectors(Lt, mi);
      const s = Ut.length(),
        n = Math.asin(j(s, 0, 1)),
        i = 420 * this.assistGain * this.assist,
        a = 55 * this.assistGain * this.assist;
      s > 1e-6 ? Ut.scale((i * n) / s) : Ut.setZero(),
        Xt.copy(e.angVel),
        (Xt.y = 0),
        Ut.addScaled(Xt, -a);
      const r = 160 * this.assist,
        l = Ut.length();
      l > r && Ut.scale(r / l), e.torque.add(Ut);
      const c = this.loco.stepping
        ? ee(1.3, 1.7, Math.hypot(this.sens.comVel.x, this.sens.comVel.z))
        : 0;
      if (c > 0) {
        Lt.set(0, 0, 1).applyQuat(e.rot);
        const u = this.heading + this.loco.pelvisYaw();
        e.torque.y += j(
          (cn(u - Math.atan2(Lt.x, Lt.z)) * 160 - e.angVel.y * 16) *
            c *
            this.assist,
          -80,
          80,
        );
      }
      if (this.vAssist) {
        const u =
            (this.standFloor ?? this.world.groundY) +
            this.geo.pelvisBindY -
            0.02,
          d =
            j(
              (u - e.pos.y) * 3e3 - e.vel.y * 300,
              0,
              this.vAssist * this.rd.totalMass * ts,
            ) * this.assist;
        e.force.y += d;
      }
      const h = this.loco;
      if (h.stepping && (h.speed > 0.05 || this.sens.comVel.length() > 0.2)) {
        const u = this.sens.comVel,
          d = h.dir,
          f = this.rd.totalMass,
          p = u.x * d.x + u.z * d.z,
          m =
            j(
              (h.speed - p) * this.driveGain * f,
              -0.05 * f * ts,
              this.driveMax * f * ts,
            ) *
            this.assistGain *
            this.assist;
        (e.force.x += d.x * m), (e.force.z += d.z * m);
        const x = this.step;
        if (x && x.kind === "walk") {
          const g = h.violation,
            b = 6.5 * f * this.assistGain * this.assist,
            v = 0.08 * f * ts * this.violationAssist;
          let y = -g.x * b,
            M = -g.z * b;
          const w = Math.hypot(y, M);
          w > v && ((y *= v / w), (M *= v / w)),
            (e.force.x += y),
            (e.force.z += M);
        }
      }
      if (this.chestAssist) {
        const u = this.seg.chest.body;
        Lt.set(0, 1, 0).applyQuat(u.rot), Ut.crossVectors(Lt, mi);
        const d = Ut.length(),
          f = Math.asin(j(d, 0, 1));
        d > 1e-6 && Ut.scale((300 * this.chestAssist * f) / d),
          Xt.copy(u.angVel),
          (Xt.y = 0),
          Ut.addScaled(Xt, -40 * this.chestAssist);
        const p = Ut.length(),
          m = 150 * this.chestAssist * this.assist;
        p > m && Ut.scale(m / p), u.torque.add(Ut);
      }
    }
  }
  applyGravityCompensation() {
    const t = this.tone;
    if (t < 0.02) return;
    this.rd;
    const e = [
      "lumbar",
      "thoracic",
      "neckBase",
      "neckTop",
      "shoulderL",
      "elbowL",
      "wristL",
      "shoulderR",
      "elbowR",
      "wristR",
    ];
    for (const s of e) {
      const n = this.jt[s],
        i = n.userData.segment,
        a =
          this.mode === "balance" || this.mode === "getup"
            ? 1
            : this.mode === "falling"
              ? 0.6
              : 0.3,
        r = this.regionStrength(s) * t * a * (this.cmd[s].gc ?? 1);
      if (r < 0.02) continue;
      n.worldAnchor(Lt), Ut.setZero();
      const l = [i];
      for (; l.length; ) {
        const c = l.pop();
        for (
          let h = -1;
          h < (c.fractured ? c.fractured.extra.length : 0);
          h++
        ) {
          const u = h < 0 ? c.body : c.fractured.extra[h];
          Xt.subVectors(u.pos, Lt),
            (Ut.x += -Xt.z * u.mass * ts),
            (Ut.z += Xt.x * u.mass * ts);
        }
        for (const h of c.children) l.push(h);
      }
      Ut.scale(r * 0.92), n.child.torque.add(Ut), n.parent.torque.sub(Ut);
    }
    this.mode === "balance" &&
      (this.applyLegSupport(t),
      this.step && this.applySwingLegCompensation(this.step.foot, t));
  }
  applySwingLegCompensation(t, e) {
    const s = e * this.legStrength[t] * 0.95,
      n = ["hip" + t, "knee" + t, "ankle" + t];
    for (let i = 0; i < 3; i++) {
      const a = this.jt[n[i]];
      a.worldAnchor(Lt), Ut.setZero();
      let r = a.userData.segment;
      for (; r; ) {
        const l = r.body;
        if (
          (Xt.subVectors(l.pos, Lt),
          (Ut.x += -Xt.z * l.mass * ts),
          (Ut.z += Xt.x * l.mass * ts),
          r.fractured)
        )
          for (const c of r.fractured.extra)
            Xt.subVectors(c.pos, Lt),
              (Ut.x += -Xt.z * c.mass * ts),
              (Ut.z += Xt.x * c.mass * ts);
        r = r.children[0] || null;
      }
      Ut.scale(s), a.child.torque.add(Ut), a.parent.torque.sub(Ut);
    }
  }
  applyLegSupport(t) {
    const e = this.sens,
      s = this.seg;
    let n = 0;
    const i = Pe.setZero(),
      a = this.step ? this.step.foot : null;
    for (const M of this.rd.segList) {
      const w = M.name;
      ((w.startsWith("thigh") ||
        w.startsWith("shin") ||
        w.startsWith("foot")) &&
        !(a && w.endsWith(a))) ||
        (i.addScaled(M.body.pos, M.body.mass), (n += M.body.mass));
    }
    i.scale(1 / n);
    const r = this.jt.hipL.worldAnchor(this._hL || (this._hL = new L())),
      l = this.jt.hipR.worldAnchor(this._hR || (this._hR = new L()));
    let c, h;
    const u = this._P || (this._P = new L());
    if (this.step)
      (c = this.step.stance === "L" ? 1 : 0), (h = 1 - c), u.copy(c ? r : l);
    else {
      const M = this.soleCenter("L", this._fL || (this._fL = new L())),
        w = this.soleCenter("R", this._fR || (this._fR = new L())),
        S = w.x - M.x,
        _ = w.z - M.z,
        A = S * S + _ * _ || 1e-6,
        E = j(((e.com.x - M.x) * S + (e.com.z - M.z) * _) / A, 0, 1);
      (c = (1 - E) * (e.footContact.L ? 1 : 0.3)),
        (h = E * (e.footContact.R ? 1 : 0.3));
      const k = c + h || 1;
      (c /= k), (h /= k), u.lerpVectors(r, l, h);
    }
    this.shareL || (this.shareL = c);
    const d = (this.loco.stepping ? 20 : 6) * (1 / 60);
    (this.shareL = j(Qs(this.shareL, c, d), 0, 1)),
      this.step && (this.shareL = c),
      (c = this.shareL),
      (h = 1 - c),
      this.step || u.lerpVectors(r, l, h);
    const f = n * ts,
      p = i.x - u.x,
      x = -(i.z - u.z) * f,
      g = p * f,
      b = t * 0.9,
      v = this._tau || (this._tau = new L()),
      y = this._r || (this._r = new L());
    for (const M of Le) {
      const w = M === "L" ? c : h;
      if (w <= 0) continue;
      const S = b * this.legStrength[M],
        _ = M === "L" ? r : l,
        A = s["thigh" + M].body,
        E = s["shin" + M].body,
        k = s["foot" + M].body,
        T = this.jt["knee" + M].worldAnchor(Lt),
        D = this.jt["ankle" + M].worldAnchor(Ut),
        C = w * f,
        P = 1,
        R = 0,
        z = C,
        H = 0;
      v.set(x * w, 0, g * w).scale(S),
        s.pelvis.body.torque.add(v),
        A.torque.sub(v),
        y.subVectors(_, T);
      let N = x * w + (y.y * H - y.z * z),
        I = y.z * R - y.x * H,
        U = g * w + (y.x * z - y.y * R);
      y.subVectors(A.pos, T),
        (N += -y.z * A.mass * ts),
        (U += y.x * A.mass * ts),
        v.set(N, I, U).scale(S),
        A.torque.add(v),
        E.torque.sub(v),
        y.subVectors(_, D),
        (N = x * w - y.z * C),
        (U = g * w + y.x * C),
        y.subVectors(A.pos, D),
        (N += -y.z * A.mass * ts),
        (U += y.x * A.mass * ts),
        y.subVectors(E.pos, D),
        (N += -y.z * E.mass * ts),
        (U += y.x * E.mass * ts);
      const $ = C * P + (A.mass + E.mass) * ts;
      k.localDirToWorld(Ke, Xt), k.localDirToWorld(Yn, Pe);
      let G = N * Xt.x + U * Xt.z,
        Q = N * Pe.x + U * Pe.z;
      (G =
        this.loco.stepping &&
        (this.step
          ? this.step.kind === "walk"
          : Math.hypot(e.comVel.x, e.comVel.z) > 0.3)
          ? j(G, -$ * 0.07, $ * 0.04)
          : j(G, -$ * 0.16, $ * 0.05)),
        (Q = j(Q, -$ * 0.045, $ * 0.045)),
        v.set(Xt.x * G + Pe.x * Q, 0, Xt.z * G + Pe.z * Q).scale(S),
        E.torque.add(v);
      const q = e.footContact[M] ? e.footLoad[M] * this.rd.totalMass * ts : 0,
        O = j(G, -q * 0.16, q * 0.05),
        X = j(Q, -q * 0.045, q * 0.045),
        tt = G - O,
        pt = Q - X;
      (tt !== 0 || pt !== 0) &&
        (y.set(Xt.x * tt + Pe.x * pt, 0, Xt.z * tt + Pe.z * pt).scale(S),
        k.torque.sub(y));
    }
  }
  ankleWorld(t, e) {
    return this.seg["foot" + t].body.localToWorld(
      this.geo["ankleInFoot" + t],
      e,
    );
  }
  footYaw(t) {
    return ul(this.seg["foot" + t].body.rot);
  }
  legIK(t, e, s, n, i) {
    const a = this.geo,
      r = fx(
        e,
        s,
        a["L1" + t],
        a["L2" + t],
        n,
        this._ik || (this._ik = px()),
        0.06,
      );
    return (
      ll(a["thighDir" + t], a["legAxis" + t], r.dir1, r.axis, i.thigh),
      ll(a["shinDir" + t], a["legAxis" + t], r.dir2, r.axis, i.shin),
      (i.reach = r.reach),
      i
    );
  }
  armIK(t, e, s, n, i) {
    const a = this.geo,
      r = fx(
        e,
        s,
        a["A1" + t],
        a["A2" + t],
        n,
        this._ik2 || (this._ik2 = px()),
        0.08,
      );
    return (
      ll(a["uarmDir" + t], a["armAxis" + t], r.dir1, r.axis, i.upper),
      ll(a["farmDir" + t], a["armAxis" + t], r.dir2, r.axis, i.fore),
      (i.reach = r.reach),
      i
    );
  }
  relaxedArms(t = 1, e = 0) {
    for (const s of Le) {
      const n = s === "L" ? 1 : -1;
      Wt.setFromEuler(-0.1 + e * n, 0, -0.1 * n, "XYZ"),
        this.setRel("shoulder" + s, Wt, 55 * t, 5 * t, 60),
        Lt.copy(rn.upperArmDirL);
      const i = new L()
        .crossVectors(
          Yn,
          s === "L"
            ? rn.upperArmDirL
            : new L(-rn.upperArmDirL.x, rn.upperArmDirL.y, rn.upperArmDirL.z),
        )
        .normalize();
      ke.setFromAxisAngle(i, -0.28),
        this.setRel("elbow" + s, ke, 28 * t, 1.4 * t, 40),
        as.setFromEuler(0, 0, 0),
        this.setRel("wrist" + s, as, 8 * t, 0.25 * t, 10);
    }
  }
  standingSpine(t = 0, e = 0, s = this.heading, n = 1) {
    to(s, Wt),
      ke.setFromEuler(t, 0, e, "XYZ"),
      as.multiplyQuats(Wt, ke),
      this.setWorld("lumbar", as),
      this.gains("lumbar", n),
      ke.setFromEuler(t * 0.5 - 0.018 * this.breath, 0, e * 0.5, "XYZ"),
      as.multiplyQuats(Wt, ke),
      this.setWorld("thoracic", as),
      this.gains("thoracic", n),
      this.setRel("neckBase", ke.identity()),
      this.gains("neckBase", n);
    let i = s,
      a = 0;
    const r =
      this.attention && this.time < this.attention.until
        ? this.attention.point
        : this.lookTarget;
    if (r) {
      const l = this.seg.head.body.pos;
      Lt.subVectors(r, l);
      const c = Math.atan2(Lt.x, Lt.z),
        h = j(cn(c - s), -1.2, 1.2);
      (i = s + h),
        (a = j(-Math.atan2(Lt.y, Math.hypot(Lt.x, Lt.z)), -0.6, 0.6));
    }
    if (this.threat && this.threat.tti < 0.6) {
      a = 0.45;
      const l = Math.atan2(this.dodge.x, this.dodge.z);
      i = s + j(cn(l - s), -0.7, 0.7);
    }
    to(i, Wt),
      ke.setFromEuler(a, 0, 0, "XYZ"),
      as.multiplyQuats(Wt, ke),
      this.setWorld("neckTop", as),
      this.gains("neckTop", n);
  }
  doBalance(t) {
    const e = this.sens,
      s = this.geo,
      n = this.seg.pelvis.body,
      i = this.balanceSkill,
      a = Math.hypot(e.comVel.x, e.comVel.z),
      r = this.loco.stepping ? ee(1.3, 1.6, a) : 0,
      l = j((e.cpDist - 0.05 - r * (0.12 + 0.3 * a)) / 0.35, 0, 1),
      c = j((e.upTilt - this.assistTilt - r * 0.1) / 0.35, 0, 1),
      h =
        Math.max(
          j(1 - Math.max(l, c), 0, 1),
          this.step || this.recentStep
            ? (this.stepAssist ?? 0.45) * (1 - c)
            : 0,
        ) *
        Math.min(this.legStrength.L, this.legStrength.R) *
        i,
      u =
        this.dying && !this.dying.done
          ? 0.25 * (1 - j(this.dying.t / this.dying.dur, 0, 1))
          : 1;
    this.assist = Qs(this.assist, h * u, t * (u < 1 ? 12 : 4));
    {
      const q = this.footYaw("L"),
        O = this.footYaw("R"),
        X = Math.atan2(Math.sin(q) + Math.sin(O), Math.cos(q) + Math.cos(O));
      !this.step &&
        !this.loco.active &&
        e.footContact.L &&
        e.footContact.R &&
        Math.hypot(e.comVel.x, e.comVel.z) < 0.1 &&
        (this.heading += j(cn(X - this.heading), -0.35 * t, 0.35 * t));
    }
    e.footContact.L && e.footContact.R,
      (this.recentStep = this.time - this.lastStepEnd < 0.6);
    const d = Math.hypot(e.comVel.x, e.comVel.z),
      f = this.loco.stepping;
    if (!this.step && f && this.loco.gait(t)) this.settleFoot = null;
    else if (!this.step) {
      const q =
        e.cpDist > 0 &&
        (e.cp.x - e.cpClosest.x) * e.comVel.x +
          (e.cp.z - e.cpClosest.z) * e.comVel.z >
          0;
      e.cpDist < 1e3 &&
      ((e.cpDist > 0.03 + 0.03 * (1 - i) && q && d > 0.1) || e.cpDist > 0.09) &&
      this.time - this.lastStepEnd > 0.08 &&
      this.modeTime > 0.15
        ? ((this.settleFoot = null),
          this.beginStep(this.chooseCatchFoot(), "catch"))
        : this.updateSettle(t, d);
    }
    this.step && this.updateStep(t);
    const p = this.step
      ? [this.step.stance]
      : this.settleFoot
        ? [this.settleFoot === "L" ? "R" : "L"]
        : Le;
    Lt.setZero();
    let m = 0;
    for (const q of p) {
      const O = 0.3 + this.legStrength[q];
      this.soleCenter(q, Ut), Lt.addScaled(Ut, O), (m += O);
    }
    Lt.scale(1 / m);
    const x = !this.step && this.loco.shiftTarget(Lt);
    if (p.length === 1 && !x) {
      const q = this.soleCenter(p[0] === "L" ? "R" : "L", Ut),
        O = q.x - Lt.x,
        X = q.z - Lt.z,
        tt = Math.hypot(O, X) || 1;
      (Lt.x += (O / tt) * 0.012), (Lt.z += (X / tt) * 0.012);
    }
    if (
      (this.cdes || (this.cdes = Lt.clone()),
      this.step && this.step.kind !== "settle")
    )
      this.cdes.copy(Lt);
    else {
      const q = Lt.x - this.cdes.x,
        O = Lt.z - this.cdes.z,
        X = Math.hypot(q, O),
        tt = Math.min(X * (1 - Math.exp(-t / 0.18)), 0.35 * t);
      X > 1e-6 &&
        ((this.cdes.x += (q / X) * tt), (this.cdes.z += (O / X) * tt)),
        Lt.copy(this.cdes),
        !this.step && !this.settleFoot && this.posturalSway(t, d, Lt);
    }
    const g = this._pelTarget || (this._pelTarget = new L()),
      b = f && !x && (this.step ? this.step.kind === "walk" : d > 0.3);
    if (b)
      g.set(n.pos.x + e.comVel.x * t, 0, n.pos.z + e.comVel.z * t),
        this.comInt.setZero(),
        this.cdes && this.cdes.set(e.com.x, 0, e.com.z);
    else if (this.step && this.step.kind !== "settle")
      g.set(n.pos.x + e.comVel.x * t, 0, n.pos.z + e.comVel.z * t),
        (g.x += (Lt.x - e.com.x) * 0.15),
        (g.z += (Lt.z - e.com.z) * 0.15);
    else {
      const q = this.servo.kp,
        O = this.servo.kd,
        X = this.servo.ki,
        tt = Lt.x - e.com.x,
        pt = Lt.z - e.com.z,
        ot = Math.hypot(e.comVel.x, e.comVel.z) < 0.05,
        nt = Math.hypot(tt, pt) < 0.02 || (this.settleFoot && ot) ? 1 : 0,
        ft = this.settleFoot ? 0.08 : 0.05;
      (this.comInt.x = j(
        this.comInt.x * (1 - (nt ? 0.6 : 3) * t) + tt * t * nt,
        -ft,
        ft,
      )),
        (this.comInt.z = j(
          this.comInt.z * (1 - (nt ? 0.6 : 3) * t) + pt * t * nt,
          -ft,
          ft,
        ));
      let K = tt * q + this.comInt.x * X - e.comVel.x * O,
        it = pt * q + this.comInt.z * X - e.comVel.z * O;
      const J = Math.hypot(K, it),
        lt = 0.06;
      J > lt && ((K *= lt / J), (it *= lt / J)),
        g.set(n.pos.x + K, 0, n.pos.z + it);
    }
    const v = j(
        (0.85 - Math.min(this.legStrength.L, this.legStrength.R)) / 0.45,
        0,
        1,
      ),
      y =
        (f ? 0.008 : this.step || this.recentStep ? 0.02 : 0.012) +
        0.025 * this.startle +
        0.03 * (1 - i) +
        0.07 * v;
    let M = -1 / 0;
    for (const q of p) M = Math.max(M, e.footFloor[q]);
    !e.footContact.L && !e.footContact.R && (M = e.floorY),
      (this.standFloor = M);
    let w = M + s.pelvisBindY - y;
    const S = this._heelAnkle || (this._heelAnkle = { L: new L(), R: new L() }),
      _ = this._heelTh || (this._heelTh = { L: 0, R: 0 });
    for (const q of Le) _[q] = this.loco.heelOff(q, t, S[q]);
    const A = this.step ? [this.step.stance, this.step.foot] : Le;
    let E = null;
    if (!this.step && f && d > 1.3) {
      const q = Math.sin(this.heading),
        O = Math.cos(this.heading),
        X = this.ankleWorld("L", Xt),
        tt = X.x * q + X.z * O,
        pt = this.ankleWorld("R", Xt),
        ot = pt.x * q + pt.z * O;
      E = tt < ot ? "L" : "R";
    }
    for (const q of A) {
      if (q === E) continue;
      let O = 0;
      if (this.step && q === this.step.foot) {
        if (this.step.t / this.step.duration < 0.35) continue;
        Xt.copy(this.step.target),
          (Xt.y -= 0.01),
          (O = Math.max(0, this.step.duration - this.step.t));
      } else _[q] > 0 ? Xt.copy(S[q]) : this.ankleWorld(q, Xt);
      const X =
          g.x +
          e.comVel.x * O +
          Math.cos(this.heading) * s["hipAnchor" + q].x -
          Xt.x,
        tt =
          g.z +
          e.comVel.z * O -
          Math.sin(this.heading) * s["hipAnchor" + q].x -
          Xt.z,
        pt = (s["L1" + q] + s["L2" + q]) * 0.985,
        ot =
          Xt.y +
          Math.sqrt(Math.max(pt * pt - X * X - tt * tt, 0.04)) -
          s["hipAnchor" + q].y;
      w = Math.min(w, ot);
    }
    this.pelvisYTarget === void 0 && (this.pelvisYTarget = n.pos.y);
    const k =
      f &&
      this.loco.speed > 0.1 &&
      M - Math.min(e.footFloor.L, e.footFloor.R, this.lowFloor ?? M) > 0.04;
    (this.lowFloor = this.step
      ? Math.min(e.footFloor[this.step.stance], this.lowFloor ?? 9)
      : Math.min(e.footFloor.L, e.footFloor.R)),
      (this.pelvisYTarget =
        w < this.pelvisYTarget
          ? Qs(this.pelvisYTarget, w, 0.8 * t)
          : Qs(this.pelvisYTarget, w, (k ? 0.55 : 0.25) * t));
    const T = this.time - this.lastStepEnd,
      D = k && this.pelvisYTarget > n.pos.y + 0.02,
      C = b
        ? 0.04
        : D
          ? 0.03
          : T < 0.25 && !this.step
            ? 0.005
            : this.step
              ? 0.012
              : 0.045;
    if (
      (b &&
        w > this.pelvisYTarget &&
        (this.pelvisYTarget = Qs(this.pelvisYTarget, w, 0.6 * t)),
      T < 0.02 &&
        !this.step &&
        (this.pelvisYTarget = Math.min(this.pelvisYTarget, n.pos.y)),
      (g.y =
        Math.min(this.pelvisYTarget, n.pos.y + C) -
        (b ? 0 : j((n.vel.y - 0.15) * 0.1, 0, 0.05))),
      !this.step && T < 0.25 && n.vel.y < -0.12)
    ) {
      const q = g.y + Math.max((n.vel.y + 0.12) * 0.12, -0.05);
      g.y = Math.min(g.y, Math.max(q, this.pelvisYTarget - 0.06));
    }
    const P = this._pelRot || (this._pelRot = new ae());
    to(this.heading + (f ? this.loco.pelvisYaw() : 0), P);
    const R =
      this._legOut ||
      (this._legOut = { thigh: new ae(), shin: new ae(), reach: 0 });
    for (const q of Le) {
      const O = this.step && this.step.foot === q;
      this.seg["foot" + q].body;
      const X = this.footSpring[q];
      if (((X.enabled = !1), O)) {
        n.localToWorld(s["hipAnchor" + q], Ut);
        const tt = this.step;
        if (this.useFootSpring !== !1) {
          (X.enabled = !0), X.offset.subVectors(tt.ankleNow, Ut);
          const nt = tt.planting || tt.t / tt.duration > 0.85,
            ft =
              (tt.profile ? 1 + j(tt.profileTop * 3, 0, 0.7) : 1) *
              (tt.kind === "walk" ? 1 + j((tt.walkV - 1.25) * 0.6, 0, 0.6) : 1);
          X.maxForce =
            (this.footSpringForce ?? 200) *
            ft *
            this.legStrength[q] *
            this.tone *
            (nt ? 0.45 : 1);
        }
        n.localDirToWorld(Yn, Pe),
          (Pe.y = 0),
          Pe.normalize(),
          (Pe.x += Math.sin(this.heading)),
          (Pe.z += Math.cos(this.heading)),
          Pe.normalize(),
          (Pe.y = 0.15),
          this.legIK(q, Ut, tt.ankleNow, Pe, R),
          this.setWorld("hip" + q, R.thigh);
        const pt = tt.t / tt.duration,
          ot = this.swingGain ?? 0.8;
        this.gains("hip" + q, ot),
          (this.cmd["hip" + q].d *= 1.25),
          (this.cmd["hip" + q].tmax =
            tt.profile || (tt.kind === "walk" && tt.walkV > 1.4) ? 220 : 160),
          pt < 0.7 && !tt.planting
            ? this.feedForward("hip" + q, R.thigh, t)
            : (this.cmd["hip" + q].d *= tt.planting ? 2.5 : 1.6),
          Wt.multiplyConjA(R.thigh, R.shin),
          this.setRel("knee" + q, Wt),
          this.gains("knee" + q, ot * 0.75),
          (this.cmd["knee" + q].d *=
            pt > 0.55 || tt.planting
              ? tt.kind === "walk"
                ? Ht(1.5, 2.6, ee(1.3, 1.9, tt.walkV))
                : 2.6
              : 1.25),
          to(tt.yaw, ke),
          as.setFromEuler(tt.toePitch, 0, 0, "XYZ"),
          ke.multiply(as),
          Wt.multiplyConjA(R.shin, ke),
          this.setRel("ankle" + q, Wt),
          this.gains("ankle" + q, 0.35);
      } else {
        Ut.copy(s["hipAnchor" + q])
          .applyQuat(P)
          .add(g),
          _[q] > 0 ? Xt.copy(S[q]) : this.ankleWorld(q, Xt),
          e.footContact[q] ||
            (Xt.y = Math.max(
              Math.min(Xt.y - 0.02, e.footFloor[q] + 0.12),
              e.footFloor[q] + 0.075,
            )),
          Pe.set(Math.sin(this.heading), 0, Math.cos(this.heading)),
          this.legIK(q, Ut, Xt, Pe, R),
          Wt.multiplyConjA(P, R.thigh),
          this.setRel("hip" + q, Wt),
          this.gains("hip" + q, this.step ? (this.stanceHipGain ?? 1.2) : 1),
          Wt.multiplyConjA(R.thigh, R.shin),
          this.setRel("knee" + q, Wt);
        const tt =
          !this.step && q === this.lastStepFoot ? j(1 - T / 0.2, 0, 1) : 0;
        this.gains("knee" + q, 1 - 0.45 * tt),
          (this.cmd["knee" + q].d *= 1 + 1.2 * tt),
          tt > 0 &&
            !this.step &&
            ((this.cmd["hip" + q].k *= 1 - 0.3 * tt),
            (this.cmd["hip" + q].d *= 1 + 0.8 * tt)),
          to(f ? this.loco.plantYaw(q) : this.footYaw(q), ke),
          _[q] > 0 && ke.multiply(as.setFromEuler(_[q], 0, 0, "XYZ")),
          Wt.multiplyConjA(R.shin, ke),
          this.setRel("ankle" + q, Wt),
          this.gains("ankle" + q, _[q] > 0.02 ? 1.2 : b ? 0.3 : 1);
      }
    }
    Lt.set(e.cp.x - e.cpClosest.x, 0, e.cp.z - e.cpClosest.z);
    const z = Math.max(0, e.cpDist - (f ? 0.12 + 0.3 * d : 0));
    let H = 0,
      N = 0,
      I = 0;
    if (z > 0 && z < 1) {
      Lt.normalize();
      const q = Math.cos(-this.heading),
        O = Math.sin(-this.heading),
        X = Lt.x * q + Lt.z * O,
        tt = -Lt.x * O + Lt.z * q;
      (H = j(tt * z * 1.2, -0.25, 0.25)), (N = j(-X * z * 1.2, -0.2, 0.2));
    }
    if (
      ((H += 0.06 * this.startle + 0.25 * this.painHunch()),
      f &&
        ((H +=
          0.03 + 0.035 * Math.min(d, 1.4) + this.walkLean * j(d / 1.2, 0, 1)),
        this.step))
    ) {
      const q = this.step.stance,
        O = j((0.92 - this.legStrength[q]) / 0.4, 0, 1);
      N += (q === "L" ? -1 : 1) * 0.09 * O;
    }
    const U = this.flinch;
    if (
      (U.amount > 0.02 &&
        (U.kind === "gut"
          ? (H += 0.32 * U.amount)
          : U.kind === "torso"
            ? (H += 0.1 * U.amount)
            : U.kind === "leg"
              ? (N += 0.14 * U.amount * U.side)
              : U.kind === "arm"
                ? (N += 0.06 * U.amount * U.side)
                : U.kind === "head" && (H -= 0.12 * U.amount)),
      this.snap && this.time - this.snap.t0 < 0.6)
    ) {
      const q = this.snap.amp * Math.exp(-(this.time - this.snap.t0) / 0.15),
        O = Math.cos(-this.heading),
        X = Math.sin(-this.heading),
        tt = this.snap.dir;
      (H += (-tt.x * X + tt.z * O) * q),
        (N += -(tt.x * O + tt.z * X) * q),
        this.snap.twist &&
          (I += this.snap.twist * Math.exp(-(this.time - this.snap.t0) / 0.3));
    }
    if (this.dying && !this.dying.done && this.dying.dir) {
      const q = j(this.dying.t / this.dying.dur, 0, 1),
        O = this.dying.dir,
        X = Math.cos(-this.heading),
        tt = Math.sin(-this.heading),
        pt = 0.35 * Math.sin(Math.PI * Math.min(1, q * 1.6));
      (H += (-O.x * tt + O.z * X) * pt), (N += -(O.x * X + O.z * tt) * pt);
    }
    if (this.threat && this.threat.tti < 0.6) {
      const q = Math.cos(-this.heading),
        O = Math.sin(-this.heading),
        X = this.dodge.x * q + this.dodge.z * O,
        tt = -this.dodge.x * O + this.dodge.z * q;
      (H += j(tt * 0.3, -0.25, 0.25)), (N += j(-X * 0.3, -0.25, 0.25));
    }
    this.standingSpine(H, N, this.heading + I, 1);
    const $ = j(z * 2.5, 0, 1);
    (this.flail = $), this.relaxedArms(1, f ? this.loco.armSwing() : 0);
    const G = this.seg.chest.body.angVel;
    Ut.set(G.x, 0, G.z);
    const Q = Ut.length(),
      W = z > 0.1 && z < 1 ? j((Q - 1.5) / 1.2, 0, 1) : 0;
    W > 0.05 &&
      Q > 0.2 &&
      (this.wmDir || (this.wmDir = new L())).crossVectors(Ut, mi),
      (this.wmAmount = Qs(
        this.wmAmount || 0,
        W,
        t * (W > (this.wmAmount || 0) ? 6 : 0.7),
      )),
      this.wmAmount > 0.05 && this.wmDir
        ? this.windmill(t, this.wmAmount, Lt.copy(this.wmDir))
        : $ > 0.05 && this.armsOut($);
  }
  windmill(t, e, s) {
    if (s.lengthSq() < 1e-8) return;
    s.normalize(), (this.wmPhase = (this.wmPhase || 0) + t * (7 + 3 * e));
    const n = this.seg.chest.body,
      i = n.localDirToWorld(Ke, new L()),
      a =
        this._armOut ||
        (this._armOut = { upper: new ae(), fore: new ae(), reach: 0 });
    for (const r of Le) {
      if (this.armStrength[r] < 0.3) continue;
      const l = r === "L" ? 1 : -1,
        c = n.localToWorld(this.geo["shoulderAnchor" + r], new L()),
        h = (this.geo["A1" + r] + this.geo["A2" + r]) * (0.55 + 0.3 * e),
        u = c.clone().addScaled(i, l * 0.12),
        d = this.wmPhase + (r === "L" ? 0 : 0.6),
        f = u
          .addScaled(s, -Math.cos(d) * h)
          .addScaled(mi, Math.sin(d) * h * 0.9 + 0.05),
        p = new L(0, -1, 0).addScaled(i, l * 0.7);
      this.armIK(r, c, f, p, a),
        this.setWorld("shoulder" + r, a.upper, 120 * (0.6 + 0.4 * e), 8, 85),
        this.feedForward("shoulder" + r, a.upper, t),
        Wt.multiplyConjA(a.upper, a.fore),
        this.setRel("elbow" + r, Wt, 50, 2.5, 50);
    }
  }
  posturalSway(t, e, s) {
    const n = this.sens,
      i =
        e < 0.1 &&
        n.cpDist < 0 &&
        this.time - this.lastStepEnd > 1.5 &&
        !this.threat;
    this.quietTime = i ? (this.quietTime || 0) + t : 0;
    const a = ee(0.5, 2.5, this.quietTime),
      r = (f, p) => Wg(this.time * f + p, this.seed),
      l = Math.sin(this.heading),
      c = Math.cos(this.heading),
      h = 0.004 * (0.7 * r(0.21, 3.1) + 0.3 * r(0.57, 7.7)) * a,
      u = 0.0025 * (0.7 * r(0.16, 11.3) + 0.3 * r(0.43, 5.2)) * a;
    (s.x += l * h + c * u), (s.z += c * h - l * u);
    const d =
      this.wshift ||
      (this.wshift = { next: 25 + 10 * this.rng(), t: -1, side: "L", hold: 5 });
    if (d.t < 0) {
      if (this.quietTime > d.next) {
        d.t = 0;
        const f = this.legStrength.L - this.legStrength.R;
        (d.side =
          Math.abs(f) > 0.08
            ? f > 0
              ? "L"
              : "R"
            : this.rng() < 0.5
              ? "L"
              : "R"),
          (d.hold = 4 + 6 * this.rng());
      }
    } else {
      d.t += t;
      const f = ee(0, 2, d.t) * (1 - ee(2 + d.hold, 4 + d.hold, d.t));
      !i && d.t < 2 + d.hold && (d.t = 2 + d.hold),
        d.t > 4 + d.hold &&
          ((d.t = -1), (d.next = 20 + 25 * this.rng()), (this.quietTime = 0));
      const p = this.soleCenter(d.side, Pe);
      (s.x += (p.x - s.x) * 0.4 * f), (s.z += (p.z - s.z) * 0.4 * f);
    }
  }
  onHit(t) {
    if (!this.alive || !this.conscious) return;
    const e = this.reactions === "rdr",
      s = t.strength * (e ? 1.5 : 1),
      n = t.kind !== "bullet" && this.time - (this.lastThreatTime ?? -9) < 0.5;
    this.startle = Math.min(
      1.2,
      this.startle + (n ? 0.15 + 0.3 * s : 0.4 + 0.6 * s),
    );
    const i = t.segment,
      a = i.endsWith("L") ? 1 : i.endsWith("R") ? -1 : 0,
      r = /^(abdomen|pelvis)$/.test(i)
        ? "gut"
        : i === "chest"
          ? "torso"
          : /^(thigh|shin|foot)/.test(i)
            ? "leg"
            : /^(upperArm|forearm|hand)/.test(i)
              ? "arm"
              : "head",
      l = this.flinch,
      c = Math.min(1.2, (0.35 + 0.9 * s) * (n ? 0.6 : 1));
    c >= l.amount * 0.8 &&
      ((l.amount = c), (l.kind = r), (l.side = a), (l.time = this.time));
    const h = this.seg[i] ? this.seg[i].body : null;
    if (t.dir && h) {
      const u =
        this.attention || (this.attention = { point: new L(), until: 0 });
      if (
        (t.kind === "bullet"
          ? u.point.copy(h.pos).addScaled(t.dir, -6)
          : u.point.copy(h.pos).addScaled(t.dir, -0.6),
        (u.until = this.time + (t.kind === "bullet" ? 1.4 : 0.8)),
        t.kind === "bullet" && /^(chest|abdomen|pelvis|neck)$/.test(i))
      ) {
        const d = this.snap || (this.snap = { dir: new L(), t0: -9, amp: 0 });
        d.dir.set(t.dir.x, 0, t.dir.z),
          d.dir.lengthSq() > 1e-6 && d.dir.normalize(),
          (d.t0 = this.time),
          (d.amp = Math.min(e ? 0.6 : 0.35, (0.12 + 0.2 * s) * (e ? 1.8 : 1))),
          (d.twist = 0);
      }
      if (
        e &&
        t.kind === "bullet" &&
        /^(chest|upperArm|forearm|hand)/.test(i)
      ) {
        const d = this.snap || (this.snap = { dir: new L(), t0: -9, amp: 0 });
        this.time - d.t0 > 0.02 &&
          (d.dir.set(t.dir.x, 0, t.dir.z),
          d.dir.lengthSq() > 1e-6 && d.dir.normalize(),
          (d.t0 = this.time),
          (d.amp = Math.min(0.45, 0.15 + 0.25 * s)));
        const f = h.pos.x - this.seg.chest.body.pos.x,
          p = h.pos.z - this.seg.chest.body.pos.z,
          m = f * t.dir.z - p * t.dir.x;
        d.twist = j(-m * 6, -0.5, 0.5) * (0.6 + 0.4 * Math.min(1, s));
      }
    }
    this.events.push({ type: "hit", segment: i, strength: s, time: this.time });
  }
  painHunch() {
    return j(this.pain - 0.3, 0, 0.7);
  }
  soleCenter(t, e) {
    const s = this.seg["foot" + t].body;
    return (
      e.set(0, 0, -0.012).applyQuat(s.rot).add(s.pos),
      (e.y = this.sens.footFloor[t]),
      e
    );
  }
  armsOut(t) {
    for (const e of Le) {
      const s = e === "L" ? 1 : -1;
      Wt.setFromEuler(-0.35 * t, 0, (0.9 * t - 0.1) * s, "XYZ"),
        this.setRel("shoulder" + e, Wt, 90, 7, 80);
    }
  }
  chooseCatchFoot() {
    const t = this.sens;
    let e = null,
      s = 1 / 0;
    for (const n of Le) {
      const i = n === "L" ? "R" : "L";
      if (!t.footContact[i] && t.footContact[n]) continue;
      const a = this.captureTarget(n, i, 0.3, Xt);
      this.ankleWorld(n, Pe);
      let r = Math.hypot(Xt.x - Pe.x, Xt.z - Pe.z) + a;
      this.legStrength[i] < 0.5 && (r += 1),
        (r += 0.12 * t.footLoad[n]),
        this.lastStepFoot === n &&
          this.time - this.lastStepEnd < 0.4 &&
          (r += 0.5),
        r < s && ((s = r), (e = n));
    }
    return e || (t.footLoad.L < t.footLoad.R ? "L" : "R");
  }
  updateSettle(t, e) {
    const s = this.sens;
    if (this.settleFoot) {
      this.settleTime += t;
      const i = this.settleFoot === "L" ? "R" : "L";
      this.soleCenter(i, Ut);
      const a = Math.hypot(s.com.x - Ut.x, s.com.z - Ut.z);
      if (
        (s.footLoad[i] / Math.max(s.footLoad.L + s.footLoad.R, 0.001) > 0.85 &&
          a < 0.035 &&
          e < 0.08 &&
          this.settleTime > 0.2) ||
        (this.settleTime > 1.6 && a < 0.05)
      ) {
        const c = this.settleFoot;
        (this.settleFoot = null), this.beginStep(c, "settle");
      } else
        (e > 0.35 || this.settleTime > 1.6) &&
          ((this.settleFoot = null),
          (this.settleFails = (this.settleFails || 0) + 1),
          (this.settleBlock = this.time + (this.settleFails >= 2 ? 8 : 2.5)));
      return;
    }
    if (
      e > 0.15 ||
      this.time - this.lastStepEnd < 0.25 ||
      this.time < (this.settleBlock ?? -1)
    ) {
      this.awkwardTime = 0;
      return;
    }
    const n = this.stanceAwkwardness();
    (this.awkwardTime = n.score > 0 ? (this.awkwardTime || 0) + t : 0),
      this.awkwardTime > 0.3 &&
        ((this.settleFoot = n.foot),
        (this.settleTime = 0),
        (this.awkwardTime = 0));
  }
  stanceAwkwardness() {
    const t = this.sens,
      e = Math.sin(this.heading),
      s = Math.cos(this.heading),
      n = s,
      i = -e;
    this.soleCenter("L", Ut), this.soleCenter("R", Xt);
    const a = Xt.x - Ut.x,
      r = Xt.z - Ut.z,
      l = a * e + r * s,
      c = -(a * n + r * i);
    let h = 0;
    Math.abs(l) > 0.17 && (h += Math.abs(l) - 0.17),
      c < 0.12 && (h += 0.12 - c),
      c > 0.38 && (h += c - 0.38),
      (!t.footContact.L || !t.footContact.R) && (h += 0.1);
    const u = Math.hypot(t.com.x - Ut.x, t.com.z - Ut.z),
      d = Math.hypot(t.com.x - Xt.x, t.com.z - Xt.z);
    let f = u > d ? "L" : "R";
    const p = (m) => (m === "L" ? "R" : "L");
    return (
      this.legStrength[p(f)] < 0.5 && this.legStrength[f] >= 0.5 && (f = p(f)),
      !t.footContact[p(f)] && t.footContact[f] && (f = p(f)),
      { foot: f, score: h }
    );
  }
  beginStep(t, e = "catch") {
    const s = t === "L" ? "R" : "L",
      n = this.ankleWorld(t, new L());
    (this.step = {
      foot: t,
      stance: s,
      kind: e,
      t: 0,
      duration: 0.32,
      start: n,
      ankleNow: n.clone(),
      target: n.clone(),
      prevAnkle: n.clone(),
      yaw: this.footYaw(t),
      startYaw: this.footYaw(t),
      toePitch: 0,
      lift: 0.08,
    }),
      e === "walk" && this.loco.setupStep(this.step),
      this.planStepTarget(this.step.target);
    const i = Math.hypot(this.step.target.x - n.x, this.step.target.z - n.z);
    if (this.step.kind === "walk")
      this.loco.buildProfile(this.step),
        this.step.profile &&
          (this.step.duration += j(0.5 * this.step.profileTop, 0, 0.18));
    else if (e === "settle")
      (this.step.duration = j(0.3 + 0.35 * i, 0.32, 0.5)),
        (this.step.lift = j(0.035 + 0.08 * i, 0.04, 0.08));
    else {
      const d = this.stepParams || {};
      (this.step.duration = j(
        (d.t0 ?? 0.18) + (d.t1 ?? 0.15) * i,
        d.tmin ?? 0.2,
        0.36,
      )),
        (this.step.lift = j(
          0.05 + 0.1 * i,
          d.liftMin ?? 0.06,
          d.liftMax ?? 0.09,
        ));
    }
    const a = this.soleCenter(s, Ut),
      r = Math.cos(this.heading),
      l = -Math.sin(this.heading),
      c = t === "L" ? 1 : -1,
      h = (this.step.target.x - a.x) * r + (this.step.target.z - a.z) * l,
      u = (n.x - a.x) * r + (n.z - a.z) * l;
    (this.step.cross = c * h < 0.06 && c * u > 0.06),
      this.stepCount++,
      this.comInt.setZero(),
      (this.settleFails = 0),
      (this.settleBlock = -1),
      this.events.push({ type: "step", foot: t, kind: e, time: this.time });
  }
  stancePivot(t, e, s = !1) {
    const n = this.sens,
      i = this.seg["foot" + t].body,
      a = i.shapes[0],
      r = s ? n.cpB : n.cp;
    i.worldToLocal(Ut.set(r.x, i.pos.y, r.z), Xt), Xt.sub(a.localPos);
    const l = a.halfExtents.x - 0.015,
      c = a.halfExtents.z - 0.02;
    return (
      (Xt.x = j(Xt.x, -l, l)),
      (Xt.z = s ? j(Xt.z, -0.03, 0.02) : j(Xt.z, -c, c)),
      (Xt.y = 0),
      Xt.add(a.localPos),
      i.localToWorld(Xt, e),
      (e.y = this.sens.footFloor[t]),
      e
    );
  }
  captureTarget(t, e, s, n, i = 0) {
    const a = this.sens,
      r = this.stancePivot(e, Lt),
      l = 1 + (Math.exp(a.w0 * s) - 1) * (this.cpScale ?? 1);
    n.set(r.x + (a.cp.x - r.x) * l, 0, r.z + (a.cp.z - r.z) * l);
    const c = a.comVel.x,
      h = a.comVel.z,
      u = Math.hypot(c, h);
    if (u > 0.05) {
      const A = j(0.03 + 0.06 * u, 0.03, 0.1);
      (n.x += (c / u) * A), (n.z += (h / u) * A);
    }
    const d = this.soleCenter(e, Ut),
      f = Math.sin(this.heading),
      p = Math.cos(this.heading),
      m = p,
      x = -f;
    let g = (n.x - d.x) * f + (n.z - d.z) * p,
      b = (n.x - d.x) * m + (n.z - d.z) * x;
    const v = t === "L" ? 1 : -1;
    b += v * 0.035;
    const y = 0.15,
      M = (this.stepParams && this.stepParams.maxW) ?? 0.7;
    let w = 0;
    if (((this._crossSign = 0), v * b < y))
      if (v * b < 0.02) {
        b = v * Math.max(v * b, -0.16);
        const A = i || (g >= -0.02 ? 1 : -1);
        A * g < 0.16 && (g = A * 0.16),
          (this._crossSign = A),
          (w = 0.25 + Math.abs(v * b - y));
      } else b = v * y;
    else v * b > M && (b = v * M);
    g = j(g, -0.5, 0.75);
    const S = Math.hypot(g, b),
      _ = (this.stepParams && this.stepParams.maxL) ?? 0.8;
    return (
      S > _ && ((g *= _ / S), (b *= _ / S)),
      (n.x = d.x + f * g + m * b - f * 0.058),
      (n.z = d.z + p * g + x * b - p * 0.058),
      this.world.staticBodies.length && this.step
        ? this.loco.terrainAdjust(this.step, n, f, p, d.y)
        : (n.y = this.floorAt(n.x + f * 0.06, n.z + p * 0.06, d.y) + 0.085),
      w
    );
  }
  floorAt(t, e, s = this.sens.floorY) {
    return this.world.surfaceAt(t, e, Math.max(s, this.sens.floorY) + 0.45);
  }
  planStepTarget(t) {
    const e = this.step;
    if (e.kind === "walk") return this.loco.planTarget(e, t);
    if (e.kind === "settle") {
      const s = this.soleCenter(e.stance, Lt),
        n = Math.sin(this.heading),
        i = Math.cos(this.heading),
        a = i,
        r = -n,
        l = e.foot === "L" ? 1 : -1;
      return (
        t.set(
          s.x + a * 0.21 * l - n * 0.058,
          0,
          s.z + r * 0.21 * l - i * 0.058,
        ),
        (t.y = this.floorAt(t.x + n * 0.06, t.z + i * 0.06, s.y) + 0.085),
        t
      );
    }
    return (
      this.captureTarget(
        e.foot,
        e.stance,
        Math.max(0.05, e.duration - e.t),
        t,
        e.crossSign || 0,
      ),
      !e.crossSign && this._crossSign && (e.crossSign = this._crossSign),
      t
    );
  }
  updateStep(t) {
    const e = this.step,
      s = this.sens;
    e.t += t;
    const n = e.kind === "walk" ? Ht(0.8, 0.45, ee(1.3, 1.9, e.walkV)) : 0.8;
    if (
      e.t / e.duration < n &&
      !e.planting &&
      (Xt.copy(e.target),
      this.planStepTarget(e.target),
      this.world.staticBodies.length &&
        (!e.profileAt || Xt.distanceTo(e.target) > 0.03) &&
        (this.loco.buildProfile(e), (e.profileAt = !0)),
      e.kind !== "walk" && e.kind !== "settle")
    ) {
      const d = this.stepParams || {},
        f = Math.hypot(e.target.x - e.start.x, e.target.z - e.start.z);
      e.duration = Math.max(
        e.duration,
        j((d.t0 ?? 0.18) + (d.t1 ?? 0.15) * f, d.tmin ?? 0.2, 0.36),
      );
    }
    const i = e.t / e.duration;
    e.prevAnkle.copy(e.ankleNow);
    const a = this.ankleWorld(e.foot, Ut);
    if (
      !e.planting &&
      i > 0.45 &&
      e.kind !== "settle" &&
      e.kind !== "walk" &&
      !e.profile
    ) {
      const d = e.target.x - e.start.x,
        f = e.target.z - e.start.z,
        p = d * d + f * f;
      if (p > 0.01) {
        const m = this.seg["foot" + e.foot].body.vel,
          x = Math.max(0, a.y - e.target.y) / 0.9 + 0.03,
          g = 0.6,
          b = a.x + m.x * x * g,
          v = a.z + m.z * x * g,
          y = ((b - e.start.x) * d + (v - e.start.z) * f) / p,
          M = !e.cross || Math.hypot(a.x - e.target.x, a.z - e.target.z) < 0.08;
        y > 0.95 &&
          M &&
          ((e.planting = !0),
          (e.plantAt = e.target.clone()),
          (e.plantAt.y = a.y),
          (e.plantT = 0));
      }
    }
    if (e.planting) {
      (e.plantT += t),
        e.ankleNow.set(
          e.plantAt.x,
          Math.max(e.target.y - 0.02, e.plantAt.y - e.plantT * 0.9),
          e.plantAt.z,
        ),
        (e.toePitch = 0),
        ((s.footContact[e.foot] && e.plantT > 0.03) || e.plantT > 0.3) &&
          this.endStep(e);
      return;
    }
    const r = e.kind === "walk" ? ee(1.3, 1.9, e.walkV) : 0;
    let l = ee(Ht(0.05, 0, r), Ht(0.85, 0.95, r), i);
    if (e.profile) {
      const d = this.ankleWorld(e.foot, Ut).y,
        f = Math.max(
          0.2,
          Math.hypot(e.target.x - e.start.x, e.target.z - e.start.z),
        );
      e.u === void 0 &&
        (e.u = j(
          ((Ut.x - e.start.x) * (e.target.x - e.start.x) +
            (Ut.z - e.start.z) * (e.target.z - e.start.z)) /
            (f * f),
          0,
          1,
        ));
      const p = this.loco.progressGate(e, d),
        m = Math.min(
          j(l, e.u || 0, Math.max(e.u || 0, p)),
          (e.u || 0) + (3.2 * t) / f,
        );
      m < l - 0.02 && (e.t -= t * 0.6), (e.u = m), (l = m);
    }
    if ((e.ankleNow.lerpVectors(e.start, e.target, l), e.kind === "walk")) {
      const d = Math.cos(this.heading),
        f = -Math.sin(this.heading),
        p = e.foot === "L" ? 1 : -1,
        m = this.soleCenter(e.stance, Ut),
        x = (e.ankleNow.x - m.x) * d + (e.ankleNow.z - m.z) * f,
        g = Math.max(0, 0.13 - p * x) * Math.sin(Math.PI * l);
      (e.ankleNow.x += d * p * g), (e.ankleNow.z += f * p * g);
    }
    if (e.cross) {
      const d = Math.sin(this.heading),
        f = Math.cos(this.heading),
        p = this.soleCenter(e.stance, Ut),
        m = (e.target.x - p.x) * d + (e.target.z - p.z) * f,
        x = (e.crossSign || (m >= 0 ? 1 : -1)) * 0.14 * Math.sin(Math.PI * l);
      (e.ankleNow.x += d * x), (e.ankleNow.z += f * x);
    }
    const c = j(i / 0.9, 0, 1);
    (e.ankleNow.y =
      Ht(e.start.y, e.target.y, l) +
      e.lift * Math.pow(Math.sin(Math.PI * c), 0.7)),
      e.profile &&
        i < 0.95 &&
        (e.ankleNow.y = Math.max(e.ankleNow.y, this.loco.profileAt(e, l))),
      i > 0.9 &&
        (e.ankleNow.y = Math.min(
          e.ankleNow.y,
          e.target.y - Math.min(0.02, (i - 0.9) * 0.15),
        )),
      (e.yaw =
        e.startYaw +
        cn(
          (e.kind === "walk" && e.turnTo !== void 0 ? e.turnTo : this.heading) -
            e.startYaw,
        ) *
          l),
      e.kind === "walk"
        ? (e.toePitch =
            i < 0.18
              ? Ht(0.32, -0.1, i / 0.18)
              : i < 0.7
                ? -0.1
                : Ht(-0.1, -0.24, ee(0.7, 0.95, i)))
        : (e.toePitch =
            i < 0.75
              ? -0.22 * ee(0, 0.25, i)
              : -0.22 * (1 - ee(0.75, 0.95, i)));
    const h = s.footContact[e.foot],
      u =
        Math.hypot(
          this.ankleWorld(e.foot, Ut).x - e.target.x,
          Ut.z - e.target.z,
        ) < 0.07;
    ((i > 0.8 && h) || (i > 0.5 && h && u) || i > 1.5) && this.endStep(e);
  }
  endStep(t) {
    if (
      ((this.step = null),
      this.loco.onLand(t),
      (this.lastStepEnd = this.time),
      (this.lastStepFoot = t.foot),
      t.kind !== "settle" && this.cdes)
    ) {
      const e = this.sens,
        s = this.soleCenter("L", Ut),
        n = this.soleCenter("R", Xt),
        i = n.x - s.x,
        a = n.z - s.z,
        r = j(
          ((e.cp.x - s.x) * i + (e.cp.z - s.z) * a) / (i * i + a * a || 1e-6),
          0.1,
          0.9,
        );
      this.cdes.set(s.x + i * r, 0, s.z + a * r), this.comInt.setZero();
    }
    this.events.push({ type: "land", foot: t.foot, time: this.time });
  }
  doFalling(t) {
    const e = this.sens;
    if (((this.assist = 0), this.fallCause === "legs")) {
      this.doKneelFall(t);
      return;
    }
    Lt.set(e.comVel.x, 0, e.comVel.z),
      Lt.lengthSq() > 0.04 &&
        this.fallDir.lerp(Lt.normalize(), j(t * 6, 0, 1)).normalize();
    const s = this.fallDir,
      n = this.heading,
      i = Math.sin(n),
      a = Math.cos(n),
      r = s.x * i + s.z * a,
      l = s.x * a - s.z * i;
    this.standingSpine(
      r > -0.3 ? 0.25 : 0.35,
      0,
      ul(this.seg.pelvis.body.rot),
      0.55,
    );
    const h = this.seg.chest.body.localDirToWorld(Yn, Pe).y,
      u = h > 0.25 || (h > -0.25 && r < 0);
    Wt.copy(this.seg.chest.body.rot),
      ke.setFromEuler(u ? 0.6 : -0.35, 0, -l * 0.3, "XYZ"),
      Wt.multiply(ke),
      this.setWorld("neckTop", Wt, 150, 7, 45),
      this.setRel(
        "neckBase",
        ke.setFromEuler(u ? 0.5 : -0.2, 0, 0, "XYZ"),
        170,
        8,
        65,
      );
    for (const d of Le)
      this.setRel("hip" + d, Wt.setFromEuler(-0.5, 0, 0, "XYZ")),
        this.gains("hip" + d, 0.18),
        this.setRel("knee" + d, Wt.setFromAxisAngle(Ke, 0.8)),
        this.gains("knee" + d, 0.15),
        this.setRel("ankle" + d, Wt.identity()),
        this.gains("ankle" + d, 0.2);
    this.braceArms(s, r, l, t);
  }
  doKneelFall(t) {
    const e = this.seg,
      s = this.sens,
      n = e.pelvis.body,
      i = e.chest.body;
    this.kneel || (this.braceLatch = this.kneelReach = null);
    const a =
      this.kneel ||
      (this.kneel = {
        t: 0,
        down: -1,
        phase: "drop",
        pt: 0,
        topple: 0,
        pitch: 0,
        both: 0,
        yaw: ul(n.rot),
        spot: null,
        ready: null,
        turn: this.rng() < 0.5 ? 1 : -1,
      });
    (a.t += t), (a.pt += t);
    const r = (S) => {
        (a.phase = S), (a.pt = 0);
      },
      l = (S) =>
        S.body.groundContact ||
        (S.fractured ? S.fractured.extra.some((_) => _.groundContact) : !1);
    if (
      (a.down < 0 &&
        (l(e.shinL) || l(e.shinR) || l(e.thighL) || l(e.thighR)) &&
        ((a.down = a.t), r("kneel")),
      a.phase === "drop" || a.phase === "hands")
    ) {
      const S = i.angVel,
        _ = e.head.body.vel,
        A = Math.hypot(S.x, S.z),
        E = Math.hypot(_.x, _.z);
      if (
        (a.down < 0 && s.chestTilt > 0.6) ||
        A > 2.2 ||
        (E > 1.4 && e.head.body.pos.y - this.world.groundY > 0.3)
      ) {
        this.fallCause = "balance";
        const k = this.sens.comVel;
        this.fallDir.set(k.x + _.x, 0, k.z + _.z),
          this.fallDir.lengthSq() < 0.01 &&
            this.fallDir.set(Math.sin(a.yaw), 0, Math.cos(a.yaw)),
          this.fallDir.normalize(),
          (this.modeTime = 0),
          (this.kneel = null),
          this.doFalling(t);
        return;
      }
    }
    if (a.down >= 0 && a.phase !== "lower") {
      const S = this.sens.comVel,
        _ = -(
          i.localDirToWorld(mi, Lt).x * Math.sin(a.yaw) +
          Lt.z * Math.cos(a.yaw)
        );
      if (Math.hypot(S.x, S.z) > 1 || (_ > 0.35 && a.phase === "kneel")) {
        (this.fallCause = "balance"),
          this.fallDir.set(S.x, 0, S.z),
          this.fallDir.lengthSq() < 0.01 &&
            this.fallDir.set(-Math.sin(a.yaw), 0, -Math.cos(a.yaw)),
          this.fallDir.normalize(),
          (this.modeTime = 0),
          (this.kneel = null),
          this.doFalling(t);
        return;
      }
    }
    const c = Math.min(this.legStrength.L, this.legStrength.R),
      h = j(Math.min(this.spineStrength, 0.4 + c) - 0.45 * this.pain, 0, 1),
      u = this.ableToGetUp() && this.autoGetUp && this.assistGain >= 0.25;
    if (a.phase === "kneel") {
      const S = u ? 0.7 : 0.4 + 2.6 * h;
      (a.hold = S),
        (a.pt > S || s.chestTilt > 0.7 || s.pelvisH < 0.3) &&
          (r("hands"),
          (this.braceLatch = { L: null, R: null }),
          (a.pitch = Math.min(s.chestTilt, 0.6)));
    }
    const d = Math.sin(a.yaw),
      f = Math.cos(a.yaw),
      p = a.phase === "hands" || a.phase === "lower";
    a.topple = p ? 1 : 0;
    let m, x;
    if (a.down >= 0)
      this.jt.kneeL.worldAnchor(Ut),
        this.jt.kneeR.worldAnchor(Xt),
        (m = (Ut.x + Xt.x) / 2),
        (x = (Ut.z + Xt.z) / 2);
    else {
      if (!a.spot) {
        const S = this.ankleWorld("L", Ut),
          _ = this.ankleWorld("R", Xt);
        a.spot = new L((S.x + _.x) / 2 + d * 0.3, 0, (S.z + _.z) / 2 + f * 0.3);
      }
      (m = a.spot.x), (x = a.spot.z);
    }
    let g = 0;
    if (a.phase === "hands") {
      const S = (this.braceLatch.L ? 1 : 0) + (this.braceLatch.R ? 1 : 0);
      a.both = S === 2 ? a.both + t : 0;
      const _ =
        Math.min(e.handL.body.pos.y, e.handR.body.pos.y) - this.world.groundY <
        0.22;
      S
        ? (a.pitch = Qs(a.pitch, j(s.chestTilt, 0.9, 1.6), 0.6 * t))
        : (a.pitch =
            a.pitch < 1.3
              ? Qs(a.pitch, 1.3, (_ ? 1.1 : 0.55) * t)
              : Qs(a.pitch, 1.62, 0.5 * t));
      const A = this.rd.computeCOMVelocity(Lt).length() < 0.25;
      (a.both > 0.3 || (S && a.pt > 1.6)) && A
        ? u
          ? (a.ready = "getup")
          : ((a.ready = null), r("lower"))
        : a.pt > 2.8 && r("lower");
    }
    a.phase === "lower" &&
      ((g = ee(0, 1.6, a.pt)), (a.pitch = Qs(a.pitch, 1.5, 0.5 * t)));
    for (const S of Le) {
      if (p)
        this.setRel(
          "hip" + S,
          Wt.setFromEuler(-0.1 - 0.85 * a.pitch * (1 - 0.7 * g), 0, 0, "XYZ"),
        ),
          this.gains("hip" + S, 0.45 - 0.25 * g),
          this.setRel(
            "knee" + S,
            Wt.setFromAxisAngle(
              Ke,
              1.75 + 0.3 * j(a.pitch / 1.3, 0, 1) * (1 - g) - 1.1 * g,
            ),
          ),
          this.gains("knee" + S, 0.35 - 0.2 * g);
      else if (
        (this.setRel("hip" + S, Wt.setFromEuler(-0.1, 0, 0, "XYZ")),
        this.gains("hip" + S, 0.5),
        a.down >= 0)
      )
        this.setRel("knee" + S, Wt.setFromAxisAngle(Ke, 1.75)),
          this.gains("knee" + S, 0.35);
      else {
        const _ = j((0.6 - this.legStrength[S]) / 0.5, 0, 1);
        this.jt["knee" + S].relativeRotation(Wt);
        const A = 2 * Math.atan2(Wt.x, Wt.w);
        this.setRel(
          "knee" + S,
          Wt.setFromAxisAngle(
            Ke,
            Math.min(2, Math.max(A, 0) + 0.05 + 0.45 * _),
          ),
        ),
          this.gains("knee" + S, 0.45),
          (this.cmd["knee" + S].d *= 1 + 4 * (1 - _));
      }
      this.setRel("ankle" + S, Wt.setFromAxisAngle(Ke, p ? 0.4 : -0.3)),
        this.gains("ankle" + S, 0.05);
    }
    const b = this.legStrength.L < this.legStrength.R,
      v = j(Math.abs(this.legStrength.L - this.legStrength.R) * 2, 0, 1);
    p
      ? (to(a.yaw, Wt),
        ke.setFromEuler(a.pitch * 0.85, 0, (b ? -1 : 1) * 0.1 * v, "XYZ"),
        as.multiplyQuats(Wt, ke),
        this.setWorld("lumbar", as),
        this.gains("lumbar", 0.8),
        ke.setFromEuler(a.pitch, 0, 0, "XYZ"),
        as.multiplyQuats(Wt, ke),
        this.setWorld("thoracic", as),
        this.gains("thoracic", 0.8),
        this.setRel(
          "neckBase",
          ke.setFromEuler(-0.25, 0, 0, "XYZ"),
          170,
          8,
          65,
        ),
        Wt.copy(i.rot),
        ke.setFromEuler(-0.5, a.turn * (0.25 + 0.7 * g), 0, "XYZ"),
        Wt.multiply(ke),
        this.setWorld("neckTop", Wt, 150, 7, 45))
      : (this.standingSpine(
          0.12 + 0.15 * this.painHunch(),
          (b ? -1 : 1) * 0.06,
          a.yaw,
          0.75,
        ),
        Wt.setFromEuler(0.25, 0, 0, "XYZ"),
        this.setRel("neckTop", Wt, 60, 3, 30));
    const y = this.assistGain * (a.down >= 0 ? 0.6 + 0.4 * h : 1) * (1 - g);
    if (y > 0.01) {
      const S = p ? 0.04 + 0.08 * Math.min(a.pitch, 1.2) : 0;
      (n.force.x +=
        j((m - d * S - n.pos.x) * 500 - n.vel.x * 120, -180, 180) * y),
        (n.force.z +=
          j((x - f * S - n.pos.z) * 500 - n.vel.z * 120, -180, 180) * y),
        to(a.yaw, Wt);
      for (const [_, A, E, k] of [
        [n, 320, 150, 0.6],
        [i, 260, 120, 1],
      ]) {
        ke.setFromEuler(p ? a.pitch * k : 0, 0, 0, "XYZ"),
          as.multiplyQuats(Wt, ke),
          as.multiplyConjB(as, _.rot).toRotVec(Ut),
          (Ut.y = 0),
          Ut.scale(A),
          Xt.copy(_.angVel),
          (Xt.y = 0),
          Ut.addScaled(Xt, -0.12 * A);
        const T = Ut.length();
        T > E && Ut.scale(E / T), _.torque.addScaled(Ut, y);
      }
    }
    const M = this.rd.totalMass * ts;
    if (a.phase === "drop") {
      const S = j((this.legStrength.L + this.legStrength.R) / 2, 0, 0.6);
      n.force.y +=
        j((-(0.7 + 2.5 * (0.6 - S)) - n.vel.y) * 400, 0, S * 0.6 * M) *
        this.assistGain;
    }
    a.phase === "lower" &&
      ((i.force.y += j((-0.3 - i.vel.y) * 260, 0, 0.4 * M) * this.assistGain),
      (n.force.y += j((-0.3 - n.vel.y) * 260, 0, 0.3 * M) * this.assistGain));
    const w =
      (a.phase === "kneel" && a.pt > 0.5 * (a.hold || 0.7)) ||
      (a.phase === "drop" && s.chestTilt > 0.35);
    w && (a.topple = 1),
      p || w
        ? (this.fallDir.set(d, 0, f), this.kneelArms(a, t, g))
        : this.relaxedArms(0.8, 0);
  }
  kneelArms(t, e, s) {
    const n = this.seg.chest.body,
      i = this.world.groundY,
      a = Math.sin(t.yaw),
      r = Math.cos(t.yaw),
      l = r,
      c = -a;
    this.braceLatch || (this.braceLatch = { L: null, R: null }),
      this.kneelReach || (this.kneelReach = { L: null, R: null });
    const h =
      this._armOut ||
      (this._armOut = { upper: new ae(), fore: new ae(), reach: 0 });
    this.jt.kneeL.worldAnchor(Ut), this.jt.kneeR.worldAnchor(Xt);
    const u = (Ut.x + Xt.x) / 2,
      d = (Ut.z + Xt.z) / 2,
      f = new L();
    for (const p of Le) {
      if (
        this.armStrength[p] < 0.15 ||
        (this.armTask[p] && this.armTask[p].priority > 2)
      )
        continue;
      const m = p === "L" ? 1 : -1,
        x = n.localToWorld(this.geo["shoulderAnchor" + p], new L()),
        g = this.seg["hand" + p].body;
      !this.braceLatch[p] &&
        g.groundContact &&
        (this.braceLatch[p] = g.pos.clone());
      const b = this.braceLatch[p];
      if ((f.set(-a + l * m * 0.5, 0.3, -r + c * m * 0.5), b)) {
        Ut.copy(b), (Ut.y = i + 0.05), this.armIK(p, x, Ut, f, h);
        const S = 1 - 0.65 * s;
        this.setWorld("shoulder" + p, h.upper, 280 * S, 16, 150 * S),
          Wt.multiplyConjA(h.upper, h.fore),
          this.setRel("elbow" + p, Wt, 150 * S, 9, 115 * S),
          (this.cmd["elbow" + p].gc = 1.6 * S),
          this.palmDown(p, this.fallDir);
        continue;
      }
      Ut.set(
        u + a * 0.34 + l * m * 0.17,
        i + 0.03,
        d + r * 0.34 + c * m * 0.17,
      );
      const v = (this.geo["A1" + p] + this.geo["A2" + p]) * 0.95;
      Lt.subVectors(Ut, x),
        Lt.length() > v && Ut.copy(x).addScaled(Lt, v / Lt.length());
      let y = this.kneelReach[p];
      y ||
        (y = this.kneelReach[p] =
          g.localToWorld(this.geo["wristInHand" + p], new L()).sub(x)),
        Lt.subVectors(Ut, x).sub(y);
      const M = 2.5 * e,
        w = Lt.length();
      y.addScaled(Lt, w > M ? M / w : 1),
        Ut.addVectors(x, y),
        this.armIK(p, x, Ut, f, h),
        this.setWorld("shoulder" + p, h.upper, 200, 13, 120),
        this.feedForward("shoulder" + p, h.upper, e),
        Wt.multiplyConjA(h.upper, h.fore),
        this.setRel("elbow" + p, Wt, 110, 5, 95),
        this.palmDown(p, this.fallDir);
    }
  }
  braceArms(t, e, s, n = 1 / 60) {
    const i = this.seg.chest.body,
      a = this.sens,
      r = this.world.groundY;
    (!this.braceLatch || this.modeTime < 0.02) &&
      (this.braceLatch = { L: null, R: null });
    for (const l of Le) {
      if (this.armTask[l] && this.armTask[l].priority > 2) continue;
      const c = l === "L" ? 1 : -1;
      i.localToWorld(this.geo["shoulderAnchor" + l], Lt);
      const h = this.seg["hand" + l].body;
      !this.braceLatch[l] &&
        h.groundContact &&
        (this.braceLatch[l] = h.pos.clone());
      const u = this.braceLatch[l];
      if (u) {
        Ut.copy(u), (Ut.y = r + 0.05), Xt.subVectors(Lt, i.pos), (Xt.y = 0.3);
        const k =
          this._armOut ||
          (this._armOut = { upper: new ae(), fore: new ae(), reach: 0 });
        this.armIK(l, Lt, Ut, Xt, k),
          this.setWorld("shoulder" + l, k.upper, 280, 16, 150),
          Wt.multiplyConjA(k.upper, k.fore),
          this.setRel("elbow" + l, Wt, 150, 9, 115),
          (this.cmd["elbow" + l].gc = 1.6),
          this.palmDown(l, t);
        continue;
      }
      const d = Math.min(a.comVel.y, -0.5),
        f = j((Lt.y - r - 0.15) / -d, 0.05, 0.6),
        p = Lt.x + a.comVel.x * f,
        m = Lt.z + a.comVel.z * f,
        x = t.z,
        g = -t.x,
        b = e < -0.3,
        v = b ? 0.05 : 0.22,
        y = b ? 0.32 : 0.12;
      Ut.set(p + t.x * v + x * c * y, r + 0.04, m + t.z * v + g * c * y);
      const M = j(1 + s * c, 0.4, 1.6);
      Ut.lerp(Lt, j((1 - M) * 0.5, 0, 0.3)),
        Xt.set(-t.x, 0.4, -t.z).addScaled(new L(x, 0, g), c * 0.5),
        this.braceReach || (this.braceReach = { L: null, R: null });
      let w = this.braceReach[l];
      (!w || this.modeTime < 0.02) &&
        (w = this.braceReach[l] =
          this.seg["hand" + l].body
            .localToWorld(this.geo["wristInHand" + l], new L())
            .sub(Lt));
      const S = (this.geo["A1" + l] + this.geo["A2" + l]) * 0.88;
      Pe.subVectors(Ut, Lt),
        Pe.length() > S && Ut.copy(Lt).addScaled(Pe, S / Pe.length()),
        Pe.subVectors(Ut, Lt).sub(w);
      const _ = 2.5 * n,
        A = Pe.length();
      w.addScaled(Pe, A > _ ? _ / A : 1), Ut.addVectors(Lt, w);
      const E =
        this._armOut ||
        (this._armOut = { upper: new ae(), fore: new ae(), reach: 0 });
      this.armIK(l, Lt, Ut, Xt, E),
        this.setWorld("shoulder" + l, E.upper, 200, 13, 120),
        this.feedForward("shoulder" + l, E.upper, n),
        Wt.multiplyConjA(E.upper, E.fore),
        this.setRel("elbow" + l, Wt, 110, 5, 95),
        this.palmDown(l, t);
    }
  }
  palmDown(t, e) {
    const s = Xt.set(0, -1, 0),
      n = Pe.set(e.x, 0, e.z);
    n.lengthSq() < 1e-6 &&
      n.set(Math.sin(this.heading), 0, Math.cos(this.heading)),
      n.normalize();
    const i = new L().crossVectors(s, n);
    ke.setFromBasis(s, n, i),
      as.copy(this.geo["handBasis" + t]).conjugate(),
      ke.multiply(as),
      this.setWorld("wrist" + t, ke, 16, 0.5, 16);
  }
  guScratch() {
    if (!this._gs) {
      const t = () => new L(),
        e = () => new ae();
      this._gs = {
        a: t(),
        b: t(),
        c: t(),
        d: t(),
        e: t(),
        f: t(),
        h: t(),
        k: t(),
        F: t(),
        com: t(),
        tau: t(),
        an: t(),
        ra: t(),
        rb: t(),
        ct: t(),
        la: t(),
        lb: t(),
        q: e(),
        r: e(),
        pelRot: e(),
        chestRot: e(),
        palm: e(),
        arm: { upper: e(), fore: e(), reach: 0 },
        leg: { thigh: e(), shin: e(), reach: 0 },
        pool: [],
        st: {},
        ls: new Map(),
        cw: new Map(),
        load: new Map(),
        loadTotal: 0,
      };
    }
    return this._gs;
  }
  ease(t) {
    return (t = j(t, 0, 1)), t * t * t * (10 - 15 * t + 6 * t * t);
  }
  distributeSupport(t, e, s, n = 0.7) {
    if (!t.length || e.y <= 1) return !1;
    const i = j(e.x / e.y, -0.1, 0.1),
      a = j(e.z / e.y, -0.1, 0.1);
    for (const r of t) {
      const l = r.point.y - s.y;
      (r.dx = r.point.x - s.x - l * i),
        (r.dz = r.point.z - s.z - l * a),
        (r.wa = r.w),
        (r.f = r.hx = r.hz = 0);
    }
    for (let r = 0; r <= t.length; r++) {
      let l = 0,
        c = 0,
        h = 0,
        u = 0,
        d = 0,
        f = 0;
      for (const S of t)
        S.wa <= 0 ||
          ((l += S.wa),
          (c += S.wa * S.dx),
          (h += S.wa * S.dz),
          (u += S.wa * S.dx * S.dx),
          (d += S.wa * S.dx * S.dz),
          (f += S.wa * S.dz * S.dz));
      if (l <= 0) return !1;
      (u += l * 4e-4), (f += l * 4e-4);
      const p = u * f - d * d,
        m = h * d - c * f,
        x = c * d - h * u,
        g = l * p + c * m + h * x;
      if (Math.abs(g) < 1e-14) return !1;
      const b = (e.y * p) / g,
        v = (e.y * m) / g,
        y = (e.y * x) / g;
      let M = null,
        w = 0;
      for (const S of t)
        (S.f = S.wa > 0 ? S.wa * (b + v * S.dx + y * S.dz) : 0),
          S.f < w && ((w = S.f), (M = S));
      if (!M) break;
      M.wa = 0;
    }
    for (const r of t) {
      if (r.f <= 0) {
        r.f = 0;
        continue;
      }
      let l = r.f * i,
        c = r.f * a;
      const h = Math.hypot(l, c),
        u = n * r.f;
      h > u && ((l *= u / h), (c *= u / h)), (r.hx = l), (r.hz = c);
    }
    return !0;
  }
  holdTorques(t, e = 0.95, s = 0.8) {
    const n = this.guScratch(),
      i = this.rd.segList,
      a = n.st,
      r = n.ls,
      l = (u, d, f, p, m) => {
        (u.F.x += f),
          (u.F.y += p),
          (u.F.z += m),
          (u.M.x += d.y * m - d.z * p),
          (u.M.y += d.z * f - d.x * m),
          (u.M.z += d.x * p - d.y * f);
      };
    for (const u of i) {
      const d = a[u.name] || (a[u.name] = { F: new L(), M: new L() });
      d.F.setZero(), d.M.setZero();
      const f = u.fractured ? u.fractured.extra.length : 0;
      for (let p = -1; p < f; p++) {
        const m = p < 0 ? u.body : u.fractured.extra[p];
        l(d, m.pos, 0, -m.mass * ts * e * (1 - (r.get(m) || 0)), 0);
      }
    }
    for (const u of t)
      u.f > 0 && l(a[u.body.userData.segment.name], u.point, u.hx, u.f, u.hz);
    const c = n.tau,
      h = n.an;
    for (let u = i.length - 1; u >= 0; u--) {
      const d = i[u];
      if (!d.parent) continue;
      const f = a[d.name],
        p = d.joint;
      p.worldAnchor(h),
        c.set(
          h.y * f.F.z - h.z * f.F.y - f.M.x,
          h.z * f.F.x - h.x * f.F.z - f.M.y,
          h.x * f.F.y - h.y * f.F.x - f.M.z,
        );
      const m =
          s * p.userData.def.tmax * this.regionStrength(p.name) * this.tone,
        x = c.length();
      x > m && c.scale(m / x), p.child.torque.add(c), p.parent.torque.sub(c);
      const g = a[d.parent.name];
      g.F.add(f.F), g.M.add(f.M);
    }
  }
  applySupport(t, e, s = {}) {
    const n = this.guScratch(),
      i = this.sens,
      a = n.ls,
      r = s.gScale ?? 0.95,
      l = n.com.setZero();
    let c = 0;
    for (const p of this.rd.allBodies()) {
      let m = !1;
      for (const b of t) b.body === p && (m = !0);
      const x = Qs(a.get(p) ?? 0, p.groundContact && !m ? 1 : 0, e * 10);
      a.set(p, x);
      const g = p.mass * (1 - x);
      l.addScaled(p.pos, g), (c += g);
    }
    c > 1e-6 && l.scale(1 / c);
    let h = 0;
    for (const p of t) h += p.w;
    const u = j(h / 0.6, 0, 1),
      d = n.F.set(0, (c * ts * r + (s.lift || 0)) * u, 0);
    if (s.comTarget) {
      const p = s.kp ?? 500,
        m = s.kd ?? 260,
        x = (s.fmax ?? 0.12) * this.rd.totalMass * ts;
      (d.x = j((s.comTarget.x - i.com.x) * p - i.comVel.x * m, -x, x) * u),
        (d.z = j((s.comTarget.z - i.com.z) * p - i.comVel.z * m, -x, x) * u);
    }
    if (!this.distributeSupport(t, d, l))
      for (const p of t) p.f = p.hx = p.hz = 0;
    if (s.extra) for (const p of s.extra) t.push(p);
    this.holdTorques(t, r, s.cap ?? 0.8),
      s.extra && (t.length -= s.extra.length),
      n.load.clear();
    let f = 0;
    for (const p of t)
      n.load.set(p.body, (n.load.get(p.body) || 0) + p.f), (f += p.f);
    n.loadTotal = f;
  }
  comFeedback(t, e, s = 0.8, n = 0.08) {
    const i = this.sens;
    let a = (e.x - i.com.x) * s - i.comVel.x * 0.25,
      r = (e.z - i.com.z) * s - i.comVel.z * 0.25;
    const l = Math.hypot(a, r);
    return l > n && ((a *= n / l), (r *= n / l)), (t.x += a), (t.z += r), t;
  }
  supportPointOf(t, e) {
    const s = t.groundContactUsed;
    if (s > 0) {
      e.setZero();
      for (let n = 0; n < s; n++) e.add(t.groundContactPoints[n]);
      e.scale(1 / s);
    } else e.copy(t.pos);
    return (e.y = this.world.groundY), e;
  }
  addCand(t, e, s, n = null) {
    if (s <= 0.005) return null;
    const i = this.guScratch();
    let a = i.pool[t.length];
    a ||
      i.pool.push(
        (a = { body: null, point: new L(), w: 0, f: 0, hx: 0, hz: 0 }),
      ),
      (a.body = e);
    const r = i.cw.get(e),
      l = r && r.frame >= this.frameNo - 1 ? r.w : 0;
    let c = e.groundContact;
    !c &&
      l > 0.05 &&
      (e.computeAABB(0, 0), (c = e.aabbMin.y < this.world.groundY + 0.02));
    const u = l + ((c ? s : 0) - l) * Math.min(1, this.dtLast / 0.1);
    if ((i.cw.set(e, { w: u, frame: this.frameNo }), u < 0.02)) return null;
    a.w = u;
    const d = e.groundContactUsed;
    if (d > 0) {
      a.point.setZero();
      for (let f = 0; f < d; f++) a.point.add(e.groundContactPoints[f]);
      a.point.scale(1 / d);
    } else a.point.copy(n || e.pos);
    return (
      (a.point.y = this.world.groundY), (a.f = a.hx = a.hz = 0), t.push(a), a
    );
  }
  setUpperGC(t) {
    for (const e of [
      "lumbar",
      "thoracic",
      "neckBase",
      "neckTop",
      "shoulderL",
      "elbowL",
      "wristL",
      "shoulderR",
      "elbowR",
      "wristR",
    ])
      this.cmd[e].gc = t;
  }
  trunkRot(t, e, s, n) {
    return to(t, n), n.multiply(as.setFromEuler(e, 0, s, "XYZ"));
  }
  pitchOf(t, e) {
    const s = t.localDirToWorld(mi, this.guScratch().k);
    return Math.atan2(s.x * Math.sin(e) + s.z * Math.cos(e), s.y);
  }
  trunkPose(t, e, s, n = 0, i = 0) {
    const a = this.guScratch();
    a.q.multiplyConjA(t, e),
      a.r.identity().slerp(a.q, 0.5),
      this.setRel("lumbar", a.r),
      this.gains("lumbar", s),
      this.setRel("thoracic", a.r),
      this.gains("thoracic", s),
      this.setRel(
        "neckBase",
        Wt.setFromEuler(n * 0.5 - 0.02 * this.breath, i * 0.4, 0, "XYZ"),
      ),
      this.gains("neckBase", 0.8 * s),
      this.setRel("neckTop", Wt.setFromEuler(n * 0.5, i * 0.6, 0, "XYZ")),
      this.gains("neckTop", 0.8 * s);
  }
  palmRot(t, e, s, n) {
    const i = this.guScratch(),
      a = i.h.copy(s).addScaled(e, -s.dot(e)).normalize(),
      r = i.k.crossVectors(e, a);
    return (
      n.setFromBasis(e, a, r),
      n.multiply(as.copy(this.geo["handBasis" + t]).conjugate())
    );
  }
  floorPalm(t, e, s) {
    const n = t === "L" ? 1 : -1,
      i = e + 0.35 * n;
    return this.palmRot(
      t,
      Pe.set(0, -1, 0),
      this.guScratch().e.set(Math.sin(i), 0, Math.cos(i)),
      s,
    );
  }
  propArm(t, e, s, n, i, a = 1, r = null) {
    const l = this.guScratch(),
      c = t === "L" ? 1 : -1,
      h = this.seg.chest.body.localToWorld(this.geo["shoulderAnchor" + t], l.a);
    if (s !== null) {
      const p = l.ra.subVectors(h, e),
        m = Math.max(p.length(), 1e-6);
      h.copy(e).addScaled(p, j(s, 0.2, 0.55) / m);
    }
    r && h.add(r);
    const u = Math.sin(i),
      d = Math.cos(i),
      f = l.b.set(-0.5 * u + d * c, 0.35, -0.5 * d - u * c);
    this.armIK(t, h, e, f, l.arm),
      l.q.multiplyConjA(n, l.arm.upper),
      this.setRel("shoulder" + t, l.q, 220 * a, 13 * a, 95),
      l.q.multiplyConjA(l.arm.upper, l.arm.fore),
      this.setRel("elbow" + t, l.q, 130 * a, 6 * a, 70),
      this.setWorld("wrist" + t, this.floorPalm(t, i, l.palm), 14, 0.5, 16);
  }
  reachArm(t, e, s, n = 1, i = null) {
    const a = this.guScratch(),
      r = this.seg.chest.body.localToWorld(this.geo["shoulderAnchor" + t], a.a),
      l = a.ra.subVectors(e, r),
      c = l.length();
    c < 0.19 && (e = a.rb.copy(r).addScaled(l, 0.19 / Math.max(c, 1e-6))),
      this.armIK(t, r, e, s, a.arm),
      this.setWorld("shoulder" + t, a.arm.upper, 170 * n, 11 * n, 90),
      a.q.multiplyConjA(a.arm.upper, a.arm.fore),
      this.setRel("elbow" + t, a.q, 80 * n, 3.5 * n, 60),
      i
        ? this.setWorld("wrist" + t, i, 12, 0.4, 14)
        : this.setRel("wrist" + t, ke.identity(), 10, 0.3, 12);
  }
  relaxArm(t, e = 1) {
    const s = t === "L" ? 1 : -1;
    this.setRel(
      "shoulder" + t,
      Wt.setFromEuler(-0.1, 0, -0.1 * s, "XYZ"),
      55 * e,
      5 * e,
      60,
    );
    const n =
      t === "L"
        ? rn.upperArmDirL
        : Pe.set(-rn.upperArmDirL.x, rn.upperArmDirL.y, rn.upperArmDirL.z);
    this.setRel(
      "elbow" + t,
      ke.setFromAxisAngle(Xt.crossVectors(Yn, n).normalize(), -0.28),
      28 * e,
      1.4 * e,
      40,
    ),
      this.setRel("wrist" + t, as.identity(), 8 * e, 0.25 * e, 10);
  }
  guardArm(t, e = 1) {
    const s = t === "L" ? 1 : -1;
    this.setRel(
      "shoulder" + t,
      Wt.setFromEuler(-0.35, 0.25 * s, -0.18 * s, "XYZ"),
      60 * e,
      5,
      40,
    );
    const n =
        t === "L"
          ? rn.upperArmDirL
          : Pe.set(-rn.upperArmDirL.x, rn.upperArmDirL.y, rn.upperArmDirL.z),
      i = Xt.crossVectors(Yn, n).normalize();
    this.setRel("elbow" + t, ke.setFromAxisAngle(i, -1.6), 40 * e, 2.5, 35),
      this.setRel("wrist" + t, as.identity(), 6, 0.2, 8);
  }
  kneeFloor(t, e) {
    return (
      this.jt["knee" + t].worldAnchor(e), (e.y = this.world.groundY + 0.065), e
    );
  }
  kneelLegTo(t, e, s, n, i, a = 1, r = 0.6) {
    const l = this.guScratch(),
      c = this.geo,
      h = Math.sin(i),
      u = Math.cos(i),
      d = r < 0 ? 0.34 : 0.27,
      f = l.d.set(u, 0, -h),
      p = l.c.subVectors(n, e);
    p.lengthSq() < 1e-6 && p.set(0, -1, 0),
      p.normalize(),
      ll(c["thighDir" + t], c["legAxis" + t], p, f, l.leg.thigh);
    const m = l.c.set(-h * Math.cos(d), Math.sin(d), -u * Math.cos(d));
    ll(c["shinDir" + t], c["legAxis" + t], m, f, l.leg.shin),
      l.q.multiplyConjA(s, l.leg.thigh),
      this.setRel("hip" + t, l.q),
      this.gains("hip" + t, a),
      l.q.multiplyConjA(l.leg.thigh, l.leg.shin),
      this.setRel("knee" + t, l.q),
      this.gains("knee" + t, a),
      this.setRel("ankle" + t, ke.setFromAxisAngle(Ke, r)),
      this.gains("ankle" + t, 0.35 * a);
  }
  standLegTo(t, e, s, n, i, a = 1, r = null, l = 0) {
    const c = this.guScratch();
    this.legIK(t, e, n, c.d.set(Math.sin(i), -l, Math.cos(i)), c.leg),
      c.q.multiplyConjA(s, c.leg.thigh),
      this.setRel("hip" + t, c.q),
      this.gains("hip" + t, a),
      c.q.multiplyConjA(c.leg.thigh, c.leg.shin),
      this.setRel("knee" + t, c.q),
      this.gains("knee" + t, a),
      r !== null
        ? this.setRel("ankle" + t, ke.setFromAxisAngle(Ke, r))
        : (to(this.footYaw(t), ke),
          c.q.multiplyConjA(c.leg.shin, ke),
          this.setRel("ankle" + t, c.q)),
      this.gains("ankle" + t, a);
  }
  swingLegTo(t, e, s, n = 0.9, i = 220, a = 0) {
    const r = this.guScratch(),
      l = this.seg.pelvis.body.localToWorld(this.geo["hipAnchor" + t], r.a),
      c = this.footSpring[t];
    (c.enabled = !0),
      c.offset.subVectors(e, l),
      (c.maxForce = i * this.legStrength[t] * this.tone),
      this.legIK(t, l, e, r.d.set(Math.sin(s), 0.1 - a, Math.cos(s)), r.leg),
      this.setWorld("hip" + t, r.leg.thigh),
      this.gains("hip" + t, n),
      r.q.multiplyConjA(r.leg.thigh, r.leg.shin),
      this.setRel("knee" + t, r.q),
      this.gains("knee" + t, n),
      to(s, ke),
      r.q.multiplyConjA(r.leg.shin, ke),
      this.setRel("ankle" + t, r.q),
      this.gains("ankle" + t, 0.5 * n);
  }
  assistBody(t, e, s, n, i, a, r, l) {
    const c = this.assistGain;
    if (!(c <= 0)) {
      if (e !== null) {
        const h = j((e - t.pos.y) * n - t.vel.y * i, -a * 0.3, a) * c;
        (t.force.y += h), this.guLog && h > 0 && (this.guLog.liftNow += h);
      }
      if (s) {
        Wt.multiplyConjB(s, t.rot).toRotVec(Lt),
          Lt.scale(r),
          Lt.addScaled(t.angVel, -r * 0.12);
        const h = Lt.length();
        h > l && Lt.scale(l / h), t.torque.addScaled(Lt, c);
      }
    }
  }
  resetGetUp() {
    (this.gu = null),
      (this.groundState = null),
      (this.getUpFails = 0),
      (this.lastGetUpFail = void 0),
      (this.restTime = 0),
      (this.wokeAt = void 0),
      this.cmd && this.setUpperGC(1);
  }
  daze() {
    return this.wokeAt === void 0
      ? 0
      : Math.exp(-(this.time - this.wokeAt) / 15);
  }
  armBroken(t) {
    return !!(
      this.seg["upperArm" + t].fractured || this.seg["forearm" + t].fractured
    );
  }
  ableToGetUp(t = !1) {
    const e = t ? 0.7 : 1;
    return (
      Math.min(this.legStrength.L, this.legStrength.R) > 0.5 * e &&
      this.legStrength.L + this.legStrength.R > 1 + (t ? 0.02 : 0.1) &&
      Math.max(
        ...Le.map((s) => (this.armBroken(s) ? 0 : this.armStrength[s])),
      ) >
        0.3 * e &&
      this.spineStrength > 0.45 * e &&
      this.balanceSkill > 0.4 * e &&
      this.pain < (t ? 0.97 : 0.88)
    );
  }
  wantsToGetUp(t) {
    if (!this.autoGetUp || this.assistGain < 0.25) return !1;
    const e = this.sens.comVel.length() < 0.35;
    this.restTime = e
      ? (this.restTime || 0) + t
      : Math.max(0, (this.restTime || 0) - 2 * t);
    const s =
      1.4 +
      4 * ee(0.3, 0.9, this.pain) +
      7 * this.daze() +
      1.5 * Math.min(this.getUpFails || 0, 4);
    return (
      this.restTime > s &&
      this.ableToGetUp() &&
      this.time - (this.lastGetUpFail ?? -100) > 3
    );
  }
  failGetUp(t = "") {
    const e = this.sens;
    (this.lastGetUpFail = this.time),
      (this.getUpFails = (this.getUpFails || 0) + 1),
      (this.restTime = 0),
      this.events.push({
        type: "getupFail",
        phase: this.gu ? this.gu.phase : null,
        reason: t,
        time: this.time,
      }),
      this.setUpperGC(1),
      e.com.y - this.world.groundY > 0.42
        ? (this.fallDir.set(e.comVel.x, 0, e.comVel.z),
          this.fallDir.lengthSq() < 0.01 &&
            (Lt.set(0, 1, 0).applyQuat(this.seg.chest.body.rot),
            this.fallDir.set(Lt.x, 0, Lt.z)),
          this.fallDir.lengthSq() < 1e-6 &&
            this.fallDir.set(Math.sin(this.heading), 0, Math.cos(this.heading)),
          this.fallDir.normalize(),
          this.setMode("falling"))
        : this.setMode("ground");
  }
  getUpToppling() {
    const t = this.gu,
      e = this.sens;
    if (
      !t ||
      t.t < 0.2 ||
      !t.start ||
      !/^(kneel|lunge|rise|stepup)$/.test(t.phase) ||
      e.com.y - this.world.groundY < 0.4
    )
      return !1;
    if (e.comVel.y < -0.8 || Math.hypot(e.comVel.x, e.comVel.z) > 1.1)
      return !0;
    if (t.phase === "kneel" && (t.start.q || 0) < 0.9) return !1;
    const s = this.seg.chest.body,
      n = t.phase === "rise" ? 0.45 : 0.15,
      i = Ut.crossVectors(Lt.set(0, 1, 0).applyQuat(s.rot), mi),
      a = i.length(),
      r = a > 1e-4 ? -s.angVel.dot(i) / a : 0;
    return e.chestTilt > n + 0.6 || (e.chestTilt > n + 0.35 && r > 1.5);
  }
  getUpPace() {
    const t = Math.min(this.legStrength.L, this.legStrength.R);
    return j(
      1 - 0.45 * (1 - this.balanceSkill) - 0.4 * (1 - t) - 0.35 * this.daze(),
      0.4,
      1,
    ) * (this.getUpSpeed ?? 1);
  }
  beginGetUp() {
    const t = this.seg.chest.body,
      e = this.seg.pelvis.body,
      s = t.localDirToWorld(Yn, new L()),
      n = t.localDirToWorld(Ke, new L()),
      i = new L().subVectors(t.pos, e.pos);
    (i.y = 0),
      i.lengthSq() < 1e-4 &&
        i.set(Math.sin(this.heading), 0, Math.cos(this.heading)),
      i.normalize();
    let a =
      s.y < -0.5 ? "prone" : s.y > 0.5 ? "supine" : n.y > 0 ? "sideR" : "sideL";
    const r = {
        L: this.armStrength.L > 0.3 && !this.armBroken("L"),
        R: this.armStrength.R > 0.3 && !this.armBroken("R"),
      },
      l = this.world.groundY,
      c = this.seg,
      h =
        (c.thighL.body.groundContact || c.shinL.body.groundContact) &&
        (c.thighR.body.groundContact || c.shinR.body.groundContact);
    let u = a === "prone" ? "flat" : "roll";
    h &&
      e.pos.y - l > 0.33 &&
      t.pos.y - l > 0.3 &&
      ((a = "kneeling"),
      (u = this.sens.chestTilt < 0.7 ? "kneel" : "quad"),
      Lt.set(
        0.5 * (c.thighL.body.pos.x + c.thighR.body.pos.x),
        0,
        0.5 * (c.thighL.body.pos.z + c.thighR.body.pos.z),
      ),
      i.set(t.pos.x - Lt.x, 0, t.pos.z - Lt.z),
      i.lengthSq() < 1e-4 &&
        i.set(Math.sin(this.heading), 0, Math.cos(this.heading)),
      i.normalize());
    const d = {
      kind: a,
      phase: u,
      t: 0,
      T: 0,
      pt: 0,
      psi: Math.atan2(i.x, i.z),
      start: null,
      useArm: r,
      hand: { L: null, R: null },
      pace: this.getUpPace(),
      cands: [],
      rollTo: "L",
      front: "R",
    };
    if (u === "quad") {
      for (const p of Le)
        if (r[p])
          if (c["hand" + p].body.groundContact) {
            const m = this.jt["wrist" + p].worldAnchor(new L());
            (m.y = Math.min(m.y, l + 0.06)),
              (d.hand[p] = { planted: !0, at: m });
          } else this.planHand(d, p, r.L !== r.R, !0);
    }
    a === "sideL"
      ? (d.rollTo = "L")
      : a === "sideR"
        ? (d.rollTo = "R")
        : r.L !== r.R
          ? (d.rollTo = r.L ? "L" : "R")
          : (d.rollTo =
              n.y > 0.08 ? "R" : n.y < -0.08 || this.rng() < 0.5 ? "L" : "R");
    const f = this.legStrength.L - this.legStrength.R;
    return (
      (d.front =
        f > 0.05 ? "L" : f < -0.05 ? "R" : this.rng() < 0.5 ? "L" : "R"),
      this.events.push({
        type: "getup",
        phase: d.phase,
        kind: a,
        time: this.time,
      }),
      d
    );
  }
  getUpPhase(t, e) {
    (t.phase = e),
      (t.t = 0),
      (t.start = null),
      this.events.push({ type: "getup", phase: e, time: this.time });
  }
  doGetUp(t) {
    (this.assist = 0), this.gu || (this.gu = this.beginGetUp());
    const e = this.gu;
    (e.pace = Qs(e.pace, this.getUpPace(), t * 0.5)),
      (e.t += t * e.pace),
      (e.T += t);
    for (const n of Le) {
      if (!e.useArm[n]) continue;
      const i = this.armBroken(n);
      (e.weakT = e.weakT || { L: 0, R: 0 }),
        (e.weakT[n] = this.armStrength[n] < 0.3 ? e.weakT[n] + t : 0),
        (i || e.weakT[n] > 0.35) &&
          ((e.useArm[n] = !1),
          (e.hand[n] = null),
          e.start && e.start.moving === n && (e.start.moving = null));
    }
    if (!e.useArm.L && !e.useArm.R && /^(flat|push|quad)$/.test(e.phase)) {
      this.failGetUp("no usable arm");
      return;
    }
    if ((e.phase === "push" || e.phase === "quad") && e.t > 0.25) {
      const n = this.seg.chest.body.localDirToWorld(Yn, Lt).y;
      if (
        ((e.sideT = n > -0.2 ? (e.sideT || 0) + t : 0),
        n > 0.25 || e.sideT > 0.4)
      ) {
        if (
          ((this.guReplans = (this.guReplans || 0) + 1), this.guReplans > 2)
        ) {
          this.failGetUp("rolled over");
          return;
        }
        this.events.push({
          type: "getupReplan",
          phase: e.phase,
          time: this.time,
        }),
          (this.gu = this.beginGetUp());
        return;
      }
    }
    switch (
      ((e.dt = t),
      (this.frameNo = (this.frameNo || 0) + 1),
      (this.dtLast = t),
      (this.heading = e.psi),
      (this.wounds = []),
      this.setUpperGC(0),
      this.guLog || (this.guLog = { liftNow: 0 }),
      (this.guLog.liftNow = 0),
      (e.cands.length = 0),
      (e.support = { comTarget: null, lift: 0 }),
      e.phase)
    ) {
      case "roll":
        this.guRoll(e, t);
        break;
      case "flat":
        this.guFlat(e, t);
        break;
      case "push":
        this.guPush(e, t);
        break;
      case "quad":
        this.guQuad(e, t);
        break;
      case "kneel":
        this.guKneel(e, t);
        break;
      case "lunge":
        this.guLunge(e, t);
        break;
      case "rise":
        this.guRise(e, t);
        break;
      case "stepup":
        this.guStepUp(e, t);
        break;
    }
    if (this.mode !== "getup") return;
    const s = Ht(0.2, 1, this.ease(e.T / 0.45));
    if (s < 1) for (const n of this.rd.jointList) this.cmd[n.name].act = s;
    (e.support.cap = 0.8 * s), this.applySupport(e.cands, t, e.support);
  }
  guRoll(t, e) {
    const s = this.guScratch(),
      n = this.seg.chest.body,
      i = this.seg.pelvis.body,
      a = t.rollTo,
      r = a === "L" ? "R" : "L",
      l = a === "L" ? 1 : -1,
      c = l,
      h = -l,
      u = n.localDirToWorld(Yn, s.e);
    t.start || (t.start = { front: u.y, still: 0 });
    const d = t.t,
      f = j((1 - u.y) / 1.6, 0, 1),
      p = this.ease(d / 0.35);
    this.setRel(
      "thoracic",
      Wt.setFromEuler(0.12 * p, 0.45 * l * p * (1 - f), 0, "XYZ"),
    ),
      this.gains("thoracic", 0.8),
      this.setRel(
        "lumbar",
        Wt.setFromEuler(0.1 * p, 0.18 * l * p * (1 - f), 0, "XYZ"),
      ),
      this.gains("lumbar", 0.8),
      this.setRel("neckBase", Wt.setFromEuler(0.2 * p, 0.35 * l * p, 0, "XYZ")),
      this.gains("neckBase", 0.6),
      this.setRel("neckTop", Wt.setFromEuler(0.1 * p, 0.45 * l * p, 0, "XYZ")),
      this.gains("neckTop", 0.6);
    let m = !0;
    if (t.useArm[a]) {
      this.setRel(
        "shoulder" + a,
        Wt.setFromEuler(-3 * p, 0, 0.15 * c, "XYZ"),
        90,
        6,
        70,
      ),
        this.setRel("elbow" + a, ke.identity(), 25, 2, 30),
        this.setRel("wrist" + a, as.identity(), 6, 0.2, 8);
      const S = n.localDirToWorld(mi, s.k),
        _ = this.jt["wrist" + a].worldAnchor(s.a),
        A = n.localToWorld(this.geo["shoulderAnchor" + a], s.b);
      s.c.subVectors(_, A), (m = s.c.dot(S) > 0.3 && s.c.dot(u) < 0.25);
    } else this.guardArm(a);
    if (t.useArm[r]) {
      const S = n.localDirToWorld(Ke, s.c).scale(c),
        _ = s.d
          .copy(n.pos)
          .addScaled(u, 0.28)
          .addScaled(S, 0.22)
          .addScaled(n.localDirToWorld(mi, s.k), 0.12);
      (_.y = Math.max(this.world.groundY + 0.12, _.y)),
        this.reachArm(
          r,
          _,
          s.f.copy(u).addScaled(S, -0.8),
          (0.8 * p + 0.2) * (1 - 0.6 * ee(0.42, 0.62, f)),
        );
    } else this.guardArm(r);
    const x = this.ease((d - 0.3) / 0.5),
      g = ee(0.42, 0.6, f);
    if (g > 0)
      this.setRel("hip" + r, Wt.setFromEuler(-0.3, 0, -h * 0.1, "XYZ")),
        this.gains("hip" + r, 0.7 * g + 0.2),
        this.setRel("knee" + r, Wt.setFromAxisAngle(Ke, 0.3)),
        this.gains("knee" + r, 0.7 * g + 0.2),
        this.setRel("ankle" + r, Wt.setFromAxisAngle(Ke, 0.5)),
        this.gains("ankle" + r, 0.3);
    else {
      const S = i.localToWorld(this.geo["hipAnchor" + r], s.a).clone(),
        _ = s.b.subVectors(i.pos, n.pos);
      (_.y = 0), _.normalize();
      const A = n.localDirToWorld(Ke, s.c).scale(c);
      A.y = 0;
      const E = this.ease(d / 0.35),
        k = s.k
          .copy(S)
          .addScaled(_, Ht(0.75, 0.32, E))
          .addScaled(A, 0.06 * x);
      k.y = this.world.groundY + 0.09;
      const T = s.f.set(A.x * 0.8 * x, 1, A.z * 0.8 * x);
      this.legIK(r, S, k, T, s.leg),
        this.setWorld("hip" + r, s.leg.thigh),
        this.gains("hip" + r, 0.8),
        s.q.multiplyConjA(s.leg.thigh, s.leg.shin),
        this.setRel("knee" + r, s.q),
        this.gains("knee" + r, 0.8),
        this.setRel("ankle" + r, Wt.identity()),
        this.gains("ankle" + r, 0.3);
    }
    const b = this.seg["foot" + r].body;
    if (b.groundContact && x > 0 && f < 0.45) {
      const S =
        s.rollPush ||
        (s.rollPush = { body: b, point: new L(), f: 0, hx: 0, hz: 0 });
      (S.body = b),
        this.supportPointOf(b, S.point),
        (S.f = 0.35 * this.rd.totalMass * ts * x * this.legStrength[r]),
        (t.support.extra = [S]);
    }
    this.setRel("hip" + a, Wt.setFromEuler(-0.15, 0, 0.1 * c, "XYZ")),
      this.gains("hip" + a, 0.35),
      this.setRel("knee" + a, Wt.setFromAxisAngle(Ke, 0.25)),
      this.gains("knee" + a, 0.35),
      this.setRel("ankle" + a, Wt.identity()),
      this.gains("ankle" + a, 0.25);
    const v = s.h.subVectors(n.pos, i.pos).normalize(),
      y = 0.5 * (n.angVel.dot(v) + i.angVel.dot(v)) * l;
    (m || d > 1.5) && (t.start.go = !0);
    const M = t.start.go ? 2.3 * t.pace * p : 0,
      w = j(25 * (M - y), -30, 45) * this.assistGain;
    n.torque.addScaled(v, w * l * 0.6),
      i.torque.addScaled(v, w * l * 0.4),
      (t.start.still = Math.abs(y) < 0.3 ? t.start.still + e : 0),
      u.y < -0.55 || (u.y < -0.3 && t.start.still > 0.3)
        ? ((t.psi = Math.atan2(v.x, v.z)), this.getUpPhase(t, "flat"))
        : d > 3 && this.failGetUp("roll");
  }
  guFlat(t, e) {
    const s = this.guScratch(),
      n = this.seg.chest.body,
      i = this.seg.pelvis.body;
    t.start || (t.start = { arm: {} });
    const a = s.k.subVectors(n.pos, i.pos);
    t.psi = Math.atan2(a.x, a.z);
    const r = Math.sin(t.psi),
      l = Math.cos(t.psi),
      c = this.trunkRot(t.psi, Math.PI / 2, 0, s.pelRot);
    this.trunkPose(c, c, 0.6, -0.2, 0);
    for (const T of Le)
      this.setRel("hip" + T, Wt.identity()),
        this.gains("hip" + T, 0.6),
        this.setRel("knee" + T, Wt.setFromAxisAngle(Ke, 0.15)),
        this.gains("knee" + T, 0.35),
        this.setRel("ankle" + T, Wt.setFromAxisAngle(Ke, 0.4)),
        this.gains("ankle" + T, 0.25);
    const h = t.start.arm,
      u = {};
    for (const T of Le) {
      const D = T === "L" ? 1 : -1,
        C = this.jt["wrist" + T].worldAnchor(s.e),
        P = n.localToWorld(this.geo["shoulderAnchor" + T], s.f);
      (u[T] = {
        ahead: (C.x - P.x) * r + (C.z - P.z) * l,
        lat: ((C.x - n.pos.x) * l - (C.z - n.pos.z) * r) * D,
      }),
        t.useArm[T]
          ? (h[T] !== "side" || u[T].ahead > 0.15) &&
            ((h[T] =
              u[T].ahead > 0.05
                ? "out"
                : u[T].lat < 0.05 || (h[T] === "trapped" && u[T].lat < 0.12)
                  ? "trapped"
                  : "side"),
            h[T] === "out" && u[T].lat > 0.22 && (h[T] = "side"))
          : (h[T] = "guard");
    }
    let d = !0,
      f = !0;
    for (const T of Le) {
      const D =
        this.seg["hand" + T].body.groundContact &&
        u[T].lat > 0.16 &&
        u[T].lat < 0.36 &&
        u[T].ahead > -0.1 &&
        u[T].ahead < 0.3;
      t.useArm[T] && !D && (f = !1);
    }
    t.useArm.L !== t.useArm.R && (f = !1);
    const p = n.pos.y - this.world.groundY;
    !f && p > 0.2
      ? (t.start.letDown = !0)
      : p < 0.165 && (t.start.letDown = !1);
    for (const T of Le) {
      const D = T === "L" ? 1 : -1;
      if (h[T] === "guard") {
        this.guardArm(T);
        continue;
      }
      const C = t.start.letDown ? 0.2 : 1;
      h[T] === "out"
        ? this.setRel(
            "shoulder" + T,
            Wt.setFromEuler(-0.2, 0, 1.45 * D, "XYZ"),
            140 * C,
            10 * C,
            90,
          )
        : this.setRel(
            "shoulder" + T,
            Wt.setFromEuler(
              0.1,
              0,
              (h[T] === "trapped" ? 0.35 : 0.12) * D,
              "XYZ",
            ),
            140 * C,
            10 * C,
            90,
          ),
        this.setRel("elbow" + T, ke.identity(), 50 * C * C, 3 * C, 50),
        this.setRel("wrist" + T, as.identity(), 6, 0.2, 8),
        (u[T].lat < 0.12 || h[T] === "trapped") && (d = !1);
    }
    const m = this.levelTrunk(
        e,
        h.L === "trapped" && h.R !== "trapped"
          ? 0.45
          : h.R === "trapped" && h.L !== "trapped"
            ? -0.45
            : 0,
      ),
      x = this.jt.kneeL.worldAnchor(s.a),
      g = this.jt.kneeR.worldAnchor(s.b),
      b = l,
      v = -r,
      y = this.ankleWorld("L", s.c),
      M = this.ankleWorld("R", s.d),
      w = (T, D) =>
        Math.abs(
          (0.5 * (T.x + D.x) - i.pos.x) * b + (0.5 * (T.z + D.z) - i.pos.z) * v,
        ),
      S =
        w(x, g) < 0.1 &&
        w(y, M) < 0.15 &&
        (x.x - g.x) * b + (x.z - g.z) * v > 0.1,
      _ = n.localDirToWorld(Yn, s.d).y,
      A = Math.abs(n.localDirToWorld(Ke, s.d).y),
      E = _ < -0.55 && A < 0.45;
    if (
      t.t > 0.3 &&
      Math.abs(m) < 0.4 &&
      ((_ < -0.8 && d && (S || t.t > 1)) ||
        (E && f && t.t > 0.4) ||
        (E && t.t > 2))
    ) {
      for (const T of Le) {
        if (((t.hand[T] = null), !f || !t.useArm[T])) continue;
        const D = this.jt["wrist" + T].worldAnchor(new L());
        (D.y = Math.min(D.y, this.world.groundY + 0.06)),
          (t.hand[T] = { planted: !0, at: D });
      }
      this.getUpPhase(t, "push");
    } else t.t > 3 && this.failGetUp("flat");
  }
  levelTrunk(t, e) {
    const s = this.guScratch(),
      n = this.seg.chest.body,
      i = this.seg.pelvis.body,
      a = s.la.subVectors(n.pos, i.pos).normalize(),
      r = 0.5 * (n.angVel.dot(a) + i.angVel.dot(a)),
      l = n.localDirToWorld(Ke, s.lb).y,
      c = j(-30 * r - F4 * (l - e), -xx, xx) * this.assistGain;
    return n.torque.addScaled(a, c * 0.6), i.torque.addScaled(a, c * 0.4), r;
  }
  rollFix(t, e) {
    const s = this.guScratch(),
      n = this.seg.chest.body,
      i = this.seg.pelvis.body,
      a = s.la.subVectors(n.pos, i.pos).normalize(),
      r = 0.5 * (n.angVel.dot(a) + i.angVel.dot(a)),
      l = n.localDirToWorld(Ke, s.lb).y;
    return (e === "L" ? 1 : -1) * (0.3 * l + 0.06 * r);
  }
  planHand(t, e, s, n = !1) {
    const i = this.seg.chest.body,
      a = e === "L" ? 1 : -1,
      r = Math.sin(t.psi),
      l = Math.cos(t.psi),
      c = l,
      h = -r,
      u = i.localToWorld(this.geo["shoulderAnchor" + e], new L());
    t.phase === "flat" &&
      u.set(
        i.pos.x + r * 0.17 + l * a * 0.18,
        i.pos.y,
        i.pos.z + l * 0.17 - r * a * 0.18,
      );
    const d = n ? (s ? -0.07 : 0.03) : s ? 0.05 : 0.12,
      f = n ? 0.05 : s ? 0.25 : 0.1,
      p = new L(
        u.x + r * f + c * a * d,
        this.world.groundY,
        u.z + l * f + h * a * d,
      ),
      m = t.psi + 0.35 * a,
      x = new L(
        p.x - Math.sin(m) * 0.075,
        this.world.groundY + 0.035,
        p.z - Math.cos(m) * 0.075,
      ),
      g = this.jt["wrist" + e].worldAnchor(new L()),
      b = (A) => Math.atan2(A.x - u.x, A.z - u.z),
      v = (A) => Math.hypot(A.x - u.x, A.z - u.z),
      y = b(g),
      M = Math.atan2(c * a, h * a);
    let w = cn(b(x) - y);
    Math.cos(y + 0.5 * w - M) < -0.2 && (w -= Math.sign(w) * 2 * Math.PI);
    const S = y + w,
      _ = Math.abs(S - y) * 0.3 + Math.abs(v(x) - v(g));
    t.hand[e] = {
      from: g,
      to: x,
      sh: u.clone(),
      a0: y,
      a1: S,
      r0: v(g),
      r1: v(x),
      t: 0,
      dur: j(0.2 + _ * 0.6, 0.25, 0.5),
      planted: !1,
      at: new L(),
    };
  }
  armReach(t) {
    const e = this.seg.chest.body.localToWorld(
      this.geo["shoulderAnchor" + t],
      Pe,
    );
    return this.jt["wrist" + t].worldAnchor(Xt).distanceTo(e);
  }
  handToFloor(t, e, s, n, i, a = 1, r = null) {
    const l = t.hand[e],
      c = this.guScratch();
    if (l.planted) return this.propArm(e, l.at, n, i, t.psi, a, r), !0;
    l.t += s * t.pace;
    const h = l.t / l.dur,
      u = this.ease(h),
      d = Math.sin(Math.PI * j(h, 0, 1)),
      f = Ht(l.a0, l.a1, u),
      p = Math.max(Ht(l.r0, l.r1, u) + 0.06 * d, 0.12),
      m = c.f.set(
        l.sh.x + Math.sin(f) * p,
        Ht(l.from.y, l.to.y, u) + 0.06 * d - Math.max(0, h - 1) * 0.15,
        l.sh.z + Math.cos(f) * p,
      ),
      x = Math.sin(t.psi),
      g = Math.cos(t.psi),
      b = e === "L" ? 1 : -1;
    this.reachArm(
      e,
      m,
      c.b.set(-0.4 * x + g * b, 0.5, -0.4 * g - x * b),
      1,
      this.floorPalm(e, t.psi, c.palm),
    );
    const v = this.seg["hand" + e].body,
      y = this.jt["wrist" + e].worldAnchor(c.c),
      M = this.seg.chest.body.pos,
      w = t.phase !== "flat" || ((y.x - M.x) * g - (y.z - M.z) * x) * b > 0.1;
    return (
      v.groundContact &&
        ((h > 0.6 && Math.hypot(y.x - l.to.x, y.z - l.to.z) < 0.1) ||
          (h > 1.6 && w)) &&
        ((l.planted = !0),
        l.at.copy(y),
        (l.at.y = Math.min(l.at.y, this.world.groundY + 0.06))),
      !1
    );
  }
  guPush(t, e) {
    const s = this.guScratch(),
      n = this.seg.chest.body,
      i = this.seg.pelvis.body,
      a = this.world.groundY,
      r = Math.sin(t.psi),
      l = Math.cos(t.psi),
      c = t.useArm.L !== t.useArm.R;
    if (!t.start) {
      t.start = {
        pel: i.pos.clone(),
        knee: {
          L: this.kneeFloor("L", new L()),
          R: this.kneeFloor("R", new L()),
        },
        planted: -1,
        reach: null,
      };
      for (const E of Le)
        t.useArm[E] &&
          !(t.hand[E] && t.hand[E].planted) &&
          this.planHand(t, E, c);
    }
    const h = t.t;
    let u = !0;
    for (const E of Le) t.useArm[E] && !t.hand[E].planted && (u = !1);
    u &&
      t.start.planted < 0 &&
      ((t.start.planted = h),
      (t.start.reach = { L: this.armReach("L"), R: this.armReach("R") }));
    const d = t.start.planted < 0 ? 1 / 0 : t.start.planted,
      f = this.ease((h - d) / 0.5),
      p = this.ease((h - d - 0.1) / 0.7),
      m = t.start.knee,
      x = this.geo.L1L;
    if (t.start.arc === void 0) {
      const E = 0.5 * (m.L.x + m.R.x),
        k = 0.5 * (m.L.z + m.R.z),
        T = (t.start.pel.x - E) * r + (t.start.pel.z - k) * l;
      t.start.arc = Math.atan2(
        Math.max(t.start.pel.y - a - 0.05, 0.02),
        Math.max(T, 0.05),
      );
    }
    const g = Ht(t.start.arc, 1.3, p),
      b = Math.cos(g),
      v = Math.sin(g),
      y = this.trunkRot(t.psi, Math.PI / 2 - 0.08 * p, 0, s.pelRot),
      M = Math.atan2(n.pos.y - i.pos.y, 0.45),
      w = this.trunkRot(
        t.psi,
        Math.PI / 2 - j(M, -0.2, 0.7) - 0.05,
        0,
        s.chestRot,
      );
    this.trunkPose(y, w, 0.8, -0.45, 0);
    for (const E of Le) {
      if (!t.useArm[E]) {
        this.guardArm(E);
        continue;
      }
      const k = t.hand[E];
      if (k.planted) {
        k.slideFrom || (k.slideFrom = k.at.clone());
        const C = E === "L" ? 1 : -1,
          P = 0.5 * (m.L.x + m.R.x),
          R = 0.5 * (m.L.z + m.R.z),
          z = ((k.slideFrom.x - P) * l - (k.slideFrom.z - R) * r) * C,
          H = P + r * 0.56 + l * C * z,
          N = R + l * 0.56 - r * C * z;
        if ((k.slideFrom.x - H) * r + (k.slideFrom.z - N) * l > 0) {
          const U = this.ease((p - 0.1) / 0.8);
          (k.at.x = Ht(k.slideFrom.x, H, U)),
            (k.at.z = Ht(k.slideFrom.z, N, U));
        }
      }
      const T = t.start.reach ? Ht(t.start.reach[E], 0.54, f) : null,
        D = T === null || c ? T : T + j(-this.rollFix(t, E), -0.08, 0.08);
      this.handToFloor(t, E, e, D, w, 1) &&
        this.addCand(
          t.cands,
          this.seg["hand" + E].body,
          this.armStrength[E] ** 2,
        );
    }
    let S = 0;
    for (const E of Le) {
      const k = s.k
        .set(m[E].x + r * x * b, m[E].y + x * v, m[E].z + l * x * b)
        .clone();
      (S += k.y * 0.5),
        this.kneelLegTo(E, k, y, m[E], t.psi, 0.9, 0.7),
        this.addCand(
          t.cands,
          this.seg["thigh" + E].body,
          this.legStrength[E] ** 2,
        ),
        this.addCand(
          t.cands,
          this.seg["shin" + E].body,
          0.5 * this.legStrength[E] ** 2,
        );
    }
    const _ = this.rd.totalMass * ts;
    this.assistBody(i, S + 0.02, y, 800, 110, 0.08 * _, 80, 40),
      c && this.levelTrunk(e, 0);
    const A = Le.every((E) => {
      const k = i.localToWorld(this.geo["hipAnchor" + E], s.a),
        T = this.jt["knee" + E].worldAnchor(s.b);
      return (k.x - T.x) * r + (k.z - T.z) * l < 0.22;
    });
    p > 0.9 && i.pos.y - a > 0.38 && A
      ? this.getUpPhase(t, "quad")
      : h > 3.2 && this.failGetUp("push");
  }
  insideTripod(t, e, s, n, i = 0) {
    const a = (r, l, c) => {
      const h = l.x - r.x,
        u = l.z - r.z,
        d = Math.hypot(h, u) || 1e-9,
        f = (h * (n.z - r.z) - u * (n.x - r.x)) / d;
      return h * (c.z - r.z) - u * (c.x - r.x) >= 0 ? f : -f;
    };
    return Math.min(a(t, e, s), a(e, s, t), a(s, t, e)) > i;
  }
  kneelBoth(t, e, s, n, i, a = 1) {
    for (const r of Le)
      this.kneelLegTo(r, n(r), s, e[r], t.psi, a, i),
        this.addCand(
          t.cands,
          this.seg["thigh" + r].body,
          this.legStrength[r] ** 2,
        ),
        this.addCand(
          t.cands,
          this.seg["shin" + r].body,
          0.5 * this.legStrength[r] ** 2,
        );
  }
  guQuad(t, e) {
    const s = this.guScratch(),
      n = this.seg.chest.body,
      i = this.seg.pelvis.body,
      a = this.world.groundY,
      r = Math.sin(t.psi),
      l = Math.cos(t.psi),
      c = l,
      h = -r,
      u = t.useArm.L !== t.useArm.R;
    t.start ||
      (t.start = {
        knee: {
          L: this.kneeFloor("L", new L()),
          R: this.kneeFloor("R", new L()),
        },
        moving: null,
        moves: 0,
      });
    const d = t.start.knee,
      f = this.geo.L1L,
      p = this.trunkRot(t.psi, Math.PI / 2 - 0.1, 0, s.pelRot),
      m = Math.atan2(n.pos.y - i.pos.y, 0.45),
      x = this.trunkRot(
        t.psi,
        Math.PI / 2 - j(m, -0.2, 0.6) - 0.05,
        0,
        s.chestRot,
      );
    this.trunkPose(p, x, 0.9, -0.4, 0);
    const g = Math.cos(1.35),
      b = Math.sin(1.35);
    if (!t.start.moving && t.t > 0.1 && !u) {
      let T = null,
        D = 0.5;
      for (const C of Le) {
        const P = t.hand[C];
        if (!t.useArm[C] || !P || !P.planted) continue;
        const R = n.localToWorld(this.geo["shoulderAnchor" + C], s.a),
          z = (P.at.x - R.x) * r + (P.at.z - R.z) * l,
          H = Math.abs((P.at.x - R.x) * c + (P.at.z - R.z) * h),
          N = Math.max(z - 0.05, H - 0.2);
        N > D && ((D = N), (T = C));
      }
      T &&
        t.start.moves < 4 &&
        ((t.start.moving = T), (t.start.shift = 0), t.start.moves++);
    }
    t.start.moving && !t.hand[t.start.moving] && (t.start.moving = null);
    const v = t.start.moving;
    let y = !1;
    if (v)
      if (t.hand[v].planted) {
        t.start.shift += e * t.pace;
        const D = v === "L" ? "R" : "L";
        (((!t.useArm[D] ||
          !t.hand[D] ||
          this.insideTripod(t.hand[D].at, d.L, d.R, this.sens.com, 0.025)) &&
          t.start.shift > 0.3) ||
          t.start.shift > 0.9) &&
          this.planHand(t, v, u, !0);
      } else y = !0;
    const M = s.h.set(0, 0, 0),
      w = s.f.set(0, 0, 0);
    let S = 0,
      _ = 0;
    for (const T of Le) {
      const D = t.hand[T];
      !t.useArm[T] ||
        !D ||
        !D.planted ||
        (M.add(D.at), S++, T !== v && (w.add(D.at), _++));
    }
    M.add(d.L)
      .add(d.R)
      .scale(1 / (S + 2)),
      w
        .add(d.L)
        .add(d.R)
        .scale(1 / (_ + 2));
    const A = v ? ee(0, 0.3, t.start.shift) : 0,
      E = s.c.set((w.x - M.x) * A, 0, (w.z - M.z) * A).clone();
    (t.support.comTarget = s.ct.set(M.x + E.x, a, M.z + E.z)),
      this.kneelBoth(
        t,
        d,
        p,
        (T) =>
          s.k
            .set(
              d[T].x + r * f * g + E.x * 0.8,
              d[T].y + f * b,
              d[T].z + l * f * g + E.z * 0.8,
            )
            .clone(),
        0.7,
      );
    for (const T of Le) {
      if (!t.useArm[T]) {
        this.guardArm(T);
        continue;
      }
      if (this.handToFloor(t, T, e, null, x, 1, T === v ? null : E)) {
        v === T && y && (t.start.moving = null);
        const D = v === T ? ee(0.1, 0.3, t.start.shift) : 0;
        this.addCand(
          t.cands,
          this.seg["hand" + T].body,
          this.armStrength[T] ** 2 * (1 - D),
        );
      }
    }
    const k = this.rd.totalMass * ts;
    this.assistBody(i, d.L.y + f * b + 0.02, p, 800, 110, 0.08 * k, 80, 40),
      !t.start.moving && t.t > 0.3
        ? this.getUpPhase(t, "kneel")
        : t.t > 3 && this.failGetUp("quad");
  }
  guKneel(t, e) {
    const s = this.guScratch(),
      n = this.sens,
      i = this.seg.chest.body,
      a = this.seg.pelvis.body,
      r = this.world.groundY;
    if (!t.start) {
      const T = this.kneeFloor("L", s.a),
        D = this.kneeFloor("R", s.b),
        C = i.localToWorld(this.geo.shoulderAnchorL, s.c),
        P = i.localToWorld(this.geo.shoulderAnchorR, s.d),
        R = 0.5 * (C.x + P.x - T.x - D.x),
        z = 0.5 * (C.z + P.z - T.z - D.z);
      Math.hypot(R, z) > 0.15 && (t.psi = Math.atan2(R, z));
    }
    const l = Math.sin(t.psi),
      c = Math.cos(t.psi);
    t.start ||
      (t.start = {
        pelPitch: this.pitchOf(a, t.psi),
        chestPitch: this.pitchOf(i, t.psi),
        pel: a.pos.clone(),
        knee: {
          L: this.kneeFloor("L", new L()),
          R: this.kneeFloor("R", new L()),
        },
        released: !1,
      });
    const h = t.start.knee,
      u = 0.5 * (h.L.x + h.R.x),
      d = 0.5 * (h.L.z + h.R.z),
      f = t.t,
      p = this.jt.kneeL.worldAnchor(s.a),
      m = this.jt.kneeR.worldAnchor(s.b),
      x = (n.com.x - 0.5 * (p.x + m.x)) * l + (n.com.z - 0.5 * (p.z + m.z)) * c,
      g = this.ease(f / 0.45),
      b = this.ease((f - 0.3) / 0.75) * j(1.5 - 4 * x, 0.2, 1);
    t.start.q = Math.max(t.start.q || 0, b);
    const v = t.start.q,
      y = this.trunkRot(t.psi, Ht(t.start.pelPitch, 0.08, v), 0, s.pelRot),
      M = this.trunkRot(t.psi, Ht(t.start.chestPitch, 0.06, v), 0, s.chestRot);
    this.trunkPose(y, M, 1.05, Ht(-0.4, 0.05, v), 0);
    const w = Ht(
        Ht((t.start.pel.x - u) * l + (t.start.pel.z - d) * c, -0.12, g),
        -0.07,
        v,
      ),
      S = new L(
        u + l * w,
        r + Ht(Ht(t.start.pel.y - r, 0.47, g), 0.53, v),
        d + c * w,
      );
    t.support.comTarget = s.ct.set(u - l * 0.09, r, d - c * 0.09);
    const _ = t.useArm.L !== t.useArm.R ? (t.useArm.L ? "L" : "R") : null,
      A = _ ? t.hand[_] : null;
    if (A && A.planted && !t.start.released) {
      const T = c,
        D = -l,
        C = j((A.at.x - u) * T + (A.at.z - d) * D, -0.3, 0.3) / 3;
      (t.support.comTarget.x += T * C),
        (t.support.comTarget.z += D * C),
        this.levelTrunk(e, 0);
    }
    this.comFeedback(S, t.support.comTarget, 0.5, 0.08),
      this.kneelBoth(
        t,
        h,
        y,
        (T) =>
          s.k
            .copy(this.geo["hipAnchor" + T])
            .applyQuat(y)
            .add(S)
            .clone(),
        Ht(0.7, -0.25, v),
      );
    for (const T of Le)
      this.addCand(
        t.cands,
        this.seg["foot" + T].body,
        (0.2 + 0.3 * v) * this.legStrength[T],
      );
    const E = Le.some(
      (T) =>
        t.useArm[T] &&
        t.hand[T] &&
        t.hand[T].planted &&
        this.seg["hand" + T].body.groundContact,
    );
    (t.start.handsOff = E ? 0 : (t.start.handsOff || 0) + e),
      !t.start.released &&
        ((x < 0.04 && v > 0.25) ||
          v > 0.7 ||
          (v > 0.2 && t.start.handsOff > 0.2)) &&
        (t.start.released = !0);
    for (const T of Le) {
      const D = t.hand[T];
      t.useArm[T]
        ? D && D.planted && !t.start.released
          ? (this.propArm(T, D.at, 0.56, M, t.psi, 1),
            this.addCand(
              t.cands,
              this.seg["hand" + T].body,
              this.armStrength[T] ** 2,
            ))
          : (D && (D.planted = !1), this.relaxArm(T, 0.8))
        : this.guardArm(T);
    }
    const k = this.rd.totalMass * ts;
    this.assistBody(a, S.y, y, 900, 120, 0.1 * k, 110, 55),
      this.assistBody(i, null, M, 0, 0, 0, 110, 55),
      v >= 0.98 && a.pos.y - r > 0.44 && n.chestTilt < 0.5
        ? this.getUpPhase(t, "lunge")
        : t.t > 2.6 && this.failGetUp("kneel");
  }
  guLunge(t, e) {
    const s = this.guScratch(),
      n = this.seg.pelvis.body,
      i = this.seg.chest.body,
      a = this.world.groundY,
      r = t.front,
      l = r === "L" ? "R" : "L",
      c = r === "L" ? 1 : -1,
      h = Math.sin(t.psi),
      u = Math.cos(t.psi),
      d = u,
      f = -h;
    if (!t.start) {
      const R = n.localToWorld(this.geo["hipAnchor" + r], new L()),
        z = this.kneeFloor(l, new L()),
        H = (R.x - z.x) * d + (R.z - z.z) * f,
        N = c * Math.max(0.2, H * c) - H;
      t.start = {
        ank: this.ankleWorld(r, new L()),
        kneeB: z,
        pel: n.pos.clone(),
        target: new L(
          R.x + h * 0.31 + d * N,
          a + 0.085,
          R.z + u * 0.31 + f * N,
        ),
        planted: -1,
      };
    }
    const p = t.t,
      m = this.sens,
      x = this.ease(p / 0.3),
      g = t.start.kneeB,
      b = Math.abs((m.com.x - g.x) * d + (m.com.z - g.z) * f);
    t.start.swing === void 0 &&
      p > 0.2 &&
      (b < 0.045 || p > 0.55) &&
      ((t.start.swing = p), this.ankleWorld(r, t.start.ank));
    const v =
        t.start.swing === void 0 ? 0 : j((p - t.start.swing) / 0.42, 0, 1),
      y = g.x - h * 0.05,
      M = g.z - u * 0.05,
      w = s.f.set(Ht(t.start.pel.x, y, x), a + 0.53, Ht(t.start.pel.z, M, x));
    if (t.start.planted >= 0) {
      const R = ee(0, 0.3, p - t.start.planted) * 0.5,
        z = this.ankleWorld(r, s.a);
      (w.x = Ht(w.x, 0.5 * (g.x + z.x) - h * 0.12, R)),
        (w.z = Ht(w.z, 0.5 * (g.z + z.z) - u * 0.12, R));
    }
    const S = t.start.planted >= 0 ? ee(0, 0.3, p - t.start.planted) : 0,
      _ = this.ankleWorld(r, s.a);
    (t.support.comTarget = s.ct.set(
      Ht(Ht(t.start.pel.x, g.x - h * 0.07, x), 0.5 * (g.x + _.x), S),
      a,
      Ht(Ht(t.start.pel.z, g.z - u * 0.07, x), 0.5 * (g.z + _.z), S),
    )),
      this.comFeedback(w, t.support.comTarget, 0.7, 0.06);
    const A = this.trunkRot(t.psi, 0.06, 0, s.pelRot),
      E = this.trunkRot(t.psi, 0.1, 0, s.chestRot);
    this.trunkPose(A, E, 1.1, 0.1, 0);
    const k = s.k
      .copy(this.geo["hipAnchor" + l])
      .applyQuat(A)
      .add(w)
      .clone();
    this.kneelLegTo(l, k, A, g, t.psi, 1.3, -0.25),
      this.addCand(t.cands, this.seg["thigh" + l].body, 1),
      this.addCand(t.cands, this.seg["shin" + l].body, 0.5),
      this.addCand(t.cands, this.seg["foot" + l].body, 0.35);
    const T = t.start.target,
      D = s.h.lerpVectors(t.start.ank, T, this.ease(v));
    D.y = Ht(t.start.ank.y, T.y, this.ease(v)) + 0.12 * Math.sin(Math.PI * v);
    const C = this.seg["foot" + r].body;
    if (
      (v >= 1 && (D.y = T.y - Math.min(0.04, (p - t.start.swing - 0.42) * 0.3)),
      t.start.planted < 0 && v > 0.85 && C.groundContact)
    ) {
      const R = this.ankleWorld(r, s.c);
      R.y < a + 0.12 &&
        (Math.hypot(R.x - T.x, R.z - T.z) < 0.1 || p - t.start.swing > 0.75) &&
        ((t.start.planted = p), (t.start.plantAt = new L(R.x, a + 0.085, R.z)));
    }
    if (t.start.planted >= 0)
      this.standLegTo(
        r,
        n.localToWorld(this.geo["hipAnchor" + r], s.a).clone(),
        A,
        t.start.plantAt,
        t.psi,
        0.9,
      ),
        this.addCand(t.cands, C, ee(0, 0.25, p - t.start.planted));
    else if (t.start.swing === void 0) {
      t.start.kneeF || (t.start.kneeF = this.kneeFloor(r, new L()));
      const R = s.k
        .copy(this.geo["hipAnchor" + r])
        .applyQuat(A)
        .add(w)
        .clone();
      this.kneelLegTo(r, R, A, t.start.kneeF, t.psi, 1, -0.25),
        this.addCand(t.cands, this.seg["thigh" + r].body, 1 - x);
    } else this.swingLegTo(r, D, t.psi, 0.9, 220, 1.5 * (1 - ee(0.1, 0.5, v)));
    if (
      (this.relaxedArms(0.9, 0), this.armsOut(0.25), v > 0.5 && t.useArm[r])
    ) {
      const R = this.jt["knee" + r].worldAnchor(s.c);
      this.reachArm(
        r,
        s.d
          .copy(R)
          .addScaled(s.e.set(h, 0, u), -0.02)
          .add(Pe.set(d * c * 0.01, 0.07, f * c * 0.01)),
        s.e.set(d * c, -0.2, f * c),
        0.9,
      );
    }
    t.useArm.L || this.guardArm("L"), t.useArm.R || this.guardArm("R");
    const P = this.rd.totalMass * ts;
    this.assistBody(n, w.y, A, 900, 120, 0.1 * P, 130, 60),
      this.assistBody(i, null, E, 0, 0, 0, 120, 55),
      t.start.planted >= 0 && p - t.start.planted > 0.12
        ? ((t.plantF = t.start.plantAt), this.getUpPhase(t, "rise"))
        : (p > 2.2 || (p > 0.4 && n.pos.y - a < 0.3)) &&
          this.failGetUp("lunge");
  }
  guRise(t, e) {
    const s = this.guScratch(),
      n = this.sens,
      i = this.seg.pelvis.body,
      a = this.seg.chest.body,
      r = this.world.groundY,
      l = t.front,
      c = l === "L" ? "R" : "L",
      h = l === "L" ? 1 : -1,
      u = Math.sin(t.psi),
      d = Math.cos(t.psi),
      f = d,
      p = -u;
    if (!t.start) {
      const ot = t.plantF ? t.plantF.clone() : this.ankleWorld(l, new L());
      t.start = {
        pel: i.pos.clone(),
        ankF: ot,
        toeB: this.ankleWorld(c, new L()),
        kneeB: this.kneeFloor(c, new L()),
        up: -1,
      };
    }
    const m = t.t,
      x = t.start.ankF,
      g = t.start.toeB,
      b = this.ease(m / 0.4),
      y = ((ot) => (ot.x - x.x) * u + (ot.z - x.z) * d)(n.com) > -0.13;
    t.start.up < 0 && m > 0.25 && (y || m > 0.7) && (t.start.up = m);
    const M = t.start.up < 0 ? 0 : this.ease((m - t.start.up) / 0.65),
      w = Ht(0.42 * b, 0.05, M),
      S = this.trunkRot(t.psi, w * 0.6, 0, s.pelRot),
      _ = this.trunkRot(t.psi, w, 0, s.chestRot);
    this.trunkPose(S, _, 1, 0.15, 0);
    const A = (x.x - t.start.pel.x) * d - (x.z - t.start.pel.z) * u,
      E = (g.x - t.start.pel.x) * d - (g.z - t.start.pel.z) * u,
      k = Ht(Ht(A, E, 0.4), A, M),
      T = Ht(0.3, 0.06, M),
      D = x.x - u * T + d * (k - A),
      C = x.z - d * T - u * (k - A),
      P = Ht(Ht(t.start.pel.y - r, 0.55, b), 0.88, M);
    t.start.yT === void 0 && (t.start.yT = i.pos.y - r),
      (t.start.yT = P > t.start.yT ? Qs(t.start.yT, P, 0.5 * e * t.pace) : P);
    const R = s.f.set(
        Ht(t.start.pel.x, D, b),
        r + t.start.yT,
        Ht(t.start.pel.z, C, b),
      ),
      z = t.start.kneeB,
      H = this.soleCenter(l, s.b),
      N = Ht(Ht(x.x, z.x, 0.25), H.x + u * 0.02, M),
      I = Ht(Ht(x.z, z.z, 0.25), H.z + d * 0.02, M);
    (t.support.comTarget = s.ct.set(N, r, I)),
      this.comFeedback(R, t.support.comTarget, 0.7, 0.08);
    for (const ot of Le) {
      const nt = ot === l ? x : this.ankleWorld(c, s.a),
        ft = s.k
          .copy(this.geo["hipAnchor" + ot])
          .applyQuat(S)
          .add(R),
        K = ft.x - nt.x,
        it = ft.z - nt.z,
        J =
          (this.geo["L1" + ot] + this.geo["L2" + ot]) * 0.975 +
          (ot === l ? 0 : 0.1);
      R.y = Math.min(
        R.y,
        nt.y +
          Math.sqrt(Math.max(J * J - K * K - it * it, 0.04)) +
          (R.y - ft.y),
      );
    }
    const U = s.k
      .copy(this.geo["hipAnchor" + l])
      .applyQuat(S)
      .add(R)
      .clone();
    this.standLegTo(l, U, S, x, t.psi, 1.1);
    const $ = s.k
      .copy(this.geo["hipAnchor" + c])
      .applyQuat(S)
      .add(R)
      .clone();
    if (t.start.up < 0)
      this.kneelLegTo(c, $, S, t.start.kneeB, t.psi, 1, -0.25);
    else {
      const ot = this.ankleWorld(c, s.b).clone();
      (ot.y = j(ot.y - 0.01, r + 0.08, r + 0.11)),
        this.standLegTo(c, $, S, ot, t.psi, 0.9, -0.2 + 0.2 * M, 2.5);
    }
    if (
      (this.addCand(t.cands, this.seg["foot" + l].body, 1),
      this.addCand(t.cands, this.seg["foot" + c].body, 0.45 * (1 - M) + 0.05),
      this.addCand(t.cands, this.seg["thigh" + c].body, 1 - M),
      this.addCand(t.cands, this.seg["shin" + c].body, 0.5 * (1 - M)),
      this.relaxedArms(1, 0),
      t.useArm[l] && M < 0.7)
    ) {
      const ot = this.jt["knee" + l].worldAnchor(s.c);
      this.reachArm(
        l,
        s.d
          .copy(ot)
          .add(
            Pe.set(
              f * h * 0.01 - u * 0.02,
              0.06 - 0.03 * M,
              p * h * 0.01 - d * 0.02,
            ),
          ),
        s.e.set(f * h, -0.2, p * h),
        1,
      );
    }
    t.useArm.L || this.guardArm("L"),
      t.useArm.R || this.guardArm("R"),
      (t.support.kp = 600);
    const G = this.rd.totalMass * ts;
    this.assistBody(i, R.y, S, 1e3, 140, 0.12 * G, 140, 70),
      this.assistBody(a, null, _, 0, 0, 0, 130, 60);
    const Q = Math.hypot(n.com.x - N, n.com.z - I),
      W = n.comVel.x * u + n.comVel.z * d,
      q =
        Math.hypot(n.comVel.x, n.comVel.z) < 0.25 &&
        Math.abs(n.comVel.y) < 0.3 &&
        W > -0.08,
      O = M >= 0.6 && i.pos.y - r > 0.58;
    O && t.start.top === void 0 && (t.start.top = m);
    const X = (n.com.x - N) * u + (n.com.z - I) * d,
      tt = ((n.com.x - N) * f + (n.com.z - I) * p) * -h,
      pt =
        t.start.top !== void 0 &&
        m - t.start.top > 0.6 &&
        Math.abs(X) < 0.12 &&
        tt > -0.05 &&
        tt < 0.18 &&
        Math.abs(n.comVel.y) < 0.3;
    O && n.footLoad[l] > 0.4 && ((Q < 0.08 && q) || pt)
      ? ((t.plantF = this.ankleWorld(l, new L())), this.getUpPhase(t, "stepup"))
      : (m > 4.5 || (m > 0.4 && i.pos.y - r < 0.33)) && this.failGetUp("rise");
  }
  guStepUp(t, e) {
    const s = this.guScratch(),
      n = this.sens,
      i = this.seg.pelvis.body,
      a = this.world.groundY,
      r = t.front,
      l = r === "L" ? "R" : "L",
      c = l === "L" ? 1 : -1;
    t.start ||
      ((t.psi = ul(i.rot)),
      (t.start = {
        from: this.ankleWorld(l, new L()),
        target: new L(),
        yT: i.pos.y - a,
        planted: -1,
        plantAt: new L(),
        ci: new L(),
      }));
    const h = Math.sin(t.psi),
      u = Math.cos(t.psi),
      d = u,
      f = -h,
      p = t.t,
      m = t.start,
      x = this.ankleWorld(r, s.h).clone(),
      g = this.soleCenter(r, s.a).clone(),
      b = this.soleCenter(l, s.b),
      v = m.planted < 0 ? 0 : this.ease((p - m.planted) / 0.4) * 0.7,
      y = d * c * 0.015 + h * 0.03,
      M = f * c * 0.015 + u * 0.03,
      w = s.ct.set(
        Ht(g.x + y, 0.5 * (g.x + b.x), v),
        a,
        Ht(g.z + M, 0.5 * (g.z + b.z), v),
      );
    (t.support.comTarget = w), (t.support.kp = 600);
    const S = 0.5,
      _ = j(p / S, 0, 2);
    if (m.planted < 0 && _ < 0.7) {
      const N = j((n.cp.x - g.x) * h + (n.cp.z - g.z) * u, -0.06, 0.06),
        I = j(((n.cp.x - g.x) * d + (n.cp.z - g.z) * f) * c, -0.05, 0.12),
        U = 2 * N - 0.058,
        $ = Math.max(0.13, 0.2 + I);
      m.target.set(g.x + h * U + d * c * $, a + 0.085, g.z + u * U + f * c * $);
    }
    m.lean0 === void 0 &&
      (m.lean0 = j(this.pitchOf(this.seg.chest.body, t.psi), 0, 0.5)),
      this.standingSpine(Ht(m.lean0, 0.03, this.ease(p / 0.6)), 0, t.psi, 1);
    const A = to(t.psi, s.pelRot);
    (m.yT = Qs(m.yT, this.geo.pelvisBindY - 0.03, 0.4 * e)),
      (m.yT =
        Math.min(m.yT, i.pos.y - a + 0.03) -
        j((i.vel.y - 0.15) * 0.1, 0, 0.04));
    const E = w.x - n.com.x,
      k = w.z - n.com.z;
    (m.ci.x = j(m.ci.x + E * e, -0.05, 0.05)),
      (m.ci.z = j(m.ci.z + k * e, -0.05, 0.05));
    let T = E * 0.7 + m.ci.x * 0.5 - n.comVel.x * 0.35,
      D = k * 0.7 + m.ci.z * 0.5 - n.comVel.z * 0.35;
    const C = Math.hypot(T, D);
    C > 0.07 && ((T *= 0.07 / C), (D *= 0.07 / C));
    const P = s.f.set(i.pos.x + T, a + m.yT, i.pos.z + D);
    for (const N of m.planted < 0 ? [r] : Le) {
      const I = N === r ? x : m.plantAt,
        U = s.k
          .copy(this.geo["hipAnchor" + N])
          .applyQuat(A)
          .add(P),
        $ = U.x - I.x,
        G = U.z - I.z,
        Q = (this.geo["L1" + N] + this.geo["L2" + N]) * 0.975;
      P.y = Math.min(
        P.y,
        I.y + Math.sqrt(Math.max(Q * Q - $ * $ - G * G, 0.04)) + (P.y - U.y),
      );
    }
    const R = s.k
      .copy(this.geo["hipAnchor" + r])
      .applyQuat(A)
      .add(P)
      .clone();
    this.standLegTo(r, R, A, x, t.psi, 1.1),
      this.addCand(t.cands, this.seg["foot" + r].body, 1);
    const z = this.seg["foot" + l].body;
    if (m.planted < 0) {
      const N = this.ease(Math.min(_, 1)),
        I = s.e.lerpVectors(m.from, m.target, N);
      (I.y =
        Ht(m.from.y, m.target.y, N) +
        0.07 * Math.sin(Math.PI * Math.min(_, 1))),
        _ >= 1 && (I.y = m.target.y - Math.min(0.04, (_ - 1) * S * 0.3)),
        this.swingLegTo(l, I, t.psi, 0.9, 220, 1.2 * (1 - ee(0.1, 0.5, _)));
      const U = this.ankleWorld(l, s.c),
        $ = Math.hypot(U.x - m.target.x, U.z - m.target.z) < 0.07;
      ((z.groundContact && _ > 0.5 && ($ || _ > 0.9)) || _ > 1.6) &&
        ((m.planted = p), m.plantAt.set(U.x, a + 0.085, U.z));
    } else {
      const N = s.k
        .copy(this.geo["hipAnchor" + l])
        .applyQuat(A)
        .add(P)
        .clone();
      this.standLegTo(l, N, A, m.plantAt, t.psi, 1),
        this.addCand(t.cands, z, ee(0, 0.15, p - m.planted));
    }
    this.relaxedArms(1, 0),
      this.armsOut(m.planted < 0 ? 0.15 : 0),
      t.useArm.L || this.guardArm("L"),
      t.useArm.R || this.guardArm("R");
    const H = this.rd.totalMass * ts;
    this.assistBody(i, P.y, A, 1e3, 140, 0.1 * H, 300, 110),
      m.planted >= 0 &&
      ((n.footContact.L && n.footContact.R) || p - m.planted > 0.25)
        ? this.standUp()
        : (p > 3.5 || i.pos.y - a < 0.45) && this.failGetUp("stepup");
  }
  standUp(t = null) {
    const e = this.seg.pelvis.body;
    this.mode === "getup" && this.gu && (this.heading = this.gu.psi),
      (this.cdes = null),
      (this.pelvisYTarget = e.pos.y),
      this.comInt.setZero(),
      (this.step = null),
      (this.settleFoot = t),
      (this.settleTime = 0),
      (this.awkwardTime = 0),
      (this.lastStepEnd = this.time),
      (this.assist = 0.8),
      (this.getUpFails = 0),
      (this.restTime = 0),
      this.setUpperGC(1),
      this.setMode("balance");
  }
  doGround(t) {
    (this.assist = 0),
      (this.groundTime += t),
      (this.frameNo = (this.frameNo || 0) + 1),
      (this.dtLast = t);
    const e = this.time,
      s = this.pain,
      n = j(0.25 + s * 0.5, 0.25, 0.75),
      i = ee(0.25, 0.9, s),
      a = (m, x) => Wg(e * m + x, this.seed);
    this.setUpperGC(1);
    const r = this.seg.chest.body,
      l = this.seg.pelvis.body,
      c = r.localDirToWorld(Yn, Ut),
      h = r.localDirToWorld(Ke, Xt),
      u = Math.atan2(h.y, -c.y),
      d = this.groundState || (this.groundState = { side: 0 });
    if (!this.conscious || this.tone < 0.3 || this.modeTime < 0.1) d.side = 0;
    else if (
      d.side === 0 &&
      s > 0.5 &&
      Math.abs(u) > 2 &&
      this.modeTime > 1.5 &&
      !this.ableToGetUp()
    ) {
      let m = 0;
      for (const x of this.wounds) {
        const g = x.segment.name;
        g.endsWith("L") ? (m -= 1) : g.endsWith("R") && (m += 1);
      }
      (m +=
        2 *
        Math.sign(
          Math.round(
            4 *
              (this.legStrength.L -
                this.legStrength.R +
                0.5 * (this.armStrength.L - this.armStrength.R)),
          ) / 4,
        )),
        (d.side = m < 0 ? 1 : m > 0 ? -1 : u > 0 ? 1 : -1);
    } else d.side !== 0 && s < 0.35 && (d.side = 0);
    const f =
      d.side !== 0
        ? ee(
            0.6,
            1.3,
            Math.abs(u) < 2.4 ? 1.4 - Math.abs(Math.abs(u) - Math.PI / 2) : 0.5,
          )
        : 0;
    if (d.side !== 0) {
      const m = Pe.subVectors(r.pos, l.pos).normalize(),
        x = 0.5 * (r.angVel.dot(m) + l.angVel.dot(m)),
        g = cn((d.side * Math.PI) / 2 - u),
        b = Math.abs(g) > 0.6 ? 80 : 10,
        v =
          j(80 * g - 20 * x, -b, b) * this.assistGain * ee(0.3, 0.6, this.tone);
      r.torque.addScaled(m, v * 0.6), l.torque.addScaled(m, v * 0.4);
    }
    const p = 0.1 + 0.55 * i * (0.6 + 0.4 * a(0.4, 1)) + 0.35 * f;
    this.setRel(
      "lumbar",
      Wt.setFromEuler(
        p * 0.6 + 0.2 * i * a(0.7, 2),
        0.2 * i * a(0.5, 3),
        0.25 * i * a(0.6, 4),
        "XYZ",
      ),
    ),
      this.gains("lumbar", n * 0.35),
      this.setRel(
        "thoracic",
        Wt.setFromEuler(
          p * 0.5 - 0.03 * this.breath,
          0.25 * i * a(0.45, 5),
          0.2 * i * a(0.55, 6),
          "XYZ",
        ),
      ),
      this.gains("thoracic", n * 0.35),
      this.setRel(
        "neckBase",
        Wt.setFromEuler(
          0.3 * p + 0.2 * i * a(0.8, 7),
          0.3 * i * a(0.3, 8),
          0,
          "XYZ",
        ),
      ),
      this.gains("neckBase", n * 0.6),
      this.setRel(
        "neckTop",
        Wt.setFromEuler(0.2 * p, 0.4 * i * a(0.35, 9), 0, "XYZ"),
      ),
      this.gains("neckTop", n * 0.6);
    for (const m of Le) {
      const x = m === "L" ? 1 : -1,
        g = m === "L" ? 0 : 50,
        b = j(i + 0.2, 0, 1),
        v = d.side !== 0 && d.side > 0 == (m === "L") ? 0.25 : 0,
        y = -0.3 - 0.9 * p * b - (0.6 + v) * f + 0.5 * i * a(0.5, 10 + g),
        M = 0.4 + 1.2 * p * b + 0.6 * f + 0.6 * i * Math.max(0, a(0.6, 11 + g)),
        w = v ? 0.35 * f * x : 0;
      this.setRel(
        "hip" + m,
        Wt.setFromEuler(y, 0.15 * x * i * a(0.3, 12 + g), -0.12 * x + w, "XYZ"),
      ),
        this.gains("hip" + m, n * (0.12 + 0.3 * f)),
        this.setRel("knee" + m, Wt.setFromAxisAngle(Ke, M)),
        this.gains("knee" + m, n * (0.12 + 0.2 * f)),
        this.setRel("ankle" + m, Wt.setFromEuler(0.3, 0, 0, "XYZ")),
        this.gains("ankle" + m, n * 0.15),
        Wt.setFromEuler(
          -0.5 - 0.4 * p + 0.3 * i * a(0.4, 13 + g),
          0,
          -0.2 * x,
          "XYZ",
        ),
        this.setRel("shoulder" + m, Wt, 40 * n, 4, 50);
      const S =
        m === "L"
          ? rn.upperArmDirL
          : Lt.set(-rn.upperArmDirL.x, rn.upperArmDirL.y, rn.upperArmDirL.z);
      this.setRel(
        "elbow" + m,
        ke.setFromAxisAngle(
          Lt.crossVectors(Yn, S).normalize(),
          -0.9 - 0.5 * p - 0.4 * i * Math.max(0, a(0.5, 14 + g)),
        ),
        25 * n,
        1.5,
        40,
      ),
        this.setRel(
          "wrist" + m,
          as.setFromEuler(0, 0, 0.3 * x, "XYZ"),
          6 * n,
          0.2,
          8,
        );
    }
  }
  doLimp(t = 1 / 60) {
    this.assist = 0;
    for (const e of this.rd.jointList) this.cmd[e.name].mode = L0;
    if ((this.applyReflexes(t), this.alive && this.breath)) {
      const e = this.seg.chest.body,
        s = this.seg.abdomen.body;
      e.localDirToWorld(Ke, Lt).scale(-7 * this.breath),
        e.torque.add(Lt),
        s.torque.sub(Lt);
    }
  }
  onKnockOut(t) {
    if (!this.alive || this.rng() > 0.85 * ee(0.5, 0.9, t)) return;
    const e = this.seg.chest.body,
      s = this.seg.head.body;
    e.localDirToWorld(Ke, Lt), s.localDirToWorld(Yn, Ut);
    const n = Lt.dot(Ut),
      i =
        Math.abs(n) > 0.15 ? (n > 0 ? "L" : "R") : this.rng() < 0.5 ? "L" : "R";
    this.fencing = {
      t: 0,
      dur: 2 + 4 * this.rng() * t,
      ext: i,
      both: this.rng() < 0.3,
    };
  }
  onDeath(t) {
    this.fencing = null;
    const s = /brain|head|skull|cranial|cervical/.test(t || "")
      ? 3 + Math.floor(this.rng() * 5)
      : this.rng() < 0.45
        ? 1 + Math.floor(this.rng() * 3)
        : 0;
    if (!s) return;
    const n = ["kick", "kick", "foot", "arm", "hand", "trunk"],
      i = [];
    let a = 0.9 + 0.6 * this.rng();
    for (let r = 0; r < s; r++) {
      const l = n[Math.floor(this.rng() * n.length)];
      i.push({
        t: a,
        kind: l,
        side: this.rng() < 0.5 ? "L" : "R",
        dur:
          l === "foot" ? 0.5 : l === "trunk" ? 0.26 : 0.16 + 0.1 * this.rng(),
        amp: (0.6 + 0.4 * this.rng()) * Math.exp(-a / 5),
        sign: this.rng() < 0.5 ? 1 : -1,
      }),
        (a += 0.25 + 1.5 * this.rng());
    }
    this.twitches = { t: 0, list: i };
  }
  jointTorque(t, e, s) {
    const n = this.jt[t];
    !n ||
      !n.enabled ||
      !s ||
      (Wt.multiplyQuats(n.parent.rot, n.frameP),
      Lt.copy(e).applyQuat(Wt).scale(s),
      n.child.torque.add(Lt),
      n.parent.torque.sub(Lt));
  }
  flexSign(t, e) {
    const s = this.jt[t]?.limits?.[e];
    return s && s[0] + s[1] < 0 ? -1 : 1;
  }
  applyReflexes(t) {
    const e = this.fencing;
    if (e && this.alive && !this.conscious) {
      e.t += t;
      const n = 0.8 * ee(0, 0.12, e.t) * (1 - ee(e.dur, e.dur + 0.8, e.t));
      if (n <= 0.01 && e.t > e.dur) this.fencing = null;
      else {
        const i = this.seg.chest.body,
          a =
            this._fence ||
            (this._fence = {
              fwd: new L(),
              up: new L(),
              lat: new L(),
              wrist: new L(),
              pole: new L(),
            });
        i.localDirToWorld(Yn, a.fwd),
          i.localDirToWorld(mi, a.up),
          i.localDirToWorld(Ke, a.lat);
        for (const r of Le) {
          if (r === e.ext || e.both) {
            const l = r === "L" ? 1 : -1,
              c = 0.95 * (this.geo["A1" + r] + this.geo["A2" + r]);
            i.localToWorld(this.geo["shoulderAnchor" + r], a.wrist),
              a.wrist
                .addScaled(a.fwd, 0.86 * c)
                .addScaled(a.up, 0.4 * c)
                .addScaled(a.lat, 0.12 * l * c),
              a.pole.copy(a.lat).scale(l).addScaled(a.up, -0.6),
              this.reachArm(r, a.wrist, a.pole, 1);
          } else this.guardArm(r, 1.3);
          for (const l of ["shoulder", "elbow", "wrist"])
            this.cmd[l + r].reflex = n;
        }
      }
    } else e && (this.conscious || !this.alive) && (this.fencing = null);
    const s = this.twitches;
    if (s && !this.alive) {
      s.t += t;
      let n = !1;
      for (const i of s.list) {
        const a = (s.t - i.t) / i.dur;
        if (a < 0) {
          n = !0;
          continue;
        }
        if (a > 1) continue;
        n = !0;
        const r = Math.sin(Math.PI * a) * i.amp,
          l = i.side;
        switch (i.kind) {
          case "kick":
            this.jointTorque(
              "knee" + l,
              mi,
              this.flexSign("knee" + l, "twist") * 30 * r,
            ),
              this.jointTorque(
                "hip" + l,
                Ke,
                this.flexSign("hip" + l, "swingX") * 40 * r,
              );
            break;
          case "foot":
            this.jointTorque(
              "ankle" + l,
              mi,
              i.sign * 5 * Math.sin(Math.PI * 6 * a) * i.amp,
            );
            break;
          case "arm":
            this.jointTorque(
              "elbow" + l,
              mi,
              this.flexSign("elbow" + l, "twist") * 9 * r,
            ),
              this.jointTorque("shoulder" + l, Ke, i.sign * 6 * r);
            break;
          case "hand":
            this.jointTorque("wrist" + l, Ke, i.sign * 0.5 * r);
            break;
          case "trunk":
            this.jointTorque(
              "lumbar",
              Ke,
              -this.flexSign("lumbar", "swingX") * 25 * r,
            ),
              this.jointTorque(
                "thoracic",
                Ke,
                -this.flexSign("thoracic", "swingX") * 15 * r,
              ),
              this.jointTorque(
                "neckBase",
                Ke,
                -this.flexSign("neckBase", "swingX") * 4 * r,
              );
            break;
        }
      }
      n || (this.twitches = null);
    }
  }
  applyArmTasks(t) {
    if (
      ((this.holding.L = this.holding.R = null),
      !this.alive || !this.conscious || this.tone < 0.3)
    )
      return;
    const e = this.mode;
    if (e !== "balance" && e !== "falling" && e !== "ground" && e !== "getup")
      return;
    const s = this.threat;
    if (
      s &&
      s.tti < 0.65 &&
      e !== "ground" &&
      !(e === "balance" && (this.flail || 0) > 0.5)
    ) {
      const i = this.seg.chest.body,
        a = i.localDirToWorld(Ke, Pe),
        r = (s.point.x - i.pos.x) * a.x + (s.point.z - i.pos.z) * a.z;
      for (const l of Le) {
        const c = l === "L" ? 1 : -1;
        this.armStrength[l] > 0.2 && r * c > -0.1
          ? this.blockWithArm(l, s, t)
          : this.guard && (this.guard[l] = null);
      }
      return;
    }
    if (
      (this.guard && (this.guard.L = this.guard.R = null), !this.wounds.length)
    )
      return;
    const n = { L: !1, R: !1 };
    if (
      !(e === "balance" && (this.flail || 0) > 0.4) &&
      !(
        e === "falling" &&
        !(this.fallCause === "legs" && this.kneel && this.kneel.topple < 0.05)
      )
    )
      for (const i of this.wounds) {
        const a = i.segment.name;
        let r = null,
          l = 1 / 0;
        for (const c of Le) {
          if (
            n[c] ||
            this.armStrength[c] < 0.25 ||
            (a.endsWith(c) && /^(upperArm|forearm|hand)/.test(a))
          )
            continue;
          const u = this.seg.chest.body.localToWorld(
              this.geo["shoulderAnchor" + c],
              Lt,
            ),
            d = i.body.localToWorld(i.local, Ut),
            f = u.distanceTo(d),
            p = /^(upperArm|forearm|hand)/.test(a)
              ? 0
              : a.endsWith(c)
                ? -0.08
                : 0;
          f + p < l && ((l = f + p), (r = c));
        }
        if (!(!r || l > 0.68)) {
          if (this.holdWound(r, i, 0)) {
            (n[r] = !0), (this.holding[r] = i);
            const c = r === "L" ? "R" : "L";
            /^(chest|abdomen|pelvis|neck|head)$/.test(a) &&
              this.pain > 0.65 &&
              !n[c] &&
              this.armStrength[c] > 0.25 &&
              this.holdWound(c, i, 1) &&
              ((n[c] = !0), (this.holding[c] = i));
          }
          if (n.L && n.R) break;
        }
      }
  }
  holdWound(t, e, s) {
    const i = this.seg.chest.body.localToWorld(
        this.geo["shoulderAnchor" + t],
        new L(),
      ),
      a = e.body.localToWorld(e.local, new L()),
      r = e.body.localDirToWorld(e.normal, new L());
    if (r.lengthSq() < 1e-8) return !1;
    r.normalize();
    const l = new L().subVectors(i, a);
    l.addScaled(r, -l.dot(r)),
      l.lengthSq() < 1e-6 && l.set(0, 1, 0).addScaled(r, -r.y),
      l.normalize();
    const c = new L().crossVectors(r, l),
      h = a.clone().addScaled(r, 0.024);
    s && h.addScaled(c, (t === "L" ? 1 : -1) * 0.045).addScaled(l, 0.02);
    const u = h.clone().addScaled(l, 0.07);
    if (u.distanceTo(i) > 0.62) return !1;
    const d = new L().subVectors(i, this.seg.chest.body.pos);
    (d.y = 0), d.normalize(), (d.y = -1.2);
    const f =
      this._armOut ||
      (this._armOut = { upper: new ae(), fore: new ae(), reach: 0 });
    this.armIK(t, i, u, d, f);
    const p = 0.8 + 0.6 * this.pain;
    this.setWorld("shoulder" + t, f.upper, 150 * p, 9 * p, 85),
      Wt.multiplyConjA(f.upper, f.fore),
      this.setRel("elbow" + t, Wt, 70 * p, 3 * p, 65);
    const m = r.clone().negate(),
      x = l.clone().negate(),
      g = new L().crossVectors(m, x);
    return (
      ke.setFromBasis(m, x, g),
      as.copy(this.geo["handBasis" + t]).conjugate(),
      ke.multiply(as),
      this.setWorld("wrist" + t, ke, 14, 0.4, 14),
      !0
    );
  }
  blockWithArm(t, e, s = 1 / 60) {
    const n = this.seg.chest.body,
      i = this.seg.head.body.pos,
      a = n.localToWorld(this.geo["shoulderAnchor" + t], new L()),
      r = t === "L" ? 1 : -1,
      l = n.localDirToWorld(Ke, new L()),
      c = e.point.y > n.pos.y + 0.12,
      h = c ? new L().lerpVectors(e.point, i, 0.5) : e.point.clone();
    h.addScaled(e.from, c ? -0.26 : -0.3),
      h.addScaled(l, r * (c ? 0.075 : 0.1)),
      (h.y += c ? 0.04 : 0.02);
    const u = h.distanceTo(a);
    u > 0.55 &&
      h
        .sub(a)
        .scale(0.55 / u)
        .add(a),
      this.guard || (this.guard = { L: null, R: null }),
      this.guard[t] ||
        (this.guard[t] = this.seg["hand" + t].body.localToWorld(
          this.geo["wristInHand" + t],
          new L(),
        ));
    const d = this.guard[t],
      f = d.distanceTo(h),
      p = 2.5 * s;
    f > p ? d.lerp(h, p / f) : d.copy(h);
    const m = new L(0, -1, 0).addScaled(l, r * 0.6),
      x =
        this._armOut ||
        (this._armOut = { upper: new ae(), fore: new ae(), reach: 0 });
    this.armIK(t, a, d, m, x);
    const g = 1.2;
    this.setWorld("shoulder" + t, x.upper, 160 * g, 10 * g, 95),
      this.feedForward("shoulder" + t, x.upper, s),
      Wt.multiplyConjA(x.upper, x.fore),
      this.setRel("elbow" + t, Wt, 80 * g, 3.5 * g, 70),
      this.setRel("wrist" + t, ke.identity(), 10, 0.3, 12);
  }
}

/** Build ragdolls/controllers for a body of height scale `s` and bulk `b` inside `fn`. */
function withBuildScale(s, b, fn) {
  const prev = { ...__S };
  const r = s * b;
  const m = s * s * s * Math.pow(b, 1.2);
  (__S.s = s), (__S.r = r), (__S.m = m), (__S.g = m * s);
  try {
    return fn();
  } finally {
    Object.assign(__S, prev);
  }
}
export {
  L as Vec3,
  ae as Quat,
  uc as Body,
  kn as Shape,
  ky as World,
  tx as Joint,
  f4 as PointConstraint,
  p4 as SpringConstraint,
  Dy as Ragdoll,
  U4 as Controller,
  D4 as Locomotion,
  ni as LANDMARKS,
  Vp as SEGMENT_DEFS,
  jd as JOINT_DEFS,
  withBuildScale,
};
