// Floors: the waiting room, the void, the jungle temple, the aquarium tunnel, the snow day.
import * as THREE from 'three';
import { V, rnd, pick, clamp, ctex, liveTex, blocks, tiled, DOOR_Z, FACES } from '../kit.js';
import * as A from '../audio.js';
import { tex as dtex } from '../../disasters/effects.js';
import { swim } from './a.js';

const ALL = (c) => ({ head: c, torso: c, leftArm: c, rightArm: c, leftLeg: c, rightLeg: c });
const DRESS = (skin, top, legs) => ({ colors: { head: skin, torso: top, leftArm: skin, rightArm: skin, leftLeg: legs, rightLeg: legs } });

// --- the waiting room ------------------------------------------------------------------------------------------------------------------------------------
function chairs(F, xs, z, c) {
  for (const x of xs) {
    F.box(x - 1.15, 1.8, z - 1.1, x + 1.15, 2.2, z + 1.1, c);
    F.box(x - 1.15, 2.2, z + 0.85, x + 1.15, 5, z + 1.15, c);
    for (const [dx, dz] of [[-1, -0.9], [1, -0.9], [-1, 0.9], [1, 0.9]]) F.box(x + dx - 0.1, 0, z + dz - 0.1, x + dx + 0.1, 1.8, z + dz + 0.1, 199);
  }
}
function drawServing(S, text, sub = 'NOW SERVING') {
  S.disp.redraw((x, w, h) => {
    x.fillStyle = '#120404'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ff3a20'; x.shadowColor = '#ff2000'; x.shadowBlur = 10; x.textAlign = 'center';
    x.font = 'bold 22px monospace'; x.fillText(sub, w / 2, 28);
    x.font = 'bold 56px monospace'; x.fillText(text, w / 2, 86);
  });
}
function drawClock(S, sec) {
  S.clock.redraw((x, w) => {
    const c = w / 2;
    x.fillStyle = '#f8f8f4'; x.beginPath(); x.arc(c, c, c - 4, 0, 7); x.fill();
    x.lineWidth = 6; x.strokeStyle = '#222'; x.stroke();
    x.fillStyle = '#222'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.fillRect(c + Math.sin(a) * (c - 16) - 2, c - Math.cos(a) * (c - 16) - 2, 4, 4); }
    const hand = (a, L, wd, col) => { x.strokeStyle = col; x.lineWidth = wd; x.beginPath(); x.moveTo(c, c); x.lineTo(c + Math.sin(a) * L, c - Math.cos(a) * L); x.stroke(); };
    hand((3 + 47 / 60) / 12 * Math.PI * 2, c * 0.45, 6, '#222');
    hand(47 / 60 * Math.PI * 2, c * 0.7, 4, '#222');
    hand(sec / 60 * Math.PI * 2, c * 0.78, 2, '#c4281c');
  });
}
export const waiting = {
  id: 'waiting', name: 'The Waiting Room', hint: 'Take a number. Have a seat. Wait.', color: '#bcd4ec', time: 32,
  look: { skyColor: 0x101010, amb: [0xf4f8f0, 0x9a9a90, 1.4], sun: [0xffffff, 0.3], fog: [0x101010, 300, 600] },
  bots: { venture: 0.65, spots: [[14, -14], [-12.8, -20], [12.8, -20], [0, -33], [-18, -36], [17, -38]], area: [-18, -36, 18, -14] },
  lines: ['boring', 'what are we waiting for', 'take a number lol', 'is that a skeleton', 'this floor is so boring', 'i got a ticket', 'NUMBER 5', 'how long is the wait'],
  build(F) {
    const X0 = -22, X1 = 22, Z1 = -48, H = 13, S = F.state;
    F.room({ x0: X0, x1: X1, z1: Z1, h: H, floor: 135, wall: 5, ceiling: 1, frame: 199 });
    for (const x of [-12, 0, 12]) for (const z of [-17, -29, -41]) F.box(x - 3, H - 0.15, z - 1.4, x + 3, H, z + 1.4, 1, { material: 'Neon', canCollide: false });
    F.box(X0, 0, Z1, X0 + 0.12, 1.2, DOOR_Z - 1, 192, { canCollide: false }); F.box(X1 - 0.12, 0, Z1, X1, 1.2, DOOR_Z - 1, 192, { canCollide: false });
    // the reception: a counter, a glass window, an office behind it
    F.box(-10, 0, -41, 10, 4, -39, 194); F.box(-10.3, 4, -41.2, 10.3, 4.3, -38.8, 199);
    F.box(-10, 4.3, -40.2, 10, 10, -39.9, 1, { transparency: 0.7 });
    F.box(-10.6, 0, -41.2, -10, 10.6, -38.8, 199); F.box(10, 0, -41.2, 10.6, 10.6, -38.8, 199); F.box(-10.6, 10, -41.2, 10.6, 10.6, -38.8, 199);
    F.box(-14, 0, -42, -10.6, H, -41, 5); F.box(10.6, 0, -42, 14, H, -41, 5); F.box(-10.6, 10.6, -42, 10.6, H, -41, 5);
    F.box(-6, 0, -46, 6, 3.2, -44, 192); F.box(-14, 0, -48, -10, 8, -46, 199); // a desk, a filing cabinet
    for (let i = 0; i < 6; i++) F.box(-5 + i * 0.5, 3.2, -45.5, -4.6 + i * 0.5, 3.2 + rnd(0.6, 2.4), -44.6, pick([1, 5, 1, 24]), { canCollide: false });
    S.rec = F.puppet(DRESS(24, 22, 26), { at: [2, 0, -43.2, Math.PI], faceTex: FACES.glasses() });
    S.rec.pose = (a, t) => { a.rs = 1.1 + Math.sin(t * 9) * 0.15 * (Math.sin(t * 0.7) > 0 ? 1 : 0); a.ls = 1.1; }; // typing
    F.add(blocks([[3, 2.2, 0.3, 0, 0, 0, 26], [2.7, 1.9, 0.05, 0, 0, 0.16, 102, { emissive: 0.6 }], [0.4, 1, 0.4, 0, -1.4, -0.3, 26]])).position.set(-1.2, 5.1, -45.3);
    // NOW SERVING
    S.disp = liveTex(256, 100);
    F.plane(S.disp.tex, 7, 2.7, [0, 11.8, -40.95], [0, 0, 0], { basic: true, transparent: false });
    F.box(-3.8, 10.3, -41.1, 3.8, 13, -40.95, 26, { canCollide: false });
    S.serving = 3; drawServing(S, '3');
    // the ticket machine
    F.box(15.7, 0, -15.3, 16.3, 4, -14.7, 199);
    F.add(blocks([[2.2, 1.8, 1.4, 0, 0, 0, 21], [0.8, 0.12, 0.2, 0, -0.5, 0.71, 26], [0.5, 0.05, 0.55, 0, -0.6, 0.95, 1]])).position.set(16, 4.9, -15);
    F.sign(16, 7.4, -15.1, 3.4, 1.2, 'TAKE A\nNUMBER', { bg: '#ffffff', fg: '#c4281c', face: 'z', border: '#c4281c' });
    S.machine = V(16, 3, -14);
    // chairs, and the people already waiting
    const xs = [-16, -12.8, -9.6, -6.4, 6.4, 9.6, 12.8, 16];
    chairs(F, xs, -22, 23); chairs(F, xs, -29, 23);
    S.seats = []; for (const z of [-22, -29]) for (const x of xs) S.seats.push([x, z]);
    const sitPose = (a) => { a.rh = a.lh = 1.57; a.rs = a.ls = 0.5; };
    const skel = F.puppet({ colors: ALL(1) }, { at: [-6.4, 0.7, -22, 0], faceTex: FACES.skull() }); skel.pose = (a) => { a.rh = a.lh = 1.57; a.rs = a.ls = 0.1; };
    S.sleeper = F.puppet(DRESS(24, 28, 26), { at: [12.8, 0.7, -22, 0], faceTex: FACES.sleepy() }); S.sleeper.pose = sitPose;
    const reader = F.puppet(DRESS(24, 104, 23), { at: [-12.8, 0.7, -29, 0] }); reader.pose = (a) => { a.rh = a.lh = 1.57; a.rs = a.ls = 1.2; };
    reader.model.root.add(blocks([[1.8, 2.2, 0.15, 0, 0.4, -1.5, 21, { rx: 20 }]]));
    const knitter = F.puppet(DRESS(24, 22, 22), { at: [9.6, 0.7, -29, 0], faceTex: FACES.glasses() }); knitter.pose = (a, t) => { a.rh = a.lh = 1.57; a.rs = 1 + Math.sin(t * 5) * 0.12; a.ls = 1 - Math.sin(t * 5) * 0.12; };
    const kid = F.puppet(DRESS(24, 23, 21), { at: [6.4, 1.1, -22, 0], scale: 0.75 }); kid.pose = (a, t) => { a.rh = 1.57 + Math.sin(t * 7) * 0.4; a.lh = 1.57 - Math.sin(t * 7) * 0.4; a.rs = a.ls = 0.3; };
    for (const p of [skel, S.sleeper, reader, knitter]) S.seats = S.seats.filter(([x, z]) => Math.hypot(x - p.pos.x, z - p.pos.z) > 1);
    S.seats = S.seats.filter(([x, z]) => !(x === 6.4 && z === -22));
    // things on the walls: a clock, a TV, posters
    S.clock = liveTex(128, 128); drawClock(S, 0);
    F.plane(S.clock.tex, 4, 4, [X0 + 0.1, 9, -26], [0, 90, 0], { transparent: true });
    S.tv = liveTex(128, 96);
    F.box(X1 - 1.4, 6, -30, X1, 11, -22, 26); F.plane(S.tv.tex, 7, 4.2, [X1 - 1.45, 8.5, -26], [0, -90, 0], { basic: true, transparent: false });
    F.sign(X0 + 0.15, 7, -38, 7, 3, 'YOUR WAIT IS\nIMPORTANT TO US', { bg: '#eef4ff', fg: '#2a4a8a', face: 'x', noBoard: true });
    F.sign(-17, 8, Z1 + 6.2, 7, 2.4, 'Estimated wait: ∞', { bg: '#ffffff', fg: '#333', face: 'z', noBoard: true });
    // a water cooler, a plant, a table of old magazines
    F.add(blocks([[2, 4, 2, 0, 2, 0, 1], [1.7, 2.4, 1.7, 0, 5.2, 0, 42, { shape: 'cyl', opacity: 0.55 }], [0.3, 0.3, 0.4, 0.4, 3.2, 1, 199]])).position.set(-19, 0, -14);
    F.box(-20, 0, -15, -18, 4, -13, 1, { transparency: 1 });
    F.add(blocks([[2, 2, 2, 0, 1, 0, 192, { shape: 'cyl' }], [3.2, 3.2, 3.2, 0, 3.6, 0, 37, { shape: 'ball' }], [2.4, 2.4, 2.4, 0.6, 5.2, 0.3, 28, { shape: 'ball' }]])).position.set(19, 0, -45);
    F.box(-4, 0, -36, 4, 1.8, -33, 192); for (let i = 0; i < 5; i++) F.box(-3.5 + i * 1.5, 1.8, -35.5 + (i % 2) * 0.6, -2.4 + i * 1.5, 1.9, -33.9 + (i % 2) * 0.4, pick([21, 23, 24, 28, 1]), { canCollide: false });
    S.tickets = new Map(); S.sitT = new Map(); S.callT = 5; S.tick = 0; S.sec = 0; S.tvT = 0; S.snore = 3;
  },
  start(F) { A.fluorescent(0.05); F.sound(null, 'fluor'); A.playSong('floor', 'muzak', 0.25); },
  update(F, dt, t) {
    const S = F.state;
    // the clock (which sometimes ticks backwards)
    S.tick += dt; if (S.tick >= 1) { S.tick = 0; S.sec = (S.sec + (Math.random() < 0.25 ? -1 : 1) + 60) % 60; drawClock(S, S.sec); A.tone(2400, 0.02, { type: 'square', vol: 0.03 }); }
    // daytime TV: static
    S.tvT -= dt; if (S.tvT <= 0) { S.tvT = 0.1; S.tv.redraw((x, w, h) => { for (let i = 0; i < w; i += 4) for (let j = 0; j < h; j += 4) { const g = Math.random() * 200 | 0; x.fillStyle = `rgb(${g},${g},${g})`; x.fillRect(i, j, 4, 4); } if (Math.sin(t * 0.8) > 0.3) { x.fillStyle = '#000a'; x.fillRect(0, h / 2 - 14, w, 28); x.fillStyle = '#fff'; x.font = 'bold 15px Arial'; x.textAlign = 'center'; x.fillText('PLEASE CONTINUE TO WAIT', w / 2, h / 2 + 5); } }); }
    // the sleeper snores
    S.snore -= dt; if (S.snore <= 0) { S.snore = rnd(3, 4.5); A.tone(85, 1.3, { type: 'sawtooth', lp: 260, vol: 0.12, a: 0.5, pos: S.sleeper.head }); if (Math.random() < 0.3) F.say('Sleeping Man', 'Zzz...', S.sleeper); }
    // the counter calls the next number
    if (!S.closed) {
      S.callT -= dt;
      if (S.callT <= 0) {
        S.callT = rnd(5.5, 7); S.serving++; drawServing(S, String(S.serving)); A.deskBell(V(0, 6, -40));
        F.say('Receptionist', pick([`Number ${S.serving}?`, `Now serving number ${S.serving}.`, `${S.serving}? Number ${S.serving}?`]), S.rec);
        const holder = [...S.tickets].find(([, n]) => n === S.serving);
        if (holder) {
          S.called = { ch: holder[0], until: t + 6.5 };
          if (holder[0].player?.isLocal) F.E.ui.toast(`Number ${S.serving} - that's you! Go to the counter!`, '#ffd84a', 'rgba(70,52,10,.9)');
          if (holder[0].player?.brain) holder[0].player.brain.plan.unshift(V(0, 0, -36.5));
        } else F.at(t + 2.6, () => F.say('Receptionist', pick(['No? Next.', '...Next!', '*sigh*', 'They never come.']), S.rec));
      }
      if (S.called) {
        const ch = S.called.ch;
        if (ch.alive && Math.hypot(ch.rootPosition.x, ch.rootPosition.z + 37) < 4.5) {
          F.bonus(ch, 'Finally Served', 3); A.ticket();
          F.say('Receptionist', pick(["Sorry, you're in the wrong department.", 'Please fill out this form and take another number.', 'Oh, we stopped doing that years ago.']), S.rec);
          S.called = null;
        } else if (t > S.called.until || !ch.alive) S.called = null;
      }
    }
    // taking a ticket
    for (const ch of F.chars()) if (!S.tickets.has(ch) && ch.rootPosition.distanceTo(S.machine) < 3.6) {
      const k = S.tickets.size, n = k < 3 ? S.serving + 2 + k : 9000 + Math.floor(rnd(0, 999));
      S.tickets.set(ch, n); A.ticket();
      if (ch.player?.isLocal) F.E.ui.toast(n > 9000 ? `Your number is ${n}. Estimated wait: 4 years.` : `You took a ticket: number ${n}. Now wait.`, '#ffffff', 'rgba(60,60,60,.9)');
    }
    // sitting down in a free chair (and sitting still for a while)
    for (const ch of F.chars()) {
      const p = ch.rootPosition, feet = p.y - 3;
      const seat = S.seats.find(([x, z]) => Math.abs(p.x - x) < 1.15 && Math.abs(p.z - z) < 1.1);
      const still = ch.input.move.lengthSq() < 0.01 && !ch.input.jump;
      if (seat && still && Math.abs(feet - 2.2) < 0.5) {
        const k = (S.sitT.get(ch) || 0) + dt; S.sitT.set(ch, k);
        if (k > 0.5) { F.sit(ch); ch.facing = 0; }
        if (k > 12.5 && ch.patient !== F) { ch.patient = F; F.bonus(ch, 'Patience', 2); }
      } else { S.sitT.set(ch, 0); F.unsit(ch); }
    }
  },
  closing(F) {
    const S = F.state; S.closed = true;
    drawServing(S, 'CLOSED', 'SORRY');
    F.say('Receptionist', "We're closed for lunch. Please come back tomorrow.", S.rec);
    A.clunk(V(0, 8, -40));
    // the shutter rolls down over the window
    const sh = F.add(blocks([[20, 1, 0.25, 0, -0.5, 0, 199]])); sh.position.set(0, 10, -39.7); sh.scale.y = 0.05;
    F.every(0, (dt) => { sh.scale.y = Math.min(5.7, sh.scale.y + dt * 9); });
  },
  botTick(F, bot, dt) {
    const S = F.state;
    if (bot.mode === 'out' && !S.tickets.has(bot.ch) && !bot.ticketTry && Math.random() < dt * 0.5) { bot.ticketTry = true; bot.plan.unshift(V(15, 0, -12.5)); }
  },
  noPassengers: false,
};

