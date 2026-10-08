package dev.portalgun.world.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.util.valueproviders.IntProvider;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.FeatureConfiguration;
import net.minecraft.world.level.levelgen.feature.stateproviders.BlockStateProvider;

/**
 * {@code portalgun:boulder} - a lumpy blob of blocks: rocks and scrap piles half buried in the ground, cloud puffs and
 * floating rocks ({@code floating}), glassy bubbles ({@code hollow}).
 */
public class BoulderFeature extends Feature<BoulderFeature.Config> {
	public record Config(BlockStateProvider blocks, IntProvider radius, boolean hollow, float squash, boolean floating)
		implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(i -> i.group(
			BlockStateProvider.CODEC.fieldOf("blocks").forGetter(Config::blocks),
			IntProvider.CODEC.fieldOf("radius").forGetter(Config::radius),
			Codec.BOOL.optionalFieldOf("hollow", false).forGetter(Config::hollow),
			Codec.FLOAT.optionalFieldOf("squash", 1.0F).forGetter(Config::squash),
			Codec.BOOL.optionalFieldOf("floating", false).forGetter(Config::floating)
		).apply(i, Config::new));
	}

	public BoulderFeature(Codec<Config> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<Config> ctx) {
		try {
			return this.doPlace(ctx);
		} catch (RuntimeException e) {
			FeatureErrors.report("boulder", e);
			return false;
		}
	}

	private boolean doPlace(FeaturePlaceContext<Config> ctx) {
		Config c = ctx.config();
		Placer p = new Placer(ctx);
		RandomSource rnd = ctx.random();
		int ox = p.origin.getX();
		int oz = p.origin.getZ();
		double r = Mth.clamp(c.radius().sample(rnd), 1, 12);
		double rx = r * (0.85 + rnd.nextDouble() * 0.3);
		double rz = r * (0.85 + rnd.nextDouble() * 0.3);
		double ry = Math.max(1.0, r * Mth.clamp(c.squash(), 0.1F, 4.0F));
		double cy;
		if (c.floating()) {
			cy = p.origin.getY() + 0.5;
			if (cy - ry < p.minY() + 1 || cy + ry > p.maxY() - 1) {
				return false;
			}
		} else {
			int ground = p.groundBelow(ox, p.origin.getY() - 1, oz, 10);
			if (ground == Integer.MIN_VALUE || p.isFeatureAt(ox, ground, oz)) {
				return false;
			}
			cy = ground + 1 + ry * 0.35;
		}
		double cx = ox + 0.5;
		double cz = oz + 0.5;
		// only the part above ground must be free (grounded boulders sink into the terrain by design)
		if (p.crowded(cx, cy, cz, rx * 1.1, ry * 1.1, rz * 1.1, c.floating() ? p.minY() : Mth.floor(cy + ry * 0.2))) {
			return false;
		}
		Wobble wob = new Wobble(rnd, 5, 1.6 / Math.max(1.5, r));
		// a few secondary lobes make the silhouette less spherical
		int lobes = r >= 3 ? 1 + rnd.nextInt(3) : 0;
		double[][] lobe = new double[lobes][4];
		for (int i = 0; i < lobes; i++) {
			double a = rnd.nextDouble() * Math.PI * 2;
			double d = r * (0.35 + rnd.nextDouble() * 0.3);
			lobe[i][0] = cx + Math.cos(a) * d;
			lobe[i][1] = cy + (rnd.nextDouble() - 0.3) * ry * 0.5;
			lobe[i][2] = cz + Math.sin(a) * d;
			lobe[i][3] = r * (0.45 + rnd.nextDouble() * 0.25);
		}
		int ex = (int) Math.ceil(Math.max(rx, rz) * 1.25) + 1;
		int ey = (int) Math.ceil(ry * 1.25) + 1;
		int bx = Mth.floor(cx);
		int by = Mth.floor(cy);
		int bz = Mth.floor(cz);
		boolean any = false;
		for (int dx = -ex; dx <= ex; dx++) {
			for (int dz = -ex; dz <= ex; dz++) {
				int lowest = Integer.MAX_VALUE;
				for (int dy = -ey; dy <= ey; dy++) {
					int x = bx + dx;
					int y = by + dy;
					int z = bz + dz;
					double px = x + 0.5;
					double py = y + 0.5;
					double pz = z + 0.5;
					double f = field(px, py, pz, cx, cy, cz, rx, ry, rz, lobe, wob);
					if (f > 1.0) {
						continue;
					}
					if (c.hollow() && f <= 1.0 - 1.3 / Math.max(1.5, r)) {
						if (!p.get(x, y, z).isAir()) {
							p.set(x, y, z, Blocks.AIR.defaultBlockState());
						}
						continue;
					}
					BlockState s = c.blocks().getState(rnd, new net.minecraft.core.BlockPos(x, y, z));
					if (c.floating() ? p.setSoft(x, y, z, s) : p.set(x, y, z, s)) {
						any = true;
						lowest = Math.min(lowest, y);
					}
				}
				if (!c.floating() && !c.hollow() && lowest != Integer.MAX_VALUE) {
					// close gaps under the overhanging bottom on slopes
					BlockState s = c.blocks().getState(rnd, new net.minecraft.core.BlockPos(bx + dx, lowest - 1, bz + dz));
					p.fillDown(bx + dx, lowest - 1, bz + dz, s, 4);
				}
			}
		}
		return any;
	}

	/** Normalised distance: < 1 inside. */
	private static double field(double px, double py, double pz, double cx, double cy, double cz, double rx, double ry, double rz,
		double[][] lobes, Wobble wob) {
		double ax = (px - cx) / rx;
		double ay = (py - cy) / ry;
		double az = (pz - cz) / rz;
		double f = Math.sqrt(ax * ax + ay * ay + az * az);
		for (double[] l : lobes) {
			double lx = (px - l[0]) / l[3];
			double ly = (py - l[1]) / (l[3] * ry / Math.max(rx, 1e-3));
			double lz = (pz - l[2]) / l[3];
			f = Math.min(f, Math.sqrt(lx * lx + ly * ly + lz * lz));
		}
		return f * (1.0 - 0.14 * wob.at(px, py, pz));
	}
}
