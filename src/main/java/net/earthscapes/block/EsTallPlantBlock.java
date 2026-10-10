package net.earthscapes.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.tags.TagKey;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.DoublePlantBlock;
import net.minecraft.world.level.block.state.BlockState;

/** A two-block-tall plant (tall grasses, heliconia, giant taro) growing on a support tag. */
public class EsTallPlantBlock extends DoublePlantBlock {
	public static final MapCodec<EsTallPlantBlock> CODEC = simpleCodec(p -> new EsTallPlantBlock(EsTags.GRASS_SOIL, p));

	private final TagKey<Block> support;

	public EsTallPlantBlock(TagKey<Block> support, Properties properties) {
		super(properties);
		this.support = support;
	}

	@Override
	public MapCodec<? extends DoublePlantBlock> codec() {
		return CODEC;
	}

	@Override
	protected boolean mayPlaceOn(BlockState state, BlockGetter level, BlockPos pos) {
		return state.is(this.support);
	}
}
