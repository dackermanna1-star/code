import * as THREE from 'three';

const MAX = 384;

/** Bullet tracer streaks (additive, fast-fading). */
export class Tracers {
  readonly mesh: THREE.Mesh;
  private a: Float32Array;
  private b: Float32Array;
  private t: Float32Array;
  private col: Float32Array;
  private attrs: THREE.InstancedBufferAttribute[];
  private head = 0;
  private dirty = false;
  private mat: THREE.ShaderMaterial;

  constructor() {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.a = new Float32Array(MAX * 3);
    this.b = new Float32Array(MAX * 3);
    this.t = new Float32Array(MAX * 4).fill(-100);
    this.col = new Float32Array(MAX * 4);
    const mk = (arr: Float32Array, n: number) => {
      const at = new THREE.InstancedBufferAttribute(arr, n);
      at.setUsage(THREE.DynamicDrawUsage);
      return at;
    };
    this.attrs = [mk(this.a, 3), mk(this.b, 3), mk(this.t, 4), mk(this.col, 4)];
    g.setAttribute('aA', this.attrs[0]);
    g.setAttribute('aB', this.attrs[1]);
    g.setAttribute('aT', this.attrs[2]);
    g.setAttribute('aCol', this.attrs[3]);
    g.instanceCount = MAX;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec3 aA; attribute vec3 aB; attribute vec4 aT; attribute vec4 aCol;
        uniform float uTime; varying vec4 vCol; varying float vAlong;
        void main(){
          float age = uTime - aT.x;
          float life = aT.y;
          if (age < 0.0 || age > life) { gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
          float k = age / life;
          vec3 d = aB - aA;
          float len = length(d);
          vec3 dir = d / max(len, 1e-4);
          // streak travels from A to B quickly, with a tail
          float speed = aT.z;
          float head = min(len, age * speed + aT.w);
          float tail = max(0.0, head - max(1.5, len * 0.35));
          vec3 p = aA + dir * mix(tail, head, position.y);
          vec3 toCam = normalize(cameraPosition - p);
          vec3 side = normalize(cross(dir, toCam));
          float w = aCol.w * (1.0 - k * 0.5);
          p += side * position.x * w;
          vCol = vec4(aCol.rgb, 1.0 - k);
          vAlong = position.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec4 vCol; varying float vAlong;
        void main(){ gl_FragColor = vec4(vCol.rgb * (0.35 + vAlong), vCol.a); }`,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
  }

  add(ax: number, ay: number, az: number, bx: number, by: number, bz: number, now: number, color = 0xffd27a, width = 0.022, speed = 400, life = 0.12, headStart = 2) {
    const i = this.head;
    this.head = (this.head + 1) % MAX;
    this.a.set([ax, ay, az], i * 3);
    this.b.set([bx, by, bz], i * 3);
    this.t.set([now, life, speed, headStart], i * 4);
    const c = new THREE.Color(color);
    this.col.set([c.r * 3, c.g * 3, c.b * 3, width], i * 4);
    this.dirty = true;
  }

  update(now: number) {
    this.mat.uniforms.uTime.value = now;
    if (this.dirty) {
      for (const a of this.attrs) a.needsUpdate = true;
      this.dirty = false;
    }
  }
}
