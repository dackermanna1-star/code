// Run: one life of the roguelite. Wires the player, inventory, wands, projectiles, pickups, enemies,
// holy mountains, HUD and audio onto the engine (Game).
import * as THREE from 'three';
import { DT, SURFACE_Y } from '../config';
import { Rng, FastRng } from '../core/rng';
import { Game } from './game';
import { Inventory, makePotion, potionTakeOne, potionTotal, potionAdd, potionMain, canStore, POTION_CAPACITY, Potion } from './inventory';
import { DamageSystem } from '../entities/damage';
import { ProjectileSystem, registerProjectiles } from '../entities/projectiles';
import { PickupSystem, Pickup } from '../entities/pickups';
import { PROJECTILES } from '../magic/projectileDefs';
import { SPELLS } from '../magic/spells';
import { Wand } from '../magic/casting';
import { generateWand, starterWand, starterBombWand, randomSpell } from '../magic/wandGen';
import type { SpellInstance } from '../magic/types';
import { ViewModel } from '../render/viewmodel';
import { setCreatureUniforms } from '../render/enemyModels';
import { createMeshMaterial } from '../render/voxelMaterial';
import { Hud, HudState } from '../ui/hud';
import { InventoryUI } from '../ui/inventoryUI';
import { InspectPanel } from '../ui/inspect';
import { audio } from '../audio/audio';
import type { SoundName } from '../audio/audio';
import { MATERIALS, matId, KIND, Kind, GOLDORE, GOLDSAND, AIR, UNLOADED, WATER } from '../world/materials';
import { RAY_SOLID, RAY_LIQUID } from '../world/world';
import { Spawn } from '../world/generator';
import { biomeAt, hmBandOf, BIOMES } from '../world/biomes';
import { unpackCell } from '../sim/simulation';
import { Creature } from '../entities/creature';
import { depenetrate } from '../entities/physics';
import { EnemySystem } from '../entities/enemies';
import { Progression } from './progression';

registerProjectiles(PROJECTILES);

interface TimedLight {
  x: number; y: number; z: number; c: [number, number, number]; r: number; i: number; t: number; life: number;
}

interface Thrown {
  potion: Potion;
  x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; mesh: THREE.Object3D;
}

const STARTER_POTIONS: [string, number][] = [['water', 45], ['oil', 14], ['blood', 8], ['whiskey', 10], ['slime', 7], ['toxic', 7], ['teleportatium', 4], ['polymorphine', 2], ['mana', 3]];

const HINT_STORE = 'noita3d.hints';
/** Tutorial hints already seen (persisted so a new run does not repeat them). */
function loadHints(): Set<string> {
  try {
    const raw = localStorage.getItem(HINT_STORE);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* storage unavailable */
  }
  return new Set();
}

export class Run {
  readonly game: Game;
  readonly inv = new Inventory();
  readonly damage: DamageSystem;
  readonly projectiles: ProjectileSystem;
  readonly pickups: PickupSystem;
  readonly enemies: EnemySystem;
  readonly progression: Progression;
  readonly viewmodel: ViewModel;
  readonly hud: Hud;
  readonly invUI: InventoryUI;
  readonly inspect: InspectPanel;
  private hintEl: HTMLDivElement;
  private hintsShown = loadHints();
  private hintT = 0;
  readonly rng = new FastRng(Date.now() >>> 0);
  private timedLights: TimedLight[] = [];
  private thrown: Thrown[] = [];
  private castRng: () => number;
  private muzzle = new THREE.Vector3();
  private aimPoint = new THREE.Vector3();
  private lastBiome = '';
  goldDust = 0;
  orbs = 0;
  kills = 0;
  startTime = 0;
  prompt = '';
  private promptTarget: Pickup | null = null;
  onDeath: (() => void) | null = null;
  onWin: (() => void) | null = null;
  firstRun = true;
  private breathT = 1;
  private pourAcc = 0;
  private lastLookDX = 0;
  private lastLookDY = 0;
  tutorialShown = false;

