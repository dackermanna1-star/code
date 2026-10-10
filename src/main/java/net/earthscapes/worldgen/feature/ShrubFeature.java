package net.earthscapes.worldgen.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.util.valueproviders.ConstantInt;
import net.minecraft.util.valueproviders.FloatProvider;
import net.minecraft.util.valueproviders.IntProvider;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.FeatureConfiguration;
import net.minecraft.world.level.levelgen.feature.stateproviders.BlockStateProvider;

/**
 * Bushes and thickets: one to a few overlapping, ragged, slightly flattened leaf mounds around a
 * woody stem. Used for whistling-thorn and commiphora bush, tamarisk, saxaul and willow scrub.
 */
public class ShrubFeature extends Feature<ShrubFeature.Config> {
	public record Config(
		Optional<BlockStateProvider> stem,
		BlockStateProvider leaves,
		FloatProvider radius,
		FloatProvider flatness,
		IntProvider lobes,
		IntProvider lift,
		float density,
		boolean desert
	) implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			BlockStateProvider.CODEC.optionalFieldOf("stem").forGetter(Config::stem),
			BlockStateProvider.CODEC.fieldOf("leaves").forGetter(Config::leaves),
			FloatProvider.codec(0.5F, 5.0F).fieldOf("radius").forGetter(Config::radius),
			FloatProvider.codec(0.2F, 1.5F).fieldOf("flatness").forGetter(Config::flatness),
			IntProvider.codec(1, 6).fieldOf("lobes").forGetter(Config::lobes),
			IntProvider.codec(0, 6).optionalFieldOf("lift", ConstantInt.of(0)).forGetter(Config::lift),
			Codec.floatRange(0.0F, 1.0F).optionalFieldOf("density", 0.85F).forGetter(Config::density),
			Codec.BOOL.optionalFieldOf("desert", false).forGetter(Config::desert)
		).apply(instance, Config::new));
	}

	public ShrubFeature(Codec<Config> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<Config> context) {
		WorldGenLevel level = context.level();
		BlockPos origin = context.origin();
		RandomSource random = context.random();
		Config config = context.config();
		BlockState ground = level.getBlockState(origin.below());
		boolean soil = TreeBuilder.isSoil(ground) || config.desert() && ground.isFaceSturdy(level, origin.below(), Direction.UP);
		if (!soil || !TreeBuilder.replaceableByTree(level.getBlockState(origin))) {
			return false;
		}
		TreeBuilder tree = new TreeBuilder();
		int lift = config.lift().sample(random);
		if (config.stem().isPresent()) {
			BlockState stem = Geo.axis(config.stem().get().getState(random, origin), Direction.Axis.Y);
			for (int y = 0; y <= lift; y++) {
				tree.log(origin.above(y), stem);
			}
		}
		Geo.Noise2 noise = new Geo.Noise2(random, 1.6);
		int lobes = config.lobes().sample(random);
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int l = 0; l < lobes; l++) {
			double r = config.radius().sample(random);
			double ry = Math.max(0.6, r * config.flatness().sample(random));
			double ox = l == 0 ? 0.0 : Geo.range(random, -r, r);
			double oz = l == 0 ? 0.0 : Geo.range(random, -r, r);
			double cy = origin.getY() + lift + ry * 0.55;
			double cx = origin.getX() + 0.5 + ox;
			double cz = origin.getZ() + 0.5 + oz;
			int ir = Mth.ceil(r) + 1;
			int iy = Mth.ceil(ry) + 1;
			for (int dx = -ir; dx <= ir; dx++) {
				for (int dz = -ir; dz <= ir; dz++) {
					for (int dy = -iy; dy <= iy; dy++) {
						int x = Mth.floor(cx) + dx;
						int y = Mth.floor(cy) + dy;
						int z = Mth.floor(cz) + dz;
						if (y < origin.getY()) {
							continue;
						}
						double d = Mth.square((x + 0.5 - cx) / r) + Mth.square((y + 0.5 - cy) / ry) + Mth.square((z + 0.5 - cz) / r);
						double edge = 1.0 + noise.sample(x, y * 1.3, z) * 0.35;
						if (d <= edge && (d < 0.6 || random.nextFloat() < config.density())) {
							pos.set(x, y, z);
							tree.leaf(pos, config.leaves().getState(random, pos));
						}
					}
				}
			}
		}
		// stemless shrubs keep their leaves as persistent ones (see TreeBuilder)
		tree.place(level);
		return true;
	}
}
