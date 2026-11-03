import * as THREE from 'three';
import { softGlowTexture } from '../world/textures';
import { clamp, damp, rand } from '../core/math';
import type { Chapter, Story } from './runner';
import { Car, collideCars, Road } from '../vehicle/car';
import { CONVOY } from '../world/level/convoy';

/**
 * CHAPTER FIVE — THE TRUCKS LEAVE AT DAWN. Viper's black car out of Meridian's garage at 4:52 AM,
 * onto the river expressway after Voss's convoy: two refrigerated trucks (her sister in the second),
 * three black SUVs round them, and the night's last traffic. Catch them; run the escorts into the
 * barriers (or shoot their tyres out: R); get alongside Ivy's truck - and watch it go through
 * Palewater's gates as they close on her.
 *
 * She drives: W / S throttle and brake, A / D steer, SPACE the handbrake, R the pistol (an escort
 * ahead of her, in range). The car is Viper's: armoured, but not for ever.
 */
const LANES = CONVOY.lanes;

type Role = 'player' | 'truck' | 'escort' | 'traffic';
interface Ride {
  car: Car;
  role: Role;
  lane: number;
  want: number;
  /** An escort's mood: holding station, or coming at her. */
  mode?: 'guard' | 'ram' | 'back';
  modeT?: number;
  station?: [number, number];
  smoke?: THREE.Points;
  /** Just knocked by her car (s): a barrier it's shoved into now costs it. */
  shoved?: number;
}

/** Of the damage a knock deals Viper's car, the share it takes (it's armoured). */
const ARMOUR = 0.4;

class Chase {
  /** Her car's health as of last frame (what's been dealt since, the armour takes its share of). */
  private meHp = 100;
  road: Road;
  rides: Ride[] = [];
  me!: Ride;
  trucks: Ride[] = [];
  escorts: Ride[] = [];
  convoyS = 340;
  convoySpeed = 25;
  camPos = new THREE.Vector3();
  camLook = new THREE.Vector3();
  hud: HTMLDivElement;
  engine: { o1: OscillatorNode; o2: OscillatorNode; f: BiquadFilterNode; g: GainNode; n: AudioBufferSourceNode; ng: GainNode } | null = null;
  shake = 0;
  pistol = 3;
  active = false;
  over = false;
  constructor(public s: Story) {
    this.road = CONVOY.road!;
    this.hud = document.createElement('div');
    this.hud.style.cssText = 'position:fixed;right:28px;bottom:28px;z-index:30;font:600 15px "Oswald",sans-serif;color:#e8e0d0;text-align:right;letter-spacing:.08em;text-shadow:0 2px 6px #000;pointer-events:none;opacity:0;transition:opacity .4s';
    document.body.appendChild(this.hud);
  }
  add(role: Role, kind: Car['kind'], s: number, lane: number, speed: number, color?: number) {
    const car = new Car(kind, color);
    const p = this.road.pos(s, LANES[lane]);
    car.x = p.x;
    car.z = p.z;
    car.yaw = Math.atan2(p.tx, p.tz);
    car.speed = speed;
    car.rs = s;
    this.s.game.scene.add(car.group);
    const r: Ride = { car, role, lane, want: speed };
    this.rides.push(r);
    return r;
  }
  remove(r: Ride) {
    r.car.group.removeFromParent();
    r.smoke?.removeFromParent();
    this.rides = this.rides.filter((x) => x !== r);
  }
  setup(at: number, convoyAhead: number, withEscorts: boolean) {
    for (const r of [...this.rides]) this.remove(r);
    this.trucks = [];
    this.escorts = [];
    this.me = this.add('player', 'saloon', at, 1, 0);
    this.me.car.hp = this.me.car.maxHp = 100;
    this.convoyS = at + convoyAhead;
    this.trucks.push(this.add('truck', 'truck', this.convoyS + 18, 1, this.convoySpeed));
    this.trucks.push(this.add('truck', 'truck', this.convoyS, 1, this.convoySpeed));
    if (withEscorts) {
      const st: [number, number][] = [[-14, 0], [6, 2], [30, 0]];
      for (const [i, [ds, lane]] of st.entries()) {
        const e = this.add('escort', 'suv', this.convoyS + ds, lane, this.convoySpeed);
        e.mode = 'guard';
        e.modeT = rand(2, 5);
        e.station = [ds, lane];
        e.car.hp = e.car.maxHp = 60;
        void i;
        this.escorts.push(e);
      }
    }
    const p = this.me.car;
    this.camPos.set(p.x - p.fx * 8, 3, p.z - p.fz * 8);
    this.camLook.set(p.x + p.fx * 10, 1, p.z + p.fz * 10);
  }

