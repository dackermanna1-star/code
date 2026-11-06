// Game orchestrator: state machine, main loop, world lifecycle, glue between all systems.
import * as THREE from 'three';
import { Renderer } from '../render/Renderer.js';
import { Sky } from '../render/Sky.js';
import { Weather } from '../render/Weather.js';
import { getBlockTextures } from '../render/textureArray.js';
import { BlockCracks } from '../render/BlockCracks.js';
import { globalUniforms, MAX_POINT_LIGHTS } from '../render/materials.js';
import { Input } from './Input.js';
import { World, ZONES, ZONE_NAMES } from '../world/World.js';
import { BLOCKS, B, IS_DOOR, LIGHT_EMIT, faceTexture } from '../world/blocks.js';
import { ChunkRenderer } from '../world/ChunkRenderer.js';
import { generateWorld } from '../world/gen/index.js';
import { lineOfSight, raycast } from '../world/raycast.js';
import { Player } from '../player/Player.js';
import { Survival } from '../player/Survival.js';
import { Combat } from '../player/Combat.js';
import { Viewmodel } from '../player/Viewmodel.js';
import { PROFESSIONS, SKILLS, getProfession } from '../player/professions.js';
import { ZombieManager } from '../entities/ZombieManager.js';
import { GroundItems } from '../entities/GroundItems.js';
import { Vehicles } from '../entities/Vehicles.js';
import { Corpses } from '../entities/Corpses.js';
import { FX } from '../entities/fx/FX.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { UI } from '../ui/UI.js';
import { Events } from './Events.js';
import { Interactor } from './Interact.js';
import { ItemActions } from './ItemActions.js';
import { SaveManager, u8ToB64, b64ToU8 } from '../save/SaveManager.js';
import { getItemDef, createItem, setItemClock } from '../items/items.js';
import { getRecipeStatus, craft as craftRecipe, RECIPES } from '../items/crafting.js';
import { generateLoot } from '../items/loot.js';
import { EQUIP_SLOTS } from '../inventory/Inventory.js';
import { makeRng, seedFromString, hash32, clamp, lerp } from './rng.js';
import { groundAt } from '../entities/pathfind.js';
import { boxFree } from './physics.js';

const DEFAULT_SETTINGS = {
  sensitivity: 1, fov: 75, renderDistance: 10, quality: 'high', masterVolume: 0.8, sfxVolume: 1, musicVolume: 0.55,
  invertY: false, showFps: false, headBob: true, zombieDensity: 1,
};
const POI_SUBTITLES = {
  hospital: 'Medical supplies. Many infected.', police: 'Weapons and ammunition. Locked armory.', military: 'Restricted area. Extreme danger.',
  farm: 'Fields, a well pump and a barn.', camp: 'Someone was living here.', gas: 'Fuel and snacks.', school: 'Lockers and classrooms.',
  store: 'Shelves may still have food.', residential: 'Houses to search.', forest: 'Quiet woods.', highway: 'Abandoned traffic.',
  civic: 'Offices and records.', fire: 'Axes, gear and a truck bay.', church: 'Pews, candles - and whoever hid here.', cemetery: 'Quiet. Too quiet.',
  motel: 'Rooms to search, one by one.', cabin: 'Hunting gear, maybe.', ranger: 'Maps, radios, rifles.', roadblock: 'Someone tried to hold this line.',
  industrial: 'Tools and scrap.', park: 'Open ground. Nowhere to hide.', landmark: 'A good vantage point.', town: 'The heart of Millbrook.',
  water: 'Fresh water - boil it first.', trailer: 'Thin walls. Lots of neighbours.', street: 'Houses to search.',
};
const TIP_PHASES = [[5, 'Before dawn'], [7, 'Dawn'], [10, 'Morning'], [13, 'Midday'], [17, 'Afternoon'], [19.5, 'Dusk'], [22, 'Evening'], [24, 'Night']];

export class Game {
  constructor(container, uiRoot) {
    this.container = container;
    this.settings = SaveManager.loadSettings(DEFAULT_SETTINGS);
    this.renderer = new Renderer(container);
    this.input = new Input(this.renderer.canvas);
    this.audio = new AudioEngine();
    this.viewmodel = new Viewmodel();
    this.viewmodel.ejectShells = false; // world-space casings are spawned by Combat
    this.PROFESSIONS = PROFESSIONS;
    this.SKILLS = SKILLS;
    this.state = 'menu';
    setItemClock(() => this.time.totalHours);
    this.hud = { interaction: null, progress: null, ammo: null, heldName: null, durability: null };
    this.time = { day: 1, hour: 8, minute: 0, totalHours: 8, isNight: false, phase: 'day' };
    this.weatherInfo = { type: 'clear', label: 'Clear', temperature: 14, wind: 0.2 };
    this.location = { name: '', zone: '' };
    this.clock = 0;
    this.fps = 60;
    this.markers = [];
    this.mapExplored = new Uint8Array(128 * 128);
    this.mapRevealed = false;
    this.discovered = new Set();
    this.readNotes = new Set();
    this.dynLights = [];
    this.blockDamage = new Map();
    this.fires = [];
    this.campfires = new Map();
    this.rainCollected = 0;
    this.actionBusy = false;
    this.action = null;
    this.world = null;
    this.player = new Player();
    this.ui = new UI(this, uiRoot);
    this.ui.showMainMenu?.();
    this.applySettings(false);
    this.setupInput();
    this.last = performance.now();
    this.renderer.renderer.setAnimationLoop(() => this.frame());
    // first user gesture starts audio
    const startAudio = () => {
      this.audio.init();
      this.audio.setVolumes({ master: this.settings.masterVolume, sfx: this.settings.sfxVolume, music: this.settings.musicVolume, ambience: 1 });
      if (this.state === 'menu') this.audio.setMusic('menu');
    };
    window.addEventListener('pointerdown', startAudio, { once: false });
    window.addEventListener('keydown', startAudio, { once: false });
    this.menuScene();
  }

  get weather() { return this.weatherSys; }
  get isNight() { return this.time.isNight; }

  // ------------------------------------------------------------------ settings / save api for UI
  applySettings(persist = true) {
    const s = this.settings;
    this.renderer.setQuality(s.quality);
    this.renderer.shadowsEnabled = !!this.renderer.shadowRT && s.quality !== 'low';
    if (this.chunks) this.chunks.radius = clamp(s.renderDistance | 0, 4, 16);
    this.audio.setVolumes?.({ master: s.masterVolume, sfx: s.sfxVolume, music: s.musicVolume, ambience: 1 });
    if (persist) SaveManager.saveSettings(s);
  }
  hasSave() { return SaveManager.has(); }
  getSaveInfo() { return SaveManager.info(); }

