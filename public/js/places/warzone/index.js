// "Desert Strike": a team shooter place. Coalition vs Militia in a desert
// town, realistic guns you unlock with money earned from kills, rag-doll
// deaths and blood. A user-made place in this 2008 ROBLOX (it uses its own
// GUI and modern effects on purpose).
import * as THREE from 'three';
import { BotBrain, pick } from '../../engine/Bots.js';
import { Tool } from '../../engine/Tools.js';
import { GROUP } from '../../engine/Part.js';
import { GUNS, buildGun } from './guns.js';
import { Effects, playShot, playMech, playHitmarker, playWhiz } from './fx.js';
import { ViewModel } from './viewmodel.js';
import { buildMap, desertSky } from './map.js';
import { Hud, BuyMenu } from './hud.js';

const DEG = Math.PI / 180;
const SCORE_LIMIT = 50, ROUND_TIME = 600;
const rr = (a, b) => a + Math.random() * (b - a);
const ZONES = ['torso', 'head', 'arm', 'arm', 'leg', 'leg'];
const ZONE_MULT = { torso: 1, head: 2.5, arm: 0.75, leg: 0.7 };
let S = null;

// --- saved progress -----------------------------------------------------------------------------
const PROFILE_KEY = 'desertstrike-profile-v1';
function loadProfile() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch { p = null; }
  p = p || {};
  const prof = { cash: p.cash ?? 0, guns: p.guns || ['glock'], att: p.att || {}, on: p.on || {}, equipped: p.equipped || { primary: null, secondary: 'glock' }, kills: p.kills || 0, deaths: p.deaths || 0, gifts: p.gifts || [] };
  // One-time gifts, each paid out once per browser profile.
  for (const [id, amount] of GIFTS) {
    if (prof.gifts.includes(id)) continue;
    prof.cash += amount; prof.gifts.push(id);
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(prof)); } catch { /* private mode */ }
  }
  return prof;
}
const GIFTS = [['owner-20k', 20000]];
function saveProfile() { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(S.profile)); } catch { /* private mode */ } }

// --- uniforms -------------------------------------------------------------------------------------
const CAMO = ['#8a7550', '#c8b48a', '#6e5d40'];
function uniform(team, base) {
  const head = base?.colors?.head ?? 24;
  if (team === 'Coalition') {
    return { colors: { head, torso: 5, leftArm: 5, rightArm: 5, leftLeg: 5, rightLeg: 5 }, face: 'Smile', hats: [], tshirt: null,
      shirt: { style: 'camo', color: '#a8926a', blobs: CAMO }, pants: { style: 'camo', color: '#a8926a', shoes: '#4a3a28', blobs: CAMO } };
  }
  const shirts = [{ style: 'long', color: '#2e2e2a' }, { style: 'plaid', color: '#5a4a3a', color2: '#8a7a60' }, { style: 'jacket', color: '#3a3a2e', color2: '#6a6a5a' }, { style: 'long', color: '#4a3e30' }];
  const k = Math.abs(hashName(base?.name || '')) % shirts.length;
  return { colors: { head, torso: 26, leftArm: 26, rightArm: 26, leftLeg: 26, rightLeg: 26 }, face: 'Smile', hats: [], tshirt: null,
    shirt: shirts[k], pants: { style: 'plain', color: ['#2a2a2a', '#4a4038', '#3a3a44'][k % 3], shoes: '#1a1a1a' } };
}
function hashName(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

const GEAR = new Map();
function headgear(team, name) {
  const key = team === 'Coalition' ? 'helmet' : (Math.abs(hashName(name)) % 2 === 0 ? 'red' : 'black');
  if (!GEAR.has(key)) GEAR.set(key, buildHeadgear(key));
  return GEAR.get(key).clone();
}
function buildHeadgear(kind) {
  const g = new THREE.Group();
  if (kind === 'helmet') {
    const tan = new THREE.MeshStandardMaterial({ color: 0xa8926a, roughness: 0.85 });
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.74, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), tan);
    helm.position.y = 0.14; helm.scale.set(1, 0.9, 1.05); g.add(helm);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.78, 0.12, 20, 1, true), tan); brim.position.y = 0.12; g.add(brim);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.04, 6, 24), new THREE.MeshStandardMaterial({ color: 0x2a2a2a })); band.rotation.x = Math.PI / 2; band.position.y = 0.4; g.add(band);
    const nvg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.12), new THREE.MeshStandardMaterial({ color: 0x2a2c2a, roughness: 0.6 })); nvg.position.set(0, 0.42, -0.72); g.add(nvg);
  } else {
    // a shemagh head wrap, red-and-white or black
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const red = kind === 'red';
    x.fillStyle = red ? '#e8e2d8' : '#1e1e1e'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = red ? '#a8201c' : '#4a4a4a'; x.lineWidth = 2;
    for (let i = 0; i < 64; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2);
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, side: THREE.DoubleSide });
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), m); top.position.y = 0.1; top.scale.set(1.02, 0.95, 1.05); g.add(top);
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.67, 0.69, 0.42, 18, 1, true, Math.PI * 0.8, Math.PI * 1.4), m); wrap.position.y = -0.3; g.add(wrap);
    const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0), m); tail.position.set(0.1, -0.4, 0.68); tail.rotation.x = 0.15; g.add(tail);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.shared = true; if (o.material.map) o.material.map.userData.shared = true; } });
  return g;
}

