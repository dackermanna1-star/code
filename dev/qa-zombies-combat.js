// ---- setup
const g = window.game, Q = window.qaArena;
const A = Q.setup(44);
window.qa.god(true);
g.noSpawn = true;
g.zombies.clearAll();
window.qa.setTime(12);
g.weatherSys.set('clear', true);
window.qa.trace = (z, secs, extra) => {
  const tr = []; let last = '';
  window.qa.sim(secs, 1 / 30, (t) => {
    const s = z.dead ? 'dead' : z.state + '/' + z.anim.state + '/' + z.visual.anim?.state;
    if (s !== last) { tr.push(t.toFixed(2) + ' ' + s + (extra ? ' ' + extra(z) : '')); last = s; }
  });
  return tr;
};
return A;
// ---- knockdown-timeline
const Q = window.qaArena, g = window.game;
g.zombies.clearAll();
Q.tp(22.5, 0, 30, Math.PI);
const z = Q.z(22.5, 0, 26, 'walker', { yaw: 0 }); z.startChase(false);
window.qa.sim(0.5, 1 / 30);
z.takeDamage(20, { part: 'torso', dir: new (z.visual.root.position.constructor)(0, 0, -1), knockback: 1, knockdown: 5 });
return window.qa.trace(z, 7);
// ---- stagger-timeline
const Q = window.qaArena, g = window.game;
g.zombies.clearAll();
Q.tp(22.5, 0, 30, Math.PI);
const z = Q.z(22.5, 0, 26, 'walker', { yaw: 0 }); z.startChase(false);
window.qa.sim(0.5, 1 / 30);
z.takeDamage(20, { part: 'torso', dir: new (z.visual.root.position.constructor)(0, 0, -1), knockback: 0.5, stagger: 1 });
return window.qa.trace(z, 2.5);
// ---- double-knockdown (hit again while getting up)
const Q = window.qaArena, g = window.game;
g.zombies.clearAll();
Q.tp(22.5, 0, 30, Math.PI);
const z = Q.z(22.5, 0, 26, 'walker', { yaw: 0 }); z.startChase(false);
window.qa.sim(0.5, 1 / 30);
const V = z.visual.root.position.constructor;
z.takeDamage(10, { part: 'torso', dir: new V(0, 0, -1), knockdown: 5 });
const tr = window.qa.trace(z, 3.6);
z.takeDamage(10, { part: 'torso', dir: new V(0, 0, -1), knockdown: 5 });
tr.push('--- hit again at ' + z.state + ' ' + z.stateT.toFixed(2));
return tr.concat(window.qa.trace(z, 5));
// ---- cripple
const Q = window.qaArena, g = window.game;
g.zombies.clearAll();
Q.tp(22.5, 0, 34, Math.PI);
const z = Q.z(22.5, 0, 26, 'walker', { yaw: 0 }); z.startChase(false);
window.qa.sim(0.3, 1 / 30);
const V = z.visual.root.position.constructor;
let r;
for (let i = 0; i < 6 && !z.crippled && !z.dead; i++) r = z.takeDamage(16, { part: 'legL', dir: new V(0, 0, -1) });
const tr = window.qa.trace(z, 4, (z) => 'h=' + z.h + ' v=' + Math.hypot(z.vx, z.vz).toFixed(2));
return { crippled: z.crippled, hp: z.hp.toFixed(0), legs: [z.visual.hasPart('legL'), z.visual.hasPart('legR')], crawlMode: z.visual.anim?.crawlMode, tr };
// ---- kill-ragdoll
const Q = window.qaArena, g = window.game;
g.zombies.clearAll();
Q.tp(22.5, 0, 34, Math.PI);
const z = Q.z(22.5, 0, 26, 'walker', { yaw: 0 }); z.startChase(false);
window.qa.sim(0.5, 1 / 30);
const V = z.visual.root.position.constructor;
z.takeDamage(500, { part: 'head', dir: new V(0, 0, -1), knockback: 1, force: 2 });
const pos = [];
let settledAt = null;
window.qa.sim(8, 1 / 30, (t) => { const p = z.visual.getBodyPosition(new V()); pos.push([t, p.x, p.y, p.z]); if (settledAt === null && !z.ragdolling) settledAt = t; });
// jitter after settle: max displacement over the last 2 s
const tail = pos.filter((p) => p[0] > 6);
let jit = 0;
for (const p of tail) jit = Math.max(jit, Math.hypot(p[1] - tail[0][1], p[2] - tail[0][2], p[3] - tail[0][3]));
const loot = g.zombies.corpseLoot(z);
const near = g.nearbyCorpseDescs ? 'n/a' : 'n/a';
const pp = z.visual.getBodyPosition(new V());
return { dead: z.dead, settledAt, jitter: +jit.toFixed(4), pelvisY: +(pp.y - Q.A.y).toFixed(2), corpses: g.zombies.corpses.length, loot: loot.filter(Boolean).map((s) => s.id), lootStable: g.zombies.corpseLoot(z) === loot };
// ---- screamer
const Q = window.qaArena, g = window.game;
g.zombies.clearAll();
Q.tp(22.5, 0, 34, Math.PI);
const s = Q.z(22.5, 0, 20, 'screamer', { yaw: 0, state: 'idle' });
const others = [Q.z(5, 0, 5, 'walker', { yaw: 0, state: 'idle' }), Q.z(40, 0, 5, 'walker', { yaw: Math.PI, state: 'idle' })];
s.startChase(true);
const tr = window.qa.trace(s, 3);
return { tr, others: others.map((o) => o.state + ' tp=' + o.targetPlayer + ' tgt=' + (o.target ? (o.target.x - Q.A.x).toFixed(1) + ',' + (o.target.z - Q.A.z).toFixed(1) : '-')) };
// ---- bloater
const Q = window.qaArena, g = window.game;
g.zombies.clearAll();
Q.tp(22.5, 0, 24, Math.PI);
window.qa.god(false);
const P = g.player; const hp0 = P.health; const sick0 = P.sickness;
const b = Q.z(22.5, 0, 22, 'bloater', { yaw: 0 });
const w = Q.z(23.5, 0, 21, 'walker', { yaw: 0 });
const V = b.visual.root.position.constructor;
b.takeDamage(1000, { part: 'torso', dir: new V(0, 0, -1) });
const r = { hp0, hp1: P.health, sick: P.sickness - sick0, walkerHp: w.hp.toFixed(0), walkerState: w.state };
P.health = hp0;
window.qa.god(true);
return r;
// ---- brute-door
const Q = window.qaArena, g = window.game;
g.zombies.clearAll();
Q.wipe(44, 7);
Q.room(18, 18, 26, 26, 3); const door = Q.door(22, 18, 2, 'door_wood');
Q.tp(22.5, 0, 23.5, Math.PI);
const z = Q.z(22.5, 0, 14.5, 'brute', { yaw: 0 }); z.startChase(false);
let broke = null;
window.qa.sim(40, 1 / 30, (t) => { if (broke === null && !window.__SOLID[g.world.get(door.x, door.y, door.z)]) { broke = t; return false; } });
return { broke };
// ---- barricaded-door-walkers
const Q = window.qaArena, g = window.game;
g.zombies.clearAll();
Q.wipe(44, 7);
Q.room(18, 18, 26, 26, 3); const door = Q.door(22, 18, 2, 'door_wood');
door.barricade = 300; g.world.syncDoor(door);
Q.tp(22.5, 0, 23.5, Math.PI);
const zs = [Q.z(22.5, 0, 14.5, 'walker'), Q.z(21.5, 0, 13.5, 'walker'), Q.z(23.5, 0, 12.5, 'walker')];
for (const z of zs) z.startChase(false);
let broke = null, barr = null;
const states = {};
window.qa.sim(120, 1 / 30, (t) => { for (const z of zs) states[z.state] = (states[z.state] || 0) + 1; if (barr === null && door.barricade <= 0) barr = t; if (broke === null && !window.__SOLID[g.world.get(door.x, door.y, door.z)]) { broke = t; return false; } });
return { barr, broke, states };
// ---- runner-speed
const Q = window.qaArena, g = window.game;
g.zombies.clearAll();
Q.tp(22.5, 0, 42, Math.PI);
const z = Q.z(22.5, 0, 2, 'runner', { yaw: 0 }); z.startChase(false);
let maxV = 0;
window.qa.sim(5, 1 / 30, (t) => { if (t > 1.5) maxV = Math.max(maxV, Math.hypot(z.vx, z.vz)); });
return { maxV: +maxV.toFixed(2), chase: z.chaseSpeed.toFixed(2), anim: z.anim.state };
