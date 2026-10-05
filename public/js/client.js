// The game client window (/Game/Play.aspx). In 2008 the website's Visit
// button started the ROBLOX app, which ran /game/join.ashx: "Connecting to
// server...", then a live "Bricks: N   Connectors: M" count while the place
// streamed in, then your character. This page plays that sequence, builds the
// place locally and fills the server with simulated players.
import * as THREE from 'three';
import { Game } from './engine/Game.js';
import { Gui } from './engine/Gui.js';
import { BotBrain } from './engine/Bots.js';
import { sounds } from './engine/Sound.js';
import { loadPlace } from './places/index.js';

const JOIN = window.RBX_JOIN || {};
const canvas = document.getElementById('GameCanvas');
const guiRoot = document.getElementById('Gui');
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

function postJSON(url, body, beacon = false) {
  const data = JSON.stringify(body);
  if (beacon && navigator.sendBeacon) return navigator.sendBeacon(url, new Blob([data], { type: 'application/json' }));
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: data, credentials: 'same-origin' })
    .then((r) => r.json()).catch(() => null);
}

// The engine runs before the place arrives, so the place's per-frame hook is
// filled in later.
const placeHook = { update: null };
const game = new Game({ canvas, place: placeHook });
const gui = new Gui(game, guiRoot, { buildMode: false });
window.game = game; // handy for debugging from the console

function resize() { game.resize(window.innerWidth, window.innerHeight); }
window.addEventListener('resize', resize);
resize();

// Join-time camera: slowly pull back to frame the whole map.
function joinCamera(world) {
  const box = new THREE.Box3();
  for (const p of world.parts) if (p.size.x < 400 && p.size.z < 400) box.expandByObject(p.mesh);
  if (box.isEmpty()) box.set(new THREE.Vector3(-20, 0, -20), new THREE.Vector3(20, 10, 20));
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(30, box.getSize(new THREE.Vector3()).length() * 0.6);
  const shot = { position: new THREE.Vector3(), lookAt: c };
  let t = 0;
  const stop = world.onUpdate((dt) => {
    t += dt;
    const k = Math.min(1, t / 6);
    const d = r * (0.45 + 0.55 * k);
    shot.position.set(c.x - d * 0.55, c.y + d * 0.5, c.z - d * 0.65);
  });
  shot.position.set(c.x - r * 0.25, c.y + r * 0.22, c.z - r * 0.3);
  game.camera.fixed = shot;
  return stop;
}

async function countBricks(world) {
  const bricks = world.parts.size;
  const connectors = world.physics.constraints.length + Math.floor(bricks * 0.6);
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    gui.setJoinStatus(`Bricks: ${Math.round(bricks * i / steps)}   Connectors: ${Math.round(connectors * i / steps)}`);
    await wait(0.06 + Math.random() * 0.06);
  }
}

let place = null;
let info = null;
let reported = { KOs: 0, Wipeouts: 0 };

function report(leaving) {
  const me = game.localPlayer;
  if (!me || !info || info.player.guest) return null;
  const ko = (me.stats.KOs || 0) - reported.KOs;
  const wo = (me.stats.Wipeouts || 0) - reported.Wipeouts;
  reported = { KOs: me.stats.KOs || 0, Wipeouts: me.stats.Wipeouts || 0 };
  return postJSON('/Game/Report.ashx', { placeId: info.place.id, knockouts: Math.max(0, ko), wipeouts: Math.max(0, wo), leaving }, leaving);
}

function closeWindow() {
  game.running = false;
  report(true);
  window.close();
  // the window was not opened by the site (e.g. a direct link): go back instead
  setTimeout(() => { location.href = `/Item.aspx?ID=${JOIN.placeId}`; }, 150);
}

function exitGame() {
  if (place?.onExit) { place.onExit(game, closeWindow); return; }
  closeWindow();
}

async function addBots(bots) {
  for (const b of bots) {
    await wait(0.8 + Math.random() * 2.5);
    if (!game.running) return;
    const p = game.addPlayer({ name: b.name, userId: b.id, appearance: b.appearance, isBot: true });
    if (!p.brain) p.brain = new BotBrain(game, p);
    game.spawnPlayer(p);
  }
}

async function main() {
  game.start();
  gui.setJoinStatus('Connecting to server...');
  await wait(0.6);
  let res;
  try {
    res = await fetch(`/Game/Join.ashx?placeId=${encodeURIComponent(JOIN.placeId)}&mode=${encodeURIComponent(JOIN.mode || 'online')}`, { credentials: 'same-origin' });
    info = await res.json();
  } catch (e) {
    info = { error: 'Connection attempt failed.' };
  }
  if (!res?.ok || info.error) {
    gui.setJoinStatus(`Failed to connect to the Game. (${info.error || 'Connection rejected'})`);
    return;
  }
  document.title = `ROBLOX - ${info.place.name}`;
  gui.setBuildMode(info.buildMode);

  place = await loadPlace(info.place.script);
  const ctx = { theme: info.place.theme, build: info.place.build, mode: info.mode, buildMode: info.buildMode, info, game };
  place.build(game.world, ctx);
  const stopCam = joinCamera(game.world);
  await countBricks(game.world);
  postJSON('/Game/Visit.ashx', { placeId: info.place.id });

  gui.setJoinStatus('Requesting character...');
  place.setup?.(game, ctx);
  placeHook.update = place.update ? (g, dt) => place.update(g, dt) : null;
  game.on('exit', exitGame);
  await wait(0.5);
  gui.setJoinStatus('Waiting for character...');
  await wait(0.4);

  const me = game.addPlayer({ name: info.player.name, userId: info.player.id, appearance: info.player.appearance, isLocal: true });
  const ch = game.spawnPlayer(me);
  stopCam();
  game.camera.fixed = null;
  game.camera.yaw = ch.facing;
  game.camera.focus.copy(ch.rootPosition);
  gui.setJoinStatus('');
  canvas.focus();

  addBots(info.bots || []);
  // keep the leaderboard stats on the website up to date
  setInterval(() => report(false), 60000);
}

window.addEventListener('beforeunload', () => report(true));
document.addEventListener('keydown', () => sounds.unlock(), { once: true });
main().catch((e) => {
  console.error(e);
  gui.setJoinStatus('An error occured. Please try again later');
});
