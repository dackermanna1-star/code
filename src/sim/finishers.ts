import { clamp, ease, lerp } from '../core/math';
import type { AspectId } from '../core/ids';
import type { Fighter } from './fighter';
import type { KillInfo, Simulation } from './simulation';
import type { WinMethod } from './types';
import { lockFighter, type Sequence } from './sequences';

/**
 * Finishers: authored cinematic executions selected from context (how the lethal blow landed,
 * the victor's weapon / aspect / abilities, proximity to walls and props, airborne or grounded).
 * The outcome is already decided when they start; they exist purely to end each story with a bang.
 * Every finisher has internal random variations (camera beats, timings, poses, dissolve style).
 */

export interface FinisherChoice {
  kind: string;
  name: string;
  duration: number;
  run: (c: FinCtx, t: number) => void;
}

export class FinCtx {
  data: Record<string, number> = {};
  constructor(public sim: Simulation, public W: Fighter, public L: Fighter) {}
  beat(beat: string, x: number, y: number, v?: number, text?: string): void {
    this.sim.emit({ type: 'seq', kind: 'finisher', beat, a: this.W.side, b: this.L.side, x, y, v, text });
  }
  anim(f: Fighter, clip: string): void {
    f.anim = { clip, t: 0 };
  }
  place(f: Fighter, x: number, y: number): void {
    f.x = clamp(x, -this.sim.arena.halfWidth + 30, this.sim.arena.halfWidth - 30);
    f.y = Math.min(0, y);
    f.grounded = f.y >= -0.5;
  }
  tween(f: Fighter, x0: number, y0: number, x1: number, y1: number, t: number, t0: number, t1: number, e: (k: number) => number = ease.inOutQuad): void {
    if (t < t0 || t > t1) return;
    const k = e((t - t0) / Math.max(1, t1 - t0));
    this.place(f, lerp(x0, x1, k), lerp(y0, y1, k));
  }
  face(): void {
    this.W.faceToward(this.L.x);
    this.L.faceToward(this.W.x);
  }
  get dir(): number {
    return Math.sign(this.L.x - this.W.x) || this.W.facing;
  }
  shatterStyle(): string {
    const map: Record<AspectId, string> = { inferno: 'ash', radiance: 'light', verdant: 'petals', frost: 'ice', tempest: 'sparks', void: 'void', chrono: 'clock' };
    return map[this.L.def.aspect];
  }
  pick<T>(arr: T[]): T {
    return this.sim.rng.pick(arr);
  }
}

export class FinisherSeq implements Sequence {
  readonly kind = 'finisher';
  done = false;
  private t = 0;
  private ctx: FinCtx;
  constructor(private sim: Simulation, W: Fighter, L: Fighter, private fin: FinisherChoice) {
    lockFighter(W, 'fin.stand');
    lockFighter(L, 'fin.stagger');
    this.ctx = new FinCtx(sim, W, L);
    this.ctx.data.x0 = L.x;
    this.ctx.data.y0 = L.y;
    this.ctx.data.wx0 = W.x;
    this.ctx.data.wy0 = W.y;
    this.ctx.beat('begin', L.x, L.y - 60, 0, fin.name);
  }
  update(): void {
    this.t++;
    const { W, L } = this.ctx;
    if (W.anim) W.anim.t++;
    if (L.anim) L.anim.t++;
    this.fin.run(this.ctx, this.t);
    if (this.t >= this.fin.duration) {
      this.done = true;
      L.scripted = true;
      L.setState('dead');
      L.anim = { clip: 'dead', t: 0 };
      W.scripted = false;
      this.ctx.beat('end', W.x, W.y - 60);
    }
  }
}

/* ======================================================================== */

type Script = (c: FinCtx, t: number) => void;

/** Common ending: loser dissolves, winner strikes a pose. */
function ending(c: FinCtx, t: number, at: number): void {
  if (t === at) {
    c.beat('shatter', c.L.x, c.L.y - 60, 1, c.shatterStyle());
    c.anim(c.L, 'fin.dissolve');
  }
  if (t === at + 30) {
    c.W.faceToward(0);
    c.anim(c.W, `victory.${c.W.def.personality}`);
    c.beat('pose', c.W.x, c.W.y - 60);
  }
}

