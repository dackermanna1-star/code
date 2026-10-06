// "Natural Disaster Survival": wait in the sky lobby, get sent down to one of
// five maps on the island, and survive whatever hits it - tornadoes,
// tsunamis, floods, earthquakes, meteors, a volcano, lightning, fire, acid
// rain or a blizzard. Survivors score a point and go back up for the next
// round. (A user-made place in the style of the 2011 classic; it uses its
// own GUI and modern effects.)
import * as THREE from 'three';
import { BotBrain, CHAT_LINES, pick } from '../../engine/Bots.js';
import { GROUP } from '../../engine/Part.js';
import { Effects } from '../warzone/fx.js';
import { Structure } from './structure.js';
import { buildIsland, MAPS, G, LOBBY } from './maps.js';
import { Water, Weather, Sky, Flames, groundMark, tex } from './effects.js';
import { DISASTERS, exposed } from './disasters.js';
import * as A from './audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const INTERMISSION = 16, PREP = 12, WARNING = 4, ENDING = 6;
let S = null;

// --- the GUI ---------------------------------------------------------------------------------------------------
const CSS = `
.nds{position:absolute;inset:0;pointer-events:none;font-family:Arial,Helvetica,sans-serif;z-index:6;color:#fff;}
.nds .bar{position:absolute;left:50%;top:30px;transform:translateX(-50%);background:rgba(20,20,24,.72);border:2px solid rgba(255,255,255,.25);border-radius:6px;padding:7px 22px;font-size:20px;font-weight:bold;text-shadow:0 2px 2px #000;white-space:nowrap;text-align:center;min-width:300px;}
.nds .bar small{display:block;font-size:13px;font-weight:normal;color:#ddd;margin-top:2px;}
.nds .warn{position:absolute;left:0;right:0;top:24%;text-align:center;display:none;}
.nds .warn .t{font:bold 26px Arial;letter-spacing:6px;color:#ffdd44;text-shadow:0 2px 4px #000;animation:ndsBlink .5s infinite alternate;}
.nds .warn .n{font:bold 64px 'Arial Black',Arial;letter-spacing:2px;text-shadow:0 4px 0 #000,0 0 30px rgba(0,0,0,.6);-webkit-text-stroke:2px #000;}
.nds .warn .i{font-size:70px;line-height:1;}
.nds .warn .tip{font:bold 20px Arial;text-shadow:0 2px 3px #000;margin-top:6px;}
@keyframes ndsBlink{from{opacity:1}to{opacity:.35}}
.nds .surv{position:absolute;left:50%;top:22%;transform:translateX(-50%);background:rgba(20,20,24,.82);border:2px solid #7cd860;border-radius:8px;padding:14px 26px;text-align:center;display:none;min-width:280px;}
.nds .surv h2{margin:0 0 8px;font-size:26px;color:#7cd860;letter-spacing:2px;}
.nds .surv div{font-size:16px;line-height:1.5;}
.nds .surv .me{color:#ffdd44;font-weight:bold;}
.nds .meters{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);display:none;text-align:center;}
.nds .meters div{width:220px;height:12px;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.5);margin:4px auto;position:relative;}
.nds .meters i{display:block;height:100%;}
.nds .meters span{position:absolute;left:0;right:0;top:-1px;font-size:10px;font-weight:bold;text-shadow:0 1px 1px #000;}
.nds .tint{position:absolute;inset:0;opacity:0;transition:opacity .3s;}
.nds .dead{position:absolute;left:0;right:0;top:42%;text-align:center;font:bold 26px Arial;text-shadow:0 2px 4px #000;display:none;}
.nds .help{position:absolute;right:14px;bottom:110px;font-size:12px;text-align:right;color:#eee;text-shadow:0 1px 2px #000;line-height:1.6;}
.nds .pick{position:absolute;left:14px;top:150px;width:262px;max-height:calc(100% - 290px);overflow-y:auto;background:rgba(20,20,24,.85);border:2px solid rgba(255,255,255,.28);border-radius:8px;padding:9px 10px 10px;pointer-events:auto;display:none;font-size:12px;}
.nds .pick h3{margin:2px 0 6px;font:bold 13px Arial;letter-spacing:1px;color:#ffdd44;cursor:pointer;user-select:none}
.nds .pick h3 span{float:right;color:#aaa}
.nds .pick h4{margin:9px 0 4px;font:bold 11px Arial;letter-spacing:1px;color:#bbb}
.nds .pick .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px}
.nds .pick button{font:bold 11px Arial;color:#fff;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.25);border-radius:4px;padding:5px 4px;text-align:left;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nds .pick button:hover{background:rgba(255,255,255,.2)}
.nds .pick button.on{background:rgba(255,221,68,.25);border-color:#ffdd44;color:#ffdd44}
.nds .pick button.wide{grid-column:1/3;text-align:center}
.nds .pick .go{display:block;width:100%;margin-top:9px;text-align:center;font-size:13px;padding:7px;background:#2f8a2f;border-color:#7cd860}
.nds .pick .go:hover{background:#3aa83a}
.nds .pick p{margin:6px 0 0;color:#aaa;font-size:11px;line-height:1.35}
.nds .pick.min .body{display:none}
`;
class Gui {
  constructor(root) {
    if (!document.getElementById('nds-css')) { const st = document.createElement('style'); st.id = 'nds-css'; st.textContent = CSS; document.head.appendChild(st); }
    const el = document.createElement('div'); el.className = 'nds';
    el.innerHTML = `<div class="tint"></div><div class="bar"></div>
      <div class="warn"><div class="t">⚠ WARNING ⚠</div><div class="i"></div><div class="n"></div><div class="tip"></div></div>
      <div class="surv"><h2>SURVIVORS</h2><div></div></div>
      <div class="meters"><div class="st"><i style="background:#ffd040"></i><span>STAMINA</span></div><div class="br"><i style="background:#5ac8ff"></i><span>BREATH</span></div></div>
      <div class="dead"></div>
      <div class="pick"><h3>PICK THE DISASTER <span>&#9662;</span></h3><div class="body"></div></div>
      <div class="help">Survive the disaster!<br>WASD move · Space jump · right-drag look · I/O zoom</div>`;
    root.appendChild(el);
    const q = (s) => el.querySelector(s);
    Object.assign(this, { el, bar: q('.bar'), warn: q('.warn'), surv: q('.surv'), meters: q('.meters'), tint: q('.tint'), dead: q('.dead'), help: q('.help'), pick: q('.pick') });
    this.pick.querySelector('h3').onclick = () => { this.pick.classList.toggle('min'); this.pick.querySelector('h3 span').innerHTML = this.pick.classList.contains('min') ? '&#9656;' : '&#9662;'; };
    // clicks on the menu are for the menu, not the game
    for (const ev of ['mousedown', 'mouseup', 'click', 'contextmenu', 'wheel']) this.pick.addEventListener(ev, (e) => e.stopPropagation());
    setTimeout(() => { this.help.style.display = 'none'; }, 25000);
  }
  /**
   * The lobby menu: pick the disaster and the map (or leave them random).
   * A pick sticks for every round until it is changed.
   */
  picker(disasters, maps, state, onStart) {
    const body = this.pick.querySelector('.body');
    const btn = (label, title, on, fn, cls = '') => { const b = document.createElement('button'); b.className = `${cls}${on ? ' on' : ''}`; b.innerHTML = label; b.title = title; b.onclick = (e) => { e.preventDefault(); fn(); draw(); b.blur(); }; return b; };
    const draw = () => {
      body.innerHTML = '';
      const grid = (title, list, key) => {
        const h = document.createElement('h4'); h.textContent = title; body.appendChild(h);
        const g = document.createElement('div'); g.className = 'grid'; body.appendChild(g);
        g.appendChild(btn('&#127922; Random', 'A different one each round', !state[key], () => { state[key] = null; }, 'wide'));
        for (const it of list) g.appendChild(btn(`${it.icon ? it.icon + ' ' : ''}${it.name}`, it.name, state[key] === it.id, () => { state[key] = it.id; }));
      };
      grid('DISASTER', disasters, 'disaster');
      grid('MAP', maps, 'map');
      body.appendChild(btn('&#9654; START NOW', 'Skip the wait', false, onStart, 'go'));
      const p = document.createElement('p'); p.textContent = 'Your pick is used every round until you change it.'; body.appendChild(p);
    };
    draw();
  }
  showPicker(on) { if (this._pk !== on) { this._pk = on; this.pick.style.display = on ? 'block' : 'none'; } }
  setBar(html) { if (this._bar !== html) { this._bar = html; this.bar.innerHTML = html; } }
  warning(d) {
    if (!d) { this.warn.style.display = 'none'; return; }
    this.warn.style.display = 'block';
    this.warn.querySelector('.i').textContent = d.icon;
    const n = this.warn.querySelector('.n'); n.textContent = d.name.toUpperCase(); n.style.color = d.color;
    this.warn.querySelector('.tip').textContent = d.tip;
  }
  survivors(list, me) {
    if (!list) { this.surv.style.display = 'none'; return; }
    this.surv.style.display = 'block';
    this.surv.lastChild.innerHTML = list.length ? list.map((n) => `<div class="${n === me ? 'me' : ''}">${n.replace(/[<>&]/g, '')}</div>`).join('') : '<div>Nobody survived!</div>';
  }
  setMeters(stamina, breath) {
    const show = stamina < 0.999 || breath < 0.999;
    this.meters.style.display = show ? 'block' : 'none';
    if (show) { this.meters.querySelector('.st i').style.width = (stamina * 100) + '%'; this.meters.querySelector('.br i').style.width = (breath * 100) + '%'; }
  }
  setTint(color, a) { this.tint.style.background = color; this.tint.style.opacity = a; }
  setDead(text) { this.dead.style.display = text ? 'block' : 'none'; this.dead.textContent = text || ''; }
}

