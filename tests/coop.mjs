// Two-browser co-op test: node tests/coop.mjs [url]
// Page A hosts a room and starts chapter CH (default 0); page B joins with the
// room code. Verifies the join, state replication, remote movement and combat.
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:5190/';
const CH = +(process.env.CH || 0);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const mk = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${tag} ${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[${tag} pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 6).join('\n')}`));
  await page.addInitScript(() => { const s = JSON.parse(localStorage.getItem('lastfour.settings') || '{}'); s.quality = 'low'; s.tts = false; s.character = 'bill'; localStorage.setItem('lastfour.settings', JSON.stringify(s)); });
  await page.goto(url);
  await page.evaluate(() => { window.__noRender = true; const t = setInterval(() => { if (window.game) { window.game.noRender = true; clearInterval(t); } }, 50); setInterval(() => { if (window.session) window.session.game.frame(1 / 30); }, 33); });
  return { page, logs, ev: async (fn, arg) => { try { return await page.evaluate(fn, arg); } catch (e) { return { evalError: e.message.split('\n')[0] }; } } };
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = !!process.env.SHOTS;
const shot = async (p, name) => { if (!SHOTS) return; await p.ev(() => { window.game.noRender = false; }); await wait(1500); try { await p.page.screenshot({ path: `tests/out/${name}.png`, timeout: 90000 }); console.log('shot', name); } catch (e) { console.log('shot failed', name); } await p.ev(() => { window.game.noRender = !!window.__noRender; }); };
const A = await mk('host');
const B = await mk('client');
for (let i = 0; i < 60; i++) { await wait(1000); const ok = await A.ev(() => window.session?.state === 'menu') && await B.ev(() => window.session?.state === 'menu'); if (ok) break; }
const relay = url.replace(/^http/, 'ws') + 'net';
let status = await A.ev(async (relay) => { let st = ''; await window.session.coopHost(relay, 'Hosty', (t) => (st = t)); return { st, code: window.session.net?.code }; }, relay);
console.log('host', JSON.stringify(status));
const code = status.code;
status = await B.ev(async ([relay, code]) => { let st = ''; await window.session.coopJoin(relay, code, 'Joiner', (t) => (st = t)); return { st, char: window.session.net?.char, code: window.session.net?.code }; }, [relay, code]);
console.log('client', JSON.stringify(status));
await wait(1500);
console.log('lobby peers', JSON.stringify(await A.ev(() => [...window.session.net.peers.values()].map((p) => [p.name, p.char]))));
await shot(A, 'coop_lobby');
await A.ev((ch) => window.session.coopStart(ch), CH);
for (let i = 0; i < 120; i++) {
  await wait(1000);
  const st = await B.ev(() => ({ s: window.session.state, loaded: window.session.net?.loaded, snaps: window.session.net?.snaps?.length }));
  if (i % 5 === 0) console.log('client wait', JSON.stringify(st));
  if (st && st.loaded && st.snaps > 2) break;
}
const summary = async () => {
  const a = await A.ev(() => { const g = window.game; return { t: g.time.toFixed(1), fps: g.fps.toFixed(0), commons: g.infected.commons.length, specials: g.infected.specials.length, sv: g.survivors.map((s) => `${s.char.id}${s.remote != null ? '*' : ''}@${s.pos.x.toFixed(1)},${s.pos.y.toFixed(1)},${s.pos.z.toFixed(1)} hp${Math.round(s.totalHealth)} k${s.stats.kills}`), sent: window.session.net.link.sentBytes }; });
  const b = await B.ev(() => { const g = window.game, n = window.session.net; return { t: g.time.toFixed(1), fps: g.fps.toFixed(0), me: g.player.char.id, commons: g.infected.commons.length, puppets: n.cmap.size, specials: g.infected.specials.length, sv: g.survivors.map((s) => `${s.char.id}@${s.pos.x.toFixed(1)},${s.pos.y.toFixed(1)},${s.pos.z.toFixed(1)} hp${Math.round(s.totalHealth)} k${s.stats.kills}`), recv: n.link.recvBytes, snaps: n.snaps.length, items: g.items.items.filter((i) => !i.taken).length }; });
  console.log('HOST  ', JSON.stringify(a));
  console.log('CLIENT', JSON.stringify(b));
};
await summary();
await shot(A, 'coop_host_1');
await shot(B, 'coop_client_1');
const simWait = async (P, secs) => { const t0 = await P.ev(() => window.game.time); for (let i = 0; i < 300; i++) { await wait(500); const t = await P.ev(() => window.game.time); if (t - t0 >= secs || t < t0) return; } };
// client walks forward for 3 seconds
await B.ev(() => { window.game.testCmd = { my: 1 }; });
await simWait(B, 3);
await B.ev(() => { window.game.testCmd = null; });
await simWait(A, 1);
console.log('after client walk');
await summary();
// host spawns a mob near the client's survivor; client shoots
await A.ev(() => { const g = window.game; const s = g.survivors.find((x) => x.remote != null); g.cheats.godAll = true; const nav = g.level.nav; const n = nav.nearestNode(s.pos.x + 6, s.pos.y, s.pos.z, 8); for (let i = 0; i < 8; i++) g.infected.spawnCommon(nav.nodeX(n) + i * 0.2, nav.nodeY[n], nav.nodeZ(n), { chase: true }); });
await simWait(B, 2);
await B.ev(() => { const g = window.game; const me = g.player; const c = g.infected.commons[0]; if (c) { me.yaw = Math.atan2(-(c.pos.x - me.pos.x), -(c.pos.z - me.pos.z)); } window.game.testCmd = { fire: true, firePressed: true }; });
await simWait(B, 4);
await B.ev(() => { window.game.testCmd = null; });
await simWait(A, 1);
console.log('after combat');
await summary();
await shot(A, 'coop_host_2');
await shot(B, 'coop_client_2');
console.log('--- logs ---\n' + A.logs.concat(B.logs).slice(0, 60).join('\n'));
await browser.close();
