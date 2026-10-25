package com.modernapartments.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;

/** Chrome pool ladder hung on the pool wall; climbable (tagged) and usually waterlogged. */
public class PoolLadderBlock extends FurnitureBlock {
	public static final MapCodec<PoolLadderBlock> CODEC = simpleCodec(PoolLadderBlock::new);

	public PoolLadderBlock(Properties properties) {
		super(properties, true);
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}
}
