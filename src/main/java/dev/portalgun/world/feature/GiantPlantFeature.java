package dev.portalgun.world.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.Optional;
import net.minecraft.core.Direction;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.util.valueproviders.IntProvider;
import net.minecraft.world.level.block.AmethystClusterBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.FeatureConfiguration;
import net.minecraft.world.phys.Vec3;

/**
 * {@code portalgun:giant_plant} - a stem with a big head: giant mushrooms (dome/umbrella/flat), lollipops (sphere),
 * candy trees (cone), giant flowers (flower), cauliflower/cotton puffs (puff), palms (palm) and grass/fern tufts (tuft).
 */
public class GiantPlantFeature extends Feature<GiantPlantFeature.Config> {
	public record Config(BlockState stem, BlockState head, Optional<BlockState> decoration, String shape, IntProvider height,
		IntProvider radius, int stemWidth, float bend) implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(i -> i.group(
			BlockState.CODEC.fieldOf("stem").forGetter(Config::stem),
			BlockState.CODEC.fieldOf("head").forGetter(Config::head),
			BlockState.CODEC.optionalFieldOf("decoration").forGetter(Config::decoration),
			Codec.STRING.optionalFieldOf("shape", "dome").forGetter(Config::shape),
			IntProvider.CODEC.fieldOf("height").forGetter(Config::height),
			IntProvider.CODEC.fieldOf("radius").forGetter(Config::radius),
			Codec.INT.optionalFieldOf("stem_width", 1).forGetter(Config::stemWidth),
			Codec.FLOAT.optionalFieldOf("bend", 0.0F).forGetter(Config::bend)
		).apply(i, Config::new));
	}

	public GiantPlantFeature(Codec<Config> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<Config> ctx) {
		try {
			Config c = ctx.config();
			Placer p = new Placer(ctx);
			RandomSource rnd = ctx.random();
			return grow(p, c.stem(), c.head(), c.decoration().orElse(null), c.shape(), c.height().sample(rnd), c.radius().sample(rnd),
				c.stemWidth(), c.bend());
		} catch (RuntimeException e) {
			FeatureErrors.report("giant_plant", e);
			return false;
		}
	}

	static double extentFactor(String shape) {
		return switch (shape) {
			case "sphere" -> 1.15;
			case "puff" -> 1.5;
			case "palm" -> 1.35;
			case "tuft" -> 1.9;
			default -> 1.1;
		};
	}

	/** Shared by giant_plant and tree. */
	static boolean grow(Placer p, BlockState stem, BlockState head, BlockState decoration, String shape, int height, int radius, int stemWidth,
		float bend) {
		int ox = p.origin.getX();
		int oz = p.origin.getZ();
		int ground = p.groundBelow(ox, p.origin.getY() - 1, oz, 8);
		if (ground == Integer.MIN_VALUE) {
			return false;
		}
		int baseY = ground + 1;
		if (p.isLava(ox, baseY, oz)) {
			return false;
		}
		RandomSource rnd = p.random;
		bend = Mth.clamp(bend, 0.0F, 1.0F);
		if ("palm".equals(shape)) {
			bend = Math.max(bend, 0.4F);
		}
		double maxBend = Math.min(height * 0.4, 6.0) * bend;
		int r = Math.max(1, radius);
		double factor = extentFactor(shape);
		r = (int) Math.max(1, Math.min(r, Math.floor((14.0 - maxBend) / factor)));
		int headTop = (int) Math.ceil(r * ("cone".equals(shape) ? 1.8 : ("puff".equals(shape) || "sphere".equals(shape) ? 2.0 : 1.2))) + 2;
		int h = Math.max(2, Math.min(height, p.maxY() - baseY - headTop));
		if (h < 2) {
			return false;
		}
		// make sure the trunk has room to start
		if (!Placer.isSoft(p.get(ox, baseY, oz)) || !Placer.isSoft(p.get(ox, baseY + 1, oz))) {
			return false;
		}

		double ang = rnd.nextDouble() * Math.PI * 2;
		double bx = Math.cos(ang);
		double bz = Math.sin(ang);
		int prevX = ox;
		int prevZ = oz;
		int topX = ox;
		int topZ = oz;
		int w = Mth.clamp(stemWidth, 1, 3);
		BlockState stemY = Placer.withAxis(stem, Direction.Axis.Y);
		for (int y = 0; y < h; y++) {
			double t = (double) y / h;
			double off = maxBend * Math.pow(t, "palm".equals(shape) ? 1.6 : 2.0);
			int sx = ox + (int) Math.round(bx * off);
			int sz = oz + (int) Math.round(bz * off);
			if (sx != prevX || sz != prevZ) {
				// keep the stem face-connected when it steps sideways
				stemSlice(p, prevX, baseY + y - 1, sz, w, stemY, y);
				stemSlice(p, sx, baseY + y - 1, sz, w, stemY, y);
			}
			stemSlice(p, sx, baseY + y, sz, w, stemY, y);
			prevX = sx;
			prevZ = sz;
			topX = sx;
			topZ = sz;
		}
		// roots: anchor the stem into the ground and flare thick trunks
		for (int dx = 0; dx < (w == 2 ? 2 : 1); dx++) {
			for (int dz = 0; dz < (w == 2 ? 2 : 1); dz++) {
				p.fillDown(ox + dx, baseY - 1, oz + dz, stemY, 4);
			}
		}
		if (w >= 2 || h >= 12) {
			int roots = 3 + rnd.nextInt(3);
			for (int i = 0; i < roots; i++) {
				double ra = rnd.nextDouble() * Math.PI * 2;
				double len = 1.5 + rnd.nextDouble() * (w + 1);
				int rx = ox + (int) Math.round(Math.cos(ra) * len);
				int rz = oz + (int) Math.round(Math.sin(ra) * len);
				int ry = baseY + rnd.nextInt(2);
				p.tube(new Vec3(ox + 0.5, baseY + 1.5, oz + 0.5), new Vec3(rx + 0.5, ry + 0.5, rz + 0.5), 0.5, 0.5, stem, false);
				p.fillDown(rx, ry - 1, rz, stemY, 3);
			}
		}
		double cx = topX + (w == 2 ? 1.0 : 0.5);
		double cz = topZ + (w == 2 ? 1.0 : 0.5);
		int cy = baseY + h;
		HeadShapes.build(p, shape, cx, cy, cz, r, stem, head, decoration);
		return true;
	}

	private static void stemSlice(Placer p, int x, int y, int z, int w, BlockState stem, int level) {
		switch (w) {
			case 2 -> {
				p.setSoft(x, y, z, stem);
				p.setSoft(x + 1, y, z, stem);
				p.setSoft(x, y, z + 1, stem);
				p.setSoft(x + 1, y, z + 1, stem);
			}
			case 3 -> {
				p.setSoft(x, y, z, stem);
				p.setSoft(x + 1, y, z, stem);
				p.setSoft(x - 1, y, z, stem);
				p.setSoft(x, y, z + 1, stem);
				p.setSoft(x, y, z - 1, stem);
				if (level < 2) {
					p.setSoft(x + 1, y, z + 1, stem);
					p.setSoft(x - 1, y, z + 1, stem);
					p.setSoft(x + 1, y, z - 1, stem);
					p.setSoft(x - 1, y, z - 1, stem);
				}
			}
			default -> p.setSoft(x, y, z, stem);
		}
	}

	/** Decorations that are not full blocks hang under / sit on the head instead of being mixed into it. */
	static boolean isAttachable(BlockState s) {
		return s != null && (!s.blocksMotion() || s.getBlock() instanceof AmethystClusterBlock);
	}
}