// --- bots --------------------------------------------------------------------------------------------------------
const DISASTER_LINES = {
  tornado: ['TORNADO RUN', 'omg its coming this way', 'RUNNNN', 'tornado!!!!'], tsunami: ['TSUNAMI', 'get on the roof!!', 'GO HIGH', 'omg look at the wave'],
  flood: ['get up high', 'the water is rising!!', 'climb!!', 'flood lol'], earthquake: ['EARTHQUAKE', 'get out of the building!', 'the house is falling', 'shakey shakey'],
  meteor: ['meteors!!', 'take cover', 'omg fireballs', 'hide inside'], volcano: ['VOLCANO', 'the floor is lava lol', 'lava bombs!!', 'hide!!'],
  thunder: ['lightning!!', 'dont stand on the roof', 'zap lol', 'stay inside'], fire: ['FIRE', 'get away from the fire', 'its burning!!', 'run outside'],
  acid: ['acid rain!! go inside', 'get under something', 'ouch it burns', 'inside!!'], blizzard: ['its so cold', 'BLIZZARD go inside', 'brrr', 'get inside!!'],
  chaos: ['is that... poop', 'POOP STORM lol', 'ew ew ew', 'what is happening', 'take cover!!'],
  jjk: ['GOJO VS SUKUNA', 'nah id win', 'stand proud', 'WE ARE SO DEAD', 'the strongest vs the strongest', 'hide!!!'],
};
class Survivor extends BotBrain {
  constructor(game, player) {
    super(game, player, { chattiness: 0.6, wanderRadius: 22 });
    this.route = null; this.ri = 0; this.mode = 'lobby';
    this.arriveRadius = 2.2;
    this.dontAvoidEdges = true;
  }
  idleChat() { this.say(pick(['lol', 'hi', 'what map is next', 'i hope its tornado', 'i always survive', 'noob', 'who wants to team', 'brb', 'this game is fun', 'yay', 'i survived 10 times'])); }
  plan(strategy) {
    const map = S.map;
    this.strategy = strategy; this.route = null; this.ri = 0;
    if (!map || !this.ch) return;
    const p = this.ch.rootPosition;
    const nearestRoute = (routes) => routes?.length ? routes.slice().sort((a, b) => Math.hypot(a[0][0] - p.x, a[0][2] - p.z) - Math.hypot(b[0][0] - p.x, b[0][2] - p.z))[Math.random() < 0.7 ? 0 : Math.floor(Math.random() * routes.length)] : null;
    if (strategy === 'high') this.route = nearestRoute(map.high);
    else if (strategy === 'inside') this.route = Math.random() < 0.8 ? nearestRoute(map.inside) : nearestRoute(map.high);
    else if (strategy === 'open') { const o = pick(map.open); this.route = [[o[0], G, o[1]]]; }
    this.lag = rnd(0.3, 2.5); // people react at different speeds
  }
  think() {
    const ch = this.ch, p = ch.rootPosition, world = this.game.world;
    if (this.mode === 'lobby') { this.wanderCenter = V(LOBBY.x, LOBBY.y, LOBBY.z + 4); this.wanderRadius = 16; super.think(); return; }
    // thrown into the sea: swim back to the island
    if (ch.swimming && (Math.abs(p.x) > 110 || Math.abs(p.z) > 110)) { this.target = V(Math.max(-100, Math.min(100, p.x)), G, Math.max(-100, Math.min(100, p.z))); return; }
    if ((this.lag -= 0.35) > 0) { super.think(); return; }
    // run from whatever is chasing you (killer clowns)
    const threats = S.dState?.threats;
    if (threats?.length) {
      let near = null, nd = 32;
      for (const t of threats) { const d = Math.hypot(t.x - p.x, t.z - p.z); if (d < nd) { nd = d; near = t; } }
      if (near) {
        const away = p.clone().sub(near).setY(0); if (away.lengthSq() < 0.01) away.set(1, 0, 0);
        const t = p.clone().addScaledVector(away.normalize(), 28); t.x = Math.max(-100, Math.min(100, t.x)); t.z = Math.max(-100, Math.min(100, t.z));
        this.target = t; return;
      }
    }
    if (this.strategy === 'away' && S.dState?.pos) {
      // run from the tornado
      const away = p.clone().sub(S.dState.pos).setY(0); const d = away.length();
      if (d < 70) { away.normalize(); const t = p.clone().addScaledVector(away, 30); t.x = Math.max(-100, Math.min(100, t.x)); t.z = Math.max(-100, Math.min(100, t.z)); this.target = t; return; }
    }
    if (this.route && this.ri < this.route.length) {
      const w = this.route[this.ri];
      const climb = w[3] === 'climb';
      this.target = V(w[0], w[1], w[2]);
      const hd = Math.hypot(w[0] - p.x, w[2] - p.z), feet = p.y - 3;
      if ((climb && feet > w[1] - 2) || (!climb && hd < 2.6 && Math.abs(feet - w[1]) < 4.5)) this.ri++;
      return;
    }
    if (this.route) { this.target = null; return; } // made it: stay put
    if (this.mode === 'map') { this.wanderCenter = V(0, G, 0); this.wanderRadius = 85; super.think(); }
    void world;
  }
}

