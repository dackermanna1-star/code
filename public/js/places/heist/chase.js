// The getaway: your driver takes the van out of the alley, up 88th Avenue,
// along 458th Street and onto the highway north to the tunnel, with the
// police on your tail. You (and your gunman) shoot out of the open back
// doors at the cruisers, a roadblock and the police helicopter. Lose them in
// the tunnel, split the money: the results screen. Also the failure screen.
import * as THREE from 'three';
import { S } from './state.js';
import { buildSedan, buildHelicopter, flashLights } from './models.js';
import { updateLocalGun, rr } from '../warzone/combat.js';
import { pick } from '../../engine/Bots.js';
import { playShot, playWhiz } from '../warzone/fx.js';
import * as A from './audio.js';
import { showResults, money, CREW } from './ui.js';
import { say, saveProfile, shake } from './mission.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

// --- the route ----------------------------------------------------------------------------------------------
function routePose(s, lateral = 0) {
  const R = S.city.route, L = S.city.routeLength;
  let p, t;
  if (s < 0) { t = R.getTangentAt(0); p = R.getPointAt(0).clone().addScaledVector(t, s); }
  else { const u = Math.min(1, s / L); p = R.getPointAt(u).clone(); t = R.getTangentAt(u); }
  const side = V(-t.z, 0, t.x); // right-hand side
  p.addScaledVector(side, lateral);
  return { p, t, yaw: Math.atan2(-t.x, -t.z), side };
}
function curvature(s) {
  const a = routePose(s).t, b = routePose(s + 30).t;
  return Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
}

// --- vehicles you can shoot ------------------------------------------------------------------------------------------
const _inv = new THREE.Matrix4(), _ray = new THREE.Ray(), _box = new THREE.Box3();
function targetFor(car, onHit) {
  return {
    raycast(origin, dir, max) {
      if (car.dead && car.dead > 1.2) return null;
      car.model.updateMatrixWorld(true);
      _inv.copy(car.model.matrixWorld).invert();
      _ray.origin.copy(origin).applyMatrix4(_inv); _ray.direction.copy(dir).transformDirection(_inv);
      const [w, h, l] = car.size;
      _box.min.set(-w / 2, 0.6, -l / 2); _box.max.set(w / 2, h, l / 2);
      const lp = _ray.intersectBox(_box, new THREE.Vector3());
      if (!lp) return null;
      const point = lp.clone().applyMatrix4(car.model.matrixWorld);
      const dist = point.distanceTo(origin);
      if (dist > max) return null;
      return { dist, point, local: lp, normal: dir.clone().negate() };
    },
    onBullet(hit, dmg, dir, shooter) {
      onHit(car, hit, dmg, shooter);
      S.fx.burst(S.fx.mats.spark, hit.point, 5, { speed: [5, 14], size: [0.08, 0.16], life: [0.1, 0.3], gravity: 1, dir: hit.normal, cone: 1.2 });
      return true;
    },
  };
}

