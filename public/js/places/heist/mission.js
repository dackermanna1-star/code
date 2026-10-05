// The heist itself: planning, casing the bank (with an optional stealthy
// start), the hold-up, hostages, the police response in waves, the keycard
// door, the hacked vault gate, the drill and the vault door, bagging the loot,
// the back door to the alley and the getaway van. The chase and the results
// are in chase.js.
import * as THREE from 'three';
import { S } from './state.js';
import { FL } from './map.js';
import { Effects } from '../warzone/fx.js';
import { ViewModel } from '../warzone/viewmodel.js';
import { Hud } from '../warzone/hud.js';
import { GUNS } from '../warzone/guns.js';
import { Gun, bindCombat, updateLocalGun, startReload, drawGunPreview, rr, DEG } from '../warzone/combat.js';
import { pick } from '../../engine/Bots.js';
import { sounds } from '../../engine/Sound.js';
import { PlanningBoard, HeistHud, Minimap, HackGame, CREW, PRIMARIES, ARMOR, money } from './ui.js';
import { buildVan, buildSedan, buildSwatTruck, buildDrill, buildBag, flashLights } from './models.js';
import { CivBrain, CrewBrain, CopBrain, spawnNPC, spawnCop, customerLook, staffLook, guardLook, crewLook, putOnMask, nearestNode } from './npcs.js';
import * as A from './audio.js';
import { startChase, updateChase, finishHeist, failHeist } from './chase.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PROFILE_KEY = 'heist-profile-v1';
export function loadProfile() { try { return { balance: 0, done: 0, best: 0, ...(JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}')) }; } catch { return { balance: 0, done: 0, best: 0 }; } }
export function saveProfile(p) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* private mode */ } }

// who says what (subtitle colours and voices)
export const WHO = {
  lenny: { name: 'Lenny', color: '#ffb84a', voice: 0, pitch: 0.85, rate: 1.0 },
  you: { name: 'You', color: '#ffffff', voice: 1, pitch: 0.7, rate: 1.1 },
  crew: { name: 'Gunman', color: '#7fc0ff', voice: 2, pitch: 1.0, rate: 1.1 },
  hacker: { name: 'Hacker', color: '#a0ffa0', voice: 3, pitch: 1.25, rate: 1.15 },
  driver: { name: 'Driver', color: '#ff9ad0', voice: 4, pitch: 0.95, rate: 1.1 },
  cops: { name: 'RPD Megaphone', color: '#7aa8ff', voice: 1, pitch: 0.6, rate: 0.95 },
  staff: { name: 'Bank staff', color: '#dddddd', voice: 5, pitch: 1.2, rate: 1.2 },
};
export function say(who, text, secs = 4, speakIt = true) {
  const w = WHO[who] || { name: who, color: '#fff' };
  S.ui.say(w.name, text, secs, w.color);
  if (speakIt) A.speak(text.replace(/<[^>]+>/g, ''), { pitch: w.pitch, rate: w.rate, voice: w.voice });
}

// --- setup -----------------------------------------------------------------------------------------------
export function setupHeist(game) {
  const world = game.world;
  S.game = game; S.world = world;
  if (world.shadows) {
    world.renderer.shadowMap.type = THREE.PCFShadowMap;
    const c = world.sun.shadow.camera; c.left = -90; c.right = 90; c.top = 90; c.bottom = -90; c.far = 600; c.updateProjectionMatrix();
    world.sun.shadow.mapSize.set(2048, 2048); world.sun.shadow.bias = -0.0005; world.sun.shadow.normalBias = 0.05;
  }
  world.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  game.resize(window.innerWidth, window.innerHeight);
  game.respawnTime = 6;
  game.forceFieldTime = 0;
  game.setStats([]);
  S.crewTeam = game.addTeam('Crew', 26);
  S.policeTeam = game.addTeam('Police', 23);
  const sp = world.add({ size: [4, 0.2, 4], position: [-6, 0.6, -63], transparency: 1, canCollide: false });
  sp.userData.yaw = Math.PI;
  game.addSpawn(sp);

  S.fx = new Effects(world); S.fx.corpseLife = 240; S.fx.maxCorpses = 28;
  S.vm = new ViewModel(world);
  // indoor light for the first-person gun
  S.vm.scene.children.filter((o) => o.isDirectionalLight)[0].intensity = 1.7;
  S.hud = new Hud(game.gui.root, game);
  S.ui = new HeistHud(game.gui.root);
  S.mouse = { fire: false, ads: false, adsToggle: false, clicked: false, look: [0, 0] };
  S.targets = [];
  S.onFire = (p) => { if (p.isLocal) S.stats.shots++; };
  S.onLocalHit = () => { S.stats.hits++; };
  S.onWorldHit = (hit) => { if (hit.part?.userData.glass) { breakGlass(hit.part); return true; } return false; };
  S.onHitCharacter = (shooter, victim) => { if (victim.player?.brain instanceof CivBrain && victim.player.brain.state === 'idle' && !S.loud && shooter.isLocal) goLoud('shots'); };
  S.onManagerErrand = (out) => { if (out && !S.loud && S.phase === 'casing' && !S.flags.keycard) say('lenny', 'The manager just went for coffee. His <b>office is empty</b> - now\'s your chance.', 4); };
  S.onExit = (close) => { A.stopAll(); close(); };
  bindCombat(S);
  window.__heist = S; S.V = THREE.Vector3; S.debug = debugApi(game);

  S.profile = loadProfile();
  S.phase = 'plan';
  S.doors = { keycard: false, gate: false, vault: false, back: false };
  S.flags = {};
  S.loud = false; S.susp = 0;
  S.bag = { value: 0, weight: 0, cap: 20 };
  S.stats = { kills: 0, heads: 0, shots: 0, hits: 0, civ: 0, escaped: 0, cops: 0, cars: 0, heli: false, t0: 0 };
  S.police = { eta: null, wave: 0, next: 0, arrived: false, units: [], cars: [] };
  S.civs = []; S.cops = [];
  S.armor = 0; S.armorMax = 0;
  S.timers = {};

  // first person, always
  const cam = game.camera;
  cam.zoom = () => {};
  cam.distance = 0.35;
  cam._updateFirstPerson();
  const rotate = cam.rotate.bind(cam);
  cam.rotate = (dy, de) => { if (S.lockLook) return; const k = world.camera.fov / 75; rotate(dy * k, de * k); };
  world.camera.fov = 75; world.camera.updateProjectionMatrix();
  const equip = game.equip.bind(game);
  game.equip = (p, i) => { if (p.equipped === i) return; equip(p, i); };
  game.labelRange = 150;
  game.labelVisible = (p) => p === S.crew;

  // the van out front, the minimap
  S.van = buildVan(); S.van.position.set(4, 0, -74.5); S.van.rotation.y = -Math.PI / 2; world.scene.add(S.van);
  S.vanPart = world.add({ size: [19, 8.8, 8], position: [4, 4.4, -74.5], transparency: 1, name: 'Car' }); S.vanPart.userData.metal = true;
  const rects = [{ x0: -200, x1: 200, z0: -200, z1: 200, col: '#4a4a4c' }];
  for (const b of S.city.blocks) rects.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, col: '#8a8780' }, { x0: b.x0 + 12, x1: b.x1 - 12, z0: b.z0 + 12, z1: b.z1 - 12, col: '#6a6a70' });
  rects.push({ x0: -70, x1: 70, z0: -68, z1: 58, col: '#8a8780' }, { x0: -52, x1: 52, z0: -42, z1: 58, col: '#a8a49a' });
  rects.push(...S.bank.rects);
  S.minimap = new Minimap(S.ui.mmCanvas, rects, 60);

  game.on('playerAdded', (p) => { if (p.isLocal) { game.setTeam(p, S.crewTeam); S.me = p; } });
  game.on('spawned', (p, ch) => {
    if (!p.isLocal) return;
    ch.ragdoll = true;
    p.appearanceOverride = p.appearanceOverride || null;
    ch.damageFilter = (dmg) => {
      if (S.armor > 0) { const a = Math.min(S.armor, dmg * 0.8); S.armor -= a; dmg -= a; }
      return dmg * (S.plan?.diff === 'hard' ? 1.25 : 1);
    };
    if (S.masked) putOnMask(ch, S.plan.mask);
    if (S.phase !== 'plan') { giveLoadout(); }
    cam.fixed = null; cam.distance = 0.35; cam._updateFirstPerson();
    S.vm.visible = true; S.deadCam = null; S.hud.showDeath(null);
    if (S.respawned) { ch.giveForceField(3); S.respawned = false; }
  });
  game.on('died', (p, killer) => onDeath(game, p, killer));

  // input
  const canvas = game.canvas;
  canvas.addEventListener('mousedown', (e) => {
    if (S.modal) return;
    if (S.phase === 'intro') { S.skipIntro = true; return; }
    if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
    if (e.button === 0) { S.mouse.fire = true; S.mouse.clicked = true; }
    if (e.button === 2) S.mouse.ads = true;
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) S.mouse.fire = false; if (e.button === 2) S.mouse.ads = false; });
  window.addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { S.mouse.look[0] += e.movementX; S.mouse.look[1] += e.movementY; } });
  window.addEventListener('keydown', (e) => {
    if (S.modal || game.gui.chatFocused) return;
    const k = e.key.toLowerCase();
    if (S.phase === 'intro' && (k === ' ' || k === 'enter')) { S.skipIntro = true; return; }
    if (k === 'r') startReload(game, game.localPlayer);
    if (k === 'e' && !e.repeat) { if (S.prompt) S.holdE = true; else S.mouse.adsToggle = !S.mouse.adsToggle; }
    if (k === 'g' && !e.repeat) maskUp();
    if (k === 'f' && !e.repeat) shout();
    if (k === 'm' && !e.repeat) { sounds.setMuted(!sounds.muted); }
  });
  window.addEventListener('keyup', (e) => { if (e.key.toLowerCase() === 'e') S.holdE = false; });
  window.addEventListener('blur', () => { S.holdE = false; S.mouse.fire = false; });
  world.onUpdate((dt) => { for (const p of game.players) if (p.character?.alive && p.character.health < 50 && Math.random() < dt * 1.2) S.fx.drip(p.character.rootPosition.clone().setY(p.character.rootPosition.y - 1)); });

  buildInteractions();
  startPlanning(game);
}

