// Gun combat shared by the realistic shooter places (Desert Strike, the bank
// heist): the gun tool, hitscan ballistics with hit zones, firing and
// reloading for players and bots, the local player's aiming/spread/recoil,
// and a base brain for AI gunmen.
//
// A place calls bindCombat(ctx) once its effects, HUD and view model exist:
//   ctx = { fx: Effects, hud: Hud, vm: ViewModel, mouse: {fire, ads, adsToggle, clicked},
//           targets?: [] extra shootable things (see traceShot), onFire?(player, gun),
//           onHitCharacter?(shooter, victim, zone, damage) }
import * as THREE from 'three';
import { BotBrain } from '../../engine/Bots.js';
import { Tool } from '../../engine/Tools.js';
import { GROUP } from '../../engine/Part.js';
import { GUNS, buildGun } from './guns.js';
import { playShot, playMech, playHitmarker, playWhiz } from './fx.js';

export const DEG = Math.PI / 180;
export const rr = (a, b) => a + Math.random() * (b - a);
export const ZONES = ['torso', 'head', 'arm', 'arm', 'leg', 'leg'];
export const ZONE_MULT = { torso: 1, head: 2.5, arm: 0.75, leg: 0.7 };

let C = null;
export function bindCombat(ctx) { C = ctx; }

const TP_CACHE = new Map();

// --- the gun as a tool --------------------------------------------------------------------------
export class Gun extends Tool {
  constructor(game, player, id, atts = []) {
    super(game, { name: GUNS[id].name });
    this.id = id; this.atts = atts;
    // third-person models are built once per gun/attachments and cloned
    const key = id + ':' + [...atts].sort().join(',');
    if (!TP_CACHE.has(key)) TP_CACHE.set(key, buildGun(id, atts));
    const base = TP_CACHE.get(key);
    const tp = { ...base, group: base.group.clone() };
    tp.group.scale.setScalar(4);
    tp.group.rotation.x = -Math.PI / 2;
    const hold = new THREE.Group(); hold.add(tp.group);
    hold.position.set(0, -0.15, 0);
    this.model.add(hold);
    this.hold = hold;
    this.tp = tp;
    this.stats = tp.stats;
    this.def = GUNS[id];
    this.ammo = this.stats.mag;
    this.reserve = this.stats.reserve;
    this.next = 0;
    this.reloading = false;
    this.pistol = !!tp.pistol;
    this.player = player;
    if (player.isLocal) this.fp = buildGun(id, atts);
  }
  onActivated() { /* firing is handled by the place (hold to fire, bots) */ }
  armPose(ch, des, M) {
    M.rs = M.ls = 0.35;
    const pitch = ch.aimPitch || 0;
    des.rs = 1.57 + pitch;
    des.ls = -(1.57 + pitch) + (this.pistol ? 0 : 0.05);
  }
  armYaw() { return this.pistol ? [0.3, -0.72] : [0.22, -0.62]; }
  onEquipped() {
    if (this.player.isLocal && C?.vm) {
      C.vm.setWeapon(this.fp);
      C.vm.slideLocked = this.pistol && this.ammo === 0;
    }
    this.reloading = false;
    this.hold.rotation.z = this.pistol ? 0.3 : 0.22;
  }
}

// --- ballistics ------------------------------------------------------------------------------------
const _ray = new THREE.Ray(), _box = new THREE.Box3(), _inv = new THREE.Matrix4(), _p = new THREE.Vector3();
/**
 * The first thing a bullet hits: a wall, a character's limb, or one of the
 * place's extra targets (each has raycast(origin, dir, range) -> {dist, point, normal}|null).
 */
