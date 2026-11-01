// Game: presentation layer. Owns the Babylon engine/scene, renders the Simulation, feeds the
// player's input, and hosts the UI. Simulation logic lives in sim.js and gameplay/*.
import { BABYLON } from './render/babylon.js';
import { MaterialLibrary } from './render/materials.js';
import { Lighting } from './render/lighting.js';
import { WorldView } from './render/worldView.js';
import { ItemView } from './render/itemView.js';
import { CameraRig } from './render/cameraRig.js';
import { CharacterRig } from './characters/rig.js';
import { Animator } from './characters/animator.js';
import { randomAppearance } from './characters/appearance.js';
import { rigDims } from './characters/body.js';
import { NOTABLES, generateInmates, CREWS } from './characters/roster.js';
import { Input } from './core/input.js';
import { Simulation } from './sim.js';
import { PlayerController } from './gameplay/player.js';
import { HUD } from './ui/hud.js';
import { CONFIG } from './config.js';
import { RNG } from './core/random.js';

const SPOT_VERBS = {
  sleep: 'Lie down', toilet: 'Sit on toilet', wash: 'Wash up', write: 'Sit at desk', hangout: 'Sit down', phone: 'Use payphone',
  askGuard: 'Speak to the desk', jobBoard: 'Read job board', rest: 'Sit down', vend: 'Use vending machine', heal: 'Lie down (rest)',
  nurse: 'See the nurse', warden: "Speak to the Warden", getFood: 'Take a meal tray', serve: 'Serve food', cook: 'Cook', prep: 'Prep food',
  raidFridge: 'Raid the fridge', washDishes: 'Wash dishes', eat: 'Sit and eat', watchTV: 'Watch TV', pool: 'Play pool', cards: 'Play cards',
  pingPong: 'Play ping-pong', browse: 'Browse books', read: 'Sit and read', chess: 'Play chess', shelve: 'Shelve books', shower: 'Shower',
  laundry: 'Work the machines', fold: 'Fold laundry', benchPress: 'Bench press', squat: 'Squat', punchBag: 'Hit the bag', treadmill: 'Run on treadmill',
  pullup: 'Do pull-ups', situps: 'Do sit-ups', stamp: 'Stamp plates', tinker: 'Work at bench', hoops: 'Shoot hoops', towerWatch: 'Climb tower',
};

export class Game {
  constructor(opts) {
    this.opts = opts;
    this.canvas = opts.canvas;
    this.uiRoot = opts.ui;
    this.time = 0;
    this.acc = 0;
    this.crews = CREWS;
    this.menuOpen = false;
  }
  get events() { return this.sim.events; }
  get characters() { return this.sim.characters; }
  get player() { return this.sim.player; }
  get items() { return this.sim.items; }
  // Delegations used by the player controller
  startConversation(a, b) { if (this.dialogue) this.dialogue.open(a, b); else this.sim.startConversation(a, b); }
  tryUseSpot(c, s) { return this.sim.tryUseSpot(c, s); }
  spotVerb(s) { return SPOT_VERBS[s.activity] || `Use ${s.type}`; }
  specialInteractables(p) { return this.sim.specialInteractables ? this.sim.specialInteractables(p) : []; }
  activityInput(c, input) { this.sim.activityInput?.(c, input); }

  async boot() {
    const engine = new BABYLON.Engine(this.canvas, true, { stencil: true, preserveDrawingBuffer: !!this.opts.debug || true, powerPreference: 'high-performance' }, false);
    this.engine = engine;
    const scene = new BABYLON.Scene(engine);
    scene.skipPointerMovePicking = true;
    scene.autoClearDepthAndStencil = true;
    this.scene = scene;
    this.input = new Input(window);
    this.materials = new MaterialLibrary(scene);
    this.sim = new Simulation({ seed: this.opts.seed || 20260 });
    this.sim.isVisibleToPlayer = (c) => this.isVisibleToPlayer(c);
    this.world = this.sim.world;
    this.cameraRig = new CameraRig(scene, this.world);
    scene.activeCamera = this.cameraRig.camera;
    this.lighting = new Lighting(scene, this.cameraRig.camera, this.opts.quality || 'high');
    this.worldView = new WorldView(scene, this.world, this.materials, this.lighting);
    this.itemView = new ItemView(scene, this.materials, this.lighting);
    this.sim.spawnItems();
    this._spawnCast();
    this.controller = new PlayerController(this, this.player);
    this.hud = new HUD(this, this.uiRoot);
    this._wireEvents();
    this.cameraRig.snapBehind(this.player);
    this.canvas.addEventListener('click', () => { if (!this.menuOpen && !this.input.pointerLocked && this.canvas.requestPointerLock) this.canvas.requestPointerLock()?.catch?.(() => {}); });
    engine.runRenderLoop(() => this.frame());
    window.addEventListener('resize', () => engine.resize());
  }