// --- the place ---------------------------------------------------------------------------------------------------
export default {
  build(world, ctx = {}) {
    world.useStaticGrid(); // thousands of anchored bricks
    const island = buildIsland(world);
    S = { island };
    if (ctx.thumbnail) {
      // the place's picture: the Happy Home on the island
      const st = new Structure(world); MAPS[0].build(st, world); st.flush();
      return { thumbnail: { cam: [70, 45, -80], look: [0, 10, 0] } };
    }
    return { thumbnail: { cam: [70, 45, -80], look: [0, 10, 0] } };
  },

  setup(game) {
    const world = game.world;
    world.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    game.resize(window.innerWidth, window.innerHeight);
    if (world.shadows) {
      const c = world.sun.shadow.camera; c.left = -110; c.right = 110; c.top = 110; c.bottom = -110; c.far = 600; c.updateProjectionMatrix();
    }
    game.respawnTime = 5;
    game.forceFieldTime = 2;
    game.setStats(['Survivals', 'Wipeouts']);
    for (const sp of S.island.spawns) game.addSpawn(sp, { neutral: true });
    const fx = new Effects(world);
    S = {
      ...S, game, world, fx,
      st: new Structure(world, { maxDebris: 190 }),
      water: new Water(world), weather: new Weather(world), sky: new Sky(world), flames: new Flames(world),
      gui: new Gui(game.gui.root),
      phase: 'intermission', timer: 10, round: 0, lastMaps: [], lastDisasters: [], pick: { disaster: null, map: null },
      burning: new Map(), marks: [], shakeAmt: 0,
    };
    S.grass = [...world.parts].find((p) => p.name === 'Grass');
    S.grassMats = S.grass.mesh.material;
    window.__nds = S; S.V = THREE.Vector3;
    S.D = makeContext();
    game.on('playerAdded', (p) => { if (p.isBot) p.brain = new Survivor(game, p); });
    game.on('spawned', (p, ch) => {
      ch.stamina = 1; ch.breath = 1;
      if (p.brain) p.brain.mode = 'lobby';
      if (p.isLocal) S.gui.setDead(null);
    });
    game.on('died', (p) => {
      const ch = p.character;
      const cause = ch?.lastCause;
      const msg = { lightning: 'was struck by lightning', drowned: 'drowned', lava: 'was burned by lava', acid: 'melted in the acid rain', froze: 'froze to death', fire: 'burned to death', debris: 'was hit by debris', fell: 'fell to their death', blast: 'was blown up', crushed: 'was crushed',
        purple: 'was erased by Hollow Purple', blue: 'was crushed by Blue', red: 'was blasted by Red', cleave: 'was cleaved in half', dismantle: 'was dismantled',
        shrine: 'was sliced up in the Malevolent Shrine', fuga: 'was incinerated by Fuga', void: 'was lost in the Unlimited Void', clash: 'got caught in the crossfire', worldslash: 'was cut along with the world',
        poop: 'was flattened by a giant poop', stink: "couldn't handle the smell", clown: 'was stabbed by a killer clown', hole: 'was swallowed by the black hole' }[cause] || 'died';
      game.systemChat(`${p.name} ${msg}`);
      if (p.isLocal) S.gui.setDead(`You ${msg.replace('their', 'your')}.  Respawning in the lobby...`);
      if (p.brain && Math.random() < 0.5) world.delay(rnd(1, 3), () => p.brain.say(pick(CHAT_LINES.die)));
    });
    world.onUpdate((dt) => S.fx && updateFire(dt));
    // a debug helper for testing
    S.debug = {
      next: (mapId, dis) => { S.forceMap = mapId; S.forceDisaster = dis; S.timer = 0.1; },
      skip: () => { S.timer = 0.1; },
      build: (id) => { const t0 = performance.now(); S.st.clear(); const m = MAPS.find((q) => q.id === id); S.map = m.build(S.st, game.world); S.map.id = id; S.st.flush(); return { parts: S.st.parts.size, chunks: S.st.chunks.size, meshes: S.st.group.children.length, ms: Math.round(performance.now() - t0) }; },
      tp: (x, y, z) => { const ch = game.localPlayer?.character; if (ch) { ch.body.position.set(x, y + 3, z); ch.body.velocity.set(0, 0, 0); } },
    };
    S.gui.picker(DISASTERS, MAPS, S.pick, () => { if (S.phase === 'intermission') S.timer = Math.min(S.timer, 3); });
    S.gui.setBar('Intermission');
  },

  update(game, dt) {
    if (!S?.gui) return;
    const world = game.world;
    S.timer -= dt;
    roundLogic(game, dt);
    if (S.disaster && S.phase === 'disaster') S.disaster.update(S.D, S.dState, dt, S.tIn += dt);
    characterExtras(game, dt);
    S.st.update(dt, S.water, [...world.characters], (ch, dmg) => hurt(ch, dmg, 'crushed'));
    S.water.update(dt); S.weather.update(dt); S.sky.update(dt); S.flames.update(dt);
    // camera shake
    if (S.shakeAmt > 0.01) {
      const cam = game.camera;
      cam.yaw += (Math.random() - 0.5) * S.shakeAmt * 0.02; cam.elevation += (Math.random() - 0.5) * S.shakeAmt * 0.02;
      cam.focus.x += (Math.random() - 0.5) * S.shakeAmt * 0.8; cam.focus.y += (Math.random() - 0.5) * S.shakeAmt * 0.8;
    }
    S.shakeAmt = Math.max(0, S.shakeAmt - dt * 2);
    hudUpdate(game);
  },

  onExit(game, close) { A.stopAll(); close(); },
};