function debugApi(game) {
  return {
    loud: () => { if (S.phase === 'plan' || S.phase === 'intro') { S.board?.close(); beginHeist(game, S.board?.choice || {}); S.skipIntro = true; } goLoud('debug'); },
    start: (choice = {}) => { S.board?.close(); beginHeist(game, { ...(S.board?.choice || {}), ...choice }); S.skipIntro = true; },
    keycard: () => { S.flags.keycard = true; S.bank.keycard.visible = false; },
    openAll: () => { openDoor('keycard'); openDoor('gate'); },
    drillDone: () => { if (S.drill) S.drill.progress = 0.999; },
    police: () => { S.police.eta = 0.1; },
    tp: (x, z, y = FL) => { const ch = game.localPlayer.character; ch.body.position.set(x, y + 3, z); ch.body.velocity.set(0, 0, 0); },
    loot: (v = 900000) => { S.bag.value += v; S.bag.weight += 10; },
    van: () => { S.vanAlley = true; placeVanInAlley(); },
    chase: () => startChase(game),
  };
}

// --- planning and the intro ------------------------------------------------------------------------------------
function startPlanning(game) {
  S.phase = 'plan';
  S.modal = true;
  S.ui.show(false);
  S.lockLook = true;
  A.startMusic(); A.setMusic(0);
  S.board = new PlanningBoard(game.gui.root, {
    balance: S.profile.balance, done: S.profile.done, last: S.profile.last, potential: potentialValue(),
    preview: (c, id, att) => drawGunPreview(c, id, att),
    bankPic: (cv) => drawBankPic(game, cv),
    onClick: () => { sounds.unlock(); A.startMusic(); A.beep(1200, 0.03, 0.15); },
    onStart: (choice) => { sounds.unlock(); beginHeist(game, choice); },
  });
}
function drawBankPic(game, cv) {
  // a snapshot of the front of the bank for the board's photo
  try {
    const world = game.world, r = world.renderer;
    const cam = new THREE.PerspectiveCamera(50, cv.width / cv.height, 0.5, 3000);
    cam.position.set(46, 16, -106); cam.lookAt(0, 16, -46);
    const size = r.getSize(new THREE.Vector2());
    r.setSize(cv.width * 2, cv.height * 2, false);
    r.render(world.scene, cam);
    cv.getContext('2d').drawImage(r.domElement, 0, 0, cv.width, cv.height);
    r.setSize(size.x, size.y, false);
  } catch { /* the photo is just decoration */ }
}

function beginHeist(game, choice) {
  S.plan = choice;
  S.profile.last = choice; saveProfile(S.profile);
  A.setVoices(choice.voices !== false);
  S.gunmanDef = CREW.gunman.find((c) => c.id === choice.gunman);
  S.hackerDef = CREW.hacker.find((c) => c.id === choice.hacker);
  S.driverDef = CREW.driver.find((c) => c.id === choice.driver);
  WHO.crew.name = S.gunmanDef.name.replace(/ ".*"/, ''); WHO.hacker.name = S.hackerDef.name; WHO.driver.name = S.driverDef.name;
  const arm = ARMOR.find((a) => a.id === choice.armor) || ARMOR[0];
  S.armor = S.armorMax = arm.armor; S.armorSpeed = arm.speed;
  S.lives = choice.diff === 'hard' ? 2 : 3;
  S.modal = false;
  S.phase = 'intro';
  S.introT = 0; S.skipIntro = false;
  S.ui.show(true); S.ui.letterbox(true); S.ui.cinematic(true); S.hud.el.style.display = 'none';
  S.stats.t0 = game.world.time;
  populateBank(game);
  const me = game.localPlayer;
  if (me) {
    // the heist outfit: a black suit (and later the mask)
    const base = me.appearance || {};
    me.appearanceOverride = crewLook(base.colors?.head ?? 24);
    S.vm.setAppearance(me.appearanceOverride, 0x111111);
    game.spawnPlayer(me);
  }
  say('lenny', 'Alright, listen up. The First Robloxia Bank. Payday was yesterday, so that vault is <b>stuffed</b>.', 5);
  say('lenny', 'Walk in like customers. If you can, lift the manager\'s <b>keycard</b> and kill the <b>silent alarm</b> in the security room.', 6);
  say('lenny', 'Then mask up and do it fast. Good luck.', 3.5);
}

function populateBank(game) {
  const sp = S.bank.spots;
  const civ = (role, [x, z, yaw], lk) => {
    const p = spawnNPC(game, x, FL + 0.05, z, yaw, { name: role === 'customer' ? 'Customer' : role === 'teller' ? 'Teller' : role === 'manager' ? 'Bank manager' : 'Loan officer', look: lk, kind: 'civ', brain: (g, pl) => new CivBrain(g, pl, role, [x, z, yaw]) });
    S.civs.push(p);
    return p;
  };
  for (const s of sp.customers) civ('customer', s, customerLook());
  for (const s of sp.tellers) civ('teller', s, staffLook('#2a3a5a'));
  S.manager = civ('manager', sp.manager, staffLook('#1c1c1c'));
  civ('officer', sp.loanOfficer, staffLook('#4a4a52'));
  // guards: civilians until the shooting starts
  for (const [x, z, yaw] of sp.guards) {
    const p = spawnNPC(game, x, FL + 0.05, z, yaw, { name: 'Security guard', kind: 'guard', look: guardLook(), gear: 'guard', health: 110, guns: [['glock', []]], holstered: true, brain: (g, pl) => new CopBrain(g, pl, 'guard', { dormant: true, mode: 'hold', hold: V(x, FL, z), skill: rr(0.3, 0.5), sight: 120 }) });
    p.home = [x, z, yaw];
    p.brain.faceTarget = yaw; p.brain.hold.face = yaw;
    S.guards = S.guards || []; S.guards.push(p);
  }
  // your gunman, in a suit until you mask up
  const g = S.gunmanDef;
  S.crew = spawnNPC(game, -2, 0.55, -63, Math.PI, { name: g.name.replace(/ ".*"/, ''), kind: 'crew', look: crewLook(pick([24, 18, 38, 125]), '#2a2a2e'), team: S.crewTeam, health: g.hp, guns: [[g.gun, g.gun === 'm4' ? ['holo'] : ['reddot']]], holstered: true, brain: (gm, p) => new CrewBrain(gm, p, g) });
}

