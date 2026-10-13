import { describe, expect, it } from 'vitest';
import { addStack, makeStack } from '../src/shared/sim/inventory';
import { B } from '../src/shared/world/blocks';
import { chunkKey } from '../src/shared/world/chunk';
import { RecordingLink } from '../src/sim/link';
import { Corpse } from '../src/sim/systems/entities';
import type { Game } from '../src/sim/game';
import { GROUND, OY, build, flatStorage, give, hold, makeGame, placeTotem, settle, spawnPlayer, teleport, tickUntil, ticks } from './helpers';

/** Build a small, varied world state and save it. */
async function populate() {
  const st = flatStorage();
  const game = makeGame({}, st);
  const { p } = spawnPlayer(game, 'Saver', 8.5, 8.5);
  // pieces: a stone foundation, a damaged wood wall, a doorway with an open, locked metal door
  build(game, p, { type: 'foundation', i: 4, j: 1, oy: OY }, 2);
  build(game, p, { type: 'foundation', i: 5, j: 1, oy: OY }, 2);
  const wall = build(game, p, { type: 'wall', i: 4, j: 1, oy: OY, side: 'n' }, 1);
  game.building.damagePiece(wall, 40, 'melee', null); // 250 - 24
  build(game, p, { type: 'doorway', i: 4, j: 1, oy: OY, side: 'w' }, 2);
  const door = build(game, p, { type: 'door', i: 4, j: 1, oy: OY, side: 'w' }, 1);
  game.building.toggleDoor(p, door); // open it
  door.lock = { code: '4321', owner: 'Saver', authorized: ['Saver'] };
  // deployables: a stocked totem and a box with items
  teleport(game, p, 22.5, OY + 1, 6.5);
  settle(game, p);
  const totem = placeTotem(game, p, 18, OY, 6);
  addStack(totem.container!, makeStack('stone', 333));
  game.world.set(21, OY + 1, 5, B.small_box);
  const box = game.tiles.create('small_box', 21, OY + 1, 5, 'Saver');
  box.container!.slots[3] = makeStack('metal_frag', 77);
  box.container!.slots[7] = makeStack('stone_hatchet');
  box.container!.slots[7]!.dur = 123;
  // edited terrain: a placed block and a dug hole (in a chunk far from the base)
  game.world.set(-20, GROUND + 1, -20, B.cobblestone);
  game.world.set(-22, GROUND, -22, B.air);
  // a corpse with loot
  const corpse = new Corpse(game.allocId(), 'Victim', 2.5, OY, 2.5, game.now + 500);
  corpse.container.slots[0] = makeStack('scrap', 42);
  game.entities.add(corpse);
  // the player: inventory, vitals, blueprints, crafting
  p.inv.clear();
  give(p, 'wood', 1234);
  hold(p, 'pipe_pistol', 1, 2);
  p.held()!.ammo = 5;
  p.inv.wear.slots[1] = makeStack('burlap_shirt');
  p.vitals.hp = 42.5;
  p.vitals.cal = 321;
  p.vitals.hyd = 99;
  p.vitals.bleed = 3;
  p.blueprints.add('metal_hatchet');
  ticks(game, 30);
  await game.save();
  await game.save();
  return { st, game, p, totem, box, door, wall };
}

function reload(st: ReturnType<typeof flatStorage>): Game {
  return makeGame({}, st);
}

