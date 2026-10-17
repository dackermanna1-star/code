// UI preview harness: boots a fake HW around the real UI, renders every screen/variant on demand.
//   tools/preview/ui.html#<scenario>      (interactive; keys work)
//   window.show(name) → Promise           (resets the UI and sets up a scenario deterministically)
//   window.scenarios                      (list of names)
//   ?art=fake                             (silhouette portraits instead of the real art facade)
import { HW } from '../../src/engine/hw.js';
import { ui } from '../../src/ui/ui.js';
import { CHARS } from '../../src/data/chars.js';
import { ITEMS } from '../../src/data/items.js';
import { DOCS } from '../../src/data/docs.js';
import { SAMPLE_DOCS, FAKE_MAPS, fakeState, fakePortrait, fakeWorld } from './ui_fake.js';

const params = new URLSearchParams(location.search);
const screen = document.getElementById('screen');
const sctx = screen.getContext('2d');
sctx.imageSmoothingEnabled = false;
const uiCanvas = document.createElement('canvas'); uiCanvas.width = 960; uiCanvas.height = 540;
const uiCtx = uiCanvas.getContext('2d');
let world = null;
let showWorld = true;

// ---- fake HW -------------------------------------------------------------------------------------
const sfxLog = [];
const audio = {
  ready: true, init() {}, unlock() { audio.unlocked = true; }, update() {},
  sfx(id) { sfxLog.push(id); return { stop() {} }; }, loop() { return { stop() {}, setPos() {}, setVol() {} }; },
  ambience() {}, music() {}, silence() {}, duck() {}, footstep() {},
  blip(who) { sfxLog.push('blip:' + who); }, murmur(sec) { sfxLog.push('murmur:' + sec.toFixed(1)); },
  setListener() {}, setVolumes(v) { audio.volumes = v; }, level() { return 0.3 + 0.3 * Math.sin(performance.now() / 90); },
};
const saves = {};
function installHW() {
  HW.state = fakeState();
  HW.data = { chars: CHARS, items: ITEMS, docs: { ...DOCS, ...SAMPLE_DOCS }, maps: FAKE_MAPS };
  HW.audio = audio;
  HW.time = 0;
  HW.camera = { x: 0, y: 0 };
  HW.player = { x: 240, y: 200 };
  HW.map = { id: 'west1', roomAt: () => FAKE_MAPS.west1.rooms.find((r) => r.id === 'w1_room103') };
  HW.compact = { hasPastHere: false };
  HW.periods = { active: false, timeLeft: 0, length: 80 };
  HW.renderer = { portraitLight: () => 'normal' };
  HW.debug = { autoAdvance: false };
  HW.game = {
    mode: 'play',
    canSave: () => true,
    saveTo: async (slot) => { saves[slot] = true; localStorage.setItem(`hallowell.save.${slot}`, JSON.stringify({ summary: { chapter: HW.state.chapter, mapName: 'West Hall — First Floor', playtime: HW.state.playtime, date: new Date().toISOString() } })); },
    loadSave: async (slot) => { console.log('[harness] loadSave', slot); },
    useItem: (id) => { console.log('[harness] useItem', id); ui.toast(`Used: ${ITEMS[id]?.name}`); },
    quitToTitle: () => console.log('[harness] quitToTitle'),
  };
  HW.scripts = { run: async (id) => { console.log('[harness] script', id); await ui.say('tess', 'neutral', `(script ${id})`); } };
  HW.ui = ui;
}

async function installArt() {
  const fake = params.get('art') === 'fake';
  let art = null;
  if (!fake) {
    try {
      const mod = await import('../../src/art/index.js');
      art = mod.art;
      await art.init();
    } catch (e) { console.warn('[harness] real art failed, using fake:', e.message); art = null; }
  }
  HW.art = art ? { ...art } : {
    portrait: fakePortrait, icon: () => null, glyph: () => null, prop: () => null,
    cg: (id) => ({ draw(ctx, t) { ctx.fillStyle = '#101218'; ctx.fillRect(0, 0, 480, 270); ctx.fillStyle = '#2a2d3a'; ctx.fillRect(0, 180, 480, 90); ctx.fillStyle = '#556'; ctx.fillRect(200 + Math.sin(t) * 20, 80, 80, 100); ctx.fillStyle = '#889'; ctx.font = '12px monospace'; ctx.fillText('CG ' + id, 8, 16); } }),
  };
  if (fake) HW.art.portrait = fakePortrait;
}

