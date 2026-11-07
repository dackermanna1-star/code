// Accurate top-down Boeing 737-800 seat map (SVG), drawn from the shared
// geometry contract in core/constants.js. Nose to the left; the starboard
// (right, +X) side is at the top, so seat A (port) rows are at the bottom.
// Units: centimetres in aircraft-local space.
import { ROWS, SEAT_LIST, SEAT, ZONES, DOORS, WINDOWS, WINDOW, AIRCRAFT } from '../core/constants.js';

const Z0 = -18.4, Z1 = 15.6;          // map extent along the fuselage (m)
const W = Math.round((Z1 - Z0) * 100);
const H = 560, CY = H / 2;
const R_OUT = AIRCRAFT.fuselage.radiusOuter * 100;   // 188
const R_IN = 172;                                     // lining at seat height
const X = (z) => +((z - Z0) * 100).toFixed(1);
const Y = (x) => +(CY - x * 100).toFixed(1);

export function seatInfo(s) {
  const bits = [];
  bits.push(s.cls === 'business' ? 'Business' : 'Economy');
  bits.push(s.isWindow ? 'Window' : s.isAisle ? 'Aisle' : 'Middle');
  if (s.exitRow) bits.push('Exit row · extra legroom');
  if (s.bulkheadInFront) bits.push('Bulkhead');
  if (s.row === 15) bits.push('Limited recline');
  if (s.row >= 28) bits.push('Near rear galley');
  if (s.isWindow && s.row >= 9 && s.row <= 21) bits.push('Wing view');
  return bits.join(' · ');
}

function rect(x, y, w, h, attrs = '') { return `<rect x="${(+x).toFixed(1)}" y="${(+y).toFixed(1)}" width="${(+w).toFixed(1)}" height="${(+h).toFixed(1)}" ${attrs}/>`; }

