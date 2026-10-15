// Headless audio check: generates every sound + music cue in Chromium and validates the buffers.
// usage: node tests/audio-check.mjs [baseUrl]
import { launch, shot } from './harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || process.env.AUDIO_BASE || 'http://localhost:5173';
const URL_ = BASE.replace(/\/$/, '') + '/tests/pages/audio.html';

const REQUIRED_SOUNDS = `pistol_fire dual_pistol_fire magnum_fire smg_fire smg_silenced_fire pump_shotgun_fire chrome_shotgun_fire auto_shotgun_fire spas_fire m16_fire ak47_fire scar_fire hunting_rifle_fire sniper_fire grenade_launcher_fire m60_fire dry_fire reload_mag_out reload_mag_in reload_bolt pistol_slide shotgun_shell_insert shotgun_pump weapon_deploy shell_casing shotgun_shell_drop chainsaw_start chainsaw_idle chainsaw_rev chainsaw_cut melee_swing melee_hit_flesh melee_hit_world melee_blade_hit shove shove_hit bullet_impact_concrete bullet_impact_metal bullet_impact_wood bullet_impact_flesh bullet_impact_glass headshot ricochet explosion explosion_small laser_sight_on
pickup_item pickup_weapon ammo_pickup medkit_use medkit_done pills_shake pills_swallow adrenaline_inject defib_charge defib_shock pipebomb_beep molotov_ignite molotov_shatter bile_shatter fire_loop fire_burst gascan_pour gascan_fill_done propane_hiss door_open door_close door_metal_open door_metal_close door_break door_bang glass_break alarm_loop mall_alarm_loop car_alarm_loop elevator_hum elevator_ding elevator_stop button_press intercom_buzz helicopter_loop helicopter_flyby rock_impact wood_crack metal_crash body_fall gib_splat blood_splash ui_click ui_hover ui_back heartbeat flashlight_click ledge_grab ledge_slip achievement_ding
step_concrete step_metal step_wood step_carpet step_tile step_gravel step_grass step_water land_concrete step_tank
survivor_pain_m survivor_pain_f survivor_pain_big_m survivor_pain_big_f survivor_incap_m survivor_incap_f survivor_death_m survivor_death_f survivor_cough survivor_choke survivor_scream_m survivor_scream_f survivor_grunt_m survivor_grunt_f survivor_vomit_spit
zombie_idle zombie_alert zombie_rage zombie_attack zombie_hit_survivor zombie_pain zombie_death zombie_burning zombie_climb horde_roar horde_scream zombie_footsteps_run
boomer_idle boomer_vomit boomer_explode boomer_alert hunter_idle hunter_scream hunter_lunge hunter_shred smoker_idle smoker_tongue smoker_drag smoker_choke_loop smoker_death charger_idle charger_charge charger_impact charger_pummel jockey_idle jockey_leap jockey_ride spitter_idle spitter_spit acid_sizzle spitter_death tank_idle tank_roar tank_punch tank_rock_rip tank_rock_throw tank_death witch_cry witch_growl witch_scream witch_attack
amb_fire_distant amb_city amb_wind amb_interior amb_mall`.split(/\s+/).filter(Boolean);
const REQUIRED_CUES = 'horde_incoming horde_loop tank witch_near witch_rage stinger_boomer stinger_hunter stinger_smoker stinger_charger stinger_jockey stinger_spitter incap death saferoom explore_hotel explore_streets explore_mall danger finale_start finale_loop escape chapter_end menu'.split(' ');
const MUST_LOOP = ['chainsaw_idle', 'chainsaw_rev', 'chainsaw_cut', 'medkit_use', 'fire_loop', 'gascan_pour', 'elevator_hum', 'helicopter_loop', 'alarm_loop', 'mall_alarm_loop', 'car_alarm_loop', 'smoker_choke_loop', 'jockey_ride', 'acid_sizzle', 'witch_cry', 'amb_fire_distant', 'amb_city', 'amb_wind', 'amb_interior', 'amb_mall'];
const MUST_LOOP_CUES = ['horde_loop', 'tank', 'witch_near', 'incap', 'saferoom', 'explore_hotel', 'explore_streets', 'explore_mall', 'finale_loop', 'menu'];

const failures = [];
const fail = (m) => failures.push(m);

