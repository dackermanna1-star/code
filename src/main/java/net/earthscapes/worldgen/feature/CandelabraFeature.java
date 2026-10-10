package net.earthscapes.worldgen.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.util.valueproviders.IntProvider;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.FeatureConfiguration;
import net.minecraft.world.level.levelgen.feature.stateproviders.BlockStateProvider;

/**
 * Candelabra tree (Euphorbia ingens): a short trunk from which succulent arms bend outwards and
 * then sweep straight up, a common sight on East African kopjes and escarpments.
 */
public class CandelabraFeature extends Feature<CandelabraFeature.Config> {
	public record Config(BlockStateProvider stem, IntProvider trunkHeight, IntProvider arms, IntProvider armHeight) implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			BlockStateProvider.CODEC.fieldOf("stem").forGetter(Config::stem),
			IntProvider.codec(1, 12).fieldOf("trunk_height").forGetter(Config::trunkHeight),
			IntProvider.codec(1, 16).fieldOf("arms").forGetter(Config::arms),
			IntProvider.codec(1, 12).fieldOf("arm_height").forGetter(Config::armHeight)
		).apply(instance, Config::new));
	}

	public CandelabraFeature(Codec<Config> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<Config> context) {
		WorldGenLevel level = context.level();
		BlockPos origin = context.origin();
		RandomSource random = context.random();
		Config config = context.config();
		if (!EsFeatureUtil.canRoot(level, origin) && !TreeBuilder.isSoil(level.getBlockState(origin.below()))
			&& !level.getBlockState(origin.below()).isFaceSturdy(level, origin.below(), Direction.UP)) {
			return false;
		}
		TreeBuilder tree = new TreeBuilder();
		BlockState stem = config.stem().getState(random, origin);
		int trunk = config.trunkHeight().sample(random);
		for (int y = 0; y < trunk + 2; y++) {
			tree.log(origin.above(y), Geo.axis(stem, Direction.Axis.Y));
		}
		int arms = config.arms().sample(random);
		for (int i = 0; i < arms; i++) {
			Direction dir = Direction.Plane.HORIZONTAL.getRandomDirection(random);
			int startY = trunk - 1 + random.nextInt(3);
			BlockPos p = origin.above(startY);
			int out = 1 + random.nextInt(2);
			for (int s = 1; s <= out; s++) {
				p = p.relative(dir);
				tree.log(p, Geo.axis(stem, dir.getAxis()));
			}
			if (random.nextFloat() < 0.4F) {
				Direction side = random.nextBoolean() ? dir.getClockWise() : dir.getCounterClockWise();
				p = p.relative(side);
				tree.log(p, Geo.axis(stem, side.getAxis()));
			}
			int up = config.armHeight().sample(random);
			for (int s = 1; s <= up; s++) {
				tree.log(p.above(s), Geo.axis(stem, Direction.Axis.Y));
			}
		}
		return tree.place(level) > 0;
	}
}