export function buildSeatMap({ current = null, assigned = null } = {}) {
  const parts = [];
  parts.push(`<defs>
    <linearGradient id="hnHull" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a3a4d"/><stop offset="0.5" stop-color="#3a4d63"/><stop offset="1" stop-color="#2a3a4d"/>
    </linearGradient>
    <linearGradient id="hnFloor" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#16222f"/><stop offset="0.5" stop-color="#1a2836"/><stop offset="1" stop-color="#16222f"/>
    </linearGradient>
    <linearGradient id="hnWing" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(120,145,170,0.0)"/><stop offset="1" stop-color="rgba(120,145,170,0.22)"/>
    </linearGradient>
    <linearGradient id="hnWingB" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="rgba(120,145,170,0.0)"/><stop offset="1" stop-color="rgba(120,145,170,0.22)"/>
    </linearGradient>
    <linearGradient id="hnTail" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="1"/>
    </linearGradient>
    <pattern id="hnHatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="14" height="14" fill="#223142"/><path d="M0 0v14" stroke="#2b3d52" stroke-width="6"/>
    </pattern>
  </defs>`);

  // wings (root LE z=-2.6, TE 4.72, 25 deg sweep) — fade out with span
  const le = AIRCRAFT.wing.rootLeadingEdgeZ, te = AIRCRAFT.wing.rootTrailingEdgeZ, sw = Math.tan(25 * Math.PI / 180);
  const span = 3.4;
  for (const sgn of [1, -1]) {
    const r0 = sgn * AIRCRAFT.fuselage.radiusOuter, r1 = sgn * (AIRCRAFT.fuselage.radiusOuter + span);
    const pts = [[le, r0], [le + span * sw, r1], [te + span * 0.12, r1], [te, r0]];
    parts.push(`<polygon points="${pts.map(([z, x]) => `${X(z)},${Y(x)}`).join(' ')}" fill="url(#${sgn > 0 ? 'hnWing' : 'hnWingB'})" stroke="rgba(150,175,200,0.25)" stroke-width="2"/>`);
  }

  // fuselage outer skin: nose cap, parallel section, tail taper
  const nz = -15.2, tz0 = 12.6;
  const yT = Y(R_OUT / 100), yB = Y(-R_OUT / 100);
  parts.push(`<path d="M ${X(nz)} ${yT} L ${X(tz0)} ${yT} C ${X(14.4)} ${yT}, ${X(15.4)} ${Y(1.5)}, ${X(Z1 + 1)} ${Y(1.25)} L ${X(Z1 + 1)} ${Y(-1.25)} C ${X(15.4)} ${Y(-1.5)}, ${X(14.4)} ${yB}, ${X(tz0)} ${yB} L ${X(nz)} ${yB} C ${X(-17.2)} ${yB}, ${X(-18.3)} ${Y(-0.9)}, ${X(-18.35)} ${CY} C ${X(-18.3)} ${Y(0.9)}, ${X(-17.2)} ${yT}, ${X(nz)} ${yT} Z" fill="url(#hnHull)" stroke="rgba(190,210,230,0.35)" stroke-width="3"/>`);
  // cockpit windscreen hint
  parts.push(`<path d="M ${X(-17.7)} ${Y(0.75)} Q ${X(-18.05)} ${CY} ${X(-17.7)} ${Y(-0.75)}" fill="none" stroke="rgba(120,180,210,0.55)" stroke-width="9" stroke-linecap="round"/>`);

  // cabin floor (inner lining) from the flight deck door to the aft bulkhead
  const fz0 = ZONES.flightDeckDoorZ, fz1 = ZONES.aftBulkheadZ;
  parts.push(rect(X(fz0), Y(R_IN / 100), (fz1 - fz0) * 100, 2 * R_IN, 'rx="22" fill="url(#hnFloor)" stroke="rgba(255,255,255,0.12)" stroke-width="2"'));
  // flight deck
  parts.push(`<path d="M ${X(fz0)} ${Y(1.5)} L ${X(-17.0)} ${Y(1.2)} Q ${X(-17.9)} ${CY} ${X(-17.0)} ${Y(-1.2)} L ${X(fz0)} ${Y(-1.5)} Z" fill="#162130" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>`);
  parts.push(`<text x="${X(-16.75)}" y="${CY + 9}" text-anchor="middle" font-size="24" fill="rgba(200,215,230,0.55)" letter-spacing="2" transform="rotate(-90 ${X(-16.75)} ${CY})">FLIGHT DECK</text>`);
  parts.push(`<line x1="${X(fz0)}" y1="${Y(1.66)}" x2="${X(fz0)}" y2="${Y(-1.66)}" stroke="rgba(220,230,240,0.5)" stroke-width="5"/>`);

  // windows
  for (const w of WINDOWS) {
    const x0 = X(w.z - WINDOW.paneWidth / 2);
    const y = w.side === 'right' ? Y(1.83) : Y(-1.76);
    parts.push(rect(x0, y - 0, WINDOW.paneWidth * 100, 7, `rx="3" fill="${w.inHatch ? 'rgba(232,176,75,0.65)' : 'rgba(140,200,230,0.55)'}"`));
  }

  // monuments: lavs & galleys
  const mon = (zMin, zMax, xMin, xMax, label, kind) => {
    parts.push(rect(X(zMin) + 3, Y(xMax) + 3, (zMax - zMin) * 100 - 6, (xMax - xMin) * 100 - 6, `rx="8" fill="${kind === 'lav' ? '#26394d' : 'url(#hnHatch)'}" stroke="rgba(255,255,255,0.22)" stroke-width="2"`));
    const cx = X((zMin + zMax) / 2), cy = Y((xMin + xMax) / 2);
    if (kind === 'lav') {
      parts.push(`<g transform="translate(${cx - 13} ${cy - 30})" fill="rgba(210,225,240,0.7)"><circle cx="8" cy="5" r="4"/><circle cx="20" cy="5" r="4"/><path d="M4 11h8v12H4zM16 11h8l2 12h-12z"/></g>`);
      parts.push(`<text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="19" fill="rgba(210,225,240,0.75)" letter-spacing="1">${label}</text>`);
    } else {
      parts.push(`<text x="${cx}" y="${cy + 7}" text-anchor="middle" font-size="21" fill="rgba(220,230,240,0.78)" letter-spacing="2">${label}</text>`);
    }
  };
  const fl = ZONES.forwardLav, fg = ZONES.forwardGalley, al = ZONES.aftLavs, ag = ZONES.aftGalley;
  mon(fl.zMin, fl.zMax, fl.xMin, fl.xMax, 'LAV', 'lav');
  mon(fg.zMin, fg.zMax, fg.xMin, fg.xMax, 'GALLEY', 'galley');
  mon(al.zMin, al.zMax, al.left.xMin, al.left.xMax, 'LAV', 'lav');
  mon(al.zMin, al.zMax, al.right.xMin, al.right.xMax, 'LAV', 'lav');
  mon(ag.zMin, ag.zMax, -1.62, 1.62, 'GALLEY', 'galley');

  // business front partition & class divider (side walls, aisle open)
  for (const [z, dash] of [[ZONES.businessFrontBulkheadZ, ''], [ZONES.classDividerZ, 'stroke-dasharray="10 8"']]) {
    parts.push(`<line x1="${X(z)}" y1="${Y(1.68)}" x2="${X(z)}" y2="${Y(0.42)}" stroke="rgba(220,230,240,0.45)" stroke-width="5" ${dash}/>`);
    parts.push(`<line x1="${X(z)}" y1="${Y(-0.42)}" x2="${X(z)}" y2="${Y(-1.68)}" stroke="rgba(220,230,240,0.45)" stroke-width="5" ${dash}/>`);
  }
  // crew jumpseats near the doors (small)
  for (const [z, x] of [[-14.95 + 0.25, 0.3], [-14.95 + 0.25, -0.3], [12.78 - 0.22, 0.3], [12.78 - 0.22, -0.3]]) {
    parts.push(rect(X(z) - 13, Y(x) - 18, 26, 36, 'rx="5" fill="#334659" opacity="0.8"'));
  }

  // doors and exits (drawn across the hull, labelled outside)
  for (const [id, d] of Object.entries(DOORS)) {
    const top = d.side === 'right';
    const ow = d.kind === 'overwing';
    const y0 = top ? Y(R_OUT / 100) - 8 : Y(-R_IN / 100) - 4;
    parts.push(rect(X(d.z - d.width / 2), y0, d.width * 100, (R_OUT - R_IN) + 14, `rx="4" fill="${ow ? '#e8b04b' : '#e8b04b'}" opacity="${ow ? 0.9 : 0.95}"`));
    const ly = top ? Y(R_OUT / 100) - 22 : Y(-R_OUT / 100) + 40;
    const label = ow ? 'EXIT' : id;
    parts.push(`<text x="${X(d.z)}" y="${ly}" text-anchor="middle" font-size="${ow ? 19 : 23}" font-weight="700" fill="#f2c779" letter-spacing="1.5">${label}</text>`);
  }

  // seats
  for (const s of SEAT_LIST) {
    const sp = s.cls === 'business' ? SEAT.business : SEAT.economy;
    const w = sp.width * 100 - (s.cls === 'business' ? 10 : 6);
    const d = sp.depth * 100;
    const zF = s.z - sp.depth / 2 + 0.04;    // front edge of the cushion
    const x = X(zF), y = Y(s.x) - w / 2;
    const backW = s.cls === 'business' ? 13 : 10;
    const cls = ['hn-seat', s.cls === 'business' ? 'biz' : '', s.exitRow ? 'exit' : '', s.id === current ? 'current' : '', s.id === assigned ? 'assigned' : ''].filter(Boolean).join(' ');
    const label = `Seat ${s.id}, ${seatInfo(s)}`;
    const af = s.id === (current || assigned) ? ' data-autofocus=""' : '';
    parts.push(`<g class="${cls}" data-seat="${s.id}" tabindex="0" role="button" aria-label="${label}"${af}>` +
      rect(x, y, d - backW + 2, w, `class="cush" rx="${s.cls === 'business' ? 9 : 6}"`) +
      rect(x + d - backW, y - 1, backW, w + 2, 'class="back" rx="3"') +
      `<title>${label}</title></g>`);
  }

  // row numbers in the aisle; letters in front of the first rows
  for (const r of ROWS) {
    parts.push(`<text x="${X(r.z)}" y="${CY + 9}" text-anchor="middle" font-size="${r.cls === 'business' ? 27 : 24}" font-weight="600" fill="${r.exitRow ? '#5fc6d6' : 'rgba(210,222,235,0.62)'}">${r.row}</text>`);
  }
  const r6 = ROWS.find((r) => r.row === 6), r1 = ROWS[0];
  for (const [L, x] of Object.entries(r6.x)) parts.push(`<text x="${X(r6.z - 0.56)}" y="${Y(x) + 8}" text-anchor="middle" font-size="21" font-weight="600" fill="rgba(210,222,235,0.5)">${L}</text>`);
  for (const [L, x] of Object.entries(r1.x)) parts.push(`<text x="${X(r1.z - 0.46)}" y="${Y(x) + 8}" text-anchor="middle" font-size="20" font-weight="600" fill="rgba(210,222,235,0.45)">${L}</text>`);

  // nose / tail labels
  parts.push(`<text x="${X(-18.1)}" y="${H - 14}" font-size="20" fill="rgba(200,215,230,0.45)" letter-spacing="3">◀ FORWARD</text>`);
  parts.push(`<rect x="${X(Z1) - 120}" y="0" width="120" height="${H}" fill="url(#hnTail)" opacity="0.0"/>`);

  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', `0 0 ${W} ${H}`);
  el.setAttribute('class', 'map');
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Boeing 737-800 seat map, nose to the left');
  el.innerHTML = parts.join('');
  return el;
}