const iaiFinal: Script = (c, t) => {
  const { W, L } = c;
  if (t === 1) {
    c.face();
    c.anim(W, 'fin.sheathReady');
    c.anim(L, 'fin.stagger');
    c.beat('silence', W.x, W.y - 60, 1.4);
    c.beat('zoom', W.x, W.y - 70, 1.8);
    c.beat('slowmo', W.x, W.y, 0.35);
  }
  if (t === 34) {
    c.beat('teleport', W.x, W.y - 60);
    c.data.tx = L.x + c.dir * 150;
  }
  if (t === 38) {
    c.place(W, c.data.tx, 0);
    W.facing = (-c.dir) as 1 | -1;
    c.anim(W, 'fin.slashThrough');
    c.beat('slash', L.x, L.y - 70, c.pick([-0.15, 0, 0.2, -0.35]));
    c.beat('impact', L.x, L.y - 70, 0.6);
  }
  if (t === 56) {
    c.anim(W, 'fin.sheath');
    c.beat('zoom', W.x, W.y - 70, 1.6);
  }
  if (t === 80) {
    c.beat('click', W.x, W.y - 80);
    c.beat('impact', L.x, L.y - 70, 1);
    c.anim(L, 'fin.collapse');
  }
  ending(c, t, 96);
};

const finalExchange: Script = (c, t) => {
  const { W, L } = c;
  if (t === 1) {
    const mid = (W.x + L.x) / 2;
    c.data.mid = mid;
    c.place(W, mid - 260, 0);
    c.place(L, mid + 260, 0);
    c.face();
    c.anim(W, 'fin.ready');
    c.anim(L, 'fin.ready');
    c.beat('letterbox', mid, -70, 1);
    c.beat('zoom', mid, -70, 1.0);
    c.beat('silence', mid, -70, 2.2);
  }
  if (t === 40) {
    c.anim(W, 'fin.dash');
    c.anim(L, 'fin.dash');
    c.beat('dash', c.data.mid, -70);
  }
  if (t > 40 && t <= 50) {
    const k = (t - 40) / 10;
    const mid = c.data.mid;
    c.place(W, lerp(mid - 260, mid + 200, k), 0);
    c.place(L, lerp(mid + 260, mid - 200, k), 0);
  }
  if (t === 46) {
    c.beat('slash', c.data.mid, -70, 0.05);
    c.beat('flash', c.data.mid, -70, 0.8);
  }
  if (t === 51) {
    c.anim(W, 'fin.afterSlash');
    c.anim(L, 'fin.afterSlash');
    c.beat('slowmo', c.data.mid, -70, 0.3);
    c.beat('zoom', c.data.mid, -70, 0.9);
  }
  if (t === 100) {
    c.beat('impact', L.x, L.y - 70, 1);
    c.anim(L, 'fin.collapse');
  }
  ending(c, t, 116);
};

const skyfall: Script = (c, t) => {
  const { W, L } = c;
  if (t === 1) {
    c.face();
    c.anim(W, 'fin.uppercut');
    c.beat('impact', L.x, L.y - 60, 0.7);
    c.data.lx = L.x;
  }
  if (t >= 2 && t <= 34) c.tween(L, c.data.lx, c.data.y0, c.data.lx, -760, t, 2, 34, ease.outCubic);
  if (t === 2) {
    c.anim(L, 'fin.launched');
    c.beat('launch', L.x, L.y - 60);
  }
  if (t === 26) c.beat('teleport', W.x, W.y - 60);
  if (t === 34) {
    c.place(W, L.x, -900);
    c.anim(W, 'fin.slamDown');
    c.beat('zoom', L.x, -800, 1.4);
    c.beat('slowmo', L.x, -800, 0.3);
  }
  if (t === 52) c.beat('impact', L.x, L.y - 60, 0.8);
  if (t > 52 && t <= 64) {
    c.tween(L, c.data.lx, -760, c.data.lx, 0, t, 52, 64, ease.inQuad);
    c.tween(W, c.data.lx, -900, c.data.lx, -110, t, 52, 64, ease.inQuad);
  }
  if (t === 64) {
    c.beat('slam', L.x, 0, 1.2);
    c.beat('impact', L.x, -40, 1);
    c.beat('explosion', L.x, -30, 260);
    c.anim(L, 'fin.crumple');
    c.anim(W, 'fin.landCrouch');
  }
  if (t === 70) c.place(W, c.data.lx - c.dir * 60, 0);
  ending(c, t, 92);
};

