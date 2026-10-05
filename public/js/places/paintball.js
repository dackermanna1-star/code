// "Ultimate Paintball" (CTF) by miked (place 47828, released May 2007).
//
// Verified (docs/RESEARCH.md, Games): two castles on opposite sides, a white
// piece of ground in the middle (unanchored: explosions can knock it loose),
// brown barriers/mountains around the edge, a river with a bridge, a rocket
// launcher floating down the river, Red vs Blue, 10-minute rounds, chat
// "join reds"/"join blues", team chat with % or /t, points: kill +10, dying
// -4, standing on the white patch +2 every few seconds, flag capture
// 10 x (enemy players) + 6 x (team players); grenade kills score nothing.
// miked's gun: Q cycles Standard / Sniper / Blast (no on-screen mode display),
// 50 damage per pellet (Sniper one-hit), R throws a paint grenade.
//
// Reconstructed: exact geometry, colours of the castles, spawn placement,
// the leaderboard stat name ("Points") and message wording.
import * as THREE from 'three';
import { FighterBrain, pick } from '../engine/Bots.js';
import { PaintballGun, Projectile, RocketLauncher, paintSplat } from '../engine/Tools.js';
import { sounds } from '../engine/Sound.js';
import { brickColor } from '../engine/BrickColor.js';
import { spawnLocation, ladder } from './common.js';

const RED = 21, BLUE = 23;
const ROUND = 600;
const RIVER = { z0: -8, z1: 8, bed: -4, x: 120 };
const STONE = 199, STONE2 = 194, MOUNTAIN = [217, 192, 38];

let S = null;

