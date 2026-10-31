import * as THREE from 'three';
import { CharacterLibrary, CharacterModel } from '../character/library';
import { registerVariants } from '../character/variants';
import { AimPoint, ClipPlayer, getClip } from '../anim/clip';
import { Animator } from '../anim/animator';
import { B } from '../anim/skeleton';
import { registerAllClips } from '../anim/lib';
import { rotY } from '../core/math';
import { PAIRS } from '../anim/lib/paired';

const AIM_LOCAL: Record<string, [number, [number, number, number]]> = {
  head: [B.head, [0, 0.07, 0.07]], jaw: [B.head, [0, -0.01, 0.08]], neck: [B.neck, [0, 0.03, 0.04]], chest: [B.chest, [0, 0.06, 0.11]],
  gut: [B.spine, [0, 0.0, 0.12]], hips: [B.hips, [0, 0, 0.08]], back: [B.chest, [0, 0.05, -0.12]], legs: [B.thighL, [0, -0.25, 0.08]],
};
const PARTNER: Record<string, number> = {
  'p.head': B.head, 'p.neck': B.neck, 'p.chest': B.chest, 'p.hips': B.hips, 'p.handL': B.handL, 'p.handR': B.handR, 'p.farmL': B.farmL, 'p.farmR': B.farmR,
  'p.footL': B.footL, 'p.footR': B.footR, 'p.shinL': B.shinL, 'p.shinR': B.shinR, 'p.uarmL': B.uarmL, 'p.uarmR': B.uarmR,
};

/**
 * Contact sheet: ?viewer=sheet&clip=NAME&n=8&reach=0.9&cam=side&variant=player&tv=brawler0
 * For paired clips (?pair=NAME) both tracks are shown.
 */