const TP_CACHE = new Map();

// --- the gun as a tool --------------------------------------------------------------------------
class Gun extends Tool {
  constructor(game, player, id, atts) {
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
  onEquipped(ch) {
    if (this.player.isLocal && S?.vm) {
      S.vm.setWeapon(this.fp);
      S.vm.slideLocked = this.pistol && this.ammo === 0;
    }
    this.reloading = false;
    this.hold.rotation.z = this.pistol ? 0.3 : 0.22;
  }
}

// --- ballistics ------------------------------------------------------------------------------------
const _ray = new THREE.Ray(), _box = new THREE.Box3(), _inv = new THREE.Matrix4(), _p = new THREE.Vector3();
function traceShot(world, origin, dir, range, ignore) {
  const end = origin.clone().addScaledVector(dir, range);
  const wh = world.raycast(origin, end, { mask: GROUP.WORLD | GROUP.DYNAMIC });
  let best = wh ? { kind: 'world', dist: wh.distance, point: wh.point, normal: wh.normal, part: wh.part } : null;
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

function spreadDir(dir, deg) {
  if (deg <= 0) return dir.clone();
  const r = Math.tan(deg * DEG) * Math.sqrt(Math.random());
  const a = Math.random() * Math.PI * 2;
  const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(dir, up).normalize(), y = new THREE.Vector3().crossVectors(x, dir).normalize();
  return dir.clone().addScaledVector(x, Math.cos(a) * r).addScaledVector(y, Math.sin(a) * r).normalize();
}

/** Fire one round (or a load of pellets) and apply the results. */
function fireRound(game, shooter, gun, origin, dir, spreadDeg, muzzle) {
  const st = gun.stats;
  const pellets = st.pellets || 1;
  let hitAny = false, headAny = false;
  for (let i = 0; i < pellets; i++) {
    const d = spreadDir(dir, spreadDeg);
    const hit = traceShot(game.world, origin, d, Math.max(st.range * 2.5, 300), shooter.character);
    const end = hit ? hit.point : origin.clone().addScaledVector(d, 400);
    if (!st.suppressed && (i === 0 || Math.random() < 0.3)) S.fx.tracer(muzzle, end);
    // a near miss whizzes past the local player's ear
    const lp = game.localPlayer?.character;
    if (lp?.alive && shooter !== game.localPlayer) {
      const ear = game.world.camera.position;
      const t = ear.clone().sub(origin).dot(d);
      if (t > 0 && (!hit || t < hit.dist) && origin.clone().addScaledVector(d, t).distanceTo(ear) < 3.5) playWhiz(ear);
    }
    if (!hit) continue;
    if (hit.kind === 'world') { S.fx.impact(hit.point, hit.normal, hit.part); continue; }
    const victim = hit.ch;
    if (victim.forceField) continue;
    if (victim.player?.team && victim.player.team === shooter.team) continue; // no friendly fire
    const zone = ZONES[hit.limb];
    let dmg = st.damage * (zone === 'head' ? (st.headMult || ZONE_MULT.head) : ZONE_MULT[zone]);
    if (hit.dist > st.range) dmg *= 0.6;
    if (pellets > 1 && hit.dist > 20) dmg *= Math.max(0.3, 1 - (hit.dist - 20) / 50);
    victim.lastHit = { limb: hit.limb, dir: d.clone(), weapon: gun.def.name, head: zone === 'head', by: shooter };
    S.fx.bloodHit(hit.point, d, hit.mesh, hit.localPoint, hit.localNormal, zone === 'head' || dmg >= 50);
    victim.takeDamage(dmg, shooter.character);
    hitAny = true; headAny = headAny || zone === 'head';
    if (victim.player?.isLocal) {
      const to = shooter.character ? shooter.character.rootPosition.clone().sub(victim.rootPosition) : d.clone().negate();
      const ang = Math.atan2(to.x, -to.z) + game.camera.yaw;
      S.hud.damage(dmg, -ang);
    }
    if (victim.player?.brain) victim.player.brain.hurtBy(shooter);
  }
  if (shooter.isLocal && hitAny) { S.hud.hitmarker(headAny); playHitmarker(headAny); }
}

// --- the place -------------------------------------------------------------------------------------
export default {
  build(world, ctx = {}) {
    const map = buildMap(world, ctx);
    world.setSky(desertSky());
    world.scene.fog = new THREE.Fog(0xd8ccb0, 160, 650);
    world.ambient.color.set(0xe0e8f4); world.ambient.groundColor.set(0x8a7050); world.ambient.intensity = 1.15;
    world.sun.color.set(0xfff0d8); world.sun.intensity = 2.6;
    world.sun.position.set(-0.45, 1, 0.35).multiplyScalar(100);
    world.fill.intensity = 0.25;
    if (!ctx.thumbnail) { // the thumbnail renderer is shared with the rest of the site
      world.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      world.renderer.toneMappingExposure = 1.05;
    }
    S = { map, profile: null };
    return { thumbnail: { cam: [38, 22, 30], look: [0, 4, 0] } };
  },

  setup(game, ctx) {
    const world = game.world;
    S = { ...S, game, profile: loadProfile(), time: ROUND_TIME, roundOver: false, clockT: 0 };
    // shadows: softer and covering more of the town
    if (world.shadows) {
      world.renderer.shadowMap.type = THREE.PCFShadowMap;
      const c = world.sun.shadow.camera; c.left = -80; c.right = 80; c.top = 80; c.bottom = -80; c.far = 500; c.updateProjectionMatrix();
      world.sun.shadow.mapSize.set(2048, 2048); world.sun.shadow.bias = -0.0005; world.sun.shadow.normalBias = 0.05;
    }
    // realistic lighting costs more per pixel: don't render above 1.25x on Retina screens
    world.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    game.resize(window.innerWidth, window.innerHeight);
    game.respawnTime = 5;
    game.forceFieldTime = 2;
    game.setStats(['KOs', 'Wipeouts']);
    const coalition = game.addTeam('Coalition', 23), militia = game.addTeam('Militia', 21);
    S.teams = { Coalition: coalition, Militia: militia };
    for (const [team, x] of [[coalition, 152], [militia, -152]]) {
      for (const z of [-16, -6, 6, 16]) {
        const sp = world.add({ size: [6, 0.2, 6], position: [x, 0.1, z], transparency: 1, canCollide: false });
        sp.userData.yaw = x > 0 ? Math.PI / 2 : -Math.PI / 2;
        game.addSpawn(sp, { team });
      }
    }
    S.fx = new Effects(world);
    S.vm = new ViewModel(world);
    S.hud = new Hud(game.gui.root, game);
    S.buy = new BuyMenu(game.gui.root, S.profile, { onChange: () => { saveProfile(); S.hud.setCash(S.profile.cash); maybeApplyLoadout(game); }, preview: drawPreview });
    S.hud.setCash(S.profile.cash);
    window.__desertStrike = S; // handy for debugging from the console
    S.equipNow = (id, att = []) => { S.profile.equipped[GUNS[id].slot] = id; if (!S.profile.guns.includes(id)) S.profile.guns.push(id); S.profile.on[id] = att; const ch = game.localPlayer?.character; if (ch?.tool) ch.unequip(); giveLoadout(game, game.localPlayer); };

    // first person, always
    const cam = game.camera;
    cam.zoom = () => {};
    cam.distance = 0.35;
    cam._updateFirstPerson();
    const rotate = cam.rotate.bind(cam);
    cam.rotate = (dy, de) => { const k = world.camera.fov / 75; rotate(dy * k, de * k); };
    world.camera.fov = 75; world.camera.updateProjectionMatrix();
    // never put a gun away by pressing its number again
    const equip = game.equip.bind(game);
    game.equip = (p, i) => { if (p.equipped === i) return; equip(p, i); };
    game.labelRange = 400;
    game.labelVisible = (p) => p.team === game.localPlayer?.team;

    game.on('playerAdded', (p) => {
      const n = (t) => game.players.filter((x) => x.team === t).length;
      const team = p.isLocal ? (n(coalition) <= n(militia) ? coalition : militia) : (n(coalition) <= n(militia) ? coalition : militia);
      game.setTeam(p, team);
      p.appearanceOverride = uniform(team.name, { ...p.appearance, name: p.name });
      if (p.isLocal) S.vm.setAppearance(p.appearanceOverride, team.name === 'Coalition' ? 0x2a2a26 : null);
      if (p.isBot) { p.brain = new SoldierBrain(game, p); p.botLoadout = botLoadout(team.name); }
    });
    game.on('spawned', (p, ch) => {
      ch.ragdoll = true;
      ch.model.head.add(headgear(p.team?.name, p.name));
      giveLoadout(game, p);
      if (p.isLocal) {
        cam.fixed = null;
        cam.distance = 0.35; cam._updateFirstPerson();
        S.vm.visible = true;
        S.hud.showDeath(null);
        S.deadCam = null;
      }
    });
    game.on('died', (p, killer) => onDeath(game, p, killer));

    // input
    S.mouse = { fire: false, ads: false, clicked: false, look: [0, 0] };
    const canvas = game.canvas;
    canvas.addEventListener('mousedown', (e) => {
      if (S.buy.open) return;
      if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
      if (e.button === 0) { S.mouse.fire = true; S.mouse.clicked = true; }
      if (e.button === 2) S.mouse.ads = true;
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) S.mouse.fire = false; if (e.button === 2) S.mouse.ads = false; });
    window.addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { S.mouse.look[0] += e.movementX; S.mouse.look[1] += e.movementY; } });
    window.addEventListener('keydown', (e) => {
      if (game.gui.chatFocused && !S.buy.open) return;
      const k = e.key.toLowerCase();
      if (k === 'b') { S.buy.toggle(); game.gui.chatFocused = S.buy.open; if (!S.buy.open) { game.gui.chatFocused = false; maybeApplyLoadout(game); } }
      if (k === 'escape' && S.buy.open) { S.buy.toggle(false); game.gui.chatFocused = false; }
      if (k === 'r' && !S.buy.open) startReload(game, game.localPlayer, true);
      // E toggles aiming down the sights (handy on a trackpad); right mouse also works
      if (k === 'e' && !S.buy.open && !e.repeat) S.mouse.adsToggle = !S.mouse.adsToggle;
    });
    game.world.onUpdate((dt) => { for (const p of game.players) if (p.character?.alive && p.character.health < 60 && Math.random() < dt * 1.5) S.fx.drip(p.character.rootPosition.clone().setY(p.character.rootPosition.y - 1)); });
  },

  update(game, dt) {
    if (!S?.hud) return;
    localUpdate(game, dt);
    for (const p of game.players) p.brain?.combat?.(dt);
    // round clock and score
    S.time -= dt;
    const a = teamKills(game, 'Coalition'), b = teamKills(game, 'Militia');
    S.hud.setScore(a, b, S.time);
    if (!S.roundOver && (a >= SCORE_LIMIT || b >= SCORE_LIMIT || S.time <= 0)) endRound(game, a, b);
    S.hud.update(dt);
  },

  onExit(game, close) { saveProfile(); close(); },
};

