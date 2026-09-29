import * as THREE from 'three';
import { FoodKit, FoodPiece } from '../food/FoodKit';
import { BunId, IngredientId } from '../food/Ingredients';

/** Debug scene: lays out ingredients and a few finished burgers on the build counter. */
export function buildFoodGallery(kit: FoodKit, root: THREE.Object3D, origin: THREE.Vector3) {
  const g = new THREE.Group();
  g.position.copy(origin);
  root.add(g);

  const stack = (bun: BunId, layers: IngredientId[], x: number, z: number) => {
    let y = 0;
    const bottom = kit.bunPart(bun, 'bottom');
    bottom.obj.position.set(x, y, z);
    g.add(bottom.obj);
    y += bottom.thickness;
    let lastPatty: FoodPiece | null = null;
    for (const id of layers) {
      const p = kit.make(id);
      p.obj.position.set(x + (Math.random() - 0.5) * 0.004, y, z + (Math.random() - 0.5) * 0.004);
      if (p.setCook) {
        p.setCook(0.62, 0.6);
        p.obj.position.y += 0.0105;
        lastPatty = p;
      }
      if (p.setMelt) p.setMelt(1, lastPatty ? 0.055 : 0.07);
      g.add(p.obj);
      y += p.thickness;
    }
    const top = kit.bunPart(bun, 'top');
    top.obj.position.set(x, y, z);
    top.obj.rotation.y = Math.random() * 6;
    g.add(top.obj);
  };

  stack('bun_sesame', ['ketchup', 'lettuce', 'patty_beef', 'cheese_american', 'tomato', 'onion', 'pickles', 'mustard'], -0.36, 0);
  stack('bun_brioche', ['mayo', 'lettuce', 'patty_beef', 'cheese_cheddar', 'bacon', 'patty_beef', 'cheese_american', 'bbq'], -0.18, -0.02);
  stack('bun_pretzel', ['special', 'patty_chicken', 'cheese_swiss', 'avocado', 'jalapenos', 'sriracha'], 0.0, 0.0);
  stack('bun_charcoal', ['lettuce', 'patty_veggie', 'cheese_pepperjack', 'mushrooms', 'egg', 'onion_rings'], 0.18, 0.0);

  // cooking progression row
  const levels = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.25];
  levels.forEach((c, i) => {
    const p = kit.patty('patty_beef');
    p.setCook!(c, c);
    p.obj.position.set(-0.36 + i * 0.12, 0.012, 0.16);
    g.add(p.obj);
  });
  // ingredients row
  const ids: IngredientId[] = ['lettuce', 'tomato', 'onion', 'pickles', 'bacon', 'jalapenos', 'mushrooms', 'avocado', 'egg', 'onion_rings', 'cheese_swiss'];
  ids.forEach((id, i) => {
    const p = kit.make(id);
    p.obj.position.set(-0.4 + (i % 6) * 0.14, 0.001, -0.16 - Math.floor(i / 6) * 0.13);
    if (p.setMelt) p.setMelt(0, 0.07);
    g.add(p.obj);
  });
  return g;
}
