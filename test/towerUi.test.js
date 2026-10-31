// LAST LOOKOUT — interface, audio and effects: Node-side tests (no browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  formatCash, formatCashDelta, groupThousands, pad, formatRange, formatSpeed, formatZoom, formatClock, formatAccuracy,
  bossTitle, waveTitle, nightLine, wrap, clip, ratio, frac, gameOverTitle,
} from '../src/tower/ui/format.js';
import { shopItems, normalizeShopState, moveSelection, actionCall, tabBadges, upgradeEffect, defenceLimit, SHOP_TABS } from '../src/tower/ui/shopModel.js';
import { SETTINGS, defaultSettings, mergeSettings, stepSetting, sanitizeSetting, settingText, settingFraction } from '../src/tower/ui/settingsModel.js';
import { buildPixelFont, glyphBitmaps, traceGlyph, measurePixelText, hasGlyph, glyphFor } from '../src/tower/ui/pixelFont.js';
import { RIFLES, RIFLE_ORDER, UPGRADES, DEFENCES } from '../src/tower/catalog.js';
import { renderValleyIR, renderCrickets, renderHorde, renderFire, loopCrossfade, VALLEY_ECHOES } from '../src/tower/audio/dsp.js';
import { TowerAudio, distanceGain, airCutoff, soundDelay, RIFLE_SOUND } from '../src/tower/audio/towerAudio.js';
import { TowerFx } from '../src/tower/fx/towerFx.js';
import { RAMPS } from '../src/tower/fx/particles.js';

test('UI, audio and FX modules import in Node without touching the DOM', async () => {
  assert.equal(typeof globalThis.window, 'undefined');
  assert.equal(typeof globalThis.document, 'undefined');
  const hud = await import('../src/tower/ui/hud.js');
  assert.equal(typeof hud.TowerHud, 'function');
  for (const m of ['shop', 'screens', 'scope', 'titleArt', 'sprites', 'theme', 'dom']) {
    const mod = await import(`../src/tower/ui/${m}.js`);
    assert.ok(Object.keys(mod).length > 0, m);
  }
  await import('../src/tower/audio/music.js');
});

test('cash, range, clock and percentage formatting', () => {
  assert.equal(groupThousands(1234567), '1,234,567');
  assert.equal(groupThousands(999), '999');
  assert.equal(formatCash(1250), '$1,250');
  assert.equal(formatCash(-50), '-$50');
  assert.equal(formatCash(NaN), '$0');
  assert.equal(formatCashDelta(20), '+$20');
  assert.equal(formatCashDelta(-2500), '-$2,500');
  assert.equal(formatCashDelta(0), '');
  assert.equal(pad(5), '05');
  assert.equal(pad(123), '123');
  assert.equal(formatRange(238.4), '238 m');
  assert.equal(formatRange(null), '---');
  assert.equal(formatSpeed(3.24), '3.2 m/s');
  assert.equal(formatZoom(10), '10.0×');
  assert.equal(formatClock(61.2), '1:02');
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatAccuracy(233, 301), '77%');
  assert.equal(formatAccuracy(0, 0), '—');
  assert.equal(ratio({ hp: 250, max: 1000 }), 0.25);
  assert.equal(ratio({ hp: 5, max: 0 }), 0);
  assert.equal(frac(2), 1);
  assert.equal(clip('ABCDEFG', 4), 'ABC…');
  assert.deepEqual(wrap('one two three four', 9), ['one two', 'three', 'four']);
});

test('wave banners name their bosses', () => {
  assert.equal(bossTitle('brute'), 'THE BRUTE');
  assert.equal(bossTitle(['juggernaut', 'brute', 'brute']), 'THE JUGGERNAUT & TWO BRUTES');
  assert.equal(bossTitle(['brute', 'brute']), 'TWO BRUTES');
  assert.equal(bossTitle(null), '');
  assert.deepEqual(waveTitle(5, 'brute'), { title: 'WAVE 05', sub: 'THE BRUTE', boss: true });
  const w = waveTitle(3, null, 0.9);
  assert.equal(w.boss, false);
  assert.equal(w.sub, nightLine(0.9));
  assert.equal(gameOverTitle({ cause: 'gate', wave: 4 }), 'THE GATE HAS FALLEN');
});

const baseShop = () => ({
  cash: 3000, wave: 5,
  owned: { rifles: new Set(['m91', 'sr10']), upgrades: { optics: 2, steady: 1 }, ammo: { hp: 20 }, defences: { wire: 1, steelGate: 0, sentry: 1 } },
  equipped: { rifle: 'sr10', ammo: 'fmj' }, gate: { hp: 1000, max: 1000 },
});

