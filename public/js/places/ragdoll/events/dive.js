// Event 4: THE HIGH DIVE. Eight springboards on top of a 60-stud tower over
// the Olympic pool.
//  - Hold Space and let go to jump.
//  - In the air, hold W to tuck and somersault forwards, S to go backwards,
//    and A/D to twist.
//  - Open up again (let go) before you hit the water.
// Five judges score your flips, your twists and above all the entry: straight
// in head first rips through the water, feet first is all right, and a belly
// flop is a disaster (and a very big splash).
import * as THREE from 'three';
import { mat, colorMat, textTex, waterMaterial, V, rnd, clamp } from '../kit.js';
import { aimPhase } from './common.js';
import { POOL } from '../map.js';
import * as A from '../audio.js';
import { TORSO } from '../rag.js';

const Y_TOP = 60, Z_BOARD = 214, BOARD = 9, LANE = 12;
const AIM_SECS = 9, AIR_SECS = 9;
const WY = POOL.y;

function buildVenue(K, E) {
  const P = POOL;
  // the pool: tiled walls and floor, lane ropes, the water
  K.span(P.x0, P.bottom - 2, P.z0, P.x1, P.bottom, P.z1, 'tile');
  for (const [x0, z0, x1, z1] of [[P.x0 - 2, P.z0 - 2, P.x1 + 2, P.z0], [P.x0 - 2, P.z1, P.x1 + 2, P.z1 + 2], [P.x0 - 2, P.z0, P.x0, P.z1], [P.x1, P.z0, P.x1 + 2, P.z1]]) K.span(x0, P.bottom - 2, z0, x1, 0.2, z1, 'tile');
  for (let i = 1; i < 9; i++) K.box(P.x0 + (i * (P.x1 - P.x0)) / 9, P.bottom + 0.05, (P.z0 + P.z1) / 2, 1, 0.1, P.z1 - P.z0 - 6, colorMat(0x1a3a7a, 0.4), { col: false, noShadow: true });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(P.x1 - P.x0, P.z1 - P.z0).rotateX(-Math.PI / 2), waterMaterial(0x2a9ad8, { repeat: [10, 6], opacity: 0.78 }));
  water.position.set((P.x0 + P.x1) / 2, WY, (P.z0 + P.z1) / 2); water.renderOrder = 1;
  K.group.add(water);
  // the deck round the pool
  K.span(P.x0 - 30, 0, 186, P.x1 + 30, 0.2, P.z0 - 2, 'whiteTile');
  K.span(P.x0 - 30, 0, P.z1 + 2, P.x1 + 30, 0.2, 300, 'whiteTile');
  for (const s of [-1, 1]) K.span(s > 0 ? P.x1 + 2 : P.x0 - 30, 0, P.z0 - 2, s > 0 ? P.x1 + 30 : P.x0 - 2, 0.2, P.z1 + 2, 'whiteTile');
  // the tower: concrete legs, the 30 and 60 platforms, the springboards
  const tz0 = 196, tz1 = Z_BOARD;
  for (const x of [-50, -25, 0, 25, 50]) for (const z of [tz0 + 1.5, tz1 - 1.5]) K.box(x, Y_TOP / 2, z, 3, Y_TOP, 3, 'concrete');
  K.span(-52, Y_TOP - 2, tz0, 52, Y_TOP, tz1, 'concrete');
  K.span(-52, Y_TOP, tz0, 52, Y_TOP + 0.15, tz1, 'whiteTile', { col: false });
  K.span(-52, 28, tz0, 52, 30, tz1 - 2, 'concrete');
  for (const s of [-1, 1]) K.span(s * 52 - 0.3, Y_TOP, tz0, s * 52 + 0.3, Y_TOP + 4, tz1, 'steel');
  K.span(-52, Y_TOP, tz0 - 0.3, 52, Y_TOP + 4, tz0 + 0.3, 'steel');
  const boards = [];
  for (let i = 0; i < 8; i++) {
    const x = -42 + i * LANE;
    K.box(x, Y_TOP + 0.35, Z_BOARD + BOARD / 2, 3.2, 0.5, BOARD, colorMat(0xf2f2ee, 0.5));
    K.box(x, Y_TOP + 0.62, Z_BOARD + BOARD / 2, 3, 0.05, BOARD, colorMat(0x2a6fd6, 0.8), { col: false });
    boards.push(V(x, Y_TOP + 0.6, Z_BOARD + BOARD - 1));
  }
  // a big number on the tower
  const t = textTex(['60'], { w: 256, h: 256, bg: '#1a3a7a', fg: '#ffffff', size: 180 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ map: t }));
  m.position.set(0, Y_TOP - 8, tz1 + 0.05); K.group.add(m);
  // stairs up the side (to look at)
  for (let i = 0; i < 30; i++) K.box(56, i * 2 + 1, tz0 + 4 + (i % 2) * 8, 4, 0.5, 8, 'darkSteel', { col: false });
  // grandstands: south and east, full of people
  for (let row = 0; row < 10; row++) {
    const z = P.z1 + 18 + row * 3.2, y = 1 + row * 1.7;
    K.span(P.x0 - 20, 0, z - 1.6, P.x1 + 20, y, z + 1.6, 'concrete', { col: false });
    for (let x = P.x0 - 18; x < P.x1 + 18; x += 2.3) if (Math.random() < 0.8) E.park.crowd.seat(x, y, z, Math.PI);
    const x2 = P.x1 + 32 + row * 3.2;
    K.span(x2 - 1.6, 0, P.z0 - 10, x2 + 1.6, y, P.z1 + 10, 'concrete', { col: false });
    for (let z2 = P.z0 - 8; z2 < P.z1 + 8; z2 += 2.3) if (Math.random() < 0.75) E.park.crowd.seat(x2, y, z2, Math.PI / 2);
  }
  E.park.flags.add(-58, 0, 300, 14, 0.3); E.park.flags.add(58, 0, 300, 14, 0.3);
  return { boards, water: [{ x0: P.x0, x1: P.x1, z0: P.z0, z1: P.z1, y: WY, bottom: P.bottom }] };
}

