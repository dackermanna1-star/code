package net.earthscapes.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.tags.TagKey;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.FlowerBlock;
import net.minecraft.world.level.block.state.BlockState;

/** A flower that may also grow on rocky or sandy soils listed in its support tag. */
public class EsFlowerBlock extends FlowerBlock {
	public static final MapCodec<EsFlowerBlock> CODEC = simpleCodec(p -> new EsFlowerBlock(EsTags.GRASS_SOIL, MobEffects.REGENERATION, 5.0F, p));

	private final TagKey<Block> support;

	public EsFlowerBlock(TagKey<Block> support, Holder<MobEffect> effect, float seconds, Properties properties) {
		super(effect, seconds, properties);
		this.support = support;
	}

	@Override
	public MapCodec<? extends FlowerBlock> codec() {
		return CODEC;
	}

	@Override
	protected boolean mayPlaceOn(BlockState state, BlockGetter level, BlockPos pos) {
		return state.is(this.support);
	}
}
