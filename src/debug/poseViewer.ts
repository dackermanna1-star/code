import * as THREE from 'three';
import { CharacterLibrary, CharacterModel } from '../character/library';
import { registerVariants } from '../character/variants';
import { ClipPlayer, getClip, CLIPS } from '../anim/clip';
import { solvePose } from '../anim/solver';
import { Pose } from '../anim/pose';
import { B } from '../anim/skeleton';
import { registerAllClips } from '../anim/lib';

/** Debug page: ?viewer=pose&clip=NAME&t=0.2|strip&n=6&variant=player&cam=3q */
export function runPoseViewer(params: URLSearchParams) {
  const app = document.getElementById('app')!;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  app.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x30343a);
  const hemi = new THREE.HemisphereLight(0xb8c4d8, 0x3a3028, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0dd, 2.4);
  sun.position.set(3, 6, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6;
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x6a6a68, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(40, 40, 0x222222, 0x444444);
  (grid.material as THREE.Material).opacity = 0.35;
  (grid.material as THREE.Material).transparent = true;
  scene.add(grid);

  registerAllClips();
  const lib = new CharacterLibrary();
  const arch = registerVariants(lib);
  lib.build();

  const camName = params.get('cam') ?? '3q';
  const clipName = params.get('clip') ?? 'pose_fight';
  const tParam = params.get('t') ?? '0';
  const variantNames = (params.get('variant') ?? 'player').split(',');
  const allVariants = params.get('all') === '1';
  const n = Number(params.get('n') ?? 6);
  const spacing = Number(params.get('sp') ?? 1.1);

  type Inst = { model: CharacterModel; t: number; x: number; z: number };
  const insts: Inst[] = [];
  const clip = CLIPS.get(clipName) ?? getClip('pose_fight');
  const list = allVariants ? lib.variants.map((v) => v.name) : variantNames;
  if (tParam === 'strip') {
    const vname = list[0];
    for (let i = 0; i < n; i++) {
      const t = (clip.dur * i) / Math.max(1, n - 1);
      const m = new CharacterModel(lib, lib.get(vname));
      insts.push({ model: m, t, x: (i - (n - 1) / 2) * spacing, z: 0 });
    }
  } else {
    list.forEach((vname, i) => {
      const m = new CharacterModel(lib, lib.get(vname));
      insts.push({ model: m, t: Number(tParam), x: (i - (list.length - 1) / 2) * spacing, z: 0 });
    });
  }
  const pose = new Pose();
  for (const inst of insts) {
    scene.add(inst.model.group);
    inst.model.group.position.set(inst.x, 0, inst.z);
    const player = new ClipPlayer(clip);
    const def = inst.model.def;
    const feet: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(inst.x + 0.11, 0, inst.z + 0.1), new THREE.Vector3(inst.x - 0.11, 0, inst.z - 0.1)];
    // use the clip's own first key for feet start
    const k0 = clip.keys[0];
    feet[0].set(inst.x + k0.lf.p[0] * def.scale, 0, inst.z + k0.lf.p[2] * def.scale);
    feet[1].set(inst.x + k0.rf.p[0] * def.scale, 0, inst.z + k0.rf.p[2] * def.scale);
    player.start(inst.x, inst.z, 0, inst.x, inst.z, 0, feet, [k0.lf.yaw * Math.PI / 180, k0.rf.yaw * Math.PI / 180], def);
    player.advance(inst.t);
    player.computeRoot();
    const prm = player.evaluate(def);
    solvePose(def, prm, pose);
    inst.model.applyPose(pose);
    inst.model.group.position.set(player.rootX, 0, player.rootZ);
    inst.model.group.rotation.y = player.rootYaw;
  }
  const label = document.createElement('div');
  label.style.cssText = 'position:fixed;left:8px;top:6px;color:#fff;font:14px monospace;text-shadow:0 1px 2px #000';
  label.textContent = `${clip.name} dur=${clip.dur.toFixed(2)} t=${tParam} variants=${list.length} ${Object.keys(arch).length} archetypes`;
  document.body.appendChild(label);

  const camera = new THREE.PerspectiveCamera(Number(params.get('fov') ?? 35), window.innerWidth / window.innerHeight, 0.05, 100);
  const width = Math.max(2.2, insts.length * spacing);
  const dist = Number(params.get('dist') ?? Math.max(4.2, width * 1.35));
  const target = new THREE.Vector3(0, Number(params.get('ty') ?? 0.95), 0);
  const camDirs: Record<string, [number, number, number]> = {
    front: [0, 0.15, 1], back: [0, 0.15, -1], side: [1, 0.12, 0], rside: [-1, 0.12, 0], '3q': [0.7, 0.25, 0.75], top: [0.01, 1, 0.01], low: [0.6, -0.05, 0.8], face: [0, 0.05, 1],
  };
  const d = new THREE.Vector3(...(camDirs[camName] ?? camDirs['3q'])).normalize();
  if (camName === 'face') {
    target.set(insts[0].x, 1.68, 0);
  }
  camera.position.copy(target).addScaledVector(d, camName === 'face' ? 0.9 : dist);
  camera.lookAt(target);
  renderer.render(scene, camera);
  (window as unknown as { __ready: boolean }).__ready = true;
  void B;
}
