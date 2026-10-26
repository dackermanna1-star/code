// Homebody — boot sequence, main loop wiring, title & pause screens.
import '@fontsource-variable/inter';
import './styles/main.css';
import * as THREE from 'three';
import { G } from './game.js';
import { Engine } from './core/engine.js';
import { Events } from './core/events.js';
import { AudioEngine } from './core/audio.js';
import { Input } from './core/input.js';
import { Clock, seasonFromDate } from './core/clock.js';
import { defaultState, loadState, saveState, hasSave, queueSave } from './core/state.js';
import { el } from './core/utils.js';
import { Apartment } from './world/apartment.js';
import { Sky } from './world/sky.js';
import { City } from './world/city.js';
import { Weather } from './world/weather.js';
import { Particles } from './world/particles.js';
import { updateMirrors } from './world/mirror.js';
import { furnishStarter } from './world/starter.js';
import { ItemManager } from './items/manager.js';
import { Physics } from './items/physics.js';
import { behaviors, HANDLERS } from './items/behaviors/index.js';
import { ITEMS, defBounds } from './items/registry.js';
import { Player } from './player/controller.js';
import { Interaction } from './player/interaction.js';
import { Hand } from './player/hand.js';
import { Placement } from './player/placement.js';
import { Needs } from './player/needs.js';
import { Avatar } from './player/avatar.js';
import { Outfit } from './player/outfit.js';
import { Wallet, Goals, addXP } from './progression/progress.js';
import { Messages } from './progression/messages.js';
import { Market } from './shop/market.js';
import { Orders } from './shop/orders.js';
import './shop/packages.js';
import { UI } from './ui/ui.js';
import './ui/panels.js';
import { Phone } from './ui/phone.js';
import { Computer } from './ui/computer.js';
import { GameLauncher } from './games/index.js';
import { Tutorial } from './ui/tutorial.js';
import './catalog/index.js';
import './games/all.js';

const loading = document.getElementById('loading');
const setLoad = (t, f) => { loading.querySelector('.ld-t').textContent = t; loading.querySelector('.ld-bar div').style.width = `${Math.round(f * 100)}%`; };
const tick = () => new Promise((r) => setTimeout(r, 0));