// --- the rounds --------------------------------------------------------------------------------------------------------
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function onIsland(ch) { return ch.alive && ch.rootPosition.y < LOBBY.y - 25; }

function roundLogic(game, dt) {
  const world = game.world;
  if (S.phase === 'intermission') {
    const d = DISASTERS.find((x) => x.id === S.pick.disaster), m = MAPS.find((x) => x.id === S.pick.map);
    S.gui.setBar(`Intermission ${fmt(S.timer)}<small>${d || m ? `Next: ${d ? `${d.icon} ${d.name}` : 'random disaster'} · ${m ? m.name : 'random map'}` : `${game.players.length} players · next round starts soon`}</small>`);
    if (S.timer <= 0) startRound(game);
  } else if (S.phase === 'prep') {
    S.gui.setBar(`Map: ${S.map.name}<small>Something is coming... ${fmt(S.timer)}</small>`);
    if (S.timer <= 0) {
      S.phase = 'warning'; S.timer = WARNING;
      S.gui.warning(S.disaster);
      A.siren(WARNING);
      for (const p of game.players) if (p.brain instanceof Survivor && p.character?.alive && onIsland(p.character)) {
        p.brain.plan(S.disaster.bots);
        if (Math.random() < 0.45) world.delay(rnd(0.3, 2), () => p.brain.say(pick(DISASTER_LINES[S.disaster.id] || ['omg'])));
      }
    }
  } else if (S.phase === 'warning') {
    S.gui.setBar(`${S.disaster.icon} ${S.disaster.name}!`);
    if (S.timer <= 0) {
      S.gui.warning(null);
      S.phase = 'disaster'; S.timer = S.disaster.duration; S.tIn = 0;
      S.dState = {};
      S.disaster.start(S.D, S.dState);
    }
  } else if (S.phase === 'disaster') {
    S.gui.setBar(`${S.disaster.icon} ${S.disaster.name}<small>Survive! ${fmt(S.timer)} · ${game.players.filter((p) => p.character && onIsland(p.character)).length} alive</small>`);
    if (S.timer <= 0) endRound(game);
  } else if (S.phase === 'ending') {
    if (S.timer <= 0) cleanup(game);
  }
  void dt;
}

