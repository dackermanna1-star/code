// A ROBLOX "Part": the primitive brick everything was built from in 2008.
// Coordinates are in studs. Faces follow ROBLOX conventions:
//   Top = +Y, Bottom = -Y, Right = +X, Left = -X, Back = +Z, Front = -Z.
import * as THREE from 'three';
import * as CANNON from '../vendor/cannon-es.js';
import { brickColor } from './BrickColor.js';
import { surfaceTexture, trussTexture, SURFACE_BASE } from './textures.js';

export const GROUP = {
  WORLD: 1,
  CHARACTER: 2,
  DEBRIS: 4,
  DYNAMIC: 8,
  TRIGGER: 16,
};

const DEG = Math.PI / 180;
const FACE_ORDER = ['Right', 'Left', 'Top', 'Bottom', 'Back', 'Front']; // three.js box group order

const materialCache = new Map();
function getMaterial(colorNum, surface, transparency, reflectance, extra = '') {
  const key = `${colorNum}|${surface}|${transparency}|${reflectance}|${extra}`;
  let m = materialCache.get(key);
  if (m) return m;
  const c = brickColor(colorNum);
  const tex = surface === 'Truss' ? trussTexture() : surfaceTexture(surface);
  const color = new THREE.Color().setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);
  if (tex && surface !== 'Truss') color.multiplyScalar(1 / SURFACE_BASE);
  m = new THREE.MeshPhongMaterial({
    color,
    map: tex || null,
    shininess: 18 + reflectance * 80,
    specular: new THREE.Color(0.12 + reflectance * 0.5, 0.12 + reflectance * 0.5, 0.12 + reflectance * 0.5),
    transparent: transparency > 0,
    opacity: 1 - transparency,
    depthWrite: transparency < 0.5,
    alphaTest: surface === 'Truss' ? 0.5 : 0,
    side: surface === 'Truss' ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (extra === 'neon') m.emissive = color.clone().multiplyScalar(0.6);
  materialCache.set(key, m);
  return m;
}

const geoCache = new Map();
function boxGeometry(sx, sy, sz, stud = 1) {
  const key = `box:${sx}:${sy}:${sz}:${stud}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const g = new THREE.BoxGeometry(sx, sy, sz);
  // Scale UVs so textures tile once per stud.
  const uv = g.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let face = 0; face < 6; face++) {
    const [w, h] = dims[face];
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setXY(i, uv.getX(i) * w / stud, uv.getY(i) * h / stud);
    }
  }
  geoCache.set(key, g);
  return g;
}

function wedgeGeometry(sx, sy, sz) {
  // Wedge: full height at the back (+Z), slopes down to the front (-Z).
  const x = sx / 2, y = sy / 2, z = sz / 2;
  const g = new THREE.BufferGeometry();
  const v = [
    // bottom
    -x, -y, -z, x, -y, -z, x, -y, z, -x, -y, -z, x, -y, z, -x, -y, z,
    // back (vertical)
    -x, -y, z, x, -y, z, x, y, z, -x, -y, z, x, y, z, -x, y, z,
    // slope
    -x, -y, -z, -x, y, z, x, y, z, -x, -y, -z, x, y, z, x, -y, -z,
    // left tri
    -x, -y, -z, -x, -y, z, -x, y, z,
    // right tri
    x, -y, -z, x, y, z, x, -y, z,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const slopeLen = Math.hypot(sy, sz);
  const uv = [
    0, 0, sx, 0, sx, sz, 0, 0, sx, sz, 0, sz,
    0, 0, sx, 0, sx, sy, 0, 0, sx, sy, 0, sy,
    0, 0, 0, slopeLen, sx, slopeLen, 0, 0, sx, slopeLen, sx, 0,
    0, 0, sz, 0, sz, sy,
    0, 0, sz, sy, sz, 0,
  ];
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.addGroup(0, 6, 3); // bottom
  g.addGroup(6, 6, 4); // back
  g.addGroup(12, 6, 2); // slope uses top surface
  g.addGroup(18, 3, 1);
  g.addGroup(21, 3, 0);
  return g;
}

let nextId = 1;

export class Part {
  constructor(world, props = {}) {
    this.id = nextId++;
    this.world = world;
    this.name = props.name || 'Part';
    this.shape = props.shape || 'Block';
    this.size = new THREE.Vector3(...(props.size || [4, 1.2, 2]));
    this.color = props.color ?? 194;
    this.transparency = props.transparency || 0;
    this.reflectance = props.reflectance || 0;
    this.anchored = props.anchored !== false;
    this.canCollide = props.canCollide !== false;
    this.locked = !!props.locked;
    this.material = props.material || 'Plastic';
    this.tags = new Set(props.tags || []);
    this.userData = props.userData || {};
    this.touchHandlers = [];
    this.surfaces = {
      Top: props.top ?? (this.shape === 'Block' || this.shape === 'Spawn' ? 'Studs' : 'Smooth'),
      Bottom: props.bottom ?? (this.shape === 'Block' || this.shape === 'Spawn' ? 'Inlets' : 'Smooth'),
      Front: props.front ?? 'Smooth', Back: props.back ?? 'Smooth',
      Left: props.left ?? 'Smooth', Right: props.right ?? 'Smooth',
    };
    if (props.surfaces) Object.assign(this.surfaces, props.surfaces);
    if (this.shape === 'Truss') for (const f of FACE_ORDER) this.surfaces[f] = 'Truss';

    this.mesh = this._buildMesh(props);
    this.mesh.userData.part = this;
    const pos = props.position || [0, 0, 0];
    this.mesh.position.set(pos[0], pos[1], pos[2]);
    if (props.rotation) {
      const r = props.rotation;
      this.mesh.quaternion.setFromEuler(new THREE.Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'YXZ'));
    } else if (props.quaternion) {
      this.mesh.quaternion.copy(props.quaternion);
    }
    if (props.decals) for (const d of props.decals) this.addDecal(d.face, d.texture, d);

    this.body = this._buildBody(props);
    if (this.body) {
      this.body.position.set(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z);
      const q = this.mesh.quaternion;
      this.body.quaternion.set(q.x, q.y, q.z, q.w);
      this.body.part = this;
    }
    this.destroyed = false;
  }

  _materials() {
    const extra = this.material === 'Neon' ? 'neon' : '';
    return FACE_ORDER.map((f) => getMaterial(this.color, this.surfaces[f], this.transparency, this.reflectance, extra));
  }

  _buildMesh(props) {
    const { x: sx, y: sy, z: sz } = this.size;
    let mesh;
    switch (this.shape) {
      case 'Ball': {
        const r = Math.min(sx, sy, sz) / 2;
        mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), getMaterial(this.color, 'Smooth', this.transparency, this.reflectance));
        break;
      }
      case 'Cylinder': {
        // ROBLOX cylinders run along the X axis.
        const r = Math.min(sy, sz) / 2;
        const g = new THREE.CylinderGeometry(r, r, sx, 24);
        g.rotateZ(Math.PI / 2);
        mesh = new THREE.Mesh(g, getMaterial(this.color, 'Smooth', this.transparency, this.reflectance));
        break;
      }
      case 'Wedge':
        mesh = new THREE.Mesh(wedgeGeometry(sx, sy, sz), this._materials());
        break;
      case 'Truss':
        mesh = new THREE.Mesh(boxGeometry(sx, sy, sz, 2), this._materials());
        break;
      case 'Mesh':
        mesh = new THREE.Mesh(props.geometry, props.meshMaterial || getMaterial(this.color, 'Smooth', this.transparency, this.reflectance));
        break;
      default:
        mesh = new THREE.Mesh(boxGeometry(sx, sy, sz), this._materials());
    }
    if (this.transparency >= 1) mesh.visible = false;
    return mesh;
  }

  _buildBody(props) {
    if (props.noPhysics) return null;
    const { x: sx, y: sy, z: sz } = this.size;
    let shape, shapeOffset = null;
    switch (this.shape) {
      case 'Ball':
        shape = new CANNON.Sphere(Math.min(sx, sy, sz) / 2);
        break;
      case 'Cylinder': {
        const r = Math.min(sy, sz) / 2;
        shape = new CANNON.Cylinder(r, r, sx, 12);
        break;
      }
      case 'Wedge': {
        // vertices are given about the wedge's centroid (the slope passes
        // through the box centre, which cannon would take for the inside)
        const x = sx / 2, y = sy / 2, z = sz / 2, cy = -y / 3, cz = z / 3;
        const verts = [
          [-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [-x, y, z], [x, y, z],
        ].map(([a, b, c]) => new CANNON.Vec3(a, b - cy, c - cz));
        const faces = [[0, 1, 2, 3], [3, 2, 5, 4], [0, 4, 5, 1], [0, 3, 4], [1, 5, 2]];
        shape = new CANNON.ConvexPolyhedron({ vertices: verts, faces });
        shapeOffset = new CANNON.Vec3(0, cy, cz);
        break;
      }
      case 'Mesh':
        shape = props.physicsShape || new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2));
        break;
      default:
        shape = new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2));
    }
    const mass = this.anchored ? 0 : (props.mass ?? Math.max(0.5, sx * sy * sz * 0.7));
    const body = new CANNON.Body({
      mass,
      type: this.anchored ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC,
      material: this.world.defaultPhysMaterial,
      linearDamping: 0.01,
      angularDamping: 0.05,
    });
    if (this.shape === 'Cylinder') {
      const q = new CANNON.Quaternion();
      q.setFromEuler(0, 0, Math.PI / 2);
      body.addShape(shape, new CANNON.Vec3(), q);
    } else {
      body.addShape(shape, shapeOffset || undefined);
    }
    if (!this.canCollide) {
      body.collisionResponse = false;
      body.collisionFilterGroup = GROUP.TRIGGER;
      body.collisionFilterMask = 0;
    } else {
      body.collisionFilterGroup = this.anchored ? GROUP.WORLD : GROUP.DYNAMIC;
      body.collisionFilterMask = GROUP.WORLD | GROUP.DYNAMIC | GROUP.CHARACTER | GROUP.DEBRIS;
    }
    body.allowSleep = true;
    body.sleepSpeedLimit = 0.5;
    return body;
  }

  addDecal(face, texture, opts = {}) {
    const { x: sx, y: sy, z: sz } = this.size;
    const eps = 0.02;
    let w, h;
    const plane = new THREE.Group();
    const mat = new THREE.MeshPhongMaterial({ map: texture, transparent: true, depthWrite: false, shininess: 10, polygonOffset: true, polygonOffsetFactor: -2 });
    if (opts.color != null) mat.color = new THREE.Color(opts.color);
    let m;
    switch (face) {
      case 'Top': w = sx; h = sz; m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.x = -Math.PI / 2; m.position.y = sy / 2 + eps; break;
      case 'Bottom': w = sx; h = sz; m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.x = Math.PI / 2; m.position.y = -sy / 2 - eps; break;
      case 'Front': w = sx; h = sy; m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.y = Math.PI; m.position.z = -sz / 2 - eps; break;
      case 'Back': w = sx; h = sy; m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.z = sz / 2 + eps; break;
      case 'Right': w = sz; h = sy; m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.y = Math.PI / 2; m.position.x = sx / 2 + eps; break;
      case 'Left': w = sz; h = sy; m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.y = -Math.PI / 2; m.position.x = -sx / 2 - eps; break;
    }
    if (opts.rotate) m.rotateZ(opts.rotate);
    plane.add(m);
    this.mesh.add(plane);
    return m;
  }

  get position() { return this.mesh.position; }
  get quaternion() { return this.mesh.quaternion; }

  setPosition(x, y, z) {
    this.mesh.position.set(x, y, z);
    if (this.body) { this.body.position.set(x, y, z); this.body.wakeUp?.(); }
  }

  setQuaternion(q) {
    this.mesh.quaternion.copy(q);
    if (this.body) this.body.quaternion.set(q.x, q.y, q.z, q.w);
  }

  setRotationDeg(rx, ry, rz) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx * DEG, ry * DEG, rz * DEG, 'YXZ'));
    this.setQuaternion(q);
  }

  /** Make an anchored part movable by script (spinners, moving platforms). */
  setKinematic() {
    if (!this.body) return;
    this.body.type = CANNON.Body.KINEMATIC;
    this.body.mass = 0;
    this.body.updateMassProperties();
    this.body.allowSleep = false;
    this.kinematic = true;
    this.world.kinematicParts.add(this);
    if (this.world.shadows) this.mesh.castShadow = true;
  }

  setColor(colorNum) {
    this.color = colorNum;
    if (Array.isArray(this.mesh.material)) this.mesh.material = this._materials();
    else this.mesh.material = getMaterial(colorNum, 'Smooth', this.transparency, this.reflectance);
  }

  setTransparency(t) {
    this.transparency = t;
    this.mesh.visible = t < 1;
    if (Array.isArray(this.mesh.material)) this.mesh.material = this._materials();
    else this.mesh.material = getMaterial(this.color, 'Smooth', t, this.reflectance);
  }

  setCanCollide(on) {
    this.canCollide = on;
    if (!this.body) return;
    if (on) {
      this.body.collisionResponse = true;
      this.body.collisionFilterGroup = this.anchored ? GROUP.WORLD : GROUP.DYNAMIC;
      this.body.collisionFilterMask = GROUP.WORLD | GROUP.DYNAMIC | GROUP.CHARACTER | GROUP.DEBRIS;
    } else {
      this.body.collisionResponse = false;
      this.body.collisionFilterGroup = GROUP.TRIGGER;
      this.body.collisionFilterMask = 0;
    }
  }

  /** Unanchor (e.g. when an explosion hits or a script releases it). */
  unanchor() {
    if (!this.anchored || !this.body) return;
    this.anchored = false;
    this.body.type = CANNON.Body.DYNAMIC;
    this.body.mass = Math.max(0.5, this.size.x * this.size.y * this.size.z * 0.7);
    this.body.updateMassProperties();
    this.body.collisionFilterGroup = GROUP.DYNAMIC;
    this.body.wakeUp();
    this.world.dynamicParts.add(this);
    if (this.world.shadows) this.mesh.castShadow = true;
  }

  /** Register a Touched handler: fn(other) where other is a Character or Part. */
  onTouched(fn) {
    this.touchHandlers.push(fn);
    this.world.touchParts.add(this);
    return () => { this.touchHandlers = this.touchHandlers.filter((h) => h !== fn); };
  }

  /** World-space oriented bounding box (center, axes, half extents). */
  getOBB(out = {}) {
    out.center = out.center || new THREE.Vector3();
    out.center.copy(this.mesh.position);
    const m = new THREE.Matrix4().makeRotationFromQuaternion(this.mesh.quaternion);
    out.axes = out.axes || [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    m.extractBasis(out.axes[0], out.axes[1], out.axes[2]);
    out.half = out.half || new THREE.Vector3();
    out.half.copy(this.size).multiplyScalar(0.5);
    if (this.shape === 'Ball') out.radius = Math.min(this.size.x, this.size.y, this.size.z) / 2;
    else out.radius = undefined;
    return out;
  }

  syncFromBody(alpha) {
    if (!this.body || this.body.type === CANNON.Body.STATIC) return;
    const p = this.body.interpolatedPosition || this.body.position;
    const q = this.body.interpolatedQuaternion || this.body.quaternion;
    this.mesh.position.set(p.x, p.y, p.z);
    this.mesh.quaternion.set(q.x, q.y, q.z, q.w);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.world.remove(this);
  }
}
