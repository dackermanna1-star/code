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
 * Giant emergent rainforest trees such as the kapok (Ceiba pentandra) and Brazil nut: a tall,
 * straight column on plank-like buttress roots, limbs spreading only near the top into a wide,
 * flat crown of leaf clouds that rises above the rest of the canopy. Limbs carry epiphytes and
 * lianas drop from them to the forest floor.
 */
public class KapokFeature extends Feature<KapokFeature.Config> {
	public record Config(
		BlockStateProvider trunk,
		BlockStateProvider branch,
		BlockStateProvider leaves,
		IntProvider height,
		FloatProvider trunkRadius,
		IntProvider buttresses,
		IntProvider limbs,
		FloatProvider limbLength,
		FloatProvider clusterRadius,
		Optional<BlockStateProvider> liana,
		Optional<BlockStateProvider> epiphyte,
		Optional<BlockStateProvider> vine,
		float decorationChance
	) implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			BlockStateProvider.CODEC.fieldOf("trunk").forGetter(Config::trunk),
			BlockStateProvider.CODEC.fieldOf("branch").forGetter(Config::branch),
			BlockStateProvider.CODEC.fieldOf("leaves").forGetter(Config::leaves),
			IntProvider.codec(10, 120).fieldOf("height").forGetter(Config::height),
			FloatProvider.codec(0.5F, 4.0F).fieldOf("trunk_radius").forGetter(Config::trunkRadius),
			IntProvider.codec(0, 10).fieldOf("buttresses").forGetter(Config::buttresses),
			IntProvider.codec(2, 12).fieldOf("limbs").forGetter(Config::limbs),
			FloatProvider.codec(2.0F, 14.0F).fieldOf("limb_length").forGetter(Config::limbLength),
			FloatProvider.codec(1.5F, 7.0F).fieldOf("cluster_radius").forGetter(Config::clusterRadius),
			BlockStateProvider.CODEC.optionalFieldOf("liana").forGetter(Config::liana),
			BlockStateProvider.CODEC.optionalFieldOf("epiphyte").forGetter(Config::epiphyte),
			BlockStateProvider.CODEC.optionalFieldOf("vine").forGetter(Config::vine),
			Codec.floatRange(0.0F, 1.0F).optionalFieldOf("decoration_chance", 0.3F).forGetter(Config::decorationChance)
		).apply(instance, Config::new));
	}

	public KapokFeature(Codec<Config> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<Config> context) {
		WorldGenLevel level = context.level();
		BlockPos origin = context.origin();
		RandomSource random = context.random();
		Config config = context.config();
		if (!EsFeatureUtil.canRootFlooded(level, origin, 3)) {
			return false;
		}
		TreeBuilder tree = new TreeBuilder();
		int height = config.height().sample(random);
		double radius = config.trunkRadius().sample(random);
		BlockState trunk = config.trunk().getState(random, origin);
		BlockState branch = config.branch().getState(random, origin);
		double cx = origin.getX() + 0.5;
		double cz = origin.getZ() + 0.5;
		int crownStart = height - 7 - random.nextInt(5);
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();

		// trunk column, slowly tapering
		int r = Mth.ceil(radius) + 1;
		for (int y = -3; y <= height - 3; y++) {
			// the column tapers to a slim leader that runs up through the crown
			double rad = y <= crownStart
				? Mth.lerp(Math.max(0, y) / (double) crownStart, radius, Math.max(0.6, radius * 0.62))
				: 0.6;
			for (int dx = -r; dx <= r; dx++) {
				for (int dz = -r; dz <= r; dz++) {
					if (Mth.square(dx + 0.5 - (cx - origin.getX())) + Mth.square(dz + 0.5 - (cz - origin.getZ())) <= rad * rad + 0.25) {
						pos.set(origin.getX() + dx, origin.getY() + y, origin.getZ() + dz);
						if (y < 0) {
							tree.root(pos, Geo.axis(trunk, Direction.Axis.Y));
						} else {
							tree.log(pos, Geo.axis(trunk, Direction.Axis.Y));
						}
					}
				}
			}
		}

		// plank buttresses: thin fins that flare from the trunk and taper into the ground
		int buttresses = config.buttresses().sample(random);
		double bStart = random.nextDouble() * Math.PI * 2.0;
		for (int i = 0; i < buttresses; i++) {
			double a = bStart + i * Math.PI * 2.0 / Math.max(1, buttresses) + (random.nextDouble() - 0.5) * 0.7;
			double len = Geo.range(random, 3.0, 4.0) + radius * 2.2;
			double finHeight = Geo.range(random, 4.0, 7.0) + radius * 2.0;
			double curve = Geo.range(random, -1.2, 1.2);
			for (double s = 0.0; s <= len; s += 0.5) {
				double t = s / len;
				double px = cx + Math.cos(a) * (radius + s) - Math.sin(a) * Math.sin(t * Math.PI) * curve;
				double pz = cz + Math.sin(a) * (radius + s) + Math.cos(a) * Math.sin(t * Math.PI) * curve;
				int top = (int) Math.round(finHeight * Math.pow(1.0 - t, 1.6));
				for (int y = -2; y <= top; y++) {
					pos.set(Mth.floor(px), origin.getY() + y, Mth.floor(pz));
					if (y < 1) {
						tree.root(pos, Geo.axis(branch, Direction.Axis.Y));
					} else {
						tree.log(pos, Geo.axis(branch, Direction.Axis.Y));
					}
				}
			}
		}

		// limbs radiating from the top of the column
		int limbs = config.limbs().sample(random);
		double lStart = random.nextDouble() * Math.PI * 2.0;
		List<Vec3> clusters = new ArrayList<>();
		List<Vec3[]> limbSegments = new ArrayList<>();
		for (int i = 0; i < limbs; i++) {
			double a = lStart + i * Math.PI * 2.0 / limbs + (random.nextDouble() - 0.5) * 0.5;
			double len = Math.min(config.limbLength().sample(random), 15.0 - config.clusterRadius().getMaxValue());
			int baseY = origin.getY() + crownStart + random.nextInt(Math.max(1, height - crownStart - 5));
			Vec3 from = new Vec3(cx, baseY, cz);
			Vec3 to = new Vec3(cx + Math.cos(a) * len, baseY + Geo.range(random, 2.0, 5.0), cz + Math.sin(a) * len);
			Vec3 mid = from.lerp(to, 0.5).add(0.0, Geo.range(random, 0.0, 1.5), 0.0);
			Geo.line(from, mid, p -> tree.log(p, Geo.oriented(branch, mid.subtract(from))));
			Geo.line(mid, to, p -> tree.log(p, Geo.oriented(branch, to.subtract(mid))));
			// thicken the inner half
			Geo.line(from.add(0, 1, 0), mid.add(0, 1, 0), p -> tree.log(p, Geo.oriented(branch, mid.subtract(from))));
			limbSegments.add(new Vec3[] {from, mid});
			limbSegments.add(new Vec3[] {mid, to});
			clusters.add(to.add(0.0, 1.0, 0.0));
			int subs = random.nextInt(3);
			for (int j = 0; j < subs; j++) {
				double sa = a + (random.nextBoolean() ? 1 : -1) * Geo.range(random, 0.5, 1.0);
				double sl = Geo.range(random, 2.5, 4.5);
				Vec3 sFrom = mid;
				Vec3 sTo = new Vec3(mid.x + Math.cos(sa) * sl, mid.y + Geo.range(random, 1.0, 3.0), mid.z + Math.sin(sa) * sl);
				Geo.line(sFrom, sTo, p -> tree.log(p, Geo.oriented(branch, sTo.subtract(sFrom))));
				clusters.add(sTo.add(0.0, 1.0, 0.0));
			}
		}
		clusters.add(new Vec3(cx, origin.getY() + height - 1, cz));

		// leaf clouds: flattened, ragged ellipsoids
		Geo.Noise2 noise = new Geo.Noise2(random, 2.3);
		for (Vec3 c : clusters) {
			double rad = config.clusterRadius().sample(random);
			double ry = rad * Geo.range(random, 0.42, 0.55);
			int ir = Mth.ceil(rad) + 1;
			int iry = Mth.ceil(ry) + 1;
			for (int dx = -ir; dx <= ir; dx++) {
				for (int dz = -ir; dz <= ir; dz++) {
					for (int dy = -iry; dy <= iry; dy++) {
						double nx = (dx) / rad;
						double ny = (dy + (dy < 0 ? 0.6 : 0.0)) / ry;
						double nz = (dz) / rad;
						double d = nx * nx + ny * ny + nz * nz;
						double edge = 1.0 + noise.sample(c.x + dx, c.y + dy * 2.0, c.z + dz) * 0.35;
						if (d <= edge) {
							pos.set(Mth.floor(c.x) + dx, Mth.floor(c.y) + dy, Mth.floor(c.z) + dz);
							if (d > 0.7 * edge && random.nextFloat() < 0.2F) {
								continue;
							}
							tree.leaf(pos, config.leaves().getState(random, pos));
						}
					}
				}
			}
		}

		this.decorate(tree, config, random, origin, height, crownStart, radius, limbSegments);
		return tree.place(level) > 0;
	}

	private void decorate(TreeBuilder tree, Config config, RandomSource random, BlockPos origin, int height, int crownStart, double radius, List<Vec3[]> limbs) {
		float chance = config.decorationChance();
		// epiphytes and lianas along the limbs
		for (Vec3[] seg : limbs) {
			Geo.line(seg[0], seg[1], p -> {
				if (config.epiphyte().isPresent() && random.nextFloat() < chance * 0.5F) {
					tree.decoration(p.above(), config.epiphyte().get().getState(random, p));
				}
				if (config.liana().isPresent() && random.nextFloat() < chance * 0.25F) {
					int length = 4 + random.nextInt(Math.max(1, height - 10));
					BlockState liana = config.liana().get().getState(random, p);
					for (int i = 1; i <= length; i++) {
						boolean tip = i == length;
						tree.decoration(p.below(i), liana.hasProperty(LianaBlock.TIP) ? liana.setValue(LianaBlock.TIP, tip) : liana);
					}
				}
			});
		}
		// vines creeping up the trunk
		if (config.vine().isPresent()) {
			int r = Mth.ceil(radius) + 2;
			for (int y = 1; y < crownStart; y++) {
				for (Direction dir : Direction.Plane.HORIZONTAL) {
					if (random.nextFloat() < chance * 0.45F) {
						BlockPos p = origin.above(y);
						for (int step = 0; step <= r && tree.hasLog(p); step++) {
							p = p.relative(dir);
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
	}
}
