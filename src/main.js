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
import { MAPS, mapDef as lookupMap, mapAvailability, storeUserFiles, listUserFiles, bundledMaps, mapOffers, mapLabel, mapListed } from './game/maps.js';
import { applyMapFog, applyGrade } from './engine/fog.js';
import { assetUrl } from './engine/assetpath.js';
import * as ATT from './game/attachments.js';
import { TitleScene } from './ui/titlescene.js';
import { ZTips } from './ui/ztips.js';
import { SquadTally } from './ui/front/zscore.js';
import { zombieOptions, resolveDiff } from './game/zdiff.js';
import { recordKey, readRecord } from './game/zrecords.js';

const params = new URLSearchParams(location.search);

async function boot() {
  const app = document.getElementById('app');
  const settings = new Settings();
  const renderer = new Renderer(app);
  renderer.configure(settings.video());
  setLightCurve(settings.get('gamma'), settings.get('brightness'));
  const input = new Input(renderer.canvas);
  input.sensitivity = settings.get('sensitivity');
  input.bindOnly('shove', settings.get('shoveKey')); // (zombie survival shove: Mouse 4 and this key)
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

  progress('Precaching sounds', 0.26);
  const sound = new SoundEngine();
  const soundReady = sound.init(44100).catch((e) => console.warn('sound init failed', e));
  sound.setMasterVolume(settings.get('volume'));

  // which map: ?map=, else the one picked before a map-switch reload, else de_dust2
  let mapLoadError = null;
  const wantMap = (params.get('map') || sessionGet('cs16-map') || 'de_dust2').toLowerCase();
  const loadOpts = { forceBake: params.has('bake'), mapsrc: params.get('mapsrc') };
  let W;
  try {
    W = await loadWorld(texLib, (msg, p) => progress(msg, 0.3 + p * 0.5), { ...loadOpts, mapDef: lookupMap(wantMap) });
  } catch (e) {
    console.error(e);
    mapLoadError = `Couldn't load ${wantMap}: ${e.message}`;
    sessionSet('cs16-map', null);
    W = await loadWorld(texLib, (msg, p) => progress(msg, 0.3 + p * 0.5), loadOpts);
  }
  for (const m of W.meshes) renderer.world.add(m);
  // the map's sky, fog and grade (src/map/maps/*: MAP.sky / fog / grade; a BSP map: dust2's sky or its own skybox)
  const mapFx = W.mapDef?.builtin ? W.mapDef : null;
  progress('Building sky', 0.82);
  await frame();
  renderer.scene.background = createSky(renderer.renderer, { ...(mapFx?.sky || {}), sunDir: (mapFx ? W.lighting : DUST2_LIGHTING).sunDir, fog: mapFx?.fog || null });
  applyMapFog(renderer.scene, mapFx?.fog);
  applyGrade(renderer.canvas, mapFx?.grade);
  if (W.skybox) renderer.scene.background = null;

  progress('Precaching player models', 0.85);
  await frame();
  try { preloadPlayerModels?.(); } catch (e) { console.warn(e); }
  await soundReady;
  const amb = W.mapDef?.ambience || { loop: 'ambience_wind', volume: 0.35 };
  sound.ensure?.(amb.loop); // (a map's loop is synthesised on demand: snd/ambience.js)

  progress('Building navigation mesh', 0.93);
  await frame();
  const announcer = new Announcer(settings);
  const game = new Game({ renderer, input, sound, texLib, W, hud, menus, settings });
  game.announce = (t) => announcer.say(t);
  const radioMenu = new RadioMenu(app, (text) => {
    if (game.local?.alive) { game.rounds.radio(game.local, text); game.bots.onRadio?.(game.local, text); }
  }, { zombie: () => !!game.zombies?.enabled }); // (zombie survival: its squad orders too)
  const con = new Console(game, menus, settings, renderer, input, hud);
  game.console = con;
  // the front end: the title backdrop, first-run tips, the zombie scoreboard's downs / revives
  const title = new TitleScene({ game, renderer, sound, container: app });
  const tips = new ZTips(game, { root: menus.root, input, viewport: () => renderer.viewport });
  const tally = new SquadTally(game.zombies?.events);
  menus.front.info = () => frontInfo();
  menus.front.sound = (n) => sound.play(n, { volume: 0.6 });
  window.__front = { title, tips, tally };
  menus.hideLoading?.();
  menus.mapInfo = { name: W.map.name || 'de_dust2', mode: W.mapDef?.mode || 'bomb', credit: W.mapDef?.credit };

  // ---------------------------------------------------------------- state
  let inGame = false;
  let showScores = false;
  let pendingTeam = null;
  const ambience = { handle: null };
  window.__game = game;

  function startAmbience() {
    if (ambience.handle || ambience.waiting) return;
    ambience.waiting = true;
    (sound.ensure?.(amb.loop) ?? Promise.resolve(true)).then(() => {
      ambience.waiting = false;
      if (ambience.handle) return;
      try { ambience.handle = sound.loop(amb.loop, { volume: amb.volume ?? 0.35 }); } catch { /* ignore */ }
    });
  }

  /** What the main menu shows: the setup Quick start would use, and the best run with it. */
  function frontInfo() {
    const o = zombieDefaults(), d = resolveDiff(zombieOptions(o)), map = W.mapDef?.id || 'de_dust2';
    const allies = Math.max(0, Math.min(10, o.allies | 0)); // (as chooseClass fills the squad)
    const squad = allies ? `${allies} bot${allies === 1 ? '' : 's'}` : 'solo';
    const setup = `${d.label}${d.hardcore ? ' hardcore' : ''} \u00b7 ${squad}`;
    // (records are per map, difficulty and squad size: zrecords.js; the quick setup's own)
    return { best: readRecord(recordKey(map, d, 1 + allies)), bestDiff: setup, map, quick: `${setup} \u00b7 ${map}` };
  }

  /** The last zombie setup (settings.newgame is shared with classic: fill in the zombie defaults). */
  function zombieDefaults() {
    const o = settings.get('newgame') || {};
    return { ...o, mode: 'zombies', allies: o.allies ?? 3, zdiff: o.zdiff || 'normal', skin: o.skin || 'auto', tips: tips.enabled };
  }

  // ---------------------------------------------------------------- maps
  const mapIds = async () => {
    const ids = Object.keys(MAPS);
    for (const id of Object.keys(await bundledMaps())) if (!ids.includes(id)) ids.push(id);
    for (const f of await listUserFiles()) if (f.endsWith('.bsp')) { const id = f.slice(0, -4); if (!ids.includes(id)) ids.push(id); }
    return ids;
  };
  // [id, label] for a menu's map list: the maps that offer this mode (src/map/maps/*: MAP.modes),
  // never a hidden placeholder (maps.js mapListed) unless it's the one loaded (?map= in development)
  const mapList = (ids, mode) => ids.filter((id) => (!mode || mapOffers(lookupMap(id), mode)) && (mapListed(lookupMap(id)) || id === W.mapDef?.id)).map((id) => [id, mapLabel(lookupMap(id))]);
  async function mapInfo(id) {
    const def = lookupMap(id);
    if (def.builtin) return { ok: true, bundled: true, html: builtinInfo(def) };
    if (id === W.mapDef?.id) return { ok: true, html: `<b>${id}</b> is loaded.${def.credit ? ' ' + def.credit + '.' : ''}` };
    const a = await mapAvailability(def);
    if (a.bundled) return { ok: true, bundled: true, html: `&#10003; <b>${id}</b> is included in this build with its original textures${a.sky ? ' and sky' : ''}.${def.credit ? '<br>' + def.credit + '.' : ''}` };
    const lines = [];
    lines.push(def.credit ? `${def.credit}${def.url ? ` - <a href="${def.url}" target="_blank" rel="noopener" style="color:#c8b070">download page</a>` : ''}.` : '');
    lines.push(a.bsp ? `&#10003; ${def.bsp} added.` : `Add your copy of <b>${def.bsp}</b> (from the map's download, or cstrike/maps).`);
    if (def.wads.length) {
      lines.push(a.wads.length ? `&#10003; Textures: ${a.wads.join(', ')}.` : `Optional: Half-Life's <b>halflife.wad</b> and <b>liquids.wad</b> (Half-Life/valve folder) for the original textures - otherwise stand-ins are generated.`);
    }
    if (def.sky) lines.push(a.sky ? '&#10003; Sky added.' : `Optional: the <b>${def.sky}*.tga</b> skybox (valve/gfx/env).`);
    lines.push('<span style="opacity:.7">Files stay in this browser; nothing is uploaded.</span>');
    return { ok: a.ok, html: lines.filter(Boolean).join('<br>') };
  }
  async function addFiles(fileList) { await storeUserFiles(fileList); }
  /** A built-in map's card: thumbnail (tools/thumb.mjs), tagline, blurb, squad size. */
  function builtinInfo(def) {
    const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const sq = def.squad ? ` &middot; best with ${def.squad.best}` : '';
    return `<img src="${assetUrl(def.thumb)}" alt="" onerror="this.remove()" style="float:left;width:120px;height:68px;object-fit:cover;margin:0 8px 2px 0;image-rendering:pixelated">`
      + `<b>${esc(def.title)}</b>${def.tagline ? ` - ${esc(def.tagline)}` : ''}<br>${esc(def.blurb)}<br><span style="opacity:.7">${esc((def.mood || []).join(', '))}${sq}</span>`;
  }

  function openMain() {
    input.exitLock();
    menus.showMain?.({ inGame });
  }

  /** Out of the game and back to the title screen (Leave game, or out of a finished run). */
  function leaveGame() {
    inGame = false;
    input.guardBack = false;
    game.started = false;
    input.exitLock();
    menus.showMain?.({ inGame: false });
  }

  function newGame(opts) {
    settings.set('newgame', opts);
    if (opts.mode === 'zombies' && opts.tips != null) tips.setEnabled(opts.tips);
    title.stop();
    game.newGame({ ...opts, playerName: settings.get('name') });
    inGame = true;
    input.guardBack = true;
    zombieOverShown = false;
    startAmbience();
    menus.hideAll?.();
    // zombie survival: everybody alive is a Counter-Terrorist, pick a skin
    if (opts.mode === 'zombies') {
      pendingTeam = TEAM_CT;
      // from the setup screen (a look picked there): straight in
      if (opts.skin) { sound.play('title_start', { volume: 0.8 }); chooseClass(opts.skin === 'auto' ? null : opts.skin); return; }
      menus.showClassSelect?.(TEAM_CT, (cls) => onMenuCommand('joinclass ' + cls));
      return;
    }
    menus.showTeamSelect?.((team) => onMenuCommand('jointeam ' + team));
  }
  let zombieOverShown = false;

  /** Zombie survival: a few seconds after you die, the score and Play again. */
  function checkZombieOver() {
    const Z = game.zombies;
    if (zombieOverShown || !Z?.enabled || Z.state !== 'over' || game.time - Z.overAt < 4) return;
    zombieOverShown = true;
    input.exitLock();
    // (a new best: more than the best before this run, Z.isNewBest)
    // (out of it - Main menu, Change setup, Esc - the run is done: the title screen, no Resume)
    menus.showZombieOver?.({ waves: Z.survived, kills: Z.kills, best: Z.best, newBest: Z.isNewBest(), cheated: Z.cheated, diff: Z.diff.label, hardcore: Z.diff.hardcore, stats: Z.runStats,
      perks: Z.perks.report(game.local) }, () => newGame(settings.get('newgame')), () => leaveGame()); // (perks: your build, perks.js)
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
    game.bots.fillTeams(opts.mode === 'zombies' ? Math.max(0, Math.min(10, opts.allies ?? 0)) : (opts.perTeam ?? 5)); // zombie survival: up to 10 bot teammates
    menus.hideAll?.();
    renderer.canvas.focus?.();
    input.requestLock();
  }

  function onMenuCommand(c) {
    const [cmd, ...rest] = c.split(' ');
    const arg = rest.join(' ');
    switch (cmd) {
      case 'zsetup':
        mapIds().then((ids) => {
          const d = { ...zombieDefaults(), map: W.mapDef?.id || 'de_dust2', maps: mapList(ids, 'zombies'), mapInfo, addFiles };
          menus.showZombieSetup?.(d, (opts) => {
            if ((opts.map || 'de_dust2') !== (W.mapDef?.id || 'de_dust2')) switchMap(opts.map, opts);
            else newGame(opts);
          });
        });
        break;
      case 'zquick':
        newGame({ ...zombieDefaults(), tips: undefined });
        break;
      case 'newgame':
        mapIds().then((ids) => {
          const d = { ...settings.get('newgame'), ...(arg === 'classic' ? { mode: 'classic' } : {}), map: W.mapDef?.id || 'de_dust2', maps: mapList(ids, arg === 'classic' ? 'classic' : null), mapInfo, addFiles };
          menus.showNewGame?.(d, (opts) => {
            const { maps, mapInfo: _a, addFiles: _b, ...rest } = opts;
            if ((rest.map || 'de_dust2') !== (W.mapDef?.id || 'de_dust2')) switchMap(rest.map, rest);
            else newGame(rest);
          });
        });
        break;
      case 'resume':
        if (inGame) { menus.hideAll?.(); input.requestLock(); }
        break;
      case 'options':
        menus.showOptions?.(settings.all(), (k, v) => applySetting(k, v));
        break;
      case 'quit':
        leaveGame();
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
    if (k === 'shoveKey') input.bindOnly('shove', v);
    if (k === 'invertY') input.invertY = !!v;
    if (k === 'volume') sound.setMasterVolume(+v);
    if (['mode', 'aspect', 'fov'].includes(k)) renderer.configure(settings.video());
    if (k === 'gamma' || k === 'brightness') setLightCurve(settings.get('gamma'), settings.get('brightness'));
  }

  // ---------------------------------------------------------------- input commands
  input.onCommand((cmd, pressed, code) => {
    if (!pressed && cmd === '+showscores') { showScores = false; menus.hideScoreboard?.(); return true; }
    if (!pressed) return !!(cmd && game.zombies?.enabled && game.zombies.perks.key(cmd, false, code == null)); // (a slot key up: a tap on a perk card is a weapon switch after all)
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
    // ...and leaves a security camera view
    if (game.mapEnts?.camera && game.time - game.mapEnts.camera.start > 0.3 && (cmd === '+attack' || cmd === '+use' || cmd === '+jump')) { game.mapEnts.camera = null; return true; }
    // number keys feed open menus first (team/class/buy menus handle their own keys)
    if (radioMenu.open && cmd && cmd.startsWith('slot')) { radioMenu.choose(+cmd.slice(4)); return true; }
    if (game.zombies?.enabled && !menus.isOpen?.() && game.zombies.perks.key(cmd, true)) return true; // (zombie survival: holding a number key picks your open perk card, a tap still switches weapons: perks.js)
    if (!!menus.isOpen?.()) return false;
    switch (cmd) {
      case '+showscores': showScores = true; return true;
      case 'buymenu':
        if (game.local.alive && game.inBuyZone(game.local) && game.rounds.buyTimeLeft()) {
          input.exitLock();
          menus.showBuyMenu?.(game.local, {
            onBuy: (item) => game.rounds.buy(game.local, item), allWeapons: !!game.zombies?.enabled,
            itemState: (id) => (game.zombies?.enabled ? game.zombies.economy.menuState(game.local, id) : ATT.menuState(game.local, id)), // (what the phase sells: zeconomy.js)
            banner: game.zombies?.enabled ? game.zombies.economy.menuBanner(game.local) : null, upgradeTarget: (skins) => ATT.targetName(game.local, skins),
          });
        } else if (game.local.alive && game.local.downed) hud.centerPrint?.(game.zombies.economy.refusal(game.local, 'medkit'), 2); // (zombie survival: no shop from the floor - say so)
        return true;
      case 'chooseteam':
        if (game.zombies?.enabled) { hud.centerPrint?.("You can't change teams in zombie survival.", 2); return true; }
        input.exitLock(); menus.showTeamSelect?.((team) => onMenuCommand('jointeam ' + team)); return true;
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
    W.update?.(dt);
    if (inGame) {
      game.frame(dt);
      tips.frame(dt);
      checkZombieOver();
      W.skybox?.userData.follow(renderer.eye);
      renderer.render(game.drawVm);
      hud.draw?.(game.bulletCam?.active ? { hidden: true } : buildHudState(game, { fps: settings.get('cl_showfps') ? fps : null, netgraph: settings.get('net_graph') ? { fps } : null, settings }), dt);
      if (showScores) menus.showScoreboard?.(scoreData());
    } else {
      if (!title.active) title.start();
      title.update(dt);
      W.skybox?.userData.follow(renderer.eye);
      renderer.render(false);
      hud.draw?.({ alive: false, team: TEAM_SPEC, hidden: true }, dt);
    }
    if (!window.__ready && ++readyFrames > 3) window.__ready = true;
    requestAnimationFrame(loop);
  }
  let readyFrames = 0;

  function scoreData() {
    const Z = game.zombies;
    if (Z?.enabled) {
      // zombie survival: the squad only, no teams (ui/front/zscore.js)
      const h = Z.hudInfo();
      return { zombie: {
        wave: h.wave, state: h.state, left: h.left, next: Math.ceil(h.next ?? 0), time: Math.floor((Z.state === 'over' ? Z.runStats.endT || game.time : game.time) - Z.runStats.startT),
        diff: h.diff, hardcore: h.hardcore, squadKills: h.squadKills, kills: h.kills, best: h.best, map: W.mapDef?.id || 'de_dust2',
        players: game.players.filter((p) => p.team === TEAM_CT && !p.isZombie).map((p) => ({
          name: p.name, kills: p.kills, deaths: p.deaths, downs: tally.downs(p), revives: tally.revives(p), money: p.money | 0,
          status: !p.alive ? 'dead' : p.downed ? 'down' : 'alive', isLocal: p.isLocal, isBot: !!p.isBot,
          perks: Z.perks.badges(p), // (their build: perks.js)
        })),
      } };
    }
    return {
      tScore: game.rounds.tScore, ctScore: game.rounds.ctScore,
      players: game.players.filter((p) => !p.isZombie).map((p) => ({ name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, ping: p.isBot ? 0 : p.ping, alive: p.alive, bomb: !!p.weapons[5] && (game.local?.team === TEAM_T || game.local?.team === TEAM_SPEC), isLocal: p.isLocal })),
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
  // a map switch reloads the page; pick the game up where the menu left it
  const resume = sessionGet('cs16-autostart');
  if (mapLoadError) menus.print?.(mapLoadError);
  if (resume && !mapLoadError) {
    sessionSet('cs16-autostart', null);
    try { newGame(JSON.parse(resume)); } catch (e) { console.warn(e); openMain(); }
  } else if (params.has('autostart')) {
    const team = params.get('team') === 'ct' ? TEAM_CT : TEAM_T;
    const mode = params.get('mode') === 'zombies' ? 'zombies' : 'classic';
    // zombie survival options (zdiff.js zombieOptions): &zdiff=hard&hardcore=1&squad=0&breaklen=20
    const zo = {};
    if (params.has('zdiff')) zo.zdiff = params.get('zdiff');
    if (params.has('hardcore')) zo.hardcore = params.get('hardcore') !== '0';
    if (params.has('squad')) zo.squadScaling = params.get('squad') !== '0';
    if (params.has('breaklen')) zo.breakLen = +params.get('breaklen');
    if (params.has('roles')) zo.roles = params.get('roles'); // (&roles=medic,auto,gunner: the bots' roles - zsquad.js)
    newGame({ ...settings.get('newgame'), skin: undefined, mode, allies: +(params.get('allies') ?? 0), perTeam: +(params.get('bots') ?? 5), freezeTime: +(params.get('freeze') ?? 6), ...zo });
    pendingTeam = mode === 'zombies' ? TEAM_CT : team;
    chooseClass(null);
  } else {
    openMain();
  }
  requestAnimationFrame(loop);
}

function frame() { return new Promise((r) => requestAnimationFrame(() => r())); }

function sessionGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionSet(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* private mode */ } }

/** Load another map: the world is built once per page, so reload with it selected. */
function switchMap(id, opts) {
  sessionSet('cs16-map', id);
  sessionSet('cs16-autostart', JSON.stringify(opts));
  const u = new URL(location.href);
  u.searchParams.delete('autostart');
  if (u.searchParams.has('map')) u.searchParams.set('map', id);
  location.href = u.toString();
}

boot().catch((e) => {
  console.error(e);
  const d = document.createElement('pre');
  d.style.cssText = 'position:fixed;left:8px;top:8px;color:#f66;font:12px monospace;white-space:pre-wrap;z-index:99';
  d.textContent = 'Error: ' + (e && e.stack || e);
  document.body.appendChild(d);
});
