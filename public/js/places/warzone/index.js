// "Desert Strike": a team shooter place. Coalition vs Militia in a desert
// town, realistic guns you unlock with money earned from kills, rag-doll
// deaths and blood. A user-made place in this 2008 ROBLOX (it uses its own
// GUI and modern effects on purpose).
import * as THREE from 'three';
import { pick } from '../../engine/Bots.js';
import { GUNS } from './guns.js';
import { Effects } from './fx.js';
import { Gun, GunnerBrain, bindCombat, startReload, updateLocalGun, drawGunPreview, rr } from './combat.js';
import { ViewModel } from './viewmodel.js';
import { buildMap, desertSky } from './map.js';
import { Hud, BuyMenu } from './hud.js';

const SCORE_LIMIT = 50, ROUND_TIME = 600;
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
    S.buy = new BuyMenu(game.gui.root, S.profile, { onChange: () => { saveProfile(); S.hud.setCash(S.profile.cash); maybeApplyLoadout(game); }, preview: (c, id, atts) => drawGunPreview(c, id, atts) });
    S.hud.setCash(S.profile.cash);
    S.mouse = { fire: false, ads: false, clicked: false, look: [0, 0] };
    bindCombat(S);
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
      if (k === 'r' && !S.buy.open) startReload(game, game.localPlayer);
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
  updateLocalGun(game, dt, look, { blocked: S.buy.open });
  S.hud.setHealth(ch.health);
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

// --- AI soldiers ----------------------------------------------------------------------------------------
class SoldierBrain extends GunnerBrain {
  constructor(game, player) {
    super(game, player);
    this.path = [];
  }
  idleChat() { this.say(pick(['contact!', 'moving up', 'reloading', 'cover me', 'they are on the roof', 'enemy down', 'go go go', 'need backup', 'lol'])); }
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
  think() {
    const ch = this.ch;
    const enemy = this.scan();
    const gun = ch.tool;
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
}