  // ------------------------------------------------------------------ cast
  _spawnCast() {
    const rng = new RNG(4242);
    const sim = this.sim;
    const cells = this.world.cells.slice();
    const cellBeds = new Map();
    for (const s of this.world.spots) if (s.activity === 'sleep' && s.cell && !s.cell.startsWith('H')) { if (!cellBeds.has(s.cell)) cellBeds.set(s.cell, []); cellBeds.get(s.cell).push(s); }
    const freeBeds = { A: [], B: [] };
    for (const c of cells) for (const s of (cellBeds.get(c.id) || []).sort((a, b) => (a.bunk === 'low' ? -1 : 1))) freeBeds[c.block].push(s);
    // Player
    const pApp = randomAppearance(77, { outfit: 'inmateA', build: 'average', female: false, hair: 'short', facial: 'stubble', idNumber: 'A-0417' });
    const pDef = { id: 'player', first: 'New', last: 'Fish', kind: 'inmate', stats: { str: 32, agi: 34, tgh: 32, smt: 34 }, seed: 77, crime: 'Grand Theft Lawnmower', ramen: 8 };
    const player = this._addChar(pDef, pApp, { isPlayer: true, name: 'You', short: 'You' });
    const bed = freeBeds.A.splice(6, 1)[0];
    player.bed = bed; player.cell = bed.cell;
    const spawn = this.world.spots.find((s) => s === bed);
    player.place(spawn.ax, spawn.az, 0);
    // Notables + generated inmates
    const pop = CONFIG.population.inmates;
    const notInmates = NOTABLES.filter((n) => n.kind === 'inmate');
    const gen = generateInmates(pop - notInmates.length, 9001);
    for (const def of [...notInmates, ...gen]) {
      const block = def.block || (rng.chance(0.5) ? 'A' : 'B');
      const b = freeBeds[block].shift() || freeBeds[block === 'A' ? 'B' : 'A'].shift();
      const outfit = b && b.cell.startsWith('B') ? 'inmateB' : 'inmateA';
      const app = randomAppearance(def.seed || (def.id.length * 7919 + 13), { ...(def.app || {}), outfit, bandana: def.crew ? CREWS[def.crew].color : null });
      const c = this._addChar({ ...def, seed: def.seed || (def.id.charCodeAt(0) * 131 + def.id.length) }, app);
      c.bed = b; c.cell = b ? b.cell : null;
      if (b) c.place(b.ax + rng.range(-0.3, 0.3), b.az + rng.range(-0.3, 0.3), rng.range(0, 6.28));
    }
    // Staff and guards
    for (const def of NOTABLES.filter((n) => n.kind !== 'inmate')) {
      const app = randomAppearance(def.id.length * 4219 + def.id.charCodeAt(0), { ...(def.app || {}) });
      const c = this._addChar({ ...def, seed: def.id.charCodeAt(0) * 97 }, app);
      const P = { hallDesk: [38, 25.9], blockA: [30, 21], blockB: [46, 21], mess: [30.5, 46], yard: [40, 69], gym: [46, 64], tower: [80, 96], patrol: [38, 40] }[def.post] || (def.role === 'warden' ? [38, 1.2] : def.role === 'nurse' ? [26, 5.3] : [38, 30]);
      const nw = this.world.nav.nearestWalkable(P[0], P[1], c, 6) || P;
      c.place(nw[0], nw[1], Math.PI);
    }
  }
  _addChar(def, app, opts = {}) {
    const c = this.sim.addCharacter(def, app, opts);
    const rig = new CharacterRig(this.scene, app, `ch_${def.id}`);
    c.rig = rig;
    this.lighting.addShadowCaster(rig.mesh);
    return c;
  }

  // ------------------------------------------------------------------ events
  _wireEvents() {
    const ev = this.events;
    ev.on('hit', (e) => {
      if (e.att === this.player || e.vic === this.player) this.cameraRig.shake(e.atk && e.atk.heavy ? 0.22 : 0.1);
    });
    ev.on('tooTired', (e) => { if (e.c === this.player) this.hud?.toast('Too winded!', 'warn', 1.2); });
    ev.on('pickup', (e) => { if (e.c === this.player) this.hud?.toast(`Picked up: ${e.item.def.name}${e.item.def.contraband ? ' <b style="color:#e0a43a">(contraband)</b>' : ''}`, 'info', 1.8); });
    ev.on('tooFar', (e) => { if (e.c === this.player) this.hud?.toast('Too far away', 'warn', 1); });
    ev.on('clock', (e) => {
      if (e.type === 'period') { const p = this.sim.clock.period; this.hud?.announce(p.name, p.desc, 4); }
    });
  }

