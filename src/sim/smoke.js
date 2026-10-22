// Smoke and dust clouds that obscure line of sight: vehicle smoke screens,
// smoke grenades, explosion dust and smoke columns from fires. Each cloud is a
// sphere that grows, drifts with the wind and thins out.

export class SmokeSystem {
  constructor(world) {
    this.world = world;
    this.clouds = [];
    this.max = 400;
  }

  add(x, y, z, radius, life, density, kind = 'screen') {
    if (this.clouds.length >= this.max) {
      // Replace the oldest dust cloud (cheapest to lose).
      let idx = 0;
      for (let i = 0; i < this.clouds.length; i++) if (this.clouds[i].kind === 'dust') idx = i;
      this.clouds.splice(idx, 1);
    }
    const c = { x, y, z, r: radius * 0.35, maxR: radius, life, t: 0, density, kind, rise: kind === 'fire' ? 2.2 : kind === 'dust' ? 0.6 : 0.15 };
    this.clouds.push(c);
    return c;
  }

  update(dt) {
    const w = this.world.weather;
    const list = this.clouds;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      c.t += dt;
      if (c.t >= c.life) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      const grow = c.kind === 'screen' ? 1.2 : 0.8;
      c.r += (c.maxR - c.r) * Math.min(1, dt * grow);
      c.x += w.windX * dt * 0.7;
      c.z += w.windZ * dt * 0.7;
      c.y += c.rise * dt;
    }
  }

  // Sum of (chord length * density) along a segment.
  opticalDepth(ax, ay, az, bx, by, bz) {
    let od = 0;
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    if (len2 < 1e-6) return 0;
    const len = Math.sqrt(len2);
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      // Closest approach of the segment to the cloud centre.
      let t = ((c.x - ax) * dx + (c.y - ay) * dy + (c.z - az) * dz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t - c.x;
      const py = ay + dy * t - c.y;
      const pz = az + dz * t - c.z;
      const d2 = px * px + py * py + pz * pz;
      const r2 = c.r * c.r;
      if (d2 >= r2) continue;
      const chord = 2 * Math.sqrt(r2 - d2);
      const fade = c.t > c.life * 0.7 ? 1 - (c.t - c.life * 0.7) / (c.life * 0.3) : 1;
      od += Math.min(chord, len) * c.density * fade;
    }
    return od;
  }

  // Is a point inside meaningful smoke? (for concealment)
  densityAt(x, y, z) {
    let d = 0;
    for (const c of this.clouds) {
      const dx = x - c.x;
      const dy = y - c.y;
      const dz = z - c.z;
      if (dx * dx + dy * dy + dz * dz < c.r * c.r) d += c.density;
    }
    return d;
  }
}
