package net.earthscapes.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.tags.TagKey;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SaplingBlock;
import net.minecraft.world.level.block.grower.TreeGrower;
import net.minecraft.world.level.block.state.BlockState;

/** A sapling whose soil is defined by a tag, so desert palms can be planted on sand. */
public class EsSaplingBlock extends SaplingBlock {
	public static final MapCodec<EsSaplingBlock> CODEC = simpleCodec(p -> new EsSaplingBlock(TreeGrower.OAK, EsTags.GRASS_SOIL, p));

	private final TagKey<Block> support;

	public EsSaplingBlock(TreeGrower grower, TagKey<Block> support, Properties properties) {
		super(grower, properties);
		this.support = support;
	}

	@Override
	public MapCodec<? extends SaplingBlock> codec() {
		return CODEC;
	}

	@Override
	protected boolean mayPlaceOn(BlockState state, BlockGetter level, BlockPos pos) {
		return state.is(this.support);
	}
}