// --- start ----------------------------------------------------------------------------------------------------------------
export function startChase(game) {
  const world = game.world;
  S.phase = 'chase';
  S.modal = false;
  S.ui.setPrompt(null); S.ui.setHostages(0, 0, false); S.ui.setSuspicion(0);
  S.ui.fade(1);
  A.stopLoop('alarm'); A.stopLoop('drill');
  setTimeout(() => S.ui.fade(0), 700);
  // the bank empties out of our way: nobody is simulated there any more
  for (const p of [...game.players]) if (!p.isLocal && p !== S.crew) game.removePlayer(p);
  for (const c of S.police.cars) world.scene.remove(c);
  S.police.cars = [];
  A.setLoopVolume('siren', 0.12);
  // you and your gunman ride in the back
  const me = game.localPlayer, ch = me.character;
  world.physics.removeBody(ch.body);
  ch.platformStand = true; ch.input.move.set(0, 0, 0);
  ch.damageFilter = chaseDamage;
  const crew = S.crew?.character?.alive ? S.crew : null;
  if (crew) { world.physics.removeBody(crew.character.body); crew.brain = null; crew.character.platformStand = true; }
  S.chase = {
    s: 10, speed: 0, lateral: 0, latTarget: 0, vanHp: 900 * (S.driverDef?.armor || 1), vanMax: 900 * (S.driverDef?.armor || 1),
    cops: [], wrecks: [], traffic: [], heli: null, crew, t: 0, nextCop: 3, nextTraffic: 2, roadblock: null, events: {},
    lost: false, done: false,
  };
  const C = S.chase;
  C.tunnelS = findTunnel();
  S.targets.length = 0;
  game.labelVisible = () => false;
  S.van.userData.setDoors(1);
  S.ui.clearSubs(); window.speechSynthesis?.cancel(); S.ui.setKeys('');
  // a line of the route for the minimap
  C.routePts = [];
  for (let s2 = -200; s2 < S.city.routeLength; s2 += 25) { const p = routePose(s2).p; C.routePts.push([p.x, p.z]); }
  // your gunman filled a bag of their own on the way out
  S.crewBag = 0;
  if (crew && S.doors.vault) {
    S.crewBag = Math.round(({ gus: 150000, rosa: 220000, tank: 280000 }[S.gunmanDef.id] || 150000) * (S.plan.diff === 'hard' ? 1.5 : 1));
    S.bag.value += S.crewBag;
    setTimeout(() => S.ui.popup(`${WHOname()} brought a bag too: +${money(S.crewBag)}`, '#7cf27c'), 1500);
  }
  // the loot rides in the back
  const nb = Math.min(5, Math.ceil(S.bag.weight / 4));
  S.van.userData.bags.forEach((b, i) => { b.visible = i < nb; });
  A.engine(0.22);
  A.setMusic(3);
  S.stars = Math.max(S.stars || 0, 3);
  game.camera.yaw = S.van.rotation.y + Math.PI; game.camera.elevation = -0.08;
  say('driver', pick(['Everybody in? <b>Hold on to something!</b>', 'Doors open, guns out. <b>Let\'s go!</b>']), 3);
  world.delay(5, () => say('driver', 'Cops on our tail! <b>Shoot out the cruisers!</b>', 3.5));
  world.delay(1, () => spawnCop(-60)); world.delay(2.5, () => spawnCop(-110));
}
const WHOname = () => S.gunmanDef?.name.replace(/ ".*"/, '') || 'Your gunman';
function findTunnel() {
  const L = S.city.routeLength;
  for (let s = 0; s < L; s += 20) if (routePose(s).p.z < S.city.tunnelZ) return s;
  return L - 500;
}

// a police cruiser chasing the van
function spawnCop(offset = -120, lane = null) {
  const C = S.chase, world = S.game.world;
  if (!C || C.done) return;
  const model = buildSedan({ police: true, unit: String(20 + ((Math.random() * 70) | 0)) });
  world.scene.add(model);
  const car = { model, size: model.userData.size, s: C.s + offset, lat: lane ?? rr(-8, 8), hp: 150, speed: C.speed + 10, fire: rr(1, 3), burst: 0, want: rr(-34, -18), dead: 0, vel: null, spin: null };
  C.cops.push(car);
  S.targets.push(car.target = targetFor(car, hitCar));
  return car;
}
function hitCar(car, hit, dmg, shooter) {
  if (car.dead) return;
  // a shot through the windscreen at the driver does a lot more
  const l = hit.local;
  const driver = l && l.z < -1 && l.z > -4.5 && l.y > 3.2 && l.x < 0.5;
  car.hp -= dmg * (driver ? 2.2 : 1) * (shooter?.isLocal ? 1 : 0.7);
  if (car.hp <= 0) wreck(car, shooter?.isLocal);
}
function wreck(car, byYou) {
  const C = S.chase, world = S.game.world;
  car.dead = 0.001;
  const t = routePose(car.s).t;
  car.vel = t.clone().multiplyScalar(car.speed * 0.8).add(V(rr(-10, 10), rr(18, 32), rr(-10, 10)));
  car.spin = V(rr(-3, 3), rr(-4, 4), rr(-5, 5));
  if (byYou) { S.stats.cars++; S.ui.popup('COP CAR DOWN', '#ffd040'); }
  A.crash(car.model.position);
  world.delay(0.6, () => boom(car.model.position.clone().add(V(0, 2, 0))));
  if (car.lightbar) car.model.userData.lightbar = null;
  C.wrecks.push(car);
}
/** Fire and smoke without the damage (vehicles going up). */
function boom(pos, big = 1) {
  const world = S.game.world;
  world.spawnExplosionEffect(pos, 5 * big);
  S.fx.burst(S.fx.mats.dust, pos, 20, { speed: [3, 16], size: [1.5, 3.5], life: [1, 2.2], gravity: -0.05, grow: 2.5 });
  S.fx.burst(S.fx.mats.spark, pos, 20, { speed: [8, 30], size: [0.1, 0.25], life: [0.3, 0.8], gravity: 1 });
  const L = S.fx.lights[1]; L.l.position.copy(pos); L.l.intensity = 60; L.l.distance = 80; L.t = 0.2;
  A.explosion(pos, big);
  shake(Math.max(0, 1 - world.camera.position.distanceTo(pos) / 140) * 0.8);
}