export function traceShot(world, origin, dir, range, ignore) {
  const end = origin.clone().addScaledVector(dir, range);
  const wh = world.raycast(origin, end, { mask: GROUP.WORLD | GROUP.DYNAMIC });
  let best = wh ? { kind: 'world', dist: wh.distance, point: wh.point, normal: wh.normal, part: wh.part } : null;
  for (const t of C?.targets || []) {
    const h = t.raycast(origin, dir, best ? best.dist : range);
    if (h && (!best || h.dist < best.dist)) best = { kind: 'target', target: t, ...h };
  }
  for (const ch of world.characters) {
    if (!ch.alive || ch === ignore) continue;
    // quick reject: distance from the ray to the character
    const rp = ch.rootPosition;
    const t = _p.copy(rp).sub(origin).dot(dir);
    if (t < 0 || t > range) continue;
    if (origin.clone().addScaledVector(dir, t).distanceTo(rp) > 4.5) continue;
    const limbs = ch.model.limbs();
    for (let i = 0; i < limbs.length; i++) {
      const [mesh, size] = limbs[i];
      mesh.updateWorldMatrix(true, false);
      _inv.copy(mesh.matrixWorld).invert();
      _ray.origin.copy(origin).applyMatrix4(_inv);
      _ray.direction.copy(dir).transformDirection(_inv);
      _box.min.set(-size[0] / 2, -size[1] / 2, -size[2] / 2); _box.max.set(size[0] / 2, size[1] / 2, size[2] / 2);
      const lp = _ray.intersectBox(_box, new THREE.Vector3());
      if (!lp) continue;
      const wp = lp.clone().applyMatrix4(mesh.matrixWorld);
      const d = wp.distanceTo(origin);
      if (best && d >= best.dist) continue;
      // which face was hit (for the wound decal)
      const n = new THREE.Vector3();
      const ax = Math.abs(lp.x) / (size[0] / 2), ay = Math.abs(lp.y) / (size[1] / 2), az = Math.abs(lp.z) / (size[2] / 2);
      if (ax >= ay && ax >= az) n.set(Math.sign(lp.x), 0, 0); else if (ay >= az) n.set(0, Math.sign(lp.y), 0); else n.set(0, 0, Math.sign(lp.z));
      best = { kind: 'char', ch, dist: d, point: wp, limb: i, mesh, localPoint: lp, localNormal: n };
    }
  }
  return best;
}

export function spreadDir(dir, deg) {
  if (deg <= 0) return dir.clone();
  const r = Math.tan(deg * DEG) * Math.sqrt(Math.random());
  const a = Math.random() * Math.PI * 2;
  const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(dir, up).normalize(), y = new THREE.Vector3().crossVectors(x, dir).normalize();
  return dir.clone().addScaledVector(x, Math.cos(a) * r).addScaledVector(y, Math.sin(a) * r).normalize();
}

