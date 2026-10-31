import * as THREE from 'three';
import { CharacterLibrary, CharacterModel } from '../character/library';
import { registerVariants } from '../character/variants';
import { Animator } from '../anim/animator';
import { registerAllClips } from '../anim/lib';
import { getClip } from '../anim/clip';
import { Pose } from '../anim/pose';
import { LocoStyle } from '../anim/locomotion';

/**
 * Strobe viewer: simulates a character moving along a path and leaves pose snapshots.
 * ?viewer=loco&path=line|circle|strafe|turn|stopgo|clip&speed=4&style=fight&every=0.1&dur=2
 */
export function runLocoViewer(params: URLSearchParams) {
  const app = document.getElementById('app')!;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  app.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x30343a);
  scene.add(new THREE.HemisphereLight(0xb8c4d8, 0x3a3028, 1.2));
  const sun = new THREE.DirectionalLight(0xfff0dd, 2.2);
  sun.position.set(3, 8, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10;
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x6a6a68, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  scene.add(new THREE.GridHelper(60, 60, 0x222222, 0x4a4a4a));
  registerAllClips();
  const lib = new CharacterLibrary();
  registerVariants(lib);
  lib.build();

  const variant = lib.get(params.get('variant') ?? 'player');
  const path = params.get('path') ?? 'line';
  const speed = Number(params.get('speed') ?? 4);
  const every = Number(params.get('every') ?? 0.1);
  const dur = Number(params.get('dur') ?? 2);
  const style = (params.get('style') ?? 'fight') as LocoStyle;
  const live = new CharacterModel(lib, variant);
  scene.add(live.group);
  const anim = new Animator(variant.def, live);
  anim.locoIn.style = style;
  anim.locoIn.guard = Number(params.get('guard') ?? 1);
  let x = 0, z = 0, yaw = 0;
  if (path === 'line' || path === 'stopgo') { x = -4; yaw = Math.PI / 2; }
  if (path === 'strafe') { x = -2; yaw = 0; }
  if (path === 'circle') { x = 3; z = 0; yaw = 0; }
  anim.initAt(x, z, yaw);
  const dt = 1 / 60;
  let tNext = Number(params.get('first') ?? 0.3);
  const snaps: CharacterModel[] = [];
  const totalSteps = Math.round((dur + 0.5) * 60);
  let vx = 0, vz = 0;
  const clipName = params.get('clip');
  let t = 0;
  for (let step = 0; step < totalSteps; step++) {
    t = step * dt;
    let tvx = 0, tvz = 0;
    let tyaw = yaw;
    if (path === 'line') { tvx = t > 0.2 ? speed : 0; tyaw = Math.PI / 2; }
    if (path === 'stopgo') { tvx = t > 0.2 && t < 1.2 ? speed : 0; tyaw = Math.PI / 2; }
    if (path === 'strafe') { tvx = t > 0.2 ? speed : 0; tyaw = 0; }
    if (path === 'circle') {
      const ang = t * speed / 3;
      tvx = -Math.sin(ang) * speed; tvz = Math.cos(ang) * speed; tyaw = Math.atan2(tvx, tvz);
    }
    if (path === 'turn') { tyaw = t > 0.3 ? Math.PI : 0; }
    // accelerate
    const a = 1 - Math.exp(-8 * dt);
    vx += (tvx - vx) * a;
    vz += (tvz - vz) * a;
    if (path !== 'clip') {
      x += vx * dt;
      z += vz * dt;
      const dy = Math.atan2(Math.sin(tyaw - yaw), Math.cos(tyaw - yaw));
      yaw += dy * (1 - Math.exp(-10 * dt));
      anim.locoIn.velX = vx;
      anim.locoIn.velZ = vz;
    }
    if (clipName && path === 'clip' && step === 20) anim.playClip(getClip(clipName), {});
    if (anim.mode === 'clip' && anim.clip) {
      anim.advanceClip(dt);
      x = anim.clip.rootX; z = anim.clip.rootZ; yaw = anim.clip.rootYaw;
      if (anim.clip.done) anim.toLoco(0.1);
    }
    anim.update(dt, x, z, yaw);
    live.group.position.set(x, 0, z);
    live.group.rotation.y = yaw;
    if (t >= tNext && snaps.length < 40) {
      tNext += every;
      const m = new CharacterModel(lib, variant);
      m.applyPose(anim.out as Pose);
      m.group.position.set(x, 0, z);
      m.group.rotation.y = yaw;
      scene.add(m.group);
      snaps.push(m);
    }
  }
  live.group.visible = params.get('live') === '1';
  const camera = new THREE.PerspectiveCamera(Number(params.get('fov') ?? 35), window.innerWidth / window.innerHeight, 0.05, 200);
  const cam = params.get('cam') ?? 'side';
  const box = new THREE.Box3();
  for (const s of snaps) box.expandByPoint(s.group.position);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const d = Number(params.get('dist') ?? Math.max(5, size.length() * 1.4));
  const dirs: Record<string, [number, number, number]> = { side: [0, 0.18, 1], top: [0.01, 1, 0.01], '3q': [0.6, 0.35, 0.8], front: [1, 0.15, 0], back: [-1, 0.15, 0] };
  const dv = new THREE.Vector3(...(dirs[cam] ?? dirs.side)).normalize();
  c.y = 0.9;
  camera.position.copy(c).addScaledVector(dv, d);
  camera.lookAt(c);
  renderer.render(scene, camera);
  (window as unknown as { __ready: boolean }).__ready = true;
}