  constructor(game: Game, ui: HTMLElement, firstRun = true) {
    this.game = game;
    this.firstRun = firstRun;
    const g = game;
    const seedRng = new Rng(g.opts.seed ^ 0x5a5a);
    this.castRng = () => this.rng.f();
    this.damage = new DamageSystem(g.world, g.sim);
    this.damage.creatures.push(g.player);
    this.projectiles = new ProjectileSystem(g.world, g.sim, g.destruction, this.damage, g.particles, g.uniforms.uPointScale);
    g.scene.add(this.projectiles.glowPoints, this.projectiles.solidPoints);
    setCreatureUniforms(g.uniforms);
    this.pickups = new PickupSystem(g.world, { lit: createMeshMaterial(g.uniforms), glow: createMeshMaterial(g.uniforms, true) });
    g.scene.add(this.pickups.group);
    this.enemies = new EnemySystem(this);
    g.scene.add(this.enemies.group);
    this.progression = new Progression(this);
    this.viewmodel = new ViewModel(g.camera.fov);
    this.hud = new Hud(ui);
    this.inspect = new InspectPanel(this.hud.root);
    this.hintEl = document.createElement('div');
    this.hintEl.className = 'hint noita-panel';
    this.hintEl.style.display = 'none';
    this.hud.root.appendChild(this.hintEl);
    this.invUI = new InventoryUI(ui, this.inv, {
      canEdit: () => this.progression.canEditWands(),
      dropWand: (w) => this.dropWand(w),
      dropSpell: (s) => this.dropSpell(s),
      dropItem: (i) => this.dropItem(i),
      changed: () => {},
      sound: (n) => this.sound(n as SoundName),
    });

    // ---- hooks
    this.damage.hooks.bleed = (m, x, y, z, vx, vy, vz) => g.particles.launch(m, 0, x, y, z, vx, vy, vz);
    this.damage.hooks.text = (x, y, z, t, c) => this.hud.floatText(x, y, z, t, c);
    this.damage.hooks.hurt = (ev, dealt) => {
      if (ev.target === g.player) {
        if (dealt > 0.3) this.sound('player_hurt', undefined, Math.min(1, 0.4 + dealt / 20));
        g.shake = Math.max(g.shake, Math.min(3, dealt / 6));
      } else if (dealt > 0.5) this.sound('enemy_hurt', ev.target, 0.6);
    };
    this.damage.hooks.death = (c, ev) => {
      if (c === g.player) this.playerDied(ev.type);
      else this.enemies.onDeath(c, ev);
    };
    this.damage.hooks.preventDeath = (c, _ev, hpBefore) => {
      if (c === g.player && this.progression.hasPerk('SAVING_GRACE') && hpBefore > 1) {
        c.hp = 1;
        this.hud.log('Saving Grace!', '#ffe080');
        return true;
      }
      return false;
    };
    this.projectiles.ownerMods = (o) => (o === g.player ? this.progression.projectileMods() : null);
    this.damage.hooks.teleport = (c) => {
      const t = this.damage.randomTeleportTarget(c, 30);
      if (t) this.teleport(c, t[0], t[1], t[2]);
    };
    this.projectiles.events = {
      sound: (n, x, y, z, v) => audio.play(n as SoundName, { x, y, z, volume: v }),
      explosionFx: (x, y, z, r, fire) => this.explosionFx(x, y, z, r, fire),
      teleport: (c, x, y, z) => this.teleport(c, x, y, z),
      lightning: (ax, ay, az, bx, by, bz) => this.lightningFx(ax, ay, az, bx, by, bz),
      electrocute: (cells, src, dmg) => this.electrocute(cells, src, dmg),
    };
    g.sim.events.explosion = (x, y, z, r) => {
      g.destruction.explode(x, y, z, { radius: r, durability: 9, rayEnergy: 140 * r, fire: true });
      this.damage.explosion(x, y, z, r, 12, null, { fire: true, trick: true });
      this.explosionFx(x, y, z, r, true);
    };
    g.sim.events.ignite = (x, y, z) => {
      if (this.rng.f() < 0.05) audio.play('fire_ignite', { x, y, z, volume: 0.4 });
    };
    const prevReaction = g.sim.events.reaction;
    g.sim.events.reaction = (x, y, z, type) => {
      prevReaction?.(x, y, z, type);
      if (this.rng.f() < 0.03) audio.play(type === 'corrode' ? 'acid_sizzle' : type === 'freeze' ? 'freeze' : 'steam_hiss', { x, y, z, volume: 0.35 });
    };
    g.destruction.cb.destroyed = (m, x, y, z) => {
      if (m === GOLDORE || m === GOLDSAND) {
        this.goldDust++;
        if (this.goldDust >= 3) {
          this.goldDust = 0;
          this.pickups.add('gold', x + 0.5, y + 0.5, z + 0.5, { gold: 10 });
        }
      }
      if (MATERIALS[m]?.holy) this.progression.holyBrickDamaged(x, y, z);
    };
    g.spawnHandlers.push((s) => this.handleSpawn(s));
    g.renderHooks.push((r) => {
      this.viewmodel.resize(g.camera.aspect, g.camera.fov);
      r.clearDepth();
      r.render(this.viewmodel.scene, this.viewmodel.camera);
    });
    g.tickHooks.push((dt) => this.tick(dt));
    g.frameHooks.push((dt) => this.frame(dt));
    g.moveEvents = {
      footstep: () => audio.play('footstep', { volume: 0.25 }),
      jump: () => audio.play('jump', { volume: 0.35 }),
      land: (v) => audio.play('land', { volume: Math.min(0.8, v / 80) }),
    };

    // ---- starting loadout (Noita: starter wand, bomb wand, a flask)
    const sr = () => seedRng.next();
    const w1 = starterWand(sr);
    const w2 = starterBombWand(sr, firstRun);
    this.inv.wands[0] = new Wand(w1.stats, w1.spells, w1.alwaysCast);
    this.inv.wands[1] = new Wand(w2.stats, w2.spells, w2.alwaysCast);
    const pm = seedRng.weighted(STARTER_POTIONS, (p) => p[1])[0];
    this.inv.items[0] = makePotion(matId(pm));
    this.startTime = performance.now();
  }

  /** One-time contextual tutorial hints. */
  hint(id: string, text: string): void {
    if (this.hintsShown.has(id)) return;
    this.hintsShown.add(id);
    try {
      localStorage.setItem(HINT_STORE, JSON.stringify([...this.hintsShown]));
    } catch {
      /* storage unavailable */
    }
    this.hintEl.textContent = text;
    this.hintEl.style.display = '';
    this.hintT = 7;
  }

  // ------------------------------------------------------------------ helpers
  sound(name: SoundName, at?: { cx: number; cy: number; cz: number } | Creature, volume = 1): void {
    if (at) audio.play(name, { x: at.cx, y: at.cy, z: at.cz, volume });
    else audio.play(name, { volume });
  }

  addTimedLight(x: number, y: number, z: number, c: [number, number, number], r: number, i: number, life: number): void {
    if (this.timedLights.length > 30) this.timedLights.shift();
    this.timedLights.push({ x, y, z, c, r, i, t: 0, life });
  }

  explosionFx(x: number, y: number, z: number, r: number, fire: boolean): void {
    const g = this.game;
    // blast impulse flings loose items (gold nuggets, flasks, wands, chests)
    for (const pk of this.pickups.list) {
      if (pk.floating) continue;
      const dx = pk.body.x - x, dy = pk.body.y - y, dz = pk.body.z - z;
      const d = Math.hypot(dx, dy, dz);
      if (d > r * 2 || d < 0.01) continue;
      const f = (1 - d / (r * 2)) * 40;
      pk.body.vx += (dx / d) * f;
      pk.body.vy += Math.max(0.4, dy / d) * f;
      pk.body.vz += (dz / d) * f;
    }
    const d = Math.hypot(x - g.player.cx, y - g.player.cy, z - g.player.cz);
    g.shake = Math.max(g.shake, Math.min(4, (r * 2.5) / (1 + d * 0.15)));
    g.flash = Math.max(g.flash, Math.min(0.5, r / (8 + d * 0.5)));
    this.addTimedLight(x, y, z, fire ? [1, 0.6, 0.25] : [1, 0.85, 0.6], r * 4 + 12, 2.2, 0.35);
    const n = Math.min(120, 12 + r * 6);
    for (let i = 0; i < n; i++) {
      const a = this.rng.f() * Math.PI * 2, u = this.rng.f() * 2 - 1, s = Math.sqrt(1 - u * u);
      const sp = (0.4 + this.rng.f()) * r * 4;
      const hot = this.rng.f() < 0.6;
      g.particles.spawn(x, y, z, s * Math.cos(a) * sp, u * sp, s * Math.sin(a) * sp, hot ? [1, 0.7 + this.rng.f() * 0.3, 0.3] : [0.35, 0.33, 0.32], 0.3 + this.rng.f() * 0.5, 0.6, hot ? 0.2 : 0.6, hot, 3);
    }
  }