/** How the torso is pointing as it goes in: 'rip' (head first, straight), 'pencil' (feet first), 'flop' (flat) or 'ok'. */
function entryKind(rag) {
  const q = rag.torso.quaternion;
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
  const front = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
  if (up.y < -0.8) return 'rip';
  if (up.y > 0.8) return 'pencil';
  if (Math.abs(front.y) > 0.72) return front.y < 0 ? 'belly' : 'back';
  return 'ok';
}
const ENTRY = { rip: [2.0, 'RIP ENTRY!', '#7cf0ff'], pencil: [1.35, 'PENCIL DIVE', '#ffffff'], ok: [1.0, 'ENTRY', '#ffffff'], belly: [0.35, 'BELLY FLOP!', '#ff7a6a'], back: [0.4, 'BACK FLOP!', '#ff7a6a'] };

export default {
  id: 'dive', name: 'High Dive', icon: '🤿', color: '#4fc8ff',
  where: 'The Aquatics Centre · 60 studs up',
  desc: 'Jump off the top board. Somersault and twist on the way down, then go in straight and head first. Five judges are watching.',
  keys: [['Space', 'hold for spring, let go to jump'], ['W', 'tuck & flip forwards'], ['S', 'flip backwards'], ['A D', 'twist']],
  time: AIM_SECS + AIR_SECS + 3, higher: true, camDist: 22,
  fmt: (a) => (a.entered ? `${a.score.toFixed(1)}` : 'no dive'),
  live: (a) => (a.entered ? a.score.toFixed(1) : a.launched ? 'diving' : '–'),

  build(K, E) { return buildVenue(K, E); },

  shots: () => [
    { from: V(-60, 8, 300), to: V(-20, 20, 290), look: V(0, 40, 210), secs: 2.8 },
    { from: V(40, Y_TOP + 26, 190), to: V(10, Y_TOP + 16, 196), look: V(0, Y_TOP, 220), look2: V(0, 0, 250), secs: 2.8 },
  ],

  enter(E, ev) {
    ev.ath.forEach((a, k) => {
      a.b = ev.venue.boards[k % 8];
      a.flip = 0; a.twist = 0; a.entered = false;
      E.stand(a.p, V(a.b.x, a.b.y, a.b.z - (k >= 8 ? 5 : 0)), Math.PI, true);
    });
  },
  spectate: () => ({ position: V(rnd(-60, -50), 0.3, rnd(240, 260)), yaw: Math.PI / 2 }),

  start(E, ev) {
    ev.aimLeft = AIM_SECS;
    const me = ev.ath.find((a) => a.p.isLocal);
    if (me) {
      E.shot(V(me.b.x + 16, Y_TOP + 8, me.b.z - 14), V(me.b.x - 4, Y_TOP - 18, me.b.z + 22), 4);
      E.ui.hint('hold <b>SPACE</b> for spring, let go to jump · then <b>W</b> / <b>S</b> flip, <b>A</b><b>D</b> twist');
      E.ui.myScore('–', '', 'DIVE SCORE');
    }
    A.whistle();
  },

  update(E, ev, dt) {
    ev.aimLeft -= dt;
    const me = ev.ath.find((a) => a.p.isLocal);
    const waiting = aimPhase(E, ev, dt, {
      label: 'SPRING',
      aim: () => {},
      botAim: (a) => {
        const s = a.bot.skill;
        a.bot.power = clamp(rnd(0.5, 0.85) + s * 0.2, 0.3, 1);
        a.bot.at = rnd(1.5, AIM_SECS - 1);
        a.bot.flips = Math.floor(rnd(1, 2.6 + s)); a.bot.dir = Math.random() < 0.7 ? 1 : -1;
        a.bot.twist = Math.random() < s * 0.5 ? (Math.random() < 0.5 ? 1 : -1) : 0;
      },
      launch: (a, pw) => {
        const rag = E.ragdoll(a);
        rag.setVelocity(0, 16 + 22 * pw, 6 + 8 * pw);
        rag.pose('layout', 0.25);
        a.right = V(-1, 0, 0); // (facing +z, the right hand is towards -x)
        a.jumpT = ev.t;
        A.boing(rag.position);
        if (a.p.isLocal) {
          E.ui.hint('hold <b>W</b> flip forwards · <b>S</b> backwards · <b>A</b><b>D</b> twist · let go to straighten');
          // from the side, following the fall
          E.shot(() => { const p = a.rag?.alive ? a.rag.position : a.b; return V(p.x + 30, Math.max(WY + 6, p.y + 4), 238); }, () => (a.rag?.alive ? a.rag.position : a.b).clone(), 6, { lookLerp: 25 });
        }
      },
    });
    if (waiting) ev.timer = Math.max(0, ev.aimLeft);
    else { ev.airT = (ev.airT ?? AIR_SECS) - dt; ev.timer = ev.airT; }
    ev.status = me && !me.launched ? 'Hold SPACE and let go to jump' : me && !me.entered ? 'W / S to flip, A / D to twist, let go to straighten!' : 'Splash!';
    let busy = 0;
    for (const a of ev.ath) {
      if (!a.launched) { busy++; continue; }
      if (a.done) continue;
      const rag = a.rag;
      if (!rag?.alive) { a.done = true; continue; }
      const T = rag.torso, w = T.angularVelocity;
      if (!a.entered) {
        // the controls
        let fl = 0, tw = 0;
        if (a.p.isLocal) { fl = (E.held('w') ? 1 : 0) - (E.held('s') ? 1 : 0); tw = (E.held('d') ? 1 : 0) - (E.held('a') ? 1 : 0); }
        else if (a.bot) {
          const t = ev.t - a.jumpT, need = (a.bot.flips * Math.PI * 2) / 9.5 + 0.2;
          if (t > 0.15 && t < need * (0.9 + a.bot.skill * 0.15)) { fl = a.bot.dir; tw = a.bot.twist; }
        }
        const right = a.right;
        if (fl) {
          if (rag.poseName !== 'tuck') rag.pose('tuck', 0.32);
          // spin up about the side-to-side axis (forwards: head goes down towards +z)
          const cur = w.x * right.x + w.y * right.y + w.z * right.z, want = -fl * 9.5;
          const d = (want - cur) * Math.min(1, dt * 6);
          w.x += right.x * d; w.y += right.y * d; w.z += right.z * d;
        } else if (rag.poseName !== 'layout') {
          rag.pose('layout', 0.3);
        }
        if (!fl) { const cur = w.x * right.x + w.y * right.y + w.z * right.z; const d = -cur * Math.min(1, dt * 1.6); w.x += right.x * d; w.y += right.y * d; w.z += right.z * d; }
        if (tw) {
          const q = T.quaternion, up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
          const cur = w.x * up.x + w.y * up.y + w.z * up.z, d = (tw * 8 - cur) * Math.min(1, dt * 5);
          w.x += up.x * d; w.y += up.y * d; w.z += up.z * d;
        }
        // count the rotations
        const q = T.quaternion, up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
        a.flip += (w.x * right.x + w.y * right.y + w.z * right.z) * dt * E.timeScale;
        a.twist += (w.x * up.x + w.y * up.y + w.z * up.z) * dt * E.timeScale;
        const p = rag.position;
        // slow motion for the local entry
        if (a.p.isLocal && !a.slow && p.y < WY + 9 && T.velocity.y < -20) { a.slow = true; E.slowmo(0.3, 0.7); }
        if (p.y < WY + 0.2 || rag.bodies[1].position.y < WY) {
          a.entered = true;
          const kind = entryKind(rag);
          const halfFlips = Math.floor(Math.abs(a.flip) / Math.PI + 0.25), halfTwists = Math.floor(Math.abs(a.twist) / Math.PI + 0.25);
          const [mult, label, col] = ENTRY[kind];
          const raw = (12 + Math.min(10, halfFlips) * 9 + Math.min(8, halfTwists) * 5) * mult;
          // five judges, each a little different; the top and bottom marks are dropped
          a.cards = [0, 1, 2, 3, 4].map(() => clamp(Math.round((raw / 9 + rnd(-0.8, 0.8)) * 2) / 2, 0, 10));
          const s = [...a.cards].sort((x, y) => x - y);
          a.score = (s[1] + s[2] + s[3]) * 3.3 * (1 + Math.min(10, halfFlips) * 0.06);
          a.kind = kind;
          const v = -T.velocity.y;
          const flat = kind === 'belly' || kind === 'back';
          E.fx.splash(V(p.x, WY, p.z), flat ? 2.6 : kind === 'rip' ? 0.6 : 1.4, WY);
          A.splash(p, flat ? 2 : kind === 'rip' ? 0.5 : 1.2);
          const desc = `${halfFlips >= 2 ? `${(halfFlips / 2).toFixed(1).replace('.0', '')} somersault${halfFlips >= 4 ? 's' : ''}` : ''}${halfTwists >= 2 ? `${halfFlips >= 2 ? ', ' : ''}${(halfTwists / 2).toFixed(1).replace('.0', '')} twist${halfTwists >= 4 ? 's' : ''}` : ''}`;
          E.ui.pop(label, V(p.x, WY + 6, p.z), col, a.p.isLocal ? 34 : 20, 1.8);
          if (flat) { A.ooh(1); if (v > 40 && a.p.isLocal) E.shake(1.2); } else if (kind === 'rip') A.cheer(1.1); else A.cheer(0.6);
          E.park.crowd.excite(flat ? 0.6 : 1);
          if (a.p.isLocal) {
            E.ui.judges(a.cards);
            E.ui.myScore(a.score.toFixed(1), '', 'DIVE SCORE');
            E.ui.toast(`${label}${desc ? ` · ${desc}` : ''}`, col, 3.5);
            E.ui.hint('');
          }
        }
      }
      if (a.entered) {
        a.inT = (a.inT || 0) + dt;
        if (a.inT > 2.2) { a.done = true; rag.pose(null); continue; }
      } else if (ev.t - a.launchT > AIR_SECS - 0.5 || rag.position.y < WY - 5) {
        a.done = true; a.score = 0; continue;
      }
      busy++;
    }
    return !busy && ev.t > 2;
  },

  resultCam: (E, ev, w) => [() => V(w.b.x + 20 + Math.sin(E.phaseT * 0.2) * 5, 14, 262), () => (w.rag?.alive ? w.rag.position : w.b).clone()],
  finish(E) { E.ui.judges(null); },
  leave(E, ev) { for (const a of ev.ath) a.rag?.pose(null); },
};
void mat; void TORSO;
