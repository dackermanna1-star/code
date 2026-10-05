// A single dungeon floor at runtime: meshes, props, enemies, corpses, obstacles and room events
// (arena lock-ins, waves, mini-bosses, boss fights, challenges).
import * as THREE from 'three';
import { buildDungeonMeshes } from '../world/build.js';
import { World } from '../world/world.js';
import { TILE, C } from '../world/constants.js';
import { F } from '../world/dungeon-gen.js';
import * as M from '../world/prop-meshes.js';
import * as FU from '../world/furniture.js';
import { harvestFlames, mergeStatic } from '../render/batching.js';
import { Breakable, Chest, Door, Gate, SecretWall, Trap, Shrine, Shop, Pedestal, Exit } from '../world/props.js';
import { Enemy, Corpse } from '../entities/enemy.js';
import { BOSS_ORDER } from '../entities/enemy-defs.js';
import { themeMaterials, sharedAssets } from '../render/materials.js';
import { makeRelic } from '../items/loot.js';
import { RNG } from '../core/rng.js';
import { rand } from '../core/math.js';

const _v = new THREE.Vector3();

const ROOM_NAMES = {
  foyer: 'Entrance Hall', hall: 'Gallery', greathall: 'Great Hall', dining: 'Dining Hall', library: 'Library', chapel: 'Chapel',
  armory: 'Armoury', dormitory: 'Barracks', ruin: 'Collapsed Chamber', crypt: 'Crypt', kitchen: 'Kitchen', storeroom: 'Storeroom',
  study: 'Study', prison: 'Cells', alchemy: 'Laboratory', workshop: 'Workshop', bath: 'Bathhouse', bedroom: 'Bedchamber',
  latrine: 'Latrine', pantry: 'Pantry', throne: 'Throne Room', treasury: 'Treasury', stairs: 'Grand Staircase', shop: 'Merchant',
  shrine: 'Shrine', secret: 'Hidden Chamber',
};

export class Level {
  constructor(game, dungeon) {
    this.game = game;
    game.level = this;
    this.d = dungeon;
    this.theme = dungeon.theme;
    const scene = game.renderer.scene;
    this.mats = themeMaterials(this.theme);
    this.assets = sharedAssets();
    this.world = new World(dungeon);
    game.world = this.world;
    this.group = new THREE.Group();
    scene.add(this.group);
    const built = buildDungeonMeshes(dungeon, this.mats, this.assets);
    this.group.add(built.group);
    this.lava = built.lavaMesh;
    this.water = built.waterMesh;

    this.enemies = [];
    this.corpses = [];
    this.ragdolls = new Set();
    this.obstacles = [];
    this.obstacleGrid = new Map();
    this.props = [];
    this.interactables = [];
    this.updatables = [];
    this.flames = [];
    this.cullables = [];
    this.doors = [];
    this.gates = [];
    this.secretWalls = [];
    this.traps = [];
    this.stuck = [];
    this.projectiles = [];
    this.pendingWaves = new Map();
    this.attackTokens = 0;
    // how many foes may commit to an attack at once
    this.maxTokens = Math.min(5, 2 + Math.floor(game.floor * 0.6));
    this.roomState = new Map();
    this.currentRoom = null;
    this.boss = null;
    this.exit = null;
    this.challenge = null;
    this.meleeTargets = [];
    this.rng = new RNG(game.seed + '-level-' + game.floor);

    this.roomBatches = new Map();
    this._buildLights(built);
    this._spawnEntities();
    this._flushBatches();
  }

  // ------------------------------------------------------------ construction
  _buildLights(built) {
    const r = this.game.renderer;
    const theme = this.theme;
    for (const t of this.d.torches) {
      const raw = M.makeTorch(theme.torch);
      raw.position.set(t.x, t.y, t.z);
      raw.rotation.y = Math.atan2(t.nx, t.nz);
      raw.updateMatrixWorld(true);
      const lp = raw.localToWorld(raw.userData.lightOffset.clone());
      this._addStatic(raw, this.world.roomAt(t.x, t.z)?.id ?? -1);
      r.addLightSource(lp, theme.torch, 26, 14, 0.8);
    }
    // lava glow
    if (built.lavaCells && built.lavaCells.length) {
      for (let i = 0; i < built.lavaCells.length; i += 5) {
        const [x, y] = built.lavaCells[i];
        r.addLightSource(new THREE.Vector3((x + 0.5) * TILE, this.d.floorH[y * this.d.W + x] + 0.3, (y + 0.5) * TILE), 0xff5a1a, 14, 8, 0.5);
      }
    }
  }

