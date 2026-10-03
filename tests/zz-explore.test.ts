import { it } from 'vitest';
import { analyzeMeal, nameFood, recognize } from '../src/recipes';
import { engineDishes } from '../src/viewer/engineDishes';

it('explore', () => {
  const rows = engineDishes();
  for (const [label, f] of rows) {
    const a = analyzeMeal(f);
    console.log(`${label.padEnd(22)} | ${nameFood(f).padEnd(26)} | ${a.name.padEnd(28)} | ${(recognize(f)?.id ?? '-').padEnd(18)} | ${a.reaction.padEnd(10)} t=${a.taste.toFixed(2)} w=${a.weirdness.toFixed(2)} raw=${a.flags.raw.toFixed(2)} sp=${a.flags.spicy.toFixed(2)} so=${a.flags.sour.toFixed(2)} sw=${a.flags.sweet.toFixed(2)} hot=${a.flags.hot.toFixed(2)} ${a.eatStyle} b${a.bites} ${a.inspect ? 'I' : ''}${a.blowFirst ? 'B' : ''} ${a.category} "${a.quip}"`);
  }
});