  setupInput() {
    const inp = this.input;
    inp.onKeyDown = (e) => {
      if (this.state === 'playing' || this.state === 'paused') {
        if (this.ui.handleKey?.(e)) return true;
        if (e.code === 'Escape') {
          if (this.state === 'playing') this.pause(); else this.resume();
          return true;
        }
      }
      return false;
    };
    inp.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.ui.isBlocking?.()) this.pause();
    };
    this.renderer.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.ui.isBlocking?.()) inp.lock();
    });
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.unlock();
    this.ui.showPause?.();
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.hidePause?.();
    this.input.lock();
    this.last = performance.now();
  }

  // ------------------------------------------------------------------ menu background
  menuScene() {
    // nothing heavy: the UI draws the main menu; render a dark frame
  }

  // ------------------------------------------------------------------ world lifecycle
  async newGame({ name = 'Survivor', seed = '', profession = 'unemployed' } = {}) {
    const seedNum = seed && String(seed).trim() ? (/^\d+$/.test(String(seed)) ? Number(seed) >>> 0 : seedFromString(String(seed))) : (Math.random() * 4294967295) >>> 0;
    await SaveManager.clear();
    await this.startWorld(seedNum, null, { name, profession });
  }

  async continueGame() {
    const data = await SaveManager.load();
    if (!data) { this.ui.toast?.('No saved game found.', 'warn'); return; }
    await this.startWorld(data.seed, data, null);
  }

  async startWorld(seed, save, fresh) {
    this.state = 'loading';
    this.ui.hideMainMenu?.();
    this.ui.closeAll?.();
    this.audio.setMusic('none');
    const progress = async (f, label) => {
      this.ui.showLoading?.(label || 'Loading...', f);
      await new Promise((r) => setTimeout(r, 0));
    };
    await progress(0, 'Preparing Millbrook County...');
    this.disposeWorld();
    const world = new World();
    world.seed = seed;
    this.world = world;
    await generateWorld(world, seed, (f, label) => progress(f * 0.62, label || 'Generating the county...'));
    world.computeHeightmap();
    // apply saved block changes before lighting
    if (save) this.applyWorldDiff(save);
    world.generated = true;
    await progress(0.63, 'Lighting the world...');
    await world.computeAllLight((f) => progress(0.63 + f * 0.17, 'Lighting the world...'));

    // systems
    const r = this.renderer;
    this.textures = getBlockTextures();
    this.chunks = new ChunkRenderer(world, r.scene, this.textures);
    this.chunks.radius = clamp(this.settings.renderDistance | 0, 4, 16);
    r.initShadows(this.chunks.group, this.textures.texture);
    r.shadowsEnabled = this.settings.quality !== 'low';
    this.sky = new Sky(r.scene);
    this.weatherSys = new Weather(r.scene, world, makeRng(seed ^ 0xabcdef));
    this.weatherSys.onThunder = (delay, dist) => setTimeout(() => this.audio.thunder?.(dist), delay * 1000);
    this.fx = new FX(r.scene, world);
    this.cracks = new BlockCracks(r.scene, this.textures);
    this.player = new Player();
    this.player.xpBoost = null;
    this.survival = new Survival(this.player);
    this.combat = new Combat(this);
    this.zombies = new ZombieManager(this);
    this.groundItems = new GroundItems(this);
    this.vehicles = new Vehicles(this);
    this.corpses = new Corpses(this);
    this.events = new Events(this);
    this.interact = new Interactor(this);
    this.itemActions = new ItemActions(this);
    this.markers = this.events.markers;
    this.mapCanvas = null;
    this.mapExplored = new Uint8Array(128 * 128);
    this.mapRevealed = false;
    this.discovered = new Set();
    this.readNotes = new Set();
    this.blockDamage = new Map();
    this.fires = [];
    this.campfires = new Map();
    this.dynLights = [];
    this.action = null; this.actionBusy = false;
    this.lastPOI = null;
    this.autosaveT = 0;
    this.lastDayBanner = 0;
    this.survival.onDeath = (cause) => this.onPlayerDeath(cause);
    this.survival.onVomit = () => { this.audio.play('cough', { volume: 1 }); this.ui.toast?.('You threw up.', 'danger'); };
    this.survival.onSymptoms = () => { this.ui.toast?.('You feel feverish... something is very wrong.', 'danger'); this.ui.subtitle?.('The wound burns. Your head is pounding. You need medicine - real medicine.', 6); };
    this.player.onLevelUp = (skill, lvl) => { this.audio.play('level_up', { volume: 0.7 }); this.ui.toast?.(`${SKILLS[skill].name} increased to ${lvl}`, 'good'); };
    this.player.inv.onChange = () => this.afterInventoryChange(true);

    if (save) this.loadState(save);
    else this.setupNewPlayer(fresh);
    this.player.xpBoost = this.survival.bookBoost;

    await progress(0.82, 'Building terrain...');
    await this.chunks.prebuild(this.player.x, this.player.z, Math.min(6, this.chunks.radius), (f) => progress(0.82 + f * 0.16, 'Building terrain...'));
    // pre-build nearby car models during loading (painting their textures mid-game causes hitches)
    for (let i = 0; i < 40 && this.vehicles.buildNear(60, 8) > 0; i++) await progress(0.98, 'Parking cars...');
    await progress(1, 'Ready');
    this.renderer.resetExposure?.(); this.renderer.invalidateShadows?.();
    this.ui.hideLoading?.();
    this.state = 'playing';
    this.clock = 0;
    this.last = performance.now();
    this.afterInventoryChange();
    this.input.lock();
    this.audio.setMusic('calm');
    if (!save) {
      setTimeout(() => this.ui.locationBanner?.('Millbrook, Kentucky', `Day ${this.time.day} · ${this.player.professionName}`), 600);
      setTimeout(() => this.ui.subtitle?.('Ten days since the outbreak. The radio went quiet yesterday. Find supplies. Stay alive.', 7), 2500);
    }
  }

  setupNewPlayer({ name, profession }) {
    const p = this.player, w = this.world;
    const prof = getProfession(profession);
    p.name = name || 'Survivor';
    p.profession = prof.id;
    p.professionName = prof.name;
    p.bonus = prof.bonus || {};
    p.xpMult = prof.xpMult || 1;
    for (const [s, l] of Object.entries(prof.skills || {})) p.skills[s].level = l;
    // spawn
    const rng = makeRng(w.seed ^ 0x1234);
    const homes = w.spawnPoints.filter((s) => { const zn = w.getZone(Math.floor(s.x), Math.floor(s.z)); return zn !== ZONES.CAMP && zn !== ZONES.WATER && zn !== ZONES.WILD; });
    const pool = homes.length ? homes : w.spawnPoints;
    const sp = pool.length ? rng.pick(pool) : { x: w.SX / 2, y: w.surfaceY(w.SX / 2, w.SZ / 2), z: w.SZ / 2, yaw: 0 };
    p.x = sp.x + 0.5; p.y = sp.y; p.z = sp.z + 0.5; p.yaw = sp.yaw || 0;
    if (!boxFree(w, p.x, p.y, p.z, p.hw, p.h)) {
      const gy = groundAt(w, Math.floor(p.x), Math.floor(p.y) + 3, Math.floor(p.z));
      if (gy > 0) p.y = gy;
    }
    // starting kit
    const inv = p.inv;
    const shirt = rng.pick(['tshirt', 'flannel_shirt', 'tank_top', 'dress_shirt'].filter((id) => getItemDef(id).id === id)) || 'tshirt';
    const eq = (slot, id) => { if (getItemDef(id).id === id) inv.setEquipped(slot, createItem(id, { dur: 0.7 + rng.next() * 0.3 })); };
    eq('torso', shirt);
    eq('legs', 'jeans');
    eq('feet', 'sneakers');
    if (rng.chance(0.6)) eq('jacket', 'hoodie');
    const give = (id, o = {}) => { if (getItemDef(id).id === id) inv.addItem(createItem(id, o)); };
    give('water_bottle', { uses: 2, data: { liquid: 'water' } });
    give(rng.pick(['granola_bar', 'chips', 'chocolate', 'crackers']));
    give('rag', { count: 1 });
    for (const [id, n] of prof.startItems || []) give(id, { count: n });
    this.time = this.computeTime(8);
    this.weatherSys.set('cloudy', true);
  }

  disposeWorld() {
    if (!this.world) return;
    this.zombies?.clearAll();
    this.groundItems?.clear();
    this.vehicles?.clear();
    this.corpses?.clear();
    this.fx?.clear?.();
    this.chunks?.dispose();
    this.combat?.dispose?.();
    for (const f of this.fires || []) f.snd?.stop?.();
    this.fires = [];
    for (const v of this.vehicles?.list || []) v.alarmSound?.stop?.();
    // remove everything else from the scene
    const sc = this.renderer.scene;
    while (sc.children.length) sc.remove(sc.children[0]);
    this.world = null;
  }

  async quitToMenu() {
    if (this.state === 'playing' || this.state === 'paused') await this.saveGame();
    this.state = 'menu';
    this.input.unlock();
    this.ui.hidePause?.();
    this.ui.closeAll?.();
    this.disposeWorld();
    this.ui.showMainMenu?.();
    this.audio.setAmbience({ rain: 0, wind: 0, storm: 0, night: 0, heartbeat: 0, tension: 0, breathing: 0 });
    this.audio.setMusic('menu');
  }

  // ------------------------------------------------------------------ save / load
  async saveGame() {
    if (!this.world || this.player.dead) return false;
    const data = this.serialize();
    const ok = await SaveManager.save(data);
    if (ok) this.ui.toast?.('Game saved.', 'info');
    return ok;
  }

  serialize() {
    const w = this.world, p = this.player;
    const containers = [];
    for (const [idx, c] of w.containers) if (c.items || c.lockedChanged) containers.push([idx, c.items, c.locked]);
    const doors = [];
    for (const [idx, d] of w.doors) doors.push([idx, d.open ? 1 : 0, d.locked, Math.round(d.hp), Math.round(d.barricade || 0)]);
    const pl = {};
    for (const k of ['x', 'y', 'z', 'yaw', 'pitch', 'name', 'profession', 'professionName', 'bonus', 'xpMult', 'health', 'hunger', 'thirst', 'stamina', 'energy', 'bodyTemp', 'wetness',
      'sickness', 'panic', 'pain', 'infection', 'infected', 'infectionKnown', 'drunk', 'painkiller', 'caffeine', 'adrenaline', 'antibioticSlow', 'antiviralProtect', 'wounds', 'skills', 'kills', 'headshots', 'daysSurvived', 'flashlightOn']) pl[k] = p[k];
    pl.inv = p.inv.toJSON();
    return {
      version: 1, seed: w.seed, savedAt: Date.now(),
      time: { ...this.time }, weather: this.weatherSys.toJSON(), player: pl,
      changes: [...w.changes], metaChanges: [...w.metaChanges],
      containers, doors, ground: this.groundItems.toJSON(), vehicles: this.vehicles.toJSON(), corpses: this.corpses.toJSON(),
      zombies: this.zombies.toJSON(), events: this.events.toJSON(), interact: this.interact.toJSON(),
      explored: u8ToB64(this.mapExplored), mapRevealed: this.mapRevealed, discovered: [...this.discovered], readNotes: [...this.readNotes],
      bookBoost: this.survival.bookBoost, rainCollected: this.rainCollected,
      blockDamage: [...this.blockDamage].filter(([, v]) => v < 0),
      campfires: [...this.campfires.values()],
    };
  }

  applyWorldDiff(save) {
    const w = this.world;
    for (const [idx, id] of save.changes || []) w.blocks[idx] = id;
    for (const [idx, m] of save.metaChanges || []) { if (m) w.meta.set(idx, m); else w.meta.delete(idx); }
    for (const [idx, id] of save.changes || []) w.changes.set(idx, id);
    for (const [idx, m] of save.metaChanges || []) w.metaChanges.set(idx, m);
    w.computeHeightmap();
  }

  loadState(s) {
    const w = this.world, p = this.player;
    for (const [idx, items, locked] of s.containers || []) {
      const y = idx % w.SY, col = (idx - y) / w.SY, x = col % w.SX, z = (col - x) / w.SX;
      const c = w.getContainer(x, y, z);
      if (c) { c.items = items; c.locked = locked; }
    }
    for (const [idx, open, locked, hp, bar] of s.doors || []) {
      const y = idx % w.SY, col = (idx - y) / w.SY, x = col % w.SX, z = (col - x) / w.SX;
      const d = w.getDoor(x, y, z);
      if (d) { d.open = !!open; d.locked = locked; d.hp = hp; d.barricade = bar; }
    }
    const pl = s.player;
    Object.assign(p, { ...pl, inv: p.inv });
    p.inv.load(pl.inv);
    this.time = this.computeTime(s.time.totalHours);
    this.weatherSys.load(s.weather);
    this.groundItems.load(s.ground);
    this.vehicles.load(s.vehicles);
    this.corpses.load(s.corpses);
    this.zombies.load(s.zombies);
    this.events.load(s.events);
    this.interact.load(s.interact);
    this.mapExplored = s.explored ? b64ToU8(s.explored, 128 * 128) : new Uint8Array(128 * 128);
    this.mapRevealed = !!s.mapRevealed;
    this.discovered = new Set(s.discovered || []);
    this.readNotes = new Set(s.readNotes || []);
    Object.assign(this.survival.bookBoost, s.bookBoost || {});
    this.rainCollected = s.rainCollected || 0;
    for (const [i, v] of s.blockDamage || []) this.blockDamage.set(i, v);
    for (const c of s.campfires || []) this.campfires.set(w.idx(c.x, c.y, c.z), c);
    this.lastDayBanner = this.time.day;
  }

  // ------------------------------------------------------------------ time
  computeTime(totalHours) {
    const day = Math.floor(totalHours / 24) + 1;
    const hour = totalHours % 24;
    const h = Math.floor(hour), minute = Math.floor((hour - h) * 60);
    const isNight = hour < 5.6 || hour > 19.9;
    const phase = hour < 5 || hour >= 21 ? 'night' : hour < 7.5 ? 'dawn' : hour < 18.5 ? 'day' : 'dusk';
    let label = 'Night';
    for (const [lim, l] of TIP_PHASES) if (hour < lim) { label = l; break; }
    return { day, hour: h, minute, hourF: hour, totalHours, isNight, phase, label };
  }

  // ------------------------------------------------------------------ main loop
  frame() {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    this.fps = lerp(this.fps, 1 / Math.max(dt, 1e-3), 0.05);
    globalUniforms.uTime.value += dt;
    const tu = performance.now();
    if (this.state === 'playing' && this.world) {
      try { this.update(dt); } catch (e) { console.error(e); }
    }
    const tr = performance.now();
    if (this.world && (this.state === 'playing' || this.state === 'paused' || this.state === 'dead')) {
      this.renderWorld(dt);
    } else {
      this.renderer.renderer.setRenderTarget(null);
      this.renderer.renderer.clear();
    }
    const te = performance.now();
    this.perf = this.perf || { update: 0, render: 0 };
    this.perf.update = lerp(this.perf.update, tr - tu, 0.1);
    this.perf.render = lerp(this.perf.render, te - tr, 0.1);
    this.ui.update?.(dt);
    // re-capture the mouse when a panel closes
    const blocking = !!this.ui.isBlocking?.();
    if (blocking && !this.wasBlocking && this.input.locked && this.state === 'playing') this.input.unlock();
    if (this.wasBlocking && !blocking && this.state === 'playing') this.input.lock();
    this.wasBlocking = blocking;
    this.input.endFrame();
  }

  readInput() {
    const i = this.input;
    const blocking = this.ui.isBlocking?.() || !i.locked;
    const k = (c) => !blocking && i.down(c);
    const kp = (c) => !blocking && i.wasPressed(c);
    return {
      fwd: (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0),
      strafe: (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0),
      jump: k('Space'),
      sprint: k('ShiftLeft') || k('ShiftRight'),
      crouch: k('KeyC') || k('ControlRight'),
      attack: !blocking && i.mouseDown(0),
      attackPressed: !blocking && i.mousePressed(0),
      aim: !blocking && i.mouseDown(2),
      aimPressed: !blocking && i.mousePressed(2),
      heavy: false,
      reloadPressed: kp('KeyR'),
      interactPressed: kp('KeyE'),
      flashlightPressed: kp('KeyF'),
      throwPressed: kp('KeyG'),
      modePressed: kp('KeyB'),
      shovePressed: kp('KeyV'),
      dropPressed: kp('KeyQ'),
      blocking,
    };
  }

  update(dt) {
    const p = this.player, w = this.world;
    this.clock += dt;
    const input = this.readInput();
    const inp = this.input;

    // look
    if (!input.blocking && !p.dead) {
      const sens = 0.0022 * this.settings.sensitivity * (p.aiming ? 0.65 : 1) * (p.scopeActive ? 0.4 : 1);
      p.yaw -= inp.mouse.dx * sens;
      p.pitch -= inp.mouse.dy * sens * (this.settings.invertY ? -1 : 1);
      p.pitch = clamp(p.pitch, -1.55, 1.55);
      if (inp.mouse.wheel) {
        p.inv.selected = (p.inv.selected + (inp.mouse.wheel > 0 ? 1 : -1) + 9) % 9;
        p.inv.changed();
      }
      for (let n = 1; n <= 9; n++) if (inp.wasPressed('Digit' + n)) { p.inv.selected = n - 1; p.inv.changed(); }
      if (input.flashlightPressed) this.toggleFlashlight();
      if (input.dropPressed && p.inv.selectedStack) this.dropItem(p.inv.hotbarDesc(), p.inv.selected, 1);
    }

    // movement
    const over = p.weight / p.maxWeight;
    let carry = over <= 1 ? 1 : over <= 1.25 ? 0.88 : over <= 1.5 ? 0.75 : over <= 2 ? 0.55 : 0.3;
    const frac = p.wounds.find((wd) => wd.type === 'fracture');
    if (frac) carry *= frac.splinted ? 0.85 : 0.6;
    if (p.pain > 60 && p.painkiller <= 0) carry *= 0.85;
    if (this.actionBusy) carry *= 0.45;
    const cl = this.survival.clothing();
    const mv = p.updateMovement(dt, input, { world: w, vehicles: this.vehicles.nearColliders(p.x, p.z), carryFactor: carry * (cl.speed || 1), noSprint: over > 1.5 || (frac && !frac.splinted) || this.actionBusy });
    if (mv.footstep) {
      const mat = { grass: 'grass', plant: 'grass', dirt: 'dirt', stone: 'stone', wood: 'wood', metal: 'metal', gravel: 'gravel', water: 'water', sand: 'sand', leaves: 'leaves', cloth: 'cloth', glass: 'stone' }[mv.footstep] || 'stone';
      this.audio.play('footstep_' + mat, { volume: p.sprinting ? 0.8 : p.crouching ? 0.25 : 0.5 });
      if (p.noiseLevel > 0) this.noise(p.x, p.y, p.z, p.noiseLevel * (1 - p.skillLevel('sneaking') * 0.05), 'footstep', true);
      if (p.crouching && this.zombies.near(p.x, p.y, p.z, 12).length) p.addXP('sneaking', 0.6);
    }
    if (mv.jumped) this.audio.play('jump', { volume: 0.4 });
    if (mv.landed) {
      if (mv.landed > 3.6) {
        const dmg = (mv.landed - 3.6) * 9;
        this.survival.hurt(dmg, 'Fell to death');
        this.audio.play('land_hard', { volume: 1 });
        p.shake = 0.6;
        if (mv.landed > 6 && Math.random() < 0.55 && !p.wounds.some((x) => x.type === 'fracture')) {
          this.survival.addWound('fracture', Math.random() < 0.5 ? 'legL' : 'legR');
          this.ui.toast?.('You broke your leg!', 'danger');
        }
        this.noise(p.x, p.y, p.z, 10, 'land', true);
      } else this.audio.play('land', { volume: 0.5 });
    }
    if (mv.splash) this.audio.play('splash', { volume: 0.8 });
    // contact damage (barbed wire, fire, broken glass)
    const fid = w.get(Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z));
    const fdef = BLOCKS[fid];
    if (fdef.damage > 0 && (p.moving01 > 0.1 || fid === B.fire || fid === B.campfire)) {
      this.contactT = (this.contactT || 0) - dt;
      if (this.contactT <= 0) {
        this.contactT = 0.8;
        this.survival.hurt(fdef.damage * 0.8, fid === B.fire || fid === B.campfire ? 'Burned to death' : 'Cut to pieces');
        if (fid === B.barbed_wire && Math.random() < 0.3) this.survival.addWound('laceration', Math.random() < 0.5 ? 'legL' : 'legR');
        if (fid === B.glass_broken && Math.random() < 0.15) this.survival.addWound('glass', Math.random() < 0.5 ? 'legL' : 'legR');
        if (fid === B.fire || fid === B.campfire) { if (Math.random() < 0.3) this.survival.addWound('burn', 'legL'); }
        this.audio.play('player_hurt', { volume: 0.6 });
      }
    }

    // combat + interaction + timed actions
    this.combat.update(dt, input);
    this.interact.update(dt, input);
    this.updateAction(dt);

    // time
    const dtH = dt / 60;
    this.time = this.computeTime(this.time.totalHours + dtH);
    p.daysSurvived = (this.time.totalHours - 8) / 24;
    if (this.time.hour === 6 && this.lastDayBanner !== this.time.day) {
      this.lastDayBanner = this.time.day;
      if (this.time.day > 1) this.ui.locationBanner?.('Day ' + this.time.day, 'You survived the night.');
    }

    // environment
    const ex = Math.floor(p.x), ey = Math.floor(p.y + p.eye), ez = Math.floor(p.z);
    const indoor = w.roofY(ex, ez) > ey && w.skyAt(ex, ey, ez) < 14;
    this.indoor = indoor;
    const raining = this.weatherSys.params.rain;
    this.weatherSys.update(dt, dtH, this.time.hourF, this.time.day);
    this.rainCollected = clamp(this.rainCollected + (raining > 0.3 ? dtH * 3 : -dtH * 0.2), 0, 18);
    this.weatherInfo = { type: this.weatherSys.type, label: this.weatherSys.label, temperature: this.weatherSys.temperature, wind: this.weatherSys.params.wind };
    this.sky.update(this.time.hourF, this.weatherSys.params, this.time.day, this.chunks.radius * 16);
    const nearFire = this.nearFire();
    const threat = this.zombies.threatLevel();
    this.threat = threat;
    for (const k of Object.keys(this.survival.bookBoost)) { this.survival.bookBoost[k] -= dtH; if (this.survival.bookBoost[k] <= 0) delete this.survival.bookBoost[k]; }
    this.survival.update({ dt, dtH, ambient: this.weatherSys.temperature, indoor, raining, nearFire, threat, sleeping: false, carryFactor: carry });

    // player light & stealth (for zombie senses)
    const skyL = w.skyAt(ex, Math.floor(p.y + 1), ez) / 15;
    const blkL = w.blockLightAt(ex, Math.floor(p.y + 1), ez) / 15;
    const bright = this.sky.state.brightness;
    this.playerLight = clamp(Math.max(skyL * skyL * bright, blkL * 0.8, p.flashlightOn ? 0.7 : 0, this.combat.lastShotT > this.clock - 0.5 ? 1 : 0), 0, 1);
    const bodyId = w.get(ex, Math.floor(p.y + 0.5), ez), headId = w.get(ex, Math.floor(p.y + 1.3), ez);
    this.playerHidden = (BLOCKS[bodyId].hides && (p.crouching || BLOCKS[headId].hides)) || this.combat.smokes.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < s.r);

    // flashlight battery
    if (p.flashlightOn) {
      const light = this.findLight();
      if (!light) { p.flashlightOn = false; this.ui.toast?.('Your light died.', 'warn'); }
      else {
        const def = getItemDef(light.id);
        light.uses = Math.max(0, (light.uses ?? 100) - (def.light.drain ?? 4) * dtH);
        if (light.uses <= 0) { p.flashlightOn = false; this.audio.play('flashlight_click'); this.ui.toast?.('The batteries are dead.', 'warn'); }
      }
    }

    // world systems
    this.zombies.update(dt);
    this.groundItems.update(dt);
    this.vehicles.update(dt);
    this.corpses.update(dt);
    this.events.update(dt, dtH);
    this.updateFires(dt, dtH);
    this.fx.update(dt, this.renderer.camera);
    this.cracks.update(dt);
    this.chunks.update(this.renderer.camera.position);

    // vehicles bumps -> alarms
    for (const c of this.vehicles.nearColliders(p.x, p.z, 3)) {
      const v = this.vehicles.list[this.vehicles.colliders.indexOf(c)];
      const lx = (p.x - c.x) * c.cos - (p.z - c.z) * c.sin, lz = (p.x - c.x) * c.sin + (p.z - c.z) * c.cos;
      if (Math.abs(lx) < c.hx + p.hw + 0.05 && Math.abs(lz) < c.hz + p.hw + 0.05 && p.sprinting && !v.bumped) { v.bumped = true; this.vehicles.onBump(v); }
    }

    // map exploration & location
    this.updateExploration(dt);
    this.updateLocation();

    // audio
    const cam = this.renderer.camera;
    const fwd = p.forward(new THREE.Vector3());
    this.audio.setListener({ x: cam.position.x, y: cam.position.y, z: cam.position.z }, { x: fwd.x, y: fwd.y, z: fwd.z });
    this.audio.setAmbience({
      rain: raining, wind: this.weatherSys.params.wind, storm: this.weatherSys.target.rain >= 1 ? raining : 0,
      night: this.time.isNight ? 1 : 0, indoor, underwater: p.inWater && w.get(ex, ey, ez) === B.water ? 1 : 0,
      heartbeat: clamp(Math.max((35 - p.health) / 35, (p.panic - 50) / 50), 0, 1), breathing: clamp((30 - p.stamina) / 30, 0, 1), tension: threat,
    });
    this.audio.setMusic(threat > 0.3 ? 'tense' : this.time.isNight ? 'night' : 'calm');
    this.audio.update(dt);

    // post effects from survival
    const E = this.survival.effects, post = this.renderer.post;
    post.uDamage.value = E.damage;
    post.uLowHealth.value = E.lowHealth;
    post.uWobble.value = E.wobble;
    post.uChroma.value = E.chroma;
    post.uSick.value = E.sick;
    post.uDesat.value = E.desat;
    post.uBlackout.value = Math.max(E.blackout, this.sleepFade || 0);
    post.uFlash.value = Math.max(0, post.uFlash.value - dt * 3) + globalUniforms.uLightning.value * (indoor ? 0.05 : 0.15);
    post.uExposure.value = lerp(post.uExposure.value, this.time.isNight ? 1.25 : 1.0, dt);
    post.uGrain.value = this.time.isNight ? 0.055 : 0.035;

    // autosave every 4 game hours
    this.autosaveT += dtH;
    if (this.autosaveT > 4) { this.autosaveT = 0; this.saveGame(); }

    // stats for UI
    p.weight = p.inv.totalWeight();
  }

  renderWorld(dt) {
    const p = this.player, r = this.renderer;
    if (this.state === 'playing') p.applyCamera(r.camera, dt, this.settings);
    r.camera.updateMatrixWorld();
    globalUniforms.uCamPos.value.copy(r.camera.position);
    // flashlight
    const light = p.flashlightOn ? this.findLight() : null;
    globalUniforms.uFlashOn.value = light ? 1 : 0;
    if (light) {
      const def = getItemDef(light.id).light || {};
      const fwd = r.camera.getWorldDirection(new THREE.Vector3());
      const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      globalUniforms.uFlashPos.value.copy(r.camera.position).addScaledVector(right, 0.15).addScaledVector(fwd, -0.1);
      globalUniforms.uFlashDir.value.copy(fwd);
      globalUniforms.uFlashRange.value = def.range || 26;
      const cone = def.cone || 0.42;
      if (def.omni) globalUniforms.uFlashCone.value.set(-1.01, -1.0);
      else globalUniforms.uFlashCone.value.set(Math.cos(cone), Math.cos(cone * 0.35));
      const batt = (light.uses ?? 100) / 100;
      const flick = def.fire ? 0.85 + Math.random() * 0.15 : batt < 0.15 ? 0.5 + Math.random() * 0.3 : 1;
      globalUniforms.uFlashIntensity.value = (def.omni ? 1.3 : 2.3) * flick;
    }
    // dynamic point lights
    const cam = r.camera.position;
    this.dynLights = this.dynLights.filter((l) => (l.t -= dt) > -dt - 0.001 || l.persist);
    const all = this.dynLights.slice();
    for (const L of this.fx?.getLights?.() || []) {
      all.push({ pos: new THREE.Vector3(L.x, L.y, L.z), color: new THREE.Color(L.r, L.g, L.b), intensity: L.intensity, radius: L.radius, t: 1, dur: 0 });
    }
    const lights = all.sort((a, b) => a.pos.distanceToSquared(cam) - b.pos.distanceToSquared(cam)).slice(0, MAX_POINT_LIGHTS);
    globalUniforms.uPLCount.value = lights.length;
    lights.forEach((l, i) => {
      globalUniforms.uPL.value[i].set(l.pos.x, l.pos.y, l.pos.z, l.radius);
      globalUniforms.uPLC.value[i].set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity * (l.dur > 0 ? clamp(l.t / l.dur, 0, 1) : 1));
    });
    this.dynLights = this.dynLights.filter((l) => l.t > 0 || l.persist);
    // viewmodel
    const vmLight = { sky: this.world.skyAt(Math.floor(p.x), Math.floor(p.y + 1.5), Math.floor(p.z)) / 15, block: this.world.blockLightAt(Math.floor(p.x), Math.floor(p.y + 1.5), Math.floor(p.z)) / 15 };
    this.viewmodel.update(dt, {
      moving01: p.moving01, sprinting: p.sprinting, aiming: p.aiming, crouching: p.crouching, grounded: p.onGround,
      lookDX: this.input.mouse.dx, lookDY: this.input.mouse.dy, light: vmLight, time: this.clock, camera: this.renderer.camera,
    });
    const showVM = this.state === 'playing' && !p.dead && !p.scopeActive;
    r.render(showVM ? (rr) => this.viewmodel.render(rr) : null, this.renderer.shadowsEnabled ? r.camera.position : null);
  }

  // ------------------------------------------------------------------ helpers used by systems
  noise(x, y, z, radius, type, byPlayer = false, extra = {}) {
    if (!this.zombies || radius <= 0) return;
    this.zombies.noise({ x, y, z, radius, type, player: byPlayer, ...extra });
  }

  addFlashLight(pos, color, intensity, radius, duration) {
    this.dynLights.push({ pos: pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z), color: new THREE.Color(color), intensity, radius, t: duration || 0.0001, dur: duration });
  }

  raycastVehicles(origin, dir, maxDist) { return this.vehicles.raycast(origin, dir, maxDist); }

  get vehicleColliders() { return this.vehicles?.colliders; }

  camShakeAt(pos, amt) {
    const p = this.player;
    const d = Math.hypot(pos.x - p.x, pos.y - p.y, pos.z - p.z);
    if (d < 12) p.shake = Math.max(p.shake, amt * (1 - d / 12));
  }

  canHit(z) {
    const p = this.player;
    const ax = z.x, ay = z.y + Math.min(1.4, z.h * 0.8), az = z.z, bx = p.x, by = p.y + 1.2, bz = p.z;
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz) || 1;
    return !raycast(this.world, ax, ay, az, dx / L, dy / L, dz / L, L, (id, d) => d.solid && d.render !== 'cross');
  }

  zombieHitsPlayer(z) {
    const p = this.player;
    if (p.dead || this.sleeping) return;
    const dmg = z.cfg.damage * (0.8 + Math.random() * 0.4) * (this.isNight ? 1.1 : 1);
    const res = this.survival.zombieHit(dmg, z.variant);
    const ang = Math.atan2(z.x - p.x, z.z - p.z);
    // relative to view: 0 = front
    const fwdAng = Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
    let rel = ang - fwdAng;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    this.ui.damageIndicator?.(-rel);
    p.addPunch(-0.08 - Math.random() * 0.05, (Math.random() - 0.5) * 0.12);
    p.shake = Math.max(p.shake, 0.4);
    if (res.wound?.type === 'bite') { this.audio.play('bite', { volume: 1 }); this.ui.toast?.('You\'ve been BITTEN!', 'danger'); }
    else if (res.blocked) { this.audio.play('player_hurt', { volume: 0.6 }); this.ui.toast?.('Your clothing absorbed the attack.', 'info'); }
    else { this.audio.play(dmg > 18 ? 'player_hurt_heavy' : 'player_hurt', { volume: 0.9 }); if (res.wound) this.ui.toast?.(`${res.wound.type === 'laceration' ? 'Laceration' : 'Scratched'} on the ${partName(res.part)}!`, 'danger'); }
    if (z.variant === 'brute') { p.vx += Math.sin(ang + Math.PI) * 6; p.vz += Math.cos(ang + Math.PI) * 6; p.vy = 4; }
    if (this.action && Math.random() < 0.5) this.cancelAction();
    this.combat.cancelReload();
  }

  onZombieKilled(z, o) { void z; void o; }

  /** Damage a block. Returns true if it broke. */
  damageBlock(x, y, z, dmg, o = {}) {
    const w = this.world;
    const id = w.get(x, y, z);
    const def = BLOCKS[id];
    const pos = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
    if (IS_DOOR[id]) {
      if (o.tool === 'bullet' && def.mat !== 'glass') dmg *= 0.3;
      const door = w.getDoor(x, y, z);
      const mult = o.tool === 'chop' || o.tool === 'heavy' ? 2.2 : o.tool === 'pry' ? 1.6 : 1;
      if (door.barricade > 0) { door.barricade -= dmg * mult; if (door.barricade <= 0) { door.barricade = 0; w.syncDoor(door); } return false; }
      door.hp -= dmg * mult;
      if (!o.byZombie) this.audio.play('door_bash', { pos, volume: 0.8 });
      if (door.hp <= 0) {
        this.audio.play('door_break', { pos });
        this.fx.blockBreak(pos, this.textures.avgColor(def.tex.side || 'planks_dark'));
        w.removeDoor(door);
        this.noise(x, y, z, 20, 'door_break', !o.byZombie);
        for (const [item, mn, mx, ch] of def.drops || []) if (Math.random() < ch) this.groundItems.add(createItem(item, { count: mn + Math.floor(Math.random() * (mx - mn + 1)) }), x + 0.5, y + 0.6, z + 0.5);
        return true;
      }
      return false;
    }
    if (!def.hp) return false;
    if (def.breakWith && !o.byZombie && o.tool !== 'bullet' && !def.breakWith.includes(o.tool) && def.mat !== 'glass') {
      if (!this._toolHintT || this.clock - this._toolHintT > 3) { this._toolHintT = this.clock; if (def.hp > 50) this.ui.toast?.(`You need a ${def.breakWith.includes('chop') ? 'axe' : def.breakWith.includes('dig') ? 'shovel' : 'sledgehammer'} to break that.`, 'info'); }
      return false;
    }
    if (o.tool === 'bullet' && def.mat !== 'glass') dmg *= 0.25;
    const idx = w.idx(x, y, z);
    const total = (this.blockDamage.get(idx) || 0) + dmg;
    if (total < def.hp) {
      this.blockDamage.set(idx, total);
      if (!o.byZombie) this.cracks?.show(x, y, z, total / def.hp);
      this.fx.dust?.(pos, this.textures.avgColor(faceTexture(def, 0, 0)).map((c) => c / 255));
      return false;
    }
    this.blockDamage.delete(idx);
    this.cracks?.hide();
    this.breakBlock(x, y, z, o);
    return true;
  }

  breakBlock(x, y, z, o = {}) {
    const w = this.world;
    const id = w.get(x, y, z);
    const def = BLOCKS[id];
    const pos = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
    if (def.mat === 'glass') {
      this.audio.play('glass_break', { pos, volume: 1 });
      this.fx.glass(pos);
      this.noise(pos.x, pos.y, pos.z, 22, 'glass', !o.byZombie);
    } else {
      this.audio.play('block_break', { pos, volume: 0.9 });
      this.fx.blockBreak(pos, this.textures.avgColor(faceTexture(def, 0, 0)));
      this.noise(pos.x, pos.y, pos.z, 8, 'break', !o.byZombie);
    }
    const cont = def.container ? w.getContainer(x, y, z) : null;
    if (cont && !cont.items) this.containerDesc(cont);
    w.setBlock(x, y, z, def.becomesId || 0, 0);
    if (def.container) {
      const c = cont;
      if (c?.items) for (const s of c.items) if (s) this.groundItems.add(s, x + 0.5, y + 0.3, z + 0.5);
      w.containers.delete(w.idx(x, y, z));
    }
    for (const [item, mn, mx, ch] of def.drops || []) if (Math.random() < ch) this.groundItems.add(createItem(item, { count: mn + Math.floor(Math.random() * (mx - mn + 1)) }), x + 0.5, y + 0.4, z + 0.5);
    // things standing on top fall (plants, corn top)
    const above = w.get(x, y + 1, z);
    if (BLOCKS[above].render === 'cross' || above === B.corn_top) w.setBlock(x, y + 1, z, 0);
  }

  startFire(pos, radius, duration) {
    const w = this.world;
    const cells = [];
    const cx = Math.floor(pos.x), cy = Math.floor(pos.y), cz = Math.floor(pos.z);
    for (let dx = -Math.ceil(radius); dx <= radius; dx++) for (let dz = -Math.ceil(radius); dz <= radius; dz++) {
      if (dx * dx + dz * dz > radius * radius) continue;
      for (let dy = 1; dy >= -2; dy--) {
        const x = cx + dx, y = cy + dy, z = cz + dz;
        const id = w.get(x, y, z), below = w.get(x, y - 1, z);
        if ((id === 0 || BLOCKS[id].render === 'cross') && BLOCKS[below].solid && BLOCKS[below].render !== 'cross' && Math.random() < 0.85) {
          cells.push([x, y, z]);
          break;
        }
      }
    }
    for (const [x, y, z] of cells) w.setBlock(x, y, z, B.fire);
    const snd = this.audio.loop('fire_loop', { pos, volume: 1 });
    this.fires.push({ cells, t: duration + Math.random() * 5, snd, pos: pos.clone() });
    for (const zb of this.zombies.near(pos.x, pos.y, pos.z, radius + 0.8)) zb.burning = 8;
    this.fx.fire?.(pos.clone(), { radius, duration });
  }

  updateFires(dt, dtH) {
    const w = this.world;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t -= dt;
      if (f.t <= 0) {
        for (const [x, y, z] of f.cells) if (w.get(x, y, z) === B.fire) w.setBlock(x, y, z, 0);
        f.snd?.stop();
        this.fires.splice(i, 1);
      }
    }
    for (const [k, c] of this.campfires) {
      c.fuel -= dtH;
      if (c.fuel <= 0) {
        if (w.get(c.x, c.y, c.z) === B.campfire) w.setBlock(c.x, c.y, c.z, B.campfire_out);
        this.campfires.delete(k);
      }
    }
  }

  explode(pos, radius, damage) {
    const p = this.player;
    this.audio.play('explosion', { pos, volume: 2, maxDist: 400 });
    this.fx.explosion(pos, radius);
    this.addFlashLight(pos, 0xffa050, 8, radius * 4, 0.35);
    this.renderer.post.uFlash.value = Math.max(this.renderer.post.uFlash.value, 0.6 * clamp(1 - pos.distanceTo(new THREE.Vector3(p.x, p.y, p.z)) / 40, 0, 1));
    this.noise(pos.x, pos.y, pos.z, 110, 'explosion', true);
    const W = this.world;
    for (const z of this.zombies.zombies) {
      if (z.dead) continue;
      const d = Math.hypot(z.x - pos.x, z.y + 1 - pos.y, z.z - pos.z);
      if (d > radius * 1.5) continue;
      let f = clamp(1 - d / (radius * 1.5), 0, 1);
      if (!lineOfSight(W, pos.x, pos.y + 0.3, pos.z, z.x, z.y + 1, z.z)) f *= 0.3;
      const dir = new THREE.Vector3(z.x - pos.x, 0.5, z.z - pos.z).normalize();
      if (f > 0.6 && Math.random() < 0.6) z.visual.dismember?.(Math.random() < 0.5 ? 'armL' : 'legR');
      z.takeDamage(damage * f, { part: 'torso', dir, knockback: 3 * f, knockdown: 1, force: 6 * f, gib: f > 0.75 });
      this.fx.blood(new THREE.Vector3(z.x, z.y + 1, z.z), dir, 2 * f);
    }
    const dp = Math.hypot(p.x - pos.x, p.y + 1 - pos.y, p.z - pos.z);
    if (dp < radius * 1.6) {
      let f = clamp(1 - dp / (radius * 1.6), 0, 1);
      if (!lineOfSight(W, pos.x, pos.y + 0.3, pos.z, p.x, p.y + 1.2, p.z)) f *= 0.3;
      this.survival.hurt(damage * 0.6 * f, 'Blown up');
      if (f > 0.4) this.survival.addWound(Math.random() < 0.5 ? 'burn' : 'deep', 'torso');
      p.vx += (p.x - pos.x) / (dp + 0.1) * 10 * f; p.vz += (p.z - pos.z) / (dp + 0.1) * 10 * f; p.vy += 5 * f;
    }
    if (dp < 25) { p.shake = Math.max(p.shake, 1.2 * (1 - dp / 25)); this.audio.setAmbience({ tinnitus: clamp(1 - dp / 18, 0, 1) }); setTimeout(() => this.audio.setAmbience({ tinnitus: 0 }), 4000); }
    // break glass & damage doors nearby
    const w = this.world;
    const r = Math.ceil(radius);
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dy * dy + dz * dz > radius * radius) continue;
      const x = Math.floor(pos.x) + dx, y = Math.floor(pos.y) + dy, z = Math.floor(pos.z) + dz;
      const id = w.get(x, y, z);
      if (!id) continue;
      const d = BLOCKS[id];
      if (d.mat === 'glass' || IS_DOOR[id] || id === B.barricade || (d.hp && d.hp < 80 && !(d.breakWith && d.breakWith.length === 1 && d.breakWith[0] === 'dig'))) this.damageBlock(x, y, z, 300, { tool: 'heavy', byZombie: true });
    }
    this.fx.bloodSplat?.(pos, new THREE.Vector3(0, 1, 0), 0); // scorch is handled by FX.explosion
  }

  nearFire() {
    const w = this.world, p = this.player;
    const x0 = Math.floor(p.x), y0 = Math.floor(p.y), z0 = Math.floor(p.z);
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = -1; dy <= 2; dy++) {
      const id = w.get(x0 + dx, y0 + dy, z0 + dz);
      if (id === B.campfire || id === B.barrel_burning || id === B.fire) return true;
    }
    return false;
  }

  findLight() {
    const p = this.player;
    const head = p.inv.getEquipped('head');
    if (head && getItemDef(head.id).light && (head.uses ?? 100) > 0) return head;
    const f = p.inv.find((s) => getItemDef(s.id).light && (s.uses ?? 100) > 0);
    return f[0]?.stack || null;
  }

  toggleFlashlight() {
    const p = this.player;
    if (!p.flashlightOn && !this.findLight()) { this.ui.toast?.('You have no working flashlight.', 'warn'); return; }
    p.flashlightOn = !p.flashlightOn;
    this.audio.play('flashlight_click', { volume: 0.7 });
  }

  // ------------------------------------------------------------------ timed actions
  startAction({ label, time, anim, sound, onDone, onCancel, stack }) {
    if (this.action) this.cancelAction();
    this.action = { label, time, t: 0, onDone, onCancel, stack: this.player.inv.selectedStack };
    this.actionBusy = true;
    if (anim) this.viewmodel.use?.(anim, time, stack || null);
    if (sound) this.actionSound = this.audio.play(sound, { volume: 0.7 });
  }
  updateAction(dt) {
    const a = this.action;
    if (!a) { if (!this.combat.reload) this.hud.progress = null; return; }
    a.t += dt;
    this.hud.progress = { label: a.label, t: clamp(a.t / a.time, 0, 1) };
    if (this.input.mousePressed(0) && !this.ui.isBlocking?.()) { this.cancelAction(); return; }
    if (a.t >= a.time) {
      this.action = null;
      this.actionBusy = false;
      this.hud.progress = null;
      try { a.onDone?.(); } catch (e) { console.error(e); }
      this.ui.refresh?.();
    }
  }
  cancelAction() {
    const a = this.action;
    if (!a) return;
    this.action = null;
    this.actionBusy = false;
    this.hud.progress = null;
    this.viewmodel.cancel?.();
    this.actionSound?.stop?.();
    a.onCancel?.();
  }

  // ------------------------------------------------------------------ sleeping
  trySleep() {
    const p = this.player;
    if (p.energy > 80) { this.ui.toast?.("You're not tired enough to sleep.", 'info'); return; }
    const near = this.zombies.near(p.x, p.y, p.z, 22).filter((z) => !z.dead);
    if (near.some((z) => z.state === 'chase' || z.state === 'attack' || Math.hypot(z.x - p.x, z.z - p.z) < 10)) { this.ui.toast?.("You can't sleep with zombies nearby!", 'danger'); return; }
    const hours = clamp(Math.round((100 - p.energy) / 12), 2, 9);
    this.ui.showDialog?.({
      title: 'Sleep', text: `Sleep for about ${hours} hours? Zombies may find you while you rest. Barricade first.`,
      buttons: [{ label: 'Sleep', run: () => this.sleep(hours) }, { label: 'Cancel', run: () => {} }],
    });
  }

  async sleep(hours) {
    const p = this.player;
    this.sleeping = true;
    this.state = 'sleeping';
    this.input.unlock();
    this.audio.play('sleep_start', { volume: 0.6 });
    for (let f = 0; f <= 1; f += 0.1) { this.sleepFade = f; this.renderWorld(0.016); await wait(40); }
    let woken = false;
    const steps = hours * 4;
    for (let i = 0; i < steps; i++) {
      const dtH = 0.25;
      this.time = this.computeTime(this.time.totalHours + dtH);
      this.weatherSys.update(15, dtH, this.time.hourF, this.time.day);
      this.survival.update({ dt: 15, dtH, ambient: this.weatherSys.temperature, indoor: this.indoor, raining: 0, nearFire: this.nearFire(), threat: 0, sleeping: true, carryFactor: 1 });
      this.updateFires(15, dtH);
      if (p.dead) break;
      // danger: zombies stumble upon your shelter
      const exposure = this.indoor ? 0.012 : 0.05;
      if (Math.random() < exposure * this.zombies.localDensity * 3) {
        woken = true;
        for (let k = 0; k < 2; k++) {
          const a = Math.random() * Math.PI * 2;
          const x = Math.floor(p.x + Math.cos(a) * 9), z = Math.floor(p.z + Math.sin(a) * 9);
          const y = groundAt(this.world, x, Math.floor(p.y) + 1, z);
          if (y > 0) { const zb = this.zombies.spawn(x + 0.5, y, z + 0.5); if (zb.investigate) zb.investigate({ x: p.x, y: p.y, z: p.z }, true); else { zb.target = { x: p.x, y: p.y, z: p.z }; zb.setState('investigate'); } }
        }
        break;
      }
      if (p.energy >= 99) break;
      if (i % 4 === 0) await wait(0);
    }
    for (let f = 1; f >= 0; f -= 0.1) { this.sleepFade = f; this.renderWorld(0.016); await wait(40); }
    this.sleepFade = 0;
    this.sleeping = false;
    if (p.dead) return;
    this.state = 'playing';
    this.last = performance.now();
    this.input.lock();
    if (woken) { this.ui.toast?.('You wake to noises outside...', 'danger'); this.audio.play('zombie_groan', { volume: 1 }); }
    else this.ui.toast?.(`You slept until ${String(this.time.hour).padStart(2, '0')}:${String(this.time.minute).padStart(2, '0')}.`, 'good');
    this.saveGame();
  }

  // ------------------------------------------------------------------ inventory glue for UI
  containerDesc(c) {
    if (!c.items) {
      const rng = makeRng(hash32(this.world.seed, c.x * 73856093 ^ c.y * 19349663 ^ c.z * 83492791, 99));
      c.items = new Array(c.size).fill(null);
      const stacks = generateLoot(c.loot, rng, { scavenging: this.player.skillLevel('scavenging'), day: this.time.day, size: c.size });
      let i = 0;
      for (const f of c.fixed || []) if (i < c.size) c.items[i++] = createItem(f.id, { count: f.count || 1, data: f.data });
      for (const s of stacks) { if (i >= c.size) break; c.items[i++] = s; }
      this.player.addXP('scavenging', 1);
    }
    const def = BLOCKS[this.world.get(c.x, c.y, c.z)];
    return { key: 'c:' + this.world.idx(c.x, c.y, c.z), name: c.name || nameForContainer(def), kind: 'world', slots: c.items, container: c };
  }

  openLoot(descs) {
    this.input.unlock();
    this.ui.openInventory?.([...descs, this.groundItems.floorDesc()]);
    this.audio.play('zipper', { volume: 0.5 });
  }

  getLootSources() {
    const p = this.player, w = this.world;
    const out = [];
    const t = this.interact.target;
    if (t?.kind === 'block' && t.def.container) {
      const c = w.getContainer(t.hit.x, t.hit.y, t.hit.z);
      if (c && !c.locked) out.push(this.containerDesc(c));
    }
    for (const z of this.zombies.corpses) {
      const pos = this.zombies.corpsePosition(z, new THREE.Vector3());
      if (pos.distanceTo(new THREE.Vector3(p.x, p.y, p.z)) < 2.4) { this.zombies.corpseLoot(z); out.push({ key: 'zc:' + z.id, name: 'Zombie', kind: 'corpse', slots: z.loot }); }
    }
    for (const c of this.corpses.near(p.x, p.y, p.z, 2.2)) out.push(this.corpses.desc(c));
    out.push(this.groundItems.floorDesc());
    return out;
  }

  getItemActions(desc, index) { return this.itemActions.getItemActions(desc, index); }
  useItem(desc, index) { this.itemActions.useItem(desc, index); this.ui.refresh?.(); }
  describeItem(stack) { return this.itemActions.describeItem(stack); }
  getTreatments(i) { return this.itemActions.getTreatments(i); }

  onItemMoved(src, si, dst, di) {
    void si; void di;
    if (dst?.kind === 'floor' || src?.kind === 'floor') this.audio.play(dst?.kind === 'floor' ? 'item_drop' : 'item_pickup', { volume: 0.5 });
    else if (dst?.kind === 'equipment' || src?.kind === 'equipment') this.audio.play('zipper', { volume: 0.5 });
    else this.audio.play('ui_click', { volume: 0.3 });
    this.afterInventoryChange();
  }

  dropItem(desc, index, count) {
    const s = desc.slots[index];
    if (!s) return;
    const p = this.player;
    const n = Math.min(count ?? (s.count || 1), s.count || 1);
    let drop = s;
    if (n < (s.count || 1)) { drop = { ...JSON.parse(JSON.stringify(s)), count: n }; s.count -= n; }
    else desc.slots[index] = null;
    const fwd = p.forward(new THREE.Vector3());
    const it = this.groundItems.add(drop, p.x + fwd.x * 0.6, p.y + 1.2, p.z + fwd.z * 0.6, { vy: 1.5 });
    void it;
    desc.onChange?.();
    this.audio.play('item_drop', { volume: 0.6 });
    this.afterInventoryChange();
  }

  afterInventoryChange(fromInv = false) {
    const p = this.player;
    if (!p) return;
    p.weight = p.inv.totalWeight();
    p.maxWeight = 20 + p.skillLevel('strength') * 1.6;
    p.inv.maxWeight = p.maxWeight;
    p.hasWatch = p.inv.has((s) => (getItemDef(s.id).tags || []).includes('watch'));
    p.hasCompass = p.inv.has((s) => (getItemDef(s.id).tags || []).includes('compass'));
    const jacket = p.inv.getEquipped('jacket') || p.inv.getEquipped('torso');
    const gloves = p.inv.getEquipped('hands');
    const col = (st) => (st ? getItemDef(st.id).icon?.color || '#556' : null);
    const key = (jacket?.id || '') + (gloves?.id || '');
    if (key !== this._armsKey) {
      this._armsKey = key;
      this.viewmodel.setArmsAppearance?.({ skin: '#c99a7a', sleeve: col(jacket) || '#c99a7a', glove: col(gloves) });
    }
    if (this.combat) this.combat.syncHeld();
    if (!fromInv) this.ui.refresh?.();
  }

  // ------------------------------------------------------------------ crafting glue
  craftCtx() {
    const p = this.player;
    const skills = {};
    for (const k of Object.keys(p.skills)) skills[k] = p.skills[k].level;
    const w = this.world;
    let nearWorkbench = false;
    const x0 = Math.floor(p.x), y0 = Math.floor(p.y), z0 = Math.floor(p.z);
    for (let dx = -3; dx <= 3 && !nearWorkbench; dx++) for (let dz = -3; dz <= 3 && !nearWorkbench; dz++) for (let dy = -1; dy <= 2; dy++) if (w.get(x0 + dx, y0 + dy, z0 + dz) === B.workbench) { nearWorkbench = true; break; }
    return { nearFire: this.nearFire(), nearWorkbench, skills, nowHours: this.time.totalHours };
  }
  getRecipes() {
    try { return getRecipeStatus(this.player.inv, this.craftCtx()); } catch (e) { console.error(e); return []; }
  }
  craft(recipeId) {
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return;
    const status = this.getRecipes().find((s) => s.recipe.id === recipeId);
    if (!status?.canCraft) { this.ui.toast?.('Missing ingredients or tools.', 'warn'); return; }
    this.startAction({
      label: 'Crafting ' + recipe.name, time: recipe.time || 3, anim: 'craft', sound: 'craft',
      onDone: () => {
        const res = craftRecipe(this.player.inv, recipe, this.craftCtx());
        if (!res.ok) { this.ui.toast?.(res.message || 'Crafting failed.', 'warn'); return; }
        for (const s of res.results || []) if (s.dropped) { delete s.dropped; this.groundItems.dropAt(s, this.player.x, this.player.y, this.player.z); }
        if (recipe.xp) this.player.addXP(recipe.xp.skill, recipe.xp.amount);
        this.ui.toast?.(res.message || 'Crafted ' + recipe.name, 'good');
        this.afterInventoryChange();
      },
    });
  }

  // ------------------------------------------------------------------ map
  getMapCanvas() {
    if (this.mapCanvas) return this.mapCanvas;
    const w = this.world;
    const c = document.createElement('canvas');
    c.width = w.SX; c.height = w.SZ;
    const g = c.getContext('2d');
    const img = g.createImageData(w.SX, w.SZ);
    const colors = BLOCKS.map((d) => {
      if (d.render === 'none') return [0, 0, 0];
      if (d.render === 'liquid') return [52, 84, 110];
      const t = faceTexture(d, 2, 0);
      return this.textures.avgColor(t);
    });
    for (let z = 0; z < w.SZ; z++) for (let x = 0; x < w.SX; x++) {
      let y = w.height[z * w.SX + x];
      let id = w.get(x, y, z);
      // skip thin decorations
      while (y > 0 && (BLOCKS[id].render === 'cross' || id === B.sign_letter)) { y--; id = w.get(x, y, z); }
      const col = colors[id];
      const hN = w.height[Math.max(0, z - 1) * w.SX + x], hW = w.height[z * w.SX + Math.max(0, x - 1)];
      const shade = clamp(1 + (y - hN) * 0.06 + (y - hW) * 0.06 + (y - 20) * 0.01, 0.6, 1.35);
      const o = (z * w.SX + x) * 4;
      img.data[o] = clamp(col[0] * shade, 0, 255);
      img.data[o + 1] = clamp(col[1] * shade, 0, 255);
      img.data[o + 2] = clamp(col[2] * shade, 0, 255);
      img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.mapCanvas = c;
    return c;
  }

  getPOIs() {
    return this.world.pois.map((p) => ({ name: p.name, type: p.type, x: (p.x0 + p.x1) / 2, z: (p.z0 + p.z1) / 2, discovered: this.discovered.has(p.name) || this.mapRevealed }));
  }

  updateExploration(dt) {
    this.exploreT = (this.exploreT || 0) - dt;
    if (this.exploreT > 0) return;
    this.exploreT = 0.5;
    const p = this.player;
    const cx = Math.floor(p.x / 8), cz = Math.floor(p.z / 8);
    const R = 7;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dz * dz > R * R) continue;
      const x = cx + dx, z = cz + dz;
      if (x >= 0 && z >= 0 && x < 128 && z < 128) this.mapExplored[z * 128 + x] = 1;
    }
  }

  updateLocation() {
    const p = this.player, w = this.world;
    let best = null, area = Infinity;
    for (const poi of w.pois) {
      if (p.x >= poi.x0 && p.x <= poi.x1 && p.z >= poi.z0 && p.z <= poi.z1) {
        const a = (poi.x1 - poi.x0) * (poi.z1 - poi.z0);
        if (a < area) { area = a; best = poi; }
      }
    }
    const zone = ZONE_NAMES[w.getZone(p.x, p.z)] || 'WILD';
    this.location = { name: best ? best.name : zoneLabel(zone), zone: zone.toLowerCase() };
    if (best && best !== this.lastPOI) {
      const first = !this.discovered.has(best.name);
      if (first) {
        this.discovered.add(best.name);
        p.addXP('scavenging', 2);
      }
      // don't spam banners when walking along POI borders
      this.bannerT = this.bannerT || new Map();
      const last = this.bannerT.get(best.name) ?? -1e9;
      if (first || this.clock - last > 90) {
        this.bannerT.set(best.name, this.clock);
        this.ui.locationBanner?.(best.name, POI_SUBTITLES[best.type] || '');
      }
    }
    this.lastPOI = best;
  }

  // ------------------------------------------------------------------ death
  onPlayerDeath(cause) {
    const p = this.player;
    this.state = 'dead';
    this.cancelAction();
    this.input.unlock();
    this.audio.play('player_death', { volume: 1 });
    this.audio.setMusic('none');
    SaveManager.clear();
    const skills = {};
    for (const k of Object.keys(p.skills)) skills[k] = p.skills[k].level;
    setTimeout(() => this.ui.showDeath?.({
      name: p.name, profession: p.professionName, daysSurvived: p.daysSurvived, kills: p.kills, cause, skills, headshots: p.headshots,
    }), 1200);
  }
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function partName(p) { return { head: 'head', torso: 'torso', armL: 'left arm', armR: 'right arm', legL: 'left leg', legR: 'right leg' }[p] || p; }
function zoneLabel(z) {
  return {
    WILD: 'Wilderness', FOREST: 'Woods', FARM: 'Farmland', SUBURB: 'Residential Area', DOWNTOWN: 'Downtown Millbrook', COMMERCIAL: 'Commercial District',
    INDUSTRIAL: 'Industrial Area', HIGHWAY: 'Interstate 65', MILITARY: 'Military Zone', HOSPITAL: 'Hospital Grounds', POLICE: 'Police Station', PARK: 'Park',
    WATER: 'River', CAMP: 'Campground', TRAILER: 'Trailer Park', SCHOOL: 'School Grounds', ROAD: 'County Road', CEMETERY: 'Cemetery', GAS: 'Gas Station',
  }[z] || 'Millbrook County';
}
function nameForContainer(def) {
  return {
    fridge: 'Fridge', freezer: 'Freezer', stove: 'Oven', kitchen_cabinet: 'Kitchen Cabinet', kitchen_sink: 'Under the Sink', couch: 'Couch Cushions', couch_blue: 'Couch Cushions',
    wardrobe: 'Wardrobe', dresser: 'Dresser', bookshelf: 'Bookshelf', desk: 'Desk', medicine_cabinet: 'Medicine Cabinet', washing_machine: 'Washing Machine',
    workbench: 'Workbench', metal_shelf: 'Shelves', toolbox: 'Toolbox', gun_cabinet: 'Gun Cabinet', safe: 'Safe', store_shelf: 'Shelf', store_shelf_misc: 'Shelf',
    store_shelf_meds: 'Pharmacy Shelf', store_shelf_empty: 'Looted Shelf', cooler: 'Cooler', checkout: 'Checkout', clothing_rack: 'Clothing Rack',
    filing_cabinet: 'Filing Cabinet', locker: 'Locker', medical_cabinet: 'Medical Cabinet', crate_wood: 'Crate', crate_military: 'Military Crate',
    cardboard_box: 'Cardboard Box', bar_counter: 'Bar', floorboard_loose: 'Loose Floorboard', hollow_log: 'Hollow Log', mailbox: 'Mailbox', trash_can: 'Trash Can',
    dumpster: 'Dumpster', vending_machine: 'Vending Machine', barrel_rust: 'Barrel', trash_bags: 'Trash Bags',
  }[def.name] || 'Container';
}
export { ZONES };