function teamKills(game, team) { return game.players.filter((p) => p.team?.name === team).reduce((s, p) => s + (p.stats.KOs || 0), 0); }

function endRound(game, a, b) {
  S.roundOver = true;
  const win = a === b ? null : a > b ? 'Coalition' : 'Militia';
  S.hud.showMessage(win ? `${win.toUpperCase()} WINS` : 'DRAW');
  const me = game.localPlayer;
  if (me) { const prize = win && me.team?.name === win ? 500 : 150; S.profile.cash += prize; S.hud.setCash(S.profile.cash, prize); saveProfile(); }
  game.world.delay(8, () => {
    S.hud.showMessage(null);
    for (const p of game.players) { p.stats.KOs = 0; p.stats.Wipeouts = 0; }
    S.time = ROUND_TIME; S.roundOver = false;
    for (const p of game.players) game.spawnPlayer(p);
    game.gui?.onPlayersChanged();
  });
}

// --- loadouts ------------------------------------------------------------------------------------------
function botLoadout(team) {
  const prim = team === 'Coalition' ? pick(['m4', 'm4', 'm4', 'mp5', 'remington', 'm249', 'm24']) : pick(['ak47', 'ak47', 'ak47', 'mp5', 'remington', 'm24']);
  const att = { m4: [pick(['reddot', 'holo', 'acog'])], m249: ['reddot'] }[prim] || [];
  return { primary: prim, secondary: Math.random() < 0.3 ? 'deagle' : 'glock', att };
}
function giveLoadout(game, p) {
  const tools = [];
  if (p.isLocal) {
    const P = S.profile;
    if (P.equipped.primary && P.guns.includes(P.equipped.primary)) tools.push(new Gun(game, p, P.equipped.primary, P.on[P.equipped.primary] || []));
    tools.push(new Gun(game, p, P.equipped.secondary || 'glock', P.on[P.equipped.secondary || 'glock'] || []));
  } else {
    const L = p.botLoadout || botLoadout(p.team?.name);
    tools.push(new Gun(game, p, L.primary, L.att), new Gun(game, p, L.secondary, []));
  }
  p.backpack = tools;
  p.equipped = -1;
  game.gui?.onBackpackChanged(p);
  game.equip(p, 0);
}
function maybeApplyLoadout(game) {
  const me = game.localPlayer, ch = me?.character;
  if (!ch?.alive) return;
  const base = me.team?.name === 'Coalition' ? 150 : -150;
  if (Math.abs(ch.rootPosition.x - base) < 30) { if (ch.tool) ch.unequip(); giveLoadout(game, me); }
}

