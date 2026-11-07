// =============================================================================
// Moving-map renderer (Canvas 2D). Base imagery = assets/ife/map/day.jpg (procedural
// shaded relief of the fictional region, equirectangular) + night.jpg (city lights),
// geo.json (bounds, cities, labels).
//
//   const mv = new MapView(app);  await mv.ready;
//   mv.draw(ctx, x, y, w, h, { view: 'overview'|'zoom'|'3d'|'mini', st, units, t })
//
// Views: overview (whole route, north up), zoom (aircraft-centred, north up),
// 3d (heading-up perspective "mode-7" projection with sky), mini (small widget).
// A smooth day/night terminator is computed from the sun clock (st.timeOfDay).
// =============================================================================
import { C, font, text, fillRR, clamp01, compass } from '../ui/kit.js';
import { icon } from '../ui/icons.js';

const DEG = Math.PI / 180;
const DEC = 23.44;            // solar declination (environment module: June 21st)
const SOLAR_OFFSET = 0.42;    // solar time = local clock + offset (environment module)
const ORIGIN = { lat: 37.6, lon: -122.4 };
const DEST = { lat: 35.42, lon: -97.55 };

const V3 = { U: 340, camH: 0.25, camBack: 0.45, f: 0.56 };

export function greatCircle(lat1, lon1, lat2, lon2, f, out = {}) {
  const p1 = lat1 * DEG, l1 = lon1 * DEG, p2 = lat2 * DEG, l2 = lon2 * DEG;
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d < 1e-9) { out.lat = lat1; out.lon = lon1; return out; }
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  out.lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / DEG;
  out.lon = Math.atan2(y, x) / DEG;
  out.dist = d * 6371;
  return out;
}

function loadImage(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => resolve(im);
    im.onerror = () => { console.warn('[ife] map image failed', src); resolve(null); };
    im.src = src;
  });
}

export class MapView {
  constructor(app, base = 'assets/ife/map') {
    this.app = app;
    this.day = null; this.night = null; this.geo = null;
    this.route = [];
    for (let i = 0; i <= 96; i++) this.route.push(greatCircle(ORIGIN.lat, ORIGIN.lon, DEST.lat, DEST.lon, i / 96));
    this.bounds = { lon0: -134, lon1: -84, lat0: 24, lat1: 50 };
    this.size = [3072, 2000];
    this._mask = document.createElement('canvas'); this._mask.width = 48; this._mask.height = 32;
    this._maskCtx = this._mask.getContext('2d');
    this._maskData = this._maskCtx.createImageData(48, 32);
    this._layer = document.createElement('canvas');
    this._layerCtx = this._layer.getContext('2d');
    this._off = document.createElement('canvas');        // heading-up map for the 3D view
    this._off.width = 2048; this._off.height = 1024;
    this._offCtx = this._off.getContext('2d');
    this._p = { x: 0, y: 0 };
    this._labels = [];
    this.ready = Promise.all([
      loadImage(`${base}/day.jpg`), loadImage(`${base}/night.jpg`),
      (app?.assets?.json ? app.assets.json(`${base}/geo.json`) : fetch(`${base}/geo.json`).then((r) => r.json())).catch(() => null),
    ]).then(([d, n, g]) => {
      this.day = d; this.night = n; this.geo = g;
      if (g?.bounds) this.bounds = g.bounds;
      if (g?.size) this.size = g.size;
    });
  }

  // base-image pixel coordinates
  bx(lon) { const b = this.bounds; return (lon - b.lon0) / (b.lon1 - b.lon0) * this.size[0]; }
  by(lat) { const b = this.bounds; return (b.lat1 - lat) / (b.lat1 - b.lat0) * this.size[1]; }
  lonAt(bx) { const b = this.bounds; return b.lon0 + bx / this.size[0] * (b.lon1 - b.lon0); }
  latAt(by) { const b = this.bounds; return b.lat1 - by / this.size[1] * (b.lat1 - b.lat0); }
  /** base px per km (approx, north-south) */
  get pxPerKm() { return this.size[1] / ((this.bounds.lat1 - this.bounds.lat0) * 111.2); }

