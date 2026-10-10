package net.earthscapes.worldgen.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.ArrayList;
import java.util.List;
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
import net.minecraft.world.phys.Vec3;

/**
 * Rounded granite boulders, optionally piled on a low whaleback dome: the kopjes of the Serengeti,
 * the tors of the Mongolian steppe and the scattered rocks of desert plains. Boulders are
 * weathered ellipsoids, stack on one another and are often split by a vertical joint.
 */
public class BoulderClusterFeature extends Feature<BoulderClusterFeature.Config> {
	public record Config(
		BlockStateProvider block,
		FloatProvider domeRadius,
		IntProvider boulders,
		FloatProvider boulderRadius,
		float spread,
		float stackChance,
		float crackChance
	) implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			BlockStateProvider.CODEC.fieldOf("block").forGetter(Config::block),
			FloatProvider.codec(0.0F, 14.0F).fieldOf("dome_radius").forGetter(Config::domeRadius),
			IntProvider.codec(0, 40).fieldOf("boulders").forGetter(Config::boulders),
			FloatProvider.codec(0.5F, 7.0F).fieldOf("boulder_radius").forGetter(Config::boulderRadius),
			Codec.floatRange(0.0F, 14.0F).optionalFieldOf("spread", 6.0F).forGetter(Config::spread),
			Codec.floatRange(0.0F, 1.0F).optionalFieldOf("stack_chance", 0.5F).forGetter(Config::stackChance),
			Codec.floatRange(0.0F, 1.0F).optionalFieldOf("crack_chance", 0.3F).forGetter(Config::crackChance)
		).apply(instance, Config::new));
	}

	public BoulderClusterFeature(Codec<Config> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<Config> context) {
		WorldGenLevel level = context.level();
		BlockPos origin = context.origin();
		RandomSource random = context.random();
		Config config = context.config();
		TreeBuilder rock = new TreeBuilder();
		Geo.Noise2 noise = new Geo.Noise2(random, 2.2);
		List<double[]> placed = new ArrayList<>();

		double dome = config.domeRadius().sample(random);
		if (dome >= 1.0) {
			double ry = dome * Geo.range(random, 0.35, 0.55);
			Vec3 c = new Vec3(origin.getX() + 0.5, EsFeatureUtil.floor(level, origin.getX(), origin.getZ()) - ry * 0.35, origin.getZ() + 0.5);
			this.ellipsoid(rock, config, random, noise, c, dome, ry, dome * Geo.range(random, 0.75, 1.0), random.nextDouble() * Math.PI, 0.0);
			placed.add(new double[] {c.x, c.y, c.z, dome, ry});
		}

		int count = config.boulders().sample(random);
		for (int i = 0; i < count; i++) {
			double r = config.boulderRadius().sample(random);
			double ry = r * Geo.range(random, 0.65, 0.95);
			double rz = r * Geo.range(random, 0.7, 1.0);
			double x;
			double z;
			double y;
			if (!placed.isEmpty() && random.nextFloat() < config.stackChance()) {
				double[] base = placed.get(random.nextInt(placed.size()));
				x = base[0] + Geo.range(random, -base[3] * 0.5, base[3] * 0.5);
				z = base[2] + Geo.range(random, -base[3] * 0.5, base[3] * 0.5);
				y = base[1] + base[4] * 0.85 + ry * 0.75;
			} else {
				double a = random.nextDouble() * Math.PI * 2.0;
				double d = Math.sqrt(random.nextDouble()) * config.spread();
				x = origin.getX() + 0.5 + Math.cos(a) * d;
				z = origin.getZ() + 0.5 + Math.sin(a) * d;
				y = EsFeatureUtil.floor(level, Mth.floor(x), Mth.floor(z)) + ry * Geo.range(random, 0.25, 0.6);
			}
			double crack = random.nextFloat() < config.crackChance() ? random.nextDouble() * Math.PI : Double.NaN;
			this.ellipsoid(rock, config, random, noise, new Vec3(x, y, z), r, ry, rz, random.nextDouble() * Math.PI, crack);
			placed.add(new double[] {x, y, z, r, ry});
		}
		return rock.place(level) > 0;
	}

	private void ellipsoid(TreeBuilder rock, Config config, RandomSource random, Geo.Noise2 noise, Vec3 c, double rx, double ry, double rz, double yaw, double crack) {
		double cos = Math.cos(yaw);
		double sin = Math.sin(yaw);
		int ir = Mth.ceil(Math.max(rx, rz)) + 1;
		int iy = Mth.ceil(ry) + 1;
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int dx = -ir; dx <= ir; dx++) {
			for (int dz = -ir; dz <= ir; dz++) {
				for (int dy = -iy; dy <= iy; dy++) {
					int x = Mth.floor(c.x) + dx;
					int y = Mth.floor(c.y) + dy;
					int z = Mth.floor(c.z) + dz;
					double px = x + 0.5 - c.x;
					double py = y + 0.5 - c.y;
					double pz = z + 0.5 - c.z;
					double u = (px * cos + pz * sin) / rx;
					double w = (-px * sin + pz * cos) / rz;
					double v = py / ry;
					// superellipsoid exponent 2.4 gives the squarish, weathered look of granite blocks
					double d = Math.pow(Math.abs(u), 2.4) + Math.pow(Math.abs(v), 2.4) + Math.pow(Math.abs(w), 2.4);
					double edge = 1.0 + noise.sample(x, y * 1.5, z) * 0.18;
					if (d > edge) {
						continue;
					}
					if (!Double.isNaN(crack)) {
						double along = px * Math.cos(crack) + pz * Math.sin(crack);
						if (Math.abs(along) < 0.5 && v > -0.6) {
							continue;
						}
					}
					pos.set(x, y, z);
					rock.root(pos, config.block().getState(random, pos));
				}
			}
		}
	}
}
