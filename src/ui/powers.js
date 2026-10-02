// The viewer's toolbox: a palette of powers, pointer handling (mouse and
// touch), and the in-world overlays that go with them (the grab rope, the
// grenade's arc, the shockwave's reach).

import { drawFighter } from '../render/figures.js';

const ICON = {
  watch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3l12 9-5.2 1.2L16 20l-2.4 1-3.1-6.6L6 18z" fill="currentColor"/></svg>',
  grab: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v6.5m0-3a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1.2a6 6 0 0 1-4.6-2.2L3.6 15.4a1.6 1.6 0 0 1 2.3-2.2L8 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  gun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>',
  zap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2L5 13.5h5.5L9 22l9.5-12.5H13z" fill="currentColor"/></svg>',
  grenade: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="11" cy="15" rx="6" ry="6.6" fill="currentColor"/><rect x="8.6" y="5.6" width="5" height="3.4" rx="0.8" fill="currentColor"/><path d="M13.6 6.4c2.4-.8 4.6.1 5.6 2.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="19.6" cy="9.6" r="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  push: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M7.4 7.4a6.5 6.5 0 0 0 0 9.2M16.6 7.4a6.5 6.5 0 0 1 0 9.2M4.2 4.2a11 11 0 0 0 0 15.6M19.8 4.2a11 11 0 0 1 0 15.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  spawn: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="5.5" r="3" fill="currentColor"/><path d="M9 9v7m0 0l-3.5 5M9 16l3.5 5M9 11.5l-4 2.5M9 11.5l4 2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18 6v6M15 9h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

export const TOOLS = [
  { id: 'watch', key: 'q', label: 'Watch', hint: 'Just watch the fight' },
  { id: 'grab', key: 'g', label: 'Grab', hint: 'Drag a stickman, then fling them into the floor, a wall or the crowd' },
  { id: 'gun', key: 'f', label: 'Gun', hint: 'Click to shoot. Hold for automatic fire' },
  { id: 'zap', key: 'z', label: 'Lightning', hint: 'Click to call down lightning. It jumps between bodies' },
  { id: 'grenade', key: 'b', label: 'Grenade', hint: 'Drag to throw a grenade, or click to drop one' },
  { id: 'push', key: 'x', label: 'Shockwave', hint: 'Click to blast everyone away' },
  { id: 'spawn', key: 'e', label: 'Spawn', hint: 'Click to drop in a new enemy' },
];

const CROSSHAIR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Cg fill='none' stroke='%23000' stroke-width='4' opacity='.55'%3E%3Ccircle cx='16' cy='16' r='9'/%3E%3Cpath d='M16 2v8M16 22v8M2 16h8M22 16h8'/%3E%3C/g%3E%3Cg fill='none' stroke='%23ff3b2f' stroke-width='2'%3E%3Ccircle cx='16' cy='16' r='9'/%3E%3Cpath d='M16 2v8M16 22v8M2 16h8M22 16h8'/%3E%3C/g%3E%3Ccircle cx='16' cy='16' r='1.6' fill='%23ff3b2f'/%3E%3C/svg%3E\") 16 16, crosshair";

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export class PowerController {
  constructor(root, canvas, hooks) {
    this.root = root;
    this.canvas = canvas;
    this.hooks = hooks; // { sim(), cam, renderer, paused(), settings }
    this.tool = 'watch';
    this.ptr = { sx: 0, sy: 0, wx: 0, wy: 0, down: false, id: null, inside: false, touch: false };
    this.aim = null; // grenade throw: press point
    this.fireT = 0;
    this.cool = 0;
    this.hover = null;
    this.hoverT = 0;
    this.hintT = 0;
    this.wasDragging = false;
    this.build();
    this.bind();
  }

  build() {
    this.palette = el(`
      <nav class="powers" aria-label="Your powers">
        ${TOOLS.map((t) => `<button class="pw-btn${t.id === 'watch' ? ' on' : ''}" data-tool="${t.id}" title="${t.label} (${t.key.toUpperCase()})" aria-label="${t.label}" aria-pressed="${t.id === 'watch'}">${ICON[t.id]}</button>`).join('')}
      </nav>`);
    this.hintEl = el('<div class="pw-hint" hidden><strong></strong><span></span></div>');
    this.root.append(this.palette, this.hintEl);
    for (const b of this.palette.querySelectorAll('.pw-btn')) {
      b.addEventListener('click', () => this.setTool(b.dataset.tool));
    }
  }

  setTool(id) {
    if (this.tool === id && id !== 'watch') id = 'watch';
    if (this.dragging) this.endDrag();
    this.tool = id;
    this.aim = null;
    for (const b of this.palette.querySelectorAll('.pw-btn')) {
      const on = b.dataset.tool === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    const t = TOOLS.find((x) => x.id === id);
    this.hintEl.querySelector('strong').textContent = t.label;
    this.hintEl.querySelector('span').textContent = t.hint;
    this.hintEl.hidden = false;
    this.hintT = 3.2;
    this.applyCursor();
  }

  // Keyboard shortcuts; returns true when the key was a tool key.
  key(k) {
    if (k === 'escape' && this.tool !== 'watch') {
      this.setTool('watch');
      return true;
    }
    const t = TOOLS.find((x) => x.key === k);
    if (!t) return false;
    this.setTool(t.id);
    return true;
  }

  applyCursor() {
    const c = this.canvas;
    const free = this.hooks.settings.cameraMode === 'free';
    if (this.tool === 'watch') c.style.cursor = free ? 'grab' : '';
    else if (this.tool === 'grab') c.style.cursor = this.dragging ? 'grabbing' : 'grab';
    else if (this.tool === 'spawn') c.style.cursor = 'copy';
    else c.style.cursor = CROSSHAIR;
  }

  get active() {
    return this.tool !== 'watch';
  }

  get dragging() {
    const sim = this.hooks.sim();
    return !!(sim && sim.powers.drag);
  }

  // ------------------------------------------------------------- input
  toLocal(e) {
    const r = this.canvas.getBoundingClientRect();
    this.ptr.sx = e.clientX - r.left;
    this.ptr.sy = e.clientY - r.top;
    this.updateWorld();
  }

  updateWorld() {
    const { cam, renderer } = this.hooks;
    const [wx, wy] = cam.screenToWorld(this.ptr.sx, this.ptr.sy, renderer.W, renderer.H);
    this.ptr.wx = wx;
    this.ptr.wy = wy;
  }

  // pick slack: a few screen pixels (more for fingers), in world units
  slack() {
    return (this.ptr.touch ? 14 : 6) / this.hooks.cam.zoom;
  }

  // how far off a grab may land and still catch the nearest joint
  reach() {
    return (this.ptr.touch ? 52 : 32) / this.hooks.cam.zoom;
  }

  bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (!this.active || e.button > 0) return;
      e.preventDefault();
      this.ptr.touch = e.pointerType === 'touch';
      this.toLocal(e);
      this.ptr.down = true;
      this.ptr.id = e.pointerId;
      try {
        c.setPointerCapture(e.pointerId);
      } catch (err) {
        /* capture unavailable */
      }
      this.press();
    });
    c.addEventListener('pointermove', (e) => {
      this.ptr.inside = true;
      this.ptr.touch = e.pointerType === 'touch';
      this.toLocal(e);
    });
    const up = (e) => {
      if (!this.ptr.down || (this.ptr.id !== null && e.pointerId !== this.ptr.id)) return;
      this.toLocal(e);
      this.ptr.down = false;
      this.releasePress(e.type === 'pointercancel');
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => {
      if (!this.ptr.down) this.ptr.inside = false;
    });
    c.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
    });
  }

  press() {
    const sim = this.hooks.sim();
    if (!sim) return;
    const P = sim.powers;
    const { wx, wy } = this.ptr;
    switch (this.tool) {
      case 'grab':
        if (P.grab(wx, wy, this.slack(), this.reach())) this.applyCursor();
        break;
      case 'gun':
        this.fire(0);
        this.fireT = 0.14;
        break;
      case 'zap':
        if (this.cool <= 0) {
          P.lightning(wx, wy);
          this.cool = 0.3;
        }
        break;
      case 'grenade':
        this.aim = { sx: this.ptr.sx, sy: this.ptr.sy, wx, wy };
        break;
      case 'push':
        if (this.cool <= 0) {
          P.push(wx, wy);
          this.cool = 0.35;
        }
        break;
      case 'spawn':
        if (this.cool <= 0) {
          P.spawn(wx, wy);
          this.cool = 0.18;
        }
        break;
    }
  }

  releasePress(cancel) {
    const sim = this.hooks.sim();
    if (!sim) return;
    if (this.tool === 'grab') this.endDrag();
    if (this.tool === 'grenade' && this.aim) {
      const v = this.throwVelocity();
      if (!cancel) sim.powers.grenade(this.aim.wx, this.aim.wy, v[0], v[1]);
      this.aim = null;
    }
  }

  endDrag() {
    const sim = this.hooks.sim();
    if (sim) sim.powers.release();
    this.applyCursor();
  }

  // Drag direction is the throw direction; a click just drops it.
  throwVelocity() {
    const a = this.aim;
    const cam = this.hooks.cam;
    const dx = (this.ptr.sx - a.sx) / cam.zoom;
    const dy = (this.ptr.sy - a.sy) / cam.zoom;
    const l = Math.hypot(dx, dy);
    if (l * cam.zoom < 10) return [0, -60];
    const sp = Math.min(1500, l * 5.2);
    return [(dx / l) * sp, (dy / l) * sp];
  }

  // The shot comes from below the frame on the side away from the target,
  // so bodies are thrown up and away from the shooter.
  fire(spreadPx) {
    const sim = this.hooks.sim();
    const { cam, renderer } = this.hooks;
    const W = renderer.W;
    const H = renderer.H;
    const left = this.ptr.sx > W / 2;
    const [ox, oy] = cam.screenToWorld(left ? -60 : W + 60, H + 40, W, H);
    // automatic fire wanders a little
    const sp = spreadPx / cam.zoom;
    const x = this.ptr.wx + (Math.random() - 0.5) * 2 * sp;
    const y = this.ptr.wy + (Math.random() - 0.5) * 2 * sp;
    sim.powers.shoot(ox, oy, x, y, this.slack());
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const sim = this.hooks.sim();
    if (!sim) return;
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hintEl.hidden = true;
    }
    if (this.cool > 0) this.cool -= dt;
    // the world moves under a still pointer: keep its world position fresh
    this.updateWorld();
    const P = sim.powers;
    if (P.drag) {
      if (!this.ptr.down || this.tool !== 'grab') this.endDrag();
      else P.moveDrag(this.ptr.wx, this.ptr.wy);
    }
    if (this.tool === 'gun' && this.ptr.down && !this.hooks.paused()) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fire(5);
        this.fireT = 0.12;
      }
    }
    // what is under the pointer (for the highlight)
    this.hoverT -= dt;
    if (this.hoverT <= 0) {
      this.hoverT = 0.05;
      this.hover = null;
      if (this.ptr.inside && !P.drag && (this.tool === 'grab' || this.tool === 'gun' || this.tool === 'zap')) {
        const reach = this.tool === 'grab' ? this.reach() : 0;
        const hit = P.pick(this.ptr.wx, this.ptr.wy, this.slack() + 4 / this.hooks.cam.zoom, { reach });
        if (hit) this.hover = hit;
      }
    }
    const dragging = !!P.drag;
    if (dragging !== this.wasDragging) {
      // the body can slip away on its own (a new battle, say)
      this.wasDragging = dragging;
      this.applyCursor();
    }
    this.hooks.cam.hold = dragging;
  }

  // ---------------------------------------------------------- overlays
  drawOverlay(ctx, view, alpha, t) {
    const sim = this.hooks.sim();
    if (!sim || this.tool === 'watch') return;
    const P = sim.powers;
    const z = this.hooks.cam.zoom;
    const px = this.ptr.wx;
    const py = this.ptr.wy;
    ctx.save();
    ctx.lineCap = 'round';
    if (this.hover && !this.hover.f.removed) {
      const rim = this.tool === 'grab' ? 'rgba(255,178,31,0.9)' : 'rgba(255,70,50,0.8)';
      drawFighter(ctx, this.hover.f, alpha, { t, trails: false, rim, gore: true });
    }
    if (P.drag) {
      const d = P.drag;
      const p = d.f.rag.p[d.idx];
      const x = p.ox + (p.x - p.ox) * alpha;
      const y = p.oy + (p.y - p.oy) * alpha;
      // light on dark, so the rope reads on white walls and night skies alike
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(px, py);
      ctx.strokeStyle = 'rgba(16,16,20,0.45)';
      ctx.lineWidth = 4.5 / z;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2 / z;
      ctx.setLineDash([6 / z, 5 / z]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(px, py, 5 / z, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(16,16,20,0.6)';
      ctx.lineWidth = 1.5 / z;
      ctx.stroke();
    }
    if (this.tool === 'grenade' && this.aim) this.drawArc(ctx, sim, z);
    if (this.tool === 'push' && this.ptr.inside) {
      ctx.beginPath();
      ctx.arc(px, py, 300, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(16,16,20,0.18)';
      ctx.lineWidth = 4 / z;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2 / z;
      ctx.setLineDash([10 / z, 8 / z]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (this.tool === 'spawn' && this.ptr.inside) {
      const g = sim.level.groundUnder(px - 2, px + 2, py, 1200, true, false);
      ctx.strokeStyle = 'rgba(255,178,31,0.7)';
      ctx.lineWidth = 2 / z;
      ctx.beginPath();
      ctx.arc(px, py, 10 / z, 0, Math.PI * 2);
      if (g) {
        ctx.moveTo(px, py + 10 / z);
        ctx.lineTo(px, g.y);
        ctx.moveTo(px - 14, g.y);
        ctx.lineTo(px + 14, g.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Dotted flight path of the grenade about to be thrown.
  drawArc(ctx, sim, z) {
    const [vx0, vy0] = this.throwVelocity();
    let x = this.aim.wx;
    let y = this.aim.wy;
    let vx = vx0;
    let vy = vy0;
    const g = sim.gravity;
    const dt = 0.035;
    ctx.fillStyle = 'rgba(255,178,31,0.9)';
    for (let i = 0; i < 44; i++) {
      vy += g * dt;
      x += vx * dt;
      y += vy * dt;
      if (sim.level.isSolidAt(x, y)) break;
      if (i % 2 === 0) {
        ctx.beginPath();
        ctx.arc(x, y, (5 - i * 0.06) / z, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(255,178,31,0.9)';
    ctx.lineWidth = 2 / z;
    ctx.beginPath();
    ctx.arc(this.aim.wx, this.aim.wy, 8 / z, 0, Math.PI * 2);
    ctx.stroke();
  }
}