export function runSheetViewer(params: URLSearchParams) {
  const app = document.getElementById('app')!;
  const W = window.innerWidth, H = window.innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setScissorTest(true);
  app.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x30343a);
  scene.add(new THREE.HemisphereLight(0xb8c4d8, 0x3a3028, 1.3));
  const sun = new THREE.DirectionalLight(0xfff0dd, 2.0);
  sun.position.set(4, 8, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x6a6a68, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  scene.add(new THREE.GridHelper(30, 30, 0x222222, 0x4a4a4a));
  registerAllClips();
  const lib = new CharacterLibrary();
  registerVariants(lib);
  lib.build();

  const n = Number(params.get('n') ?? 8);
  const cols = Number(params.get('cols') ?? Math.min(4, n));
  const rows = Math.ceil(n / cols);
  const pairName = params.get('pair');
  const pair = pairName ? PAIRS.get(pairName) : null;
  const clipName = pair ? pair.a.name : params.get('clip') ?? 'jab';
  const clip = getClip(clipName);
  const reach = Number(params.get('reach') ?? (pair ? pair.dist : 0.9));
  const aModel = new CharacterModel(lib, lib.get(params.get('variant') ?? 'player'));
  const tModel = new CharacterModel(lib, lib.get(params.get('tv') ?? 'brawler0'));
  scene.add(aModel.group, tModel.group);
  const aAnim = new Animator(aModel.def, aModel);
  const tAnim = new Animator(tModel.def, tModel);
  const showTarget = params.get('notarget') !== '1';
  tModel.group.visible = showTarget;

  const bodyPoint = (anim: Animator, scale: number, p: string, out: THREE.Vector3) => {
    const a = AIM_LOCAL[p];
    if (!a) return false;
    anim.boneLocalToWorld(a[0], new THREE.Vector3(...a[1]).multiplyScalar(scale), out);
    return true;
  };

  const tmax = Number(params.get('tmax') ?? clip.dur);
  const tmin = Number(params.get('tmin') ?? 0);
  const camName = params.get('cam') ?? 'side';
  const pw = Math.floor(W / cols), ph = Math.floor(H / rows);
  const camera = new THREE.PerspectiveCamera(Number(params.get('fov') ?? 32), pw / ph, 0.05, 100);
  for (let i = 0; i < n; i++) {
    const t = tmin + ((tmax - tmin) * i) / Math.max(1, n - 1);
    // reset
    aAnim.initAt(0, 0, 0);
    tAnim.initAt(0, reach, Math.PI);
    const tPlayer = (() => {
      if (pair) {
        const p = tAnim.playClip(getClip(pair.b.name), { originX: 0, originZ: 0, originYaw: 0, halflife: 0.0001 });
        return p;
      }
      return tAnim.playClip(getClip('pose_brawl'), { halflife: 0.0001 });
    })();
    // targets resolve partner points
    const aAim = {
      aimPoint(p: AimPoint, out: THREE.Vector3) {
        if (p.startsWith('p.')) {
          const b = PARTNER[p];
          if (b === undefined) return false;
          tAnim.boneWorld(b, out);
          return true;
        }
        return bodyPoint(tAnim, tModel.def.scale, p, out);
      },
    };
    const tAim = {
      aimPoint(p: AimPoint, out: THREE.Vector3) {
        if (p.startsWith('p.')) {
          const b = PARTNER[p];
          if (b === undefined) return false;
          aAnim.boneWorld(b, out);
          return true;
        }
        return bodyPoint(aAnim, aModel.def.scale, p, out);
      },
    };
    tPlayer.aim = tAim;
    // prime target pose
    tAnim.update(1 / 60, tAnim.rootX, tAnim.rootZ, tAnim.rootYaw);
    const ap = aAnim.playClip(clip, { originX: 0, originZ: 0, originYaw: 0, halflife: 0.0001, aim: aAim });
    if (!pair && clip.warp) {
      // warp so that at contact the root-to-root distance equals `reach` (target fixed at z=reach)
      const r = ap.rootAt(clip.warp[1], { x: 0, z: 0, yaw: 0 });
      ap.setWarp(0, -r.z, 0, aAnim.def);
    }
    aAnim.update(1 / 60, 0, 0, 0);
    // step to time t in small increments so inertialization settles like in game
    const steps = Math.max(1, Math.round(t / (1 / 60)));
    for (let s = 0; s < steps; s++) {
      const dt = t / steps;
      if (pair) {
        tAnim.advanceClip(dt);
        tAnim.update(dt, tPlayer.rootX, tPlayer.rootZ, tPlayer.rootYaw);
      }
      aAnim.advanceClip(dt);
      aAnim.update(dt, ap.rootX, ap.rootZ, ap.rootYaw);
    }
    if (!pair) tAnim.update(1 / 60, 0, reach, Math.PI);
    aModel.group.position.set(ap.rootX, 0, ap.rootZ);
    aModel.group.rotation.y = ap.rootYaw;
    tModel.group.position.set(tAnim.rootX, 0, tAnim.rootZ);
    tModel.group.rotation.y = tAnim.rootYaw;
    // camera
    const mid = new THREE.Vector3(0, Number(params.get('ty') ?? 1.0), reach * 0.5);
    const dist = Number(params.get('dist') ?? 3.6);
    const dirs: Record<string, [number, number, number]> = { side: [1, 0.1, 0], rside: [-1, 0.1, 0], '3q': [0.75, 0.3, -0.6], front: [0.2, 0.15, -1], back: [0.2, 0.2, 1], top: [0.01, 1, 0.01] };
    const d = new THREE.Vector3(...(dirs[camName] ?? dirs.side)).normalize();
    camera.position.copy(mid).addScaledVector(d, dist);
    camera.lookAt(mid);
    const col = i % cols, row = Math.floor(i / cols);
    const x = col * pw, y = H - (row + 1) * ph;
    renderer.setViewport(x, y, pw, ph);
    renderer.setScissor(x, y, pw, ph);
    renderer.render(scene, camera);
  }
  const label = document.createElement('div');
  label.style.cssText = 'position:fixed;left:6px;top:4px;color:#fff;font:13px monospace;text-shadow:0 1px 2px #000';
  label.textContent = `${pairName ?? clipName}  dur=${clip.dur.toFixed(2)} hitT=${clip.hitT} reach=${reach}`;
  document.body.appendChild(label);
  void rotY;
  (window as unknown as { __ready: boolean }).__ready = true;
}
