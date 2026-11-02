import * as THREE from 'three';
import type { Game } from '../game';
import type { Fighter } from '../combat/fighter';
import { B, BONE_NAMES } from '../anim/skeleton';
import { rotY } from '../core/math';
import { solvePose, solverDebug } from '../anim/solver';
import { Pose } from '../anim/pose';

/**
 * Animation quality probe for automated playtests. Every frame it samples each animated fighter's
 * world-space bones and flags:
 *  - pops: a single-frame angular-velocity spike on a bone (a visible discontinuity, as opposed to a
 *    fast but continuous swing), with the animation context before/after;
 *  - hip jumps: single-frame spikes in hip velocity;
 *  - foot skate: a foot that should be planted (locomotion stance, or touching the floor in a clip)
 *    sliding across the ground.
 */
const BONES = [B.hips, B.spine, B.chest, B.neck, B.head, B.uarmL, B.farmL, B.handL, B.uarmR, B.farmR, B.handR, B.thighL, B.shinL, B.footL, B.thighR, B.shinR, B.footR];

interface Track {
  q: THREE.Quaternion[][]; // [frameSlot][bone]
  hips: THREE.Vector3[];
  w: number[][]; // angular speed history [slot][bone]
  hv: number[];
  ctx: string[];
  frames: number;
  feet: { pos: THREE.Vector3; planted: boolean; heelUp: boolean }[];
  arm: string[];
  ev: string[];
  legs: string[];
  clipP: string[];
}

export interface PopEvent {
  frame: number;
  who: string;
  bone: string;
  w: number;
  before: number;
  after: number;
  ctxBefore: string;
  ctx: string;
  ev?: string;
}

export class AnimProbe {
  tracks = new Map<Fighter, Track>();
  pops: PopEvent[] = [];
  hipJumps: PopEvent[] = [];
  frame = 0;
  slide = { loco: 0, locoPlantedT: 0, clip: 0, clipContactT: 0, worst: [] as { who: string; ctx: string; speed: number; frame: number }[] };
  transitions = new Map<string, number>();
  armDumps: string[] = [];
  legDumps: string[] = [];
  heelSkates: string[] = [];
  skateDumps: string[] = [];
  clipDumps: string[] = [];
  hipDumps: string[] = [];
  locoSlideBy: Record<string, { d: number; t: number; miss: number; maxMiss: number }> = { heelUp: { d: 0, t: 0, miss: 0, maxMiss: 0 }, toesUp: { d: 0, t: 0, miss: 0, maxMiss: 0 }, flat: { d: 0, t: 0, miss: 0, maxMiss: 0 }, blend: { d: 0, t: 0, miss: 0, maxMiss: 0 } };
  popByTransition = new Map<string, number>();
  private _q = new THREE.Quaternion();
  private tmpPose = new Pose();
  private _p = new THREE.Vector3();

  constructor(public game: Game) {}

  private label(f: Fighter) {
    return f === this.game.player ? 'player' : ((f as unknown as { cfg?: { key: string } }).cfg?.key ?? 'enemy');
  }
  private context(f: Fighter) {
    const a = f.anim;
    if (a.mode === 'clip') return 'clip:' + (a.clip?.clip.name ?? '?');
    return a.mode;
  }