  _spawnEntities() {
    const game = this.game;
    const d = this.d;
    const world = this.world;
    const mats = this.mats;
    for (const s of d.secretWalls) {
      const sw = new SecretWall(game, s, mats);
      this.secretWalls.push(sw);
    }
    for (const dd of d.doors) {
      const door = new Door(game, dd);
      this.doors.push(door);
      this.interactables.push(door);
      this.updatables.push(door);
    }
    for (const g of d.gates) {
      const gate = new Gate(game, g, 3.4);
      this.gates.push(gate);
      this.updatables.push(gate);
    }
    // boss room gets a gate too
    const bossRoom = d.rooms[d.bossRoom];
    for (const e of d.entrances) {
      if (e.roomId !== bossRoom.id || e.valid === false) continue;
      if (this.gates.some((g) => g.cx === e.cx && g.cy === e.cy)) continue;
      const gate = new Gate(game, { cx: e.cx, cy: e.cy, axis: e.axis, roomId: bossRoom.id }, 3.4);
      this.gates.push(gate);
      this.updatables.push(gate);
    }

    for (const e of d.entities) {
      const roomId = e.cx !== undefined ? world.roomOf[e.cy * world.W + e.cx] : (world.roomAt(e.x, e.z) || { id: -1 }).id;
      const room = roomId >= 0 ? d.rooms[roomId] : null;
      switch (e.type) {
        case 'enemy': {
          if (e.wave > 0) {
            if (!this.pendingWaves.has(e.roomId)) this.pendingWaves.set(e.roomId, []);
            this.pendingWaves.get(e.roomId).push(e);
            break;
          }
          const dormant = e.kind === 'skeleton' && Math.random() < 0.3;
          this.spawnEnemy(e.kind, e.x, e.z, { roomId: e.roomId, elite: e.elite, dormant });
          break;
        }
        case 'barrel': case 'crate': case 'pot': case 'chair': case 'explosiveBarrel': {
          const b = new Breakable(game, e.type, e.x, e.z, { rot: e.rot, stack: e.stack, small: e.type === 'crate' && Math.random() < 0.4 });
          this.props.push(b);
          this.updatables.push(b);
          break;
        }
        case 'chest': {
          const c = new Chest(game, e.x, e.z, { ...e, roomId });
          this.interactables.push(c);
          this.updatables.push(c);
          if (e.hidden && room) room.hiddenChest = c;
          break;
        }
        case 'trap': {
          const t = new Trap(game, e);
          this.traps.push(t);
          this.updatables.push(t);
          break;
        }
        case 'shrine': {
          const s = new Shrine(game, { ...e, roomId });
          this.interactables.push(s);
          this.updatables.push(s);
          break;
        }
        case 'shop': {
          const s = new Shop(game, { ...e, roomId });
          this.interactables.push(s);
          this.updatables.push(s);
          break;
        }
        case 'pedestal': {
          const item = makeRelic(this.rng, e.tier >= 2 ? 1 : 0, Object.keys(game.player.relics));
          const p = new Pedestal(game, { x: e.x, z: e.z, item });
          this.interactables.push(p);
          this.updatables.push(p);
          break;
        }
        case 'exit': {
          this.exit = new Exit(game, e);
          this.interactables.push(this.exit);
          this.updatables.push(this.exit);
          break;
        }
        case 'loot': {
          const pos = new THREE.Vector3(e.x, this.world.floorAt(e.x, e.z) + 0.5, e.z);
          if (e.what === 'gold') game.loot.spawnGold(pos, 3 + game.floor * 2);
          else game.loot.spawnSmall('potion', pos);
          break;
        }
        default:
          this._decor(e, room);
      }
    }
  }

  // Static decor is gathered per room and merged into one batch per room (a few draws per material).
  _addStatic(m, roomId) {
    harvestFlames(m, this.game.flames);
    if (roomId === undefined || roomId === null || roomId < 0) {
      const merged = mergeStatic(m);
      this.group.add(merged);
      this.cullables.push(merged);
      return;
    }
    if (!this.roomBatches.has(roomId)) this.roomBatches.set(roomId, new THREE.Group());
    this.roomBatches.get(roomId).add(m);
  }

  _flushBatches() {
    for (const [roomId, g] of this.roomBatches) {
      const r = this.d.rooms[roomId];
      const out = mergeStatic(g);
      out.userData = {
        center: new THREE.Vector3((r.x + r.w / 2) * TILE, 0, (r.y + r.h / 2) * TILE),
        radius: Math.hypot(r.w, r.h) * TILE * 0.5 + 1,
      };
      this.group.add(out);
      this.cullables.push(out);
    }
    this.roomBatches.clear();
  }

  _light(m, color, intensity, range, flicker = 0.6) {
    const off = m.userData.lightOffset;
    if (!off) return;
    m.updateMatrixWorld(true);
    this.game.renderer.addLightSource(m.localToWorld(off.clone()), color, intensity, range, flicker);
  }