/** Fire one round (or a load of pellets) and apply the results. */
export function fireRound(game, shooter, gun, origin, dir, spreadDeg, muzzle) {
  const st = gun.stats;
  const pellets = st.pellets || 1;
  let hitAny = false, headAny = false;
  for (let i = 0; i < pellets; i++) {
    const d = spreadDir(dir, spreadDeg);
    const hit = traceShot(game.world, origin, d, Math.max(st.range * 2.5, 300), shooter.character);
    const end = hit ? hit.point : origin.clone().addScaledVector(d, 400);
    if (!st.suppressed && (i === 0 || Math.random() < 0.3)) C.fx.tracer(muzzle, end);
    // a near miss whizzes past the local player's ear
    const lp = game.localPlayer?.character;
    if (lp?.alive && shooter !== game.localPlayer) {
      const ear = game.world.camera.position;
      const t = ear.clone().sub(origin).dot(d);
      if (t > 0 && (!hit || t < hit.dist) && origin.clone().addScaledVector(d, t).distanceTo(ear) < 3.5) playWhiz(ear);
    }
    if (!hit) continue;
    if (hit.kind === 'world') { if (!C.onWorldHit?.(hit)) C.fx.impact(hit.point, hit.normal, hit.part); continue; }
    if (hit.kind === 'target') {
      let dmg = st.damage;
      if (pellets > 1 && hit.dist > 20) dmg *= Math.max(0.3, 1 - (hit.dist - 20) / 50);
      if (hit.target.onBullet(hit, dmg, d, shooter) !== false) { hitAny = true; }
      continue;
    }
    const victim = hit.ch;
    if (victim.forceField) continue;
    if (victim.player?.team && victim.player.team === shooter.team) continue; // no friendly fire
    const zone = ZONES[hit.limb];
    let dmg = st.damage * (zone === 'head' ? (st.headMult || ZONE_MULT.head) : ZONE_MULT[zone]);
    if (hit.dist > st.range) dmg *= 0.6;
    if (pellets > 1 && hit.dist > 20) dmg *= Math.max(0.3, 1 - (hit.dist - 20) / 50);
    // body armour, helmets
    if (victim.damageFilter) dmg = victim.damageFilter(dmg, zone, shooter);
    victim.lastHit = { limb: hit.limb, dir: d.clone(), weapon: gun.def.name, head: zone === 'head', by: shooter };
    C.fx.bloodHit(hit.point, d, hit.mesh, hit.localPoint, hit.localNormal, zone === 'head' || dmg >= 50);
    victim.takeDamage(dmg, shooter.character);
    hitAny = true; headAny = headAny || zone === 'head';
    if (victim.player?.isLocal) {
      const to = shooter.character ? shooter.character.rootPosition.clone().sub(victim.rootPosition) : d.clone().negate();
      const ang = Math.atan2(to.x, -to.z) + game.camera.yaw;
      C.hud.damage(dmg, -ang);
    }
    victim.player?.brain?.hurtBy?.(shooter);
    C.onHitCharacter?.(shooter, victim, zone, dmg);
  }
  if (shooter.isLocal && hitAny) { C.hud.hitmarker(headAny); playHitmarker(headAny); }
  return hitAny;
}

/** Pull the trigger once (respecting fire rate, ammo and cycling). Bots aim with brain.aimDir. */
export function tryFire(game, p, gun, spread) {
  const world = game.world, now = world.time;
  if (gun.reloading || now < gun.next) return false;
  if (p.isLocal && C.vm.busy) return false;
  if (gun.ammo <= 0) {
    playMech('dry', p.isLocal ? null : p.character.rootPosition);
    gun.next = now + 0.25;
    if (gun.reserve > 0) startReload(game, p);
    return false;
  }
  gun.next = now + 60 / gun.stats.rpm;
  gun.ammo--;
  const st = gun.stats;
  let origin, dir, muzzle;
  if (p.isLocal) {
    origin = world.camera.position.clone();
    dir = new THREE.Vector3(); world.camera.getWorldDirection(dir);
    muzzle = C.vm.muzzleWorld(world.camera);
    C.vm.fire(st.pellets ? 1.6 : st.recoil > 3 ? 1.4 : 1);
    // recoil climbs the view; foregrip and aiming reduce it
    const k = (1 - 0.35 * C.vm.ads) * st.recoil;
    game.camera.elevation = Math.max(-1.39, game.camera.elevation - k * DEG * rr(0.8, 1.1));
    game.camera.yaw += (Math.random() - 0.5) * k * 0.5 * DEG;
    C.bloom = Math.min(6, (C.bloom || 0) + st.recoil * 0.25);
    if (!st.suppressed) { const L = C.fx.lights[0]; L.l.position.copy(muzzle); L.l.intensity = 20; L.t = 0.04; }
    if (gun.pistol && gun.ammo === 0) C.vm.slideLocked = true;
  } else {
    const ch = p.character;
    gun.tp.group.updateMatrixWorld(true);
    muzzle = gun.tp.group.localToWorld(gun.tp.muzzle.clone());
    origin = ch.headPosition.clone();
    dir = p.brain.aimDir(origin);
    if (!st.suppressed) C.fx.muzzleFlash(muzzle, dir, gun.pistol ? 0.6 : 1);
  }
  playShot(st.sound, p.isLocal ? null : muzzle, st.suppressed, p.isLocal);
  C.onFire?.(p, gun);
  const hit = fireRound(game, p, gun, origin, dir, spread, muzzle);
  if (p.isLocal && hit) C.onLocalHit?.();
  // pump and bolt actions cycle after each shot
  if (st.bolt || st.pellets) {
    gun.reloading = true;
    const t = st.bolt ? 1.0 : 0.6;
    const done = () => { gun.reloading = false; };
    if (p.isLocal) C.vm.play(st.bolt ? 'bolt' : 'pump', t, done); else world.delay(t, done);
    if (!p.isLocal) world.delay(0.15, () => playMech(st.bolt ? 'boltBack' : 'pumpBack', p.character?.rootPosition));
  }
  return true;
}