  sample(dt: number) {
    this.frame++;
    if (dt <= 0) return;
    const g = this.game;
    for (const f of g.fighters) {
      if (!f.alive || f.anim.mode === 'external' || f.anim.mode === 'frozen') {
        this.tracks.delete(f);
        continue;
      }
      let t = this.tracks.get(f);
      if (!t) {
        t = { q: [[], [], []], hips: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], w: [[], [], []], hv: [0, 0, 0], ctx: ['', '', ''], frames: 0, feet: [{ pos: new THREE.Vector3(), planted: false, heelUp: false }, { pos: new THREE.Vector3(), planted: false, heelUp: false }], arm: ['', '', ''], ev: ['', '', ''], legs: ['', '', ''], clipP: ['', '', ''] };
        for (let s = 0; s < 3; s++) for (let i = 0; i < BONES.length; i++) {
          t.q[s].push(new THREE.Quaternion());
          t.w[s].push(0);
        }
        this.tracks.set(f, t);
      }
      // shift history
      t.q.unshift(t.q.pop()!);
      t.w.unshift(t.w.pop()!);
      t.hips.unshift(t.hips.pop()!);
      t.hv.unshift(t.hv.pop()!);
      t.ctx.unshift(t.ctx.pop()!);
      const fk = f.anim.fk;
      const rootQ = this._q.setFromAxisAngle(_Y, f.yaw);
      for (let i = 0; i < BONES.length; i++) {
        const cur = t.q[0][i].copy(rootQ).multiply(fk.rot[BONES[i]]);
        if (t.frames > 0) {
          const d = Math.min(1, Math.abs(cur.dot(t.q[1][i])));
          t.w[0][i] = (2 * Math.acos(d)) / dt;
        } else t.w[0][i] = 0;
      }
      const hp = fk.pos[B.hips];
      const [hx, hz] = rotY(hp.x, hp.z, f.yaw);
      t.hips[0].set(f.x + hx, hp.y, f.z + hz);
      t.hv[0] = t.frames > 0 ? t.hips[0].distanceTo(t.hips[1]) / dt : 0;
      t.ctx[0] = this.context(f);
      t.arm.unshift(t.arm.pop()!);
      t.ev.unshift(t.ev.pop()!);
      t.ev[0] = f.anim.mode === 'loco' ? f.anim.loco.events.join(',') : '';
      t.clipP.unshift(t.clipP.pop()!);
      if (f.anim.mode === 'clip' && f.anim.clip) {
        const c = f.anim.clip;
        const pr = c.params;
        const v = (x: THREE.Vector3) => `${x.x.toFixed(2)},${x.y.toFixed(2)},${x.z.toFixed(2)}`;
        t.clipP[0] = `f=${f.x.toFixed(2)},${f.z.toFixed(2)} t=${c.time.toFixed(3)} root=${c.rootX.toFixed(2)},${c.rootZ.toFixed(2)},${(c.rootYaw * 57.3).toFixed(0)} fyaw=${(f.yaw * 57.3).toFixed(0)} hips=${v(pr.hipsPos)} L=${v(pr.hands[0].pos)} pl=${v(pr.hands[0].pole)} R=${v(pr.hands[1].pos)} pr=${v(pr.hands[1].pole)} lf=${v(pr.feet[0].pos)} rf=${v(pr.feet[1].pos)}`;
      } else t.clipP[0] = '';
      t.legs.unshift(t.legs.pop()!);
      if (f.anim.mode === 'loco') {
        const L = f.anim.loco;
        const pr = L.params;
        const e = new THREE.Euler();
        const leg = (k: number) => {
          const fp = pr.feet[k];
          e.setFromQuaternion(fp.rot, 'YXZ');
          const lf = L.feet[k];
          return `${k}:${lf.swing ? 'S' : 'P'} t=${lf.t.toFixed(2)} st=${lf.stanceT.toFixed(2)} pos=${fp.pos.x.toFixed(2)},${fp.pos.y.toFixed(2)},${fp.pos.z.toFixed(2)} rot=${(e.x * 57.3).toFixed(0)}/${(e.y * 57.3).toFixed(0)}/${(e.z * 57.3).toFixed(0)} pole=${fp.pole.x.toFixed(2)},${fp.pole.y.toFixed(2)},${fp.pole.z.toFixed(2)} fyaw=${(lf.yaw * 57.3).toFixed(0)} toe=${fp.toe.toFixed(0)}`;
        };
        e.setFromQuaternion(pr.hipsRot, 'YXZ');
        t.legs[0] = `root=${(f.yaw * 57.3).toFixed(0)} hips=${pr.hipsPos.x.toFixed(2)},${pr.hipsPos.y.toFixed(2)},${pr.hipsPos.z.toFixed(2)} hrot=${(e.x * 57.3).toFixed(0)}/${(e.y * 57.3).toFixed(0)}/${(e.z * 57.3).toFixed(0)} | ${leg(0)} | ${leg(1)}`;
      } else t.legs[0] = '';
      if (f.anim.mode === 'loco') {
        // re-solve the locomotion params with the debug capture on
        solverDebug.on = true;
        solvePose(f.def, f.anim.loco.params, this.tmpPose);
        solverDebug.on = false;
        const A = solverDebug.arms[0];
        const r = (a: number[]) => a.map((v) => v.toFixed(4)).join(',');
        t.arm[0] = `pos ${r(A.pos)} pole ${r(A.pole)} sh ${r(A.sh)} bend ${r(A.bend)} dir1 ${r(A.dir1)} dir2 ${r(A.dir2)}`;
      } else t.arm[0] = '';
      if (t.frames > 0 && t.ctx[0] !== t.ctx[1]) {
        const key = `${simplify(t.ctx[1])} -> ${simplify(t.ctx[0])}`;
        this.transitions.set(key, (this.transitions.get(key) ?? 0) + 1);
      }
      t.frames++;
      // spikes are judged one frame late (need the frame after)
      if (t.frames >= 3) {
        for (let i = 0; i < BONES.length; i++) {
          const w = t.w[1][i], before = t.w[2][i], after = t.w[0][i];
          const limit = i <= 4 ? 4 : 7;
          if (w > limit && w > 2.6 * Math.max(before, after, 1.2)) {
            const ev: PopEvent = { frame: this.frame - 1, who: this.label(f), bone: BONE_NAMES[BONES[i]], w, before, after, ctxBefore: t.ctx[2], ctx: t.ctx[1], ev: `[${t.ev[2]}|${t.ev[1]}|${t.ev[0]}]` };
            this.pops.push(ev);
            if (t.ctx[1].startsWith("clip") && t.ctx[1] === t.ctx[2] && w > 60 && this.clipDumps.length < 16) this.clipDumps.push(`${ev.who} ${ev.bone} w=${w.toFixed(0)} (${before.toFixed(1)}/${after.toFixed(1)}) ${t.ctx[1]} @${ev.frame}\n  t-2 ${t.clipP[2]}\n  t-1 ${t.clipP[1]}\n  t   ${t.clipP[0]}`);
            if (t.ctx[1] === 'loco' && t.ctx[2] === 'loco' && i >= 11 && w > 25 && this.legDumps.length < 10) this.legDumps.push(`${ev.who} ${ev.bone} w=${w.toFixed(0)} ${ev.ev} @${ev.frame}\n  t-2 ${t.legs[2]}\n  t-1 ${t.legs[1]}\n  t   ${t.legs[0]}`);
            if (t.ctx[1] === 'loco' && t.ctx[2] === 'loco' && i >= 5 && i <= 10 && this.armDumps.length < 6) this.armDumps.push(`${ev.who} ${ev.bone} @${ev.frame}\n  t-1 ${t.arm[2]}\n  t   ${t.arm[1]}\n  t+1 ${t.arm[0]}`);
            const key = t.ctx[2] !== t.ctx[1] ? `${simplify(t.ctx[2])} -> ${simplify(t.ctx[1])}` : `within ${simplify(t.ctx[1])}`;
            this.popByTransition.set(key, (this.popByTransition.get(key) ?? 0) + 1);
          }
        }
        const hv = t.hv[1];
        if (hv > 2.5 && hv > 3 * Math.max(t.hv[2], t.hv[0], 0.6)) {
          this.hipJumps.push({ frame: this.frame - 1, who: this.label(f), bone: 'hips(pos)', w: hv, before: t.hv[2], after: t.hv[0], ctxBefore: t.ctx[2], ctx: t.ctx[1] });
          if (hv > 8 && this.hipDumps.length < 8) this.hipDumps.push(`${this.label(f)} v=${hv.toFixed(1)} ${t.ctx[2]} -> ${t.ctx[1]} @${this.frame - 1}\n  t-2 hipsW=${t.hips[2].x.toFixed(2)},${t.hips[2].y.toFixed(2)},${t.hips[2].z.toFixed(2)} ${t.clipP[2]}\n  t-1 hipsW=${t.hips[1].x.toFixed(2)},${t.hips[1].y.toFixed(2)},${t.hips[1].z.toFixed(2)} ${t.clipP[1]}\n  t   hipsW=${t.hips[0].x.toFixed(2)},${t.hips[0].y.toFixed(2)},${t.hips[0].z.toFixed(2)} ${t.clipP[0]}`);
        }
      }
      // foot skate
      for (let k = 0; k < 2; k++) {
        let fb: number = k === 0 ? B.footL : B.footR;
        // a planted locomotion foot pivots on the ball of the foot once the heel is up
        const heelUp = f.anim.mode === 'loco' && f.anim.loco.feet[k].pitch > 2;
        if (heelUp) fb = k === 0 ? B.toeL : B.toeR;
        const lp = fk.pos[fb];
        const [lx, lz] = rotY(lp.x, lp.z, f.yaw);
        const p = this._p.set(f.x + lx, lp.y, f.z + lz);
        const ft = t.feet[k];
        let planted = false;
        let isLoco = false;
        if (f.anim.mode === 'loco') {
          const lf = f.anim.loco.feet[k];
          planted = !lf.swing && lf.plantedTime > 0.04;
          isLoco = true;
        } else planted = p.y < f.def.ankleHeight + 0.02;
        if (planted && ft.planted && t.frames > 1 && ft.heelUp === heelUp) {
          const d = Math.hypot(p.x - ft.pos.x, p.z - ft.pos.z);
          const speed = d / dt;
          if (isLoco) {
            this.slide.loco += d;
            this.slide.locoPlantedT += dt;
            const lf = f.anim.loco.feet[k];
            const key = (f.anim as unknown as { inertia: boolean }).inertia ? 'blend' : lf.pitch > 2 ? 'heelUp' : lf.pitch < -2 ? 'toesUp' : 'flat';
            const st = this.locoSlideBy[key];
            st.d += d;
            st.t += dt;
            // IK reach shortfall of the ankle
            const tgt = f.anim.loco.params.feet[k].pos;
            const ank = fk.pos[k === 0 ? B.footL : B.footR];
            const miss = Math.hypot(tgt.x - ank.x, tgt.y - ank.y, tgt.z - ank.z);
            st.miss += miss * dt;
            st.maxMiss = Math.max(st.maxMiss, miss);
            if (key === 'heelUp' && speed > 0.9 && this.heelSkates.length < 14) {
              const fv = f as unknown as { vx: number; vz: number };
              const L = f.anim.loco as unknown as { rhythmic: boolean; gaitBlend: number; speedSm: number };
              const Lo = f.anim.loco;
              const o = Lo.feet[1 - k];
              this.heelSkates.push(`k=${k} phase=${Lo.phase.toFixed(3)} cyc=${Lo.gaitInfo.cyc.toFixed(2)} sf=${Lo.gaitInfo.swingFrac.toFixed(2)} rk=${Lo.gaitInfo.runK.toFixed(2)} due=${lf.liftDue} o:${o.swing ? 'S' : 'P'} ot=${o.t.toFixed(2)} ev=${Lo.events.join(',')} | ` + `${this.label(f)} slide=${speed.toFixed(2)} root=${Math.hypot(fv.vx, fv.vz).toFixed(2)} sm=${L.speedSm.toFixed(2)} rh=${L.rhythmic} gb=${L.gaitBlend.toFixed(2)} pitch=${lf.pitch.toFixed(0)} pt=${lf.plantedTime.toFixed(2)} miss=${miss.toFixed(3)} tgt=${tgt.x.toFixed(2)},${tgt.y.toFixed(2)},${tgt.z.toFixed(2)} @${this.frame}`);
            }
          } else {
            this.slide.clip += d;
            this.slide.clipContactT += dt;
          }
          if (speed > 0.9) this.slide.worst.push({ who: this.label(f), ctx: t.ctx[0], speed, frame: this.frame });
          if (speed > 4 && !isLoco && f.anim.clip && this.skateDumps.length < 12) {
            const c = f.anim.clip;
            const [ki] = c.segment(c.time);
            const fw = c.plannedFeet(k);
            const keys = c.clip.keys;
            const row = (i: number) => {
              const q = fw[Math.max(0, Math.min(fw.length - 1, i))];
              const kk = keys[Math.max(0, Math.min(keys.length - 1, i))];
              const ff = k === 0 ? kk.lf : kk.rf;
              return `  k${i} t=${kk.t.toFixed(3)} w=${q.x.toFixed(3)},${q.y.toFixed(3)},${q.z.toFixed(3)} clip=${ff.p.map((v) => v.toFixed(3)).join(',')} pitch=${ff.pitch.toFixed(0)}`;
            };
            this.skateDumps.push(`${this.label(f)} ${c.clip.name} side=${k} t=${c.time.toFixed(3)} v=${speed.toFixed(1)} foot=${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)} prev=${ft.pos.x.toFixed(3)},${ft.pos.z.toFixed(3)} root=${c.rootX.toFixed(3)},${c.rootZ.toFixed(3)} f=${f.x.toFixed(3)},${f.z.toFixed(3)} @${this.frame}\n` + [ki - 1, ki, ki + 1, ki + 2].map(row).join('\n'));
          }
        }
        ft.pos.copy(p);
        ft.planted = planted;
        ft.heelUp = heelUp;
      }
    }
  }

  report(seconds: number) {
    const top = [...this.pops].sort((a, b) => b.w / Math.max(1, Math.max(b.before, b.after)) - a.w / Math.max(1, Math.max(a.before, a.after))).slice(0, 25);
    const byTrans = [...this.popByTransition.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    const trans = [...this.transitions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    const worstSlide = [...this.slide.worst].sort((a, b) => b.speed - a.speed).slice(0, 12);
    const skateCtx = new Map<string, number>();
    for (const w of this.slide.worst) skateCtx.set(simplify(w.ctx), (skateCtx.get(simplify(w.ctx)) ?? 0) + 1);
    return {
      seconds: Math.round(seconds),
      popsPerMin: +(this.pops.length / (seconds / 60)).toFixed(1),
      pops: this.pops.length,
      hipJumps: this.hipJumps.length,
      locoSlideMps: +(this.slide.loco / Math.max(1e-3, this.slide.locoPlantedT)).toFixed(4),
      clipSlideMps: +(this.slide.clip / Math.max(1e-3, this.slide.clipContactT)).toFixed(4),
      skateEvents: this.slide.worst.length,
      skateDumps: this.skateDumps,
      skateByCtx: [...skateCtx.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
      popsByTransition: byTrans,
      transitions: trans,
      topPops: top.map((p) => `${p.who} ${p.bone} w=${p.w.toFixed(1)} (${p.before.toFixed(1)}/${p.after.toFixed(1)}) ${p.ctxBefore === p.ctx ? 'in ' + p.ctx : p.ctxBefore + ' -> ' + p.ctx} @${p.frame}`),
      hipJumpSamples: this.hipJumps.slice(0, 12).map((p) => `${p.who} v=${p.w.toFixed(1)} (${p.before.toFixed(1)}/${p.after.toFixed(1)}) ${p.ctxBefore} -> ${p.ctx} @${p.frame}`),
      worstSkates: worstSlide.map((w) => `${w.who} ${w.speed.toFixed(2)}m/s ${w.ctx} @${w.frame}`),
      armDumps: this.armDumps,
      legDumps: this.legDumps,
      heelSkates: this.heelSkates,
      clipDumps: this.clipDumps,
      hipDumps: this.hipDumps,
      popHist: (() => {
        const h = [0, 0, 0, 0, 0];
        for (const p of this.pops) h[p.w < 10 ? 0 : p.w < 20 ? 1 : p.w < 40 ? 2 : p.w < 80 ? 3 : 4]++;
        return { '<10': h[0], '10-20': h[1], '20-40': h[2], '40-80': h[3], '80+': h[4] };
      })(),
      clipPopsByBone: (() => {
        const m = new Map<string, number>();
        for (const p of this.pops) if (p.ctx.startsWith('clip') && p.w > 15) m.set(`${simplify(p.ctx)}:${p.bone}`, (m.get(`${simplify(p.ctx)}:${p.bone}`) ?? 0) + 1);
        return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
      })(),
      locoSlideBy: Object.fromEntries(Object.entries(this.locoSlideBy).map(([k, v]) => [k, { mps: +(v.d / Math.max(1e-3, v.t)).toFixed(3), share: +v.t.toFixed(1), avgMiss: +(v.miss / Math.max(1e-3, v.t)).toFixed(3), maxMiss: +v.maxMiss.toFixed(3) }])),
      locoPops: (() => {
        const m = new Map<string, number>();
        for (const p of this.pops) if (p.ctx === 'loco' && p.ctxBefore === 'loco') m.set(`${p.who}:${p.bone}`, (m.get(`${p.who}:${p.bone}`) ?? 0) + 1);
        return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
      })(),
      locoTop: this.pops.filter((p) => p.ctx === 'loco' && p.ctxBefore === 'loco').sort((a, b) => b.w - a.w).slice(0, 14).map((p) => `${p.who} ${p.bone} w=${p.w.toFixed(1)} (${p.before.toFixed(1)}/${p.after.toFixed(1)}) ${p.ev} @${p.frame}`),
      locoByEvent: (() => {
        const m = new Map<string, number>();
        for (const p of this.pops) {
          if (p.ctx !== 'loco' || p.ctxBefore !== 'loco') continue;
          const tags = (p.ev ?? '').replace(/[0-9]/g, '').replace(/^\[|\]$/g, '').split('|')[1] || 'none';
          m.set(tags, (m.get(tags) ?? 0) + 1);
        }
        return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
      })(),
    };
  }
}

const _Y = new THREE.Vector3(0, 1, 0);
/** Collapse mirrored / numbered clip names so transitions aggregate. */
function simplify(ctx: string) {
  return ctx.replace(/_m$/, '');
}