const { browser, page, errors } = await launch({ url: URL_, width: 960, height: 900 });
// Vite may reload the page once while optimising deps on first visit: wait until it settles.
async function ready() {
  for (let i = 0; i < 5; i++) {
    try {
      await page.waitForLoadState('load');
      await page.waitForFunction(() => typeof window.__initAudio === 'function', null, { timeout: 30000 });
      await page.waitForTimeout(500);
      if (await page.evaluate(() => typeof window.__initAudio === 'function')) return;
    } catch (e) { if (!/destroyed|navigat/i.test(String(e))) throw e; }
  }
  throw new Error('page never became ready');
}
await ready();

let init, initWall, res, api;
for (let attempt = 0; ; attempt++) {
  try {
    const t0 = Date.now();
    init = await page.evaluate(() => window.__initAudio());
    initWall = Date.now() - t0;
    res = await page.evaluate(() => window.__audioTest());
    api = await page.evaluate(() => window.__apiTest());
    break;
  } catch (e) {
    // dev-server full reload (file watcher) -> start over on the fresh page
    if (attempt < 3 && /destroyed|navigat/i.test(String(e))) { await ready(); continue; }
    throw e;
  }
}

// ------------------------------------------------------------------ validation
const names = new Set(res.sounds.map((s) => s.name));
const cues = new Set(res.music.map((m) => m.name));
for (const n of REQUIRED_SOUNDS) if (!names.has(n)) fail(`missing sound ${n}`);
for (const c of REQUIRED_CUES) if (!cues.has(c)) fail(`missing music cue ${c}`);
for (const n of MUST_LOOP) { const s = res.sounds.find((x) => x.name === n); if (s && !s.loop) fail(`${n} should be a loop`); }
for (const c of MUST_LOOP_CUES) { const s = res.music.find((x) => x.name === c); if (s && !s.loop) fail(`cue ${c} should loop`); }

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const fmt = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
const lines = [];
lines.push(`${pad('name', 24)} ${lpad('var', 3)} ${lpad('dur', 6)} ${lpad('peak', 6)} ${lpad('rmsdB', 6)} ${lpad('nan', 3)} ${lpad('edge0', 6)} ${lpad('head5', 6)} ${lpad('tail5', 6)} ${lpad('seamR', 6)} loop`);
function check(item, kind) {
  const st = item.stats;
  if (item.generated < (item.variants || 1) || !st.length) { fail(`${kind} ${item.name}: not generated (${item.generated}/${item.variants || 1})`); return; }
  let peak = 0, minPeak = 9, nan = 0, dur = 0, rmsDb = -999, e0 = 0, e1 = 0, h5 = 0, t5 = 0, seamR = 0;
  for (const s of st) {
    peak = Math.max(peak, s.peak); minPeak = Math.min(minPeak, s.peak); nan += s.nan; dur = Math.max(dur, s.duration);
    rmsDb = Math.max(rmsDb, s.rmsDb); e0 = Math.max(e0, s.edgeStart); e1 = Math.max(e1, s.edgeEnd); h5 = Math.max(h5, s.head5); t5 = Math.max(t5, s.tail5); seamR = Math.max(seamR, s.seamRatio);
  }
  lines.push(`${pad(item.name, 24)} ${lpad(st.length, 3)} ${lpad(fmt(dur, 2), 6)} ${lpad(fmt(peak), 6)} ${lpad(fmt(rmsDb, 1), 6)} ${lpad(nan, 3)} ${lpad(fmt(e0), 6)} ${lpad(fmt(h5), 6)} ${lpad(fmt(t5), 6)} ${lpad(item.loop ? fmt(seamR, 2) : '-', 6)} ${item.loop ? 'L' : ''}`);
  if (nan > 0) fail(`${item.name}: ${nan} NaN samples`);
  if (minPeak < 0.01) fail(`${item.name}: silent (peak ${fmt(minPeak, 4)})`);
  if (peak > 1.0) fail(`${item.name}: clipping (peak ${fmt(peak, 4)})`);
  if (!item.loop) {
    // click-free edges: starts from (and ends at) rest; last 5 ms faded out
    if (e0 > 0.01) fail(`${item.name}: starts with a step (|x0|=${fmt(e0, 4)})`);
    if (e1 > 0.01) fail(`${item.name}: ends with a step (|xN|=${fmt(e1, 4)})`);
    if (t5 > 0.02) fail(`${item.name}: last 5 ms not silent (${fmt(t5, 4)})`);
  } else if (seamR > 3) fail(`${item.name}: loop seam discontinuity (ratio ${fmt(seamR, 2)})`);
}
lines.push('--- sounds');
for (const s of res.sounds) check(s, 'sound');
lines.push('--- music');
for (const m of res.music) check(m, 'music');

