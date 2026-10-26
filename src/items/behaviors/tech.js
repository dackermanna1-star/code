// Electronics: TVs, consoles & games, computers, speakers, turntables,
// smart speakers, telescopes, cameras, headphones, VR, arcade cabinets.
import * as THREE from 'three';
import { G } from '../../game.js';
import { allLayers } from '../../core/engine.js';
import { VirtualLight } from '../../core/lightpool.js';
import { MusicPlayer, STATIONS } from '../../core/music.js';
import { CHANNELS, drawChannel } from '../../ui/tvchannels.js';
import { worldPos, itemYaw, home } from './home.js';
import { getDef } from '../registry.js';
import { findOwned } from './util.js';
import { pick, rand } from '../../core/utils.js';

const STATION_IDS = Object.keys(STATIONS);

// ---------------------------------------------------------------- TV
function screenSetup(inst, w = 512, h = 288) {
  const screen = inst.model.getObjectByName('screen');
  if (!screen) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0, roughness: 0.25, metalness: 0.1 });
  screen.material = m;
  return { canvas: c, ctx: c.getContext('2d'), tex, mat: m, mesh: screen };
}

const tv = {
  init(inst) {
    inst.runtime.scr = screenSetup(inst);
    if (inst.st.ch === undefined) inst.st.ch = 0;
    const l = new VirtualLight('#8fb3ff', 0, 4.5, 2);
    const b = inst.def._bounds;
    l.position.set(0, b ? b.center.y : 0.8, 0.5); allLayers(l);
    inst.model.add(l); inst.runtime.light = l;
    tv.apply(inst);
  },
  dispose(inst) { inst.runtime.snd?.stop(); inst.runtime.music?.stop(); inst.runtime.light?.parent?.remove(inst.runtime.light); inst.runtime.light?.dispose(); },
  onLeaveWorld(inst) { if (inst.st.on) tv.power(inst, false, true); },
  apply(inst) {
    const s = inst.runtime.scr; if (!s) return;
    s.mat.emissiveIntensity = inst.st.on ? 1.15 : 0;
    s.mat.color.set(inst.st.on ? '#000000' : '#050608');
    inst.runtime.light.intensity = inst.st.on ? 1.6 : 0;
    if (!inst.st.on) { s.ctx.fillStyle = '#000'; s.ctx.fillRect(0, 0, s.canvas.width, s.canvas.height); s.tex.needsUpdate = true; }
  },
  power(inst, on = !inst.st.on, quiet = false) {
    inst.st.on = on;
    if (!quiet) G.audio.play('beep', { pos: worldPos(inst), pitch: on ? 1.2 : 0.7 });
    tv.apply(inst);
    tv.sound(inst);
    if (on) G.events.emit('act', 'tv');
  },
  sound(inst) {
    inst.runtime.snd?.stop(); inst.runtime.snd = null;
    inst.runtime.music?.stop(); inst.runtime.music = null;
    if (!inst.st.on || G.games?.active) return;
    const ch = CHANNELS[inst.st.ch % CHANNELS.length];
    const pos = worldPos(inst, [0, 0.8, 0.2]);
    if (ch.music) { inst.runtime.music = new MusicPlayer({ station: ch.music, pos, volume: 0.35 }); inst.runtime.music.start(); }
    else inst.runtime.snd = G.audio.loop(ch.sound || 'tvchatter', { pos, volume: 0.35 });
  },
  channel(inst, d = 1) {
    inst.st.ch = (inst.st.ch + d + CHANNELS.length) % CHANNELS.length;
    inst.runtime.static = 0.25;
    G.audio.play('click', { pos: worldPos(inst) });
    tv.sound(inst);
    G.ui.toast(`📺 ${CHANNELS[inst.st.ch].name}`, { duration: 1.4 });
  },
  world(inst) {
    const a = [{ key: 'E', label: inst.st.on ? 'Turn off' : 'Turn on', run: () => tv.power(inst) }];
    if (inst.st.on) { a.push({ key: 'R', label: `Next channel (${CHANNELS[inst.st.ch].name})`, run: () => tv.channel(inst, 1) }); a.push({ key: 'Q', label: 'Previous channel', run: () => tv.channel(inst, -1) }); }
    const consoleInst = G.items.all().find((i) => i.data.loc === 'world' && i.def.use?.type === 'console');
    if (consoleInst) a.push({ key: 'F', label: 'Play video games', run: () => G.ui.openGameLibrary({ console: consoleInst, tv: inst }) });
    else a.push({ key: 'F', label: 'Watch from the couch', run: () => tv.watch(inst) });
    return a;
  },
  watch(inst) {
    if (!inst.st.on) tv.power(inst, true);
    // find a seat facing the TV, otherwise stand in front of it
    const tp = worldPos(inst);
    const seatInst = G.items.all().filter((i) => i.data.loc === 'world' && i.def.use?.type === 'seat').sort((a, b) => worldPos(a).distanceTo(tp) - worldPos(b).distanceTo(tp))[0];
    if (seatInst && worldPos(seatInst).distanceTo(tp) < 5) {
      home.seat.sit(seatInst);
      // turn to face the tv
      const sp = G.player.occ?.target;
      if (sp) { const d = tp.clone().sub(sp); G.player.yaw = Math.atan2(-d.x, -d.z); G.player.occ.yaw = G.player.yaw; }
    } else {
      const yaw = itemYaw(inst);
      const front = worldPos(inst, [0, 0, 2.2]); front.y = 0;
      G.player.occupy({ pos: front, yaw: yaw, pitch: -0.05, eye: 1.6, label: 'Watching TV', yawLimit: 0.6, exitPos: front });
      G.player.occ.seat = 'standing';
    }
  },
  update(inst, dt) {
    if (!inst.st.on || inst.data.loc !== 'world') return;
    const s = inst.runtime.scr; if (!s) return;
    const camPos = G.camera.position;
    const p = worldPos(inst, [0, 0.6, 0]);
    const dist = camPos.distanceTo(p);
    inst.runtime.acc = (inst.runtime.acc || 0) + dt;
    const fps = dist < 7 ? 1 / 24 : 1 / 6;
    if (inst.runtime.acc >= fps) {
      const t = performance.now() / 1000;
      if (G.games?.active && G.games.canvas) {
        s.ctx.drawImage(G.games.canvas, 0, 0, s.canvas.width, s.canvas.height);
      } else {
        const col = drawChannel(s.ctx, s.canvas.width, s.canvas.height, inst.st.ch, t);
        if (col) inst.runtime.light.color.lerp(new THREE.Color(col), 0.2);
      }
      if (inst.runtime.static > 0) {
        inst.runtime.static -= inst.runtime.acc;
        const img = s.ctx.getImageData(0, 0, 128, 72);
        for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
        s.ctx.putImageData(img, 0, 0); s.ctx.drawImage(s.canvas, 0, 0, 128, 72, 0, 0, s.canvas.width, s.canvas.height);
      }
      s.tex.needsUpdate = true;
      inst.runtime.acc = 0;
      inst.runtime.light.intensity = 1.3 + Math.random() * 0.3;
    }
    // watching gives fun when looking at the screen
    const look = G.camera.getWorldDirection(new THREE.Vector3());
    const to = p.clone().sub(camPos).normalize();
    if (dist < 6 && look.dot(to) > 0.75) {
      inst.runtime.watchT = (inst.runtime.watchT || 0) + dt;
      if (inst.runtime.watchT > 2) {
        inst.runtime.watchT = 0;
        G.needs.add({ fun: G.player.isSitting ? 0.9 : 0.5, comfort: G.player.isSitting ? 0.2 : 0 }, { silent: true });
        G.events.emit('act', 'watchTV', { seconds: 2, channel: inst.st.ch });
      }
    }
  },
  subtitle: (inst) => (inst.st.on ? `Channel ${inst.st.ch + 1}: ${CHANNELS[inst.st.ch].name}` : 'Off'),
};

