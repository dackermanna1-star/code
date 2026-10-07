package com.laptopcraft.item.clothing;

import net.minecraft.core.cauldron.CauldronInteraction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.stats.Stats;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.LayeredCauldronBlock;

/** Lets dyed garments be washed back to their original colour in a water cauldron, like leather armor. */
public final class DyeWashing {
	private DyeWashing() {
	}

	public static void register(Item item) {
		CauldronInteraction.WATER.map().put(item, (state, level, pos, player, hand, stack) -> {
			if (!stack.has(DataComponents.DYED_COLOR)) {
				return InteractionResult.TRY_WITH_EMPTY_HAND;
			}
			if (!level.isClientSide()) {
				stack.remove(DataComponents.DYED_COLOR);
				player.awardStat(Stats.CLEAN_ARMOR);
				LayeredCauldronBlock.lowerFillLevel(state, level, pos);
			}
			return InteractionResult.SUCCESS;
		});
	}
}
