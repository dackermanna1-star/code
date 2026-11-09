// Readable names for the Ragdoll Lab engine's (minified) internals. The engine and the game share
// one module scope; everything the game touches goes through these two tables so the rest of the
// game code reads like ordinary three.js.
const T3 = {
  Vector2: TA, Vector3: F, Vector4: Xt, Quaternion: At, Matrix4: OA, Euler: on, Color: tt,
  Object3D: Ht, Group: wt, Mesh: MA, InstancedMesh: $a, SkinnedMesh: ru, Bone: Pa,
  Box3: Go, Sphere: In,
  BufferGeometry: zt, BufferAttribute: Et, Float32BufferAttribute: XA, InstancedBufferAttribute: nr,
  InstancedBufferGeometry: Wv,
  PlaneGeometry: Pe, BoxGeometry: Qe, CylinderGeometry: Is, SphereGeometry: Es, TorusGeometry: Fu,
  IcosahedronGeometry: pl, RingGeometry: V0,
  MeshStandardMaterial: jA, MeshPhysicalMaterial: Ue, MeshBasicMaterial: ve, MeshLambertMaterial: Mv,
  ShaderMaterial: ui, PointsMaterial: hu, LineBasicMaterial: ac, MeshDepthMaterial: Ev,
  Points: Uu, Line: Qu, LineSegments: bE,
  Scene: Dl, PerspectiveCamera: Ms, OrthographicCamera: ju,
  PointLight: wa, SpotLight: Bd, HemisphereLight: Nu, DirectionalLight: q0,
  Fog: zp, FogExp2: Tp,
  Texture: bs, DataTexture: rr, CanvasTexture: rc, WebGLRenderTarget: nn, DepthTexture: Y0,
  Raycaster: sy, PMREMGenerator: Rd,
  // constants
  FrontSide: Fo, BackSide: Xs, DoubleSide: Ve,
  NoBlending: Lo, NormalBlending: M0, AdditiveBlending: er,
  RepeatWrapping: _n, ClampToEdgeWrapping: ki,
  NearestFilter: He, LinearFilter: _e, LinearMipmapLinearFilter: Mn,
  UnsignedByteType: li, UnsignedIntType: $n, RedIntegerFormat: wp, FloatType: vi, HalfFloatType: Ao, RGBAFormat: js,
  SRGBColorSpace: je, LinearSRGBColorSpace: Gi,
  DynamicDrawUsage: An,
};
const ThreeUtils = {
  mergeGeometries: (geos, groups = false) => si(geos, groups),
  cloneSkinned: (obj) => y1(obj),
  sanitizeNodeName: (n) => oe.sanitizeNodeName(n),
};

// Ragdoll Lab engine: physics, active ragdolls, injuries, ballistics, audio and effects
const Lab = {
  Vec3: I, Quat: rt,
  World: n1, Ragdoll: u1, Anatomy: Yd,
  Sandbox: D1,            // world manager: people, objects, firing, impacts
  Player: uD, PLAYER: Se, // first-person player body (capsule-ish, mantling, stamina)
  FlowField: tR, freeTest: eR,
  staticBox: CM, boxDef: ii,
  Ballistics: to, penetration: Kw, traceShot: J2, spreadDirs: V2, projectile: K2,
  ZombieKinds: wl,
  Audio: FS,
  Particles: S1, Effects: B1, FloorDecals: v1,
  RocketboxBinder: BB, GLTFLoader: z1,
  Input: ED,
  KillCam: aQ, RoomEnvironment: kS,
  Throwables: En,
  createRenderer: NS,
  weaponModel: (type) => sD(type),
  casingMesh: (type) => oD(type),
  muzzleFlashMesh: () => iD(),
  shardMesh: (kind, i) => wu(kind, i),
  throwableMesh: (type) => Ou(type),
  genTextures: Gs, noise2: Fs, fbm2: yi, cell2: mu, cached: Dt,
  rng: s1,
};