// --- map ----------------------------------------------------------------------
function castle(world, zc, team, dir) {
  // dir = +1 for the castle at +Z (gate faces -Z) and -1 for the one at -Z
  const W = 44, D = 34, H = 10;
  const z0 = zc - D / 2, z1 = zc + D / 2;
  const gateZ = dir > 0 ? z0 : z1;
  const backZ = dir > 0 ? z1 : z0;
  world.brick([W, 1.2, D], [0, 0.6, zc], STONE2); // floor
  world.brick([W, H, 2], [0, H / 2 + 1.2, backZ], STONE);
  world.brick([2, H, D], [-W / 2 + 1, H / 2 + 1.2, zc], STONE);
  world.brick([2, H, D], [W / 2 - 1, H / 2 + 1.2, zc], STONE);
  // front wall with a gate in the middle
  world.brick([16, H, 2], [-W / 2 + 8, H / 2 + 1.2, gateZ], STONE);
  world.brick([16, H, 2], [W / 2 - 8, H / 2 + 1.2, gateZ], STONE);
  world.brick([12, 3, 2], [0, H - 0.3, gateZ], STONE);
  // team-coloured trim and battlements along the top
  for (const [x, z, sx, sz] of [[0, backZ, W, 2], [-W / 2 + 1, zc, 2, D], [W / 2 - 1, zc, 2, D], [0, gateZ, W, 2]]) {
    world.brick([sx, 1.2, sz], [x, H + 1.8, z], team.color);
  }
  for (let x = -W / 2 + 2; x <= W / 2 - 2; x += 4) world.brick([2, 1.6, 2], [x, H + 3.2, gateZ], STONE);
  // walkway inside along the front wall, reached by ladders
  world.brick([W - 4, 1.2, 4], [0, H + 0.6, gateZ + dir * 3], STONE2);
  ladder(world, -12, 1.2, gateZ + dir * 5.4, H - 0.6, [0, dir], { color: 192 });
  ladder(world, 12, 1.2, gateZ + dir * 5.4, H - 0.6, [0, dir], { color: 192 });
  // four corner towers
  for (const x of [-W / 2, W / 2]) for (const z of [z0, z1]) {
    world.brick([8, H + 8, 8], [x, (H + 8) / 2 + 1.2, z], STONE);
    world.brick([8.4, 1.2, 8.4], [x, H + 9.8, z], team.color);
    for (const [ox, oz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) world.brick([2, 2, 2], [x + ox, H + 11.4, z + oz], STONE);
  }
  // flag stand in the courtyard, near the back wall
  const standZ = backZ - dir * 6;
  const stand = world.add({ name: 'FlagStand', size: [5, 1.2, 5], position: [0, 1.8, standZ], color: team.color });
  const spawns = [
    spawnLocation(world, -12, 2.4, standZ - dir * 2, { color: team.color, yaw: dir > 0 ? 0 : Math.PI }),
    spawnLocation(world, 12, 2.4, standZ - dir * 2, { color: team.color, yaw: dir > 0 ? 0 : Math.PI }),
  ];
  return { stand, spawns, standPos: new THREE.Vector3(0, 2.4, standZ), gateZ, dir };
}

function mountains(world) {
  // brown barriers ringing the arena: stepped piles of bricks
  const ring = [];
  const X = 128, Z = 172;
  for (let z = -Z; z <= Z; z += 16) ring.push([-X, z, 1, 0], [X, z, -1, 0]);
  for (let x = -X + 16; x <= X - 16; x += 16) ring.push([x, -Z, 0, 1], [x, Z, 0, -1]);
  let k = 0;
  for (const [x, z, nx, nz] of ring) {
    const h = 14 + ((k * 7) % 5) * 3;
    for (let i = 0; i < 4; i++) {
      const w = 22 - i * 4, hh = h * (i + 1) / 4;
      world.brick([nx ? w : 16, hh, nz ? w : 16], [x - nx * i * 2, hh / 2, z - nz * i * 2], MOUNTAIN[(k + i) % 3]);
    }
    k++;
  }
}

function buildMap(world) {
  // green ground in two halves with the river channel between them
  world.brick([600, 1.2, 300], [0, -0.6, -158], 28);
  world.brick([600, 1.2, 300], [0, -0.6, 158], 28);
  world.brick([600, 1.2, 16], [0, RIVER.bed - 0.6, 0], 5); // river bed
  for (const z of [RIVER.z0, RIVER.z1]) world.brick([600, 4, 0.4], [0, RIVER.bed + 2, z], 28, { top: 'Smooth' });
  const water = world.add({ name: 'Water', size: [600, 3, 16], position: [0, -2.6, 0], color: 102, transparency: 0.45, canCollide: false, top: 'Smooth', bottom: 'Smooth' });
  water.paintable = false;
  // the bridge across the river, with the white patch in the middle
  world.brick([20, 1.2, 20], [0, -0.6, 0], STONE);
  for (const x of [-9.5, 9.5]) world.brick([1, 2.4, 20], [x, 1.2, 0], STONE);
  const patch = world.add({ name: 'WhitePatch', size: [16, 0.4, 16], position: [0, 0.2, 0], color: 1, top: 'Studs' });
  // white cover walls near the centre
  for (const [x, z, sx, sz] of [[-30, 26, 14, 1.2], [30, 26, 14, 1.2], [-30, -26, 14, 1.2], [30, -26, 14, 1.2], [-52, 46, 1.2, 12], [52, -46, 1.2, 12], [0, 50, 10, 1.2], [0, -50, 10, 1.2], [60, 70, 1.2, 14], [-60, -70, 1.2, 14]]) {
    world.brick([sx, 6, sz], [x, 3, z], 1);
  }
  // a few rocks and hills
  for (const [x, z, s] of [[-80, 30, 10], [85, -24, 12], [-90, -110, 8], [92, 118, 9], [-40, 90, 7], [44, -96, 7]]) {
    world.brick([s, s * 0.5, s], [x, s * 0.25, z], 217);
    world.brick([s * 0.6, s * 0.4, s * 0.6], [x, s * 0.7, z], 192);
  }
  mountains(world);
  return { patch, water };
}

// --- miked's paintball gun ------------------------------------------------------
const MODES = ['Standard', 'Sniper', 'Blast'];
class MikedGun extends PaintballGun {
  constructor(game) {
    super(game, { name: 'PaintballGun' });
    this.mode = 0;
    this.grenadeReady = true;
  }
  colorFor(ch) { return ch.player?.team ? ch.player.team.color : 1; }
  cycleMode() {
    this.mode = (this.mode + 1) % MODES.length;
    sounds.play('click', null, 0.7);
  }
  onActivated(ch, target) {
    const m = MODES[this.mode];
    if (m === 'Standard') {
      this.cooldown(0.3);
      this.fireBall(ch, target, { speed: 150, damage: 50, gravity: 0.3, spread: 0.02 });
    } else if (m === 'Sniper') {
      this.cooldown(2.4);
      this.fireBall(ch, target, { speed: 320, damage: 100, gravity: 0.04 });
    } else {
      this.cooldown(0.9); // three times the standard reload
      for (let i = 0; i < 3; i++) this.fireBall(ch, target, { speed: 150, damage: 50, gravity: 0.3, spread: 0.12 });
    }
  }
  throwGrenade(ch, target) {
    if (!this.grenadeReady || !ch.alive) return;
    this.grenadeReady = false;
    this.world.delay(5, () => { this.grenadeReady = true; });
    const color = this.colorFor(ch);
    const c = brickColor(color);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshPhongMaterial({ color: new THREE.Color().setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace), shininess: 40 }));
    const from = ch.headPosition.clone();
    const dir = target.clone().sub(from); dir.y = 0;
    const dist = Math.min(60, dir.length());
    dir.normalize();
    const game = this.game;
    sounds.play('slingshot', from, 0.5);
    let done = false;
    const boom = (p) => {
      if (done) return;
      done = true;
      p.remove();
      grenadeBlast(game, p.pos, color, ch);
    };
    const p = new Projectile(game, {
      position: from.addScaledVector(dir, 2), velocity: dir.multiplyScalar(Math.max(20, dist * 1.1)).add(new THREE.Vector3(0, 35, 0)),
      gravity: 1, radius: 0.6, owner: ch, lifetime: 3, mesh,
      onHitCharacter: (victim, proj) => { if (this.canDamage(victim)) boom(proj); },
      onHitPart: (hit, proj) => {
        // bounce and roll until the fuse runs out
        const n = hit.normal || new THREE.Vector3(0, 1, 0);
        proj.vel.reflect(n).multiplyScalar(0.45);
        if (proj.vel.length() < 3) proj.vel.set(0, 0, 0);
        proj.pos.addScaledVector(n, 0.05);
      },
    });
    p.onExpire = () => boom(p);
  }
}