function choose(list, last, force) {
  if (force) return list.find((x) => x.id === force) || list[0];
  const pool = list.filter((x) => !last.includes(x.id));
  return pick(pool.length ? pool : list);
}

function startRound(game) {
  S.round++;
  const mapDef = choose(MAPS, S.lastMaps, S.forceMap || S.pick.map);
  S.disaster = choose(DISASTERS, S.lastDisasters, S.forceDisaster || S.pick.disaster);
  S.forceMap = S.forceDisaster = null;
  S.lastMaps = [mapDef.id, ...S.lastMaps].slice(0, 2);
  S.lastDisasters = [S.disaster.id, ...S.lastDisasters].slice(0, 4);
  S.st.clear();
  S.map = mapDef.build(S.st, game.world);
  S.map.id = mapDef.id;
  S.st.flush();
  // everyone in the lobby goes down to the map
  const spawns = S.map.spawns;
  let i = 0;
  for (const p of game.players) {
    const ch = p.character;
    if (!ch?.alive) continue;
    const s = spawns[i++ % spawns.length];
    ch.body.position.set(s[0] + rnd(-2, 2), s[1] + 3.2, s[2] + rnd(-2, 2));
    ch.body.velocity.set(0, 0, 0);
    ch.facing = Math.atan2(-(0 - s[0]), -(0 - s[2]));
    if (p.isLocal) { game.camera.yaw = ch.facing; game.camera.focus.copy(ch.body.position); }
    if (p.brain) { p.brain.mode = 'map'; p.brain.route = null; p.brain.strategy = null; p.brain.target = null; }
  }
  S.phase = 'prep'; S.timer = PREP;
  A.ding();
}

