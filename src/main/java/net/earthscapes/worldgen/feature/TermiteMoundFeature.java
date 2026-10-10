package net.earthscapes.worldgen.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.core.BlockPos;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.util.valueproviders.FloatProvider;
import net.minecraft.util.valueproviders.IntProvider;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.FeatureConfiguration;
import net.minecraft.world.level.levelgen.feature.stateproviders.BlockStateProvider;

/**
 * Termite mounds of the African bush: a hard clay mound tapering into one or more knobbly
 * chimneys, sometimes taller than a person.
 */
public class TermiteMoundFeature extends Feature<TermiteMoundFeature.Config> {
	public record Config(BlockStateProvider block, IntProvider height, FloatProvider radius, float spireChance) implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			BlockStateProvider.CODEC.fieldOf("block").forGetter(Config::block),
			IntProvider.codec(1, 16).fieldOf("height").forGetter(Config::height),
			FloatProvider.codec(0.5F, 5.0F).fieldOf("radius").forGetter(Config::radius),
			Codec.floatRange(0.0F, 1.0F).optionalFieldOf("spire_chance", 0.4F).forGetter(Config::spireChance)
		).apply(instance, Config::new));
	}

	public TermiteMoundFeature(Codec<Config> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<Config> context) {
		WorldGenLevel level = context.level();
		BlockPos origin = context.origin();
		RandomSource random = context.random();
		Config config = context.config();
		if (!TreeBuilder.isSoil(level.getBlockState(origin.below()))) {
			return false;
		}
		TreeBuilder mound = new TreeBuilder();
		this.spire(mound, config, random, origin.getX() + 0.5, origin.getY(), origin.getZ() + 0.5, config.height().sample(random), config.radius().sample(random));
		if (random.nextFloat() < config.spireChance()) {
			double a = random.nextDouble() * Math.PI * 2.0;
			double d = Geo.range(random, 1.0, 2.2);
			this.spire(mound, config, random, origin.getX() + 0.5 + Math.cos(a) * d, origin.getY(), origin.getZ() + 0.5 + Math.sin(a) * d,
				Math.max(2, config.height().sample(random) - 2), config.radius().sample(random) * 0.7);
		}
		return mound.place(level) > 0;
	}

	private void spire(TreeBuilder mound, Config config, RandomSource random, double cx, int baseY, double cz, int height, double radius) {
		Geo.Noise2 noise = new Geo.Noise2(random, 1.3);
		int r = Mth.ceil(radius) + 2;
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int y = -2; y < height; y++) {
			double t = Math.max(0.0, y) / height;
			double rad = radius * Math.pow(1.0 - t, 0.75) + (y <= 0 ? 0.7 : 0.0);
			for (int dx = -r; dx <= r; dx++) {
				for (int dz = -r; dz <= r; dz++) {
					int x = Mth.floor(cx) + dx;
					int z = Mth.floor(cz) + dz;
					double d = Math.sqrt(Mth.square(x + 0.5 - cx) + Mth.square(z + 0.5 - cz));
					if (d <= rad + noise.sample(x, y * 1.7, z) * 0.45 || dx == 0 && dz == 0) {
						pos.set(x, baseY + y, z);
						mound.root(pos, config.block().getState(random, pos));
					}
				}
			}
		}
	}
}