function grenadeBlast(game, pos, color, thrower) {
  sounds.play('explosion', pos, 0.8);
  for (let i = 0; i < 3; i++) paintSplat(game, pos, color, null);
  const R = 9;
  for (const ch of [...game.world.characters]) {
    if (!ch.alive || ch.forceField) continue;
    if (ch !== thrower && thrower.player?.team && ch.player?.team === thrower.player.team) continue;
    if (ch.rootPosition.distanceTo(pos) < R) {
      ch.creatorTag = null; // grenade kills don't count
      ch.grenaded = true;
      ch.takeDamage(100, null);
    }
  }
  for (const part of game.world.parts) {
    if (part.paintable === false || part.tags.has('nopaint') || part.size.x * part.size.y * part.size.z * 0.7 >= 240) continue;
    if (part.position.distanceTo(pos) < R * 0.7) part.setColor(color);
  }
  loosenPatch(pos, R);
}

function loosenPatch(pos, radius) {
  const patch = S?.patch;
  if (patch && patch.anchored && patch.position.distanceTo(pos) < radius + 8) {
    patch.unanchor();
    patch.body.velocity.y += 12;
  }
}

// --- flags -------------------------------------------------------------------------
function makeFlag(world, team, base) {
  const g = new THREE.Group();
  const c = brickColor(team.color);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7, 8), new THREE.MeshPhongMaterial({ color: 0x8a8d90, shininess: 60 }));
  pole.position.y = 3.5;
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 0.1), new THREE.MeshPhongMaterial({ color: new THREE.Color().setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace), shininess: 10 }));
  cloth.position.set(1.6, 5.8, 0);
  g.add(pole, cloth);
  g.position.copy(base);
  world.scene.add(g);
  return { team, group: g, home: base.clone(), carrier: null, dropped: false, dropTimer: 0 };
}