function giveLoadout() {
  const me = S.game.localPlayer;
  if (!me?.character?.alive) return;
  if (!S.masked) { me.backpack = []; me.equipped = -1; S.vm.setWeapon(null); return; }
  const P = PRIMARIES.find((p) => p.id === S.plan.primary) || PRIMARIES[3];
  me.backpack = [new Gun(S.game, me, P.id, P.att), new Gun(S.game, me, S.plan.sidearm || 'glock', [])];
  for (const g of me.backpack) g.reserve = Math.round(g.reserve * 1.5);
  me.equipped = -1;
  S.game.gui?.onBackpackChanged(me);
  S.game.equip(me, 0);
}

// --- masks, going loud ----------------------------------------------------------------------------------------
function maskUp() {
  if (S.masked || !S.plan || S.phase === 'plan' || S.phase === 'intro' || S.phase === 'chase' || S.phase === 'over') return;
  const ch = S.game.localPlayer?.character;
  if (!ch?.alive) return;
  S.masked = true;
  A.whoosh();
  S.ui.maskOn(S.plan.mask);
  putOnMask(ch, S.plan.mask);
  giveLoadout();
  if (!S.loud) S.game.world.delay(0.7, () => goLoud('mask'));
}

export function goLoud(reason) {
  if (S.loud) return;
  const game = S.game, world = game.world;
  S.loud = true; S.phase = 'loud'; S.loudAt = world.time;
  if (!S.masked) { S.masked = true; const ch = game.localPlayer?.character; if (ch?.alive) { S.ui.maskOn(S.plan.mask); putOnMask(ch, S.plan.mask); giveLoadout(); } }
  A.setMusic(1);
  if (reason === 'spotted') say('staff', 'Hey! You can\'t be back here! <b>SECURITY!</b>', 2.5);
  else if (reason === 'drill') say('lenny', 'That drill is loud. Everybody heard it. <b>Go go go!</b>', 3);
  say('you', '<b>EVERYBODY ON THE FLOOR! THIS IS A ROBBERY!</b>', 3);
  // the crew masks up too
  if (S.crew?.character?.alive) { putOnMask(S.crew.character, S.gunmanDef.mask); S.game.equip(S.crew, 0); }
  // hostages hit the floor, screaming
  for (const p of S.civs) {
    const b = p.brain; if (!p.character?.alive) continue;
    b.errand = null;
    b.getDown(rr(0.2, 1.4));
    if (Math.random() < 0.5) world.delay(rr(0, 0.8), () => p.character?.alive && A.scream(p.character.rootPosition, rr(0.9, 1.4)));
  }
  // guards draw on you
  for (const p of S.guards || []) {
    if (!p.character?.alive) continue;
    p.brain.dormant = false; game.setTeam(p, S.policeTeam); game.equip(p, 0);
    p.brain.engagedAt = world.time + rr(0.8, 1.6);
  }
  // the silent alarm (unless you cut it)
  if (!S.flags.alarmOff) {
    callPolice(60);
    world.delay(1.5, () => { A.alarmBell(0.18); say('lenny', 'The silent alarm went off. Cops are on the way. Clock\'s ticking!', 4); });
  } else {
    world.delay(2, () => say('lenny', 'Alarm\'s dead, nobody\'s called it in yet. Use the time!', 4));
  }
  // the driver brings the van round the back
  world.delay(4, () => { say('driver', 'I\'m moving the van to the alley out back. Exit through the <b>cash room</b>.', 4.5); S.vanAlley = true; });
  updateObjectives();
}

function callPolice(base) {
  if (S.police.eta != null || S.police.arrived) return;
  const hard = S.plan.diff === 'hard';
  S.police.eta = base * (hard ? 0.8 : 1) + (S.hackerDef?.delay || 0);
  S.stars = 1;
  A.setMusic(1);
}

// --- interactions -------------------------------------------------------------------------------------------------
function buildInteractions() {
  const I = S.bank.interact;
  S.inter = [
    { id: 'keycard', pos: I.keycard, r: 5.5, time: 1.2, label: 'take the manager\'s keycard', can: () => !S.flags.keycard, done: () => { S.flags.keycard = true; S.bank.keycard.visible = false; A.beep(2200, 0.05, 0.2); S.ui.popup('KEYCARD'); if (!S.loud) say('lenny', 'Got the keycard. Smooth.', 2.5); updateObjectives(); } },
    { id: 'alarm', pos: I.alarm, r: 5, time: 4, label: 'cut the silent alarm', can: () => !S.flags.alarmOff && !S.loud, done: () => { S.flags.alarmOff = true; A.beep(600, 0.2, 0.25); say('hacker', 'Alarm\'s looped. They won\'t get a call when this goes loud.', 4); updateObjectives(); } },
    { id: 'reader', pos: I.reader, r: 5, time: 1, label: () => (S.flags.keycard ? 'swipe the keycard' : S.loud ? 'plant a breaching charge' : 'Keycard required'), ok: () => S.flags.keycard || S.loud, can: () => !S.doors.keycard && !S.breaching, done: () => { if (S.flags.keycard) { A.beep(2400, 0.06, 0.2); setTimeout(() => A.beep(3000, 0.08, 0.2), 90); openDoor('keycard'); } else plantCharge(); } },
    { id: 'term', pos: I.term, r: 5, time: 0.6, label: 'hack the vault gate', can: () => S.doors.keycard && !S.doors.gate && !S.hack, done: () => startHack() },
    { id: 'drill', pos: I.vault, r: 6, time: 2.2, label: 'set up the drill', can: () => S.doors.gate && !S.drill, done: () => placeDrill() },
    { id: 'fix', pos: I.vault, r: 7, time: 2.5, label: 'fix the drill', can: () => S.drill?.jammed, done: () => { S.drill.jammed = false; A.beep(1500, 0.1, 0.2); updateObjectives(); } },
    { id: 'back', pos: I.back, r: 5, time: 0.8, label: 'open the back door', can: () => !S.doors.back && S.loud, done: () => openDoor('back') },
    { id: 'medkit', pos: V(-47, FL + 4.2, 37), r: 5, time: 1.5, label: 'use the first aid kit', can: () => S.loud && !S.flags.medkit1 && (S.game.localPlayer?.character?.health ?? 100) < 100, done: () => { S.flags.medkit1 = true; heal(); S.bank.medkits?.[0] && (S.bank.medkits[0].visible = false); } },
    { id: 'medkit', pos: V(-47.5, FL + 4.5, -14), r: 5, time: 1.5, label: 'use the first aid kit', can: () => S.loud && !S.flags.medkit2 && (S.game.localPlayer?.character?.health ?? 100) < 100, done: () => { S.flags.medkit2 = true; heal(); S.bank.medkits?.[1] && (S.bank.medkits[1].visible = false); } },
    { id: 'van', pos: V(28, 0.5, 70), r: 7, time: 0.8, label: () => (S.bag.value > 0 ? 'get in the van' : 'leave with nothing?'), can: () => S.vanAlley && S.loud, done: () => { S.phase = 'chase'; startChase(S.game); } },
  ];
  for (const L of S.bank.loot) {
    S.inter.push({
      id: 'loot', loot: L, pos: L.pos, r: 4.5, time: L.kind === 'gold' ? 1.6 : L.kind === 'box' ? 2.4 : 1.1,
      label: () => (S.bag.weight + L.weight > S.bag.cap + 0.01 ? 'Your bag is full' : L.kind === 'box' ? 'drill open the safe deposit box' : `grab the ${L.label} (${money(L.value * lootMult())})`),
      ok: () => S.bag.weight + L.weight <= S.bag.cap + 0.01,
      can: () => L.grabs > 0 && (L.room !== 'vault' || S.doors.vault) && (L.room !== 'cash room' || S.doors.keycard) && S.loud,
      done: () => grab(L),
    });
  }
}
function heal() {
  const ch = S.game.localPlayer?.character;
  if (ch?.alive) ch.health = ch.maxHealth;
  S.armor = Math.max(S.armor, S.armorMax * 0.5);
  A.zipper(); S.ui.popup('+HEALTH', '#7cf27c');
}
/** Dead officers drop a magazine or two. */
function dropAmmo(pos) {
  const world = S.game.world;
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.7), new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.8 }));
  m.position.set(pos.x, pos.y, pos.z); world.scene.add(m);
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.15, 0.72), new THREE.MeshStandardMaterial({ color: 0xd8b040, emissive: 0x6a5010 })); band.position.copy(m.position); world.scene.add(band);
  S.pickups = S.pickups || [];
  S.pickups.push({ m, band, t: 0 });
}
function updatePickups(dt) {
  const me = S.game.localPlayer?.character;
  for (const p of [...(S.pickups || [])]) {
    p.t += dt; p.m.rotation.y += dt * 1.5; p.band.rotation.y = p.m.rotation.y;
    if (me?.alive && me.rootPosition.distanceTo(p.m.position) < 4.5) {
      for (const g of S.game.localPlayer.backpack) if (g.stats) g.reserve += g.stats.mag;
      A.beep(1800, 0.04, 0.15); S.ui.popup('+AMMO', '#ffd040');
      S.game.world.scene.remove(p.m); S.game.world.scene.remove(p.band); S.pickups.splice(S.pickups.indexOf(p), 1);
    } else if (p.t > 90) { S.game.world.scene.remove(p.m); S.game.world.scene.remove(p.band); S.pickups.splice(S.pickups.indexOf(p), 1); }
  }
}
/** Everything in the bank, at normal difficulty. */
export function potentialValue() {
  return Math.round(S.bank.loot.reduce((s, L) => s + (L.kind === 'box' ? 40000 : L.value * L.grabs), 0) / 10000) * 10000;
}
const lootMult = () => (S.plan?.diff === 'hard' ? 1.5 : 1);
const BOX_LOOT = [['a stack of cash', 25000], ['a diamond necklace', 85000], ['gold coins', 40000], ['a Rolex', 30000], ['bearer bonds', 60000], ['a rubber duck', 0], ['grandma\'s dentures', 0], ['a signed photo of Builderman', 5000], ['a can of Bloxy Cola', 0], ['Tix. So many Tix.', 12000], ['a ruby ring', 45000], ['nothing but old letters', 0]];
function grab(L) {
  const m = lootMult();
  let v = L.value * m, what = L.label;
  if (L.kind === 'box') { const [w, val] = pick(BOX_LOOT); what = w; v = val * m; S.ui.popup(v ? `${w}  +${money(v)}` : `${w}... worthless`, v ? '#7cf27c' : '#ffb0a0'); }
  else S.ui.popup(`+${money(v)}`);
  S.fx.burst(L.kind === 'gold' ? S.fx.mats.spark : (S.cashMat ||= new THREE.SpriteMaterial({ color: 0x8ac070 })), L.pos.clone(), 10, { speed: [2, 6], size: [0.15, 0.3], life: [0.4, 0.9], gravity: 0.6 });
  S.bag.value += v; S.bag.weight += L.weight;
  L.grabs--;
  A.rustle(L.pos); if (S.bag.weight > 0) A.zipper();
  if (L.mesh) {
    if (L.kind === 'gold') { const bars = L.mesh.children.filter((c) => c.geometry?.type === 'ExtrudeGeometry' && c.visible); bars.sort((a, b) => b.position.y - a.position.y); for (let i = 0; i < Math.ceil(bars.length / 4) && i < bars.length; i++) bars[i].visible = false; if (L.grabs <= 0) for (const b of bars) b.visible = false; }
    else if (L.grabs <= 0) L.mesh.visible = false;
  }
  if (!S.firstGrab) { S.firstGrab = true; say('lenny', 'Take what you can carry. Gold is worth more but it\'s heavy. Then get to the van!', 4.5); }
  if (S.bag.weight >= S.bag.cap - 0.01) S.ui.popup('BAG FULL', '#ffd040');
  void what;
  updateObjectives();
}

