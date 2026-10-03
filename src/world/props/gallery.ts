// A row of the main props for close review (/viewer.html?props=1).
// Debug-only query params (ignored by the game): &only=stove,pan  &open=1  &glow=1
import * as THREE from 'three';
import { LAYOUT } from '../layout';
import { buildStove } from './stove';
import { buildPan, buildGrillPan, buildPot, buildKettle } from './cookware';

type Entry = { name: string; make: () => THREE.Object3D; gap?: number };

function params(): URLSearchParams {
  return typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
}

export function buildGallery(): THREE.Object3D {
  const q = params();
  const only = q.get('only')?.split(',').map((s) => s.trim()).filter(Boolean);
  const open = parseFloat(q.get('open') ?? '0') || 0;
  const glow = parseFloat(q.get('glow') ?? '0') || 0;
  const stovePos = LAYOUT.stove.pos;
  const burnersLocal = LAYOUT.burners.map((b) => b.clone().sub(stovePos));

  const entries: Entry[] = [
    {
      name: 'stove',
      make: () => {
        const s = buildStove({ burners: burnersLocal });
        s.oven.door.rotation.x = s.oven.openAngle * open;
        for (const b of s.burners) {
          b.flame.scale.setScalar(glow);
          (b.glow.material as THREE.MeshBasicMaterial).opacity = glow;
        }
        (s.oven.glow.material as THREE.MeshBasicMaterial).opacity = glow * 0.6;
        (s.oven.lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = glow * 3;
        const pan = buildPan();
        pan.root.position.copy(burnersLocal[0]);
        const grill = buildGrillPan();
        grill.root.position.copy(burnersLocal[1]);
        const pot = buildPot();
        pot.root.position.copy(burnersLocal[2]);
        const kettle = buildKettle();
        kettle.position.copy(burnersLocal[3]);
        s.root.add(pan.root, grill.root, pot.root, kettle);
        return s.root;
      },
    },
    { name: 'pan', make: () => buildPan().root },
    { name: 'grill', make: () => buildGrillPan().root },
    { name: 'pot', make: () => buildPot().root },
    { name: 'kettle', make: () => buildKettle() },
  ];

  const root = new THREE.Group();
  root.name = 'gallery';
  let x = 0;
  for (const e of entries) {
    if (only && !only.includes(e.name)) continue;
    const o = e.make();
    const holder = new THREE.Group();
    holder.add(o);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const w = box.max.x - box.min.x;
    o.position.x -= box.min.x;
    o.position.y -= box.min.y;
    o.position.z -= (box.min.z + box.max.z) / 2;
    holder.position.x = x;
    x += w + (e.gap ?? 0.12);
    root.add(holder);
  }
  // centre the row
  for (const c of root.children) c.position.x -= x / 2;
  return root;
}