// --- the void ---------------------------------------------------------------------------------------------------------------------------------------------------
function eyeTex() {
  return ctex('voideye', 512, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.save(); x.beginPath(); x.moveTo(10, h / 2); x.quadraticCurveTo(w / 2, -h * 0.35, w - 10, h / 2); x.quadraticCurveTo(w / 2, h * 1.35, 10, h / 2); x.closePath(); x.clip();
    const g = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); g.addColorStop(0, '#fffaf0'); g.addColorStop(1, '#c8a8a0'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(200,20,20,0.6)'; x.lineWidth = 2; for (let i = 0; i < 26; i++) { x.beginPath(); let px = i % 2 ? 20 : w - 20, py = rnd(40, h - 40); x.moveTo(px, py); for (let j = 0; j < 5; j++) { px += (w / 2 - px) * 0.25 + rnd(-10, 10); py += rnd(-14, 14); x.lineTo(px, py); } x.stroke(); }
    const ig = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, 92); ig.addColorStop(0, '#f8e040'); ig.addColorStop(0.6, '#c8501a'); ig.addColorStop(1, '#3a0a04'); x.fillStyle = ig; x.beginPath(); x.arc(w / 2, h / 2, 92, 0, 7); x.fill();
    x.fillStyle = '#000'; x.beginPath(); x.ellipse(w / 2, h / 2, 18, 70, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.7)'; x.beginPath(); x.arc(w / 2 + 34, h / 2 - 36, 14, 0, 7); x.fill();
    x.restore();
  });
}
export const voidFloor = {
  id: 'void', name: 'The Void', hint: 'There is nothing here. Watch your step.', color: '#e8e8ff', time: 34,
  look: { skyColor: 0x000000, amb: [0x9090b0, 0x000000, 0.55], sun: [0xffffff, 0.2], fog: [0x000000, 40, 175] },
  bots: { venture: 0.4, gaps: true, spots: (F) => F.state.spots },
  lines: ['where are we', 'its so dark', 'hello?', 'HELLO?', 'the floor is falling!!', 'i dont like this', 'is that a door', 'what is that'],
  build(F) {
    const S = F.state;
    F.box(-7, -1.5, -15, 7, 0, DOOR_Z + 0.5, 1, { material: 'Neon' });
    // a path of tiles out into the dark; they drop away a moment after you step on them
    S.tiles = []; S.spots = [];
    let x = 0, z = -18;
    while (z > -112) {
      const p = F.mover({ size: [4, 1, 4], position: [x, -0.5, z], color: 1, material: 'Neon' });
      S.tiles.push({ p, x, z, fall: 0, y: -0.5, v: 0, gone: 0 });
      if (Math.random() < 0.35) S.spots.push([x, z]);
      z -= rnd(4.8, 6.1); x = clamp(x + rnd(-3.5, 3.5), -14, 14);
    }
    // and at the end of it, a door, standing on its own
    const ez = z - 6;
    F.box(-6, -1.5, ez - 6, 6, 0, ez + 7, 1, { material: 'Neon' });
    F.box(-3.2, 0, ez - 0.6, -2.6, 9, ez + 0.6, 192); F.box(2.6, 0, ez - 0.6, 3.2, 9, ez + 0.6, 192); F.box(-3.2, 9, ez - 0.6, 3.2, 9.6, ez + 0.6, 192);
    S.door = F.add(blocks([[5.2, 8.9, 0.4, 0, 4.45, 0, 192], [0.5, 0.5, 0.5, 2, 4.4, 0.4, 24, { shape: 'ball' }], [5.2, 0.15, 0.5, 0, 0.1, 0.05, 24, { emissive: 1 }], [4, 3, 0.1, 0, 6.5, 0.22, 25], [4, 3, 0.1, 0, 2.5, 0.22, 25]]));
    S.door.position.set(0, 0, ez); S.doorAt = V(0, 3, ez + 1.5);
    S.spots.push([0, ez + 3]);
    S.doorLight = F.light(V(0, 1, ez + 3), 0xffd890, 30, 14);
    // things drifting past in the dark
    S.junk = [];
    const kinds = [
      [[3, 0.5, 3, 0, 2, 0, 192], [0.4, 2, 0.4, -1.2, 1, -1.2, 192], [0.4, 2, 0.4, 1.2, 1, -1.2, 192], [0.4, 2, 0.4, -1.2, 1, 1.2, 192], [0.4, 2, 0.4, 1.2, 1, 1.2, 192], [3, 3, 0.4, 0, 3.7, 1.3, 192]],
      [[5, 3.6, 3, 0, 0, 0, 26], [4.4, 3, 0.1, 0, 0.1, -1.52, 102, { emissive: 0.5 }]],
      [[2.4, 2, 3, 0, 0, 0, 24, { shape: 'ball' }], [1.6, 1.6, 1.6, 0, 1.6, -1, 24, { shape: 'ball' }], [0.8, 0.3, 0.8, 0, 1.5, -1.9, 106]],
      [[0.3, 7, 0.3, 0, 0, 0, 199], [3, 3, 0.2, 0, 3.5, 0, 21], [2.6, 0.8, 0.05, 0, 3.5, -0.13, 1]],
      [[6, 4, 3, 0, 0, 0, 26], [6, 0.4, 1.4, 0, 0.3, -2.1, 1]],
    ];
    for (let i = 0; i < 9; i++) {
      const g = F.add(blocks(kinds[i % kinds.length]));
      const side = i % 2 ? 1 : -1;
      g.position.set(side * rnd(26, 70), rnd(-24, 22), rnd(-150, -20)); g.userData.v = V(rnd(-1, 1), rnd(-0.4, 0.4), rnd(-2, 2)); g.userData.r = V(rnd(-0.4, 0.4), rnd(-0.4, 0.4), rnd(-0.4, 0.4));
      S.junk.push(g);
    }
    // something enormous, out there
    S.eye = F.plane(eyeTex(), 150, 75, [0, 30, -330], [0, 0, 0], { basic: true, transparent: true, fog: false });
    S.eye.scale.y = 0.01; S.eye.visible = false;
    F.fallKill(-45, 'fell into the void');
  },
  start(F) { A.drone(0.18); A.whispers(0.12); F.sound(null, 'drone'); F.sound(null, 'whisper'); },
  update(F, dt, t) {
    const S = F.state;
    for (const g of S.junk) { g.position.addScaledVector(g.userData.v, dt); g.rotation.x += g.userData.r.x * dt; g.rotation.y += g.userData.r.y * dt; g.rotation.z += g.userData.r.z * dt; }
    // stepped on: wobble, then drop; come back a while later
    for (const ch of F.chars()) { const tl = ch.groundPart && S.tiles.find((q) => q.p === ch.groundPart); if (tl && !tl.fall) { tl.fall = t + 0.6; A.tone(220, 0.15, { type: 'sine', to: 160, vol: 0.12, pos: ch.rootPosition }); } }
    for (const tl of S.tiles) {
      if (!tl.p || !tl.fall) continue;
      if (t < tl.fall) { tl.p.setPosition(tl.x + Math.sin(t * 60) * 0.08, tl.y, tl.z); continue; }
      if (!tl.gone) { tl.v += 70 * dt; tl.y -= tl.v * dt; tl.p.setPosition(tl.x, tl.y, tl.z); if (tl.y < -70) { tl.gone = t; tl.p.mesh.visible = false; tl.p.setCanCollide(false); } }
      else if (!S.collapse && t - tl.gone > 8) { tl.fall = 0; tl.gone = 0; tl.v = 0; tl.y = -0.5; tl.p.setPosition(tl.x, tl.y, tl.z); tl.p.mesh.visible = true; tl.p.setCanCollide(true); A.sparkle(V(tl.x, 0, tl.z)); }
    }
    S.door.position.y = Math.sin(t * 1.3) * 0.15;
    S.doorLight.set?.(26 + Math.sin(t * 7) * 6);
    // through the door: you come out... back in the elevator
    for (const ch of F.chars()) if (ch.rootPosition.distanceTo(S.doorAt) < 3.4) {
      if (!S.opened) { S.opened = true; F.bonus(ch, 'Door to Nowhere', 3); }
      const s = F.E.car.spot(); ch.body.position.set(s.x, 3.1, s.z); ch.body.velocity.set(0, 0, 0);
      A.whoosh?.(s); A.sparkle(s);
      if (ch.player?.isLocal) { F.E.ui.flash('#ffffff', 0.9); F.E.ui.toast('The door led... back into the elevator?', '#d8d8ff', 'rgba(30,30,60,.9)'); }
      if (ch.player?.brain) ch.player.brain.goHome();
    }
    // the eye opens
    if (S.eyeOpen) { S.eyeK = Math.min(1, (S.eyeK || 0) + dt * 0.5); S.eye.scale.y = Math.max(0.01, S.eyeK * (Math.sin(t * 0.9) > 0.97 ? 0.1 : 1)); }
  },
  closing(F) {
    const S = F.state;
    S.collapse = true; S.eyeOpen = true; S.eye.visible = true; A.stinger(); F.shake(0.3);
    // the whole path goes, from the far end in
    const n = S.tiles.length;
    S.tiles.forEach((tl, i) => { if (tl.p && !tl.fall) tl.fall = F.t + 0.3 + (n - i) / n * 3.6; });
    F.E.game.players.forEach((p) => { if (p.brain && Math.random() < 0.3) F.E.world.delay(rnd(0.5, 1.5), () => p.brain.say(pick(['WHAT IS THAT', 'RUN', 'the eye!!', 'nope nope nope']))); });
  },
  botTick(F, bot) { if (F.state.collapse && bot.mode === 'out') bot.mode = 'return'; },
};

