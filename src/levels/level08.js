// Level 8 — vertical: bounce up a staircase of ledges using spring pads (miss and you meet
// the spikes), dodge a crusher and harpoons on the way, then a huge descent.
export default {
  id: 'L08',
  name: 'Tower of Pain',
  blurb: 'Twenty metres up, one spring at a time. The spikes at the bottom are very patient.',
  theme: 'construction',
  difficulty: 4,
  seed: 8,
  build(B) {
    const c = B.course(-15, 0);
    c.flat(36); // .. 21
    B.start(-6);
    B.sign(3, 'TOWER OF PAIN\nGOING UP?');
    B.sign(13, 'HIT THE PADS.\nMISS THE SPIKES.', { style: 'warning' });

    const LEDGE = 18;
    const STEP = 4;
    for (let i = 0; i < 5; i++) {
      const s = c.here();
      if (i > 0) c.flat(LEDGE);
      else c.flat(LEDGE - 6);
      const len = i > 0 ? LEDGE : LEDGE - 6;
      const padX = s.x + len - 3.6;
      B.add('pad', { x: padX, y: s.y, angle: -0.25, power: 11.8, fixed: true });
      B.add('spikes', { x: s.x + len - 1.2, y: s.y, w: 1.9 });
      if (i === 2) B.add('crusher', { x: s.x + 6, y: s.y + 6.4, w: 3, h: 1.3, travel: 5.4, rod: 2.5, waitUp: 1.4, offset: 0.2 });
      if (i === 3) B.add('harpoon', { x: s.x + LEDGE + 30, y: s.y + 12, facing: -1, range: 26, cooldown: 2.4, delay: 0.5 });
      if (i === 1) B.tooth(padX + 2.5, s.y + 6.4);
      c.wall(STEP);
    }
    // top deck at y = 20
    const top = c.here();
    B.checkpoint(top.x + 6);
    c.flat(34);
    B.add('wrecking', { x: top.x + 14, y: top.y + 8.5, len: 6.4, amp: 1.1, period: 3.1, phase: 1.2 });
    B.add('glass', { x: top.x + 24, y: top.y });
    B.add('barrel', { x: top.x + 28, y: top.y });
    B.tooth(top.x + 14, top.y + 4.6);
    B.sign(top.x + 30, 'WHAT GOES UP…');
    c.ramp(4, 0.6);
    c.landing(44, 20.6);
    c.flat(10);
    B.sign(c.x - 4, 'MINES. OF COURSE.', { style: 'warning' });
    for (let i = 0; i < 3; i++) {
      c.ramp(4.5, 0.8);
      const lip = c.x;
      c.landing(8, 0.8);
      B.add('mine', { x: lip + 2.4, align: true });
      c.flat(3);
    }
    B.tooth(c.x - 6, 3.6);
    c.flat(30);
    B.finish(c.x - 14);
    c.flat(10).wall(7);
  },
};
