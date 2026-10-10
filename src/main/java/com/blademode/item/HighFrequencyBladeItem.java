package com.blademode.item;

import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;

/**
 * The cutting tool. Holding attack while this is in the main hand enters blade mode: the camera
 * freezes, moving the mouse stretches a cut line across the screen, and releasing slashes along it.
 * All of that is handled client-side ({@code BladeInput}) and sent as a slash packet.
 */
public class HighFrequencyBladeItem extends Item {
	public HighFrequencyBladeItem(Properties properties) {
		super(properties);
	}

	@Override
	public boolean canDestroyBlock(ItemStack stack, BlockState state, Level level, BlockPos pos, LivingEntity entity) {
		return false;
	}
}
