import * as THREE from 'three';
import type { Game } from '../game';
import type { Arena, Door, WorldName } from '../world/arena';
import { Enemy } from '../ai/enemy';
import { Fighter } from '../combat/fighter';
import { ARCHETYPES } from '../ai/archetypes';
import type { HitInfo } from '../combat/types';
import { makeHit } from '../combat/types';
import type { SceneShot } from '../fx/camera';
import { CameraRig } from '../fx/camera';
import { clamp, pick, rand, wrapAngle, yawFromDir } from '../core/math';
import { StoryUI, PhoneMsg } from './ui';
import { CheckpointState, fmtTime, gradeRun, launchStory, loadProgress, saveProgress, StoryLaunch, GRADE_ORDER } from './save';

type P3 = THREE.Vector3 | [number, number, number];
/** A cutscene shot as a chapter writes it (points as vectors or [x, y, z]). */
export interface ShotSpec {
  pos: P3;
  look: P3;
  pos2?: P3;
  look2?: P3;
  fov?: number;
  fov2?: number;
  dur?: number;
  ease?: SceneShot['ease'];
  blendIn?: number;
  drift?: number;
}

/** A stretch of a chapter between checkpoints. */
export interface Segment {
  /** Shown when a checkpoint is reached at the start of this stretch. */
  name: string;
  /** Coming back to this checkpoint after a death: put her (and anything the stretch needs) in place. */
  resume?: (s: Story) => void;
  play: (s: Story) => Promise<void>;
}

export interface Chapter {
  id: number;
  /** 'PROLOGUE', 'CHAPTER ONE'. */
  kick: string;
  title: string;
  place: string;
  clock: string;
  map: WorldName;
  /** One line for the chapter select. */
  synopsis: string;
  /** Seconds of play an A-grade run takes (scenes not counted). */
  par: number;
  /** Set dressing, before the physics are built (signs, a pen, a door that's shut). */
  dress?: (a: Arena) => void;
  /** After the game is up: the chapter's actors and sounds. */
  setup?: (s: Story) => void;
  /** Per frame (real seconds), while the chapter runs. */
  tick?: (s: Story, dt: number) => void;
  segments: Segment[];
  /** What the results screen teases. */
  next?: { kick: string; title: string; line: string } | null;
  /** The shot behind the results: the place, quiet now. */
  backdrop?: ShotSpec;
}

/** How each speaker carries a line: a raised voice comes with bigger hands. */
const HEATED: Record<string, number> = { DOYLE: 0.5, 'THE BUTCHER': 0.7, KAEL: 0.6, VIPER: 0.35 };

interface Waiter {
  done: () => boolean;
  resolve: () => void;
  /** Resolves at once when a scene is skipped. */
  skippable: boolean;
}

/**
 * Runs a chapter's script: its scenes (letterboxed, the player not steering, skippable), its fights,
 * objectives and tutorial prompts, checkpoints, the results - and the game's hooks into it (kills,
 * death, the frame).
 */
export class Story {
  ui: StoryUI;
  /** Seconds of play (scenes not counted). */
  time = 0;
  retries = 0;
  /** No fight on: her health comes back. */
  calm = true;
  inScene = false;
  /** The scene is being skipped: everything it waits for comes at once. */
  skipping = false;
  private skipHold = 0;
  private sceneSkippable = true;
  private waiters: Waiter[] = [];
  private triggers: { when: () => boolean; fn: () => void }[] = [];
  /** The fight on now: its last man down ends it (with the final blow's slow motion). */
  encounter: Enemy[] = [];
  /** The dead, for a checkpoint's bodies. */
  private fallen: Enemy[] = [];
  private staged: [number, number, string][] = [];
  cp = 0;
  started = false;
  finished = false;
  halted = false;
  private lastState: CheckpointState | null = null;
  /** For tests: no gate, scenes skipped as they start. */
  auto = false;
  private skipAll = false;
  /** Flags a chapter's script sets and reads (who's been seen, what she's taken). */
  flags: Record<string, unknown> = {};
  /** A soft light on the faces in dialogue (a scene's lighting rig: off outside close coverage). */
  private fill: THREE.PointLight | null = null;
  /** A boss reached a new phase: the chapter stages it (true: the default reinforcements don't come). */
  onBossPhase: ((e: Enemy, phase: number) => boolean) | null = null;

