// Building blocks shared by the places, written the way 2008 builders did it:
// SpawnLocations, "lava" kill bricks, ladders of stacked rungs (there were no
// trusses until 2009), tool givers, and the stock leaderboard.
import * as THREE from 'three';
import { canvasTexture } from '../engine/textures.js';

/** rbxasset://Textures/SpawnLocation.png: a black spiky ring on the plate's top. */
function spawnDecal() {
  return canvasTexture('SpawnLocation', 64, 64, (x, w) => {
    x.clearRect(0, 0, w, w);
    const c = w / 2;
    x.fillStyle = '#111';
    x.beginPath();
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2, r = i % 2 ? 23 : 30;
      x.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    x.closePath(); x.fill();
    x.globalCompositeOperation = 'destination-out';
    x.beginPath(); x.arc(c, c, 15, 0, Math.PI * 2); x.fill();
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#fff';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      x.beginPath();
      x.moveTo(c + Math.cos(a) * 17, c + Math.sin(a) * 17);
      x.lineTo(c + Math.cos(a + 0.12) * 22, c + Math.sin(a + 0.12) * 22);
      x.lineTo(c + Math.cos(a - 0.12) * 22, c + Math.sin(a - 0.12) * 22);
      x.fill();
    }
  }, { srgb: true });
}

/**
 * A 6 x 1.2 x 6 SpawnLocation (smooth top with the spawn decal). `top` is the
 * height of the plate's upper face; yaw is the direction players face.
 */
export function spawnLocation(world, x, top, z, opts = {}) {
  const p = world.add({ name: 'SpawnLocation', size: [6, 1.2, 6], position: [x, top - 0.6, z], color: opts.color ?? 194, top: 'Smooth', bottom: 'Inlets' });
  p.addDecal('Top', spawnDecal());
  p.userData.yaw = opts.yaw ?? 0;
  if (opts.game) opts.game.addSpawn(p, { team: opts.team, neutral: opts.neutral });
  return p;
}

/** The "Lava" script: touching it takes 1000 health (ForceFields don't help). */
export function makeLava(part) {
  part.onTouched((other) => {
    if (other.alive !== undefined && other.alive) {
      other.health -= 1000;
      if (other.health <= 0) other.breakJoints();
    }
  });
  return part;
}

/**
 * A ladder of thin rungs up the face of a wall. `dir` is the direction the
 * ladder faces (away from the wall), as [dx, dz]. Rungs and the board behind
 * them are tagged climbable.
 */
export function ladder(world, x, y0, z, height, dir = [0, -1], opts = {}) {
  const color = opts.color ?? 192;
  const [dx, dz] = dir;
  const across = dx !== 0 ? 'z' : 'x';
  const width = opts.width ?? 3;
  const parts = [];
  const board = world.add({
    size: across === 'x' ? [width, height, 0.4] : [0.4, height, width],
    position: [x - dx * 0.2, y0 + height / 2, z - dz * 0.2], color, tags: ['climbable'], top: 'Smooth', bottom: 'Smooth',
  });
  parts.push(board);
  for (let y = y0 + 0.8; y < y0 + height; y += 1.6) {
    parts.push(world.add({
      size: across === 'x' ? [width, 0.4, 0.6] : [0.6, 0.4, width],
      position: [x + dx * 0.3, y, z + dz * 0.3], color, tags: ['climbable'], top: 'Smooth', bottom: 'Smooth',
    }));
  }
  return parts;
}

/** A brick that hands out a tool once per life (the period "tool giver"). */
export function toolGiver(game, part, makeTool, message) {
  const given = new WeakSet();
  part.onTouched((ch) => {
    const p = ch.player;
    if (!p || !ch.alive || given.has(ch)) return;
    given.add(ch);
    const tool = makeTool(game, p);
    if (p.backpack.some((t) => t.name === tool.name)) return;
    game.giveTool(p, tool);
    if (message && p.isLocal) game.showMessage(message, 3);
  });
}

/** A part painted with a sign (a Decal with text, as 2008 builders made them). */
export function sign(world, x, y, z, w, h, text, opts = {}) {
  const S = 256;
  const tex = canvasTexture('sign:' + text + (opts.bg || '') + (opts.fg || ''), S, Math.round(S * h / w), (c, cw, chh) => {
    c.fillStyle = opts.bg || '#ffffff'; c.fillRect(0, 0, cw, chh);
    c.fillStyle = opts.fg || '#000000';
    const lines = String(text).split('\n');
    const size = Math.min(chh / (lines.length + 0.6), cw / Math.max(...lines.map((l) => l.length)) * 1.7);
    c.font = `bold ${Math.round(size)}px Arial, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    lines.forEach((l, i) => c.fillText(l, cw / 2, chh / 2 + (i - (lines.length - 1) / 2) * size * 1.1, cw * 0.94));
  }, { srgb: true });
  const face = opts.face || 'Front';
  const part = world.add({ size: opts.size || [w, h, 0.4], position: [x, y, z], color: opts.color ?? 1, rotation: opts.rotation, top: 'Smooth', bottom: 'Smooth' });
  part.addDecal(face, tex);
  return part;
}

/** Spread players' bots out a bit and keep them inside a box. */
export function randomPointIn(box, y) {
  return new THREE.Vector3(box[0] + Math.random() * (box[2] - box[0]), y, box[1] + Math.random() * (box[3] - box[1]));
}
