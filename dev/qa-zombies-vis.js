// ---- setup
const g = window.game, Q = window.qaArena;
const A = Q.setup(44);
window.qa.god(true);
g.noSpawn = true;
g.zombies.clearAll();
window.qa.setTime(13);
g.weatherSys.set('clear', true);
Q.wipe(44, 7);
Q.room(14, 6, 20, 12, 3); Q.door(17, 12, 0, 'door_wood');
Q.tp(22.5, 0, 26, 0);
g.player.pitch = -0.12;
const zs = window.qa.vzs = {};
zs.chase = Q.z(22.5, 0, 19.5, 'walker', { yaw: 0 }); zs.chase.startChase(false);
zs.runner = Q.z(25.5, 0, 14.5, 'runner', { yaw: 0 }); zs.runner.startChase(false);
zs.down = Q.z(19.5, 0, 20.5, 'walker', { yaw: 0 });
zs.crawl = Q.z(27, 0, 20, 'crawler', { yaw: -0.5 });
zs.dead = Q.z(24.5, 0, 21.5, 'brute', { yaw: 0 });
zs.bash = Q.z(17.5, 0, 13.6, 'walker', { yaw: Math.PI });
window.qa.sim(0.6, 1 / 30);
const V = zs.chase.visual.root.position.constructor;
zs.down.takeDamage(10, { part: 'torso', dir: new V(0, 0, -1), knockdown: 9 });
zs.dead.takeDamage(2000, { part: 'torso', dir: new V(1, 0, 0.2).normalize(), knockback: 1 });
zs.bash.huntT = g.clock; zs.bash.bashTarget = { x: Q.A.x + 17, y: Q.A.y, z: Q.A.z + 12 }; zs.bash.setState('bash'); zs.bash.bashT = 5;
window.qa.sim(0.9, 1 / 30, () => { zs.chase.cooldownT = 9; zs.runner.cooldownT = 9; });
// freeze the scene for the screenshot
g.zombies.update = () => {};
return Object.fromEntries(Object.entries(zs).map(([k, z]) => [k, z.dead ? 'dead' : z.state + '/' + z.anim.state]));
// ---- settle 6000
// ---- shot poses
// ---- night
const g = window.game;
window.qa.setTime(23.2);
g.player.flashlightOn = true;
// ---- settle 3000
// ---- shot poses-night