// the anatomical hit model shared by every ragdoll (built once; it is fairly heavy)
let _anatomy = null;
function anatomy() {
  if (!_anatomy) _anatomy = new Lab.Anatomy(new Lab.Ragdoll(new Lab.World()).segList.map((s) => s.name));
  return _anatomy;
}

const clamp = q, lerp = YA, smoothstep = et, approach = rs, wrapAngle = ws;
const TAU = Math.PI * 2;
const randRange = (a, b) => a + Math.random() * (b - a);
const randPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const toV3 = (p, out = new F()) => out.set(p.x, p.y, p.z);
const toP3 = (v, out = new I()) => out.set(v.x, v.y, v.z);
const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);

// a tiny critically damped spring (value, velocity) used for weapon motion
class Spring {
  constructor(stiffness = 120, damping = 14) { this.k = stiffness; this.c = damping; this.x = 0; this.v = 0; }
  step(dt, target = 0) {
    // semi-implicit Euler in small sub-steps: stable for stiff springs and long frames
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-this.k * (this.x - target) - this.c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  kick(v) { this.v += v; }
  reset() { this.x = this.v = 0; }
}

// verify the aliases once at start-up so a mismatch fails loudly instead of rendering garbage
(function checkAliases() {
  const checks = [
    ['Vector3', () => new T3.Vector3().isVector3], ['Quaternion', () => new T3.Quaternion().isQuaternion],
    ['Matrix4', () => new T3.Matrix4().isMatrix4], ['Color', () => new T3.Color().isColor],
    ['Mesh', () => new T3.Mesh().isMesh], ['Group', () => new T3.Group().isGroup],
    ['Scene', () => new T3.Scene().isScene], ['PerspectiveCamera', () => new T3.PerspectiveCamera().isPerspectiveCamera],
    ['PointLight', () => new T3.PointLight().isPointLight], ['SpotLight', () => new T3.SpotLight().isSpotLight],
    ['HemisphereLight', () => new T3.HemisphereLight().isHemisphereLight], ['FogExp2', () => new T3.FogExp2(0).isFogExp2],
    ['Fog', () => new T3.Fog(0).isFog], ['BoxGeometry', () => new T3.BoxGeometry().type === 'BoxGeometry'],
    ['PlaneGeometry', () => new T3.PlaneGeometry().type === 'PlaneGeometry'],
    ['MeshStandardMaterial', () => new T3.MeshStandardMaterial().isMeshStandardMaterial],
    ['MeshBasicMaterial', () => new T3.MeshBasicMaterial().isMeshBasicMaterial],
    ['ShaderMaterial', () => new T3.ShaderMaterial().isShaderMaterial],
    ['InstancedMesh', () => new T3.InstancedMesh(new T3.BoxGeometry(), new T3.MeshBasicMaterial(), 1).isInstancedMesh],
    ['Vector2', () => new T3.Vector2().isVector2], ['Vector4', () => new T3.Vector4().isVector4],
    ['Euler', () => new T3.Euler().isEuler], ['Texture', () => new T3.Texture().isTexture],
    ['DataTexture', () => new T3.DataTexture().isDataTexture], ['CanvasTexture', () => new T3.CanvasTexture().isCanvasTexture],
    ['Points', () => new T3.Points().isPoints], ['Raycaster', () => typeof new T3.Raycaster().setFromCamera === 'function'],
    ['Float32BufferAttribute', () => new T3.Float32BufferAttribute([0, 0, 0], 3).isBufferAttribute],
    ['OrthographicCamera', () => new T3.OrthographicCamera().isOrthographicCamera],
    ['WebGLRenderTarget', () => new T3.WebGLRenderTarget(1, 1).isWebGLRenderTarget],
  ];
  const bad = checks.filter(([, f]) => { try { return !f(); } catch { return true; } }).map(([n]) => n);
  if (bad.length) console.error('[backrooms] engine alias mismatch:', bad.join(', '));
})();
