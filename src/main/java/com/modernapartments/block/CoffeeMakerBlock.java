package com.modernapartments.block;

import com.modernapartments.registry.ModItems;
import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/** Brews a cup of coffee (a drink that gives a short burst of speed). */
public class CoffeeMakerBlock extends FurnitureBlock {
	public static final MapCodec<CoffeeMakerBlock> CODEC = simpleCodec(CoffeeMakerBlock::new);

	public CoffeeMakerBlock(Properties properties) {
		super(properties);
		this.registerDefaultState(this.defaultBlockState().setValue(ModProperties.DROP, 0));
	}

	@Override
	protected void createBlockStateDefinition(net.minecraft.world.level.block.state.StateDefinition.Builder<net.minecraft.world.level.block.Block, BlockState> builder) {
		super.createBlockStateDefinition(builder);
		builder.add(ModProperties.DROP);
	}

	@Override
	public BlockState getStateForPlacement(net.minecraft.world.item.context.BlockPlaceContext context) {
		BlockState state = super.getStateForPlacement(context);
		return state == null ? null : state.setValue(ModProperties.DROP, Tabletop.dropOnto(
			context.getLevel().getBlockState(context.getClickedPos().below()), context.getLevel(), context.getClickedPos().below()));
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (!level.isClientSide()) {
			ItemStack coffee = new ItemStack(ModItems.COFFEE_CUP);
			if (!player.getInventory().add(coffee)) {
				player.drop(coffee, false);
			}
			level.playSound(null, pos, SoundEvents.BREWING_STAND_BREW, SoundSource.BLOCKS, 0.6F, 1.3F);
		}
		return InteractionResult.SUCCESS;
	}
}
