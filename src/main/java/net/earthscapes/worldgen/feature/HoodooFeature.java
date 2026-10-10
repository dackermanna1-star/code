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
import net.minecraft.world.phys.Vec3;

/**
 * Wind-carved sandstone towers of the Tassili n'Ajjer "stone forests": banded pillars pinched at
 * the waist and capped by a broader, harder caprock, and natural arches spanning between pairs.
 */
public class HoodooFeature extends Feature<HoodooFeature.Config> {
	public record Config(
		BlockStateProvider rock,
		BlockStateProvider band,
		BlockStateProvider cap,
		IntProvider height,
		FloatProvider radius,
		float archChance
	) implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			BlockStateProvider.CODEC.fieldOf("rock").forGetter(Config::rock),
			BlockStateProvider.CODEC.fieldOf("band").forGetter(Config::band),
			BlockStateProvider.CODEC.fieldOf("cap").forGetter(Config::cap),
			IntProvider.codec(3, 48).fieldOf("height").forGetter(Config::height),
			FloatProvider.codec(1.0F, 6.0F).fieldOf("radius").forGetter(Config::radius),
			Codec.floatRange(0.0F, 1.0F).optionalFieldOf("arch_chance", 0.2F).forGetter(Config::archChance)
		).apply(instance, Config::new));
	}

	public HoodooFeature(Codec<Config> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<Config> context) {
		WorldGenLevel level = context.level();
		BlockPos origin = context.origin();
		RandomSource random = context.random();
		Config config = context.config();
		TreeBuilder rock = new TreeBuilder();
		Geo.Noise2 noise = new Geo.Noise2(random, 2.5);
		int bandPhase = random.nextInt(5);

		int height = config.height().sample(random);
		double radius = config.radius().sample(random);
		int baseY = EsFeatureUtil.floor(level, origin.getX(), origin.getZ());
		this.pillar(rock, config, random, noise, origin.getX() + 0.5, baseY, origin.getZ() + 0.5, height, radius, bandPhase);

		if (random.nextFloat() < config.archChance()) {
			double a = random.nextDouble() * Math.PI * 2.0;
			double span = Geo.range(random, 7.0, 12.0);
			double x2 = origin.getX() + 0.5 + Math.cos(a) * span;
			double z2 = origin.getZ() + 0.5 + Math.sin(a) * span;
			int base2 = EsFeatureUtil.floor(level, Mth.floor(x2), Mth.floor(z2));
			int h2 = Math.max(6, height - 2 - random.nextInt(4));
			double r2 = radius * Geo.range(random, 0.8, 1.0);
			this.pillar(rock, config, random, noise, x2, base2, z2, h2, r2, bandPhase);
			// the arch: a thick curved span from one shoulder to the other
			Vec3 from = new Vec3(origin.getX() + 0.5, baseY + height * 0.8, origin.getZ() + 0.5);
			Vec3 to = new Vec3(x2, base2 + h2 * 0.8, z2);
			double rise = Geo.range(random, 2.5, 5.0);
			double thickness = Geo.range(random, 1.3, 2.0);
			BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
			for (double t = 0.0; t <= 1.0; t += 0.03) {
				Vec3 c = from.lerp(to, t).add(0.0, Math.sin(t * Math.PI) * rise, 0.0);
				int ir = Mth.ceil(thickness) + 1;
				for (int dx = -ir; dx <= ir; dx++) {
					for (int dy = -ir; dy <= ir; dy++) {
						for (int dz = -ir; dz <= ir; dz++) {
							if (dx * dx + dy * dy * 1.6 + dz * dz <= thickness * thickness) {
								pos.set(Mth.floor(c.x) + dx, Mth.floor(c.y) + dy, Mth.floor(c.z) + dz);
								rock.root(pos, this.layer(config, random, pos, bandPhase));
							}
						}
					}
				}
			}
		}
		return rock.place(level) > 0;
	}

	private net.minecraft.world.level.block.state.BlockState layer(Config config, RandomSource random, BlockPos pos, int phase) {
		return Math.floorMod(pos.getY() + phase, 5) == 0 ? config.band().getState(random, pos) : config.rock().getState(random, pos);
	}

	private void pillar(TreeBuilder rock, Config config, RandomSource random, Geo.Noise2 noise, double cx, int baseY, double cz, int height, double radius, int phase) {
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		double waist = Geo.range(random, 0.55, 0.8);
		double waistAt = Geo.range(random, 0.25, 0.6);
		int ir = Mth.ceil(radius * 1.6) + 1;
		for (int y = -3; y <= height + 1; y++) {
			double t = Math.max(0.0, (double) y / height);
			double pinch = 1.0 - (1.0 - waist) * Math.exp(-Mth.square((t - waistAt) / 0.22));
			double rad = radius * pinch * (y < 1 ? 1.25 : 1.0);
			boolean cap = y >= height - 1;
			if (cap) {
				rad = radius * Geo.range(random, 1.15, 1.35);
			}
			for (int dx = -ir; dx <= ir; dx++) {
				for (int dz = -ir; dz <= ir; dz++) {
					int x = Mth.floor(cx) + dx;
					int z = Mth.floor(cz) + dz;
					double d = Math.sqrt(Mth.square(x + 0.5 - cx) + Mth.square(z + 0.5 - cz));
					if (d <= rad + noise.sample(x, y * 1.2, z) * 0.6) {
						pos.set(x, baseY + y, z);
						rock.root(pos, cap ? config.cap().getState(random, pos) : this.layer(config, random, pos, phase));
					}
				}
			}
		}
	}
}
