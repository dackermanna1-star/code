// ProgressionSystem: Holy Mountains (shop, perks, refresher, healing, collapse, angry gods), perks,
// the start-area tutorial stone, and the Sampo at the bottom of the world.
import { Rng, hash3 } from '../core/rng';
import { Spawn } from '../world/generator';
import { HM, hmBandY, hmFloorY, NUM_LAYERS, BIOMES } from '../world/biomes';
import { DENSEROCK, GRAVEL } from '../world/materials';
import { generateWand, randomSpell, spellPrice, wandPrice } from '../magic/wandGen';
import { Wand } from '../magic/casting';
import { SPELLS } from '../magic/spells';
import { PERKS, PERK_BY_ID } from './perks';
import type { Run } from './run';
import type { Pickup } from '../entities/pickups';

export class Progression {
  perks = new Map<string, number>();
  angered = false;
  stevariKilled = 0;
  collapsed = new Set<number>();
  visited = new Set<number>();
  perkTaken = new Set<number>();
  private stevariSpawned = new Set<number>();
  private tutorial: { x: number; y: number; z: number } | null = null;
  won = false;

  constructor(private run: Run) {
    run.damage.hooks.text = run.damage.hooks.text ?? (() => {});
  }

  hasPerk(id: string): boolean {
    return (this.perks.get(id) ?? 0) > 0;
  }

  /** Index of the Holy Mountain room the player stands in, or -1. */
  hmRoomAt(x: number, y: number, z: number): number {
    for (let i = 0; i < NUM_LAYERS - 1; i++) {
      const band = hmBandY(i);
      if (y <= band.bottom || y > band.top) continue;
      const floor = hmFloorY(i);
      if (x >= HM.roomX0 - 1 && x < HM.roomX1 + 1 && z >= HM.roomZ0 - 1 && z < HM.roomZ1 + 1 && y >= floor - 1 && y < floor + HM.roomHeight) return i;
      // the entrance shaft counts as part of the sanctuary
      if (Math.hypot(x - HM.cx, z - HM.cz) < HM.shaftRadius + 1 && y >= floor) return i;
    }
    return -1;
  }

  canEditWands(): boolean {
    if (this.hasPerk('EDIT_WANDS_EVERYWHERE')) return true;
    const p = this.run.game.player.body;
    const i = this.hmRoomAt(p.x, p.y, p.z);
    return i >= 0 && !this.collapsed.has(i);
  }

  addTutorialStone(x: number, y: number, z: number): void {
    this.tutorial = { x, y, z };
  }

  nearbyText(): string {
    const p = this.run.game.player.body;
    if (this.tutorial && Math.hypot(p.x - this.tutorial.x, p.z - this.tutorial.z) < 26 && Math.abs(p.y - this.tutorial.y) < 30) {
      return 'WASD move · Space jump, hold to levitate · LMB cast · 1-4 wands, 5-8 flasks · E pick up · Tab inventory · F kick';
    }
    const room = this.hmRoomAt(p.x, p.y, p.z);
    if (room >= 0 && !this.collapsed.has(room) && Math.hypot(p.x - HM.exitX, p.z - HM.exitZ) < 9) return 'The way down. The mountain will close behind you.';
    return '';
  }

  // ------------------------------------------------------------------ holy mountain spawns
  handleSpawn(s: Spawn, r: Rng): void {
    const run = this.run;
    const layer = (s.data?.layer as number) ?? 0;
    const tier = Math.min(6, layer + 2);
    const layerRng = new Rng(hash3(run.game.opts.seed, layer, 0x5409));
    const wandShop = layerRng.chance(0.35);
    switch (s.kind) {
      case 'hm_shop': {
        const extra = this.perks.get('EXTRA_SHOP_ITEM') ?? 0;
        const idx = (s.data?.index as number) ?? 0;
        if (idx >= 5 + extra) return;
        if (wandShop && idx < 3) {
          const gw = generateWand(() => r.next(), tier);
          const w = new Wand(gw.stats, gw.spells, gw.alwaysCast);
          run.pickups.add('wand', s.x, s.y + 0.3, s.z, { wand: w, price: wandPrice(gw.stats), floating: true, baseY: s.y + 0.6, layer });
        } else {
          const id = randomSpell(() => r.next(), Math.min(6, tier));
          run.pickups.add('spell', s.x, s.y + 1.2, s.z, { spell: { id, uses: SPELLS[id].maxUses }, price: spellPrice(id, tier), baseY: s.y + 1.2, layer });
        }
        break;
      }
      case 'hm_perk': {
        const idx = ((s.data?.index as number) ?? 10) - 10;
        const count = 3 + (this.perks.get('EXTRA_PERK') ?? 0);
        if (idx >= count) return;
        const pool = PERKS.filter((p) => p.stackable || !this.hasPerk(p.id));
        const chosen: string[] = [];
        const pr = new Rng(hash3(run.game.opts.seed, layer, 0x9e4c));
        while (chosen.length < 3 && pool.length) {
          const p = pr.weighted(pool, (q) => q.weight);
          chosen.push(p.id);
          pool.splice(pool.indexOf(p), 1);
        }
        const id = chosen[idx % chosen.length];
        run.pickups.add('perk', s.x, s.y + 1, s.z, { perk: id, label: PERK_BY_ID[id].name, baseY: s.y + 1, layer });
        break;
      }
      case 'hm_refresher':
        run.pickups.add('refresher', s.x, s.y + 1.4, s.z, { baseY: s.y + 1.4, layer });
        break;
      case 'hm_heart':
        run.pickups.add('heart_full', s.x, s.y + 1.4, s.z, { baseY: s.y + 1.4, layer });
        break;
      case 'sampo':
        run.pickups.add('sampo', s.x, s.y, s.z, { baseY: s.y, layer: NUM_LAYERS - 1 });
        break;
      default:
        break;
    }
  }

