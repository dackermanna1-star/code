/**
 * Eating & drinking: every item with a `food` spec (or listed in FOODS) gets a hold-to-eat
 * behaviour (32 ticks by default), restoring hunger/saturation and applying food effects.
 * Also cake slices and milk buckets. Events: `foodEaten {player, stack, food}`,
 * `eatingTick {player, stack}` (for particles).
 */
import { ITEMS, addItemBehavior, itemBehavior, tryItem, stack as mkStack, type ItemDef, type ItemStack, type ItemUseContext } from '../items/registry';
import { addBehavior } from '../../world/blocks/behaviors';
import { SetFlags } from '../../world/world';
import { FOODS, type FoodInfo } from './food';
import { gameFor, play } from './context';

export function foodInfo(it: ItemDef): FoodInfo | null {
  const f = FOODS[it.name];
  if (f) return f;
  if (!it.food) return null;
  return { nutrition: it.food.hunger, saturation: it.food.saturation, alwaysEdible: it.food.alwaysEdible, eatTicks: it.food.eatTicks, effects: it.food.effects, remainder: it.food.remainder };
}

function canEat(player: any, f: FoodInfo) {
  return player.creative || f.alwaysEdible || player.food < 20;
}

/** Apply a finished meal to the player. */
export function finishEating(game: any, player: any, stack: ItemStack, hand: 'main' | 'off', f: FoodInfo) {
  player.eat(f.nutrition, f.saturation);
  for (const e of f.effects ?? []) if (Math.random() < e.chance) player.addEffect(e.effect, e.duration, e.amplifier);
  const name = stack.item.name;
  if (name === 'honey_bottle') player.removeEffect('poison');
  if (name === 'suspicious_stew' && stack.data?.effect) player.addEffect(stack.data.effect, stack.data.duration ?? 160, 0);
  if (name === 'chorus_fruit') chorusTeleport(game, player);
  const p = player.pos;
  play(game, f.drink ? 'random.drink' : 'random.burp', p.x, p.y, p.z, 0.5, 0.9 + Math.random() * 0.1);
  game.events.emit('foodEaten', { player, stack, food: f });
  if (!player.creative) {
    const slot = hand === 'main' ? player.inventory.selected : 40;
    player.inventory.consumeHeld(1, slot);
    const rem = f.remainder ? tryItem(f.remainder) : undefined;
    if (rem) {
      if (!player.inventory.get(slot)) player.inventory.set(slot, mkStack(rem, 1));
      else if (player.inventory.add(mkStack(rem, 1)) > 0) game.dropItem(mkStack(rem, 1), player.pos.clone().setY(p.y + 1));
    }
  }
}

function chorusTeleport(game: any, player: any) {
  const w = game.world;
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(player.pos.x + (Math.random() - 0.5) * 16);
    const z = Math.floor(player.pos.z + (Math.random() - 0.5) * 16);
    let y = Math.min(250, Math.floor(player.pos.y + Math.floor(Math.random() * 16) - 8));
    while (y > 1 && !w.isSolid(w.getBlock(x, y - 1, z))) y--;
    if (y <= 1 || w.getBlock(x, y, z) || w.getBlock(x, y + 1, z)) continue;
    player.setPos(x + 0.5, y, z + 0.5);
    player.fallDistance = 0;
    play(game, 'mob.enderman.portal', x, y, z, 1);
    return;
  }
}

function eatTicks(f: FoodInfo) {
  return f.eatTicks ?? 32;
}

let installed = false;
export function installEating() {
  if (installed) return;
  installed = true;
  const edible = (d: ItemDef) => !!foodInfo(d) && !itemBehavior(d)?.use;
  const behavior = {
    holdUse: true,
    usePose: 'eat',
    use(ctx: ItemUseContext) {
      const f = foodInfo(ctx.stack.item);
      return !!f && canEat(ctx.player, f);
    },
    useTick(ctx: ItemUseContext, ticks: number) {
      const f = foodInfo(ctx.stack.item);
      if (!f) return;
      const total = eatTicks(f);
      const p = ctx.player.pos;
      if (ticks > 7 && ticks % 4 === 0 && ticks < total) {
        play(ctx.game, f.drink ? 'random.drink' : 'random.eat', p.x, p.y + 1.5, p.z, 0.5 + 0.5 * Math.random(), 0.8 + Math.random() * 0.4);
        ctx.game.events.emit('eatingTick', { player: ctx.player, stack: ctx.stack });
      }
      if (ticks >= total) {
        finishEating(ctx.game, ctx.player, ctx.stack, ctx.hand, f);
        ctx.player.usingItem = null;
      }
    },
  };
  addItemBehavior(edible, behavior);
  // milk bucket: drink to clear all effects
  if (tryItem('milk_bucket') && !itemBehavior(tryItem('milk_bucket')!)?.use) {
    addItemBehavior('milk_bucket', {
      holdUse: true,
      usePose: 'drink',
      use: () => true,
      useTick(ctx, ticks) {
        if (ticks < 32) return;
        for (const id of [...ctx.player.effects.keys()]) ctx.player.removeEffect(id);
        play(ctx.game, 'random.drink', ctx.player.pos.x, ctx.player.pos.y, ctx.player.pos.z, 0.5);
        if (!ctx.player.creative) {
          const slot = ctx.hand === 'main' ? ctx.player.inventory.selected : 40;
          const b = tryItem('bucket');
          ctx.player.inventory.set(slot, b ? mkStack(b, 1) : null);
        }
        ctx.player.usingItem = null;
      },
    });
  }
  // cake: eat a slice (2 hunger, 0.1 saturation modifier), 7 bites
  addBehavior('cake', {
    onUse(world, x, y, z, state, player) {
      if (!player.creative && player.food >= 20) return false;
      const g = gameFor(world);
      player.eat(2, 0.1);
      const bites = (state & 7) + 1;
      world.setBlock(x, y, z, bites >= 7 ? 0 : (state & ~7) | bites, SetFlags.ALL);
      play(g, 'random.burp', x + 0.5, y + 0.5, z + 0.5, 0.5);
      return true;
    },
  });
  void ITEMS;
}
