// In-game paint menu (Tab): colour wheel, presets, recent colours, caps,
// width / flow, finish, drips, a live stroke preview, undo / clear. Plus the
// quick width indicator shown when the mouse wheel changes width while the menu
// is closed, and touch buttons for phones. Self-contained: one injected style
// block, no dependencies beyond the small helpers next to it.
import { hsvToHex, rgbToHsv, hexToRgb, normalizeHex, clamp } from './color.js';
import { CAP_LIST, FINISH_LIST, PRESETS, sprayWidthCm, formatCm, sanitizeSettings, loadRecent, saveRecent, RECENT_MAX } from './paintData.js';
import { SprayRenderer, previewWidthPx } from './sprayPreview.js';

const CSS = `
.pm-root{position:fixed;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(4,6,9,.38);opacity:0;pointer-events:none;transition:opacity .16s ease;font:400 12px/1.35 ui-sans-serif,system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif;color:#aeb4bf;-webkit-user-select:none;user-select:none}
.pm-root.pm-open{opacity:1;pointer-events:auto}
.pm-panel{position:relative;display:grid;grid-template-columns:232px 1fr;gap:22px;padding:22px 24px 16px;width:min(760px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;background:linear-gradient(180deg,rgba(22,25,31,.82),rgba(12,14,18,.86));border:1px solid rgba(255,255,255,.07);border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.04);backdrop-filter:blur(14px) saturate(1.1);-webkit-backdrop-filter:blur(14px) saturate(1.1);transform:scale(.975);transition:transform .16s ease}
.pm-open .pm-panel{transform:none}
.pm-h{font-weight:300;letter-spacing:.32em;text-transform:lowercase;color:#8a8f99;font-size:10.5px;margin:0 0 8px}
.pm-col{display:flex;flex-direction:column;gap:14px;min-width:0}
.pm-wheel{width:232px;height:232px;display:block;cursor:crosshair;touch-action:none}
.pm-row{display:flex;align-items:center;gap:10px}
.pm-cap{width:34px;height:34px;border-radius:50%;flex:none;box-shadow:inset 0 -6px 10px rgba(0,0,0,.35),inset 0 2px 3px rgba(255,255,255,.25),0 0 0 1px rgba(255,255,255,.1)}
.pm-hex{flex:1;min-width:0;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:7px;color:#d6dae1;font:500 13px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;padding:7px 9px;outline:none}
.pm-hex:focus{border-color:rgba(255,255,255,.28)}
.pm-name{color:#8a8f99;font-size:11px;letter-spacing:.08em;min-height:15px}
.pm-sw{display:grid;grid-template-columns:repeat(12,1fr);gap:5px}
.pm-s{aspect-ratio:1;border-radius:50%;border:0;padding:0;cursor:pointer;box-shadow:inset 0 -3px 5px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.08);transition:transform .1s ease}
.pm-s:hover{transform:scale(1.18)}
.pm-s.pm-on{box-shadow:0 0 0 2px #0d0f13,0 0 0 3px #d8dce3}
.pm-recent{display:flex;gap:6px;min-height:18px}
.pm-recent .pm-s{width:18px;height:18px}
.pm-preview{width:100%;height:132px;display:block;border-radius:9px;background:#15171b;box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}
.pm-seg{display:grid;gap:6px}
.pm-btn{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);color:#aab0ba;border-radius:8px;padding:7px 6px;font:inherit;letter-spacing:.06em;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;text-transform:lowercase;transition:background .12s,border-color .12s,color .12s}
.pm-btn:hover{background:rgba(255,255,255,.07);color:#dfe3ea}
.pm-btn.pm-on{border-color:rgba(255,255,255,.34);color:#eef1f5;background:rgba(255,255,255,.08)}
.pm-btn svg{display:block}
.pm-sl{display:grid;grid-template-columns:52px 1fr 64px;align-items:center;gap:10px}
.pm-sl label{letter-spacing:.14em;text-transform:lowercase;color:#8a8f99}
.pm-sl output{text-align:right;color:#cfd3da;font-variant-numeric:tabular-nums}
.pm-sl input{width:100%;accent-color:#c9ced6}
.pm-tog{display:flex;align-items:center;gap:8px;cursor:pointer;letter-spacing:.14em;text-transform:lowercase;color:#8a8f99}
.pm-tog input{accent-color:#c9ced6;width:15px;height:15px}
.pm-foot{grid-column:1/-1;display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 16px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06);color:#6c717b;font-size:10.5px;letter-spacing:.12em;text-transform:lowercase}
.pm-x{position:absolute;top:10px;right:12px;width:28px;height:28px;border:0;background:none;color:#7d838d;font-size:18px;cursor:pointer;border-radius:6px}
.pm-x:hover{color:#e3e6eb;background:rgba(255,255,255,.06)}
.pm-act{display:flex;gap:8px}
.pm-act .pm-btn{flex-direction:row;padding:7px 12px}
.pm-danger.pm-armed{border-color:rgba(230,90,80,.6);color:#f0a59c}
.pm-ind{position:fixed;left:50%;top:50%;z-index:5;pointer-events:none;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:8px;opacity:0;transition:opacity .5s ease}
.pm-ind.pm-show{opacity:1;transition:opacity .08s ease}
.pm-ring{border-radius:50%;border:1.5px solid;box-shadow:0 0 12px rgba(0,0,0,.4)}
.pm-indt{font:300 10.5px ui-sans-serif,system-ui,sans-serif;letter-spacing:.22em;color:#c3c8d0;text-shadow:0 1px 3px #000}
.pm-touch{position:fixed;right:16px;bottom:18px;z-index:4;display:none;flex-direction:column;gap:12px;align-items:center}
.pm-touch.pm-vis{display:flex}
.pm-tb{width:58px;height:58px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(16,18,22,.45);color:#d5d9df;font:300 11px ui-sans-serif,system-ui,sans-serif;letter-spacing:.1em;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);touch-action:none}
.pm-tb.pm-spray{width:76px;height:76px}
.pm-tb.pm-on{border-color:rgba(255,255,255,.5)}
@media (max-width:640px){.pm-root{align-items:flex-end}.pm-panel{grid-template-columns:1fr;border-radius:16px 16px 0 0;width:100vw;max-height:78vh;padding:18px 16px 12px}.pm-wheel{margin:0 auto}}
`;

