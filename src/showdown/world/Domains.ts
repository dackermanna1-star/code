import * as THREE from 'three';
import { DOME_FRAG, DOME_VERT, FLOOR_FRAG, WORLD_VERT } from '../../gojo/Domain';
import { MOON_FRAG, POOL_FRAG, POOL_VERT, boneGeometry, buildShrine, skullGeometry } from '../../sukuna/Shrine';
import { RAMP_WORLD } from '../render/Toon';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** 無量空処: endless space, a black mirror floor and a singularity on the horizon. */
export class VoidEnv {
  readonly group = new THREE.Group();
  readonly uniforms = { uV: { value: new THREE.Vector3(0, 0.1, -1).normalize() }, uTime: { value: 0 } };
  private floorMat: THREE.ShaderMaterial;

  constructor() {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 48, 24),
      new THREE.ShaderMaterial({ vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    dome.frustumCulled = false;
    dome.renderOrder = -999;
    this.group.add(dome);
    this.floorMat = new THREE.ShaderMaterial({
      vertexShader: WORLD_VERT,
      fragmentShader: FLOOR_FRAG,
      uniforms: { ...this.uniforms, uCam: { value: new THREE.Vector3() }, uCenter: { value: new THREE.Vector3() }, uR: { value: 700 }, uEdge: { value: 0 } },
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -12,
    });
    const fg = new THREE.PlaneGeometry(1400, 1400);
    fg.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(fg, this.floorMat);
    floor.position.y = 0.2;
    floor.frustumCulled = false;
    floor.renderOrder = 3;
    this.group.add(floor);
    this.group.visible = false;
  }

  /** Point the singularity (seen from `from`, looking along `dir`). */
  aim(dir: THREE.Vector3) {
    this.uniforms.uV.value.copy(dir).setY(0).normalize().multiplyScalar(Math.cos(0.12)).setY(Math.sin(0.12)).normalize();
  }

  update(time: number, cam: THREE.Camera, center: THREE.Vector3) {
    this.uniforms.uTime.value = time;
    (this.floorMat.uniforms.uCam.value as THREE.Vector3).copy(cam.position);
    (this.floorMat.uniforms.uCenter.value as THREE.Vector3).copy(center);
    const dome = this.group.children[0];
    dome.position.copy(cam.position);
  }
}

const SKY_FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uMoon;
varying vec3 vDir;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(vec3(0.55, 0.05, 0.02), vec3(0.05, 0.0, 0.01), pow(h, 0.45));
  // bleeding cloud bands
  float c = n2(vec2(atan(d.z, d.x) * 3.0 + uTime * 0.02, d.y * 7.0)) * n2(vec2(atan(d.z, d.x) * 9.0, d.y * 21.0 - uTime * 0.05));
  col += vec3(0.25, 0.01, 0.0) * smoothstep(0.25, 0.6, c) * (1.0 - h);
  if (d.y < 0.0) col = vec3(0.12, 0.005, 0.005);
  float m = max(dot(d, normalize(uMoon)), 0.0);
  col += vec3(0.9, 0.12, 0.04) * pow(m, 40.0) * 0.6;
  gl_FragColor = vec4(col, 1.0);
}`;

/** 伏魔御廚子: the shrine with its open maw, a lake of blood and bones under a red sky. */
export class ShrineEnv {
  readonly group = new THREE.Group();
  readonly shrine = new THREE.Group();
  private poolMat: THREE.ShaderMaterial;
  private moonMat: THREE.ShaderMaterial;
  private skyMat: THREE.ShaderMaterial;
  private moon: THREE.Mesh;
  private sky: THREE.Mesh;
  readonly light: THREE.PointLight;
  readonly moonDir = new THREE.Vector3(-0.4, 0.42, -0.8).normalize();

  constructor() {
    const g = buildShrine();
    const body = new THREE.Mesh(g.body, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: RAMP_WORLD }));
    body.castShadow = true;
    body.receiveShadow = true;
    const glow = new THREE.Mesh(g.glow, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }));
    this.shrine.add(body, glow);
    this.shrine.scale.setScalar(1.5);
    this.group.add(this.shrine);
    this.light = new THREE.PointLight(0xff2a10, 30, 80, 1.4);
    this.group.add(this.light);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: SKY_FRAG,
      uniforms: { uTime: { value: 0 }, uMoon: { value: this.moonDir.clone() } },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -999;
    this.group.add(this.sky);
    this.poolMat = new THREE.ShaderMaterial({
      vertexShader: POOL_VERT,
      fragmentShader: POOL_FRAG,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uCam: { value: new THREE.Vector3() },
          uCenter: { value: new THREE.Vector3() },
          uR: { value: 600 },
          uTime: { value: 0 },
          uA: { value: 1 },
          uMoon: { value: this.moonDir.clone() },
          uSkyLow: { value: new THREE.Color(0.45, 0.04, 0.02) },
          uSkyHigh: { value: new THREE.Color(0.05, 0.004, 0.005) },
        },
      ]),
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -6,
    });
    const pg = new THREE.CircleGeometry(600, 96);
    pg.rotateX(-Math.PI / 2);
    const pool = new THREE.Mesh(pg, this.poolMat);
    pool.position.y = 0.18;
    pool.renderOrder = 3;
    pool.frustumCulled = false;
    this.group.add(pool);
    // a field of skulls and bones round the shrine
    const lm = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: RAMP_WORLD });
    const skulls = new THREE.InstancedMesh(skullGeometry(), lm, 500);
    const bones = new THREE.InstancedMesh(boneGeometry(), lm, 400);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (const [im, n, sc] of [
      [skulls, 500, 1.6],
      [bones, 400, 1.8],
    ] as [THREE.InstancedMesh, number, number][]) {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2);
        const r = 8 + Math.pow(Math.random(), 0.7) * 90;
        q.setFromEuler(new THREE.Euler(rnd(-0.6, 0.6), rnd(0, 6.28), rnd(-0.6, 0.6)));
        m.compose(new THREE.Vector3(Math.cos(a) * r, 0.05, Math.sin(a) * r), q, new THREE.Vector3(sc, sc, sc).multiplyScalar(rnd(0.7, 1.4)));
        im.setMatrixAt(i, m);
      }
      im.frustumCulled = false;
      im.receiveShadow = true;
      this.group.add(im);
    }
    this.moonMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: MOON_FRAG,
      uniforms: { uA: { value: 1 }, uTime: { value: 0 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.moonMat);
    this.moon.renderOrder = -900;
    this.moon.frustumCulled = false;
    this.group.add(this.moon);
    this.group.visible = false;
  }

  /** Raise the shrine behind `at`, its mouth facing `facing`. */
  place(at: THREE.Vector3, facing: THREE.Vector3) {
    const back = facing.clone().setY(0).normalize();
    this.shrine.position.copy(at).addScaledVector(back, -40).setY(0);
    this.shrine.rotation.y = Math.atan2(back.x, back.z);
    this.light.position.copy(this.shrine.position).add(new THREE.Vector3(0, 10, 0)).addScaledVector(back, 10);
    (this.poolMat.uniforms.uCenter.value as THREE.Vector3).copy(at).setY(0);
    this.group.children.forEach((c) => {
      if ((c as THREE.InstancedMesh).isInstancedMesh) c.position.set(at.x, 0, at.z);
    });
  }

  update(time: number, cam: THREE.PerspectiveCamera) {
    this.poolMat.uniforms.uTime.value = time;
    (this.poolMat.uniforms.uCam.value as THREE.Vector3).copy(cam.position);
    this.skyMat.uniforms.uTime.value = time;
    this.sky.position.copy(cam.position);
    this.moon.position.copy(cam.position).addScaledVector(this.moonDir, 900);
    this.moon.scale.setScalar(280);
    this.moon.quaternion.copy(cam.quaternion);
    this.light.intensity = 30 + Math.sin(time * 7) * 6;
  }
}