function nearestInteraction(ch) {
  const world = S.game.world, eye = world.camera.position;
  const look = new THREE.Vector3(); world.camera.getWorldDirection(look);
  let best = null, bs = Infinity;
  for (const it of S.inter) {
    if (!it.can()) continue;
    const d = it.pos.distanceTo(ch.rootPosition.clone().setY(it.pos.y));
    if (d > it.r || Math.abs(it.pos.y - ch.rootPosition.y) > 6) continue;
    const to = it.pos.clone().sub(eye).normalize();
    const facing = to.dot(look);
    if (facing < 0.55 && d > 2.5) continue;
    const score = d * (1.6 - facing);
    if (score < bs) { bs = score; best = it; }
  }
  return best;
}

function updateInteraction(ch, dt) {
  const it = S.phase === 'loud' || S.phase === 'casing' ? nearestInteraction(ch) : null;
  if (it !== S.prompt) { S.prompt = it; S.holdT = 0; }
  if (!it) { S.ui.setPrompt(null); S.holdE = false; return; }
  const ok = it.ok ? it.ok() : true;
  const label = typeof it.label === 'function' ? it.label() : it.label;
  if (S.holdE && ok) {
    S.holdT += dt / it.time;
    if (S.holdT >= 1) { S.holdT = 0; S.holdE = false; S.prompt = null; it.done(); S.ui.setPrompt(null); return; }
  } else S.holdT = 0;
  S.ui.setPrompt(ok ? `Hold <b>E</b> to ${label}` : label, S.holdT, ok);
}

// --- doors, charges, hacking, the drill, the vault ----------------------------------------------------------------
export function openDoor(name) {
  if (S.doors[name]) return;
  S.doors[name] = true;
  const part = S.bank.doors[name], world = S.game.world;
  const p0 = part.body.position.clone(), q0 = part.body.quaternion.clone();
  let t = 0;
  const dur = name === 'vault' ? 5 : name === 'gate' ? 2.2 : 1.1;
  if (name === 'keycard') { S.bank.readerLed.material.emissive.set(0x20ff40); A.clunk(part.mesh.position, 1.4); }
  if (name === 'gate') A.clunk(part.mesh.position, 0.9);
  if (name === 'back') A.slam(part.mesh.position);
  const off = world.onUpdate((dt) => {
    t = Math.min(1, t + dt / dur);
    const e = t * t * (3 - 2 * t);
    if (name === 'keycard') part.body.position.set(p0.x + 5.6 * e, p0.y, p0.z);
    if (name === 'gate') part.body.position.set(p0.x, p0.y + 12.5 * e, p0.z);
    if (name === 'back' || name === 'vault') {
      const hinge = name === 'back' ? V(34, p0.y, 56.8) : V(6.9, p0.y, 28);
      const ang = (name === 'back' ? -1.65 : -1.72) * e;
      const rel = V(p0.x - hinge.x, 0, p0.z - hinge.z).applyAxisAngle(V(0, 1, 0), ang);
      part.body.position.set(hinge.x + rel.x, p0.y, hinge.z + rel.z);
      const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), ang).multiply(new THREE.Quaternion(q0.x, q0.y, q0.z, q0.w));
      part.body.quaternion.set(q.x, q.y, q.z, q.w);
    }
    part.body.aabbNeedsUpdate = true;
    if (t >= 1) off();
  });
  updateObjectives();
}

function plantCharge() {
  S.breaching = true;
  const world = S.game.world;
  const pos = V(11, FL + 5, -2.3);
  const charge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 0.5), new THREE.MeshStandardMaterial({ color: 0x5a6a3a }));
  charge.position.copy(pos); world.scene.add(charge);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2020, emissiveIntensity: 3 }));
  led.position.set(pos.x, pos.y + 0.6, pos.z - 0.3); world.scene.add(led);
  say('you', 'Charge is set! <b>Get back!</b>', 2.5);
  S.ui.big('5', '', 1);
  for (let i = 0; i < 5; i++) world.delay(i, () => { A.beep(2600 + i * 200, 0.1, 0.3, pos); if (i > 0) S.ui.big(String(5 - i), '', 1); });
  world.delay(5, () => {
    world.scene.remove(charge); world.scene.remove(led);
    blast(pos, 9, 140, S.game.localPlayer?.character);
    // the door comes off its rails
    const door = S.bank.doors.keycard;
    world.remove(door);
    const flying = world.add({ size: [6, 10, 0.8], position: [11, FL + 5, -1], anchored: false, color: 194, name: 'Debris' });
    flying.mesh.material = door.mesh.material; flying.userData.metal = true;
    flying.body.velocity.set(rr(-6, 6), 25, 60); flying.body.angularVelocity.set(rr(-4, 4), rr(-2, 2), rr(-3, 3));
    S.doors.keycard = true; S.breaching = false;
    updateObjectives();
  });
}