/** Damage to you in the back of the van: you get hurt, but a crew member pulls you back in. */
function chaseDamage(dmg) {
  if (S.armor > 0) { const a = Math.min(S.armor, dmg * 0.8); S.armor -= a; dmg -= a; }
  const ch = S.game.localPlayer.character;
  if (dmg >= ch.health) {
    S.lives--;
    if (S.lives <= 0) { failHeist('You were shot during the getaway.'); return 0; }
    S.ui.big('HIT!', `${S.lives} ${S.lives === 1 ? 'life' : 'lives'} left`, 2.5, '#ff6050');
    say('crew', 'Stay with me! Get back in the fight!', 2.5);
    ch.health = 60;
    return 0;
  }
  return dmg;
}

// --- per frame --------------------------------------------------------------------------------------------------------------
export function updateChase(game, dt) {
  const C = S.chase;
  if (!C) return;
  const world = game.world, cam = game.camera, me = game.localPlayer, ch = me?.character;
  C.t += dt;
  // the van: speed from the driver, slower through the corners
  if (!C.done) {
    const base = 74 * (S.driverDef?.speed || 1);
    const k = curvature(C.s + 10);
    let target = base * (1 - Math.min(0.55, k * 1.15));
    if (C.t < 2) target *= C.t / 2;
    if (C.slowT > 0) { C.slowT -= dt; target *= 0.45; }
    C.speed += (target - C.speed) * Math.min(1, dt * 1.4);
    C.s += C.speed * dt;
  } else C.speed *= Math.exp(-dt * 0.8);
  // weave between lanes (and dodge the roadblock)
  if ((C.weaveT = (C.weaveT ?? 3) - dt) <= 0) { C.weaveT = rr(2.5, 5); C.latTarget = rr(-6, 6); }
  if (C.roadblock && !C.roadblock.passed) C.latTarget = C.roadblock.gap;
  C.lateral += (C.latTarget - C.lateral) * Math.min(1, dt * 1.5);
  const pose = routePose(C.s, C.lateral);
  const van = S.van;
  van.position.copy(pose.p);
  const yaw = pose.yaw + (C.latTarget - C.lateral) * -0.03;
  van.rotation.set(0, yaw, Math.sin(C.t * 9) * 0.006 * (C.speed / 70));
  for (const w of van.userData.wheels || []) w.rotation.x -= C.speed * dt / 1.55;
  A.engine().set?.(Math.min(1, C.speed / 90));
  // the seat: in the back, looking out of the open doors
  van.updateMatrixWorld(true);
  const seat = V(1.2, 6.0, 7.2).applyMatrix4(van.matrixWorld);
  if (ch) { ch.body.position.set(seat.x, seat.y - 1.5, seat.z); ch.root.visible = false; }
  if (C.crew?.character) {
    const cs = V(-2.2, 2.0 + 3, 6.2).applyMatrix4(van.matrixWorld);
    C.crew.character.body.position.set(cs.x, cs.y, cs.z);
    C.crew.character.facing = yaw + Math.PI; C.crew.character.lockFacing = yaw + Math.PI;
  }
  // look around inside the doors' arc (the view turns with the van)
  if (C.lastYaw != null) cam.yaw += Math.atan2(Math.sin(yaw - C.lastYaw), Math.cos(yaw - C.lastYaw));
  C.lastYaw = yaw;
  const back = yaw + Math.PI;
  let rel = Math.atan2(Math.sin(cam.yaw - back), Math.cos(cam.yaw - back));
  rel = Math.max(-1.75, Math.min(1.75, rel));
  cam.yaw = back + rel;
  cam.elevation = Math.max(-0.7, Math.min(0.9, cam.elevation));
  if (S.shake > 0) { cam.yaw += (Math.random() - 0.5) * S.shake * 0.03; cam.elevation += (Math.random() - 0.5) * S.shake * 0.03; S.shake = Math.max(0, S.shake - dt * 1.5); }
  const look = V(-Math.sin(cam.yaw) * Math.cos(cam.elevation), -Math.sin(cam.elevation), -Math.cos(cam.yaw) * Math.cos(cam.elevation));
  cam.fixed = { position: seat, lookAt: seat.clone().add(look) };
  // shooting (the place's gun code still does the work)
  const mlook = S.mouse.look; S.mouse.look = [0, 0];
  if (ch?.alive && !C.done && !S.modal) {
    updateLocalGun(game, dt, mlook, { speed: 0, noSprint: true });
    S.vm.visible = true;
  } else { S.vm.visible = false; S.hud.setCrosshair(0, false); }
  // cops, wrecks, the roadblock, the helicopter, traffic
  updateCops(dt);
  updateWrecks(dt);
  updateRoadblock(dt);
  updateHeli(dt);
  updateTraffic(dt);
  crewFire(dt);
  scheduleEvents();
  // HUD
  const toGo = Math.max(0, C.tunnelS - C.s);
  S.ui.setStars(S.stars || 3, !C.lost);
  S.ui.setTake(S.bag.value, S.bag.weight / S.bag.cap);
  S.ui.setTimers([
    { label: 'VAN', value: `${Math.max(0, Math.round(C.vanHp / C.vanMax * 100))}%`, p: Math.max(0, C.vanHp / C.vanMax), cls: C.vanHp / C.vanMax < 0.3 ? '' : 'blue' },
    { label: 'TUNNEL', value: `${Math.round(toGo * 0.35)} m`, cls: 'yel' },
  ]);
  S.ui.setVitals(ch?.alive ? ch.health : 0, S.armor, S.armorMax, S.lives);
  S.ui.setObjectives([{ text: C.lost ? 'You lost them!' : 'Lose the cops: get to the <b>tunnel</b>' }, { text: 'Shoot the <b>police cars</b> chasing you', opt: true }]);
  // minimap: the van in the middle, cops around it
  const blips = C.cops.filter((c) => !c.dead).map((c) => ({ x: c.model.position.x, z: c.model.position.z, color: '#ff3a3a', r: 4, edge: true }));
  if (C.heli && !C.heli.dead) blips.push({ x: C.heli.model.position.x, z: C.heli.model.position.z, color: '#ff3a3a', shape: 'sq', edge: true });
  const tp = routePose(C.tunnelS).p; blips.push({ x: tp.x, z: tp.z, color: '#ffd020', shape: 'star', edge: true });
  S.minimap.range = 160;
  if ((C.mmT = (C.mmT || 0) - dt) <= 0) { C.mmT = 1 / 30; S.minimap.draw(van.position.x, van.position.z, cam.yaw, blips, C.routePts); }
  // losing the cops in the tunnel
  if (!C.lost && C.s > C.tunnelS - 120) {
    C.lost = true;
    say('driver', 'Into the tunnel... switching cars on the other side. <b>We lost them!</b>', 4);
    S.ui.big('YOU LOST THE COPS', '', 3, '#7cf27c');
    S.stars = 0;
    A.stopLoop('siren');
  }
  if (!C.done && C.s > C.tunnelS + 240) {
    C.done = true;
    S.ui.fade(1);
    world.delay(1.4, () => finishHeist());
  }
  if (C.vanHp <= 0 && !C.done) { C.done = true; boom(van.position.clone().add(V(0, 3, 0)), 1.5); world.delay(1.5, () => failHeist('The van was destroyed.')); }
}

