package net.earthscapes.worldgen.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.core.BlockPos;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.util.valueproviders.FloatProvider;
import net.minecraft.util.valueproviders.IntProvider;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.FeatureConfiguration;
import net.minecraft.world.level.levelgen.feature.stateproviders.BlockStateProvider;
import net.minecraft.world.phys.Vec3;

/**
 * African baobab (Adansonia digitata): a massive bottle-shaped trunk crowned by short, stubby,
 * root-like limbs carrying only sparse tufts of leaves, the "upside-down tree" of the savanna.
 */
public class BaobabFeature extends Feature<BaobabFeature.Config> {
	public record Config(
		BlockStateProvider trunk,
		BlockStateProvider branch,
		BlockStateProvider leaves,
		IntProvider height,
		FloatProvider radius,
		IntProvider branches,
		float leafDensity
	) implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			BlockStateProvider.CODEC.fieldOf("trunk").forGetter(Config::trunk),
			BlockStateProvider.CODEC.fieldOf("branch").forGetter(Config::branch),
			BlockStateProvider.CODEC.fieldOf("leaves").forGetter(Config::leaves),
			IntProvider.codec(4, 32).fieldOf("height").forGetter(Config::height),
			FloatProvider.codec(0.5F, 6.0F).fieldOf("radius").forGetter(Config::radius),
			IntProvider.codec(1, 12).fieldOf("branches").forGetter(Config::branches),
			Codec.floatRange(0.0F, 1.0F).optionalFieldOf("leaf_density", 0.55F).forGetter(Config::leafDensity)
		).apply(instance, Config::new));
	}

	public BaobabFeature(Codec<Config> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<Config> context) {
		WorldGenLevel level = context.level();
		BlockPos origin = context.origin();
		RandomSource random = context.random();
		Config config = context.config();
		if (!EsFeatureUtil.canRoot(level, origin)) {
			return false;
		}
		TreeBuilder tree = new TreeBuilder();
		int height = config.height().sample(random);
		double baseRadius = config.radius().sample(random);
		BlockState trunk = config.trunk().getState(random, origin);
		BlockState branch = config.branch().getState(random, origin);
		Geo.Noise2 bark = new Geo.Noise2(random, 3.0);
		double cx = origin.getX() + 0.5;
		double cz = origin.getZ() + 0.5;

		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		int r = Mth.ceil(baseRadius * 1.35) + 1;
		for (int y = -3; y < height; y++) {
			double t = Math.max(0.0, y) / height;
			// swollen belly low on the trunk, narrowing into a short neck at the top
			double profile = 1.0 + 0.16 * Math.sin(Math.PI * Math.min(1.0, t * 1.6));
			if (t > 0.7) {
				profile *= Mth.lerp((t - 0.7) / 0.3, 1.0, 0.62);
			}
			if (y < 0) {
				profile *= 1.12;
			}
			for (int dx = -r; dx <= r; dx++) {
				for (int dz = -r; dz <= r; dz++) {
					double d = Math.sqrt(Mth.square(dx + 0.5 - (cx - origin.getX())) + Mth.square(dz + 0.5 - (cz - origin.getZ())));
					double angleNoise = bark.sample(Math.atan2(dz, dx) * 3.0, y * 0.6) * 0.35;
					if (d <= baseRadius * profile + angleNoise) {
						pos.set(origin.getX() + dx, origin.getY() + y, origin.getZ() + dz);
						if (y < 0) {
							tree.root(pos, trunk);
						} else {
							tree.log(pos, trunk);
						}
					}
				}
			}
		}

		// Stubby limbs radiating from the top, each splitting into a few twigs with leaf tufts.
		int top = origin.getY() + height;
		double neck = baseRadius * 0.62;
		int limbs = config.branches().sample(random);
		double start = random.nextDouble() * Math.PI * 2.0;
		for (int i = 0; i < limbs; i++) {
			double a = start + i * Math.PI * 2.0 / limbs + (random.nextDouble() - 0.5) * 0.6;
			double len = Geo.range(random, 3.0, 5.5) + baseRadius * 0.6;
			double rise = Geo.range(random, 1.0, 3.5);
			Vec3 from = new Vec3(cx + Math.cos(a) * neck * 0.6, top - Geo.range(random, 0.5, 2.5), cz + Math.sin(a) * neck * 0.6);
			Vec3 to = new Vec3(cx + Math.cos(a) * (neck + len), top + rise, cz + Math.sin(a) * (neck + len));
			Geo.line(from, to, p -> tree.log(p, Geo.oriented(branch, to.subtract(from))));
			int twigs = 2 + random.nextInt(2);
			for (int j = 0; j < twigs; j++) {
				double ta = a + Geo.range(random, -0.8, 0.8);
				double tl = Geo.range(random, 1.5, 3.0);
				Vec3 end = to.add(Math.cos(ta) * tl, Geo.range(random, 0.5, 2.0), Math.sin(ta) * tl);
				Geo.line(to, end, p -> tree.log(p, Geo.oriented(branch, end.subtract(to))));
				this.tuft(tree, config, random, end);
			}
		}
		// a few short stubs in the middle of the crown
		for (int i = 0; i < 2; i++) {
			Vec3 from = new Vec3(cx, top - 1, cz);
			Vec3 to = from.add(Geo.range(random, -1.5, 1.5), Geo.range(random, 2.0, 3.5), Geo.range(random, -1.5, 1.5));
			Geo.line(from, to, p -> tree.log(p, Geo.oriented(branch, to.subtract(from))));
			this.tuft(tree, config, random, to);
		}
		return tree.place(level) > 0;
	}

	private void tuft(TreeBuilder tree, Config config, RandomSource random, Vec3 centre) {
		double rad = Geo.range(random, 1.3, 2.2);
		int r = Mth.ceil(rad);
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int dx = -r; dx <= r; dx++) {
			for (int dy = -1; dy <= 1; dy++) {
				for (int dz = -r; dz <= r; dz++) {
					double d = Math.sqrt(dx * dx + dy * dy * 2.5 + dz * dz);
					if (d <= rad && random.nextFloat() < config.leafDensity() + (rad - d) * 0.25) {
						pos.set(Mth.floor(centre.x) + dx, Mth.floor(centre.y) + dy, Mth.floor(centre.z) + dz);
						tree.leaf(pos, config.leaves().getState(random, pos));
					}
				}
			}
		}
	}
}
