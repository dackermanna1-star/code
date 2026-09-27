// Standalone audition page for the procedural audio engine.
import { AudioEngine, SOUND_NAMES, LOOP_NAMES, MUSIC_STATES, STINGER_NAMES, AMBIENCES, REVERB_NAMES } from './audioEngine.js';

const GROUPS = {
  Weapons: ['pistol', 'magnum', 'smg', 'silenced', 'shotgun', 'autoshotgun', 'rifle', 'rifle2', 'sniper', 'm60', 'launcher', 'minigun', 'minigunSpin'],
  'Weapon handling': ['dryFire', 'magOut', 'magIn', 'slideRack', 'boltCycle', 'pump', 'shellInsert', 'reloadStart', 'casing', 'shellDrop'],
  Melee: ['swing', 'meleeHit', 'meleeHitBlunt', 'meleeWall', 'meleeWallSharp', 'shove', 'shoveHit'],
  Impacts: ['impactConcrete', 'impactTile', 'impactWood', 'impactSoft', 'impactMetal', 'impactGlass', 'impactWater', 'bulletFlesh', 'headshot', 'dismember', 'gibSplat', 'bodyFall'],
  Explosives: ['explosion', 'molotov', 'glass', 'beep', 'throw', 'bounce', 'fireLoop', 'propaneExplode', 'gasCanIgnite', 'oxygenHiss'],
  'Common infected': ['zIdle', 'zAlert', 'zChase', 'zHit', 'zShoved', 'zBurn', 'zDeath', 'hordeScream', 'hordeRumble'],
  Hunter: ['hunterGrowl', 'hunterScream', 'hunterPounce', 'hunterShred'],
  Smoker: ['smokerCough', 'smokerTongue', 'smokerChoke', 'smokerDeath'],
  Boomer: ['boomerGurgle', 'boomerVomit', 'boomerExplode', 'boomerBile'],
  Tank: ['tankRoar', 'tankStep', 'tankPunch', 'tankRock', 'tankRockHit', 'tankDeath'],
  Witch: ['witchCry', 'witchGrowl', 'witchScream', 'witchSlash'],
  Survivors: ['stepConcrete', 'stepWood', 'stepMetal', 'stepTile', 'stepWater', 'stepCarpet', 'stepDirt', 'jump', 'land', 'hurtMale', 'hurtFemale', 'heal', 'pills', 'pickup', 'ammoPickup', 'weaponPickup', 'flashlight'],
  World: ['doorOpen', 'doorClose', 'doorBang', 'doorBreak', 'safeDoorOpen', 'safeDoorClose', 'glassBreak', 'woodBreak', 'metalImpact', 'carAlarm', 'alarm', 'generator', 'elevatorMotor', 'elevatorDing', 'liftMotor', 'helicopter', 'radioStatic', 'radioBeep', 'buttonPress', 'metalGate', 'drip'],
  UI: ['uiClick', 'uiHover', 'objective', 'chapterComplete'],
};
// anything not listed above still gets a button
const listed = new Set(Object.values(GROUPS).flat());
const extra = SOUND_NAMES.filter((n) => !listed.has(n));
if (extra.length) GROUPS.Other = extra;

const audio = new AudioEngine({ master: 0.8, music: 0.6, sfx: 0.9, voice: 0.9 });
window.audio = audio;
window.AudioEngine = AudioEngine;

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, parent) => { const e = Object.assign(document.createElement(tag), props); if (parent) parent.appendChild(e); return e; };

const listener = { x: 0, y: 1.6, z: 0 };
const fwd = { x: 0, y: 0, z: -1 }, up = { x: 0, y: 1, z: 0 };
const OFFS = { front: [0, 0, -5], left: [-6, 0, 0], right: [6, 0, 0], behind: [0, 0, 8], mid: [0, 0, -25], far: [0, 0, -60], vfar: [0, 0, -110] };
function playOpts() {
  const v = $('#pos').value;
  if (v === 'local') return { owner: { isHuman: true } };
  const o = OFFS[v];
  return { pos: { x: listener.x + o[0], y: listener.y + o[1], z: listener.z + o[2] } };
}

// --- start
let started = false;
async function start() {
  if (started) { audio.resume(); return; }
  started = true;
  $('#start').textContent = 'Loading...';
  audio.onProgress = (f) => { $('#bar > div').style.width = (f * 100).toFixed(0) + '%'; };
  await audio.init();
  audio.resume();
  audio.setListener(listener, fwd, up);
  $('#start').textContent = 'Resume';
  meter();
}
$('#start').onclick = start;

setInterval(() => {
  const s = audio.stats();
  $('#status').textContent = `${s.state} | init ${s.initMs} ms | loaded ${(s.loaded * 100).toFixed(0)}% | voices ${s.voices} | loops ${s.loops} | music ${s.music} | reverb ${s.reverb} | amb ${s.ambience || '-'}`;
}, 250);

