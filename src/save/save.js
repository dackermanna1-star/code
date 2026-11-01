// Save / load the whole simulation to browser storage (versioned JSON).
const KEY = 'gravelmouth.save.';
export const SAVE_VERSION = 3;

export function serialize(game) {
  const sim = game.sim;
  const chars = sim.characters.map((c) => ({
    id: c.id, x: +c.x.toFixed(2), z: +c.z.toFixed(2), yaw: +c.yaw.toFixed(2), hp: c.hp, stamina: c.stamina, energy: c.energy, hunger: c.hunger,
    ramen: c.ramen, respect: c.respect, stats: c.stats, job: c.job ?? null, flags: { solitaryCell: c.flags.solitaryCell || null, solitaryUntil: c.flags.solitaryUntil || 0 },
  }));
  const items = [...sim.items.items.values()].map((it) => ({
    type: it.type, x: +it.x.toFixed(2), y: +it.y.toFixed(2), z: +it.z.toFixed(2), holder: it.holder ? it.holder.id : null, pocketOf: it.pocketOf ? it.pocketOf.id : null,
    durability: it.durability, filled: it.filled, home: it.home,
  }));
  return {
    v: SAVE_VERSION, savedAt: Date.now(), clock: sim.clock.total, seed: game.seed,
    playerSetup: game.playerSetup,
    chars, items,
    opinions: [...sim.social.op.entries()], followers: [...sim.social.followers],
    rules: [...sim.rules.record.entries()].map(([k, r]) => [k, { heat: r.heat, crimes: r.crimes, warrants: [...r.warrants], arrests: r.arrests }]),
    favors: sim.economy.favors, units: [...sim.economy.units.entries()],
    progression: { sentence: sim.progression.sentence, behavior: sim.progression.behavior, stats: sim.progression.stats },
    fences: sim.world.fences.filter((f) => f.cutState).map((f) => f.id),
  };
}
export function apply(game, data) {
  const sim = game.sim;
  sim.clock.total = data.clock;
  for (const s of data.chars) {
    const c = sim.byId.get(s.id);
    if (!c) continue;
    if (c.spot) c.leaveSpot(true);
    c.place(s.x, s.z, s.yaw);
    Object.assign(c, { hp: s.hp, stamina: s.stamina, energy: s.energy, hunger: s.hunger, ramen: s.ramen, respect: s.respect });
    c.stats = { ...c.stats, ...s.stats };
    if (s.job != null) c.job = s.job;
    c.flags.solitaryCell = s.flags.solitaryCell; c.flags.solitaryUntil = s.flags.solitaryUntil;
    c.held = null; c.pockets = [];
    c.setState('free');
  }
  for (const it of [...sim.items.items.values()]) sim.items.remove(it);
  for (const s of data.items) {
    const it = sim.items.spawn(s.type, s.x, s.y, s.z, { home: s.home, filled: s.filled });
    it.durability = s.durability;
    if (s.holder && sim.byId.get(s.holder)) { const c = sim.byId.get(s.holder); it.holder = c; c.held = it; }
    else if (s.pocketOf && sim.byId.get(s.pocketOf)) { const c = sim.byId.get(s.pocketOf); it.pocketOf = c; c.pockets.push(it); }
  }
  sim.social.op = new Map(data.opinions);
  sim.social.followers = new Set(data.followers);
  sim.rules.record = new Map(data.rules.map(([k, r]) => [k, { heat: r.heat, crimes: r.crimes, warrants: new Set(r.warrants), arrests: r.arrests }]));
  sim.economy.favors = data.favors; sim.economy.units = new Map(data.units);
  Object.assign(sim.progression, data.progression);
  for (const id of data.fences) sim.world.cutFence(id);
  for (const b of sim.brains.values()) { b.goal = null; b.fight = null; b.path = null; }
  for (const c of sim.characters) if (c.flags.solitaryCell) { const room = sim.world.roomById.get(c.flags.solitaryCell); const door = room && sim.world.doorById.get(room.doorId); if (door) door.locked = true; }
}
export function saveSlot(game, slot) {
  const data = serialize(game);
  try { localStorage.setItem(KEY + slot, JSON.stringify(data)); return true; } catch (e) { console.warn('save failed', e); return false; }
}
export function loadSlot(slot) {
  try { const s = localStorage.getItem(KEY + slot); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function slotInfo(slot) {
  const d = loadSlot(slot);
  if (!d) return null;
  const day = Math.floor((d.clock - 360) / 1440) + 1;
  return { day, savedAt: d.savedAt, name: d.playerSetup?.name || 'Inmate', daysLeft: d.progression?.sentence?.daysLeft };
}
export function deleteSlot(slot) { try { localStorage.removeItem(KEY + slot); } catch { /* ignore */ } }