  isVisibleToPlayer(c) {
    const p = this.player;
    if (!p) return false;
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d > 30) return false;
    return this.world.nav.sightClear(p.x, p.z, c.x, c.z);
  }

  // ------------------------------------------------------------------ loop
  frame() {
    const realDt = Math.min(0.1, this.engine.getDeltaTime() / 1000);
    this.time += realDt;
    this.input.beginFrame(this.time);
    const STEP = 1 / 60;
    this.acc = Math.min(this.acc + realDt, STEP * 5);
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      if (!this.menuOpen) { this.controller.update(STEP); this.sim.step(STEP); }
      this.acc -= STEP; steps++;
    }
    this.present(realDt);
    this.input.endFrame();
  }
  present(dt) {
    if (this.lineup) for (const c of this.lineup) { c.anim.update(dt, c.state); c.rig.applyPose(c.anim.q, c.anim.hips); }
    for (const c of this.sim.characters) {
      if (!c.rig) continue;
      c.rig.place(c.x, c.y, c.z, c.yaw);
      c.rig.applyPose(c.anim.q, c.anim.hips);
      if (c.held) c.rig.syncSkeleton();
    }
    const tgt = this.controller.interactTarget;
    this.itemView.highlighted = tgt && tgt.kind === 'item' ? tgt.ref : null;
    for (const c of this.sim.characters) if (c.rig) c.rig.setOutline(tgt && tgt.kind === 'talk' && tgt.ref === c);
    this.itemView.update(this.sim.items.items, this);
    const p = this.player;
    if (!this._debugFreeze) this.cameraRig.update(dt, this.menuOpen ? null : this.input, p, { lockTarget: p.lockTarget, talkPartner: this.dialogue?.active ? this.dialogue.npc : null, moving: Math.hypot(p.vx, p.vz) > 1 });
    const cam = this.cameraRig.camera.position;
    const indoor = this.world.ceilingAt(cam.x, cam.z) != null ? 1 : 0;
    const tod = this.lighting.update(dt, this.sim.clock.minutes, indoor, p ? new BABYLON.Vector3(p.x, 0, p.z) : cam, this.sim.clock.lightsOut);
    this.worldView.update(dt, tod);
    this.hud.update(dt);
    this.scene.render();
  }

  // ------------------------------------------------------------------ debug helpers (tests)
  /** Advance the simulation deterministically (no rendering), then present one frame. */
  debugStep(seconds, opts = {}) {
    const STEP = 1 / 60;
    const n = Math.round(seconds / STEP);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      this.time += STEP;
      this.input.beginFrame(this.time);
      this.controller.update(STEP);
      this.sim.step(STEP);
      if (opts.present) this.present(STEP);
      this.input.endFrame();
    }
    const simMs = (performance.now() - t0) / Math.max(1, n);
    this.present(STEP);
    return simMs;
  }
  /** Measure where frame time goes. */
  profile(frames = 20) {
    const STEP = 1 / 60;
    let sim = 0, pres = 0, rend = 0;
    for (let i = 0; i < frames; i++) {
      let t = performance.now();
      this.controller.update(STEP); this.sim.step(STEP); sim += performance.now() - t;
      t = performance.now();
      const r = this.scene.render; this.scene.render = () => {}; this.present(STEP); this.scene.render = r; pres += performance.now() - t;
      t = performance.now(); this.scene.render(); rend += performance.now() - t;
    }
    return { simMs: +(sim / frames).toFixed(2), presentMs: +(pres / frames).toFixed(2), renderMs: +(rend / frames).toFixed(2), activeMeshes: this.scene.getActiveMeshes().length, drawCalls: this.engine._drawCalls?.current };
  }
  debugView(x, y, z, tx, ty, tz, minutes) {
    this.cameraRig.camera.position.set(x, y, z);
    this.cameraRig.camera.setTarget(new BABYLON.Vector3(tx, ty, tz));
    this._debugFreeze = true;
    if (minutes != null) this.sim.clock.total = 360 + (minutes - 360);
  }
  debugLineup(specs) {
    this.lineup = this.lineup || [];
    for (const c of this.lineup) c.rig.dispose();
    this.lineup = specs.map((sp, i) => {
      const app = randomAppearance(sp.seed ?? i * 17 + 3, sp.app || {});
      const rig = new CharacterRig(this.scene, app, `dbg${i}`);
      rig.place(sp.x, 0, sp.z, sp.yaw ?? Math.PI);
      this.lighting.addShadowCaster(rig.mesh);
      const anim = new Animator(rigDims(app), i * 13);
      if (sp.posture) anim.setPosture(sp.posture);
      if (sp.clip) anim.play(sp.clip, sp.dur, { loop: true });
      if (sp.expr) rig.setExpression(sp.expr);
      return { rig, anim, state: { speed: Math.hypot(sp.speed || 0, sp.side || 0), vf: sp.speed || 0, vs: sp.side || 0, combat: !!sp.combat, block: !!sp.block, carry: sp.carry || null, sprint: !!sp.sprint } };
    });
  }
}