// ---------------------------------------------------------------- consoles & games
const console_ = {
  world(inst) {
    return [{ key: 'E', label: 'Play video games', run: () => G.ui.openGameLibrary({ console: inst, tv: G.items.all().find((i) => i.data.loc === 'world' && i.def.use?.type === 'tv') }) }];
  },
  init(inst) {
    for (const g of inst.def.use.bundled || []) if (!G.state.games.includes(g)) G.state.games.push(g);
    const led = inst.model.getObjectByName('led');
    if (led) { led.material = led.material.clone(); inst.runtime.led = led; }
  },
  update(inst) { if (inst.runtime.led) inst.runtime.led.material.emissiveIntensity = G.games?.active ? 3 : 0.6; },
};

const handheld = {
  held(inst) { return [{ key: 'LMB', label: 'Play', run: () => G.ui.openGameLibrary({ handheld: inst }) }]; },
  world(inst) { return [{ key: 'F', label: 'Play', run: () => { G.items.pickUp(inst); G.ui.openGameLibrary({ handheld: inst }); } }]; },
  init: console_.init,
};

const game = {
  held(inst) {
    const gid = inst.def.use.game;
    const owned = G.state.games.includes(gid);
    return [{ key: 'LMB', label: owned ? 'Play it' : 'Add to game library', run: () => game.install(inst, true) }];
  },
  world(inst) { return [{ key: 'F', label: 'Play', run: () => game.install(inst, true) }]; },
  install(inst, launch) {
    const gid = inst.def.use.game;
    if (!G.state.games.includes(gid)) {
      G.state.games.push(gid);
      G.audio.play('powerup');
      G.particles.sparkle(G.hand.held === inst ? G.hand.tipWorld() : worldPos(inst, [0, 0.1, 0]), 14);
      G.ui.toast(`${inst.def.name} added to your library`, { icon: '🎮', kind: 'good' });
      G.events.emit('act', 'installGame', { game: gid });
      return;
    }
    if (launch) G.games.launch(gid, { source: inst });
  },
};

