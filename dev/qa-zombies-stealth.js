// ---- setup
const g = window.game, Q = window.qaArena;
const A = Q.setup(44);
window.qa.god(true);
g.noSpawn = true;
g.zombies.clearAll();
window.qa.setTime(12);
g.weatherSys.set('clear', true);
window.qa.keys = (ks, on) => { for (const k of ks) on ? g.input.keys.add(k) : g.input.keys.delete(k); };
window.qa.st = (name, o) => {
  g.zombies.clearAll(); Q.wipe(44, 6); o.build?.();
  o.place();
  const z = o.zombie();
  window.qa.keys(o.keys || [], true);
  let first = null, firstInv = null;
  window.qa.sim(o.secs || 8, 1 / 30, (t) => { if (o.each) o.each(t, z); if (first === null && (z.state === 'chase' || z.state === 'attack')) first = +t.toFixed(2); if (firstInv === null && z.state === 'investigate') firstInv = +t.toFixed(2); });
  window.qa.keys(o.keys || [], false);
  return { name, chase: first, investigate: firstInv, end: z.state, hidden: g.playerHidden, crouch: g.player.crouching };
};
return A;
// ---- bush-crouch-10
const Q = window.qaArena;
return window.qa.st('bush-crouch-10', { build: () => Q.set(22, 0, 22, 'bush'), place: () => Q.tp(22.5, 0, 22.5, 0), zombie: () => Q.z(22.5, 0, 12.5, 'walker', { yaw: 0, state: 'idle' }), keys: ['KeyC'], each: (t, z) => { z.stateT = Math.min(z.stateT, 1); } });
// ---- bush-standing-10
const Q = window.qaArena;
return window.qa.st('bush-standing-10', { build: () => Q.set(22, 0, 22, 'bush'), place: () => Q.tp(22.5, 0, 22.5, 0), zombie: () => Q.z(22.5, 0, 12.5, 'walker', { yaw: 0, state: 'idle' }), each: (t, z) => { z.stateT = Math.min(z.stateT, 1); } });
// ---- sneak-behind-3 (crouch-walk past the back of a zombie)
const Q = window.qaArena, g = window.game;
return window.qa.st('sneak-behind-3', { place: () => Q.tp(16, 0, 9.5, -Math.PI / 2), zombie: () => Q.z(22.5, 0, 12.5, 'walker', { yaw: 0, state: 'idle' }), keys: ['KeyC', 'KeyW'], secs: 7, each: (t, z) => { z.stateT = Math.min(z.stateT, 1); z.yaw = 0; } });
// ---- sprint-behind-8 (noise)
const Q = window.qaArena, g = window.game;
return window.qa.st('sprint-behind-8', { place: () => Q.tp(10, 0, 4.5, -Math.PI / 2), zombie: () => Q.z(22.5, 0, 12.5, 'walker', { yaw: 0, state: 'idle' }), keys: ['ShiftLeft', 'KeyW'], secs: 5, each: (t, z) => { z.stateT = Math.min(z.stateT, 1); } });
// ---- walk-behind-8 (quieter)
const Q = window.qaArena, g = window.game;
return window.qa.st('walk-behind-8', { place: () => Q.tp(10, 0, 4.5, -Math.PI / 2), zombie: () => Q.z(22.5, 0, 12.5, 'walker', { yaw: 0, state: 'idle' }), keys: ['KeyW'], secs: 5, each: (t, z) => { z.stateT = Math.min(z.stateT, 1); } });
// ---- door-open-noise (player opens a door 6 m from a zombie behind a wall)
const Q = window.qaArena, g = window.game;
return window.qa.st('door-noise', { build: () => { Q.box(10, 0, 18, 34, 2, 18, 'wall_white'); }, place: () => Q.tp(22.5, 0, 20, 0), zombie: () => { const z = Q.z(22.5, 0, 14.5, 'walker', { yaw: 0, state: 'idle' }); g.noise(g.player.x, g.player.y, g.player.z, 5, 'door', true); return z; }, secs: 3, each: (t, z) => { z.stateT = Math.min(z.stateT, 1); } });
// ---- glass-noise (player breaks a window 15 m from a zombie behind a wall)
const Q = window.qaArena, g = window.game;
return window.qa.st('glass-noise', { build: () => { Q.box(10, 0, 18, 34, 2, 18, 'wall_white'); }, place: () => Q.tp(22.5, 0, 20, 0), zombie: () => { const z = Q.z(22.5, 0, 4.5, 'walker', { yaw: 0, state: 'idle' }); g.noise(g.player.x, g.player.y + 1, g.player.z, 22, 'glass', true); return z; }, secs: 3, each: (t, z) => { z.stateT = Math.min(z.stateT, 1); } });
