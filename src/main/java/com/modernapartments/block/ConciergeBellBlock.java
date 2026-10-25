package com.modernapartments.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/** Front-desk service bell: ding! */
public class ConciergeBellBlock extends DecorBlock {
	public static final MapCodec<ConciergeBellBlock> CODEC = simpleCodec(ConciergeBellBlock::new);

	public ConciergeBellBlock(Properties properties) {
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
	protected MapCodec<? extends Block> codec() {
		return CODEC;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		level.playSound(player, pos, SoundEvents.NOTE_BLOCK_BELL.value(), SoundSource.BLOCKS, 0.8F, 1.9F);
		return InteractionResult.SUCCESS;
	}
}
