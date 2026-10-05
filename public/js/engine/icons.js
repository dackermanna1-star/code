// Redrawn 2008 client images (the originals are not distributed with this
// recreation): cursors, camera buttons, Safe Chat bubble, Report face and the
// classic tool icons. All drawn once to canvases and cached as data URLs.
const cache = new Map();
function draw(key, w, h, fn) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

// --- cursors ------------------------------------------------------------------------
export const cursorArrow = () => draw('cur-arrow', 32, 32, (x) => {
  x.beginPath();
  x.moveTo(1, 1); x.lineTo(1, 22); x.lineTo(6, 17); x.lineTo(10, 26); x.lineTo(14, 24); x.lineTo(10, 15); x.lineTo(17, 15); x.closePath();
  x.fillStyle = '#fff'; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#000'; x.stroke();
});

function rings(x) {
  x.lineWidth = 3; x.strokeStyle = '#000'; x.beginPath(); x.arc(32, 32, 13, 0, 7); x.stroke();
  x.lineWidth = 1.5; x.strokeStyle = '#fff'; x.beginPath(); x.arc(32, 32, 10.5, 0, 7); x.stroke();
  x.lineWidth = 1.5; x.strokeStyle = '#000'; x.beginPath(); x.arc(32, 32, 8, 0, 7); x.stroke();
  x.fillStyle = '#20e0ff'; x.beginPath(); x.arc(32, 32, 2.5, 0, 7); x.fill();
}
export const cursorGun = () => draw('cur-gun', 64, 64, (x) => rings(x));
export const cursorGunWait = () => draw('cur-gunwait', 64, 64, (x) => {
  rings(x);
  x.font = 'italic bold 11px Arial'; x.textAlign = 'center';
  x.lineWidth = 3; x.strokeStyle = '#fff'; x.strokeText('reloading', 32, 59);
  x.fillStyle = '#000'; x.fillText('reloading', 32, 59);
});

// --- camera buttons: white circle with a black glyph (hover cyan, pressed yellow) --
export function cameraButton(kind, state = 'up') {
  return draw(`cam-${kind}-${state}`, 48, 48, (x) => {
    const fill = state === 'ovr' ? '#4ff4ff' : state === 'dn' ? '#ffee33' : '#ffffff';
    x.fillStyle = fill; x.strokeStyle = '#000'; x.lineWidth = 3;
    x.beginPath(); x.arc(24, 24, 20, 0, 7); x.fill(); x.stroke();
    x.lineWidth = 4.5; x.lineCap = 'round'; x.beginPath();
    if (kind === 'zoomin' || kind === 'zoomout') { x.moveTo(13, 24); x.lineTo(35, 24); if (kind === 'zoomin') { x.moveTo(24, 13); x.lineTo(24, 35); } }
    if (kind === 'tiltup') { x.moveTo(24, 35); x.lineTo(24, 13); x.moveTo(15, 21); x.lineTo(24, 12); x.lineTo(33, 21); }
    if (kind === 'tiltdown') { x.moveTo(24, 13); x.lineTo(24, 35); x.moveTo(15, 27); x.lineTo(24, 36); x.lineTo(33, 27); }
    x.stroke();
  });
}

// --- Safe Chat bubble (blue; hover green, pressed pink) --------------------------------
export function chatBubble(state = 'up') {
  return draw('chat-' + state, 64, 46, (x) => {
    const col = state === 'ovr' ? ['#c8ffb0', '#3aa020', '#1a6010'] : state === 'dn' ? ['#ffd0f0', '#e060b0', '#902070'] : ['#e8f0ff', '#5a7fd8', '#24418a'];
    const g = x.createLinearGradient(0, 2, 0, 36);
    g.addColorStop(0, col[0]); g.addColorStop(0.55, col[1]); g.addColorStop(1, col[2]);
    x.fillStyle = g;
    x.beginPath(); x.ellipse(32, 19, 29, 16, 0, 0, 7); x.fill();
    x.beginPath(); x.moveTo(16, 30); x.lineTo(10, 44); x.lineTo(28, 33); x.fill();
    x.strokeStyle = col[2]; x.lineWidth = 1.5; x.beginPath(); x.ellipse(32, 19, 29, 16, 0, 0, 7); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.8)'; x.beginPath(); x.ellipse(26, 11, 16, 5, -0.1, 0, 7); x.fill();
  });
}

