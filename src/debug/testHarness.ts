import * as THREE from 'three';
import type { Game } from '../game';
import { Enemy } from '../ai/enemy';
import { ARCHETYPES } from '../ai/archetypes';
import { rand } from '../core/math';
import { Archetype } from '../character/variants';
import { makeHit } from '../combat/types';
import { B } from '../anim/skeleton';

/** Drive the player like a competent human (for automated playtests). */
export class Bot {
  private atkT = 0;
  private actT = 0;
  constructor(public game: Game) {}
  update(dt: number) {
    const g = this.game;
    const p = g.player;
    const inp = g.input;
    this.atkT -= dt;
    this.actT -= dt;
    if (!p.alive) return;
    const now = g.time;
    // defensive reactions first
    const ctr = g.director.findCounterable();
    if (ctr && ctr.hitTime - now < 0.22 && this.actT <= 0) {
      inp.press('counter');
      inp.release('counter');
      this.actT = 0.12;
      return;
    }
    const imm = g.director.imminent(0.32);
    if (imm && !imm.counterable && this.actT <= 0) {
      inp.press('dodge');
      inp.release('dodge');
      this.actT = 0.25;
      return;
    }
    // nearest enemy
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of g.enemies()) {
      if (!e.alive || e.state === 'enter') continue;
      const d = e.distTo(p);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (!best) {
      inp.virtual = { moveX: 0, moveY: 0 };
      return;
    }
    // move towards it via camera basis
    const dir = new THREE.Vector3(best.x - p.x, 0, best.z - p.z).normalize();
    const yaw = g.cam.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = -fz, rz = fx;
    const far = bd > 3.2;
    inp.virtual = { moveX: far ? dir.x * rx + dir.z * rz : (dir.x * rx + dir.z * rz) * 0.4, moveY: far ? dir.x * fx + dir.z * fz : (dir.x * fx + dir.z * fz) * 0.4 };
    if (this.actT > 0) return;
    if (best.state === 'down' && bd < 2.4) {
      inp.press('finisher');
      this.actT = 0.6;
      return;
    }
    if (p.charges > 0 && bd < 3.5 && Math.random() < 0.02) {
      inp.press('finisher');
      this.actT = 0.6;
      return;
    }
    if ((best.cfg.needsStun || best.cfg.block > 0.5) && best.state !== 'stunned' && bd < 3 && Math.random() < 0.05) {
      inp.press('stun');
      this.actT = 0.4;
      return;
    }
    if (bd < 4.5 && this.atkT <= 0) {
      inp.press('attack');
      inp.release('attack');
      this.atkT = rand(0.18, 0.32);
    }
  }
}

