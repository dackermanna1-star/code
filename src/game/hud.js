// Arcade HUD modeled on the reference: names, health with recoverable (RCT) health,
// wins, round & timer, cursed energy levels, domain gauge, character gauges,
// portraits, combo counter, banners, super names and voice captions.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U, Font = JJK.Font, FX = JJK.FX;
  const W = JJK.W;

  const portraits = {};
  JJK.portrait = function (charId, pal, size = 30, eyes) {
    const key = charId + pal + size + (eyes ? 'e' : '');
    if (portraits[key] || typeof document === 'undefined') return portraits[key];
    const def = JJK.Chars[charId];
    const r = new JJK.Raster(size, size);
    const pose = JJK.Rig.full(Object.assign({}, def.poses.idle, { head: -2, lean: 4, bend: 0, eyes: eyes ? 'open' : 'band' }));
    const J = JJK.Rig.solve(pose, def.art.dims);
    const z = size / 30 * 1.15;
    const xf = new JJK.Rig.Xform().set(size / 2 - J.head[0] * z + 1, size * 0.56 + J.head[1] * z, 1, z, 0, [0, 70], 1, 1);
    r.begin();
    r.lights.push({ x: size * 0.2, y: size * 0.2, r: size, r2: size * size, c: def.id === 'gojo' ? [40, 100, 255] : [255, 50, 30], i: 0.6 });
    def.art.draw(r, J, xf, { pose, pal, sec: new JJK.Rig.Secondary(), eyesOpen: !!eyes });
    r.outline(def.art.outline, 0, true);
    r.flush();
    portraits[key] = r.canvas;
    return r.canvas;
  };

  class HUD {
    constructor(m) {
      this.m = m;
      this.disp = [1000, 1000]; // smoothed health for the damage trail
      this.combo = [null, null];
      this.comboT = [0, 0];
      this.lastCombo = [null, null];
      this.shakeP = [0, 0];
      this.t = 0;
    }
    tick() {
      this.t++;
      const m = this.m;
      for (let i = 0; i < 2; i++) {
        const f = m.fighters[i];
        if (this.disp[i] > f.hp) {
          if (f.isStunned() && f.combo.hits > 0) this.disp[i] -= 0.4; // hold during combo
          else this.disp[i] = Math.max(f.hp, this.disp[i] - 4);
        } else this.disp[i] = f.hp;
        if (this.comboT[i] > 0) this.comboT[i]--;
        if (this.shakeP[i] > 0) this.shakeP[i]--;
      }
    }
    onHit(att, def, info) {
      const i = att.side;
      this.combo[i] = { hits: def.combo.hits, dmg: def.combo.dmg };
      this.comboT[i] = 70;
      this.shakeP[def.side] = 6;
    }
    comboEnd(i, combo) {
      this.lastCombo[i] = { hits: combo.hits, dmg: combo.dmg };
    }

    draw(ctx) {
      const m = this.m;
      const [a, b] = m.fighters;
      ctx.save();
      // top gradient for legibility
      const g = ctx.createLinearGradient(0, 0, 0, 52);
      g.addColorStop(0, 'rgba(0,0,0,0.6)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, 52);
      this.side(ctx, a, 0);
      this.side(ctx, b, 1);
      // round + timer
      const label = m.training ? 'TRAINING' : (m.roundLabel || 'ROUND ' + m.round);
      Font.draw(ctx, label, W / 2, 3, { color: '#ffd23a', align: 'center', shadow: '#000' });
      const time = m.training ? '∞' : U.mmss(m.timer / 60);
      const low = !m.training && m.timer < 10 * 60;
      Font.draw(ctx, time, W / 2, 13, { color: low && (this.t % 30 < 15) ? '#ff5040' : '#ffffff', align: 'center', scale: 2, outline: '#000' });
      // wins markers
      const need = m.winsNeeded;
      for (let i = 0; i < need; i++) {
        this.winDot(ctx, W / 2 - 22 - i * 9, 34, a.wins > i);
        this.winDot(ctx, W / 2 + 22 + i * 9, 34, b.wins > i);
      }
      Font.draw(ctx, 'WIN', W / 2, 31, { color: '#ffd23a', align: 'center', shadow: '#000' });
      // combo counters
      for (let i = 0; i < 2; i++) {
        const c = this.combo[i];
        if (c && this.comboT[i] > 0 && c.hits >= 2) {
          const x = i === 0 ? 16 : W - 16;
          const al = i === 0 ? 'left' : 'right';
          const k = Math.min(1, this.comboT[i] / 15);
          ctx.globalAlpha = k;
          const pop = this.comboT[i] > 64 ? 1 + (this.comboT[i] - 64) * 0.08 : 1;
          Font.draw(ctx, String(c.hits), x, 110 - (pop - 1) * 6, { color: '#ffffff', align: al, scale: Math.round(4 * pop), outline: '#000' });
          Font.draw(ctx, 'HITS', x + (i === 0 ? 0 : 0), 142, { color: '#ffd23a', align: al, scale: 2, outline: '#000' });
          Font.draw(ctx, 'DMG ' + c.dmg, x, 160, { color: '#ffb0a0', align: al, outline: '#000' });
          ctx.globalAlpha = 1;
        }
      }
      // super name cut-in
      const sn = m.superName;
      if (sn) {
        const k = Math.min(1, sn.t / 6), out = sn.t > sn.life - 10 ? (sn.life - sn.t) / 10 : 1;
        ctx.globalAlpha = Math.max(0, out);
        const y = 270;
        const x = sn.side === 0 ? 24 - (1 - k) * 200 : W - 24 + (1 - k) * 200;
        const bw = Font.width(sn.text, 2) + 30;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(sn.side === 0 ? x - 12 : x - bw + 12, y - 6, bw, 26);
        ctx.fillStyle = sn.color || '#fff';
        ctx.fillRect(sn.side === 0 ? x - 12 : x - bw + 12, y - 6, bw, 2);
        ctx.fillRect(sn.side === 0 ? x - 12 : x - bw + 12, y + 18, bw, 2);
        Font.draw(ctx, sn.text, x, y, { color: '#ffffff', align: sn.side === 0 ? 'left' : 'right', scale: 2, outline: '#000' });
        ctx.globalAlpha = 1;
      }
      // banners
      for (const bt of m.texts) this.banner(ctx, bt);
      // captions (subtitles)
      let cy = m.training ? 300 : 340;
      for (let i = m.captions.length - 1; i >= 0; i--) {
        const c = m.captions[i];
        const k = c.t < 6 ? c.t / 6 : c.t > c.life - 12 ? (c.life - c.t) / 12 : 1;
        ctx.globalAlpha = Math.max(0, k);
        const col = c.id === 'gojo' ? '#bfe8ff' : c.id === 'sukuna' ? '#ffb8b0' : '#ffe08a';
        const txt = (c.id === 'announcer' ? '' : (c.id === 'gojo' ? 'GOJO: ' : 'SUKUNA: ')) + c.text.toUpperCase();
        const w = Font.width(txt) + 10;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(Math.round(W / 2 - w / 2), cy - 2, w, 11);
        Font.draw(ctx, txt, W / 2, cy, { color: col, align: 'center' });
        cy -= 13;
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    winDot(ctx, x, y, on) {
      FX.pxCircle(ctx, x, y, 3.5, '#000');
      FX.pxCircle(ctx, x, y, 2.8, on ? '#ffd23a' : '#3a3a3a');
      if (on) FX.pxCircle(ctx, x - 0.6, y - 0.6, 1, '#fff8c0');
    }

    side(ctx, f, i) {
      const m = this.m;
      const L = i === 0;
      const shake = this.shakeP[i] > 0 ? (this.shakeP[i] % 2 ? 1 : -1) : 0;
      const px = L ? 6 : W - 6 - 32;
      // portrait
      const por = JJK.portrait(f.def.id, f.pal, 30);
      ctx.fillStyle = '#000';
      ctx.fillRect(px, 4, 32, 32);
      ctx.fillStyle = f.def.color;
      ctx.fillRect(px, 4, 32, 1); ctx.fillRect(px, 35, 32, 1); ctx.fillRect(px, 4, 1, 32); ctx.fillRect(px + 31, 4, 1, 32);
      if (por) {
        ctx.save();
        if (!L) { ctx.translate(px + 31, 5); ctx.scale(-1, 1); ctx.drawImage(por, 0, 0); }
        else ctx.drawImage(por, px + 1, 5);
        ctx.restore();
      }
      // name + wins
      const x0 = L ? 44 : W - 44 - 230, x1 = x0 + 230;
      Font.draw(ctx, (L ? 'P1: ' : 'P2: ') + f.def.name + (f.cpu ? ' (CPU)' : ''), L ? x0 : x1, 4, { color: '#ffffff', align: L ? 'left' : 'right', shadow: '#000' });
      Font.draw(ctx, 'WINS: ' + String(f.wins).padStart(2, '0'), L ? x1 : x0, 4, { color: '#ffffff', align: L ? 'right' : 'left', shadow: '#000' });
      // health bar
      const hy = 14, hh = 11, hw = 230;
      ctx.fillStyle = '#000';
      ctx.fillRect(x0 - 1 + shake, hy - 1, hw + 2, hh + 2);
      ctx.fillStyle = '#5a0a0a';
      ctx.fillRect(x0 + shake, hy, hw, hh);
      const hpK = Math.max(0, f.hp) / f.maxHp;
      const dispK = Math.max(0, this.disp[i]) / f.maxHp;
      const redK = Math.min(1, (Math.max(0, f.hp) + f.red) / f.maxHp);
      const seg = (k0, k1, col) => {
        const w0 = Math.round(hw * k0), w1 = Math.round(hw * k1);
        if (w1 <= w0) return;
        if (L) { ctx.fillStyle = col; ctx.fillRect(x0 + shake + hw - w1, hy, w1 - w0, hh); }
        else { ctx.fillStyle = col; ctx.fillRect(x0 + shake + w0, hy, w1 - w0, hh); }
      };
      // damage trail (white/yellow), recoverable (pale red), current health (green gradient)
      seg(hpK, dispK, '#ffe8a0');
      seg(hpK, redK, '#d06a6a');
      const lowHp = hpK < 0.25;
      const hpCol = lowHp ? (this.t % 20 < 10 ? '#e8b820' : '#d09010') : '#38c040';
      seg(0, hpK, hpCol);
      // bevel highlights
      const fillW = Math.round(hw * hpK);
      const fx = L ? x0 + shake + hw - fillW : x0 + shake;
      ctx.fillStyle = lowHp ? 'rgba(255,240,160,0.6)' : 'rgba(180,255,170,0.65)';
      ctx.fillRect(fx, hy, fillW, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(fx, hy + hh - 3, fillW, 3);
      // tick marks every 10%
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let k = 1; k < 10; k++) ctx.fillRect(x0 + shake + Math.round(hw * k / 10), hy, 1, hh);
      // guard gauge (thin)
      const gk = U.clamp(f.guard / 100, 0, 1);
      ctx.fillStyle = '#101010';
      ctx.fillRect(x0, hy + hh + 2, hw, 2);
      ctx.fillStyle = gk < 0.3 ? '#ff6040' : '#9ab0d0';
      const gw = Math.round(hw * gk);
      ctx.fillRect(L ? x0 + hw - gw : x0, hy + hh + 2, gw, 2);
      // cursed energy meter (3 levels)
      const my = 31, mh = 6, mw = 120;
      const mx = L ? x0 : x1 - mw;
      ctx.fillStyle = '#000';
      ctx.fillRect(mx - 1, my - 1, mw + 2, mh + 2);
      ctx.fillStyle = '#16121e';
      ctx.fillRect(mx, my, mw, mh);
      const lvl = Math.floor(f.meter / 100);
      const part = (f.meter % 100) / 100;
      const segW = mw / 3;
      const ceCol = f.def.id === 'gojo' ? ['#2a6aff', '#5aa8ff', '#bfe8ff'] : ['#c01818', '#ff4a3a', '#ffc0b0'];
      for (let s = 0; s < 3; s++) {
        let k = s < lvl ? 1 : s === lvl ? part : 0;
        if (k <= 0) continue;
        const w = Math.round(segW * k) - (s < 2 ? 1 : 0);
        const sx = L ? mx + s * segW : mx + mw - s * segW - w;
        const full = s < lvl;
        ctx.fillStyle = full ? ceCol[1] : ceCol[0];
        ctx.fillRect(Math.round(sx), my, w, mh);
        if (full) {
          ctx.fillStyle = ceCol[2];
          ctx.fillRect(Math.round(sx), my, w, 1);
          // shimmer
          const sh = (this.t * 2 + s * 20) % (segW + 20) - 10;
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillRect(Math.round(sx + U.clamp(sh, 0, w - 3)), my, 3, mh);
        }
      }
      ctx.fillStyle = '#000';
      ctx.fillRect(mx + Math.round(segW), my, 1, mh);
      ctx.fillRect(mx + Math.round(segW * 2), my, 1, mh);
      Font.draw(ctx, 'LV' + lvl, L ? mx + mw + 4 : mx - 4, my - 1, { color: lvl >= 3 ? (this.t % 20 < 10 ? '#ffffff' : ceCol[2]) : ceCol[2], align: L ? 'left' : 'right', shadow: '#000' });
      // domain gauge
      const dk = U.clamp(f.dg / 100, 0, 1);
      const ready = dk >= 1 && f.meter >= 200 && f.burnout <= 0;
      const dx = L ? x1 - 54 : x0;
      const dw = 54, dy = 32;
      ctx.fillStyle = '#000';
      ctx.fillRect(dx - 1, dy - 1, dw + 2, 6);
      ctx.fillStyle = '#1a1020';
      ctx.fillRect(dx, dy, dw, 4);
      ctx.fillStyle = dk >= 1 ? (this.t % 16 < 8 ? '#ffffff' : f.def.color) : '#8a60c0';
      const dww = Math.round(dw * dk);
      ctx.fillRect(L ? dx + dw - dww : dx, dy, dww, 4);
      Font.draw(ctx, ready ? 'DOMAIN READY' : 'DOMAIN', L ? x1 : x0, dy + 7, { color: ready ? (this.t % 16 < 8 ? '#ffffff' : f.def.color) : '#a090c0', align: L ? 'right' : 'left', shadow: '#000' });
      // character-specific gauge
      const cy = 41;
      if (f.def.id === 'gojo') {
        const cs = f.cs;
        const iw = 80;
        const ix = L ? x0 : x1 - iw;
        ctx.fillStyle = '#000';
        ctx.fillRect(ix - 1, cy - 1, iw + 2, 5);
        ctx.fillStyle = '#101820';
        ctx.fillRect(ix, cy, iw, 3);
        const ik = cs.inf / 100;
        ctx.fillStyle = cs.infBroken ? '#506070' : cs.infOn ? (this.t % 12 < 6 ? '#ffffff' : '#bfe8ff') : '#6a9ac0';
        const iww = Math.round(iw * ik);
        ctx.fillRect(L ? ix : ix + iw - iww, cy, iww, 3);
        Font.draw(ctx, cs.infBroken ? '∞ BROKEN' : cs.infOn ? '∞ INFINITY' : '∞', L ? ix + iw + 4 : ix - 4, cy - 2, { color: cs.infOn ? '#ffffff' : '#8ab0d0', align: L ? 'left' : 'right', shadow: '#000' });
      } else if (f.def.id === 'sukuna') {
        const cs = f.cs;
        for (let k = 0; k < 3; k++) {
          const fx = L ? x0 + 4 + k * 10 : x1 - 4 - k * 10;
          const on = cs.kindle > k;
          FX.pxCircle(ctx, fx, cy + 2, 3, on ? '#ff8a1a' : '#2a1a14');
          if (on) FX.pxCircle(ctx, fx, cy + 1, 1.5, '#ffe080');
        }
        Font.draw(ctx, 'KINDLING', L ? x0 + 34 : x1 - 34, cy - 1, { color: '#ffb070', align: L ? 'left' : 'right', shadow: '#000' });
        if (cs.da) Font.draw(ctx, 'AMPLIFIED', L ? x0 + 88 : x1 - 88, cy - 1, { color: this.t % 20 < 10 ? '#d0a0ff' : '#ffffff', align: L ? 'left' : 'right', shadow: '#000' });
      }
      if (f.burnout > 0) Font.draw(ctx, 'BURNOUT ' + Math.ceil(f.burnout / 60), L ? x0 + 140 : x1 - 140, cy + 8, { color: '#a0a0b0', align: L ? 'left' : 'right', shadow: '#000' });
    }

    banner(ctx, bt) {
      const k = bt.t / bt.life;
      const opts = { scale: bt.scale || 6 };
      if (bt.top) Object.assign(opts, { top: bt.top, mid: bt.mid, mid2: bt.mid2, bot: bt.bot });
      const c = Font.banner(bt.text, opts);
      if (!c) return;
      let s = 1;
      if (bt.t < 6) s = 1.6 - bt.t * 0.1;
      const alpha = k > 0.85 ? (1 - k) / 0.15 : 1;
      const w = c.width * s, h = c.height * s;
      let x = W / 2 - w / 2, y = (bt.y || 130) - h / 2;
      if (bt.shake && bt.t < 12) { x += U.rand(-3, 3); y += U.rand(-3, 3); }
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(c, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
      ctx.globalAlpha = 1;
    }
  }
  JJK.HUD = HUD;
})();