// --- the place -----------------------------------------------------------------------
export default {
  build(world, ctx = {}) {
    const m = buildMap(world);
    S = { patch: m.patch, teams: [], castles: [], flags: [], time: ROUND, patchTick: 0, rocket: null };
    const red = { name: 'Red', color: RED }, blue = { name: 'Blue', color: BLUE };
    S.castles = [castle(world, -126, red, -1), castle(world, 126, blue, 1)];
    if (ctx.thumbnail) {
      for (const c of S.castles) makeFlag(world, c === S.castles[0] ? red : blue, c.standPos);
    }
    return { thumbnail: { cam: [70, 34, 40], look: [0, 4, -60] } };
  },

  setup(game) {
    const world = game.world;
    game.setStats(['Points']);
    const red = game.addTeam('Red', RED), blue = game.addTeam('Blue', BLUE);
    S.teams = [red, blue];
    S.castles[0].team = red; S.castles[1].team = blue;
    for (const c of S.castles) for (const sp of c.spawns) game.addSpawn(sp, { team: c.team });
    S.flags = S.castles.map((c) => makeFlag(world, c.team, c.standPos));
    game.starterPack = [(g) => new MikedGun(g)];
    world.onExplosion((pos, r) => loosenPatch(pos, r));

    // points
    game.on('died', (victim, killer) => {
      const vch = victim.character;
      victim.stats.Points -= 4;
      if (killer && killer !== victim && !vch?.grenaded) killer.stats.Points += 10;
      // drop a carried flag where the carrier fell
      for (const f of S.flags) if (f.carrier === victim) { f.carrier = null; f.dropped = true; f.dropTimer = 30; f.group.position.copy(vch.rootPosition).setY(Math.max(0, vch.rootPosition.y - 3)); }
      game.gui?.onPlayersChanged();
    });
    // team joining and team chat
    const baseChat = game.chat.bind(game);
    game.chat = (player, text) => {
      const t = String(text).trim().toLowerCase();
      if (t === 'join reds' || t === 'join blues') {
        const team = t === 'join reds' ? red : blue;
        baseChat(player, text);
        if (player.team !== team) { game.setTeam(player, team); game.spawnPlayer(player); }
        return;
      }
      const m = /^(%|\/t\s)/.exec(text);
      if (m) {
        const me = game.localPlayer;
        if (me && me.team !== player.team) return; // other team's private chat
        return baseChat(player, text.slice(m[0].length).trim());
      }
      return baseChat(player, text);
    };
    game.on('playerAdded', (p) => {
      const nr = game.players.filter((x) => x.team === red).length, nb = game.players.filter((x) => x.team === blue).length;
      game.setTeam(p, nr <= nb ? red : blue);
      if (p.isBot) p.brain = new PaintballBrain(game, p);
    });
    // Q: change mode, R: paint grenade
    window.addEventListener('keydown', (e) => {
      if (game.gui?.chatFocused) return;
      const me = game.localPlayer;
      const tool = me?.character?.tool;
      if (!(tool instanceof MikedGun)) return;
      const k = e.key.toLowerCase();
      if (k === 'q') tool.cycleMode();
      if (k === 'r') tool.throwGrenade(me.character, game.mouseHit().point);
    });

    // the rocket launcher floating down the river
    const raft = world.add({ name: 'RocketLauncher', size: [1.2, 1.2, 4.6], position: [-RIVER.x, -1.2, 0], color: 141, canCollide: false });
    raft.tags.add('nopaint');
    S.rocket = { part: raft, x: -RIVER.x, gotten: new WeakSet() };
    raft.onTouched((ch) => {
      const p = ch.player;
      if (!p || !ch.alive || S.rocket.gotten.has(ch) || p.backpack.some((t) => t.name === 'Rocket')) return;
      S.rocket.gotten.add(ch);
      game.giveTool(p, new RocketLauncher(game));
      sounds.play('ping', null, 0.6);
    });
    updateHint(game);
  },

  update(game, dt) {
    if (!S.teams.length) return;
    // round clock
    S.time -= dt;
    if (S.time <= 0) endRound(game);
    // standing on the white patch: +2 every few seconds
    S.patchTick += dt;
    if (S.patchTick >= 3) {
      S.patchTick = 0;
      const box = new THREE.Box3().setFromObject(S.patch.mesh);
      box.max.y += 4;
      for (const p of game.players) {
        const ch = p.character;
        if (ch?.alive && box.containsPoint(ch.rootPosition.clone().setY(ch.rootPosition.y - 2.5))) { p.stats.Points += 2; game.gui?.onPlayersChanged(); }
      }
    }
    // the floating rocket launcher drifts downstream and starts over
    const r = S.rocket;
    r.x += dt * 4;
    if (r.x > RIVER.x) r.x = -RIVER.x;
    r.part.setPosition(r.x, -1.2 + Math.sin(game.world.time * 1.5) * 0.15, Math.sin(r.x * 0.05) * 3);
    r.part.setRotationDeg(0, 90 + Math.sin(game.world.time) * 10, 0);
    // flags
    for (const f of S.flags) updateFlag(game, f, dt);
    S.hintClock = (S.hintClock || 0) + dt;
    if (S.hintClock > 0.5) { S.hintClock = 0; updateHint(game); }
  },
};

