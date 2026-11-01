// Game: presentation layer. Owns the Babylon engine/scene, renders the Simulation, feeds the
// player's input, and hosts the UI. Simulation logic lives in sim.js and gameplay/*.
import { BABYLON } from './render/babylon.js';
import { MaterialLibrary } from './render/materials.js';
import { Lighting } from './render/lighting.js';
import { WorldView } from './render/worldView.js';
import { ItemView } from './render/itemView.js';
import { FX } from './render/fx.js';
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
import { DialogueUI } from './ui/dialogueUI.js';
import { Menus } from './ui/menus.js';
import { TouchControls } from './ui/touch.js';
import { AudioEngine } from './audio/audio.js';
import { installSystems } from './gameplay/systems.js';
import { saveSlot, loadSlot, apply as applySave } from './save/save.js';
import { SKIN_TONES, HAIR_COLORS, HAIR_STYLES, FACIAL } from './characters/appearance.js';
import { CRIMES as CRIME_LIST } from './characters/roster.js';
import { JOBS } from './gameplay/activities.js';
import { ITEMS } from './world/items.js';
import { CONFIG } from './config.js';
import { RNG } from './core/random.js';
import { angleDiff } from './core/mathutil.js';

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
    this.mode = 'title';
    this.seed = opts.seed || 20260;
    this.options = { master: 0.8, music: 0.35, sfx: 0.9, sensitivity: 1, invertY: false, autoCam: true, shake: true, timeSpeed: 'normal', quality: 'high' };
    try { Object.assign(this.options, JSON.parse(localStorage.getItem('gravelmouth.options') || '{}')); } catch { /* ignore */ }
  }
  setOption(k, v) {
    this.options[k] = v;
    try { localStorage.setItem('gravelmouth.options', JSON.stringify(this.options)); } catch { /* ignore */ }
    if (['master', 'music', 'sfx'].includes(k)) this.audio?.setVolume(k === 'sfx' ? 'sfx' : k, v);
    if (k === 'sensitivity') this.cameraRig.sensitivity = v;
    if (k === 'invertY') this.cameraRig.invertY = v;
    if (k === 'autoCam') this.cameraRig.autoFollow = v;
    if (k === 'timeSpeed' && this.sim) this.sim.clock.scale = CONFIG.time.minutesPerSecond[v];
  }
  setMenuOpen(v) {
    this.menuOpen = v;
    if (v && document.pointerLockElement) document.exitPointerLock?.();
  }
  _capturePointer() {
    if (this.menuOpen || this.input.pointerLocked || this.input.dragLook || this.touch?.active || !this.canvas.requestPointerLock) return;
    try {
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => this._pointerLockRefused());
    } catch { this._pointerLockRefused(); }
  }
  /** Embedded pages may refuse mouse capture: fall back to drag-to-look and say so once. */
  _pointerLockRefused() {
    this.input.dragLook = true;
    if (this._toldDragLook || this.mode !== 'play') return;
    this._toldDragLook = true;
    this.hud?.toast('Mouse capture is blocked here: hold the right mouse button and drag to look (K for heavy attacks).', 'info', 7);
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
    this.sim = new Simulation({ seed: this.seed });
    installSystems(this.sim, { sentence: { days: 21 } });
    this.sim.clock.scale = CONFIG.time.minutesPerSecond[this.options.timeSpeed] || 1.5;
    this.sim.isVisibleToPlayer = (c) => this.isVisibleToPlayer(c);
    this.sim.canSee = (x, z) => this.canSee(x, z);
    this.world = this.sim.world;
    this.cameraRig = new CameraRig(scene, this.world);
    scene.activeCamera = this.cameraRig.camera;
    this.lighting = new Lighting(scene, this.cameraRig.camera, this.opts.quality || 'high');
    this.worldView = new WorldView(scene, this.world, this.materials, this.lighting);
    this.itemView = new ItemView(scene, this.materials, this.lighting);
    this.fx = new FX(scene);
    this.sim.spawnItems();
    this._spawnCast();
    this.controller = new PlayerController(this, this.player);
    this.hud = new HUD(this, this.uiRoot);
    this.dialogue = this.sim.dialogue;
    this.dialogueUI = new DialogueUI(this, this.uiRoot);
    this.menus = new Menus(this, this.uiRoot);
    this.audio = new AudioEngine();
    for (const k of ['master', 'music', 'sfx']) this.audio.volumes[k === 'sfx' ? 'sfx' : k] = this.options[k];
    this.cameraRig.sensitivity = this.options.sensitivity; this.cameraRig.invertY = this.options.invertY; this.cameraRig.autoFollow = this.options.autoCam;
    const startAudio = () => { this.audio.init().then(() => this.audio.resume()); window.removeEventListener('pointerdown', startAudio); window.removeEventListener('keydown', startAudio); };
    window.addEventListener('pointerdown', startAudio); window.addEventListener('keydown', startAudio);
    this._wireEvents();
    this.cameraRig.snapBehind(this.player);
    if (this.opts.autostart) this.beginSentence(null);
    else { this.menus.showTitle(); this.titleCamera(); }
    this.touch = new TouchControls(this, this.uiRoot);
    this.canvas.addEventListener('click', () => this._capturePointer());
    document.addEventListener('pointerlockerror', () => this._pointerLockRefused());
    if (!this.opts.manual) engine.runRenderLoop(() => this.frame());
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
    const ev = this.events, hud = () => this.hud, au = () => this.audio;
    const isP = (c) => c === this.player;
    const near = (c) => c && Math.hypot(c.x - this.player.x, c.z - this.player.z) < 30;
    const pos = (c) => c ? { x: c.x, z: c.z } : null;
    ev.on('hit', (e) => {
      const heavy = e.atk && e.atk.heavy;
      if ((isP(e.att) || isP(e.vic)) && this.options.shake) this.cameraRig.shake(heavy ? 0.22 : 0.1);
      if (!near(e.vic)) return;
      const snd = e.result === 'blocked' ? 'block' : e.result === 'dodged' ? null : (e.atk && e.atk.sound) || 'punch_light';
      if (snd) au()?.play(snd, { pos: pos(e.vic), vol: heavy ? 1 : 0.85, indoor: true });
      // Impact effects at the struck region
      const v = e.vic, region = e.atk && e.atk.region;
      const hy = v.y + (v.isDown ? 0.25 : region === 'gut' ? v.dims.hipH + 0.15 : region === 'chest' ? v.dims.hipH + 0.35 : v.dims.H * 1.6);
      const dir = e.att ? [(v.x - e.att.x), (v.z - e.att.z)] : null;
      const dl = dir ? Math.hypot(dir[0], dir[1]) || 1 : 1;
      const d2 = dir ? [dir[0] / dl, dir[1] / dl] : null;
      if (e.result === 'blocked') this.fx.burst('block', v.x - (d2 ? d2[0] * 0.3 : 0), hy, v.z - (d2 ? d2[1] * 0.3 : 0), 8, d2);
      else if (e.result !== 'dodged') { this.fx.burst('hit', v.x, hy, v.z, heavy ? 16 : 8, d2); this.fx.burst('sweat', v.x, hy, v.z, heavy ? 10 : 5, d2); this.fx.flash(v, heavy ? 0.55 : 0.35); }
      if (e.result !== 'blocked' && e.result !== 'dodged' && Math.random() < (heavy ? 0.8 : 0.35)) au()?.play('grunt_pain', { pos: pos(e.vic), vol: 0.6, key: e.vic.id, minGap: 0.4, rate: e.vic.app.female ? 1.35 : 1 });
      if (e.result === 'guardbreak') au()?.play('parry', { pos: pos(e.vic) });
      if (isP(e.att) && e.result === 'ko') hud()?.toast(`${e.vic.short} is out cold!`, 'good', 2);
    });
    ev.on('swing', (e) => { if (near(e.c)) { au()?.play(e.atk.heavy ? 'whoosh_heavy' : 'whoosh_light', { pos: pos(e.c), vol: 0.6 }); if (Math.random() < 0.3) au()?.play('grunt_attack', { pos: pos(e.c), vol: 0.45, key: e.c.id, minGap: 0.6, rate: e.c.app.female ? 1.35 : 1 }); } });
    ev.on('counter', (e) => { au()?.play('parry', { pos: pos(e.c) }); if (isP(e.c)) hud()?.toast('Countered!', 'good', 1.2); });
    ev.on('knockdown', (e) => { if (near(e.c)) { au()?.play('body_fall', { pos: pos(e.c), delay: 0.25 }); setTimeout(() => this.fx.burst('dust', e.c.x, 0.1, e.c.z, 10), 280); } });
    ev.on('ko', (e) => { this.fx.koStars(e.c, true); });
    ev.on('land', (e) => { if (near(e.c)) { au()?.play('body_fall', { pos: pos(e.c), vol: 1 }); this.fx.burst('dust', e.c.x, 0.1, e.c.z, 14); } });
    ev.on('wallSlam', (e) => near(e.c) && au()?.play('punch_heavy', { pos: pos(e.c) }));
    ev.on('grab', (e) => { if (isP(e.vic)) hud()?.toast('Grabbed! Mash to break free!', 'warn', 1.6); });
    ev.on('itemImpact', (e) => { const it = e.item; if (Math.hypot(it.x - this.player.x, it.z - this.player.z) > 25) return; au()?.play(it.def.clang ? 'metal_hit' : it.def.heavy ? 'body_fall' : 'club_hit', { pos: it, vol: Math.min(1, e.speed / 8) * 0.7 }); });
    ev.on('itemBreak', (e) => { au()?.play('wood_break', { pos: e }); this.fx.burst('debris', e.x, 1.0, e.z, 18); });
    ev.on('door', (e) => { if (e.ev && (e.door.amount === 0 || e.door.amount === 1) || !e.ev) return; const [x, z] = e.door.center(); if (e.door.style === 'cell' && e.door._snd !== e.ev) { e.door._snd = e.ev; if (Math.hypot(x - this.player.x, z - this.player.z) < 25) au()?.door({ x, z }, e.ev === 'closing'); } });
    ev.on('tooTired', (e) => { if (isP(e.c)) hud()?.toast('Too winded!', 'warn', 1.2); });
    ev.on('pickup', (e) => { if (isP(e.c)) { au()?.ui('click'); hud()?.toast(`${e.item.pocketOf ? 'Pocketed' : 'Picked up'}: ${e.item.def.name}${e.item.def.contraband ? ' <b class="c">(contraband)</b>' : ''}`, 'info', 1.8); } });
    ev.on('tooFar', (e) => { if (isP(e.c)) hud()?.toast('Too far away', 'warn', 1); });
    ev.on('clock', (e) => {
      if (e.type !== 'period' || this.mode !== 'play') return;
      const p = this.sim.clock.period;
      hud()?.announce(p.name, p.desc, 4);
      au()?.buzzer(); setTimeout(() => au()?.chime(), 2200);
    });
    ev.on('say', (e) => { if (near(e.c) && Math.hypot(e.c.x - this.player.x, e.c.z - this.player.z) < 14) au()?.voice(e.text, 0.8 + ((e.c.def.seed || 3) % 7) / 10 + (e.c.app.female ? 0.45 : 0), pos(e.c), e.opts?.mood); });
    // Prison systems feedback
    ev.on('crime', (e) => { if (isP(e.c)) { hud()?.toast(`Spotted: <b>${e.def.name}</b>${e.witness ? ` — ${e.witness.short}` : ''}`, 'bad', 3); au()?.whistle(pos(e.witness)); } });
    ev.on('arrestConfront', (e) => { if (isP(e.c)) this.dialogue.open(this.player, e.guard, 'arrest'); });
    ev.on('punished', (e) => {
      if (!isP(e.c)) return;
      const r = e.result, parts = [];
      if (r.fine) parts.push(`fined ${r.fine} ramen`); if (r.days) parts.push(`+${r.days} day${r.days > 1 ? 's' : ''} on your sentence`);
      if (r.confiscated.length) parts.push(`confiscated: ${r.confiscated.join(', ')}`); if (r.solitary) parts.push(`${Math.round(r.solitary / 60)}h in solitary`);
      hud()?.announce('Disciplinary Action', parts.join(' · ') || 'A warning. This time.', 6);
      au()?.ui('bad');
    });
    ev.on('teleport', (e) => { if (isP(e.c)) { this.cameraRig.first = true; hud()?.fadeIn(); } });
    ev.on('solitary', (e) => { if (isP(e.c)) { this.cameraRig.first = true; hud()?.toast('You\'ve been thrown in the Hole. Sleep to pass the time.', 'bad', 5); } });
    ev.on('released', (e) => { if (isP(e.c)) { this.cameraRig.first = true; hud()?.toast('Released from solitary.', 'good', 3); } });
    ev.on('bribed', (e) => { if (isP(e.c)) hud()?.toast(`Bribe accepted (${e.amount} ramen).`, 'good', 2.5); });
    ev.on('paid', (e) => { if (isP(e.c)) { au()?.ui('coin'); hud()?.toast(`+${e.amount} ramen (${JOBS[e.job].name})`, 'good', 1.6); } });
    ev.on('statGain', (e) => { if (isP(e.c) && e.value) { au()?.ui('level'); hud()?.toast(`${{ str: 'Strength', agi: 'Agility', tgh: 'Toughness', smt: 'Smarts' }[e.stat]} increased to <b>${e.value}</b>`, 'good', 2.5); } });
    ev.on('respect', (e) => { if (isP(e.c)) hud()?.toast(`Respect +${e.gain}`, 'good', 2); });
    ev.on('favorOffered', () => au()?.ui('good'));
    ev.on('favorReady', (e) => hud()?.toast(`Favour complete — go see ${this.sim.byId.get(e.f.from)?.short}.`, 'good', 3.5));
    ev.on('favorDone', (e) => { au()?.ui('coin'); hud()?.toast(`Favour done: +${e.f.reward} ramen`, 'good', 2.5); });
    ev.on('recruited', (e) => hud()?.toast(`${e.npc.short} has your back now.`, 'good', 3));
    ev.on('newDay', (e) => { if (this.mode === 'play') { hud()?.announce(`Day ${e.day}`, `${e.daysLeft} days left on your sentence.`, 5); this.saveGame('auto', true); } });
    ev.on('parole', (e) => { if (this.mode === 'play') hud()?.announce('Parole Board', e.cut ? `Good conduct: ${e.cut} day${e.cut > 1 ? 's' : ''} taken off your sentence.` : 'Your conduct wasn\'t good enough for a reduction.', 6); });
    ev.on('sentenceChange', (e) => { if (e.delta > 0 && this.mode === 'play') hud()?.toast(`Sentence extended by ${e.delta} day${e.delta > 1 ? 's' : ''}.`, 'bad', 3); });
    ev.on('needWarn', (e) => { if (isP(e.c)) hud()?.toast(e.need === 'hunger' ? 'You\'re starving. Grab a tray at mealtime or buy a snack.' : 'You\'re exhausted. Get some sleep.', 'warn', 4); });
    ev.on('wokeInfirmary', () => { this.cameraRig.first = true; hud()?.fadeIn(1.2); hud()?.announce('Infirmary', 'You came to a few hours later. Your head is pounding.', 5); });
    ev.on('gotMeal', () => hud()?.toast('Grab a seat and press R to eat (or just sit with your tray).', 'info', 3));
    ev.on('mealDone', () => hud()?.toast('Clean plate. Hunger satisfied.', 'good', 2));
    ev.on('notNow', (e) => { if (isP(e.c)) { au()?.ui('bad'); hud()?.toast(e.what, 'warn', 2.5); } });
    ev.on('notYours', (e) => { if (isP(e.c)) hud()?.toast('That\'s not your bunk.', 'warn', 2); });
    ev.on('broke', (e) => { if (isP(e.c)) { au()?.ui('bad'); hud()?.toast(`You need ${e.price} ramen.`, 'warn', 2); } });
    ev.on('bought', (e) => { if (isP(e.c)) au()?.ui('coin'); });
    ev.on('fenceCut', () => { hud()?.toast('The fence gives way. Go! Go!', 'warn', 3); });
    ev.on('keycard', () => { au()?.ui('good'); hud()?.toast('Access granted.', 'info', 1.5); });
    ev.on('activity', (e) => { if (isP(e.c) && e.label) hud()?.toast(`${e.label}… (move to stop)`, 'info', 2); });
    ev.on('jobAssigned', (e) => hud()?.toast(`New job: ${JOBS[e.job].name}. Work detail is 07:30–11:30.`, 'good', 3.5));
    ev.on('hassle', (e) => { if (isP(e.target)) { e.c.flags.hassling = e.demand; hud()?.toast(`${e.c.short} wants ${e.demand} ramen. Talk (E) to deal with it — or don't.`, 'warn', 4); } });
    ev.on('dialogueClose', (e) => { if (e.npc) e.npc.flags.hassling = 0; this.dialogueUI.render(); });
    ev.on('dialogueOpen', () => { this.dialogueUI.sel = 0; this.dialogueUI.render(); });
    ev.on('dialogueBounce', () => au()?.ui('bad'));
    ev.on('talkRequest', (e) => this.dialogue.open(e.a, e.b, 'talk', { hassle: e.b.flags.hassling ? { demand: e.b.flags.hassling } : null }));
    ev.on('openVending', (e) => {
      this.dialogueUI.openList('Vending Machine', e.stock.map((o) => ({ label: `${ITEMS[o.type].name}`, tag: `${o.price} ramen`, disabled: this.player.ramen < o.price, fn: () => { this.sim.economy.buy(this.player, o.type, o.price); return false; } })), `You have ${this.player.ramen} ramen`);
    });
    ev.on('jobBoard', () => {
      this.dialogueUI.openList('Job Board', Object.entries(JOBS).map(([id, J]) => ({ label: `${J.name}${this.player.job === id ? ' (current)' : ''}`, tag: J.desc, disabled: this.player.job === id, fn: () => { this.player.job = id; this.events.emit('jobAssigned', { c: this.player, job: id }); return false; } })), 'Sign up for a work assignment');
    });
    ev.on('ending', (e) => { if (this.mode === 'play') { this.menus.showEnding(e); this.audio?.ui('level'); } });
  }

  // ------------------------------------------------------------------ flow: title, intake, sentence
  titleCamera() { this.mode = this.mode === 'play' ? 'play' : 'title'; this.cameraMode = 'title'; this.titleT = 0; this.input.enabled = false; }
  previewSetup(s) {
    this.mode = 'intake'; this.cameraMode = 'mugshot';
    this._applySetup(s);
    const p = this.player;
    if (p.spot) p.leaveSpot(true);
    p.place(38, 23.6, Math.PI);
    p.setState('free'); p.stop();
  }
  _appearanceFrom(s) {
    return randomAppearance(this.seed + 17, {
      outfit: 'inmateA', female: s.female, build: s.build, skin: SKIN_TONES[s.skin], hair: HAIR_STYLES[s.hair], facial: s.female ? 'none' : FACIAL[s.facial],
      idNumber: 'A-0417', glasses: false, bandana: null,
    });
  }
  _applySetup(s) {
    const p = this.player;
    const app = this._appearanceFrom(s);
    app.hair.color = HAIR_COLORS[s.hairColor]; app.facialColor = HAIR_COLORS[s.hairColor];
    const key = JSON.stringify(s);
    if (this._lastSetupKey === key) return;
    this._lastSetupKey = key;
    if (p.rig) { this.lighting.removeShadowCaster(p.rig.mesh); p.rig.dispose(); }
    p.app = app; p.dims = rigDims(app);
    p.anim = new Animator(p.dims, 77);
    p.rig = new CharacterRig(this.scene, app, 'ch_player');
    this.lighting.addShadowCaster(p.rig.mesh);
    p.name = s.name || 'Inmate'; p.short = (s.name || 'Inmate').split(' ')[0];
    p.radius = 0.3 + (app.build.girth - 1) * 0.22;
  }
  beginSentence(s) {
    s = s || { name: 'Dale Pickett', female: false, skin: 2, hair: 2, hairColor: 1, facial: 1, build: 'average', crime: 0, days: 21 };
    this.playerSetup = s;
    this._applySetup(s);
    const sim = this.sim, p = this.player;
    sim.progression.sentence = { total: s.days, daysLeft: s.days, served: 0, crime: CRIME_LIST[s.crime] || 'Grand Theft Lawnmower' };
    p.def.crime = sim.progression.sentence.crime;
    this.menus.close();
    this.mode = 'play'; this.cameraMode = 'follow';
    this.input.enabled = true;
    // Intake: arrive in the central hall at 06:00, greeted by the sergeant.
    if (p.spot) p.leaveSpot(true);
    p.place(38, 14.5, 0); p.setState('free');
    this.cameraRig.yaw = 0; this.cameraRig.first = true;
    const sgt = sim.byId.get('kettle');
    if (sgt) {
      sgt.place(38, 17.2, Math.PI);
      const b = sim.brainOf(sgt); if (b) { b.goal = { type: 'post', x: 38, z: 17.2, yaw: Math.PI, until: sim.clock.total + 8, t: 0, period: '*' }; }
      const lines = [`Welcome to Gravelmouth, ${p.short}. You're in cell ${p.cell}, Block A.`, 'Buzzers tell you where to be. Be there.', 'Keep your hands to yourself and your nose clean. Questions? Don\'t.'];
      lines.forEach((l, i) => sim.timers.push({ t: 0.8 + i * 3.4, fn: () => sgt.say(l, 3.3) }));
    }
    this.hud.announce('Day 1 · Gravelmouth State Penitentiary', `${s.days} days for ${sim.progression.sentence.crime}.`, 6);
    const tips = [
      [6, 'WASD to move, mouse to look (click the game to capture the mouse). Shift to sprint.'],
      [12, 'E talks, picks things up and uses furniture. Tab cycles between nearby targets.'],
      [19, 'C opens your notebook: stats, people, favours, schedule and map.'],
      [27, 'LMB punch, RMB kick, Q block — tap Q when ⚡ appears to counter. F grabs.'],
    ];
    for (const [t, text] of tips) sim.timers.push({ t, fn: () => this.hud.toast(text, 'info', 6) });
    this.saveGame('auto', true);
  }
  quitToTitle() {
    this.dialogue.close('bye');
    this.mode = 'title';
    this.menus.showTitle();
    this.titleCamera();
  }
  saveGame(slot, quiet = false) {
    if (this.mode !== 'play') return false;
    const ok = saveSlot(this, slot);
    if (!quiet) this.hud.toast(ok ? `Saved to ${slot === 'auto' ? 'autosave' : `slot ${slot}`}.` : 'Save failed (storage unavailable).', ok ? 'good' : 'bad', 2);
    return ok;
  }
  loadGame(slot) {
    const data = loadSlot(slot);
    if (!data) { this.hud.toast('No save in that slot.', 'warn', 2); return false; }
    if (data.playerSetup) this.beginSentence(data.playerSetup);
    for (const t of [...this.sim.timers]) this.sim.timers.splice(0);
    applySave(this, data);
    this.menus.close();
    this.cameraRig.first = true; this.cameraRig.snapBehind(this.player);
    this.hud.toast('Game loaded.', 'good', 2);
    return true;
  }

  _updateLighting(dt) {
    const cam = this.cameraRig.camera.position, p = this.player;
    const indoor = this.world.ceilingAt(cam.x, cam.z) != null ? 1 : 0;
    return this.lighting.update(dt, this.sim.clock.minutes, indoor, p ? new BABYLON.Vector3(p.x, 0, p.z) : cam, this.sim.clock.lightsOut);
  }
  _audioFrame(dt) {
    const a = this.audio;
    if (!a || !a.ready) return;
    const cam = this.cameraRig.camera.position, p = this.player;
    a.setListener(cam.x, cam.y, cam.z, this.cameraRig.yaw);
    // Footsteps from the mocap gait phase (contact moments) for nearby characters
    for (const c of this.sim.characters) {
      const d = Math.hypot(c.x - cam.x, c.z - cam.z);
      if (d > 14 || c.state === 'spot') continue;
      const ph = c.anim.loco.phase, mw = c.anim.moveW;
      const prev = c._stepPh ?? ph; c._stepPh = ph;
      if (mw > 0.3 && Math.floor(prev * 2) !== Math.floor(ph * 2)) a.play('footstep', { pos: c, vol: 0.18 + Math.min(0.25, Math.hypot(c.vx, c.vz) * 0.05), key: c.id, minGap: 0.12, rate: c.app.build.girth > 1.15 ? 0.85 : 1 });
    }
    this._ambT = (this._ambT || 0) - dt;
    if (this._ambT <= 0) {
      this._ambT = 0.5;
      let crowd = 0, fight = 0;
      for (const c of this.sim.characters) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < 16) crowd++; if (d < 14 && c.combatTimer > 4 && c.combatTarget) fight++; }
      const indoor = this.world.ceilingAt(cam.x, cam.z) != null ? 1 : 0;
      a.setAmbience(indoor, crowd, this.sim.clock.lightsOut ? 1 : 0);
      a.setIntensity(Math.min(1, fight / 3 + (this.sim.rules.isWanted(p) ? 0.5 : 0)));
      if (fight >= 3 && Math.random() < 0.2) a.cheer({ x: p.x, z: p.z }, 0.12);
    }
  }
  /** Could the player notice something at (x, z)? Deliberately generous: anything near the
   *  player, or inside the camera's view cone with a clear line from the camera or the player,
   *  counts as seen. The simulation asks this before moving anyone instantly, so people never
   *  pop in or out of existence on screen. */
  canSee(x, z) {
    const cam = this.cameraRig && this.cameraRig.camera;
    if (!cam) return false;
    const p = this.player;
    if (p && this.mode === 'play' && Math.hypot(x - p.x, z - p.z) < 7) return true;
    const cx = cam.position.x, cz = cam.position.z;
    const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
    if (d < 4) return true;
    if (d > 80) return false;
    const t = cam.getTarget();
    const camYaw = Math.atan2(t.x - cx, t.z - cz);
    const aspect = this.engine ? this.engine.getAspectRatio(cam) : 16 / 9;
    const halfH = Math.atan(Math.tan(cam.fov / 2) * aspect) + 0.25;
    if (Math.abs(angleDiff(camYaw, Math.atan2(dx, dz))) > halfH) return false;
    const nav = this.world.nav;
    return nav.sightClear(cx, cz, x, z) || (!!p && this.mode === 'play' && nav.sightClear(p.x, p.z, x, z));
  }
  isVisibleToPlayer(c) { return this.canSee(c.x, c.z); }

  // ------------------------------------------------------------------ loop
  frame() {
    const realDt = Math.min(0.1, this.engine.getDeltaTime() / 1000);
    this.time += realDt;
    this.input.beginFrame(this.time);
    const STEP = 1 / 60;
    this.acc = Math.min(this.acc + realDt, STEP * 5);
    let steps = 0;
    this.menus.update();
    this.dialogueUI.update();
    const playing = this.mode === 'play' && !this.menuOpen;
    const simulate = playing || this.mode === 'title';
    this.input.enabled = playing && !this.dialogueUI.list;
    while (this.acc >= STEP && steps < 5) {
      if (simulate) { if (playing) this.controller.update(STEP); else this.player.stop(); this.sim.step(STEP); }
      this.acc -= STEP; steps++;
    }
    if (!simulate) this.acc = 0;
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
    if (this._debugFreeze) { /* camera fixed by a test */ }
    else if (this.cameraMode === 'title') {
      this.titleT = (this.titleT || 0) + dt;
      const a = this.titleT * 0.05;
      const cam = this.cameraRig.camera;
      cam.position.set(40 + Math.sin(a) * 34, 15 + Math.sin(a * 0.7) * 3, 84 + Math.cos(a) * 26);
      cam.setTarget(new BABYLON.Vector3(38, 2, 66));
    } else if (this.cameraMode === 'mugshot') {
      const cam = this.cameraRig.camera;
      cam.position.set(p.x - 0.55, p.y + 1.55, p.z - 2.4);
      cam.setTarget(new BABYLON.Vector3(p.x - 0.55, p.y + 1.25, p.z));
    } else this.cameraRig.update(dt, this.menuOpen || this.dialogueUI.list ? null : this.input, p, { lockTarget: p.lockTarget, talkPartner: this.dialogue?.active ? this.dialogue.npc : null, followInput: this.input.lastDevice !== 'keyboard' && Math.hypot(p.vx, p.vz) > 1 ? this.input.moveVector() : null });
    // When walls push the camera right up behind the player, fade them out instead of filling the
    // screen with the inside of their head.
    if (p.rig) {
      const cd = this.cameraMode === 'follow' ? this.cameraRig.curDist : 9;
      const vis = cd < 1.15 ? Math.max(0.15, Math.min(1, (cd - 0.5) / 0.65)) : 1;
      if (Math.abs(p.rig.mesh.visibility - vis) > 0.01) p.rig.mesh.visibility = vis;
    }
    this._audioFrame(dt);
    const tod = this._updateLighting(dt);
    this.worldView.update(dt, tod);
    this.fx.update(dt);
    this.hud.setVisible(this.mode === 'play');
    if (this.mode === 'play') this.hud.update(dt);
    this.touch?.update();
    this.scene.render();
  }

  // ------------------------------------------------------------------ debug helpers (tests)
  /** Advance the simulation deterministically, then present one frame. `present: true` also
   *  presents after every step; `present: N` presents every N steps (camera follows at N×dt),
   *  which keeps tests affordable where rendering is slow (software WebGL). */
  debugStep(seconds, opts = {}) {
    const STEP = 1 / 60;
    const n = Math.round(seconds / STEP);
    const every = opts.present === true ? 1 : (typeof opts.present === 'number' ? Math.max(1, opts.present | 0) : 0);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      this.time += STEP;
      this.input.beginFrame(this.time);
      this.menus.update();
      this.dialogueUI.update();
      this.controller.update(STEP);
      this.sim.step(STEP);
      this._updateLighting(STEP);
      if (every && (i + 1) % every === 0) this.present(STEP * every);
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