  // ------------------------------------------------------------------ the engine's note
  startEngine() {
    const c = this.s.game.audio.ctx;
    if (!c || this.engine) return;
    const o1 = c.createOscillator();
    o1.type = 'sawtooth';
    const o2 = c.createOscillator();
    o2.type = 'square';
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    const g = c.createGain();
    g.gain.value = 0;
    o1.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.s.game.audio.amb);
    // the road under the tyres: filtered noise
    const len = c.sampleRate * 2;
    const nb = c.createBuffer(1, len, c.sampleRate);
    const d = nb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
      d[i] = last * 4;
    }
    const n = c.createBufferSource();
    n.buffer = nb;
    n.loop = true;
    const ng = c.createGain();
    ng.gain.value = 0;
    n.connect(ng);
    ng.connect(this.s.game.audio.amb);
    o1.start();
    o2.start();
    n.start();
    this.engine = { o1, o2, f, g, n, ng };
  }
  stopEngine() {
    const e = this.engine;
    if (!e) return;
    const c = this.s.game.audio.ctx!;
    e.g.gain.setTargetAtTime(0, c.currentTime, 0.3);
    e.ng.gain.setTargetAtTime(0, c.currentTime, 0.3);
    setTimeout(() => {
      e.o1.stop();
      e.o2.stop();
      e.n.stop();
    }, 1500);
    this.engine = null;
  }

  // ------------------------------------------------------------------ a frame
  update(dt: number, input: { throttle: number; steer: number; handbrake: boolean }) {
    const g = this.s.game;
    const road = this.road;
    const me = this.me.car;
    // her car
    if (this.active && !this.over) me.drive(dt, input.throttle, input.steer, input.handbrake);
    else me.drive(dt, me.speed > 1 ? -0.3 : 0, 0, false);
    // the convoy rolls on at its own pace (it eases off while its cars are still at her: near the
    // exit, and once the tail's been sent after her - and stays eased off for the run in)
    const escortsLeft = this.escorts.filter((e) => !e.car.dead).length;
    const lead = this.trucks[0]?.car;
    if (lead && escortsLeft > 0 && (lead.rs > CONVOY.exit - 900 || this.tailSent)) this.convoySpeed = damp(this.convoySpeed, 19, 0.5, dt);

    this.convoyS += this.convoySpeed * dt;
    // (a convoy waits for its slowest: a truck held up behind her car, the rest ease off for it)
    const rear = this.trucks[1]?.car;
    if (rear && rear.rs < this.convoyS - 25) this.convoyS = rear.rs + 25;
    for (const r of this.rides) {
      if (r === this.me) continue;
      const c = r.car;
      if (r.role === 'truck') {
        const i = this.trucks.indexOf(r);
        this.aiDrive(r, LANES[1] + (i === 0 ? 0.2 : 0), this.convoySpeed + (this.convoyS + (i === 0 ? 18 : 0) - c.rs) * 0.4, dt);
      } else if (r.role === 'escort') this.escortAI(r, dt);
      else this.aiDrive(r, LANES[r.lane], r.want, dt);
    }
    // the barriers, the knocks
    for (const r of this.rides) {
      r.car.hitCar = 0;
      r.car.keepOnRoad(road);
    }
    for (let i = 0; i < this.rides.length; i++)
      for (let j = i + 1; j < this.rides.length; j++) {
        const a = this.rides[i].car, b = this.rides[j].car;
        if (Math.abs(a.rs - b.rs) > 16) continue;
        if (collideCars(a, b) && (this.rides[i] === this.me || this.rides[j] === this.me)) {
          const v = Math.max(a.hitCar, b.hitCar);
          // (her car's armoured and heavy where it counts: a ram costs an escort far more than her)
          const other = this.rides[i] === this.me ? this.rides[j] : this.rides[i];
          if (other.role === 'escort' && v > 0.6) other.car.hp -= v * 3.2;
          if (other.role === 'escort') other.shoved = 1.6;
          if (v > 1.5) {
            g.audio.play('metal_hit', { pos: new THREE.Vector3((a.x + b.x) / 2, 0.8, (a.z + b.z) / 2), vol: clamp(0.25 + v * 0.05, 0.25, 1), pitch: 0.7 + Math.random() * 0.3 });
            this.shake = Math.max(this.shake, clamp(v * 0.04, 0.1, 0.6));
            g.fx.sparks(new THREE.Vector3((a.x + b.x) / 2, 0.6, (a.z + b.z) / 2), new THREE.Vector3(0, 1, 0), Math.round(6 + v));
          }
        }
      }
    // the knocks: hers (the noise of it), and theirs
    for (const r of this.rides) {
      const c = r.car;
      if (r === this.me) {
        if (c.hitBarrier > 1.5) {
          g.audio.play('metal_hit', { pos: new THREE.Vector3(c.x, 0.6, c.z), vol: clamp(0.2 + c.hitBarrier * 0.05, 0.2, 0.9), pitch: 0.5 + Math.random() * 0.2 });
          g.fx.sparks(new THREE.Vector3(c.x + Math.cos(c.yaw) * Math.sign(c.rd) * -1, 0.5, c.z), new THREE.Vector3(0, 1, 0), 10);
          this.shake = Math.max(this.shake, clamp(c.hitBarrier * 0.05, 0.1, 0.5));
        }
        continue;
      }
      // (an escort she's shoved into the barrier: the barrier's hers too)
      if (r.shoved && r.shoved > 0) {
        r.shoved -= dt;
        if (c.hitBarrier > 1.0 && !c.dead) c.hp -= c.hitBarrier * 2.6;
      }
      if (c.hp <= 0 && !c.dead) this.wreck(r);
    }
    // (Viper's car is armoured: of what this frame dealt it, it takes a share)
    if (me.hp > this.meHp) this.meHp = me.hp;
    const taken = this.meHp - me.hp;
    if (taken > 0) me.hp = this.meHp - taken * ARMOUR;
    this.meHp = me.hp;
    // the traffic: ahead of her, out of sight, in a lane; gone once far behind
    if (this.active) {
      const traffic = this.rides.filter((r) => r.role === 'traffic');
      for (const t of traffic) if (t.car.rs < me.rs - 160 || t.car.rs > me.rs + 700) this.remove(t);
      if (traffic.length < 9 && Math.random() < dt * 1.2) {
        const s = me.rs + 320 + Math.random() * 250;
        const lane = Math.floor(Math.random() * 3);
        const busy = this.rides.some((r) => Math.abs(r.car.rs - s) < 18 && Math.abs(r.car.rd - LANES[lane]) < 2.5);
        if (!busy && s < road.length - 50) {
          const kind = Math.random() < 0.2 ? 'van' : 'civic';
          this.add('traffic', kind, s, lane, 17 + Math.random() * 8, kind === 'van' ? 0xd8d8d0 : [0x8a2a2a, 0x2a4a8a, 0x9a9a9a, 0x2a2a2a, 0xc8b070, 0x3a6a3a][Math.floor(Math.random() * 6)]);
        }
      }
    }
    for (const r of this.rides) {
      r.car.sync();
      if (r.smoke) {
        r.smoke.position.set(r.car.x, 1.2, r.car.z);
        const pos = r.smoke.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          let y = pos.getY(i) + dt * 1.6;
          if (y > 5) y = 0;
          pos.setY(i, y);
        }
        pos.needsUpdate = true;
      }
    }
    // the sound of it
    const e = this.engine;
    if (e) {
      const c = g.audio.ctx!;
      const sp = Math.abs(me.speed);
      const gear = Math.min(5, Math.floor(sp / 10));
      const rev = 0.25 + ((sp - gear * 10) / 10) * 0.75;
      const hz = 38 + gear * 6 + rev * 70;
      e.o1.frequency.setTargetAtTime(hz, c.currentTime, 0.05);
      e.o2.frequency.setTargetAtTime(hz * 0.5, c.currentTime, 0.05);
      e.f.frequency.setTargetAtTime(300 + rev * 900 + Math.max(0, input.throttle) * 600, c.currentTime, 0.08);
      e.g.gain.setTargetAtTime(this.over ? 0 : 0.05 + Math.max(0, input.throttle) * 0.05, c.currentTime, 0.1);
      e.ng.gain.setTargetAtTime(this.over ? 0 : Math.min(0.12, sp * 0.003 + Math.abs(me.slip) * 0.03), c.currentTime, 0.1);
    }
    // the hud
    this.hud.style.opacity = this.active && !this.s.inScene ? '1' : '0';
    const kmh = Math.round(Math.abs(me.speed) * 3.6);
    const dmg = clamp(me.hp / me.maxHp, 0, 1);
    const bar = '■'.repeat(Math.round(dmg * 10)) + '<span style="opacity:.25">' + '■'.repeat(10 - Math.round(dmg * 10)) + '</span>';
    const gap = Math.max(0, Math.round((this.trucks[1]?.car.rs ?? 0) - me.rs));
    this.hud.innerHTML = `<div style="font-size:44px;line-height:1">${kmh}<small style="font-size:14px"> KM/H</small></div><div style="margin-top:6px">CAR ${bar}</div><div>CONVOY ${gap} M · PISTOL ${'●'.repeat(this.pistol)}${'○'.repeat(Math.max(0, 3 - this.pistol))}</div>`;
    // dawn comes on as she goes
    CONVOY.dawn = clamp(me.rs / road.length, 0, 1) * 0.85;
    // she's in the car (for the listener and the lights round her) - not on foot under it: no
    // steps, no swings, whatever the scenes in between leave her as
    const p = g.player;
    p.x = me.x;
    p.z = me.z;
    p.vx = p.vz = 0;
    p.scripted = true;
    p.autopilot = null;
    p.model.group.visible = false;
  }

  /** Follow the road at a lane and a speed (braking for whoever's ahead in it). */
  aiDrive(r: Ride, d: number, speed: number, dt: number, ram: Car | null = null) {
    const c = r.car;
    let want = speed;
    for (const o of this.rides) {
      // (it keeps its distance behind whoever's ahead in its lane - except the car it means to hit)
      if (o === r || o.car === ram) continue;
      const ds = o.car.rs - c.rs;
      if (ds > 0 && ds < 22 && Math.abs(o.car.rd - d) < 2.4) want = Math.min(want, o.car.speed - 1 + (ds - 10) * 0.3);
    }
    const ahead = this.road.pos(c.rs + 8 + Math.max(0, c.speed) * 0.45, d);
    const wantYaw = Math.atan2(ahead.x - c.x, ahead.z - c.z);
    const err = Math.atan2(Math.sin(wantYaw - c.yaw), Math.cos(wantYaw - c.yaw));
    c.drive(dt, clamp((want - c.speed) * 0.3, -1, 1), clamp(err * 2.4, -1, 1), false);
  }
  /** The lane nearest `d` with nothing slower in the next stretch of it (her car aside: that's the one it's after). */
  clearLane(r: Ride, d: number) {
    const c = r.car;
    const blocked = (x: number) =>
      this.rides.some((o) => o !== r && o !== this.me && !o.car.dead && o.car.rs - c.rs > -2 && o.car.rs - c.rs < 32 && Math.abs(o.car.rd - x) < 2.6 && o.car.speed < c.speed + 3);
    if (!blocked(d)) return d;
    for (const x of [...LANES].sort((a, b) => Math.abs(a - d) - Math.abs(b - d))) if (!blocked(x)) return x;
    return d;
  }
  /** An escort: keeps its place by the trucks until she's close, then comes at her - alongside, and in. */
  escortAI(r: Ride, dt: number) {
    const c = r.car;
    const me = this.me.car;
    if (c.dead) {
      c.drive(dt, c.speed > 0.5 ? -0.4 : 0, 0, false);
      return;
    }
    r.modeT = (r.modeT ?? 0) - dt;
    const gap = me.rs - c.rs;
    if (r.mode === 'guard' && Math.abs(gap) < 70 && this.active && (r.modeT ?? 0) <= 0) {
      r.mode = 'ram';
      r.modeT = rand(5, 8);
    } else if (r.mode === 'ram' && (r.modeT ?? 0) <= 0) {
      r.mode = 'back';
      r.modeT = rand(2, 4);
    } else if (r.mode === 'back' && (r.modeT ?? 0) <= 0) {
      r.mode = 'guard';
      r.modeT = rand(1, 3);
    }
    if (r.mode === 'ram') {
      // alongside her, then into her side
      const along = Math.abs(gap) < 4;
      let d = along ? me.rd : me.rd + (me.rd > c.rd ? -3.6 : 3.6);
      // (still coming up on her: round whatever's in the way - a truck, the traffic - by the
      // clearest lane, rather than sitting behind it)
      if (gap > 10) d = this.clearLane(r, d);
      // (at her pace, a little more from behind - never slower than a car on a motorway)
      this.aiDrive(r, clamp(d, -CONVOY.half + 1, CONVOY.half - 1), Math.max(14, me.speed) + clamp(gap * 0.8, -8, 10), dt, me);
    } else {
      const st = r.station ?? [0, 1];
      const target = this.convoyS + st[0];
      this.aiDrive(r, LANES[st[1]], this.convoySpeed + clamp((target - c.rs) * 0.4, -6, 8), dt);
    }
  }
  /** The two from the slip road are on the road. */
  tailSent = false;
  /** More of them out of a slip road behind her: straight at her, and they don't let up. */
  addTail(n: number) {
    this.tailSent = true;
    const me = this.me.car;
    const out: Ride[] = [];
    for (let i = 0; i < n; i++) {
      const lane = i % 2 ? 2 : 0;
      const e = this.add('escort', 'suv', me.rs - 60 - i * 22, lane, Math.max(20, me.speed + 4));
      e.mode = 'ram';
      e.modeT = 1e9;
      e.station = [0, lane];
      e.car.hp = e.car.maxHp = 50;
      this.escorts.push(e);
      out.push(e);
    }
    return out;
  }
  /** Out of it: it coasts, smoking, onto the shoulder. */
  wreck(r: Ride) {
    const g = this.s.game;
    r.car.dead = true;
    g.audio.play('metal_hit', { pos: new THREE.Vector3(r.car.x, 1, r.car.z), vol: 0.9, pitch: 0.4 });
    g.audio.play('wood_break', { pos: new THREE.Vector3(r.car.x, 1, r.car.z), vol: 0.5, pitch: 0.6 });
    const n = 40;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 1.2, Math.random() * 5, (Math.random() - 0.5) * 1.2], i * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sm = new THREE.Points(geo, new THREE.PointsMaterial({ map: softGlowTexture(), color: 0x3a3a3a, size: 2.2, transparent: true, opacity: 0.5, depthWrite: false }));
    g.scene.add(sm);
    r.smoke = sm;
    if (r.role === 'escort') this.s.bark('SCARLET', ['One down.', 'Off the road.', 'Stay down.', 'Next.', 'That\'s the last of you.'][this.escorts.filter((e) => e.car.dead).length - 1] ?? 'Next.', 1.6);
  }
  /** R: a shot at the nearest escort ahead (its tyres). */
  shoot() {
    const g = this.s.game;
    const me = this.me.car;
    if (this.pistol <= 0) return;
    let best: Ride | null = null;
    let bd = 45;
    for (const e of this.escorts) {
      if (e.car.dead) continue;
      const dx = e.car.x - me.x, dz = e.car.z - me.z;
      const d = Math.hypot(dx, dz);
      const ahead = (dx * me.fx + dz * me.fz) / (d || 1);
      if (d < bd && ahead > 0.35) {
        bd = d;
        best = e;
      }
    }
    if (!best) return;
    this.pistol--;
    g.audio.play('punch_heavy', { pos: new THREE.Vector3(me.x, 1.2, me.z), vol: 0.8, pitch: 2.2 });
    best.car.hp -= 55;
    best.car.slip += (Math.random() < 0.5 ? -1 : 1) * 5;
    best.car.speed *= 0.8;
    g.fx.sparks(new THREE.Vector3(best.car.x, 0.4, best.car.z), new THREE.Vector3(0, 1, 0), 12);
    this.s.bark('SCARLET', 'Tyre.', 1.0);
  }
  /** The car cam: behind and above, looking down the road, wider and further back with speed. */
  camera(realDt: number) {
    const g = this.s.game;
    const c = this.me.car;
    const sp = Math.abs(c.speed);
    const back = 7.2 + sp * 0.05;
    const want = new THREE.Vector3(c.x - c.fx * back, 2.6 + sp * 0.012, c.z - c.fz * back);
    const look = new THREE.Vector3(c.x + c.fx * 9, 1.1, c.z + c.fz * 9);
    const k = 1 - Math.exp(-realDt * 7);
    this.camPos.lerp(want, k);
    this.camLook.lerp(look, 1 - Math.exp(-realDt * 10));
    this.shake = Math.max(0, this.shake - realDt * 1.6);
    const sh = this.shake * this.shake;
    const pos = this.camPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    const m = new THREE.Matrix4().lookAt(pos, this.camLook, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    g.cam.setPose(pos, q, 62 + sp * 0.32);
  }
  dispose() {
    this.stopEngine();
    this.hud.remove();
    for (const r of [...this.rides]) this.remove(r);
  }
}

