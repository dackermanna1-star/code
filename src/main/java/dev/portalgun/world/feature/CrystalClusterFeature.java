package dev.portalgun.world.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.Optional;
import net.minecraft.core.Direction;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.util.valueproviders.IntProvider;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.FeatureConfiguration;
import net.minecraft.world.phys.Vec3;

/**
 * {@code portalgun:crystal_cluster} - a spray of crystal spikes radiating from a floor, ceiling or wall, with small
 * cluster blocks budding around its foot.
 */
public class CrystalClusterFeature extends Feature<CrystalClusterFeature.Config> {
	public record Config(BlockState block, Optional<BlockState> small, IntProvider size) implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(i -> i.group(
			BlockState.CODEC.fieldOf("block").forGetter(Config::block),
			BlockState.CODEC.optionalFieldOf("small").forGetter(Config::small),
			IntProvider.CODEC.fieldOf("size").forGetter(Config::size)
		).apply(i, Config::new));
	}

	public CrystalClusterFeature(Codec<Config> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<Config> ctx) {
		try {
			return this.doPlace(ctx);
		} catch (RuntimeException e) {
			FeatureErrors.report("crystal_cluster", e);
			return false;
		}
	}

	private boolean doPlace(FeaturePlaceContext<Config> ctx) {
		Config c = ctx.config();
		Placer p = new Placer(ctx);
		RandomSource rnd = ctx.random();
		int ox = p.origin.getX();
		int oy = p.origin.getY();
		int oz = p.origin.getZ();
		// find what to grow out of: floor first, then ceiling, then walls; search a little below for surface placement
		Direction normal = null;
		int ay = oy;
		for (int k = 0; k < 12 && normal == null; k++) {
			int y = oy - k;
			if (!Placer.isSoft(p.get(ox, y, oz))) {
				continue;
			}
			if (p.isSolid(ox, y - 1, oz)) {
				normal = Direction.UP;
				ay = y;
			} else if (p.isSolid(ox, y + 1, oz)) {
				normal = Direction.DOWN;
				ay = y;
			} else {
				for (Direction d : Direction.Plane.HORIZONTAL) {
					if (p.isSolid(ox - d.getStepX(), y, oz - d.getStepZ())) {
						normal = d;
						ay = y;
						break;
					}
				}
			}
		}
		if (normal == null) {
			return false;
		}
		int size = Math.max(2, Math.min(14, c.size().sample(rnd)));
		Vec3 n = new Vec3(normal.getStepX(), normal.getStepY(), normal.getStepZ());
		if (normal == Direction.UP && p.isFeatureAt(ox, ay - 1, oz)) {
			return false; // not on top of a cap / crown
		}
		if (size >= 4) {
			double half = size * 0.5;
			Vec3 mid = new Vec3(ox + 0.5, ay + 0.5, oz + 0.5).add(n.scale(half + 1.0));
			int skipBelow = normal == Direction.UP ? ay + 1 : p.minY();
			if (p.crowded(mid.x, mid.y, mid.z, half * 0.8, half * 0.8, half * 0.8, skipBelow)) {
				return false;
			}
		}
		Vec3 base = new Vec3(ox + 0.5, ay + 0.5, oz + 0.5).subtract(n.scale(0.8));
		// two perpendicular axes for the spray
		Vec3 u = Math.abs(n.y) > 0.5 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
		Vec3 v = n.cross(u).normalize();
		u = v.cross(n).normalize();
		int spikes = 3 + rnd.nextInt(4) + size / 4;
		double thickBase = size >= 8 ? 1.6 : (size >= 5 ? 1.1 : 0.6);
		for (int i = 0; i < spikes; i++) {
			boolean main = i == 0;
			double len = main ? size : size * (0.35 + rnd.nextDouble() * 0.45);
			double spread = main ? 0.15 : 0.35 + rnd.nextDouble() * 0.55;
			double a = rnd.nextDouble() * Math.PI * 2;
			Vec3 dir = n.add(u.scale(Math.cos(a) * spread)).add(v.scale(Math.sin(a) * spread)).normalize();
			Vec3 tip = base.add(dir.scale(len));
			double r0 = main ? thickBase : Math.max(0.5, thickBase * (0.5 + rnd.nextDouble() * 0.3));
			// two-segment spike: thick shaft then a sharp point
			Vec3 mid = base.add(dir.scale(len * 0.7));
			p.tube(base, mid, r0, r0 * 0.7, c.block(), false);
			p.tube(mid, tip, r0 * 0.7, 0.4, c.block(), false);
		}
		if (c.small().isPresent()) {
			BlockState small = c.small().get();
			int reach = 2 + size / 3;
			int tries = 10 + size * 2;
			for (int i = 0; i < tries; i++) {
				int x = ox + rnd.nextInt(reach * 2 + 1) - reach;
				int y = ay + rnd.nextInt(5) - 2;
				int z = oz + rnd.nextInt(reach * 2 + 1) - reach;
				if (!p.get(x, y, z).isAir()) {
					continue;
				}
				for (Direction d : Direction.values()) {
					// attach to a solid neighbour on the opposite side of the facing
					if (p.isSolid(x - d.getStepX(), y - d.getStepY(), z - d.getStepZ())) {
						BlockState s = small.hasProperty(BlockStateProperties.FACING) ? small.setValue(BlockStateProperties.FACING, d) : small;
						if (p.setDecoration(x, y, z, s)) {
							break;
						}
					}
				}
			}
		}
		return true;
	}

	@SuppressWarnings("unused")
	private static int floor(double d) {
		return Mth.floor(d);
	}
}
