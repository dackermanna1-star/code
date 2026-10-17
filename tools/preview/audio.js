// Audio preview: a button per sound id for human listening, mixer controls, a positional pad
// (click to place the source around the listener), occlusion, reverb spaces and scene tools.
// Open http://localhost:8080/tools/preview/audio.html (QA contact sheets: ?qa).
import { audio } from '../../src/audio/audio.js';
import { SFX } from '../../src/audio/sfx.js';

const root = document.getElementById('root');
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const k of kids) e.append(k);
  return e;
};

const SFX_GROUPS = {
  'Interface': ['ui_move', 'ui_confirm', 'ui_cancel', 'ui_open', 'ui_close', 'page_turn', 'item_get', 'objective'],
  'Doors & locks': ['door_open_wood', 'door_close_wood', 'door_open_metal', 'door_close_metal', 'door_locked', 'door_creak_slow', 'door_slam', 'key_unlock', 'chain_rattle', 'padlock', 'bolt_cutters', 'gate_rattle'],
  'Lockers': ['locker_open', 'locker_close', 'locker_tap'],
  'Devices': ['flashlight_click', 'battery_swap', 'flashlight_flicker', 'flashlight_roll', 'camcorder_click', 'camcorder_whir', 'vhs_noise', 'tape_play', 'typewriter_key', 'trs80_key', 'trs80_beep'],
  'PA, bells & lights': ['intercom_crackle', 'intercom_chime', 'school_bell', 'bell_short', 'fluor_on', 'fluor_off'],
  'The Colonel': ['colonel_breath', 'colonel_breath_fast', 'colonel_drag', 'colonel_hm', 'colonel_jingle', 'colonel_lunge', 'colonel_grab', 'colonel_sink', 'footstep_heavy_above'],
  'Safety Patrol': ['whistle', 'whistle_breath', 'squeak'],
  'Adair & husks': ['glass_tone', 'glass_write', 'husk_rustle', 'cicada_click'],
  'Classroom & office': ['chalk', 'chair_scrape', 'desk_creak', 'paper_rustle', 'safe_click', 'safe_open', 'stamp', 'pen_scratch', 'book_close'],
  'Machines & stage': ['lever_pull', 'trapdoor', 'mixer_start', 'dumbwaiter', 'boiler_door'],
  'Water & basement': ['drip', 'splash', 'pipe_knock', 'steam_hiss', 'coal_slide'],
  'Weather': ['lightning', 'thunder', 'wind_gust'],
  'Body': ['heartbeat', 'breath_hold', 'breath_release'],
  'Old media & crowds': ['crowd_murmur', 'applause_old', 'record_crackle'],
  'Stingers & structure': ['stinger_soft', 'stinger_hard', 'collapse_rumble', 'dust_fall'],
};

const state = { positional: false, src: { x: 120, y: 0 }, occlusion: 0, rate: 1, chars: ['tess', 'danny', 'leah', 'marcus', 'denise', 'voice'] };
const LISTENER = { x: 1000, y: 1000 };
const loops = new Map();
let ambBtn = null, musBtn = null;

function opts() {
  const o = { rate: state.rate };
  if (state.positional) { o.x = LISTENER.x + state.src.x; o.y = LISTENER.y + state.src.y; }
  return o;
}
async function ensure() { audio.init(); await audio.unlock(); audio.setListener(LISTENER.x, LISTENER.y); status(); }
const btn = (label, fn, cls = '') => el('button', { class: cls, onclick: async (e) => { await ensure(); fn(e.currentTarget); } }, label);
const section = (title, ...kids) => [el('h2', {}, title), ...kids];