// --- the local player ------------------------------------------------------------------------------------
function localUpdate(game, dt) {
  const me = game.localPlayer, ch = me?.character;
  const vm = S.vm, world = game.world, cam = game.camera;
  const look = S.mouse.look; S.mouse.look = [0, 0];
  if (!ch || !ch.alive) {
    vm.visible = false;
    S.hud.setCrosshair(0, false);
    S.hud.setHealth(0);
    S.hud.setScope(null);
    if (S.deadCam) {
      const t = S.deadCam.corpse?.debris?.[0]?.body?.position;
      if (t) { cam.fixed = { position: new THREE.Vector3(t.x + 7, t.y + 8, t.z + 7), lookAt: new THREE.Vector3(t.x, t.y, t.z) }; }
      S.hud.showDeath(S.deadCam.text, `Respawning in ${Math.max(0, Math.ceil(S.deadCam.until - world.time))}  -  press B to change your loadout`);
    }
    return;
  }
  const gun = ch.tool instanceof Gun ? ch.tool : null;
  const keys = game.keys;
  const moving = Math.hypot(ch.input.move.x, ch.input.move.z);
  const aiming = S.mouse.ads || S.mouse.adsToggle;
  const sprint = keys.has('shift') && (keys.has('w') || keys.has('arrowup')) && !aiming && !S.buy.open;
  if (sprint) S.mouse.adsToggle = false;
  const ads = aiming && !sprint && gun && !gun.reloading;
  ch.walkSpeed = 16 * (gun?.def.move || 1) * (sprint ? 1.4 : 1) * (vm.ads > 0.5 ? 0.62 : 1);
  vm.update(dt, { moving, sprint, ads, look, grounded: ch.grounded });
  // field of view (zoom while aiming)
  const fovT = gun ? 75 + ((gun.fp?.fov || 55) - 75) * vm.ads : 75;
  if (Math.abs(world.camera.fov - fovT) > 0.05) { world.camera.fov = fovT; world.camera.updateProjectionMatrix(); }
  S.hud.setScope(vm.scopeActive ? gun.fp.scope : null);
  if (!gun) return;
  // spread: hip vs aimed, moving, jumping, and bloom from sustained fire
  S.bloom = Math.max(0, (S.bloom || 0) - dt * 4);
  const st = gun.stats;
  let spread = st.spread[0] + (st.spread[1] - st.spread[0]) * vm.ads;
  spread += (moving > 0.1 ? 1.2 : 0) * (1 - vm.ads * 0.75) + (ch.grounded ? 0 : 3) + S.bloom;
  if (sprint) spread += 3;
  const gap = Math.tan(spread * DEG) / Math.tan(world.camera.fov * DEG / 2) * (innerHeight / 2) + 3;
  S.hud.setCrosshair(gap, vm.ads < 0.5 && !S.buy.open);
  S.hud.setAmmo(gun.def.name, gun.ammo, gun.reserve, gun.reloading ? 'RELOADING...' : gun.ammo === 0 ? (gun.reserve ? 'PRESS R TO RELOAD' : 'NO AMMO') : '');
  S.hud.setHealth(ch.health);
  // firing
  const wants = S.mouse.fire && (st.auto || S.mouse.clicked);
  S.mouse.clicked = false;
  if (wants && !S.buy.open && !sprint) tryFire(game, me, gun, spread);
}

