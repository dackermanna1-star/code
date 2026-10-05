// Loot manager: drop tables, physical pickups (coins, consumables, gear with loot beams),
// chest/shop generation and item granting.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { rand, randInt } from '../core/math.js';
import { RigidBody } from '../physics/bodies.js';
import { rollGear, rollRarity, makeRelic, makeAbility, makeConsumable, itemValue, itemColor, makeWeapon } from '../items/loot.js';
import { RARITY, RELICS, CONSUMABLES, WEAPONS } from '../items/data.js';
import { makeWeaponModel, makeArmorModel, makeTrinketModel, makeRelicModel, makeTomeModel } from '../items/models.js';
import { makeCoin, makePotion, makeBomb, makeKey, makeHeart } from '../world/prop-meshes.js';
import { sharedAssets } from '../render/materials.js';

const _v = new THREE.Vector3();

export class LootManager {
  constructor(game) {
    this.game = game;
    this.rng = new RNG(game.seed + '-loot');
    this.coins = [];
    this.small = [];
    this.items = [];
  }

  clear() {
    for (const c of this.coins) c.mesh.removeFromParent();
    for (const s of this.small) s.mesh.removeFromParent();
    for (const it of this.items) this._removeItemVisual(it);
    this.coins.length = 0;
    this.small.length = 0;
    this.items.length = 0;
  }

  get luck() {
    return this.game.player ? this.game.player.stats.luck : 0;
  }

  rarityColor(item) {
    return new THREE.Color(itemColor(item));
  }

  itemName(item) {
    if (item.kind === 'consumable') return item.count > 1 ? `${CONSUMABLES[item.id].name} x${item.count}` : CONSUMABLES[item.id].name;
    return item.name;
  }