async function boot() {
  setLoad('Unpacking boxes…', 0.05);
  await tick();
  G.events = new Events();
  G.engine = new Engine(document.getElementById('app'));
  G.scene = G.engine.scene;
  G.camera = G.engine.camera;
  G.audio = new AudioEngine();
  G.input = new Input(G.engine.renderer.domElement);
  G.state = loadState() || defaultState();
  const fresh = !G.state.flags.furnished;
  if (G.state.flags.startSeason === undefined) G.state.flags.startSeason = seasonFromDate(new Date());
  G.clock = new Clock();
  const params = new URLSearchParams(location.search);
  if (params.get('q')) G.state.settings.quality = params.get('q');
  G.engine.setQuality(G.state.settings.quality);
  Object.assign(G.audio.volumes, G.state.settings.volumes);
  G.behaviors = behaviors;
  G.behaviorsRaw = HANDLERS;

  setLoad('Measuring furniture…', 0.15);
  await tick();
  const defs = Object.values(ITEMS);
  for (let i = 0; i < defs.length; i++) {
    try { defBounds(defs[i]); } catch (e) { console.error('model failed', defs[i].id, e); }
    if (i % 25 === 0) { setLoad(`Measuring furniture… (${i}/${defs.length})`, 0.15 + 0.35 * i / defs.length); await tick(); }
  }

  setLoad('Building the apartment…', 0.55);
  await tick();
  G.particles = new Particles(G.scene);
  G.sky = new Sky(G.scene);
  G.weather = new Weather(G.scene);
  G.apartment = new Apartment(G.scene);
  G.apartment.build();
  G.events.emit('aptBuilt');
  setLoad('Raising the skyline…', 0.7);
  await tick();
  G.city = new City(G.scene);

  setLoad('Moving in…', 0.8);
  await tick();
  G.ui = new UI();
  G.wallet = new Wallet();
  G.market = new Market();
  G.orders = new Orders();
  G.needs = new Needs();
  G.goals = new Goals();
  G.items = new ItemManager(G.scene);
  G.physics = new Physics();
  G.player = new Player(G.camera);
  G.hand = new Hand(G.camera);
  G.placement = new Placement();
  G.interaction = new Interaction();
  G.outfit = new Outfit();
  G.avatar = new Avatar(G.scene);
  G.phone = new Phone();
  G.computer = new Computer();
  G.games = new GameLauncher();
  G.messages = new Messages();
  G.items.loadFromState();
  if (fresh) {
    furnishStarter();
    G.state.flags.furnished = true;
    G.weather.set('clear', true);
  } else G.weather.set(G.state.weather.kind, true);
  if (!G.state.market.drop) G.market.scheduleDrop();
  G.goals.rollDaily();
  G.avatar.rebuild();
  G.tutorial = new Tutorial();
  if (G.state.playerPos) G.player.teleport(G.state.playerPos[0], G.state.playerPos[2], G.state.playerPos[3] ?? Math.PI);
  else G.player.teleport(-0.55, 3.9, Math.PI);

  // daily royalties keep money flowing without grinding
  G.events.on('newDay', (d) => {
    const amt = 120 + G.state.level * 30;
    G.wallet.earn(amt, 'Daily royalties');
    G.phone.notify({ app: 'wallet', title: '🏦 Royalties deposited', body: `+$${amt} from your old app. Good morning!` });
  });
  G.events.on('beforeSave', () => { const p = G.player; G.state.playerPos = [p.pos.x, 0, p.pos.z, p.yaw]; G.state.weather.kind = G.weather.kind; });
  G.events.on('discovered', (def) => { if (def.category !== 'package' && !def.hidden && G.started) addXP(12, 'New item'); });

  // ------------------------------------------------------------ main loop
  const eng = G.engine;
  eng.onUpdate((dt, t) => {
    if (!G.started) { titleCam(dt, t); }
    const running = G.started && !G.ui.paused;
    if (running) {
      G.clock.update(dt);
      G.player.update(dt);
      G.interaction.update(dt);
      G.needs.update(dt);
      G.orders.update(dt);
      G.goals.update(dt);
      G.messages.update(dt);
      G.tutorial.update(dt);
    }
    G.hand.update(dt);
    G.items.update(dt);
    G.physics.update(dt);
    G.sky.update(dt, t);
    G.weather.update(dt, t);
    G.city.update(dt, t);
    G.apartment.update(dt);
    G.particles.update(dt);
    G.avatar.update(dt);
    updateMirrors(dt);
    G.audio.updateListener(G.camera);
    G.ui.update(dt);
    G.input.endFrame();
  }, 0);
  G.particles.setScale(window.innerHeight);
  window.addEventListener('resize', () => G.particles.setScale(window.innerHeight));
  eng.start();

  // ------------------------------------------------------------ input bindings
  G.input.onLockChange = (locked) => {
    if (!G.started) return;
    if (!locked && !G.ui.blocking && !G.resetting) showPause(true);
    if (locked) showPause(false);
  };
  G.input.addListener((type, e) => {
    if (type !== 'keydown' || !G.started) return;
    if (G.games.active) return;
    if (e.code === 'Tab' || e.code === 'KeyP') { e.preventDefault(); if (G.computer.open) return; G.ui.closeModal(true); G.phone.toggle(); }
    else if (e.code === 'KeyI' && !G.phone.open && !G.ui.modal && !G.computer.open) { G.ui.openContainer(G.apartment.storage.container); }
    else if (e.code === 'Escape') {
      if (G.ui.modal) { G.ui.closeModal(); }
      else if (G.phone.open) { if (G.phone.stack.length) G.phone.back(); else G.phone.close(); }
    }
  });
  G.engine.renderer.domElement.addEventListener('click', () => { if (G.started && !G.ui.blocking) { G.audio.unlock(); G.input.lock(); } });
  setInterval(() => { if (G.started) saveState(); }, 30000);
  window.addEventListener('beforeunload', () => { if (G.started && !G.resetting) saveState(); });

  setLoad('Ready!', 1);
  await new Promise((r) => setTimeout(r, 250));
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 800);
  showTitle(fresh);
  window.__game = G; // handy for debugging & automated screenshots
  window.__THREE = THREE;
}