const groundPound: Script = (c, t) => {
  const { W, L } = c;
  if (t === 1) {
    c.face();
    c.anim(W, 'fin.grab');
    c.anim(L, 'fin.grabbed');
    c.place(L, W.x + W.facing * 46, 0);
  }
  for (const [i, tt] of [[0, 14], [1, 30], [2, 46]] as [number, number][]) {
    if (t === tt) {
      c.anim(W, i % 2 === 0 ? 'fin.punch' : 'fin.punch2');
      c.beat('impact', L.x, L.y - 70, 0.5 + i * 0.15);
      c.beat('shake', L.x, L.y, 0.3);
    }
  }
  if (t === 60) {
    c.anim(W, 'fin.liftSlam');
    c.beat('zoom', W.x, W.y - 80, 1.5);
  }
  if (t > 60 && t <= 74) {
    const k = (t - 60) / 14;
    const ang = Math.PI * k;
    c.place(L, W.x + W.facing * Math.cos(ang) * 50, -Math.sin(ang) * 130);
  }
  if (t === 74) {
    c.beat('slam', L.x, 0, 1.4);
    c.beat('impact', L.x, -30, 1);
    c.beat('explosion', L.x, -20, 300);
    c.anim(L, 'fin.crumple');
    c.anim(W, 'fin.slamFollow');
  }
  ending(c, t, 98);
};

const beamObliteration: Script = (c, t) => {
  const { W, L } = c;
  if (t === 1) {
    c.face();
    c.anim(W, 'fin.palmCharge');
    c.anim(L, 'fin.stagger');
    c.place(L, W.x + W.facing * 90, 0);
    c.beat('darken', W.x, W.y, 0.6);
    c.beat('charge', W.x + W.facing * 40, W.y - 84);
    c.beat('zoom', W.x, W.y - 80, 1.7);
  }
  if (t === 36) {
    c.anim(W, 'fin.beam');
    c.beat('beam', W.x + W.facing * 44, W.y - 84, W.facing);
    c.beat('impact', L.x, L.y - 70, 0.8);
    c.anim(L, 'fin.launched');
  }
  if (t > 36 && t <= 76) {
    const wall = W.facing > 0 ? c.sim.arena.halfWidth - 40 : -c.sim.arena.halfWidth + 40;
    c.place(L, lerp(W.x + W.facing * 90, wall, ease.outQuad((t - 36) / 40)), -70);
    if (t % 6 === 0) c.beat('beamPulse', L.x, L.y - 60);
  }
  if (t === 77) {
    c.beat('explosion', L.x, L.y - 60, 360);
    c.beat('impact', L.x, L.y - 60, 1);
    c.beat('wallCrater', L.x, L.y - 60);
    c.beat('beamEnd', W.x, W.y - 84);
    c.anim(W, 'fin.beamEnd');
  }
  ending(c, t, 84);
};

const thousandBlades: Script = (c, t) => {
  const { W, L } = c;
  if (t === 1) {
    c.face();
    c.anim(W, 'fin.raise');
    c.anim(L, 'fin.suspended');
    c.data.ly = Math.min(L.y, -60);
    c.beat('blades', L.x, c.data.ly - 60, 12);
    c.beat('zoom', L.x, c.data.ly - 60, 1.3);
  }
  if (t <= 40) c.place(L, L.x, lerp(c.data.ly, -220, ease.outCubic(Math.min(1, t / 40))));
  if (t === 48) {
    c.anim(W, 'fin.clench');
    c.beat('bladesConverge', L.x, L.y - 60, 12);
    c.beat('slowmo', L.x, L.y - 60, 0.35);
  }
  if (t === 62) {
    c.beat('impact', L.x, L.y - 60, 1);
    c.beat('explosion', L.x, L.y - 60, 200);
  }
  ending(c, t, 70);
};

