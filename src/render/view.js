// Builds the camera and sprite lists for a frame from the game state and
// draws the first-person weapon (psprites) with modern handling transforms.

import { stateSprite, stateFrame, FULLBRIGHT, FRAMEMASK } from '../game/tables.js';
import { SPR_FULLBRIGHT, SPR_FUZZ } from './renderer.js';
import { MF, PW, WP, normAngle } from '../game/defs.js';
import { PS_WEAPON, PS_FLASH, weaponCfg, weaponFrameOverride } from '../game/weapons.js';
import { SPR } from '../game/tables.js';

const lerp = (a, b, t) => a + (b - a) * t;

export class ViewRenderer {
  constructor(renderer, res, settings) {
    this.r = renderer;
    this.res = res;
    this.settings = settings;
    this.sway = { x: 0, y: 0, vx: 0, vy: 0 };
    this.shakeT = 0;
    this.time = 0;
  }

  viewRect(hudMode) {
    const r = this.r;
    const sbar = hudMode === 'classic' ? Math.round(32 * r.vScaleY) : 0;
    return { x: 0, y: 0, w: r.W, h: r.H - sbar };
  }

  camera(w, player, frac, rect, dt) {
    const mo = player.mo;
    const s = this.settings;
    const m = player.mods;
    this.time += dt;
    const x = lerp(mo.px, mo.x, frac);
    const y = lerp(mo.py, mo.y, frac);
    const viewz = lerp(player.prevViewz ?? player.viewz, player.viewz, frac);
    const ads = lerp(m.prevAds ?? m.ads, m.ads, frac);
    const recoil = lerp(m.prevRecoilPitch ?? m.recoilPitch, m.recoilPitch, frac);
    const cfg = weaponCfg(player.readyweapon);
    let fov = s.get('fov');
    if (s.get('adsZoom') && cfg.ads) fov = fov * lerp(1, cfg.ads.fov, ads);
    const shake = m.shake * (s.get('screenShake') ?? 1);
    const t = this.time;
    const shakeYaw = shake ? Math.sin(t * 61) * shake * 0.0025 : 0;
    const shakePitch = shake ? Math.sin(t * 47 + 1.3) * shake * 0.0025 : 0;
    let roll = shake ? Math.sin(t * 53 + 0.7) * shake * 0.002 : 0;
    if (player.slide) roll += 0.035;
    const sideVel = -Math.sin(mo.angle) * mo.momx + Math.cos(mo.angle) * mo.momy;
    roll += -sideVel * 0.0012 * (s.get('viewBob') ?? 1);
    let fixed = player.fixedcolormap ? player.fixedcolormap : null;
    return {
      x, y, z: viewz,
      yaw: normAngle(mo.angle + m.recoilYaw + shakeYaw),
      pitch: Math.max(-1.5, Math.min(1.5, player.pitch + recoil + shakePitch)),
      roll,
      fov,
      frac,
      extralight: player.extralight,
      fixedColormap: fixed,
      viewX: rect.x, viewY: rect.y, viewW: rect.w, viewH: rect.h,
      sector: mo.subsector.sector,
    };
  }

  // Adds all visible things as billboards.
  addThings(w, cam, frac) {
    const r = this.r;
    const res = this.res;
    const self = w.player && w.player.mo;
    for (const mo of w.mobjs) {
      if (mo === self) continue;
      if (mo.ext && mo.ext.hidden) continue;
      const frames = res.sprites[mo.sprite];
      if (!frames) continue;
      const fi = mo.frame & FRAMEMASK;
      const fr = frames[fi];
      if (!fr) continue;
      const x = lerp(mo.px, mo.x, frac);
      const y = lerp(mo.py, mo.y, frac);
      let z = lerp(mo.pz, mo.z, frac);
      let rot = 0;
      if (fr.rotate) {
        const ang = Math.atan2(y - cam.y, x - cam.x);
        rot = Math.floor(normAngle(ang - mo.angle + (Math.PI / 8) * 9) / (Math.PI / 4)) & 7;
      }
      const image = fr.images[rot];
      if (image < 0) continue;
      let flags = 0;
      if (mo.frame & FULLBRIGHT) flags |= SPR_FULLBRIGHT;
      if (mo.flags & MF.SHADOW) flags |= SPR_FUZZ;
      const sector = mo.subsector.sector;
      const info = res.images[image];
      // Floating things hanging from ceilings keep their spot; floor things
      // whose art sits below the floor are lifted like modern ports do.
      const bottom = z + info.topOffset - info.height;
      if (!(mo.flags & MF.SPAWNCEILING) && bottom < mo.floorz - 0.5 && mo.z <= mo.floorz + 1 && info.height - info.topOffset > 4 && !(mo.flags & MF.CORPSE)) {
        z += Math.min(mo.floorz - bottom, 8);
      }
      const ext = mo.ext;
      r.addSprite({
        image, x, y, z, flip: fr.flip[rot], light: sector.lightlevel, flags,
        roll: ext && ext.roll ? ext.roll : 0,
        cz: z + info.topOffset - info.height / 2,
        scale: ext && ext.scale ? ext.scale : 1,
      });
      if (ext && ext.afterSprite) ext.afterSprite(r, mo, x, y, z, image, rot, cam);
    }
  }