/** An explosion: fireball, smoke, sparks, a shake, and damage that falls off with distance. */
export function blast(pos, radius, dmg, by) {
  const world = S.game.world;
  world.spawnExplosionEffect(pos, radius * 0.6);
  S.fx.burst(S.fx.mats.dust, pos, 40, { speed: [4, 22], size: [1.5, 3.5], life: [1.2, 2.6], gravity: 0.05, grow: 2.5 });
  S.fx.burst(S.fx.mats.spark, pos, 30, { speed: [10, 40], size: [0.1, 0.25], life: [0.3, 0.9], gravity: 1 });
  const L = S.fx.lights[1]; L.l.position.copy(pos); L.l.intensity = 80; L.l.distance = radius * 6; L.t = 0.15;
  A.explosion(pos, radius / 8);
  shake(Math.max(0, 1 - world.camera.position.distanceTo(pos) / 90) * 1.2);
  for (const ch of [...world.characters]) {
    if (!ch.alive) continue;
    const d = ch.rootPosition.distanceTo(pos);
    if (d > radius) continue;
    const k = 1 - d / radius;
    ch.lastHit = { limb: 0, dir: ch.rootPosition.clone().sub(pos).normalize(), weapon: 'Explosion', head: false, by: by?.player };
    ch.takeDamage(ch.damageFilter ? ch.damageFilter(dmg * k, 'torso', by?.player) : dmg * k, by);
    if (!ch.alive) for (const d2 of ch.debris || []) { const v = d2.body.position; const dir = V(v.x - pos.x, v.y - pos.y + 2, v.z - pos.z).normalize(); d2.body.velocity.x += dir.x * 40 * k; d2.body.velocity.y += 20 * k; d2.body.velocity.z += dir.z * 40 * k; }
  }
  // blow out nearby glass
  for (const g of [...S.bank.glass]) if (!g.destroyed && g.mesh.position.distanceTo(pos) < radius * 1.6) breakGlass(g);
}
export function shake(amount) { S.shake = Math.max(S.shake || 0, amount); }

function startHack() {
  const game = S.game;
  S.modal = true; S.mouse.fire = false;
  document.exitPointerLock?.();
  const h = S.hackerDef;
  say('hacker', 'I\'m in their system. Match the letters as they pass the lock bars - I\'ll do the rest.', 4);
  S.hack = new HackGame(game.gui.root, {
    time: h.time, lives: h.lives,
    onKey: (ok) => (ok ? A.beep(2200, 0.05, 0.2) : A.beep(300, 0.25, 0.3)),
    onDone: (ok) => {
      S.hack = null; S.modal = false;
      if (ok) { A.chime(true); openDoor('gate'); say('hacker', 'Gate\'s open! Get that drill on the vault.', 3.5); }
      else { A.chime(false); say('hacker', 'Locked out! Give me a few seconds and try again.', 3.5); S.hackCooldown = game.world.time + 6; }
      game.canvas.requestPointerLock?.();
    },
  });
}

function placeDrill() {
  const world = S.game.world;
  if (!S.loud) goLoud('drill');
  const d = buildDrill();
  d.position.set(0, FL + 7.2, 27.1); world.scene.add(d);
  const hard = S.plan.diff === 'hard';
  const jams = [rr(0.18, 0.32), rr(0.45, 0.6), rr(0.72, 0.88)].slice(0, hard ? 3 : 2 + (Math.random() < 0.4 ? 1 : 0));
  S.drill = { model: d, progress: 0, time: hard ? 100 : 80, jams, jammed: false };
  A.drillLoop(0.32);
  A.clunk(d.position, 1.2);
  say('you', 'Drill\'s running!', 2);
  if (S.flags.alarmOff && S.police.eta == null && !S.police.arrived) { callPolice(40); world.delay(3, () => say('lenny', 'Someone heard the drill and called it in. <b>Cops in under a minute.</b>', 4)); A.alarmBell(0.18); }
  S.timers.breach = world.time + 26; // SWAT will come through the back
  A.setMusic(2);
  updateObjectives();
}

function updateDrill(dt) {
  const D = S.drill; if (!D || D.done) return;
  const bit = D.model.userData.bit, light = D.model.userData.light;
  if (!D.jammed) {
    D.progress = Math.min(1, D.progress + dt / D.time);
    bit.rotation.y += dt * 30;
    if (Math.random() < dt * 30) S.fx.burst(S.fx.mats.spark, V(rr(-0.2, 0.2), FL + 7.2, 27.9), 2, { speed: [4, 12], size: [0.06, 0.12], life: [0.15, 0.4], gravity: 1, dir: V(0, 0.3, -1), cone: 1.2 });
    if (D.jams.length && D.progress >= D.jams[0]) {
      D.jams.shift(); D.jammed = true;
      say(pick(['you', 'crew']), pick(['The drill\'s jammed! <b>Fix it!</b>', 'Drill stopped! Somebody fix that thing!', 'Damn it, the drill jammed!']), 3);
      updateObjectives();
    }
  } else if (Math.random() < dt * 3) S.fx.burst(S.fx.mats.dust, V(0, FL + 8, 26.5), 1, { speed: [0.5, 2], size: [0.6, 1.2], life: [0.8, 1.6], gravity: -0.05, grow: 2 });
  light.material.emissive.set(D.jammed ? 0xff2020 : 0x20ff40);
  if (D.jammed && Math.floor(S.game.world.time * 2) !== D.beepT) { D.beepT = Math.floor(S.game.world.time * 2); A.beep(900, 0.12, 0.25, D.model.position); }
  A.drillLoop().set?.(D.jammed ? 0 : 1);
  if (D.progress >= 1) {
    D.done = true; A.stopLoop('drill');
    say('crew', 'The drill\'s through! Vault\'s opening!', 3);
    openVault();
  }
}

function openVault() {
  const world = S.game.world;
  const wheel = S.bank.vaultWheel;
  let t = 0;
  const off = world.onUpdate((dt) => { t += dt; wheel.rotation.z += dt * 2.5 * Math.min(1, t); if (t > 2.4) off(); });
  A.clunk(V(0, FL + 7, 27), 0.7); world.delay(0.8, () => A.clunk(V(0, FL + 7, 27), 0.6)); world.delay(1.6, () => A.clunk(V(0, FL + 7, 27), 0.5));
  world.delay(2.4, () => {
    A.rumble(V(0, FL + 7, 27), 5);
    shake(0.25);
    world.scene.remove(S.drill.model);
    openDoor('vault');
    S.stars = Math.max(S.stars, 4);
    world.delay(3, () => say('lenny', 'Look at all that! Grab the cash, grab the gold. Don\'t get greedy.', 4));
  });
}

// --- the police -----------------------------------------------------------------------------------------------------
const COVER = [
  // where cruisers stop out front (x, z, skid angle); their officers take cover on the far side
  [-32, -86, 0.35], [6, -90, -0.25], [40, -85, 0.3], [-62, -82, -0.4], [66, -81, 0.2],
];
function policeArrive() {
  const world = S.game.world;
  S.police.arrived = true; S.police.eta = null; S.stars = Math.max(S.stars || 0, 2);
  A.siren(0.0);
  S.police.next = world.time + (S.plan.diff === 'hard' ? 32 : 42);
  for (let i = 0; i < 3; i++) world.delay(i * 1.4, () => cruiser(COVER[i], 'police'));
  world.delay(5, () => say('cops', 'This is the Robloxia Police Department! The building is surrounded! <b>Come out with your hands up!</b>', 5));
  world.delay(11, () => say('lenny', 'They\'re setting up out front. Stay away from the windows and keep moving.', 4));
  A.setMusic(2);
  updateObjectives();
}

/** A police car drives in along Main Street, skids to a stop and its officers get out behind it. */
function cruiser(spot, kind) {
  const world = S.game.world;
  const [cx, cz, skew] = spot;
  const swat = kind === 'swat' || kind === 'heavy';
  const car = swat ? buildSwatTruck() : buildSedan({ police: true, unit: String(10 + ((Math.random() * 80) | 0)) });
  const fromEast = cx > 0 ? Math.random() < 0.8 : Math.random() < 0.2;
  const fromX = cx + (fromEast ? 340 : -340);
  const ry0 = fromEast ? Math.PI / 2 : -Math.PI / 2, ry = ry0 + skew;
  car.position.set(fromX, 0, cz); car.rotation.y = ry0;
  world.scene.add(car);
  S.police.cars.push(car);
  let t = 0;
  const dur = 3.2;
  const off = world.onUpdate((dt) => {
    t = Math.min(1, t + dt / dur);
    const e = 1 - Math.pow(1 - t, 3);
    car.position.x = fromX + (cx - fromX) * e;
    car.rotation.y = ry0 + skew * Math.max(0, (t - 0.7) / 0.3);
    for (const w of car.userData.wheels || []) w.rotation.x -= dt * (1 - e) * 30;
    if (t > 0.75 && !car.userData.screeched) { car.userData.screeched = true; A.screech(car.position); }
    if (t >= 1) {
      off();
      const size = car.userData.size;
      const part = world.add({ size: [size[0], size[1] * 0.75, size[2]], position: [cx, size[1] * 0.375, cz], transparency: 1, name: 'Car' });
      placePart(part, cx, size[1] * 0.375, cz, ry);
      part.userData.metal = true;
      const n = swat ? 4 : 2;
      for (let i = 0; i < n; i++) {
        // out of the doors on the street side, into cover behind the car
        const along = (i - (n - 1) / 2) * (swat ? 3.5 : 7);
        const hold = V(cx + along, 0.05, cz - size[0] / 2 - 3.2 - rr(0, 1.2)); hold.face = Math.PI;
        const holdUntil = world.time + (swat ? rr(4, 10) : rr(14, 28));
        const ck = swat ? (kind === 'heavy' && i === 0 ? 'heavy' : 'swat') : 'police';
        const p = spawnCop(S.game, ck, cx + along, 0.05, cz - size[0] / 2 - 1.5, Math.PI, { mode: 'hold', hold, holdUntil });
        S.cops.push(p);
      }
    }
  });
}

