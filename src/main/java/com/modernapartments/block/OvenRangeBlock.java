package com.modernapartments.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.world.level.block.SmokerBlock;

/**
 * Kitchen range. It is a real (fast-cooking) smoker: the oven door opens the smoker interface and
 * the cooktop and oven window glow while something cooks. Registered as a supported block of the
 * vanilla smoker block entity type.
 */
public class OvenRangeBlock extends SmokerBlock {
	public static final MapCodec<SmokerBlock> CODEC = simpleCodec(OvenRangeBlock::new);

	public OvenRangeBlock(Properties properties) {
		super(properties);
	}

	@Override
	public MapCodec<SmokerBlock> codec() {
		return CODEC;
	}
}