function tryFire(game, p, gun, spread) {
  const world = game.world, now = world.time;
  if (gun.reloading || now < gun.next) return false;
  if (p.isLocal && S.vm.busy) return false;
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
    muzzle = S.vm.muzzleWorld(world.camera);
    S.vm.fire(st.pellets ? 1.6 : st.recoil > 3 ? 1.4 : 1);
    // recoil climbs the view; foregrip and aiming reduce it
    const k = (1 - 0.35 * S.vm.ads) * st.recoil;
    game.camera.elevation = Math.max(-1.39, game.camera.elevation - k * DEG * rr(0.8, 1.1));
    game.camera.yaw += (Math.random() - 0.5) * k * 0.5 * DEG;
    S.bloom = Math.min(6, (S.bloom || 0) + st.recoil * 0.25);
    if (!st.suppressed) { const L = S.fx.lights[0]; L.l.position.copy(muzzle); L.l.intensity = 20; L.t = 0.04; }
    if (gun.pistol && gun.ammo === 0) S.vm.slideLocked = true;
  } else {
    const ch = p.character;
    gun.tp.group.updateMatrixWorld(true);
    muzzle = gun.tp.group.localToWorld(gun.tp.muzzle.clone());
    origin = ch.headPosition.clone();
    dir = p.brain.aimDir(origin);
    if (!st.suppressed) S.fx.muzzleFlash(muzzle, dir, gun.pistol ? 0.6 : 1);
  }
  playShot(st.sound, p.isLocal ? null : muzzle, st.suppressed, p.isLocal);
  fireRound(game, p, gun, origin, dir, spread, muzzle);
  // pump and bolt actions cycle after each shot
  if (st.bolt || st.pellets) {
    gun.reloading = true;
    const t = st.bolt ? 1.0 : 0.6;
    const done = () => { gun.reloading = false; };
    if (p.isLocal) S.vm.play(st.bolt ? 'bolt' : 'pump', t, done); else world.delay(t, done);
    if (!p.isLocal) world.delay(0.15, () => playMech(st.bolt ? 'boltBack' : 'pumpBack', p.character?.rootPosition));
  }
  return true;
}