function updatePolice(dt) {
  const world = S.game.world, P = S.police;
  if (P.eta != null) {
    P.eta -= dt;
    if (P.eta <= 0) policeArrive();
  }
  if (P.arrived) {
    for (const c of P.cars) flashLights(c, world.time);
    // the siren is loud outside and muffled deep inside the bank
    const me = world.camera.position;
    const d = Math.min(...P.cars.map((c) => c.position.distanceTo(me)));
    A.setLoopVolume('siren', Math.max(0.03, 0.22 * (1 - d / 160)));
    S.cops = S.cops.filter((p) => S.game.players.includes(p));
    const alive = S.cops.filter((p) => p.character?.alive).length;
    const max = S.plan.diff === 'hard' ? 11 : 8;
    if (world.time > P.next && alive < max) {
      P.wave++;
      P.next = world.time + (S.plan.diff === 'hard' ? 30 : 40);
      const swat = P.wave >= 2;
      const spot = COVER[(P.wave + 2) % COVER.length];
      cruiser(spot, swat ? (P.wave >= 4 ? 'heavy' : 'swat') : 'police');
      if (P.wave === 2) { S.stars = Math.max(S.stars, 3); world.delay(2, () => say('lenny', '<b>SWAT\'s here.</b> They\'re wearing armor - aim for the head.', 4)); }
      if (P.wave === 4) world.delay(2, () => say('lenny', 'Heavy SWAT with a machine gun. Don\'t stand in the open!', 4));
      // all units move in
      for (const p of S.cops) if (p.brain && p.brain.mode === 'hold' && Math.random() < 0.6) p.brain.holdUntil = world.time + rr(0, 6);
    }
    if (S.timers.breach && world.time > S.timers.breach) { S.timers.breach = null; breachTeam(); }
  }
}

/** SWAT come up the alley and blow the back door. */
function breachTeam() {
  const world = S.game.world;
  const from = Math.random() < 0.5 ? 1 : -1;
  const truck = buildSwatTruck(); truck.position.set(from * 70, 0, 70); truck.rotation.y = from > 0 ? -Math.PI / 2 : Math.PI / 2; world.scene.add(truck);
  S.police.cars.push(truck);
  const part = world.add({ size: [8.6, 7.5, 21], position: [from * 70, 3.75, 70], transparency: 1, name: 'Car' }); placePart(part, from * 70, 3.75, 70, Math.PI / 2);
  say('hacker', 'Heads up - SWAT team in the <b>alley</b>. They\'re going for the back door!', 4);
  const team = [];
  for (let i = 0; i < 4; i++) {
    const p = spawnCop(S.game, i === 0 && S.police.wave >= 3 ? 'heavy' : 'swat', from * (60 - i * 2), 0.05, 66 + i * 1.5, from > 0 ? Math.PI / 2 : -Math.PI / 2, { mode: 'hold', hold: V(42 + i * 1.5, 0.05, 63 + (i % 2) * 2), holdUntil: Infinity });
    S.cops.push(p); team.push(p);
  }
  // when they're stacked up at the door, it blows
  const check = world.onUpdate(() => {
    const ready = team.filter((p) => p.character?.alive && p.character.rootPosition.distanceTo(V(40, 0.5, 63)) < 8).length;
    if (S.doors.back) { check(); for (const p of team) if (p.brain) { p.brain.mode = 'assault'; p.brain.holdUntil = 0; } return; }
    if (ready >= 2 || team.every((p) => !p.character?.alive)) {
      check();
      if (!team.some((p) => p.character?.alive)) return;
      const pos = V(37, FL + 4, 57.4);
      A.beep(2600, 0.1, 0.3, pos);
      world.delay(1.2, () => {
        blast(pos, 10, 120, team[0].character);
        const door = S.bank.doors.back;
        world.remove(door);
        const flying = world.add({ size: [6, 10, 0.5], position: [37, FL + 5, 56.6], anchored: false, color: 194, name: 'Debris' });
        flying.mesh.material = door.mesh.material; flying.userData.metal = true;
        flying.body.velocity.set(rr(-5, 5), 18, -55); flying.body.angularVelocity.set(rr(-3, 3), rr(-3, 3), rr(-3, 3));
        S.doors.back = true;
        for (const p of team) if (p.brain) { p.brain.mode = 'assault'; p.brain.holdUntil = 0; }
        updateObjectives();
      });
    }
  });
}

// --- hostages and detection -----------------------------------------------------------------------------------------
function updateHostages(dt) {
  const world = S.game.world, me = S.game.localPlayer?.character;
  if (!S.loud) return;
  const eye = world.camera.position;
  const look = new THREE.Vector3(); world.camera.getWorldDirection(look);
  const aiming = me?.alive && me.tool;
  let n = 0, warn = 0;
  const rate = (S.plan.diff === 'hard' ? 1 / 32 : 1 / 46);
  for (const p of S.civs) {
    const b = p.brain, ch = p.character;
    if (!ch?.alive || !b) continue;
    if (b.escaped) {
      S.stats.escaped++;
      S.ui.popup('A hostage escaped!  -$20,000', '#ffb0a0');
      if (S.police.eta != null) S.police.eta = Math.max(1, S.police.eta - 12);
      else if (!S.police.arrived && S.flags.alarmOff) { callPolice(35); say('lenny', 'A hostage got out! <b>Cops are coming.</b>', 3.5); }
      b.escaped = false; b.state = 'gone';
      S.game.removePlayer(p);
      continue;
    }
    if (b.state !== 'down' && b.state !== 'flee') continue;
    n++;
    // pointing a gun at a hostage keeps them down
    if (aiming) {
      const head = ch.rootPosition.clone(); head.y += 0.5;
      const to = head.clone().sub(eye); const d = to.length(); to.normalize();
      if (d < 45 && to.dot(look) > Math.cos(9 * DEG)) { b.fear = Math.min(1, b.fear + dt * 1.5); if (b.state === 'flee' && d < 30) { b.getDown(); } }
    }
    if (b.state === 'down') {
      b.fear -= dt * rate * b.decay * (S.police.arrived ? 1.25 : 1);
      if (b.fear < 0.3) warn++;
      if (b.fear <= 0) b.flee();
    } else warn++;
    // a warning "!" over hostages who are about to run
    if (!b.icon) { b.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: excl(), depthTest: false, transparent: true })); b.icon.scale.set(1.4, 1.4, 1); b.icon.renderOrder = 9; world.scene.add(b.icon); }
    b.icon.visible = b.fear < 0.3 || b.state === 'flee';
    b.icon.position.set(ch.rootPosition.x, ch.rootPosition.y + 3.6, ch.rootPosition.z);
  }
  for (const p of S.civs) if (p.brain?.icon && (!p.character?.alive || p.brain.state === 'gone')) { world.scene.remove(p.brain.icon); p.brain.icon = null; }
  const inside = me?.alive && me.rootPosition.z > -42 && Math.abs(me.rootPosition.x) < 52;
  S.ui.setHostages(n, warn, n > 0 && inside && !S.doors.vault);
  // the gunman yells at them too
  const crew = S.crew?.character;
  if (crew?.alive && (S.crewShoutT = (S.crewShoutT ?? 8) - dt) <= 0) {
    S.crewShoutT = rr(9, 15);
    let any = false;
    for (const p of S.civs) { const b = p.brain; if (p.character?.alive && (b?.state === 'down' || b?.state === 'flee') && p.character.rootPosition.distanceTo(crew.rootPosition) < 35) { b.fear = Math.min(1, b.fear + 0.5); if (b.state === 'flee') b.getDown(); any = true; } }
    if (any && Math.random() < 0.6) say('crew', pick(['Stay down!', 'Nobody move!', 'Heads on the floor!', 'Don\'t be a hero!']), 2, false);
  }
}
let EXCL = null;
function excl() {
  if (EXCL) return EXCL;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#ffd020'; x.beginPath(); x.moveTo(32, 2); x.lineTo(62, 58); x.lineTo(2, 58); x.closePath(); x.fill();
  x.fillStyle = '#111'; x.font = 'bold 40px Arial'; x.textAlign = 'center'; x.fillText('!', 32, 52);
  EXCL = new THREE.CanvasTexture(c); EXCL.colorSpace = THREE.SRGBColorSpace;
  return EXCL;
}