export function startReload(game, p) {
  const ch = p?.character, gun = ch?.tool;
  if (!(gun instanceof Gun) || gun.reloading || gun.reserve <= 0 || gun.ammo >= gun.stats.mag) return;
  if (p.isLocal && C.vm.busy) return;
  gun.reloading = true;
  const st = gun.stats;
  if (st.shellReload) {
    // one shell at a time; firing stops it
    const one = () => {
      if (!ch.alive || ch.tool !== gun) { gun.reloading = false; return; }
      if (gun.ammo >= st.mag || gun.reserve <= 0 || (p.isLocal && C.mouse.fire && gun.ammo > 0)) {
        const fin = () => { gun.reloading = false; };
        if (p.isLocal) C.vm.play('pump', 0.55, fin); else game.world.delay(0.55, fin);
        return;
      }
      const done = () => { gun.ammo++; gun.reserve--; one(); };
      if (p.isLocal) C.vm.play('shell', st.reload, done); else { playMech('shell', ch.rootPosition); game.world.delay(st.reload, done); }
    };
    one();
    return;
  }
  const finish = () => {
    gun.reloading = false;
    if (!ch.alive || ch.tool !== gun) return;
    const need = st.mag - gun.ammo, take = Math.min(need, gun.reserve);
    gun.ammo += take; gun.reserve -= take;
    if (p.isLocal) C.vm.slideLocked = false;
  };
  if (p.isLocal) C.vm.play('mag', st.reload, finish);
  else { game.world.delay(st.reload * 0.3, () => playMech('magOut', ch.rootPosition)); game.world.delay(st.reload * 0.75, () => playMech('magIn', ch.rootPosition)); game.world.delay(st.reload, finish); }
}

/**
 * The local player's gun handling for one frame: aiming down the sights,
 * sprinting, walk speed, field of view, spread and crosshair, ammo display,
 * and pulling the trigger. opts.blocked stops firing/aiming (menus open);
 * opts.speed scales the walk speed (heavy bags, armour). Returns {ads, sprint}.
 */