const arcade = {
  world(inst) { return [{ key: 'E', label: `Play ${inst.def.use.title || 'arcade game'}`, run: () => { G.audio.play('coin'); G.games.launch(inst.def.use.game, { source: inst, arcade: true }); } }]; },
  init(inst) { inst.runtime.scr = screenSetup(inst, 256, 256); if (inst.runtime.scr) { inst.runtime.scr.mat.emissiveIntensity = 1.1; inst.runtime.scr.mat.color.set('#000'); } },
  update(inst, dt) {
    const s = inst.runtime.scr; if (!s) return;
    inst.runtime.acc = (inst.runtime.acc || 0) + dt;
    if (inst.runtime.acc < 0.08) return;
    inst.runtime.acc = 0;
    const t = performance.now() / 1000;
    const { ctx, canvas } = s;
    ctx.fillStyle = '#05010f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 30; i++) { ctx.fillStyle = `hsl(${(i * 37 + t * 60) % 360},90%,60%)`; ctx.fillRect((i * 53 + t * 40) % 256, (i * 91 + t * 70 * (i % 3 + 1)) % 256, 4, 4); }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center';
    ctx.fillText(inst.def.use.title || 'ARCADE', 128, 100);
    if (Math.sin(t * 4) > 0) { ctx.font = 'bold 18px monospace'; ctx.fillStyle = '#ffd23f'; ctx.fillText('INSERT COIN', 128, 170); }
    s.tex.needsUpdate = true;
  },
};