test('shop: rifles are equipped, owned or for sale, with stat bars', () => {
  const items = shopItems('rifles', baseShop());
  assert.deepEqual(items.map((i) => i.id), RIFLE_ORDER);
  const by = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(by.sr10.status, 'equipped');
  assert.equal(by.sr10.action, null);
  assert.equal(by.m91.action, 'equip');
  assert.equal(by.m91.enabled, true);
  assert.equal(by.whisper.action, 'buy');
  assert.equal(by.whisper.affordable, false); // $4,800 > $3,000
  assert.equal(by.whisper.enabled, false);
  assert.match(by.whisper.reason, /NEED \$1,800/);
  for (const it of items) {
    assert.deepEqual(it.stats.map((s) => s.label), ['DAMAGE', 'PENETRATION', 'ZOOM', 'FIRE RATE']);
    for (const s of it.stats) assert.ok(s.value >= 0 && s.value <= 1, `${it.id} ${s.label}`);
  }
  assert.ok(by.anvil.stats[0].value > by.m91.stats[0].value);
  assert.ok(by.sr10.stats[3].value > by.m91.stats[3].value);
});

test('shop: ammo packs, loading, upgrades, defences and the gate', () => {
  const st = baseShop();
  const ammo = Object.fromEntries(shopItems('ammo', st).map((i) => [i.id, i]));
  assert.equal(ammo.fmj.status, 'equipped');
  assert.equal(ammo.hp.secondary.action, 'equip');
  assert.equal(ammo.ap.secondary, null);
  assert.equal(ammo.hp.count, 20);
  const up = Object.fromEntries(shopItems('upgrades', st).map((i) => [i.id, i]));
  assert.equal(up.optics.status, 'maxed');
  assert.equal(up.optics.action, null);
  assert.equal(up.steady.action, 'upgrade');
  assert.equal(up.steady.price, UPGRADES.steady.levels[1].price);
  assert.deepEqual(up.steady.level, { cur: 1, max: 2 });
  assert.equal(up.thermal.action, 'buy');
  assert.equal(upgradeEffect({ zoom: 1.35 }), 'ZOOM ×1.35');
  const def = Object.fromEntries(shopItems('defences', st).map((i) => [i.id, i]));
  assert.equal(def.repair.enabled, false, 'gate at full health');
  assert.equal(def.repair.reason, 'GATE INTACT');
  assert.equal(def.wire.action, 'place');
  assert.equal(def.sentry.action, 'refill', 'a mounted sentry is refilled');
  assert.equal(def.sentry.price, DEFENCES.sentry.refill);
  assert.equal(def.steelGate.action, 'buy');
  assert.equal(defenceLimit('sentry'), 1);
  st.gate.hp = 400;
  st.owned.defences.steelGate = 1;
  const def2 = Object.fromEntries(shopItems('defences', st).map((i) => [i.id, i]));
  assert.equal(def2.repair.enabled, true);
  assert.equal(def2.steelGate.status, 'maxed');
  // handler calls
  assert.deepEqual(actionCall(def.wire), ['onPlace', 'wire']);
  assert.deepEqual(actionCall(up.steady), ['onShopBuy', 'steady', { kind: 'upgrade', action: 'upgrade', tab: 'upgrades' }]);
  assert.deepEqual(actionCall(ammo.hp, 'secondary'), ['onShopBuy', 'hp', { kind: 'ammo', action: 'equip', tab: 'ammo' }]);
  assert.equal(actionCall(up.optics), null);
  const badges = tabBadges(st);
  assert.deepEqual(Object.keys(badges), SHOP_TABS.map((t) => t.id));
});

test('shop: state normalisation accepts arrays and fills defaults', () => {
  const st = normalizeShopState({ cash: 10, owned: { rifles: ['m91'] } });
  assert.ok(st.owned.rifles instanceof Set);
  assert.equal(st.equipped.rifle, 'm91');
  assert.equal(st.gate.max, 1);
  assert.equal(shopItems('nope', st).length, 0);
});

test('shop: grid keyboard navigation', () => {
  // 7 cards in 4 columns: row 0 = 0..3, row 1 = 4..6
  assert.equal(moveSelection(0, 7, 4, 'right'), 1);
  assert.equal(moveSelection(3, 7, 4, 'right'), 4);
  assert.equal(moveSelection(6, 7, 4, 'right'), 6);
  assert.equal(moveSelection(1, 7, 4, 'down'), 5);
  assert.equal(moveSelection(3, 7, 4, 'down'), 6, 'short last row: go to its last card');
  assert.equal(moveSelection(5, 7, 4, 'down'), 5);
  assert.equal(moveSelection(5, 7, 4, 'up'), 1);
  assert.equal(moveSelection(2, 7, 4, 'up'), 2);
  assert.equal(moveSelection(4, 7, 4, 'end'), 6);
  assert.equal(moveSelection(0, 0, 4, 'down'), 0);
});

