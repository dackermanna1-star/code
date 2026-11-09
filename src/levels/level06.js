// Level 6 — lumber mill: half-buried saws to hop, saws on vertical tracks, axe pendulums
// over a bridge, a conveyor that feeds you into a saw pit, and log falls.
export default {
  id: 'L06',
  name: 'The Sawmill',
  blurb: 'Quality lumber since 1952. Quality ragdolls since about five minutes from now.',
  theme: 'forest',
  difficulty: 3,
  seed: 6,
  build(B) {
    const c = B.course(-15, 0);
    c.flat(32); // .. 17
    B.start(-6);
    B.sign(3, 'PINE & SONS SAWMILL\nKEEP LIMBS INSIDE\nTHE VEHICLE');

    // hop the half-buried saws
    B.sign(13, 'HOP THE SAWS', { style: 'warning' });
    for (let i = 0; i < 2; i++) {
      c.ramp(5, 1.0);
      const lip = c.x;
      c.landing(10, 1.0);
      B.add('saw', { x: lip + 3, y: B.groundY(lip + 3) - 0.3, r: 0.95, mount: false });
      c.flat(5);
    }
    // .. ~57
    // saws on vertical tracks
    c.flat(8);
    B.sign(c.x - 4, 'TIMING IS\nEVERYTHING');
    const v0 = c.x + 6;
    B.add('saw', { x: v0, y: 5.5, r: 0.85, path: [[v0, 0.7]], speed: 5, wait: 0.5 });
    B.add('saw', { x: v0 + 8, y: 0.7, r: 0.85, path: [[v0 + 8, 5.5]], speed: 5, wait: 0.5 });
    B.add('saw', { x: v0 + 16, y: 3.0, r: 0.85, path: [[v0 + 16, 5.5], [v0 + 16, 0.7]], speed: 6, wait: 0.3 });
    B.tooth(v0 + 8, 7.2);
    c.flat(30);
    B.add('drop', { kind: 'log', x: c.x - 4, y: 10, trigger: c.x - 12, angle: 0.2, ropeTop: 16 });

    // axe pendulums over a bridge
    c.flat(8);
    const k0 = c.here();
    B.pit(c, 16, 6);
    B.add('bridge', { x: k0.x, y: k0.y, x2: c.x, y2: c.y, planks: 16, strength: 12000 });
    B.add('blade', { x: k0.x + 5, y: k0.y + 6.3, len: 4.3, period: 2.4, amp: 1.0, phase: 0 });
    B.add('blade', { x: k0.x + 11, y: k0.y + 6.3, len: 4.3, period: 2.4, amp: 1.0, phase: Math.PI });
    B.rect(k0.x - 1, k0.y + 6.3, k0.x + 17, k0.y + 7.0, 'wood');
    c.flat(10);
    B.checkpoint(c.x - 5);

    // conveyor into the saw pit
    c.flat(4);
    B.sign(c.x, 'CONVEYOR →\nJUMP AT THE END!', { style: 'warning' });
    B.add('boost', { x: c.x + 11, w: 16, power: 18, max: 15, h: 1.2 });
    c.flat(20);
    c.ramp(6, 1.6);
    const sp = c.here();
    B.pit(c, 10, 2.6, { spikes: false, rise: 1.0 });
    for (let i = 0; i < 3; i++) B.add('saw', { x: sp.x + 2 + i * 3, y: sp.y - 2.6 + 0.3, r: 0.85, mount: false });
    B.tooth(sp.x + 5, sp.y + 2.8);
    c.flat(8);

    // seesaw catapult and falling logs
    B.add('seesaw', { x: c.x + 5, len: 8 });
    c.flat(16);
    B.add('drop', { kind: 'log', x: c.x + 4, y: 11, trigger: c.x - 6, angle: -0.15, ropeTop: 17 });
    B.add('drop', { kind: 'log', x: c.x + 9, y: 12, trigger: c.x - 2, angle: 0.1, ropeTop: 17 });
    c.flat(14);
    B.checkpoint(c.x - 3);

    // shuttling saws along the road
    c.flat(4);
    const h0 = c.x;
    c.flat(26);
    B.add('saw', { x: h0 + 4, y: 0.75, r: 0.75, path: [[h0 + 22, 0.75]], speed: 4, wait: 0.2 });
    c.ramp(4, 0.8).landing(6, 0.8);
    B.add('saw', { x: c.x + 2, y: 3.8, r: 0.9, path: [[c.x + 2, 0.85]], speed: 7, wait: 0.6 });
    c.flat(30);
    B.finish(c.x - 14);
    c.flat(10).wall(7);
  },
};