  constructor(public game: Game, public chapter: Chapter, launch: StoryLaunch) {
    this.ui = new StoryUI();
    this.cp = Math.max(0, Math.min(chapter.segments.length - 1, launch.cp));
    const st = launch.state;
    if (st && st.chapter === chapter.id) {
      this.lastState = st;
      this.retries = st.retries;
    }
    this.auto = game.params.get('autostart') === '1';
    this.skipAll = game.params.get('skipscenes') === '1';
  }

  // ================================================================== lifecycle
  /** The game is up: the card, then (on a key) the chapter from its checkpoint. */
  async begin() {
    const g = this.game;
    const c = this.chapter;
    this.fill = new THREE.PointLight(0xffe4cc, 0, 4.5, 2);
    g.scene.add(this.fill);
    this.chapter.setup?.(this);
    // where she stood, what she had: back as it was at the checkpoint
    if (this.lastState) this.restore(this.lastState);
    if (this.cp > 0) c.segments[this.cp].resume?.(this);
    this.ui.card('SCARLET', 'BEFORE DAWN', `${c.kick} · ${c.title}`, this.cp > 0 ? 'CHECKPOINT' : '', '');
    if (!this.auto) {
      await this.realWait(1.6);
      this.ui.cardGate('PRESS ANY KEY');
      await new Promise<void>((res) => {
        let done = false;
        const go = () => {
          if (done) return;
          done = true;
          window.removeEventListener('keydown', go, true);
          window.removeEventListener('pointerdown', go, true);
          res();
        };
        window.addEventListener('keydown', go, true);
        window.addEventListener('pointerdown', go, true);
        // (a gamepad: any button)
        const poll = () => {
          if (done) return;
          const pads = navigator.getGamepads?.() ?? [];
          if (pads.some((p) => p && p.buttons.some((b) => b.pressed))) go();
          else requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
      });
      this.ui.cardGate('');
    }
    g.audio.resume();
    g.input.requestLock();
    g.input.clearBuffer();
    this.ui.fade(true, 0.01);
    this.ui.cardHide();
    g.hud?.show(null);
    g.started = true;
    g.paused = false;
    g.audio.startAmbience(g.arena.map);
    g.music.start();
    this.started = true;
    await this.realWait(0.6);
    // (from the top, the chapter's opening brings the picture up itself; from a checkpoint, up it comes)
    if (this.cp > 0) this.ui.fade(false, 1.2);
    // (after a death everything the script still waits for just never comes: it stops there)
    for (let i = this.cp; i < c.segments.length; i++) {
      this.checkpoint(i, i > this.cp);
      await c.segments[i].play(this);
    }
    await this.complete();
  }

  /** Per frame, after the game's step (real seconds; the game's own dt). */
  update(realDt: number) {
    if (!this.started) {
      this.ui.update(realDt, this.game.cam.camera, this.game.player.model.group.position);
      return;
    }
    const g = this.game;
    if (!this.inScene && !this.finished && !g.over) this.time += realDt;
    this.chapter.tick?.(this, realDt);
    // skipping a scene: hold SPACE / A
    if (this.inScene && this.sceneSkippable && !this.skipping) {
      const held = g.input.isHeld('dodge');
      this.skipHold = held ? this.skipHold + realDt : Math.max(0, this.skipHold - realDt * 3);
      this.ui.skip(true, Math.min(1, this.skipHold / 0.7));
      if (this.skipHold >= 0.7) this.skipScene();
    } else this.ui.skip(false);
    // the clock of every wait
    for (const w of this.waiters) {
      (w as Waiter & { t?: number }).t = ((w as Waiter & { t?: number }).t ?? 0) + realDt;
    }
    this.pump();
    for (let i = this.triggers.length - 1; i >= 0; i--) {
      const t = this.triggers[i];
      if (t.when()) {
        this.triggers.splice(i, 1);
        t.fn();
      }
    }
    this.ui.update(realDt, g.cam.camera, g.player.model.group.position);
  }

  private pump() {
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i];
      if (w.done() || (this.skipping && w.skippable)) {
        this.waiters.splice(i, 1);
        w.resolve();
      }
    }
  }

  // ================================================================== waiting
  /** Until `pred` holds (checked each frame). In a skipped scene, at once. */
  until(pred: () => boolean, skippable = true, timeout = Infinity): Promise<void> {
    if (this.halted) return new Promise(() => undefined);
    if (pred() || (skippable && this.skipping)) return Promise.resolve();
    const w: Waiter & { t: number } = { t: 0, done: () => pred() || w.t >= timeout, resolve: () => undefined, skippable };
    return new Promise((resolve) => {
      w.resolve = resolve;
      this.waiters.push(w);
    });
  }
  /** Real seconds (not slowed by slow motion; stopped by the pause). */
  wait(sec: number, skippable = true): Promise<void> {
    if (this.halted) return new Promise(() => undefined);
    if (sec <= 0 || (skippable && this.skipping)) return Promise.resolve();
    const w: Waiter & { t: number } = { t: 0, done: () => w.t >= sec, resolve: () => undefined, skippable };
    return new Promise((resolve) => {
      w.resolve = resolve;
      this.waiters.push(w);
    });
  }
  /** Before the game loop counts (the card): plain timeouts. */
  private realWait(sec: number) {
    return new Promise<void>((r) => setTimeout(r, sec * 1000));
  }
  /** Run `fn` once `when` holds (checked every frame). */
  when(when: () => boolean, fn: () => void) {
    this.triggers.push({ when, fn });
  }
  clearTriggers() {
    this.triggers.length = 0;
  }

  // ================================================================== scenes
  /**
   * A cutscene: the bars come in, the HUD steps aside, she stops steering and nobody attacks;
   * holding SPACE skips to its end (everything in it still happens, at once, under a quick black).
   */
  async scene(body: () => Promise<void>, opts: { skippable?: boolean; bars?: boolean } = {}) {
    const g = this.game;
    this.inScene = true;
    this.sceneSkippable = opts.skippable !== false;
    this.skipHold = 0;
    this.ui.bars(opts.bars !== false);
    this.ui.gameplayVisible(false);
    const p = g.player;
    p.scripted = true;
    p.sceneFace = null;
    g.director.hold = true;
    // (nothing on its way at her when the scene takes over)
    for (const e of g.enemies()) {
      if (e.state === 'attack' || e.state === 'approach') g.director.cancel(e);
    }
    if (this.skipAll && this.sceneSkippable) this.skipScene();
    try {
      await body();
    } finally {
      const skipped = this.skipping;
      this.skipping = false;
      this.ui.clearSay();
      this.ui.skip(false);
      if (skipped) this.settleActors();
      g.voice.stopAll();
      for (const f of [p, ...this.castMap.values()]) {
        f.talking = f.heated = 0;
        f.lookAt = null;
      }
      this.inScene = false;
      if (this.fill) this.fill.intensity = 0;
      this.ui.bars(false);
      this.ui.gameplayVisible(true);
      p.scripted = false;
      p.autopilot = null;
      g.director.hold = false;
      g.input.clearBuffer();
      if (g.cam.inScene) g.cam.endScene(skipped ? 0 : 0.9, this.behindYaw());
      if (skipped) {
        await this.wait(0.15, false);
        this.ui.fade(false, 0.5);
      }
    }
  }
  private skipScene() {
    if (this.skipping || !this.inScene) return;
    this.skipping = true;
    this.ui.fade(true, 0.18);
    this.ui.clearSay();
    this.pump();
  }
  /** After a skip: everyone where the scene would have left them. */
  private settleActors() {
    const g = this.game;
    const p = g.player;
    const a = p.autopilot;
    if (a && !a.done) {
      p.x = a.x;
      p.z = a.z;
      if (a.face !== undefined) p.yaw = a.face;
      p.vx = p.vz = 0;
      p.anim.initAt(p.x, p.z, p.yaw);
      a.done = true;
    }
    for (const e of g.enemies()) {
      if (e.state === 'idle' && e.idleTo) {
        e.x = e.idleTo.x;
        e.z = e.idleTo.z;
        if (e.idleFace !== null) e.yaw = e.idleFace;
        e.vx = e.vz = 0;
        e.idleTo = null;
        e.anim.initAt(e.x, e.z, e.yaw);
        if (e.idlePose) e.play(e.idlePose, { halflife: 0.01 });
      }
    }
    g.cam.snapFocus(new THREE.Vector3(p.x, 1.0, p.z));
  }
  /** The orbit's yaw behind her, looking the way she faces. */
  behindYaw(yaw = this.game.player.yaw) {
    return wrapAngle(yaw + Math.PI);
  }

  /** Put the lens here (a cut, or a move to pos2 / look2 over `dur`). */
  shot(s: ShotSpec) {
    if (this.skipping) return;
    if (this.fill) this.fill.intensity = 0;
    const v = (a: P3 | undefined) => (a === undefined ? undefined : Array.isArray(a) ? new THREE.Vector3(a[0], a[1], a[2]) : a.clone());
    this.game.cam.sceneShot({
      pos: v(s.pos)!,
      look: v(s.look)!,
      fov: s.fov ?? 40,
      pos2: v(s.pos2),
      look2: v(s.look2),
      fov2: s.fov2,
      dur: s.dur ?? 4,
      ease: s.ease ?? 'inout',
      blendIn: s.blendIn ?? 0,
      drift: s.drift ?? 0.025,
    });
  }
  /** Where a face is, right now (a fighter's head as animated; a point: a man's height there). */
  private headOf(f: Fighter | { x: number; z: number; scale?: number }, out = new THREE.Vector3()) {
    if (f instanceof Fighter) {
      f.bodyPoint('head', out);
      return out;
    }
    return out.set(f.x, 1.62 * (f.scale ?? 1), f.z);
  }
  /**
   * A shot over a fighter's shoulder at another (the classic dialogue coverage): the lens just
   * behind and beside the near one's head, on the far one's face.
   */
  overShoulder(from: Fighter | { x: number; z: number; scale?: number }, at: Fighter | { x: number; z: number; scale?: number }, o: { side?: number; dist?: number; fov?: number; dur?: number; height?: number; push?: number } = {}) {
    const fh = this.headOf(from);
    const ah = this.headOf(at);
    const dx = ah.x - fh.x, dz = ah.z - fh.z;
    const d = Math.hypot(dx, dz) || 1;
    const fx = dx / d, fz = dz / d;
    const side = o.side ?? 1;
    const back = o.dist ?? 1.0;
    const pos = new THREE.Vector3(fh.x - fx * back - fz * 0.5 * side, o.height ?? fh.y + 0.12, fh.z - fz * back + fx * 0.5 * side);
    const look = ah.clone().setY(ah.y - 0.04);
    const push = o.push ?? 0.25;
    this.shot({ pos, look, pos2: pos.clone().addScaledVector(new THREE.Vector3(fx, 0, fz), push), look2: look, fov: o.fov ?? 34, dur: o.dur ?? 5 });
    this.fillOn(pos, look);
  }
  /** The fill: between the lens and the face, a little above, soft. */
  private fillOn(cam: THREE.Vector3, face: THREE.Vector3, k = 1) {
    const f = this.fill;
    if (!f || this.skipping) return;
    const d = cam.clone().sub(face);
    const len = d.length();
    f.position.copy(face).addScaledVector(d.normalize(), Math.min(1.1, len * 0.6)).add(new THREE.Vector3(0, 0.45, 0));
    f.intensity = 2.2 * k;
  }
  /** A close-up: in front of the face, a little to one side, easing in. */
  closeUp(f: Fighter, o: { side?: number; dist?: number; fov?: number; dur?: number; push?: number; dy?: number; turn?: number } = {}) {
    const head = this.headOf(f);
    const a = f.yaw + (o.side ?? 1) * (o.turn ?? 0.5);
    const dist = o.dist ?? 1.25;
    const look = head.clone().setY(head.y - 0.05);
    const pos = new THREE.Vector3(head.x + Math.sin(a) * dist, head.y + (o.dy ?? -0.02), head.z + Math.cos(a) * dist);
    this.shot({ pos, look, pos2: pos.clone().lerp(look, o.push ?? 0.1), look2: look, fov: o.fov ?? 30, dur: o.dur ?? 5 });
    this.fillOn(pos, look);
  }

  // ================================================================== the cast
  /** Who's who in the scenes: a speaker's name and the body that says it (hers is always hers). */
  private castMap = new Map<string, Fighter>();
  /** The last one she spoke with (who she looks at when she answers). */
  private lastOther: Fighter | null = null;
  cast(name: string, f: Fighter | null) {
    if (f) this.castMap.set(name, f);
    else this.castMap.delete(name);
  }
  actorOf(who: string): Fighter | null {
    if (who === 'SCARLET') return this.game.player;
    const f = this.castMap.get(who);
    return f && f.alive && !f.down ? f : null;
  }

  /**
   * A line of dialogue: spoken (her lips, or theirs, move with it), on screen, and the two of them
   * looking at each other. Waits until it's said - or, with no voice, read.
   */
  async say(who: string, text: string, dur?: number, o: { to?: Fighter | null; heated?: number; phone?: boolean } = {}) {
    if (this.skipping) return;
    const g = this.game;
    const plain = text.replace(/<[^>]+>/g, '');
    const read = dur ?? Math.min(5.5, 1.1 + plain.length * 0.052);
    const actor = this.actorOf(who);
    const listener = o.to !== undefined ? o.to : actor === g.player ? this.lastOther : actor ? g.player : null;
    if (actor && actor !== g.player) this.lastOther = actor;
    if (actor) {
      actor.talking = 1;
      actor.heated = o.heated ?? HEATED[who] ?? 0;
      if (listener && listener !== actor) {
        actor.lookAt = listener;
        listener.lookAt = actor;
      }
    }
    const line = g.voice.speak(who, text, o.phone ? null : actor?.model ?? null, { phone: o.phone });
    const voiced = g.voice.enabled;
    const show = g.settings.subtitles !== false;
    // (the subtitle stays up for as long as the line takes)
    if (show) this.ui.say(who, text, Math.max(read, line.dur) + 2);
    const t0 = g.realTime;
    const cap = Math.max(read, line.dur) * 1.7 + 1.5;
    await this.until(() => {
      const t = g.realTime - t0;
      if (t >= cap) return true;
      return voiced ? line.done() && t >= Math.min(read, 0.9) : t >= read;
    });
    if (this.skipping) line.stop();
    if (actor) {
      actor.talking = 0;
      actor.heated = 0;
    }
    this.ui.clearSay();
    await this.wait(0.16);
  }
  /** A line in the fight: spoken and on screen, nobody waits for it. */
  bark(who: string, text: string, dur?: number) {
    const plain = text.replace(/<[^>]+>/g, '');
    const actor = this.actorOf(who);
    const line = this.game.voice.speak(who, text, actor?.model ?? null);
    if (this.game.settings.subtitles !== false) this.ui.say(who, text, Math.max(dur ?? Math.min(4, 1.2 + plain.length * 0.045), line.dur + 0.3), true);
  }

  // ================================================================== the phone
  async phone(contact: { name: string; initial: string; sub: string; clock: string }, msgs: (PhoneMsg & { wait?: number; typing?: number; clock?: string })[]) {
    const g = this.game;
    this.ui.phoneOpen(contact.name, contact.initial, contact.sub, contact.clock);
    await this.wait(0.9);
    for (const m of msgs) {
      if (m.typing && !this.skipping) {
        if (m.dir === 'out') {
          // (hers: typed into the bar, a letter at a time, then sent)
          const n = m.text.length;
          for (let i = 1; i <= n && !this.skipping; i++) {
            this.ui.phoneInput(m.text.slice(0, i));
            if (i % 2 === 0) g.audio.ui('move');
            await this.wait(m.typing / n);
          }
          this.ui.phoneInput('');
        } else {
          this.ui.phoneTyping(true);
          await this.wait(m.typing);
        }
      }
      if (m.clock) this.ui.phoneClockSet(m.clock);
      this.ui.phoneMsg(m);
      if (!this.skipping) {
        if (m.dir === 'in') g.audio.buzz?.();
        else g.audio.ui('move');
      }
      await this.wait(m.wait ?? 1.4);
    }
  }

  // ================================================================== her
  /** Put her here, facing this way (a cut). */
  place(x: number, z: number, yaw: number) {
    const p = this.game.player;
    p.x = x;
    p.z = z;
    p.yaw = yaw;
    p.vx = p.vz = 0;
    p.anim.initAt(x, z, yaw);
    this.game.cam.snapFocus(new THREE.Vector3(x, 1.0, z));
    this.game.cam.yaw = this.behindYaw(yaw);
  }
  /** Walk her to a mark (in a scene); resolves on arrival. */
  walk(x: number, z: number, o: { speed?: number; face?: number } = {}) {
    const p = this.game.player;
    // (a mark in the room - a body can come to rest in a doorway - unless she's meant to be
    // walking in from outside or out of it)
    if (!p.ghostWalls) {
      const bb = this.game.arena.bounds;
      x = clamp(x, bb.minX + 0.7, bb.maxX - 0.7);
      z = clamp(z, bb.minZ + 0.7, bb.maxZ - 0.7);
    }
    const speed = o.speed ?? 1.55;
    p.autopilot = { x, z, speed, face: o.face };
    if (this.skipping) {
      this.settleActors();
      return Promise.resolve();
    }
    // never wait forever on a mark she can't reach: a body, a prop in the way - she stops trying
    // once she's made no headway for a second or so
    const t0 = this.game.realTime;
    const limit = Math.hypot(x - p.x, z - p.z) / speed * 1.6 + 2.5;
    let bestD = Infinity, bestT = t0;
    return this.until(() => {
      const d = Math.hypot(p.x - x, p.z - z);
      const now = this.game.realTime;
      if (d < bestD - 0.05) {
        bestD = d;
        bestT = now;
      }
      const gaveUp = now - bestT > 1.3 || now - t0 > limit;
      if (gaveUp && p.autopilot) p.autopilot.done = true;
      return !!p.autopilot?.done || d < 0.12 || gaveUp;
    });
  }
  /** Where she looks while she stands in a scene. */
  face(yaw: number | { x: number; z: number }) {
    const p = this.game.player;
    p.sceneFace = typeof yaw === 'number' ? yaw : yawFromDir(yaw.x - p.x, yaw.z - p.z);
    if (p.autopilot) p.autopilot.face = p.sceneFace;
  }
  /** She holds a pose (null: back to standing). */
  pose(name: string | null, hl = 0.35) {
    const p = this.game.player;
    if (name) p.play(name, { halflife: hl, originYaw: p.yaw });
    else p.anim.toLoco(hl);
  }

  // ================================================================== them
  /** Someone standing about (idle: not in the fight until alerted). */
  spawn(key: string, x: number, z: number, yaw: number, o: { variant?: string; pose?: string | null; idle?: boolean; alertR?: number; hp?: number; group?: Enemy[] } = {}): Enemy {
    const g = this.game;
    const cfg = ARCHETYPES[key];
    const names = g.archetypes[key as keyof typeof g.archetypes] ?? g.archetypes.brawler;
    const v = g.lib.get(o.variant ?? pick(names));
    const e = new Enemy(g, g.lib, v, cfg);
    e.spawn(x, z, yaw);
    if (o.hp) e.maxHp = e.hp = o.hp;
    g.addFighter(e);
    if (o.idle !== false) {
      e.becomeIdle(yaw, o.pose ?? null);
      e.alertR = o.alertR ?? 0;
    } else {
      e.setState('circle');
      e.ghostWalls = false;
    }
    o.group?.push(e);
    return e;
  }
  /** Through a door, straight into the fight. */
  enter(key: string, door: number | Door, i = 0, o: { hp?: number } = {}): Enemy {
    const g = this.game;
    const d = typeof door === 'number' ? g.arena.doors[door] : door;
    const e = g.waves.spawn(key, d, i);
    if (o.hp) e.maxHp = e.hp = o.hp;
    this.encounter.push(e);
    return e;
  }
  /** Everyone in the group into the fight, a beat apart. */
  alert(group: Enemy[], spread = 0.5) {
    group.forEach((e, i) => e.alert(i * spread * rand(0.6, 1.2)));
  }

  /**
   * A fight: these (and anyone added to `encounter` meanwhile) until the last is down. `pressure`
   * is the endless mode's wave number the director plays it at (how many at once, how eager).
   */
  async fight(group: Enemy[], o: { pressure?: number; spread?: number } = {}) {
    const g = this.game;
    this.calm = false;
    // (anyone already sent in for this fight - through a door, by a trigger - is part of it)
    this.encounter = [...new Set([...this.encounter.filter((e) => e.alive), ...group])];
    g.director.setWave(o.pressure ?? 1);
    this.alert(group, o.spread ?? 0.45);
    await this.until(() => this.encounter.length > 0 && this.encounter.every((e) => !e.alive), false);
    this.clearTriggers();
    await this.wait(1.25, false);
    this.encounter = [];
    this.calm = true;
  }

  /** The game: an enemy died. */
  onEnemyKilled(e: Enemy, h: HitInfo) {
    void h;
    this.fallen.push(e);
    const enc = this.encounter;
    if (enc.includes(e) && enc.every((x) => !x.alive)) this.game.finalBlow(e);
  }

  /** A boss enters: the camera finds him, his bar and his name. */
  boss(e: Enemy, banner?: { name: string; sub: string; kick?: string }) {
    const g = this.game;
    // (no entrance shot: the scene before it was his entrance)
    g.bosses.register(e, false);
    if (!this.encounter.includes(e)) this.encounter.push(e);
    if (banner) g.hud?.bannerShow(banner.name, banner.sub, 3.0, banner.kick ?? 'BOSS FIGHT', true);
    g.music.stinger('boss');
  }

  // ================================================================== objectives, tutorials
  objective(text: string | null, sub = '') {
    this.ui.objective(text, sub);
  }
  /** Until she's within `r` of the point (a marker on it meanwhile). */
  async reach(x: number, z: number, r = 1.4, label = '') {
    const p = this.game.player;
    this.ui.marker(new THREE.Vector3(x, 1.2, z), label);
    await this.until(() => Math.hypot(p.x - x, p.z - z) < r, false);
    this.ui.marker(null);
  }
  /** A tutorial prompt until `done` reports `need` (it shows the count meanwhile). */
  async tutor(keys: string[], text: string, sub: string, count: () => number, need = 1, abort: () => boolean = () => false) {
    if (!this.game.settings.showHints) {
      await this.until(() => count() >= need || abort(), false);
      return;
    }
    let shown = -1;
    const show = () => {
      const n = Math.min(need, count());
      if (n !== shown) {
        shown = n;
        this.ui.tutor(keys, text, sub, need > 1 ? [n, need] : undefined);
      }
    };
    show();
    await this.until(() => {
      show();
      return count() >= need || abort();
    }, false);
    if (count() < need) {
      this.ui.tutorHide();
      return;
    }
    this.ui.tutorDone();
    this.game.audio.ui('ok');
    await this.wait(1.1, false);
    this.ui.tutorHide();
  }
  hideTutor() {
    this.ui.tutorHide();
  }

  // ================================================================== items
  givePistol(charges: number) {
    const p = this.game.player;
    p.specialLocked = false;
    p.specialCharges = charges;
    p.specialKOs = 0;
    this.flags.pistol = true;
  }

  // ================================================================== checkpoints
  private checkpoint(i: number, announce: boolean) {
    this.cp = i;
    const p = this.game.player;
    const st: CheckpointState = {
      chapter: this.chapter.id,
      cp: i,
      hp: p.hp,
      time: this.time,
      retries: this.retries,
      stats: { ...p.stats },
      bestCombo: p.bestCombo,
      pistol: !p.specialLocked,
      specialCharges: p.specialCharges,
      specialKOs: p.specialKOs,
      charges: p.charges,
      bodies: [...this.staged, ...this.fallen.map((e) => [Math.round(e.x * 100) / 100, Math.round(e.z * 100) / 100, e.variant.name] as [number, number, string])],
      flags: JSON.parse(JSON.stringify(this.flags)),
    };
    this.lastState = st;
    const pr = loadProgress();
    pr.resume = st;
    saveProgress(pr);
    if (announce) this.game.hud?.feed('CHECKPOINT', this.chapter.segments[i].name);
  }
  /** Back at a checkpoint: her health and kit, the clock, and the bodies where they fell. */
  private restore(st: CheckpointState) {
    const g = this.game;
    const p = g.player;
    // (a little mercy: back with at least most of a health bar)
    p.hp = Math.max(st.hp, p.maxHp * 0.7);
    this.time = st.time;
    Object.assign(p.stats, st.stats);
    p.bestCombo = st.bestCombo;
    p.specialLocked = !st.pistol;
    p.specialCharges = st.specialCharges;
    p.specialKOs = st.specialKOs;
    p.charges = st.charges;
    if (st.flags) Object.assign(this.flags, st.flags);
    if (st.pistol) this.flags.pistol = true;
    this.staged = [...st.bodies];
    for (const [x, z, variant] of st.bodies) {
      try {
        const e = new Enemy(g, g.lib, g.lib.get(variant), ARCHETYPES.brawler);
        e.spawn(x, z, Math.random() * Math.PI * 2);
        g.addFighter(e);
        e.becomeIdle(null);
        const h = makeHit({ dir: new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize(), point: new THREE.Vector3(x, 1.2, z), damage: 999, strength: 0.6, kind: 'blunt', region: 'chest', attacker: null, bleed: 0.4 });
        g.death.kill(e, 'beaten', h.dir.clone().multiplyScalar(40), h.point);
      } catch {
        /* a body that can't be rebuilt is simply not there */
      }
    }
  }

  // ================================================================== the end
  /** Her death: the fight's over, retry from the checkpoint. */
  onDeath() {
    this.halted = true;
    this.game.voice.stopAll();
    this.waiters.length = 0;
    this.clearTriggers();
    this.ui.tutorHide();
    this.ui.marker(null);
    this.ui.objectiveVisible(false);
  }
  /** Retry from the last checkpoint (a reload, the state carried over). */
  retry() {
    const st = this.lastState ? { ...this.lastState, retries: this.lastState.retries + 1 } : null;
    launchStory({ chapter: this.chapter.id, cp: this.cp, state: st });
  }
  restartChapter() {
    launchStory({ chapter: this.chapter.id, cp: 0, state: null });
  }

  private async complete() {
    const g = this.game;
    const p = g.player;
    this.finished = true;
    this.calm = true;
    this.ui.objective(null);
    this.ui.marker(null);
    const r = gradeRun({
      time: this.time,
      par: this.chapter.par,
      bestCombo: p.bestCombo,
      perfectCounters: p.stats.perfectCounters,
      damageTaken: p.stats.damageTaken,
      retries: this.retries,
      finishers: p.stats.finishers,
      envKills: p.stats.envKills,
      takedowns: p.stats.takedowns,
    });
    const pr = loadProgress();
    const prev = pr.best[this.chapter.id];
    const better = !prev || GRADE_ORDER.indexOf(r.grade) > GRADE_ORDER.indexOf(prev.grade) || (prev.grade === r.grade && this.time < prev.time);
    if (better) pr.best[this.chapter.id] = { grade: r.grade, time: Math.round(this.time) };
    pr.unlocked = Math.max(pr.unlocked, this.chapter.id + 1);
    pr.resume = null;
    saveProgress(pr);
    g.input.exitLock();
    this.ui.clearTransient();
    const b = this.chapter.backdrop;
    if (b) {
      this.game.cam.sceneShot({
        pos: Array.isArray(b.pos) ? new THREE.Vector3(...b.pos) : b.pos.clone(),
        look: Array.isArray(b.look) ? new THREE.Vector3(...b.look) : b.look.clone(),
        pos2: b.pos2 ? (Array.isArray(b.pos2) ? new THREE.Vector3(...b.pos2) : b.pos2.clone()) : undefined,
        look2: b.look2 ? (Array.isArray(b.look2) ? new THREE.Vector3(...b.look2) : b.look2.clone()) : undefined,
        fov: b.fov ?? 40,
        dur: b.dur ?? 40,
        ease: 'linear',
        drift: 0.04,
      });
      this.ui.bars(false);
      this.ui.fade(false, 2.5);
    }
    g.hud?.storyResults(this, r.grade, {
      Time: fmtTime(this.time),
      Kills: p.stats.kills,
      'Best combo': p.bestCombo,
      'Perfect counters': p.stats.perfectCounters,
      Finishers: p.stats.finishers + p.stats.takedowns,
      'Damage taken': Math.round(p.stats.damageTaken),
      Retries: this.retries,
    }, better && !!prev);
  }
}

/** Yaw for the orbit camera to sit behind a point looking at another. */
export function lookYaw(fromX: number, fromZ: number, toX: number, toZ: number) {
  return wrapAngle(yawFromDir(toX - fromX, toZ - fromZ) + Math.PI);
}
export const BASE_DIST = CameraRig.BASE_DIST;
