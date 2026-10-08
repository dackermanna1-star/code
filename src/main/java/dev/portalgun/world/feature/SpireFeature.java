package dev.portalgun.world.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.util.valueproviders.IntProvider;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.FeatureConfiguration;
import net.minecraft.world.level.levelgen.feature.stateproviders.BlockStateProvider;

/**
 * {@code portalgun:spire} - a tapered, optionally leaning column: crystal spires, ice spikes, obsidian shards,
 * stalagmites, hoodoos (with a {@code cap}) and stalactites ({@code hanging}). The block provider is sampled per layer
 * band, so weighted mixes read as strata.
 */
public class SpireFeature extends Feature<SpireFeature.Config> {
	public record Config(BlockStateProvider blocks, Optional<BlockState> tip, Optional<BlockState> cap, IntProvider height,
		IntProvider radius, float lean, boolean hanging) implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(i -> i.group(
			BlockStateProvider.CODEC.fieldOf("blocks").forGetter(Config::blocks),
			BlockState.CODEC.optionalFieldOf("tip").forGetter(Config::tip),
			BlockState.CODEC.optionalFieldOf("cap").forGetter(Config::cap),
			IntProvider.CODEC.fieldOf("height").forGetter(Config::height),
			IntProvider.CODEC.fieldOf("radius").forGetter(Config::radius),
			Codec.FLOAT.optionalFieldOf("lean", 0.0F).forGetter(Config::lean),
			Codec.BOOL.optionalFieldOf("hanging", false).forGetter(Config::hanging)
		).apply(i, Config::new));
	}

	public SpireFeature(Codec<Config> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<Config> ctx) {
		try {
			return this.doPlace(ctx);
		} catch (RuntimeException e) {
			FeatureErrors.report("spire", e);
			return false;
		}
	}

	private boolean doPlace(FeaturePlaceContext<Config> ctx) {
		Config c = ctx.config();
		Placer p = new Placer(ctx);
		RandomSource rnd = ctx.random();
		int ox = p.origin.getX();
		int oz = p.origin.getZ();
		boolean hanging = c.hanging();
		int dir = hanging ? -1 : 1;
		int anchor;
		if (hanging) {
			anchor = p.ceilingAbove(ox, p.origin.getY() + 1, oz, 12);
			if (anchor == Integer.MAX_VALUE || p.isFeatureAt(ox, anchor, oz)) {
				return false;
			}
		} else {
			anchor = p.groundBelow(ox, p.origin.getY() - 1, oz, 10);
			if (anchor == Integer.MIN_VALUE || p.isFeatureAt(ox, anchor, oz)) {
				return false;
			}
		}
		int r0 = Math.max(1, Math.min(10, c.radius().sample(rnd)));
		int h = c.height().sample(rnd);
		// keep inside the build height and (for stalactites) above the floor
		if (hanging) {
			int floor = p.groundBelow(ox, anchor - 1, oz, h + 2);
			if (floor != Integer.MIN_VALUE) {
				h = Math.min(h, anchor - floor - 2);
			}
			h = Math.min(h, anchor - p.minY() - 2);
		} else {
			h = Math.min(h, p.maxY() - anchor - 4);
		}
		if (h < 2) {
			return false;
		}
		double leanDist = Math.max(0.0, Math.min(14.0 - r0 * 1.3, Mth.clamp(c.lean(), 0.0F, 1.0F) * h * 0.45));
		// don't drive the spire through another feature (mushroom caps, crowns, arches) or into an overhang
		double midY = anchor + dir * (2 + h * 0.5);
		double reach = r0 * 0.8 + leanDist * 0.5 + 1.0;
		if (p.crowded(ox + 0.5, midY, oz + 0.5, reach, Math.max(2.0, h * 0.5), reach, hanging ? p.minY() : anchor + 2)
			|| p.columnBlocked(ox, hanging ? anchor - h : anchor + 2, hanging ? anchor - 2 : anchor + h, oz)) {
			return false;
		}
		double la = rnd.nextDouble() * Math.PI * 2;
		double lx = Math.cos(la);
		double lz = Math.sin(la);
		Wobble wob = new Wobble(rnd, 3, 0.35);
		int base = anchor + dir; // first layer outside the anchor block
		int bandSize = 1 + rnd.nextInt(3);
		BlockState band = c.blocks().getState(rnd, p.origin);
		double topCx = ox + 0.5;
		double topCz = oz + 0.5;
		int lastLayer = base;
		for (int i = -2; i < h; i++) {
			int y = base + i * dir;
			double t = Math.max(0, i) / (double) h;
			double off = leanDist * t * t;
			double cx = ox + 0.5 + lx * off;
			double cz = oz + 0.5 + lz * off;
			// concave taper with a flared foot
			double rr = r0 * Math.pow(1.0 - t, 0.9) + (t < 0.12 ? (0.12 - t) * r0 * 3.0 : 0.0);
			rr = Math.max(rr, 0.45);
			if (i >= 0 && i % bandSize == 0) {
				band = c.blocks().getState(rnd, p.origin.atY(y));
				bandSize = 1 + rnd.nextInt(3);
			}
			int ri = (int) Math.ceil(rr + 0.5);
			for (int dx = -ri; dx <= ri; dx++) {
				for (int dz = -ri; dz <= ri; dz++) {
					int x = Mth.floor(cx) + dx;
					int z = Mth.floor(cz) + dz;
					double ex = x + 0.5 - cx;
					double ez = z + 0.5 - cz;
					double d = Math.sqrt(ex * ex + ez * ez);
					double edge = rr * (1.0 + 0.18 * wob.at(x, y * 0.5, z));
					if (d <= edge + 0.3) {
						BlockState s = rnd.nextFloat() < 0.12F ? c.blocks().getState(rnd, new BlockPos(x, y, z)) : band;
						if (i < 0) {
							// foot below the anchor: only fill soft gaps so the spire sits flush on slopes
							p.setSoft(x, y, z, s);
						} else {
							p.set(x, y, z, s);
						}
						if (i == 0 && !hanging) {
							p.fillDown(x, y - 1, z, s, 5);
						}
					}
				}
			}
			topCx = cx;
			topCz = cz;
			lastLayer = y;
		}
		int tx = Mth.floor(topCx);
		int tz = Mth.floor(topCz);
		if (c.cap().isPresent()) {
			BlockState cap = c.cap().get();
			double cr = Math.max(1.5, r0 * 1.6);
			int y = lastLayer + dir;
			int ci = (int) Math.ceil(cr);
			for (int dx = -ci; dx <= ci; dx++) {
				for (int dz = -ci; dz <= ci; dz++) {
					double d = Math.sqrt(dx * dx + dz * dz);
					if (d <= cr * (1.0 + 0.12 * wob.at(tx + dx, y, tz + dz))) {
						p.setSoft(tx + dx, y, tz + dz, cap);
						if (d < cr * 0.6) {
							p.setSoft(tx + dx, y + dir, tz + dz, cap);
						}
					}
				}
			}
			// tie the cap to the column
			for (int k = 0; k <= 1; k++) {
				p.setSoft(tx, lastLayer - k * dir, tz, band);
			}
			lastLayer = y + dir;
		}
		if (c.tip().isPresent()) {
			BlockState tip = c.tip().get();
			int y = lastLayer + dir;
			if (tip.hasProperty(BlockStateProperties.FACING)) {
				tip = tip.setValue(BlockStateProperties.FACING, hanging ? Direction.DOWN : Direction.UP);
			}
			if (tip.hasProperty(BlockStateProperties.VERTICAL_DIRECTION)) {
				tip = tip.setValue(BlockStateProperties.VERTICAL_DIRECTION, hanging ? Direction.DOWN : Direction.UP);
			}
			if (GiantPlantFeature.isAttachable(tip)) {
				p.setDecoration(tx, y, tz, tip);
			} else {
				p.setSoft(tx, y, tz, tip);
			}
		}
		return true;
	}
}