  /** camera: { cx, cy (base px), s (target px per base px), r (rad), ox, oy (target px) } */
  project(cam, lat, lon, out = this._p) {
    const dx = (this.bx(lon) - cam.cx) * cam.s, dy = (this.by(lat) - cam.cy) * cam.s;
    const c = Math.cos(cam.r), s = Math.sin(cam.r);
    out.x = cam.ox + dx * c - dy * s;
    out.y = cam.oy + dx * s + dy * c;
    return out;
  }
  unproject(cam, tx, ty, out = {}) {
    const dx = tx - cam.ox, dy = ty - cam.oy;
    const c = Math.cos(-cam.r), s = Math.sin(-cam.r);
    const ux = (dx * c - dy * s) / cam.s + cam.cx, uy = (dx * s + dy * c) / cam.s + cam.cy;
    out.lon = this.lonAt(ux); out.lat = this.latAt(uy);
    return out;
  }

  /** Solar elevation (deg) at lat/lon for the sun clock (local hours at the aircraft longitude). */
  sunElevation(lat, lon, tod, acLon) {
    const H = ((tod + SOLAR_OFFSET - 12) * 15 + (lon - acLon)) * DEG;
    const phi = lat * DEG, d = DEC * DEG;
    return Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H)) / DEG;
  }

  /** Draw base imagery (day + night blend) into ctx for camera cam over the target rect. */
  _drawBase(ctx, cam, x, y, w, h, st) {
    ctx.fillStyle = '#12304e';
    ctx.fillRect(x, y, w, h);
    if (!this.day) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.translate(cam.ox, cam.oy); ctx.rotate(cam.r); ctx.scale(cam.s, cam.s); ctx.translate(-cam.cx, -cam.cy);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.day, 0, 0, this.size[0], this.size[1]);
    ctx.restore();
    // night side: half-res layer of the night image masked by a smooth terminator
    const tod = st?.timeOfDay ?? 16.5, acLon = st?.mapLon ?? ORIGIN.lon;
    const M = this._maskData.data, mw = 48, mh = 32;
    let any = false;
    const q = {};
    for (let j = 0; j < mh; j++) {
      for (let i = 0; i < mw; i++) {
        this.unproject(cam, x + (i + 0.5) / mw * w, y + (j + 0.5) / mh * h, q);
        const el = this.sunElevation(q.lat, q.lon, tod, acLon);
        const a = clamp01((1.5 - el) / 9);     // civil twilight fade
        const k = (j * mw + i) * 4;
        M[k] = M[k + 1] = M[k + 2] = 255; M[k + 3] = Math.round(a * 255);
        if (a > 0.01) any = true;
      }
    }
    if (!any || !this.night) return;
    this._maskCtx.putImageData(this._maskData, 0, 0);
    const L = this._layer, lw = Math.max(2, Math.ceil(w / 2)), lh = Math.max(2, Math.ceil(h / 2));
    if (L.width !== lw || L.height !== lh) { L.width = lw; L.height = lh; }
    const lc = this._layerCtx;
    lc.globalCompositeOperation = 'source-over';
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, lw, lh);
    lc.save();
    lc.scale(lw / w, lh / h);
    lc.translate(cam.ox - x, cam.oy - y); lc.rotate(cam.r); lc.scale(cam.s, cam.s); lc.translate(-cam.cx, -cam.cy);
    lc.fillStyle = '#040810';
    lc.fillRect(-4000, -4000, 12000, 12000);
    lc.drawImage(this.night, 0, 0, this.size[0], this.size[1]);
    lc.restore();
    lc.globalCompositeOperation = 'destination-in';
    lc.imageSmoothingEnabled = true;
    lc.drawImage(this._mask, 0, 0, lw, lh);
    lc.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.globalAlpha *= 0.92;
    ctx.drawImage(L, x, y, w, h);
    ctx.restore();
  }

  _grid(ctx, cam, x, y, w, h, step, labels) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 1;
    const b = this.bounds;
    ctx.beginPath();
    for (let lon = Math.ceil(b.lon0 / step) * step; lon <= b.lon1 + 20; lon += step) {
      for (let k = 0; k <= 8; k++) {
        const p = this.project(cam, b.lat0 - 10 + k * (b.lat1 - b.lat0 + 20) / 8, lon);
        if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
    }
    for (let lat = Math.ceil((b.lat0 - 10) / step) * step; lat <= b.lat1 + 10; lat += step) {
      for (let k = 0; k <= 8; k++) {
        const p = this.project(cam, lat, b.lon0 - 20 + k * (b.lon1 - b.lon0 + 40) / 8);
        if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();
    if (labels) {
      for (let lat = Math.ceil((b.lat0 - 10) / step) * step; lat <= b.lat1 + 10; lat += step) {
        const p = this.project(cam, lat, this.unproject(cam, x + 8, y + h / 2).lon);
        if (p.y > y + 20 && p.y < y + h - 10) text(ctx, `${Math.abs(lat)}°${lat >= 0 ? 'N' : 'S'}`, x + 8, p.y - 5, { size: 14, weight: 500, color: 'rgba(255,255,255,0.45)' });
      }
      for (let lon = Math.ceil(b.lon0 / step) * step; lon <= b.lon1 + 20; lon += step) {
        const p = this.project(cam, this.unproject(cam, x + w / 2, y + h - 8).lat, lon);
        if (p.x > x + 50 && p.x < x + w - 40) text(ctx, `${Math.abs(lon)}°${lon < 0 ? 'W' : 'E'}`, p.x + 4, y + h - 10, { size: 14, weight: 500, color: 'rgba(255,255,255,0.45)' });
      }
    }
    ctx.restore();
  }

  _route(ctx, cam, f, scale = 1) {
    // remaining (dashed) then flown (solid)
    const pts = this.route;
    const n = pts.length - 1;
    const k = Math.max(0, Math.min(n, Math.floor(f * n)));
    const ac = greatCircle(ORIGIN.lat, ORIGIN.lon, DEST.lat, DEST.lon, f, {});
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // remaining
    ctx.beginPath();
    let p = this.project(cam, ac.lat, ac.lon); ctx.moveTo(p.x, p.y);
    for (let i = k + 1; i <= n; i++) { p = this.project(cam, pts[i].lat, pts[i].lon); ctx.lineTo(p.x, p.y); }
    ctx.setLineDash([10 * scale, 9 * scale]);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3 * scale;
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.setLineDash([]);
    // flown
    ctx.beginPath();
    p = this.project(cam, pts[0].lat, pts[0].lon); ctx.moveTo(p.x, p.y);
    for (let i = 1; i <= k; i++) { p = this.project(cam, pts[i].lat, pts[i].lon); ctx.lineTo(p.x, p.y); }
    p = this.project(cam, ac.lat, ac.lon); ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 4.5 * scale;
    ctx.stroke();
    ctx.restore();
  }

  _cities(ctx, cam, x, y, w, h, minPop, scale = 1) {
    const g = this.geo;
    if (!g) return;
    const placed = this._labels; placed.length = 0;
    const fits = (r) => { for (const o of placed) if (r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y) return false; placed.push(r); return true; };
    // reserve aircraft & endpoints first
    const list = [...g.cities].sort((a, b) => (b.kind ? 10 : 0) + b.pop - ((a.kind ? 10 : 0) + a.pop));
    ctx.save();
    for (const c of g.cities.length ? list : []) {
      if (!c.kind && c.pop < minPop) continue;
      const p = this.project(cam, c.lat, c.lon);
      if (p.x < x - 20 || p.x > x + w + 20 || p.y < y - 20 || p.y > y + h + 20) continue;
      const special = !!c.kind;
      const size = (special ? 22 : 15 + c.pop * 1.4) * scale;
      ctx.font = font(size, special ? 700 : 500);
      const label = special ? `${c.name.toUpperCase()}` : c.name;
      const tw = ctx.measureText(label).width;
      const r = { x: p.x + 10 * scale, y: p.y - size * 0.8, w: tw + 6, h: size * 1.1 };
      if (!special && !fits(r)) continue;
      if (special) placed.push(r);
      if (special) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 9 * scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(232,176,75,0.25)'; ctx.fill();
        ctx.lineWidth = 2.5 * scale; ctx.strokeStyle = C.gold; ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 * scale, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, (2.5 + c.pop * 0.5) * scale, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
      }
      ctx.lineWidth = 3.5 * scale; ctx.strokeStyle = 'rgba(5,14,26,0.75)';
      ctx.lineJoin = 'round';
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      let lx = p.x + 12 * scale;
      if (lx + tw > x + w - 6) { ctx.textAlign = 'right'; lx = p.x - 12 * scale; }
      ctx.strokeText(label, lx, p.y + size * 0.3);
      ctx.fillStyle = special ? '#fff' : 'rgba(255,255,255,0.92)';
      ctx.fillText(label, lx, p.y + size * 0.3);
    }
    // physical labels
    for (const lb of scale < 1 ? [] : g.labels || []) {
      if (lb.size < (minPop > 2 ? 2 : 0)) continue;
      const p = this.project(cam, lb.lat, lb.lon);
      if (p.x < x || p.x > x + w || p.y < y || p.y > y + h) continue;
      const size = (lb.kind === 'sea' ? 20 + lb.size * 2 : 15) * scale;
      ctx.font = `${lb.kind === 'sea' ? 'italic ' : ''}${font(size, lb.kind === 'range' ? 600 : 400)}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${(lb.kind === 'sea' ? 3 : 2) * scale}px`;
      ctx.textAlign = 'center';
      ctx.fillStyle = lb.water ? 'rgba(170,210,240,0.7)' : 'rgba(60,40,20,0.55)';
      if (lb.kind === 'region') ctx.fillStyle = 'rgba(80,60,30,0.5)';
      ctx.fillText(lb.name, p.x, p.y);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }
    ctx.restore();
  }

  _aircraft(ctx, px, py, rotRad, size) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rotRad);
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = size * 0.25; ctx.shadowOffsetY = size * 0.08;
    icon(ctx, 'plane', -size / 2, -size / 2, size, '#ffffff');
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    icon(ctx, 'plane', -size * 0.36, -size * 0.36, size * 0.72, C.gold);
    ctx.restore();
  }

  _scaleBar(ctx, cam, x, y, units) {
    const imperial = units !== 'metric';
    const kmPerPx = 1 / (this.pxPerKm * cam.s);
    const unitKm = imperial ? 1.609344 : 1;
    const targetPx = 140;
    const raw = targetPx * kmPerPx / unitKm;
    const pow = 10 ** Math.floor(Math.log10(raw));
    const nice = [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= raw * 0.6) || pow * 10;
    const len = nice * unitKm / kmPerPx;
    fillRR(ctx, x - 10, y - 30, len + 120, 44, 10, 'rgba(5,14,26,0.55)');
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, len, 3);
    ctx.fillRect(x, y - 8, 2, 11); ctx.fillRect(x + len - 2, y - 8, 2, 11);
    text(ctx, `${nice} ${imperial ? 'mi' : 'km'}`, x + len + 10, y + 5, { size: 16, weight: 600 });
  }

  _north(ctx, x, y, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fillStyle = 'rgba(5,14,26,0.6)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(6, 2); ctx.lineTo(-6, 2); ctx.closePath(); ctx.fillStyle = C.red; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 17); ctx.lineTo(6, 2); ctx.lineTo(-6, 2); ctx.closePath(); ctx.fillStyle = '#ddd'; ctx.fill();
    text(ctx, 'N', 0, -26, { size: 13, weight: 700, align: 'center', baseline: 'bottom' });
    ctx.restore();
  }

  /** Aircraft position + map heading (deg, compass). */
  _ac(st) {
    const lat = st?.mapLat ?? ORIGIN.lat, lon = st?.mapLon ?? ORIGIN.lon;
    let hdg = st?.heading ?? 90;
    if ((st?.routeProgress ?? 0) > 0.003 && (st?.routeProgress ?? 0) < 0.997 && Number.isFinite(st?.mapBearing)) hdg = st.mapBearing;
    return { lat, lon, hdg };
  }

  draw(ctx, x, y, w, h, { view = 'overview', st = null, units = 'imperial', t = 0, mini = false } = {}) {
    const ac = this._ac(st);
    const f = clamp01(st?.routeProgress ?? 0);
    if (view === '3d') return this._draw3d(ctx, x, y, w, h, st, ac, f, t, units);
    const cam = { cx: 0, cy: 0, s: 1, r: 0, ox: x + w / 2, oy: y + h / 2 };
    if (view === 'zoom') {
      cam.cx = this.bx(ac.lon); cam.cy = this.by(ac.lat);
      cam.s = (w / 1000) / (this.pxPerKm);  // ~1000 km across
    } else {
      // fit origin + destination (+ aircraft) with margins
      const xs = [this.bx(ORIGIN.lon), this.bx(DEST.lon)], ys = [this.by(ORIGIN.lat), this.by(DEST.lat)];
      const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
      const padL = mini ? 0.12 : 0.16, padR = mini ? 0.42 : 0.3, padY = mini ? 0.5 : 0.62;
      const spanX = (maxx - minx) * (1 + padL + padR), spanY = Math.max((maxy - miny) * (1 + 2 * padY), spanX * h / w);
      cam.s = Math.min(w / spanX, h / spanY);
      cam.cx = (minx + maxx) / 2 + (maxx - minx) * (padR - padL) / 2; cam.cy = (miny + maxy) / 2 + (mini ? 0 : -60);
    }
    this._drawBase(ctx, cam, x, y, w, h, st);
    this._grid(ctx, cam, x, y, w, h, view === 'zoom' ? 2 : 5, !mini);
    this._cities(ctx, cam, x, y, w, h, view === 'zoom' ? 1 : (mini ? 4 : 3), mini ? 0.75 : 1);
    this._route(ctx, cam, f, mini ? 0.7 : 1);
    const p = this.project(cam, ac.lat, ac.lon);
    this._aircraft(ctx, p.x, p.y, ac.hdg * DEG + cam.r, mini ? 34 : (view === 'zoom' ? 64 : 50));
    if (!mini) {
      this._scaleBar(ctx, cam, x + 30, y + h - 34, units);
      this._north(ctx, x + w - 44, y + 46, cam.r);
    }
    return cam;
  }

  // -------------------------------------------------------------------------------------- 3D
  _draw3d(ctx, x, y, w, h, st, ac, f, t, units) {
    const O = this._off, oc = this._offCtx, NW = O.width, NH = O.height;
    // heading-up map: aircraft at (NW/2, NH*0.9); U = offscreen px per "camera unit" (~390 km)
    const hdgR = ac.hdg * DEG;
    const U = V3.U, kmPerU = 390;
    const cam = { cx: this.bx(ac.lon), cy: this.by(ac.lat), s: U / (kmPerU * this.pxPerKm), r: -hdgR, ox: NW / 2, oy: NH * 0.9 };
    oc.setTransform(1, 0, 0, 1, 0, 0);
    this._drawBase(oc, cam, 0, 0, NW, NH, st);
    this._grid(oc, cam, 0, 0, NW, NH, 2, false);
    this._route(oc, cam, f, 1.6);
    // sky
    const night = clamp01((1.5 - this.sunElevation(ac.lat, ac.lon, st?.timeOfDay ?? 16.5, ac.lon)) / 9);
    const horizon = y + h * 0.28;
    const sky = ctx.createLinearGradient(0, y, 0, horizon);
    const mix = (a, b) => a.map((v, i) => Math.round(v + (b[i] - v) * night));
    const top = mix([38, 92, 168], [6, 10, 24]), mid = mix([128, 176, 222], [24, 34, 64]), hz = mix([214, 226, 236], [60, 58, 86]);
    sky.addColorStop(0, `rgb(${top})`); sky.addColorStop(0.7, `rgb(${mid})`); sky.addColorStop(1, `rgb(${hz})`);
    ctx.fillStyle = sky;
    ctx.fillRect(x, y, w, horizon - y + 2);
    const camH = V3.camH, camBack = V3.camBack, fpx = w * V3.f;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, horizon, w, y + h - horizon); ctx.clip();
    ctx.fillStyle = `rgb(${hz})`;
    ctx.fillRect(x, horizon, w, y + h - horizon);
    ctx.imageSmoothingEnabled = true;
    const step = 3;
    for (let r = horizon; r < y + h; r += step) {
      const ang = Math.atan((r - horizon + step * 0.5) / fpx);
      const dist = camH / Math.tan(Math.max(0.003, ang));
      const fwd = dist - camBack;
      const v = cam.oy - fwd * U;
      if (v < 0) continue;
      const half = (w / 2) / fpx * dist * U;
      ctx.drawImage(O, NW / 2 - half, Math.min(NH - 1, v), half * 2, 1, x, r, w, step + 0.6);
    }
    const hz2 = ctx.createLinearGradient(0, horizon, 0, horizon + h * 0.2);
    hz2.addColorStop(0, `rgba(${hz},1)`); hz2.addColorStop(0.35, `rgba(${hz},0.55)`); hz2.addColorStop(1, `rgba(${hz},0)`);
    ctx.fillStyle = hz2;
    ctx.fillRect(x, horizon, w, h * 0.2);
    ctx.restore();
    // city labels standing on the ground
    const g = this.geo;
    const q = {};
    if (g) {
      const items = [];
      for (const c of g.cities) {
        if (!c.kind && c.pop < 2) continue;
        const p = this.project(cam, c.lat, c.lon, q);
        let fwd = (cam.oy - p.y) / U + camBack;
        let lat = (p.x - NW / 2) / U;
        if (c.kind && fwd > 2.9 && lat / fwd < 1.2) { lat *= 2.9 / fwd; fwd = 2.9; }   // destination: pin at the horizon
        if (fwd < 0.12 || fwd > 2.9) continue;
        const sy = horizon + Math.atan(camH / fwd) * fpx;
        const sx = x + w / 2 + lat / fwd * fpx;
        if (sx < x - 50 || sx > x + w + 50 || sy > y + h) continue;
        items.push({ c, sx, sy, fwd });
      }
      // nearest first for decluttering, then draw far-to-near
      items.sort((a, b) => (b.c.kind ? 1 : 0) - (a.c.kind ? 1 : 0) || a.fwd - b.fwd);
      const boxes = [], keep = [];
      for (const it of items) {
        const s = clamp01(0.9 / (it.fwd + 0.2));
        it.size = (it.c.kind ? 24 : 16) * (0.6 + 0.6 * s);
        it.pole = 18 + 40 * s;
        ctx.font = font(it.size, it.c.kind ? 700 : 600);
        const tw = ctx.measureText(it.c.name).width + 16;
        const r = { x: it.sx - tw / 2, y: it.sy - it.pole - it.size - 8, w: tw, h: it.size + 12 };
        if (boxes.some((o) => r.x < o.x + o.w + 4 && r.x + r.w + 4 > o.x && r.y < o.y + o.h + 2 && r.y + r.h + 2 > o.y)) continue;
        boxes.push(r); keep.push(it);
      }
      keep.sort((a, b) => b.fwd - a.fwd);
      for (const it of keep) {
        const size = it.size, pole = it.pole;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(it.sx, it.sy); ctx.lineTo(it.sx, it.sy - pole); ctx.stroke();
        ctx.beginPath(); ctx.arc(it.sx, it.sy, it.c.kind ? 5 : 3, 0, 7); ctx.fillStyle = it.c.kind ? C.gold : '#fff'; ctx.fill();
        ctx.font = font(size, it.c.kind ? 700 : 600);
        const tw = ctx.measureText(it.c.name).width;
        fillRR(ctx, it.sx - tw / 2 - 8, it.sy - pole - size - 8, tw + 16, size + 12, 6, it.c.kind ? 'rgba(232,176,75,0.92)' : 'rgba(6,18,32,0.72)');
        text(ctx, it.c.name, it.sx, it.sy - pole - 6, { size, weight: it.c.kind ? 700 : 600, align: 'center', color: it.c.kind ? '#1a1407' : '#fff' });
      }
    }
    // our aircraft (seen from behind/above)
    const ax = x + w / 2, ay = horizon + Math.atan(camH / camBack) * fpx;
    const acy = Math.min(y + h - 60, ay);
    ctx.save();
    ctx.translate(ax, acy);
    ctx.scale(1, 0.55);
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 26;
    icon(ctx, 'plane', -60, -60, 120, '#f4f6f8');
    ctx.restore();
    // heading tape
    const hdg = ((ac.hdg % 360) + 360) % 360;
    fillRR(ctx, x + w / 2 - 70, y + 16, 140, 40, 20, 'rgba(5,14,26,0.6)');
    text(ctx, `${compass(hdg)}  ${String(Math.round(hdg)).padStart(3, '0')}°`, x + w / 2, y + 43, { size: 20, weight: 700, align: 'center' });
    void t; void units;
    return cam;
  }
}

export { ORIGIN, DEST };