const meteorDrop: Script = (c, t) => {
  const { W, L } = c;
  if (t === 1) {
    c.face();
    c.anim(W, 'fin.throwUp');
    c.anim(L, 'fin.launched');
    c.data.lx = L.x;
    c.beat('launch', L.x, L.y - 60);
  }
  if (t <= 30) c.tween(L, c.data.lx, c.data.y0, c.data.lx, -520, t, 1, 30, ease.outCubic);
  if (t === 30) {
    c.anim(W, 'fin.point');
    c.anim(L, 'fin.suspended');
    c.beat('meteor', c.data.lx, -520, 1);
    c.beat('zoom', c.data.lx, -500, 0.65);
  }
  if (t === 66) {
    c.beat('impact', c.data.lx, -520, 1);
    c.beat('explosion', c.data.lx, -520, 380);
  }
  if (t > 66 && t <= 80) c.tween(L, c.data.lx, -520, c.data.lx, 0, t, 66, 80, ease.inQuad);
  if (t === 80) {
    c.beat('slam', c.data.lx, 0, 1.6);
    c.anim(L, 'fin.crumple');
  }
  ending(c, t, 96);
};

const timeStopExecution: Script = (c, t) => {
  const { W, L } = c;
  if (t === 1) {
    c.anim(W, 'fin.clockRaise');
    c.anim(L, 'fin.frozen');
    c.beat('clockFreeze', W.x, W.y - 60);
  }
  if (t === 20) c.anim(W, 'fin.walk');
  if (t > 20 && t <= 50) c.tween(W, W.x, W.y, L.x - c.dir * 70, 0, t, 20, 50, ease.linear);
  for (let i = 0; i < 6; i++) {
    const tt = 52 + i * 7;
    if (t === tt) {
      c.anim(W, i % 2 === 0 ? 'fin.slash' : 'fin.slash2');
      c.beat('frozenHit', L.x, L.y - 70 + (i % 3) * 18, i);
    }
  }
  if (t === 100) {
    c.anim(W, 'fin.sheath');
    c.place(W, L.x + c.dir * 120, 0);
    W.facing = (-c.dir) as 1 | -1;
  }
  if (t === 112) {
    c.beat('clockResume', L.x, L.y - 60);
    c.beat('impact', L.x, L.y - 60, 1);
    c.beat('explosion', L.x, L.y - 60, 220);
    c.anim(L, 'fin.launched');
  }
  ending(c, t, 120);
};

const gravityCollapse: Script = (c, t) => {
  const { W, L } = c;
  if (t === 1) {
    c.anim(W, 'fin.clench');
    c.anim(L, 'fin.suspended');
    c.data.lx = L.x;
    c.beat('singularity', L.x, -200, 1);
    c.beat('darken', L.x, -200, 0.7);
  }
  if (t <= 50) c.tween(L, c.data.lx, c.data.y0, c.data.lx, -200, t, 1, 50, ease.inOutCubic);
  if (t === 60) c.beat('zoom', L.x, -200, 1.6);
  if (t === 80) {
    c.beat('collapse', L.x, -200);
    c.beat('impact', L.x, -200, 1);
  }
  if (t === 84) {
    c.beat('shatter', L.x, L.y - 60, 1, 'void');
    c.anim(L, 'fin.dissolve');
  }
  if (t === 110) {
    c.anim(W, `victory.${W.def.personality}`);
    c.beat('pose', W.x, W.y - 60);
  }
};

const judgment: Script = (c, t) => {
  const { W, L } = c;
  if (t === 1) {
    c.anim(W, 'fin.point');
    c.anim(L, 'fin.kneel');
    c.place(L, L.x, 0);
    c.beat('pillarWarn', L.x, 0, 1);
    c.beat('zoom', L.x, -200, 0.8);
  }
  if (t === 46) {
    c.beat('pillar', L.x, 0, 1);
    c.beat('impact', L.x, -100, 1);
  }
  if (t === 52) {
    c.beat('shatter', L.x, L.y - 60, 1, 'light');
    c.anim(L, 'fin.dissolve');
  }
  if (t === 90) {
    c.anim(W, `victory.${W.def.personality}`);
    c.beat('pose', W.x, W.y - 60);
  }
};