// --- the jungle temple ---------------------------------------------------------------------------------------------------------------------------------------
function bigTree(F, x, z, h = 26) {
  F.box(x - 1.3, 0, z - 1.3, x + 1.3, h, z + 1.3, 192);
  const g = F.add(blocks([[13, 8, 13, 0, h + 1, 0, 28, { shape: 'ball' }], [9, 6, 9, 4, h - 1, 3, 37, { shape: 'ball' }], [9, 6, 9, -4, h + 2, -2, 141, { shape: 'ball' }]]));
  g.position.set(x, 0, z);
  for (let i = 0; i < 3; i++) F.add(blocks([[0.25, rnd(8, 16), 0.25, 0, 0, 0, 37]])).position.set(x + rnd(-5, 5), h - 6, z + rnd(-5, 5));
}
export const temple = {
  id: 'temple', name: 'The Jungle Temple', hint: 'Fortune and glory... and a very big rock.', color: '#ffd84a', time: 36,
  look: { sky: 'jungle', amb: [0xd8f0d0, 0x4a6a2a, 1.3], sun: [0xfff0c8, 1.25], fog: [0x9ac8a0, 90, 420] },
  bots: { venture: 0.75, spots: [[-14, -28], [16, -36], [-22, -52], [20, -60], [0, -46], [-8, -62]], area: [-26, -64, 26, -20] },
  lines: ['jungle!!', 'a temple', 'get the idol', 'dont touch the idol', 'is that gold', 'BOULDER', 'run!!!', 'indiana jones lol'],
  build(F) {
    const S = F.state;
    F.ground(-200, -260, 200, 40, 28, { top: 'Studs' });
    F.box(-5, 0.02, -66, 5, 0.1, DOOR_Z, 226, { canCollide: false }); // a dirt path
    // the temple: four tiers, stairs up the front, a shrine on top
    const tiers = [[20, 0, -112, -70], [16, 4, -108, -74], [12, 8, -104, -78], [8, 12, -100, -82]];
    for (const [w, y, z0, z1] of tiers) F.box(-w, y, z0, w, y + 4, z1, 151);
    for (let i = 0; i < 16; i++) F.box(-4.5, 0, -67 - i, 4.5, i + 1, -66 - i, 194, { top: 'Smooth' });
    for (const [x, z] of [[-6, -84], [6, -84], [-6, -96], [6, -96]]) F.box(x - 0.9, 16, z - 0.9, x + 0.9, 25, z + 0.9, 5);
    F.box(-8, 25, -98, 8, 27, -82, 5); F.box(-6, 27, -96, 6, 28.5, -84, 5);
    F.box(-1.5, 16, -91.5, 1.5, 19, -88.5, 192); // the pedestal
    // carved faces on the front of each tier
    const glyph = ctex('glyphs', 256, 64, (x, w, h) => { x.fillStyle = '#8a8466'; x.fillRect(0, 0, w, h); x.strokeStyle = '#4a4630'; x.lineWidth = 4; for (let i = 0; i < 4; i++) { const cx = 32 + i * 64; x.strokeRect(cx - 24, 8, 48, 48); x.beginPath(); x.arc(cx - 9, 26, 6, 0, 7); x.arc(cx + 9, 26, 6, 0, 7); x.stroke(); x.beginPath(); x.moveTo(cx - 12, 44); x.lineTo(cx + 12, 44); x.stroke(); } });
    for (const [w, y, , z1] of tiers) for (const s of [-1, 1]) F.plane(tiled(glyph, (w - 5) / 4, 1), w - 5, 4, [s * (w + 4.5) / 2, y + 2, z1 + 0.06], [0, 0, 0]);
    // the idol
    S.idol = F.add(blocks([[1.6, 1.4, 1.2, 0, 0.7, 0, 24, { emissive: 0.2 }], [1.4, 1.2, 1.2, 0, 2, 0, 24, { emissive: 0.2 }], [0.3, 0.3, 0.1, -0.3, 2.1, -0.62, 21, { emissive: 1 }], [0.3, 0.3, 0.1, 0.3, 2.1, -0.62, 21, { emissive: 1 }]]));
    S.idol.position.set(0, 19, -90); S.idol.rotation.y = Math.PI;
    S.idolLight = F.light(V(0, 21, -88), 0xffd860, 50, 16);
    // jungle: big trees, palms, ferns, vines, a fallen log
    for (const [x, z, h] of [[-34, -30, 28], [36, -26, 24], [-48, -70, 30], [44, -76, 26], [-30, -120, 32], [34, -124, 28], [-62, -30, 24], [62, -46, 26], [-18, -140, 30], [16, -150, 26]]) bigTree(F, x, z, h);
    for (let i = 0; i < 40; i++) { const x = rnd(-80, 80), z = rnd(-150, -14); if (Math.abs(x) < 9 && z > -70) continue; if (Math.abs(x) < 24 && z < -66 && z > -116) continue; F.add(blocks([[rnd(2, 4), rnd(1.5, 3), rnd(2, 4), 0, 0.8, 0, pick([28, 37, 141]), { shape: 'cone' }]])).position.set(x, 0, z); }
    F.box(14, 0, -48, 26, 2, -46, 192, { top: 'Smooth' });
    // a rope bridge over a ravine on the side? (no - a river)
    F.box(-80, -0.4, -100, -40, 0.02, -88, 102, { canCollide: false, transparency: 0.3 });
    S.boulder = null; S.rolling = false;
  },
  start(F) { A.jungle(0.3); F.sound(null, 'jungle'); },
  update(F, dt, t) {
    const S = F.state;
    if (!S.idolTaken) { S.idol.rotation.y = Math.PI + Math.sin(t) * 0.2; S.idolLight.set?.(40 + Math.sin(t * 3) * 12); }
    if (!S.idolTaken) for (const ch of F.chars()) if (ch.rootPosition.distanceTo(V(0, 21, -90)) < 4) {
      S.idolTaken = true; S.idol.visible = false; S.idolLight.set?.(0);
      F.bonus(ch, 'Fortune and Glory', 3); A.sparkle(V(0, 20, -90));
      F.at(t + 1.2, () => release(F)); F.shake(0.5); A.crumble?.(V(0, 20, -90));
      F.E.game.players.forEach((p) => { if (p.brain && Math.random() < 0.4) F.E.world.delay(rnd(0.6, 1.6), () => p.brain.say(pick(['uh oh', 'what was that', 'RUN', 'the ground is shaking']))); });
    }
    const B = S.boulder;
    if (B) {
      // roll along the top, down the stairs, along the path... and smash on the wall by the doors
      B.z += dt * 26;
      const top = 16, y = B.z < -82 ? top : B.z < -66 ? top - (B.z + 82) : 0;
      B.p.setPosition(0, y + 6, B.z); B.rot += dt * 26 / 6; B.p.setRotationDeg(B.rot * 57.3, 0, 0);
      F.shake(Math.max(0, 0.6 - Math.abs(F.E.world.camera.position.z - B.z) / 120));
      for (const ch of F.chars()) if (ch.rootPosition.distanceTo(B.p.position) < 7.6) F.kill(ch, 'was flattened by a boulder');
      if (B.z > -16) {
        A.explosion(V(0, 6, -16), 0.9); A.crumble?.(V(0, 6, -16)); F.burst('dust', V(0, 5, -16), 30, { speed: [6, 20], size: [3, 6], life: [1, 2.4], gravity: 0.2, grow: 1.4 });
        for (let i = 0; i < 8; i++) { const r = F.part({ size: [rnd(2, 4), rnd(2, 4), rnd(2, 4)], position: [rnd(-5, 5), rnd(3, 9), rnd(-20, -14)], color: 5, anchored: false }); r.body.velocity.set(rnd(-30, 30), rnd(10, 30), rnd(-30, -5)); }
        B.p.destroy(); S.boulder = null; F.shake(1.2);
      }
    }
  },
  closing(F) { if (!F.state.rolled) release(F); },
  botTick(F, bot) {
    const S = F.state;
    if (!S.idolTaken && bot.mode === 'out' && bot.bravery > 0.9 && !bot.idolRun) { bot.idolRun = true; bot.plan.unshift(V(0, 0, -64), V(0, 16, -86), V(0, 16, -89)); }
    if (S.boulder && bot.mode === 'out' && Math.abs(bot.ch.rootPosition.x) < 8) bot.plan.unshift(V(bot.ch.rootPosition.x < 0 ? -18 : 18, 0, bot.ch.rootPosition.z));
  },
};
function release(F) {
  const S = F.state; if (S.rolled) return; S.rolled = true;
  S.boulder = { p: F.mover({ name: 'Boulder', shape: 'Ball', size: [12, 12, 12], position: [0, 22, -104], color: 5, top: 'Smooth' }), z: -104, rot: 0 };
  A.roar(V(0, 20, -100), 0.35, 2.4); F.shake(0.8);
  F.say('???', '*RUMBLE*', V(0, 26, -100));
}