describe('save & load round trip', () => {
  it('restores building pieces with tier, HP, stability and blocks', async () => {
    const { st, game } = await populate();
    const g2 = reload(st);
    expect(g2.building.pieces.size).toBe(game.building.pieces.size);
    for (const a of game.building.pieces.values()) {
      const b = g2.building.pieces.get(a.id)!;
      expect(b, `piece ${a.id}`).toBeDefined();
      expect(b.socket).toEqual(a.socket);
      expect([b.type, b.tier, b.hp, b.maxHp, b.owner]).toEqual([a.type, a.tier, a.hp, a.maxHp, a.owner]);
      expect(b.stability).toBeCloseTo(a.stability);
      g2.world.ensureSyncAt(b.geom.cells[0][0], b.geom.cells[0][2]);
      for (const [x, y, z] of b.geom.cells) expect(g2.world.getBlock(x, y, z)).toBe(game.world.getBlock(x, y, z));
    }
  });

  it('restores door state and locks', async () => {
    const { st, door } = await populate();
    const g2 = reload(st);
    const d2 = g2.building.pieces.get(door.id)!;
    expect(d2.open).toBe(true);
    expect(d2.lock).toEqual({ code: '4321', owner: 'Saver', authorized: ['Saver'] });
    g2.world.ensureSyncAt(16, 6);
    expect(g2.world.getBlock(16, OY + 1, 6)).toBe(B.door_metal_open);
  });

  it('restores deployables, their contents and the totem claim', async () => {
    const { st, totem, box } = await populate();
    const g2 = reload(st);
    const t2 = g2.tiles.at(totem.x, totem.y, totem.z)!;
    expect(t2.kind).toBe('claim_totem');
    expect(t2.auth).toEqual(['Saver']);
    expect(t2.container!.toJSON()).toEqual(totem.container!.toJSON());
    expect(g2.building.buildingOfTotem(t2.key)).not.toBeNull();
    const b2 = g2.tiles.at(box.x, box.y, box.z)!;
    expect(b2.container!.toJSON()).toEqual(box.container!.toJSON());
    expect(b2.container!.get(7)).toEqual({ id: 'stone_hatchet', n: 1, dur: 123 });
    // the claim is enforced again (the first join restores the saved character)
    expect(g2.join(new RecordingLink(), 'x').name).toBe('Saver');
    const { p: stranger } = spawnPlayer(g2, 'Stranger', 10.5, 6.5);
    expect(stranger.name).toBe('Stranger');
    expect(g2.building.isBlocked(stranger, 14, OY, 6)).toBe(true);
  });

  it('restores the player: position, inventory, vitals, blueprints', async () => {
    const { st, p } = await populate();
    const g2 = reload(st);
    const p2 = g2.join(new RecordingLink(), 'SomeoneElse');
    expect(p2.id).toBe(p.id);
    expect(p2.name).toBe('Saver');
    expect([p2.x, p2.y, p2.z]).toEqual([p.x, p.y, p.z]);
    expect(p2.inv.toJSON()).toEqual(p.inv.toJSON());
    expect(p2.held()?.ammo).toBe(5);
    expect(p2.vitals).toEqual(p.vitals);
    expect([...p2.blueprints]).toEqual(['metal_hatchet']);
    tickUntil(g2, () => p2.ready, 100);
    expect(p2.alive).toBe(true);
    // standing on the foundation, not stuck or falling
    ticks(g2, 20);
    expect(p2.y).toBeCloseTo(p.y, 3);
  });

  it('restores edited terrain and leaves unedited chunks to the generator', async () => {
    const { st } = await populate();
    const g2 = reload(st);
    g2.world.ensureSyncAt(-20, -20);
    g2.world.ensureSyncAt(-22, -22);
    expect(g2.world.getBlock(-20, GROUND + 1, -20)).toBe(B.cobblestone);
    expect(g2.world.getBlock(-22, GROUND, -22)).toBe(B.air);
    // only chunks the game touched were written
    expect(st.chunks.has(chunkKey(-2, -2))).toBe(true);
    expect(st.chunks.has(chunkKey(40, 40))).toBe(false);
  });

  it('restores world time, corpses and id allocation', async () => {
    const { st, game } = await populate();
    const g2 = reload(st);
    expect(g2.time).toBeCloseTo(game.time, 6);
    const c2 = [...g2.entities.corpses].find((c) => c.name === 'Victim')!;
    expect(c2).toBeDefined();
    expect(c2.container.get(0)).toEqual({ id: 'scrap', n: 42 });
    const ids = [...game.building.pieces.keys(), ...[...game.entities.corpses].map((c) => c.id)];
    expect(g2.allocId()).toBeGreaterThan(Math.max(...ids));
  });

  it('a second save after more changes persists them', async () => {
    const { st, game, p } = await populate();
    build(game, p, { type: 'wall', i: 5, j: 1, oy: OY, side: 'n' }, 1);
    game.world.set(-30, GROUND + 1, -30, B.bricks);
    await game.save();
    const g2 = reload(st);
    expect(g2.building.pieces.size).toBe(game.building.pieces.size);
    g2.world.ensureSyncAt(-30, -30);
    expect(g2.world.getBlock(-30, GROUND + 1, -30)).toBe(B.bricks);
  });

  it('save/load is stable: loading and saving again does not change anything', async () => {
    const { st } = await populate();
    const g2 = reload(st);
    g2.join(new RecordingLink(), 'x');
    const before = st.objects.map((o) => `${o.kind}:${o.id}`).sort();
    await g2.save();
    const after = st.objects.map((o) => `${o.kind}:${o.id}`).sort();
    // tiles are re-keyed with fresh negative ids, so compare kinds/counts
    const kinds = (l: string[]) => l.map((s) => s.split(':')[0]).sort();
    expect(kinds(after)).toEqual(kinds(before));
    const g3 = reload(st);
    expect(g3.building.pieces.size).toBe(g2.building.pieces.size);
    expect(g3.tiles.tiles.size).toBe(g2.tiles.tiles.size);
  });
});