let chase: Chase | null = null;

/** The wheel: from the keys (or the test bot, which drives like someone in a hurry). */
function controls(s: Story): { throttle: number; steer: number; handbrake: boolean } {
  const g = s.game;
  const inp = g.input;
  if (g.params.get('bot') === '1' && chase) {
    const me = chase.me.car;
    // the nearest live escort (or, with none left, Ivy's truck): alongside it, then into it
    let tgt: Car | null = null;
    let d = 0;
    let best = Infinity;
    for (const x of chase.escorts) {
      if (x.car.dead) continue;
      const gap = Math.abs(x.car.rs - me.rs);
      if (gap < best) {
        best = gap;
        tgt = x.car;
      }
    }
    if (tgt) d = Math.abs(tgt.rs - me.rs) < 8 ? tgt.rd : tgt.rd + (me.rd > tgt.rd ? 1.6 : -1.6);
    else if (chase.trucks[1]) {
      tgt = chase.trucks[1].car;
      d = tgt.rd - 3.6;
    }
    const ahead = chase.road.pos(me.rs + 10 + Math.max(0, me.speed) * 0.4, clamp(d, -CONVOY.half + 1.2, CONVOY.half - 1.2));
    const wantYaw = Math.atan2(ahead.x - me.x, ahead.z - me.z);
    const err = Math.atan2(Math.sin(wantYaw - me.yaw), Math.cos(wantYaw - me.yaw));
    if (tgt && tgt !== chase.trucks[1]?.car && chase.pistol > 0 && Math.random() < 0.01) chase.shoot();
    // (matching its speed to stay alongside: a little faster from behind, easing off past it; one
    // coming up from behind is waited for at a steady pace, never backed up into)
    let throttle = tgt ? clamp((tgt.rs - me.rs) * 0.12 + (tgt.speed - me.speed) * 0.3 + 0.15, -1, 1) : 1;
    if (tgt && tgt.rs < me.rs - 10) throttle = me.speed > 18 ? -0.4 : 0.35;
    if (me.speed < 6 && throttle < 0) throttle = 0.2;
    return { throttle, steer: clamp(err * 2.2, -1, 1), handbrake: false };
  }
  return { throttle: clamp(inp.moveY, -1, 1), steer: clamp(-inp.moveX, -1, 1), handbrake: inp.isHeld('dodge') };
}