const CAP_ICON = {
  skinny: '<svg width="34" height="14" viewBox="0 0 34 14"><path d="M3 10 C12 2,22 12,31 4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>',
  standard: '<svg width="34" height="14" viewBox="0 0 34 14"><path d="M3 10 C12 2,22 12,31 4" stroke="currentColor" stroke-width="3.6" fill="none" stroke-linecap="round" opacity=".9"/></svg>',
  fat: '<svg width="34" height="14" viewBox="0 0 34 14"><defs><filter id="pmb"><feGaussianBlur stdDeviation="1.2"/></filter></defs><path d="M4 9 C12 3,22 11,30 5" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round" opacity=".75" filter="url(#pmb)"/></svg>',
  calligraphy: '<svg width="34" height="14" viewBox="0 0 34 14"><path d="M3 11 L9 3 L13 3 L7 11Z M12 11 L18 3 L22 3 L16 11Z M21 11 L27 3 L31 3 L25 11Z" fill="currentColor" opacity=".85"/></svg>',
};

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

let styled = false;
function injectStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

export class PaintMenu {
  constructor({ parent = document.body, settings, onChange = () => {}, onAction = () => {} } = {}) {
    injectStyle();
    this.s = sanitizeSettings(settings ?? {});
    this.onChange = onChange;
    this.onAction = onAction;
    this.recent = loadRecent();
    this.hsv = [0, 0, 0];
    this.setHsv(this.s.color);
    this.build(parent);
    this.sync();
  }

