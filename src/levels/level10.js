// Level 10 — the finale: a long gauntlet through a volcanic hellscape combining every
// hazard in the game, with three checkpoints.
export default {
  id: 'L10',
  name: 'Highway to Heck',
  blurb: 'Everything you have survived so far, all at once, and it is on fire.',
  theme: 'inferno',
  difficulty: 5,
  seed: 10,
  build(B) {
    const c = B.course(-15, 0);
    c.flat(30); // .. 15
    B.start(-6);
    B.sign(3, 'HIGHWAY TO HECK\nABANDON HOPE\n& MOST LIMBS');

    // 1. twin spike-pit jumps
    for (let i = 0; i < 2; i++) {
      c.ramp(6, 1.4);
      B.pit(c, 7 + i * 2, 3, { rise: 1.4 });
      c.flat(6);
    }
    B.tooth(c.x - 12, 4.6);

    // 2. three axes in a row
    B.sign(c.x + 1, 'SWING LOW', { style: 'warning' });
    c.flat(4);
    const a0 = c.x;
    c.flat(22);
    B.rect(a0 - 1, 7.2, a0 + 21, 7.9, 'rock');
    [4, 10, 16].forEach((dx, i) => B.add('blade', { x: a0 + dx, y: 7.2, len: 5.2, period: 2.2, amp: 1.0, phase: i * 2.1 }));
    B.clear(a0 - 1, a0 + 21);
    c.flat(6);
    B.checkpoint(c.x - 3);

    // 3. downhill wrecking balls under cannon fire
    const d0 = c.x;
    c.ease(40, -8);
    B.add('wrecking', { x: d0 + 12, y: B.groundY(d0 + 12) + 8.2, len: 6.6, amp: 1.1, period: 3.0 });
    B.add('wrecking', { x: d0 + 28, y: B.groundY(d0 + 28) + 8.2, len: 6.6, amp: 1.1, period: 3.0, phase: Math.PI });
    c.flat(10);
    B.add('cannon', { x: c.x + 18, angle: Math.PI - 0.08, speed: 18, interval: 2.4, delay: 0.5, range: 45 });
    B.tooth(d0 + 20, B.groundY(d0 + 20) + 4.4);

    // 4. mines and barrels
    for (let i = 0; i < 3; i++) {
      c.ramp(4.5, 0.85);
      const lip = c.x;
      c.landing(8, 0.85);
      B.add('mine', { x: lip + 2.3, align: true });
      if (i === 1) {
        B.add('barrel', { x: lip + 6.2, align: true });
        B.add('barrel', { x: lip + 6.85, align: true });
      }
      c.flat(2);
    }
    c.flat(16);
    B.checkpoint(c.x - 4);

    // 5. saws on tracks + crushers alternating
    c.flat(4);
    const s0 = c.x;
    c.flat(34);
    B.rect(s0 - 1, 8.4, s0 + 33, 9.1, 'rock');
    B.add('saw', { x: s0 + 4, y: 5.6, r: 0.9, path: [[s0 + 4, 0.9]], speed: 6, wait: 0.4 });
    B.add('crusher', { x: s0 + 11, y: 5.3, w: 2.6, h: 1.3, travel: 4.4, rod: 2.4, waitUp: 1.3, offset: 0.6 });
    B.add('saw', { x: s0 + 18, y: 0.9, r: 0.9, path: [[s0 + 18, 5.6]], speed: 6, wait: 0.4 });
    B.add('crusher', { x: s0 + 25, y: 5.3, w: 2.6, h: 1.3, travel: 4.4, rod: 2.4, waitUp: 1.3, offset: 1.8 });
    B.add('zapper', { x: s0 + 31, h: 3.3, period: 2.4, onFor: 1.0 });
    B.clear(s0 - 1, s0 + 33);
    B.tooth(s0 + 14.5, 2.2);
    c.flat(6);

    // 6. collapsing bridge over the lava pit, under harpoon fire
    B.sign(c.x - 3, 'THE FLOOR IS\nLITERALLY LAVA', { style: 'warning' });
    const b0 = c.here();
    B.pit(c, 21, 6);
    for (let i = 0; i < 7; i++) B.add('collapse', { x: b0.x + 1.55 + i * 3, y: b0.y - 0.2, w: 3, delay: 0.35 });
    B.add('harpoon', { x: b0.x + 34, facing: -1, range: 32, cooldown: 2.1, delay: 0.4 });
    c.flat(8);
    B.checkpoint(c.x - 4);

    // 7. catapult over a spiked trench, then the final leap
    c.flat(4);
    B.add('pad', { x: c.x + 3, angle: -0.42, power: 15, fixed: true });
    c.flat(6);
    B.pit(c, 12, 4, { rise: 4 });
    c.flat(10);
    B.add('drop', { kind: 'spikeball', x: c.x - 4, y: 11, trigger: c.x - 14, ropeTop: 18 });
    B.add('boost', { x: c.x + 4, w: 6 });
    c.flat(8);
    c.ramp(10, 2.6);
    const lip = c.here();
    B.pit(c, 16, 6, { rise: 3.4 });
    B.add('harpoon', { x: c.x + 20, facing: -1, range: 26, cooldown: 1.8, delay: 0 });
    c.flat(34);
    B.finish(c.x - 14);
    B.deco('spikepole', c.x - 6);
    c.flat(10).wall(8);
  },
};
