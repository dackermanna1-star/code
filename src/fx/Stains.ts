import * as THREE from 'three';
import { ARENA } from '../world/config';
import { makeSplatAtlas } from '../render/textures';

const MAX_BATCH = 1024;

interface Pending {
  t: number;
  x: number;
  z: number;
  size: number;
  rot: number;
  cell: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Persistent ground stains (blood, scorch marks) accumulated into a render
 * target that the ground overlay samples. Unlimited stamps, zero per-frame cost.
 */
export class Stains {
  readonly rt: THREE.WebGLRenderTarget;
  readonly overlay: THREE.Mesh;
  private stampScene = new THREE.Scene();
  private stampCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private stampMesh: THREE.InstancedMesh;
  private aCell: THREE.InstancedBufferAttribute;
  private aCol: THREE.InstancedBufferAttribute;
  private queue: Pending[] = [];
  private now = 0;
  readonly minX = ARENA.stainMinX;
  readonly maxX = ARENA.stainMaxX;
  readonly minZ = ARENA.stainMinZ;
  readonly maxZ = ARENA.stainMaxZ;
  private needsClear = true;
  stampsTotal = 0;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.rt = new THREE.WebGLRenderTarget(512, 2048, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      generateMipmaps: false,
    });
    const atlas = makeSplatAtlas();
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aCell = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BATCH), 1);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BATCH * 4), 4);
    this.aCell.setUsage(THREE.DynamicDrawUsage);
    this.aCol.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCell', this.aCell);
    geo.setAttribute('aCol', this.aCol);
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float aCell; attribute vec4 aCol;
        uniform vec4 bounds; varying vec2 vUv; varying vec4 vCol;
        void main(){
          vec4 wp = instanceMatrix * vec4(position.x, position.y, 0.0, 1.0);
          // wp.xy = world (x, z)
          vec2 ndc = vec2((wp.x - bounds.x) / (bounds.y - bounds.x), (wp.y - bounds.z) / (bounds.w - bounds.z)) * 2.0 - 1.0;
          float cx = mod(aCell, 4.0); float cy = floor(aCell / 4.0);
          vUv = (vec2(cx, 3.0 - cy) + uv) / 4.0;
          vCol = aCol;
          gl_Position = vec4(ndc, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D atlas; varying vec2 vUv; varying vec4 vCol;
        void main(){
          vec4 t = texture2D(atlas, vUv);
          if (t.a < 0.5) discard;
          float a = vCol.a;
          vec3 c = vCol.rgb * t.r;
          gl_FragColor = vec4(c * a, a);
        }`,
      uniforms: { atlas: { value: atlas }, bounds: { value: new THREE.Vector4(this.minX, this.maxX, this.minZ, this.maxZ) } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.stampMesh = new THREE.InstancedMesh(geo, mat, MAX_BATCH);
    this.stampMesh.frustumCulled = false;
    this.stampMesh.count = 0;
    this.stampScene.add(this.stampMesh);

    const w = this.maxX - this.minX;
    const d = this.maxZ - this.minZ;
    // odd row count keeps vertex rows off z = 0 (player spawn, see Environment road)
    const og = new THREE.PlaneGeometry(w, d, 8, 31);
    og.rotateX(-Math.PI / 2);
    // PlaneGeometry after rotateX(-90): uv.y = 1 at z = -d/2 ... fix uvs to world mapping
    const pos = og.getAttribute('position') as THREE.BufferAttribute;
    const uv = og.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (this.minX + this.maxX) / 2;
      const z = pos.getZ(i) + (this.minZ + this.maxZ) / 2;
      uv.setXY(i, (x - this.minX) / w, (z - this.minZ) / d);
    }
    og.translate((this.minX + this.maxX) / 2, 0.01, (this.minZ + this.maxZ) / 2);
    const omat = new THREE.MeshLambertMaterial({
      map: this.rt.texture,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    this.overlay = new THREE.Mesh(og, omat);
    this.overlay.receiveShadow = true;
    this.overlay.renderOrder = 1;
    scene.add(this.overlay);
  }

  inBounds(x: number, z: number) {
    return x > this.minX && x < this.maxX && z > this.minZ && z < this.maxZ;
  }

  /**
   * Queue a stamp. Color in linear RGB. `delay` seconds (e.g. droplet flight time).
   */
  stamp(x: number, z: number, size: number, r: number, g: number, b: number, a: number, cell = -1, delay = 0) {
    if (!this.inBounds(x, z)) return;
    this.queue.push({
      t: this.now + delay,
      x,
      z,
      size,
      rot: Math.random() * Math.PI * 2,
      cell: cell < 0 ? Math.floor(Math.random() * 16) : cell,
      r,
      g,
      b,
      a,
    });
  }

  blood(x: number, z: number, size: number, delay = 0, alpha = 0.92) {
    const k = 0.75 + Math.random() * 0.5;
    this.stamp(x, z, size, 0.34 * k, 0.012 * k, 0.012 * k, alpha, Math.floor(Math.random() * 16), delay);
  }

  scorch(x: number, z: number, size: number) {
    this.stamp(x, z, size, 0.02, 0.018, 0.016, 0.72, 8 + Math.floor(Math.random() * 8));
    this.stamp(x, z, size * 0.6, 0.01, 0.009, 0.008, 0.6, 8 + Math.floor(Math.random() * 8));
  }

  clear() {
    this.queue.length = 0;
    this.needsClear = true;
  }

  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private zAxis = new THREE.Vector3(0, 0, 1);

  update(now: number) {
    this.now = now;
    const r = this.renderer;
    if (this.needsClear) {
      const prev = r.getRenderTarget();
      r.setRenderTarget(this.rt);
      r.setClearColor(0x000000, 0);
      r.clear(true, false, false);
      r.setRenderTarget(prev);
      this.needsClear = false;
    }
    if (this.queue.length === 0) return;
    let n = 0;
    for (let i = this.queue.length - 1; i >= 0 && n < MAX_BATCH; i--) {
      const st = this.queue[i];
      if (st.t > now) continue;
      this.q.setFromAxisAngle(this.zAxis, st.rot);
      this.s.set(st.size, st.size, 1);
      this.p.set(st.x, st.z, 0);
      this.m.compose(this.p, this.q, this.s);
      this.stampMesh.setMatrixAt(n, this.m);
      this.aCell.setX(n, st.cell);
      this.aCol.setXYZW(n, st.r, st.g, st.b, st.a);
      n++;
      this.queue[i] = this.queue[this.queue.length - 1];
      this.queue.pop();
    }
    if (n === 0) return;
    this.stampsTotal += n;
    this.stampMesh.count = n;
    this.stampMesh.instanceMatrix.needsUpdate = true;
    this.aCell.needsUpdate = true;
    this.aCol.needsUpdate = true;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.render(this.stampScene, this.stampCam);
    r.setRenderTarget(prev);
  }
}
