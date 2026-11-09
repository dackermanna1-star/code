// Minimap: a rotating, forward-up radar of the cells the player has explored. Walls are drawn from
// the level's colliders into an off-screen layout once per level; cells are revealed into a second
// canvas as the player sees them. Enemies show only while in sight (fading when lost), unsuppressed
// gunfire leaves a short-lived ping, dropped weapons are marked.
class Minimap {
  constructor(game) {
    this.game = game;
    this.size = 176;
    this.range = 15; // metres from centre to rim
    this.pings = [];
    this.seen = new Map(); // ai -> { x, z, t }
    this.t = 0;
    game.hooks.push(this);
  }

  ensureDom() {
    if (this.canvas) return;
    const wrap = mkEl('div', 'mm', this.game.hud.root);
    const c = mkEl('canvas', '', wrap);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = Math.round(this.size * dpr);
    c.style.width = c.style.height = this.size + 'px';
    this.dpr = dpr;
    mkEl('i', 'n', wrap, 'N');
    this.north = wrap.querySelector('.n');
    this.wrap = wrap;
    this.canvas = c;
    this.ctx = c.getContext('2d');
  }

  onLevel(level) {
    const L = level, s = (this.px = 7); // pixels per metre in the layout canvases
    const W = Math.ceil(L.size * s) + 2;
    const layout = document.createElement('canvas');
    layout.width = layout.height = W;
    const g = layout.getContext('2d');
    const X = (x) => (x + L.half) * s, Z = (z) => (z + L.half) * s;
    // floor of every cell, then props, then walls on top
    g.fillStyle = 'rgba(214, 196, 140, 0.16)';
    g.fillRect(0, 0, W, W);
    g.fillStyle = 'rgba(214, 196, 140, 0.30)';
    for (const p of L.props) { const b = p.box; g.fillRect(X(b.min.x), Z(b.min.z), (b.max.x - b.min.x) * s, (b.max.z - b.min.z) * s); }
    g.fillStyle = 'rgba(244, 236, 212, 0.95)';
    for (const b of L.boxes) {
      if (b.kind === 'ceiling' || b.kind === 'prop' || b.kind === 'lintel') continue;
      const w = Math.max(1.6, (b.max.x - b.min.x) * s), h = Math.max(1.6, (b.max.z - b.min.z) * s);
      g.fillRect(X(b.min.x), Z(b.min.z), w, h);
    }
    this.layout = layout;
    this.revealed = document.createElement('canvas');
    this.revealed.width = this.revealed.height = W;
    this.rctx = this.revealed.getContext('2d');
    this.explored = new Uint8Array(L.n * L.n);
    this.pings.length = 0;
    this.seen.clear();
    this.level = L;
  }

  // reveal a cell (with a margin so the walls around it are included)
  reveal(c) {
    if (this.explored[c]) return;
    this.explored[c] = 1;
    const L = this.level, s = this.px, n = L.n;
    const i = c % n, j = (c / n) | 0, m = L.wallT * s + 2;
    const x0 = i * L.cell * s - m, y0 = j * L.cell * s - m, w = L.cell * s + 2 * m;
    this.rctx.drawImage(this.layout, x0, y0, w, w, x0, y0, w, w);
  }

  onEnemyFire(ai, muzzle) {
    if (ai.gun && ai.gun.suppressed) return;
    this.pings.push({ x: muzzle.x, z: muzzle.z, t: 0 });
    if (this.pings.length > 24) this.pings.shift();
  }