test('settings: defaults, clamping, stepping and labels', () => {
  const d = defaultSettings();
  assert.deepEqual(Object.keys(d).sort(), SETTINGS.map((s) => s.key).sort());
  const spec = (k) => SETTINGS.find((s) => s.key === k);
  assert.equal(sanitizeSetting(spec('masterVol'), 7), 1);
  assert.equal(sanitizeSetting(spec('quality'), 'ultra'), 'medium');
  assert.equal(stepSetting(spec('quality'), 'medium', 1), 'high');
  assert.equal(stepSetting(spec('quality'), 'high', 1), 'high');
  assert.equal(stepSetting(spec('invertY'), false, -1), true);
  assert.equal(stepSetting(spec('sfxVol'), 0.9, 1), 0.95);
  assert.equal(stepSetting(spec('sfxVol'), 1, 1), 1);
  assert.equal(settingText(spec('musicVol'), 0.6), '60%');
  assert.equal(settingText(spec('mouseSens'), 1), '1.00×');
  assert.equal(settingText(spec('showFps'), true), 'ON');
  assert.equal(settingFraction(spec('masterVol'), 0.5), 0.5);
  const m = mergeSettings({ musicVol: 0.2, bogus: 1, quality: 'low' });
  assert.equal(m.musicVol, 0.2);
  assert.equal(m.quality, 'low');
  assert.equal('bogus' in m, false);
});

