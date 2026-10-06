package com.laptopcraft.item.toy;

import com.laptopcraft.block.decor.RubberDuckBlock;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;

/** Places the rubber duck block; squeezing it in the air (right-click without a target block) squeaks. */
public class RubberDuckItem extends BlockItem {
	public RubberDuckItem(Block block, Item.Properties properties) {
		super(block, properties);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		if (!level.isClientSide()) {
			RubberDuckBlock.squeak(level, player.getX(), player.getEyeY() - 0.4, player.getZ());
		}
		player.getCooldowns().addCooldown(player.getItemInHand(hand), 6);
		return InteractionResult.SUCCESS;
	}
}