function updateCops(dt) {
  const C = S.chase, world = S.game.world, van = S.van;
  // more cars join in while you're on the run
  if (!C.lost && (C.nextCop -= dt) <= 0) {
    const alive = C.cops.filter((c) => !c.dead).length;
    const max = S.plan.diff === 'hard' ? 5 : 4;
    C.nextCop = rr(5, 9);
    if (alive < max && C.s < C.tunnelS - 500) spawnCop(-rr(140, 200));
  }
  for (const car of C.cops) {
    if (car.dead) continue;
    // catch up to a spot behind the van, then sit there and shoot
    const gap = car.s - C.s;
    const want = C.lost ? -400 : car.want;
    const target = C.speed + Math.max(-25, Math.min(38, (want - gap) * 0.9));
    car.speed += (target - car.speed) * Math.min(1, dt * 1.2);
    car.s += car.speed * dt;
    if ((car.latT = (car.latT ?? 0) - dt) <= 0) { car.latT = rr(1.5, 3.5); car.latWant = rr(-9, 9); }
    car.lat += ((car.latWant ?? car.lat) - car.lat) * Math.min(1, dt * 0.9);
    // don't drive through the van
    if (gap > -14 && Math.abs(car.lat - C.lateral) < 7) car.s -= (gap + 14) * 0.5;
    const pose = routePose(car.s, car.lat);
    car.model.position.copy(pose.p);
    car.model.rotation.y = pose.yaw + (car.latWant - car.lat) * -0.02;
    for (const w of car.model.userData.wheels || []) w.rotation.x -= car.speed * dt / 1.5;
    flashLights(car.model, world.time + car.s * 0.01);
    // shooting from the passenger window
    if (C.lost || gap < -110 || gap > -8) continue;
    car.fire -= dt;
    if (car.fire <= 0) {
      if (car.burst <= 0) { car.burst = Math.floor(rr(3, 7)); }
      car.burst--; car.fire = car.burst > 0 ? rr(0.12, 0.22) : rr(1.2, 2.6);
      car.model.updateMatrixWorld(true);
      const muzzle = V(2.6, 4.2, -2.2).applyMatrix4(car.model.matrixWorld);
      copShot(muzzle, 0.3 * (1 + 30 / Math.max(30, -gap)) * (S.plan.diff === 'hard' ? 1.25 : 1), 7);
    }
  }
  // cars that fall far behind are gone
  for (const car of [...C.cops]) if (!car.dead && C.s - car.s > 700) { S.game.world.scene.remove(car.model); C.cops.splice(C.cops.indexOf(car), 1); S.targets.splice(S.targets.indexOf(car.target), 1); }
  void van;
}