// ---- clock & input simulation ----------------------------------------------------------------------
let manual = false;
function frame() {
  sctx.fillStyle = '#000'; sctx.fillRect(0, 0, 960, 540);
  if (showWorld && world) sctx.drawImage(world, 0, 0, 960, 540);
  ui.render(uiCtx);
  sctx.drawImage(uiCanvas, 0, 0);
}
export function adv(sec) {
  const n = Math.max(1, Math.round(sec * 60));
  for (let i = 0; i < n; i++) { ui.update(1 / 60); HW.time += 1 / 60; }
  frame();
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const keyOf = (code) => (code.startsWith('Key') ? code.slice(3).toLowerCase() : code === 'Space' ? ' ' : code.startsWith('Digit') ? code.slice(5) : code);
export async function tap(code = 'KeyZ', hold = 1 / 60) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key: keyOf(code) }));
  adv(hold);
  window.dispatchEvent(new KeyboardEvent('keyup', { code, key: keyOf(code) }));
  adv(1 / 60);
  await flush();
}
async function typeText(s) {
  for (const ch of s) {
    const code = ch === ' ' ? 'Space' : /[a-z]/i.test(ch) ? 'Key' + ch.toUpperCase() : /\d/.test(ch) ? 'Digit' + ch : 'Period';
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: ch }));
    adv(1 / 60);
    window.dispatchEvent(new KeyboardEvent('keyup', { code, key: ch }));
  }
  adv(1 / 60);
}
/** Let pending promise callbacks run, advancing the clock a little each time. */
async function settle(sec = 0.2) { for (let i = 0; i < 6; i++) { await flush(); adv(sec / 6); } }

// ---- fake register model (DESIGN §8 rules, simplified) ----------------------------------------------
function registerModel() {
  const m = {
    title: 'REGISTER OF PUPILS — 1996',
    founder: { name: 'HALLOWELL, CYRUS — FOUNDER — FIRST PUPIL', status: 'enrolled' },
    lines: [
      { id: 'danny', name: 'KOVACH, DANIEL', ink: 'pencil', status: 'enrolled' },
      { id: 'leah', name: 'BRANDT, LEAH', ink: 'ink', status: 'enrolled' },
      { id: 'marcus', name: 'WEBB, MARCUS', ink: 'pencil', status: 'enrolled' },
      { id: 'tess', name: 'DOLAN, THERESA', ink: 'pencil', status: 'enrolled' },
    ],
    tools: [{ id: 'stamp', label: 'Withdrawn stamp', available: true }, { id: 'form', label: 'Transfer form', available: true }, { id: 'pen', label: 'Red pen', available: true }],
    async apply(tool, lineId) {
      const line = m.lines.find((l) => l.id === lineId);
      if (lineId === 'founder') {
        if (tool !== 'pen') return { ok: false, say: [['tess', 'confused', "That's not how you get rid of him."]] };
        if (m.lines.some((l) => l.status !== 'withdrawn')) return { ok: false, say: [['tess', 'determined', 'Clear the roll first. Adair said.']] };
        m.founder.status = 'expelled';
        return { ok: true, say: [['tess', 'determined', 'Expelled.']] };
      }
      if (!line || line.status === 'withdrawn') return { ok: false, say: [['tess', 'neutral', 'Already done.']] };
      if (tool === 'stamp' && line.ink === 'ink') return { ok: false, say: [['tess', 'worried', "It beads up like water on wax. Their name's in ink. Real ink."]] };
      if (tool === 'pen') return { ok: false, say: [['tess', 'confused', "Not on them. That's for him."]] };
      if (tool === 'form') m.tools[1].available = false;
      line.status = 'withdrawn';
      return { ok: true, say: [['tess', 'sad', tool === 'form' ? 'Mom\'s signature is already on it.' : 'Withdrawn.']] };
    },
    refresh() { return m; },
  };
  return m;
}