  makeDisplayMesh(item) {
    let m;
    switch (item.kind) {
      case 'weapon': {
        const w = makeWeaponModel(item);
        m = new THREE.Group();
        w.group.position.y = -w.length * 0.4;
        m.add(w.group);
        m.scale.setScalar(Math.min(1, 0.95 / w.length));
        break;
      }
      case 'armor': m = makeArmorModel(item); break;
      case 'trinket': m = makeTrinketModel(item); m.scale.setScalar(1.6); break;
      case 'relic': m = makeRelicModel(item); m.scale.setScalar(1.3); break;
      case 'ability': m = makeTomeModel(); m.rotation.x = 0.5; break;
      case 'consumable': {
        if (item.id === 'bomb') { m = new THREE.Group(); for (let i = 0; i < Math.min(3, item.count); i++) { const b = makeBomb(); b.position.set((i - 1) * 0.2, 0, 0); m.add(b); } }
        else m = makePotion(CONSUMABLES[item.id].color);
        m.scale.setScalar(1.4);
        break;
      }
      default: m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial());
    }
    return m;
  }

  // ------------------------------------------------------------ spawning pickups
  spawnGold(pos, amount) {
    const g = this.game;
    amount = Math.round(amount * (1 + g.player.stats.goldFind));
    if (amount <= 0) return;
    let left = amount;
    const n = Math.min(14, Math.max(1, Math.ceil(amount / 3)));
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? left : Math.max(1, Math.floor(amount / n));
      left -= v;
      const mesh = makeCoin();
      mesh.position.copy(pos);
      g.renderer.scene.add(mesh);
      this.coins.push({ mesh, pos: pos.clone(), vel: new THREE.Vector3(rand(-2.5, 2.5), rand(3, 6), rand(-2.5, 2.5)), value: v, t: 0, spin: rand(5, 15), rest: false });
      if (left <= 0) break;
    }
  }

  spawnSmall(type, pos, extra = {}) {
    const g = this.game;
    let mesh;
    if (type === 'potion') mesh = makePotion(0xff3344);
    else if (type === 'bomb') mesh = makeBomb();
    else if (type === 'key') mesh = makeKey();
    else if (type === 'heart') mesh = makeHeart();
    else if (type === 'elixir') mesh = makePotion(CONSUMABLES[extra.id].color);
    mesh.scale.multiplyScalar(type === 'key' ? 1.6 : 1.3);
    mesh.position.copy(pos);
    g.renderer.scene.add(mesh);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sharedAssets().tex.glow, color: { potion: 0xff4455, bomb: 0xffaa55, key: 0xffdd55, heart: 0xff3355, elixir: 0xaaccff }[type], transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(0.8);
    mesh.add(glow);
    this.small.push({ type, mesh, pos: pos.clone(), vel: new THREE.Vector3(rand(-2, 2), rand(3.5, 5.5), rand(-2, 2)), t: 0, extra, rest: false });
  }

  spawnItem(item, pos, vel = null) {
    const g = this.game;
    const it = { item, pos: pos.clone(), t: 0, body: null };
    const disp = this.makeDisplayMesh(item);
    const holder = new THREE.Group();
    holder.add(disp);
    g.renderer.scene.add(holder);
    it.holder = holder;
    it.disp = disp;
    if (item.kind === 'weapon') {
      // tumbling physical weapon
      const len = makeWeaponModelLength(item);
      disp.rotation.set(0, 0, 0);
      disp.position.set(0, 0, 0);
      disp.scale.setScalar(1);
      const body = new RigidBody({ type: 'box', hx: 0.07, hy: len * 0.35, hz: 0.05 }, { mass: 1, mesh: holder, restitution: 0.35, collideBodies: false, onImpact: (b, sp) => g.audio.clang(b.pos, 1.5, 0.2, Math.min(0.5, sp * 0.06)) });
      body.pos.copy(pos);
      body.vel.copy(vel || new THREE.Vector3(rand(-2, 2), rand(3, 5), rand(-2, 2)));
      body.ang.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
      g.physics.add(body);
      it.body = body;
    } else {
      it.vel = vel ? vel.clone() : new THREE.Vector3(rand(-1.5, 1.5), rand(3, 5), rand(-1.5, 1.5));
      it.floating = true;
      holder.position.copy(pos);
    }
    // loot beam
    const color = new THREE.Color(itemColor(item));
    const A = sharedAssets();
    if (item.rarity >= 1) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 + item.rarity * 0.1, blending: THREE.AdditiveBlending, depthWrite: false, map: beamTexture(), side: THREE.DoubleSide });
      const beam = new THREE.Group();
      for (let k = 0; k < 2; k++) {
        const pl = new THREE.Mesh(BEAM_GEO(), mat);
        pl.rotation.y = k * Math.PI / 2;
        beam.add(pl);
      }
      beam.scale.set(0.35 + item.rarity * 0.06, 1.6 + item.rarity * 0.7, 1);
      beam.userData.mat = mat;
      g.renderer.scene.add(beam);
      it.beam = beam;
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.tex.glow, color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(1.2);
    g.renderer.scene.add(glow);
    it.glow = glow;
    if (item.rarity >= 2) it.light = g.renderer.addDynamic(pos.clone(), color, 3 + item.rarity * 2, 5, 0);
    this.items.push(it);
    if (item.rarity >= 3) {
      g.audio.pickup(item.rarity);
      g.fx.magic(pos, color.getHex(), 30, 3);
    }
    return it;
  }

  _removeItemVisual(it) {
    it.holder.removeFromParent();
    if (it.beam) it.beam.removeFromParent();
    if (it.glow) it.glow.removeFromParent();
    if (it.body) it.body.alive = false;
    if (it.light) this.game.renderer.removeDynamic(it.light);
  }

  itemPos(it) {
    return it.body ? it.body.pos : it.holder.position;
  }

  // ------------------------------------------------------------ drop tables
  enemyDrops(enemy) {
    const g = this.game;
    const r = this.rng;
    const p = enemy.chestPos();
    p.y = Math.max(p.y, 0.6);
    const floor = g.floor;
    const luck = this.luck;
    const elite = enemy.elite || enemy.miniboss;
    const [g0, g1] = enemy.def.gold;
    let gold = randInt(g0, g1) * (1 + 0.3 * (floor - 1));
    if (elite) gold *= 2.5;
    if (enemy.boss) gold *= 1;
    this.spawnGold(p, gold);
    if (enemy.dropKey) this.spawnSmall('key', p.clone());
    if (enemy.boss) {
      this.spawnSmall('heart', p.clone(), { max: 15 });
      for (let i = 0; i < 2; i++) this.dropGear(p.clone(), i === 0 ? 3 : 2);
      this.dropRelic(p.clone(), 1);
      this.spawnSmall('potion', p.clone());
      return;
    }
    if (enemy.miniboss) {
      this.dropGear(p.clone(), 2);
      if (r.chance(0.5)) this.dropRelic(p.clone(), 0);
      this.spawnSmall('potion', p.clone());
      return;
    }
    if (r.chance(elite ? 0.35 : 0.075)) this.spawnSmall('potion', p.clone());
    if (r.chance(0.035)) this.spawnSmall('bomb', p.clone());
    if (r.chance(0.025)) this.spawnSmall('heart', p.clone());
    if (r.chance(0.018)) this.spawnSmall('elixir', p.clone(), { id: r.pick(['elixirRage', 'elixirIron', 'elixirSwift']) });
    if (r.chance((elite ? 0.45 : 0.035) + luck * 0.03)) this.dropGear(p.clone(), elite ? 1 : 0);
    if (elite && r.chance(0.1)) this.dropRelic(p.clone(), 0);
  }

  propDrops(prop, pos) {
    const r = this.rng;
    const p = pos.clone();
    p.y = Math.max(0.5, p.y);
    const k = prop.kind;
    if (k === 'pot') {
      if (r.chance(0.45)) this.spawnGold(p, randInt(1, 4));
      if (r.chance(0.06)) this.spawnSmall('potion', p);
      if (r.chance(0.025)) this.spawnSmall('bomb', p);
    } else if (k === 'crate' || k === 'barrel') {
      if (r.chance(0.35)) this.spawnGold(p, randInt(2, 6));
      if (r.chance(0.05)) this.spawnSmall('potion', p);
      if (r.chance(0.035)) this.spawnSmall('bomb', p);
      if (r.chance(0.025 + this.luck * 0.02)) this.dropGear(p, 0);
    }
  }

  dropGear(pos, minTier = 0) {
    const g = this.game;
    const item = rollGear(this.rng, g.floor, this.luck, minTier);
    g.stats.itemsFound++;
    return this.spawnItem(item, pos);
  }

  dropRelic(pos, minRarity = 0) {
    const g = this.game;
    const item = makeRelic(this.rng, minRarity, Object.keys(g.player.relics));
    g.stats.itemsFound++;
    return this.spawnItem(item, pos, new THREE.Vector3(0, 3, 0));
  }

  chestLoot(pos, tier, hasKey) {
    const g = this.game;
    const r = this.rng;
    const floor = g.floor;
    g.fx.magic(pos, [0xffffff, 0x66aaff, 0xcc66ff, 0xffaa22][tier] || 0xffffff, 20 + tier * 10, 3);
    this.spawnGold(pos, (8 + floor * 6) * (1 + tier * 0.8) * rand(0.8, 1.2));
    if (hasKey) this.spawnSmall('key', pos.clone());
    const gearCount = tier >= 2 ? 2 : 1;
    for (let i = 0; i < gearCount; i++) this.dropGear(pos.clone(), Math.min(4, tier + (i === 0 && tier >= 3 ? 1 : 0)));
    if (tier >= 2 || r.chance(tier === 1 ? 0.25 : 0.06)) this.dropRelic(pos.clone(), tier >= 2 ? 1 : 0);
    if (r.chance(0.3 + tier * 0.15)) this.spawnSmall(r.chance(0.6) ? 'potion' : 'bomb', pos.clone());
    if (tier >= 1 && r.chance(0.12)) this.spawnItem(makeAbility(r, g.player.ability && g.player.ability.id), pos.clone());
  }

  shopStock() {
    const g = this.game;
    const r = new RNG(g.seed + '-shop-' + g.floor);
    const out = [];
    const luck = this.luck + 0.3;
    const g1 = rollGear(r, g.floor, luck, 1);
    const g2 = rollGear(r, g.floor, luck, r.chance(0.3) ? 2 : 0, { weapon: 3, armor: 3, trinket: 3 });
    out.push({ item: g1, price: itemValue(g1) });
    out.push({ item: g2, price: itemValue(g2) });
    const relic = makeRelic(r, 0, Object.keys(g.player.relics));
    out.push({ item: relic, price: itemValue({ ...relic, level: g.floor }) });
    out.push({ item: makeConsumable('potion', 1), price: 25 + g.floor * 8 });
    if (r.chance(0.5)) out.push({ item: makeConsumable('bomb', 3), price: 30 + g.floor * 8 });
    else out.push({ item: makeConsumable(r.pick(['elixirRage', 'elixirIron', 'elixirSwift']), 1), price: 35 + g.floor * 10 });
    if (r.chance(0.35)) {
      const t = makeAbility(r, g.player.ability && g.player.ability.id);
      out.push({ item: t, price: itemValue({ ...t, level: g.floor }) });
    }
    return out;
  }

  // ------------------------------------------------------------ granting
  give(item, pos) {
    const g = this.game;
    const p = g.player;
    if (item.kind === 'relic') {
      p.addRelic(item.id);
      g.audio.relic();
      return;
    }
    if (item.kind === 'consumable') {
      if (item.id === 'potion') p.potions = Math.min(p.stats.potionCap + 3, p.potions + item.count);
      else if (item.id === 'bomb') p.addBombs(item.count);
      else for (let i = 0; i < item.count; i++) p.elixirs.push(item.id);
      g.audio.pickup(0);
      g.ui.toast(`+ ${this.itemName(item)}`, 'good');
      return;
    }
    const old = p.equip(item);
    g.audio.pickup(item.rarity);
    g.ui.toast(`Equipped ${item.name}`, 'r' + item.rarity);
    if (old) this.spawnItem(old, (pos || p.chestPos()).clone(), new THREE.Vector3(rand(-1, 1), 2.5, rand(-1, 1)));
  }

  // E-press on an item lying on the floor
  pickUpItem(it) {
    const g = this.game;
    const idx = this.items.indexOf(it);
    if (idx < 0) return;
    this.items.splice(idx, 1);
    this._removeItemVisual(it);
    g.player.vm.reach();
    const pos = this.itemPos(it).clone();
    this.give(it.item, pos);
  }

  // ------------------------------------------------------------ update
  update(dt) {
    const g = this.game;
    const p = g.player;
    const world = g.world;
    const eye = p.chestPos(new THREE.Vector3());
    eye.y -= 0.55;
    const magnet = 3.2 * p.stats.magnet;
    // coins
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.t += dt;
      const d = c.pos.distanceTo(eye);
      if (c.t > 0.45 && d < magnet && !p.dead) {
        _v.subVectors(eye, c.pos).normalize();
        c.vel.lerp(_v.multiplyScalar(12), 1 - Math.exp(-10 * dt));
        c.rest = false;
        if (d < 0.9) {
          p.gold += c.value;
          g.stats.gold += c.value;
          g.audio.coin(null);
          g.ui.goldPulse();
          c.mesh.removeFromParent();
          this.coins.splice(i, 1);
          continue;
        }
      } else if (!c.rest) {
        c.vel.y -= 18 * dt;
      }
      if (!c.rest) {
        c.pos.addScaledVector(c.vel, dt);
        const fy = world.floorAt(c.pos.x, c.pos.z) + 0.035;
        if (c.pos.y < fy && c.vel.y < 0 && d >= magnet) {
          c.pos.y = fy;
          if (Math.abs(c.vel.y) > 1.5) { c.vel.y *= -0.45; c.vel.x *= 0.6; c.vel.z *= 0.6; if (Math.random() < 0.4) g.audio.coin(c.pos); }
          else { c.rest = true; c.vel.set(0, 0, 0); }
        }
        if (world.solidAt(c.pos.x, c.pos.z)) { c.pos.x -= c.vel.x * dt * 2; c.pos.z -= c.vel.z * dt * 2; c.vel.x *= -0.5; c.vel.z *= -0.5; }
        c.mesh.rotation.x += c.spin * dt;
        c.mesh.rotation.z += c.spin * 0.7 * dt;
      } else {
        c.mesh.rotation.set(0, c.t * 2, 0);
      }
      c.mesh.position.copy(c.pos);
      if (c.t > 120) { c.mesh.removeFromParent(); this.coins.splice(i, 1); }
    }
    // small pickups
    for (let i = this.small.length - 1; i >= 0; i--) {
      const s = this.small[i];
      s.t += dt;
      const d = s.pos.distanceTo(eye);
      const can = this._canTake(s);
      if (s.t > 0.6 && d < magnet * 0.8 && can && !p.dead) {
        _v.subVectors(eye, s.pos).normalize();
        s.vel.lerp(_v.multiplyScalar(9), 1 - Math.exp(-8 * dt));
        s.rest = false;
        if (d < 0.95) {
          this._takeSmall(s);
          s.mesh.removeFromParent();
          this.small.splice(i, 1);
          continue;
        }
      }
      if (!s.rest) {
        s.vel.y -= 16 * dt;
        s.pos.addScaledVector(s.vel, dt);
        const fy = world.floorAt(s.pos.x, s.pos.z) + 0.35;
        if (s.pos.y < fy && s.vel.y < 0) {
          s.pos.y = fy;
          if (Math.abs(s.vel.y) > 1.5) { s.vel.y *= -0.35; s.vel.x *= 0.5; s.vel.z *= 0.5; } else { s.rest = true; s.vel.set(0, 0, 0); }
        }
        if (world.solidAt(s.pos.x, s.pos.z)) { s.pos.x -= s.vel.x * dt * 2; s.pos.z -= s.vel.z * dt * 2; s.vel.x *= -0.5; s.vel.z *= -0.5; }
      }
      s.mesh.position.copy(s.pos);
      s.mesh.rotation.y += dt * (s.rest ? 0.6 : 1.5);
    }
    // gear items
    for (const it of this.items) {
      it.t += dt;
      if (it.floating) {
        const h = it.holder.position;
        if (!it.landed) {
          it.vel.y -= 14 * dt;
          h.addScaledVector(it.vel, dt);
          const fy = world.floorAt(h.x, h.z) + 0.75;
          if (world.solidAt(h.x, h.z)) { h.x -= it.vel.x * dt * 2; h.z -= it.vel.z * dt * 2; it.vel.x *= -0.4; it.vel.z *= -0.4; }
          if (h.y < fy && it.vel.y < 0) { h.y = fy; it.landed = true; it.baseY = fy; }
        } else h.y = it.baseY + Math.sin(it.t * 1.6) * 0.04;
        it.disp.rotation.y += dt * 0.8;
        if (it.disp.userData.spin) for (const s of it.disp.userData.spin) s.rotation.y += dt * 2;
      }
      const pos = this.itemPos(it);
      const fy = world.floorAt(pos.x, pos.z);
      if (it.beam) {
        it.beam.position.set(pos.x, fy + it.beam.scale.y * 0.5, pos.z);
        it.beam.userData.mat.opacity = (0.35 + it.item.rarity * 0.1) * (0.8 + Math.sin(it.t * 3) * 0.2);
      }
      it.glow.position.set(pos.x, Math.max(fy + 0.15, pos.y - 0.2), pos.z);
      if (it.light) it.light.pos.set(pos.x, fy + 0.8, pos.z);
      if (it.item.rarity >= 3 && Math.random() < 0.15) g.fx.spark(new THREE.Vector3(pos.x + rand(-0.3, 0.3), fy + 0.1, pos.z + rand(-0.3, 0.3)), new THREE.Vector3(0, rand(1, 2.5), 0), itemColor(it.item), 1.2, 0.07, { grav: -0.3, floor: false });
    }
  }

  _canTake(s) {
    const p = this.game.player;
    if (s.type === 'potion') return p.potions < p.stats.potionCap;
    if (s.type === 'bomb') return p.bombs < 9;
    return true;
  }

  _takeSmall(s) {
    const g = this.game;
    const p = g.player;
    switch (s.type) {
      case 'potion': p.potions++; g.ui.toast('+1 Health Potion', 'good'); break;
      case 'bomb': p.addBombs(1); g.ui.toast('+1 Bomb', 'good'); break;
      case 'key': p.keys++; g.ui.toast('Found a Key!', 'good'); g.audio.unlock(null); break;
      case 'heart': {
        const max = s.extra.max || 0;
        if (max) { p.hpMod += max; p.refreshStats(); g.ui.toast(`Heart Container: +${max} max health`, 'good'); }
        p.heal(25 + max);
        break;
      }
      case 'elixir': p.elixirs.push(s.extra.id); g.ui.toast(`+ ${CONSUMABLES[s.extra.id].name} [3]`, 'good'); break;
      default:
    }
    g.audio.pickup(0);
  }
}

const BEAM_GEO = (() => {
  let geo = null;
  return () => geo || (geo = new THREE.PlaneGeometry(1, 1));
})();

let _beamTex = null;
function beamTexture() {
  if (_beamTex) return _beamTex;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const x = c.getContext('2d');
  const img = x.createImageData(32, 128);
  for (let j = 0; j < 128; j++) for (let i = 0; i < 32; i++) {
    const u = Math.abs(i / 31 - 0.5) * 2;
    const v = j / 127; // 0 top .. 1 bottom
    const a = Math.pow(1 - u, 2.2) * Math.pow(v, 1.6);
    const k = (j * 32 + i) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
    img.data[k + 3] = Math.round(a * 255);
  }
  x.putImageData(img, 0, 0);
  _beamTex = new THREE.CanvasTexture(c);
  return _beamTex;
}

function makeWeaponModelLength(item) {
  return { sword: 0.96, dagger: 0.4, axe: 0.72, mace: 0.66, spear: 1.62, greatsword: 1.42, hammer: 0.96 }[item.base] || 0.8;
}

export { RARITY, RELICS, WEAPONS, makeWeapon, rollRarity };