  build(parent) {
    const root = (this.root = el('div', 'pm-root'));
    const panel = el('div', 'pm-panel');
    root.appendChild(panel);
    // left: colour
    const L = el('div', 'pm-col');
    L.appendChild(el('div', 'pm-h', 'colour'));
    this.wheel = el('canvas', 'pm-wheel');
    L.appendChild(this.wheel);
    const r1 = el('div', 'pm-row');
    this.cap = el('div', 'pm-cap');
    this.hex = el('input', 'pm-hex');
    this.hex.maxLength = 7;
    this.hex.spellcheck = false;
    r1.append(this.cap, this.hex);
    L.appendChild(r1);
    this.name = el('div', 'pm-name');
    L.appendChild(this.name);
    L.appendChild(el('div', 'pm-h', 'recent'));
    this.recentEl = el('div', 'pm-recent');
    L.appendChild(this.recentEl);
    // right: preview, presets, cap, sliders
    const R = el('div', 'pm-col');
    this.prev = el('canvas', 'pm-preview');
    R.appendChild(this.prev);
    this.sw = el('div', 'pm-sw');
    for (const p of PRESETS) {
      const b = el('button', 'pm-s');
      b.style.background = p.metal ? `radial-gradient(circle at 35% 30%, #fff8, ${p.hex} 45%, #0006)` : p.hex;
      b.title = p.name;
      b.dataset.hex = p.hex;
      b.onclick = () => this.pickColor(p.hex, p.metal ? 'chrome' : null);
      this.sw.appendChild(b);
    }
    R.appendChild(this.sw);
    R.appendChild(el('div', 'pm-h', 'cap'));
    this.caps = el('div', 'pm-seg');
    this.caps.style.gridTemplateColumns = 'repeat(4,1fr)';
    for (const c of CAP_LIST) {
      const b = el('button', 'pm-btn', `${CAP_ICON[c.id]}<span>${c.label}</span>`);
      b.dataset.cap = c.id;
      b.onclick = () => this.set({ cap: c.id }, 'cap');
      this.caps.appendChild(b);
    }
    R.appendChild(this.caps);
    const mkSlider = (label, min, max, step, key) => {
      const row = el('div', 'pm-sl');
      const lab = el('label', null, label);
      const inp = el('input');
      Object.assign(inp, { type: 'range', min, max, step });
      const out = el('output');
      inp.oninput = () => this.set({ [key]: key === 'flow' ? +inp.value / 100 : +inp.value }, key);
      row.append(lab, inp, out);
      R.appendChild(row);
      return { inp, out };
    };
    this.wSl = mkSlider('width', 0.3, 3, 0.01, 'width');
    this.fSl = mkSlider('flow', 10, 100, 1, 'flow');
    const r2 = el('div', 'pm-row');
    this.fin = el('div', 'pm-seg');
    this.fin.style.gridTemplateColumns = 'repeat(3,1fr)';
    this.fin.style.flex = '1';
    for (const f of FINISH_LIST) {
      const b = el('button', 'pm-btn', f);
      b.dataset.fin = f;
      b.onclick = () => this.set({ finish: f }, 'finish');
      this.fin.appendChild(b);
    }
    const tog = el('label', 'pm-tog');
    this.drips = el('input');
    this.drips.type = 'checkbox';
    this.drips.onchange = () => this.set({ drips: this.drips.checked }, 'drips');
    tog.append(this.drips, document.createTextNode('drips'));
    r2.append(this.fin, tog);
    R.appendChild(r2);
    const act = el('div', 'pm-act');
    const undo = el('button', 'pm-btn', 'undo');
    undo.onclick = () => this.onAction('undo');
    this.clearBtn = el('button', 'pm-btn pm-danger', 'clear my paint');
    this.clearBtn.onclick = () => {
      if (this.clearBtn.classList.contains('pm-armed')) {
        this.clearBtn.classList.remove('pm-armed');
        this.clearBtn.textContent = 'clear my paint';
        this.onAction('clear');
      } else {
        this.clearBtn.classList.add('pm-armed');
        this.clearBtn.textContent = 'click again to clear';
        clearTimeout(this.armT);
        this.armT = setTimeout(() => {
          this.clearBtn.classList.remove('pm-armed');
          this.clearBtn.textContent = 'clear my paint';
        }, 3000);
      }
    };
    this.stats = el('div', 'pm-name');
    this.stats.style.marginLeft = 'auto';
    act.append(undo, this.clearBtn, this.stats);
    R.appendChild(act);
    const foot = el('div', 'pm-foot', '<span>e can</span><span>lmb / space spray</span><span>rmb shake</span><span>wheel width · shift flow</span><span>1–4 caps</span><span>z undo</span><span>tab close</span>');
    const x = el('button', 'pm-x', '×');
    x.title = 'close';
    x.onclick = () => this.onAction('close');
    panel.append(L, R, foot, x);
    root.addEventListener('pointerdown', (e) => {
      if (e.target === root) this.onAction('close');
    });
    for (const t of ['pointerdown', 'mousedown', 'wheel', 'contextmenu']) panel.addEventListener(t, (e) => e.stopPropagation(), { passive: t === 'wheel' });
    this.hex.addEventListener('change', () => {
      const h = normalizeHex(this.hex.value);
      if (h) this.pickColor(h);
      else this.hex.value = this.s.color;
    });
    // keys: capture everything while open so the game never sees them
    this.onKey = (e) => {
      if (!this.isOpen) return;
      e.stopImmediatePropagation();
      const inHex = document.activeElement === this.hex;
      if (e.code === 'Tab' || e.code === 'Escape' || (e.code === 'Enter' && !inHex)) {
        e.preventDefault();
        if (inHex && e.code !== 'Escape') this.hex.blur();
        this.onAction('close');
      } else if (e.code === 'KeyZ' && !inHex) this.onAction('undo');
    };
    addEventListener('keydown', this.onKey, true);
    addEventListener('keyup', (e) => this.isOpen && e.stopImmediatePropagation(), true);
    this.wheelUI();
    parent.appendChild(root);
    this.renderer = new SprayRenderer(this.prev);
    // quick indicator
    this.ind = el('div', 'pm-ind');
    this.ring = el('div', 'pm-ring');
    this.indT = el('div', 'pm-indt');
    this.ind.append(this.ring, this.indT);
    parent.appendChild(this.ind);
  }

