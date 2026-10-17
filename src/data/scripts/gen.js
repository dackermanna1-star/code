// Generic reusable scripts (CONTENT §3, owner: systems). Short, in Tess's voice; safe to call from any map.
//   gen.locked          a locked door/prop: its own lockedText if it has one, else a plain "Locked."
//   gen.no_seats        a room with nothing to sit on (restrooms, kitchen) — said once per room visit
//   gen.front_loop      the Ch1 front-door loop after the first time: a one-line repeat (ch1.front_loop runs first)
//   gen.locker_not_hide hall lockers are not hiding spots (DESIGN §4: seats only)
//   gen.nothing         nothing here
import HW from '../../engine/hw.js';

const pick = (list, n) => list[Math.min(list.length - 1, Math.max(0, n))];

export default {
  'gen.locked': async (g, ctx) => {
    g.sfx('door_locked', { vol: 0.8 });
    const p = ctx?.prop;
    let text = p?.inst?.lockedText ?? p?.lockedText ?? null;
    if (typeof text === 'function') {
      try { text = text(HW.state); } catch (e) { console.error('[gen.locked] lockedText', e); text = null; }
    }
    await g.examine(text || '[n] Locked.');
  },

  'gen.no_seats': async (g) => {
    const room = HW.game?.room?.id || '';
    if (room && g.flag(`no_seats_${room}`)) return;
    if (room) g.set(`no_seats_${room}`);
    await g.think('worried', 'No seats in here.');
  },

  'gen.front_loop': async (g) => {
    const n = g.inc('front_loops');
    await g.think(pick(['worried', 'scared', 'exhausted'], n - 1), pick([
      'The library doors again.',
      'Straight line. Library doors. {p} Okay.',
      "Front doors don't go outside. Got it.",
    ], n - 1));
  },

  'gen.locker_not_hide': async (g) => {
    await g.think('anxious', 'No. {p} Seats. Marcus said seats.');
  },

  'gen.nothing': async (g) => {
    await g.think('neutral', "Nothing. {p} Nothing I can use.");
  },
};
