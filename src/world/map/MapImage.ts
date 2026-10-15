// 2048 x 2048 PUBG-style top-down map: generated relief raster (hillshade, land colors, forests, water, contours)
// + roads, bridges and building footprints drawn with Canvas2D. No labels (the UI draws location names).
import { BUILDING_FOOTPRINTS } from '../../core/contracts';
import { MAP_RES, WORLD_SIZE } from '../terrain/TerrainData';
import type { World } from '../World';

export function buildMapCanvas(world: World): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = MAP_RES;
  const g = canvas.getContext('2d')!;
  const img = new ImageData(new Uint8ClampedArray(world.terrain.mapRaster), MAP_RES, MAP_RES);
  g.putImageData(img, 0, 0);
  const s = MAP_RES / WORLD_SIZE; // px per meter
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const L = world.layout;
  const strokeRoads = (kind: 'asphalt' | 'dirt', width: (w: number) => number, color: string, dash: number[] = []) => {
    g.strokeStyle = color;
    g.setLineDash(dash);
    for (const r of L.roadDefs) {
      if (r.kind !== kind) continue;
      g.lineWidth = width(r.width);
      g.beginPath();
      r.points.forEach((p, i) => (i ? g.lineTo(p.x * s, p.z * s) : g.moveTo(p.x * s, p.z * s)));
      g.stroke();
    }
    g.setLineDash([]);
  };
  // dirt tracks: thin brown dashes; asphalt: light line with a darker casing
  strokeRoads('dirt', (w) => Math.max(1.2, w * s * 0.55), 'rgba(122, 98, 66, 0.85)', [5, 3]);
  strokeRoads('asphalt', (w) => Math.max(2.4, w * s * 0.75 + 1.6), 'rgba(70, 66, 58, 0.55)');
  strokeRoads('asphalt', (w) => Math.max(1.6, w * s * 0.75), 'rgba(236, 230, 214, 0.95)');
  // bridges
  for (const br of L.bridges) {
    g.strokeStyle = 'rgba(40, 40, 40, 0.9)';
    g.lineWidth = br.width * s + 3;
    g.beginPath();
    g.moveTo(br.a.x * s, br.a.z * s);
    g.lineTo(br.b.x * s, br.b.z * s);
    g.stroke();
    g.strokeStyle = 'rgba(210, 206, 196, 1)';
    g.lineWidth = br.width * s;
    g.stroke();
  }
  // building footprints
  g.fillStyle = 'rgba(58, 54, 50, 0.92)';
  g.strokeStyle = 'rgba(30, 28, 26, 0.6)';
  g.lineWidth = 0.8;
  for (const lot of L.lots) {
    const f = BUILDING_FOOTPRINTS[lot.type];
    g.save();
    g.translate(lot.x * s, lot.z * s);
    g.rotate(-lot.rotationY); // three.js rotation.y is CCW from above; canvas y points south
    g.fillRect((-f.w / 2) * s, (-f.d / 2) * s, f.w * s, f.d * s);
    g.strokeRect((-f.w / 2) * s, (-f.d / 2) * s, f.w * s, f.d * s);
    g.restore();
  }
  // large props that read on a map (containers, walls)
  for (const p of L.props) {
    if (p.kind === 'container' || p.kind === 'container_small' || p.kind === 'cooling_tower' || p.kind === 'tank_industrial') {
      const len = p.kind === 'container' ? 12.2 : p.kind === 'container_small' ? 6.1 : p.kind === 'cooling_tower' ? 48 : 12;
      const wid = p.kind.startsWith('container') ? 2.44 : len;
      g.save();
      g.translate(p.x * s, p.z * s);
      g.rotate(-p.rotationY);
      g.fillStyle = p.kind.startsWith('container') ? 'rgba(150, 82, 52, 0.9)' : 'rgba(120, 118, 112, 0.95)';
      if (p.kind === 'cooling_tower' || p.kind === 'tank_industrial') {
        g.beginPath();
        g.arc(0, 0, (len / 2) * s, 0, Math.PI * 2);
        g.fill();
      } else g.fillRect((-len / 2) * s, (-wid / 2) * s, len * s, wid * s);
      g.restore();
    } else if (p.length && (p.kind === 'wall_concrete' || p.kind === 'fence_metal')) {
      g.save();
      g.translate(p.x * s, p.z * s);
      g.rotate(-p.rotationY);
      g.fillStyle = p.kind === 'wall_concrete' ? 'rgba(60,60,60,0.9)' : 'rgba(80,80,80,0.6)';
      g.fillRect((-p.length / 2) * s, -0.6, p.length * s, 1.2);
      g.restore();
    }
  }
  return canvas;
}
