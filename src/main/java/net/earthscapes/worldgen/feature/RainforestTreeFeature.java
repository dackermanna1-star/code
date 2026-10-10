package net.earthscapes.worldgen.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import net.earthscapes.block.LianaBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.util.valueproviders.FloatProvider;
import net.minecraft.util.valueproviders.IntProvider;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.VineBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.FeatureConfiguration;
import net.minecraft.world.level.levelgen.feature.stateproviders.BlockStateProvider;
import net.minecraft.world.phys.Vec3;

/**
 * Canopy and understorey trees of tropical and temperate woodland: a straight trunk (one or two
 * blocks wide, optionally on small buttresses) that branches in its upper part into several
 * rounded leaf clouds. The many overlapping crowns form the closed rainforest canopy.
 */
public class RainforestTreeFeature extends Feature<RainforestTreeFeature.Config> {
	public record Config(
		BlockStateProvider trunk,
		BlockStateProvider leaves,
		IntProvider height,
		int trunkWidth,
		FloatProvider crownRadius,
		IntProvider branches,
		float crownStart,
		boolean buttresses,
		Optional<BlockStateProvider> vine,
		Optional<BlockStateProvider> liana,
		Optional<BlockStateProvider> epiphyte,
		float decorationChance,
		int floodDepth
	) implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			BlockStateProvider.CODEC.fieldOf("trunk").forGetter(Config::trunk),
			BlockStateProvider.CODEC.fieldOf("leaves").forGetter(Config::leaves),
			IntProvider.codec(3, 64).fieldOf("height").forGetter(Config::height),
			Codec.intRange(1, 2).optionalFieldOf("trunk_width", 1).forGetter(Config::trunkWidth),
			FloatProvider.codec(1.0F, 7.0F).fieldOf("crown_radius").forGetter(Config::crownRadius),
			IntProvider.codec(0, 10).fieldOf("branches").forGetter(Config::branches),
			Codec.floatRange(0.1F, 0.95F).optionalFieldOf("crown_start", 0.6F).forGetter(Config::crownStart),
			Codec.BOOL.optionalFieldOf("buttresses", false).forGetter(Config::buttresses),
			BlockStateProvider.CODEC.optionalFieldOf("vine").forGetter(Config::vine),
			BlockStateProvider.CODEC.optionalFieldOf("liana").forGetter(Config::liana),
			BlockStateProvider.CODEC.optionalFieldOf("epiphyte").forGetter(Config::epiphyte),
			Codec.floatRange(0.0F, 1.0F).optionalFieldOf("decoration_chance", 0.25F).forGetter(Config::decorationChance),
			Codec.intRange(0, 6).optionalFieldOf("flood_depth", 0).forGetter(Config::floodDepth)
		).apply(instance, Config::new));
	}

	public RainforestTreeFeature(Codec<Config> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<Config> context) {
		WorldGenLevel level = context.level();
		BlockPos origin = context.origin();
		RandomSource random = context.random();
		Config config = context.config();
		boolean rooted = config.floodDepth() > 0 ? EsFeatureUtil.canRootFlooded(level, origin, config.floodDepth()) : EsFeatureUtil.canRoot(level, origin);
		if (!rooted) {
			return false;
		}
		TreeBuilder tree = new TreeBuilder();
		int height = config.height().sample(random);
		BlockState trunk = Geo.axis(config.trunk().getState(random, origin), Direction.Axis.Y);
		int w = config.trunkWidth();
		double cx = origin.getX() + w * 0.5;
		double cz = origin.getZ() + w * 0.5;

		for (int y = -1; y < height; y++) {
			for (int dx = 0; dx < w; dx++) {
				for (int dz = 0; dz < w; dz++) {
					BlockPos p = origin.offset(dx, y, dz);
					if (y < 0) {
						tree.root(p, trunk);
					} else {
						tree.log(p, trunk);
					}
				}
			}
		}
		if (config.buttresses()) {
			for (Direction dir : Direction.Plane.HORIZONTAL) {
				if (random.nextFloat() < 0.75F) {
					int len = 2 + random.nextInt(2);
					int finHeight = 2 + random.nextInt(3);
					BlockPos start = origin.offset(dir.getStepX() > 0 ? w - 1 : 0, 0, dir.getStepZ() > 0 ? w - 1 : 0);
					for (int s = 1; s <= len; s++) {
						int top = finHeight - (s - 1) * finHeight / len;
						for (int y = -1; y <= top; y++) {
							BlockPos p = start.relative(dir, s).above(y);
							if (y < 1) {
								tree.root(p, trunk);
							} else {
								tree.log(p, trunk);
							}
						}
					}
				}
			}
		}

		// branches and leaf clouds
		Geo.Noise2 noise = new Geo.Noise2(random, 2.0);
		double crownRadius = config.crownRadius().sample(random);
		int crownBase = Math.max(2, Mth.floor(height * config.crownStart()));
		List<Vec3> clouds = new ArrayList<>();
		List<double[]> sizes = new ArrayList<>();
		clouds.add(new Vec3(cx, origin.getY() + height, cz));
		sizes.add(new double[] {crownRadius, crownRadius * 0.62});
		int branches = config.branches().sample(random);
		double start = random.nextDouble() * Math.PI * 2.0;
		BlockState branchState = config.trunk().getState(random, origin);
		for (int i = 0; i < branches; i++) {
			double a = start + i * Math.PI * 2.0 / Math.max(1, branches) + (random.nextDouble() - 0.5) * 0.9;
			int y = origin.getY() + crownBase + random.nextInt(Math.max(1, height - crownBase - 1));
			double len = crownRadius * Geo.range(random, 0.8, 1.35) + w * 0.5;
			Vec3 from = new Vec3(cx, y, cz);
			Vec3 to = new Vec3(cx + Math.cos(a) * len, y + Geo.range(random, 1.0, 3.0), cz + Math.sin(a) * len);
			Geo.line(from, to, p -> tree.log(p, Geo.oriented(branchState, to.subtract(from))));
			clouds.add(to.add(0.0, 0.5, 0.0));
			double cr = crownRadius * Geo.range(random, 0.6, 0.95);
			sizes.add(new double[] {cr, cr * Geo.range(random, 0.55, 0.75)});
			if (config.epiphyte().isPresent() && random.nextFloat() < config.decorationChance()) {
				Vec3 at = from.lerp(to, 0.5);
				BlockPos p = BlockPos.containing(at).above();
				tree.decoration(p, config.epiphyte().get().getState(random, p));
			}
		}

		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int i = 0; i < clouds.size(); i++) {
			Vec3 c = clouds.get(i);
			double rx = sizes.get(i)[0];
			double ry = sizes.get(i)[1];
			int ir = Mth.ceil(rx) + 1;
			int iy = Mth.ceil(ry) + 1;
			for (int dx = -ir; dx <= ir; dx++) {
				for (int dz = -ir; dz <= ir; dz++) {
					for (int dy = -iy; dy <= iy; dy++) {
						double d = Mth.square(dx / rx) + Mth.square(dy / ry) + Mth.square(dz / rx);
						double edge = 1.0 + noise.sample(c.x + dx, c.y + dy * 1.7, c.z + dz) * 0.3;
						if (d <= edge && !(d > 0.75 * edge && random.nextFloat() < 0.25F)) {
							pos.set(Mth.floor(c.x) + dx, Mth.floor(c.y) + dy, Mth.floor(c.z) + dz);
							tree.leaf(pos, config.leaves().getState(random, pos));
						}
					}
				}
			}
			// lianas dropping from the underside of the cloud
			if (config.liana().isPresent() && random.nextFloat() < config.decorationChance()) {
				int strands = 1 + random.nextInt(3);
				for (int s = 0; s < strands; s++) {
					BlockPos top = BlockPos.containing(c.x + Geo.range(random, -rx * 0.7, rx * 0.7), c.y - ry, c.z + Geo.range(random, -rx * 0.7, rx * 0.7));
					int length = 3 + random.nextInt(Math.max(1, height - 4));
					BlockState liana = config.liana().get().getState(random, top);
					for (int k = 0; k < length; k++) {
						BlockState state = liana.hasProperty(LianaBlock.TIP) ? liana.setValue(LianaBlock.TIP, k == length - 1) : liana;
						tree.decoration(top.below(k), state);
					}
				}
			}
		}

		if (config.vine().isPresent()) {
			for (int y = 1; y < crownBase; y++) {
				for (Direction dir : Direction.Plane.HORIZONTAL) {
					if (random.nextFloat() < config.decorationChance() * 0.6F) {
						BlockPos p = origin.offset(dir.getStepX() > 0 ? w - 1 : 0, y, dir.getStepZ() > 0 ? w - 1 : 0).relative(dir);
						if (dir.getAxis() == Direction.Axis.X && w == 2) {
							p = p.offset(0, 0, random.nextInt(2));
						} else if (w == 2) {
							p = p.offset(random.nextInt(2), 0, 0);
						}
						BlockState vine = config.vine().get().getState(random, p);
						if (vine.getBlock() instanceof VineBlock) {
							vine = vine.setValue(VineBlock.getPropertyForFace(dir.getOpposite()), true);
						}
						tree.decoration(p, vine);
					}
				}
			}
		}
		return tree.place(level) > 0;
	}
}