// ---- scenarios -----------------------------------------------------------------------------------------
const say = (...a) => { ui.say(...a); };
const LINES = {
  tess: ['tess', 'smirk', "Great. A haunted school. And I wore the *good* sneakers."],
  danny: ['danny', 'grin', 'Dolan. Dolan. Look at this guy. He ate the Civil War.'],
  leah: ['leah', 'deadpan', 'This is Leah Brandt for STATIC. It is nine forty-seven P.M., Friday, October eighteenth, 1996.'],
  marcus: ['marcus', 'urgent', 'Get in a room. Sit down. {p}Now.'],
};
const SCEN = {
  async say_tess() { say(...LINES.tess); adv(4); },
  async say_danny() { say(...LINES.tess); adv(3); await tap(); say(...LINES.danny); adv(4); },
  async say_leah() { say(...LINES.leah); adv(5); },
  async say_marcus() { say('tess', 'scared', "What— what was that?"); adv(2); await tap(); say(...LINES.marcus); adv(3); },
  async say_colonel() { say('colonel', 'serene', 'Thank you, {p}Theresa.{p=0.8} *Attendance* is mandatory.'); adv(1.8); },
  async say_colonel_done() { HW.state.flags.colonel_named = true; say('colonel', 'speaking', 'None shall be left behind.', {}); adv(6); },
  async say_voice() { say('voice', null, 'Good evening, students. You will proceed to your homerooms. Attendance will now be taken.'); adv(2.4); },
  async say_voice_mimic() { say('voice', null, 'Guys? ...{p}Theresa? {slow}In here.{/slow}', { name: 'Danny?' }); adv(6); },
  async say_adair() { say('adair', 'urgent', "{shake}DON'T ANSWER HIM.{/shake}", { side: 'right' }); adv(2); },
  async say_kevin() { say('kevin', null, '...{p}pass.'); adv(3); },
  async say_denise() { say('denise', 'lure', '*Marcus Webb.* You came. You look just like Daddy.', { enrolled: true }); adv(5); },
  async say_enrolled() { say('danny', 'entranced', 'It wrote my name, Dolan. In a big book. Under the school.', { enrolled: true, light: 'fluor' }); adv(5); },
  async think() { say(...LINES.danny); adv(3); await tap(); ui.think('worried', "Okay. Okay okay okay. Walk. {p}Don't run."); adv(4); },
  async narrate() { ui.narrate('Locked. The chain is new. The padlock is not.'); adv(3); },
  async markup() { say('tess', 'scared', "That's {red}not{/red} a rat. {dim}Rats don't sigh.{/dim} {shake}It's breathing.{/shake}"); adv(5); },
  async longtext() { say('leah', 'talk', "This is Leah Brandt for STATIC. It is nine forty-seven P.M., Friday, October eighteenth, 1996. With me are Daniel Kovach— Danny. —Daniel Kovach, Marcus Webb, and Theresa Dolan. We are standing outside Hallowell Consolidated School, which has been condemned since 1979, when nine students and a teacher disappeared during a Founder's Day assembly."); adv(9); },
  async closeup() { say('tess', 'eyes_shut', '...', { closeup: true }); adv(0.6); await tap(); say('tess', 'terrified', 'Don\'t move. Don\'t move. Don\'t—', { closeup: true }); adv(3); },
  async choice() {
    say('danny', 'sad', "Just go. I'm the guy who gets stuck. That's my whole thing."); adv(5); await tap();
    ui.choice(["I'm coming back for you, Kovach. I promise.", "...I'm sorry, Danny.", '(Leave without a word.)']); adv(0.5); await tap('ArrowDown'); adv(0.3);
  },
  async choice_prompt() {
    ui.choice([{ text: 'Here.' }, { text: '(Say nothing.)' }, { text: 'Hidden', cond: () => false }], { who: 'colonel', expr: 'looking', prompt: '{slow}Theresa Dolan?{/slow}' }); adv(5);
  },
  // documents
  ...Object.fromEntries(Object.keys(SAMPLE_DOCS).map((id) => [`doc_${id}`, async () => { ui.doc(id); adv(0.6); }])),
  async doc_walt_log_p2() { ui.doc('walt_log'); adv(0.4); await tap('ArrowRight'); adv(0.4); },
  // overlays & cg
  async overlay_locker() { ui.setOverlay('locker', { phase: 0.6, faceIn: 0.3 }); adv(1); },
  async overlay_vhs() { ui.setOverlay('vhs', { frame: 2 }); adv(1.2); },
  async overlay_vhs_blue() { ui.setOverlay('vhs', { frame: 9, blue: true }); adv(1); },
  async overlay_heads_down() { ui.setOverlay('heads_down', {}); adv(1); say('tess', 'eyes_shut', '{dim}Don\'t look up. Don\'t look up.{/dim}'); adv(3); },
  async overlay_compact() { ui.setOverlay('compact', { on: true }); adv(1); },
  async overlay_black() { ui.setOverlay('black', { alpha: 1 }); adv(0.5); ui.narrate('Kettle Run, Pennsylvania.'); adv(2); },
  async cg() { ui.cg('car_interior', { fade: 0 }); adv(0.5); say(...LINES.danny); adv(4); },
  async cg_colonel_hand() { ui.cg('colonel_hand', { fade: 0 }); adv(0.5); },
  // hud
  async hud() { HW.periods.active = true; HW.periods.timeLeft = 50; HW.compact.hasPastHere = true; HW.state.battery = 64; adv(1.5); ui.prompt({ id: 'desk', type: 'desk_student', x: 18, y: 11, def: { w: 1, h: 1 } }, 'Sit'); adv(0.5); },
  async hud_lowbatt() { HW.state.battery = 14; ui.prompt({ id: 'locker', type: 'locker', x: 12, y: 8, def: { w: 1, h: 1 } }, 'Hide'); adv(0.6); },
  async hud_seated() { HW.player.seated = { id: 'desk' }; adv(1); },
  async locker_hidden() { HW.player.hidden = 'locker'; ui.setOverlay('locker', { phase: 0.2, faceIn: 0 }); adv(2.5); },
  async confirm() { ui.open('pause'); adv(0.3); ui.open('confirm', { text: 'Quit to the title screen? Anything since your last save will be lost.', yes: 'Quit', no: 'Stay', danger: true }); adv(0.3); },
  async pause_nosave() { HW.game.canSave = () => false; ui.open('pause'); adv(0.3); for (let i = 0; i < 4; i++) await tap('ArrowDown'); adv(0.2); },
  async toasts() { ui.toast('Got: D Batteries'); adv(0.3); ui.toast("Got: Danny's Flashlight"); adv(0.3); ui.objective('Get into the main office. The intercom.'); adv(1); },
  // cards
  async card_chapter() { ui.card('II — First Period'); adv(3.2); },
  async card_text() { ui.card('Kettle Run, Pennsylvania.', 'October 18, 1996.'); adv(4); },
  async card_ending() { ui.card('WITHDRAWN', 'Theresa Dolan — transferred.'); adv(3.4); },
  // big screens
  async title() { showWorld = false; ui.title(); adv(2.5); },
  async title_menu() { showWorld = false; ui.title(); adv(1.5); await tap('Space'); adv(1.5); },
  async gameover() { ui.gameOver('caught'); adv(2.4); },
  async gameover_menu() { ui.gameOver('caught'); adv(5); },
  async pause() { ui.open('pause'); adv(0.5); },
  async inventory() { ui.open('inventory'); adv(0.3); await tap('ArrowRight'); await tap('ArrowRight'); adv(0.3); },
  async inventory_actions() { ui.open('inventory'); adv(0.3); await tap('ArrowRight'); await tap('ArrowRight'); await tap(); adv(0.3); },
  async sketchbook_map() { ui.open('sketchbook'); adv(0.6); },
  async sketchbook_zoom() { ui.open('sketchbook'); adv(0.4); await tap(); adv(0.4); },
  async sketchbook_map2f() { ui.open('sketchbook'); adv(0.4); await tap('ArrowDown'); adv(0.4); },
  async sketchbook_notes() { ui.open('sketchbook', { tab: 'notes' }); adv(0.6); },
  async sketchbook_objective() { ui.open('sketchbook', { tab: 'objective' }); adv(0.6); },
  async settings() { ui.open('settings'); adv(0.4); await tap('ArrowDown'); adv(0.2); },
  async saveload_save() { await HW.game.saveTo('auto'); await HW.game.saveTo('2'); ui.open('saveload', { mode: 'save' }); adv(0.4); await tap('ArrowDown'); adv(0.2); },
  async saveload_load() { await HW.game.saveTo('auto'); ui.open('saveload', { mode: 'load' }); adv(0.4); },
  async credits() { ui.open('credits'); adv(6); },
  // special screens
  async pa() {
    ui.open('pa', { rooms: [['205', '205'], ['LIB', 'LIBRARY'], ['AUD', 'AUD'], ['GYM', 'GYM'], ['101', '101'], ['102', '102'], ['103', '103'], ['BSMT', 'BSMT'], ['OFFICE', 'OFFICE'], ['CAFE', 'CAFE'], ['206', '206'], ['207', '207']].map(([id, label]) => ({ id, label })),
      onListen: async (id) => { await ui.say('danny', 'entranced', '...i will not leave... i will not leave...', { name: '205', light: 'dark' }); } });
    adv(0.5); await tap('ArrowRight'); adv(0.2);
  },
  async pa_listen() {
    ui.open('pa', { rooms: ['205', 'LIB', 'AUD', 'GYM', '101', 'BSMT', 'OFFICE', 'CAFE'].map((id) => ({ id, label: id })), onListen: async () => { await new Promise((r) => setTimeout(r, 4000)); } });
    adv(0.5); await tap(); adv(1.2);
  },
  async safe() { ui.open('safe', { label: "FOUNDER'S DAY (mo-day-yr)", check: (a, b, c) => a === 10 && b === 19 && c === 94, onWrong: async (n) => { await ui.think('confused', n >= 2 ? "Founder's Day... the plaque in the lobby." : 'No.'); } }); adv(0.4); for (let i = 0; i < 10; i++) await tap('ArrowRight'); await tap(); for (let i = 0; i < 4; i++) await tap('ArrowLeft'); adv(0.4); },
  async terminal() {
    ui.open('terminal', { boot: ['RADIO SHACK LEVEL II BASIC', 'READY', '>RUN "ROLLCALL"', 'ENTER NAME OF STUDENT'], handle: async (s) => (s === 'EXIT' ? { lines: [], exit: true } : [`${s} -- PRESENT`, 'READY']) });
    adv(0.6); await typeText('denise webb'); await tap('Enter'); await settle(0.5); await typeText('kev'); adv(0.3);
  },
  async register() { ui.open('register', { model: registerModel() }); adv(0.6); },
  async register_stamped() {
    const m = registerModel();
    ui.open('register', { model: m }); adv(0.5);
    await tap(); adv(0.2); await tap(); await settle(0.4);  // stamp on line 1 (danny, pencil)
    for (let i = 0; i < 8 && ui.dialogue.active; i++) { await tap(); await settle(0.1); }
    adv(1.2);
  },
  async breath() { ui.setOverlay('locker', { phase: 1, faceIn: 1 }); ui.open('breath', { seconds: 6 }); adv(0.6); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' })); adv(3.2); },
};

// ---- boot -----------------------------------------------------------------------------------------------
export async function boot() {
  installHW();
  await installArt();
  await ui.init();
  world = fakeWorld();
  const loop = (t) => {
    if (!manual) {
      const now = performance.now(); const dt = Math.min(0.05, (now - (loop.last || now)) / 1000); loop.last = now;
      ui.update(dt); HW.time += dt; frame();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.show = async (name, { keepManual = true } = {}) => {
    manual = true;
    for (const k of ['KeyZ', 'Space', 'Enter']) window.dispatchEvent(new KeyboardEvent('keyup', { code: k }));
    ui.reset(); ui.hud.toasts = []; ui.hud.notices = [];
    installHW(); showWorld = true;
    const fn = SCEN[name];
    if (!fn) throw new Error('unknown scenario ' + name);
    await fn();
    frame();
    manual = keepManual;
    return { transcript: ui.transcript.slice(-5), sfx: sfxLog.slice(-10) };
  };
  window.scenarios = Object.keys(SCEN);
  window.HW = HW;
  window.ui = ui;
  window.adv = adv; window.tap = tap;
  const hash = location.hash.slice(1);
  if (hash && SCEN[hash]) { await window.show(hash, { keepManual: false }); }
  window.__ready = true;
}