  // --- First-person weapon ------------------------------------------------

  updateSway(player, look, dt) {
    const s = this.sway;
    const k = this.settings.get('weaponSway') ?? 1;
    const ads = player.mods.ads;
    const amt = k * (1 - 0.7 * ads);
    s.vx += (look.yaw * 240 * amt - s.x) * Math.min(1, dt * 18);
    s.vy += (-look.pitch * 160 * amt - s.y) * Math.min(1, dt * 18);
    s.vx *= 0.6;
    s.vy *= 0.6;
    s.x = Math.max(-18, Math.min(18, s.x + s.vx));
    s.y = Math.max(-12, Math.min(12, s.y + s.vy));
    s.x *= Math.pow(0.0005, dt);
    s.y *= Math.pow(0.0005, dt);
  }

  drawWeapon(w, player, frac, rect, hudMode) {
    const r = this.r;
    const res = this.res;
    const m = player.mods;
    const psp = player.psprites[PS_WEAPON];
    if (!psp.state) return;
    const sector = player.mo.subsector.sector;
    const lightnum = Math.max(0, Math.min(15, (sector.lightlevel >> 4) + player.extralight));
    let level = Math.max(0, Math.floor((15 - lightnum) * 4 - 23.5));
    if (player.fixedcolormap) level = player.fixedcolormap;
    const fuzz = !!(player.powers[PW.INVISIBILITY] > 4 * 32 || (player.powers[PW.INVISIBILITY] & 8));
    const cfg = weaponCfg(player.readyweapon);
    const ads = lerp(m.prevAds ?? m.ads, m.ads, frac);
    const kick = lerp(m.prevKick ?? m.kick, m.kick, frac);
    const prev = player.pspPrev || { sx: psp.sx, sy: psp.sy };
    let sx = lerp(prev.sx, psp.sx, frac);
    let sy = lerp(prev.sy, psp.sy, frac);
    const wbob = this.settings.get('weaponBob') ?? 1;
    sx = 1 + (sx - 1) * wbob;
    sy = 32 + (sy - 32) * wbob;
    // View-window vertical centring like R_DrawPSprite (status bar mode).
    const viewH200 = rect.h / r.vScaleY;
    let yShift = viewH200 / 2 - 100;
    let dx = this.sway.x;
    let dy = this.sway.y + kick;
    let rot = 0;
    let scale = 1 + kick * 0.004;
    // Sprint pose
    const sprint = player.sprintFrac || 0;
    dx += 28 * sprint;
    dy += 26 * sprint;
    rot += -0.22 * sprint;
    // Crouch nudge
    dy += 4 * player.crouchFrac;
    // Reload choreography
    const rl = m.reload;
    if (rl) {
      let p;
      if (rl.tube) {
        if (rl.phase === 'start') p = Math.min(1, rl.t / 8) * 0.5;
        else if (rl.phase === 'load') p = 0.5;
        else p = 0.5 * (1 - Math.min(1, rl.t / 8));
        const pumpOnly = rl.phase === 'end' && rl.pump;
        dy += 30 * Math.sin(p * Math.PI) + (rl.phase === 'load' ? Math.sin((rl.t / 11) * Math.PI) * 4 : 0);
        dx += 18 * Math.sin(p * Math.PI);
        rot += -0.28 * Math.sin(p * Math.PI);
        if (pumpOnly) rot *= 0.5;
      } else {
        const p = Math.min(1, (rl.t + frac) / rl.total);
        const e = Math.sin(Math.min(1, p * 1.15) * Math.PI);
        dy += 44 * e;
        dx += 14 * e;
        rot += -0.35 * e;
      }
    }
    if (m.melee) {
      const p = m.melee.t / m.melee.total;
      dy += 70 * Math.sin(Math.min(1, p * 1.2) * Math.PI);
    }
    // Aim down sights: move toward centre, lower to sight line, enlarge.
    if (cfg.ads && ads > 0) {
      const e = ads * ads * (3 - 2 * ads);
      dx = lerp(dx, cfg.ads.x - (sx - 1), e);
      dy = lerp(dy, dy * 0.3 + cfg.ads.y, e);
      scale *= lerp(1, cfg.ads.scale, e);
      rot *= 1 - e;
      sy = lerp(sy, 32, e);
    }
    // Landing dip
    dy += player.landDip || 0;

    const override = weaponFrameOverride(player);
    const draw = (stateIdx, isFlash) => {
      let sprite = stateSprite[stateIdx];
      let frame = stateFrame[stateIdx];
      if (!isFlash && override) {
        if (override.sprite) sprite = SPR[override.sprite];
        frame = override.frame;
      }
      const frames = res.sprites[sprite];
      if (!frames) return;
      const fr = frames[frame & FRAMEMASK];
      if (!fr) return;
      const id = fr.images[0];
      const info = res.images[id];
      if (!info) return;
      const bright = (frame & FULLBRIGHT) || isFlash;
      const vx0 = sx - info.leftOffset;
      const vy0 = sy - info.topOffset + yShift;
      const sxv = r.vScaleX, syv = r.vScaleY;
      // Pivot at the bottom centre of the sprite's screen footprint.
      const px = r.vLeft + (160 + dx) * sxv;
      const py = (200 + yShift) * syv;
      const corners = [
        [vx0, vy0], [vx0 + info.width, vy0], [vx0 + info.width, vy0 + info.height], [vx0, vy0 + info.height],
      ].map(([vx, vy]) => {
        let X = r.vLeft + (vx + dx) * sxv;
        let Y = (vy + dy) * syv;
        X = px + (X - px) * scale;
        Y = py + (Y - py) * scale;
        if (rot) {
          const cx = X - px, cy = Y - py;
          const c = Math.cos(rot), s = Math.sin(rot);
          X = px + cx * c - cy * s;
          Y = py + cx * s + cy * c;
        }
        return [X, Y];
      });
      r.drawImageQuad(id, corners, { level: bright ? (player.fixedcolormap || 0) : level, fuzz });
    };
    draw(psp.state, false);
    const flash = player.psprites[PS_FLASH];
    if (flash.state && !override) draw(flash.state, true);
    if (m.reload && this.settings.get('shellCasings') !== false) this.drawReloadProp(player, frac, dx, dy, yShift);
  }