// --- the yellow shocked face that pops up over "Report" --------------------------------
export const reportFace = () => draw('report-face', 32, 32, (x) => {
  const g = x.createRadialGradient(12, 10, 2, 16, 16, 15);
  g.addColorStop(0, '#fff9a0'); g.addColorStop(1, '#e8c000');
  x.fillStyle = g; x.beginPath(); x.arc(16, 16, 14, 0, 7); x.fill();
  x.strokeStyle = '#806000'; x.lineWidth = 1; x.stroke();
  x.fillStyle = '#000';
  x.beginPath(); x.ellipse(11, 12, 2.2, 3.5, 0, 0, 7); x.fill();
  x.beginPath(); x.ellipse(21, 12, 2.2, 3.5, 0, 0, 7); x.fill();
  x.beginPath(); x.ellipse(16, 22, 3.5, 4.5, 0, 0, 7); x.fill();
});

// --- tool icons (80x80) -----------------------------------------------------------------
export const TOOL_ICONS = {
  Sword: () => draw('ic-sword', 80, 80, (x) => {
    x.translate(40, 40); x.rotate(Math.PI / 4);
    const g = x.createLinearGradient(-4, 0, 4, 0); g.addColorStop(0, '#f4f4f4'); g.addColorStop(1, '#9a9a9a');
    x.fillStyle = g; x.beginPath(); x.moveTo(-3.5, 14); x.lineTo(-3.5, -30); x.lineTo(0, -37); x.lineTo(3.5, -30); x.lineTo(3.5, 14); x.fill();
    x.strokeStyle = '#555'; x.lineWidth = 1; x.stroke();
    x.fillStyle = '#c8a040'; x.fillRect(-12, 14, 24, 4); x.strokeRect(-12, 14, 24, 4);
    x.fillStyle = '#1a1a1a'; x.fillRect(-2.5, 18, 5, 15);
    x.fillStyle = '#c8a040'; x.beginPath(); x.arc(0, 35, 3.5, 0, 7); x.fill();
  }),
  Rocket: () => draw('ic-rocket', 80, 80, (x) => {
    x.translate(40, 40); x.rotate(-Math.PI / 4);
    x.fillStyle = '#ffffff'; x.strokeStyle = '#d01010'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(-6, 22); x.lineTo(-6, -16); x.quadraticCurveTo(0, -34, 6, -16); x.lineTo(6, 22); x.closePath(); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(-6, 10); x.lineTo(-15, 26); x.lineTo(-6, 22); x.moveTo(6, 10); x.lineTo(15, 26); x.lineTo(6, 22); x.fill(); x.stroke();
    x.fillStyle = '#d01010'; x.fillRect(-6, -6, 12, 4);
  }),
  Slingshot: () => draw('ic-sling', 80, 80, (x) => {
    x.lineCap = 'round'; x.strokeStyle = '#f0c020'; x.lineWidth = 9;
    x.beginPath(); x.moveTo(44, 74); x.lineTo(44, 44); x.lineTo(28, 16); x.moveTo(44, 44); x.lineTo(60, 16); x.stroke();
    x.strokeStyle = '#a07010'; x.lineWidth = 2; x.stroke();
    x.strokeStyle = '#3050c0'; x.lineWidth = 4; x.beginPath(); x.moveTo(44, 58); x.lineTo(44, 74); x.stroke();
    x.strokeStyle = '#222'; x.lineWidth = 2; x.beginPath(); x.moveTo(28, 16); x.lineTo(16, 20); x.moveTo(60, 16); x.lineTo(20, 20); x.stroke();
    const g = x.createRadialGradient(14, 16, 2, 16, 19, 10); g.addColorStop(0, '#ff9090'); g.addColorStop(1, '#c01010');
    x.fillStyle = g; x.beginPath(); x.arc(16, 20, 9, 0, 7); x.fill();
  }),
  Superball: () => draw('ic-superball', 80, 80, (x) => {
    const ball = (cx, cy, r, c1, c2) => {
      const g = x.createRadialGradient(cx - r / 3, cy - r / 3, 1, cx, cy, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, c1); g.addColorStop(1, c2);
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, r * 0.6, 0.5, 2.6); x.stroke();
    };
    ball(26, 26, 15, '#e86010', '#801800'); ball(56, 26, 14, '#c040e0', '#501080');
    ball(25, 56, 15, '#f0e020', '#907000'); ball(55, 56, 15, '#30c0f0', '#104090');
  }),
  PaintballGun: () => draw('ic-paint', 80, 80, (x) => {
    x.fillStyle = '#1b6cff';
    x.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = 20 + (i % 2 ? 10 : 0) * (0.6 + 0.4 * Math.sin(i * 3.7));
      const px = 40 + Math.cos(a) * r, py = 40 + Math.sin(a) * r;
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.fill();
    for (const [dx, dy, r] of [[70, 20, 4], [10, 64, 5], [68, 66, 3], [12, 14, 3]]) { x.beginPath(); x.arc(dx, dy, r, 0, 7); x.fill(); }
  }),
  Trowel: () => draw('ic-wall', 80, 80, (x) => {
    x.save(); x.transform(1, -0.2, 0, 1, 0, 10);
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 5; col++) {
        const bx = 10 + col * 12 + (row % 2 ? 6 : 0), by = 18 + row * 8;
        if (bx > 64) continue;
        x.fillStyle = '#c8a070'; x.fillRect(bx, by, 11, 7);
        x.fillStyle = '#8a6040'; x.fillRect(bx, by + 6, 11, 1); x.fillRect(bx + 10, by, 1, 7);
      }
    }
    x.restore();
    x.fillStyle = '#7a5530'; x.beginPath(); x.moveTo(70, 18); x.lineTo(76, 22); x.lineTo(76, 70); x.lineTo(70, 66); x.fill();
  }),
  Timebomb: () => draw('ic-bomb', 80, 80, (x) => {
    const g = x.createRadialGradient(32, 40, 3, 38, 48, 24); g.addColorStop(0, '#666'); g.addColorStop(0.3, '#222'); g.addColorStop(1, '#000');
    x.fillStyle = g; x.beginPath(); x.arc(38, 48, 22, 0, 7); x.fill();
    x.fillStyle = '#333'; x.fillRect(32, 22, 12, 6);
    x.strokeStyle = '#a08060'; x.lineWidth = 2; x.beginPath(); x.moveTo(38, 22); x.quadraticCurveTo(42, 10, 52, 8); x.stroke();
    x.fillStyle = '#ffd000'; x.beginPath(); x.arc(53, 7, 4, 0, 7); x.fill(); x.fillStyle = '#ff5000'; x.beginPath(); x.arc(53, 7, 2, 0, 7); x.fill();
  }),
  Clone: () => draw('ic-clone', 80, 80, (x) => {
    x.strokeStyle = '#222'; x.lineWidth = 5; x.lineCap = 'round'; x.beginPath(); x.moveTo(62, 58); x.lineTo(34, 22); x.stroke();
    x.strokeStyle = '#fff'; x.lineWidth = 3; x.beginPath(); x.moveTo(36, 25); x.lineTo(30, 17); x.stroke();
    for (const [sx, sy, c] of [[22, 14, '#ff3030'], [14, 26, '#20c020'], [28, 8, '#3060ff'], [40, 12, '#ffd000']]) { x.fillStyle = c; x.fillRect(sx - 3, sy - 3, 6, 6); }
    x.font = 'bold 15px Arial'; x.fillStyle = '#1060ff'; x.textAlign = 'center'; x.fillText('Copy', 30, 74);
  }),
  Hammer: () => draw('ic-hammer', 80, 80, (x) => {
    x.save(); x.translate(42, 40); x.rotate(-0.5);
    x.fillStyle = '#f0c020'; x.fillRect(-4, -6, 8, 34); x.strokeStyle = '#806000'; x.strokeRect(-4, -6, 8, 34);
    x.fillStyle = '#444'; x.fillRect(-14, -18, 28, 13); x.fillStyle = '#777'; x.fillRect(-14, -18, 28, 4);
    x.restore();
    x.font = 'bold 15px Arial'; x.fillStyle = '#1060ff'; x.textAlign = 'center'; x.fillText('Delete', 40, 75);
  }),
  Grab: () => draw('ic-grab', 80, 80, (x) => {
    x.fillStyle = '#d8d8d8'; x.strokeStyle = '#30e8ff'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(14, 30); x.lineTo(46, 30); x.quadraticCurveTo(52, 34, 46, 38); x.lineTo(30, 38); x.lineTo(58, 40);
    x.quadraticCurveTo(64, 45, 58, 50); x.lineTo(30, 50); x.lineTo(54, 52); x.quadraticCurveTo(58, 57, 52, 60); x.lineTo(20, 60); x.quadraticCurveTo(8, 58, 10, 44); x.closePath();
    x.fill(); x.stroke();
  }),
};