function shout() {
  if (!S.loud || !S.masked) return;
  const world = S.game.world, me = S.game.localPlayer?.character;
  if (!me?.alive || world.time < (S.shoutT || 0)) return;
  S.shoutT = world.time + 2.2;
  const line = pick(['GET DOWN!', 'ON THE FLOOR! NOW!', 'NOBODY MOVES, NOBODY GETS HURT!', 'HEADS DOWN! EYES ON THE FLOOR!', 'STAY DOWN!']);
  say('you', `<b>${line}</b>`, 1.8);
  let calmed = 0;
  for (const p of S.civs) {
    const b = p.brain, ch = p.character;
    if (!ch?.alive || !b || (b.state !== 'down' && b.state !== 'flee')) continue;
    if (ch.rootPosition.distanceTo(me.rootPosition) > 48) continue;
    b.fear = 1; if (b.state === 'flee') b.getDown(); calmed++;
  }
  // cops who hear you shouting know where you are
  void calmed;
}

/** Before the heist goes loud: staff and guards notice you in places you shouldn't be. */
function updateDetection(dt) {
  if (S.loud || S.phase !== 'casing') { S.ui.setSuspicion(0); return; }
  const me = S.game.localPlayer?.character, world = S.game.world;
  if (!me?.alive) return;
  const p = me.rootPosition;
  const zone = S.bank.zones.find((z) => p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1);
  let rise = 0;
  if (zone) {
    const watchers = [...S.civs, ...(S.guards || [])].filter((w) => w.character?.alive && (w.brain?.watcher || w.brain?.dormant));
    for (const w of watchers) {
      const c = w.character, eye = c.headPosition;
      const to = p.clone().sub(c.rootPosition); const d = to.length();
      if (d > 34) continue;
      to.y = 0; to.normalize();
      const facing = V(-Math.sin(c.facing), 0, -Math.cos(c.facing));
      if (to.dot(facing) < Math.cos(55 * DEG) && d > 4) continue;
      const tgt = p.clone(); tgt.y += 1;
      // walls block the view; clear glass doesn't (frosted glass does)
      const hit = world.raycast(eye, tgt, { mask: 1 });
      if (hit && hit.distance < eye.distanceTo(tgt) - 1.2 && !(hit.part?.userData.glass && !hit.part.userData.frosted)) continue;
      rise = Math.max(rise, d < 10 ? 0.9 : d < 20 ? 0.45 : 0.22);
    }
  }
  S.susp = rise ? Math.min(1, S.susp + dt * rise) : Math.max(0, S.susp - dt * 0.25);
  if (rise && !S.suspWarned && S.susp > 0.35) { S.suspWarned = true; say('lenny', 'Careful - someone\'s looking at you. <b>Get out of sight!</b>', 3); }
  S.ui.setSuspicion(S.susp, S.susp > 0.65 ? 'ALERTED' : 'SUSPICIOUS');
  if (S.susp >= 1) { S.ui.setSuspicion(0); goLoud('spotted'); }
}

// --- glass, deaths, respawning ----------------------------------------------------------------------------------------
export function breakGlass(part) {
  if (part.destroyed) return;
  const world = S.game.world, pos = part.mesh.position.clone();
  world.remove(part);
  S.bank.glass = S.bank.glass.filter((g) => g !== part);
  A.glassBreak(pos);
  const mat = new THREE.SpriteMaterial({ color: 0xcfe8f0, transparent: true, opacity: 0.8 });
  S.fx.burst(mat, pos, 26, { speed: [3, 12], size: [0.1, 0.3], life: [0.5, 1.2], gravity: 1 });
}

function onDeath(game, p, killer) {
  const ch = p.character;
  const info = ch?.lastHit || {};
  const imp = info.dir ? info.dir.clone().multiplyScalar(info.head ? 26 : 18).add(V(0, 6, 0)) : null;
  S.fx.adoptCorpse(ch, info.limb ?? 0, imp);
  const corpse = S.fx.corpses[S.fx.corpses.length - 1];
  const civ = p.brain instanceof CivBrain;
  if (p.brain?.icon) { game.world.scene.remove(p.brain.icon); p.brain.icon = null; }
  if (!p.isLocal) {
    S.hud.kill(killer ? killer.name : '', civ ? 'Civilian' : p.name, info.weapon || '', info.head, killer?.team?.name === 'Crew' ? 'Coalition' : 'Militia', p.team?.name === 'Crew' ? 'Coalition' : 'Militia');
    if (killer?.isLocal) {
      if (civ) { S.stats.civ++; S.ui.popup('Civilian killed  -$25,000', '#ff8070'); }
      else { S.stats.kills++; if (info.head) S.stats.heads++; S.ui.popup(info.head ? 'HEADSHOT' : '+KILL', info.head ? '#ff5050' : '#ffffff'); }
    } else if (killer === S.crew && !civ) S.stats.kills += 0;
    if (p === S.crew) {
      say('lenny', `${WHO.crew.name} is down! Keep going - their cut is yours now.`, 4);
      S.crewDead = true;
    }
    if (p.team === S.policeTeam && ch && Math.random() < 0.75) { const at = ch.rootPosition.clone(); at.y -= 2.6; dropAmmo(at); }
    // NPCs don't come back
    game.world.delay(0.05, () => game.removePlayer(p));
    return;
  }
  // you
  if (S.hack) { S.hack.abort(); S.hack = null; S.modal = false; }
  S.lives--;
  S.vm.visible = false;
  S.mouse.fire = false; S.mouse.ads = false; S.mouse.adsToggle = false;
  S.deadCam = { corpse, until: game.world.time + game.respawnTime };
  if (S.lives <= 0) {
    if (p.respawnTimer) { game.world.cancel(p.respawnTimer); p.respawnTimer = null; }
    game.world.delay(3, () => failHeist('You were killed.'));
    return;
  }
  // respawn somewhere safer, depending on how far you got
  const spot = S.doors.vault ? V(0, FL + 0.1, 44) : S.doors.gate ? V(0, FL + 0.1, 18) : S.doors.keycard ? V(-38, FL + 0.1, 30) : V(-40, FL + 0.1, -33);
  p.spawnOverride = { position: spot, yaw: Math.PI };
  S.respawned = true;
  S.ui.big('DOWN', `${S.lives} ${S.lives === 1 ? 'life' : 'lives'} left`, 3, '#ff6050');
  // bodies in the line of fire forget you a moment
  S.lastSeen = null;
}

// --- objectives ----------------------------------------------------------------------------------------------------
export function updateObjectives() {
  const o = [];
  const F = S.flags;
  if (S.phase === 'casing') {
    o.push({ text: 'Go into the bank' , done: S.inBank });
    o.push({ text: 'Steal the manager\'s <b>keycard</b> (office)', done: F.keycard, opt: true });
    o.push({ text: 'Cut the <b>silent alarm</b> (security room)', done: F.alarmOff, opt: true });
    o.push({ text: 'Put on your mask: <b>G</b>' });
  } else if (S.phase === 'loud') {
    if (!S.doors.keycard) o.push({ text: F.keycard ? 'Use the keycard on the <b>STAFF ONLY</b> door' : 'Get the <b>keycard</b> (manager\'s office) or blow the <b>STAFF ONLY</b> door' });
    else if (!S.doors.gate) o.push({ text: 'Hack the vault gate <b>terminal</b>' });
    else if (!S.drill) o.push({ text: 'Set up the <b>drill</b> on the vault door' });
    else if (!S.doors.vault) o.push({ text: S.drill.jammed ? '<b>Fix the drill!</b>' : 'Defend the drill' });
    else o.push({ text: 'Grab the <b>loot</b> in the vault', done: S.bag.weight >= S.bag.cap - 0.01 });
    if (S.doors.vault || S.bag.value > 0) o.push({ text: 'Get to the <b>van</b> in the back alley' });
    o.push({ text: 'Keep the hostages down: <b>F</b> to shout', opt: true });
  }
  S.ui.setObjectives(o);
}