function teamTotal(game, team) { return game.players.filter((p) => p.team === team).reduce((a, p) => a + p.stats.Points, 0); }

function updateHint(game) {
  const t = Math.max(0, Math.ceil(S.time));
  game.setHint(`Red: ${teamTotal(game, S.teams[0])}   Blue: ${teamTotal(game, S.teams[1])}      Time left: ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
}

function endRound(game) {
  const r = teamTotal(game, S.teams[0]), b = teamTotal(game, S.teams[1]);
  game.showMessage(r === b ? 'Time is up! It\'s a tie!' : `Time is up! ${r > b ? 'Reds' : 'Blues'} win!`, 5);
  sounds.play('victory', null, 0.6);
  S.time = ROUND;
  for (const p of game.players) p.stats.Points = 0;
  for (const f of S.flags) returnFlag(f);
  game.gui?.onPlayersChanged();
}

function returnFlag(f) {
  f.carrier = null; f.dropped = false;
  f.group.position.copy(f.home);
  f.group.rotation.set(0, 0, 0);
}

function updateFlag(game, f, dt) {
  const enemyCastle = S.castles.find((c) => c.team !== f.team);
  if (f.carrier) {
    const ch = f.carrier.character;
    if (!ch?.alive) { f.carrier = null; return; }
    f.group.position.copy(ch.rootPosition).add(new THREE.Vector3(Math.sin(ch.facing) * 0.8, -1.5, Math.cos(ch.facing) * 0.8));
    f.group.rotation.y = ch.facing;
    // carried to the carrier's own flag stand: captured
    const own = S.castles.find((c) => c.team === f.carrier.team);
    if (ch.rootPosition.distanceTo(own.standPos) < 5) {
      const cap = f.carrier;
      const enemies = game.players.filter((p) => p.team === f.team).length;
      const mates = game.players.filter((p) => p.team === cap.team).length;
      cap.stats.Points += 10 * enemies + 6 * mates;
      game.showMessage(`${cap.name} captured the ${f.team.name} flag!`, 3);
      sounds.play('victory', null, 0.5);
      returnFlag(f);
      game.gui?.onPlayersChanged();
    }
    return;
  }
  if (f.dropped) {
    f.dropTimer -= dt;
    if (f.dropTimer <= 0) returnFlag(f);
  }
  for (const ch of game.world.characters) {
    const p = ch.player;
    if (!ch.alive || !p || ch.rootPosition.distanceTo(f.group.position.clone().setY(f.group.position.y + 3)) > 4) continue;
    if (p.team === f.team) { if (f.dropped) returnFlag(f); continue; }
    if (S.flags.some((o) => o.carrier === p)) continue;
    f.carrier = p; f.dropped = false;
    game.systemChat(`${p.name} has the ${f.team.name} flag!`);
    break;
  }
}

// Simulated players: some attack the enemy flag, some defend, some hold the
// white patch; everyone shoots at enemies in range.
class PaintballBrain extends FighterBrain {
  constructor(game, player) {
    super(game, player, { aggro: 70, chattiness: 0.7 });
    this.role = pick(['attack', 'attack', 'defend', 'patch']);
    this.allowGapJumps = false;
    this.dontAvoidEdges = true;
  }
  idleChat() {
    const r = Math.random();
    if (r < 0.15) this.say(this.player.team?.name === 'Red' ? 'join reds' : 'join blues');
    else if (r < 0.4) this.say('% ' + pick(['guard the flag', 'im going for their flag', 'cover me', 'someone on the patch']));
    else this.say(pick(['pwned', 'lol', 'reds suck', 'blues suck', 'sniper on the tower!', 'gg', 'who has the rocket', 'nooo']));
  }
  think() {
    const ch = this.ch;
    if (this.player.backpack.length && this.player.equipped < 0) this.equipFirst('PaintballGun');
    const tool = ch.tool;
    if (tool instanceof MikedGun && Math.random() < 0.05) tool.mode = Math.floor(Math.random() * 3);
    this.enemy = this.findEnemy();
    const carrying = S.flags.find((f) => f.carrier === this.player);
    const own = S.castles.find((c) => c.team === this.player.team);
    const enemyC = S.castles.find((c) => c.team !== this.player.team);
    if (carrying) { this.target = own.standPos.clone(); this.arriveRadius = 2; return; }
    if (this.enemy && (this.role !== 'attack' || Math.random() < 0.4)) {
      super.think();
      if (tool instanceof MikedGun && Math.random() < 0.04) tool.throwGrenade(ch, this.enemy.character.rootPosition.clone());
      return;
    }
    if (this.reached() || !this.target || Math.random() < 0.05) {
      if (this.role === 'attack') {
        const flag = S.flags.find((f) => f.team !== this.player.team);
        this.target = flag.group.position.clone();
      } else if (this.role === 'defend') {
        this.target = own.standPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, 0, -own.dir * (8 + Math.random() * 14)));
      } else {
        this.target = new THREE.Vector3((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12);
      }
      // go round through the gate, not into the walls
      const p = ch.rootPosition;
      for (const c of [own, enemyC]) {
        const inside = Math.abs(p.z - c.standPos.z) < 18 && Math.abs(p.x) < 22;
        const goingIn = Math.abs(this.target.z - c.standPos.z) < 18 && Math.abs(this.target.x) < 22;
        if (inside !== goingIn && Math.abs(p.x) > 5) { this.target = new THREE.Vector3(0, 0, c.gateZ - c.dir * 6); break; }
      }
    }
  }
  useToolAt(point) {
    const ch = this.ch;
    const tool = ch.tool;
    if (!tool) return;
    // aim above the target to make up for the paintball's drop
    const d = point.distanceTo(ch.rootPosition);
    const mode = tool instanceof MikedGun ? MODES[tool.mode] : 'Standard';
    const speed = mode === 'Sniper' ? 320 : 150, g = mode === 'Sniper' ? 0.04 : 0.3;
    const tt = d / speed;
    tool.activate(point.clone().add(new THREE.Vector3(0, 0.5 * 196.2 * g * tt * tt + 0.5, 0)));
  }
}