// --- volumes
for (const k of ['master', 'music', 'sfx', 'voice']) {
  const l = el('label', { textContent: k }, $('#volumes'));
  const r = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: audio.settings[k] }, l);
  r.oninput = () => audio.setVolumes({ [k]: +r.value });
}
// --- reverb
const radio = (container, items, onPick, initial) => {
  const btns = [];
  for (const it of items) {
    const b = el('button', { textContent: it === null ? 'none' : it }, container);
    btns.push(b);
    if (it === initial) b.classList.add('on');
    b.onclick = () => { start(); btns.forEach((x) => x.classList.remove('on')); b.classList.add('on'); onPick(it); };
  }
};
radio($('#reverbs'), REVERB_NAMES, (r) => audio.setReverb(r), 'outdoor');
radio($('#ambiences'), [null, ...AMBIENCES], (a) => audio.setAmbience(a), null);
radio($('#states'), MUSIC_STATES, (s) => audio.music.setState(s), 'none');
$('#intensity').oninput = (e) => { audio.music.setIntensity(+e.target.value); $('#ival').textContent = (+e.target.value).toFixed(2); };
for (const s of STINGER_NAMES) el('button', { textContent: s, onclick: () => { start(); audio.music.stinger(s); } }, $('#stingers'));
$('#heart').oninput = (e) => audio.heartbeat(+e.target.value);
$('#stopall').onclick = () => { audio.stopAll(); document.querySelectorAll('button.loop.on').forEach((b) => b.classList.remove('on')); loops.clear(); };

// --- sound buttons
const loops = new Map();
for (const [g, names] of Object.entries(GROUPS)) {
  const sec = el('section', {}, $('#groups'));
  el('h2', { textContent: g }, sec);
  const row = el('div', { className: 'row' }, sec);
  for (const n of names) {
    const isLoop = LOOP_NAMES.includes(n);
    const b = el('button', { textContent: n, className: isLoop ? 'loop' : '' }, row);
    b.title = isLoop ? 'click: toggle loop, shift+click: one-shot' : 'play';
    b.onclick = async (ev) => {
      await start();
      if (isLoop && !ev.shiftKey) {
        if (loops.has(n)) { loops.get(n).stop(0.5); loops.delete(n); b.classList.remove('on'); }
        else { loops.set(n, audio.loop(n, Object.assign({ vol: 1 }, playOpts()))); b.classList.add('on'); }
      } else audio.play(n, playOpts());
    };
  }
}

// --- firefight test: several guns + infected + impacts around the listener
$('#barrage').onclick = async () => {
  await start();
  const guns = ['rifle', 'smg', 'shotgun', 'pistol'];
  let t = 0;
  for (let k = 0; k < 40; k++) {
    const g = guns[k % 4];
    setTimeout(() => {
      audio.play(g, { pos: { x: (k % 4 - 1.5) * 4, y: 1.6, z: -3 }, gun: true });
      audio.play('impactConcrete', { pos: { x: Math.random() * 20 - 10, y: 0, z: -15 }, vol: 0.5 });
      if (k % 3 === 0) audio.play(['zAlert', 'zChase', 'zDeath', 'bulletFlesh'][k % 4], { pos: { x: Math.random() * 16 - 8, y: 1, z: -10 } });
    }, t);
    t += 90 + Math.random() * 60;
  }
};

// --- report
$('#report').onclick = () => {
  const rep = audio._bufferReport();
  const rows = Object.entries(rep).map(([n, arr]) => {
    const pk = Math.max(0, ...arr.map((a) => a.peak));
    const rms = arr.length ? arr.reduce((s, a) => s + a.rms, 0) / arr.length : 0;
    const dur = arr.length ? arr.reduce((s, a) => s + a.dur, 0) / arr.length : 0;
    return `<tr><td>${n}</td><td>${arr.length}</td><td class="${pk >= 1 || pk < 0.01 ? 'warn' : ''}">${pk.toFixed(3)}</td><td>${(20 * Math.log10(rms + 1e-9)).toFixed(1)} dB</td><td>${dur.toFixed(2)} s</td></tr>`;
  });
  $('#table').innerHTML = `<table><tr><th>name</th><th>variants</th><th>peak</th><th>rms</th><th>avg dur</th></tr>${rows.join('')}</table>`;
};

// --- output meter (tap after the master soft-clipper)
function meter() {
  if (!audio.ctx || !audio.clip) return;
  const an = audio.ctx.createAnalyser();
  an.fftSize = 1024;
  audio.clip.connect(an);
  const d = new Float32Array(an.fftSize);
  let hold = 0;
  const loop = () => {
    an.getFloatTimeDomainData(d);
    let p = 0;
    for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i]));
    hold = Math.max(p, hold * 0.93);
    const bar = $('#meter > div');
    bar.style.width = Math.min(100, hold * 100) + '%';
    bar.style.background = hold > 0.97 ? '#e74c3c' : hold > 0.8 ? '#e0a040' : '#6fbf73';
    audio.update(1 / 60);
    requestAnimationFrame(loop);
  };
  loop();
}
