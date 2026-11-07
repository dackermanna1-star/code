// =============================================================================
// Vector icons for the IFE (Canvas 2D paths in a 24x24 design grid).
//   icon(ctx, 'play', x, y, size, color)   – (x, y) = top-left corner
// =============================================================================

const P = {};

function stroke(ctx, lw = 2) { ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }

P.home = (c) => { c.beginPath(); c.moveTo(3, 11); c.lineTo(12, 3.5); c.lineTo(21, 11); c.moveTo(5.5, 9.5); c.lineTo(5.5, 20); c.lineTo(10, 20); c.lineTo(10, 14); c.lineTo(14, 14); c.lineTo(14, 20); c.lineTo(18.5, 20); c.lineTo(18.5, 9.5); stroke(c); };
P.movie = (c) => {
  c.beginPath(); c.roundRect ? c.roundRect(3, 5, 18, 14, 2) : c.rect(3, 5, 18, 14); stroke(c);
  c.beginPath(); c.moveTo(7, 5); c.lineTo(7, 19); c.moveTo(17, 5); c.lineTo(17, 19); stroke(c, 1.6);
  for (const y of [8, 12, 16]) { c.beginPath(); c.moveTo(3.5, y); c.lineTo(6.5, y); c.moveTo(17.5, y); c.lineTo(20.5, y); stroke(c, 1.4); }
};
P.tv = (c) => { c.beginPath(); c.roundRect ? c.roundRect(2.5, 6, 19, 13, 2) : c.rect(2.5, 6, 19, 13); stroke(c); c.beginPath(); c.moveTo(8, 2.5); c.lineTo(12, 6); c.lineTo(16, 2.5); stroke(c); c.beginPath(); c.moveTo(8, 21.5); c.lineTo(16, 21.5); stroke(c); };
P.music = (c) => { c.beginPath(); c.moveTo(9, 17); c.lineTo(9, 5); c.lineTo(20, 3); c.lineTo(20, 15); stroke(c); c.beginPath(); c.ellipse(6.5, 17.5, 3, 2.4, -0.3, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(17.5, 15.5, 3, 2.4, -0.3, 0, Math.PI * 2); c.fill(); };
P.map = (c) => {
  c.beginPath(); c.arc(12, 12, 9, 0, Math.PI * 2); stroke(c);
  c.beginPath(); c.ellipse(12, 12, 4, 9, 0, 0, Math.PI * 2); stroke(c, 1.4);
  c.beginPath(); c.moveTo(3.5, 9); c.lineTo(20.5, 9); c.moveTo(3.5, 15); c.lineTo(20.5, 15); stroke(c, 1.4);
};
P.plane = (c) => {
  c.beginPath();
  c.moveTo(12, 1.5); c.bezierCurveTo(13.1, 1.5, 13.4, 3, 13.4, 5); c.lineTo(13.4, 9); c.lineTo(22, 14); c.lineTo(22, 16); c.lineTo(13.4, 13.4);
  c.lineTo(13.4, 18.6); c.lineTo(16, 20.6); c.lineTo(16, 22.2); c.lineTo(12, 21); c.lineTo(8, 22.2); c.lineTo(8, 20.6); c.lineTo(10.6, 18.6);
  c.lineTo(10.6, 13.4); c.lineTo(2, 16); c.lineTo(2, 14); c.lineTo(10.6, 9); c.lineTo(10.6, 5); c.bezierCurveTo(10.6, 3, 10.9, 1.5, 12, 1.5);
  c.closePath(); c.fill();
};
P.info = (c) => { c.beginPath(); c.arc(12, 12, 9.5, 0, Math.PI * 2); stroke(c); c.beginPath(); c.moveTo(12, 11); c.lineTo(12, 17); stroke(c, 2.4); c.beginPath(); c.arc(12, 7.5, 1.4, 0, Math.PI * 2); c.fill(); };
P.games = (c) => {
  c.beginPath(); c.moveTo(7, 7); c.lineTo(17, 7); c.bezierCurveTo(21, 7, 22.5, 12, 22, 16); c.bezierCurveTo(21.6, 19, 19, 19.5, 17.5, 17.5); c.lineTo(15.5, 15);
  c.lineTo(8.5, 15); c.lineTo(6.5, 17.5); c.bezierCurveTo(5, 19.5, 2.4, 19, 2, 16); c.bezierCurveTo(1.5, 12, 3, 7, 7, 7); c.closePath(); stroke(c);
  c.beginPath(); c.moveTo(5.5, 11); c.lineTo(9.5, 11); c.moveTo(7.5, 9); c.lineTo(7.5, 13); stroke(c, 1.6);
  c.beginPath(); c.arc(16, 10, 1.1, 0, 7); c.arc(18, 12.2, 1.1, 0, 7); c.fill();
};
P.settings = (c) => {
  c.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, r = i % 2 ? 7.2 : 9.6;
    const a2 = ((i + 1) / 16) * Math.PI * 2;
    if (i === 0) c.moveTo(12 + Math.cos(a) * r, 12 + Math.sin(a) * r);
    c.lineTo(12 + Math.cos(a) * r, 12 + Math.sin(a) * r);
    c.lineTo(12 + Math.cos(a2) * r, 12 + Math.sin(a2) * r);
  }
  c.closePath(); stroke(c, 1.8);
  c.beginPath(); c.arc(12, 12, 3.2, 0, Math.PI * 2); stroke(c, 1.8);
};
P.play = (c) => { c.beginPath(); c.moveTo(7, 4); c.lineTo(20, 12); c.lineTo(7, 20); c.closePath(); c.fill(); };
P.pause = (c) => { c.fillRect(6, 4, 4, 16); c.fillRect(14, 4, 4, 16); };
P.next = (c) => { c.beginPath(); c.moveTo(5, 5); c.lineTo(15, 12); c.lineTo(5, 19); c.closePath(); c.fill(); c.fillRect(16, 5, 3, 14); };
P.prev = (c) => { c.beginPath(); c.moveTo(19, 5); c.lineTo(9, 12); c.lineTo(19, 19); c.closePath(); c.fill(); c.fillRect(5, 5, 3, 14); };
P.back = (c) => { c.beginPath(); c.moveTo(15, 4); c.lineTo(7, 12); c.lineTo(15, 20); stroke(c, 2.6); };
P.chevron = (c) => { c.beginPath(); c.moveTo(9, 4); c.lineTo(17, 12); c.lineTo(9, 20); stroke(c, 2.6); };
P.close = (c) => { c.beginPath(); c.moveTo(5, 5); c.lineTo(19, 19); c.moveTo(19, 5); c.lineTo(5, 19); stroke(c, 2.4); };
P.volume = (c) => {
  c.beginPath(); c.moveTo(3, 9); c.lineTo(7, 9); c.lineTo(12, 4.5); c.lineTo(12, 19.5); c.lineTo(7, 15); c.lineTo(3, 15); c.closePath(); c.fill();
  c.beginPath(); c.arc(12, 12, 4.5, -0.8, 0.8); stroke(c, 1.8); c.beginPath(); c.arc(12, 12, 8, -0.85, 0.85); stroke(c, 1.8);
};
P.mute = (c) => {
  c.beginPath(); c.moveTo(3, 9); c.lineTo(7, 9); c.lineTo(12, 4.5); c.lineTo(12, 19.5); c.lineTo(7, 15); c.lineTo(3, 15); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(15.5, 9); c.lineTo(21, 15); c.moveTo(21, 9); c.lineTo(15.5, 15); stroke(c, 2);
};
P.brightness = (c) => {
  c.beginPath(); c.arc(12, 12, 4.2, 0, Math.PI * 2); c.fill();
  c.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.moveTo(12 + Math.cos(a) * 7, 12 + Math.sin(a) * 7); c.lineTo(12 + Math.cos(a) * 9.8, 12 + Math.sin(a) * 9.8); }
  stroke(c, 2);
};
P.light = (c) => {
  c.beginPath(); c.moveTo(7, 3); c.lineTo(17, 3); c.lineTo(19, 9); c.lineTo(5, 9); c.closePath(); c.fill();
  c.globalAlpha *= 0.55;
  c.beginPath(); c.moveTo(6, 10.5); c.lineTo(18, 10.5); c.lineTo(22, 21); c.lineTo(2, 21); c.closePath(); c.fill();
};
P.call = (c) => {
  c.beginPath(); c.arc(9.5, 6.5, 3.3, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(3, 21); c.bezierCurveTo(3, 14, 5.5, 11.5, 9.5, 11.5); c.bezierCurveTo(13.5, 11.5, 16, 14, 16, 21); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(19, 3); c.lineTo(19, 12); stroke(c, 2.4); c.beginPath(); c.arc(19, 15.5, 1.4, 0, 7); c.fill();
};
P.power = (c) => { c.beginPath(); c.arc(12, 13, 8, -Math.PI * 0.32, Math.PI * 1.32); stroke(c, 2.2); c.beginPath(); c.moveTo(12, 3); c.lineTo(12, 12); stroke(c, 2.2); };
P.rew10 = (c) => {
  c.beginPath(); c.arc(12, 13, 8, -Math.PI * 0.5, Math.PI * 1.15); stroke(c, 1.8);
  c.beginPath(); c.moveTo(12, 1.8); c.lineTo(8, 5); c.lineTo(12, 8.2); c.closePath(); c.fill();
  c.font = '700 7.5px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('10', 12.3, 13.6);
};
P.fwd10 = (c) => {
  c.beginPath(); c.arc(12, 13, 8, -Math.PI * 0.15, Math.PI * 1.5); stroke(c, 1.8);
  c.beginPath(); c.moveTo(12, 1.8); c.lineTo(16, 5); c.lineTo(12, 8.2); c.closePath(); c.fill();
  c.font = '700 7.5px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('10', 11.8, 13.6);
};
P.check = (c) => { c.beginPath(); c.moveTo(4, 12.5); c.lineTo(9.5, 18); c.lineTo(20, 6); stroke(c, 2.6); };
P.clock = (c) => { c.beginPath(); c.arc(12, 12, 9, 0, Math.PI * 2); stroke(c, 1.8); c.beginPath(); c.moveTo(12, 6.5); c.lineTo(12, 12); c.lineTo(16, 14); stroke(c, 1.8); };
P.seatbelt = (c) => {
  c.beginPath(); c.arc(12, 5, 2.6, 0, 7); c.fill();
  c.beginPath(); c.moveTo(8, 9); c.lineTo(16, 9); c.lineTo(16, 16); c.lineTo(8, 16); c.closePath(); c.fill();
  c.fillRect(8, 16, 2.6, 6); c.fillRect(13.4, 16, 2.6, 6);
  c.fillStyle = '#0b2a4a'; c.fillRect(5, 12, 14, 2.2); c.fillStyle = c.strokeStyle; c.fillRect(10.4, 11.2, 3.2, 3.8);
};
P.globe = P.map;
P.puzzle = (c) => {
  c.beginPath();
  c.moveTo(4, 8); c.lineTo(9, 8); c.arc(11, 7, 2.2, Math.PI * 0.8, Math.PI * 0.2, false); c.lineTo(18, 8); c.lineTo(18, 12); c.arc(19, 14, 2.2, -Math.PI * 0.7, Math.PI * 0.7, false);
  c.lineTo(18, 20); c.lineTo(4, 20); c.closePath(); stroke(c, 1.8);
};
P.speaker = P.volume;
P.list = (c) => { for (const y of [6, 12, 18]) { c.beginPath(); c.arc(5, y, 1.3, 0, 7); c.fill(); c.beginPath(); c.moveTo(9, y); c.lineTo(20, y); stroke(c, 2); } };
P.layers = (c) => { c.beginPath(); c.moveTo(12, 3); c.lineTo(21, 8); c.lineTo(12, 13); c.lineTo(3, 8); c.closePath(); stroke(c, 1.8); c.beginPath(); c.moveTo(3, 12.5); c.lineTo(12, 17.5); c.lineTo(21, 12.5); stroke(c, 1.8); c.beginPath(); c.moveTo(3, 16.5); c.lineTo(12, 21.5); c.lineTo(21, 16.5); stroke(c, 1.8); };
P.cube = (c) => { c.beginPath(); c.moveTo(12, 2.5); c.lineTo(20.5, 7); c.lineTo(20.5, 17); c.lineTo(12, 21.5); c.lineTo(3.5, 17); c.lineTo(3.5, 7); c.closePath(); stroke(c, 1.8); c.beginPath(); c.moveTo(3.5, 7); c.lineTo(12, 11.5); c.lineTo(20.5, 7); c.moveTo(12, 11.5); c.lineTo(12, 21.5); stroke(c, 1.8); };
P.zoom = (c) => { c.beginPath(); c.arc(10, 10, 6.5, 0, 7); stroke(c, 2); c.beginPath(); c.moveTo(15, 15); c.lineTo(21, 21); stroke(c, 2.6); c.beginPath(); c.moveTo(7, 10); c.lineTo(13, 10); c.moveTo(10, 7); c.lineTo(10, 13); stroke(c, 1.8); };
P.headphones = (c) => {
  c.beginPath(); c.arc(12, 13, 8.5, Math.PI, 0); stroke(c, 2);
  c.beginPath(); c.roundRect ? c.roundRect(2.5, 13, 4.5, 8, 1.5) : c.rect(2.5, 13, 4.5, 8); c.fill();
  c.beginPath(); c.roundRect ? c.roundRect(17, 13, 4.5, 8, 1.5) : c.rect(17, 13, 4.5, 8); c.fill();
};
P.shuffle = (c) => { c.beginPath(); c.moveTo(3, 7); c.lineTo(8, 7); c.bezierCurveTo(13, 7, 12, 17, 17, 17); c.lineTo(20, 17); c.moveTo(3, 17); c.lineTo(8, 17); c.bezierCurveTo(13, 17, 12, 7, 17, 7); c.lineTo(20, 7); stroke(c, 1.8); c.beginPath(); c.moveTo(18, 4.5); c.lineTo(21, 7); c.lineTo(18, 9.5); c.moveTo(18, 14.5); c.lineTo(21, 17); c.lineTo(18, 19.5); stroke(c, 1.8); };

export function icon(ctx, name, x, y, size, color = '#fff', alpha = 1) {
  const fn = P[name];
  if (!fn) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  fn(ctx);
  ctx.restore();
}

export const ICONS = Object.keys(P);