// --- the aquarium tunnel -------------------------------------------------------------------------------------------------------------------------------------
function fishModel(c1, c2, s = 1) {
  const g = blocks([[1.2 * s, 1.4 * s, 2.6 * s, 0, 0, 0, c1, { shape: 'ball' }], [0.2 * s, 1.4 * s, 1 * s, 0, 0, 1.6 * s, c2, { name: 'tail' }], [0.3 * s, 0.3 * s, 0.3 * s, 0.5 * s, 0.25 * s, -0.8 * s, 26, { shape: 'ball' }], [0.3 * s, 0.3 * s, 0.3 * s, -0.5 * s, 0.25 * s, -0.8 * s, 26, { shape: 'ball' }]], { shadow: false });
  return g;
}
export const aquarium = {
  id: 'aquarium', name: 'The Aquarium', hint: 'A glass tunnel under the sea. Lovely. Sturdy. Probably.', color: '#5ad0ff', time: 34,
  look: { skyColor: 0x0a3a6a, amb: [0x9ad8ff, 0x0a2a4a, 1.2], sun: [0xa8e0ff, 0.7], fog: [0x0c4a7a, 30, 150] },
  bots: { venture: 0.8, spots: [[0, -20], [2, -36], [-2, -52], [0, -68], [-8, -92], [8, -96], [0, -102]], area: [-5, -88, 5, -14] },
  lines: ['FISH', 'look at the shark', 'so many fish', 'is the glass cracking', 'the glass!!', 'WATER', 'nemo', 'feed the fish!'],
  build(F) {
    const S = F.state;
    const T0 = DOOR_Z, T1 = -86, R0 = -86, R1 = -108;
    // the tunnel: floor, glass walls and roof, ribs; then a round viewing room at the end
    F.ground(-7.5, R1 - 1, 7.5, T0 + 0.5, 194);
    F.ground(-16, R1 - 1, 16, R0, 194);
    for (const s of [-1, 1]) F.box(s * 7, 0, T1, s * 7.4, 10, T0, 42, { transparency: 0.78, canCollide: true });
    F.box(-7.4, 10, T1, 7.4, 10.4, T0, 42, { transparency: 0.78 });
    for (let z = T0 - 4; z > T1; z -= 8) { F.box(-7.8, 0, z - 0.3, -7, 10.8, z + 0.3, 199); F.box(7, 0, z - 0.3, 7.8, 10.8, z + 0.3, 199); F.box(-7.8, 10.4, z - 0.3, 7.8, 10.8, z + 0.3, 199); }
    for (const s of [-1, 1]) { F.box(s * 16, 0, R1, s * 16.4, 14, R0, 42, { transparency: 0.78 }); F.box(s * 7.4, 0, R0 - 0.4, s * 16.4, 14, R0, 42, { transparency: 0.78 }); }
    F.box(-16.4, 0, R1 - 0.4, 16.4, 14, R1, 42, { transparency: 0.78 }); F.box(-16.4, 14, R1 - 0.4, 16.4, 14.4, R0, 42, { transparency: 0.78 });
    F.box(-7.4, 10, R0 - 0.4, 7.4, 14, R0, 42, { transparency: 0.78 });
    // outside: the sea bed, coral, kelp, a wreck, a chest
    F.ground(-200, -300, 200, -9.5, 226, { y: -3 });
    const caus = tiled(dtex().water, 30, 30);
    F.state.caus = F.plane(caus, 400, 300, [0, -2.9, -150], [-90, 0, 0], { transparent: true, opacity: 0.35, basic: true });
    F.state.caus.material.blending = THREE.AdditiveBlending;
    for (let i = 0; i < 40; i++) { const x = (Math.random() < 0.5 ? -1 : 1) * rnd(10, 70), z = rnd(-200, -14); const c = pick([21, 23, 24, 104, 223, 106]); F.add(blocks([[rnd(1, 3), rnd(2, 7), rnd(1, 3), 0, 0, 0, c, { shape: pick(['cone', 'ball', 'cyl']) }]], { shadow: false })).position.set(x, -2, z); }
    S.kelp = [];
    for (let i = 0; i < 26; i++) { const x = (Math.random() < 0.5 ? -1 : 1) * rnd(9, 50), z = rnd(-180, -14); const h = rnd(10, 24); const g = blocks([[0.6, h, 0.2, 0, h / 2, 0, 37]], { shadow: false }); g.position.set(x, -3, z); F.add(g); S.kelp.push(g); }
    F.add(blocks([[10, 7, 30, 0, 0, 0, 192, { rz: 20 }], [9, 1, 28, 0, 3.8, 0, 25, { rz: 20 }], [1, 18, 1, -2, 10, 3, 192, { rz: 26 }]], { shadow: false })).position.set(-40, 1, -130);
    F.add(blocks([[3.6, 2, 2.4, 0, 1, 0, 192], [3.6, 1.2, 2.4, 0, 2.6, 0, 24, { shape: 'cyl', rz: 90 }]], { shadow: false })).position.set(28, -3, -95);
    // fish, a turtle, a shark
    S.fish = [];
    const cols = [[24, 21], [106, 1], [23, 24], [104, 23], [21, 24], [223, 23], [24, 26]];
    for (let i = 0; i < 34; i++) {
      const [a, b] = pick(cols), s = rnd(0.8, 1.6);
      const g = F.add(fishModel(a, b, s));
      S.fish.push({ g, cx: (Math.random() < 0.5 ? -1 : 1) * rnd(9, 30), cz: rnd(-130, -20), r: rnd(8, 26), y: rnd(-1, 20), w: rnd(0.15, 0.45) * (Math.random() < 0.5 ? -1 : 1), ph: rnd(0, 6.28), feed: 0 });
    }
    const turtle = F.add(blocks([[5, 1.6, 6, 0, 0, 0, 28, { shape: 'ball' }], [1.6, 1.2, 1.8, 0, 0, -3.4, 37, { shape: 'ball' }], [3, 0.3, 1.2, 2.6, -0.2, -1.4, 37, { ry: -20 }], [3, 0.3, 1.2, -2.6, -0.2, -1.4, 37, { ry: 20 }]], { shadow: false }));
    S.turtle = turtle;
    S.shark = F.add(blocks([[3, 3.2, 12, 0, 0, 0, 199, { shape: 'ball' }], [0.5, 4, 3, 0, 2.6, 0.5, 199, { rx: -25 }], [0.4, 4, 2, 0, 0, 6.5, 199, { rx: 30 }], [3.6, 0.3, 2.4, 1.8, -0.6, -1, 199, { rz: -20 }], [3.6, 0.3, 2.4, -1.8, -0.6, -1, 199, { rz: 20 }], [2.4, 0.4, 1.4, 0, -0.9, -4.8, 1], [0.4, 0.4, 0.4, 1.2, 0.5, -4.4, 26, { shape: 'ball' }], [0.4, 0.4, 0.4, -1.2, 0.5, -4.4, 26, { shape: 'ball' }]], { shadow: false }));
    // the diver cleaning the glass of the viewing room, and the FEED button
    S.diver = F.puppet(DRESS(24, 26, 26), { at: [0, 4, R1 - 3, Math.PI], hat: (head) => head.add(blocks([[1.8, 1.8, 1.8, 0, 0.05, 0, 199, { shape: 'ball', opacity: 0.7 }]])) });
    S.diver.pose = (a, t) => { a.rs = 1.6 + Math.sin(t * 4) * 0.5; a.ls = 0.3; a.rh = Math.sin(t * 3) * 0.4; a.lh = -Math.sin(t * 3) * 0.4; };
    F.box(-1, 0, -100, 1, 3, -98, 199);
    S.button = F.add(blocks([[1.4, 0.5, 1.4, 0, 0, 0, 21, { shape: 'cyl', emissive: 0.4 }]])); S.button.position.set(0, 3.25, -99);
    F.sign(0, 5, -100.2, 4, 1.4, 'FEED THE FISH', { bg: '#ffe066', fg: '#1a3a6a', face: 'z', noBoard: false });
    F.sign(-6.8, 7, -30, 7, 2.6, 'PLEASE DO NOT\nTAP THE GLASS', { bg: '#ffffff', fg: '#c4281c', face: 'x', noBoard: true });
    // bubbles
    S.bubbles = [];
    const bm = new THREE.MeshPhongMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0.5, shininess: 100 });
    const bg = new THREE.SphereGeometry(0.3, 8, 6);
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(bg, bm); m.position.set((Math.random() < 0.5 ? -1 : 1) * rnd(8, 40), rnd(-3, 30), rnd(-150, -14)); F.add(m); S.bubbles.push(m); }
    // the flood (later)
    S.level = -1;
    const wt = tiled(dtex().water, 4, 20);
    S.water = [F.plane(wt, 14, 76.8, [0, -1, -47.6], [-90, 0, 0], { transparent: true, opacity: 0.75, shininess: 80 }), F.plane(wt, 32, 22.4, [0, -1, -97.2], [-90, 0, 0], { transparent: true, opacity: 0.75, shininess: 80 })];
    for (const w of S.water) { w.material.color.set(0x3a9ad8); w.visible = false; }
    S.cracks = [];
    swim(F, () => S.level, (p) => p.z < DOOR_Z - 0.5 && S.level > 0);
  },
  start(F) { A.underwater(0.22); F.sound(null, 'under'); A.playSong('floor', 'musicbox', 0.2); },
  update(F, dt, t) {
    const S = F.state;
    S.caus.material.map.offset.set((t * 0.02) % 1, (t * 0.013) % 1);
    for (const k of S.kelp) k.rotation.z = Math.sin(t * 0.8 + k.position.x) * 0.12;
    for (const f of S.fish) {
      let p;
      if (f.feed > 0) { f.feed -= dt; p = V(Math.sin(t * 2.3 + f.ph) * 5, 18 + Math.sin(t * 3 + f.ph) * 2, -97 + Math.cos(t * 2 + f.ph) * 5); p.lerp(f.g.position, 0.94); }
      else { const a = t * f.w + f.ph; p = V(f.cx + Math.cos(a) * f.r, f.y + Math.sin(t * 0.7 + f.ph) * 1.5, f.cz + Math.sin(a) * f.r); }
      if (Math.abs(p.x) < 8 && p.z > -86 && p.y < 11.5) p.y = 12.5; // (not inside the tunnel)
      if (Math.abs(p.x) < 17 && p.z <= -85 && p.z > -110 && p.y < 15.5) p.y = 16;
      const d = p.clone().sub(f.g.position); if (d.lengthSq() > 1e-4) f.g.rotation.y = Math.atan2(-d.x, -d.z);
      f.g.position.copy(p);
      const tail = f.g.children.find((m) => m.name === 'tail'); if (tail) tail.rotation.y = Math.sin(t * 9 + f.ph) * 0.5;
    }
    const ta = t * 0.12; S.turtle.position.set(Math.cos(ta) * 30, 19 + Math.sin(t * 0.3) * 2, -60 + Math.sin(ta) * 40); S.turtle.rotation.y = -ta + Math.PI;
    const sa = t * 0.35; S.shark.position.set(Math.cos(sa) * 18, 17 + Math.sin(t * 0.5) * 1.5, -50 + Math.sin(sa) * 34); S.shark.rotation.y = -sa;
    for (const b of S.bubbles) { b.position.y += dt * 4; if (b.position.y > 32) b.position.y = -3; }
    // the FEED button
    if (!S.fed) for (const ch of F.chars()) if (ch.rootPosition.distanceTo(V(0, 5, -99)) < 2.8) {
      S.fed = true; S.button.position.y = 3.05; A.buttonBeep(); A.kerplunk(V(0, 12, -97)); F.bonus(ch, 'Fish Feeder', 2);
      for (const f of S.fish) f.feed = 10;
      F.burst(0xc89a5a, V(0, 19, -97), 24, { speed: [1, 4], size: [0.3, 0.6], life: [2, 4], gravity: 0.1 });
    }
    // cracks, then the flood
    if (S.cracking && S.cracks.length < 7 && t > S.nextCrack) {
      S.nextCrack = t + rnd(0.35, 0.8);
      const z = rnd(-80, -14), side = Math.random() < 0.5 ? -1 : 1;
      const c = F.plane(crackTex(), rnd(4, 7), rnd(4, 7), [side * 6.95, rnd(3, 8), z], [0, side * -90, rnd(0, 360)], { transparent: true, basic: true });
      S.cracks.push(c); A.crack(V(side * 7, 5, z)); F.shake(0.2);
      F.burst('dust', V(side * 6.5, 6, z), 6, { speed: [2, 6], size: [0.4, 0.8], life: [0.5, 1], gravity: 1 });
    }
    if (!S.cracking && t > F.E.cur.time - 12) {
      S.cracking = true; S.nextCrack = t; A.crack(V(0, 8, -40)); F.shake(0.4);
      F.say('Intercom', 'Attention visitors: please exit the tunnel. Calmly. Quickly.', V(0, 9, -20));
    }
    if (S.flood) {
      S.level = Math.min(9.5, S.level + dt * 3); for (const w of S.water) { w.visible = true; w.position.y = S.level; } S.water[0].material.map.offset.x = (t * 0.05) % 1;
      if (Math.random() < dt * 8) F.burst('dust', V(rnd(-6, 6), S.level, rnd(-80, -12)), 3, { speed: [2, 6], size: [0.6, 1.2], life: [0.4, 0.8], gravity: 1 });
      for (const ch of F.chars({ outside: true })) if (ch.rootPosition.z < DOOR_Z && ch.rootPosition.y + 1.6 < S.level) { ch.under = (ch.under || 0) + dt; if (ch.under > 1.5) F.hurt(ch, 35 * dt, 'drowned in the aquarium'); } else ch.under = 0;
    }
  },
  closing(F) {
    const S = F.state;
    S.flood = true; S.level = 0; A.splash(V(0, 2, -50), 1.6); A.glassBreak(V(6, 6, -40)); F.shake(0.6);
    F.say('Intercom', 'Oh dear.', V(0, 9, -20));
  },
  tint(F, ch) { const S = F.state; return ch?.alive && S.flood && ch.rootPosition.z < DOOR_Z && ch.rootPosition.y + 1.6 < S.level ? ['rgba(20,90,160,0.45)', 1] : null; },
};
function crackTex() {
  return ctex('crack', 256, 256, (x, w) => {
    x.clearRect(0, 0, w, w); x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 2.5;
    for (let i = 0; i < 9; i++) { let px = w / 2, py = w / 2; const a = i / 9 * Math.PI * 2 + rnd(-0.2, 0.2); x.beginPath(); x.moveTo(px, py); for (let j = 0; j < 6; j++) { px += Math.cos(a + rnd(-0.5, 0.5)) * w * 0.08; py += Math.sin(a + rnd(-0.5, 0.5)) * w * 0.08; x.lineTo(px, py); } x.stroke(); }
    for (const r of [20, 46, 80]) { x.beginPath(); for (let k = 0; k <= 12; k++) { const a = k / 12 * Math.PI * 2; const rr = r * rnd(0.85, 1.15); if (k) x.lineTo(w / 2 + Math.cos(a) * rr, w / 2 + Math.sin(a) * rr); else x.moveTo(w / 2 + Math.cos(a) * rr, w / 2 + Math.sin(a) * rr); } x.stroke(); }
  });
}

