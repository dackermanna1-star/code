// Rain: GPU-animated streaks in a box that wraps around the camera (no per-frame CPU work), slanted by wind.
// Drops are velocity-aligned camera-facing quads; count scales with the rain amount and effects quality.
import * as THREE from 'three';

const MAX_DROPS = 9000;
const BOX = new THREE.Vector3(46, 26, 46);

const vert = /* glsl */ `
attribute vec4 drop; // xyz = random offset in the box (0..1), w = random 0..1
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uBox;
uniform vec3 uVel;
uniform float uLen;
varying float vA;
varying vec2 vUv;
void main() {
  vec3 p = drop.xyz * uBox + uVel * ( uTime * ( 0.85 + 0.3 * drop.w ) );
  // wrap into a box centred on the camera
  vec3 rel = mod( p - uCam + uBox * 0.5, uBox ) - uBox * 0.5;
  vec3 wp = uCam + rel;
  vec3 dir = normalize( uVel );
  vec3 toCam = normalize( cameraPosition - wp );
  vec3 side = normalize( cross( dir, toCam ) );
  float w = 0.012 + 0.006 * drop.w;
  vec3 pos = wp + side * position.x * w + dir * position.y * uLen;
  vUv = position.xy;
  float d = length( rel );
  vA = ( 1.0 - smoothstep( uBox.x * 0.25, uBox.x * 0.5, d ) ) * smoothstep( 0.5, 2.0, d );
  gl_Position = projectionMatrix * viewMatrix * vec4( pos, 1.0 );
}
`;

const frag = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
varying vec2 vUv;
void main() {
  float edge = 1.0 - abs( vUv.x );
  float a = vA * uOpacity * edge * smoothstep( -0.5, 0.2, vUv.y );
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( uColor, a );
}
`;

export class Rain {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  readonly uniforms = {
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uBox: { value: BOX.clone() },
    uVel: { value: new THREE.Vector3(0, -9, 0) },
    uLen: { value: 0.55 },
    uColor: { value: new THREE.Color(0.55, 0.6, 0.65) },
    uOpacity: { value: 0.32 },
  };
  /** 0..1 fraction of MAX_DROPS allowed by the effects quality setting. */
  quality = 1;

  constructor() {
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    const d = new Float32Array(MAX_DROPS * 4);
    for (let i = 0; i < d.length; i++) d[i] = Math.random();
    this.geo.setAttribute('drop', new THREE.InstancedBufferAttribute(d, 4));
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.name = 'rain';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
  }

  update(dt: number, camera: THREE.Camera, amount: number, wind: number, light: number, underwater: boolean): void {
    const n = Math.floor(MAX_DROPS * this.quality * Math.min(1, amount));
    this.mesh.visible = n > 50 && !underwater;
    this.geo.instanceCount = n;
    if (!this.mesh.visible) return;
    const u = this.uniforms;
    u.uTime.value += dt;
    u.uCam.value.copy(camera.position);
    u.uVel.value.set(wind * 0.35, -9.5, wind * 0.12);
    u.uColor.value.setRGB(0.5, 0.55, 0.6).multiplyScalar(0.4 + 0.8 * light);
    u.uOpacity.value = 0.18 + 0.2 * Math.min(1, amount);
  }
}