/** A shot at the van: mostly hits the van, sometimes you. */
function copShot(muzzle, chance, dmg, sound = 'pistol') {
  const van = S.van, world = S.game.world;
  const aim = V(rr(-3, 3), rr(2, 7), 9).applyMatrix4(van.matrixWorld);
  const hit = Math.random() < chance;
  const end = hit ? aim : aim.clone().add(V(rr(-6, 6), rr(-2, 6), rr(-6, 6)));
  S.fx.muzzleFlash(muzzle, end.clone().sub(muzzle).normalize(), 0.7);
  S.fx.tracer(muzzle, end);
  playShot(sound, muzzle, false, false);
  if (!hit) { if (Math.random() < 0.3) playWhiz(world.camera.position); return; }
  const C = S.chase;
  if (Math.random() < 0.3) {
    const ch = S.game.localPlayer?.character;
    if (ch?.alive) {
      const d = chaseDamage(dmg * rr(0.8, 1.3));
      if (d > 0) ch.takeDamage(d);
      const to = muzzle.clone().sub(world.camera.position);
      S.hud.damage(dmg, -(Math.atan2(to.x, -to.z) + S.game.camera.yaw));
    }
  } else {
    C.vanHp -= dmg * 1.1 / (S.driverDef?.armor || 1);
    S.fx.burst(S.fx.mats.spark, aim, 4, { speed: [4, 10], size: [0.08, 0.14], life: [0.1, 0.25], gravity: 1 });
  }
}

function updateWrecks(dt) {
  const C = S.chase, world = S.game.world;
  for (const car of [...C.wrecks]) {
    car.dead += dt;
    const m = car.model;
    if (car.vel) {
      car.vel.y -= 196 * 0.35 * dt;
      m.position.addScaledVector(car.vel, dt);
      m.rotation.x += car.spin.x * dt; m.rotation.y += car.spin.y * dt; m.rotation.z += car.spin.z * dt;
      if (m.position.y < 0) { m.position.y = 0; car.vel.y *= -0.3; car.vel.x *= 0.6; car.vel.z *= 0.6; car.spin.multiplyScalar(0.6); if (Math.abs(car.vel.y) < 2) { car.vel = null; m.rotation.x = Math.round(m.rotation.x / Math.PI) * Math.PI; m.rotation.z = Math.round(m.rotation.z / Math.PI) * Math.PI; } }
    }
    // it burns
    if (Math.random() < dt * 8 && m.position.distanceTo(world.camera.position) < 300) {
      S.fx.burst(S.fx.mats.dust, m.position.clone().add(V(0, 3, 0)), 1, { speed: [1, 3], size: [1.2, 2.4], life: [1.2, 2.2], gravity: -0.12, grow: 2.5 });
      S.fx.burst(S.fx.mats.spark, m.position.clone().add(V(rr(-2, 2), 2.5, rr(-2, 2))), 1, { speed: [1, 4], size: [0.3, 0.6], life: [0.2, 0.5], gravity: -0.3 });
    }
    if (C.s - car.s > 500 || car.dead > 30) { world.scene.remove(m); C.wrecks.splice(C.wrecks.indexOf(car), 1); const i = S.targets.indexOf(car.target); if (i >= 0) S.targets.splice(i, 1); const j = C.cops.indexOf(car); if (j >= 0) C.cops.splice(j, 1); }
  }
}