// ---------------------------------------------------------------- computers
const computer = {
  world(inst) { return [{ key: 'E', label: inst.def.use.laptop ? 'Open laptop' : 'Use computer', run: () => computer.use(inst) }]; },
  held(inst) { return inst.def.use.portable ? [{ key: 'LMB', label: 'Open', run: () => G.computer.show({ device: inst }) }] : []; },
  use(inst) {
    const yaw = itemYaw(inst);
    const u = inst.def.use;
    const p = worldPos(inst, u.userPos || [0, 0, 0.65]); p.y = 0;
    G.player.occupy({ pos: p, yaw, pitch: u.pitch ?? -0.12, eye: u.eye ?? 1.15, label: 'At the computer', yawLimit: 0.8, exitPos: worldPos(inst, [0, 0, 1.1]).setY(0) });
    G.player.occ.seat = 'computer';
    setTimeout(() => G.computer.show({ device: inst }), 500);
  },
  init(inst) {
    inst.runtime.scr = screenSetup(inst, 512, 320);
    if (inst.runtime.scr) { inst.runtime.scr.mat.emissiveIntensity = 1.0; inst.runtime.scr.mat.color.set('#000'); computer.draw(inst); }
    const rgb = []; inst.model.traverse((o) => { if (o.userData.rgb) { o.material = o.material.clone(); rgb.push(o); } });
    inst.runtime.rgb = rgb;
  },
  draw(inst) {
    const s = inst.runtime.scr; if (!s) return;
    const { ctx, canvas } = s; const w = canvas.width, h = canvas.height;
    const g = ctx.createLinearGradient(0, 0, w, h);
    const hue = (G.state.phone.wallpaper * 47 + 200) % 360;
    g.addColorStop(0, `hsl(${hue},60%,35%)`); g.addColorStop(1, `hsl(${(hue + 60) % 360},70%,20%)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '600 64px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(G.clock.fmt(), w / 2, h / 2);
    ctx.font = '400 20px Inter, sans-serif'; ctx.fillText(`${G.clock.dayName} · Day ${G.clock.day}`, w / 2, h / 2 + 36);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, h - 26, w, 26);
    ['#ff5f57', '#febc2e', '#28c840', '#4f8cff', '#b06cff'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(w / 2 - 60 + i * 30, h - 13, 8, 0, 7); ctx.fill(); });
    s.tex.needsUpdate = true;
  },
  update(inst, dt) {
    inst.runtime.acc = (inst.runtime.acc || 0) + dt;
    if (inst.runtime.acc > 5) { inst.runtime.acc = 0; computer.draw(inst); }
    const t = performance.now() * 0.0005;
    inst.runtime.rgb?.forEach((o, i) => { o.material.emissive?.setHSL((t + i * 0.1) % 1, 0.9, 0.5); });
  },
};

// ---------------------------------------------------------------- speakers & radios
function musicFor(inst) {
  if (!inst.runtime.music) {
    inst.runtime.music = new MusicPlayer({ station: inst.st.station || inst.def.use.station || 'lofi', pos: worldPos(inst, [0, 0.15, 0]), volume: inst.def.use.volume ?? 0.55, filterFreq: inst.def.use.lofiFilter || 16000 });
    inst.runtime.music.onBeat = () => { inst.runtime.beat = 1; };
  }
  return inst.runtime.music;
}
const speaker = {
  world(inst) {
    const playing = inst.runtime.music?.playing;
    const a = [{ key: 'E', label: playing ? 'Pause' : 'Play music', run: () => speaker.toggle(inst) }];
    a.push({ key: 'R', label: `Station: ${STATIONS[inst.st.station || inst.def.use.station || 'lofi'].name}`, run: () => speaker.next(inst) });
    return a;
  },
  held(inst) { return [{ key: 'LMB', label: inst.runtime.music?.playing ? 'Pause' : 'Play', run: () => speaker.toggle(inst) }, { key: 'R', label: 'Next station', run: () => speaker.next(inst) }]; },
  toggle(inst) {
    const m = musicFor(inst);
    if (m.playing) { m.stop(); inst.st.playing = false; } else { G.phone?.stopMusic?.(); m.start(); inst.st.playing = true; G.events.emit('act', 'music', { station: m.station }); G.ui.toast(`🎵 ${m.info.name}`, { duration: 2 }); }
    G.audio.play('click', { pos: worldPos(inst) });
  },
  next(inst) {
    const cur = inst.st.station || inst.def.use.station || 'lofi';
    const allowed = inst.def.use.stations || STATION_IDS;
    inst.st.station = allowed[(allowed.indexOf(cur) + 1) % allowed.length];
    const m = musicFor(inst);
    m.setStation(inst.st.station);
    if (!m.playing) { m.start(); inst.st.playing = true; }
    G.ui.toast(`🎵 ${STATIONS[inst.st.station].name}`, { duration: 1.6 });
  },
  onEnterWorld(inst) { if (inst.st.playing && G.started) { const m = musicFor(inst); m.setPos(worldPos(inst, [0, 0.15, 0])); if (!m.playing) m.start(); } },
  onLeaveWorld(inst) { inst.runtime.music?.stop(); },
  dispose(inst) { inst.runtime.music?.stop(); },
  update(inst, dt) {
    const m = inst.runtime.music;
    if (!m?.playing) return;
    m.setPos(worldPos(inst, [0, 0.15, 0]));
    // pulse the cone / LEDs to the beat
    inst.runtime.beat = Math.max(0, (inst.runtime.beat || 0) - dt * 3);
    const cone = inst.model.getObjectByName('cone');
    if (cone) cone.scale.setScalar(1 + inst.runtime.beat * 0.06);
    inst.runtime.funT = (inst.runtime.funT || 0) + dt;
    if (inst.runtime.funT > 4) { inst.runtime.funT = 0; G.needs.add({ fun: 0.5, comfort: 0.3 }, { silent: true }); }
  },
};

const turntable = {
  world(inst) {
    const held = G.hand.held;
    const a = [];
    if (held?.def.use?.type === 'vinyl') a.push({ key: 'E', label: `Put on "${held.def.name}"`, run: () => turntable.load(inst, held) });
    else if (inst.st.vinyl) a.push({ key: 'E', label: inst.runtime.music?.playing ? 'Lift the needle' : 'Drop the needle', run: () => turntable.toggle(inst) });
    else a.push({ key: 'E', label: 'Needs a record (hold a vinyl)', run: () => G.ui.toast('Hold a vinyl record and press E to put it on.', { icon: '💿' }) });
    if (inst.st.vinyl && !held) a.push({ key: 'R', label: 'Take record off', run: () => turntable.unload(inst) });
    return a;
  },
  init(inst) { turntable.showRecord(inst); },
  showRecord(inst) {
    const disc = inst.model.getObjectByName('disc');
    if (disc) { disc.visible = !!inst.st.vinyl; const lab = disc.getObjectByName('discLabel'); if (lab && inst.st.vinyl) { lab.material = lab.material.clone(); lab.material.color.set(getDef(inst.st.vinyl)?.use?.color || '#e04a3a'); } }
  },
  load(inst, vinyl) {
    if (inst.st.vinyl) G.items.spawn(inst.st.vinyl, { loc: 'storage' });
    inst.st.vinyl = vinyl.def.id;
    inst.st.station = vinyl.def.use.station;
    G.hand.release(true);
    G.items.destroy(vinyl);
    G.audio.play('vinyl', { pos: worldPos(inst) });
    turntable.showRecord(inst);
    inst.runtime.music?.stop(); inst.runtime.music = null;
    setTimeout(() => turntable.toggle(inst), 600);
  },
  unload(inst) {
    inst.runtime.music?.stop(); inst.runtime.music = null;
    const v = G.items.spawn(inst.st.vinyl, { loc: 'storage' });
    inst.st.vinyl = null; inst.st.playing = false;
    turntable.showRecord(inst);
    if (v) G.items.pickUp(v);
  },
  toggle(inst) {
    const m = musicFor(inst);
    if (m.playing) { m.stop(); inst.st.playing = false; G.audio.play('vinyl', { pos: worldPos(inst) }); }
    else { G.phone?.stopMusic?.(); m.start(); inst.st.playing = true; G.events.emit('act', 'music', { station: m.station, vinyl: true }); G.needs.addBuff('groovy', 120); }
  },
  onEnterWorld: speaker.onEnterWorld,
  onLeaveWorld: speaker.onLeaveWorld,
  dispose: speaker.dispose,
  update(inst, dt) {
    const playing = inst.runtime.music?.playing;
    const platter = inst.model.getObjectByName('platter');
    inst.runtime.spin = THREE.MathUtils.damp(inst.runtime.spin || 0, playing ? 3.5 : 0, 2, dt);
    if (platter) platter.rotation.y -= inst.runtime.spin * dt;
    const arm = inst.model.getObjectByName('arm');
    if (arm) arm.rotation.y = THREE.MathUtils.damp(arm.rotation.y, playing ? 0.45 : 0, 4, dt);
    if (playing) speaker.update(inst, dt);
  },
};

const vinyl = {
  held(inst) { return [{ key: 'LMB', label: 'Admire the sleeve', run: async () => { await G.hand.play('raise'); G.ui.toast(`"${inst.def.name}" — ${STATIONS[inst.def.use.station]?.desc || ''}`, { icon: '💿' }); } }]; },
};

// ---------------------------------------------------------------- smart speaker
const JOKES = ['Why did the scarecrow win an award? He was outstanding in his field.', 'I told my wifi we needed to talk. Now it won\'t stop buffering.', 'Parallel lines have so much in common. It\'s a shame they\'ll never meet.', 'I\'m reading a book about anti-gravity. It\'s impossible to put down.', 'Why don\'t skeletons fight? They don\'t have the guts.', 'What do you call a fake noodle? An impasta.'];
const FACTS = ['Octopuses have three hearts.', 'Honey never spoils.', 'A day on Venus is longer than its year.', 'Bananas are berries, but strawberries aren\'t.', 'There are more trees on Earth than stars in the Milky Way.', 'Sloths can hold their breath longer than dolphins.'];
const smartspeaker = {
  world(inst) {
    return [
      { key: 'E', label: '"Hey Homie…"', run: () => smartspeaker.ask(inst) },
      { key: 'R', label: inst.runtime.music?.playing ? 'Stop music' : 'Play music', run: () => speaker.toggle(inst) },
    ];
  },
  ask(inst) {
    const ring = inst.model.getObjectByName('ring');
    if (ring) { ring.material = ring.material.clone(); ring.material.emissiveIntensity = 3; setTimeout(() => (ring.material.emissiveIntensity = 0.3), 2500); }
    G.audio.play('chime', { pos: worldPos(inst) });
    const w = G.weather.info;
    const lines = [
      `It's ${G.clock.fmt()} on ${G.clock.dayName}.`,
      `Right now it's ${w.label.toLowerCase()}. Perfect weather to stay in.`,
      pick(JOKES), pick(FACTS),
      `You have ${G.orders?.active().length || 0} deliveries on the way.`,
      `Your balance is $${G.state.money.toFixed(2)}.`,
    ];
    G.ui.toast(`🔵 ${pick(lines)}`, { duration: 5 });
    G.needs.add({ fun: 2 });
    G.events.emit('act', 'smartspeaker');
  },
  onEnterWorld: speaker.onEnterWorld, onLeaveWorld: speaker.onLeaveWorld, dispose: speaker.dispose, update: speaker.update,
};

