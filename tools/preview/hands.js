// First-person viewmodel preview (renders FpsView over a grey background, crosshair at the centre).
// URL params:
//   w=pistol|revolver|rifle|smg|shotgun|sniper|knife|bat|fists   ads=0..1   sprint=1   crouch=0..1
//   walk=m/s (bob, with step=phase)   air=1 (airborne)   fire=ms (shot that long ago)   empty=1
//   reload=0..1 (progress through one reload; shotgun: one shell)   pump=s   bolt=s (sniper bolt cycle)
//   equip=s | holster=s (time into the switch)
//   melee=slash|stab|swing|jab|haymaker|stomp|kick  phase=windup|charge|strike|recover  u=0..1  charge=0..1  hit=1
//   pitch=deg (view pitch, for the boot)   xhair=0 (hide crosshair)   bg=hex
//   tuning: R=kx,ky,kz,rx,ry,rz  L=...  hip=x,y,z,p,y,r  tR=thumb cmc flex,abd,roll  tL=...
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as OM from '../../src/render/objectMeshes.js';
import { FpsView, GUNS, MELEE_MOVES } from '../../src/render/fpsView.js';

const q = new URLSearchParams(location.search);
const num = (k, d = 0) => (q.has(k) ? +q.get(k) : d);
const list = (k) => (q.has(k) ? q.get(k).split(',').map(Number) : null);
const W = q.get('w') || 'pistol';

// tuning overrides (applied before the weapon is built)
const G = GUNS[W];
if (G) {
  const R = list('R'), L = list('L'), hip = list('hip'), tR = list('tR'), tL = list('tL');
  // R / L = Kx,Ky,Kz (middle knuckle), Wx,Wy,Wz (wrist), [rx,ry,rz]
  if (R) {
    G.R.K = R.slice(0, 3);
    if (R.length > 3) G.R.W = R.slice(3, 6);
    if (R.length > 6) G.R.rot = R.slice(6, 9);
  }
  if (L) {
    G.L.K = L.slice(0, 3);
    if (L.length > 3) G.L.W = L.slice(3, 6);
    if (L.length > 6) G.L.rot = L.slice(6, 9);
  }
  if (hip) {
    G.hip.p = hip.slice(0, 3);
    if (hip.length > 3) G.hip.r = hip.slice(3, 6);
  }
  if (tR) G.R.thumb = tR;
  if (tL) G.L.thumb = tL;
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
document.body.style.background = '#' + (q.get('bg') || '6a6f78');
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);
const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const t0 = performance.now();
const v = new FpsView(OM, innerWidth / innerHeight);
v.setEnvironment(env);
v.setLighting(num('light', 0.75));
v.setWeapon(W);
console.log('[dbg] build ms', (performance.now() - t0).toFixed(0), v.kit && v.kit.trigErr !== undefined ? 'trigger err mm ' + (v.kit.trigErr * 1000).toFixed(1) : '');

const dt = 1 / 60;
const st = {
  ads: num('ads'), sprint: q.get('sprint') === '1', speed: num('walk'), step: num('step'), onGround: q.get('air') !== '1', crouch: num('crouch'),
  look: { dx: num('lookx'), dy: num('looky') }, landed: 0, state: 'idle', stateT: 0, reloadTime: 1.5, perShell: false, empty: q.get('empty') === '1', melee: null, pitch: num('pitch') * Math.PI / 180,
};
if (W === 'shotgun') {
  st.reloadTime = 0.55;
  st.perShell = true;
}
const step = (n, f) => {
  for (let i = 0; i < n; i++) {
    if (f) f(i);
    if (st.speed) st.step += (st.speed * dt) / 1.45;
    v.update(dt, st);
    st.landed = 0;
  }
};
// settle
step(90);
if (q.has('equip') || q.has('holster')) {
  st.state = q.has('equip') ? 'equip' : 'holster';
  const T = num(st.state);
  st.stateT = 0;
  step(Math.round(T / dt), () => (st.stateT += dt));
}
if (q.has('reload')) {
  st.state = 'reload';
  st.stateT = 0;
  const T = num('reload') * st.reloadTime * (st.empty ? 1.12 : 1);
  step(Math.round(T / dt), () => (st.stateT += dt));
}
if (q.has('pump')) {
  v.pump();
  step(Math.round(num('pump') / dt));
}
if (q.has('bolt')) {
  v.fire(1, st.ads);
  step(Math.round(num('bolt') / dt));
}
if (q.has('fire')) {
  v.fire(1, st.ads);
  step(Math.max(1, Math.round(num('fire') / 1000 / dt)));
}
if (q.has('melee') && MELEE_MOVES) {
  const mv = q.get('melee'), M = MELEE_MOVES[mv];
  const phases = ['windup', ...(q.get('phase') === 'charge' || q.has('charge') ? ['charge'] : []), 'strike', 'recover'];
  const target = q.get('phase') || 'strike';
  const m = { move: mv, phase: 'windup', t: 0, charge: num('charge'), hit: false };
  st.melee = m;
  for (const ph of phases) {
    m.phase = ph;
    m.t = 0;
    const dur = ph === 'charge' ? (M.charge || 0.6) * Math.max(0.05, num('charge', 1)) : M[ph];
    const last = ph === target;
    const T = last ? num('u', 0.5) * dur : dur;
    const n = Math.max(1, Math.round(T / dt));
    step(n, () => (m.t += dt));
    if (ph === 'strike' && q.get('hit') === '1' && !m.hit) {
      m.hit = true;
      v.meleeImpact(1);
    }
    if (last) break;
  }
}
renderer.clear();
if (q.get('hideL') === '1') v.armL.root.visible = false;
if (q.has('elbow')) {
  const [eo, ed, eb] = q.get('elbow').split(',').map(Number);
  for (const a of [v.armL, v.armR]) Object.assign(a, { elbowOut: eo, elbowDown: ed, elbowBack: eb });
  step(2);
  renderer.clear();
}
if (q.has('view')) {
  // debug orbit camera round the firing hand: view=yaw,pitch,dist (deg, deg, m)
  const [yw, pt, ds] = q.get('view').split(',').map(Number);
  const target = (q.get('at') === 'L' ? v.armL : v.armR).hand.getWorldPosition(new THREE.Vector3()).lerp(q.get('at') === 'L' ? v.armL.hand.getWorldPosition(new THREE.Vector3()) : v.current.position, 0.5);
  const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.005, 10);
  cam.position.set(Math.sin(yw * Math.PI / 180) * Math.cos(pt * Math.PI / 180), Math.sin(pt * Math.PI / 180), Math.cos(yw * Math.PI / 180) * Math.cos(pt * Math.PI / 180)).multiplyScalar(ds || 0.35).add(target);
  cam.lookAt(target);
  renderer.render(v.scene, cam);
} else v.render(renderer);