// --- the scripted moments: a roadblock, the helicopter -------------------------------------------------------------------
function scheduleEvents() {
  const C = S.chase, E = C.events, world = S.game.world;
  const L = S.city.routeLength;
  if (!E.roadblock && C.s > 760) { E.roadblock = true; buildRoadblock(C.s + 360); }
  if (!E.heli && C.s > 1500) { E.heli = true; spawnHeli(); }
  if (!E.highway && routePose(C.s).p.z < -880) { E.highway = true; say('driver', 'On the highway! The tunnel\'s up ahead!', 3.5); }
  if (!E.almost && C.s > C.tunnelS - 700) { E.almost = true; say('driver', 'Almost there! <b>Keep them off us!</b>', 3); }
  if (!E.lou && S.driverDef?.id === 'lou' && C.s > 1200) {
    E.lou = true;
    say('driver', 'Whoa whoa whoa! Sorry! <b>Sorry!</b>', 2.5);
    C.slowT = 2.5; C.latTarget = 10; C.vanHp -= 60; shake(0.9); A.crash(S.van.position);
  }
  void world; void L;
}
function buildRoadblock(s) {
  const C = S.chase, world = S.game.world;
  const gap = pick([-10, 0, 10]);
  const cars = [];
  for (const lat of [-12, 0, 12]) {
    if (lat === gap) continue;
    const m = buildSedan({ police: true });
    const pose = routePose(s, lat);
    m.position.copy(pose.p); m.rotation.y = pose.yaw + Math.PI / 2 + rr(-0.3, 0.3);
    world.scene.add(m);
    const car = { model: m, size: m.userData.size, s, lat, hp: 120, speed: 0, dead: 0, block: true, fire: rr(0.5, 1.5), burst: 0 };
    car.target = targetFor(car, hitCar); S.targets.push(car.target);
    cars.push(car);
  }
  C.roadblock = { s, gap, cars, passed: false };
  say('driver', '<b>Roadblock!</b> Hang on, I\'m going through the gap!', 3);
}
function updateRoadblock(dt) {
  const C = S.chase, R = C.roadblock;
  if (!R) return;
  for (const car of R.cars) {
    if (car.dead) continue;
    flashLights(car.model, S.game.world.time);
    const ahead = R.s - C.s;
    if (ahead > 10 && ahead < 220) {
      car.fire -= dt;
      if (car.fire <= 0) { car.fire = rr(0.3, 0.9); copShot(car.model.position.clone().add(V(0, 4.5, 0)), 0.25, 8, 'rifle'); }
    }
  }
  if (!R.passed && C.s > R.s) {
    R.passed = true;
    // smash the nearest one aside
    const near = R.cars.filter((c) => !c.dead).sort((a, b) => Math.abs(a.lat - R.gap) - Math.abs(b.lat - R.gap))[0];
    if (near) { near.speed = C.speed; wreck(near, false); near.vel.add(routePose(R.s).side.multiplyScalar(Math.sign(near.lat - R.gap) * 30)); }
    A.crash(S.van.position); shake(1); C.vanHp -= 40;
    S.ui.popup('Smashed through!', '#ffd040');
  }
  if (C.s - R.s > 600) { for (const c of R.cars) { S.game.world.scene.remove(c.model); const i = S.targets.indexOf(c.target); if (i >= 0) S.targets.splice(i, 1); } C.roadblock = null; }
}

function spawnHeli() {
  const C = S.chase, world = S.game.world;
  const model = buildHelicopter(); world.scene.add(model);
  model.position.copy(S.van.position).add(V(-80, 70, 120));
  const heli = { model, size: [7, 9, 14], hp: 700, fire: 3, dead: 0, ang: 0 };
  heli.target = {
    raycast(origin, dir, max) {
      if (heli.dead) return null;
      const c = model.position.clone().add(V(0, 4, 0));
      const t = c.clone().sub(origin).dot(dir); if (t < 0 || t > max) return null;
      const p = origin.clone().addScaledVector(dir, t);
      if (p.distanceTo(c) > 5) return null;
      return { dist: t, point: p, normal: dir.clone().negate() };
    },
    onBullet(hit, dmg, dir, shooter) { heli.hp -= dmg * (shooter?.isLocal ? 1 : 0.6); S.fx.burst(S.fx.mats.spark, hit.point, 5, { speed: [5, 14], size: [0.08, 0.16], life: [0.1, 0.3], gravity: 1 }); if (heli.hp <= 0 && !heli.dead) downHeli(heli); return true; },
  };
  S.targets.push(heli.target);
  C.heli = heli;
  A.rotor(0.25);
  S.stars = 5;
  say('driver', '<b>Police chopper!</b> Take it down before it gets a sniper on us!', 4);
}
function downHeli(heli) {
  heli.dead = 0.001;
  S.stats.heli = true;
  S.ui.popup('HELICOPTER DOWN!', '#ffd040');
  say('crew', pick(['Chopper\'s going down!', 'YES! Get some!', 'Bird is down!']), 3);
  boom(heli.model.position.clone(), 1.2);
  heli.vel = V(rr(-10, 10), 4, rr(-10, 10));
}
function updateHeli(dt) {
  const C = S.chase, heli = C.heli, world = S.game.world;
  if (!heli) return;
  const m = heli.model;
  m.userData.rotor.rotation.y += dt * 30; m.userData.tailRotor.rotation.x += dt * 40;
  flashLights(m, world.time);
  if (heli.dead) {
    heli.dead += dt;
    heli.vel.y -= 196 * 0.25 * dt;
    m.position.addScaledVector(heli.vel, dt);
    m.rotation.y += dt * 5; m.rotation.z += dt * 0.6;
    if (Math.random() < dt * 20) S.fx.burst(S.fx.mats.dust, m.position.clone(), 1, { speed: [1, 3], size: [1.5, 3], life: [1, 2], gravity: -0.1, grow: 2 });
    if (m.position.y <= 1 && !heli.crashed) { heli.crashed = true; boom(m.position.clone().add(V(0, 2, 0)), 1.6); A.stopLoop('rotor'); }
    if (heli.crashed) heli.vel.set(0, 0, 0);
    if (heli.dead > 25) { world.scene.remove(m); C.heli = null; }
    return;
  }
  // hover behind and above the van, swinging side to side, searchlight on it
  heli.ang += dt * 0.4;
  const van = S.van.position, pose = routePose(C.s);
  const want = van.clone().addScaledVector(pose.t, C.lost ? -400 : -55).add(V(0, 46, 0)).addScaledVector(pose.side, Math.sin(heli.ang) * 34);
  m.position.lerp(want, Math.min(1, dt * 0.8));
  const to = van.clone().sub(m.position);
  m.rotation.set(0.12, Math.atan2(-to.x, -to.z), Math.sin(heli.ang) * 0.12);
  m.userData.beam.lookAt(van);
  m.userData.beam.rotateX(-Math.PI / 2);
  const d = m.position.distanceTo(world.camera.position);
  A.setLoopVolume('rotor', Math.max(0.02, 0.32 * (1 - d / 300)));
  if (!C.lost && (heli.fire -= dt) <= 0) {
    heli.fire = rr(2.2, 3.5);
    copShot(m.position.clone().add(V(0, 2, 0)), 0.45, 16, 'sniper');
  }
}

