// Game session: players, spawning, leaderboard, chat, Hint/Message, the main
// loop and local input. A "place" module builds the map and adds its rules.
import * as THREE from 'three';
import { World } from './World.js';
import { Character } from './Character.js';
import { ClassicCamera } from './Camera.js';
import { sounds } from './Sound.js';
import { GROUP } from './Part.js';

// Classic name colours (chat + player list): a hash of the name picks one
// of eight colours.
const NAME_COLORS = ['rgb(173,35,35)', 'rgb(42,75,215)', 'rgb(29,105,20)', 'rgb(129,38,192)', 'rgb(255,146,51)', 'rgb(255,238,51)', 'rgb(255,205,243)', 'rgb(233,222,187)'];
export function nameColor(name) {
  const len = name.length;
  let total = 0;
  for (let i = 1; i <= len; i++) {
    const rev = (len - i) + (1 - (len % 2));
    const b = name.charCodeAt(i - 1);
    total += rev % 4 < 2 ? b : -b;
  }
  return NAME_COLORS[((total % 8) + 8) % 8];
}

let playerIds = 1;
export class Player {
  constructor(game, opts) {
    this.id = playerIds++;
    this.game = game;
    this.name = opts.name;
    this.userId = opts.userId || 0;
    this.appearance = opts.appearance;
    this.isLocal = !!opts.isLocal;
    this.isBot = !!opts.isBot;
    this.team = null;
    this.neutral = true;
    this.stats = {};
    this.character = null;
    this.backpack = [];
    this.equipped = -1;
    this.brain = null;
    this.respawnTimer = null;
  }
}