// ---------------------------------------------------------------- telescope / binoculars
const SIGHTINGS = ['A cat napping on a rooftop garden 🐈', 'Someone doing yoga on a balcony 🧘', 'A window washer waving at you 👋', 'Pigeons arguing over a bagel 🐦', 'A tiny rooftop wedding 💍', 'A delivery drone zipping by 🛸', 'Someone else looking through a telescope… at you 👀', 'A kid flying a kite between towers 🪁', 'Fireworks practice over the river 🎆', 'A dog wearing sunglasses 🕶️', 'A rooftop movie night 🎬', 'A hot air balloon far away 🎈'];
const telescope = {
  world(inst) { return [{ key: 'E', label: 'Look through', run: () => telescope.look(inst) }]; },
  held(inst) { return [{ key: 'LMB', label: 'Look through', run: () => telescope.look(inst, true) }]; },
  look(inst, handheld = false) {
    const p = handheld ? G.player.pos.clone() : worldPos(inst, [0, 0, -0.4]).setY(0);
    const release = G.player.occupy({ pos: p, yaw: handheld ? G.player.yaw : itemYaw(inst) + Math.PI, pitch: 0.02, eye: handheld ? 1.6 : 1.35, fov: inst.def.use.fov || 14, label: 'Stargazing', yawLimit: 1.2, exitPos: handheld ? G.player.pos.clone() : worldPos(inst, [0, 0, -0.9]).setY(0) });
    G.player.occ.seat = 'scope';
    G.ui.scopeOverlay(true);
    G.hand.hidden = true;
    let found = 0;
    const iv = setInterval(() => {
      if (!G.player.occ || G.player.occ.label !== 'Stargazing') { clearInterval(iv); return; }
      if (Math.random() < 0.5) { found++; G.ui.toast(`You spot: ${pick(SIGHTINGS)}`, { icon: '🔭', duration: 4 }); G.needs.add({ fun: 4 }); G.events.emit('act', 'sighting'); }
    }, 4500);
    const end = () => { clearInterval(iv); G.ui.scopeOverlay(false); G.hand.hidden = false; };
    const occ = G.player.occ; occ.onRelease = end;
    void release; void found;
  },
};

