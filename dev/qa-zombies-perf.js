// ---- setup
const g = window.game, mgr = g.zombies;
window.qa.god(true);
g.noSpawn = true;
const y = window.qa.ground(496.5, 512.5, 30);
window.qa.tp(496.5, y, 512.5, 0, 0); window.qa.setTime(22);
mgr.clearAll(); mgr.staticState.clear();
// mark static spawns consumed so we control the count
g.world.zombieSpawns.forEach((s, i) => mgr.staticState.set(i, 0));
const Z = (await import('/src/entities/Zombie.js')).Zombie.prototype;
const T = window.qa.T = { perceive: 0, navigate: 0, visual: 0, update: 0, sep: 0, findPath: 0, moveBody: 0, n: 0 };
const wrap = (obj, name, key) => { const o = obj[name]; obj[name] = function (...a) { const t = performance.now(); const r = o.apply(this, a); T[key] += performance.now() - t; return r; }; };
wrap(Z, 'perceive', 'perceive'); wrap(Z, 'update', 'update'); wrap(mgr, 'separation', 'sep');
window.qa.slowNav = [];
const on = Z.navigate;
Z.navigate = function (goal, dt) {
  const t = performance.now(); const pl = this.path; const r = on.call(this, goal, dt); const d = performance.now() - t; T.navigate += d;
  if (d > 4) window.qa.slowNav.push({ ms: +d.toFixed(1), from: [Math.floor(this.x), Math.floor(this.y + 0.2), Math.floor(this.z)], to: [Math.floor(goal.x), Math.floor((goal.y ?? this.y) + 0.2), Math.floor(goal.z)], canJump: this.cfg.canJump, st: this.state, newPath: this.path !== pl, len: this.path ? this.path.length : null, dGoal: +Math.hypot(goal.x - this.x, goal.z - this.z).toFixed(1), dy: +((goal.y ?? this.y) - this.y).toFixed(1), hunting: this.hunting, cars: (g.vehicles.nearColliders(this.x, this.z, 40) || []).length });
  return r;
};
const P = g.player;
let placed = 0;
for (let i = 0; placed < 80 && i < 2000; i++) {
  const a = Math.random() * 6.283, r = 8 + Math.random() * 60;
  const x = Math.floor(P.x + Math.cos(a) * r), z = Math.floor(P.z + Math.sin(a) * r);
  const gy = mgr.spawnGroundY ? mgr.spawnGroundY(x, z) : -1;
  if (gy < 0) continue;
  const zb = mgr.spawn(x + 0.5, gy, z + 0.5, { variant: i % 9 === 0 ? 'runner' : 'walker' });
  if (placed % 2 === 0) zb.startChase(false);
  zb.visual.update = ((u) => function (...a) { const t = performance.now(); u.apply(this, a); T.visual += performance.now() - t; })(zb.visual.update);
  placed++;
}
return { placed, alive: mgr.zombies.length };
// ---- sim
const g = window.game, T = window.qa.T;
for (const k in T) T[k] = 0;
window.qa.zt = { sum: 0, n: 0, max: 0 };
const frames = 300;
window.qa.sim(frames / 30, 1 / 30);
const zt = window.qa.zt;
const st = {};
for (const z of g.zombies.zombies) st[z.dead ? 'dead' : z.state] = (st[z.dead ? 'dead' : z.state] || 0) + 1;
const lods = {};
for (const z of g.zombies.zombies) lods[z.lod] = (lods[z.lod] || 0) + 1;
const out = { perFrameMs: +(zt.sum / zt.n).toFixed(2), maxMs: +zt.max.toFixed(1), n: g.zombies.zombies.length, st, lods };
for (const k of ['perceive', 'navigate', 'visual', 'update', 'sep']) out[k] = +(T[k] / frames).toFixed(3);
return out;
// ---- sim2
const g = window.game, T = window.qa.T;
for (const k in T) T[k] = 0;
window.qa.zt = { sum: 0, n: 0, max: 0 };
const frames = 300;
const per = [];
let lastSum = 0;
window.qa.sim(frames / 30, 1 / 30, () => { per.push(window.qa.zt.sum - lastSum); lastSum = window.qa.zt.sum; });
per.sort((a, b) => a - b);
const zt = window.qa.zt;
T.p50 = per[Math.floor(per.length * 0.5)] * frames; T.p95 = per[Math.floor(per.length * 0.95)] * frames; T.p99 = per[Math.floor(per.length * 0.99)] * frames;
const st = {};
for (const z of g.zombies.zombies) st[z.dead ? 'dead' : z.state] = (st[z.dead ? 'dead' : z.state] || 0) + 1;
const out = { perFrameMs: +(zt.sum / zt.n).toFixed(2), maxMs: +zt.max.toFixed(1), n: g.zombies.zombies.length, st };
for (const k of ['perceive', 'navigate', 'visual', 'update', 'sep', 'p50', 'p95', 'p99']) out[k] = +(T[k] / frames).toFixed(3);
out.slowNav = window.qa.slowNav.sort((a, b) => b.ms - a.ms).slice(0, 8);
out.slowN = window.qa.slowNav.length;
return out;
// ---- realtime
window.qa.zt = { sum: 0, n: 0, max: 0 };
// ---- wait 8000
const g = window.game, zt = window.qa.zt;
return { perFrameMs: +(zt.sum / zt.n).toFixed(2), maxMs: +zt.max.toFixed(1), frames: zt.n, fps: +g.fps.toFixed(1), update: +g.perf.update.toFixed(1), render: +g.perf.render.toFixed(1) };
// ---- shot perf