function startReload(game, p, manual = false) {
  const ch = p?.character, gun = ch?.tool;
  if (!(gun instanceof Gun) || gun.reloading || gun.reserve <= 0 || gun.ammo >= gun.stats.mag) return;
  if (p.isLocal && S.vm.busy) return;
  gun.reloading = true;
  const st = gun.stats;
  if (st.shellReload) {
    // one shell at a time; firing stops it
    const one = () => {
      if (!ch.alive || ch.tool !== gun) { gun.reloading = false; return; }
      if (gun.ammo >= st.mag || gun.reserve <= 0 || (p.isLocal && S.mouse.fire && gun.ammo > 0)) {
        const fin = () => { gun.reloading = false; };
        if (p.isLocal) S.vm.play('pump', 0.55, fin); else game.world.delay(0.55, fin);
        return;
      }
      const done = () => { gun.ammo++; gun.reserve--; one(); };
      if (p.isLocal) S.vm.play('shell', st.reload, done); else { playMech('shell', ch.rootPosition); game.world.delay(st.reload, done); }
    };
    one();
    return;
  }
  const finish = () => {
    gun.reloading = false;
    if (!ch.alive || ch.tool !== gun) return;
    const need = st.mag - gun.ammo, take = Math.min(need, gun.reserve);
    gun.ammo += take; gun.reserve -= take;
    if (p.isLocal) S.vm.slideLocked = false;
  };
  if (p.isLocal) S.vm.play('mag', st.reload, finish);
  else { game.world.delay(st.reload * 0.3, () => playMech('magOut', ch.rootPosition)); game.world.delay(st.reload * 0.75, () => playMech('magIn', ch.rootPosition)); game.world.delay(st.reload, finish); }
  void manual;
}

