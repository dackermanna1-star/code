// Block Drop — falling-block puzzle (bundled with the Nova Box).
import { defineGame } from './index.js';

const SHAPES = [
  [[1, 1, 1, 1]], [[1, 1], [1, 1]], [[0, 1, 0], [1, 1, 1]], [[1, 0, 0], [1, 1, 1]], [[0, 0, 1], [1, 1, 1]], [[1, 1, 0], [0, 1, 1]], [[0, 1, 1], [1, 1, 0]],
];
const COLORS = ['#4cc9f0', '#ffd166', '#c77dff', '#f8961e', '#4361ee', '#ef476f', '#06d6a0'];

defineGame({
  id: 'block_drop', title: 'Block Drop', genre: 'Puzzle', icon: '🧱', color: '#4361ee', bundled: true,
  desc: 'Stack falling blocks and clear lines. Classic, calming, endless.',
  help: '← → move · ↑ / Space rotate · ↓ soft drop',
  create(api) {
    const C = 10, R = 20, S = 18;
    const grid = Array.from({ length: R }, () => Array(C).fill(0));
    let piece, px, py, ci, t = 0, over = false, lines = 0;
    api.music('chip');
    const spawn = () => { ci = Math.floor(Math.random() * SHAPES.length); piece = SHAPES[ci].map((r) => [...r]); px = Math.floor((C - piece[0].length) / 2); py = 0; if (hit(piece, px, py)) { over = true; api.sfx('explode'); setTimeout(() => api.gameOver(), 600); } };
    const hit = (p, x, y) => p.some((row, j) => row.some((v, i) => v && (x + i < 0 || x + i >= C || y + j >= R || (y + j >= 0 && grid[y + j][x + i]))));
    const rotate = (p) => p[0].map((_, i) => p.map((r) => r[i]).reverse());
    const lock = () => {
      piece.forEach((row, j) => row.forEach((v, i) => { if (v && py + j >= 0) grid[py + j][px + i] = ci + 1; }));
      let cleared = 0;
      for (let y = R - 1; y >= 0; y--) if (grid[y].every(Boolean)) { grid.splice(y, 1); grid.unshift(Array(C).fill(0)); cleared++; y++; }
      if (cleared) { lines += cleared; api.addScore([0, 100, 300, 500, 800][cleared]); api.sfx('success'); } else api.sfx('hit', { pitch: 1.5 });
      spawn();
    };
    spawn();
    return {
      update(dt, input) {
        if (over) return;
        if (input.pressed.has('left') && !hit(piece, px - 1, py)) { px--; api.sfx('blip', { pitch: 0.8 }); }
        if (input.pressed.has('right') && !hit(piece, px + 1, py)) { px++; api.sfx('blip', { pitch: 0.8 }); }
        if (input.pressed.has('up') || input.pressed.has('a')) { const r = rotate(piece); if (!hit(r, px, py)) { piece = r; api.sfx('blip', { pitch: 1.3 }); } else if (!hit(r, px - 1, py)) { piece = r; px--; } else if (!hit(r, px + 1, py)) { piece = r; px++; } }
        t += dt * (input.down ? 12 : 1 + lines * 0.08);
        if (t > 0.6) { t = 0; if (hit(piece, px, py + 1)) lock(); else { py++; if (input.down) api.addScore(1); } }
      },
      draw(ctx, W, H) {
        ctx.fillStyle = '#0d1b2a'; ctx.fillRect(0, 0, W, H);
        const ox = (W - C * S) / 2, oy = (H - R * S) / 2;
        ctx.fillStyle = '#1b263b'; ctx.fillRect(ox - 4, oy - 4, C * S + 8, R * S + 8);
        const cell = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x * S + 1, oy + y * S + 1, S - 2, S - 2); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(ox + x * S + 1, oy + y * S + 1, S - 2, 4); };
        grid.forEach((row, y) => row.forEach((v, x) => v && cell(x, y, COLORS[v - 1])));
        // ghost
        let gy = py; while (!hit(piece, px, gy + 1)) gy++;
        ctx.globalAlpha = 0.25; piece.forEach((row, j) => row.forEach((v, i) => v && cell(px + i, gy + j, COLORS[ci]))); ctx.globalAlpha = 1;
        piece.forEach((row, j) => row.forEach((v, i) => v && cell(px + i, py + j, COLORS[ci])));
        ctx.fillStyle = '#e0e1dd'; ctx.font = 'bold 16px monospace'; ctx.fillText(`LINES ${lines}`, ox + C * S + 24, oy + 30);
      },
    };
  },
});
