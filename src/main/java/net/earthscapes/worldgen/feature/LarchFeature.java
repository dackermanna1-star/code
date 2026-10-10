package net.earthscapes.worldgen.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
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
 * Siberian larch (Larix sibirica): a straight trunk with an open, narrow cone of thin, slightly
 * drooping branch whorls clothed in tufts of soft needles. The forests of the Mongolian
 * forest-steppe are made of these.
 */
public class LarchFeature extends Feature<LarchFeature.Config> {
	public record Config(BlockStateProvider trunk, BlockStateProvider leaves, IntProvider height, FloatProvider crownStart, FloatProvider branchLength, float density)
		implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			BlockStateProvider.CODEC.fieldOf("trunk").forGetter(Config::trunk),
			BlockStateProvider.CODEC.fieldOf("leaves").forGetter(Config::leaves),
			IntProvider.codec(4, 48).fieldOf("height").forGetter(Config::height),
			FloatProvider.codec(0.05F, 0.8F).fieldOf("crown_start").forGetter(Config::crownStart),
			FloatProvider.codec(1.0F, 8.0F).fieldOf("branch_length").forGetter(Config::branchLength),
			Codec.floatRange(0.0F, 1.0F).optionalFieldOf("density", 0.75F).forGetter(Config::density)
		).apply(instance, Config::new));
	}

	public LarchFeature(Codec<Config> codec) {
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
		BlockState log = config.trunk().getState(random, origin);
		for (int y = -1; y < height; y++) {
			if (y < 0) {
				tree.root(origin.above(y), Geo.axis(log, Direction.Axis.Y));
			} else {
				tree.log(origin.above(y), Geo.axis(log, Direction.Axis.Y));
			}
		}
		int crownBase = Math.max(2, Mth.floor(height * config.crownStart().sample(random)));
		double maxLength = config.branchLength().sample(random);
		Vec3 axis = Geo.centre(origin);
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int y = crownBase; y < height; y++) {
			double t = (double) (y - crownBase) / Math.max(1, height - crownBase);
			double len = Math.max(1.0, maxLength * Math.pow(1.0 - t, 0.9));
			boolean whorl = (y - crownBase) % 2 == 0 || random.nextFloat() < 0.3F;
			if (!whorl) {
				// sparse needle tufts on the trunk between whorls
				for (Direction dir : Direction.Plane.HORIZONTAL) {
					if (random.nextFloat() < 0.35F) {
						BlockPos p = origin.above(y).relative(dir);
						tree.leaf(p, config.leaves().getState(random, p));
					}
				}
				continue;
			}
			int count = 3 + random.nextInt(3);
			double start = random.nextDouble() * Math.PI * 2.0;
			for (int i = 0; i < count; i++) {
				double a = start + i * Math.PI * 2.0 / count + (random.nextDouble() - 0.5) * 0.7;
				double l = len * Geo.range(random, 0.75, 1.1);
				Vec3 from = new Vec3(axis.x, origin.getY() + y + 0.5, axis.z);
				Vec3 to = from.add(Math.cos(a) * l, -Math.min(1.5, l * 0.22), Math.sin(a) * l);
				if (l >= 3.0) {
					Vec3 woodEnd = from.lerp(to, 0.5);
					Geo.line(from, woodEnd, p -> tree.log(p, Geo.oriented(log, woodEnd.subtract(from))));
				}
				Geo.line(from, to, p -> {
					if (!tree.hasLog(p)) {
						tree.leaf(p, config.leaves().getState(random, p));
					}
					// needle tufts around the twig
					for (Direction dir : Direction.values()) {
						if (dir != Direction.DOWN && random.nextFloat() < config.density() * 0.45F) {
							BlockPos q = p.relative(dir);
							tree.leaf(q, config.leaves().getState(random, q));
						}
					}
				});
			}
		}
		// leader
		for (int y = height; y < height + 2; y++) {
			pos.set(origin.getX(), origin.getY() + y, origin.getZ());
			tree.leaf(pos, config.leaves().getState(random, pos));
		}
		for (Direction dir : Direction.Plane.HORIZONTAL) {
			BlockPos p = origin.above(height - 1).relative(dir);
			tree.leaf(p, config.leaves().getState(random, p));
		}
		return tree.place(level) > 0;
	}
}