  frame(dt) {
    const g = this.game;
    this.t += dt;
    if (!this.level || !g.hud) return;
    this.ensureDom();
    const on = g.settings.minimap !== false && g.state === 'play';
    this.wrap.style.display = on ? '' : 'none';
    if (!on) return;
    const L = this.level, P = g.player, n = L.n;
    // explore: the player's cell, and neighbouring cells in plain sight
    const eye = P.eye(new I());
    const ci = Math.floor((P.pos.x + L.half) / L.cell), cj = Math.floor((P.pos.z + L.half) / L.cell);
    if ((this.t * 10 | 0) !== this.lastReveal) {
      this.lastReveal = this.t * 10 | 0;
      for (let j = cj - 3; j <= cj + 3; j++)
        for (let i = ci - 3; i <= ci + 3; i++) {
          if (i < 0 || j < 0 || i >= n || j >= n) continue;
          const c = j * n + i;
          if (this.explored[c]) continue;
          const near = Math.abs(i - ci) <= 0 && Math.abs(j - cj) <= 0;
          if (near || L.visible(eye, { x: L.cx(i), y: 1.2, z: L.cx(j) })) this.reveal(c);
        }
    }
    for (const p of this.pings) p.t += dt;
    this.pings = this.pings.filter((p) => p.t < 2.2);
    // enemies in sight are tracked; lost ones fade out over two seconds
    for (const ai of g.enemies.list) {
      if (ai.downed) { this.seen.delete(ai); continue; }
      const h = ai.headPos;
      if (h && L.visible(eye, h)) this.seen.set(ai, { x: ai.pos.x, z: ai.pos.z, t: 0 });
      else if (this.seen.has(ai)) this.seen.get(ai).t += dt;
    }
    for (const [ai, s] of this.seen) if (s.t > 2) this.seen.delete(ai);

    // draw
    const ctx = this.ctx, D = this.canvas.width, R = D / 2, k = (R / this.range) * 0.94;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, D, D);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R - 1, 0, TAU); ctx.clip();
    ctx.fillStyle = 'rgba(10, 9, 6, 0.55)';
    ctx.fillRect(0, 0, D, D);
    // world -> minimap: centre on the player, forward up
    ctx.translate(R, R);
    ctx.rotate(P.yaw);
    const sc = k / this.px;
    ctx.scale(sc, sc);
    ctx.translate(-(P.pos.x + L.half) * this.px, -(P.pos.z + L.half) * this.px);
    ctx.drawImage(this.revealed, 0, 0);
    const toMap = (x, z) => [(x + L.half) * this.px, (z + L.half) * this.px];
    const dot = (x, z, r, col) => { const [mx, my] = toMap(x, z); ctx.beginPath(); ctx.arc(mx, my, r / sc, 0, TAU); ctx.fillStyle = col; ctx.fill(); };
    // dropped weapons
    for (const d of g.enemies.drops) { const b = d.obj.body.pos; const [mx, my] = toMap(b.x, b.z); ctx.fillStyle = 'rgba(232, 196, 92, 0.9)'; const r = 2.6 * this.dpr / sc; ctx.fillRect(mx - r, my - r, 2 * r, 2 * r); }
    // gunfire pings
    for (const p of this.pings) {
      const a = 1 - p.t / 2.2, [mx, my] = toMap(p.x, p.z);
      ctx.beginPath(); ctx.arc(mx, my, (4 + p.t * 9) * this.dpr / sc, 0, TAU);
      ctx.strokeStyle = `rgba(255, 90, 60, ${0.75 * a})`; ctx.lineWidth = 1.5 * this.dpr / sc; ctx.stroke();
    }
    // enemies
    for (const [ai, s] of this.seen) {
      const a = s.t > 0 ? clamp(1 - s.t / 2, 0, 1) * 0.6 : 1;
      dot(s.x, s.z, (ai.def && ai.def.boss ? 5 : 3.6) * this.dpr, `rgba(255, 64, 48, ${a})`);
    }
    ctx.restore();
    // the player: a forward-pointing chevron at the centre, with a faint view cone
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const fovH = Math.atan(Math.tan((g.camera.fov * Math.PI) / 360) * g.camera.aspect);
    ctx.beginPath(); ctx.moveTo(R, R); ctx.arc(R, R, R * 0.55, -Math.PI / 2 - fovH, -Math.PI / 2 + fovH); ctx.closePath();
    ctx.fillStyle = 'rgba(255, 246, 214, 0.07)'; ctx.fill();
    const u = 6 * this.dpr;
    ctx.beginPath(); ctx.moveTo(R, R - u); ctx.lineTo(R + u * 0.72, R + u * 0.8); ctx.lineTo(R, R + u * 0.35); ctx.lineTo(R - u * 0.72, R + u * 0.8); ctx.closePath();
    ctx.fillStyle = '#f4ecd4'; ctx.fill();
    // rim
    ctx.beginPath(); ctx.arc(R, R, R - 1.5 * this.dpr, 0, TAU);
    ctx.strokeStyle = 'rgba(244, 236, 212, 0.28)'; ctx.lineWidth = 1.2 * this.dpr; ctx.stroke();
    // north marker rides the rim
    const na = P.yaw - Math.PI / 2; // world -z (north) after the forward-up rotation
    const nr = this.size / 2 - 9;
    this.north.style.transform = `translate(${(Math.cos(na) * nr).toFixed(1)}px, ${(Math.sin(na) * nr).toFixed(1)}px)`;
  }
}