function endRound(game) {
  S.disaster.stop(S.D, S.dState);
  S.phase = 'ending'; S.timer = ENDING;
  const survivors = game.players.filter((p) => p.character && onIsland(p.character));
  for (const p of survivors) { p.stats.Survivals = (p.stats.Survivals || 0) + 1; }
  game.gui?.onPlayersChanged();
  S.gui.survivors(survivors.map((p) => p.name), game.localPlayer?.name);
  S.gui.setBar(`${survivors.length} survived!`);
  if (survivors.some((p) => p.isLocal)) A.ding();
  for (const p of survivors) if (p.brain && Math.random() < 0.5) game.world.delay(rnd(0.5, 3), () => p.brain.say(pick(['i survived!!', 'yay', 'gg', 'ez', 'woooo', 'that was close', ...CHAT_LINES.win])));
  S.weather.set(null); S.sky.clear(); S.water.target = 0; S.water.speed = 4;
}

function cleanup(game) {
  S.gui.survivors(null);
  // survivors back up to the lobby
  for (const p of game.players) {
    const ch = p.character;
    if (!ch?.alive || !onIsland(ch)) continue;
    ch.platformStand = false;
    const s = pick(S.island.spawns).position;
    ch.body.position.set(s.x + rnd(-3, 3), s.y + 3.8, s.z + rnd(-3, 3));
    ch.body.velocity.set(0, 0, 0);
    ch.health = ch.maxHealth;
    if (p.brain) { p.brain.mode = 'lobby'; p.brain.route = null; p.brain.target = null; }
  }
  for (const [p, b] of S.burning) { b.flame.stop(); S.burning.delete(p); }
  S.flames.clear();
  for (const m of S.marks) game.world.scene.remove(m);
  S.marks = [];
  S.st.clear();
  S.water.level = 0; S.water.target = 0; S.water.current = null; S.water.setTint(0x4a90c8);
  setSnow(false);
  S.disaster = null; S.dState = null; S.map = null;
  S.phase = 'intermission'; S.timer = INTERMISSION;
}

// --- the shared context the disasters use -----------------------------------------------------------------------------------
function hurt(ch, dmg, cause) {
  if (!ch?.alive || ch.forceField || dmg <= 0) return;
  ch.lastCause = cause;
  ch.takeDamage(dmg);
  if (ch.alive && ch.player?.isLocal && dmg > 6) S.hurtT = S.world.time;
}
function kill(ch, pos, cause) {
  if (!ch?.alive || ch.forceField) return;
  ch.lastCause = cause;
  ch.breakJoints(null, pos);
}
/** Break a brick loose, and anything resting on it a moment later. */
function collapse(p, vel, depth = 0) {
  const st = S.st;
  if (!p || p.destroyed || !p.anchored) return;
  if (!st.release(p, vel)) return;
  if (depth > 3) return;
  const pb = p.userData.box;
  if (!pb) return;
  for (const q of st.parts) {
    if (!q.anchored || q.destroyed || q.userData.fixed) continue;
    const qb = q.userData.box;
    if (!qb || Math.abs(qb.min.y - pb.max.y) > 0.7) continue;
    if (qb.max.x < pb.min.x || qb.min.x > pb.max.x || qb.max.z < pb.min.z || qb.min.z > pb.max.z) continue;
    if (Math.random() < 0.75) S.world.delay(rnd(0.15, 0.6), () => collapse(q, null, depth + 1));
  }
}
function explode(pos, r, power = 1) {
  const world = S.world;
  for (const p of S.st.near(pos, r * 1.4)) {
    const d = p.mesh.position.distanceTo(pos);
    const dir = p.mesh.position.clone().sub(pos).normalize();
    collapse(p, dir.multiplyScalar(60 * power * Math.max(0.3, 1 - d / (r * 1.4))).add(V(0, 25 * power, 0)));
  }
  for (const ch of [...world.characters]) {
    if (!ch.alive) continue;
    const d = ch.rootPosition.distanceTo(pos);
    if (d < r * 0.6 + 1.5) kill(ch, pos, 'blast');
    else if (d < r * 1.6) { hurt(ch, 60 * power * (1 - d / (r * 1.6)), 'blast'); if (ch.alive) { const k = pos.clone(); ch.body.velocity.x += (ch.rootPosition.x - k.x) * 4; ch.body.velocity.y += 30; ch.body.velocity.z += (ch.rootPosition.z - k.z) * 4; } }
  }
  world.explode(pos, r * 0.5, 450000 * power, {});
  S.fx.burst(S.fx.mats.dust, pos, 18, { speed: [4, 18], size: [2, 4.5], life: [1, 2.2], gravity: 0.1, grow: 2.2 });
  const L = S.fx.lights[0]; L.l.position.copy(pos); L.l.intensity = 60 * power; L.l.distance = r * 8; L.t = 0.12;
  A.explosion(pos, Math.min(1.6, r / 6 * power));
  shake(Math.max(0, 1 - world.camera.position.distanceTo(pos) / 140) * 0.9 * power);
}
function shake(a) { S.shakeAmt = Math.max(S.shakeAmt, a); }
function mark(at, kind, size) {
  const T = tex();
  const m = kind === 'lava' ? groundMark(S.world, T.lava, at.x, at.y, at.z, size, { color: 0xffb070 })
    : kind === 'acid' ? groundMark(S.world, T.soft, at.x, at.y, at.z, size, { color: 0x7aff3a, opacity: 0.55 })
      : groundMark(S.world, T.scorch, at.x, at.y, at.z, size);
  S.marks.push(m);
  return m;
}
function makeContext() {
  return {
    world: S.world, st: S.st, water: S.water, weather: S.weather, sky: S.sky, flames: S.flames, fx: S.fx,
    get map() { return S.map; },
    chars: () => [...S.world.characters].filter((ch) => onIsland(ch)),
    guiRoot: S.gui.el,
    /** Tell the bots to change plan mid-disaster (a disaster with stages). */
    replan: (strategy) => { for (const p of S.game.players) if (p.brain instanceof Survivor && p.character?.alive && onIsland(p.character)) p.brain.plan(strategy); },
    hurt, kill, collapse, explode, shake, mark, ignite,
    snow: setSnow,
    set snowAmount(v) { S.snowAmount = v; },
  };
}
function setSnow(on) {
  if (on) {
    S.snowMats = S.grassMats.map((m) => m.clone());
    S.grass.mesh.material = S.snowMats;
    S.snowAmount = 0;
  } else { S.grass.mesh.material = S.grassMats; S.snowMats = null; }
}

