// Boot: loading screen -> main menu -> new game -> team/class select -> play.
import * as THREE from 'three';
import { Renderer } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { TextureLibrary } from './engine/assets.js';
import * as TexLib from './assets/textures.js';
import { createSky } from './assets/sky.js';
import { SoundEngine } from './assets/sounds.js';
import { preloadPlayerModels } from './assets/playermodels.js';
import { loadWorld } from './game/world.js';
import { Game } from './game/game.js';
import { TEAM_T, TEAM_CT, TEAM_SPEC } from './game/player.js';
import { Hud } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { Settings } from './settings.js';
import { buildHudState } from './game/hudstate.js';
import { Console } from './game/console.js';
import { RadioMenu } from './ui/radiomenu.js';
import { Announcer } from './game/announcer.js';
import { DUST2_LIGHTING } from './map/lighting.js';
import { setLightCurve } from './map/meshbuilder.js';

const params = new URLSearchParams(location.search);

async function boot() {
  const app = document.getElementById('app');
  const settings = new Settings();
  const renderer = new Renderer(app);
  renderer.configure(settings.video());
  setLightCurve(settings.get('gamma'), settings.get('brightness'));
  const input = new Input(renderer.canvas);
  input.sensitivity = settings.get('sensitivity');
  input.invertY = settings.get('invertY');
  const hud = new Hud(app);
  const menus = new Menus(app, { onCommand: (c) => onMenuCommand(c) });
  renderer.onResize = (vp) => { hud.resize?.({ x: vp.x, y: vp.y, w: vp.w, h: vp.h, rw: vp.rw, rh: vp.rh }); menus.resize?.(vp); };
  renderer.resize();

  const progress = (text, p) => menus.showLoading?.(text, p);
  progress('Initializing renderer', 0.02);
  await frame();

  progress('Loading textures', 0.08);
  await frame();
  const texLib = new TextureLibrary(TexLib);

  progress('Building sky', 0.18);
  await frame();
  const sky = createSky(renderer.renderer, { sunDir: DUST2_LIGHTING.sunDir });
  renderer.scene.background = sky;

  progress('Precaching sounds', 0.26);
  const sound = new SoundEngine();
  const soundReady = sound.init(44100).catch((e) => console.warn('sound init failed', e));
  sound.setMasterVolume(settings.get('volume'));

  const W = await loadWorld(texLib, (msg, p) => progress(msg, 0.3 + p * 0.5), { forceBake: params.has('bake') });
  for (const m of W.meshes) renderer.world.add(m);

  progress('Precaching player models', 0.85);
  await frame();
  try { preloadPlayerModels?.(); } catch (e) { console.warn(e); }
  await soundReady;

  progress('Building navigation mesh', 0.93);
  await frame();
  const announcer = new Announcer(settings);
  const game = new Game({ renderer, input, sound, texLib, W, hud, menus, settings });
  game.announce = (t) => announcer.say(t);
  const radioMenu = new RadioMenu(app, (text) => {
    if (game.local?.alive) { game.rounds.radio(game.local, text); game.bots.onRadio?.(game.local, text); }
  });
  const con = new Console(game, menus, settings, renderer, input, hud);
  game.console = con;
  menus.hideLoading?.();

  // ---------------------------------------------------------------- state
  let inGame = false;
  let showScores = false;
  let pendingTeam = null;
  const ambience = { handle: null };
  window.__game = game;

  function startAmbience() {
    if (ambience.handle) return;
    try { ambience.handle = sound.loop('ambience_wind', { volume: 0.35 }); } catch { /* ignore */ }
  }

  function menuBackgroundView() {
    // a slow look across T spawn toward mid, like a 1.6 menu backdrop
    const t = performance.now() / 1000;
    renderer.setView([-1350, -960, 128 + 64], 4, 70 + Math.sin(t * 0.05) * 12, 0);
  }

  function openMain() {
    input.exitLock();
    menus.showMain?.({ inGame });
  }

  function newGame(opts) {
    settings.set('newgame', opts);
    game.newGame({ ...opts, playerName: settings.get('name') });
    inGame = true;
    startAmbience();
    menus.hideAll?.();
    menus.showTeamSelect?.((team) => onMenuCommand('jointeam ' + team));
  }

  function chooseTeam(team) {
    const opts = settings.get('newgame');
    pendingTeam = team;
    if (team === TEAM_SPEC) {
      game.joinTeam(game.local, TEAM_SPEC);
      game.bots.fillTeams(opts.perTeam ?? 5);
      menus.hideAll?.();
      return;
    }
    menus.showClassSelect?.(team, (cls) => onMenuCommand('joinclass ' + cls));
  }

  function chooseClass(skin) {
    const opts = settings.get('newgame');
    game.joinTeam(game.local, pendingTeam, skin || null);
    game.bots.fillTeams(opts.perTeam ?? 5);
    menus.hideAll?.();
    renderer.canvas.focus?.();
    input.requestLock();
  }

  function onMenuCommand(c) {
    const [cmd, ...rest] = c.split(' ');
    const arg = rest.join(' ');
    switch (cmd) {
      case 'newgame':
        menus.showNewGame?.(settings.get('newgame'), (opts) => newGame(opts));
        break;
      case 'resume':
        if (inGame) { menus.hideAll?.(); input.requestLock(); }
        break;
      case 'options':
        menus.showOptions?.(settings.all(), (k, v) => applySetting(k, v));
        break;
      case 'quit':
        inGame = false;
        game.started = false;
        menus.showMain?.({ inGame: false });
        break;
      case 'jointeam': {
        const n = +arg;
        const team = n === 1 ? TEAM_T : n === 2 ? TEAM_CT : n === 6 ? TEAM_SPEC : autoTeam();
        chooseTeam(team);
        break;
      }
      case 'joinclass': {
        const n = +arg;
        const list = pendingTeam === TEAM_T ? ['terror', 'leet', 'arctic', 'guerilla'] : ['urban', 'gsg9', 'sas', 'gign'];
        chooseClass(n >= 1 && n <= 4 ? list[n - 1] : null);
        break;
      }
      case 'buy':
        game.rounds.buy(game.local, arg);
        break;
      case 'buyequip':
        game.rounds.buy(game.local, arg);
        break;
      case 'menu_close':
        menus.hideAll?.();
        if (inGame) input.requestLock();
        break;
      default:
        if (c.startsWith('console:')) con.exec(c.slice(8));
        else if (c.startsWith('say:')) chat(c.slice(4), false);
        else if (c.startsWith('say_team:')) chat(c.slice(9), true);
    }
  }

  function autoTeam() {
    const t = game.players.filter((p) => p.team === TEAM_T).length;
    const ct = game.players.filter((p) => p.team === TEAM_CT).length;
    return t <= ct ? TEAM_T : TEAM_CT;
  }

  function chat(text, teamOnly) {
    const p = game.local;
    if (!text.trim()) return;
    hud.chat?.(p.name, p.team, text, { dead: !p.alive, teamOnly });
  }

  function applySetting(k, v) {
    settings.set(k, v);
    if (k === 'sensitivity') input.sensitivity = +v;
    if (k === 'invertY') input.invertY = !!v;
    if (k === 'volume') sound.setMasterVolume(+v);
    if (['mode', 'aspect', 'fov'].includes(k)) renderer.configure(settings.video());
    if (k === 'gamma' || k === 'brightness') setLightCurve(settings.get('gamma'), settings.get('brightness'));
  }

  // ---------------------------------------------------------------- input commands
  input.onCommand((cmd, pressed, code) => {
    if (!pressed && cmd === '+showscores') { showScores = false; menus.hideScoreboard?.(); return true; }
    if (!pressed) return false;
    if (cmd === 'toggleconsole' || code === 'Backquote') { menus.toggleConsole?.(); input.exitLock(); return true; }
    if (code === 'Escape' || cmd === 'cancelselect') {
      if (radioMenu.open) { radioMenu.close(); return true; }
      if (!!menus.isOpen?.()) { menus.hideAll?.(); if (inGame) input.requestLock(); else openMain(); return true; }
      openMain();
      return true;
    }
    if (!inGame) return false;
    // fire / jump / use skips the bullet cam
    if (game.bulletCam?.active && (cmd === '+attack' || cmd === '+attack2' || cmd === '+jump' || cmd === '+use')) { game.bulletCam.skip(); return true; }
    // number keys feed open menus first (team/class/buy menus handle their own keys)
    if (radioMenu.open && cmd && cmd.startsWith('slot')) { radioMenu.choose(+cmd.slice(4)); return true; }
    if (!!menus.isOpen?.()) return false;
    switch (cmd) {
      case '+showscores': showScores = true; return true;
      case 'buymenu':
        if (game.local.alive && game.inBuyZone(game.local) && game.rounds.buyTimeLeft()) {
          input.exitLock();
          menus.showBuyMenu?.(game.local, { onBuy: (item) => game.rounds.buy(game.local, item) });
        }
        return true;
      case 'chooseteam': input.exitLock(); menus.showTeamSelect?.((team) => onMenuCommand('jointeam ' + team)); return true;
      case 'messagemode': input.exitLock(); menus.showChatInput?.(false, (t) => chat(t, false)); return true;
      case 'messagemode2': input.exitLock(); menus.showChatInput?.(true, (t) => chat(t, true)); return true;
      case 'radio1': case 'radio2': case 'radio3': radioMenu.show(+cmd.slice(5)); return true;
      case 'snapshot': return true;
      default:
        if (cmd) game.localCommand(cmd);
        // spectator: mouse buttons cycle targets
        if (game.local && !game.local.alive && (cmd === '+attack' || cmd === '+attack2')) game.nextSpectateTarget(cmd === '+attack' ? 1 : -1);
        return false;
    }
  });
  input.onLockChange = () => {};
  renderer.canvas.addEventListener('click', () => { if (inGame && !!!menus.isOpen?.()) input.requestLock(); sound.resume(); });

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  let fpsAcc = 0, fpsFrames = 0, fps = 0;
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    fpsAcc += dt; fpsFrames++;
    if (fpsAcc >= 0.5) { fps = fpsFrames / fpsAcc; fpsAcc = 0; fpsFrames = 0; }
    if (inGame) {
      game.frame(dt);
      renderer.render(game.drawVm);
      hud.draw?.(game.bulletCam?.active ? { hidden: true } : buildHudState(game, { fps: settings.get('cl_showfps') ? fps : null, netgraph: settings.get('net_graph') ? { fps } : null, settings }), dt);
      if (showScores) menus.showScoreboard?.(scoreData());
    } else {
      menuBackgroundView();
      renderer.render(false);
      hud.draw?.({ alive: false, team: TEAM_SPEC, hidden: true }, dt);
    }
    if (!window.__ready && ++readyFrames > 3) window.__ready = true;
    requestAnimationFrame(loop);
  }
  let readyFrames = 0;

  function scoreData() {
    return {
      tScore: game.rounds.tScore, ctScore: game.rounds.ctScore,
      players: game.players.map((p) => ({ name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, ping: p.isBot ? 0 : p.ping, alive: p.alive, bomb: !!p.weapons[5] && (game.local?.team === TEAM_T || game.local?.team === TEAM_SPEC), isLocal: p.isLocal })),
    };
  }

  // debug / automation hooks
  window.__setView = (x, y, z, pitch, yaw, eyeH = 53) => {
    if (game.local) {
      const p = game.local;
      p.pm.origin = [x, y, z + 36];
      p.prevOrigin = p.pm.origin.slice();
      p.pm.angles = [pitch, yaw, 0];
      game.oldz = p.pm.origin[2];
    }
  };
  if (params.has('autostart')) {
    const team = params.get('team') === 'ct' ? TEAM_CT : TEAM_T;
    newGame({ ...settings.get('newgame'), perTeam: +(params.get('bots') ?? 5), freezeTime: +(params.get('freeze') ?? 6) });
    pendingTeam = team;
    chooseClass(null);
  } else {
    openMain();
  }
  requestAnimationFrame(loop);
}

function frame() { return new Promise((r) => requestAnimationFrame(() => r())); }

boot().catch((e) => {
  console.error(e);
  const d = document.createElement('pre');
  d.style.cssText = 'position:fixed;left:8px;top:8px;color:#f66;font:12px monospace;white-space:pre-wrap;z-index:99';
  d.textContent = 'Error: ' + (e && e.stack || e);
  document.body.appendChild(d);
});