  _decor(e, room) {
    const mats = this.mats;
    const world = this.world;
    let m = null;
    let obstacle = null;
    const rot = e.rot || 0;
    const fy = world.floorAt(e.x, e.z);
    const boxObs = (w, dpt, h = 2) => {
      const alongX = Math.abs(Math.sin(rot)) < 0.5;
      const hx = alongX ? w / 2 : dpt / 2, hz = alongX ? dpt / 2 : w / 2;
      return { type: 'box', x0: e.x - hx, z0: e.z - hz, x1: e.x + hx, z1: e.z + hz, h };
    };
    const circ = (r, h) => ({ type: 'circle', x: e.x, z: e.z, r, h });
    const roomId = e.roomId ?? (room ? room.id : -1);
    // things hung on a wall: their back sits on the wall plane
    const wall = (mm) => {
      mm.position.set(e.wallX ?? e.x, e.fy ?? fy, e.wallZ ?? e.z);
      mm.rotation.y = rot;
      this._addStatic(mm, roomId);
    };
    let light = null;
    switch (e.type) {
      case 'column': {
        const h = e.h ?? (room ? room.ceil - fy : 4);
        m = e.slim ? FU.makeSlimColumn(h, mats) : M.makeColumn(h, mats);
        obstacle = circ(e.slim ? 0.32 : 0.48, 10);
        break;
      }
      case 'brazier': {
        m = M.makeBrazier(this.theme.torch);
        obstacle = circ(0.45, 1.1);
        this.game.renderer.addLightSource(new THREE.Vector3(e.x, fy + 1.8, e.z), this.theme.torch, 34, 16, 1);
        break;
      }
      case 'candles': {
        m = M.makeCandles(Math.floor(rand(3, 6)), 0xffb060);
        this.game.renderer.addLightSource(new THREE.Vector3(e.x, fy + 0.8, e.z), 0xffaa55, 6, 6, 0.6);
        break;
      }
      case 'table': m = FU.makeDressedTable(e) || M.makeTable(); obstacle = boxObs(1.8, 0.95, 0.9); break;
      case 'bookshelf':
        if (e.double) { m = FU.makeDoubleBookshelf(); obstacle = boxObs(2.1, 0.95, 2.5); }
        else { m = M.makeBookshelf(); obstacle = boxObs(2.1, 0.5, 2.5); }
        break;
      case 'sarcophagus': m = M.makeSarcophagus(mats); obstacle = boxObs(1.1, 2.3, 1.1); break;
      case 'statue': m = M.makeStatue(mats); obstacle = circ(0.5, 2.8); break;
      case 'weaponRack': m = M.makeWeaponRack(); obstacle = boxObs(1.4, 0.4, 1.5); break;
      case 'banner': wall(M.makeBanner()); return;
      case 'painting': wall(FU.makePainting(e.seed ?? Math.floor(Math.random() * 99))); return;
      case 'shield': wall(FU.makeShieldDecor(e.seed ?? 0)); return;
      case 'pans': wall(FU.makePans()); return;
      case 'shackles': wall(FU.makeShackles()); return;
      case 'chains': {
        m = M.makeChains(rand(1.2, 2.4));
        m.position.set(e.x, e.y ?? (room ? room.ceil : fy + 4), e.z);
        this._addStatic(m, roomId);
        return;
      }
      case 'cobweb': {
        m = M.makeCobweb();
        m.position.set(e.x, (e.y ?? (room ? room.ceil : fy + 4)) - 0.02, e.z);
        m.rotation.y = rot;
        this._addStatic(m, roomId);
        return;
      }
      case 'chandelier': {
        const top = e.y ?? (room ? room.ceil : fy + 5);
        const hang = Math.min(2.2, top - fy - 3.4);
        if (hang < 0.3) return;
        m = FU.makeChandelier(hang);
        m.position.set(e.x, top, e.z);
        this._light(m, 0xffb878, 30, 15, 0.4);
        this._addStatic(m, roomId);
        return;
      }
      case 'bones': m = M.makeBones(); break;
      case 'cage': m = M.makeCage(); obstacle = circ(0.55, 2); break;
      case 'rug': case 'runner': {
        m = M.makeRug(e.w || 3, e.h || 2, e.type === 'runner');
        m.position.set(e.x, fy + 0.01, e.z);
        m.rotation.z = rot;
        this._addStatic(m, roomId);
        return;
      }
      case 'bed': m = FU.makeBed(); obstacle = boxObs(1.3, 2.1, 0.7); break;
      case 'bunk': m = FU.makeBunk(); obstacle = boxObs(1.05, 2.1, 2.0); break;
      case 'wardrobe': m = FU.makeWardrobe(); obstacle = boxObs(1.3, 0.65, 2.3); break;
      case 'nightstand': m = FU.makeNightstand(); obstacle = boxObs(0.56, 0.5, 0.65); light = [0xffaa55, 5, 5]; break;
      case 'desk': m = FU.makeDesk(); obstacle = boxObs(1.45, 0.75, 0.85); light = [0xffaa55, 6, 6]; break;
      case 'shelf': m = FU.makeShelf(); obstacle = boxObs(1.9, 0.5, 2); break;
      case 'sacks': m = FU.makeSacks(); obstacle = circ(0.45, 0.8); break;
      case 'counter': m = FU.makeCounter(); obstacle = boxObs(2.3, 0.8, 1.0); break;
      case 'hearth': m = FU.makeHearth(mats); obstacle = boxObs(2.3, 0.95, 2.5); light = [0xff8a3a, 30, 13, 1]; break;
      case 'cauldron': m = FU.makeCauldron(room && room.func === 'alchemy'); obstacle = circ(0.62, 1.0); light = [room && room.func === 'alchemy' ? 0x6aff8a : 0xff8a3a, 12, 7, 1]; break;
      case 'longtable': m = FU.makeLongTable(e.len || 4, e.feast); obstacle = boxObs(2.3, e.len || 4, 0.9); break;
      case 'bench': m = FU.makeBench(); obstacle = boxObs(1.6, 0.45, 0.5); break;
      case 'privy': m = FU.makePrivy(); obstacle = boxObs(1.12, 1.0, 1.7); break;
      case 'bucket': m = FU.makeBucket(); obstacle = circ(0.2, 0.4); break;
      case 'bathtub': m = FU.makeBathtub(); obstacle = boxObs(1.7, 1.0, 0.65); break;
      case 'pew': m = FU.makePew(); obstacle = boxObs(2.1, 0.6, 1.15); break;
      case 'altar': m = FU.makeAltar(mats); obstacle = boxObs(2.0, 1.0, 1.1); light = [0xffb060, 10, 8]; break;
      case 'armorStand': m = FU.makeArmorStand(); obstacle = circ(0.35, 1.9); break;
      case 'anvil': m = FU.makeAnvil(); obstacle = circ(0.4, 0.95); break;
      case 'throne': m = FU.makeThrone(mats); obstacle = boxObs(1.6, 1.3, 2.6); break;
      case 'bust': m = FU.makeBust(mats); obstacle = circ(0.3, 1.8); break;
      case 'alchemy': m = FU.makeAlchemy(); obstacle = boxObs(1.85, 0.8, 0.95); light = [0x6ab0ff, 7, 5]; break;
      case 'straw': m = FU.makeStraw(); break;
      case 'dummy': m = FU.makeDummy(); obstacle = circ(0.35, 1.8); break;
      case 'bookpile': m = FU.makeBookPile(); break;
      case 'globe': m = FU.makeGlobe(); obstacle = circ(0.32, 1.4); break;
      case 'coinpile': m = FU.makeCoinPile(); obstacle = circ(0.55, 0.35); break;
      default: return;
    }
    if (!m) return;
    const y = m.position.y;
    m.position.set(e.x, fy + y, e.z);
    m.rotation.y = rot;
    if (light) this._light(m, light[0], light[1], light[2], light[3] ?? 0.6);
    this._addStatic(m, roomId);
    if (obstacle) this.addObstacle(obstacle);
  }