function updateTraffic(dt) {
  const C = S.chase, world = S.game.world;
  if ((C.nextTraffic -= dt) <= 0 && !C.done) {
    C.nextTraffic = rr(1.2, 3.5);
    const m = buildSedan({ paint: pick([0xd8d8d0, 0x2a4a7a, 0x1a1a1a, 0x8a2a24, 0x3a6a3a, 0xc8a030]) });
    world.scene.add(m);
    // oncoming cars on the other side of the road
    C.traffic.push({ model: m, s: C.s + rr(380, 520), lat: -rr(14, 26), speed: -rr(40, 60) });
  }
  for (const car of [...C.traffic]) {
    car.s += car.speed * dt;
    const pose = routePose(car.s, car.lat);
    car.model.position.copy(pose.p); car.model.rotation.y = pose.yaw + (car.speed < 0 ? Math.PI : 0);
    if (C.s - car.s > 120) { world.scene.remove(car.model); C.traffic.splice(C.traffic.indexOf(car), 1); }
  }
}

function crewFire(dt) {
  const C = S.chase;
  if (!C.crew?.character?.alive || C.lost || C.done) return;
  C.crewT = (C.crewT ?? 1) - dt;
  if (C.crewT > 0) return;
  const targets = C.cops.filter((c) => !c.dead && C.s - c.s < 110 && C.s - c.s > 5);
  if (C.heli && !C.heli.dead) targets.push({ model: C.heli.model, heli: C.heli });
  if (!targets.length) { C.crewT = 0.5; return; }
  const t = pick(targets);
  C.crewT = rr(0.1, 0.18);
  if ((C.crewBurst = (C.crewBurst ?? 6) - 1) <= 0) { C.crewBurst = Math.floor(rr(4, 9)); C.crewT = rr(0.8, 1.6); }
  S.van.updateMatrixWorld(true);
  const muzzle = V(-2.2, 5.6, 9.3).applyMatrix4(S.van.matrixWorld);
  const aim = t.model.position.clone().add(V(rr(-2, 2), rr(2, 4), rr(-2, 2)));
  S.fx.muzzleFlash(muzzle, aim.clone().sub(muzzle).normalize(), 0.8);
  S.fx.tracer(muzzle, aim);
  playShot(S.gunmanDef?.gun === 'mp5' ? 'smg' : 'rifle', muzzle, false, false);
  if (Math.random() < 0.3 + (S.gunmanDef?.skill || 0.5) * 0.35) {
    if (t.heli) { t.heli.hp -= 12; if (t.heli.hp <= 0 && !t.heli.dead) downHeli(t.heli); }
    else hitCar(t, { local: null }, 14, C.crew);
  }
}