describe('corrupted saves', () => {
  it('skips records that are not valid JSON and loads the rest', async () => {
    const { st, game } = await populate();
    st.objects.push({ id: 900001, kind: 'piece', data: '{"s":{"type":"wall","i":1' });
    st.objects.push({ id: 900002, kind: 'tile', data: 'not json at all' });
    st.objects.push({ id: 900003, kind: 'corpse', data: '{"name":"x","slots":null}' });
    st.objects.push({ id: 900004, kind: 'mystery', data: '{}' });
    const g2 = reload(st);
    expect(g2.building.pieces.size).toBe(game.building.pieces.size);
    expect(g2.tiles.tiles.size).toBe(game.tiles.tiles.size);
    expect(g2.entities.corpses.size).toBe(1);
    const p2 = g2.join(new RecordingLink(), 'x');
    expect(p2.name).toBe('Saver');
  });

  it('skips pieces with an invalid socket', async () => {
    const { st, game } = await populate();
    st.objects.push({ id: 900010, kind: 'piece', data: JSON.stringify({ s: { type: 'wall', i: 'a', j: 0, oy: OY, side: 'w' }, tier: 0, hp: 10, owner: 'x', placedAt: 0, lastDamaged: 0 }) });
    st.objects.push({ id: 900011, kind: 'piece', data: JSON.stringify({ s: { type: 'turret', i: 0, j: 0, oy: OY }, tier: 0, hp: 10, owner: 'x', placedAt: 0, lastDamaged: 0 }) });
    const g2 = reload(st);
    expect(g2.building.pieces.size).toBe(game.building.pieces.size);
  });

  it('a corrupt chunk record is rejected loudly rather than producing garbage terrain', async () => {
    const { st } = await populate();
    st.chunks.set(chunkKey(-2, -2), { rev: 9, data: Uint8Array.from([1, 2, 3]) });
    const g2 = reload(st);
    expect(() => g2.world.ensureSync(-2, -2)).toThrow(/RLE/);
  });

  // BUG: a structurally invalid piece record (valid JSON, but no socket `s`, or a tier outside
  // 0..4) crashes the Game constructor: Building.rebuildAll sorts by `a.d.s.oy` and addPiece reads
  // TIERS[tier].hp outside the per-record try/catch in Game.load (src/sim/game.ts load(),
  // src/sim/systems/building.ts rebuildAll/addPiece). One bad record makes the whole world unloadable.
  it.fails('skips a piece record with no socket or an out-of-range tier instead of crashing', async () => {
    const { st, game } = await populate();
    st.objects.push({ id: 900020, kind: 'piece', data: JSON.stringify({ tier: 0, hp: 10, owner: 'x', placedAt: 0, lastDamaged: 0 }) });
    st.objects.push({ id: 900021, kind: 'piece', data: JSON.stringify({ s: { type: 'foundation', i: -6, j: -6, oy: OY }, tier: 9, hp: 10, owner: 'x', placedAt: 0, lastDamaged: 0 }) });
    const g2 = reload(st);
    expect(g2.building.pieces.size).toBe(game.building.pieces.size);
  });

  // BUG: a player record without its `save` payload is accepted by Game.load and then makes
  // Game.join throw (Player.load reads d.x of undefined; src/sim/player.ts load / src/sim/game.ts join),
  // so the world cannot be entered at all.
  it.fails('a player record with missing data does not prevent joining', async () => {
    const { st } = await populate();
    st.objects = st.objects.filter((o) => o.kind !== 'player');
    st.objects.push({ id: 900030, kind: 'player', data: JSON.stringify({ name: 'Saver' }) });
    const g2 = reload(st);
    const p2 = g2.join(new RecordingLink(), 'Saver');
    expect(p2.alive).toBe(true);
  });
});