// ---------------------------------------------------------------- camera
const camera = {
  held(inst) { return [{ key: 'LMB', label: 'Take a photo', run: () => camera.snap(inst) }]; },
  snap(inst) {
    G.audio.play('shutter');
    G.ui.flash();
    G.hand.hidden = true;
    setTimeout(() => { G.phone.capturePhoto(inst.def.use.filter); G.hand.hidden = false; }, 60);
    G.events.emit('act', 'photo');
  },
};

// ---------------------------------------------------------------- headphones & VR
const headphones = {
  held(inst) { return [{ key: 'LMB', label: G.phone?.music?.playing ? 'Stop listening' : 'Listen to music', run: () => { G.phone.toggleMusic(); if (G.phone.music?.playing) G.needs.addBuff('inTheZone', 120); } }]; },
};
const vr = {
  held(inst) { return [{ key: 'LMB', label: 'Put on headset', run: () => { G.audio.play('powerup'); G.games.launch(inst.def.use.game || 'rhythm_pop', { source: inst, vr: true }); } }]; },
};

// ---------------------------------------------------------------- tablets & e-readers handled in hobby (books)

export const tech = { tv, console: console_, handheld, game, arcade, computer, speaker, radio: speaker, turntable, vinyl, smartspeaker, telescope, camera, headphones, vr };
void findOwned; void rand; void allLayers;
