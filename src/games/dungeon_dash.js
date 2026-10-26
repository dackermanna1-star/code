// Dungeon Dash — a tiny turn-based roguelite: explore rooms, bump enemies to fight, loot chests, take the stairs down.
import { defineGame } from './index.js';

const FOES = {
  rat: { name: 'Rat', hp: 2, atk: 1, col: '#a68a64', min: 1, xp: 1 },
  bat: { name: 'Bat', hp: 2, atk: 1, col: '#9d4edd', min: 1, xp: 1, erratic: true },
  slime: { name: 'Slime', hp: 4, atk: 1, col: '#70e000', min: 1, xp: 2, slow: true },
  skeleton: { name: 'Skeleton', hp: 5, atk: 2, col: '#e9ecef', min: 2, xp: 3 },
  orc: { name: 'Orc', hp: 9, atk: 3, col: '#d00000', min: 4, xp: 5 },
};
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

defineGame({
  id: 'dungeon_dash', title: 'Dungeon Dash', genre: 'Roguelite', icon: '🗡️', color: '#9d4edd',
  desc: 'Delve floor after floor of a tiny procedural dungeon. Bump to fight, grab loot, find the stairs before your HP runs out.',
  help: 'Arrows / WASD to move & attack (bump) · Space to wait a turn · step on ▼ to descend',
  create(api) {
    const W = api.w, H = api.h, C = 32, R = 17, T = 20, TAU = Math.PI * 2;
    const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    let map, seen, vis, foes, loot, stairs, floor = 0;
    const P = { x: 0, y: 0, rx: 0, ry: 0, hp: 12, max: 12, atk: 2, def: 0, gold: 0, kills: 0, bump: null, hit: 0 };
    let floats = [], parts = [], log = [], shake = 0, t = 0, dead = false, endT = 0, holdK = null, holdT = 0, fade = 1, turnCD = 0;
    api.music('ambient');

    const say = (m, col = '#ddd') => { log.unshift({ m, col, t: 0 }); log.length = Math.min(log.length, 3); };
    const walk = (x, y) => x >= 0 && y >= 0 && x < C && y < R && map[y][x] === 0;
    const foeAt = (x, y) => foes.find((f) => f.x === x && f.y === y && f.hp > 0);
    const float = (x, y, txt, col) => floats.push({ x: x * T + T / 2, y: y * T, txt, col, life: 0.9 });
    const burst = (x, y, col, n = 12) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 30 + Math.random() * 90; parts.push({ x: x * T + T / 2, y: y * T + T / 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, col }); } };

    function genFloor() {
      floor++;
      map = Array.from({ length: R }, () => Array(C).fill(1));
      seen = Array.from({ length: R }, () => Array(C).fill(false));
      const rooms = [];
      for (let k = 0; k < 400 && rooms.length < 8; k++) {
        const w = ri(4, 8), h = ri(3, 5), x = ri(1, C - w - 1), y = ri(1, R - h - 1);
        if (rooms.some((r) => x <= r.x + r.w && x + w >= r.x && y <= r.y + r.h && y + h >= r.y)) continue;
        rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
      }
      rooms.sort((a, b) => a.cx - b.cx);
      for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) map[y][x] = 0;
      const dig = (a, b) => {
        let { cx: x, cy: y } = a; const horizFirst = Math.random() < 0.5;
        const stepX = () => { while (x !== b.cx) { map[y][x] = 0; x += Math.sign(b.cx - x); } };
        const stepY = () => { while (y !== b.cy) { map[y][x] = 0; y += Math.sign(b.cy - y); } };
        if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); } map[y][x] = 0;
      };
      for (let i = 1; i < rooms.length; i++) dig(rooms[i - 1], rooms[i]);
      if (rooms.length > 3) dig(rooms[0], rooms[ri(2, rooms.length - 1)]);
      const start = rooms[0], end = rooms[rooms.length - 1];
      P.x = P.rx = start.cx; P.y = P.ry = start.cy;
      stairs = { x: end.cx, y: end.cy };
      foes = []; loot = [];
      const freeSpot = (r) => { for (let k = 0; k < 30; k++) { const x = ri(r.x, r.x + r.w - 1), y = ri(r.y, r.y + r.h - 1); if (!foeAt(x, y) && !loot.some((l) => l.x === x && l.y === y) && !(x === stairs.x && y === stairs.y) && !(x === P.x && y === P.y)) return { x, y }; } return null; };
      const kinds = Object.keys(FOES).filter((k) => FOES[k].min <= floor);
      const nFoes = 3 + Math.floor(floor * 1.5);
      for (let i = 0; i < nFoes; i++) {
        const s = freeSpot(rooms[ri(1, rooms.length - 1)]); if (!s) continue;
        const k = kinds[ri(0, kinds.length - 1)], d = FOES[k], hp = d.hp + Math.floor((floor - 1) * 0.6);
        foes.push({ ...s, rx: s.x, ry: s.y, k, d, hp, max: hp, atk: d.atk + Math.floor((floor - 1) / 3), hit: 0, bump: null, tick: 0 });
      }
      for (const r of rooms.slice(1)) {
        if (Math.random() < 0.7) { const s = freeSpot(r); if (s) loot.push({ ...s, k: 'gold', v: ri(5, 12) * floor }); }
        if (Math.random() < 0.22) { const s = freeSpot(r); if (s) loot.push({ ...s, k: 'potion' }); }
      }
      if (Math.random() < 0.65 || floor === 1) { const s = freeSpot(rooms[ri(1, rooms.length - 1)]); if (s) loot.push({ ...s, k: 'chest' }); }
      fade = 1; computeVis();
      say(`Floor ${floor}. ${floor === 1 ? 'Find the stairs ▼' : 'It gets darker…'}`, '#c77dff');
    }
    function computeVis() {
      vis = Array.from({ length: R }, () => Array(C).fill(false));
      const rad = 6;
      for (let y = Math.max(0, P.y - rad); y <= Math.min(R - 1, P.y + rad); y++) for (let x = Math.max(0, P.x - rad); x <= Math.min(C - 1, P.x + rad); x++) {
        if ((x - P.x) ** 2 + (y - P.y) ** 2 > rad * rad + 2) continue;
        const n = Math.max(Math.abs(x - P.x), Math.abs(y - P.y)); let ok = true;
        for (let i = 1; i < n; i++) { const sx = Math.round(P.x + (x - P.x) * i / n), sy = Math.round(P.y + (y - P.y) * i / n); if (map[sy][sx]) { ok = false; break; } }
        if (ok) { vis[y][x] = true; seen[y][x] = true; }
      }
    }
    function attack(a, b, isPlayer) {
      const dmg = Math.max(1, a.atk + (Math.random() < 0.3 ? 1 : 0) - (b.def || 0));
      b.hp -= dmg; b.hit = 0.2; a.bump = { dx: b.x - a.x, dy: b.y - a.y, t: 0.15 };
      float(b.x, b.y, `-${dmg}`, isPlayer ? '#ffd166' : '#ff595e');
      if (isPlayer) {
        api.sfx('hit', { pitch: 1.3 }); shake = 3;
        if (b.hp <= 0) { P.kills++; api.addScore(15 * floor * b.d.xp); burst(b.x, b.y, b.d.col, 16); say(`You defeat the ${b.d.name}.`, '#7ae582'); api.sfx('pop', { pitch: 0.6 }); }
      } else {
        api.sfx('hit', { pitch: 0.7 }); shake = 7; say(`The ${a.d.name} hits you for ${dmg}.`, '#ff595e');
        if (P.hp <= 0 && !dead) { dead = true; endT = 2.6; burst(P.x, P.y, '#4cc9f0', 30); api.sfx('explode', { pitch: 0.7 }); say(`You fell on floor ${floor}.`, '#ff595e'); }
      }
    }
    function foesTurn() {
      for (const f of foes) {
        if (f.hp <= 0 || dead) continue;
        f.tick++;
        if (f.d.slow && f.tick % 2) continue;
        const dist = Math.abs(f.x - P.x) + Math.abs(f.y - P.y);
        if (dist === 1) { attack(f, P, false); continue; }
        let opts = Object.values(DIRS).map(([dx, dy]) => ({ x: f.x + dx, y: f.y + dy })).filter((o) => walk(o.x, o.y) && !foeAt(o.x, o.y) && !(o.x === P.x && o.y === P.y));
        if (!opts.length) continue;
        let to;
        if (vis[f.y][f.x] && dist < 9 && !(f.d.erratic && Math.random() < 0.4)) { opts.sort((a, b) => (Math.abs(a.x - P.x) + Math.abs(a.y - P.y)) - (Math.abs(b.x - P.x) + Math.abs(b.y - P.y))); to = opts[0]; if (Math.abs(to.x - P.x) + Math.abs(to.y - P.y) >= dist && !f.d.erratic) to = null; }
        else if (Math.random() < 0.35) to = opts[ri(0, opts.length - 1)];
        if (to) { f.x = to.x; f.y = to.y; }
      }
      foes = foes.filter((f) => f.hp > 0);
    }
    function act(dx, dy) {
      if (dead || fade > 0.6) return;
      turnCD = 0.09;
      if (dx || dy) {
        const nx = P.x + dx, ny = P.y + dy, f = foeAt(nx, ny);
        if (f) attack(P, f, true);
        else if (walk(nx, ny)) {
          P.x = nx; P.y = ny; api.sfx('step', { volume: 0.5 });
          const li = loot.findIndex((l) => l.x === nx && l.y === ny);
          if (li >= 0) {
            const l = loot.splice(li, 1)[0];
            if (l.k === 'gold') { P.gold += l.v; api.addScore(l.v); api.sfx('coin'); float(nx, ny, `+${l.v}g`, '#ffd166'); }
            if (l.k === 'potion') { const h = Math.min(P.max - P.hp, 5); P.hp += h; api.sfx('slurp'); float(nx, ny, `+${h} HP`, '#ff8fab'); say('You drink a potion. Refreshing!', '#ff8fab'); }
            if (l.k === 'chest') {
              const r = Math.random(); api.sfx('reveal'); burst(nx, ny, '#ffd166', 18);
              if (r < 0.4) { P.atk++; say('Chest: a sharper sword! ATK +1', '#ffd166'); }
              else if (r < 0.7) { P.def++; say('Chest: sturdy armor! DEF +1', '#ffd166'); }
              else { P.max += 3; P.hp += 3; say('Chest: heart crystal! Max HP +3', '#ffd166'); }
              api.addScore(50 * floor);
            }
          }
          if (nx === stairs.x && ny === stairs.y) { api.addScore(100 * floor); api.sfx('whoosh', { pitch: 0.6 }); api.sfx('chime'); P.hp = Math.min(P.max, P.hp + 2); genFloor(); return; }
        } else { api.sfx('thud', { volume: 0.3, pitch: 1.5 }); return; }
      }
      computeVis();
      foesTurn();
    }

    genFloor();
    return {
      get debugState() { return { x: P.x, y: P.y, vis: vis.map((r, y) => r.map((v, x) => (map[y][x] ? (v ? '#' : '+') : v ? '.' : seen[y][x] ? ',' : ' ')).join('')).join('\n') }; },
      update(dt, input) {
        t += dt; shake = Math.max(0, shake - dt * 30); fade = Math.max(0, fade - dt * 2); turnCD -= dt;
        for (const e of [P, ...foes]) {
          e.rx += (e.x - e.rx) * Math.min(1, dt * 18); e.ry += (e.y - e.ry) * Math.min(1, dt * 18); e.hit = Math.max(0, e.hit - dt);
          if (e.bump) { e.bump.t -= dt; if (e.bump.t <= 0) e.bump = null; }
        }
        for (const f of floats) { f.y -= 26 * dt; f.life -= dt; }
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3; p.life -= dt; }
        floats = floats.filter((f) => f.life > 0); parts = parts.filter((p) => p.life > 0);
        for (const l of log) l.t += dt;
        if (dead) { endT -= dt; if (endT <= 0) { endT = 99; api.gameOver(); } return; }
        let k = null;
        for (const d of Object.keys(DIRS)) if (input.pressed.has(d)) k = d;
        if (k) { holdK = k; holdT = 0.24; if (turnCD <= 0) act(...DIRS[k]); }
        else if (holdK && input[holdK]) { holdT -= dt; if (holdT <= 0 && turnCD <= 0) { holdT = 0.13; act(...DIRS[holdK]); } }
        else holdK = null;
        if (input.pressed.has('a')) { say('You wait…', '#999'); act(0, 0); }
      },
      draw(ctx) {
        ctx.fillStyle = '#07060c'; ctx.fillRect(0, 0, W, H);
        ctx.save();
        if (shake) ctx.translate(api.rand(-shake, shake) * 0.5, api.rand(-shake, shake) * 0.5);
        for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
          if (!seen[y][x]) continue;
          const px = x * T, py = y * T;
          if (map[y][x]) {
            ctx.fillStyle = '#5a5488'; ctx.fillRect(px, py, T, T);
            if (y + 1 < R && !map[y + 1][x]) { ctx.fillStyle = '#8780bd'; ctx.fillRect(px, py + T - 6, T, 6); }
            ctx.fillStyle = '#48436f'; ctx.fillRect(px + ((y % 2) ? 10 : 0), py + 6, 1, 6);
          } else {
            ctx.fillStyle = (x + y) % 2 ? '#34304f' : '#393455'; ctx.fillRect(px, py, T, T);
            if ((x * 7 + y * 13) % 11 === 0) { ctx.fillStyle = '#433d66'; ctx.fillRect(px + 5, py + 7, 4, 3); }
          }
        }
        const drawAt = (x, y) => seen[y][x];
        if (drawAt(stairs.x, stairs.y)) {
          const px = stairs.x * T, py = stairs.y * T;
          ctx.fillStyle = '#000'; ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
          ctx.fillStyle = '#6c757d'; for (let i = 0; i < 4; i++) ctx.fillRect(px + 3 + i * 2, py + 4 + i * 4, T - 6 - i * 4, 2);
          ctx.fillStyle = `rgba(199,125,255,${0.3 + 0.2 * Math.sin(t * 4)})`; ctx.fillRect(px, py, T, T);
        }
        for (const l of loot) {
          if (!vis[l.y][l.x]) continue;
          const cx = l.x * T + T / 2, cy = l.y * T + T / 2 + Math.sin(t * 3 + l.x) * 1.5;
          if (l.k === 'gold') { ctx.fillStyle = '#ffd166'; for (const [ox, oy] of [[-3, 2], [3, 2], [0, -2]]) { ctx.beginPath(); ctx.arc(cx + ox, cy + oy, 3.5, 0, TAU); ctx.fill(); } }
          if (l.k === 'potion') { ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(cx, cy + 2, 5, 0, TAU); ctx.fill(); ctx.fillStyle = '#ddd'; ctx.fillRect(cx - 2, cy - 7, 4, 5); }
          if (l.k === 'chest') { ctx.fillStyle = '#9c6644'; ctx.fillRect(cx - 7, cy - 5, 14, 11); ctx.fillStyle = '#ffd166'; ctx.fillRect(cx - 7, cy - 1, 14, 2); ctx.fillRect(cx - 1, cy - 2, 3, 4); }
        }
        const ent = (e, fn) => { const b = e.bump ? Math.sin((e.bump.t / 0.15) * Math.PI) * 6 : 0; fn(e.rx * T + T / 2 + (e.bump ? e.bump.dx * b : 0), e.ry * T + T / 2 + (e.bump ? e.bump.dy * b : 0)); };
        for (const f of foes) {
          if (!vis[f.y][f.x]) continue;
          ent(f, (x, y) => {
            const c = f.hit > 0 ? '#fff' : f.d.col;
            ctx.fillStyle = c;
            if (f.k === 'slime') { ctx.beginPath(); ctx.ellipse(x, y + 3, 8, 6 + Math.sin(t * 6) * 1, 0, Math.PI, 0); ctx.lineTo(x + 8, y + 7); ctx.lineTo(x - 8, y + 7); ctx.fill(); }
            else if (f.k === 'bat') { const fl = Math.sin(t * 20) * 4; ctx.beginPath(); ctx.moveTo(x - 9, y - fl); ctx.lineTo(x, y + 2); ctx.lineTo(x + 9, y - fl); ctx.lineTo(x, y - 4); ctx.fill(); }
            else if (f.k === 'rat') { ctx.beginPath(); ctx.ellipse(x, y + 3, 7, 4.5, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 7, y + 3); ctx.lineTo(x - 11, y - 1); ctx.stroke(); }
            else { ctx.beginPath(); ctx.arc(x, y - 3, f.k === 'orc' ? 6 : 5, 0, TAU); ctx.fill(); ctx.fillRect(x - 5, y + 1, 10, 8); }
            ctx.fillStyle = '#111'; ctx.fillRect(x - 3, y - 3, 2, 2); ctx.fillRect(x + 1, y - 3, 2, 2);
            if (f.hp < f.max) { ctx.fillStyle = '#000a'; ctx.fillRect(x - 8, y - 12, 16, 3); ctx.fillStyle = '#ff595e'; ctx.fillRect(x - 8, y - 12, 16 * f.hp / f.max, 3); }
          });
        }
        if (!dead) ent(P, (x, y) => {
          ctx.fillStyle = 'rgba(76,201,240,0.15)'; ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU); ctx.fill();
          ctx.fillStyle = P.hit > 0 ? '#ff595e' : '#4cc9f0'; ctx.fillRect(x - 5, y, 10, 8);
          ctx.fillStyle = '#ffd6a5'; ctx.beginPath(); ctx.arc(x, y - 4, 5, 0, TAU); ctx.fill();
          ctx.fillStyle = '#adb5bd'; ctx.fillRect(x - 6, y - 10, 12, 4);
          ctx.strokeStyle = '#e9ecef'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 7, y + 6); ctx.lineTo(x + 9, y - 6); ctx.stroke();
        });
        // fog: dim remembered-but-not-visible tiles, plus a soft light around the hero
        for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) if (seen[y][x] && !vis[y][x]) { ctx.fillStyle = 'rgba(7,6,12,0.5)'; ctx.fillRect(x * T, y * T, T, T); }
        const lg = ctx.createRadialGradient(P.rx * T + T / 2, P.ry * T + T / 2, 20, P.rx * T + T / 2, P.ry * T + T / 2, 140);
        lg.addColorStop(0, 'rgba(255,190,110,0.12)'); lg.addColorStop(1, 'rgba(0,0,0,0.12)'); ctx.fillStyle = lg; ctx.fillRect(0, 0, W, R * T);
        for (const p of parts) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.col; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
        ctx.globalAlpha = 1; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const f of floats) { ctx.globalAlpha = Math.min(1, f.life * 2); ctx.fillStyle = '#000'; ctx.fillText(f.txt, f.x + 1, f.y + 1); ctx.fillStyle = f.col; ctx.fillText(f.txt, f.x, f.y); }
        ctx.globalAlpha = 1;
        ctx.restore();
        // HUD
        const HY = R * T;
        ctx.fillStyle = '#100e1a'; ctx.fillRect(0, HY, W, H - HY); ctx.fillStyle = '#3d405b'; ctx.fillRect(0, HY, W, 2);
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = 'bold 13px monospace';
        ctx.fillStyle = '#ff595e'; ctx.fillText('HP', 12, HY + 18);
        ctx.fillStyle = '#2b2d42'; ctx.fillRect(36, HY + 11, 120, 14); ctx.fillStyle = P.hp / P.max < 0.3 ? '#ff595e' : '#e5383b'; ctx.fillRect(36, HY + 11, 120 * Math.max(0, P.hp) / P.max, 14);
        ctx.fillStyle = '#fff'; ctx.fillText(`${Math.max(0, P.hp)}/${P.max}`, 70, HY + 19);
        ctx.fillStyle = '#ffd166'; ctx.fillText(`ATK ${P.atk}`, 170, HY + 18); ctx.fillStyle = '#4cc9f0'; ctx.fillText(`DEF ${P.def}`, 240, HY + 18);
        ctx.fillStyle = '#ffd166'; ctx.fillText(`GOLD ${P.gold}`, 310, HY + 18); ctx.fillStyle = '#c77dff'; ctx.fillText(`FLOOR ${floor}`, 410, HY + 18); ctx.fillStyle = '#adb5bd'; ctx.fillText(`KILLS ${P.kills}`, 510, HY + 18);
        ctx.font = '12px monospace';
        log.slice(0, 1).forEach((l) => { ctx.globalAlpha = Math.max(0.5, 1 - l.t * 0.2); ctx.fillStyle = l.col; ctx.fillText(l.m, 12, HY + 42); });
        ctx.globalAlpha = 1;
        if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, HY); ctx.fillStyle = `rgba(199,125,255,${fade})`; ctx.font = 'bold 30px monospace'; ctx.textAlign = 'center'; ctx.fillText(`FLOOR ${floor}`, W / 2, HY / 2); }
        if (dead) { ctx.fillStyle = `rgba(40,0,0,${Math.min(0.7, (2.6 - endT) * 0.5)})`; ctx.fillRect(0, 0, W, HY); ctx.textAlign = 'center'; ctx.font = 'bold 32px monospace'; ctx.fillStyle = '#ff595e'; ctx.fillText('YOU DIED', W / 2, HY / 2 - 14); ctx.font = '15px monospace'; ctx.fillStyle = '#ddd'; ctx.fillText(`Floor ${floor} · ${P.kills} kills · ${P.gold} gold`, W / 2, HY / 2 + 18); }
      },
    };
  },
});
