// A row of the main props for close review (/viewer.html?props=1).
// Default row: stove (+ cookware), cookware, and the seasoning bottles.
// Debug-only query params (ignored by the game):
//   &only=bottles (&set=salt,pepper) | &only=stove,pan | &only=all (every prop)   &open=1   &glow=1
import * as THREE from 'three';
import { LAYOUT } from '../layout';
import { SEASONINGS } from '../../food/catalog';
import { buildStove } from './stove';
import { buildPan, buildGrillPan, buildPot, buildKettle } from './cookware';
import { buildBottle } from './bottles';
import { buildBlender, buildToaster, buildFryer, buildMicrowave } from './appliances';
import { buildFridge } from './fridge';
import { buildCuttingBoard, buildToolCaddy, buildKnife, buildPeeler, buildRollingPin, buildMasher, buildMixingBowl, buildWhisk } from './prep';
import { buildPlate, buildBell, buildTable, buildChair } from './dining';
import { buildTrash } from './trash';

type Entry = { name: string; make: () => THREE.Object3D; gap?: number; extra?: boolean };

function params(): URLSearchParams {
  return typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
}

/** All seasoning bottles in two rows (front row = first half of SEASONINGS). &set=salt,pepper picks some. */
function bottleRows(): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'bottles';
  const set = params().get('set')?.split(',').map((s) => s.trim());
  const defs = set ? SEASONINGS.filter((d) => set.includes(d.id)) : SEASONINGS;
  const perRow = set ? defs.length : Math.ceil(defs.length / 2);
  defs.forEach((def, i) => {
    const b = buildBottle(def);
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    b.root.position.set(col * 0.1 + row * 0.05, 0, -row * 0.24);
    g.add(b.root);
  });
  return g;
}

export function buildGallery(): THREE.Object3D {
  const q = params();
  const onlyRaw = q.get('only')?.split(',').map((s) => s.trim()).filter(Boolean);
  const all = onlyRaw?.includes('all');
  const only = all ? undefined : onlyRaw;
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
    { name: 'bottles', make: bottleRows, gap: 0.2 },
    // the rest only with &only=<name> or &only=all
    {
      name: 'blender',
      extra: true,
      make: () => {
        const b = buildBlender();
        b.liquid.visible = glow > 0;
        if (glow > 0) b.liquid.scale.y = 0.12;
        return b.root;
      },
    },
    { name: 'toaster', extra: true, make: () => buildToaster().root },
    { name: 'fryer', extra: true, make: () => buildFryer().root },
    {
      name: 'microwave',
      extra: true,
      make: () => {
        const m = buildMicrowave();
        m.door.rotation.y = -m.openAngle * open;
        return m.root;
      },
    },
    {
      name: 'fridge',
      extra: true,
      make: () => {
        const f = buildFridge();
        f.door.rotation.y = f.openAngle * open;
        f.drawer.position.z = f.drawerTravel * open;
        return f.root;
      },
    },
    {
      name: 'board',
      extra: true,
      make: () => {
        const g = new THREE.Group();
        const b = buildCuttingBoard(LAYOUT.board.size);
        g.add(b.root);
        const tools = [buildKnife(), buildPeeler(), buildRollingPin(), buildMasher(), buildWhisk()];
        tools.forEach((t, i) => {
          t.root.position.set(-0.2, 0, 0.25 + i * 0.1);
          g.add(t.root);
        });
        return g;
      },
    },
    {
      name: 'caddy',
      extra: true,
      make: () => {
        const c = buildToolCaddy();
        const tools = { knife: buildKnife(), peeler: buildPeeler(), rollingPin: buildRollingPin(), masher: buildMasher() };
        for (const k of Object.keys(tools) as (keyof typeof tools)[]) {
          tools[k].root.position.copy(c.slots[k].pos);
          tools[k].root.rotation.copy(c.slots[k].rot);
          c.root.add(tools[k].root);
        }
        return c.root;
      },
    },
    { name: 'bowl', extra: true, make: () => buildMixingBowl().root },
    {
      name: 'dining',
      extra: true,
      make: () => {
        const g = new THREE.Group();
        g.add(buildTable());
        const chair = buildChair();
        chair.position.set(-0.08, 0, -0.58);
        g.add(chair);
        const p = buildPlate();
        p.root.position.set(0.06, 0.74, 0.08);
        const b = buildBell();
        b.root.position.set(0.36, 0.74, 0.22);
        g.add(p.root, b.root);
        return g;
      },
    },
    { name: 'trash', extra: true, make: () => buildTrash().root },
  ];

  const root = new THREE.Group();
  root.name = 'gallery';
  let x = 0;
  for (const e of entries) {
    if (only ? !only.includes(e.name) : e.extra && !all) continue;
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
  // centre the row (force a world-matrix refresh: merged static meshes don't auto-update)
  for (const c of root.children) c.position.x -= x / 2;
  root.updateMatrixWorld(true);
  return root;
}