export const CH5: Chapter = {
  id: 5,
  kick: 'CHAPTER FIVE',
  title: 'THE TRUCKS LEAVE AT DAWN',
  place: 'THE RIVER EXPRESSWAY',
  clock: '4:52 AM',
  map: 'convoy',
  outfit: 'denim',
  synopsis: 'Viper\'s car, Voss\'s convoy, and the river road to Palewater.',
  par: 300,
  next: { kick: 'CHAPTER SIX', title: 'NIGHT SHIFT', line: 'She knows Palewater\'s doors. She used to guard them.' },
  setup(s) {
    const g = s.game;
    // (behind the wheel: the car's own readout, not her fight's)
    s.noHud = true;
    chase = new Chase(s);
    const at = s.cp >= 2 ? 1800 : s.cp >= 1 ? 600 : 10;
    chase.setup(at, s.cp >= 1 ? 70 : 340, true);
    // (from the last checkpoint the escorts are long gone: off the road behind her)
    if (s.cp >= 2) {
      for (const e of chase.escorts) chase.remove(e);
      chase.escorts = [];
    }
    g.player.model.group.visible = false;
    g.player.scripted = true;
    g.camOverride = (realDt) => chase?.camera(realDt);
    // (for the test bot's probes)
    if (g.params.get('bot') === '1') (window as unknown as { __chase: Chase | null }).__chase = chase;
    g.music.duck(1);
  },
  tick(s, dt) {
    if (!chase) return;
    const g = s.game;
    if (g.paused || g.over) return;
    // R (the right trigger): the pistol out of the window
    if (g.input.consume('special') && chase.active && !s.inScene) chase.shoot();
    chase.update(Math.min(dt, 0.05), controls(s));
    // wrecked: the end of the road
    if (chase.me.car.hp <= 0 && !chase.over && !g.over && g.params.get('god') !== '1') lose(s, 'WRECKED', 'Viper\'s car is armoured. It isn\'t a tank.');
    // the convoy at its exit while she's still behind it: through Palewater's gates without her
    else if (chase.active && !chase.over && !g.over && (chase.trucks[0]?.car.rs ?? 0) > CONVOY.exit - 150) lose(s, 'THEY GOT AWAY', 'The trucks went through Palewater\'s gates without you. Catch them before the exit.');
  },
  segments: [
    // ------------------------------------------------------------------ out of the garage
    {
      name: 'THE RIVER ROAD',
      async play(s) {
        const g = s.game;
        const c = chase!;
        await s.scene(async () => {
          s.ui.card('CHAPTER FIVE', 'THE TRUCKS LEAVE AT DAWN', 'THE RIVER EXPRESSWAY', '4:52 AM');
          await s.wait(4.4);
          s.ui.cardHide();
          s.ui.fade(false, 1.4);
          const m = c.me.car;
          s.shot({ pos: [m.x + 3.2, 1.1, m.z - 4.5], look: [m.x, 0.9, m.z], pos2: [m.x + 3.6, 1.2, m.z - 3.6], fov: 40, dur: 5 });
          c.startEngine();
          await s.wait(1.2);
          await s.say('SCARLET', 'Nice car, Viper.', 1.6);
          s.shot({ pos: [m.x - 1.5, 3.2, m.z - 14], look: [m.x + m.fx * 300, 2, m.z + m.fz * 300], fov: 34, dur: 6 });
          s.ui.stamp('THE RIVER EXPRESSWAY', '4:52 AM');
          await s.wait(1.6);
          s.bark('KX', '<em>(radio)</em> Convoy\'s rolling. Palewater in twenty. Nobody stops for anything.', 3.6, null);
          await s.wait(3.6);
        });
        c.active = true;
        s.objective('THE CONVOY', 'Catch the trucks before Palewater');
        void s.tutor(['W', 'A', 'S', 'D'], 'DRIVE', 'W throttle, S brake, A / D steer, SPACE the handbrake', () => (Math.abs(c.me.car.speed) > 25 ? 1 : 0), 1);
        await s.until(() => (c.trucks[1]?.car.rs ?? 0) - c.me.car.rs < 90, false);
        s.hideTutor();
      },
    },
    // ------------------------------------------------------------------ the escorts
    {
      name: 'THE ESCORTS',
      async play(s) {
        const c = chase!;
        c.active = true;
        s.bark('KX', '<em>(radio)</em> Black car coming up fast — that\'s Viper\'s car. Take it off the road!', 3.4, null);
        const left = () => c.escorts.filter((e) => !e.car.dead).length;
        s.objective('THE ESCORTS', `Run them into the barriers · R: the pistol (${3 - left()}/3)`);
        void s.tutor(['R'], 'THE PISTOL', 'An escort ahead of you, in range: R puts a round through a tyre', () => 3 - c.pistol, 1, () => left() === 0);
        let shown = left();
        await s.until(() => {
          const n = left();
          if (n !== shown) {
            shown = n;
            s.objective('THE ESCORTS', `Run them into the barriers · R: the pistol (${3 - n}/3)`);
          }
          return n === 0;
        }, false);
        s.hideTutor();
        // and two more out of the slip road behind her: the tail, sent down from Meridian (only with
        // the road left to deal with them before the exit)
        await s.wait(1.6, false);
        if ((c.trucks[0]?.car.rs ?? 0) > CONVOY.exit - 1500) return;
        s.bark('KX', '<em>(radio)</em> Two cars on the slip road behind her. Put her into the barrier!', 3.2, null);
        await s.wait(2.0, false);
        const tail = c.addTail(2);
        // (the glovebox: Viper keeps a spare clip in it)
        c.pistol = 3;
        s.objective('THE TAIL', 'Two more coming up behind you — run them off the road · R: a fresh clip');
        await s.until(() => tail.every((r) => r.car.dead), false);
        await s.wait(1.0, false);
        s.bark('SCARLET', 'That\'s all of them. Now the truck.', 2.2);
      },
    },
    // ------------------------------------------------------------------ Ivy's truck
    {
      name: 'IVY\'S TRUCK',
      async play(s) {
        const g = s.game;
        const c = chase!;
        c.active = true;
        s.objective('IVY\'S TRUCK', 'Get alongside the second truck');
        await s.until(() => {
          const t = c.trucks[1]?.car;
          if (!t) return true;
          return Math.abs(t.rs - c.me.car.rs) < 7 && Math.abs(t.rd - c.me.car.rd) < 4.6;
        }, false);
        c.active = false;
        s.objective(null);
        const t = c.trucks[1].car;
        await s.scene(async () => {
          // alongside: the truck's box a metre from her window; she can hear someone banging inside it
          s.shot({ pos: [c.me.car.x - c.me.car.fx * 2 + Math.cos(c.me.car.yaw) * 2.8, 1.6, c.me.car.z - c.me.car.fz * 2 - Math.sin(c.me.car.yaw) * 2.8], look: [t.x, 2, t.z], fov: 46, dur: 4 });
          for (let i = 0; i < 3; i++) {
            g.audio.play('body_hit', { pos: new THREE.Vector3(t.x, 2, t.z), vol: 0.6, pitch: 0.8 });
            await s.wait(0.35);
          }
          await s.say('SCARLET', 'IVY! I\'m here! I\'m right here!', 2.4);
          await s.say('IVY', '<em>(through the steel)</em> SCAR!', 1.6, { phone: true });
          // the exit: the trucks peel off for Palewater; the gates; her car into them as they close
          s.shot({ pos: [t.x - t.fx * 30, 6, t.z - t.fz * 30], look: [t.x + t.fx * 60, 1, t.z + t.fz * 60], fov: 40, dur: 6 });
          await s.wait(2.6);
          s.ui.item('5:14 AM', 'PALEWATER · NEXT EXIT', 'The gates are already opening for them', 3);
          await s.wait(2.4);
          s.ui.fade(true, 0.6);
          await s.wait(0.6);
          g.audio.play('metal_hit', { vol: 1, pitch: 0.35 });
          g.audio.play('wood_break', { vol: 0.8, pitch: 0.5 });
          g.cam.addTrauma(0.8);
          await s.wait(1.8);
          await s.say('SCARLET', '...Ivy.', 1.6);
          await s.wait(1.4);
        });
        endChase(s);
      },
    },
  ],
};

/** The chase lost: the car stops, and the chapter's retry screen says why. */
function lose(s: Story, title: string, line: string) {
  const g = s.game;
  if (!chase) return;
  chase.over = true;
  chase.active = false;
  chase.hud.style.opacity = '0';
  s.fail = { title, line };
  const p = g.player;
  p.hp = 0;
  p.alive = false;
  g.onPlayerDeath();
}

/** (the chapter's over: the car, its sounds and its hud go) */
export function endChase(s: Story) {
  if (chase) chase.dispose();
  chase = null;
  s.game.camOverride = null;
}