  // ------------------------------------------------------------ enemies
  spawnEnemy(kind, x, z, opts = {}) {
    const game = this.game;
    const e = new Enemy(game, kind, { ...opts, x, z });
    if (opts.vel) { e.vel.copy(opts.vel); e.airborne = true; e.pos.y = 0.3; }
    if (opts.alerted) { e.alerted = true; e.state = 'chase'; }
    this.enemies.push(e);
    return e;
  }

  alertRoom(src, game) {
    for (const e of this.enemies) {
      if (e === src || e.dead || e.alerted || e.state === 'dormant') continue;
      if ((src.roomId >= 0 && e.roomId === src.roomId) || e.pos.distanceTo(src.pos) < 9) {
        game.schedule(rand(0.1, 0.5), () => e.alert(game));
      }
    }
  }

  addCorpse(enemy, ragdoll) {
    const c = new Corpse(enemy, ragdoll);
    this.corpses.push(c);
    if (this.corpses.length > 28) {
      const old = this.corpses.shift();
      old.fading = 1;
      this.fadingCorpses = this.fadingCorpses || [];
      this.fadingCorpses.push(old);
    }
    return c;
  }

  addBloodPool(ragdoll, color) {
    ragdoll.pool = color;
  }

  // ------------------------------------------------------------ obstacles
  _cellKey(cx, cz) { return cx * 1000 + cz; }

  // o.h is a height above the local floor unless o.abs is set; it becomes an absolute top (and o.y0 a bottom)
  addObstacle(o) {
    if (!o.abs) {
      const cx = o.type === 'circle' ? o.x : (o.x0 + o.x1) / 2, cz = o.type === 'circle' ? o.z : (o.z0 + o.z1) / 2;
      const fy = this.world.floorAt(cx, cz);
      o.y0 = fy;
      o.h = fy + (o.h ?? 2);
      o.abs = true;
    }
    this.obstacles.push(o);
    const x0 = o.type === 'circle' ? o.x - o.r : o.x0, x1 = o.type === 'circle' ? o.x + o.r : o.x1;
    const z0 = o.type === 'circle' ? o.z - o.r : o.z0, z1 = o.type === 'circle' ? o.z + o.r : o.z1;
    o.cells = [];
    for (let cx = Math.floor(x0 / TILE); cx <= Math.floor(x1 / TILE); cx++) for (let cz = Math.floor(z0 / TILE); cz <= Math.floor(z1 / TILE); cz++) {
      const k = this._cellKey(cx, cz);
      if (!this.obstacleGrid.has(k)) this.obstacleGrid.set(k, []);
      this.obstacleGrid.get(k).push(o);
      o.cells.push(k);
    }
  }

  removeObstacle(o) {
    const i = this.obstacles.indexOf(o);
    if (i >= 0) this.obstacles.splice(i, 1);
    for (const k of o.cells || []) {
      const arr = this.obstacleGrid.get(k);
      if (arr) { const j = arr.indexOf(o); if (j >= 0) arr.splice(j, 1); }
    }
  }

  _nearObstacles(x, z, r, out) {
    out.clear();
    for (let cx = Math.floor((x - r) / TILE); cx <= Math.floor((x + r) / TILE); cx++) for (let cz = Math.floor((z - r) / TILE); cz <= Math.floor((z + r) / TILE); cz++) {
      const arr = this.obstacleGrid.get(this._cellKey(cx, cz));
      if (arr) for (const o of arr) out.add(o);
    }
    return out;
  }