// --- per frame -------------------------------------------------------------------------------------------------------
export function updateHeist(game, dt) {
  if (!S.ui) return;
  const world = game.world, cam = game.camera;
  S.ui.update(dt); S.hud.update(dt);
  if (S.hack) S.hack.update(dt);
  if (S.phase === 'plan') {
    // the camera drifts around the bank behind the planning board
    const t = world.time * 0.05;
    cam.fixed = { position: V(Math.sin(t) * 150, 60, -60 - Math.cos(t) * 150), lookAt: V(0, 14, -20) };
    S.vm.visible = false;
    return;
  }
  if (S.phase === 'intro') { updateIntro(game, dt); return; }
  if (S.phase === 'chase' || S.phase === 'over') { updateChase(game, dt); return; }
  if (S.phase === 'casing' && !S.inBank) {
    const me = game.localPlayer?.character;
    if (me?.alive && me.rootPosition.z > -40 && Math.abs(me.rootPosition.x) < 50) { S.inBank = true; updateObjectives(); }
  }
  localUpdate(game, dt);
  for (const p of game.players) p.brain?.combat?.(dt);
  updateDetection(dt);
  updateHostages(dt);
  updatePolice(dt);
  updateDrill(dt);
  updatePickups(dt);
  if (S.vanAlley && !S.vanPlaced) {
    const me = game.localPlayer?.character;
    if (!me || me.rootPosition.z > -40) placeVanInAlley();
  }
  if (S.vanPlaced) {
    const me = game.localPlayer?.character;
    S.van.userData.setDoors(me && me.rootPosition.distanceTo(V(28, 1, 70)) < 22 ? 1 : 0);
  }
  // HUD
  const stars = S.stars || 0;
  S.ui.setStars(stars, S.police.eta != null || S.police.arrived);
  S.ui.setTake(S.bag.value, S.bag.weight / S.bag.cap);
  const timers = [];
  if (S.police.eta != null) timers.push({ label: 'POLICE ARRIVING', value: fmt(S.police.eta) });
  if (S.drill && !S.drill.done) timers.push({ label: S.drill.jammed ? 'DRILL JAMMED' : 'DRILL', value: `${Math.floor(S.drill.progress * 100)}%  ${fmt((1 - S.drill.progress) * S.drill.time)}`, p: S.drill.progress, cls: S.drill.jammed ? '' : 'yel' });
  if (S.police.arrived) timers.push({ label: `POLICE ASSAULT · WAVE ${S.police.wave + 1}`, cls: 'blue' });
  S.ui.setTimers(timers);
  const me = game.localPlayer?.character;
  S.ui.setVitals(me?.alive ? me.health : 0, S.armor, S.armorMax, S.lives);
  S.ui.setKeys(S.masked ? '' : 'Mask up <b>G</b>');
  if ((S.mmT = (S.mmT || 0) - dt) <= 0) { S.mmT = 1 / 30; drawMinimap(game); }
  if (S.shake > 0) { cam.yaw += (Math.random() - 0.5) * S.shake * 0.03; cam.elevation += (Math.random() - 0.5) * S.shake * 0.03; S.shake = Math.max(0, S.shake - dt * 1.5); }
}
/** Move an anchored part (and tell the physics broadphase it moved). */
export function placePart(part, x, y, z, yaw = 0) {
  part.setPosition(x, y, z);
  part.setQuaternion(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw));
  if (part.body) part.body.aabbNeedsUpdate = true;
}
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function placeVanInAlley() {
  S.vanPlaced = true;
  S.van.position.set(40, 0, 70); S.van.rotation.y = -Math.PI / 2;
  placePart(S.vanPart, 40, 4.4, 70, Math.PI / 2);
  updateObjectives();
}

function updateIntro(game, dt) {
  const cam = game.camera;
  S.introT += dt;
  const k = Math.min(1, S.introT / 13);
  const e = k * k * (3 - 2 * k);
  // fly in along Main Street to the van parked out front
  const a = V(330, 55, -88), m = V(70, 22, -90), b = V(-6, 6.2, -63);
  const pos = e < 0.6 ? a.clone().lerp(m, e / 0.6) : m.clone().lerp(b, (e - 0.6) / 0.4);
  cam.fixed = { position: pos, lookAt: V(0, 16 - 8 * e, -44 + 12 * e) };
  S.vm.visible = false;
  if (S.introT > 13.5 || S.skipIntro) {
    S.phase = 'casing';
    cam.fixed = null; S.lockLook = false;
    cam.yaw = Math.PI; cam.elevation = 0;
    S.ui.letterbox(false); S.ui.cinematic(false); S.hud.el.style.display = '';
    S.vm.visible = true;
    updateObjectives();
    S.ui.setKeys('Mask up <b>G</b>');
    if (S.skipIntro) { S.ui.subQueue.length = 0; S.ui._nextSub(); }
    window.speechSynthesis?.cancel();
    say('lenny', 'The manager takes coffee breaks. That\'s your window for the keycard.', 4);
    game.canvas.requestPointerLock?.();
  }
}

function localUpdate(game, dt) {
  const me = game.localPlayer, ch = me?.character;
  const look = S.mouse.look; S.mouse.look = [0, 0];
  if (!ch || !ch.alive) {
    S.vm.visible = false;
    S.hud.setCrosshair(0, false); S.hud.setScope(null);
    S.ui.setPrompt(null);
    if (S.deadCam) {
      const t = S.deadCam.corpse?.debris?.[0]?.body?.position;
      if (t) game.camera.fixed = { position: V(t.x + 6, t.y + 9, t.z + 6), lookAt: V(t.x, t.y, t.z) };
      S.hud.showDeath(S.lives > 0 ? 'YOU WENT DOWN' : 'WASTED', S.lives > 0 ? `Back in ${Math.max(0, Math.ceil(S.deadCam.until - game.world.time))}` : '');
    }
    return;
  }
  const bagSlow = 1 - Math.min(0.4, S.bag.weight * 0.02);
  updateLocalGun(game, dt, look, { blocked: !!S.modal, noFire: !S.masked, speed: (S.armorSpeed || 1) * bagSlow, noSprint: S.bag.weight > 12 });
  S.vm.visible = !!S.masked;
  updateInteraction(ch, dt);
  // shooting out glass
  void 0;
}

function drawMinimap(game) {
  const me = game.localPlayer?.character;
  if (!me) return;
  const blips = [];
  if (S.crew?.character?.alive) blips.push({ x: S.crew.character.rootPosition.x, z: S.crew.character.rootPosition.z, color: '#4aa0ff', r: 4.5 });
  for (const p of S.cops) { const c = p.character; if (c?.alive) blips.push({ x: c.rootPosition.x, z: c.rootPosition.z, color: '#ff3a3a', r: 4 }); }
  for (const p of S.guards || []) { const c = p.character; if (c?.alive && S.loud) blips.push({ x: c.rootPosition.x, z: c.rootPosition.z, color: '#ff3a3a', r: 4 }); }
  for (const p of S.civs) { const c = p.character; if (c?.alive && p.brain?.state !== 'gone') blips.push({ x: c.rootPosition.x, z: c.rootPosition.z, color: p.brain?.icon?.visible ? '#ffd020' : '#e8e8e8', r: 2.6 }); }
  // the next objective
  const obj = objectivePos();
  if (obj) blips.push({ x: obj.x, z: obj.z, color: '#ffd020', shape: 'star', edge: true });
  if (S.vanPlaced) blips.push({ x: 40, z: 70, color: '#3adc5a', shape: 'sq', edge: true });
  const yaw = game.camera.yaw;
  S.minimap.draw(me.rootPosition.x, me.rootPosition.z, yaw, blips);
}
function objectivePos() {
  const I = S.bank.interact;
  if (S.phase === 'casing') return !S.inBank ? V(0, 0, -40) : !S.flags.keycard ? I.keycard : !S.flags.alarmOff ? I.alarm : null;
  if (S.phase !== 'loud') return null;
  if (!S.doors.keycard) return S.flags.keycard ? I.reader : I.keycard;
  if (!S.doors.gate) return I.term;
  if (!S.drill || S.drill.jammed) return I.vault;
  if (!S.doors.vault) return I.vault;
  if (S.bag.weight < S.bag.cap - 2) return V(0, 0, 44);
  return V(28, 0, 70);
}
export { V };