// --- the end -------------------------------------------------------------------------------------------------------------------
export function finishHeist() {
  if (S.failed || S.finished) return;
  S.finished = true;
  const game = S.game;
  S.phase = 'over';
  A.stopAll();
  A.chime(true);
  document.exitPointerLock?.();
  S.modal = true;
  const take = Math.round(S.bag.value);
  const g = S.gunmanDef, h = S.hackerDef, d = S.driverDef;
  const gunCut = S.crewDead ? 0 : g.cut;
  const civFine = S.stats.civ * 25000, escFine = S.stats.escaped * 20000;
  const clean = S.flags.alarmOff && S.flags.keycard ? 50000 : 0;
  const net = Math.max(0, take - civFine - escFine) + clean;
  const cuts = [[`${g.name} (gunman)`, gunCut], [`${h.name} (hacker)`, h.cut], [`${d.name} (driver)`, d.cut]];
  const yourPct = 100 - cuts.reduce((s, c) => s + c[1], 0);
  const yours = Math.round(net * yourPct / 100);
  const secs = Math.round(game.world.time - S.stats.t0);
  const acc = S.stats.shots ? Math.round(S.stats.hits / S.stats.shots * 100) : 0;
  // pay out: your account, and some laundered into the Desert Strike armory
  const P = S.profile;
  P.balance = (P.balance || 0) + yours; P.done = (P.done || 0) + 1; P.best = Math.max(P.best || 0, yours);
  saveProfile(P);
  const armory = Math.round(yours / 200 / 10) * 10;
  try { const k = 'desertstrike-profile-v1'; const ds = JSON.parse(localStorage.getItem(k) || '{}'); ds.cash = (ds.cash || 0) + armory; localStorage.setItem(k, JSON.stringify(ds)); } catch { /* fine */ }
  const rows = [
    { label: 'TAKE', value: money(take), cls: 'g' },
    ...(S.crewBag ? [{ label: `  incl. ${WHOname()}'s bag`, value: money(S.crewBag) }] : []),
    { label: 'POTENTIAL TAKE', value: money(potentialTake()) },
  ];
  if (civFine) rows.push({ label: `Civilian casualties (${S.stats.civ})`, value: '-' + money(civFine), cls: 'r' });
  if (escFine) rows.push({ label: `Hostages escaped (${S.stats.escaped})`, value: '-' + money(escFine), cls: 'r' });
  if (clean) rows.push({ label: 'Clean entry bonus (keycard + alarm)', value: '+' + money(clean), cls: 'g' });
  for (const [n, c] of cuts) rows.push({ label: `${n} ${c ? c + '%' : '- died, cut is yours'}`, value: c ? '-' + money(net * c / 100) : '$0', cls: c ? 'r' : '' });
  rows.push({ label: `YOUR CUT (${yourPct}%)`, value: money(yours), cls: 'g', big: true });
  rows.push({ label: 'Time', value: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` });
  rows.push({ label: 'Kills / headshots', value: `${S.stats.kills} / ${S.stats.heads}` });
  rows.push({ label: 'Accuracy', value: acc + '%' });
  rows.push({ label: 'Police cars destroyed', value: String(S.stats.cars) + (S.stats.heli ? '  + the helicopter!' : '') });
  rows.push({ label: 'Account balance', value: money(P.balance), cls: 'g' });
  if (armory) rows.push({ label: 'Laundered into your Desert Strike armory', value: '+' + money(armory), cls: 'g' });
  showResults(game.gui.root, {
    passed: true, title: 'THE FIRST ROBLOXIA JOB', rows,
    buttons: [{ label: 'PLAN ANOTHER JOB', fn: () => location.reload() }, { label: 'LEAVE', fn: () => game.emit('exit') }],
  });
}
function potentialTake() {
  const m = S.plan?.diff === 'hard' ? 1.5 : 1;
  return (S.bank.loot.reduce((s, L) => s + (L.kind === 'box' ? 40000 : L.value * (L.kind === 'gold' ? 4 : 1)), 0) + (S.crewBag ? S.crewBag / m : 0)) * m;
}

export function failHeist(reason) {
  if (S.failed || S.finished) return;
  const game = S.game;
  S.phase = 'over'; S.failed = true;
  A.stopAll(); A.chime(false);
  document.exitPointerLock?.();
  S.modal = true;
  showResults(game.gui.root, {
    passed: false, title: reason.toUpperCase(),
    rows: [{ label: 'Take lost', value: money(S.bag.value), cls: 'r' }, { label: 'Kills', value: String(S.stats.kills) }, { label: 'Tip', value: pick(['Shout (F) to keep hostages down', 'SWAT wear armour - aim for the head', 'Stay behind cover when the police push in', 'Gold is heavy: it slows you down', 'A better driver means a faster, tougher van']) }],
    buttons: [{ label: 'RETRY', fn: () => location.reload() }, { label: 'LEAVE', fn: () => game.emit('exit') }],
  });
  void CREW;
}
