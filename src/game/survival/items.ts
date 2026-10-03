/**
 * Defensive registration of the items the survival systems need. Each item is only registered
 * when missing (the items workstream may register the same names with richer visuals); for
 * foods, a missing `food` spec is filled in from the vanilla table.
 */
import { registerItem, tryItem, type ItemProps } from '../items/registry';
import { FOODS } from './food';

function ensure(name: string, props: ItemProps) {
  const ex = tryItem(name);
  if (!ex) return registerItem(name, props);
  if (props.food && !ex.food) ex.food = props.food;
  if (props.block && !ex.block) ex.block = props.block;
  return ex;
}

let done = false;
export function registerSurvivalItems() {
  if (done) return;
  done = true;
  // seeds & crops (place their crop block)
  ensure('wheat_seeds', { block: 'wheat', category: 'natural', visual: { kind: 'sprite', id: 'wheat_seeds' } });
  ensure('beetroot_seeds', { block: 'beetroots', category: 'natural', visual: { kind: 'sprite', id: 'beetroot_seeds' } });
  ensure('pumpkin_seeds', { block: 'pumpkin_stem', category: 'natural', visual: { kind: 'sprite', id: 'pumpkin_seeds' } });
  ensure('melon_seeds', { block: 'melon_stem', category: 'natural', visual: { kind: 'sprite', id: 'melon_seeds' } });
  ensure('wheat', { category: 'ingredients' });
  for (const [name, block] of [['carrot', 'carrots'], ['potato', 'potatoes']] as const) {
    ensure(name, { block, category: 'food', visual: { kind: 'sprite', id: name } });
  }
  ensure('bone_meal', { category: 'misc' });
  ensure('bowl', { category: 'ingredients' });
  ensure('glass_bottle', { category: 'brewing' });
  // tools
  ensure('flint_and_steel', { durability: 64, category: 'tools', maxStack: 1 });
  ensure('fire_charge', { category: 'misc' });
  ensure('ender_eye', { category: 'misc' });
  // foods
  for (const [name, f] of Object.entries(FOODS)) {
    ensure(name, {
      category: 'food',
      maxStack: f.remainder === 'bowl' ? 1 : f.drink ? 16 : 64,
      rarity: name === 'enchanted_golden_apple' ? 'epic' : name === 'golden_apple' ? 'rare' : 'common',
      food: { hunger: f.nutrition, saturation: f.saturation, alwaysEdible: f.alwaysEdible, eatTicks: f.eatTicks, effects: f.effects, remainder: f.remainder },
    });
  }
}

registerSurvivalItems();