const stormEnd: Script = (c, t) => {
  const { W, L } = c;
  if (t === 1) {
    c.anim(W, 'fin.raise');
    c.anim(L, 'fin.stagger');
    c.beat('darken', L.x, -200, 0.8);
  }
  for (let i = 0; i < 5; i++) {
    if (t === 16 + i * 9) c.beat('lightning', L.x + (i === 4 ? 0 : (i % 2 ? 1 : -1) * 40 * (i + 1)), 0, i === 4 ? 1.5 : 0.8);
  }
  if (t === 52) {
    c.beat('impact', L.x, -60, 1);
    c.anim(L, 'fin.collapse');
  }
  ending(c, t, 64);
};

const pyre: Script = (c, t) => {
  const { W, L } = c;
  if (t === 1) {
    c.face();
    c.anim(W, 'fin.palmCharge');
    c.anim(L, 'fin.stagger');
    c.beat('zoom', L.x, -100, 1.2);
  }
  if (t === 24) {
    c.anim(W, 'fin.palmStrike');
    c.beat('pyre', L.x, 0, 1);
    c.anim(L, 'fin.suspended');
  }
  if (t > 24 && t < 70) c.place(L, L.x, lerp(0, -140, ease.outCubic((t - 24) / 46)));
  if (t === 70) c.beat('impact', L.x, -140, 1);
  if (t === 72) {
    c.beat('shatter', L.x, L.y - 60, 1, 'ash');
    c.anim(L, 'fin.dissolve');
  }
  if (t === 104) {
    c.anim(W, `victory.${W.def.personality}`);
    c.beat('pose', W.x, W.y - 60);
  }
};

const frostTomb: Script = (c, t) => {
  const { W, L } = c;
  if (t === 1) {
    c.face();
    c.anim(W, 'fin.point');
    c.anim(L, 'fin.frozen');
    c.beat('freezeSolid', L.x, L.y - 60, 1);
  }
  if (t === 40) {
    c.anim(W, 'fin.dash');
    c.beat('teleport', W.x, W.y - 60);
  }
  if (t === 44) {
    c.place(W, L.x + c.dir * 110, L.y);
    W.facing = (-c.dir) as 1 | -1;
    c.anim(W, 'fin.slashThrough');
    c.beat('slash', L.x, L.y - 70, 0.4);
  }
  if (t === 70) {
    c.beat('impact', L.x, L.y - 60, 1);
    c.beat('shatter', L.x, L.y - 60, 1, 'ice');
    c.anim(L, 'fin.dissolve');
  }
  if (t === 100) {
    c.anim(W, `victory.${W.def.personality}`);
    c.beat('pose', W.x, W.y - 60);
  }
};

const thorns: Script = (c, t) => {
  const { W, L } = c;
  if (t === 1) {
    c.anim(W, 'fin.stomp');
    c.anim(L, 'fin.stagger');
    c.beat('thornsWarn', L.x, 0, 1);
  }
  if (t === 22) {
    c.beat('thorns', L.x, 0, 1);
    c.beat('impact', L.x, -60, 0.9);
    c.anim(L, 'fin.suspended');
  }
  if (t > 22 && t <= 40) c.place(L, L.x, lerp(0, -160, ease.outCubic((t - 22) / 18)));
  if (t === 60) {
    c.beat('shatter', L.x, L.y - 60, 1, 'petals');
    c.anim(L, 'fin.dissolve');
  }
  if (t === 92) {
    c.anim(W, `victory.${W.def.personality}`);
    c.beat('pose', W.x, W.y - 60);
  }
};