  /** Interaction with progression pickups. Returns true if handled. */
  interact(pk: Pickup): boolean {
    const run = this.run;
    const p = run.game.player;
    switch (pk.kind) {
      case 'perk': {
        if (this.perkTaken.has(pk.layer)) return false;
        this.perkTaken.add(pk.layer);
        this.applyPerk(pk.perk!);
        run.hud.title(PERK_BY_ID[pk.perk!].name, PERK_BY_ID[pk.perk!].description);
        run.sound('perk_pick');
        // the other perks of this altar vanish
        for (const o of run.pickups.list) if (o.kind === 'perk' && o.layer === pk.layer) run.pickups.remove(o);
        return true;
      }
      case 'refresher': {
        let n = 0;
        for (const w of run.inv.wands) if (w) {
          w.refreshCharges();
          n++;
        }
        for (const s of run.inv.spells) if (s && SPELLS[s.id]) s.uses = SPELLS[s.id].maxUses;
        run.hud.log('Your spells have been refreshed', '#a0d0ff');
        run.sound('heal');
        run.pickups.remove(pk);
        return n >= 0;
      }
      case 'sampo': {
        this.won = true;
        run.pickups.remove(pk);
        run.sound('win');
        run.game.state = 'won';
        run.onWin?.();
        return true;
      }
    }
    void p;
    return false;
  }

  applyPerk(id: string): void {
    const run = this.run;
    const p = run.game.player;
    this.perks.set(id, (this.perks.get(id) ?? 0) + 1);
    switch (id) {
      case 'EXTRA_HP': {
        const add = p.maxHp * 0.5;
        p.maxHp += add;
        p.hp += add;
        break;
      }
      case 'PROTECTION_FIRE': case 'FREEZE_FIELD': case 'OIL_BLOOD':
        p.mult.fire = 0;
        if (id === 'OIL_BLOOD') p.bloodMat = 'oil';
        break;
      case 'PROTECTION_EXPLOSION': case 'EXPLODING_CORPSES': p.mult.explosion = 0; break;
      case 'PROTECTION_RADIOACTIVITY': p.mult.toxic = 0; break;
      case 'PROTECTION_ELECTRICITY': p.mult.electric = 0; break;
      case 'PROTECTION_MELEE': p.mult.melee = 0; break;
      case 'FASTER_LEVITATION': p.levSpeedMult += 0.75; break;
      case 'STRONG_LEVITATION': p.levitationMax *= 2; p.levitation = p.levitationMax; break;
      case 'MOVEMENT_FASTER': p.speedMult *= 1.4; break;
      case 'STAINLESS_ARMOUR': (p as unknown as { stainless: boolean }).stainless = true; break;
      case 'GOLD_IS_FOREVER':
        run.pickups.goldIsForever = true;
        for (const g of run.pickups.list) if (g.kind === 'gold') g.life = -1;
        break;
      case 'VAMPIRISM': p.maxHp *= 0.75; p.hp = Math.min(p.hp, p.maxHp); break;
      case 'GLASS_CANNON': p.maxHp = Math.min(p.maxHp, 50); p.hp = Math.min(p.hp, 50); break;
      case 'UNLIMITED_SPELLS':
        for (const w of run.inv.wands) if (w) for (const s of w.spells) if (s && s.id !== 'HEAL_BULLET') s.uses = -1;
        for (const s of run.inv.spells) if (s && s.id !== 'HEAL_BULLET') s.uses = -1;
        break;
      case 'NO_MORE_SHUFFLE':
        for (const w of run.inv.wands) if (w) {
          w.stats.shuffle = false;
          w.refreshDeck();
        }
        break;
      case 'PEACE_WITH_GODS':
        this.angered = false;
        break;
    }
  }

