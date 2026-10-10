package net.earthscapes.worldgen.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.util.StringRepresentable;
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
 * Palms: a slender, gently curving trunk topped by a rosette of arching fronds. Feather palms
 * (date palm, acai) trace long pinnate fronds that droop under their own weight; fan palms
 * (buriti) end each frond in a broad round fan. Date palms carry hanging fruit bunches.
 */
public class PalmFeature extends Feature<PalmFeature.Config> {
	public enum Style implements StringRepresentable {
		FEATHER("feather"),
		FAN("fan");

		public static final Codec<Style> CODEC = StringRepresentable.fromEnum(Style::values);
		private final String name;

		Style(String name) {
			this.name = name;
		}

		@Override
		public String getSerializedName() {
			return this.name;
		}
	}

	public record Config(
		BlockStateProvider trunk,
		BlockStateProvider fronds,
		IntProvider height,
		FloatProvider curve,
		IntProvider frondCount,
		FloatProvider frondLength,
		float droop,
		Style style,
		Optional<BlockStateProvider> fruit,
		float fruitChance,
		int floodDepth
	) implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			BlockStateProvider.CODEC.fieldOf("trunk").forGetter(Config::trunk),
			BlockStateProvider.CODEC.fieldOf("fronds").forGetter(Config::fronds),
			IntProvider.codec(2, 40).fieldOf("height").forGetter(Config::height),
			FloatProvider.codec(0.0F, 1.0F).fieldOf("curve").forGetter(Config::curve),
			IntProvider.codec(3, 24).fieldOf("frond_count").forGetter(Config::frondCount),
			FloatProvider.codec(1.0F, 7.0F).fieldOf("frond_length").forGetter(Config::frondLength),
			Codec.floatRange(0.0F, 1.0F).optionalFieldOf("droop", 0.18F).forGetter(Config::droop),
			Style.CODEC.optionalFieldOf("style", Style.FEATHER).forGetter(Config::style),
			BlockStateProvider.CODEC.optionalFieldOf("fruit").forGetter(Config::fruit),
			Codec.floatRange(0.0F, 1.0F).optionalFieldOf("fruit_chance", 0.0F).forGetter(Config::fruitChance),
			Codec.intRange(0, 6).optionalFieldOf("flood_depth", 0).forGetter(Config::floodDepth)
		).apply(instance, Config::new));
	}

	public PalmFeature(Codec<Config> codec) {
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
		double curve = config.curve().sample(random);
		double lean = random.nextDouble() * Math.PI * 2.0;
		BlockState trunk = Geo.axis(config.trunk().getState(random, origin), Direction.Axis.Y);

		Vec3 previous = new Vec3(origin.getX() + 0.5, origin.getY() + 0.5, origin.getZ() + 0.5);
		tree.root(origin.below(), trunk);
		for (int i = 0; i <= height; i++) {
			double t = (double) i / height;
			double offset = curve * height * 0.32 * t * t;
			Vec3 next = new Vec3(origin.getX() + 0.5 + Math.cos(lean) * offset, origin.getY() + i + 0.5, origin.getZ() + 0.5 + Math.sin(lean) * offset);
			Geo.line(previous, next, p -> tree.log(p, trunk));
			previous = next;
		}
		Vec3 top = previous;
		BlockPos topPos = BlockPos.containing(top);

		// crown shaft and spear
		BlockState heart = config.fronds().getState(random, topPos);
		tree.leaf(topPos.above(), heart);
		if (random.nextBoolean()) {
			tree.leaf(topPos.above(2), heart);
		}

		int fronds = config.frondCount().sample(random);
		double start = random.nextDouble() * Math.PI * 2.0;
		for (int i = 0; i < fronds; i++) {
			double azimuth = start + i * Math.PI * 2.0 / fronds + (random.nextDouble() - 0.5) * 0.5;
			boolean upright = i % 3 == 0;
			double elevation = upright ? Geo.range(random, 0.55, 1.0) : Geo.range(random, -0.05, 0.4);
			double length = config.frondLength().sample(random) * (upright ? 0.75 : 1.0);
			this.frond(tree, config, random, top.add(0.0, 0.5, 0.0), azimuth, elevation, length);
		}

		if (config.fruit().isPresent() && random.nextFloat() < config.fruitChance()) {
			int bunches = 1 + random.nextInt(3);
			for (int i = 0; i < bunches; i++) {
				Direction dir = Direction.Plane.HORIZONTAL.getRandomDirection(random);
				BlockPos fruitPos = topPos.relative(dir);
				tree.decoration(fruitPos, config.fruit().get().getState(random, fruitPos));
			}
		}
		return tree.place(level) > 0;
	}

	private void frond(TreeBuilder tree, Config config, RandomSource random, Vec3 base, double azimuth, double elevation, double length) {
		double cosE = Math.cos(elevation);
		Vec3 dir = new Vec3(Math.cos(azimuth) * cosE, Math.sin(elevation), Math.sin(azimuth) * cosE);
		Vec3 side = new Vec3(-Math.sin(azimuth), 0.0, Math.cos(azimuth));
		double droop = config.droop();
		Vec3 previous = base;
		Vec3 tip = base;
		BlockState frond = config.fronds().getState(random, BlockPos.containing(base));
		for (double s = 0.5; s <= length; s += 0.5) {
			Vec3 point = base.add(dir.scale(s)).add(0.0, -droop * s * s, 0.0);
			Vec3 from = previous;
			Geo.line(from, point, p -> tree.leaf(p, frond));
			if (config.style() == Style.FEATHER && s >= 1.5 && s <= length - 0.5 && random.nextFloat() < 0.35F) {
				Vec3 leaflet = point.add(side.scale(random.nextBoolean() ? 1.0 : -1.0)).add(0.0, -0.4, 0.0);
				tree.leaf(BlockPos.containing(leaflet), frond);
			}
			previous = point;
			tip = point;
		}
		if (config.style() == Style.FAN) {
			BlockPos t = BlockPos.containing(tip);
			for (int a = -1; a <= 1; a++) {
				for (int b = -1; b <= 1; b++) {
					if (Math.abs(a) + Math.abs(b) <= 1 || random.nextFloat() < 0.4F) {
						BlockPos p = t.offset(Mth.floor(side.x * a + 0.5), b, Mth.floor(side.z * a + 0.5));
						tree.leaf(p, frond);
					}
				}
			}
		}
	}
}
