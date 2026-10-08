package dev.portalgun.world.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.Optional;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.util.valueproviders.IntProvider;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.FeatureConfiguration;
import net.minecraft.world.phys.Vec3;

/**
 * {@code portalgun:tree} - tree shapes the vanilla tree feature cannot make: palm, twisted (gnarled multi-branch
 * trunk with leaf puffs) and mushroom_like (dome canopy). Any giant_plant shape name is accepted too.
 */
public class SpecTreeFeature extends Feature<SpecTreeFeature.Config> {
	public record Config(BlockState log, BlockState leaves, Optional<BlockState> decoration, String shape, IntProvider height)
		implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(i -> i.group(
			BlockState.CODEC.fieldOf("log").forGetter(Config::log),
			BlockState.CODEC.fieldOf("leaves").forGetter(Config::leaves),
			BlockState.CODEC.optionalFieldOf("decoration").forGetter(Config::decoration),
			Codec.STRING.optionalFieldOf("shape", "twisted").forGetter(Config::shape),
			IntProvider.CODEC.fieldOf("height").forGetter(Config::height)
		).apply(i, Config::new));
	}

	public SpecTreeFeature(Codec<Config> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<Config> ctx) {
		try {
			Config c = ctx.config();
			Placer p = new Placer(ctx);
			RandomSource rnd = ctx.random();
			int h = Math.max(3, c.height().sample(rnd));
			BlockState deco = c.decoration().orElse(null);
			return switch (c.shape()) {
				case "palm" -> GiantPlantFeature.grow(p, c.log(), c.leaves(), deco, "palm", h, Math.max(3, h / 2), 1, 0.5F);
				case "mushroom_like" -> GiantPlantFeature.grow(p, c.log(), c.leaves(), deco, "dome", h, Math.max(2, (int) (h / 2.2)),
					h >= 12 ? 2 : 1, 0.1F);
				case "twisted" -> twisted(p, c.log(), c.leaves(), deco, h);
				default -> GiantPlantFeature.grow(p, c.log(), c.leaves(), deco, c.shape(), h, Math.max(2, h / 3), 1, 0.2F);
			};
		} catch (RuntimeException e) {
			FeatureErrors.report("tree", e);
			return false;
		}
	}

	private static boolean twisted(Placer p, BlockState log, BlockState leaves, BlockState deco, int height) {
		RandomSource rnd = p.random;
		int ox = p.origin.getX();
		int oz = p.origin.getZ();
		int ground = p.groundBelow(ox, p.origin.getY() - 1, oz, 8);
		if (ground == Integer.MIN_VALUE || !Placer.isSoft(p.get(ox, ground + 1, oz)) || p.isFeatureAt(ox, ground, oz)) {
			return false;
		}
		int h = Math.min(height, p.maxY() - ground - 8);
		if (h < 3) {
			return false;
		}
		if (p.columnBlocked(ox, ground + 2, ground + h / 2, oz) || p.crowded(ox + 0.5, ground + 2 + h * 0.6, oz + 0.5, 5.0, h * 0.45, 5.0, ground + 2)) {
			return false;
		}
		// trunk: a random walk whose heading slowly rotates
		Vec3 pos = new Vec3(ox + 0.5, ground + 0.5, oz + 0.5);
		double heading = rnd.nextDouble() * Math.PI * 2;
		double lean = 0.15 + rnd.nextDouble() * 0.3;
		double trunkR = h >= 12 ? 0.95 : 0.5;
		double split = h * (0.55 + rnd.nextDouble() * 0.2);
		Vec3 prev = pos;
		for (double s = 0.5; s <= split; s += 0.5) {
			heading += (rnd.nextDouble() - 0.5) * 0.5;
			Vec3 dir = new Vec3(Math.cos(heading) * lean, 1.0, Math.sin(heading) * lean).normalize();
			pos = pos.add(dir.scale(0.5));
			pos = clampReach(pos, ox, oz, 6);
			p.tube(prev, pos, trunkR, trunkR, log, false);
			prev = pos;
		}
		p.fillDown(ox, ground, oz, Placer.withAxis(log, net.minecraft.core.Direction.Axis.Y), 3);
		// branches
		int branches = 2 + rnd.nextInt(3);
		double a0 = rnd.nextDouble() * Math.PI * 2;
		for (int i = 0; i < branches; i++) {
			double a = a0 + i * Math.PI * 2 / branches + (rnd.nextDouble() - 0.5) * 0.8;
			double len = (h - split) + 2 + rnd.nextDouble() * 3;
			double rise = 0.5 + rnd.nextDouble() * 0.6;
			Vec3 b = prev;
			Vec3 bp = b;
			for (double s = 0.5; s <= len; s += 0.5) {
				a += (rnd.nextDouble() - 0.5) * 0.25;
				Vec3 dir = new Vec3(Math.cos(a), rise * (1.0 - s / len * 0.6), Math.sin(a)).normalize();
				b = clampReach(b.add(dir.scale(0.5)), ox, oz, 10);
				p.tube(bp, b, 0.5, 0.5, log, false);
				bp = b;
			}
			double lr = 1.6 + rnd.nextDouble() * 1.3;
			HeadShapes.blob(p, b.x, b.y + 0.8, b.z, lr, leaves);
			if (deco != null && rnd.nextBoolean()) {
				int x = Mth.floor(b.x + (rnd.nextDouble() - 0.5) * lr);
				int z = Mth.floor(b.z + (rnd.nextDouble() - 0.5) * lr);
				int y = Mth.floor(b.y + 0.8 - lr);
				if (GiantPlantFeature.isAttachable(deco)) {
					HeadShapes.hang(p, x, y + 1, z, deco);
				} else {
					p.setSoft(x, y, z, deco);
				}
			}
		}
		return true;
	}

	private static Vec3 clampReach(Vec3 v, int ox, int oz, double reach) {
		double dx = Mth.clamp(v.x - (ox + 0.5), -reach, reach);
		double dz = Mth.clamp(v.z - (oz + 0.5), -reach, reach);
		return new Vec3(ox + 0.5 + dx, v.y, oz + 0.5 + dz);
	}
}
