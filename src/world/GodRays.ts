import * as THREE from 'three';

/**
 * Fake volumetric light shafts: each window rectangle is extruded along the
 * incoming sun direction into the room; a soft additive shader fades the
 * prism with distance and breaks it up with drifting noise ("dusty air").
 */
export class GodRays {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private windows: { center: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3; w: number; h: number; normal: THREE.Vector3 }[] = [];
  private meshes: THREE.Mesh[] = [];
  readonly uniforms = {
    uColor: { value: new THREE.Color(1, 0.85, 0.6) },
    uIntensity: { value: 0.0 },
    uTime: { value: 0 },
    uLength: { value: 6 },
  };

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute float aAlong;
        attribute vec2 aCross;
        varying float vAlong;
        varying vec2 vCross;
        varying vec3 vWorld;
        void main(){
          vAlong = aAlong;
          vCross = aCross;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uIntensity; uniform float uTime;
        varying float vAlong; varying vec2 vCross; varying vec3 vWorld;
        float h(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float n3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(h(i+vec3(0,0,0)),h(i+vec3(1,0,0)),f.x), mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x), mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y), f.z); }
        void main(){
          float edge = smoothstep(0.0, 0.18, vCross.x) * smoothstep(1.0, 0.82, vCross.x) * smoothstep(0.0, 0.15, vCross.y) * smoothstep(1.0, 0.85, vCross.y);
          float fade = (1.0 - smoothstep(0.0, 1.0, vAlong)) * smoothstep(0.0, 0.05, vAlong);
          float n = n3(vWorld * 1.6 + vec3(uTime * 0.05, uTime * 0.02, 0.0)) * 0.6 + n3(vWorld * 4.0 - uTime * 0.07) * 0.4;
          float a = edge * fade * (0.55 + 0.45 * n) * uIntensity;
          gl_FragColor = vec4(uColor * a, a);
        }`,
    });
    this.group.renderOrder = 8;
  }

  addWindow(center: THREE.Vector3, right: THREE.Vector3, w: number, h: number, inward: THREE.Vector3) {
    this.windows.push({ center: center.clone(), right: right.clone().normalize(), up: new THREE.Vector3(0, 1, 0), w, h, normal: inward.clone().normalize() });
    const geo = new THREE.BufferGeometry();
    // 4 near + 4 far vertices, sides only (a tube along the ray)
    const pos = new Float32Array(8 * 3);
    const along = new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]);
    const cross = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    geo.setAttribute('aCross', new THREE.BufferAttribute(cross, 2));
    // quads connecting near/far edges + far cap for thickness feel
    const idx: number[] = [];
    const q = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d);
    q(0, 1, 5, 4);
    q(1, 2, 6, 5);
    q(2, 3, 7, 6);
    q(3, 0, 4, 7);
    // a mid slice to fill the volume visually
    geo.setIndex(idx);
    const mat = this.mat.clone();
    mat.uniforms = { uColor: this.uniforms.uColor, uTime: this.uniforms.uTime, uLength: this.uniforms.uLength, uIntensity: { value: 0 } };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    this.meshes.push(mesh);
    this.group.add(mesh);
  }

  /** `sunDir` points from the scene toward the sun. */
  update(sunDir: THREE.Vector3, intensity: number, color: THREE.Color, time: number) {
    this.uniforms.uTime.value = time;
    this.uniforms.uColor.value.copy(color);
    const ray = sunDir.clone().negate(); // direction light travels
    let any = false;
    this.windows.forEach((wdef, i) => {
      const mesh = this.meshes[i];
      const facing = ray.dot(wdef.normal); // >0 when light goes inward
      const k = THREE.MathUtils.smoothstep(facing, 0.05, 0.35);
      mesh.visible = k > 0.01 && intensity > 0.01;
      if (!mesh.visible) return;
      any = true;
      const len = Math.min(9, 2.2 / Math.max(0.15, Math.abs(ray.y)) + 1.0);
      const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
      const corners = [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ];
      const tmp = new THREE.Vector3();
      for (let c = 0; c < 4; c++) {
        tmp.copy(wdef.center).addScaledVector(wdef.right, corners[c][0] * wdef.w).addScaledVector(wdef.up, corners[c][1] * wdef.h);
        pos.setXYZ(c, tmp.x, tmp.y, tmp.z);
        const far = tmp.clone().addScaledVector(ray, len);
        // clamp to floor
        if (far.y < 0) {
          const t = tmp.y / Math.max(1e-3, tmp.y - far.y);
          far.lerpVectors(tmp, far, t);
        }
        pos.setXYZ(c + 4, far.x, far.y, far.z);
      }
      pos.needsUpdate = true;
      (mesh.material as THREE.ShaderMaterial).uniforms.uIntensity.value = intensity * k;
    });
    this.group.visible = any;
  }
}