test('pixel font: glyphs, outlines and a well-formed TrueType file', () => {
  const bm = glyphBitmaps();
  for (const ch of 'ABCXYZabcxyz0123456789$%:.,×·—∞▶') assert.ok(hasGlyph(ch), ch);
  // every catalog string the shop shows can be drawn
  for (const r of Object.values(RIFLES)) for (const ch of r.name + r.round + r.desc) assert.ok(hasGlyph(ch), `missing glyph ${ch}`);
  assert.equal(glyphFor('一'), bm.get('?'));
  assert.equal(measurePixelText('AB', 2), (12 - 1) * 2);
  // a square ring traces to one outer loop and one hole of opposite orientation ('O' is four
  // pieces: its corners only touch diagonally)
  const O = traceGlyph(bm.get('□').rows);
  assert.equal(O.length, 2);
  assert.equal(traceGlyph(bm.get('O').rows).length, 4);
  const area = (c) => c.reduce((s, p, i) => s + p[0] * c[(i + 1) % c.length][1] - c[(i + 1) % c.length][0] * p[1], 0) / 2;
  assert.ok(Math.sign(area(O[0])) !== Math.sign(area(O[1])));
  const font = buildPixelFont();
  assert.ok(font instanceof Uint8Array);
  const dv = new DataView(font.buffer, font.byteOffset, font.byteLength);
  assert.equal(dv.getUint32(0), 0x00010000);
  const n = dv.getUint16(4);
  const tags = [];
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    const tag = String.fromCharCode(...font.subarray(o, o + 4));
    const off = dv.getUint32(o + 8), len = dv.getUint32(o + 12);
    assert.ok(off % 4 === 0 && off + len <= font.length, tag);
    tags.push(tag);
  }
  assert.deepEqual(tags, [...tags].sort(), 'table directory sorted');
  for (const t of ['OS/2', 'cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'post']) assert.ok(tags.includes(t), t);
  // whole-font checksum (with checkSumAdjustment) is the magic number
  let sum = 0;
  for (let i = 0; i < font.length; i += 4) sum = (sum + (((font[i] << 24) | (font[i + 1] << 16) | (font[i + 2] << 8) | font[i + 3]) >>> 0)) >>> 0;
  assert.equal(sum, 0xb1b0afba);
});

test('dsp: the valley impulse response has energy at its echoes and is normalised', () => {
  const sr = 8000, n = Math.ceil(3.4 * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  renderValleyIR(L, R, sr);
  let e = 0;
  for (let i = 0; i < n; i++) e += L[i] * L[i] + R[i] * R[i];
  assert.ok(Math.abs(e / 2 - 1) < 0.01, `unit energy per channel, got ${e / 2}`);
  const win = (t) => {
    let s = 0;
    for (let i = Math.floor(t * sr); i < Math.floor((t + 0.03) * sr); i++) s += L[i] * L[i] + R[i] * R[i];
    return s;
  };
  // the slap-back off the hills stands out from the tail just before it
  assert.ok(win(VALLEY_ECHOES[1][0]) > 1.5 * win(VALLEY_ECHOES[1][0] - 0.06));
  for (let i = 0; i < n; i++) assert.ok(Number.isFinite(L[i]) && Number.isFinite(R[i]));
});

test('dsp: ambience loops are finite and seamless', () => {
  const sr = 8000;
  const n = 6 * sr;
  const L = new Float32Array(n), R = new Float32Array(n);
  renderCrickets(L, R, sr);
  // periodic content: the loop point continues smoothly (no step larger than the signal's own)
  let maxStep = 0;
  for (let i = 1; i < n; i++) maxStep = Math.max(maxStep, Math.abs(L[i] - L[i - 1]));
  assert.ok(Math.abs(L[0] - L[n - 1]) <= maxStep + 1e-6);
  const H = [new Float32Array(4 * sr), new Float32Array(4 * sr)];
  renderHorde(H[0], H[1], sr, 7, 8);
  assert.ok(H[0].every(Number.isFinite));
  const f = new Float32Array(3 * sr);
  renderFire(f, sr);
  const len = loopCrossfade(f, sr, 0.2);
  assert.equal(len, f.length - Math.floor(0.2 * sr));
  assert.ok(f.every(Number.isFinite));
});

test('audio: distance curve, air absorption and the speed of sound', () => {
  assert.equal(distanceGain(2), 1);
  assert.ok(distanceGain(100) > 0.25 && distanceGain(100) < 0.4);
  assert.ok(distanceGain(250) > 0.12, 'a walker at 250 m still answers the shot');
  assert.ok(distanceGain(200) < distanceGain(100));
  assert.equal(airCutoff(10), 20000);
  assert.ok(airCutoff(250) < airCutoff(100));
  assert.ok(Math.abs(soundDelay(343) - 1) < 1e-9);
  assert.equal(soundDelay(5000), 1.1);
  for (const id of RIFLE_ORDER) assert.ok(RIFLE_SOUND[id], `a voice for ${id}`);
});

test('audio: every call is a harmless no-op before unlock', () => {
  const a = new TowerAudio();
  const p = { x: 10, y: 0, z: -100 };
  a.setListener({ x: 0, y: 22, z: 0 }, { x: 0, y: 0, z: -1 });
  a.setVolume(0.5);
  a.setMix({ music: 0.3, sfx: 0.7 });
  for (const id of RIFLE_ORDER) {
    a.rifle(id, {});
    a.bolt(id);
    a.magOut(id);
    a.magIn(id);
  }
  a.dryFire();
  a.bulletImpact('dirt', p, 100);
  a.headshotCrack(p);
  a.distantThump(p);
  a.zombieGroan('walker', p);
  a.zombieScream(p);
  a.bossRoar('brute', p);
  a.gateHit(0.5);
  a.gateBreak();
  a.explosion(p, 1);
  a.fire(p, true);
  a.fire(p, false);
  a.bodyFall(p, 1);
  a.boneCrack(p, 1);
  a.ambience(0.5, 3, 0.2);
  a.horde(30, 50);
  a.waveSiren();
  a.waveCleared();
  a.cash();
  a.ui('click');
  a.heartbeat(80);
  a.heartbeat(0);
  a.breathHold(true);
  a.breathHold(false);
  a.slowMo(true);
  a.slowMo(false);
  a.music('fight');
  assert.equal(a.ready, false);
  assert.equal(a.eng.stats.errors, 0);
  a.dispose();
});

test('fx: effects spawn within their caps, update without allocating and clear', () => {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 50, 300);
  let tinks = 0;
  const fx = new TowerFx(scene, { onCasing: () => tinks++, maxParticles: 2048 });
  const p = new THREE.Vector3(0, 0, -60), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(0, 0, -1);
  fx.explosion(p, 1);
  fx.fire(p, 2, 3);
  fx.gasCloud(p, 5, 3);
  fx.muzzle(new THREE.Vector3(0, 22, 0), dir, { brake: true });
  fx.tracer(new THREE.Vector3(0, 22, 0), p);
  for (const m of ['dirt', 'wood', 'metal', 'concrete', 'flesh', 'water']) fx.impact(p, up, m);
  fx.bloodMist(new THREE.Vector3(0, 1.6, -60), dir, 1.5);
  fx.dust(p);
  fx.shellCasing(new THREE.Vector3(0, 22, 0), new THREE.Vector3(1, 0.3, 0));
  assert.ok(fx.count > 100);
  // a flood of explosions never exceeds the capacity
  for (let i = 0; i < 200; i++) fx.explosion(p, 3);
  assert.ok(fx.soft.n <= fx.soft.max && fx.glow.n <= fx.glow.max);
  const cam = new THREE.PerspectiveCamera();
  for (let i = 0; i < 120; i++) fx.update(1 / 60, cam);
  assert.ok(tinks >= 1, 'the casing landed');
  for (let i = 0; i < 900; i++) fx.update(1 / 60, cam);
  assert.equal(fx.count, 0, 'everything burned out after 15 s');
  fx.clear();
  fx.dispose();
  assert.equal(Object.keys(RAMPS).length <= 16, true);
});
