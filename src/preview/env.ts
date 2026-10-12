// Environment preview: the floe, backdrop and lighting with a few placeholder
// characters (capsules on REFLECT_LAYER, casting shadows) and a test decal map.
//
// URL params: q=low|medium|high, decal=0, caps=0, frames=N (stop after N frames),
// anim=1 (move the capsules),
// fp=1 (first person from the hunter's eye; x, z, yaw, pitch in the
// config/firstPerson.ts convention, degrees for the angles). window.poseEye(x, z,
// yawDeg, pitchDeg) re-poses it, window.setView('first' | 'third') switches.
import * as THREE from 'three';
import { Stage, REFLECT_LAYER } from '../render/Stage';
import { Environment } from '../render/env/Environment';
import { FP, type ViewMode } from '../config/firstPerson';

const params = new URLSearchParams(location.search);
const quality = (params.get('q') as 'low' | 'medium' | 'high' | null) ?? 'high';
const stage = new Stage(document.getElementById('app')!);
const env = new Environment(stage, { quality });

// Placeholder characters.
const caps: THREE.Mesh[] = [];
if (params.get('caps') !== '0') {
  const spots: Array<[number, number, number]> = [
    [-10, -5, 0x1f63ff],
    [0, 3, 0x6b4a2e],
    [8, 10, 0xeeeeee],
    [-4, -14, 0x2e8b3a],
    [14, -9, 0xd04020],
    [-16, 11.5, 0x202020],
  ];
  for (const [x, z, color] of spots) {
    const m = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.8, 6, 16),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0 }),
    );
    m.position.set(x, 0.75, z);
    m.castShadow = true;
    m.layers.enable(REFLECT_LAYER);
    stage.scene.add(m);
    caps.push(m);
  }
  // Glossy metal ball to check the environment map.
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 32, 16),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.15, metalness: 1 }),
  );
  ball.position.set(4, 0.6, -3);
  ball.castShadow = true;
  ball.layers.enable(REFLECT_LAYER);
  stage.scene.add(ball);
}

// Test decal: red splats, lane streaks and a scorch mark (premultiplied alpha).
if (params.get('decal') !== '0') {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 384;
  const g = cv.getContext('2d')!;
  const rect = { minX: -20, minZ: -15, sizeX: 40, sizeZ: 30 };
  const toPx = (x: number, z: number) => [((x - rect.minX) / rect.sizeX) * cv.width, ((z - rect.minZ) / rect.sizeZ) * cv.height];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const blob = (x: number, z: number, r: number, color: string) => {
    const [px, py] = toPx(x, z);
    g.fillStyle = color;
    g.beginPath();
    g.arc(px, py, r, 0, Math.PI * 2);
    g.fill();
  };
  // Pools.
  blob(-12, 2, 18, '#a00808');
  blob(-11, 2.6, 10, '#7a0505');
  blob(-2, -8, 12, '#b00a0a');
  // Lane streaks of droplets, spraying left.
  for (const lane of [-6, 6.5]) {
    for (let i = 0; i < 260; i++) {
      const t = rnd();
      blob(-2 - t * 16 + rnd(), lane + (rnd() - 0.5) * 2.5 * (0.4 + t), 1 + rnd() * 2.5, rnd() < 0.5 ? '#c00c0c' : '#8e0606');
    }
  }
  // Scorch mark.
  const [sx, sy] = toPx(10, 4);
  const grad = g.createRadialGradient(sx, sy, 2, sx, sy, 34);
  grad.addColorStop(0, 'rgba(20,14,10,0.95)');
  grad.addColorStop(0.6, 'rgba(40,30,22,0.6)');
  grad.addColorStop(1, 'rgba(40,30,22,0)');
  g.fillStyle = grad;
  g.fillRect(sx - 40, sy - 40, 80, 80);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // canvas row 0 = minZ
  tex.premultiplyAlpha = true;
  env.setDecalMap(tex, rect);
}

if (params.get('only') === 'backdrop') {
  for (const c of env.group.children) if (!(c as THREE.Light).isLight) c.visible = false;
  for (const c of caps) c.visible = false;
}

const anim = params.get('anim') === '1';
stage.onUpdate((dt, time) => {
  env.update(dt, time);
  if (anim) caps.forEach((c, i) => (c.position.x += Math.sin(time * 0.7 + i) * dt * 2));
});

// ---- First person ---------------------------------------------------------
const eye = {
  x: Number(params.get('x') ?? 0),
  z: Number(params.get('z') ?? 0),
  yaw: Number(params.get('yaw') ?? 0),
  pitch: Number(params.get('pitch') ?? 0),
};
const DEG = Math.PI / 180;
/** Pose the first-person camera (works with or without Stage.poseFirstPerson). */
function poseEye(x = eye.x, z = eye.z, yawDeg = eye.yaw, pitchDeg = eye.pitch): void {
  Object.assign(eye, { x, z, yaw: yawDeg, pitch: pitchDeg });
  if (stage.viewMode !== 'first') return;
  const cam = stage.camera;
  cam.fov = FP.fovDeg;
  cam.near = FP.near;
  cam.far = FP.far;
  cam.aspect = stage.viewW / Math.max(1, stage.viewH);
  cam.updateProjectionMatrix();
  const s = stage as unknown as { poseFirstPerson?: (x: number, y: number, z: number, yaw: number, pitch: number) => void };
  if (s.poseFirstPerson) s.poseFirstPerson(x, FP.eyeHeight, z, yawDeg * DEG, pitchDeg * DEG);
  else {
    cam.position.set(x, FP.eyeHeight, z);
    cam.rotation.set(pitchDeg * DEG, yawDeg * DEG + Math.PI / 2, 0, 'YXZ');
    cam.updateMatrixWorld();
  }
}
function setView(mode: ViewMode): void {
  stage.setViewMode(mode);
  poseEye();
}
if (params.get('fp') === '1') setView('first');

const maxFrames = Number(params.get('frames') ?? 0);
if (maxFrames > 0) {
  for (let i = 0; i < maxFrames; i++) stage.frame(1 / 60);
} else {
  stage.start();
}

const info = document.getElementById('info');
if (info) info.textContent = `quality=${quality}`;
Object.assign(window as unknown as Record<string, unknown>, { env, stage, poseEye, setView, THREE });
