package com.modernapartments.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;

/** Small item that rests on furniture (books, vases, toaster...), lowered to the surface it is placed on. */
public class TabletopBlock extends FurnitureBlock {
	public static final MapCodec<TabletopBlock> CODEC = simpleCodec(TabletopBlock::new);

	public TabletopBlock(Properties properties) {
		super(properties);
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
