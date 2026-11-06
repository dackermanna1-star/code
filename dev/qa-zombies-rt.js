// ---- setup (real-time combat: guns, melee, shove, stomp through the real Combat code)
const g = window.game, Q = window.qaArena;
const A = Q.setup(44);
window.qa.god(true);
g.noSpawn = true;
g.zombies.clearAll();
window.qa.setTime(12);
g.weatherSys.set('clear', true);
Q.wipe(44, 7);
const { createItem } = await import('/src/items/items.js');
const P = g.player;
P.inv.hotbar[0] = createItem('pistol_m9', { ammo: 15 });
P.inv.hotbar[1] = createItem('fire_axe');
P.inv.addItem(createItem('ammo_9mm', { count: 60 }));
P.inv.selected = 0; P.inv.changed();
Q.tp(22.5, 0, 34, 0);
const zs = window.qa.rz = [];
for (let i = 0; i < 6; i++) { const z = Q.z(14 + i * 3, 0, 14 + (i % 2) * 3, i === 5 ? 'brute' : i === 4 ? 'runner' : 'walker', { yaw: 0 }); z.startChase(false); zs.push(z); }
window.qa.aim = (z, part = 'head') => {
  const pt = z.visual.getPartPosition(part, P.forward(new (z.visual.root.position.constructor)()));
  const cam = g.renderer.camera.position;
  const dx = pt.x - cam.x, dy = pt.y - cam.y, dz = pt.z - cam.z;
  P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
};
return 'ok';
// ---- wait 2500
// ---- shoot-legs
const g = window.game, P = g.player;
const z = window.qa.rz[0];
const res = [];
for (let i = 0; i < 5 && !z.dead && !z.crippled; i++) { window.qa.aim(z, 'legL'); g.renderer.camera.position.set(P.x, P.y + P.eye, P.z); g.combat.cooldown = 0; g.combat.fireGun(P.inv.selectedStack, g.combat.def); res.push(z.state + ' hp=' + z.hp.toFixed(0) + ' leg=' + z.legDamage.toFixed(0) + ' crip=' + z.crippled); }
return res;
// ---- wait 1500
// ---- shot rt-crippled
// ---- shoot-heads
const g = window.game, P = g.player;
const out = [];
for (const z of window.qa.rz.slice(1, 4)) {
  for (let i = 0; i < 4 && !z.dead; i++) { window.qa.aim(z, 'head'); g.renderer.camera.position.set(P.x, P.y + P.eye, P.z); g.combat.cooldown = 0; if (!P.inv.selectedStack.ammo) P.inv.selectedStack.ammo = 15; g.combat.fireGun(P.inv.selectedStack, g.combat.def); }
  out.push(z.dead ? 'dead headless=' + !z.visual.hasPart('head') : z.state + ' hp=' + z.hp.toFixed(0));
}
return out;
// ---- wait 3000
// ---- shot rt-headshots
// ---- melee
const g = window.game, P = g.player;
P.inv.selected = 1; P.inv.changed();
return window.qa.rz.map((z) => (z.dead ? 'dead' : z.state) + '@' + Math.hypot(z.x - P.x, z.z - P.z).toFixed(1));
// ---- wait 4000
// ---- swing
const g = window.game, P = g.player;
const out = [];
for (let k = 0; k < 6; k++) {
  const alive = window.qa.rz.filter((z) => !z.dead).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
  if (!alive.length) break;
  const z = alive[0];
  if (Math.hypot(z.x - P.x, z.z - P.z) > 2.2) { out.push('far ' + Math.hypot(z.x - P.x, z.z - P.z).toFixed(1)); break; }
  window.qa.aim(z, 'torso');
  g.combat.cooldown = 0; g.combat.swing(P.inv.selectedStack, g.combat.def, true);
  await new Promise((r) => setTimeout(r, 900));
  out.push(z.variant + ':' + (z.dead ? 'dead' : z.state) + ' hp=' + z.hp.toFixed(0));
}
return out;
// ---- wait 2500
// ---- shot rt-melee
// ---- status
const g = window.game, P = g.player;
return { hits: window.qa.hits || 0, zs: window.qa.rz.map((z) => z.variant + ':' + (z.dead ? 'dead' : z.state) + ' hp=' + z.hp.toFixed(0)), corpses: g.zombies.corpses.length, kills: P.kills, fps: g.fps.toFixed(0), perf: g.perf };
