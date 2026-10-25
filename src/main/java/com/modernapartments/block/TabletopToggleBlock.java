package com.modernapartments.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;

/** Switchable tabletop item (laptop, monitor, microwave). */
public class TabletopToggleBlock extends ToggleFurnitureBlock {
	public static final MapCodec<TabletopToggleBlock> CODEC = simpleCodec(p -> new TabletopToggleBlock(p, ToggleSettings.screen(0)));

	public TabletopToggleBlock(Properties properties, ToggleSettings settings) {
		super(properties, settings);
		this.registerDefaultState(this.defaultBlockState().setValue(ModProperties.DROP, 0));
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		super.createBlockStateDefinition(builder);
		builder.add(ModProperties.DROP);
	}

	@Override
	public BlockState getStateForPlacement(BlockPlaceContext context) {
		BlockState state = super.getStateForPlacement(context);
		return state == null ? null : state.setValue(ModProperties.DROP, Tabletop.dropOnto(
			context.getLevel().getBlockState(context.getClickedPos().below()), context.getLevel(), context.getClickedPos().below()));
	}
}