  // ── colour wheel: hue ring + saturation/value square ──
  wheelUI() {
    const c = this.wheel;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = c.height = Math.round(232 * dpr);
    const g = c.getContext('2d');
    const S = c.width, R = S / 2, r0 = R * 0.83, sq = r0 * 1.32;
    this.geo = { S, R, r0, sq, dpr };
    const ring = document.createElement('canvas');
    ring.width = ring.height = S;
    const rg = ring.getContext('2d');
    const img = rg.createImageData(S, S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const dx = x - R + 0.5, dy = y - R + 0.5, d = Math.hypot(dx, dy);
        if (d > R - 1 || d < r0 + 1) continue;
        const h = (((Math.atan2(dy, dx) / (Math.PI * 2)) + 1) % 1) * 360;
        const [rr, gg, bb] = hexToRgb(hsvToHex(h, 1, 1));
        const o = 4 * (y * S + x);
        const a = Math.min(1, R - 1 - d, d - r0 - 1);
        img.data[o] = rr; img.data[o + 1] = gg; img.data[o + 2] = bb; img.data[o + 3] = 255 * Math.min(1, a);
      }
    rg.putImageData(img, 0, 0);
    this.ringImg = ring;
    this.wctx = g;
    let mode = null;
    const at = (e) => {
      const b = c.getBoundingClientRect();
      return [((e.clientX - b.left) / b.width) * S - R, ((e.clientY - b.top) / b.height) * S - R];
    };
    const apply = (e) => {
      const [x, y] = at(e);
      if (mode === 'h') this.hsv[0] = (((Math.atan2(y, x) / (Math.PI * 2)) + 1) % 1) * 360;
      else {
        this.hsv[1] = clamp((x + sq / 2) / sq, 0, 1);
        this.hsv[2] = clamp(1 - (y + sq / 2) / sq, 0, 1);
      }
      this.pickColor(hsvToHex(...this.hsv), null, true);
    };
    c.addEventListener('pointerdown', (e) => {
      const [x, y] = at(e);
      mode = Math.hypot(x, y) > r0 - 2 ? 'h' : Math.abs(x) <= sq / 2 + 6 && Math.abs(y) <= sq / 2 + 6 ? 'sv' : null;
      if (!mode) return;
      c.setPointerCapture(e.pointerId);
      apply(e);
    });
    c.addEventListener('pointermove', (e) => mode && apply(e));
    c.addEventListener('pointerup', () => {
      if (mode) this.commitRecent();
      mode = null;
    });
  }