// --- fire ---------------------------------------------------------------------------------------------------------------------------
const WOODY = new Set([217, 192, 18, 38, 12, 25, 128, 5, 24, 21]);
function ignite(p) {
  if (!p || p.destroyed || S.burning.has(p) || p.name === 'Glass' || p.userData.fixed || S.burning.size > 70) return;
  if (p.anchored) p.structure?.detach(p);
  const base = Array.isArray(p.mesh.material) ? p.mesh.material[0] : p.mesh.material;
  const mat = base.clone(); p.mesh.material = mat;
  const size = Math.min(8, Math.max(2, Math.max(p.size.x, p.size.y, p.size.z) * 0.7));
  const woody = WOODY.has(p.color);
  const b = {
    t: 0, life: rnd(9, 15) * (woody ? 0.85 : 1.3), mat, c0: mat.color.clone(), next: rnd(0.6, 1.4), woody,
    flame: S.flames.add(() => (p.destroyed ? null : p.mesh.position.clone().add(V(0, p.size.y / 2 - size * 0.35, 0))), size),
  };
  S.burning.set(p, b);
}
function updateFire(dt) {
  if (!S.burning.size) { A.stop('crackle'); return; }
  const cam = S.world.camera.position;
  let near = Infinity;
  for (const [p, b] of [...S.burning]) {
    if (p.destroyed) { b.flame.stop(); S.burning.delete(p); continue; }
    b.t += dt;
    const pos = p.mesh.position;
    near = Math.min(near, pos.distanceTo(cam));
    b.mat.color.copy(b.c0).lerp(new THREE.Color(0x140c08), Math.min(1, b.t / b.life * 1.3));
    // spread to neighbours
    b.next -= dt;
    if (b.next <= 0 && S.phase !== 'ending') {
      b.next = rnd(0.7, 1.4);
      const r = Math.max(p.size.x, p.size.y, p.size.z) / 2 + 3;
      for (const q of S.st.near(pos, r)) if (!S.burning.has(q) && Math.random() < (WOODY.has(q.color) ? 0.32 : 0.14)) ignite(q);
    }
    // burns people next to it
    for (const ch of S.world.characters) {
      if (!ch.alive) continue;
      const d = ch.rootPosition.distanceTo(pos);
      if (d < Math.max(p.size.x, p.size.y, p.size.z) / 2 + 2.2) { hurt(ch, 28 * dt, 'fire'); ch.onFire = S.world.time; }
    }
    // fuel tanks go up
    if (p.userData.tank && b.t > (p.userData.small ? 2.5 : 5) && !p.userData.blown) { p.userData.blown = true; explode(pos.clone(), p.userData.small ? 9 : 16, p.userData.small ? 1 : 2); }
    if (b.t > b.life) {
      b.flame.stop(); S.burning.delete(p);
      if (p.anchored) { if (Math.random() < 0.45) { S.fx.burst(S.fx.mats.dust, pos, 8, { speed: [1, 4], size: [1, 2.5], life: [1, 2], gravity: 0.1, grow: 1.5 }); S.st.remove(p); } else collapse(p); }
    }
  }
  A.crackle(Math.max(0.05, 0.5 * (1 - near / 120)));
}