function onDeath(game, p, killer) {
  const ch = p.character;
  const info = ch?.lastHit || {};
  const imp = info.dir ? info.dir.clone().multiplyScalar(info.head ? 26 : 18).add(new THREE.Vector3(0, 6, 0)) : null;
  S.fx.adoptCorpse(ch, info.limb ?? 0, imp);
  const corpse = S.fx.corpses[S.fx.corpses.length - 1];
  const kname = killer ? killer.name : p.name;
  S.hud.kill(kname, p.name, killer ? info.weapon || 'Gun' : 'Fell', info.head, killer?.team?.name || p.team?.name, p.team?.name);
  if (killer?.isLocal && killer !== p) {
    const pay = 100 + (info.head ? 50 : 0);
    S.profile.cash += pay; S.profile.kills++;
    S.hud.setCash(S.profile.cash, pay);
    saveProfile();
  }
  if (p.isLocal) {
    S.profile.deaths++; saveProfile();
    S.deadCam = { corpse, until: game.world.time + game.respawnTime, text: killer && killer !== p ? `KILLED BY <b>${escapeHtml(killer.name)}</b> [${escapeHtml(info.weapon || '')}]${info.head ? ' - HEADSHOT' : ''}` : 'YOU DIED' };
    S.mouse.fire = false; S.mouse.ads = false; S.mouse.adsToggle = false;
    S.vm.visible = false;
  }
  if (killer?.brain && killer !== p) killer.brain.onKill?.();
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// --- buy menu preview: the gun turning on a stand ---------------------------------------------------
let prevR = null;
function drawPreview(canvas, id, atts) {
  if (!prevR) { prevR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); prevR.outputColorSpace = THREE.SRGBColorSpace; prevR.toneMapping = THREE.ACESFilmicToneMapping; }
  const scene = new THREE.Scene();
  scene.environment = S.vm.scene.environment;
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

// --- AI soldiers ----------------------------------------------------------------------------------------
class SoldierBrain extends BotBrain {
  constructor(game, player) {
    super(game, player, { chattiness: 0.35 });
    this.dontAvoidEdges = true;
    this.allowGapJumps = false;
    this.path = [];
    this.skill = rr(0.5, 0.95);
    this.enemy = null; this.engagedAt = 0; this.burstLeft = 0; this.pause = 0; this.strafeDir = 1; this.strafeT = 0;
    this.lastHurt = null;
    this.arriveRadius = 3;
  }
  idleChat() { this.say(pick(['contact!', 'moving up', 'reloading', 'cover me', 'they are on the roof', 'enemy down', 'go go go', 'need backup', 'lol'])); }
  hurtBy(shooter) { this.lastHurt = { p: shooter, t: this.game.world.time }; }
  onKill() { if (Math.random() < 0.3) this.say(pick(['got one', 'enemy down', 'ez', 'tango down'])); }
  get map() { return S.map; }
  nearestNode(p) { let best = 0, bd = Infinity; this.map.nodes.forEach((n, i) => { const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < bd) { bd = d; best = i; } }); return best; }
  planTo(goal) {
    const start = this.nearestNode(this.ch.rootPosition);
    const prev = new Map([[start, -1]]), q = [start];
    while (q.length) { const c = q.shift(); if (c === goal) break; for (const n of this.map.nodes[c].n) if (!prev.has(n)) { prev.set(n, c); q.push(n); } }
    const path = []; let c = goal;
    while (c !== undefined && c !== -1) { path.unshift(c); c = prev.get(c); }
    this.path = path;
  }
  visible(from, ch) {
    for (const off of [1.5, 0.3]) {
      const to = ch.rootPosition.clone(); to.y += off;
      const hit = this.game.world.raycast(from, to, { mask: GROUP.WORLD | GROUP.DYNAMIC });
      if (!hit || hit.distance > from.distanceTo(to) - 0.8) return true;
    }
    return false;
  }
  findEnemy() {
    const me = this.ch, eye = me.headPosition;
    let best = null, bd = 260;
    for (const o of this.game.players) {
      const c = o.character;
      if (!c?.alive || o.team === this.player.team) continue;
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
  think() {
    const ch = this.ch;
    const enemy = this.findEnemy();
    if (enemy && enemy !== this.enemy) { this.engagedAt = this.game.world.time + rr(0.25, 0.65) / this.skill; this.aimErr = 1; }
    this.enemy = enemy;
    const gun = ch.tool;
    if (gun instanceof Gun && gun.ammo === 0 && !gun.reloading) {
      if (gun.reserve > 0) startReload(this.game, this.player); else this.equipFirst(this.player.backpack[1]?.name);
    }
    if (enemy) {
      // fight: strafe a little, close in if out of range
      const d = enemy.character.rootPosition.distanceTo(ch.rootPosition);
      const away = ch.rootPosition.clone().sub(enemy.character.rootPosition).setY(0).normalize();
      const side = new THREE.Vector3(-away.z, 0, away.x);
      if ((this.strafeT -= 0.35) <= 0) { this.strafeT = rr(1, 2.5); this.strafeDir = Math.random() < 0.5 ? -1 : 1; }
      const range = gun?.stats?.range || 100;
      const want = Math.min(range * 0.5, gun?.stats?.pellets ? 15 : 60);
      this.target = ch.rootPosition.clone().addScaledVector(side, this.strafeDir * 6).addScaledVector(away, d > want ? -6 : 0);
      if (ch.health < 35 && S.map.cover.length) {
        let bc = null, bdist = 25;
        for (const [x, z] of S.map.cover) { const dd = Math.hypot(x - ch.rootPosition.x, z - ch.rootPosition.z); if (dd < bdist) { bdist = dd; bc = [x, z]; } }
        if (bc) this.target = new THREE.Vector3(bc[0] - away.x * -3, ch.rootPosition.y, bc[1] - away.z * -3);
      }
      return;
    }
    // patrol: walk the streets toward the other side
    if (!this.path.length) {
      const nodes = this.map.nodes;
      const eastSide = this.player.team?.name === 'Coalition';
      const choices = nodes.map((n, i) => i).filter((i) => (eastSide ? nodes[i].x < 40 : nodes[i].x > -40));
      this.planTo(pick(choices));
    }
    const n = this.map.nodes[this.path[0]];
    if (n) {
      this.target = new THREE.Vector3(n.x + rr(-3, 3), ch.rootPosition.y, n.z + rr(-3, 3));
      if (Math.hypot(n.x - ch.rootPosition.x, n.z - ch.rootPosition.z) < 5) this.path.shift();
    }
    // turn toward whoever is shooting at us
    if (this.lastHurt && this.game.world.time - this.lastHurt.t < 2 && this.lastHurt.p.character?.alive) {
      const t = this.lastHurt.p.character.rootPosition;
      ch.lockFacing = Math.atan2(-(t.x - ch.rootPosition.x), -(t.z - ch.rootPosition.z));
    } else ch.lockFacing = null;
  }
  aimDir(origin) {
    const e = this.enemy?.character;
    if (!e) return this.ch.lookVector;
    const d = origin.distanceTo(e.rootPosition);
    const aim = e.rootPosition.clone(); aim.y += Math.random() < 0.18 * this.skill ? 1.55 : 0.3;
    // human-like error: worse at range, while the target moves, and right after spotting them
    const err = d * 0.03 * (1.5 - this.skill) * (this.aimErr || 1) * (1 + Math.min(1, Math.hypot(e.body.velocity.x, e.body.velocity.z) / 16) * 0.6);
    aim.x += rr(-err, err); aim.y += rr(-err, err) * 0.6; aim.z += rr(-err, err);
    return aim.sub(origin).normalize();
  }
  combat(dt) {
    const ch = this.ch, e = this.enemy?.character;
    if (!ch?.alive) return;
    const gun = ch.tool;
    if (!e?.alive || !(gun instanceof Gun)) { if (!this.lastHurt || this.game.world.time - this.lastHurt.t > 2) ch.lockFacing = null; ch.aimPitch = 0; return; }
    const to = e.rootPosition.clone().sub(ch.rootPosition);
    ch.lockFacing = Math.atan2(-to.x, -to.z);
    ch.aimPitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
    ch.walkSpeed = 13;
    if (this.game.world.time < this.engagedAt) return;
    this.aimErr = Math.max(0.35, (this.aimErr || 1) - dt * 0.4);
    // shoot in bursts
    this.pause -= dt;
    if (this.pause > 0) return;
    const st = gun.stats;
    if (!st.auto && this.game.world.time < (gun.nextBot || 0)) return;
    if (tryFire(this.game, this.player, gun, st.spread[0] * 0.55)) {
      if (!st.auto) gun.nextBot = this.game.world.time + Math.max(60 / st.rpm, rr(0.25, 0.6) / this.skill);
      if (st.auto && --this.burstLeft <= 0) { this.burstLeft = Math.floor(rr(3, 8)); this.pause = rr(0.2, 0.6); }
    }
  }
}
