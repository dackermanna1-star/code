// Level 1 — tutorial: driving, leaning, smashing crates, a boost-jump over a spike pit,
// a spring pad over a wall, and a few gentle bumps to the finish.
export default {
  id: 'L01',
  name: 'Sunday Drive',
  blurb: 'A gentle countryside cruise. Nothing could possibly go wrong.',
  theme: 'meadow',
  difficulty: 1,
  seed: 1,
  build(B) {
    const c = B.course(-15, 0);
    c.flat(35); // -15 .. 20
    B.start(-6);
    B.sign(2, '↑ GO    ↓ STOP');
    B.sign(13, '← →  LEAN');
    B.deco('house', -12, { s: 1.1 });

    c.hill(16, 1.4); // 20 .. 36
    c.flat(5);
    c.hill(22, 2.2); // 41 .. 63, crest at 52
    B.tooth(52, 4.0);
    c.flat(10); // 63 .. 73

    B.sign(62, 'SMASH IT!');
    B.add('crate', { x: 69 });
    B.add('crate', { x: 69.85 });
    B.add('crate', { x: 69.42, y: 0.8 });
    c.flat(14); // 73 .. 87

    B.sign(76, 'BOOST → JUMP');
    B.add('boost', { x: 83, w: 6 });
    c.ramp(8, 1.8); // 87 .. 95, lip 1.8
    c.drop(3.0); // pit floor -1.2
    c.flat(7); // 95 .. 102
    B.add('spikes', { x: 98.5, w: 6.6 });
    B.sign(97.5, 'SPIKES: DON’T', { style: 'warning', dy: 0 });
    c.wall(1.0); // -0.2
    B.tooth(101, 4.2);
    c.flat(8); // .. 110
    c.landing(22, 2.0); // .. 132, y -2.2
    c.flat(12); // .. 144
    B.checkpoint(134);

    B.sign(138, 'SPRING PAD!');
    B.add('pad', { x: 146.5, angle: -0.3, power: 11, fixed: true });
    c.flat(10); // 144 .. 154
    B.rect(150.5, -2.2, 153.5, 1.0, 'rock');
    B.tooth(152, 2.4);
    c.landing(26, 3.5); // .. 180, y -5.7
    c.flat(8);
    B.sign(185, 'LEAN TO LAND\nON YOUR WHEELS');
    c.bumps(30, 3, 0.8); // 188 .. 218
    c.flat(12);
    B.add('ball', { x: 222 });
    B.add('ball', { x: 223.2, r: 0.35 });
    c.flat(20); // .. 250
    B.finish(238);
    c.flat(15);
    c.wall(6);
  },
};