// ------------------------------------------------------------ title screen
let titleT = 0;
function titleCam(dt) {
  titleT += dt;
  const a = Math.sin(titleT * 0.05) * 0.35;
  G.camera.position.set(-1.2 + Math.sin(titleT * 0.04) * 0.6, 1.55, -1.0);
  G.camera.rotation.set(0.04, Math.PI * 0.18 + a, 0, 'YXZ');
}

function showTitle(fresh) {
  const t = el('div', { id: 'title' },
    el('div', { class: 't-card' },
      el('div', { class: 't-logo' }, 'homebody'),
      el('div', { class: 't-sub' }, 'a cozy life, delivered.'),
      el('div', { class: 't-btns' },
        el('button', { class: 'btn primary big', onclick: () => start() }, fresh ? 'Move in' : 'Continue'),
        el('button', { class: 'btn ghost', onclick: () => t.querySelector('.t-help').classList.toggle('on') }, 'How to play'),
      ),
      el('div', { class: 't-help' },
        el('p', {}, 'You live on the 24th floor of a downtown tower and never need to leave. Shop from a dozen apps on your phone (Tab), get deliveries at the door within minutes, and use everything you buy.'),
        el('div', { class: 'controls' }, ...[['WASD', 'Move'], ['Mouse', 'Look'], ['E / F / R', 'Interact (see prompts)'], ['Left click', 'Use held item'], ['Hold right click', 'Inspect'], ['G', 'Drop · hold to throw'], ['X', 'Stash in storage'], ['Tab', 'Phone'], ['I', 'Storage'], ['Esc', 'Pause']].map(([k, v]) => el('div', {}, el('span', { class: 'key' }, k), v))),
      ),
      el('div', { class: 't-foot' }, 'Headphones recommended · everything is procedurally generated'),
    ),
  );
  document.getElementById('ui').appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  function start() {
    G.audio.unlock();
    G.audio.applyVolumes();
    t.classList.remove('in');
    setTimeout(() => t.remove(), 600);
    G.started = true;
    G.player.update(0);
    G.weather.startAmbience();
    G.events.emit('started');
    G.input.lock();
    if (fresh) G.tutorial.begin();
    if (G.state.phone.music.playing) G.phone.toggleMusic();
    for (const i of G.items.all()) if (i.data.loc === 'world') G.behaviors.onEnterWorld(i);
    queueSave();
  }
}

// ------------------------------------------------------------ pause
let pauseEl = null;
function showPause(on) {
  if (on === !!pauseEl) return;
  if (!on) { pauseEl.remove(); pauseEl = null; G.ui.paused = false; return; }
  G.ui.paused = true;
  pauseEl = el('div', { id: 'pause' }, el('div', { class: 'p-card' },
    el('div', { class: 't-logo small' }, 'paused'),
    el('button', { class: 'btn primary big', onclick: () => { G.input.lock(); } }, 'Resume'),
    el('button', { class: 'btn', onclick: () => { showPause(false); G.phone.show('settings'); } }, 'Settings'),
    el('button', { class: 'btn', onclick: () => { saveState(); G.ui.toast('Saved!', { icon: '💾' }); } }, 'Save'),
    el('div', { class: 'p-hint' }, 'Click anywhere to resume'),
  ));
  pauseEl.addEventListener('mousedown', (e) => { if (e.target === pauseEl) G.input.lock(); });
  document.getElementById('ui').appendChild(pauseEl);
}

boot().catch((e) => {
  console.error(e);
  setLoad('Something went wrong: ' + e.message, 1);
});
