package com.laptopcraft.item.food;

import java.util.function.Supplier;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

/**
 * A whole pizza: eat it in one (long) sitting, or sneak + use to cut it into slices to share.
 */
public class WholePizzaItem extends Item {
	private final Supplier<Item> slice;
	private final int slices;

	public WholePizzaItem(Properties properties, Supplier<Item> slice, int slices) {
		super(properties);
		this.slice = slice;
		this.slices = slices;
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		if (!player.isSecondaryUseActive()) {
			return super.use(level, player, hand);
		}
		ItemStack pizza = player.getItemInHand(hand);
		if (!level.isClientSide()) {
			pizza.consume(1, player);
			player.getInventory().placeItemBackInInventory(new ItemStack(slice.get(), slices));
			level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.SHEEP_SHEAR, SoundSource.PLAYERS, 0.7F, 1.4F);
		}
		return InteractionResult.SUCCESS;
	}
}