  lightningFx(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const g = this.game;
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const n = Math.min(200, Math.ceil(len * 1.5));
    let ox = 0, oy = 0, oz = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      ox += (this.rng.f() - 0.5) * 0.8; oy += (this.rng.f() - 0.5) * 0.8; oz += (this.rng.f() - 0.5) * 0.8;
      ox *= 0.9; oy *= 0.9; oz *= 0.9;
      g.particles.spawn(ax + (bx - ax) * t + ox, ay + (by - ay) * t + oy, az + (bz - az) * t + oz, 0, 0, 0, [0.75, 0.85, 1], 0.18, 0.5, 0, true, 0);
    }
    this.addTimedLight(bx, by, bz, [0.6, 0.75, 1], 50, 2.5, 0.2);
    g.flash = Math.max(g.flash, 0.35);
  }

  electrocute(cells: number[], src: Creature | null, dmg: number): void {
    const g = this.game;
    const set = new Set(cells);
    for (const c of this.damage.creatures) {
      if (!c.alive) continue;
      const b = c.body;
      let touch = false;
      for (let y = Math.floor(b.y); y <= Math.floor(b.y + b.h) && !touch; y++)
        for (let z = Math.floor(b.z - b.hw); z <= Math.floor(b.z + b.hw) && !touch; z++)
          for (let x = Math.floor(b.x - b.hw); x <= Math.floor(b.x + b.hw); x++) {
            if (set.has((y * 256 + z) * 256 + x)) {
              touch = true;
              break;
            }
          }
      if (touch) {
        const wetMult = c.status.wet > 0.05 ? 1.5 : 1;
        this.damage.apply({ target: c, amount: dmg * wetMult, type: 'electric', source: src, x: c.cx, y: c.cy, z: c.cz, trick: src !== c });
        c.status.stunned = Math.max(c.status.stunned, 0.5);
      }
    }
    // sparks on a sample of the electrified voxels
    for (let i = 0; i < Math.min(60, cells.length); i++) {
      const [x, y, z] = unpackCell(cells[Math.floor(this.rng.f() * cells.length)]);
      g.particles.spawn(x + 0.5, y + 1, z + 0.5, (this.rng.f() - 0.5) * 6, this.rng.f() * 6, (this.rng.f() - 0.5) * 6, [0.7, 0.85, 1], 0.25, 0.4, 0, true, 2);
    }
    audio.play('electric_zap', { volume: 0.7 });
  }

  teleport(c: Creature, x: number, y: number, z: number): void {
    const g = this.game;
    for (let i = 0; i < 30; i++) g.particles.spawn(c.cx, c.cy, c.cz, (this.rng.f() - 0.5) * 12, (this.rng.f() - 0.5) * 12, (this.rng.f() - 0.5) * 12, [0.7, 0.5, 1], 0.5, 0.4, 0, true, 2);
    c.body.x = x;
    c.body.y = y;
    c.body.z = z;
    c.body.vx = c.body.vy = c.body.vz = 0;
    depenetrate(g.world, c.body);
    if (c === g.player) g.player.eyeY = c.body.y + g.player.eyeHeight();
    audio.play('teleport', { x, y, z, volume: 0.8 });
  }

  // ------------------------------------------------------------------ spawns from the generator
  handleSpawn(s: Spawn): void {
    const r = new Rng(s.seed);
    const rnd = () => r.next();
    const tier = Math.max(1, Math.min(6, Math.round((s.data?.tier as number) ?? 1)));
    switch (s.kind) {
      case 'enemy':
        this.enemies.spawn(s.data!.type as string, s.x, s.y, s.z, (s.data?.depth as number) ?? 0, r);
        break;
      case 'barrel':
        this.enemies.spawn(r.chance(0.6) ? 'barrel_oil' : 'barrel_propane', s.x, s.y, s.z, 0, r);
        break;
      case 'wand': {
        const gw = generateWand(rnd, tier);
        this.pickups.add('wand', s.x, s.y, s.z, { wand: new Wand(gw.stats, gw.spells, gw.alwaysCast) });
        break;
      }
      case 'spell': {
        const id = randomSpell(rnd, Math.max(0, tier - 1 + (r.chance(0.15) ? 1 : 0)));
        this.pickups.add('spell', s.x, s.y + 1.2, s.z, { spell: { id, uses: SPELLS[id].maxUses }, baseY: s.y + 1.2 });
        break;
      }
      case 'potion':
        this.pickups.add('potion', s.x, s.y, s.z, { potion: this.randomPotion(r, tier) });
        break;
      case 'gold': {
        const n = r.int(1, 3);
        for (let i = 0; i < n; i++) this.pickups.add('gold', s.x + r.range(-1, 1), s.y + 0.5, s.z + r.range(-1, 1), { gold: 10, life: -1 });
        break;
      }
      case 'chest':
        this.pickups.add('chest', s.x, s.y, s.z, { gold: r.int(1, 1 << 30), tier });
        break;
      case 'heart':
        this.pickups.add('heart', s.x, s.y + 1.4, s.z, { baseY: s.y + 1.4 });
        break;
      case 'tutorial':
        this.progression.addTutorialStone(s.x, s.y, s.z);
        break;
      default:
        this.progression.handleSpawn(s, r);
        break;
    }
  }

  randomPotion(r: Rng, tier: number): Potion {
    const pool: [string, number][] = [
      ['water', 30], ['oil', 14], ['blood', 6], ['whiskey', 8], ['toxic', 8], ['acid', 4 + tier], ['slime', 6], ['lava', 1 + tier * 0.5],
      ['healthium', 2], ['mana', 3], ['teleportatium', 3], ['polymorphine', 2], ['berserkium', 2],
    ];
    const m = r.weighted(pool, (p) => p[1])[0];
    return makePotion(matId(m), r.chance(0.2) ? r.int(300, 900) : POTION_CAPACITY);
  }

  // ------------------------------------------------------------------ per-frame input & presentation
  frame(dt: number): void {
    const g = this.game;
    const input = g.input;
    const p = g.player;
    // inventory toggle (pauses the game, like Noita)
    if (input.hit('inventory') && (g.state === 'playing' || (g.state === 'paused' && this.invUI.open))) {
      this.invUI.toggle();
      g.state = this.invUI.open ? 'paused' : 'playing';
      if (this.invUI.open) input.exitLock();
      else input.requestLock();
      audio.play('ui_open', { volume: 0.5 });
    }
    if (g.state === 'playing') {
      for (let i = 0; i < 8; i++) if (input.hit(`slot${i + 1}` as 'slot1')) this.select(i);
      if (input.wheel) this.inv.cycle(input.wheel > 0 ? 1 : -1);
      if (input.hit('interact')) this.interact();
      if (input.hit('kick')) this.kick();
      const item = this.inv.activeItem();
      if (item && input.hit('drink')) this.drink(item);
      if (item && input.mouseClicked(2)) this.throwPotion();
    }
    // view model
    const w = this.inv.activeWand();
    const it = this.inv.activeItem();
    if (w) this.viewmodel.setWand(w.stats);
    else if (it) {
      const m = potionMain(it);
      this.viewmodel.setPotion(m !== null ? MATERIALS[m].colors[0] : null, potionTotal(it) / it.capacity);
    } else this.viewmodel.setEmpty();
    const amb = g.uniforms.uAmbient.value.clone().multiplyScalar(1.6).addScalar(0.25);
    this.lastLookDX = input.mouseDX;
    this.lastLookDY = input.mouseDY;
    this.viewmodel.update(dt, Math.hypot(p.body.vx, p.body.vz), p.body.onGround, this.lastLookDX, this.lastLookDY, amb, this.hud.hurtAmount());
    // lights from projectiles and timed effects
    const add = (x: number, y: number, z: number, c: [number, number, number], r: number, i: number) => g.lights.add(x, y, z, c, r, i);
    this.projectiles.sync(add);
    for (const l of this.timedLights) {
      l.t += dt;
      const f = 1 - l.t / l.life;
      if (f > 0) g.lights.add(l.x, l.y, l.z, l.c, l.r, l.i * f);
    }
    this.timedLights = this.timedLights.filter((l) => l.t < l.life);
    this.enemies.frame(dt);
    this.progression.frame(dt);
    // biome title on entering a new region
    const b = biomeAt(p.body.y);
    const hm = hmBandOf(p.body.y);
    const key = hm >= 0 ? `hm${hm}` : b?.id ?? 'surface';
    if (key !== this.lastBiome) {
      if (this.lastBiome !== '') {
        if (hm >= 0) this.hud.title('Holy Mountain', hm === BIOMES.length - 1 ? 'The Work' : 'Pyhä vuori');
        else if (b) this.hud.title(b.display, b.name);
      }
      this.lastBiome = key;
      audio.setAmbience(hm >= 0 ? 'holymountain' : b?.id ?? 'surface');
    }
    // HUD
    const hs: HudState = {
      hp: p.hp, maxHp: p.maxHp, lev: p.levitation, levMax: p.levitationMax,
      mana: w ? w.mana : 0, manaMax: w ? w.stats.manaMax : 0,
      reload: w && w.reloadTimer > 0 ? w.reloadTimer / Math.max(1, w.currentReloadTime || w.stats.rechargeTime) : 0,
      delay: w && w.castDelayTimer > 0 ? Math.min(1, w.castDelayTimer / Math.max(1, w.stats.castDelay + 10)) : 0,
      gold: p.gold, orbs: this.orbs, status: p.status, breath: this.breathT, prompt: this.prompt, canEdit: this.progression.canEditWands(),
    };
    this.hud.darkness = THREE.MathUtils.clamp((1930 - p.body.y) / 40, 0.15, 0.65) * (hmBandOf(p.body.y) >= 0 ? 0.5 : 1);
    this.hud.update(dt, hs, this.inv, g.camera);
    this.inspect.update(this.promptTarget, this.inv.wands[this.inv.selected < 4 ? this.inv.selected : 0]);
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hintEl.style.display = 'none';
    }
    // contextual tutorial
    if (g.time > 1.5) this.hint('move', `${g.input.key('forward')}${g.input.key('left')}${g.input.key('back')}${g.input.key('right')} to move, mouse to look, ${g.input.key('jump')} to jump. The way down is through the mountain.`);
    if (g.time > 4) this.hint('cast', 'Left mouse casts your wand. Wands hold spells: cast delay, recharge and mana decide how they fire.');
    if (g.time > 14 && hm < 0) this.hint('levitate', 'Hold Space in the air to levitate. The orange bar refills when you stand on the ground.');
    if (g.time > 40 && hm < 0 && p.body.y < SURFACE_Y - 40) this.hint('experiment', 'Everything down here is simulated material. Mix liquids, set things alight, dig, and watch what happens.');
    if (this.inv.activeItem()) this.hint('flask', 'Flasks hold real liquid: left mouse pours, right mouse throws, R drinks, hold E on a pool to fill.');
    if (this.progression.canEditWands() && hm >= 0) this.hint('hm', `A Holy Mountain. Press ${g.input.key('inventory')} to rearrange the spells in your wands — this is the only place you can. Spells cast left to right; modifiers change the spells after them.`);
    audio.setListener(g.camera.position.x, g.camera.position.y, g.camera.position.z, p.yaw, p.pitch);
    audio.setLoop('levitate', p.levitating ? 0.5 : 0);
    // ambient loops driven by the simulation: nearby fires crackle, moving liquids gurgle
    let fire = 0, fx = 0, fy = 0, fz = 0;
    for (const e of g.chunks.emitters.values()) {
      if (e.r < 0.8 || e.b > 0.5) continue; // orange/red emitters only (fire, lava, burning)
      const d = Math.hypot(e.x - p.body.x, e.y - p.body.y, e.z - p.body.z);
      if (d > 60) continue;
      const w = Math.sqrt(e.strength) / (1 + d * 0.08);
      if (w > fire) {
        fx = e.x; fy = e.y; fz = e.z;
      }
      fire += w;
    }
    audio.setLoop('fire', Math.min(1, fire * 0.25), fx, fy, fz);
    audio.setLoop('liquid', Math.min(0.8, g.sim.stats.cellsMoved / 2500));
    audio.update(dt);
  }

  select(i: number): void {
    if (i < 4 && !this.inv.wands[i]) return;
    if (i >= 4 && !this.inv.items[i - 4]) return;
    if (this.inv.selected !== i) audio.play('ui_click', { volume: 0.3 });
    this.inv.select(i);
  }

  // ------------------------------------------------------------------ fixed tick
  tick(dt: number): void {
    const g = this.game;
    const p = g.player;
    const input = g.input;
    // wands regenerate mana and count down even when not held
    const manaMult = p.status.manaRegen > 0 ? 4 : 1;
    for (const w of this.inv.wands) if (w) w.tick(1, manaMult);
    if (p.alive) {
      const canAct = p.status.frozen <= 0 && p.status.polymorph <= 0;
      const w = this.inv.activeWand();
      if (w && canAct && input.mouseHeld(0) && !this.devToolActive()) this.tryCast(w);
      const it = this.inv.activeItem();
      if (it && canAct && input.mouseHeld(0) && !this.devToolActive()) this.pour(it, dt);
      if (it && input.held('interact')) this.fillFromAim(it);
      this.damage.updateCreature(p, dt);
      this.updateBreath(dt);
      this.collectGoldDust();
    }
    this.projectiles.update(dt);
    this.pickups.update(dt, g.time);
    this.updateThrown(dt);
    this.enemies.tick(dt);
    this.progression.tick(dt);
    this.updatePickupContact();
    this.updatePrompt();
  }

  devToolActive(): boolean {
    const d = (window as unknown as { debug?: { tool: string } }).debug;
    return !!d && d.tool !== 'none';
  }

  private aim(): THREE.Vector3 {
    const g = this.game;
    const cam = g.camera.position;
    const d = g.lookDir();
    const h = g.world.raycast(cam.x, cam.y, cam.z, d.x, d.y, d.z, 300, RAY_SOLID);
    if (h.hit) this.aimPoint.set(h.px, h.py, h.pz);
    else this.aimPoint.set(cam.x + d.x * 300, cam.y + d.y * 300, cam.z + d.z * 300);
    // the enemy under the crosshair is a better target than the wall behind it
    return this.aimPoint;
  }

  /** Muzzle position, pulled back if the wand tip is inside terrain. */
  private castOrigin(): THREE.Vector3 {
    const g = this.game;
    this.viewmodel.muzzleWorld(g.camera, this.muzzle);
    const cam = g.camera.position;
    const dx = this.muzzle.x - cam.x, dy = this.muzzle.y - cam.y, dz = this.muzzle.z - cam.z;
    const len = Math.hypot(dx, dy, dz);
    const h = g.world.raycast(cam.x, cam.y, cam.z, dx, dy, dz, len, RAY_SOLID);
    if (h.hit) this.muzzle.set(cam.x + (dx / len) * Math.max(0, h.dist - 0.3), cam.y + (dy / len) * Math.max(0, h.dist - 0.3), cam.z + (dz / len) * Math.max(0, h.dist - 0.3));
    return this.muzzle;
  }

  tryCast(w: Wand): void {
    if (!w.isReady()) return;
    const g = this.game;
    const p = g.player;
    const r = w.cast(this.castRng);
    if (!r.fired) return;
    if (r.skippedForMana.length && !r.producedProjectile) audio.play('not_enough_mana', { volume: 0.5 });
    if (!r.root.projectiles.length) return;
    const origin = this.castOrigin();
    const target = this.aim();
    const dir = new THREE.Vector3().subVectors(target, origin);
    if (dir.lengthSq() < 4) dir.copy(g.lookDir()); // point blank: shoot straight along the view
    dir.normalize();
    // drunk players cast with extra spread
    const drunkSpread = p.status.drunk > 0.05 ? 8 * p.status.drunk : 0;
    this.projectiles.fireShot(r.root, origin.x, origin.y, origin.z, dir, p, w.stats.spread + drunkSpread, w.stats.speedMult, (c) => c !== p);
    this.viewmodel.kick(Math.min(1.2, 0.4 + r.root.projectiles.length * 0.15));
    const first = r.root.projectiles[0];
    const pdef = PROJECTILES[first.projectile];
    audio.play((pdef?.castSound ?? 'cast_generic') as SoundName, { volume: 0.55 });
    this.addTimedLight(origin.x, origin.y, origin.z, [0.8, 0.85, 1], 14, 0.8, 0.08);
  }

  private pour(it: Potion, dt: number): void {
    if (potionTotal(it) <= 0) return;
    const g = this.game;
    this.pourAcc += dt * 160; // voxels per second
    const origin = this.castOrigin();
    const d = g.lookDir();
    let n = 0;
    while (this.pourAcc >= 1 && n < 8) {
      this.pourAcc -= 1;
      const m = potionTakeOne(it, () => this.rng.f());
      if (m === null) break;
      const sp = 22 + this.rng.f() * 6;
      g.particles.launch(m, 0, origin.x, origin.y, origin.z, d.x * sp + (this.rng.f() - 0.5) * 3, d.y * sp + (this.rng.f() - 0.5) * 3 + 3, d.z * sp + (this.rng.f() - 0.5) * 3);
      n++;
    }
    if (n && this.rng.f() < 0.15) audio.play('liquid_pour', { volume: 0.3 });
  }

  private fillFromAim(it: Potion): void {
    const g = this.game;
    if (potionTotal(it) >= it.capacity) return;
    const cam = g.camera.position;
    const d = g.lookDir();
    const h = g.world.raycast(cam.x, cam.y, cam.z, d.x, d.y, d.z, 12, RAY_SOLID | RAY_LIQUID);
    if (!h.hit || KIND[h.mat] !== Kind.LIQUID || !canStore(h.mat)) return;
    // suck up a few connected voxels of the surface
    let taken = 0;
    for (let k = 0; k < 6 && taken < 4; k++) {
      const x = h.x + Math.round(this.rng.f() * 4 - 2), y = h.y - Math.round(this.rng.f() * 2), z = h.z + Math.round(this.rng.f() * 4 - 2);
      const m = g.world.get(x, y, z);
      if (KIND[m] !== Kind.LIQUID) continue;
      if (potionAdd(it, m, 1)) {
        g.world.set(x, y, z, AIR);
        taken++;
      }
    }
    if (taken && this.rng.f() < 0.1) audio.play('liquid_pour', { volume: 0.25 });
  }

  private throwPotion(): void {
    const slot = this.inv.selected - 4;
    const it = this.inv.items[slot];
    if (!it) return;
    this.inv.items[slot] = null;
    this.inv.cycle(1);
    const g = this.game;
    const o = this.castOrigin();
    const d = g.lookDir();
    const m = potionMain(it);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.8), new THREE.MeshBasicMaterial({ color: m !== null ? MATERIALS[m].colors[0] : '#cfe8ee' }));
    g.scene.add(mesh);
    this.thrown.push({ potion: it, x: o.x, y: o.y, z: o.z, vx: d.x * 48, vy: d.y * 48 + 8, vz: d.z * 48, age: 0, mesh });
    audio.play('potion_throw', { volume: 0.6 });
  }

  private updateThrown(dt: number): void {
    const g = this.game;
    for (const t of this.thrown) {
      t.age += dt;
      t.vy -= 52 * dt;
      const nx = t.x + t.vx * dt, ny = t.y + t.vy * dt, nz = t.z + t.vz * dt;
      const len = Math.hypot(nx - t.x, ny - t.y, nz - t.z);
      const h = g.world.raycast(t.x, t.y, t.z, nx - t.x, ny - t.y, nz - t.z, len, RAY_SOLID | RAY_LIQUID);
      let hitC = false;
      for (const c of this.damage.creatures) if (c !== g.player && c.alive && c.containsPoint(nx, ny, nz, 0.5)) hitC = true;
      if (h.hit || hitC || t.age > 6) {
        const sx = h.hit ? h.px - t.vx * 0.01 : nx, sy = h.hit ? h.py - t.vy * 0.01 : ny, sz = h.hit ? h.pz - t.vz * 0.01 : nz;
        this.shatter(t.potion, sx, sy, sz);
        g.scene.remove(t.mesh);
        (t.mesh as THREE.Mesh).geometry.dispose();
        ((t.mesh as THREE.Mesh).material as THREE.Material).dispose();
        t.age = -1;
        continue;
      }
      t.x = nx; t.y = ny; t.z = nz;
      t.mesh.position.set(t.x, t.y, t.z);
      t.mesh.rotation.x += dt * 8;
    }
    this.thrown = this.thrown.filter((t) => t.age >= 0);
  }

  shatter(it: Potion, x: number, y: number, z: number): void {
    const g = this.game;
    let m: number | null;
    let n = 0;
    while ((m = potionTakeOne(it, () => this.rng.f())) !== null && n < 2000) {
      const a = this.rng.f() * Math.PI * 2, u = this.rng.f() * 2 - 1, s = Math.sqrt(1 - u * u);
      const sp = 4 + this.rng.f() * 16;
      g.particles.launch(m, 0, x, y, z, s * Math.cos(a) * sp, Math.abs(u) * sp + 3, s * Math.sin(a) * sp);
      n++;
    }
    for (let i = 0; i < 14; i++) g.particles.spawn(x, y, z, (this.rng.f() - 0.5) * 16, this.rng.f() * 10, (this.rng.f() - 0.5) * 16, [0.75, 0.88, 0.92], 0.6, 0.25, 1, false, 1);
    audio.play('glass_break', { x, y, z, volume: 0.8 });
  }

  /** Drink: each sip consumes 10% of every material and applies its ingestion effect. */
  private drink(it: Potion): void {
    const p = this.game.player;
    const total = potionTotal(it);
    if (total <= 0) return;
    const s = p.status;
    for (const [m, v] of [...it.contents]) {
      const take = Math.max(1, Math.round(v * 0.1));
      it.contents.set(m, v - take);
      if (v - take <= 0) it.contents.delete(m);
      const name = MATERIALS[m].name;
      // Noita ingestion effects: durations per full sip (scaled down for small remainders)
      const f = Math.min(1, take / 100);
      switch (name) {
        case 'water': s.wet = Math.min(1, s.wet + 0.3); s.onFire = 0; break;
        case 'whiskey': s.drunk = Math.min(1, s.drunk + 0.5 * f); this.hud.log('You feel tipsy.'); break;
        case 'healthium': s.regen = Math.max(s.regen, 7.5 * f); break;
        case 'mana': s.manaRegen = Math.max(s.manaRegen, 20 * f); break;
        case 'teleportatium': s.teleportitis = Math.max(s.teleportitis, 5 * f); break;
        case 'polymorphine': s.polymorph = Math.max(s.polymorph, 20 * f); this.hud.log('You feel woolly… (no casting while polymorphed)', '#e0a0ff'); break;
        case 'berserkium': s.berserk = Math.max(s.berserk, 15 * f); this.hud.log('Berserk!', '#ff8060'); break;
        case 'toxic': s.poisoned = Math.max(s.poisoned, 10 * f); break;
        case 'acid': s.poisoned = Math.max(s.poisoned, 30 * f); this.damage.apply({ target: p, amount: 5, type: 'acid', source: null, x: p.cx, y: p.cy, z: p.cz }); break;
        case 'oil': case 'slime': s.poisoned = Math.max(s.poisoned, 5 * f); break;
        case 'lava': this.damage.setOnFire(p, 10); break;
        case 'blood': if (this.progression.hasPerk('VAMPIRISM')) this.damage.apply({ target: p, amount: 4 * (take / 100), type: 'healing', source: null, x: 0, y: 0, z: 0 }); break;
        default: break;
      }
    }
    audio.play('drink', { volume: 0.6 });
  }

  private kick(): void {
    const g = this.game;
    const p = g.player;
    if (p.kickCooldown > 0) return;
    p.kickCooldown = 0.45;
    const d = g.lookDir();
    const fx = p.body.x + d.x * 3, fy = p.body.y + 2.5, fz = p.body.z + d.z * 3;
    let hit = false;
    for (const c of this.damage.creatures) {
      if (c === p || !c.alive) continue;
      if (Math.hypot(c.cx - fx, (c.body.y + 1) - fy, c.cz - fz) > 4 + c.body.hw) continue;
      hit = true;
      if (c.status.frozen > 0) {
        // kicking a frozen creature shatters it
        this.damage.apply({ target: c, amount: c.hp + 1, type: 'melee', source: p, x: fx, y: fy, z: fz });
        continue;
      }
      const leg = this.progression.hasPerk('LEGGY_FEET') ? 60 : 0;
      this.damage.apply({ target: c, amount: 1 + leg, type: 'melee', source: p, x: fx, y: fy, z: fz, kx: d.x * 30, ky: 10, kz: d.z * 30 });
    }
    for (const pk of this.pickups.list) {
      if (Math.hypot(pk.body.x - fx, pk.body.y - fy + 1.5, pk.body.z - fz) < 4) {
        pk.body.vx += d.x * 25;
        pk.body.vy += 10;
        pk.body.vz += d.z * 25;
        hit = true;
      }
    }
    audio.play('kick', { volume: hit ? 0.7 : 0.4 });
  }

  // ------------------------------------------------------------------ pickups
  private updatePickupContact(): void {
    const p = this.game.player;
    const attract = this.progression.hasPerk('ATTRACT_GOLD');
    for (const pk of this.pickups.list) {
      if (pk.dead) continue;
      const dx = pk.body.x - p.body.x, dy = pk.body.y - (p.body.y + 2), dz = pk.body.z - p.body.z;
      const d = Math.hypot(dx, dy, dz);
      if (pk.kind === 'gold') {
        if (attract && d < 40) {
          pk.body.vx -= (dx / d) * 2;
          pk.body.vy -= (dy / d) * 2;
          pk.body.vz -= (dz / d) * 2;
        }
        if (d < 3.5) {
          p.gold += pk.gold ?? 10;
          this.pickups.remove(pk);
          audio.play('pickup_gold', { volume: 0.45 });
        }
      } else if ((pk.kind === 'heart' || pk.kind === 'heart_full') && d < 3.5 && pk.price === 0) {
        if (pk.kind === 'heart') {
          p.maxHp += 25;
          this.hud.log('Max HP +25', '#ff8a8a');
        } else {
          p.maxHp += 10;
          p.hp = p.maxHp;
          this.hud.log('Max HP +10, health fully restored', '#ff8a8a');
        }
        this.pickups.remove(pk);
        audio.play('pickup_heart', { volume: 0.8 });
      }
    }
  }

  private updatePrompt(): void {
    const g = this.game;
    const cam = g.camera.position;
    const d = g.lookDir();
    const pk = this.pickups.pick(cam.x, cam.y, cam.z, d.x, d.y, d.z, 14);
    this.promptTarget = pk;
    let txt = '';
    const E = g.input.key('interact');
    if (pk) {
      const price = pk.price > 0 ? ` — ${pk.price} gold` : '';
      switch (pk.kind) {
        case 'wand': txt = `[${E}] Pick up wand: ${pk.label}${price}`; break;
        case 'spell': txt = `[${E}] Pick up spell: ${pk.label}${price}`; break;
        case 'potion': txt = `[${E}] Pick up ${pk.label}`; break;
        case 'chest': txt = `[${E}] Open chest`; break;
        case 'perk': txt = `[${E}] Take perk: ${pk.label}`; break;
        case 'refresher': txt = `[${E}] Use Spell Refresher`; break;
        case 'reroll': txt = `[${E}] Reroll perks — ${this.progression.rerollCost} gold`; break;
        case 'sampo': txt = `[${E}] Claim the Sampo`; break;
        default: txt = pk.label;
      }
    } else {
      const it = this.inv.activeItem();
      if (it) {
        const h = g.world.raycast(cam.x, cam.y, cam.z, d.x, d.y, d.z, 12, RAY_SOLID | RAY_LIQUID);
        if (h.hit && KIND[h.mat] === Kind.LIQUID) txt = `[Hold ${E}] Fill flask with ${MATERIALS[h.mat].display}`;
      }
      const t = this.progression.nearbyText();
      if (!txt && t) txt = t;
    }
    this.prompt = txt;
  }

  interact(): void {
    const pk = this.promptTarget;
    if (!pk || pk.dead) return;
    const p = this.game.player;
    if (pk.price > 0) {
      if (p.gold < pk.price) {
        this.hud.log('Not enough gold', '#ff8060');
        audio.play('not_enough_mana', { volume: 0.5 });
        return;
      }
    }
    switch (pk.kind) {
      case 'wand': {
        this.progression.applySpellPerks(pk.wand!.spells);
        const slot = this.inv.wands.indexOf(null);
        if (slot < 0) {
          // swap with the held wand (Noita drops the current one)
          const cur = this.inv.selected < 4 ? this.inv.selected : 0;
          const old = this.inv.wands[cur]!;
          this.inv.wands[cur] = pk.wand!;
          this.dropWand(old);
        } else {
          this.inv.wands[slot] = pk.wand!;
          this.inv.select(slot);
        }
        this.hud.log(`Picked up ${pk.label}`);
        this.hint('wand', 'New wand! Switch with 1-4 or the mouse wheel. Compare wands by looking at them before picking up.');
        audio.play('pickup_item', { volume: 0.6 });
        break;
      }
      case 'spell': {
        this.hint('spell', `Spells go into your bag (${this.game.input.key('inventory')}). You can place them into wands only inside a Holy Mountain.`);
        const inst = { id: pk.spell!.id, uses: pk.spell!.uses };
        this.progression.applySpellPerks([inst]);
        if (this.inv.addSpell(inst) < 0) {
          this.hud.log('Spell inventory is full', '#ff8060');
          return;
        }
        this.hud.log(`Picked up ${pk.label}`);
        audio.play('pickup_spell', { volume: 0.6 });
        break;
      }
      case 'potion': {
        if (this.inv.addItem(pk.potion!) < 0) {
          this.hud.log('Item slots are full', '#ff8060');
          return;
        }
        audio.play('pickup_item', { volume: 0.6 });
        break;
      }
      case 'chest':
        this.openChest(pk);
        break;
      default:
        if (!this.progression.interact(pk)) return;
        if (pk.kind === 'perk' || pk.kind === 'refresher' || pk.kind === 'sampo' || pk.kind === 'reroll') return; // progression handles removal
    }
    if (pk.price > 0) {
      p.gold -= pk.price;
      this.hud.log(`Bought for ${pk.price} gold`, '#e8c050');
    }
    this.pickups.remove(pk);
  }

  private openChest(pk: Pickup): void {
    const r = new Rng(pk.gold ?? 1);
    const x = pk.body.x, y = pk.body.y + 1.5, z = pk.body.z;
    // loot quality of the biome the chest was found in (the pacifist chest: the biome just cleared)
    const tier = Math.max(1, Math.min(6, pk.tier ?? biomeAt(pk.body.y)?.lootTier ?? 1));
    const n = r.int(2, 4);
    for (let i = 0; i < n; i++) {
      const roll = r.next();
      if (roll < 0.35) for (let k = 0; k < r.int(3, 8); k++) this.pickups.add('gold', x + r.range(-1, 1), y, z + r.range(-1, 1), { gold: r.chance(0.2) ? 50 : 10, life: -1 });
      else if (roll < 0.6) {
        const id = randomSpell(() => r.next(), Math.min(6, tier));
        this.pickups.add('spell', x + r.range(-2, 2), y + 1, z + r.range(-2, 2), { spell: { id, uses: SPELLS[id].maxUses }, baseY: y + 1 });
      } else if (roll < 0.8) this.pickups.add('potion', x + r.range(-2, 2), y, z + r.range(-2, 2), { potion: this.randomPotion(r, tier) });
      else if (roll < 0.9) this.pickups.add('heart', x, y + 1, z, { baseY: y + 1 });
      else {
        const gw = generateWand(() => r.next(), Math.min(6, tier + 1));
        this.pickups.add('wand', x, y, z, { wand: new Wand(gw.stats, gw.spells, gw.alwaysCast) });
      }
    }
    audio.play('pickup_item', { volume: 0.8 });
    this.hud.log('The chest bursts open!', '#e8c050');
  }

  dropWand(w: Wand): void {
    const p = this.game.player;
    const d = this.game.lookDir();
    const pk = this.pickups.add('wand', p.body.x + d.x * 3, p.eyeY - 1, p.body.z + d.z * 3, { wand: w });
    pk.body.vx = d.x * 12;
    pk.body.vz = d.z * 12;
  }

  dropSpell(s: SpellInstance): void {
    const p = this.game.player;
    const d = this.game.lookDir();
    const y = p.body.y + 3;
    this.pickups.add('spell', p.body.x + d.x * 4, y, p.body.z + d.z * 4, { spell: s, baseY: y });
  }

  dropItem(slot: number): void {
    const it = this.inv.items[slot];
    if (!it) return;
    this.inv.items[slot] = null;
    const p = this.game.player;
    const d = this.game.lookDir();
    this.pickups.add('potion', p.body.x + d.x * 3, p.eyeY - 1, p.body.z + d.z * 3, { potion: it });
  }

  /** Noita: gold powder is collected on touch, 1 gold per pixel. */
  private collectGoldDust(): void {
    const g = this.game;
    const b = g.player.body;
    for (let y = Math.floor(b.y - 1); y <= Math.floor(b.y + 2); y++)
      for (let z = Math.floor(b.z - b.hw - 1); z <= Math.floor(b.z + b.hw + 1); z++)
        for (let x = Math.floor(b.x - b.hw - 1); x <= Math.floor(b.x + b.hw + 1); x++) {
          if (g.world.get(x, y, z) === GOLDSAND) {
            g.world.set(x, y, z, AIR);
            g.player.gold += 1;
            if (this.rng.f() < 0.2) audio.play('pickup_gold', { volume: 0.2 });
          }
        }
  }

  // ------------------------------------------------------------------ breath & death
  private updateBreath(dt: number): void {
    const g = this.game;
    const p = g.player;
    const head = g.world.get(Math.floor(p.body.x), Math.floor(p.eyeY), Math.floor(p.body.z));
    const under = KIND[head] === Kind.LIQUID;
    if (under && !this.progression.hasPerk('BREATH_UNDERWATER')) {
      this.breathT = Math.max(0, this.breathT - dt / 12);
      if (this.breathT <= 0) this.damage.apply({ target: p, amount: p.maxHp * 0.08 * dt, type: 'physical', source: null, x: p.cx, y: p.cy, z: p.cz, trick: true });
    } else this.breathT = Math.min(1, this.breathT + dt / 2);
    void WATER;
  }

  private playerDied(cause: string): void {
    const g = this.game;
    if (this.progression.tryExtraLife()) return;
    g.state = 'dead';
    this.lastCause = cause;
    audio.play('player_death', { volume: 1 });
    this.onDeath?.();
  }

  lastCause = '';

  stats(): { time: number; gold: number; kills: number; depth: number; biome: string } {
    const p = this.game.player;
    const b = biomeAt(p.body.y);
    return {
      time: (performance.now() - this.startTime) / 1000,
      gold: p.gold,
      kills: this.kills,
      depth: Math.max(0, Math.round(1920 - p.body.y)),
      biome: hmBandOf(p.body.y) >= 0 ? 'Holy Mountain' : b?.display ?? 'Mountain',
    };
  }

  dispose(): void {
    const g = this.game;
    this.enemies.clear();
    this.pickups.clear();
    this.viewmodel.setEmpty();
    g.scene.remove(this.projectiles.glowPoints, this.projectiles.solidPoints, this.pickups.group, this.enemies.group);
    this.projectiles.glowPoints.geometry.dispose();
    this.projectiles.solidPoints.geometry.dispose();
    for (const t of this.thrown) g.scene.remove(t.mesh);
    this.hud.root.remove();
    this.invUI.dispose();
    void UNLOADED;
    void DT;
  }
}