// bench=1: JS cost of update() while walking, looking round and firing; triangles drawn
if (q.get('bench') === '1') {
  const b = { ...st, speed: 3, state: 'idle', look: { dx: 0.004, dy: -0.002 } };
  for (let i = 0; i < 120; i++) v.update(dt, b);
  const t1 = performance.now();
  for (let i = 0; i < 1200; i++) {
    b.step += 0.02;
    b.look.dx = Math.sin(i * 0.05) * 0.01;
    if (i % 8 === 0) v.fire(1, 0);
    v.update(dt, b);
  }
  let tris = 0;
  v.scene.traverseVisible((o) => {
    if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  console.log('[dbg] update ms', ((performance.now() - t1) / 1200).toFixed(3), 'tris', Math.round(tris));
}
// sight check: where the rear and front sight land on screen (pixels from the centre)
if (G && v.kit) {
  const S = G.sight;
  const proj = (p) => {
    const w = new THREE.Vector3(...p).applyMatrix4(v.current.matrixWorld).project(v.camera);
    return [((w.x * innerWidth) / 2).toFixed(2), ((w.y * innerHeight) / 2).toFixed(2)];
  };
  console.log('[dbg] sight px rear', proj(S.rear).join(','), 'front', proj(S.front).join(','), 'scope', v.scopeAmount().toFixed(2));
  if (q.has('dbgL')) {
    const inv = v.current.matrixWorld.clone().invert();
    const f = (o) => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).toArray().map((x) => x.toFixed(3)).join(' ');
    console.log('[dbg] L wrist', f(v.armL.hand), 'L midMCP', f(v.armL.digits[1][0]), 'L midPIP', f(v.armL.digits[1][1]), 'R midMCP', f(v.armR.digits[1][0]));
  }
}
if (v.meleeCameraSpace && st.melee) {
  const p = v.meleeCameraSpace(new THREE.Vector3());
  console.log('[dbg] strike point', p.toArray().map((x) => x.toFixed(3)).join(','));
}

// overlays: crosshair and (sniper) scope
const c2 = document.createElement('canvas');
c2.width = innerWidth;
c2.height = innerHeight;
c2.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none';
document.body.appendChild(c2);
const g = c2.getContext('2d');
const cx = innerWidth / 2, cy = innerHeight / 2;
const sc = v.scopeAmount ? v.scopeAmount() : 0;
if (sc > 0) {
  g.fillStyle = `rgba(0,0,0,${sc})`;
  g.beginPath();
  g.rect(0, 0, innerWidth, innerHeight);
  g.arc(cx, cy, innerHeight * 0.42, 0, Math.PI * 2, true);
  g.fill();
}
if (q.get('xhair') !== '0') {
  g.strokeStyle = 'rgba(0,255,90,0.95)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(cx - 14, cy + 0.5);
  g.lineTo(cx - 4, cy + 0.5);
  g.moveTo(cx + 4, cy + 0.5);
  g.lineTo(cx + 14, cy + 0.5);
  g.moveTo(cx + 0.5, cy - 14);
  g.lineTo(cx + 0.5, cy - 4);
  g.moveTo(cx + 0.5, cy + 4);
  g.lineTo(cx + 0.5, cy + 14);
  g.stroke();
  g.fillStyle = 'rgba(0,255,90,0.95)';
  g.fillRect(cx, cy, 1, 1);
}
window.__ready = true;