// API behaviour
const apiChecks = [
  ['unknown name returns null', api.unknown1 === null && api.unknown2 === null],
  ['unknown name warns once', api.unknownWarns === 1],
  ['unknown music cue returns null', api.unknownMusic === null],
  ['30 zombie deaths in one frame -> <= 3 voices', api.zombieDeathVoices <= 3 && api.zombieDeathVoices >= 1],
  ['voice cap respected after flood (<= 48 + ui/music)', api.activeAfterFlood <= 52],
  ['far one-shot culled', api.farCulled === true],
  ['loop handle playing', api.handlePlaying === true],
  ['follow updates position', api.followed === true],
  ['music loop playing', api.tankPlaying === true],
  ['pause pauses world voices', api.pausedVoice === 'paused'],
  ['ui plays during pause', api.uiDuringPause === true],
  ['sfx blocked during pause', api.sfxDuringPause === true],
  ['resume restarts voices', api.resumedVoice === 'playing'],
  ['handle.stop() stops', api.handleStopped === true],
  ['stopMusic stops', api.tankStopped === true],
  ['audio actually renders (2D gunshot audible)', api.lvlGun2D > 0.2],
  ['distance attenuation (5 m > 60 m > 0)', api.lvlGun5m > api.lvlGun60m && api.lvlGun60m > 0.001],
  ['occlusion attenuates', api.lvlGun5mOccluded < api.lvlGun5m],
  ['footsteps quieter than gunshots', api.lvlStep2D < api.lvlGun2D * 0.7],
  ['footsteps fade with distance', api.lvlStep12m < api.lvlStep2D],
  ['music renders', api.lvlMusic > 0.05],
  ['muffle attenuates', api.lvlGun2DMuffled < api.lvlGun2D],
];
for (const [label, ok] of apiChecks) if (!ok) fail(`api: ${label} (${JSON.stringify(api)})`);

if (init.initMs > 5000) fail(`init too slow: ${init.initMs.toFixed(0)} ms`);
const realErrors = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
if (realErrors.length) fail('page errors:\n' + realErrors.join('\n'));

// ------------------------------------------------------------------ visualisation PNGs
await page.evaluate(() => window.__renderViz([
  ['sfx', 'pump_shotgun_fire'], ['sfx', 'm16_fire'], ['sfx', 'explosion'], ['sfx', 'horde_roar'],
  ['sfx', 'witch_cry'], ['sfx', 'tank_roar'], ['sfx', 'survivor_pain_m'], ['sfx', 'jockey_idle'],
]));
const viz = await page.$('#viz');
const vizPath = path.join('tests/output', 'audio-viz-sfx.png');
await viz.screenshot({ path: vizPath });
await page.evaluate(() => window.__renderViz([['music', 'tank', 13], ['music', 'horde_incoming'], ['music', 'menu', 24], ['music', 'witch_near'], ['music', 'saferoom']]));
const vizPath2 = path.join('tests/output', 'audio-viz-music.png');
await (await page.$('#viz')).screenshot({ path: vizPath2 });
await page.evaluate(() => window.scrollTo(0, 0));
await shot(page, 'audio-page');

// ------------------------------------------------------------------ report
console.log(lines.join('\n'));
console.log('\n--- timings');
console.log(`init(): ${init.initMs.toFixed(0)} ms (core sfx ready ${init.coreMs.toFixed(0)} ms, wall ${initWall} ms, workers ${init.workers})`);
console.log(`all sfx generated: ${res.timings.allSfxMs.toFixed(0)} ms after init start`);
console.log(`all music generated: ${res.timings.allMusicMs.toFixed(0)} ms after init start (lazy, background)`);
console.log('music gen per cue (ms, in worker): ' + Object.entries(res.musicGenMs).map(([k, v]) => `${k}=${Math.round(v)}`).join(' '));
console.log(`sounds: ${res.sounds.length} names / ${res.sounds.reduce((a, s) => a + s.generated, 0)} buffers; music: ${res.music.length} cues; PCM memory ${res.memoryMB.toFixed(1)} MB`);
console.log('--- api', JSON.stringify(api));
console.log(`viz: ${vizPath}, ${vizPath2}`);
fs.writeFileSync(path.join('tests/output', 'audio-report.json'), JSON.stringify({ init, res, api }, null, 1));
await browser.close();
if (failures.length) {
  console.log(`\nFAIL (${failures.length})\n` + failures.map((f) => ' - ' + f).join('\n'));
  process.exit(1);
}
console.log('\nPASS');