// ---- header & mixer -----------------------------------------------------------------------------
const stat = el('span', { class: 'sub' }, 'audio: not started');
const meter = el('div', { id: 'meter' }, el('div'));
function status() {
  const c = audio.context;
  stat.textContent = c ? `audio: ${c.state} · ${c.sampleRate} Hz · space ${audio.engine?.mix.space}` : 'audio: unavailable';
}
const vols = { master: 0.8, music: 0.7, sfx: 0.9, ambience: 0.8 };
function slider(name, min, max, step, value, onInput) {
  const s = el('input', { type: 'range', min, max, step, value });
  const v = el('span', {}, String(value));
  s.addEventListener('input', () => { v.textContent = s.value; onInput(Number(s.value)); });
  return el('label', {}, name, s, v);
}
const bar = el('div', { class: 'bar' },
  btn('▶ Start audio', () => {}, 'big'),
  btn('■ Stop all (Esc)', () => stopAll()),
  ...Object.keys(vols).map((k) => slider(k, 0, 1, 0.05, vols[k], (x) => { vols[k] = x; audio.setVolumes(vols); })),
  slider('rate', 0.25, 2, 0.01, 1, (x) => { state.rate = x; }),
  el('label', {}, 'out', meter),
  stat,
);

function stopAll() {
  audio.stopAll(0.3);
  for (const h of loops.values()) h.stop(0.3);
  loops.clear();
  document.querySelectorAll('button.on').forEach((b) => b.classList.remove('on'));
}
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') stopAll(); });