  drawWheel() {
    const g = this.wctx;
    const { S, R, r0, sq, dpr } = this.geo;
    const [h, s, v] = this.hsv;
    g.clearRect(0, 0, S, S);
    g.drawImage(this.ringImg, 0, 0);
    const x0 = R - sq / 2, y0 = R - sq / 2;
    g.fillStyle = hsvToHex(h, 1, 1);
    g.fillRect(x0, y0, sq, sq);
    let gr = g.createLinearGradient(x0, 0, x0 + sq, 0);
    gr.addColorStop(0, '#fff');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(x0, y0, sq, sq);
    gr = g.createLinearGradient(0, y0, 0, y0 + sq);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, '#000');
    g.fillStyle = gr;
    g.fillRect(x0, y0, sq, sq);
    const mark = (x, y, r) => {
      g.lineWidth = 2 * dpr;
      g.strokeStyle = '#0b0c0f';
      g.beginPath();
      g.arc(x, y, r + dpr, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = '#f2f4f7';
      g.lineWidth = 1.5 * dpr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
    };
    const a = (h / 360) * Math.PI * 2, rm = (R + r0) / 2;
    mark(R + Math.cos(a) * rm, R + Math.sin(a) * rm, (R - r0) * 0.38);
    mark(x0 + s * sq, y0 + (1 - v) * sq, 6 * dpr);
  }

  /** HSV from a hex colour; greys keep the current hue. */
  setHsv(hex) {
    const [h, sat, v] = rgbToHsv(...hexToRgb(hex));
    this.hsv = [Number.isFinite(h) ? h : this.hsv?.[0] ?? 0, sat, v];
  }

  pickColor(hex, finish, live = false) {
    const h = normalizeHex(hex);
    if (!h) return;
    if (!live) this.setHsv(h);
    const patch = { color: h };
    if (finish) patch.finish = finish;
    this.set(patch, 'color');
    if (!live) this.commitRecent();
  }

  commitRecent() {
    const h = this.s.color;
    this.recent = [h, ...this.recent.filter((x) => x !== h)].slice(0, RECENT_MAX);
    saveRecent(this.recent);
    this.syncRecent();
  }

  set(patch, key) {
    this.s = sanitizeSettings({ ...this.s, ...patch }, this.s);
    this.sync();
    this.onChange({ ...this.s }, key);
  }

  setSettings(partial) {
    const prev = this.s.color;
    this.s = sanitizeSettings({ ...this.s, ...partial }, this.s);
    if (this.s.color !== prev) this.setHsv(this.s.color);
    this.sync();
  }

  setStats({ coverage = 0, strokes = 0 } = {}) {
    this.stats.textContent = `wall space ${Math.round(coverage * 100)}% · ${strokes} stroke${strokes === 1 ? '' : 's'}`;
  }

  syncRecent() {
    this.recentEl.innerHTML = '';
    for (const h of this.recent) {
      const b = el('button', 'pm-s');
      b.style.background = h;
      b.title = h;
      b.onclick = () => this.pickColor(h);
      this.recentEl.appendChild(b);
    }
  }

