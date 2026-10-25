package com.modernapartments.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.world.level.block.IronBarsBlock;

/** Pane-style balcony railings and glass partitions (connect like glass panes). */
public class RailingBlock extends IronBarsBlock {
	public static final MapCodec<RailingBlock> CODEC = simpleCodec(RailingBlock::new);

	public RailingBlock(Properties properties) {
		super(properties);
	}

	@Override
	public MapCodec<? extends IronBarsBlock> codec() {
		return CODEC;
	}
}
