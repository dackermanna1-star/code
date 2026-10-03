/** Block-breaking crack overlay at several progress values: /debug/cracks.html */
import * as THREE from 'three';
import { CRACK_FRAG, CRACK_VERT } from '../game/overlays';

const W = 1000, H = 300;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6a7890);
const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
cam.position.set(2.6, 3.2, 11.5);
cam.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(3, 5, 4);
scene.add(sun);
const depth = new THREE.DataTexture(new Float32Array([1e6, 0, 0, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
depth.needsUpdate = true;
const stone = new THREE.MeshStandardMaterial({ color: 0x8c8c8c, roughness: 0.9 });
const levels = [0.12, 0.32, 0.52, 0.72, 0.95];
levels.forEach((p, i) => {
  const x = (i - 2) * 2.2;
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), stone);
  cube.position.set(x, 0, 0);
  scene.add(cube);
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: CRACK_VERT, fragmentShader: CRACK_FRAG, transparent: true, depthTest: false, depthWrite: false,
    uniforms: { u_linDepth: { value: depth }, u_res: { value: new THREE.Vector2(W, H) }, u_progress: { value: p }, u_seed: { value: i * 1.7 }, u_boxMin: { value: new THREE.Vector3(x - 0.504, -0.504, -0.504) }, u_boxSize: { value: new THREE.Vector3(1.008, 1.008, 1.008) } },
  });
  const crack = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  crack.frustumCulled = false;
  crack.renderOrder = 1;
  scene.add(crack);
});
renderer.render(scene, cam);
(window as any).__shotReady = true;