  sync() {
    const s = this.s;
    this.cap.style.background = s.finish === 'chrome' ? `radial-gradient(circle at 35% 30%, #fffa, ${s.color} 50%, #000a)` : s.color;
    if (document.activeElement !== this.hex) this.hex.value = s.color;
    const p = PRESETS.find((x) => x.hex === s.color);
    this.name.textContent = p ? p.name.toLowerCase() : '';
    for (const b of this.sw.children) b.classList.toggle('pm-on', b.dataset.hex === s.color);
    for (const b of this.caps.children) b.classList.toggle('pm-on', b.dataset.cap === s.cap);
    for (const b of this.fin.children) b.classList.toggle('pm-on', b.dataset.fin === s.finish);
    this.wSl.inp.value = s.width;
    this.wSl.out.textContent = formatCm(sprayWidthCm(s));
    this.fSl.inp.value = Math.round(s.flow * 100);
    this.fSl.out.textContent = `${Math.round(s.flow * 100)}%`;
    this.drips.checked = !!s.drips;
    if (this.isOpen) {
      this.drawWheel();
      this.queuePreview();
    }
  }

  queuePreview() {
    if (this.pv) return;
    this.pv = requestAnimationFrame(() => {
      this.pv = 0;
      const b = this.prev.getBoundingClientRect();
      if (!b.width) return;
      if (this.pw !== b.width || this.ph !== b.height) {
        this.pw = b.width;
        this.ph = b.height;
        this.renderer.resize(b.width, b.height, Math.min(1.5, devicePixelRatio || 1));
      }
      const s = this.s;
      this.renderer.render({ color: s.color, cap: s.cap, flow: s.flow, finish: s.finish, drips: s.drips, widthPx: previewWidthPx(sprayWidthCm(s), b.height * 0.55) });
    });
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.root.classList.add('pm-open');
    this.syncRecent();
    this.sync();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('pm-open');
    this.hex.blur();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  showIndicator(settings) {
    const s = sanitizeSettings({ ...this.s, ...settings }, this.s);
    const cm = sprayWidthCm(s);
    const px = clamp(cm * 5, 8, 160);
    Object.assign(this.ring.style, { width: `${px}px`, height: `${px}px`, borderColor: s.color });
    this.indT.textContent = `${formatCm(cm)} · flow ${Math.round(s.flow * 100)}%`;
    this.ind.classList.add('pm-show');
    clearTimeout(this.indTimer);
    this.indTimer = setTimeout(() => this.ind.classList.remove('pm-show'), 650);
  }

  destroy() {
    removeEventListener('keydown', this.onKey, true);
    this.root.remove();
    this.ind.remove();
  }
}

/** Round buttons for touch devices: can in/out, spray (hold), palette. */
export class TouchSprayControls {
  constructor({ parent = document.body, onToggleCan = () => {}, onSprayStart = () => {}, onSprayEnd = () => {}, onMenu = () => {} } = {}) {
    injectStyle();
    this.root = el('div', 'pm-touch');
    const mk = (cls, label) => {
      const b = el('button', `pm-tb ${cls}`, label);
      this.root.appendChild(b);
      return b;
    };
    this.menuB = mk('', 'colour');
    this.sprayB = mk('pm-spray', 'spray');
    this.canB = mk('', 'can');
    const stop = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    this.canB.addEventListener('touchstart', (e) => (stop(e), onToggleCan()), { passive: false });
    this.menuB.addEventListener('touchstart', (e) => (stop(e), onMenu()), { passive: false });
    this.sprayB.addEventListener('touchstart', (e) => (stop(e), onSprayStart()), { passive: false });
    for (const t of ['touchend', 'touchcancel']) this.sprayB.addEventListener(t, (e) => (stop(e), onSprayEnd()), { passive: false });
    parent.appendChild(this.root);
    this.setEquipped(false);
  }
  setEquipped(on) {
    this.canB.classList.toggle('pm-on', on);
    this.sprayB.style.display = on ? '' : 'none';
    this.menuB.style.display = on ? '' : 'none';
  }
  show() {
    this.root.classList.add('pm-vis');
  }
  hide() {
    this.root.classList.remove('pm-vis');
  }
  destroy() {
    this.root.remove();
  }
}