export class Game {
  constructor({ canvas, overlay, place, placeInfo }) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.place = place;
    this.placeInfo = placeInfo || {};
    this.world = new World(canvas);
    this.camera = new ClassicCamera(this.world.camera, canvas);
    this.players = [];
    this.teams = [];
    this.stats = ['KOs', 'Wipeouts'];
    this.teamDamage = false;
    this.respawnTime = 5;
    this.forceFieldTime = 10;
    this.starterPack = []; // tool factories
    this.keys = new Set();
    this.mouse = new THREE.Vector2();
    this.mouseNDC = new THREE.Vector2();
    this.listeners = {};
    this.gui = null;
    this.running = false;
    this.spawnLocations = [];
    sounds.setListener(this.world.camera.position);
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, ...a) { for (const f of this.listeners[evt] || []) f(...a); }

  // --- players -----------------------------------------------------------------
  addPlayer(opts) {
    const p = new Player(this, opts);
    for (const s of this.stats) p.stats[s] = 0;
    this.players.push(p);
    if (p.isLocal) this.localPlayer = p;
    this.emit('playerAdded', p);
    this.gui?.onPlayersChanged();
    return p;
  }

  removePlayer(p) {
    if (p.character) p.character.destroy();
    this.players = this.players.filter((x) => x !== p);
    this.gui?.onPlayersChanged();
  }

  setStats(names) {
    this.stats = names;
    for (const p of this.players) for (const s of names) p.stats[s] ??= 0;
    this.gui?.onPlayersChanged();
  }

  addTeam(name, color) {
    const t = { name, color };
    this.teams.push(t);
    return t;
  }

  setTeam(player, team) {
    player.team = team;
    player.neutral = !team;
    this.gui?.onPlayersChanged();
  }

  addSpawn(part, opts = {}) {
    this.spawnLocations.push({ part, team: opts.team || null, neutral: opts.neutral ?? !opts.team });
  }

  pickSpawn(player) {
    let list = this.spawnLocations;
    if (player.team) {
      const t = list.filter((s) => s.team === player.team);
      if (t.length) list = t;
    } else {
      const n = list.filter((s) => s.neutral);
      if (n.length) list = n;
    }
    if (player.spawnOverride) return player.spawnOverride;
    if (!list.length) return { position: new THREE.Vector3(0, 10, 0), yaw: 0 };
    const s = list[Math.floor(Math.random() * list.length)];
    const p = s.part.position;
    const sz = s.part.size;
    return {
      position: new THREE.Vector3(p.x + (Math.random() - 0.5) * Math.max(0, sz.x - 2), p.y + sz.y / 2 + 0.05, p.z + (Math.random() - 0.5) * Math.max(0, sz.z - 2)),
      yaw: s.part.userData.yaw ?? 0,
    };
  }

  spawnPlayer(player) {
    if (player.respawnTimer) { this.world.cancel(player.respawnTimer); player.respawnTimer = null; }
    if (player.character) player.character.destroy();
    // a place script may dress a player up (appearanceOverride), which also
    // skips the team colouring
    const ov = player.appearanceOverride;
    const ch = new Character(this.world, { name: player.name, appearance: ov || player.appearance, isLocal: player.isLocal, player, teamColor: !ov && player.team ? player.team.color : null });
    player.character = ch;
    const sp = this.pickSpawn(player);
    ch.spawn(sp.position, sp.yaw, this.forceFieldTime);
    // StarterPack -> Backpack
    player.backpack = this.starterPack.map((make) => make(this, player));
    for (const t of player.extraTools || []) player.backpack.push(t(this, player));
    player.equipped = -1;
    ch.on('died', (killer) => this.onDied(player, killer));
    if (player.isLocal) {
      this.camera.subject = ch;
      this.camera.focus.copy(ch.rootPosition);
    }
    this.emit('spawned', player, ch);
    this.gui?.onBackpackChanged(player);
    return ch;
  }

  giveTool(player, tool) {
    player.backpack.push(tool);
    this.gui?.onBackpackChanged(player);
  }

  equip(player, index) {
    const ch = player.character;
    if (!ch || !ch.alive) return;
    if (player.equipped === index || index < 0 || index >= player.backpack.length) {
      ch.unequip();
      player.equipped = -1;
    } else {
      ch.equip(player.backpack[index]);
      player.equipped = index;
    }
    this.gui?.onBackpackChanged(player);
  }

  onDied(player, killerCh) {
    const killer = killerCh?.player || null;
    // LinkedLeaderboard: Wipeouts +1 for the victim, KOs +1 for the killer
    if ('Wipeouts' in player.stats) player.stats.Wipeouts++;
    if (killer && 'KOs' in killer.stats) {
      if (killer === player) killer.stats.KOs--;
      else killer.stats.KOs++;
    }
    this.emit('died', player, killer);
    this.gui?.onPlayersChanged();
    player.equipped = -1;
    this.gui?.onBackpackChanged(player);
    if (this.respawnTime != null) {
      player.respawnTimer = this.world.delay(this.respawnTime, () => {
        player.respawnTimer = null;
        if (this.players.includes(player)) this.spawnPlayer(player);
      });
    }
  }

  // --- messages -------------------------------------------------------------------
  chat(player, text) {
    text = String(text).slice(0, 128);
    if (!text.trim()) return;
    this.gui?.addChat(player, text);
    this.emit('chatted', player, text);
  }

  systemChat(text) { this.gui?.addChat(null, text); }
  setHint(text) { this.gui?.setHint(text); }
  showMessage(text, seconds = 0) {
    this.gui?.setMessage(text);
    if (this._msgTimer) this.world.cancel(this._msgTimer);
    this._msgTimer = seconds > 0 ? this.world.delay(seconds, () => this.gui?.setMessage('')) : null;
  }

  // --- input -----------------------------------------------------------------------
  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (this.gui?.chatFocused) return;
      const k = e.key.toLowerCase();
      if (k === '/' ) { e.preventDefault(); this.gui?.focusChat(); return; }
      this.keys.add(k);
      if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
      if (/^[0-9]$/.test(k) && this.localPlayer) this.equip(this.localPlayer, k === '0' ? 9 : Number(k) - 1);
      if (k === 'i') this.camera.zoom(-1);
      if (k === 'o') this.camera.zoom(1);
      if (k === ',') this.camera.pan(1);
      if (k === '.') this.camera.pan(-1);
      if (k === 'pageup') this.camera.tilt(-1);
      if (k === 'pagedown') this.camera.tilt(1);
      sounds.unlock();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    this.canvas.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.set(e.clientX - r.left, e.clientY - r.top);
      this.mouseNDC.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    });
    this.canvas.addEventListener('mousedown', (e) => {
      sounds.unlock();
      if (e.button !== 0) return;
      this.gui?.blurChat();
      const lp = this.localPlayer;
      if (!lp || !lp.character || !lp.character.alive) return;
      const hit = this.mouseHit();
      this.emit('mouseDown', hit, e);
      if (lp.character.tool) lp.character.tool.activate(hit.point, hit);
    });
  }

  /** Where the mouse points in the world (like Mouse.Hit). */
  mouseHit() {
    const ray = new THREE.Raycaster();
    const ndc = this.camera.firstPerson ? new THREE.Vector2(0, 0) : this.mouseNDC;
    ray.setFromCamera(ndc, this.world.camera);
    const from = ray.ray.origin.clone();
    const to = from.clone().addScaledVector(ray.ray.direction, 1000);
    let best = this.world.raycast(from, to, { mask: GROUP.WORLD | GROUP.DYNAMIC });
    // characters (other than the local one)
    for (const ch of this.world.characters) {
      if (ch === this.localPlayer?.character) continue;
      const b = ch.getTouchAABB();
      const box = new THREE.Box3(b.min.clone(), b.max.clone());
      const p = ray.ray.intersectBox(box, new THREE.Vector3());
      if (p) {
        const d = p.distanceTo(from);
        if (!best || d < best.distance) best = { point: p, distance: d, character: ch, part: null, normal: new THREE.Vector3(0, 1, 0) };
      }
    }
    if (!best) best = { point: to, distance: 1000, part: null, normal: new THREE.Vector3(0, 1, 0) };
    return best;
  }

  updateLocalInput() {
    const lp = this.localPlayer;
    const ch = lp?.character;
    if (!ch || !ch.alive) return;
    const k = this.keys;
    let f = 0, r = 0;
    if (!this.gui?.chatFocused) {
      if (k.has('w') || k.has('arrowup')) f += 1;
      if (k.has('s') || k.has('arrowdown')) f -= 1;
      if (k.has('d')) r += 1;
      if (k.has('a')) r -= 1;
      // the Left/Right arrow keys turn the camera (120 degrees per second)
      const dt = this._dt || 1 / 60;
      if (k.has('arrowleft')) this.camera.rotate(dt * 2.094, 0);
      if (k.has('arrowright')) this.camera.rotate(-dt * 2.094, 0);
    }
    const mv = new THREE.Vector3();
    mv.addScaledVector(this.camera.flatForward, f).addScaledVector(this.camera.flatRight, r);
    if (mv.lengthSq() > 1) mv.normalize();
    ch.input.move.copy(mv);
    ch.input.jump = !this.gui?.chatFocused && k.has(' ');
  }

  // --- main loop ---------------------------------------------------------------------
  start() {
    this.running = true;
    this.bindInput();
    let last = performance.now();
    const frame = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.tick(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  tick(dt) {
    this._dt = dt;
    this.updateLocalInput();
    for (const p of this.players) if (p.brain && p.character && p.character.alive) p.brain.update(dt);
    this.place.update?.(this, dt);
    this.world.step(dt);
    for (const p of this.players) {
      const t = p.character?.tool;
      if (t && t.update) t.update(dt);
    }
    this.camera.update(dt);
    this.gui?.update(dt);
    this.world.render(this.camera.focus);
  }

  resize(w, h) {
    this.world.resize(w, h);
  }
}
