// ---- setup
const g = window.game, Q = window.qaArena;
const A = Q.setup(44);
window.qa.god(true);
g.noSpawn = true;
g.zombies.clearAll();
window.qa.setTime(12);
g.weatherSys.set('clear', true);
// run a scenario: build() then sim until done() or timeout; returns metrics
window.qa.scn = (name, o) => {
  g.zombies.clearAll(); g.zombies.corpses = [];
  Q.wipe(44, 7);
  window.qa.hits = 0;
  g.player.crouching = false; g.player.flashlightOn = false;
  window.qa.setTime(o.hour ?? 12);
  o.build?.();
  const zs = o.spawn();
  const t0 = performance.now();
  const ev = [];
  let firstChase = null, firstHit = null, done = null;
  const states = new Set();
  window.qa.sim(o.secs || 20, 1 / 30, (t) => {
    if (o.hold) o.hold();
    for (const z of zs) { states.add(z.state); if (firstChase === null && (z.state === 'chase' || z.state === 'attack')) firstChase = +t.toFixed(2); }
    if (firstHit === null && window.qa.hits > 0) firstHit = +t.toFixed(2);
    if (o.done && o.done(t)) { done = +t.toFixed(2); return false; }
  });
  const z = zs[0];
  const P = g.player;
  return { name, P: [+(P.x - Q.A.x).toFixed(1), +(P.y - Q.A.y).toFixed(1), +(P.z - Q.A.z).toFixed(1)], dist: z ? +Math.hypot(z.x - P.x, z.z - P.z).toFixed(2) : null, firstChase, firstHit, hits: window.qa.hits, done, states: [...states].join(','), end: z ? { ...Q.rel(z), st: z.state, aw: +z.awareness.toFixed(2), stuck: +z.stuckT.toFixed(1), path: z.path ? z.path.length : null } : null, ms: Math.round(performance.now() - t0), ...(o.extra ? o.extra() : {}) };
};
window.qa.hold = () => { const P = g.player; P.vx = P.vz = 0; };
return A;
// ---- sight-day-front-20
const Q = window.qaArena;
return window.qa.scn('sight-day-front-20', { secs: 10, spawn: () => { Q.tp(22, 0, 32, Math.PI); return [Q.z(22.5, 0, 12.5, 'walker', { yaw: 0, state: 'idle' })]; } });
// ---- sight-day-front-30
const Q = window.qaArena;
return window.qa.scn('sight-day-front-30', { secs: 10, spawn: () => { Q.tp(22, 0, 42, Math.PI); return [Q.z(22.5, 0, 12.5, 'walker', { yaw: 0, state: 'idle' })]; } });
// ---- sight-day-behind-12
const Q = window.qaArena;
return window.qa.scn('sight-day-behind-12', { secs: 10, spawn: () => { Q.tp(22, 0, 24, Math.PI); return [Q.z(22.5, 0, 12.5, 'walker', { yaw: Math.PI, state: 'idle' })]; } });
// ---- sight-day-crouch-14
const Q = window.qaArena, g = window.game;
return window.qa.scn('sight-day-crouch-14', { secs: 10, hold: () => { g.player.crouching = true; }, spawn: () => { Q.tp(22, 0, 26.5, Math.PI); return [Q.z(22.5, 0, 12.5, 'walker', { yaw: 0, state: 'idle' })]; } });
// ---- sight-night-12
const Q = window.qaArena;
return window.qa.scn('sight-night-12', { hour: 0, secs: 10, spawn: () => { Q.tp(22, 0, 24.5, Math.PI); return [Q.z(22.5, 0, 12.5, 'walker', { yaw: 0, state: 'idle' })]; }, extra: () => ({ light: window.game.playerLight }) });
// ---- sight-night-6
const Q = window.qaArena;
return window.qa.scn('sight-night-6', { hour: 0, secs: 10, spawn: () => { Q.tp(22, 0, 18.5, Math.PI); return [Q.z(22.5, 0, 12.5, 'walker', { yaw: 0, state: 'idle' })]; }, extra: () => ({ light: window.game.playerLight }) });
// ---- sight-night-flashlight-25
const Q = window.qaArena, g = window.game;
return window.qa.scn('sight-night-flash-25', { hour: 0, secs: 10, hold: () => { g.player.flashlightOn = true; g.player.inv.addItem && 0; }, spawn: () => { Q.tp(22, 0, 37.5, Math.PI); return [Q.z(22.5, 0, 12.5, 'walker', { yaw: 0, state: 'idle' })]; }, extra: () => ({ light: g.playerLight }) });
// ---- hear-gunshot-40
const Q = window.qaArena, g = window.game;
return window.qa.scn('hear-gunshot-40', { secs: 30, spawn: () => { Q.tp(4, 0, 4, 0); const z = Q.z(36.5, 0, 36.5, 'walker', { yaw: Math.PI, state: 'idle' }); g.noise(g.player.x, g.player.y + 1.5, g.player.z, 60, 'gunshot', true); return [z]; }, done: () => window.game.zombies.zombies[0].distP < 3 });
// ---- chase-open-10
const Q = window.qaArena, g = window.game;
return window.qa.scn('chase-open-10', { secs: 15, spawn: () => { Q.tp(22, 0, 22, Math.PI); const z = Q.z(22.5, 0, 12.5, 'walker', { yaw: 0 }); z.startChase(false); return [z]; } });
// ---- runner-open-25
const Q = window.qaArena, g = window.game;
return window.qa.scn('runner-open-25', { secs: 10, spawn: () => { Q.tp(22, 0, 37, Math.PI); const z = Q.z(22.5, 0, 12.5, 'runner', { yaw: 0 }); z.startChase(false); return [z]; } });
// ---- through-wall
const Q = window.qaArena, g = window.game;
return window.qa.scn('through-wall', { secs: 10, build: () => { Q.box(10, 0, 20, 34, 2, 20, 'wall_white'); }, spawn: () => { Q.tp(22.5, 0, 21.4, Math.PI); const z = Q.z(22.5, 0, 19.4, 'walker', { yaw: 0 }); z.startChase(false); return [z]; } });
// ---- door-room
const Q = window.qaArena, g = window.game;
let door;
return window.qa.scn('door-room', { secs: 60, build: () => { Q.room(18, 18, 26, 26, 3); door = Q.door(22, 18, 2, 'door_wood'); }, spawn: () => { Q.tp(22.5, 0, 23.5, Math.PI); const z = Q.z(22.5, 0, 10.5, 'walker', { yaw: 0 }); z.startChase(false); return [z]; }, done: () => window.qa.hits > 0, extra: () => ({ doorHp: door.hp, doorGone: !window.__SOLID[window.game.world.get(door.x, door.y, door.z)] }) });
// ---- window-room
const Q = window.qaArena, g = window.game;
return window.qa.scn('window-room', { secs: 60, build: () => { Q.room(18, 18, 26, 26, 3); Q.door(22, 26, 0, 'door_metal'); Q.set(22, 0, 18, 'glass'); Q.set(22, 1, 18, 'glass'); }, spawn: () => { Q.tp(22.5, 0, 23.5, Math.PI); const z = Q.z(22.5, 0, 10.5, 'walker', { yaw: 0 }); z.startChase(false); return [z]; }, done: () => window.qa.hits > 0 });
// ---- stairs-up
const Q = window.qaArena, g = window.game;
return window.qa.scn('stairs-up', { secs: 40, build: () => {
  // platform 3 high at z 26..32, stairs climbing toward +z from z=23 (facing 2 => climbed walking +Z? facing 0 climbed toward -Z)
  Q.box(18, 0, 26, 26, 2, 32, 'planks_oak');
  Q.set(22, 0, 23, 'stairs_wood', 2); Q.set(22, 1, 24, 'stairs_wood', 2); Q.set(22, 2, 25, 'stairs_wood', 2);
  Q.set(22, 0, 24, 'planks_oak'); Q.set(22, 0, 25, 'planks_oak'); Q.set(22, 1, 25, 'planks_oak');
}, spawn: () => { Q.tp(22.5, 3, 30.5, Math.PI); const z = Q.z(22.5, 0, 12.5, 'walker', { yaw: 0 }); z.startChase(false); return [z]; }, done: () => window.qa.hits > 0 });
// ---- stairs-up-crawler
const Q = window.qaArena, g = window.game;
return window.qa.scn('stairs-up-crawler', { secs: 60, build: () => {
  Q.box(18, 0, 26, 26, 2, 32, 'planks_oak');
  Q.set(22, 0, 23, 'stairs_wood', 2); Q.set(22, 1, 24, 'stairs_wood', 2); Q.set(22, 2, 25, 'stairs_wood', 2);
  Q.set(22, 0, 24, 'planks_oak'); Q.set(22, 0, 25, 'planks_oak'); Q.set(22, 1, 25, 'planks_oak');
}, spawn: () => { Q.tp(22.5, 3, 28.5, Math.PI); const z = Q.z(22.5, 0, 17.5, 'crawler', { yaw: 0 }); z.startChase(false); return [z]; }, done: () => window.qa.hits > 0 });
// ---- fence-gap
const Q = window.qaArena, g = window.game;
return window.qa.scn('fence-gap', { secs: 40, build: () => { for (let x = 2; x <= 40; x++) if (x < 34 || x > 35) { Q.set(x, 0, 20, 'fence_chainlink'); Q.set(x, 1, 20, 'fence_chainlink'); } }, spawn: () => { Q.tp(22.5, 0, 24.5, Math.PI); const z = Q.z(22.5, 0, 12.5, 'walker', { yaw: 0 }); z.startChase(false); return [z]; }, done: () => window.qa.hits > 0 });
// ---- low-fence-hop
const Q = window.qaArena, g = window.game;
return window.qa.scn('low-fence-hop', { secs: 30, build: () => { for (let x = 2; x <= 40; x++) Q.set(x, 0, 20, 'fence_picket'); }, spawn: () => { Q.tp(22.5, 0, 24.5, Math.PI); const z = Q.z(22.5, 0, 12.5, 'walker', { yaw: 0 }); z.startChase(false); return [z]; }, done: () => window.qa.hits > 0 });
// ---- car-block
const Q = window.qaArena, g = window.game;
let car;
return window.qa.scn('car-block', { secs: 30, build: () => {
  car = { x: Q.A.x + 22.5, z: Q.A.z + 19, cos: Math.cos(Math.PI / 2), sin: Math.sin(Math.PI / 2), hx: 1.3, hz: 7.8, bottom: Q.A.y, top: Q.A.y + 3.8, r: Math.hypot(1.3, 7.8) };
  g.vehicles.colliders.push(car);
}, spawn: () => { Q.tp(22.5, 0, 23.5, Math.PI); const z = Q.z(22.5, 0, 12.5, 'walker', { yaw: 0 }); z.startChase(false); return [z]; }, done: () => window.qa.hits > 0, extra: () => { g.vehicles.colliders.splice(g.vehicles.colliders.indexOf(car), 1); return {}; } });
// ---- step-1-block
const Q = window.qaArena, g = window.game;
return window.qa.scn('step-1-block', { secs: 30, build: () => { Q.box(2, 0, 20, 40, 0, 40, 'planks_oak'); }, spawn: () => { Q.tp(22.5, 1, 24.5, Math.PI); const z = Q.z(22.5, 0, 12.5, 'walker', { yaw: 0 }); z.startChase(false); return [z]; }, done: () => window.qa.hits > 0 });
