package net.earthscapes.worldgen.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.util.valueproviders.IntProvider;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.FeatureConfiguration;
import net.minecraft.world.level.levelgen.feature.stateproviders.BlockStateProvider;
import net.minecraft.world.phys.Vec3;

/**
 * Cecropia, the pioneer tree of riverbanks and clearings: a slim pale trunk that splits at the
 * top into a few upturned candelabra branches, each ending in an umbrella of huge, silvery,
 * hand-shaped leaves.
 */
public class CecropiaFeature extends Feature<CecropiaFeature.Config> {
	public record Config(BlockStateProvider trunk, BlockStateProvider leaves, IntProvider height, IntProvider branches) implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			BlockStateProvider.CODEC.fieldOf("trunk").forGetter(Config::trunk),
			BlockStateProvider.CODEC.fieldOf("leaves").forGetter(Config::leaves),
			IntProvider.codec(4, 40).fieldOf("height").forGetter(Config::height),
			IntProvider.codec(1, 8).fieldOf("branches").forGetter(Config::branches)
		).apply(instance, Config::new));
	}

	public CecropiaFeature(Codec<Config> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<Config> context) {
		WorldGenLevel level = context.level();
		BlockPos origin = context.origin();
		RandomSource random = context.random();
		Config config = context.config();
		if (!EsFeatureUtil.canRootFlooded(level, origin, 2)) {
			return false;
		}
		TreeBuilder tree = new TreeBuilder();
		int height = config.height().sample(random);
		BlockState log = config.trunk().getState(random, origin);
		double lean = random.nextDouble() * Math.PI * 2.0;
		double bend = Geo.range(random, 0.0, 0.18);
		Vec3 previous = Geo.centre(origin);
		for (int y = 1; y <= height; y++) {
			Vec3 next = Geo.centre(origin).add(Math.cos(lean) * bend * y, y, Math.sin(lean) * bend * y);
			Geo.line(previous, next, p -> tree.log(p, Geo.axis(log, Direction.Axis.Y)));
			previous = next;
		}
		Vec3 top = previous;
		int branches = config.branches().sample(random);
		double start = random.nextDouble() * Math.PI * 2.0;
		this.umbrella(tree, config, random, top.add(0, 1, 0));
		for (int i = 0; i < branches; i++) {
			double a = start + i * Math.PI * 2.0 / branches + (random.nextDouble() - 0.5) * 0.6;
			double len = Geo.range(random, 2.0, 3.6);
			Vec3 from = top.add(0.0, -Geo.range(random, 0.0, 2.5), 0.0);
			Vec3 to = from.add(Math.cos(a) * len, len * Geo.range(random, 0.7, 1.2), Math.sin(a) * len);
			Geo.line(from, to, p -> tree.log(p, Geo.oriented(log, to.subtract(from))));
			this.umbrella(tree, config, random, to.add(0.0, 1.0, 0.0));
		}
		return tree.place(level) > 0;
	}

	private void umbrella(TreeBuilder tree, Config config, RandomSource random, Vec3 c) {
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		double r = Geo.range(random, 1.6, 2.4);
		int ir = Mth.ceil(r);
		for (int dx = -ir; dx <= ir; dx++) {
			for (int dz = -ir; dz <= ir; dz++) {
				double d = Math.sqrt(dx * dx + dz * dz);
				if (d <= r) {
					pos.set(Mth.floor(c.x) + dx, Mth.floor(c.y), Mth.floor(c.z) + dz);
					tree.leaf(pos, config.leaves().getState(random, pos));
					if (d > r - 1.0 && random.nextFloat() < 0.55F) {
						tree.leaf(pos.move(0, -1, 0), config.leaves().getState(random, pos));
					}
				}
			}
		}
	}
}