  /** Player projectile modifiers granted by perks. */
  projectileMods(): { crit: number; dmgMult: number; homing: number } {
    return {
      crit: (this.perks.get('CRITICAL_HIT') ?? 0) * 10,
      dmgMult: this.hasPerk('GLASS_CANNON') ? 5 : 1,
      homing: this.hasPerk('HOMING_SHOT') ? 0.4 : 0,
    };
  }

  tryExtraLife(): boolean {
    const n = this.perks.get('EXTRA_LIFE') ?? 0;
    if (n <= 0) return false;
    this.perks.set('EXTRA_LIFE', n - 1);
    const p = this.run.game.player;
    p.alive = true;
    p.hp = Math.min(p.maxHp, 100);
    p.status.onFire = 0;
    p.status.invuln = 0.5;
    this.run.hud.title('Extra Life', 'You cheat death');
    return true;
  }

  // ------------------------------------------------------------------ holy mountain rules
  holyBrickDamaged(x: number, y: number, z: number): void {
    const p = this.run.game.player.body;
    const room = this.hmRoomAt(p.x, p.y, p.z);
    const brickRoom = this.hmRoomAt(x, y, z);
    if ((room < 0 && brickRoom < 0) || this.hasPerk('PEACE_WITH_GODS')) return;
    const layer = room >= 0 ? room : brickRoom;
    if (this.collapsed.has(layer)) return; // damage after the collapse is safe
    if (!this.angered) {
      this.angered = true;
      this.run.hud.title('You have angered the gods', '');
      this.run.sound('gods_angry');
    }
    this.spawnStevari(layer);
  }

  private spawnStevari(layer: number): void {
    if (this.stevariSpawned.has(layer)) return;
    this.stevariSpawned.add(layer);
    const y = hmFloorY(layer) + 12;
    this.run.enemies.spawn('stevari', HM.cx + 0.5, y, HM.roomZ1 - 6, 0, new Rng(layer + 77));
  }

  private collapse(layer: number): void {
    if (this.collapsed.has(layer)) return;
    this.collapsed.add(layer);
    const g = this.run.game;
    const floor = hmFloorY(layer);
    // seal the exit shaft behind the player and drop rubble over the altar
    for (let y = floor - 6; y < floor - 2; y++)
      for (let dz = -6; dz <= 6; dz++)
        for (let dx = -6; dx <= 6; dx++) {
          if (Math.hypot(dx, dz) > 6.5) continue;
          g.world.set(HM.exitX + dx, y, HM.exitZ + dz, DENSEROCK);
        }
    for (let i = 0; i < 300; i++) {
      const x = HM.cx + Math.floor((Math.random() - 0.5) * 22), z = HM.roomZ1 - 4 - Math.floor(Math.random() * 6);
      g.particles.launch(GRAVEL, 0, x + 0.5, floor + HM.roomHeight - 1.5, z + 0.5, 0, -5, 0);
    }
    this.run.sound('collapse');
    this.run.hud.log('The Holy Mountain collapses behind you', '#c8b080');
    g.shake = 3;
  }

  tick(dt: number): void {
    const run = this.run;
    const p = run.game.player;
    const b = p.body;
    const room = this.hmRoomAt(b.x, b.y, b.z);
    if (room >= 0 && !this.visited.has(room)) {
      this.visited.add(room);
      run.sound('holy_mountain');
      run.hud.log('A Holy Mountain: a sanctuary. Here you may modify your wands.', '#e8d8a0');
      if (this.angered && !this.hasPerk('PEACE_WITH_GODS')) this.spawnStevari(room);
    }
    // passing the exit shaft collapses the mountain behind you
    for (let i = 0; i < NUM_LAYERS - 1; i++) {
      if (this.collapsed.has(i)) continue;
      const band = hmBandY(i);
      const floor = hmFloorY(i);
      if (b.y < floor - 8 && b.y > band.bottom - 30 && Math.hypot(b.x - HM.exitX, b.z - HM.exitZ) < 8) this.collapse(i);
    }
    // freeze field perk
    if (this.hasPerk('FREEZE_FIELD') && Math.random() < dt * 20) {
      const x = Math.floor(b.x + (Math.random() - 0.5) * 16), y = Math.floor(b.y + (Math.random() - 0.3) * 10), z = Math.floor(b.z + (Math.random() - 0.5) * 16);
      run.game.sim.heat(x, y, z, -300);
    }
    if (this.hasPerk('REPELLING_CAPE')) {
      const s = p.status;
      s.oily *= 0.98; s.bloody *= 0.98; s.slimy *= 0.98; s.toxic *= 0.98; s.wet *= 0.98;
    }
  }

  frame(dt: number): void {
    void dt;
  }

  describeLayer(i: number): string {
    return BIOMES[i]?.display ?? 'The Work';
  }
}
