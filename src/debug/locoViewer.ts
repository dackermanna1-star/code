import * as THREE from 'three';
import { CharacterLibrary, CharacterModel } from '../character/library';
import { registerVariants } from '../character/variants';
import { MocapDriver } from '../anim/mocapLoco';
import { Animator } from '../anim/animator';
import { registerAllClips } from '../anim/lib';
import { getClip } from '../anim/clip';
import { Pose } from '../anim/pose';
import { LocoStyle } from '../anim/locomotion';
import { B } from '../anim/skeleton';
import { clamp, RNG, rotY } from '../core/math';

/**
 * Strobe viewer: simulates a character moving along a path and leaves pose snapshots.
 * ?viewer=loco&path=line|circle|strafe|back|diag|turn|stopgo|weave|slow|ai|clip&speed=4&style=fight&every=0.1&dur=2
 * path=ai: an enemy circling the player (as ai/enemy.ts does), seed=N for another run.
 * stats=1: no pictures; logs STATS {...}: the hips' accelerations (single-frame spikes = pops),
 * the pelvis' angular speed, where the hips sit under the neck, planted-foot slide (verbose=1
 * logs the first slides).
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
  if (path === 'strafe' || path === 'back' || path === 'diag') { x = -2; yaw = 0; }
  if (path === 'circle') { x = 3; z = 0; yaw = 0; }
  if (path === 'ai') { x = 0; z = -3.4; yaw = 0; }
  if (params.get('mocap') === '1') {
    anim.loco.mocap = new MocapDriver();
    anim.loco.mocap.sway = Number(params.get('sway') ?? (variant.def.spec.fem > 0.5 ? 1 : 0));
    anim.loco.mocap.strideK = Number(params.get('strideK') ?? (variant.def.spec.fem > 0.5 ? 0.9 : 1));
  }
  anim.initAt(x, z, yaw);
  const dt = 1 / 60;
  let tNext = Number(params.get('first') ?? 0.3);
  const snaps: CharacterModel[] = [];
  const totalSteps = Math.round((dur + 0.5) * 60);
  let vx = 0, vz = 0;
  const clipName = params.get('clip');
  let t = 0;
  const film = params.get('film') === '1';
  // ?path=ai: an enemy circling a stationary player at the origin (doCircle in ai/enemy.ts)
  const rng = new RNG(Number(params.get('seed') ?? 7));
  let orbitDir = 1, orbitT = 2, ringR = 3.4, ptX = 0, ptZ = 0, ptT = 0;
  const stats = params.get('stats') === '1';
  const hist: { hx: number; hy: number; hz: number; rx: number; rz: number; ryaw: number; hq: THREE.Quaternion; nx: number; nz: number; move: number; theta: number; info: string }[] = [];
  // planted-foot slide (FK ankle in the world while the locomotion says the foot is planted)
  const slide = { d: 0, t: 0, max: 0, events: 0, prev: [new THREE.Vector3(), new THREE.Vector3()], was: [false, false] };
  const simStep = (step: number) => {
    t = step * dt;
    let tvx = 0, tvz = 0;
    let tyaw = yaw;
    if (path === 'line') { tvx = t > 0.2 ? speed : 0; tyaw = Math.PI / 2; }
    if (path === 'stopgo') { tvx = t > 0.2 && t < 1.2 ? speed : 0; tyaw = Math.PI / 2; }
    if (path === 'strafe') { tvx = t > 0.2 ? speed : 0; tyaw = 0; }
    if (path === 'back') { tvz = t > 0.2 ? -speed : 0; tyaw = 0; }
    if (path === 'diag') { tvx = t > 0.2 ? speed * 0.7 : 0; tvz = t > 0.2 ? -speed * 0.7 : 0; tyaw = 0; }
    if (path === 'circle') {
      const ang = t * speed / 3;
      tvx = -Math.sin(ang) * speed; tvz = Math.cos(ang) * speed; tyaw = Math.atan2(tvx, tvz);
    }
    if (path === 'turn') { tyaw = t > 0.3 ? Math.PI : 0; }
    if (path === 'weave') { tvx = t > 0.2 ? (Math.floor((t - 0.2) / 1.3) % 2 === 0 ? speed : -speed) : 0; tyaw = 0; }
    if (path === 'slow') { tvz = t > 0.2 ? speed * (0.5 + 0.5 * Math.sin(t * 1.3)) : 0; tyaw = 0; }
    let rate = 8;
    if (path === 'ai') {
      // the player wanders a little; the enemy keeps to its ring spot, facing the player
      ptT -= dt;
      if (ptT <= 0) { ptT = rng.range(0.6, 2.2); ptX = rng.range(-1, 1); ptZ = rng.range(-1, 1); }
      orbitT -= dt;
      if (orbitT <= 0) {
        orbitT = rng.range(1.5, 4);
        if (rng.chance(0.4)) orbitDir *= -1;
        ringR = rng.range(2.6, 4.4);
      }
      const ang = Math.atan2(x - ptX, z - ptZ) + orbitDir * 0.35;
      const gx = ptX + Math.sin(ang) * ringR, gz = ptZ + Math.cos(ang) * ringR;
      const dx = gx - x, dz = gz - z;
      const d = Math.hypot(dx, dz);
      const sp = d > 2.5 ? 2.4 : clamp(d * 1.1, 0, 1.5) * speed;
      tvx = d > 0.15 ? (dx / d) * sp : 0;
      tvz = d > 0.15 ? (dz / d) * sp : 0;
      tyaw = Math.atan2(ptX - x, ptZ - z);
      rate = 5;
    }
    // accelerate
    const a = 1 - Math.exp(-rate * dt);
    vx += (tvx - vx) * a;
    vz += (tvz - vz) * a;
    if (path !== 'clip') {
      x += vx * dt;
      z += vz * dt;
      const dy = Math.atan2(Math.sin(tyaw - yaw), Math.cos(tyaw - yaw));
      yaw += dy * (1 - Math.exp(-(path === 'ai' ? 6 : 10) * dt));
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
    if (params.get('dbgarm') === '1' && step % 15 === 0) {
      const fk = anim.fk, d = anim.def;
      const B_ = { ua: 7, ha: 9 };
      const sh = fk.pos[B_.ua], hand = fk.pos[B_.ha], tgt = anim.loco.params.hands[0].pos;
      console.log(`arm step=${step} shoulder=${sh.x.toFixed(2)},${sh.y.toFixed(2)},${sh.z.toFixed(2)} hand=${hand.x.toFixed(2)},${hand.y.toFixed(2)},${hand.z.toFixed(2)} target=${tgt.x.toFixed(2)},${tgt.y.toFixed(2)},${tgt.z.toFixed(2)} reach=${(tgt.distanceTo(sh) / (d.lenUpperArm + d.lenForeArm)).toFixed(2)} armLen=${(d.lenUpperArm + d.lenForeArm).toFixed(3)} guardSm=${anim.loco.guardSm.toFixed(2)}`);
    }
    live.group.position.set(x, 0, z);
    live.group.rotation.y = yaw;
    if (stats) {
      const hp = anim.fk.pos[B.hips], nk = anim.fk.pos[B.neck];
      const [hx, hz] = rotY(hp.x, hp.z, yaw);
      const m = anim.loco.mocap as unknown as { moveSm: number; lvx: number; lvz: number; drop: { x: number }; phase: number; locks: { on: boolean; w: number; step: number }[] } | null;
      const pr = anim.loco.params;
      const info = m ? `drop=${m.drop.x.toFixed(3)} ph=${m.phase.toFixed(2)} hipsY=${pr.hipsPos.y.toFixed(3)} L=${m.locks[0].on ? 1 : 0}/${m.locks[0].w.toFixed(2)}/${m.locks[0].step.toFixed(2)} R=${m.locks[1].on ? 1 : 0}/${m.locks[1].w.toFixed(2)}/${m.locks[1].step.toFixed(2)} lf=${pr.feet[0].pos.x.toFixed(2)},${pr.feet[0].pos.y.toFixed(2)},${pr.feet[0].pos.z.toFixed(2)} rf=${pr.feet[1].pos.x.toFixed(2)},${pr.feet[1].pos.y.toFixed(2)},${pr.feet[1].pos.z.toFixed(2)}` : '';
      for (let k = 0; k < 2; k++) {
        const fp = anim.fk.pos[k === 0 ? B.footL : B.footR];
        const [fx, fz] = rotY(fp.x, fp.z, yaw);
        const lf = anim.loco.feet[k];
        const planted = !lf.swing && lf.plantedTime > 0.04;
        if (planted && slide.was[k]) {
          const dd = Math.hypot(x + fx - slide.prev[k].x, z + fz - slide.prev[k].z);
          slide.d += dd;
          slide.t += dt;
          slide.max = Math.max(slide.max, dd / dt);
          if (dd / dt > 0.25) {
            slide.events++;
            if (params.get('verbose') === '1' && slide.events <= 6) {
              const m = anim.loco.mocap as unknown as { locks: { x: number; z: number; w: number; on: boolean; step: number }[] } | null;
              const lk = m?.locks[k];
              const tp = anim.loco.params.feet[k].pos;
              const [tx, tz] = rotY(tp.x, tp.z, yaw);
              console.log(`SLIDE t=${t.toFixed(2)} foot=${k} v=${(dd / dt).toFixed(2)} fk=${(x + fx).toFixed(3)},${(z + fz).toFixed(3)} y=${fp.y.toFixed(3)} target=${(x + tx).toFixed(3)},${(z + tz).toFixed(3)},${tp.y.toFixed(3)} lock=${lk?.x.toFixed(3)},${lk?.z.toFixed(3)} w=${lk?.w.toFixed(2)} on=${lk?.on} step=${lk?.step.toFixed(2)} planted=${lf.plantedTime.toFixed(2)}`);
            }
          }
        }
        slide.was[k] = planted;
        slide.prev[k].set(x + fx, 0, z + fz);
      }
      hist.push({ hx: x + hx, hy: hp.y, hz: z + hz, rx: x, rz: z, ryaw: yaw, hq: anim.fk.rot[B.hips].clone(), nx: hp.x - nk.x, nz: hp.z - nk.z, move: m ? m.moveSm : 0, theta: m ? Math.atan2(m.lvx, m.lvz) : 0, info });
    }
    if (!film && t >= tNext && snaps.length < 40) {
      tNext += every;
      const m = new CharacterModel(lib, variant);
      m.applyPose(anim.out as Pose);
      m.group.position.set(x, 0, z);
      m.group.rotation.y = yaw;
      scene.add(m.group);
      snaps.push(m);
    }
  };
  const camera = new THREE.PerspectiveCamera(Number(params.get('fov') ?? 35), window.innerWidth / window.innerHeight, 0.05, 200);
  const cam = params.get('cam') ?? 'side';
  if (film) {
    // frame-by-frame review: a camera that tracks the character from a fixed direction
    let step = 0;
    const dirs: Record<string, [number, number, number]> = { side: [0, 0.18, 1], '3q': [0.6, 0.3, 0.8], front: [1, 0.15, 0], back: [-1, 0.15, 0] };
    const dv = new THREE.Vector3(...(dirs[cam] ?? dirs.side)).normalize();
    const dist = Number(params.get('dist') ?? 4.2);
    const place = () => {
      const c = new THREE.Vector3(x, 0.95, z);
      camera.position.copy(c).addScaledVector(dv, dist);
      camera.lookAt(c);
      renderer.render(scene, camera);
    };
    (window as unknown as { __film: { step: (k: number) => void } }).__film = {
      step(k: number) {
        for (let i = 0; i < k; i++) simStep(step++);
        place();
      },
    };
    for (let i = 0; i < Number(params.get('warm') ?? 0); i++) simStep(step++);
    place();
    (window as unknown as { __ready: boolean }).__ready = true;
    return;
  }
  for (let step = 0; step < totalSteps; step++) simStep(step);
  if (stats) {
    // hip motion relative to the root: accelerations (pops show as single-frame spikes), angular
    // velocity spikes of the pelvis, and where the hips sit under the neck (a butt sticking out)
    const n = hist.length;
    const acc: number[] = [], wv: number[] = [], wa: number[] = [];
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qy = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    const pops: string[] = [];
    for (let i = 1; i < n - 1; i++) {
      const p = hist[i - 1], c = hist[i], q = hist[i + 1];
      const rel = (h: typeof c) => [h.hx - h.rx, h.hy, h.hz - h.rz];
      const A = rel(p), C = rel(c), Q = rel(q);
      const ax = (Q[0] - 2 * C[0] + A[0]) / (dt * dt), ay = (Q[1] - 2 * C[1] + A[1]) / (dt * dt), az = (Q[2] - 2 * C[2] + A[2]) / (dt * dt);
      const am = Math.hypot(ax, ay, az);
      acc.push(am);
      // pelvis angular speed in root space
      qa.copy(p.hq);
      qb.copy(c.hq);
      const d = Math.min(1, Math.abs(qa.dot(qb)));
      const w = (2 * Math.acos(d)) / dt;
      wv.push(w);
      if (wv.length > 1) wa.push(Math.abs(w - wv[wv.length - 2]) / dt);
      if (am > 30 && pops.length < 24) pops.push(`t=${(i * dt).toFixed(2)} a=${am.toFixed(0)} (${ax.toFixed(0)},${ay.toFixed(0)},${az.toFixed(0)}) move=${c.move.toFixed(2)} theta=${(c.theta * 57.3).toFixed(0)}\n        prev ${p.info}\n        cur  ${c.info}\n        next ${q.info}`);
    }
    qy.identity();
    void Y;
    const sorted = (v: number[]) => [...v].sort((a, b) => a - b);
    const pct = (v: number[], p: number) => sorted(v)[Math.min(v.length - 1, Math.floor(v.length * p))];
    const nxs = hist.map((h) => h.nx), nzs = hist.map((h) => h.nz);
    const res = {
      path, speed, n,
      accRms: Math.sqrt(acc.reduce((a, b) => a + b * b, 0) / acc.length),
      acc95: pct(acc, 0.95), acc99: pct(acc, 0.99), accMax: Math.max(...acc),
      pops30: acc.filter((a) => a > 30).length, pops60: acc.filter((a) => a > 60).length,
      pelvisW95: pct(wv, 0.95), pelvisWMax: Math.max(...wv), pelvisAcc99: pct(wa, 0.99), pelvisAccMax: Math.max(...wa),
      hipUnderNeckX: [Math.min(...nxs), Math.max(...nxs)], hipUnderNeckZ: [Math.min(...nzs), Math.max(...nzs), nzs.reduce((a, b) => a + b, 0) / n],
      slideMps: slide.d / Math.max(1e-3, slide.t), slideMax: slide.max, slideEvents: slide.events,
      pops,
    };
    console.log('STATS ' + JSON.stringify(res));
  }
  live.group.visible = params.get('live') === '1';
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