export function updateLocalGun(game, dt, look, opts = {}) {
  const me = game.localPlayer, ch = me.character;
  const vm = C.vm, world = game.world;
  const gun = ch.tool instanceof Gun ? ch.tool : null;
  const keys = game.keys;
  const moving = Math.hypot(ch.input.move.x, ch.input.move.z);
  const aiming = (C.mouse.ads || C.mouse.adsToggle) && !opts.blocked;
  const sprint = keys.has('shift') && (keys.has('w') || keys.has('arrowup')) && !aiming && !opts.blocked && !opts.noSprint;
  if (sprint) C.mouse.adsToggle = false;
  const ads = aiming && !sprint && gun && !gun.reloading;
  ch.walkSpeed = 16 * (gun?.def.move || 1) * (sprint ? 1.4 : 1) * (vm.ads > 0.5 ? 0.62 : 1) * (opts.speed ?? 1);
  vm.update(dt, { moving, sprint, ads, look, grounded: ch.grounded });
  // field of view (zoom while aiming)
  const base = opts.fov || 75;
  const fovT = gun ? base + ((gun.fp?.fov || 55) - 75) * vm.ads : base;
  if (Math.abs(world.camera.fov - fovT) > 0.05) { world.camera.fov = fovT; world.camera.updateProjectionMatrix(); }
  C.hud.setScope(vm.scopeActive ? gun.fp.scope : null);
  if (C.hud.ammoN) C.hud.ammoN.parentElement.style.visibility = gun ? '' : 'hidden';
  if (!gun) { C.hud.setCrosshair(0, false); return { ads: false, sprint }; }
  // spread: hip vs aimed, moving, jumping, and bloom from sustained fire
  C.bloom = Math.max(0, (C.bloom || 0) - dt * 4);
  const st = gun.stats;
  let spread = st.spread[0] + (st.spread[1] - st.spread[0]) * vm.ads;
  spread += (moving > 0.1 ? 1.2 : 0) * (1 - vm.ads * 0.75) + (ch.grounded ? 0 : 3) + C.bloom;
  if (sprint) spread += 3;
  const gap = Math.tan(spread * DEG) / Math.tan(world.camera.fov * DEG / 2) * (innerHeight / 2) + 3;
  C.hud.setCrosshair(gap, vm.ads < 0.5 && !opts.blocked && vm.visible);
  C.hud.setAmmo(gun.def.name, gun.ammo, gun.reserve, gun.reloading ? 'RELOADING...' : gun.ammo === 0 ? (gun.reserve ? 'PRESS R TO RELOAD' : 'NO AMMO') : '');
  // firing
  const wants = C.mouse.fire && (st.auto || C.mouse.clicked);
  C.mouse.clicked = false;
  if (wants && !opts.blocked && !opts.noFire && !sprint) tryFire(game, me, gun, spread);
  return { ads, sprint };
}

// --- weapon preview: the gun turning on a stand (buy menus) ------------------------------------------
let prevR = null;
export function drawGunPreview(canvas, id, atts, env) {
  if (!prevR) { prevR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); prevR.outputColorSpace = THREE.SRGBColorSpace; prevR.toneMapping = THREE.ACESFilmicToneMapping; }
  const scene = new THREE.Scene();
  scene.environment = env || C?.vm?.scene.environment || null;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x554433, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(1, 2, 2); scene.add(sun);
  const gun = buildGun(id, atts);
  const g = gun.group; g.rotation.y = -Math.PI / 2 + 0.25; g.rotation.x = 0.08;
  scene.add(g);
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
  const cam = new THREE.PerspectiveCamera(28, canvas.width / canvas.height, 0.01, 20);
  cam.position.set(c.x + 0.15, c.y + size * 0.25, c.z + size * 1.55); cam.lookAt(c);
  prevR.setSize(canvas.width, canvas.height, false);
  prevR.render(scene, cam);
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  canvas.getContext('2d').drawImage(prevR.domElement, 0, 0);
}

// --- AI gunmen ----------------------------------------------------------------------------------------
/**
 * Spots enemies (other teams; never team-less bystanders) with a field of
 * view and line of sight, turns to face them and shoots in bursts with
 * human-like aim error. Subclasses decide where to move in think().
 */
