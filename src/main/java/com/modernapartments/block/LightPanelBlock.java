package com.modernapartments.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;

/** Ceiling block with a built-in light (recessed downlight / LED panel), controlled by light switches. */
public class LightPanelBlock extends Block implements LightFixture {
	public static final MapCodec<LightPanelBlock> CODEC = simpleCodec(LightPanelBlock::new);

	public LightPanelBlock(Properties properties) {
		super(properties);
		this.registerDefaultState(this.stateDefinition.any().setValue(BlockStateProperties.LIT, true));
	}

	@Override
	protected MapCodec<? extends Block> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(BlockStateProperties.LIT);
	}
}