describe('autosave & concurrent saves', () => {
  // BUG (reported by lead, fixed on main): Game.lastSave starts at 0 and is only reset by start(),
  // so the first tick of a game driven by tick() (tests, headless runs) immediately autosaves
  // (src/sim/game.ts tick(): `Date.now() - this.lastSave > saveIntervalSec * 1000`).
  it.fails('does not autosave on the very first tick', () => {
    const st = flatStorage();
    const game = makeGame({ saveIntervalSec: 60 }, st);
    game.tick();
    expect(st.saves).toBe(0);
  });

  // BUG (reported by lead, fixed on main): save() while a save is in flight returns the in-flight
  // promise, whose snapshot predates later changes, so a caller awaiting "its" save silently
  // loses the newer state (src/sim/game.ts save(): `if (this.saving) return this.saving`).
  it.fails('a save requested while another is in flight still persists the latest state', async () => {
    const st = flatStorage();
    const game = makeGame({}, st);
    build(game, null, { type: 'foundation', i: 0, j: 0, oy: OY });
    const first = game.save();
    build(game, null, { type: 'foundation', i: 1, j: 0, oy: OY });
    await game.save();
    await first;
    expect(reload(st).building.pieces.size).toBe(2);
  });

  it('awaiting a completed save before the next one persists everything (workaround)', async () => {
    const st = flatStorage();
    const game = makeGame({}, st);
    build(game, null, { type: 'foundation', i: 0, j: 0, oy: OY });
    await game.save();
    build(game, null, { type: 'foundation', i: 1, j: 0, oy: OY });
    await game.save();
    expect(reload(st).building.pieces.size).toBe(2);
  });

  it('a failing storage keeps the previous save intact and reports the error', async () => {
    const st = flatStorage();
    const game = makeGame({}, st);
    const { link } = spawnPlayer(game, 'Unlucky', 8.5, 8.5);
    build(game, null, { type: 'foundation', i: 0, j: 0, oy: OY });
    await game.save();
    const saves = st.saves;
    const objects = st.objects.slice();
    st.save = async () => { throw new Error('disk full'); };
    build(game, null, { type: 'foundation', i: 1, j: 0, oy: OY });
    await game.save();
    expect(st.saves).toBe(saves);
    expect(st.objects).toEqual(objects);
    expect(link.of('msg').some((m) => m.kind === 'error' && /Save failed/.test(m.text))).toBe(true);
  });
});