// ---- positional pad -------------------------------------------------------------------------------
const pad = el('canvas', { id: 'pad', width: 320, height: 200 });
function drawPad() {
  const g = pad.getContext('2d'), W = pad.width, H = pad.height, s = W / 1100; // world px → pad px
  g.fillStyle = '#101018'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#262633';
  for (const r of [24, 192, 480]) { g.beginPath(); g.arc(W / 2, H / 2, r * s, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = '#7d778a'; g.font = '10px monospace'; g.fillText('192 px (−6 dB)', W / 2 + 192 * s * 0.7, H / 2 - 192 * s * 0.7); g.fillText('480 px (silent)', 6, 12);
  g.fillStyle = '#8fb0c9'; g.fillRect(W / 2 - 3, H / 2 - 3, 6, 6);
  if (state.positional) {
    g.fillStyle = '#d9a441';
    g.beginPath(); g.arc(W / 2 + state.src.x * s, H / 2 + state.src.y * s, 5, 0, Math.PI * 2); g.fill();
    const p = audio.engine?.placeFor(LISTENER.x + state.src.x, LISTENER.y + state.src.y);
    if (p) { g.fillStyle = '#c4bdb0'; g.fillText(`gain ${(20 * Math.log10(p.gain + 1e-6)).toFixed(1)} dB  pan ${p.pan.toFixed(2)}  lp ${Math.round(p.lp)} Hz`, 6, H - 8); }
  }
}
pad.addEventListener('click', (e) => {
  const r = pad.getBoundingClientRect(), s = pad.width / 1100;
  state.src = { x: Math.round((e.clientX - r.left - pad.width / 2) / s), y: Math.round((e.clientY - r.top - pad.height / 2) / s) };
  state.positional = true; posBox.checked = true; drawPad();
});
const posBox = el('input', { type: 'checkbox' });
posBox.addEventListener('change', () => { state.positional = posBox.checked; drawPad(); });
const occ = slider('occlusion', 0, 1, 0.05, 0, (x) => { state.occlusion = x; });
audio.occluder = () => state.occlusion;

const spaceRow = el('div', { class: 'grid' }, ...audio.ids.spaces.concat(['none']).map((k) => btn(k, (b) => { audio.setSpace(k, 0.5); b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); status(); })));
let silenced = false;
const sceneRow = el('div', { class: 'grid' },
  btn('silence on/off', (b) => { silenced = !silenced; audio.silence(silenced, 0.4); b.classList.toggle('on', silenced); }),
  ...[1, 0.5, 0.125].map((v) => btn(`duck ${v}`, () => audio.duck(v, 0.5))),
  ...[0, 1, 2, 3, 4].map((n) => btn(`strip ${n}`, () => audio.stripAmbience(n))),
);

// ---- sound buttons -----------------------------------------------------------------------------------
const listed = new Set(Object.values(SFX_GROUPS).flat());
const extra = audio.ids.sfx.filter((id) => !listed.has(id));
if (extra.length) SFX_GROUPS['Other'] = extra;
const sfxSections = Object.entries(SFX_GROUPS).flatMap(([g, ids]) => section(g, el('div', { class: 'grid' }, ...ids.map((id) => btn(id, () => audio.sfx(id, opts()))))));

const stepRow = el('div', { class: 'grid' }, ...audio.ids.surfaces.flatMap((s) => [false, true].map((run) => btn(`${s}${run ? ' run' : ''}`, () => {
  const step = run ? 0.24 : 0.36;
  for (let i = 0; i < 6; i++) setTimeout(() => audio.footstep(s, { run, id: 'preview', ...opts() }), i * step * 1000);
}))));
stepRow.append(btn('colonel', () => { for (let i = 0; i < 4; i++) setTimeout(() => audio.footstep('wood', { id: 'colonel', ...opts() }), i * 700); }));

const voiceRow = el('div', { class: 'grid' },
  ...state.chars.map((c) => btn(`blip ${c}`, () => { for (let i = 0; i < 18; i++) setTimeout(() => audio.blip(c), i * 70 + (i % 6 === 5 ? 140 : 0)); })),
  btn('murmur 3 s (Colonel)', () => audio.murmur(3)),
);

const ambRow = el('div', { class: 'grid' }, ...audio.ids.ambience.filter((id) => id !== 'period_buzz').map((id) => btn(id, (b) => {
  const on = ambBtn !== b;
  audio.ambience(on ? id : null, 2);
  ambBtn?.classList.remove('on'); ambBtn = on ? b : null; b.classList.toggle('on', on); setTimeout(status, 50);
})));
const layerRow = el('div', { class: 'grid' }, btn('period_buzz layer', (b) => { const on = !b.classList.contains('on'); audio.layer('period_buzz', on, 1); b.classList.toggle('on', on); }));
const musRow = el('div', { class: 'grid' }, ...audio.ids.music.map((id) => btn(id, (b) => {
  const on = musBtn !== b;
  audio.music(on ? id : null, 2);
  musBtn?.classList.remove('on'); musBtn = on ? b : null; b.classList.toggle('on', on);
})));
const loopRow = el('div', { class: 'grid' }, ...audio.ids.loops.map((id) => btn(id, (b) => {
  if (loops.has(id)) { loops.get(id).stop(0.5); loops.delete(id); b.classList.remove('on'); return; }
  loops.set(id, audio.loop(id, opts())); b.classList.add('on');
})));
const eventRow = el('div', { class: 'grid' }, ...audio.ids.events.map((id) => btn(id, () => audio.sfx(id, opts()))));

root.append(
  el('h1', {}, 'HALLOWELL — audio'),
  el('div', { class: 'sub' }, 'Procedural WebAudio only. Click a sound to hear it; Esc stops everything. Positional: click the pad to place the source around the listener (blue).'),
  bar,
  el('div', { class: 'row' },
    el('div', {}, ...section('Positional', el('label', {}, posBox, ' positional sfx / loops'), pad, occ)),
    el('div', {}, ...section('Reverb space', spaceRow), ...section('Scene', sceneRow),
      el('p', { class: 'note' }, 'Ambience picks a space automatically; a space button overrides it until the next ambience change. Strip n mutes bed strata (wind → creaks → drips → rain → events) like the long hall.'))),
  ...section('Ambience beds (one at a time, 2 s crossfade)', ambRow), ...section('Layers', layerRow),
  ...section('Music (one at a time, 2 s crossfade)', musRow),
  ...sfxSections,
  ...section('Footsteps (6 steps; alternating feet)', stepRow),
  ...section('Voices', voiceRow),
  ...section('Loops (toggle)', loopRow),
  ...section('Ambience events', eventRow),
);
drawPad();
audio.init();
audio.setVolumes(vols);
status();
setInterval(() => { meter.firstChild.style.width = `${Math.round(audio.level() * 100)}%`; if (audio.context?.state === 'running') status(); }, 80);
window.__ready = true;
window.__audio = audio;
window.__sfx = SFX;