  // Small palette-art props for reloads: magazine or shotgun shell.
  drawReloadProp(player, frac, dx, dy, yShift) {
    const r = this.r;
    const rl = player.mods.reload;
    const sx = r.vScaleX, sy = r.vScaleY;
    const baseX = r.vLeft + (176 + dx * 0.6) * sx;
    if (rl.tube) {
      if (rl.phase !== 'load') return;
      const p = (rl.t + frac) / 11;
      const yy = (200 + yShift - 20 * Math.sin(p * Math.PI) + 4) * sy;
      const x = baseX - 10 * sx;
      r.fillRect(x, yy, 3 * sx, 6 * sy, 183);
      r.fillRect(x, yy + 6 * sy, 3 * sx, 2 * sy, 231);
      return;
    }
    const p = Math.min(1, (rl.t + frac) / rl.total);
    let yy;
    if (p < 0.22) return;
    if (p < 0.4) yy = 200 + yShift + (p - 0.22) * 200;
    else if (p < 0.55) yy = 200 + yShift + (0.55 - p) * 260 - 10;
    else return;
    const x = baseX - 6 * sx;
    r.fillRect(x, yy * sy, 5 * sx, 12 * sy, 100);
    r.fillRect(x, yy * sy, 5 * sx, 2 * sy, 96);
  }

  drawCrosshair(player, rect) {
    const mode = this.settings.get('crosshair');
    if (!mode || player.playerstate !== 'live') return;
    if (player.mods.ads > 0.6) return;
    const r = this.r;
    const cx = Math.round(rect.x + rect.w / 2);
    const cy = Math.round(rect.y + rect.h / 2);
    const s = Math.max(1, Math.round(r.pixelScale));
    const col = 4; // white
    if (mode === 1) {
      r.fillRect(cx - Math.floor(s / 2), cy - Math.floor(s / 2), s, s, col);
    } else {
      const g = 2 * s, l = 3 * s;
      r.fillRect(cx - g - l, cy, l, s, col);
      r.fillRect(cx + g, cy, l, s, col);
      r.fillRect(cx, cy - g - l, s, l, col);
      r.fillRect(cx, cy + g, s, l, col);
    }
    const hm = player.hitMarker || 0;
    if (hm > 0 && this.settings.get('hitMarkers')) {
      const c = player.hitMarkerKill ? 176 : 4;
      for (let i = 2; i < 5; i++) {
        const d = i * s;
        r.fillRect(cx - d, cy - d, s, s, c);
        r.fillRect(cx + d, cy - d, s, s, c);
        r.fillRect(cx - d, cy + d, s, s, c);
        r.fillRect(cx + d, cy + d, s, s, c);
      }
    }
  }

  drawDamageIndicators(player, rect) {
    if (!this.settings.get('damageIndicators')) return;
    const r = this.r;
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    const rad = Math.min(rect.w, rect.h) * 0.32;
    const s = Math.max(1, Math.round(r.pixelScale));
    for (const d of player.damageDirs) {
      const rel = d.angle - player.mo.angle;
      // 0 = in front (up on screen)
      const a = -rel + Math.PI / 2;
      for (let k = -4; k <= 4; k++) {
        const aa = a + k * 0.045;
        const x = cx + Math.cos(aa) * rad;
        const y = cy - Math.sin(aa) * rad;
        if (d.t > 8 || (d.t & 1)) r.fillRect(Math.round(x), Math.round(y), s * 2, s * 2, 176 + Math.min(7, 8 - (d.t >> 2)));
      }
    }
  }
}