/** Deterministic headless scenarios: ?test=NAME&frames=N */
export async function runTest(game: Game, params: URLSearchParams) {
  const name = params.get('test')!;
  const frames = Number(params.get('frames') ?? 120);
  const dt = 1 / 60;
  const w = window as unknown as { __ready: boolean; __result: unknown; __step?: (n: number) => void };
  const camYaw = params.get('camyaw');
  if (camYaw) game.cam.yaw = Number(camYaw);
  const camPitch = params.get('campitch');
  if (camPitch) game.cam.pitch = Number(camPitch);
  const result: Record<string, unknown> = {};
  const t0 = performance.now();
  const spawnEnemy = (key: string, x: number, z: number) => {
    const cfg = ARCHETYPES[key];
    const names = game.archetypes[key as Archetype] ?? game.archetypes.brawler;
    const e = new Enemy(game, game.lib, game.lib.get(names[Math.floor(Math.random() * names.length)]), cfg);
    e.spawn(x, z, Math.atan2(-x, -z));
    e.state = 'circle';
    e.ghostWalls = false;
    game.addFighter(e);
    return e;
  };
  if (name === 'merged') {
    game.arena.group.traverse((o) => {
      if (o.name !== 'staticMerged') return;
      const m = o as THREE.Mesh;
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox!;
      const mat = m.material as THREE.MeshStandardMaterial;
      console.log(`merged color=${mat.color?.getHexString()} verts=${m.geometry.attributes.position.count} min=${b.min.toArray().map((v) => v.toFixed(1))} max=${b.max.toArray().map((v) => v.toFixed(1))}`);
    });
  }
  if (name === 'arena') {
    for (let i = 0; i < frames; i++) {
      game.input.virtual = { moveX: 0, moveY: i > 20 && i < 80 ? 1 : 0 };
      game.step(dt);
    }
  }
  if (name === 'ragdoll') {
    const n = Number(params.get('n') ?? 6);
    const waves = Number(params.get('waves') ?? 1);
    const keys = Object.keys(ARCHETYPES).filter((k) => !ARCHETYPES[k].boss);
    for (let wv = 0; wv < waves; wv++) {
      const es: Enemy[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + wv * 0.4;
        const r = 2.2 + (i % 3) * 0.9;
        es.push(spawnEnemy(keys[(i + wv) % keys.length], Math.cos(a) * r, Math.sin(a) * r + 1));
      }
      for (let i = 0; i < 10; i++) game.step(dt);
      for (const e of es) {
        const dir = new THREE.Vector3(e.x - game.player.x, 0, e.z - game.player.z).normalize();
        const head = new THREE.Vector3();
        e.bodyPoint('head', head);
        e.woundAt(head, 0, 0.06, 1, 0.12);
        e.bleedRate = 3;
        game.fx.bloodSpray(head, dir.clone().setY(0.2), 1, 4);
        game.death.kill(e, 'test', dir.clone().multiplyScalar(rand(60, 140)).setY(rand(10, 40)), head);
      }
      for (let i = 0; i < frames; i++) game.step(dt);
    }
  }
  if (name === 'combat' || name === 'waves') {
    // bot plays the real wave game
    const bot = new Bot(game);
    game.started = true;
    if (params.get('audio') === '1') {
      game.audio.resume();
      game.audio.startAmbience();
      game.music.start();
    }
    game.waves.start(Number(params.get('wave') ?? 1));
    const god = params.get('god') === '1';
    const probe = params.get('probe') === '1' ? new (await import('./animProbe')).AnimProbe(game) : null;
    for (let i = 0; i < frames; i++) {
      bot.update(dt);
      if (god) game.player.hp = Math.max(game.player.hp, 60);
      game.step(dt);
      probe?.sample(dt);
      if (i % 600 === 0) console.log(`t=${(i / 60).toFixed(0)}s wave=${game.waves.wave} corpses=${game.corpses.count} enemies=${game.enemies().filter((e) => e.alive).length} hp=${game.player.hp.toFixed(0)} combo=${game.player.bestCombo}`);
      if (!game.player.alive && !god) break;
    }
    if (probe) console.log('PROBE ' + JSON.stringify(probe.report((frames * dt))));
    if (params.get('rtime') === '1') {
      const gl = game.renderer.gl;
      for (let k = 0; k < 3; k++) {
        let t0 = performance.now();
        game.blood.flush(gl);
        const tf = performance.now() - t0;
        t0 = performance.now();
        game.renderFrame();
        gl.getContext().finish();
        console.log(`render ${k}: flush=${tf.toFixed(1)}ms frame=${(performance.now() - t0).toFixed(1)}ms pools=${game.blood.pools.length} rivulets=${game.blood.rivulets.length} corpses=${game.corpses.count}`);
        game.step(dt);
      }
    }
    const ec = game.euphoria.counters;
    result.euphoria = { created: ec.created, peak: ec.peak, steps: ec.steps, avgStepMs: +(ec.stepMsTotal / Math.max(1, ec.steps)).toFixed(3), worstStepMs: +ec.worstStepMs.toFixed(2), statics: game.euphoria.staticCount, ...game.euphoria.events };
    result.wave = game.waves.wave;
    const mu = game.music as unknown as { bar: number; intensity: number };
    result.audio = { state: game.audio.ctx?.state ?? 'none', bars: mu.bar, intensity: +mu.intensity.toFixed(2) };
    result.playerHp = game.player.hp;
    result.stats = game.player.stats;
    result.bestCombo = game.player.bestCombo;
    result.score = game.player.score;
  }
  if (name === 'duel') {
    // single enemy type vs bot, for animation review
    const key = params.get('enemy') ?? 'brawler';
    const n = Number(params.get('n') ?? 1);
    for (let i = 0; i < n; i++) spawnEnemy(key, rand(-3, 3), -3 - i);
    const bot = new Bot(game);
    game.started = true;
    for (let i = 0; i < frames; i++) {
      bot.update(dt);
      game.player.hp = Math.max(game.player.hp, 50);
      game.step(dt);
    }
    result.stats = game.player.stats;
  }
  if (name === 'film') {
    // set up a fight, then let the runner step + screenshot frame by frame
    const key = params.get('enemy') ?? 'brawler';
    const n = Number(params.get('n') ?? 3);
    for (let i = 0; i < n; i++) spawnEnemy(key, rand(-3.5, 3.5), -2.5 - i * 0.8);
    const bot = new Bot(game);
    game.started = true;
    game.cam.framingDist = Number(params.get('framing') ?? 0);
    const warm = Number(params.get('warm') ?? 120);
    for (let i = 0; i < warm; i++) {
      bot.update(dt);
      game.player.hp = Math.max(game.player.hp, 50);
      game.step(dt);
    }
    (window as unknown as { __film: { step: (k: number) => void } }).__film = {
      step(k: number) {
        for (let i = 0; i < k; i++) {
          bot.update(dt);
          game.player.hp = Math.max(game.player.hp, 50);
          game.step(dt);
        }
        game.renderFrame();
        const c = game.cam;
        console.log(`cam yaw=${c.yaw.toFixed(2)} pitch=${c.pitch.toFixed(2)} dist=${c.dist.toFixed(2)} pos=${c.camera.position.toArray().map((v) => v.toFixed(2)).join(',')} cine=${c.inCinematic} action=${game.player.action}`);
      },
    };
    game.renderFrame();
  }
  if (name === 'euph') {
    // scripted active-ragdoll reactions for filming: mode = stagger | knock | death | throw | pile
    const mode = params.get('mode') ?? 'knock';
    const key = params.get('enemy') ?? 'brawler';
    game.player.x = 0;
    game.player.z = 1.6;
    game.player.yaw = Math.PI;
    game.cam.yaw = 0;
    const es: Enemy[] = [];
    const n = mode === 'pile' ? 5 : 1;
    if (mode === 'prop') {
      // knock an enemy into an oil drum
      const d = game.props.list[Number(params.get('prop') ?? 0)].body.translation();
      game.player.x = d.x + 2.3;
      game.player.z = d.z;
      es.push(spawnEnemy(key, d.x + 0.85, d.z));
    } else for (let i = 0; i < n; i++) es.push(spawnEnemy(key, mode === 'pile' ? (i - 2) * 0.35 : 0, mode === 'pile' ? -0.6 - i * 0.25 : -0.4));
    game.started = true;
    for (const e of es) {
      e.attackCooldown = 1e9;
      e.stunNow(100); // dazed in place: a still target to film
    }
    game.cam.framingDist = Number(params.get('framing') ?? -1.8);
    let frame = 0;
    const fire = () => {
      const p = game.player;
      for (const [i, e] of es.entries()) {
        if (!e.alive) continue;
        const at = frame === 30 + i * 4;
        if (!at) continue;
        const dir = new THREE.Vector3(e.x - p.x, 0, e.z - p.z).normalize();
        const head = new THREE.Vector3();
        e.bodyPoint(mode === 'stagger' || mode === 'agony' ? 'chest' : 'head', head);
        const h = makeHit({ dir, point: head, damage: 5, strength: 1.1, kind: 'punch', region: mode === 'agony' ? 'gut' : 'head', attacker: p, knockdown: mode !== 'stagger', launch: mode === 'throw' ? 4 : 0 });
        if (mode === 'stagger') e.physStagger(h, Number(params.get('imp') ?? 0.42));
        else if (mode === 'agony') {
          // a beating to the body: bruises and a bleeding gut wound, then the fatal blow
          const pt = new THREE.Vector3();
          e.bodyPoint('chest', pt);
          e.woundAt(pt.clone().add(new THREE.Vector3(0.05, -0.18, 0.1)), 0, 0.07, 1, 0.18);
          e.woundAt(pt.clone().add(new THREE.Vector3(-0.08, 0.05, 0.1)), 1, 0.09, 0.9);
          e.bodyPoint('head', pt);
          e.woundAt(pt.clone().add(new THREE.Vector3(0.05, 0.02, 0.08)), 1, 0.06, 0.9);
          e.bleedRate = 3;
          e.hp = 1;
          e.takeHit({ ...h, damage: 50, knockdown: false });
        } else if (mode === 'death' || mode === 'pile') {
          e.hp = 1;
          e.takeHit({ ...h, damage: 50, knockdown: false });
        } else {
          e.knockdown(h);
          const pgu = params.get('pgu');
          if (pgu !== null) e.physGetUp = pgu === '1';
        }
      }
    };
    const stepOne = () => {
      for (const e of es) e.attackCooldown = 1e9;
      fire();
      game.step(dt);
      frame++;
      if (frame % (Number(params.get('logEvery') ?? 30)) === 0) {
        const e = es[0];
        const r = e.downRag as unknown as { mode?: string; getUpPhase?: string | null; ctl?: { sens: { pelvisH: number } } } | null;
        if (mode === 'prop') {
          const pb = game.props.list[Number(params.get('prop') ?? 0)].body;
          const t = pb.translation(), lv = pb.linvel();
          console.log(`prop pos=${t.x.toFixed(2)},${t.y.toFixed(2)},${t.z.toFixed(2)} speed=${Math.hypot(lv.x, lv.y, lv.z).toFixed(2)}`);
        }
        const dr = e.ragdoll as unknown as { mode?: string; inAgony?: boolean; agonyProgress?: number; settled?: boolean; ctl?: { modeTime: number; legStrength: { L: number }; pain: number; tone: number; alive: boolean; conscious: boolean; sens: { pelvisH: number; upTilt: number } } } | null;
        const fk = e.anim.fk;
        const kneeAng = (th: number, sh: number, ft: number) => {
          const a = fk.pos[sh].clone().sub(fk.pos[th]).normalize(), b = fk.pos[ft].clone().sub(fk.pos[sh]).normalize();
          return (Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 57.3).toFixed(0);
        };
        if (dr && !e.alive) {
          const hipAng = (th: number, sh: number) => {
            const sp = fk.pos[B.spine].clone().sub(fk.pos[B.hips]).normalize(), a = fk.pos[sh].clone().sub(fk.pos[th]).normalize();
            return (180 - Math.acos(Math.max(-1, Math.min(1, sp.dot(a)))) * 57.3).toFixed(0);
          };
          console.log(`knees L=${kneeAng(B.thighL, B.shinL, B.footL)} R=${kneeAng(B.thighR, B.shinR, B.footR)} hipflex L=${hipAng(B.thighL, B.shinL)} R=${hipAng(B.thighR, B.shinR)} ${(dr as unknown as { dbgWrithe: string }).dbgWrithe}`);
        }
        if (dr && !e.alive) console.log(`f=${frame} dying mode=${dr.mode} agony=${dr.inAgony} k=${dr.agonyProgress?.toFixed(2)} settled=${dr.settled} corpses=${game.corpses.count} mt=${dr.ctl?.modeTime.toFixed(2)} leg=${dr.ctl?.legStrength.L.toFixed(2)} pain=${dr.ctl?.pain.toFixed(2)} tone=${dr.ctl?.tone.toFixed(2)} alive=${dr.ctl?.alive} cons=${dr.ctl?.conscious} pelvisH=${dr.ctl?.sens.pelvisH.toFixed(2)} tilt=${dr.ctl?.sens.upTilt.toFixed(2)}`);
        console.log(`f=${frame} state=${e.state} alive=${e.alive} mode=${r?.mode ?? '-'} gu=${r?.getUpPhase ?? '-'} pelvisH=${r?.ctl?.sens.pelvisH.toFixed(2) ?? '-'} active=${game.euphoria.actives.length} stepMs=${game.euphoria.stepMs.toFixed(2)} sub=${game.euphoria.world.substeps}`);
      }
    };
    // fixed side-on witness camera on the first enemy (camera rig would sit behind the player)
    const camAng = Number(params.get('camang') ?? 1.35);
    const camDist = Number(params.get('camdist') ?? 3.4);
    const look = new THREE.Vector3(es[0].x, 0.75, es[0].z);
    const placeCam = () => {
      const c = game.cam.camera;
      c.position.set(look.x + Math.sin(camAng) * camDist, 1.45, look.z + Math.cos(camAng) * camDist);
      c.lookAt(look);
    };
    (window as unknown as { __film: { step: (k: number) => void } }).__film = {
      step(k: number) {
        for (let i = 0; i < k; i++) stepOne();
        if (params.get('track') === '1') {
          const e = es[0];
          look.lerp(new THREE.Vector3(e.x, 0.75, e.z), 0.5);
        }
        placeCam();
        game.renderFrame();
      },
    };
    for (let i = 0; i < Number(params.get('warm') ?? 20); i++) stepOne();
    if (params.get('run')) for (let i = 0; i < frames; i++) stepOne();
    game.renderFrame();
  }
  if (name === 'moves') {
    // scripted player movement for reviewing locomotion: idle, run, stop, sharp turn, blocked
    // strafe and backpedal, half-stick walk; side camera tracking the player
    const p = game.player;
    game.started = true;
    const inp = game.input;
    const script: [number, number, number, boolean][] = [
      // until (s), moveX, moveY, block  (camera basis: moveY = away from the camera)
      [1.2, 0, 0, false],
      [2.8, 0, 1, false],
      [3.6, 0, 0, false],
      [5.0, 1, -0.3, false],
      [5.8, 0, 0, false],
      [7.2, -1, 0, true],
      [8.4, 0, -1, true],
      [9.0, 0, 0, false],
      [11.0, 0.3, 0.25, false],
      [12.0, 0, 0, false],
    ];
    let frame = 0;
    let blocking = false;
    const stepOne = () => {
      const t = frame * dt;
      const seg = script.find((sg) => t < sg[0]) ?? script[script.length - 1];
      inp.virtual = { moveX: seg[1], moveY: seg[2] };
      if (seg[3] && !blocking) inp.press('block');
      if (!seg[3] && blocking) inp.release('block');
      blocking = seg[3];
      game.step(dt);
      frame++;
    };
    const camAng = Number(params.get('camang') ?? 1.57);
    const camDist = Number(params.get('camdist') ?? 4.2);
    const look = new THREE.Vector3(p.x, 0.9, p.z);
    (window as unknown as { __film: { step: (k: number) => void } }).__film = {
      step(k: number) {
        for (let i = 0; i < k; i++) stepOne();
        look.lerp(new THREE.Vector3(p.x, 0.9, p.z), 0.6);
        const c = game.cam.camera;
        c.position.set(look.x + Math.sin(camAng) * camDist, 1.5, look.z + Math.cos(camAng) * camDist);
        c.lookAt(look);
        game.renderFrame();
      },
    };
    for (let i = 0; i < Number(params.get('warm') ?? 0); i++) stepOne();
    const probe = params.get('probe') === '1' ? new (await import('./animProbe')).AnimProbe(game) : null;
    if (params.get('run')) {
      for (let i = 0; i < frames; i++) {
        stepOne();
        probe?.sample(dt);
      }
      if (probe) console.log('PROBE ' + JSON.stringify(probe.report(frames * dt)));
    }
  }
  if (name === 'wounds') {
    // a beaten face and body up close: cuts, a bloody nose, bruises
    const key = params.get('enemy') ?? 'brawler';
    const e = spawnEnemy(key, 0, -0.6);
    game.started = true;
    e.attackCooldown = 1e9;
    // a still, relaxed subject (no AI, hands down)
    (e as unknown as { think: (dt: number) => void }).think = () => {
      e.vx = e.vz = 0;
      e.anim.locoIn.style = 'relaxed';
      e.anim.locoIn.guard = 0;
      e.anim.locoIn.look = 0;
    };
    for (let i = 0; i < 30; i++) game.step(dt);
    const P = (name: string, x: number, y: number, z: number) => {
      const v = new THREE.Vector3();
      e.bodyPoint(name, v);
      // offsets in the fighter's facing frame
      const c = Math.cos(e.yaw), sn = Math.sin(e.yaw);
      return v.add(new THREE.Vector3(x * c + z * sn, y, -x * sn + z * c));
    };
    const beat = Number(params.get('beat') ?? 1);
    if (params.get('all') === '1') {
      // large wounds and bruises everywhere: whichever way the body lands, they must show
      for (const b of [B.head, B.chest, B.spine, B.hips, B.uarmL, B.uarmR, B.farmL, B.farmR, B.thighL, B.thighR, B.shinL, B.shinR]) {
        const v = new THREE.Vector3();
        e.anim.boneWorld(b, v);
        for (const off of [[0, 0, 0.12], [0, 0, -0.12], [0.1, 0, 0], [-0.1, 0, 0]]) {
          const c2 = Math.cos(e.yaw), sn2 = Math.sin(e.yaw);
          const p = v.clone().add(new THREE.Vector3(off[0] * c2 + off[2] * sn2, 0.03, -off[0] * sn2 + off[2] * c2));
          e.woundAt(p, b === B.head || b === B.chest ? 1 : 0, 0.09, 1, b === B.head ? 0.1 : 0);
        }
      }
    }
    if (beat > 0) {
      e.woundAt(P('head', 0.035, 0.0, 0.02), 0, 0.025, 1, 0.12); // split brow
      e.woundAt(P('jaw', 0.0, 0.035, 0.01), 0, 0.02, 0.9, 0.1); // bloody nose
      e.woundAt(P('head', -0.045, -0.03, 0.0), 1, 0.05, 0.9); // swollen cheek
      e.woundAt(P('head', 0.04, 0.01, 0.0), 1, 0.04, 0.8); // black eye
      e.woundAt(P('jaw', -0.03, -0.01, 0.0), 0, 0.018, 0.8, 0.06); // split lip
      e.woundAt(P('chest', 0.06, 0.0, 0.0), 1, 0.08, 0.9); // ribs
      e.woundAt(P('gut', -0.05, 0.02, 0.0), 1, 0.07, 0.8);
      e.woundAt(P('chest', -0.08, 0.05, 0.0), 2, 0.08, 0.8);
    }
    for (let i = 0; i < Number(params.get('wait') ?? 60); i++) game.step(dt);
    const c = game.cam.camera;
    const look = new THREE.Vector3();
    e.bodyPoint(params.get('at') ?? 'head', look);
    if (params.get('kill') === '1') {
      // kill it and wait for the body to settle and bake into a corpse; then look at its head
      const dir = new THREE.Vector3(0, 0, -1);
      const hit = makeHit({ dir, point: look.clone(), damage: 500, strength: 0.6, kind: 'punch', region: 'head', attacker: game.player });
      e.takeHit(hit);
      const head = new THREE.Vector3();
      for (let i = 0; i < 900 && game.death.dying.length > 0; i++) {
        game.step(dt);
        if (game.death.dying.length) e.anim.boneWorld(B.head, head);
      }
      console.log(`corpses=${game.corpses.count} dying=${game.death.dying.length}`);
      const cs = game.corpses as unknown as { records: { wounds: unknown[] }[]; woundData: Float32Array; woundTex: THREE.DataTexture; corpseUniforms: { uCorpseWounds: { value: THREE.DataTexture } } };
      const rec = cs.records[cs.records.length - 1];
      console.log(`corpse wounds=${rec?.wounds.length} row0=${Array.from(cs.woundData.slice(0, 8)).map((x) => x.toFixed(3)).join(',')} texSame=${cs.corpseUniforms.uCorpseWounds.value === cs.woundTex} live=${e.model.wounds.length}`);
      look.copy(head);
    }
    const dist = Number(params.get('dist') ?? 0.75);
    const ang = e.yaw + Number(params.get('ang') ?? 0.35);
    c.position.set(look.x + Math.sin(ang) * dist, look.y + Number(params.get('up') ?? 0.05), look.z + Math.cos(ang) * dist);
    c.lookAt(look);
    game.renderFrame();
  }
  if (name === 'pools') {
    // blood pools spreading and running along the floor, seen from above
    const cx = Number(params.get('x') ?? 0), cz = Number(params.get('z') ?? 0);
    const n = Number(params.get('n') ?? 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      game.blood.addPool(cx + Math.cos(a) * 1.1, cz + Math.sin(a) * 1.1, 0.35 + (i % 3) * 0.12, 9 + i * 2, i * 0.4);
    }
    game.player.x = cx + 6;
    game.player.z = cz + 6;
    if (params.get('manual') === '1') game.blood.addRivulet(cx - 1.5, cz - 1.6, 1, 0, 1.6, 0.025, 0.2, 0);
    for (let i = 0; i < frames; i++) {
      game.step(dt);
      if (i % 120 === 0) console.log(`t=${(i * dt).toFixed(1)} pools=${game.blood.pools.length} rivulets=${game.blood.rivulets.length} log=${game.blood.logCount} ` + game.blood.rivulets.slice(0, 3).map((r) => `[${r.x.toFixed(2)},${r.z.toFixed(2)} vol=${r.vol.toFixed(2)} w=${r.w0.toFixed(3)} d=${r.delay.toFixed(1)}]`).join(' '));
    }
    const c = game.cam.camera;
    const h = Number(params.get('h') ?? 4.5);
    c.position.set(cx + 0.01, h, cz + Number(params.get('tilt') ?? 1.2));
    c.lookAt(cx, 0, cz);
    game.renderFrame();
    result.rivulets = game.blood.rivulets.length;
  }
  if (name === 'stress') {
    // populate many permanent corpses and blood quickly, then measure frame cost
    const target = Number(params.get('corpses') ?? 200);
    const keys = Object.keys(ARCHETYPES).filter((k) => !ARCHETYPES[k].boss);
    let made = 0;
    while (made < target) {
      const batch = Math.min(12, target - made);
      const es: Enemy[] = [];
      for (let i = 0; i < batch; i++) es.push(spawnEnemy(keys[(made + i) % keys.length], rand(-11.5, 11.5), rand(-9.5, 9.5)));
      for (let i = 0; i < 2; i++) game.step(dt);
      for (const e of es) {
        const head = new THREE.Vector3();
        e.bodyPoint('head', head);
        e.woundAt(head, 0, 0.07, 1, 0.1);
        const dir = new THREE.Vector3(rand(-1, 1), 0.2, rand(-1, 1)).normalize();
        game.fx.bloodSpray(head, dir, 1.2, 4);
        game.death.kill(e, 'stress', dir.clone().multiplyScalar(rand(40, 120)), head);
      }
      let guard = 0;
      while (game.death.dying.length > 0 && guard++ < 600) game.step(dt);
      made += batch;
    }
    // let pools finish growing
    for (let i = 0; i < 300; i++) game.step(dt);
    // measure CPU frame cost (sim + render submit)
    const times: number[] = [];
    for (let i = 0; i < 60; i++) {
      const a = performance.now();
      game.step(dt);
      game.renderFrame();
      times.push(performance.now() - a);
    }
    times.sort((a, b) => a - b);
    result.frameMsMedian = times[30];
    result.frameMsP90 = times[54];
    // cost of fresh active ragdolls falling into the crowded floor (lab world now holds every corpse)
    const ec = game.euphoria.counters;
    const before = { steps: ec.steps, ms: ec.stepMsTotal };
    const keys2 = Object.keys(ARCHETYPES).filter((k) => !ARCHETYPES[k].boss);
    const late: Enemy[] = [];
    for (let i = 0; i < 6; i++) late.push(spawnEnemy(keys2[i % keys2.length], rand(-6, 6), rand(-6, 6)));
    for (let i = 0; i < 2; i++) game.step(dt);
    for (const e of late) {
      e.hp = 1;
      e.takeHit(makeHit({ dir: new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize(), point: new THREE.Vector3(e.x, 1.6, e.z), damage: 50, strength: 1, attacker: game.player }));
    }
    const ftimes: number[] = [];
    for (let i = 0; i < 120; i++) {
      const a = performance.now();
      game.step(dt);
      ftimes.push(performance.now() - a);
    }
    ftimes.sort((a, b) => a - b);
    result.activeFrameMsMedian = +ftimes[60].toFixed(2);
    result.activeFrameMsP90 = +ftimes[108].toFixed(2);
    result.euphoriaAfterPile = { steps: ec.steps - before.steps, avgStepMs: +((ec.stepMsTotal - before.ms) / Math.max(1, ec.steps - before.steps)).toFixed(3), statics: game.euphoria.staticCount, bodies: game.euphoria.world.bodies.length };
  }
  result.ms = Math.round(performance.now() - t0);
  result.corpses = game.corpses?.count ?? 0;
  result.corpseVerts = game.corpses?.totalVerts ?? 0;
  result.corpseChunks = game.corpses?.chunks.length ?? 0;
  result.splats = game.blood.totalSplats;
  result.logCount = game.blood.logCount;
  result.dying = game.death?.dying.length ?? 0;
  result.fighters = game.fighters.length;
  result.weapons = game.weapons.length;
  game.renderFrame();
  const info = game.renderer.gl.info;
  result.calls = game.renderer.sceneStats.calls;
  result.tris = game.renderer.sceneStats.triangles;
  result.geometries = info.memory.geometries;
  result.textures = info.memory.textures;
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  if (mem) result.heapMB = Math.round(mem.usedJSHeapSize / 1048576);
  w.__result = result;
  console.log('RESULT ' + JSON.stringify(result));
  // drain queued GPU work (software GL can lag far behind long simulations)
  game.renderer.gl.getContext().finish();
  w.__ready = true;
}
