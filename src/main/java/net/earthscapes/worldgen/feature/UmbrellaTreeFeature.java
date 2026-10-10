package net.earthscapes.worldgen.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
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
 * Umbrella thorn acacia (Vachellia tortilis) and its relatives: a slim trunk that forks into a few
 * spreading limbs which hold up a broad, thin, flat-topped canopy made of overlapping leaf pads.
 * Configured differently it also yields the taller, lacier yellow-barked fever tree and the small
 * wadi acacias of the Sahara.
 */
public class UmbrellaTreeFeature extends Feature<UmbrellaTreeFeature.Config> {
	public record Config(
		BlockStateProvider trunk,
		BlockStateProvider branch,
		BlockStateProvider leaves,
		IntProvider trunkHeight,
		IntProvider crownHeight,
		IntProvider crownRadius,
		IntProvider branches,
		float density,
		int thickness,
		float lean
	) implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			BlockStateProvider.CODEC.fieldOf("trunk").forGetter(Config::trunk),
			BlockStateProvider.CODEC.fieldOf("branch").forGetter(Config::branch),
			BlockStateProvider.CODEC.fieldOf("leaves").forGetter(Config::leaves),
			IntProvider.codec(1, 24).fieldOf("trunk_height").forGetter(Config::trunkHeight),
			IntProvider.codec(1, 16).fieldOf("crown_height").forGetter(Config::crownHeight),
			IntProvider.codec(2, 12).fieldOf("crown_radius").forGetter(Config::crownRadius),
			IntProvider.codec(1, 8).fieldOf("branches").forGetter(Config::branches),
			Codec.floatRange(0.0F, 1.0F).optionalFieldOf("density", 0.85F).forGetter(Config::density),
			Codec.intRange(1, 3).optionalFieldOf("thickness", 2).forGetter(Config::thickness),
			Codec.floatRange(0.0F, 1.0F).optionalFieldOf("lean", 0.2F).forGetter(Config::lean)
		).apply(instance, Config::new));
	}

	public UmbrellaTreeFeature(Codec<Config> codec) {
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
		int trunkHeight = config.trunkHeight().sample(random);
		int crownHeight = config.crownHeight().sample(random);
		int radius = config.crownRadius().sample(random);
		int branchCount = config.branches().sample(random);

		// Trunk, leaning gently in one direction.
		double leanAngle = random.nextDouble() * Math.PI * 2.0;
		double leanStep = random.nextDouble() * config.lean();
		double tx = origin.getX() + 0.5;
		double tz = origin.getZ() + 0.5;
		BlockState trunkState = config.trunk().getState(random, origin);
		Vec3 previous = new Vec3(tx, origin.getY() + 0.5, tz);
		tree.root(origin.below(), trunkState);
		for (int y = 0; y < trunkHeight; y++) {
			Vec3 next = new Vec3(tx, origin.getY() + y + 0.5, tz);
			Geo.line(previous, next, p -> tree.log(p, trunkState));
			previous = next;
			if (y >= 1) {
				tx += Math.cos(leanAngle) * leanStep;
				tz += Math.sin(leanAngle) * leanStep;
			}
		}
		Vec3 fork = previous;
		int canopyY = origin.getY() + trunkHeight + crownHeight;
		double centreX = fork.x + Math.cos(leanAngle) * radius * 0.15;
		double centreZ = fork.z + Math.sin(leanAngle) * radius * 0.15;

		// Limbs: each spreads up and out to a point under the canopy, often forking once more.
		List<double[]> pads = new ArrayList<>();
		double startAngle = random.nextDouble() * Math.PI * 2.0;
		for (int i = 0; i < branchCount; i++) {
			double angle = startAngle + i * Math.PI * 2.0 / branchCount + (random.nextDouble() - 0.5) * 0.9;
			double reach = radius * Geo.range(random, 0.42, 0.68);
			Vec3 base = fork.add(0.0, -random.nextInt(2), 0.0);
			Vec3 tip = new Vec3(centreX + Math.cos(angle) * reach, canopyY - 0.5, centreZ + Math.sin(angle) * reach);
			this.limb(tree, config, random, base, tip, origin);
			pads.add(new double[] {tip.x, tip.z, Geo.range(random, 2.6, 3.8) * (0.75 + radius / 16.0)});
			if (random.nextFloat() < 0.65F) {
				double side = angle + (random.nextBoolean() ? 1.0 : -1.0) * Geo.range(random, 0.45, 0.8);
				double reach2 = reach * Geo.range(random, 0.75, 1.05);
				Vec3 split = base.lerp(tip, Geo.range(random, 0.45, 0.6));
				Vec3 tip2 = new Vec3(centreX + Math.cos(side) * reach2, canopyY - 0.5, centreZ + Math.sin(side) * reach2);
				this.limb(tree, config, random, split, tip2, origin);
				pads.add(new double[] {tip2.x, tip2.z, Geo.range(random, 2.2, 3.4) * (0.75 + radius / 16.0)});
			}
		}
		pads.add(new double[] {centreX, centreZ, radius * 0.72});

		// Canopy: a thin layer of overlapping pads with a ragged outline and a slightly domed top.
		Geo.Noise2 noise = new Geo.Noise2(random, 2.7);
		int extent = radius + 4;
		int cx = Mth.floor(centreX);
		int cz = Mth.floor(centreZ);
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int x = cx - extent; x <= cx + extent; x++) {
			for (int z = cz - extent; z <= cz + extent; z++) {
				double cover = -1.0;
				for (double[] pad : pads) {
					double d = Math.sqrt(Mth.square(x + 0.5 - pad[0]) + Mth.square(z + 0.5 - pad[1])) / pad[2];
					cover = Math.max(cover, 1.0 - d);
				}
				double rim = Math.sqrt(Mth.square(x + 0.5 - centreX) + Mth.square(z + 0.5 - centreZ));
				if (rim > radius + 1.5) {
					continue;
				}
				cover += noise.sample(x, z) * 0.22;
				if (cover <= 0.0) {
					continue;
				}
				if (cover < 0.22 && random.nextFloat() > config.density()) {
					continue;
				}
				tree.leaf(pos.set(x, canopyY, z), config.leaves().getState(random, pos));
				if (config.thickness() >= 2 && cover > 0.3 + random.nextFloat() * 0.08) {
					tree.leaf(pos.set(x, canopyY + 1, z), config.leaves().getState(random, pos));
				}
				if (config.thickness() >= 3 && cover > 0.62) {
					tree.leaf(pos.set(x, canopyY + 2, z), config.leaves().getState(random, pos));
				}
				if (cover > 0.55 && random.nextFloat() < 0.18F) {
					tree.leaf(pos.set(x, canopyY - 1, z), config.leaves().getState(random, pos));
				}
			}
		}
		return tree.place(level) > 0;
	}

	private void limb(TreeBuilder tree, Config config, RandomSource random, Vec3 from, Vec3 to, BlockPos origin) {
		// a gentle outward bow, like the elbowed limbs of real acacias
		Vec3 mid = from.lerp(to, 0.5).add(0.0, Geo.range(random, -0.6, 0.4), 0.0);
		Vec3 bow = mid.add((to.x - from.x) * 0.12, 0.0, (to.z - from.z) * 0.12);
		BlockState branch = config.branch().getState(random, origin);
		Geo.line(from, bow, p -> tree.log(p, Geo.oriented(branch, bow.subtract(from))));
		Geo.line(bow, to, p -> tree.log(p, Geo.oriented(branch, to.subtract(bow))));
		// short twigs fan out just below the canopy, hidden by the leaves
		Vec3 dir = to.subtract(from).multiply(1.0, 0.0, 1.0).normalize();
		int twigs = 1 + random.nextInt(2);
		for (int i = 0; i < twigs; i++) {
			double a = Math.atan2(dir.z, dir.x) + Geo.range(random, -0.9, 0.9);
			double len = Geo.range(random, 1.2, 2.6);
			Vec3 end = to.add(Math.cos(a) * len, 0.0, Math.sin(a) * len);
			Geo.line(to, end, p -> tree.log(p, Geo.oriented(branch, end.subtract(to))));
		}
	}
}
