package com.modernapartments.block;

import com.modernapartments.registry.ModItems;
import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/** Snack machine: pay one emerald (free in creative) for a random snack. */
public class VendingMachineBlock extends TallFurnitureBlock {
	public static final MapCodec<VendingMachineBlock> CODEC = simpleCodec(VendingMachineBlock::new);

	public VendingMachineBlock(Properties properties) {
		super(properties);
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	protected InteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
			InteractionHand hand, BlockHitResult hit) {
		if (!stack.is(Items.EMERALD) && !player.getAbilities().instabuild) {
			if (!level.isClientSide()) {
				player.displayClientMessage(Component.translatable("message.modernapartments.vending_price"), true);
			}
			return InteractionResult.SUCCESS;
		}
		if (!level.isClientSide()) {
			if (!player.getAbilities().instabuild) {
				stack.shrink(1);
			}
			Item[] snacks = {Items.COOKIE, Items.APPLE, Items.BREAD, Items.PUMPKIN_PIE, ModItems.TAKEOUT_BOX, ModItems.COFFEE_CUP};
			ItemStack snack = new ItemStack(snacks[level.random.nextInt(snacks.length)]);
			if (!player.getInventory().add(snack)) {
				player.drop(snack, false);
			}
			level.playSound(null, pos, SoundEvents.DISPENSER_DISPENSE, SoundSource.BLOCKS, 0.6F, 1.2F);
		}
		return InteractionResult.SUCCESS;
	}
}