const wallCrater: Script = (c, t) => {
  const { W, L } = c;
  const wallX = (L.x > 0 ? 1 : -1) * (c.sim.arena.halfWidth - 34);
  if (t === 1) {
    c.face();
    c.anim(W, 'fin.heavySwing');
    c.beat('impact', L.x, L.y - 60, 0.8);
    c.anim(L, 'fin.launched');
    c.data.lx = L.x;
    c.data.ly = Math.min(-40, L.y - 30);
  }
  if (t > 1 && t <= 12) c.tween(L, c.data.lx, c.data.ly, wallX, -110, t, 1, 12, ease.linear);
  if (t === 12) {
    c.beat('wallCrater', wallX, -110, 1.3);
    c.beat('impact', wallX, -110, 1);
    c.anim(L, 'fin.wallStuck');
  }
  if (t === 34) {
    c.beat('teleport', W.x, W.y - 60);
  }
  if (t === 38) {
    c.place(W, wallX - Math.sign(wallX) * 70, 0);
    W.faceToward(wallX);
    c.anim(W, 'fin.thrust');
    c.beat('zoom', wallX, -100, 1.5);
  }
  if (t === 50) {
    c.beat('impact', wallX, -110, 1);
    c.beat('explosion', wallX, -110, 240);
  }
  ending(c, t, 60);
};

const pillarBreak: Script = (c, t) => {
  const { W, L, sim } = c;
  if (t === 1) {
    const props = sim.props.filter((p) => !p.broken);
    props.sort((a, b) => Math.abs(a.def.x - L.x) - Math.abs(b.def.x - L.x));
    const p = props[0];
    c.data.px = p ? p.def.x : L.x + c.dir * 300;
    c.data.pid = p ? p.def.id : -1;
    c.face();
    c.anim(W, 'fin.heavySwing');
    c.anim(L, 'fin.launched');
    c.beat('impact', L.x, L.y - 60, 0.8);
    c.data.lx = L.x;
  }
  if (t > 1 && t <= 14) c.tween(L, c.data.lx, c.data.y0, c.data.px, -90, t, 1, 14, ease.linear);
  if (t === 14) {
    const p = sim.props.find((pp) => pp.def.id === c.data.pid);
    if (p) sim.damageProp(p, 99999, p.def.x, -90, Math.sign(c.data.px - c.data.lx) || 1);
    c.beat('impact', c.data.px, -90, 1);
    c.beat('slowmo', c.data.px, -90, 0.3);
  }
  if (t > 14 && t <= 34) c.tween(L, c.data.px, -90, c.data.px + (Math.sign(c.data.px - c.data.lx) || 1) * 260, 0, t, 14, 34, ease.outQuad);
  if (t === 34) c.anim(L, 'fin.crumple');
  ending(c, t, 56);
};

const throwFinish: Script = (c, t) => {
  const { W, L } = c;
  if (t === 1) {
    c.face();
    c.anim(W, 'fin.grab');
    c.anim(L, 'fin.grabbed');
    c.place(L, W.x + W.facing * 46, 0);
    c.data.wx = W.x;
  }
  if (t > 10 && t <= 40) {
    const k = (t - 10) / 30;
    c.place(L, c.data.wx + W.facing * Math.cos(k * Math.PI * 1.5) * 60, -Math.sin(k * Math.PI) * 240);
    if (t === 11) c.anim(W, 'fin.throwSpin');
  }
  if (t === 40) {
    c.beat('slam', L.x, 0, 1.3);
    c.beat('impact', L.x, -30, 1);
    c.beat('explosion', L.x, -20, 220);
    c.anim(L, 'fin.crumple');
  }
  ending(c, t, 62);
};

/** Signature finale for kills by an ultimate ability. */
function ultimateFinale(abilityId: string): Script {
  return (c, t) => {
    const { W, L } = c;
    if (t === 1) {
      c.anim(L, 'fin.launched');
      c.anim(W, 'fin.stand');
      c.beat('ultimateEcho', L.x, L.y - 60, 1, abilityId);
      c.beat('slowmo', L.x, L.y - 60, 0.25);
      c.beat('zoom', L.x, L.y - 60, 1.2);
    }
    if (t <= 40) c.place(L, L.x - c.dir * 0, lerp(c.data.y0, Math.min(c.data.y0, -220), ease.outCubic(t / 40)));
    if (t === 44) {
      c.beat('impact', L.x, L.y - 60, 1);
      c.beat('explosion', L.x, L.y - 60, 320);
    }
    ending(c, t, 52);
  };
}

/* ======================================================================== */