// --- the snow day ----------------------------------------------------------------------------------------------------------------------------------------------
function yeti(F) {
  const S = F.state;
  S.yeti = F.puppet({ colors: ALL(1) }, { at: [0, 0, -150, Math.PI], scale: 2.4, faceTex: FACES.angry(), speed: 20 });
  A.roar(V(0, 10, -150), 0.8, 2); F.shake(0.5);
  F.say('Kid', 'YETIIIII!!!', S.kids[1]);
  for (const k of S.kids) { k.walkTo(V(k.pos.x * 3 + 20, 0, -170), 14); k.throwT = 999; }
}
function pine(F, x, z, h = 18) {
  F.box(x - 0.7, 0, z - 0.7, x + 0.7, h * 0.4, z + 0.7, 192);
  const g = F.add(blocks([[h * 0.6, h * 0.45, h * 0.6, 0, h * 0.42, 0, 141, { shape: 'cone' }], [h * 0.46, h * 0.38, h * 0.46, 0, h * 0.66, 0, 141, { shape: 'cone' }], [h * 0.3, h * 0.3, h * 0.3, 0, h * 0.88, 0, 141, { shape: 'cone' }], [h * 0.34, h * 0.08, h * 0.34, 0, h * 0.62, 0, 1, { shape: 'cone' }], [h * 0.2, h * 0.07, h * 0.2, 0, h * 0.97, 0, 1, { shape: 'cone' }]]));
  g.position.set(x, 0, z);
}
export const snow = {
  id: 'snow', name: 'Snow Day', hint: 'No school today! (Watch out for snowballs.)', color: '#e8f4ff', time: 36,
  look: { sky: 'overcast', amb: [0xf0f4ff, 0xc8d0e0, 1.45], sun: [0xf4f8ff, 1.1], fog: [0xd8e0ea, 80, 380] },
  bots: { venture: 0.85, spots: [[-14, -26], [10, -30], [-24, -50], [18, -52], [0, -40], [30, -70], [-6, -64]], area: [-30, -66, 30, -18] },
  lines: ['SNOW', 'snowball fight!!', 'its cold', 'build a snowman', 'the ice is slippery', 'ow a snowball hit me', 'what was that roar', 'YETI'],
  build(F) {
    const S = F.state;
    F.ground(-220, -260, 220, 40, 1, { top: 'Smooth' });
    for (let i = 0; i < 18; i++) F.add(blocks([[rnd(8, 18), rnd(1, 3), rnd(8, 18), 0, 0, 0, 1, { shape: 'ball' }]])).position.set(rnd(-90, 90), 0, rnd(-160, -20));
    for (const [x, z, h] of [[-40, -26, 20], [-52, -44, 24], [44, -30, 18], [56, -58, 26], [-60, -90, 28], [62, -100, 22], [-30, -120, 26], [30, -130, 24], [-74, -60, 22], [80, -76, 24], [0, -150, 30], [-18, -140, 22], [20, -160, 28]]) pine(F, x, z, h);
    // the frozen pond
    F.box(-30, 0, -78, 4, 0.12, -56, 42, { transparency: 0.25, material: 'Ice', top: 'Smooth' });
    F.ice((p) => p.x > -30 && p.x < 4 && p.z > -78 && p.z < -56 && p.y < 4.5, 0.9);
    // the snowman, and the snow fort with kids in it
    S.snowman = F.add(blocks([[6, 6, 6, 0, 3, 0, 1, { shape: 'ball' }], [4.6, 4.6, 4.6, 0, 7.6, 0, 1, { shape: 'ball' }], [3.4, 3.4, 3.4, 0, 11, 0, 1, { shape: 'ball' }], [0.5, 0.5, 2, 0, 11, -2.2, 106, { shape: 'cone', rx: -90 }], [0.5, 0.5, 0.3, -0.7, 11.6, -1.6, 26, { shape: 'ball' }], [0.5, 0.5, 0.3, 0.7, 11.6, -1.6, 26, { shape: 'ball' }], [3.6, 0.3, 3.6, 0, 12.6, 0, 26, { shape: 'cyl' }], [2.4, 2.2, 2.4, 0, 13.8, 0, 26, { shape: 'cyl' }], [3.8, 0.8, 3.8, 0, 9.4, 0, 21, { shape: 'cyl' }]]));
    S.snowman.position.set(16, 0, -32); S.snowman.rotation.y = 0.4;
    F.box(14, 0, -34, 18, 12, -30, 1, { transparency: 1 });
    F.box(-12, 0, -98, 12, 4.5, -96, 1, { top: 'Smooth' }); F.box(-12, 0, -106, -10, 4.5, -96, 1); F.box(10, 0, -106, 12, 4.5, -96, 1);
    for (let x = -11; x <= 11; x += 2.2) F.add(blocks([[2.2, 1.4, 2.2, 0, 0, 0, 1, { shape: 'ball' }]])).position.set(x, 4.6, -97);
    S.kids = [];
    for (const [i, x] of [-7, 0, 7].entries()) {
      const k = F.puppet(DRESS(24, [21, 23, 28][i], 26), { at: [x, 0, -100, Math.PI], scale: 0.7, hat: (head) => head.add(blocks([[1.3, 0.8, 1.3, 0, 0.6, 0, [104, 24, 21][i], { shape: 'ball' }], [0.5, 0.5, 0.5, 0, 1.1, 0, 1, { shape: 'ball' }]])) });
      k.throwT = rnd(1, 4); S.kids.push(k);
    }
    S.balls = [];
    // a sled on the hill
    F.part({ size: [14, 12, 57.6], position: [52, 0.92, -91.4], rotation: [13.55, 0, 0], color: 1, top: 'Smooth' });
    F.box(46, 0, -130, 58, 13.5, -118, 1, { top: 'Smooth' });
    for (let i = 0; i < 14; i++) F.box(58, 0, -130 + i * 0.9, 61, i + 1, -129.1 + i * 0.9, 1);
    S.sled = F.mover({ size: [3, 0.6, 5], position: [52, 13.8, -121], color: 21, top: 'Smooth' });
    S.sledT = -1;
    S.yeti = null;
  },
  start(F) { F.E.weather.set('snow', 0.7); A.wind(0.18); F.sound(null, 'wind'); A.playSong('floor', 'musicbox', 0.22); },
  update(F, dt, t) {
    const S = F.state;
    // snowball kids throw at whoever's closest
    for (const k of S.kids) {
      k.throwT -= dt;
      const tgt = F.nearest(k.pos, { outside: true, max: 70 });
      if (tgt && !k.walking) k.face(tgt.rootPosition);
      k.pose = (a) => { a.rs = k.throwT < 0.5 ? 3 - k.throwT * 2 : 0.2; };
      if (k.throwT <= 0 && tgt) {
        k.throwT = rnd(1.6, 3.4);
        const from = k.pos.clone().add(V(0, 4.5, 1.6)), to = tgt.rootPosition.clone().add(V(tgt.body.velocity.x, 0, tgt.body.velocity.z).multiplyScalar(0.45)).add(V(rnd(-2, 2), 0, rnd(-2, 2)));
        const T = from.distanceTo(to) / 45 + 0.2, v = to.clone().sub(from).divideScalar(T); v.y += 0.5 * 50 * T;
        const m = F.add(blocks([[1.2, 1.2, 1.2, 0, 0, 0, 1, { shape: 'ball' }]])); m.position.copy(from);
        S.balls.push({ m, v, life: 3 }); A.whoosh?.(from);
      }
    }
    for (const b of [...S.balls]) {
      b.v.y -= 50 * dt; b.m.position.addScaledVector(b.v, dt); b.life -= dt;
      let hit = null;
      for (const ch of F.chars()) if (ch.rootPosition.distanceTo(b.m.position) < 2.4) hit = ch;
      if (hit || b.m.position.y < 0.3 || b.life < 0) {
        F.burst(0xffffff, b.m.position.clone(), 8, { speed: [3, 8], size: [0.5, 1], life: [0.4, 0.8], gravity: 1 });
        A.splat(b.m.position);
        if (hit) { F.fling(hit, b.v.clone().setY(0).normalize().multiplyScalar(22).add(V(0, 16, 0)), 0.5); if (hit.player?.isLocal) F.E.ui.flash('#ffffff', 0.5); hit.snowHits = (hit.snowHits || 0) + 1; }
        F.E.world.scene.remove(b.m); S.balls.splice(S.balls.indexOf(b), 1);
      }
    }
    // the sled: sit on it at the top of the hill and away you go
    const sp = S.sled.position;
    if (S.sledT < 0) {
      if (F.chars().some((ch) => ch.groundPart === S.sled)) { S.sledT = 0; S.riders = F.chars().filter((ch) => ch.groundPart === S.sled); A.whoosh?.(sp); }
    } else {
      S.sledT += dt;
      const k = S.sledT;
      if (k < 3.2) { const z = Math.min(-40, -121 + k * k * 9), y = 0.3 + Math.max(0, Math.min(13.5, 13.5 - (z + 118) * (13.5 / 56))); S.sled.setPosition(52, y, z); S.sled.setRotationDeg(z > -118 && z < -62 ? 13.55 : 0, 0, 0); }
      else if (k > 3.2 && !S.sledDone) { S.sledDone = true; for (const ch of S.riders || []) if (ch.alive && ch.rootPosition.distanceTo(sp) < 6) F.bonus(ch, 'Sled Champion', 2); }
      if (k > 7) { S.sledT = -1; S.sledDone = false; S.sled.setPosition(52, 13.8, -121); S.sled.setRotationDeg(0, 0, 0); }
    }
    if (!S.hug) for (const ch of F.chars()) if (Math.hypot(ch.rootPosition.x - 16, ch.rootPosition.z + 32) < 5.5) { S.hug = true; F.bonus(ch, 'Hugged a Snowman', 1); A.sparkle(V(16, 8, -32)); }
    // the yeti
    if (!S.yeti && t > F.E.cur.time - 11) yeti(F);
    const Y = S.yeti;
    if (Y) {
      const tgt = S.yetiHome ? null : F.nearest(Y.pos, { outside: true });
      if (tgt) { const g = tgt.rootPosition.clone().setY(0); g.z = Math.min(g.z, -14); Y.walkTo(g, S.charge ? 27 : 20); } else if (S.yetiHome) Y.walkTo(V(0, 0, -170), 18);
      Y.pose = (a, tt, moving) => { a.rs = a.ls = moving ? 2.4 + Math.sin(tt * 10) * 0.4 : 3; };
      if ((S.stompT = (S.stompT || 0) - dt) <= 0 && Y.walking) { S.stompT = 0.4; A.stomp(Y.pos); F.shake(0.15); }
      for (const ch of F.chars({ outside: true })) if (Y.touches(ch, 2.4)) F.kill(ch, 'was hugged by the yeti');
    }
  },
  closing(F) { const S = F.state; S.charge = true; if (S.yeti) { A.roar(S.yeti.pos, 0.7, 1.6); F.shake(0.3); } },
  end(F) { F.E.weather.set(null); },
  botTick(F, bot) { if (F.state.yeti && bot.mode === 'out') bot.mode = 'return'; },
};
void THREE; void clamp;