export class GunnerBrain extends BotBrain {
  constructor(game, player, opts = {}) {
    super(game, player, { chattiness: opts.chattiness ?? 0.35 });
    this.dontAvoidEdges = true;
    this.allowGapJumps = false;
    this.skill = opts.skill ?? rr(0.5, 0.95);
    this.sight = opts.sight ?? 260;
    this.enemy = null; this.engagedAt = 0; this.burstLeft = 0; this.pause = 0; this.strafeDir = 1; this.strafeT = 0;
    this.lastHurt = null;
    this.arriveRadius = 3;
    this.combatSpeed = 13;
  }
  hurtBy(shooter) { this.lastHurt = { p: shooter, t: this.game.world.time }; }
  onKill() {}
  visible(from, ch) {
    for (const off of [1.5, 0.3]) {
      const to = ch.rootPosition.clone(); to.y += off;
      const hit = this.game.world.raycast(from, to, { mask: GROUP.WORLD | GROUP.DYNAMIC });
      if (!hit || hit.distance > from.distanceTo(to) - 0.8) return true;
    }
    return false;
  }
  isEnemy(o) { return o.team && o.team !== this.player.team; }
  findEnemy() {
    const me = this.ch, eye = me.headPosition;
    let best = null, bd = this.sight;
    for (const o of this.game.players) {
      const c = o.character;
      if (!c?.alive || !this.isEnemy(o) || o.hidden) continue;
      const d = c.rootPosition.distanceTo(me.rootPosition);
      if (d > bd) continue;
      // field of view, unless they just shot us
      const to = c.rootPosition.clone().sub(me.rootPosition).setY(0).normalize();
      const facing = new THREE.Vector3(-Math.sin(me.facing), 0, -Math.cos(me.facing));
      const recent = this.lastHurt && this.lastHurt.p === o && this.game.world.time - this.lastHurt.t < 3;
      if (to.dot(facing) < -0.1 && !recent && d > 12) continue;
      if (!this.visible(eye, c)) continue;
      bd = d; best = o;
    }
    return best;
  }
  /** Spot an enemy, noticing a new one takes a moment. Returns the enemy (or null). */
  scan() {
    const enemy = this.findEnemy();
    if (enemy && enemy !== this.enemy) { this.engagedAt = this.game.world.time + rr(0.25, 0.65) / this.skill; this.aimErr = 1; }
    this.enemy = enemy;
    const gun = this.ch.tool;
    if (gun instanceof Gun && gun.ammo === 0 && !gun.reloading) {
      if (gun.reserve > 0) startReload(this.game, this.player); else this.equipFirst(this.player.backpack[1]?.name);
    }
    return enemy;
  }
  aimDir(origin) {
    const e = this.enemy?.character;
    if (!e) return this.ch.lookVector;
    const d = origin.distanceTo(e.rootPosition);
    const aim = e.rootPosition.clone(); aim.y += Math.random() < 0.18 * this.skill ? 1.55 : 0.3;
    // human-like error: worse at range, while the target moves, and right after spotting them
    const err = d * 0.03 * (1.5 - this.skill) * (this.aimErr || 1) * (1 + Math.min(1, Math.hypot(e.body.velocity.x, e.body.velocity.z) / 16) * 0.6) * (this.aimPenalty || 1);
    aim.x += rr(-err, err); aim.y += rr(-err, err) * 0.6; aim.z += rr(-err, err);
    return aim.sub(origin).normalize();
  }
  combat(dt) {
    const ch = this.ch, e = this.enemy?.character;
    if (!ch?.alive) return;
    const gun = ch.tool;
    if (!e?.alive || !(gun instanceof Gun)) { if (!this.lastHurt || this.game.world.time - this.lastHurt.t > 2) ch.lockFacing = this.faceTarget ?? null; ch.aimPitch = 0; return; }
    const to = e.rootPosition.clone().sub(ch.rootPosition);
    ch.lockFacing = Math.atan2(-to.x, -to.z);
    ch.aimPitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
    ch.walkSpeed = this.combatSpeed;
    if (this.game.world.time < this.engagedAt) return;
    this.aimErr = Math.max(0.35, (this.aimErr || 1) - dt * 0.4);
    // shoot in bursts
    this.pause -= dt;
    if (this.pause > 0) return;
    const st = gun.stats;
    if (!st.auto && this.game.world.time < (gun.nextBot || 0)) return;
    if (tryFire(this.game, this.player, gun, st.spread[0] * 0.55)) {
      if (!st.auto) gun.nextBot = this.game.world.time + Math.max(60 / st.rpm, rr(0.25, 0.6) / this.skill);
      if (st.auto && --this.burstLeft <= 0) { this.burstLeft = Math.floor(rr(3, 8)); this.pause = rr(0.2, 0.6) * (this.burstPause || 1); }
    }
  }
}