  // prev (optional): where the point was last step, so fast things can't tunnel through thin panels
  collideObstacles(pos, r, prev = null) {
    const set = this._nearObstacles(pos.x, pos.z, r, this._tmpSet || (this._tmpSet = new Set()));
    for (const o of set) {
      if (pos.y > (o.h ?? 2) + 0.2 || pos.y + 1.6 < (o.y0 ?? -99)) continue;
      if (o.type === 'circle') {
        const dx = pos.x - o.x, dz = pos.z - o.z;
        const rr = r + o.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 0.001;
          pos.x = o.x + (dx / d) * rr;
          pos.z = o.z + (dz / d) * rr;
        }
      } else {
        if (prev && pos.x > o.x0 - r && pos.x < o.x1 + r && pos.z > o.z0 - r && pos.z < o.z1 + r) {
          // came from outside: leave on the side it came from
          if (prev.x <= o.x0 - r) { pos.x = o.x0 - r; continue; }
          if (prev.x >= o.x1 + r) { pos.x = o.x1 + r; continue; }
          if (prev.z <= o.z0 - r) { pos.z = o.z0 - r; continue; }
          if (prev.z >= o.z1 + r) { pos.z = o.z1 + r; continue; }
        }
        const px = Math.max(o.x0, Math.min(pos.x, o.x1)), pz = Math.max(o.z0, Math.min(pos.z, o.z1));
        let dx = pos.x - px, dz = pos.z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) { const d = Math.sqrt(d2); pos.x = px + (dx / d) * r; pos.z = pz + (dz / d) * r; }
          else {
            const l = pos.x - o.x0, rr = o.x1 - pos.x, t = pos.z - o.z0, b = o.z1 - pos.z;
            const m = Math.min(l, rr, t, b);
            if (m === l) pos.x = o.x0 - r; else if (m === rr) pos.x = o.x1 + r; else if (m === t) pos.z = o.z0 - r; else pos.z = o.z1 + r;
          }
        }
      }
    }
  }

  rayObstacles(o, d, maxD) {
    let best = null;
    const steps = Math.ceil(maxD / TILE) + 1;
    const seen = new Set();
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(maxD, i * TILE * 0.9);
      const x = o.x + d.x * t, z = o.z + d.z * t;
      const set = this._nearObstacles(x, z, 0.8, this._tmpSet2 || (this._tmpSet2 = new Set()));
      for (const ob of set) {
        if (seen.has(ob)) continue;
        seen.add(ob);
        let hit = null;
        if (ob.type === 'circle') {
          const ox = o.x - ob.x, oz = o.z - ob.z;
          const a = d.x * d.x + d.z * d.z;
          if (a < 1e-6) continue;
          const b = ox * d.x + oz * d.z;
          const c = ox * ox + oz * oz - ob.r * ob.r;
          const disc = b * b - a * c;
          if (disc < 0) continue;
          const tt = (-b - Math.sqrt(disc)) / a;
          if (tt < 0 || tt > maxD) continue;
          const hy = o.y + d.y * tt;
          if (hy > (ob.h ?? 2) || hy < (ob.y0 ?? 0)) continue;
          const hx = o.x + d.x * tt, hz = o.z + d.z * tt;
          const nl = Math.hypot(hx - ob.x, hz - ob.z) || 1;
          hit = { dist: tt, x: hx, y: hy, z: hz, nx: (hx - ob.x) / nl, nz: (hz - ob.z) / nl, obstacle: ob };
        } else {
          let tmin = 0, tmax = maxD, nx = 0, nz = 0;
          for (const [oa, da, lo, hi, ax] of [[o.x, d.x, ob.x0, ob.x1, 0], [o.z, d.z, ob.z0, ob.z1, 1]]) {
            if (Math.abs(da) < 1e-8) { if (oa < lo || oa > hi) { tmin = Infinity; break; } continue; }
            let t1 = (lo - oa) / da, t2 = (hi - oa) / da;
            let n = -1;
            if (t1 > t2) { [t1, t2] = [t2, t1]; n = 1; }
            if (t1 > tmin) { tmin = t1; nx = ax === 0 ? n : 0; nz = ax === 1 ? n : 0; }
            tmax = Math.min(tmax, t2);
          }
          if (tmin <= tmax && tmin > 0 && tmin <= maxD) {
            const hy = o.y + d.y * tmin;
            if (hy <= (ob.h ?? 2) && hy >= (ob.y0 ?? 0)) hit = { dist: tmin, x: o.x + d.x * tmin, y: hy, z: o.z + d.z * tmin, nx, nz, obstacle: ob };
          }
        }
        if (hit && (!best || hit.dist < best.dist)) best = hit;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ interactions with the environment
  pushCorpses(pos, r, vel) {
    const sp = Math.hypot(vel.x, vel.z);
    if (sp < 0.5) return;
    for (const c of this.corpses) {
      const rd = c.ragdoll;
      if (rd.pos[1].distanceToSquared(pos) > 9) continue;
      for (let i = 0; i < rd.n; i++) {
        const p = rd.pos[i];
        const dx = p.x - pos.x, dz = p.z - pos.z;
        if (dx * dx + dz * dz < (r + 0.15) ** 2 && p.y < pos.y + 1) {
          rd.prev[i].x -= vel.x * 0.006;
          rd.prev[i].z -= vel.z * 0.006;
          rd.wake();
        }
      }
    }
  }

  impulseArea(center, radius, power) {
    const game = this.game;
    for (const p of this.props) if (p.areaHit) p.areaHit(center, radius, power);
    for (const c of this.corpses) {
      const rd = c.ragdoll;
      const d = rd.pos[1].distanceTo(center);
      if (d > radius) continue;
      const f = 1 - d / radius;
      const dir = _v.subVectors(rd.pos[1], center).normalize();
      rd.impulseAll(dir.multiplyScalar(power * f * 0.8).setY(power * f * 0.7));
    }
    for (const b of game.physics.bodies) {
      if (b.owner) continue;
      const d = b.pos.distanceTo(center);
      if (d > radius) continue;
      const f = 1 - d / radius;
      b.applyImpulse(_v.subVectors(b.pos, center).normalize().multiplyScalar(power * f * b.mass * 0.6).setY(power * f * b.mass * 0.4), null);
    }
    for (const sw of this.secretWalls) {
      if (!sw.broken && sw.pos.distanceTo(center) < radius + 1.4) sw.break(game);
    }
    for (const door of this.doors) {
      if (!door.open && !door.locked && door.center.distanceTo(center) < radius + 0.6) door.openDoor(game, center, true);
    }
  }

  hitWallCell(cx, cz, point, power) {
    for (const sw of this.secretWalls) if (sw.cx === cx && sw.cy === cz) return sw.hit(this.game, point, power);
    for (const d of this.doors) if (d.cx === cx && d.cy === cz) return d.onStrike(this.game, point);
    // revealing hint: if a secret wall is adjacent and player has the Soul Lantern, nothing else
    return null;
  }

  kickDoors(eye, fwd, power) {
    for (const d of this.doors) {
      if (d.open) continue;
      const to = _v.subVectors(d.center, eye);
      to.y = 0;
      const dist = to.length();
      if (dist > 2.4) continue;
      const f = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
      if (to.normalize().dot(f) < 0.5) continue;
      return d.kick(this.game, this.game.player.pos, power);
    }
    for (const sw of this.secretWalls) {
      if (sw.broken) continue;
      const to = _v.subVectors(sw.pos, eye).setY(0);
      if (to.length() > 2.6) continue;
      if (to.normalize().dot(new THREE.Vector3(fwd.x, 0, fwd.z).normalize()) < 0.6) continue;
      sw.hit(this.game, sw.pos.clone().sub(to.multiplyScalar(1.2)).setY(this.world.floorAt(sw.pos.x, sw.pos.z) + 1.1), 1);
      return true;
    }
    return false;
  }

  onPropBroken(prop, pos, exploded = false) {
    this.game.loot.propDrops(prop, pos);
    this.game.stats.propsBroken++;
    void exploded;
  }

  stickProjectile(mesh, pos, dir) {
    if (!mesh) return;
    mesh.position.copy(pos).addScaledVector(dir, 0.15);
    this.stuck.push({ mesh, t: 0 });
    if (this.stuck.length > 40) this.stuck.shift().mesh.removeFromParent();
  }

  startChallenge(shrine) {
    const game = this.game;
    const room = this.world.rooms[shrine.roomId];
    this.challenge = { room, t: 0, waves: 3, wave: 0, shrine, spawned: [], next: game.time + 1.5 };
    for (const g of this.gates) if (g.roomId === room.id) g.close(game);
    this._closeRoom(room);
    game.ui.banner('TRIAL OF BLOOD', 'Survive three waves');
    game.audio.bossIntro();
  }

  _closeRoom(room) {
    // temporary gates on every entrance of the room
    const game = this.game;
    for (const e of this.d.entrances) {
      if ((e.roomId !== room.id && e.other !== room.id) || e.valid === false) continue;
      let gate = this.gates.find((g) => g.cx === e.cx && g.cy === e.cy);
      if (!gate) {
        const door = this.doors.find((d) => d.cx === e.cx && d.cy === e.cy);
        if (door && !door.open) continue;
        gate = new Gate(game, { cx: e.cx, cy: e.cy, axis: e.axis, roomId: room.id }, 3.4);
        this.gates.push(gate);
        this.updatables.push(gate);
      }
      gate.closedBy = room.id;
      gate.close(game);
    }
  }

  _openRoom(room) {
    for (const g of this.gates) if (g.roomId === room.id || g.closedBy === room.id) { g.closedBy = null; g.open(this.game); }
  }

  _roomAlive(roomId) {
    return this.enemies.some((e) => !e.dead && e.roomId === roomId);
  }

  _spawnWave(room, list, tag = null) {
    const game = this.game;
    for (const e of list) {
      const en = this.spawnEnemy(e.kind, e.x, e.z, { roomId: room.id, elite: e.elite, spawning: true, miniboss: e.miniboss, dropKey: e.dropKey });
      if (tag) en[tag] = true;
      if (e.miniboss) {
        game.ui.setBoss(en, true);
        game.ui.banner(en.displayName.toUpperCase(), 'A champion blocks your path');
      }
    }
    game.audio.gate(room ? new THREE.Vector3((room.cx + 0.5) * TILE, 1, (room.cy + 0.5) * TILE) : null, false);
  }

  _onEnterRoom(room) {
    const game = this.game;
    const st = this.roomState.get(room.id) || {};
    this.roomState.set(room.id, st);
    if (st.entered) return;
    // require being properly inside (not in the doorway)
    const p = game.player.pos;
    const cx = Math.floor(p.x / TILE), cz = Math.floor(p.z / TILE);
    if (cx <= room.x || cz <= room.y || cx >= room.x + room.w - 1 || cz >= room.y + room.h - 1) {
      if (room.type === 'arena' || room.type === 'miniboss' || room.type === 'boss') return;
    }
    st.entered = true;
    if (room.type === 'secret') game.stats.secretsVisited++;
    const name = ROOM_NAMES[room.type === 'secret' ? 'secret' : room.func];
    if (name && !['arena', 'miniboss', 'boss', 'start'].includes(room.type)) game.ui.location(name);
    if (room.type === 'arena' || room.type === 'miniboss') {
      const waves = this.pendingWaves.get(room.id) || [];
      if (!waves.length) return;
      st.waves = [];
      for (const e of waves) { (st.waves[e.wave - 1] = st.waves[e.wave - 1] || []).push(e); }
      st.wave = 0;
      st.active = true;
      st.nextCheck = game.time + 2.5;
      this._closeRoom(room);
      game.ui.banner(room.type === 'miniboss' ? 'CHAMPION’S DEN' : 'AMBUSH!', room.type === 'miniboss' ? 'Defeat the champion' : `Survive ${st.waves.length} waves`);
      game.schedule(0.8, () => this._spawnWave(room, st.waves[0]));
      game.audio.setMusic(true, 1);
    } else if (room.type === 'boss') {
      st.active = true;
      this._closeRoom(room);
      const bossKind = BOSS_ORDER[(game.floor - 1) % BOSS_ORDER.length];
      const c = new THREE.Vector3((room.cx + 0.5) * TILE, 0, (room.cy + 0.5) * TILE);
      // spawn at the far side from the player
      const dir = new THREE.Vector3(c.x - p.x, 0, c.z - p.z).normalize();
      const bx = c.x + dir.x * 3, bz = c.z + dir.z * 3;
      game.schedule(1.2, () => {
        const boss = this.spawnEnemy(bossKind, bx, bz, { boss: true, roomId: room.id, spawning: true, yaw: Math.atan2(-dir.x, -dir.z) });
        this.boss = boss;
        game.ui.setBoss(boss);
        game.ui.bossIntro(boss.def.name, boss.def.title);
        game.audio.bossIntro();
        game.audio.setMusic(true, 2);
      });
    }
  }

  // ------------------------------------------------------------ per-frame
  update(dt) {
    const game = this.game;
    const p = game.player;
    const world = this.world;
    world.updateFlow(p.pos.x, p.pos.z);
    world.reveal(p.pos.x, p.pos.z, 5);

    // room tracking
    const room = world.roomAt(p.pos.x, p.pos.z);
    if (room) this._onEnterRoom(room);
    this.currentRoom = room;

    for (const e of this.enemies) {
      if (e.dead) continue;
      const far = e.pos.distanceToSquared(p.pos) > 46 * 46;
      e.root.visible = !far;
      if (far && !e.alerted) continue;
      e.update(dt, game);
    }
    // remove dead enemies from the active list
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].dead) this.enemies.splice(i, 1);

    // ragdolls
    const obstacles = (pos, r, prev) => this.collideObstacles(pos, r, prev);
    const steps = dt > 1 / 45 ? 2 : 1;
    for (const rd of this.ragdolls) {
      for (let s = 0; s < steps; s++) rd.step(dt / steps, world, obstacles);
      rd.sync();
      if (rd.pool && rd.sleeping && !rd.pooled) {
        rd.pooled = true;
        const c = rd.pos[1];
        const fy = world.floorAt(c.x, c.z);
        if (Math.abs(c.y - fy) < 0.5) game.fx.decals.addGrowing(new THREE.Vector3(c.x, fy, c.z), rand(1.2, 1.9), new THREE.Color(rd.pool), 4);
      }
    }
    if (this.fadingCorpses) {
      for (let i = this.fadingCorpses.length - 1; i >= 0; i--) {
        const c = this.fadingCorpses[i];
        c.fading -= dt * 0.5;
        for (let k = 0; k < c.ragdoll.n; k++) { c.ragdoll.pos[k].y -= dt * 0.25; c.ragdoll.prev[k].copy(c.ragdoll.pos[k]); }
        c.ragdoll._synced = false;
        c.ragdoll.sleeping = false;
        c.ragdoll.sync();
        c.ragdoll.sleeping = true;
        if (c.fading <= 0) { c.ragdoll.dispose(); this.ragdolls.delete(c.ragdoll); this.fadingCorpses.splice(i, 1); }
      }
    }

    // melee targets list
    this.meleeTargets.length = 0;
    for (const e of this.enemies) if (!e.dead) this.meleeTargets.push(e);
    for (const c of this.corpses) this.meleeTargets.push(c);
    for (const pr of this.props) if (pr.body.alive) this.meleeTargets.push(pr);

    for (const u of this.updatables) u.update(dt);
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (!this.projectiles[i].update(dt)) this.projectiles.splice(i, 1);

    // flames & culling
    const t = game.time;
    const cam = game.renderer.camera.position;
    for (const f of this.flames) {
      const wp = f.matrixWorld.elements;
      const dx = wp[12] - cam.x, dz = wp[14] - cam.z;
      if (dx * dx + dz * dz < 900) M.animateFlame(f, t);
    }
    this._cullT = (this._cullT || 0) - dt;
    if (this._cullT <= 0) {
      this._cullT = 0.25;
      for (const m of this.cullables) {
        const c = m.userData.center, rr = m.userData.radius || 0;
        m.visible = (c ? Math.max(0, c.distanceTo(cam) - rr) : m.position.distanceTo(cam)) < 44;
      }
    }
    if (this.lava) this.lava.material.emissiveMap.offset.set(t * 0.02, t * 0.015);
    if (this.water) this.water.material.normalMap.offset.set(t * 0.02, t * 0.03);

    // room events
    for (const [roomId, st] of this.roomState) {
      if (!st.active) continue;
      const r = world.rooms[roomId];
      if (r.type === 'boss') {
        if (this.boss && this.boss.dead && !st.done) {
          st.done = true;
          st.active = false;
          this._openRoom(r);
          if (this.exit) game.schedule(1.5, () => this.exit.activate());
          game.onBossDefeated(this.boss);
        }
        continue;
      }
      if (!this._roomAlive(roomId) && game.time > (st.nextCheck || 0)) {
        st.wave++;
        if (st.waves && st.wave < st.waves.length) {
          st.nextCheck = game.time + 2;
          game.ui.toast(`Wave ${st.wave + 1}`, 'info');
          game.schedule(1.0, () => this._spawnWave(r, st.waves[st.wave]));
        } else {
          st.active = false;
          this._openRoom(r);
          if (r.hiddenChest) r.hiddenChest.reveal();
          game.onRoomCleared(r);
        }
      }
    }
    // challenge shrine
    if (this.challenge) {
      const ch = this.challenge;
      if (!this.enemies.some((e) => !e.dead && e.challenge) && game.time > (ch.next || 0)) {
        if (ch.wave < ch.waves) {
          ch.wave++;
          ch.next = game.time + 2.5;
          const list = [];
          const kinds = Object.keys(this.theme.enemies);
          const n = 3 + ch.wave + Math.floor(game.floor / 2);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const x = (ch.room.cx + 0.5) * TILE + Math.cos(a) * 4, z = (ch.room.cy + 0.5) * TILE + Math.sin(a) * 4;
            if (!world.navCell(Math.floor(x / TILE), Math.floor(z / TILE))) continue;
            list.push({ kind: kinds[Math.floor(Math.random() * kinds.length)], x, z, elite: ch.wave === ch.waves && i === 0 ? 1 : 0 });
          }
          game.schedule(0.5, () => this._spawnWave(ch.room, list, 'challenge'));
          game.ui.toast(`Trial wave ${ch.wave}/${ch.waves}`, 'info');
        } else {
          this._openRoom(ch.room);
          game.loot.dropGear(ch.shrine.pos.clone().setY(this.world.floorAt(ch.shrine.pos.x, ch.shrine.pos.z) + 1.5), 2);
          game.loot.dropRelic(ch.shrine.pos.clone().setY(this.world.floorAt(ch.shrine.pos.x, ch.shrine.pos.z) + 1.5), 1);
          game.ui.banner('TRIAL COMPLETE', 'The obelisk rewards your bloodshed');
          game.audio.victory();
          this.challenge = null;
        }
      }
    }
    // music intensity from awareness
    if (!this.boss || this.boss.dead) {
      const engaged = this.enemies.some((e) => !e.dead && e.alerted && e.pos.distanceToSquared(p.pos) < 400);
      game.audio.setMusic(true, engaged ? 1 : 0);
    }
  }

  dispose() {
    const game = this.game;
    for (const e of this.enemies) e.dispose();
    for (const c of this.corpses) c.ragdoll.dispose();
    if (this.fadingCorpses) for (const c of this.fadingCorpses) c.ragdoll.dispose();
    for (const rd of this.ragdolls) rd.dispose();
    for (const p of this.projectiles) p.die(false);
    for (const t of this.traps) t.dispose();
    for (const s of this.stuck) s.mesh.removeFromParent();
    // everything else hangs off the scene: rebuild scene children except persistent ones
    const scene = game.renderer.scene;
    const keep = new Set([...game.persistent, ...game.renderer.pool, game.renderer.camera]);
    const geos = new Set();
    for (const child of [...scene.children]) {
      if (keep.has(child)) continue;
      child.traverse((o) => { if (o.geometry && !o.isInstancedMesh) geos.add(o.geometry); });
      scene.remove(child);
    }
    // free GPU buffers (shared cached geometries simply re-upload on next use)
    for (const g of geos) g.dispose();
    game.renderer.clearLights();
    game.physics.clear();
    this.enemies.length = 0;
  }
}

export { F, C };
