package net.earthscapes.worldgen.feature;

import com.mojang.serialization.Codec;
import net.minecraft.core.BlockPos;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.BannerBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.NoneFeatureConfiguration;

/**
 * An ovoo: the sacred stone cairn crowning Mongolian hilltops and passes, piled from field stones
 * around a pole hung with blue khadag silk.
 */
public class OvooFeature extends Feature<NoneFeatureConfiguration> {
	public OvooFeature(Codec<NoneFeatureConfiguration> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<NoneFeatureConfiguration> context) {
		WorldGenLevel level = context.level();
		BlockPos origin = context.origin();
		RandomSource random = context.random();
		if (!TreeBuilder.isSoil(level.getBlockState(origin.below())) && !level.getBlockState(origin.below()).is(Blocks.STONE)) {
			return false;
		}
		TreeBuilder cairn = new TreeBuilder();
		double radius = 2.0 + random.nextDouble() * 0.8;
		int height = 3 + random.nextInt(2);
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		int r = Mth.ceil(radius);
		for (int y = -1; y < height; y++) {
			double rad = radius * (1.0 - Math.max(0, y) / (double) (height + 0.6));
			for (int dx = -r; dx <= r; dx++) {
				for (int dz = -r; dz <= r; dz++) {
					if (dx * dx + dz * dz <= rad * rad + random.nextDouble() * 0.8) {
						pos.set(origin.getX() + dx, origin.getY() + y, origin.getZ() + dz);
						cairn.root(pos, this.stone(random));
					}
				}
			}
		}
		BlockPos pole = origin.above(height);
		for (int i = 0; i < 3; i++) {
			cairn.log(pole.above(i), Blocks.SPRUCE_FENCE.defaultBlockState());
		}
		cairn.decoration(pole.above(3), Blocks.LIGHT_BLUE_BANNER.defaultBlockState().setValue(BannerBlock.ROTATION, random.nextInt(16)));
		cairn.place(level);
		// silk offerings and stones scattered on the pile
		for (int i = 0; i < 5; i++) {
			int x = origin.getX() + random.nextInt(5) - 2;
			int z = origin.getZ() + random.nextInt(5) - 2;
			BlockPos top = new BlockPos(x, EsFeatureUtil.surface(level, x, z), z);
			if (level.getBlockState(top).isAir() && level.getBlockState(top.below()).isSolidRender()) {
				BlockState carpet = random.nextInt(3) == 0 ? Blocks.WHITE_CARPET.defaultBlockState() : Blocks.LIGHT_BLUE_CARPET.defaultBlockState();
				level.setBlock(top, carpet, Block.UPDATE_CLIENTS);
			}
		}
		return true;
	}

	private BlockState stone(RandomSource random) {
		int roll = random.nextInt(10);
		if (roll < 5) {
			return Blocks.COBBLESTONE.defaultBlockState();
		}
		if (roll < 7) {
			return Blocks.MOSSY_COBBLESTONE.defaultBlockState();
		}
		return roll < 9 ? Blocks.STONE.defaultBlockState() : Blocks.ANDESITE.defaultBlockState();
	}
}
