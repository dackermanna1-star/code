import { CHUNK_SIZE } from '../../shared/constants';
import { blockDef } from '../../shared/world/blocks';
import { chunkKeyX, chunkKeyZ, type VoxelWorld } from '../../shared/world/chunk';
import { LIQUID } from '../../shared/world/blocks';

export interface MapMarker {
  x: number;
  z: number;
  label: string;
  kind: 'poi-low' | 'poi-mid' | 'poi-high' | 'bag' | 'death';
}

/**
 * World map overlay: top-down render of explored chunks (block colour,
 * height shading, water), POI markers, sleeping bags, death location and
 * the player arrow. Explored terrain is cached per chunk so the map grows
 * as you travel even after chunks unload.
 */
export class MapUI {
  open = false;
  zoom = 2;
  private canvas: HTMLCanvasElement;
  private explored = new Map<number, ImageData>();
  private markers: MapMarker[] = [];

  constructor() {
    this.canvas = document.getElementById('map-canvas') as HTMLCanvasElement;
    this.canvas.addEventListener('wheel', (e) => {
      this.zoom = Math.max(0.5, Math.min(6, this.zoom * (e.deltaY > 0 ? 0.8 : 1.25)));
      e.preventDefault();
    }, { passive: false });
  }

  setMarkers(m: MapMarker[]) {
    this.markers = m;
  }

  /** Cache a top-down image of a chunk (call when a chunk arrives or changes). */
  capture(world: VoxelWorld, key: number) {
    const c = world.chunks.get(key);
    if (!c) return;
    const img = new ImageData(CHUNK_SIZE, CHUNK_SIZE);
    for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
      let y = 127, id = 0;
      for (; y >= 0; y--) {
        id = c.blocks[x | (z << 4) | (y << 8)];
        if (id !== 0 && blockDef(id).shape !== 'cross') break;
      }
      const col = blockDef(id).mapColor;
      let r = (col >> 16) & 255, g = (col >> 8) & 255, b = col & 255;
      let shade = 0.75 + Math.max(-0.4, Math.min(0.5, (y - 48) / 90));
      if (LIQUID[id]) {
        let depth = 0;
        while (depth < 12 && LIQUID[c.blocks[x | (z << 4) | ((y - depth) << 8)]]) depth++;
        shade = 1.1 - depth * 0.04;
      } else if (x > 0) {
        // relief: compare with the column to the west
        let wy = 127;
        for (; wy >= 0; wy--) if (c.blocks[(x - 1) | (z << 4) | (wy << 8)]) break;
        shade *= y > wy ? 1.1 : y < wy ? 0.85 : 1;
      }
      r = Math.min(255, r * shade); g = Math.min(255, g * shade); b = Math.min(255, b * shade);
      const i = (z * CHUNK_SIZE + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    this.explored.set(key, img);
  }

  render(px: number, pz: number, yaw: number) {
    const cv = this.canvas;
    const g = cv.getContext('2d')!;
    const W = cv.width, H = cv.height;
    g.fillStyle = '#14120f';
    g.fillRect(0, 0, W, H);
    const scale = this.zoom;
    const toScreen = (x: number, z: number): [number, number] => [W / 2 + (x - px) * scale, H / 2 + (z - pz) * scale];
    g.imageSmoothingEnabled = false;
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = CHUNK_SIZE;
    const tg = tmp.getContext('2d')!;
    for (const [key, img] of this.explored) {
      const cx = chunkKeyX(key), cz = chunkKeyZ(key);
      const [sx, sy] = toScreen(cx * CHUNK_SIZE, cz * CHUNK_SIZE);
      const size = CHUNK_SIZE * scale;
      if (sx > W || sy > H || sx + size < 0 || sy + size < 0) continue;
      tg.putImageData(img, 0, 0);
      g.drawImage(tmp, sx, sy, size + 0.5, size + 0.5);
    }
    // grid
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    const step = 128;
    for (let gx = Math.floor((px - W / scale) / step) * step; gx < px + W / scale; gx += step) {
      const [sx] = toScreen(gx, 0);
      g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx, H); g.stroke();
    }
    for (let gz = Math.floor((pz - H / scale) / step) * step; gz < pz + H / scale; gz += step) {
      const [, sy] = toScreen(0, gz);
      g.beginPath(); g.moveTo(0, sy); g.lineTo(W, sy); g.stroke();
    }
    g.font = 'bold 12px monospace';
    g.textAlign = 'center';
    for (const m of this.markers) {
      const [sx, sy] = toScreen(m.x, m.z);
      if (sx < -50 || sy < -50 || sx > W + 50 || sy > H + 50) continue;
      const color = m.kind === 'poi-high' ? '#e05040' : m.kind === 'poi-mid' ? '#e0a040' : m.kind === 'poi-low' ? '#9fd060' : m.kind === 'bag' ? '#70b0ff' : '#ff3030';
      g.fillStyle = color;
      if (m.kind === 'death') {
        g.fillText('✖', sx, sy + 4);
      } else {
        g.fillRect(sx - 4, sy - 4, 8, 8);
        g.strokeStyle = '#000';
        g.strokeRect(sx - 4, sy - 4, 8, 8);
      }
      g.fillStyle = '#fff';
      g.strokeStyle = 'rgba(0,0,0,0.8)';
      g.lineWidth = 3;
      g.strokeText(m.label, sx, sy - 9);
      g.fillText(m.label, sx, sy - 9);
      g.lineWidth = 1;
    }
    // player arrow
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate(-yaw);
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.beginPath();
    g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    g.fillStyle = '#ddd';
    g.textAlign = 'left';
    g.fillText(`X ${Math.round(px)}  Z ${Math.round(pz)}  ·  zoom ${this.zoom.toFixed(1)}x`, 10, H - 10);
  }
}