export function chooseFinisher(sim: Simulation, W: Fighter, L: Fighter, method: WinMethod, kill: KillInfo | null): FinisherChoice {
  const ab = W.def.abilities;
  const blade = W.weapon.blade;
  const nearWall = Math.abs(L.x) > sim.arena.halfWidth - 320;
  const nearProp = sim.props.some((p) => !p.broken && Math.abs(p.def.x - L.x) < 420);
  const asp = W.def.aspect;
  const cands: [FinisherChoice, number][] = [];
  const add = (kind: string, name: string, duration: number, run: Script, w: number) => {
    if (w > 0) cands.push([{ kind, name, duration, run }, w]);
  };

  if (method === 'ultimate' && kill) {
    const id = kill.source.replace('ab.', '');
    add('ultimateFinale', 'Divine Annihilation', 120, ultimateFinale(id), 6);
  }
  if (method === 'finalClash') add('finalExchange', 'The Last Exchange', 150, finalExchange, 8);
  if (method === 'counter') {
    if (blade) add('iaiFinal', 'Final Draw', 160, iaiFinal, 5);
    add('finalExchange', 'The Last Exchange', 150, finalExchange, 1.5);
  }
  if (method === 'beam') add('beamObliteration', 'Obliteration', 150, beamObliteration, 5);
  if (method === 'throw') {
    add('throwFinish', 'Heaven-Sent Slam', 130, throwFinish, 4);
    add('groundPound', 'Earthshatter', 160, groundPound, 1.5);
  }
  if (method === 'clash') {
    add('finalExchange', 'The Last Exchange', 150, finalExchange, 2);
    if (blade) add('iaiFinal', 'Final Draw', 160, iaiFinal, 1.5);
    add('skyfall', 'Skyfall Execution', 150, skyfall, 1.5);
  }

  // Context & identity driven options (always available, weighted).
  add('skyfall', 'Skyfall Execution', 150, skyfall, 2);
  add('finalExchange', 'The Last Exchange', 150, finalExchange, blade ? 1.8 : 0.6);
  if (blade) add('iaiFinal', 'Final Draw', 160, iaiFinal, 1.2);
  add('groundPound', 'Earthshatter', 160, groundPound, W.def.weapon === 'gauntlets' || W.def.weapon === 'greatsword' || W.def.weapon === 'staff' ? 2.2 : 0.6);
  add('thousandBlades', 'Thousand Blades', 140, thousandBlades, ab.special === 'bladeStorm' ? 3 : 0.7);
  add('meteorDrop', 'Meteor Drop', 160, meteorDrop, ab.ranged === 'starfall' || ab.ultimate === 'cataclysm' ? 3 : 0.6);
  add('timeStopExecution', 'Stopped Time', 170, timeStopExecution, asp === 'chrono' || ab.special === 'chronoStop' ? 3.5 : 0.35);
  add('gravityCollapse', 'Singularity', 150, gravityCollapse, asp === 'void' || ab.ultimate === 'blackHole' || ab.ranged === 'gravityOrb' ? 3.5 : 0.35);
  add('judgment', 'Judgment', 140, judgment, asp === 'radiance' || ab.ultimate === 'heavensLance' ? 3.5 : 0.35);
  add('stormEnd', "Heaven's Wrath", 130, stormEnd, asp === 'tempest' || ab.ranged === 'thunderJudgment' ? 3.5 : 0.35);
  add('pyre', 'Funeral Pyre', 150, pyre, asp === 'inferno' ? 3.5 : 0);
  add('frostTomb', 'Glacial Tomb', 150, frostTomb, asp === 'frost' ? 3.5 : 0);
  add('thorns', 'World-Root Impalement', 140, thorns, asp === 'verdant' ? 3.5 : 0);
  add('beamObliteration', 'Obliteration', 150, beamObliteration, ab.special === 'annihilationBeam' ? 2.2 : 0.5);
  add('wallCrater', 'Wall Breaker', 130, wallCrater, nearWall ? 4 : 0);
  add('pillarBreak', 'Through the Pillar', 130, pillarBreak, nearProp && !nearWall ? 3 : 0);

  return sim.rng.weightedPairs(cands);
}