// --- swimming, drowning, falling, and the disasters' pushes ----------------------------------------------------------------------
function characterExtras(game, dt) {
  const world = game.world, lvl = S.water.level;
  for (const ch of world.characters) {
    if (!ch.alive) continue;
    const p = ch.rootPosition, b = ch.body;
    const feet = p.y - 3, head = p.y + 1.6;
    // in the water: float, swim, tire, drown
    const depth = lvl - feet;
    ch.swimming = depth > 3.4;
    if (ch.swimming) {
      ch.stamina = Math.max(0, (ch.stamina ?? 1) - dt / 20);
      if (ch.stamina > 0 && !ch.platformStand) {
        const want = lvl - 1.4;
        b.velocity.y += ((want - p.y) * 6 - b.velocity.y) * Math.min(1, dt * 5);
        if (ch.input.jump) b.velocity.y = Math.max(b.velocity.y, 14);
        // swimming into a ledge (the beach, a roof, a pier): climb out onto it
        const mv = ch.input.move;
        if (mv.lengthSq() > 0.04) {
          const dx = mv.x / Math.hypot(mv.x, mv.z), dz = mv.z / Math.hypot(mv.x, mv.z);
          if (world.raycast(V(p.x, feet + 0.6, p.z), V(p.x + dx * 2.6, feet + 0.6, p.z + dz * 2.6), { mask: GROUP.WORLD | GROUP.DYNAMIC })) b.velocity.y = Math.max(b.velocity.y, 17);
        }
      } else b.velocity.y = Math.max(b.velocity.y, -12);
      ch.walkSpeed = 10;
    } else {
      ch.stamina = Math.min(1, (ch.stamina ?? 1) + dt / 6);
      ch.walkSpeed = ch.baseSpeed || 16;
    }
    if (head < lvl - 0.2) { ch.breath = Math.max(0, (ch.breath ?? 1) - dt / 9); if (ch.breath <= 0) { kill(ch, null, 'drowned'); continue; } }
    else ch.breath = Math.min(1, (ch.breath ?? 1) + dt / 2);
    if (p.y < -60) { kill(ch, null, 'drowned'); continue; }
    // pushed around: earthquakes, blizzard winds
    if (ch.quakeJitter) ch.input.move.add(ch.quakeJitter);
    if (ch.windPush) ch.input.move.add(ch.windPush);
    // thrown by a tornado or a wave: get back on your feet once you land
    if (ch.platformStand && ch.inTornado && world.time - ch.inTornado > 0.5) {
      const ground = world.raycast(p, V(p.x, p.y - 3.6, p.z), { mask: GROUP.WORLD | GROUP.DYNAMIC });
      if (ground || ch.swimming || world.time - ch.inTornado > 8) { ch.platformStand = false; ch.inTornado = null; }
    }
    // landing hard hurts
    const vy = b.velocity.y, prev = ch._vy ?? 0;
    if (prev < -95 && vy > prev * 0.35 && !ch.swimming) hurt(ch, (-prev - 95) * 1.4, 'fell');
    ch._vy = vy;
  }
}

// --- the HUD each frame -----------------------------------------------------------------------------------------------------------------
function hudUpdate(game) {
  const ch = game.localPlayer?.character;
  S.gui.showPicker(S.phase === 'intermission' || (!!ch?.alive && !onIsland(ch)));
  if (!ch?.alive) { S.gui.setMeters(1, 1); return; }
  S.gui.setMeters(ch.stamina ?? 1, ch.breath ?? 1);
  const t = game.world.time;
  const cam = game.world.camera.position;
  if (cam.y < S.water.level) S.gui.setTint('rgba(20,70,110,0.55)', 1);
  else if (ch.acidT && t - ch.acidT < 0.3) S.gui.setTint('radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(100,255,40,0.55))', 1);
  else if (ch.coldT && t - ch.coldT < 0.3) S.gui.setTint('radial-gradient(ellipse at center, rgba(0,0,0,0) 35%, rgba(200,230,255,0.7))', 1);
  else if (ch.onFire && t - ch.onFire < 0.3) S.gui.setTint('radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(255,120,0,0.55))', 1);
  else if (S.hurtT && t - S.hurtT < 0.25) S.gui.setTint('radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(200,0,0,0.6))', 1);
  else S.gui.setTint('transparent', 0);
  if (S.snowMats && S.snowAmount) { const w = new THREE.Color(0xf4f8ff); S.snowMats.forEach((m, i) => m.color.copy(S.grassMats[i].color).lerp(w, S.snowAmount * 0.85)); }
  if (ch.acidT && t - ch.acidT < 0.05 && Math.random() < 0.08) A.sizzle(0.15);
  void exposed;
}
